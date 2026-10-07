/**
 * Light dice rollers: no WebGL, no physics engine, nothing to download. The
 * dice are drawn on one 2D canvas and follow a scripted throw (slide in,
 * bounce, tumble) that ends on the server's numbers.
 *
 * - "lite": 3D-looking dice (real d4 to d20 shapes, shaded faces, numbers on
 *   the faces), turned by a few lines of maths per frame.
 * - "flat": flat dice shapes that spin in with their numbers flickering.
 *
 * Both behave like the 3D library (dice-box-threejs) as far as dice.js is
 * concerned: initialize, updateConfig, roll("1d20+2d6@14,3,5"), clearDice,
 * diceList (each with shape and getLastValue) and screenPosition(die). Once
 * the dice land the canvas is left alone, so nothing runs between rolls.
 */

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- vectors and rotations (quaternions as [w, x, y, z]) ----------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a) => scale(a, 1 / (Math.hypot(...a) || 1));
const mean = (pts) => scale(pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]), 1 / pts.length);

export const quat = {
  axisAngle(axis, angle) {
    const [x, y, z] = norm(axis);
    const s = Math.sin(angle / 2);
    return [Math.cos(angle / 2), x * s, y * s, z * s];
  },
  mul(a, b) {
    return [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
    ];
  },
  rotate(q, v) {
    const [w, x, y, z] = q;
    const t = scale(cross([x, y, z], v), 2);
    return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
  },
  /** The rotation that turns direction a onto direction b. */
  between(a, b) {
    a = norm(a);
    b = norm(b);
    const d = dot(a, b);
    if (d < -0.999999) return quat.axisAngle(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]), Math.PI);
    const c = cross(a, b);
    const q = [1 + d, c[0], c[1], c[2]];
    const n = Math.hypot(...q);
    return q.map((v) => v / n);
  },
};

// ---------- the dice shapes ----------

/** Faces from vertices: outward normal, centre, an "up" direction for the number, and the number. */
function makeSolid(verts, faceIdx, values, { upFromEdge = false } = {}) {
  const r = Math.max(...verts.map((v) => Math.hypot(...v)));
  verts = verts.map((v) => scale(v, 1 / r)); // fits a unit sphere
  const faces = faceIdx.map((idx, i) => {
    const pts = idx.map((j) => verts[j]);
    const center = mean(pts);
    let normal = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    if (dot(normal, center) < 0) normal = scale(normal, -1);
    // Numbers point at a corner (d20, d8, d4, d12, d10's tip), or at an edge on a d6.
    const toward = upFromEdge ? mean([pts[0], pts[1]]) : pts[0];
    const up = norm(sub(sub(toward, center), scale(normal, dot(sub(toward, center), normal))));
    return { idx, normal, center, up, value: values[i], inradius: Math.min(...pts.map((p, k) => Math.hypot(...sub(mean([p, pts[(k + 1) % pts.length]]), center)))) };
  });
  return { verts, faces };
}

/** The faces around each vertex of a solid, in order: how the d12 is made from the d20. */
function facesAround(verts, faces, v) {
  const around = faces.map((f, i) => (f.includes(v) ? i : -1)).filter((i) => i >= 0);
  const n = norm(verts[v]);
  const centers = around.map((i) => mean(faces[i].map((j) => verts[j])));
  const ref = norm(sub(centers[0], scale(n, dot(centers[0], n))));
  const side = cross(n, ref);
  return around.map((i, k) => ({ i, a: Math.atan2(dot(centers[k], side), dot(centers[k], ref)) })).sort((x, y) => x.a - y.a).map((x) => x.i);
}

function icosahedron() {
  const p = (1 + Math.sqrt(5)) / 2;
  const verts = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]];
  const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { verts, faces };
}

const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);

/** Opposite faces add up to sides + 1, like real dice. */
function oppositeValues(solid, sides) {
  const values = new Array(solid.faces.length).fill(0);
  let next = 1;
  for (let i = 0; i < solid.faces.length; i++) {
    if (values[i]) continue;
    const n = norm(mean(solid.faces[i].map((j) => solid.verts[j])));
    const opp = solid.faces.findIndex((f, k) => !values[k] && k !== i && dot(norm(mean(f.map((j) => solid.verts[j]))), n) < -0.999);
    values[i] = next;
    if (opp >= 0) values[opp] = sides + 1 - next;
    next++;
  }
  return values;
}

