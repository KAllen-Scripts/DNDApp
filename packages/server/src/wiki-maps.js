import { NotFoundError } from './store.js';
import { kindFamily, wikiKey, wikiLinks } from '@dndapp/shared/wiki.js';
import { summary } from './wiki-views.js';

/**
 * Where the wiki meets the maps. Maps own the geography and the wiki owns the
 * words, so a place or token on a map links to a page (`page: { id, title }`)
 * and nothing is copied between them. This keeps the links right: a renamed
 * page renames its links (and a place still called by the old title), and a
 * deleted page's links go.
 */

/**
 * Every map place and token linked to a page (unfiltered: the DM's): [{ map_id, map_name, kind, id, name, x, y,
 * revealed, crop }]. `revealed` says whether players see the place (null for a token); `crop` frames it on its map.
 */
export function pageOnMaps(maps, cid, pageId) {
  const out = [];
  for (const m of maps.list(cid)) {
    for (const p of m.places ?? []) if (p.page?.id === pageId) out.push({ map_id: m.id, map_name: m.name, kind: 'place', id: p.id, name: p.name, x: p.x, y: p.y, revealed: !!p.revealed, crop: placeCrop(m, p) });
    for (const t of m.tokens ?? []) if (t.page?.id === pageId) out.push({ map_id: m.id, map_name: m.name, kind: 'token', id: t.id, name: t.name, x: t.x, y: t.y, revealed: null, crop: placeCrop(m, t) });
  }
  return out;
}

/** Keep the maps' links in step with the wiki's pages. */
export function linkWikiToMaps({ wiki, maps, log = console }) {
  const each = (cid, pageId, fn, reason, by) => {
    for (const m of maps.list(cid)) {
      const linked = [...(m.places ?? []), ...(m.tokens ?? [])].some((x) => x.page?.id === pageId);
      if (!linked) continue;
      try {
        maps.change(cid, m.id, (doc) => {
          for (const x of [...doc.places, ...doc.tokens]) if (x.page?.id === pageId) fn(x, doc.places.includes(x));
        }, { by, reason });
      } catch (err) {
        log.error?.(`wiki-maps: ${reason} on map ${m.id} failed: ${err.message}`);
      }
    }
  };
  wiki.events.on('renamed', ({ cid, page, before }) => each(cid, page.id, (x, isPlace) => {
    x.page = { id: page.id, title: page.title };
    if (isPlace && x.name === before.title) x.name = page.title;
  }, 'wiki rename', page.updated_by));
  wiki.events.on('removed', ({ cid, page }) => each(cid, page.id, (x) => { x.page = null; }, 'wiki page deleted', page.updated_by));
}

/** The kind a new page for a place gets, from the map it's on (a place on a region map is usually a town). */
const PLACE_KIND = { world: 'region', region: 'town', town: 'building' };
const TOKEN_KIND = { npc: 'npc', enemy: 'monster', companion: 'creature' };

/** Where a place sits on its map, as a crop to picture it: an area's box, or a square round a pin. */
export function placeCrop(map, place) {
  const { width = 1, height = 1 } = map.image ?? {};
  let x1, y1, x2, y2;
  if (place.points?.length) {
    const xs = place.points.map((p) => p[0]);
    const ys = place.points.map((p) => p[1]);
    const pad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.1;
    [x1, y1, x2, y2] = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  } else {
    const r = Math.max(map.grid?.size ? map.grid.size * 4 : 0, Math.min(width, height) * 0.12);
    [x1, y1, x2, y2] = [place.x - r, place.y - r, place.x + r, place.y + r];
  }
  x1 = Math.max(0, x1);
  y1 = Math.max(0, y1);
  return { x: Math.round(x1), y: Math.round(y1), w: Math.max(1, Math.round(Math.min(width, x2) - x1)), h: Math.max(1, Math.round(Math.min(height, y2) - y1)) };
}

/**
 * A new page (the DM's alone) for a place or token on a map, linked to it: named after it, its kind from the map's
 * kind or the token's, a picture cut from the map for a place, and inside the page of the place that opens this map.
 */
export async function makePageFor({ wiki, maps, wikiPictures }, cid, { map_id, kind, id }, { by }) {
  const map = maps.get(cid, map_id);
  const list = kind === 'place' ? map.places : map.tokens;
  const thing = list.find((x) => x.id === id);
  if (!thing) throw new NotFoundError(kind === 'place' ? 'No such place' : 'No such token');
  if (thing.page && wiki.list(cid).some((p) => p.id === thing.page.id)) return { page: wiki.get(cid, thing.page.id), made: false };
  const opener = maps.list(cid).flatMap((m) => m.places ?? []).find((p) => p.to === map.id && p.page);
  const parent = kind === 'place' && opener && wiki.list(cid).some((p) => p.id === opener.page.id) ? opener.page.id : null;
  const picture = kind === 'place' ? await wikiPictures.copy(cid, { kind: 'map', id: map.id, crop: placeCrop(map, thing) }, { by }) : null;
  const name = thing.name || (kind === 'place' ? 'A place' : 'Someone');
  const taken = new Set(wiki.list(cid).flatMap((p) => [p.title, ...p.aliases]).map((n) => n.toLowerCase()));
  let title = name;
  for (let n = 2; taken.has(title.toLowerCase()); n++) title = `${name} (${map.name}${n > 2 ? ` ${n - 1}` : ''})`;
  const page = await wiki.create(cid, {
    title, aliases: [], kind: kind === 'place' ? PLACE_KIND[map.kind] ?? 'place' : TOKEN_KIND[thing.kind] ?? 'npc',
    parent, tags: [], available: 'dm', sections: [], picture: picture && { id: picture.id, caption: '', available: 'all' }, banner: null, gallery: [], facts: [],
  }, { by });
  maps.change(cid, map.id, (doc) => {
    const x = (kind === 'place' ? doc.places : doc.tokens).find((y) => y.id === id);
    if (x) x.page = { id: page.id, title: page.title };
  }, { by, reason: 'wiki page made' });
  return { page, made: true };
}

