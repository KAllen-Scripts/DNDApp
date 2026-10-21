/**
 * Maps: the DM imports them and sets them up (grid, scale, fog, walls, lights, terrain, variants, links,
 * tokens and their pictures); players see shown maps, move their own token and keep private pins.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { MAX_CLOCK } from '@dndapp/shared/settings.js';
import { MAP_KINDS, PACES, journeyAt, milesBetween, travelMinutes, CLIMB_KINDS, CONDITIONS, EFFORTS, FOG_MAP, FOG_OPS, MAX_COMPANIONS, MAX_FOG_SHAPES, MAX_CLIMBS, MAX_LIGHTS, MAX_LINKS, MAX_PINS, MAX_PLACES, MAX_PLACE_POINTS, placeProblem, shownTo, arrivalSpots, characterMap, followGroup, followLoop, nearPlace, parentOf, trailFollowers, MAX_RAISED, MAX_TERRAIN, MAX_HEIGHT_FT, MAX_TOKENS, MAX_VARIANTS, MAX_WALLS, PERSON_KIND, PLAYER_KINDS, arcThrough, circlePoints, SCALE_PER, TOKEN_KINDS, TOKEN_SIZES, UNITS, WALL_KINDS, canSee, distanceToWall, doorReach, nearLink, ownToken, pathCost, snapToken, stepTurn, tokenPx, walkLevels, wallBetween } from '@dndapp/shared/map.js';
import sharp from 'sharp';
import { z } from 'zod';
import { AuthError } from '../auth.js';
import { BadRequestError, NotFoundError } from '../store.js';
import { MAX_PICTURE_BYTES, createImageCache, inspectMapImage, inspectPicture } from '../images.js';
import { RateLimitError } from '../qa/agent.js';
import { isMapId, newTokenId } from '../maps/store.js';
import { isPdf, renderPdfPage } from '../maps/pdf.js';
import { isUvtt, readUvtt, toUvtt, uvttImage, uvttContents } from '../maps/uvtt.js';

export function registerMaps(app, r) {
  const { access, archive, auth, config, kb, mapReader, maps, openLiveStream, publicMessage, statBlocks, store, upload } = r;

  // ---------- maps (the DM imports them; players see shown maps and move their own token) ----------

  /**
   * Take a token to a spot on another map (`at`, or null for the middle), with everyone following it
   * (the world: characters travel together or apart, owner 2026-10-18). They arrive round the spot,
   * still following. A player character is on one map at a time: their token anywhere else goes.
   * `apply`: changes to the leader on the way (the DM's Add token). Returns the map they arrived on
   * and the leader's id there.
   */
  function moveGroup(cid, from, leaderId, target, at, { by, apply = {} }) {
    const group = followGroup(from.tokens, leaderId);
    const moving = new Set(group.map((t) => t.id));
    if (target.tokens.filter((t) => !moving.has(t.id)).length + group.length > MAX_TOKENS) throw new BadRequestError(`${target.name} is full.`);
    const spots = arrivalSpots(target, group, at ?? { x: target.image.width / 2, y: target.image.height / 2 });
    maps.change(cid, from.id, (m) => {
      if (m.combat?.turn && moving.has(m.combat.turn)) Object.assign(m.combat, stepTurn(m.combat, 1));
      m.tokens = m.tokens.filter((t) => !moving.has(t.id));
    }, { by, reason: `left for ${target.id}` });
    // Ids stay the same unless one is taken there; whoever follows follows the new one.
    const ids = new Map(group.map((t) => [t.id, target.tokens.some((x) => x.id === t.id) ? newTokenId() : t.id]));
    const characters = new Set(group.filter((t) => t.kind === 'pc' && t.user_id != null).map((t) => t.user_id));
    const arrived = maps.change(cid, target.id, (m) => {
      // One map per character: an old token of theirs here goes.
      m.tokens = m.tokens.filter((t) => !(t.kind === 'pc' && characters.has(t.user_id)));
      group.forEach((t, i) => {
        const token = { ...t, ...(i === 0 ? apply : {}), journey: null, id: ids.get(t.id), follows: t.follows && ids.has(t.follows) ? ids.get(t.follows) : i === 0 ? null : t.follows };
        m.tokens.push({ ...token, ...snapToken(m, token, spots[i].x, spots[i].y) });
      });
    }, { by, reason: `arrived from ${from.id}` });
    for (const user of characters) clearCharacter(cid, user, [from.id, target.id], by);
    return { arrived, id: ids.get(leaderId) };
  }


  // ---------- travel and time (the world, third stage) ----------

  /**
   * Move the campaign's clock to `now` (minutes since day 1 began): everyone on a journey moves along
   * it, and whoever's journey is over arrives. Returns the settings.
   */
  function moveClock(cid, now, by) {
    const settings = store.setSettings(cid, { clock: now });
    for (const map of maps.list(cid)) {
      if (!map.tokens.some((t) => t.journey)) continue;
      maps.change(cid, map.id, (m) => {
        for (const t of m.tokens) {
          if (!t.journey) continue;
          const at = journeyAt(t.journey, now);
          Object.assign(t, snapToken(m, t, at.x, at.y));
          if (at.done) t.journey = null;
        }
      }, { by, reason: 'clock' });
    }
    return settings;
  }

  /** The clock (anyone in the campaign): { clock } (minutes since day 1 began). */
  app.get('/campaigns/:cid/clock', async (request) => ({ clock: store.getSettings(access(request).cid).clock }));

  /**
   * Move the in-game clock (DM): { add?: minutes (negative goes back), set?: minutes, next_arrival?: true (to
   * when the next journey ends) }. Journeys move along with it. Returns { clock }.
   */
  app.post('/campaigns/:cid/clock', async (request) => {
    const a = access(request, { dm: true });
    const body = z.object({ add: z.number().int().min(-1440 * 3650).max(1440 * 3650).optional(), set: z.number().int().min(0).max(MAX_CLOCK).optional(), next_arrival: z.literal(true).optional() }).strict().parse(request.body ?? {});
    let now = store.getSettings(a.cid).clock;
    if (body.set !== undefined) now = body.set;
    if (body.add !== undefined) now += body.add;
    if (body.next_arrival) {
      const next = Math.min(...maps.list(a.cid).flatMap((m) => m.tokens.filter((t) => t.journey && t.journey.arrives > now).map((t) => t.journey.arrives)));
      if (!Number.isFinite(next)) throw new BadRequestError('Nobody is on the road.');
      now = next;
    }
    return { clock: moveClock(a.cid, Math.max(0, Math.min(MAX_CLOCK, now)), request.user.id).clock };
  });

  /**
   * Send a token on a journey across this map (the world's travel): { x, y, pace?, place?, minutes? }.
   * It and whoever follows it set off now by the clock and arrive at (x, y) (or the place) when the
   * clock gets there; the time comes from the miles (the map's scale) at the pace, 8 hours on the road a
   * day; `minutes` (DM only) says how long instead. { stop: true } ends it where they are now; { arrive:
   * true } (DM) puts them there now. Players: their own token, to a place revealed to them if a place.
   */
  app.post('/campaigns/:cid/maps/:mid/tokens/:tid/journey', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const dm = a.role === 'dm';
    const token = (dm ? map.tokens : view.tokens).find((t) => t.id === request.params.tid);
    if (!token) throw new NotFoundError('No such token');
    if (!dm && !ownToken(token, a.userId)) throw new AuthError('You can only send your own character and companions.', 403);
    const body = z.object({
      x: z.number().optional(),
      y: z.number().optional(),
      place: z.string().optional(),
      pace: z.enum(Object.keys(PACES)).default('normal'),
      minutes: z.number().int().min(0).max(1440 * 3650).optional(),
      stop: z.literal(true).optional(),
      arrive: z.literal(true).optional(),
    }).strict().parse(request.body ?? {});
    if (body.minutes !== undefined && !dm) throw new AuthError('Only the DM can say how long it takes', 403);
    if (body.arrive && !dm) throw new AuthError('Only the DM can make them arrive now', 403);
    const group = followGroup(map.tokens, token.id);
    const now = store.getSettings(a.cid).clock;
    let journey = null;
    if (body.stop || body.arrive) {
      if (!token.journey) throw new BadRequestError(`${token.name} isn't on the road.`);
    } else {
      let to;
      let toName = '';
      if (body.place) {
        const place = view.places.find((p) => p.id === body.place);
        if (!place) throw new NotFoundError('No such place');
        to = { x: place.x, y: place.y };
        toName = place.name;
      } else {
        if (body.x == null || body.y == null) throw new BadRequestError('Where to?');
        to = { x: Math.min(map.image.width, Math.max(0, body.x)), y: Math.min(map.image.height, Math.max(0, body.y)) };
      }
      const from = { x: token.x, y: token.y };
      const miles = milesBetween(map, from, to);
      if (miles == null && body.minutes === undefined) throw new BadRequestError(dm ? "This map has no scale: set one in Map settings, or say how long it takes." : "This map has no scale yet, so there's no telling how long that takes. Ask your DM.");
      const minutes = body.minutes ?? travelMinutes(miles, body.pace);
      journey = { from, to, leaves: now, arrives: now + minutes, pace: body.pace, miles: miles == null ? null : Math.round(miles * 10) / 10, to_name: toName };
    }
    const ids = new Set(group.map((t) => t.id));
    const saved = maps.change(a.cid, map.id, (m) => {
      for (const t of m.tokens) {
        if (!ids.has(t.id)) continue;
        if (journey) {
          // Followers keep their place round the leader all the way.
          const dx = t.x - token.x;
          const dy = t.y - token.y;
          const off = (p) => ({ x: Math.min(m.image.width, Math.max(0, p.x + dx)), y: Math.min(m.image.height, Math.max(0, p.y + dy)) });
          t.journey = { ...journey, from: { x: t.x, y: t.y }, to: off(journey.to) };
          if (journey.arrives <= now) {
            Object.assign(t, snapToken(m, t, t.journey.to.x, t.journey.to.y));
            t.journey = null;
          }
        } else if (t.journey) {
          const at = body.arrive ? { ...t.journey.to } : journeyAt(t.journey, now);
          Object.assign(t, snapToken(m, t, at.x, at.y));
          t.journey = null;
        }
      }
    }, { by: request.user.id, reason: journey ? 'journey' : body.arrive ? 'arrived' : 'journey stopped' });
    const out = maps.view(saved, a);
    return { map: out, token: out.tokens.find((t) => t.id === token.id) ?? null, clock: now };
  });

  /** A player character's token on any map but these goes (one map per character). */
  function clearCharacter(cid, userId, except, by) {
    for (const m of maps.list(cid)) {
      if (except.includes(m.id) || !m.tokens.some((t) => t.kind === 'pc' && t.user_id === userId)) continue;
      maps.change(cid, m.id, (doc) => {
        const gone = new Set(doc.tokens.filter((t) => t.kind === 'pc' && t.user_id === userId).map((t) => t.id));
        if (doc.combat?.turn && gone.has(doc.combat.turn)) Object.assign(doc.combat, stepTurn(doc.combat, 1));
        doc.tokens = doc.tokens.filter((t) => !gone.has(t.id));
      }, { by, reason: 'character went elsewhere' });
    }
  }

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
          if (!m.kind_set) m.kind = r.kind;
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
    // Heights, stairs and ladders, and difficult terrain come only in our own files; a file without them leaves the map's be.
    const fromFile = (list, mine, max) => [...mine, ...list.slice(0, max - mine.length).map((x) => ({ ...x, id: newTokenId(), source: 'file' }))];
    if (c.raised.length) m.raised = fromFile(c.raised, m.raised.filter((x) => x.source !== 'file'), MAX_RAISED);
    if (c.climbs.length) m.climbs = fromFile(c.climbs, m.climbs.filter((x) => x.source !== 'file'), MAX_CLIMBS);
    if (c.terrain.length) m.terrain = fromFile(c.terrain, m.terrain.filter((x) => x.source !== 'file'), MAX_TERRAIN);
    if (grid) {
      m.grid = c.grid;
      m.scale = { distance: 5, unit: 'ft', per: 'square' };
    }
    return c.notes;
  }

  /** Put the AI's tracing on the map in place of its earlier one; the DM's own walls, lights, terrain, climbs and accepted heights stay. */
  function applyWallDraft(m, r) {
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
    // And stairs and ladders.
    const ownClimbs = m.climbs.filter((c) => c.source !== 'ai');
    m.climbs = [...ownClimbs, ...(r.climbs ?? []).slice(0, MAX_CLIMBS - ownClimbs.length).map((c) => ({ ...c, id: newTokenId(), source: 'ai' }))];
    // And raised areas with its guess at their heights, for the DM to accept or correct; ones they accepted stay.
    const ownRaised = m.raised.filter((x) => x.source !== 'ai');
    m.raised = [...ownRaised, ...(r.raised ?? []).slice(0, MAX_RAISED - ownRaised.length).map((x) => ({ ...x, id: newTokenId(), source: 'ai' }))];
  }

  /** Draft walls with the AI in the background. The new draft replaces the AI's old one; the DM's own walls stay. */
  function draftWallsInBackground(cid, map, userId, effort = null) {
    const started_at = new Date().toISOString();
    maps.change(cid, map.id, (m) => {
      m.wall_draft = { status: 'pending', error: '', notes: '', step: 'tracing', parts: 0, parts_done: 0, started_at, effort: effort || config.llm.tasks.walls.effort, finished_at: '', found: null };
    }, { by: userId, reason: 'drafting walls' });
    // How far it has got, live to the DM, so they can see it working.
    // The tracing so far goes on the map too, so the DM watches it draw (owner, 2026-10-16: "not hanging").
    const onProgress = ({ step, parts = 0, parts_done = 0, preview = null }) => {
      try {
        maps.change(cid, map.id, (m) => {
          if (m.wall_draft.status !== 'pending') return;
          Object.assign(m.wall_draft, { step, parts, parts_done });
          if (preview) applyWallDraft(m, preview);
        }, { reason: 'drafting walls' });
      } catch {
        // removed meanwhile
      }
    };
    const buf = fs.readFileSync(maps.imagePath(cid, map.id, { base: true }).path);
    return mapReader
      .walls({ buf, width: map.image.width, height: map.image.height, grid: map.grid, campaignId: cid, userId, effort, onProgress })
      .then((r) =>
        maps.change(cid, map.id, (m) => {
          applyWallDraft(m, r);
          // What it found (what was kept), for the DM's "done" message.
          const ai = m.walls.filter((w) => w.source === 'ai');
          const found = {
            walls: ai.filter((w) => !w.door && w.kind !== 'low').length,
            obstacles: ai.filter((w) => !w.door && w.kind === 'low').length,
            doors: ai.filter((w) => w.door).length,
            lights: m.lights.filter((l) => l.source === 'ai').length,
            terrain: m.terrain.filter((t) => t.source === 'ai').length,
            climbs: m.climbs.filter((c) => c.source === 'ai').length,
            raised: m.raised.filter((x) => x.source === 'ai').length,
          };
          m.wall_draft = { ...m.wall_draft, status: 'done', error: '', notes: r.notes, step: '', finished_at: new Date().toISOString(), found };
        }, { reason: 'walls drafted by the AI' }),
      )
      .catch((err) => {
        app.log.warn(err);
        try {
          maps.change(cid, map.id, (m) => {
            m.wall_draft = { ...m.wall_draft, status: 'failed', error: `The AI couldn't draft walls: ${publicMessage(err)}`, notes: '', step: '', finished_at: new Date().toISOString(), found: null };
          }, { reason: 'wall draft failed' });
        } catch {
          // removed meanwhile
        }
      });
  }

  /** Maps this viewer can see. can_edit: whether they're the DM here. */
  app.get('/campaigns/:cid/maps', async (request) => {
    const a = access(request);
    const dm = a.role === 'dm';
    // The DM also gets the AI walls effort used when they don't pick one (EFFORT_WALLS).
    return { can_edit: dm, clock: store.getSettings(a.cid).clock, ...(dm && { walls_effort: config.llm.tasks.walls.effort }), maps: maps.list(a.cid).map((m) => maps.view(m, a)).filter(Boolean) };
  });

  /**
   * Import a map (DM): { filename, data (base64), name?, page?, read? }. The
   * image is archived as uploaded; with `read` the AI reads it in the
   * background (otherwise not until the DM asks). The map starts hidden from players.
   */
  app.post('/campaigns/:cid/maps', upload, async (request, reply) => {
    const a = access(request, { dm: true });
    const { filename, data, name, page, read } = z
      .object({ filename: z.string().max(200).default('map'), data: z.string().min(1), name: z.string().trim().max(100).optional(), page: z.number().int().positive().optional(), read: z.boolean().default(false) })
      .parse(request.body);
    let buf = Buffer.from(data, 'base64');
    if (!buf.length) throw new BadRequestError('The file is empty.');
    // A Universal VTT file (.dd2vtt, .uvtt): its picture is the map; its grid, walls, doors and lights come with it.
    let uvtt = null;
    if (isUvtt(buf)) {
      uvtt = readUvtt(buf);
      buf = uvttImage(uvtt);
      if (!buf) throw new BadRequestError("That file has no picture of the map in it. Import the map's picture, then add the file's walls in Edit map (Walls from file).");
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
    if (read) mapAiAllowed(request.user.id);
    let fromFile = filename.replace(/\.[^.]*$/, '').replace(/[_-]+/g, ' ').trim();
    if (pdf && pages > 1) fromFile = `${fromFile || 'Map'}, page ${pdf.page}`;
    let map = maps.create(a.cid, { name: name || fromFile || 'Map', named: !!name, buf, ...image, pdf, by: request.user.id });
    if (uvtt) map = maps.change(a.cid, map.id, (m) => applyUvtt(m, uvtt, { grid: true }), { by: request.user.id, reason: 'walls from the file' });
    // The AI reads it (name, grid, scale) only when asked (owner, 2026-10-16: "That shouldn't be automatic"); Map settings has Read with the AI.
    if (read) readMapInBackground(a.cid, map, request.user.id, { keepGrid: !!uvtt });
    else map = maps.change(a.cid, map.id, (m) => { m.reading = { status: 'none', error: '', notes: '' }; }, { by: request.user.id, reason: 'not read' });
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
    // The in-game clock, when the DM moves it.
    const clock = ({ campaign_id, settings }) => {
      if (campaign_id !== cid) return;
      if (!current()) return sse.end();
      sse.send('clock', { clock: settings.clock });
    };
    maps.events.on('update', listener);
    maps.events.on('signal', signal);
    store.events.on('settings', clock);
    sse.onClose(() => {
      maps.events.off('update', listener);
      maps.events.off('signal', signal);
      store.events.off('settings', clock);
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

  /** The map's image (the picture showing now). Players get it as it is too: their page draws the fog over it. */
  app.get('/campaigns/:cid/maps/:mid/image', async (request, reply) => {
    const { cid, map } = viewableMap(request);
    const { path: file, type } = maps.imagePath(cid, map.id);
    // The file behind a key never changes (a new picture gets a new key), so the browser can keep it.
    return reply.type(type).header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(fs.createReadStream(file));
  });

  const GRID = z.object({ size: z.number().positive(), x: z.number(), y: z.number() }).nullable();
  const SCALE = z.object({ distance: z.number().positive(), unit: z.enum(UNITS), per: z.enum(SCALE_PER) }).nullable();

  /** Who a map or a place is shown to: null for every player, or a list of the campaign's players. */
  const WHO = z.array(z.number().int().positive()).max(100).nullable();
  const checkPlayers = (cid, ids) => {
    for (const id of ids ?? []) {
      if (auth.membership(cid, id)?.role !== 'player') throw new BadRequestError("That player isn't in this campaign.");
    }
  };

  /**
   * Change a map (DM): { name?, shown?, shown_to?, grid?, scale?, variant? }. grid/scale null removes them; variant: which
   * picture everyone sees (null: the original); shown_to: only these players see it when it's shown (null: every player).
   */
  app.patch('/campaigns/:cid/maps/:mid', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({ name: z.string().trim().min(1).max(100).optional(), kind: z.enum(MAP_KINDS).optional(), shown: z.boolean().optional(), shown_to: WHO.optional(), grid: GRID.optional(), scale: SCALE.optional(), variant: z.string().nullable().optional() })
      .parse(request.body ?? {});
    if (body.variant != null && !map.variants.some((v) => v.id === body.variant)) throw new NotFoundError('No such variant');
    checkPlayers(a.cid, body.shown_to);
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.name !== undefined) {
        m.name = body.name;
        m.named = true;
      }
      if (body.kind !== undefined && body.kind !== m.kind) Object.assign(m, { kind: body.kind, kind_set: true });
      if (body.shown !== undefined) m.shown = body.shown;
      if (body.shown_to !== undefined) m.shown_to = body.shown_to;
      if (body.grid !== undefined) m.grid = body.grid;
      if (body.scale !== undefined) m.scale = body.scale;
      if (body.variant !== undefined) m.variant = body.variant;
    }, { by: request.user.id });
    return maps.view(saved, a);
  });

  /**
   * Bring the players here (DM): shows the map if it was hidden and makes it the players' map
   * (playersMap), so every player's page switches to it live and opens on it.
   */
  app.post('/campaigns/:cid/maps/:mid/bring', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const saved = maps.change(a.cid, map.id, (m) => {
      m.shown = true;
      m.brought_at = new Date().toISOString();
    }, { by: request.user.id, reason: 'players brought here' });
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
   * Places on the map (DM; the world's atlas): { add?: place, set?: { id, ...place }, move?: { id, x, y }, remove?: id }.
   * A place: { name, x, y, points? (an area), group?, to? (a smaller map it opens, or null), record? ({ id } of the
   * archivist's), revealed?, revealed_to? (null: every player it's revealed to; else these players) }. Each map is a place
   * on one map only, and never inside itself.
   */
  app.patch('/campaigns/:cid/maps/:mid/places', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const PLACE = z.object({
      name: z.string().trim().min(1).max(80),
      x: z.number(),
      y: z.number(),
      points: z.array(z.tuple([z.number(), z.number()])).min(3).max(MAX_PLACE_POINTS).nullable(),
      group: z.string().trim().max(40),
      to: z.string().nullable(),
      record: z.object({ id: z.string() }).nullable(),
      revealed: z.boolean(),
      revealed_to: WHO,
    });
    const body = z
      .object({
        add: PLACE.partial().required({ name: true, x: true, y: true }).optional(),
        set: PLACE.partial().extend({ id: z.string() }).optional(),
        move: z.object({ id: z.string(), x: z.number(), y: z.number() }).optional(),
        remove: z.string().optional(),
      })
      .parse(request.body ?? {});
    const known = (id) => {
      if (!map.places.some((p) => p.id === id)) throw new NotFoundError('No such place');
    };
    for (const id of [body.set?.id, body.move?.id, body.remove].filter(Boolean)) known(id);
    if (body.add && map.places.length >= MAX_PLACES) throw new BadRequestError(`A map can have up to ${MAX_PLACES} places.`);
    const all = maps.list(a.cid);
    for (const [place, except] of [[body.add, null], [body.set, body.set?.id]]) {
      if (!place) continue;
      if (place.to) {
        if (!isMapId(place.to)) throw new NotFoundError('No such map');
        maps.get(a.cid, place.to);
        const problem = placeProblem(all, map.id, place.to, except);
        if (problem) throw new BadRequestError(problem);
      }
      checkPlayers(a.cid, place.revealed_to);
      linkRecord(a.cid, place);
    }
    const clean = ({ points, ...p }) => ({ ...p, ...(points !== undefined && { points: points ?? undefined }) });
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.add) m.places.push({ group: '', to: null, record: null, revealed: false, revealed_to: null, ...clean(body.add), id: newTokenId() });
      if (body.set) {
        const p = m.places.find((x) => x.id === body.set.id);
        Object.assign(p, clean(body.set));
        if (p.points === undefined) delete p.points;
      }
      if (body.move) {
        const p = m.places.find((x) => x.id === body.move.id);
        // An area moves as a whole.
        const dx = body.move.x - p.x;
        const dy = body.move.y - p.y;
        if (p.points) p.points = p.points.map(([x, y]) => [x + dx, y + dy]);
        Object.assign(p, { x: body.move.x, y: body.move.y });
      }
      if (body.remove) m.places = m.places.filter((p) => p.id !== body.remove);
    }, { by: request.user.id, reason: 'places' });
    return maps.view(saved, a);
  });

  /**
   * Take a token through a link to the other map: { token }. Players move their own character, standing
   * next to a link they can see, to a map the DM has shown; the DM can send any token. It arrives at the
   * link on the other map that leads back here, or the middle of that map. Between levels of the same
   * building (the same size), it arrives where it was: at the way back nearest the link it took, or the
   * same spot if there's none.
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
    if (!dm && !ownToken(token, request.user.id)) throw new AuthError('You can only move your own character and companions.', 403);
    if (!dm && !nearLink(map, link, token.x, token.y)) throw new BadRequestError(`Move ${token.name} next to it first.`);
    const target = maps.get(a.cid, link.to);
    if (!dm && !shownTo(target, a.userId)) throw new NotFoundError('No such map');
    const levels = map.level && target.level?.group === map.level.group && target.image.width === map.image.width && target.image.height === map.image.height;
    const backs = target.links.filter((l) => l.to === map.id);
    const back = levels ? backs.sort((p, q) => Math.hypot(p.x - link.x, p.y - link.y) - Math.hypot(q.x - link.x, q.y - link.y))[0] ?? { x: link.x, y: link.y } : backs[0];
    const { arrived, id } = moveGroup(a.cid, map, token.id, target, back ?? null, { by: request.user.id });
    return { map: maps.view(arrived, a), token: id };
  });

  /**
   * Go into a place (the world): { token }. The token, and whoever follows it, goes to the map the place
   * opens, arriving at that map's way back out (a link to this map) or its middle. Players take their own
   * character or companion, standing at a place revealed to them that opens a map they're shown.
   */
  app.post('/campaigns/:cid/maps/:mid/places/:pid/enter', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const { token: tid } = z.object({ token: z.string() }).parse(request.body ?? {});
    const place = view.places.find((p) => p.id === request.params.pid);
    if (!place?.to) throw new NotFoundError('No such place');
    const token = map.tokens.find((t) => t.id === tid);
    if (!token) throw new NotFoundError('No such token');
    const dm = a.role === 'dm';
    if (!dm && !ownToken(token, a.userId)) throw new AuthError('You can only move your own character and companions.', 403);
    if (!dm && !nearPlace(map, place, token.x, token.y)) throw new BadRequestError(`Move ${token.name} to ${place.name} first.`);
    const target = maps.get(a.cid, place.to);
    if (target.removed || (!dm && !shownTo(target, a.userId))) throw new NotFoundError('No such map');
    const way = target.links.find((l) => l.to === map.id);
    const { arrived, id } = moveGroup(a.cid, map, token.id, target, way ?? null, { by: request.user.id });
    return { map: maps.view(arrived, a), token: id };
  });

  /**
   * Leave this map for the map around it (the world): { token }. The token and whoever follows it arrive
   * at this map's place there. Players take their own; where this map has ways back out (links to the map
   * around it) they can see, they have to stand at one.
   */
  app.post('/campaigns/:cid/maps/:mid/leave', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const { token: tid } = z.object({ token: z.string() }).parse(request.body ?? {});
    const token = map.tokens.find((t) => t.id === tid);
    if (!token) throw new NotFoundError('No such token');
    const up = parentOf(maps.list(a.cid), map.id);
    if (!up) throw new BadRequestError(`${map.name} isn't inside another map.`);
    const dm = a.role === 'dm';
    if (!dm) {
      if (!ownToken(token, a.userId)) throw new AuthError('You can only move your own character and companions.', 403);
      if (!shownTo(up.map, a.userId)) throw new BadRequestError(`${map.name} isn't inside another map you can see.`);
      const ways = view.links.filter((l) => l.to === up.map.id);
      if (ways.length && !ways.some((l) => nearLink(map, l, token.x, token.y))) throw new BadRequestError(`Move ${token.name} to the way out first.`);
    }
    const { arrived, id } = moveGroup(a.cid, map, token.id, up.map, up.place, { by: request.user.id });
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
   * its curve), toggle?: id (open or close a door), lock?: id (lock or unlock a door), secret?: id (make a door a
   * secret door, or an ordinary one again), reveal?: id (a secret door found, or hidden again and shut), clear?: ai |
   * all }. Curves are stored as short straight pieces sharing a `group`. Walls block line of sight and players' tokens,
   * obstacles ('low') only tokens. Players never get walls, only the doors they can see (not secret doors they haven't
   * found; opening one finds it).
   */
  app.patch('/campaigns/:cid/maps/:mid/walls', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({
        add: WALL.optional(), curve: CURVE.optional(), circle: CIRCLE.optional(), remove: z.string().max(20).optional(), toggle: z.string().max(20).optional(),
        lock: z.string().max(20).optional(), secret: z.string().max(20).optional(), reveal: z.string().max(20).optional(), clear: z.enum(['ai', 'all']).optional(),
      })
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
    for (const id of [body.remove, body.toggle, body.lock, body.secret, body.reveal]) {
      if (id !== undefined && !map.walls.some((w) => w.id === id)) throw new NotFoundError('No such wall');
    }
    for (const id of [body.toggle, body.lock, body.secret, body.reveal]) {
      if (id && !map.walls.find((w) => w.id === id).door) throw new BadRequestError("That's a wall, not a door.");
    }
    if (body.reveal && !map.walls.find((w) => w.id === body.reveal).secret) throw new BadRequestError("That isn't a secret door.");
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
      if (body.secret) {
        const door = m.walls.find((w) => w.id === body.secret);
        door.secret = !door.secret;
        door.revealed = false;
      }
      if (body.reveal) {
        // Found (players see it as a door from now on), or hidden again: shut, and wall to them once more.
        const door = m.walls.find((w) => w.id === body.reveal);
        door.revealed = !door.revealed;
        if (!door.revealed) door.open = false;
      }
      if (body.add) m.walls.push({ ...body.add, id: newTokenId(), open: false, source: 'dm' });
      if (pieces) {
        const group = newTokenId();
        const kind = (body.curve ?? body.circle).kind;
        for (let i = 1; i < pieces.length; i++) {
          m.walls.push({ x1: pieces[i - 1].x, y1: pieces[i - 1].y, x2: pieces[i].x, y2: pieces[i].y, door: false, kind, id: newTokenId(), open: false, source: 'dm', group });
        }
      }
    }, { by: request.user.id, reason: body.toggle || body.reveal ? 'door' : 'walls' });
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
      const near = map.tokens.some((t) => ownToken(t, request.user.id) && distanceToWall(t, door) <= doorReach(map));
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

  /**
   * Raised areas (DM): { add?: {points: [[x, y], ...], height, bridge?}, set?: {id, height?, points?, bridge?}, accept?: id | all, remove?: id, clear?: ai | all }.
   * The AI's guesses (source ai) become the DM's when accepted or corrected (a new height, shape or bridge).
   * Roofs, wall-walks, cliffs: flat-topped parts of the map higher (or lower) than the ground, in feet.
   * Tokens standing in one are that high; players' sight goes over them only if the line clears their edges.
   */
  app.patch('/campaigns/:cid/maps/:mid/raised', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const HEIGHT = z.number().min(-MAX_HEIGHT_FT).max(MAX_HEIGHT_FT);
    const body = z
      .object({
        add: z.object({ points: z.array(z.tuple([POINT, POINT])).min(3).max(200), height: HEIGHT, bridge: z.boolean().optional() }).optional(),
        set: z.object({ id: z.string().max(20), height: HEIGHT.optional(), points: z.array(z.tuple([POINT, POINT])).min(3).max(200).optional(), bridge: z.boolean().optional() }).optional(),
        accept: z.string().max(20).optional(),
        remove: z.string().max(20).optional(),
        clear: z.enum(['ai', 'all']).optional(),
      })
      .parse(request.body ?? {});
    if (body.add && map.raised.length >= MAX_RAISED) throw new BadRequestError(`A map can have at most ${MAX_RAISED} raised areas.`);
    for (const id of [body.remove, body.set?.id, body.accept === 'all' ? null : body.accept]) if (id && !map.raised.some((r) => r.id === id)) throw new NotFoundError('No such area');
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.clear === 'all') m.raised = [];
      if (body.clear === 'ai') m.raised = m.raised.filter((r) => r.source !== 'ai');
      if (body.remove) m.raised = m.raised.filter((r) => r.id !== body.remove);
      // The AI's guesses: accepted as they are (one, or 'all'), or corrected (a height set), they become the DM's and stay through the next AI draft.
      const own = (r) => { if (r.source === 'ai') r.source = 'dm'; };
      if (body.accept) for (const r of m.raised) if (body.accept === 'all' || r.id === body.accept) own(r);
      if (body.set) {
        const r = m.raised.find((x) => x.id === body.set.id);
        if (body.set.height !== undefined) r.height = body.set.height;
        if (body.set.points) r.points = body.set.points;
        if (body.set.bridge !== undefined) r.bridge = body.set.bridge;
        own(r);
      }
      if (body.add) m.raised.push({ id: newTokenId(), points: body.add.points, height: body.add.height, bridge: !!body.add.bridge, source: 'dm' });
    }, { by: request.user.id, reason: 'raised areas' });
    return maps.view(saved, a);
  });

  /**
   * Stairs and ladders (DM): { add?: {kind, x1, y1, x2, y2}, remove?: id, clear?: ai | all }.
   * Each is a line up it from the bottom to the top. Going between heights by stairs costs no
   * extra movement; by a ladder it's climbing (see pathCost).
   */
  app.patch('/campaigns/:cid/maps/:mid/climbs', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z
      .object({
        add: z.object({ kind: z.enum(CLIMB_KINDS), x1: POINT, y1: POINT, x2: POINT, y2: POINT }).optional(),
        remove: z.string().max(20).optional(),
        clear: z.enum(['ai', 'all']).optional(),
      })
      .parse(request.body ?? {});
    if (body.add && map.climbs.length >= MAX_CLIMBS) throw new BadRequestError(`A map can have at most ${MAX_CLIMBS} stairs and ladders.`);
    if (body.remove && !map.climbs.some((c) => c.id === body.remove)) throw new NotFoundError('No such stairs or ladder');
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.clear === 'all') m.climbs = [];
      if (body.clear === 'ai') m.climbs = m.climbs.filter((c) => c.source !== 'ai');
      if (body.remove) m.climbs = m.climbs.filter((c) => c.id !== body.remove);
      if (body.add) m.climbs.push({ id: newTokenId(), ...body.add, source: 'dm' });
    }, { by: request.user.id, reason: 'stairs and ladders' });
    return maps.view(saved, a);
  });

  /**
   * Draft the walls and doors with the AI (DM), in the background. Replaces the AI's earlier draft; walls the DM drew stay.
   * { effort? }: how hard the AI thinks (low to max); left out, the `walls` task's (EFFORT_WALLS).
   */
  app.post('/campaigns/:cid/maps/:mid/walls/draft', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const effort = request.body?.effort ?? null;
    if (effort !== null && !EFFORTS.includes(effort)) throw new BadRequestError(`Effort must be one of: ${EFFORTS.join(', ')}.`);
    if (map.wall_draft.status === 'pending') throw new BadRequestError('The AI is already drafting walls for this map.');
    mapAiAllowed(request.user.id);
    draftWallsInBackground(a.cid, map, request.user.id, effort);
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

  /**
   * The map as a Universal VTT file (DM), to use it in another VTT or map
   * maker: its picture (the one shown now), grid, walls, doors and lights.
   */
  app.get('/campaigns/:cid/maps/:mid/export.dd2vtt', async (request, reply) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    if (!map.grid) throw new BadRequestError('This map has no grid yet. Set its grid first: the file measures everything in squares.');
    const png = await sharp(maps.imagePath(a.cid, map.id).path).png().toBuffer();
    const name = map.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 80) || 'map';
    return reply
      .type('application/json')
      .header('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}.dd2vtt"; filename*=UTF-8''${encodeURIComponent(name)}.dd2vtt`)
      .header('Cache-Control', 'private, no-store')
      .send(JSON.stringify(toUvtt(map, png)));
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

  /** A token linked to a record gets that record's current title (the DM only sends the id). */
  const linkRecord = (cid, body) => {
    if (!body.record) return;
    const [r] = kb.getMany(cid, [body.record.id]);
    if (!r) throw new BadRequestError('No such record.');
    body.record = { id: r.id, title: r.title };
  };

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

  Object.assign(r, { linkRecord, mapAiAllowed, moveClock, tokenArt, viewableMap });
}
