/**
 * Height (moved out of map.js, which re-exports it): raised areas, stairs and
 * ladders, bridges, how tall tokens are, seeing over edges, and what moving
 * across levels and difficult terrain costs. Plain JS, used
 * by the server and the page.
 */
import { inTemplate, isFogged, isTokenId, num, ownToken, pick, round, squarePx, unitsPerPx, WALL_SOURCES } from './map.js';
import { boundsOf, canSee, cross, distanceToSegment, inView, pointInPolygon } from './map-sight.js';

// ---------- height ----------

/** Heights (tokens, raised areas, flying) are in feet, from -1000 to 1000. */
export const MAX_HEIGHT_FT = 1000;
export const MAX_RAISED = 300;
/** How tall a creature of each token size is when nothing says otherwise (feet). Small shares Medium's token size. */
export const SIZE_HEIGHTS = { 0.5: 2, 1: 6, 2: 10, 3: 20, 4: 30 };

/**
 * Raised areas (owner's request, 2026-10-15): parts of the map higher or
 * lower than the ground, each flat on top: a roof, a castle's wall-walk, a
 * tower top, a cliff top, a pit. `height` is in feet above the map's ground
 * (0). Where areas overlap, the highest counts.
 *
 * A `bridge` (owner, 2026-10-18: "platforms that you can walk under") is a
 * deck at that height with open space below it: a token in it is either on
 * it or under it (the token's `under`), and sight passes under it.
 */
export function normalizeRaised(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || !isTokenId(a.id) || seen.has(a.id) || out.length >= MAX_RAISED) continue;
    const points = (Array.isArray(a.points) ? a.points : []).slice(0, 200)
      .map((p) => [round(num(p?.[0], { min: 0, max: width, fallback: 0 }), 1), round(num(p?.[1], { min: 0, max: height, fallback: 0 }), 1)]);
    if (points.length < 3) continue;
    seen.add(a.id);
    out.push({ id: String(a.id), points, height: round(num(a.height, { min: -MAX_HEIGHT_FT, max: MAX_HEIGHT_FT, fallback: 0 }), 1), ...(a.bridge === true && { bridge: true }), source: pick(a.source, WALL_SOURCES, 'dm') });
  }
  return out;
}

/** Ways up and down between heights on one map: stairs (no extra movement) and ladders (climbing). */
export const CLIMB_KINDS = ['stairs', 'ladder'];
export const MAX_CLIMBS = 300;

/**
 * Stairs and ladders (owner's request, 2026-10-16), each a line drawn up
 * it from the bottom to the top: [{ id, kind (CLIMB_KINDS), x1, y1, x2, y2, source }].
 * Moving between heights where one is costs as the 5e rules say (see pathCost).
 */
export function normalizeClimbs(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  const x = (v) => round(num(v, { min: 0, max: width, fallback: 0 }), 1);
  const y = (v) => round(num(v, { min: 0, max: height, fallback: 0 }), 1);
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || !isTokenId(c.id) || seen.has(c.id) || out.length >= MAX_CLIMBS) continue;
    seen.add(c.id);
    out.push({ id: String(c.id), kind: pick(c.kind, CLIMB_KINDS, 'stairs'), x1: x(c.x1), y1: y(c.y1), x2: x(c.x2), y2: y(c.y2), source: pick(c.source, WALL_SOURCES, 'dm') });
  }
  return out;
}

/** How thick a bridge's deck is (feet): sight passes under it, not through it. */
export const BRIDGE_DECK_FT = 1;
/** How far down (feet) a token steps onto a bridge from where it stands, rather than walking under it. */
export const BRIDGE_STEP_FT = 5;

/**
 * How high the ground is at a point (feet): the highest raised area there,
 * else 0. `under`: below any bridge there (the ground under it), not on it.
 */
export function groundAt(map, x, y, under = false) {
  let best = null;
  for (const a of map.raised ?? []) if ((!under || !a.bridge) && (best == null || a.height > best) && pointInPolygon(x, y, a.points)) best = a.height;
  return best ?? 0;
}

