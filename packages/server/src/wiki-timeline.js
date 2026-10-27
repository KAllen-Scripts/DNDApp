/**
 * The Timeline (wiki space stage 4c): the wiki's times in lanes, worked out for one viewer from the pages they may
 * see (as they see them), so a hidden page, a planned event or one not available to them never reaches the page.
 *
 * Items are pages with a `when` and every event on a page. Lanes: the DM's own (`wiki.lanes` in the campaign's
 * settings: a page, the pages inside it and the pages linking to it), then History (anything that began before
 * Day 1) and The campaign. An item goes in the first lane that claims it. Undated ones, and session pages with no
 * time, wait in trays. Journeys on the maps (stage 4d, worked out from the maps' archived changes) are bars on
 * The campaign.
 */
import { kindFamily, wikiKey, wikiLinks, normalizeCanon } from '@dndapp/shared/wiki.js';
import { summary } from './wiki-views.js';

export const TIMELINE_LIMITS = { items: 600, undated: 200, lanes: 12 };

/** The names a page's text and facts link to. */
const linksOf = (p) => [...p.sections.map((s) => s.text), ...p.facts.map((f) => f.value)].flatMap(wikiLinks);

/** The session number in a session page's title ("Session 12"), for the tray's order. */
const sessionNumber = (p) => Number(/\bsession\s*#?(\d+)/i.exec(p.title)?.[1] ?? Infinity);

/**
 * The Timeline for one viewer. `pages`: the ones they may see; `places`: pagePlaces() for them; `lanes`: the DM's
 * lane page ids; `truth`: the DM's Truth toggle (no rumours or falsehoods); `forDm`: keep who each event is for; `journeys`: mapJourneys() for the viewer.
 * Returns { lanes: [{ id, title, family?, picture?, page? }], items, undated, sessions, capped }.
 */
export function timeline(pages, { places = new Map(), lanes = [], truth = false, forDm = false, journeys = [] } = {}) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const byName = new Map();
  for (const p of pages) for (const n of [p.title, ...p.aliases]) if (!byName.has(wikiKey(n))) byName.set(wikiKey(n), p);
  // The DM's lanes, those the viewer may see: what each claims.
  const own = lanes.filter((id) => byId.has(id)).slice(0, TIMELINE_LIMITS.lanes).map((id) => {
    const lane = byId.get(id);
    const names = new Set([lane.title, ...lane.aliases].map(wikiKey));
    const claims = new Set([id, ...pages.filter((p) => p.parent === id || linksOf(p).some((n) => names.has(wikiKey(n)))).map((p) => p.id)]);
    const s = summary(lane);
    return { id, title: lane.title, family: kindFamily(lane.kind), picture: s.picture, page: id, claims };
  });
  const laneOf = (page, from) => own.find((l) => l.claims.has(page.id))?.id ?? (from < 0 ? 'history' : 'campaign');

  const items = [];
  const undated = [];
  for (const p of pages) {
    const family = kindFamily(p.kind);
    const picture = summary(p).picture;
    const place = places.get(p.id) ?? null;
    const base = { page_id: p.id, title: p.title, family, picture, place };
    if (p.when) {
      const item = { id: p.id, type: 'page', ...base, when: p.when, canon: 'true', by: 'dm' };
      if (p.when.from == null) undated.push(item);
      else items.push({ ...item, lane: laneOf(p, p.when.from) });
    }
    for (const e of p.events ?? []) {
      const canon = normalizeCanon(e.canon);
      if (truth && (canon === 'rumour' || canon === 'false')) continue;
      const item = { id: `${p.id}:${e.id}`, type: 'event', ...base, text: e.text, when: e.when, canon, by: e.by === 'ai' ? 'ai' : 'dm', ...(forDm && { available: e.available }) };
      if (e.when?.from == null) undated.push(item);
      else items.push({ ...item, lane: laneOf(p, e.when.from) });
    }
  }
  for (const j of journeys) {
    items.push({
      id: `journey:${j.id}`, type: 'journey', page_id: null, title: j.map_name, family: 'journey', picture: null,
      text: `${j.who.join(', ')} ${j.done ? (j.stopped ? 'set off' : 'went') : 'on the way'} ${j.to_name ? `to ${j.to_name}` : 'on a journey'}${j.stopped ? ' (stopped on the way)' : ''}`,
      place: { map_id: j.map_id, map_name: j.map_name, x: j.to.x, y: j.to.y },
      when: { text: '', from: j.leaves, to: j.arrives }, canon: 'true', by: 'map', lane: 'campaign', done: j.done, stopped: j.stopped, by_way: j.by,
    });
  }
  items.sort((a, b) => a.when.from - b.when.from || a.when.to - b.when.to || a.title.localeCompare(b.title));
  const sessions = pages.filter((p) => kindFamily(p.kind) === 'session' && p.when?.from == null)
    .sort((a, b) => sessionNumber(a) - sessionNumber(b) || String(a.created_at).localeCompare(String(b.created_at)))
    .map((p) => ({ id: p.id, title: p.title, picture: summary(p).picture }));
  return {
    lanes: [...own.map(({ claims: _c, ...l }) => l), { id: 'history', title: 'History' }, { id: 'campaign', title: 'The campaign' }],
    items: items.slice(0, TIMELINE_LIMITS.items),
    undated: undated.slice(0, TIMELINE_LIMITS.undated),
    sessions: sessions.filter((s) => !undated.some((u) => u.id === s.id)),
    capped: items.length > TIMELINE_LIMITS.items || undated.length > TIMELINE_LIMITS.undated,
  };
}
