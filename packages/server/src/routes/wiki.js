/**
 * The DM's wiki (src/wiki.js). Every route is the DM's but one: players have
 * no Wiki tab and reach the wiki only through Ask, which reads just the parts
 * available to them. The one is a picture's bytes, which a player gets only
 * when the picture is in a part of a page available to them.
 */
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../store.js';
import { WIKI_LIMITS as L } from '../wiki.js';
import { MAX_PICTURE_BYTES } from '../images.js';
import { SOURCE_KINDS } from '../wiki-pictures.js';
import { wikiKey, wikiLinks, wikiPieces, unlink, unpicture, audienceOf, canSeeAudience, CANONS, TONES } from '@dndapp/shared/wiki.js';
import { MAX_SOURCES } from '@dndapp/shared/citations.js';
import { createTools } from '../qa/tools.js';
import { webGraph } from '../wiki-web.js';
import { pageOnMaps, makePageFor, atlasLayers, pagePlaces, shownToViewer } from '../wiki-maps.js';
import { timeline } from '../wiki-timeline.js';
import { STARTER_TEMPLATES } from '@dndapp/shared/wiki-templates.js';
import { summary, wheelFamilies, lastSessionPage, recentPages, heroPicture, compass } from '../wiki-views.js';

export function registerWiki(app, r) {
  const { access, auth, store, wiki, wikiAI, wikiPictures, jobs, pictures, search, maps, handouts, db, kb, config } = r;

  const crop = z.object({ x: z.number().min(0), y: z.number().min(0), w: z.number().positive(), h: z.number().positive() });
  const pictureId = z.string().regex(/^[a-f0-9]{10}$/);
  const available = z.union([z.literal('all'), z.literal('dm'), z.array(z.number().int()).max(100)]);
  // Truth and rumour on each part: its canon, the truth beside a falsehood (the DM's), and an account's teller.
  const canon = { canon: z.enum(CANONS).default('true'), truth: z.string().max(L.truth).optional(), owner: z.number().int().nullable().optional() };
  // How we know a section or fact (stage 3b): transcript citations ('S12 01:02:03'); others are dropped (src/wiki.js).
  const sources = { sources: z.array(z.string().max(40)).max(MAX_SOURCES).optional() };
  const fields = {
    title: z.string().trim().min(1).max(L.title),
    aliases: z.array(z.string().trim().min(1).max(L.alias)).max(L.aliases),
    kind: z.string().trim().max(L.kind),
    parent: z.string().nullable(),
    tags: z.array(z.string().trim().min(1).max(L.tag)).max(L.tags),
    available,
    sections: z
      .array(z.object({ id: z.string().regex(/^[a-f0-9]{6}$/).optional(), heading: z.string().trim().max(L.heading), text: z.string().max(L.text), available, ...canon, ...sources }))
      .max(L.sections),
    picture: z.object({ id: pictureId, caption: z.string().max(L.caption).default(''), available: available.default('all'), ...canon }).nullable(),
    banner: z.object({ id: pictureId, caption: z.string().max(L.caption).default(''), available: available.default('all'), focus: z.number().min(0).max(100).default(50), ...canon }).nullable(),
    gallery: z.array(z.object({ id: pictureId, caption: z.string().max(L.caption).default(''), available: available.default('all'), ...canon })).max(L.gallery),
    facts: z.array(z.object({ label: z.string().max(L.label), value: z.string().max(L.value), available: available.default('all'), tone: z.enum(TONES).nullable().optional(), ...canon, ...sources })).max(L.facts),
    // In-game times (stage 4b): the text only; the server works out when it is (src/wiki.js `dated`).
    when: z.object({ text: z.string().max(L.when) }).nullable(),
    events: z.array(z.object({ id: z.string().regex(/^[a-f0-9]{6}$/).optional(), when: z.object({ text: z.string().max(L.when) }).nullable().default(null), text: z.string().max(L.event), available: available.default('all'), ...canon, ...sources })).max(L.events),
  };

  /** Chosen players must be players of this campaign. */
  function checkPlayers(cid, body) {
    const own = [...(body.sections ?? []), ...(body.facts ?? []), ...(body.events ?? []), ...(body.gallery ?? []), body.picture, body.banner, body.fact].filter(Boolean).map((x) => x.available);
    for (const a of [body.available, body.page_available, body.players, ...own]) {
      if (!Array.isArray(a)) continue;
      for (const id of a) if (auth.membership(cid, id)?.role !== 'player') throw new BadRequestError(`User ${id} isn't a player in this campaign.`);
    }
    return body;
  }

  /** The last time the AI read the records for the wiki, if it has: { status, message, finished_at }. */
  const lastRun = (cid) => {
    const j = jobs.list(cid, 50).find((x) => x.type === 'wiki');
    return j ? { id: j.id, status: j.status, message: j.message, error: j.error, finished_at: j.finished_at } : null;
  };

  /** Every page, the players things can be made available to, and how many AI proposals wait. */
  app.get('/campaigns/:cid/wiki', async (request) => {
    const { cid, role } = access(request);
    const players = store.roster(cid).filter((m) => m.role === 'player').map((m) => ({ id: m.user_id, name: m.name, character_name: m.character_name }));
    const { calendar, clock } = store.getSettings(cid);
    // A player gets the pages they may see (titles only, as they see them: the names for links in Ask too).
    if (role !== 'dm') return { pages: viewerPages(request).pages.map(summary), players, calendar, clock };
    return { pages: wiki.list(cid).map(summary), players, proposals: wikiAI.count(cid), ai_run: lastRun(cid), calendar, clock };
  });

  /**
   * The AI as a writing partner (stage 5b), on the DM's button: one call, its result as proposals under Waiting.
   * { mode: draft | expand | tidy | make_up, page_id?, section_id?, page?: { title, kind, sections: [{ heading, prompt }] }, what?, notes? }
   */
  app.post('/campaigns/:cid/wiki/draft', async (request) => {
    const { cid } = access(request, { dm: true });
    const body = z.object({
      mode: z.enum(['draft', 'expand', 'tidy', 'make_up']),
      page_id: z.string().max(20).nullable().optional(),
      section_id: z.string().max(20).nullable().optional(),
      page: z.object({ title: z.string().trim().min(1).max(L.title), kind: z.string().max(L.kind).default(''), sections: z.array(z.object({ heading: z.string().max(L.heading).default(''), prompt: z.string().max(2000).default('') })).max(40).default([]) }).nullable().optional(),
      what: z.string().max(200).default(''),
      notes: z.string().max(2000).default(''),
    }).parse(request.body ?? {});
    const made = await wikiAI.draft(cid, body);
    return { made: made.length, proposals: wikiAI.count(cid) };
  });

  /** Names in a page's text that match another page but aren't linked (stage 5b, no AI). */
  app.get('/campaigns/:cid/wiki/:pid/links', async (request) => {
    const { cid } = access(request, { dm: true });
    return { suggestions: wiki.linkSuggestions(cid, wiki.get(cid, request.params.pid)) };
  });

  /** Link it: turn a suggested name into a [[link]]. */
  app.post('/campaigns/:cid/wiki/:pid/links', async (request) => {
    const { cid } = access(request, { dm: true });
    const body = z.object({ section_id: z.string().max(20), page_id: z.string().max(20), version: z.number().int().optional() }).parse(request.body ?? {});
    return { page: await wiki.linkIt(cid, request.params.pid, body.section_id, body.page_id, { by: request.user.id, version: body.version }) };
  });

  /** Templates for new pages (stage 5a): the app's starters and the DM's own (pages with `template`). */
  app.get('/campaigns/:cid/wiki/templates', async (request) => {
    const { cid } = access(request, { dm: true });
    return { starters: STARTER_TEMPLATES, own: wiki.templates(cid) };
  });

  // ---------- the space's views (wiki-views.js), as the DM sees them or ?as= a player ----------

  /**
   * The viewer and the pages they may see (a hidden parent left out): the DM, or the DM `?as=<player id>`, or a
   * player (stage 6a: always as themselves, whatever `?as=` says).
   */
  function viewerPages(request) {
    const a = access(request);
    const { cid } = a;
    const { as } = a.role === 'dm' ? z.object({ as: z.coerce.number().int().optional() }).parse(request.query ?? {}) : { as: a.userId };
    if (as == null) return { cid, as: null, pages: wiki.list(cid) };
    if (auth.membership(cid, as)?.role !== 'player') throw new BadRequestError("That isn't a player in this campaign.");
    return { cid, as, pages: wiki.listFor(cid, { userId: as, seesAll: false }) };
  }

  /**
   * How we know it (stage 3b): the transcript lines behind a page's sources, the way Ask's citations show them
   * (`?s=S12 01:02:03` once per source, `?as=` a player: only sessions they were at).
   */
  app.get('/campaigns/:cid/wiki/evidence', async (request) => {
    const { cid, as } = viewerPages(request);
    const q = request.query?.s;
    const list = (Array.isArray(q) ? q : q ? [q] : []).slice(0, MAX_SOURCES);
    const viewer = as == null ? { userId: request.user.id, seesAll: true } : { userId: as, seesAll: false };
    const tools = createTools({ db, store, kb, search, books: null, wiki, config, campaignId: cid, viewer });
    return { evidence: tools.evidenceFor(list.map((x) => `[${x}]`).join(' '), MAX_SOURCES) };
  });

  /**
   * The Timeline (stage 4c): lanes, dated items, undated ones and sessions with no time, for the DM or `?as=` a
   * player (only what they may see; places only revealed ones), `?truth=1` (the DM's): no rumours or falsehoods.
   */
  const timelineFor = (request, { cid, as, pages }) => {
    const { truth } = z.object({ truth: z.enum(['0', '1']).optional() }).parse({ truth: request.query?.truth });
    const { calendar, clock, wiki: own } = store.getSettings(cid);
    const journeys = maps.journeys(cid, { forUser: as ?? null });
    const t = timeline(pages, { places: pagePlaces(maps, cid, { as }), lanes: own.lanes, truth: as == null && truth === '1', forDm: as == null, journeys });
    return { ...t, now: clock, calendar };
  };
  app.get('/campaigns/:cid/wiki/timeline', async (request) => {
    const v = viewerPages(request);
    return { ...timelineFor(request, v), as: v.as };
  });

  /** The party, for the middle of the Wheel and the Home: each player's character, and their token picture's key. */
  const party = (cid) => store.roster(cid).filter((m) => m.role === 'player').map((m) => ({
    id: m.user_id, name: m.name, character_name: m.character_name, token: pictures?.view(cid, m.user_id).token?.key ?? null,
  }));

  /** The Wheel: the kind families with their counts, the party, and the pages as cards. */
  app.get('/campaigns/:cid/wiki/wheel', async (request) => {
    const { cid, as, pages } = viewerPages(request);
    return { families: wheelFamilies(pages), party: party(cid), pages: pages.map(summary), as };
  });

  /**
   * The Home: its picture, the last session's page, the families, the pages
   * changed most recently and the party; for the DM also what waits for them
   * (not with ?as=, which shows the Home as that player would get it).
   */
  app.get('/campaigns/:cid/wiki/home', async (request) => {
    const { cid, as, pages } = viewerPages(request);
    const last = lastSessionPage(pages, store.lastProcessedSession(cid) || null);
    return {
      count: pages.length,
      hero: heroPicture(pages, last),
      last_session: last ? summary(last) : null,
      families: wheelFamilies(pages),
      recent: recentPages(pages).map(summary),
      party: party(cid),
      // The Timeline tile: the latest moments (by in-game time).
      moments: timeline(pages).items.slice(-12).map((x) => ({ at: x.when.from, family: x.family, title: x.type === 'event' ? x.text : x.title })),
      ...(as == null ? { waiting: { proposals: wikiAI.count(cid) } } : { as }),
    };
  });

  /**
   * Find pages (Ctrl K): titles and other names that match first, then pages
   * whose text means something like it (the search index's wiki parts, only
   * those the viewer may see), so "the guy with the eyepatch" finds Rennick.
   */
  /**
   * The Atlas's wiki layers on one map (`?map=`; without it, the first map at the top of the world): pins, faction
   * lands, people and quests, from the pages the viewer may see. `?as=` a player: only what they may see, and only
   * places revealed to them (their fog isn't recreated). `layers: null` when they can't see that map.
   */
  app.get('/campaigns/:cid/wiki/atlas', async (request) => {
    const { cid, as, pages } = viewerPages(request);
    const { map: mapId } = z.object({ map: z.string().max(40).optional() }).parse(request.query ?? {});
    // A player: only maps shown to them, and nothing said about any other.
    const all = maps.list(cid).filter((m) => as == null || shownToViewer(m, as, { revealed: 'shown', to: 'shown_to' }));
    const map = mapId ? (as == null ? maps.get(cid, mapId) : all.find((m) => m.id === mapId)) : all.find((m) => !all.some((o) => o.places.some((p) => p.to === m.id))) ?? all[0];
    if (!map) return { layers: null, maps: [] };
    return { layers: atlasLayers(map, pages, { as }), as };
  });

  app.get('/campaigns/:cid/wiki/find', async (request) => {
    const { cid, as, pages } = viewerPages(request);
    const q = z.object({ q: z.string().trim().max(200).default('') }).parse(request.query ?? {}).q;
    if (!q) return { pages: [] };
    const key = wikiKey(q);
    const named = pages
      .map((p) => {
        const names = [p.title, ...p.aliases].map(wikiKey);
        const rank = names.some((n) => n === key) ? 0 : names.some((n) => n.startsWith(key)) ? 1 : names.some((n) => n.includes(key)) ? 2 : null;
        return rank == null ? null : { p, rank };
      })
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank || a.p.title.localeCompare(b.p.title))
      .map((x) => x.p);
    const byId = new Map(pages.map((p) => [p.id, p]));
    const viewer = as == null ? { seesAll: true } : { userId: as, seesAll: false };
    const meant = (await search.search(cid, q, { kinds: ['wiki'], viewer, limit: 6 })).map((d) => byId.get(d.ref_id)).filter(Boolean);
    const seen = new Set();
    const found = [...named.map((p) => ({ p, by: 'name' })), ...meant.map((p) => ({ p, by: 'text' }))].filter(({ p }) => !seen.has(p.id) && seen.add(p.id)).slice(0, 12);
    return { pages: found.map(({ p, by }) => ({ ...summary(p), found_by: by })) };
  });

  /**
   * The Web (stage 3d): who is tied to whom, from the pages the viewer may see (`?as=` a player).
   * `around` a page id, `steps` 1-3, `families` (comma separated), `mentions=1`, `preset=factions|family`,
   * `truth=1` (the DM's: rumours and falsehoods left out).
   */
  app.get('/campaigns/:cid/wiki/web', async (request) => {
    const { as, pages } = viewerPages(request);
    const q = z.object({
      around: z.string().regex(/^[a-f0-9]{10}$/).optional(),
      steps: z.coerce.number().int().min(1).max(3).default(2),
      families: z.string().max(200).optional(),
      mentions: z.enum(['0', '1']).optional(),
      preset: z.enum(['factions', 'family']).optional(),
      truth: z.enum(['0', '1']).optional(),
    }).parse(request.query ?? {});
    const web = webGraph(pages, {
      around: q.around ?? null,
      steps: q.steps,
      families: q.families ? q.families.split(',').filter(Boolean) : null,
      mentions: q.mentions === '1',
      preset: q.preset ?? null,
      truth: as == null && q.truth === '1',
      forDm: as == null,
    });
    return { ...web, ...(as == null ? {} : { as }) };
  });

  /** A page's compass: its family, what it's inside, what's inside it, and its links both ways (`compass: null` if the player can't see it). */
  app.get('/campaigns/:cid/wiki/:pid/compass', async (request) => {
    const { cid, as, pages } = viewerPages(request);
    wiki.get(cid, request.params.pid); // 404 for a page that doesn't exist
    const page = pages.find((p) => p.id === request.params.pid);
    // A player gets the same 404 for a page they can't see, so nothing says it's there.
    if (!page && access(request).role !== 'dm') throw new NotFoundError('No such page');
    return { compass: page ? compass(page, pages) : null, ...(as == null ? {} : { as }) };
  });

  // ---------- pictures ----------

  const pictureBody = { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) + 64 * 1024 };
  const pictureView = (x) => ({ id: x.id, width: x.width, height: x.height, name: x.name, from: x.from });

  /** The wiki's pictures (newest first), and everything else in the app with a picture the DM could use. */
  app.get('/campaigns/:cid/wiki/pictures', async (request) => {
    const { cid } = access(request, { dm: true });
    return { pictures: wikiPictures.list(cid), sources: wikiPictures.sources(cid) };
  });

  /**
   * Add a picture (DM): { filename, data (base64) } for an upload, a paste or
   * a drop, or { from: { kind, id } } for a copy of a creature's, item's,
   * merchant's, map's, handout's or token's picture. A map's can be a
   * `crop` of it ({ x, y, w, h } in the map's pixels), such as one room.
   */
  app.post('/campaigns/:cid/wiki/pictures', pictureBody, async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const body = z.union([
      z.object({ filename: z.string().max(200).default(''), data: z.string().min(1) }),
      z.object({ from: z.object({ kind: z.enum(SOURCE_KINDS), id: z.string().max(40), crop: crop.optional() }) }),
    ]).parse(request.body ?? {});
    const x = body.from
      ? await wikiPictures.copy(cid, body.from, { by: request.user.id })
      : await wikiPictures.upload(cid, Buffer.from(body.data, 'base64'), { by: request.user.id, name: body.filename.replace(/\.[^.]*$/, '') });
    reply.status(201);
    return { picture: pictureView(x) };
  });

  /** A small copy of a creature's, item's, map's… picture, for the DM's chooser. */
  app.get('/campaigns/:cid/wiki/picture-sources/:kind/:id', async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const { buf, type } = await wikiPictures.sourceThumb(cid, request.params.kind, request.params.id);
    return reply.type(type).header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=300').send(buf);
  });

  /**
   * A picture, made smaller on the server (?size=thumb for cards and
   * galleries). The DM gets any; a player only one in a part of a page
   * available to them, and otherwise the same 404 as a picture that doesn't
   * exist, so nothing says it's there.
   */
  app.get('/campaigns/:cid/wiki/pictures/:picid', async (request, reply) => {
    const a = access(request);
    const id = request.params.picid;
    const { size } = z.object({ size: z.enum(['thumb', 'full']).default('full') }).parse(request.query ?? {});
    if (!wikiPictures.has(a.cid, id) || !wiki.pictureVisible(a.cid, id, { userId: a.userId, seesAll: a.role === 'dm' })) throw new NotFoundError('No such picture');
    const { buf, type } = await wikiPictures.image(a.cid, id, size);
    return reply.type(type).header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(buf);
  });

  // ---------- what the AI proposes (stage 2 and 3: the DM approves every change) ----------

  /** Proposals waiting for the DM, each with what's on the page now. */
  app.get('/campaigns/:cid/wiki/proposals', async (request) => {
    const { cid } = access(request, { dm: true });
    return { proposals: wikiAI.pending(cid), ai_run: lastRun(cid) };
  });

  /** Have the AI read what the archivist changed now (it also does after every session when WIKI_AUTO is on). */
  app.post('/campaigns/:cid/wiki/proposals/run', async (request) => {
    const { cid } = access(request, { dm: true });
    jobs.enqueueWiki(cid);
    return { ai_run: lastRun(cid) };
  });

  /** Approve one, as it is or with the DM's edits (which make an edited section the DM's). */
  app.post('/campaigns/:cid/wiki/proposals/:id/approve', async (request) => {
    const { cid } = access(request, { dm: true });
    const edits = checkPlayers(cid, z.object({
      title: fields.title.optional(),
      kind: fields.kind.optional(),
      page_available: available.optional(),
      sections: z.array(z.object({ heading: fields.sections.element.shape.heading.optional(), text: z.string().max(L.text).optional(), available: available.optional() })).max(L.sections).optional(),
      players: z.array(z.number().int()).max(100).optional(),
      use_picture: z.boolean().optional(),
      fact: z.object({ label: z.string().trim().min(1).max(L.label).optional(), value: z.string().trim().min(1).max(L.value).optional(), tone: z.enum(TONES).nullable().optional(), available: available.optional() }).optional(),
      when: z.string().trim().min(1).max(L.when).optional(),
      event: z.object({ when: z.string().max(L.when).optional(), text: z.string().trim().min(1).max(L.event).optional(), available: available.optional() }).optional(),
    }).parse(request.body ?? {}));
    const page = await wikiAI.approve(cid, request.params.id, edits, { by: request.user.id });
    return { page, proposals: wikiAI.count(cid) };
  });

  app.post('/campaigns/:cid/wiki/proposals/:id/reject', async (request) => {
    const { cid } = access(request, { dm: true });
    wikiAI.reject(cid, request.params.id, { by: request.user.id });
    return { proposals: wikiAI.count(cid) };
  });

  app.post('/campaigns/:cid/wiki/proposals/approve-all', async (request) => {
    const { cid } = access(request, { dm: true });
    const result = await wikiAI.approveAll(cid, { by: request.user.id });
    return { ...result, proposals: wikiAI.count(cid) };
  });

  /**
   * One page, with the pages that link to it and any `:::for` names that
   * match no player. `?as=<user id>` shows it as that player would get it
   * (`page: null` when nothing on it is available to them).
   */
  app.get('/campaigns/:cid/wiki/:pid', async (request) => {
    const { cid, role } = access(request);
    if (role !== 'dm') {
      // A player: the page as they may see it, and the pages they may see that link to it; the same 404 as a page
      // that doesn't exist when nothing on it is theirs.
      const { as, pages } = viewerPages(request);
      const page = pages.find((p) => p.id === request.params.pid);
      if (!page) throw new NotFoundError('No such page');
      const names = new Set([page.title].map(wikiKey));
      const mentioned = pages.filter((p) => p.id !== page.id && p.sections.some((s) => wikiLinks(s.text).some((n) => names.has(wikiKey(n))))).map((p) => ({ id: p.id, title: p.title }));
      return { page, mentioned_in: mentioned, as };
    }
    const page = wiki.get(cid, request.params.pid, { templates: true });
    const { as } = z.object({ as: z.coerce.number().int().optional() }).parse(request.query ?? {});
    if (as != null) {
      if (auth.membership(cid, as)?.role !== 'player') throw new BadRequestError("That isn't a player in this campaign.");
      return { page: wiki.forViewer(cid, page, { userId: as, seesAll: false }), as };
    }
    return { page, mentioned_in: wiki.mentionedIn(cid, page), unknown_names: wiki.unknownNames(cid, page), on_maps: pageOnMaps(maps, cid, page.id) };
  });

  app.post('/campaigns/:cid/wiki', async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const body = checkPlayers(cid, z.object({ ...fields, aliases: fields.aliases.default([]), kind: fields.kind.default(''), parent: fields.parent.default(null), tags: fields.tags.default([]), available: available.default('dm'), sections: fields.sections.default([]), picture: fields.picture.default(null), banner: fields.banner.default(null), gallery: fields.gallery.default([]), facts: fields.facts.default([]), when: fields.when.default(null), events: fields.events.default([]), template: z.boolean().default(false) }).parse(request.body ?? {}));
    const page = await wiki.create(cid, body, { by: request.user.id });
    reply.status(201);
    return { page, unknown_names: wiki.unknownNames(cid, page) };
  });

  /** A new page for a place or token on a map, linked to it (or the page it already has): { map_id, kind, id }. */
  app.post('/campaigns/:cid/wiki/from-map', async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const body = z.object({ map_id: z.string().max(40), kind: z.enum(['place', 'token']), id: z.string().max(40) }).parse(request.body ?? {});
    const { page, made } = await makePageFor({ wiki, maps, wikiPictures }, cid, body, { by: request.user.id });
    reply.status(made ? 201 : 200);
    return { page, made };
  });

  /**
   * Send part of a page as a handout (DM): { part: { section } | { picture } | { glance: true }, to: 'everyone' | [player ids],
   * share? }. The text leaves out every `:::for` and `:::dm` block, links become plain names, and the glance box sends only
   * the facts available to everyone. `share` also makes that part available to them in the wiki (never the page itself:
   * `page_hidden` says when the page isn't, so the DM decides).
   */
  app.post('/campaigns/:cid/wiki/:pid/handout', async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const body = z.object({
      part: z.union([z.object({ section: z.string() }), z.object({ picture: pictureId }), z.object({ glance: z.literal(true) })]),
      to: z.union([z.literal('everyone'), z.array(z.number().int()).min(1).max(100)]),
      share: z.boolean().default(false),
    }).parse(request.body ?? {});
    if (Array.isArray(body.to)) checkPlayers(cid, { players: body.to });
    const page = wiki.get(cid, request.params.pid);
    const plain = (t) => unpicture(unlink(wikiPieces(t).filter((x) => !x.block).map((x) => x.text).join('\n\n'))).trim();
    let title = page.title;
    let text = '';
    let picture = null;
    const widen = (a) => (a === 'all' || body.to === 'everyone' ? 'all' : [...new Set([...(a === 'dm' ? [] : a), ...body.to])]);
    const changes = {};
    if (body.part.section) {
      const sec = page.sections.find((x) => x.id === body.part.section);
      if (!sec) throw new NotFoundError('No such section');
      if (sec.heading) title = `${page.title}: ${sec.heading}`;
      text = plain(sec.text);
      if (body.share) changes.sections = page.sections.map((x) => (x === sec ? { ...x, available: widen(x.available) } : x));
    } else if (body.part.picture) {
      const slots = [['picture', page.picture], ['banner', page.banner], ...page.gallery.map((g) => ['gallery', g])].filter(([, x]) => x?.id === body.part.picture);
      if (!slots.length) throw new NotFoundError('No such picture on this page');
      const cap = slots[0][1].caption;
      if (cap) text = cap;
      picture = (await wikiPictures.image(cid, body.part.picture, 'full')).buf;
      if (body.share) {
        for (const [slot] of slots) {
          if (slot === 'gallery') changes.gallery = page.gallery.map((g) => (g.id === body.part.picture ? { ...g, available: widen(g.available) } : g));
          else changes[slot] = { ...page[slot], available: widen(page[slot].available) };
        }
      }
    } else {
      const facts = page.facts.filter((f) => f.available === 'all' || (body.share && f.available !== 'dm'));
      text = facts.map((f) => `${f.label}: ${unlink(f.value)}`).join('\n');
      if (page.picture && page.picture.available === 'all') picture = (await wikiPictures.image(cid, page.picture.id, 'full')).buf;
    }
    if (!text && !picture) throw new BadRequestError('There is nothing in that part to send: it is all in blocks for the DM or chosen players.');
    const handout = await handouts.create(cid, { title: title.slice(0, 200), text, to: body.to, picture }, { by: request.user.id });
    let saved = page;
    if (Object.keys(changes).length) saved = await wiki.update(cid, page.id, changes, { by: request.user.id, version: page.version });
    const players = body.to === 'everyone' ? store.roster(cid).filter((m) => m.role === 'player').map((m) => m.user_id) : body.to;
    const pageAudience = audienceOf(saved.available);
    reply.status(201);
    return { handout: { id: handout.id, title: handout.title }, page: saved, page_hidden: body.share && players.some((uid) => !canSeeAudience({ userId: uid }, pageAudience)) };
  });

  /** Save a page: the fields that change, and the `version` the editor opened (409 if it was saved since). */
  app.put('/campaigns/:cid/wiki/:pid', async (request) => {
    const { cid } = access(request, { dm: true });
    const { version, ...body } = checkPlayers(cid, z.object({ version: z.number().int().positive(), ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])) }).parse(request.body ?? {}));
    const page = await wiki.update(cid, request.params.pid, body, { by: request.user.id, version });
    return { page, mentioned_in: wiki.mentionedIn(cid, page), unknown_names: wiki.unknownNames(cid, page) };
  });

  /** Delete a page (the archive keeps every version). */
  app.delete('/campaigns/:cid/wiki/:pid', async (request) => {
    const { cid } = access(request, { dm: true });
    await wiki.remove(cid, request.params.pid, { by: request.user.id });
    return { ok: true };
  });

  /** Every saved version, newest first. */
  app.get('/campaigns/:cid/wiki/:pid/history', async (request) => {
    const { cid } = access(request, { dm: true });
    return { versions: wiki.history(cid, request.params.pid) };
  });

  app.get('/campaigns/:cid/wiki/:pid/history/:version', async (request) => {
    const { cid } = access(request, { dm: true });
    return { page: wiki.version(cid, request.params.pid, z.coerce.number().int().positive().parse(request.params.version)) };
  });

  /** Bring an earlier version back (saved as a new version). */
  app.post('/campaigns/:cid/wiki/:pid/restore', async (request) => {
    const { cid } = access(request, { dm: true });
    const { version } = z.object({ version: z.number().int().positive() }).parse(request.body ?? {});
    const page = await wiki.restore(cid, request.params.pid, version, { by: request.user.id });
    return { page, mentioned_in: wiki.mentionedIn(cid, page), unknown_names: wiki.unknownNames(cid, page) };
  });
}
