/**
 * The DM's wiki: pages the DM writes about the campaign's world (people,
 * places, factions, lore, plans), kept beside the archivist's knowledge base
 * and never inside it (the archivist doesn't read the wiki).
 *
 * A page has a title, other names (aliases), a kind, an optional parent page,
 * tags, and sections. Each page, each section and each block inside a section
 * (`:::for Thorin` / `:::dm`, see shared/src/wiki.js) says who it's available
 * to: only the DM, everyone, or chosen players. The narrowest one wins.
 *
 * Only the DM has the Wiki tab. Players reach the wiki only through Ask, which
 * searches and reads exactly the parts available to the person asking (the
 * search index gets each part with its audience, like records' known_by).
 *
 * Source data, archive first: wiki/<id>/changes.jsonl gets the whole page on
 * each save, so restore takes the last line and the history is every line.
 * Deleting a page marks it removed; the archive keeps it.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { NotFoundError, BadRequestError } from './store.js';
import { ArchiveConflictError } from './archive.js';
import { wikiPieces, narrowest, canSeeAudience, audienceOf, blockAudience, unknownBlockNames, wikiLinks, unlink, unpicture, wikiKey, isPictureId, pagePictureIds, normalizeCanon, playerCanon, canonMarker, TONES } from '@dndapp/shared/wiki.js';
import { normalizeSources } from '@dndapp/shared/citations.js';

export const WIKI_LIMITS = { title: 200, kind: 60, alias: 200, aliases: 50, tags: 30, tag: 60, sections: 200, heading: 200, text: 200_000, caption: 300, gallery: 60, facts: 60, label: 60, value: 500, truth: 2000 };

export const isWikiId = (id) => /^[a-f0-9]{10}$/.test(String(id));

/** 'all', 'dm', or a list of user ids, from whatever was stored. */
const normalizeAvailable = (a, fallback) => (a === 'all' || a === 'dm' ? a : Array.isArray(a) ? [...new Set(a.map(Number).filter(Number.isInteger))] : fallback);

/**
 * A part's canon (truth and rumour, shared/src/wiki.js CANONS): `canon`, the DM's `truth` beside a falsehood, and the
 * `owner` (a player's user id) of an account.
 */
function canonOf(x) {
  const canon = normalizeCanon(x?.canon);
  const out = { canon };
  if (canon === 'false') out.truth = String(x?.truth ?? '').trim().slice(0, WIKI_LIMITS.truth);
  if (canon === 'told' && Number.isInteger(Number(x?.owner)) && x?.owner != null) out.owner = Number(x.owner);
  return out;
}

/** How we know a part (stage 3b): the transcript citations it came from, kept only when there are some. */
function sourcesOf(x) {
  const sources = normalizeSources(x?.sources);
  return sources.length ? { sources } : {};
}

/** A part as a player gets it: a falsehood is a rumour to them, and the truth is the DM's. */
const forPlayer = ({ truth: _truth, ...x }) => ({ ...x, canon: playerCanon(x.canon) });

/**
 * One of a page's pictures (its main picture, its banner, or one in its
 * gallery): { id, caption, available } ('all' = as the page). A banner also
 * has `focus`, how far down the picture the strip across the top is cut
 * (0 the top, 100 the bottom).
 */
function normalizePicture(x, { banner = false } = {}) {
  if (!x || !isPictureId(x.id)) return null;
  const out = { id: String(x.id), caption: String(x.caption ?? '').trim().slice(0, WIKI_LIMITS.caption), available: normalizeAvailable(x.available, 'all'), ...canonOf(x) };
  if (banner) out.focus = Number.isFinite(Number(x.focus)) ? Math.min(100, Math.max(0, Math.round(Number(x.focus)))) : 50;
  return out;
}

