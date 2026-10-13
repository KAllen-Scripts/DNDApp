/**
 * Built-in assets of the map creator: the farm and the town (map-design.js ASSETS), drawn
 * in code like the rest (map-art-assets.js, which merges these in).
 */
import { TAU, shade, rgba, circle, oval, rect, rrect, poly, line, polyline, blobPoints, smoothShape, radial, glow } from './map-paint.js';
import { shadow, lit, canopy, planks, fire, band, wheel } from './map-art-pieces.js';

export const ART_FARM = {
  // ----- Farm -----
  haystack(g) {
    const { ctx, m, rnd } = g;
    const base = '#c9a24c';
    const r = m * 0.45;
    const thin = Math.max(0.5, m * 0.009);
    // Loose straw on the ground round its foot.
    for (let i = 0; i < 30; i += 1) {
      const a = rnd() * TAU;
      const d = r * (0.92 + rnd() * 0.14);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const b = a + (rnd() - 0.5) * 2;
      line(ctx, x, y, x + Math.cos(b) * m * 0.05, y + Math.sin(b) * m * 0.05, shade(base, (rnd() - 0.5) * 0.24), thin);
    }
    shadow(g, 'round', r * 1.02, r * 1.02, 1.6);
    // The stack: a ragged round edge, lit like a dome.
    smoothShape(ctx, blobPoints(0, 0, r, r, 26, 0.07, rnd), radial(ctx, 0, 0, r, shade(base, 0.12), shade(base, -0.2), -r * 0.4, -r * 0.4), shade(base, -0.38), Math.max(0.8, m * 0.014));
    // Straw strokes spiralling out from the top.
    for (let i = 0; i < 150; i += 1) {
      const d0 = r * (0.12 + 0.82 * Math.sqrt(rnd()));
      const a0 = rnd() * TAU;
      const sweep = 0.22 + rnd() * 0.2;
      const d1 = Math.min(r * 0.97, d0 * (1 + sweep * 0.6));
      const pts = [0, 0.5, 1].map((k) => [Math.cos(a0 + sweep * k) * (d0 + (d1 - d0) * k), Math.sin(a0 + sweep * k) * (d0 + (d1 - d0) * k)]);
      const sun = -(pts[1][0] + pts[1][1]) / (r * 1.5);
      polyline(ctx, pts, shade(base, sun * 0.2 + (rnd() - 0.5) * 0.16), thin);
    }
    // The peak: sunlit straw round the top of the rick's pole.
    const tx = -r * 0.06;
    circle(ctx, tx, tx, r * 0.26, radial(ctx, tx, tx, r * 0.26, rgba(shade(base, 0.22), 0.7), rgba(shade(base, 0.22), 0)));
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU + rnd() * 0.4;
      const l = r * (0.1 + rnd() * 0.1);
      line(ctx, tx, tx, tx + Math.cos(a) * l, tx + Math.sin(a) * l, shade(base, 0.1 + (rnd() - 0.5) * 0.15), thin);
    }
  },
  scarecrow(g) {
    const { ctx, m, rnd } = g;
    const lw = Math.max(0.5, m * 0.014);
    shadow(g, 'rect', m * 0.42, m * 0.08, 1.8);
    shadow(g, 'round', m * 0.18, m * 0.26, 1.8);
    // The crossbar, poking out of the sleeves.
    line(ctx, -m * 0.47, -m * 0.04, m * 0.47, -m * 0.04, '#5e4128', Math.max(1, m * 0.05));
    // Straw sticking out of the cuffs and the hem.
    const straw = (x, y, a, n, len) => {
      for (let i = 0; i < n; i += 1) {
        const b = a + (rnd() - 0.5) * 1.3;
        const l = len * (0.6 + rnd() * 0.5);
        line(ctx, x, y, x + Math.cos(b) * l, y + Math.sin(b) * l, shade('#d6b45e', (rnd() - 0.5) * 0.25), Math.max(0.5, m * 0.012));
      }
    };
    straw(-m * 0.38, -m * 0.045, Math.PI, 8, m * 0.1);
    straw(m * 0.38, -m * 0.045, 0, 8, m * 0.1);
    straw(0, m * 0.27, Math.PI / 2, 9, m * 0.12);
    // The ragged coat: arms along the bar, a body hanging down.
    const shirt = '#9a4b38';
    const pts = [[-0.14, -0.14], [0.14, -0.14], [0.36, -0.13], [0.42, -0.1], [0.37, -0.07], [0.43, -0.04], [0.37, -0.01], [0.41, 0.03], [0.34, 0.045], [0.15, 0.05], [0.16, 0.27], [0.11, 0.23], [0.07, 0.3], [0.02, 0.24], [-0.03, 0.31], [-0.07, 0.24], [-0.11, 0.29], [-0.16, 0.25], [-0.15, 0.05], [-0.34, 0.045], [-0.41, 0.03], [-0.37, -0.01], [-0.43, -0.04], [-0.37, -0.07], [-0.42, -0.1], [-0.36, -0.13]].map(([x, y]) => [x * m, y * m]);
    poly(ctx, pts, lit(ctx, 0, 0, m * 0.4, shirt, 0.1), shade(shirt, -0.32), lw);
    // Patches, creases and a rope belt.
    rect(ctx, -m * 0.31, -m * 0.115, m * 0.1, m * 0.1, '#5a7088', shade('#5a7088', -0.3), Math.max(0.5, m * 0.01));
    rect(ctx, m * 0.03, m * 0.14, m * 0.08, m * 0.08, '#c8a86e', shade('#c8a86e', -0.3), Math.max(0.5, m * 0.01));
    for (const x of [-0.22, 0.2, 0.26]) line(ctx, x * m, -m * 0.12, (x + 0.02) * m, m * 0.03, rgba(shade(shirt, -0.3), 0.6), Math.max(0.5, m * 0.01));
    line(ctx, -m * 0.15, m * 0.1, m * 0.15, m * 0.1, '#c8b07a', Math.max(0.6, m * 0.024));
    // The straw hat (round brim) where the head is.
    const hy = -m * 0.05;
    circle(ctx, 0, hy, m * 0.2, lit(ctx, 0, hy, m * 0.2, '#d6b45e', 0.14), '#8a6a2a', lw);
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * TAU;
      line(ctx, Math.cos(a) * m * 0.12, hy + Math.sin(a) * m * 0.12, Math.cos(a) * m * 0.19, hy + Math.sin(a) * m * 0.19, rgba('#8a6a2a', 0.45), Math.max(0.5, m * 0.008));
    }
    circle(ctx, 0, hy, m * 0.115, lit(ctx, 0, hy, m * 0.115, '#c9a24c', 0.16), '#8a6a2a', lw);
    circle(ctx, 0, hy, m * 0.115, null, '#7a3a2a', Math.max(0.6, m * 0.02));
    // A crow perched on one arm.
    const cx = m * 0.28;
    const cy = -m * 0.05;
    oval(ctx, cx + m * 0.015, cy + m * 0.02, m * 0.065, m * 0.038, 0.2, 'rgba(0,0,0,0.3)');
    poly(ctx, [[cx - m * 0.045, cy - m * 0.016], [cx - m * 0.1, cy - m * 0.03], [cx - m * 0.1, cy + m * 0.025], [cx - m * 0.045, cy + m * 0.018]], '#1c1c22');
    oval(ctx, cx, cy, m * 0.062, m * 0.037, 0.12, '#26262e', '#0e0e12', Math.max(0.5, m * 0.008));
    oval(ctx, cx - m * 0.01, cy - m * 0.012, m * 0.035, m * 0.012, 0.12, rgba('#6a7a9a', 0.5));
    circle(ctx, cx + m * 0.06, cy + m * 0.006, m * 0.026, '#2e2e36');
    poly(ctx, [[cx + m * 0.078, cy - m * 0.008], [cx + m * 0.115, cy + m * 0.008], [cx + m * 0.078, cy + m * 0.02]], '#8a8070');
  },
  beehives(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.46, h * 0.3, 1);
    // The plank stand, its legs at the ends.
    for (const s of [-1, 1]) rect(ctx, s * w * 0.4 - w * 0.05, -h * 0.3, w * 0.1, h * 0.6, '#3e2914');
    planks(g, -w * 0.47, -h * 0.24, w * 0.94, h * 0.48, '#8b623a', 2, true, 0.25);
    rect(ctx, -w * 0.47, -h * 0.24, w * 0.94, h * 0.48, null, '#4a3018', Math.max(0.5, m * 0.025));
    // Straw skeps: coiled domes with a little door at the front.
    const skep = (x, y, r) => {
      circle(ctx, x + r * 0.14, y + r * 0.18, r * 1.02, 'rgba(0,0,0,0.3)');
      circle(ctx, x, y, r, radial(ctx, x, y, r, '#e2b864', '#8a6428', x - r * 0.4, y - r * 0.4), '#5e4018', Math.max(0.6, m * 0.014));
      // Coils of straw rope, rising to the top: each a dark groove with a sunlit ridge.
      for (let k = 1; k <= 4; k += 1) {
        const rr = r * (1 - k * 0.19);
        const o = r * 0.05 * k;
        circle(ctx, x - o, y - o, rr, null, rgba('#5e4018', 0.75), Math.max(0.5, m * 0.012));
        ctx.beginPath();
        ctx.arc(x - o, y - o, rr + r * 0.08, Math.PI * 0.85, Math.PI * 1.65);
        ctx.strokeStyle = rgba('#f6dc98', 0.55);
        ctx.lineWidth = Math.max(0.5, m * 0.01);
        ctx.stroke();
      }
      circle(ctx, x - r * 0.22, y - r * 0.22, r * 0.1, '#e8c477');
      oval(ctx, x, y + r * 0.86, r * 0.24, r * 0.12, 0, '#2a1a0a');
    };
    skep(-w * 0.3, 0, m * 0.155);
    skep(0, -h * 0.03, m * 0.165);
    skep(w * 0.3, h * 0.01, m * 0.155);
    // Bees.
    for (let i = 0; i < 7; i += 1) {
      const x = (rnd() - 0.5) * w * 0.9;
      const y = h * (0.24 + rnd() * 0.2) * (i % 3 ? 1 : -1.6);
      oval(ctx, x, y, m * 0.018, m * 0.012, rnd() * TAU, '#f2c12e', '#2a1a0a', Math.max(0.4, m * 0.006));
    }
  },
  chicken_coop(g) {
    const { ctx, w, h, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.01);
    // Straw and grain scattered on the ground in front.
    smoothShape(ctx, blobPoints(w * 0.12, h * 0.2, w * 0.36, h * 0.28, 10, 0.3, rnd), rgba('#c9a54e', 0.28));
    for (let i = 0; i < 46; i += 1) {
      const x = w * (-0.2 + rnd() * 0.66);
      const y = h * (-0.1 + rnd() * 0.56);
      const a = rnd() * TAU;
      line(ctx, x, y, x + Math.cos(a) * m * 0.05, y + Math.sin(a) * m * 0.05, shade('#d2b25a', (rnd() - 0.5) * 0.3), thin);
    }
    // The hut: a pitched roof, ridge across.
    const x0 = -w * 0.47;
    const x1 = w * 0.1;
    const y0 = -h * 0.46;
    const y1 = h * 0.14;
    const ry = (y0 + y1) / 2;
    ctx.save();
    ctx.translate((x0 + x1) / 2, ry);
    shadow(g, 'rect', (x1 - x0) / 2, (y1 - y0) / 2, 1.3);
    ctx.restore();
    // The ramp, from under the eave down to the yard.
    const rx = -w * 0.2;
    const rw = w * 0.11;
    rect(ctx, rx - rw / 2, y1 - h * 0.02, rw, h * 0.34, '#9a7048', '#4a3018', thin);
    for (let i = 0; i < 5; i += 1) line(ctx, rx - rw * 0.45, y1 + h * (0.04 + i * 0.06), rx + rw * 0.45, y1 + h * (0.04 + i * 0.06), '#5b3d22', Math.max(0.6, m * 0.018), 'butt');
    // A nest box leaning on its side.
    planks(g, x1 - w * 0.01, -h * 0.34, w * 0.1, h * 0.3, '#7d5a36', 3, true, 0.25);
    rect(ctx, x1 - w * 0.01, -h * 0.34, w * 0.1, h * 0.3, null, '#3e2914', thin);
    const roof = '#8b6a44';
    planks(g, x0, y0, x1 - x0, ry - y0, shade(roof, 0.07), 7, false, 0.22);
    planks(g, x0, ry, x1 - x0, y1 - ry, shade(roof, -0.09), 7, false, 0.22);
    rect(ctx, x0, ry - m * 0.025, x1 - x0, m * 0.05, '#5b3d22');
    rect(ctx, x0, y0, x1 - x0, y1 - y0, null, '#3a2410', Math.max(0.8, m * 0.025));
    // A few hens.
    const hen = (x, y, a, c) => {
      const s = m * 0.075;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      oval(ctx, s * 0.15, s * 0.25, s * 0.95, s * 0.8, 0, 'rgba(0,0,0,0.25)');
      // a short fan of tail, a plump body, folded wings
      poly(ctx, [[-s * 0.5, -s * 0.28], [-s * 1.02, -s * 0.38], [-s * 1.1, 0], [-s * 1.02, s * 0.38], [-s * 0.5, s * 0.28]], shade(c, -0.16), shade(c, -0.4), thin);
      oval(ctx, 0, 0, s * 0.85, s * 0.72, 0, lit(ctx, 0, 0, s * 0.85, c, 0.12), shade(c, -0.35), thin);
      oval(ctx, -s * 0.12, -s * 0.4, s * 0.5, s * 0.22, -0.1, shade(c, -0.08));
      oval(ctx, -s * 0.12, s * 0.4, s * 0.5, s * 0.22, 0.1, shade(c, -0.11));
      // the head: red comb on top, yellow beak
      circle(ctx, s * 0.8, 0, s * 0.34, lit(ctx, s * 0.8, 0, s * 0.34, c, 0.1), shade(c, -0.35), thin);
      oval(ctx, s * 0.78, 0, s * 0.3, s * 0.12, 0, '#d0382a');
      poly(ctx, [[s * 1.08, -s * 0.11], [s * 1.38, 0], [s * 1.08, s * 0.11]], '#e8a830');
      ctx.restore();
    };
    hen(w * 0.3, -h * 0.24, 2.6, '#efe9dc');
    hen(w * 0.36, h * 0.16, -0.5, '#a8683a');
    hen(w * 0.12, h * 0.36, 0.4, '#efe9dc');
  },
  kennel(g) {
    const { ctx, w, h, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.012);
    const x0 = -w * 0.44;
    const x1 = w * 0.22;
    const y0 = -h * 0.46;
    const y1 = h * 0.24;
    const xm = (x0 + x1) / 2;
    ctx.save();
    ctx.translate(xm, (y0 + y1) / 2 + h * 0.05);
    shadow(g, 'rect', (x1 - x0) / 2, (y1 - y0) / 2 + h * 0.05, 1.1);
    ctx.restore();
    // The front wall under the eave, with its arched door.
    rect(ctx, xm - w * 0.25, y1 - h * 0.02, w * 0.5, h * 0.17, '#9a7048', '#4a3018', thin);
    ctx.beginPath();
    ctx.moveTo(xm - w * 0.09, y1 + h * 0.15);
    ctx.lineTo(xm - w * 0.09, y1 + h * 0.07);
    ctx.arc(xm, y1 + h * 0.07, w * 0.09, Math.PI, 0);
    ctx.lineTo(xm + w * 0.09, y1 + h * 0.15);
    ctx.closePath();
    ctx.fillStyle = '#1e140c';
    ctx.fill();
    // The pitched roof, ridge front to back.
    const roof = '#9a4a3a';
    rect(ctx, x0, y0, xm - x0, y1 - y0, shade(roof, 0.07));
    rect(ctx, xm, y0, x1 - xm, y1 - y0, shade(roof, -0.1));
    // Courses of shingles run along the ridge, each overlapping the one below it.
    const courses = 3;
    const sw = (xm - x0) / courses;
    for (const side of [-1, 1]) {
      for (let c = 0; c < courses; c += 1) {
        const xa = side < 0 ? xm - (c + 1) * sw : xm + c * sw;
        const edge = side < 0 ? xa : xa + sw;
        line(ctx, edge, y0, edge, y1, rgba(shade(roof, -0.35), 0.75), Math.max(0.6, m * 0.016), 'butt');
        for (let r = 0; r < 6; r += 1) {
          const y = y0 + ((y1 - y0) * (r + (c % 2 ? 0.5 : 0))) / 6;
          if (y > y0 && y < y1) line(ctx, xa, y, xa + sw, y, rgba(shade(roof, -0.3), 0.5), thin, 'butt');
        }
      }
    }
    rect(ctx, xm - m * 0.035, y0, m * 0.07, y1 - y0, shade(roof, -0.2), shade(roof, -0.4), thin);
    rect(ctx, x0, y0, x1 - x0, y1 - y0, null, shade(roof, -0.4), Math.max(0.8, m * 0.025));
    // A bowl of food and a bone.
    const bx = w * 0.34;
    const by = h * 0.32;
    circle(ctx, bx + m * 0.02, by + m * 0.025, m * 0.12, 'rgba(0,0,0,0.25)');
    circle(ctx, bx, by, m * 0.12, lit(ctx, bx, by, m * 0.12, '#9aa0a8', 0.15), '#4a4e54', thin);
    circle(ctx, bx, by, m * 0.085, '#5a4030');
    for (let i = 0; i < 6; i += 1) circle(ctx, bx + (rnd() - 0.5) * m * 0.1, by + (rnd() - 0.5) * m * 0.1, m * 0.018, '#8a5a32');
    ctx.save();
    ctx.translate(w * 0.35, -h * 0.12);
    ctx.rotate(1.1);
    line(ctx, -m * 0.08, 0, m * 0.08, 0, '#ece4cc', m * 0.035);
    for (const s of [-1, 1]) {
      circle(ctx, s * m * 0.08, -m * 0.018, m * 0.022, '#ece4cc');
      circle(ctx, s * m * 0.08, m * 0.018, m * 0.022, '#ece4cc');
    }
    ctx.restore();
  },
  vegetable_patch(g) {
    const { ctx, w, h, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.008);
    // The bed: dark soil, raised rows.
    rect(ctx, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96, '#4a3322');
    const rows = 4;
    const rowY = (r) => -h * 0.4 + (h * 0.8 * (r + 0.5)) / rows;
    for (let r = 0; r < rows; r += 1) {
      const y = rowY(r);
      const gr = ctx.createLinearGradient(0, y - h * 0.08, 0, y + h * 0.08);
      gr.addColorStop(0, '#6e4e30');
      gr.addColorStop(1, '#4e3520');
      rrect(ctx, -w * 0.43, y - h * 0.075, w * 0.86, h * 0.15, h * 0.06, gr);
      for (let i = 0; i < 10; i += 1) circle(ctx, -w * 0.42 + rnd() * w * 0.84, y + (rnd() - 0.5) * h * 0.12, m * 0.006, rgba('#2e1e12', 0.6));
    }
    const leaf = '#5f9a3a';
    const cabbage = (x, y, r, c) => {
      circle(ctx, x + r * 0.15, y + r * 0.2, r * 1.15, 'rgba(0,0,0,0.25)');
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * TAU + rnd() * 0.5;
        oval(ctx, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.6, r * 0.42, a, shade(c, -0.12), shade(c, -0.32), thin);
      }
      circle(ctx, x, y, r * 0.62, lit(ctx, x, y, r * 0.62, shade(c, 0.12), 0.14), shade(c, -0.25), thin);
      ctx.beginPath();
      ctx.arc(x - r * 0.1, y - r * 0.05, r * 0.4, -0.3, 2.2);
      ctx.strokeStyle = rgba(shade(c, -0.25), 0.7);
      ctx.lineWidth = thin;
      ctx.stroke();
    };
    const carrot = (x, y, r) => {
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * TAU + rnd() * 0.6;
        const ex = x + Math.cos(a) * r;
        const ey = y + Math.sin(a) * r;
        line(ctx, x, y, ex, ey, shade(leaf, (rnd() - 0.5) * 0.15), Math.max(0.5, m * 0.007));
        for (const k2 of [0.45, 0.75, 1]) oval(ctx, x + (ex - x) * k2, y + (ey - y) * k2, r * 0.2, r * 0.09, a + 0.6, shade(leaf, 0.05 + (rnd() - 0.5) * 0.15));
      }
      circle(ctx, x, y, r * 0.2, '#e07a2a', '#9a4a14', thin);
    };
    const beet = (x, y, r) => {
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * TAU + rnd() * 0.5;
        const lx = x + Math.cos(a) * r * 0.55;
        const ly = y + Math.sin(a) * r * 0.55;
        oval(ctx, lx, ly, r * 0.55, r * 0.3, a, lit(ctx, lx, ly, r * 0.55, '#3f6e34', 0.1), '#2a4a22', thin);
        line(ctx, x, y, x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, '#a8324a', Math.max(0.5, m * 0.008));
      }
      circle(ctx, x, y, r * 0.18, '#7a1e3a');
    };
    for (let r = 0; r < rows; r += 1) {
      const y = rowY(r);
      const n = r % 2 ? 7 : 5;
      for (let i = 0; i < n; i += 1) {
        const x = -w * 0.43 + (w * 0.86 * (i + 0.5)) / n + (rnd() - 0.5) * w * 0.02;
        const yy = y + (rnd() - 0.5) * h * 0.02;
        if (r === 0) cabbage(x, yy, m * 0.07, '#8fb85a');
        else if (r === 1) carrot(x, yy, m * 0.055);
        else if (r === 2) cabbage(x, yy, m * 0.065, '#76649a');
        else beet(x, yy, m * 0.06);
      }
    }
    // The plank edging.
    rect(ctx, -w * 0.47, -h * 0.47, w * 0.94, h * 0.94, null, '#7a5532', Math.max(1, m * 0.035));
    rect(ctx, -w * 0.49, -h * 0.49, w * 0.98, h * 0.98, null, '#3e2914', Math.max(0.5, m * 0.01));
  },
  pumpkins(g) {
    const { ctx, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.012);
    const vine = '#4a7a2e';
    const leafy = (x, y, r, a) => {
      const pts = [];
      for (let i = 0; i < 10; i += 1) {
        const b = a + (i / 10) * TAU;
        const rr = r * (i % 2 ? 0.7 : 1) * (0.9 + rnd() * 0.2);
        pts.push([x + Math.cos(b) * rr, y + Math.sin(b) * rr]);
      }
      smoothShape(ctx, pts, lit(ctx, x, y, r, shade('#3f7a33', (rnd() - 0.5) * 0.1), 0.12), '#264a1e', thin);
      for (let i = 0; i < 5; i += 1) {
        const b = a + (i / 5) * TAU;
        line(ctx, x, y, x + Math.cos(b) * r * 0.75, y + Math.sin(b) * r * 0.75, rgba('#264a1e', 0.6), Math.max(0.5, m * 0.008));
      }
    };
    const tendril = (x, y, r, a0, dir) => {
      const pts = [];
      for (let i = 0; i <= 12; i += 1) {
        const k = i / 12;
        const a = a0 + dir * k * 3 * Math.PI;
        pts.push([x + Math.cos(a) * r * (1 - k * 0.8), y + Math.sin(a) * r * (1 - k * 0.8)]);
      }
      polyline(ctx, pts, vine, Math.max(0.5, m * 0.01));
    };
    const pumpkin = (x, y, r, c) => {
      circle(ctx, x + r * 0.15, y + r * 0.2, r * 1.02, 'rgba(0,0,0,0.3)');
      const n = 8;
      const pts = [];
      for (let i = 0; i < n * 2; i += 1) {
        const a = (i / (n * 2)) * TAU;
        const k = i % 2 ? 0.9 : 1.04;
        pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]);
      }
      smoothShape(ctx, pts, lit(ctx, x, y, r, c, 0.18), shade(c, -0.35), thin);
      for (let i = 0; i < n; i += 1) {
        const a = ((i + 0.5) / n) * TAU;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.16);
        ctx.quadraticCurveTo(x + Math.cos(a + 0.18) * r * 0.55, y + Math.sin(a + 0.18) * r * 0.55, x + Math.cos(a) * r * 0.88, y + Math.sin(a) * r * 0.88);
        ctx.strokeStyle = rgba(shade(c, -0.3), 0.8);
        ctx.lineWidth = Math.max(0.5, m * 0.012);
        ctx.stroke();
      }
      circle(ctx, x - r * 0.3, y - r * 0.35, r * 0.18, rgba('#ffffff', 0.18));
      circle(ctx, x, y, r * 0.15, '#6a6a2a', '#3a3a14', thin);
      line(ctx, x, y, x + r * 0.22, y - r * 0.2, '#5a5a24', Math.max(0.8, r * 0.12));
    };
    leafy(-m * 0.3, -m * 0.24, m * 0.16, 0.3);
    leafy(m * 0.32, m * 0.06, m * 0.15, 1.2);
    leafy(-m * 0.28, m * 0.3, m * 0.14, 2.1);
    leafy(m * 0.04, -m * 0.36, m * 0.12, 0.8);
    polyline(ctx, [[-m * 0.42, -m * 0.05], [-m * 0.2, 0], [0, m * 0.04], [m * 0.18, -m * 0.12], [m * 0.36, -m * 0.3]], vine, Math.max(0.6, m * 0.022));
    polyline(ctx, [[-m * 0.1, m * 0.1], [m * 0.05, m * 0.3], [m * 0.26, m * 0.36]], vine, Math.max(0.6, m * 0.02));
    tendril(m * 0.4, -m * 0.36, m * 0.05, 0, 1);
    tendril(-m * 0.42, -m * 0.1, m * 0.045, 1, -1);
    tendril(m * 0.3, m * 0.42, m * 0.04, 2, 1);
    pumpkin(-m * 0.12, m * 0.06, m * 0.22, '#d9822b');
    pumpkin(m * 0.2, -m * 0.16, m * 0.15, '#e0902e');
    pumpkin(m * 0.22, m * 0.26, m * 0.12, '#c8702a');
  },
  sunflowers(g) {
    const { ctx, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.01);
    shadow(g, 'round', m * 0.42, m * 0.42, 1.5);
    // Broad leaves underneath.
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU + rnd() * 0.4;
      const d = m * (0.26 + rnd() * 0.1);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const c = shade('#4f8a3a', (rnd() - 0.5) * 0.12);
      oval(ctx, x, y, m * 0.14, m * 0.08, a, lit(ctx, x, y, m * 0.14, c, 0.12), shade(c, -0.3), thin);
      line(ctx, x - Math.cos(a) * m * 0.12, y - Math.sin(a) * m * 0.12, x + Math.cos(a) * m * 0.12, y + Math.sin(a) * m * 0.12, rgba(shade(c, -0.3), 0.7), thin);
    }
    const head = (x, y, r) => {
      circle(ctx, x + r * 0.12, y + r * 0.16, r, 'rgba(0,0,0,0.25)');
      const n = 16;
      const rot = rnd();
      for (let k = 0; k < n; k += 1) {
        const a = rot + (k / n) * TAU;
        oval(ctx, x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72, r * 0.3, r * 0.11, a, '#e0a020', '#9a6a10', Math.max(0.4, m * 0.006));
      }
      for (let k = 0; k < n; k += 1) {
        const a = rot + ((k + 0.5) / n) * TAU;
        oval(ctx, x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66, r * 0.28, r * 0.11, a, '#f2c12e');
      }
      circle(ctx, x, y, r * 0.48, radial(ctx, x, y, r * 0.48, '#7a4a22', '#3a2210', x - r * 0.12, y - r * 0.12), '#2a1808', thin);
      for (let k = 0; k < 14; k += 1) {
        const a = k * 2.4;
        const d = r * 0.4 * Math.sqrt((k + 0.5) / 14);
        circle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.04, rgba('#c8a060', 0.6));
      }
    };
    head(-m * 0.15, -m * 0.12, m * 0.2);
    head(m * 0.19, -m * 0.02, m * 0.17);
    head(-m * 0.02, m * 0.22, m * 0.18);
  },
  orchard_tree(g) {
    const { ctx, m, rnd } = g;
    const apple = (x, y, r) => {
      circle(ctx, x, y, r, lit(ctx, x, y, r, '#c0392b', 0.2), '#6a1a12', Math.max(0.5, r * 0.18));
      circle(ctx, x - r * 0.35, y - r * 0.35, r * 0.28, rgba('#ffffff', 0.45));
    };
    // Windfalls on the ground, in the corners under the crown's edge.
    for (const [a, d] of [[0.8, 0.53], [2.3, 0.5], [3.95, 0.52], [5.5, 0.51], [1.1, 0.48], [0.55, 0.5]]) apple(Math.cos(a) * m * d, Math.sin(a) * m * d, m * 0.03);
    shadow(g, 'round', m * 0.44, m * 0.44, 2.2);
    canopy(g, m * 0.42, 10, g.t, { spots: 2 });
    for (let i = 0; i < 18; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.38;
      apple(Math.cos(a) * d, Math.sin(a) * d, m * 0.032);
    }
  },
  vineyard(g) {
    const { ctx, w, h, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.01);
    // The row's strip of earth.
    rrect(ctx, -w * 0.42, -h * 0.49, w * 0.84, h * 0.98, w * 0.2, rgba('#5a3e24', 0.45));
    shadow(g, 'rect', w * 0.36, h * 0.47, 1.2);
    // The trellis wires, top to bottom, and the gnarled vine along them.
    for (const s of [-1, 1]) line(ctx, s * w * 0.05, -h * 0.47, s * w * 0.05, h * 0.47, '#a8a8a0', thin);
    const vinePts = [];
    for (let i = 0; i <= 16; i += 1) vinePts.push([(rnd() - 0.5) * w * 0.12, -h * 0.46 + (h * 0.92 * i) / 16]);
    polyline(ctx, vinePts, '#5a3d22', Math.max(0.8, m * 0.05));
    // Clumps of five-lobed leaves.
    const leafy = (x, y, r, a) => {
      const pts = [];
      for (let i = 0; i < 10; i += 1) {
        const b = a + (i / 10) * TAU;
        const rr = r * (i % 2 ? 0.62 : 1);
        pts.push([x + Math.cos(b) * rr, y + Math.sin(b) * rr]);
      }
      const c = shade('#5a8a36', (rnd() - 0.5) * 0.16);
      smoothShape(ctx, pts, lit(ctx, x, y, r, c, 0.12), shade(c, -0.3), thin);
      line(ctx, x, y, x + Math.cos(a + Math.PI) * r * 0.6, y + Math.sin(a + Math.PI) * r * 0.6, rgba(shade(c, -0.3), 0.6), thin);
    };
    const n = 22;
    for (let i = 0; i < n; i += 1) {
      const y = -h * 0.44 + (h * 0.88 * i) / (n - 1) + (rnd() - 0.5) * h * 0.02;
      leafy((rnd() - 0.5) * w * 0.5, y, m * (0.16 + rnd() * 0.06), rnd() * TAU);
    }
    // Bunches of grapes hanging off both sides.
    const bunch = (x, y, dir) => {
      const r = m * 0.04;
      [4, 3, 2, 1].forEach((cnt, j) => {
        for (let k = 0; k < cnt; k += 1) {
          const bx = x + dir * j * r * 1.6;
          const by = y + (k - (cnt - 1) / 2) * r * 1.7;
          circle(ctx, bx, by, r, lit(ctx, bx, by, r, '#5e2a6e', 0.22), '#2e1036', Math.max(0.4, m * 0.006));
        }
      });
    };
    for (let i = 0; i < 7; i += 1) bunch((i % 2 ? 1 : -1) * w * 0.12, -h * 0.4 + (h * 0.8 * i) / 6, i % 2 ? 1 : -1);
    // The posts.
    for (const y of [-0.455, -0.155, 0.155, 0.455]) rect(ctx, -m * 0.07, y * h - m * 0.07, m * 0.14, m * 0.14, lit(ctx, 0, y * h, m * 0.1, '#7a5532', 0.12), '#3e2914', thin);
  },
  windmill(g) {
    const { ctx, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.004);
    const turn = Math.PI / 4 + (rnd() - 0.5) * 0.2;
    const L = m * 0.66;
    const S0 = m * 0.12;
    const SW = m * 0.1;
    const sailShape = [[0, -m * 0.04], [L, -m * 0.04], [L, SW], [S0, SW], [S0, m * 0.018], [0, m * 0.018]];
    shadow(g, 'round', m * 0.33, m * 0.33, 3);
    if (g.shadows) {
      ctx.save();
      ctx.translate(g.sx * 3.4, g.sy * 3.4);
      for (let i = 0; i < 4; i += 1) {
        ctx.save();
        ctx.rotate(turn + (i * Math.PI) / 2);
        poly(ctx, sailShape, 'rgba(0,0,0,0.16)');
        ctx.restore();
      }
      ctx.restore();
    }
    // The tower's top: a whitewashed wall round the cap.
    circle(ctx, 0, 0, m * 0.34, lit(ctx, 0, 0, m * 0.34, '#d8d0c0', 0.08), '#7a7266', Math.max(1, m * 0.006));
    // The conical cap: shingles in rings, lit from the top left.
    const R = m * 0.28;
    const n = 20;
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * TAU;
      const a1 = ((i + 1) / n) * TAU;
      const light = Math.cos((a0 + a1) / 2 + Math.PI * 0.75) * 0.13;
      poly(ctx, [[0, 0], [Math.cos(a0) * R, Math.sin(a0) * R], [Math.cos(a1) * R, Math.sin(a1) * R]], shade('#7a5e48', light));
    }
    for (let k = 1; k <= 6; k += 1) {
      const r0 = (R * (k - 1)) / 6;
      const r1 = (R * k) / 6;
      circle(ctx, 0, 0, r1, null, rgba('#3e2e20', 0.55), Math.max(0.5, m * 0.004));
      const cnt = 4 + k * 4;
      for (let j = 0; j < cnt; j += 1) {
        const a = ((j + (k % 2) * 0.5) / cnt) * TAU;
        line(ctx, Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, rgba('#3e2e20', 0.4), Math.max(0.5, m * 0.003));
      }
    }
    circle(ctx, 0, 0, R, null, '#3e2e20', Math.max(1, m * 0.008));
    // Four long lattice sails in an X.
    for (let i = 0; i < 4; i += 1) {
      ctx.save();
      ctx.rotate(turn + (i * Math.PI) / 2);
      const frame = '#6e5034';
      const sw = Math.max(0.6, m * 0.006);
      // Canvas spread on the lattice: two sails full, two partly furled.
      const end = i % 2 === 0 ? L : S0 + (L - S0) * 0.6;
      rect(ctx, S0, m * 0.016, end - S0, SW - m * 0.016, lit(ctx, (S0 + end) / 2, SW / 2, (end - S0) * 0.6, '#e8dcc0', 0.06));
      if (i % 2) rect(ctx, end - m * 0.012, m * 0.016, m * 0.024, SW - m * 0.016, '#cbbd9c', '#8a7a5a', thin);
      line(ctx, S0, SW, L, SW, frame, Math.max(0.8, m * 0.01), 'butt');
      line(ctx, S0, (SW + m * 0.016) / 2, L, (SW + m * 0.016) / 2, frame, sw, 'butt');
      const bars = 13;
      for (let k = 0; k <= bars; k += 1) {
        const x = S0 + ((L - S0) * k) / bars;
        line(ctx, x, m * 0.016, x, SW, frame, sw, 'butt');
      }
      rect(ctx, S0, -m * 0.04, L - S0, m * 0.024, '#9a7a58', '#5a4028', thin);
      rect(ctx, 0, -m * 0.016, L, m * 0.032, '#6e4a2a', '#3a2410', thin);
      ctx.restore();
    }
    // The hub.
    circle(ctx, 0, 0, m * 0.055, lit(ctx, 0, 0, m * 0.055, '#5e3f22', 0.15), '#2e1f10', Math.max(0.8, m * 0.006));
    circle(ctx, 0, 0, m * 0.025, '#3a3a3a');
  },
  water_wheel(g) {
    const { ctx, w, h, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.012);
    const R = h * 0.42;
    const hw = w * 0.3;
    // The mill race it turns in, flowing top to bottom.
    rrect(ctx, -w * 0.47, -h * 0.49, w * 0.94, h * 0.98, w * 0.14, rgba('#3f7fa8', 0.7));
    for (let i = 0; i < 12; i += 1) {
      const x = (rnd() - 0.5) * w * 0.84;
      const y = (rnd() - 0.5) * h * 0.9;
      line(ctx, x, y, x + (rnd() - 0.5) * w * 0.04, y + h * (0.03 + rnd() * 0.04), rgba('#cfe8f4', 0.55), Math.max(0.5, m * 0.014));
    }
    shadow(g, 'rect', hw + w * 0.05, R, 1.4);
    // The axle across the race to its bearings.
    rect(ctx, -w * 0.47, -m * 0.055, w * 0.94, m * 0.11, '#4a3a2a', '#221a12', thin);
    for (const s of [-1, 1]) rect(ctx, s * w * 0.41 - m * 0.07, -m * 0.1, m * 0.14, m * 0.2, '#6a6e74', '#2a2e34', thin);
    // Inside the wheel: dark, with the iron hub on the axle.
    rect(ctx, -hw, -R, hw * 2, R * 2, '#1a130d');
    rect(ctx, -hw, -m * 0.05, hw * 2, m * 0.1, '#3e3024');
    circle(ctx, 0, 0, m * 0.1, lit(ctx, 0, 0, m * 0.1, '#5a5e64', 0.15), '#1e2024', thin);
    // The paddles, evenly round the wheel: from above they bunch up and turn their faces to us at the ends.
    const n = 10;
    const d = R * 0.2;
    const tk = R * 0.04;
    const order = Array.from({ length: n }, (_, k) => -Math.PI / 2 + (Math.PI * (k + 0.5)) / n).sort((p, q) => Math.cos(p) - Math.cos(q));
    for (const th of order) {
      const s = Math.sin(th);
      const c = Math.cos(th);
      const ya = (R - d) * s;
      const yb = R * s;
      const y1 = Math.min(ya, yb) - (tk * c) / 2;
      const y2 = Math.max(ya, yb) + (tk * c) / 2;
      const base = shade('#8a6440', s > 0 ? 0.04 : -0.02);
      rect(ctx, -hw, y1, hw * 2, y2 - y1, base, shade(base, -0.35), Math.max(0.5, m * 0.008));
      line(ctx, -hw, yb, hw, yb, rgba('#e8c898', 0.3 + 0.4 * c), Math.max(0.5, m * 0.014), 'butt');
    }
    // The two rims.
    for (const sd of [-1, 1]) {
      const rim = ctx.createLinearGradient(0, -R, 0, R);
      rim.addColorStop(0, '#1e140c');
      rim.addColorStop(0.45, '#7a5432');
      rim.addColorStop(1, '#1e140c');
      rect(ctx, sd * hw - w * 0.04, -R - h * 0.006, w * 0.08, R * 2 + h * 0.012, rim, '#140e08', thin);
    }
    // Foam where the paddles strike the water.
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 10; i += 1) circle(ctx, (rnd() - 0.5) * w * 0.8, sd * (R + h * (rnd() * 0.06 - 0.01)), m * (0.03 + rnd() * 0.05), rgba('#ffffff', 0.45 + rnd() * 0.35));
      for (let i = 0; i < 8; i += 1) circle(ctx, (rnd() - 0.5) * w * 0.9, sd * (R - h * (rnd() * 0.1 - 0.06)), m * 0.012, rgba('#ffffff', 0.8));
    }
  },
  millstone(g) {
    const { ctx, m, rnd } = g;
    const R = m * 0.42;
    // Flour dust round it.
    circle(ctx, 0, 0, m * 0.49, radial(ctx, 0, 0, m * 0.49, rgba('#f4efe4', 0.7), rgba('#f4efe4', 0)));
    for (let i = 0; i < 30; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.4 + rnd() * 0.09);
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * (0.005 + rnd() * 0.008), rgba('#fbf8f0', 0.8));
    }
    shadow(g, 'round', R, R, 0.8);
    circle(ctx, 0, 0, R, lit(ctx, 0, 0, R, '#9d978c', 0.12), '#55514a', Math.max(1, m * 0.012));
    circle(ctx, 0, 0, R * 0.93, null, rgba('#ffffff', 0.12), Math.max(0.5, m * 0.01));
    for (let i = 0; i < 50; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * R * 0.92;
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * (0.003 + rnd() * 0.005), rgba(rnd() < 0.5 ? '#5a5650' : '#c8c2b6', 0.6));
    }
    // Furrows: ten harps, each a master furrow and two shorter ones beside it.
    const c = R * 0.17;
    for (let i = 0; i < 10; i += 1) {
      ctx.save();
      ctx.rotate((i / 10) * TAU);
      for (let k = 0; k < 3; k += 1) {
        const yy = c + k * R * 0.085;
        const xa = k === 0 ? R * 0.2 : R * (0.32 + k * 0.14);
        const xb = Math.sqrt(R * R * 0.94 - yy * yy);
        line(ctx, xa, yy, xb, yy, rgba('#3e3a35', 0.75), Math.max(0.6, m * 0.014), 'butt');
        line(ctx, xa, yy + m * 0.008, xb, yy + m * 0.008, rgba('#ffffff', 0.18), Math.max(0.5, m * 0.006), 'butt');
      }
      ctx.restore();
    }
    // The square eye in the middle.
    const e = R * 0.15;
    rect(ctx, -e, -e, e * 2, e * 2, '#1e1c1a');
    poly(ctx, [[e, -e], [e, e], [-e, e], [-e * 0.6, e * 0.6], [e * 0.6, e * 0.6], [e * 0.6, -e * 0.6]], '#5a5650');
    rect(ctx, -e, -e, e * 2, e * 2, null, '#3e3a35', Math.max(0.6, m * 0.01));
  },
  plough(g) {
    const { ctx, w, h, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.014);
    shadow(g, 'rect', w * 0.36, h * 0.44, 0.6);
    const wood = '#8a6440';
    const dark = '#4a3018';
    const bar = (pts, wd) => {
      polyline(ctx, pts, dark, wd + Math.max(1, m * 0.03));
      polyline(ctx, pts, wood, wd);
      polyline(ctx, pts.map(([x, y]) => [x - wd * 0.18, y]), rgba('#c8a070', 0.45), Math.max(0.5, wd * 0.22));
    };
    // Earth turned off the board, lying beside it.
    for (let i = 0; i < 7; i += 1) smoothShape(ctx, blobPoints(w * (0.3 + rnd() * 0.12), h * (0.04 + rnd() * 0.16), m * 0.05, m * 0.035, 6, 0.5, rnd), shade('#5a4028', (rnd() - 0.5) * 0.12));
    // The share and the curling mouldboard, on the right of the beam: dark iron, its curve catching the light.
    ctx.beginPath();
    ctx.moveTo(-w * 0.05, -h * 0.26);
    ctx.quadraticCurveTo(w * 0.16, -h * 0.17, w * 0.27, -h * 0.03);
    ctx.quadraticCurveTo(w * 0.4, h * 0.06, w * 0.38, h * 0.14);
    ctx.quadraticCurveTo(w * 0.22, h * 0.06, w * 0.04, h * 0.1);
    ctx.lineTo(-w * 0.08, h * 0.08);
    ctx.lineTo(-w * 0.08, -h * 0.14);
    ctx.closePath();
    const gr = ctx.createLinearGradient(-w * 0.08, -h * 0.1, w * 0.38, h * 0.08);
    gr.addColorStop(0, '#2e3236');
    gr.addColorStop(0.45, '#5a6068');
    gr.addColorStop(0.8, '#a4acb4');
    gr.addColorStop(1, '#5a6068');
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.strokeStyle = '#16181a';
    ctx.lineWidth = Math.max(0.8, m * 0.025);
    ctx.stroke();
    polyline(ctx, [[-w * 0.045, -h * 0.24], [w * 0.14, -h * 0.16], [w * 0.26, -h * 0.04], [w * 0.36, h * 0.1]], rgba('#e8eef4', 0.75), Math.max(0.6, m * 0.022));
    smoothShape(ctx, blobPoints(w * 0.2, h * 0.03, m * 0.06, m * 0.035, 6, 0.4, rnd), '#5a4028');
    // The hitch chain, and the long beam running back over the share.
    for (let i = 0; i < 3; i += 1) oval(ctx, -w * 0.01, -h * (0.468 - i * 0.025), m * 0.025, m * 0.04, 0, null, '#3a3e44', Math.max(0.6, m * 0.018));
    bar([[-w * 0.01, -h * 0.41], [w * 0.005, -h * 0.15], [-w * 0.03, h * 0.08]], m * 0.12);
    for (const y of [-0.34, -0.12, 0.04]) circle(ctx, -w * 0.005, y * h, m * 0.025, '#2a2a2a');
    // The handles: the left one carries on the line of the beam, the right one rises off the mouldboard; worn grips.
    bar([[-w * 0.04, h * 0.04], [-w * 0.16, h * 0.25], [-w * 0.28, h * 0.4], [-w * 0.34, h * 0.44]], m * 0.085);
    bar([[w * 0.18, h * 0.08], [w * 0.27, h * 0.27], [w * 0.33, h * 0.4], [w * 0.38, h * 0.44]], m * 0.085);
    line(ctx, -w * 0.03, h * 0.02, w * 0.2, h * 0.1, '#3a3e44', Math.max(0.8, m * 0.035));
    for (const [x, y] of [[-0.35, 0.445], [0.385, 0.445]]) circle(ctx, x * w, y * h, m * 0.06, lit(ctx, x * w, y * h, m * 0.06, '#b08a5a', 0.15), dark, thin);
  },
  milk_churn(g) {
    const { ctx, m } = g;
    const thin = Math.max(0.5, m * 0.02);
    shadow(g, 'round', m * 0.44, m * 0.44, 1.3);
    // The wide foot of the tapered churn.
    circle(ctx, 0, 0, m * 0.47, '#5e3f22', '#2e1f10', thin);
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * TAU;
      line(ctx, Math.cos(a) * m * 0.36, Math.sin(a) * m * 0.36, Math.cos(a) * m * 0.47, Math.sin(a) * m * 0.47, '#3a2614', Math.max(0.5, m * 0.012));
    }
    circle(ctx, 0, 0, m * 0.43, null, '#2b2b2b', Math.max(0.8, m * 0.035));
    // The staved top and its lid, in two halves.
    circle(ctx, 0, 0, m * 0.35, lit(ctx, 0, 0, m * 0.35, '#a07850', 0.1), '#4a3019', thin);
    circle(ctx, 0, 0, m * 0.32, null, '#3a3a3a', Math.max(0.8, m * 0.035));
    circle(ctx, 0, 0, m * 0.26, lit(ctx, 0, 0, m * 0.26, '#b89068', 0.1), '#5e3f22', Math.max(0.5, m * 0.012));
    line(ctx, -m * 0.26, 0, m * 0.26, 0, rgba('#4a3019', 0.7), Math.max(0.5, m * 0.014), 'butt');
    // Cream squeezed up round the hole.
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU + 0.9;
      const d = m * (0.08 + (i % 2) * 0.03);
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * (0.02 + (i % 2) * 0.01), rgba('#f8f2de', 0.9));
    }
    circle(ctx, 0, 0, m * 0.075, '#f2ead0');
    // The dasher, a long pole leaning out of the hole, and its shadow across the lid.
    line(ctx, m * 0.03, m * 0.03, m * 0.36, -m * 0.16, 'rgba(0,0,0,0.28)', Math.max(1, m * 0.08));
    circle(ctx, 0, 0, m * 0.05, '#3a2614');
    line(ctx, 0, 0, m * 0.22, -m * 0.42, '#3a2614', Math.max(1, m * 0.11));
    line(ctx, 0, 0, m * 0.22, -m * 0.42, '#c8a878', Math.max(0.8, m * 0.075));
    line(ctx, -m * 0.012, -m * 0.01, m * 0.2, -m * 0.41, rgba('#f0dcb0', 0.6), Math.max(0.5, m * 0.022));
  },
  water_pump(g) {
    const { ctx, w, h, m } = g;
    const thin = Math.max(0.5, m * 0.014);
    shadow(g, 'rect', w * 0.42, h * 0.44, 0.9);
    // The stone basin in front.
    rrect(ctx, -w * 0.42, h * 0.02, w * 0.84, h * 0.44, m * 0.06, lit(ctx, 0, h * 0.24, m * 0.5, '#8d877d', 0.08), '#4f4b45', thin);
    rrect(ctx, -w * 0.34, h * 0.09, w * 0.68, h * 0.3, m * 0.04, radial(ctx, 0, h * 0.24, w * 0.36, '#5d8fb0', '#2f5f80'));
    for (const r of [0.05, 0.09, 0.13]) oval(ctx, 0, h * 0.22, m * r, m * r * 0.6, 0, null, rgba('#ffffff', 0.5 - r * 2.5), Math.max(0.5, m * 0.008));
    // The stone block the pump stands on.
    rect(ctx, -w * 0.22, -h * 0.47, w * 0.44, h * 0.42, lit(ctx, 0, -h * 0.26, m * 0.3, '#7d786f', 0.08), '#4f4b45', thin);
    // The long handle, raised.
    line(ctx, 0, -h * 0.28, w * 0.44, -h * 0.44, '#1e2024', Math.max(1, m * 0.065));
    line(ctx, 0, -h * 0.28, w * 0.44, -h * 0.44, '#5a5e64', Math.max(0.8, m * 0.035));
    // The spout over the basin.
    rect(ctx, -m * 0.04, -h * 0.26, m * 0.08, h * 0.4, '#3a3e44', '#1e2024', thin);
    circle(ctx, 0, h * 0.14, m * 0.05, '#2a2e34');
    // The iron barrel of the pump, with its cap.
    circle(ctx, 0, -h * 0.28, m * 0.14, lit(ctx, 0, -h * 0.28, m * 0.14, '#5a5e64', 0.15), '#1e2024', thin);
    circle(ctx, 0, -h * 0.28, m * 0.08, lit(ctx, 0, -h * 0.28, m * 0.08, '#6a6e74', 0.15), '#2a2e34', thin);
    circle(ctx, w * 0.44, -h * 0.44, m * 0.04, '#2a2e34');
  },
  bucket(g) {
    const { ctx, m } = g;
    const thin = Math.max(0.5, m * 0.025);
    const r = m * 0.37;
    const cy = -m * 0.06;
    ctx.save();
    ctx.translate(0, cy);
    shadow(g, 'round', r, r, 0.8);
    ctx.restore();
    // The iron handle, folded down over the side.
    ctx.beginPath();
    ctx.moveTo(-r * 0.96, cy);
    ctx.bezierCurveTo(-r * 0.96, cy + r * 1.45, r * 0.96, cy + r * 1.45, r * 0.96, cy);
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = Math.max(0.8, m * 0.05);
    ctx.stroke();
    // Staves, an iron hoop, water inside.
    circle(ctx, 0, cy, r, lit(ctx, 0, cy, r, '#9a7048', 0.12), '#3e2914', thin);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      line(ctx, Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, Math.cos(a) * r, cy + Math.sin(a) * r, rgba('#3e2914', 0.7), Math.max(0.5, m * 0.015));
    }
    circle(ctx, 0, cy, r * 0.9, null, '#3a3a3a', Math.max(0.8, m * 0.04));
    circle(ctx, 0, cy, r * 0.74, radial(ctx, 0, cy, r * 0.74, '#4f90b8', '#2f6a90'), '#4a3019', Math.max(0.5, m * 0.02));
    line(ctx, -r * 0.4, cy - r * 0.3, -r * 0.1, cy - r * 0.42, rgba('#ffffff', 0.55), Math.max(0.5, m * 0.03));
    for (const s of [-1, 1]) rect(ctx, s * r * 0.96 - m * 0.035, cy - m * 0.05, m * 0.07, m * 0.1, '#4a4a4a');
  },
  saddle(g) {
    const { ctx, w, h, m } = g;
    const thin = Math.max(0.5, m * 0.015);
    shadow(g, 'rect', w * 0.4, h * 0.42, 0.9);
    // The stand: a rail on two little trestles.
    for (const s of [-1, 1]) rect(ctx, -w * 0.16, s * h * 0.44 - h * 0.035, w * 0.32, h * 0.07, '#4a3018');
    rect(ctx, -w * 0.05, -h * 0.47, w * 0.1, h * 0.94, '#6e4a2a', '#3a2410', thin);
    // The blanket.
    rrect(ctx, -w * 0.3, -h * 0.33, w * 0.6, h * 0.68, m * 0.04, '#7b2f34', '#4a1a1e', thin);
    rrect(ctx, -w * 0.26, -h * 0.29, w * 0.52, h * 0.6, m * 0.03, null, '#d4a72c', Math.max(0.5, m * 0.012));
    // Stirrups hanging out at the sides on their leathers.
    for (const s of [-1, 1]) {
      line(ctx, s * w * 0.2, -h * 0.02, s * w * 0.4, h * 0.05, '#4a2a14', Math.max(0.8, m * 0.04));
      rrect(ctx, s * w * 0.41 - m * 0.065, h * 0.02, m * 0.13, m * 0.11, m * 0.035, null, '#9aa0a8', Math.max(0.8, m * 0.035));
    }
    // Flaps hanging down the sides.
    for (const s of [-1, 1]) rrect(ctx, s > 0 ? w * 0.1 : -w * 0.28, -h * 0.1, w * 0.18, h * 0.36, m * 0.04, '#6e4222', '#3e2010', thin);
    // The saddle: pommel and horn at the front, the seat dipping, the cantle raised at the back.
    const pts = [[0, -0.38], [0.1, -0.35], [0.15, -0.22], [0.21, -0.06], [0.22, 0.14], [0.18, 0.29], [0.09, 0.35], [0, 0.36], [-0.09, 0.35], [-0.18, 0.29], [-0.22, 0.14], [-0.21, -0.06], [-0.15, -0.22], [-0.1, -0.35]].map(([x, y]) => [x * w, y * h]);
    smoothShape(ctx, pts, lit(ctx, 0, 0, m * 0.4, '#8a5430', 0.12), '#3e2010', thin);
    oval(ctx, 0, h * 0.06, w * 0.12, h * 0.17, 0, radial(ctx, 0, h * 0.06, h * 0.17, '#643818', '#8a5430'));
    ctx.beginPath();
    ctx.arc(0, h * 0.18, w * 0.14, 0.25, Math.PI - 0.25);
    ctx.strokeStyle = '#b8804e';
    ctx.lineWidth = Math.max(0.8, m * 0.045);
    ctx.stroke();
    circle(ctx, 0, -h * 0.3, m * 0.055, lit(ctx, 0, -h * 0.3, m * 0.055, '#a06a40', 0.15), '#3e2010', thin);
    smoothShape(ctx, pts.map(([x, y]) => [x * 0.85, y * 0.88 + h * 0.01]), null, rgba('#d8b080', 0.45), Math.max(0.5, m * 0.008));
  },
  hitching_post(g) {
    const { ctx, w, h, m } = g;
    const thin = Math.max(0.5, m * 0.03);
    shadow(g, 'rect', w * 0.48, h * 0.4, 1);
    // The rail.
    const gr = ctx.createLinearGradient(0, -h * 0.2, 0, h * 0.2);
    gr.addColorStop(0, '#a07850');
    gr.addColorStop(1, '#6a4a2a');
    rrect(ctx, -w * 0.47, -h * 0.19, w * 0.94, h * 0.38, h * 0.12, gr, '#3e2914', thin);
    line(ctx, -w * 0.32, -h * 0.05, w * 0.1, -h * 0.03, rgba('#4a3019', 0.5), Math.max(0.5, m * 0.025));
    line(ctx, -w * 0.1, h * 0.07, w * 0.32, h * 0.06, rgba('#4a3019', 0.5), Math.max(0.5, m * 0.025));
    // A rope wound round it, its end trailing; an iron ring.
    for (let i = 0; i < 4; i += 1) line(ctx, -w * 0.2 + i * h * 0.12, -h * 0.21, -w * 0.2 + i * h * 0.12 + h * 0.1, h * 0.21, '#c9b48a', Math.max(0.8, m * 0.07));
    polyline(ctx, [[-w * 0.18, h * 0.2], [-w * 0.16, h * 0.42], [-w * 0.08, h * 0.46], [-w * 0.02, h * 0.38]], '#c9b48a', Math.max(0.8, m * 0.07));
    circle(ctx, w * 0.14, h * 0.24, h * 0.14, null, '#3a3e44', Math.max(0.8, m * 0.06));
    // The square posts, their tops standing proud of the rail.
    for (const s of [-1, 1]) {
      const x = s * w * 0.41;
      const ps = h * 0.4;
      rect(ctx, x - ps, -ps, ps * 2, ps * 2, lit(ctx, x, 0, ps * 1.4, '#8a6440', 0.1), '#2e1f10', thin);
      poly(ctx, [[x - ps, -ps], [x + ps, -ps], [x + ps * 0.6, -ps * 0.6], [x - ps * 0.6, -ps * 0.6]], rgba('#ffffff', 0.14));
      poly(ctx, [[x + ps, ps], [x - ps, ps], [x - ps * 0.6, ps * 0.6], [x + ps * 0.6, ps * 0.6]], rgba('#000000', 0.18));
      circle(ctx, x, 0, ps * 0.4, null, rgba('#4a3019', 0.55), Math.max(0.5, m * 0.02));
    }
  },
  chopping_block(g) {
    const { ctx, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.012);
    // Split logs and chips round it.
    const split = (x, y, a, l, wd) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      rect(ctx, -l / 2 + wd * 0.15, -wd / 2 + wd * 0.2, l, wd, 'rgba(0,0,0,0.25)');
      rect(ctx, -l / 2, -wd / 2, l, wd, '#c49a62', '#6b4a2b', thin);
      rect(ctx, -l / 2, wd * 0.18, l, wd * 0.32, '#5a3d22');
      line(ctx, -l * 0.35, -wd * 0.12, l * 0.3, -wd * 0.16, rgba('#8a6a42', 0.7), thin);
      ctx.restore();
    };
    split(-m * 0.34, m * 0.28, 0.5, m * 0.26, m * 0.09);
    split(m * 0.36, -m * 0.24, 2, m * 0.24, m * 0.09);
    split(-m * 0.38, -m * 0.16, 1.4, m * 0.22, m * 0.08);
    split(m * 0.08, m * 0.4, -0.15, m * 0.24, m * 0.085);
    for (let i = 0; i < 12; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.33 + rnd() * 0.12);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      poly(ctx, [[x, y], [x + m * 0.03, y + m * 0.01], [x + m * 0.01, y + m * 0.03]], '#d8b884');
    }
    // The stump.
    shadow(g, 'round', m * 0.31, m * 0.31, 0.9);
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * TAU + rnd();
      line(ctx, 0, 0, Math.cos(a) * m * 0.38, Math.sin(a) * m * 0.38, '#5a3d22', m * 0.09);
    }
    circle(ctx, 0, 0, m * 0.31, '#5a3d22', '#3a2614', thin);
    circle(ctx, 0, 0, m * 0.26, '#b48c5a');
    for (let r = 0.05; r < 0.26; r += 0.05) circle(ctx, m * 0.01, m * 0.01, m * r, null, rgba('#7a5a32', 0.8), Math.max(0.5, m * 0.01));
    line(ctx, -m * 0.02, m * 0.02, -m * 0.2, m * 0.12, '#6a4a2a', Math.max(0.5, m * 0.015));
    // The axe: its blade sunk in the top, the haft out to the side.
    ctx.save();
    ctx.rotate(0.65);
    line(ctx, -m * 0.14, 0, m * 0.1, 0, '#2a1a0e', Math.max(0.8, m * 0.014));
    rect(ctx, -m * 0.1, -m * 0.035, m * 0.13, m * 0.07, lit(ctx, -m * 0.04, 0, m * 0.08, '#7a7e86', 0.18), '#2a2e34', thin);
    line(ctx, m * 0.03, 0, m * 0.5, 0, '#3a2614', Math.max(1, m * 0.07));
    line(ctx, m * 0.03, 0, m * 0.5, 0, '#a8804e', Math.max(0.8, m * 0.05));
    ctx.restore();
  },
  manure(g) {
    const { ctx, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.01);
    // Wet muck seeping out round its foot.
    smoothShape(ctx, blobPoints(0, m * 0.02, m * 0.48, m * 0.45, 12, 0.2, rnd), rgba('#3a2a18', 0.45));
    shadow(g, 'round', m * 0.43, m * 0.4, 0.8);
    // The heap: a mound, lit from the top left.
    smoothShape(ctx, blobPoints(0, 0, m * 0.44, m * 0.4, 12, 0.22, rnd), radial(ctx, 0, 0, m * 0.44, '#7a5836', '#3e2a18', -m * 0.14, -m * 0.14), '#2e2014', thin);
    // Clods, lighter towards the top.
    for (let i = 0; i < 40; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.36;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d * 0.92;
      const r = m * (0.03 + rnd() * 0.04);
      const c = shade('#6e4e2e', (rnd() - 0.5) * 0.14 - (d / m) * 0.25);
      smoothShape(ctx, blobPoints(x, y, r, r * 0.85, 6, 0.45, rnd), lit(ctx, x, y, r, c, 0.18));
    }
    // Straw in it.
    for (let i = 0; i < 34; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.4;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const b = rnd() * TAU;
      line(ctx, x, y, x + Math.cos(b) * m * 0.06, y + Math.sin(b) * m * 0.06, shade('#c9a54e', (rnd() - 0.5) * 0.3), Math.max(0.5, m * 0.01));
    }
    // A pitchfork stuck in it.
    ctx.save();
    ctx.rotate(-0.75);
    for (const k of [-1, 0, 1]) line(ctx, -m * 0.05, k * m * 0.035, m * 0.02, k * m * 0.035, '#5a5e64', Math.max(0.6, m * 0.016));
    line(ctx, m * 0.02, -m * 0.045, m * 0.02, m * 0.045, '#3a3e44', Math.max(0.8, m * 0.02));
    line(ctx, m * 0.02, 0, m * 0.52, 0, '#3a2614', Math.max(1, m * 0.045));
    line(ctx, m * 0.02, 0, m * 0.52, 0, '#a8804e', Math.max(0.8, m * 0.03));
    ctx.restore();
    for (let i = 0; i < 5; i += 1) circle(ctx, (rnd() - 0.5) * m * 0.6, (rnd() - 0.5) * m * 0.5, m * 0.01, '#141414');
  },
  washing_line(g) {
    const { ctx, w, h, m } = g;
    const thin = Math.max(0.5, m * 0.02);
    const ly = -h * 0.3;
    const L = h * 0.74;
    const shapes = {
      sheet: (x, wd) => [[x - wd / 2, ly], [x + wd / 2, ly], [x + wd / 2, ly + L], [x + wd * 0.25, ly + L * 0.95], [x, ly + L], [x - wd * 0.25, ly + L * 0.95], [x - wd / 2, ly + L]],
      shirt: (x, wd) => [[x - wd * 0.3, ly], [x + wd * 0.3, ly], [x + wd * 0.52, ly + L * 0.1], [x + wd * 0.5, ly + L * 0.42], [x + wd * 0.3, ly + L * 0.38], [x + wd * 0.3, ly + L * 0.86], [x - wd * 0.3, ly + L * 0.86], [x - wd * 0.3, ly + L * 0.38], [x - wd * 0.5, ly + L * 0.42], [x - wd * 0.52, ly + L * 0.1]],
      trousers: (x, wd) => [[x - wd * 0.4, ly], [x + wd * 0.4, ly], [x + wd * 0.48, ly + L * 0.92], [x + wd * 0.08, ly + L * 0.92], [x, ly + L * 0.3], [x - wd * 0.08, ly + L * 0.92], [x - wd * 0.48, ly + L * 0.92]],
      dress: (x, wd) => [[x - wd * 0.22, ly], [x + wd * 0.22, ly], [x + wd * 0.26, ly + L * 0.3], [x + wd * 0.5, ly + L * 0.95], [x - wd * 0.5, ly + L * 0.95], [x - wd * 0.26, ly + L * 0.3]],
    };
    const items = [['sheet', -w * 0.33, w * 0.17, '#ece6d6'], ['shirt', -w * 0.14, w * 0.11, '#5a7aa0'], ['trousers', 0, w * 0.08, '#7a5a3a'], ['dress', w * 0.15, w * 0.1, '#a04a4a'], ['sheet', w * 0.33, w * 0.15, '#d8c890']];
    if (g.shadows) {
      ctx.save();
      ctx.translate(g.sx * 1.6, g.sy * 1.6);
      for (const [k, x, wd] of items) poly(ctx, shapes[k](x, wd), 'rgba(0,0,0,0.18)');
      ctx.restore();
    }
    // The posts.
    for (const s of [-1, 1]) circle(ctx, s * w * 0.465, ly, h * 0.12, lit(ctx, s * w * 0.465, ly, h * 0.12, '#7a5532', 0.15), '#3e2914', thin);
    // The washing.
    for (const [k, x, wd, c] of items) {
      poly(ctx, shapes[k](x, wd), lit(ctx, x, ly + L * 0.3, L * 0.8, c, 0.08), shade(c, -0.3), thin);
      line(ctx, x - wd * 0.12, ly + L * 0.15, x - wd * 0.14, ly + L * 0.8, rgba(shade(c, -0.2), 0.5), Math.max(0.5, m * 0.015));
    }
    // The line and the pegs.
    line(ctx, -w * 0.465, ly, w * 0.465, ly, '#d8ccb0', Math.max(0.6, m * 0.025));
    for (const [, x, wd] of items) for (const s of [-1, 1]) rect(ctx, x + s * wd * 0.35 - m * 0.02, ly - m * 0.05, m * 0.04, m * 0.1, '#a07850');
  },
  privy(g) {
    const { ctx, w, h, m } = g;
    const thin = Math.max(0.5, m * 0.014);
    shadow(g, 'rect', w * 0.42, h * 0.42, 1.8);
    // A stone step at the door.
    rect(ctx, -w * 0.18, h * 0.41, w * 0.36, h * 0.07, '#8d877d', '#4f4b45', thin);
    // A single-slope roof of boards, high at the back.
    const x0 = -w * 0.42;
    const y0 = -h * 0.44;
    const rw = w * 0.84;
    const rh = h * 0.86;
    planks(g, x0, y0, rw, rh, '#8a6a44', 5, false, 0.25);
    const gr = ctx.createLinearGradient(0, y0, 0, y0 + rh);
    gr.addColorStop(0, 'rgba(255,255,255,0.14)');
    gr.addColorStop(1, 'rgba(0,0,0,0.2)');
    rect(ctx, x0, y0, rw, rh, gr);
    for (const y of [y0 + rh * 0.12, y0 + rh * 0.88]) rect(ctx, x0, y - m * 0.035, rw, m * 0.07, '#5e4128');
    rect(ctx, x0, y0, rw, rh, null, '#3a2410', Math.max(0.8, m * 0.03));
    // The moon cut out for air.
    ctx.save();
    ctx.translate(0, -h * 0.08);
    ctx.rotate(-0.5);
    const r = m * 0.14;
    const d = r * 0.55;
    const k = Math.sqrt(r * r - (d * d) / 4);
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.atan2(-k, d / 2), Math.atan2(k, d / 2), true);
    ctx.arc(d, 0, r, Math.atan2(k, -d / 2), Math.atan2(-k, -d / 2), false);
    ctx.closePath();
    ctx.fillStyle = '#1a120a';
    ctx.fill();
    ctx.restore();
  },

  // ----- Town -----
  stocks(g) {
    const { ctx, w, h, m } = g;
    const thin = Math.max(0.5, m * 0.03);
    shadow(g, 'rect', w * 0.46, h * 0.42, 0.9);
    // The bench behind.
    for (const s of [-1, 1]) rect(ctx, s * w * 0.3 - h * 0.08, -h * 0.47, h * 0.16, h * 0.3, '#3e2914');
    planks(g, -w * 0.34, -h * 0.44, w * 0.68, h * 0.24, '#7d5a36', 1, true, 0.25);
    rect(ctx, -w * 0.34, -h * 0.44, w * 0.68, h * 0.24, null, '#3e2914', thin);
    // The two boards, holes for ankles along their seam.
    planks(g, -w * 0.4, -h * 0.1, w * 0.8, h * 0.54, '#8b623a', 2, true, 0.35);
    rect(ctx, -w * 0.4, -h * 0.1, w * 0.8, h * 0.54, null, '#3e2914', thin);
    const sy = h * 0.17;
    for (const x of [-0.27, -0.15, 0.15, 0.27]) {
      circle(ctx, x * w, sy, h * 0.15, '#1e140c');
      ctx.beginPath();
      ctx.arc(x * w, sy, h * 0.15, 0.2, Math.PI - 0.2);
      ctx.strokeStyle = rgba('#d8b07a', 0.6);
      ctx.lineWidth = Math.max(0.5, m * 0.025);
      ctx.stroke();
    }
    // An iron hinge and a padlock.
    rect(ctx, -w * 0.37, -h * 0.08, w * 0.04, h * 0.5, '#3a3a3a');
    rect(ctx, w * 0.33, sy - h * 0.12, w * 0.04, h * 0.24, '#3a3a3a');
    circle(ctx, w * 0.35, sy + h * 0.14, h * 0.08, '#b8902f', '#6a5214', Math.max(0.5, m * 0.02));
    // The posts at the ends.
    for (const s of [-1, 1]) rect(ctx, s * w * 0.44 - h * 0.14, -h * 0.16, h * 0.28, h * 0.62, lit(ctx, s * w * 0.44, h * 0.1, h * 0.3, '#6e4a2a', 0.1), '#2e1f10', thin);
  },
  planter(g) {
    const { ctx, w, h, m, t, rnd } = g;
    const thin = Math.max(0.5, m * 0.02);
    shadow(g, 'rect', w * 0.46, h * 0.4, 0.8);
    rect(ctx, -w * 0.46, -h * 0.38, w * 0.92, h * 0.76, '#7a5532', '#3e2914', thin);
    rect(ctx, -w * 0.4, -h * 0.25, w * 0.8, h * 0.5, '#3e2a1a');
    // Leaves.
    for (let i = 0; i < 16; i += 1) {
      const x = -w * 0.38 + (w * 0.76 * i) / 15 + (rnd() - 0.5) * w * 0.04;
      const y = (rnd() - 0.5) * h * 0.5;
      const c = shade('#4f8a3a', (rnd() - 0.5) * 0.14);
      oval(ctx, x, y, m * 0.16, m * 0.08, rnd() * TAU, c, shade(c, -0.25), Math.max(0.5, m * 0.01));
    }
    // Flowers.
    for (let i = 0; i < 8; i += 1) {
      const x = -w * 0.36 + (w * 0.72 * i) / 7 + (rnd() - 0.5) * w * 0.04;
      const y = (rnd() - 0.5) * h * 0.36;
      const r = m * (0.075 + rnd() * 0.02);
      const c = shade(t, (rnd() - 0.5) * 0.16);
      for (let k = 0; k < 5; k += 1) circle(ctx, x + Math.cos((k / 5) * TAU + i) * r, y + Math.sin((k / 5) * TAU + i) * r, r * 0.72, c, shade(c, -0.2), Math.max(0.4, m * 0.006));
      circle(ctx, x, y, r * 0.5, '#f2c12e');
    }
  },
  crate_stack(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.47, h * 0.47, 1.8);
    const mark = (x, y, s, kind) => {
      const c = rgba('#2a1a0a', 0.55);
      const lw = Math.max(0.6, s * 0.06);
      if (kind === 0) {
        circle(ctx, x, y, s * 0.15, null, c, lw);
        line(ctx, x - s * 0.1, y, x + s * 0.1, y, c, lw);
        line(ctx, x, y - s * 0.1, x, y + s * 0.1, c, lw);
      } else if (kind === 1) {
        polyline(ctx, [[x - s * 0.12, y + s * 0.02], [x, y - s * 0.12], [x + s * 0.12, y + s * 0.02]], c, lw);
        line(ctx, x, y - s * 0.12, x, y + s * 0.14, c, lw);
      } else {
        poly(ctx, [[x, y - s * 0.13], [x + s * 0.13, y], [x, y + s * 0.13], [x - s * 0.13, y]], null, c, lw);
      }
    };
    const crate = (x, y, s, rot, base, kind, mx, my) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      planks({ ...g, m: s * 1.1 }, -s / 2, -s / 2, s, s, base, 4, true, 0.2);
      rect(ctx, -s / 2, -s / 2, s, s, null, shade(base, -0.32), Math.max(1, s * 0.09));
      line(ctx, -s * 0.42, -s * 0.42, s * 0.42, s * 0.42, shade(base, -0.2), Math.max(1, s * 0.09), 'butt');
      if (kind >= 0) mark(mx * s, my * s, s, kind);
      ctx.restore();
    };
    // Bottom: four crates, in the shade of the ones on top.
    const lo = '#80603a';
    crate(-w * 0.24, -h * 0.24, m * 0.46, (rnd() - 0.5) * 0.05, lo, -1, 0, 0);
    crate(w * 0.24, -h * 0.24, m * 0.46, (rnd() - 0.5) * 0.05, lo, 0, 0.2, -0.2);
    crate(-w * 0.24, h * 0.24, m * 0.46, (rnd() - 0.5) * 0.05, lo, 2, -0.2, 0.2);
    crate(w * 0.24, h * 0.24, m * 0.46, (rnd() - 0.5) * 0.05, lo, -1, 0, 0);
    // Top: two lighter crates, casting shadow on the ones below.
    const tops = [[-w * 0.1, -h * 0.08, m * 0.44, 0.12, 1], [w * 0.22, h * 0.22, m * 0.34, -0.2, 0]];
    for (const [x, y, s, rot] of tops) {
      ctx.save();
      ctx.translate(x + m * 0.04, y + m * 0.055);
      ctx.rotate(rot);
      rect(ctx, -s / 2, -s / 2, s, s, 'rgba(0,0,0,0.3)');
      ctx.restore();
    }
    for (const [x, y, s, rot, kind] of tops) crate(x, y, s, rot, '#b08a58', kind, 0.2, -0.2);
  },
  barrel_stack(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.45, 1.6);
    const barrel = (x, y, r, k) => {
      circle(ctx, x, y, r, shade('#4a3019', k), shade('#2e1d0d', k), Math.max(0.5, m * 0.012));
      circle(ctx, x, y, r * 0.87, lit(ctx, x, y, r * 0.87, shade('#8a5d33', k), 0.08));
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU;
        line(ctx, x + Math.cos(a) * r * 0.17, y + Math.sin(a) * r * 0.17, x + Math.cos(a) * r * 0.87, y + Math.sin(a) * r * 0.87, rgba('#4a3019', 0.6), Math.max(0.5, m * 0.012));
      }
      circle(ctx, x, y, r * 0.7, null, '#3a3a3a', Math.max(1, r * 0.1));
      circle(ctx, x, y, r * 0.13, shade('#5a3a1a', k));
    };
    barrel(-w * 0.26, h * 0.02, h * 0.45, -0.07);
    barrel(w * 0.26, h * 0.02, h * 0.45, -0.07);
    circle(ctx, w * 0.05, h * 0.08, h * 0.48, 'rgba(0,0,0,0.3)');
    barrel(0, -h * 0.02, h * 0.47, 0.04);
  },
  chimney(g) {
    const { ctx, w, h, m, rnd } = g;
    const s = m * 0.36;
    shadow(g, 'rect', s, s, 2.6);
    // The top course of bricks round the flue.
    rect(ctx, -s, -s, s * 2, s * 2, '#8a4a36');
    const rows = 6;
    const bh = (s * 2) / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = -1; c < 3; c += 1) {
        const bx = -s + ((c + (r % 2 ? 0.5 : 0)) * (s * 2)) / 3;
        const xa = Math.max(-s, bx);
        const xb = Math.min(s, bx + (s * 2) / 3);
        if (xb <= xa) continue;
        rect(ctx, xa, -s + r * bh, xb - xa, bh, shade('#8a4a36', (rnd() - 0.5) * 0.12), rgba('#d8c8b0', 0.55), Math.max(0.5, m * 0.012));
      }
    }
    // Light on the near edges, dark on the far ones.
    poly(ctx, [[-s, -s], [s, -s], [s * 0.88, -s * 0.88], [-s * 0.88, -s * 0.88]], rgba('#ffffff', 0.2));
    poly(ctx, [[-s, -s], [-s * 0.88, -s * 0.88], [-s * 0.88, s * 0.88], [-s, s]], rgba('#ffffff', 0.12));
    poly(ctx, [[s, s], [-s, s], [-s * 0.88, s * 0.88], [s * 0.88, s * 0.88]], rgba('#000000', 0.18));
    poly(ctx, [[s, s], [s * 0.88, s * 0.88], [s * 0.88, -s * 0.88], [s, -s]], rgba('#000000', 0.12));
    rect(ctx, -s, -s, s * 2, s * 2, null, '#4a2418', Math.max(0.8, m * 0.02));
    // The flue: dark, sooty round its mouth.
    const f = s * 0.5;
    rect(ctx, -f * 1.25, -f * 1.25, f * 2.5, f * 2.5, radial(ctx, 0, 0, f * 1.8, 'rgba(20,14,10,0.7)', 'rgba(20,14,10,0)'));
    rect(ctx, -f, -f, f * 2, f * 2, radial(ctx, 0, 0, f * 1.4, '#050403', '#2a1e18'), '#1a120e', Math.max(0.5, m * 0.012));
    // A wisp of smoke drifting off.
    for (let i = 0; i < 6; i += 1) {
      const k = i / 5;
      const x = k * w * 0.3 + Math.sin(k * 4) * m * 0.03;
      const y = -k * h * 0.3 - m * 0.02;
      const r = m * (0.1 + k * 0.08);
      circle(ctx, x, y, r, radial(ctx, x, y, r, rgba('#d8d4cc', 0.45 * (1 - k * 0.6)), rgba('#d8d4cc', 0)));
    }
  },
  awning(g) {
    const { ctx, w, h, m, t } = g;
    const thin = Math.max(0.5, m * 0.012);
    shadow(g, 'rect', w * 0.5, h * 0.48, 1.6);
    const n = 11;
    const cream = '#efe6d2';
    const sw = w / n;
    const y0 = -h * 0.47;
    const y1 = h * 0.26;
    const y2 = h * 0.36;
    for (let i = 0; i < n; i += 1) rect(ctx, -w / 2 + i * sw, y0, sw + 0.5, y1 - y0, i % 2 ? cream : t);
    // It slopes down to the front: lighter by the wall, darker at the front.
    const gr = ctx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, 'rgba(255,255,255,0.14)');
    gr.addColorStop(1, 'rgba(0,0,0,0.12)');
    rect(ctx, -w / 2, y0, w, y1 - y0, gr);
    // The frame's ribs under the cloth.
    for (let i = 1; i < 4; i += 1) line(ctx, -w / 2 + (w * i) / 4, y0, -w / 2 + (w * i) / 4, y1, rgba('#000000', 0.15), Math.max(0.6, m * 0.02), 'butt');
    // The valance hanging at the front, scalloped.
    for (let i = 0; i < n; i += 1) {
      const c = shade(i % 2 ? cream : t, -0.1);
      rect(ctx, -w / 2 + i * sw, y1, sw + 0.5, y2 - y1, c);
      ctx.beginPath();
      ctx.arc(-w / 2 + (i + 0.5) * sw, y2, sw / 2, 0, Math.PI);
      ctx.fillStyle = c;
      ctx.fill();
    }
    line(ctx, -w / 2, y1, w / 2, y1, rgba(shade(t, -0.4), 0.5), Math.max(0.6, m * 0.02), 'butt');
    // The bar it hangs from, on the wall.
    rect(ctx, -w / 2, -h / 2, w, h * 0.06, '#5b3d22', '#2e1f10', thin);
  },
  cloth_bolts(g) {
    const { ctx, w, h, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.014);
    shadow(g, 'rect', w * 0.46, h * 0.42, 0.9);
    planks(g, -w * 0.46, -h * 0.42, w * 0.92, h * 0.84, '#7a4f2a', 3, true);
    rect(ctx, -w * 0.46, -h * 0.42, w * 0.92, h * 0.84, null, '#4a2f17', Math.max(1, m * 0.04));
    const cols = ['#9a3030', '#2f4f8a', '#c8a03a', '#3d6b3a'];
    const n = cols.length;
    const bw = w * 0.19;
    cols.forEach((c, i) => {
      const x = -w * 0.33 + (w * 0.66 * i) / (n - 1);
      const yt = -h * 0.38 + (rnd() - 0.5) * h * 0.04;
      const yb = h * 0.3 + (rnd() - 0.5) * h * 0.04;
      // a loose end draped over the front edge
      if (i % 2) rect(ctx, x - bw * 0.42, yb - h * 0.05, bw * 0.84, h * 0.2, shade(c, -0.06), shade(c, -0.35), thin);
      const gr = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
      gr.addColorStop(0, shade(c, 0.1));
      gr.addColorStop(0.35, shade(c, 0.16));
      gr.addColorStop(1, shade(c, -0.22));
      rrect(ctx, x - bw / 2, yt, bw, yb - yt, bw * 0.3, gr, shade(c, -0.38), thin);
      if (i === 0) for (let k = 1; k < 6; k += 1) line(ctx, x - bw / 2, yt + ((yb - yt) * k) / 6, x + bw / 2, yt + ((yb - yt) * k) / 6, rgba('#e8d8b0', 0.5), thin, 'butt');
      if (i === 2) for (let k = 0; k < 10; k += 1) circle(ctx, x + (k % 2 ? 0.2 : -0.2) * bw, yt + ((yb - yt) * (k + 0.5)) / 10, bw * 0.06, rgba('#7a4a1a', 0.6));
      oval(ctx, x, yt + bw * 0.12, bw * 0.42, bw * 0.12, 0, shade(c, 0.05), shade(c, -0.3), thin);
    });
  },
  pottery(g) {
    const { ctx, m } = g;
    const thin = Math.max(0.5, m * 0.012);
    shadow(g, 'round', m * 0.42, m * 0.42, 0.9);
    const pot = (x, y, r, c, glazed, open, jug) => {
      circle(ctx, x + r * 0.14, y + r * 0.2, r, 'rgba(0,0,0,0.28)');
      if (jug) circle(ctx, x + r * 0.95, y + r * 0.1, r * 0.3, null, shade(c, -0.25), Math.max(0.8, r * 0.14));
      circle(ctx, x, y, r, lit(ctx, x, y, r, c, glazed ? 0.22 : 0.12), shade(c, -0.32), thin);
      if (!glazed) circle(ctx, x, y, r * 0.8, null, rgba(shade(c, -0.25), 0.6), Math.max(0.5, m * 0.01));
      circle(ctx, x, y, r * open, shade(c, 0.05), shade(c, -0.3), thin);
      if (jug) poly(ctx, [[x - r * open * 0.9, y - r * 0.12], [x - r * open * 1.5, y], [x - r * open * 0.9, y + r * 0.12]], shade(c, 0.05), shade(c, -0.3), thin);
      circle(ctx, x, y, r * open * 0.75, radial(ctx, x, y, r * open * 0.75, '#120a06', shade(c, -0.45)));
      if (glazed) oval(ctx, x - r * 0.45, y - r * 0.45, r * 0.22, r * 0.12, -0.8, rgba('#ffffff', 0.55));
    };
    pot(-m * 0.15, -m * 0.12, m * 0.21, '#b5603a', false, 0.5, false);
    pot(m * 0.21, -m * 0.17, m * 0.14, '#3a6a9a', true, 0.45, true);
    pot(0, m * 0.04, m * 0.09, '#a85a34', false, 0.55, false);
    pot(m * 0.2, m * 0.18, m * 0.16, '#5a8a6a', true, 0.8, false);
    pot(-m * 0.16, m * 0.24, m * 0.13, '#c07048', false, 0.5, true);
  },
  horse_statue(g) {
    const { ctx, w, h, m } = g;
    const thin = Math.max(0.5, m * 0.008);
    shadow(g, 'rect', w * 0.47, h * 0.47, 2.2);
    // The plinth: a stepped stone block.
    rect(ctx, -w * 0.47, -h * 0.47, w * 0.94, h * 0.94, '#77726b', '#4f4b45', Math.max(0.8, m * 0.012));
    poly(ctx, [[-w * 0.47, -h * 0.47], [w * 0.47, -h * 0.47], [w * 0.4, -h * 0.42], [-w * 0.4, -h * 0.42]], '#9a958d');
    poly(ctx, [[-w * 0.47, -h * 0.47], [-w * 0.4, -h * 0.42], [-w * 0.4, h * 0.42], [-w * 0.47, h * 0.47]], '#8a857d');
    poly(ctx, [[w * 0.47, h * 0.47], [-w * 0.47, h * 0.47], [-w * 0.4, h * 0.42], [w * 0.4, h * 0.42]], '#5d5953');
    rect(ctx, -w * 0.4, -h * 0.42, w * 0.8, h * 0.84, lit(ctx, 0, 0, h * 0.5, '#8d887f', 0.06), '#5d5953', thin);
    // The bronze, gone green.
    const B = '#4f8a78';
    const D = '#2c5548';
    const fill = (x, y, r) => lit(ctx, x, y, r, B, 0.16);
    const P = (pts) => pts.map(([x, y]) => [x * w, y * h]);
    // Its shadow on the plinth.
    ctx.save();
    ctx.translate(w * 0.04, h * 0.03);
    smoothShape(ctx, P([[0.08, -0.3], [0.15, -0.1], [0.17, 0.2], [0.1, 0.33], [-0.1, 0.33], [-0.17, 0.2], [-0.15, -0.1], [-0.08, -0.3]]), 'rgba(0,0,0,0.22)');
    ctx.restore();
    // The tail, flowing out behind.
    ctx.beginPath();
    ctx.moveTo(-w * 0.045, h * 0.3);
    ctx.quadraticCurveTo(-w * 0.01, h * 0.41, w * 0.1, h * 0.44);
    ctx.quadraticCurveTo(w * 0.06, h * 0.35, w * 0.055, h * 0.3);
    ctx.closePath();
    ctx.fillStyle = D;
    ctx.fill();
    // The body: chest, barrel, hips and the round of the rump.
    smoothShape(ctx, P([[0.08, -0.16], [0.13, -0.12], [0.15, -0.04], [0.16, 0.06], [0.15, 0.13], [0.17, 0.19], [0.165, 0.26], [0.11, 0.31], [0, 0.325], [-0.11, 0.31], [-0.165, 0.26], [-0.17, 0.19], [-0.15, 0.13], [-0.16, 0.06], [-0.15, -0.04], [-0.13, -0.12], [-0.08, -0.16]]), fill(0, h * 0.06, w * 0.3), D, thin);
    line(ctx, 0, h * 0.17, 0, h * 0.3, rgba(D, 0.6), Math.max(0.6, w * 0.012));
    // The neck with its mane, and the long head: ears back at the poll, nostrils at the front.
    smoothShape(ctx, P([[-0.09, -0.12], [0.09, -0.12], [0.075, -0.2], [0.05, -0.29], [-0.05, -0.29], [-0.075, -0.2]]), fill(0, -h * 0.2, w * 0.12), D, thin);
    polyline(ctx, P([[0.015, -0.13], [0.035, -0.17], [0.02, -0.21], [0.035, -0.25], [0.015, -0.285]]), D, Math.max(0.8, w * 0.028));
    ctx.beginPath();
    ctx.moveTo(-w * 0.05, -h * 0.27);
    ctx.quadraticCurveTo(-w * 0.058, -h * 0.36, -w * 0.03, -h * 0.405);
    ctx.quadraticCurveTo(0, -h * 0.42, w * 0.03, -h * 0.405);
    ctx.quadraticCurveTo(w * 0.058, -h * 0.36, w * 0.05, -h * 0.27);
    ctx.closePath();
    ctx.fillStyle = fill(0, -h * 0.33, w * 0.07);
    ctx.fill();
    ctx.strokeStyle = D;
    ctx.lineWidth = thin;
    ctx.stroke();
    for (const s of [-1, 1]) {
      circle(ctx, s * w * 0.015, -h * 0.4, w * 0.008, D);
      poly(ctx, P([[s * 0.02, -0.285], [s * 0.06, -0.27], [s * 0.035, -0.262]]), D, D, thin);
    }
    // The rider astride: a saddle cloth, legs down the flanks, shoulders, arms and head.
    rrect(ctx, -w * 0.155, -h * 0.07, w * 0.31, h * 0.15, w * 0.03, lit(ctx, 0, 0, w * 0.2, shade(B, -0.1), 0.1), D, thin);
    for (const s of [-1, 1]) oval(ctx, s * w * 0.16, h * 0.01, w * 0.045, h * 0.075, s * 0.2, fill(s * w * 0.16, 0, w * 0.06), D, thin);
    oval(ctx, 0, -h * 0.02, w * 0.12, h * 0.048, 0, fill(0, -h * 0.02, w * 0.12), D, thin);
    const limb = (pts, wd) => {
      polyline(ctx, P(pts), D, wd + Math.max(1, w * 0.014));
      polyline(ctx, P(pts), B, wd);
    };
    limb([[-0.09, -0.03], [-0.07, -0.08], [-0.035, -0.12]], w * 0.032);
    limb([[0.09, -0.03], [0.14, -0.09], [0.18, -0.14]], w * 0.032);
    line(ctx, w * 0.15, -h * 0.13, w * 0.21, -h * 0.15, D, Math.max(0.8, w * 0.02));
    line(ctx, w * 0.18, -h * 0.14, w * 0.25, -h * 0.33, '#9ad0b8', Math.max(0.8, w * 0.022));
    circle(ctx, 0, -h * 0.025, w * 0.05, fill(0, -h * 0.025, w * 0.05), D, thin);
    // Where hands have rubbed the patina off.
    for (const [x, y, a] of [[-0.03, -0.22, -1.2], [-0.12, -0.04, -1.3], [-0.08, 0.2, -0.9]]) oval(ctx, x * w, y * h, w * 0.035, w * 0.012, a, rgba('#a8dcc4', 0.45));
  },
  lantern(g) {
    const { ctx, m } = g;
    const thin = Math.max(0.5, m * 0.03);
    shadow(g, 'round', m * 0.3, m * 0.3, 0.8);
    glow(ctx, 0, 0, m * 0.95, '#ffd27a', 0.5);
    const hex = (r) => Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * TAU + TAU / 12) * r, Math.sin((i / 6) * TAU + TAU / 12) * r]);
    // The frame, its glass glowing, brightest in the middle where the flame is.
    poly(ctx, hex(m * 0.36), '#2b2b2b', '#111111', thin);
    poly(ctx, hex(m * 0.29), radial(ctx, 0, 0, m * 0.29, '#fffdf0', '#ffa83a'));
    for (const [x, y] of hex(m * 0.36)) line(ctx, x * 0.55, y * 0.55, x, y, '#2b2b2b', Math.max(0.6, m * 0.035));
    // The little finial on its top.
    circle(ctx, 0, 0, m * 0.06, '#2b2b2b', '#111111', Math.max(0.5, m * 0.015));
  },
  fire_barrel(g) {
    const { ctx, m, rnd } = g;
    const thin = Math.max(0.5, m * 0.014);
    shadow(g, 'round', m * 0.42, m * 0.42, 1.2);
    glow(ctx, 0, 0, m * 0.7, '#ffae42', 0.3);
    // The iron drum's rolled rim, rusting.
    circle(ctx, 0, 0, m * 0.42, lit(ctx, 0, 0, m * 0.42, '#5a4a42', 0.12), '#1a1410', thin);
    for (let i = 0; i < 7; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.38 + rnd() * 0.03);
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * (0.03 + rnd() * 0.03), rgba('#9a4a22', 0.55));
    }
    circle(ctx, 0, 0, m * 0.37, null, rgba('#2a201a', 0.9), Math.max(0.6, m * 0.012));
    // Inside: dark, lit orange by the fire.
    circle(ctx, 0, 0, m * 0.35, radial(ctx, 0, 0, m * 0.35, '#7a2a0a', '#1a100a'));
    line(ctx, -m * 0.3, -m * 0.12, m * 0.26, m * 0.16, '#2a1a0e', m * 0.08);
    line(ctx, -m * 0.2, m * 0.24, m * 0.22, -m * 0.24, '#3a2414', m * 0.07);
    fire(g, 0, 0, m * 0.25);
    for (let i = 0; i < 6; i += 1) circle(ctx, (rnd() - 0.5) * m * 0.5, (rnd() - 0.5) * m * 0.5, m * 0.015, '#ffd27a');
    circle(ctx, 0, 0, m * 0.4, null, rgba('#ff9a3c', 0.25), Math.max(0.5, m * 0.02));
  },
  handcart(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.42, h * 0.44, 0.9);
    // The axle and the two wheels.
    line(ctx, -w * 0.44, -h * 0.1, w * 0.44, -h * 0.1, '#3a2a1a', Math.max(1, m * 0.05), 'butt');
    for (const s of [-1, 1]) wheel(ctx, s * w * 0.43, -h * 0.1, w * 0.1, h * 0.34);
    // The handles at the back.
    for (const s of [-1, 1]) {
      line(ctx, s * w * 0.3, h * 0.1, s * w * 0.3, h * 0.47, '#3e2914', Math.max(1, m * 0.09));
      line(ctx, s * w * 0.3, h * 0.1, s * w * 0.3, h * 0.47, '#8a6440', Math.max(0.8, m * 0.06));
    }
    // The bed: planks inside a frame.
    planks(g, -w * 0.36, -h * 0.45, w * 0.72, h * 0.62, '#9a7048', 4, false, 0.2);
    rect(ctx, -w * 0.36, -h * 0.45, w * 0.72, h * 0.62, null, '#4a3018', Math.max(1, m * 0.06));
    // Goods: two sacks and a heap of apples.
    const sack = (x, y, r, a) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      smoothShape(ctx, blobPoints(0, r * 0.08, r, r * 0.86, 8, 0.2, rnd), lit(ctx, 0, 0, r, '#b09060', 0.12), '#6b5432', Math.max(0.5, m * 0.012));
      circle(ctx, 0, -r * 0.7, r * 0.22, '#8a6e44', '#5a4428', Math.max(0.5, m * 0.01));
      line(ctx, -r * 0.3, -r * 0.1, r * 0.1, r * 0.4, rgba('#6b5432', 0.6), Math.max(0.5, m * 0.012));
      ctx.restore();
    };
    sack(-w * 0.14, -h * 0.3, m * 0.24, -0.3);
    sack(w * 0.14, -h * 0.26, m * 0.22, 0.4);
    for (let i = 0; i < 14; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.2;
      const x = Math.cos(a) * d;
      const y = h * 0.02 + Math.sin(a) * d * 0.8;
      circle(ctx, x, y, m * 0.06, lit(ctx, x, y, m * 0.06, rnd() < 0.8 ? '#c0392b' : '#8ab03a', 0.22), rgba('#4a1010', 0.6), Math.max(0.5, m * 0.008));
    }
  },
  roof_flat(g) {
    const { ctx, w, h, m, t, rnd } = g;
    const thin = Math.max(0.5, m * 0.006);
    shadow(g, 'rect', w * 0.5, h * 0.5, 2);
    rect(ctx, -w / 2, -h / 2, w, h, t);
    // Big slabs, faintly.
    for (let i = 1; i < 6; i += 1) line(ctx, -w / 2 + (w * i) / 6, -h / 2, -w / 2 + (w * i) / 6, h / 2, rgba(shade(t, -0.3), 0.22), thin, 'butt');
    for (let i = 1; i < 4; i += 1) line(ctx, -w / 2, -h / 2 + (h * i) / 4, w / 2, -h / 2 + (h * i) / 4, rgba(shade(t, -0.3), 0.22), thin, 'butt');
    // Weathering: stains, cracks, moss, a puddle by the drain.
    for (let i = 0; i < 10; i += 1) {
      const x = (rnd() - 0.5) * w * 0.8;
      const y = (rnd() - 0.5) * h * 0.8;
      const r = m * (0.1 + rnd() * 0.18);
      circle(ctx, x, y, r, radial(ctx, x, y, r, rgba(shade(t, rnd() < 0.6 ? -0.12 : 0.08), 0.5), rgba(t, 0)));
    }
    for (let c = 0; c < 3; c += 1) {
      let x = (rnd() - 0.5) * w * 0.7;
      let y = (rnd() - 0.5) * h * 0.7;
      let a = rnd() * TAU;
      const pts = [[x, y]];
      for (let i = 0; i < 5; i += 1) {
        a += (rnd() - 0.5) * 1.2;
        x += Math.cos(a) * m * 0.05;
        y += Math.sin(a) * m * 0.05;
        pts.push([x, y]);
      }
      polyline(ctx, pts, rgba(shade(t, -0.4), 0.6), Math.max(0.5, m * 0.005));
    }
    const p = m * 0.07;
    const dx = w * 0.3;
    smoothShape(ctx, blobPoints(dx - m * 0.04, h / 2 - p - m * 0.1, m * 0.14, m * 0.07, 8, 0.4, rnd), rgba('#55626a', 0.35));
    for (const [cx, cy] of [[-w / 2 + p, h / 2 - p], [w / 2 - p, -h / 2 + p]]) {
      for (let i = 0; i < 7; i += 1) circle(ctx, cx + (rnd() - 0.5) * m * 0.12, cy + (rnd() - 0.5) * m * 0.12, m * (0.012 + rnd() * 0.02), rgba('#5f7a3a', 0.5));
    }
    // The parapet: the low wall round the edge, its shadow inside on the top and left.
    poly(ctx, [[-w / 2 + p, -h / 2 + p], [w / 2 - p, -h / 2 + p], [w / 2 - p, -h / 2 + p * 1.6], [-w / 2 + p * 1.6, -h / 2 + p * 1.6], [-w / 2 + p * 1.6, h / 2 - p], [-w / 2 + p, h / 2 - p]], rgba('#000000', 0.16));
    rect(ctx, -w / 2, -h / 2, w, p, shade(t, 0.12));
    rect(ctx, -w / 2, h / 2 - p, w, p, shade(t, 0.02));
    rect(ctx, -w / 2, -h / 2, p, h, shade(t, 0.08));
    rect(ctx, w / 2 - p, -h / 2, p, h, shade(t, 0));
    const joint = rgba(shade(t, -0.3), 0.6);
    for (let i = 1; i < 12; i += 1) {
      const x = -w / 2 + (w * i) / 12;
      line(ctx, x, -h / 2, x, -h / 2 + p, joint, thin, 'butt');
      line(ctx, x, h / 2 - p, x, h / 2, joint, thin, 'butt');
    }
    for (let i = 1; i < 9; i += 1) {
      const y = -h / 2 + (h * i) / 9;
      line(ctx, -w / 2, y, -w / 2 + p, y, joint, thin, 'butt');
      line(ctx, w / 2 - p, y, w / 2, y, joint, thin, 'butt');
    }
    rect(ctx, -w / 2 + p, -h / 2 + p, w - p * 2, h - p * 2, null, rgba(shade(t, -0.35), 0.8), Math.max(0.5, m * 0.006));
    rect(ctx, -w / 2, -h / 2, w, h, null, shade(t, -0.4), Math.max(0.8, m * 0.01));
    // The drain: a gap through the parapet at the front, a grate before it.
    rect(ctx, dx - m * 0.04, h / 2 - p, m * 0.08, p, shade(t, -0.35));
    rect(ctx, dx - m * 0.05, h / 2 - p - m * 0.08, m * 0.1, m * 0.07, '#2a2622', '#1a1612', thin);
    for (let i = 1; i < 4; i += 1) line(ctx, dx - m * 0.05 + m * 0.025 * i, h / 2 - p - m * 0.08, dx - m * 0.05 + m * 0.025 * i, h / 2 - p - m * 0.01, '#5a5650', Math.max(0.5, m * 0.008), 'butt');
    // The hatch: a wooden trapdoor in a stone curb.
    const hx = -w * 0.26;
    const hy = -h * 0.16;
    const hs = m * 0.22;
    rect(ctx, hx - hs * 0.62, hy - hs * 0.62, hs * 1.24, hs * 1.24, shade(t, -0.06), shade(t, -0.35), thin);
    planks({ ...g, m: hs }, hx - hs / 2, hy - hs / 2, hs, hs, '#7a5532', 4, false, 0.25);
    for (const y of [-0.28, 0.28]) band(ctx, hx - hs / 2, hy + y * hs - hs * 0.04, hs, hs * 0.08, '#3a3a3a');
    circle(ctx, hx + hs * 0.25, hy, hs * 0.08, null, '#5a5a5a', Math.max(0.6, hs * 0.03));
    rect(ctx, hx - hs / 2, hy - hs / 2, hs, hs, null, '#3a2410', Math.max(0.6, hs * 0.03));
  },
};
