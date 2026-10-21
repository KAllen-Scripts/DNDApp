/**
 * The DM's wiki (src/wiki.js). Every route is the DM's: players have no Wiki
 * tab and reach the wiki only through Ask, which reads just the parts
 * available to them.
 */
import { z } from 'zod';
import { BadRequestError } from '../store.js';
import { WIKI_LIMITS as L } from '../wiki.js';

export function registerWiki(app, r) {
  const { access, auth, store, wiki, wikiAI, jobs } = r;

  const available = z.union([z.literal('all'), z.literal('dm'), z.array(z.number().int()).max(100)]);
  const fields = {
    title: z.string().trim().min(1).max(L.title),
    aliases: z.array(z.string().trim().min(1).max(L.alias)).max(L.aliases),
    kind: z.string().trim().max(L.kind),
    parent: z.string().nullable(),
    tags: z.array(z.string().trim().min(1).max(L.tag)).max(L.tags),
    available,
    sections: z
      .array(z.object({ id: z.string().regex(/^[a-f0-9]{6}$/).optional(), heading: z.string().trim().max(L.heading), text: z.string().max(L.text), available }))
      .max(L.sections),
  };

  /** Chosen players must be players of this campaign. */
  function checkPlayers(cid, body) {
    for (const a of [body.available, body.page_available, body.players, ...(body.sections ?? []).map((s) => s.available)]) {
      if (!Array.isArray(a)) continue;
      for (const id of a) if (auth.membership(cid, id)?.role !== 'player') throw new BadRequestError(`User ${id} isn't a player in this campaign.`);
    }
    return body;
  }

  const summary = (p) => ({ id: p.id, title: p.title, aliases: p.aliases, kind: p.kind, parent: p.parent, tags: p.tags, available: p.available, updated_at: p.updated_at });

  /** The last time the AI read the records for the wiki, if it has: { status, message, finished_at }. */
  const lastRun = (cid) => {
    const j = jobs.list(cid, 50).find((x) => x.type === 'wiki');
    return j ? { id: j.id, status: j.status, message: j.message, error: j.error, finished_at: j.finished_at } : null;
  };

  /** Every page, the players things can be made available to, and how many AI proposals wait. */
  app.get('/campaigns/:cid/wiki', async (request) => {
    const { cid } = access(request, { dm: true });
    const players = store.roster(cid).filter((m) => m.role === 'player').map((m) => ({ id: m.user_id, name: m.name, character_name: m.character_name }));
    return { pages: wiki.list(cid).map(summary), players, proposals: wikiAI.count(cid), ai_run: lastRun(cid) };
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
    const { cid } = access(request, { dm: true });
    const page = wiki.get(cid, request.params.pid);
    const { as } = z.object({ as: z.coerce.number().int().optional() }).parse(request.query ?? {});
    if (as != null) {
      if (auth.membership(cid, as)?.role !== 'player') throw new BadRequestError("That isn't a player in this campaign.");
      return { page: wiki.forViewer(cid, page, { userId: as, seesAll: false }), as };
    }
    return { page, mentioned_in: wiki.mentionedIn(cid, page), unknown_names: wiki.unknownNames(cid, page) };
  });

  app.post('/campaigns/:cid/wiki', async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const body = checkPlayers(cid, z.object({ ...fields, aliases: fields.aliases.default([]), kind: fields.kind.default(''), parent: fields.parent.default(null), tags: fields.tags.default([]), available: available.default('dm'), sections: fields.sections.default([]) }).parse(request.body ?? {}));
    const page = await wiki.create(cid, body, { by: request.user.id });
    reply.status(201);
    return { page, unknown_names: wiki.unknownNames(cid, page) };
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
