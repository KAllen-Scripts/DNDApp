/**
 * Built-in assets of the map creator: the temple and magic (map-design.js ASSETS), drawn
 * in code like the rest (map-art-assets.js, which merges these in).
 */
import { TAU, shade, mix, rgba, circle, oval, rect, rrect, poly, line, polyline, blobPoints, smoothShape, radial, glow } from './map-paint.js';
import { shadow, lit, stone, planks, candle, coin, book, crystals } from './map-art-pieces.js';

export const ART_TEMPLE = {
  // ----- Temple -----
  pew(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.48, h * 0.44, 0.9);
    const wood = '#7a4f2a';
    const dark = '#3a240f';
    const lw = Math.max(0.6, m * 0.035);
    // The seat, facing the top.
    planks(g, -w * 0.46, -h * 0.4, w * 0.92, h * 0.5, shade(wood, 0.05), 2, true, 0.2);
    rect(ctx, -w * 0.46, -h * 0.4, w * 0.92, h * 0.5, null, dark, lw);
    line(ctx, -w * 0.45, -h * 0.36, w * 0.45, -h * 0.36, rgba('#ffffff', 0.16), Math.max(0.5, m * 0.03), 'butt');
    // The backrest along the bottom: its top rail catches the light, its back slopes away in shade.
    rect(ctx, -w * 0.47, h * 0.08, w * 0.94, h * 0.37, shade(wood, -0.2), dark, lw);
    rect(ctx, -w * 0.47, h * 0.08, w * 0.94, h * 0.14, shade(wood, 0.1), dark, lw);
    line(ctx, -w * 0.46, h * 0.11, w * 0.46, h * 0.11, rgba('#ffffff', 0.2), Math.max(0.5, m * 0.02), 'butt');
    line(ctx, -w * 0.47, h * 0.07, w * 0.47, h * 0.07, rgba('#000000', 0.35), Math.max(0.5, m * 0.03), 'butt');
    // Carved bench ends with a round finial at the back.
    for (const s of [-1, 1]) {
      const x = s * (w * 0.47 - m * 0.08);
      rrect(ctx, x - m * 0.07, -h * 0.46, m * 0.14, h * 0.84, m * 0.05, shade(wood, -0.04), dark, lw);
      line(ctx, x - m * 0.02, -h * 0.4, x - m * 0.02, h * 0.2, rgba('#ffffff', 0.14), Math.max(0.5, m * 0.02));
      circle(ctx, x, h * 0.34, m * 0.12, lit(ctx, x, h * 0.34, m * 0.12, wood, 0.16), dark, lw);
      circle(ctx, x, h * 0.34, m * 0.05, null, rgba(dark, 0.8), Math.max(0.5, m * 0.02));
    }
    // A hymn book left on the seat.
    if (rnd() < 0.7) book(ctx, (rnd() - 0.5) * w * 0.6, -h * 0.15, m * 0.24, m * 0.3, ['#6b2a2a', '#2f3f5f', '#3d5a3a'][Math.floor(rnd() * 3)], (rnd() - 0.5) * 0.6);
  },
  font(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.45, m * 0.45, 1.1);
    const st = '#a39e95';
    const lw = Math.max(0.5, m * 0.012);
    const oct = (r) => Array.from({ length: 8 }, (_, i) => [Math.cos(((i + 0.5) / 8) * TAU) * r, Math.sin(((i + 0.5) / 8) * TAU) * r]);
    // A plinth, then the rim's eight bevelled faces, lit from the top left.
    poly(ctx, oct(m * 0.49), '#6d685f', '#45413b', lw);
    const o = oct(m * 0.46);
    const ins = oct(m * 0.4);
    for (let i = 0; i < 8; i += 1) {
      const j = (i + 1) % 8;
      const k = Math.cos(((i + 1) / 8) * TAU + Math.PI * 0.75);
      poly(ctx, [o[i], o[j], ins[j], ins[i]], shade(st, k * 0.13), shade(st, -0.32), lw);
    }
    poly(ctx, ins, st, shade(st, -0.25), lw);
    // A carved groove and rosettes round the rim.
    poly(ctx, oct(m * 0.36), null, rgba(shade(st, -0.3), 0.8), lw);
    for (const [x, y] of oct(m * 0.36)) circle(ctx, x, y, m * 0.022, shade(st, -0.22));
    // The bowl: the far side in shadow, the near side lit.
    circle(ctx, 0, 0, m * 0.31, radial(ctx, 0, 0, m * 0.31, shade(st, 0.06), shade(st, -0.28), m * 0.1, m * 0.1), shade(st, -0.35), lw);
    circle(ctx, m * 0.012, m * 0.012, m * 0.265, radial(ctx, 0, 0, m * 0.27, '#7ab4d2', '#2f6688', -m * 0.08, -m * 0.08));
    circle(ctx, 0, 0, m * 0.17, null, rgba('#ffffff', 0.18), lw);
    circle(ctx, 0, 0, m * 0.09, null, rgba('#ffffff', 0.12), lw);
    oval(ctx, -m * 0.1, -m * 0.12, m * 0.08, m * 0.035, -0.6, rgba('#ffffff', 0.45));
  },
  shrine(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.47, h * 0.45, 1);
    const st = '#8d8880';
    const edge = '#4f4b45';
    const lw = Math.max(0.6, m * 0.022);
    // The stone base.
    rect(ctx, -w * 0.48, -h * 0.45, w * 0.96, h * 0.9, '#6d685f', edge, lw);
    rect(ctx, -w * 0.44, -h * 0.41, w * 0.88, h * 0.82, lit(ctx, 0, 0, w * 0.6, st, 0.08));
    // A curved back wall (the niche) round the statue, its floor in shadow.
    const cy = -h * 0.04;
    ctx.beginPath();
    ctx.arc(0, cy, m * 0.29, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = rgba('#24201c', 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, cy, m * 0.4, Math.PI, TAU);
    ctx.lineTo(m * 0.29, cy);
    ctx.arc(0, cy, m * 0.29, TAU, Math.PI, true);
    ctx.closePath();
    ctx.fillStyle = lit(ctx, 0, cy - m * 0.25, m * 0.4, '#aaa59c', 0.12);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = lw;
    ctx.stroke();
    // The little gilded statue, with a halo.
    const gold = '#d0a032';
    oval(ctx, 0, cy - m * 0.01, m * 0.16, m * 0.12, 0, lit(ctx, 0, cy - m * 0.01, m * 0.16, gold, 0.2), '#6a4a10', lw);
    circle(ctx, 0, cy - m * 0.1, m * 0.13, null, rgba('#ffe08a', 0.9), Math.max(0.6, m * 0.025));
    circle(ctx, 0, cy - m * 0.1, m * 0.085, lit(ctx, 0, cy - m * 0.1, m * 0.085, shade(gold, 0.06), 0.22), '#6a4a10', lw);
    // Offerings in front: flowers and coins.
    const flower = (x, y, r, c) => {
      for (let k = 0; k < 5; k += 1) circle(ctx, x + Math.cos((k / 5) * TAU) * r, y + Math.sin((k / 5) * TAU) * r, r * 0.8, c);
      circle(ctx, x, y, r * 0.55, '#f2c12e');
    };
    oval(ctx, -w * 0.17, h * 0.27, m * 0.1, m * 0.05, 0.3, '#4f7a34');
    flower(-w * 0.19, h * 0.25, m * 0.04, '#e05a6a');
    flower(-w * 0.1, h * 0.31, m * 0.035, '#f4f0e0');
    flower(w * 0.15, h * 0.24, m * 0.035, '#e6a23a');
    coin(g, -w * 0.01, h * 0.29, m * 0.045);
    coin(g, w * 0.05, h * 0.33, m * 0.04);
    coin(g, w * 0.07 + rnd() * w * 0.02, h * 0.25, m * 0.04);
    // Candles at the front corners.
    candle(g, -w * 0.37, h * 0.26, m * 0.07);
    candle(g, w * 0.37, h * 0.26, m * 0.07);
    candle(g, w * 0.29, h * 0.33, m * 0.05);
  },
  prayer_mat(g) {
    const { ctx, w, h, m, t } = g;
    const gold = '#d9b44a';
    const lw = Math.max(0.6, m * 0.022);
    const x0 = -w * 0.44;
    const y0 = -h * 0.43;
    const rw = w * 0.88;
    const rh = h * 0.86;
    for (let i = 0; i <= 10; i += 1) {
      const x = x0 + (rw * i) / 10;
      line(ctx, x, y0, x, y0 - h * 0.05, rgba('#e6dcc0', 0.9), Math.max(0.5, m * 0.014));
      line(ctx, x, y0 + rh, x, y0 + rh + h * 0.05, rgba('#e6dcc0', 0.9), Math.max(0.5, m * 0.014));
    }
    rect(ctx, x0, y0, rw, rh, shade(t, -0.16), shade(t, -0.3), lw);
    const b = m * 0.09;
    // Little gold dots round the border.
    for (let i = 0; i < 7; i += 1) {
      circle(ctx, x0 + b / 2, y0 + b + ((rh - 2 * b) * (i + 0.5)) / 7, m * 0.016, gold);
      circle(ctx, x0 + rw - b / 2, y0 + b + ((rh - 2 * b) * (i + 0.5)) / 7, m * 0.016, gold);
    }
    rect(ctx, x0 + b, y0 + b, rw - 2 * b, rh - 2 * b, t, gold, lw);
    // The arch, pointing to the top.
    const ax = rw / 2 - b - m * 0.07;
    const top = y0 + b + m * 0.07;
    const bot = y0 + rh - b - m * 0.07;
    const spring = top + (bot - top) * 0.36;
    ctx.beginPath();
    ctx.moveTo(-ax, bot);
    ctx.lineTo(-ax, spring);
    ctx.quadraticCurveTo(-ax, top + (spring - top) * 0.25, 0, top);
    ctx.quadraticCurveTo(ax, top + (spring - top) * 0.25, ax, spring);
    ctx.lineTo(ax, bot);
    ctx.closePath();
    ctx.fillStyle = shade(t, -0.12);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = lw;
    ctx.stroke();
    // A hanging lamp in the arch, a medallion and a band at the foot.
    const ly = top + (bot - top) * 0.3;
    line(ctx, 0, top + m * 0.03, 0, ly - m * 0.05, gold, Math.max(0.5, m * 0.012));
    poly(ctx, [[0, ly - m * 0.06], [m * 0.05, ly], [0, ly + m * 0.06], [-m * 0.05, ly]], gold);
    const my = top + (bot - top) * 0.62;
    poly(ctx, [[0, my - m * 0.11], [m * 0.1, my], [0, my + m * 0.11], [-m * 0.1, my]], shade(t, 0.1), gold, lw);
    circle(ctx, 0, my, m * 0.03, gold);
    for (let i = 0; i < 5; i += 1) {
      const x = -ax + ((ax * 2) * (i + 0.5)) / 5;
      poly(ctx, [[x, bot - m * 0.09], [x + m * 0.04, bot - m * 0.045], [x, bot], [x - m * 0.04, bot - m * 0.045]], rgba(gold, 0.8));
    }
    for (const s of [-1, 1]) circle(ctx, s * (ax + b * 0.1) * 0.75, top + m * 0.02, m * 0.025, gold);
  },
  incense(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.36, m * 0.36, 0.7);
    const brass = '#b8862e';
    const lw = Math.max(0.5, m * 0.03);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TAU + Math.PI / 2;
      line(ctx, 0, 0, Math.cos(a) * m * 0.4, Math.sin(a) * m * 0.4, shade(brass, -0.25), Math.max(0.8, m * 0.07));
      circle(ctx, Math.cos(a) * m * 0.41, Math.sin(a) * m * 0.41, m * 0.06, shade(brass, -0.08), shade(brass, -0.4), lw * 0.6);
    }
    circle(ctx, 0, 0, m * 0.33, lit(ctx, 0, 0, m * 0.33, brass, 0.18), shade(brass, -0.4), lw);
    circle(ctx, 0, 0, m * 0.24, radial(ctx, 0, 0, m * 0.24, '#5e5650', '#36302c'), shade(brass, -0.35), lw * 0.6);
    // Glowing incense.
    glow(ctx, 0, 0, m * 0.26, '#ff8a3c', 0.6);
    for (let i = 0; i < 7; i += 1) {
      const a = rnd() * TAU;
      const d = rnd() * m * 0.14;
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * (0.025 + rnd() * 0.02), ['#ff5a1a', '#ff9a3c', '#ffd06a'][i % 3]);
    }
    // Smoke rising in soft puffs, drifting away to the top right, a curl running through it.
    const path = [];
    for (let i = 0; i <= 20; i += 1) {
      const k = i / 20;
      path.push([m * (0.02 + k * 0.24) + Math.sin(k * 7) * m * 0.05 * k, -m * (0.02 + k * 0.28) + Math.cos(k * 7) * m * 0.03 * k]);
    }
    for (let i = 4; i <= 20; i += 4) circle(ctx, path[i][0], path[i][1], m * (0.05 + (i / 20) * 0.08), rgba('#dcdad6', 0.28 - (i / 20) * 0.1));
    polyline(ctx, path, rgba('#f4f2ee', 0.6), Math.max(0.6, m * 0.035));
  },
  bell(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.45, m * 0.45, 3);
    const dk = '#3e2e10';
    const lw = Math.max(0.6, m * 0.012);
    // The bell from above, a shiny bronze dome: the lip, the waist, a raised band and the crown.
    circle(ctx, 0, 0, m * 0.47, radial(ctx, 0, 0, m * 0.47, '#f6e0a0', '#4e3814', -m * 0.2, -m * 0.22), dk, Math.max(0.8, m * 0.02));
    circle(ctx, 0, 0, m * 0.4, null, rgba(dk, 0.55), lw * 1.4);
    ctx.beginPath();
    ctx.arc(0, 0, m * 0.435, Math.PI * 0.95, Math.PI * 1.55);
    ctx.strokeStyle = rgba('#fff4cc', 0.55);
    ctx.lineWidth = Math.max(0.8, m * 0.022);
    ctx.stroke();
    // A streak of shine and some verdigris on the shaded side.
    oval(ctx, -m * 0.2, -m * 0.19, m * 0.12, m * 0.045, -Math.PI / 4, rgba('#fffbe8', 0.4));
    for (let i = 0; i < 6; i += 1) {
      const a = 0.1 + rnd() * 1.4;
      const d = m * (0.3 + rnd() * 0.12);
      oval(ctx, Math.cos(a) * d, Math.sin(a) * d, m * (0.025 + rnd() * 0.03), m * 0.015, a + Math.PI / 2, rgba('#5fa48c', 0.4));
    }
    circle(ctx, 0, 0, m * 0.22, lit(ctx, 0, 0, m * 0.22, '#c49a48', 0.16), rgba(dk, 0.7), lw * 1.4);
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * TAU;
      circle(ctx, Math.cos(a) * m * 0.19, Math.sin(a) * m * 0.19, m * 0.008, rgba(dk, 0.55));
    }
    circle(ctx, 0, 0, m * 0.15, lit(ctx, 0, 0, m * 0.15, '#d0a855', 0.18), dk, lw);
    // The wooden headstock it hangs from, with iron straps and bearings.
    rrect(ctx, -m * 0.48, -m * 0.065, m * 0.96, m * 0.13, m * 0.025, '#5e3e22', '#2e1d0d', lw);
    line(ctx, -m * 0.46, -m * 0.035, m * 0.46, -m * 0.035, rgba('#ffffff', 0.15), lw, 'butt');
    line(ctx, -m * 0.3, m * 0.02, m * 0.25, m * 0.015, rgba('#2e1d0d', 0.6), lw * 0.8);
    for (const s of [-1, 1]) {
      rect(ctx, s * m * 0.1 - m * 0.022, -m * 0.075, m * 0.044, m * 0.15, '#3a3a3c', '#1a1a1c', lw * 0.6);
      circle(ctx, s * m * 0.1, 0, m * 0.012, '#9a9a9a');
      rect(ctx, s * m * 0.44 - m * 0.04, -m * 0.085, m * 0.08, m * 0.17, '#4a4a4e', '#1a1a1c', lw);
    }
  },
  god_statue(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.47, h * 0.47, 2.6);
    const marble = '#e2ddd3';
    const edge = '#857f74';
    const lw = Math.max(0.6, m * 0.01);
    // A stepped plinth.
    rect(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#5d5953', '#3a3732', lw);
    poly(ctx, [[-w * 0.48, -h * 0.48], [w * 0.48, -h * 0.48], [w * 0.42, -h * 0.42], [-w * 0.42, -h * 0.42]], '#857f76');
    poly(ctx, [[-w * 0.48, -h * 0.48], [-w * 0.42, -h * 0.42], [-w * 0.42, h * 0.42], [-w * 0.48, h * 0.48]], '#726d65');
    rect(ctx, -w * 0.42, -h * 0.42, w * 0.84, h * 0.84, lit(ctx, 0, 0, m * 0.6, '#7a756c', 0.08), '#48443e', lw);
    // The figure's shadow on the plinth (each part wound the same way, so they fill as one).
    const sleeve = (s) => {
      const p = [[s * m * 0.1, -m * 0.07], [s * m * 0.36, -m * 0.05], [s * m * 0.37, m * 0.01], [s * m * 0.3, m * 0.08], [s * m * 0.14, m * 0.06]];
      return s > 0 ? p : p.reverse();
    };
    if (g.shadows) {
      const dx = m * 0.05;
      const dy = m * 0.06;
      ctx.beginPath();
      ctx.moveTo(dx + m * 0.21, m * 0.07 + dy);
      ctx.ellipse(dx, m * 0.07 + dy, m * 0.21, m * 0.2, 0, 0, TAU);
      for (const s of [-1, 1]) {
        sleeve(s).forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
        ctx.closePath();
      }
      ctx.moveTo(dx + m * 0.12, -m * 0.04 + dy);
      ctx.arc(dx, -m * 0.04 + dy, m * 0.12, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fill();
    }
    // The robe spreading round the feet.
    oval(ctx, 0, m * 0.07, m * 0.21, m * 0.2, 0, lit(ctx, 0, m * 0.07, m * 0.22, shade(marble, -0.08), 0.1), edge, lw);
    for (const a of [0.9, 1.25, 1.6, 1.95, 2.3]) line(ctx, Math.cos(a) * m * 0.1, m * 0.07 + Math.sin(a) * m * 0.08, Math.cos(a) * m * 0.2, m * 0.07 + Math.sin(a) * m * 0.19, rgba(edge, 0.7), lw);
    // Arms held out, sleeves hanging.
    for (const s of [-1, 1]) {
      poly(ctx, sleeve(s), lit(ctx, s * m * 0.24, -m * 0.02, m * 0.16, marble, 0.1), edge, lw);
      line(ctx, s * m * 0.16, -m * 0.045, s * m * 0.35, -m * 0.035, rgba('#ffffff', 0.35), lw);
      circle(ctx, s * m * 0.4, -m * 0.03, m * 0.035, lit(ctx, s * m * 0.4, -m * 0.03, m * 0.035, marble, 0.14), edge, lw);
    }
    oval(ctx, 0, -m * 0.02, m * 0.15, m * 0.085, 0, lit(ctx, 0, -m * 0.04, m * 0.15, marble, 0.12), edge, lw);
    // The head, with a gilded crown of rays.
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      line(ctx, Math.cos(a) * m * 0.07, -m * 0.04 + Math.sin(a) * m * 0.07, Math.cos(a) * m * 0.12, -m * 0.04 + Math.sin(a) * m * 0.12, '#d4a72c', Math.max(0.6, m * 0.018));
    }
    circle(ctx, 0, -m * 0.04, m * 0.075, lit(ctx, 0, -m * 0.04, m * 0.075, marble, 0.16), edge, lw);
    circle(ctx, 0, -m * 0.04, m * 0.075, null, '#b8902f', Math.max(0.6, m * 0.014));
  },
  dais(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.49, h * 0.48, 0.5);
    const st = '#a39e95';
    const edge = '#4f4b45';
    const lw = Math.max(0.8, m * 0.008);
    const x0 = -w * 0.48;
    const ww = w * 0.96;
    const yTop = -h * 0.47;
    const yP = h * 0.2;
    const yS = h * 0.34;
    const yB = h * 0.48;
    // Two steps down at the front, each darker, the step above shading its back edge.
    rect(ctx, x0, yS, ww, yB - yS, shade(st, -0.2), edge, lw);
    rect(ctx, x0, yP, ww, yS - yP, shade(st, -0.1), edge, lw);
    for (const y of [yP, yS]) {
      rect(ctx, x0, y, ww, (yS - yP) * 0.28, rgba('#000000', 0.16));
      line(ctx, x0, y + (yS - yP) - lw * 1.2, x0 + ww, y + (yS - yP) - lw * 1.2, rgba('#ffffff', 0.18), Math.max(0.6, m * 0.008), 'butt');
    }
    // The platform top: big slabs, lit edges top and left, dark on the right.
    rect(ctx, x0, yTop, ww, yP - yTop, st, edge, lw);
    const rows = 3;
    for (let r = 0; r < rows; r += 1) {
      const y = yTop + ((yP - yTop) * r) / rows;
      const cols = 4;
      for (let c = -1; c < cols; c += 1) {
        const off = r % 2 ? 0.5 : 0;
        const xa = Math.max(x0, x0 + (ww * (c + off)) / cols);
        const xb = Math.min(x0 + ww, x0 + (ww * (c + 1 + off)) / cols);
        if (xb - xa < 1) continue;
        rect(ctx, xa, y, xb - xa, (yP - yTop) / rows, shade(st, (rnd() - 0.5) * 0.06), rgba(edge, 0.35), lw);
      }
    }
    const b = m * 0.035;
    poly(ctx, [[x0, yTop], [x0 + ww, yTop], [x0 + ww - b, yTop + b], [x0 + b, yTop + b]], rgba('#ffffff', 0.2));
    poly(ctx, [[x0, yTop], [x0 + b, yTop + b], [x0 + b, yP], [x0, yP]], rgba('#ffffff', 0.12));
    poly(ctx, [[x0 + ww, yTop], [x0 + ww, yP], [x0 + ww - b, yP], [x0 + ww - b, yTop + b]], rgba('#000000', 0.2));
    line(ctx, x0, yP - lw, x0 + ww, yP - lw, rgba('#ffffff', 0.3), Math.max(0.8, m * 0.012), 'butt');
    rect(ctx, x0 + m * 0.07, yTop + m * 0.07, ww - m * 0.14, yP - yTop - m * 0.1, null, rgba(shade(st, -0.25), 0.55), Math.max(0.6, m * 0.01));
    rect(ctx, x0, yTop, ww, yB - yTop, null, edge, Math.max(1, m * 0.012));
  },
  carpet_runner(g) {
    const { ctx, w, h, m, t } = g;
    const gold = '#d9b44a';
    const x0 = -w * 0.42;
    const rw = w * 0.84;
    const y0 = -h / 2 + m * 0.1;
    const rh = h - m * 0.2;
    for (const y of [y0, y0 + rh]) {
      for (let i = 0; i <= 12; i += 1) {
        const x = x0 + (rw * i) / 12;
        line(ctx, x, y, x, y + (y < 0 ? -1 : 1) * m * 0.08, rgba('#e6dcc0', 0.9), Math.max(0.5, m * 0.014));
      }
    }
    rect(ctx, x0, y0, rw, rh, t, shade(t, -0.3), Math.max(0.6, m * 0.02));
    const b = m * 0.07;
    rect(ctx, x0 + b, y0 + b, rw - 2 * b, rh - 2 * b, null, gold, Math.max(0.8, m * 0.035));
    rect(ctx, x0 + b * 1.9, y0 + b * 1.9, rw - 3.8 * b, rh - 3.8 * b, null, rgba(gold, 0.8), Math.max(0.5, m * 0.012));
    // Diamonds down the middle.
    const n = Math.max(2, Math.round(rh / (m * 0.75)));
    for (let i = 0; i < n; i += 1) {
      const y = y0 + (rh * (i + 0.5)) / n;
      poly(ctx, [[0, y - m * 0.17], [w * 0.15, y], [0, y + m * 0.17], [-w * 0.15, y]], shade(t, -0.1), rgba(gold, 0.9), Math.max(0.5, m * 0.015));
      circle(ctx, 0, y, m * 0.03, gold);
    }
  },
  throne_grand(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.46, h * 0.47, 1.6);
    const lw = Math.max(0.6, m * 0.014);
    const dk = shade(t, -0.4);
    const red = '#8b1e2d';
    // The step it stands on.
    rect(ctx, -w * 0.47, -h * 0.4, w * 0.94, h * 0.87, lit(ctx, 0, 0, m * 0.6, '#8d8880', 0.06), '#4f4b45', lw);
    rect(ctx, -w * 0.47, h * 0.34, w * 0.94, h * 0.13, '#7a756c', '#4f4b45', lw);
    line(ctx, -w * 0.47, h * 0.345, w * 0.47, h * 0.345, rgba('#ffffff', 0.25), lw, 'butt');
    // The seat and its red cushion.
    rrect(ctx, -w * 0.27, -h * 0.24, w * 0.54, h * 0.52, m * 0.03, shade(t, -0.12), dk, lw);
    rrect(ctx, -w * 0.22, -h * 0.2, w * 0.44, h * 0.42, m * 0.06, lit(ctx, 0, h * 0.02, m * 0.3, red, 0.12), shade(red, -0.25), lw);
    for (const [x, y] of [[-0.1, -0.06], [0.1, -0.06], [0, 0.04], [-0.1, 0.13], [0.1, 0.13]]) circle(ctx, x * w, y * h, m * 0.015, shade(red, -0.25));
    rect(ctx, -w * 0.22, -h * 0.2, w * 0.44, h * 0.07, rgba('#000000', 0.18));
    // Arms down the sides, with scrolled ends at the front.
    for (const s of [-1, 1]) {
      rrect(ctx, s * w * 0.31 - w * 0.06, -h * 0.26, w * 0.12, h * 0.52, w * 0.04, lit(ctx, s * w * 0.31, 0, h * 0.3, t, 0.12), dk, lw);
      line(ctx, s * w * 0.31 - w * 0.025, -h * 0.2, s * w * 0.31 - w * 0.025, h * 0.18, rgba('#ffffff', 0.3), lw);
      circle(ctx, s * w * 0.31, h * 0.25, w * 0.075, lit(ctx, s * w * 0.31, h * 0.25, w * 0.075, t, 0.2), dk, lw);
      circle(ctx, s * w * 0.31, h * 0.25, w * 0.03, null, dk, lw);
    }
    // The tall back across the top, with a crested top and a gem.
    const back = [[-w * 0.42, -h * 0.2], [-w * 0.42, -h * 0.36], [-w * 0.3, -h * 0.37], [-w * 0.22, -h * 0.44], [-w * 0.11, -h * 0.4], [0, -h * 0.48], [w * 0.11, -h * 0.4], [w * 0.22, -h * 0.44], [w * 0.3, -h * 0.37], [w * 0.42, -h * 0.36], [w * 0.42, -h * 0.2]];
    poly(ctx, back, lit(ctx, -w * 0.1, -h * 0.34, w * 0.45, t, 0.16), dk, lw);
    rrect(ctx, -w * 0.24, -h * 0.33, w * 0.48, h * 0.1, m * 0.03, lit(ctx, 0, -h * 0.28, m * 0.25, red, 0.1), dk, lw);
    for (const s of [-1, 1]) circle(ctx, s * w * 0.42, -h * 0.28, w * 0.065, lit(ctx, s * w * 0.42, -h * 0.28, w * 0.065, t, 0.22), dk, lw);
    circle(ctx, 0, -h * 0.4, m * 0.04, lit(ctx, 0, -h * 0.4, m * 0.04, '#c0392b', 0.25), '#5a1010', lw);
  },
  candle_stand(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.47, h * 0.42, 1);
    const lw = Math.max(0.5, m * 0.04);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) circle(ctx, sx * w * 0.44, sy * h * 0.36, m * 0.08, '#1e1e20');
    // Two iron tiers, the back one higher.
    rrect(ctx, -w * 0.46, -h * 0.42, w * 0.92, h * 0.44, m * 0.06, '#444446', '#151517', lw);
    rrect(ctx, -w * 0.46, h * 0.02, w * 0.92, h * 0.4, m * 0.06, '#333335', '#151517', lw);
    line(ctx, -w * 0.44, -h * 0.38, w * 0.44, -h * 0.38, rgba('#ffffff', 0.18), lw * 0.6, 'butt');
    for (const [y, n, off] of [[-h * 0.2, 5, 0], [h * 0.22, 4, 0.5]]) {
      for (let i = 0; i < n; i += 1) {
        const x = -w * 0.37 + (w * 0.74 * (i + off)) / 4;
        circle(ctx, x, y, m * 0.14, '#202022');
        if (rnd() < 0.85) candle(g, x, y, m * 0.1 * (0.75 + rnd() * 0.35));
        else circle(ctx, x, y, m * 0.07, '#d8ceb4');
      }
    }
  },
  offering_bowl(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.42, m * 0.42, 0.6);
    const br = '#a8743a';
    const lw = Math.max(0.5, m * 0.03);
    circle(ctx, 0, 0, m * 0.46, lit(ctx, 0, 0, m * 0.46, br, 0.18), shade(br, -0.42), lw);
    circle(ctx, 0, 0, m * 0.37, radial(ctx, 0, 0, m * 0.37, shade(br, -0.04), shade(br, -0.3), m * 0.12, m * 0.12), shade(br, -0.36), lw * 0.7);
    // Coins, grapes, an apple, an orange and a flower.
    coin(g, m * 0.16, m * 0.14, m * 0.07);
    coin(g, -m * 0.02, m * 0.22, m * 0.065);
    coin(g, m * 0.21, -m * 0.02, m * 0.06);
    for (const [x, y] of [[0.1, -0.2], [0.17, -0.15], [0.08, -0.12], [0.15, -0.07], [0.04, -0.05], [0.11, -0.03]]) circle(ctx, x * m, y * m, m * 0.05, lit(ctx, x * m, y * m, m * 0.05, '#6a3a7a', 0.2), '#3a1a4a', Math.max(0.5, m * 0.01));
    circle(ctx, -m * 0.12, m * 0.07, m * 0.12, lit(ctx, -m * 0.12, m * 0.07, m * 0.12, '#c0392b', 0.22), '#6a1a12', Math.max(0.5, m * 0.015));
    line(ctx, -m * 0.12, m * 0.02, -m * 0.09, -m * 0.02, '#4a2a10', Math.max(0.5, m * 0.02));
    circle(ctx, -m * 0.16, m * 0.03, m * 0.03, rgba('#ffffff', 0.5));
    circle(ctx, m * 0.02 + rnd() * m * 0.02, m * 0.06, m * 0.09, lit(ctx, m * 0.02, m * 0.06, m * 0.09, '#e08a2a', 0.22), '#7a4210', Math.max(0.5, m * 0.012));
    for (let k = 0; k < 5; k += 1) circle(ctx, -m * 0.1 + Math.cos((k / 5) * TAU) * m * 0.055, -m * 0.15 + Math.sin((k / 5) * TAU) * m * 0.055, m * 0.045, '#f4f0e0', '#c8c0a8', Math.max(0.5, m * 0.008));
    circle(ctx, -m * 0.1, -m * 0.15, m * 0.035, '#f2c12e');
  },
  holy_symbol(g) {
    const { ctx, m, t } = g;
    const lw = Math.max(0.6, m * 0.02);
    const dk = shade(t, -0.38);
    circle(ctx, 0, 0, m * 0.47, rgba('#2c2a30', 0.5));
    circle(ctx, 0, 0, m * 0.45, null, lit(ctx, 0, 0, m * 0.45, t, 0.16), Math.max(1, m * 0.04));
    circle(ctx, 0, 0, m * 0.39, null, rgba(t, 0.85), Math.max(0.5, m * 0.012));
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * TAU - Math.PI / 2;
      const long = i % 2 === 0;
      const r1 = m * (long ? 0.36 : 0.26);
      const wd = long ? 0.2 : 0.17;
      poly(ctx, [[Math.cos(a - wd) * m * 0.12, Math.sin(a - wd) * m * 0.12], [Math.cos(a) * r1, Math.sin(a) * r1], [Math.cos(a + wd) * m * 0.12, Math.sin(a + wd) * m * 0.12]], lit(ctx, 0, 0, m * 0.38, t, 0.16), dk, lw * 0.6);
    }
    for (let i = 0; i < 8; i += 1) {
      const a = ((i + 0.5) / 8) * TAU - Math.PI / 2;
      circle(ctx, Math.cos(a) * m * 0.42, Math.sin(a) * m * 0.42, m * 0.016, t);
    }
    circle(ctx, 0, 0, m * 0.13, lit(ctx, 0, 0, m * 0.13, t, 0.22), dk, lw);
    circle(ctx, 0, 0, m * 0.075, null, dk, lw * 0.7);
  },
  stained_light(g) {
    const { ctx, w, h, m, rnd } = g;
    const cols = ['#ff6a5a', '#5a86ff', '#ffd65a', '#58e08a'];
    const c = 0.28; // the light comes in slanting, so the window's patch leans
    const P = (pts) => pts.map(([u, v]) => [u + c * v, v]);
    const U = w * 0.26;
    const vS = -h * 0.17;
    const vB = h * 0.46;
    const gap = m * 0.014;
    // One pane of light: a soft halo, then the pane itself inside its leading.
    const pane = (pts, col) => {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const grow = (k) => P(pts.map(([u, v]) => [cx + (u - cx) * k, cy + (v - cy) * k]));
      poly(ctx, grow(1.12), rgba(col, 0.1));
      poly(ctx, grow(0.86), rgba(col, 0.26));
    };
    // A warm wash over the whole window: an arch on two straight sides.
    const outline = [[-U, vB]];
    for (let i = 0; i <= 12; i += 1) outline.push([-Math.cos((i / 12) * Math.PI) * U, vS - Math.sin((i / 12) * Math.PI) * U]);
    outline.push([U, vB]);
    poly(ctx, P(outline.map(([u, v]) => [u * 1.08, v < 0 ? vS + (v - vS) * 1.06 : v + gap])), rgba('#fff4d6', 0.14));
    // The arch: three panes fanning out, and a little round rose at their foot.
    const o = Math.floor(rnd() * 4);
    for (let k = 0; k < 3; k += 1) {
      const pts = [[0, vS]];
      for (let i = 0; i <= 4; i += 1) {
        const a = Math.PI + ((k + i / 4) / 3) * Math.PI;
        pts.push([Math.cos(a) * U, vS + Math.sin(a) * U]);
      }
      pane(pts, cols[(o + k + (k === 1 ? 1 : 0)) % 4]);
    }
    // The lights below: three columns by four rows, matching left and right.
    for (let r = 0; r < 4; r += 1) {
      for (let k = 0; k < 3; k += 1) {
        const u0 = -U + (2 * U * k) / 3;
        const u1 = -U + (2 * U * (k + 1)) / 3;
        const v0 = vS + ((vB - vS) * r) / 4;
        const v1 = vS + ((vB - vS) * (r + 1)) / 4;
        pane([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], cols[(o + r + (k === 1 ? 2 : 0)) % 4]);
      }
    }
    const rose = P([[0, vS - U * 0.12]])[0];
    circle(ctx, rose[0], rose[1], m * 0.05, rgba('#fff6dc', 0.3));
    circle(ctx, rose[0], rose[1], m * 0.05 + gap, null, rgba('#fff6dc', 0.12), gap);
  },
  organ(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.49, h * 0.46, 2);
    const wood = '#5e3b1f';
    const dk = '#2e1d0d';
    const lw = Math.max(0.6, m * 0.025);
    // The case along the back, full of pipes: round open tops, tallest in the middle and at the ends.
    rect(ctx, -w * 0.49, -h * 0.48, w * 0.98, h * 0.56, lit(ctx, 0, -h * 0.25, w * 0.5, wood, 0.06), dk, lw);
    const pipe = (x, y, r) => {
      circle(ctx, x, y, r, lit(ctx, x, y, r, '#d0d3d6', 0.2), '#4a4d52', Math.max(0.5, r * 0.14));
      circle(ctx, x, y, r * 0.52, radial(ctx, x, y, r * 0.52, '#0c0c0e', '#2e2e32'));
    };
    const n1 = 11;
    for (let i = 0; i < n1; i += 1) {
      const k = i / (n1 - 1);
      pipe(-w * 0.44 + w * 0.88 * k, -h * 0.29, m * 0.125 * (0.75 + 0.25 * Math.abs(Math.cos(k * TAU))));
    }
    const n2 = 15;
    for (let i = 0; i < n2; i += 1) {
      const k = i / (n2 - 1);
      pipe(-w * 0.45 + w * 0.9 * k, -h * 0.05, m * 0.075 * (0.78 + 0.22 * Math.abs(Math.cos(k * TAU))));
    }
    // The console in front: two keyboards and stops either side.
    rect(ctx, -w * 0.21, h * 0.06, w * 0.42, h * 0.4, lit(ctx, 0, h * 0.2, w * 0.25, shade(wood, 0.04), 0.06), dk, lw);
    for (const y of [h * 0.14, h * 0.29]) {
      rect(ctx, -w * 0.15, y, w * 0.3, h * 0.11, '#efe9dc', '#4a4034', Math.max(0.5, m * 0.012));
      for (let i = 0; i < 21; i += 1) {
        if ([2, 6, 9, 13, 16, 20].includes(i)) continue;
        const x = -w * 0.15 + (w * 0.3 * (i + 0.5)) / 21;
        rect(ctx, x - w * 0.003, y, w * 0.006, h * 0.065, '#1e1a16');
      }
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        circle(ctx, s * w * 0.18, h * 0.15 + i * h * 0.1, m * 0.03, '#efe6cf', '#6a5a40', Math.max(0.5, m * 0.008));
      }
    }
  },
  reliquary(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.44, h * 0.42, 0.7);
    const gold = '#d4a72c';
    const dk = '#6a4e10';
    const lw = Math.max(0.5, m * 0.028);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) circle(ctx, sx * w * 0.41, sy * h * 0.37, m * 0.075, lit(ctx, sx * w * 0.41, sy * h * 0.37, m * 0.075, gold, 0.2), dk, lw * 0.6);
    rrect(ctx, -w * 0.42, -h * 0.38, w * 0.84, h * 0.76, m * 0.05, lit(ctx, 0, 0, w * 0.5, gold, 0.14), dk, lw);
    rrect(ctx, -w * 0.33, -h * 0.27, w * 0.66, h * 0.54, m * 0.04, lit(ctx, 0, 0, w * 0.4, shade(gold, 0.06), 0.12), shade(gold, -0.28), lw * 0.7);
    for (let i = 0; i < 9; i += 1) {
      circle(ctx, -w * 0.375 + (w * 0.75 * i) / 8, -h * 0.325, m * 0.014, shade(gold, -0.3));
      circle(ctx, -w * 0.375 + (w * 0.75 * i) / 8, h * 0.325, m * 0.014, shade(gold, -0.3));
    }
    // Gems at the corners of the lid, and a cross with a ruby.
    const gems = ['#c0392b', '#2e86de', '#27ae60', '#8e44ad'];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
      const x = sx * w * 0.25;
      const y = sy * h * 0.17;
      circle(ctx, x, y, m * 0.06, lit(ctx, x, y, m * 0.06, gems[i], 0.25), shade(gems[i], -0.4), Math.max(0.5, m * 0.012));
      circle(ctx, x - m * 0.02, y - m * 0.02, m * 0.018, rgba('#ffffff', 0.7));
    });
    const k = m * 0.05;
    poly(ctx, [[-k, -k * 3.2], [k, -k * 3.2], [k * 0.55, -k * 0.8], [k * 2.6, -k * 1.2], [k * 2.6, k * 1.2], [k * 0.55, k * 0.8], [k, k * 3.2], [-k, k * 3.2], [-k * 0.55, k * 0.8], [-k * 2.6, k * 1.2], [-k * 2.6, -k * 1.2], [-k * 0.55, -k * 0.8]], '#f6e7b0', dk, Math.max(0.5, m * 0.014));
    circle(ctx, 0, 0, k * 0.85, lit(ctx, 0, 0, k * 0.85, '#c0392b', 0.25), '#5a1010', Math.max(0.5, m * 0.01));
  },
  angel_statue(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.45, m * 0.45, 2.2);
    const st = '#cfcac0';
    const edge = '#77716a';
    const lw = Math.max(0.5, m * 0.011);
    circle(ctx, 0, 0, m * 0.48, '#55514b', '#3a3732', lw);
    circle(ctx, 0, 0, m * 0.44, lit(ctx, 0, 0, m * 0.44, '#77726a', 0.08));
    // Wings: fans of feathers from the shoulders, spread out and back.
    const feathers = [];
    for (const s of [-1, 1]) {
      for (const [len, wd, n, k] of [[0.45, 0.05, 7, -0.08], [0.32, 0.055, 6, -0.01], [0.19, 0.06, 5, 0.06]]) {
        for (let i = n - 1; i >= 0; i -= 1) {
          const a0 = 0.35 - (i / (n - 1)) * 1.15;
          const a = s > 0 ? a0 : Math.PI - a0;
          const l = m * len * (1 - i * 0.04);
          feathers.push([s * m * 0.07 + (Math.cos(a) * l) / 2, -m * 0.03 + (Math.sin(a) * l) / 2, l / 2, m * wd, a, k]);
        }
      }
    }
    // Its shadow on the plinth, then the stone.
    if (g.shadows) {
      ctx.beginPath();
      for (const [x, y, rx, ry, a] of feathers) {
        ctx.moveTo(x + m * 0.04 + Math.cos(a) * rx, y + m * 0.05 + Math.sin(a) * rx);
        ctx.ellipse(x + m * 0.04, y + m * 0.05, rx, ry, a, 0, TAU);
      }
      ctx.moveTo(m * 0.04 + m * 0.13, m * 0.11);
      ctx.ellipse(m * 0.04, m * 0.11, m * 0.13, m * 0.17, 0, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fill();
    }
    for (const [x, y, rx, ry, a, k] of feathers) oval(ctx, x, y, rx, ry, a, lit(ctx, x, y, rx, shade(st, k), 0.12), edge, lw);
    // The figure: robe, shoulders, head bowed over praying hands.
    oval(ctx, 0, m * 0.07, m * 0.12, m * 0.16, 0, lit(ctx, 0, m * 0.07, m * 0.16, shade(st, -0.04), 0.12), edge, lw);
    line(ctx, -m * 0.04, m * 0.1, -m * 0.06, m * 0.2, rgba(edge, 0.7), lw);
    line(ctx, m * 0.04, m * 0.1, m * 0.06, m * 0.2, rgba(edge, 0.7), lw);
    oval(ctx, 0, -m * 0.02, m * 0.13, m * 0.075, 0, lit(ctx, 0, -m * 0.03, m * 0.13, st, 0.12), edge, lw);
    circle(ctx, 0, m * 0.08, m * 0.035, lit(ctx, 0, m * 0.08, m * 0.035, st, 0.14), edge, lw);
    circle(ctx, 0, -m * 0.01, m * 0.07, lit(ctx, 0, -m * 0.01, m * 0.07, shade(st, 0.04), 0.16), edge, lw);
    ctx.beginPath();
    ctx.arc(0, -m * 0.01, m * 0.07, Math.PI * 1.05, Math.PI * 1.95);
    ctx.strokeStyle = rgba(edge, 0.6);
    ctx.lineWidth = Math.max(0.6, m * 0.02);
    ctx.stroke();
  },
  effigy_tomb(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.48, 1.2);
    const st = '#8d8880';
    const ef = '#aca79d';
    const dk = '#5d5953';
    const lw = Math.max(0.5, m * 0.014);
    // The chest and its lid, with a moulded edge.
    rect(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#6d685f', '#45413b', lw * 1.5);
    rect(ctx, -w * 0.42, -h * 0.45, w * 0.84, h * 0.9, lit(ctx, 0, 0, h * 0.5, st, 0.08), dk, lw);
    rect(ctx, -w * 0.37, -h * 0.42, w * 0.74, h * 0.84, null, rgba(dk, 0.55), lw);
    const E = (x, y, r) => lit(ctx, x, y, r, ef, 0.13);
    // The cushion under the head, with tassels.
    rrect(ctx, -w * 0.2, -h * 0.41, w * 0.4, h * 0.13, m * 0.04, E(0, -h * 0.35, m * 0.2), dk, lw);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) circle(ctx, sx * w * 0.2, -h * 0.345 + sy * h * 0.065, m * 0.025, E(0, 0, m), dk, lw);
    // Legs and pointed feet.
    for (const s of [-1, 1]) {
      line(ctx, s * w * 0.07, h * 0.18, s * w * 0.075, h * 0.36, dk, m * 0.13);
      line(ctx, s * w * 0.07, h * 0.18, s * w * 0.075, h * 0.36, ef, m * 0.1);
      poly(ctx, [[s * w * 0.03, h * 0.35], [s * w * 0.13, h * 0.35], [s * w * 0.1, h * 0.41]], E(s * w * 0.08, h * 0.37, m * 0.08), dk, lw);
    }
    // The body in a surcoat.
    poly(ctx, [[-w * 0.18, -h * 0.25], [w * 0.18, -h * 0.25], [w * 0.15, h * 0.21], [-w * 0.15, h * 0.21]], E(-w * 0.05, -h * 0.05, h * 0.3), dk, lw);
    line(ctx, -w * 0.165, h * 0.02, w * 0.165, h * 0.02, rgba(dk, 0.7), Math.max(0.5, m * 0.025), 'butt');
    // The sword down the middle, hands on its grip.
    poly(ctx, [[-w * 0.035, -h * 0.1], [w * 0.035, -h * 0.1], [w * 0.02, h * 0.27], [0, h * 0.31], [-w * 0.02, h * 0.27]], E(0, 0, h * 0.3), dk, lw);
    line(ctx, 0, -h * 0.08, 0, h * 0.26, rgba(dk, 0.5), lw);
    line(ctx, -w * 0.13, -h * 0.105, w * 0.13, -h * 0.105, dk, m * 0.06);
    line(ctx, -w * 0.12, -h * 0.105, w * 0.12, -h * 0.105, ef, m * 0.035);
    circle(ctx, 0, -h * 0.185, m * 0.035, E(0, -h * 0.185, m * 0.04), dk, lw);
    // Arms bent so both hands rest on the grip.
    for (const s of [-1, 1]) {
      polyline(ctx, [[s * w * 0.2, -h * 0.21], [s * w * 0.22, -h * 0.09], [s * w * 0.05, -h * 0.145]], dk, m * 0.11);
      polyline(ctx, [[s * w * 0.2, -h * 0.21], [s * w * 0.22, -h * 0.09], [s * w * 0.05, -h * 0.145]], ef, m * 0.08);
      oval(ctx, s * w * 0.2, -h * 0.225, w * 0.085, h * 0.045, 0, E(s * w * 0.2, -h * 0.23, m * 0.1), dk, lw);
    }
    oval(ctx, 0, -h * 0.145, w * 0.06, h * 0.03, 0, E(0, -h * 0.145, m * 0.06), dk, lw);
    // The helm, visor slits upward.
    rrect(ctx, -w * 0.1, -h * 0.4, w * 0.2, h * 0.13, m * 0.07, E(-w * 0.03, -h * 0.36, m * 0.14), dk, lw);
    line(ctx, -w * 0.065, -h * 0.345, w * 0.065, -h * 0.345, '#3f3b36', Math.max(0.6, m * 0.022), 'butt');
    line(ctx, 0, -h * 0.33, 0, -h * 0.285, rgba('#3f3b36', 0.8), Math.max(0.5, m * 0.016), 'butt');
  },
  // ----- Magic -----
  pentagram(g) {
    const { ctx, m, t, rnd } = g;
    glow(ctx, 0, 0, m * 0.52, t, 0.2);
    const paint = shade(t, 0.06);
    const halo = rgba(t, 0.28);
    const lw = Math.max(0.8, m * 0.011);
    const wob = (pts, k) => pts.map(([x, y]) => [x + (rnd() - 0.5) * m * k, y + (rnd() - 0.5) * m * k]);
    const ring = (r) => {
      const pts = [];
      for (let i = 0; i <= 64; i += 1) pts.push([Math.cos((i / 64) * TAU) * r, Math.sin((i / 64) * TAU) * r]);
      polyline(ctx, pts, halo, lw * 3.5);
      polyline(ctx, wob(pts, 0.005), paint, lw * 1.2);
    };
    ring(m * 0.465);
    ring(m * 0.38);
    // The five-pointed star, one point down.
    const star = [];
    for (let i = 0; i <= 5; i += 1) {
      const a = Math.PI / 2 + ((i % 5) * 2 * TAU) / 5;
      star.push([Math.cos(a) * m * 0.38, Math.sin(a) * m * 0.38]);
    }
    polyline(ctx, star, halo, lw * 4.5);
    polyline(ctx, star, paint, lw * 1.6);
    // Drips of paint here and there.
    for (let i = 0; i < 7; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.36 + rnd() * 0.12);
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * (0.006 + rnd() * 0.01), rgba(paint, 0.85));
    }
    // Sigils between the circles; candles at the points.
    const glyph = (k, col, wd) => {
      const v = Math.floor(rnd() * 6);
      if (v === 0) polyline(ctx, [[-k, k], [0, -k], [k, k]], col, wd);
      else if (v === 1) { line(ctx, 0, -k, 0, k, col, wd); line(ctx, -k * 0.7, -k * 0.2, k * 0.7, -k * 0.2, col, wd); }
      else if (v === 2) { circle(ctx, 0, -k * 0.4, k * 0.45, null, col, wd); line(ctx, 0, k * 0.05, 0, k, col, wd); }
      else if (v === 3) polyline(ctx, [[-k, -k], [k, -k * 0.3], [-k, k * 0.3], [k, k]], col, wd);
      else if (v === 4) { polyline(ctx, [[-k, -k], [0, k], [k, -k]], col, wd); line(ctx, -k * 0.6, -k * 0.1, k * 0.6, -k * 0.1, col, wd); }
      else { line(ctx, -k, 0, k, 0, col, wd); circle(ctx, 0, 0, k * 0.4, null, col, wd); line(ctx, 0, -k, 0, -k * 0.4, col, wd); }
    };
    for (let i = 0; i < 20; i += 1) {
      if (i % 4 === 0) continue;
      const a = Math.PI / 2 + (i / 20) * TAU;
      ctx.save();
      ctx.translate(Math.cos(a) * m * 0.4225, Math.sin(a) * m * 0.4225);
      ctx.rotate(a + Math.PI / 2);
      glyph(m * 0.022, shade(t, 0.18), Math.max(0.5, m * 0.007));
      ctx.restore();
    }
    for (let i = 0; i < 5; i += 1) {
      const a = Math.PI / 2 + (i * TAU) / 5;
      candle(g, Math.cos(a) * m * 0.4225, Math.sin(a) * m * 0.4225, m * 0.03);
    }
  },
  teleport_pad(g) {
    const { ctx, m, t, rnd } = g;
    shadow(g, 'round', m * 0.47, m * 0.47, 0.4);
    const st = '#7d786f';
    const lw = Math.max(0.6, m * 0.008);
    circle(ctx, 0, 0, m * 0.48, '#4a463f');
    // A ring of stone blocks round a smooth dark floor.
    const n = 16;
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * TAU;
      const a1 = ((i + 1) / n) * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, m * 0.47, a0 + 0.012, a1 - 0.012);
      ctx.arc(0, 0, m * 0.375, a1 - 0.015, a0 + 0.015, true);
      ctx.closePath();
      ctx.fillStyle = shade(st, (rnd() - 0.5) * 0.08 + Math.cos((a0 + a1) / 2 + Math.PI * 0.75) * 0.07);
      ctx.fill();
    }
    circle(ctx, 0, 0, m * 0.365, radial(ctx, 0, 0, m * 0.365, '#5e5a64', '#45414a'), '#2e2b30', lw);
    glow(ctx, 0, 0, m * 0.48, t, 0.32);
    // Glowing inlaid rings with runes between them.
    const ring = (r, wd) => {
      circle(ctx, 0, 0, r, null, rgba(t, 0.3), wd * 4);
      circle(ctx, 0, 0, r, null, shade(t, 0.3), wd);
    };
    ring(m * 0.34, lw * 1.4);
    ring(m * 0.245, lw * 1.2);
    ring(m * 0.12, lw * 1.2);
    const col = shade(t, 0.35);
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * TAU;
      const k = m * 0.022;
      ctx.save();
      ctx.translate(Math.cos(a) * m * 0.293, Math.sin(a) * m * 0.293);
      ctx.rotate(a + Math.PI / 2);
      const v = Math.floor(rnd() * 4);
      if (v === 0) polyline(ctx, [[-k, k], [0, -k], [k, k]], col, lw);
      else if (v === 1) { line(ctx, 0, -k, 0, k, col, lw); line(ctx, 0, -k * 0.2, k * 0.8, -k, col, lw); }
      else if (v === 2) polyline(ctx, [[-k, -k], [k * 0.6, -k * 0.2], [-k * 0.6, k * 0.2], [k, k]], col, lw);
      else { polyline(ctx, [[-k, -k], [0, k], [k, -k]], col, lw); line(ctx, -k * 0.5, -k * 0.1, k * 0.5, -k * 0.1, col, lw); }
      ctx.restore();
    }
    for (let i = 0; i < 8; i += 1) {
      const a = ((i + 0.5) / 8) * TAU;
      line(ctx, Math.cos(a) * m * 0.13, Math.sin(a) * m * 0.13, Math.cos(a) * m * 0.235, Math.sin(a) * m * 0.235, rgba(col, 0.6), lw);
    }
    // Bright marks on every other block, and a sigil in the middle.
    for (let i = 0; i < 8; i += 1) {
      const a = ((i * 2 + 0.5) / 16) * TAU;
      circle(ctx, Math.cos(a) * m * 0.423, Math.sin(a) * m * 0.423, m * 0.012, col);
    }
    poly(ctx, [[0, -m * 0.07], [m * 0.02, -m * 0.02], [m * 0.07, 0], [m * 0.02, m * 0.02], [0, m * 0.07], [-m * 0.02, m * 0.02], [-m * 0.07, 0], [-m * 0.02, -m * 0.02]], col);
    glow(ctx, 0, 0, m * 0.1, '#ffffff', 0.35);
  },
  arcane_pillar(g) {
    const { ctx, m, t } = g;
    shadow(g, 'round', m * 0.46, m * 0.46, 2.2);
    const st = '#7a7580';
    const lw = Math.max(0.5, m * 0.015);
    circle(ctx, 0, 0, m * 0.48, '#4c4852');
    circle(ctx, 0, 0, m * 0.43, shade(st, -0.07));
    circle(ctx, 0, 0, m * 0.37, lit(ctx, 0, 0, m * 0.37, st, 0.12), '#4c4852', lw);
    glow(ctx, 0, 0, m * 0.5, t, 0.28);
    // Runes cut into the capital, glowing.
    const col = shade(t, 0.3);
    circle(ctx, 0, 0, m * 0.3, null, rgba(t, 0.35), lw * 3);
    circle(ctx, 0, 0, m * 0.3, null, col, lw);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU + 0.2;
      const x = Math.cos(a) * m * 0.405;
      const y = Math.sin(a) * m * 0.405;
      const k = m * 0.025;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 2);
      if (i % 2) polyline(ctx, [[-k, k], [0, -k], [k, k]], col, lw);
      else { line(ctx, 0, -k, 0, k, col, lw); line(ctx, -k * 0.7, 0, k * 0.7, -k * 0.6, col, lw); }
      ctx.restore();
    }
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * TAU + Math.PI / 4;
      line(ctx, Math.cos(a) * m * 0.12, Math.sin(a) * m * 0.12, Math.cos(a) * m * 0.29, Math.sin(a) * m * 0.29, rgba(col, 0.75), lw);
    }
    // The floating crystal, its shadow on the stone below it.
    const cs = m * 0.15;
    const cx = -m * 0.03;
    const cy = -m * 0.05;
    poly(ctx, [[m * 0.04, -cs * 0.9 + m * 0.06], [m * 0.04 + cs * 0.65, m * 0.06], [m * 0.04, cs * 0.9 + m * 0.06], [m * 0.04 - cs * 0.65, m * 0.06]], rgba('#000000', 0.3));
    glow(ctx, cx, cy, m * 0.3, t, 0.55);
    const top = [cx, cy - cs];
    const rt = [cx + cs * 0.72, cy];
    const bot = [cx, cy + cs];
    const lf = [cx - cs * 0.72, cy];
    poly(ctx, [top, rt, [cx, cy]], shade(t, 0.12));
    poly(ctx, [rt, bot, [cx, cy]], shade(t, -0.22));
    poly(ctx, [bot, lf, [cx, cy]], shade(t, -0.04));
    poly(ctx, [lf, top, [cx, cy]], shade(t, 0.38));
    poly(ctx, [top, rt, bot, lf], null, shade(t, -0.42), lw);
    circle(ctx, cx - cs * 0.25, cy - cs * 0.35, m * 0.02, rgba('#ffffff', 0.8));
  },
  magic_mirror(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.44, h * 0.4, 1.2);
    const fr = '#2c2228';
    const gold = '#b8902f';
    const lw = Math.max(0.5, m * 0.03);
    // An ornate dark frame: scalloped edge, crest and finials picked out in gold.
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * TAU;
      circle(ctx, Math.cos(a) * w * 0.43, Math.sin(a) * h * 0.37, m * 0.085, fr, '#120c10', lw * 0.5);
    }
    oval(ctx, 0, 0, w * 0.44, h * 0.38, 0, lit(ctx, -w * 0.1, -h * 0.1, w * 0.45, '#3e3038', 0.1), '#120c10', lw);
    for (const s of [-1, 1]) {
      circle(ctx, s * w * 0.45, 0, m * 0.07, lit(ctx, s * w * 0.45, 0, m * 0.07, gold, 0.2), '#5a4410', lw * 0.5);
    }
    ctx.beginPath();
    ctx.arc(0, -h * 0.34, m * 0.11, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = lit(ctx, 0, -h * 0.36, m * 0.11, gold, 0.2);
    ctx.fill();
    ctx.strokeStyle = '#5a4410';
    ctx.lineWidth = lw * 0.5;
    ctx.stroke();
    oval(ctx, 0, 0, w * 0.37, h * 0.3, 0, null, gold, lw * 0.8);
    // The swirling glass.
    oval(ctx, 0, 0, w * 0.34, h * 0.26, 0, radial(ctx, 0, 0, w * 0.34, shade(t, 0.35), shade(t, -0.4)));
    glow(ctx, 0, 0, w * 0.3, t, 0.45);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.34, h * 0.26, 0, 0, TAU);
    ctx.clip();
    for (let s = 0; s < 3; s += 1) {
      const pts = [];
      for (let i = 0; i < 30; i += 1) {
        const a = s * (TAU / 3) + i * 0.2;
        const r = 1 - i / 34;
        pts.push([Math.cos(a) * w * 0.33 * r, Math.sin(a) * h * 0.25 * r]);
      }
      polyline(ctx, pts, rgba(shade(t, 0.45), 0.7), Math.max(0.5, m * 0.025));
    }
    ctx.restore();
    circle(ctx, 0, 0, m * 0.05, rgba('#ffffff', 0.7));
  },
  spellbook(g) {
    const { ctx, w, h, m, t, rnd } = g;
    shadow(g, 'rect', w * 0.46, h * 0.42, 0.3);
    const cover = '#4a2e3a';
    const lw = Math.max(0.5, m * 0.022);
    rrect(ctx, -w * 0.48, -h * 0.44, w * 0.96, h * 0.88, m * 0.05, cover, shade(cover, -0.2), lw);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) poly(ctx, [[sx * w * 0.48, sy * h * 0.44], [sx * w * 0.36, sy * h * 0.44], [sx * w * 0.48, sy * h * 0.27]], '#b8902f');
    // The open pages.
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.34);
      ctx.quadraticCurveTo(s * w * 0.22, -h * 0.42, s * w * 0.44, -h * 0.36);
      ctx.lineTo(s * w * 0.44, h * 0.35);
      ctx.quadraticCurveTo(s * w * 0.22, h * 0.31, 0, h * 0.38);
      ctx.closePath();
      ctx.fillStyle = '#efe6cf';
      ctx.fill();
      ctx.strokeStyle = '#a8987a';
      ctx.lineWidth = Math.max(0.5, m * 0.012);
      ctx.stroke();
      line(ctx, s * w * 0.42, -h * 0.33, s * w * 0.42, h * 0.33, rgba('#a8987a', 0.7), Math.max(0.5, m * 0.01));
    }
    const grad = ctx.createLinearGradient(-w * 0.08, 0, w * 0.08, 0);
    grad.addColorStop(0, 'rgba(90,70,50,0)');
    grad.addColorStop(0.5, 'rgba(90,70,50,0.35)');
    grad.addColorStop(1, 'rgba(90,70,50,0)');
    rect(ctx, -w * 0.08, -h * 0.36, w * 0.16, h * 0.73, grad);
    // Glowing runes: a circle on the left page, lines of glyphs on the right.
    glow(ctx, -w * 0.22, 0, m * 0.3, t, 0.4);
    glow(ctx, w * 0.22, 0, m * 0.3, t, 0.3);
    const col = mix(t, '#1a1020', 0.3);
    const wd = Math.max(0.5, m * 0.02);
    circle(ctx, -w * 0.22, 0, m * 0.16, null, col, wd);
    const tri = [0, 1, 2].map((i) => [-w * 0.22 + Math.cos(-Math.PI / 2 + (i * TAU) / 3) * m * 0.16, Math.sin(-Math.PI / 2 + (i * TAU) / 3) * m * 0.16]);
    poly(ctx, tri, null, col, wd);
    circle(ctx, -w * 0.22, 0, m * 0.04, col);
    const gw = Math.max(0.5, m * 0.014);
    for (let r = 0; r < 5; r += 1) {
      const y = -h * 0.22 + r * h * 0.11;
      let x = w * 0.07;
      while (x < w * 0.36) {
        const k = m * (0.018 + rnd() * 0.01);
        const v = Math.floor(rnd() * 5);
        if (v === 0) polyline(ctx, [[x, y + k], [x + k * 0.6, y - k], [x + k * 1.2, y + k]], col, gw);
        else if (v === 1) { line(ctx, x + k * 0.5, y - k, x + k * 0.5, y + k, col, gw); line(ctx, x, y - k * 0.2, x + k, y - k * 0.6, col, gw); }
        else if (v === 2) circle(ctx, x + k * 0.6, y, k * 0.6, null, col, gw);
        else if (v === 3) polyline(ctx, [[x, y - k], [x + k, y - k * 0.2], [x, y + k * 0.4], [x + k, y + k]], col, gw);
        else { line(ctx, x, y, x + k * 1.2, y, col, gw); line(ctx, x + k * 0.6, y - k, x + k * 0.6, y + k, col, gw); }
        x += k * 1.6 + m * 0.018;
      }
    }
    line(ctx, w * 0.05, h * 0.36, w * 0.09, h * 0.47, shade(t, -0.25), Math.max(0.8, m * 0.04), 'butt');
  },
  wizard_desk(g) {
    const { ctx, w, h, m, t, rnd } = g;
    shadow(g, 'rect', w * 0.48, h * 0.46, 0.9);
    planks(g, -w * 0.48, -h * 0.45, w * 0.96, h * 0.9, '#5e3b1f', 3, true);
    rect(ctx, -w * 0.48, -h * 0.45, w * 0.96, h * 0.9, null, '#2e1d0d', Math.max(1, m * 0.045));
    const thin = Math.max(0.5, m * 0.012);
    // An unrolled scroll and two rolled ones.
    ctx.save();
    ctx.translate(-w * 0.33, h * 0.12);
    ctx.rotate(0.25);
    rect(ctx, -m * 0.14, -m * 0.2, m * 0.28, m * 0.4, '#e9dcb4', '#a8905a', thin);
    for (let i = 0; i < 5; i += 1) line(ctx, -m * 0.09, -m * 0.12 + i * m * 0.06, m * 0.09, -m * 0.12 + i * m * 0.06, rgba('#5a4a3a', 0.5), thin);
    ctx.restore();
    for (const [x, y, a] of [[0.24, 0.3, -0.15], [0.31, 0.2, 0.1]]) {
      ctx.save();
      ctx.translate(x * w, y * h);
      ctx.rotate(a);
      rrect(ctx, -m * 0.2, -m * 0.045, m * 0.4, m * 0.09, m * 0.04, lit(ctx, 0, -m * 0.02, m * 0.2, '#ddd0a6', 0.1), '#9a8458', thin);
      circle(ctx, -m * 0.2, 0, m * 0.045, '#c8b88a', '#9a8458', thin);
      line(ctx, -m * 0.02, -m * 0.045, -m * 0.02, m * 0.045, '#a0302a', Math.max(0.5, m * 0.02), 'butt');
      ctx.restore();
    }
    // The open tome.
    ctx.save();
    ctx.translate(-w * 0.04, h * 0.02);
    ctx.rotate(-0.1);
    rect(ctx, -m * 0.27, -m * 0.2, m * 0.54, m * 0.4, '#3a2a4a', '#1e1428', thin);
    for (const s of [-1, 1]) {
      rect(ctx, s > 0 ? m * 0.01 : -m * 0.25, -m * 0.17, m * 0.24, m * 0.34, '#efe6cf', '#a8987a', thin);
      for (let i = 0; i < 5; i += 1) line(ctx, s * m * 0.05, -m * 0.11 + i * m * 0.055, s * m * 0.2, -m * 0.11 + i * m * 0.055, rgba('#3a3040', 0.55), thin);
    }
    circle(ctx, -m * 0.13, m * 0.07, m * 0.05, null, rgba('#8a3a3a', 0.8), thin);
    line(ctx, 0, -m * 0.17, 0, m * 0.17, '#8a7a5a', thin);
    ctx.restore();
    // Inkpot and quill.
    circle(ctx, w * 0.12, -h * 0.27, m * 0.06, '#1a1a2a', '#55556a', thin);
    ctx.save();
    ctx.translate(w * 0.12, -h * 0.27);
    ctx.rotate(-0.6);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(m * 0.12, -m * 0.06, m * 0.3, -m * 0.01);
    ctx.quadraticCurveTo(m * 0.14, m * 0.04, 0, 0);
    ctx.fillStyle = '#ece6da';
    ctx.fill();
    ctx.strokeStyle = '#9a9488';
    ctx.lineWidth = thin;
    ctx.stroke();
    ctx.restore();
    // A skull with a candle stuck on it.
    const sx = -w * 0.35;
    const sy = -h * 0.2;
    oval(ctx, sx, sy, m * 0.1, m * 0.12, 0, lit(ctx, sx, sy, m * 0.12, '#e6dcc2', 0.12), '#8a7f64', thin);
    oval(ctx, sx - m * 0.04, sy + m * 0.05, m * 0.03, m * 0.025, 0, '#2a241c');
    oval(ctx, sx + m * 0.04, sy + m * 0.05, m * 0.03, m * 0.025, 0, '#2a241c');
    candle(g, sx, sy - m * 0.03, m * 0.04);
    // The crystal ball on its stand.
    const bx = w * 0.33;
    const by = -h * 0.12;
    circle(ctx, bx, by, m * 0.13, lit(ctx, bx, by, m * 0.13, '#b8902f', 0.15), '#6a4a14', thin);
    glow(ctx, bx, by, m * 0.2, '#b8a8ff', 0.45);
    circle(ctx, bx, by, m * 0.1, radial(ctx, bx, by, m * 0.1, '#e8e0ff', '#5a4a9a', bx - m * 0.03, by - m * 0.03), '#3a2a6a', thin);
    circle(ctx, bx - m * 0.035, by - m * 0.04, m * 0.025, rgba('#ffffff', 0.8));
    // A potion and a candle in a holder.
    circle(ctx, w * 0.02, -h * 0.3, m * 0.05, lit(ctx, w * 0.02, -h * 0.3, m * 0.05, '#3a8a5a', 0.2), '#1a4a2a', thin);
    circle(ctx, w * 0.02, -h * 0.3, m * 0.02, '#7a5a3a');
    circle(ctx, w * 0.42, h * 0.3, m * 0.07, '#8a8e94', '#4a4e54', thin);
    candle(g, w * 0.42, h * 0.3, m * 0.04);
  },
  node_fire(g) {
    const { ctx, m, rnd } = g;
    // Scorched, cracked ground in a ring, embers in the cracks.
    circle(ctx, 0, 0, m * 0.48, radial(ctx, 0, 0, m * 0.48, 'rgba(26,16,10,0.9)', 'rgba(40,24,12,0)'));
    smoothShape(ctx, blobPoints(0, 0, m * 0.4, m * 0.4, 12, 0.25, rnd), 'rgba(30,18,12,0.65)');
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * TAU + rnd() * 0.4;
      const pts = [];
      for (let k = 0; k <= 4; k += 1) {
        const r = m * (0.17 + k * 0.065);
        const aa = a + (rnd() - 0.5) * 0.35;
        pts.push([Math.cos(aa) * r, Math.sin(aa) * r]);
      }
      polyline(ctx, pts, '#140a06', Math.max(0.8, m * 0.03));
      polyline(ctx, pts, '#ff7b2a', Math.max(0.5, m * 0.01));
    }
    circle(ctx, 0, 0, m * 0.3, null, rgba('#ff7b2a', 0.5), Math.max(0.5, m * 0.012));
    // The ball of fire, floating: licks of flame curling round it.
    const cx = -m * 0.03;
    const cy = -m * 0.04;
    glow(ctx, cx, cy, m * 0.5, '#ff7b2a', 0.55);
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * TAU + rnd() * 0.3;
      const r0 = m * 0.17;
      const r1 = m * (0.26 + rnd() * 0.06);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - 0.35) * r0, cy + Math.sin(a - 0.35) * r0);
      ctx.quadraticCurveTo(cx + Math.cos(a + 0.05) * r1 * 0.9, cy + Math.sin(a + 0.05) * r1 * 0.9, cx + Math.cos(a + 0.45) * r1, cy + Math.sin(a + 0.45) * r1);
      ctx.quadraticCurveTo(cx + Math.cos(a + 0.2) * r0 * 1.05, cy + Math.sin(a + 0.2) * r0 * 1.05, cx + Math.cos(a + 0.35) * r0, cy + Math.sin(a + 0.35) * r0);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? '#e8501a' : '#f58a2a';
      ctx.fill();
    }
    circle(ctx, cx, cy, m * 0.2, radial(ctx, cx, cy, m * 0.2, '#fff4c0', '#e2481a', cx - m * 0.05, cy - m * 0.06));
    circle(ctx, cx, cy, m * 0.13, radial(ctx, cx, cy, m * 0.13, 'rgba(255,250,220,0.95)', 'rgba(255,190,70,0)'));
    for (let i = 0; i < 6; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.28 + rnd() * 0.12);
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * 0.012, '#ffc94a');
    }
  },
  node_frost(g) {
    const { ctx, m, rnd } = g;
    // Frost spread on the ground, with feathery streaks.
    circle(ctx, 0, 0, m * 0.48, radial(ctx, 0, 0, m * 0.48, 'rgba(228,246,255,0.75)', 'rgba(200,235,255,0)'));
    const lw = Math.max(0.5, m * 0.012);
    for (let i = 0; i < 11; i += 1) {
      const a = (i / 11) * TAU + rnd() * 0.3;
      const r1 = m * (0.36 + rnd() * 0.1);
      line(ctx, Math.cos(a) * m * 0.1, Math.sin(a) * m * 0.1, Math.cos(a) * r1, Math.sin(a) * r1, rgba('#ffffff', 0.75), lw);
      for (let k = 1; k < 4; k += 1) {
        const r = m * 0.1 + ((r1 - m * 0.1) * k) / 4;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const l = m * 0.05 * (1 - k / 5);
        line(ctx, x, y, x + Math.cos(a + 0.7) * l, y + Math.sin(a + 0.7) * l, rgba('#ffffff', 0.6), lw);
        line(ctx, x, y, x + Math.cos(a - 0.7) * l, y + Math.sin(a - 0.7) * l, rgba('#ffffff', 0.6), lw);
      }
    }
    // Shards of ice round a bright core.
    glow(ctx, 0, 0, m * 0.45, '#9fe3ff', 0.5);
    crystals(g, 7, m * 0.38, m * 0.11, '#86c6ea');
    crystals(g, 5, m * 0.22, m * 0.08, '#b8e2f8');
    glow(ctx, 0, 0, m * 0.2, '#ffffff', 0.7);
    circle(ctx, 0, 0, m * 0.07, radial(ctx, 0, 0, m * 0.07, '#ffffff', '#b8ecff'));
  },
  node_storm(g) {
    const { ctx, m, rnd } = g;
    circle(ctx, 0, 0, m * 0.48, radial(ctx, 0, 0, m * 0.48, 'rgba(40,30,72,0.5)', 'rgba(40,30,72,0)'));
    // Wind swirling round.
    for (let s = 0; s < 4; s += 1) {
      const pts = [];
      const a0 = (s / 4) * TAU + rnd() * 0.5;
      for (let i = 0; i <= 14; i += 1) {
        const k = i / 14;
        pts.push([Math.cos(a0 + k * 1.7) * m * (0.45 - k * 0.12), Math.sin(a0 + k * 1.7) * m * (0.45 - k * 0.12)]);
      }
      polyline(ctx, pts, rgba('#e8e4f4', 0.5), Math.max(0.6, m * 0.022));
    }
    glow(ctx, 0, 0, m * 0.46, '#c8b8ff', 0.5);
    // The crackling sphere and its lightning.
    circle(ctx, 0, 0, m * 0.17, radial(ctx, 0, 0, m * 0.17, '#f4f0ff', '#5a4ab0', -m * 0.04, -m * 0.05), rgba('#2a2050', 0.8), Math.max(0.5, m * 0.015));
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + rnd() * 0.6;
      const pts = [[Math.cos(a) * m * 0.12, Math.sin(a) * m * 0.12]];
      let r = m * 0.12;
      let side = 1;
      while (r < m * 0.42) {
        r += m * (0.05 + rnd() * 0.04);
        side = -side;
        const aa = a + side * (0.12 + rnd() * 0.15);
        pts.push([Math.cos(aa) * Math.min(r, m * 0.45), Math.sin(aa) * Math.min(r, m * 0.45)]);
      }
      polyline(ctx, pts, rgba('#c8b8ff', 0.55), Math.max(1, m * 0.045));
      polyline(ctx, pts, '#ffffff', Math.max(0.5, m * 0.014));
    }
    circle(ctx, -m * 0.05, -m * 0.06, m * 0.05, rgba('#ffffff', 0.85));
  },
  node_earth(g) {
    const { ctx, m, rnd } = g;
    // Broken ground: a dark patch of earth split by glowing cracks.
    smoothShape(ctx, blobPoints(0, 0, m * 0.45, m * 0.43, 12, 0.22, rnd), rgba('#3e3024', 0.6));
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * TAU + rnd() * 0.5;
      const pts = [];
      for (let k = 0; k <= 4; k += 1) {
        const r = m * (0.12 + k * 0.08);
        const aa = a + (rnd() - 0.5) * 0.45;
        pts.push([Math.cos(aa) * r, Math.sin(aa) * r]);
      }
      polyline(ctx, pts, '#1a120a', Math.max(1, m * 0.045));
      polyline(ctx, pts, rgba('#ffb040', 0.35), Math.max(1, m * 0.03));
      polyline(ctx, pts, '#ffc860', Math.max(0.5, m * 0.01));
    }
    // The glowing core.
    glow(ctx, 0, 0, m * 0.36, '#e8b840', 0.6);
    circle(ctx, 0, 0, m * 0.13, radial(ctx, 0, 0, m * 0.13, '#fff4b0', '#5e9a28', -m * 0.04, -m * 0.04), '#2e4a12', Math.max(0.5, m * 0.015));
    circle(ctx, -m * 0.04, -m * 0.045, m * 0.03, rgba('#ffffff', 0.7));
    // Rocks floating round it, each with its shadow on the ground.
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU + rnd() * 0.5;
      const d = m * (0.3 + rnd() * 0.04);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const r = m * (0.09 + rnd() * 0.035);
      if (g.shadows) oval(ctx, x + g.sx * 1.6, y + g.sy * 1.6, r, r * 0.8, 0, 'rgba(0,0,0,0.32)');
      stone(g, x, y, r, r * 0.85, '#8e7e66', 7, 0.35);
      polyline(ctx, [[x - r * 0.45, y + r * 0.15], [x - r * 0.05, y - r * 0.05], [x + r * 0.3, y - r * 0.3]], rgba('#ffc048', 0.9), Math.max(0.5, m * 0.014));
    }
  },
  bone_throne(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.45, h * 0.46, 1.5);
    const bone = '#e6dcc2';
    const bd = '#857a60';
    const lw = Math.max(0.5, m * 0.014);
    const B = (x1, y1, x2, y2, wd) => {
      line(ctx, x1, y1, x2, y2, bd, wd + lw * 2);
      for (const [x, y] of [[x1, y1], [x2, y2]]) circle(ctx, x, y, wd * 0.75, bone, bd, lw);
      line(ctx, x1, y1, x2, y2, bone, wd);
    };
    const skull = (x, y, r) => {
      oval(ctx, x, y, r * 0.88, r, 0, lit(ctx, x, y, r, bone, 0.14), bd, lw);
      oval(ctx, x - r * 0.36, y + r * 0.28, r * 0.26, r * 0.22, 0, '#2a241c');
      oval(ctx, x + r * 0.36, y + r * 0.28, r * 0.26, r * 0.22, 0, '#2a241c');
      poly(ctx, [[x, y + r * 0.5], [x + r * 0.1, y + r * 0.68], [x - r * 0.1, y + r * 0.68]], '#2a241c');
    };
    // Spiky back: bones fanning out behind the seat.
    for (let i = 0; i < 9; i += 1) {
      const a = -Math.PI / 2 + (i - 4) * 0.3;
      B(Math.cos(a) * m * 0.12, -h * 0.17 + Math.sin(a) * m * 0.1, Math.cos(a) * m * 0.44, -h * 0.17 + Math.sin(a) * m * 0.3, m * 0.04);
    }
    // The seat: a shaggy dark pelt thrown over it, a bone across the front.
    smoothShape(ctx, blobPoints(0, h * 0.05, w * 0.28, h * 0.27, 16, 0.2, rnd), lit(ctx, 0, h * 0.02, m * 0.32, '#4e3e32', 0.12), '#1e1610', lw);
    for (let i = 0; i < 28; i += 1) {
      const x = (rnd() - 0.5) * w * 0.42;
      const y = h * 0.05 + (rnd() - 0.5) * h * 0.4;
      line(ctx, x, y, x + (rnd() - 0.5) * m * 0.04, y + m * (0.03 + rnd() * 0.03), rgba(rnd() < 0.5 ? '#6e5c4c' : '#241a12', 0.7), Math.max(0.5, m * 0.012));
    }
    B(-w * 0.28, h * 0.34, w * 0.28, h * 0.34, m * 0.045);
    // A row of skulls along the back.
    for (let i = 0; i < 5; i += 1) skull(-w * 0.28 + (w * 0.56 * i) / 4, -h * 0.25 + (i % 2 ? 0.02 : 0) * h, m * 0.085);
    // Arms of long bones, a skull at each front end.
    for (const s of [-1, 1]) {
      B(s * w * 0.4, -h * 0.16, s * w * 0.4, h * 0.25, m * 0.035);
      B(s * w * 0.32, -h * 0.2, s * w * 0.32, h * 0.3, m * 0.055);
      skull(s * w * 0.35, h * 0.36, m * 0.09);
    }
  },
  skull_candles(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.4, m * 0.42, 0.7);
    const bone = '#d2c196';
    const bd = '#7a6a48';
    const wax = '#f7f2e6';
    const lw = Math.max(0.5, m * 0.03);
    // Wax pooled round it.
    smoothShape(ctx, blobPoints(0, m * 0.06, m * 0.4, m * 0.36, 10, 0.35, rnd), '#ece4cc', '#b8aa88', lw * 0.6);
    // The skull, its face to the front.
    oval(ctx, 0, m * 0.03, m * 0.3, m * 0.36, 0, lit(ctx, 0, m * 0.03, m * 0.36, bone, 0.12), bd, lw);
    oval(ctx, -m * 0.12, m * 0.2, m * 0.085, m * 0.07, 0, '#2a241c');
    oval(ctx, m * 0.12, m * 0.2, m * 0.085, m * 0.07, 0, '#2a241c');
    poly(ctx, [[0, m * 0.26], [m * 0.035, m * 0.33], [-m * 0.035, m * 0.33]], '#2a241c');
    // Drips of wax running down it, then the candles.
    for (let i = 0; i < 5; i += 1) {
      const x = (rnd() - 0.5) * m * 0.36;
      const y0 = -m * 0.12 + rnd() * m * 0.05;
      const y1 = y0 + m * (0.1 + rnd() * 0.16);
      line(ctx, x, y0, x + (rnd() - 0.5) * m * 0.04, y1, wax, Math.max(0.8, m * 0.05));
      circle(ctx, x, y1, m * 0.035, wax);
    }
    candle(g, -m * 0.1, -m * 0.1, m * 0.08);
    candle(g, m * 0.11, -m * 0.06, m * 0.07);
    candle(g, m * 0.01, -m * 0.21, m * 0.065);
  },
  golem(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.46, m * 0.44, 2.6);
    const st = '#7f7a70';
    const dk = '#3f3b36';
    const rune = '#5fe0d0';
    const lw = Math.max(0.6, m * 0.012);
    // Fists resting on the ground in front, forearms up to the shoulders.
    for (const s of [-1, 1]) {
      stone(g, s * m * 0.315, m * 0.09, m * 0.1, m * 0.15, shade(st, -0.07), 8, 0.18);
      rrect(ctx, s * m * 0.33 - m * 0.11, m * 0.19, m * 0.22, m * 0.2, m * 0.05, lit(ctx, s * m * 0.33, m * 0.27, m * 0.14, st, 0.12), dk, lw);
      for (let k = 1; k < 4; k += 1) line(ctx, s * m * 0.33 - m * 0.11 + (m * 0.22 * k) / 4, m * 0.3, s * m * 0.33 - m * 0.11 + (m * 0.22 * k) / 4, m * 0.38, rgba(dk, 0.7), lw);
    }
    // The broad back, a rune glowing on it.
    rrect(ctx, -m * 0.21, -m * 0.38, m * 0.42, m * 0.44, m * 0.08, lit(ctx, 0, -m * 0.2, m * 0.35, st, 0.1), dk, lw);
    line(ctx, -m * 0.12, -m * 0.3, -m * 0.04, -m * 0.24, rgba(dk, 0.6), lw);
    line(ctx, m * 0.1, -m * 0.08, m * 0.16, -m * 0.02, rgba(dk, 0.6), lw);
    // Shoulders like boulders.
    for (const s of [-1, 1]) stone(g, s * m * 0.27, -m * 0.1, m * 0.19, m * 0.17, shade(st, 0.03), 8, 0.2);
    glow(ctx, 0, -m * 0.18, m * 0.2, rune, 0.55);
    const rw = Math.max(0.8, m * 0.016);
    circle(ctx, 0, -m * 0.18, m * 0.085, null, rune, rw);
    poly(ctx, [[0, -m * 0.24], [m * 0.04, -m * 0.18], [0, -m * 0.12], [-m * 0.04, -m * 0.18]], null, rune, rw);
    circle(ctx, 0, -m * 0.18, m * 0.012, rune);
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * TAU + Math.PI / 4;
      line(ctx, Math.cos(a) * m * 0.1, -m * 0.18 + Math.sin(a) * m * 0.1, Math.cos(a) * m * 0.125, -m * 0.18 + Math.sin(a) * m * 0.125, rune, rw);
    }
    // The block head, low and forward, eyes glowing.
    rrect(ctx, -m * 0.1, m * 0.02, m * 0.2, m * 0.17, m * 0.03, lit(ctx, 0, m * 0.08, m * 0.14, shade(st, -0.03), 0.12), dk, lw);
    for (const s of [-1, 1]) {
      glow(ctx, s * m * 0.045, m * 0.17, m * 0.05, rune, 0.6);
      rect(ctx, s * m * 0.045 - m * 0.025, m * 0.16, m * 0.05, m * 0.016, rune);
    }
    // Moss on the stone.
    for (let i = 0; i < 6; i += 1) circle(ctx, (rnd() - 0.5) * m * 0.7, -m * 0.18 + (rnd() - 0.5) * m * 0.2, m * (0.015 + rnd() * 0.02), rgba('#5f7a3a', 0.65));
  },
  floating_stones(g) {
    const { ctx, m, rnd } = g;
    const spots = [[-0.22, -0.2, 0.15], [0.21, -0.17, 0.12], [0.07, 0.2, 0.16], [-0.25, 0.19, 0.09], [0.3, 0.17, 0.07]];
    const rocks = spots.map(([x, y, r]) => ({ x: (x + (rnd() - 0.5) * 0.05) * m, y: (y + (rnd() - 0.5) * 0.05) * m, r: r * m }));
    // Their shadows, far below on the ground.
    if (g.shadows) {
      for (const p of rocks) {
        oval(ctx, p.x + g.sx * 5, p.y + g.sy * 5, p.r * 1.1, p.r * 0.95, 0, 'rgba(0,0,0,0.1)');
        oval(ctx, p.x + g.sx * 5, p.y + g.sy * 5, p.r * 0.85, p.r * 0.72, 0, 'rgba(0,0,0,0.14)');
      }
    }
    rocks.forEach((p, i) => {
      glow(ctx, p.x, p.y, p.r * 1.9, '#9fdcff', 0.42);
      oval(ctx, p.x + p.r * 0.07, p.y + p.r * 0.09, p.r * 1.03, p.r * 0.9, 0, rgba('#c4ecff', 0.6));
      stone(g, p.x, p.y, p.r, p.r * 0.85, '#80796f', 8, 0.3);
      if (p.r > m * 0.1) smoothShape(ctx, blobPoints(p.x - p.r * 0.2, p.y - p.r * 0.25, p.r * 0.45, p.r * 0.32, 6, 0.4, rnd), rgba('#5f7d3a', 0.8));
      if (i === 2) {
        const k = p.r * 0.3;
        polyline(ctx, [[p.x + k * 0.3, p.y + k], [p.x + k, p.y - k * 0.2], [p.x + k * 1.7, p.y + k]], '#bfe8ff', Math.max(0.6, m * 0.012));
      }
    });
    // Pebbles and motes of light drifting between them.
    for (let i = 0; i < 3; i += 1) {
      const x = (rnd() - 0.5) * m * 0.3;
      const y = (rnd() - 0.5) * m * 0.2;
      glow(ctx, x, y, m * 0.05, '#9fdcff', 0.4);
      stone(g, x, y, m * 0.025, m * 0.021, '#8a8378', 6, 0.3);
    }
    for (let i = 0; i < 10; i += 1) circle(ctx, (rnd() - 0.5) * m * 0.8, (rnd() - 0.5) * m * 0.8, Math.max(0.5, m * 0.007), rgba('#e4f6ff', 0.9));
  },
  blood_altar(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.48, h * 0.44, 1);
    const st = '#403b41';
    const dk = '#1a171b';
    const blood = '#9a1a20';
    const lw = Math.max(0.6, m * 0.03);
    // Blood pooled on the floor where it ran off the front.
    const dx = (rnd() < 0.5 ? -1 : 1) * w * (0.08 + rnd() * 0.2);
    smoothShape(ctx, blobPoints(dx + m * 0.04, h * 0.47, m * 0.17, m * 0.045, 10, 0.45, rnd), rgba('#5e0a0e', 0.9));
    // The dark slab, bevelled.
    rect(ctx, -w * 0.48, -h * 0.44, w * 0.96, h * 0.88, lit(ctx, 0, 0, w * 0.55, st, 0.08), dk, lw);
    const b = m * 0.05;
    poly(ctx, [[-w * 0.48, -h * 0.44], [w * 0.48, -h * 0.44], [w * 0.48 - b, -h * 0.44 + b], [-w * 0.48 + b, -h * 0.44 + b]], rgba('#ffffff', 0.12));
    poly(ctx, [[w * 0.48, -h * 0.44], [w * 0.48, h * 0.44], [w * 0.48 - b, h * 0.44 - b], [w * 0.48 - b, -h * 0.44 + b]], rgba('#000000', 0.2));
    // Channels cut round the top and in to a basin, running with blood.
    const gx = w * 0.37;
    const gy = h * 0.27;
    const chan = (pts) => {
      polyline(ctx, pts, '#110e11', Math.max(1, m * 0.07));
      polyline(ctx, pts, blood, Math.max(0.6, m * 0.035));
    };
    chan([[-gx, -gy], [gx, -gy], [gx, gy], [-gx, gy], [-gx, -gy]]);
    chan([[-gx, 0], [gx, 0]]);
    circle(ctx, 0, 0, m * 0.15, '#110e11');
    circle(ctx, 0, 0, m * 0.125, radial(ctx, 0, 0, m * 0.125, '#c42a30', '#6a0a10', -m * 0.04, -m * 0.04));
    circle(ctx, -m * 0.04, -m * 0.04, m * 0.025, rgba('#ffffff', 0.35));
    // Stains, and runs over the front edge.
    for (let i = 0; i < 3; i += 1) smoothShape(ctx, blobPoints((rnd() - 0.5) * w * 0.6, (rnd() - 0.5) * h * 0.5, m * (0.05 + rnd() * 0.05), m * (0.04 + rnd() * 0.04), 8, 0.6, rnd), rgba('#7a0c12', 0.7));
    smoothShape(ctx, blobPoints(dx, h * 0.37, m * 0.05, m * 0.085, 8, 0.45, rnd), rgba('#7a0c12', 0.9));
    // The ritual dagger: a wavy blade.
    ctx.save();
    ctx.translate(-w * 0.27, h * 0.135);
    ctx.rotate(-0.12);
    const blade = [[0, -m * 0.035]];
    for (let i = 1; i <= 6; i += 1) blade.push([m * 0.05 * i, -m * 0.03 + (i % 2 ? -1 : 1) * m * 0.012]);
    blade.push([m * 0.36, 0]);
    for (let i = 6; i >= 1; i -= 1) blade.push([m * 0.05 * i, m * 0.03 + (i % 2 ? 1 : -1) * m * 0.012]);
    blade.push([0, m * 0.035]);
    poly(ctx, blade, radial(ctx, m * 0.15, -m * 0.02, m * 0.25, '#e2e6ec', '#8a9098'), '#3a3e44', Math.max(0.5, m * 0.012));
    line(ctx, 0, -m * 0.08, 0, m * 0.08, '#8a6a2a', Math.max(0.8, m * 0.04));
    line(ctx, -m * 0.15, 0, 0, 0, '#1e1a1a', Math.max(1, m * 0.055));
    circle(ctx, -m * 0.16, 0, m * 0.038, lit(ctx, -m * 0.16, 0, m * 0.038, '#c0392b', 0.25), '#4a0a0a', Math.max(0.5, m * 0.01));
    ctx.restore();
    // Black candles at the corners.
    for (const [x, y] of [[-w * 0.415, -h * 0.32], [w * 0.415, -h * 0.32], [-w * 0.415, h * 0.3], [w * 0.415, h * 0.3]]) {
      glow(ctx, x, y, m * 0.14, '#ffb04a', 0.4);
      circle(ctx, x, y, m * 0.065, '#18161a', '#55505a', Math.max(0.5, m * 0.014));
      circle(ctx, x, y, m * 0.034, '#ffb43a');
      circle(ctx, x, y, m * 0.016, '#fff2c0');
    }
  },
  orrery(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.44, m * 0.44, 1.2);
    const brass = '#c8973a';
    const bd = '#6a4a14';
    const lw = Math.max(0.5, m * 0.012);
    // A tripod and its base.
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TAU + Math.PI / 2;
      line(ctx, 0, 0, Math.cos(a) * m * 0.46, Math.sin(a) * m * 0.46, bd, Math.max(1, m * 0.045));
      line(ctx, 0, 0, Math.cos(a) * m * 0.46, Math.sin(a) * m * 0.46, brass, Math.max(0.6, m * 0.025));
      circle(ctx, Math.cos(a) * m * 0.46, Math.sin(a) * m * 0.46, m * 0.03, brass, bd, lw);
    }
    circle(ctx, 0, 0, m * 0.15, lit(ctx, 0, 0, m * 0.15, '#5e3b1f', 0.1), '#2e1d0d', lw);
    // Rings, each carrying a planet on an arm.
    const rings = [0.2, 0.29, 0.38, 0.45];
    for (const r of rings) {
      circle(ctx, 0, 0, m * r, null, bd, Math.max(0.8, m * 0.02));
      circle(ctx, 0, 0, m * r, null, brass, Math.max(0.5, m * 0.01));
    }
    const planets = [['#b8b0a0', 0.03], ['#c0503a', 0.04], ['#4a7ab8', 0.05], ['#c8a060', 0.045]];
    rings.forEach((r, i) => {
      const a = rnd() * TAU;
      const x = Math.cos(a) * m * r;
      const y = Math.sin(a) * m * r;
      line(ctx, 0, 0, x, y, brass, Math.max(0.5, m * 0.012));
      const [c, pr] = planets[i];
      if (i === 3) oval(ctx, x, y, m * pr * 1.9, m * pr * 0.6, a + 0.5, null, '#e0c890', Math.max(0.5, m * 0.012));
      circle(ctx, x, y, m * pr, lit(ctx, x, y, m * pr, c, 0.22), shade(c, -0.4), lw);
      if (i === 2) circle(ctx, x + Math.cos(a + 2) * m * 0.075, y + Math.sin(a + 2) * m * 0.075, m * 0.015, '#d8d8d0');
    });
    // The sun in the middle.
    glow(ctx, 0, 0, m * 0.2, '#ffc84a', 0.45);
    circle(ctx, 0, 0, m * 0.09, lit(ctx, 0, 0, m * 0.09, '#f0b030', 0.25), bd, lw);
  },
};
