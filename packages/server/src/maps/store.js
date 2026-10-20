/**
 * Maps the DM imports: the image, its grid and scale, and the tokens on it.
 *
 * Source data, archive first, stored like character sheets: one JSON
 * document per map, and each change appends only what changed to
 * maps/<id>/changes.jsonl (the first line holds the whole map). The image is
 * archived exactly as uploaded. Nothing is ever deleted: removing a map only
 * marks it removed.
 *
 * Who sees what is decided here (`view`), so every read path filters by the
 * viewer: players only see maps the DM has shown them (everyone, or chosen
 * players), and never the AI's description or reading notes.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { MAX_CLIMBS, MAX_RAISED, MAX_LIGHTS, MAX_LINKS, MAX_TERRAIN, MAX_WALLS, normalizeMap, normalizePins, blockingWalls, shownTo, placeRevealedTo, canSee, canSeeToken, doorKnown, parseHeight, healthOf, ownToken, speedFromText, hasClimbSpeed } from '@dndapp/shared/map.js';
import { designToMap } from '@dndapp/shared/map-design.js';
import { computeSheet } from '@dndapp/shared/sheet.js';
import { activeForm, formHasHp, setFormHp } from '@dndapp/shared/wild-shape.js';
import { createSight } from './sight.js';
import { mapEvents } from './events.js';
import { diffJson, applyJson } from '../sheets/store.js';
import { NotFoundError } from '../store.js';

export const newMapId = () => crypto.randomBytes(5).toString('hex');
export const newTokenId = () => crypto.randomBytes(6).toString('hex');
export const isMapId = (id) => /^[a-f0-9]{10}$/.test(String(id));

/** Rebuild a map from its archived change lines. */
export function replayMap(entries) {
  let doc = {};
  let version = 0;
  let saved_at = null;
  for (const e of entries) {
    doc = applyJson(doc, e.changes);
    ({ version, saved_at } = e);
  }
  return { map: normalizeMap(doc), version, saved_at, created_at: entries[0]?.saved_at ?? saved_at };
}

/** Can a player see a door? Its middle lies on the edge of their sight, so look just either side of it. */
function doorSeen(map, polygons, w) {
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
  const nx = ((w.y1 - w.y2) / len) * 2;
  const ny = ((w.x2 - w.x1) / len) * 2;
  const mx = (w.x1 + w.x2) / 2;
  const my = (w.y1 + w.y2) / 2;
  return canSee(map, polygons, mx + nx, my + ny) || canSee(map, polygons, mx - nx, my - ny);
}

/**
 * What a map made in the creator gets from its design, merged into the map
 * document `m`: the grid and 5 ft squares, and its walls, doors, secret
 * doors, obstacles, lights, difficult terrain, stairs and ladders, and ways
 * to other maps (`source: 'creator'`), replacing those from the design saved before. What
 * the DM drew on the map, or the AI or a file added, stays. A creator wall
 * that's the same as before keeps its id, and a door keeps whether it's open
 * or locked (a secret door, whether it's been found); a way to another map
 * from the same place to the same map keeps its id.
 */
