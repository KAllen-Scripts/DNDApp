/**
 * HTTP API. Clients only display what these endpoints return and send what
 * players type; all processing happens on this server.
 */
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';
import { formatTimestamp, parseTimestamp, parseTranscript, formatUtterance } from '@dndapp/shared';
import { AuthError } from './auth.js';
import { NotFoundError, BadRequestError, sessionDateFor } from './store.js';
import { ArchiveConflictError } from './archive.js';
import { SpendingCapError } from './llm/index.js';
import { RateLimitError } from './qa/agent.js';
import { preparedTranscript } from './pipeline/prepare.js';
import { SheetConflictError } from './sheets/store.js';
import { SHEET_FORMAT, computeSheet } from '@dndapp/shared/sheet.js';
import { parseRoll, rollDice, ROLL_MODES } from '@dndapp/shared/dice.js';
import { TOKEN_KINDS, TOKEN_SIZES, UNITS, SCALE_PER, MAX_TOKENS, MAX_FOG_SHAPES, FOG_OPS, CONDITIONS, PERSON_KIND, MAX_PINS, MAX_WALLS, WALL_KINDS, FOG_MAP, TEMPLATE_SHAPES, MAX_TEMPLATES, MAX_LIGHTS, MAX_TERRAIN, MAX_VARIANTS, MAX_LINKS, nearLink, pathCost, snapToken, wallBetween, doorReach, distanceToWall, dexModifier, stepTurn, canSee, squarePx } from '@dndapp/shared/map.js';
import { inspectImage } from './maps/read.js';
import { isPdf, renderPdfPage } from './maps/pdf.js';
import { createPlayerImages } from './maps/image.js';
import { newTokenId, isMapId } from './maps/store.js';
import { PICTURE_KINDS, MAX_PICTURE_BYTES, inspectPicture } from './characters/pictures.js';
import { canSeeHandout, MAX_HANDOUT_TEXT } from './handouts.js';
import { CREATURE_KINDS, MAX_CREATURE_NOTES, tokenNames } from './creatures.js';

/**
 * Open a Server-Sent Events stream on a request. `stillAllowed`, if given, is
 * checked with every keep-alive; the stream ends once it returns false (the
 * login ended, or the account was blocked or left the campaign).
 */
function openSse(request, reply, { stillAllowed } = {}) {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  });
  // Send the headers now, so the page knows the stream is open before the first event.
  reply.raw.flushHeaders();
  let closed = false;
  const onClose = [];
  const end = () => {
    clearInterval(keepAlive);
    if (closed) return;
    closed = true;
    reply.raw.end();
  };
  const keepAlive = setInterval(() => {
    if (stillAllowed && !stillAllowed()) return end();
    if (!closed) reply.raw.write(': ping\n\n');
  }, 20_000);
  // The response's 'close' fires when the client disconnects. (The request's
  // 'close' fires as soon as the body has been read, so it can't be used here.)
  reply.raw.on('close', () => {
    closed = true;
    clearInterval(keepAlive);
    onClose.forEach((f) => f());
  });
  return {
    send(event, data) {
      if (!closed) reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end,
    onClose: (f) => onClose.push(f),
  };
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp',
};

/**
 * Serve the web page's files (no build step). Each file gets its own public
 * route, so nothing outside the folder can be requested; "/" is index.html.
 */
function serveWebPage(app, dir) {
  if (!dir || !fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, name);
    const type = CONTENT_TYPES[path.extname(file)];
    if (!type || !fs.statSync(file).isFile()) continue;
    const url = '/' + name.split(path.sep).join('/');
    const send = async (request, reply) =>
      reply.type(type).header('Cache-Control', 'no-cache').header('X-Content-Type-Options', 'nosniff').send(fs.readFileSync(file));
    app.get(url, { config: { public: true } }, send);
    if (url === '/index.html') app.get('/', { config: { public: true } }, send);
  }
  // Modules the page imports from packages: the character sheet rules (shared with the server, so the page can
  // show automatic values as players type), dice notation, map geometry (snapping and measuring while dragging), markdown + HTML sanitising for answers, and the 3D
  // dice (Three.js and the physics are bundled into that one file).
  const modules = {
    '/shared/sheet.js': '@dndapp/shared/sheet.js',
    '/shared/dice.js': '@dndapp/shared/dice.js',
    '/shared/map.js': '@dndapp/shared/map.js',
    '/vendor/marked.js': 'marked',
    '/vendor/purify.js': 'dompurify',
    '/vendor/dice/dice-box.js': '@3d-dice/dice-box-threejs',
  };
  const sendFile = (file, type) => async (request, reply) =>
    reply.type(type).header('Cache-Control', 'no-cache').header('X-Content-Type-Options', 'nosniff').send(fs.readFileSync(file));
  // Library files don't change while the server runs: each is compressed once (brotli or gzip, a few
  // MB of 3D dice libraries become a fraction of that) and has an ETag, so a browser that has it gets
  // "304 Not Modified" instead of downloading it again.
  const sendLibrary = (file) => {
    let cached = null;
    return async (request, reply) => {
      cached ??= (() => {
        const body = fs.readFileSync(file);
        return { body, etag: `"${crypto.createHash('sha1').update(body).digest('base64url')}"`, br: null, gzip: null };
      })();
      reply.type(CONTENT_TYPES['.js']).header('Cache-Control', 'no-cache').header('X-Content-Type-Options', 'nosniff').header('ETag', cached.etag).header('Vary', 'Accept-Encoding');
      if (request.headers['if-none-match'] === cached.etag) return reply.code(304).send();
      const accepts = String(request.headers['accept-encoding'] ?? '');
      if (/\bbr\b/.test(accepts)) {
        cached.br ??= zlib.brotliCompressSync(cached.body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } });
        return reply.header('Content-Encoding', 'br').send(cached.br);
      }
      if (/\bgzip\b/.test(accepts)) {
        cached.gzip ??= zlib.gzipSync(cached.body, { level: 9 });
        return reply.header('Content-Encoding', 'gzip').send(cached.gzip);
      }
      return reply.send(cached.body);
    };
  };
  for (const [url, spec] of Object.entries(modules)) {
    app.get(url, { config: { public: true } }, sendLibrary(fileURLToPath(import.meta.resolve(spec))));
  }
  // The Deluxe dice (dice-deluxe.js): Three.js (its module imports three.core.js next to it) and the
  // cannon-es physics, both as ES modules. Loaded only when someone uses that roller.
  for (const [url, file] of Object.entries(VENDOR_FILES)) {
    app.get(url, { config: { public: true } }, sendLibrary(file()));
  }
  // The dice's sounds and textures, from the same package (dice-box.js asks for /vendor/dice/sounds/... and
  // /vendor/dice/textures/...; a texture is only fetched when a dice style uses it).
  const assets = path.resolve(path.dirname(fileURLToPath(import.meta.resolve('@3d-dice/dice-box-threejs'))), '../public');
  for (const folder of ['sounds', 'textures']) {
    const dir = path.join(assets, folder);
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }) : []) {
      const type = { '.mp3': CONTENT_TYPES['.mp3'], '.webp': CONTENT_TYPES['.webp'], '.png': CONTENT_TYPES['.png'] }[path.extname(name)];
      if (!type) continue;
      app.get(`/vendor/dice/${folder}/${name.split(path.sep).join('/')}`, { config: { public: true } }, sendFile(path.join(dir, name), type));
    }
  }
}

const threeDir = () => path.dirname(fileURLToPath(import.meta.resolve('three')));
/** Files served from packages whose ES modules aren't what import.meta.resolve finds (see serveWebPage). */
export const VENDOR_FILES = {
  '/vendor/three/three.module.js': () => path.join(threeDir(), 'three.module.js'),
  '/vendor/three/three.core.js': () => path.join(threeDir(), 'three.core.js'),
  '/vendor/cannon-es.js': () => path.join(path.dirname(fileURLToPath(import.meta.resolve('cannon-es'))), 'cannon-es.js'),
};

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-03');

/** Requests other than uploads are small; this keeps anyone from sending the server huge bodies. */
const SMALL_BODY = 1024 * 1024;

/**
 * Sent with every response. The page only loads its own files (no inline
 * scripts, nothing from other sites), can't be framed by another site, and
 * doesn't leak its address to links.
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    // The page sets styles from script (theme colours, positions on the map).
    "style-src 'self' 'unsafe-inline'",
    // Pictures behind the login are fetched with the token and shown as blob: URLs.
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

const SERVER_ERROR = 'Something went wrong on the server. The details are in its log.';

/**
 * What a person may be told about an unexpected error. File-system and
 * database errors and programming mistakes can show folder names on the host's
 * machine or how the server works, so they get a general message (the log has
 * the details); errors from the AI explain themselves and are passed on.
 */
