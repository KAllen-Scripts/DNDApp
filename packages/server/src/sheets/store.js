/**
 * Character sheets: each player can have several characters per campaign,
 * one of them active, all private to that player.
 *
 * Source data, archive first like everything players provide. Each save
 * appends only what changed to character-sheets/<user id>.jsonl (the first
 * character; <user id>-<n>.jsonl for character n; the first line holds the
 * whole sheet), so the archive is never rewritten and any earlier version can
 * be rebuilt. Which character is active is in <user id>.characters.jsonl. The
 * database keeps the current sheets.
 */
import { EventEmitter } from 'node:events';
import { normalizeSheet, emptySheet } from '@dndapp/shared/sheet.js';

export class SheetConflictError extends Error {
  constructor(current, { switched = false } = {}) {
    super(switched
      ? 'You made another character active somewhere else (another tab or device), so this sheet is no longer the one you play.'
      : 'Your sheet was changed somewhere else (another tab or device) since you opened it.');
    this.current = current;
    this.switched = switched;
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
 * A player's characters: each a sheet of its own, one of them active (the one
 * they play now). Everything that reads or changes "the player's sheet" (maps,
 * rests, merchants, the DM's Items tab, Q&A, the archivist's roster) uses the
 * active one; the others are kept, private to the player like any sheet.
 *
 * onSave(campaignId, userId) runs after each save that changed something, and
 * after a switch (the archivist reads sheet changes and who plays what).
 * onSwitch(campaignId, userId, sheet) runs when another character becomes
 * active (the membership's character name follows it). `events` emits 'save'
 * { campaign_id, user_id, version, by, number, switched? } for saves to the
 * active character and for switches (maps show a character's hit points from
 * the sheet; the player's page hears saves made elsewhere).
 */
export const MAX_CHARACTERS = 20;

export class CharacterError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function createSheets({ db, archive, store, onSave = () => {}, onSwitch = () => {} }) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const rowOf = (cid, uid, number) =>
    db.prepare('SELECT number, data, version, updated_at, active, deleted_at FROM character_sheets WHERE campaign_id = ? AND user_id = ? AND number = ?').get(cid, uid, number);
  // The active character, else (never expected) the lowest one not deleted.
  const activeRow = (cid, uid) =>
    db.prepare('SELECT number, data, version, updated_at, active, deleted_at FROM character_sheets WHERE campaign_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY active DESC, number LIMIT 1').get(cid, uid);
  const blank = (cid, uid) => {
    const who = db
      .prepare('SELECT u.name, m.character_name FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.campaign_id = ? WHERE u.id = ?')
      .get(cid, uid);
    return emptySheet({ name: who?.character_name ?? '', player_name: who?.name ?? '' });
  };
  const fromRow = (r) => ({ sheet: normalizeSheet(JSON.parse(r.data)), version: r.version, updated_at: r.updated_at, number: r.number });

  /** The archive's record of which character is active and which are deleted (the whole record each time). */
  function archiveList(cid, uid, by) {
    const rows = db.prepare('SELECT number, active, deleted_at FROM character_sheets WHERE campaign_id = ? AND user_id = ? ORDER BY number').all(cid, uid);
    archive.appendCharacterList(store.getCampaign(cid).slug, uid, {
      saved_at: new Date().toISOString(),
      by: by ?? uid,
      active: rows.find((r) => r.active)?.number ?? null,
      deleted: rows.filter((r) => r.deleted_at).map((r) => ({ number: r.number, at: r.deleted_at })),
    });
  }

  const sheets = {
    events,

    /**
     * The player's active character's sheet: { sheet, version, updated_at,
     * number }. Someone with none gets a blank sheet (version 0, number 1)
     * with their character and account name filled in. With `number`, that
     * character instead (null if they have no such character).
     */
    get(campaignId, userId, number = null) {
      if (number != null) {
        const r = rowOf(campaignId, userId, number);
        if (r && !r.deleted_at) return fromRow(r);
        if (number === 1 && !activeRow(campaignId, userId)) return { sheet: blank(campaignId, userId), version: 0, updated_at: null, number: 1 };
        return null;
      }
      const r = activeRow(campaignId, userId);
      if (r) return fromRow(r);
      return { sheet: blank(campaignId, userId), version: 0, updated_at: null, number: 1 };
    },

    /** The number of the player's active character (1 for someone with none saved yet). */
    activeNumber: (campaignId, userId) => activeRow(campaignId, userId)?.number ?? 1,

    /**
     * The player's characters, for their list on the Sheet tab: [{ number,
     * name, summary, active, version, updated_at }], deleted ones left out.
     * Someone with none saved yet has their blank first character.
     */
    list(campaignId, userId) {
      const rows = db.prepare('SELECT number, data, version, updated_at, active FROM character_sheets WHERE campaign_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY number').all(campaignId, userId);
      const activeNo = sheets.activeNumber(campaignId, userId);
      const one = (number, sheet, version, updated_at) => ({ number, name: sheet.name, summary: summaryOf(sheet), active: number === activeNo, version, updated_at });
      if (!rows.length) return [one(1, blank(campaignId, userId), 0, null)];
      return rows.map((r) => one(r.number, normalizeSheet(JSON.parse(r.data)), r.version, r.updated_at));
    },

    /**
     * Save the whole sheet of the active character (or, with `number`, that
     * character). `baseVersion` is the version the page loaded; if the sheet
     * has been saved since, nothing is saved (SheetConflictError), so one
     * device can't silently overwrite another's changes. `levels`: the sheet's
     * levels_granted is taken from `input` (the level up routes); otherwise it's kept.
     * @returns {{ sheet, version, updated_at, number }}
     */
    save(campaignId, userId, input, { baseVersion, by, reason, number = null, levels = false } = {}) {
      const c = store.getCampaign(campaignId);
      const current = number == null ? sheets.get(campaignId, userId) : sheets.get(campaignId, userId, number);
      if (!current) throw new CharacterError('There is no such character.', 404);
      if (baseVersion != null && baseVersion !== current.version) throw new SheetConflictError(current);
      const sheet = normalizeSheet(input);
      // Levels the DM has given (level-up.js) change only through the level up routes (levels: true), never from
      // a sheet the page or an upload sends.
      if (!levels) sheet.levels_granted = current.sheet.levels_granted ?? 0;
      const changes = current.version ? diffJson(current.sheet, sheet) : [{ p: [], v: sheet }];
      if (!changes.length) return current;
      const version = current.version + 1;
      const saved_at = new Date().toISOString();
      const isActive = current.number === sheets.activeNumber(campaignId, userId);
      archive.appendSheetChanges(c.slug, userId, { version, saved_at, by: by ?? userId, ...(reason && { reason }), changes }, current.number);
      db.prepare(
        `INSERT INTO character_sheets (campaign_id, user_id, number, data, version, updated_at, active) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (campaign_id, user_id, number) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at`,
      ).run(campaignId, userId, current.number, JSON.stringify(sheet), version, saved_at, isActive ? 1 : 0);
      onSave(campaignId, userId);
      if (isActive) events.emit('save', { campaign_id: campaignId, user_id: userId, version, by: by ?? userId, number: current.number });
      return { sheet, version, updated_at: saved_at, number: current.number };
    },

    /**
     * A new character for the player: a blank sheet with this name (and their
     * account name as the player), saved at once. It becomes the active one
     * unless `active` is false. @returns the new character's { sheet, version, updated_at, number }
     */
    create(campaignId, userId, name, { active = true, by } = {}) {
      const all = db.prepare('SELECT number, deleted_at FROM character_sheets WHERE campaign_id = ? AND user_id = ?').all(campaignId, userId);
      if (all.filter((r) => !r.deleted_at).length >= MAX_CHARACTERS) throw new CharacterError(`You can have at most ${MAX_CHARACTERS} characters here. Delete one first.`);
      const number = all.length ? Math.max(...all.map((r) => r.number)) + 1 : 1;
      const sheet = { ...blank(campaignId, userId), name: String(name ?? '').trim() };
      const c = store.getCampaign(campaignId);
      const saved_at = new Date().toISOString();
      const first = normalizeSheet(sheet);
      archive.appendSheetChanges(c.slug, userId, { version: 1, saved_at, by: by ?? userId, reason: 'new character', changes: [{ p: [], v: first }] }, number);
      db.prepare('INSERT INTO character_sheets (campaign_id, user_id, number, data, version, updated_at, active) VALUES (?, ?, ?, ?, 1, ?, 0)')
        .run(campaignId, userId, number, JSON.stringify(first), saved_at);
      if (active || !all.length) sheets.setActive(campaignId, userId, number, { by });
      else {
        archiveList(campaignId, userId, by);
        onSave(campaignId, userId);
      }
      return sheets.get(campaignId, userId, number);
    },

    /** Make one of the player's characters the one they play now. */
    setActive(campaignId, userId, number, { by } = {}) {
      const r = rowOf(campaignId, userId, number);
      if (!r || r.deleted_at) throw new CharacterError('There is no such character.', 404);
      if (r.active) return sheets.get(campaignId, userId);
      const at = new Date().toISOString();
      db.transaction(() => {
        db.prepare('UPDATE character_sheets SET active = 0 WHERE campaign_id = ? AND user_id = ? AND active = 1').run(campaignId, userId);
        db.prepare('UPDATE character_sheets SET active = 1, activated_at = ? WHERE campaign_id = ? AND user_id = ? AND number = ?').run(at, campaignId, userId, number);
      })();
      archiveList(campaignId, userId, by);
      const now = sheets.get(campaignId, userId);
      onSwitch(campaignId, userId, now.sheet);
      onSave(campaignId, userId);
      events.emit('save', { campaign_id: campaignId, user_id: userId, version: now.version, by: by ?? userId, number, switched: true });
      return now;
    },

    /** Rename a character (its sheet's name), active or not. */
    rename(campaignId, userId, number, name, { by } = {}) {
      const current = sheets.get(campaignId, userId, number);
      if (!current) throw new CharacterError('There is no such character.', 404);
      const saved = sheets.save(campaignId, userId, { ...current.sheet, name: String(name ?? '').trim() }, { by, reason: 'renamed', number: current.number });
      if (current.number === sheets.activeNumber(campaignId, userId)) onSwitch(campaignId, userId, saved.sheet);
      return saved;
    },

    /**
     * Delete a character the player isn't playing: it's hidden from them and
     * everything else; the archive keeps every version of it.
     */
    remove(campaignId, userId, number, { by } = {}) {
      const r = rowOf(campaignId, userId, number);
      if (!r || r.deleted_at) throw new CharacterError('There is no such character.', 404);
      if (r.active) throw new CharacterError("That's the character you're playing. Make another one active first, then delete this one.");
      db.prepare('UPDATE character_sheets SET deleted_at = ? WHERE campaign_id = ? AND user_id = ? AND number = ?').run(new Date().toISOString(), campaignId, userId, number);
      archiveList(campaignId, userId, by);
      onSave(campaignId, userId);
    },
  };
  return sheets;
}

/** "High Elf · Wizard 5 / Fighter 1", for the list of characters. */
export function summaryOf(sheet) {
  const classes = (sheet.classes ?? []).filter((c) => c.name?.trim()).map((c) => `${c.name.trim()} ${c.level}`).join(' / ');
  return [sheet.race?.trim(), classes].filter(Boolean).join(' · ');
}
