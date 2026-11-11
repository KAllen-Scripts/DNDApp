/**
 * Walls and line of sight (moved out of map.js, which re-exports it): walls
 * and doors, what a token sees, lights, the fog mask players get, snapping
 * to walls and squares, and measuring. Plain JS, used by the server and the page.
 */
import { distanceToWall, isFogged, isTokenId, MAX_WALLS, num, ownToken, pick, pxPerUnit, round, WALL_KINDS, WALL_SOURCES } from './map.js';
import { heightShadows } from './map-height.js';

// ---------- walls and line of sight ----------

/**
 * Walls: straight lines in image pixels that block sight (and players'
 * tokens). A door is a wall that can be open (blocks nothing) or closed,
 * and locked (players can't open it). A secret door looks like wall to
 * players until it's found (`revealed`: the DM revealed it, or it was
 * opened). An obstacle ('low') blocks only movement.
 */
export function normalizeWalls(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  for (const w of Array.isArray(list) ? list : []) {
    if (!w || !isTokenId(w.id) || seen.has(w.id) || out.length >= MAX_WALLS) continue;
    const x1 = num(w.x1, { min: 0, max: width, fallback: null });
    const y1 = num(w.y1, { min: 0, max: height, fallback: null });
    const x2 = num(w.x2, { min: 0, max: width, fallback: null });
    const y2 = num(w.y2, { min: 0, max: height, fallback: null });
    if (x1 == null || y1 == null || x2 == null || y2 == null || Math.hypot(x2 - x1, y2 - y1) < 1) continue;
    seen.add(w.id);
    const door = w.door === true;
    const open = door && w.open === true;
    out.push({
      id: String(w.id),
      x1: round(x1, 1), y1: round(y1, 1), x2: round(x2, 1), y2: round(y2, 1),
      kind: door ? 'wall' : pick(w.kind, WALL_KINDS, 'wall'),
      door,
      open,
      locked: door && !open && w.locked === true,
      ...(door && w.secret === true ? { secret: true, revealed: open || w.revealed === true } : {}),
      source: pick(w.source, WALL_SOURCES, 'dm'),
      // The pieces of one curved wall share a group, so they're erased together.
      ...(typeof w.group === 'string' && isTokenId(w.group) ? { group: w.group } : {}),
    });
  }
  return out;
}

/**
 * The points along an arc that starts at `a`, passes through `m` and ends at
 * `b` (a curved wall), a piece every 10° or so (2 to 48 pieces). Points in a
 * line give just [a, b].
 */
export function arcThrough(a, m, b) {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  const span = Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(m.x - a.x, m.y - a.y);
  if (Math.abs(d) < 1e-6 * Math.max(1, span * span)) return [a, b];
  const sq = (p) => p.x * p.x + p.y * p.y;
  const c = {
    x: (sq(a) * (m.y - b.y) + sq(m) * (b.y - a.y) + sq(b) * (a.y - m.y)) / d,
    y: (sq(a) * (b.x - m.x) + sq(m) * (a.x - b.x) + sq(b) * (m.x - a.x)) / d,
  };
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  const ang = (p) => Math.atan2(p.y - c.y, p.x - c.x);
  const TAU = 2 * Math.PI;
  const ccw = (from, to) => (((to - from) % TAU) + TAU) % TAU; // turning one way, 0..2π
  const sa = ang(a);
  // Go the way round that passes through m.
  let sweep = ccw(sa, ang(b));
  if (ccw(sa, ang(m)) > sweep) sweep -= TAU;
  const n = Math.min(48, Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 18))));
  const pts = [a];
  for (let i = 1; i < n; i++) pts.push({ x: c.x + r * Math.cos(sa + (sweep * i) / n), y: c.y + r * Math.sin(sa + (sweep * i) / n) });
  pts.push(b);
  return pts;
}

/** The points round a circle (a round tower, a well), 36 pieces, closed (the first point again at the end). */
export function circlePoints(c, r) {
  const pts = [];
  for (let i = 0; i <= 36; i++) pts.push({ x: c.x + r * Math.cos((i * Math.PI) / 18), y: c.y + r * Math.sin((i * Math.PI) / 18) });
  return pts;
}

/** Is a door one players know about (not a secret door they haven't found)? */
export const doorKnown = (w) => w.door && (!w.secret || w.open || w.revealed);

/** The walls that block movement right now (everything but open doors). */
export const blockingWalls = (map) => (map.walls ?? []).filter((w) => !w.open);
/** The walls that block sight right now (not open doors, not obstacles). */
export const sightWalls = (map) => blockingWalls(map).filter((w) => w.kind !== 'low');

