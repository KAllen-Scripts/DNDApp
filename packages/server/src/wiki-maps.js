import { NotFoundError } from './store.js';

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
