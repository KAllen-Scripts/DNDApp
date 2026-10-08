/**
 * What the archivist hasn't read yet between sessions: players' character
 * sheets (the whole sheet the first time, then each change with when it
 * happened), notes written, edited or deleted after their session was
 * processed, and handouts the DM gave.
 *
 * A mark per campaign (archivist_marks, derived) says how far it has read.
 * Sheets are read from the archive, which keeps every save with its time, so
 * a rebuild replays the same changes.
 */
import { computeSheet, normalizeSheet, ABILITY_NAMES, SKILLS, TEXT_FIELDS } from '@dndapp/shared/sheet.js';
import { applyJson } from '../sheets/store.js';

const EPOCH = '1970-01-01T00:00:00.000Z';
// Saves of the same field this close together read as one change (autosave fires while typing).
const MERGE_MS = 10 * 60_000;
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** "2026-10-08 14:03" in the server's time zone, like the notes. */
export function localTime(iso) {
  const t = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

const show = (v) => {
  if (v === undefined || v === null || v === '') return '(empty)';
  if (typeof v === 'string') return JSON.stringify(clip(v, 600));
  return clip(JSON.stringify(v), 600);
};

/** A field's path as words: ["spells", 3, "prepared"] -> spells[Fireball].prepared */
function label(sheet, p) {
  const out = [];
  let node = sheet;
  for (const k of p) {
    if (typeof k === 'number' && Array.isArray(node)) {
      const item = node[k];
      const name = item?.name;
      out[out.length - 1] += name ? `[${name}]` : `[${k + 1}]`;
    } else {
      out.push(String(k));
    }
    node = node?.[k];
  }
  return out.join('.') || '(whole sheet)';
}

const getPath = (doc, p) => p.reduce((o, k) => (o == null ? undefined : o[k]), doc);

/**
 * Each change to a sheet after `since` up to `until`, oldest first, as
 * { at, field, before, after }. Saves of the same field within MERGE_MS
 * become one change (first value before, last value after, time of the last).
 * Also returns the sheet as it was at `since` (null if it didn't exist yet)
 * and at `until`.
 */
export function sheetChanges(entries, { since, until }) {
  let doc = {};
  let atSince = null;
  let atUntil = null;
  const changes = [];
  for (const e of entries) {
    if (e.saved_at > until) break;
    const before = structuredClone(doc);
    doc = applyJson(doc, e.changes);
    if (e.saved_at <= since) {
      atSince = doc;
      continue;
    }
    if (!atSince && !changes.length && e.changes.length === 1 && !e.changes[0].p.length) {
      // The first save: the whole sheet, shown in full below rather than as changes.
      changes.push({ at: e.saved_at, created: true });
      continue;
    }
    for (const op of e.changes) {
      // A list that got shorter ({ p, len }) is reported as the whole list.
      const p = op.p;
      const field = label('len' in op ? before : doc, p);
      const was = getPath(before, p);
      const now = 'd' in op ? undefined : getPath(doc, p);
      const last = changes.findLast((c) => c.field === field);
      if (last && Date.parse(e.saved_at) - Date.parse(last.at) <= MERGE_MS) {
        last.after = now;
        last.at = e.saved_at;
      } else {
        changes.push({ at: e.saved_at, field, before: was, after: now });
      }
    }
  }
  atUntil = doc;
  return {
    before: atSince && normalizeSheet(atSince),
    after: Object.keys(atUntil).length ? normalizeSheet(atUntil) : null,
    // A field changed and changed back is no change.
    changes: changes.filter((c) => c.created || JSON.stringify(c.before) !== JSON.stringify(c.after)),
  };
}

/** The whole sheet as text for the archivist: what the player entered plus the numbers worked out from it. */
export function sheetText(sheet) {
  const { values, level } = computeSheet(sheet);
  const lines = [];
  const add = (k, v) => v !== '' && v != null && lines.push(`${k}: ${v}`);
  add('Character', sheet.name);
  add('Classes', sheet.classes.map((c) => `${c.name || '?'}${c.subclass ? ` (${c.subclass})` : ''} ${c.level}`).join(', ') + ` (level ${level})`);
  for (const k of ['race', 'background', 'alignment', 'xp']) add(k, sheet[k]);
  add('Abilities', Object.entries(ABILITY_NAMES).map(([a, n]) => `${n} ${sheet.abilities[a]}`).join(', '));
  add('Armour class', values.ac);
  add('Hit points', `${sheet.hp.current ?? values.hp_max ?? '?'} of ${values.hp_max ?? '?'}${sheet.hp.temp ? ` (+${sheet.hp.temp} temporary)` : ''}`);
  add('Speed', `${values.speed} ft.`);
  add('Initiative', values.initiative);
  add('Passive perception', values.passive_perception);
  const skills = Object.entries(sheet.skills).map(([k, p]) => `${SKILLS[k]?.name ?? k}${p === 'expertise' ? ' (expertise)' : ''}`);
  add('Skill proficiencies', skills.join(', '));
  add('Attacks', sheet.attacks.map((a) => [a.name, a.bonus, a.damage, a.notes].filter(Boolean).join(' ')).join('; '));
  add('Coins', Object.entries(sheet.coins).filter(([, n]) => n).map(([c, n]) => `${n} ${c}`).join(', '));
  if (values.spell_ability) add('Spell save DC', values.spell_dc);
  add('Spells', sheet.spells.map((s) => `${s.name} (${s.level ? `level ${s.level}` : 'cantrip'}${s.prepared ? ', prepared' : ''})`).join(', '));
  for (const k of Object.keys(TEXT_FIELDS)) {
    if (['name', 'race', 'background', 'alignment', 'xp'].includes(k)) continue;
    if (sheet[k]) add(k.replace(/_/g, ' '), clip(sheet[k], 4000));
  }
  return lines.join('\n');
}

/**
 * @param {object} o
 * @param {(cid: number, since: string, until: string) => string[]} [o.handoutsBetween]  handouts given in that window, as text
 */
export function createUpdates({ db, store, archive, handoutsBetween = () => [] }) {
  const mark = (cid) => db.prepare('SELECT updates_until FROM archivist_marks WHERE campaign_id = ?').get(cid)?.updates_until ?? EPOCH;
  const setMark = (cid, until) =>
    db.prepare('INSERT INTO archivist_marks (campaign_id, updates_until) VALUES (?, ?) ON CONFLICT (campaign_id) DO UPDATE SET updates_until = excluded.updates_until').run(cid, until);

  /** Sheets: one block per player whose sheet changed. */
  function sheetBlocks(cid, since, until) {
    const c = store.getCampaign(cid);
    const roster = new Map(store.roster(cid).map((m) => [m.user_id, m]));
    const users = db.prepare('SELECT user_id FROM character_sheets WHERE campaign_id = ? AND updated_at > ? ORDER BY user_id').all(cid, since).map((r) => r.user_id);
    const blocks = [];
    for (const uid of users) {
      const { before, after, changes } = sheetChanges(archive.readSheetChanges(c.slug, uid), { since, until });
      if (!after || !changes.length) continue;
      const who = roster.get(uid);
      const head = `<character_sheet user="${uid}" player="${who?.name ?? '?'}"${who?.character_name ? ` plays="${who.character_name}"` : ''}>`;
      const created = changes.find((ch) => ch.created);
      const list = changes
        .filter((ch) => !ch.created)
        .map((ch) => `[${localTime(ch.at)}] ${ch.field}: ${show(ch.before)} → ${show(ch.after)}`);
      blocks.push(
        [
          head,
          before ? 'You have read this sheet before. Changes since then, oldest first:' : `New sheet, first saved ${localTime(created?.at ?? changes[0].at)}.`,
          ...(before ? list : list.length ? ['Changes after it was first saved, oldest first:', ...list] : []),
          `Sheet now:\n${sheetText(after)}`,
          '</character_sheet>',
        ].join('\n'),
      );
    }
    return blocks;
  }

  /** Notes written, edited or deleted after their session was processed. */
  function noteLines(cid, since, until) {
    const processed = new Map(
      db.prepare("SELECT played_on, MAX(processed_at) AS at, MAX(number) AS number FROM sessions WHERE campaign_id = ? AND status = 'ready' AND processed_at IS NOT NULL GROUP BY played_on").all(cid).map((s) => [s.played_on, s]),
    );
    return store
      .noteChanges(cid, { since, until })
      .filter((n) => processed.has(n.session_date) && n.at > processed.get(n.session_date).at)
      .map((n) => {
        const where = `note S${processed.get(n.session_date).number} ${n.user_name ?? n.user_id}`;
        const who = `user ${n.user_id} (${n.user_name ?? '?'})`;
        if (n.deleted) {
          return n.before == null ? null : `[${localTime(n.at)}] ${who} deleted their note [${where}]: ${show(n.before)}. Remove anything only this note supported.`;
        }
        if (n.before == null) return `[${localTime(n.at)}] ${who} added a note to the session of ${n.session_date} [${where}]: ${show(n.after)}`;
        return `[${localTime(n.at)}] ${who} edited their note [${where}] from ${show(n.before)} to ${show(n.after)}`;
      })
      .filter(Boolean);
  }

  return {
    mark,
    setMark,

    /** Whether anything is waiting for the archivist (cheap enough to call on start-up). */
    pendingSince(cid) {
      const since = mark(cid);
      return !!db.prepare('SELECT 1 FROM character_sheets WHERE campaign_id = ? AND updated_at > ?').get(cid, since) ||
        !!db.prepare('SELECT 1 FROM player_notes WHERE campaign_id = ? AND COALESCE(deleted_at, edited_at, written_at) > ?').get(cid, since) ||
        !!db.prepare('SELECT 1 FROM handouts WHERE campaign_id = ? AND updated_at > ?').get(cid, since);
    },

    /** What's new for the archivist up to `until`: { since, until, sheets, notes, handouts } (lists of text). */
    collect(cid, until = new Date().toISOString()) {
      const since = mark(cid);
      return { since, until, sheets: sheetBlocks(cid, since, until), notes: noteLines(cid, since, until), handouts: handoutsBetween(cid, since, until) };
    },
  };
}
