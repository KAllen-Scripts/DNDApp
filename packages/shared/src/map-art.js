/**
 * How a map made in the creator is drawn (SPEC §6.6 "Making a map"): floors
 * with their textures (natural ground running into its neighbours with
 * uneven edges, water with shallows and foam), roads and rivers, walls in
 * their styles, the assets (map-art-assets.js), the look (mood, the glow of
 * lights, a grid) and labels. The server draws the map's picture with it and
 * the page's creator previews with it, so they match. Plain Canvas 2D calls
 * only; everything that looks random is seeded by where it is, so a design
 * draws the same every time.
 */
import { ASSETS, DESIGN_CELL, EMPTY, FLOORS, LABEL_FONTS, LOOK, PATH_KINDS, assetOutline, drawOrder, layerOf, normalizeLook, smoothPoints, wallPoints } from './map-design.js';
import { sightPolygon } from './map.js';
import { TAU, shade, rgba, lightness, hash2, noise, fbm, circle, oval, rect, poly, line, polyline, blobPoints, smoothShape, radial, glow } from './map-paint.js';
import { drawBuiltIn } from './map-art-assets.js';

export { drawBuiltIn };
export const VOID_COLOUR = LOOK.void;

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isNatural = (ch) => FLOORS[ch]?.blend !== undefined;
const blendOf = (ch) => FLOORS[ch]?.blend ?? -1;
const isWater = (ch) => !!FLOORS[ch]?.water;
const FSEED = (ch) => ch.charCodeAt(0) * 7919 + 17;
/** Random numbers for one square (and a seed): the same every time. */
const rndOf = (c, r, s) => {
  let i = 0;
  return () => hash2(c, r, s * 1009 + (i += 1));
};
/** How detailed to draw at this many pixels a square. */
const detailAt = (cell) => (cell >= 36 ? 2 : cell >= 16 ? 1 : 0);

// ---------- natural edges ----------

const EDGE_AMP = 0.4;
const pairCache = new Map();
/**
 * Where two natural floors meet, how far their edge wanders from the grid
 * line at a point (smooth noise, so long edges wander): positive into the
 * lower floor's square, negative into the higher one's, up to EDGE_AMP squares.
 */
function pairS(lo, hi) {
  const key = lo + hi;
  let f = pairCache.get(key);
  if (!f) {
    const s = FSEED(hi) * 31 + FSEED(lo);
    f = (x, y) => EDGE_AMP * Math.tanh((noise(x * 1.4, y * 1.4, s) * 0.68 + noise(x * 3.6, y * 3.6, s + 5) * 0.32 - 0.5) * 4.5);
    pairCache.set(key, f);
  }
  return f;
}

/** A polygon turned so it winds the same way as ctx.rect (so overlapping ones add up in a clip). */
function clockwise(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a < 0 ? pts.slice().reverse() : pts;
}

/** The strip along one side of square (c, r), `D` deep (D(x, y) at points on that side, in squares): { poly, inner }. */
function edgeBand(c, r, side, D, K) {
  const inner = [];
  for (let i = 0; i <= K; i += 1) {
    const t = i / K;
    if (side === 'N') inner.push([c + t, r + D(c + t, r)]);
    else if (side === 'S') inner.push([c + t, r + 1 - D(c + t, r + 1)]);
    else if (side === 'W') inner.push([c + D(c, r + t), r + t]);
    else inner.push([c + 1 - D(c + 1, r + t), r + t]);
  }
  const outer = { N: [[c, r], [c + 1, r]], S: [[c, r + 1], [c + 1, r + 1]], W: [[c, r], [c, r + 1]], E: [[c + 1, r], [c + 1, r + 1]] }[side];
  return { poly: clockwise([outer[0], outer[1], ...inner.slice().reverse()]), inner };
}

/** One side of square (c, r), moved `f(x, y)` squares towards the neighbour on that side (negative: away). */
function edgeLine(c, r, side, f, K) {
  const pts = [];
  for (let i = 0; i <= K; i += 1) {
    const t = i / K;
    if (side === 'N') pts.push([c + t, r - f(c + t, r)]);
    else if (side === 'S') pts.push([c + t, r + 1 + f(c + t, r + 1)]);
    else if (side === 'W') pts.push([c - f(c, r + t), r + t]);
    else pts.push([c + 1 + f(c + 1, r + t), r + t]);
  }
  return pts;
}

/** A quarter circle in a square's corner at (px, py), `rad` squares, turning from angle a0 through a quarter turn: { poly, inner }. */
function cornerBlob(px, py, a0, rad, K) {
  const arc = [];
  for (let i = 0; i <= K; i += 1) {
    const a = a0 + ((i / K) * Math.PI) / 2;
    arc.push([px + Math.cos(a) * rad, py + Math.sin(a) * rad]);
  }
  return { poly: clockwise([[px, py], ...arc]), inner: arc };
}

const SIDES = [['N', 0, -1, 'S'], ['S', 0, 1, 'N'], ['W', -1, 0, 'E'], ['E', 1, 0, 'W']];
// Each corner of a square: where it is (from the square's top left), which way its diagonal neighbour is, and the angle into it.
const CORNERS = [[1, 1, 1, 1, 0], [0, 1, -1, 1, Math.PI / 2], [0, 0, -1, -1, Math.PI], [1, 0, 1, -1, (3 * Math.PI) / 2]];

/**
 * How natural floor `x` in square (c, r) meets other natural floors round it:
 * the pieces of neighbouring squares its ground wanders into (`ext`, each
 * with the square it's in: where the edge wanders out of its square, either
 * way round, and round its corners), and, where it's the higher floor, the
 * edges between (to soften). Each edge is shared: what one side's piece
 * covers, the other's leaves alone.
 */
function cellShape(at, c, r, x, K) {
  const ext = [];
  const edges = [];
  for (const [side, dc, dr, opp] of SIDES) {
    const n = at(c + dc, r + dr);
    if (!n || n === x || !isNatural(n)) continue;
    const tc = c + dc;
    const tr = r + dr;
    if (blendOf(n) < blendOf(x)) {
      const s = pairS(n, x);
      ext.push({ c: tc, r: tr, poly: edgeBand(tc, tr, opp, (px, py) => Math.max(0, s(px, py)), K).poly });
      edges.push(edgeLine(c, r, side, s, K));
    } else {
      const s = pairS(x, n);
      ext.push({ c: tc, r: tr, poly: edgeBand(tc, tr, opp, (px, py) => Math.max(0, -s(px, py)), K).poly });
    }
  }
  for (const [ox, oy, dc, dr, a0] of CORNERS) {
    const n = at(c + dc, r + dr);
    if (!n || n === x || !isNatural(n) || at(c + dc, r) === x || at(c, r + dr) === x) continue;
    const px = c + ox;
    const py = r + oy;
    const lower = blendOf(n) < blendOf(x);
    const rad = lower ? pairS(n, x)(px, py) : -pairS(x, n)(px, py);
    if (rad <= 0.02) continue;
    const blob = cornerBlob(px, py, a0, rad, K);
    ext.push({ c: c + dc, r: r + dr, poly: blob.poly });
    if (lower) edges.push(blob.inner);
  }
  return { ext, edges };
}

const tracePoly = (ctx, pts, k) => {
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
  ctx.closePath();
};
const toPx = (pts, k) => pts.map(([x, y]) => [x * k, y * k]);

/** How far each water square is from the shore (0 next to land, up to 4), for lighter shallows. */
function waterDepth(design) {
  const { cols, rows, floor } = design;
  const out = new Uint8Array(cols * rows).fill(255);
  const queue = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!isWater(floor[r][c])) continue;
      const shore = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dc, dr]) => {
        const ch = floor[r + dr]?.[c + dc];
        return ch !== undefined && ch !== EMPTY && !isWater(ch);
      });
      if (shore) {
        out[r * cols + c] = 0;
        queue.push(r * cols + c);
      }
    }
  }
  for (let q = 0; q < queue.length; q += 1) {
    const i = queue[q];
    const c = i % cols;
    const r = (i - c) / cols;
    if (out[i] >= 4) continue;
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      const j = rr * cols + cc;
      if (out[j] !== 255 || !isWater(floor[rr][cc])) continue;
      out[j] = out[i] + 1;
      queue.push(j);
    }
  }
  return out;
}

// ---------- floor textures ----------

/** How much each floor's colour wanders in big soft patches (built floors with their own pattern: none). */
const MOTTLE = { g: 0.16, G: 0.14, o: 0.16, l: 0.14, d: 0.12, t: 0.1, v: 0.08, a: 0.08, r: 0.12, u: 0.1, q: 0.12, n: 0.07, i: 0.08, m: 0.12, h: 0.14, y: 0.08, p: 0.05, W: 0, D: 0, L: 0.12 };

function mottle(g, c, r) {
  const amt = MOTTLE[g.ch];
  if (!amt || !g.detail) return;
  const { ctx, cell: k } = g;
  const rnd = rndOf(c, r, g.seed + 1);
  const n = fbm(c * 0.21, r * 0.21, g.seed) - 0.5;
  const cx = (c + 0.5 + (rnd() - 0.5) * 0.6) * k;
  const cy = (r + 0.5 + (rnd() - 0.5) * 0.6) * k;
  const col = shade(g.f.base, n * amt * 2.2 + (rnd() - 0.5) * amt * 0.5);
  const rad = k * (0.75 + rnd() * 0.3);
  ctx.fillStyle = radial(ctx, cx, cy, rad, rgba(col, 0.75), rgba(col, 0));
  ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
}

/** Little marks across a square: n of them, `size` squares across, colours wandering `spread` from the base. */
function specks(g, c, r, rnd, n, size, spread, base = g.f.base, round = false) {
  const { ctx, cell: k } = g;
  for (let i = 0; i < n; i += 1) {
    const s = size * k * (0.5 + rnd());
    const x = (c + rnd()) * k;
    const y = (r + rnd()) * k;
    const col = shade(base, (rnd() - 0.5) * spread);
    if (round) circle(ctx, x, y, s / 2, col);
    else rect(ctx, x - s / 2, y - s / 2, s, s, col);
  }
}

/** Tufts of grass: short strokes from a point. */
function blades(g, c, r, rnd, n, len, base, spread = 0.24) {
  const { ctx, cell: k } = g;
  const lw = Math.max(0.6, k * 0.016);
  for (let i = 0; i < n; i += 1) {
    const x = (c + rnd()) * k;
    const y = (r + rnd()) * k;
    const strokes = 2 + Math.floor(rnd() * 2);
    for (let s = 0; s < strokes; s += 1) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
      const l = len * k * (0.6 + rnd() * 0.6);
      line(ctx, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, shade(base, (rnd() - 0.4) * spread), lw);
    }
  }
}

/** Small stones with a light side. */
function pebbles(g, c, r, rnd, n, size, base) {
  const { ctx, cell: k } = g;
  for (let i = 0; i < n; i += 1) {
    const x = (c + rnd()) * k;
    const y = (r + rnd()) * k;
    const rx = size * k * (0.6 + rnd() * 0.8);
    const ry = rx * (0.6 + rnd() * 0.4);
    const a = rnd() * TAU;
    const col = shade(base, (rnd() - 0.5) * 0.18);
    if (g.detail > 1) oval(ctx, x + rx * 0.25, y + rx * 0.3, rx, ry, a, 'rgba(0,0,0,0.22)');
    oval(ctx, x, y, rx, ry, a, col);
    if (g.detail > 1 && rx > 1.5) oval(ctx, x - rx * 0.25, y - ry * 0.3, rx * 0.45, ry * 0.4, a, rgba(shade(col, 0.18), 0.8));
  }
}

