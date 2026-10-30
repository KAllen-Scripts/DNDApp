/**
 * Logging in, your own account, and the admin screen (accounts, campaigns, who is in which).
 * The admin login is for managing the server; to play, the admin makes a separate player account.
 */
import { MAX_CUSTOM_BACKGROUNDS } from '@dndapp/shared/backgrounds.js';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../store.js';
import { ATTACK_DAMAGE, EDITIONS, LEVEL_UP_WHO, TRAVEL_PARTS, TRAVEL_TIME, WEIGHT_RULES } from '@dndapp/shared/settings.js';

export function registerAccounts(app, r) {
  const { access, auth, config, db, requireAdmin, search, store } = r;

  // ---------- general ----------

  app.get('/health', { config: { public: true } }, async () => ({ ok: true }));

  /** Log in with the name and password the admin set. Returns a token for the Authorization header. */
  app.post('/login', { config: { public: true }, bodyLimit: 16 * 1024 }, async (request) => {
    const { name, password } = z.object({ name: z.string().min(1).max(100), password: z.string().min(1).max(200) }).parse(request.body);
    return auth.login(name, password, request.ip);
  });

  // The example data only (DATA_SET=example): pick who to log in as from a list, no password, for testing.
  // On the real data the list is empty and logging in this way is refused.
  const examplePick = () => config.dataSet === 'example';

  /** The accounts to pick from: { accounts: [{ name, is_admin, plays }] }. Empty on the real data. */
  app.get('/login/pick', { config: { public: true } }, async () => ({ accounts: examplePick() ? auth.pickableAccounts() : [] }));

  /** Log in as { name } with no password. Returns a token like /login. */
  app.post('/login/pick', { config: { public: true }, bodyLimit: 16 * 1024 }, async (request) => {
    if (!examplePick()) throw new NotFoundError('Not found');
    const { name } = z.object({ name: z.string().min(1).max(100) }).parse(request.body);
    return auth.loginWithoutPassword(name);
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
    dice: { roller: config.dice?.roller ?? 'deluxe' },
    campaigns: db
      .prepare(
        `SELECT c.id, c.name, m.role, m.character_name FROM memberships m JOIN campaigns c ON c.id = m.campaign_id
         WHERE m.user_id = ? ORDER BY c.name`,
      )
      .all(request.user.id)
      .map((c) => ({ ...c, settings: store.getSettings(c.id) })),
  }));

  app.get('/campaigns/:cid', async (request) => {
    const { campaign, role, membership } = access(request);
    return { campaign, role, character_name: membership?.character_name ?? null, settings: store.getSettings(campaign.id) };
  });

  /**
   * Change the campaign's settings (DM): { weight?: 'capacity' | 'variant' | 'ignore',
   * edition?: '2014' | '2024' | null (null: not chosen, follow the books), level_up?: 'player' | 'dm', travel?: { time?, roads?, terrain?,
   * vehicles?, marches?, encounters? }, attacks?: { on?, damage?: 'auto' | 'dm', show_ac? } (shared/settings.js; the rest
   * stay as they were), backgrounds?: the DM's own backgrounds, the whole list (shared/backgrounds.js) }. Everyone in
   * it hears `settings` live.
   */
  app.patch('/campaigns/:cid/settings', async (request) => {
    const a = access(request, { dm: true });
    const body = z.object({
      weight: z.enum(Object.keys(WEIGHT_RULES)).optional(),
      edition: z.enum(Object.keys(EDITIONS)).nullable().optional(),
      level_up: z.enum(Object.keys(LEVEL_UP_WHO)).optional(),
      travel: z.object({ time: z.enum(Object.keys(TRAVEL_TIME)), ...Object.fromEntries(Object.keys(TRAVEL_PARTS).map((k) => [k, z.boolean()])) }).partial().strict().optional(),
      attacks: z.object({ on: z.boolean(), damage: z.enum(Object.keys(ATTACK_DAMAGE)), show_ac: z.boolean() }).partial().strict().optional(),
      // The DM's own backgrounds, the whole list (shared/backgrounds.js cleans each one).
      backgrounds: z.array(z.record(z.string(), z.unknown())).max(MAX_CUSTOM_BACKGROUNDS).optional(),
      // The campaign's calendar, whole (shared/calendar.js cleans it), or null for "Day N".
      calendar: z.record(z.string(), z.unknown()).nullable().optional(),
      // The wiki space's settings: the Timeline's lanes (page ids).
      wiki: z.object({ lanes: z.array(z.string().regex(/^[a-f0-9]{10}$/)).max(12) }).partial().strict().optional(),
    }).strict().parse(request.body ?? {});
    if (body.attacks) body.attacks = { ...store.getSettings(a.cid).attacks, ...body.attacks };
    // Travel switches change one at a time.
    if (body.travel) body.travel = { ...store.getSettings(a.cid).travel, ...body.travel };
    if (body.wiki) body.wiki = { ...store.getSettings(a.cid).wiki, ...body.wiki };
    return store.setSettings(a.cid, body);
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
}
