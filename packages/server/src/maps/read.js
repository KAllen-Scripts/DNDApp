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
import { MAP_KINDS, UNITS, MAX_WALLS, MAX_LIGHTS, normalizeGrid, normalizeScale, arcThrough, circlePoints } from '@dndapp/shared/map.js';

const AI_LONG_SIDE = 2000;
const DETECT_LONG_SIDE = 3000; // big enough to measure, small enough to take ~1s

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
     * correct: { walls: [{ x1, y1, x2, y2, door, kind, group? }] in image
     * pixels, lights, terrain, notes }. kind 'low' is an obstacle: seen over,
     * not crossed. The pieces of one curved wall share a `group` (local to
     * this draft; the caller gives each its own id).
     *
     * Thorough on purpose (maps are set up once): the AI sees the map with
     * a ruler round it (so it reads positions off it rather than guessing),
     * drafts, then checks its draft drawn over the map and corrects it. A big
     * map is checked in close-ups (up to 3 × 3), each with its own ruler in
     * the whole map's positions, so it sees the detail. Round walls come back
     * as arcs and circles, drawn as many short pieces. The server then tidies
     * the straight walls: nearly level or upright ones are straightened, ends
     * that nearly meet are joined, and on a map with a grid, ends close to a
     * grid corner or line are put on it.
     *
     * `onProgress` hears how far it has got, so the DM can see it working:
     * { step: 'tracing' }, then { step: 'checking', parts, parts_done } as
     * each part's check comes back, then { step: 'tidying' }.
     */
    async walls({ buf, width, height, grid = null, campaignId, userId, onProgress = () => {} }) {
      const progress = (p) => {
        try {
          onProgress(p);
        } catch {
          // Only news; never stops the drafting.
        }
      };
      progress({ step: 'tracing' });
      const full = await sharp(buf).rotate().flatten({ background: '#ffffff' }).png().toBuffer();
      const overview = await withRuler(full, WHOLE, { width, height });
      const ask = (purpose, system, prompt, image) => llm.structured({
        task: 'walls',
        purpose,
        campaignId,
        userId,
        system,
        attachments: [{ type: 'image', media_type: 'image/jpeg', data: image.toString('base64') }],
        prompt,
        schema: WallsOut,
      });
      const size = `(the original is ${width} × ${height} pixels)`;
      const draft = WallsOut.parse(await ask('map:walls', WALLS_SYSTEM, `Trace the walls and doors on this map ${size}. Read positions off the ruler round it: 0 to 1000 across (x, left to right) and 0 to 1000 down (y, top to bottom) of the map itself, whatever its shape.`, overview.buf));
      const notes = [draft.notes];

      // Check the draft: the whole map at once, or in close-ups for a big one.
      const cols = Math.min(3, Math.ceil(width / CHECK_TILE));
      const rows = Math.min(3, Math.ceil(height / CHECK_TILE));
      const tiles = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const core = { x0: (1000 * c) / cols, x1: (1000 * (c + 1)) / cols, y0: (1000 * r) / rows, y1: (1000 * (r + 1)) / rows };
          // Close-ups overlap a little, so a wall on the edge of one is seen whole in the next.
          const px = cols > 1 ? 60 / cols : 0;
          const py = rows > 1 ? 60 / rows : 0;
          tiles.push({ core, view: { x0: Math.max(0, core.x0 - px), x1: Math.min(1000, core.x1 + px), y0: Math.max(0, core.y0 - py), y1: Math.min(1000, core.y1 + py) } });
        }
      }
      const many = tiles.length > 1;
      let failed = 0;
      let partsDone = 0;
      progress({ step: 'checking', parts: tiles.length, parts_done: 0 });
      const checked = await Promise.all(tiles.map(async ({ core, view }) => {
        const out = await checkPart({ core, view });
        progress({ step: 'checking', parts: tiles.length, parts_done: ++partsDone });
        return out;
      }));
      async function checkPart({ core, view }) {
        try {
          const ruled = many ? await withRuler(full, view, { width, height }) : overview;
          const part = many
            ? `This is a close-up of part of the map ${size}: from ${Math.round(view.x0)} to ${Math.round(view.x1)} across and ${Math.round(view.y0)} to ${Math.round(view.y1)} down. The ruler round it gives the whole map's positions; use those.`
            : `This is the same map ${size}.`;
          const res = WallsOut.safeParse(await ask(
            'map:walls-check',
            `${WALLS_SYSTEM}\n\n${CHECK_SYSTEM}`,
            `${part} The first draft is drawn over it: walls in red, obstacles in green, curved walls in orange, doors in blue. Here is that draft as data:\n<draft>${JSON.stringify(draft)}</draft>\nCorrect it and give the whole corrected tracing${many ? ' of everything in this part (a wall that runs out of it can stop at its edge or carry on)' : ''}, not just the changes, in the whole map's 0 to 1000 positions.`,
            await withDraft(ruled, draft),
          ));
          if (res.success) return { core, out: res.data };
        } catch {
          // Fall back on the draft here.
        }
        failed++;
        return { core, out: draft };
      }
      if (failed) notes.push(failed === tiles.length ? "The AI's check of its draft failed, so this is its first draft." : `The AI's check failed for ${failed} of ${tiles.length} parts of the map; those parts are its first draft.`);
      if (failed < tiles.length) notes.splice(0, 1, ...checked.filter((x) => x.out !== draft).map((x) => x.out.notes));

      progress({ step: 'tidying' });
      // Each part keeps what lies in it (by its middle), so overlaps don't double up.
      const keep = (core) => (p) => p.x >= core.x0 && (p.x < core.x1 || core.x1 === 1000) && p.y >= core.y0 && (p.y < core.y1 || core.y1 === 1000);
      const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const px = (p) => ({ x: (Math.min(1000, Math.max(0, p.x)) / 1000) * width, y: (Math.min(1000, Math.max(0, p.y)) / 1000) * height });
      const lines = [];
      const lights = [];
      let group = 0;
      const curve = (pts, kind) => {
        group++;
        for (let i = 1; i < pts.length; i++) lines.push({ a: { ...pts[i - 1] }, b: { ...pts[i] }, door: false, kind: kind === 'obstacle' ? 'low' : 'wall', curve: true, group: `c${group}` });
      };
      for (const { core, out } of checked) {
        const here = keep(core);
        for (const [list, kind] of [[out.walls, 'wall'], [out.obstacles, 'low']]) {
          for (const wall of list) {
            for (let i = 1; i < wall.points.length; i++) {
              if (here(mid(wall.points[i - 1], wall.points[i]))) lines.push({ a: px(wall.points[i - 1]), b: px(wall.points[i]), door: false, kind });
            }
          }
        }
        for (const d of out.doors) if (here(mid(d.from, d.to))) lines.push({ a: px(d.from), b: px(d.to), door: true });
        for (const cv of out.curves) if (here(cv.through[1])) curve(arcThrough(...cv.through.map(px)), cv.kind);
        for (const ci of out.circles) {
          if (!here(ci.center)) continue;
          const c = px(ci.center);
          const e = px(ci.edge);
          curve(circlePoints(c, Math.hypot(e.x - c.x, e.y - c.y)), ci.kind);
        }
        for (const l of out.lights) if (here(l)) lights.push(l);
      }
      tidyWalls(lines, { width, height, grid });
      const walls = lines
        .filter((l) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) >= 1)
        .slice(0, MAX_WALLS)
        .map((l) => ({ x1: l.a.x, y1: l.a.y, x2: l.b.x, y2: l.b.y, door: l.door, kind: l.kind ?? 'wall', ...(l.group ? { group: l.group } : {}) }));
      // Light sources on the picture, as the 5e light they give (in feet).
      const lit = lights.slice(0, MAX_LIGHTS).map((l) => ({ ...px(l), ...LIGHT_OF[l.kind] ?? LIGHT_OF.torch }));
      // Difficult terrain, as areas (areas cross close-ups, so from the whole map's tracing).
      const areas = many ? draft.difficult : checked[0].out.difficult;
      const terrain = areas.filter((a) => a.points.length >= 3).map((a) => ({ points: a.points.map((p) => px(p)).map(({ x, y }) => [x, y]) }));
      return { walls, lights: lit, terrain, notes: notes.filter(Boolean).join(' ') };
    },
  };
}

