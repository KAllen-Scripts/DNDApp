/**
 * The map creator (DM): maps made in the app from floors, walls, doors,
 * assets, paths and labels (SPEC §6.6 "Making a map"); starting points
 * (generated, or drafted by the AI from a description or sketch); floors of
 * a building as levels; and the DM's own assets and stamps for it. A made
 * map is an ordinary map from then on (tokens, fog, walls, line of sight);
 * the server draws its picture from the design (maps/design.js).
 */
import crypto from 'node:crypto';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../store.js';
import { BLOCKS, DESIGN_MAX, DESIGN_MIN, MAX_DESIGN_ASSETS, MAX_DESIGN_LABELS, MAX_DESIGN_PATHS, MAX_DESIGN_WALLS, emptyDesign, isMapRef, normalizeClip, normalizeDesign } from '@dndapp/shared/map-design.js';
import { GENERATORS, generateDesign } from '@dndapp/shared/map-generate.js';
import { BUILT_IN_STAMPS } from '@dndapp/shared/map-stamps.js';
import { MAX_LEVEL, levelName } from '@dndapp/shared/map.js';
import { MAX_PICTURE_BYTES, inspectPicture } from '../images.js';
import { renderDesign } from '../maps/design.js';

const ASSET_PREVIEW_PX = 512; // the copy of an asset's picture the creator draws with
const DRAFT_KEEP_MS = 60 * 60_000; // how long a finished AI draft waits to be opened
const MAX_DRAFTS_AT_ONCE = 2; // per person

