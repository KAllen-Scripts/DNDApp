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
 * viewer: players only see maps the DM has shown, and never the AI's
 * description or reading notes.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { normalizeMap, normalizePins, canSee, healthOf, speedFromText } from '@dndapp/shared/map.js';
import { computeSheet } from '@dndapp/shared/sheet.js';
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
     * Players: only shown maps; no AI description or notes; no walls or lights, only
     * the doors they can see (`doors`, to open and close them); no
     * hidden tokens, and none they can't see (under the fog, or out of their
     * token's sight) except their own; NPCs' and enemies' hit points only as
     * how hurt they look; no stat blocks or links to the DM's records. Their
     * fog comes as `fog.mask` (what they see, see fogMask), not the DM's
     * rectangles. `image_key` changes when their image does.
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
        if (t.kind === 'pc' && t.user_id != null) return linked(t) ? Number(linked(t).calc.values.speed) || null : null;
        return speedFromText(t.stats?.speed) ?? null;
      };
      // A player character with a saved sheet has the sheet's hit points (current and maximum).
      const hpOf = (t) => {
        const l = linked(t);
        if (!l) return { hp: t.hp, hp_sheet: false };
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
      const variantKey = map.variant ? `-${map.variant}` : '';
      const out = {
        ...map,
        // The picture's file name stays on the server; `picture` is its key.
        tokens: map.tokens.map(({ art: _art, ...t }) => ({ ...t, ...hpOf(t), picture: picture({ ...t, art: _art }), move_speed: moveSpeed(t) })),
        links: links.map(({ target: m, ...l }) => ({ ...l, to_name: m?.name ?? null })),
      };
      delete out.campaign_id;
      if (role === 'dm') return { ...out, image_key: `dm${variantKey}`, can_edit: true };
      if (!map.shown) return null;
      const seen = sight.forPlayer(map, userId);
      const tokens = out.tokens.filter((t) => t.user_id === userId || (!t.hidden && canSee(map, seen.polygons, t.x, t.y)));
      const visible = new Set(tokens.map((t) => t.id));
      return {
        ...out,
        description: '',
        source: null,
        reading: { status: map.reading.status, error: '', notes: '' },
        walls: [],
        lights: [],
        // Difficult terrain where they can see any of it.
        terrain: map.terrain.filter((a) => a.points.some(([x, y]) => canSee(map, seen.polygons, x, y))),
        doors: map.walls
          .filter((w) => w.door && doorSeen(map, seen.polygons, w))
          .map(({ id, x1, y1, x2, y2, open, locked }) => ({ id, x1, y1, x2, y2, open, locked })),
        wall_draft: { status: '', error: '', notes: '', step: '', parts: 0, parts_done: 0, started_at: '', finished_at: '', found: null },
        fog: { ...map.fog, shapes: [], mask: seen.mask },
        // Areas of effect: their own, and ones whose point of origin they can see.
        templates: map.templates.filter((t) => t.user_id === userId || canSee(map, seen.polygons, t.x, t.y)),
        // The turn order holds only the tokens they can see; on an unseen token's turn, `turn` is null and `turn_unseen` says so.
        combat: map.combat && {
          ...map.combat,
          entries: map.combat.entries.filter((e) => visible.has(e.id)),
          turn: visible.has(map.combat.turn) ? map.combat.turn : null,
          turn_unseen: map.combat.turn != null && !visible.has(map.combat.turn),
        },
        tokens: tokens
          .map((t) => (t.kind === 'pc' ? { ...t, stats: null, record: null } : { ...t, hp: null, health: healthOf(t.hp), stats: null, record: null })),
        // Links to maps they're shown, where they can see the link; variants by name only.
        links: links
          .filter((l) => l.target?.shown && canSee(map, seen.polygons, l.x, l.y))
          .map(({ target: m, ...l }) => ({ ...l, to_name: m.name })),
        variants: map.variants.filter((v) => v.id === map.variant).map(({ id, name }) => ({ id, name })),
        image_key: `${seen.key}${variantKey}`,
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
      const shown = JSON.stringify([sheet.hp.current, values.hp_max ?? null, values.speed ?? null]);
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
     * the reason so the archive and the archivist see it.
     */
    setSheetHp(campaignId, userId, current, { by }) {
      const { sheet, version } = sheets.get(campaignId, userId);
      if (!version) return null;
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