/** The highest bridge at a point, or null. */
export function bridgeAt(map, x, y) {
  let best = null;
  for (const a of map.raised ?? []) if (a.bridge && (!best || a.height > best.height) && pointInPolygon(x, y, a.points)) best = a;
  return best;
}

/** How high the ground a token stands on is (feet): a bridge's deck, or what's under it if the token is. */
export const tokenGround = (map, t) => groundAt(map, t.x, t.y, !!t.under);

/** Is this token under a bridge (it says so, and one is where it stands)? */
export const isUnder = (map, t) => !!t.under && !!bridgeAt(map, t.x, t.y);

/**
 * A height in feet from what a player typed on their sheet ("5'10\"", "5 ft 10 in",
 * "6 feet", "178 cm", "1.8 m", "70 in"), or null if it doesn't read as one.
 */
export function parseHeight(text) {
  const s = String(text ?? '').toLowerCase().replace(/,/g, '.').trim();
  if (!s) return null;
  let ft = null;
  let m;
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*cm\b/))) ft = Number(m[1]) / 30.48;
  else if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\b/))) ft = Number(m[1]) * 3.2808;
  else if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:'|’|ft\b|feet\b|foot\b)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|”|''|in\b|inch(?:es)?\b)?)?/))) ft = Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0);
  else if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:"|”|in\b|inch(?:es)?\b)/))) ft = Number(m[1]) / 12;
  return ft != null && ft >= 0.5 && ft <= MAX_HEIGHT_FT ? Math.round(ft * 10) / 10 : null;
}

/**
 * How tall a token is (feet): set by hand, else what the server worked out
 * from its player's sheet (`tall`, on the views it sends), else by its size.
 */
export const tokenTall = (t) => t.height ?? t.tall ?? SIZE_HEIGHTS[t.size] ?? 6;

/** Where a token's eyes are: { x, y, z } with z in feet (1 ft below the top of its head, but at least half way up). */
export function eyeOf(map, t) {
  const tall = tokenTall(t);
  return { x: t.x, y: t.y, z: tokenGround(map, t) + (t.elevation ?? 0) + Math.max(tall - 1, tall / 2) };
}

/** The top of a token's head: { x, y, z }, z in feet. */
export function headOf(map, t) {
  return { x: t.x, y: t.y, z: tokenGround(map, t) + (t.elevation ?? 0) + tokenTall(t) };
}

// The edges of raised areas, per set of areas: a key -> edges.
const edgeCache = new Map();

/**
 * Every place the ground changes height, as segments with `top`: the
 * higher of the heights on its two sides (what a line of sight over it
 * must clear). Bridges aren't ground (sight passes under them): they come
 * as `decks` on the list, { points, top, bottom, box }.
 */
export function heightEdges(map) {
  const raised = map.raised ?? [];
  if (!raised.length) return [];
  const key = raised.map((a) => `${a.bridge ? 'b' : ''}${a.height}:${a.points.join(';')}`).join('|');
  if (edgeCache.has(key)) return edgeCache.get(key);
  const out = [];
  out.decks = raised.filter((a) => a.bridge).map((a) => {
    const xs = a.points.map((p) => p[0]);
    const ys = a.points.map((p) => p[1]);
    return { points: a.points, top: a.height, bottom: a.height - BRIDGE_DECK_FT, box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } };
  });
  for (const a of raised) {
    if (a.bridge) continue;
    const n = a.points.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = a.points[i];
      const [x2, y2] = a.points[(i + 1) % n];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (!len) continue;
      // Just either side of the edge's middle.
      const nx = (-(y2 - y1) / len) * 0.01;
      const ny = ((x2 - x1) / len) * 0.01;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const top = Math.max(groundAt(map, mx + nx, my + ny, true), groundAt(map, mx - nx, my - ny, true));
      out.push({ x1, y1, x2, y2, top });
    }
  }
  if (edgeCache.size > 16) edgeCache.delete(edgeCache.keys().next().value);
  edgeCache.set(key, out);
  return out;
}

