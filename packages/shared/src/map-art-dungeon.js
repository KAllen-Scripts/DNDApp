/**
 * Built-in assets of the map creator: the dungeon, traps and treasure (map-design.js ASSETS), drawn
 * in code like the rest (map-art-assets.js, which merges these in).
 */
import { TAU, shade, rgba, circle, oval, rect, rrect, poly, line, polyline, blobPoints, smoothShape, radial, glow } from './map-paint.js';
import { shadow, lit, stone, planks, coin, band } from './map-art-pieces.js';

export const ART_DUNGEON = {
  // ----- Dungeon (new) -----
  iron_maiden(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.34, h * 0.46, 1.6);
    const ink = '#1c1e22';
    const side = (y) => w * 0.36 - ((y + h * 0.1) / (h * 0.57)) * w * 0.11;
    const body = (k) => {
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.47 * k);
      ctx.bezierCurveTo(w * 0.19 * k, -h * 0.47 * k, w * 0.24 * k, -h * 0.36 * k, w * 0.21 * k, -h * 0.24 * k);
      ctx.quadraticCurveTo(w * 0.36 * k, -h * 0.23 * k, w * 0.36 * k, -h * 0.1 * k);
      ctx.lineTo(w * 0.25 * k, h * 0.47 * k);
      ctx.lineTo(-w * 0.25 * k, h * 0.47 * k);
      ctx.lineTo(-w * 0.36 * k, -h * 0.1 * k);
      ctx.quadraticCurveTo(-w * 0.36 * k, -h * 0.23 * k, -w * 0.21 * k, -h * 0.24 * k);
      ctx.bezierCurveTo(-w * 0.24 * k, -h * 0.36 * k, -w * 0.19 * k, -h * 0.47 * k, 0, -h * 0.47 * k);
      ctx.closePath();
    };
    body(1);
    ctx.fillStyle = lit(ctx, -w * 0.04, -h * 0.12, h * 0.62, '#5c6067', 0.14);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(0.8, m * 0.035);
    ctx.stroke();
    body(0.86);
    ctx.strokeStyle = rgba(ink, 0.55);
    ctx.lineWidth = Math.max(0.5, m * 0.018);
    ctx.stroke();
    // The doors stand a little open: spikes inside the gap.
    const gap = (y) => w * (0.025 + ((y + h * 0.2) / (h * 0.66)) * 0.06);
    poly(ctx, [[-gap(-h * 0.2), -h * 0.2], [gap(-h * 0.2), -h * 0.2], [gap(h * 0.46), h * 0.46], [-gap(h * 0.46), h * 0.46]], '#070708', ink, Math.max(0.5, m * 0.015));
    for (let i = 0; i < 7; i += 1) {
      const y = -h * 0.14 + i * h * 0.087;
      for (const s of [-1, 1]) {
        const x = s * gap(y);
        poly(ctx, [[x, y - h * 0.025], [x - s * gap(y) * 0.85, y], [x, y + h * 0.025]], '#c4c8ce');
      }
    }
    // Hinges on both edges.
    for (const y of [-h * 0.02, h * 0.32]) for (const s of [-1, 1]) rect(ctx, s * side(y) - m * 0.03, y - m * 0.045, m * 0.06, m * 0.09, '#3a3d42', ink, Math.max(0.5, m * 0.015));
    // Studs.
    for (let i = 0; i < 5; i += 1) {
      const y = -h * 0.08 + (h * 0.48 * i) / 4;
      for (const s of [-1, 1]) {
        for (const x of [s * (side(y) - m * 0.09), s * (side(y) * 0.5 + m * 0.02)]) circle(ctx, x, y, m * 0.022, lit(ctx, x, y, m * 0.022, '#a0a4aa', 0.2), ink, Math.max(0.4, m * 0.006));
      }
    }
    // The face.
    oval(ctx, 0, -h * 0.335, w * 0.13, h * 0.105, 0, lit(ctx, 0, -h * 0.335, h * 0.1, '#a2a6ad', 0.12), ink, Math.max(0.5, m * 0.018));
    for (const s of [-1, 1]) oval(ctx, s * w * 0.05, -h * 0.355, w * 0.032, h * 0.016, s * 0.3, '#0c0d0f');
    line(ctx, 0, -h * 0.35, 0, -h * 0.305, rgba(ink, 0.8), Math.max(0.5, m * 0.014));
    oval(ctx, 0, -h * 0.275, w * 0.04, h * 0.013, 0, '#0c0d0f');
  },
  torture_rack(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.44, h * 0.47, 0.9);
    const ink = '#2e1d0d';
    const lw = Math.max(0.6, m * 0.025);
    // Corner legs.
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) rect(ctx, sx * w * 0.36 - m * 0.085, sy * (h * 0.47 - m * 0.085) - m * 0.085, m * 0.17, m * 0.17, '#4e321b', ink, lw);
    // The bed: planks lengthwise between the rails, stained.
    planks(g, -w * 0.3, -h * 0.34, w * 0.6, h * 0.68, '#6e4c2c', 3, false, 0.25);
    rect(ctx, -w * 0.3, -h * 0.34, w * 0.6, h * 0.68, null, ink, lw);
    for (let i = 0; i < 3; i += 1) smoothShape(ctx, blobPoints((rnd() - 0.5) * w * 0.3, (rnd() - 0.5) * h * 0.4, m * (0.06 + rnd() * 0.05), m * (0.05 + rnd() * 0.04), 7, 0.5, rnd), rgba('#4a1a12', 0.4));
    // Side rails.
    for (const s of [-1, 1]) {
      const x = s * w * 0.36;
      const gr = ctx.createLinearGradient(x - m * 0.065, 0, x + m * 0.065, 0);
      gr.addColorStop(0, '#946a40');
      gr.addColorStop(1, '#5e3d20');
      rect(ctx, x - m * 0.065, -h * 0.47, m * 0.13, h * 0.94, gr, ink, lw);
    }
    // Rollers at both ends with rope wound on them, ropes down to iron cuffs.
    for (const s of [-1, 1]) {
      const y = s * h * 0.385;
      const rh = m * 0.17;
      const gr = ctx.createLinearGradient(0, y - rh / 2, 0, y + rh / 2);
      gr.addColorStop(0, '#c09464');
      gr.addColorStop(0.45, '#8a6038');
      gr.addColorStop(1, '#4a3018');
      rrect(ctx, -w * 0.4, y - rh / 2, w * 0.8, rh, rh * 0.3, gr, ink, lw);
      for (let k = 0; k < 7; k += 1) {
        const x = -w * 0.17 + k * w * 0.055;
        line(ctx, x, y - rh * 0.48, x + rh * 0.4, y + rh * 0.48, '#d8c597', Math.max(0.6, m * 0.022));
      }
      for (const sx of [-1, 1]) {
        const cy = s * h * 0.19;
        line(ctx, sx * w * 0.12, y, sx * w * 0.09, cy, '#d2bd90', Math.max(0.8, m * 0.035));
        circle(ctx, sx * w * 0.09, cy, m * 0.05, null, '#1e1e20', Math.max(1, m * 0.035));
      }
      // A spoked crank on the roller's end (right at the top, left at the bottom).
      const cx = s * -w * 0.39;
      for (let k = 0; k < 4; k += 1) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const ex = cx + Math.cos(a) * m * 0.11;
        const ey = y + Math.sin(a) * m * 0.11;
        line(ctx, cx, y, ex, ey, ink, Math.max(1.4, m * 0.06));
        line(ctx, cx, y, ex, ey, '#8a6038', Math.max(0.8, m * 0.035));
        circle(ctx, ex, ey, m * 0.03, '#5b3d22', ink, Math.max(0.5, m * 0.01));
      }
      circle(ctx, cx, y, m * 0.045, '#3a3a3a', '#1a1a1a', Math.max(0.5, m * 0.01));
    }
  },
  portcullis(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.48, h * 0.34, 2.2);
    const ink = '#141518';
    // Stone blocks at both ends, with the grooves the gate runs in.
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -w * 0.5 : w * 0.5 - w * 0.075;
      rect(ctx, x0, -h * 0.48, w * 0.075, h * 0.96, lit(ctx, x0 + w * 0.03, -h * 0.1, h * 0.7, '#857f75', 0.1), '#4a453f', Math.max(0.6, m * 0.04));
      rect(ctx, x0 + w * 0.025, -h * 0.16, w * 0.025, h * 0.32, '#1a1816');
    }
    // The bottom bar, then the spiked ends of the rods along it.
    rect(ctx, -w * 0.45, -h * 0.08, w * 0.9, h * 0.16, '#33363b', ink, Math.max(0.5, m * 0.03));
    const n = Math.max(5, Math.round((w * 0.86) / (m * 0.5)));
    const s = m * 0.2;
    for (let i = 0; i < n; i += 1) {
      const x = -w * 0.43 + (w * 0.86 * (i + 0.5)) / n;
      rect(ctx, x - s, -s, s * 2, s * 2, '#4d5056', ink, Math.max(0.5, m * 0.03));
      poly(ctx, [[x - s, -s], [x + s, -s], [x, 0]], '#8c9096');
      poly(ctx, [[x - s, -s], [x, 0], [x - s, s]], '#6c7076');
      poly(ctx, [[x + s, -s], [x + s, s], [x, 0]], '#3c3f44');
      poly(ctx, [[x - s, s], [x, 0], [x + s, s]], '#2c2e32');
    }
  },
  skeleton(g) {
    const { ctx, h, m, rnd } = g;
    shadow(g, 'rect', m * 0.32, h * 0.45, 0.12);
    const u = m;
    const bone = '#e9e1c9';
    const edge = rgba('#3e3424', 0.6);
    const bw = Math.max(0.8, u * 0.045);
    const pad = Math.max(0.8, u * 0.03);
    const list = [];
    const add = (pts, k = 1) => list.push([pts, k]);
    const sh = -0.5 * u;
    add([[0, -0.6 * u], [0, 0.2 * u]], 0.75);
    for (const s of [-1, 1]) {
      add([[s * 0.03 * u, sh - 0.01 * u], [s * 0.23 * u, sh + 0.01 * u]], 0.7);
      const ex = s * (0.27 + rnd() * 0.05) * u;
      const ey = (-0.17 + rnd() * 0.04) * u;
      const hx = s * (0.2 + rnd() * 0.15) * u;
      const hy = (0.1 + rnd() * 0.12) * u;
      add([[s * 0.24 * u, sh + 0.02 * u], [ex, ey]], 0.95);
      add([[ex - s * 0.01 * u, ey], [hx - s * 0.02 * u, hy]], 0.6);
      add([[ex + s * 0.01 * u, ey], [hx + s * 0.02 * u, hy]], 0.6);
      for (let f = 0; f < 4; f += 1) {
        const a = Math.atan2(hy - ey, hx - ex) + (f - 1.5) * 0.32;
        add([[hx, hy], [hx + Math.cos(a) * 0.085 * u, hy + Math.sin(a) * 0.085 * u]], 0.32);
      }
      const kx = s * (0.12 + rnd() * 0.05) * u;
      const ky = 0.6 * u;
      const ax = s * (0.12 + rnd() * 0.09) * u;
      const ay = 0.88 * u;
      add([[s * 0.1 * u, 0.3 * u], [kx, ky]], 1.1);
      add([[kx, ky], [ax, ay]], 0.85);
      for (let f = 0; f < 3; f += 1) add([[ax, ay], [ax + s * (0.01 + f * 0.025) * u, 0.97 * u]], 0.35);
    }
    for (const [pts, k] of list) polyline(ctx, pts, edge, bw * k + pad);
    for (const [pts, k] of list) polyline(ctx, pts, bone, bw * k);
    // Ribs, breastbone, pelvis.
    for (let i = 0; i < 5; i += 1) {
      const y = -0.45 * u + i * 0.07 * u;
      const span = (0.19 - Math.abs(i - 1.6) * 0.012) * u;
      for (const s of [-1, 1]) {
        for (const [c, wd] of [[edge, bw * 0.55 + pad], [bone, bw * 0.55]]) {
          ctx.beginPath();
          ctx.moveTo(s * 0.025 * u, y);
          ctx.quadraticCurveTo(s * span * 1.3, y - 0.035 * u, s * span * 0.95, y + 0.1 * u);
          ctx.strokeStyle = c;
          ctx.lineWidth = wd;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }
    }
    rrect(ctx, -0.025 * u, -0.47 * u, 0.05 * u, 0.27 * u, 0.02 * u, bone, edge, pad * 0.6);
    for (const s of [-1, 1]) oval(ctx, s * 0.1 * u, 0.24 * u, 0.12 * u, 0.085 * u, s * 0.5, bone, edge, pad * 0.8);
    oval(ctx, 0, 0.27 * u, 0.06 * u, 0.07 * u, 0, bone, edge, pad * 0.8);
    for (const s of [-1, 1]) oval(ctx, s * 0.075 * u, 0.3 * u, 0.03 * u, 0.025 * u, 0, rgba('#3e3424', 0.7));
    // Skull.
    const sy = -0.78 * u;
    oval(ctx, 0, sy + 0.17 * u, 0.085 * u, 0.06 * u, 0, bone, edge, pad * 0.8);
    oval(ctx, 0, sy, 0.15 * u, 0.17 * u, 0, lit(ctx, 0, sy, 0.17 * u, bone, 0.1), edge, pad * 0.8);
    for (const s of [-1, 1]) oval(ctx, s * 0.055 * u, sy + 0.03 * u, 0.04 * u, 0.035 * u, 0, '#2a231a');
    poly(ctx, [[0, sy + 0.07 * u], [-0.02 * u, sy + 0.11 * u], [0.02 * u, sy + 0.11 * u]], '#2a231a');
    line(ctx, -0.05 * u, sy + 0.15 * u, 0.05 * u, sy + 0.15 * u, rgba('#3e3424', 0.6), Math.max(0.5, u * 0.012));
  },
  skull_pile(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.44, m * 0.42, 1);
    const longBone = (x, y, a, len, tone) => {
      const c = shade('#ddd2b4', tone);
      const e = Math.max(0.6, m * 0.01);
      const bw = len * 0.13;
      const dx = (Math.cos(a) * len) / 2;
      const dy = (Math.sin(a) * len) / 2;
      const px = -Math.sin(a) * bw * 0.45;
      const py = Math.cos(a) * bw * 0.45;
      for (const [col, add] of [[shade(c, -0.42), e], [c, 0]]) {
        line(ctx, x - dx, y - dy, x + dx, y + dy, col, bw + add * 2);
        for (const s of [-1, 1]) for (const f of [-1, 1]) circle(ctx, x + s * dx + f * px, y + s * dy + f * py, bw * 0.55 + add, col);
      }
    };
    const skull = (x, y, r, a, tone) => {
      const c = shade('#e6dbc0', tone);
      const e = shade(c, -0.45);
      const lx = -0.35 * r * (Math.cos(a) + Math.sin(a));
      const ly = 0.35 * r * (Math.sin(a) - Math.cos(a));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      oval(ctx, 0, r * 0.72, r * 0.5, r * 0.32, 0, shade(c, -0.08), e, Math.max(0.5, r * 0.08));
      oval(ctx, 0, -r * 0.06, r * 0.84, r, 0, radial(ctx, 0, -r * 0.06, r, shade(c, 0.12), shade(c, -0.1), lx, -r * 0.06 + ly), e, Math.max(0.5, r * 0.09));
      for (const s of [-1, 1]) oval(ctx, s * r * 0.33, r * 0.24, r * 0.25, r * 0.21, 0, '#2a2119');
      poly(ctx, [[0, r * 0.44], [-r * 0.11, r * 0.64], [r * 0.11, r * 0.64]], '#2a2119');
      line(ctx, -r * 0.28, r * 0.86, r * 0.28, r * 0.86, rgba('#2a2119', 0.6), Math.max(0.5, r * 0.07));
      ctx.restore();
    };
    for (let i = 0; i < 9; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.22 + rnd() * 0.14);
      longBone(Math.cos(a) * d, Math.sin(a) * d * 0.95, a + Math.PI / 2 + (rnd() - 0.5) * 1.4, m * (0.18 + rnd() * 0.08), -0.06);
    }
    const ring = (n, d, r, tone) => {
      const turn = rnd() * TAU;
      for (let i = 0; i < n; i += 1) {
        const a = turn + (i / n) * TAU + (rnd() - 0.5) * 0.3;
        skull(Math.cos(a) * d, Math.sin(a) * d * 0.95, r * (0.92 + rnd() * 0.16), a - Math.PI / 2 + (rnd() - 0.5) * 0.6, tone);
      }
    };
    ring(8, m * 0.3, m * 0.088, -0.1);
    for (let i = 0; i < 3; i += 1) {
      const a = rnd() * TAU;
      longBone(Math.cos(a) * m * 0.16, Math.sin(a) * m * 0.16, a + Math.PI / 2 + (rnd() - 0.5), m * 0.2, -0.02);
    }
    ring(5, m * 0.16, m * 0.09, -0.03);
    skull(0, -m * 0.01, m * 0.1, (rnd() - 0.5) * 0.5, 0.04);
  },
  slime(g) {
    const { ctx, m, t, rnd } = g;
    const pts = blobPoints(0, 0, m * 0.44, m * 0.4, 12, 0.32, rnd);
    smoothShape(ctx, pts, radial(ctx, 0, 0, m * 0.46, rgba(shade(t, 0.1), 0.72), rgba(shade(t, -0.18), 0.62), -m * 0.12, -m * 0.12), rgba(shade(t, -0.35), 0.85), Math.max(0.8, m * 0.022));
    smoothShape(ctx, blobPoints(m * 0.02, m * 0.02, m * 0.28, m * 0.24, 9, 0.35, rnd), rgba(shade(t, -0.06), 0.5));
    for (let i = 0; i < 7; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.43 + rnd() * 0.04);
      const r = m * (0.018 + rnd() * 0.025);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d * 0.92;
      circle(ctx, x, y, r, rgba(shade(t, -0.05), 0.75), rgba(shade(t, -0.35), 0.8), Math.max(0.5, m * 0.008));
      circle(ctx, x - r * 0.3, y - r * 0.3, r * 0.3, rgba('#ffffff', 0.6));
    }
    for (let i = 0; i < 7; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.3;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const r = m * (0.02 + rnd() * 0.035);
      circle(ctx, x, y, r, rgba(shade(t, 0.25), 0.35), rgba(shade(t, 0.45), 0.9), Math.max(0.5, m * 0.01));
      circle(ctx, x - r * 0.35, y - r * 0.35, r * 0.28, rgba('#ffffff', 0.8));
    }
    ctx.beginPath();
    ctx.ellipse(-m * 0.06, -m * 0.05, m * 0.3, m * 0.24, 0, Math.PI * 1.08, Math.PI * 1.42);
    ctx.strokeStyle = rgba('#ffffff', 0.55);
    ctx.lineWidth = Math.max(0.8, m * 0.03);
    ctx.lineCap = 'round';
    ctx.stroke();
    oval(ctx, -m * 0.2, -m * 0.16, m * 0.05, m * 0.025, -0.6, rgba('#ffffff', 0.5));
  },
  egg_nest(g) {
    const { ctx, m, t, rnd } = g;
    shadow(g, 'round', m * 0.44, m * 0.42, 0.7);
    smoothShape(ctx, blobPoints(0, 0, m * 0.46, m * 0.44, 12, 0.12, rnd), '#4a3520', '#2a1d10', Math.max(0.6, m * 0.012));
    circle(ctx, 0, 0, m * 0.3, radial(ctx, 0, m * 0.02, m * 0.3, '#1e150c', '#3e2c19'));
    for (let i = 0; i < 64; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.29 + rnd() * 0.13);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const ta = a + Math.PI / 2 + (rnd() - 0.5) * 0.9;
      const l = m * (0.06 + rnd() * 0.08);
      line(ctx, x - Math.cos(ta) * l, y - Math.sin(ta) * l, x + Math.cos(ta) * l, y + Math.sin(ta) * l, shade(rnd() < 0.5 ? '#7a5a34' : '#5e4226', (rnd() - 0.4) * 0.25), Math.max(0.6, m * (0.014 + rnd() * 0.01)));
    }
    for (let i = 0; i < 3; i += 1) {
      const a = rnd() * TAU;
      const x = Math.cos(a) * m * 0.36;
      const y = Math.sin(a) * m * 0.36;
      const ta = a + Math.PI / 2;
      const l = m * 0.08;
      const bx = Math.cos(ta) * l;
      const by = Math.sin(ta) * l;
      line(ctx, x - bx, y - by, x + bx, y + by, '#e2d8bc', Math.max(0.8, m * 0.025));
      for (const s of [-1, 1]) circle(ctx, x + s * bx, y + s * by, m * 0.02, '#e2d8bc');
    }
    for (const [ex, ey, a] of [[0.0, -0.11, 0.1], [-0.11, 0.06, 0.5], [0.11, 0.07, -0.45]]) {
      const x = ex * m;
      const y = ey * m;
      const rx = m * 0.115;
      const ry = m * 0.15;
      oval(ctx, x + m * 0.02, y + m * 0.03, rx, ry, a, 'rgba(0,0,0,0.35)');
      oval(ctx, x, y, rx, ry, a, lit(ctx, x, y, ry, t, 0.2), shade(t, -0.35), Math.max(0.6, m * 0.012));
      for (let k = 0; k < 7; k += 1) {
        const pa = rnd() * TAU;
        const pd = Math.sqrt(rnd()) * 0.75;
        const lx = Math.cos(pa) * rx * pd;
        const ly = Math.sin(pa) * ry * pd;
        circle(ctx, x + lx * Math.cos(a) - ly * Math.sin(a), y + lx * Math.sin(a) + ly * Math.cos(a), m * (0.008 + rnd() * 0.012), rgba(shade(t, -0.3), 0.75));
      }
      oval(ctx, x - rx * 0.35, y - ry * 0.4, rx * 0.25, ry * 0.15, a - 0.5, rgba('#ffffff', 0.45));
    }
  },
  egg_sacs(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.38, m * 0.36, 0.5);
    const thin = Math.max(0.5, m * 0.01);
    smoothShape(ctx, blobPoints(0, 0, m * 0.42, m * 0.4, 10, 0.3, rnd), rgba('#f4f2ea', 0.16));
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU + rnd() * 0.4;
      const r0 = m * (0.05 + rnd() * 0.1);
      line(ctx, Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * m * 0.47, Math.sin(a) * m * 0.47, rgba('#f2efe6', 0.65), thin);
    }
    for (let i = 0; i < 10; i += 1) {
      const a1 = rnd() * TAU;
      const a2 = a1 + 0.6 + rnd() * 1.2;
      const r1 = m * (0.2 + rnd() * 0.24);
      const r2 = m * (0.2 + rnd() * 0.24);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
      ctx.quadraticCurveTo(Math.cos((a1 + a2) / 2) * r1 * 0.7, Math.sin((a1 + a2) / 2) * r1 * 0.7, Math.cos(a2) * r2, Math.sin(a2) * r2);
      ctx.strokeStyle = rgba('#f2efe6', 0.55);
      ctx.lineWidth = thin;
      ctx.stroke();
    }
    const sacs = [[-0.02, -0.3, 0.07, 0.1, 0.1], [-0.15, -0.1, 0.13, 0.2, -0.5], [0.14, -0.13, 0.12, 0.17, 0.6], [-0.2, 0.19, 0.09, 0.13, -1.0], [0.28, 0.12, 0.08, 0.12, 1.1], [0.06, 0.13, 0.14, 0.19, 0.25]];
    for (const [sx, sy, rx0, ry0, a] of sacs) {
      const x = sx * m;
      const y = sy * m;
      const rx = rx0 * m;
      const ry = ry0 * m;
      oval(ctx, x + m * 0.02, y + m * 0.025, rx, ry, a, 'rgba(0,0,0,0.25)');
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -ry);
      ctx.bezierCurveTo(rx * 0.6, -ry * 0.75, rx, -ry * 0.15, rx, ry * 0.3);
      ctx.bezierCurveTo(rx, ry * 0.8, rx * 0.55, ry, 0, ry);
      ctx.bezierCurveTo(-rx * 0.55, ry, -rx, ry * 0.8, -rx, ry * 0.3);
      ctx.bezierCurveTo(-rx, -ry * 0.15, -rx * 0.6, -ry * 0.75, 0, -ry);
      ctx.closePath();
      const lx = -0.35 * ry * (Math.cos(a) + Math.sin(a));
      const ly = 0.35 * ry * (Math.sin(a) - Math.cos(a));
      ctx.fillStyle = radial(ctx, 0, 0, ry * 1.1, '#fbf9f2', '#c9c3b3', lx, ly);
      ctx.fill();
      ctx.strokeStyle = '#9a9384';
      ctx.lineWidth = Math.max(0.5, m * 0.01);
      ctx.stroke();
      for (const k of [-0.55, -0.15, 0.25, 0.6]) {
        const half = rx * Math.sqrt(Math.max(0, 1 - k * k)) * 0.95;
        ctx.beginPath();
        ctx.moveTo(-half, ry * k + ry * 0.08);
        ctx.quadraticCurveTo(0, ry * k - ry * 0.12, half, ry * k + ry * 0.08);
        ctx.strokeStyle = rgba('#8a8474', 0.55);
        ctx.lineWidth = Math.max(0.5, m * 0.01);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (let i = 0; i < 5; i += 1) {
      const a = rnd() * TAU;
      line(ctx, Math.cos(a) * m * 0.3, Math.sin(a) * m * 0.3, Math.cos(a + 2.4) * m * 0.3, Math.sin(a + 2.4) * m * 0.3, rgba('#ffffff', 0.45), thin);
    }
  },
  glow_fungus(g) {
    const { ctx, m, t, rnd } = g;
    glow(ctx, 0, 0, m * 0.52, t, 0.32);
    smoothShape(ctx, blobPoints(0, 0, m * 0.3, m * 0.27, 9, 0.35, rnd), rgba('#141c19', 0.5));
    // A mushroom: a stem from its root out to the cap (a tilted cap shows its stem), the cap glowing.
    const shroom = (x, y, r, a, lean) => {
      const cx = x + Math.cos(a) * lean;
      const cy = y + Math.sin(a) * lean;
      if (lean > 0) {
        line(ctx, x, y, cx, cy, rgba('#1a2420', 0.7), Math.max(1, r * 0.62));
        line(ctx, x, y, cx, cy, '#cfe2da', Math.max(0.6, r * 0.42));
      }
      glow(ctx, cx, cy, r * 2.3, t, 0.3);
      const fill = radial(ctx, cx, cy, r, shade(t, 0.42), shade(t, -0.1), cx - r * 0.3, cy - r * 0.3);
      oval(ctx, cx, cy, lean > 0 ? r * 0.78 : r, r, a, fill, shade(t, -0.35), Math.max(0.5, r * 0.1));
      if (lean > 0) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 0.78, r, a, Math.PI * 0.6, Math.PI * 1.4);
        ctx.strokeStyle = rgba(shade(t, -0.3), 0.7);
        ctx.lineWidth = Math.max(0.5, r * 0.18);
        ctx.stroke();
      }
      circle(ctx, cx - r * 0.3, cy - r * 0.3, r * 0.18, rgba('#ffffff', 0.75));
      circle(ctx, cx + r * 0.25, cy + r * 0.05, r * 0.12, rgba('#ffffff', 0.5));
    };
    const n = 7;
    const turn = rnd() * TAU;
    for (let i = 0; i < n; i += 1) {
      const a = turn + (i / n) * TAU + (rnd() - 0.5) * 0.5;
      const d = m * (0.17 + rnd() * 0.1);
      shroom(Math.cos(a) * m * 0.06, Math.sin(a) * m * 0.06, m * (0.05 + rnd() * 0.035), a, d);
    }
    for (const [x, y, r] of [[-0.07, -0.04, 0.11], [0.08, 0.05, 0.09], [0.0, 0.11, 0.065]]) shroom(x * m, y * m, r * m * (0.9 + rnd() * 0.2), 0, 0);
    for (let i = 0; i < 12; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.12 + rnd() * 0.3);
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, Math.max(0.5, m * 0.01), rgba(shade(t, 0.45), 0.85));
    }
  },
  mausoleum(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.47, h * 0.47, 2.2);
    const lw = Math.max(0.8, m * 0.008);
    const ink = '#36322e';
    const roofB = h * 0.16;
    const top = -h * 0.48;
    const rh = roofB - top;
    // Steps at the front.
    for (let i = 2; i >= 0; i -= 1) {
      const y = h * 0.37 + i * h * 0.035;
      const hw = w * (0.22 + i * 0.03);
      rect(ctx, -hw, y, hw * 2, h * 0.035, shade('#8d887f', 0.04 - i * 0.04), ink, lw);
      line(ctx, -hw + lw, y + lw * 1.5, hw - lw, y + lw * 1.5, rgba('#ffffff', 0.2), lw, 'butt');
    }
    // The porch: a barred door at its back, columns along its front.
    rect(ctx, -w * 0.4, roofB, w * 0.8, h * 0.21, '#7f7a71', ink, lw);
    for (let i = 1; i < 4; i += 1) line(ctx, -w * 0.4 + (w * 0.8 * i) / 4, roofB, -w * 0.4 + (w * 0.8 * i) / 4, roofB + h * 0.21, rgba(ink, 0.3), lw, 'butt');
    rect(ctx, -w * 0.13, roofB, w * 0.26, h * 0.06, '#100e0c', ink, lw);
    for (let i = 1; i < 7; i += 1) line(ctx, -w * 0.13 + (w * 0.26 * i) / 7, roofB, -w * 0.13 + (w * 0.26 * i) / 7, roofB + h * 0.06, '#5a5e64', Math.max(0.8, m * 0.008), 'butt');
    line(ctx, -w * 0.13, roofB + h * 0.03, w * 0.13, roofB + h * 0.03, '#5a5e64', Math.max(0.8, m * 0.008), 'butt');
    for (const x of [-0.32, -0.12, 0.12, 0.32]) {
      const cx = x * w;
      const cy = h * 0.31;
      circle(ctx, cx + w * 0.012, cy + w * 0.015, w * 0.048, 'rgba(0,0,0,0.3)');
      circle(ctx, cx, cy, w * 0.046, lit(ctx, cx, cy, w * 0.046, '#c4bfb5', 0.16), '#5d5953', lw);
      circle(ctx, cx, cy, w * 0.03, null, rgba('#5d5953', 0.45), lw * 0.7);
    }
    // The roof: a lit slope and a shaded one, slabs laid in courses down to the eaves.
    for (const s of [-1, 1]) {
      const x1 = s * w * 0.46;
      const gr = ctx.createLinearGradient(0, 0, x1, 0);
      gr.addColorStop(0, s < 0 ? '#a29d93' : '#625d56');
      gr.addColorStop(1, s < 0 ? '#86817a' : '#4c4843');
      rect(ctx, Math.min(0, x1), top, w * 0.46, rh, gr);
      const courses = 5;
      for (let c = 0; c < courses; c += 1) {
        const xa = (x1 * c) / courses;
        const xb = (x1 * (c + 1)) / courses;
        if (c < courses - 1) line(ctx, xb, top, xb, roofB, rgba('#000000', 0.3), Math.max(1, m * 0.01), 'butt');
        line(ctx, xa + s * m * 0.008, top, xa + s * m * 0.008, roofB, rgba('#ffffff', 0.13), lw, 'butt');
        const step = h * 0.085;
        for (let y = top + (c % 2 ? step / 2 : step); y < roofB - h * 0.02; y += step) line(ctx, xa, y, xb, y, rgba('#000000', 0.2), lw, 'butt');
      }
    }
    for (let i = 0; i < 18; i += 1) {
      const x = (rnd() - 0.5) * w * 0.86;
      const y = top + rh * Math.sqrt(rnd());
      const r = m * (0.02 + rnd() * 0.035);
      smoothShape(ctx, blobPoints(x, y, r, r * 0.8, 6, 0.5, rnd), rgba(rnd() < 0.5 ? '#5a7a36' : '#6f8a42', 0.65));
    }
    // The ridge and its finials, the eaves.
    rect(ctx, -w * 0.03, top, w * 0.06, rh, '#aaa59b', ink, lw);
    line(ctx, -w * 0.018, top, -w * 0.018, roofB, rgba('#ffffff', 0.25), lw, 'butt');
    for (let y = top + h * 0.06; y < roofB; y += h * 0.06) line(ctx, -w * 0.03, y, w * 0.03, y, rgba(ink, 0.55), lw, 'butt');
    for (const y of [top + w * 0.04, roofB - w * 0.04]) circle(ctx, 0, y, w * 0.048, lit(ctx, 0, y, w * 0.048, '#b8b3a9', 0.16), ink, lw);
    rect(ctx, -w * 0.46, top, w * 0.92, rh, null, '#2a2724', Math.max(1.2, m * 0.014));
  },
  grave_cross(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.46, h * 0.4, 1.3);
    const ink = '#45413b';
    const lw = Math.max(0.6, m * 0.05);
    const a = m * 0.12;
    const cx = -w * 0.17;
    const L = -w * 0.47;
    const R = w * 0.44;
    const T = h * 0.46;
    rect(ctx, w * 0.3, -m * 0.25, w * 0.16, m * 0.5, lit(ctx, w * 0.38, 0, m * 0.4, '#7d786f', 0.1), ink, lw);
    circle(ctx, cx, 0, m * 0.27, null, ink, m * 0.11 + lw * 2);
    circle(ctx, cx, 0, m * 0.27, null, '#8f8a81', m * 0.11);
    const pts = [[L, -a], [cx - a, -a], [cx - a, -T], [cx + a, -T], [cx + a, -a], [R, -a], [R, a], [cx + a, a], [cx + a, T], [cx - a, T], [cx - a, a], [L, a]];
    poly(ctx, pts, lit(ctx, cx, -m * 0.1, w * 0.5, '#9a958c', 0.12), ink, lw);
    circle(ctx, cx, 0, a * 0.7, null, rgba(ink, 0.6), lw * 0.6);
    polyline(ctx, [[cx + m * 0.4, -a * 0.9], [cx + m * 0.5, -a * 0.1], [cx + m * 0.62, a * 0.4]], rgba('#2f2c28', 0.7), Math.max(0.5, m * 0.025));
    for (let i = 0; i < 6; i += 1) {
      const x = L + rnd() * (R - L);
      const y = (rnd() - 0.5) * a * 1.6;
      circle(ctx, x, y, m * (0.03 + rnd() * 0.04), rgba(rnd() < 0.5 ? '#6a7f3a' : '#a8a070', 0.65));
    }
  },
  mine_support(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.48, h * 0.3, 3);
    const lw = Math.max(0.6, m * 0.025);
    const ink = '#2e1f10';
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - m * 0.24);
      rect(ctx, x - m * 0.22, -m * 0.22, m * 0.44, m * 0.44, '#5b3d22', ink, lw);
    }
    const top = -m * 0.16;
    const bh = m * 0.32;
    const gr = ctx.createLinearGradient(0, top, 0, top + bh);
    gr.addColorStop(0, '#9a7048');
    gr.addColorStop(0.5, '#7d5634');
    gr.addColorStop(1, '#5b3d22');
    rect(ctx, -w * 0.49, top, w * 0.98, bh, gr, ink, lw);
    for (let i = 0; i < 8; i += 1) {
      const y = top + bh * (0.15 + rnd() * 0.7);
      const x0 = -w * 0.47 + rnd() * w * 0.5;
      line(ctx, x0, y, x0 + w * (0.15 + rnd() * 0.3), y + (rnd() - 0.5) * bh * 0.1, rgba('#3e2914', 0.5), Math.max(0.5, m * 0.012));
    }
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - m * 0.24);
      rect(ctx, x - m * 0.05, top - m * 0.02, m * 0.1, bh + m * 0.04, '#3a3a3a', '#1a1a1a', lw * 0.6);
      circle(ctx, x, top + bh * 0.3, m * 0.025, '#8a8a8a');
      circle(ctx, x, top + bh * 0.7, m * 0.025, '#8a8a8a');
    }
  },
  ore(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.44, m * 0.4, 0.8);
    smoothShape(ctx, blobPoints(0, 0, m * 0.46, m * 0.42, 11, 0.3, rnd), rgba('#2a2622', 0.6));
    const rocks = [];
    for (let i = 0; i < 20; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.34;
      rocks.push([Math.cos(a) * d, Math.sin(a) * d * 0.92, m * (0.065 + rnd() * 0.06)]);
    }
    rocks.sort((p, q) => Math.hypot(q[0], q[1]) - Math.hypot(p[0], p[1]));
    const metals = ['#e8c046', '#d08a3c', '#e8c046', '#b8c4cc'];
    for (const [x, y, r] of rocks) {
      oval(ctx, x + r * 0.25, y + r * 0.3, r, r * 0.85, 0, 'rgba(0,0,0,0.3)');
      stone(g, x, y, r, r * 0.85, ['#4c4743', '#403c39', '#56504a', '#3a3634'][Math.floor(rnd() * 4)], 6, 0.45);
      if (rnd() < 0.75) {
        const c = metals[Math.floor(rnd() * metals.length)];
        const a = rnd() * TAU;
        const vx = Math.cos(a) * r * 0.6;
        const vy = Math.sin(a) * r * 0.5;
        polyline(ctx, [[x - vx, y - vy], [x - vx * 0.2 + (rnd() - 0.5) * r * 0.3, y - vy * 0.2 + (rnd() - 0.5) * r * 0.3], [x + vx, y + vy]], c, Math.max(0.6, m * 0.018));
        circle(ctx, x + (rnd() - 0.5) * r * 0.8, y + (rnd() - 0.5) * r * 0.6, Math.max(0.6, m * 0.014), shade(c, 0.15));
      }
    }
    for (let i = 0; i < 4; i += 1) {
      const x = (rnd() - 0.5) * m * 0.6;
      const y = (rnd() - 0.5) * m * 0.55;
      const s = m * 0.035;
      poly(ctx, [[x, y - s], [x + s * 0.25, y - s * 0.25], [x + s, y], [x + s * 0.25, y + s * 0.25], [x, y + s], [x - s * 0.25, y + s * 0.25], [x - s, y], [x - s * 0.25, y - s * 0.25]], rgba('#fffbe8', 0.9));
    }
  },
  pickaxe(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.4, m * 0.4, 0.25);
    const wood = '#8f6237';
    const ink = '#33220f';
    const ironInk = '#26292d';
    const hw = Math.max(1, m * 0.065);
    const e = Math.max(0.6, m * 0.022);
    const stick = (x1, y1, x2, y2) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      let nx = -(y2 - y1) / len;
      let ny = (x2 - x1) / len;
      if (nx + ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      line(ctx, x1, y1, x2, y2, ink, hw + e * 2);
      line(ctx, x1, y1, x2, y2, wood, hw);
      line(ctx, x1 + nx * hw * 0.22, y1 + ny * hw * 0.22, x2 + nx * hw * 0.22, y2 + ny * hw * 0.22, rgba('#ffffff', 0.22), Math.max(0.5, hw * 0.28));
    };
    // The shovel, under.
    stick(-m * 0.38, m * 0.38, m * 0.13, -m * 0.13);
    line(ctx, -m * 0.44, m * 0.32, -m * 0.32, m * 0.44, ink, hw + e * 2);
    line(ctx, -m * 0.44, m * 0.32, -m * 0.32, m * 0.44, wood, hw);
    ctx.save();
    ctx.translate(m * 0.25, -m * 0.25);
    ctx.rotate(-Math.PI / 4);
    rect(ctx, -m * 0.16, -m * 0.045, m * 0.07, m * 0.09, '#5a5e64', ironInk, e);
    poly(ctx, [[-m * 0.1, -m * 0.11], [m * 0.1, -m * 0.1], [m * 0.2, 0], [m * 0.1, m * 0.1], [-m * 0.1, m * 0.11]], radial(ctx, 0, 0, m * 0.2, '#a3a8ae', '#5e6268', -m * 0.05, -m * 0.08), ironInk, e);
    line(ctx, -m * 0.08, 0, m * 0.12, 0, rgba(ironInk, 0.5), e * 0.8);
    ctx.restore();
    // The pickaxe on top.
    stick(m * 0.38, m * 0.38, -m * 0.22, -m * 0.22);
    ctx.save();
    ctx.translate(-m * 0.24, -m * 0.24);
    ctx.rotate(-Math.PI / 4);
    const upper = [];
    const lower = [];
    for (let i = 0; i <= 12; i += 1) {
      const s = -1 + (2 * i) / 12;
      const x = s * m * 0.3;
      const yc = (s * s - 0.35) * m * 0.12;
      const th = m * 0.055 * Math.pow(1 - s * s, 0.6) + m * 0.006;
      upper.push([x, yc - th]);
      lower.push([x, yc + th]);
    }
    poly(ctx, [...upper, ...lower.reverse()], radial(ctx, 0, 0, m * 0.3, '#9ca1a8', '#50545a', -m * 0.08, -m * 0.1), ironInk, e);
    rect(ctx, -m * 0.05, -m * 0.06, m * 0.1, m * 0.1, '#4a4e54', ironInk, e);
    ctx.restore();
  },
  sewer_pipe(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.4, m * 0.36, 0.5);
    const cy = -m * 0.12;
    const sludge = '#6b7a2e';
    smoothShape(ctx, blobPoints(m * 0.02, m * 0.36, m * 0.22, m * 0.1, 9, 0.35, rnd), rgba(sludge, 0.85), rgba(shade(sludge, -0.25), 0.8), Math.max(0.5, m * 0.012));
    circle(ctx, 0, cy, m * 0.36, '#6c675f', '#3f3b36', Math.max(0.6, m * 0.015));
    for (let i = 0; i < 12; i += 1) {
      const a0 = (i / 12) * TAU;
      const a1 = ((i + 1) / 12) * TAU;
      ctx.beginPath();
      ctx.arc(0, cy, m * 0.35, a0 + 0.03, a1 - 0.03);
      ctx.arc(0, cy, m * 0.26, a1 - 0.03, a0 + 0.03, true);
      ctx.closePath();
      ctx.fillStyle = shade('#7d786f', (rnd() - 0.5) * 0.12 + Math.cos((a0 + a1) / 2 + 2.4) * 0.06);
      ctx.fill();
    }
    circle(ctx, 0, cy, m * 0.25, lit(ctx, 0, cy, m * 0.25, '#7a6a58', 0.14), '#2a2018', Math.max(0.6, m * 0.02));
    circle(ctx, 0, cy, m * 0.19, radial(ctx, 0, cy + m * 0.03, m * 0.19, '#030303', '#2a241e'));
    ctx.beginPath();
    ctx.moveTo(-m * 0.09, cy + m * 0.12);
    ctx.quadraticCurveTo(-m * 0.1, cy + m * 0.3, -m * 0.06, m * 0.3);
    ctx.lineTo(m * 0.1, m * 0.3);
    ctx.quadraticCurveTo(m * 0.1, cy + m * 0.28, m * 0.08, cy + m * 0.12);
    ctx.quadraticCurveTo(0, cy + m * 0.2, -m * 0.09, cy + m * 0.12);
    ctx.closePath();
    ctx.fillStyle = rgba(sludge, 0.92);
    ctx.fill();
    for (const x of [-0.05, 0.01, 0.06]) line(ctx, x * m, cy + m * 0.2, x * m * 1.1, m * 0.28, rgba('#a8b860', 0.7), Math.max(0.5, m * 0.015));
    for (let i = 0; i < 3; i += 1) circle(ctx, (rnd() - 0.5) * m * 0.3, m * (0.33 + rnd() * 0.06), m * 0.018, null, rgba('#c8d880', 0.8), Math.max(0.5, m * 0.008));
  },
  statue_broken(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.44, m * 0.42, 0.6);
    const marble = '#d4cec2';
    const ink = '#6a655c';
    const lw = Math.max(0.6, m * 0.013);
    const chip = (x, y, r, c) => poly(ctx, blobPoints(x, y, r, r * 0.8, 5, 0.6, rnd, rnd() * TAU), lit(ctx, x, y, r, c, 0.14), rgba(ink, 0.9), lw * 0.8);
    smoothShape(ctx, blobPoints(m * 0.02, m * 0.02, m * 0.44, m * 0.4, 11, 0.35, rnd), rgba('#e0dacd', 0.16));
    // The plinth, the statue's broken feet still on it.
    const px = -m * 0.27;
    const py = -m * 0.27;
    const ps = m * 0.16;
    rect(ctx, px - ps, py - ps, ps * 2, ps * 2, lit(ctx, px, py, ps * 1.4, '#9a958c', 0.1), ink, lw);
    rect(ctx, px - ps * 0.76, py - ps * 0.76, ps * 1.52, ps * 1.52, null, rgba(ink, 0.5), lw * 0.7);
    for (const [fx, fy] of [[-0.045, -0.02], [0.05, 0.035]]) {
      const x = px + fx * m;
      const y = py + fy * m;
      poly(ctx, blobPoints(x, y, m * 0.045, m * 0.04, 7, 0.5, rnd), lit(ctx, x, y, m * 0.05, marble, 0.15), ink, lw);
    }
    // The figure lies where it fell, broken in three: legs, body, head.
    ctx.save();
    ctx.translate(m * 0.06, m * 0.06);
    ctx.rotate(Math.PI / 4);
    const P = (pts) => pts.map(([x, y]) => [x * m, y * m]);
    const stoneFill = (x0, y0, r) => radial(ctx, x0 * m, y0 * m, r * m, shade(marble, 0.1), shade(marble, -0.15), (x0 - r * 0.5) * m, y0 * m);
    for (const [x, y, r] of [[-0.04, -0.13, 0.025], [-0.02, 0.14, 0.02], [0.29, -0.11, 0.022], [0.3, 0.17, 0.018], [-0.37, 0.1, 0.02], [0.08, -0.2, 0.016]]) chip(x * m, y * m, r * m, marble);
    poly(ctx, P([[-0.07, -0.085], [-0.2, -0.075], [-0.33, -0.055], [-0.31, -0.02], [-0.345, 0.01], [-0.31, 0.055], [-0.2, 0.075], [-0.07, 0.085], [-0.09, 0.03], [-0.05, -0.01], [-0.085, -0.05]]), stoneFill(-0.2, 0, 0.16), ink, lw);
    line(ctx, -0.09 * m, 0, -0.31 * m, 0, rgba(ink, 0.55), lw);
    for (const s of [-1, 1]) line(ctx, -0.2 * m, s * 0.02 * m, -0.2 * m, s * 0.065 * m, rgba(ink, 0.35), lw * 0.8);
    poly(ctx, P([[0.165, 0.135], [0.02, 0.15], [0.0, 0.205], [0.175, 0.195]]), stoneFill(0.1, 0.17, 0.12), ink, lw);
    poly(ctx, P([[-0.01, -0.09], [0.12, -0.125], [0.17, -0.145], [0.205, -0.11], [0.215, -0.05], [0.245, -0.035], [0.25, 0.0], [0.245, 0.035], [0.215, 0.05], [0.205, 0.11], [0.17, 0.145], [0.12, 0.125], [-0.01, 0.09], [0.015, 0.045], [-0.025, 0.005], [0.01, -0.04]]), stoneFill(0.1, 0, 0.18), ink, lw);
    poly(ctx, P([[0.165, -0.14], [0.14, -0.18], [0.18, -0.19], [0.205, -0.12]]), stoneFill(0.17, -0.16, 0.05), ink, lw);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0.19 * m, s * 0.015 * m);
      ctx.quadraticCurveTo(0.14 * m, s * 0.11 * m, 0.085 * m, s * 0.095 * m);
      ctx.strokeStyle = rgba(ink, 0.5);
      ctx.lineWidth = lw * 0.8;
      ctx.stroke();
    }
    line(ctx, 0.19 * m, 0, 0.05 * m, 0, rgba(ink, 0.4), lw * 0.7);
    circle(ctx, 0.03 * m, 0, Math.max(0.5, m * 0.008), rgba(ink, 0.6));
    polyline(ctx, P([[0.05, -0.09], [0.08, -0.04], [0.06, 0.0], [0.1, 0.05]]), rgba(ink, 0.6), lw * 0.7);
    // The head, rolled a little aside, face up.
    const hx = 0.34;
    const hy = 0.07;
    const hr = 0.085;
    circle(ctx, hx * m, hy * m, hr * m, stoneFill(hx, hy, hr), ink, lw);
    for (let i = 0; i < 5; i += 1) {
      const a = -1.2 + i * 0.6;
      circle(ctx, (hx + Math.cos(a) * hr * 0.72) * m, (hy + Math.sin(a) * hr * 0.72) * m, hr * 0.24 * m, null, rgba(ink, 0.45), lw * 0.6);
    }
    for (const s of [-1, 1]) oval(ctx, (hx + 0.005) * m, (hy + s * 0.032) * m, 0.011 * m, 0.016 * m, 0, '#5d5953');
    line(ctx, (hx - 0.005) * m, hy * m, (hx - 0.035) * m, hy * m, rgba(ink, 0.7), lw);
    line(ctx, (hx - 0.055) * m, (hy - 0.018) * m, (hx - 0.055) * m, (hy + 0.018) * m, rgba(ink, 0.6), lw * 0.8);
    ctx.restore();
    for (const [x, y, r] of [[-0.1, -0.42, 0.022], [-0.44, -0.05, 0.02], [0.35, -0.05, 0.02], [-0.05, 0.38, 0.02], [0.4, 0.2, 0.016]]) chip(x * m, y * m, r * m, rnd() < 0.5 ? marble : '#a39e95');
  },
  // ----- Traps (new) -----
  bear_trap(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.44, m * 0.34, 0.2);
    const iron = '#6a625a';
    const ink = '#1a1816';
    const e = Math.max(0.6, m * 0.02);
    // The chain, out to a stake.
    for (let i = 0; i < 5; i += 1) {
      const x = m * (0.14 + i * 0.062);
      const y = m * (0.3 + i * 0.026);
      const rot = 0.4 + (i % 2) * 1.4;
      oval(ctx, x, y, m * 0.04, m * 0.022, rot, null, ink, Math.max(1, m * 0.032));
      oval(ctx, x, y, m * 0.04, m * 0.022, rot, null, '#8e8a84', Math.max(0.5, m * 0.016));
    }
    circle(ctx, m * 0.43, m * 0.42, m * 0.05, lit(ctx, m * 0.43, m * 0.42, m * 0.05, '#8e8a84', 0.2), ink, e);
    // The flat springs, a long loop out to each side.
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * m * 0.27, -m * 0.06);
      ctx.lineTo(s * m * 0.41, -m * 0.06);
      ctx.arc(s * m * 0.41, 0, m * 0.06, -Math.PI / 2, Math.PI / 2, s < 0);
      ctx.lineTo(s * m * 0.27, m * 0.06);
      ctx.lineCap = 'round';
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1.6, m * 0.075);
      ctx.stroke();
      ctx.strokeStyle = iron;
      ctx.lineWidth = Math.max(0.9, m * 0.045);
      ctx.stroke();
    }
    // The jaws, opened flat into a ring, saw teeth pointing in.
    circle(ctx, 0, 0, m * 0.28, null, ink, Math.max(2, m * 0.1));
    circle(ctx, 0, 0, m * 0.28, null, iron, Math.max(1.2, m * 0.07));
    ctx.beginPath();
    ctx.arc(0, 0, m * 0.29, Math.PI * 1.05, Math.PI * 1.6);
    ctx.strokeStyle = rgba('#ffffff', 0.3);
    ctx.lineWidth = Math.max(0.5, m * 0.018);
    ctx.stroke();
    const n = 12;
    for (let i = 0; i < n; i += 1) {
      const a = ((i + 0.5) / n) * TAU;
      const r0 = m * 0.245;
      const r1 = m * 0.11;
      const b1 = [Math.cos(a - 0.2) * r0, Math.sin(a - 0.2) * r0];
      const tip = [Math.cos(a) * r1, Math.sin(a) * r1];
      const b2 = [Math.cos(a + 0.2) * r0, Math.sin(a + 0.2) * r0];
      poly(ctx, [b1, tip, b2], '#c4c7cb', ink, Math.max(0.5, m * 0.014));
      poly(ctx, [[Math.cos(a) * r0, Math.sin(a) * r0], tip, b2], rgba('#000000', 0.25));
    }
    for (const s of [-1, 1]) circle(ctx, s * m * 0.28, 0, m * 0.05, lit(ctx, s * m * 0.28, 0, m * 0.05, '#7a726a', 0.2), ink, e);
    // The pan in the middle.
    circle(ctx, 0, 0, m * 0.075, lit(ctx, 0, 0, m * 0.075, '#8a827a', 0.2), ink, e);
    line(ctx, -m * 0.04, 0, m * 0.04, 0, rgba(ink, 0.7), e);
  },
  floor_spikes(g) {
    const { ctx, w, h, m } = g;
    const ink = '#26282b';
    rect(ctx, -w * 0.47, -h * 0.47, w * 0.94, h * 0.94, '#4a4c50', ink, Math.max(0.8, m * 0.03));
    poly(ctx, [[-w * 0.47, -h * 0.47], [w * 0.47, -h * 0.47], [w * 0.43, -h * 0.43], [-w * 0.43, -h * 0.43]], rgba('#ffffff', 0.15));
    poly(ctx, [[-w * 0.47, -h * 0.47], [-w * 0.43, -h * 0.43], [-w * 0.43, h * 0.43], [-w * 0.47, h * 0.47]], rgba('#ffffff', 0.09));
    poly(ctx, [[w * 0.47, h * 0.47], [-w * 0.47, h * 0.47], [-w * 0.43, h * 0.43], [w * 0.43, h * 0.43]], rgba('#000000', 0.25));
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) circle(ctx, x * w * 0.4, y * h * 0.4, m * 0.02, '#8a8d92');
    const n = 4;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        const x = -w * 0.3 + (c * w * 0.6) / (n - 1);
        const y = -h * 0.3 + (r * h * 0.6) / (n - 1);
        const s = m * 0.062;
        circle(ctx, x, y, s * 1.25, '#121212');
        poly(ctx, [[x, y], [x + s * 0.7, y - s * 0.3], [x + m * 0.14, y + m * 0.16], [x - s * 0.3, y + s * 0.7]], rgba('#000000', 0.3));
        poly(ctx, [[x, y], [x - s, y], [x, y - s]], '#d2d5da');
        poly(ctx, [[x, y], [x, y - s], [x + s, y]], '#9ea1a6');
        poly(ctx, [[x, y], [x + s, y], [x, y + s]], '#55585d');
        poly(ctx, [[x, y], [x, y + s], [x - s, y]], '#7c7f84');
        circle(ctx, x, y, Math.max(0.4, m * 0.008), '#ffffff');
      }
    }
  },
  blade_trap(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.4, h * 0.34, 3);
    const ink = '#1c1d20';
    const lw = Math.max(0.6, m * 0.04);
    const W = w * 0.28;
    const y0 = -h * 0.22;
    const yb = h * 0.46;
    const yi = h * 0.1;
    const crescent = (dx, rot) => {
      ctx.save();
      ctx.translate(dx, -h * 0.4);
      ctx.rotate(rot);
      ctx.translate(0, h * 0.4);
      ctx.beginPath();
      ctx.moveTo(-W, y0);
      ctx.quadraticCurveTo(0, 2 * yb - y0, W, y0);
      ctx.quadraticCurveTo(0, 2 * yi - y0, -W, y0);
      ctx.closePath();
      ctx.restore();
    };
    // Blurred copies where it swings to and fro.
    for (const [k, al] of [[-2, 0.12], [-1, 0.24], [1, 0.24], [2, 0.12]]) {
      crescent(k * w * 0.075, k * 0.03);
      ctx.fillStyle = rgba('#e2e6ea', al);
      ctx.fill();
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const y = -h * 0.12 + i * h * 0.13;
        line(ctx, s * (W + w * 0.02 - i * w * 0.03), y, s * (W + w * (0.13 - i * 0.03)), y - h * 0.04, rgba('#ffffff', 0.6), Math.max(0.6, m * 0.03));
      }
    }
    // The beam it hangs from, set into the walls.
    line(ctx, -w * 0.46, -h * 0.38, w * 0.46, -h * 0.38, ink, Math.max(1.2, m * 0.14));
    line(ctx, -w * 0.46, -h * 0.38, w * 0.46, -h * 0.38, '#5a5048', Math.max(0.8, m * 0.09));
    for (const s of [-1, 1]) rect(ctx, s * w * 0.475 - m * 0.12, -h * 0.48, m * 0.24, h * 0.24, '#6d6860', '#2f2c28', lw);
    // The pole and the blade.
    rect(ctx, -m * 0.08, -h * 0.4, m * 0.16, h * 0.56, '#3a3c40', ink, lw);
    crescent(0, 0);
    const gr = ctx.createLinearGradient(-W, y0, W * 0.4, yb);
    gr.addColorStop(0, '#dfe3e8');
    gr.addColorStop(0.5, '#9aa0a6');
    gr.addColorStop(1, '#5a5f65');
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-W * 0.92, y0 + h * 0.05);
    ctx.quadraticCurveTo(0, 2 * yb - y0 - h * 0.12, W * 0.92, y0 + h * 0.05);
    ctx.strokeStyle = rgba('#f6f9fc', 0.9);
    ctx.lineWidth = Math.max(0.6, m * 0.045);
    ctx.stroke();
    circle(ctx, 0, -h * 0.02, m * 0.06, '#2a2c30', ink, Math.max(0.5, m * 0.01));
  },
  dart_holes(g) {
    const { ctx, w, h, m, rnd } = g;
    const ink = '#4a453f';
    rect(ctx, -w * 0.44, -h * 0.44, w * 0.88, h * 0.88, lit(ctx, -w * 0.1, -h * 0.1, m * 0.7, '#8a847a', 0.06), ink, Math.max(0.8, m * 0.03));
    poly(ctx, [[-w * 0.44, -h * 0.44], [w * 0.44, -h * 0.44], [w * 0.4, -h * 0.4], [-w * 0.4, -h * 0.4]], rgba('#ffffff', 0.14));
    poly(ctx, [[-w * 0.44, -h * 0.44], [-w * 0.4, -h * 0.4], [-w * 0.4, h * 0.4], [-w * 0.44, h * 0.44]], rgba('#ffffff', 0.08));
    poly(ctx, [[w * 0.44, h * 0.44], [-w * 0.44, h * 0.44], [-w * 0.4, h * 0.4], [w * 0.4, h * 0.4]], rgba('#000000', 0.18));
    poly(ctx, [[w * 0.44, h * 0.44], [w * 0.44, -h * 0.44], [w * 0.4, -h * 0.4], [w * 0.4, h * 0.4]], rgba('#000000', 0.12));
    for (const [x, y] of [[-0.2, -0.18], [0.06, -0.24], [0.24, -0.06], [-0.06, 0.04], [0.14, 0.2]]) {
      circle(ctx, x * w, y * h, m * 0.055, '#0c0a08');
      ctx.beginPath();
      ctx.arc(x * w, y * h, m * 0.055, 0.2, Math.PI * 0.9);
      ctx.strokeStyle = rgba('#ffffff', 0.25);
      ctx.lineWidth = Math.max(0.5, m * 0.012);
      ctx.stroke();
    }
    const dart = (x, y, a) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      line(ctx, -m * 0.15, 0, m * 0.1, 0, '#3a2a1a', Math.max(1, m * 0.035));
      line(ctx, -m * 0.15, 0, m * 0.1, 0, '#8a6a42', Math.max(0.6, m * 0.02));
      poly(ctx, [[m * 0.08, -m * 0.025], [m * 0.19, 0], [m * 0.08, m * 0.025]], '#b8bec4', '#2a2d31', Math.max(0.4, m * 0.008));
      poly(ctx, [[-m * 0.17, 0], [-m * 0.1, -m * 0.05], [-m * 0.06, 0]], '#c0392b');
      poly(ctx, [[-m * 0.17, 0], [-m * 0.1, m * 0.05], [-m * 0.06, 0]], '#e8dcc8');
      ctx.restore();
    };
    dart(-w * 0.05, h * 0.32, 0.3 + rnd() * 0.4);
    dart(w * 0.26, h * 0.08, 2.0 + rnd() * 0.5);
    dart(-w * 0.28, -h * 0.02, -1.2 + rnd() * 0.5);
  },
  tripwire(g) {
    const { ctx, w, m } = g;
    line(ctx, -w * 0.44, m * 0.12, w * 0.44, m * 0.12, rgba('#000000', 0.3), Math.max(0.6, m * 0.1));
    line(ctx, -w * 0.44, 0, w * 0.44, 0, '#dcd8cc', Math.max(0.6, m * 0.09));
    for (const s of [-1, 1]) {
      const x = s * w * 0.44;
      circle(ctx, x + m * 0.08, m * 0.1, m * 0.36, 'rgba(0,0,0,0.3)');
      circle(ctx, x, 0, m * 0.36, lit(ctx, x, 0, m * 0.36, '#7a5530', 0.15), '#3e2914', Math.max(0.5, m * 0.06));
      circle(ctx, x, 0, m * 0.16, '#a8804e');
    }
    circle(ctx, w * 0.1, 0, m * 0.18, '#c8a03a', '#6a5214', Math.max(0.5, m * 0.04));
  },
  floor_hole(g) {
    const { ctx, m, rnd } = g;
    const n = 18;
    const hole = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU + (rnd() - 0.5) * 0.15;
      const r = m * (i % 2 ? 0.29 + rnd() * 0.05 : 0.34 + rnd() * 0.07);
      hole.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    smoothShape(ctx, hole.map(([x, y]) => [x * 1.28, y * 1.28]), rgba('#2a2018', 0.35));
    for (let i = 0; i < 7; i += 1) {
      const a = rnd() * TAU;
      const r1 = m * (0.4 + rnd() * 0.07);
      polyline(ctx, [[Math.cos(a) * m * 0.3, Math.sin(a) * m * 0.3], [Math.cos(a + 0.12) * m * 0.37, Math.sin(a + 0.12) * m * 0.37], [Math.cos(a - 0.04) * r1, Math.sin(a - 0.04) * r1]], rgba('#140f0a', 0.65), Math.max(0.6, m * 0.012));
    }
    poly(ctx, hole, radial(ctx, 0, m * 0.03, m * 0.42, '#000000', '#221a12'), '#0c0a08', Math.max(0.6, m * 0.012));
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + rnd() * 0.7;
      ctx.save();
      ctx.rotate(a);
      const pw = m * (0.045 + rnd() * 0.02);
      const r0 = m * 0.46;
      const r1 = m * (0.24 + rnd() * 0.08);
      const c = shade('#8a6038', (rnd() - 0.5) * 0.15);
      poly(ctx, [[r0, -pw], [r1 + m * 0.03, -pw], [r1 - m * 0.02, -pw * 0.3], [r1 + m * 0.02, pw * 0.2], [r1 - m * 0.04, pw], [r0, pw]], c, '#3a2410', Math.max(0.5, m * 0.01));
      line(ctx, r0 - m * 0.02, 0, r1 + m * 0.04, 0, rgba('#3a2410', 0.4), Math.max(0.5, m * 0.008));
      circle(ctx, r0 - m * 0.04, 0, Math.max(0.5, m * 0.01), '#2a2a2a');
      ctx.restore();
    }
    for (let i = 0; i < 8; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.36 + rnd() * 0.08);
      stone(g, Math.cos(a) * d, Math.sin(a) * d, m * (0.025 + rnd() * 0.02), m * 0.022, '#8d867b', 6, 0.4);
    }
  },
  glyph(g) {
    const { ctx, m, t, rnd } = g;
    glow(ctx, 0, 0, m * 0.5, t, 0.25);
    const lw = Math.max(0.6, m * 0.014);
    const halo = rgba(t, 0.3);
    const ink = shade(t, 0.18);
    const stroke = (draw, k = 1) => {
      draw();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = halo;
      ctx.lineWidth = lw * 3.2 * k;
      ctx.stroke();
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw * k;
      ctx.stroke();
    };
    stroke(() => {
      ctx.beginPath();
      ctx.arc(0, 0, m * 0.42, 0, TAU);
    });
    stroke(() => {
      ctx.beginPath();
      ctx.arc(0, 0, m * 0.31, 0, TAU);
    }, 0.8);
    const k = m * 0.03;
    const shapes = [[[-k, k], [0, -k], [k, k]], [[-k, -k], [k, -k], [0, k], [0, -k]], [[-k * 0.7, -k], [-k * 0.7, k], [k * 0.7, 0], [-k * 0.7, 0]], [[0, -k], [0, k], [k, -k * 0.3]], [[-k, 0], [k, 0], [0, -k], [0, k]]];
    for (let i = 0; i < 10; i += 1) {
      const sh = shapes[Math.floor(rnd() * shapes.length)];
      ctx.save();
      ctx.rotate((i / 10) * TAU);
      ctx.translate(0, -m * 0.365);
      stroke(() => {
        ctx.beginPath();
        sh.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      }, 0.7);
      ctx.restore();
    }
    const T = m * 0.25;
    stroke(() => {
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        const a = -Math.PI / 2 + (i * TAU) / 3;
        if (i) ctx.lineTo(Math.cos(a) * T, Math.sin(a) * T);
        else ctx.moveTo(Math.cos(a) * T, Math.sin(a) * T);
      }
      ctx.closePath();
    });
    stroke(() => {
      ctx.beginPath();
      ctx.moveTo(0, -T * 0.7);
      ctx.lineTo(0, T * 0.45);
      ctx.moveTo(0, -T * 0.1);
      ctx.lineTo(-T * 0.35, -T * 0.42);
      ctx.moveTo(0, -T * 0.1);
      ctx.lineTo(T * 0.35, -T * 0.42);
    });
    stroke(() => {
      ctx.beginPath();
      ctx.arc(0, T * 0.15, T * 0.16, 0, TAU);
    }, 0.7);
  },
  fire_vent(g) {
    const { ctx, m, rnd } = g;
    smoothShape(ctx, blobPoints(0, 0, m * 0.48, m * 0.46, 12, 0.25, rnd), radial(ctx, 0, 0, m * 0.48, 'rgba(18,14,10,0.9)', 'rgba(18,14,10,0)'));
    for (let i = 0; i < 12; i += 1) {
      const a = rnd() * TAU;
      const r = m * (0.38 + rnd() * 0.1);
      line(ctx, Math.cos(a) * m * 0.3, Math.sin(a) * m * 0.3, Math.cos(a) * r, Math.sin(a) * r, 'rgba(15,12,9,0.45)', Math.max(0.6, m * 0.03));
    }
    const R = m * 0.3;
    circle(ctx, 0, 0, R, radial(ctx, 0, 0, R, '#ff9a3a', '#3a1406'));
    const n = 6;
    const pitch = (R * 2) / n;
    for (let i = 0; i <= n; i += 1) {
      const y = -R + i * pitch;
      const half = Math.sqrt(Math.max(0, R * R - y * y));
      line(ctx, -half, y, half, y, '#2a2624', Math.max(1, pitch * 0.55), 'butt');
    }
    line(ctx, 0, -R, 0, R, '#2a2624', Math.max(1, pitch * 0.5), 'butt');
    circle(ctx, 0, 0, R, null, '#3a3532', Math.max(1, m * 0.06));
    circle(ctx, 0, 0, R + m * 0.03, null, '#1a1614', Math.max(0.5, m * 0.012));
  },
  net_trap(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.3, m * 0.28, 3);
    const rope = '#a88a58';
    const ink = '#4a3820';
    for (let i = 0; i < 4; i += 1) {
      const a = Math.PI / 4 + (i * Math.PI) / 2 + (rnd() - 0.5) * 0.3;
      const x = Math.cos(a) * m * 0.44;
      const y = Math.sin(a) * m * 0.44;
      line(ctx, 0, 0, x, y, ink, Math.max(1, m * 0.02));
      line(ctx, 0, 0, x, y, rope, Math.max(0.6, m * 0.012));
      circle(ctx, x, y, m * 0.03, '#5a5e64', '#1f2124', Math.max(0.5, m * 0.008));
    }
    const R = m * 0.27;
    smoothShape(ctx, blobPoints(0, 0, R, R * 0.94, 11, 0.18, rnd), lit(ctx, 0, 0, R, '#5e4a2e', 0.12), ink, Math.max(0.8, m * 0.012));
    const step = R * 0.24;
    for (const dir of [1, -1]) {
      for (let d = -R; d <= R; d += step) {
        const half = Math.sqrt(Math.max(0, R * R * 0.86 - d * d));
        if (half <= 0) continue;
        const cx = (d * dir) / Math.SQRT2;
        const cy = d / Math.SQRT2;
        const ux = 1 / Math.SQRT2;
        const uy = -dir / Math.SQRT2;
        line(ctx, cx - ux * half, cy - uy * half, cx + ux * half, cy + uy * half, rope, Math.max(0.6, m * 0.012));
      }
    }
    circle(ctx, 0, 0, R * 0.16, lit(ctx, 0, 0, R * 0.16, rope, 0.2), ink, Math.max(0.5, m * 0.01));
  },
  caltrops(g) {
    const { ctx, m, rnd } = g;
    const ink = '#1f2124';
    const spots = [];
    for (let tries = 0; spots.length < 9 && tries < 200; tries += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.38;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (spots.every(([px, py]) => Math.hypot(px - x, py - y) > m * 0.17)) spots.push([x, y]);
    }
    for (const [x, y] of spots) {
      const r = m * (0.08 + rnd() * 0.025);
      const rot = rnd() * TAU;
      circle(ctx, x + r * 0.25, y + r * 0.3, r * 0.5, 'rgba(0,0,0,0.25)');
      for (let k = 0; k < 3; k += 1) {
        const a = rot + (k * TAU) / 3;
        const tx = x + Math.cos(a) * r;
        const ty = y + Math.sin(a) * r;
        const px = -Math.sin(a) * r * 0.2;
        const py = Math.cos(a) * r * 0.2;
        poly(ctx, [[x + px, y + py], [tx, ty], [x - px, y - py]], k === 0 ? '#8a8e94' : '#6a6e74', ink, Math.max(0.5, m * 0.012));
      }
      circle(ctx, x, y, r * 0.26, lit(ctx, x, y, r * 0.26, '#9aa0a6', 0.25), ink, Math.max(0.5, m * 0.01));
      circle(ctx, x - r * 0.06, y - r * 0.06, r * 0.08, '#e8ecf0');
    }
  },
  gas_vent(g) {
    const { ctx, m, t, rnd } = g;
    // The grate, low and to the left.
    const gx = -m * 0.14;
    const gy = m * 0.18;
    const s = m * 0.17;
    rect(ctx, gx - s, gy - s, s * 2, s * 2, '#121212');
    rect(ctx, gx - s * 0.8, gy - s * 0.8, s * 1.6, s * 1.6, rgba(t, 0.4));
    for (let i = 1; i < 4; i += 1) line(ctx, gx - s + (s * 2 * i) / 4, gy - s, gx - s + (s * 2 * i) / 4, gy + s, '#55575c', Math.max(0.7, m * 0.035), 'butt');
    rect(ctx, gx - s, gy - s, s * 2, s * 2, null, '#5e6066', Math.max(0.8, m * 0.035));
    // The cloud puffing out of it, drifting up and right: one outline round all the puffs.
    const puffs = [[-0.12, 0.06, 0.14], [0.03, -0.02, 0.17], [0.19, -0.14, 0.15], [-0.07, -0.17, 0.14], [0.09, -0.3, 0.12], [0.27, 0.02, 0.11], [0.3, -0.27, 0.09]];
    const pts = puffs.map(([x, y, r]) => [x * m + (rnd() - 0.5) * m * 0.04, y * m + (rnd() - 0.5) * m * 0.04, r * m * (0.9 + rnd() * 0.2)]);
    const cloud = () => {
      ctx.beginPath();
      for (const [x, y, r] of pts) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
    };
    cloud();
    ctx.strokeStyle = rgba(shade(t, -0.32), 0.85);
    ctx.lineWidth = Math.max(1, m * 0.035);
    ctx.stroke();
    cloud();
    ctx.fillStyle = rgba(shade(t, 0.06), 0.78);
    ctx.fill();
    for (const [x, y, r] of pts) circle(ctx, x - r * 0.25, y - r * 0.3, r * 0.5, rgba(shade(t, 0.32), 0.45));
    for (let i = 0; i < 3; i += 1) {
      const [x, y, r] = pts[1 + i * 2];
      ctx.beginPath();
      ctx.arc(x + r * 0.1, y + r * 0.1, r * 0.45, Math.PI * 0.2, Math.PI * 1.3);
      ctx.strokeStyle = rgba(shade(t, -0.25), 0.6);
      ctx.lineWidth = Math.max(0.5, m * 0.018);
      ctx.stroke();
    }
  },
  // ----- Treasure (new) -----
  hoard(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.47, m * 0.44, 0.9);
    const gold = '#d4a72c';
    const ink = '#7a5a14';
    const lw = Math.max(0.6, m * 0.005);
    // Coins scattered on the floor round the heap.
    for (let i = 0; i < 22; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.4 + rnd() * 0.07);
      coin(g, Math.cos(a) * d, Math.sin(a) * d * 0.95, m * (0.018 + rnd() * 0.008));
    }
    smoothShape(ctx, blobPoints(0, 0, m * 0.44, m * 0.41, 14, 0.16, rnd), radial(ctx, 0, 0, m * 0.46, '#f2d468', '#9a7416', -m * 0.1, -m * 0.14), ink, Math.max(0.8, m * 0.006));
    // Coins heaped up, the outer ones first so the middle sits on top.
    const coins = [];
    for (let i = 0; i < 160; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.41;
      coins.push([Math.cos(a) * d, Math.sin(a) * d * 0.94, d]);
    }
    coins.sort((p, q) => q[2] - p[2]);
    for (const [x, y, d] of coins) {
      const r = m * (0.02 + rnd() * 0.009);
      const k = 1 - d / (m * 0.43);
      circle(ctx, x, y, r, lit(ctx, x, y, r, shade(gold, -0.12 + k * 0.18), 0.2), ink, Math.max(0.5, r * 0.15));
    }
    // A chest half buried.
    const ca = -0.35;
    const ccx = m * 0.17;
    const ccy = -m * 0.17;
    const cw = m * 0.2;
    const ch = m * 0.13;
    ctx.save();
    ctx.translate(ccx, ccy);
    ctx.rotate(ca);
    rect(ctx, -cw, -ch, cw * 2, ch * 2, lit(ctx, 0, 0, cw, '#7a4a22', 0.08), '#3a240f', Math.max(0.6, m * 0.008));
    for (const x of [-cw * 0.6, cw * 0.6]) rect(ctx, x - m * 0.012, -ch, m * 0.024, ch * 2, '#5a5a5a');
    rect(ctx, -cw, -ch * 0.12, cw * 2, ch * 0.24, '#b8902f');
    rect(ctx, -m * 0.02, -ch * 0.3, m * 0.04, ch * 0.5, '#d9b44a', '#8a6a14', lw);
    ctx.restore();
    for (let i = 0; i < 30; i += 1) {
      const lx = (rnd() - 0.5) * 2.3 * cw;
      const ly = ch * (0.15 + rnd() * 1.05);
      coin(g, ccx + lx * Math.cos(ca) - ly * Math.sin(ca), ccy + lx * Math.sin(ca) + ly * Math.cos(ca), m * 0.026);
    }
    // A sword lying across.
    ctx.save();
    ctx.translate(-m * 0.3, m * 0.22);
    ctx.rotate(-0.55);
    poly(ctx, [[0, -m * 0.018], [m * 0.34, -m * 0.018], [m * 0.38, 0], [m * 0.34, m * 0.018], [0, m * 0.018]], radial(ctx, m * 0.15, 0, m * 0.25, '#e4e8ec', '#8a9096'), '#2a2d31', lw);
    line(ctx, m * 0.02, 0, m * 0.32, 0, rgba('#2a2d31', 0.35), lw);
    rect(ctx, -m * 0.012, -m * 0.055, m * 0.024, m * 0.11, '#b8902f', '#6a5214', lw);
    rect(ctx, -m * 0.08, -m * 0.012, m * 0.068, m * 0.024, '#6a2a1a', '#2a1008', lw);
    circle(ctx, -m * 0.09, 0, m * 0.02, '#d4a72c', '#6a5214', lw);
    ctx.restore();
    // A goblet standing, one knocked over.
    {
      const x = -m * 0.2;
      const y = -m * 0.15;
      circle(ctx, x + m * 0.012, y + m * 0.015, m * 0.05, 'rgba(0,0,0,0.3)');
      circle(ctx, x, y, m * 0.047, lit(ctx, x, y, m * 0.047, '#e8c040', 0.2), ink, lw);
      circle(ctx, x, y, m * 0.032, '#5a1420');
    }
    {
      ctx.save();
      ctx.translate(m * 0.26, m * 0.19);
      ctx.rotate(0.6);
      const s = m * 0.05;
      oval(ctx, -s * 1.55, 0, s * 0.2, s * 0.6, 0, '#c89a24', ink, lw);
      rect(ctx, -s * 1.5, -s * 0.11, s * 1.15, s * 0.22, '#d9ac30', ink, lw);
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, 0);
      ctx.quadraticCurveTo(-s * 0.3, -s * 0.8, s * 1.1, -s * 0.72);
      ctx.lineTo(s * 1.1, s * 0.72);
      ctx.quadraticCurveTo(-s * 0.3, s * 0.8, -s * 0.4, 0);
      ctx.closePath();
      ctx.fillStyle = radial(ctx, s * 0.4, -s * 0.3, s * 1.2, '#f6dc7a', '#b88a1e');
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw;
      ctx.stroke();
      oval(ctx, s * 1.1, 0, s * 0.24, s * 0.72, 0, '#6a1a24', ink, lw);
      ctx.restore();
    }
    // A crown.
    {
      const x = m * 0.03;
      const y = m * 0.12;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU;
        poly(ctx, [[x + Math.cos(a - 0.3) * m * 0.06, y + Math.sin(a - 0.3) * m * 0.06], [x + Math.cos(a) * m * 0.1, y + Math.sin(a) * m * 0.1], [x + Math.cos(a + 0.3) * m * 0.06, y + Math.sin(a + 0.3) * m * 0.06]], '#f0c848', ink, lw);
        circle(ctx, x + Math.cos(a) * m * 0.098, y + Math.sin(a) * m * 0.098, m * 0.01, '#fff4d8');
      }
      circle(ctx, x, y, m * 0.062, null, ink, m * 0.03);
      circle(ctx, x, y, m * 0.062, null, '#e2b436', m * 0.022);
      circle(ctx, x, y, m * 0.05, radial(ctx, x, y, m * 0.05, '#c02a34', '#5a0a14', x - m * 0.015, y - m * 0.015));
      for (const [i, c] of [[1, '#2fae5e'], [3, '#3466d8'], [5, '#2fae5e'], [7, '#3466d8']]) {
        const a = (i / 8) * TAU;
        circle(ctx, x + Math.cos(a) * m * 0.062, y + Math.sin(a) * m * 0.062, m * 0.011, c);
      }
    }
    // A string of pearls.
    for (let i = 0; i < 14; i += 1) {
      const a = 0.4 + i * 0.2;
      circle(ctx, -m * 0.05 + Math.cos(a) * m * 0.16, -m * 0.27 + Math.sin(a) * m * 0.09, m * 0.011, '#f4f0e6', '#9a9080', Math.max(0.4, m * 0.002));
    }
    const gemCols = ['#d42f45', '#2fae5e', '#3466d8', '#9b47d1', '#e8f4ff'];
    for (let i = 0; i < 10; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.38;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const s = m * 0.034;
      const c = gemCols[i % gemCols.length];
      poly(ctx, [[x, y - s], [x + s * 0.8, y], [x, y + s], [x - s * 0.8, y]], lit(ctx, x, y, s, c, 0.25), shade(c, -0.4), lw);
    }
    for (let i = 0; i < 7; i += 1) {
      const x = (rnd() - 0.5) * m * 0.7;
      const y = (rnd() - 0.5) * m * 0.65;
      const s = m * 0.032;
      poly(ctx, [[x, y - s], [x + s * 0.22, y - s * 0.22], [x + s, y], [x + s * 0.22, y + s * 0.22], [x, y + s], [x - s * 0.22, y + s * 0.22], [x - s, y], [x - s * 0.22, y - s * 0.22]], rgba('#fffbe8', 0.9));
    }
  },
  gold_bars(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.46, h * 0.44, 0.7);
    const lw = Math.max(0.5, m * 0.02);
    const ingot = (cx, cy, bx, by) => {
      const tx = bx - Math.min(bx, by) * 0.28;
      const ty = by - Math.min(bx, by) * 0.28;
      const o = [[cx - bx, cy - by], [cx + bx, cy - by], [cx + bx, cy + by], [cx - bx, cy + by]];
      const i = [[cx - tx, cy - ty], [cx + tx, cy - ty], [cx + tx, cy + ty], [cx - tx, cy + ty]];
      poly(ctx, [o[0], o[1], i[1], i[0]], '#f2d77a');
      poly(ctx, [o[1], o[2], i[2], i[1]], '#a07a1e');
      poly(ctx, [o[2], o[3], i[3], i[2]], '#86640f');
      poly(ctx, [o[3], o[0], i[0], i[3]], '#deb648');
      poly(ctx, i, lit(ctx, cx, cy, Math.max(tx, ty), '#e8c04c', 0.12));
      poly(ctx, o, null, '#6a5214', lw);
      line(ctx, cx - tx * 0.6, cy + ty * 0.4, cx - tx * 0.1, cy - ty * 0.5, rgba('#ffffff', 0.55), Math.max(0.5, m * 0.025));
    };
    for (const x of [-w * 0.3, 0, w * 0.3]) ingot(x, h * 0.02, w * 0.14, h * 0.42);
    rect(ctx, -w * 0.34, -h * 0.26, w * 0.74, h * 0.6, rgba('#000000', 0.22));
    for (const y of [-h * 0.15, h * 0.17]) ingot(-w * 0.02, y, w * 0.36, h * 0.14);
  },
  gems(g) {
    const { ctx, m, rnd } = g;
    const lw = Math.max(0.5, m * 0.02);
    const cols = ['#d42f45', '#2fae5e', '#3466d8', '#9b47d1', '#f0c02a', '#e9f3ff'];
    const off = Math.floor(rnd() * cols.length);
    const spots = [[-0.2, -0.16], [0.14, -0.2], [0.25, 0.08], [-0.02, 0.06], [-0.24, 0.17], [0.08, 0.27]];
    spots.forEach(([sx, sy], i) => {
      const c = cols[(i + off) % cols.length];
      const x = sx * m;
      const y = sy * m;
      const r = m * (0.1 + rnd() * 0.035);
      const ink = shade(c, -0.42);
      circle(ctx, x + r * 0.2, y + r * 0.25, r * 0.9, 'rgba(0,0,0,0.3)');
      if (i % 3 === 1) {
        const a = r * 0.75;
        const b = r * 0.55;
        const k = r * 0.22;
        poly(ctx, [[x - a + k, y - b], [x + a - k, y - b], [x + a, y - b + k], [x + a, y + b - k], [x + a - k, y + b], [x - a + k, y + b], [x - a, y + b - k], [x - a, y - b + k]], lit(ctx, x, y, r, c, 0.2), ink, lw);
        rect(ctx, x - a * 0.55, y - b * 0.5, a * 1.1, b, shade(c, 0.14), rgba(ink, 0.6), lw * 0.6);
      } else {
        const outer = [];
        const inner = [];
        for (let k = 0; k < 8; k += 1) {
          const a = (k / 8) * TAU + Math.PI / 8;
          outer.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
          inner.push([x + Math.cos(a + Math.PI / 8) * r * 0.55, y + Math.sin(a + Math.PI / 8) * r * 0.55]);
        }
        poly(ctx, outer, lit(ctx, x, y, r, c, 0.2), ink, lw);
        for (let k = 0; k < 8; k += 1) line(ctx, inner[k][0], inner[k][1], outer[k][0], outer[k][1], rgba('#ffffff', 0.3), Math.max(0.4, m * 0.01));
        poly(ctx, inner, shade(c, 0.16), rgba(ink, 0.5), lw * 0.6);
      }
      poly(ctx, [[x - r * 0.5, y - r * 0.3], [x - r * 0.2, y - r * 0.55], [x - r * 0.15, y - r * 0.3]], rgba('#ffffff', 0.7));
    });
    for (let i = 0; i < 3; i += 1) {
      const x = (rnd() - 0.5) * m * 0.7;
      const y = (rnd() - 0.5) * m * 0.7;
      const s = m * 0.07;
      poly(ctx, [[x, y - s], [x + s * 0.2, y - s * 0.2], [x + s, y], [x + s * 0.2, y + s * 0.2], [x, y + s], [x - s * 0.2, y + s * 0.2], [x - s, y], [x - s * 0.2, y - s * 0.2]], rgba('#ffffff', 0.9));
    }
  },
  crown(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.42, m * 0.42, 0.6);
    const lw = Math.max(0.5, m * 0.02);
    const ink = '#6a4a0c';
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      poly(ctx, [[Math.cos(a - 0.2) * m * 0.3, Math.sin(a - 0.2) * m * 0.3], [Math.cos(a) * m * 0.45, Math.sin(a) * m * 0.45], [Math.cos(a + 0.2) * m * 0.3, Math.sin(a + 0.2) * m * 0.3]], lit(ctx, 0, 0, m * 0.45, '#e0b83a', 0.18), ink, lw);
      circle(ctx, Math.cos(a) * m * 0.44, Math.sin(a) * m * 0.44, m * 0.04, '#f4ecd8', ink, lw * 0.6);
    }
    circle(ctx, 0, 0, m * 0.31, null, ink, m * 0.13);
    circle(ctx, 0, 0, m * 0.31, null, '#d9ac30', m * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, m * 0.31, Math.PI * 1.05, Math.PI * 1.55);
    ctx.strokeStyle = rgba('#fff4c0', 0.6);
    ctx.lineWidth = Math.max(0.5, m * 0.03);
    ctx.stroke();
    circle(ctx, 0, 0, m * 0.25, radial(ctx, 0, 0, m * 0.25, '#c02a34', '#5a0a14', -m * 0.07, -m * 0.07));
    line(ctx, -m * 0.25, 0, m * 0.25, 0, '#d9ac30', Math.max(0.6, m * 0.05));
    line(ctx, 0, -m * 0.25, 0, m * 0.25, '#d9ac30', Math.max(0.6, m * 0.05));
    circle(ctx, 0, 0, m * 0.07, lit(ctx, 0, 0, m * 0.07, '#e8c040', 0.2), ink, lw);
    for (const [i, c] of [[1, '#d42f45'], [3, '#3466d8'], [5, '#2fae5e'], [7, '#d42f45']]) {
      const a = (i / 8) * TAU;
      circle(ctx, Math.cos(a) * m * 0.31, Math.sin(a) * m * 0.31, m * 0.045, lit(ctx, Math.cos(a) * m * 0.31, Math.sin(a) * m * 0.31, m * 0.045, c, 0.25), shade(c, -0.4), lw * 0.6);
    }
  },
  chest_open(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.47, h * 0.44, 0.8);
    const ink = '#3a240f';
    const lw = Math.max(0.8, m * 0.05);
    const ly0 = -h * 0.47;
    const ly1 = -h * 0.13;
    rect(ctx, -w * 0.46, ly0, w * 0.92, ly1 - ly0, '#5e3818', ink, lw);
    rect(ctx, -w * 0.38, ly0 + h * 0.05, w * 0.76, ly1 - ly0 - h * 0.08, lit(ctx, 0, (ly0 + ly1) / 2, m * 0.4, '#4a2a10', 0.06));
    for (const x of [-w * 0.3, w * 0.3]) band(ctx, x - m * 0.04, ly0, m * 0.08, ly1 - ly0, '#5a5a5a');
    const by0 = -h * 0.13;
    const by1 = h * 0.38;
    rect(ctx, -w * 0.46, by0, w * 0.92, by1 - by0, lit(ctx, 0, h * 0.1, m * 0.7, '#7a4a22', 0.08), ink, lw);
    const ox = w * 0.36;
    const oy0 = by0 + h * 0.07;
    const oy1 = by1 - h * 0.11;
    rect(ctx, -ox, oy0, ox * 2, oy1 - oy0, radial(ctx, -w * 0.05, (oy0 + oy1) / 2 - h * 0.03, w * 0.4, '#f0cf5a', '#9a7416'), rgba(ink, 0.9), Math.max(0.6, m * 0.025));
    for (let i = 0; i < 24; i += 1) coin(g, (rnd() - 0.5) * ox * 1.8, oy0 + h * 0.035 + rnd() * (oy1 - oy0 - h * 0.07), m * 0.048);
    for (const [gx, gy, c] of [[-0.18, 0.02, '#d42f45'], [0.14, 0.1, '#2fae5e'], [0.02, -0.02, '#3466d8']]) {
      const x = gx * w;
      const y = gy * h;
      const s = m * 0.05;
      poly(ctx, [[x, y - s], [x + s * 0.8, y], [x, y + s], [x - s * 0.8, y]], lit(ctx, x, y, s, c, 0.25), shade(c, -0.4), Math.max(0.5, m * 0.01));
    }
    for (const x of [-w * 0.3, w * 0.3]) {
      band(ctx, x - m * 0.04, oy1, m * 0.08, by1 - oy1, '#5a5a5a');
      band(ctx, x - m * 0.04, by0, m * 0.08, oy0 - by0, '#5a5a5a');
    }
    rect(ctx, -w * 0.06, by1 - h * 0.1, w * 0.12, h * 0.08, '#d9b44a', '#8a6a14', Math.max(0.5, m * 0.02));
    line(ctx, -w * 0.46, by0, w * 0.46, by0, ink, lw);
    coin(g, -w * 0.2, h * 0.44, m * 0.05);
    coin(g, w * 0.12, h * 0.45, m * 0.05);
  },
  mimic(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.47, h * 0.44, 0.8);
    const ink = '#3a240f';
    const lw = Math.max(0.8, m * 0.05);
    const teeth = (x1, y1, x2, y2, n, len, nx, ny) => {
      for (let i = 0; i < n; i += 1) {
        const ax = x1 + ((x2 - x1) * i) / n;
        const ay = y1 + ((y2 - y1) * i) / n;
        const bx = x1 + ((x2 - x1) * (i + 1)) / n;
        const by = y1 + ((y2 - y1) * (i + 1)) / n;
        const L = len * (0.7 + rnd() * 0.6);
        poly(ctx, [[ax, ay], [(ax + bx) / 2 + nx * L, (ay + by) / 2 + ny * L], [bx, by]], '#f2ead2', '#8a7a5a', Math.max(0.4, m * 0.008));
      }
    };
    const ly0 = -h * 0.47;
    const ly1 = -h * 0.13;
    rect(ctx, -w * 0.46, ly0, w * 0.92, ly1 - ly0, '#5e3818', ink, lw);
    const lx = w * 0.38;
    const lt = ly0 + h * 0.05;
    const lb = ly1 - h * 0.03;
    rect(ctx, -lx, lt, lx * 2, lb - lt, radial(ctx, 0, lb, w * 0.4, '#3a0a12', '#8a2a36'));
    teeth(-lx, lt, lx, lt, 9, m * 0.07, 0, 1);
    teeth(-lx, lt, -lx, lb, 3, m * 0.05, 1, 0);
    teeth(lx, lt, lx, lb, 3, m * 0.05, -1, 0);
    for (const x of [-w * 0.42, w * 0.42]) band(ctx, x - m * 0.03, ly0, m * 0.06, ly1 - ly0, '#5a5a5a');
    const by0 = -h * 0.13;
    const by1 = h * 0.36;
    rect(ctx, -w * 0.46, by0, w * 0.92, by1 - by0, lit(ctx, 0, h * 0.1, m * 0.7, '#7a4a22', 0.08), ink, lw);
    const ox = w * 0.36;
    const oy0 = by0 + h * 0.06;
    const oy1 = by1 - h * 0.1;
    rect(ctx, -ox, oy0, ox * 2, oy1 - oy0, radial(ctx, 0, (oy0 + oy1) / 2, w * 0.4, '#1a0408', '#7a1a28'), rgba(ink, 0.9), Math.max(0.6, m * 0.025));
    teeth(-ox, oy0, ox, oy0, 9, m * 0.07, 0, 1);
    teeth(ox, oy1, -ox, oy1, 9, m * 0.07, 0, -1);
    teeth(-ox, oy0, -ox, oy1, 4, m * 0.05, 1, 0);
    teeth(ox, oy0, ox, oy1, 4, m * 0.05, -1, 0);
    for (const x of [-w * 0.42, w * 0.42]) band(ctx, x - m * 0.03, by0, m * 0.06, by1 - by0, '#5a5a5a');
    line(ctx, -w * 0.46, by0, w * 0.46, by0, ink, lw);
    const tongue = [[-w * 0.04, (oy0 + oy1) / 2], [w * 0.02, oy1 + h * 0.02], [w * 0.1, by1 + h * 0.03], [w * 0.28, h * 0.43]];
    polyline(ctx, tongue, '#5a1420', m * 0.17);
    polyline(ctx, tongue, '#c8506a', m * 0.13);
    polyline(ctx, tongue.map(([x, y]) => [x, y]), rgba('#7a2034', 0.6), Math.max(0.5, m * 0.02));
    circle(ctx, w * 0.3, h * 0.44, m * 0.04, rgba('#e8f0f0', 0.5));
  },
  weapon_pile(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.44, m * 0.42, 0.7);
    const ink = '#2a2d31';
    const wood = '#7a5532';
    const lw = Math.max(0.5, m * 0.01);
    const spear = (x1, y1, x2, y2) => {
      line(ctx, x1, y1, x2, y2, '#3e2914', Math.max(1, m * 0.03));
      line(ctx, x1, y1, x2, y2, wood, Math.max(0.6, m * 0.018));
      ctx.save();
      ctx.translate(x2, y2);
      ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
      poly(ctx, [[-m * 0.02, 0], [m * 0.03, -m * 0.035], [m * 0.11, 0], [m * 0.03, m * 0.035]], radial(ctx, m * 0.03, 0, m * 0.08, '#d4d9de', '#7a8086'), ink, lw);
      ctx.restore();
    };
    const sword = (x, y, a, L) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      const bw = m * 0.032;
      poly(ctx, [[0, -bw], [L * 0.86, -bw], [L, 0], [L * 0.86, bw], [0, bw]], radial(ctx, L * 0.4, -bw, L * 0.6, '#e4e8ec', '#7a8086'), ink, lw);
      line(ctx, L * 0.05, 0, L * 0.8, 0, rgba(ink, 0.35), lw);
      rect(ctx, -m * 0.018, -m * 0.08, m * 0.036, m * 0.16, '#b8902f', '#6a5214', lw);
      rect(ctx, -m * 0.11, -m * 0.018, m * 0.09, m * 0.036, '#5a3a1e', ink, lw);
      circle(ctx, -m * 0.125, 0, m * 0.028, '#d4a72c', '#6a5214', lw);
      ctx.restore();
    };
    const axe = (x, y, a, L) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      line(ctx, 0, 0, L, 0, '#3e2914', Math.max(1, m * 0.04));
      line(ctx, 0, 0, L, 0, wood, Math.max(0.6, m * 0.026));
      poly(ctx, [[L * 0.8, -m * 0.02], [L * 0.76, -m * 0.06], [L * 0.7, -m * 0.14], [L * 0.88, -m * 0.15], [L * 1.0, -m * 0.12], [L * 0.95, -m * 0.05], [L * 0.92, -m * 0.02]], radial(ctx, L * 0.85, -m * 0.08, m * 0.1, '#d4d9de', '#6a7076'), ink, lw);
      ctx.restore();
    };
    spear(-m * 0.42, m * 0.22, m * 0.32, -m * 0.3);
    spear(-m * 0.3, -m * 0.38, m * 0.38, m * 0.18);
    axe(m * 0.3, m * 0.3, -2.3, m * 0.36);
    sword(-m * 0.28, m * 0.3, -0.75, m * 0.42);
    sword(m * 0.3, -m * 0.06, 2.75, m * 0.4);
    const sx = -m * 0.1;
    const sy = -m * 0.1;
    const r = m * 0.17;
    circle(ctx, sx + r * 0.08, sy + r * 0.1, r, 'rgba(0,0,0,0.3)');
    circle(ctx, sx, sy, r, lit(ctx, sx, sy, r, '#8a5d33', 0.12), '#3e2914', Math.max(0.8, m * 0.012));
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, r, -Math.PI / 2, 0);
    ctx.closePath();
    ctx.fillStyle = '#9a2a2a';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, r, Math.PI / 2, Math.PI);
    ctx.closePath();
    ctx.fill();
    circle(ctx, sx, sy, r, null, '#5a5e64', Math.max(1, m * 0.025));
    circle(ctx, sx, sy, r * 0.28, lit(ctx, sx, sy, r * 0.28, '#9aa0a8', 0.25), ink, lw);
  },
  urn(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.42, m * 0.42, 1);
    const clay = '#b8643a';
    const ink = shade(clay, -0.38);
    const paint = '#2a1a12';
    const lw = Math.max(0.6, m * 0.02);
    for (const s of [-1, 1]) {
      oval(ctx, s * m * 0.37, 0, m * 0.09, m * 0.13, 0, null, ink, Math.max(1.2, m * 0.075));
      oval(ctx, s * m * 0.37, 0, m * 0.09, m * 0.13, 0, null, s < 0 ? shade(clay, 0.06) : shade(clay, -0.1), Math.max(0.7, m * 0.045));
    }
    circle(ctx, 0, 0, m * 0.37, lit(ctx, 0, 0, m * 0.37, clay, 0.18), ink, lw);
    circle(ctx, 0, 0, m * 0.33, null, paint, Math.max(0.6, m * 0.03));
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * TAU;
      line(ctx, Math.cos(a) * m * 0.27, Math.sin(a) * m * 0.27, Math.cos(a + 0.12) * m * 0.31, Math.sin(a + 0.12) * m * 0.31, paint, Math.max(0.5, m * 0.022));
    }
    circle(ctx, 0, 0, m * 0.27, null, paint, Math.max(0.6, m * 0.025));
    circle(ctx, 0, 0, m * 0.21, lit(ctx, 0, 0, m * 0.21, shade(clay, 0.05), 0.16), ink, lw * 0.8);
    circle(ctx, 0, 0, m * 0.18, null, rgba('#e8d2a8', 0.8), Math.max(0.5, m * 0.015));
    circle(ctx, 0, 0, m * 0.15, lit(ctx, 0, 0, m * 0.15, shade(clay, 0.1), 0.15), ink, lw * 0.8);
    circle(ctx, 0, 0, m * 0.1, radial(ctx, 0, m * 0.02, m * 0.1, '#0e0806', '#3a2014'));
  },
  amphorae(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.44, m * 0.42, 1.3);
    const lw = Math.max(0.6, m * 0.016);
    const standing = (x, y, r, c) => {
      const ink = shade(c, -0.38);
      circle(ctx, x, y, r, lit(ctx, x, y, r, c, 0.2), ink, lw);
      circle(ctx, x, y, r * 0.8, null, rgba('#2a1a12', 0.55), Math.max(0.5, r * 0.06));
      for (const s of [-1, 1]) {
        oval(ctx, x + s * r * 0.55, y, r * 0.19, r * 0.26, 0, null, ink, Math.max(1.2, r * 0.22));
        oval(ctx, x + s * r * 0.55, y, r * 0.19, r * 0.26, 0, null, shade(c, s < 0 ? 0.1 : -0.04), Math.max(0.7, r * 0.12));
      }
      circle(ctx, x, y, r * 0.4, lit(ctx, x, y, r * 0.4, shade(c, 0.06), 0.15), ink, lw * 0.8);
      circle(ctx, x, y, r * 0.3, null, ink, lw);
      circle(ctx, x, y, r * 0.24, radial(ctx, x, y + r * 0.04, r * 0.24, '#0e0806', '#3a2014'));
    };
    const lying = (x, y, L, D, a, c) => {
      const ink = shade(c, -0.38);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-L * 0.5, 0);
      ctx.quadraticCurveTo(-L * 0.42, -D * 0.3, -L * 0.2, -D * 0.46);
      ctx.quadraticCurveTo(L * 0.05, -D * 0.56, L * 0.18, -D * 0.4);
      ctx.quadraticCurveTo(L * 0.26, -D * 0.2, L * 0.32, -D * 0.15);
      ctx.lineTo(L * 0.46, -D * 0.15);
      ctx.lineTo(L * 0.48, -D * 0.2);
      ctx.lineTo(L * 0.5, -D * 0.2);
      ctx.lineTo(L * 0.5, D * 0.2);
      ctx.lineTo(L * 0.48, D * 0.2);
      ctx.lineTo(L * 0.46, D * 0.15);
      ctx.lineTo(L * 0.32, D * 0.15);
      ctx.quadraticCurveTo(L * 0.26, D * 0.2, L * 0.18, D * 0.4);
      ctx.quadraticCurveTo(L * 0.05, D * 0.56, -L * 0.2, D * 0.46);
      ctx.quadraticCurveTo(-L * 0.42, D * 0.3, -L * 0.5, 0);
      ctx.closePath();
      const gr = ctx.createLinearGradient(0, -D * 0.5, 0, D * 0.5);
      gr.addColorStop(0, shade(c, 0.16));
      gr.addColorStop(0.45, c);
      gr.addColorStop(1, shade(c, -0.18));
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw;
      ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(L * 0.38, s * D * 0.15);
        ctx.quadraticCurveTo(L * 0.38, s * D * 0.5, L * 0.16, s * D * 0.42);
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1.2, D * 0.12);
        ctx.stroke();
        ctx.strokeStyle = shade(c, s < 0 ? 0.08 : -0.08);
        ctx.lineWidth = Math.max(0.7, D * 0.07);
        ctx.stroke();
      }
      line(ctx, -L * 0.05, -D * 0.5, -L * 0.05, D * 0.5, rgba('#2a1a12', 0.7), Math.max(0.6, D * 0.06), 'butt');
      oval(ctx, L * 0.5, 0, D * 0.05, D * 0.19, 0, '#1a0e08');
      ctx.restore();
    };
    standing(-m * 0.2, -m * 0.17, m * 0.2, '#b5653a');
    standing(m * 0.21, -m * 0.12, m * 0.19, '#a8592f');
    lying(m * 0.02, m * 0.25, m * 0.8, m * 0.3, -0.12, '#c07040');
  },
};