function buildShapes() {
  const shapes = {};
  {
    const verts = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    shapes.d4 = makeSolid(verts, [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]], [1, 2, 3, 4]);
  }
  {
    const verts = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) verts.push([x, y, z]);
    const faces = [[4, 5, 7, 6], [0, 2, 3, 1], [2, 6, 7, 3], [0, 1, 5, 4], [1, 3, 7, 5], [0, 4, 6, 2]];
    shapes.d6 = makeSolid(verts, faces, [1, 6, 2, 5, 3, 4], { upFromEdge: true });
  }
  {
    const verts = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const faces = [];
    for (const z of [4, 5]) for (const x of [0, 1]) for (const y of [2, 3]) faces.push([z, x, y]);
    const solid = { verts, faces };
    shapes.d8 = makeSolid(verts, faces, oppositeValues(solid, 8));
  }
  {
    // Pentagonal trapezohedron: two tips and a zig-zag ring; flat kites when ring height = h(1-c)/(1+c).
    const h = 1;
    const c = Math.cos(Math.PI / 5);
    const a = (h * (1 - c)) / (1 + c);
    const verts = [[0, 0, h], [0, 0, -h]];
    for (let k = 0; k < 5; k++) verts.push([Math.cos((k * TAU) / 5), Math.sin((k * TAU) / 5), a]); // 2..6
    for (let k = 0; k < 5; k++) verts.push([Math.cos((k * TAU) / 5 + Math.PI / 5), Math.sin((k * TAU) / 5 + Math.PI / 5), -a]); // 7..11
    const faces = [];
    for (let k = 0; k < 5; k++) faces.push([0, 2 + k, 7 + k, 2 + ((k + 1) % 5)]);
    for (let k = 0; k < 5; k++) faces.push([1, 7 + k, 2 + ((k + 1) % 5), 7 + ((k + 1) % 5)]);
    shapes.d10 = makeSolid(verts, faces, [1, 3, 5, 7, 9, 2, 4, 6, 8, 10]);
  }
  {
    const ico = icosahedron();
    shapes.d20 = makeSolid(ico.verts, ico.faces, oppositeValues(ico, 20));
    // The d12 is the d20's dual: a corner for each d20 face, a face for each d20 corner.
    const verts = ico.faces.map((f) => mean(f.map((j) => ico.verts[j])));
    const faces = ico.verts.map((_, v) => facesAround(ico.verts, ico.faces, v));
    shapes.d12 = makeSolid(verts, faces, oppositeValues({ verts, faces }, 12));
  }
  shapes.d100 = shapes.d10;
  return shapes;
}

export const SHAPES = buildShapes();

/** "1d20+2d6@14,3,5" → [{ shape: 'd20', value: 14 }, ...]. A d100 is the tens die: 40 shows "40", 100 shows "00". */
export function parseForced(notation) {
  const [dice, forced = ''] = String(notation).split('@');
  const values = forced.split(',').filter(Boolean).map(Number);
  const out = [];
  for (const part of dice.split('+')) {
    const m = /^(\d+)d(\d+)$/.exec(part.trim());
    if (!m) continue;
    for (let i = 0; i < Number(m[1]); i++) out.push({ shape: `d${m[2]}`, value: values[out.length] ?? 1 });
  }
  return out;
}

/** What's written on a face: a d100's faces are tens ("00" for 100), a d10's 10 shows as "0". */
export function faceLabel(shape, value) {
  if (shape === 'd100') return value === 100 ? '00' : String(value);
  if (shape === 'd10' && value === 10) return '0';
  return String(value);
}

/** Which face value a die shows for a number (a d100 tens die's 40 is face 4, 100 is face 10). */
const faceFor = (shape, value) => (shape === 'd100' ? value / 10 : value);

/**
 * The die's resting turn: the face with the value toward the viewer, its
 * number upright (give or take tilt radians).
 */
export function restingRotation(shape, value, tilt = 0) {
  const face = SHAPES[shape].faces.find((f) => f.value === faceFor(shape, value)) ?? SHAPES[shape].faces[0];
  const align = quat.between(face.normal, [0, 0, 1]);
  const up = quat.rotate(align, face.up);
  const spin = Math.PI / 2 - Math.atan2(up[1], up[0]) + tilt;
  return quat.mul(quat.axisAngle([0, 0, 1], spin), align);
}

/** Where n dice come to rest: a tidy cluster around (cx, cy), spacing apart. */
export function restingSpots(n, cx, cy, spacing) {
  const cols = Math.ceil(Math.sqrt(n * 1.6));
  const rows = Math.ceil(n / cols);
  const spots = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const col = i % cols;
    spots.push({
      x: cx + (col - (inRow - 1) / 2) * spacing + (row % 2 ? spacing / 4 : 0),
      y: cy + (row - (rows - 1) / 2) * spacing * 0.9,
    });
  }
  return spots;
}

// ---------- colours ----------

function rgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [139, 46, 46];
  const s = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
const css = ([r, g, b], k = 1) => `rgb(${Math.min(255, Math.round(r * k))}, ${Math.min(255, Math.round(g * k))}, ${Math.min(255, Math.round(b * k))})`;
const pickFrom = (c, i) => (Array.isArray(c) ? c[i % c.length] : c);

const LIGHT = norm([-0.45, 0.55, 0.85]);
// How big each die is drawn, next to the others (the shapes all fit the same sphere, so a d20 looks small).
const SIZE = { d4: 1, d6: 0.95, d8: 1.05, d10: 1.1, d100: 1.1, d12: 1.15, d20: 1.2 };

// ---------- the roller ----------

const BOUNCES = [[0, 0.42, 1], [0.42, 0.7, 0.4], [0.7, 0.88, 0.14]];
const height = (p) => {
  for (const [s, e, amp] of BOUNCES) if (p >= s && p < e) return amp * Math.sin((Math.PI * (p - s)) / (e - s));
  return 0;
};
const easeOut = (p) => 1 - (1 - p) ** 3;

export default class LiteDice {
  constructor(selector, options = {}) {
    this.container = document.querySelector(selector);
    this.flat = options.mode === 'flat';
    this.sounds = false; // no dice sounds; dice.js still plays its chimes
    this.theme_customColorset = options.theme_customColorset ?? null;
    this.duration = options.duration ?? (this.flat ? 800 : 1150);
    this.diceList = [];
    this.frame = null;
  }

