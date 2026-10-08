/**
 * What happened on the maps during a session, for the archivist: fights
 * starting and ending, tokens going down or getting up, doors opened,
 * characters taking stairs to another map, and so on.
 *
 * Worked out from the archived change lines (maps/<id>/changes.jsonl), so
 * a rebuild gives the same events. Only maps players could see at the time,
 * and never hidden tokens: the archivist only hears about what the table saw.
 */
import { normalizeMap } from '@dndapp/shared/map.js';
import { sessionDateFor } from '../store.js';
import { applyJson } from '../sheets/store.js';

export const MAX_MAP_EVENTS = 300;

const who = (t) => (t.kind === 'pc' ? t.name : `${t.name} (${t.kind === 'enemy' ? 'enemy' : 'NPC'})`);
const down = (t) => t.hp?.current != null && t.hp.current <= 0;

/** The events in one change: before -> after (both normalised maps). */
function eventsOf(before, after, reason) {
  const out = [];
  const on = `on "${after.name}"`;
  if (!before.shown) {
    if (after.shown) out.push(`The DM showed the map "${after.name}"${after.description ? ` (${after.description.split('\n')[0].slice(0, 200)})` : ''}.`);
    return out;
  }
  if (after.variant !== before.variant) {
    const v = after.variants.find((x) => x.id === after.variant);
    out.push(v ? `The map "${after.name}" changed to its "${v.name}" picture.` : `The map "${after.name}" went back to its usual picture.`);
  }
  if (!before.combat && after.combat) {
    const names = after.tokens.filter((t) => !t.hidden).map(who);
    out.push(`A fight began ${on}${names.length ? `: ${names.join(', ')}` : ''}.`);
  }
  if (before.combat && !after.combat) out.push(`The fight ${on} ended after ${before.combat.round} round${before.combat.round === 1 ? '' : 's'}.`);
  const was = new Map(before.tokens.map((t) => [t.id, t]));
  const arrivedFrom = /^arrived from ([a-f0-9]{10})$/.exec(reason ?? '')?.[1];
  for (const t of after.tokens) {
    if (t.hidden) continue;
    const b = was.get(t.id);
    if (!b) {
      out.push(arrivedFrom ? { arrived: arrivedFrom, text: (from) => `${who(t)} went from "${from}" to "${after.name}".` } : `${who(t)} appeared ${on}.`);
      continue;
    }
    if (b.hidden) out.push(`${who(t)} was revealed ${on}.`);
    if (!down(b) && down(t)) out.push(`${who(t)} went down ${on}.`);
    if (down(b) && !down(t)) out.push(`${who(t)} got back up ${on}.`);
    const added = t.conditions.filter((c) => !b.conditions.includes(c));
    if (added.length) out.push(`${who(t)} became ${added.join(', ')} ${on}.`);
  }
  const doors = new Map(before.walls.filter((w) => w.door).map((w) => [w.id, w]));
  const opened = after.walls.filter((w) => w.door && w.open && doors.has(w.id) && !doors.get(w.id).open).length;
  if (opened) out.push(`${opened === 1 ? 'A door was' : `${opened} doors were`} opened ${on}.`);
  return out;
}

/**
 * The map events on a session date, as lines "[HH:MM] what happened", in order.
 * @param {{ id: string, entries: object[] }[]} histories  every map's archived change lines
 * @param {{ date: string, rolloverHour: number }} opts  the session's date; changes before rolloverHour count to the day before (as with notes)
 */
export function mapEvents(histories, { date, rolloverHour }) {
  const names = new Map();
  const found = [];
  for (const { id, entries } of histories) {
    let raw = {};
    for (const e of entries) {
      const when = new Date(e.saved_at);
      const today = !Number.isNaN(when.getTime()) && sessionDateFor(when, rolloverHour) === date;
      const before = today ? normalizeMap(structuredClone(raw)) : null;
      raw = applyJson(raw, e.changes);
      if (!today) continue;
      const after = normalizeMap(structuredClone(raw));
      for (const ev of eventsOf(before, after, e.reason)) found.push({ when, ev });
    }
    names.set(id, normalizeMap(raw).name);
  }
  found.sort((a, b) => a.when - b.when);
  const p = (n) => String(n).padStart(2, '0');
  const lines = found.map(({ when, ev }) => `[${p(when.getHours())}:${p(when.getMinutes())}] ${typeof ev === 'string' ? ev : ev.text(names.get(ev.arrived) ?? 'another map')}`);
  // The same thing over and over (a door opened and closed all evening) only once in a row.
  const out = lines.filter((l, i) => i === 0 || l.slice(8) !== lines[i - 1].slice(8));
  return out.length > MAX_MAP_EVENTS ? [...out.slice(0, MAX_MAP_EVENTS), `(and ${out.length - MAX_MAP_EVENTS} more)`] : out;
}