/** A page read from the database or the archive, with anything unknown dropped. Text is never cut short. */
export function normalizeWikiPage(p = {}) {
  const list = (v) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean);
  return {
    id: String(p.id),
    title: String(p.title ?? '').trim(),
    aliases: [...new Set(list(p.aliases))],
    kind: String(p.kind ?? '').trim(),
    parent: p.parent && isWikiId(p.parent) && p.parent !== p.id ? String(p.parent) : null,
    tags: [...new Set(list(p.tags))],
    // The whole page: only the DM until the DM shares it.
    available: normalizeAvailable(p.available, 'dm'),
    sections: (Array.isArray(p.sections) ? p.sections : []).map((s) => ({
      id: String(s.id ?? crypto.randomBytes(3).toString('hex')),
      heading: String(s.heading ?? '').trim(),
      text: String(s.text ?? ''),
      // Who wrote it: the DM, or the AI (a proposal the DM approved as it was).
      by: s.by === 'ai' ? 'ai' : 'dm',
      // 'all' here means "as the page".
      available: normalizeAvailable(s.available, 'all'),
      ...canonOf(s),
      ...sourcesOf(s),
    })),
    // Pictures (2026-10-21): the main picture (a portrait, a view of the place) beside the facts, a banner across the top, and a gallery.
    picture: normalizePicture(p.picture),
    banner: normalizePicture(p.banner, { banner: true }),
    gallery: (Array.isArray(p.gallery) ? p.gallery : []).map((x) => normalizePicture(x)).filter(Boolean).slice(0, WIKI_LIMITS.gallery),
    // At a glance (an infobox): short facts like "Race: Half-elf", each with who it's available to ('all' = as the page).
    facts: (Array.isArray(p.facts) ? p.facts : [])
      .map((f) => ({ label: String(f?.label ?? '').trim().slice(0, WIKI_LIMITS.label), value: String(f?.value ?? '').trim().slice(0, WIKI_LIMITS.value), available: normalizeAvailable(f?.available, 'all'), ...canonOf(f), ...sourcesOf(f), ...(TONES.includes(f?.tone) && { tone: f.tone }) }))
      .filter((f) => f.label || f.value)
      .slice(0, WIKI_LIMITS.facts),
    version: Number(p.version) || 1,
    created_by: p.created_by ?? null,
    created_at: String(p.created_at ?? ''),
    updated_by: p.updated_by ?? p.created_by ?? null,
    updated_at: String(p.updated_at ?? p.created_at ?? ''),
    removed: !!p.removed,
  };
}

/**
 * @param {object} o
 * @param {object} o.search  the search index; the wiki is indexed as kind 'wiki', one doc per part with its audience
 * @param {object} [o.pictures]  the wiki's pictures (src/wiki-pictures.js): a page's main picture, banner and gallery must be among them
 */
