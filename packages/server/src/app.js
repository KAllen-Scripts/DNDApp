/**
 * HTTP API. Clients only display what these endpoints return and send what
 * players type; all processing happens on this server.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { SHEET_FORMAT } from '@dndapp/shared/sheet.js';
import { parseRoll, rollDice, ROLL_MODES } from '@dndapp/shared/dice.js';

/** Open a Server-Sent Events stream on a request. */
function openSse(request, reply) {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 20_000);
  let closed = false;
  const onClose = [];
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
    end() {
      clearInterval(keepAlive);
      if (!closed) reply.raw.end();
    },
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
  // show automatic values as players type), dice notation, markdown + HTML sanitising for answers, and the 3D
  // dice (Three.js and the physics are bundled into that one file).
  const modules = {
    '/shared/sheet.js': '@dndapp/shared/sheet.js',
    '/shared/dice.js': '@dndapp/shared/dice.js',
    '/vendor/marked.js': 'marked',
    '/vendor/purify.js': 'dompurify',
    '/vendor/dice/dice-box.js': '@3d-dice/dice-box-threejs',
  };
  const sendFile = (file, type) => async (request, reply) =>
    reply.type(type).header('Cache-Control', 'no-cache').header('X-Content-Type-Options', 'nosniff').send(fs.readFileSync(file));
  for (const [url, spec] of Object.entries(modules)) {
    app.get(url, { config: { public: true } }, sendFile(fileURLToPath(import.meta.resolve(spec)), CONTENT_TYPES['.js']));
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

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-03');

export function buildApp({ db, store, auth, jobs, pipeline, qa, kb, search, sheets, sheetImport, spells, archive, config, logger = true }) {
  const app = Fastify({ logger, bodyLimit: config.maxUploadBytes });

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
    const message = err instanceof ZodError ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : err.message;
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
    return { campaign, role, cid, membership };
  }

  const attended = (sessionId, userId) =>
    !!db.prepare('SELECT 1 FROM attendance WHERE session_id = ? AND user_id = ?').get(sessionId, userId) ||
    !db.prepare('SELECT 1 FROM attendance WHERE session_id = ?').get(sessionId);

  // ---------- general ----------

  app.get('/health', { config: { public: true } }, async () => ({ ok: true }));

  /** Log in with the name and password the admin set. Returns a token for the Authorization header. */
  app.post('/login', { config: { public: true } }, async (request) => {
    const { name, password } = z.object({ name: z.string().min(1).max(100), password: z.string().min(1).max(200) }).parse(request.body);
    return auth.login(name, password);
  });

  app.post('/logout', { config: { public: true } }, async (request) => {
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
        .prepare('SELECT session_date AS date, COUNT(*) AS notes, COUNT(DISTINCT user_id) AS authors FROM player_notes WHERE campaign_id = ? GROUP BY session_date')
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
      .map(({ id, ...s }) => ({ ...s, attended: role === 'dm' || attended(id, request.user.id) }));
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
  app.post('/campaigns/:cid/sessions/preview', async (request) => {
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

  app.post('/campaigns/:cid/sessions', async (request, reply) => {
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
    return { session, attendees, attended: role === 'dm' || attended(session.id, request.user.id) };
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
    reply.status(201);
    return note;
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
  app.post('/campaigns/:cid/sheet/import', async (request) => {
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

  // ---------- dice ----------

  /**
   * Roll dice: { notation: "1d20+5", mode: normal | advantage | disadvantage }.
   * The server decides every roll (a secure random number); the page only
   * animates the dice landing on these numbers. Rolls aren't saved.
   */
  app.post('/campaigns/:cid/roll', async (request) => {
    access(request);
    const { notation, mode } = z
      .object({ notation: z.string().max(100), mode: z.enum(ROLL_MODES).default('normal') })
      .parse(request.body);
    let parsed;
    try {
      parsed = parseRoll(notation);
    } catch (err) {
      throw new BadRequestError(err.message);
    }
    return rollDice(parsed, { mode, random: (sides) => crypto.randomInt(1, sides + 1) });
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

  app.get('/campaigns/:cid/jobs', async (request) => jobs.list(access(request).cid));

  /** Live job progress (SSE). Sends the current state of recent jobs, then updates. */
  app.get('/campaigns/:cid/jobs/events', async (request, reply) => {
    const { cid } = access(request);
    const sse = openSse(request, reply);
    for (const j of jobs.list(cid, 5).reverse()) sse.send('job', j);
    const listener = (job) => job.campaign_id === cid && sse.send('job', job);
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
      sse.send('error', { error: err.message });
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
