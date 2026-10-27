/**
 * What happened on the maps during a session, for the archivist: fights
 * starting and ending, tokens going down or getting up, doors opened, secret doors found,
 * characters taking stairs to another map, and so on.
 *
 * Worked out from the archived change lines (maps/<id>/changes.jsonl), so
 * a rebuild gives the same events. Only maps players could see at the time,
 * and never hidden tokens: the archivist only hears about what the table saw.
 * A map shown only to some players says so on each line ("[seen only by user 3,
 * user 5]"), so what happened there is known only to them.
 */
import { MARCH_HOURS, PACES, TRAVEL_BY, normalizeMap } from '@dndapp/shared/map.js';
import { clockText, durationText } from '@dndapp/shared/settings.js';
import { sessionDateFor } from '../store.js';
import { applyJson } from '../sheets/store.js';

export const MAX_MAP_EVENTS = 300;

const who = (t) => (t.kind === 'pc' ? t.name : `${t.name} (${{ enemy: 'enemy', companion: 'a companion or summon' }[t.kind] ?? 'NPC'})`);
const down = (t) => t.hp?.current != null && t.hp.current <= 0;

/** The events in one change: before -> after (both normalised maps). */
function eventsOf(before, after, reason, calendar = null) {
  const out = [];
  const on = `on "${after.name}"`;
  if (!before.shown) {
    if (after.shown) out.push(`The DM showed the map "${after.name}"${after.description ? ` (${after.description.split('\n')[0].slice(0, 200)})` : ''}${after.brought_at !== before.brought_at ? ' and brought the players there' : ''}.`);
    return out;
  }
  if (after.brought_at && after.brought_at !== before.brought_at) out.push(`The DM brought the players to the map "${after.name}".`);
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
  out.push(...travelEvents(before, after, reason, was, calendar));
  const doors = new Map(before.walls.filter((w) => w.door).map((w) => [w.id, w]));
  const opened = after.walls.filter((w) => w.door && w.open && doors.has(w.id) && !doors.get(w.id).open).length;
  if (opened) out.push(`${opened === 1 ? 'A door was' : `${opened} doors were`} opened ${on}.`);
  const found = after.walls.filter((w) => w.secret && w.revealed && doors.get(w.id)?.secret && !doors.get(w.id).revealed).length;
  if (found) out.push(`${found === 1 ? 'A secret door was' : `${found} secret doors were`} found ${on}.`);
  return out;
}

/** Names in a list: "Thorin", "Thorin and Lyra", "Thorin, Lyra and Mira". */
const joinNames = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0]);

/**
 * Journeys on the map (the world's travel): who set off, where to, how far and when they're due, and who
 * arrived or stopped, with the in-game day and time. Those going together are said together.
 */
function travelEvents(before, after, reason, was, calendar) {
  const out = [];
  const on = `on "${after.name}"`;
  const groups = new Map();
  const add = (key, t, text) => {
    if (!groups.has(key)) groups.set(key, { who: [], text });
    groups.get(key).who.push(who(t));
  };
  for (const t of after.tokens) {
    const b = was.get(t.id);
    if (t.hidden || !b) continue;
    const j = t.journey;
    if (j && (!b.journey || b.journey.leaves !== j.leaves || b.journey.arrives !== j.arrives)) {
      const mode = TRAVEL_BY[j.by] ?? TRAVEL_BY.foot;
      const far = j.miles != null ? `${j.miles} miles${j.road_miles ? `, ${j.road_miles} of them ${mode.water ? 'by river' : 'by road'}` : ''}, ` : '';
      const how = [j.by !== 'foot' ? `by ${mode.name.toLowerCase()}` : '', j.hours > MARCH_HOURS && !mode.water ? `pushing on ${j.hours} hours a day` : '', mode.water ? '' : `at a ${PACES[j.pace].name.toLowerCase()} pace`].filter(Boolean).join(', ');
      add(`go:${j.to_name}:${j.leaves}:${j.arrives}`, t, (w) => `${w} set off ${j.to_name ? `for ${j.to_name}` : 'on a journey'} ${on} (${far}${durationText(j.arrives - j.leaves)}${how ? ` ${how}` : ''}; left ${clockText(j.leaves, calendar)}, due ${clockText(j.arrives, calendar)}).`);
    } else if (!j && b.journey) {
      const bj = b.journey;
      const where = bj.to_name ? ` at ${bj.to_name}` : '';
      if (reason === 'journey stopped') add(`stop:${bj.to_name}`, t, (w) => `${w} stopped on the way${bj.to_name ? ` to ${bj.to_name}` : ''} ${on}.`);
      else if (reason === 'clock' || reason === 'arrived') add(`at:${bj.to_name}:${bj.arrives}`, t, (w) => `${w} arrived${where} ${on}${reason === 'clock' ? ` (${clockText(bj.arrives, calendar)})` : ''}.`);
    }
  }
  for (const { who: w, text } of groups.values()) out.push(text(joinNames(w)));
  return out;
}

/**
 * The map events on a session date, as lines "[HH:MM] what happened", in order.
 * @param {{ id: string, entries: object[] }[]} histories  every map's archived change lines
 * @param {{ date: string, rolloverHour: number }} opts  the session's date; changes before rolloverHour count to the day before (as with notes)
 */
export function mapEvents(histories, { date, rolloverHour, calendar = null }) {
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
      // Shown to nobody in the list: as good as hidden.
      if (after.shown_to && !after.shown_to.length) continue;
      if (before.shown_to && !before.shown_to.length) before.shown = false;
      const only = after.shown_to ? ` [seen only by ${after.shown_to.map((u) => `user ${u}`).join(', ')}]` : '';
      for (const ev of eventsOf(before, after, e.reason, calendar)) found.push({ when, ev: !only ? ev : typeof ev === 'string' ? `${ev}${only}` : { ...ev, text: (from) => `${ev.text(from)}${only}` } });
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
