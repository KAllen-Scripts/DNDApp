/**
 * The built-in assets of the map creator (map-design.js ASSETS), each drawn
 * in code, seen from above, with a soft shadow falling down and right.
 * Original drawings, so there are no licences to worry about. Plain Canvas 2D
 * calls only (map-paint.js), so the server's picture and the page's preview
 * match.
 *
 * Each drawing gets `g`: { ctx, w, h (pixels, centred on 0, 0), m (the
 * smaller of w and h), rnd (seeded per placed asset), t (its colour: the
 * DM's tint or the asset's own), sx, sy (which way its shadow falls, turned
 * with it) }.
 */
import { ASSETS } from './map-design.js';
import { TAU, shade, rgba, circle, oval, rect, rrect, poly, line, polyline, blobPoints, smoothShape, radial, glow } from './map-paint.js';

// ---------- pieces many assets share ----------

/** A soft drop shadow: an oval or a rounded box, offset the way light falls; taller things cast it further. */
function shadow(g, kind = 'round', rx = g.w / 2, ry = g.h / 2, height = 1) {
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
const lit = (ctx, x, y, r, base, amount = 0.14) => radial(ctx, x, y, r, shade(base, amount), shade(base, -amount * 0.8), x - r * 0.35, y - r * 0.35);

/** A leafy crown: lobes round a middle, each lit from the top left, with clumps of light and shade. */
function canopy(g, r, lobes, base, { spots = 2, rough = 0.12 } = {}) {
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
function stone(g, cx, cy, rx, ry, base, n = 9, rough = 0.32) {
  const { ctx, rnd, m } = g;
  const pts = blobPoints(cx, cy, rx, ry, n, rough, rnd, rnd() * TAU);
  poly(ctx, pts, lit(ctx, cx, cy, Math.max(rx, ry), base, 0.12), shade(base, -0.32), Math.max(1, m * 0.025));
  const face = [];
  for (const [x, y] of pts) if (x - cx + (y - cy) < 0) face.push([cx + (x - cx) * 0.7, cy + (y - cy) * 0.7]);
  if (face.length >= 2) poly(ctx, [...face, [cx + rx * 0.08, cy + ry * 0.08]], rgba(shade(base, 0.22), 0.55));
}

/** Planks side by side across a box (`across`: the planks run left to right). */
function planks(g, x, y, w, h, base, n, across = true, seams = 0.18) {
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
function fire(g, x, y, r) {
  const { ctx, rnd } = g;
  glow(ctx, x, y, r * 1.6, '#ffb347', 0.45);
  smoothShape(ctx, blobPoints(x, y, r, r, 9, 0.7, rnd), '#d9461a');
  smoothShape(ctx, blobPoints(x, y, r * 0.72, r * 0.72, 8, 0.6, rnd), '#f2852a');
  smoothShape(ctx, blobPoints(x, y, r * 0.45, r * 0.45, 7, 0.5, rnd), '#ffc94a');
  circle(ctx, x, y, r * 0.2, '#fff2b0');
}

/** A candle from above: wax, wick and a little flame. */
function candle(g, x, y, r) {
  const { ctx } = g;
  glow(ctx, x, y, r * 2.4, '#ffd27a', 0.35);
  circle(ctx, x, y, r, '#efe6cf', '#b9ab8a', Math.max(0.5, r * 0.15));
  circle(ctx, x, y, r * 0.55, '#ffcf5a');
  circle(ctx, x, y, r * 0.25, '#fff5c8');
}

/** A gold coin. */
const coin = (g, x, y, r) => {
  circle(g.ctx, x, y, r, lit(g.ctx, x, y, r, '#d4a72c', 0.18), '#8a6a14', Math.max(0.5, r * 0.18));
};

/** Iron hoops or bands across a box. */
const band = (ctx, x, y, w, h, colour = '#3a3a3a') => rect(ctx, x, y, w, h, colour);

/** A wheel seen from above: a thin dark box. */
const wheel = (ctx, x, y, w, h) => rrect(ctx, x - w / 2, y - h / 2, w, h, w * 0.3, '#2e2419', '#17110b', 1);

/** A book seen from above. */
const book = (ctx, x, y, w, h, colour, rot = 0) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  rect(ctx, -w / 2, -h / 2, w, h, colour, shade(colour, -0.3), Math.max(0.5, w * 0.06));
  rect(ctx, -w / 2 + w * 0.1, -h / 2, w * 0.08, h, shade(colour, 0.15));
  ctx.restore();
};

/** Crystals pointing out from the middle: long six-sided prisms with a light and a dark face. */
function crystals(g, n, len, wide, base) {
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
export const PIECES = { shadow, lit, canopy, stone, planks, fire, candle, coin, band, wheel, book, crystals };

// ---------- the drawings ----------

export const ART = {
  // ----- Nature -----
  tree(g) {
    shadow(g, 'round', g.w * 0.46, g.h * 0.46, 2.2);
    canopy(g, g.m * 0.5, 9, g.t);
  },
  tree_big(g) {
    shadow(g, 'round', g.w * 0.47, g.h * 0.47, 2.8);
    canopy(g, g.m * 0.5, 13, g.t, { spots: 2.5 });
    canopy(g, g.m * 0.28, 7, shade(g.t, 0.04), { spots: 1 });
  },
  pine(g) {
    const { ctx, m } = g;
    shadow(g, 'round', g.w * 0.44, g.h * 0.44, 2.4);
    const base = '#2c5a37';
    for (let i = 0; i < 4; i += 1) {
      const r = m * (0.5 - i * 0.11);
      const pts = [];
      for (let k = 0; k < 18; k += 1) {
        const a = (k / 18) * TAU + i * 0.17;
        const rr = k % 2 ? r * 0.7 : r;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      poly(ctx, pts, lit(ctx, 0, 0, r, shade(base, i * 0.045), 0.1), rgba(shade(base, -0.25), 0.6), Math.max(0.5, m * 0.012));
    }
    circle(ctx, 0, 0, m * 0.05, '#5a3b20');
  },
  pine_small(g) {
    const { ctx, m } = g;
    shadow(g, 'round', g.w * 0.42, g.h * 0.42, 1.4);
    for (let i = 0; i < 3; i += 1) {
      const r = m * (0.48 - i * 0.14);
      const pts = [];
      for (let k = 0; k < 14; k += 1) {
        const a = (k / 14) * TAU + i * 0.3;
        pts.push([Math.cos(a) * (k % 2 ? r * 0.68 : r), Math.sin(a) * (k % 2 ? r * 0.68 : r)]);
      }
      poly(ctx, pts, lit(ctx, 0, 0, r, shade('#356b40', i * 0.05), 0.1));
    }
  },
  birch(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', g.w * 0.44, g.h * 0.44, 2);
    canopy(g, m * 0.48, 8, '#7fa64a', { spots: 3, rough: 0.2 });
    for (let i = 0; i < 4; i += 1) {
      const a = rnd() * TAU;
      line(ctx, 0, 0, Math.cos(a) * m * 0.28, Math.sin(a) * m * 0.28, rgba('#e9e4d6', 0.7), Math.max(0.8, m * 0.025));
    }
  },
  willow(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', g.w * 0.47, g.h * 0.47, 2.4);
    circle(ctx, 0, 0, m * 0.46, '#5e7f3a');
    for (let i = 0; i < 70; i += 1) {
      const a = rnd() * TAU;
      const r0 = m * (0.08 + rnd() * 0.2);
      const r1 = m * (0.36 + rnd() * 0.14);
      const bend = (rnd() - 0.5) * 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.quadraticCurveTo(Math.cos(a + bend) * (r0 + r1) / 2, Math.sin(a + bend) * (r0 + r1) / 2, Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.strokeStyle = shade('#8fb35a', (rnd() - 0.4) * 0.25);
      ctx.lineWidth = Math.max(0.8, m * 0.012);
      ctx.stroke();
    }
    circle(ctx, 0, 0, m * 0.12, lit(ctx, 0, 0, m * 0.12, '#6f9445'));
  },
  palm(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', g.w * 0.42, g.h * 0.42, 2.4);
    const n = 8;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU + rnd() * 0.3;
      const len = m * (0.44 + rnd() * 0.06);
      ctx.save();
      ctx.rotate(a);
      const c = shade('#4f8a3a', (rnd() - 0.5) * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.5, -len * 0.22, len, 0);
      ctx.quadraticCurveTo(len * 0.5, len * 0.22, 0, 0);
      ctx.fillStyle = c;
      ctx.fill();
      line(ctx, 0, 0, len, 0, shade(c, -0.2), Math.max(0.6, m * 0.012));
      for (let k = 1; k < 7; k += 1) {
        const x = (len * k) / 7;
        const s = len * 0.16 * Math.sin((Math.PI * k) / 7);
        line(ctx, x, 0, x + s * 0.4, -s, shade(c, -0.15), Math.max(0.5, m * 0.008));
        line(ctx, x, 0, x + s * 0.4, s, shade(c, -0.15), Math.max(0.5, m * 0.008));
      }
      ctx.restore();
    }
    circle(ctx, 0, 0, m * 0.08, '#7a5530');
    for (let i = 0; i < 3; i += 1) circle(ctx, Math.cos(i * 2.1) * m * 0.06, Math.sin(i * 2.1) * m * 0.06, m * 0.035, '#5b3a1e');
  },
  dead_tree(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', g.w * 0.3, g.h * 0.3, 1.5);
    const branch = (x, y, a, len, wd, depth) => {
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      line(ctx, x, y, x2, y2, depth > 1 ? '#4a3a2c' : '#5e4c3c', wd);
      if (depth <= 0) return;
      branch(x2, y2, a - 0.4 - rnd() * 0.3, len * 0.62, wd * 0.6, depth - 1);
      branch(x2, y2, a + 0.4 + rnd() * 0.3, len * 0.62, wd * 0.6, depth - 1);
    };
    for (let i = 0; i < 5; i += 1) branch(0, 0, (i / 5) * TAU + rnd() * 0.5, m * 0.2, m * 0.06, 2);
    circle(ctx, 0, 0, m * 0.09, '#4a3a2c', '#2e241a', Math.max(0.5, m * 0.015));
  },
  stump(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', g.w * 0.4, g.h * 0.4);
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU + rnd();
      line(ctx, 0, 0, Math.cos(a) * m * 0.45, Math.sin(a) * m * 0.45, '#5a3d22', m * 0.1);
    }
    circle(ctx, 0, 0, m * 0.36, '#5a3d22');
    circle(ctx, 0, 0, m * 0.3, '#b08a5a');
    for (let r = 0.06; r < 0.3; r += 0.06) circle(ctx, 0, 0, m * r, null, '#8a6a42', Math.max(0.5, m * 0.012));
    line(ctx, -m * 0.05, -m * 0.02, m * 0.2, m * 0.1, '#6a4a2a', Math.max(0.5, m * 0.02));
  },
  log(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.5, h * 0.32);
    rrect(ctx, -w / 2, -h * 0.32, w, h * 0.64, h * 0.3, radial(ctx, 0, -h * 0.1, w * 0.6, '#7b5634', '#523720'), '#3e2914', Math.max(1, m * 0.05));
    for (let i = 0; i < 6; i += 1) {
      const ly = (rnd() - 0.5) * h * 0.45;
      line(ctx, -w * 0.45 + rnd() * w * 0.1, ly, w * (0.1 + rnd() * 0.3), ly + (rnd() - 0.5) * h * 0.05, '#4c3219', Math.max(0.5, m * 0.03));
    }
    oval(ctx, w / 2 - h * 0.12, 0, h * 0.14, h * 0.3, 0, '#c19a66', '#6b4a2b', Math.max(0.5, m * 0.03));
    oval(ctx, w / 2 - h * 0.12, 0, h * 0.07, h * 0.15, 0, null, '#8a6a42', Math.max(0.5, m * 0.02));
  },
  bush(g) {
    shadow(g, 'round', g.w * 0.44, g.h * 0.44, 1);
    canopy(g, g.m * 0.48, 6, g.t, { spots: 2 });
  },
  bush_berry(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', g.w * 0.44, g.h * 0.44, 1);
    canopy(g, m * 0.48, 6, '#3f7a33', { spots: 1.5 });
    for (let i = 0; i < 14; i += 1) {
      const a = rnd() * TAU;
      const d = rnd() * m * 0.38;
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * 0.045, lit(ctx, Math.cos(a) * d, Math.sin(a) * d, m * 0.045, g.t, 0.2));
    }
  },
  flowers(g) {
    const { ctx, m, rnd } = g;
    for (let i = 0; i < 6; i += 1) smoothShape(ctx, blobPoints((rnd() - 0.5) * m * 0.5, (rnd() - 0.5) * m * 0.5, m * 0.18, m * 0.14, 6, 0.5, rnd), rgba('#3f7a33', 0.85));
    for (let i = 0; i < 11; i += 1) {
      const x = (rnd() - 0.5) * m * 0.8;
      const y = (rnd() - 0.5) * m * 0.8;
      const r = m * (0.05 + rnd() * 0.03);
      const c = i % 4 === 3 ? '#f4f0e0' : shade(g.t, (rnd() - 0.5) * 0.2);
      for (let k = 0; k < 5; k += 1) circle(ctx, x + Math.cos((k / 5) * TAU) * r, y + Math.sin((k / 5) * TAU) * r, r * 0.75, c);
      circle(ctx, x, y, r * 0.55, '#f2c12e');
    }
  },
  tall_grass(g) {
    const { ctx, m, rnd } = g;
    smoothShape(ctx, blobPoints(0, 0, m * 0.44, m * 0.4, 9, 0.35, rnd), rgba('#2f5a24', 0.35));
    for (let i = 0; i < 14; i += 1) {
      const cx = (rnd() - 0.5) * m * 0.75;
      const cy = (rnd() - 0.5) * m * 0.75;
      for (let k = 0; k < 8; k += 1) {
        const a = rnd() * TAU;
        const l = m * (0.1 + rnd() * 0.14);
        line(ctx, cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l, shade('#4f7f2c', (rnd() - 0.45) * 0.35), Math.max(0.8, m * 0.026));
      }
    }
  },
  ferns(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', g.w * 0.42, g.h * 0.42, 0.6);
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * TAU + rnd() * 0.4;
      ctx.save();
      ctx.rotate(a);
      const len = m * (0.44 + rnd() * 0.06);
      const c = shade('#2f6a32', (rnd() - 0.5) * 0.14);
      for (let k = 1; k < 9; k += 1) {
        const x = (len * k) / 9;
        const s = m * 0.12 * (1 - k / 10);
        oval(ctx, x + s * 0.3, -s * 0.55, s * 0.75, s * 0.3, -0.6, c, shade(c, -0.18), Math.max(0.5, m * 0.006));
        oval(ctx, x + s * 0.3, s * 0.55, s * 0.75, s * 0.3, 0.6, c, shade(c, -0.18), Math.max(0.5, m * 0.006));
      }
      line(ctx, 0, 0, len, 0, shade(c, 0.18), Math.max(0.7, m * 0.018));
      ctx.restore();
    }
  },
  reeds(g) {
    const { ctx, m, rnd } = g;
    smoothShape(ctx, blobPoints(0, 0, m * 0.4, m * 0.36, 8, 0.4, rnd), rgba('#3a4a24', 0.35));
    for (let i = 0; i < 34; i += 1) {
      const x = (rnd() - 0.5) * m * 0.8;
      const y = (rnd() - 0.5) * m * 0.8;
      const a = rnd() * TAU;
      line(ctx, x, y, x + Math.cos(a) * m * 0.16, y + Math.sin(a) * m * 0.16, shade('#6a8a36', (rnd() - 0.5) * 0.3), Math.max(0.8, m * 0.024));
      if (i % 4 === 0) oval(ctx, x + Math.cos(a) * m * 0.16, y + Math.sin(a) * m * 0.16, m * 0.05, m * 0.026, a, '#5e3a1c', '#3a220e', Math.max(0.5, m * 0.008));
    }
  },
  mushrooms(g) {
    const { ctx, m, rnd } = g;
    for (let i = 0; i < 5; i += 1) {
      const x = (rnd() - 0.5) * m * 0.6;
      const y = (rnd() - 0.5) * m * 0.6;
      const r = m * (0.08 + rnd() * 0.07);
      circle(ctx, x + r * 0.25, y + r * 0.3, r, 'rgba(0,0,0,0.25)');
      circle(ctx, x, y, r, lit(ctx, x, y, r, g.t, 0.18), shade(g.t, -0.3), Math.max(0.5, r * 0.1));
      for (let k = 0; k < 3; k += 1) circle(ctx, x + (rnd() - 0.5) * r, y + (rnd() - 0.5) * r, r * 0.16, '#f6efe0');
    }
  },
  giant_mushroom(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', g.w * 0.46, g.h * 0.46, 2.4);
    circle(ctx, 0, 0, m * 0.48, lit(ctx, 0, 0, m * 0.48, g.t, 0.16), shade(g.t, -0.35), Math.max(1, m * 0.02));
    circle(ctx, 0, 0, m * 0.38, null, rgba(shade(g.t, -0.2), 0.6), Math.max(0.8, m * 0.012));
    for (let i = 0; i < 9; i += 1) {
      const a = rnd() * TAU;
      const d = rnd() * m * 0.36;
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * (0.03 + rnd() * 0.04), rgba('#f6efe0', 0.85));
    }
  },
  lily_pads(g) {
    const { ctx, m, rnd } = g;
    for (let i = 0; i < 4; i += 1) {
      const x = (rnd() - 0.5) * m * 0.55;
      const y = (rnd() - 0.5) * m * 0.55;
      const r = m * (0.12 + rnd() * 0.08);
      const a = rnd() * TAU;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, a + 0.35, a + TAU - 0.35);
      ctx.closePath();
      ctx.fillStyle = shade('#4f8a3a', (rnd() - 0.5) * 0.15);
      ctx.fill();
      ctx.strokeStyle = '#2f5a24';
      ctx.lineWidth = Math.max(0.5, m * 0.012);
      ctx.stroke();
    }
    for (let k = 0; k < 6; k += 1) oval(ctx, m * 0.1 + Math.cos((k / 6) * TAU) * m * 0.04, -m * 0.05 + Math.sin((k / 6) * TAU) * m * 0.04, m * 0.05, m * 0.025, (k / 6) * TAU, '#f2b8cf');
    circle(ctx, m * 0.1, -m * 0.05, m * 0.025, '#f2d14a');
  },
  vines(g) {
    const { ctx, w, h, m, rnd } = g;
    for (let s = 0; s < 3; s += 1) {
      const pts = [];
      for (let i = 0; i <= 8; i += 1) pts.push([-w / 2 + (w * i) / 8, (rnd() - 0.5) * h * 0.7]);
      polyline(ctx, pts, '#3d5e2a', Math.max(0.8, m * 0.04));
      for (const [x, y] of pts) {
        oval(ctx, x + m * 0.06, y - m * 0.06, m * 0.09, m * 0.05, rnd() * TAU, shade('#4f8a3a', (rnd() - 0.5) * 0.2));
        oval(ctx, x - m * 0.04, y + m * 0.06, m * 0.08, m * 0.045, rnd() * TAU, shade('#4f8a3a', (rnd() - 0.5) * 0.2));
      }
    }
  },
  cactus(g) {
    const { ctx, m } = g;
    shadow(g, 'round', g.w * 0.36, g.h * 0.36, 1.2);
    circle(ctx, 0, 0, m * 0.38, lit(ctx, 0, 0, m * 0.38, '#4f8a4a', 0.15), '#2f5a2c', Math.max(0.8, m * 0.02));
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU;
      line(ctx, Math.cos(a) * m * 0.08, Math.sin(a) * m * 0.08, Math.cos(a) * m * 0.36, Math.sin(a) * m * 0.36, '#3a6b37', Math.max(0.5, m * 0.015));
      circle(ctx, Math.cos(a + 0.3) * m * 0.3, Math.sin(a + 0.3) * m * 0.3, m * 0.012, '#f0ead0');
    }
    for (let k = 0; k < 5; k += 1) oval(ctx, Math.cos((k / 5) * TAU) * m * 0.05, Math.sin((k / 5) * TAU) * m * 0.05, m * 0.05, m * 0.025, (k / 5) * TAU, '#f06a9a');
  },
  crops(g) {
    const { ctx, w, h, m, rnd } = g;
    rect(ctx, -w / 2, -h / 2, w, h, rgba('#5a3e24', 0.6));
    const rows = 5;
    for (let r = 0; r < rows; r += 1) {
      const y = -h / 2 + (h * (r + 0.5)) / rows;
      for (let i = 0; i < 14; i += 1) {
        const x = -w / 2 + (w * (i + 0.5)) / 14 + (rnd() - 0.5) * w * 0.02;
        for (let k = 0; k < 4; k += 1) {
          const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
          line(ctx, x, y, x + Math.cos(a) * m * 0.07, y + Math.sin(a) * m * 0.07, shade(g.t, (rnd() - 0.5) * 0.25), Math.max(0.6, m * 0.012));
        }
      }
    }
  },

  // ----- Rocks and ground -----
  rock(g) {
    shadow(g, 'round', g.w * 0.42, g.h * 0.4);
    stone(g, 0, 0, g.w * 0.4, g.h * 0.36, '#7b766e');
  },
  rocks(g) {
    const { m, rnd } = g;
    for (let i = 0; i < 6; i += 1) {
      const x = (rnd() - 0.5) * m * 0.7;
      const y = (rnd() - 0.5) * m * 0.7;
      const r = m * (0.05 + rnd() * 0.07);
      oval(g.ctx, x + r * 0.3, y + r * 0.35, r, r * 0.85, 0, 'rgba(0,0,0,0.25)');
      stone(g, x, y, r, r * 0.85, shade('#827c72', (rnd() - 0.5) * 0.15), 7, 0.3);
    }
  },
  boulder(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', g.w * 0.46, g.h * 0.44, 1.6);
    stone(g, 0, 0, g.w * 0.44, g.h * 0.4, '#77726a', 11, 0.28);
    stone(g, -m * 0.08, -m * 0.06, g.w * 0.22, g.h * 0.18, '#88837a', 8, 0.3);
    for (let i = 0; i < 5; i += 1) circle(ctx, (rnd() - 0.2) * m * 0.4, (rnd() - 0.2) * m * 0.3, m * 0.03, rgba('#5f7a3a', 0.6));
  },
  outcrop(g) {
    const { w, h } = g;
    shadow(g, 'round', w * 0.48, h * 0.46, 1.8);
    stone(g, -w * 0.18, 0, w * 0.3, h * 0.42, '#6f6a62', 10, 0.3);
    stone(g, w * 0.2, h * 0.06, w * 0.28, h * 0.36, '#7a756c', 9, 0.32);
    stone(g, 0, -h * 0.18, w * 0.22, h * 0.28, '#837d73', 8, 0.3);
  },
  stalagmite(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', g.w * 0.4, g.h * 0.4, 1.8);
    for (let i = 0; i < 5; i += 1) {
      const r = m * (0.44 - i * 0.085);
      smoothShape(ctx, blobPoints(-i * m * 0.02, -i * m * 0.02, r, r, 8, 0.25, rnd), shade('#6e665c', i * 0.05), shade('#3e3830', 0), Math.max(0.5, m * 0.012));
    }
    circle(ctx, -m * 0.09, -m * 0.09, m * 0.04, '#b0a596');
  },
  rubble(g) {
    const { ctx, m, rnd } = g;
    smoothShape(ctx, blobPoints(0, 0, m * 0.46, m * 0.42, 10, 0.4, rnd), rgba('#5e5850', 0.5));
    for (let i = 0; i < 16; i += 1) {
      const x = (rnd() - 0.5) * m * 0.8;
      const y = (rnd() - 0.5) * m * 0.75;
      const r = m * (0.04 + rnd() * 0.08);
      oval(ctx, x + r * 0.3, y + r * 0.3, r, r * 0.8, 0, 'rgba(0,0,0,0.25)');
      stone(g, x, y, r, r * 0.8, shade('#857f74', (rnd() - 0.5) * 0.2), 5 + Math.floor(rnd() * 3), 0.5);
    }
  },
  crater(g) {
    const { ctx, m, rnd } = g;
    circle(ctx, 0, 0, m * 0.48, radial(ctx, 0, 0, m * 0.48, 'rgba(25,20,15,0.85)', 'rgba(90,75,60,0.15)'));
    circle(ctx, 0, 0, m * 0.44, null, rgba('#a89a86', 0.6), m * 0.05);
    for (let i = 0; i < 12; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.4 + rnd() * 0.12);
      stone(g, Math.cos(a) * d, Math.sin(a) * d, m * 0.04, m * 0.035, '#7d7468', 6, 0.4);
    }
  },
  puddle(g) {
    const { ctx, m, rnd } = g;
    smoothShape(ctx, blobPoints(0, 0, m * 0.44, m * 0.36, 9, 0.35, rnd), rgba(shade(g.t, -0.1), 0.85), rgba(shade(g.t, -0.3), 0.6), Math.max(0.5, m * 0.02));
    smoothShape(ctx, blobPoints(-m * 0.08, -m * 0.06, m * 0.2, m * 0.12, 7, 0.4, rnd), rgba(shade(g.t, 0.2), 0.5));
    line(ctx, m * 0.05, m * 0.06, m * 0.2, m * 0.04, rgba('#ffffff', 0.5), Math.max(0.5, m * 0.015));
  },
  bones(g) {
    const { ctx, m, rnd } = g;
    const bone = (x, y, a, l) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      line(ctx, -l / 2, 0, l / 2, 0, '#e8e0c8', m * 0.05);
      for (const s of [-1, 1]) {
        circle(ctx, (s * l) / 2, -m * 0.025, m * 0.035, '#e8e0c8');
        circle(ctx, (s * l) / 2, m * 0.025, m * 0.035, '#e8e0c8');
      }
      ctx.restore();
    };
    for (let i = 0; i < 4; i += 1) bone((rnd() - 0.5) * m * 0.5, (rnd() - 0.5) * m * 0.5, rnd() * TAU, m * (0.25 + rnd() * 0.15));
    ART.skull({ ...g, ctx, w: m * 0.32, h: m * 0.32, m: m * 0.32, sx: g.sx * 0.5, sy: g.sy * 0.5 });
  },
  skull(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.4, m * 0.44, 0.6);
    oval(ctx, 0, -m * 0.05, m * 0.38, m * 0.42, 0, lit(ctx, 0, -m * 0.05, m * 0.42, '#e6dcc2', 0.12), '#9a8f74', Math.max(0.5, m * 0.04));
    oval(ctx, -m * 0.14, m * 0.14, m * 0.1, m * 0.08, 0, '#2a241c');
    oval(ctx, m * 0.14, m * 0.14, m * 0.1, m * 0.08, 0, '#2a241c');
    line(ctx, 0, -m * 0.3, 0, -m * 0.05, rgba('#9a8f74', 0.7), Math.max(0.5, m * 0.02));
  },
  blood(g) {
    const { ctx, m, rnd } = g;
    smoothShape(ctx, blobPoints(0, 0, m * 0.3, m * 0.24, 10, 0.6, rnd), rgba(g.t, 0.85));
    for (let i = 0; i < 9; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.25 + rnd() * 0.2);
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * (0.02 + rnd() * 0.04), rgba(g.t, 0.8));
    }
    smoothShape(ctx, blobPoints(-m * 0.05, -m * 0.05, m * 0.1, m * 0.07, 7, 0.5, rnd), rgba(shade(g.t, 0.12), 0.6));
  },
  crack(g) {
    const { ctx, w, h, m, rnd } = g;
    const jag = (x1, y1, x2, y2, wd, n) => {
      const pts = [[x1, y1]];
      for (let i = 1; i < n; i += 1) pts.push([x1 + ((x2 - x1) * i) / n + (rnd() - 0.5) * m * 0.12, y1 + ((y2 - y1) * i) / n + (rnd() - 0.5) * m * 0.12]);
      pts.push([x2, y2]);
      polyline(ctx, pts, rgba('#1c1814', 0.8), wd);
      return pts;
    };
    const main = jag(-w * 0.48, (rnd() - 0.5) * h * 0.6, w * 0.48, (rnd() - 0.5) * h * 0.6, Math.max(1, m * 0.04), 6);
    for (let i = 1; i < 5; i += 2) {
      const [x, y] = main[i];
      jag(x, y, x + (rnd() - 0.3) * w * 0.3, y + (rnd() - 0.5) * h * 0.5, Math.max(0.6, m * 0.02), 3);
    }
  },
  web(g) {
    const { ctx, m, rnd } = g;
    const n = 9;
    const r = m * 0.48;
    const spokes = Array.from({ length: n }, (_, i) => (i / n) * TAU + rnd() * 0.3);
    for (const a of spokes) line(ctx, 0, 0, Math.cos(a) * r, Math.sin(a) * r, rgba('#f0f0f0', 0.7), Math.max(0.5, m * 0.008));
    for (let ring = 1; ring <= 7; ring += 1) {
      const pts = spokes.map((a) => [Math.cos(a) * (r * ring) / 7.5, Math.sin(a) * (r * ring) / 7.5]);
      poly(ctx, pts, null, rgba('#f0f0f0', 0.55), Math.max(0.5, m * 0.006));
    }
  },

  // ----- Water -----
  bridge(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.5, h * 0.5, 0.8);
    planks(g, -w * 0.42, -h / 2, w * 0.84, h, '#8b623a', Math.round(h / (m * 0.18)), true, 0.25);
    for (const s of [-1, 1]) {
      rect(ctx, s * w * 0.42 - w * 0.06, -h / 2, w * 0.12, h, '#5b3d22', '#3a2614', Math.max(0.5, m * 0.02));
      for (let i = 0; i <= 4; i += 1) circle(ctx, s * w * 0.42, -h / 2 + (h * i) / 4, m * 0.07, '#4a3018');
    }
  },
  bridge_stone(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.5, h * 0.5, 0.8);
    rect(ctx, -w * 0.4, -h / 2, w * 0.8, h, '#8a847a');
    for (let r = 0; r < Math.round(h / (m * 0.3)); r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const bh = h / Math.round(h / (m * 0.3));
        rect(ctx, -w * 0.4 + (w * 0.8 * c) / 3 + (r % 2 ? w * 0.13 : 0) - w * 0.13 * (c === 0 && r % 2 ? 1 : 0), -h / 2 + r * bh, (w * 0.8) / 3, bh, shade('#8a847a', (rnd() - 0.5) * 0.1), '#625c53', Math.max(0.5, m * 0.012));
      }
    }
    for (const s of [-1, 1]) {
      rect(ctx, s * w * 0.42 - w * 0.08, -h / 2, w * 0.16, h, '#6c665d', '#45403a', Math.max(0.8, m * 0.02));
      for (let i = 0; i < 8; i += 1) line(ctx, s * w * 0.42 - w * 0.08, -h / 2 + (h * i) / 8, s * w * 0.42 + w * 0.08, -h / 2 + (h * i) / 8, '#45403a', Math.max(0.5, m * 0.012), 'butt');
    }
  },
  dock(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.5, h * 0.5, 0.6);
    planks(g, -w / 2, -h / 2, w, h, '#7d5a36', Math.round(h / (m * 0.2)), true, 0.25);
    for (const s of [-1, 1]) for (let i = 0; i <= 3; i += 1) circle(ctx, s * w * 0.46, -h / 2 + m * 0.1 + ((h - m * 0.2) * i) / 3, m * 0.09, lit(ctx, s * w * 0.46, -h / 2 + m * 0.1 + ((h - m * 0.2) * i) / 3, m * 0.09, '#5b3d22'), '#2e1f10', Math.max(0.5, m * 0.015));
  },
  rowboat(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'round', w * 0.5, h * 0.48, 0.6);
    const hull = (k) => {
      ctx.beginPath();
      ctx.moveTo(0, -h / 2 * k);
      ctx.quadraticCurveTo(w / 2 * k, -h * 0.2 * k, w * 0.42 * k, h * 0.38 * k);
      ctx.quadraticCurveTo(0, h / 2 * k, -w * 0.42 * k, h * 0.38 * k);
      ctx.quadraticCurveTo(-w / 2 * k, -h * 0.2 * k, 0, -h / 2 * k);
      ctx.closePath();
    };
    hull(1);
    ctx.fillStyle = '#5b3d22';
    ctx.fill();
    hull(0.84);
    ctx.fillStyle = '#9a7048';
    ctx.fill();
    for (const y of [-h * 0.12, h * 0.16]) rect(ctx, -w * 0.38, y, w * 0.76, h * 0.06, '#6e4a2a');
    line(ctx, -w * 0.75, -h * 0.05, w * 0.75, h * 0.05, '#7a5532', Math.max(0.8, m * 0.05));
    for (const s of [-1, 1]) oval(ctx, s * w * 0.72, s * h * 0.05, w * 0.12, h * 0.05, 0.1, '#7a5532');
  },

  // ----- Camp and travel -----
  campfire(g) {
    const { ctx, m } = g;
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * TAU;
      stone(g, Math.cos(a) * m * 0.38, Math.sin(a) * m * 0.38, m * 0.1, m * 0.09, '#77716a', 7, 0.3);
    }
    circle(ctx, 0, 0, m * 0.3, '#2a201a');
    line(ctx, -m * 0.25, -m * 0.18, m * 0.25, m * 0.18, '#4e321b', m * 0.09);
    line(ctx, m * 0.25, -m * 0.18, -m * 0.25, m * 0.18, '#4e321b', m * 0.09);
    fire(g, 0, 0, m * 0.2);
  },
  tent(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.48, h * 0.48, 1.4);
    for (const [x, y] of [[-w * 0.5, -h * 0.5], [w * 0.5, -h * 0.5], [-w * 0.5, h * 0.5], [w * 0.5, h * 0.5]]) line(ctx, x * 0.8, y * 0.8, x, y, rgba('#d8ccb0', 0.8), Math.max(0.5, m * 0.01));
    rect(ctx, -w * 0.42, -h * 0.42, w * 0.42, h * 0.84, shade(t, 0.1));
    rect(ctx, 0, -h * 0.42, w * 0.42, h * 0.84, shade(t, -0.1));
    line(ctx, 0, -h * 0.44, 0, h * 0.44, shade(t, -0.3), Math.max(1, m * 0.03));
    rect(ctx, -w * 0.42, -h * 0.42, w * 0.84, h * 0.84, null, shade(t, -0.3), Math.max(0.8, m * 0.02));
    poly(ctx, [[-w * 0.18, h * 0.42], [0, h * 0.22], [w * 0.18, h * 0.42]], shade(t, -0.25));
  },
  pavilion(g) {
    const { ctx, m, t } = g;
    shadow(g, 'round', g.w * 0.48, g.h * 0.48, 1.6);
    const n = 12;
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * TAU;
      const a1 = ((i + 1) / n) * TAU;
      const lightSide = Math.cos((a0 + a1) / 2 + Math.PI * 0.75);
      const c = i % 2 ? '#efe6d2' : t;
      poly(ctx, [[0, 0], [Math.cos(a0) * m * 0.48, Math.sin(a0) * m * 0.48], [Math.cos(a1) * m * 0.48, Math.sin(a1) * m * 0.48]], shade(c, lightSide * 0.1));
    }
    for (let i = 0; i < n; i += 1) {
      const a = ((i + 0.5) / n) * TAU;
      circle(ctx, Math.cos(a) * m * 0.48, Math.sin(a) * m * 0.48, m * 0.05, i % 2 ? t : '#efe6d2');
    }
    circle(ctx, 0, 0, m * 0.48, null, shade(t, -0.35), Math.max(0.8, m * 0.012));
    circle(ctx, 0, 0, m * 0.05, '#d4a72c', '#7a5a14', Math.max(0.5, m * 0.01));
  },
  bedroll(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.46, h * 0.48, 0.4);
    rrect(ctx, -w * 0.45, -h * 0.47, w * 0.9, h * 0.94, w * 0.25, t, shade(t, -0.3), Math.max(0.5, m * 0.04));
    rrect(ctx, -w * 0.4, -h * 0.44, w * 0.8, h * 0.22, w * 0.2, '#d8cdb0');
    for (let i = 1; i < 4; i += 1) line(ctx, -w * 0.4, -h * 0.1 + i * h * 0.12, w * 0.4, -h * 0.1 + i * h * 0.12, rgba(shade(t, -0.2), 0.6), Math.max(0.5, m * 0.02));
    rrect(ctx, -w * 0.45, h * 0.3, w * 0.9, h * 0.17, w * 0.2, shade(t, -0.12));
  },
  cart(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.42, h * 0.48, 0.8);
    for (const s of [-1, 1]) wheel(ctx, -w * 0.08, s * h * 0.46, w * 0.34, h * 0.1);
    line(ctx, w * 0.3, -h * 0.25, w * 0.5, -h * 0.25, '#5b3d22', m * 0.07);
    line(ctx, w * 0.3, h * 0.25, w * 0.5, h * 0.25, '#5b3d22', m * 0.07);
    planks(g, -w * 0.42, -h * 0.4, w * 0.72, h * 0.8, '#8b623a', 5, false);
    rect(ctx, -w * 0.42, -h * 0.4, w * 0.72, h * 0.8, null, '#4a3018', Math.max(1, m * 0.06));
  },
  wagon(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.46, h * 0.48, 1.2);
    for (const x of [-w * 0.3, w * 0.2]) for (const s of [-1, 1]) wheel(ctx, x, s * h * 0.46, w * 0.18, h * 0.1);
    line(ctx, w * 0.36, -h * 0.2, w * 0.5, -h * 0.2, '#5b3d22', m * 0.06);
    line(ctx, w * 0.36, h * 0.2, w * 0.5, h * 0.2, '#5b3d22', m * 0.06);
    rect(ctx, -w * 0.42, -h * 0.38, w * 0.8, h * 0.76, '#6e4a2a');
    rrect(ctx, -w * 0.38, -h * 0.42, w * 0.72, h * 0.84, h * 0.3, radial(ctx, -w * 0.02, -h * 0.15, w * 0.5, shade(t, 0.08), shade(t, -0.16)), shade(t, -0.35), Math.max(0.8, m * 0.02));
    for (let i = 1; i < 6; i += 1) line(ctx, -w * 0.38 + (w * 0.72 * i) / 6, -h * 0.41, -w * 0.38 + (w * 0.72 * i) / 6, h * 0.41, rgba(shade(t, -0.3), 0.7), Math.max(0.6, m * 0.02));
  },
  hay_bale(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.46, h * 0.46, 0.8);
    rrect(ctx, -w * 0.45, -h * 0.45, w * 0.9, h * 0.9, m * 0.1, lit(ctx, 0, 0, m * 0.6, '#d2b25a', 0.1), '#9a7a2a', Math.max(0.5, m * 0.03));
    for (let i = 0; i < 40; i += 1) {
      const x = (rnd() - 0.5) * w * 0.8;
      const y = (rnd() - 0.5) * h * 0.8;
      const a = rnd() * TAU;
      line(ctx, x, y, x + Math.cos(a) * m * 0.08, y + Math.sin(a) * m * 0.08, shade('#d2b25a', (rnd() - 0.5) * 0.3), Math.max(0.5, m * 0.012));
    }
    for (const y of [-h * 0.18, h * 0.18]) line(ctx, -w * 0.45, y, w * 0.45, y, '#7a5a2a', Math.max(0.6, m * 0.025), 'butt');
  },
  woodpile(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.48, h * 0.46, 0.8);
    const n = 5;
    for (let i = 0; i < n; i += 1) {
      const y = -h * 0.4 + (h * 0.8 * (i + 0.5)) / n;
      rrect(ctx, -w * 0.46, y - (h * 0.8) / n / 2, w * 0.92, (h * 0.8) / n, (h * 0.4) / n, shade('#6e4a2a', (rnd() - 0.5) * 0.15), '#3e2914', Math.max(0.5, m * 0.015));
      oval(ctx, w * 0.44, y, h * 0.04, (h * 0.36) / n, 0, '#c19a66');
    }
  },
  sack(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'round', w * 0.42, h * 0.42, 0.6);
    smoothShape(ctx, blobPoints(0, m * 0.04, w * 0.42, h * 0.38, 8, 0.2, rnd), lit(ctx, 0, 0, m * 0.45, '#a88a5a', 0.12), '#6b5432', Math.max(0.5, m * 0.04));
    circle(ctx, 0, -h * 0.3, m * 0.1, '#8a6e44', '#5a4428', Math.max(0.5, m * 0.03));
    for (let i = 0; i < 4; i += 1) line(ctx, (rnd() - 0.5) * w * 0.5, (rnd() - 0.3) * h * 0.4, (rnd() - 0.5) * w * 0.5, (rnd() + 0.1) * h * 0.3, rgba('#6b5432', 0.6), Math.max(0.5, m * 0.02));
  },
  sacks(g) {
    const { m, rnd } = g;
    for (const [x, y] of [[-0.18, -0.12], [0.18, -0.08], [0, 0.18]]) {
      g.ctx.save();
      g.ctx.translate(x * m, y * m);
      g.ctx.rotate((rnd() - 0.5) * 1.2);
      ART.sack({ ...g, w: m * 0.5, h: m * 0.5, m: m * 0.5 });
      g.ctx.restore();
    }
  },
  cooking_pot(g) {
    const { ctx, m } = g;
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TAU - Math.PI / 2;
      line(ctx, 0, 0, Math.cos(a) * m * 0.46, Math.sin(a) * m * 0.46, '#3a2a1a', m * 0.04);
    }
    fire(g, 0, 0, m * 0.32);
    circle(ctx, 0, 0, m * 0.26, '#1e1e1e', '#444', Math.max(0.5, m * 0.03));
    circle(ctx, 0, 0, m * 0.2, radial(ctx, 0, 0, m * 0.2, '#9a6a3a', '#6a4a2a'));
    for (let i = 0; i < 4; i += 1) circle(ctx, Math.cos(i * 1.7) * m * 0.09, Math.sin(i * 1.7) * m * 0.09, m * 0.025, '#b0884e');
  },
  signpost(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.2, m * 0.2, 1.2);
    const arrow = (a) => {
      ctx.save();
      ctx.rotate(a);
      poly(ctx, [[0, -m * 0.08], [m * 0.36, -m * 0.08], [m * 0.46, 0], [m * 0.36, m * 0.08], [0, m * 0.08]], '#9a7048', '#4a3018', Math.max(0.5, m * 0.02));
      ctx.restore();
    };
    arrow(-0.4);
    arrow(2.5);
    arrow(1.3);
    circle(ctx, 0, 0, m * 0.1, '#5b3d22', '#2e1f10', Math.max(0.5, m * 0.02));
  },
  lamp_post(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.3, m * 0.3, 2);
    glow(ctx, 0, 0, m * 0.9, '#ffd27a', 0.35);
    rect(ctx, -m * 0.28, -m * 0.28, m * 0.56, m * 0.56, '#2b2b2b', '#111', Math.max(0.5, m * 0.04));
    rect(ctx, -m * 0.2, -m * 0.2, m * 0.4, m * 0.4, '#ffe08a');
    line(ctx, -m * 0.2, 0, m * 0.2, 0, '#2b2b2b', Math.max(0.5, m * 0.04));
    line(ctx, 0, -m * 0.2, 0, m * 0.2, '#2b2b2b', Math.max(0.5, m * 0.04));
    circle(ctx, 0, 0, m * 0.08, '#3a3a3a');
  },
  trough(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.44, 0.6);
    rect(ctx, -w * 0.48, -h * 0.42, w * 0.96, h * 0.84, '#6e4a2a', '#3e2914', Math.max(0.8, m * 0.05));
    rect(ctx, -w * 0.42, -h * 0.26, w * 0.84, h * 0.52, radial(ctx, 0, 0, w * 0.4, '#5d8fb0', '#3a6a8a'));
    line(ctx, -w * 0.3, -h * 0.05, -w * 0.1, -h * 0.05, rgba('#ffffff', 0.4), Math.max(0.5, m * 0.03));
  },
  target(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.46, m * 0.46, 0.8);
    circle(ctx, 0, 0, m * 0.48, '#c8a85a', '#8a6a2a', Math.max(0.5, m * 0.02));
    const rings = ['#f0ebe0', '#2a2a2a', '#3a7ab8', '#c0392b', '#f2c12e'];
    rings.forEach((c, i) => circle(ctx, 0, 0, m * (0.4 - i * 0.075), c));
    for (const [x, y, a] of [[0.06, -0.04, 0.6], [-0.1, 0.08, 2.4]]) {
      line(ctx, x * m, y * m, x * m + Math.cos(a) * m * 0.3, y * m + Math.sin(a) * m * 0.3, '#5b3d22', Math.max(0.6, m * 0.025));
      circle(ctx, x * m + Math.cos(a) * m * 0.3, y * m + Math.sin(a) * m * 0.3, m * 0.035, '#e8e0d0');
    }
  },
  dummy(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.4, m * 0.4, 1.2);
    line(ctx, -m * 0.46, 0, m * 0.46, 0, '#5b3d22', m * 0.09);
    oval(ctx, 0, 0, m * 0.26, m * 0.2, 0, lit(ctx, 0, 0, m * 0.3, '#b8985e', 0.12), '#7a5a2a', Math.max(0.5, m * 0.03));
    circle(ctx, 0, -m * 0.02, m * 0.13, '#c8a86e', '#7a5a2a', Math.max(0.5, m * 0.03));
    line(ctx, -m * 0.06, -m * 0.05, m * 0.06, m * 0.01, '#7a2a2a', Math.max(0.5, m * 0.025));
  },

  // ----- Town -----
  market_stall(g) {
    const { ctx, w, h, m, t, rnd } = g;
    shadow(g, 'rect', w * 0.5, h * 0.48, 1.2);
    rect(ctx, -w * 0.48, h * 0.18, w * 0.96, h * 0.3, '#7a5532', '#4a3018', Math.max(0.5, m * 0.02));
    for (let i = 0; i < 12; i += 1) circle(ctx, -w * 0.42 + (w * 0.84 * i) / 11, h * 0.33 + (rnd() - 0.5) * h * 0.08, m * 0.06, ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#8e44ad'][Math.floor(rnd() * 5)]);
    const n = 8;
    for (let i = 0; i < n; i += 1) rect(ctx, -w * 0.5 + (w * i) / n, -h * 0.5, w / n, h * 0.66, i % 2 ? '#efe6d2' : t);
    rect(ctx, -w * 0.5, -h * 0.5, w, h * 0.33, 'rgba(255,255,255,0.08)');
    for (let i = 0; i < n; i += 1) {
      ctx.beginPath();
      ctx.arc(-w * 0.5 + (w * (i + 0.5)) / n, h * 0.16, w / n / 2, 0, Math.PI);
      ctx.fillStyle = i % 2 ? '#efe6d2' : t;
      ctx.fill();
    }
    line(ctx, -w * 0.5, -h * 0.17, w * 0.5, -h * 0.17, rgba(shade(t, -0.4), 0.4), Math.max(0.5, m * 0.02));
  },
  fountain(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.48, m * 0.48, 0.6);
    circle(ctx, 0, 0, m * 0.48, '#8d877d', '#5c574f', Math.max(0.8, m * 0.012));
    circle(ctx, 0, 0, m * 0.42, radial(ctx, 0, 0, m * 0.42, '#5aa0c8', '#2f6f9a'));
    for (let i = 0; i < 4; i += 1) circle(ctx, 0, 0, m * (0.18 + i * 0.06), null, rgba('#ffffff', 0.25 - i * 0.05), Math.max(0.5, m * 0.006));
    circle(ctx, 0, 0, m * 0.12, '#9d978d', '#5c574f', Math.max(0.5, m * 0.008));
    circle(ctx, 0, 0, m * 0.07, '#b5afa5');
    for (let i = 0; i < 16; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.13 + rnd() * 0.07);
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * 0.008, rgba('#ffffff', 0.8));
    }
  },
  statue(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.46, h * 0.46, 1.8);
    rect(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.92, '#7d786f', '#4f4b45', Math.max(0.5, m * 0.03));
    rect(ctx, -w * 0.38, -h * 0.38, w * 0.76, h * 0.76, '#8d887f');
    oval(ctx, 0, m * 0.06, m * 0.3, m * 0.16, 0, lit(ctx, 0, m * 0.06, m * 0.3, '#aaa59b', 0.12), '#6d685f', Math.max(0.5, m * 0.02));
    circle(ctx, 0, -m * 0.06, m * 0.12, lit(ctx, 0, -m * 0.06, m * 0.12, '#b5b0a6', 0.14), '#6d685f', Math.max(0.5, m * 0.02));
    line(ctx, m * 0.2, m * 0.1, m * 0.36, -m * 0.3, '#9a958b', Math.max(0.8, m * 0.04));
  },
  bench(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.42, 0.6);
    for (const x of [-w * 0.42, w * 0.42]) rect(ctx, x - m * 0.06, -h * 0.45, m * 0.12, h * 0.9, '#3e2914');
    planks(g, -w * 0.48, -h * 0.36, w * 0.96, h * 0.72, '#8b623a', 3, true, 0.3);
  },
  well(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.48, m * 0.48, 0.8);
    circle(ctx, 0, 0, m * 0.48, '#76716a');
    for (let i = 0; i < 14; i += 1) {
      const a0 = (i / 14) * TAU;
      const a1 = ((i + 1) / 14) * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, m * 0.47, a0 + 0.02, a1 - 0.02);
      ctx.arc(0, 0, m * 0.33, a1 - 0.02, a0 + 0.02, true);
      ctx.closePath();
      ctx.fillStyle = shade('#827c74', (rnd() - 0.5) * 0.14 + Math.cos((a0 + a1) / 2 + 2.4) * 0.06);
      ctx.fill();
    }
    circle(ctx, 0, 0, m * 0.32, radial(ctx, 0, 0, m * 0.32, '#0e1e2a', '#24506c'));
    line(ctx, -m * 0.48, -m * 0.02, m * 0.48, -m * 0.02, '#5b3d22', m * 0.07);
    circle(ctx, m * 0.05, m * 0.05, m * 0.08, '#6e4a2a', '#3e2914', Math.max(0.5, m * 0.015));
  },
  notice_board(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.48, h * 0.44, 1);
    rect(ctx, -w * 0.48, -h * 0.4, w * 0.96, h * 0.8, '#6e4a2a', '#3e2914', Math.max(0.5, m * 0.08));
    for (let i = 0; i < 6; i += 1) {
      ctx.save();
      ctx.translate(-w * 0.35 + (w * 0.7 * i) / 5, (rnd() - 0.5) * h * 0.2);
      ctx.rotate((rnd() - 0.5) * 0.4);
      rect(ctx, -m * 0.12, -h * 0.25, m * 0.24, h * 0.5, i % 3 ? '#efe6cf' : '#e8d9a8');
      circle(ctx, 0, -h * 0.2, m * 0.025, '#c0392b');
      ctx.restore();
    }
  },
  anvil(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.42, h * 0.4, 0.8);
    poly(ctx, [[-w * 0.3, -h * 0.35], [w * 0.22, -h * 0.35], [w * 0.48, 0], [w * 0.22, h * 0.35], [-w * 0.3, h * 0.35], [-w * 0.42, h * 0.2], [-w * 0.42, -h * 0.2]], radial(ctx, 0, -h * 0.1, w * 0.6, '#6a6e74', '#33363a'), '#1d1f22', Math.max(0.5, m * 0.04));
    line(ctx, -w * 0.25, -h * 0.15, w * 0.15, -h * 0.15, rgba('#ffffff', 0.25), Math.max(0.5, m * 0.04));
  },
  forge(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.48, h * 0.48, 1);
    rect(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#5a554f', '#35312d', Math.max(0.8, m * 0.02));
    for (let i = 0; i < 16; i += 1) rect(ctx, -w * 0.48 + (i % 4) * w * 0.24, -h * 0.48 + Math.floor(i / 4) * h * 0.24, w * 0.24, h * 0.24, null, '#3e3a35', Math.max(0.5, m * 0.01));
    rect(ctx, -w * 0.3, -h * 0.3, w * 0.6, h * 0.6, '#2a2420');
    glow(ctx, 0, 0, m * 0.45, '#ff7b2a', 0.5);
    for (let i = 0; i < 20; i += 1) circle(ctx, (rnd() - 0.5) * w * 0.5, (rnd() - 0.5) * h * 0.5, m * (0.03 + rnd() * 0.03), ['#ff4a1a', '#ff8a2a', '#ffc94a', '#7a2a10'][Math.floor(rnd() * 4)]);
    oval(ctx, w * 0.42, h * 0.32, m * 0.14, m * 0.08, 0.6, '#7a5532', '#3e2914', Math.max(0.5, m * 0.015));
  },
  gallows(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.48, 1.4);
    planks(g, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#7d5a36', 7, true, 0.25);
    rect(ctx, -w * 0.15, -h * 0.15, w * 0.3, h * 0.3, null, '#2e1f10', Math.max(0.8, m * 0.03));
    rect(ctx, -w * 0.46, -h * 0.46, w * 0.1, h * 0.1, '#4a3018');
    line(ctx, -w * 0.41, -h * 0.41, w * 0.05, -h * 0.41, '#4a3018', m * 0.08, 'butt');
    line(ctx, 0, -h * 0.41, 0, -h * 0.02, '#b8a07a', Math.max(0.6, m * 0.015));
    circle(ctx, 0, 0, m * 0.05, null, '#b8a07a', Math.max(0.6, m * 0.015));
  },
  wheelbarrow(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.42, h * 0.46, 0.6);
    line(ctx, -w * 0.3, h * 0.1, -w * 0.38, h * 0.48, '#5b3d22', m * 0.08);
    line(ctx, w * 0.3, h * 0.1, w * 0.38, h * 0.48, '#5b3d22', m * 0.08);
    wheel(ctx, 0, -h * 0.42, w * 0.14, h * 0.16);
    poly(ctx, [[-w * 0.42, -h * 0.28], [w * 0.42, -h * 0.28], [w * 0.32, h * 0.2], [-w * 0.32, h * 0.2]], radial(ctx, 0, -h * 0.04, w * 0.5, '#8a8e94', '#5a5e64'), '#33363a', Math.max(0.5, m * 0.04));
  },
  roof_tile(g) {
    const { ctx, w, h, m, t, rnd } = g;
    shadow(g, 'rect', w * 0.5, h * 0.5, 2);
    const rows = Math.max(4, Math.round(h / (m * 0.13)));
    for (const side of [-1, 1]) {
      const base = shade(t, side < 0 ? 0.06 : -0.08);
      const y0 = side < 0 ? -h / 2 : 0;
      rect(ctx, -w / 2, y0, w, h / 2, base);
      const half = rows / 2;
      for (let r = 0; r < half; r += 1) {
        const y = y0 + (h / 2) * (side < 0 ? r / half : (r + 1) / half);
        const cols = Math.max(6, Math.round(w / (m * 0.16)));
        for (let c = 0; c < cols; c += 1) {
          const x = -w / 2 + (w * (c + (r % 2 ? 0.5 : 0))) / cols;
          ctx.beginPath();
          ctx.arc(x + w / cols / 2, y, w / cols / 2, side < 0 ? 0 : Math.PI, side < 0 ? Math.PI : TAU);
          ctx.strokeStyle = shade(base, -0.2 + (rnd() - 0.5) * 0.06);
          ctx.lineWidth = Math.max(0.6, m * 0.012);
          ctx.stroke();
        }
      }
    }
    rect(ctx, -w / 2, -m * 0.04, w, m * 0.08, shade(t, -0.25));
    rect(ctx, -w / 2, -h / 2, w, h, null, shade(t, -0.4), Math.max(1, m * 0.03));
    rect(ctx, w * 0.22, -h * 0.34, m * 0.24, m * 0.24, '#7b756c', '#4f4a44', Math.max(0.5, m * 0.02));
    rect(ctx, w * 0.22 + m * 0.06, -h * 0.34 + m * 0.06, m * 0.12, m * 0.12, '#1f1b18');
  },
  roof_thatch(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.5, h * 0.5, 2);
    for (const side of [-1, 1]) {
      const base = side < 0 ? '#c4a35e' : '#a8884a';
      const y0 = side < 0 ? -h / 2 : 0;
      rrect(ctx, -w / 2, y0, w, h / 2, m * 0.08, base);
      for (let i = 0; i < (w * h) / (m * m) * 90; i += 1) {
        const x = -w / 2 + rnd() * w;
        const y = y0 + rnd() * (h / 2);
        line(ctx, x, y, x + (rnd() - 0.5) * m * 0.03, y + side * m * (0.06 + rnd() * 0.05), shade(base, (rnd() - 0.5) * 0.25), Math.max(0.5, m * 0.01));
      }
    }
    rrect(ctx, -w / 2, -m * 0.07, w, m * 0.14, m * 0.06, '#8a6c34', '#5a4420', Math.max(0.5, m * 0.015));
    rrect(ctx, -w / 2, -h / 2, w, h, m * 0.08, null, '#6a5228', Math.max(1, m * 0.03));
  },
  roof_tower(g) {
    const { ctx, m, t } = g;
    shadow(g, 'round', m * 0.48, m * 0.48, 2.4);
    const n = 16;
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * TAU;
      const a1 = ((i + 1) / n) * TAU;
      const light = Math.cos((a0 + a1) / 2 + Math.PI * 0.75) * 0.12;
      poly(ctx, [[0, 0], [Math.cos(a0) * m * 0.48, Math.sin(a0) * m * 0.48], [Math.cos(a1) * m * 0.48, Math.sin(a1) * m * 0.48]], shade(t, light), shade(t, -0.3), Math.max(0.5, m * 0.006));
    }
    for (let r = 0.12; r < 0.48; r += 0.07) circle(ctx, 0, 0, m * r, null, rgba(shade(t, -0.35), 0.5), Math.max(0.5, m * 0.006));
    circle(ctx, 0, 0, m * 0.48, null, shade(t, -0.45), Math.max(1, m * 0.015));
    circle(ctx, 0, 0, m * 0.04, '#d4a72c');
  },

  // ----- Furniture -----
  table(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.45, 0.8);
    planks(g, -w * 0.48, -h * 0.45, w * 0.96, h * 0.9, '#7a4f2a', 3, true);
    rect(ctx, -w * 0.48, -h * 0.45, w * 0.96, h * 0.9, null, '#4a2f17', Math.max(1, m * 0.06));
  },
  table_long(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.49, h * 0.45, 0.8);
    planks(g, -w * 0.49, -h * 0.45, w * 0.98, h * 0.9, '#7a4f2a', 3, true);
    rect(ctx, -w * 0.49, -h * 0.45, w * 0.98, h * 0.9, null, '#4a2f17', Math.max(1, m * 0.06));
    rect(ctx, -w * 0.42, -h * 0.14, w * 0.84, h * 0.28, '#7b2f34');
    line(ctx, -w * 0.42, -h * 0.11, w * 0.42, -h * 0.11, '#d4a72c', Math.max(0.5, m * 0.02), 'butt');
    line(ctx, -w * 0.42, h * 0.11, w * 0.42, h * 0.11, '#d4a72c', Math.max(0.5, m * 0.02), 'butt');
  },
  round_table(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.46, m * 0.46, 0.8);
    circle(ctx, 0, 0, m * 0.47, '#5e3b1f');
    circle(ctx, 0, 0, m * 0.43, lit(ctx, 0, 0, m * 0.43, '#7a4f2a', 0.08));
    for (let r = 0.12; r < 0.42; r += 0.08) circle(ctx, 0, 0, m * r, null, rgba('#5e3b1f', 0.4), Math.max(0.5, m * 0.008));
  },
  side_table(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.42, h * 0.42, 0.8);
    planks(g, -w * 0.42, -h * 0.42, w * 0.84, h * 0.84, '#7a4f2a', 2, true);
    rect(ctx, -w * 0.42, -h * 0.42, w * 0.84, h * 0.84, null, '#4a2f17', Math.max(1, m * 0.06));
  },
  chair(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.45, h * 0.45, 0.6);
    rect(ctx, -w * 0.4, -h * 0.4, w * 0.8, h * 0.8, '#7a4f2a', '#4a2f17', Math.max(1, m * 0.08));
    rect(ctx, -w * 0.44, -h * 0.5, w * 0.88, h * 0.22, '#5e3b1f', '#3a2410', Math.max(0.5, m * 0.04));
  },
  stool(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.42, m * 0.42, 0.6);
    circle(ctx, 0, 0, m * 0.42, lit(ctx, 0, 0, m * 0.42, '#7a4f2a', 0.1), '#4a2f17', Math.max(0.8, m * 0.06));
  },
  armchair(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.46, h * 0.46, 0.8);
    rrect(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.92, m * 0.12, shade(t, -0.15), shade(t, -0.35), Math.max(0.5, m * 0.02));
    rrect(ctx, -w * 0.3, -h * 0.22, w * 0.6, h * 0.62, m * 0.08, lit(ctx, 0, h * 0.08, m * 0.4, t, 0.1));
    rrect(ctx, -w * 0.42, -h * 0.44, w * 0.84, h * 0.18, m * 0.06, shade(t, -0.05));
  },
  throne(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.46, h * 0.46, 1.2);
    rrect(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.92, m * 0.06, '#b8902f', '#6a5214', Math.max(0.8, m * 0.03));
    rrect(ctx, -w * 0.3, -h * 0.2, w * 0.6, h * 0.6, m * 0.06, lit(ctx, 0, h * 0.1, m * 0.4, t, 0.12));
    rrect(ctx, -w * 0.4, -h * 0.46, w * 0.8, h * 0.2, m * 0.04, '#d4a72c');
    circle(ctx, 0, -h * 0.36, m * 0.05, '#c0392b');
  },
  bed(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.48, h * 0.48, 0.8);
    rect(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#5e3b1f');
    rect(ctx, -w * 0.42, -h * 0.42, w * 0.84, h * 0.84, '#d9d1c3');
    rrect(ctx, -w * 0.32, -h * 0.4, w * 0.64, h * 0.17, m * 0.08, '#f2ede3', '#c9c1b3', Math.max(0.5, m * 0.02));
    rect(ctx, -w * 0.43, -h * 0.12, w * 0.86, h * 0.56, lit(ctx, 0, h * 0.1, m * 0.8, t, 0.08));
    rect(ctx, -w * 0.43, -h * 0.12, w * 0.86, h * 0.08, '#efe9de');
  },
  bed_double(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.48, h * 0.48, 0.8);
    rect(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#5e3b1f');
    rect(ctx, -w * 0.43, -h * 0.42, w * 0.86, h * 0.86, '#d9d1c3');
    for (const s of [-1, 1]) rrect(ctx, s * w * 0.21 - w * 0.17, -h * 0.4, w * 0.34, h * 0.16, m * 0.06, '#f2ede3', '#c9c1b3', Math.max(0.5, m * 0.01));
    rect(ctx, -w * 0.44, -h * 0.14, w * 0.88, h * 0.58, lit(ctx, 0, h * 0.1, m * 0.8, t, 0.08));
    rect(ctx, -w * 0.44, -h * 0.14, w * 0.88, h * 0.06, '#efe9de');
  },
  chest(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.47, h * 0.45, 0.8);
    rect(ctx, -w * 0.46, -h * 0.44, w * 0.92, h * 0.88, lit(ctx, 0, 0, m * 0.8, '#7a4a22', 0.08), '#3a240f', Math.max(1, m * 0.07));
    for (const x of [-w * 0.3, w * 0.3]) band(ctx, x - m * 0.04, -h * 0.44, m * 0.08, h * 0.88, '#5a5a5a');
    rect(ctx, -w * 0.46, -h * 0.05, w * 0.92, h * 0.08, '#b8902f');
    rect(ctx, -w * 0.07, -h * 0.13, w * 0.14, h * 0.24, '#d9b44a', '#8a6a14', Math.max(0.5, m * 0.02));
  },
  wardrobe(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.46, 1.4);
    rect(ctx, -w * 0.48, -h * 0.46, w * 0.96, h * 0.92, lit(ctx, 0, 0, w * 0.6, '#6a4424', 0.06), '#3a2410', Math.max(1, m * 0.06));
    line(ctx, 0, -h * 0.46, 0, h * 0.46, '#3a2410', Math.max(0.8, m * 0.03));
    for (const s of [-1, 1]) {
      rect(ctx, s * w * 0.24 - w * 0.18, -h * 0.3, w * 0.36, h * 0.6, null, rgba('#3a2410', 0.6), Math.max(0.5, m * 0.02));
      circle(ctx, s * w * 0.05, 0, m * 0.04, '#d4a72c');
    }
  },
  bookshelf(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.5, h * 0.5, 1.4);
    rect(ctx, -w * 0.5, -h * 0.5, w, h, '#4a2f17', '#2e1d0d', Math.max(0.5, m * 0.04));
    const colours = ['#7b2f34', '#2f4f7b', '#3d6b3a', '#8a6d2f', '#5a3a6b', '#6b3a2a', '#2a5a5a'];
    let x = -w * 0.46;
    while (x < w * 0.44) {
      const bw = w * (0.03 + rnd() * 0.035);
      rect(ctx, x, -h * 0.34, Math.min(bw, w * 0.46 - x), h * (0.55 + rnd() * 0.15), colours[Math.floor(rnd() * colours.length)]);
      x += bw + w * 0.004;
    }
  },
  shelves(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.5, h * 0.5, 1.2);
    rect(ctx, -w * 0.5, -h * 0.5, w, h, '#6a4a2a', '#3e2914', Math.max(0.5, m * 0.04));
    for (let i = 0; i < 9; i += 1) {
      const x = -w * 0.42 + (w * 0.84 * i) / 8;
      if (i % 3 === 0) rect(ctx, x - m * 0.1, -h * 0.28, m * 0.2, h * 0.56, '#9a7a4a', '#5a4428', Math.max(0.5, m * 0.01));
      else circle(ctx, x, (rnd() - 0.5) * h * 0.2, m * (0.07 + rnd() * 0.04), lit(ctx, x, 0, m * 0.1, ['#c8b89a', '#5a7a9a', '#8a5a3a', '#4a7a4a'][Math.floor(rnd() * 4)], 0.18), rgba('#000000', 0.3), Math.max(0.5, m * 0.008));
    }
  },
  desk(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.46, 0.8);
    planks(g, -w * 0.48, -h * 0.46, w * 0.96, h * 0.92, '#6a4424', 3, true);
    rect(ctx, -w * 0.48, -h * 0.46, w * 0.96, h * 0.92, null, '#3a2410', Math.max(1, m * 0.05));
    ctx.save();
    ctx.translate(-w * 0.12, h * 0.02);
    ctx.rotate(-0.15);
    rect(ctx, -m * 0.18, -m * 0.24, m * 0.36, m * 0.48, '#efe6cf');
    for (let i = 0; i < 5; i += 1) line(ctx, -m * 0.13, -m * 0.16 + i * m * 0.08, m * 0.13, -m * 0.16 + i * m * 0.08, rgba('#5a4a3a', 0.5), Math.max(0.5, m * 0.012));
    ctx.restore();
    circle(ctx, w * 0.28, -h * 0.18, m * 0.06, '#1a1a2a');
    line(ctx, w * 0.28, -h * 0.18, w * 0.38, -h * 0.34, '#e8e0d0', Math.max(0.5, m * 0.015));
    book(ctx, w * 0.3, h * 0.18, m * 0.22, m * 0.3, '#2f4f7b', 0.3);
  },
  rug(g) {
    const { ctx, w, h, m, t } = g;
    rect(ctx, -w / 2, -h / 2, w, h, shade(t, -0.2));
    rect(ctx, -w * 0.44, -h * 0.4, w * 0.88, h * 0.8, t);
    rect(ctx, -w * 0.38, -h * 0.32, w * 0.76, h * 0.64, null, '#d9b44a', Math.max(1, m * 0.03));
    poly(ctx, [[0, -h * 0.24], [w * 0.2, 0], [0, h * 0.24], [-w * 0.2, 0]], shade(t, -0.15), '#d9b44a', Math.max(1, m * 0.03));
    circle(ctx, 0, 0, m * 0.06, '#d9b44a');
    for (let i = 0; i <= 12; i += 1) {
      const x = -w / 2 + (w * i) / 12;
      line(ctx, x, -h / 2, x, -h / 2 - m * 0.05, rgba('#d8ccb0', 0.9), Math.max(0.5, m * 0.012));
      line(ctx, x, h / 2, x, h / 2 + m * 0.05, rgba('#d8ccb0', 0.9), Math.max(0.5, m * 0.012));
    }
  },
  rug_round(g) {
    const { ctx, m, t } = g;
    circle(ctx, 0, 0, m * 0.48, shade(t, -0.2));
    circle(ctx, 0, 0, m * 0.42, t);
    circle(ctx, 0, 0, m * 0.34, null, '#d9b44a', Math.max(1, m * 0.025));
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      oval(ctx, Math.cos(a) * m * 0.22, Math.sin(a) * m * 0.22, m * 0.07, m * 0.03, a, '#d9b44a');
    }
    circle(ctx, 0, 0, m * 0.1, shade(t, 0.15), '#d9b44a', Math.max(0.8, m * 0.02));
  },
  fireplace(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.5, h * 0.48, 1);
    rect(ctx, -w * 0.5, -h * 0.5, w, h * 0.5, '#5a554f');
    for (let i = 0; i < 10; i += 1) stone(g, -w * 0.45 + (w * 0.9 * i) / 9, -h * 0.35 + (rnd() - 0.5) * h * 0.1, m * 0.13, m * 0.1, '#7d776e', 6, 0.3);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i += 1) stone(g, s * w * 0.42, -h * 0.15 + i * h * 0.22, m * 0.12, m * 0.1, '#7d776e', 6, 0.3);
    rect(ctx, -w * 0.32, -h * 0.18, w * 0.64, h * 0.6, '#1e1814');
    line(ctx, -w * 0.18, h * 0.12, w * 0.18, h * 0.22, '#4e321b', m * 0.12);
    line(ctx, -w * 0.15, h * 0.24, w * 0.2, h * 0.08, '#4e321b', m * 0.12);
    fire(g, 0, h * 0.14, m * 0.24);
  },
  bathtub(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'round', w * 0.48, h * 0.48, 0.8);
    oval(ctx, 0, 0, w * 0.48, h * 0.48, 0, '#e9e4d8', '#9a948a', Math.max(0.8, m * 0.04));
    oval(ctx, 0, 0, w * 0.38, h * 0.4, 0, radial(ctx, 0, 0, h * 0.4, '#a8d0e0', '#78a8c0'));
    oval(ctx, -w * 0.08, -h * 0.15, w * 0.1, h * 0.05, 0.4, rgba('#ffffff', 0.5));
    circle(ctx, 0, -h * 0.42, m * 0.06, '#b8902f');
  },
  candle(g) {
    const { m } = g;
    candle(g, -m * 0.15, m * 0.08, m * 0.16);
    candle(g, m * 0.16, m * 0.1, m * 0.13);
    candle(g, 0, -m * 0.16, m * 0.14);
  },
  candelabra(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.3, m * 0.3, 1);
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU - Math.PI / 2;
      line(ctx, 0, 0, Math.cos(a) * m * 0.34, Math.sin(a) * m * 0.34, '#b8902f', Math.max(0.6, m * 0.04));
    }
    circle(ctx, 0, 0, m * 0.1, '#d4a72c', '#7a5a14', Math.max(0.5, m * 0.02));
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU - Math.PI / 2;
      candle(g, Math.cos(a) * m * 0.34, Math.sin(a) * m * 0.34, m * 0.08);
    }
  },
  chandelier(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.4, m * 0.4, 3);
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * TAU + Math.PI / 4;
      line(ctx, 0, 0, Math.cos(a) * m * 0.38, Math.sin(a) * m * 0.38, '#3a3a3a', Math.max(0.6, m * 0.012));
    }
    circle(ctx, 0, 0, m * 0.38, null, '#3a3a3a', Math.max(1, m * 0.035));
    circle(ctx, 0, 0, m * 0.38, null, '#6a6a6a', Math.max(0.5, m * 0.01));
    circle(ctx, 0, 0, m * 0.06, '#4a4a4a');
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      candle(g, Math.cos(a) * m * 0.38, Math.sin(a) * m * 0.38, m * 0.04);
    }
  },
  plant(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.4, m * 0.4, 0.8);
    circle(ctx, 0, 0, m * 0.3, '#a0522d', '#6a3518', Math.max(0.5, m * 0.04));
    circle(ctx, 0, 0, m * 0.24, '#4a3020');
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * TAU + rnd() * 0.3;
      oval(ctx, Math.cos(a) * m * 0.24, Math.sin(a) * m * 0.24, m * 0.2, m * 0.08, a, lit(ctx, Math.cos(a) * m * 0.24, Math.sin(a) * m * 0.24, m * 0.2, '#4f8a3a', 0.12), '#2f5a24', Math.max(0.5, m * 0.012));
    }
  },
  weapon_rack(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.5, h * 0.45, 1);
    rect(ctx, -w * 0.5, -h * 0.4, w, h * 0.8, '#5e3b1f', '#3a2410', Math.max(0.5, m * 0.04));
    for (let i = 0; i < 6; i += 1) {
      const x = -w * 0.4 + (w * 0.8 * i) / 5;
      if (i % 2) {
        line(ctx, x, -h * 0.55, x, h * 0.55, '#7a5a3a', Math.max(0.6, m * 0.04));
        poly(ctx, [[x - m * 0.06, -h * 0.55], [x, -h * 0.85], [x + m * 0.06, -h * 0.55]], '#a8acb2');
      } else {
        line(ctx, x, -h * 0.6, x, h * 0.35, '#c0c4ca', Math.max(0.8, m * 0.06));
        line(ctx, x - m * 0.1, h * 0.35, x + m * 0.1, h * 0.35, '#8a6a2a', Math.max(0.8, m * 0.04));
        line(ctx, x, h * 0.35, x, h * 0.55, '#5e3b1f', Math.max(0.8, m * 0.05));
      }
    }
  },
  armour_stand(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.4, m * 0.4, 1.4);
    line(ctx, -m * 0.4, 0, m * 0.4, 0, '#4a3018', m * 0.06);
    for (const s of [-1, 1]) oval(ctx, s * m * 0.24, 0, m * 0.16, m * 0.2, 0, lit(ctx, s * m * 0.24, 0, m * 0.2, '#9aa0a8', 0.15), '#4a4e54', Math.max(0.5, m * 0.02));
    oval(ctx, 0, m * 0.02, m * 0.2, m * 0.24, 0, lit(ctx, 0, 0, m * 0.25, '#8a9098', 0.12), '#4a4e54', Math.max(0.5, m * 0.02));
    circle(ctx, 0, -m * 0.04, m * 0.13, lit(ctx, 0, -m * 0.04, m * 0.13, '#b0b6be', 0.15), '#4a4e54', Math.max(0.5, m * 0.02));
    line(ctx, 0, -m * 0.17, 0, m * 0.09, rgba('#3a3e44', 0.7), Math.max(0.5, m * 0.02));
  },
  crate(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.47, h * 0.47, 0.9);
    planks(g, -w * 0.46, -h * 0.46, w * 0.92, h * 0.92, '#9a7244', 4, true, 0.2);
    rect(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.92, null, '#5b3f20', Math.max(1, m * 0.08));
    line(ctx, -w * 0.4, -h * 0.4, w * 0.4, h * 0.4, '#6b4c28', Math.max(1, m * 0.08), 'butt');
  },
  barrel(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.46, m * 0.46, 0.9);
    circle(ctx, 0, 0, m * 0.47, '#4a3019');
    circle(ctx, 0, 0, m * 0.41, lit(ctx, 0, 0, m * 0.41, '#8a5d33', 0.08));
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      line(ctx, Math.cos(a) * m * 0.08, Math.sin(a) * m * 0.08, Math.cos(a) * m * 0.41, Math.sin(a) * m * 0.41, rgba('#4a3019', 0.6), Math.max(0.5, m * 0.015));
    }
    circle(ctx, 0, 0, m * 0.32, null, '#3a3a3a', Math.max(1, m * 0.05));
    circle(ctx, 0, 0, m * 0.06, '#5a3a1a');
  },

  // ----- Kitchen and tavern -----
  bar(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.5, h * 0.46, 1);
    rect(ctx, -w * 0.5, -h * 0.46, w, h * 0.92, '#4a2f17');
    planks(g, -w * 0.48, -h * 0.4, w * 0.96, h * 0.62, '#7a4f2a', 2, true);
    rect(ctx, -w * 0.5, h * 0.22, w, h * 0.24, '#5e3b1f');
    for (let i = 0; i < 4; i += 1) {
      const x = -w * 0.38 + (w * 0.76 * i) / 3 + (rnd() - 0.5) * w * 0.05;
      if (i % 2) circle(ctx, x, -h * 0.1, m * 0.1, '#e8e0c8', '#8a7a5a', Math.max(0.5, m * 0.02));
      else circle(ctx, x, -h * 0.12, m * 0.07, '#3a6a4a', rgba('#000000', 0.4), Math.max(0.5, m * 0.01));
    }
  },
  keg(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.46, h * 0.4, 1);
    for (const x of [-w * 0.3, w * 0.3]) rect(ctx, x - m * 0.05, -h * 0.42, m * 0.1, h * 0.84, '#3e2914');
    rrect(ctx, -w * 0.44, -h * 0.32, w * 0.88, h * 0.64, h * 0.25, radial(ctx, 0, -h * 0.1, w * 0.6, '#9a6a3a', '#5e3b1f'), '#3a2410', Math.max(0.5, m * 0.03));
    for (const x of [-w * 0.3, -w * 0.12, w * 0.12, w * 0.3]) band(ctx, x - m * 0.02, -h * 0.32, m * 0.04, h * 0.64, '#3a3a3a');
    circle(ctx, w * 0.44, 0, m * 0.06, '#b8902f', '#6a5214', Math.max(0.5, m * 0.015));
  },
  stove(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.5, h * 0.48, 1);
    rect(ctx, -w * 0.5, -h * 0.48, w, h * 0.96, '#2b2b2e', '#111', Math.max(0.8, m * 0.03));
    for (const x of [-w * 0.25, w * 0.25]) {
      circle(ctx, x, -h * 0.08, m * 0.24, '#3a3a3e', '#151515', Math.max(0.5, m * 0.02));
      circle(ctx, x, -h * 0.08, m * 0.14, null, '#1a1a1a', Math.max(0.5, m * 0.02));
    }
    rect(ctx, -w * 0.18, h * 0.24, w * 0.36, h * 0.18, '#ff8a3c');
    glow(ctx, 0, h * 0.33, m * 0.3, '#ff8a3c', 0.5);
    circle(ctx, w * 0.25, -h * 0.08, m * 0.18, '#4a4a4a', '#1a1a1a', Math.max(0.5, m * 0.02));
    circle(ctx, w * 0.25, -h * 0.08, m * 0.13, '#8a5a3a');
  },
  cauldron(g) {
    const { ctx, m, t, rnd } = g;
    shadow(g, 'round', m * 0.46, m * 0.46, 1);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TAU + 0.5;
      circle(ctx, Math.cos(a) * m * 0.42, Math.sin(a) * m * 0.42, m * 0.06, '#1a1a1a');
    }
    circle(ctx, 0, 0, m * 0.44, radial(ctx, 0, 0, m * 0.44, '#3a3a3a', '#141414', -m * 0.15, -m * 0.15), '#0a0a0a', Math.max(0.5, m * 0.02));
    circle(ctx, 0, 0, m * 0.36, radial(ctx, 0, 0, m * 0.36, shade(t, 0.15), shade(t, -0.2)));
    glow(ctx, 0, 0, m * 0.36, t, 0.3);
    for (let i = 0; i < 7; i += 1) circle(ctx, (rnd() - 0.5) * m * 0.5, (rnd() - 0.5) * m * 0.5, m * (0.02 + rnd() * 0.04), null, rgba(shade(t, 0.35), 0.8), Math.max(0.5, m * 0.012));
  },
  meal(g) {
    const { ctx, w, h, m, rnd } = g;
    for (const [x, y] of [[-w * 0.25, 0], [w * 0.22, -h * 0.1]]) {
      circle(ctx, x, y, m * 0.3, '#ece6da', '#a8a090', Math.max(0.5, m * 0.02));
      oval(ctx, x - m * 0.05, y, m * 0.15, m * 0.1, rnd(), '#8a4a22');
      for (let i = 0; i < 4; i += 1) circle(ctx, x + m * 0.1 + (rnd() - 0.5) * m * 0.1, y + (rnd() - 0.5) * m * 0.2, m * 0.035, '#4f8a3a');
    }
    circle(ctx, w * 0.32, h * 0.3, m * 0.12, '#8a6a4a', '#4a3a2a', Math.max(0.5, m * 0.02));
    circle(ctx, w * 0.32, h * 0.3, m * 0.08, '#f0e0b0');
    line(ctx, -w * 0.05, h * 0.25, w * 0.08, h * 0.38, '#b8bcc2', Math.max(0.5, m * 0.025));
  },
  tankards(g) {
    const { ctx, m } = g;
    for (const [x, y] of [[-0.18, -0.1], [0.16, -0.14], [0, 0.18]]) {
      circle(ctx, x * m + m * 0.03, y * m + m * 0.04, m * 0.17, 'rgba(0,0,0,0.25)');
      rect(ctx, x * m + m * 0.12, y * m - m * 0.04, m * 0.1, m * 0.08, '#6a4a2a');
      circle(ctx, x * m, y * m, m * 0.16, '#7a5a3a', '#3a2a1a', Math.max(0.5, m * 0.025));
      circle(ctx, x * m, y * m, m * 0.12, '#f4ecd8');
    }
  },
  bottles(g) {
    const { ctx, m, rnd } = g;
    for (const [x, y] of [[-0.2, -0.1], [0.12, -0.2], [0.18, 0.12], [-0.08, 0.2]]) {
      const c = ['#2f5a3a', '#5a2a3a', '#6a5a2a', '#2a3a5a'][Math.floor(rnd() * 4)];
      circle(ctx, x * m + m * 0.03, y * m + m * 0.04, m * 0.12, 'rgba(0,0,0,0.3)');
      circle(ctx, x * m, y * m, m * 0.12, lit(ctx, x * m, y * m, m * 0.12, c, 0.2), shade(c, -0.3), Math.max(0.5, m * 0.015));
      circle(ctx, x * m, y * m, m * 0.045, '#7a5a3a');
    }
  },
  spit(g) {
    const { ctx, w, h, m } = g;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      stone(g, Math.cos(a) * w * 0.22, Math.sin(a) * h * 0.36, m * 0.12, m * 0.1, '#77716a', 6, 0.3);
    }
    fire(g, 0, 0, m * 0.28);
    for (const s of [-1, 1]) circle(ctx, s * w * 0.42, 0, m * 0.08, '#3e2914');
    line(ctx, -w * 0.46, 0, w * 0.46, 0, '#5a5a5a', Math.max(0.8, m * 0.04));
    oval(ctx, 0, 0, w * 0.18, h * 0.24, 0, lit(ctx, 0, 0, w * 0.2, '#8a4a22', 0.15), '#5a2a10', Math.max(0.5, m * 0.02));
  },
  produce(g) {
    const { ctx, w, h, m, t, rnd } = g;
    shadow(g, 'rect', w * 0.47, h * 0.47, 0.8);
    rect(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.92, '#7a5532', '#4a3018', Math.max(1, m * 0.06));
    for (let i = 0; i < 16; i += 1) {
      const x = -w * 0.33 + (i % 4) * w * 0.22 + (rnd() - 0.5) * m * 0.04;
      const y = -h * 0.33 + Math.floor(i / 4) * h * 0.22 + (rnd() - 0.5) * m * 0.04;
      circle(ctx, x, y, m * 0.11, lit(ctx, x, y, m * 0.11, shade(t, (rnd() - 0.5) * 0.1), 0.2));
    }
  },

  // ----- Dungeon -----
  pillar(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.46, m * 0.46, 2);
    circle(ctx, 0, 0, m * 0.48, '#5d5953');
    circle(ctx, 0, 0, m * 0.42, '#77726b');
    circle(ctx, 0, 0, m * 0.36, lit(ctx, 0, 0, m * 0.36, '#9a958d', 0.12), '#5d5953', Math.max(0.5, m * 0.02));
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      line(ctx, Math.cos(a) * m * 0.2, Math.sin(a) * m * 0.2, Math.cos(a) * m * 0.36, Math.sin(a) * m * 0.36, rgba('#5d5953', 0.4), Math.max(0.5, m * 0.012));
    }
  },
  pillar_square(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.47, h * 0.47, 2);
    rect(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#5d5953');
    rect(ctx, -w * 0.38, -h * 0.38, w * 0.76, h * 0.76, lit(ctx, 0, 0, m * 0.5, '#9a958d', 0.1), '#5d5953', Math.max(0.5, m * 0.02));
    poly(ctx, [[-w * 0.48, -h * 0.48], [w * 0.48, -h * 0.48], [w * 0.38, -h * 0.38], [-w * 0.38, -h * 0.38]], '#88837b');
    poly(ctx, [[-w * 0.48, -h * 0.48], [-w * 0.38, -h * 0.38], [-w * 0.38, h * 0.38], [-w * 0.48, h * 0.48]], '#7d786f');
  },
  pillar_broken(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.46, h * 0.38, 0.8);
    const grad = ctx.createLinearGradient(0, -h * 0.38, 0, h * 0.38);
    grad.addColorStop(0, '#a39e95');
    grad.addColorStop(0.5, '#8d8880');
    grad.addColorStop(1, '#5d5953');
    const pts = [[-w * 0.46, -h * 0.38], [w * 0.3, -h * 0.38]];
    for (let i = 0; i < 6; i += 1) pts.push([w * (0.3 + rnd() * 0.12), -h * 0.38 + (h * 0.76 * (i + 1)) / 7]);
    pts.push([w * 0.3, h * 0.38], [-w * 0.46, h * 0.38]);
    poly(ctx, pts, grad, '#4f4b45', Math.max(0.5, m * 0.03));
    for (let i = 1; i < 4; i += 1) line(ctx, -w * 0.46 + (w * 0.76 * i) / 4, -h * 0.38, -w * 0.46 + (w * 0.76 * i) / 4, h * 0.38, rgba('#4f4b45', 0.4), Math.max(0.5, m * 0.015));
    for (let i = 0; i < 5; i += 1) stone(g, w * (0.42 + rnd() * 0.06), (rnd() - 0.5) * h * 0.8, m * 0.07, m * 0.06, '#8d8880', 6, 0.4);
  },
  altar(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.45, 1);
    rect(ctx, -w * 0.48, -h * 0.45, w * 0.96, h * 0.9, lit(ctx, 0, 0, w * 0.6, '#8d8880', 0.08), '#5d5953', Math.max(1, m * 0.06));
    rect(ctx, -w * 0.3, -h * 0.45, w * 0.6, h * 0.9, '#6d2a2a');
    line(ctx, -w * 0.3, -h * 0.45, -w * 0.3, h * 0.45, '#d4a72c', Math.max(0.5, m * 0.025), 'butt');
    line(ctx, w * 0.3, -h * 0.45, w * 0.3, h * 0.45, '#d4a72c', Math.max(0.5, m * 0.025), 'butt');
    candle(g, -w * 0.39, 0, m * 0.08);
    candle(g, w * 0.39, 0, m * 0.08);
    circle(ctx, 0, 0, m * 0.1, '#d4a72c', '#7a5a14', Math.max(0.5, m * 0.02));
  },
  stairs(g) {
    const { ctx, w, h, m } = g;
    const steps = 7;
    for (let i = 0; i < steps; i += 1) {
      rect(ctx, -w * 0.42, -h / 2 + (h * i) / steps, w * 0.84, h / steps, shade('#8d8880', 0.1 - i * 0.035), '#4f4b45', Math.max(0.5, m * 0.015));
      line(ctx, -w * 0.42, -h / 2 + (h * i) / steps + m * 0.02, w * 0.42, -h / 2 + (h * i) / steps + m * 0.02, rgba('#ffffff', 0.15), Math.max(0.5, m * 0.01), 'butt');
    }
    for (const s of [-1, 1]) rect(ctx, s * w * 0.46 - w * 0.04, -h / 2, w * 0.08, h, '#5d5953', '#3f3b36', Math.max(0.5, m * 0.01));
    poly(ctx, [[0, -h * 0.36], [w * 0.08, -h * 0.26], [-w * 0.08, -h * 0.26]], rgba('#ffffff', 0.45));
  },
  stairs_down(g) {
    const { ctx, w, h, m } = g;
    const steps = 7;
    for (let i = 0; i < steps; i += 1) rect(ctx, -w * 0.42, -h / 2 + (h * i) / steps, w * 0.84, h / steps, shade('#7d7870', -i * 0.06), '#2f2c28', Math.max(0.5, m * 0.015));
    rect(ctx, -w * 0.42, h * 0.2, w * 0.84, h * 0.3, rgba('#000000', 0.35));
    for (const s of [-1, 1]) rect(ctx, s * w * 0.46 - w * 0.04, -h / 2, w * 0.08, h, '#4f4b45', '#2f2c28', Math.max(0.5, m * 0.01));
    poly(ctx, [[0, h * 0.36], [w * 0.08, h * 0.26], [-w * 0.08, h * 0.26]], rgba('#ffffff', 0.4));
  },
  stairs_spiral(g) {
    const { ctx, m } = g;
    const n = 12;
    circle(ctx, 0, 0, m * 0.48, '#3f3b36');
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * TAU;
      const a1 = ((i + 1) / n) * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, m * 0.46, a0, a1);
      ctx.arc(0, 0, m * 0.1, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = shade('#9a958d', -i * 0.04);
      ctx.fill();
      ctx.strokeStyle = '#3f3b36';
      ctx.lineWidth = Math.max(0.5, m * 0.012);
      ctx.stroke();
    }
    circle(ctx, 0, 0, m * 0.1, lit(ctx, 0, 0, m * 0.1, '#8d8880', 0.15), '#3f3b36', Math.max(0.5, m * 0.015));
  },
  ladder(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.4, h * 0.48, 0.3);
    for (let i = 0; i < 7; i += 1) line(ctx, -w * 0.36, -h * 0.44 + (h * 0.88 * i) / 6, w * 0.36, -h * 0.44 + (h * 0.88 * i) / 6, '#8a6a42', Math.max(0.8, m * 0.08), 'butt');
    for (const s of [-1, 1]) line(ctx, s * w * 0.36, -h * 0.48, s * w * 0.36, h * 0.48, '#5b3d22', Math.max(1, m * 0.14), 'butt');
  },
  trapdoor(g) {
    const { ctx, w, h, m } = g;
    rect(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#2a2018');
    planks(g, -w * 0.42, -h * 0.42, w * 0.84, h * 0.84, '#7a5532', 4, false, 0.25);
    for (const y of [-h * 0.26, h * 0.26]) band(ctx, -w * 0.42, y - m * 0.04, w * 0.84, m * 0.08, '#3a3a3a');
    circle(ctx, w * 0.2, 0, m * 0.08, null, '#5a5a5a', Math.max(0.8, m * 0.03));
  },
  pit(g) {
    const { ctx, w, h, m, rnd } = g;
    rect(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#3a342d');
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 0.5);
    grad.addColorStop(0, '#050403');
    grad.addColorStop(0.7, '#1a1612');
    grad.addColorStop(1, '#3a342d');
    rect(ctx, -w * 0.42, -h * 0.42, w * 0.84, h * 0.84, grad);
    for (let i = 0; i < 16; i += 1) {
      const side = i % 4;
      const k = rnd() - 0.5;
      const x = side < 2 ? k * w * 0.9 : (side === 2 ? -1 : 1) * w * 0.45;
      const y = side >= 2 ? k * h * 0.9 : (side === 0 ? -1 : 1) * h * 0.45;
      stone(g, x, y, m * 0.06, m * 0.05, '#7a7268', 6, 0.4);
    }
  },
  spike_pit(g) {
    const { ctx, w, h, m, rnd } = g;
    ART.pit(g);
    for (let i = 0; i < 18; i += 1) {
      const x = (rnd() - 0.5) * w * 0.66;
      const y = (rnd() - 0.5) * h * 0.66;
      circle(ctx, x, y, m * 0.035, '#9a9a9a', '#3a3a3a', Math.max(0.5, m * 0.008));
      circle(ctx, x - m * 0.01, y - m * 0.01, m * 0.012, '#e0e0e0');
    }
  },
  grate(g) {
    const { ctx, w, h, m } = g;
    rect(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.92, '#0a0a0a', '#3a3a3a', Math.max(1, m * 0.06));
    for (let i = 1; i < 6; i += 1) {
      line(ctx, -w * 0.46 + (w * 0.92 * i) / 6, -h * 0.46, -w * 0.46 + (w * 0.92 * i) / 6, h * 0.46, '#4a4a4e', Math.max(0.8, m * 0.05), 'butt');
      line(ctx, -w * 0.46, -h * 0.46 + (h * 0.92 * i) / 6, w * 0.46, -h * 0.46 + (h * 0.92 * i) / 6, '#3e3e42', Math.max(0.8, m * 0.035), 'butt');
    }
  },
  brazier(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.42, m * 0.42, 1.2);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TAU - Math.PI / 2;
      line(ctx, 0, 0, Math.cos(a) * m * 0.48, Math.sin(a) * m * 0.48, '#2b2b2b', m * 0.06);
    }
    circle(ctx, 0, 0, m * 0.4, '#2b2b2b');
    circle(ctx, 0, 0, m * 0.34, '#474240');
    circle(ctx, 0, 0, m * 0.3, '#2a1a10');
    fire(g, 0, 0, m * 0.24);
  },
  torch(g) {
    const { ctx, m } = g;
    rect(ctx, -m * 0.12, -m * 0.5, m * 0.24, m * 0.3, '#3a3a3a');
    circle(ctx, 0, 0, m * 0.26, '#3a2a1a');
    fire(g, 0, 0, m * 0.24);
  },
  coffin(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.46, h * 0.48, 0.8);
    const pts = [[-w * 0.28, -h * 0.48], [w * 0.28, -h * 0.48], [w * 0.46, -h * 0.22], [w * 0.3, h * 0.48], [-w * 0.3, h * 0.48], [-w * 0.46, -h * 0.22]];
    poly(ctx, pts, lit(ctx, 0, -h * 0.1, h * 0.6, '#5e3b1f', 0.08), '#2e1d0d', Math.max(1, m * 0.05));
    poly(ctx, pts.map(([x, y]) => [x * 0.82, y * 0.88]), null, rgba('#2e1d0d', 0.6), Math.max(0.5, m * 0.02));
    line(ctx, 0, -h * 0.3, 0, h * 0.1, '#b8902f', Math.max(0.8, m * 0.05));
    line(ctx, -w * 0.15, -h * 0.17, w * 0.15, -h * 0.17, '#b8902f', Math.max(0.8, m * 0.05));
  },
  sarcophagus(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.48, 1);
    rect(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#77726b', '#4f4b45', Math.max(1, m * 0.04));
    rect(ctx, -w * 0.4, -h * 0.42, w * 0.8, h * 0.84, lit(ctx, 0, 0, h * 0.5, '#9a958d', 0.08), '#5d5953', Math.max(0.5, m * 0.02));
    circle(ctx, 0, -h * 0.28, m * 0.13, lit(ctx, 0, -h * 0.28, m * 0.13, '#aaa59b', 0.12), '#6d685f', Math.max(0.5, m * 0.015));
    poly(ctx, [[-w * 0.22, -h * 0.16], [w * 0.22, -h * 0.16], [w * 0.14, h * 0.36], [-w * 0.14, h * 0.36]], lit(ctx, 0, 0, h * 0.4, '#a39e95', 0.1), '#6d685f', Math.max(0.5, m * 0.015));
    line(ctx, 0, -h * 0.12, 0, h * 0.28, '#7d786f', Math.max(0.8, m * 0.03));
  },
  tombstone(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.42, h * 0.5, 1.4);
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, h * 0.3);
    ctx.lineTo(-w * 0.4, -h * 0.05);
    ctx.quadraticCurveTo(-w * 0.4, -h * 0.4, 0, -h * 0.4);
    ctx.quadraticCurveTo(w * 0.4, -h * 0.4, w * 0.4, -h * 0.05);
    ctx.lineTo(w * 0.4, h * 0.3);
    ctx.closePath();
    ctx.fillStyle = lit(ctx, 0, 0, w * 0.5, '#8d8880', 0.1);
    ctx.fill();
    ctx.strokeStyle = '#4f4b45';
    ctx.lineWidth = Math.max(0.8, m * 0.08);
    ctx.stroke();
    line(ctx, -w * 0.2, h * 0.05, w * 0.2, h * 0.05, rgba('#4f4b45', 0.6), Math.max(0.5, m * 0.06));
  },
  grave(g) {
    const { ctx, w, h, m, rnd } = g;
    smoothShape(ctx, blobPoints(0, h * 0.06, w * 0.44, h * 0.42, 10, 0.1, rnd), lit(ctx, 0, 0, h * 0.5, '#6e5236', 0.1), '#3e2a18', Math.max(0.5, m * 0.03));
    for (let i = 0; i < 10; i += 1) circle(ctx, (rnd() - 0.5) * w * 0.6, (rnd() - 0.4) * h * 0.6, m * 0.02, '#4e3a26');
    ART.tombstone({ ...g, ctx, w: w * 0.9, h: h * 0.24, m: Math.min(w * 0.9, h * 0.24) });
  },
  chains(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.3, m * 0.3, 2);
    for (let c = 0; c < 3; c += 1) {
      const a = rnd() * TAU;
      for (let i = 0; i < 6; i += 1) {
        const d = m * (0.05 + i * 0.07);
        oval(ctx, Math.cos(a) * d, Math.sin(a) * d, m * 0.045, m * 0.025, a + (i % 2 ? Math.PI / 2 : 0), null, '#5a5e64', Math.max(0.8, m * 0.022));
      }
    }
    circle(ctx, 0, 0, m * 0.07, null, '#3a3e44', Math.max(1, m * 0.035));
  },
  shackles(g) {
    const { ctx, m } = g;
    circle(ctx, 0, -m * 0.3, m * 0.07, null, '#4a4e54', Math.max(0.8, m * 0.035));
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 6; i += 1) pts.push([s * m * 0.05 * i, -m * 0.24 + i * m * 0.06]);
      for (const [x, y] of pts) oval(ctx, x, y, m * 0.03, m * 0.02, 0.8 * s, null, '#5a5e64', Math.max(0.6, m * 0.015));
      circle(ctx, s * m * 0.32, m * 0.16, m * 0.09, null, '#5a5e64', Math.max(1, m * 0.04));
    }
  },
  cage(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.48, 1.2);
    rect(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, rgba('#000000', 0.25));
    for (let i = 0; i <= 8; i += 1) {
      line(ctx, -w * 0.48 + (w * 0.96 * i) / 8, -h * 0.48, -w * 0.48 + (w * 0.96 * i) / 8, h * 0.48, '#3a3e44', Math.max(0.8, m * 0.025), 'butt');
    }
    for (const y of [-h * 0.48, 0, h * 0.48]) line(ctx, -w * 0.48, y, w * 0.48, y, '#4a4e54', Math.max(1, m * 0.035), 'butt');
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rect(ctx, x * w * 0.48 - m * 0.04, y * h * 0.48 - m * 0.04, m * 0.08, m * 0.08, '#2a2e34');
  },
  lever(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.36, h * 0.36, 0.8);
    rect(ctx, -w * 0.3, -h * 0.3, w * 0.6, h * 0.6, '#4a4e54', '#2a2e34', Math.max(0.5, m * 0.05));
    line(ctx, 0, 0, w * 0.32, -h * 0.4, '#6a5a4a', Math.max(0.8, m * 0.1));
    circle(ctx, w * 0.32, -h * 0.4, m * 0.1, '#c0392b', '#6a1a12', Math.max(0.5, m * 0.02));
  },
  pressure_plate(g) {
    const { ctx, w, h, m } = g;
    rect(ctx, -w * 0.4, -h * 0.4, w * 0.8, h * 0.8, rgba('#8d8880', 0.4), rgba('#2a2620', 0.6), Math.max(0.8, m * 0.03));
    line(ctx, -w * 0.38, -h * 0.38, w * 0.38, -h * 0.38, rgba('#ffffff', 0.2), Math.max(0.5, m * 0.02), 'butt');
  },
  treasure(g) {
    const { ctx, m, rnd } = g;
    smoothShape(ctx, blobPoints(0, 0, m * 0.46, m * 0.4, 10, 0.25, rnd), lit(ctx, 0, 0, m * 0.46, '#c49a2a', 0.15));
    for (let i = 0; i < 45; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.4;
      coin(g, Math.cos(a) * d, Math.sin(a) * d * 0.9, m * 0.045);
    }
    for (const c of ['#c0392b', '#2e86de', '#27ae60', '#8e44ad']) {
      const x = (rnd() - 0.5) * m * 0.5;
      const y = (rnd() - 0.5) * m * 0.4;
      poly(ctx, [[x, y - m * 0.05], [x + m * 0.045, y], [x, y + m * 0.05], [x - m * 0.045, y]], lit(ctx, x, y, m * 0.05, c, 0.25), shade(c, -0.35), Math.max(0.5, m * 0.008));
    }
    circle(ctx, m * 0.12, -m * 0.1, m * 0.09, '#d4a72c', '#7a5a14', Math.max(0.5, m * 0.015));
    circle(ctx, m * 0.12, -m * 0.1, m * 0.055, '#6a1a22');
  },
  coins(g) {
    const { m, rnd } = g;
    for (let i = 0; i < 7; i += 1) coin(g, (rnd() - 0.5) * m * 0.6, (rnd() - 0.5) * m * 0.6, m * 0.09);
  },
  mine_cart(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.46, h * 0.46, 1);
    for (const y of [-h * 0.3, h * 0.3]) for (const s of [-1, 1]) wheel(ctx, s * w * 0.46, y, w * 0.1, h * 0.18);
    rect(ctx, -w * 0.42, -h * 0.44, w * 0.84, h * 0.88, '#4a4e54', '#2a2e34', Math.max(1, m * 0.06));
    rect(ctx, -w * 0.32, -h * 0.36, w * 0.64, h * 0.72, '#2a2622');
    for (let i = 0; i < 14; i += 1) stone(g, (rnd() - 0.5) * w * 0.5, (rnd() - 0.5) * h * 0.6, m * 0.08, m * 0.07, ['#6a6e7a', '#5a5450', '#8a7a5a'][Math.floor(rnd() * 3)], 6, 0.4);
  },
  rails(g) {
    const { ctx, w, h, m, rnd } = g;
    const n = Math.round(h / (m * 0.4));
    for (let i = 0; i < n; i += 1) rect(ctx, -w * 0.46, -h / 2 + (h * (i + 0.2)) / n, w * 0.92, (h * 0.5) / n, shade('#5e3b1f', (rnd() - 0.5) * 0.12), '#3a2410', Math.max(0.5, m * 0.012));
    for (const s of [-1, 1]) {
      line(ctx, s * w * 0.3, -h / 2, s * w * 0.3, h / 2, '#4a4e54', Math.max(1, m * 0.08), 'butt');
      line(ctx, s * w * 0.3 - m * 0.015, -h / 2, s * w * 0.3 - m * 0.015, h / 2, '#9aa0a8', Math.max(0.5, m * 0.025), 'butt');
    }
  },

  // ----- Magic -----
  magic_circle(g) {
    const { ctx, m, t, rnd } = g;
    glow(ctx, 0, 0, m * 0.5, t, 0.25);
    const ring = (r, wd) => {
      circle(ctx, 0, 0, r, null, rgba(t, 0.35), wd * 3);
      circle(ctx, 0, 0, r, null, shade(t, 0.15), wd);
    };
    ring(m * 0.46, Math.max(0.8, m * 0.01));
    ring(m * 0.4, Math.max(0.8, m * 0.008));
    ring(m * 0.22, Math.max(0.8, m * 0.008));
    const star = [];
    for (let i = 0; i < 5; i += 1) star.push([Math.cos(-Math.PI / 2 + (i * 2 * TAU) / 5) * m * 0.4, Math.sin(-Math.PI / 2 + (i * 2 * TAU) / 5) * m * 0.4]);
    poly(ctx, star, null, rgba(t, 0.35), Math.max(1, m * 0.025));
    poly(ctx, star, null, shade(t, 0.2), Math.max(0.6, m * 0.008));
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * TAU;
      const x = Math.cos(a) * m * 0.43;
      const y = Math.sin(a) * m * 0.43;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 2);
      const k = m * 0.018;
      polyline(ctx, [[-k, k], [0, -k], [k, k], ...(rnd() < 0.5 ? [[-k * 0.6, 0]] : [])], shade(t, 0.25), Math.max(0.5, m * 0.006));
      ctx.restore();
    }
  },
  rune_stone(g) {
    const { ctx, m, t, rnd } = g;
    shadow(g, 'round', m * 0.42, m * 0.4, 1.2);
    stone(g, 0, 0, m * 0.42, m * 0.38, '#6e6a64', 9, 0.25);
    for (let i = 0; i < 4; i += 1) {
      const x = (rnd() - 0.5) * m * 0.4;
      const y = (rnd() - 0.5) * m * 0.36;
      glow(ctx, x, y, m * 0.1, t, 0.4);
      polyline(ctx, [[x - m * 0.04, y + m * 0.05], [x, y - m * 0.05], [x + m * 0.04, y + m * 0.05], [x - m * 0.03, y]], shade(t, 0.3), Math.max(0.6, m * 0.02));
    }
  },
  crystal(g) {
    const { ctx, m, t } = g;
    shadow(g, 'round', m * 0.36, m * 0.36, 1);
    glow(ctx, 0, 0, m * 0.6, t, 0.35);
    crystals(g, 5, m * 0.42, m * 0.16, t);
    circle(ctx, 0, 0, m * 0.06, shade(t, 0.4));
  },
  crystal_big(g) {
    const { ctx, m, t } = g;
    shadow(g, 'round', m * 0.42, m * 0.42, 1.6);
    glow(ctx, 0, 0, m * 0.7, t, 0.4);
    crystals(g, 9, m * 0.46, m * 0.13, t);
    crystals(g, 4, m * 0.24, m * 0.1, shade(t, 0.12));
  },
  portal(g) {
    const { ctx, m, t, rnd } = g;
    glow(ctx, 0, 0, m * 0.62, t, 0.45);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      stone(g, Math.cos(a) * m * 0.44, Math.sin(a) * m * 0.44, m * 0.07, m * 0.06, '#5d5953', 6, 0.3);
    }
    circle(ctx, 0, 0, m * 0.38, radial(ctx, 0, 0, m * 0.38, '#0d0620', shade(t, -0.1)));
    for (let s = 0; s < 3; s += 1) {
      const pts = [];
      for (let i = 0; i < 40; i += 1) {
        const a = s * (TAU / 3) + i * 0.16;
        const r = m * 0.36 * (1 - i / 44);
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      polyline(ctx, pts, rgba(shade(t, 0.3), 0.8), Math.max(0.8, m * 0.02));
    }
    for (let i = 0; i < 10; i += 1) circle(ctx, (rnd() - 0.5) * m * 0.5, (rnd() - 0.5) * m * 0.5, m * 0.012, '#ffffff');
  },
  orb(g) {
    const { ctx, m, t } = g;
    shadow(g, 'round', m * 0.4, m * 0.4, 1.4);
    rect(ctx, -m * 0.36, -m * 0.36, m * 0.72, m * 0.72, '#5d5953', '#3f3b36', Math.max(0.5, m * 0.03));
    glow(ctx, 0, 0, m * 0.5, t, 0.45);
    circle(ctx, 0, 0, m * 0.26, radial(ctx, 0, 0, m * 0.26, shade(t, 0.35), shade(t, -0.25), -m * 0.08, -m * 0.08), shade(t, -0.4), Math.max(0.5, m * 0.015));
    circle(ctx, -m * 0.08, -m * 0.09, m * 0.06, rgba('#ffffff', 0.7));
  },
  obelisk(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.4, h * 0.4, 2.6);
    const s = Math.min(w, h) * 0.4;
    poly(ctx, [[-s, -s], [s, -s], [0, 0]], '#7a766f');
    poly(ctx, [[s, -s], [s, s], [0, 0]], '#45423d');
    poly(ctx, [[s, s], [-s, s], [0, 0]], '#55524c');
    poly(ctx, [[-s, s], [-s, -s], [0, 0]], '#6a665f');
    rect(ctx, -s, -s, s * 2, s * 2, null, '#2f2c28', Math.max(0.5, m * 0.02));
    line(ctx, -s * 0.5, -s * 0.2, -s * 0.2, -s * 0.5, rgba('#d4c28a', 0.5), Math.max(0.5, m * 0.015));
  },
  standing_stone(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'round', w * 0.46, h * 0.44, 2.2);
    stone(g, 0, 0, w * 0.46, h * 0.42, '#77736b', 10, 0.18);
    for (let i = 0; i < 6; i += 1) circle(ctx, (rnd() - 0.5) * w * 0.6, (rnd() - 0.5) * h * 0.5, m * (0.03 + rnd() * 0.04), rgba(['#9aa86a', '#c8c078'][i % 2], 0.6));
  },
  lectern(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.44, h * 0.42, 1);
    rect(ctx, -w * 0.42, -h * 0.4, w * 0.84, h * 0.8, '#5e3b1f', '#3a2410', Math.max(0.5, m * 0.04));
    for (const s of [-1, 1]) {
      poly(ctx, [[0, -h * 0.32], [s * w * 0.38, -h * 0.28], [s * w * 0.38, h * 0.3], [0, h * 0.32]], '#efe6cf', '#a8987a', Math.max(0.5, m * 0.01));
      for (let i = 0; i < 6; i += 1) line(ctx, s * w * 0.06, -h * 0.2 + i * h * 0.08, s * w * 0.32, -h * 0.2 + i * h * 0.08, rgba('#5a4a3a', 0.5), Math.max(0.5, m * 0.01));
    }
    line(ctx, 0, -h * 0.32, 0, h * 0.32, '#8a7a5a', Math.max(0.5, m * 0.02));
    line(ctx, w * 0.1, h * 0.32, w * 0.12, h * 0.46, '#c0392b', Math.max(0.6, m * 0.03));
  },
  alchemy(g) {
    const { ctx, w, h, m, t, rnd } = g;
    shadow(g, 'rect', w * 0.48, h * 0.45, 0.8);
    planks(g, -w * 0.48, -h * 0.45, w * 0.96, h * 0.9, '#5e3b1f', 3, true);
    rect(ctx, -w * 0.48, -h * 0.45, w * 0.96, h * 0.9, null, '#3a2410', Math.max(1, m * 0.05));
    for (let i = 0; i < 6; i += 1) {
      const x = -w * 0.38 + (w * 0.76 * i) / 5;
      const y = (rnd() - 0.5) * h * 0.4;
      const c = i % 2 ? t : ['#d6336c', '#3a7ab8', '#f2c12e'][i % 3];
      circle(ctx, x, y, m * 0.1, rgba('#e8f0f0', 0.5), rgba('#9aa', 0.8), Math.max(0.5, m * 0.01));
      circle(ctx, x, y, m * 0.07, lit(ctx, x, y, m * 0.07, c, 0.2));
    }
    book(ctx, w * 0.3, h * 0.2, m * 0.24, m * 0.3, '#5a3a6b', -0.2);
    candle(g, -w * 0.38, h * 0.28, m * 0.05);
  },
  potion(g) {
    const { ctx, m, t } = g;
    shadow(g, 'round', m * 0.4, m * 0.4, 0.6);
    circle(ctx, 0, 0, m * 0.42, rgba('#e8f0f0', 0.5), rgba('#8a9a9a', 0.9), Math.max(0.5, m * 0.04));
    circle(ctx, 0, 0, m * 0.34, lit(ctx, 0, 0, m * 0.34, t, 0.22));
    circle(ctx, 0, 0, m * 0.14, '#9a7048', '#5a3a1a', Math.max(0.5, m * 0.03));
    circle(ctx, -m * 0.16, -m * 0.16, m * 0.06, rgba('#ffffff', 0.7));
  },
  scroll(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.46, h * 0.36, 0.3);
    rect(ctx, -w * 0.36, -h * 0.3, w * 0.72, h * 0.6, '#efe2bf', '#b8a070', Math.max(0.5, m * 0.02));
    for (const s of [-1, 1]) rrect(ctx, s * w * 0.4 - w * 0.07, -h * 0.36, w * 0.14, h * 0.72, w * 0.07, lit(ctx, s * w * 0.4, 0, h * 0.4, '#d8c898', 0.1), '#a8905a', Math.max(0.5, m * 0.015));
    for (let i = 0; i < 5; i += 1) line(ctx, -w * 0.26, -h * 0.18 + i * h * 0.09, w * 0.26, -h * 0.18 + i * h * 0.09, rgba('#5a4a3a', 0.55), Math.max(0.5, m * 0.015));
  },
  idol(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.4, m * 0.4, 1.4);
    circle(ctx, 0, 0, m * 0.44, '#5d5953', '#3f3b36', Math.max(0.5, m * 0.02));
    oval(ctx, 0, m * 0.08, m * 0.28, m * 0.22, 0, lit(ctx, 0, m * 0.08, m * 0.3, '#d4a72c', 0.2), '#7a5a14', Math.max(0.5, m * 0.02));
    circle(ctx, 0, -m * 0.1, m * 0.16, lit(ctx, 0, -m * 0.1, m * 0.16, '#e0b83a', 0.2), '#7a5a14', Math.max(0.5, m * 0.02));
    circle(ctx, -m * 0.05, -m * 0.12, m * 0.035, '#c0392b');
    circle(ctx, m * 0.05, -m * 0.12, m * 0.035, '#c0392b');
  },
  totem(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.36, m * 0.36, 2.4);
    for (const s of [-1, 1]) poly(ctx, [[s * m * 0.18, -m * 0.08], [s * m * 0.48, -m * 0.2], [s * m * 0.44, m * 0.06], [s * m * 0.18, m * 0.08]], '#a0522d', '#5a2a10', Math.max(0.5, m * 0.02));
    circle(ctx, 0, 0, m * 0.26, lit(ctx, 0, 0, m * 0.26, '#8a5a32', 0.12), '#4a2a10', Math.max(0.5, m * 0.03));
    circle(ctx, -m * 0.08, -m * 0.05, m * 0.05, '#f0e0c0');
    circle(ctx, m * 0.08, -m * 0.05, m * 0.05, '#f0e0c0');
    rect(ctx, -m * 0.1, m * 0.07, m * 0.2, m * 0.05, '#2a1a10');
  },
};

/**
 * Draw one built-in asset, `w` x `h` pixels, centred on (0, 0) (the caller
 * moves, turns and flips the context). `tint`: the DM's colour, if they
 * changed it; `sx`, `sy`: which way its shadow falls (already turned);
 * `shadows: false` leaves shadows out.
 */
export function drawBuiltIn(ctx, key, w, h, { seed = 1, tint = null, sx = null, sy = null, shadows = true } = {}) {
  const def = ASSETS[key];
  const draw = ART[key];
  const m = Math.min(w, h);
  if (!def || !draw) {
    rect(ctx, -w / 2, -h / 2, w, h, '#888');
    return;
  }
  const g = { ctx, w, h, m, rnd: seededArt(seed, key), t: tint ?? def.tint ?? '#888888', sx: sx ?? m * 0.05, sy: sy ?? m * 0.07, shadows };
  ctx.save();
  draw(g);
  ctx.restore();
}

/** Each placed asset draws a little differently (its id seeds it), but the same every time. */
function seededArt(seed, key) {
  let s = (Math.imul(seed | 0, 2654435761) ^ key.length * 40503) >>> 0;
  for (let i = 0; i < key.length; i += 1) s = Math.imul(s ^ key.charCodeAt(i), 16777619) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