/** A jagged crack across part of a square. */
function crackLine(g, c, r, rnd, colour, width) {
  const { ctx, cell: k } = g;
  let x = (c + rnd()) * k;
  let y = (r + rnd()) * k;
  let a = rnd() * TAU;
  const pts = [[x, y]];
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i += 1) {
    a += (rnd() - 0.5) * 1.4;
    const l = k * (0.08 + rnd() * 0.12);
    x += Math.cos(a) * l;
    y += Math.sin(a) * l;
    pts.push([x, y]);
  }
  polyline(ctx, pts, colour, width);
}

/** A square stone or tile with light top and left edges and dark bottom and right ones. */
function bevelled(ctx, x, y, w, h, colour, bw, light = 0.12, dark = 0.2) {
  rect(ctx, x, y, w, h, colour);
  if (bw <= 0.4) return;
  poly(ctx, [[x, y], [x + w, y], [x + w - bw, y + bw], [x + bw, y + bw]], rgba('#ffffff', light));
  poly(ctx, [[x, y], [x + bw, y + bw], [x + bw, y + h - bw], [x, y + h]], rgba('#ffffff', light * 0.6));
  poly(ctx, [[x, y + h], [x + bw, y + h - bw], [x + w - bw, y + h - bw], [x + w, y + h]], rgba('#000000', dark));
  poly(ctx, [[x + w, y], [x + w, y + h], [x + w - bw, y + h - bw], [x + w - bw, y + bw]], rgba('#000000', dark * 0.7));
}

/** Boards along rows (`perSquare` rows a square, `len` squares long, joints moved along each row). */
function boards(g, c, r, { perSquare, len, base, spread = 0.12, seam = 0.22, grain = true, nails = false, caulk = null }) {
  const { ctx, cell: k, seed } = g;
  const bh = 1 / perSquare;
  const lw = Math.max(0.7, k * 0.016);
  for (let j = 0; j < perSquare; j += 1) {
    const row = r * perSquare + j;
    const y = (r + j * bh) * k;
    const off = hash2(row, 0, seed) * len;
    const first = Math.floor((c - off) / len);
    const last = Math.floor((c + 1 - off) / len);
    for (let i = first; i <= last; i += 1) {
      const x1 = (off + i * len) * k;
      const x2 = (off + (i + 1) * len) * k;
      const h = hash2(row, i, seed + 5);
      const col = shade(base, (h - 0.5) * spread);
      rect(ctx, x1, y, x2 - x1, bh * k, col);
      if (grain && g.detail > 1) {
        for (let s = 0; s < 3; s += 1) {
          const gy = y + bh * k * (0.2 + hash2(row, i * 7 + s, seed + 9) * 0.6);
          const gx = x1 + (x2 - x1) * hash2(row, i * 5 + s, seed + 11) * 0.5;
          line(ctx, gx, gy, gx + (x2 - x1) * 0.45, gy + (hash2(i, row, seed + s) - 0.5) * bh * k * 0.3, rgba(shade(col, -0.12), 0.7), Math.max(0.5, k * 0.007));
        }
        if (h < 0.18) oval(ctx, x1 + (x2 - x1) * (0.2 + h * 3), y + bh * k * 0.5, bh * k * 0.22, bh * k * 0.14, 0, rgba(shade(col, -0.2), 0.8));
      }
      line(ctx, x1, y, x1, y + bh * k, caulk ?? shade(base, -seam), lw, 'butt');
      if (nails && g.detail > 1) {
        circle(ctx, x1 + k * 0.03, y + bh * k * 0.3, k * 0.011, '#2a2420');
        circle(ctx, x1 + k * 0.03, y + bh * k * 0.7, k * 0.011, '#2a2420');
        circle(ctx, x2 - k * 0.03, y + bh * k * 0.3, k * 0.011, '#2a2420');
        circle(ctx, x2 - k * 0.03, y + bh * k * 0.7, k * 0.011, '#2a2420');
      }
    }
    line(ctx, c * k, y, (c + 1) * k, y, caulk ?? shade(base, -seam), lw, 'butt');
  }
}

/** Neighbouring squares of another floor: [N, S, W, E] true where the floor changes. */
const sides = (g, c, r) => [g.at(c, r - 1), g.at(c, r + 1), g.at(c - 1, r), g.at(c + 1, r)].map((ch) => ch !== g.ch);

/**
 * Water and lava's shallows: a band along each shore, from where the land
 * ends (which wanders, as natural edges do) `extra` squares out.
 */
function shoreBands(g, c, r, extra, colour) {
  const { ctx, cell: k } = g;
  const K = g.detail > 1 ? 8 : 4;
  const shoreOf = (ch) => ch !== EMPTY && ch !== undefined && !(isWater(g.ch) ? isWater(ch) : ch === g.ch);
  ctx.fillStyle = colour;
  for (const [side, dc, dr, opp] of SIDES) {
    const b = g.at(c + dc, r + dr);
    if (!shoreOf(b)) continue;
    const bleeds = g.soft && isNatural(b) && blendOf(b) > blendOf(g.ch);
    const s = bleeds ? pairS(g.ch, b) : () => 0;
    ctx.beginPath();
    tracePoly(ctx, edgeBand(c, r, side, (x, y) => Math.max(0, Math.min(0.95, s(x, y) + extra)), K).poly, k);
    ctx.fill();
    if (bleeds) {
      // Where the water runs into the land's square, it's all shallows.
      ctx.beginPath();
      tracePoly(ctx, edgeBand(c + dc, r + dr, opp, (x, y) => Math.max(0, -s(x, y)), K).poly, k);
      ctx.fill();
    }
  }
}

/**
 * Each floor's texture, drawn for square (c, r) (over its base colour and
 * soft patches). Natural floors draw marks that may spill a little into the
 * squares round them (the clip keeps them on their floor), so they run on
 * seamlessly; built ones (TILED) draw only inside their square.
 */
const TILED = new Set(['s', 'f', 'e', 'k', 'M', 'S', 'b', 'w', 'z', 'j', 'x']);

