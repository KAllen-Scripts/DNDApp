/**
 * HTTP API. Clients only display what these endpoints return and send what
 * players type; all processing happens on this server.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';
import { AuthError } from './auth.js';
import { NotFoundError, BadRequestError } from './store.js';
import { ArchiveConflictError } from './archive.js';
import { SpendingCapError } from './llm/index.js';
import { RateLimitError } from './qa/agent.js';
import { SheetConflictError } from './sheets/store.js';
import { registerAccounts } from './routes/accounts.js';
import { registerCampaign } from './routes/campaign.js';
import { registerCharacters } from './routes/characters.js';
import { registerTable } from './routes/table.js';
import { registerMaps } from './routes/maps.js';
import { registerCombat } from './routes/combat.js';
import { registerCreatures } from './routes/creatures.js';
import { registerItems } from './routes/items.js';
import { registerMerchants } from './routes/merchants.js';
import { registerRests } from './routes/rests.js';

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
  // show automatic values as players type), dice notation, map geometry (snapping and measuring while dragging),
  // the citation format, markdown + HTML sanitising, and the 3D dice (Three.js and the physics are bundled into that one file).
  const modules = {
    '/shared/sheet.js': '@dndapp/shared/sheet.js',
    '/shared/citations.js': '@dndapp/shared/citations.js',
    '/shared/dice.js': '@dndapp/shared/dice.js',
    '/shared/rolls.js': '@dndapp/shared/rolls.js',
    '/shared/gear.js': '@dndapp/shared/gear.js',
    '/shared/map.js': '@dndapp/shared/map.js',
    '/shared/coins.js': '@dndapp/shared/coins.js',
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

export function buildApp({ db, store, auth, jobs, pipeline, qa, kb, search, sheets, sheetImport, spells, maps, mapReader, statBlocks, creatureFinder, pictures, pictureDescriber, handouts, creatures, rolls, rests, items, itemFinder, merchants, archive, config, logger = true }) {
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

  // The routes, by part of the app (routes/). Each takes what it needs from r and adds what later ones use.
  const r = { db, store, auth, jobs, pipeline, qa, kb, search, sheets, sheetImport, spells, maps, mapReader, statBlocks, creatureFinder, pictures, pictureDescriber, handouts, creatures, rolls, rests, items, itemFinder, merchants, archive, config, upload, requireAdmin, access, openLiveStream, forViewer, attended, openSse, publicMessage, DATE };
  registerAccounts(app, r);
  registerCampaign(app, r);
  registerCharacters(app, r);
  registerTable(app, r);
  registerMaps(app, r);
  registerCombat(app, r);
  registerCreatures(app, r);
  registerItems(app, r);
  registerMerchants(app, r);
  registerRests(app, r);

  serveWebPage(app, config.webDir);

  return app;
}
