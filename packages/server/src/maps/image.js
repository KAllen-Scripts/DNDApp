/**
 * The map image as a player may see it. With fog of war on, the covered
 * parts are blacked out here on the server, so the hidden parts of the map
 * never reach players' browsers (not even by opening the image itself).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';

const FOG_COLOUR = '#14110d';
const CACHE_SIZE = 8;

/** Changes whenever what players see of the image changes. */
export const fogKey = (map) =>
  map.fog?.enabled ? crypto.createHash('sha1').update(JSON.stringify(map.fog.shapes)).digest('hex').slice(0, 12) : 'clear';

/** The fog as an SVG the size of the image: dark where covered. */
export function fogSvg(map) {
  const { width, height } = map.image;
  const rects = map.fog.shapes
    .map((s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.op === 'reveal' ? 'black' : 'white'}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="white"/>${rects}</mask></defs><rect width="${width}" height="${height}" fill="${FOG_COLOUR}" mask="url(#m)"/></svg>`;
}

export function createPlayerImages() {
  const cache = new Map(); // `${map id}:${fog key}` -> Buffer

  return {
    /** @returns {Promise<Buffer>} the image file for a player, fog applied */
    async get(map, file) {
      if (!map.fog?.enabled) return fs.readFileSync(file);
      const key = `${map.id}:${fogKey(map)}`;
      if (cache.has(key)) return cache.get(key);
      let img = sharp(file).rotate().composite([{ input: Buffer.from(fogSvg(map)), top: 0, left: 0 }]);
      img = map.image.type === 'image/png' ? img.png() : map.image.type === 'image/webp' ? img.webp({ quality: 90 }) : img.jpeg({ quality: 90 });
      const buf = await img.toBuffer();
      cache.set(key, buf);
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
      return buf;
    },
  };
}
