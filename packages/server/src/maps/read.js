/**
 * Reading an imported map: what the image is, and the measurements that make
 * it interactive (the grid tokens snap to, and the scale distances use).
 *
 * The AI looks at a smaller copy and says what kind of map it is, whether it
 * has a grid (roughly how many squares) and what its scale is. The AI's
 * square counts are only approximate, so where it sees a grid the server
 * measures it exactly from the image's pixels (detectGrid).
 */
import sharp from 'sharp';
import { z } from 'zod';
import { MAP_KINDS, UNITS, normalizeGrid, normalizeScale } from '@dndapp/shared/map.js';
import { BadRequestError } from '../store.js';

const FORMATS = { png: { ext: 'png', type: 'image/png' }, jpeg: { ext: 'jpg', type: 'image/jpeg' }, webp: { ext: 'webp', type: 'image/webp' } };
const AI_LONG_SIDE = 2000;
const DETECT_LONG_SIDE = 3000; // big enough to measure, small enough to take ~1s

/**
 * Check an uploaded image and find its size as the browser will show it
 * (photos turned by their EXIF orientation are measured turned).
 * @returns {Promise<{ ext, type, width, height }>}
 */
export async function inspectImage(buf) {
  let meta;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw new BadRequestError("That file isn't an image that can be read. Import a PNG, JPEG, WebP or PDF.");
  }
  const format = FORMATS[meta.format];
  if (!format) throw new BadRequestError('Import the map as a PNG, JPEG or WebP image, or a PDF.');
  const turned = (meta.orientation ?? 1) >= 5;
  return { ...format, width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height };
}

/** Find the repeat distance and offset of the strongest lines in an edge profile. */
function findPeriod(profile, { min, max }) {
  const n = profile.length;
  // Keep only what stands out from its neighbourhood (grid lines are sharp peaks).
  const w = 7;
  const p = profile.map((v, i) => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++, c++) s += profile[j];
    return Math.max(0, v - s / c);
  });
  // How strongly lines repeat every `period` pixels, at the best offset.
  const comb = (period) => {
    let best = { score: 0, offset: 0 };
    for (let offset = 0; offset < period; offset += 0.5) {
      let s = 0;
      let k = 0;
      for (let x = offset; x < n - 1; x += period, k++) {
        const i = Math.floor(x);
        s += Math.max(p[i], p[i + 1] ?? 0);
      }
      if (k >= 3 && s / k > best.score) best = { score: s / k, offset };
    }
    return best;
  };
  const lo = Math.max(4, Math.floor(min));
  const hi = Math.min(Math.floor(n / 3), Math.ceil(max));
  if (hi < lo) return null;
  let best = null;
  for (let period = lo; period <= hi; period++) {
    const c = comb(period);
    if (!best || c.score > best.score) best = { period, ...c };
  }
  if (!best) return null;
  // A multiple of the real period also lines up; prefer the smallest that scores nearly as well.
  const tune = (around, spread, step) => {
    let top = null;
    for (let period = Math.max(lo, around - spread); period <= around + spread; period += step) {
      const c = comb(period);
      if (!top || c.score > top.score) top = { period, ...c };
    }
    return top;
  };
  best = tune(best.period, 1.5, 0.05);
  for (let d = 6; d >= 2; d--) {
    if (best.period / d < lo) continue;
    const c = tune(best.period / d, 1, 0.05);
    if (c && c.score >= best.score * 0.8) {
      best = c;
      break;
    }
  }
  const background = p.reduce((a, b) => a + b, 0) / n;
  return { period: best.period, offset: best.offset, strength: background ? best.score / background : 0 };
}

/**
 * Measure a grid drawn on a map image. `columns` is the AI's rough count of
 * squares across, used to know where to look. Returns { size, x, y } in the
 * image's pixels, or null if no regular grid shows up.
 */