/**
 * Can a line of sight from a (eyes) to b (a point to see, such as the top
 * of a head), each { x, y, z } with z in feet, pass over the raised areas?
 * The standard terrain line-of-sight test (as GIS viewsheds and Foundry's
 * height modules do it): the straight line between them must stay above
 * the ground. Raised areas are flat on top, so the line can only touch
 * them at an edge: at each edge it crosses, its height there
 * (a.z + (b.z - a.z) × how far along) must be at least the edge's top.
 * Walls are separate (they block whatever the height).
 */
export function heightClear(edges, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  for (const e of edges) {
    if (Math.max(e.x1, e.x2) < x0 || Math.min(e.x1, e.x2) > x1 || Math.max(e.y1, e.y2) < y0 || Math.min(e.y1, e.y2) > y1) continue;
    const sx = e.x2 - e.x1;
    const sy = e.y2 - e.y1;
    const denom = cross(dx, dy, sx, sy);
    if (Math.abs(denom) < 1e-12) continue;
    const qx = e.x1 - a.x;
    const qy = e.y1 - a.y;
    const t = cross(qx, qy, sx, sy) / denom;
    const u = cross(qx, qy, dx, dy) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    if (a.z + (b.z - a.z) * t < e.top - 1e-6) return false;
  }
  for (const d of edges.decks ?? []) {
    if (d.box.x1 < x0 || d.box.x0 > x1 || d.box.y1 < y0 || d.box.y0 > y1) continue;
    if (throughDeck(d, a, b)) return false;
  }
  return true;
}

/**
 * Does the line from a to b pass through a bridge's deck? Where it's over
 * the bridge (between crossings of its outline), its height there runs
 * straight from one end to the other, so it goes through the deck if that
 * range meets the deck's (bottom to top). Over it or under it is clear.
 */
function throughDeck(d, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ts = [0, 1];
  const n = d.points.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = d.points[i];
    const [x2, y2] = d.points[(i + 1) % n];
    const sx = x2 - x1;
    const sy = y2 - y1;
    const denom = cross(dx, dy, sx, sy);
    if (Math.abs(denom) < 1e-12) continue;
    const t = cross(x1 - a.x, y1 - a.y, sx, sy) / denom;
    const u = cross(x1 - a.x, y1 - a.y, dx, dy) / denom;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((p, q) => p - q);
  for (let i = 1; i < ts.length; i++) {
    const t0 = ts[i - 1];
    const t1 = ts[i];
    if (t1 - t0 < 1e-9) continue;
    const tm = (t0 + t1) / 2;
    if (!pointInPolygon(a.x + dx * tm, a.y + dy * tm, d.points)) continue;
    const z0 = a.z + (b.z - a.z) * t0;
    const z1 = a.z + (b.z - a.z) * t1;
    if (Math.max(z0, z1) > d.bottom + 1e-6 && Math.min(z0, z1) < d.top - 1e-6) return true;
  }
  return false;
}

/** Can token a see token b over the raised areas (walls aside)? The same line both ways, so it's mutual. */
export const tokenSeesOver = (map, a, b, edges = heightEdges(map)) => heightClear(edges, eyeOf(map, a), headOf(map, b));

/**
 * Does a player see this token, with line of sight on? It must be in what
 * their tokens see (sight polygons) or in a part the DM revealed, and with
 * raised areas on the map, one of their tokens must also see over them to
 * the top of its head. The DM's reveals show it whatever the heights.
 */
export function canSeeToken(map, userId, polygons, t) {
  if (!canSee(map, polygons, t.x, t.y)) return false;
  if (!map.fog?.enabled || !map.fog.sight || !map.raised?.length || !isFogged(map, t.x, t.y)) return true;
  const edges = heightEdges(map);
  return map.tokens.some((o) => ownToken(o, userId) && tokenSeesOver(map, o, t, edges));
}

/** How tall the creature is that the fog shows for: where a Medium creature standing there would be seen. */
export const FOG_TARGET_HEIGHT = 6;

/** Is a point inside a fog shape: a rectangle, a polygon (with its clip), or rings filled even-odd? */
export function inMaskShape(s, x, y) {
  if (s.rings) return s.rings.reduce((inside, ring) => (pointInPolygon(x, y, ring) ? !inside : inside), false);
  if (s.points) return inView(x, y, s.clip ? { points: s.points, clip: s.clip } : s.points);
  return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
}

