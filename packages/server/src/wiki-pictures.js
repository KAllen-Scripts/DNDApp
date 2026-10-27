/**
 * The wiki's pictures (owner, 2026-10-21: "I really want the wiki to be more
 * visual… so we can add visual imagery and pictures"). The DM uploads them
 * (or pastes or drops them into the editor), or picks one the app already
 * has: a creature's, an item's, a merchant's, a map, a handout's picture or a
 * player's token. Either way the wiki keeps its own copy, so a page doesn't
 * change when the creature gets a new picture, and the copy is archived like
 * every upload: wiki/pictures/<id>.<ext> as it came, and a line in
 * wiki/pictures/pictures.jsonl. A map is copied made smaller (maps can be huge).
 *
 * Pictures are only files. Who may see one is decided by the page it's on
 * (src/wiki.js): the page's main picture, banner and gallery each say who
 * they're available to, and a picture in the text goes where its text goes.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { inspectPicture, createImageCache } from './images.js';
import { NotFoundError, BadRequestError } from './store.js';
import { isPictureId, wikiKey } from '@dndapp/shared/wiki.js';

/** The sizes the page is sent: a card or a gallery square, and the picture on the page. */
export const WIKI_PICTURE_PX = { thumb: 480, full: 1800 };
const SOURCE_THUMB_PX = 320;
const MAP_COPY_PX = 2400;

const cropBox = ({ x, y, w, h }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });

/**
 * A map picture (or a part of it: `crop` is { x, y, w, h } in the map's
 * pixels, kept inside the picture) no bigger than `px` on its longer side, as webp.
 */
