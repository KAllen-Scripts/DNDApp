/**
 * The example campaign's region map, the Greyhallow Coast, painted in code (there's no starting map for a
 * region): sea and coastline, the Teeth, cliffs, the marsh, hills and woods, the town and the lighthouse, and
 * their names. Roads and the river are left to the map's own roads (example/campaign/maps.js), which the page
 * draws over it. Seeded, so it comes out the same every time. 100 px a square (a mile).
 */
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { LABEL_FONT_FILES } from '../maps/fonts.js';

export const SQUARE = 100;

/** The sea, in squares: everything west of the coastline. */
const SEA = [
  [0, 0], [9.2, 0], [9, 1.5], [8.2, 3], [7, 4.3], [6, 5.2], [6.2, 6], [7.4, 6.6], [8.8, 7.6], [10.2, 8.6], [11.4, 9.2], [12.1, 9.7],
  [12.2, 10.4], [11.5, 10.9], [10.4, 11.5], [9.6, 12.6], [9.1, 13.8], [8.4, 14.6], [7.6, 15.6], [7.9, 17], [8.6, 18.5], [8.9, 20], [0, 20],
];
const MARSH = [[16.5, 4.5], [21, 3], [27, 4], [28, 9], [25.5, 12], [20.5, 11.5], [17, 9.5]];

