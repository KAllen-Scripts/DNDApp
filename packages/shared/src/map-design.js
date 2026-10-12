/**
 * Maps made in the app (the map creator, SPEC §6.6): the design the DM
 * edits, the changes the creator's tools make to it, how it's drawn, and
 * what it gives the map (walls, doors, obstacles, lights, difficult terrain).
 *
 * Plain JS with no imports: the server draws the map's picture with this on a
 * native canvas (@napi-rs/canvas), and the page's creator draws its preview
 * with the same code on a browser canvas. Only plain Canvas 2D calls are
 * used, so both draw the same. Every built-in floor and asset is drawn here
 * in code (original, so no licences to worry about); the DM can add their own
 * pictures as assets too (`u:<id>`, map-assets.js on the server).
 *
 * A design, in squares (one square = 5 ft):
 *   { cols, rows,
 *     floor: [string per row, one character per square: a FLOORS key, or '.' for nothing],
 *     walls: [{ x1, y1, x2, y2, type: 'wall'|'low'|'door', style: 'stone'|'wood' }]  (ends on half squares),
 *     assets: [{ id, a: ASSETS key or 'u:<id>', x, y (its middle), w, h (squares), rot (degrees), blocks: 'none'|'low'|'wall', light: bool }] }
 */

export const DESIGN_CELL = 70; // pixels per square in the map's picture
export const DESIGN_MIN = 4;
export const DESIGN_MAX = 60; // squares across or down (60 x 70 px = 4200 px)
export const MAX_DESIGN_WALLS = 1500;
export const MAX_DESIGN_ASSETS = 500;
export const EMPTY = '.';
export const WALL_TYPES = ['wall', 'low', 'door'];
export const WALL_STYLES = ['stone', 'wood'];
export const BLOCKS = ['none', 'low', 'wall'];

/** Floors, by the character that stands for them in `floor`. `difficult` floors become difficult terrain on the map. */
export const FLOORS = {
  s: { name: 'Stone tiles', base: '#7f7c75' },
  f: { name: 'Flagstones', base: '#8c857a' },
  w: { name: 'Wooden boards', base: '#8b5a2b' },
  c: { name: 'Cobblestones', base: '#6f6a62' },
  g: { name: 'Grass', base: '#5b8a3a' },
  d: { name: 'Dirt', base: '#7a5c3c' },
  a: { name: 'Sand', base: '#d2b77d' },
  r: { name: 'Cave floor', base: '#4f4a44' },
  n: { name: 'Snow', base: '#e6ecf0' },
  m: { name: 'Mud', base: '#5a4630', difficult: true },
  W: { name: 'Water', base: '#2f6f9a', difficult: true },
};

/**
 * The built-in assets. w, h: their size in squares when placed; shape: how
 * they block (a circle or their rectangle); layer: 0 lies on the floor (under
 * walls), 1 stands on it, 2 is overhead (tree tops); blocks: what they block
 * when placed (the DM can change it); light: what they light, in feet.
 */