export function createWiki({ db, archive, store, search, pictures = null }) {
  // Every page, read once per campaign and kept until the next write (the space's views read them often).
  // Callers get their own copies, so changing one never changes the kept pages.
  const cache = new Map();
  const events = new EventEmitter();
  const rows = (cid) => {
    if (!cache.has(cid)) {
      cache.set(cid, db.prepare('SELECT data FROM wiki_pages WHERE campaign_id = ? ORDER BY id').all(cid).map((r) => normalizeWikiPage(JSON.parse(r.data))).filter((p) => !p.removed));
    }
    return structuredClone(cache.get(cid));
  };

  const players = (cid) => store.roster(cid);

  /**
   * A page's parts with who each is available to: [{ section, text, audience }].
   * Consecutive pieces with the same audience stay together.
   */
  function parts(page, roster) {
    const pageAudience = audienceOf(page.available);
    const out = [];
    for (const section of page.sections) {
      // Planned (the DM's prep) is the DM's only, whatever it's available to.
      const sectionAudience = section.canon === 'planned' ? [] : narrowest(pageAudience, audienceOf(section.available));
      for (const piece of wikiPieces(section.text)) {
        const audience = narrowest(sectionAudience, blockAudience(piece.block, roster));
        const last = out.at(-1);
        const same = last && last.section === section && JSON.stringify(last.audience) === JSON.stringify(audience);
        if (same) last.text += `\n\n${piece.text}`;
        else out.push({ section, text: piece.text, audience });
      }
    }
    return out;
  }

  /**
   * The page as this viewer may see it, or null when nothing on it is
   * available to them. Blocks become plain text (their fences dropped).
   * @param {{ userId: number, seesAll?: boolean }} viewer
   */
  function filtered(page, viewer, roster) {
    if (!viewer || viewer.seesAll) return page;
    const pageAudience = audienceOf(page.available);
    if (!canSeeAudience(viewer, pageAudience)) return null;
    // A picture or a fact is available to the narrowest of the page and its own setting.
    const sees = (x) => x && canSeeAudience(viewer, narrowest(pageAudience, audienceOf(x.available)));
    // A picture's caption can be planned (the picture shows, the caption doesn't); a planned fact is the DM's.
    const pic = (x) => (!sees(x) ? null : x.canon === 'planned' ? { ...forPlayer(x), caption: '', canon: 'true' } : forPlayer(x));
    const picture = pic(page.picture);
    const banner = pic(page.banner);
    const gallery = page.gallery.map(pic).filter(Boolean);
    const facts = page.facts.filter((f) => f.canon !== 'planned' && sees(f)).map(forPlayer);
    const visible = parts(page, roster).filter((p) => p.text.trim() && canSeeAudience(viewer, p.audience));
    if (!visible.length && !facts.length && !picture && !banner && !gallery.length) return null;
    const sections = [];
    for (const p of visible) {
      const last = sections.at(-1);
      if (last?.id === p.section.id) last.text += `\n\n${p.text}`;
      else sections.push({ ...forPlayer(p.section), text: p.text });
    }
    // Other names can be secrets: a player gets only the title.
    return { ...page, aliases: [], sections, picture, banner, gallery, facts };
  }

  /** What a page's facts and picture captions say, grouped by who they're available to (for search). */
  function extras(page, roster = []) {
    const ownerName = (id) => { const m = roster.find((r) => r.user_id === id); return m ? m.character_name || m.name : ''; };
    const pageAudience = audienceOf(page.available);
    const groups = new Map();
    const add = (x, line) => {
      if (!line.trim()) return;
      const audience = x.canon === 'planned' ? [] : narrowest(pageAudience, audienceOf(x.available));
      const key = JSON.stringify(audience);
      if (!groups.has(key)) groups.set(key, { audience, lines: [] });
      groups.get(key).lines.push(line);
    };
    const mark = (x) => { const m = canonMarker(x.canon, { owner: ownerName(x.owner) }); return m ? `${m} ` : ''; };
    for (const f of page.facts) add(f, `${mark(f)}${f.label}${f.label && f.value ? ': ' : ''}${unlink(f.value)}`);
    for (const x of [page.picture, page.banner, ...page.gallery]) if (x?.caption) add(x, `${mark(x)}Picture: ${x.caption}`);
    return [...groups.values()];
  }

  /**
   * Index a page for search: one doc per part, with its audience (the DM sees
   * every doc anyway). Aliases can be secrets (a disguise's real name), so
   * they go in a doc of their own that only the DM finds.
   */
  /** A part's canon marker for search (as a player would read it: the truth is never in a doc players can find). */
  const partMarker = (x, roster) => {
    const owner = roster.find((r) => r.user_id === x.owner);
    const m = canonMarker(x.canon, { owner: owner ? owner.character_name || owner.name : '' });
    return m ? `${m} ` : '';
  };

  async function index(cid, page, roster = players(cid)) {
    if (page.removed) return search.removeDocs(cid, { kind: 'wiki', ref_id: page.id });
    const docs = parts(page, roster)
      .filter((p) => p.text.trim())
      .map((p) => ({
        title: `${page.title}${p.section.heading ? ` › ${p.section.heading}` : ''}`,
        text: `${page.kind ? `(${page.kind}) ` : ''}${page.title}\n${partMarker(p.section, roster)}${unpicture(unlink(p.text))}`,
        visible_to: p.audience,
      }));
    // The truth beside a falsehood is the DM's alone: a doc of its own nobody else finds.
    for (const x of [...page.sections, ...page.facts, page.picture, page.banner, ...page.gallery]) {
      if (x?.canon === 'false' && x.truth) docs.push({ title: `${page.title} › The truth`, text: `${page.title}\nThe truth (players believe otherwise): ${x.truth}`, visible_to: [] });
    }
    for (const g of extras(page, roster)) docs.push({ title: `${page.title} › At a glance`, text: `${page.kind ? `(${page.kind}) ` : ''}${page.title}\n${g.lines.join('\n')}`, visible_to: g.audience });
    if (page.aliases.length) docs.push({ title: page.title, text: `${page.title}\nAlso called: ${page.aliases.join(', ')}`, visible_to: [] });
    await search.replaceDocs(cid, { kind: 'wiki', ref_id: page.id }, docs);
  }

  function write(cid, page) {
    const prev = db.prepare('SELECT data FROM wiki_pages WHERE id = ? AND campaign_id = ?').get(page.id, cid);
    const before = prev ? normalizeWikiPage(JSON.parse(prev.data)) : null;
    archive.appendWikiPage(store.getCampaign(cid).slug, page.id, page);
    db.prepare(
      `INSERT INTO wiki_pages (id, campaign_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(page.id, cid, JSON.stringify(page), page.created_at, page.updated_at);
    cache.delete(cid);
    // Maps keep a linked page's title (wiki-maps.js): they hear when it changes or the page goes.
    if (before && !before.removed && (page.removed || before.title !== page.title)) events.emit(page.removed ? 'removed' : 'renamed', { cid, page, before });
    return page;
  }

  function check(cid, page, excludeId) {
    if (!page.title) throw new BadRequestError('A page needs a title.');
    if (pictures) {
      for (const x of [page.picture, page.banner, ...page.gallery]) if (x && !pictures.has(cid, x.id)) throw new BadRequestError('One of those pictures is missing. Add it again.');
    }
    const taken = new Map();
    for (const p of rows(cid)) {
      if (p.id === excludeId) continue;
      for (const n of [p.title, ...p.aliases]) taken.set(wikiKey(n), p.title);
    }
    for (const n of [page.title, ...page.aliases]) {
      if (taken.has(wikiKey(n))) throw new BadRequestError(`"${n}" is already the name of the page "${taken.get(wikiKey(n))}".`);
    }
    if (page.parent) {
      // No loops: walking up from the parent must never reach this page.
      const byId = new Map(rows(cid).map((p) => [p.id, p]));
      if (!byId.has(page.parent)) throw new BadRequestError('No such parent page.');
      for (let at = page.parent, steps = 0; at; at = byId.get(at)?.parent, steps++) {
        if (at === page.id || steps > 1000) throw new BadRequestError("A page can't be inside itself.");
      }
    }
  }

  const wiki = {
    events,
    get(cid, id) {
      if (!isWikiId(id)) throw new NotFoundError('No such page');
      const r = db.prepare('SELECT data FROM wiki_pages WHERE id = ? AND campaign_id = ?').get(id, cid);
      const page = r && normalizeWikiPage(JSON.parse(r.data));
      if (!page || page.removed) throw new NotFoundError('No such page');
      return page;
    },

    /** Every page (the DM's list). */
    list: (cid) => rows(cid),

    /** The page as a viewer may see it, or null. The DM gets it whole. */
    forViewer: (cid, page, viewer) => filtered(page, viewer, players(cid)),

    /**
     * May this viewer see this picture? The DM sees every one; a player only
     * one on a page, in a part of it, that's available to them (a picture in
     * a `:::dm` block, or a gallery picture only for the DM, never is).
     */
    pictureVisible(cid, id, viewer) {
      if (!viewer || viewer.seesAll) return true;
      const roster = players(cid);
      return rows(cid).some((p) => {
        const mine = filtered(p, viewer, roster);
        return !!mine && pagePictureIds(mine).includes(id);
      });
    },

    /** Pages this viewer has anything available on (for Ask: is the wiki worth offering?). */
    anyFor: (cid, viewer) => rows(cid).some((p) => filtered(p, viewer, players(cid))),

    /** The page with this title (or, for the DM, alias) that the viewer may see, filtered for them, or null. */
    find(cid, name, viewer) {
      const key = wikiKey(name);
      const roster = players(cid);
      const names = (p) => (viewer?.seesAll ? [p.title, ...p.aliases] : [p.title]);
      const page = rows(cid).find((p) => names(p).some((n) => wikiKey(n) === key));
      return page ? filtered(page, viewer, roster) : null;
    },

    /** Pages whose text links to this one (by its title or an alias). */
    mentionedIn(cid, page) {
      const names = new Set([page.title, ...page.aliases].map(wikiKey));
      return rows(cid)
        .filter((p) => p.id !== page.id && p.sections.some((s) => wikiLinks(s.text).some((n) => names.has(wikiKey(n)))))
        .map((p) => ({ id: p.id, title: p.title }));
    },

    /** Names in `:::for` blocks that match no player, so the editor can say so. */
    unknownNames: (cid, page) => unknownBlockNames(page.sections.map((s) => s.text), players(cid)),

    /** A new page: { title, aliases?, kind?, parent?, tags?, available?, sections? }. */
    async create(cid, fields, { by }) {
      const now = new Date().toISOString();
      const page = normalizeWikiPage({ ...fields, id: crypto.randomBytes(5).toString('hex'), version: 1, created_by: by, created_at: now, updated_by: by, updated_at: now });
      check(cid, page);
      write(cid, page);
      await index(cid, page);
      return page;
    },

    /**
     * Save a page. `version` is the one the editor started from; if the page
     * was saved since, nothing changes (409) so nobody's edit is lost. A new
     * title keeps the old one as an alias, so links to it keep working.
     */
    async update(cid, id, fields, { by, version }) {
      const before = wiki.get(cid, id);
      if (version != null && version !== before.version) {
        throw new ArchiveConflictError('This page was changed since you opened it. Open it again to see the changes, then make yours.');
      }
      const next = { ...before, ...fields };
      // Who wrote each section: an AI section the DM changes becomes the DM's for good (owner, 2026-10-20); one saved unchanged stays the AI's.
      if (fields.sections) {
        const was = new Map(before.sections.map((s) => [s.id, s]));
        next.sections = fields.sections.map((s) => {
          if (s.by) return s;
          const old = s.id && was.get(s.id);
          return { ...s, by: old?.by === 'ai' && old.text === s.text && old.heading === (s.heading ?? '').trim() ? 'ai' : 'dm' };
        });
      }
      if (fields.title != null && wikiKey(fields.title) !== wikiKey(before.title)) {
        const aliases = fields.aliases ?? before.aliases;
        next.aliases = aliases.some((a) => wikiKey(a) === wikiKey(before.title)) ? aliases : [...aliases, before.title];
      }
      const page = normalizeWikiPage({ ...next, id: before.id, version: before.version + 1, created_by: before.created_by, created_at: before.created_at, updated_by: by, updated_at: new Date().toISOString(), removed: false });
      page.aliases = page.aliases.filter((a) => wikiKey(a) !== wikiKey(page.title));
      check(cid, page, id);
      write(cid, page);
      await index(cid, page);
      return page;
    },

    /** Delete a page (the archive keeps every version). Pages inside it move up to its parent. */
    async remove(cid, id, { by }) {
      const page = wiki.get(cid, id);
      const now = new Date().toISOString();
      for (const child of rows(cid).filter((p) => p.parent === id)) {
        write(cid, { ...child, parent: page.parent, version: child.version + 1, updated_by: by, updated_at: now });
      }
      write(cid, { ...page, removed: true, version: page.version + 1, updated_by: by, updated_at: now });
      search.removeDocs(cid, { kind: 'wiki', ref_id: id });
    },

    /** Every saved version of a page, newest first: { version, updated_at, updated_by, title }. */
    history(cid, id) {
      wiki.get(cid, id);
      return archive
        .readWikiChanges(store.getCampaign(cid).slug, id)
        .map(normalizeWikiPage)
        .map((p) => ({ version: p.version, updated_at: p.updated_at, updated_by: p.updated_by, title: p.title }))
        .reverse();
    },

    /** One saved version of a page, whole. */
    version(cid, id, version) {
      wiki.get(cid, id);
      const found = archive.readWikiChanges(store.getCampaign(cid).slug, id).map(normalizeWikiPage).findLast((p) => p.version === version);
      if (!found) throw new NotFoundError('No such version');
      return found;
    },

    /** Bring back an earlier version, as a new save (nothing is lost: the version it replaces stays in the history). */
    async restore(cid, id, version, { by }) {
      const old = wiki.version(cid, id, version);
      const { title, aliases, kind, parent, tags, available, sections, picture, banner, gallery, facts } = old;
      const current = wiki.get(cid, id);
      return wiki.update(cid, id, { title, aliases, kind, parent: parent && rows(cid).some((p) => p.id === parent) ? parent : null, tags, available, sections, picture, banner, gallery, facts }, { by, version: current.version });
    },

    /** Index every page again (after a rebuild wipes the search index, or a restore from the archive). */
    async reindex(cid) {
      const roster = players(cid);
      for (const p of rows(cid)) await index(cid, p, roster);
    },
  };
  return wiki;
}