/** The whole map, in thousandths. */
const WHOLE = { x0: 0, x1: 1000, y0: 0, y1: 1000 };
/** Maps wider or taller than this (pixels) are checked in close-ups. */
const CHECK_TILE = 1800;
/** The band round the AI's copy that holds the ruler, in pixels of that copy. */
const RULER_BAND = 44;

/**
 * A part of the map (`view`, in thousandths of the whole map) as the AI sees
 * it, at most AI_LONG_SIDE on its long side, with a ruler round it in the
 * whole map's positions (ticks and numbers; faint magenta lines across at
 * the numbered ticks). Returns { buf (JPEG), w, h (the picture inside the band), view }.
 */
async function withRuler(full, view, { width, height }) {
  const left = Math.min(width - 1, Math.floor((view.x0 / 1000) * width));
  const top = Math.min(height - 1, Math.floor((view.y0 / 1000) * height));
  const cw = Math.max(1, Math.min(width - left, Math.ceil(((view.x1 - view.x0) / 1000) * width)));
  const ch = Math.max(1, Math.min(height - top, Math.ceil(((view.y1 - view.y0) / 1000) * height)));
  const inner = await sharp(full)
    .extract({ left, top, width: cw, height: ch })
    .resize({ width: AI_LONG_SIDE - 2 * RULER_BAND, height: AI_LONG_SIDE - 2 * RULER_BAND, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = inner.info;
  const B = RULER_BAND;
  const span = Math.max(view.x1 - view.x0, view.y1 - view.y0);
  const step = span > 600 ? 50 : span > 250 ? 25 : 10;
  const parts = [];
  const sides = [
    { from: view.x0, to: view.x1, at: (v) => B + ((v - view.x0) / (view.x1 - view.x0)) * w, across: true },
    { from: view.y0, to: view.y1, at: (v) => B + ((v - view.y0) / (view.y1 - view.y0)) * h, across: false },
  ];
  for (const side of sides) {
    for (let v = Math.ceil(side.from / step) * step; v <= side.to + 1e-9; v += step) {
      const q = side.at(v);
      const big = Math.round(v / step) % 2 === 0;
      const t = big ? 14 : 7;
      if (side.across) {
        parts.push(`<line x1="${q}" y1="${B - t}" x2="${q}" y2="${B}" /><line x1="${q}" y1="${B + h}" x2="${q}" y2="${B + h + t}" />`);
        if (big) parts.push(`<text x="${q}" y="${B - 17}" text-anchor="middle">${v}</text><text x="${q}" y="${B + h + 29}" text-anchor="middle">${v}</text><line class="across" x1="${q}" y1="${B}" x2="${q}" y2="${B + h}" />`);
      } else {
        parts.push(`<line x1="${B - t}" y1="${q}" x2="${B}" y2="${q}" /><line x1="${B + w}" y1="${q}" x2="${B + w + t}" y2="${q}" />`);
        if (big) parts.push(`<text x="${B - 3}" y="${q - 3}" text-anchor="end" font-size="11">${v}</text><text x="${B + w + 3}" y="${q - 3}" font-size="11">${v}</text><line class="across" x1="${B}" y1="${q}" x2="${B + w}" y2="${q}" />`);
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 2 * B}" height="${h + 2 * B}">
<style>line { stroke: #000; stroke-width: 2 } line.across { stroke: #ff00ff; stroke-width: 1; stroke-opacity: 0.35 } text { font: 13px sans-serif; fill: #000 }</style>
${parts.join('')}</svg>`;
  const out = await sharp({ create: { width: w + 2 * B, height: h + 2 * B, channels: 3, background: '#ffffff' } })
    .composite([{ input: inner.data, left: B, top: B }, { input: Buffer.from(svg), left: 0, top: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
  return { buf: out, w, h, view };
}

/** A ruled part of the map with a draft drawn over it: walls red, obstacles green, curves orange, doors blue. */
async function withDraft(ruled, out) {
  const B = RULER_BAND;
  const { view } = ruled;
  const pos = (p) => ({ x: B + ((p.x - view.x0) / (view.x1 - view.x0)) * ruled.w, y: B + ((p.y - view.y0) / (view.y1 - view.y0)) * ruled.h });
  const at = (p) => {
    const q = pos(p);
    return `${q.x},${q.y}`;
  };
  const poly = (pts, colour, placed = false) => `<polyline points="${pts.map((p) => (placed ? `${p.x},${p.y}` : at(p))).join(' ')}" fill="none" stroke="${colour}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
  // Arcs are worked out on the picture, as the server does in pixels (thousandths across and down aren't the same size).
  const curves = out.curves.map((cv) => poly(arcThrough(...cv.through.map(pos)), '#ff8c00', true));
  const circles = out.circles.map((ci) => {
    const c = pos(ci.center);
    const e = pos(ci.edge);
    return `<circle cx="${c.x}" cy="${c.y}" r="${Math.hypot(e.x - c.x, e.y - c.y)}" fill="none" stroke="#ff8c00" stroke-width="3" />`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ruled.w + 2 * B}" height="${ruled.h + 2 * B}">
${out.walls.map((wl) => poly(wl.points, '#ff1a1a')).join('')}${out.obstacles.map((o) => poly(o.points, '#16c60c')).join('')}${curves.join('')}${circles.join('')}${out.doors.map((d) => poly([d.from, d.to], '#1a4dff')).join('')}</svg>`;
  return sharp(ruled.buf).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).jpeg({ quality: 88 }).toBuffer();
}

/**
 * Tidy the AI's lines in place: straighten nearly level or upright straight
 * walls (within 4°), join ends that nearly meet (1% of the long side, or a
 * third of a square), and with a grid, put ends near a grid corner on it (or
 * onto the nearest grid line, for a wall that stops mid-square). Curved
 * walls (`curve`) aren't straightened or put on the grid.
 */
export function tidyWalls(lines, { width, height, grid = null }) {
  const tan = Math.tan((4 * Math.PI) / 180);
  for (const l of lines) {
    if (l.curve) continue;
    const dx = Math.abs(l.b.x - l.a.x);
    const dy = Math.abs(l.b.y - l.a.y);
    if (dy <= dx * tan) l.a.y = l.b.y = (l.a.y + l.b.y) / 2;
    else if (dx <= dy * tan) l.a.x = l.b.x = (l.a.x + l.b.x) / 2;
  }
  // A curve's own points stay where they are; only its two ends join other walls.
  const ends = lines.filter((l) => !l.curve).flatMap((l) => [l.a, l.b]);
  const curves = Map.groupBy(lines.filter((l) => l.curve), (l) => l.group);
  for (const pieces of curves.values()) ends.push(pieces[0].a, pieces.at(-1).b);
  joinEnds(lines, Math.max(Math.max(width, height) / 100, grid ? grid.size / 3 : 0), ends);
  if (!grid) return lines;
  const key = (p) => `${p.x},${p.y}`;
  // Ends joined by joinEnds have the same position: snap by position so they stay together; leave curves' points alone.
  const onCurve = new Set(lines.filter((l) => l.curve).flatMap((l) => [key(l.a), key(l.b)]));
  const near = (v, offset) => offset + Math.round((v - offset) / grid.size) * grid.size;
  const snapped = new Map();
  for (const p of lines.flatMap((l) => [l.a, l.b])) {
    const k = key(p);
    if (onCurve.has(k)) continue;
    if (!snapped.has(k)) {
      const gx = near(p.x, grid.x);
      const gy = near(p.y, grid.y);
      snapped.set(k, { x: Math.abs(gx - p.x) <= grid.size * 0.3 ? gx : p.x, y: Math.abs(gy - p.y) <= grid.size * 0.3 ? gy : p.y });
    }
    Object.assign(p, snapped.get(k));
  }
  return lines;
}

/** Move line ends that are within `tolerance` of each other onto the same point. */
export function joinEnds(lines, tolerance, ends = lines.flatMap((l) => [l.a, l.b])) {
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
  walls: z.array(z.object({ points: z.array(Point).min(2).describe('The wall as a line through these points, in order') }))
    .describe('Every straight wall, as lines along its middle (a wall with corners: one line through all its corners)'),
  curves: z.array(z.object({
    through: z.array(Point).length(3).describe('Where the curve starts, a point on it halfway along, and where it ends'),
    kind: z.enum(['wall', 'obstacle']),
  })).default([]).describe('Curved walls and curved obstacles (part of a round room, a bend in a cave, a curved cliff edge), each as an arc. A long or wavy curve as several arcs that join end to end.'),
  circles: z.array(z.object({ center: Point, edge: Point.describe('Any point on the circle'), kind: z.enum(['wall', 'obstacle']) })).default([])
    .describe('Whole round walls or obstacles: a round tower or room, a well, a round pillar big enough to hide behind'),
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
- Round and curved walls: never as a jagged or straight line. A whole round room or tower is a circle; part of one, a bend or a curved cave wall is an arc (curves) through its start, a point halfway along it and its end. Follow a long or wavy curve with several arcs end to end, each no more than a quarter turn. A doorway in a round wall: arcs up to each side of it, and a door across it.
- Doors and gates go in doors, across the doorway. Leave open archways and gaps open.
- Positions are from 0 to 1000 across and 0 to 1000 down the map. A ruler is drawn round the map (ticks every 50, numbers every 100) with faint magenta lines across it every 100: read positions off them, as exactly as you can. The ruler is not part of the map. The DM corrects your tracing afterwards, but every wall you place well saves them work.
- Straight walls on a battle map usually run along the edges of its grid squares.
- A map with no walls (open countryside, a region map) gets no walls.
- Difficult terrain: outline areas that are hard to walk through (shallow water, mud, rubble, dense undergrowth, scree). Not deep water or walls (those block).
- Lights: every light source drawn on the map (wall torches, braziers, campfires, hearths, lamps, candles, glowing crystals or runes), at its centre. The app lights the area around them when it's dark.`;

/** The light each kind of source gives (5e, in feet). */
const CHECK_SYSTEM = `Now you are checking a tracing against the map. Look along every wall on the map and compare:
- A wall drawn in the wrong place: move it onto the wall on the map. Read the ruler again for each end.
- A round or curved wall traced as a jagged or straight line: make it a circle or arcs that follow the curve.
- A wall on the map with no line over it, or a room left open where the map shows it closed: add it.
- A gap between two lines that meet on the map: make them share a point.
- A line where the map has no wall (a floor pattern, furniture, a shadow): remove it.
- A doorway: check it has a door (if a door is drawn) or is left open (an archway or gap). Doors that were traced as walls become doors.
- Lights and difficult terrain: keep the right ones, fix or add the rest.
Give the whole corrected tracing.`;

const LIGHT_OF = {
  candle: { bright: 5, dim: 5 },
  torch: { bright: 20, dim: 20 },
  lamp: { bright: 15, dim: 30 },
  brazier: { bright: 20, dim: 20 },
  fire: { bright: 20, dim: 20 },
  magic: { bright: 10, dim: 10 },
};
