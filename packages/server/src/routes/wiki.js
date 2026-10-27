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
import { summary, wheelFamilies, lastSessionPage, recentPages, heroPicture } from '../wiki-views.js';

export function registerWiki(app, r) {
  const { access, auth, store, wiki, wikiAI, wikiPictures, jobs, pictures } = r;

  const pictureId = z.string().regex(/^[a-f0-9]{10}$/);
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
    picture: z.object({ id: pictureId, caption: z.string().max(L.caption).default(''), available: available.default('all') }).nullable(),
    banner: z.object({ id: pictureId, caption: z.string().max(L.caption).default(''), available: available.default('all'), focus: z.number().min(0).max(100).default(50) }).nullable(),
    gallery: z.array(z.object({ id: pictureId, caption: z.string().max(L.caption).default(''), available: available.default('all') })).max(L.gallery),
    facts: z.array(z.object({ label: z.string().max(L.label), value: z.string().max(L.value), available: available.default('all') })).max(L.facts),
  };

  /** Chosen players must be players of this campaign. */
  function checkPlayers(cid, body) {
    const own = [...(body.sections ?? []), ...(body.facts ?? []), ...(body.gallery ?? []), body.picture, body.banner].filter(Boolean).map((x) => x.available);
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
    const { cid } = access(request, { dm: true });
    const players = store.roster(cid).filter((m) => m.role === 'player').map((m) => ({ id: m.user_id, name: m.name, character_name: m.character_name }));
    return { pages: wiki.list(cid).map(summary), players, proposals: wikiAI.count(cid), ai_run: lastRun(cid) };
  });

  // ---------- the space's views (wiki-views.js), as the DM sees them or ?as= a player ----------

  /** `?as=<player id>` checked: the viewer, and the pages they may see (a hidden parent left out). */
  function viewerPages(request) {
    const { cid } = access(request, { dm: true });
    const { as } = z.object({ as: z.coerce.number().int().optional() }).parse(request.query ?? {});
    if (as == null) return { cid, as: null, pages: wiki.list(cid) };
    if (auth.membership(cid, as)?.role !== 'player') throw new BadRequestError("That isn't a player in this campaign.");
    const pages = wiki.list(cid).map((p) => wiki.forViewer(cid, p, { userId: as, seesAll: false })).filter(Boolean);
    const ids = new Set(pages.map((p) => p.id));
    return { cid, as, pages: pages.map((p) => (p.parent && !ids.has(p.parent) ? { ...p, parent: null } : p)) };
  }

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
      ...(as == null ? { waiting: { proposals: wikiAI.count(cid) } } : { as }),
    };
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
   * merchant's, map's, handout's or token's picture.
   */
  app.post('/campaigns/:cid/wiki/pictures', pictureBody, async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const body = z.union([
      z.object({ filename: z.string().max(200).default(''), data: z.string().min(1) }),
      z.object({ from: z.object({ kind: z.enum(SOURCE_KINDS), id: z.string().max(40) }) }),
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
    const body = checkPlayers(cid, z.object({ ...fields, aliases: fields.aliases.default([]), kind: fields.kind.default(''), parent: fields.parent.default(null), tags: fields.tags.default([]), available: available.default('dm'), sections: fields.sections.default([]), picture: fields.picture.default(null), banner: fields.banner.default(null), gallery: fields.gallery.default([]), facts: fields.facts.default([]) }).parse(request.body ?? {}));
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