  async initialize() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) throw new Error('No canvas on this device');
    this.container.append(this.canvas);
  }

  async updateConfig(config) {
    if ('theme_customColorset' in config) this.theme_customColorset = config.theme_customColorset;
  }

  async loadSounds() {}

  /** Where a die is now, in page coordinates. */
  screenPosition(die) {
    const rect = this.container.getBoundingClientRect();
    return { x: rect.left + die.x, y: rect.top + die.y };
  }

  clearDice() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.finish?.();
    this.diceList = [];
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  roll(notation) {
    this.clearDice();
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
    const dice = parseForced(notation);
    const size = Math.max(14, Math.min(60, Math.max(30, Math.min(w, h) * 0.055)) * Math.min(1, Math.sqrt(8 / Math.max(dice.length, 1))));
    const spots = restingSpots(dice.length, w / 2 + rand(-w, w) * 0.06, h * 0.55 + rand(-h, h) * 0.04, size * 2.5);
    const fromLeft = Math.random() < 0.5;
    const colors = this.theme_customColorset ?? {};
    this.diceList = dice.map((d, i) => {
      const spot = spots[i];
      const value = d.value;
      return {
        shape: d.shape,
        value,
        size: size * (this.flat ? 1 : SIZE[d.shape] ?? 1),
        from: { x: fromLeft ? -size * 2 - rand(0, size * 3) : w + size * 2 + rand(0, size * 3), y: spot.y + rand(-h, h) * 0.25 },
        to: { x: spot.x + rand(-1, 1) * size * 0.25, y: spot.y + rand(-1, 1) * size * 0.25 },
        delay: Math.min(i * 45, 300),
        // Resting with the number toward the viewer, leaning a little so the sides show.
        rest: quat.mul(quat.axisAngle([rand(-1, 1), rand(-1, 1), 0], rand(0.15, 0.3)), restingRotation(d.shape, value, rand(-0.3, 0.3))),
        axis: [rand(-1, 1), rand(-1, 1), rand(-1, 1)],
        turns: rand(2.5, 4.5) * TAU,
        flatSpin: rand(2, 3.5) * TAU * (Math.random() < 0.5 ? -1 : 1),
        color: rgb(pickFrom(colors.background ?? '#8b2e2e', i)),
        ink: pickFrom(colors.foreground ?? '#ffffff', i),
        outline: colors.outline && colors.outline !== 'none' ? colors.outline : null,
        h: 0,
        p: 0,
        getLastValue: () => ({ value }),
      };
    });
    return new Promise((resolve) => {
      const start = performance.now();
      this.finish = () => {
        this.finish = null;
        resolve();
      };
      const tick = () => {
        const done = this.draw(performance.now() - start);
        if (done) {
          this.frame = null;
          this.finish?.();
        } else {
          this.frame = requestAnimationFrame(tick);
        }
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  /** One frame, ms after the throw. True once every die has landed. */
  draw(ms) {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    let done = true;
    for (const d of this.diceList) {
      d.p = Math.max(0, Math.min(1, (ms - d.delay) / this.duration));
      if (d.p < 1) done = false;
      const e = easeOut(d.p);
      d.x = d.from.x + (d.to.x - d.from.x) * e;
      d.y = d.from.y + (d.to.y - d.from.y) * e;
      d.h = this.flat ? height(d.p) * 0.5 : height(d.p);
    }
    // Higher dice over lower ones, then front (lower on screen) over back.
    const order = [...this.diceList].sort((a, b) => a.h - b.h || a.y - b.y);
    for (const d of order) this.shadow(d);
    for (const d of order) (this.flat ? this.drawFlat(d) : this.drawSolid(d));
    return done;
  }

  shadow(d) {
    const { ctx } = this;
    const r = d.size * (1 + d.h * 0.3);
    ctx.globalAlpha = 0.28 * (1 - d.h * 0.5);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(d.x + d.size * (0.12 + d.h * 0.7), d.y + d.size * (0.18 + d.h * 0.9), r * 0.85, r * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawSolid(d) {
    const { ctx } = this;
    const solid = SHAPES[d.shape] ?? SHAPES.d20;
    const angle = d.turns * (1 - d.p) ** 2.5;
    const q = angle ? quat.mul(d.rest, quat.axisAngle(d.axis, angle)) : d.rest;
    const s = d.size * (1 + d.h * 0.45);
    const focal = 6; // a little perspective
    const project = (v) => {
      const p = quat.rotate(q, v);
      const k = (s * focal) / (focal - p[2]);
      return [d.x + p[0] * k, d.y - p[1] * k, k];
    };
    const pts = solid.verts.map(project);
    for (const face of solid.faces) {
      const n = quat.rotate(q, face.normal);
      if (n[2] <= 0.01) continue; // facing away
      const light = 0.5 + 0.6 * Math.max(0, dot(n, LIGHT));
      ctx.beginPath();
      for (const j of face.idx) ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.closePath();
      ctx.fillStyle = css(d.color, light);
      ctx.fill();
      ctx.strokeStyle = d.outline ?? css(d.color, 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
      if (n[2] < 0.3) continue; // too edge-on to read
      const [cx, cy, k] = project(face.center);
      const up = quat.rotate(q, face.up);
      const right = cross(up, n);
      const em = (face.inradius * k * (d.shape === 'd100' ? 0.95 : face.idx.length === 3 ? 1.05 : 1.25)) / 100;
      ctx.save();
      ctx.setTransform(this.dpr * right[0] * em, -this.dpr * right[1] * em, -this.dpr * up[0] * em, this.dpr * up[1] * em, this.dpr * cx, this.dpr * cy);
      ctx.globalAlpha = Math.min(1, (n[2] - 0.3) * 4);
      ctx.fillStyle = d.ink;
      ctx.font = `bold ${d.shape === 'd100' ? 62 : 90}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = faceLabel(d.shape, d.shape === 'd100' ? face.value * 10 : face.value);
      ctx.fillText(label, 0, 4);
      if (label === '6' || label === '9') ctx.fillRect(-22, 40, 44, 7); // tell 6 from 9
      ctx.restore();
    }
  }

  drawFlat(d) {
    const { ctx } = this;
    const sides = { d4: 3, d6: 4, d8: 4, d10: 4, d100: 4, d12: 5, d20: 6 }[d.shape] ?? 6;
    const r = d.size * (1 + d.h * 0.4) * (d.shape === 'd6' ? 0.9 : 1);
    const base = (d.shape === 'd6' ? Math.PI / 4 : 0) - Math.PI / 2;
    const turn = d.flatSpin * (1 - d.p) ** 2.5;
    const stretch = d.shape === 'd10' || d.shape === 'd100' ? 1.25 : 1; // a d10 is a tall kite
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(turn);
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = base + (i * TAU) / sides;
      const k = i % 2 ? 1 : stretch;
      ctx.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, css(d.color, 1.25));
    g.addColorStop(1, css(d.color, 0.75));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = d.outline ?? css(d.color, 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
    if (d.shape === 'd20') {
      // The front face of a d20, inside the hexagon.
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = base + (i * TAU) / 3;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // The number: flickers while spinning, then the real one, always upright.
    const max = { d100: 100, d10: 10 }[d.shape] ?? Number(d.shape.slice(1));
    const shown = d.p < 0.8 ? (d.shape === 'd100' ? 10 * (1 + Math.floor(Math.random() * 10)) : 1 + Math.floor(Math.random() * max)) : d.value;
    ctx.rotate(-turn);
    ctx.fillStyle = d.ink;
    ctx.font = `bold ${Math.round(r * (d.shape === 'd100' ? 0.6 : d.shape === 'd20' ? 0.5 : 0.75))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(faceLabel(d.shape, shown), 0, r * 0.05);
    ctx.restore();
  }
}