/** What a fog mask shows at a point: the fill of the last shape over it, else 'clear'. */
export const maskFillAt = (shapes, x, y) => shapes.reduce((fill, s) => (inMaskShape(s, x, y) ? s.fill : fill), 'clear');

// Which sides of a square the shadow's outline crosses, for each pattern of
// its corners in the shadow (top left 8, top right 4, bottom right 2,
// bottom left 1): pairs of sides (T, R, B, L) joined by a line. The two
// patterns with opposite corners in (5 and 10) depend on the middle.
const MARCH = {
  1: [['L', 'B']], 2: [['B', 'R']], 3: [['L', 'R']], 4: [['T', 'R']], 6: [['T', 'B']], 7: [['L', 'T']],
  8: [['L', 'T']], 9: [['T', 'B']], 11: [['T', 'R']], 12: [['L', 'R']], 13: [['B', 'R']], 14: [['L', 'B']],
};
const SADDLE = {
  5: { in: [['L', 'T'], ['B', 'R']], out: [['T', 'R'], ['L', 'B']] },
  10: { in: [['T', 'R'], ['L', 'B']], out: [['L', 'T'], ['B', 'R']] },
};

/**
 * The outline of where `inside(x, y)` holds, as rings (filled even-odd),
 * from a grid of nx × ny points `step` apart from (x0, y0) with `val`
 * saying which are inside (1); the outermost are outside so every ring
 * closes. Marching squares: where the outline crosses a side of a square,
 * the point is found by halving the side until it's within a hundredth of
 * the step, so straight edges come out straight, whatever angle they run at.
 */
function outline(val, inside, x0, y0, step, nx, ny) {
  const at = (i, j) => [x0 + i * step, y0 + j * step];
  const inner = (i, j) => i > 0 && j > 0 && i < nx - 1 && j < ny - 1;
  const crossings = new Map();
  // Where the outline crosses the side between points (i, j) and (k, l).
  const crossing = (key, i, j, k, l) => {
    if (crossings.has(key)) return crossings.get(key);
    let [ax, ay] = at(i, j);
    let [bx, by] = at(k, l);
    let p;
    if (!inner(i, j) || !inner(k, l)) p = [(ax + bx) / 2, (ay + by) / 2];
    else {
      const aIn = val[j * nx + i] === 1;
      while (Math.abs(bx - ax) + Math.abs(by - ay) > step / 100) {
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        if (inside(mx, my) === aIn) [ax, ay] = [mx, my];
        else [bx, by] = [mx, my];
      }
      p = [(ax + bx) / 2, (ay + by) / 2];
    }
    crossings.set(key, p);
    return p;
  };
  const segments = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const tl = val[j * nx + i], tr = val[j * nx + i + 1], br = val[(j + 1) * nx + i + 1], bl = val[(j + 1) * nx + i];
      const code = tl * 8 + tr * 4 + br * 2 + bl;
      if (code === 0 || code === 15) continue;
      const pairs = MARCH[code] ?? (inside(...at(i + 0.5, j + 0.5)) ? SADDLE[code].in : SADDLE[code].out);
      const side = { T: [`h${i},${j}`, i, j, i + 1, j], B: [`h${i},${j + 1}`, i, j + 1, i + 1, j + 1], L: [`v${i},${j}`, i, j, i, j + 1], R: [`v${i + 1},${j}`, i + 1, j, i + 1, j + 1] };
      for (const [a, b] of pairs) segments.push([side[a][0], side[b][0], side[a], side[b]]);
    }
  }
  // Join the pieces into rings: each crossing is shared by two of them.
  const by = new Map();
  segments.forEach((s, n) => {
    for (const key of [s[0], s[1]]) by.set(key, [...(by.get(key) ?? []), n]);
  });
  const used = new Uint8Array(segments.length);
  const rings = [];
  for (let n = 0; n < segments.length; n++) {
    if (used[n]) continue;
    const ring = [];
    let m = n;
    let from = segments[n][0];
    while (m != null && !used[m]) {
      used[m] = 1;
      const s = segments[m];
      const [here, to] = s[0] === from ? [s[2], s[1]] : [s[3], s[0]];
      ring.push(crossing(...here));
      from = to;
      m = by.get(to).find((o) => !used[o]);
    }
    rings.push(straighten(ring));
  }
  return rings.filter((r) => r.length >= 3);
}

