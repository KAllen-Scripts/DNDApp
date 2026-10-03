/**
 * Token auth. Each person gets a random token (shown once, stored hashed).
 * Clients send it as "Authorization: Bearer <token>". Accounts and
 * memberships are copied to the archive on every change, so tokens (and who
 * owns which private notes) survive losing the database.
 */
import crypto from 'node:crypto';

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => `dnd_${crypto.randomBytes(24).toString('base64url')}`;

export function createAuth({ db, archive }) {
  const archiveAccounts = () =>
    archive.saveAccounts(db.prepare('SELECT id, name, token_hash, is_admin, revoked_at, created_at FROM users ORDER BY id').all());

  const archiveMembers = (campaignId) => {
    const c = db.prepare('SELECT slug FROM campaigns WHERE id = ?').get(campaignId);
    if (!c) return;
    archive.saveMembers(
      c.slug,
      db.prepare('SELECT user_id, role, character_name FROM memberships WHERE campaign_id = ? ORDER BY user_id').all(campaignId),
    );
  };

  return {
    /** @returns {{ user: object, token: string }}  token is only available here */
    createUser(name, { isAdmin = false } = {}) {
      const token = newToken();
      const id = Number(
        db.prepare('INSERT INTO users (name, token_hash, is_admin) VALUES (?, ?, ?)').run(name, hash(token), isAdmin ? 1 : 0)
          .lastInsertRowid,
      );
      archiveAccounts();
      return { user: db.prepare('SELECT id, name, is_admin FROM users WHERE id = ?').get(id), token };
    },

    /** Issue a new token for an existing user (the old one stops working). */
    resetToken(userId) {
      const token = newToken();
      db.prepare('UPDATE users SET token_hash = ?, revoked_at = NULL WHERE id = ?').run(hash(token), userId);
      archiveAccounts();
      return token;
    },

    authenticate(header) {
      const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
      if (!m) throw new AuthError('Missing token');
      const user = db
        .prepare('SELECT id, name, is_admin FROM users WHERE token_hash = ? AND revoked_at IS NULL')
        .get(hash(m[1]));
      if (!user) throw new AuthError('Invalid or revoked token');
      return user;
    },

    revoke(userId) {
      db.prepare("UPDATE users SET revoked_at = datetime('now') WHERE id = ?").run(userId);
      archiveAccounts();
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
