/**
 * The DM's creatures: saved enemies and NPCs (picture, stat block, notes) placed on maps as tokens, and
 * found online by the AI.
 */
import fs from 'node:fs';
import { MAX_TOKENS, TOKEN_SIZES, snapToken, squarePx } from '@dndapp/shared/map.js';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../store.js';
import { CREATURE_KINDS, MAX_CREATURE_NOTES, tokenNames } from '../creatures.js';
import { MAX_PICTURE_BYTES } from '../images.js';
import { isMapId, newTokenId } from '../maps/store.js';

export function registerCreatures(app, r) {
  const { access, archive, creatureFinder, creatures, linkRecord, mapAiAllowed, maps, statBlocks, tokenArt, viewableMap } = r;

  // ---------- the DM's creatures (saved enemies and NPCs, placed on maps as tokens) ----------

  const CREATURE = z.object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(CREATURE_KINDS),
    size: z.number().refine((n) => TOKEN_SIZES.includes(n), 'must be 0.5, 1, 2, 3 or 4'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour like #b33a3a'),
    hp_max: z.number().int().positive().max(100_000).nullable(),
    darkvision: z.number().min(0).max(10_000),
    speed: z.number().min(0).max(10_000).nullable(),
    stats: z.object({ text: z.string().max(8000), name: z.string().max(100).optional(), ac: z.number().int().nullable().optional(), hp_formula: z.string().max(40).optional(), speed: z.string().max(120).optional(), challenge: z.string().max(40).optional() }).nullable(),
    record: z.object({ id: z.number().int().positive(), title: z.string().max(200).optional() }).nullable(),
    notes: z.string().max(MAX_CREATURE_NOTES),
  });
  const PICTURE_UPLOAD = z.object({ filename: z.string().max(200).default(''), data: z.string().min(1) });
  const creatureBody = { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) + 64 * 1024 };
  // A typed stat block is the DM's own.
  const ownStats = (body) => {
    if (body.stats === undefined) return;
    body.stats = body.stats?.text.trim() ? { ...body.stats, source: 'dm' } : null;
  };

  /** The DM's creatures, by name. Players never get them. */
  app.get('/campaigns/:cid/creatures', async (request) => {
    const a = access(request, { dm: true });
    return { creatures: creatures.list(a.cid).map(creatures.view) };
  });

  /**
   * Save a creature (DM): { name, kind, size?, color?, hp_max?, darkvision?,
   * speed?, stats?, record?, notes?, picture?: { filename, data (base64) } },
   * or { from: { map_id, token_id } } to save a token already on a map, with
   * its picture and stat block ("Goblin 3" is saved as "Goblin").
   */
  app.post('/campaigns/:cid/creatures', creatureBody, async (request, reply) => {
    const a = access(request, { dm: true });
    const { from, picture, ...rest } = z.object({ from: z.object({ map_id: z.string(), token_id: z.string() }).optional(), picture: PICTURE_UPLOAD.optional() }).passthrough().parse(request.body ?? {});
    let fields;
    let art = null;
    if (from) {
      if (!isMapId(from.map_id)) throw new NotFoundError('No such map');
      const map = maps.get(a.cid, from.map_id);
      const t = map.tokens.find((x) => x.id === from.token_id);
      if (!t) throw new NotFoundError('No such token');
      if (t.kind === 'pc') throw new BadRequestError("A player's character can't be saved as a creature.");
      fields = { name: t.name.replace(/ \d+$/, '') || t.name, kind: t.kind, size: t.size, color: t.color, hp_max: t.hp?.max ?? null, darkvision: t.darkvision ?? 0, speed: t.speed ?? null, stats: t.stats ?? null, record: t.record ?? null };
      if (t.art) art = { buf: fs.readFileSync(archive.tokenImagePath(a.campaign.slug, map.id, t.art.file)) };
    } else {
      fields = CREATURE.partial().required({ name: true, kind: true }).parse(rest);
      ownStats(fields);
      linkRecord(a.cid, fields);
      if (picture) art = { buf: Buffer.from(picture.data, 'base64') };
    }
    let c = creatures.create(a.cid, fields, { by: request.user.id });
    if (art) c = creatures.update(a.cid, c.id, { art: await creatures.savePicture(a.cid, c.id, art.buf) });
    reply.status(201);
    return creatures.view(c);
  });

  /** Change a creature (DM): any of the fields above. Tokens already placed keep what they had. */
  app.patch('/campaigns/:cid/creatures/:crid', async (request) => {
    const a = access(request, { dm: true });
    creatures.get(a.cid, request.params.crid);
    const body = CREATURE.partial().parse(request.body ?? {});
    ownStats(body);
    linkRecord(a.cid, body);
    return creatures.view(creatures.update(a.cid, request.params.crid, body));
  });

  /** Take a creature out of the library (DM). Its tokens stay on the maps; the archive keeps it. */
  app.delete('/campaigns/:cid/creatures/:crid', async (request) => {
    const a = access(request, { dm: true });
    creatures.remove(a.cid, request.params.crid);
    return { ok: true };
  });

  /** Give a creature a picture (DM): { filename, data (base64) }. Kept as uploaded. */
  app.put('/campaigns/:cid/creatures/:crid/picture', creatureBody, async (request) => {
    const a = access(request, { dm: true });
    const c = creatures.get(a.cid, request.params.crid);
    const body = PICTURE_UPLOAD.parse(request.body ?? {});
    return creatures.view(creatures.update(a.cid, c.id, { art: await creatures.savePicture(a.cid, c.id, Buffer.from(body.data, 'base64')) }));
  });

  /** Go back to initials (DM). The archive keeps the file. */
  app.delete('/campaigns/:cid/creatures/:crid/picture', async (request) => {
    const a = access(request, { dm: true });
    return creatures.view(creatures.update(a.cid, request.params.crid, { art: null }));
  });

  /** A creature's picture, cut to a square like token pictures (DM). ?v= is its key. */
  app.get('/campaigns/:cid/creatures/:crid/picture', async (request, reply) => {
    const a = access(request, { dm: true });
    const c = creatures.get(a.cid, request.params.crid);
    if (!c.art) throw new NotFoundError('No picture');
    const file = creatures.picturePath(a.cid, c);
    return reply.type('image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(await tokenArt.square(file));
  });

  /**
   * Fill a creature's stat block with the AI (DM): { name? } (default: its
   * name). Sets its hit points and size too, unless the DM already did.
   * 404 if the AI doesn't know the creature.
   */
  app.post('/campaigns/:cid/creatures/:crid/stats', async (request) => {
    const a = access(request, { dm: true });
    const c = creatures.get(a.cid, request.params.crid);
    const { name } = z.object({ name: z.string().trim().min(1).max(100).optional() }).parse(request.body ?? {});
    mapAiAllowed(request.user.id);
    const found = await statBlocks.lookup(name ?? c.name, { campaignId: a.cid, userId: request.user.id, exclude: c.id });
    if (!found) throw new NotFoundError(`The AI doesn't know a creature called "${name ?? c.name}". Try its proper name, like "Goblin" or "Adult Red Dragon".`);
    const fields = { stats: found.stats };
    if (!c.hp_max && found.hp) fields.hp_max = found.hp;
    if (found.size && c.size === 1) fields.size = found.size;
    return creatures.view(creatures.update(a.cid, c.id, fields));
  });

  /**
   * Have the AI find a creature online (DM): { query }, e.g. "Hollow Knight
   * from the Grimhollow book" or "a crystal golem". Official or not; it
   * searches the web, writes up the stat block and brings a picture. Runs in
   * the background: the creature is listed at once with finding.status
   * 'pending', then filled in (or 'failed', with an error). 202.
   */
  app.post('/campaigns/:cid/creatures/find', async (request, reply) => {
    const a = access(request, { dm: true });
    const { query } = z.object({ query: z.string().trim().min(2).max(200) }).parse(request.body ?? {});
    mapAiAllowed(request.user.id);
    const c = creatures.create(a.cid, { name: query.slice(0, 80), kind: 'enemy', finding: { query, status: 'pending' } }, { by: request.user.id });
    const fail = (error) => {
      try {
        creatures.update(a.cid, c.id, { finding: { query, status: 'failed', error } });
      } catch { /* removed meanwhile */ }
    };
    (async () => {
      try {
        const found = await creatureFinder.find(query, { campaignId: a.cid, userId: request.user.id });
        if (!found) return fail(`The AI couldn't find "${query}" anywhere. Try another name, or add where it's from.`);
        creatures.get(a.cid, c.id); // still wanted?
        const art = found.picture ? await creatures.savePicture(a.cid, c.id, found.picture) : null;
        creatures.update(a.cid, c.id, { ...found.fields, art, finding: null });
      } catch (err) {
        if (err instanceof NotFoundError) return;
        request.log.error(err);
        fail(`The search went wrong: ${err.message}`);
      }
    })();
    reply.status(202);
    return creatures.view(c);
  });

  /**
   * Put a creature on a map (DM): { count? (1-20), x?, y?, hidden?, name? }.
   * Each token gets its picture, stat block, hit points and the rest; a group
   * is numbered ("Goblin 1".."Goblin 4", carrying on from any already there)
   * and set out in a row from (x, y), the middle of the map by default.
   */
  app.post('/campaigns/:cid/maps/:mid/creatures/:crid', async (request, reply) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const c = creatures.get(a.cid, request.params.crid);
    if (c.finding) throw new BadRequestError(c.finding.status === 'pending' ? 'The AI is still looking for that one.' : "The AI didn't find that one.");
    const body = z.object({ count: z.number().int().min(1).max(20).default(1), x: z.number().optional(), y: z.number().optional(), hidden: z.boolean().default(false), name: z.string().trim().min(1).max(80).optional() }).parse(request.body ?? {});
    if (map.tokens.length + body.count > MAX_TOKENS) throw new BadRequestError(`A map can have at most ${MAX_TOKENS} tokens.`);
    // The picture goes with the map's own token pictures (once per map), so the map stays whole on its own.
    if (c.art) {
      const dest = archive.tokenImagePath(a.campaign.slug, map.id, c.art.file);
      if (!fs.existsSync(dest)) archive.saveTokenImage(a.campaign.slug, map.id, c.art.file, fs.readFileSync(creatures.picturePath(a.cid, c)));
    }
    const ids = [];
    const saved = maps.change(a.cid, map.id, (m) => {
      const names = tokenNames(body.name ?? c.name, body.count, m.tokens.map((t) => t.name));
      const step = squarePx(m) * Math.max(1, c.size);
      const x0 = body.x ?? m.image.width / 2;
      const y0 = body.y ?? m.image.height / 2;
      names.forEach((name, i) => {
        const id = newTokenId();
        ids.push(id);
        const token = {
          id, kind: c.kind, name, user_id: null, color: c.color, size: c.size,
          hp: c.hp_max ? { current: c.hp_max, max: c.hp_max } : null,
          conditions: [], hidden: body.hidden, record: c.record, stats: c.stats, light: null,
          darkvision: c.darkvision, speed: c.speed, art: c.art ? { ...c.art } : null,
        };
        Object.assign(token, snapToken(m, token, x0 + (i - (names.length - 1) / 2) * step, y0));
        m.tokens.push(token);
      });
    }, { by: request.user.id, reason: 'token added' });
    reply.status(201);
    const view = maps.view(saved, a);
    return { map: view, tokens: view.tokens.filter((t) => ids.includes(t.id)) };
  });
}
