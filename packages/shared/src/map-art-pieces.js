/**
 * Pieces many of the map creator's asset drawings share (map-art-assets.js
 * and the themed map-art-*.js files): a soft shadow, light on a round thing,
 * tree canopies, stones, planks, fire, candles, coins, bands, wheels, books
 * and crystals. Plain Canvas 2D calls (map-paint.js).
 */
import { TAU, shade, rgba, circle, oval, rect, rrect, poly, line, blobPoints, smoothShape, radial, glow } from './map-paint.js';

/** A soft drop shadow: an oval or a rounded box, offset the way light falls; taller things cast it further. */
export function shadow(g, kind = 'round', rx = g.w / 2, ry = g.h / 2, height = 1) {
  const { ctx } = g;
  if (!g.shadows) return;
  const dx = g.sx * height;
  const dy = g.sy * height;
  for (const k of [1.07, 0.97, 0.87]) {
    if (kind === 'round') oval(ctx, dx, dy, rx * k, ry * k, 0, 'rgba(0,0,0,0.12)');
    else rrect(ctx, dx - rx * k, dy - ry * k, rx * 2 * k, ry * 2 * k, Math.min(rx, ry) * 0.25, 'rgba(0,0,0,0.12)');
  }
}

/** A light-to-dark fill for a round thing lit from the top left. */
export const lit = (ctx, x, y, r, base, amount = 0.14) => radial(ctx, x, y, r, shade(base, amount), shade(base, -amount * 0.8), x - r * 0.35, y - r * 0.35);

/** A leafy crown: lobes round a middle, each lit from the top left, with clumps of light and shade. */
export function canopy(g, r, lobes, base, { spots = 2, rough = 0.12 } = {}) {
  const { ctx, rnd } = g;
  const edge = rgba(shade(base, -0.3), 0.55);
  const parts = [];
  for (let i = 0; i < lobes; i += 1) {
    const a = (i / lobes) * TAU + rnd() * 0.5;
    const d = r * (0.48 + rnd() * rough);
    parts.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.42 + rnd() * 0.14)]);
  }
  for (const [x, y, rr] of parts) circle(ctx, x + r * 0.04, y + r * 0.05, rr, shade(base, -0.18));
  for (const [x, y, rr] of parts) circle(ctx, x, y, rr, lit(ctx, x, y, rr, base), edge, r * 0.02);
  circle(ctx, 0, 0, r * 0.55, lit(ctx, 0, 0, r * 0.55, shade(base, 0.03)));
  for (let i = 0; i < lobes * spots; i += 1) {
    const a = rnd() * TAU;
    const d = rnd() * r * 0.85;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    circle(ctx, x, y, r * (0.05 + rnd() * 0.07), rgba(x + y < 0 ? shade(base, 0.24) : shade(base, -0.22), 0.5));
  }
}

/** An angular stone, lit from the top left, with a lighter face. */
export function stone(g, cx, cy, rx, ry, base, n = 9, rough = 0.32) {
  const { ctx, rnd, m } = g;
  const pts = blobPoints(cx, cy, rx, ry, n, rough, rnd, rnd() * TAU);
  poly(ctx, pts, lit(ctx, cx, cy, Math.max(rx, ry), base, 0.12), shade(base, -0.32), Math.max(1, m * 0.025));
  const face = [];
  for (const [x, y] of pts) if (x - cx + (y - cy) < 0) face.push([cx + (x - cx) * 0.7, cy + (y - cy) * 0.7]);
  if (face.length >= 2) poly(ctx, [...face, [cx + rx * 0.08, cy + ry * 0.08]], rgba(shade(base, 0.22), 0.55));
}

