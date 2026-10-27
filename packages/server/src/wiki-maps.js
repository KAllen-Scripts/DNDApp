/**
 * Where the wiki meets the maps. Maps own the geography and the wiki owns the
 * words, so a place or token on a map links to a page (`page: { id, title }`)
 * and nothing is copied between them. This keeps the links right: a renamed
 * page renames its links (and a place still called by the old title), and a
 * deleted page's links go.
 */

/** Every map place and token linked to a page: [{ map_id, map_name, kind, id, name }] (unfiltered: the DM's). */
export function pageOnMaps(maps, cid, pageId) {
  const out = [];
  for (const m of maps.list(cid)) {
    for (const p of m.places ?? []) if (p.page?.id === pageId) out.push({ map_id: m.id, map_name: m.name, kind: 'place', id: p.id, name: p.name });
    for (const t of m.tokens ?? []) if (t.page?.id === pageId) out.push({ map_id: m.id, map_name: m.name, kind: 'token', id: t.id, name: t.name });
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
