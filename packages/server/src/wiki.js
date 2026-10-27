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
import { wikiPieces, narrowest, canSeeAudience, audienceOf, blockAudience, unknownBlockNames, wikiLinks, unlink, unpicture, wikiKey, isPictureId, pagePictureIds, normalizeCanon, playerCanon, canonMarker, TONES, LINK_RE, EMBED_RE, APP_EMBED_RE, PICTURE_RE, normalizeSheetShare } from '@dndapp/shared/wiki.js';
import { normalizeSources } from '@dndapp/shared/citations.js';
import { parseWhen, whenText } from '@dndapp/shared/wiki-time.js';

export const WIKI_LIMITS = { title: 200, kind: 60, alias: 200, aliases: 50, tags: 30, tag: 60, sections: 200, heading: 200, text: 200_000, caption: 300, gallery: 60, facts: 60, label: 60, value: 500, truth: 2000, events: 100, event: 2000, when: 200 };

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

/**
 * Who wrote a fact or an event besides the DM: the AI, or a player (their character's lore, stage 6c, with
 * `owner` their user id: only they may change it, and the AI never rewrites it).
 */
function byOf(x) {
  if (x?.by === 'ai') return { by: 'ai' };
  if (x?.by === 'player' && Number(x.owner) > 0) return { by: 'player', owner: Number(x.owner) };
  return {};
}

/** How we know a part (stage 3b): the transcript citations it came from, kept only when there are some. */
function sourcesOf(x) {
  const sources = normalizeSources(x?.sources);
  return sources.length ? { sources } : {};
}

/**
 * An in-game time (stage 4b, shared/src/wiki-time.js): { text, from, to } in minutes of the clock, from and to
 * null when the text isn't a time the parser knows. Null for none.
 */
