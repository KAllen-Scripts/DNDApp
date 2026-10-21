/**
 * The DM's wiki (src/wiki.js). Every route is the DM's: players have no Wiki
 * tab and reach the wiki only through Ask, which reads just the parts
 * available to them.
 */
import { z } from 'zod';
import { BadRequestError } from '../store.js';
import { WIKI_LIMITS as L } from '../wiki.js';

export function registerWiki(app, r) {
  const { access, auth, store, wiki } = r;

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
    for (const a of [body.available, ...(body.sections ?? []).map((s) => s.available)]) {
      if (!Array.isArray(a)) continue;
      for (const id of a) if (auth.membership(cid, id)?.role !== 'player') throw new BadRequestError(`User ${id} isn't a player in this campaign.`);
    }
    return body;
  }

  const summary = (p) => ({ id: p.id, title: p.title, aliases: p.aliases, kind: p.kind, parent: p.parent, tags: p.tags, available: p.available, updated_at: p.updated_at });

  /** Every page, and the players things can be made available to. */
  app.get('/campaigns/:cid/wiki', async (request) => {
    const { cid } = access(request, { dm: true });
    const players = store.roster(cid).filter((m) => m.role === 'player').map((m) => ({ id: m.user_id, name: m.name, character_name: m.character_name }));
    return { pages: wiki.list(cid).map(summary), players };
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
