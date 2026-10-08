/**
 * Handouts: a picture and/or some text the DM gives players (a letter, a
 * wanted poster, a riddle, a map scrap), to everyone or to chosen players.
 * Players only ever see the ones given to them; the DM sees them all.
 *
 * Source data, archive first: the picture is kept exactly as uploaded under
 * handouts/<id>/, and handouts/<id>/changes.jsonl gets the whole handout on
 * each change, so restore takes the last line. Removing a handout marks it
 * removed; the archive keeps it. The archivist reads new and changed
 * handouts between sessions (kb/updates.js).
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import sharp from 'sharp';
import { NotFoundError } from './store.js';
import { inspectPicture } from './characters/pictures.js';
import { localTime } from './kb/updates.js';

export const MAX_HANDOUT_TEXT = 20_000;
const SHOW_PX = 2000;
const CACHE_SIZE = 16;

export const isHandoutId = (id) => /^[a-f0-9]{10}$/.test(String(id));

/** A handout read from the database or the archive, with anything unknown dropped. */
export function normalizeHandout(h = {}) {
  const image = h.image && typeof h.image.file === 'string'
    ? { file: h.image.file, type: String(h.image.type), width: Number(h.image.width), height: Number(h.image.height) }
    : null;
  return {
    id: String(h.id),
    title: String(h.title ?? '').slice(0, 200),
    text: String(h.text ?? '').slice(0, MAX_HANDOUT_TEXT),
    image,
    // 'everyone' (everyone in the campaign, now and later) or a list of user ids.
    to: h.to === 'everyone' ? 'everyone' : Array.isArray(h.to) ? [...new Set(h.to.map(Number).filter(Number.isInteger))] : [],
    created_by: h.created_by ?? null,
    created_at: String(h.created_at ?? ''),
    updated_at: String(h.updated_at ?? h.created_at ?? ''),
    removed: !!h.removed,
  };
}

/** Whether someone may see a handout (the DM sees every one). */
export const canSeeHandout = (h, { role, userId }) => !h.removed && (role === 'dm' || h.to === 'everyone' || h.to.includes(userId));

export function createHandouts({ db, archive, store }) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const cache = new Map();

  const rows = (cid) => db.prepare('SELECT data FROM handouts WHERE campaign_id = ? ORDER BY created_at, id').all(cid).map((r) => normalizeHandout(JSON.parse(r.data)));

  function write(cid, h) {
    archive.appendHandout(store.getCampaign(cid).slug, h.id, h);
    db.prepare(
      `INSERT INTO handouts (id, campaign_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(h.id, cid, JSON.stringify(h), h.created_at, h.updated_at);
    events.emit('update', { campaign_id: cid, handout: h });
    return h;
  }

  const handouts = {
    events,

    get(cid, id) {
      if (!isHandoutId(id)) throw new NotFoundError('No such handout');
      const r = db.prepare('SELECT data FROM handouts WHERE id = ? AND campaign_id = ?').get(id, cid);
      if (!r) throw new NotFoundError('No such handout');
      return normalizeHandout(JSON.parse(r.data));
    },

    /** The handouts this person may see, newest first. */
    list: (cid, viewer) => rows(cid).filter((h) => canSeeHandout(h, viewer)).reverse(),

    /** What the page gets: no file names; image is { key, width, height }; `to` only for the DM. */
    view(h, { role }) {
      const out = {
        id: h.id,
        title: h.title,
        text: h.text,
        image: h.image ? { key: h.image.file.replace(/\.[^.]*$/, ''), width: h.image.width, height: h.image.height } : null,
        created_at: h.created_at,
        updated_at: h.updated_at,
      };
      if (role === 'dm') out.to = h.to;
      return out;
    },

    /** Give a handout: { title, text, to, picture?: Buffer }. */
    async create(cid, { title, text, to, picture }, { by }) {
      const id = crypto.randomBytes(5).toString('hex');
      let image = null;
      if (picture) {
        const meta = await inspectPicture(picture);
        const file = `picture-${crypto.randomBytes(3).toString('hex')}.${meta.ext}`;
        archive.saveHandoutImage(store.getCampaign(cid).slug, id, file, picture);
        image = { file, type: meta.type, width: meta.width, height: meta.height };
      }
      const now = new Date().toISOString();
      return write(cid, normalizeHandout({ id, title, text, image, to, created_by: by, created_at: now, updated_at: now }));
    },

    /** Change the title, text or who it's for: { title?, text?, to? }. */
    update(cid, id, fields) {
      const h = handouts.get(cid, id);
      if (h.removed) throw new NotFoundError('No such handout');
      return write(cid, normalizeHandout({ ...h, ...fields, updated_at: new Date().toISOString() }));
    },

    /** Take a handout back (everyone stops seeing it; the archive keeps it). */
    remove(cid, id) {
      const h = handouts.get(cid, id);
      if (h.removed) return h;
      return write(cid, { ...h, removed: true, updated_at: new Date().toISOString() });
    },

    /** The picture to show (made smaller if huge). */
    async image(cid, h) {
      if (!h.image) throw new NotFoundError('This handout has no picture');
      const file = archive.handoutImagePath(store.getCampaign(cid).slug, h.id, h.image.file);
      if (!cache.has(file)) {
        cache.set(file, await sharp(file).rotate().resize({ width: SHOW_PX, height: SHOW_PX, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer());
        if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
      }
      return { buf: cache.get(file), type: 'image/webp' };
    },

    /** Handouts given, changed or taken back in a time window, as text for the archivist. */
    forArchivist(cid, since, until) {
      const names = new Map(store.roster(cid).map((m) => [m.user_id, m.name]));
      const toText = (h) => (h.to === 'everyone' ? 'everyone' : h.to.map((id) => `user ${id} (${names.get(id) ?? '?'})`).join(', ') || 'nobody yet');
      return rows(cid)
        .filter((h) => h.updated_at > since && h.updated_at <= until)
        .map((h) => {
          const when = h.created_at > since ? `given="${localTime(h.created_at)}"` : `changed="${localTime(h.updated_at)}"`;
          const head = `<handout title="${h.title.replace(/"/g, "'")}" ${when} to="${toText(h)}"${h.removed ? ' removed="true"' : ''}>`;
          const body = h.removed
            ? 'The DM took this handout back. What it said is still what those players were shown.'
            : [h.text || '(no text)', h.image ? '(It has a picture, which you cannot see.)' : ''].filter(Boolean).join('\n');
          return `${head}\n${body}\n</handout>`;
        });
    },
  };
  return handouts;
}