const TEX = {
  // ----- built -----
  s(g, c, r) { // a stone tile a square, bevelled, worn
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    const gap = Math.max(1, k * 0.03);
    rect(ctx, c * k, r * k, k, k, shade(g.f.base, -0.24));
    const col = shade(g.f.base, (rnd() - 0.5) * 0.1 + (fbm(c * 0.3, r * 0.3, g.seed) - 0.5) * 0.1);
    bevelled(ctx, c * k + gap, r * k + gap, k - gap * 2, k - gap * 2, col, g.detail ? k * 0.05 : 0, 0.1, 0.16);
    if (g.detail > 1) {
      specks(g, c, r, rnd, 8, 0.03, 0.14, col);
      if (rnd() < 0.22) crackLine(g, c, r, rnd, rgba(shade(col, -0.3), 0.7), Math.max(0.6, k * 0.012));
      if (rnd() < 0.15) poly(ctx, [[c * k + gap, r * k + gap], [c * k + gap + k * 0.12, r * k + gap], [c * k + gap, r * k + gap + k * 0.1]], shade(g.f.base, -0.24));
    }
  },
  f(g, c, r) { // flagstones in rows, uneven lengths
    const { ctx, cell: k, seed } = g;
    rect(ctx, c * k, r * k, k, k, shade(g.f.base, -0.28));
    const gap = Math.max(1, k * 0.028);
    for (let j = 0; j < 2; j += 1) {
      const row = r * 2 + j;
      const y = (r + j * 0.5) * k;
      const L = 0.6;
      const at = (i) => i * L + (hash2(row, i, seed) - 0.5) * 0.3 + (row % 2) * 0.27;
      const first = Math.floor((c - 1) / L);
      const last = Math.ceil((c + 1) / L);
      for (let i = first; i <= last; i += 1) {
        const xa = at(i) * k;
        const xb = at(i + 1) * k;
        if (xb < c * k || xa > (c + 1) * k) continue;
        const h = hash2(row, i, seed + 3);
        const col = shade(g.f.base, (h - 0.5) * 0.16);
        bevelled(ctx, xa + gap, y + gap, xb - xa - gap * 2, k * 0.5 - gap * 2, col, g.detail ? k * 0.035 : 0, 0.1, 0.18);
        if (g.detail > 1 && h > 0.82) crackLine(g, c, r, rndOf(row, i, seed), rgba(shade(col, -0.3), 0.6), Math.max(0.5, k * 0.01));
      }
    }
  },
  e(g, c, r) { // dark slabs, two squares long, rows offset
    const { ctx, cell: k, seed } = g;
    rect(ctx, c * k, r * k, k, k, shade(g.f.base, -0.18));
    const gap = Math.max(1, k * 0.02);
    const off = r % 2;
    const i = Math.floor((c - off) / 2);
    const x1 = (i * 2 + off) * k;
    const h = hash2(i, r, seed);
    const col = shade(g.f.base, (h - 0.5) * 0.1);
    bevelled(ctx, x1 + gap, r * k + gap, k * 2 - gap * 2, k - gap * 2, col, g.detail ? k * 0.04 : 0, 0.07, 0.25);
    if (g.detail > 1) {
      const rnd = rndOf(c, r, seed);
      specks(g, c, r, rnd, 5, 0.03, 0.12, col);
      if (rnd() < 0.3) crackLine(g, c, r, rnd, rgba('#000000', 0.45), Math.max(0.6, k * 0.012));
    }
  },
  k(g, c, r) { // a chequerboard, a square each
    const { ctx, cell: k } = g;
    const light = (c + r) % 2 === 0;
    const rnd = rndOf(c, r, g.seed);
    const col = light ? shade(g.f.base, (rnd() - 0.5) * 0.05) : shade('#3b3733', (rnd() - 0.5) * 0.05);
    rect(ctx, c * k, r * k, k, k, col);
    if (g.detail) rect(ctx, c * k, r * k, k, k, null, rgba('#000000', 0.25), Math.max(0.5, k * 0.012));
    if (g.detail > 1) {
      const vx = (c + rnd()) * k;
      ctx.beginPath();
      ctx.moveTo(vx, r * k);
      ctx.bezierCurveTo(vx + (rnd() - 0.5) * k, (r + 0.3) * k, vx + (rnd() - 0.5) * k, (r + 0.7) * k, (c + rnd()) * k, (r + 1) * k);
      ctx.strokeStyle = rgba(light ? '#8a857c' : '#6a655f', 0.3);
      ctx.lineWidth = Math.max(0.5, k * 0.008);
      ctx.stroke();
    }
  },
  M(g, c, r) { // polished marble slabs with veins
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    const col = shade(g.f.base, (rnd() - 0.5) * 0.06);
    rect(ctx, c * k, r * k, k, k, radial(ctx, (c + 0.35) * k, (r + 0.3) * k, k * 0.9, shade(col, 0.04), shade(col, -0.03)));
    if (g.detail) {
      for (let v = 0; v < (g.detail > 1 ? 3 : 1); v += 1) {
        const pts = [];
        let x = c + rnd();
        let y = r;
        const drift = (rnd() - 0.5) * 0.6;
        for (let i = 0; i <= 8; i += 1) {
          pts.push([x * k, y * k]);
          x += drift / 8 + (rnd() - 0.5) * 0.12;
          y += 1 / 8;
        }
        polyline(ctx, pts, rgba('#7a7068', 0.25 + rnd() * 0.2), Math.max(0.5, k * (0.006 + rnd() * 0.01)));
      }
      rect(ctx, c * k, r * k, k, k, null, rgba('#8a837a', 0.6), Math.max(0.5, k * 0.01));
    }
  },
  S(g, c, r) { // sandstone blocks, half a square high, rows offset
    const { ctx, cell: k, seed } = g;
    rect(ctx, c * k, r * k, k, k, shade(g.f.base, -0.2));
    const gap = Math.max(1, k * 0.022);
    for (let j = 0; j < 2; j += 1) {
      const row = r * 2 + j;
      const off = (row % 2) * 0.5;
      for (let i = Math.floor(c - off) - 1; i <= Math.ceil(c + 1 - off); i += 1) {
        const x1 = (i + off) * k;
        if (x1 > (c + 1) * k || x1 + k < c * k) continue;
        const h = hash2(row, i, seed);
        const col = shade(g.f.base, (h - 0.5) * 0.14);
        bevelled(ctx, x1 + gap, (r + j * 0.5) * k + gap, k - gap * 2, k * 0.5 - gap * 2, col, g.detail ? k * 0.035 : 0, 0.12, 0.16);
      }
    }
    if (g.detail > 1) specks(g, c, r, rndOf(c, r, seed), 12, 0.02, 0.16);
  },
  b(g, c, r) { // bricks in a basket weave: pairs across, then pairs down
    const { ctx, cell: k, seed } = g;
    rect(ctx, c * k, r * k, k, k, shade(g.f.base, -0.25));
    const gap = Math.max(0.8, k * 0.018);
    for (let j = 0; j < 2; j += 1) {
      for (let i = 0; i < 2; i += 1) {
        const bx = c * 2 + i;
        const by = r * 2 + j;
        const x = (c + i * 0.5) * k;
        const y = (r + j * 0.5) * k;
        for (let n = 0; n < 2; n += 1) {
          const h = hash2(bx * 2 + n, by, seed);
          const col = shade(g.f.base, (h - 0.5) * 0.18);
          if ((bx + by) % 2) bevelled(ctx, x + gap, y + (n * k) / 4 + gap, k / 2 - gap * 2, k / 4 - gap * 2, col, g.detail > 1 ? k * 0.02 : 0, 0.1, 0.18);
          else bevelled(ctx, x + (n * k) / 4 + gap, y + gap, k / 4 - gap * 2, k / 2 - gap * 2, col, g.detail > 1 ? k * 0.02 : 0, 0.1, 0.18);
        }
      }
    }
  },
  c(g, c, r) { // cobbles: rounded stones in dark mortar
    const { ctx, cell: k, seed } = g;
    const n = 3;
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const gx = c * n + i;
        const gy = r * n + j;
        const rnd = rndOf(gx, gy, seed);
        const x = (c + (i + 0.5 + (rnd() - 0.5) * 0.35) / n) * k;
        const y = (r + (j + 0.5 + (rnd() - 0.5) * 0.35) / n) * k;
        const rr = (k / n) * (0.4 + rnd() * 0.08);
        const col = shade(g.f.base, (rnd() - 0.4) * 0.22);
        const pts = blobPoints(x, y, rr, rr * (0.85 + rnd() * 0.15), 7, 0.28, rnd, rnd() * TAU);
        if (g.detail > 1) smoothShape(ctx, pts.map(([px, py]) => [px + rr * 0.12, py + rr * 0.16]), 'rgba(0,0,0,0.3)');
        smoothShape(ctx, pts, col);
        if (g.detail) circle(ctx, x - rr * 0.25, y - rr * 0.28, rr * 0.4, rgba(shade(col, 0.16), 0.7));
      }
    }
  },
  w(g, c, r) {
    boards(g, c, r, { perSquare: 4, len: 1.5, base: g.f.base, nails: true });
  },
  z(g, c, r) { // parquet: blocks of three strips, turned each way in turn
    const { ctx, cell: k, seed } = g;
    for (let j = 0; j < 2; j += 1) {
      for (let i = 0; i < 2; i += 1) {
        const bx = c * 2 + i;
        const by = r * 2 + j;
        const x = (c + i * 0.5) * k;
        const y = (r + j * 0.5) * k;
        const across = (bx + by) % 2 === 0;
        for (let n = 0; n < 3; n += 1) {
          const col = shade(g.f.base, (hash2(bx * 3 + n, by, seed) - 0.5) * 0.16 + (across ? 0.03 : -0.03));
          if (across) rect(ctx, x, y + (n * k) / 6, k / 2, k / 6, col, rgba('#2a1a0e', 0.55), Math.max(0.5, k * 0.01));
          else rect(ctx, x + (n * k) / 6, y, k / 6, k / 2, col, rgba('#2a1a0e', 0.55), Math.max(0.5, k * 0.01));
        }
      }
    }
    if (g.detail) rect(ctx, c * k, r * k, k, k, rgba('#ffffff', 0.04));
  },
  j(g, c, r) {
    boards(g, c, r, { perSquare: 5, len: 3, base: g.f.base, spread: 0.1, caulk: '#1d1611', nails: true, grain: true });
  },
  p(g, c, r) { // carpet: a small pattern, with a border where it ends
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    if (g.detail) {
      for (let j = 0; j < 2; j += 1) {
        for (let i = 0; i < 2; i += 1) {
          const x = (c + (i + 0.5) / 2) * k;
          const y = (r + (j + 0.5) / 2) * k;
          const s = k * 0.11;
          poly(ctx, [[x, y - s], [x + s, y], [x, y + s], [x - s, y]], shade(g.f.base, 0.09), shade(g.f.base, -0.1), Math.max(0.5, k * 0.008));
          circle(ctx, x, y, k * 0.022, rgba('#d9b44a', 0.8));
          circle(ctx, (c + i / 2) * k, (r + j / 2) * k, k * 0.014, rgba('#d9b44a', 0.55));
        }
      }
      if (g.detail > 1) specks(g, c, r, rnd, 14, 0.015, 0.1);
    }
    const [N, S, W, E] = sides(g, c, r);
    const inset = k * 0.09;
    const gold = '#c9a24a';
    const lw = Math.max(1, k * 0.035);
    const x1 = c * k;
    const y1 = r * k;
    const x2 = (c + 1) * k;
    const y2 = (r + 1) * k;
    if (N) { rect(ctx, x1, y1, k, inset * 0.7, shade(g.f.base, -0.2)); line(ctx, x1 + (W ? inset : 0), y1 + inset, x2 - (E ? inset : 0), y1 + inset, gold, lw, 'butt'); }
    if (S) { rect(ctx, x1, y2 - inset * 0.7, k, inset * 0.7, shade(g.f.base, -0.2)); line(ctx, x1 + (W ? inset : 0), y2 - inset, x2 - (E ? inset : 0), y2 - inset, gold, lw, 'butt'); }
    if (W) { rect(ctx, x1, y1, inset * 0.7, k, shade(g.f.base, -0.2)); line(ctx, x1 + inset, y1 + (N ? inset : 0), x1 + inset, y2 - (S ? inset : 0), gold, lw, 'butt'); }
    if (E) { rect(ctx, x2 - inset * 0.7, y1, inset * 0.7, k, shade(g.f.base, -0.2)); line(ctx, x2 - inset, y1 + (N ? inset : 0), x2 - inset, y2 - (S ? inset : 0), gold, lw, 'butt'); }
  },
  x(g, c, r) { // iron grating over darkness
    const { ctx, cell: k } = g;
    rect(ctx, c * k, r * k, k, k, '#101113');
    const n = 4;
    const bw = k * 0.06;
    for (let i = 0; i <= n; i += 1) {
      const p = (i / n) * k;
      rect(ctx, c * k, r * k + p - bw / 2, k, bw, '#46484d');
      rect(ctx, c * k + p - bw / 2, r * k, bw, k, '#3d3f44');
      if (g.detail) {
        rect(ctx, c * k, r * k + p - bw / 2, k, bw * 0.3, '#6a6d73');
        rect(ctx, c * k + p - bw / 2, r * k, bw * 0.3, k, '#5f6268');
      }
    }
    if (g.detail > 1) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) circle(ctx, (c + dx) * k, (r + dy) * k, k * 0.035, '#5a5d63', '#2a2c30', Math.max(0.5, k * 0.008));
  },
  y(g, c, r) { // straw strewn about
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    const n = g.detail > 1 ? 34 : g.detail ? 14 : 0;
    for (let i = 0; i < n; i += 1) {
      const x = (c + rnd()) * k;
      const y = (r + rnd()) * k;
      const a = rnd() * TAU;
      const l = k * (0.08 + rnd() * 0.14);
      line(ctx, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, shade(rnd() < 0.2 ? '#9a7a3a' : g.f.base, (rnd() - 0.4) * 0.3), Math.max(0.6, k * 0.014));
    }
  },
  // ----- natural -----
  g(g, c, r) { // grass
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    blades(g, c, r, rnd, g.detail > 1 ? 14 : 5, 0.09, g.f.base);
    if (g.detail > 1 && rnd() < 0.1) {
      const x = c + rnd();
      const y = r + rnd();
      for (let i = 0; i < 4; i += 1) circle(g.ctx, (x + (rnd() - 0.5) * 0.2) * g.cell, (y + (rnd() - 0.5) * 0.2) * g.cell, g.cell * 0.018, rnd() < 0.5 ? '#f4f0dc' : '#f2d14a');
    }
  },
  G(g, c, r) { // dry grass
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    if (rnd() < 0.25 && g.at(c, r) === g.ch) {
      const x = (c + rnd()) * g.cell;
      const y = (r + rnd()) * g.cell;
      const rad = g.cell * (0.15 + rnd() * 0.2);
      g.ctx.fillStyle = radial(g.ctx, x, y, rad, rgba('#8a6e44', 0.45), rgba('#8a6e44', 0));
      g.ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    blades(g, c, r, rnd, g.detail > 1 ? 11 : 4, 0.13, g.f.base, 0.3);
  },
  o(g, c, r) { // moss
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    for (let i = 0; i < (g.detail > 1 ? 7 : 3); i += 1) {
      const x = (c + rnd()) * g.cell;
      const y = (r + rnd()) * g.cell;
      circle(g.ctx, x, y, g.cell * (0.06 + rnd() * 0.1), rgba(shade(g.f.base, (rnd() - 0.45) * 0.24), 0.55));
    }
    if (g.detail > 1) specks(g, c, r, rnd, 12, 0.02, 0.3, g.f.base, true);
  },
  l(g, c, r) { // forest floor: leaves and twigs
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    const leaves = ['#7a5a2a', '#8a4a1a', '#5a6a2a', '#a0602a', '#4a3a1a', '#6a7a32'];
    for (let i = 0; i < (g.detail > 1 ? 16 : 6); i += 1) oval(ctx, (c + rnd()) * k, (r + rnd()) * k, k * (0.03 + rnd() * 0.025), k * 0.018, rnd() * TAU, leaves[Math.floor(rnd() * leaves.length)]);
    if (g.detail > 1) {
      for (let i = 0; i < 2; i += 1) {
        const x = (c + rnd()) * k;
        const y = (r + rnd()) * k;
        const a = rnd() * TAU;
        line(ctx, x, y, x + Math.cos(a) * k * 0.22, y + Math.sin(a) * k * 0.22, '#3a2a1a', Math.max(0.6, k * 0.014));
      }
      if (rnd() < 0.3) circle(ctx, (c + rnd()) * k, (r + rnd()) * k, k * 0.12, rgba('#4f7a3a', 0.35));
    }
  },
  d(g, c, r) { // dirt: specks and pebbles
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    specks(g, c, r, rnd, g.detail > 1 ? 14 : 6, 0.025, 0.22);
    pebbles(g, c, r, rnd, g.detail > 1 ? 4 : 1, 0.03, '#8a7a66');
  },
  t(g, c, r) { // farmland: furrows across, with shoots
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    const n = 4;
    for (let j = 0; j < n; j += 1) {
      const y = (r + (j + 0.5) / n) * k;
      line(ctx, c * k, y - k * 0.06, (c + 1) * k, y - k * 0.06, shade(g.f.base, 0.1), Math.max(1, k * 0.07), 'butt');
      line(ctx, c * k, y + k * 0.06, (c + 1) * k, y + k * 0.06, shade(g.f.base, -0.12), Math.max(0.8, k * 0.05), 'butt');
      if (g.detail > 1) for (let i = 0; i < 6; i += 1) if (rnd() < 0.6) circle(ctx, (c + (i + rnd() * 0.5) / 6) * k, y - k * 0.06, k * 0.022, shade('#5f8f35', (rnd() - 0.5) * 0.2));
    }
  },
  v(g, c, r) { // gravel
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    pebbles(g, c, r, rnd, g.detail > 1 ? 26 : 10, 0.028, g.f.base);
  },
  a(g, c, r) { // sand: wind ripples
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    for (let j = 0; j < 3; j += 1) {
      const y0 = r + (j + 0.3) / 3;
      const pts = [];
      for (let i = 0; i <= 6; i += 1) {
        const x = c + i / 6;
        pts.push([x * k, (y0 + Math.sin(x * 5.1 + y0 * 3) * 0.04 + (noise(x * 2, y0 * 2, g.seed) - 0.5) * 0.1) * k]);
      }
      polyline(ctx, pts, rgba(shade(g.f.base, 0.12), 0.55), Math.max(0.6, k * 0.014));
    }
    if (g.detail > 1) specks(g, c, r, rnd, 10, 0.016, 0.2, g.f.base, true);
  },
  r(g, c, r) { // cave floor: cracks and stones
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    specks(g, c, r, rnd, 8, 0.03, 0.16);
    if (rnd() < 0.35) crackLine(g, c, r, rnd, rgba('#1a1816', 0.55), Math.max(0.6, g.cell * 0.014));
    pebbles(g, c, r, rnd, g.detail > 1 ? 3 : 1, 0.035, '#6a645c');
  },
  u(g, c, r) { // rubble: broken stone everywhere
    const { cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    for (let i = 0; i < (g.detail > 1 ? 9 : 4); i += 1) {
      const x = (c + rnd()) * k;
      const y = (r + rnd()) * k;
      const rr = k * (0.04 + rnd() * 0.08);
      const col = shade('#857f74', (rnd() - 0.5) * 0.2);
      const pts = blobPoints(x, y, rr, rr * 0.8, 5 + Math.floor(rnd() * 3), 0.5, rnd, rnd() * TAU);
      if (g.detail > 1) poly(g.ctx, pts.map(([px, py]) => [px + rr * 0.3, py + rr * 0.35]), 'rgba(0,0,0,0.3)');
      poly(g.ctx, pts, col, shade(col, -0.25), Math.max(0.5, k * 0.008));
    }
    specks(g, c, r, rnd, 8, 0.02, 0.2);
  },
  q(g, c, r) { // ash, with a few embers
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    specks(g, c, r, rnd, g.detail > 1 ? 16 : 6, 0.02, 0.35, g.f.base, true);
    if (rnd() < 0.12) {
      const x = (c + rnd()) * g.cell;
      const y = (r + rnd()) * g.cell;
      glow(g.ctx, x, y, g.cell * 0.12, '#ff7a2a', 0.5);
      circle(g.ctx, x, y, g.cell * 0.02, '#ffb04a');
    }
  },
  n(g, c, r) { // snow: drifts and sparkle
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    for (let i = 0; i < 2 && g.at(c, r) === g.ch; i += 1) {
      const x = (c + rnd()) * k;
      const y = (r + rnd()) * k;
      const rad = k * (0.2 + rnd() * 0.25);
      ctx.fillStyle = radial(ctx, x, y, rad, rgba(rnd() < 0.5 ? '#ffffff' : '#b9c8d6', 0.45), rgba('#ffffff', 0));
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    if (g.detail > 1) for (let i = 0; i < 6; i += 1) circle(ctx, (c + rnd()) * k, (r + rnd()) * k, k * 0.01, '#ffffff');
  },
  i(g, c, r) { // ice: cracks and shine
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    if (rnd() < 0.6) crackLine(g, c, r, rnd, rgba('#ffffff', 0.55), Math.max(0.6, k * 0.012));
    if (g.detail > 1) {
      const x = (c + rnd()) * k;
      const y = (r + rnd()) * k;
      line(ctx, x, y, x + k * 0.25, y - k * 0.25, rgba('#ffffff', 0.3), Math.max(0.8, k * 0.03));
      if (rnd() < 0.4) circle(ctx, (c + rnd()) * k, (r + rnd()) * k, k * 0.15, rgba('#8fb8cc', 0.25));
    }
  },
  m(g, c, r) { // mud: wet shine and puddles
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    for (let i = 0; i < 3; i += 1) smoothShape(ctx, blobPoints((c + rnd()) * k, (r + rnd()) * k, k * (0.06 + rnd() * 0.12), k * (0.04 + rnd() * 0.08), 7, 0.5, rnd), rgba(shade(g.f.base, 0.14), 0.35));
    if (rnd() < 0.25) {
      const x = (c + 0.2 + rnd() * 0.6) * k;
      const y = (r + 0.2 + rnd() * 0.6) * k;
      smoothShape(ctx, blobPoints(x, y, k * 0.16, k * 0.11, 8, 0.4, rnd), rgba('#3a3226', 0.85), rgba(shade(g.f.base, 0.2), 0.5), Math.max(0.5, k * 0.012));
      line(ctx, x - k * 0.06, y - k * 0.03, x + k * 0.03, y - k * 0.05, rgba('#ffffff', 0.3), Math.max(0.5, k * 0.012));
    }
    if (g.detail > 1) specks(g, c, r, rnd, 8, 0.02, 0.2);
  },
  h(g, c, r) { // marsh: pools and reeds
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    if (!g.detail) return;
    for (let i = 0; i < 2; i += 1) {
      if (rnd() < 0.35) continue;
      smoothShape(ctx, blobPoints((c + rnd()) * k, (r + rnd()) * k, k * (0.1 + rnd() * 0.14), k * (0.07 + rnd() * 0.1), 8, 0.45, rnd), rgba('#2e4a44', 0.75), rgba('#6a8a5a', 0.4), Math.max(0.5, k * 0.012));
    }
    if (g.detail > 1) {
      for (let t = 0; t < 2; t += 1) {
        const x = (c + rnd()) * k;
        const y = (r + rnd()) * k;
        for (let s = 0; s < 5; s += 1) {
          const a = rnd() * TAU;
          line(ctx, x, y, x + Math.cos(a) * k * 0.09, y + Math.sin(a) * k * 0.09, shade('#7a8a3a', (rnd() - 0.5) * 0.3), Math.max(0.6, k * 0.014));
        }
      }
    }
  },
  W(g, c, r) {
    water(g, c, r, 1);
  },
  D(g, c, r) {
    water(g, c, r, 0.4);
  },
  L(g, c, r) { // lava: plates of dark crust with molten cracks between
    const { ctx, cell: k } = g;
    const rnd = rndOf(c, r, g.seed);
    if (g.at(c, r) === g.ch) {
      const hot = (c + 0.2 + rnd() * 0.6) * k;
      const hy = (r + 0.2 + rnd() * 0.6) * k;
      ctx.fillStyle = radial(ctx, hot, hy, k * 0.7, rgba('#ffc23a', 0.6), rgba('#ff8a1a', 0));
      ctx.fillRect(hot - k * 0.7, hy - k * 0.7, k * 1.4, k * 1.4);
    }
    if (g.detail) {
      const n = 2;
      for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
          const pr = rndOf(c * n + i, r * n + j, g.seed + 3);
          if (pr() < 0.12) continue;
          const x = (c + (i + 0.5 + (pr() - 0.5) * 0.3) / n) * k;
          const y = (r + (j + 0.5 + (pr() - 0.5) * 0.3) / n) * k;
          const rr = (k / n) * (0.44 + pr() * 0.08);
          const pts = blobPoints(x, y, rr, rr * (0.8 + pr() * 0.2), 7, 0.3, pr, pr() * TAU);
          const col = shade('#3a1d12', (pr() - 0.5) * 0.1);
          poly(ctx, pts, col, rgba('#ff8a2a', 0.7), Math.max(0.8, k * 0.02));
          if (g.detail > 1) poly(ctx, pts.map(([px, py]) => [x + (px - x) * 0.7 - rr * 0.06, y + (py - y) * 0.7 - rr * 0.08]), rgba(shade(col, 0.07), 0.8));
        }
      }
    }
    shoreBands(g, c, r, 0.14, rgba('#2a1208', 0.6));
  },
};

