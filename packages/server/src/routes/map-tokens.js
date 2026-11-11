/**
 * Tokens and pins on a map (moved out of routes/maps.js, registered right after it): the DM adds, changes
 * and removes tokens and their pictures and stat blocks; players move their own token, add companions and
 * summons of their own, and keep private pins.
 */
import { endConcentration } from '@dndapp/shared/spell-effects.js';
import crypto from 'node:crypto';
import { CONDITIONS, MAX_COMPANIONS, MAX_PINS, characterMap, followLoop, trailFollowers, MAX_HEIGHT_FT, MAX_TOKENS, PLAYER_KINDS, TOKEN_KINDS, TOKEN_SIZES, canSee, ownToken, pathCost, snapToken, stepTurn, tokenPx, walkLevels, wallBetween } from '@dndapp/shared/map.js';
import { z } from 'zod';
import { AuthError } from '../auth.js';
import { BadRequestError, NotFoundError } from '../store.js';
import { MAX_PICTURE_BYTES, createImageCache, inspectPicture } from '../images.js';
import { newTokenId } from '../maps/store.js';
import { RADII } from './maps.js';

export function registerMapTokens(app, r) {
  const { access, archive, auth, maps, statBlocks } = r;
  const { clearCharacter, linkPage, linkRecord, mapAiAllowed, moveGroup, viewableMap } = r;

  const TOKEN = z.object({
    kind: z.enum(TOKEN_KINDS),
    name: z.string().trim().max(80),
    user_id: z.number().int().nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour like #b33a3a'),
    size: z.number().refine((n) => TOKEN_SIZES.includes(n), 'must be 0.5, 1, 2, 3 or 4'),
    x: z.number(),
    y: z.number(),
    hp: z.object({ current: z.number().int().nullable(), max: z.number().int().positive().nullable() }).nullable(),
    conditions: z.array(z.enum(CONDITIONS)).max(CONDITIONS.length),
    hidden: z.boolean(),
    record: z.object({ id: z.number().int().positive(), title: z.string().max(200).optional() }).nullable(),
    page: z.object({ id: z.string() }).nullable(),
    stats: z.object({ text: z.string().max(8000), ac: z.number().int().nullable().optional(), hp_formula: z.string().max(40).optional(), speed: z.string().max(120).optional(), challenge: z.string().max(40).optional() }).nullable(),
    light: z.object(RADII).nullable(),
    darkvision: z.number().min(0).max(10_000),
    speed: z.number().min(0).max(10_000).nullable(),
    // How tall it is (feet; null: its sheet's or its size's), and how far above the ground it is (flying, climbing).
    height: z.number().min(0.5).max(MAX_HEIGHT_FT).nullable(),
    elevation: z.number().min(-MAX_HEIGHT_FT).max(MAX_HEIGHT_FT),
    // Under a bridge rather than on it (it changes by itself as the token moves; this sets it by hand).
    under: z.boolean(),
    merchant: z.string().regex(/^[a-f0-9]{10}$/).nullable(),
    // The token it follows on this map (null: nobody).
    follows: z.string().nullable(),
  });
  // What a player may change on their own token; everything else is the DM's.
  const OWNER_FIELDS = new Set(['x', 'y', 'hp', 'conditions', 'light', 'darkvision', 'height', 'elevation', 'under', 'follows']);
  // On their companions and summons, a player may also rename it, resize it, recolour it and write its stat block.
  const COMPANION_FIELDS = new Set([...OWNER_FIELDS, 'name', 'size', 'color', 'stats', 'speed']);
  // What a player sends to add a companion or summon of their own.
  const COMPANION = TOKEN.pick({ name: true, size: true, color: true, x: true, y: true, hp: true, darkvision: true, speed: true, stats: true }).partial();

  /** A player character's or companion's token belongs to someone in this campaign. */
  const checkTokenOwner = (cid, token) => {
    if (PLAYER_KINDS.includes(token.kind) && token.user_id != null && !auth.membership(cid, token.user_id)) {
      throw new BadRequestError("That player isn't in this campaign.");
    }
  };

  /**
   * Add a token. The DM: { kind, name, user_id?, color?, size?, x?, y?, hp?, conditions?, hidden? }.
   * A player adds a companion or summon of their own (a familiar, an animal companion, a conjured
   * creature): { name, size?, color?, hp?, darkvision?, speed?, stats?, x?, y? }. It's theirs to
   * control. It goes where they ask if they can see that place, else next to their character.
   * On a grid it snaps to squares.
   */
  app.post('/campaigns/:cid/maps/:mid/tokens', async (request, reply) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    if (a.role !== 'dm') return addCompanion(request, reply, a, map, view);
    const body = TOKEN.partial().required({ kind: true }).parse(request.body ?? {});
    if (map.tokens.length >= MAX_TOKENS) throw new BadRequestError(`A map can have at most ${MAX_TOKENS} tokens.`);
    checkTokenOwner(a.cid, body);
    linkRecord(a.cid, body);
    linkPage(a.cid, body);
    // A player character is on one map at a time: adding them where they aren't brings their token (and
    // whoever follows them) over from the map they're on (the party panel's Bring here).
    if (body.kind === 'pc' && body.user_id != null) {
      const { x, y, ...apply } = body;
      const at = { x: x ?? map.image.width / 2, y: y ?? map.image.height / 2 };
      const here = map.tokens.find((t) => t.kind === 'pc' && t.user_id === body.user_id);
      const elsewhere = characterMap(maps.list(a.cid).filter((m) => m.id !== map.id), body.user_id);
      if (here) {
        const saved = maps.change(a.cid, map.id, (m) => {
          const t = m.tokens.find((x) => x.id === here.id);
          Object.assign(t, apply, snapToken(m, { ...t, ...apply }, at.x, at.y));
        }, { by: request.user.id, reason: 'token changed' });
        clearCharacter(a.cid, body.user_id, [map.id], request.user.id);
        reply.status(201);
        return { map: maps.view(saved, a), token: saved.tokens.find((t) => t.id === here.id) };
      }
      if (elsewhere) {
        const leader = elsewhere.tokens.find((t) => t.kind === 'pc' && t.user_id === body.user_id);
        const { arrived, id } = moveGroup(a.cid, elsewhere, leader.id, map, at, { by: request.user.id, apply });
        reply.status(201);
        return { map: maps.view(arrived, a), token: arrived.tokens.find((t) => t.id === id) };
      }
    }
    const id = newTokenId();
    const saved = maps.change(a.cid, map.id, (m) => {
      const token = { size: 1, ...body, id, x: body.x ?? m.image.width / 2, y: body.y ?? m.image.height / 2 };
      Object.assign(token, snapToken(m, { size: TOKEN_SIZES.includes(token.size) ? token.size : 1 }, token.x, token.y));
      m.tokens.push(token);
    }, { by: request.user.id, reason: 'token added' });
    reply.status(201);
    return { map: maps.view(saved, a), token: saved.tokens.find((t) => t.id === id) };
  });

  /** A player adds a companion or summon of their own (see POST .../tokens). */
  function addCompanion(request, reply, a, map, view) {
    const { kind = 'companion', ...rest } = request.body ?? {};
    // Anything else (an enemy, an NPC, someone else's companion, a hidden one) is the DM's to add.
    if (kind !== 'companion' || Object.keys(rest).some((k) => !(k in COMPANION.shape))) throw new AuthError('Only the DM can add that', 403);
    const body = COMPANION.parse(rest);
    if (!body.name) throw new BadRequestError('What is it called?');
    if (map.tokens.length >= MAX_TOKENS) throw new BadRequestError(`A map can have at most ${MAX_TOKENS} tokens.`);
    if (map.tokens.filter((t) => t.kind === 'companion' && t.user_id === a.userId).length >= MAX_COMPANIONS) {
      throw new BadRequestError(`You can have at most ${MAX_COMPANIONS} companions and summons on a map. Dismiss some first.`);
    }
    // Only somewhere they can see (no placing a scout under the fog); else beside their character.
    const seen = maps.sightFor(map, a.userId);
    const own = map.tokens.find((t) => t.kind === 'pc' && t.user_id === a.userId);
    let at = null;
    if (body.x != null && body.y != null && canSee(map, seen.polygons, body.x, body.y)) at = { x: body.x, y: body.y };
    else if (own) at = { x: own.x + tokenPx(map, own), y: own.y };
    else if (!map.fog.enabled) at = { x: map.image.width / 2, y: map.image.height / 2 };
    if (!at) throw new BadRequestError('Put it somewhere you can see, or ask the DM to put your character on this map first.');
    const id = newTokenId();
    const saved = maps.change(a.cid, map.id, (m) => {
      // It follows its character about (and goes where they go) until it's moved on its own.
      const token = { size: 1, ...body, kind: 'companion', user_id: a.userId, id, hidden: false, ...at, follows: own?.id ?? null };
      if (token.hp && token.hp.current == null) token.hp.current = token.hp.max;
      Object.assign(token, snapToken(m, { size: TOKEN_SIZES.includes(token.size) ? token.size : 1 }, token.x, token.y));
      m.tokens.push(token);
    }, { by: request.user.id, reason: 'companion added' });
    reply.status(201);
    const out = maps.view(saved, a);
    return { map: out, token: out.tokens.find((t) => t.id === id) };
  }

  /**
   * Change a token. The player it belongs to may move it ({ x, y }) and set
   * its hit points and conditions (on their companions and summons, also its
   * name, size, colour, speed and stat block); anything else (kind, owner,
   * hidden) is the DM's.
   */
  app.patch('/campaigns/:cid/maps/:mid/tokens/:tid', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    // Only tokens this viewer can see (players don't get to find tokens under the fog).
    const token = view.tokens.find((t) => t.id === request.params.tid);
    if (!token) throw new NotFoundError('No such token');
    // A move can go by waypoints: path is where it turns on the way.
    const { path = [], ...rest } = z.object({ path: z.array(z.tuple([z.number(), z.number()])).max(50).optional() }).passthrough().parse(request.body ?? {});
    const body = TOKEN.partial().parse(rest);
    const moving = Object.keys(body).every((k) => k === 'x' || k === 'y' || k === 'under');
    if (a.role !== 'dm') {
      if (!ownToken(token, request.user.id)) throw new AuthError('You can only change your own token', 403);
      const allowed = token.kind === 'companion' ? COMPANION_FIELDS : OWNER_FIELDS;
      if (!Object.keys(body).every((k) => allowed.has(k))) throw new AuthError('Only the DM can change that', 403);
    }
    checkTokenOwner(a.cid, { ...token, ...body });
    linkRecord(a.cid, body);
    linkPage(a.cid, body);
    // Following someone this viewer can see on this map, and not round in a circle.
    if (body.follows != null) {
      if (!view.tokens.some((t) => t.id === body.follows) || body.follows === token.id) throw new NotFoundError('No such token');
      if (followLoop(map.tokens, token.id, body.follows)) throw new BadRequestError(`${map.tokens.find((t) => t.id === body.follows).name} is following ${token.name} already.`);
    }
    // A player character is on one map at a time (the party panel's Bring here moves them).
    const becomes = { ...token, ...body };
    if (becomes.kind === 'pc' && becomes.user_id != null && (token.kind !== 'pc' || token.user_id !== becomes.user_id)) {
      const elsewhere = characterMap(maps.list(a.cid), becomes.user_id);
      if (elsewhere) throw new BadRequestError(`That character is on ${elsewhere.id === map.id ? 'this map' : `"${elsewhere.name}"`} already. Bring them here from the party panel instead.`);
    }
    // Players can't walk through walls or closed doors (the DM can put any token anywhere).
    const moves = body.x !== undefined || body.y !== undefined;
    const route = moves ? [{ x: token.x, y: token.y }, ...path.map(([x, y]) => ({ x, y })), snapToken(map, token, body.x ?? token.x, body.y ?? token.y)] : [];
    if (a.role !== 'dm' && moves) {
      for (let i = 1; i < route.length; i++) if (wallBetween(map, route[i - 1], route[i])) throw new BadRequestError("There's a wall in the way.");
    }
    // A player character with a saved sheet has the sheet's hit points: a change goes on the sheet (current only).
    if (body.hp !== undefined && token.kind === 'pc' && token.hp_sheet && (body.user_id === undefined || body.user_id === token.user_id)) {
      const { hp } = body;
      delete body.hp;
      if (hp?.current != null) maps.setSheetHp(a.cid, token.user_id, hp.current, { by: request.user.id });
    }
    // A companion kept on its player's sheet: its hit points are the sheet's (current only; the maximum is its stat block's).
    if (body.hp !== undefined && token.kind === 'companion' && token.companion && token.hp_sheet) {
      const { hp } = body;
      delete body.hp;
      if (hp?.current != null) maps.setCompanionHp(a.cid, token.user_id, token.companion, hp.current, { by: request.user.id });
    }
    const changed = Object.keys(body).length
      ? maps.change(a.cid, map.id, (m) => {
        const t = m.tokens.find((x) => x.id === token.id);
        if (!t) return;
        const wasConcentrating = t.conditions.includes('concentrating');
        Object.assign(t, body);
        // Taking off Concentrating ends the spell it held (its area and the conditions it gave go too).
        if (wasConcentrating && body.conditions && !t.conditions.includes('concentrating')) endConcentration(m, t.id);
        if (!PLAYER_KINDS.includes(t.kind)) t.user_id = null;
        Object.assign(t, snapToken(m, t, t.x, t.y));
        // Walking in under a bridge or up onto it (owner, 2026-10-18), unless it's set by hand.
        if (moves && body.under === undefined) t.under = walkLevels(map, [...route.slice(0, -1), { x: t.x, y: t.y }], token).under;
        // In a fight, count how far it has moved this turn (difficult terrain costs double, climbing extra).
        const entry = moves && m.combat?.entries.find((e) => e.id === t.id);
        if (entry) entry.moved = (entry.moved ?? 0) + (pathCost(map, route, token)?.value ?? 0);
        if (moves) {
          // Moved on its own, it stops following; whoever follows it walks behind it (not in a fight, where everyone has their turn).
          if (body.follows === undefined) t.follows = null;
          t.journey = null;
          if (!m.combat) trailFollowers(m, t.id, [...route.slice(0, -1), { x: t.x, y: t.y }]);
        }
      }, { by: request.user.id, reason: moving ? 'token moved' : 'token changed' })
      : null;
    const out = maps.view(changed ?? maps.get(a.cid, map.id), a);
    return { map: out, token: out?.tokens.find((t) => t.id === token.id) ?? null };
  });

  /**
   * Fill a token's stat block with the AI (DM, or a player for their own
   * companion or summon): { name? } (default: the token's name). Sets its
   * hit points and size too, unless they were already set. 404 if the AI
   * doesn't know the creature.
   */
  app.post('/campaigns/:cid/maps/:mid/tokens/:tid/stats', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const token = (a.role === 'dm' ? map.tokens : view.tokens).find((t) => t.id === request.params.tid);
    if (!token) throw new NotFoundError('No such token');
    if (a.role !== 'dm' && !(token.kind === 'companion' && token.user_id === a.userId)) throw new AuthError('Only the DM can do that', 403);
    const { name } = z.object({ name: z.string().trim().min(1).max(100).optional() }).parse(request.body ?? {});
    mapAiAllowed(request.user.id);
    const found = await statBlocks.lookup(name ?? token.name, { campaignId: a.cid, userId: request.user.id, dmCreatures: a.role === 'dm' });
    if (!found) throw new NotFoundError(`The AI doesn't know a creature called "${name ?? token.name}". Try its proper name, like "Goblin" or "Adult Red Dragon".`);
    const saved = maps.change(a.cid, map.id, (m) => {
      const t = m.tokens.find((x) => x.id === token.id);
      if (!t) return;
      t.stats = found.stats;
      if (!t.hp && found.hp) t.hp = { current: found.hp, max: found.hp };
      if (found.size && t.size === 1) Object.assign(t, { size: found.size }, snapToken(m, { size: found.size }, t.x, t.y));
    }, { by: request.user.id, reason: 'stat block' });
    const out = maps.view(saved, a);
    return { map: out, token: out.tokens.find((t) => t.id === token.id) };
  });

  // Private pins: each person's own marks on a map. Only they ever see them (not even the DM).
  const PIN = z.object({ x: z.number(), y: z.number(), label: z.string().trim().max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour like #d9a400') });

  /** Your own pins on a map: { pins }. */
  app.get('/campaigns/:cid/maps/:mid/pins', async (request) => {
    const { cid, map } = viewableMap(request);
    return { pins: maps.pins(cid, map.id, request.user.id) };
  });

  /** Add a pin: { x, y, label?, color? }. */
  app.post('/campaigns/:cid/maps/:mid/pins', async (request, reply) => {
    const { cid, map } = viewableMap(request);
    const body = PIN.partial().required({ x: true, y: true }).parse(request.body ?? {});
    if (maps.pins(cid, map.id, request.user.id).length >= MAX_PINS) throw new BadRequestError(`You can have at most ${MAX_PINS} pins on a map.`);
    const id = newTokenId();
    const pins = maps.changePins(cid, map.id, request.user.id, (list) => list.push({ ...body, id }));
    reply.status(201);
    return { pins, pin: pins.find((p) => p.id === id) };
  });

  /** Move or relabel one of your pins: { x?, y?, label?, color? }. */
  app.patch('/campaigns/:cid/maps/:mid/pins/:pid', async (request) => {
    const { cid, map } = viewableMap(request);
    const body = PIN.partial().parse(request.body ?? {});
    if (!maps.pins(cid, map.id, request.user.id).some((p) => p.id === request.params.pid)) throw new NotFoundError('No such pin');
    const pins = maps.changePins(cid, map.id, request.user.id, (list) => Object.assign(list.find((p) => p.id === request.params.pid), body));
    return { pins, pin: pins.find((p) => p.id === request.params.pid) };
  });

  /** Remove one of your pins. */
  app.delete('/campaigns/:cid/maps/:mid/pins/:pid', async (request) => {
    const { cid, map } = viewableMap(request);
    if (!maps.pins(cid, map.id, request.user.id).some((p) => p.id === request.params.pid)) throw new NotFoundError('No such pin');
    return { pins: maps.changePins(cid, map.id, request.user.id, (list) => list.splice(list.findIndex((p) => p.id === request.params.pid), 1)) };
  });

  // NPC and enemy token pictures and the DM's creatures, cut to a square around what stands out (like players' token pictures).
  const tokenArt = createImageCache(64);

  /**
   * Give an NPC or enemy token a picture (DM): { filename, data (base64),
   * same_name?: true to give it to every token on this map with the same name
   * (a pack of goblins) }. The file is archived as uploaded.
   */
  app.put('/campaigns/:cid/maps/:mid/tokens/:tid/picture', { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) }, async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const token = map.tokens.find((t) => t.id === request.params.tid);
    if (!token) throw new NotFoundError('No such token');
    if (token.kind === 'pc') throw new BadRequestError("A player character's token shows the picture its player chose on their sheet.");
    const body = z.object({ filename: z.string().max(200).default(''), data: z.string().min(1), same_name: z.boolean().default(false) }).parse(request.body);
    const buf = Buffer.from(body.data, 'base64');
    const meta = await inspectPicture(buf);
    const file = `token-${crypto.randomBytes(5).toString('hex')}.${meta.ext}`;
    archive.saveTokenImage(a.campaign.slug, map.id, file, buf);
    const saved = maps.change(a.cid, map.id, (m) => {
      for (const t of m.tokens) {
        if (t.kind !== 'pc' && (t.id === token.id || (body.same_name && t.name.toLowerCase() === token.name.toLowerCase()))) t.art = { file, type: meta.type };
      }
    }, { by: request.user.id, reason: 'token picture' });
    return { map: maps.view(saved, a) };
  });

  /** Stop using a token's picture (DM). The archive keeps the file. */
  app.delete('/campaigns/:cid/maps/:mid/tokens/:tid/picture', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (!map.tokens.some((t) => t.id === request.params.tid)) throw new NotFoundError('No such token');
    const saved = maps.change(a.cid, map.id, (m) => {
      const t = m.tokens.find((x) => x.id === request.params.tid);
      if (t) t.art = null;
    }, { by: request.user.id, reason: 'token picture removed' });
    return { map: maps.view(saved, a) };
  });

  /** An NPC's or enemy's token picture, for whoever can see that token. ?v= is its key. */
  app.get('/campaigns/:cid/maps/:mid/tokens/:tid/picture', async (request, reply) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const token = map.tokens.find((t) => t.id === request.params.tid);
    if (!token?.art || !view.tokens.some((t) => t.id === token.id)) throw new NotFoundError('No token picture');
    const file = archive.tokenImagePath(a.campaign.slug, map.id, token.art.file);
    return reply.type('image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(await tokenArt.square(file));
  });

  /** Remove a token (DM), or dismiss a companion or summon of your own (a player). */
  app.delete('/campaigns/:cid/maps/:mid/tokens/:tid', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const token = (a.role === 'dm' ? map.tokens : view.tokens).find((t) => t.id === request.params.tid);
    if (!token) throw new NotFoundError('No such token');
    if (a.role !== 'dm' && !(token.kind === 'companion' && token.user_id === a.userId)) throw new AuthError('Only the DM can remove that', 403);
    const saved = maps.change(a.cid, map.id, (m) => {
      // In a fight, removing whoever's turn it is passes the turn on.
      if (m.combat?.turn === request.params.tid) Object.assign(m.combat, stepTurn(m.combat, 1));
      m.tokens = m.tokens.filter((t) => t.id !== request.params.tid);
    }, { by: request.user.id, reason: a.role === 'dm' ? 'token removed' : 'companion dismissed' });
    return { map: maps.view(saved, a) };
  });

  Object.assign(r, { tokenArt });
}
