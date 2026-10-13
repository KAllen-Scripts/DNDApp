/**
 * Built-in assets of the map creator: nature, rocks and camps (map-design.js ASSETS), drawn
 * in code like the rest (map-art-assets.js, which merges these in).
 */
import { TAU, shade, mix, rgba, circle, oval, rect, rrect, poly, line, polyline, blobPoints, smoothShape, radial, glow } from './map-paint.js';
import { shadow, lit, canopy, stone, band, wheel } from './map-art-pieces.js';

export const ART_OUTDOORS = {
  // ----- Nature -----
  blossom_tree(g) {
    const { ctx, m, rnd, t } = g;
    shadow(g, 'round', m * 0.44, m * 0.44, 2.2);
    // Petals fallen on the ground round the crown.
    for (let i = 0; i < 40; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.4 + rnd() * 0.09);
      oval(ctx, Math.cos(a) * d, Math.sin(a) * d, m * 0.02, m * 0.012, rnd() * TAU, i % 4 ? shade(t, (rnd() - 0.3) * 0.16) : '#fbeef2');
    }
    canopy(g, m * 0.41, 10, t, { spots: 2.5 });
    // Clusters of blossom: five petals round a pale middle, lighter on the lit side.
    for (let i = 0; i < 20; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.38;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const r = m * (0.02 + rnd() * 0.012);
      const c = shade(t, x + y < 0 ? 0.14 : 0.04);
      for (let k = 0; k < 5; k += 1) circle(ctx, x + Math.cos((k / 5) * TAU) * r, y + Math.sin((k / 5) * TAU) * r, r * 0.8, c);
      circle(ctx, x, y, r * 0.5, '#fff6ee');
    }
    // A few petals drifting down over the edge.
    for (let i = 0; i < 8; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.34 + rnd() * 0.12);
      oval(ctx, Math.cos(a) * d, Math.sin(a) * d, m * 0.02, m * 0.012, rnd() * TAU, shade(t, 0.1));
    }
  },
  jungle_tree(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.46, m * 0.46, 3);
    const base = '#2f5f2a';
    const leaf = (x, y, a, len, wd, c) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(len * 0.25, -wd, len * 0.75, -wd, len, 0);
      ctx.bezierCurveTo(len * 0.75, wd, len * 0.25, wd, 0, 0);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = shade(c, -0.2);
      ctx.lineWidth = Math.max(0.5, m * 0.005);
      ctx.stroke();
      line(ctx, len * 0.04, 0, len * 0.9, 0, shade(c, 0.14), Math.max(0.5, m * 0.007));
      ctx.restore();
    };
    // Broad leaves fanning out round the crown's edge.
    for (let i = 0; i < 20; i += 1) {
      const a = (i / 20) * TAU + rnd() * 0.25;
      const d = m * (0.26 + rnd() * 0.04);
      leaf(Math.cos(a) * d, Math.sin(a) * d, a + (rnd() - 0.5) * 0.6, m * (0.16 + rnd() * 0.04), m * (0.055 + rnd() * 0.015), shade(base, (rnd() - 0.4) * 0.12));
    }
    canopy(g, m * 0.34, 12, base, { spots: 1.5 });
    // Big leaves on top.
    for (let i = 0; i < 14; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.26;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      leaf(x, y, a + (rnd() - 0.5) * 1.2, m * (0.1 + rnd() * 0.06), m * (0.035 + rnd() * 0.015), shade(base, (x + y < 0 ? 0.1 : -0.02) + (rnd() - 0.5) * 0.08));
    }
    // Lianas looping from branch to branch over the edge, a flower here and there.
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + rnd() * 0.6;
      const span = 0.5 + rnd() * 0.4;
      const r0 = m * 0.28;
      const rc = m * (0.52 + rnd() * 0.04);
      const p0 = [Math.cos(a) * r0, Math.sin(a) * r0];
      const p2 = [Math.cos(a + span) * r0, Math.sin(a + span) * r0];
      const pc = [Math.cos(a + span / 2) * rc, Math.sin(a + span / 2) * rc];
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.quadraticCurveTo(pc[0], pc[1], p2[0], p2[1]);
      ctx.strokeStyle = '#5e5a2a';
      ctx.lineWidth = Math.max(0.6, m * 0.01);
      ctx.lineCap = 'round';
      ctx.stroke();
      for (let k = 1; k < 7; k += 1) {
        const s = k / 7;
        const x = (1 - s) * (1 - s) * p0[0] + 2 * (1 - s) * s * pc[0] + s * s * p2[0];
        const y = (1 - s) * (1 - s) * p0[1] + 2 * (1 - s) * s * pc[1] + s * s * p2[1];
        oval(ctx, x, y, m * 0.014, m * 0.008, rnd() * TAU, '#5a9440');
        if (k === 3 && i % 2 === 0) {
          for (let p = 0; p < 5; p += 1) circle(ctx, x + Math.cos((p / 5) * TAU) * m * 0.012, y + Math.sin((p / 5) * TAU) * m * 0.012, m * 0.01, '#e8603a');
          circle(ctx, x, y, m * 0.006, '#f2d14a');
        }
      }
    }
  },
  snowy_pine(g) {
    const { ctx, m } = g;
    shadow(g, 'round', g.w * 0.44, g.h * 0.44, 2.4);
    const base = '#2c5a3e';
    const cover = [[0.86, 0.5], [0.84, 0.52], [0.86, 0.56], [0.9, 0.6]];
    for (let i = 0; i < 4; i += 1) {
      const r = m * (0.5 - i * 0.11);
      const star = (kOut, kIn, d) => {
        const pts = [];
        for (let k = 0; k < 18; k += 1) {
          const a = (k / 18) * TAU + i * 0.17;
          const rr = k % 2 ? r * kIn : r * kOut;
          pts.push([Math.cos(a) * rr - d, Math.sin(a) * rr - d]);
        }
        return pts;
      };
      poly(ctx, star(1, 0.7, 0), lit(ctx, 0, 0, r, shade(base, i * 0.04), 0.1), rgba(shade(base, -0.25), 0.6), Math.max(0.5, m * 0.012));
      // Soft snow lying along the top of each layer's branches, nearer the light.
      smoothShape(ctx, star(cover[i][0], cover[i][1], m * 0.015), radial(ctx, 0, 0, r, '#ffffff', '#b4c6d6', -r * 0.45, -r * 0.45));
    }
    circle(ctx, -m * 0.015, -m * 0.015, m * 0.05, '#ffffff');
  },
  bamboo(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.4, m * 0.4, 2);
    const leaf = (x, y, a, len, wd, c) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.4, -wd, len, 0);
      ctx.quadraticCurveTo(len * 0.4, wd, 0, 0);
      ctx.fillStyle = c;
      ctx.fill();
      line(ctx, len * 0.05, 0, len * 0.85, 0, shade(c, -0.12), Math.max(0.5, m * 0.006));
      ctx.restore();
    };
    // Sprays of narrow leaves drooping out of the clump.
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU + rnd() * 0.3;
      const d = m * (0.14 + rnd() * 0.08);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      for (let k = 0; k < 3; k += 1) leaf(x, y, a + (k - 1) * 0.4 + (rnd() - 0.5) * 0.2, m * (0.17 + rnd() * 0.1), m * 0.028, shade('#4f8a32', (rnd() - 0.5) * 0.2));
    }
    // The canes, cut across: green rings with a pale node ring and a dark hollow.
    const canes = [];
    for (let i = 0; i < 80 && canes.length < 9; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.22;
      const r = m * (0.07 + rnd() * 0.03);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (canes.every(([cx, cy, cr]) => Math.hypot(cx - x, cy - y) > cr + r + m * 0.006)) canes.push([x, y, r]);
    }
    for (const [x, y, r] of canes) circle(ctx, x + r * 0.35, y + r * 0.45, r, 'rgba(0,0,0,0.3)');
    for (const [x, y, r] of canes) {
      circle(ctx, x, y, r, lit(ctx, x, y, r, '#8fb04c', 0.16), '#34501a', Math.max(0.6, m * 0.018));
      circle(ctx, x, y, r * 0.72, null, rgba('#e4ecb0', 0.6), Math.max(0.5, m * 0.012));
      circle(ctx, x, y, r * 0.4, radial(ctx, x, y, r * 0.4, '#1e2a0c', '#3e5418'));
    }
  },
  hedge(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.49, h * 0.42, 1.2);
    const base = '#3d6b2e';
    const x0 = -w * 0.49;
    const y0 = -h * 0.42;
    const bw = w * 0.98;
    const bh = h * 0.84;
    const r = Math.min(w, h) * 0.3;
    rrect(ctx, x0, y0, bw, bh, r, shade(base, -0.12));
    ctx.save();
    rrect(ctx, x0, y0, bw, bh, r, null);
    ctx.clip();
    // Clumps of leaves, lit from the top left.
    const n = Math.round((w * h) / (m * m) * 30);
    for (let i = 0; i < n; i += 1) {
      const x = x0 + rnd() * bw;
      const y = y0 + rnd() * bh;
      const rr = m * (0.08 + rnd() * 0.06);
      circle(ctx, x, y, rr, lit(ctx, x, y, rr, shade(base, (rnd() - 0.5) * 0.1), 0.14));
    }
    // The clipped flat top catches the light; the sides away from it are darker.
    rrect(ctx, x0, y0, bw, bh * 0.45, r, rgba('#e6f2b0', 0.12));
    rect(ctx, x0, y0 + bh * 0.78, bw, bh * 0.22, 'rgba(0,0,0,0.18)');
    for (let i = 0; i < n * 1.5; i += 1) {
      const x = x0 + rnd() * bw;
      const y = y0 + rnd() * bh;
      circle(ctx, x, y, m * (0.012 + rnd() * 0.014), rgba(x + y < 0 ? shade(base, 0.25) : shade(base, -0.25), 0.55));
    }
    ctx.restore();
    rrect(ctx, x0, y0, bw, bh, r, null, shade(base, -0.34), Math.max(0.8, m * 0.03));
  },
  thorns(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.4, m * 0.38, 0.7);
    smoothShape(ctx, blobPoints(0, 0, m * 0.44, m * 0.4, 9, 0.3, rnd), rgba('#22180f', 0.35));
    // Canes arching out from the root in every direction, a few straggling across.
    const stems = [];
    for (let i = 0; i < 13; i += 1) {
      const a = (i / 13) * TAU + rnd() * 0.4;
      const bend = (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5);
      const r0 = m * rnd() * 0.1;
      const r2 = m * (0.36 + rnd() * 0.08);
      stems.push([[Math.cos(a + 2) * r0, Math.sin(a + 2) * r0], [Math.cos(a + bend * 0.5) * r2 * 0.7, Math.sin(a + bend * 0.5) * r2 * 0.7], [Math.cos(a) * r2, Math.sin(a) * r2]]);
    }
    for (let i = 0; i < 3; i += 1) {
      const a0 = rnd() * TAU;
      const a1 = a0 + Math.PI + (rnd() - 0.5) * 1.4;
      stems.push([[Math.cos(a0) * m * 0.4, Math.sin(a0) * m * 0.36], [(rnd() - 0.5) * m * 0.4, (rnd() - 0.5) * m * 0.4], [Math.cos(a1) * m * 0.4, Math.sin(a1) * m * 0.36]]);
    }
    const at = ([p0, p1, p2], s) => [(1 - s) * (1 - s) * p0[0] + 2 * (1 - s) * s * p1[0] + s * s * p2[0], (1 - s) * (1 - s) * p0[1] + 2 * (1 - s) * s * p1[1] + s * s * p2[1]];
    const curve = ([p0, p1, p2], c, wd) => {
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(0.6, wd);
      ctx.lineCap = 'round';
      ctx.stroke();
    };
    for (const s of stems) {
      curve(s, '#140c0c', m * 0.05);
      curve(s, '#5e3238', m * 0.028);
      // Thorns along the cane, pointing back.
      for (let k = 1; k < 10; k += 1) {
        const [x, y] = at(s, k / 10);
        const [x2, y2] = at(s, k / 10 + 0.02);
        const dir = Math.atan2(y2 - y, x2 - x);
        const side = k % 2 ? 1 : -1;
        const tip = dir + Math.PI + side * 2.2;
        const b = m * 0.014;
        poly(ctx, [[x + Math.cos(dir) * b, y + Math.sin(dir) * b], [x + Math.cos(tip) * m * 0.055, y + Math.sin(tip) * m * 0.055], [x - Math.cos(dir) * b, y - Math.sin(dir) * b]], '#d0b48e');
      }
    }
    // Sparse leaves and a few red hips.
    for (let i = 0; i < 9; i += 1) {
      const [x, y] = at(stems[i % stems.length], 0.3 + rnd() * 0.5);
      oval(ctx, x, y, m * 0.045, m * 0.024, rnd() * TAU, shade('#46602c', (rnd() - 0.5) * 0.15), '#22321a', Math.max(0.5, m * 0.006));
    }
    for (let i = 0; i < 4; i += 1) {
      const [x, y] = at(stems[(i * 3 + 1) % stems.length], 0.6 + rnd() * 0.3);
      circle(ctx, x, y, m * 0.022, lit(ctx, x, y, m * 0.022, '#b8322a', 0.2), '#4a1410', Math.max(0.5, m * 0.006));
    }
  },
  roots(g) {
    const { ctx, w, h, m, rnd } = g;
    const segs = [];
    const lim = (v, r) => Math.max(-r, Math.min(r, v));
    // Each root snakes towards a point across the ground, tapering, now and then sending off a thinner one.
    const grow = (sx, sy, sa, swd, tx, ty, steps, depth) => {
      let x = sx;
      let y = sy;
      let a = sa;
      let wd = swd;
      const ph = rnd() * TAU;
      const step = m * 0.055;
      for (let i = 0; i < steps && wd > m * 0.01; i += 1) {
        let da = Math.atan2(ty - y, tx - x) - a;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        a += da * 0.22 + Math.sin(ph + i * 0.9) * 0.28;
        const nx = lim(x + Math.cos(a) * step, w * 0.46);
        const ny = lim(y + Math.sin(a) * step, h * 0.46);
        // Now and then it dips under the soil for a stretch.
        segs.push([x, y, nx, ny, wd, i > 2 && rnd() < 0.1]);
        if (depth > 0 && i > 2 && rnd() < 0.2) {
          const b = a + (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 0.4);
          grow(nx, ny, b, wd * 0.55, lim(nx + Math.cos(b) * m * 0.3, w * 0.44), lim(ny + Math.sin(b) * m * 0.3, h * 0.44), 6, depth - 1);
        }
        x = nx;
        y = ny;
        wd *= 0.89;
        if (Math.hypot(tx - x, ty - y) < step) break;
      }
    };
    // They spread from a trunk just off the top edge.
    const k = Math.max(3, Math.round((w / h) * 5));
    for (let i = 0; i < k; i += 1) {
      const f = i / (k - 1) - 0.5;
      const x = f * w * 0.6 + (rnd() - 0.5) * w * 0.04;
      grow(x, -h * 0.46, Math.atan2(h * 0.6, x), m * (0.08 + rnd() * 0.025), lim(f * w * 0.88 + (rnd() - 0.5) * w * 0.08, w * 0.44), h * (0.18 + rnd() * 0.24), 18, 2);
    }
    const up = segs.filter((s) => !s[5]);
    for (const [x1, y1, x2, y2, wd] of segs.filter((s) => s[5])) line(ctx, x1, y1, x2, y2, rgba('#3a2a1a', 0.45), wd * 1.3);
    for (const [x1, y1, x2, y2, wd] of up) line(ctx, x1 + m * 0.012, y1 + m * 0.016, x2 + m * 0.012, y2 + m * 0.016, 'rgba(0,0,0,0.3)', wd * 1.1);
    for (const [x1, y1, x2, y2, wd] of up) line(ctx, x1, y1, x2, y2, '#3a2716', wd * 1.15 + m * 0.01);
    for (const [x1, y1, x2, y2, wd] of up) line(ctx, x1, y1, x2, y2, '#6e4c2c', wd);
    for (const [x1, y1, x2, y2, wd] of up) line(ctx, x1 - wd * 0.2, y1 - wd * 0.2, x2 - wd * 0.2, y2 - wd * 0.2, rgba('#a07a4e', 0.8), wd * 0.3);
    for (const [x1, y1, , , wd] of up) if (wd > m * 0.06 && rnd() < 0.3) circle(ctx, x1, y1, wd * 0.28, '#4a3220');
    // Earth heaved up along the top edge where they come out of the ground.
    const soil = [[-w * 0.46, -h * 0.5]];
    for (let i = 0; i <= 8; i += 1) soil.push([-w * 0.46 + (w * 0.92 * i) / 8, -h * (0.42 + rnd() * 0.04)]);
    soil.push([w * 0.46, -h * 0.5]);
    smoothShape(ctx, soil, rgba('#4a3826', 0.9));
    for (let i = 0; i < 12; i += 1) circle(ctx, -w * 0.42 + rnd() * w * 0.84, -h * (0.45 + rnd() * 0.03), m * (0.008 + rnd() * 0.01), rgba(rnd() < 0.5 ? '#7a6248' : '#2a1e12', 0.8));
  },
  hollow_log(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.46, h * 0.3, 0.8);
    const r = h * 0.3;
    const x0 = -w * 0.46;
    const x1 = w * 0.4;
    // A broken branch sticking up off the trunk.
    line(ctx, -w * 0.12, -r * 0.4, -w * 0.05, -h * 0.45, '#2e1f10', m * 0.12);
    line(ctx, -w * 0.12, -r * 0.4, -w * 0.05, -h * 0.45, '#6e4c2c', m * 0.08);
    poly(ctx, [[-w * 0.05 - m * 0.04, -h * 0.45 + m * 0.01], [-w * 0.05 - m * 0.01, -h * 0.49], [-w * 0.05 + m * 0.01, -h * 0.45], [-w * 0.05 + m * 0.035, -h * 0.47], [-w * 0.05 + m * 0.03, -h * 0.43]], '#c8a070');
    // The trunk, rounder at the top (lit) than the bottom.
    const grad = ctx.createLinearGradient(0, -r, 0, r);
    grad.addColorStop(0, '#8a6440');
    grad.addColorStop(0.45, '#6e4c2c');
    grad.addColorStop(1, '#3e2a18');
    rrect(ctx, x0, -r, x1 - x0, r * 2, r * 0.35, grad, '#2e1f10', Math.max(0.8, m * 0.04));
    // Splintered left end.
    for (let i = 0; i < 4; i += 1) {
      const y = -r * 0.7 + (r * 1.4 * i) / 3;
      poly(ctx, [[x0 + m * 0.02, y - r * 0.18], [x0 - m * 0.03 - rnd() * m * 0.04, y], [x0 + m * 0.02, y + r * 0.18]], '#b08a5a', '#5a3d22', Math.max(0.5, m * 0.012));
    }
    for (let i = 0; i < 9; i += 1) {
      const y = (rnd() - 0.5) * r * 1.5;
      const xa = x0 + rnd() * (x1 - x0) * 0.6;
      line(ctx, xa, y, xa + (x1 - x0) * (0.15 + rnd() * 0.3), y + (rnd() - 0.5) * r * 0.1, rgba('#2e1f10', 0.6), Math.max(0.5, m * 0.025));
    }
    // Moss on the top.
    for (let i = 0; i < 6; i += 1) {
      const x = x0 + (x1 - x0) * (0.1 + rnd() * 0.75);
      const y = -r * (0.25 + rnd() * 0.4);
      smoothShape(ctx, blobPoints(x, y, m * (0.1 + rnd() * 0.08), m * 0.07, 7, 0.5, rnd), shade('#6a8a32', (rnd() - 0.5) * 0.15));
      circle(ctx, x - m * 0.03, y - m * 0.02, m * 0.025, rgba('#b8d070', 0.6));
    }
    // The hollow end: a ring of pale wood round a dark hole.
    oval(ctx, x1, 0, r * 0.42, r, 0, '#3e2a18');
    oval(ctx, x1, 0, r * 0.36, r * 0.9, 0, '#a8845a');
    oval(ctx, x1 + r * 0.04, 0, r * 0.26, r * 0.7, 0, radial(ctx, x1, 0, r * 0.7, '#0a0806', '#2a1c12'));
  },
  seaweed(g) {
    const { ctx, m, rnd } = g;
    smoothShape(ctx, blobPoints(0, 0, m * 0.44, m * 0.38, 10, 0.35, rnd), rgba('#1c2418', 0.32));
    const cols = ['#4e5c22', '#5e5626', '#3a5430', '#6a5a28', '#44602c'];
    const fronds = [];
    for (let i = 0; i < 8; i += 1) {
      const a = rnd() * TAU;
      const len = m * (0.5 + rnd() * 0.22);
      const cx = (rnd() - 0.5) * m * 0.16;
      const cy = (rnd() - 0.5) * m * 0.16;
      const ph = rnd() * TAU;
      const amp = m * (0.03 + rnd() * 0.03);
      const waves = 1.5 + rnd();
      const pts = [];
      for (let k = 0; k <= 12; k += 1) {
        const s = k / 12 - 0.5;
        const wv = Math.sin(s * TAU * waves + ph) * amp;
        pts.push([cx + Math.cos(a) * len * s - Math.sin(a) * wv, cy + Math.sin(a) * len * s + Math.cos(a) * wv]);
      }
      fronds.push({ pts, c: cols[i % cols.length], wd: m * (0.05 + rnd() * 0.03) });
    }
    for (const f of fronds) {
      const last = f.pts.length - 1;
      const width = (k) => f.wd * (0.3 + Math.sin((k / last) * Math.PI) * 0.7);
      for (let k = 0; k < last; k += 1) line(ctx, f.pts[k][0], f.pts[k][1], f.pts[k + 1][0], f.pts[k + 1][1], shade(f.c, -0.2), width(k + 0.5) + m * 0.016);
      for (let k = 0; k < last; k += 1) line(ctx, f.pts[k][0], f.pts[k][1], f.pts[k + 1][0], f.pts[k + 1][1], f.c, width(k + 0.5));
      polyline(ctx, f.pts.slice(3, 9).map(([x, y]) => [x - m * 0.01, y - m * 0.01]), rgba('#f0f4d0', 0.35), Math.max(0.5, m * 0.01));
    }
    // Air bladders.
    for (let i = 0; i < 10; i += 1) {
      const f = fronds[i % fronds.length];
      const [x, y] = f.pts[2 + Math.floor(rnd() * 9)];
      circle(ctx, x, y, m * 0.022, lit(ctx, x, y, m * 0.022, '#7a7430', 0.2), '#3a3a14', Math.max(0.5, m * 0.006));
    }
  },
  coral(g) {
    const { ctx, m, rnd, t } = g;
    shadow(g, 'round', m * 0.42, m * 0.4, 0.8);
    // Brain coral: a dome with winding grooves.
    const bx = m * 0.17;
    const by = m * 0.15;
    const br = m * 0.23;
    circle(ctx, bx, by, br, lit(ctx, bx, by, br, '#d6b47a', 0.16), '#8a6a3a', Math.max(0.6, m * 0.02));
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, br * 0.94, 0, TAU);
    ctx.clip();
    for (let k = -4; k <= 4; k += 1) {
      const pts = [];
      const ph = rnd() * TAU;
      for (let i = 0; i <= 16; i += 1) pts.push([bx - br + (2 * br * i) / 16, by + k * br * 0.25 + Math.sin(i * 0.9 + ph) * br * 0.1 + Math.sin(i * 2.1 + k) * br * 0.04]);
      polyline(ctx, pts, rgba('#6e4e26', 0.8), Math.max(0.5, m * 0.014));
    }
    ctx.restore();
    // Branching coral in the tint.
    const segs = [];
    const branch = (x, y, a, len, wd, depth) => {
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      segs.push([x, y, x2, y2, wd, depth]);
      if (depth <= 0) return;
      branch(x2, y2, a - 0.45 - rnd() * 0.3, len * 0.72, wd * 0.8, depth - 1);
      branch(x2, y2, a + 0.45 + rnd() * 0.3, len * 0.72, wd * 0.8, depth - 1);
    };
    const cx = -m * 0.12;
    const cy = -m * 0.1;
    for (let i = 0; i < 5; i += 1) branch(cx, cy, (i / 5) * TAU + rnd() * 0.5, m * 0.12, m * 0.06, 2);
    for (const [x1, y1, x2, y2, wd] of segs) line(ctx, x1, y1, x2, y2, shade(t, -0.3), wd + m * 0.025);
    for (const [x1, y1, x2, y2, wd] of segs) line(ctx, x1, y1, x2, y2, t, wd);
    for (const [, , x2, y2, wd, d] of segs) if (d === 0) circle(ctx, x2, y2, wd * 0.75, shade(t, 0.16));
    for (const [x1, y1, x2, y2, wd] of segs) line(ctx, x1 - wd * 0.15, y1 - wd * 0.15, x2 - wd * 0.15, y2 - wd * 0.15, rgba('#ffffff', 0.25), wd * 0.3);
    circle(ctx, cx, cy, m * 0.05, shade(t, -0.1));
  },
  shells(g) {
    const { ctx, m, rnd } = g;
    const lw = Math.max(0.5, m * 0.02);
    const scallop = (x, y, r, a, c) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      oval(ctx, r * 0.1, r * 0.12, r * 0.95, r * 0.85, 0, 'rgba(0,0,0,0.22)');
      rect(ctx, -r * 0.34, r * 0.4, r * 0.68, r * 0.22, shade(c, -0.08), shade(c, -0.35), lw * 0.6);
      ctx.beginPath();
      ctx.moveTo(0, r * 0.5);
      ctx.arc(0, r * 0.5, r * 1.15, -Math.PI / 2 - 0.85, -Math.PI / 2 + 0.85);
      ctx.closePath();
      ctx.fillStyle = lit(ctx, 0, -r * 0.1, r, c, 0.14);
      ctx.fill();
      ctx.strokeStyle = shade(c, -0.35);
      ctx.lineWidth = lw;
      ctx.stroke();
      for (let k = -3; k <= 3; k += 1) {
        const aa = -Math.PI / 2 + k * 0.22;
        line(ctx, 0, r * 0.5, Math.cos(aa) * r * 1.1, r * 0.5 + Math.sin(aa) * r * 1.1, rgba(shade(c, -0.3), 0.7), Math.max(0.5, m * 0.012));
      }
      ctx.restore();
    };
    const snail = (x, y, r, a, c) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      circle(ctx, r * 0.1, r * 0.12, r, 'rgba(0,0,0,0.22)');
      circle(ctx, 0, 0, r, lit(ctx, 0, 0, r, c, 0.16), shade(c, -0.35), lw);
      const pts = [];
      for (let i = 0; i <= 36; i += 1) {
        const th = i * 0.42;
        const rr = r * 0.92 * (1 - i / 40);
        pts.push([Math.cos(th) * rr, Math.sin(th) * rr]);
      }
      polyline(ctx, pts, shade(c, -0.35), lw);
      ctx.restore();
    };
    const conch = (x, y, r, a, c) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      oval(ctx, r * 0.1, r * 0.12, r * 0.55, r * 1.1, 0, 'rgba(0,0,0,0.22)');
      ctx.beginPath();
      ctx.moveTo(0, r * 1.15);
      ctx.quadraticCurveTo(r * 0.7, r * 0.2, r * 0.42, -r * 0.5);
      ctx.quadraticCurveTo(0, -r * 0.95, -r * 0.42, -r * 0.5);
      ctx.quadraticCurveTo(-r * 0.7, r * 0.2, 0, r * 1.15);
      ctx.closePath();
      ctx.fillStyle = lit(ctx, 0, 0, r, c, 0.16);
      ctx.fill();
      ctx.strokeStyle = shade(c, -0.35);
      ctx.lineWidth = lw;
      ctx.stroke();
      for (const k of [0.22, 0.4]) {
        ctx.beginPath();
        ctx.arc(0, -r * 0.5, r * k, 0, TAU);
        ctx.strokeStyle = shade(c, -0.3);
        ctx.lineWidth = Math.max(0.5, m * 0.012);
        ctx.stroke();
      }
      circle(ctx, 0, -r * 0.5, r * 0.08, shade(c, -0.3));
      oval(ctx, r * 0.12, r * 0.35, r * 0.1, r * 0.45, -0.15, '#e89a8a');
      ctx.restore();
    };
    scallop(-m * 0.17, -m * 0.12, m * 0.17, -0.35 + (rnd() - 0.5) * 0.4, '#f0c8a8');
    scallop(m * 0.2, m * 0.16, m * 0.14, 0.7 + (rnd() - 0.5) * 0.4, '#f4e2cc');
    snail(m * 0.2, -m * 0.2, m * 0.13, rnd() * TAU, '#e2c494');
    conch(-m * 0.14, m * 0.22, m * 0.15, 1.1 + (rnd() - 0.5) * 0.4, '#ecdcc0');
  },
  leaf_pile(g) {
    const { ctx, m, rnd, t } = g;
    const cols = [t, shade(t, 0.08), mix(t, '#b5382a', 0.5), mix(t, '#e0b040', 0.55), mix(t, '#6e4626', 0.45)];
    smoothShape(ctx, blobPoints(0, 0, m * 0.3, m * 0.26, 9, 0.4, rnd), rgba(shade(t, -0.4), 0.3));
    const leaf = (x, y, a, s, c) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(-s * 0.1, -s * 0.62, s, 0);
      ctx.quadraticCurveTo(-s * 0.1, s * 0.62, -s, 0);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = shade(c, -0.25);
      ctx.lineWidth = Math.max(0.5, m * 0.008);
      ctx.stroke();
      line(ctx, -s * 1.3, 0, s * 0.85, 0, shade(c, -0.2), Math.max(0.5, m * 0.01));
      ctx.restore();
    };
    const maple = (x, y, a, s, c) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      const pts = [];
      const lens = [0.6, 0.85, 1, 0.85, 0.6];
      for (let j = 0; j < 5; j += 1) {
        const th = -Math.PI / 2 + (j - 2) * 0.95;
        pts.push([Math.cos(th) * s * lens[j], Math.sin(th) * s * lens[j]]);
        if (j < 4) pts.push([Math.cos(th + 0.47) * s * 0.36, Math.sin(th + 0.47) * s * 0.36]);
      }
      pts.push([s * 0.12, s * 0.2], [-s * 0.12, s * 0.2]);
      poly(ctx, pts, c, shade(c, -0.25), Math.max(0.5, m * 0.008));
      line(ctx, 0, s * 0.1, 0, s * 0.55, shade(c, -0.25), Math.max(0.5, m * 0.012));
      for (let j = 1; j < 4; j += 1) {
        const th = -Math.PI / 2 + (j - 2) * 0.95;
        line(ctx, 0, s * 0.1, Math.cos(th) * s * 0.6, Math.sin(th) * s * 0.6, rgba(shade(c, -0.22), 0.8), Math.max(0.5, m * 0.007));
      }
      ctx.restore();
    };
    for (let i = 0; i < 28; i += 1) {
      const a = rnd() * TAU;
      const d = Math.pow(rnd(), 0.7) * m * 0.38;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const c = shade(cols[Math.floor(rnd() * cols.length)], (rnd() - 0.5) * 0.08);
      if (i % 3 === 0) maple(x, y, rnd() * TAU, m * 0.1, c);
      else leaf(x, y, rnd() * TAU, m * (0.06 + rnd() * 0.03), c);
    }
  },
  snow_drift(g) {
    const { ctx, m, rnd } = g;
    const outline = blobPoints(0, 0, m * 0.45, m * 0.39, 12, 0.22, rnd);
    // A blue shadow on the side away from the light.
    smoothShape(ctx, outline.map(([x, y]) => [x + m * 0.03, y + m * 0.035]), rgba('#4a6a98', 0.3));
    smoothShape(ctx, outline, radial(ctx, 0, 0, m * 0.46, '#ffffff', '#b4c8de', -m * 0.16, -m * 0.15), rgba('#8ea8c8', 0.7), Math.max(0.6, m * 0.012));
    // A second, higher hump.
    const hump = blobPoints(-m * 0.1, -m * 0.08, m * 0.24, m * 0.19, 9, 0.25, rnd);
    smoothShape(ctx, hump.map(([x, y]) => [x + m * 0.025, y + m * 0.03]), rgba('#7f9cc4', 0.35));
    smoothShape(ctx, hump, radial(ctx, -m * 0.1, -m * 0.08, m * 0.26, '#ffffff', '#d0dfee', -m * 0.2, -m * 0.17));
    // Wind ripples on the lee side.
    for (const k of [0.3, 0.36]) {
      ctx.beginPath();
      ctx.arc(-m * 0.1, -m * 0.08, m * k, 0.15, 1.45);
      ctx.strokeStyle = rgba('#8aa6c8', 0.55);
      ctx.lineWidth = Math.max(0.5, m * 0.01);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    for (let i = 0; i < 8; i += 1) circle(ctx, (rnd() - 0.6) * m * 0.6, (rnd() - 0.6) * m * 0.5, m * 0.008, '#ffffff');
  },
  ice_block(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.42, h * 0.42, 0.9);
    const k = 0.42;
    const j = () => (rnd() - 0.5) * m * 0.04;
    const outer = [[-w * k + j(), -h * k + j()], [w * k + j(), -h * k + j()], [w * k + j(), h * k + j()], [-w * k + j(), h * k + j()]];
    const inner = outer.map(([x, y]) => [x * 0.7 - m * 0.02, y * 0.7 - m * 0.02]);
    poly(ctx, outer, rgba('#9ccfe8', 0.82));
    poly(ctx, [outer[0], outer[1], inner[1], inner[0]], rgba('#e8f8ff', 0.75));
    poly(ctx, [outer[0], inner[0], inner[3], outer[3]], rgba('#d0eefc', 0.6));
    poly(ctx, [outer[1], outer[2], inner[2], inner[1]], rgba('#3a76a0', 0.35));
    poly(ctx, [outer[3], inner[3], inner[2], outer[2]], rgba('#2f6890', 0.45));
    poly(ctx, inner, rgba('#bfe6f8', 0.6), rgba('#ffffff', 0.6), Math.max(0.5, m * 0.015));
    poly(ctx, outer, null, '#4f87ad', Math.max(0.8, m * 0.03));
    // Cracks.
    const crack = (pts) => {
      polyline(ctx, pts, rgba('#2f6890', 0.6), Math.max(0.6, m * 0.022));
      polyline(ctx, pts.map(([x, y]) => [x - m * 0.008, y - m * 0.008]), rgba('#ffffff', 0.9), Math.max(0.5, m * 0.01));
    };
    crack([[-w * 0.05, -h * 0.28], [w * 0.04, -h * 0.08], [-w * 0.02, h * 0.06], [w * 0.12, h * 0.24]]);
    crack([[w * 0.04, -h * 0.08], [w * 0.22, -h * 0.02]]);
    crack([[-w * 0.02, h * 0.06], [-w * 0.2, h * 0.14]]);
    // Highlights.
    line(ctx, -w * 0.3, -h * 0.12, -w * 0.12, -h * 0.3, rgba('#ffffff', 0.8), Math.max(0.8, m * 0.035));
    line(ctx, -w * 0.3, -h * 0.02, -w * 0.24, -h * 0.08, rgba('#ffffff', 0.7), Math.max(0.6, m * 0.025));
  },
  anthill(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.32, m * 0.3, 0.9);
    const base = '#a07548';
    // Loose crumbs of earth round its foot.
    for (let i = 0; i < 30; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.3 + rnd() * 0.12);
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d * 0.95, m * (0.008 + rnd() * 0.012), rgba(shade(base, (rnd() - 0.6) * 0.3), 0.85));
    }
    // The mound: a lumpy cone of earth, lit from the top left, a smaller lump for its upper part.
    smoothShape(ctx, blobPoints(0, 0, m * 0.34, m * 0.31, 12, 0.3, rnd), radial(ctx, -m * 0.02, -m * 0.02, m * 0.36, shade(base, 0.12), shade(base, -0.24), -m * 0.15, -m * 0.15), rgba(shade(base, -0.4), 0.55), Math.max(0.5, m * 0.012));
    smoothShape(ctx, blobPoints(-m * 0.03, -m * 0.03, m * 0.19, m * 0.18, 9, 0.3, rnd), radial(ctx, -m * 0.03, -m * 0.03, m * 0.2, shade(base, 0.2), shade(base, -0.06), -m * 0.1, -m * 0.1));
    for (let i = 0; i < 50; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.32;
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, m * (0.006 + rnd() * 0.009), rgba(Math.cos(a) + Math.sin(a) < 0 ? '#e0c494' : '#5a3e22', 0.75));
    }
    circle(ctx, -m * 0.03, -m * 0.03, m * 0.055, radial(ctx, -m * 0.03, -m * 0.03, m * 0.055, '#0e0904', '#3a2a1a'), shade(base, -0.35), Math.max(0.5, m * 0.012));
    // Ants: head, waist and body with legs; some on the mound, a column marching off.
    const ant = (x, y, a) => {
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      line(ctx, x - sa * m * 0.024, y + ca * m * 0.024, x + sa * m * 0.024, y - ca * m * 0.024, '#1a100a', Math.max(0.5, m * 0.007));
      circle(ctx, x + ca * m * 0.02, y + sa * m * 0.02, m * 0.011, '#1a100a');
      circle(ctx, x, y, m * 0.009, '#1a100a');
      circle(ctx, x - ca * m * 0.022, y - sa * m * 0.022, m * 0.014, '#1a100a');
    };
    for (let i = 0; i < 6; i += 1) {
      const a = rnd() * TAU;
      const d = m * (0.1 + rnd() * 0.18);
      ant(Math.cos(a) * d, Math.sin(a) * d, rnd() * TAU);
    }
    const ta = rnd() * TAU;
    for (let i = 0; i < 8; i += 1) {
      const d = m * (0.2 + i * 0.038);
      const a = ta + i * 0.09;
      ant(Math.cos(a) * d, Math.sin(a) * d, a + 0.3 + (i % 2 ? Math.PI : 0));
    }
  },
  animal_skull(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.3, m * 0.36, 0.4);
    const bone = '#e9e0c9';
    const edge = '#9a8f74';
    const lw = Math.max(0.6, m * 0.02);
    // Long horns sweeping out sideways from the top of the head, tips curling up.
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * m * 0.1, -m * 0.25);
      ctx.bezierCurveTo(s * m * 0.26, -m * 0.3, s * m * 0.4, -m * 0.25, s * m * 0.47, -m * 0.4);
      ctx.bezierCurveTo(s * m * 0.42, -m * 0.2, s * m * 0.28, -m * 0.16, s * m * 0.12, -m * 0.14);
      ctx.closePath();
      const hg = ctx.createLinearGradient(s * m * 0.1, 0, s * m * 0.47, 0);
      hg.addColorStop(0, '#ddd0ae');
      hg.addColorStop(0.6, '#c4b088');
      hg.addColorStop(1, '#5e4c38');
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    // The skull: broad brow, long face narrowing to the muzzle at the bottom.
    ctx.beginPath();
    ctx.moveTo(-m * 0.15, -m * 0.24);
    ctx.quadraticCurveTo(0, -m * 0.31, m * 0.15, -m * 0.24);
    ctx.quadraticCurveTo(m * 0.2, -m * 0.06, m * 0.12, m * 0.06);
    ctx.quadraticCurveTo(m * 0.1, m * 0.28, m * 0.08, m * 0.38);
    ctx.quadraticCurveTo(0, m * 0.45, -m * 0.08, m * 0.38);
    ctx.quadraticCurveTo(-m * 0.1, m * 0.28, -m * 0.12, m * 0.06);
    ctx.quadraticCurveTo(-m * 0.2, -m * 0.06, -m * 0.15, -m * 0.24);
    ctx.closePath();
    ctx.fillStyle = lit(ctx, 0, 0, m * 0.4, bone, 0.1);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = lw;
    ctx.stroke();
    for (const s of [-1, 1]) oval(ctx, s * m * 0.1, -m * 0.05, m * 0.055, m * 0.045, s * 0.5, '#2a231a');
    oval(ctx, 0, m * 0.16, m * 0.03, m * 0.1, 0, rgba('#6a5a42', 0.55));
    for (const s of [-1, 1]) oval(ctx, s * m * 0.035, m * 0.36, m * 0.02, m * 0.03, 0, '#3a2f22');
    line(ctx, -m * 0.11, -m * 0.17, m * 0.11, -m * 0.17, rgba(edge, 0.6), Math.max(0.5, m * 0.012));
  },

  // ----- Rocks and ground -----
  rock_pile(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.46, m * 0.44, 1.2);
    smoothShape(ctx, blobPoints(0, 0, m * 0.47, m * 0.43, 12, 0.25, rnd), rgba('#3e3a34', 0.5));
    const gg = { ...g, m: m * 0.5 };
    const rocks = [];
    for (let i = 0; i < 26; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.36;
      rocks.push([Math.cos(a) * d, Math.sin(a) * d * 0.92, m * (0.07 + rnd() * 0.05), d / (m * 0.36)]);
    }
    rocks.sort((p, q) => q[3] - p[3]);
    for (const [x, y, r, k] of rocks) {
      oval(ctx, x + r * 0.25, y + r * 0.3, r, r * 0.85, 0, 'rgba(0,0,0,0.3)');
      stone(gg, x, y, r, r * 0.85, shade('#7d776d', 0.06 - k * 0.12 + (rnd() - 0.5) * 0.08), 7, 0.4);
    }
  },
  cairn(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.38, m * 0.36, 1.8);
    // Flat stones stacked, each a little smaller, set a little askew on the one below.
    const cols = ['#857f75', '#9b958a', '#7a746b', '#a29c90', '#8c867b', '#aaa498'];
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < 6; i += 1) {
      const r = m * (0.42 - i * 0.065);
      const pts = blobPoints(cx, cy, r, r * (0.8 + rnd() * 0.15), 9, 0.22, rnd, rnd() * TAU);
      if (i) smoothShape(ctx, pts.map(([x, y]) => [x + m * 0.03, y + m * 0.035]), 'rgba(0,0,0,0.35)');
      smoothShape(ctx, pts, lit(ctx, cx, cy, r, cols[i], 0.16), '#36322c', Math.max(0.6, m * 0.022));
      smoothShape(ctx, pts.map(([x, y]) => [cx + (x - cx) * 0.8 - m * 0.012, cy + (y - cy) * 0.8 - m * 0.012]), null, rgba('#e8e2d4', 0.35), Math.max(0.5, m * 0.012));
      cx += (rnd() - 0.6) * m * 0.05;
      cy += (rnd() - 0.6) * m * 0.05;
    }
  },
  cliff_edge(g) {
    const { ctx, w, h, m, rnd } = g;
    const n = Math.max(8, Math.round((w / h) * 7));
    const lw = Math.max(0.6, m * 0.02);
    // The lip: a jagged line across, a little below the middle; the foot of the face below it.
    const lip = [];
    for (let i = 0; i <= n; i += 1) lip.push([-w / 2 + (w * i) / n, h * (0.0 + (rnd() - 0.5) * 0.14)]);
    const foot = lip.map(([x, y], i) => [x + (i % n ? (rnd() - 0.5) * (w / n) * 0.3 : 0), y + h * (0.26 + rnd() * 0.1)]);
    // The drop below: dark, fading out.
    const drop = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.5);
    drop.addColorStop(0, 'rgba(12,10,8,0.8)');
    drop.addColorStop(1, 'rgba(12,10,8,0)');
    poly(ctx, [...foot, [w / 2, h / 2], [-w / 2, h / 2]], drop);
    // The cliff face: columns of dark rock in shade, cracked down the middle.
    for (let i = 0; i < n; i += 1) {
      const c = shade('#4c463e', (rnd() - 0.5) * 0.08 + (i % 2 ? -0.03 : 0.02));
      const fg = ctx.createLinearGradient(0, lip[i][1], 0, foot[i][1]);
      fg.addColorStop(0, shade(c, 0.06));
      fg.addColorStop(1, shade(c, -0.2));
      poly(ctx, [lip[i], lip[i + 1], foot[i + 1], foot[i]], fg);
      const mx = (lip[i][0] + lip[i + 1][0]) / 2;
      const my = (lip[i][1] + lip[i + 1][1]) / 2;
      polyline(ctx, [[mx, my + h * 0.03], [mx + (rnd() - 0.5) * w * 0.01, my + h * 0.12], [mx + (rnd() - 0.5) * w * 0.012, my + h * 0.22]], rgba('#14110e', 0.75), Math.max(0.5, m * 0.02));
      line(ctx, lip[i][0], lip[i][1], foot[i][0], foot[i][1], rgba('#1a1714', 0.8), Math.max(0.5, m * 0.015));
    }
    poly(ctx, [...lip, ...foot.slice().reverse()], null, '#1a1714', lw);
    // The top: rock the colour of the ground, fading in from the upper edge.
    const top = ctx.createLinearGradient(0, -h / 2, 0, h * 0.05);
    top.addColorStop(0, 'rgba(128,118,100,0)');
    top.addColorStop(0.4, 'rgba(128,118,100,0.92)');
    top.addColorStop(1, '#9c9482');
    poly(ctx, [[-w / 2, -h / 2], [w / 2, -h / 2], ...lip.slice().reverse()], top);
    // Paler patches of bare rock, cracks running back from the edge, a few loose stones.
    const k = Math.max(3, Math.round(n / 2));
    for (let i = 0; i < k; i += 1) {
      const x = -w / 2 + (w * (i + 0.2 + rnd() * 0.6)) / k;
      const y = -h * (0.1 + rnd() * 0.12);
      poly(ctx, blobPoints(x, y, (w / k) * (0.25 + rnd() * 0.15), h * (0.08 + rnd() * 0.05), 6, 0.45, rnd, rnd() * TAU), rgba('#c0b8a4', 0.4));
    }
    for (let i = 0; i < n * 1.5; i += 1) {
      const x = -w * 0.48 + w * 0.96 * rnd();
      const yb = lip[Math.min(n, Math.round(((x + w / 2) / w) * n))][1];
      const pts = [[x, yb - h * 0.01]];
      for (let s = 0; s < 3; s += 1) pts.push([pts[s][0] + (rnd() - 0.5) * w * 0.025, pts[s][1] - h * (0.05 + rnd() * 0.06)]);
      polyline(ctx, pts, rgba('#4a443a', 0.6), Math.max(0.5, m * 0.016));
    }
    const gg = { ...g, m: m * 0.5 };
    for (let i = 0; i < k; i += 1) {
      const x = -w * 0.46 + w * 0.92 * rnd();
      const yb = lip[Math.min(n, Math.round(((x + w / 2) / w) * n))][1];
      stone(gg, x, yb - h * (0.08 + rnd() * 0.08), m * (0.04 + rnd() * 0.04), m * (0.03 + rnd() * 0.03), shade('#8f8774', (rnd() - 0.5) * 0.1), 6, 0.4);
    }
    polyline(ctx, lip.map(([x, y]) => [x, y - h * 0.012]), rgba('#dcd4c0', 0.85), Math.max(0.6, m * 0.035));
  },
  stalactites(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.4, m * 0.4, 2.2);
    const spikes = [];
    for (let i = 0; i < 80 && spikes.length < 9; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * m * 0.33;
      const r = m * (0.06 + rnd() * 0.09);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (spikes.every(([sx, sy, sr]) => Math.hypot(sx - x, sy - y) > (sr + r) * 0.85)) spikes.push([x, y, r]);
    }
    spikes.sort((p, q) => q[2] - p[2]);
    // Each cone seen end on: a rough dark base, ridges running in to a pale wet tip.
    for (const [x, y, r] of spikes) {
      const pts = blobPoints(x, y, r, r, 9, 0.28, rnd, rnd() * TAU);
      const tx = x - r * 0.18;
      const ty = y - r * 0.18;
      smoothShape(ctx, pts, radial(ctx, x, y, r, '#b0a490', '#332d27', tx, ty), '#16130f', Math.max(0.5, m * 0.012));
      for (const [px, py] of pts) line(ctx, px + (tx - px) * 0.12, py + (ty - py) * 0.12, tx + (px - tx) * 0.3, ty + (py - ty) * 0.3, rgba('#1a1612', 0.45), Math.max(0.5, m * 0.008));
      smoothShape(ctx, pts.map(([px, py]) => [tx + (px - x) * 0.55, ty + (py - y) * 0.55]), null, rgba('#e8e0d0', 0.3), Math.max(0.5, m * 0.008));
      circle(ctx, tx, ty, r * 0.17, '#f0eadc');
    }
  },
  hot_spring(g) {
    const { ctx, m, rnd } = g;
    const rim = blobPoints(0, 0, m * 0.47, m * 0.43, 13, 0.16, rnd);
    const at = (k) => rim.map(([x, y]) => [x * k, y * k]);
    smoothShape(ctx, rim, lit(ctx, 0, 0, m * 0.47, '#d9cba6', 0.1), '#9a865c', Math.max(0.6, m * 0.012));
    smoothShape(ctx, at(0.9), rgba('#d8963e', 0.55));
    smoothShape(ctx, at(0.84), '#eadfc4');
    smoothShape(ctx, at(0.79), rgba('#c8a050', 0.6));
    // The pool: pale and shallow at the edge, deep blue-green in the middle.
    smoothShape(ctx, at(0.74), radial(ctx, 0, 0, m * 0.36, '#1a7c96', '#5ed0c6'), '#bfae80', Math.max(0.5, m * 0.01));
    for (const k of [0.08, 0.14, 0.2]) circle(ctx, m * 0.04, m * 0.03, m * k, null, rgba('#ffffff', 0.18), Math.max(0.5, m * 0.006));
    for (let i = 0; i < 7; i += 1) circle(ctx, m * 0.04 + (rnd() - 0.5) * m * 0.12, m * 0.03 + (rnd() - 0.5) * m * 0.12, m * (0.008 + rnd() * 0.012), null, rgba('#e8ffff', 0.7), Math.max(0.5, m * 0.005));
    // Steam drifting off it.
    for (let i = 0; i < 4; i += 1) {
      const x = (rnd() - 0.5) * m * 0.4;
      const y = (rnd() - 0.5) * m * 0.4;
      glow(ctx, x, y, m * 0.14, '#ffffff', 0.3);
      ctx.beginPath();
      ctx.moveTo(x, y + m * 0.1);
      ctx.bezierCurveTo(x - m * 0.1, y + m * 0.03, x + m * 0.1, y - m * 0.03, x, y - m * 0.1);
      ctx.strokeStyle = rgba('#ffffff', 0.35);
      ctx.lineWidth = Math.max(0.6, m * 0.02);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  },
  cooling_lava(g) {
    const { ctx, m, rnd } = g;
    glow(ctx, 0, 0, m * 0.56, '#ff5a1a', 0.3);
    const edge = blobPoints(0, 0, m * 0.47, m * 0.43, 12, 0.2, rnd);
    smoothShape(ctx, edge, '#241e1c', '#141010', Math.max(0.6, m * 0.015));
    smoothShape(ctx, edge.map(([x, y]) => [x * 0.86, y * 0.86]), radial(ctx, 0, 0, m * 0.42, '#ffd25a', '#e8501a'));
    // Plates of black crust over it, the molten rock glowing in the cracks between.
    ctx.save();
    smoothShape(ctx, edge, null);
    ctx.clip();
    const n = 4;
    const step = (m * 0.9) / n;
    for (let i = 0; i <= n; i += 1) {
      for (let j = 0; j <= n; j += 1) {
        const cx = -m * 0.45 + i * step + (rnd() - 0.5) * step * 0.3;
        const cy = -m * 0.45 + j * step + (rnd() - 0.5) * step * 0.3;
        poly(ctx, blobPoints(cx, cy, step * 0.55, step * 0.53, 7, 0.22, rnd, rnd() * TAU), lit(ctx, cx, cy, step * 0.5, '#3a302c', 0.1), rgba('#ff7a2a', 0.7), Math.max(0.5, m * 0.01));
      }
    }
    ctx.restore();
    // Hot spots where the cracks meet.
    for (let i = 0; i < 6; i += 1) {
      const x = -m * 0.45 + (Math.floor(rnd() * n) + 0.5) * step;
      const y = -m * 0.45 + (Math.floor(rnd() * n) + 0.5) * step;
      if (Math.hypot(x, y) < m * 0.36) glow(ctx, x, y, m * 0.06, '#ffc94a', 0.5);
    }
  },
  footprints(g) {
    const { ctx, w, h, m } = g;
    const c = rgba('#2e2216', 0.42);
    const n = Math.max(2, Math.round((h / w) * 2.5));
    const s = Math.min(w * 0.32, (h / n) * 0.55);
    for (let i = 0; i < n; i += 1) {
      const side = i % 2 ? 1 : -1;
      ctx.save();
      ctx.translate(side * w * 0.17, h * 0.5 - (h * (i + 0.5)) / n);
      ctx.rotate(side * 0.1);
      oval(ctx, 0, -s * 0.18, s * 0.3, s * 0.42, 0, c);
      oval(ctx, 0, s * 0.52, s * 0.24, s * 0.2, 0, c);
      for (let k = 0; k < 3; k += 1) line(ctx, -s * 0.18, -s * 0.36 + k * s * 0.17, s * 0.18, -s * 0.36 + k * s * 0.17, rgba('#2e2216', 0.3), Math.max(0.5, m * 0.012));
      ctx.restore();
    }
  },
  scorch(g) {
    const { ctx, m, rnd } = g;
    smoothShape(ctx, blobPoints(0, 0, m * 0.48, m * 0.45, 16, 0.3, rnd), radial(ctx, 0, 0, m * 0.48, 'rgba(12,10,8,0.85)', 'rgba(12,10,8,0)'));
    // Streaks of soot thrown out from the middle.
    for (let i = 0; i < 14; i += 1) {
      const a = rnd() * TAU;
      const r0 = m * 0.12;
      const r1 = m * (0.3 + rnd() * 0.17);
      poly(ctx, [[Math.cos(a - 0.12) * r0, Math.sin(a - 0.12) * r0], [Math.cos(a) * r1, Math.sin(a) * r1], [Math.cos(a + 0.12) * r0, Math.sin(a + 0.12) * r0]], rgba('#0c0a08', 0.35));
    }
    smoothShape(ctx, blobPoints(0, 0, m * 0.24, m * 0.22, 10, 0.35, rnd), rgba('#0a0806', 0.75));
    for (let i = 0; i < 18; i += 1) circle(ctx, (rnd() - 0.5) * m * 0.45, (rnd() - 0.5) * m * 0.45, m * (0.008 + rnd() * 0.016), rgba('#9a948c', 0.6));
    for (let i = 0; i < 5; i += 1) {
      const a = rnd() * TAU;
      const d = rnd() * m * 0.2;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      glow(ctx, x, y, m * 0.05, '#ff6a1a', 0.55);
      circle(ctx, x, y, m * 0.012, '#ffb347');
    }
  },

  // ----- Camp -----
  yurt(g) {
    const { ctx, m, t } = g;
    shadow(g, 'round', m * 0.46, m * 0.46, 2);
    const R = m * 0.45;
    const lw = Math.max(0.6, m * 0.01);
    // The door: a painted wooden frame at the front (bottom).
    rect(ctx, -m * 0.07, R - m * 0.05, m * 0.14, m * 0.09, '#b0502a', '#5a2a14', lw);
    rect(ctx, -m * 0.045, R - m * 0.02, m * 0.09, m * 0.04, '#d8a040');
    // The felt wall peeking out round the roof's edge.
    circle(ctx, 0, 0, R, shade(t, -0.16), shade(t, -0.42), lw);
    // The roof: a low cone of felt, lit from the top left, the poles showing through as ribs.
    const n = 28;
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * TAU;
      const a1 = ((i + 1) / n) * TAU;
      const l = Math.cos((a0 + a1) / 2 + Math.PI * 0.75) * 0.15;
      poly(ctx, [[0, 0], [Math.cos(a0) * R * 0.95, Math.sin(a0) * R * 0.95], [Math.cos(a1) * R * 0.95, Math.sin(a1) * R * 0.95]], shade(t, l));
      line(ctx, Math.cos(a0) * R * 0.18, Math.sin(a0) * R * 0.18, Math.cos(a0) * R * 0.94, Math.sin(a0) * R * 0.94, rgba(shade(t, -0.3), 0.35), Math.max(0.5, m * 0.006));
    }
    // A painted band round the eaves.
    for (let i = 0; i < 40; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.9, (i / 40) * TAU, ((i + 1) / 40) * TAU);
      ctx.strokeStyle = i % 2 ? '#8a2a24' : '#2f4f7a';
      ctx.lineWidth = Math.max(0.8, m * 0.025);
      ctx.lineCap = 'butt';
      ctx.stroke();
    }
    // Ropes criss-crossing over the felt to hold it down.
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * TAU + 0.3;
      for (const s of [-1, 1]) line(ctx, Math.cos(a) * R * 0.18, Math.sin(a) * R * 0.18, Math.cos(a + s * 0.5) * R * 0.88, Math.sin(a + s * 0.5) * R * 0.88, rgba('#5a3e22', 0.75), Math.max(0.5, m * 0.008));
    }
    // The crown: a wooden ring with crossed bars over the smoke hole.
    circle(ctx, 0, 0, R * 0.18, '#6e4a2a', '#3e2914', lw);
    circle(ctx, 0, 0, R * 0.14, '#1e1814');
    for (const a of [0.4, 0.4 + Math.PI / 2]) line(ctx, -Math.cos(a) * R * 0.14, -Math.sin(a) * R * 0.14, Math.cos(a) * R * 0.14, Math.sin(a) * R * 0.14, '#8a5d33', Math.max(0.6, m * 0.014));
    glow(ctx, R * 0.05, -R * 0.05, R * 0.2, '#d8d8d8', 0.35);
  },
  command_tent(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.36, h * 0.42, 1.8);
    const tw = w * 0.34;
    const th = h * 0.4;
    const lw = Math.max(0.6, m * 0.01);
    const rope = rgba('#d8ccb0', 0.85);
    // Guy ropes out to stakes.
    for (const s of [-1, 1]) {
      for (const k of [-0.8, -0.27, 0.27, 0.8]) {
        const y = k * th;
        line(ctx, s * tw, y, s * w * 0.47, y + k * h * 0.04, rope, Math.max(0.5, m * 0.008));
        circle(ctx, s * w * 0.47, y + k * h * 0.04, m * 0.014, '#4a3018');
      }
    }
    line(ctx, 0, th, 0, h * 0.48, rope, Math.max(0.5, m * 0.008));
    // Roof: two slopes of canvas, the left one in the light, with seams across.
    rect(ctx, -tw, -th, tw, th * 2, shade(t, 0.08));
    rect(ctx, 0, -th, tw, th * 2, shade(t, -0.1));
    for (let i = 1; i < 6; i += 1) {
      const y = -th + (2 * th * i) / 6;
      line(ctx, -tw, y, tw, y, rgba(shade(t, -0.3), 0.45), lw, 'butt');
    }
    // A scalloped gold valance along the eaves.
    for (const s of [-1, 1]) {
      const k = 9;
      for (let i = 0; i < k; i += 1) {
        ctx.beginPath();
        ctx.arc(s * tw, -th + (2 * th * (i + 0.5)) / k, (th / k) * 0.8, -Math.PI / 2, Math.PI / 2, s < 0);
        ctx.closePath();
        ctx.fillStyle = '#d4a72c';
        ctx.fill();
      }
      line(ctx, s * tw, -th, s * tw, th, '#8a6a14', Math.max(0.8, m * 0.012), 'butt');
    }
    rect(ctx, -tw, -th, tw * 2, th * 2, null, shade(t, -0.35), lw);
    line(ctx, 0, -th, 0, th, shade(t, -0.4), Math.max(0.8, m * 0.02));
    // The door at the bottom end, its flaps tied back.
    poly(ctx, [[-tw * 0.45, th], [0, th * 0.72], [tw * 0.45, th]], '#2a1e18');
    for (const s of [-1, 1]) poly(ctx, [[s * tw * 0.45, th], [s * tw * 0.02, th * 0.74], [s * tw * 0.6, th * 0.97]], shade(t, s < 0 ? 0.02 : -0.16), shade(t, -0.4), lw);
    // A flag on a pole at the top end.
    const px = 0;
    const py = -h * 0.445;
    ctx.beginPath();
    ctx.moveTo(px, py - h * 0.04);
    ctx.bezierCurveTo(px + w * 0.08, py - h * 0.055, px + w * 0.16, py - h * 0.025, px + w * 0.24, py - h * 0.04);
    ctx.lineTo(px + w * 0.21, py);
    ctx.lineTo(px + w * 0.24, py + h * 0.04);
    ctx.bezierCurveTo(px + w * 0.16, py + h * 0.025, px + w * 0.08, py + h * 0.055, px, py + h * 0.04);
    ctx.closePath();
    const fg = ctx.createLinearGradient(px, 0, px + w * 0.24, 0);
    fg.addColorStop(0, '#e8c050');
    fg.addColorStop(0.35, '#b8902f');
    fg.addColorStop(0.7, '#e0b840');
    fg.addColorStop(1, '#b08a2a');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = '#6a5214';
    ctx.lineWidth = lw;
    ctx.stroke();
    line(ctx, px + w * 0.02, py, px + w * 0.19, py, t, Math.max(0.8, h * 0.02));
    circle(ctx, px, py, m * 0.03, '#5b3d22', '#2e1f10', lw);
    circle(ctx, px, py, m * 0.015, '#e0b83a');
  },
  barricade(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.46, h * 0.38, 1);
    const n = Math.max(2, Math.round((w / h) * 2.5));
    const lw = Math.max(0.6, m * 0.02);
    const by = h * 0.18;
    // The beam.
    const bg = ctx.createLinearGradient(0, by - h * 0.1, 0, by + h * 0.1);
    bg.addColorStop(0, '#7a5a38');
    bg.addColorStop(1, '#3e2a18');
    rrect(ctx, -w * 0.48, by - h * 0.1, w * 0.96, h * 0.2, h * 0.08, bg, '#2e1f10', lw);
    // Stakes crossed in pairs through it, sharpened to the top.
    const stake = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      ctx.save();
      ctx.translate(x0, y0);
      ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
      const r = m * 0.045;
      poly(ctx, [[0, -r], [len * 0.78, -r], [len, 0], [len * 0.78, r], [0, r]], '#7a5532', '#2e1f10', lw);
      poly(ctx, [[len * 0.78, -r], [len, 0], [len * 0.78, r]], '#d8bf8e', '#5a3d22', Math.max(0.5, m * 0.01));
      line(ctx, len * 0.05, -r * 0.35, len * 0.74, -r * 0.35, rgba('#b08a5a', 0.8), r * 0.4);
      ctx.restore();
    };
    const s = (0.44 - 0.18) / 0.9;
    for (let i = 0; i < n; i += 1) {
      const x = -w * 0.4 + (w * 0.8 * i) / (n - 1);
      const d0 = w * 0.035;
      const d1 = (d0 * (1 - s)) / s;
      stake(x - d0, h * 0.44, x + d1, -h * 0.46);
      stake(x + d0, h * 0.44, x - d1, -h * 0.46);
      circle(ctx, x, by, m * 0.05, '#c8b48a', '#6a5a3a', Math.max(0.5, m * 0.012));
    }
  },
  standard(g) {
    const { ctx, m, t } = g;
    shadow(g, 'round', m * 0.36, m * 0.22, 2.5);
    const lw = Math.max(0.5, m * 0.02);
    const px = -m * 0.32;
    const py = 0;
    const fw = m * 0.78;
    const fh = m * 0.46;
    ctx.beginPath();
    ctx.moveTo(px, py - fh / 2);
    ctx.bezierCurveTo(px + fw * 0.3, py - fh / 2 - fh * 0.14, px + fw * 0.62, py - fh / 2 + fh * 0.14, px + fw, py - fh / 2 + fh * 0.04);
    ctx.lineTo(px + fw * 0.8, py + fh * 0.04);
    ctx.lineTo(px + fw, py + fh / 2 + fh * 0.04);
    ctx.bezierCurveTo(px + fw * 0.62, py + fh / 2 + fh * 0.14, px + fw * 0.3, py + fh / 2 - fh * 0.14, px, py + fh / 2);
    ctx.closePath();
    const fg = ctx.createLinearGradient(px, 0, px + fw, 0);
    fg.addColorStop(0, shade(t, 0.12));
    fg.addColorStop(0.25, shade(t, -0.12));
    fg.addColorStop(0.5, shade(t, 0.1));
    fg.addColorStop(0.75, shade(t, -0.1));
    fg.addColorStop(1, shade(t, 0.06));
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = shade(t, -0.35);
    ctx.lineWidth = lw;
    ctx.stroke();
    circle(ctx, px + fw * 0.38, py, fh * 0.17, '#d4a72c', '#7a5a14', Math.max(0.5, m * 0.012));
    circle(ctx, px, py, m * 0.08, '#5b3d22', '#2e1f10', lw);
    circle(ctx, px, py, m * 0.045, lit(ctx, px, py, m * 0.045, '#e0b83a', 0.2));
  },
  ballista(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.42, h * 0.42, 1.2);
    const lw = Math.max(0.6, m * 0.015);
    const wood = '#7a5532';
    const dark = '#3a2614';
    // Crossed legs under it.
    for (const s of [-1, 1]) {
      line(ctx, s * w * 0.3, h * 0.44, -s * w * 0.26, -h * 0.02, dark, m * 0.075);
      line(ctx, s * w * 0.3, h * 0.44, -s * w * 0.26, -h * 0.02, '#5e3b1f', m * 0.045);
    }
    // The stock: a long beam down the middle.
    rect(ctx, -w * 0.05, -h * 0.34, w * 0.1, h * 0.76, wood, dark, lw);
    line(ctx, -w * 0.03, -h * 0.32, -w * 0.03, h * 0.4, rgba('#a8804e', 0.7), Math.max(0.5, m * 0.012));
    // The torsion frame across, with two skeins of rope.
    rect(ctx, -w * 0.18, -h * 0.26, w * 0.36, h * 0.12, '#5e3b1f', dark, lw);
    for (const s of [-1, 1]) {
      circle(ctx, s * w * 0.12, -h * 0.2, m * 0.055, lit(ctx, s * w * 0.12, -h * 0.2, m * 0.055, '#a08a5a', 0.16), dark, lw);
      circle(ctx, s * w * 0.12, -h * 0.2, m * 0.03, null, rgba(dark, 0.7), Math.max(0.5, m * 0.01));
    }
    // The arms, bending back at the tips.
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * w * 0.15, -h * 0.2);
      ctx.quadraticCurveTo(s * w * 0.33, -h * 0.25, s * w * 0.44, -h * 0.08);
      ctx.lineCap = 'round';
      ctx.strokeStyle = dark;
      ctx.lineWidth = m * 0.07;
      ctx.stroke();
      ctx.strokeStyle = '#8a6038';
      ctx.lineWidth = m * 0.045;
      ctx.stroke();
      circle(ctx, s * w * 0.44, -h * 0.08, m * 0.025, '#5a5e64');
    }
    // The string drawn back to the claw.
    polyline(ctx, [[-w * 0.44, -h * 0.08], [0, h * 0.2], [w * 0.44, -h * 0.08]], '#e8dcc0', Math.max(0.6, m * 0.012));
    // The bolt in its groove, iron head out past the bow.
    line(ctx, 0, -h * 0.4, 0, h * 0.2, '#c8b088', Math.max(0.8, m * 0.03));
    poly(ctx, [[0, -h * 0.49], [w * 0.04, -h * 0.39], [-w * 0.04, -h * 0.39]], '#8a8e94', '#2a2c30', lw);
    for (const s of [-1, 1]) poly(ctx, [[0, h * 0.1], [s * w * 0.035, h * 0.16], [s * w * 0.035, h * 0.22], [0, h * 0.18]], '#c0392b');
    // The winch at the back.
    rect(ctx, -w * 0.16, h * 0.3, w * 0.32, h * 0.07, '#6e4a2a', dark, lw);
    for (const s of [-1, 1]) {
      line(ctx, s * w * 0.16, h * 0.335, s * w * 0.22, h * 0.335, dark, Math.max(0.8, m * 0.03));
      line(ctx, s * w * 0.2, h * 0.28, s * w * 0.2, h * 0.39, '#5e3b1f', Math.max(0.8, m * 0.025));
    }
  },
  catapult(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.44, h * 0.46, 1.4);
    const lw = Math.max(0.6, m * 0.012);
    const wood = '#7a5532';
    const dark = '#3a2614';
    const light = '#9a7048';
    // Wheels on axles outside the frame.
    for (const y of [-h * 0.26, h * 0.28]) {
      line(ctx, -w * 0.4, y, w * 0.4, y, '#3a3a3a', Math.max(0.8, m * 0.025));
      for (const s of [-1, 1]) wheel(ctx, s * w * 0.4, y, w * 0.07, h * 0.24);
    }
    // The frame: two long rails and cross beams.
    for (const s of [-1, 1]) rect(ctx, s * w * 0.3 - w * 0.04, -h * 0.44, w * 0.08, h * 0.88, wood, dark, lw);
    for (const y of [-h * 0.4, h * 0.38]) rect(ctx, -w * 0.3, y - h * 0.03, w * 0.6, h * 0.06, wood, dark, lw);
    // The stop bar on its uprights, padded where the arm strikes.
    rect(ctx, -w * 0.34, -h * 0.2, w * 0.68, h * 0.07, light, dark, lw);
    rrect(ctx, -w * 0.08, -h * 0.21, w * 0.16, h * 0.09, m * 0.02, '#a8946a', dark, lw);
    // The winch at the back, rope wound on it, spokes to turn it.
    rect(ctx, -w * 0.26, h * 0.22, w * 0.52, h * 0.07, '#6e4a2a', dark, lw);
    for (let i = 0; i < 6; i += 1) line(ctx, -w * 0.06 + i * w * 0.024, h * 0.22, -w * 0.06 + i * w * 0.024, h * 0.29, '#c8b48a', Math.max(0.6, m * 0.012), 'butt');
    for (const s of [-1, 1]) {
      line(ctx, s * w * 0.2, h * 0.18, s * w * 0.2, h * 0.33, '#5e3b1f', Math.max(0.8, m * 0.022));
      line(ctx, s * w * 0.17, h * 0.255, s * w * 0.23, h * 0.255, '#5e3b1f', Math.max(0.8, m * 0.022));
    }
    // The throwing arm along the middle, banded with iron.
    rect(ctx, -w * 0.045, -h * 0.3, w * 0.09, h * 0.56, light, dark, lw);
    line(ctx, -w * 0.022, -h * 0.28, -w * 0.022, h * 0.24, rgba('#c8a070', 0.7), Math.max(0.5, m * 0.012));
    for (const y of [-h * 0.1, h * 0.1]) band(ctx, -w * 0.045, y, w * 0.09, h * 0.025, '#3a3a3a');
    circle(ctx, 0, h * 0.2, m * 0.035, '#4a4a4a', '#1a1a1a', lw);
    // The bucket at the top end, full of stones.
    circle(ctx, 0, -h * 0.32, m * 0.13, lit(ctx, 0, -h * 0.32, m * 0.13, '#6e4a2a', 0.1), dark, lw);
    circle(ctx, 0, -h * 0.32, m * 0.1, '#2a1e14');
    const gg = { ...g, m: m * 0.3 };
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 6) * TAU + rnd() * 0.4;
      const d = i ? m * 0.055 : 0;
      stone(gg, Math.cos(a) * d, -h * 0.32 + Math.sin(a) * d, m * 0.036, m * 0.031, shade('#8a847a', (rnd() - 0.5) * 0.15), 6, 0.3);
    }
  },
  carriage(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.44, h * 0.44, 1.6);
    const lw = Math.max(0.6, m * 0.015);
    // The pole and swingletree out front (right) for the horses.
    line(ctx, w * 0.3, 0, w * 0.48, 0, '#5b3d22', m * 0.05);
    line(ctx, w * 0.45, -h * 0.16, w * 0.45, h * 0.16, '#5b3d22', m * 0.04);
    // Wheels: big at the back, smaller at the front.
    for (const s of [-1, 1]) {
      wheel(ctx, -w * 0.26, s * h * 0.42, w * 0.15, h * 0.11);
      wheel(ctx, w * 0.18, s * h * 0.42, w * 0.12, h * 0.1);
    }
    rect(ctx, -w * 0.32, -h * 0.06, w * 0.62, h * 0.12, '#3a2614');
    // The driver's bench at the front.
    rect(ctx, w * 0.17, -h * 0.3, w * 0.13, h * 0.6, '#6e4a2a', '#3a2614', lw);
    rrect(ctx, w * 0.175, -h * 0.26, w * 0.07, h * 0.52, m * 0.03, '#7a2a24', '#3a1410', lw);
    // The body, its roof in the tint.
    rrect(ctx, -w * 0.42, -h * 0.36, w * 0.6, h * 0.72, m * 0.08, '#2a2218', '#16110b', lw);
    rrect(ctx, -w * 0.4, -h * 0.33, w * 0.56, h * 0.66, m * 0.07, radial(ctx, -w * 0.12, -h * 0.1, w * 0.4, shade(t, 0.1), shade(t, -0.12)), shade(t, -0.35), lw);
    // A brass luggage rail round the roof.
    rrect(ctx, -w * 0.37, -h * 0.28, w * 0.5, h * 0.56, m * 0.05, null, '#b8902f', Math.max(0.6, m * 0.018));
    for (let i = 0; i <= 6; i += 1) {
      const x = -w * 0.37 + (w * 0.5 * i) / 6;
      circle(ctx, x, -h * 0.28, m * 0.016, '#d4a72c');
      circle(ctx, x, h * 0.28, m * 0.016, '#d4a72c');
    }
    // A trunk strapped on the roof at the back.
    rect(ctx, -w * 0.34, -h * 0.2, w * 0.16, h * 0.4, lit(ctx, -w * 0.26, 0, h * 0.3, '#7a4a22', 0.1), '#3a240f', lw);
    for (const y of [-h * 0.1, h * 0.06]) band(ctx, -w * 0.34, y, w * 0.16, h * 0.04, '#3a2a1a');
    rect(ctx, -w * 0.2, -h * 0.03, w * 0.015, h * 0.06, '#d4a72c');
    // Lanterns at the front corners.
    for (const s of [-1, 1]) {
      glow(ctx, w * 0.17, s * h * 0.36, m * 0.08, '#ffd27a', 0.4);
      circle(ctx, w * 0.17, s * h * 0.36, m * 0.035, '#ffe08a', '#3a3a3a', lw);
    }
  },
  quiver(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.42, h * 0.44, 0.4);
    const lw = Math.max(0.5, m * 0.03);
    // The bow beside it: a curved stave and its string.
    ctx.beginPath();
    ctx.moveTo(w * 0.24, -h * 0.45);
    ctx.quadraticCurveTo(w * 0.62, 0, w * 0.24, h * 0.45);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3a2410';
    ctx.lineWidth = Math.max(1, m * 0.09);
    ctx.stroke();
    ctx.strokeStyle = '#8a5a2e';
    ctx.lineWidth = Math.max(0.6, m * 0.055);
    ctx.stroke();
    line(ctx, w * 0.24, -h * 0.45, w * 0.24, h * 0.45, '#e8dcc0', Math.max(0.5, m * 0.014));
    rect(ctx, w * 0.36, -h * 0.07, w * 0.1, h * 0.14, '#2e2014');
    // The quiver, tilted a little, arrows out of its mouth.
    ctx.save();
    ctx.translate(-w * 0.12, h * 0.08);
    ctx.rotate(-0.12);
    const qw = w * 0.38;
    const qh = h * 0.62;
    rrect(ctx, -qw / 2, -qh * 0.42, qw, qh * 0.92, qw * 0.4, lit(ctx, 0, 0, qh * 0.5, '#8a5a2e', 0.12), '#3e2410', lw);
    for (const y of [-qh * 0.18, qh * 0.22]) band(ctx, -qw / 2, y, qw, qh * 0.06, '#5a3418');
    oval(ctx, 0, -qh * 0.4, qw * 0.42, qh * 0.07, 0, '#2a1a0e');
    const feather = ['#c0392b', '#efe6d2', '#c0392b', '#efe6d2', '#c0392b'];
    for (let i = 0; i < 5; i += 1) {
      const x = -qw * 0.3 + (qw * 0.6 * i) / 4;
      const tip = -qh * (0.68 + (i % 2) * 0.07);
      line(ctx, x * 0.6, -qh * 0.4, x, tip, '#c8a878', Math.max(0.5, m * 0.025));
      poly(ctx, [[x, tip - qh * 0.04], [x + qw * 0.08, tip + qh * 0.05], [x, tip + qh * 0.1], [x - qw * 0.08, tip + qh * 0.05]], feather[i], rgba('#3a2a1a', 0.6), Math.max(0.5, m * 0.008));
    }
    ctx.restore();
  },
  cold_fire(g) {
    const { ctx, m, rnd } = g;
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * TAU + rnd() * 0.2;
      stone(g, Math.cos(a) * m * 0.38, Math.sin(a) * m * 0.38, m * 0.1, m * 0.09, '#77716a', 7, 0.3);
    }
    smoothShape(ctx, blobPoints(0, 0, m * 0.3, m * 0.29, 10, 0.18, rnd), radial(ctx, 0, 0, m * 0.3, '#8f8a84', '#4e4844'));
    smoothShape(ctx, blobPoints(m * 0.02, m * 0.02, m * 0.16, m * 0.14, 8, 0.4, rnd), rgba('#2a2624', 0.5));
    // Charred sticks: black and cracked, the unburnt ends still brown.
    const stick = (a, len, ox, oy) => {
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x0 = ox - (ca * len) / 2;
      const y0 = oy - (sa * len) / 2;
      const x1 = ox + (ca * len) / 2;
      const y1 = oy + (sa * len) / 2;
      line(ctx, x0, y0, x1, y1, '#1c1816', m * 0.075);
      line(ctx, x1 - ca * len * 0.22, y1 - sa * len * 0.22, x1, y1, '#5e4024', m * 0.06);
      for (let k = 1; k < 5; k += 1) {
        const s = k / 6;
        const x = x0 + (x1 - x0) * s;
        const y = y0 + (y1 - y0) * s;
        line(ctx, x - sa * m * 0.025, y + ca * m * 0.025, x + sa * m * 0.025, y - ca * m * 0.025, rgba('#8a8580', 0.8), Math.max(0.5, m * 0.01));
      }
    };
    stick(0.5 + rnd() * 0.3, m * 0.5, 0, 0);
    stick(2.3 + rnd() * 0.3, m * 0.46, m * 0.02, -m * 0.02);
    stick(-0.9 + rnd() * 0.3, m * 0.4, -m * 0.03, m * 0.03);
    for (let i = 0; i < 3; i += 1) circle(ctx, (rnd() - 0.5) * m * 0.2, (rnd() - 0.5) * m * 0.2, m * 0.015, '#7a2a14');
    ctx.beginPath();
    ctx.moveTo(m * 0.02, -m * 0.02);
    ctx.bezierCurveTo(m * 0.1, -m * 0.1, -m * 0.02, -m * 0.18, m * 0.08, -m * 0.28);
    ctx.strokeStyle = rgba('#d8d4cc', 0.35);
    ctx.lineWidth = Math.max(0.6, m * 0.03);
    ctx.lineCap = 'round';
    ctx.stroke();
  },
  drying_rack(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.46, h * 0.38, 1.2);
    const lw = Math.max(0.5, m * 0.015);
    // Trestles: two crossed poles at each end.
    for (const s of [-1, 1]) {
      const x = s * w * 0.43;
      line(ctx, x - w * 0.035, -h * 0.36, x + w * 0.035, h * 0.36, '#4a3018', m * 0.06);
      line(ctx, x + w * 0.035, -h * 0.36, x - w * 0.035, h * 0.36, '#4a3018', m * 0.06);
    }
    // The cross pole.
    line(ctx, -w * 0.48, 0, w * 0.48, 0, '#3a2410', m * 0.075);
    line(ctx, -w * 0.48, 0, w * 0.48, 0, '#8a6038', m * 0.05);
    line(ctx, -w * 0.48, -m * 0.012, w * 0.48, -m * 0.012, rgba('#b08a5a', 0.8), m * 0.015);
    for (const s of [-1, 1]) circle(ctx, s * w * 0.43, 0, m * 0.045, '#c8b48a', '#5a4a2a', lw);
    // Fish draped over it, heads one side and tails the other.
    const fish = (x, flip, len, c) => {
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(flip ? Math.PI : 0);
      ctx.rotate((rnd() - 0.5) * 0.15);
      poly(ctx, [[0, len * 0.3], [-len * 0.13, len * 0.48], [0, len * 0.42], [len * 0.13, len * 0.48]], shade(c, -0.08), shade(c, -0.35), lw);
      oval(ctx, 0, -len * 0.05, len * 0.1, len * 0.38, 0, lit(ctx, 0, -len * 0.05, len * 0.38, c, 0.14), shade(c, -0.35), lw);
      line(ctx, 0, -len * 0.38, 0, len * 0.28, rgba(shade(c, -0.3), 0.7), Math.max(0.5, m * 0.015));
      circle(ctx, -len * 0.035, -len * 0.33, len * 0.018, '#1a1a1a');
      ctx.restore();
    };
    const n = Math.max(2, Math.round((w / h) * 2.5));
    for (let i = 0; i < n; i += 1) {
      const x = -w * 0.33 + (w * 0.66 * i) / (n - 1);
      fish(x, i % 2 === 1, h * 0.78, i % 3 === 1 ? '#b08a50' : '#9aa4a8');
    }
  },
  lean_to(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.44, h * 0.42, 1.6);
    const x0 = -w * 0.43;
    const x1 = w * 0.43;
    const y0 = -h * 0.38;
    const y1 = h * 0.42;
    const r = m * 0.03;
    // Brushwood and leafy boughs laid down the slope: light up by the ridge, darker where it meets the ground.
    const tg = ctx.createLinearGradient(0, y0, 0, y1);
    tg.addColorStop(0, '#8c7c4a');
    tg.addColorStop(1, '#4a4026');
    rrect(ctx, x0, y0, x1 - x0, y1 - y0, r, tg);
    ctx.save();
    rrect(ctx, x0, y0, x1 - x0, y1 - y0, r, null);
    ctx.clip();
    const n = Math.round((((x1 - x0) * (y1 - y0)) / (m * m)) * 260);
    for (let i = 0; i < n; i += 1) {
      const x = x0 + rnd() * (x1 - x0);
      const y = y0 - m * 0.04 + rnd() * (y1 - y0);
      const k = (y - y0) / (y1 - y0);
      line(ctx, x, y, x + (rnd() - 0.5) * m * 0.03, y + m * (0.06 + rnd() * 0.06), shade(rnd() < 0.55 ? '#9c8652' : '#5e6c30', 0.06 - k * 0.14 + (rnd() - 0.5) * 0.1), Math.max(0.5, m * 0.012));
    }
    for (let i = 0; i < Math.round(n / 9); i += 1) {
      const x = x0 + rnd() * (x1 - x0);
      const y = y0 + rnd() * (y1 - y0);
      const k = (y - y0) / (y1 - y0);
      smoothShape(ctx, blobPoints(x, y, m * 0.05, m * 0.035, 6, 0.5, rnd), rgba(shade('#56702e', 0.08 - k * 0.16 + (rnd() - 0.5) * 0.08), 0.9));
    }
    ctx.restore();
    // The poles under it showing through, running down the slope.
    for (let i = 1; i < 4; i += 1) {
      const x = x0 + ((x1 - x0) * i) / 4;
      line(ctx, x, y0, x + (rnd() - 0.5) * m * 0.03, y1, rgba('#2e1f10', 0.55), Math.max(0.6, m * 0.022), 'butt');
    }
    rrect(ctx, x0, y0, x1 - x0, y1 - y0, r, null, '#2e2614', Math.max(0.8, m * 0.016));
    line(ctx, x0 + r, y1, x1 - r, y1, rgba('#1e1a10', 0.8), Math.max(0.8, m * 0.03), 'butt');
    // The ridge pole along the high edge, lashed to a post at each corner.
    line(ctx, x0, y0, x1, y0, '#2e1f10', m * 0.065);
    line(ctx, x0, y0 - m * 0.006, x1, y0 - m * 0.006, '#8a6038', m * 0.04);
    for (const s of [-1, 1]) {
      circle(ctx, s * x1, y0, m * 0.055, lit(ctx, s * x1, y0, m * 0.055, '#6e4a2a', 0.16), '#2e1f10', Math.max(0.5, m * 0.012));
      circle(ctx, s * x1, y0, m * 0.024, null, '#c8b48a', Math.max(0.5, m * 0.01));
    }
  },
};