/** Water: lighter in the shallows by the shore, ripples, deeper water darker. */
function water(g, c, r, ripples) {
  const { ctx, cell: k } = g;
  if (!isWater(g.at(c, r))) return;
  const rnd = rndOf(c, r, g.seed);
  const d = g.depth ? g.depth[r * g.cols + c] : 4;
  const col = d === 0 ? shade(g.f.base, 0.06) : d === 1 ? shade(g.f.base, 0.02) : d === 255 ? g.f.base : shade(g.f.base, -0.03 * Math.min(3, d - 1));
  const cx = (c + 0.5) * k;
  const cy = (r + 0.5) * k;
  ctx.fillStyle = radial(ctx, cx, cy, k * 0.95, rgba(col, 0.8), rgba(col, 0));
  ctx.fillRect(cx - k, cy - k, k * 2, k * 2);
  shoreBands(g, c, r, 0.3, rgba(shade(g.f.base, 0.1), 0.45));
  shoreBands(g, c, r, 0.14, rgba(shade(g.f.base, 0.2), 0.4));
  if (!g.detail) return;
  const n = Math.round((g.detail > 1 ? 2 : 1) * ripples + rnd() * 0.6);
  for (let i = 0; i < n; i += 1) {
    const x = (c + rnd()) * k;
    const y = (r + rnd()) * k;
    const l = k * (0.12 + rnd() * 0.16);
    ctx.beginPath();
    ctx.moveTo(x - l / 2, y);
    ctx.quadraticCurveTo(x, y - l * 0.25, x + l / 2, y);
    ctx.strokeStyle = rgba(shade(g.f.base, 0.25), 0.45);
    ctx.lineWidth = Math.max(0.6, k * 0.016);
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

/** The order floors are drawn in: built ones first, then natural ones from the lowest up (so the higher run over the lower). */
const rank = (ch) => (isNatural(ch) ? blendOf(ch) : -100);

/**
 * The floor, every square (or just `region`, { x1, y1, x2, y2 } in squares,
 * when part of it changed): the empty colour, each floor's texture clipped to
 * its squares, natural floors running unevenly into lower ones (unless the
 * look isn't soft), then the edges: shade where floor meets nothing, foam
 * where water meets land.
 */
export function drawFloor(ctx, design, cell = DESIGN_CELL, region = null) {
  const look = normalizeLook(design.look);
  const { cols, rows, floor } = design;
  const R = region
    ? { x1: clampInt(Math.floor(region.x1), 0, cols), y1: clampInt(Math.floor(region.y1), 0, rows), x2: clampInt(Math.ceil(region.x2), 0, cols), y2: clampInt(Math.ceil(region.y2), 0, rows) }
    : { x1: 0, y1: 0, x2: cols, y2: rows };
  if (R.x2 <= R.x1 || R.y2 <= R.y1) return;
  const at = (c, r) => (c >= 0 && r >= 0 && c < cols && r < rows ? floor[r][c] : undefined);
  const detail = detailAt(cell);
  const K = detail > 1 ? 12 : detail ? 6 : 3;
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x1 * cell, R.y1 * cell, (R.x2 - R.x1) * cell, (R.y2 - R.y1) * cell);
  ctx.clip();
  ctx.fillStyle = look.void;
  ctx.fillRect(R.x1 * cell, R.y1 * cell, (R.x2 - R.x1) * cell, (R.y2 - R.y1) * cell);
  // The squares drawn: the region and one more all round, as their marks and edges reach in.
  const M = { x1: Math.max(0, R.x1 - 1), y1: Math.max(0, R.y1 - 1), x2: Math.min(cols, R.x2 + 1), y2: Math.min(rows, R.y2 + 1) };
  // Each floor's squares, the bits of other squares its ground wanders into, and its edges.
  const own = new Map();
  const ext = new Map();
  const edges = new Map();
  const add = (map, key, v) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(v);
  };
  for (let r = M.y1; r < M.y2; r += 1) {
    for (let c = M.x1; c < M.x2; c += 1) {
      const ch = floor[r][c];
      if (ch === EMPTY) continue;
      add(own, ch, [c, r]);
      if (!look.soft || !isNatural(ch)) continue;
      const shape = cellShape(at, c, r, ch, K);
      for (const e of shape.ext) add(ext, ch, e);
      for (const e of shape.edges) add(edges, ch, e);
    }
  }
  const depth = [...own.keys()].some(isWater) ? waterDepth(design) : null;
  const order = [...own.keys()].sort((p, q) => rank(p) - rank(q));
  /** One floor's texture (base colour, soft patches from `patches`, marks from `cells`), inside the clip already set. */
  const paint = (ch, cells, patches = cells) => {
    const g = { ctx, cell, detail, ch, f: FLOORS[ch], seed: FSEED(ch), at, depth, cols, soft: look.soft };
    ctx.fillStyle = g.f.base;
    ctx.fillRect(M.x1 * cell, M.y1 * cell, (M.x2 - M.x1) * cell, (M.y2 - M.y1) * cell);
    for (const [c, r] of patches) mottle(g, c, r);
    const tex = TEX[ch];
    for (const [c, r] of cells) {
      if (TILED.has(ch)) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(c * cell, r * cell, cell, cell);
        ctx.clip();
        tex(g, c, r);
        ctx.restore();
      } else tex(g, c, r);
    }
  };
  // First each floor in its own squares...
  for (const ch of order) {
    const cells = own.get(ch);
    ctx.save();
    ctx.beginPath();
    for (const [c, r] of cells) ctx.rect(c * cell, r * cell, cell, cell);
    ctx.clip();
    paint(ch, cells);
    ctx.restore();
  }
  // ...then where natural ground wanders over its edges, the lowest first, so a higher floor wins where pieces meet.
  for (const ch of order) {
    const into = ext.get(ch);
    if (!into) continue;
    ctx.save();
    ctx.beginPath();
    for (const e of into) tracePoly(ctx, e.poly, cell);
    ctx.clip();
    // Its soft patches there come from its own squares round about (in the same order as before, so they match up across
    // the edge); its marks from those and from the squares wandered into.
    const mine = new Set(own.get(ch).map(([c, r]) => r * cols + c));
    const patches = new Set();
    const marks = new Set();
    for (const e of into) {
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const cc = e.c + dc;
          const rr = e.r + dr;
          if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
          const key = rr * cols + cc;
          if (mine.has(key)) patches.add(key);
          if ((dc === 0 && dr === 0) || (mine.has(key) && Math.abs(dc) <= 1 && Math.abs(dr) <= 1)) marks.add(key);
        }
      }
    }
    const cellsOf = (set) => [...set].sort((p, q) => p - q).map((key) => [key % cols, Math.floor(key / cols)]);
    paint(ch, cellsOf(marks), cellsOf(patches));
    ctx.restore();
  }
  // Soften where one natural floor meets another.
  if (detail) {
    for (const [ch, list] of edges) {
      const colour = rgba(FLOORS[ch].base, 0.3);
      for (const pts of list) polyline(ctx, toPx(pts, cell), colour, Math.max(1, cell * 0.06));
    }
  }
  // Foam where water meets land.
  if (depth && detail) {
    const foam = (pts) => {
      polyline(ctx, toPx(pts, cell), rgba('#ffffff', 0.5), Math.max(1, cell * 0.035));
    };
    for (const [ch, cells] of own) {
      if (!isWater(ch)) continue;
      for (const [c, r] of cells) {
        for (const [side, dc, dr] of SIDES) {
          const b = at(c + dc, r + dr);
          if (!b || b === EMPTY || isWater(b)) continue;
          const bleeds = look.soft && isNatural(b) && blendOf(b) > blendOf(ch);
          const s = bleeds ? pairS(ch, b) : () => 0;
          foam(edgeLine(c, r, side, (x, y) => -s(x, y), K));
          polyline(ctx, toPx(edgeLine(c, r, side, (x, y) => -s(x, y) - 0.09, K), cell), rgba('#ffffff', 0.18), Math.max(0.8, cell * 0.025));
        }
        if (!look.soft) continue;
        for (const [ox, oy, dc, dr, a0] of CORNERS) {
          const b = at(c + dc, r + dr);
          if (!b || b === EMPTY || isWater(b) || !isNatural(b) || blendOf(b) <= blendOf(ch)) continue;
          if (at(c + dc, r) === b || at(c, r + dr) === b || !isWater(at(c + dc, r)) || !isWater(at(c, r + dr))) continue;
          const px = c + ox;
          const py = r + oy;
          const rad = pairS(ch, b)(px, py);
          if (rad > 0.02) foam(cornerBlob(px, py, a0 + Math.PI, rad, K).inner);
          else if (rad < -0.02) foam(cornerBlob(px, py, a0, -rad, K).inner);
        }
      }
    }
  }
  // Shade where floor meets nothing (the edge of a cave, a room with no walls yet).
  if (look.shadows) {
    const band = cell * 0.32;
    for (let r = M.y1; r < M.y2; r += 1) {
      for (let c = M.x1; c < M.x2; c += 1) {
        if (floor[r][c] === EMPTY) continue;
        const x = c * cell;
        const y = r * cell;
        const empty = (dc, dr) => at(c + dc, r + dr) === EMPTY;
        const shadeSide = (x1, y1, x2, y2, bx, by, bw, bh) => {
          const gr = ctx.createLinearGradient(x1, y1, x2, y2);
          gr.addColorStop(0, 'rgba(0,0,0,0.45)');
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr;
          ctx.fillRect(bx, by, bw, bh);
        };
        if (empty(0, -1)) shadeSide(x, y, x, y + band, x, y, cell, band);
        if (empty(0, 1)) shadeSide(x, y + cell, x, y + cell - band, x, y + cell - band, cell, band);
        if (empty(-1, 0)) shadeSide(x, y, x + band, y, x, y, band, cell);
        if (empty(1, 0)) shadeSide(x + cell, y, x + cell - band, y, x + cell - band, y, band, cell);
        for (const [dc, dr, px, py] of [[-1, -1, x, y], [1, -1, x + cell, y], [1, 1, x + cell, y + cell], [-1, 1, x, y + cell]]) {
          if (!empty(dc, dr) || empty(dc, 0) || empty(0, dr)) continue;
          ctx.fillStyle = radial(ctx, px, py, band, 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0)');
          ctx.fillRect(px - band, py - band, band * 2, band * 2);
        }
      }
    }
  }
  ctx.restore();
}