export function applyDesign(m, design) {
  const g = designToMap(design);
  const key = (w) => [w.x1, w.y1, w.x2, w.y2, w.kind, w.door, !!w.secret].join();
  const before = new Map((m.walls ?? []).filter((w) => w.source === 'creator').map((w) => [key(w), w]));
  const own = (m.walls ?? []).filter((w) => w.source !== 'creator');
  const used = new Set();
  const walls = g.walls.map((w) => {
    const old = before.get(key(w));
    const id = old && !used.has(old.id) ? old.id : newTokenId();
    used.add(id);
    return { ...w, id, open: !!(w.door && old?.open), locked: !!(w.door && old?.locked), ...(w.secret && { revealed: !!old?.revealed }), source: 'creator' };
  });
  m.walls = [...own, ...walls.slice(0, Math.max(0, MAX_WALLS - own.length))];
  const linkKey = (l) => [l.x, l.y, l.to].join();
  const oldLinks = new Map((m.links ?? []).filter((l) => l.source === 'creator').map((l) => [linkKey(l), l]));
  const ownLinks = (m.links ?? []).filter((l) => l.source !== 'creator');
  m.links = [...ownLinks, ...g.links.slice(0, Math.max(0, MAX_LINKS - ownLinks.length)).map((l) => ({ ...l, id: oldLinks.get(linkKey(l))?.id ?? newTokenId(), source: 'creator' }))];
  const ownLights = (m.lights ?? []).filter((l) => l.source !== 'creator');
  m.lights = [...ownLights, ...g.lights.slice(0, Math.max(0, MAX_LIGHTS - ownLights.length)).map((l) => ({ ...l, id: newTokenId(), source: 'creator' }))];
  const ownTerrain = (m.terrain ?? []).filter((t) => t.source !== 'creator');
  m.terrain = [...ownTerrain, ...g.terrain.slice(0, Math.max(0, MAX_TERRAIN - ownTerrain.length)).map((t) => ({ ...t, id: newTokenId(), source: 'creator' }))];
  const ownClimbs = (m.climbs ?? []).filter((c) => c.source !== 'creator');
  m.climbs = [...ownClimbs, ...g.climbs.slice(0, Math.max(0, MAX_CLIMBS - ownClimbs.length)).map((c) => ({ ...c, id: newTokenId(), source: 'creator' }))];
  const ownRaised = (m.raised ?? []).filter((r) => r.source !== 'creator');
  m.raised = [...ownRaised, ...g.raised.slice(0, Math.max(0, MAX_RAISED - ownRaised.length)).map((r) => ({ ...r, id: newTokenId(), source: 'creator' }))];
  m.grid = g.grid;
  // A scale the DM set on the map stays (owner, 2026-10-16); a new map gets 5 ft squares.
  if (!m.scale?.distance) m.scale = g.scale;
  m.design = design;
  return m;
}

/** Which picture of a map this is: 1 for the first, 2 for image-r2.webp... (a map made in the creator gets a new one on each save). */
const imageRev = (image) => Number(/-r(\d+)\./.exec(image.file)?.[1] ?? 1);

