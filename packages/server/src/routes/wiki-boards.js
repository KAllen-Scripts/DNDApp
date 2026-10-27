/**
 * Boards (wiki space stage 10a): the DM's boards, and each player's own (shared with the DM only when they say).
 * Every read is the viewer's: a card they can't see comes as `gone`.
 */
import { z } from 'zod';
import { BOARD_LIMITS as L, BOARD_ITEM_KINDS, BOARD_COLORS, CARD_SIZES } from '../wiki-boards.js';

export function registerWikiBoards(app, r) {
  const { access, wikiBoards } = r;
  const viewerOf = (request) => {
    const a = access(request);
    return { cid: a.cid, viewer: { role: a.role, userId: a.userId } };
  };
  const coord = z.number().finite();
  const item = z.object({
    id: z.string().max(12).optional(),
    kind: z.enum(BOARD_ITEM_KINDS),
    ref: z.string().max(12).nullable().optional(),
    x: coord, y: coord, w: coord.optional(), h: coord.optional(),
    size: z.enum(CARD_SIZES).optional(),
    text: z.string().max(L.text).optional(),
    color: z.enum(BOARD_COLORS).optional(),
  });
  const arrow = z.object({ id: z.string().max(12).optional(), from: z.string().max(12), to: z.string().max(12), label: z.string().max(L.label).default('') });
  const content = {
    title: z.string().trim().max(L.title),
    items: z.array(item).max(L.items),
    arrows: z.array(arrow).max(L.arrows),
  };
  const opts = { bodyLimit: 2 * 1024 * 1024 };

  /** The boards this viewer may open: the DM's and those shared with them; a player's own. */
  app.get('/campaigns/:cid/wiki/boards', async (request) => {
    const { cid, viewer } = viewerOf(request);
    return { boards: wikiBoards.list(cid, viewer) };
  });

  /** A new board, theirs: { title, items?, arrows? }. */
  app.post('/campaigns/:cid/wiki/boards', opts, async (request, reply) => {
    const { cid, viewer } = viewerOf(request);
    const body = z.object({ title: content.title.default(''), items: content.items.default([]), arrows: content.arrows.default([]) }).parse(request.body ?? {});
    reply.status(201);
    return { board: wikiBoards.create(cid, body, viewer) };
  });

  app.get('/campaigns/:cid/wiki/boards/:id', async (request) => {
    const { cid, viewer } = viewerOf(request);
    return { board: wikiBoards.view(cid, request.params.id, viewer) };
  });

  /** Save (the owner): { version, title?, items?, arrows?, shared_with_dm? (a player's) }; 409 when it was saved since. */
  app.put('/campaigns/:cid/wiki/boards/:id', opts, async (request) => {
    const { cid, viewer } = viewerOf(request);
    const { version, ...fields } = z.object({
      version: z.number().int().positive(),
      title: content.title.optional(),
      items: content.items.optional(),
      arrows: content.arrows.optional(),
      shared_with_dm: z.boolean().optional(),
    }).parse(request.body ?? {});
    return { board: wikiBoards.save(cid, request.params.id, fields, viewer, { version }) };
  });

  app.delete('/campaigns/:cid/wiki/boards/:id', async (request, reply) => {
    const { cid, viewer } = viewerOf(request);
    wikiBoards.remove(cid, request.params.id, viewer);
    reply.status(204);
  });
}