export const ASSETS = {
  tree: { name: 'Tree', group: 'Outdoors', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none' },
  pine: { name: 'Pine tree', group: 'Outdoors', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none' },
  bush: { name: 'Bush', group: 'Outdoors', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none' },
  rock: { name: 'Rock', group: 'Outdoors', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low' },
  boulder: { name: 'Boulder', group: 'Outdoors', w: 2, h: 2, shape: 'round', layer: 1, blocks: 'wall' },
  log: { name: 'Fallen log', group: 'Outdoors', w: 3, h: 1, shape: 'rect', layer: 1, blocks: 'low' },
  campfire: { name: 'Campfire', group: 'Outdoors', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', light: { bright: 20, dim: 20 } },
  well: { name: 'Well', group: 'Outdoors', w: 2, h: 2, shape: 'round', layer: 1, blocks: 'low' },
  table: { name: 'Table', group: 'Furniture', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'none' },
  round_table: { name: 'Round table', group: 'Furniture', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'none' },
  chair: { name: 'Chair', group: 'Furniture', w: 0.6, h: 0.6, shape: 'rect', layer: 1, blocks: 'none' },
  bed: { name: 'Bed', group: 'Furniture', w: 1, h: 2, shape: 'rect', layer: 1, blocks: 'none' },
  chest: { name: 'Chest', group: 'Furniture', w: 1, h: 0.7, shape: 'rect', layer: 1, blocks: 'none' },
  barrel: { name: 'Barrel', group: 'Furniture', w: 0.8, h: 0.8, shape: 'round', layer: 1, blocks: 'low' },
  crate: { name: 'Crate', group: 'Furniture', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low' },
  bookshelf: { name: 'Bookshelf', group: 'Furniture', w: 2, h: 0.5, shape: 'rect', layer: 1, blocks: 'low' },
  rug: { name: 'Rug', group: 'Furniture', w: 3, h: 2, shape: 'rect', layer: 0, blocks: 'none' },
  pillar: { name: 'Pillar', group: 'Dungeon', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'wall' },
  statue: { name: 'Statue', group: 'Dungeon', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'wall' },
  altar: { name: 'Altar', group: 'Dungeon', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'low' },
  stairs: { name: 'Stairs', group: 'Dungeon', w: 2, h: 2, shape: 'rect', layer: 0, blocks: 'none' },
  brazier: { name: 'Brazier', group: 'Dungeon', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', light: { bright: 10, dim: 10 } },
  torch: { name: 'Wall torch', group: 'Dungeon', w: 0.5, h: 0.5, shape: 'round', layer: 1, blocks: 'none', light: { bright: 20, dim: 20 } },
};

const num = (v, min, max, fallback) => {
  const n = Number(v);
  return v === null || v === '' || v === undefined || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const half = (n) => Math.round(n * 2) / 2;
const round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
export const isAssetRef = (a) => Object.hasOwn(ASSETS, a) || /^u:[a-f0-9]{10}$/.test(String(a));
const isDesignId = (id) => /^[a-z0-9]{4,16}$/.test(String(id));
export const newDesignId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

/** An empty design (nothing on the floor yet). */
export function emptyDesign(cols = 30, rows = 20, fill = EMPTY) {
  return normalizeDesign({ cols, rows, floor: Array.from({ length: rows }, () => fill.repeat(cols)) });
}

/** Clean up a design from the page or the archive: sizes limited, unknown floors emptied, walls on half squares inside the map. */
export function normalizeDesign(d = {}) {
  const src = d && typeof d === 'object' ? d : {};
  const cols = Math.round(num(src.cols, DESIGN_MIN, DESIGN_MAX, 30));
  const rows = Math.round(num(src.rows, DESIGN_MIN, DESIGN_MAX, 20));
  const floor = [];
  for (let r = 0; r < rows; r += 1) {
    const line = typeof src.floor?.[r] === 'string' ? src.floor[r] : '';
    let out = '';
    for (let c = 0; c < cols; c += 1) out += Object.hasOwn(FLOORS, line[c]) ? line[c] : EMPTY;
    floor.push(out);
  }
  const walls = [];
  const seen = new Set();
  for (const w of Array.isArray(src.walls) ? src.walls : []) {
    if (!w || walls.length >= MAX_DESIGN_WALLS) continue;
    const x1 = half(num(w.x1, 0, cols, NaN));
    const y1 = half(num(w.y1, 0, rows, NaN));
    const x2 = half(num(w.x2, 0, cols, NaN));
    const y2 = half(num(w.y2, 0, rows, NaN));
    if (![x1, y1, x2, y2].every(Number.isFinite) || (x1 === x2 && y1 === y2)) continue;
    const key = [x1, y1, x2, y2].join() + w.type;
    const back = [x2, y2, x1, y1].join() + w.type;
    if (seen.has(key) || seen.has(back)) continue;
    seen.add(key);
    walls.push({ x1, y1, x2, y2, type: pick(w.type, WALL_TYPES, 'wall'), style: pick(w.style, WALL_STYLES, 'stone') });
  }
  const assets = [];
  const ids = new Set();
  for (const a of Array.isArray(src.assets) ? src.assets : []) {
    if (!a || !isAssetRef(a.a) || assets.length >= MAX_DESIGN_ASSETS) continue;
    const id = isDesignId(a.id) && !ids.has(a.id) ? String(a.id) : newDesignId();
    ids.add(id);
    const def = ASSETS[a.a];
    const w = round(num(a.w, 0.25, 20, def?.w ?? 1));
    const h = round(num(a.h, 0.25, 20, def?.h ?? w));
    assets.push({
      id,
      a: String(a.a),
      x: round(num(a.x, 0, cols, cols / 2)),
      y: round(num(a.y, 0, rows, rows / 2)),
      w,
      h,
      rot: Math.round((((num(a.rot, -100_000, 100_000, 0) % 360) + 360) % 360)),
      blocks: pick(a.blocks, BLOCKS, def?.blocks ?? 'none'),
      // Only built-in assets that give light can (a campfire, a brazier, a torch); on unless turned off.
      light: !!def?.light && a.light !== false,
    });
  }
  return { cols, rows, floor, walls, assets };
}

// ---------- what the creator's tools do (each returns a new design) ----------

/** Paint squares with a floor (or EMPTY): cells [[col, row], ...]. */
export function paintFloor(design, cells, ch) {
  const floor = design.floor.map((line) => line.split(''));
  for (const [c, r] of cells) if (floor[r] && c >= 0 && c < design.cols) floor[r][c] = Object.hasOwn(FLOORS, ch) ? ch : EMPTY;
  return { ...design, floor: floor.map((l) => l.join('')) };
}

/** The squares a brush of `size` covers around a square (1: just it; 2: it and the ones right and below; 3: a 3 x 3 round it). */
export function brushCells(col, row, size = 1) {
  const out = [];
  const from = -Math.floor((size - 1) / 2);
  for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) out.push([col + from + dx, row + from + dy]);
  return out;
}

/** Every square joined to (col, row) with the same floor, painted with `ch` (the bucket). */
export function fillFloor(design, col, row, ch) {
  const from = design.floor[row]?.[col];
  if (from == null || from === ch) return design;
  const cells = [];
  const seen = new Set();
  const stack = [[col, row]];
  while (stack.length) {
    const [c, r] = stack.pop();
    const k = r * design.cols + c;
    if (c < 0 || r < 0 || c >= design.cols || r >= design.rows || seen.has(k) || design.floor[r][c] !== from) continue;
    seen.add(k);
    cells.push([c, r]);
    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return paintFloor(design, cells, ch);
}

const collinear = (a, w) => {
  const cross = (px, py) => (a.x2 - a.x1) * (py - a.y1) - (a.y2 - a.y1) * (px - a.x1);
  return Math.abs(cross(w.x1, w.y1)) < 1e-9 && Math.abs(cross(w.x2, w.y2)) < 1e-9;
};

/**
 * Add a wall, fence or door. A door drawn over a wall cuts its doorway out of
 * it (so the wall doesn't block the door), and a wall drawn over a door goes
 * round it; a wall drawn the same as one already there changes nothing.
 */
export function addWall(design, wall) {
  const w = { x1: half(wall.x1), y1: half(wall.y1), x2: half(wall.x2), y2: half(wall.y2), type: pick(wall.type, WALL_TYPES, 'wall'), style: pick(wall.style, WALL_STYLES, 'stone') };
  if (w.x1 === w.x2 && w.y1 === w.y2) return design;
  let walls = design.walls;
  let added = [w];
  if (w.type === 'door') walls = walls.flatMap((x) => (x.type !== 'door' && collinear(w, x) ? cutOut(x, w) : [x]));
  // A wall drawn over a door already there leaves its doorway open.
  else for (const d of walls.filter((x) => x.type === 'door' && collinear(w, x))) added = added.flatMap((p) => cutOut(p, d));
  return normalizeDesign({ ...design, walls: [...walls, ...added] });
}

/** What's left of wall `x` once the stretch of `door` (on the same line) is cut out of it: 0, 1 or 2 pieces. */
function cutOut(x, door) {
  const dx = x.x2 - x.x1;
  const dy = x.y2 - x.y1;
  const len2 = dx * dx + dy * dy;
  const t = (px, py) => ((px - x.x1) * dx + (py - x.y1) * dy) / len2;
  let a = t(door.x1, door.y1);
  let b = t(door.x2, door.y2);
  if (a > b) [a, b] = [b, a];
  if (b <= 0 || a >= 1) return [x];
  const at = (s) => ({ x: x.x1 + dx * s, y: x.y1 + dy * s });
  const out = [];
  if (a > 0) out.push({ ...x, x2: at(a).x, y2: at(a).y });
  if (b < 1) out.push({ ...x, x1: at(b).x, y1: at(b).y });
  return out;
}

/** A room: its squares floored with `ch` and walled round (x1, y1, x2, y2 are corners, in squares). */
export function addRoom(design, { x1, y1, x2, y2 }, ch, style = 'stone') {
  const l = Math.max(0, Math.min(x1, x2));
  const r = Math.min(design.cols, Math.max(x1, x2));
  const t = Math.max(0, Math.min(y1, y2));
  const b = Math.min(design.rows, Math.max(y1, y2));
  if (r - l < 1 || b - t < 1) return design;
  const cells = [];
  for (let row = t; row < b; row += 1) for (let col = l; col < r; col += 1) cells.push([col, row]);
  let out = Object.hasOwn(FLOORS, ch) ? paintFloor(design, cells, ch) : design;
  for (const [a, c] of [[[l, t], [r, t]], [[r, t], [r, b]], [[r, b], [l, b]], [[l, b], [l, t]]]) {
    out = addWall(out, { x1: a[0], y1: a[1], x2: c[0], y2: c[1], type: 'wall', style });
  }
  return out;
}

/** How far a point is from a wall (in squares). */
export function distanceToDesignWall(w, x, y) {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const s = Math.max(0, Math.min(1, ((x - w.x1) * dx + (y - w.y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (w.x1 + dx * s), y - (w.y1 + dy * s));
}

/** Take away the wall nearest a point, if one is within `reach` squares. */
export function eraseWallAt(design, x, y, reach = 0.35) {
  let best = -1;
  let bestD = reach;
  design.walls.forEach((w, i) => {
    const d = distanceToDesignWall(w, x, y);
    if (d <= bestD) [best, bestD] = [i, d];
  });
  return best < 0 ? design : { ...design, walls: design.walls.filter((_, i) => i !== best) };
}

/** Is a point on an asset (inside its turned rectangle)? */
export function assetHit(a, x, y) {
  const r = (-a.rot * Math.PI) / 180;
  const dx = x - a.x;
  const dy = y - a.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= a.w / 2 && Math.abs(ly) <= a.h / 2;
}

/** The asset under a point (the one drawn on top), or null. */
export function assetAt(design, x, y) {
  const order = drawOrder(design.assets);
  for (let i = order.length - 1; i >= 0; i -= 1) if (assetHit(order[i], x, y)) return order[i];
  return null;
}

/** Make the map bigger or smaller (squares are added or cut at the right and bottom; walls and assets off it go). */
export function resizeDesign(design, cols, rows) {
  const c = Math.round(num(cols, DESIGN_MIN, DESIGN_MAX, design.cols));
  const r = Math.round(num(rows, DESIGN_MIN, DESIGN_MAX, design.rows));
  const floor = Array.from({ length: r }, (_, i) => (design.floor[i] ?? '').slice(0, c).padEnd(c, EMPTY));
  const inside = (x, y) => x <= c && y <= r;
  return normalizeDesign({
    cols: c,
    rows: r,
    floor,
    walls: design.walls.filter((w) => inside(w.x1, w.y1) && inside(w.x2, w.y2)),
    assets: design.assets.filter((a) => a.x <= c && a.y <= r),
  });
}

/** The user-uploaded assets a design uses ('u:<id>'). */
export const uploadedRefs = (design) => [...new Set(design.assets.map((a) => a.a).filter((a) => a.startsWith('u:')))];

// ---------- what a design gives the map ----------

const layerOf = (a) => ASSETS[a.a]?.layer ?? 1;
const drawOrder = (assets) => assets.map((a, i) => [a, i]).sort((p, q) => layerOf(p[0]) - layerOf(q[0]) || p[1] - q[1]).map((p) => p[0]);

/** An asset's outline, for blocking: a circle as 8 sides, or its turned rectangle (a little inside its picture), in squares. */
export function assetOutline(a) {
  const def = ASSETS[a.a];
  const rot = (a.rot * Math.PI) / 180;
  const turn = ([x, y]) => [a.x + x * Math.cos(rot) - y * Math.sin(rot), a.y + x * Math.sin(rot) + y * Math.cos(rot)];
  if ((def?.shape ?? 'rect') === 'round') {
    const r = (Math.min(a.w, a.h) / 2) * 0.85;
    return Array.from({ length: 8 }, (_, i) => turn([r * Math.cos((i * Math.PI) / 4 + Math.PI / 8), r * Math.sin((i * Math.PI) / 4 + Math.PI / 8)]));
  }
  const hw = (a.w / 2) * 0.9;
  const hh = (a.h / 2) * 0.9;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(turn);
}

/**
 * Rectangles (in squares) covering every square of the floors where moving
 * is hard (water, mud): runs along each row, joined with the same run in the
 * rows below.
 */
export function difficultAreas(design) {
  const open = new Map(); // `${start},${end}` -> rectangle still growing down
  const out = [];
  for (let r = 0; r < design.rows; r += 1) {
    const runs = [];
    let start = -1;
    for (let c = 0; c <= design.cols; c += 1) {
      const hard = c < design.cols && FLOORS[design.floor[r][c]]?.difficult;
      if (hard && start < 0) start = c;
      if (!hard && start >= 0) {
        runs.push([start, c]);
        start = -1;
      }
    }
    const next = new Map();
    for (const [a, b] of runs) {
      const k = `${a},${b}`;
      const rect = open.get(k);
      if (rect) {
        rect.y2 = r + 1;
        next.set(k, rect);
      } else {
        const fresh = { x1: a, y1: r, x2: b, y2: r + 1 };
        out.push(fresh);
        next.set(k, fresh);
      }
    }
    open.clear();
    for (const [k, v] of next) open.set(k, v);
  }
  return out;
}

/**
 * What the map gets from a design, in the picture's pixels: its size, the
 * grid (exact) and 5 ft squares, the walls, fences (obstacles) and doors
 * drawn, outlines of assets that block, the lights of assets that give light,
 * and difficult terrain from the floors.
 */
export function designToMap(design, cell = DESIGN_CELL) {
  const px = (v) => round(v * cell, 1);
  const walls = design.walls.map((w) => ({
    x1: px(w.x1), y1: px(w.y1), x2: px(w.x2), y2: px(w.y2),
    door: w.type === 'door',
    kind: w.type === 'low' ? 'low' : 'wall',
  }));
  for (const a of design.assets) {
    if (a.blocks === 'none') continue;
    const pts = assetOutline(a);
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      walls.push({ x1: px(p[0]), y1: px(p[1]), x2: px(q[0]), y2: px(q[1]), door: false, kind: a.blocks === 'low' ? 'low' : 'wall' });
    });
  }
  const lights = design.assets.filter((a) => a.light && ASSETS[a.a]?.light).map((a) => ({ x: px(a.x), y: px(a.y), ...ASSETS[a.a].light }));
  const terrain = difficultAreas(design).map((r) => ({ points: [[px(r.x1), px(r.y1)], [px(r.x2), px(r.y1)], [px(r.x2), px(r.y2)], [px(r.x1), px(r.y2)]] }));
  return {
    width: design.cols * cell,
    height: design.rows * cell,
    grid: { size: cell, x: 0, y: 0 },
    scale: { distance: 5, unit: 'ft', per: 'square' },
    walls,
    lights,
    terrain,
  };
}

// ---------- drawing (any Canvas 2D context) ----------

/** A small random number source that gives the same numbers for the same seed (so a map draws the same every time). */
export function seeded(...parts) {
  let s = 2166136261;
  for (const p of parts) s = Math.imul(s ^ (Number(p) | 0), 16777619) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A colour a little lighter (amount > 0) or darker (< 0). */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export const VOID_COLOUR = '#17161a';

/** One square of floor at (col, row), `cell` pixels across. */
export function drawFloorCell(ctx, ch, col, row, cell) {
  const x = col * cell;
  const y = row * cell;
  const f = FLOORS[ch];
  if (!f) {
    ctx.fillStyle = VOID_COLOUR;
    ctx.fillRect(x, y, cell, cell);
    return;
  }
  const rnd = seeded(col, row, ch.charCodeAt(0));
  // Built floors (tiles, boards, stones) vary square to square; natural ones barely, so they read as one ground.
  const jitter = (rnd() - 0.5) * ('sfwc'.includes(ch) ? 0.06 : 0.015);
  ctx.fillStyle = shade(f.base, jitter);
  ctx.fillRect(x, y, cell, cell);
  const specks = (n, size, spread) => {
    for (let i = 0; i < n; i += 1) {
      ctx.fillStyle = shade(f.base, (rnd() - 0.5) * spread);
      const s = size * (0.5 + rnd());
      ctx.fillRect(x + rnd() * (cell - s), y + rnd() * (cell - s), s, s);
    }
  };
  switch (ch) {
    case 's': { // square tiles with mortar lines
      ctx.strokeStyle = shade(f.base, -0.22);
      ctx.lineWidth = Math.max(1, cell * 0.04);
      ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, cell - ctx.lineWidth, cell - ctx.lineWidth);
      specks(6, cell * 0.04, 0.12);
      break;
    }
    case 'f': { // flagstones: four stones a square, offset on odd rows
      ctx.fillStyle = shade(f.base, -0.25);
      ctx.fillRect(x, y, cell, cell);
      const half = cell / 2;
      const off = row % 2 ? half / 2 : 0;
      for (let i = 0; i < 2; i += 1) {
        for (let j = -1; j < 2; j += 1) {
          const sx = x + j * half + off;
          const sy = y + i * half;
          const g = cell * 0.035;
          const l = Math.max(x, sx + g);
          const r = Math.min(x + cell, sx + half - g);
          if (r - l < 1) continue;
          ctx.fillStyle = shade(f.base, (rnd() - 0.5) * 0.14);
          ctx.fillRect(l, sy + g, r - l, half - 2 * g);
        }
      }
      break;
    }
    case 'w': { // boards across, four a square, with seams at random places
      const n = 4;
      const bh = cell / n;
      for (let i = 0; i < n; i += 1) {
        ctx.fillStyle = shade(f.base, (rnd() - 0.5) * 0.12);
        ctx.fillRect(x, y + i * bh, cell, bh);
        ctx.fillStyle = shade(f.base, -0.2);
        ctx.fillRect(x, y + i * bh + bh - Math.max(1, cell * 0.015), cell, Math.max(1, cell * 0.015));
        if (rnd() < 0.5) ctx.fillRect(x + rnd() * cell, y + i * bh, Math.max(1, cell * 0.015), bh);
        ctx.fillStyle = shade(f.base, 0.05);
        for (let k = 0; k < 2; k += 1) ctx.fillRect(x + rnd() * cell, y + i * bh + rnd() * bh * 0.8, cell * 0.2 * rnd(), Math.max(1, cell * 0.008));
      }
      break;
    }
    case 'c': { // cobbles: rounded stones in mortar
      ctx.fillStyle = shade(f.base, -0.2);
      ctx.fillRect(x, y, cell, cell);
      const k = 3;
      const s = cell / k;
      for (let i = 0; i < k; i += 1) {
        for (let j = 0; j < k; j += 1) {
          ctx.fillStyle = shade(f.base, (rnd() - 0.4) * 0.18);
          ctx.beginPath();
          ctx.ellipse(x + (j + 0.5) * s + (rnd() - 0.5) * s * 0.15, y + (i + 0.5) * s + (rnd() - 0.5) * s * 0.15, s * 0.42, s * 0.38, rnd() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'g': { // grass: blades and specks
      specks(10, cell * 0.05, 0.16);
      ctx.lineWidth = Math.max(1, cell * 0.02);
      for (let i = 0; i < 9; i += 1) {
        ctx.strokeStyle = shade(f.base, (rnd() - 0.3) * 0.2);
        const bx = x + rnd() * cell;
        const by = y + rnd() * cell;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + (rnd() - 0.5) * cell * 0.08, by - cell * (0.06 + rnd() * 0.06));
        ctx.stroke();
      }
      break;
    }
    case 'W': { // water: light ripples
      ctx.strokeStyle = shade(f.base, 0.12);
      ctx.lineWidth = Math.max(1, cell * 0.02);
      for (let i = 0; i < 3; i += 1) {
        const wx = x + rnd() * cell * 0.7;
        const wy = y + cell * (0.2 + rnd() * 0.6);
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.quadraticCurveTo(wx + cell * 0.08, wy - cell * 0.05, wx + cell * 0.16, wy);
        ctx.quadraticCurveTo(wx + cell * 0.24, wy + cell * 0.05, wx + cell * 0.3, wy);
        ctx.stroke();
      }
      break;
    }
    case 'n':
      specks(6, cell * 0.04, 0.08);
      break;
    default: // dirt, sand, mud, cave: specks
      specks(18, cell * 0.04, 0.2);
  }
}

/** Every square of a design's floor. */
export function drawFloor(ctx, design, cell) {
  for (let r = 0; r < design.rows; r += 1) for (let c = 0; c < design.cols; c += 1) drawFloorCell(ctx, design.floor[r][c], c, r, cell);
}

const WALL_LOOK = {
  stone: { body: '#2f2c29', top: '#5a5650', width: 0.26 },
  wood: { body: '#3b2616', top: '#6e4a2c', width: 0.18 },
};

/** The walls, fences and doorways. Walls are drawn in two passes so their joins look whole. Doors leave a doorway: the map draws the door itself, open or shut. */
export function drawWalls(ctx, design, cell) {
  ctx.lineCap = 'square';
  const solid = design.walls.filter((w) => w.type === 'wall');
  for (const pass of ['body', 'top']) {
    for (const w of solid) {
      const look = WALL_LOOK[w.style] ?? WALL_LOOK.stone;
      ctx.strokeStyle = look[pass];
      ctx.lineWidth = cell * look.width * (pass === 'top' ? 0.5 : 1);
      ctx.beginPath();
      ctx.moveTo(w.x1 * cell, w.y1 * cell);
      ctx.lineTo(w.x2 * cell, w.y2 * cell);
      ctx.stroke();
    }
  }
  for (const w of design.walls.filter((x) => x.type === 'low')) {
    // A fence: a rail with posts along it.
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    ctx.strokeStyle = '#5b3d22';
    ctx.lineWidth = cell * 0.06;
    ctx.beginPath();
    ctx.moveTo(w.x1 * cell, w.y1 * cell);
    ctx.lineTo(w.x2 * cell, w.y2 * cell);
    ctx.stroke();
    const posts = Math.max(1, Math.round(len * 2));
    ctx.fillStyle = '#3e2914';
    for (let i = 0; i <= posts; i += 1) {
      const px = (w.x1 + ((w.x2 - w.x1) * i) / posts) * cell;
      const py = (w.y1 + ((w.y2 - w.y1) * i) / posts) * cell;
      ctx.fillRect(px - cell * 0.06, py - cell * 0.06, cell * 0.12, cell * 0.12);
    }
  }
  for (const w of design.walls.filter((x) => x.type === 'door')) {
    // A threshold across the doorway.
    const look = WALL_LOOK[w.style] ?? WALL_LOOK.stone;
    ctx.strokeStyle = shade(look.top, 0.1);
    ctx.lineWidth = cell * look.width * 0.7;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(w.x1 * cell, w.y1 * cell);
    ctx.lineTo(w.x2 * cell, w.y2 * cell);
    ctx.stroke();
    ctx.lineCap = 'square';
  }
}

const circle = (ctx, x, y, r, fill) => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.fill();
};
const box = (ctx, x, y, w, h, fill, line = null, lw = 1) => {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (line) {
    ctx.strokeStyle = line;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);
  }
};

/**
 * One built-in asset, `w` x `h` pixels, centred on (0, 0) (the caller moves
 * and turns the context). Drawn from above, with a soft shadow.
 */
export function drawBuiltIn(ctx, key, w, h, seed = 1) {
  const rnd = seeded(seed, key.length);
  const m = Math.min(w, h);
  const shadow = (rx = w / 2, ry = h / 2) => {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(m * 0.06, m * 0.08, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  switch (key) {
    case 'tree':
    case 'bush': {
      shadow(w * 0.48, h * 0.48);
      const base = key === 'tree' ? '#3e6b2a' : '#4c7d34';
      const blobs = key === 'tree' ? 9 : 6;
      for (let i = 0; i < blobs; i += 1) {
        const a = (i / blobs) * Math.PI * 2;
        circle(ctx, Math.cos(a) * w * 0.24, Math.sin(a) * h * 0.24, m * (0.2 + rnd() * 0.06), shade(base, (rnd() - 0.5) * 0.1));
      }
      circle(ctx, 0, 0, m * 0.3, shade(base, 0.04));
      for (let i = 0; i < 6; i += 1) circle(ctx, (rnd() - 0.5) * w * 0.5, (rnd() - 0.5) * h * 0.5, m * 0.06, shade(base, 0.12));
      break;
    }
    case 'pine': {
      shadow(w * 0.46, h * 0.46);
      for (let i = 0; i < 3; i += 1) {
        const r = m * (0.48 - i * 0.13);
        ctx.fillStyle = shade('#2c5a37', i * 0.05);
        ctx.beginPath();
        for (let k = 0; k < 16; k += 1) {
          const a = (k / 16) * Math.PI * 2 + i * 0.2;
          const rr = k % 2 ? r * 0.72 : r;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      }
      circle(ctx, 0, 0, m * 0.05, '#5a3b20');
      break;
    }
    case 'rock':
    case 'boulder':
    case 'statue': {
      shadow(w * 0.46, h * 0.44);
      const base = key === 'statue' ? '#9a968e' : '#7b766e';
      ctx.fillStyle = base;
      ctx.beginPath();
      for (let k = 0; k < 9; k += 1) {
        const a = (k / 9) * Math.PI * 2;
        const rr = key === 'statue' ? 0.44 : 0.36 + rnd() * 0.12;
        ctx.lineTo(Math.cos(a) * w * rr, Math.sin(a) * h * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shade(base, -0.25);
      ctx.lineWidth = Math.max(1, m * 0.04);
      ctx.stroke();
      if (key === 'statue') {
        circle(ctx, 0, -h * 0.12, m * 0.13, shade(base, 0.12));
        ctx.fillStyle = shade(base, 0.06);
        ctx.fillRect(-w * 0.2, -h * 0.02, w * 0.4, h * 0.26);
      } else {
        circle(ctx, -w * 0.1, -h * 0.1, m * 0.12, shade(base, 0.1));
      }
      break;
    }
    case 'log': {
      shadow(w * 0.5, h * 0.35);
      box(ctx, -w / 2, -h * 0.3, w, h * 0.6, '#6b4a2b', '#3e2914', Math.max(1, m * 0.06));
      ctx.strokeStyle = '#4c3219';
      ctx.lineWidth = Math.max(1, m * 0.03);
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        const ly = (rnd() - 0.5) * h * 0.4;
        ctx.moveTo(-w * 0.45, ly);
        ctx.lineTo(w * (0.1 + rnd() * 0.3), ly);
        ctx.stroke();
      }
      ctx.fillStyle = '#a07a50';
      ctx.beginPath();
      ctx.ellipse(w / 2, 0, h * 0.12, h * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'campfire':
    case 'brazier': {
      if (key === 'brazier') {
        circle(ctx, 0, 0, m * 0.46, '#2b2b2b');
        circle(ctx, 0, 0, m * 0.38, '#474240');
      } else {
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2;
          circle(ctx, Math.cos(a) * m * 0.38, Math.sin(a) * m * 0.38, m * 0.1, '#77716a');
        }
        ctx.strokeStyle = '#4e321b';
        ctx.lineWidth = m * 0.1;
        ctx.beginPath();
        ctx.moveTo(-m * 0.25, -m * 0.2);
        ctx.lineTo(m * 0.25, m * 0.2);
        ctx.moveTo(m * 0.25, -m * 0.2);
        ctx.lineTo(-m * 0.25, m * 0.2);
        ctx.stroke();
      }
      circle(ctx, 0, 0, m * 0.26, '#e2581c');
      circle(ctx, 0, 0, m * 0.17, '#f59b2a');
      circle(ctx, 0, 0, m * 0.08, '#ffe27a');
      break;
    }
    case 'torch': {
      circle(ctx, 0, 0, m * 0.28, '#3a2a1a');
      circle(ctx, 0, 0, m * 0.2, '#f08a24');
      circle(ctx, 0, 0, m * 0.1, '#ffe27a');
      break;
    }
    case 'well': {
      shadow(w * 0.48, h * 0.48);
      circle(ctx, 0, 0, m * 0.48, '#76716a');
      for (let i = 0; i < 12; i += 1) {
        ctx.strokeStyle = '#4f4b45';
        ctx.lineWidth = Math.max(1, m * 0.02);
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * m * 0.34, Math.sin(a) * m * 0.34);
        ctx.lineTo(Math.cos(a) * m * 0.48, Math.sin(a) * m * 0.48);
        ctx.stroke();
      }
      circle(ctx, 0, 0, m * 0.32, '#173246');
      circle(ctx, -m * 0.08, -m * 0.08, m * 0.1, '#24506c');
      break;
    }
    case 'table':
    case 'altar': {
      shadow();
      const wood = key === 'table' ? '#7a4f2a' : '#8d8880';
      box(ctx, -w * 0.48, -h * 0.45, w * 0.96, h * 0.9, wood, shade(wood, -0.25), Math.max(1, m * 0.06));
      if (key === 'table') {
        ctx.strokeStyle = shade(wood, -0.12);
        ctx.lineWidth = Math.max(1, m * 0.025);
        for (let i = 1; i < 3; i += 1) {
          ctx.beginPath();
          ctx.moveTo(-w * 0.48, -h * 0.45 + (h * 0.9 * i) / 3);
          ctx.lineTo(w * 0.48, -h * 0.45 + (h * 0.9 * i) / 3);
          ctx.stroke();
        }
      } else {
        box(ctx, -w * 0.3, -h * 0.2, w * 0.6, h * 0.4, '#6d2a2a');
        circle(ctx, -w * 0.38, 0, m * 0.08, '#f3e3b0');
        circle(ctx, w * 0.38, 0, m * 0.08, '#f3e3b0');
      }
      break;
    }
    case 'round_table': {
      shadow(w * 0.46, h * 0.46);
      circle(ctx, 0, 0, m * 0.46, '#5e3b1f');
      circle(ctx, 0, 0, m * 0.42, '#7a4f2a');
      circle(ctx, 0, 0, m * 0.12, '#6a4424');
      break;
    }
    case 'chair': {
      shadow(w * 0.45, h * 0.45);
      box(ctx, -w * 0.4, -h * 0.4, w * 0.8, h * 0.8, '#7a4f2a', '#4a2f17', Math.max(1, m * 0.08));
      box(ctx, -w * 0.4, -h * 0.5, w * 0.8, h * 0.2, '#5e3b1f');
      break;
    }
    case 'bed': {
      shadow();
      box(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#5e3b1f');
      box(ctx, -w * 0.42, -h * 0.42, w * 0.84, h * 0.84, '#c9c1b3');
      box(ctx, -w * 0.42, -h * 0.05, w * 0.84, h * 0.47, '#7b2f34');
      box(ctx, -w * 0.32, -h * 0.38, w * 0.64, h * 0.18, '#efe9de');
      break;
    }
    case 'chest': {
      shadow();
      box(ctx, -w * 0.46, -h * 0.44, w * 0.92, h * 0.88, '#7a4a22', '#3a240f', Math.max(1, m * 0.08));
      ctx.fillStyle = '#b8902f';
      ctx.fillRect(-w * 0.46, -h * 0.06, w * 0.92, h * 0.12);
      box(ctx, -w * 0.07, -h * 0.12, w * 0.14, h * 0.24, '#d9b44a');
      break;
    }
    case 'barrel': {
      shadow(w * 0.46, h * 0.46);
      circle(ctx, 0, 0, m * 0.47, '#4a3019');
      circle(ctx, 0, 0, m * 0.4, '#8a5d33');
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = Math.max(1, m * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, m * 0.32, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'crate': {
      shadow();
      box(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.92, '#9a7244', '#5b3f20', Math.max(1, m * 0.07));
      ctx.strokeStyle = '#6b4c28';
      ctx.lineWidth = Math.max(1, m * 0.07);
      ctx.beginPath();
      ctx.moveTo(-w * 0.42, -h * 0.42);
      ctx.lineTo(w * 0.42, h * 0.42);
      ctx.stroke();
      break;
    }
    case 'bookshelf': {
      shadow();
      box(ctx, -w * 0.5, -h * 0.5, w, h, '#4a2f17');
      const books = 10;
      for (let i = 0; i < books; i += 1) {
        const colours = ['#7b2f34', '#2f4f7b', '#3d6b3a', '#8a6d2f', '#5a3a6b'];
        box(ctx, -w * 0.46 + (w * 0.92 * i) / books, -h * 0.3, (w * 0.92) / books - 1, h * 0.6, colours[Math.floor(rnd() * colours.length)]);
      }
      break;
    }
    case 'rug': {
      box(ctx, -w / 2, -h / 2, w, h, '#7b2f34');
      box(ctx, -w * 0.42, -h * 0.38, w * 0.84, h * 0.76, '#a54a3c');
      ctx.strokeStyle = '#d9b44a';
      ctx.lineWidth = Math.max(1, m * 0.03);
      ctx.strokeRect(-w * 0.36, -h * 0.3, w * 0.72, h * 0.6);
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.22);
      ctx.lineTo(w * 0.18, 0);
      ctx.lineTo(0, h * 0.22);
      ctx.lineTo(-w * 0.18, 0);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'pillar': {
      shadow(w * 0.46, h * 0.46);
      circle(ctx, 0, 0, m * 0.47, '#5d5953');
      circle(ctx, 0, 0, m * 0.38, '#8d8880');
      circle(ctx, -m * 0.08, -m * 0.08, m * 0.16, '#a39e95');
      break;
    }
    case 'stairs': {
      const steps = 6;
      for (let i = 0; i < steps; i += 1) {
        box(ctx, -w / 2, -h / 2 + (h * i) / steps, w, h / steps, shade('#8d8880', -i * 0.05), '#4f4b45', Math.max(1, m * 0.02));
      }
      break;
    }
    default:
      box(ctx, -w / 2, -h / 2, w, h, '#888');
  }
}

/** An asset that's missing its picture (an upload not loaded yet): a dashed box. */
function drawMissing(ctx, w, h) {
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash?.([6, 4]);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.setLineDash?.([]);
}

/** One placed asset. `images`: 'u:<id>' -> something drawImage takes. */
export function drawAsset(ctx, a, cell, images = new Map()) {
  ctx.save();
  ctx.translate(a.x * cell, a.y * cell);
  ctx.rotate((a.rot * Math.PI) / 180);
  const w = a.w * cell;
  const h = a.h * cell;
  if (ASSETS[a.a]) drawBuiltIn(ctx, a.a, w, h, parseInt(a.id, 36) || 1);
  else if (images.get(a.a)) ctx.drawImage(images.get(a.a), -w / 2, -h / 2, w, h);
  else drawMissing(ctx, w, h);
  ctx.restore();
}

/**
 * The whole map: the floor (unless `floor: false`, when the caller has drawn
 * it already), assets on the floor, walls, then standing and overhead assets.
 */
export function drawDesign(ctx, design, { cell = DESIGN_CELL, images = new Map(), floor = true } = {}) {
  if (floor) drawFloor(ctx, design, cell);
  const order = drawOrder(design.assets);
  for (const a of order) if (layerOf(a) === 0) drawAsset(ctx, a, cell, images);
  drawWalls(ctx, design, cell);
  for (const a of order) if (layerOf(a) > 0) drawAsset(ctx, a, cell, images);
}