export const cross = (ax, ay, bx, by) => ax * by - ay * bx;

/** Do segments a-b and c-d cross (touching counts)? */
export function segmentsCross(a, b, c, d) {
  const d1 = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
  const d2 = cross(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y);
  const d3 = cross(d.x - c.x, d.y - c.y, a.x - c.x, a.y - c.y);
  const d4 = cross(d.x - c.x, d.y - c.y, b.x - c.x, b.y - c.y);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p, q, r, v) => v === 0 && Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  return on(a, b, c, d1) || on(a, b, d, d2) || on(c, d, a, d3) || on(c, d, b, d4);
}

/** Is there a wall or closed door in the way of a straight move from a to b? */
export const wallBetween = (map, a, b) =>
  blockingWalls(map).some((w) => segmentsCross(a, b, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }));

/**
 * Everything visible from a point: a polygon ([[x, y], ...], in order around
 * the point), bounded by the map's walls and closed doors and by the edges
 * of the image. Rays go to every wall end (and just either side of it), so
 * the polygon's corners are exactly where sight is cut off.
 *
 * Kept fast for maps with thousands of wall pieces: walls are put in a grid
 * of cells and each ray only tests the walls in the cells it passes through,
 * stopping at the first hit; shared wall ends cast one set of rays; with a
 * reach, walls out of reach are left out.
 */
export function sightPolygon(map, origin, reach = Infinity) {
  const { width, height } = map.image;
  const ox = Math.min(width - 0.01, Math.max(0.01, origin.x));
  const oy = Math.min(height - 0.01, Math.max(0.01, origin.y));
  const limited = Number.isFinite(reach);
  let segs = sightWalls(map).map((w) => [w.x1, w.y1, w.x2, w.y2]);
  if (limited) segs = segs.filter((s) => distanceToSegment(ox, oy, s) <= reach);
  segs.push([0, 0, width, 0], [width, 0, width, height], [width, height, 0, height], [0, height, 0, 0]);
  const grid = wallGrid(segs, width, height);
  const angles = [];
  const ends = new Set();
  for (const [x1, y1, x2, y2] of segs) {
    for (const [x, y] of [[x1, y1], [x2, y2]]) {
      const key = `${x},${y}`;
      if (ends.has(key)) continue;
      ends.add(key);
      if (limited && Math.hypot(x - ox, y - oy) > reach) continue;
      const a = Math.atan2(y - oy, x - ox);
      angles.push(a - 1e-5, a, a + 1e-5);
    }
    // Where a wall crosses the edge of the reach, so the corner there is exact.
    if (limited) for (const a of circleCrossings(ox, oy, reach, x1, y1, x2, y2)) angles.push(a - 1e-5, a, a + 1e-5);
  }
  // Limited reach (a light, darkvision): the edge of the circle, every 5°.
  if (limited) for (let i = 0; i < 72; i++) angles.push((i * Math.PI) / 36 - Math.PI);
  const points = [];
  for (const a of angles) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const best = Math.min(castRay(grid, segs, ox, oy, dx, dy, reach), reach);
    if (best < Infinity) points.push({ a, x: ox + dx * best, y: oy + dy * best });
  }
  points.sort((p, q) => p.a - q.a);
  const out = [];
  for (const p of points) {
    const pt = [round(p.x, 1), round(p.y, 1)];
    const last = out.at(-1);
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt);
  }
  if (out.length > 1 && out[0][0] === out.at(-1)[0] && out[0][1] === out.at(-1)[1]) out.pop();
  return out;
}

/** How far the point (x, y) is from the segment [x1, y1, x2, y2]. */
export function distanceToSegment(x, y, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len)) : 0;
  return Math.hypot(x1 + t * dx - x, y1 + t * dy - y);
}

/** The angles (seen from the centre) where a segment crosses a circle. */
function circleCrossings(cx, cy, r, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (!a || disc < 0) return [];
  const out = [];
  for (const t of [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)]) {
    if (t >= 0 && t <= 1) out.push(Math.atan2(fy + t * dy, fx + t * dx));
  }
  return out;
}