export function registerMapCreator(app, r) {
  const { access, designDrafter, mapAiAllowed, mapAssets, mapStamps, maps, publicMessage, tokenArt, viewableMap } = r;

  // A design is a few hundred KB at most (60 x 60 squares, 1500 walls, 800 assets, 80 paths, 100 labels).
  const designBody = { bodyLimit: 2 * 1024 * 1024 };
  const PIECES = {
    floor: z.array(z.string().max(200)).max(200),
    heights: z.array(z.array(z.number()).max(200)).max(200).default([]),
    walls: z.array(z.object({}).passthrough()).max(MAX_DESIGN_WALLS * 2),
    assets: z.array(z.object({}).passthrough()).max(MAX_DESIGN_ASSETS * 2),
    paths: z.array(z.object({}).passthrough()).max(MAX_DESIGN_PATHS * 2).default([]),
    labels: z.array(z.object({}).passthrough()).max(MAX_DESIGN_LABELS * 2).default([]),
  };
  const DESIGN = z.object({ cols: z.number(), rows: z.number(), ...PIECES, look: z.object({}).passthrough().nullable().default(null) });
  const CLIP = z.object({ cols: z.number(), rows: z.number(), ...PIECES });

  /** Uploaded assets in a design or clip must be this campaign's own. */
  function checkAssets(cid, assets) {
    const missing = assets.find((a) => a.a.startsWith('u:') && !mapAssets.file(cid, a.a.slice(2)));
    if (missing) throw new BadRequestError('One of the assets on this map is no longer there. Take it off and try again.');
  }

  /**
   * A design from the page, cleaned up, with its uploaded assets checked
   * (only this campaign's own) and where its things lead checked (another
   * map in this campaign, not `self`).
   */
  function readDesign(cid, input, self = null) {
    const design = normalizeDesign(DESIGN.parse(input));
    checkAssets(cid, design.assets);
    for (const a of design.assets) {
      if (!a.to) continue;
      let ok = a.to !== self && isMapRef(a.to);
      try {
        if (ok) maps.get(cid, a.to);
      } catch {
        ok = false;
      }
      if (!ok) throw new BadRequestError(`"${a.label || 'Something'}" on this map leads to a map that isn't there. Pick another map for it, or none.`);
    }
    return design;
  }

  const draw = (cid, design) => renderDesign(design, { assetFile: (id) => mapAssets.file(cid, id) });

  /** Make a new map (DM): { name, design }. The picture is drawn from the design; the map starts hidden from players. */
  app.post('/campaigns/:cid/maps/design', designBody, async (request, reply) => {
    const a = access(request, { dm: true });
    const { name, design } = z.object({ name: z.string().trim().min(1).max(100), design: z.unknown() }).parse(request.body ?? {});
    const clean = readDesign(a.cid, design);
    const map = maps.createDesigned(a.cid, { name, design: clean, image: await draw(a.cid, clean), by: request.user.id });
    reply.status(201);
    return maps.view(map, a);
  });

  /** What a map made in the creator was made from (DM), to change it: { design }. */
  app.get('/campaigns/:cid/maps/:mid/design', async (request) => {
    access(request, { dm: true });
    const { map } = viewableMap(request);
    if (!map.design) throw new NotFoundError("This map wasn't made in the map creator.");
    return { design: map.design };
  });

  /** Save a map made in the creator again (DM): { design }. A new picture; tokens, fog and the DM's own walls stay. */
  app.put('/campaigns/:cid/maps/:mid/design', designBody, async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (!map.design) throw new BadRequestError("This map wasn't made in the map creator.");
    const { design } = z.object({ design: z.unknown() }).parse(request.body ?? {});
    const clean = readDesign(a.cid, design, map.id);
    return maps.view(maps.redesign(a.cid, map.id, { design: clean, image: await draw(a.cid, clean), by: request.user.id }), a);
  });

  // ---------- starting points ----------

  /** The kinds of map the creator can make to start from (DM): { kinds: [{ key, name, about, cols, rows }] }. */
  app.get('/campaigns/:cid/maps/design/kinds', async (request) => {
    access(request, { dm: true });
    return { kinds: Object.entries(GENERATORS).map(([key, g]) => ({ key, ...g })) };
  });

  /**
   * Make a map to start from (DM): { kind, cols?, rows?, seed? }. Nothing is
   * saved: the page opens the design in the creator. The same seed and size
   * make the same map; without a seed, a new one each time.
   */
  app.post('/campaigns/:cid/maps/design/generate', async (request) => {
    access(request, { dm: true });
    const body = z
      .object({
        kind: z.enum(Object.keys(GENERATORS)),
        cols: z.number().int().min(16).max(DESIGN_MAX).nullable().default(null),
        rows: z.number().int().min(12).max(DESIGN_MAX).nullable().default(null),
        seed: z.number().int().min(1).max(2 ** 31 - 1).nullable().default(null),
      })
      .parse(request.body ?? {});
    const seed = body.seed ?? crypto.randomInt(1, 1_000_000);
    return { name: GENERATORS[body.kind].name, seed, design: generateDesign(body.kind, { cols: body.cols, rows: body.rows, seed }) };
  });

  // AI drafts, made in the background and kept here (not saved) until the page opens them.
  const drafts = new Map();
  const draftView = (d) => ({ id: d.id, status: d.status, error: d.error, name: d.name, notes: d.notes, design: d.design, started_at: d.started_at });
  const forgetOld = () => {
    const old = Date.now() - DRAFT_KEEP_MS;
    for (const [id, d] of drafts) if (d.at < old) drafts.delete(id);
  };

  /**
   * Have the AI draft a map (DM): { prompt, cols?, rows?, sketch? (a picture,
   * base64) }. Without a size the AI picks one. Answers at once with the
   * draft's id; GET .../design/draft/:id says when it's done and has the
   * design, to open in the creator (nothing is saved until the DM saves it).
   */
  app.post('/campaigns/:cid/maps/design/draft', { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) + 64 * 1024 }, async (request, reply) => {
    const a = access(request, { dm: true });
    const body = z
      .object({
        prompt: z.string().trim().min(3).max(4000),
        cols: z.number().int().min(DESIGN_MIN).max(DESIGN_MAX).nullable().default(null),
        rows: z.number().int().min(DESIGN_MIN).max(DESIGN_MAX).nullable().default(null),
        sketch: z.string().min(1).nullable().default(null),
      })
      .parse(request.body ?? {});
    if ((body.cols == null) !== (body.rows == null)) throw new BadRequestError('Give the size both ways (squares across and down), or neither for the AI to choose.');
    const sketch = body.sketch ? Buffer.from(body.sketch, 'base64') : null;
    if (sketch) await inspectPicture(sketch);
    forgetOld();
    const mine = [...drafts.values()].filter((d) => d.by === request.user.id && d.status === 'pending');
    if (mine.length >= MAX_DRAFTS_AT_ONCE) throw new BadRequestError('The AI is already drafting maps for you. Wait for one to finish.');
    mapAiAllowed(request.user.id);
    const d = { id: crypto.randomBytes(8).toString('hex'), cid: a.cid, by: request.user.id, status: 'pending', error: '', name: '', notes: '', design: null, started_at: new Date().toISOString(), at: Date.now() };
    drafts.set(d.id, d);
    designDrafter
      .draft({ prompt: body.prompt, cols: body.cols, rows: body.rows, sketch, seed: crypto.randomInt(1, 1_000_000), campaignId: a.cid, userId: request.user.id })
      .then((out) => Object.assign(d, { status: 'done', name: out.name, notes: out.notes, design: out.design, at: Date.now() }))
      .catch((err) => {
        app.log.warn(err);
        Object.assign(d, { status: 'failed', error: `The AI couldn't draft this map: ${publicMessage(err)}`, at: Date.now() });
      });
    reply.status(202);
    return draftView(d);
  });

  /** How an AI draft is getting on (DM): { status: pending | done | failed, error, name, notes, design (once done) }. */
  app.get('/campaigns/:cid/maps/design/draft/:id', async (request) => {
    const a = access(request, { dm: true });
    const d = drafts.get(String(request.params.id));
    if (!d || d.cid !== a.cid) throw new NotFoundError('That draft is gone (drafts are kept for an hour). Ask the AI again.');
    return draftView(d);
  });

  // ---------- levels: the floors of a building, each its own map ----------

  /**
   * Add a floor above or below a map made in the creator (DM): { n (-9..9),
   * start: 'copy' (its floor and walls) | 'empty', name? }. The new map is the
   * same size, hidden, and in the same building (`level.group`): stairs and
   * ladders that lead between them arrive at the matching place.
   */
  app.post('/campaigns/:cid/maps/:mid/levels', async (request, reply) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (!map.design) throw new BadRequestError('Only maps made in the map creator can have floors added.');
    const body = z
      .object({ n: z.number().int().min(-MAX_LEVEL).max(MAX_LEVEL), start: z.enum(['copy', 'empty']).default('copy'), name: z.string().trim().min(1).max(100).optional() })
      .parse(request.body ?? {});
    const group = map.level?.group ?? map.id;
    const here = map.level?.n ?? 0;
    const same = maps.list(a.cid).filter((m) => (m.level?.group ?? m.id) === group);
    if (body.n === here || same.some((m) => (m.level?.n ?? 0) === body.n)) throw new BadRequestError(`This building already has a ${levelName(body.n).toLowerCase()}.`);
    if (!map.level) maps.change(a.cid, map.id, (m) => { m.level = { group, n: 0 }; }, { by: request.user.id, reason: 'floors' });
    const from = map.design;
    const design = body.start === 'copy'
      ? normalizeDesign({ cols: from.cols, rows: from.rows, floor: from.floor, walls: from.walls, look: from.look })
      : normalizeDesign({ ...emptyDesign(from.cols, from.rows), look: from.look });
    const base = map.name.endsWith(` (${levelName(here)})`) ? map.name.slice(0, -(levelName(here).length + 3)) : map.name;
    const name = body.name ?? `${base} (${levelName(body.n)})`.slice(0, 100);
    const made = maps.createDesigned(a.cid, { name, design, image: await draw(a.cid, design), level: { group, n: body.n }, by: request.user.id });
    reply.status(201);
    return maps.view(made, a);
  });

  // ---------- stamps: pieces of map to put down again ----------

  /** The stamps (DM): the ones that come with the creator and the DM's own: { builtIn, stamps }. */
  app.get('/campaigns/:cid/map-stamps', async (request) => {
    const a = access(request, { dm: true });
    return { builtIn: BUILT_IN_STAMPS, stamps: mapStamps.list(a.cid).map(mapStamps.view) };
  });

  /** Keep a piece of map as a stamp (DM): { name, clip } (a clip: map-design.js copyArea). */
  app.post('/campaigns/:cid/map-stamps', designBody, async (request, reply) => {
    const a = access(request, { dm: true });
    const body = z.object({ name: z.string().trim().min(1).max(60), clip: CLIP }).parse(request.body ?? {});
    const clip = normalizeClip(body.clip);
    checkAssets(a.cid, clip.assets);
    if (!clip.walls.length && !clip.assets.length && !clip.paths.length && !clip.labels.length && clip.floor.every((l) => /^\.*$/.test(l))) {
      throw new BadRequestError('There is nothing in that piece of map to keep.');
    }
    // Where things lead is the map's own business, not the stamp's.
    clip.assets = clip.assets.map((x) => ({ ...x, to: null }));
    const stamp = mapStamps.create(a.cid, { name: body.name, clip }, { by: request.user.id });
    reply.status(201);
    return mapStamps.view(stamp);
  });

  /** Rename a stamp (DM): { name }. */
  app.patch('/campaigns/:cid/map-stamps/:sid', async (request) => {
    const a = access(request, { dm: true });
    mapStamps.get(a.cid, request.params.sid);
    const body = z.object({ name: z.string().trim().min(1).max(60) }).parse(request.body ?? {});
    return mapStamps.view(mapStamps.update(a.cid, request.params.sid, body));
  });

  /** Take a stamp off the list (DM). The archive keeps it. */
  app.delete('/campaigns/:cid/map-stamps/:sid', async (request) => {
    const a = access(request, { dm: true });
    mapStamps.remove(a.cid, request.params.sid);
    return { ok: true };
  });

  // ---------- the DM's own assets ----------

  /** The DM's own assets, by name (DM only). */
  app.get('/campaigns/:cid/map-assets', async (request) => {
    const a = access(request, { dm: true });
    return { assets: mapAssets.list(a.cid).map(mapAssets.view) };
  });

  /** Add an asset (DM): { name, filename?, data (base64), blocks? }. A PNG or WebP with a see-through background works best. */
  app.post('/campaigns/:cid/map-assets', { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) + 64 * 1024 }, async (request, reply) => {
    const a = access(request, { dm: true });
    const body = z
      .object({ name: z.string().trim().max(60).optional(), filename: z.string().max(200).default(''), data: z.string().min(1), blocks: z.enum(BLOCKS).default('none') })
      .parse(request.body ?? {});
    const buf = Buffer.from(body.data, 'base64');
    const meta = await inspectPicture(buf);
    const name = body.name || body.filename.replace(/\.[^.]*$/, '').replace(/[_-]+/g, ' ').trim() || 'Asset';
    let x = mapAssets.create(a.cid, { name, width: meta.width, height: meta.height, blocks: body.blocks }, { by: request.user.id });
    x = mapAssets.update(a.cid, x.id, { art: await mapAssets.savePicture(a.cid, x.id, buf) });
    reply.status(201);
    return mapAssets.view(x);
  });

  /** Rename an asset or change what it blocks by default (DM): { name?, blocks? }. */
  app.patch('/campaigns/:cid/map-assets/:aid', async (request) => {
    const a = access(request, { dm: true });
    mapAssets.get(a.cid, request.params.aid);
    const body = z.object({ name: z.string().trim().min(1).max(60).optional(), blocks: z.enum(BLOCKS).optional() }).parse(request.body ?? {});
    return mapAssets.view(mapAssets.update(a.cid, request.params.aid, body));
  });

  /** Take an asset off the list (DM). Maps already made with it keep it; the archive keeps it. */
  app.delete('/campaigns/:cid/map-assets/:aid', async (request) => {
    const a = access(request, { dm: true });
    mapAssets.remove(a.cid, request.params.aid);
    return { ok: true };
  });

  /** An asset's picture (DM), at most 512 px a side, as WebP (see-through kept). Removed ones too, for maps that use them. */
  app.get('/campaigns/:cid/map-assets/:aid/picture', async (request, reply) => {
    const a = access(request, { dm: true });
    const file = mapAssets.file(a.cid, request.params.aid);
    if (!file) throw new NotFoundError('No such asset');
    return reply.type('image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(await tokenArt.shrunk(file, ASSET_PREVIEW_PX));
  });
}
