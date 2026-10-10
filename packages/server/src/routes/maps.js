/**
 * Maps: the DM imports them and sets them up (grid, scale, fog, walls, lights, terrain, variants, links,
 * tokens and their pictures); players see shown maps, move their own token and keep private pins.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { CONDITIONS, FOG_MAP, FOG_OPS, MAX_FOG_SHAPES, MAX_LIGHTS, MAX_LINKS, MAX_PINS, MAX_TERRAIN, MAX_TOKENS, MAX_VARIANTS, MAX_WALLS, PERSON_KIND, arcThrough, circlePoints, SCALE_PER, TOKEN_KINDS, TOKEN_SIZES, UNITS, WALL_KINDS, canSee, distanceToWall, doorReach, nearLink, pathCost, snapToken, stepTurn, wallBetween } from '@dndapp/shared/map.js';
import sharp from 'sharp';
import { z } from 'zod';
import { AuthError } from '../auth.js';
import { BadRequestError, NotFoundError } from '../store.js';
import { MAX_PICTURE_BYTES, createImageCache, inspectMapImage, inspectPicture } from '../images.js';
import { RateLimitError } from '../qa/agent.js';
import { createPlayerImages } from '../maps/image.js';
import { isMapId, newTokenId } from '../maps/store.js';
import { isPdf, renderPdfPage } from '../maps/pdf.js';
import { isUvtt, readUvtt, uvttImage, uvttContents } from '../maps/uvtt.js';

export function registerMaps(app, r) {
  const { access, archive, auth, config, kb, mapReader, maps, openLiveStream, publicMessage, statBlocks, upload } = r;

  // ---------- maps (the DM imports them; players see shown maps and move their own token) ----------

  // AI reads of imported maps per person per hour.
  const mapAiCalls = new Map();
  const mapAiAllowed = (userId) => {
    const hourAgo = Date.now() - 3600_000;
    const recent = (mapAiCalls.get(userId) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= config.maps.aiPerHour) throw new RateLimitError("That's a lot of map reading in the last hour. Please wait a bit, or set the grid by hand.");
    recent.push(Date.now());
    mapAiCalls.set(userId, recent);
  };

  /** A map this viewer may see (players: only shown ones; 404 either way, so hidden maps don't show they exist). */
  function viewableMap(request) {
    const a = access(request);
    if (!isMapId(request.params.mid)) throw new NotFoundError('No such map');
    const map = maps.get(a.cid, request.params.mid);
    const view = maps.view(map, a);
    if (!view) throw new NotFoundError('No such map');
    return { ...a, map, view };
  }

  /**
   * Read a map with the AI in the background. Fields the DM changed while it
   * was reading are left alone, and the AI's name only replaces the file
   * name (never a name the DM typed).
   */
  function readMapInBackground(cid, map, userId, { keepGrid = false } = {}) {
    const before = { grid: JSON.stringify(map.grid), scale: JSON.stringify(map.scale) };
    maps.change(cid, map.id, (m) => {
      m.reading = { status: 'pending', error: '', notes: '' };
    }, { by: userId, reason: 'reading' });
    const buf = fs.readFileSync(maps.imagePath(cid, map.id, { base: true }).path);
    return mapReader
      .read({ buf, width: map.image.width, height: map.image.height, campaignId: cid, userId })
      .then((r) =>
        maps.change(cid, map.id, (m) => {
          if (r.name && !m.named) m.name = r.name;
          if (!keepGrid && JSON.stringify(m.grid) === before.grid) m.grid = r.grid;
          if (!keepGrid && JSON.stringify(m.scale) === before.scale) m.scale = r.scale;
          m.kind = r.kind;
          m.description = r.description;
          m.reading = { status: 'done', error: '', notes: r.notes };
        }, { reason: 'read by the AI' }),
      )
      .catch((err) => {
        app.log.warn(err);
        try {
          maps.change(cid, map.id, (m) => {
            m.reading = { status: 'failed', error: `The AI couldn't read this map: ${publicMessage(err)}`, notes: '' };
          }, { reason: 'read failed' });
        } catch {
          // removed while it was being read
        }
      });
  }

  /**
   * Put the walls, doors and lights from a Universal VTT file (.dd2vtt, .uvtt)
   * on a map document, replacing any from an earlier file (`source: 'file'`).
   * With `grid`, the file's grid (exact) and 5 ft squares too. Returns notes for the DM.
   */
  function applyUvtt(m, doc, { grid = false } = {}) {
    const perSquare = m.scale?.per === 'square' ? m.scale.distance : 5;
    const c = uvttContents(doc, { width: m.image.width, height: m.image.height, feetPerSquare: grid ? 5 : perSquare });
    const own = m.walls.filter((w) => w.source !== 'file');
    m.walls = [...own, ...c.walls.slice(0, MAX_WALLS - own.length).map((w) => ({ ...w, id: newTokenId(), source: 'file' }))];
    const ownLights = m.lights.filter((l) => l.source !== 'file');
    m.lights = [...ownLights, ...c.lights.slice(0, MAX_LIGHTS - ownLights.length).map((l) => ({ ...l, id: newTokenId(), source: 'file' }))];
    if (grid) {
      m.grid = c.grid;
      m.scale = { distance: 5, unit: 'ft', per: 'square' };
    }
    return c.notes;
  }

  /** Draft walls with the AI in the background. The new draft replaces the AI's old one; the DM's own walls stay. */
  function draftWallsInBackground(cid, map, userId) {
    maps.change(cid, map.id, (m) => {
      m.wall_draft = { status: 'pending', error: '', notes: '' };
    }, { by: userId, reason: 'drafting walls' });
    const buf = fs.readFileSync(maps.imagePath(cid, map.id, { base: true }).path);
    return mapReader
      .walls({ buf, width: map.image.width, height: map.image.height, grid: map.grid, campaignId: cid, userId })
      .then((r) =>
        maps.change(cid, map.id, (m) => {
          const own = m.walls.filter((w) => w.source !== 'ai');
          const groups = new Map();
          const group = (g) => g && (groups.get(g) ?? groups.set(g, newTokenId()).get(g));
          m.walls = [...own, ...r.walls.slice(0, MAX_WALLS - own.length).map((w) => ({ ...w, id: newTokenId(), open: false, source: 'ai', group: group(w.group) }))];
          // Lights the AI saw on the picture (torches, braziers, fires) replace its earlier ones too.
          const ownLights = m.lights.filter((l) => l.source !== 'ai');
          m.lights = [...ownLights, ...(r.lights ?? []).slice(0, MAX_LIGHTS - ownLights.length).map((l) => ({ ...l, id: newTokenId(), source: 'ai' }))];
          // And difficult terrain (water, rubble, undergrowth).
          const ownTerrain = m.terrain.filter((t) => t.source !== 'ai');
          m.terrain = [...ownTerrain, ...(r.terrain ?? []).slice(0, MAX_TERRAIN - ownTerrain.length).map((t) => ({ ...t, id: newTokenId(), source: 'ai' }))];
          m.wall_draft = { status: 'done', error: '', notes: r.notes };
        }, { reason: 'walls drafted by the AI' }),
      )
      .catch((err) => {
        app.log.warn(err);
        try {
          maps.change(cid, map.id, (m) => {
            m.wall_draft = { status: 'failed', error: `The AI couldn't draft walls: ${publicMessage(err)}`, notes: '' };
          }, { reason: 'wall draft failed' });
        } catch {
          // removed meanwhile
        }
      });
  }

  /** Maps this viewer can see. can_edit: whether they're the DM here. */
  app.get('/campaigns/:cid/maps', async (request) => {
    const a = access(request);
    return { can_edit: a.role === 'dm', maps: maps.list(a.cid).map((m) => maps.view(m, a)).filter(Boolean) };
  });

  /**
   * Import a map (DM): { filename, data (base64), name? }. The image is
   * archived as uploaded and the AI reads it in the background; the map
   * starts hidden from players.
   */
  app.post('/campaigns/:cid/maps', upload, async (request, reply) => {
    const a = access(request, { dm: true });
    const { filename, data, name, page } = z
      .object({ filename: z.string().max(200).default('map'), data: z.string().min(1), name: z.string().trim().max(100).optional(), page: z.number().int().positive().optional() })
      .parse(request.body);
    let buf = Buffer.from(data, 'base64');
    if (!buf.length) throw new BadRequestError('The file is empty.');
    // A Universal VTT file (.dd2vtt, .uvtt): its picture is the map; its grid, walls, doors and lights come with it.
    let uvtt = null;
    if (isUvtt(buf)) {
      uvtt = readUvtt(buf);
      buf = uvttImage(uvtt);
      if (!buf) throw new BadRequestError("That file has no picture of the map in it. Import the map's picture, then add the file's walls in Fog & walls.");
    }
    // A PDF: draw the page asked for (default the first) and use that as the image.
    let pdf = null;
    let pages = 1;
    if (isPdf(buf)) {
      const rendered = await renderPdfPage(buf, page ?? 1);
      pdf = { buf, page: page ?? 1 };
      pages = rendered.pages;
      buf = rendered.png;
    }
    const image = await inspectMapImage(buf);
    mapAiAllowed(request.user.id);
    let fromFile = filename.replace(/\.[^.]*$/, '').replace(/[_-]+/g, ' ').trim();
    if (pdf && pages > 1) fromFile = `${fromFile || 'Map'}, page ${pdf.page}`;
    let map = maps.create(a.cid, { name: name || fromFile || 'Map', named: !!name, buf, ...image, pdf, by: request.user.id });
    if (uvtt) map = maps.change(a.cid, map.id, (m) => applyUvtt(m, uvtt, { grid: true }), { by: request.user.id, reason: 'walls from the file' });
    readMapInBackground(a.cid, map, request.user.id, { keepGrid: !!uvtt });
    reply.status(201);
    return maps.view(maps.get(a.cid, map.id), a);
  });

  /**
   * The campaign's records, for putting someone from them on a map (DM):
   * { records: [{ id, kind, title, status, person }] }, people first. The
   * archivist names its kinds freely, so `person` is only a guess from the kind.
   */
  app.get('/campaigns/:cid/maps/records', async (request) => {
    const a = access(request, { dm: true });
    const records = kb.list(a.cid).map((r) => ({ id: r.id, kind: r.kind, title: r.title, status: r.status, person: PERSON_KIND.test(r.kind) }));
    records.sort((x, y) => Number(y.person) - Number(x.person) || x.kind.localeCompare(y.kind) || x.title.localeCompare(y.title));
    return { records };
  });

  /**
   * One record (DM), for a token linked to it. Record ids can change when the
   * knowledge base is rebuilt, so ?title= finds it by title if the id is gone.
   */
  app.get('/campaigns/:cid/maps/records/:rid', async (request) => {
    const a = access(request, { dm: true });
    const { title } = z.object({ title: z.string().max(200).optional() }).parse(request.query ?? {});
    let [r] = /^\d+$/.test(request.params.rid) ? kb.getMany(a.cid, [Number(request.params.rid)]) : [];
    if ((!r || (title && r.title !== title)) && title) r = kb.list(a.cid).find((x) => x.title === title) ?? r;
    if (!r) throw new NotFoundError('That record is gone. The archivist may have merged or renamed it.');
    return { id: r.id, kind: r.kind, title: r.title, status: r.status, body: r.body, data: r.data, tags: r.tags };
  });

  /** Live changes to the maps this viewer can see (SSE): map {map} | gone {id}. */
  app.get('/campaigns/:cid/maps/events', async (request, reply) => {
    const { cid } = access(request);
    const { sse, current } = openLiveStream(request, reply, { cid, userId: request.user.id });
    const listener = (map) => {
      if (map.campaign_id !== cid) return;
      const a = current();
      if (!a) return sse.end();
      const view = maps.view(map, a);
      if (view) sse.send('map', view);
      else sse.send('gone', { id: map.id });
    };
    // Pings and quick drawings: to everyone who can see the map; a player gets other players' only where they can see them.
    const signal = (sig) => {
      if (sig.campaign_id !== cid) return;
      const a = current();
      if (!a) return sse.end();
      let map;
      try {
        map = maps.get(cid, sig.map_id);
      } catch {
        return;
      }
      const view = maps.view(map, a);
      if (!view) return;
      if (a.role !== 'dm' && !sig.from_dm && sig.by !== request.user.id) {
        const { polygons } = maps.sightFor(map, request.user.id);
        if (!sig.points.some(([x, y]) => canSee(map, polygons, x, y))) return;
      }
      const { campaign_id: _c, from_dm: _d, ...out } = sig;
      sse.send(sig.kind, out);
    };
    maps.events.on('update', listener);
    maps.events.on('signal', signal);
    sse.onClose(() => {
      maps.events.off('update', listener);
      maps.events.off('signal', signal);
    });
  });

  // Pings and drawings per person: at most SIGNALS_PER_WINDOW in SIGNAL_WINDOW ms.
  const SIGNAL_WINDOW = 10_000;
  const SIGNALS_PER_WINDOW = 20;
  const signalTimes = new Map();
  const signalAllowed = (userId) => {
    const since = Date.now() - SIGNAL_WINDOW;
    const recent = (signalTimes.get(userId) ?? []).filter((t) => t > since);
    if (recent.length >= SIGNALS_PER_WINDOW) throw new RateLimitError('Slow down a little with the pings.');
    recent.push(Date.now());
    signalTimes.set(userId, recent);
  };

  /** Send a ping or a drawing to everyone looking at the map (not saved). Its colour: the sender's token, or gold for the DM. */
  function sendSignal(request, kind, points) {
    const a = access(request);
    const { map } = viewableMap(request);
    signalAllowed(request.user.id);
    const own = map.tokens.find((t) => t.kind === 'pc' && t.user_id === request.user.id);
    maps.events.emit('signal', {
      kind,
      campaign_id: a.cid,
      map_id: map.id,
      by: request.user.id,
      name: own?.name ?? request.user.name,
      color: a.role === 'dm' ? '#ffd54a' : own?.color ?? '#4fc3f7',
      from_dm: a.role === 'dm',
      points: points.map(([x, y]) => [Math.round(Math.min(map.image.width, Math.max(0, x)) * 10) / 10, Math.round(Math.min(map.image.height, Math.max(0, y)) * 10) / 10]),
    });
    return { ok: true };
  }

  /** Ping a spot on the map: { x, y }. Everyone looking sees it for a moment (players: the DM's, and other players' where they can see). */
  app.post('/campaigns/:cid/maps/:mid/ping', async (request) => {
    const { x, y } = z.object({ x: z.number(), y: z.number() }).parse(request.body ?? {});
    return sendSignal(request, 'ping', [[x, y]]);
  });

  /** A quick drawing: { points: [[x, y], ...] } (up to 500). It fades after a while on everyone's screen; nothing is saved. */
  app.post('/campaigns/:cid/maps/:mid/draw', async (request) => {
    const { points } = z.object({ points: z.array(z.tuple([z.number(), z.number()])).min(2).max(500) }).parse(request.body ?? {});
    return sendSignal(request, 'draw', points);
  });

  app.get('/campaigns/:cid/maps/:mid', async (request) => viewableMap(request).view);

  const playerImages = createPlayerImages();

  /** The map's image: as imported for the DM; for players, with what they can't see blacked out (and what they saw before dimmed). */
  app.get('/campaigns/:cid/maps/:mid/image', async (request, reply) => {
    const { cid, map, role, view } = viewableMap(request);
    const { path: file, type } = maps.imagePath(cid, map.id);
    reply.type(type).header('X-Content-Type-Options', 'nosniff');
    if (role === 'dm') {
      // The file never changes, so the browser can keep it.
      return reply.header('Cache-Control', 'private, max-age=31536000, immutable').send(fs.createReadStream(file));
    }
    return reply.header('Cache-Control', 'private, no-cache').send(await playerImages.get(map, file, { mask: view.fog.mask, key: view.image_key }, type));
  });

  const GRID = z.object({ size: z.number().positive(), x: z.number(), y: z.number() }).nullable();
  const SCALE = z.object({ distance: z.number().positive(), unit: z.enum(UNITS), per: z.enum(SCALE_PER) }).nullable();

  /** Change a map (DM): { name?, shown?, grid?, scale?, variant? }. grid/scale null removes them; variant: which picture everyone sees (null: the original). */
  app.patch('/campaigns/:cid/maps/:mid', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({ name: z.string().trim().min(1).max(100).optional(), shown: z.boolean().optional(), grid: GRID.optional(), scale: SCALE.optional(), variant: z.string().nullable().optional() })
      .parse(request.body ?? {});
    if (body.variant != null && !map.variants.some((v) => v.id === body.variant)) throw new NotFoundError('No such variant');
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.name !== undefined) {
        m.name = body.name;
        m.named = true;
      }
      if (body.shown !== undefined) m.shown = body.shown;
      if (body.grid !== undefined) m.grid = body.grid;
      if (body.scale !== undefined) m.scale = body.scale;
      if (body.variant !== undefined) m.variant = body.variant;
    }, { by: request.user.id });
    return maps.view(saved, a);
  });

  /**
   * Another picture of the same map (DM): { filename, data (base64), name? }, e.g. the same room at night.
   * It's stretched to the map's size so everything on the map stays in place; the upload is archived as it came.
   */
  app.post('/campaigns/:cid/maps/:mid/variants', upload, async (request, reply) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const { filename, data, name } = z
      .object({ filename: z.string().max(200).default('variant'), data: z.string().min(1), name: z.string().trim().max(60).optional() })
      .parse(request.body);
    if (map.variants.length >= MAX_VARIANTS) throw new BadRequestError(`A map can have up to ${MAX_VARIANTS} other pictures.`);
    const buf = Buffer.from(data, 'base64');
    if (!buf.length) throw new BadRequestError('The file is empty.');
    if (isPdf(buf)) throw new BadRequestError('Upload the other picture as a PNG, JPEG or WebP image.');
    const image = await inspectMapImage(buf);
    let fitted = sharp(buf).rotate().resize(map.image.width, map.image.height, { fit: 'fill' });
    fitted = image.type === 'image/png' ? fitted.png() : image.type === 'image/webp' ? fitted.webp({ quality: 90 }) : fitted.jpeg({ quality: 90 });
    const fromFile = filename.replace(/\.[^.]*$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 60);
    const saved = maps.addVariant(a.cid, map.id, { name: name || fromFile || 'Variant', original: buf, ext: image.ext, fitted: await fitted.toBuffer(), type: image.type, by: request.user.id });
    reply.status(201);
    return { map: maps.view(saved, a), variant: saved.variants.at(-1) };
  });

  /** Remove one of a map's other pictures (DM). Its files stay in the archive. If it was showing, the original comes back. */
  app.delete('/campaigns/:cid/maps/:mid/variants/:vid', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (!map.variants.some((v) => v.id === request.params.vid)) throw new NotFoundError('No such variant');
    const saved = maps.change(a.cid, map.id, (m) => {
      m.variants = m.variants.filter((v) => v.id !== request.params.vid);
      if (m.variant === request.params.vid) m.variant = null;
    }, { by: request.user.id, reason: 'variant removed' });
    return maps.view(saved, a);
  });

  /** Links to other maps (DM): { add?: { x, y, to, label? }, move?: { id, x, y }, remove?: id }. `to` is the map it leads to. */
  app.patch('/campaigns/:cid/maps/:mid/links', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({
        add: z.object({ x: z.number(), y: z.number(), to: z.string(), label: z.string().trim().max(60).optional() }).optional(),
        move: z.object({ id: z.string(), x: z.number(), y: z.number() }).optional(),
        remove: z.string().optional(),
      })
      .parse(request.body ?? {});
    if (body.add) {
      if (body.add.to === map.id) throw new BadRequestError('A link has to lead to another map.');
      maps.get(a.cid, body.add.to);
      if (map.links.length >= MAX_LINKS) throw new BadRequestError(`A map can have up to ${MAX_LINKS} links.`);
    }
    if (body.move && !map.links.some((l) => l.id === body.move.id)) throw new NotFoundError('No such link');
    if (body.remove && !map.links.some((l) => l.id === body.remove)) throw new NotFoundError('No such link');
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.add) m.links.push({ id: newTokenId(), x: body.add.x, y: body.add.y, to: body.add.to, label: body.add.label ?? '' });
      if (body.move) Object.assign(m.links.find((l) => l.id === body.move.id), { x: body.move.x, y: body.move.y });
      if (body.remove) m.links = m.links.filter((l) => l.id !== body.remove);
    }, { by: request.user.id, reason: 'links' });
    return maps.view(saved, a);
  });

  /**
   * Take a token through a link to the other map: { token }. Players move their own character, standing
   * next to a link they can see, to a map the DM has shown; the DM can send any token. It arrives at the
   * link on the other map that leads back here, or the middle of that map.
   */
  app.post('/campaigns/:cid/maps/:mid/links/:lid/use', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const { token: tid } = z.object({ token: z.string() }).parse(request.body ?? {});
    const link = view.links.find((l) => l.id === request.params.lid);
    if (!link) throw new NotFoundError('No such link');
    const token = map.tokens.find((t) => t.id === tid);
    if (!token) throw new NotFoundError('No such token');
    const dm = a.role === 'dm';
    if (!dm && !(token.kind === 'pc' && token.user_id === request.user.id)) throw new AuthError('You can only move your own character.', 403);
    if (!dm && !nearLink(map, link, token.x, token.y)) throw new BadRequestError(`Move ${token.name} next to it first.`);
    const target = maps.get(a.cid, link.to);
    if (!dm && !target.shown) throw new NotFoundError('No such map');
    if (target.tokens.length >= MAX_TOKENS) throw new BadRequestError(`${target.name} is full.`);
    const back = target.links.find((l) => l.to === map.id);
    const { x, y } = snapToken(target, token, back?.x ?? target.image.width / 2, back?.y ?? target.image.height / 2);
    maps.change(a.cid, map.id, (m) => {
      if (m.combat?.turn === token.id) Object.assign(m.combat, stepTurn(m.combat, 1));
      m.tokens = m.tokens.filter((t) => t.id !== token.id);
    }, { by: request.user.id, reason: `left for ${target.id}` });
    const id = target.tokens.some((t) => t.id === token.id) ? newTokenId() : token.id;
    const arrived = maps.change(a.cid, target.id, (m) => {
      m.tokens.push({ ...token, id, x, y });
    }, { by: request.user.id, reason: `arrived from ${map.id}` });
    return { map: maps.view(arrived, a), token: id };
  });

  /**
   * Fog of war (DM): { enabled?, sight?, map?: dark | shown, memory?, dark?, add?: {op: reveal | cover, x, y, w, h}, undo?, reset?: cover | reveal, forget? }.
   * map: what players get outside their sight and the reveals (dark, or the map with no tokens). memory: keep a dim view of where they've been.
   * reset: cover hides the whole map again, reveal shows all of it; undo takes back the last rectangle.
   * sight: players also see what their own token can see past the walls. forget: players lose the dim view of places they saw before.
   * dark: darkness; with sight, players only see lit places and what their darkvision reaches.
   */
  app.patch('/campaigns/:cid/maps/:mid/fog', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({
        enabled: z.boolean().optional(),
        sight: z.boolean().optional(),
        map: z.enum(FOG_MAP).optional(),
        memory: z.boolean().optional(),
        dark: z.boolean().optional(),
        forget: z.boolean().optional(),
        add: z.object({ op: z.enum(FOG_OPS), x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }).optional(),
        undo: z.boolean().optional(),
        reset: z.enum(['cover', 'reveal']).optional(),
      })
      .parse(request.body ?? {});
    if (body.add && map.fog.shapes.length >= MAX_FOG_SHAPES) throw new BadRequestError('That map has too many fog changes. Use "Cover all" or "Reveal all" to start again.');
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.enabled !== undefined) m.fog.enabled = body.enabled;
      if (body.sight !== undefined) m.fog.sight = body.sight;
      if (body.map !== undefined) m.fog.map = body.map;
      if (body.memory !== undefined) m.fog.memory = body.memory;
      if (body.dark !== undefined) m.fog.dark = body.dark;
      if (body.reset === 'cover') m.fog.shapes = [];
      if (body.reset === 'reveal') m.fog.shapes = [{ op: 'reveal', x: 0, y: 0, w: m.image.width, h: m.image.height }];
      if (body.undo) m.fog.shapes.pop();
      if (body.add) m.fog.shapes.push(body.add);
    }, { by: request.user.id, reason: 'fog' });
    if (body.forget) maps.forgetExplored(a.cid, map.id);
    return maps.view(saved, a);
  });

  const POINT = z.number().min(0).max(100_000);
  const WALL = z.object({ x1: POINT, y1: POINT, x2: POINT, y2: POINT, door: z.boolean().default(false), kind: z.enum(WALL_KINDS).default('wall') });
  // A curved wall: from (x1, y1) through (mx, my) to (x2, y2). A round one: centre and radius.
  const CURVE = z.object({ x1: POINT, y1: POINT, mx: POINT, my: POINT, x2: POINT, y2: POINT, kind: z.enum(WALL_KINDS).default('wall') });
  const CIRCLE = z.object({ x: POINT, y: POINT, r: z.number().positive().max(100_000), kind: z.enum(WALL_KINDS).default('wall') });

  /**
   * Walls and doors (DM): { add?: {x1, y1, x2, y2, door?, kind?: wall | low}, curve?: {x1, y1, mx, my, x2, y2, kind?}
   * (a curved wall through the middle point), circle?: {x, y, r, kind?} (a round wall), remove?: id (with the rest of
   * its curve), toggle?: id (open or close a door), lock?: id (lock or unlock a door), clear?: ai | all }. Curves are
   * stored as short straight pieces sharing a `group`. Walls block line of sight and players' tokens, obstacles ('low')
   * only tokens. Players never get walls, only the doors they can see.
   */
  app.patch('/campaigns/:cid/maps/:mid/walls', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({ add: WALL.optional(), curve: CURVE.optional(), circle: CIRCLE.optional(), remove: z.string().max(20).optional(), toggle: z.string().max(20).optional(), lock: z.string().max(20).optional(), clear: z.enum(['ai', 'all']).optional() })
      .parse(request.body ?? {});
    // A curve or circle, as its pieces.
    let pieces = null;
    if (body.curve) {
      const c = body.curve;
      pieces = arcThrough({ x: c.x1, y: c.y1 }, { x: c.mx, y: c.my }, { x: c.x2, y: c.y2 });
    } else if (body.circle) {
      pieces = circlePoints(body.circle, body.circle.r).map((p) => ({ x: Math.max(0, p.x), y: Math.max(0, p.y) }));
    }
    const adding = body.add ? 1 : pieces ? pieces.length - 1 : 0;
    if (adding && map.walls.length + adding > MAX_WALLS) throw new BadRequestError(`A map can have at most ${MAX_WALLS} walls.`);
    for (const id of [body.remove, body.toggle, body.lock]) {
      if (id !== undefined && !map.walls.some((w) => w.id === id)) throw new NotFoundError('No such wall');
    }
    for (const id of [body.toggle, body.lock]) {
      if (id && !map.walls.find((w) => w.id === id).door) throw new BadRequestError("That's a wall, not a door.");
    }
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.clear === 'all') m.walls = [];
      if (body.clear === 'ai') m.walls = m.walls.filter((w) => w.source !== 'ai');
      if (body.remove) {
        const group = m.walls.find((w) => w.id === body.remove).group;
        m.walls = m.walls.filter((w) => w.id !== body.remove && !(group && w.group === group));
      }
      if (body.toggle) {
        const door = m.walls.find((w) => w.id === body.toggle);
        door.open = !door.open;
        if (door.open) door.locked = false;
      }
      if (body.lock) {
        const door = m.walls.find((w) => w.id === body.lock);
        door.locked = !door.locked;
        if (door.locked) door.open = false;
      }
      if (body.add) m.walls.push({ ...body.add, id: newTokenId(), open: false, source: 'dm' });
      if (pieces) {
        const group = newTokenId();
        const kind = (body.curve ?? body.circle).kind;
        for (let i = 1; i < pieces.length; i++) {
          m.walls.push({ x1: pieces[i - 1].x, y1: pieces[i - 1].y, x2: pieces[i].x, y2: pieces[i].y, door: false, kind, id: newTokenId(), open: false, source: 'dm', group });
        }
      }
    }, { by: request.user.id, reason: body.toggle ? 'door' : 'walls' });
    return maps.view(saved, a);
  });

  /**
   * Open or close a door. The DM can any; a player only a door they can see,
   * that isn't locked, within reach (a square and a half) of one of their tokens.
   */
  app.post('/campaigns/:cid/maps/:mid/doors/:wid/toggle', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const door = (a.role === 'dm' ? map.walls : view.doors).find((w) => w.id === request.params.wid && (a.role !== 'dm' || w.door));
    if (!door) throw new NotFoundError('No such door');
    if (a.role !== 'dm') {
      if (door.locked) throw new BadRequestError("It's locked.");
      const near = map.tokens.some((t) => t.kind === 'pc' && t.user_id === request.user.id && distanceToWall(t, door) <= doorReach(map));
      if (!near) throw new BadRequestError('Your character is too far away to reach that door.');
    }
    const saved = maps.change(a.cid, map.id, (m) => {
      const d = m.walls.find((w) => w.id === door.id);
      if (d && !(a.role !== 'dm' && d.locked)) {
        d.open = !d.open;
        if (d.open) d.locked = false; // an open door isn't locked
      }
    }, { by: request.user.id, reason: 'door' });
    return maps.view(saved, a);
  });

  const RADII = { bright: z.number().min(0).max(10_000), dim: z.number().min(0).max(10_000) };

  /**
   * Light sources (DM): { add?: {x, y, bright, dim}, move?: {id, x, y}, remove?: id, clear?: ai | all }.
   * Radii are in the map's unit (a torch: 20 bright, 20 dim). Lights matter in darkness (fog.dark).
   */
  app.patch('/campaigns/:cid/maps/:mid/lights', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({
        add: z.object({ x: POINT, y: POINT, ...RADII }).optional(),
        move: z.object({ id: z.string().max(20), x: POINT, y: POINT }).optional(),
        remove: z.string().max(20).optional(),
        clear: z.enum(['ai', 'all']).optional(),
      })
      .parse(request.body ?? {});
    if (body.add && map.lights.length >= MAX_LIGHTS) throw new BadRequestError(`A map can have at most ${MAX_LIGHTS} lights.`);
    if (body.add && body.add.bright + body.add.dim <= 0) throw new BadRequestError('A light needs some reach.');
    for (const id of [body.remove, body.move?.id]) {
      if (id !== undefined && !map.lights.some((l) => l.id === id)) throw new NotFoundError('No such light');
    }
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.clear === 'all') m.lights = [];
      if (body.clear === 'ai') m.lights = m.lights.filter((l) => l.source !== 'ai');
      if (body.remove) m.lights = m.lights.filter((l) => l.id !== body.remove);
      if (body.move) Object.assign(m.lights.find((l) => l.id === body.move.id), { x: body.move.x, y: body.move.y });
      if (body.add) m.lights.push({ ...body.add, id: newTokenId(), source: 'dm' });
    }, { by: request.user.id, reason: 'lights' });
    return maps.view(saved, a);
  });

  /** Difficult terrain (DM): { add?: {points: [[x, y], ...]}, remove?: id, clear?: ai | all }. Moving through it costs double. */
  app.patch('/campaigns/:cid/maps/:mid/terrain', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({
        add: z.object({ points: z.array(z.tuple([POINT, POINT])).min(3).max(200) }).optional(),
        remove: z.string().max(20).optional(),
        clear: z.enum(['ai', 'all']).optional(),
      })
      .parse(request.body ?? {});
    if (body.add && map.terrain.length >= MAX_TERRAIN) throw new BadRequestError(`A map can have at most ${MAX_TERRAIN} areas of difficult terrain.`);
    if (body.remove && !map.terrain.some((t) => t.id === body.remove)) throw new NotFoundError('No such area');
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.clear === 'all') m.terrain = [];
      if (body.clear === 'ai') m.terrain = m.terrain.filter((t) => t.source !== 'ai');
      if (body.remove) m.terrain = m.terrain.filter((t) => t.id !== body.remove);
      if (body.add) m.terrain.push({ id: newTokenId(), points: body.add.points, source: 'dm' });
    }, { by: request.user.id, reason: 'terrain' });
    return maps.view(saved, a);
  });

  /** Draft the walls and doors with the AI (DM), in the background. Replaces the AI's earlier draft; walls the DM drew stay. */
  app.post('/campaigns/:cid/maps/:mid/walls/draft', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (map.wall_draft.status === 'pending') throw new BadRequestError('The AI is already drafting walls for this map.');
    mapAiAllowed(request.user.id);
    draftWallsInBackground(a.cid, map, request.user.id);
    return maps.view(maps.get(a.cid, map.id), a);
  });

  /**
   * Walls, doors and lights from a map maker's Universal VTT file (.dd2vtt,
   * .uvtt) of this map (DM): { data: base64 }. Exact, no AI. Replaces those from
   * an earlier file; the DM's own and the AI's stay. The file is stretched to
   * fit the map's picture, so an export at another size still lines up.
   */
  app.post('/campaigns/:cid/maps/:mid/walls/file', upload, async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const { data } = z.object({ data: z.string().min(1) }).parse(request.body);
    const buf = Buffer.from(data, 'base64');
    if (!isUvtt(buf)) throw new BadRequestError("That isn't a Universal VTT file. Export the map as .dd2vtt or .uvtt (Dungeondraft, Dungeon Alchemist and many map makers can).");
    const doc = readUvtt(buf);
    let notes = '';
    const saved = maps.change(a.cid, map.id, (m) => {
      notes = applyUvtt(m, doc);
    }, { by: request.user.id, reason: 'walls from a file' });
    return { ...maps.view(saved, a), file_notes: notes };
  });

  /** Read the map with the AI again (DM). Its grid, scale and description are replaced. */
  app.post('/campaigns/:cid/maps/:mid/read', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (map.reading.status === 'pending') throw new BadRequestError('This map is already being read.');
    mapAiAllowed(request.user.id);
    readMapInBackground(a.cid, map, request.user.id);
    return maps.view(maps.get(a.cid, map.id), a);
  });

  /** Remove a map (DM). It's only marked removed; the archive keeps everything. */
  app.delete('/campaigns/:cid/maps/:mid', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    maps.change(a.cid, map.id, (m) => {
      m.removed = true;
    }, { by: request.user.id, reason: 'removed' });
    return { ok: true };
  });

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
    stats: z.object({ text: z.string().max(8000), ac: z.number().int().nullable().optional(), hp_formula: z.string().max(40).optional(), speed: z.string().max(120).optional(), challenge: z.string().max(40).optional() }).nullable(),
    light: z.object(RADII).nullable(),
    darkvision: z.number().min(0).max(10_000),
    speed: z.number().min(0).max(10_000).nullable(),
    merchant: z.string().regex(/^[a-f0-9]{10}$/).nullable(),
  });
  // What a player may change on their own token; everything else is the DM's.
  const OWNER_FIELDS = new Set(['x', 'y', 'hp', 'conditions', 'light', 'darkvision']);

  /** A token linked to a record gets that record's current title (the DM only sends the id). */
  const linkRecord = (cid, body) => {
    if (!body.record) return;
    const [r] = kb.getMany(cid, [body.record.id]);
    if (!r) throw new BadRequestError('No such record.');
    body.record = { id: r.id, title: r.title };
  };

  /** A player character token belongs to someone in this campaign. */
  const checkTokenOwner = (cid, token) => {
    if (token.kind === 'pc' && token.user_id != null && !auth.membership(cid, token.user_id)) {
      throw new BadRequestError("That player isn't in this campaign.");
    }
  };

  /** Add a token (DM): { kind, name, user_id?, color?, size?, x?, y?, hp?, conditions?, hidden? }. On a grid it snaps to squares. */
  app.post('/campaigns/:cid/maps/:mid/tokens', async (request, reply) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = TOKEN.partial().required({ kind: true }).parse(request.body ?? {});
    if (map.tokens.length >= MAX_TOKENS) throw new BadRequestError(`A map can have at most ${MAX_TOKENS} tokens.`);
    checkTokenOwner(a.cid, body);
    linkRecord(a.cid, body);
    const id = newTokenId();
    const saved = maps.change(a.cid, map.id, (m) => {
      const token = { size: 1, ...body, id, x: body.x ?? m.image.width / 2, y: body.y ?? m.image.height / 2 };
      Object.assign(token, snapToken(m, { size: TOKEN_SIZES.includes(token.size) ? token.size : 1 }, token.x, token.y));
      m.tokens.push(token);
    }, { by: request.user.id, reason: 'token added' });
    reply.status(201);
    return { map: maps.view(saved, a), token: saved.tokens.find((t) => t.id === id) };
  });

  /**
   * Change a token. The player it belongs to may move it ({ x, y }) and set
   * its hit points and conditions; anything else (name, kind, owner, colour,
   * size, hidden) is the DM's.
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
    const moving = Object.keys(body).every((k) => k === 'x' || k === 'y');
    if (a.role !== 'dm') {
      if (token.user_id !== request.user.id) throw new AuthError('You can only change your own token', 403);
      if (!Object.keys(body).every((k) => OWNER_FIELDS.has(k))) throw new AuthError('Only the DM can change that', 403);
    }
    checkTokenOwner(a.cid, { ...token, ...body });
    linkRecord(a.cid, body);
    // Players can't walk through walls or closed doors (the DM can put any token anywhere).
    const moves = body.x !== undefined || body.y !== undefined;
    const route = moves ? [{ x: token.x, y: token.y }, ...path.map(([x, y]) => ({ x, y })), snapToken(map, token, body.x ?? token.x, body.y ?? token.y)] : [];
    if (a.role !== 'dm' && moves) {
      for (let i = 1; i < route.length; i++) if (wallBetween(map, route[i - 1], route[i])) throw new BadRequestError("There's a wall in the way.");
    }
    // A player character with a saved sheet has the sheet's hit points: a change goes on the sheet (current only).
    if (body.hp !== undefined && token.hp_sheet && (body.user_id === undefined || body.user_id === token.user_id)) {
      const { hp } = body;
      delete body.hp;
      if (hp?.current != null) maps.setSheetHp(a.cid, token.user_id, hp.current, { by: request.user.id });
    }
    const changed = Object.keys(body).length
      ? maps.change(a.cid, map.id, (m) => {
        const t = m.tokens.find((x) => x.id === token.id);
        if (!t) return;
        Object.assign(t, body);
        if (t.kind !== 'pc') t.user_id = null;
        Object.assign(t, snapToken(m, t, t.x, t.y));
        // In a fight, count how far it has moved this turn (difficult terrain costs double).
        const entry = moves && m.combat?.entries.find((e) => e.id === t.id);
        if (entry) entry.moved = (entry.moved ?? 0) + (pathCost(map, route)?.value ?? 0);
      }, { by: request.user.id, reason: moving ? 'token moved' : 'token changed' })
      : null;
    const out = maps.view(changed ?? maps.get(a.cid, map.id), a);
    return { map: out, token: out?.tokens.find((t) => t.id === token.id) ?? null };
  });

  /**
   * Fill a token's stat block with the AI (DM): { name? } (default: the
   * token's name). Sets its hit points and size too, unless the DM already
   * did. 404 if the AI doesn't know the creature.
   */
  app.post('/campaigns/:cid/maps/:mid/tokens/:tid/stats', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const token = map.tokens.find((t) => t.id === request.params.tid);
    if (!token) throw new NotFoundError('No such token');
    const { name } = z.object({ name: z.string().trim().min(1).max(100).optional() }).parse(request.body ?? {});
    mapAiAllowed(request.user.id);
    const found = await statBlocks.lookup(name ?? token.name, { campaignId: a.cid, userId: request.user.id });
    if (!found) throw new NotFoundError(`The AI doesn't know a creature called "${name ?? token.name}". Try its proper name, like "Goblin" or "Adult Red Dragon".`);
    const saved = maps.change(a.cid, map.id, (m) => {
      const t = m.tokens.find((x) => x.id === token.id);
      if (!t) return;
      t.stats = found.stats;
      if (!t.hp && found.hp) t.hp = { current: found.hp, max: found.hp };
      if (found.size && t.size === 1) Object.assign(t, { size: found.size }, snapToken(m, { size: found.size }, t.x, t.y));
    }, { by: request.user.id, reason: 'stat block' });
    return { map: maps.view(saved, a), token: saved.tokens.find((t) => t.id === token.id) };
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

  app.delete('/campaigns/:cid/maps/:mid/tokens/:tid', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (!map.tokens.some((t) => t.id === request.params.tid)) throw new NotFoundError('No such token');
    const saved = maps.change(a.cid, map.id, (m) => {
      // In a fight, removing whoever's turn it is passes the turn on.
      if (m.combat?.turn === request.params.tid) Object.assign(m.combat, stepTurn(m.combat, 1));
      m.tokens = m.tokens.filter((t) => t.id !== request.params.tid);
    }, { by: request.user.id, reason: 'token removed' });
    return { map: maps.view(saved, a) };
  });

  Object.assign(r, { linkRecord, mapAiAllowed, tokenArt, viewableMap });
}
