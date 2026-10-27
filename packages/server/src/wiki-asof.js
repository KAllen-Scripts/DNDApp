/**
 * Scrubbing through time (wiki space stage 11): the wiki and the maps as they were at a moment, worked out from the
 * archive (never stored twice): each page's version saved by then (`readWikiChanges`), each map's change lines
 * replayed to then (`readMapChanges`). A moment is a time (ISO); the moments offered are the ends of the sessions
 * played (the day played, plus the late-night rollover).
 *
 * Per viewer, a player is judged by their access then AND now: a page, a part of one, a place or a token they
 * couldn't see then or can't see now is left out.
 */
import { normalizeMap } from '@dndapp/shared/map.js';
import { applyJson } from './sheets/store.js';
import { normalizeWikiPage } from './wiki.js';

const CACHE_SIZE = 200;

export function createWikiAsOf({ db, wiki, maps, archive, store, config }) {
  const cache = new Map();
  const slug = (cid) => store.getCampaign(cid).slug;
  // A moment in the past never changes, so what was built for it is kept (a few hundred, oldest dropped first).
  const cached = (key, at, make) => {
    if (Date.parse(at) > Date.now() - 1000) return make();
    if (cache.has(key)) {
      const v = cache.get(key);
      cache.delete(key);
      cache.set(key, v);
      return v;
    }
    const v = make();
    cache.set(key, v);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
    return v;
  };

  /** Every page as it was at `at` (the DM's: whole, with their parts' settings then). */
  function pagesThen(cid, at) {
    return cached(`${cid}:pages:${at}`, at, () => {
      const ids = db.prepare('SELECT id FROM wiki_pages WHERE campaign_id = ?').all(cid).map((r) => r.id);
      const out = [];
      for (const id of ids) {
        const then = archive.readWikiChanges(slug(cid), id).filter((v) => String(v.updated_at ?? v.created_at) <= at).at(-1);
        if (!then) continue;
        const page = normalizeWikiPage(then);
        if (!page.removed && !page.template) out.push(page);
      }
      return out;
    });
  }

  /** A map as it was at `at` (whole, unfiltered), or null when it didn't exist then or was removed. */
  function mapThen(cid, id, at) {
    return cached(`${cid}:map:${id}:${at}`, at, () => {
      let raw = null;
      let version = 0;
      for (const e of archive.readMapChanges(slug(cid), id)) {
        if (String(e.saved_at) > at) break;
        raw = applyJson(raw ?? {}, e.changes);
        version = e.version;
      }
      if (!raw) return null;
      const m = { id, campaign_id: cid, ...normalizeMap(structuredClone(raw)), version };
      return m.removed ? null : m;
    });
  }

  /** A page as a player saw it then, cut to what they may also see now (`now`: the page as they get it now). */
  function bothTimes(cid, page, now, viewer) {
    const then = wiki.filterFor(cid, page, viewer);
    if (!then || !now) return null;
    const sections = new Map(now.sections.map((s) => [s.id, s]));
    const facts = new Set(now.facts.map((f) => f.label));
    const events = new Set(now.events.map((e) => e.id));
    const pics = new Set([now.picture?.id, now.banner?.id, ...now.gallery.map((g) => g.id)].filter(Boolean));
    return {
      ...then,
      parent: then.parent && now.parent === then.parent ? then.parent : null,
      // A section's words as they were then, if the player gets that section now.
      sections: then.sections.filter((s) => sections.has(s.id)),
      facts: then.facts.filter((f) => facts.has(f.label)),
      events: then.events.filter((e) => events.has(e.id)),
      picture: then.picture && pics.has(then.picture.id) ? then.picture : null,
      banner: then.banner && pics.has(then.banner.id) ? then.banner : null,
      gallery: then.gallery.filter((g) => pics.has(g.id)),
    };
  }

  return {
    /** The moments to scrub to: the end of each session played, oldest first. [{ number, title, played_on, at }] */
    moments(cid) {
      const rollover = Number(config?.notes?.rolloverHour ?? 0);
      return db.prepare('SELECT number, title, played_on FROM sessions WHERE campaign_id = ? ORDER BY number').all(cid)
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.played_on))
        .map((s) => ({ number: s.number, title: s.title ?? '', played_on: s.played_on, at: new Date(Date.parse(`${s.played_on}T23:59:59.999Z`) + rollover * 3600_000).toISOString() }));
    },

    /** The pages as `as` (a player id, or null for the DM) gets them at `at`. */
    pages(cid, at, as = null) {
      const then = pagesThen(cid, at);
      if (as == null) return structuredClone(then);
      const viewer = { userId: as, seesAll: false };
      const now = new Map(wiki.listFor(cid, viewer).map((p) => [p.id, p]));
      return then.map((p) => bothTimes(cid, p, now.get(p.id), viewer)).filter(Boolean);
    },

    /**
     * A map as `as` gets it at `at`: whole for the DM; for a player, only if it's shown to them then and now, with
     * the places and tokens they could see then that they can also see now (or that are gone since). Null for none.
     */
    map(cid, id, at, as = null) {
      const then = mapThen(cid, id, at);
      if (!then || as == null) return then && structuredClone(then);
      const viewer = { role: 'player', userId: as };
      let current = null;
      try {
        current = maps.get(cid, id);
      } catch {
        return null;
      }
      const seenThen = maps.view(structuredClone(then), viewer);
      const seenNow = current && maps.view(current, viewer);
      if (!seenThen || !seenNow) return null;
      const placesNow = new Set(seenNow.places.map((p) => p.id));
      const tokensNow = new Set(seenNow.tokens.map((t) => t.id));
      const existsNow = new Set(current.tokens.map((t) => t.id));
      return {
        ...then,
        places: then.places.filter((p) => placesNow.has(p.id) && seenThen.places.some((x) => x.id === p.id)),
        tokens: then.tokens.filter((t) => seenThen.tokens.some((x) => x.id === t.id) && (tokensNow.has(t.id) || !existsNow.has(t.id))),
      };
    },
  };
}