/** The segments bucketed into square cells: { size, cols, rows, cells: [[segment index...]...], stamp }. */
function wallGrid(segs, width, height) {
  const size = Math.max(32, Math.sqrt((width * height) / Math.max(1, segs.length)));
  const cols = Math.max(1, Math.ceil(width / size));
  const rows = Math.max(1, Math.ceil(height / size));
  const cells = Array.from({ length: cols * rows }, () => []);
  const cell = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v / size)));
  segs.forEach(([x1, y1, x2, y2], i) => {
    const c0 = cell(Math.min(x1, x2), cols);
    const c1 = cell(Math.max(x1, x2), cols);
    const r0 = cell(Math.min(y1, y2), rows);
    const r1 = cell(Math.max(y1, y2), rows);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * cols + c].push(i);
  });
  return { size, cols, rows, cells, stamp: new Int32Array(segs.length), ray: 0 };
}

/** How far a ray from (ox, oy) in direction (dx, dy) goes before it meets a segment (Infinity if none within `reach`). */
function castRay(grid, segs, ox, oy, dx, dy, reach) {
  const { size, cols, rows, cells, stamp } = grid;
  const ray = ++grid.ray;
  let best = Infinity;
  let cx = Math.min(cols - 1, Math.floor(ox / size));
  let cy = Math.min(rows - 1, Math.floor(oy / size));
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  let nextX = dx !== 0 ? ((cx + (dx > 0 ? 1 : 0)) * size - ox) / dx : Infinity;
  let nextY = dy !== 0 ? ((cy + (dy > 0 ? 1 : 0)) * size - oy) / dy : Infinity;
  const deltaX = dx !== 0 ? size / Math.abs(dx) : Infinity;
  const deltaY = dy !== 0 ? size / Math.abs(dy) : Infinity;
  let entered = 0;
  while (cx >= 0 && cy >= 0 && cx < cols && cy < rows && entered <= Math.min(best, reach)) {
    for (const i of cells[cy * cols + cx]) {
      if (stamp[i] === ray) continue;
      stamp[i] = ray;
      const [x1, y1, x2, y2] = segs[i];
      const sx = x2 - x1;
      const sy = y2 - y1;
      const denom = cross(dx, dy, sx, sy);
      if (Math.abs(denom) < 1e-12) continue;
      const qx = x1 - ox;
      const qy = y1 - oy;
      const t = cross(qx, qy, sx, sy) / denom;
      const u = cross(qx, qy, dx, dy) / denom;
      if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
    }
    if (nextX < nextY) {
      entered = nextX;
      nextX += deltaX;
      cx += stepX;
    } else {
      entered = nextY;
      nextY += deltaY;
      cy += stepY;
    }
  }
  return best;
}

/** Is a point inside a polygon ([[x, y], ...])? */
export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * What a player's own tokens can see: one sight polygon per token. Empty
 * unless fog and line of sight are both on.
 */
export function sightOf(map, userId) {
  if (!map.fog?.enabled || !map.fog.sight || userId == null) return [];
  // A player sees what their character sees, and what their companions see.
  const own = map.tokens.filter((t) => ownToken(t, userId));
  if (!map.fog.dark) return own.map((t) => sightPolygon(map, t)).filter((p) => p.length >= 3);
  // In the dark: what darkvision reaches, and the lit places the token can see (each light's area, cut to the token's sight).
  const k = pxPerUnit(map);
  const lit = litAreas(map).map((points) => ({ points, box: boundsOf(points) }));
  const out = [];
  for (const t of own) {
    if (t.darkvision > 0) out.push(sightPolygon(map, t, t.darkvision * k));
    const full = sightPolygon(map, t);
    const box = boundsOf(full);
    // Lights nowhere near what the token can see can't light anything it sees.
    for (const area of lit) if (boxesMeet(area.box, box)) out.push({ points: area.points, clip: full });
  }
  return out.filter((v) => (v.points ?? v).length >= 3);
}

export const boundsOf = (points) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
};
const boxesMeet = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

// Lit areas already worked out, per set of walls: a light that hasn't moved
// keeps its polygon while tokens move (and is shared by every player).
const litCache = new Map(); // walls key -> Map(light key -> polygon)
const LIT_CACHE_WALLS = 8;
const LIT_CACHE_LIGHTS = 1000;

/**
 * Where light falls: one polygon per light (placed, or carried by a
 * token), out to the end of its dim light and cut off by walls.
 */
