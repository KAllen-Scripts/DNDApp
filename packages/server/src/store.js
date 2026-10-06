/**
 * Source data: anything the DM or players provide. Written to the archive
 * first, then mirrored into the database. Everything here survives a rebuild.
 */
import crypto from 'node:crypto';
import { json } from './db/index.js';
import { replaySheet } from './sheets/store.js';

export class NotFoundError extends Error {}
export class BadRequestError extends Error {}

/** Names (accounts, campaigns): trimmed, with runs of spaces collapsed. Web pages show "a  b" as "a b", so stored names must match what people see. */
export const cleanName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'campaign';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The session date a note written at `when` belongs to, in server local time.
 * Notes written before `rolloverHour` (e.g. 1am) count towards the previous
 * day, so a session running past midnight stays on one date.
 */
export function sessionDateFor(when, rolloverHour) {
  const d = new Date(when.getTime() - rolloverHour * 3600_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function createStore({ db, archive, config }) {
  const getCampaign = (id) => {
    const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!c) throw new NotFoundError(`Campaign ${id} not found`);
    return c;
  };

  const store = {
    getCampaign,

    createCampaign(name) {
      name = cleanName(name);
      if (!name) throw new BadRequestError('A campaign name is required');
      // Players pick campaigns by name, so two with the same name would be confusing.
      if (db.prepare('SELECT 1 FROM campaigns WHERE name = ? COLLATE NOCASE').get(name)) {
        throw Object.assign(new Error(`There is already a campaign called "${name}"`), { statusCode: 409 });
      }
      let slug = slugify(name);
      // Never reuse a slug that has an archive folder, even a deleted campaign's.
      const taken = (s) => db.prepare('SELECT 1 FROM campaigns WHERE slug = ?').get(s) || archive.hasCampaign(s);
      for (let i = 2; taken(slug); i++) {
        slug = `${slugify(name)}-${i}`;
      }
      const created_at = new Date().toISOString();
      archive.saveCampaign({ slug, name, created_at });
      const { lastInsertRowid } = db
        .prepare('INSERT INTO campaigns (slug, name, created_at) VALUES (?, ?, ?)')
        .run(slug, name, created_at);
      return getCampaign(Number(lastInsertRowid));
    },

    /**
     * Delete a campaign from the database: its sessions, knowledge base, notes,
     * conversations and memberships go with it (foreign-key cascades). The
     * archive folder is kept and marked deleted, so it isn't restored.
     */
    deleteCampaign(campaignId, { deletedBy } = {}) {
      const c = getCampaign(campaignId);
      if (db.prepare("SELECT 1 FROM jobs WHERE campaign_id = ? AND status IN ('queued', 'running')").get(campaignId)) {
        throw new BadRequestError('This campaign has processing in progress. Wait for it to finish, then delete it.');
      }
      archive.markDeleted(c.slug, { id: c.id, name: c.name, deleted_at: new Date().toISOString(), deleted_by: deletedBy ?? null });
      db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);
      return c;
    },

    /** Everyone in the campaign, with role, character and transcript speaker names. */
    roster(campaignId) {
      const speakers = store.getSpeakers(campaignId);
      return db
        .prepare(
          `SELECT u.id AS user_id, u.name, m.role, m.character_name FROM memberships m JOIN users u ON u.id = m.user_id
           WHERE m.campaign_id = ? AND u.revoked_at IS NULL ORDER BY m.role, u.name`,
        )
        .all(campaignId)
        .map((m) => ({ ...m, speakers: speakers.filter((s) => s.user_id === m.user_id).map((s) => s.speaker) }));
    },

    getSpeakers(campaignId) {
      return db
        .prepare('SELECT speaker, display_name, user_id FROM speakers WHERE campaign_id = ? ORDER BY speaker')
        .all(campaignId);
    },

    /** @param {{speaker: string, display_name: string, user_id?: number|null}[]} speakers  full replacement */
    setSpeakers(campaignId, speakers) {
      const c = getCampaign(campaignId);
      archive.saveSpeakers(c.slug, speakers);
      db.transaction(() => {
        db.prepare('DELETE FROM speakers WHERE campaign_id = ?').run(campaignId);
        const ins = db.prepare('INSERT INTO speakers (campaign_id, speaker, display_name, user_id) VALUES (?, ?, ?, ?)');
        for (const s of speakers) ins.run(campaignId, s.speaker, s.display_name, s.user_id ?? null);
      })();
    },

    getGlossary(campaignId) {
      return db
        .prepare('SELECT term, variants, note FROM glossary WHERE campaign_id = ? ORDER BY term')
        .all(campaignId)
        .map((g) => ({ ...g, variants: json.parse(g.variants, []) }));
    },

    /** @param {{term: string, variants: string[], note?: string}[]} entries  full replacement */
    setGlossary(campaignId, entries) {
      const c = getCampaign(campaignId);
      archive.saveGlossary(c.slug, entries);
      db.transaction(() => {
        db.prepare('DELETE FROM glossary WHERE campaign_id = ?').run(campaignId);
        const ins = db.prepare('INSERT INTO glossary (campaign_id, term, variants, note) VALUES (?, ?, ?, ?)');
        for (const g of entries) ins.run(campaignId, g.term, json.str(g.variants ?? []), g.note ?? null);
      })();
    },

    // ---------- sessions ----------

    /**
     * Archive a transcript and register the session.
     * @param {{ number: number, title?: string, played_on: string }} meta  played_on is YYYY-MM-DD
     * @param {Buffer} transcriptBuf
     */
    addSession(campaignId, { number, title, played_on }, transcriptBuf) {
      if (!DATE_RE.test(played_on ?? '')) throw new BadRequestError('played_on must be a date like 2026-10-03');
      const c = getCampaign(campaignId);
      const { checksum, alreadyArchived } = archive.saveTranscript(c.slug, { number, title, played_on }, transcriptBuf);
      const existing = db.prepare('SELECT * FROM sessions WHERE campaign_id = ? AND number = ?').get(campaignId, number);
      if (existing) return { session: existing, alreadyArchived: true };
      const { lastInsertRowid } = db
        .prepare('INSERT INTO sessions (campaign_id, number, title, played_on, checksum) VALUES (?, ?, ?, ?, ?)')
        .run(campaignId, number, title ?? null, played_on, checksum);
      return {
        session: db.prepare('SELECT * FROM sessions WHERE id = ?').get(lastInsertRowid),
        alreadyArchived,
      };
    },

    getSession(campaignId, number) {
      const s = db.prepare('SELECT * FROM sessions WHERE campaign_id = ? AND number = ?').get(campaignId, number);
      if (!s) throw new NotFoundError(`Session ${number} not found`);
      return s;
    },

    readTranscript(campaignId, number) {
      return archive.readTranscript(getCampaign(campaignId).slug, number);
    },

    /** Highest session number that has finished processing (0 if none). */
    lastProcessedSession(campaignId) {
      return (
        db
          .prepare("SELECT MAX(number) AS n FROM sessions WHERE campaign_id = ? AND status = 'ready'")
          .get(campaignId).n ?? 0
      );
    },

    // ---------- player notes ----------

    /**
     * Save a private note. It belongs to the session played on `session_date`
     * (default: today, with the late-night rollover).
     */
    addPlayerNote(campaignId, userId, { text, session_date }) {
      const c = getCampaign(campaignId);
      const now = new Date();
      const date = session_date ?? sessionDateFor(now, config.notes.rolloverHour);
      if (!DATE_RE.test(date)) throw new BadRequestError('session_date must be a date like 2026-10-03');
      const note = {
        id: crypto.randomUUID(),
        campaign_id: campaignId,
        user_id: userId,
        session_date: date,
        written_at: now.toISOString(),
        text,
      };
      archive.appendPlayerNote(c.slug, note);
      db.prepare(
        'INSERT INTO player_notes (id, campaign_id, user_id, session_date, written_at, text) VALUES (@id, @campaign_id, @user_id, @session_date, @written_at, @text)',
      ).run(note);
      return note;
    },

    /** Notes for a campaign, optionally filtered to one author and/or one session date. */
    playerNotes(campaignId, { userId, date } = {}) {
      return db
        .prepare(
          `SELECT n.*, u.name AS user_name FROM player_notes n LEFT JOIN users u ON u.id = n.user_id
           WHERE n.campaign_id = @campaignId AND (@userId IS NULL OR n.user_id = @userId) AND (@date IS NULL OR n.session_date = @date)
           ORDER BY n.written_at`,
        )
        .all({ campaignId, userId: userId ?? null, date: date ?? null });
    },

    // ---------- corrections ----------

    /** A DM correction in plain words. Applied by the archivist now, and after session `after_session` on rebuilds. */
    addCorrection(campaignId, { text, created_by }) {
      const c = getCampaign(campaignId);
      const correction = {
        text,
        after_session: store.lastProcessedSession(campaignId),
        created_by: created_by ?? null,
        created_at: new Date().toISOString(),
      };
      const id = Number(
        db
          .prepare('INSERT INTO corrections (campaign_id, text, after_session, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(campaignId, text, correction.after_session, correction.created_by, correction.created_at).lastInsertRowid,
      );
      archive.appendCorrection(c.slug, { id, ...correction });
      return { id, ...correction };
    },

    getCorrections(campaignId) {
      return db.prepare('SELECT * FROM corrections WHERE campaign_id = ? ORDER BY id').all(campaignId);
    },

    // ---------- restore ----------

    /**
     * Recreate source tables from the archive for anything the database
     * doesn't have (e.g. after the database file was lost).
     * @returns {string[]} slugs restored
     */
    restoreFromArchive() {
      const restored = [];
      db.transaction(() => {
        if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
          // Archives from before passwords (token_hash only) restore without a password; the admin sets one.
          const ins = db.prepare(
            'INSERT INTO users (id, name, password_hash, must_change_password, is_admin, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          );
          for (const u of archive.readAccounts()) {
            ins.run(u.id, u.name, u.password_hash ?? null, u.must_change_password ? 1 : 0, u.is_admin, u.revoked_at, u.created_at);
          }
        }
        for (const entry of archive.readAll()) {
          const { campaign, sessions, members, speakers, glossary, corrections, playerNotes, sheets = [] } = entry;
          if (db.prepare('SELECT 1 FROM campaigns WHERE slug = ?').get(campaign.slug)) continue;
          const cid = Number(
            db
              .prepare('INSERT INTO campaigns (slug, name, created_at) VALUES (?, ?, ?)')
              .run(campaign.slug, campaign.name, campaign.created_at).lastInsertRowid,
          );
          const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?');
          for (const m of members) {
            if (userExists.get(m.user_id)) {
              db.prepare('INSERT INTO memberships (campaign_id, user_id, role, character_name) VALUES (?, ?, ?, ?)').run(
                cid,
                m.user_id,
                m.role,
                m.character_name ?? null,
              );
            }
          }
          const insS = db.prepare('INSERT INTO sessions (campaign_id, number, title, played_on, checksum) VALUES (?, ?, ?, ?, ?)');
          for (const s of sessions) insS.run(cid, s.number, s.title, s.played_on, s.sha256);
          const insSp = db.prepare('INSERT INTO speakers (campaign_id, speaker, display_name, user_id) VALUES (?, ?, ?, ?)');
          for (const s of speakers) insSp.run(cid, s.speaker, s.display_name, s.user_id ?? null);
          const insG = db.prepare('INSERT INTO glossary (campaign_id, term, variants, note) VALUES (?, ?, ?, ?)');
          for (const g of glossary) insG.run(cid, g.term, json.str(g.variants ?? []), g.note ?? null);
          const insC = db.prepare('INSERT INTO corrections (campaign_id, text, after_session, created_by, created_at) VALUES (?, ?, ?, ?, ?)');
          for (const c of corrections) insC.run(cid, c.text, c.after_session, c.created_by ?? null, c.created_at);
          const insN = db.prepare(
            'INSERT OR IGNORE INTO player_notes (id, campaign_id, user_id, session_date, written_at, text) VALUES (?, ?, ?, ?, ?, ?)',
          );
          for (const n of playerNotes) insN.run(n.id, cid, n.user_id, n.session_date, n.written_at, n.text);
          const insSheet = db.prepare('INSERT INTO character_sheets (campaign_id, user_id, data, version, updated_at) VALUES (?, ?, ?, ?, ?)');
          for (const { user_id, entries } of sheets) {
            if (!entries.length || !userExists.get(user_id)) continue;
            const { sheet, version, saved_at } = replaySheet(entries);
            insSheet.run(cid, user_id, JSON.stringify(sheet), version, saved_at);
          }
          restored.push(campaign.slug);
        }
      })();
      return restored;
    },
  };
  return store;
}