// ---------- paths: roads, rivers, cracks ----------

/** Points every `step` pixels along a line, with the way across it there: [{ x, y, nx, ny, t (pixels along) }]. */
function along(pts, step) {
  const out = [];
  let carry = 0;
  let t = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (!len) continue;
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    let d = carry;
    while (d <= len) {
      out.push({ x: x1 + ((x2 - x1) * d) / len, y: y1 + ((y2 - y1) * d) / len, nx, ny, t: t + d });
      d += step;
    }
    carry = d - len;
    t += len;
  }
  return out;
}

/** A line moved `d` pixels to one side (negative: the other). */
function offsetLine(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] - ((b[1] - a[1]) / len) * d, p[1] + ((b[0] - a[0]) / len) * d];
  });
}

/** A line wobbled sideways by smooth noise (up to `amp` pixels), for cracks and rough edges. */
function wobble(pts, amp, k, seed) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const n = (noise(p[0] / k * 3, p[1] / k * 3, seed) - 0.5) * 2 * amp;
    return [p[0] - ((b[1] - a[1]) / len) * n, p[1] + ((b[0] - a[0]) / len) * n];
  });
}

/** A band along a line, `w` pixels wide, its width wandering a little (`vary`): a polygon, filled with round ends. */
function ribbon(ctx, pts, w, k, seed, vary, fill) {
  if (pts.length < 2) return;
  const left = [];
  const right = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const fl = 1 + (noise(p[0] / k * 1.3, p[1] / k * 1.3, seed) - 0.5) * 2 * vary;
    const fr = 1 + (noise(p[0] / k * 1.3, p[1] / k * 1.3, seed + 7) - 0.5) * 2 * vary;
    left.push([p[0] + nx * (w / 2) * fl, p[1] + ny * (w / 2) * fl]);
    right.push([p[0] - nx * (w / 2) * fr, p[1] - ny * (w / 2) * fr]);
  });
  poly(ctx, [...left, ...right.reverse()], fill);
  const end = (p, q, l, r) => circle(ctx, (l[0] + r[0]) / 2, (l[1] + r[1]) / 2, Math.hypot(l[0] - r[0], l[1] - r[1]) / 2, fill);
  end(pts[0], pts[1], left[0], right.at(-1));
  end(pts.at(-1), pts.at(-2), left.at(-1), right[0]);
  return { left, right: right.reverse() };
}

