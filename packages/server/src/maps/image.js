/**
 * The map image as a player may see it. With fog of war on, the covered
 * parts are blacked out here on the server, so the hidden parts of the map
 * never reach players' browsers (not even by opening the image itself).
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { FOG_MASK_FILL } from '@dndapp/shared/map.js';

const FOG_COLOUR = '#14110d';
const CACHE_SIZE = 32;

/** The fog as an SVG the size of the image: dark where covered, half dark where only seen before. `mask` is from fogMask. */
export function fogSvg(image, mask) {
  const { width, height } = image;
  const pts = (list) => list.map((p) => p.join(',')).join(' ');
  // A shape with a clip (a lit place, cut to what the token can see) is only drawn inside the clip.
  const clips = [];
  const shapes = mask
    .map((s) => {
      const clip = s.clip ? ` clip-path="url(#c${clips.push(`<clipPath id="c${clips.length}" clipPathUnits="userSpaceOnUse"><polygon points="${pts(s.clip)}"/></clipPath>`) - 1})"` : '';
      return s.points
        ? `<polygon points="${pts(s.points)}" fill="${FOG_MASK_FILL[s.fill]}"${clip}/>`
        : `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${FOG_MASK_FILL[s.fill]}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${clips.join('')}<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">${shapes}</mask></defs><rect width="${width}" height="${height}" fill="${FOG_COLOUR}" mask="url(#m)"/></svg>`;
}

export function createPlayerImages() {
  const cache = new Map(); // `${map id}:${sight key}` -> Buffer

  return {
    /**
     * @param {{ mask: object[], key: string }} sight  what this player sees (sight.forPlayer)
     * @returns {Promise<Buffer>} the image file for a player, fog applied
     */
    async get(map, file, sight, type = map.image.type) {
      if (!sight.mask.length) return fs.readFileSync(file);
      const key = `${map.id}:${file}:${sight.key}`;
      if (cache.has(key)) return cache.get(key);
      let img = sharp(file).rotate().composite([{ input: Buffer.from(fogSvg(map.image, sight.mask)), top: 0, left: 0 }]);
      img = type === 'image/png' ? img.png() : type === 'image/webp' ? img.webp({ quality: 90 }) : img.jpeg({ quality: 90 });
      const buf = await img.toBuffer();
      cache.set(key, buf);
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
      return buf;
    },
  };
}