export function createMaps({ db, archive, store, pictures = null, sheets = null }) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const sight = createSight({ db });
  // What each character's token last showed from its sheet (hit points, speed), so unrelated saves don't resend maps.
  const sheetShown = new Map();

  const fromRow = (r) => ({ id: r.id, campaign_id: r.campaign_id, ...normalizeMap(JSON.parse(r.data)), version: r.version, created_at: r.created_at, updated_at: r.updated_at });
  const row = (cid, id) => (isMapId(id) ? db.prepare('SELECT * FROM maps WHERE id = ? AND campaign_id = ?').get(id, cid) : null);
  const docOf = (m) => normalizeMap(m);

  function write(campaignId, id, before, after, { by, reason, created = false }) {
    const c = store.getCampaign(campaignId);
    const changes = created ? [{ p: [], v: after }] : diffJson(before.doc, after);
    if (!changes.length) return null;
    const version = (before?.version ?? 0) + 1;
    const saved_at = new Date().toISOString();
    archive.appendMapChanges(c.slug, id, { version, saved_at, by: by ?? null, ...(reason && { reason }), changes });
    if (created) {
      db.prepare('INSERT INTO maps (id, campaign_id, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        id, campaignId, JSON.stringify(after), version, saved_at, saved_at,
      );
    } else {
      db.prepare('UPDATE maps SET data = ?, version = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(after), version, saved_at, id);
    }
    const map = fromRow(row(campaignId, id));
    events.emit('update', map);
    return map;
  }

  const maps = {
    events,

    /** Every map in the campaign that isn't removed (unfiltered: use view() before sending). */
    list(campaignId) {
      return db.prepare('SELECT * FROM maps WHERE campaign_id = ? ORDER BY created_at, id').all(campaignId).map(fromRow).filter((m) => !m.removed);
    },

    get(campaignId, id) {
      const r = row(campaignId, id);
      const map = r && fromRow(r);
      if (!map || map.removed) throw new NotFoundError('No such map');
      return map;
    },

    /**
     * A new map from an image. The image is archived first, then the map.
     * A page of a PDF comes as the rendered image plus `pdf: { buf, page }`; the PDF is archived too.
     * @param {{ name: string, named?: boolean, buf: Buffer, ext: 'png'|'jpg'|'webp', type: string, width: number, height: number, pdf?: { buf: Buffer, page: number }, by: number }} input
     */
    create(campaignId, { name, named = false, buf, ext, type, width, height, pdf = null, by }) {
      const c = store.getCampaign(campaignId);
      const id = newMapId();
      const file = `image.${ext}`;
      if (pdf) archive.saveMapImage(c.slug, id, 'source.pdf', pdf.buf);
      archive.saveMapImage(c.slug, id, file, buf);
      const source = pdf ? { file: 'source.pdf', page: pdf.page } : null;
      const doc = normalizeMap({ name, named, image: { file, type, width, height }, source, shown: false, reading: { status: 'pending' } });
      return write(campaignId, id, null, doc, { by, reason: 'imported', created: true });
    },

    /**
     * A new map made in the creator. Its picture (drawn from the design by
     * maps/design.js) is archived first, then the map with the design and what
     * it gives (applyDesign). No AI reading is needed; it starts hidden.
     * @param {{ name: string, design: object, image: { buf: Buffer, ext: string, type: string, width: number, height: number }, level?: { group: string, n: number } | null, by: number }} input
     */
    createDesigned(campaignId, { name, design, image, level = null, by }) {
      const c = store.getCampaign(campaignId);
      const id = newMapId();
      const file = `image.${image.ext}`;
      archive.saveMapImage(c.slug, id, file, image.buf);
      const doc = { name, named: true, kind: 'battle', image: { file, type: image.type, width: image.width, height: image.height }, shown: false, reading: { status: 'done' }, level };
      return write(campaignId, id, null, normalizeMap(applyDesign(doc, design)), { by, reason: 'made in the creator', created: true });
    },

    /**
     * A map made in the creator, changed there and saved again: the new
     * picture is archived beside the old ones (`image-r<n>`), and the design's
     * walls, lights and terrain replace those from before. Tokens, fog, the
     * DM's own walls and everything else stay. If the map's size changed,
     * where players have explored is forgotten (it no longer lines up).
     */
    redesign(campaignId, id, { design, image, by }) {
      const map = maps.get(campaignId, id);
      const file = `image-r${imageRev(map.image) + 1}.${image.ext}`;
      archive.saveMapImage(store.getCampaign(campaignId).slug, map.id, file, image.buf);
      const resized = map.image.width !== image.width || map.image.height !== image.height;
      const saved = maps.change(campaignId, id, (m) => {
        m.image = { file, type: image.type, width: image.width, height: image.height };
        applyDesign(m, design);
      }, { by, reason: 'changed in the creator' });
      if (resized) sight.forget(map.id);
      return saved;
    },

    /**
     * Change a map: `fn` gets a copy of the map document to change in place
     * (synchronously, so changes from several people can't interleave). The
     * result is normalised before it's saved. Returns the saved map, or the
     * unchanged one if nothing changed.
     */
    change(campaignId, id, fn, { by, reason } = {}) {
      const current = maps.get(campaignId, id);
      const doc = structuredClone(docOf(current));
      fn(doc);
      const after = normalizeMap(doc);
      return write(campaignId, id, { doc: docOf(current), version: current.version }, after, { by, reason }) ?? current;
    },

    /** The image shown now (the chosen variant, if any), or with `base` the one imported. */
    imagePath(campaignId, id, { base = false } = {}) {
      const map = maps.get(campaignId, id);
      const v = !base && map.variants.find((x) => x.id === map.variant);
      return { path: archive.mapImagePath(store.getCampaign(campaignId).slug, id, (v || map.image).file), type: (v || map.image).type };
    },

    /**
     * Another picture of the same map (DM). The upload is archived as it came
     * (`variant-<id>-original.<ext>`) beside the copy fitted to the map's size,
     * so tokens, walls and fog stay in place on it.
     * @param {{ name: string, original: Buffer, ext: string, fitted: Buffer, type: string, by: number }} input
     */
    addVariant(campaignId, id, { name, original, ext, fitted, type, by }) {
      const map = maps.get(campaignId, id);
      const slug = store.getCampaign(campaignId).slug;
      const vid = newTokenId();
      const file = `variant-${vid}.${{ 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type] ?? 'png'}`;
      archive.saveMapImage(slug, map.id, `variant-${vid}-original.${ext}`, original);
      archive.saveMapImage(slug, map.id, file, fitted);
      return maps.change(campaignId, id, (m) => {
        m.variants.push({ id: vid, name, file, type });
      }, { by, reason: 'variant added' });
    },

    /** Every archived change line of a map, oldest first. */
    history(campaignId, id) {
      return archive.readMapChanges(store.getCampaign(campaignId).slug, id);
    },

    /** What happened on the maps players saw on a session date, for the archivist (see mapEvents). */
    eventsOn(campaignId, date, rolloverHour) {
      return mapEvents(maps.allIds(campaignId).map((id) => ({ id, entries: maps.history(campaignId, id) })), { date, rolloverHour });
    },

    /** Every map ever made in the campaign, removed ones too. */
    allIds(campaignId) {
      return db.prepare('SELECT id FROM maps WHERE campaign_id = ? ORDER BY created_at, id').all(campaignId).map((r) => r.id);
    },

    /**
     * What this viewer may see of a map, or null if they may not see it at all.
     * Players: only shown maps; no AI description or notes; the walls that
     * block (as plain lines, secret doors as wall) and the lights, so their
     * page works out the fog (playerFogMask), with the places they've
     * explored as `fog.explored`; the doors they can see (`doors`, to open
     * and close them); no hidden tokens, and none they can't see (under the
     * fog, or out of their token's sight) except their own; NPCs' and
     * enemies' hit points only as how hurt they look; no stat blocks (but
     * their own companions') or links to the DM's records. They get the picture as it is (the page
     * draws the fog over it); `image_key` changes when the picture does.
     * Players get only the spell templates they placed or whose origin they
     * can see, and only the visible tokens' places in the turn order.
     * Tokens carry `move_speed`: how far they walk in a turn, if known.
     * Tokens carry `picture`: the key of their picture (a player character's
     * own token picture, or the one the DM gave an NPC or enemy), or null.
     */
    view(map, { role, userId }) {
      if (!map || map.removed) return null;
      // A player character's token shows the token picture its player uploaded; others, the DM's.
      const picture = (t) => (t.kind === 'pc' ? (pictures ? pictures.tokenKey(map.campaign_id, t.user_id) : null) : t.art ? t.art.file.replace(/\.[^.]*$/, '') : null);
      // A player character's saved sheet, worked out (once per token).
      const settings = store.getSettings(map.campaign_id);
      const sheetOf = new Map();
      const linked = (t) => {
        if (!sheetOf.has(t.id)) {
          const found = t.kind === 'pc' && t.user_id != null && sheets ? sheets.get(map.campaign_id, t.user_id) : null;
          sheetOf.set(t.id, found?.version ? { sheet: found.sheet, calc: computeSheet(found.sheet, settings) } : null);
        }
        return sheetOf.get(t.id);
      };
      // How far it walks in a turn: what the DM set, else the player's sheet, else the stat block.
      const moveSpeed = (t) => {
        if (t.speed != null) return t.speed;
        if (t.kind === 'pc' && t.user_id != null) {
          if (!linked(t)) return null;
          const form = activeForm(linked(t).sheet);
          return form ? form.speed.walk ?? 0 : Number(linked(t).calc.values.speed) || null;
        }
        return speedFromText(t.stats?.speed) ?? null;
      };
      // Climbs at no extra cost: a climbing speed in its stat block, or its player's Wild Shape form's.
      const climberOf = (t) => {
        if (t.kind === 'pc' && t.user_id != null) {
          const form = linked(t) && activeForm(linked(t).sheet);
          return !!form?.speed.climb;
        }
        return hasClimbSpeed(t.stats?.speed);
      };
      // How tall a player character is from its sheet's Height (null: the token's own height or its size's; see tokenTall).
      const tallOf = (t) => (t.height == null && t.kind === 'pc' && linked(t) ? parseHeight(linked(t).sheet.height) : null);
      // A player character with a saved sheet has the sheet's hit points (current and maximum), or
      // their Wild Shape form's while they're in one (2014 rules: the form has its own).
      const hpOf = (t) => {
        const l = linked(t);
        if (!l) return { hp: t.hp, hp_sheet: false };
        if (formHasHp(l.sheet)) return { hp: { current: l.sheet.wild_shape.active.hp, max: activeForm(l.sheet).hp_max }, hp_sheet: true };
        const max = l.calc.values.hp_max == null ? null : Number(l.calc.values.hp_max) || null;
        const current = l.sheet.hp.current ?? max;
        return { hp: current == null && max == null ? null : { current, max }, hp_sheet: true };
      };
      // Where each link leads: the target map's name, or null if it's gone.
      const target = (to) => {
        const r = row(map.campaign_id, to);
        const m = r && fromRow(r);
        return m && !m.removed ? m : null;
      };
      const links = map.links.map((l) => ({ ...l, target: target(l.to) }));
      const places = map.places.map((p) => ({ ...p, target: p.to ? target(p.to) : null }));
      // A new picture (a map saved again in the creator) changes the key, so browsers fetch it.
      const variantKey = `${map.variant ? `-${map.variant}` : ''}${imageRev(map.image) > 1 ? `-r${imageRev(map.image)}` : ''}`;
      const out = {
        ...map,
        // The picture's file name stays on the server; `picture` is its key.
        tokens: map.tokens.map(({ art: _art, ...t }) => ({ ...t, ...hpOf(t), picture: picture({ ...t, art: _art }), move_speed: moveSpeed(t), tall: tallOf(t), climber: climberOf(t) })),
        links: links.map(({ target: m, ...l }) => ({ ...l, to_name: m?.name ?? null })),
        places: places.map(({ target: m, ...p }) => ({ ...p, to_name: m?.name ?? null })),
      };
      delete out.campaign_id;
      // The design is fetched on its own when the DM opens the creator (GET .../design); players never get it.
      delete out.design;
      if (role === 'dm') return { ...out, designed: !!map.design, image_key: `dm${variantKey}`, can_edit: true };
      if (!shownTo(map, userId)) return null;
      const seen = sight.forPlayer(map, userId);
      // In their tokens' sight, and with raised areas, over them to the top of its head (the tokens carry their heights).
      const withHeights = { ...map, tokens: out.tokens };
      const tokens = out.tokens.filter((t) => ownToken(t, userId) || (!t.hidden && canSeeToken(withHeights, userId, seen.polygons, t)));
      const visible = new Set(tokens.map((t) => t.id));
      return {
        ...out,
        description: '',
        source: null,
        reading: { status: map.reading.status, error: '', notes: '' },
        // What blocks sight and movement, so their page works out the fog itself (owner, 2026-10-14: what a
        // determined player could dig out of their browser doesn't matter). A secret door is plain wall to them.
        walls: blockingWalls(map).map(({ x1, y1, x2, y2, kind }) => ({ x1, y1, x2, y2, kind })),
        // Placed lights, and lights carried by tokens they don't get (the ones they get carry their own).
        lights: [
          ...map.lights.map(({ x, y, bright, dim }) => ({ x, y, bright, dim })),
          ...map.tokens.filter((t) => t.light && !visible.has(t.id)).map((t) => ({ x: t.x, y: t.y, ...t.light })),
        ],
        // Raised areas (roofs, wall-walks, cliffs), so their page works out where it can't see over them.
        raised: map.raised.map(({ points, height, bridge }) => ({ points, height, ...(bridge && { bridge }) })),
        // Stairs and ladders, so their page can say what a move costs while it's dragged.
        climbs: map.climbs.map(({ kind, x1, y1, x2, y2 }) => ({ kind, x1, y1, x2, y2 })),
        // Difficult terrain where they can see any of it.
        terrain: map.terrain.filter((a) => a.points.some(([x, y]) => canSee(map, seen.polygons, x, y))),
        // A secret door looks like wall until it's found.
        doors: map.walls
          .filter((w) => doorKnown(w) && doorSeen(map, seen.polygons, w))
          .map(({ id, x1, y1, x2, y2, open, locked }) => ({ id, x1, y1, x2, y2, open, locked })),
        wall_draft: { status: '', error: '', notes: '', step: '', parts: 0, parts_done: 0, started_at: '', finished_at: '', found: null },
        fog: { ...map.fog, explored: seen.explored },
        // Areas of effect: their own, and ones whose point of origin they can see.
        templates: map.templates.filter((t) => t.user_id === userId || canSee(map, seen.polygons, t.x, t.y)),
        // The turn order holds only the tokens they can see; on an unseen token's turn, `turn` is null and `turn_unseen` says so.
        combat: map.combat && {
          ...map.combat,
          entries: map.combat.entries.filter((e) => visible.has(e.id)),
          turn: visible.has(map.combat.turn) ? map.combat.turn : null,
          turn_unseen: map.combat.turn != null && !visible.has(map.combat.turn),
        },
        // The party's own (characters, companions and summons) show their hit points; a companion's stat block
        // goes to the player who controls it, so they can roll for it. Anyone else's hit points only as how hurt they look.
        tokens: tokens.map((t) => {
          if (t.kind === 'pc') return { ...t, stats: null, record: null };
          if (t.kind === 'companion') return { ...t, stats: t.user_id === userId ? t.stats : null, record: null };
          return { ...t, hp: null, health: healthOf(t.hp), stats: null, record: null };
        }),
        // Links to maps they're shown, where they can see the link; variants by name only.
        links: links
          .filter((l) => shownTo(l.target, userId) && canSee(map, seen.polygons, l.x, l.y))
          .map(({ target: m, ...l }) => ({ ...l, to_name: m.name })),
        // Places revealed to them, where they can see where its name goes (or any corner of it); what it opens
        // only if they're shown that map; never the DM's record or who else it's revealed to.
        places: places
          .filter((p) => placeRevealedTo(p, userId) && [[p.x, p.y], ...(p.points ?? [])].some(([x, y]) => canSee(map, seen.polygons, x, y)))
          .map(({ target: m, record: _r, revealed_to: _t, ...p }) => (shownTo(m, userId) ? { ...p, record: null, revealed_to: null, to_name: m.name } : { ...p, to: null, record: null, revealed_to: null, to_name: null })),
        shown_to: null,
        variants: map.variants.filter((v) => v.id === map.variant).map(({ id, name }) => ({ id, name })),
        image_key: `p${variantKey}`,
        designed: false,
        can_edit: false,
      };
    },

    /** What a player's tokens see on a map now (see sight.forPlayer). */
    sightFor(map, userId) {
      return sight.forPlayer(map, userId);
    },

    /** Someone's private pins on a map. Only ever sent to that person. */
    pins(campaignId, id, userId) {
      const map = maps.get(campaignId, id);
      const r = db.prepare('SELECT data FROM map_pins WHERE map_id = ? AND user_id = ?').get(map.id, userId);
      return normalizePins(r ? JSON.parse(r.data) : [], map.image);
    },

    /** Change someone's pins: `fn` gets a copy of the list to change in place. Archived first. */
    changePins(campaignId, id, userId, fn) {
      const map = maps.get(campaignId, id);
      const before = maps.pins(campaignId, id, userId);
      const list = structuredClone(before);
      fn(list);
      const after = normalizePins(list, map.image);
      if (JSON.stringify(after) === JSON.stringify(before)) return after;
      const saved_at = new Date().toISOString();
      archive.appendMapPins(store.getCampaign(campaignId).slug, map.id, userId, { saved_at, pins: after });
      db.prepare(
        `INSERT INTO map_pins (map_id, user_id, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (map_id, user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      ).run(map.id, userId, JSON.stringify(after), saved_at);
      return after;
    },

    /**
     * A player's sheet was saved: maps with their character's token are sent
     * again, since the token shows the sheet's hit points and speed (only
     * when one of those changed, not on every keystroke's save).
     */
    sheetChanged(campaignId, userId) {
      const { sheet, version } = sheets.get(campaignId, userId);
      const values = version ? computeSheet(sheet, store.getSettings(campaignId)).values : {};
      const shown = JSON.stringify([sheet.hp.current, values.hp_max ?? null, values.speed ?? null, sheet.wild_shape?.active ?? null]);
      const key = `${campaignId}:${userId}`;
      if (sheetShown.get(key) === shown) return;
      sheetShown.set(key, shown);
      for (const r of db.prepare('SELECT * FROM maps WHERE campaign_id = ?').all(campaignId)) {
        const map = fromRow(r);
        if (!map.removed && map.tokens.some((t) => t.kind === 'pc' && t.user_id === userId)) events.emit('update', map);
      }
    },

    /**
     * Hit points changed on a player character's token: they go on the
     * player's sheet (current only; the maximum is the sheet's), saved with
     * the reason so the archive and the archivist see it. A druid in a Wild
     * Shape form with its own hit points (2014 rules): the form's change, and
     * at 0 they change back with the rest of the damage carried over.
     */
    setSheetHp(campaignId, userId, current, { by }) {
      const { sheet, version } = sheets.get(campaignId, userId);
      if (!version) return null;
      if (formHasHp(sheet)) {
        const form = activeForm(sheet);
        const res = setFormHp(sheet, current, computeSheet(sheet, store.getSettings(campaignId)).values.hp_max);
        const reason = res.reverted
          ? `${form.name} (Wild Shape) dropped to 0 hit points on the map: changed back${res.carried ? `, ${res.carried} damage carried over` : ''}`
          : `${form.name} (Wild Shape) hit points changed on the map`;
        return sheets.save(campaignId, userId, res.sheet, { by, reason });
      }
      return sheets.save(campaignId, userId, { ...sheet, hp: { ...sheet.hp, current } }, { by, reason: 'hit points changed on the map' });
    },

    /** Forget where everyone has been on a map, and tell everyone looking at it. */
    forgetExplored(campaignId, id) {
      const map = maps.get(campaignId, id);
      sight.forget(map.id);
      events.emit('update', map);
      return map;
    },

    /** Reads cut short by a restart can't finish; say so, so the DM can run them again. */
    failInterrupted() {
      for (const r of db.prepare("SELECT * FROM maps WHERE json_extract(data, '$.reading.status') = 'pending' AND json_extract(data, '$.removed') IS NOT 1").all()) {
        maps.change(r.campaign_id, r.id, (m) => {
          m.reading = { ...m.reading, status: 'failed', error: 'The server restarted while reading this map. Read it again.' };
        }, { reason: 'read interrupted' });
      }
      for (const r of db.prepare("SELECT * FROM maps WHERE json_extract(data, '$.wall_draft.status') = 'pending' AND json_extract(data, '$.removed') IS NOT 1").all()) {
        maps.change(r.campaign_id, r.id, (m) => {
          m.wall_draft = { ...m.wall_draft, status: 'failed', error: 'The server restarted while the AI was drafting walls. Try again.', step: '', finished_at: new Date().toISOString() };
        }, { reason: 'wall draft interrupted' });
      }
    },
  };
  return maps;
}