export async function mapCrop(buf, crop, px) {
  let img = sharp(buf, { limitInputPixels: false }).rotate();
  if (crop) {
    const { width, height } = await sharp(buf, { limitInputPixels: false }).rotate().metadata();
    const c = cropBox(crop);
    const left = Math.min(c.x, width - 1);
    const top = Math.min(c.y, height - 1);
    img = sharp(await img.extract({ left, top, width: Math.max(1, Math.min(c.w, width - left)), height: Math.max(1, Math.min(c.h, height - top)) }).toBuffer());
  }
  return img.resize({ width: px, height: px, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
}
export const SOURCE_KINDS = ['creature', 'item', 'merchant', 'map', 'handout', 'token'];

export function createWikiPictures({ archive, store, creatures, items, merchants, maps, handouts, pictures }) {
  const images = createImageCache(96);
  // Per campaign: id -> record. Read from the archive the first time it's needed (it's the source).
  const known = new Map();

  const slug = (cid) => store.getCampaign(cid).slug;
  const all = (cid) => {
    const s = slug(cid);
    if (!known.has(s)) known.set(s, new Map(archive.readWikiPictures(s).filter((r) => isPictureId(r?.id)).map((r) => [r.id, r])));
    return known.get(s);
  };

  async function keep(cid, buf, { by, name = '', from = null }) {
    const meta = await inspectPicture(buf);
    const id = crypto.randomBytes(5).toString('hex');
    const record = { id, file: `${id}.${meta.ext}`, type: meta.type, width: meta.width, height: meta.height, name: String(name).slice(0, 120), from, created_by: by, created_at: new Date().toISOString() };
    archive.saveWikiPicture(slug(cid), record.file, buf);
    archive.appendWikiPicture(slug(cid), record);
    all(cid).set(id, record);
    return record;
  }

  /** The file behind something else in the app that has a picture, with its name, or null. */
  function sourceFile(cid, kind, id) {
    const s = slug(cid);
    try {
      if (kind === 'creature') {
        const c = creatures.get(cid, id);
        return c.art ? { path: creatures.picturePath(cid, c), name: c.name } : null;
      }
      if (kind === 'item' || kind === 'merchant') {
        const lib = kind === 'item' ? items : merchants;
        const x = lib.get(cid, id);
        return x.art ? { path: lib.picturePath(cid, x), name: x.name } : null;
      }
      if (kind === 'map') return { path: maps.imagePath(cid, id).path, name: maps.get(cid, id).name, map: true };
      if (kind === 'handout') {
        const h = handouts.get(cid, id);
        return !h.removed && h.image ? { path: archive.handoutImagePath(s, h.id, h.image.file), name: h.title } : null;
      }
      if (kind === 'token') {
        const m = store.roster(cid).find((x) => String(x.user_id) === String(id) && x.role === 'player');
        const token = m && pictures.get(cid, m.user_id).token;
        return token ? { path: archive.characterImagePath(s, m.user_id, token.file), name: m.character_name || m.name } : null;
      }
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
    return null;
  }

  const wp = {
    /** Every picture the wiki has, newest first: { id, width, height, name, from }. */
    list: (cid) => [...all(cid).values()].reverse().map(({ id, width, height, name, from }) => ({ id, width, height, name, from })),

    has: (cid, id) => isPictureId(id) && all(cid).has(id),

    get(cid, id) {
      const r = isPictureId(id) && all(cid).get(id);
      if (!r) throw new NotFoundError('No such picture');
      return r;
    },

    /** A picture the DM uploaded, pasted or dropped. Kept exactly as it came. */
    upload: (cid, buf, { by, name }) => keep(cid, buf, { by, name }),

    /** A copy of a picture the app already has, for the wiki: { kind, id }. */
    async copy(cid, { kind, id, crop = null }, { by }) {
      if (!SOURCE_KINDS.includes(kind)) throw new BadRequestError('No such kind of picture.');
      const src = sourceFile(cid, kind, String(id));
      if (!src || !fs.existsSync(src.path)) throw new NotFoundError('That has no picture.');
      let buf = fs.readFileSync(src.path);
      // A map can be enormous: the wiki keeps a smaller copy. Anything that isn't a picture the wiki takes is turned into one.
      if (src.map) buf = await mapCrop(buf, crop, MAP_COPY_PX);
      return keep(cid, buf, { by, name: src.name, from: { kind, id: String(id), name: src.name, ...(src.map && crop ? { crop: cropBox(crop) } : {}) } });
    },

    /** What the page gets to show: smaller copies, made on the server ('thumb' or 'full'). */
    async image(cid, id, size = 'full') {
      const r = wp.get(cid, id);
      return { buf: await images.shrunk(archive.wikiPicturePath(slug(cid), r.file), WIKI_PICTURE_PX[size] ?? WIKI_PICTURE_PX.full), type: 'image/webp' };
    },

    /** Everything in the app with a picture the DM could use: [{ kind, id, name }]. */
    sources(cid) {
      const out = [];
      for (const c of creatures.list(cid)) if (c.art) out.push({ kind: 'creature', id: c.id, name: c.name });
      for (const x of items.list(cid)) if (x.art) out.push({ kind: 'item', id: x.id, name: x.name });
      for (const x of merchants.list(cid)) if (x.art) out.push({ kind: 'merchant', id: x.id, name: x.name });
      for (const m of maps.list(cid)) out.push({ kind: 'map', id: m.id, name: m.name });
      for (const h of handouts.list(cid, { role: 'dm' })) if (h.image) out.push({ kind: 'handout', id: h.id, name: h.title });
      for (const m of store.roster(cid)) if (m.role === 'player' && pictures.get(cid, m.user_id).token) out.push({ kind: 'token', id: String(m.user_id), name: m.character_name || m.name });
      return out;
    },

    /** A small copy of one of those, for the DM's chooser. */
    async sourceThumb(cid, kind, id) {
      const src = SOURCE_KINDS.includes(kind) && sourceFile(cid, kind, String(id));
      if (!src || !fs.existsSync(src.path)) throw new NotFoundError('That has no picture.');
      return { buf: await images.shrunk(src.path, SOURCE_THUMB_PX), type: 'image/webp' };
    },

    /**
     * Something in the app with a picture and one of these names (a new page
     * about "Goblin King" and the DM's creature "Goblin King"), or null. No AI:
     * names are matched as they're written. Players' tokens are left out (a
     * page about a player character is the DM's to illustrate).
     */
    match(cid, names) {
      const keys = new Set(names.map(wikiKey).filter((k) => k.length > 2));
      if (!keys.size) return null;
      return wp.sources(cid).find((s) => s.kind !== 'token' && keys.has(wikiKey(s.name))) ?? null;
    },
  };
  return wp;
}