export function litAreas(map) {
  const k = pxPerUnit(map);
  const sources = [...(map.lights ?? []), ...map.tokens.filter((t) => t.light).map((t) => ({ x: t.x, y: t.y, ...t.light }))];
  if (!sources.length) return [];
  const wallsKey = `${map.image.width}x${map.image.height}|${sightWalls(map).map((w) => `${w.x1},${w.y1},${w.x2},${w.y2}`).join(';')}`;
  let known = litCache.get(wallsKey);
  if (known) litCache.delete(wallsKey);
  else known = new Map();
  litCache.set(wallsKey, known);
  if (litCache.size > LIT_CACHE_WALLS) litCache.delete(litCache.keys().next().value);
  const out = [];
  for (const l of sources) {
    const reach = (l.bright + l.dim) * k;
    const key = `${l.x},${l.y},${reach}`;
    let poly = known.get(key);
    if (!poly) {
      poly = sightPolygon(map, l, reach);
      if (known.size >= LIT_CACHE_LIGHTS) known.delete(known.keys().next().value);
      known.set(key, poly);
    }
    if (poly.length >= 3) out.push(poly);
  }
  return out;
}

/** Is a point inside what a player sees: a polygon, or { points, clip } (inside both)? */
export const inView = (x, y, v) => (Array.isArray(v) ? pointInPolygon(x, y, v) : pointInPolygon(x, y, v.points) && pointInPolygon(x, y, v.clip));

/** Can a player with these sight polygons see the point (x, y) right now? */
export function canSee(map, polygons, x, y) {
  if (!map.fog?.enabled) return true;
  if (polygons.some((p) => inView(x, y, p))) return true;
  return !isFogged(map, x, y);
}

/**
 * The fog as one player sees it, as a mask: a list of shapes drawn in
 * order, each { fill, x, y, w, h } or { fill, points } (with `clip`: only
 * where it's also inside that polygon). fill is 'cover'
 * (fog), 'dim' (seen before: shown darkened), 'glimpse' (over heights: someone
 * standing there would be seen, the floor wouldn't; lightly shaded) or 'clear'. Without sight
 * polygons or explored areas it's the DM's rectangles alone. Empty when
 * the fog is off.
 */
export function fogMask(map, { polygons = [], explored = [] } = {}) {
  if (!map.fog?.enabled) return [];
  const { width, height } = map.image;
  return [
    { fill: map.fog.map === 'grey' ? 'dim' : 'cover', x: 0, y: 0, w: width, h: height },
    ...explored.map((r) => ({ fill: 'dim', ...r })),
    ...map.fog.shapes.map((s) => ({ fill: s.op === 'reveal' ? 'clear' : map.fog.map === 'grey' ? 'dim' : 'cover', x: s.x, y: s.y, w: s.w, h: s.h })),
    ...polygons.map((v) => (Array.isArray(v) ? { fill: 'clear', points: v } : { fill: 'clear', points: v.points, clip: v.clip })),
  ];
}

/**
 * The fog as a player's page draws it, from their view of the map (see the
 * server's maps.view): their own tokens' sight through the walls they're
 * sent, the places they've explored (`fog.explored`) and the DM's
 * rectangles, then the squares they can't see over raised areas
 * (heightShadows). Empty when the fog is off or the map shows unseen parts as
 * they are. The page passes a copy with its token where it's being dragged,
 * so the fog follows the drag.
 */
export function playerFogMask(view, userId) {
  if (!view.fog?.enabled || view.fog.map === 'shown') return [];
  const polygons = sightOf(view, userId);
  const explored = view.fog.explored ?? [];
  return [...fogMask(view, { polygons, explored }), ...heightShadows(view, userId, polygons, explored)];
}

/** The nearest wall within `maxDist` of a point (for clicking on one), or null. */
export function nearestWall(map, p, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const w of map.walls ?? []) {
    const d = distanceToWall(p, w);
    if (d <= bestD) {
      best = w;
      bestD = d;
    }
  }
  return best;
}

/**
 * Where a wall being drawn should end: on the nearest existing wall end
 * within `maxDist` (so walls join without gaps sight could slip through),
 * else on a grid corner within `maxDist`, else where the pointer is.
 */
export function snapWallPoint(map, p, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const w of map.walls ?? []) {
    for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bestD) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  if (best) return best;
  if (map.grid) {
    const { size: g, x: gx, y: gy } = map.grid;
    const c = { x: Math.round((p.x - gx) / g) * g + gx, y: Math.round((p.y - gy) / g) * g + gy };
    if (Math.hypot(p.x - c.x, p.y - c.y) <= maxDist) return { x: round(c.x, 1), y: round(c.y, 1) };
  }
  return { x: round(p.x, 1), y: round(p.y, 1) };
}