/** A ring without the points that lie on a straight line between their neighbours. */
function straighten(ring) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = out.length ? out[out.length - 1] : ring[(i + ring.length - 1) % ring.length];
    const b = ring[i];
    const c = ring[(i + 1) % ring.length];
    const lenAC = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (lenAC > 0 && Math.abs(cross(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1])) / lenAC < 0.05) continue;
    out.push(b);
  }
  return out;
}

/**
 * Where a player's tokens can't see over the raised areas, as fog shapes
 * on top of their sight, in two shades (owner, 2026-10-20: a tall creature
 * up on a roof is seen before a short one): 'glimpse' (a light shade) where
 * none of their tokens sees the floor but one would see a Medium creature
 * standing there, fog where they'd see neither. Outlined smoothly like a
 * wall's shadow (owner, 2026-10-20: the squares looked blocky beside the
 * walls' shadows), one shape of rings per fill. Fog over places they
 * explored before stays dim, and the DM's reveals stay clear. Outside what
 * they can see the fog covers it anyway, so only the box around their
 * sight is looked at.
 */
export function heightShadows(map, userId, polygons, explored = []) {
  if (!map.raised?.length || !polygons.length) return [];
  const own = map.tokens.filter((t) => ownToken(t, userId));
  if (!own.length) return [];
  const edges = heightEdges(map);
  const eyes = own.map((t) => eyeOf(map, t));
  const { width, height } = map.image;
  const cell = map.grid ? map.grid.size : Math.max(width, height) / 64;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const v of polygons) {
    const b = boundsOf(v.points ?? v);
    bx0 = Math.min(bx0, b.x0); by0 = Math.min(by0, b.y0); bx1 = Math.max(bx1, b.x1); by1 = Math.max(by1, b.y1);
  }
  bx0 = Math.max(0, bx0); by0 = Math.max(0, by0); bx1 = Math.min(width, bx1); by1 = Math.min(height, by1);
  if (bx1 <= bx0 || by1 <= by0) return [];
  // Points an eighth of a square apart (fewer on a huge map), with a row of outside all round.
  const FINE = 8;
  let step = cell / FINE;
  while (((bx1 - bx0) / step + 3) * ((by1 - by0) / step + 3) > 160000) step *= 1.5;
  // A whole number of squares across (see below), plus the outside rows.
  const nx = Math.ceil((bx1 - bx0) / step / FINE) * FINE + 3;
  const ny = Math.ceil((by1 - by0) / step / FINE) * FINE + 3;
  const fill = map.fog?.map === 'grey' ? 'dim' : 'cover';
  // groundAt and bridgeAt, quicker: each area's box first.
  const areas = map.raised.map((a) => ({ a, box: boundsOf(a.points) }));
  const hidden = (x, y) => {
    if (!isFogged(map, x, y)) return null;
    let ground = null, deck = null;
    for (const { a, box } of areas) {
      if (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1 || !pointInPolygon(x, y, a.points)) continue;
      if (!a.bridge) ground = Math.max(ground ?? -Infinity, a.height);
      else if (!deck || a.height > deck.height) deck = a;
    }
    ground ??= 0;
    // The floor there, then someone standing on it (on a bridge or under it: either can be seen).
    const floors = [ground, ...(deck ? [Math.max(deck.height, ground)] : [])];
    const seenAt = (up) => eyes.some((eye) => floors.some((z) => heightClear(edges, eye, { x, y, z: z + up })));
    if (seenAt(0)) return null;
    if (seenAt(FOG_TARGET_HEIGHT)) return 'glimpse';
    return explored.some((e) => x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) ? 'dim' : fill;
  };
  // Every FINE-th point first (a square apart); the rest only in squares
  // whose corners differ (elsewhere they're all the same as the corners).
  const FILLS = [null, 'cover', 'dim', 'glimpse'];
  const code = (x, y) => FILLS.indexOf(hidden(x, y));
  const codes = new Uint8Array(nx * ny);
  const coarse = (i) => (i - 1) % FINE === 0;
  for (let j = 1; j < ny - 1; j += FINE) for (let i = 1; i < nx - 1; i += FINE) codes[j * nx + i] = code(bx0 + (i - 1) * step, by0 + (j - 1) * step);
  const same = (ci, cj) => {
    const i = 1 + ci * FINE, j = 1 + cj * FINE;
    if (ci < 0 || cj < 0 || i + FINE > nx - 2 || j + FINE > ny - 2) return -1;
    const c = codes[j * nx + i];
    return codes[j * nx + i + FINE] === c && codes[(j + FINE) * nx + i] === c && codes[(j + FINE) * nx + i + FINE] === c ? c : -1;
  };
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      if (coarse(i) && coarse(j)) continue;
      // The squares this point is in (two or four when it's on their sides).
      const cis = coarse(i) ? [(i - 1) / FINE - 1, (i - 1) / FINE] : [Math.floor((i - 1) / FINE)];
      const cjs = coarse(j) ? [(j - 1) / FINE - 1, (j - 1) / FINE] : [Math.floor((j - 1) / FINE)];
      let c = null;
      for (const ci of cis) for (const cj of cjs) {
        const v = same(ci, cj);
        if (v < 0 || (c != null && c !== v)) c = -1;
        else if (c == null) c = v;
        if (c === -1) break;
      }
      codes[j * nx + i] = c != null && c >= 0 ? c : code(bx0 + (i - 1) * step, by0 + (j - 1) * step);
    }
  }
  const out = [];
  for (const f of fill === 'dim' ? ['dim', 'glimpse'] : ['cover', 'dim', 'glimpse']) {
    const want = FILLS.indexOf(f);
    const rings = outline(codes.map((c) => (c === want ? 1 : 0)), (x, y) => hidden(x, y) === f, bx0 - step, by0 - step, step, nx, ny);
    if (rings.length) out.push({ fill: f, rings });
  }
  return out;
}