const PATH_ART = {
  road(ctx, pts, w, k, rnd, detail) {
    ribbon(ctx, pts, w * 1.2, k, 61, 0.14, rgba('#4a3420', 0.32));
    ribbon(ctx, pts, w, k, 63, 0.1, '#8a6a46');
    polyline(ctx, wobble(pts, w * 0.12, k, 3), rgba('#9a7a52', 0.6), w * 0.62);
    if (!detail) return;
    for (const s of [-1, 1]) polyline(ctx, offsetLine(pts, s * w * 0.22), rgba('#5e4630', 0.45), Math.max(1, w * 0.07));
    if (detail > 1) for (const p of along(pts, k * 0.14)) if (rnd() < 0.5) circle(ctx, p.x + p.nx * (rnd() - 0.5) * w * 0.9, p.y + p.ny * (rnd() - 0.5) * w * 0.9, k * (0.012 + rnd() * 0.02), shade('#7a6248', (rnd() - 0.5) * 0.3));
  },
  cobble(ctx, pts, w, k, rnd, detail) {
    polyline(ctx, pts, rgba('#2e2a26', 0.4), w * 1.08);
    polyline(ctx, pts, '#4e4a44', w);
    if (!detail) return;
    const across = Math.max(2, Math.round(w / (k * 0.3)));
    for (const p of along(pts, k * 0.27)) {
      for (let i = 0; i < across; i += 1) {
        const off = ((i + 0.5) / across - 0.5) * w * 0.9 + (rnd() - 0.5) * k * 0.05;
        const x = p.x + p.nx * off;
        const y = p.y + p.ny * off;
        const rr = k * (0.11 + rnd() * 0.03);
        const col = shade('#857f75', (rnd() - 0.4) * 0.22);
        smoothShape(ctx, blobPoints(x, y, rr, rr * 0.85, 6, 0.3, rnd, rnd() * TAU), col);
        if (detail > 1) circle(ctx, x - rr * 0.25, y - rr * 0.25, rr * 0.4, rgba(shade(col, 0.15), 0.7));
      }
    }
    for (const s of [-1, 1]) polyline(ctx, offsetLine(pts, s * w * 0.52), rgba('#3a3632', 0.6), Math.max(1, k * 0.035));
  },
  trail(ctx, pts, w, k) {
    polyline(ctx, wobble(pts, w * 0.2, k, 5), rgba('#7a5c3c', 0.55), w);
    polyline(ctx, wobble(pts, w * 0.15, k, 7), rgba('#8f7050', 0.5), w * 0.55);
  },
  stones(ctx, pts, w, k, rnd) {
    let i = 0;
    for (const p of along(pts, k * 0.75)) {
      const off = (i % 2 ? 1 : -1) * w * 0.18;
      i += 1;
      const x = p.x + p.nx * off;
      const y = p.y + p.ny * off;
      const rr = Math.min(w * 0.42, k * 0.32) * (0.85 + rnd() * 0.3);
      oval(ctx, x + k * 0.04, y + k * 0.05, rr, rr * 0.8, rnd(), 'rgba(0,0,0,0.3)');
      smoothShape(ctx, blobPoints(x, y, rr, rr * 0.8, 8, 0.2, rnd, rnd() * TAU), radial(ctx, x, y, rr, '#a29c92', '#77716a', x - rr * 0.3, y - rr * 0.3), '#55504a', Math.max(0.8, k * 0.015));
    }
  },
  river(ctx, pts, w, k, rnd, detail) {
    waterPath(ctx, pts, w, k, rnd, detail, '#2f6f9a');
  },
  stream(ctx, pts, w, k, rnd, detail) {
    waterPath(ctx, pts, w, k, rnd, detail, '#3a7aa4');
  },
  lava(ctx, pts, w, k, rnd, detail) {
    polyline(ctx, wobble(pts, w * 0.1, k, 9), '#2a140c', w * 1.22);
    polyline(ctx, pts, '#d9480f', w);
    polyline(ctx, wobble(pts, w * 0.14, k, 11), rgba('#ffa62a', 0.85), w * 0.55);
    polyline(ctx, wobble(pts, w * 0.12, k, 13), rgba('#fff1a8', 0.6), w * 0.2);
    if (!detail) return;
    for (const p of along(pts, k * 0.3)) {
      if (rnd() < 0.4) continue;
      const off = (rnd() - 0.5) * w * 0.8;
      const rr = Math.min(w * 0.2, k * 0.12) * (0.6 + rnd() * 0.6);
      smoothShape(ctx, blobPoints(p.x + p.nx * off, p.y + p.ny * off, rr, rr * 0.8, 6, 0.4, rnd), '#3a1a0e', rgba('#ff7a1a', 0.6), Math.max(0.5, k * 0.012));
    }
  },
  crack(ctx, pts, w, k, rnd) {
    const main = wobble(pts, Math.max(w * 0.8, k * 0.12), k, 17);
    polyline(ctx, main.map(([x, y]) => [x + k * 0.02, y + k * 0.02]), rgba('#ffffff', 0.12), Math.max(1, w * 0.5));
    polyline(ctx, main, rgba('#14110e', 0.9), Math.max(1, w * 0.45));
    for (const p of along(main, k * 0.9)) {
      if (rnd() < 0.4) continue;
      const a = Math.atan2(p.ny, p.nx) + (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.8;
      const len = k * (0.2 + rnd() * 0.35);
      const branch = [[p.x, p.y]];
      let x = p.x;
      let y = p.y;
      for (let i = 0; i < 3; i += 1) {
        x += Math.cos(a + (rnd() - 0.5) * 0.8) * (len / 3);
        y += Math.sin(a + (rnd() - 0.5) * 0.8) * (len / 3);
        branch.push([x, y]);
      }
      polyline(ctx, branch, rgba('#14110e', 0.8), Math.max(0.6, w * 0.22));
    }
  },
  blood(ctx, pts, w, k, rnd) {
    for (const p of along(pts, k * 0.12)) {
      if (rnd() < 0.35) continue;
      const off = (rnd() - 0.5) * w * 0.7;
      const rr = w * (0.08 + rnd() * 0.3);
      smoothShape(ctx, blobPoints(p.x + p.nx * off, p.y + p.ny * off, rr, rr * 0.8, 7, 0.5, rnd), rgba(rnd() < 0.3 ? '#9a1a1a' : '#6e0f0f', 0.85));
    }
  },
};

function waterPath(ctx, pts, w, k, rnd, detail, colour) {
  ribbon(ctx, pts, w * 1.34, k, 71, 0.22, rgba('#5a4a32', 0.5));
  ribbon(ctx, pts, w * 1.16, k, 73, 0.2, rgba('#a8946a', 0.5));
  const edge = ribbon(ctx, pts, w, k, 75, 0.14, shade(colour, 0.08));
  ribbon(ctx, pts, w * 0.76, k, 77, 0.16, colour);
  ribbon(ctx, pts, w * 0.4, k, 79, 0.3, rgba(shade(colour, -0.08), 0.8));
  if (!detail || !edge) return;
  for (const side of [edge.left, edge.right]) polyline(ctx, side, rgba('#ffffff', 0.4), Math.max(1, k * 0.03));
  for (const p of along(pts, k * 0.45)) {
    if (rnd() < 0.4) continue;
    const off = (rnd() - 0.5) * w * 0.5;
    const x = p.x + p.nx * off;
    const y = p.y + p.ny * off;
    const l = k * (0.12 + rnd() * 0.14);
    line(ctx, x - p.ny * l * 0.5, y + p.nx * l * 0.5, x + p.ny * l * 0.5, y - p.nx * l * 0.5, rgba('#ffffff', 0.25), Math.max(0.6, k * 0.015));
  }
}

/** Roads, rivers and the like, on the floor (all of them, clipped to `region` if given). */
export function drawPaths(ctx, design, cell = DESIGN_CELL, region = null) {
  const paths = design.paths ?? [];
  if (!paths.length) return;
  const detail = detailAt(cell);
  ctx.save();
  ctx.beginPath();
  if (region) ctx.rect(region.x1 * cell, region.y1 * cell, (region.x2 - region.x1) * cell, (region.y2 - region.y1) * cell);
  else ctx.rect(0, 0, design.cols * cell, design.rows * cell);
  ctx.clip();
  for (const p of paths) {
    const art = PATH_ART[p.kind];
    if (!art) continue;
    const pts = toPx(smoothPoints(p.pts, 8), cell);
    const rnd = rndOf(Math.round(p.pts[0][0] * 10), Math.round(p.pts[0][1] * 10), FSEED(p.kind));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    art(ctx, pts, p.w * cell, cell, rnd, detail);
  }
  ctx.restore();
}

// ---------- walls ----------

/** How each wall style looks: w (squares thick), edge, body and top colours, how its body is made. */
export const WALL_LOOK = {
  stone: { w: 0.28, edge: '#1c1a18', body: '#4d4a46', top: '#716c65', kind: 'line', joint: 0.5 },
  brick: { w: 0.26, edge: '#2a1611', body: '#7a3d2d', top: '#9c5642', kind: 'line', joint: 0.25 },
  wood: { w: 0.18, edge: '#22150b', body: '#5c3c22', top: '#7e5634', kind: 'line', joint: 1 },
  cave: { w: 0.5, edge: '#121110', body: '#37322d', top: '#544d46', kind: 'lumps' },
  palisade: { w: 0.3, edge: '#22150b', body: '#6a4a2c', top: '#8f6a42', kind: 'stakes' },
  hedge: { w: 0.5, edge: '#1a2e12', body: '#355a2a', top: '#55833f', kind: 'lumps' },
  iron: { w: 0.12, edge: '#0d0e10', body: '#3b3e44', top: '#727780', kind: 'line', joint: 0.33 },
  ruin: { w: 0.26, edge: '#24221e', body: '#5a5650', top: '#7d786f', kind: 'ruin', joint: 0.5 },
};

const SOLID = new Set(['wall', 'secret', 'window']);

/** Bumps along a wall (cave rock, hedges): [{ x, y, r }] in pixels, the same every time for the same wall. */
function lumps(pts, k, wd, seed) {
  return along(pts, k * 0.17).map((p) => {
    const n = noise(p.x / k * 2.3, p.y / k * 2.3, seed);
    const m = noise(p.x / k * 3.1 + 7, p.y / k * 3.1, seed + 1) - 0.5;
    return { x: p.x + p.nx * m * wd * 0.25, y: p.y + p.ny * m * wd * 0.25, r: (wd / 2) * (0.72 + n * 0.6) };
  });
}

function wallPass(ctx, l, pass, k, low) {
  const L = l.L;
  const wd = L.w * k * (low ? 0.55 : 1);
  const colour = pass === 'edge' ? L.edge : pass === 'body' ? L.body : L.top;
  if (L.kind === 'lumps' || L.kind === 'stakes') {
    const seed = L.kind === 'stakes' ? 41 : L === WALL_LOOK.hedge ? 43 : 47;
    const list = L.kind === 'stakes' ? along(l.pts, k * (low ? 0.14 : 0.2)).map((p) => ({ x: p.x, y: p.y, r: wd * 0.45 })) : lumps(l.pts, k * (low ? 0.6 : 1), wd, seed);
    for (const p of list) {
      if (pass === 'edge') circle(ctx, p.x, p.y, p.r + k * 0.035, colour);
      else if (pass === 'body') circle(ctx, p.x, p.y, p.r, L.kind === 'stakes' ? radial(ctx, p.x, p.y, p.r, L.top, L.body, p.x - p.r * 0.3, p.y - p.r * 0.3) : colour);
      else if (L.kind === 'lumps') circle(ctx, p.x - p.r * 0.2, p.y - p.r * 0.25, p.r * 0.55, rgba(colour, 0.75));
      else circle(ctx, p.x, p.y, p.r * 0.35, rgba(shade(L.top, 0.1), 0.8));
    }
    return;
  }
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  if (L.kind === 'ruin') {
    // Uneven: each stretch a little thicker or thinner.
    const pieces = along(l.pts, k * 0.25);
    for (let i = 1; i < pieces.length; i += 1) {
      const a = pieces[i - 1];
      const b = pieces[i];
      const f = 0.7 + hash2(Math.round(a.x), Math.round(a.y), 51) * 0.45;
      const width = pass === 'edge' ? wd * f + k * 0.07 : pass === 'body' ? wd * f : wd * f * 0.4;
      line(ctx, a.x, a.y, b.x, b.y, colour, width, 'square');
    }
    if (pieces.length < 2) polyline(ctx, l.pts, colour, pass === 'edge' ? wd + k * 0.07 : pass === 'body' ? wd : wd * 0.4, 'square');
    return;
  }
  const width = pass === 'edge' ? wd + k * 0.07 : pass === 'body' ? wd : wd * 0.42;
  ctx.beginPath();
  l.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, width);
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.stroke();
}

