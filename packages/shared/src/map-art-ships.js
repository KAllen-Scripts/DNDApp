/**
 * Built-in assets of the map creator: ships, boats and the water (map-design.js ASSETS), drawn
 * in code like the rest (map-art-assets.js, which merges these in).
 */
import { TAU, shade, rgba, circle, oval, rect, rrect, poly, line, polyline, blobPoints, smoothShape, radial, glow } from './map-paint.js';
import { shadow, lit, stone, planks, wheel } from './map-art-pieces.js';

export const ART_SHIPS = {
  ship(g) {
    const { ctx, w, h, m, t, rnd } = g;
    const lw = (k) => Math.max(0.5, m * k);
    // The hull, bow at the top: half its width along its length.
    const yb = -h * 0.44, ym = -h * 0.06, ys = h * 0.47, B = w * 0.45, Bs = w * 0.35;
    const hw = (y) => (y <= ym ? B * Math.pow(Math.max(0, 1 - ((ym - y) / (ym - yb)) ** 2), 0.72) : B - (B - Bs) * Math.min(1, (y - ym) / (ys - ym)) ** 2.2);
    const side = [];
    for (let i = 0; i <= 26; i += 1) { const y = ym - (1 - (i / 26) ** 1.6) * (ym - yb); side.push([hw(y), y]); }
    for (let i = 1; i <= 16; i += 1) { const y = ym + ((ys - ym) * i) / 16; side.push([hw(y), y]); }
    const hull = [...side, ...side.slice(1).reverse().map(([x, y]) => [-x, y])];
    const dS = m * 0.032, dR = m * 0.034, inner = (y) => hw(y) - dS - dR;
    const deck = '#a57d50', dark = '#2a1b10', rope = '#b8a072';
    const across = (a, b, x0 = -w / 2, x1 = w / 2) => { const gr = ctx.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
    const down = (a, b, y0, y1) => { const gr = ctx.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
    const mrect = (s, xa, xb, y, hh, fill, stroke = null, l = 1) => rect(ctx, s > 0 ? xa : -xb, y, xb - xa, hh, fill, stroke, l);
    if (g.shadows) for (const k of [1.03, 0.99, 0.95]) {
      ctx.save(); ctx.translate(g.sx * 0.8, g.sy * 0.8); ctx.scale(k, 1 - (1 - k) * 0.3);
      smoothShape(ctx, hull, 'rgba(0,0,0,0.13)'); ctx.restore();
    }
    // Deck planks fore and aft; raised forecastle and quarterdeck; the bulwark's rail and the hull's side.
    const yf = -h * 0.3, yq = h * 0.2;
    ctx.save();
    smoothShape(ctx, hull, null);
    ctx.clip();
    rect(ctx, -w / 2, -h / 2, w, h, deck);
    const pw = m * 0.042, n = Math.ceil((B * 2) / pw), L = m * 0.62, x0 = (-n * pw) / 2, joints = [];
    for (let i = 0; i < n; i += 1) {
      for (let y = yb - rnd() * L; y < ys;) {
        const len = L * (0.6 + rnd() * 0.6);
        rect(ctx, x0 + i * pw, y, pw, len, shade(deck, (rnd() - 0.5) * 0.1));
        joints.push([x0 + i * pw, y + len]);
        y += len;
      }
    }
    ctx.beginPath();
    for (let i = 0; i <= n; i += 1) { ctx.moveTo(x0 + i * pw, yb); ctx.lineTo(x0 + i * pw, ys); }
    for (const [x, y] of joints) { ctx.moveTo(x, y); ctx.lineTo(x + pw, y); }
    ctx.strokeStyle = rgba(dark, 0.55); ctx.lineWidth = m * 0.004; ctx.stroke();
    rect(ctx, -w / 2, -h / 2, w, yf + h / 2, rgba('#ffffff', 0.13));
    rect(ctx, -w / 2, yq, w, h / 2 - yq, rgba('#ffffff', 0.13));
    rect(ctx, -w / 2, yf, w, m * 0.12, down('rgba(0,0,0,0.42)', 'rgba(0,0,0,0)', yf, yf + m * 0.12));
    rect(ctx, -w / 2, yq, w, m * 0.012, rgba('#ffffff', 0.3));
    ctx.save();
    ctx.translate(m * 0.02, m * 0.03);
    smoothShape(ctx, hull, null, 'rgba(0,0,0,0.3)', (dS + dR) * 2);
    ctx.restore();
    smoothShape(ctx, hull, null, dark, (dS + dR) * 2 + lw(0.012));
    smoothShape(ctx, hull, null, across('#946a43', '#5e3d22'), (dS + dR) * 2);
    smoothShape(ctx, hull, null, dark, dS * 2 + lw(0.008));
    smoothShape(ctx, hull, null, across('#5e3d24', '#382313'), dS * 2);
    smoothShape(ctx, hull, null, across('#a07e48', '#6a5230'), dS * 1.1 + lw(0.006));
    smoothShape(ctx, hull, null, across('#5e3d24', '#382313'), dS * 1.1);
    ctx.restore();
    smoothShape(ctx, hull, null, '#1c120a', lw(0.008));
    // Bowsprit, with bitts at its foot.
    const bh = yb + h * 0.075;
    poly(ctx, [[-m * 0.024, bh], [m * 0.024, bh], [m * 0.012, -h * 0.497], [-m * 0.012, -h * 0.497]], across('#a07448', '#5a3a20', -m * 0.024, m * 0.024), dark, lw(0.005));
    for (const y of [-h * 0.488, -h * 0.474, yb + h * 0.012, yb + h * 0.02]) line(ctx, -m * 0.021, y, m * 0.021, y, y < yb ? '#2b2b2b' : rope, lw(0.007), 'butt');
    rect(ctx, -m * 0.06, bh + m * 0.012, m * 0.12, m * 0.022, '#6a4628', dark, lw(0.004));
    for (const s of [-1, 1]) rect(ctx, s * m * 0.05 - m * 0.018, bh + m * 0.004, m * 0.036, m * 0.036, across('#946a43', '#5e3d22', s * m * 0.05 - m * 0.018, s * m * 0.05 + m * 0.018), dark, lw(0.004));
    // Stairs down from the raised decks at both sides, a rail along each edge between them.
    const sw = m * 0.13, sd = m * 0.028, rt = m * 0.026;
    for (const [y0, dir] of [[yf, 1], [yq, -1]]) {
      for (const s of [-1, 1]) {
        const xo = inner(y0 + dir * sd * 2.5) - m * 0.002;
        for (let k = 0; k < 5; k += 1) {
          const y = dir > 0 ? y0 + k * sd : y0 - (k + 1) * sd;
          mrect(s, xo - sw, xo, y, sd, shade(deck, 0.05 - k * 0.055), rgba(dark, 0.8), lw(0.003));
          mrect(s, xo - sw, xo, dir > 0 ? y : y + sd - m * 0.006, m * 0.006, rgba('#ffffff', 0.3));
        }
        mrect(s, xo - sw - m * 0.014, xo - sw, dir > 0 ? y0 : y0 - 5 * sd, 5 * sd, '#5e3d22', dark, lw(0.003));
      }
      const xa = inner(y0) - sw - m * 0.016;
      rect(ctx, -xa, dir > 0 ? y0 - rt : y0, xa * 2, rt, across('#9a6e45', '#5e3d22'), dark, lw(0.005));
      ctx.beginPath();
      for (let i = 1; i < 8; i += 1) { const x = -xa + (xa * 2 * i) / 8; ctx.moveTo(x, dir > 0 ? y0 - rt : y0); ctx.lineTo(x, dir > 0 ? y0 : y0 + rt); }
      ctx.strokeStyle = rgba(dark, 0.6); ctx.lineWidth = lw(0.004); ctx.stroke();
    }
    // The ship's bell on the forecastle.
    const by = yf - rt - m * 0.045;
    rect(ctx, -m * 0.05, by - m * 0.008, m * 0.1, m * 0.016, '#5a3a20', dark, lw(0.003));
    circle(ctx, 0, by, m * 0.02, lit(ctx, 0, by, m * 0.02, '#d4a72c', 0.2), '#6a5214', lw(0.004));
    // Cargo hatch.
    const hy = -h * 0.13, hx = m * 0.1, hh = m * 0.085, co = m * 0.022;
    rect(ctx, -hx - co, hy - hh - co, (hx + co) * 2, (hh + co) * 2, across('#8a6040', '#5e3d22', -hx - co, hx + co), dark, lw(0.006));
    rect(ctx, -hx, hy - hh, hx * 2, hh * 2, '#140d08');
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      ctx.rect(-hx + ((hx * 2) * (i + 0.5)) / 6 - hx * 0.07, hy - hh, hx * 0.14, hh * 2);
      ctx.rect(-hx, hy - hh + ((hh * 2) * (i + 0.5)) / 6 - hh * 0.07, hx * 2, hh * 0.14);
    }
    ctx.fillStyle = '#8a6440'; ctx.fill();
    // Capstan: a drum with bars to push.
    const cy = h * 0.115, cr = m * 0.05;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + 0.35, c = Math.cos(a), sn = Math.sin(a);
      line(ctx, c * cr, cy + sn * cr, c * cr * 2.5, cy + sn * cr * 2.5, dark, lw(0.024));
      line(ctx, c * cr, cy + sn * cr, c * cr * 2.5, cy + sn * cr * 2.5, '#a07448', lw(0.016));
    }
    circle(ctx, 0, cy, cr * 1.08, '#4a3019');
    for (let i = 0; i < 10; i += 1) { const a = (i / 10) * TAU; circle(ctx, Math.cos(a) * cr, cy + Math.sin(a) * cr, cr * 0.17, '#6e4a2c', dark, lw(0.002)); }
    circle(ctx, 0, cy, cr * 0.84, lit(ctx, 0, cy, cr * 0.84, '#8a5d36', 0.16), dark, lw(0.004));
    circle(ctx, 0, cy, cr * 0.58, null, '#3a3a3a', lw(0.007));
    circle(ctx, 0, cy, cr * 0.22, lit(ctx, 0, cy, cr * 0.22, '#7a7e84', 0.2));
    // Binnacle and wheel on the quarterdeck.
    const wy = h * 0.378, R = m * 0.08, kk = 0.42;
    rrect(ctx, -m * 0.03, wy - m * 0.16, m * 0.06, m * 0.05, m * 0.01, '#6a4628', dark, lw(0.004));
    circle(ctx, 0, wy - m * 0.135, m * 0.017, lit(ctx, 0, wy - m * 0.135, m * 0.017, '#d4a72c', 0.2), '#6a5214', lw(0.003));
    rect(ctx, -m * 0.022, wy - m * 0.07, m * 0.044, m * 0.07, '#5a3a20', dark, lw(0.004));
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU + Math.PI / 8, ex = Math.cos(a) * R * 1.36, ey = wy + Math.sin(a) * R * kk * 1.36;
      line(ctx, 0, wy, ex, ey, dark, lw(0.014));
      line(ctx, 0, wy, ex, ey, '#a07448', lw(0.008));
      circle(ctx, ex, ey, m * 0.009, '#8a5d36', dark, lw(0.003));
    }
    oval(ctx, 0, wy, R, R * kk, 0, null, dark, lw(0.022));
    oval(ctx, 0, wy, R, R * kk, 0, null, '#8a5d36', lw(0.013));
    circle(ctx, 0, wy, m * 0.016, lit(ctx, 0, wy, m * 0.016, '#d4a72c', 0.2), '#6a5214', lw(0.003));
    // Cannons run out through ports in the rail, lashed to it.
    for (const y of [-h * 0.175, -h * 0.085, h * 0.035, h * 0.125]) {
      for (const s of [-1, 1]) {
        const xi = inner(y), xo = hw(y) - dS * 0.35, c0 = xi - m * 0.15, c1 = xi - m * 0.016, xb = c0 + m * 0.014;
        for (const d of [-1, 1]) line(ctx, s * (c0 + m * 0.03), y + d * m * 0.03, s * (xi - m * 0.003), y + d * m * 0.07, rope, lw(0.005));
        for (const yy of [y - m * 0.047, y + m * 0.047]) for (const xx of [c0 + m * 0.03, c1 - m * 0.026]) mrect(s, xx - m * 0.018, xx + m * 0.018, yy - m * 0.009, m * 0.018, '#2e2419', '#17110b', lw(0.002));
        mrect(s, c0, c1, y - m * 0.04, m * 0.08, across(s > 0 ? '#7a5232' : '#6e4a2c', s > 0 ? '#5e3d22' : '#4e3220', -c1, c1), dark, lw(0.004));
        mrect(s, xi - m * 0.002, xi + dR, y - m * 0.03, m * 0.06, '#120c07');
        ctx.save();
        ctx.translate(s * xb, y);
        ctx.scale(s, 1);
        const Lb = xo - xb;
        circle(ctx, -m * 0.03, 0, m * 0.011, '#1e1e22', '#08080a', lw(0.003));
        ctx.beginPath();
        ctx.arc(0, 0, m * 0.023, Math.PI / 2, Math.PI * 1.5);
        ctx.lineTo(Lb - m * 0.016, -m * 0.016);
        ctx.lineTo(Lb - m * 0.013, -m * 0.02);
        ctx.lineTo(Lb, -m * 0.02);
        ctx.lineTo(Lb, m * 0.02);
        ctx.lineTo(Lb - m * 0.013, m * 0.02);
        ctx.lineTo(Lb - m * 0.016, m * 0.016);
        ctx.closePath();
        ctx.fillStyle = down('#74747c', '#0c0c0e', -m * 0.024, m * 0.024); ctx.fill();
        ctx.strokeStyle = '#060608'; ctx.lineWidth = lw(0.004); ctx.stroke();
        for (const u of [0.18, 0.5]) line(ctx, Lb * u, -m * 0.021 + u * m * 0.004, Lb * u, m * 0.021 - u * m * 0.004, '#060608', lw(0.005), 'butt');
        line(ctx, m * 0.004, -m * 0.011, Lb - m * 0.02, -m * 0.008, rgba('#ffffff', 0.3), lw(0.004));
        ctx.restore();
      }
    }
    // Rigging: stays along the middle, shrouds out to deadeyes on the hull's sides.
    const masts = [[-h * 0.215, m * 0.04, 0.92, m * 0.066], [-h * 0.01, m * 0.047, 1, m * 0.074], [h * 0.262, m * 0.035, 0.78, m * 0.056]];
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.49);
    for (const [y] of masts) ctx.lineTo(0, y);
    const eyes = [];
    for (const [y] of masts) for (const s of [-1, 1]) for (let k = 0; k < 3; k += 1) { const yy = y + m * (0.03 + k * 0.045), ex = s * (hw(yy) - dS * 0.55); ctx.moveTo(0, y); ctx.lineTo(ex, yy); eyes.push([ex, yy]); }
    ctx.strokeStyle = rgba(dark, 0.5); ctx.lineWidth = lw(0.004); ctx.stroke();
    for (const [x, y] of eyes) circle(ctx, x, y, m * 0.008, '#1a120b');
    // Yards across with the sails furled on them (puffed between the gaskets), masts through them.
    for (const [y, r, k, th] of masts) {
      const half = hw(y) * k, yy = y - r * 0.45, nb = 7, xa = half * 0.86;
      ctx.save(); ctx.translate(m * 0.022, m * 0.034);
      rrect(ctx, -xa, yy - th * 0.45, xa * 2, th * 0.95, th * 0.45, 'rgba(0,0,0,0.22)');
      ctx.restore();
      poly(ctx, [[-half, yy - th * 0.09], [-half * 0.5, yy - th * 0.15], [half * 0.5, yy - th * 0.15], [half, yy - th * 0.09], [half, yy + th * 0.09], [half * 0.5, yy + th * 0.15], [-half * 0.5, yy + th * 0.15], [-half, yy + th * 0.09]], down('#9a6e44', '#4e3220', yy - th * 0.15, yy + th * 0.15), dark, lw(0.004));
      const top = [], bot = [];
      for (let i = 0; i <= nb * 2; i += 1) {
        const x = -xa + (xa * 2 * i) / (nb * 2), taper = 1 - (x / xa) ** 4 * 0.5, q = (i % 2 ? 0.5 : 0.36) * taper * (0.92 + rnd() * 0.16);
        top.push([x, yy - th * q]);
        bot.push([x, yy + th * q * 1.06]);
      }
      smoothShape(ctx, [...top, ...bot.reverse()], down(shade(t, 0.1), shade(t, -0.22), yy - th * 0.5, yy + th * 0.5), shade(t, -0.45), lw(0.004));
      ctx.beginPath();
      for (let i = 1; i < nb * 2; i += 2) { const x = -xa + (xa * 2 * i) / (nb * 2); ctx.moveTo(x - th * 0.25, yy - th * 0.32); ctx.quadraticCurveTo(x, yy - th * 0.44, x + th * 0.25, yy - th * 0.3); }
      ctx.strokeStyle = rgba('#ffffff', 0.4); ctx.lineWidth = lw(0.004); ctx.stroke();
      ctx.beginPath();
      for (let i = 1; i < nb * 2; i += 2) { const x = -xa + (xa * 2 * i) / (nb * 2); ctx.moveTo(x - th * 0.22, yy + th * 0.2); ctx.quadraticCurveTo(x, yy + th * 0.34, x + th * 0.2, yy + th * 0.18); }
      ctx.strokeStyle = rgba(shade(t, -0.45), 0.55); ctx.lineWidth = lw(0.003); ctx.stroke();
      ctx.beginPath();
      for (let i = 2; i < nb * 2; i += 2) { const x = -xa + (xa * 2 * i) / (nb * 2); ctx.moveTo(x - th * 0.06, yy - th * 0.42); ctx.lineTo(x + th * 0.06, yy + th * 0.44); }
      ctx.strokeStyle = '#6a5236'; ctx.lineWidth = lw(0.006); ctx.stroke();
      circle(ctx, 0, y, r, lit(ctx, 0, y, r, '#8a5d36', 0.16), dark, lw(0.005));
      circle(ctx, 0, y, r * 0.74, null, '#3a3a3a', lw(0.007));
      circle(ctx, 0, y, r * 0.3, '#5e3e22');
    }
    // Stern lantern.
    const ly = ys - dS - dR * 0.5;
    poly(ctx, Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * TAU) * m * 0.027, ly + Math.sin((i / 6) * TAU) * m * 0.027]), '#2b2b2b');
    circle(ctx, 0, ly, m * 0.018, radial(ctx, 0, ly, m * 0.018, '#fff2b0', '#e0a040'));
  },
  ship_small(g) {
    const { ctx, w, h, m, t, rnd } = g;
    const lw = (k) => Math.max(0.5, m * k);
    const yb = -h * 0.445, ym = h * 0.06, ys = h * 0.462, B = w * 0.44, Bs = w * 0.28;
    const hw = (y) => (y <= ym ? B * Math.pow(Math.max(0, 1 - ((ym - y) / (ym - yb)) ** 2), 0.8) : B - (B - Bs) * Math.min(1, (y - ym) / (ys - ym)) ** 1.8);
    const side = [];
    for (let i = 0; i <= 24; i += 1) { const y = ym - (1 - (i / 24) ** 1.6) * (ym - yb); side.push([hw(y), y]); }
    for (let i = 1; i <= 10; i += 1) { const y = ym + ((ys - ym) * i) / 10; side.push([hw(y), y]); }
    side.push([Bs * 0.72, ys + h * 0.012], [Bs * 0.3, ys + h * 0.018]);
    const hull = [...side, ...side.slice(1).reverse().map(([x, y]) => [-x, y])];
    const dS = m * 0.045, dR = m * 0.05, inner = (y) => hw(y) - dS - dR;
    const deck = '#a88152', dark = '#2a1b10';
    const across = (a, b, x0 = -w / 2, x1 = w / 2) => { const gr = ctx.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
    const down = (a, b, y0, y1) => { const gr = ctx.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
    if (g.shadows) for (const k of [1.03, 0.99, 0.95]) {
      ctx.save(); ctx.translate(g.sx * 0.6, g.sy * 0.6); ctx.scale(k, 1 - (1 - k) * 0.3);
      smoothShape(ctx, hull, 'rgba(0,0,0,0.13)'); ctx.restore();
    }
    ctx.save();
    smoothShape(ctx, hull, null);
    ctx.clip();
    rect(ctx, -w / 2, -h / 2, w, h, deck);
    const pw = m * 0.08, n = Math.ceil((B * 2) / pw), L = m * 0.9, x0 = (-n * pw) / 2, joints = [];
    for (let i = 0; i < n; i += 1) {
      for (let y = yb - rnd() * L; y < ys + h * 0.02;) {
        const len = L * (0.6 + rnd() * 0.6);
        rect(ctx, x0 + i * pw, y, pw, len, shade(deck, (rnd() - 0.5) * 0.1));
        joints.push([x0 + i * pw, y + len]);
        y += len;
      }
    }
    ctx.beginPath();
    for (let i = 0; i <= n; i += 1) { ctx.moveTo(x0 + i * pw, yb); ctx.lineTo(x0 + i * pw, h / 2); }
    for (const [x, y] of joints) { ctx.moveTo(x, y); ctx.lineTo(x + pw, y); }
    ctx.strokeStyle = rgba(dark, 0.55); ctx.lineWidth = m * 0.007; ctx.stroke();
    // The cockpit: a sunken well at the stern with benches round it.
    const ky0 = h * 0.27, ky1 = h * 0.415, kx = inner(h * 0.34) - m * 0.06;
    rrect(ctx, -kx, ky0, kx * 2, ky1 - ky0, m * 0.06, across('#8a6440', '#5e3d22', -kx, kx), dark, lw(0.008));
    rrect(ctx, -kx + m * 0.09, ky0 + m * 0.02, kx * 2 - m * 0.18, ky1 - ky0 - m * 0.11, m * 0.04, '#4e3420', rgba(dark, 0.8), lw(0.006));
    rect(ctx, -kx + m * 0.09, ky0 + m * 0.02, kx * 2 - m * 0.18, m * 0.04, 'rgba(0,0,0,0.3)');
    ctx.save();
    ctx.translate(m * 0.03, m * 0.04);
    smoothShape(ctx, hull, null, 'rgba(0,0,0,0.3)', (dS + dR) * 2);
    ctx.restore();
    smoothShape(ctx, hull, null, dark, (dS + dR) * 2 + lw(0.016));
    smoothShape(ctx, hull, null, across('#946a43', '#5e3d22'), (dS + dR) * 2);
    smoothShape(ctx, hull, null, dark, dS * 2 + lw(0.012));
    smoothShape(ctx, hull, null, across('#4a6670', '#26363e'), dS * 2);
    smoothShape(ctx, hull, null, across('#d8cfb8', '#9a937e'), dS * 1.05 + lw(0.008));
    smoothShape(ctx, hull, null, across('#4a6670', '#26363e'), dS * 1.05);
    ctx.restore();
    smoothShape(ctx, hull, null, '#1c120a', lw(0.012));
    // Bowsprit, forehatch, cleats, tiller.
    poly(ctx, [[-m * 0.03, yb + h * 0.05], [m * 0.03, yb + h * 0.05], [m * 0.017, -h * 0.497], [-m * 0.017, -h * 0.497]], across('#a07448', '#5a3a20', -m * 0.03, m * 0.03), dark, lw(0.008));
    line(ctx, -m * 0.028, yb + h * 0.012, m * 0.028, yb + h * 0.012, '#b8a072', lw(0.012), 'butt');
    const hy = -h * 0.29, hx = m * 0.12, hh = m * 0.1;
    rect(ctx, -hx, hy - hh, hx * 2, hh * 2, across('#8a6040', '#5e3d22', -hx, hx), dark, lw(0.01));
    planks(g, -hx + m * 0.035, hy - hh + m * 0.035, hx * 2 - m * 0.07, hh * 2 - m * 0.07, '#9a7246', 3, true, 0.25);
    rect(ctx, -hx + m * 0.035, hy - hh + m * 0.035, hx * 2 - m * 0.07, hh * 2 - m * 0.07, null, dark, lw(0.008));
    circle(ctx, 0, hy + hh * 0.35, m * 0.028, null, '#2e2e2e', lw(0.012));
    for (const [x, y] of [[-1, h * 0.06], [1, h * 0.06], [-1, h * 0.2], [1, h * 0.2]]) {
      const cx = x * (inner(y) - m * 0.03);
      rrect(ctx, cx - m * 0.016, y - m * 0.05, m * 0.032, m * 0.1, m * 0.012, '#4a4e54', '#1e2125', lw(0.006));
    }
    rect(ctx, -m * 0.04, ys - dS - dR - m * 0.03, m * 0.08, m * 0.06, '#3e2a18', dark, lw(0.008));
    poly(ctx, [[-m * 0.025, ys - dS - dR - m * 0.01], [m * 0.025, ys - dS - dR - m * 0.01], [m * 0.015, h * 0.3], [-m * 0.015, h * 0.3]], across('#a07448', '#5e3d22', -m * 0.025, m * 0.025), dark, lw(0.008));
    circle(ctx, 0, h * 0.3, m * 0.026, lit(ctx, 0, h * 0.3, m * 0.026, '#7a5232', 0.15), dark, lw(0.008));
    // A coil of rope by the mast.
    const rc = [-w * 0.2, -h * 0.07];
    ctx.beginPath();
    for (let i = 0; i <= 40; i += 1) { const a = i * 0.55, r = m * (0.02 + i * 0.0018); ctx.lineTo(rc[0] + Math.cos(a) * r, rc[1] + Math.sin(a) * r); }
    ctx.strokeStyle = '#6a5230'; ctx.lineWidth = lw(0.022); ctx.stroke();
    ctx.strokeStyle = '#c9ad78'; ctx.lineWidth = lw(0.013); ctx.stroke();
    // Stays and shrouds, the boom with its sail furled along it, the mast.
    const my = -h * 0.165, mr = m * 0.065, be = [m * 0.04, h * 0.25];
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.49); ctx.lineTo(0, my);
    for (const s of [-1, 1]) for (const k of [0.015, 0.06]) { ctx.moveTo(0, my); ctx.lineTo(s * (hw(my + h * k) - dS * 0.5), my + h * k); }
    ctx.strokeStyle = rgba(dark, 0.6); ctx.lineWidth = lw(0.008); ctx.stroke();
    for (const s of [-1, 1]) for (const k of [0.015, 0.06]) circle(ctx, s * (hw(my + h * k) - dS * 0.5), my + h * k, m * 0.014, '#1a120b');
    const ang = Math.atan2(be[1] - my, be[0]), len = Math.hypot(be[0], be[1] - my), th = m * 0.12, nb = 6;
    ctx.save();
    ctx.translate(0, my);
    ctx.rotate(ang);
    ctx.save(); ctx.rotate(-ang); ctx.translate(m * 0.03, m * 0.045); ctx.rotate(ang);
    rrect(ctx, mr, -th * 0.45, len * 0.95 - mr, th * 0.92, th * 0.45, 'rgba(0,0,0,0.22)');
    ctx.restore();
    poly(ctx, [[0, -th * 0.12], [len, -th * 0.09], [len, th * 0.09], [0, th * 0.12]], down('#9a6e44', '#4e3220', -th * 0.12, th * 0.12), dark, lw(0.006));
    const xa = mr * 0.8, xb = len * 0.92, top = [], bot = [];
    for (let i = 0; i <= nb * 2; i += 1) {
      const x = xa + ((xb - xa) * i) / (nb * 2), taper = 1 - ((x - xa) / (xb - xa)) ** 3 * 0.45, q = (i % 2 ? 0.5 : 0.36) * taper * (0.92 + rnd() * 0.16);
      top.push([x, -th * q]);
      bot.push([x, th * q * 1.06]);
    }
    smoothShape(ctx, [...top, ...bot.reverse()], down(shade(t, 0.1), shade(t, -0.22), -th * 0.5, th * 0.5), shade(t, -0.45), lw(0.006));
    ctx.beginPath();
    for (let i = 1; i < nb * 2; i += 2) { const x = xa + ((xb - xa) * i) / (nb * 2); ctx.moveTo(x - th * 0.25, -th * 0.3); ctx.quadraticCurveTo(x, -th * 0.42, x + th * 0.25, -th * 0.28); }
    ctx.strokeStyle = rgba('#ffffff', 0.4); ctx.lineWidth = lw(0.006); ctx.stroke();
    ctx.beginPath();
    for (let i = 2; i < nb * 2; i += 2) { const x = xa + ((xb - xa) * i) / (nb * 2); ctx.moveTo(x - th * 0.06, -th * 0.42); ctx.lineTo(x + th * 0.06, th * 0.44); }
    ctx.strokeStyle = '#6a5236'; ctx.lineWidth = lw(0.01); ctx.stroke();
    ctx.restore();
    circle(ctx, 0, my, mr, lit(ctx, 0, my, mr, '#8a5d36', 0.16), dark, lw(0.01));
    circle(ctx, 0, my, mr * 0.72, null, '#3a3a3a', lw(0.012));
    circle(ctx, 0, my, mr * 0.3, '#5e3e22');
  },
  longship(g) {
    const { ctx, w, h, m, t, rnd } = g;
    const lw = (k) => Math.max(0.5, m * k);
    const yb = -h * 0.405, ys = h * 0.415, yc = (yb + ys) / 2, B = w * 0.36;
    const hw = (y) => B * Math.pow(Math.max(0, 1 - Math.abs((y - yc) / ((ys - yb) / 2)) ** 2.3), 0.85);
    const side = [];
    for (let i = 0; i <= 40; i += 1) { const y = yc + (Math.sin((i / 40 - 0.5) * Math.PI) * (ys - yb)) / 2; side.push([hw(y), y]); }
    const hull = [...side, ...side.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
    const dR = m * 0.06, inner = (y) => hw(y) - dR, dark = '#24170d', wood = '#7a5232';
    const down = (a, b, y0, y1) => { const gr = ctx.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
    if (g.shadows) for (const k of [1.03, 0.99, 0.95]) {
      ctx.save(); ctx.translate(g.sx * 0.6, g.sy * 0.6); ctx.scale(k, 1 - (1 - k) * 0.3);
      smoothShape(ctx, hull, 'rgba(0,0,0,0.13)'); ctx.restore();
    }
    // Inside the open hull: strakes running to both ends, rowing benches across.
    ctx.save();
    smoothShape(ctx, hull, null);
    ctx.clip();
    rect(ctx, -w / 2, -h / 2, w, h, '#8a6340');
    ctx.beginPath();
    for (const k of [0.82, 0.64, 0.46, 0.28, 0.1]) {
      for (const s of [-1, 1]) side.forEach(([x, y], i) => (i ? ctx.lineTo(s * x * k, y) : ctx.moveTo(s * x * k, y)));
    }
    ctx.strokeStyle = rgba(dark, 0.45); ctx.lineWidth = m * 0.01; ctx.stroke();
    ctx.save();
    ctx.translate(m * 0.035, m * 0.05);
    smoothShape(ctx, hull, null, 'rgba(0,0,0,0.32)', dR * 2 + m * 0.03);
    ctx.restore();
    smoothShape(ctx, hull, null, dark, dR * 2 + lw(0.02));
    smoothShape(ctx, hull, null, wood, dR * 2);
    smoothShape(ctx, hull, null, '#5e3e24', dR * 0.9);
    ctx.restore();
    smoothShape(ctx, hull, null, dark, lw(0.014));
    for (let y = -h * 0.32; y <= h * 0.33; y += h * 0.058) {
      if (Math.abs(y + h * 0.02) < h * 0.04) continue;
      const x = inner(y) + dR * 0.3;
      rect(ctx, -x, y - m * 0.032, x * 2, m * 0.064, '#9a7048', dark, lw(0.01));
      line(ctx, -x, y - m * 0.02, x, y - m * 0.02, rgba('#ffffff', 0.18), lw(0.01), 'butt');
    }
    // The steering oar on the right, at the back.
    const sy0 = h * 0.29, sxo = hw(h * 0.33) + m * 0.035;
    line(ctx, sxo, sy0 + h * 0.01, sxo - m * 0.2, sy0 + h * 0.012, '#5a3a20', lw(0.035));
    poly(ctx, [[sxo - m * 0.03, sy0], [sxo + m * 0.03, sy0], [sxo + m * 0.05, sy0 + h * 0.1], [sxo, sy0 + h * 0.125], [sxo - m * 0.04, sy0 + h * 0.1]], lit(ctx, sxo, sy0 + h * 0.06, h * 0.07, '#8a5d36', 0.12), dark, lw(0.01));
    // Shields along both rails, painted.
    const cols = [t, '#e8dcc0', '#c9a640', t, '#3e5a7a', '#e8dcc0', t, '#2f5a3a'];
    const r = m * 0.088;
    let i = 0;
    for (let y = -h * 0.29; y <= h * 0.255; y += r * 1.8) {
      for (const s of [-1, 1]) {
        const x = s * (hw(y) - dR * 0.15), c = cols[(i * 3 + (s > 0 ? 5 : 0)) % cols.length];
        let c2 = cols[(i * 5 + 2 + (s > 0 ? 3 : 0)) % cols.length];
        if (c2 === c) c2 = c === '#e8dcc0' ? t : '#e8dcc0';
        circle(ctx, x, y, r, c, dark, lw(0.012));
        const kind = (i + (s > 0 ? 1 : 0)) % 3;
        ctx.beginPath();
        if (kind === 0) { ctx.moveTo(x, y); ctx.arc(x, y, r * 0.93, -Math.PI / 2, Math.PI / 2); }
        if (kind === 1) for (const a of [0, Math.PI]) { ctx.moveTo(x, y); ctx.arc(x, y, r * 0.93, a, a + Math.PI / 2); }
        ctx.fillStyle = c2; ctx.fill();
        if (kind === 2) circle(ctx, x, y, r * 0.62, null, c2, r * 0.24);
        circle(ctx, x, y, r, radial(ctx, x, y, r, 'rgba(255,255,255,0.16)', 'rgba(0,0,0,0.22)', x - r * 0.4, y - r * 0.4), '#3e3024', lw(0.02));
        circle(ctx, x, y, r * 0.3, lit(ctx, x, y, r * 0.3, '#a8aeb6', 0.22), '#3a3e44', lw(0.006));
      }
      i += 1;
    }
    // Mast with its striped sail furled on the yard.
    const my = -h * 0.02, mr = m * 0.06, half = w * 0.47, th = m * 0.16, nb = 7, xa = half * 0.88;
    rrect(ctx, -m * 0.05, my - h * 0.05, m * 0.1, h * 0.1, m * 0.04, '#6a4628', dark, lw(0.01));
    ctx.save(); ctx.translate(m * 0.035, m * 0.06);
    rrect(ctx, -xa, my - th * 0.45, xa * 2, th * 0.92, th * 0.45, 'rgba(0,0,0,0.24)');
    ctx.restore();
    poly(ctx, [[-half, my - th * 0.1], [-half * 0.5, my - th * 0.15], [half * 0.5, my - th * 0.15], [half, my - th * 0.1], [half, my + th * 0.1], [half * 0.5, my + th * 0.15], [-half * 0.5, my + th * 0.15], [-half, my + th * 0.1]], down('#9a6e44', '#4e3220', my - th * 0.15, my + th * 0.15), dark, lw(0.008));
    const top = [], bot = [];
    for (let k = 0; k <= nb * 2; k += 1) {
      const x = -xa + (xa * 2 * k) / (nb * 2), taper = 1 - (x / xa) ** 4 * 0.5, q = (k % 2 ? 0.5 : 0.36) * taper * (0.93 + rnd() * 0.14);
      top.push([x, my - th * q]);
      bot.push([x, my + th * q * 1.06]);
    }
    const bundle = [...top, ...bot.reverse()];
    ctx.save();
    smoothShape(ctx, bundle, '#e8dcc0');
    ctx.clip();
    for (let k = 0; k < nb; k += 2) rect(ctx, -xa + (xa * 2 * k) / nb, my - th, (xa * 2) / nb, th * 2, t);
    rect(ctx, -half, my - th, half * 2, th * 2, down('rgba(255,255,255,0.18)', 'rgba(0,0,0,0.3)', my - th * 0.5, my + th * 0.5));
    ctx.beginPath();
    for (let k = 1; k < nb * 2; k += 2) { const x = -xa + (xa * 2 * k) / (nb * 2); ctx.moveTo(x - th * 0.25, my - th * 0.3); ctx.quadraticCurveTo(x, my - th * 0.42, x + th * 0.25, my - th * 0.28); }
    ctx.strokeStyle = rgba('#ffffff', 0.35); ctx.lineWidth = lw(0.008); ctx.stroke();
    ctx.restore();
    smoothShape(ctx, bundle, null, shade(t, -0.45), lw(0.008));
    ctx.beginPath();
    for (let k = 2; k < nb * 2; k += 2) { const x = -xa + (xa * 2 * k) / (nb * 2); ctx.moveTo(x - th * 0.06, my - th * 0.42); ctx.lineTo(x + th * 0.06, my + th * 0.44); }
    ctx.strokeStyle = '#5a4430'; ctx.lineWidth = lw(0.012); ctx.stroke();
    circle(ctx, 0, my, mr, lit(ctx, 0, my, mr, '#8a5d36', 0.16), dark, lw(0.01));
    circle(ctx, 0, my, mr * 0.4, '#5e3e22');
    // The stem rises into a dragon's neck and head; the stern post curls round.
    const ny = yb + h * 0.012;
    poly(ctx, [[-m * 0.05, ny + h * 0.02], [m * 0.05, ny + h * 0.02], [m * 0.042, -h * 0.437], [-m * 0.042, -h * 0.437]], down(wood, '#6a4628', -h * 0.44, ny), dark, lw(0.01));
    ctx.beginPath();
    for (let k = 0; k < 5; k += 1) { const y = -h * 0.433 + k * h * 0.0065; ctx.moveTo(-m * 0.035, y); ctx.quadraticCurveTo(0, y + h * 0.006, m * 0.035, y); }
    ctx.strokeStyle = rgba(dark, 0.6); ctx.lineWidth = lw(0.008); ctx.stroke();
    const hr = [[0, -h * 0.4985], [m * 0.028, -h * 0.497], [m * 0.044, -h * 0.49], [m * 0.048, -h * 0.481], [m * 0.062, -h * 0.471], [m * 0.074, -h * 0.461], [m * 0.15, -h * 0.452], [m * 0.13, -h * 0.447], [m * 0.08, -h * 0.448], [m * 0.06, -h * 0.441], [m * 0.042, -h * 0.436]];
    const headPts = [...hr, ...hr.slice(1).reverse().map(([x, y]) => [-x, y])];
    poly(ctx, headPts, lit(ctx, 0, -h * 0.47, m * 0.14, '#94643a', 0.16), dark, lw(0.01));
    for (const s of [-1, 1]) {
      poly(ctx, [[s * m * 0.074, -h * 0.461], [s * m * 0.15, -h * 0.452], [s * m * 0.13, -h * 0.447], [s * m * 0.08, -h * 0.449]], t, dark, lw(0.008));
      for (let k = 0; k < 3; k += 1) poly(ctx, [[s * m * 0.044, -h * (0.4895 - k * 0.0042)], [s * m * 0.03, -h * (0.4875 - k * 0.0042)], [s * m * 0.046, -h * (0.4855 - k * 0.0042)]], '#f2ede0');
      oval(ctx, s * m * 0.042, -h * 0.4705, m * 0.02, m * 0.014, s * 0.5, '#f2d14a', dark, lw(0.005));
      oval(ctx, s * m * 0.042, -h * 0.4705, m * 0.005, m * 0.012, s * 0.5, '#1a1a1a');
      circle(ctx, s * m * 0.014, -h * 0.4945, m * 0.007, '#1a1a1a');
    }
    line(ctx, 0, -h * 0.478, 0, -h * 0.444, rgba(dark, 0.6), lw(0.01));
    const tail = [];
    for (let k = 0; k <= 26; k += 1) { const a = -Math.PI / 2 + k * 0.32, rr = m * 0.08 * (1 - k / 34); tail.push([Math.cos(a) * rr, h * 0.452 + Math.sin(a) * rr + (k === 0 ? -h * 0.03 : 0)]); }
    polyline(ctx, tail, dark, lw(0.07));
    polyline(ctx, tail, wood, lw(0.048));
    polyline(ctx, tail.slice(0, 12).map(([x, y]) => [x - m * 0.008, y - m * 0.008]), rgba('#ffffff', 0.2), lw(0.012));
  },
  mast(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.4, m * 0.4, 3);
    for (const a of [0.5, 1.9, 3.3, 4.4, 5.6]) line(ctx, Math.cos(a) * m * 0.3, Math.sin(a) * m * 0.3, Math.cos(a) * m * 0.49, Math.sin(a) * m * 0.49, rgba('#c9b48a', 0.85), Math.max(0.6, m * 0.022));
    circle(ctx, 0, 0, m * 0.37, null, '#4a3019', Math.max(1, m * 0.075));
    circle(ctx, 0, 0, m * 0.37, null, '#7a5232', Math.max(0.8, m * 0.05));
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU + 0.3;
      circle(ctx, Math.cos(a) * m * 0.37, Math.sin(a) * m * 0.37, m * 0.035, '#c8a878', '#5a3a1a', Math.max(0.5, m * 0.01));
    }
    circle(ctx, 0, 0, m * 0.26, lit(ctx, 0, 0, m * 0.26, '#8a5d33', 0.14), '#4a3019', Math.max(0.8, m * 0.03));
    circle(ctx, 0, 0, m * 0.21, null, '#3a3a3a', Math.max(0.8, m * 0.04));
    circle(ctx, 0, 0, m * 0.13, null, rgba('#4a3019', 0.6), Math.max(0.5, m * 0.012));
    circle(ctx, 0, 0, m * 0.06, '#6e4a2a');
  },
  sail(g) {
    const { ctx, w, h, m, t } = g;
    shadow(g, 'rect', w * 0.45, h * 0.38, 2.5);
    const lw = (k) => Math.max(0.5, m * k);
    const yy = -h * 0.22, xs = w * 0.44, cx = w * 0.4, cyl = yy + h * 0.3, fy = h * 0.47;
    for (const s of [-1, 1]) {
      line(ctx, s * w * 0.47, yy, s * w * 0.495, -h * 0.48, rgba('#c9b48a', 0.95), lw(0.022));
      line(ctx, s * cx, cyl, s * w * 0.495, h * 0.4, rgba('#c9b48a', 0.95), lw(0.022));
    }
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(-xs, yy);
      ctx.lineTo(xs, yy);
      ctx.quadraticCurveTo(w * 0.47, yy + h * 0.16, cx, cyl);
      ctx.bezierCurveTo(w * 0.25, fy + h * 0.02, -w * 0.25, fy + h * 0.02, -cx, cyl);
      ctx.quadraticCurveTo(-w * 0.47, yy + h * 0.16, -xs, yy);
      ctx.closePath();
    };
    outline();
    const gr = ctx.createLinearGradient(0, yy, 0, fy);
    gr.addColorStop(0, shade(t, -0.1)); gr.addColorStop(0.18, shade(t, 0.06)); gr.addColorStop(0.6, shade(t, 0)); gr.addColorStop(1, shade(t, -0.17));
    ctx.fillStyle = gr; ctx.fill();
    ctx.save();
    outline();
    ctx.clip();
    ctx.fillStyle = radial(ctx, -w * 0.12, yy + h * 0.25, w * 0.4, rgba('#ffffff', 0.22), rgba('#ffffff', 0));
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.beginPath();
    for (let i = 1; i < 12; i += 1) {
      const u = -1 + (2 * i) / 12, x0 = u * xs, x1 = u * cx * 0.92;
      ctx.moveTo(x0, yy);
      ctx.quadraticCurveTo(u * xs * 1.03, yy + h * 0.3, x1, yy + (fy - yy) * (1 - u * u * 0.55) + h * 0.04);
    }
    ctx.strokeStyle = rgba(shade(t, -0.35), 0.5); ctx.lineWidth = lw(0.01); ctx.stroke();
    for (const k of [0.2, 0.36]) {
      ctx.beginPath();
      ctx.moveTo(-xs * 0.98, yy + h * k * 0.5);
      ctx.quadraticCurveTo(0, yy + h * (k + 0.24), xs * 0.98, yy + h * k * 0.5);
      ctx.strokeStyle = rgba(shade(t, -0.3), 0.45); ctx.lineWidth = lw(0.012); ctx.stroke();
      for (let i = 1; i < 14; i += 1) {
        const u = -1 + (2 * i) / 14, x = u * xs * 0.95, y = (1 - u) * (1 - u) * (yy + h * k * 0.5) + 2 * (1 - u) * u * 0 + 0;
        const p = (u + 1) / 2, qy = (1 - p) * (1 - p) * (yy + h * k * 0.5) + 2 * (1 - p) * p * (yy + h * (k + 0.24)) + p * p * (yy + h * k * 0.5);
        circle(ctx, x, qy, lw(0.012), shade(t, -0.35));
        void y;
      }
    }
    ctx.restore();
    outline();
    ctx.strokeStyle = shade(t, -0.42); ctx.lineWidth = lw(0.022); ctx.stroke();
    // The yard, with the mast's top in the middle.
    poly(ctx, [[-w * 0.485, yy - m * 0.025], [-w * 0.3, yy - m * 0.045], [w * 0.3, yy - m * 0.045], [w * 0.485, yy - m * 0.025], [w * 0.485, yy + m * 0.025], [w * 0.3, yy + m * 0.045], [-w * 0.3, yy + m * 0.045], [-w * 0.485, yy + m * 0.025]], (() => { const yg = ctx.createLinearGradient(0, yy - m * 0.045, 0, yy + m * 0.045); yg.addColorStop(0, '#a07448'); yg.addColorStop(1, '#4e3220'); return yg; })(), '#2a1b10', lw(0.012));
    for (const x of [-w * 0.45, -w * 0.16, w * 0.16, w * 0.45]) line(ctx, x, yy - m * 0.04, x, yy + m * 0.04, '#2b2b2b', lw(0.022), 'butt');
    circle(ctx, 0, yy, m * 0.1, lit(ctx, 0, yy, m * 0.1, '#8a5d36', 0.16), '#2a1b10', lw(0.012));
    circle(ctx, 0, yy, m * 0.06, null, '#3a3a3a', lw(0.016));
  },
  helm(g) {
    const { ctx, m } = g;
    const lw = (k) => Math.max(0.5, m * k);
    shadow(g, 'round', m * 0.44, m * 0.34, 1.2);
    rrect(ctx, -m * 0.24, -m * 0.16, m * 0.48, m * 0.4, m * 0.05, lit(ctx, 0, 0, m * 0.4, '#6e4a2a', 0.08), '#3e2914', lw(0.02));
    rrect(ctx, -m * 0.08, -m * 0.3, m * 0.16, m * 0.3, m * 0.03, lit(ctx, 0, -m * 0.2, m * 0.15, '#6a4628', 0.1), '#2e1d10', lw(0.015));
    const cy = m * 0.03, R = m * 0.33, k = 0.6;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU + Math.PI / 8, ex = Math.cos(a) * R * 1.42, ey = cy + Math.sin(a) * R * k * 1.42;
      line(ctx, 0, cy, ex, ey, '#2e1d10', lw(0.055));
      line(ctx, 0, cy, ex, ey, '#b07e4c', lw(0.032));
      oval(ctx, ex, ey, m * 0.04, m * 0.034, a, lit(ctx, ex, ey, m * 0.04, '#a87444', 0.15), '#2e1d10', lw(0.012));
    }
    oval(ctx, 0, cy, R, R * k, 0, null, '#2e1d10', lw(0.095));
    oval(ctx, 0, cy, R, R * k, 0, null, '#8a5d36', lw(0.062));
    oval(ctx, 0, cy - m * 0.012, R, R * k, 0, null, rgba('#ffffff', 0.22), lw(0.016));
    oval(ctx, 0, cy, R * 0.55, R * k * 0.55, 0, null, rgba('#2e1d10', 0.7), lw(0.02));
    oval(ctx, 0, cy, m * 0.08, m * 0.065, 0, lit(ctx, 0, cy, m * 0.08, '#d4a72c', 0.22), '#6a5214', lw(0.012));
  },
  anchor(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.4, h * 0.42, 0.3);
    const iron = '#555a61', dark = '#1e2125';
    const links = [];
    for (let i = 0; i < 7; i += 1) { const a = 0.3 + i * 0.32; links.push([-w * 0.12 - Math.sin(a) * w * 0.3, -h * 0.42 + (1 - Math.cos(a)) * h * 0.2]); }
    links.forEach(([x, y], i) => oval(ctx, x, y, m * 0.07, m * 0.04, 0.9 + i * 0.3 + (i % 2) * Math.PI / 2, null, i % 2 ? '#3a3e44' : '#5a5e64', Math.max(0.8, m * 0.03)));
    const stroke2 = (draw, wd) => { draw(); ctx.strokeStyle = dark; ctx.lineWidth = wd + Math.max(1, m * 0.035); ctx.lineCap = 'round'; ctx.stroke(); ctx.strokeStyle = iron; ctx.lineWidth = wd; ctx.stroke(); };
    stroke2(() => { ctx.beginPath(); ctx.moveTo(-w * 0.4, h * 0.12); ctx.quadraticCurveTo(-w * 0.32, h * 0.42, 0, h * 0.4); ctx.quadraticCurveTo(w * 0.32, h * 0.42, w * 0.4, h * 0.12); }, m * 0.09);
    stroke2(() => { ctx.beginPath(); ctx.moveTo(0, -h * 0.36); ctx.lineTo(0, h * 0.38); }, m * 0.11);
    stroke2(() => { ctx.beginPath(); ctx.moveTo(-w * 0.36, -h * 0.27); ctx.lineTo(w * 0.36, -h * 0.27); }, m * 0.08);
    for (const s of [-1, 1]) {
      poly(ctx, [[s * w * 0.46, h * 0.02], [s * w * 0.47, h * 0.2], [s * w * 0.3, h * 0.17]], iron, dark, Math.max(0.6, m * 0.025));
      circle(ctx, s * w * 0.37, -h * 0.27, m * 0.06, iron, dark, Math.max(0.5, m * 0.02));
    }
    circle(ctx, 0, -h * 0.41, m * 0.1, null, dark, Math.max(1, m * 0.08));
    circle(ctx, 0, -h * 0.41, m * 0.1, null, iron, Math.max(0.8, m * 0.05));
    line(ctx, -m * 0.02, -h * 0.3, -m * 0.02, h * 0.3, rgba('#ffffff', 0.22), Math.max(0.5, m * 0.025));
  },
  cannon(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.42, h * 0.38, 1);
    for (const y of [-h * 0.06, h * 0.33]) for (const s of [-1, 1]) wheel(ctx, s * w * 0.4, y, w * 0.13, h * 0.13);
    for (const y of [-h * 0.06, h * 0.33]) rect(ctx, -w * 0.4, y - h * 0.015, w * 0.8, h * 0.03, '#2e2419');
    for (const s of [-1, 1]) rect(ctx, s * w * 0.27 - w * 0.08, -h * 0.16, w * 0.16, h * 0.58, lit(ctx, s * w * 0.27, h * 0.1, h * 0.4, '#7a5232', 0.08), '#3e2914', Math.max(0.5, m * 0.03));
    rect(ctx, -w * 0.2, h * 0.24, w * 0.4, h * 0.16, '#6a4628', '#3e2914', Math.max(0.5, m * 0.02));
    const bar = ctx.createLinearGradient(-w * 0.2, 0, w * 0.2, 0);
    bar.addColorStop(0, '#5a5a62'); bar.addColorStop(0.35, '#2e2e33'); bar.addColorStop(1, '#0c0c0e');
    poly(ctx, [[-w * 0.2, h * 0.36], [-w * 0.13, -h * 0.42], [-w * 0.16, -h * 0.47], [w * 0.16, -h * 0.47], [w * 0.13, -h * 0.42], [w * 0.2, h * 0.36]], bar, '#08080a', Math.max(0.5, m * 0.025));
    for (const y of [h * 0.22, -h * 0.02, -h * 0.4]) line(ctx, -w * (0.19 - (0.22 - y / h) * 0.07), y, w * (0.19 - (0.22 - y / h) * 0.07), y, '#08080a', Math.max(0.5, m * 0.03), 'butt');
    circle(ctx, 0, h * 0.42, w * 0.08, radial(ctx, 0, h * 0.42, w * 0.08, '#4a4a50', '#101012', -w * 0.03, h * 0.41));
    oval(ctx, 0, -h * 0.47, w * 0.1, h * 0.012, 0, '#000000');
    line(ctx, -w * 0.12, h * 0.3, -w * 0.08, -h * 0.38, rgba('#ffffff', 0.25), Math.max(0.5, m * 0.03));
  },
  cannonballs(g) {
    const { ctx, m } = g;
    shadow(g, 'round', m * 0.44, m * 0.44, 0.8);
    const r = m * 0.135;
    const ball = (x, y, k) => {
      circle(ctx, x + r * 0.15, y + r * 0.2, r, 'rgba(0,0,0,0.3)');
      circle(ctx, x, y, r, radial(ctx, x, y, r, shade('#5a5a60', k), shade('#141418', k), x - r * 0.4, y - r * 0.4));
      circle(ctx, x - r * 0.35, y - r * 0.35, r * 0.2, rgba('#ffffff', 0.35 + k));
    };
    for (let j = -1; j <= 1; j += 1) for (let i = -1; i <= 1; i += 1) ball(i * r * 2, j * r * 2, -0.04);
    for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ball(i * r, j * r, 0.0);
    ball(0, 0, 0.04);
  },
  rope_coil(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.42, m * 0.42, 0.25);
    const a0 = rnd() * TAU, turns = 4.3, pts = [];
    for (let i = 0; i <= 120; i += 1) {
      const u = i / 120;
      const r = m * (0.06 + 0.33 * u);
      pts.push([Math.cos(a0 + u * turns * TAU) * r, Math.sin(a0 + u * turns * TAU) * r]);
    }
    const [ex, ey] = pts[pts.length - 1];
    const ea = a0 + turns * TAU;
    pts.push([ex + Math.cos(ea + 1.4) * m * 0.06, ey + Math.sin(ea + 1.4) * m * 0.06], [ex + Math.cos(ea + 1.0) * m * 0.12, ey + Math.sin(ea + 1.0) * m * 0.12 + m * 0.02]);
    polyline(ctx, pts, '#5e4626', Math.max(1, m * 0.085));
    polyline(ctx, pts, '#c4a672', Math.max(0.8, m * 0.06));
    ctx.beginPath();
    for (let i = 1; i < pts.length - 1; i += 1) {
      const [x, y] = pts[i];
      const [px, py] = pts[i - 1];
      const d = Math.hypot(x - px, y - py) || 1;
      const nx = -(y - py) / d, ny = (x - px) / d;
      ctx.moveTo(x - nx * m * 0.026 - (x - px) * 0.3, y - ny * m * 0.026 - (y - py) * 0.3);
      ctx.lineTo(x + nx * m * 0.026 + (x - px) * 0.3, y + ny * m * 0.026 + (y - py) * 0.3);
    }
    ctx.strokeStyle = rgba('#7a5e36', 0.8); ctx.lineWidth = Math.max(0.5, m * 0.01); ctx.stroke();
    circle(ctx, pts[pts.length - 1][0], pts[pts.length - 1][1], m * 0.03, '#d8c090');
  },
  capstan(g) {
    const { ctx, m } = g;
    const lw = (k) => Math.max(0.5, m * k);
    shadow(g, 'round', m * 0.34, m * 0.34, 1.2);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + 0.26, c = Math.cos(a), s = Math.sin(a);
      line(ctx, c * m * 0.2, s * m * 0.2, c * m * 0.47, s * m * 0.47, '#2e1d10', lw(0.075));
      line(ctx, c * m * 0.2, s * m * 0.2, c * m * 0.47, s * m * 0.47, '#9a7048', lw(0.055));
      line(ctx, c * m * 0.2 - m * 0.01, s * m * 0.2 - m * 0.01, c * m * 0.46 - m * 0.01, s * m * 0.46 - m * 0.01, rgba('#ffffff', 0.22), lw(0.014));
    }
    circle(ctx, m * 0.02, m * 0.03, m * 0.31, 'rgba(0,0,0,0.3)');
    circle(ctx, 0, 0, m * 0.31, '#4a3019', '#24160b', lw(0.012));
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      poly(ctx, [[Math.cos(a - 0.12) * m * 0.24, Math.sin(a - 0.12) * m * 0.24], [Math.cos(a - 0.09) * m * 0.31, Math.sin(a - 0.09) * m * 0.31], [Math.cos(a + 0.09) * m * 0.31, Math.sin(a + 0.09) * m * 0.31], [Math.cos(a + 0.12) * m * 0.24, Math.sin(a + 0.12) * m * 0.24]], shade('#7a5232', Math.cos(a + 2.4) * 0.08), '#24160b', lw(0.006));
    }
    circle(ctx, 0, 0, m * 0.24, lit(ctx, 0, 0, m * 0.24, '#8a5d36', 0.16), '#24160b', lw(0.014));
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + 0.26 + Math.PI / 6;
      rect(ctx, Math.cos(a) * m * 0.18 - m * 0.025, Math.sin(a) * m * 0.18 - m * 0.025, m * 0.05, m * 0.05, '#1e140c');
    }
    circle(ctx, 0, 0, m * 0.13, null, '#3a3a3a', lw(0.03));
    circle(ctx, 0, 0, m * 0.07, lit(ctx, 0, 0, m * 0.07, '#7a7e84', 0.2), '#2a2a2a', lw(0.01));
  },
  hatch(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.46, h * 0.46, 0.3);
    rect(ctx, -w * 0.46, -h * 0.46, w * 0.92, h * 0.92, '#6e4a2a', '#2e1d10', Math.max(0.8, m * 0.02));
    poly(ctx, [[-w * 0.46, -h * 0.46], [w * 0.46, -h * 0.46], [w * 0.37, -h * 0.37], [-w * 0.37, -h * 0.37]], rgba('#ffffff', 0.14));
    poly(ctx, [[-w * 0.46, -h * 0.46], [-w * 0.37, -h * 0.37], [-w * 0.37, h * 0.37], [-w * 0.46, h * 0.46]], rgba('#ffffff', 0.08));
    poly(ctx, [[w * 0.46, h * 0.46], [-w * 0.46, h * 0.46], [-w * 0.37, h * 0.37], [w * 0.37, h * 0.37]], rgba('#000000', 0.2));
    rect(ctx, -w * 0.37, -h * 0.37, w * 0.74, h * 0.74, radial(ctx, 0, 0, w * 0.45, '#0a0705', '#22170e'));
    const n = 6, bw = (w * 0.74) / n;
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      ctx.rect(-w * 0.37 + bw * i + bw * 0.32, -h * 0.37, bw * 0.36, h * 0.74);
      ctx.rect(-w * 0.37, -h * 0.37 + ((h * 0.74) / n) * i + ((h * 0.74) / n) * 0.32, w * 0.74, ((h * 0.74) / n) * 0.36);
    }
    ctx.fillStyle = '#8a6440'; ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      ctx.moveTo(-w * 0.37 + bw * i + bw * 0.32, -h * 0.37); ctx.lineTo(-w * 0.37 + bw * i + bw * 0.32, h * 0.37);
      ctx.moveTo(-w * 0.37, -h * 0.37 + ((h * 0.74) / n) * i + ((h * 0.74) / n) * 0.32); ctx.lineTo(w * 0.37, -h * 0.37 + ((h * 0.74) / n) * i + ((h * 0.74) / n) * 0.32);
    }
    ctx.strokeStyle = rgba('#ffffff', 0.2); ctx.lineWidth = Math.max(0.5, m * 0.008); ctx.stroke();
    rect(ctx, -w * 0.37, -h * 0.37, w * 0.74, h * 0.74, null, '#2e1d10', Math.max(0.5, m * 0.012));
  },
  gangplank(g) {
    const { ctx, w, h, m } = g;
    const lw = (k) => Math.max(0.5, m * k);
    shadow(g, 'rect', w * 0.38, h * 0.48, 0.3);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) circle(ctx, s * w * 0.42, -h * 0.46 + (h * 0.92 * i) / 2, m * 0.055, lit(ctx, s * w * 0.42, -h * 0.46 + (h * 0.92 * i) / 2, m * 0.055, '#6e4a2a', 0.15), '#3e2914', lw(0.012));
      line(ctx, s * w * 0.42, -h * 0.46, s * w * 0.42, h * 0.46, '#5e4626', lw(0.045));
      line(ctx, s * w * 0.42, -h * 0.46, s * w * 0.42, h * 0.46, '#c9ad78', lw(0.028));
    }
    planks(g, -w * 0.34, -h * 0.48, w * 0.68, h * 0.96, '#94693e', 3, false, 0.25);
    rect(ctx, -w * 0.34, -h * 0.48, w * 0.68, h * 0.96, null, '#3e2914', lw(0.04));
    for (let i = 0; i < 9; i += 1) {
      const y = -h * 0.41 + (h * 0.82 * i) / 8;
      rect(ctx, -w * 0.34, y + m * 0.02, w * 0.68, m * 0.04, 'rgba(0,0,0,0.28)');
      rect(ctx, -w * 0.34, y - m * 0.02, w * 0.68, m * 0.045, '#b08452', '#4a3018', lw(0.01));
    }
    for (const s of [-1, 1]) rect(ctx, s * w * 0.2 - m * 0.05, -h * 0.495, m * 0.1, h * 0.03, '#3a3e44', '#1e2125', lw(0.01));
  },
  crows_nest(g) {
    const { ctx, m, rnd } = g;
    shadow(g, 'round', m * 0.46, m * 0.46, 3);
    for (const a of [0.8, 2.4, 3.9, 5.5]) line(ctx, Math.cos(a) * m * 0.4, Math.sin(a) * m * 0.4, Math.cos(a) * m * 0.5, Math.sin(a) * m * 0.5, '#3e2914', Math.max(0.6, m * 0.012));
    ctx.save();
    circle(ctx, 0, 0, m * 0.44, '#7a5532');
    ctx.clip();
    planks(g, -m * 0.44, -m * 0.44, m * 0.88, m * 0.88, '#8b623a', 7, true, 0.25);
    ctx.restore();
    rect(ctx, -m * 0.1, m * 0.1, m * 0.2, m * 0.16, '#1a120b', '#3e2914', Math.max(0.5, m * 0.01));
    circle(ctx, 0, 0, m * 0.42, null, '#3e2914', Math.max(1, m * 0.07));
    circle(ctx, 0, 0, m * 0.42, null, '#8a6440', Math.max(0.8, m * 0.04));
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * TAU;
      circle(ctx, Math.cos(a) * m * 0.42, Math.sin(a) * m * 0.42, m * 0.022, '#4a3019');
    }
    circle(ctx, 0, 0, m * 0.11, lit(ctx, 0, 0, m * 0.11, '#8a5d36', 0.14), '#2e1d10', Math.max(0.5, m * 0.012));
    circle(ctx, 0, 0, m * 0.08, null, '#3a3a3a', Math.max(0.5, m * 0.015));
    circle(ctx, 0, 0, m * 0.05, lit(ctx, 0, 0, m * 0.05, '#9a6e44', 0.14));
    poly(ctx, [[m * 0.04, -m * 0.02], [m * 0.3, -m * 0.06 + (rnd() - 0.5) * m * 0.02], [m * 0.27, m * 0.01], [m * 0.32, m * 0.06], [m * 0.04, m * 0.02]], '#b8432f', '#6a1a12', Math.max(0.5, m * 0.008));
  },
  fishing_net(g) {
    const { ctx, m, rnd } = g;
    const out = blobPoints(0, 0, m * 0.44, m * 0.38, 11, 0.32, rnd);
    smoothShape(ctx, out, rgba('#3a3020', 0.35));
    ctx.save();
    smoothShape(ctx, out, null);
    ctx.clip();
    ctx.beginPath();
    for (let i = -14; i <= 14; i += 1) {
      for (const s of [-1, 1]) {
        const c = i * m * 0.06;
        for (let k = 0; k <= 10; k += 1) {
          const u = -m * 0.5 + (m * k) / 10;
          const x = c + u * 0.7 * s + Math.sin(k * 1.7 + i) * m * 0.008;
          const y = u + Math.cos(k * 1.3 + i) * m * 0.008;
          if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
      }
    }
    ctx.strokeStyle = rgba('#d8c9a0', 0.7); ctx.lineWidth = Math.max(0.5, m * 0.006); ctx.stroke();
    for (let i = 0; i < 4; i += 1) {
      const pts = [];
      const a = rnd() * TAU, y0 = (rnd() - 0.5) * m * 0.5;
      for (let k = 0; k < 6; k += 1) pts.push([-m * 0.4 + k * m * 0.16, y0 + Math.sin(a + k) * m * 0.05]);
      polyline(ctx, pts, rgba('#5a4a30', 0.5), Math.max(0.6, m * 0.022));
    }
    ctx.restore();
    const fl = [];
    for (let k = 0; k <= 8; k += 1) { const a = Math.PI * 0.9 + (k / 8) * Math.PI * 1.1; fl.push([Math.cos(a) * m * 0.38, Math.sin(a) * m * 0.33]); }
    polyline(ctx, fl, '#8a7448', Math.max(0.6, m * 0.012));
    for (const [x, y] of fl) oval(ctx, x, y, m * 0.035, m * 0.024, rnd() * TAU, lit(ctx, x, y, m * 0.035, '#c8803a', 0.15), '#6a3a14', Math.max(0.5, m * 0.006));
    const fish = (x, y, a, l) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      poly(ctx, [[l * 0.5, 0], [l * 0.62, -l * 0.12], [l * 0.62, l * 0.12]], '#6a7a86');
      oval(ctx, 0, 0, l * 0.5, l * 0.15, 0, radial(ctx, 0, -l * 0.05, l * 0.5, '#d4dde2', '#7a8a96'), '#4a5a66', Math.max(0.5, m * 0.005));
      circle(ctx, -l * 0.34, -l * 0.02, l * 0.035, '#1a1a1a');
      ctx.restore();
    };
    fish(m * 0.08, m * 0.06, 0.5, m * 0.22);
    fish(-m * 0.14, -m * 0.08, 2.6, m * 0.18);
  },
  lobster_pots(g) {
    const { ctx, w, h, m, rnd } = g;
    const lw = (k) => Math.max(0.5, m * k);
    shadow(g, 'rect', w * 0.46, h * 0.44, 1);
    const trap = (x, y, pw, ph, rot) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      rrect(ctx, -pw / 2, -ph / 2, pw, ph, m * 0.04, '#21170e', '#140d07', lw(0.014));
      ctx.beginPath();
      for (let i = -6; i <= 6; i += 1) { ctx.moveTo(-pw / 2 + i * pw * 0.12, -ph / 2); ctx.lineTo(-pw / 2 + i * pw * 0.12 + ph, ph / 2); }
      ctx.strokeStyle = rgba('#cdb98c', 0.5); ctx.lineWidth = lw(0.008); ctx.stroke();
      const n = 5;
      for (let i = 0; i < n; i += 1) {
        const u = (i + 0.5) / n, yy = -ph / 2 + ph * u, k = Math.cos((u - 0.5) * Math.PI * 0.9);
        rect(ctx, -pw / 2 + m * 0.03, yy - (ph / n) * 0.3, pw - m * 0.06, (ph / n) * 0.6, shade('#a07a4a', -0.16 + k * 0.16), '#3e2914', lw(0.006));
      }
      for (const xx of [-pw * 0.47, -pw * 0.16, pw * 0.16, pw * 0.47 - m * 0.04]) rect(ctx, xx, -ph / 2, m * 0.04, ph, xx < -pw * 0.4 || xx > pw * 0.4 ? '#6a4a2a' : '#7a5636', '#2e1d10', lw(0.006));
      oval(ctx, -pw * 0.02, 0, pw * 0.11, ph * 0.13, 0, '#120c07', '#d9c69a', lw(0.014));
      ctx.restore();
    };
    trap(-w * 0.1, h * 0.16, w * 0.74, h * 0.6, -0.06);
    rrect(ctx, -w * 0.25 + m * 0.035, -h * 0.4 + m * 0.05, w * 0.72, h * 0.58, m * 0.04, 'rgba(0,0,0,0.32)');
    trap(w * 0.11, -h * 0.11, w * 0.72, h * 0.58, 0.1 + (rnd() - 0.5) * 0.06);
    const rope = [[w * 0.42, -h * 0.02], [w * 0.47, h * 0.18], [w * 0.38, h * 0.36], [w * 0.3, h * 0.46]];
    polyline(ctx, rope, '#5e4626', lw(0.045));
    polyline(ctx, rope, '#c9ad78', lw(0.028));
    oval(ctx, w * 0.3, h * 0.43, m * 0.07, m * 0.05, 0.4, lit(ctx, w * 0.3, h * 0.43, m * 0.07, '#d0883c', 0.18), '#6a3a14', lw(0.012));
  },
  fish_crate(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.47, h * 0.46, 0.8);
    rect(ctx, -w * 0.47, -h * 0.46, w * 0.94, h * 0.92, '#8a6a44', '#4a3018', Math.max(1, m * 0.03));
    rect(ctx, -w * 0.39, -h * 0.38, w * 0.78, h * 0.76, '#dfeef2');
    for (let i = 0; i < 26; i += 1) {
      const x = (rnd() - 0.5) * w * 0.74, y = (rnd() - 0.5) * h * 0.72;
      poly(ctx, blobPoints(x, y, m * 0.04, m * 0.03, 5, 0.6, rnd), rgba(i % 2 ? '#ffffff' : '#b8d4de', 0.9));
    }
    const fish = (x, y, a, l) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      poly(ctx, [[l * 0.46, 0], [l * 0.6, -l * 0.13], [l * 0.6, l * 0.13]], '#5a6a78', '#3a4a56', Math.max(0.5, m * 0.006));
      oval(ctx, 0, 0, l * 0.5, l * 0.15, 0, radial(ctx, 0, -l * 0.06, l * 0.5, '#e4ebee', '#7f8f9b'), '#3e4e5a', Math.max(0.5, m * 0.008));
      line(ctx, -l * 0.42, -l * 0.07, l * 0.4, -l * 0.05, rgba('#3e5566', 0.6), Math.max(0.5, m * 0.012));
      circle(ctx, -l * 0.34, -l * 0.02, l * 0.04, '#f0f0f0');
      circle(ctx, -l * 0.34, -l * 0.02, l * 0.022, '#111');
      ctx.restore();
    };
    for (let i = 0; i < 6; i += 1) fish(-w * 0.12 + (i % 2) * w * 0.2 + (rnd() - 0.5) * w * 0.06, -h * 0.28 + i * h * 0.11, -0.5 + (i % 2) * 0.9 + (rnd() - 0.5) * 0.3, m * 0.5);
    for (const [x, y, ww, hh, c] of [[-0.47, -0.46, 0.94, 0.08, 0.1], [-0.47, -0.46, 0.08, 0.92, 0.05], [-0.47, 0.38, 0.94, 0.08, -0.08], [0.39, -0.46, 0.08, 0.92, -0.06]]) rect(ctx, x * w, y * h, ww * w, hh * h, shade('#8a6a44', c), '#4a3018', Math.max(0.5, m * 0.012));
  },
  sea_chest(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.44, h * 0.42, 0.8);
    for (const s of [-1, 1]) {
      oval(ctx, s * w * 0.43, 0, w * 0.05, h * 0.2, 0, null, '#5e4626', Math.max(1, m * 0.09));
      oval(ctx, s * w * 0.43, 0, w * 0.05, h * 0.2, 0, null, '#c9ad78', Math.max(0.8, m * 0.06));
    }
    rect(ctx, -w * 0.41, -h * 0.42, w * 0.82, h * 0.84, '#4a3019', '#24160b', Math.max(0.8, m * 0.03));
    rect(ctx, -w * 0.36, -h * 0.33, w * 0.72, h * 0.66, lit(ctx, 0, 0, w * 0.5, '#2f5a66', 0.08));
    rect(ctx, -w * 0.31, -h * 0.23, w * 0.62, h * 0.46, null, '#d8c690', Math.max(0.5, m * 0.025));
    const st = [];
    for (let i = 0; i < 8; i += 1) { const a = (i / 8) * TAU - Math.PI / 2, r = i % 2 ? m * 0.07 : m * 0.2; st.push([Math.cos(a) * r, Math.sin(a) * r]); }
    poly(ctx, st, '#d8c690', '#8a7440', Math.max(0.5, m * 0.01));
    circle(ctx, 0, 0, m * 0.03, '#b8432f');
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      poly(ctx, [[x * w * 0.41, y * h * 0.42], [x * w * 0.29, y * h * 0.42], [x * w * 0.29, y * h * 0.3], [x * w * 0.37, y * h * 0.3], [x * w * 0.37, y * h * 0.14], [x * w * 0.41, y * h * 0.14]], '#3a3e44', '#1e2125', Math.max(0.5, m * 0.012));
    }
    rect(ctx, -w * 0.04, h * 0.3, w * 0.08, h * 0.14, '#3a3e44', '#1e2125', Math.max(0.5, m * 0.01));
  },
  buoy(g) {
    const { ctx, m, t } = g;
    const lw = (k) => Math.max(0.5, m * k);
    shadow(g, 'round', m * 0.3, m * 0.3, 0.6);
    for (const [r, a0, a1, al] of [[0.44, 0.4, 2.4, 0.4], [0.44, 3.2, 5.6, 0.3], [0.38, 1.6, 3.9, 0.5], [0.38, 4.5, 6.9, 0.45]]) {
      ctx.beginPath(); ctx.arc(0, 0, m * r, a0, a1);
      ctx.strokeStyle = rgba('#ffffff', al); ctx.lineWidth = lw(0.025); ctx.lineCap = 'round'; ctx.stroke();
    }
    circle(ctx, 0, 0, m * 0.3, '#f2eee4', shade(t, -0.35), lw(0.03));
    for (let i = 0; i < 6; i += 2) {
      const a0 = (i / 6) * TAU - 0.3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, m * 0.3, a0, a0 + TAU / 6); ctx.closePath(); ctx.fillStyle = t; ctx.fill();
    }
    circle(ctx, 0, 0, m * 0.3, radial(ctx, 0, 0, m * 0.3, 'rgba(255,255,255,0.4)', 'rgba(0,0,0,0.38)', -m * 0.12, -m * 0.12), shade(t, -0.4), lw(0.025));
    circle(ctx, -m * 0.11, -m * 0.12, m * 0.05, rgba('#ffffff', 0.55));
    circle(ctx, 0, 0, m * 0.06, null, '#2a2a2a', lw(0.035));
  },
  canoe(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'round', w * 0.42, h * 0.47, 0.5);
    const shape = (k) => {
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.48 * k);
      ctx.bezierCurveTo(w * 0.42 * k, -h * 0.3 * k, w * 0.46 * k, h * 0.3 * k, 0, h * 0.48 * k);
      ctx.bezierCurveTo(-w * 0.46 * k, h * 0.3 * k, -w * 0.42 * k, -h * 0.3 * k, 0, -h * 0.48 * k);
      ctx.closePath();
    };
    shape(1); ctx.fillStyle = '#6e4224'; ctx.fill(); ctx.strokeStyle = '#2e1a0c'; ctx.lineWidth = Math.max(0.8, m * 0.04); ctx.stroke();
    shape(0.86); ctx.fillStyle = radial(ctx, w * 0.1, 0, h * 0.4, '#c08a54', '#8a5a32'); ctx.fill();
    ctx.save(); shape(0.86); ctx.clip();
    for (let i = 0; i < 14; i += 1) line(ctx, -w * 0.5, -h * 0.38 + (h * 0.76 * i) / 13, w * 0.5, -h * 0.38 + (h * 0.76 * i) / 13, rgba('#5a3a1e', 0.35), Math.max(0.5, m * 0.02), 'butt');
    ctx.restore();
    for (const y of [-h * 0.2, h * 0.2]) rect(ctx, -w * 0.36, y - m * 0.05, w * 0.72, m * 0.1, '#5e3b1f', '#2e1a0c', Math.max(0.5, m * 0.02));
    line(ctx, -w * 0.08, -h * 0.34, w * 0.06, h * 0.1, '#c9a070', Math.max(0.8, m * 0.06));
    oval(ctx, w * 0.1, h * 0.24, w * 0.1, h * 0.12, -0.13, lit(ctx, w * 0.1, h * 0.24, h * 0.12, '#c9a070', 0.15), '#6a4a2a', Math.max(0.5, m * 0.02));
    rect(ctx, -w * 0.13, -h * 0.37, w * 0.1, h * 0.04, '#6a4a2a');
  },
  raft(g) {
    const { ctx, w, h, m, rnd } = g;
    shadow(g, 'rect', w * 0.46, h * 0.45, 0.4);
    const n = 6, lw2 = (w * 0.9) / n;
    for (let i = 0; i < n; i += 1) {
      const x = -w * 0.45 + lw2 * (i + 0.5), y0 = -h * (0.44 + rnd() * 0.04), y1 = h * (0.43 + rnd() * 0.04);
      const gr = ctx.createLinearGradient(x - lw2 / 2, 0, x + lw2 / 2, 0);
      gr.addColorStop(0, '#9a7448'); gr.addColorStop(0.4, '#7a5532'); gr.addColorStop(1, '#4a3019');
      rrect(ctx, x - lw2 * 0.48, y0, lw2 * 0.96, y1 - y0, lw2 * 0.45, gr, '#2e1d10', Math.max(0.5, m * 0.012));
      for (let k = 0; k < 3; k += 1) { const yy = y0 + (y1 - y0) * (0.15 + rnd() * 0.7); line(ctx, x + (rnd() - 0.5) * lw2 * 0.4, yy, x + (rnd() - 0.5) * lw2 * 0.4, yy + h * 0.12, rgba('#2e1d10', 0.45), Math.max(0.5, m * 0.008)); }
      oval(ctx, x, y0 + lw2 * 0.2, lw2 * 0.36, lw2 * 0.16, 0, '#c19a66', '#6b4a2b', Math.max(0.5, m * 0.006));
    }
    for (const y of [-h * 0.3, h * 0.28]) {
      line(ctx, -w * 0.46, y, w * 0.46, y, '#6a5230', Math.max(1, m * 0.045));
      line(ctx, -w * 0.46, y, w * 0.46, y, '#c9ad78', Math.max(0.8, m * 0.03));
      ctx.beginPath();
      for (let i = 0; i < 24; i += 1) { const x = -w * 0.45 + (w * 0.9 * i) / 23; ctx.moveTo(x - m * 0.008, y - m * 0.015); ctx.lineTo(x + m * 0.008, y + m * 0.015); }
      ctx.strokeStyle = rgba('#6a5230', 0.8); ctx.lineWidth = Math.max(0.5, m * 0.006); ctx.stroke();
    }
    line(ctx, -w * 0.38 + m * 0.02, h * 0.36 + m * 0.03, w * 0.4 + m * 0.02, -h * 0.38 + m * 0.03, 'rgba(0,0,0,0.3)', Math.max(0.8, m * 0.04));
    line(ctx, -w * 0.38, h * 0.36, w * 0.4, -h * 0.38, '#b08a5a', Math.max(0.8, m * 0.035));
  },
  oars(g) {
    const { ctx, w, h, m } = g;
    shadow(g, 'rect', w * 0.42, h * 0.47, 0.25);
    const oar = (x, y, a) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      rrect(ctx, -w * 0.06, -h * 0.47, w * 0.12, h * 0.1, w * 0.05, '#6a4a2a', '#3e2914', Math.max(0.5, m * 0.03));
      rect(ctx, -w * 0.08, -h * 0.37, w * 0.16, h * 0.55, '#b08a5a', '#5e3b1f', Math.max(0.5, m * 0.03));
      rect(ctx, -w * 0.09, -h * 0.16, w * 0.18, h * 0.07, '#4a3019');
      poly(ctx, [[-w * 0.08, h * 0.16], [-w * 0.2, h * 0.24], [-w * 0.19, h * 0.46], [0, h * 0.48], [w * 0.19, h * 0.46], [w * 0.2, h * 0.24], [w * 0.08, h * 0.16]], lit(ctx, 0, h * 0.32, h * 0.18, '#b8925e', 0.1), '#5e3b1f', Math.max(0.5, m * 0.03));
      line(ctx, 0, h * 0.2, 0, h * 0.44, rgba('#5e3b1f', 0.5), Math.max(0.5, m * 0.02));
      ctx.restore();
    };
    oar(-w * 0.22, -h * 0.01, 0.02);
    oar(w * 0.2, h * 0.01, -0.02);
  },
  bollard(g) {
    const { ctx, m, rnd } = g;
    const lw = (k) => Math.max(0.5, m * k);
    shadow(g, 'round', m * 0.34, m * 0.34, 0.9);
    const ropeLine = (pts) => {
      polyline(ctx, pts, '#4e3a20', lw(0.12));
      polyline(ctx, pts, '#b89a64', lw(0.085));
    };
    ropeLine([[m * 0.24, m * 0.14], [m * 0.36, m * 0.3], [m * 0.49, m * 0.4]]);
    ropeLine([[-m * 0.22, m * 0.18], [-m * 0.3, m * 0.32], [-m * 0.24, m * 0.42]]);
    circle(ctx, 0, 0, m * 0.3, null, '#4e3a20', lw(0.15));
    circle(ctx, 0, 0, m * 0.3, null, '#b89a64', lw(0.11));
    ctx.beginPath();
    for (let i = 0; i < 18; i += 1) { const a = (i / 18) * TAU + rnd() * 0.1; ctx.moveTo(Math.cos(a) * m * 0.25, Math.sin(a) * m * 0.25); ctx.lineTo(Math.cos(a + 0.12) * m * 0.35, Math.sin(a + 0.12) * m * 0.35); }
    ctx.strokeStyle = rgba('#5e4626', 0.75); ctx.lineWidth = lw(0.016); ctx.stroke();
    circle(ctx, m * 0.02, m * 0.03, m * 0.25, 'rgba(0,0,0,0.35)');
    circle(ctx, 0, 0, m * 0.25, lit(ctx, 0, 0, m * 0.25, '#50555c', 0.18), '#16181b', lw(0.03));
    circle(ctx, 0, 0, m * 0.17, null, rgba('#000000', 0.35), lw(0.02));
    circle(ctx, -m * 0.07, -m * 0.08, m * 0.06, rgba('#ffffff', 0.25));
  },
  waterfall(g) {
    const { ctx, w, h, m, rnd } = g;
    const lw = (k) => Math.max(0.5, m * k);
    const lip = -h * 0.17, fw = w * 0.4, base = lip + h * 0.25;
    // Glassy water sliding to the brink.
    rect(ctx, -fw, -h * 0.5, fw * 2, lip + h * 0.5, (() => { const gr = ctx.createLinearGradient(0, -h * 0.5, 0, lip); gr.addColorStop(0, 'rgba(150,205,225,0)'); gr.addColorStop(1, 'rgba(175,222,236,0.7)'); return gr; })());
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) { const x = -fw * 0.88 + (fw * 1.76 * i) / 7 + (rnd() - 0.5) * w * 0.03; ctx.moveTo(x * 1.05, -h * (0.44 - rnd() * 0.1)); ctx.lineTo(x, lip - h * 0.012); }
    ctx.strokeStyle = rgba('#eef8fc', 0.55); ctx.lineWidth = lw(0.012); ctx.stroke();
    // The drop: shade under the brink, a curtain of white water.
    rect(ctx, -w * 0.48, lip, w * 0.96, base - lip, (() => { const gr = ctx.createLinearGradient(0, lip, 0, base); gr.addColorStop(0, 'rgba(8,22,32,0.9)'); gr.addColorStop(1, 'rgba(8,22,32,0.25)'); return gr; })());
    rect(ctx, -fw, lip, fw * 2, base - lip, (() => { const gr = ctx.createLinearGradient(0, lip, 0, base); gr.addColorStop(0, 'rgba(232,247,252,0.97)'); gr.addColorStop(1, 'rgba(170,215,232,0.7)'); return gr; })());
    ctx.beginPath();
    for (let i = 0; i < 34; i += 1) { const x = -fw + (fw * 2 * (i + rnd())) / 34; ctx.moveTo(x, lip + h * 0.012); ctx.lineTo(x + (rnd() - 0.5) * w * 0.012, lip + (base - lip) * (0.45 + rnd() * 0.55)); }
    ctx.strokeStyle = rgba('#4e7e9a', 0.45); ctx.lineWidth = lw(0.013); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 30; i += 1) { const x = -fw + (fw * 2 * (i + rnd())) / 30; ctx.moveTo(x, lip); ctx.lineTo(x + (rnd() - 0.5) * w * 0.01, lip + (base - lip) * (0.4 + rnd() * 0.6)); }
    ctx.strokeStyle = rgba('#ffffff', 0.92); ctx.lineWidth = lw(0.013); ctx.stroke();
    rect(ctx, -fw, lip - h * 0.014, fw * 2, h * 0.028, rgba('#f6fcff', 0.9));
    // Foam and spray where it lands, trailing away downstream.
    glow(ctx, 0, base + h * 0.07, m * 0.62, '#ffffff', 0.65);
    for (let i = 0; i < 40; i += 1) {
      const x = (rnd() - 0.5) * fw * 2.25, y = base + (rnd() - 0.35) * h * 0.13, r = m * (0.03 + rnd() * 0.05);
      circle(ctx, x, y, r, rgba('#ffffff', 0.55 + rnd() * 0.4));
    }
    ctx.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const x = (rnd() - 0.5) * fw * 2.2, y = base + h * (0.1 + rnd() * 0.22), l = m * (0.05 + rnd() * 0.06);
      ctx.moveTo(x - l, y - l * 0.3); ctx.quadraticCurveTo(x, y + l * 0.4, x + l, y - l * 0.2);
    }
    ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = lw(0.013); ctx.stroke();
    for (let i = 0; i < 12; i += 1) circle(ctx, (rnd() - 0.5) * fw * 2, base + h * (0.12 + rnd() * 0.24), m * (0.012 + rnd() * 0.02), rgba('#ffffff', 0.75));
    // Rock shoulders at both ends of the brink, stones splitting the falls.
    for (const s of [-1, 1]) {
      stone(g, s * w * 0.43, lip + h * 0.03, w * 0.075, h * 0.17, '#6e6a62', 9, 0.3);
      stone(g, s * w * 0.35, lip - h * 0.07, w * 0.05, h * 0.06, '#78736a', 7, 0.35);
      stone(g, s * w * 0.43, base + h * 0.13, w * 0.055, h * 0.07, '#66625a', 7, 0.35);
    }
    for (const x of [-w * 0.12, w * 0.16]) {
      smoothShape(ctx, blobPoints(x, lip - h * 0.018, w * 0.065, h * 0.04, 7, 0.3, rnd), rgba('#ffffff', 0.85));
      stone(g, x, lip - h * 0.012, w * 0.038, h * 0.032, '#5e5a54', 6, 0.35);
    }
  },
  rapids(g) {
    const { ctx, w, h, m, rnd } = g;
    const lw = (k) => Math.max(0.5, m * k);
    // Standing waves and foam across the flow (water runs down the page).
    for (let i = 0; i < 6; i += 1) {
      const x = (rnd() - 0.5) * w * 0.7, y = -h * 0.4 + (h * 0.8 * i) / 5 + (rnd() - 0.5) * h * 0.06, l = w * (0.14 + rnd() * 0.12);
      ctx.beginPath(); ctx.moveTo(x - l, y - h * 0.02); ctx.quadraticCurveTo(x, y + h * 0.08, x + l, y - h * 0.02); ctx.quadraticCurveTo(x, y + h * 0.03, x - l, y - h * 0.02);
      ctx.fillStyle = rgba('#ffffff', 0.45); ctx.fill();
    }
    for (let i = 0; i < 9; i += 1) {
      const x = (rnd() - 0.5) * w * 0.8, y = (rnd() - 0.5) * h * 0.8;
      smoothShape(ctx, blobPoints(x, y, m * (0.06 + rnd() * 0.06), m * (0.04 + rnd() * 0.04), 7, 0.5, rnd), rgba('#ffffff', 0.25 + rnd() * 0.2));
    }
    ctx.beginPath();
    for (let i = 0; i < 22; i += 1) {
      const x = (rnd() - 0.5) * w * 0.85, y = (rnd() - 0.5) * h * 0.85, l = h * (0.06 + rnd() * 0.08);
      ctx.moveTo(x, y); ctx.bezierCurveTo(x + m * 0.03, y + l * 0.3, x - m * 0.03, y + l * 0.6, x + (rnd() - 0.5) * m * 0.04, y + l);
    }
    ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = lw(0.012); ctx.stroke();
    // Rocks breaking the surface, foam piled on their upstream side, wakes behind.
    for (let i = 0; i < 5; i += 1) {
      const x = (rnd() - 0.5) * w * 0.7, y = (rnd() - 0.5) * h * 0.65, r = m * (0.05 + rnd() * 0.06);
      ctx.beginPath(); ctx.moveTo(x - r * 1.2, y); ctx.quadraticCurveTo(x - r * 0.9, y + r * 3, x, y + r * 4.2); ctx.quadraticCurveTo(x + r * 0.9, y + r * 3, x + r * 1.2, y); ctx.closePath();
      ctx.fillStyle = rgba('#ffffff', 0.35); ctx.fill();
      smoothShape(ctx, blobPoints(x, y - r * 0.35, r * 1.7, r * 1.25, 8, 0.35, rnd), rgba('#ffffff', 0.8));
      stone(g, x, y, r, r * 0.8, '#57534d', 7, 0.35);
      ctx.beginPath(); ctx.arc(x, y, r * 1.35, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.lineWidth = lw(0.016); ctx.stroke();
    }
  },
  whirlpool(g) {
    const { ctx, m, rnd } = g;
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, m * 0.49);
    gr.addColorStop(0, 'rgba(2,8,14,0.95)'); gr.addColorStop(0.35, 'rgba(10,40,62,0.7)'); gr.addColorStop(1, 'rgba(20,70,100,0)');
    circle(ctx, 0, 0, m * 0.49, gr);
    for (let arm = 0; arm < 5; arm += 1) {
      const a0 = (arm / 5) * TAU + rnd() * 0.3;
      const pts = [];
      for (let i = 0; i <= 30; i += 1) { const u = i / 30, r = m * 0.46 * (1 - u * 0.92), a = a0 + u * 4.2; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      for (let k = 0; k < 3; k += 1) polyline(ctx, pts.slice(k * 10, k * 10 + 11), rgba('#e8f4f8', 0.75 - k * 0.2), Math.max(0.5, m * (0.022 - k * 0.006)));
      polyline(ctx, pts.map(([x, y]) => [x * 0.9, y * 0.9]), rgba('#04121c', 0.5), Math.max(0.5, m * 0.02));
    }
    circle(ctx, 0, 0, m * 0.07, '#02060a');
  },
  ice_hole(g) {
    const { ctx, m, rnd } = g;
    const lw = (k) => Math.max(0.5, m * k);
    circle(ctx, 0, 0, m * 0.48, radial(ctx, 0, 0, m * 0.48, rgba('#ffffff', 0.35), rgba('#ffffff', 0)));
    ctx.beginPath();
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * TAU + rnd() * 0.5;
      let x = Math.cos(a) * m * 0.28, y = Math.sin(a) * m * 0.28, b = a;
      ctx.moveTo(x, y);
      for (let k = 0; k < 3; k += 1) {
        b += (rnd() - 0.5) * 0.8;
        x += Math.cos(b) * m * 0.065; y += Math.sin(b) * m * 0.065;
        ctx.lineTo(x, y);
        if (k === 0) { ctx.lineTo(x + Math.cos(b + 0.9) * m * 0.06, y + Math.sin(b + 0.9) * m * 0.06); ctx.moveTo(x, y); }
      }
    }
    ctx.strokeStyle = rgba('#3e6478', 0.8); ctx.lineWidth = lw(0.016); ctx.stroke();
    for (let i = 0; i < 11; i += 1) {
      const a = (i / 11) * TAU + rnd() * 0.3, d = m * (0.31 + rnd() * 0.04), r = m * (0.06 + rnd() * 0.035);
      const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.95;
      smoothShape(ctx, blobPoints(x + r * 0.25, y + r * 0.3, r, r * 0.8, 6, 0.4, rnd), rgba('#6e8ea2', 0.45));
      smoothShape(ctx, blobPoints(x, y, r, r * 0.8, 6, 0.4, rnd), radial(ctx, x, y, r, '#ffffff', '#d6e3ea', x - r * 0.4, y - r * 0.4));
    }
    const hole = blobPoints(0, 0, m * 0.28, m * 0.26, 12, 0.4, rnd, rnd() * TAU);
    poly(ctx, hole, '#a8d4e4', '#6e9cb2', lw(0.014));
    ctx.save();
    poly(ctx, hole, null);
    ctx.clip();
    ctx.save(); ctx.translate(-m * 0.025, -m * 0.025);
    poly(ctx, hole, radial(ctx, 0, 0, m * 0.3, '#05101a', '#1c4560'));
    ctx.restore();
    ctx.save(); ctx.translate(m * 0.04, m * 0.045);
    poly(ctx, hole, null, 'rgba(0,0,0,0.45)', m * 0.07);
    ctx.restore();
    poly(ctx, blobPoints(m * 0.08, m * 0.05, m * 0.055, m * 0.035, 5, 0.5, rnd), '#d6ecf4', '#8ab6c8', lw(0.008));
    poly(ctx, blobPoints(-m * 0.09, m * 0.1, m * 0.035, m * 0.025, 5, 0.5, rnd), '#c6e2ee');
    line(ctx, -m * 0.12, -m * 0.02, -m * 0.04, -m * 0.03, rgba('#9ccbe0', 0.5), lw(0.012));
    ctx.restore();
    poly(ctx, hole, null, rgba('#f4fbfe', 0.9), lw(0.018));
  },
  driftwood(g) {
    const { ctx, w, h, m, rnd } = g;
    const lw = (k) => Math.max(0.5, m * k);
    shadow(g, 'rect', w * 0.46, h * 0.32, 0.4);
    const mid = (u) => Math.sin(u * 4.6 + 0.4) * h * 0.07, thick = (u) => h * (0.34 - u * 0.24 + (u < 0.08 ? (0.08 - u) * 1.2 : 0));
    const top = [], bot = [];
    for (let i = 0; i <= 16; i += 1) {
      const u = i / 16, x = -w * 0.44 + w * 0.86 * u;
      top.push([x, mid(u) - thick(u) / 2 + (rnd() - 0.5) * h * 0.025]);
      bot.push([x, mid(u) + thick(u) / 2 + (rnd() - 0.5) * h * 0.025]);
    }
    const fill = (() => { const gr = ctx.createLinearGradient(0, -h * 0.3, 0, h * 0.3); gr.addColorStop(0, '#ddd7cb'); gr.addColorStop(0.5, '#bdb5a7'); gr.addColorStop(1, '#8a8276'); return gr; })();
    // Branch stubs and roots, then the trunk over them.
    for (const [x0, y0, x1, y1, wd] of [[-w * 0.12, -h * 0.02, -w * 0.02, -h * 0.42, 0.11], [w * 0.14, h * 0.02, w * 0.27, h * 0.38, 0.09], [w * 0.36, 0, w * 0.47, -h * 0.17, 0.06], [-w * 0.42, -h * 0.05, -w * 0.48, -h * 0.3, 0.1], [-w * 0.42, h * 0.05, -w * 0.47, h * 0.3, 0.09]]) {
      line(ctx, x0, y0, x1, y1, '#6e685e', lw(wd + 0.05));
      line(ctx, x0, y0, x1, y1, '#c4bcae', lw(wd));
    }
    smoothShape(ctx, [...top, ...bot.reverse()], fill, '#6e685e', lw(0.035));
    ctx.beginPath();
    for (let k = 0; k < 4; k += 1) {
      for (let i = 0; i <= 16; i += 1) {
        const u = 0.04 + (i / 16) * 0.9, x = -w * 0.44 + w * 0.86 * u;
        const y = mid(u) + thick(u) * (-0.3 + k * 0.2) + Math.sin(u * 11 + k * 1.7) * thick(u) * 0.14;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
    }
    ctx.strokeStyle = rgba('#6e685e', 0.6); ctx.lineWidth = lw(0.02); ctx.stroke();
    for (const [u, k] of [[0.25, 0.5], [0.6, 0.35]]) oval(ctx, -w * 0.44 + w * 0.86 * u, mid(u) + thick(u) * (k - 0.5) * 0.6, w * 0.022, h * 0.05, 0.2, '#5e584e', '#9a9284', lw(0.01));
  },
};
