/**
 * Built-in assets of the map creator: furniture, the kitchen and the tavern (map-design.js ASSETS), drawn
 * in code like the rest (map-art-assets.js, which merges these in).
 */
import { TAU, shade, rgba, circle, oval, rect, rrect, poly, line, polyline, smoothShape, radial, glow } from './map-paint.js';
import { shadow, lit, planks, candle, coin, book } from './map-art-pieces.js';

export const ART_FURNITURE = {
  bunk_bed(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.44, h * 0.47, 2.2);
    const lw = Math.max(0.6, m * 0.03);
    const x0 = -w * 0.47;
    const x1 = w * 0.27;
    const y0 = -h * 0.47;
    const y1 = h * 0.47;
    const f = m * 0.07;
    // The ladder up to the top bunk, hooked on the open side.
    const lx0 = x1 + m * 0.04;
    const lx1 = w * 0.44;
    for (let i = 0; i < 5; i += 1) line(ctx, lx0, h * (0.03 + i * 0.09), lx1, h * (0.03 + i * 0.09), '#a07a4a', Math.max(0.8, m * 0.045), 'butt');
    for (const x of [lx0, lx1]) line(ctx, x, -h * 0.02, x, h * 0.43, '#5e3b1f', Math.max(1, m * 0.06));
    // Frame, mattress, pillow, blanket (with a barracks stripe).
    rect(ctx, x0, y0, x1 - x0, y1 - y0, '#5e3b1f', '#3a2410', lw);
    rect(ctx, x0 + f, y0 + f, x1 - x0 - f * 2, y1 - y0 - f * 2, '#d9d1c3');
    rrect(ctx, x0 + f * 1.7, y0 + f * 1.4, x1 - x0 - f * 3.4, h * 0.12, m * 0.07, '#f2ede3', '#c9c1b3', Math.max(0.5, m * 0.02));
    rect(ctx, x0 + f, -h * 0.16, x1 - x0 - f * 2, y1 - f + h * 0.16, lit(ctx, -w * 0.1, h * 0.1, m * 0.8, t, 0.08));
    rect(ctx, x0 + f, -h * 0.16, x1 - x0 - f * 2, h * 0.05, '#efe9de');
    for (const y of [h * 0.3, h * 0.34]) line(ctx, x0 + f, y, x1 - f, y, shade(t, -0.18), Math.max(0.5, m * 0.025), 'butt');
    // Guard rail along the open side, and the four tall corner posts.
    rect(ctx, x1 - f * 1.3, y0 + f, f * 1.3, h * 0.44, '#6e4a2a', '#3a2410', Math.max(0.5, m * 0.02));
    const s = m * 0.13;
    for (const [x, y] of [[x0, y0], [x1 - s, y0], [x0, y1 - s], [x1 - s, y1 - s]]) rect(ctx, x, y, s, s, lit(ctx, x + s / 2, y + s / 2, s, '#7a5232', 0.15), '#2e1d0d', Math.max(0.5, m * 0.025));
  },
  cot(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.42, h * 0.46, 0.5);
    const lw = Math.max(0.5, m * 0.025);
    const px = w * 0.37;
    // Crossbars at the ends, under the canvas.
    for (const y of [-h * 0.45, h * 0.45]) line(ctx, -px, y, px, y, '#4a2f17', Math.max(0.8, m * 0.06), 'butt');
    // Canvas, sagging a little in the middle.
    const sag = ctx.createLinearGradient(-px, 0, px, 0);
    sag.addColorStop(0, '#bcae84');
    sag.addColorStop(0.45, '#9a8d66');
    sag.addColorStop(0.75, '#ada074');
    sag.addColorStop(1, '#a09270');
    rect(ctx, -px, -h * 0.43, px * 2, h * 0.86, sag, '#6e6448', lw);
    for (const s of [-1, 1]) line(ctx, s * px * 0.8, -h * 0.43, s * px * 0.8, h * 0.43, rgba('#6e6448', 0.55), Math.max(0.5, m * 0.012));
    // Side poles, running past the canvas at both ends.
    for (const s of [-1, 1]) {
      line(ctx, s * px, -h * 0.48, s * px, h * 0.48, '#6e4a2a', Math.max(1, m * 0.09));
      line(ctx, s * px - m * 0.015, -h * 0.47, s * px - m * 0.015, h * 0.47, rgba('#ffffff', 0.18), Math.max(0.5, m * 0.02));
    }
    // A rolled blanket tied with cord, at the head.
    const by = -h * 0.33;
    const br = h * 0.055;
    const roll = ctx.createLinearGradient(0, by - br, 0, by + br);
    roll.addColorStop(0, '#9a5242');
    roll.addColorStop(0.35, '#84402f');
    roll.addColorStop(1, '#4e2219');
    rrect(ctx, -px * 0.84, by - br, px * 1.68, br * 2, br, roll, '#3a1a12', lw);
    for (const x of [-px * 0.45, px * 0.45]) line(ctx, x, by - br, x, by + br, '#d8c8a0', Math.max(0.6, m * 0.03), 'butt');
  },
  nightstand(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.44, h * 0.44, 0.9);
    const lw = Math.max(0.6, m * 0.04);
    // The drawer front shows at the front edge, with its knob.
    rect(ctx, -w * 0.42, h * 0.26, w * 0.84, h * 0.2, '#5a3a1e', '#3a2410', lw);
    circle(ctx, 0, h * 0.37, m * 0.055, '#d4a72c', '#7a5a14', Math.max(0.5, m * 0.015));
    // The top.
    rect(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.74, lit(ctx, 0, -h * 0.1, m * 0.7, '#7a4f2a', 0.08), '#4a2f17', lw);
    rect(ctx, -w * 0.38, -h * 0.38, w * 0.76, h * 0.58, null, rgba('#4a2f17', 0.45), Math.max(0.5, m * 0.015));
    // A book, and a candle in its dish.
    book(ctx, w * 0.15, h * 0.02, m * 0.28, m * 0.36, '#7b2f34', 0.35);
    const cx = -w * 0.17;
    const cy = -h * 0.15;
    circle(ctx, cx + m * 0.17, cy, m * 0.05, null, '#b8902f', Math.max(0.5, m * 0.025));
    circle(ctx, cx, cy, m * 0.15, lit(ctx, cx, cy, m * 0.15, '#c9a040', 0.15), '#7a5a14', Math.max(0.5, m * 0.02));
    candle(g, cx, cy, m * 0.085);
  },
  dresser(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.45, 1.1);
    const lw = Math.max(0.6, m * 0.04);
    const thin = Math.max(0.5, m * 0.015);
    // Drawer fronts along the front edge, two pulls each.
    rect(ctx, -w * 0.46, h * 0.2, w * 0.92, h * 0.26, '#5a3a1e', '#3a2410', lw);
    for (let i = 0; i < 3; i += 1) {
      const x = -w * 0.46 + (w * 0.92 * (i + 0.5)) / 3;
      if (i) line(ctx, -w * 0.46 + (w * 0.92 * i) / 3, h * 0.22, -w * 0.46 + (w * 0.92 * i) / 3, h * 0.45, '#3a2410', Math.max(0.5, m * 0.025), 'butt');
      for (const s of [-1, 1]) rrect(ctx, x + s * w * 0.075 - m * 0.05, h * 0.3, m * 0.1, h * 0.07, m * 0.02, '#d4a72c', '#7a5a14', thin);
    }
    // The top.
    planks(g, -w * 0.49, -h * 0.46, w * 0.98, h * 0.68, '#7a4f2a', 2, true);
    rect(ctx, -w * 0.49, -h * 0.46, w * 0.98, h * 0.68, null, '#4a2f17', lw);
    // A wash bowl and jug on the left.
    const bx = -w * 0.25;
    const by = -h * 0.12;
    circle(ctx, bx, by, m * 0.25, '#ece6da', '#9a9284', Math.max(0.5, m * 0.02));
    circle(ctx, bx, by, m * 0.18, radial(ctx, bx, by, m * 0.18, '#a8d0e0', '#6f9fba'));
    oval(ctx, bx - m * 0.06, by - m * 0.07, m * 0.06, m * 0.025, -0.5, rgba('#ffffff', 0.6));
    const jx = -w * 0.04;
    const jy = -h * 0.16;
    circle(ctx, jx + m * 0.13, jy, m * 0.045, null, '#d8d0c0', Math.max(0.6, m * 0.03));
    poly(ctx, [[jx - m * 0.08, jy - m * 0.04], [jx - m * 0.17, jy], [jx - m * 0.08, jy + m * 0.04]], '#e4ddd0', '#9a9284', thin);
    circle(ctx, jx, jy, m * 0.12, lit(ctx, jx, jy, m * 0.12, '#e8e2d6', 0.12), '#9a9284', Math.max(0.5, m * 0.02));
    circle(ctx, jx, jy, m * 0.06, '#3a5a7a');
    // A hand mirror and a little jewel box on the right.
    const mx = w * 0.2;
    const my = -h * 0.12;
    line(ctx, mx, my, mx + m * 0.2, my + m * 0.14, '#b8902f', Math.max(0.8, m * 0.05));
    circle(ctx, mx, my, m * 0.12, '#d4a72c', '#7a5a14', thin);
    circle(ctx, mx, my, m * 0.085, radial(ctx, mx, my, m * 0.085, '#eef4f6', '#8aa0b0', mx - m * 0.03, my - m * 0.03));
    rect(ctx, w * 0.33, -h * 0.3, m * 0.24, m * 0.18, lit(ctx, w * 0.33 + m * 0.12, -h * 0.3 + m * 0.09, m * 0.2, '#7b2f34', 0.12), '#3a1418', thin);
    rect(ctx, w * 0.33 + m * 0.1, -h * 0.3 + m * 0.13, m * 0.04, m * 0.05, '#d4a72c');
  },
  mirror(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.44, h * 0.34, 1.8);
    // Uprights on their feet at both ends.
    for (const s of [-1, 1]) rrect(ctx, s * w * 0.43 - m * 0.07, -h * 0.42, m * 0.14, h * 0.84, m * 0.05, '#5e3b1f', '#3a2410', Math.max(0.5, m * 0.03));
    // The glass, tipped back in its gilt frame.
    oval(ctx, 0, 0, w * 0.39, h * 0.42, 0, lit(ctx, 0, 0, w * 0.4, '#c9a040', 0.16), '#7a5a14', Math.max(0.5, m * 0.03));
    const glass = ctx.createLinearGradient(-w * 0.3, -h * 0.35, w * 0.3, h * 0.35);
    glass.addColorStop(0, '#f2f7f9');
    glass.addColorStop(0.5, '#a8bccb');
    glass.addColorStop(1, '#6a8094');
    oval(ctx, 0, 0, w * 0.33, h * 0.32, 0, glass, '#6a5214', Math.max(0.5, m * 0.02));
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.33, h * 0.32, 0, 0, TAU);
    ctx.clip();
    line(ctx, -w * 0.18, h * 0.36, w * 0.02, -h * 0.36, rgba('#ffffff', 0.65), Math.max(0.8, m * 0.09));
    line(ctx, -w * 0.02, h * 0.36, w * 0.14, -h * 0.36, rgba('#ffffff', 0.4), Math.max(0.6, m * 0.04));
    ctx.restore();
    for (const s of [-1, 1]) circle(ctx, s * w * 0.4, 0, m * 0.07, '#d4a72c', '#7a5a14', Math.max(0.5, m * 0.02));
  },
  cradle(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.4, h * 0.44, 0.8);
    const lw = Math.max(0.6, m * 0.04);
    // Curved rockers under each end, wider than the cradle.
    for (const y of [-h * 0.32, h * 0.34]) rrect(ctx, -w * 0.48, y - m * 0.05, w * 0.96, m * 0.1, m * 0.05, '#5e3b1f', '#3a2410', Math.max(0.5, m * 0.03));
    // The basket, with a soft lining.
    rrect(ctx, -w * 0.39, -h * 0.46, w * 0.78, h * 0.92, m * 0.2, lit(ctx, 0, -h * 0.1, h * 0.55, '#8a5a30', 0.1), '#4a2f17', lw);
    rrect(ctx, -w * 0.3, -h * 0.37, w * 0.6, h * 0.76, m * 0.13, '#efe8da', rgba('#4a2f17', 0.5), Math.max(0.5, m * 0.015));
    // Pillow and blanket.
    rrect(ctx, -w * 0.2, -h * 0.2, w * 0.4, h * 0.13, m * 0.06, '#fbf8f1', '#cfc6b4', Math.max(0.5, m * 0.015));
    rrect(ctx, -w * 0.3, -h * 0.04, w * 0.6, h * 0.43, m * 0.12, lit(ctx, 0, h * 0.14, m * 0.5, '#9ab8d6', 0.1));
    rect(ctx, -w * 0.3, -h * 0.04, w * 0.6, h * 0.06, '#f4f0e6');
    // A cloth hood over the head end, gathered in folds, with a frilled edge.
    ctx.save();
    rrect(ctx, -w * 0.39, -h * 0.46, w * 0.78, h * 0.92, m * 0.2, null);
    ctx.clip();
    const hy = -h * 0.47;
    const hrx = w * 0.42;
    const hry = h * 0.26;
    oval(ctx, 0, hy, hrx, hry, 0, lit(ctx, -w * 0.12, -h * 0.4, w * 0.45, '#86a4c4', 0.12), '#4a6a8a', lw);
    for (let i = 1; i < 6; i += 1) {
      const a = (i / 6) * Math.PI;
      line(ctx, 0, hy, Math.cos(a) * hrx * 0.95, hy + Math.sin(a) * hry * 0.95, rgba('#3e5a78', 0.55), Math.max(0.5, m * 0.02));
    }
    for (let i = 0; i <= 8; i += 1) {
      const a = 0.12 * Math.PI + (i / 8) * 0.76 * Math.PI;
      circle(ctx, Math.cos(a) * hrx, hy + Math.sin(a) * hry, m * 0.035, '#f6f2ea');
    }
    ctx.restore();
  },
  trunk(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.47, h * 0.44, 0.9);
    const lw = Math.max(0.6, m * 0.04);
    const thin = Math.max(0.5, m * 0.015);
    // Leather handles at the ends.
    for (const s of [-1, 1]) rrect(ctx, s * w * 0.47 - m * 0.04, -h * 0.14, m * 0.08, h * 0.28, m * 0.03, '#3a2414');
    // The rounded lid, lit along its curve.
    const lid = ctx.createLinearGradient(0, -h * 0.42, 0, h * 0.42);
    lid.addColorStop(0, '#7e5232');
    lid.addColorStop(0.3, '#9a6a44');
    lid.addColorStop(0.65, '#6e4428');
    lid.addColorStop(1, '#4a2c18');
    rrect(ctx, -w * 0.45, -h * 0.42, w * 0.9, h * 0.84, m * 0.05, lid, '#2e1a0c', lw);
    // Wooden slats along the lid.
    for (const y of [-h * 0.2, h * 0.2]) line(ctx, -w * 0.45, y, w * 0.45, y, rgba('#2e1a0c', 0.5), Math.max(0.5, m * 0.02), 'butt');
    // Straps with buckles.
    for (const x of [-w * 0.22, w * 0.22]) {
      rect(ctx, x - m * 0.06, -h * 0.42, m * 0.12, h * 0.84, '#3e2414');
      rect(ctx, x - m * 0.08, h * 0.1, m * 0.16, h * 0.13, null, '#d4a72c', Math.max(0.6, m * 0.03));
    }
    // Brass corner brackets, riveted, and the lock.
    const c = m * 0.22;
    const k = m * 0.075;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * w * 0.45;
      const y = sy * h * 0.42;
      poly(ctx, [[x, y], [x - sx * c, y], [x - sx * c, y - sy * k], [x - sx * k, y - sy * k], [x - sx * k, y - sy * c], [x, y - sy * c]], '#c9a040', '#7a5a14', thin);
      circle(ctx, x - sx * k * 0.5, y - sy * k * 0.5, m * 0.018, '#7a5a14');
    }
    rect(ctx, -m * 0.07, h * 0.26, m * 0.14, h * 0.16, '#d4a72c', '#7a5a14', thin);
    circle(ctx, 0, h * 0.34, m * 0.022, '#2a1a0a');
  },
  screen(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.46, h * 0.36, 1.8);
    const thin = Math.max(0.5, m * 0.025);
    // Four painted panels standing in a zigzag: each face shows under its top rail.
    const n = 4;
    const top = [];
    for (let i = 0; i <= n; i += 1) top.push([-w * 0.46 + (w * 0.92 * i) / n, -h * 0.4 + (i % 2 ? h * 0.26 : 0)]);
    const fh = h * 0.52;
    for (let i = 0; i < n; i += 1) {
      const [ax, ay] = top[i];
      const [bx, by] = top[i + 1];
      const face = i % 2 ? '#d8c69a' : '#f0e4c4';
      poly(ctx, [[ax, ay], [bx, by], [bx, by + fh], [ax, ay + fh]], face, '#2e1a12', Math.max(0.6, m * 0.05));
      // A painted branch with blossoms.
      const px = (u) => ax + (bx - ax) * u;
      const py = (u, v) => ay + (by - ay) * u + fh * v;
      polyline(ctx, [[px(0.15), py(0.15, 0.8)], [px(0.45), py(0.45, 0.45)], [px(0.8), py(0.8, 0.3)]], '#4a3a2a', Math.max(0.5, m * 0.03));
      for (const [u, v] of [[0.42, 0.32], [0.62, 0.5], [0.8, 0.2]]) circle(ctx, px(u), py(u, v), m * 0.05, i % 2 ? '#c0606a' : '#d06a78');
    }
    // The top rails, and gilt hinges where the panels meet.
    polyline(ctx, top, '#2e1a12', Math.max(1, m * 0.1));
    for (const [x, y] of top) {
      line(ctx, x, y, x, y + fh, '#2e1a12', Math.max(0.8, m * 0.08));
      circle(ctx, x, y + fh * 0.5, m * 0.05, '#d4a72c', '#7a5a14', thin);
    }
  },
  sofa(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.48, h * 0.46, 0.9);
    const lw = Math.max(0.5, m * 0.02);
    rrect(ctx, -w * 0.48, -h * 0.46, w * 0.96, h * 0.92, m * 0.14, shade(t, -0.15), shade(t, -0.35), lw);
    // The back along the top, buttoned.
    rrect(ctx, -w * 0.46, -h * 0.44, w * 0.92, h * 0.26, m * 0.1, lit(ctx, 0, -h * 0.4, w * 0.5, shade(t, -0.02), 0.08));
    for (let i = 0; i < 7; i += 1) circle(ctx, -w * 0.33 + (w * 0.66 * i) / 6, -h * 0.31, m * 0.022, shade(t, -0.3));
    // Arms.
    for (const s of [-1, 1]) rrect(ctx, s * w * 0.4 - w * 0.065, -h * 0.34, w * 0.13, h * 0.76, m * 0.08, lit(ctx, s * w * 0.4, 0, m * 0.4, shade(t, 0.02), 0.1), shade(t, -0.3), lw);
    // Two seat cushions.
    for (const s of [-1, 1]) rrect(ctx, s * w * 0.165 - w * 0.16, -h * 0.17, w * 0.32, h * 0.58, m * 0.08, lit(ctx, s * w * 0.165, h * 0.1, m * 0.4, t, 0.1), shade(t, -0.3), lw);
    // A cushion in the corner.
    ctx.save();
    ctx.translate(-w * 0.25, -h * 0.08);
    ctx.rotate(-0.3);
    rrect(ctx, -m * 0.14, -m * 0.11, m * 0.28, m * 0.22, m * 0.07, lit(ctx, 0, 0, m * 0.2, '#c9a24a', 0.15), '#7a5a1a', lw);
    ctx.restore();
  },
  harpsichord(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.47, h * 0.38, 1);
    const lw = Math.max(0.6, m * 0.03);
    // The stool in front.
    rrect(ctx, -w * 0.2, h * 0.37, w * 0.24, h * 0.11, m * 0.04, '#4a2f17', '#2e1d0d', lw);
    rrect(ctx, -w * 0.19, h * 0.385, w * 0.22, h * 0.08, m * 0.03, lit(ctx, -w * 0.08, h * 0.42, w * 0.12, '#7b2f34', 0.12));
    // The case: straight at the front, curving round the back down to the narrow right end.
    const wing = (k) => {
      ctx.beginPath();
      ctx.moveTo(-w * 0.47 + k, h * 0.2 - k);
      ctx.lineTo(-w * 0.47 + k, -h * 0.3);
      ctx.quadraticCurveTo(-w * 0.47 + k, -h * 0.46 + k, -w * 0.3, -h * 0.46 + k);
      ctx.bezierCurveTo(w * 0.05, -h * 0.46 + k, w * 0.3, -h * 0.22 + k, w * 0.47 - k, -h * 0.02 + k);
      ctx.lineTo(w * 0.47 - k, h * 0.2 - k);
      ctx.closePath();
    };
    wing(0);
    ctx.fillStyle = lit(ctx, -w * 0.1, -h * 0.1, w * 0.6, '#5a2a1c', 0.08);
    ctx.fill();
    ctx.strokeStyle = '#2e140c';
    ctx.lineWidth = lw;
    ctx.stroke();
    // The open soundboard, its strings, bridge and rose.
    const k = m * 0.07;
    wing(k);
    ctx.fillStyle = radial(ctx, -w * 0.1, -h * 0.1, w * 0.5, '#e6cb90', '#c8a468');
    ctx.fill();
    ctx.strokeStyle = '#d4a72c';
    ctx.lineWidth = Math.max(0.5, m * 0.015);
    ctx.stroke();
    ctx.save();
    wing(k);
    ctx.clip();
    for (let i = 0; i < 18; i += 1) {
      const y = -h * 0.55 + i * h * 0.045;
      line(ctx, -w * 0.5, y, w * 0.5, y + w * 0.22, rgba('#4a3a2a', 0.6), Math.max(0.5, m * 0.008));
    }
    ctx.beginPath();
    ctx.moveTo(-w * 0.36, -h * 0.28);
    ctx.bezierCurveTo(-w * 0.05, -h * 0.34, w * 0.2, -h * 0.16, w * 0.42, h * 0.06);
    ctx.strokeStyle = '#7a5232';
    ctx.lineWidth = Math.max(0.6, m * 0.025);
    ctx.stroke();
    ctx.restore();
    circle(ctx, -w * 0.2, h * 0.02, m * 0.07, '#7a5a3a', '#d4a72c', Math.max(0.5, m * 0.015));
    circle(ctx, -w * 0.2, h * 0.02, m * 0.035, '#3a2a1a');
    // The keyboard in front: ivory keys with black sharps.
    const kx0 = -w * 0.36;
    const kx1 = w * 0.2;
    rect(ctx, kx0 - m * 0.03, h * 0.17, kx1 - kx0 + m * 0.06, h * 0.17, '#3a1a10', '#2e140c', lw);
    rect(ctx, kx0, h * 0.2, kx1 - kx0, h * 0.12, '#f2ead6');
    const nk = 26;
    for (let i = 1; i < nk; i += 1) {
      const x = kx0 + ((kx1 - kx0) * i) / nk;
      line(ctx, x, h * 0.2, x, h * 0.32, rgba('#5a4a3a', 0.7), Math.max(0.5, m * 0.006), 'butt');
      if ([1, 2, 4, 5, 6].includes(i % 7)) rect(ctx, x - m * 0.012, h * 0.2, m * 0.024, h * 0.07, '#1e1612');
    }
  },
  harp(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.34, h * 0.4, 1.8);
    const lw = Math.max(0.6, m * 0.03);
    const gold = '#d4a72c';
    const dark = '#7a5a14';
    // The neck: an S curve from the column top to the soundbox top.
    const P = [[-w * 0.28, -h * 0.38], [-w * 0.05, -h * 0.54], [w * 0.12, -h * 0.2], [w * 0.33, -h * 0.34]];
    const at = (u) => {
      const v = 1 - u;
      return [v * v * v * P[0][0] + 3 * v * v * u * P[1][0] + 3 * v * u * u * P[2][0] + u * u * u * P[3][0], v * v * v * P[0][1] + 3 * v * v * u * P[1][1] + 3 * v * u * u * P[2][1] + u * u * u * P[3][1]];
    };
    // Strings, from the neck down to the soundbox.
    const sb0 = [-w * 0.17, h * 0.4];
    const sb1 = [w * 0.31, -h * 0.3];
    for (let i = 0; i < 9; i += 1) {
      const u = 0.12 + (i / 8) * 0.8;
      const [nx, ny] = at(u);
      const k = (nx - sb0[0]) / (sb1[0] - sb0[0]);
      line(ctx, nx, ny, nx, sb0[1] + (sb1[1] - sb0[1]) * k, rgba('#f4ecd8', 0.9), Math.max(0.5, m * 0.012));
    }
    // Base.
    rrect(ctx, -w * 0.36, h * 0.37, w * 0.5, h * 0.1, m * 0.04, lit(ctx, -w * 0.1, h * 0.42, w * 0.3, '#b8902f', 0.15), dark, lw);
    // Soundbox, thick at the foot.
    poly(ctx, [[-w * 0.22, h * 0.4], [sb0[0] + w * 0.2, h * 0.41], [sb1[0] + w * 0.07, sb1[1] + h * 0.03], [sb1[0], sb1[1] - h * 0.02]], lit(ctx, 0, 0, h * 0.5, '#c8962a', 0.14), dark, lw);
    line(ctx, -w * 0.06, h * 0.36, w * 0.32, -h * 0.26, rgba(dark, 0.6), Math.max(0.5, m * 0.02));
    // Column up the left side.
    line(ctx, -w * 0.28, h * 0.38, -w * 0.28, -h * 0.36, dark, Math.max(1, m * 0.12));
    line(ctx, -w * 0.28, h * 0.38, -w * 0.28, -h * 0.36, gold, Math.max(0.8, m * 0.07));
    // Neck.
    ctx.beginPath();
    ctx.moveTo(P[0][0], P[0][1]);
    ctx.bezierCurveTo(P[1][0], P[1][1], P[2][0], P[2][1], P[3][0], P[3][1]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, m * 0.12);
    ctx.stroke();
    ctx.strokeStyle = gold;
    ctx.lineWidth = Math.max(0.8, m * 0.07);
    ctx.stroke();
    circle(ctx, -w * 0.28, -h * 0.39, m * 0.08, lit(ctx, -w * 0.28, -h * 0.39, m * 0.08, '#e0b83a', 0.2), dark, Math.max(0.5, m * 0.02));
  },
  globe(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.42, m * 0.42, 1.3);
    // The stand's three legs.
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TAU + Math.PI / 6;
      line(ctx, 0, 0, Math.cos(a) * m * 0.45, Math.sin(a) * m * 0.45, '#4a2f17', Math.max(1, m * 0.08));
      circle(ctx, Math.cos(a) * m * 0.44, Math.sin(a) * m * 0.44, m * 0.045, '#3a2410');
    }
    // The flat horizon ring round the middle.
    circle(ctx, 0, 0, m * 0.4, lit(ctx, 0, 0, m * 0.4, '#8a5d33', 0.1), '#3a2410', Math.max(0.6, m * 0.02));
    circle(ctx, 0, 0, m * 0.36, null, rgba('#d4a72c', 0.8), Math.max(0.5, m * 0.012));
    // The sphere: sea, land, shading and a shine.
    const r = m * 0.31;
    circle(ctx, 0, 0, r, radial(ctx, 0, 0, r, '#5f9ccc', '#24557f', -r * 0.3, -r * 0.3));
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.clip();
    smoothShape(ctx, [[-r * 0.7, -r * 0.5], [-r * 0.2, -r * 0.75], [r * 0.1, -r * 0.35], [-r * 0.15, r * 0.05], [-r * 0.55, r * 0.15], [-r * 0.85, -r * 0.1]], '#9db06a');
    smoothShape(ctx, [[r * 0.25, -r * 0.1], [r * 0.75, -r * 0.3], [r * 1.0, r * 0.2], [r * 0.6, r * 0.75], [r * 0.3, r * 0.5]], '#b8a66a');
    smoothShape(ctx, [[-r * 0.4, r * 0.55], [-r * 0.05, r * 0.45], [r * 0.05, r * 0.8], [-r * 0.3, r * 0.95]], '#9db06a');
    ctx.restore();
    circle(ctx, 0, 0, r, radial(ctx, 0, 0, r, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.4)', -r * 0.3, -r * 0.3), '#1a3a5a', Math.max(0.5, m * 0.015));
    oval(ctx, -r * 0.38, -r * 0.42, r * 0.22, r * 0.12, -0.7, rgba('#ffffff', 0.45));
    // The brass meridian ring over the top, on its tilted axis.
    ctx.save();
    ctx.rotate(0.4);
    line(ctx, 0, -r * 1.12, 0, r * 1.12, '#7a5a14', Math.max(1, m * 0.05), 'butt');
    line(ctx, 0, -r * 1.12, 0, r * 1.12, '#d4a72c', Math.max(0.6, m * 0.028), 'butt');
    circle(ctx, 0, -r * 0.4, m * 0.03, '#f0d070', '#7a5a14', Math.max(0.5, m * 0.01));
    ctx.restore();
  },
  telescope(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.34, m * 0.34, 1.6);
    // Tripod: three legs from the middle.
    for (const a of [0.8, 2.95, 4.9]) {
      const x = Math.cos(a) * m * 0.42;
      const y = Math.sin(a) * m * 0.42;
      line(ctx, 0, 0, x, y, '#3a2410', Math.max(1, m * 0.06));
      line(ctx, 0, 0, x * 0.97, y * 0.97, '#7a5232', Math.max(0.6, m * 0.03));
      circle(ctx, x, y, m * 0.03, '#2e1d0d');
    }
    // The tube, pointing up and to the right: eyepiece, brass tube, dew cap.
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    const tube = (x0, x1, r0, r1, c) => {
      const gr = ctx.createLinearGradient(0, -r1, 0, r1);
      gr.addColorStop(0, shade(c, 0.22));
      gr.addColorStop(0.35, shade(c, 0.06));
      gr.addColorStop(1, shade(c, -0.25));
      poly(ctx, [[x0, -r0], [x1, -r1], [x1, r1], [x0, r0]], gr, shade(c, -0.4), Math.max(0.5, m * 0.012));
    };
    tube(-m * 0.45, -m * 0.33, m * 0.03, m * 0.035, '#3a3a3a');
    tube(-m * 0.33, m * 0.34, m * 0.05, m * 0.08, '#c9a040');
    tube(m * 0.34, m * 0.46, m * 0.095, m * 0.095, '#a87e28');
    for (const x of [-m * 0.18, m * 0.08]) {
      const rr = m * 0.05 + ((x + m * 0.33) / (m * 0.67)) * m * 0.03;
      rect(ctx, x, -rr * 1.12, m * 0.035, rr * 2.24, '#7a5a14');
    }
    oval(ctx, m * 0.46, 0, m * 0.025, m * 0.085, 0, '#a8d0e0', '#5a4410', Math.max(0.5, m * 0.01));
    ctx.restore();
    circle(ctx, 0, 0, m * 0.06, '#5a5a5a', '#2a2a2a', Math.max(0.5, m * 0.012));
  },
  map_table(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.48, h * 0.46, 0.8);
    planks(g, -w * 0.48, -h * 0.46, w * 0.96, h * 0.92, '#6a4424', 4, true);
    rect(ctx, -w * 0.48, -h * 0.46, w * 0.96, h * 0.92, null, '#3a2410', Math.max(1, m * 0.05));
    // The chart, held flat.
    ctx.save();
    ctx.rotate(-0.04);
    const pw = w * 0.36;
    const ph = h * 0.36;
    rect(ctx, -pw, -ph, pw * 2, ph * 2, '#e9dcb0', '#a8905a', Math.max(0.5, m * 0.015));
    ctx.save();
    ctx.beginPath();
    ctx.rect(-pw, -ph, pw * 2, ph * 2);
    ctx.clip();
    // Sea on the right, with a wavy coast.
    ctx.beginPath();
    ctx.moveTo(pw * 0.3, -ph);
    ctx.bezierCurveTo(pw * 0.05, -ph * 0.4, pw * 0.5, -ph * 0.1, pw * 0.2, ph * 0.3);
    ctx.bezierCurveTo(pw * 0.05, ph * 0.6, pw * 0.45, ph * 0.8, pw * 0.4, ph);
    ctx.lineTo(pw, ph);
    ctx.lineTo(pw, -ph);
    ctx.closePath();
    ctx.fillStyle = rgba('#6f9aa8', 0.55);
    ctx.fill();
    ctx.strokeStyle = rgba('#3e5a66', 0.8);
    ctx.lineWidth = Math.max(0.5, m * 0.012);
    ctx.stroke();
    // Mountains, a forest, and a red route.
    for (const [x, y] of [[-0.6, -0.5], [-0.4, -0.62], [-0.5, -0.28], [-0.2, -0.5]]) polyline(ctx, [[x * pw - m * 0.04, y * ph + m * 0.03], [x * pw, y * ph - m * 0.03], [x * pw + m * 0.04, y * ph + m * 0.03]], '#6a4a2a', Math.max(0.5, m * 0.015));
    for (let i = 0; i < 9; i += 1) circle(ctx, (-0.65 + rnd() * 0.5) * pw, (0.25 + rnd() * 0.5) * ph, m * 0.022, rgba('#4a6a3a', 0.8));
    for (let i = 0; i < 7; i += 1) {
      const u0 = i / 7;
      const u1 = u0 + 0.07;
      const px = (u) => (-0.75 + u * 0.85) * pw;
      const py = (u) => (0.1 - Math.sin(u * Math.PI) * 0.4) * ph;
      line(ctx, px(u0), py(u0), px(u1), py(u1), '#b03a2a', Math.max(0.5, m * 0.015));
    }
    const xx = 0.1 * pw;
    const xy = 0.1 * ph;
    line(ctx, xx - m * 0.03, xy - m * 0.03, xx + m * 0.03, xy + m * 0.03, '#b03a2a', Math.max(0.6, m * 0.02));
    line(ctx, xx + m * 0.03, xy - m * 0.03, xx - m * 0.03, xy + m * 0.03, '#b03a2a', Math.max(0.6, m * 0.02));
    ctx.restore();
    ctx.restore();
    // Markers of two sides.
    for (const [x, y, c] of [[-0.25, -0.05, '#c0392b'], [-0.15, 0.08, '#c0392b'], [0.05, -0.18, '#2f5a9a'], [0.16, 0.12, '#2f5a9a'], [-0.05, 0.22, '#c0392b']]) {
      circle(ctx, x * w + m * 0.01, y * h + m * 0.015, m * 0.04, 'rgba(0,0,0,0.3)');
      circle(ctx, x * w, y * h, m * 0.04, lit(ctx, x * w, y * h, m * 0.04, c, 0.2), shade(c, -0.35), Math.max(0.5, m * 0.01));
    }
    // A compass, and candles at two corners.
    const cx = w * 0.3;
    const cy = h * 0.3;
    circle(ctx, cx, cy, m * 0.07, '#c9a040', '#7a5a14', Math.max(0.5, m * 0.012));
    circle(ctx, cx, cy, m * 0.05, '#efe6cf');
    line(ctx, cx - m * 0.03, cy + m * 0.03, cx + m * 0.03, cy - m * 0.03, '#b03a2a', Math.max(0.5, m * 0.015));
    candle(g, -w * 0.42, -h * 0.38, m * 0.05);
    candle(g, w * 0.42, -h * 0.36, m * 0.05);
  },
  book_pile(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.42, m * 0.4, 0.7);
    const colours = ['#7b2f34', '#2f4f7b', '#3d6b3a', '#8a6d2f', '#5a3a6b', '#6b3a2a', '#2a5a5a'];
    for (const [x, y, n] of [[-0.18, -0.14, 3], [0.2, -0.1, 2], [-0.02, 0.2, 4]]) {
      let rot = (rnd() - 0.5) * 1.2;
      for (let i = 0; i < n; i += 1) {
        const bw = m * (0.32 - i * 0.025);
        const bh = m * (0.4 - i * 0.03);
        const bx = x * m + (rnd() - 0.5) * m * 0.04;
        const by = y * m + (rnd() - 0.5) * m * 0.04;
        ctx.save();
        ctx.translate(bx + m * 0.02, by + m * 0.025);
        ctx.rotate(rot);
        rect(ctx, -bw / 2, -bh / 2, bw, bh, 'rgba(0,0,0,0.25)');
        ctx.restore();
        const c = colours[Math.floor(rnd() * colours.length)];
        book(ctx, bx, by, bw, bh, c, rot);
        // Pages along the fore edge, and a gilt title on the cover.
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(rot);
        rect(ctx, bw * 0.34, -bh * 0.44, bw * 0.12, bh * 0.88, '#efe6cf');
        rect(ctx, -bw * 0.12, -bh * 0.2, bw * 0.34, bh * 0.08, rgba('#d4a72c', 0.85));
        ctx.restore();
        rot += (rnd() - 0.5) * 0.6;
      }
    }
  },
  scroll_rack(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.5, h * 0.46, 1.4);
    rect(ctx, -w * 0.5, -h * 0.46, w, h * 0.92, '#5a3a1e', '#2e1d0d', Math.max(0.5, m * 0.04));
    rect(ctx, -w * 0.5, -h * 0.46, w, h * 0.14, '#6e4a2a');
    const cols = 6;
    const rows = 2;
    const cw = (w * 0.94) / cols;
    const ch = (h * 0.68) / rows;
    const paper = ['#efe2bf', '#e4d09e', '#f6ecd4', '#d8c088'];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = -w * 0.47 + c * cw;
        const y = -h * 0.29 + r * ch;
        rect(ctx, x + cw * 0.07, y + ch * 0.07, cw * 0.86, ch * 0.86, '#1e140c');
        // A little heap of rolled scrolls, ends out.
        const n = 2 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i += 1) {
          const sr = Math.min(cw, ch) * (0.16 + rnd() * 0.08);
          const sx = x + cw * (0.3 + rnd() * 0.4);
          const sy = y + ch * (0.62 - (i / n) * 0.3 + (rnd() - 0.5) * 0.1);
          const p = paper[Math.floor(rnd() * paper.length)];
          circle(ctx, sx, sy, sr, lit(ctx, sx, sy, sr, p, 0.08), shade(p, -0.35), Math.max(0.5, m * 0.012));
          circle(ctx, sx, sy, sr * 0.42, null, rgba(shade(p, -0.4), 0.8), Math.max(0.5, m * 0.01));
          if (rnd() < 0.18) line(ctx, sx, sy + sr, sx + sr * 0.3, sy + sr * 1.9, '#a8322a', Math.max(0.6, m * 0.04));
        }
      }
    }
  },
  coat_stand(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.36, m * 0.36, 2.2);
    const lw = Math.max(0.5, m * 0.02);
    // Four splayed feet.
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * TAU + Math.PI / 4;
      line(ctx, 0, 0, Math.cos(a) * m * 0.44, Math.sin(a) * m * 0.44, '#4a2f17', Math.max(0.8, m * 0.045));
      circle(ctx, Math.cos(a) * m * 0.44, Math.sin(a) * m * 0.44, m * 0.035, '#2e1d0d');
    }
    // The crown of brass hooks round the top of the pole.
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + 0.15;
      line(ctx, 0, 0, Math.cos(a) * m * 0.17, Math.sin(a) * m * 0.17, '#b8902f', Math.max(0.8, m * 0.04));
      circle(ctx, Math.cos(a) * m * 0.17, Math.sin(a) * m * 0.17, m * 0.03, '#d4a72c', '#7a5a14', Math.max(0.5, m * 0.01));
    }
    circle(ctx, 0, 0, m * 0.07, lit(ctx, 0, 0, m * 0.07, '#7a5232', 0.2), '#2e1d0d', lw);
    // A cloak hanging from a hook, its hood bunched at the top, falling in folds.
    const base = '#7a2c2c';
    const hx = -m * 0.12;
    const hy = m * 0.06;
    const drape = [[hx - m * 0.06, hy - m * 0.02], [hx + m * 0.07, hy - m * 0.02], [hx + m * 0.2, hy + m * 0.2], [hx + m * 0.25, hy + m * 0.38], [hx + m * 0.12, hy + m * 0.36], [hx + m * 0.02, hy + m * 0.4], [hx - m * 0.1, hy + m * 0.36], [hx - m * 0.22, hy + m * 0.38], [hx - m * 0.24, hy + m * 0.18]];
    smoothShape(ctx, drape, lit(ctx, hx - m * 0.05, hy + m * 0.12, m * 0.32, base, 0.12), shade(base, -0.32), lw);
    for (const k of [-0.14, -0.05, 0.05, 0.14]) {
      ctx.beginPath();
      ctx.moveTo(hx + k * m * 0.3, hy + m * 0.06);
      ctx.quadraticCurveTo(hx + k * m * 0.9, hy + m * 0.2, hx + k * m * 1.2, hy + m * 0.35);
      ctx.strokeStyle = rgba(shade(base, -0.3), 0.75);
      ctx.lineWidth = Math.max(0.5, m * 0.02);
      ctx.stroke();
    }
    oval(ctx, hx, hy + m * 0.02, m * 0.09, m * 0.06, 0, shade(base, -0.1), shade(base, -0.32), lw);
    // A felt hat on another hook, with a feather.
    const tx = m * 0.17;
    const ty = -m * 0.14;
    circle(ctx, tx, ty, m * 0.17, lit(ctx, tx, ty, m * 0.17, '#8a6a48', 0.12), '#3e2a18', lw);
    circle(ctx, tx, ty, m * 0.1, lit(ctx, tx, ty, m * 0.1, '#9a7a56', 0.18), '#3e2a18', lw);
    circle(ctx, tx, ty, m * 0.1, null, '#2a1a10', Math.max(0.6, m * 0.03));
    polyline(ctx, [[tx + m * 0.07, ty + m * 0.07], [tx + m * 0.15, ty + m * 0.13], [tx + m * 0.25, ty + m * 0.12]], '#efe6cf', Math.max(0.6, m * 0.035));
  },
  washstand(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.46, h * 0.44, 1);
    const lw = Math.max(0.6, m * 0.035);
    // The splashback at the back, then the top.
    rect(ctx, -w * 0.44, -h * 0.47, w * 0.88, h * 0.12, '#5e3b1f', '#3a2410', lw);
    rect(ctx, -w * 0.44, -h * 0.36, w * 0.88, h * 0.8, lit(ctx, 0, 0, m * 0.6, '#7a4f2a', 0.08), '#4a2f17', lw);
    // The basin set into it, with water.
    const bx = -w * 0.06;
    const by = h * 0.04;
    circle(ctx, bx, by, m * 0.3, '#ece6da', '#9a9284', Math.max(0.5, m * 0.02));
    circle(ctx, bx, by, m * 0.22, radial(ctx, bx, by, m * 0.22, '#a8d0e0', '#6f9fba'));
    oval(ctx, bx - m * 0.08, by - m * 0.08, m * 0.07, m * 0.03, -0.6, rgba('#ffffff', 0.6));
    // A jug beside it.
    const jx = w * 0.3;
    const jy = -h * 0.12;
    circle(ctx, jx, jy + m * 0.14, m * 0.045, null, '#d8d0c0', Math.max(0.6, m * 0.03));
    circle(ctx, jx, jy, m * 0.13, lit(ctx, jx, jy, m * 0.13, '#e8e2d6', 0.12), '#9a9284', Math.max(0.5, m * 0.02));
    circle(ctx, jx, jy, m * 0.065, '#3a5a7a');
    poly(ctx, [[jx - m * 0.05, jy - m * 0.1], [jx, jy - m * 0.2], [jx + m * 0.05, jy - m * 0.1]], '#e4ddd0', '#9a9284', Math.max(0.5, m * 0.01));
    // A towel hanging over the side.
    rect(ctx, -w * 0.5, -h * 0.26, w * 0.12, h * 0.62, '#efe9de', '#b8b0a0', Math.max(0.5, m * 0.015));
    for (const y of [h * 0.22, h * 0.28]) line(ctx, -w * 0.5, y, -w * 0.38, y, '#b03a3a', Math.max(0.5, m * 0.025), 'butt');
  },
  clock(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.42, h * 0.42, 3);
    const lw = Math.max(0.6, m * 0.04);
    const thin = Math.max(0.5, m * 0.015);
    // The dial, under the front of the hood.
    oval(ctx, 0, h * 0.35, w * 0.27, h * 0.13, 0, lit(ctx, 0, h * 0.35, w * 0.27, '#c9a040', 0.15), '#7a5a14', thin);
    oval(ctx, 0, h * 0.35, w * 0.21, h * 0.095, 0, '#f2ead6');
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      circle(ctx, Math.cos(a) * w * 0.17, h * 0.35 + Math.sin(a) * h * 0.075, m * 0.012, '#3a2a1a');
    }
    line(ctx, 0, h * 0.35, -w * 0.07, h * 0.3, '#2a1a10', Math.max(0.5, m * 0.025));
    line(ctx, 0, h * 0.35, w * 0.12, h * 0.34, '#2a1a10', Math.max(0.5, m * 0.02));
    // The case top and its stepped crown.
    rect(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.7, '#4a2a16', '#2a1609', lw);
    rect(ctx, -w * 0.39, -h * 0.39, w * 0.78, h * 0.56, lit(ctx, 0, -h * 0.12, m * 0.6, '#6a3a20', 0.1), '#3a1e0e', thin);
    rect(ctx, -w * 0.3, -h * 0.3, w * 0.6, h * 0.38, lit(ctx, 0, -h * 0.12, m * 0.4, '#7a4628', 0.12), '#3a1e0e', thin);
    rect(ctx, -w * 0.2, -h * 0.21, w * 0.4, h * 0.2, lit(ctx, 0, -h * 0.12, m * 0.3, '#8a5432', 0.12), '#3a1e0e', thin);
    // Gilt finials.
    for (const [x, y] of [[-w * 0.4, h * 0.15], [w * 0.4, h * 0.15], [0, -h * 0.11]]) circle(ctx, x, y, m * 0.075, lit(ctx, x, y, m * 0.075, '#d4a72c', 0.2), '#7a5a14', thin);
  },
  card_table(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.46, m * 0.46, 0.8);
    circle(ctx, 0, 0, m * 0.48, lit(ctx, 0, 0, m * 0.48, '#6a4424', 0.08), '#3a2410', Math.max(0.8, m * 0.015));
    circle(ctx, 0, 0, m * 0.4, radial(ctx, 0, 0, m * 0.4, '#3f7a4a', '#2a5a36'), '#d4a72c', Math.max(0.5, m * 0.008));
    // Cards scattered, some face down, and a fanned hand.
    const card = (x, y, rot, up) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      rect(ctx, -m * 0.045, -m * 0.065, m * 0.09, m * 0.13, up ? '#f6f2e8' : '#9a2a2a', '#5a4a3a', Math.max(0.5, m * 0.005));
      if (up) {
        const red = rnd() < 0.5;
        poly(ctx, [[0, -m * 0.03], [m * 0.022, 0], [0, m * 0.03], [-m * 0.022, 0]], red ? '#c0392b' : '#1a1a1a');
      } else rect(ctx, -m * 0.032, -m * 0.052, m * 0.064, m * 0.104, null, '#e8d8b0', Math.max(0.5, m * 0.004));
      ctx.restore();
    };
    for (let i = 0; i < 5; i += 1) card(-m * 0.22 + (i - 2) * m * 0.035, m * 0.18, -0.5 + i * 0.22, true);
    card(m * 0.12, -m * 0.2, 0.6, false);
    card(m * 0.18, -m * 0.12, -0.2, false);
    card(-m * 0.08, -m * 0.06, 0.3, true);
    card(m * 0.24, m * 0.14, 1.2, true);
    // Coins and dice.
    for (let i = 0; i < 4; i += 1) coin(g, -m * 0.2 + rnd() * m * 0.08, -m * 0.2 + rnd() * m * 0.08, m * 0.035);
    for (let i = 0; i < 3; i += 1) coin(g, m * 0.06 + rnd() * m * 0.06, m * 0.24 + rnd() * m * 0.05, m * 0.035);
    for (const [x, y, rot, n] of [[m * 0.04, m * 0.06, 0.4, 3], [m * 0.12, m * 0.02, -0.3, 1]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      rrect(ctx, -m * 0.03, -m * 0.03, m * 0.06, m * 0.06, m * 0.01, '#f4f0e6', '#7a7268', Math.max(0.5, m * 0.005));
      const dots = n === 1 ? [[0, 0]] : [[-1, -1], [0, 0], [1, 1]];
      for (const [dx, dy] of dots) circle(ctx, dx * m * 0.015, dy * m * 0.015, m * 0.007, '#1a1a1a');
      ctx.restore();
    }
  },
  chess_table(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.46, h * 0.46, 0.8);
    rect(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.92, lit(ctx, 0, 0, m * 0.6, '#6a4424', 0.08), '#3a2410', Math.max(1, m * 0.05));
    // The chequered board.
    const s = m * 0.68;
    const c = s / 8;
    rect(ctx, -s / 2 - m * 0.03, -s / 2 - m * 0.03, s + m * 0.06, s + m * 0.06, '#3a2410');
    for (let r = 0; r < 8; r += 1) for (let k = 0; k < 8; k += 1) rect(ctx, -s / 2 + k * c, -s / 2 + r * c, c, c, (r + k) % 2 ? '#5a3a22' : '#e8dcc0');
    // A few pieces.
    const piece = (col, row, white, big) => {
      const x = -s / 2 + (col + 0.5) * c;
      const y = -s / 2 + (row + 0.5) * c;
      const r = c * (big ? 0.46 : 0.36);
      circle(ctx, x + c * 0.08, y + c * 0.1, r, 'rgba(0,0,0,0.3)');
      circle(ctx, x, y, r, lit(ctx, x, y, r, white ? '#f4ecd8' : '#2a2422', 0.25), white ? '#7a6a52' : '#0a0806', Math.max(0.5, m * 0.008));
      if (big) circle(ctx, x, y, r * 0.35, white ? '#c9a040' : '#a08030');
    };
    piece(4, 7, true, true);
    piece(3, 6, true, false);
    piece(5, 5, true, false);
    piece(2, 4, true, false);
    piece(4, 0, false, true);
    piece(3, 1, false, false);
    piece(6, 2, false, false);
    piece(4, 3, false, false);
  },
  tapestry(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.47, h * 0.32, 0.6);
    // The cloth, hanging in soft folds, with a woven border and a fringe.
    const folds = ctx.createLinearGradient(-w * 0.46, 0, w * 0.46, 0);
    for (let i = 0; i <= 16; i += 1) folds.addColorStop(i / 16, shade(t, i % 2 ? -0.07 : 0.06));
    rect(ctx, -w * 0.46, -h * 0.18, w * 0.92, h * 0.5, folds, shade(t, -0.3), Math.max(0.5, m * 0.04));
    line(ctx, -w * 0.46, h * 0.22, w * 0.46, h * 0.22, '#d4a72c', Math.max(0.5, m * 0.06), 'butt');
    for (let i = 0; i < 9; i += 1) {
      const x = -w * 0.4 + (w * 0.8 * i) / 8;
      poly(ctx, [[x, -h * 0.1], [x + m * 0.12, h * 0.05], [x, h * 0.18], [x - m * 0.12, h * 0.05]], rgba('#d4a72c', 0.7));
    }
    for (let i = 0; i <= 40; i += 1) {
      const x = -w * 0.45 + (w * 0.9 * i) / 40;
      line(ctx, x, h * 0.32, x, h * 0.44, '#c9a040', Math.max(0.5, m * 0.04), 'butt');
    }
    // The rod, with knobs at the ends.
    line(ctx, -w * 0.48, -h * 0.3, w * 0.48, -h * 0.3, '#3a2410', Math.max(1, m * 0.2));
    line(ctx, -w * 0.48, -h * 0.34, w * 0.48, -h * 0.34, rgba('#ffffff', 0.2), Math.max(0.5, m * 0.05));
    for (const s of [-1, 1]) circle(ctx, s * w * 0.48, -h * 0.3, m * 0.16, '#d4a72c', '#7a5a14', Math.max(0.5, m * 0.03));
  },
  banner(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.42, h * 0.34, 0.6);
    // The cloth with a swallowtail end, gold trim and an emblem.
    const cloth = [[-w * 0.36, -h * 0.22], [w * 0.36, -h * 0.22], [w * 0.36, h * 0.4], [w * 0.12, h * 0.4], [0, h * 0.16], [-w * 0.12, h * 0.4], [-w * 0.36, h * 0.4]];
    poly(ctx, cloth, lit(ctx, -w * 0.1, 0, w * 0.4, t, 0.1), '#c9a040', Math.max(0.6, m * 0.06));
    poly(ctx, [[0, -h * 0.14], [w * 0.09, -h * 0.02], [0, h * 0.12], [-w * 0.09, -h * 0.02]], '#d4a72c', '#7a5a14', Math.max(0.5, m * 0.02));
    // The pole along the top, with gold finials.
    line(ctx, -w * 0.46, -h * 0.28, w * 0.46, -h * 0.28, '#3a2410', Math.max(1, m * 0.18));
    for (const s of [-1, 1]) circle(ctx, s * w * 0.45, -h * 0.28, m * 0.15, '#d4a72c', '#7a5a14', Math.max(0.5, m * 0.03));
  },
  oven(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.42, m * 0.4, 1.4);
    const lw = Math.max(0.6, m * 0.012);
    const cy = -m * 0.07;
    const r = m * 0.34;
    // The dome: a brick footing, the lit clay dome, courses of brick, the smoke hole.
    circle(ctx, 0, cy, r * 1.1, '#6a4a3a', '#3e2a20', lw);
    circle(ctx, 0, cy, r, lit(ctx, 0, cy, r, '#b07a5a', 0.14), '#5a3a2a', lw);
    for (const k of [0.82, 0.62, 0.42]) {
      circle(ctx, 0, cy, r * k, null, rgba('#5a3a2a', 0.45), Math.max(0.5, m * 0.006));
      const n = Math.round(14 * k);
      for (let i = 0; i < n; i += 1) {
        const a = ((i + ((k * 10) % 1)) / n) * TAU;
        line(ctx, Math.cos(a) * r * k, cy + Math.sin(a) * r * k, Math.cos(a) * r * (k + 0.18), cy + Math.sin(a) * r * (k + 0.18), rgba('#5a3a2a', 0.35), Math.max(0.5, m * 0.005));
      }
    }
    circle(ctx, -r * 0.1, cy - r * 0.18, r * 0.13, '#2a1a12', '#4a3020', lw);
    // The mouth at the front: a brick arch and the fire glowing inside.
    const my = cy + r * 0.92;
    rrect(ctx, -r * 0.42, my - r * 0.18, r * 0.84, r * 0.34, r * 0.1, '#8a5a42', '#4a3020', lw);
    glow(ctx, 0, my + r * 0.12, r * 0.75, '#ff8a3c', 0.5);
    ctx.beginPath();
    ctx.ellipse(0, my + r * 0.16, r * 0.3, r * 0.22, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, 0, my + r * 0.16, r * 0.3, '#ffd27a', '#c2401a');
    ctx.fill();
    for (let i = 0; i < 5; i += 1) circle(ctx, (rnd() - 0.5) * r * 0.4, my + r * 0.04 + rnd() * r * 0.08, m * 0.012, '#fff2b0');
    // A peel lying by the mouth, and a few loaves.
    line(ctx, m * 0.22, m * 0.38, m * 0.46, m * 0.14, '#8a6a42', Math.max(1, m * 0.025));
    oval(ctx, m * 0.18, m * 0.42, m * 0.075, m * 0.055, -0.8, lit(ctx, m * 0.18, m * 0.42, m * 0.075, '#b8946a', 0.12), '#5a4428', Math.max(0.5, m * 0.008));
    for (const [x, y, a] of [[-0.36, 0.3, 0.6], [-0.27, 0.4, 0.2], [-0.42, 0.18, 1.1]]) {
      ctx.save();
      ctx.translate(x * m, y * m);
      ctx.rotate(a);
      oval(ctx, 0, 0, m * 0.07, m * 0.04, 0, lit(ctx, 0, 0, m * 0.07, '#c8883a', 0.16), '#7a4a1a', Math.max(0.5, m * 0.008));
      for (const d of [-1, 0, 1]) line(ctx, d * m * 0.025 - m * 0.01, -m * 0.02, d * m * 0.025 + m * 0.01, m * 0.02, '#e8c080', Math.max(0.5, m * 0.006));
      ctx.restore();
    }
  },
  worktop(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.49, h * 0.45, 1);
    const thin = Math.max(0.5, m * 0.012);
    // A thick butcher-block counter.
    rect(ctx, -w * 0.49, -h * 0.46, w * 0.98, h * 0.92, '#5e3b1f', '#3a2410', Math.max(0.6, m * 0.03));
    planks(g, -w * 0.47, -h * 0.42, w * 0.94, h * 0.76, '#a0763e', 5, true, 0.14);
    for (let r = 0; r < 5; r += 1) for (let k = 0; k < 3; k += 1) {
      const x = -w * 0.47 + w * 0.94 * ((k + 0.3 + (r % 2) * 0.4 + rnd() * 0.15) / 3);
      line(ctx, x, -h * 0.42 + (h * 0.76 * r) / 5, x, -h * 0.42 + (h * 0.76 * (r + 1)) / 5, rgba('#5e3b1f', 0.5), thin, 'butt');
    }
    rect(ctx, -w * 0.49, h * 0.34, w * 0.98, h * 0.12, '#7a5532');
    // A bowl of flour, vegetables, a cleaver and a knife.
    const bx = -w * 0.34;
    const by = -h * 0.04;
    circle(ctx, bx, by, m * 0.22, lit(ctx, bx, by, m * 0.22, '#9a6a3a', 0.1), '#4a3018', Math.max(0.5, m * 0.02));
    circle(ctx, bx, by, m * 0.16, radial(ctx, bx, by, m * 0.16, '#f4efe2', '#d8d0c0'));
    for (const [x, y] of [[-0.14, -0.15], [-0.08, 0.06]]) {
      circle(ctx, x * w, y * h, m * 0.09, lit(ctx, x * w, y * h, m * 0.09, '#d8c08a', 0.18), '#8a6a3a', thin);
      line(ctx, x * w, y * h - m * 0.05, x * w, y * h + m * 0.05, rgba('#8a6a3a', 0.6), thin);
    }
    circle(ctx, w * 0.02, -h * 0.1, m * 0.13, lit(ctx, w * 0.02, -h * 0.1, m * 0.13, '#6a9a4a', 0.15), '#3a5a2a', thin);
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * TAU + 0.4;
      line(ctx, w * 0.02, -h * 0.1, w * 0.02 + Math.cos(a) * m * 0.1, -h * 0.1 + Math.sin(a) * m * 0.1, rgba('#d8e8c0', 0.6), thin);
    }
    for (const [x, y, a] of [[0.1, 0.12, -0.3], [0.13, 0.2, -0.15]]) {
      ctx.save();
      ctx.translate(x * w, y * h);
      ctx.rotate(a);
      poly(ctx, [[-m * 0.14, -m * 0.025], [m * 0.08, -m * 0.012], [m * 0.08, m * 0.012], [-m * 0.14, m * 0.025]], '#e07a2a', '#9a4a1a', thin);
      for (const d of [-1, 0, 1]) line(ctx, -m * 0.14, 0, -m * 0.2, d * m * 0.03, '#4a8a3a', Math.max(0.5, m * 0.02));
      ctx.restore();
    }
    ctx.save();
    ctx.translate(w * 0.3, -h * 0.05);
    ctx.rotate(0.25);
    rect(ctx, -m * 0.12, -m * 0.1, m * 0.2, m * 0.18, '#b0b4ba', '#5a5e64', thin);
    line(ctx, -m * 0.12, -m * 0.08, m * 0.08, -m * 0.08, rgba('#ffffff', 0.5), thin, 'butt');
    circle(ctx, -m * 0.07, -m * 0.04, m * 0.02, '#5a5e64');
    rrect(ctx, m * 0.08, -m * 0.03, m * 0.14, m * 0.06, m * 0.02, '#4a2f17');
    ctx.restore();
    ctx.save();
    ctx.translate(w * 0.38, h * 0.14);
    ctx.rotate(-0.15);
    poly(ctx, [[-m * 0.16, -m * 0.025], [m * 0.04, -m * 0.025], [m * 0.04, m * 0.02], [-m * 0.1, m * 0.02]], '#c0c4ca', '#5a5e64', thin);
    rrect(ctx, m * 0.04, -m * 0.025, m * 0.11, m * 0.05, m * 0.015, '#3a2410');
    ctx.restore();
  },
  sink(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.45, 1);
    const thin = Math.max(0.5, m * 0.012);
    // The counter.
    planks(g, -w * 0.48, -h * 0.45, w * 0.96, h * 0.9, '#7a5532', 3, true);
    rect(ctx, -w * 0.48, -h * 0.45, w * 0.96, h * 0.9, null, '#4a3018', Math.max(0.6, m * 0.04));
    // The stone basin: a thick rim round a sunken, water-filled bowl.
    rrect(ctx, -w * 0.34, -h * 0.32, w * 0.5, h * 0.66, m * 0.1, lit(ctx, -w * 0.09, 0, m * 0.4, '#9d978d', 0.1), '#4f4b45', Math.max(0.6, m * 0.025));
    rrect(ctx, -w * 0.28, -h * 0.24, w * 0.38, h * 0.5, m * 0.07, radial(ctx, -w * 0.09, 0, m * 0.35, '#6f8fa0', '#4a6a7c', -w * 0.02, h * 0.06), rgba('#2f2c28', 0.8), thin);
    line(ctx, -w * 0.26, -h * 0.2, w * 0.08, -h * 0.2, rgba('#2f2c28', 0.35), Math.max(0.5, m * 0.025), 'butt');
    circle(ctx, -w * 0.02, h * 0.06, m * 0.11, rgba('#e8e2d6', 0.55), rgba('#ffffff', 0.4), thin);
    oval(ctx, -w * 0.16, -h * 0.08, m * 0.07, m * 0.025, -0.4, rgba('#ffffff', 0.45));
    // A pump spout over it at the back.
    rect(ctx, -w * 0.13, -h * 0.45, m * 0.08, h * 0.24, '#4a4e54', '#2a2e34', thin);
    circle(ctx, -w * 0.09, -h * 0.23, m * 0.04, '#2a2e34');
    // Clean plates stacked beside it, and a cup.
    const px = w * 0.33;
    const py = -h * 0.08;
    for (let i = 0; i < 3; i += 1) circle(ctx, px - i * m * 0.015, py - i * m * 0.015, m * 0.14, '#ece6da', '#a8a090', thin);
    circle(ctx, px - m * 0.03, py - m * 0.03, m * 0.08, null, rgba('#3a5a8a', 0.6), thin);
    circle(ctx, w * 0.33, h * 0.26, m * 0.07, '#ece6da', '#a8a090', thin);
    circle(ctx, w * 0.33, h * 0.26, m * 0.045, '#c8bfae');
  },
  water_butt(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.46, m * 0.46, 1.1);
    // Staves round the rim, an iron hoop.
    circle(ctx, 0, 0, m * 0.47, '#4a3019');
    circle(ctx, 0, 0, m * 0.44, lit(ctx, 0, 0, m * 0.44, '#8a5d33', 0.1));
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * TAU;
      line(ctx, Math.cos(a) * m * 0.37, Math.sin(a) * m * 0.37, Math.cos(a) * m * 0.47, Math.sin(a) * m * 0.47, rgba('#3a2410', 0.7), Math.max(0.5, m * 0.012));
    }
    circle(ctx, 0, 0, m * 0.455, null, '#3a3a3a', Math.max(0.8, m * 0.025));
    // Water to the brim.
    circle(ctx, 0, 0, m * 0.37, radial(ctx, 0, 0, m * 0.37, '#5d8fb0', '#2e5a7a', -m * 0.1, -m * 0.1), '#2e1d0d', Math.max(0.5, m * 0.015));
    for (const k of [0.12, 0.2]) circle(ctx, m * 0.08, m * 0.06, m * k, null, rgba('#ffffff', 0.25), Math.max(0.5, m * 0.008));
    oval(ctx, -m * 0.14, -m * 0.16, m * 0.1, m * 0.035, -0.6, rgba('#ffffff', 0.45));
    // A ladle hooked on the rim.
    line(ctx, m * 0.2, -m * 0.08, m * 0.47, -m * 0.24, '#7a5a3a', Math.max(1, m * 0.035));
    circle(ctx, m * 0.16, -m * 0.06, m * 0.075, lit(ctx, m * 0.16, -m * 0.06, m * 0.075, '#8a8e94', 0.15), '#3a3e44', Math.max(0.5, m * 0.012));
    circle(ctx, m * 0.16, -m * 0.06, m * 0.05, rgba('#2e5a7a', 0.8));
  },
  pots_pans(g) {
    const { ctx, w, h, m } = g;
    const thin = Math.max(0.5, m * 0.015);
    const drop = (x, y, r, k) => {
      ctx.save();
      ctx.translate(x, y);
      shadow(g, 'round', r, r, k);
      ctx.restore();
    };
    const copper = (x, y, r) => {
      circle(ctx, x, y, r, lit(ctx, x, y, r, '#c27a48', 0.18), '#6a3418', Math.max(0.5, m * 0.025));
      circle(ctx, x, y, r * 0.78, radial(ctx, x, y, r * 0.78, '#7a3e1e', '#a85e32', x + r * 0.2, y + r * 0.2));
      oval(ctx, x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.1, -0.7, rgba('#ffe0c0', 0.5));
    };
    drop(-w * 0.28, -h * 0.02, m * 0.34, 0.8);
    drop(w * 0.1, -h * 0.05, m * 0.27, 0.5);
    drop(w * 0.36, h * 0.12, m * 0.17, 0.6);
    // A big pot with loop handles.
    for (const s of [-1, 1]) circle(ctx, -w * 0.28 + s * m * 0.34, -h * 0.02, m * 0.07, null, '#6a3418', Math.max(0.6, m * 0.035));
    copper(-w * 0.28, -h * 0.02, m * 0.32);
    // A frying pan with its long handle out to the front.
    line(ctx, w * 0.1, h * 0.05, w * 0.2, h * 0.47, '#3a2410', Math.max(1, m * 0.07));
    copper(w * 0.1, -h * 0.05, m * 0.26);
    // A small saucepan, and a lid.
    line(ctx, w * 0.36, h * 0.12, w * 0.47, h * 0.38, '#6a3418', Math.max(1, m * 0.05));
    copper(w * 0.36, h * 0.12, m * 0.16);
    oval(ctx, w * 0.33, -h * 0.3, m * 0.12, m * 0.07, 0, lit(ctx, w * 0.33, -h * 0.3, m * 0.12, '#c27a48', 0.18), '#6a3418', thin);
    circle(ctx, w * 0.33, -h * 0.3, m * 0.025, '#6a3418');
  },
  hanging_meat(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.42, m * 0.42, 2.6);
    const lw = Math.max(0.5, m * 0.015);
    const by = -m * 0.3;
    // A garland of sausages looped between two hooks, and a short string hanging straight.
    const link = (x, y, a) => {
      oval(ctx, x, y, m * 0.055, m * 0.03, a, lit(ctx, x, y, m * 0.055, '#9a3e2a', 0.16), '#4a1a10', lw);
    };
    const garland = (xa, xb, sag, n) => {
      for (let i = 0; i < n; i += 1) {
        const u = (i + 0.5) / n;
        const x = xa + (xb - xa) * u;
        const y = by + sag * 4 * u * (1 - u);
        link(x, y, Math.atan2(sag * 4 * (1 - 2 * u), xb - xa));
      }
    };
    garland(-m * 0.15, m * 0.15, m * 0.5, 11);
    for (let i = 0; i < 4; i += 1) link(m * 0.02, by + m * (0.08 + i * 0.085), Math.PI / 2);
    // Two hams, the shank up, tied to their hooks.
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * m * 0.29, by + m * 0.06);
      ctx.rotate(Math.PI / 2 + s * 0.1);
      const n = m * 0.04;
      const b = m * 0.15;
      const L = m * 0.36;
      ctx.beginPath();
      ctx.moveTo(0, -n);
      ctx.quadraticCurveTo(L * 0.45, -n, L - b * 0.707, -b * 0.707);
      ctx.arc(L, 0, b, -Math.PI * 0.75, Math.PI * 0.75);
      ctx.quadraticCurveTo(L * 0.45, n, 0, n);
      ctx.closePath();
      ctx.fillStyle = lit(ctx, L * 0.8, 0, b * 1.6, '#9a4428', 0.15);
      ctx.fill();
      ctx.strokeStyle = '#4a1a10';
      ctx.lineWidth = lw;
      ctx.stroke();
      // The pale fat side, the netting string, the bone.
      ctx.beginPath();
      ctx.arc(L, 0, b * 0.82, -Math.PI * 0.7, -Math.PI * 0.15);
      ctx.strokeStyle = rgba('#f0d0a8', 0.75);
      ctx.lineWidth = Math.max(0.6, m * 0.035);
      ctx.stroke();
      for (const k of [0.45, 0.7, 0.95]) line(ctx, L * k, -b * 0.95 * Math.min(1, k * 1.3), L * k, b * 0.95 * Math.min(1, k * 1.3), rgba('#e8d8b0', 0.55), Math.max(0.5, m * 0.012));
      circle(ctx, 0, 0, n * 1.2, '#efe6cf', '#8a7a5a', lw);
      ctx.restore();
      line(ctx, s * m * 0.29, by, s * m * 0.29, by + m * 0.06, '#d8c8a0', Math.max(0.6, m * 0.02));
    }
    // The beam across, with its iron hooks.
    const beam = ctx.createLinearGradient(0, by - m * 0.04, 0, by + m * 0.04);
    beam.addColorStop(0, '#9a7048');
    beam.addColorStop(1, '#5e3b1f');
    rrect(ctx, -m * 0.4, by - m * 0.04, m * 0.8, m * 0.08, m * 0.03, beam, '#3a2410', lw);
    for (const x of [-0.29, -0.15, 0.02, 0.15, 0.29]) circle(ctx, x * m, by, m * 0.025, '#2b2b2e');
  },
  herbs(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.42, m * 0.4, 2.6);
    const lw = Math.max(0.5, m * 0.012);
    const py = -m * 0.3;
    // Bunches tied upside down: stems fanning out below each tie, leaves or flower spikes.
    const bunch = (x, len, base, spikes) => {
      for (let i = 0; i < 10; i += 1) {
        const a = Math.PI / 2 + (i / 9 - 0.5) * 0.9 + (rnd() - 0.5) * 0.15;
        const l = len * (0.75 + rnd() * 0.3);
        const ox = x;
        const oy = py + m * 0.05;
        const ex = ox + Math.cos(a) * l;
        const ey = oy + Math.sin(a) * l;
        line(ctx, ox, oy, ex, ey, shade(base, -0.28), Math.max(0.5, m * 0.012));
        if (spikes) {
          for (let k = 0; k < 5; k += 1) {
            const u = 0.5 + k * 0.12;
            oval(ctx, ox + (ex - ox) * u, oy + (ey - oy) * u, m * 0.028, m * 0.016, a, shade(base, (rnd() - 0.5) * 0.15));
          }
        } else {
          for (let k = 0; k < 4; k += 1) {
            const u = 0.3 + k * 0.22;
            const side = (k % 2 ? 1 : -1) * 0.5;
            const lx = ox + (ex - ox) * u + Math.cos(a + side * 2) * m * 0.025;
            const ly = oy + (ey - oy) * u + Math.sin(a + side * 2) * m * 0.025;
            oval(ctx, lx, ly, m * 0.05, m * 0.024, a + side, lit(ctx, lx, ly, m * 0.05, shade(base, (rnd() - 0.5) * 0.12), 0.12), shade(base, -0.3), lw);
          }
        }
      }
      line(ctx, x, py, x, py + m * 0.07, '#c8b48a', Math.max(0.8, m * 0.04), 'butt');
    };
    // Garlic, braided by its stalks.
    const garlic = (x) => {
      line(ctx, x, py, x, py + m * 0.5, '#c8b48a', Math.max(0.6, m * 0.025));
      for (let k = 0; k < 5; k += 1) {
        const bx = x + (k % 2 ? 1 : -1) * m * 0.028;
        const byy = py + m * (0.1 + k * 0.09);
        const r = m * (0.06 - k * 0.005);
        circle(ctx, bx, byy, r, lit(ctx, bx, byy, r, '#efe8dc', 0.12), '#a89a8a', lw);
        line(ctx, bx, byy - r * 0.8, bx, byy + r * 0.8, rgba('#b8a0b8', 0.7), lw);
        line(ctx, bx - r * 0.5, byy - r * 0.6, bx - r * 0.5, byy + r * 0.6, rgba('#b8a0b8', 0.5), lw);
      }
    };
    bunch(-m * 0.28, m * 0.5, '#5f8a45', false);
    garlic(-m * 0.1);
    bunch(m * 0.07, m * 0.56, '#8a9a6a', false);
    garlic(m * 0.21);
    bunch(m * 0.33, m * 0.42, '#7d6a9e', true);
    // The pole, on top.
    const pole = ctx.createLinearGradient(0, py - m * 0.035, 0, py + m * 0.035);
    pole.addColorStop(0, '#9a7048');
    pole.addColorStop(1, '#5e3b1f');
    rrect(ctx, -m * 0.42, py - m * 0.035, m * 0.84, m * 0.07, m * 0.035, pole, '#3a2410', lw);
  },
  bread(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.44, m * 0.44, 0.7);
    const lw = Math.max(0.5, m * 0.02);
    // The wicker basket.
    circle(ctx, 0, 0, m * 0.47, '#9a7a44', '#5a4020', lw);
    circle(ctx, 0, 0, m * 0.38, radial(ctx, 0, 0, m * 0.38, '#6a4e2a', '#7e6034'));
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * TAU;
      line(ctx, Math.cos(a) * m * 0.385, Math.sin(a) * m * 0.385, Math.cos(a + 0.18) * m * 0.465, Math.sin(a + 0.18) * m * 0.465, '#c4a066', Math.max(0.5, m * 0.025));
    }
    // A cloth, then loaves and rolls.
    poly(ctx, [[-m * 0.3, -m * 0.24], [m * 0.1, -m * 0.36], [m * 0.32, m * 0.06], [-m * 0.1, m * 0.3]], '#efe6d2', '#b8ac94', Math.max(0.5, m * 0.01));
    const loaf = (x, y, rx, ry, a) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      oval(ctx, 0, 0, rx, ry, 0, lit(ctx, 0, 0, rx, '#c8883a', 0.16), '#7a4a1a', lw);
      for (const d of [-1, 0, 1]) line(ctx, d * rx * 0.45 - ry * 0.3, -ry * 0.55, d * rx * 0.45 + ry * 0.3, ry * 0.55, '#ecc888', Math.max(0.5, m * 0.025));
      ctx.restore();
    };
    loaf(-m * 0.1, -m * 0.07, m * 0.25, m * 0.11, -0.5);
    loaf(m * 0.08, m * 0.12, m * 0.23, m * 0.1, -0.35);
    for (const [x, y] of [[m * 0.2, -m * 0.16], [-m * 0.22, m * 0.18]]) {
      circle(ctx, x, y, m * 0.1, lit(ctx, x, y, m * 0.1, '#d09a4a', 0.18), '#7a4a1a', lw);
      line(ctx, x - m * 0.05, y, x + m * 0.05, y, '#f0d0a0', Math.max(0.5, m * 0.02));
      line(ctx, x, y - m * 0.05, x, y + m * 0.05, '#f0d0a0', Math.max(0.5, m * 0.02));
    }
  },
  cheese(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.44, m * 0.42, 0.6);
    const lw = Math.max(0.5, m * 0.02);
    // A whole wheel at the back.
    const bx = m * 0.18;
    const by = -m * 0.17;
    circle(ctx, bx, by, m * 0.22, '#d0902a', '#7a4a10', lw);
    circle(ctx, bx, by, m * 0.18, lit(ctx, bx, by, m * 0.18, '#ecc04a', 0.12));
    // A big wheel with a wedge cut out...
    const cx = -m * 0.08;
    const cy = m * 0.06;
    const r = m * 0.32;
    const c0 = 0.05;
    const c1 = 0.95;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, c1, c0 + TAU);
    ctx.closePath();
    ctx.fillStyle = '#d0902a';
    ctx.fill();
    ctx.strokeStyle = '#7a4a10';
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r * 0.86, c1, c0 + TAU);
    ctx.closePath();
    ctx.fillStyle = lit(ctx, cx, cy, r, '#efc24e', 0.12);
    ctx.fill();
    // ...lying beside it, cut face up, full of holes.
    const wx = cx + Math.cos((c0 + c1) / 2) * m * 0.12;
    const wy = cy + Math.sin((c0 + c1) / 2) * m * 0.12;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.arc(wx, wy, r, c0, c1);
    ctx.closePath();
    ctx.fillStyle = '#f6d878';
    ctx.fill();
    ctx.strokeStyle = '#a8701a';
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, wy, r * 0.94, c0, c1);
    ctx.strokeStyle = '#d0902a';
    ctx.lineWidth = Math.max(0.6, r * 0.12);
    ctx.stroke();
    for (const [d, a, s] of [[0.45, 0.3, 0.06], [0.7, 0.62, 0.05], [0.62, 0.2, 0.035], [0.3, 0.7, 0.035]]) circle(ctx, wx + Math.cos(c0 + (c1 - c0) * a) * r * d, wy + Math.sin(c0 + (c1 - c0) * a) * r * d, m * s, '#d8a840');
  },
  wine_rack(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.5, h * 0.46, 1.4);
    rect(ctx, -w * 0.5, -h * 0.46, w, h * 0.92, '#5a3a1e', '#2e1d0d', Math.max(0.5, m * 0.04));
    rect(ctx, -w * 0.5, -h * 0.46, w, h * 0.14, '#6e4a2a');
    const cols = 9;
    const rows = 2;
    const cw = (w * 0.94) / cols;
    const ch = (h * 0.68) / rows;
    const glass = ['#2f5a3a', '#244a30', '#5a2a3a', '#2a3a2a', '#6a5a2a'];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = -w * 0.47 + c * cw + cw / 2;
        const y = -h * 0.29 + r * ch + ch / 2;
        rect(ctx, x - cw * 0.42, y - ch * 0.42, cw * 0.84, ch * 0.84, '#1a120a');
        if (rnd() < 0.12) continue;
        const br = Math.min(cw, ch) * 0.38;
        const col = glass[Math.floor(rnd() * glass.length)];
        circle(ctx, x, y, br, lit(ctx, x, y, br, col, 0.2), shade(col, -0.25), Math.max(0.5, m * 0.012));
        circle(ctx, x, y, br * 0.4, shade(col, -0.18));
        circle(ctx, x - br * 0.4, y - br * 0.4, br * 0.2, rgba('#ffffff', 0.45));
      }
    }
  },
  cask_rack(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.49, h * 0.44, 1.2);
    const thin = Math.max(0.5, m * 0.015);
    // The cradle: two long beams.
    for (const y of [-h * 0.26, h * 0.22]) rect(ctx, -w * 0.49, y - h * 0.06, w * 0.98, h * 0.12, '#5e3b1f', '#3a2410', thin);
    // Three casks on their sides, heads to the front, taps pointing down.
    for (const s of [-1, 0, 1]) {
      const x = s * w * 0.32;
      const r = w * 0.11;
      const y0 = -h * 0.42;
      const y1 = h * 0.38;
      const body = ctx.createLinearGradient(x - r, 0, x + r, 0);
      body.addColorStop(0, '#8a5d33');
      body.addColorStop(0.3, '#a8784a');
      body.addColorStop(1, '#4e321b');
      ctx.beginPath();
      ctx.moveTo(x - r * 0.86, y0);
      ctx.quadraticCurveTo(x - r * 1.14, (y0 + y1) / 2, x - r * 0.86, y1);
      ctx.lineTo(x + r * 0.86, y1);
      ctx.quadraticCurveTo(x + r * 1.14, (y0 + y1) / 2, x + r * 0.86, y0);
      ctx.closePath();
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = '#3a2410';
      ctx.lineWidth = Math.max(0.6, m * 0.025);
      ctx.stroke();
      for (const k of [-0.5, 0, 0.5]) line(ctx, x + k * r, y0, x + k * r * 1.1, y1, rgba('#3a2410', 0.45), thin, 'butt');
      for (const y of [y0 + h * 0.08, -h * 0.1, h * 0.06, y1 - h * 0.08]) line(ctx, x - r * 1.0, y, x + r * 1.0, y, '#3a3a3a', Math.max(0.8, m * 0.05), 'butt');
      rect(ctx, x - m * 0.04, y1, m * 0.08, h * 0.06, '#b8902f', '#6a5214', thin);
      rect(ctx, x - m * 0.08, y1 + h * 0.05, m * 0.16, h * 0.035, '#d4a72c', '#6a5214', thin);
    }
  },
  dishes(g) {
    const { ctx, w, h, m } = g;
    const thin = Math.max(0.5, m * 0.015);
    const drop = (x, y, r, k) => {
      ctx.save();
      ctx.translate(x, y);
      shadow(g, 'round', r, r, k);
      ctx.restore();
    };
    // A stack of blue-rimmed plates.
    const px = -w * 0.18;
    const py = h * 0.02;
    drop(px, py, m * 0.31, 0.6);
    for (let i = 0; i < 4; i += 1) circle(ctx, px + i * m * 0.012, py + i * m * 0.012, m * 0.3, '#ece6da', '#9a9284', thin);
    circle(ctx, px, py, m * 0.3, '#f2ede3', '#9a9284', thin);
    circle(ctx, px, py, m * 0.24, null, '#3a5a8a', Math.max(0.6, m * 0.025));
    circle(ctx, px, py, m * 0.15, null, rgba('#9a9284', 0.5), thin);
    // Two bowls stacked, and two cups.
    const bx = w * 0.24;
    const by = -h * 0.16;
    drop(bx, by, m * 0.19, 0.5);
    circle(ctx, bx + m * 0.015, by + m * 0.015, m * 0.18, '#b86a3a', '#6a3418', thin);
    circle(ctx, bx, by, m * 0.18, '#c87a48', '#6a3418', thin);
    circle(ctx, bx, by, m * 0.13, radial(ctx, bx, by, m * 0.13, '#9a5a32', '#c88a5a', bx + m * 0.04, by + m * 0.04));
    for (const [x, y] of [[w * 0.18, h * 0.26], [w * 0.38, h * 0.18]]) {
      drop(x, y, m * 0.095, 0.5);
      line(ctx, x, y, x + m * 0.1, y + m * 0.04, '#d8d0c0', Math.max(0.8, m * 0.04));
      circle(ctx, x, y, m * 0.09, '#ece6da', '#9a9284', thin);
      circle(ctx, x, y, m * 0.06, '#d0c8b8');
    }
  },
  jugs(g) {
    const { ctx, m } = g;
    const thin = Math.max(0.5, m * 0.015);
    const drop = (x, y, r, h) => {
      ctx.save();
      ctx.translate(x, y);
      shadow(g, 'round', r, r, h);
      ctx.restore();
    };
    // Two clay cups.
    for (const [x, y, c] of [[m * 0.24, m * 0.18, '#7a2a3a'], [-m * 0.22, m * 0.26, '#c8a060']]) {
      drop(x, y, m * 0.12, 0.6);
      circle(ctx, x, y, m * 0.12, lit(ctx, x, y, m * 0.12, '#b8643a', 0.15), '#6a3418', thin);
      circle(ctx, x, y, m * 0.085, c);
    }
    // The jug: handle, round belly, a pinched spout and dark mouth.
    const jx = -m * 0.04;
    const jy = -m * 0.08;
    drop(jx, jy, m * 0.26, 1);
    circle(ctx, jx + m * 0.28, jy + m * 0.02, m * 0.08, null, '#8a4222', Math.max(0.8, m * 0.05));
    circle(ctx, jx, jy, m * 0.26, lit(ctx, jx, jy, m * 0.26, '#c06a3a', 0.16), '#6a3418', thin);
    poly(ctx, [[jx - m * 0.1, jy - m * 0.08], [jx - m * 0.25, jy - m * 0.2], [jx - m * 0.06, jy - m * 0.14]], '#a85a30', '#6a3418', thin);
    circle(ctx, jx, jy, m * 0.12, '#8a4a28', '#6a3418', thin);
    circle(ctx, jx, jy, m * 0.08, '#2a1410');
  },
  cutting_board(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.46, h * 0.38, 0.3);
    const thin = Math.max(0.5, m * 0.015);
    // The board, with a handle and a hanging hole.
    rrect(ctx, w * 0.28, -h * 0.12, w * 0.2, h * 0.24, m * 0.08, '#b48a52', '#6a4a24', thin);
    circle(ctx, w * 0.4, 0, m * 0.04, '#5a3a1e');
    rrect(ctx, -w * 0.46, -h * 0.4, w * 0.78, h * 0.8, m * 0.08, lit(ctx, -w * 0.1, 0, w * 0.5, '#c09a62', 0.08), '#6a4a24', thin);
    for (const y of [-0.22, -0.05, 0.12, 0.27]) line(ctx, -w * 0.42, y * h, w * 0.28, y * h + h * 0.02, rgba('#8a6a3a', 0.5), Math.max(0.5, m * 0.008));
    // Carrot rounds, onion rings, and a carrot top.
    for (const [x, y] of [[-0.3, -0.2], [-0.22, -0.08], [-0.32, 0.02], [-0.14, -0.22], [-0.2, 0.12]]) {
      circle(ctx, x * w, y * h, m * 0.06, '#e07a2a', '#9a4a1a', thin);
      circle(ctx, x * w, y * h, m * 0.025, '#f0a050');
    }
    for (const [x, y, a] of [[0.02, -0.18, 0.4], [0.12, -0.12, 2.2], [0.06, 0.02, 4.0]]) {
      ctx.beginPath();
      ctx.arc(x * w, y * h, m * 0.07, a, a + Math.PI);
      ctx.strokeStyle = '#efe6c8';
      ctx.lineWidth = Math.max(0.6, m * 0.03);
      ctx.stroke();
    }
    for (const d of [-1, 0, 1]) line(ctx, -w * 0.36, h * 0.24, -w * 0.43 + d * m * 0.05, h * 0.36, '#4a8a3a', Math.max(0.6, m * 0.035));
    // The knife across it.
    ctx.save();
    ctx.translate(w * 0.02, h * 0.2);
    ctx.rotate(-0.35);
    poly(ctx, [[-m * 0.26, 0], [-m * 0.22, -m * 0.06], [m * 0.08, -m * 0.06], [m * 0.08, m * 0.02]], '#c8ccd2', '#5a5e64', thin);
    line(ctx, -m * 0.2, -m * 0.045, m * 0.06, -m * 0.045, rgba('#ffffff', 0.6), Math.max(0.5, m * 0.012), 'butt');
    rrect(ctx, m * 0.08, -m * 0.055, m * 0.2, m * 0.07, m * 0.025, '#3a2410');
    for (const x of [m * 0.13, m * 0.22]) circle(ctx, x, -m * 0.02, m * 0.012, '#c9a040');
    ctx.restore();
  },
  grill(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.46, h * 0.46, 0.9);
    // The iron firebox and its bed of glowing coals.
    rrect(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.92, m * 0.06, '#2b2b2e', '#111', Math.max(0.8, m * 0.03));
    rect(ctx, -w * 0.38, -h * 0.38, w * 0.76, h * 0.76, '#2a1a12');
    glow(ctx, 0, 0, m * 0.48, '#ff7b2a', 0.45);
    for (let i = 0; i < 26; i += 1) circle(ctx, (rnd() - 0.5) * w * 0.68, (rnd() - 0.5) * h * 0.68, m * (0.025 + rnd() * 0.03), ['#ff4a1a', '#ff8a2a', '#ffc94a', '#7a2a10', '#3a1a10'][Math.floor(rnd() * 5)]);
    // The grate.
    for (let i = 0; i < 8; i += 1) {
      const y = -h * 0.35 + (h * 0.7 * i) / 7;
      line(ctx, -w * 0.4, y, w * 0.4, y, '#1a1a1c', Math.max(0.8, m * 0.035), 'butt');
      line(ctx, -w * 0.4, y - m * 0.008, w * 0.4, y - m * 0.008, rgba('#8a8a8a', 0.5), Math.max(0.5, m * 0.01), 'butt');
    }
    for (const s of [-1, 1]) line(ctx, s * w * 0.4, -h * 0.38, s * w * 0.4, h * 0.38, '#1a1a1c', Math.max(0.8, m * 0.04), 'butt');
    // Two steaks with grill marks, and a skewer.
    for (const [x, y, a] of [[-0.17, -0.12, 0.3], [0.16, -0.16, -0.4]]) {
      ctx.save();
      ctx.translate(x * w, y * h);
      ctx.rotate(a);
      smoothShape(ctx, [[-m * 0.15, -m * 0.08], [m * 0.02, -m * 0.12], [m * 0.15, -m * 0.06], [m * 0.13, m * 0.08], [-m * 0.02, m * 0.11], [-m * 0.14, m * 0.06]], lit(ctx, 0, 0, m * 0.15, '#9a4a2a', 0.12), '#4a1a0a', Math.max(0.5, m * 0.015));
      for (const d of [-1, 0, 1]) line(ctx, d * m * 0.06 - m * 0.04, -m * 0.08, d * m * 0.06 + m * 0.04, m * 0.08, '#3a1408', Math.max(0.6, m * 0.02));
      ctx.restore();
    }
    line(ctx, -w * 0.42, h * 0.22, w * 0.42, h * 0.16, '#b0b4ba', Math.max(0.6, m * 0.02));
    for (let i = 0; i < 6; i += 1) {
      const x = -w * 0.3 + i * w * 0.12;
      const y = h * 0.22 - ((x + w * 0.42) / (w * 0.84)) * h * 0.06;
      const c = ['#8a3a22', '#c0392b', '#e8d8a8', '#8a3a22', '#4a8a3a', '#8a3a22'][i];
      rrect(ctx, x - m * 0.045, y - m * 0.045, m * 0.09, m * 0.09, m * 0.02, c, shade(c, -0.3), Math.max(0.5, m * 0.01));
    }
  },
  hanging_sign(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.42, h * 0.32, 3);
    const thin = Math.max(0.5, m * 0.025);
    const iron = '#2b2b2e';
    // The iron bracket from its plate on the wall: an arm out to a crossbar, with scrolls.
    rect(ctx, -w * 0.09, -h * 0.5, w * 0.18, h * 0.12, iron, '#111', thin);
    line(ctx, 0, -h * 0.42, 0, -h * 0.24, iron, Math.max(1, m * 0.09));
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * w * 0.04, -h * 0.4);
      ctx.quadraticCurveTo(s * w * 0.2, -h * 0.42, s * w * 0.24, -h * 0.26);
      ctx.strokeStyle = iron;
      ctx.lineWidth = Math.max(0.6, m * 0.05);
      ctx.lineCap = 'round';
      ctx.stroke();
      circle(ctx, s * w * 0.44, -h * 0.24, m * 0.06, iron);
    }
    line(ctx, -w * 0.44, -h * 0.24, w * 0.44, -h * 0.24, iron, Math.max(1, m * 0.08));
    // Rings, and the board swinging below with its painted face showing.
    for (const x of [-w * 0.3, w * 0.3]) circle(ctx, x, -h * 0.15, m * 0.05, null, iron, Math.max(0.6, m * 0.03));
    poly(ctx, [[-w * 0.39, -h * 0.08], [w * 0.39, -h * 0.08], [w * 0.36, h * 0.44], [-w * 0.36, h * 0.44]], lit(ctx, -w * 0.1, h * 0.1, w * 0.45, t, 0.1), shade(t, -0.35), Math.max(0.6, m * 0.05));
    rect(ctx, -w * 0.39, -h * 0.08, w * 0.78, h * 0.07, shade(t, -0.18));
    poly(ctx, [[-w * 0.33, h * 0.04], [w * 0.33, h * 0.04], [w * 0.31, h * 0.36], [-w * 0.31, h * 0.36]], null, '#d4a72c', thin);
    // A gilt goblet painted on it.
    const gy = h * 0.2;
    poly(ctx, [[-m * 0.16, gy - m * 0.2], [m * 0.16, gy - m * 0.2], [m * 0.08, gy + m * 0.02], [-m * 0.08, gy + m * 0.02]], '#e0b83a', '#7a5a14', Math.max(0.5, m * 0.015));
    line(ctx, 0, gy, 0, gy + m * 0.14, '#e0b83a', Math.max(0.6, m * 0.05), 'butt');
    line(ctx, -m * 0.09, gy + m * 0.15, m * 0.09, gy + m * 0.15, '#e0b83a', Math.max(0.6, m * 0.05));
  },
  stage(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.49, h * 0.47, 0.4);
    // The front of the platform, then honey boards running across with staggered joints.
    rect(ctx, -w * 0.49, h * 0.36, w * 0.98, h * 0.12, '#4a3018');
    for (let i = 1; i < 12; i += 1) line(ctx, -w * 0.49 + (w * 0.98 * i) / 12, h * 0.38, -w * 0.49 + (w * 0.98 * i) / 12, h * 0.48, rgba('#2e1d0d', 0.6), Math.max(0.5, m * 0.012), 'butt');
    planks(g, -w * 0.49, -h * 0.47, w * 0.98, h * 0.83, '#a87c4a', 8, true, 0.22);
    for (let r = 0; r < 8; r += 1) {
      for (let k = 0; k < 2; k += 1) {
        const x = -w * 0.49 + w * 0.98 * ((k + 0.25 + (r % 3) * 0.2 + rnd() * 0.1) / 2);
        line(ctx, x, -h * 0.47 + (h * 0.83 * r) / 8, x, -h * 0.47 + (h * 0.83 * (r + 1)) / 8, rgba('#4a3018', 0.6), Math.max(0.5, m * 0.012), 'butt');
      }
    }
    // The lighter front edge, with footlights along it.
    rect(ctx, -w * 0.49, h * 0.31, w * 0.98, h * 0.06, '#d0aa72', '#6a4a26', Math.max(0.5, m * 0.01));
    rect(ctx, -w * 0.49, -h * 0.47, w * 0.98, h * 0.95, null, '#3a2410', Math.max(0.8, m * 0.03));
    for (let i = 0; i < 5; i += 1) candle(g, -w * 0.36 + (w * 0.72 * i) / 4, h * 0.34, m * 0.028);
    // The curtain rail along the back, the drapes gathered at both sides.
    const cy = -h * 0.45;
    const thick = (x) => h * (0.035 + 0.11 * Math.max(0, (Math.abs(x) / (w * 0.49) - 0.62) / 0.38));
    const pts = [];
    const steps = 48;
    for (let i = 0; i <= steps; i += 1) {
      const x = -w * 0.49 + (w * 0.98 * i) / steps;
      pts.push([x, cy + thick(x) + Math.sin(i * 1.9) * h * 0.012]);
    }
    const folds = ctx.createLinearGradient(-w * 0.49, 0, w * 0.49, 0);
    for (let i = 0; i <= 24; i += 1) folds.addColorStop(i / 24, i % 2 ? '#6a1a20' : '#8e2a30');
    poly(ctx, [[-w * 0.49, cy - h * 0.015], [w * 0.49, cy - h * 0.015], ...pts.reverse()], folds, '#3a0e10', Math.max(0.5, m * 0.012));
    line(ctx, -w * 0.49, cy, w * 0.49, cy, '#2b2b2e', Math.max(1, m * 0.025));
    for (const s of [-1, 1]) {
      line(ctx, s * w * 0.4, cy + h * 0.02, s * w * 0.4, cy + thick(s * w * 0.4) + h * 0.01, '#d4a72c', Math.max(0.8, m * 0.03));
      circle(ctx, s * w * 0.4, cy + thick(s * w * 0.4) + h * 0.01, m * 0.025, '#d4a72c');
    }
  },
};