export async function detectGrid(buf, { columns = null } = {}) {
  const img = sharp(buf).rotate().greyscale();
  const meta = await sharp(buf).rotate().metadata();
  const turned = (meta.orientation ?? 1) >= 5;
  const fullWidth = turned ? meta.height : meta.width;
  const { data, info } = await img
    .resize({ width: DETECT_LONG_SIDE, height: DETECT_LONG_SIDE, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const at = (x, y) => data[(y * w + x) * channels];
  const cols = new Float64Array(w);
  const rows = new Float64Array(h);
  for (let y = 1; y < h; y++) {
    for (let x = 1; x < w; x++) {
      const v = at(x, y);
      cols[x] += Math.abs(v - at(x - 1, y));
      rows[y] += Math.abs(v - at(x, y - 1));
    }
  }
  const scale = fullWidth / w;
  // Where to look: around the AI's estimate, else anything from tiny squares to a few across.
  const guess = columns ? w / columns : null;
  const range = guess ? { min: guess * 0.7, max: guess * 1.4 } : { min: 8, max: Math.min(w, h) / 4 };
  const across = findPeriod(Array.from(cols), range);
  const down = findPeriod(Array.from(rows), across ? { min: across.period * 0.9, max: across.period * 1.1 } : range);
  // Grid lines stand far above the rest of the picture (measured: 18-68 for drawn grids, 4-6 for plain terrain).
  const good = (r) => r && r.strength >= 8;
  if (!good(across) && !good(down)) return null;
  // Squares are square: if both directions found something different, it isn't a grid.
  if (good(across) && good(down) && Math.abs(across.period - down.period) > 0.04 * across.period) return null;
  // Squares are square: use the clearer direction for the size, each direction for its own offset.
  const main = !good(down) || (good(across) && across.strength >= down.strength) ? across : down;
  const size = main.period;
  return normalizeGrid(
    {
      size: size * scale,
      x: (good(across) ? across.offset : 0) * scale,
      y: (good(down) ? down.offset : 0) * scale,
    },
    { width: fullWidth, height: turned ? meta.width : meta.height },
  );
}

const MapOut = z.object({
  readable: z.boolean().describe('false if this is not a map, plan or picture of terrain at all'),
  kind: z.enum(MAP_KINDS).describe('battle = a tactical encounter map; dungeon, building (floor plans), town, region, world; other'),
  name: z.string().describe('A short name for the map, from its title or labels if it has one, else a plain description ("Forest clearing")'),
  description: z.string().describe("Two or three sentences for the DM on the terrain: main areas, walls and doors, water, cover, difficult terrain. Only what's visible."),
  grid: z.object({
    visible: z.boolean().describe('true only if a regular square grid is drawn on the map'),
    columns: z.number().nullable().describe('Roughly how many squares across the whole width (null without a grid)'),
    rows: z.number().nullable().describe('Roughly how many squares down the whole height (null without a grid)'),
  }),
  scale: z.object({
    distance: z.number().nullable().describe('The distance from a scale bar, legend or label; null if the map gives none'),
    unit: z.enum(UNITS).nullable(),
    per: z.enum(['square', 'width']).nullable().describe('square: the distance is one grid square; width: the distance is the whole width of the image (convert from a scale bar)'),
  }),
  notes: z.string().describe("Anything you couldn't tell or are unsure of, for the DM. Empty if nothing."),
});

const SYSTEM = `You look at maps a Dungeon Master imports into a D&D table app. The app makes the map interactive: tokens snap to its grid and distances are measured with its scale. Report what is on the image, nothing more.
- Grid: say a grid is visible only if regular square grid lines (or a regular pattern of square tiles meant for movement) are drawn across the map. Count squares across the whole image width and height as well as you can; the server measures the exact size from the pixels.
- Scale: use a scale bar, legend or a label such as "1 square = 5 feet". For a scale bar, work out how much distance the whole image width covers and use per = "width". Don't guess a scale the map doesn't give (battle maps with a grid are assumed to be 5 ft per square by the app).
- Description: the terrain only, in plain words. Don't invent story, monsters or secrets.`;

export function createMapReader({ llm }) {
  return {
    /**
     * Read a map image. Returns the fields to set on the map: kind, name,
     * description, grid, scale and notes.
     */
    async read({ buf, width, height, campaignId, userId }) {
      const small = await sharp(buf)
        .rotate()
        .resize({ width: AI_LONG_SIDE, height: AI_LONG_SIDE, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 85 })
        .toBuffer();
      const out = await llm.structured({
        task: 'maps',
        purpose: 'map:read',
        campaignId,
        userId,
        system: SYSTEM,
        attachments: [{ type: 'image', media_type: 'image/jpeg', data: small.toString('base64') }],
        prompt: `Read this map. The original image is ${width} × ${height} pixels (you see a smaller copy).`,
        schema: MapOut,
      });
      if (!out.readable) {
        return { kind: 'other', name: '', description: '', grid: null, scale: null, notes: out.notes || "This doesn't look like a map." };
      }
      let grid = null;
      if (out.grid.visible) {
        grid = await detectGrid(buf, { columns: out.grid.columns });
        if (!grid && out.grid.columns) grid = normalizeGrid({ size: width / out.grid.columns, x: 0, y: 0 }, { width, height });
      }
      let scale = normalizeScale(out.scale);
      if (scale?.per === 'square' && !grid) scale = null;
      if (grid && !scale) scale = { distance: 5, unit: 'ft', per: 'square' };
      const notes = [out.notes, out.grid.visible && !grid ? "The AI saw a grid but it couldn't be measured; set the square size by hand." : '']
        .filter(Boolean)
        .join(' ');
      return { kind: out.kind, name: out.name, description: out.description, grid, scale, notes };
    },
  };
}
