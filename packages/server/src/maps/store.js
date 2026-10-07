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
import { normalizeMap, isFogged, healthOf } from '@dndapp/shared/map.js';
import { fogKey } from './image.js';
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

export function createMaps({ db, archive, store }) {
  const events = new EventEmitter();
  events.setMaxListeners(0);

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
     * @param {{ name: string, named?: boolean, buf: Buffer, ext: 'png'|'jpg'|'webp', type: string, width: number, height: number, by: number }} input
     */
    create(campaignId, { name, named = false, buf, ext, type, width, height, by }) {
      const c = store.getCampaign(campaignId);
      const id = newMapId();
      const file = `image.${ext}`;
      archive.saveMapImage(c.slug, id, file, buf);
      const doc = normalizeMap({ name, named, image: { file, type, width, height }, shown: false, reading: { status: 'pending' } });
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
     * Players: only shown maps; no AI description or notes; no hidden tokens,
     * and none under the fog except their own; NPCs' and enemies' hit points
     * only as how hurt they look. `image_key` changes when their image does.
     */
    view(map, { role, userId }) {
      if (!map || map.removed) return null;
      const out = { ...map };
      delete out.campaign_id;
      if (role === 'dm') return { ...out, image_key: 'dm', can_edit: true };
      if (!map.shown) return null;
      return {
        ...out,
        description: '',
        reading: { status: map.reading.status, error: '', notes: '' },
        tokens: map.tokens
          .filter((t) => t.user_id === userId || (!t.hidden && !isFogged(map, t.x, t.y)))
          .map((t) => (t.kind === 'pc' ? t : { ...t, hp: null, health: healthOf(t.hp) })),
        image_key: fogKey(map),
        can_edit: false,
      };
    },

    /** Reads cut short by a restart can't finish; say so, so the DM can run them again. */
    failInterrupted() {
      for (const r of db.prepare("SELECT * FROM maps WHERE json_extract(data, '$.reading.status') = 'pending' AND json_extract(data, '$.removed') IS NOT 1").all()) {
        maps.change(r.campaign_id, r.id, (m) => {
          m.reading = { ...m.reading, status: 'failed', error: 'The server restarted while reading this map. Read it again.' };
        }, { reason: 'read interrupted' });
      }
    },
  };
  return maps;
}
