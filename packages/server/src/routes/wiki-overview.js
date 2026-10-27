/**
 * The DM's overview of the wiki (stage 8): the quest board and the saved lists, from the pages the viewer may see
 * (the DM, `?as=` a player, or a player as themselves). Changing them is the DM's.
 */
import { z } from 'zod';
import { KIND_FAMILIES, CANONS } from '@dndapp/shared/wiki.js';
import { WIKI_LIMITS as L } from '../wiki.js';
import { viewerPagesFor } from './wiki-viewer.js';
import { summary, questBoard, listPages, QUEST_COLUMNS } from '../wiki-views.js';

export function registerWikiOverview(app, r) {
  const { access, wiki, wikiAI } = r;
  const viewerPages = viewerPagesFor(r);

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
}