/** Is this point in difficult terrain? */
export const isDifficult = (map, x, y) => (map.terrain ?? []).some((a) => pointInPolygon(x, y, a.points))
  || (map.templates ?? []).some((t) => t.difficult && inTemplate(map, t, x, y));

/** Feet in one of each unit (a climb is in feet; a move is in the map's unit). */
const FEET_PER = { ft: 1, m: 3.28084, mi: 5280, km: 3280.84 };

/** A climbing speed in a stat block's speed line ("30 ft., climb 30 ft."). */
export const hasClimbSpeed = (text) => /\bclimb(?:ing)?\s+\d/i.test(String(text ?? ''));

/** The stairs or ladder nearest (x, y) within `reach` pixels, or null. */
function climbNear(map, x, y, reach) {
  let best = null;
  let bestD = reach;
  for (const c of map.climbs ?? []) {
    const d = distanceToSegment(x, y, [c.x1, c.y1, c.x2, c.y2]);
    if (d <= bestD) [best, bestD] = [c, d];
  }
  return best;
}

/**
 * Follows a token's feet along a move, step by step: how high the ground
 * under it is, whether it's on a bridge or under one (owner, 2026-10-18),
 * and how far it climbs. It walks onto a bridge where it comes to it from
 * no more than BRIDGE_STEP_FT below the deck, or by stairs or a ladder;
 * otherwise it walks under it, and stays under (or on) until it leaves it.
 * Climbing as in pathCost: any change of height, except by stairs.
 * `step(x, y)` each point along the way; then `under`, `ground`, `climb`, `wall`.
 */