function wallDetail(ctx, l, k, detail, low) {
  const L = l.L;
  if (!detail) return;
  const wd = L.w * k * (low ? 0.55 : 1);
  const lw = Math.max(0.6, k * 0.018);
  if (L.kind === 'line' || L.kind === 'ruin') {
    const style = l.w.style;
    if (style === 'wood') {
      for (const s of [-1, 1]) polyline(ctx, offsetLine(l.pts, s * wd * 0.22), rgba(L.edge, 0.5), Math.max(0.5, k * 0.008), 'butt');
      for (const p of along(l.pts, k * L.joint).slice(1)) line(ctx, p.x + p.nx * wd * 0.5, p.y + p.ny * wd * 0.5, p.x - p.nx * wd * 0.5, p.y - p.ny * wd * 0.5, rgba(L.edge, 0.7), lw, 'butt');
      return;
    }
    if (style === 'iron') {
      for (const p of along(l.pts, k * L.joint)) circle(ctx, p.x, p.y, Math.max(0.8, wd * 0.22), rgba('#9aa0a8', 0.8));
      return;
    }
    // Stone, brick, ruin: two rows of blocks, their joints staggered.
    if (detail > 1 && !low) polyline(ctx, l.pts, rgba(L.edge, 0.45), Math.max(0.5, k * 0.01), 'butt');
    const step = k * L.joint;
    for (const p of along(l.pts, step / 2)) {
      const odd = Math.round(p.t / (step / 2)) % 2;
      const half = low ? 0.5 : 0;
      const a = odd ? half : -0.5;
      const b = odd ? 0.5 : -half;
      line(ctx, p.x + p.nx * wd * a, p.y + p.ny * wd * a, p.x + p.nx * wd * b, p.y + p.ny * wd * b, rgba(L.edge, 0.6), lw, 'butt');
    }
    if (L.kind === 'ruin' && detail > 1) {
      const rnd = rndOf(Math.round(l.pts[0][0]), Math.round(l.pts[0][1]), 53);
      for (const p of along(l.pts, k * 0.3)) {
        if (rnd() < 0.5) continue;
        const side = rnd() < 0.5 ? -1 : 1;
        const off = side * (wd * 0.6 + rnd() * k * 0.25);
        const rr = k * (0.03 + rnd() * 0.05);
        poly(ctx, blobPoints(p.x + p.nx * off, p.y + p.ny * off, rr, rr * 0.8, 5, 0.5, rnd), shade(L.top, (rnd() - 0.5) * 0.2), L.edge, Math.max(0.5, k * 0.008));
      }
    }
    return;
  }
  if (L.kind === 'lumps' && detail > 1) {
    const rnd = rndOf(Math.round(l.pts[0][0]), Math.round(l.pts[0][1]), 59);
    const hedge = L === WALL_LOOK.hedge;
    for (const p of along(l.pts, k * 0.08)) {
      const off = (rnd() - 0.5) * wd * 0.8;
      const x = p.x + p.nx * off;
      const y = p.y + p.ny * off;
      if (hedge) circle(ctx, x, y, k * (0.015 + rnd() * 0.02), rgba(rnd() < 0.5 ? '#79a85a' : '#24401a', 0.7));
      else if (rnd() < 0.3) line(ctx, x, y, x + (rnd() - 0.5) * k * 0.12, y + (rnd() - 0.5) * k * 0.12, rgba('#141210', 0.6), Math.max(0.5, k * 0.01));
    }
  }
  if (L.kind === 'stakes' && detail > 1) {
    for (const p of along(l.pts, k * (low ? 0.14 : 0.2))) circle(ctx, p.x, p.y, wd * 0.25, null, rgba(L.edge, 0.5), Math.max(0.5, k * 0.008));
  }
}

/** A low wall or fence, in its style. */
function drawLow(ctx, l, k, detail, shadows) {
  const style = l.w.style;
  if (style === 'wood') {
    // A fence: a rail with posts.
    if (shadows) polyline(ctx, l.pts.map(([x, y]) => [x + k * 0.05, y + k * 0.06]), 'rgba(0,0,0,0.25)', k * 0.07);
    polyline(ctx, l.pts, '#2e1d0f', Math.max(1, k * 0.075));
    polyline(ctx, l.pts, '#7a5532', Math.max(1, k * 0.05));
    for (const p of along(l.pts, k * 0.5)) {
      if (shadows) rect(ctx, p.x - k * 0.05, p.y - k * 0.04, k * 0.12, k * 0.12, 'rgba(0,0,0,0.3)');
      rect(ctx, p.x - k * 0.06, p.y - k * 0.06, k * 0.12, k * 0.12, '#4a3018', '#22150b', Math.max(0.6, k * 0.015));
      if (detail > 1) rect(ctx, p.x - k * 0.035, p.y - k * 0.035, k * 0.05, k * 0.05, '#6e4a2a');
    }
    return;
  }
  if (style === 'iron') {
    // Railings: a thin bar with posts and knobs.
    polyline(ctx, l.pts, '#121316', Math.max(1, k * 0.045));
    polyline(ctx, l.pts, '#4a4e55', Math.max(0.8, k * 0.022));
    for (const p of along(l.pts, k * 0.25)) circle(ctx, p.x, p.y, k * 0.035, '#3a3d43', '#0d0e10', Math.max(0.5, k * 0.01));
    return;
  }
  if (shadows) polyline(ctx, l.pts.map(([x, y]) => [x + k * 0.05, y + k * 0.065]), 'rgba(0,0,0,0.28)', l.L.w * k * 0.6 + k * 0.05);
  for (const pass of ['edge', 'body', 'top']) wallPass(ctx, l, pass, k, true);
  wallDetail(ctx, l, k, detail, true);
}

/**
 * The walls: shadows on the floor, then solid walls (secret doors look just
 * like them; windows too, with glass) in passes so their joins look whole,
 * then low walls and fences, then doorways (a sill and jambs: the map draws
 * the door itself, open or shut) and archways (a pillar each side).
 */
