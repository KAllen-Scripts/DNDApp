/**
 * The map creator (DM): maps made in the app from floors, walls, doors and
 * assets (SPEC §6.6 "Making a map"), and the DM's own assets for it. A made
 * map is an ordinary map from then on (tokens, fog, walls, line of sight);
 * the server draws its picture from the design (maps/design.js).
 */
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../store.js';
import { BLOCKS, normalizeDesign } from '@dndapp/shared/map-design.js';
import { MAX_PICTURE_BYTES, inspectPicture } from '../images.js';
import { renderDesign } from '../maps/design.js';

const ASSET_PREVIEW_PX = 512; // the copy of an asset's picture the creator draws with

export function registerMapCreator(app, r) {
  const { access, mapAssets, maps, tokenArt, viewableMap } = r;

  // A design is a few hundred KB at most (60 x 60 squares, 1500 walls, 500 assets).
  const designBody = { bodyLimit: 2 * 1024 * 1024 };
  const DESIGN = z.object({
    cols: z.number(),
    rows: z.number(),
    floor: z.array(z.string().max(200)).max(200),
    walls: z.array(z.object({}).passthrough()).max(5000),
    assets: z.array(z.object({}).passthrough()).max(2000),
  });

  /** A design from the page, cleaned up, with its uploaded assets checked: only this campaign's own. */
  function readDesign(cid, input) {
    const design = normalizeDesign(DESIGN.parse(input));
    const missing = design.assets.find((a) => a.a.startsWith('u:') && !mapAssets.file(cid, a.a.slice(2)));
    if (missing) throw new BadRequestError('One of the assets on this map is no longer there. Take it off and try again.');
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
    const clean = readDesign(a.cid, design);
    return maps.view(maps.redesign(a.cid, map.id, { design: clean, image: await draw(a.cid, clean), by: request.user.id }), a);
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
