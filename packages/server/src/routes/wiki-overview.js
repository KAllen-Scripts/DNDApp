/**
 * The DM's overview of the wiki (stage 8): the quest board and the saved lists, from the pages the viewer may see
 * (the DM, `?as=` a player, or a player as themselves). Changing them is the DM's.
 */
import { z } from 'zod';
import { KIND_FAMILIES, CANONS, narrowest, audienceOf, canSeeAudience } from '@dndapp/shared/wiki.js';
import { BadRequestError, NotFoundError } from '../store.js';
import { WIKI_LIMITS as L } from '../wiki/store.js';
import { viewerPagesFor, spoilerCheckFor, playersOf } from './wiki-viewer.js';
import { summary, questBoard, listPages, knowsGrid, tidyItems, TIDY_RULES, QUEST_COLUMNS } from '../wiki/views.js';
import { pagePlaces } from '../wiki/maps.js';

export function registerWikiOverview(app, r) {
  const { access, wiki, wikiAI, store, maps, db } = r;
  const viewerPages = viewerPagesFor(r);
  const spoilerCheck = spoilerCheckFor(r);
  const players = (cid) => store.roster(cid).filter((m) => m.role === 'player');

  const filter = z.union([
    z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{10}$/)).max(100) }).strict(),
    z.object({
      family: z.enum(Object.keys(KIND_FAMILIES)).optional(),
      kind: z.string().trim().max(L.kind).optional(),
      tag: z.string().trim().max(L.tag).optional(),
      canon: z.enum(CANONS).optional(),
      fact: z.object({ label: z.string().trim().min(1).max(L.label), value: z.string().trim().max(L.value).default('') }).optional(),
    }).strict(),
  ]);
  const listBody = z.object({ name: z.string().trim().min(1).max(80), filter });

  /** The quest board (stage 8a): { columns, arcs, quests }. */
  app.get('/campaigns/:cid/wiki/quests', async (request) => {
    const { as, pages } = viewerPages(request);
    return { ...questBoard(pages), as };
  });

  /**
   * A quest's status, from the board (a card dragged to a column, or picked): the Status fact, made if it has none.
   * { status: a column's key or the DM's own words, version? }.
   */
  app.put('/campaigns/:cid/wiki/:pid/status', async (request) => {
    const { cid } = access(request, { dm: true });
    const body = z.object({ status: z.string().trim().max(L.value), version: z.number().int().positive().optional() }).parse(request.body ?? {});
    const page = wiki.get(cid, request.params.pid);
    const label = QUEST_COLUMNS.find((c) => c.key === body.status)?.label ?? body.status;
    const i = page.facts.findIndex((f) => f.label.trim().toLowerCase() === 'status');
    // The DM chose it: theirs from now on (not the AI's or a player's), true, and seen as the page is.
    const fact = { ...(i >= 0 ? page.facts[i] : { label: 'Status', available: 'all' }), value: label, canon: 'true', by: 'dm' };
    delete fact.owner;
    delete fact.truth;
    const facts = i >= 0 ? page.facts.map((f, j) => (j === i ? fact : f)) : [...page.facts, fact];
    return { page: summary(await wiki.update(cid, page.id, { facts }, { by: request.user.id, version: body.version })) };
  });

  /** The DM's saved lists (stage 8a), each with its pages as the viewer may see them. A player has none. */
  app.get('/campaigns/:cid/wiki/lists', async (request) => {
    const { cid, role } = access(request);
    if (role !== 'dm') return { lists: [] };
    const { as, pages } = viewerPages(request);
    return { lists: wikiAI.lists(cid).map((l) => ({ ...l, pages: listPages(pages, l.filter).map(summary) })), as };
  });

  app.post('/campaigns/:cid/wiki/lists', async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const body = listBody.parse(request.body ?? {});
    reply.code(201);
    return { list: wikiAI.saveList(cid, body) };
  });

  app.put('/campaigns/:cid/wiki/lists/:id', async (request) => {
    const { cid } = access(request, { dm: true });
    return { list: wikiAI.saveList(cid, { id: request.params.id, ...listBody.parse(request.body ?? {}) }) };
  });

  app.delete('/campaigns/:cid/wiki/lists/:id', async (request) => {
    const { cid } = access(request, { dm: true });
    wikiAI.removeList(cid, request.params.id);
    return { ok: true };
  });

  /** Make a list in plain words (stage 8a, one quick AI call): { name, filter: { ids }, pages }, not saved yet. */
  app.post('/campaigns/:cid/wiki/lists/make', async (request) => {
    const { cid } = access(request, { dm: true });
    const { words } = z.object({ words: z.string().trim().min(1).max(300) }).parse(request.body ?? {});
    const all = wiki.list(cid);
    const { name, ids } = await wikiAI.makeList(cid, words, all);
    return { name, filter: { ids }, pages: listPages(all, { ids }).map(summary) };
  });

  // ---------- who knows what, reveals and the spoiler check (stage 8b) ----------

  /** Who knows what: the DM's pages against the players, each cell 'all', 'some' or 'none'. */
  app.get('/campaigns/:cid/wiki/knows', async (request) => {
    const { cid } = access(request, { dm: true });
    const list = players(cid);
    const coverage = new Map(list.map((m) => [m.user_id, wiki.coverage(cid, { userId: m.user_id, seesAll: false })]));
    return { players: list.map((m) => ({ id: m.user_id, name: m.name, character_name: m.character_name })), pages: knowsGrid(wiki.list(cid), coverage) };
  });

  const partsBody = {
    sections: z.array(z.string().max(20)).max(L.sections).default([]),
    facts: z.array(z.string().max(L.label)).max(L.facts).default([]),
    events: z.array(z.string().max(20)).max(L.events).default([]),
  };
  /** The words of the chosen parts of a page (its sections by id, facts by label, events by id), all of it with none chosen. */
  const partsText = (page, b) => {
    const none = !b.sections.length && !b.facts.length && !b.events.length;
    return [
      ...page.sections.filter((s) => none || b.sections.includes(s.id)).map((s) => s.text),
      ...page.facts.filter((f) => none || b.facts.includes(f.label)).map((f) => `${f.label}: ${f.value}`),
      ...page.events.filter((e) => none || b.events.includes(e.id)).map((e) => e.text),
    ].join('\n');
  };
  const checkWho = (cid, who) => {
    const ids = players(cid).map((m) => m.user_id);
    for (const uid of who) if (!ids.includes(uid)) throw new BadRequestError(`User ${uid} isn't a player in this campaign.`);
    return who;
  };

  /**
   * The spoiler check before a reveal, a handout or a lore approval: what the newly visible words name that these
   * players can't see yet. { page_id, players, sections?, facts?, events? } (those parts of the page; none: all of
   * it) or { text, players, page_id? }. → { spoilers: [{ player, name, names: [{ id, title }] }] }.
   */
  app.post('/campaigns/:cid/wiki/spoilers', async (request) => {
    const { cid } = access(request, { dm: true });
    const b = z.object({ page_id: z.string().max(20).optional(), text: z.string().max(50000).optional(), players: z.union([z.literal('everyone'), z.array(z.number().int()).max(100)]), ...partsBody }).parse(request.body ?? {});
    const who = b.players === 'everyone' ? playersOf(store, cid, 'all') : checkWho(cid, b.players);
    const page = b.page_id ? wiki.get(cid, b.page_id) : null;
    if (!page && b.text == null) throw new BadRequestError('Say what is to be shown: a page\'s parts or some text.');
    return { spoilers: spoilerCheck(cid, b.text ?? partsText(page, b), who, page ? [page.id] : []) };
  });

  /**
   * Reveal to… (stage 8b): chosen parts of a page (none chosen: the page and all of it), to chosen players, in one
   * save. The page becomes theirs to see too; a part "as the page" keeps what the page was before.
   */
  app.post('/campaigns/:cid/wiki/:pid/reveal', async (request) => {
    const { cid } = access(request, { dm: true });
    const b = z.object({ players: z.array(z.number().int()).min(1).max(100), version: z.number().int().positive().optional(), ...partsBody }).parse(request.body ?? {});
    const who = checkWho(cid, b.players);
    const page = wiki.get(cid, request.params.pid);
    const none = !b.sections.length && !b.facts.length && !b.events.length;
    const pageAudience = audienceOf(page.available);
    const widest = (a) => (a == null ? null : [...new Set([...a, ...who])]);
    const availableOf = (a) => (a == null ? 'all' : a.length ? a : 'dm');
    const pageNow = pageAudience == null ? 'all' : availableOf(widest(pageAudience));
    const widened = JSON.stringify(pageNow) !== JSON.stringify(page.available);
    const open = (x, chosen) => {
      if (chosen) {
        const now = narrowest(pageAudience, audienceOf(x.available));
        return { ...x, available: who.every((uid) => canSeeAudience({ userId: uid }, now)) && x.available === 'all' ? 'all' : availableOf(widest(now)) };
      }
      // Not chosen: what it was, even when the page widens.
      return widened && x.available === 'all' ? { ...x, available: page.available } : x;
    };
    const sections = page.sections.map((s) => open(s, none || b.sections.includes(s.id)));
    const facts = page.facts.map((f) => open(f, none || b.facts.includes(f.label)));
    const events = page.events.map((e) => open(e, none || b.events.includes(e.id)));
    if (!none && ![...b.sections].every((id) => page.sections.some((s) => s.id === id))) throw new NotFoundError('No such section');
    const saved = await wiki.update(cid, page.id, { available: pageNow, sections, facts, events }, { by: request.user.id, version: b.version ?? page.version });
    return { page: saved, knows: Object.fromEntries(who.map((uid) => [uid, wiki.coverage(cid, { userId: uid, seesAll: false }).get(page.id)])) };
  });

  // ---------- Tidy up (stage 8c) ----------

  /** What in the wiki needs a hand: { rules: [{ rule, label, fix, count }], items: [{ rule, page?, text, … }] }. */
  app.get('/campaigns/:cid/wiki/tidy', async (request) => {
    const { cid } = access(request, { dm: true });
    const pages = wiki.list(cid);
    const allMaps = maps.list(cid);
    const played = db.prepare("SELECT processed_at FROM sessions WHERE campaign_id = ? AND status = 'ready' AND processed_at IS NOT NULL").all(cid).map((x) => x.processed_at);
    const items = tidyItems(pages, {
      onMaps: new Set([...pagePlaces(maps, cid).keys(), ...allMaps.flatMap((m) => (m.tokens ?? []).filter((x) => x.page).map((x) => x.page.id))]),
      placesWithoutPage: allMaps.flatMap((m) => (m.places ?? []).filter((x) => !x.page && x.name?.trim()).map((x) => ({ map_id: m.id, map_name: m.name, place_id: x.id, name: x.name.trim() }))).slice(0, 50),
      removed: wiki.removedNames(cid),
      suggestions: (p) => wiki.linkSuggestions(cid, p),
      unknown: (p) => wiki.unknownNames(cid, p),
      sessionsSince: (iso) => played.filter((at) => String(at) > String(iso)).length,
    });
    return { rules: TIDY_RULES.map((x) => ({ ...x, count: items.filter((i) => i.rule === x.rule).length })), items };
  });

  // ---------- a Home that thinks (stage 8d) ----------

  /** The insights the AI made after the sessions, still open: { insights: [{ id, type, kind, text, page_id, page_title, can_fix, run }] }. */
  app.get('/campaigns/:cid/wiki/insights', async (request) => {
    const { cid } = access(request, { dm: true });
    return { insights: wikiAI.insights(cid) };
  });

  app.post('/campaigns/:cid/wiki/insights/:id/dismiss', async (request) => {
    const { cid } = access(request, { dm: true });
    wikiAI.dismissInsight(cid, request.params.id);
    return { insights: wikiAI.insights(cid) };
  });

  /** A contradiction's fix, proposed: it waits under Waiting like the AI's other changes. */
  app.post('/campaigns/:cid/wiki/insights/:id/fix', async (request) => {
    const { cid } = access(request, { dm: true });
    const proposal = wikiAI.fixInsight(cid, request.params.id);
    return { proposal, proposals: wikiAI.count(cid), insights: wikiAI.insights(cid) };
  });
}