/** The family colour key of a page, and what the Atlas needs to draw it. */
const atlasPage = (p) => ({ ...summary(p), family: kindFamily(p.kind), dated: !!(p.when?.from != null || p.events?.some((e) => e.when?.from != null)) });

const shownToViewer = (thing, uid, { revealed = 'revealed', to = 'revealed_to' } = {}) => !!thing[revealed] && (thing[to] == null || thing[to].includes(uid));

/**
 * Where each page is pinned (the first place linked to it), for the Timeline's Show on the
 * map: Map(page id → { map_id, map_name, place_id, x, y }). As a player (`as`), only places revealed to them on maps
 * shown to them.
 */
export function pagePlaces(maps, cid, { as = null } = {}) {
  const out = new Map();
  for (const m of maps.list(cid)) {
    if (as != null && !shownToViewer(m, as, { revealed: 'shown', to: 'shown_to' })) continue;
    for (const p of m.places ?? []) {
      if (!p.page || out.has(p.page.id) || (as != null && !shownToViewer(p, as))) continue;
      out.set(p.page.id, { map_id: m.id, map_name: m.name, place_id: p.id, x: p.x, y: p.y });
    }
  }
  return out;
}

/**
 * The Atlas's wiki layers for one map, from the pages this viewer may see (`pages`, filtered already) and, as a
 * player (`as`), only the places revealed to them and tokens not hidden (their fog isn't recreated):
 * - pins: places with a page, each with counts of what's inside it, the people there and its quests;
 * - lands: areas whose page is a faction's;
 * - people: tokens with a person's page, and people whose "Where they are" names a place pinned here;
 * - quests: quests whose "Where" names a place pinned here, or whose "Given by" names someone shown here.
 * Returns null when the viewer can't see the map.
 */
export function atlasLayers(map, pages, { as = null } = {}) {
  if (as != null && !shownToViewer(map, as, { revealed: 'shown', to: 'shown_to' })) return null;
  const byId = new Map(pages.map((p) => [p.id, p]));
  const byName = new Map();
  for (const p of pages) for (const n of [p.title, ...(as == null ? p.aliases : [])]) if (!byName.has(wikiKey(n))) byName.set(wikiKey(n), p);
  const linked = (p, labels) => p.facts.filter((f) => labels.includes(wikiKey(f.label))).flatMap((f) => wikiLinks(f.value)).map((n) => byName.get(wikiKey(n))).filter(Boolean);
  const places = map.places.filter((p) => p.page && byId.has(p.page.id) && (as == null || shownToViewer(p, as)));
  const at = new Map(places.map((p) => [p.page.id, p]));
  const people = [];
  for (const t of map.tokens) {
    const page = t.page && byId.get(t.page.id);
    if (!page || kindFamily(page.kind) !== 'person' || (as != null && t.hidden)) continue;
    people.push({ x: t.x, y: t.y, from: 'token', token_id: t.id, page: atlasPage(page) });
  }
  const placed = new Set(people.map((x) => x.page.id));
  for (const p of pages) {
    if (kindFamily(p.kind) !== 'person' || placed.has(p.id)) continue;
    const where = linked(p, ['where they are', 'where', 'location']).map((x) => at.get(x.id)).find(Boolean);
    if (where) {
      people.push({ x: where.x, y: where.y, from: 'place', place_id: where.id, page: atlasPage(p) });
      placed.add(p.id);
    }
  }
  const personAt = new Map(people.map((x) => [x.page.id, x]));
  const quests = [];
  for (const p of pages) {
    if (kindFamily(p.kind) !== 'quest') continue;
    const where = linked(p, ['where', 'location']).map((x) => at.get(x.id)).find(Boolean);
    const giver = !where && linked(p, ['given by']).map((x) => personAt.get(x.id)).find(Boolean);
    if (where) quests.push({ x: where.x, y: where.y, from: 'where', place_id: where.id, page: atlasPage(p) });
    else if (giver) quests.push({ x: giver.x, y: giver.y, from: 'given_by', place_id: giver.place_id ?? null, page: atlasPage(p) });
  }
  const count = (list, placeId) => list.filter((x) => x.place_id === placeId).length;
  const pins = places.map((pl) => {
    const page = byId.get(pl.page.id);
    return {
      place_id: pl.id, name: pl.name, x: pl.x, y: pl.y, points: pl.points ?? null, to: pl.to ?? null, page: atlasPage(page),
      counts: { inside: pages.filter((x) => x.parent === page.id).length, people: count(people, pl.id), quests: count(quests, pl.id) },
    };
  });
  const lands = pins.filter((x) => x.points && x.page.family === 'faction').map((x) => ({ place_id: x.place_id, points: x.points, page: x.page }));
  return { map: { id: map.id, name: map.name }, pins, lands, people, quests };
}
