/**
 * Small painting helpers for the map creator's drawing (map-art.js and
 * map-art-assets.js): colours, smooth noise, and shapes on any Canvas 2D
 * context. Plain Canvas 2D calls only, so a native canvas on the server and
 * a browser canvas draw the same.
 */

export const TAU = Math.PI * 2;

const hex = (h) => {
  const n = parseInt(String(h).slice(1, 7), 16) || 0;
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const toHex = (r, g, b) => `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;

/** A colour a little lighter (amount > 0) or darker (< 0), as #rrggbb. */
export function shade(h, amount) {
  const [r, g, b] = hex(h);
  return toHex(r + amount * 255, g + amount * 255, b + amount * 255);
}

/** Two colours mixed (t = 0: the first, 1: the second), as #rrggbb. */
export function mix(a, b, t) {
  const p = hex(a);
  const q = hex(b);
  return toHex(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
}

/** A colour with see-through `alpha`, as rgba(). */
export function rgba(h, alpha) {
  const [r, g, b] = hex(h);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** How light a colour is, 0 to 1. */
export function lightness(h) {
  const [r, g, b] = hex(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** A random number 0..1 for whole numbers x, y (and a seed): the same every time. */
export function hash2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Smooth noise 0..1 over the plane (value noise): nearby points get nearby values. */
export function noise(x, y, s = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** Noise with detail: big soft patches with smaller ones on top, 0..1. */
export const fbm = (x, y, s = 0) => noise(x, y, s) * 0.6 + noise(x * 2.7, y * 2.7, s + 11) * 0.3 + noise(x * 7.1, y * 7.1, s + 23) * 0.1;

// ---------- shapes ----------

const finish = (ctx, fill, stroke, lw) => {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(0.5, lw ?? 1);
    ctx.stroke();
  }
};

export function circle(ctx, x, y, r, fill, stroke = null, lw = 1) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  finish(ctx, fill, stroke, lw);
}

export function oval(ctx, x, y, rx, ry, rot, fill, stroke = null, lw = 1) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  finish(ctx, fill, stroke, lw);
}

export function rect(ctx, x, y, w, h, fill, stroke = null, lw = 1) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  finish(ctx, fill, stroke, lw);
}

/** A rectangle with rounded corners (drawn with arcTo, which every canvas has). */
export function rrect(ctx, x, y, w, h, r, fill, stroke = null, lw = 1) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  finish(ctx, fill, stroke, lw);
}

export function poly(ctx, pts, fill, stroke = null, lw = 1, close = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
  finish(ctx, fill, stroke, lw);
}

export function line(ctx, x1, y1, x2, y2, stroke, lw = 1, cap = 'round') {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineCap = cap;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(0.5, lw);
  ctx.stroke();
}

/** A line through points, rounded at its joins. */
export function polyline(ctx, pts, stroke, lw = 1, cap = 'round') {
  if (pts.length < 2) return;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(0.5, lw);
  ctx.stroke();
}

/** Points round an uneven blob (a rock, a puddle): n points, each a little further in or out. */
export function blobPoints(cx, cy, rx, ry, n, rough, rnd, turn = 0) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = turn + (i / n) * TAU;
    const k = 1 - rough / 2 + rnd() * rough;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

/** A closed shape through points, with soft corners (curves through the middles of its sides). */
export function smoothShape(ctx, pts, fill, stroke = null, lw = 1) {
  const n = pts.length;
  if (n < 3) return;
  const mid = (i) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
  ctx.beginPath();
  const start = mid(n - 1);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i += 1) {
    const m = mid(i);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  ctx.closePath();
  finish(ctx, fill, stroke, lw);
}

/** A round gradient from `inner` at the middle to `outer` at radius r. */
export function radial(ctx, x, y, r, inner, outer, x0 = x, y0 = y) {
  const g = ctx.createRadialGradient(x0, y0, 0, x, y, Math.max(0.1, r));
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  return g;
}

/** A soft glow: a round gradient from `colour` (with `alpha`) to nothing. */
export function glow(ctx, x, y, r, colour, alpha = 0.5) {
  ctx.fillStyle = radial(ctx, x, y, r, rgba(colour, alpha), rgba(colour, 0));
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  ctx.fill();
}
