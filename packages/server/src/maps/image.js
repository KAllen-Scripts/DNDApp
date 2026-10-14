/**
 * The map image as a player may see it. With fog of war on, the covered
 * parts are blacked out here on the server (and the parts seen before
 * dimmed), so the fog shows on every screen, whatever the page manages to
 * draw over it.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { FOG_MASK_FILL } from '@dndapp/shared/map.js';

const FOG_COLOUR = { r: 20, g: 17, b: 13 };
const CACHE_SIZE = 32;

/**
 * How dark the fog is at each point, as a greyscale SVG the size of the image
 * (white: covered, grey: seen before, black: clear). `mask` is from fogMask.
 * The shapes are painted in order straight onto a black background: no SVG
 * <mask>, which the image library draws many times slower.
 */
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${clips.join('')}</defs><rect width="${width}" height="${height}" fill="#000"/>${shapes}</svg>`;
}

/** The fog as a picture to lay over the map: the fog colour, as opaque as fogSvg is bright. */
async function fogLayer(image, mask) {
  const { width, height } = image;
  const alpha = await sharp(Buffer.from(fogSvg(image, mask))).extractChannel(0).raw().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: FOG_COLOUR } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

export function createPlayerImages() {
  const cache = new Map(); // `${map id}:${file}:${sight key}` -> Buffer

  return {
    /**
     * @param {{ mask: object[], key: string }} sight  what this player sees (sight.forPlayer)
     * @returns {Promise<Buffer>} the image file for a player, fog applied
     */
    async get(map, file, sight, type = map.image.type) {
      if (!sight.mask.length) return fs.readFileSync(file);
      const key = `${map.id}:${file}:${sight.key}`;
      if (cache.has(key)) return cache.get(key);
      let img = sharp(file).rotate().composite([{ input: await fogLayer(map.image, sight.mask), top: 0, left: 0 }]);
      img = type === 'image/png' ? img.png({ compressionLevel: 3 }) : type === 'image/webp' ? img.webp({ quality: 90, effort: 1 }) : img.jpeg({ quality: 90 });
      const buf = await img.toBuffer();
      cache.set(key, buf);
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
      return buf;
    },
  };
}
