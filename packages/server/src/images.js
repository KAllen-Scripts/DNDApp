/**
 * Uploaded pictures: checking them, and the copies the page is sent. One set
 * of rules for maps, token and character pictures, creatures and handouts.
 */
import sharp from 'sharp';
import { BadRequestError } from './store.js';

const FORMATS = { png: { ext: 'png', type: 'image/png' }, jpeg: { ext: 'jpg', type: 'image/jpeg' }, webp: { ext: 'webp', type: 'image/webp' }, gif: { ext: 'gif', type: 'image/gif' } };
export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;
// A small file can claim a huge size and take gigabytes to open; real photos are well under these.
export const MAX_PICTURE_PIXELS = 100_000_000;
export const MAX_MAP_PIXELS = 250_000_000; // a big battle map; maps are only limited in bytes by the upload limit
export const TOKEN_PX = 256; // tokens are drawn small; this is sharp on a zoomed-in map

/**
 * Check an uploaded image and find its size as the browser will show it
 * (photos turned by their EXIF orientation are measured turned).
 * @returns {Promise<{ ext, type, width, height }>}
 */
async function inspect(buf, { formats, maxBytes, maxPixels, unreadable, wrongFormat, tooBig }) {
  if (!buf.length) throw new BadRequestError('The file is empty.');
  if (buf.length > maxBytes) throw new BadRequestError(tooBig);
  let meta;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw new BadRequestError(unreadable);
  }
  if (!formats.includes(meta.format)) throw new BadRequestError(wrongFormat);
  if (!(meta.width * meta.height <= maxPixels)) throw new BadRequestError('That picture has too many pixels. Use a smaller one.');
  const turned = (meta.orientation ?? 1) >= 5;
  return { ...FORMATS[meta.format], width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height };
}

/** A picture: a token, a character, a creature, a handout (PNG, JPEG, WebP or GIF, up to 10 MB). */
export const inspectPicture = (buf) => inspect(buf, {
  formats: ['png', 'jpeg', 'webp', 'gif'], maxBytes: MAX_PICTURE_BYTES, maxPixels: MAX_PICTURE_PIXELS,
  tooBig: 'That picture is too big. Use one under 10 MB.',
  unreadable: "That file isn't a picture that can be read. Use a PNG, JPEG, WebP or GIF.",
  wrongFormat: 'Use a PNG, JPEG, WebP or GIF picture.',
});

/** A map's image or another picture of it (PNG, JPEG or WebP; a PDF is drawn to PNG first). */
export const inspectMapImage = (buf) => inspect(buf, {
  formats: ['png', 'jpeg', 'webp'], maxBytes: Infinity, maxPixels: MAX_MAP_PIXELS,
  unreadable: "That file isn't an image that can be read. Import a PNG, JPEG, WebP or PDF.",
  wrongFormat: 'Import the map as a PNG, JPEG or WebP image, or a PDF.',
});

/**
 * Copies to send, made once and kept (a few dozen, the oldest dropped first):
 * a token-sized square cut around what stands out (usually a face), or the
 * picture made smaller when it's huge.
 */
export function createImageCache(size = 64) {
  const cache = new Map();
  const cached = async (key, make) => {
    if (!cache.has(key)) {
      cache.set(key, await make());
      if (cache.size > size) cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  };
  return {
    /** The square copy for a token, as WebP. */
    square: (file) => cached(`${file}:square`, () => sharp(file).rotate().resize({ width: TOKEN_PX, height: TOKEN_PX, fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 88 }).toBuffer()),
    /** At most `px` on each side, as WebP. */
    shrunk: (file, px) => cached(`${file}:${px}`, () => sharp(file).rotate().resize({ width: px, height: px, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer()),
  };
}