/** A small seeded random (mulberry32), so the picture is the same each time. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inside = (poly, x, y) => {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
  }
  return inn;
};

let fontsReady = false;
function fonts() {
  if (fontsReady) return;
  for (const f of LABEL_FONT_FILES) {
    try {
      GlobalFonts.registerFromPath(f.file(), f.family);
    } catch {
      // Without the font the labels fall back to the default one.
    }
  }
  fontsReady = true;
}

/** The map as a PNG buffer, `cols` × `rows` squares. */
export function paintRegionMap({ cols = 30, rows = 20 } = {}) {
  fonts();
  const W = cols * SQUARE;
  const H = rows * SQUARE;
  const canvas = createCanvas(W, H);
  const g = canvas.getContext('2d');
  const rnd = seeded(1147);
  const px = ([x, y]) => [x * SQUARE, y * SQUARE];
  const path = (poly) => {
    g.beginPath();
    poly.forEach((p, i) => (i ? g.lineTo(...px(p)) : g.moveTo(...px(p))));
    g.closePath();
  };

  // Land: parchment with a little mottling.
  g.fillStyle = '#d9cfa8';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(${120 + rnd() * 40 | 0}, ${110 + rnd() * 40 | 0}, ${70 + rnd() * 20 | 0}, 0.06)`;
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, 20 + rnd() * 90, 0, Math.PI * 2);
    g.fill();
  }

  // Hills in the south-east and woods along the road.
  g.strokeStyle = '#7a6a48';
  g.lineWidth = 3;
  for (let i = 0; i < 70; i++) {
    const x = (15 + rnd() * 15) * SQUARE;
    const y = (13 + rnd() * 7) * SQUARE;
    if (inside(MARSH, x / SQUARE, y / SQUARE)) continue;
    g.beginPath();
    g.arc(x, y, 28 + rnd() * 18, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  }
  for (let i = 0; i < 220; i++) {
    const x = (13 + rnd() * 6) * SQUARE + rnd() * 60;
    const y = (1 + rnd() * 6) * SQUARE;
    if (inside(MARSH, x / SQUARE, y / SQUARE) || inside(SEA, x / SQUARE, y / SQUARE)) continue;
    g.fillStyle = `rgba(${60 + rnd() * 30 | 0}, ${95 + rnd() * 30 | 0}, 55, 0.85)`;
    g.beginPath();
    g.arc(x, y, 16 + rnd() * 12, 0, Math.PI * 2);
    g.fill();
  }

  // The marsh: green wash, pools and reeds.
  path(MARSH);
  g.fillStyle = 'rgba(110, 140, 90, 0.55)';
  g.fill();
  for (let i = 0; i < 90; i++) {
    const x = 16.5 + rnd() * 11.5;
    const y = 3 + rnd() * 9;
    if (!inside(MARSH, x, y)) continue;
    g.fillStyle = 'rgba(70, 110, 120, 0.55)';
    g.beginPath();
    g.ellipse(x * SQUARE, y * SQUARE, 20 + rnd() * 50, 10 + rnd() * 20, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(60, 80, 40, 0.9)';
  g.lineWidth = 2;
  for (let i = 0; i < 900; i++) {
    const x = 16.5 + rnd() * 11.5;
    const y = 3 + rnd() * 9;
    if (!inside(MARSH, x, y)) continue;
    const bx = x * SQUARE;
    const by = y * SQUARE;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx - 4 + rnd() * 8, by - 12 - rnd() * 8);
    g.stroke();
  }

  // The sea, with waves.
  path(SEA);
  const sea = g.createLinearGradient(0, 0, 12 * SQUARE, 0);
  sea.addColorStop(0, '#3e6680');
  sea.addColorStop(1, '#6f97a8');
  g.fillStyle = sea;
  g.fill();
  g.save();
  path(SEA);
  g.clip();
  g.strokeStyle = 'rgba(230, 240, 245, 0.35)';
  g.lineWidth = 3;
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 12.5 * SQUARE;
    const y = rnd() * H;
    g.beginPath();
    g.arc(x, y, 14, Math.PI * 1.15, Math.PI * 1.85);
    g.arc(x + 26, y, 14, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  }
  g.restore();

  // The coastline: a dark line, then cliffs (hatching on the land side) north and south.
  path(SEA);
  g.strokeStyle = '#2f3b3a';
  g.lineWidth = 6;
  g.stroke();
  g.strokeStyle = '#6b5a3c';
  g.lineWidth = 3;
  for (const [a, b] of [[1, 6], [14, 19]]) {
    for (let i = a; i < b; i++) {
      const [x1, y1] = SEA[i];
      const [x2, y2] = SEA[i + 1];
      for (let t = 0; t < 1; t += 0.08) {
        const x = (x1 + (x2 - x1) * t) * SQUARE;
        const y = (y1 + (y2 - y1) * t) * SQUARE;
        g.beginPath();
        g.moveTo(x + 6, y);
        g.lineTo(x + 30, y + 10);
        g.stroke();
      }
    }
  }

  // The Teeth: rocks across the mouth of the bay.
  g.fillStyle = '#2b2b2b';
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = (7.2 + t * 2.2 + (rnd() - 0.5) * 0.3) * SQUARE;
    const y = (8.2 + t * 3.4 + (rnd() - 0.5) * 0.3) * SQUARE;
    g.beginPath();
    g.moveTo(x, y - 12);
    g.lineTo(x + 10, y + 8);
    g.lineTo(x - 10, y + 8);
    g.closePath();
    g.fill();
  }

  // Saltreach: a huddle of roofs on the shore.
  for (let i = 0; i < 40; i++) {
    const x = (12.3 + rnd() * 1.6) * SQUARE;
    const y = (9.3 + rnd() * 1.6) * SQUARE;
    if (inside(SEA, x / SQUARE, y / SQUARE)) continue;
    g.fillStyle = rnd() < 0.5 ? '#7d4b3a' : '#5c5c63';
    g.fillRect(x - 10, y - 8, 20, 16);
    g.strokeStyle = '#2a2a2a';
    g.lineWidth = 1.5;
    g.strokeRect(x - 10, y - 8, 20, 16);
  }
  // Fenwick: a few huts on stilts.
  for (let i = 0; i < 9; i++) {
    const x = (19 + rnd() * 1) * SQUARE;
    const y = (12 + rnd() * 0.8) * SQUARE;
    g.fillStyle = '#8a7a50';
    g.fillRect(x - 9, y - 7, 18, 14);
  }
  // The lighthouse.
  const [lx, ly] = px([7.5, 5.5]);
  g.fillStyle = '#f2efe6';
  g.strokeStyle = '#2a2a2a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(lx - 14, ly + 30);
  g.lineTo(lx - 8, ly - 30);
  g.lineTo(lx + 8, ly - 30);
  g.lineTo(lx + 14, ly + 30);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#c23b22';
  g.fillRect(lx - 9, ly - 6, 18, 8);
  g.fillStyle = '#3a3a3a';
  g.fillRect(lx - 11, ly - 42, 22, 12);

  // Names.
  const label = (text, [x, y], { size = 46, font = 'IM Fell English', style = '', color = '#2a2418', rotate = 0 } = {}) => {
    g.save();
    g.translate(x * SQUARE, y * SQUARE);
    g.rotate(rotate);
    g.font = `${style} ${size}px "${font}", serif`.trim();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(240, 232, 205, 0.85)';
    g.strokeText(text, 0, 0);
    g.fillStyle = color;
    g.fillText(text, 0, 0);
    g.restore();
  };
  label('THE GREYHALLOW COAST', [21, 1.4], { size: 64, font: 'Cinzel' });
  label('The Grey Sea', [3.5, 10], { size: 70, style: 'italic', color: '#e8eef0', rotate: -Math.PI / 2 });
  label('Saltreach', [14.4, 9.1], { size: 52 });
  label('Lamplight Point', [7.2, 4.1], { size: 40 });
  label('The Teeth', [9.9, 9.4], { size: 34, style: 'italic', color: '#e8eef0', rotate: 0.9 });
  label('The Gull Steps', [10.4, 15.6], { size: 38 });
  label('The Sallowmere', [22.3, 7.6], { size: 56, style: 'italic', color: '#26371f' });
  label('Fenwick', [20.6, 13.3], { size: 36 });
  label('to Varrowgate', [28.2, 16.4], { size: 34, style: 'italic' });
  label('Tidewood Hills', [24, 17.6], { size: 40, style: 'italic', color: '#4d4029' });

  // A compass rose in the sea.
  const [cx, cy] = px([3, 17]);
  g.strokeStyle = '#e8eef0';
  g.fillStyle = '#e8eef0';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, 60, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(cx, cy - 90);
  g.lineTo(cx + 14, cy);
  g.lineTo(cx, cy + 90);
  g.lineTo(cx - 14, cy);
  g.closePath();
  g.fill();
  label('N', [3, 17 - 1.2], { size: 36, color: '#e8eef0', font: 'Cinzel' });

  return canvas.toBuffer('image/png');
}