export function levelWalker(map, start, under = false) {
  const heights = (map.raised ?? []).length > 0;
  const reach = squarePx(map) * 0.75;
  let deck = heights ? bridgeAt(map, start.x, start.y) : null;
  let on = !!deck && !under;
  const w = { ground: heights ? groundAt(map, start.x, start.y, !on) : 0, climb: 0, wall: false, under: !!deck && !on };
  let last = start;
  w.step = (x, y) => {
    if (!heights) return;
    const d = bridgeAt(map, x, y);
    const near = climbNear(map, (last.x + x) / 2, (last.y + y) / 2, reach);
    const base = groundAt(map, x, y, true);
    const nextOn = !!d && (on || w.ground >= d.height - BRIDGE_STEP_FT || !!near);
    const g = nextOn ? Math.max(base, d.height) : base;
    if (g !== w.ground) {
      if (near?.kind !== 'stairs') {
        w.climb += Math.abs(g - w.ground);
        w.wall ||= !near;
      }
      w.ground = g;
    }
    deck = d;
    on = nextOn;
    w.under = !!d && !on;
    last = { x, y };
  };
  return w;
}

/**
 * Whether a token ends a move (points: where it starts, any waypoints, where
 * it ends) under a bridge: { under, climb }. Walked in quarter squares.
 */
export function walkLevels(map, points, token = {}) {
  const w = levelWalker(map, points[0], !!token.under);
  const stepPx = squarePx(map) / 4;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / stepPx));
    for (let k = 1; k <= n; k++) w.step(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
  }
  return { under: w.under, climb: w.climb };
}

/**
 * What a move along a path costs ({ value, unit, squares?, difficult, climb,
 * wall, under }), or null without a scale. points: where it starts, any waypoints,
 * where it ends. On a grid with a scale per square, each square entered
 * costs one square (diagonals too, the 5e way), two in difficult terrain;
 * otherwise it's the length of the path, doubled where it crosses difficult
 * terrain.
 *
 * Going up or down between raised areas (owner, 2026-10-16): by stairs it
 * costs nothing more; anywhere else it's climbing, and each foot climbed
 * costs a foot extra (5e), by a ladder or up a bare wall (`wall`: the DM may
 * want an Athletics check). `climb` is how many feet it climbs, up and down.
 * A token (optional) with a climbing speed (`climber`), or flying
 * (`elevation` above 0), climbs at no extra cost. Bridges as levelWalker
 * says; `under`: whether it ends under one.
 */
export function pathCost(map, points, token = null) {
  const per = unitsPerPx(map);
  if (per == null || points.length < 2) return null;
  const { unit } = map.scale;
  let difficult = false;
  // Climbing: where the ground under the path changes height, unless by stairs.
  const walker = levelWalker(map, points[0], !!token?.under);
  const step = walker.step;
  const free = !!(token && (token.climber || (token.elevation ?? 0) > 0));
  const extra = () => (free ? 0 : walker.climb / (FEET_PER[unit] ?? 1));
  const done = (out) => ({ ...out, difficult, climb: round(walker.climb, 1), wall: walker.wall && walker.climb > 0, under: walker.under });
  if (map.grid && map.scale.per === 'square') {
    const g = map.grid.size;
    let squares = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const n = Math.max(Math.round(Math.abs(b.x - a.x) / g), Math.round(Math.abs(b.y - a.y) / g));
      for (let k = 1; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n;
        const y = a.y + ((b.y - a.y) * k) / n;
        const hard = isDifficult(map, x, y);
        difficult ||= hard;
        squares += hard ? 2 : 1;
        step(x, y);
      }
    }
    return done({ value: round(squares * map.scale.distance + extra(), 2), unit, squares });
  }
  let px = 0;
  const stepPx = squarePx(map) / 4;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / stepPx));
    for (let k = 0; k < n; k++) {
      const hard = isDifficult(map, a.x + ((b.x - a.x) * (k + 0.5)) / n, a.y + ((b.y - a.y) * (k + 0.5)) / n);
      difficult ||= hard;
      px += (len / n) * (hard ? 2 : 1);
      step(a.x + ((b.x - a.x) * (k + 1)) / n, a.y + ((b.y - a.y) * (k + 1)) / n);
    }
  }
  return done({ value: px * per + extra(), unit });
}

/** A walking speed from a stat block's speed line ("30 ft., fly 60 ft." is 30), or null. */
export function speedFromText(text) {
  const m = String(text ?? '').match(/(\d+)\s*(?:ft|feet|foot|m\b)/i);
  return m ? Number(m[1]) : null;
}