function normalizeWhen(w) {
  const text = String(w?.text ?? '').trim().slice(0, WIKI_LIMITS.when);
  if (!text) return null;
  const at = (n) => (Number.isFinite(n) ? Math.round(n) : null);
  const from = at(w.from);
  const to = from == null ? null : Math.max(from, at(w.to) ?? from);
  return { text, from, to };
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
    parent: p.parent && isWikiId(p.parent) && p.parent !== p.id && !p.template ? String(p.parent) : null,
    tags: [...new Set(list(p.tags))],
    // The whole page: only the DM until the DM shares it. A template (stage 5a) is always the DM's.
    available: p.template ? 'dm' : normalizeAvailable(p.available, 'dm'),
    // A template for new pages of its kind (stage 5a): its sections' text and facts' values are writing prompts.
    // Kept apart from the wiki: never in Ask, the views, the AI's reading or a player's wiki.
    ...(p.template && { template: true }),
    // A player character's page (stage 6b): whose character it is, and which parts of their sheet (drawn live,
    // never copied) the player shares with the other players.
    ...(Number(p.player) > 0 && Number.isInteger(Number(p.player)) && !p.template && { player: Number(p.player), sheet_share: normalizeSheetShare(p.sheet_share) }),
    sections: (Array.isArray(p.sections) ? p.sections : []).map((s) => ({
      id: String(s.id ?? crypto.randomBytes(3).toString('hex')),
      heading: String(s.heading ?? '').trim(),
      text: String(s.text ?? ''),
      // Who wrote it: the DM, the AI (a proposal the DM approved as it was), or a player (their character's lore, stage 6c).
      by: byOf(s).by ?? 'dm',
      // 'all' here means "as the page".
      available: normalizeAvailable(s.available, 'all'),
      ...canonOf(s),
      ...sourcesOf(s),
      ...(byOf(s).owner && { owner: byOf(s).owner }),
    })),
    // Pictures (2026-10-21): the main picture (a portrait, a view of the place) beside the facts, a banner across the top, and a gallery.
    picture: normalizePicture(p.picture),
    banner: normalizePicture(p.banner, { banner: true }),
    gallery: (Array.isArray(p.gallery) ? p.gallery : []).map((x) => normalizePicture(x)).filter(Boolean).slice(0, WIKI_LIMITS.gallery),
    // At a glance (an infobox): short facts like "Race: Half-elf", each with who it's available to ('all' = as the page).
    facts: (Array.isArray(p.facts) ? p.facts : [])
      .map((f) => ({ label: String(f?.label ?? '').trim().slice(0, WIKI_LIMITS.label), value: String(f?.value ?? '').trim().slice(0, WIKI_LIMITS.value), available: normalizeAvailable(f?.available, 'all'), ...canonOf(f), ...sourcesOf(f), ...(TONES.includes(f?.tone) && { tone: f.tone }), ...byOf(f) }))
      .filter((f) => f.label || f.value)
      .slice(0, WIKI_LIMITS.facts),
    // When it happened (stage 4b): a session, a war, a birth. Null for no time.
    when: normalizeWhen(p.when),
    // Dated lines on the page ("Day 12: the mill burned"), each with who it's for, its canon and how we know it.
    events: (Array.isArray(p.events) ? p.events : [])
      .map((e) => ({
        id: /^[a-f0-9]{6}$/.test(String(e?.id)) ? String(e.id) : crypto.randomBytes(3).toString('hex'),
        when: normalizeWhen(e?.when),
        text: String(e?.text ?? '').trim().slice(0, WIKI_LIMITS.event),
        available: normalizeAvailable(e?.available, 'all'),
        ...canonOf(e),
        ...sourcesOf(e),
        ...byOf(e),
      }))
      .filter((e) => e.text)
      .slice(0, WIKI_LIMITS.events),
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
  const all = (cid) => {
    if (!cache.has(cid)) {
      cache.set(cid, db.prepare('SELECT data FROM wiki_pages WHERE campaign_id = ? ORDER BY id').all(cid).map((r) => normalizeWikiPage(JSON.parse(r.data))).filter((p) => !p.removed));
    }
    return cache.get(cid);
  };
  // The wiki's pages; templates (stage 5a) are kept apart.
  const rows = (cid) => structuredClone(all(cid).filter((p) => !p.template));
  const templateRows = (cid) => structuredClone(all(cid).filter((p) => p.template));

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
    if (page.template) return null;
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
    const events = page.events.filter((e) => e.canon !== 'planned' && sees(e)).map(forPlayer);
    const visible = parts(page, roster).filter((p) => p.text.trim() && canSeeAudience(viewer, p.audience));
    // A character's page shows to whoever may see the page, even before anything is written on it (its sheet parts are live).
    if (!visible.length && !facts.length && !events.length && !picture && !banner && !gallery.length && !page.player) return null;
    const sections = [];
    for (const p of visible) {
      const last = sections.at(-1);
      if (last?.id === p.section.id) last.text += `\n\n${p.text}`;
      else sections.push({ ...forPlayer(p.section), text: p.text });
    }
    // Other names can be secrets: a player gets only the title.
    return { ...page, aliases: [], sections, picture, banner, gallery, facts, events };
  }

  /** What a page's facts and picture captions say, grouped by who they're available to (for search). */
  function extras(page, roster = [], calendar = null) {
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
    // Times as the calendar says them, so Ask finds "what happened on Day 12".
    if (page.when) add({ available: 'all' }, `When: ${whenText(page.when, calendar)}`);
    for (const e of page.events) add(e, `${mark(e)}${e.when ? `${whenText(e.when, calendar)}: ` : ''}${unlink(e.text)}`);
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
    if (page.removed || page.template) return search.removeDocs(cid, { kind: 'wiki', ref_id: page.id });
    const docs = parts(page, roster)
      .filter((p) => p.text.trim())
      .map((p) => ({
        title: `${page.title}${p.section.heading ? ` › ${p.section.heading}` : ''}`,
        // A live embed's name (stage 9a) is searchable only in the DM's own parts: players find it per their access.
        text: `${page.kind ? `(${page.kind}) ` : ''}${page.title}\n${partMarker(p.section, roster)}${unpicture(unlink(Array.isArray(p.audience) && !p.audience.length ? p.text : p.text.replace(APP_EMBED_RE, '')))}`,
        visible_to: p.audience,
      }));
    // The truth beside a falsehood is the DM's alone: a doc of its own nobody else finds.
    for (const x of [...page.sections, ...page.facts, ...page.events, page.picture, page.banner, ...page.gallery]) {
      if (x?.canon === 'false' && x.truth) docs.push({ title: `${page.title} › The truth`, text: `${page.title}\nThe truth (players believe otherwise): ${x.truth}`, visible_to: [] });
    }
    for (const g of extras(page, roster, store.getSettings(cid).calendar)) docs.push({ title: `${page.title} › At a glance`, text: `${page.kind ? `(${page.kind}) ` : ''}${page.title}\n${g.lines.join('\n')}`, visible_to: g.audience });
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
    for (const p of page.template ? templateRows(cid) : rows(cid)) {
      if (p.id === excludeId) continue;
      for (const n of [p.title, ...p.aliases]) taken.set(wikiKey(n), p.title);
    }
    for (const n of [page.title, ...page.aliases]) {
      if (taken.has(wikiKey(n))) throw new BadRequestError(`"${n}" is already the name of the page "${taken.get(wikiKey(n))}".`);
    }
    // One page for each player's character.
    const theirs = page.player && rows(cid).find((p) => p.player === page.player && p.id !== excludeId);
    if (theirs) throw new BadRequestError(`"${theirs.title}" is already that player's character page.`);
    if (page.parent) {
      // No loops: walking up from the parent must never reach this page.
      const byId = new Map(rows(cid).map((p) => [p.id, p]));
      if (!byId.has(page.parent)) throw new BadRequestError('No such parent page.');
      for (let at = page.parent, steps = 0; at; at = byId.get(at)?.parent, steps++) {
        if (at === page.id || steps > 1000) throw new BadRequestError("A page can't be inside itself.");
      }
    }
  }

  /**
   * Work out the in-game times of a page's `when` and events from their text (stage 4b), with the campaign's
   * calendar and clock as they are now ("300 years ago" is from today). A time whose text didn't change keeps
   * what was worked out before, so it doesn't drift as the clock moves; one that comes with from and to
   * (a restored version) keeps them.
   */
  function dated(cid, fields, before = null) {
    const { calendar, clock } = store.getSettings(cid);
    const date = (w, old) => {
      if (!w || !String(w.text ?? '').trim()) return null;
      if ('from' in w) return w;
      if (old && old.text === String(w.text).trim()) return old;
      return parseWhen(w.text, calendar, { now: clock });
    };
    const out = { ...fields };
    if ('when' in fields) out.when = date(fields.when, before?.when);
    if (fields.events) {
      const was = new Map((before?.events ?? []).map((e) => [e.id, e]));
      out.events = fields.events.map((e) => {
        const old = e.id && was.get(e.id);
        const next = { ...e, when: date(e.when, old?.when) };
        // An event saved unchanged stays the AI's (as facts do).
        if (!e.by && old?.by === 'ai' && old.text === String(e.text ?? '').trim()) next.by = 'ai';
        return next;
      });
    }
    return out;
  }

  const wiki = {
    events,
    /** A page; a template (stage 5a) only with `templates` (the DM editing it), never for Ask, maps or the views. */
    get(cid, id, { templates = false } = {}) {
      if (!isWikiId(id)) throw new NotFoundError('No such page');
      const r = db.prepare('SELECT data FROM wiki_pages WHERE id = ? AND campaign_id = ?').get(id, cid);
      const page = r && normalizeWikiPage(JSON.parse(r.data));
      if (!page || page.removed || (page.template && !templates)) throw new NotFoundError('No such page');
      return page;
    },

    /** Every page (the DM's list). */
    list: (cid) => rows(cid),

    /** The DM's own templates (stage 5a). */
    templates: (cid) => templateRows(cid),

    /** The page as a viewer may see it, or null. The DM gets it whole. */
    forViewer(cid, page, viewer) {
      if (!viewer || viewer.seesAll) return filtered(page, viewer, players(cid));
      return wiki.listFor(cid, viewer).find((p) => p.id === page.id) ?? null;
    },

    /**
     * How much of each page a player gets (who knows what, stage 8b): page id -> 'all', 'some' or 'none'. The parts
     * are the sections' blocks, facts, events and pictures; planned ones are the DM's and never counted.
     */
    coverage(cid, viewer) {
      const roster = players(cid);
      const out = new Map();
      for (const page of rows(cid)) {
        const pageAudience = audienceOf(page.available);
        if (!filtered(page, viewer, roster)) {
          out.set(page.id, 'none');
          continue;
        }
        const own = [page.picture, page.banner, ...page.gallery, ...page.facts.filter((f) => f.canon !== 'planned'), ...page.events.filter((e) => e.canon !== 'planned')].filter(Boolean)
          .map((x) => narrowest(pageAudience, audienceOf(x.available)));
        const audiences = [...parts(page, roster).filter((x) => x.text.trim() && x.section.canon !== 'planned').map((x) => x.audience), ...own];
        out.set(page.id, audiences.every((a) => canSeeAudience(viewer, a)) ? 'all' : 'some');
      }
      return out;
    },

    /**
     * Every page as a viewer may see it (stage 6a). For a player: no hidden parent, and a link to a page they can't
     * see becomes its words (a link's target is a page's name, which can be a secret).
     */
    listFor(cid, viewer) {
      const roster = players(cid);
      const all = rows(cid);
      if (!viewer || viewer.seesAll) return all;
      const pages = all.map((p) => filtered(p, viewer, roster)).filter(Boolean);
      const ids = new Set(pages.map((p) => p.id));
      const titles = new Map(pages.map((p) => [wikiKey(p.title), p.title]));
      // Other names of pages they see link to the title; anything else is just its words.
      const byAlias = new Map(all.filter((p) => ids.has(p.id)).flatMap((p) => p.aliases.map((a) => [wikiKey(a), p.title])));
      // An embed of a page they see stays (by its title); any other vanishes without a trace.
      // A live embed (stage 9a) of something they may see stays; any other goes, name and all.
      const relink = (text) => String(text ?? '').replace(APP_EMBED_RE, (m, kind, name) => (wiki.appEmbeds?.visibleTo(cid, kind.toLowerCase(), name.trim(), viewer.userId) ? m : '')).replace(EMBED_RE, (m, name) => {
        const title = titles.get(wikiKey(name)) ?? byAlias.get(wikiKey(name));
        return title ? `[[!${title}]]` : '';
      }).replace(LINK_RE, (m, name, shown) => {
        if (name.startsWith('!') || /^(creature|item|merchant|handout|map):/i.test(name)) return m; // an embed kept above
        const words = (shown ?? name).trim();
        const title = titles.get(wikiKey(name)) ?? byAlias.get(wikiKey(name));
        return title ? `[[${title}${shown || wikiKey(title) !== wikiKey(name) ? `|${words}` : ''}]]` : words;
      });
      return pages.map((p) => ({
        ...p,
        parent: p.parent && ids.has(p.parent) ? p.parent : null,
        // A section that was only an embed they can't see goes too.
        sections: p.sections.map((s) => ({ ...s, text: relink(s.text) })).filter((s) => s.text.trim()),
        facts: p.facts.map((f) => ({ ...f, value: relink(f.value) })),
        events: p.events.map((e) => ({ ...e, text: relink(e.text) })),
      }));
    },

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

    /**
     * Names in a page's sections that match another page but aren't linked (stage 5b, no AI): [{ section_id, name,
     * page_id, title }], the first of each name per section. Words inside [[links]], pictures and :::blocks' first
     * lines don't count; nor do the page's own names or pages the section already links.
     */
    linkSuggestions(cid, page) {
      const own = new Set([page.title, ...page.aliases].map(wikiKey));
      const names = rows(cid).filter((p) => p.id !== page.id).flatMap((p) => [p.title, ...p.aliases].map((n) => ({ n, p })))
        .filter(({ n }) => n.length >= 3 && !own.has(wikiKey(n)))
        .sort((a, b) => b.n.length - a.n.length); // the longest name first ("Lord Vex" before "Vex")
      const out = [];
      for (const s of page.sections) {
        // Blank out what can't be linked, keeping the positions.
        let text = s.text.replace(LINK_RE, (m) => ' '.repeat(m.length)).replace(PICTURE_RE, (m) => ' '.repeat(m.length)).replace(/^:::.*$/gm, (m) => ' '.repeat(m.length));
        // A page this section already links isn't offered again.
        const linked = new Set(wikiLinks(s.text).map(wikiKey));
        const seen = new Set(names.filter(({ n }) => linked.has(wikiKey(n))).map(({ p }) => p.id));
        for (const { n, p } of names) {
          const re = new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');
          const m = re.exec(text);
          if (!m || seen.has(p.id)) continue;
          seen.add(p.id);
          out.push({ section_id: s.id, name: m[0], page_id: p.id, title: p.title, at: m.index });
          text = text.slice(0, m.index) + ' '.repeat(m[0].length) + text.slice(m.index + m[0].length);
        }
      }
      return out.slice(0, 100);
    },

    /** Link it: the first unlinked mention of a page in a section becomes a [[link]] (keeping the words shown). */
    async linkIt(cid, pageId, sectionId, targetId, { by, version }) {
      const page = wiki.get(cid, pageId);
      const s = wiki.linkSuggestions(cid, page).find((x) => x.section_id === sectionId && x.page_id === targetId);
      if (!s) throw new BadRequestError('There is nothing to link there now.');
      const link = s.name === s.title ? `[[${s.title}]]` : `[[${s.title}|${s.name}]]`;
      const sections = page.sections.map((x) => (x.id === sectionId ? { ...x, text: x.text.slice(0, s.at) + link + x.text.slice(s.at + s.name.length) } : x));
      return wiki.update(cid, pageId, { sections }, { by, version });
    },

    /** The names of deleted pages (Tidy up, stage 8c: a fact still linking one), lower case. */
    removedNames(cid) {
      const live = new Set(rows(cid).flatMap((p) => [p.title, ...p.aliases]).map(wikiKey));
      return new Set(db.prepare('SELECT data FROM wiki_pages WHERE campaign_id = ?').all(cid).map((r) => normalizeWikiPage(JSON.parse(r.data)))
        .filter((p) => p.removed).flatMap((p) => [p.title, ...p.aliases]).map(wikiKey).filter((k) => !live.has(k)));
    },

    /** Names in `:::for` blocks that match no player, so the editor can say so. */
    unknownNames: (cid, page) => unknownBlockNames(page.sections.map((s) => s.text), players(cid)),

    /** A new page: { title, aliases?, kind?, parent?, tags?, available?, sections? }. */
    async create(cid, fields, { by }) {
      const now = new Date().toISOString();
      const page = normalizeWikiPage({ ...dated(cid, fields), id: crypto.randomBytes(5).toString('hex'), version: 1, created_by: by, created_at: now, updated_by: by, updated_at: now });
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
      const before = wiki.get(cid, id, { templates: true });
      if (version != null && version !== before.version) {
        throw new ArchiveConflictError('This page was changed since you opened it. Open it again to see the changes, then make yours.');
      }
      fields = dated(cid, fields, before);
      const next = { ...before, ...fields };
      // Who wrote each section: an AI section the DM changes becomes the DM's for good (owner, 2026-10-20); one saved unchanged stays the AI's.
      if (fields.sections) {
        const was = new Map(before.sections.map((s) => [s.id, s]));
        next.sections = fields.sections.map((s) => {
          if (s.by) return s;
          const old = s.id && was.get(s.id);
          // A player's lore (stage 6c) saved unchanged stays theirs; the DM changing it makes it the DM's, as with the AI's.
          const same = old && old.by !== 'dm' && old.text === s.text && old.heading === (s.heading ?? '').trim();
          return { ...s, by: same ? old.by : 'dm', ...(same && old.owner != null && old.by === 'player' && { owner: old.owner }) };
        });
      }
      // The same for facts (a tie the AI added, stage 3e): one saved unchanged stays the AI's.
      if (fields.facts) {
        next.facts = fields.facts.map((f) => {
          if (f.by) return f;
          const old = before.facts.find((o) => (o.by === 'ai' || o.by === 'player') && wikiKey(o.label) === wikiKey(f.label) && o.value === String(f.value ?? '').trim());
          return old ? { ...f, by: old.by, ...(old.by === 'player' && { owner: old.owner }) } : f;
        });
      }
      // And events (the AI's, stage 4d, and a player's, stage 6c), by id.
      if (fields.events) {
        next.events = fields.events.map((e) => {
          if (e.by) return e;
          const old = e.id && before.events.find((o) => o.id === e.id && o.by && o.text === String(e.text ?? '').trim() && (o.when?.text ?? '') === (e.when?.text ?? '').trim());
          return old ? { ...e, ...byOf(old) } : e;
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
      const page = wiki.get(cid, id, { templates: true });
      const now = new Date().toISOString();
      for (const child of rows(cid).filter((p) => p.parent === id)) {
        write(cid, { ...child, parent: page.parent, version: child.version + 1, updated_by: by, updated_at: now });
      }
      write(cid, { ...page, removed: true, version: page.version + 1, updated_by: by, updated_at: now });
      search.removeDocs(cid, { kind: 'wiki', ref_id: id });
    },

    /** Every saved version of a page, newest first: { version, updated_at, updated_by, title }. */
    history(cid, id) {
      wiki.get(cid, id, { templates: true });
      return archive
        .readWikiChanges(store.getCampaign(cid).slug, id)
        .map(normalizeWikiPage)
        .map((p) => ({ version: p.version, updated_at: p.updated_at, updated_by: p.updated_by, title: p.title }))
        .reverse();
    },

    /** One saved version of a page, whole. */
    version(cid, id, version) {
      wiki.get(cid, id, { templates: true });
      const found = archive.readWikiChanges(store.getCampaign(cid).slug, id).map(normalizeWikiPage).findLast((p) => p.version === version);
      if (!found) throw new NotFoundError('No such version');
      return found;
    },

    /** Bring back an earlier version, as a new save (nothing is lost: the version it replaces stays in the history). */
    async restore(cid, id, version, { by }) {
      const old = wiki.version(cid, id, version);
      const { title, aliases, kind, parent, tags, available, sections, picture, banner, gallery, facts, when, events } = old;
      const current = wiki.get(cid, id, { templates: true });
      return wiki.update(cid, id, { title, aliases, kind, parent: parent && rows(cid).some((p) => p.id === parent) ? parent : null, tags, available, sections, picture, banner, gallery, facts, when, events }, { by, version: current.version });
    },

    /** Index every page again (after a rebuild wipes the search index, or a restore from the archive). */
    async reindex(cid) {
      const roster = players(cid);
      for (const p of rows(cid)) await index(cid, p, roster);
    },
  };
  return wiki;
}
