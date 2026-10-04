/**
 * HTTP API. Clients only display what these endpoints return and send what
 * players type; all processing happens on this server.
 */
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';
import { formatTimestamp, parseTimestamp, parseTranscript, formatUtterance } from '@dndapp/shared';
import { AuthError } from './auth.js';
import { NotFoundError, BadRequestError } from './store.js';
import { ArchiveConflictError } from './archive.js';
import { SpendingCapError } from './llm/index.js';
import { RateLimitError } from './qa/agent.js';
import { preparedTranscript } from './pipeline/prepare.js';

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
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-03');

export function buildApp({ db, store, auth, jobs, pipeline, qa, kb, search, config, logger = true }) {
  const app = Fastify({ logger, bodyLimit: config.maxUploadBytes });

  app.setErrorHandler((err, request, reply) => {
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
  app.post('/campaigns/:cid/sessions', async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const isText = typeof request.body === 'string';
    const meta = z
      .object({
        number: z.coerce.number().int().positive(),
        played_on: DATE,
        title: z.string().max(200).nullish(),
        transcript: z.string().min(1).optional(),
      })
      .parse(isText ? request.query : request.body);
    const transcript = isText ? request.body : meta.transcript;
    if (!transcript) throw new BadRequestError('transcript is required');

    const { utterances } = parseTranscript(transcript);
    if (!utterances.length) throw new BadRequestError('No lines in the expected "[HH:MM:SS] Speaker: text" format were found.');

    const { session, alreadyArchived } = store.addSession(cid, meta, Buffer.from(transcript, 'utf8'));
    const job = session.status === 'ready' ? null : jobs.enqueueIngest(cid, session.number);
    reply.status(alreadyArchived ? 200 : 201);
    return {
      session: store.getSession(cid, session.number),
      job,
      lines: utterances.length,
      speakers: [...new Set(utterances.map((u) => u.speaker))],
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

  app.get('/campaigns/:cid/conversations', async (request) => {
    const { cid } = access(request);
    return db
      .prepare('SELECT id, title, created_at FROM conversations WHERE campaign_id = ? AND user_id = ? ORDER BY id DESC')
      .all(cid, request.user.id);
  });

  app.get('/campaigns/:cid/conversations/:id', async (request) => {
    const { cid } = access(request);
    const conv = db
      .prepare('SELECT * FROM conversations WHERE id = ? AND campaign_id = ? AND user_id = ?')
      .get(Number(request.params.id), cid, request.user.id);
    if (!conv) throw new NotFoundError('Conversation not found');
    const turns = db
      .prepare("SELECT id, question, answer, evidence, created_at FROM qa_log WHERE conversation_id = ? AND status = 'ok' ORDER BY id")
      .all(conv.id)
      .map((t) => ({ ...t, evidence: JSON.parse(t.evidence) }));
    return { ...conv, turns };
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
