/**
 * A list the DM keeps for a campaign, stored like creatures.js: one row per
 * entry with its JSON, and archive first, the whole entry on each change in
 * <folder>/<id>/changes.jsonl (restore takes the last line), with pictures
 * kept exactly as uploaded beside it. Removing one only marks it removed.
 * Used for items (items.js) and merchants (merchants.js).
 */
import crypto from 'node:crypto';
import { NotFoundError, BadRequestError } from './store.js';
import { inspectPicture } from './images.js';

export const isLibraryId = (id) => /^[a-f0-9]{10}$/.test(String(id));
export const newLibraryId = () => crypto.randomBytes(5).toString('hex');

/**
 * @param {object} opts
 * @param {'items' | 'merchants'} opts.folder  the table and the archive folder
 * @param {(x: object) => object} opts.normalize
 * @param {string} opts.noun  for messages ("item")
 * @param {number} opts.max  how many a campaign may keep
 * @param {(entry: object, cid: number) => void} [opts.onWrite]  after each change
 */
export function createLibrary({ db, archive, store, folder, normalize, noun, max, onWrite = () => {} }) {
  const rows = (cid) => db.prepare(`SELECT data FROM ${folder} WHERE campaign_id = ? ORDER BY created_at, id`).all(cid).map((r) => normalize(JSON.parse(r.data)));

  function write(cid, x) {
    archive.appendLibrary(store.getCampaign(cid).slug, folder, x.id, x);
    db.prepare(
      `INSERT INTO ${folder} (id, campaign_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(x.id, cid, JSON.stringify(x), x.created_at, x.updated_at);
    onWrite(x, cid);
    return x;
  }

  const lib = {
    write: (cid, x) => write(cid, normalize(x)),

    /** One by id; `removed` ones too when asked (a merchant still sells an item taken out of the list). */
    get(cid, id, { removed = false } = {}) {
      if (!isLibraryId(id)) throw new NotFoundError(`No such ${noun}`);
      const r = db.prepare(`SELECT data FROM ${folder} WHERE id = ? AND campaign_id = ?`).get(id, cid);
      const x = r && normalize(JSON.parse(r.data));
      if (!x || (x.removed && !removed)) throw new NotFoundError(`No such ${noun}`);
      return x;
    },

    /** Several by id (removed ones included), as a Map; unknown ids are left out. */
    many(cid, ids) {
      const out = new Map();
      for (const id of new Set(ids)) {
        try {
          out.set(id, lib.get(cid, id, { removed: true }));
        } catch { /* gone */ }
      }
      return out;
    },

    /** All of them (not removed), by name. */
    list: (cid) => rows(cid).filter((x) => !x.removed).sort((a, b) => a.name.localeCompare(b.name)),

    /** Every campaign's (for start-up checks). */
    all: () => db.prepare(`SELECT campaign_id, data FROM ${folder}`).all().map((r) => ({ cid: r.campaign_id, entry: normalize(JSON.parse(r.data)) })),

    create(cid, fields, { by }) {
      if (rows(cid).filter((x) => !x.removed).length >= max) throw new BadRequestError(`You can keep at most ${max} ${noun}s.`);
      const now = new Date().toISOString();
      return write(cid, normalize({ ...fields, id: newLibraryId(), created_by: by, created_at: now, updated_at: now }));
    },

    update(cid, id, fields) {
      const x = lib.get(cid, id);
      return write(cid, normalize({ ...x, ...fields, id: x.id, created_at: x.created_at, updated_at: new Date().toISOString() }));
    },

    remove(cid, id) {
      const x = lib.get(cid, id);
      return write(cid, { ...x, removed: true, updated_at: new Date().toISOString() });
    },

    /** Keep a picture exactly as uploaded; returns the entry's `art`. */
    async savePicture(cid, id, buf) {
      const meta = await inspectPicture(buf);
      const file = `${noun}-${newLibraryId()}.${meta.ext}`;
      archive.saveLibraryImage(store.getCampaign(cid).slug, folder, id, file, buf);
      return { file, type: meta.type };
    },

    picturePath: (cid, x) => archive.libraryImagePath(store.getCampaign(cid).slug, folder, x.id, x.art.file),
  };
  return lib;
}

export const normalizeArt = (a) => (a && typeof a.file === 'string' && /^[\w.-]{1,80}$/.test(a.file) ? { file: a.file, type: String(a.type ?? '') } : null);
export const pictureKey = (art) => (art ? art.file.replace(/\.[^.]*$/, '') : null);
