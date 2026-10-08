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
import { normalizeMap, normalizePins, canSee, healthOf } from '@dndapp/shared/map.js';
import { createSight } from './sight.js';
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

export function createMaps({ db, archive, store, pictures = null }) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const sight = createSight({ db });

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

    imagePath(campaignId, id) {
      const map = maps.get(campaignId, id);
      return { path: archive.mapImagePath(store.getCampaign(campaignId).slug, id, map.image.file), type: map.image.type };
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
     * Player character tokens carry `picture`: the key of their player's token picture, or null.
     */
    view(map, { role, userId }) {
      if (!map || map.removed) return null;
      // A player character's token shows the token picture its player uploaded.
      const picture = (t) => (t.kind === 'pc' && pictures ? pictures.tokenKey(map.campaign_id, t.user_id) : null);
      const out = { ...map, tokens: map.tokens.map((t) => ({ ...t, picture: picture(t) })) };
      delete out.campaign_id;
      if (role === 'dm') return { ...out, image_key: 'dm', can_edit: true };
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
        doors: map.walls
          .filter((w) => w.door && doorSeen(map, seen.polygons, w))
          .map(({ id, x1, y1, x2, y2, open, locked }) => ({ id, x1, y1, x2, y2, open, locked })),
        wall_draft: { status: '', error: '', notes: '' },
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
        image_key: seen.key,
        can_edit: false,
      };
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
          m.wall_draft = { ...m.wall_draft, status: 'failed', error: 'The server restarted while the AI was drafting walls. Try again.' };
        }, { reason: 'wall draft interrupted' });
      }
    },
  };
  return maps;
}
