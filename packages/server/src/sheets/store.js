/**
 * Character sheets: one per player per campaign, private to that player.
 *
 * Source data, archive first like everything players provide. Each save
 * appends only what changed to character-sheets/<user id>.jsonl (the first
 * line holds the whole sheet), so the archive is never rewritten and any
 * earlier version can be rebuilt. The database keeps the current sheet.
 */
import { EventEmitter } from 'node:events';
import { normalizeSheet, emptySheet } from '@dndapp/shared/sheet.js';

export class SheetConflictError extends Error {
  constructor(current) {
    super('Your sheet was changed somewhere else (another tab or device) since you opened it.');
    this.current = current;
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The changes that turn `a` into `b`: { p: path, v: value } sets,
 * { p, d: 1 } deletes a key, { p, len } shortens an array.
 */
export function diffJson(a, b, path = [], ops = []) {
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) if (!(k in b)) ops.push({ p: [...path, k], d: 1 });
    for (const k of Object.keys(b)) diffJson(a[k], b[k], [...path, k], ops);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < b.length; i++) diffJson(a[i], b[i], [...path, i], ops);
    if (b.length < a.length) ops.push({ p: path, len: b.length });
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    ops.push({ p: path, v: b });
  }
  return ops;
}

export function applyJson(doc, ops) {
  for (const op of ops) {
    if (!op.p.length) {
      if ('v' in op) doc = structuredClone(op.v);
      else if ('len' in op) doc.length = op.len;
      continue;
    }
    const parent = op.p.slice(0, -1).reduce((o, k) => o[k], doc);
    const last = op.p.at(-1);
    if ('len' in op) parent[last].length = op.len;
    else if (op.d) delete parent[last];
    else parent[last] = structuredClone(op.v);
  }
  return doc;
}

/** Rebuild a sheet from its archived change lines. */
export function replaySheet(entries) {
  let doc = {};
  let version = 0;
  let saved_at = null;
  for (const e of entries) {
    doc = applyJson(doc, e.changes);
    ({ version, saved_at } = e);
  }
  return { sheet: normalizeSheet(doc), version, saved_at };
}

/**
 * onSave(campaignId, userId) runs after each save that changed something (the
 * archivist reads sheet changes). `events` emits 'save' { campaign_id, user_id,
 * version, by } too (maps show a character's hit points from the sheet; the
 * player's page hears saves made elsewhere).
 */
export function createSheets({ db, archive, store, onSave = () => {} }) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const row = (cid, uid) => db.prepare('SELECT data, version, updated_at FROM character_sheets WHERE campaign_id = ? AND user_id = ?').get(cid, uid);

  const sheets = {
    events,

    /**
     * The player's sheet. Someone without one gets a blank sheet (version 0)
     * with their character and account name filled in.
     */
    get(campaignId, userId) {
      const r = row(campaignId, userId);
      if (r) return { sheet: normalizeSheet(JSON.parse(r.data)), version: r.version, updated_at: r.updated_at };
      const who = db
        .prepare('SELECT u.name, m.character_name FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.campaign_id = ? WHERE u.id = ?')
        .get(campaignId, userId);
      return { sheet: emptySheet({ name: who?.character_name ?? '', player_name: who?.name ?? '' }), version: 0, updated_at: null };
    },

    /**
     * Save the whole sheet. `baseVersion` is the version the page loaded; if
     * the sheet has been saved since, nothing is saved (SheetConflictError),
     * so one device can't silently overwrite another's changes.
     * @returns {{ sheet, version, updated_at }}
     */
    save(campaignId, userId, input, { baseVersion, by, reason } = {}) {
      const c = store.getCampaign(campaignId);
      const current = sheets.get(campaignId, userId);
      if (baseVersion != null && baseVersion !== current.version) throw new SheetConflictError(current);
      const sheet = normalizeSheet(input);
      const changes = current.version ? diffJson(current.sheet, sheet) : [{ p: [], v: sheet }];
      if (!changes.length) return current;
      const version = current.version + 1;
      const saved_at = new Date().toISOString();
      archive.appendSheetChanges(c.slug, userId, { version, saved_at, by: by ?? userId, ...(reason && { reason }), changes });
      db.prepare(
        `INSERT INTO character_sheets (campaign_id, user_id, data, version, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (campaign_id, user_id) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at`,
      ).run(campaignId, userId, JSON.stringify(sheet), version, saved_at);
      onSave(campaignId, userId);
      events.emit('save', { campaign_id: campaignId, user_id: userId, version, by: by ?? userId });
      return { sheet, version, updated_at: saved_at };
    },
  };
  return sheets;
}