export function drawWalls(ctx, design, cell = DESIGN_CELL, look = design.look) {
  const shadows = look?.shadows !== false;
  const detail = detailAt(cell);
  const k = cell;
  const lines = design.walls.map((w) => ({ w, pts: toPx(wallPoints(w, Math.PI / 40), k), L: WALL_LOOK[w.style] ?? WALL_LOOK.stone }));
  const solid = lines.filter((l) => SOLID.has(l.w.type));
  if (shadows) {
    for (const l of solid) {
      const wd = l.L.w * k;
      for (const [dx, dy, a, extra] of [[0.08, 0.1, 0.18, 0.14], [0.04, 0.05, 0.22, 0.04]]) {
        ctx.save();
        ctx.translate(k * dx, k * dy);
        if (l.L.kind === 'lumps' || l.L.kind === 'stakes') polyline(ctx, l.pts, rgba('#000000', a), wd * 0.9 + k * extra);
        else {
          ctx.beginPath();
          l.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.strokeStyle = rgba('#000000', a);
          ctx.lineWidth = wd + k * extra;
          ctx.lineCap = 'square';
          ctx.lineJoin = 'miter';
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  for (const pass of ['edge', 'body', 'top']) for (const l of solid) wallPass(ctx, l, pass, k, false);
  for (const l of solid) wallDetail(ctx, l, k, detail, false);
  // Windows: glass along the middle, a frame at each end.
  for (const l of solid.filter((x) => x.w.type === 'window')) {
    const wd = l.L.w * k;
    polyline(ctx, l.pts, '#1c2a33', Math.max(1, wd * 0.5), 'butt');
    polyline(ctx, l.pts, '#9cc4d8', Math.max(1, wd * 0.32), 'butt');
    if (detail) polyline(ctx, offsetLine(l.pts, -wd * 0.06), rgba('#ffffff', 0.6), Math.max(0.5, wd * 0.08), 'butt');
    for (const [x, y] of [l.pts[0], l.pts.at(-1)]) circle(ctx, x, y, wd * 0.42, l.L.body, l.L.edge, Math.max(0.6, k * 0.015));
  }
  for (const l of lines.filter((x) => x.w.type === 'low')) drawLow(ctx, l, k, detail, shadows);
  // Doorways and archways.
  for (const l of lines.filter((x) => x.w.type === 'door' || x.w.type === 'arch')) {
    const L = l.L;
    const wd = Math.max(L.w, 0.18) * k;
    const [a, b] = [l.pts[0], l.pts.at(-1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const sill = ['wood', 'palisade'].includes(l.w.style) ? '#6e4a2a' : l.w.style === 'hedge' ? '#5a4a32' : l.w.style === 'iron' ? '#4a4c50' : '#8a857c';
    line(ctx, a[0], a[1], b[0], b[1], rgba(sill, l.w.type === 'arch' ? 0.55 : 0.9), wd * 0.75, 'butt');
    if (detail > 1) line(ctx, a[0], a[1], b[0], b[1], rgba('#000000', 0.25), Math.max(0.5, k * 0.012), 'butt');
    if (l.w.type === 'arch') {
      for (const [x, y] of [a, b]) {
        if (shadows) circle(ctx, x + k * 0.05, y + k * 0.06, wd * 0.62, 'rgba(0,0,0,0.3)');
        circle(ctx, x, y, wd * 0.6, radial(ctx, x, y, wd * 0.6, L.top, L.body, x - wd * 0.2, y - wd * 0.2), L.edge, Math.max(0.8, k * 0.02));
      }
    } else {
      // Jambs: a short block of the wall at each side of the door.
      for (const [x, y, s] of [[a[0], a[1], 1], [b[0], b[1], -1]]) {
        const jx = x + ux * s * k * 0.05;
        const jy = y + uy * s * k * 0.05;
        const hw = wd * 0.55;
        const hl = k * 0.06;
        poly(ctx, [[jx - ux * hl - uy * hw, jy - uy * hl + ux * hw], [jx + ux * hl - uy * hw, jy + uy * hl + ux * hw], [jx + ux * hl + uy * hw, jy + uy * hl - ux * hw], [jx - ux * hl + uy * hw, jy - uy * hl - ux * hw]], L.body, L.edge, Math.max(0.6, k * 0.015));
      }
    }
  }
}

// ---------- assets ----------

/** An asset that's missing its picture (an upload not loaded yet): a dashed box. */
function drawMissing(ctx, w, h) {
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash?.([6, 4]);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.setLineDash?.([]);
}

/** A number from an asset's id, so each placed asset draws a little differently (the same every time). */
const idSeed = (id) => {
  let s = 7;
  for (const ch of String(id)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return s;
};

/** One placed asset. `images`: 'u:<id>' -> something drawImage takes. */
export function drawAsset(ctx, a, cell = DESIGN_CELL, images = new Map(), look = LOOK) {
  ctx.save();
  ctx.translate(a.x * cell, a.y * cell);
  const rad = ((a.rot ?? 0) * Math.PI) / 180;
  ctx.rotate(rad);
  if (a.flip) ctx.scale(-1, 1);
  const w = a.w * cell;
  const h = a.h * cell;
  if (ASSETS[a.a]) {
    // Shadows fall down and to the right on the map, whichever way the asset is turned.
    const wx = cell * 0.06;
    const wy = cell * 0.08;
    let sx = wx * Math.cos(rad) + wy * Math.sin(rad);
    const sy = -wx * Math.sin(rad) + wy * Math.cos(rad);
    if (a.flip) sx = -sx;
    drawBuiltIn(ctx, a.a, w, h, { seed: idSeed(a.id), tint: a.tint, sx, sy, shadows: look?.shadows !== false });
  } else if (images.get(a.a)) ctx.drawImage(images.get(a.a), -w / 2, -h / 2, w, h);
  else drawMissing(ctx, w, h);
  ctx.restore();
}

// ---------- the look: mood, lights' glow, grid ----------

const MOOD_LOOK = {
  day: null,
  dusk: { tint: '#d6a07a', glow: 0.3 },
  night: { tint: '#2f3b66', glow: 0.5 },
  gloom: { tint: '#6c7268', glow: 0.36 },
};

/** What gives light in the picture: lit assets (a campfire, a brazier...), lava floor and lava flows. */
export function lightSources(design) {
  const out = [];
  for (const a of design.assets ?? []) {
    const def = ASSETS[a.a];
    if (!def?.light || !a.light) continue;
    const colour = def.glow === 'tint' ? a.tint ?? def.tint : def.glow ?? '#ffd27a';
    out.push({ x: a.x, y: a.y, r: (def.light.bright + def.light.dim) / 5, bright: def.light.bright / 5, colour, owner: a.id, rot: a.rot ?? 0 });
  }
  const { cols, rows, floor } = design;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (floor[r][c] !== 'L') continue;
      const inner = [[0, -1], [0, 1], [-1, 0], [1, 0]].every(([dc, dr]) => floor[r + dr]?.[c + dc] === 'L');
      if (inner && (c + r) % 3) continue;
      out.push({ x: c + 0.5, y: r + 0.5, r: 1.6, bright: 0.4, colour: '#ff6a1a' });
    }
  }
  for (const p of design.paths ?? []) {
    if (p.kind !== 'lava') continue;
    for (const q of along(smoothPoints(p.pts, 4), 1)) out.push({ x: q.x, y: q.y, r: p.w + 0.6, bright: p.w * 0.3, colour: '#ff6a1a' });
  }
  return out;
}

const SIGHT_SCALE = 20; // sightPolygon rounds to 0.1, so it works in twentieths of a square

/**
 * Where each light reaches in the picture (a polygon in squares, or null
 * when nothing is in its way): walls, closed and secret doors, and things
 * that block sight stop it; windows, archways, low walls and fences don't.
 * A light's own thing doesn't (a lit crystal that blocks), and one hung on
 * a wall (a torch) shines from just in front of it.
 */
export function lightAreas(design, sources) {
  const segs = [];
  for (const w of design.walls ?? []) {
    if (w.type === 'arch' || w.type === 'low' || w.type === 'window') continue;
    const pts = wallPoints(w);
    for (let i = 1; i < pts.length; i += 1) segs.push({ x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1], owner: null });
  }
  for (const a of design.assets ?? []) {
    const def = ASSETS[a.a];
    if ((a.blocks ?? def?.blocks) !== 'wall') continue;
    const pts = assetOutline({ ...a, w: a.w ?? def?.w ?? 1, h: a.h ?? def?.h ?? 1, rot: a.rot ?? 0 });
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      segs.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1], owner: a.id });
    });
  }
  const K = SIGHT_SCALE;
  const dist = (g, x, y) => {
    const dx = g.x2 - g.x1;
    const dy = g.y2 - g.y1;
    const t = Math.max(0, Math.min(1, ((x - g.x1) * dx + (y - g.y1) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - (g.x1 + dx * t), y - (g.y1 + dy * t));
  };
  return sources.map((s) => {
    const near = segs.filter((g) => g.owner !== (s.owner ?? undefined) && Math.max(g.x1, g.x2) >= s.x - s.r && Math.min(g.x1, g.x2) <= s.x + s.r && Math.max(g.y1, g.y2) >= s.y - s.r && Math.min(g.y1, g.y2) <= s.y + s.r);
    if (!near.length) return null;
    let { x, y } = s;
    if (near.some((g) => dist(g, x, y) < 0.15)) {
      // On a wall: shine from just in front of it (its front is the way it faces, down when not turned).
      const a = ((s.rot ?? 0) * Math.PI) / 180;
      x -= Math.sin(a) * 0.22;
      y += Math.cos(a) * 0.22;
    }
    const map = { image: { width: design.cols * K, height: design.rows * K }, walls: near.map((g) => ({ x1: g.x1 * K, y1: g.y1 * K, x2: g.x2 * K, y2: g.y2 * K, kind: 'wall' })) };
    const poly = sightPolygon(map, { x: x * K, y: y * K }, s.r * K);
    return poly.length >= 3 ? poly.map(([px, py]) => [px / K, py / K]) : [];
  });
}

/** Clip `ctx` to a light's area (scaled by k): nothing for a light with nothing in its way. */
function clipTo(ctx, area, k) {
  if (!area) return;
  ctx.beginPath();
  area.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
  ctx.closePath();
  ctx.clip();
}

/**
 * The look over everything: the mood (dusk, night or gloom darken and tint
 * the picture, with light round lit things; needs `makeCanvas(w, h)` for the
 * light, else it's an even tint), the glow of lights, and a grid.
 */
export function drawLook(ctx, design, cell = DESIGN_CELL, { makeCanvas = null, grid = true } = {}) {
  const look = normalizeLook(design.look);
  const W = design.cols * cell;
  const H = design.rows * cell;
  const mood = MOOD_LOOK[look.mood];
  const sources = mood || look.glow ? lightSources(design) : [];
  const areas = sources.length ? lightAreas(design, sources) : [];
  if (mood) {
    const scale = Math.min(1, 12 / cell);
    const mw = Math.max(1, Math.ceil(W * scale));
    const mh = Math.max(1, Math.ceil(H * scale));
    const mask = makeCanvas ? makeCanvas(mw, mh) : null;
    const m = mask?.getContext?.('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    if (m) {
      m.fillStyle = mood.tint;
      m.fillRect(0, 0, mw, mh);
      m.globalCompositeOperation = 'destination-out';
      sources.forEach((s, i) => {
        if (areas[i]?.length === 0) return; // walled in on every side
        const R = s.r * cell * scale;
        const x = s.x * cell * scale;
        const y = s.y * cell * scale;
        const gr = m.createRadialGradient(x, y, 0, x, y, Math.max(0.5, R));
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(Math.min(0.9, Math.max(0.1, s.bright / (s.r || 1))), 'rgba(0,0,0,0.85)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        m.save();
        clipTo(m, areas[i], cell * scale);
        m.fillStyle = gr;
        m.beginPath();
        m.arc(x, y, Math.max(0.5, R), 0, TAU);
        m.fill();
        m.restore();
      });
      ctx.drawImage(mask, 0, 0, W, H);
    } else {
      ctx.fillStyle = mood.tint;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  if (look.glow && sources.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const alpha = mood ? mood.glow : 0.16;
    sources.forEach((s, i) => {
      if (areas[i]?.length === 0) return;
      ctx.save();
      clipTo(ctx, areas[i], cell);
      glow(ctx, s.x * cell, s.y * cell, Math.min(s.r, 6) * cell * 0.55, s.colour, alpha);
      ctx.restore();
    });
    ctx.restore();
  }
  if (grid && look.grid !== 'none') {
    ctx.save();
    ctx.strokeStyle = look.grid === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.16)';
    ctx.lineWidth = Math.max(1, cell * (look.grid === 'dark' ? 0.022 : 0.015));
    ctx.beginPath();
    for (let x = 1; x < design.cols; x += 1) {
      ctx.moveTo(x * cell, 0);
      ctx.lineTo(x * cell, H);
    }
    for (let y = 1; y < design.rows; y += 1) {
      ctx.moveTo(0, y * cell);
      ctx.lineTo(W, y * cell);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** The CSS font for a label `px` pixels high. */
export const labelFont = (l, px) => {
  const f = LABEL_FONTS[l.font] ?? LABEL_FONTS.old;
  return `${l.italic ? 'italic ' : ''}${f.weight ?? 'normal'} ${Math.max(4, Math.round(px))}px ${f.family}`;
};

/** The labels, on top of everything, with a halo so they read on any floor. */
export function drawLabels(ctx, design, cell = DESIGN_CELL) {
  for (const l of design.labels ?? []) {
    const px = Math.max(4, l.size * cell);
    ctx.save();
    ctx.translate(l.x * cell, l.y * cell);
    ctx.rotate((l.rot * Math.PI) / 180);
    ctx.font = labelFont(l, px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (l.halo) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, px * 0.16);
      ctx.strokeStyle = lightness(l.colour) > 0.45 ? 'rgba(20,16,12,0.8)' : 'rgba(250,246,236,0.85)';
      ctx.strokeText(l.text, 0, 0);
    }
    ctx.fillStyle = l.colour;
    ctx.fillText(l.text, 0, 0);
    ctx.restore();
  }
}

/**
 * The whole map: the floor and paths (unless `floor: false`, when the caller
 * has drawn them already), assets on the floor, walls, standing and then
 * overhead assets, the look (mood, glow, grid; `look: false` leaves it out)
 * and labels.
 */
export function drawDesign(ctx, design, { cell = DESIGN_CELL, images = new Map(), floor = true, look = true, labels = true, grid = true, makeCanvas = null } = {}) {
  const lk = normalizeLook(design.look);
  if (floor) {
    drawFloor(ctx, design, cell);
    drawPaths(ctx, design, cell);
  }
  const order = drawOrder(design.assets);
  for (const a of order) if (layerOf(a) === 0) drawAsset(ctx, a, cell, images, lk);
  drawWalls(ctx, design, cell, lk);
  for (const a of order) if (layerOf(a) === 1) drawAsset(ctx, a, cell, images, lk);
  for (const a of order) if (layerOf(a) === 2) drawAsset(ctx, a, cell, images, lk);
  if (look) drawLook(ctx, design, cell, { makeCanvas, grid });
  if (labels) drawLabels(ctx, design, cell);
}

// ---------- samples for the creator's buttons ----------

const sample = (cols, rows, floor, extra = {}) => ({ v: 2, cols, rows, floor, walls: [], assets: [], paths: [], labels: [], look: { ...LOOK, shadows: false }, ...extra });

/** A sample of a floor, `size` pixels square. */
export function drawFloorSwatch(ctx, ch, size) {
  drawFloor(ctx, sample(2, 2, [ch + ch, ch + ch]), size / 2);
}

/** A sample of a path kind across a `w` x `h` box. */
export function drawPathSwatch(ctx, kind, w, h) {
  const cell = h / 2;
  const cols = Math.ceil(w / cell);
  const d = sample(cols, 2, ['g'.repeat(cols), 'g'.repeat(cols)], { paths: [{ id: 'swatch01', kind, w: Math.min(1.4, PATH_KINDS[kind]?.w ?? 1), pts: [[0, 1.3], [cols * 0.35, 0.7], [cols * 0.7, 1.3], [cols, 0.8]] }] });
  drawFloor(ctx, d, cell);
  drawPaths(ctx, d, cell);
}

/** A sample of a wall style (and type) across a `w` x `h` box. */
export function drawWallSwatch(ctx, style, type, w, h) {
  const cell = h / 2;
  const cols = Math.ceil(w / cell);
  const d = sample(cols, 2, ['s'.repeat(cols), 's'.repeat(cols)], { walls: [{ id: 'swatch02', x1: 0, y1: 1, x2: cols, y2: 1, type, style }] });
  drawFloor(ctx, d, cell);
  drawWalls(ctx, d, cell, d.look);
}

