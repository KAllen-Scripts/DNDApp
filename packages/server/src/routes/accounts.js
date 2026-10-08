/**
 * Logging in, your own account, and the admin screen (accounts, campaigns, who is in which).
 * The admin login is for managing the server; to play, the admin makes a separate player account.
 */
import { z } from 'zod';
import { BadRequestError, NotFoundError, sessionDateFor } from '../store.js';

export function registerAccounts(app, r) {
  const { access, auth, config, db, requireAdmin, search, store } = r;

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
}
