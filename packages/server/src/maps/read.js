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
import { MAP_KINDS, UNITS, MAX_WALLS, MAX_LIGHTS, normalizeGrid, normalizeScale } from '@dndapp/shared/map.js';
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

    /**
     * Draft the walls and doors on a map from its picture, for the DM to
     * correct: { walls: [{ x1, y1, x2, y2, door, kind }] in image pixels, notes }.
     * kind 'low' is an obstacle: seen over, not crossed.
     * The AI's positions are rough, so wall ends that nearly meet are joined
     * (gaps would let sight through).
     */
    async walls({ buf, width, height, campaignId, userId }) {
      const small = await sharp(buf)
        .rotate()
        .resize({ width: AI_LONG_SIDE, height: AI_LONG_SIDE, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 85 })
        .toBuffer();
      const out = await llm.structured({
        task: 'maps',
        purpose: 'map:walls',
        campaignId,
        userId,
        system: WALLS_SYSTEM,
        attachments: [{ type: 'image', media_type: 'image/jpeg', data: small.toString('base64') }],
        prompt: `Trace the walls and doors on this map. Give positions from 0 to 1000 across (x, left to right) and 0 to 1000 down (y, top to bottom) of the whole image, whatever its shape (the original is ${width} × ${height} pixels).`,
        schema: WallsOut,
      });
      const px = (p) => ({ x: (Math.min(1000, Math.max(0, p.x)) / 1000) * width, y: (Math.min(1000, Math.max(0, p.y)) / 1000) * height });
      const lines = [];
      for (const [list, kind] of [[out.walls, 'wall'], [out.obstacles, 'low']]) {
        for (const wall of list) {
          const pts = wall.points.map(px);
          for (let i = 1; i < pts.length; i++) lines.push({ a: pts[i - 1], b: pts[i], door: false, kind });
        }
      }
      for (const d of out.doors) lines.push({ a: px(d.from), b: px(d.to), door: true });
      joinEnds(lines, Math.max(width, height) / 100);
      const walls = lines
        .filter((l) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) >= 1)
        .slice(0, MAX_WALLS)
        .map((l) => ({ x1: l.a.x, y1: l.a.y, x2: l.b.x, y2: l.b.y, door: l.door, kind: l.kind ?? 'wall' }));
      // Light sources on the picture, as the 5e light they give (in feet).
      const lights = (out.lights ?? []).slice(0, MAX_LIGHTS).map((l) => ({ ...px(l), ...LIGHT_OF[l.kind] ?? LIGHT_OF.torch }));
      // Difficult terrain, as areas.
      const terrain = (out.difficult ?? []).filter((a) => a.points.length >= 3).map((a) => ({ points: a.points.map((p) => px(p)).map(({ x, y }) => [x, y]) }));
      return { walls, lights, terrain, notes: out.notes };
    },
  };
}

/** Move line ends that are within `tolerance` of each other onto the same point. */
export function joinEnds(lines, tolerance) {
  const ends = lines.flatMap((l) => [l.a, l.b]);
  const groups = [];
  for (const p of ends) {
    const g = groups.find((x) => Math.hypot(x.x - p.x, x.y - p.y) <= tolerance);
    if (g) {
      g.members.push(p);
      g.x = g.members.reduce((s, m) => s + m.x, 0) / g.members.length;
      g.y = g.members.reduce((s, m) => s + m.y, 0) / g.members.length;
    } else {
      groups.push({ x: p.x, y: p.y, members: [p] });
    }
  }
  for (const g of groups) {
    for (const m of g.members) {
      m.x = g.x;
      m.y = g.y;
    }
  }
  return lines;
}

const Point = z.object({ x: z.number(), y: z.number() });
const WallsOut = z.object({
  walls: z.array(z.object({ points: z.array(Point).min(2).describe('The wall as a line through these points, in order; a curved wall as several short straight pieces') }))
    .describe('Every wall, as lines along its middle'),
  obstacles: z.array(z.object({ points: z.array(Point).min(2) })).default([])
    .describe('Outlines of things you can see over but not walk through: buildings seen from above (their roofs), cliff edges, fences, deep water edges'),
  doors: z.array(z.object({ from: Point, to: Point })).describe('Each door or gate, from one side of the doorway to the other'),
  lights: z.array(z.object({ x: z.number(), y: z.number(), kind: z.enum(['candle', 'torch', 'lamp', 'brazier', 'fire', 'magic']) })).default([])
    .describe('Light sources drawn on the map: wall torches, braziers, campfires and hearths, lamps, candles, glowing magic'),
  difficult: z.array(z.object({ points: z.array(Point).min(3).describe('The outline, in order round the area') })).default([])
    .describe('Areas that are hard to move through: shallow water, mud, rubble, dense undergrowth, steep scree'),
  notes: z.string().describe("For the DM: anything you couldn't trace or are unsure of. Empty if nothing."),
});

const WALLS_SYSTEM = `You trace walls on maps a Dungeon Master imports into a D&D table app. The app uses them for line of sight: players only see what their token has a clear line to, so a wall you trace hides what is behind it, and a gap lets sight through.
- Walls: solid things a person can't see through: walls of rooms and towers you can see inside, castle and city walls, cave walls. Not floors, furniture, tables, rubble, trees or bushes.
- Obstacles: things you can see over but can't walk through: a building drawn as its roof (outline the roof all the way round), a cliff edge you look down from, a fence, the edge of deep water. They block movement, not sight.
- Follow each wall along its middle as a line through points. Make walls that meet share the same point, and close rooms all the way round except at doors and open doorways.
- Doors and gates go in doors, across the doorway. Leave open archways and gaps open.
- Positions are from 0 to 1000 across and 0 to 1000 down the whole image. Be as accurate as you can; the DM corrects them afterwards.
- A map with no walls (open countryside, a region map) gets no walls.
- Difficult terrain: outline areas that are hard to walk through (shallow water, mud, rubble, dense undergrowth, scree). Not deep water or walls (those block).
- Lights: every light source drawn on the map (wall torches, braziers, campfires, hearths, lamps, candles, glowing crystals or runes), at its centre. The app lights the area around them when it's dark.`;

/** The light each kind of source gives (5e, in feet). */
const LIGHT_OF = {
  candle: { bright: 5, dim: 5 },
  torch: { bright: 20, dim: 20 },
  lamp: { bright: 15, dim: 30 },
  brazier: { bright: 20, dim: 20 },
  fire: { bright: 20, dim: 20 },
  magic: { bright: 10, dim: 10 },
};