export function publicMessage(err) {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (/^E[A-Z]+$/.test(code) || code.startsWith('SQLITE') || err?.path || err?.syscall) return SERVER_ERROR;
  if (err instanceof TypeError || err instanceof ReferenceError || err instanceof RangeError || err instanceof SyntaxError) return SERVER_ERROR;
  return String(err?.message ?? err ?? SERVER_ERROR);
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * Start-up warnings about how the server is reachable. Logins and passwords
 * are only safe across the internet over https, which a tunnel or reverse
 * proxy in front of this server provides.
 */
export function exposureWarnings({ host, publicUrl }) {
  const warnings = [];
  if (!LOOPBACK.has(host)) {
    warnings.push(
      `HOST is ${host}, so other machines can reach this server directly over plain http, where passwords and logins can be read in transit. ` +
        'Keep HOST=127.0.0.1 and let players in through an https tunnel or reverse proxy (see README, "Letting players in safely").',
    );
  }
  if (publicUrl && !publicUrl.startsWith('https://')) {
    warnings.push(`PUBLIC_URL (${publicUrl}) isn't https. Players' passwords would cross the internet unencrypted.`);
  }
  return warnings;
}

const trustProxySetting = (v) => (v === 'true' ? true : v === 'false' || v === 'off' || v === '' ? false : v);

export function buildApp({ db, store, auth, jobs, pipeline, qa, kb, search, sheets, sheetImport, spells, maps, mapReader, statBlocks, creatureFinder, pictures, pictureDescriber, handouts, creatures, archive, config, logger = true }) {
  const app = Fastify({
    logger,
    bodyLimit: SMALL_BODY,
    // Believe X-Forwarded-For only from a proxy on this machine (a tunnel), so request.ip is the player's address.
    trustProxy: trustProxySetting(config.trustProxy ?? 'loopback'),
    // Give up on requests that take this long to arrive (slow uploads still have plenty of time).
    requestTimeout: 10 * 60 * 1000,
  });
  // Upload routes accept bigger bodies than everything else.
  const upload = { bodyLimit: config.maxUploadBytes };

  app.addHook('onSend', async (request, reply) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!reply.hasHeader(k)) reply.header(k, v);
    if (config.publicUrl?.startsWith('https://')) reply.header('Strict-Transport-Security', 'max-age=31536000');
  });

  app.setErrorHandler((err, request, reply) => {
    // Saving a sheet that changed elsewhere: send the current one so the page can reload it.
    if (err instanceof SheetConflictError) return reply.status(409).send({ error: err.message, current: err.current });
    const status =
      err instanceof AuthError ? err.status
      : err instanceof NotFoundError ? 404
      : err instanceof BadRequestError ? 400
      : err instanceof ArchiveConflictError ? 409
      : err instanceof RateLimitError ? 429
      : err instanceof SpendingCapError ? 503
      : err instanceof ZodError ? 400
      : (err.statusCode ?? 500);
    if (status >= 500) request.log.error(err);
    const message =
      err instanceof ZodError ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : status >= 500 ? publicMessage(err)
      : err.message;
    reply.status(status).send({ error: message });
  });

  // ---------- auth ----------

  app.decorateRequest('user', null);
  // While someone must change their password, their login can do nothing else.
  const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/me', '/logout', '/account/password']);

  app.addHook('onRequest', async (request) => {
    if (request.routeOptions.config?.public) return;
    request.user = auth.authenticate(request.headers.authorization);
    if (request.user.must_change_password && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(request.routeOptions.url)) {
      throw new AuthError('You need to choose a new password before you can continue.', 403);
    }
  });

  function requireAdmin(request) {
    if (!request.user.is_admin) throw new AuthError('Only the admin can do that', 403);
  }

  /** Load campaign + check membership. */
  function access(request, { dm = false } = {}) {
    const cid = Number(request.params.cid);
    const campaign = store.getCampaign(cid);
    const membership = auth.membership(cid, request.user.id);
    if (!membership && !request.user.is_admin) throw new AuthError('Not a member of this campaign', 403);
    const role = membership?.role ?? 'dm'; // admins act as DM
    if (dm && role !== 'dm') throw new AuthError('Only the DM can do that', 403);
    return { campaign, role, cid, membership, userId: request.user.id };
  }

  // Live streams open per account, so one login can't tie up the server with thousands.
  const openStreams = new Map();

  /**
   * Open a live stream for someone in a campaign (after access() said yes).
   * current() is their access as it is now, or null: streams check it with
   * every update, so they end when the login ends or the account is blocked or
   * leaves the campaign, and a DM who becomes a player gets what players get.
   */
  function openLiveStream(request, reply, a) {
    const uid = request.user.id;
    const max = config.maxStreamsPerUser ?? 20;
    if ((openStreams.get(uid) ?? 0) >= max) throw new RateLimitError('Too many live connections are open for your login. Close some tabs, then reload.');
    const header = request.headers.authorization;
    const current = () => {
      const user = auth.check(header);
      if (!user || user.must_change_password) return null;
      const membership = auth.membership(a.cid, uid);
      if (!membership && !user.is_admin) return null;
      return { ...a, membership, role: membership?.role ?? 'dm' };
    };
    const sse = openSse(request, reply, { stillAllowed: () => !!current() });
    openStreams.set(uid, (openStreams.get(uid) ?? 0) + 1);
    sse.onClose(() => {
      const n = (openStreams.get(uid) ?? 1) - 1;
      if (n > 0) openStreams.set(uid, n);
      else openStreams.delete(uid);
    });
    return { sse, current };
  }

  // Processing errors can carry details of the host's machine; players only learn that something failed.
  const forViewer = (role, item) => (role === 'dm' || !item.error ? item : { ...item, error: 'Processing failed.' });

  const attended = (sessionId, userId) =>
    !!db.prepare('SELECT 1 FROM attendance WHERE session_id = ? AND user_id = ?').get(sessionId, userId) ||
    !db.prepare('SELECT 1 FROM attendance WHERE session_id = ?').get(sessionId);

  // ---------- general ----------

  app.get('/health', { config: { public: true } }, async () => ({ ok: true }));

  /** Log in with the name and password the admin set. Returns a token for the Authorization header. */
  app.post('/login', { config: { public: true }, bodyLimit: 16 * 1024 }, async (request) => {
    const { name, password } = z.object({ name: z.string().min(1).max(100), password: z.string().min(1).max(200) }).parse(request.body);
    return auth.login(name, password, request.ip);
  });

  app.post('/logout', { config: { public: true }, bodyLimit: 16 * 1024 }, async (request) => {
    auth.logout(request.headers.authorization);
    return { ok: true };
  });

  /** Change your own password: { current_password, new_password }. Other devices are logged out. */
  app.post('/account/password', async (request) => {
    const body = z.object({ current_password: z.string().max(200), new_password: z.string().max(200) }).parse(request.body);
    await auth.changeOwnPassword(request.user.id, request.headers.authorization, body.current_password, body.new_password);
    return { ok: true };
  });

  app.get('/me', async (request) => ({
    user: request.user,
    dice: { roller: config.dice?.roller ?? 'quick' },
    campaigns: db
      .prepare(
        `SELECT c.id, c.name, m.role, m.character_name FROM memberships m JOIN campaigns c ON c.id = m.campaign_id
         WHERE m.user_id = ? ORDER BY c.name`,
      )
      .all(request.user.id),
  }));

  app.get('/campaigns/:cid', async (request) => {
    const { campaign, role, membership } = access(request);
    return { campaign, role, character_name: membership?.character_name ?? null };
  });

  // ---------- admin (accounts, campaigns, who's in which campaign) ----------
  // The admin login is for managing the server. To play, the admin makes
  // themselves a separate player account like anyone else's.

  const userId = (request) => {
    const uid = Number(request.params.uid);
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)) throw new NotFoundError('No such account');
    return uid;
  };
  const notSelf = (request, uid, what) => {
    if (uid === request.user.id) throw new BadRequestError(`You can't ${what} your own admin account`);
  };

  app.get('/admin/users', async (request) => {
    requireAdmin(request);
    const memberships = db
      .prepare('SELECT m.user_id, m.campaign_id, c.name AS campaign, m.role, m.character_name FROM memberships m JOIN campaigns c ON c.id = m.campaign_id ORDER BY c.name')
      .all();
    return db
      .prepare(
        `SELECT u.id, u.name, u.is_admin, u.revoked_at, u.created_at, u.password_hash IS NOT NULL AS has_password, u.must_change_password,
           (SELECT COUNT(*) FROM logins l WHERE l.user_id = u.id) AS logins,
           (SELECT MAX(last_used_at) FROM logins l WHERE l.user_id = u.id) AS last_seen
         FROM users u ORDER BY u.is_admin DESC, u.name COLLATE NOCASE`,
      )
      .all()
      .map((u) => ({ ...u, has_password: !!u.has_password, campaigns: memberships.filter((m) => m.user_id === u.id) }));
  });

  const CAMPAIGN_ACCESS = z
    .array(
      z.object({
        campaign_id: z.number().int(),
        role: z.enum(['dm', 'player']).default('player'),
        character_name: z.string().trim().max(100).nullish(),
      }),
    )
    .refine((list) => new Set(list.map((m) => m.campaign_id)).size === list.length, 'each campaign may only be listed once');

  const checkCampaigns = (list) => list.forEach((m) => store.getCampaign(m.campaign_id));

  /** Create an account, optionally with the campaigns it can access. */
  app.post('/admin/users', async (request, reply) => {
    requireAdmin(request);
    const { name, password, campaigns, must_change_password } = z
      .object({
        name: z.string().trim().min(1).max(100),
        password: z.string().max(200),
        campaigns: CAMPAIGN_ACCESS.default([]),
        must_change_password: z.boolean().default(false),
      })
      .parse(request.body);
    checkCampaigns(campaigns);
    const user = await auth.createUser(name, { password, mustChange: must_change_password });
    auth.setCampaigns(user.id, campaigns);
    reply.status(201);
    return user;
  });

  /** Set exactly which campaigns an account can access (and its role/character in each). */
  app.put('/admin/users/:uid/campaigns', async (request) => {
    requireAdmin(request);
    const uid = userId(request);
    if (db.prepare('SELECT is_admin FROM users WHERE id = ?').get(uid).is_admin) {
      throw new BadRequestError("The admin login isn't in campaigns. Make a separate player account to play.");
    }
    const { campaigns } = z.object({ campaigns: CAMPAIGN_ACCESS }).parse(request.body);
    checkCampaigns(campaigns);
    auth.setCampaigns(uid, campaigns);
    return db.prepare('SELECT campaign_id, role, character_name FROM memberships WHERE user_id = ? ORDER BY campaign_id').all(uid);
  });

  /** Set a password. Logs the account out everywhere and unblocks it. */
  app.put('/admin/users/:uid/password', async (request) => {
    requireAdmin(request);
    const { password, must_change_password } = z
      .object({ password: z.string().max(200), must_change_password: z.boolean().default(false) })
      .parse(request.body);
    await auth.setPassword(userId(request), password, { mustChange: must_change_password });
    return { ok: true };
  });

  /** Turn "must change password at next login" on or off. */
  app.put('/admin/users/:uid/must-change-password', async (request) => {
    requireAdmin(request);
    const { must_change_password } = z.object({ must_change_password: z.boolean() }).parse(request.body);
    auth.setMustChange(userId(request), must_change_password);
    return { ok: true };
  });

  app.post('/admin/users/:uid/logout', async (request) => {
    requireAdmin(request);
    auth.logoutEverywhere(userId(request));
    return { ok: true };
  });

  app.post('/admin/users/:uid/block', async (request) => {
    requireAdmin(request);
    const uid = userId(request);
    notSelf(request, uid, 'block');
    auth.revoke(uid);
    return { ok: true };
  });

  app.post('/admin/users/:uid/unblock', async (request) => {
    requireAdmin(request);
    auth.unblock(userId(request));
    return { ok: true };
  });

  app.delete('/admin/users/:uid', async (request) => {
    requireAdmin(request);
    const uid = userId(request);
    notSelf(request, uid, 'delete');
    auth.deleteUser(uid);
    return { ok: true };
  });

  app.get('/admin/campaigns', async (request) => {
    requireAdmin(request);
    const members = db
      .prepare(
        `SELECT m.campaign_id, u.id AS user_id, u.name, u.revoked_at, m.role, m.character_name
         FROM memberships m JOIN users u ON u.id = m.user_id ORDER BY m.role, u.name COLLATE NOCASE`,
      )
      .all();
    return db
      .prepare('SELECT c.id, c.name, c.created_at, (SELECT COUNT(*) FROM sessions s WHERE s.campaign_id = c.id) AS sessions FROM campaigns c ORDER BY c.name')
      .all()
      .map((c) => ({ ...c, members: members.filter((m) => m.campaign_id === c.id) }));
  });

  app.post('/admin/campaigns', async (request, reply) => {
    requireAdmin(request);
    const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(request.body);
    reply.status(201);
    return store.createCampaign(name);
  });

  /**
   * Sessions for the admin screen: each upload with its processing state and
   * how many player notes its date picks up, plus dates that have notes but no
   * transcript yet (notes are matched to a session by date; see sessionDateFor).
   */
  app.get('/admin/campaigns/:cid/sessions', async (request) => {
    requireAdmin(request);
    const cid = store.getCampaign(Number(request.params.cid)).id;
    const notesByDate = new Map(
      db
        .prepare('SELECT session_date AS date, COUNT(*) AS notes, COUNT(DISTINCT user_id) AS authors FROM player_notes WHERE campaign_id = ? AND deleted_at IS NULL GROUP BY session_date')
        .all(cid)
        .map((r) => [r.date, r]),
    );
    const jobs = new Map();
    for (const j of db.prepare("SELECT status, progress, message, error, params FROM jobs WHERE campaign_id = ? AND type = 'ingest' ORDER BY id").all(cid)) {
      jobs.set(JSON.parse(j.params).session, { status: j.status, progress: j.progress, message: j.message, error: j.error });
    }
    const sessions = db
      .prepare(
        `SELECT s.id, s.number, s.title, s.played_on, s.status, s.error, s.created_at,
           (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS attendees
         FROM sessions s WHERE s.campaign_id = ? ORDER BY s.number DESC`,
      )
      .all(cid)
      .map(({ id, ...s }) => ({
        ...s,
        notes: notesByDate.get(s.played_on)?.notes ?? 0,
        note_authors: notesByDate.get(s.played_on)?.authors ?? 0,
        job: jobs.get(s.number) ?? null,
      }));
    const dates = new Set(sessions.map((s) => s.played_on));
    const waiting = [...notesByDate.values()].filter((r) => !dates.has(r.date)).sort((a, b) => b.date.localeCompare(a.date));
    return {
      sessions,
      notes_waiting: waiting,
      next_number: (sessions[0]?.number ?? 0) + 1,
      today: sessionDateFor(new Date(), config.notes.rolloverHour),
      rollover_hour: config.notes.rolloverHour,
    };
  });

  /**
   * Delete a campaign and everything in it from the database. Its archive
   * folder is kept (marked deleted) and can be recovered by hand.
   */
  app.delete('/admin/campaigns/:cid', async (request) => {
    requireAdmin(request);
    const c = store.deleteCampaign(Number(request.params.cid), { deletedBy: request.user.id });
    search?.invalidate(c.id);
    return { deleted: c.id, name: c.name };
  });

  /** Add someone to a campaign, or change their role (e.g. make them the DM) or character. */
  app.put('/admin/campaigns/:cid/members/:uid', async (request) => {
    requireAdmin(request);
    const cid = store.getCampaign(Number(request.params.cid)).id;
    const uid = userId(request);
    const { role, character_name } = z
      .object({ role: z.enum(['dm', 'player']), character_name: z.string().trim().max(100).nullish() })
      .parse(request.body);
    auth.addMember(cid, uid, role, character_name || null);
    return auth.membership(cid, uid);
  });

  app.delete('/admin/campaigns/:cid/members/:uid', async (request) => {
    requireAdmin(request);
    const cid = store.getCampaign(Number(request.params.cid)).id;
    const uid = userId(request);
    if (!auth.membership(cid, uid)) throw new NotFoundError('Not in this campaign');
    auth.removeMember(cid, uid);
    return { ok: true };
  });

  // ---------- members (DM) ----------

  app.get('/campaigns/:cid/members', async (request) => {
    const { cid } = access(request, { dm: true });
    return db
      .prepare(
        `SELECT u.id, u.name, u.revoked_at, m.role, m.character_name FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.campaign_id = ? ORDER BY m.role, u.name`,
      )
      .all(cid);
  });

  // ---------- speaker map & glossary (DM) ----------

  app.get('/campaigns/:cid/speakers', async (request) => store.getSpeakers(access(request, { dm: true }).cid));

  /** Link each transcript name to an account (user_id) so attendance and privacy work. */
  app.put('/campaigns/:cid/speakers', async (request) => {
    const { cid } = access(request, { dm: true });
    const speakers = z
      .array(z.object({ speaker: z.string().min(1), display_name: z.string().min(1), user_id: z.number().int().nullish() }))
      .parse(request.body);
    store.setSpeakers(cid, speakers);
    return store.getSpeakers(cid);
  });

  app.get('/campaigns/:cid/glossary', async (request) => store.getGlossary(access(request, { dm: true }).cid));

  app.put('/campaigns/:cid/glossary', async (request) => {
    const { cid } = access(request, { dm: true });
    const entries = z
      .array(z.object({ term: z.string().min(1), variants: z.array(z.string()).default([]), note: z.string().nullish() }))
      .parse(request.body);
    store.setGlossary(cid, entries);
    return store.getGlossary(cid);
  });

  // ---------- sessions ----------

  app.get('/campaigns/:cid/sessions', async (request) => {
    const { cid, role } = access(request);
    return db
      .prepare('SELECT id, number, title, played_on, status, error, pipeline_version, created_at FROM sessions WHERE campaign_id = ? ORDER BY number')
      .all(cid)
      .map(({ id, ...s }) => forViewer(role, { ...s, attended: role === 'dm' || attended(id, request.user.id) }));
  });

  /**
   * Upload a transcript (DM). Either JSON { number, played_on, title?, transcript }
   * or a text/plain body with ?number=&played_on=&title= in the query string.
   * played_on (YYYY-MM-DD) links the session to players' notes from that date.
   */
  /** Who speaks in a transcript, with their current speaker-map link. Nothing is saved. */
  const transcriptSpeakers = (cid, utterances) => {
    const map = new Map(store.getSpeakers(cid).map((s) => [s.speaker, s]));
    const counts = new Map();
    for (const u of utterances) counts.set(u.speaker, (counts.get(u.speaker) ?? 0) + 1);
    return [...counts].map(([speaker, lines]) => ({ speaker, lines, user_id: map.get(speaker)?.user_id ?? null }));
  };

  const parseOrFail = (transcript) => {
    const { utterances } = parseTranscript(transcript);
    if (!utterances.length) throw new BadRequestError('No lines in the expected "[HH:MM:SS] Speaker: text" format were found.');
    return utterances;
  };

  /** Check a transcript before uploading it: line count, length, and who speaks (DM). */
  app.post('/campaigns/:cid/sessions/preview', upload, async (request) => {
    const { cid } = access(request, { dm: true });
    const { transcript } = z.object({ transcript: z.string().min(1) }).parse(request.body);
    const utterances = parseOrFail(transcript);
    return {
      lines: utterances.length,
      first: formatTimestamp(utterances[0].time),
      last: formatTimestamp(utterances.at(-1).time),
      speakers: transcriptSpeakers(cid, utterances),
    };
  });

  /**
   * Speaker-map entries for transcript names linked to accounts (user_id null =
   * not a member, e.g. a guest). Throws before anything is saved if a link is bad.
   */
  function speakerEntries(cid, links) {
    const roster = new Map(store.roster(cid).map((m) => [m.user_id, m]));
    return links.map(({ speaker, user_id }) => {
      const m = user_id == null ? null : roster.get(user_id);
      if (user_id != null && !m) throw new BadRequestError(`Account ${user_id} isn't in this campaign`);
      const display_name = !m ? speaker : m.role === 'dm' ? `DM (${m.name})` : `${m.character_name || m.name} (${m.name})`;
      return { speaker, display_name, user_id: m ? user_id : null };
    });
  }

  /** Merge entries into the speaker map, keeping everyone else's links. */
  function mergeSpeakers(cid, entries) {
    const map = new Map(store.getSpeakers(cid).map((s) => [s.speaker, s]));
    for (const e of entries) map.set(e.speaker, e);
    store.setSpeakers(cid, [...map.values()]);
  }

  app.post('/campaigns/:cid/sessions', upload, async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const isText = typeof request.body === 'string';
    const meta = z
      .object({
        number: z.coerce.number().int().positive(),
        played_on: DATE,
        title: z.string().trim().max(200).nullish(),
        transcript: z.string().min(1).optional(),
        // Optional: link this transcript's speakers to accounts before it is processed.
        speakers: z.array(z.object({ speaker: z.string().min(1), user_id: z.number().int().nullable() })).optional(),
      })
      .parse(isText ? request.query : request.body);
    const transcript = isText ? request.body : meta.transcript;
    if (!transcript) throw new BadRequestError('transcript is required');
    const utterances = parseOrFail(transcript);
    // Validate links first: the archive is permanent, so nothing is saved if a link is wrong.
    const links = speakerEntries(cid, meta.speakers ?? []);

    const { session, alreadyArchived } = store.addSession(cid, { ...meta, title: meta.title || null }, Buffer.from(transcript, 'utf8'));
    // Links go in before processing is queued, so attendance uses them.
    if (links.length) mergeSpeakers(cid, links);
    const busy = session.status === 'queued' || session.status === 'processing';
    const job = session.status === 'ready' || busy ? null : jobs.enqueueIngest(cid, session.number);
    reply.status(alreadyArchived ? 200 : 201);
    const speakers = [...new Set(utterances.map((u) => u.speaker))];
    const linked = new Set(store.getSpeakers(cid).filter((s) => s.user_id != null).map((s) => s.speaker));
    return {
      session: store.getSession(cid, session.number),
      job,
      already_archived: alreadyArchived,
      lines: utterances.length,
      speakers,
      // Attendance and privacy depend on these being linked to accounts in the speaker map.
      unlinked_speakers: speakers.filter((s) => !linked.has(s)),
      player_notes: store.playerNotes(cid, { date: meta.played_on }).length,
    };
  });

  app.get('/campaigns/:cid/sessions/:n', async (request) => {
    const { cid, role } = access(request);
    const session = store.getSession(cid, Number(request.params.n));
    const attendees = db
      .prepare('SELECT u.id, u.name FROM attendance a JOIN users u ON u.id = a.user_id WHERE a.session_id = ? ORDER BY u.name')
      .all(session.id);
    return { session: forViewer(role, session), attendees, attended: role === 'dm' || attended(session.id, request.user.id) };
  });

  /** Transcript lines. Players only get sessions they attended. */
  app.get('/campaigns/:cid/sessions/:n/transcript', async (request) => {
    const { cid, role } = access(request);
    const session = store.getSession(cid, Number(request.params.n));
    if (role !== 'dm' && !attended(session.id, request.user.id)) throw new AuthError("You weren't at this session", 403);
    const q = z.object({ from: z.string().optional(), to: z.string().optional() }).parse(request.query);
    const from = q.from ? parseTimestamp(q.from) : 0;
    const to = q.to ? parseTimestamp(q.to) : Infinity;
    return preparedTranscript(store, cid, session.number)
      .filter((u) => u.time >= from && u.time <= to)
      .map((u) => ({ time: formatTimestamp(u.time), speaker: u.speaker, text: u.text, line: formatUtterance(u) }));
  });

  /** Queue a session for (re)processing, e.g. after a failure or a glossary fix. */
  app.post('/campaigns/:cid/sessions/:n/process', async (request) => {
    const { cid } = access(request, { dm: true });
    const session = store.getSession(cid, Number(request.params.n));
    if (session.status === 'queued' || session.status === 'processing') {
      throw Object.assign(new Error('This session is already queued'), { statusCode: 409 });
    }
    return jobs.enqueueIngest(cid, session.number);
  });

  // ---------- player notes (private) ----------

  /**
   * Take a note during the session. Private to the author. Belongs to the
   * session played on session_date (default: today; notes before 6am count
   * towards the previous day).
   */
  app.post('/campaigns/:cid/notes', async (request, reply) => {
    const { cid } = access(request);
    const body = z.object({ text: z.string().trim().min(1).max(10_000), session_date: DATE.optional() }).parse(request.body);
    const note = store.addPlayerNote(cid, request.user.id, body);
    await pipeline.indexNote(cid, note);
    // A note for a session that was already processed reaches the archivist later (kb/updates.js).
    jobs.scheduleUpdates(cid);
    reply.status(201);
    return note;
  });

  /** Change the text of your own note: { text }. The archive keeps the earlier version. */
  app.patch('/campaigns/:cid/notes/:nid', async (request) => {
    const { cid } = access(request);
    const { text } = z.object({ text: z.string().trim().min(1).max(10_000) }).parse(request.body);
    const { user_name: _u, ...note } = store.editPlayerNote(cid, request.user.id, request.params.nid, { text });
    await pipeline.indexNote(cid, note);
    jobs.scheduleUpdates(cid);
    return note;
  });

  /** Delete your own note. It's gone from your notes and searches; the archive keeps it. */
  app.delete('/campaigns/:cid/notes/:nid', async (request) => {
    const { cid } = access(request);
    const note = store.deletePlayerNote(cid, request.user.id, request.params.nid);
    await search.replaceDocs(cid, { kind: 'note', ref_id: note.id }, []);
    jobs.scheduleUpdates(cid);
    return { deleted: note.id };
  });

  /** Your own notes only, optionally for one session date. */
  app.get('/campaigns/:cid/notes', async (request) => {
    const { cid } = access(request);
    const { date } = z.object({ date: DATE.optional() }).parse(request.query);
    return store.playerNotes(cid, { userId: request.user.id, date }).map(({ user_name, ...n }) => n);
  });

  // ---------- character sheets (private to their player) ----------

  // AI calls for sheets (uploads, spell lookups outside the SRD) per player per hour.
  const sheetAiCalls = new Map();
  const sheetAiAllowed = (userId) => () => {
    const hourAgo = Date.now() - 3600_000;
    const recent = (sheetAiCalls.get(userId) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= config.sheets.aiPerHour) {
      throw new RateLimitError("That's a lot of sheet lookups in the last hour. Please wait a bit, or type the details in yourself.");
    }
    recent.push(Date.now());
    sheetAiCalls.set(userId, recent);
  };

  /** Sheets belong to people in the campaign (not the admin login, which only manages). */
  function sheetOwner(request) {
    const a = access(request);
    if (!a.membership) throw new AuthError('Only people in this campaign have character sheets', 403);
    return a;
  }

  /** Your sheet in this campaign (a blank one, version 0, if you haven't saved one). */
  app.get('/campaigns/:cid/sheet', async (request) => sheets.get(sheetOwner(request).cid, request.user.id));

  /**
   * Save your whole sheet: { sheet, version } where version is the one you
   * loaded. 409 { error, current } if it was saved elsewhere since.
   */
  app.put('/campaigns/:cid/sheet', { bodyLimit: 5 * 1024 * 1024 }, async (request) => {
    const { cid } = sheetOwner(request);
    const body = z.object({ sheet: z.record(z.string(), z.unknown()), version: z.number().int().min(0) }).parse(request.body);
    return sheets.save(cid, request.user.id, body.sheet, { baseVersion: body.version });
  });

  /**
   * Upload an existing sheet: { filename, data (base64) }. A PDF, photo, text
   * file or a sheet downloaded from here. The file is archived as uploaded,
   * read (by the AI unless it's one of ours) and saved as your sheet.
   */
  app.post('/campaigns/:cid/sheet/import', upload, async (request) => {
    const { cid, campaign } = sheetOwner(request);
    const { filename, data, version } = z
      .object({ filename: z.string().max(200).default('sheet'), data: z.string().min(1), version: z.number().int().min(0).optional() })
      .parse(request.body);
    const buf = Buffer.from(data, 'base64');
    if (!buf.length) throw new BadRequestError('The file is empty.');
    const current = sheets.get(cid, request.user.id);
    if (version != null && version !== current.version) throw new SheetConflictError(current);
    archive.saveSheetUpload(campaign.slug, request.user.id, filename, buf);
    const { sheet, notes } = await sheetImport.read({
      filename,
      buf,
      base: { name: current.sheet.name, player_name: current.sheet.player_name },
      campaignId: cid,
      userId: request.user.id,
      beforeAi: sheetAiAllowed(request.user.id),
    });
    const saved = sheets.save(cid, request.user.id, sheet, { reason: `uploaded ${filename}` });
    return { ...saved, notes };
  });

  /** The sheet as a file to keep or upload again later. */
  app.get('/campaigns/:cid/sheet/download', async (request, reply) => {
    const { sheet, version, updated_at } = sheets.get(sheetOwner(request).cid, request.user.id);
    const name = (sheet.name || 'character').replace(/[^\w -]+/g, '').trim() || 'character';
    reply.header('Content-Disposition', `attachment; filename="${name}.json"`);
    return { format: SHEET_FORMAT, version, saved_at: updated_at, sheet };
  });

  /** Spell names for suggestions while typing (SRD, plus spells found in the books). */
  app.get('/campaigns/:cid/spells', async (request) => {
    access(request);
    const { q } = z.object({ q: z.string().max(100).default('') }).parse(request.query);
    return spells.search(q);
  });

  /** A spell's details by name: the SRD, else the group's books, else the AI's memory. 404 if nobody knows it. */
  app.get('/campaigns/:cid/spells/lookup', async (request) => {
    const { cid } = access(request);
    const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(request.query);
    const spell = await spells.lookup(name, { campaignId: cid, userId: request.user.id, beforeAi: sheetAiAllowed(request.user.id) });
    if (!spell) throw new NotFoundError(`No spell called "${name}" was found in the SRD, your books, or the AI's memory.`);
    return spell;
  });

  // ---------- pictures of characters (the token is seen by the campaign; the full picture is private) ----------

  /** Maps with this player's token on them get sent again, so everyone sees the new picture. */
  const resendMapsWithToken = (cid, userId) => {
    for (const map of maps.list(cid)) if (map.tokens.some((t) => t.kind === 'pc' && t.user_id === userId)) maps.events.emit('update', map);
  };

  const pictureKind = (request) => {
    if (!PICTURE_KINDS.includes(request.params.kind)) throw new NotFoundError('No such picture');
    return request.params.kind;
  };

  /**
   * Describe your full picture with the AI and put it on your sheet: the
   * Appearance box, and eyes, hair and skin where they're empty. Appearance
   * text you already have is only replaced if `replace` is set.
   */
  async function describePicture(cid, userId, replace) {
    sheetAiAllowed(userId)();
    const found = await pictureDescriber.describe(pictures.original(cid, userId, 'picture'), { campaignId: cid, userId });
    if (!found.appearance) return { description: found, applied: false };
    const current = sheets.get(cid, userId);
    const sheet = structuredClone(current.sheet);
    const applied = replace || !sheet.appearance.trim();
    if (applied) sheet.appearance = found.appearance;
    for (const k of ['eyes', 'hair', 'skin']) if (found[k] && !sheet[k].trim()) sheet[k] = found[k];
    const saved = sheets.save(cid, userId, sheet, { reason: 'described from their picture' });
    return { description: found, applied, sheet: saved };
  }

  /** Your pictures in this campaign: { token, picture }, each null or { key, width, height }. */
  app.get('/campaigns/:cid/character/pictures', async (request) => pictures.view(sheetOwner(request).cid, request.user.id));

  /**
   * Upload your token (the picture on your token on maps) or a full picture
   * of your character: { filename, data (base64) }. A full picture is
   * described by the AI for your sheet unless `describe` is false; the sheet's
   * Appearance is only replaced if it's empty or `replace` is set.
   * Returns { pictures, description?, applied?, sheet? }.
   */
  app.put('/campaigns/:cid/character/:kind', { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) }, async (request) => {
    const { cid } = sheetOwner(request);
    const kind = pictureKind(request);
    const body = z.object({ filename: z.string().max(200).default(''), data: z.string().min(1), describe: z.boolean().default(true), replace: z.boolean().default(false) }).parse(request.body);
    await pictures.save(cid, request.user.id, kind, Buffer.from(body.data, 'base64'));
    if (kind === 'token') {
      resendMapsWithToken(cid, request.user.id);
      return { pictures: pictures.view(cid, request.user.id) };
    }
    let described = {};
    if (body.describe) {
      try {
        described = await describePicture(cid, request.user.id, body.replace);
      } catch (err) {
        // The picture is saved either way; say why there's no description.
        if (!(err instanceof RateLimitError || err instanceof SpendingCapError)) request.log.warn(err);
        described = { error: `Your picture is saved, but the AI couldn't describe it: ${publicMessage(err)}` };
      }
    }
    return { pictures: pictures.view(cid, request.user.id), ...described };
  });

  /** Describe your full picture again: { replace? }. Returns { description, applied, sheet? }. */
  app.post('/campaigns/:cid/character/picture/describe', async (request) => {
    const { cid } = sheetOwner(request);
    const { replace } = z.object({ replace: z.boolean().default(false) }).parse(request.body ?? {});
    return describePicture(cid, request.user.id, replace);
  });

  /** Stop using your token or full picture (the archive keeps it). */
  app.delete('/campaigns/:cid/character/:kind', async (request) => {
    const { cid } = sheetOwner(request);
    const kind = pictureKind(request);
    pictures.remove(cid, request.user.id, kind);
    if (kind === 'token') resendMapsWithToken(cid, request.user.id);
    return { pictures: pictures.view(cid, request.user.id) };
  });

  const sendPicture = async (reply, cid, userId, kind) => {
    const { buf, type } = await pictures.image(cid, userId, kind);
    return reply.type(type).header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(buf);
  };

  /** Your full picture (only ever yours). ?v= is its key, so a new picture is a new address. */
  app.get('/campaigns/:cid/character/picture/image', async (request, reply) => {
    const { cid } = sheetOwner(request);
    return sendPicture(reply, cid, request.user.id, 'picture');
  });

  /** Someone's token picture, for anyone in the campaign (it's on the maps they're on). */
  app.get('/campaigns/:cid/members/:uid/token', async (request, reply) => {
    const { cid } = access(request);
    const uid = Number(request.params.uid);
    if (!Number.isInteger(uid) || !auth.membership(cid, uid)) throw new NotFoundError('No token picture');
    return sendPicture(reply, cid, uid, 'token');
  });

  // ---------- dice ----------

  // Shared rolls go out live (GET /campaigns/:cid/live).
  const rollEvents = new EventEmitter();
  rollEvents.setMaxListeners(0);
  const ROLL_VISIBILITY = ['party', 'dm', 'self'];
  const ROLL_LOG = 50;

  /** Who sees a roll: party = everyone in the campaign; dm = the DM (and whoever rolled); self = only whoever rolled. */
  const canSeeRoll = (r, a) => r.user_id === a.userId || r.visibility === 'party' || (r.visibility === 'dm' && a.role === 'dm');

  const rollName = (cid, userId) =>
    db.prepare('SELECT COALESCE(m.character_name, u.name) AS name, m.role FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.campaign_id = ? WHERE u.id = ?').get(cid, userId) ?? {};

  const rollView = (cid, r) => {
    const who = rollName(cid, r.user_id);
    return { id: r.id, user_id: r.user_id, name: who.name ?? '?', from_dm: who.role === 'dm', visibility: r.visibility, label: r.label, result: typeof r.result === 'string' ? JSON.parse(r.result) : r.result, rolled_at: r.rolled_at };
  };

  /**
   * Roll dice: { notation: "1d20+5", mode: normal | advantage | disadvantage,
   * label?: "Stealth", visibility?: party | dm | self }. The server decides
   * every roll (a secure random number); the page only animates the dice
   * landing on these numbers. The roll is kept in the campaign's roll log and
   * sent live to whoever may see it: the party (default), only the DM (a
   * secret roll, when the DM makes it), or only you.
   */
  app.post('/campaigns/:cid/roll', async (request) => {
    const a = access(request);
    const { notation, mode, label, visibility } = z
      .object({
        notation: z.string().max(100),
        mode: z.enum(ROLL_MODES).default('normal'),
        label: z.string().max(120).default(''),
        visibility: z.enum(ROLL_VISIBILITY).default('party'),
      })
      .parse(request.body);
    let parsed;
    try {
      parsed = parseRoll(notation);
    } catch (err) {
      throw new BadRequestError(err.message);
    }
    const result = rollDice(parsed, { mode, random: (sides) => crypto.randomInt(1, sides + 1) });
    const rolled_at = new Date().toISOString();
    const id = Number(
      db.prepare('INSERT INTO rolls (campaign_id, user_id, visibility, label, result, rolled_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(a.cid, request.user.id, visibility, label.trim(), JSON.stringify(result), rolled_at).lastInsertRowid,
    );
    const roll = { id, campaign_id: a.cid, user_id: request.user.id, visibility, label: label.trim(), result, rolled_at };
    rollEvents.emit('roll', roll);
    return { ...result, roll: rollView(a.cid, roll) };
  });

  /** The latest rolls you may see in this campaign (newest first). */
  app.get('/campaigns/:cid/rolls', async (request) => {
    const a = access(request);
    const recent = db
      .prepare(
        `SELECT * FROM rolls WHERE campaign_id = @cid AND (user_id = @uid OR visibility = 'party' OR (visibility = 'dm' AND @dm = 1))
         ORDER BY id DESC LIMIT ${ROLL_LOG}`,
      )
      .all({ cid: a.cid, uid: a.userId, dm: a.role === 'dm' ? 1 : 0 });
    return { rolls: recent.map((r) => rollView(a.cid, r)) };
  });

  // ---------- handouts (the DM gives pictures and text to everyone or chosen players) ----------

  const handoutTo = z.union([z.literal('everyone'), z.array(z.number().int()).max(100)]);

  /** Handout recipients must be people in the campaign. */
  function checkRecipients(cid, to) {
    if (to === 'everyone') return to;
    for (const id of to) if (!auth.membership(cid, id)) throw new BadRequestError(`User ${id} isn't in this campaign.`);
    return [...new Set(to)];
  }

  /** The handouts given to you (the DM: every handout), newest first. */
  app.get('/campaigns/:cid/handouts', async (request) => {
    const a = access(request);
    return { can_edit: a.role === 'dm', handouts: handouts.list(a.cid, a).map((h) => handouts.view(h, a)) };
  });

  /**
   * Give a handout (DM): { title, text?, to: "everyone" | [user ids],
   * picture?: { filename, data (base64) } }. It shows up live for them.
   */
  app.post('/campaigns/:cid/handouts', { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) + 64 * 1024 }, async (request, reply) => {
    const a = access(request, { dm: true });
    const body = z
      .object({
        title: z.string().trim().min(1).max(200),
        text: z.string().max(MAX_HANDOUT_TEXT).default(''),
        to: handoutTo,
        picture: z.object({ filename: z.string().max(200).default(''), data: z.string().min(1) }).optional(),
      })
      .parse(request.body);
    if (!body.text.trim() && !body.picture) throw new BadRequestError('A handout needs some text or a picture.');
    const h = await handouts.create(a.cid, { title: body.title, text: body.text.trim(), to: checkRecipients(a.cid, body.to), picture: body.picture && Buffer.from(body.picture.data, 'base64') }, { by: request.user.id });
    reply.status(201);
    return handouts.view(h, a);
  });

  /** Change a handout (DM): { title?, text?, to? }. Giving it to more players shows it to them live. */
  app.patch('/campaigns/:cid/handouts/:hid', async (request) => {
    const a = access(request, { dm: true });
    const body = z.object({ title: z.string().trim().min(1).max(200).optional(), text: z.string().max(MAX_HANDOUT_TEXT).optional(), to: handoutTo.optional() }).parse(request.body ?? {});
    if (body.to) body.to = checkRecipients(a.cid, body.to);
    if (body.text != null) body.text = body.text.trim();
    return handouts.view(handouts.update(a.cid, request.params.hid, body), a);
  });

  /** Take a handout back (DM): nobody sees it any more; the archive keeps it. */
  app.delete('/campaigns/:cid/handouts/:hid', async (request) => {
    const a = access(request, { dm: true });
    handouts.remove(a.cid, request.params.hid);
    return { removed: request.params.hid };
  });

  /** A handout's picture, for whoever may see the handout. */
  app.get('/campaigns/:cid/handouts/:hid/image', async (request, reply) => {
    const a = access(request);
    const h = handouts.get(a.cid, request.params.hid);
    if (!canSeeHandout(h, a)) throw new NotFoundError('No such handout');
    const { buf, type } = await handouts.image(a.cid, h);
    return reply.type(type).header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(buf);
  });

  /**
   * Live news for the whole campaign (SSE): roll {roll} for rolls you may see;
   * handout {handout} when one is given to you or changed; handout-gone {id}
   * when one is taken back or no longer for you.
   */
  app.get('/campaigns/:cid/live', async (request, reply) => {
    const { cid } = access(request);
    const { sse, current } = openLiveStream(request, reply, { cid, userId: request.user.id });
    const onRoll = (r) => {
      if (r.campaign_id !== cid) return;
      const a = current();
      if (!a) return sse.end();
      if (canSeeRoll(r, a)) sse.send('roll', rollView(cid, r));
    };
    const onHandout = ({ campaign_id, handout }) => {
      if (campaign_id !== cid) return;
      const a = current();
      if (!a) return sse.end();
      if (canSeeHandout(handout, a)) sse.send('handout', handouts.view(handout, a));
      else sse.send('handout-gone', { id: handout.id });
    };
    rollEvents.on('roll', onRoll);
    handouts.events.on('update', onHandout);
    sse.onClose(() => {
      rollEvents.off('roll', onRoll);
      handouts.events.off('update', onHandout);
    });
  });

  // ---------- maps (the DM imports them; players see shown maps and move their own token) ----------

  // AI reads of imported maps per person per hour.
  const mapAiCalls = new Map();
  const mapAiAllowed = (userId) => {
    const hourAgo = Date.now() - 3600_000;
    const recent = (mapAiCalls.get(userId) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= config.maps.aiPerHour) throw new RateLimitError("That's a lot of map reading in the last hour. Please wait a bit, or set the grid by hand.");
    recent.push(Date.now());
    mapAiCalls.set(userId, recent);
  };

  /** A map this viewer may see (players: only shown ones; 404 either way, so hidden maps don't show they exist). */
  function viewableMap(request) {
    const a = access(request);
    if (!isMapId(request.params.mid)) throw new NotFoundError('No such map');
    const map = maps.get(a.cid, request.params.mid);
    const view = maps.view(map, a);
    if (!view) throw new NotFoundError('No such map');
    return { ...a, map, view };
  }

  /**
   * Read a map with the AI in the background. Fields the DM changed while it
   * was reading are left alone, and the AI's name only replaces the file
   * name (never a name the DM typed).
   */
  function readMapInBackground(cid, map, userId) {
    const before = { grid: JSON.stringify(map.grid), scale: JSON.stringify(map.scale) };
    maps.change(cid, map.id, (m) => {
      m.reading = { status: 'pending', error: '', notes: '' };
    }, { by: userId, reason: 'reading' });
    const buf = fs.readFileSync(maps.imagePath(cid, map.id, { base: true }).path);
    return mapReader
      .read({ buf, width: map.image.width, height: map.image.height, campaignId: cid, userId })
      .then((r) =>
        maps.change(cid, map.id, (m) => {
          if (r.name && !m.named) m.name = r.name;
          if (JSON.stringify(m.grid) === before.grid) m.grid = r.grid;
          if (JSON.stringify(m.scale) === before.scale) m.scale = r.scale;
          m.kind = r.kind;
          m.description = r.description;
          m.reading = { status: 'done', error: '', notes: r.notes };
        }, { reason: 'read by the AI' }),
      )
      .catch((err) => {
        app.log.warn(err);
        try {
          maps.change(cid, map.id, (m) => {
            m.reading = { status: 'failed', error: `The AI couldn't read this map: ${publicMessage(err)}`, notes: '' };
          }, { reason: 'read failed' });
        } catch {
          // removed while it was being read
        }
      });
  }

  /** Draft walls with the AI in the background. The new draft replaces the AI's old one; the DM's own walls stay. */
  function draftWallsInBackground(cid, map, userId) {
    maps.change(cid, map.id, (m) => {
      m.wall_draft = { status: 'pending', error: '', notes: '' };
    }, { by: userId, reason: 'drafting walls' });
    const buf = fs.readFileSync(maps.imagePath(cid, map.id, { base: true }).path);
    return mapReader
      .walls({ buf, width: map.image.width, height: map.image.height, campaignId: cid, userId })
      .then((r) =>
        maps.change(cid, map.id, (m) => {
          const own = m.walls.filter((w) => w.source !== 'ai');
          m.walls = [...own, ...r.walls.slice(0, MAX_WALLS - own.length).map((w) => ({ ...w, id: newTokenId(), open: false, source: 'ai' }))];
          // Lights the AI saw on the picture (torches, braziers, fires) replace its earlier ones too.
          const ownLights = m.lights.filter((l) => l.source !== 'ai');
          m.lights = [...ownLights, ...(r.lights ?? []).slice(0, MAX_LIGHTS - ownLights.length).map((l) => ({ ...l, id: newTokenId(), source: 'ai' }))];
          // And difficult terrain (water, rubble, undergrowth).
          const ownTerrain = m.terrain.filter((t) => t.source !== 'ai');
          m.terrain = [...ownTerrain, ...(r.terrain ?? []).slice(0, MAX_TERRAIN - ownTerrain.length).map((t) => ({ ...t, id: newTokenId(), source: 'ai' }))];
          m.wall_draft = { status: 'done', error: '', notes: r.notes };
        }, { reason: 'walls drafted by the AI' }),
      )
      .catch((err) => {
        app.log.warn(err);
        try {
          maps.change(cid, map.id, (m) => {
            m.wall_draft = { status: 'failed', error: `The AI couldn't draft walls: ${publicMessage(err)}`, notes: '' };
          }, { reason: 'wall draft failed' });
        } catch {
          // removed meanwhile
        }
      });
  }

  /** Maps this viewer can see. can_edit: whether they're the DM here. */
  app.get('/campaigns/:cid/maps', async (request) => {
    const a = access(request);
    return { can_edit: a.role === 'dm', maps: maps.list(a.cid).map((m) => maps.view(m, a)).filter(Boolean) };
  });

  /**
   * Import a map (DM): { filename, data (base64), name? }. The image is
   * archived as uploaded and the AI reads it in the background; the map
   * starts hidden from players.
   */
  app.post('/campaigns/:cid/maps', upload, async (request, reply) => {
    const a = access(request, { dm: true });
    const { filename, data, name, page } = z
      .object({ filename: z.string().max(200).default('map'), data: z.string().min(1), name: z.string().trim().max(100).optional(), page: z.number().int().positive().optional() })
      .parse(request.body);
    let buf = Buffer.from(data, 'base64');
    if (!buf.length) throw new BadRequestError('The file is empty.');
    // A PDF: draw the page asked for (default the first) and use that as the image.
    let pdf = null;
    let pages = 1;
    if (isPdf(buf)) {
      const rendered = await renderPdfPage(buf, page ?? 1);
      pdf = { buf, page: page ?? 1 };
      pages = rendered.pages;
      buf = rendered.png;
    }
    const image = await inspectImage(buf);
    mapAiAllowed(request.user.id);
    let fromFile = filename.replace(/\.[^.]*$/, '').replace(/[_-]+/g, ' ').trim();
    if (pdf && pages > 1) fromFile = `${fromFile || 'Map'}, page ${pdf.page}`;
    const map = maps.create(a.cid, { name: name || fromFile || 'Map', named: !!name, buf, ...image, pdf, by: request.user.id });
    readMapInBackground(a.cid, map, request.user.id);
    reply.status(201);
    return maps.view(maps.get(a.cid, map.id), a);
  });

  /**
   * The campaign's records, for putting someone from them on a map (DM):
   * { records: [{ id, kind, title, status, person }] }, people first. The
   * archivist names its kinds freely, so `person` is only a guess from the kind.
   */
  app.get('/campaigns/:cid/maps/records', async (request) => {
    const a = access(request, { dm: true });
    const records = kb.list(a.cid).map((r) => ({ id: r.id, kind: r.kind, title: r.title, status: r.status, person: PERSON_KIND.test(r.kind) }));
    records.sort((x, y) => Number(y.person) - Number(x.person) || x.kind.localeCompare(y.kind) || x.title.localeCompare(y.title));
    return { records };
  });

  /**
   * One record (DM), for a token linked to it. Record ids can change when the
   * knowledge base is rebuilt, so ?title= finds it by title if the id is gone.
   */
  app.get('/campaigns/:cid/maps/records/:rid', async (request) => {
    const a = access(request, { dm: true });
    const { title } = z.object({ title: z.string().max(200).optional() }).parse(request.query ?? {});
    let [r] = /^\d+$/.test(request.params.rid) ? kb.getMany(a.cid, [Number(request.params.rid)]) : [];
    if ((!r || (title && r.title !== title)) && title) r = kb.list(a.cid).find((x) => x.title === title) ?? r;
    if (!r) throw new NotFoundError('That record is gone. The archivist may have merged or renamed it.');
    return { id: r.id, kind: r.kind, title: r.title, status: r.status, body: r.body, data: r.data, tags: r.tags };
  });

  /** Live changes to the maps this viewer can see (SSE): map {map} | gone {id}. */
  app.get('/campaigns/:cid/maps/events', async (request, reply) => {
    const { cid } = access(request);
    const { sse, current } = openLiveStream(request, reply, { cid, userId: request.user.id });
    const listener = (map) => {
      if (map.campaign_id !== cid) return;
      const a = current();
      if (!a) return sse.end();
      const view = maps.view(map, a);
      if (view) sse.send('map', view);
      else sse.send('gone', { id: map.id });
    };
    // Pings and quick drawings: to everyone who can see the map; a player gets other players' only where they can see them.
    const signal = (sig) => {
      if (sig.campaign_id !== cid) return;
      const a = current();
      if (!a) return sse.end();
      let map;
      try {
        map = maps.get(cid, sig.map_id);
      } catch {
        return;
      }
      const view = maps.view(map, a);
      if (!view) return;
      if (a.role !== 'dm' && !sig.from_dm && sig.by !== request.user.id) {
        const { polygons } = maps.sightFor(map, request.user.id);
        if (!sig.points.some(([x, y]) => canSee(map, polygons, x, y))) return;
      }
      const { campaign_id: _c, from_dm: _d, ...out } = sig;
      sse.send(sig.kind, out);
    };
    maps.events.on('update', listener);
    maps.events.on('signal', signal);
    sse.onClose(() => {
      maps.events.off('update', listener);
      maps.events.off('signal', signal);
    });
  });

  // Pings and drawings per person: at most SIGNALS_PER_WINDOW in SIGNAL_WINDOW ms.
  const SIGNAL_WINDOW = 10_000;
  const SIGNALS_PER_WINDOW = 20;
  const signalTimes = new Map();
  const signalAllowed = (userId) => {
    const since = Date.now() - SIGNAL_WINDOW;
    const recent = (signalTimes.get(userId) ?? []).filter((t) => t > since);
    if (recent.length >= SIGNALS_PER_WINDOW) throw new RateLimitError('Slow down a little with the pings.');
    recent.push(Date.now());
    signalTimes.set(userId, recent);
  };

  /** Send a ping or a drawing to everyone looking at the map (not saved). Its colour: the sender's token, or gold for the DM. */
  function sendSignal(request, kind, points) {
    const a = access(request);
    const { map } = viewableMap(request);
    signalAllowed(request.user.id);
    const own = map.tokens.find((t) => t.kind === 'pc' && t.user_id === request.user.id);
    maps.events.emit('signal', {
      kind,
      campaign_id: a.cid,
      map_id: map.id,
      by: request.user.id,
      name: own?.name ?? request.user.name,
      color: a.role === 'dm' ? '#ffd54a' : own?.color ?? '#4fc3f7',
      from_dm: a.role === 'dm',
      points: points.map(([x, y]) => [Math.round(Math.min(map.image.width, Math.max(0, x)) * 10) / 10, Math.round(Math.min(map.image.height, Math.max(0, y)) * 10) / 10]),
    });
    return { ok: true };
  }

  /** Ping a spot on the map: { x, y }. Everyone looking sees it for a moment (players: the DM's, and other players' where they can see). */
  app.post('/campaigns/:cid/maps/:mid/ping', async (request) => {
    const { x, y } = z.object({ x: z.number(), y: z.number() }).parse(request.body ?? {});
    return sendSignal(request, 'ping', [[x, y]]);
  });

  /** A quick drawing: { points: [[x, y], ...] } (up to 500). It fades after a while on everyone's screen; nothing is saved. */
  app.post('/campaigns/:cid/maps/:mid/draw', async (request) => {
    const { points } = z.object({ points: z.array(z.tuple([z.number(), z.number()])).min(2).max(500) }).parse(request.body ?? {});
    return sendSignal(request, 'draw', points);
  });

  app.get('/campaigns/:cid/maps/:mid', async (request) => viewableMap(request).view);

  const playerImages = createPlayerImages();

  /** The map's image: as imported for the DM; for players, with what they can't see blacked out (and what they saw before dimmed). */
  app.get('/campaigns/:cid/maps/:mid/image', async (request, reply) => {
    const { cid, map, role, view } = viewableMap(request);
    const { path: file, type } = maps.imagePath(cid, map.id);
    reply.type(type).header('X-Content-Type-Options', 'nosniff');
    if (role === 'dm') {
      // The file never changes, so the browser can keep it.
      return reply.header('Cache-Control', 'private, max-age=31536000, immutable').send(fs.createReadStream(file));
    }
    return reply.header('Cache-Control', 'private, no-cache').send(await playerImages.get(map, file, { mask: view.fog.mask, key: view.image_key }, type));
  });

  const GRID = z.object({ size: z.number().positive(), x: z.number(), y: z.number() }).nullable();
  const SCALE = z.object({ distance: z.number().positive(), unit: z.enum(UNITS), per: z.enum(SCALE_PER) }).nullable();

  /** Change a map (DM): { name?, shown?, grid?, scale?, variant? }. grid/scale null removes them; variant: which picture everyone sees (null: the original). */
  app.patch('/campaigns/:cid/maps/:mid', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({ name: z.string().trim().min(1).max(100).optional(), shown: z.boolean().optional(), grid: GRID.optional(), scale: SCALE.optional(), variant: z.string().nullable().optional() })
      .parse(request.body ?? {});
    if (body.variant != null && !map.variants.some((v) => v.id === body.variant)) throw new NotFoundError('No such variant');
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.name !== undefined) {
        m.name = body.name;
        m.named = true;
      }
      if (body.shown !== undefined) m.shown = body.shown;
      if (body.grid !== undefined) m.grid = body.grid;
      if (body.scale !== undefined) m.scale = body.scale;
      if (body.variant !== undefined) m.variant = body.variant;
    }, { by: request.user.id });
    return maps.view(saved, a);
  });

  /**
   * Another picture of the same map (DM): { filename, data (base64), name? }, e.g. the same room at night.
   * It's stretched to the map's size so everything on the map stays in place; the upload is archived as it came.
   */
  app.post('/campaigns/:cid/maps/:mid/variants', upload, async (request, reply) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const { filename, data, name } = z
      .object({ filename: z.string().max(200).default('variant'), data: z.string().min(1), name: z.string().trim().max(60).optional() })
      .parse(request.body);
    if (map.variants.length >= MAX_VARIANTS) throw new BadRequestError(`A map can have up to ${MAX_VARIANTS} other pictures.`);
    const buf = Buffer.from(data, 'base64');
    if (!buf.length) throw new BadRequestError('The file is empty.');
    if (isPdf(buf)) throw new BadRequestError('Upload the other picture as a PNG, JPEG or WebP image.');
    const image = await inspectImage(buf);
    let fitted = sharp(buf).rotate().resize(map.image.width, map.image.height, { fit: 'fill' });
    fitted = image.type === 'image/png' ? fitted.png() : image.type === 'image/webp' ? fitted.webp({ quality: 90 }) : fitted.jpeg({ quality: 90 });
    const fromFile = filename.replace(/\.[^.]*$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 60);
    const saved = maps.addVariant(a.cid, map.id, { name: name || fromFile || 'Variant', original: buf, ext: image.ext, fitted: await fitted.toBuffer(), type: image.type, by: request.user.id });
    reply.status(201);
    return { map: maps.view(saved, a), variant: saved.variants.at(-1) };
  });

  /** Remove one of a map's other pictures (DM). Its files stay in the archive. If it was showing, the original comes back. */
  app.delete('/campaigns/:cid/maps/:mid/variants/:vid', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (!map.variants.some((v) => v.id === request.params.vid)) throw new NotFoundError('No such variant');
    const saved = maps.change(a.cid, map.id, (m) => {
      m.variants = m.variants.filter((v) => v.id !== request.params.vid);
      if (m.variant === request.params.vid) m.variant = null;
    }, { by: request.user.id, reason: 'variant removed' });
    return maps.view(saved, a);
  });

  /** Links to other maps (DM): { add?: { x, y, to, label? }, move?: { id, x, y }, remove?: id }. `to` is the map it leads to. */
  app.patch('/campaigns/:cid/maps/:mid/links', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({
        add: z.object({ x: z.number(), y: z.number(), to: z.string(), label: z.string().trim().max(60).optional() }).optional(),
        move: z.object({ id: z.string(), x: z.number(), y: z.number() }).optional(),
        remove: z.string().optional(),
      })
      .parse(request.body ?? {});
    if (body.add) {
      if (body.add.to === map.id) throw new BadRequestError('A link has to lead to another map.');
      maps.get(a.cid, body.add.to);
      if (map.links.length >= MAX_LINKS) throw new BadRequestError(`A map can have up to ${MAX_LINKS} links.`);
    }
    if (body.move && !map.links.some((l) => l.id === body.move.id)) throw new NotFoundError('No such link');
    if (body.remove && !map.links.some((l) => l.id === body.remove)) throw new NotFoundError('No such link');
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.add) m.links.push({ id: newTokenId(), x: body.add.x, y: body.add.y, to: body.add.to, label: body.add.label ?? '' });
      if (body.move) Object.assign(m.links.find((l) => l.id === body.move.id), { x: body.move.x, y: body.move.y });
      if (body.remove) m.links = m.links.filter((l) => l.id !== body.remove);
    }, { by: request.user.id, reason: 'links' });
    return maps.view(saved, a);
  });

  /**
   * Take a token through a link to the other map: { token }. Players move their own character, standing
   * next to a link they can see, to a map the DM has shown; the DM can send any token. It arrives at the
   * link on the other map that leads back here, or the middle of that map.
   */
  app.post('/campaigns/:cid/maps/:mid/links/:lid/use', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const { token: tid } = z.object({ token: z.string() }).parse(request.body ?? {});
    const link = view.links.find((l) => l.id === request.params.lid);
    if (!link) throw new NotFoundError('No such link');
    const token = map.tokens.find((t) => t.id === tid);
    if (!token) throw new NotFoundError('No such token');
    const dm = a.role === 'dm';
    if (!dm && !(token.kind === 'pc' && token.user_id === request.user.id)) throw new AuthError('You can only move your own character.', 403);
    if (!dm && !nearLink(map, link, token.x, token.y)) throw new BadRequestError(`Move ${token.name} next to it first.`);
    const target = maps.get(a.cid, link.to);
    if (!dm && !target.shown) throw new NotFoundError('No such map');
    if (target.tokens.length >= MAX_TOKENS) throw new BadRequestError(`${target.name} is full.`);
    const back = target.links.find((l) => l.to === map.id);
    const { x, y } = snapToken(target, token, back?.x ?? target.image.width / 2, back?.y ?? target.image.height / 2);
    maps.change(a.cid, map.id, (m) => {
      if (m.combat?.turn === token.id) Object.assign(m.combat, stepTurn(m.combat, 1));
      m.tokens = m.tokens.filter((t) => t.id !== token.id);
    }, { by: request.user.id, reason: `left for ${target.id}` });
    const id = target.tokens.some((t) => t.id === token.id) ? newTokenId() : token.id;
    const arrived = maps.change(a.cid, target.id, (m) => {
      m.tokens.push({ ...token, id, x, y });
    }, { by: request.user.id, reason: `arrived from ${map.id}` });
    return { map: maps.view(arrived, a), token: id };
  });

  /**
   * Fog of war (DM): { enabled?, sight?, map?: dark | shown, memory?, dark?, add?: {op: reveal | cover, x, y, w, h}, undo?, reset?: cover | reveal, forget? }.
   * map: what players get outside their sight and the reveals (dark, or the map with no tokens). memory: keep a dim view of where they've been.
   * reset: cover hides the whole map again, reveal shows all of it; undo takes back the last rectangle.
   * sight: players also see what their own token can see past the walls. forget: players lose the dim view of places they saw before.
   * dark: darkness; with sight, players only see lit places and what their darkvision reaches.
   */
  app.patch('/campaigns/:cid/maps/:mid/fog', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({
        enabled: z.boolean().optional(),
        sight: z.boolean().optional(),
        map: z.enum(FOG_MAP).optional(),
        memory: z.boolean().optional(),
        dark: z.boolean().optional(),
        forget: z.boolean().optional(),
        add: z.object({ op: z.enum(FOG_OPS), x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }).optional(),
        undo: z.boolean().optional(),
        reset: z.enum(['cover', 'reveal']).optional(),
      })
      .parse(request.body ?? {});
    if (body.add && map.fog.shapes.length >= MAX_FOG_SHAPES) throw new BadRequestError('That map has too many fog changes. Use "Cover all" or "Reveal all" to start again.');
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.enabled !== undefined) m.fog.enabled = body.enabled;
      if (body.sight !== undefined) m.fog.sight = body.sight;
      if (body.map !== undefined) m.fog.map = body.map;
      if (body.memory !== undefined) m.fog.memory = body.memory;
      if (body.dark !== undefined) m.fog.dark = body.dark;
      if (body.reset === 'cover') m.fog.shapes = [];
      if (body.reset === 'reveal') m.fog.shapes = [{ op: 'reveal', x: 0, y: 0, w: m.image.width, h: m.image.height }];
      if (body.undo) m.fog.shapes.pop();
      if (body.add) m.fog.shapes.push(body.add);
    }, { by: request.user.id, reason: 'fog' });
    if (body.forget) maps.forgetExplored(a.cid, map.id);
    return maps.view(saved, a);
  });

  const POINT = z.number().min(0).max(100_000);
  const WALL = z.object({ x1: POINT, y1: POINT, x2: POINT, y2: POINT, door: z.boolean().default(false), kind: z.enum(WALL_KINDS).default('wall') });

  /**
   * Walls and doors (DM): { add?: {x1, y1, x2, y2, door?, kind?: wall | low}, remove?: id, toggle?: id (open or close a door),
   * lock?: id (lock or unlock a door), clear?: ai | all }. Walls block line of sight and players' tokens, obstacles ('low')
   * only tokens. Players never get walls, only the doors they can see.
   */
  app.patch('/campaigns/:cid/maps/:mid/walls', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({ add: WALL.optional(), remove: z.string().max(20).optional(), toggle: z.string().max(20).optional(), lock: z.string().max(20).optional(), clear: z.enum(['ai', 'all']).optional() })
      .parse(request.body ?? {});
    if (body.add && map.walls.length >= MAX_WALLS) throw new BadRequestError(`A map can have at most ${MAX_WALLS} walls.`);
    for (const id of [body.remove, body.toggle, body.lock]) {
      if (id !== undefined && !map.walls.some((w) => w.id === id)) throw new NotFoundError('No such wall');
    }
    for (const id of [body.toggle, body.lock]) {
      if (id && !map.walls.find((w) => w.id === id).door) throw new BadRequestError("That's a wall, not a door.");
    }
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.clear === 'all') m.walls = [];
      if (body.clear === 'ai') m.walls = m.walls.filter((w) => w.source !== 'ai');
      if (body.remove) m.walls = m.walls.filter((w) => w.id !== body.remove);
      if (body.toggle) {
        const door = m.walls.find((w) => w.id === body.toggle);
        door.open = !door.open;
        if (door.open) door.locked = false;
      }
      if (body.lock) {
        const door = m.walls.find((w) => w.id === body.lock);
        door.locked = !door.locked;
        if (door.locked) door.open = false;
      }
      if (body.add) m.walls.push({ ...body.add, id: newTokenId(), open: false, source: 'dm' });
    }, { by: request.user.id, reason: body.toggle ? 'door' : 'walls' });
    return maps.view(saved, a);
  });

  /**
   * Open or close a door. The DM can any; a player only a door they can see,
   * that isn't locked, within reach (a square and a half) of one of their tokens.
   */
  app.post('/campaigns/:cid/maps/:mid/doors/:wid/toggle', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const door = (a.role === 'dm' ? map.walls : view.doors).find((w) => w.id === request.params.wid && (a.role !== 'dm' || w.door));
    if (!door) throw new NotFoundError('No such door');
    if (a.role !== 'dm') {
      if (door.locked) throw new BadRequestError("It's locked.");
      const near = map.tokens.some((t) => t.kind === 'pc' && t.user_id === request.user.id && distanceToWall(t, door) <= doorReach(map));
      if (!near) throw new BadRequestError('Your character is too far away to reach that door.');
    }
    const saved = maps.change(a.cid, map.id, (m) => {
      const d = m.walls.find((w) => w.id === door.id);
      if (d && !(a.role !== 'dm' && d.locked)) {
        d.open = !d.open;
        if (d.open) d.locked = false; // an open door isn't locked
      }
    }, { by: request.user.id, reason: 'door' });
    return maps.view(saved, a);
  });

  const RADII = { bright: z.number().min(0).max(10_000), dim: z.number().min(0).max(10_000) };

  /**
   * Light sources (DM): { add?: {x, y, bright, dim}, move?: {id, x, y}, remove?: id, clear?: ai | all }.
   * Radii are in the map's unit (a torch: 20 bright, 20 dim). Lights matter in darkness (fog.dark).
   */
  app.patch('/campaigns/:cid/maps/:mid/lights', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({
        add: z.object({ x: POINT, y: POINT, ...RADII }).optional(),
        move: z.object({ id: z.string().max(20), x: POINT, y: POINT }).optional(),
        remove: z.string().max(20).optional(),
        clear: z.enum(['ai', 'all']).optional(),
      })
      .parse(request.body ?? {});
    if (body.add && map.lights.length >= MAX_LIGHTS) throw new BadRequestError(`A map can have at most ${MAX_LIGHTS} lights.`);
    if (body.add && body.add.bright + body.add.dim <= 0) throw new BadRequestError('A light needs some reach.');
    for (const id of [body.remove, body.move?.id]) {
      if (id !== undefined && !map.lights.some((l) => l.id === id)) throw new NotFoundError('No such light');
    }
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.clear === 'all') m.lights = [];
      if (body.clear === 'ai') m.lights = m.lights.filter((l) => l.source !== 'ai');
      if (body.remove) m.lights = m.lights.filter((l) => l.id !== body.remove);
      if (body.move) Object.assign(m.lights.find((l) => l.id === body.move.id), { x: body.move.x, y: body.move.y });
      if (body.add) m.lights.push({ ...body.add, id: newTokenId(), source: 'dm' });
    }, { by: request.user.id, reason: 'lights' });
    return maps.view(saved, a);
  });

  /** Difficult terrain (DM): { add?: {points: [[x, y], ...]}, remove?: id, clear?: ai | all }. Moving through it costs double. */
  app.patch('/campaigns/:cid/maps/:mid/terrain', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({
        add: z.object({ points: z.array(z.tuple([POINT, POINT])).min(3).max(200) }).optional(),
        remove: z.string().max(20).optional(),
        clear: z.enum(['ai', 'all']).optional(),
      })
      .parse(request.body ?? {});
    if (body.add && map.terrain.length >= MAX_TERRAIN) throw new BadRequestError(`A map can have at most ${MAX_TERRAIN} areas of difficult terrain.`);
    if (body.remove && !map.terrain.some((t) => t.id === body.remove)) throw new NotFoundError('No such area');
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.clear === 'all') m.terrain = [];
      if (body.clear === 'ai') m.terrain = m.terrain.filter((t) => t.source !== 'ai');
      if (body.remove) m.terrain = m.terrain.filter((t) => t.id !== body.remove);
      if (body.add) m.terrain.push({ id: newTokenId(), points: body.add.points, source: 'dm' });
    }, { by: request.user.id, reason: 'terrain' });
    return maps.view(saved, a);
  });

  /** Draft the walls and doors with the AI (DM), in the background. Replaces the AI's earlier draft; walls the DM drew stay. */
  app.post('/campaigns/:cid/maps/:mid/walls/draft', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (map.wall_draft.status === 'pending') throw new BadRequestError('The AI is already drafting walls for this map.');
    mapAiAllowed(request.user.id);
    draftWallsInBackground(a.cid, map, request.user.id);
    return maps.view(maps.get(a.cid, map.id), a);
  });

  /** Read the map with the AI again (DM). Its grid, scale and description are replaced. */
  app.post('/campaigns/:cid/maps/:mid/read', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (map.reading.status === 'pending') throw new BadRequestError('This map is already being read.');
    mapAiAllowed(request.user.id);
    readMapInBackground(a.cid, map, request.user.id);
    return maps.view(maps.get(a.cid, map.id), a);
  });

  /** Remove a map (DM). It's only marked removed; the archive keeps everything. */
  app.delete('/campaigns/:cid/maps/:mid', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    maps.change(a.cid, map.id, (m) => {
      m.removed = true;
    }, { by: request.user.id, reason: 'removed' });
    return { ok: true };
  });

  const TOKEN = z.object({
    kind: z.enum(TOKEN_KINDS),
    name: z.string().trim().max(80),
    user_id: z.number().int().nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour like #b33a3a'),
    size: z.number().refine((n) => TOKEN_SIZES.includes(n), 'must be 0.5, 1, 2, 3 or 4'),
    x: z.number(),
    y: z.number(),
    hp: z.object({ current: z.number().int().nullable(), max: z.number().int().positive().nullable() }).nullable(),
    conditions: z.array(z.enum(CONDITIONS)).max(CONDITIONS.length),
    hidden: z.boolean(),
    record: z.object({ id: z.number().int().positive(), title: z.string().max(200).optional() }).nullable(),
    stats: z.object({ text: z.string().max(8000), ac: z.number().int().nullable().optional(), hp_formula: z.string().max(40).optional(), speed: z.string().max(120).optional(), challenge: z.string().max(40).optional() }).nullable(),
    light: z.object(RADII).nullable(),
    darkvision: z.number().min(0).max(10_000),
    speed: z.number().min(0).max(10_000).nullable(),
  });
  // What a player may change on their own token; everything else is the DM's.
  const OWNER_FIELDS = new Set(['x', 'y', 'hp', 'conditions', 'light', 'darkvision']);

  /** A token linked to a record gets that record's current title (the DM only sends the id). */
  const linkRecord = (cid, body) => {
    if (!body.record) return;
    const [r] = kb.getMany(cid, [body.record.id]);
    if (!r) throw new BadRequestError('No such record.');
    body.record = { id: r.id, title: r.title };
  };

  /** A player character token belongs to someone in this campaign. */
  const checkTokenOwner = (cid, token) => {
    if (token.kind === 'pc' && token.user_id != null && !auth.membership(cid, token.user_id)) {
      throw new BadRequestError("That player isn't in this campaign.");
    }
  };

  /** Add a token (DM): { kind, name, user_id?, color?, size?, x?, y?, hp?, conditions?, hidden? }. On a grid it snaps to squares. */
  app.post('/campaigns/:cid/maps/:mid/tokens', async (request, reply) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = TOKEN.partial().required({ kind: true }).parse(request.body ?? {});
    if (map.tokens.length >= MAX_TOKENS) throw new BadRequestError(`A map can have at most ${MAX_TOKENS} tokens.`);
    checkTokenOwner(a.cid, body);
    linkRecord(a.cid, body);
    const id = newTokenId();
    const saved = maps.change(a.cid, map.id, (m) => {
      const token = { size: 1, ...body, id, x: body.x ?? m.image.width / 2, y: body.y ?? m.image.height / 2 };
      Object.assign(token, snapToken(m, { size: TOKEN_SIZES.includes(token.size) ? token.size : 1 }, token.x, token.y));
      m.tokens.push(token);
    }, { by: request.user.id, reason: 'token added' });
    reply.status(201);
    return { map: maps.view(saved, a), token: saved.tokens.find((t) => t.id === id) };
  });

  /**
   * Change a token. The player it belongs to may move it ({ x, y }) and set
   * its hit points and conditions; anything else (name, kind, owner, colour,
   * size, hidden) is the DM's.
   */
  app.patch('/campaigns/:cid/maps/:mid/tokens/:tid', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    // Only tokens this viewer can see (players don't get to find tokens under the fog).
    const token = view.tokens.find((t) => t.id === request.params.tid);
    if (!token) throw new NotFoundError('No such token');
    // A move can go by waypoints: path is where it turns on the way.
    const { path = [], ...rest } = z.object({ path: z.array(z.tuple([z.number(), z.number()])).max(50).optional() }).passthrough().parse(request.body ?? {});
    const body = TOKEN.partial().parse(rest);
    const moving = Object.keys(body).every((k) => k === 'x' || k === 'y');
    if (a.role !== 'dm') {
      if (token.user_id !== request.user.id) throw new AuthError('You can only change your own token', 403);
      if (!Object.keys(body).every((k) => OWNER_FIELDS.has(k))) throw new AuthError('Only the DM can change that', 403);
    }
    checkTokenOwner(a.cid, { ...token, ...body });
    linkRecord(a.cid, body);
    // Players can't walk through walls or closed doors (the DM can put any token anywhere).
    const moves = body.x !== undefined || body.y !== undefined;
    const route = moves ? [{ x: token.x, y: token.y }, ...path.map(([x, y]) => ({ x, y })), snapToken(map, token, body.x ?? token.x, body.y ?? token.y)] : [];
    if (a.role !== 'dm' && moves) {
      for (let i = 1; i < route.length; i++) if (wallBetween(map, route[i - 1], route[i])) throw new BadRequestError("There's a wall in the way.");
    }
    const saved = maps.change(a.cid, map.id, (m) => {
      const t = m.tokens.find((x) => x.id === token.id);
      if (!t) return;
      Object.assign(t, body);
      if (t.kind !== 'pc') t.user_id = null;
      Object.assign(t, snapToken(m, t, t.x, t.y));
      // In a fight, count how far it has moved this turn (difficult terrain costs double).
      const entry = moves && m.combat?.entries.find((e) => e.id === t.id);
      if (entry) entry.moved = (entry.moved ?? 0) + (pathCost(map, route)?.value ?? 0);
    }, { by: request.user.id, reason: moving ? 'token moved' : 'token changed' });
    return { map: maps.view(saved, a), token: saved.tokens.find((t) => t.id === token.id) };
  });

  /**
   * Fill a token's stat block with the AI (DM): { name? } (default: the
   * token's name). Sets its hit points and size too, unless the DM already
   * did. 404 if the AI doesn't know the creature.
   */
  app.post('/campaigns/:cid/maps/:mid/tokens/:tid/stats', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const token = map.tokens.find((t) => t.id === request.params.tid);
    if (!token) throw new NotFoundError('No such token');
    const { name } = z.object({ name: z.string().trim().min(1).max(100).optional() }).parse(request.body ?? {});
    mapAiAllowed(request.user.id);
    const found = await statBlocks.lookup(name ?? token.name, { campaignId: a.cid, userId: request.user.id });
    if (!found) throw new NotFoundError(`The AI doesn't know a creature called "${name ?? token.name}". Try its proper name, like "Goblin" or "Adult Red Dragon".`);
    const saved = maps.change(a.cid, map.id, (m) => {
      const t = m.tokens.find((x) => x.id === token.id);
      if (!t) return;
      t.stats = found.stats;
      if (!t.hp && found.hp) t.hp = { current: found.hp, max: found.hp };
      if (found.size && t.size === 1) Object.assign(t, { size: found.size }, snapToken(m, { size: found.size }, t.x, t.y));
    }, { by: request.user.id, reason: 'stat block' });
    return { map: maps.view(saved, a), token: saved.tokens.find((t) => t.id === token.id) };
  });

  // ---------- initiative (a fight on a map) ----------

  /**
   * A token's initiative modifier: a player character's from their player's
   * sheet (their own number if they typed one), anyone else's Dexterity
   * modifier from their stat block (0 without one).
   */
  const initiativeMod = (cid, token) => {
    if (token.kind === 'pc' && token.user_id != null) {
      const { sheet, version } = sheets.get(cid, token.user_id);
      return version ? (Number(computeSheet(sheet).values.initiative) || 0) : 0;
    }
    return dexModifier(token.stats?.text) ?? 0;
  };
  const d20 = () => crypto.randomInt(1, 21);

  /**
   * The fight on a map: { action, ids?, id?, init? }.
   * DM: start (ids: who's in it, default every token; NPCs and enemies roll
   * straight away), end, next, prev, add (ids), remove (id), roll (id, or
   * every NPC and enemy not rolled yet), set (id, init: a number rolled at
   * the table). A player: roll or set their own token's initiative, and
   * next when it's their own turn (ending it).
   * Rolls are d20 + the token's initiative modifier, by the server.
   * Returns { map, rolls: [{ id, name, d20, mod, total }] }.
   */
  app.post('/campaigns/:cid/maps/:mid/combat', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const body = z
      .object({
        action: z.enum(['start', 'end', 'next', 'prev', 'add', 'remove', 'roll', 'set']),
        ids: z.array(z.string().max(20)).max(MAX_TOKENS).optional(),
        id: z.string().max(20).optional(),
        init: z.number().int().min(-20).max(99).optional(),
      })
      .parse(request.body ?? {});
    const dm = a.role === 'dm';
    const combat = map.combat;
    const token = body.id !== undefined ? (dm ? map.tokens : view.tokens).find((t) => t.id === body.id) : null;
    if (body.id !== undefined && !token) throw new NotFoundError('No such token');
    if (body.action !== 'start' && !combat) throw new BadRequestError("There's no fight on this map. Start one first.");
    if (!dm) {
      const own = token && token.user_id === request.user.id;
      const ownTurn = body.action === 'next' && combat.turn != null && map.tokens.find((t) => t.id === combat.turn)?.user_id === request.user.id;
      if (!((body.action === 'roll' || body.action === 'set') && own) && !ownTurn) {
        throw new AuthError(body.action === 'next' ? "It isn't your turn." : 'Only the DM can do that', 403);
      }
    }
    if ((body.action === 'set' || body.action === 'remove') && !token) throw new BadRequestError('Which token?');
    if (body.action === 'set' && body.init === undefined) throw new BadRequestError('What did they roll?');
    if (token && ['roll', 'set', 'remove'].includes(body.action) && !combat.entries.some((e) => e.id === token.id)) {
      throw new BadRequestError(`${token.name} isn't in the fight.`);
    }
    if ((body.action === 'next' || body.action === 'prev') && !stepTurn(combat, 1)) throw new BadRequestError('Roll initiative first.');
    // Players roll once; the DM can roll again.
    if (!dm && body.action === 'roll' && combat.entries.find((e) => e.id === token.id)?.init != null) throw new BadRequestError('You already rolled initiative.');

    const rolls = [];
    const roll = (m, entry) => {
      const t = m.tokens.find((x) => x.id === entry.id);
      const mod = initiativeMod(a.cid, t);
      const die = d20();
      Object.assign(entry, { init: die + mod, mod });
      rolls.push({ id: t.id, name: t.name, d20: die, mod, total: die + mod });
    };
    const reasons = { start: 'fight started', end: 'fight ended', next: 'next turn', prev: 'previous turn' };
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.action === 'start') {
        const ids = new Set(body.ids ?? m.tokens.map((t) => t.id));
        m.combat = { round: 1, turn: null, entries: m.tokens.filter((t) => ids.has(t.id)).map((t) => ({ id: t.id, init: null, mod: null })) };
        for (const e of m.combat.entries) if (m.tokens.find((t) => t.id === e.id).kind !== 'pc') roll(m, e);
      } else if (body.action === 'end') {
        m.combat = null;
      } else if (body.action === 'next' || body.action === 'prev') {
        Object.assign(m.combat, stepTurn(m.combat, body.action === 'next' ? 1 : -1));
        // A new turn: its token hasn't moved yet.
        if (body.action === 'next') for (const e of m.combat.entries) if (e.id === m.combat.turn) e.moved = 0;
      } else if (body.action === 'add') {
        for (const id of body.ids ?? []) {
          if (m.tokens.some((t) => t.id === id) && !m.combat.entries.some((e) => e.id === id)) m.combat.entries.push({ id, init: null, mod: null });
        }
      } else if (body.action === 'remove') {
        if (m.combat.turn === token.id) Object.assign(m.combat, stepTurn(m.combat, 1));
        m.combat.entries = m.combat.entries.filter((e) => e.id !== token.id);
      } else if (body.action === 'roll') {
        const kindOf = (e) => m.tokens.find((t) => t.id === e.id)?.kind;
        const which = token ? m.combat.entries.filter((e) => e.id === token.id) : m.combat.entries.filter((e) => e.init == null && kindOf(e) !== 'pc');
        for (const e of which) roll(m, e);
      } else if (body.action === 'set') {
        Object.assign(m.combat.entries.find((e) => e.id === token.id), { init: body.init, mod: initiativeMod(a.cid, token) });
      }
    }, { by: request.user.id, reason: reasons[body.action] ?? 'initiative' });
    return { map: maps.view(saved, a), rolls };
  });

  // ---------- spell templates (areas of effect anyone can place) ----------

  const TEMPLATE = z.object({
    shape: z.enum(TEMPLATE_SHAPES),
    x: z.number(),
    y: z.number(),
    angle: z.number().min(-1e6).max(1e6),
    size: z.number().positive().max(10_000),
    width: z.number().positive().max(10_000).nullable(),
    label: z.string().trim().max(80),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour like #e8743b'),
  });

  /** A template this viewer may change: their own, or any (DM). */
  const ownTemplate = (request, a) => {
    const { map, view } = viewableMap(request);
    const tpl = view.templates.find((t) => t.id === request.params.tid);
    if (!tpl) throw new NotFoundError('No such template');
    if (a.role !== 'dm' && tpl.user_id !== request.user.id) throw new AuthError('Only whoever placed it (or the DM) can change that', 403);
    return { map, tpl };
  };

  /** Place an area of effect (anyone who can see the map): { shape, x, y, angle?, size, width?, label?, color? }. */
  app.post('/campaigns/:cid/maps/:mid/templates', async (request, reply) => {
    const a = access(request);
    const { map } = viewableMap(request);
    const body = TEMPLATE.partial().required({ shape: true, x: true, y: true, size: true }).parse(request.body ?? {});
    if (map.templates.length >= MAX_TEMPLATES) throw new BadRequestError(`A map can have at most ${MAX_TEMPLATES} templates. Remove some first.`);
    const id = newTokenId();
    const saved = maps.change(a.cid, map.id, (m) => {
      m.templates.push({ ...body, id, user_id: request.user.id });
    }, { by: request.user.id, reason: 'template' });
    reply.status(201);
    return { map: maps.view(saved, a), template: saved.templates.find((t) => t.id === id) };
  });

  /** Move, turn, resize or relabel a template (whoever placed it, or the DM). */
  app.patch('/campaigns/:cid/maps/:mid/templates/:tid', async (request) => {
    const a = access(request);
    const { map, tpl } = ownTemplate(request, a);
    const body = TEMPLATE.partial().parse(request.body ?? {});
    const saved = maps.change(a.cid, map.id, (m) => {
      Object.assign(m.templates.find((t) => t.id === tpl.id) ?? {}, body);
    }, { by: request.user.id, reason: 'template' });
    return { map: maps.view(saved, a), template: saved.templates.find((t) => t.id === tpl.id) };
  });

  /** Remove a template (whoever placed it, or the DM). */
  app.delete('/campaigns/:cid/maps/:mid/templates/:tid', async (request) => {
    const a = access(request);
    const { map, tpl } = ownTemplate(request, a);
    const saved = maps.change(a.cid, map.id, (m) => {
      m.templates = m.templates.filter((t) => t.id !== tpl.id);
    }, { by: request.user.id, reason: 'template removed' });
    return { map: maps.view(saved, a) };
  });

  // Private pins: each person's own marks on a map. Only they ever see them (not even the DM).
  const PIN = z.object({ x: z.number(), y: z.number(), label: z.string().trim().max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour like #d9a400') });

  /** Your own pins on a map: { pins }. */
  app.get('/campaigns/:cid/maps/:mid/pins', async (request) => {
    const { cid, map } = viewableMap(request);
    return { pins: maps.pins(cid, map.id, request.user.id) };
  });

  /** Add a pin: { x, y, label?, color? }. */
  app.post('/campaigns/:cid/maps/:mid/pins', async (request, reply) => {
    const { cid, map } = viewableMap(request);
    const body = PIN.partial().required({ x: true, y: true }).parse(request.body ?? {});
    if (maps.pins(cid, map.id, request.user.id).length >= MAX_PINS) throw new BadRequestError(`You can have at most ${MAX_PINS} pins on a map.`);
    const id = newTokenId();
    const pins = maps.changePins(cid, map.id, request.user.id, (list) => list.push({ ...body, id }));
    reply.status(201);
    return { pins, pin: pins.find((p) => p.id === id) };
  });

  /** Move or relabel one of your pins: { x?, y?, label?, color? }. */
  app.patch('/campaigns/:cid/maps/:mid/pins/:pid', async (request) => {
    const { cid, map } = viewableMap(request);
    const body = PIN.partial().parse(request.body ?? {});
    if (!maps.pins(cid, map.id, request.user.id).some((p) => p.id === request.params.pid)) throw new NotFoundError('No such pin');
    const pins = maps.changePins(cid, map.id, request.user.id, (list) => Object.assign(list.find((p) => p.id === request.params.pid), body));
    return { pins, pin: pins.find((p) => p.id === request.params.pid) };
  });

  /** Remove one of your pins. */
  app.delete('/campaigns/:cid/maps/:mid/pins/:pid', async (request) => {
    const { cid, map } = viewableMap(request);
    if (!maps.pins(cid, map.id, request.user.id).some((p) => p.id === request.params.pid)) throw new NotFoundError('No such pin');
    return { pins: maps.changePins(cid, map.id, request.user.id, (list) => list.splice(list.findIndex((p) => p.id === request.params.pid), 1)) };
  });

  /** Remove a token (DM). */
  // NPC and enemy token pictures, cut to a square around what stands out (like players' token pictures).
  const tokenArtCache = new Map();
  const TOKEN_ART_PX = 256;

  /**
   * Give an NPC or enemy token a picture (DM): { filename, data (base64),
   * same_name?: true to give it to every token on this map with the same name
   * (a pack of goblins) }. The file is archived as uploaded.
   */
  app.put('/campaigns/:cid/maps/:mid/tokens/:tid/picture', { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) }, async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const token = map.tokens.find((t) => t.id === request.params.tid);
    if (!token) throw new NotFoundError('No such token');
    if (token.kind === 'pc') throw new BadRequestError("A player character's token shows the picture its player chose on their sheet.");
    const body = z.object({ filename: z.string().max(200).default(''), data: z.string().min(1), same_name: z.boolean().default(false) }).parse(request.body);
    const buf = Buffer.from(body.data, 'base64');
    const meta = await inspectPicture(buf);
    const file = `token-${crypto.randomBytes(5).toString('hex')}.${meta.ext}`;
    archive.saveTokenImage(a.campaign.slug, map.id, file, buf);
    const saved = maps.change(a.cid, map.id, (m) => {
      for (const t of m.tokens) {
        if (t.kind !== 'pc' && (t.id === token.id || (body.same_name && t.name.toLowerCase() === token.name.toLowerCase()))) t.art = { file, type: meta.type };
      }
    }, { by: request.user.id, reason: 'token picture' });
    return { map: maps.view(saved, a) };
  });

  /** Stop using a token's picture (DM). The archive keeps the file. */
  app.delete('/campaigns/:cid/maps/:mid/tokens/:tid/picture', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (!map.tokens.some((t) => t.id === request.params.tid)) throw new NotFoundError('No such token');
    const saved = maps.change(a.cid, map.id, (m) => {
      const t = m.tokens.find((x) => x.id === request.params.tid);
      if (t) t.art = null;
    }, { by: request.user.id, reason: 'token picture removed' });
    return { map: maps.view(saved, a) };
  });

  /** An NPC's or enemy's token picture, for whoever can see that token. ?v= is its key. */
  app.get('/campaigns/:cid/maps/:mid/tokens/:tid/picture', async (request, reply) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const token = map.tokens.find((t) => t.id === request.params.tid);
    if (!token?.art || !view.tokens.some((t) => t.id === token.id)) throw new NotFoundError('No token picture');
    const file = archive.tokenImagePath(a.campaign.slug, map.id, token.art.file);
    if (!tokenArtCache.has(file)) {
      tokenArtCache.set(file, await sharp(file).rotate().resize({ width: TOKEN_ART_PX, height: TOKEN_ART_PX, fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 88 }).toBuffer());
      if (tokenArtCache.size > 64) tokenArtCache.delete(tokenArtCache.keys().next().value);
    }
    return reply.type('image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(tokenArtCache.get(file));
  });

  app.delete('/campaigns/:cid/maps/:mid/tokens/:tid', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (!map.tokens.some((t) => t.id === request.params.tid)) throw new NotFoundError('No such token');
    const saved = maps.change(a.cid, map.id, (m) => {
      // In a fight, removing whoever's turn it is passes the turn on.
      if (m.combat?.turn === request.params.tid) Object.assign(m.combat, stepTurn(m.combat, 1));
      m.tokens = m.tokens.filter((t) => t.id !== request.params.tid);
    }, { by: request.user.id, reason: 'token removed' });
    return { map: maps.view(saved, a) };
  });

  // ---------- the DM's creatures (saved enemies and NPCs, placed on maps as tokens) ----------

  const CREATURE = z.object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(CREATURE_KINDS),
    size: z.number().refine((n) => TOKEN_SIZES.includes(n), 'must be 0.5, 1, 2, 3 or 4'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour like #b33a3a'),
    hp_max: z.number().int().positive().max(100_000).nullable(),
    darkvision: z.number().min(0).max(10_000),
    speed: z.number().min(0).max(10_000).nullable(),
    stats: z.object({ text: z.string().max(8000), name: z.string().max(100).optional(), ac: z.number().int().nullable().optional(), hp_formula: z.string().max(40).optional(), speed: z.string().max(120).optional(), challenge: z.string().max(40).optional() }).nullable(),
    record: z.object({ id: z.number().int().positive(), title: z.string().max(200).optional() }).nullable(),
    notes: z.string().max(MAX_CREATURE_NOTES),
  });
  const PICTURE_UPLOAD = z.object({ filename: z.string().max(200).default(''), data: z.string().min(1) });
  const creatureBody = { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) + 64 * 1024 };
  // A typed stat block is the DM's own.
  const ownStats = (body) => {
    if (body.stats === undefined) return;
    body.stats = body.stats?.text.trim() ? { ...body.stats, source: 'dm' } : null;
  };

  /** The DM's creatures, by name. Players never get them. */
  app.get('/campaigns/:cid/creatures', async (request) => {
    const a = access(request, { dm: true });
    return { creatures: creatures.list(a.cid).map(creatures.view) };
  });

  /**
   * Save a creature (DM): { name, kind, size?, color?, hp_max?, darkvision?,
   * speed?, stats?, record?, notes?, picture?: { filename, data (base64) } },
   * or { from: { map_id, token_id } } to save a token already on a map, with
   * its picture and stat block ("Goblin 3" is saved as "Goblin").
   */
  app.post('/campaigns/:cid/creatures', creatureBody, async (request, reply) => {
    const a = access(request, { dm: true });
    const { from, picture, ...rest } = z.object({ from: z.object({ map_id: z.string(), token_id: z.string() }).optional(), picture: PICTURE_UPLOAD.optional() }).passthrough().parse(request.body ?? {});
    let fields;
    let art = null;
    if (from) {
      if (!isMapId(from.map_id)) throw new NotFoundError('No such map');
      const map = maps.get(a.cid, from.map_id);
      const t = map.tokens.find((x) => x.id === from.token_id);
      if (!t) throw new NotFoundError('No such token');
      if (t.kind === 'pc') throw new BadRequestError("A player's character can't be saved as a creature.");
      fields = { name: t.name.replace(/ \d+$/, '') || t.name, kind: t.kind, size: t.size, color: t.color, hp_max: t.hp?.max ?? null, darkvision: t.darkvision ?? 0, speed: t.speed ?? null, stats: t.stats ?? null, record: t.record ?? null };
      if (t.art) art = { buf: fs.readFileSync(archive.tokenImagePath(a.campaign.slug, map.id, t.art.file)) };
    } else {
      fields = CREATURE.partial().required({ name: true, kind: true }).parse(rest);
      ownStats(fields);
      linkRecord(a.cid, fields);
      if (picture) art = { buf: Buffer.from(picture.data, 'base64') };
    }
    let c = creatures.create(a.cid, fields, { by: request.user.id });
    if (art) c = creatures.update(a.cid, c.id, { art: await creatures.savePicture(a.cid, c.id, art.buf) });
    reply.status(201);
    return creatures.view(c);
  });

  /** Change a creature (DM): any of the fields above. Tokens already placed keep what they had. */
  app.patch('/campaigns/:cid/creatures/:crid', async (request) => {
    const a = access(request, { dm: true });
    creatures.get(a.cid, request.params.crid);
    const body = CREATURE.partial().parse(request.body ?? {});
    ownStats(body);
    linkRecord(a.cid, body);
    return creatures.view(creatures.update(a.cid, request.params.crid, body));
  });

  /** Take a creature out of the library (DM). Its tokens stay on the maps; the archive keeps it. */
  app.delete('/campaigns/:cid/creatures/:crid', async (request) => {
    const a = access(request, { dm: true });
    creatures.remove(a.cid, request.params.crid);
    return { ok: true };
  });

  /** Give a creature a picture (DM): { filename, data (base64) }. Kept as uploaded. */
  app.put('/campaigns/:cid/creatures/:crid/picture', creatureBody, async (request) => {
    const a = access(request, { dm: true });
    const c = creatures.get(a.cid, request.params.crid);
    const body = PICTURE_UPLOAD.parse(request.body ?? {});
    return creatures.view(creatures.update(a.cid, c.id, { art: await creatures.savePicture(a.cid, c.id, Buffer.from(body.data, 'base64')) }));
  });

  /** Go back to initials (DM). The archive keeps the file. */
  app.delete('/campaigns/:cid/creatures/:crid/picture', async (request) => {
    const a = access(request, { dm: true });
    return creatures.view(creatures.update(a.cid, request.params.crid, { art: null }));
  });

  /** A creature's picture, cut to a square like token pictures (DM). ?v= is its key. */
  app.get('/campaigns/:cid/creatures/:crid/picture', async (request, reply) => {
    const a = access(request, { dm: true });
    const c = creatures.get(a.cid, request.params.crid);
    if (!c.art) throw new NotFoundError('No picture');
    const file = creatures.picturePath(a.cid, c);
    if (!tokenArtCache.has(file)) {
      tokenArtCache.set(file, await sharp(file).rotate().resize({ width: TOKEN_ART_PX, height: TOKEN_ART_PX, fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 88 }).toBuffer());
      if (tokenArtCache.size > 64) tokenArtCache.delete(tokenArtCache.keys().next().value);
    }
    return reply.type('image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(tokenArtCache.get(file));
  });

  /**
   * Fill a creature's stat block with the AI (DM): { name? } (default: its
   * name). Sets its hit points and size too, unless the DM already did.
   * 404 if the AI doesn't know the creature.
   */
  app.post('/campaigns/:cid/creatures/:crid/stats', async (request) => {
    const a = access(request, { dm: true });
    const c = creatures.get(a.cid, request.params.crid);
    const { name } = z.object({ name: z.string().trim().min(1).max(100).optional() }).parse(request.body ?? {});
    mapAiAllowed(request.user.id);
    const found = await statBlocks.lookup(name ?? c.name, { campaignId: a.cid, userId: request.user.id });
    if (!found) throw new NotFoundError(`The AI doesn't know a creature called "${name ?? c.name}". Try its proper name, like "Goblin" or "Adult Red Dragon".`);
    const fields = { stats: found.stats };
    if (!c.hp_max && found.hp) fields.hp_max = found.hp;
    if (found.size && c.size === 1) fields.size = found.size;
    return creatures.view(creatures.update(a.cid, c.id, fields));
  });

  /**
   * Have the AI find a creature online (DM): { query }, e.g. "Hollow Knight
   * from the Grimhollow book" or "a crystal golem". Official or not; it
   * searches the web, writes up the stat block and brings a picture. Runs in
   * the background: the creature is listed at once with finding.status
   * 'pending', then filled in (or 'failed', with an error). 202.
   */
  app.post('/campaigns/:cid/creatures/find', async (request, reply) => {
    const a = access(request, { dm: true });
    const { query } = z.object({ query: z.string().trim().min(2).max(200) }).parse(request.body ?? {});
    mapAiAllowed(request.user.id);
    const c = creatures.create(a.cid, { name: query.slice(0, 80), kind: 'enemy', finding: { query, status: 'pending' } }, { by: request.user.id });
    const fail = (error) => {
      try {
        creatures.update(a.cid, c.id, { finding: { query, status: 'failed', error } });
      } catch { /* removed meanwhile */ }
    };
    (async () => {
      try {
        const found = await creatureFinder.find(query, { campaignId: a.cid, userId: request.user.id });
        if (!found) return fail(`The AI couldn't find "${query}" anywhere. Try another name, or add where it's from.`);
        creatures.get(a.cid, c.id); // still wanted?
        const art = found.picture ? await creatures.savePicture(a.cid, c.id, found.picture) : null;
        creatures.update(a.cid, c.id, { ...found.fields, art, finding: null });
      } catch (err) {
        if (err instanceof NotFoundError) return;
        request.log.error(err);
        fail(`The search went wrong: ${err.message}`);
      }
    })();
    reply.status(202);
    return creatures.view(c);
  });

  /**
   * Put a creature on a map (DM): { count? (1-20), x?, y?, hidden?, name? }.
   * Each token gets its picture, stat block, hit points and the rest; a group
   * is numbered ("Goblin 1".."Goblin 4", carrying on from any already there)
   * and set out in a row from (x, y), the middle of the map by default.
   */
  app.post('/campaigns/:cid/maps/:mid/creatures/:crid', async (request, reply) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const c = creatures.get(a.cid, request.params.crid);
    if (c.finding) throw new BadRequestError(c.finding.status === 'pending' ? 'The AI is still looking for that one.' : "The AI didn't find that one.");
    const body = z.object({ count: z.number().int().min(1).max(20).default(1), x: z.number().optional(), y: z.number().optional(), hidden: z.boolean().default(false), name: z.string().trim().min(1).max(80).optional() }).parse(request.body ?? {});
    if (map.tokens.length + body.count > MAX_TOKENS) throw new BadRequestError(`A map can have at most ${MAX_TOKENS} tokens.`);
    // The picture goes with the map's own token pictures (once per map), so the map stays whole on its own.
    if (c.art) {
      const dest = archive.tokenImagePath(a.campaign.slug, map.id, c.art.file);
      if (!fs.existsSync(dest)) archive.saveTokenImage(a.campaign.slug, map.id, c.art.file, fs.readFileSync(creatures.picturePath(a.cid, c)));
    }
    const ids = [];
    const saved = maps.change(a.cid, map.id, (m) => {
      const names = tokenNames(body.name ?? c.name, body.count, m.tokens.map((t) => t.name));
      const step = squarePx(m) * Math.max(1, c.size);
      const x0 = body.x ?? m.image.width / 2;
      const y0 = body.y ?? m.image.height / 2;
      names.forEach((name, i) => {
        const id = newTokenId();
        ids.push(id);
        const token = {
          id, kind: c.kind, name, user_id: null, color: c.color, size: c.size,
          hp: c.hp_max ? { current: c.hp_max, max: c.hp_max } : null,
          conditions: [], hidden: body.hidden, record: c.record, stats: c.stats, light: null,
          darkvision: c.darkvision, speed: c.speed, art: c.art ? { ...c.art } : null,
        };
        Object.assign(token, snapToken(m, token, x0 + (i - (names.length - 1) / 2) * step, y0));
        m.tokens.push(token);
      });
    }, { by: request.user.id, reason: 'token added' });
    reply.status(201);
    const view = maps.view(saved, a);
    return { map: view, tokens: view.tokens.filter((t) => ids.includes(t.id)) };
  });

  // ---------- corrections & archivist questions (DM) ----------

  /** A correction in plain words. The archivist applies it in the background. */
  app.post('/campaigns/:cid/corrections', async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const { text } = z.object({ text: z.string().trim().min(1).max(10_000) }).parse(request.body);
    const correction = store.addCorrection(cid, { text, created_by: request.user.id });
    const job = jobs.enqueueCorrection(cid, correction.id);
    reply.status(201);
    return { correction, job };
  });

  app.get('/campaigns/:cid/corrections', async (request) => store.getCorrections(access(request, { dm: true }).cid));

  /** Questions the archivist left about conflicts it couldn't resolve. */
  app.get('/campaigns/:cid/questions', async (request) => {
    const { cid } = access(request, { dm: true });
    const { status } = z.object({ status: z.enum(['open', 'answered', 'dismissed']).optional() }).parse(request.query);
    return db
      .prepare('SELECT * FROM dm_questions WHERE campaign_id = @cid AND (@status IS NULL OR status = @status) ORDER BY id')
      .all({ cid, status: status ?? null });
  });

  /** Answering a question turns the answer into a correction. */
  app.post('/campaigns/:cid/questions/:qid/answer', async (request) => {
    const { cid } = access(request, { dm: true });
    const q = db.prepare('SELECT * FROM dm_questions WHERE id = ? AND campaign_id = ?').get(Number(request.params.qid), cid);
    if (!q) throw new NotFoundError('Question not found');
    const { answer } = z.object({ answer: z.string().trim().min(1).max(10_000) }).parse(request.body);
    const correction = store.addCorrection(cid, {
      text: `You asked: ${q.question}\nContext you gave: ${q.context}\nThe DM's answer: ${answer}`,
      created_by: request.user.id,
    });
    db.prepare("UPDATE dm_questions SET status = 'answered', answer = ? WHERE id = ?").run(answer, q.id);
    return { correction, job: jobs.enqueueCorrection(cid, correction.id) };
  });

  app.post('/campaigns/:cid/questions/:qid/dismiss', async (request) => {
    const { cid } = access(request, { dm: true });
    const { changes } = db.prepare("UPDATE dm_questions SET status = 'dismissed' WHERE id = ? AND campaign_id = ?").run(Number(request.params.qid), cid);
    if (!changes) throw new NotFoundError('Question not found');
    return { dismissed: Number(request.params.qid) };
  });

  /** Raw knowledge base, for debugging (DM). Not meant for regular reading. */
  app.get('/campaigns/:cid/kb', async (request) => kb.dump(access(request, { dm: true }).cid));

  // ---------- jobs ----------

  app.get('/campaigns/:cid/jobs', async (request) => {
    const { cid, role } = access(request);
    return jobs.list(cid).map((j) => forViewer(role, j));
  });

  /** Live job progress (SSE). Sends the current state of recent jobs, then updates. */
  app.get('/campaigns/:cid/jobs/events', async (request, reply) => {
    const { cid, role, userId } = access(request);
    const { sse, current } = openLiveStream(request, reply, { cid, role, userId });
    for (const j of jobs.list(cid, 5).reverse()) sse.send('job', forViewer(role, j));
    const listener = (job) => {
      if (job.campaign_id !== cid) return;
      const now = current();
      if (!now) return sse.end();
      sse.send('job', forViewer(now.role, job));
    };
    jobs.events.on('update', listener);
    sse.onClose(() => jobs.events.off('update', listener));
  });

  /** Wipe all generated data and replay every session and correction (DM). */
  app.post('/campaigns/:cid/rebuild', async (request) => jobs.enqueueRebuild(access(request, { dm: true }).cid));

  // ---------- Q&A ----------

  /**
   * Ask a question. Streams SSE events:
   *   conversation {conversationId} | turn {turn} | tool {name, input} | text {delta}
   *   | done {answer, evidence, ...} | error {error}
   * Text from a turn that ends in tool calls is the model thinking aloud;
   * clients should replace (not append to) displayed text on each "turn".
   */
  app.post('/campaigns/:cid/ask', async (request, reply) => {
    const { cid } = access(request);
    const body = z
      .object({ question: z.string().min(1).max(2000), conversationId: z.number().int().optional() })
      .parse(request.body);
    const sse = openSse(request, reply);
    try {
      await qa.ask({
        campaignId: cid,
        userId: request.user.id,
        question: body.question,
        conversationId: body.conversationId,
        emit: (e) => sse.send(e.type, e),
      });
    } catch (err) {
      request.log.warn(err);
      sse.send('error', { error: publicMessage(err) });
    } finally {
      sse.end();
    }
  });

  // A player's own conversations. Pinned ones first, then newest (by last question).
  app.get('/campaigns/:cid/conversations', async (request) => {
    const { cid } = access(request);
    return db
      .prepare(
        `SELECT c.id, c.title, c.pinned, c.created_at, COALESCE(MAX(q.created_at), c.created_at) AS updated_at
         FROM conversations c LEFT JOIN qa_log q ON q.conversation_id = c.id
         WHERE c.campaign_id = ? AND c.user_id = ? AND c.deleted_at IS NULL
         GROUP BY c.id ORDER BY c.pinned DESC, updated_at DESC, c.id DESC`,
      )
      .all(cid, request.user.id)
      .map((c) => ({ ...c, pinned: !!c.pinned }));
  });

  const ownConversation = (request, cid) => {
    const conv = db
      .prepare('SELECT * FROM conversations WHERE id = ? AND campaign_id = ? AND user_id = ? AND deleted_at IS NULL')
      .get(Number(request.params.id), cid, request.user.id);
    if (!conv) throw new NotFoundError('Conversation not found');
    return conv;
  };

  app.get('/campaigns/:cid/conversations/:id', async (request) => {
    const { cid } = access(request);
    const conv = ownConversation(request, cid);
    const turns = db
      .prepare("SELECT id, question, answer, evidence, created_at FROM qa_log WHERE conversation_id = ? AND status = 'ok' ORDER BY id")
      .all(conv.id)
      .map((t) => ({ ...t, evidence: JSON.parse(t.evidence) }));
    return { ...conv, pinned: !!conv.pinned, deleted_at: undefined, turns };
  });

  app.patch('/campaigns/:cid/conversations/:id', async (request) => {
    const { cid } = access(request);
    const conv = ownConversation(request, cid);
    const body = z.object({ pinned: z.boolean().optional(), title: z.string().trim().min(1).max(80).optional() }).parse(request.body ?? {});
    db.prepare('UPDATE conversations SET pinned = COALESCE(?, pinned), title = COALESCE(?, title) WHERE id = ?').run(
      body.pinned === undefined ? null : Number(body.pinned),
      body.title ?? null,
      conv.id,
    );
    const row = db.prepare('SELECT id, title, pinned, created_at FROM conversations WHERE id = ?').get(conv.id);
    return { ...row, pinned: !!row.pinned };
  });

  // Deleting erases the questions and answers for good. The bare rows stay, so the hourly
  // question limit and usage figures still count them (otherwise deleting would reset the limit).
  app.delete('/campaigns/:cid/conversations/:id', async (request) => {
    const { cid } = access(request);
    const conv = ownConversation(request, cid);
    db.transaction(() => {
      db.prepare("UPDATE qa_log SET question = '', answer = NULL, evidence = '[]', tool_calls = '[]' WHERE conversation_id = ?").run(conv.id);
      db.prepare("UPDATE conversations SET title = NULL, pinned = 0, deleted_at = datetime('now') WHERE id = ?").run(conv.id);
    })();
    return { ok: true };
  });

  // ---------- usage (DM) ----------

  app.get('/campaigns/:cid/usage', async (request) => {
    const { cid } = access(request, { dm: true });
    return {
      provider: config.llm.provider,
      // Real spend on the API. Claude Code usage is on the subscription and not counted here.
      apiSpendThisMonthUsd: db
        .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM llm_usage WHERE provider = 'api' AND created_at >= datetime('now', 'start of month')")
        .get().c,
      monthlyCapUsd: config.monthlySpendCapUsd,
      byPurpose: db
        .prepare(
          `SELECT provider, CASE WHEN purpose = 'qa' THEN 'qa' ELSE substr(purpose, 1, instr(purpose || ':', ':') - 1) END AS purpose,
             COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
             SUM(cost_usd) AS est_cost_usd, ROUND(AVG(duration_ms)) AS avg_ms FROM llm_usage
           WHERE campaign_id = ? AND created_at >= datetime('now', 'start of month') GROUP BY 1, 2 ORDER BY est_cost_usd DESC`,
        )
        .all(cid),
      questions: db
        .prepare(
          `SELECT COUNT(*) AS asked, ROUND(AVG(q.duration_ms)) AS avg_ms, ROUND(AVG(q.first_text_ms)) AS avg_first_text_ms,
             MAX(q.duration_ms) AS max_ms
           FROM qa_log q JOIN conversations c ON c.id = q.conversation_id
           WHERE c.campaign_id = ? AND q.status = 'ok' AND q.created_at >= datetime('now', 'start of month')`,
        )
        .get(cid),
    };
  });

  serveWebPage(app, config.webDir);

  return app;
}
