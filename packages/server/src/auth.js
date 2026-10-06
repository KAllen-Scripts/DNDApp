/**
 * Name + password auth. The server admin sets every account's password (no
 * self sign-up). Logging in gives the browser a random session token (stored
 * hashed), sent as "Authorization: Bearer <token>".
 *
 * Accounts (with password hashes) and memberships are copied to the archive on
 * every change, so accounts, and who owns which private notes, survive losing
 * the database. Login sessions are not archived: after a database loss
 * everyone just logs in again.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { cleanName } from './store.js';

const scrypt = promisify(crypto.scrypt);

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

export const MIN_PASSWORD_LENGTH = 6;

const sha256 = (token) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => `dnd_${crypto.randomBytes(24).toString('base64url')}`;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function checkPassword(password, stored) {
  const [scheme, salt, key] = (stored ?? '').split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Passwords must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }
}

/**
 * @param {object} o
 * @param {number} [o.loginDays]  a login ends after this many days without use
 * @param {number} [o.maxFailedLogins]  failed attempts per name per 15 minutes before logins are refused
 */
export function createAuth({ db, archive, loginDays = 30, maxFailedLogins = 10 }) {
  const archiveAccounts = () =>
    archive.saveAccounts(
      db.prepare('SELECT id, name, password_hash, must_change_password, is_admin, revoked_at, created_at FROM users ORDER BY id').all(),
    );

  const archiveMembers = (campaignId) => {
    const c = db.prepare('SELECT slug FROM campaigns WHERE id = ?').get(campaignId);
    if (!c) return;
    archive.saveMembers(
      c.slug,
      db.prepare('SELECT user_id, role, character_name FROM memberships WHERE campaign_id = ? ORDER BY user_id').all(campaignId),
    );
  };

  const publicUser = (id) => db.prepare('SELECT id, name, is_admin, must_change_password FROM users WHERE id = ?').get(id);
  const endLogins = (userId) => db.prepare('DELETE FROM logins WHERE user_id = ?').run(userId);

  // Failed login attempts per lower-cased name: timestamps within the window.
  const failures = new Map();
  const WINDOW_MS = 15 * 60 * 1000;
  const recentFailures = (key) => (failures.get(key) ?? []).filter((t) => Date.now() - t < WINDOW_MS);
  let dummyHash = null;

  return {
    /** Create an account. Names are unique (ignoring case); they're what people log in with. */
    /** mustChange: they must choose a new password the next time they log in. */
    async createUser(name, { password, isAdmin = false, mustChange = false } = {}) {
      name = cleanName(name);
      if (!name) throw new AuthError('A name is required', 400);
      validatePassword(password);
      if (db.prepare('SELECT 1 FROM users WHERE name = ? COLLATE NOCASE').get(name)) {
        throw new AuthError(`There is already an account called "${name}"`, 409);
      }
      const id = Number(
        db
          .prepare('INSERT INTO users (name, password_hash, is_admin, must_change_password) VALUES (?, ?, ?, ?)')
          .run(name, await hashPassword(password), isAdmin ? 1 : 0, mustChange ? 1 : 0)
          .lastInsertRowid,
      );
      archiveAccounts();
      return publicUser(id);
    },

    /**
     * Set a new password (admin). Logs the account out everywhere and re-enables
     * it if it was revoked. mustChange: they must choose their own at next login.
     */
    async setPassword(userId, password, { mustChange = false } = {}) {
      validatePassword(password);
      const { changes } = db
        .prepare('UPDATE users SET password_hash = ?, must_change_password = ?, revoked_at = NULL WHERE id = ?')
        .run(await hashPassword(password), mustChange ? 1 : 0, userId);
      if (!changes) throw new AuthError('No such account', 404);
      endLogins(userId);
      archiveAccounts();
    },

    /** @returns {Promise<{ token: string, user: object }>} */
    async login(name, password) {
      const key = cleanName(name).toLowerCase();
      if (recentFailures(key).length >= maxFailedLogins) {
        throw new AuthError('Too many failed attempts. Try again in 15 minutes.', 429);
      }
      const row = db.prepare('SELECT * FROM users WHERE name = ? COLLATE NOCASE AND revoked_at IS NULL').get(key);
      // Check against a dummy hash for unknown names too, so timing doesn't reveal which names exist.
      dummyHash ??= await hashPassword('not-a-real-password');
      const ok = await checkPassword(String(password ?? ''), row?.password_hash ?? dummyHash);
      if (!row || !ok) {
        failures.set(key, [...recentFailures(key), Date.now()]);
        throw new AuthError('Wrong name or password');
      }
      failures.delete(key);
      const token = newToken();
      db.prepare('INSERT INTO logins (token_hash, user_id) VALUES (?, ?)').run(sha256(token), row.id);
      return { token, user: publicUser(row.id) };
    },

    logout(header) {
      const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
      if (m) db.prepare('DELETE FROM logins WHERE token_hash = ?').run(sha256(m[1]));
    },

    authenticate(header) {
      const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
      if (!m) throw new AuthError('Not logged in');
      const hash = sha256(m[1]);
      const user = db
        .prepare(
          `SELECT u.id, u.name, u.is_admin, u.must_change_password FROM logins l JOIN users u ON u.id = l.user_id
           WHERE l.token_hash = ? AND u.revoked_at IS NULL AND l.last_used_at >= datetime('now', ?)`,
        )
        .get(hash, `-${loginDays} days`);
      if (!user) throw new AuthError('Not logged in, or your login has expired. Please log in.');
      db.prepare("UPDATE logins SET last_used_at = datetime('now') WHERE token_hash = ?").run(hash);
      return user;
    },

    /** Block an account and log it out everywhere. Setting a new password re-enables it. */
    revoke(userId) {
      db.prepare("UPDATE users SET revoked_at = datetime('now') WHERE id = ?").run(userId);
      endLogins(userId);
      archiveAccounts();
    },

    /** Turn "must change password at next login" on or off (admin). */
    setMustChange(userId, on) {
      db.prepare('UPDATE users SET must_change_password = ? WHERE id = ?').run(on ? 1 : 0, userId);
      archiveAccounts();
    },

    /**
     * Someone changing their own password. Needs the current one. Clears
     * "must change", and logs out every other device (this login keeps working).
     */
    async changeOwnPassword(userId, header, currentPassword, newPassword) {
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
      if (!(await checkPassword(String(currentPassword ?? ''), row?.password_hash))) {
        throw new AuthError('Your current password is wrong', 400);
      }
      validatePassword(newPassword);
      if (newPassword === currentPassword) throw new AuthError('Choose a password different from your current one', 400);
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(await hashPassword(newPassword), userId);
      const current = /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1];
      db.prepare('DELETE FROM logins WHERE user_id = ? AND token_hash != ?').run(userId, current ? sha256(current) : '');
      archiveAccounts();
    },

    unblock(userId) {
      db.prepare('UPDATE users SET revoked_at = NULL WHERE id = ?').run(userId);
      archiveAccounts();
    },

    /** End every login this account has (it can log in again). */
    logoutEverywhere(userId) {
      endLogins(userId);
    },

    /**
     * Delete an account outright. Only allowed while it has no history (notes,
     * questions asked, sessions attended, speaker-map links, corrections), since
     * the archive refers to accounts by id. Otherwise block it instead.
     */
    deleteUser(userId) {
      const used = [
        ['notes', 'SELECT 1 FROM player_notes WHERE user_id = ?'],
        ['questions asked', 'SELECT 1 FROM conversations WHERE user_id = ?'],
        ['sessions attended', 'SELECT 1 FROM attendance WHERE user_id = ?'],
        ['speaker-map links', 'SELECT 1 FROM speakers WHERE user_id = ?'],
        ['corrections', 'SELECT 1 FROM corrections WHERE created_by = ?'],
        ['character sheets', 'SELECT 1 FROM character_sheets WHERE user_id = ?'],
      ].filter(([, sql]) => db.prepare(sql).get(userId)).map(([what]) => what);
      if (used.length) {
        throw new AuthError(`This account has history (${used.join(', ')}), so it can't be deleted. Block it instead.`, 409);
      }
      const campaigns = db.prepare('SELECT campaign_id FROM memberships WHERE user_id = ?').all(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      for (const { campaign_id } of campaigns) archiveMembers(campaign_id);
      archiveAccounts();
    },

    removeMember(campaignId, userId) {
      db.prepare('DELETE FROM memberships WHERE campaign_id = ? AND user_id = ?').run(campaignId, userId);
      archiveMembers(campaignId);
    },

    /**
     * Set exactly which campaigns an account is in: [{ campaign_id, role, character_name }].
     * Campaigns left out are removed; the others are added or updated.
     */
    setCampaigns(userId, list) {
      const before = db.prepare('SELECT campaign_id FROM memberships WHERE user_id = ?').all(userId).map((m) => m.campaign_id);
      const wanted = new Map(list.map((m) => [m.campaign_id, m]));
      db.transaction(() => {
        for (const cid of before) {
          if (!wanted.has(cid)) db.prepare('DELETE FROM memberships WHERE campaign_id = ? AND user_id = ?').run(cid, userId);
        }
        for (const m of wanted.values()) {
          db.prepare(
            `INSERT INTO memberships (campaign_id, user_id, role, character_name) VALUES (?, ?, ?, ?)
             ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = excluded.role, character_name = excluded.character_name`,
          ).run(m.campaign_id, userId, m.role, m.character_name || null);
        }
      })();
      for (const cid of new Set([...before, ...wanted.keys()])) archiveMembers(cid);
    },

    membership(campaignId, userId) {
      return db.prepare('SELECT * FROM memberships WHERE campaign_id = ? AND user_id = ?').get(campaignId, userId);
    },

    addMember(campaignId, userId, role, characterName = null) {
      db.prepare(
        `INSERT INTO memberships (campaign_id, user_id, role, character_name) VALUES (?, ?, ?, ?)
         ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = excluded.role, character_name = excluded.character_name`,
      ).run(campaignId, userId, role, characterName);
      archiveMembers(campaignId);
    },
  };
}