/** Planks side by side across a box (`across`: the planks run left to right). */
export function planks(g, x, y, w, h, base, n, across = true, seams = 0.18) {
  const { ctx, rnd, m } = g;
  for (let i = 0; i < n; i += 1) {
    const c = shade(base, (rnd() - 0.5) * 0.12);
    if (across) rect(ctx, x, y + (h * i) / n, w, h / n, c);
    else rect(ctx, x + (w * i) / n, y, w / n, h, c);
  }
  const lw = Math.max(0.8, m * 0.02);
  for (let i = 1; i < n; i += 1) {
    if (across) line(ctx, x, y + (h * i) / n, x + w, y + (h * i) / n, shade(base, -seams), lw, 'butt');
    else line(ctx, x + (w * i) / n, y, x + (w * i) / n, y + h, shade(base, -seams), lw, 'butt');
  }
  // Grain.
  for (let i = 0; i < n * 2; i += 1) {
    const k = rnd();
    if (across) line(ctx, x + rnd() * w * 0.6, y + h * ((Math.floor(i / 2) + 0.2 + rnd() * 0.6) / n), x + w * (0.4 + k * 0.6), y + h * ((Math.floor(i / 2) + 0.3 + rnd() * 0.4) / n), rgba(shade(base, -0.1), 0.6), Math.max(0.5, m * 0.008));
    else line(ctx, x + w * ((Math.floor(i / 2) + 0.2 + rnd() * 0.6) / n), y + rnd() * h * 0.6, x + w * ((Math.floor(i / 2) + 0.3 + rnd() * 0.4) / n), y + h * (0.4 + k * 0.6), rgba(shade(base, -0.1), 0.6), Math.max(0.5, m * 0.008));
  }
}

/** Fire seen from above: ragged tongues, orange to yellow. */
export function fire(g, x, y, r) {
  const { ctx, rnd } = g;
  glow(ctx, x, y, r * 1.6, '#ffb347', 0.45);
  smoothShape(ctx, blobPoints(x, y, r, r, 9, 0.7, rnd), '#d9461a');
  smoothShape(ctx, blobPoints(x, y, r * 0.72, r * 0.72, 8, 0.6, rnd), '#f2852a');
  smoothShape(ctx, blobPoints(x, y, r * 0.45, r * 0.45, 7, 0.5, rnd), '#ffc94a');
  circle(ctx, x, y, r * 0.2, '#fff2b0');
}

/** A candle from above: wax, wick and a little flame. */
export function candle(g, x, y, r) {
  const { ctx } = g;
  glow(ctx, x, y, r * 2.4, '#ffd27a', 0.35);
  circle(ctx, x, y, r, '#efe6cf', '#b9ab8a', Math.max(0.5, r * 0.15));
  circle(ctx, x, y, r * 0.55, '#ffcf5a');
  circle(ctx, x, y, r * 0.25, '#fff5c8');
}

/** A gold coin. */
export const coin = (g, x, y, r) => {
  circle(g.ctx, x, y, r, lit(g.ctx, x, y, r, '#d4a72c', 0.18), '#8a6a14', Math.max(0.5, r * 0.18));
};

/** Iron hoops or bands across a box. */
export const band = (ctx, x, y, w, h, colour = '#3a3a3a') => rect(ctx, x, y, w, h, colour);

/** A wheel seen from above: a thin dark box. */
export const wheel = (ctx, x, y, w, h) => rrect(ctx, x - w / 2, y - h / 2, w, h, w * 0.3, '#2e2419', '#17110b', 1);

/** A book seen from above. */
export const book = (ctx, x, y, w, h, colour, rot = 0) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  rect(ctx, -w / 2, -h / 2, w, h, colour, shade(colour, -0.3), Math.max(0.5, w * 0.06));
  rect(ctx, -w / 2 + w * 0.1, -h / 2, w * 0.08, h, shade(colour, 0.15));
  ctx.restore();
};

/** Crystals pointing out from the middle: long six-sided prisms with a light and a dark face. */
export function crystals(g, n, len, wide, base) {
  const { ctx, rnd, m } = g;
  const order = Array.from({ length: n }, (_, i) => ({ a: (i / n) * TAU + rnd() * 0.6, l: len * (0.6 + rnd() * 0.4), wd: wide * (0.7 + rnd() * 0.5) }));
  order.sort((p, q) => Math.sin(p.a) - Math.sin(q.a)); // the far ones first
  for (const c of order) {
    ctx.save();
    ctx.rotate(c.a);
    const tip = c.l;
    const body = [[0, -c.wd / 2], [tip * 0.75, -c.wd / 2], [tip, 0], [tip * 0.75, c.wd / 2], [0, c.wd / 2]];
    poly(ctx, body, shade(base, -0.05), shade(base, -0.4), Math.max(0.8, m * 0.015));
    poly(ctx, [[0, -c.wd / 2], [tip * 0.75, -c.wd / 2], [tip, 0], [0, 0]], shade(base, 0.22));
    line(ctx, tip * 0.1, 0, tip * 0.85, 0, rgba('#ffffff', 0.35), Math.max(0.5, m * 0.012));
    ctx.restore();
  }
  circle(ctx, 0, 0, wide * 0.6, shade(base, -0.3));
}

/** The pieces above, for drawings kept elsewhere. */
