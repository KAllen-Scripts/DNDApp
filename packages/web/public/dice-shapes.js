/**
 * Dice shapes and their maths, for the Deluxe dice (dice-deluxe.js) and their
 * physics (dice-physics.js): the d4 to d20 solids with numbered faces, which
 * number a turned die shows, and the turn of its numbers that makes it show
 * the server's number instead (relabel). Rotations are quaternions [w, x, y, z].
 */

const TAU = Math.PI * 2;

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

/**
 * The turns that leave a die's shape where it was (60 for a d20, 24 for a d6,
 * 10 for a d10...). A physics roll lands on whatever face it lands on; turning
 * the die's numbers by one of these, while the shape stays put, makes the
 * right number come up without changing how the throw looked.
 */
export function symmetries(shape) {
  const solid = SHAPES[shape];
  if (solid.symmetries) return solid.symmetries;
  const f0 = solid.faces[0];
  const a0 = norm(sub(solid.verts[f0.idx[0]], f0.center));
  const out = [];
  for (const f of solid.faces) {
    for (const j of f.idx) {
      const q1 = quat.between(f0.normal, f.normal);
      const a = quat.rotate(q1, a0);
      const b = norm(sub(solid.verts[j], f.center));
      const angle = Math.atan2(dot(cross(a, b), f.normal), dot(a, b));
      const q = quat.mul(quat.axisAngle(f.normal, angle), q1);
      const keeps = solid.verts.every((v) => solid.verts.some((w) => Math.hypot(...sub(quat.rotate(q, v), w)) < 1e-6));
      if (keeps) out.push(q);
    }
  }
  return (solid.symmetries = out);
}

/**
 * Where a number is on a die, as a direction from its middle: the face for most
 * dice; on a d4 the corner (a d4 is read at its top corner, the number
 * printed by that corner on each face).
 */
export function numberDirection(shape, value) {
  const solid = SHAPES[shape];
  if (shape === 'd4') return norm(solid.verts[value - 1]);
  return (solid.faces.find((f) => f.value === faceFor(shape, value)) ?? solid.faces[0]).normal;
}

/** The number a die turned by q shows to the viewer (+z). */
export function readDie(shape, q) {
  const solid = SHAPES[shape];
  if (shape === 'd4') {
    let best = 0;
    solid.verts.forEach((v, i) => { if (quat.rotate(q, v)[2] > quat.rotate(q, solid.verts[best])[2]) best = i; });
    return best + 1;
  }
  let best = solid.faces[0];
  for (const f of solid.faces) if (quat.rotate(q, f.normal)[2] > quat.rotate(q, best.normal)[2]) best = f;
  return shape === 'd100' ? best.value * 10 : best.value;
}

/** The turn of a die's numbers (in its own frame) that makes a die resting at q show value instead. */
export function relabel(shape, q, value) {
  const landed = numberDirection(shape, readDie(shape, q));
  const wanted = numberDirection(shape, value);
  return symmetries(shape).find((s) => Math.hypot(...sub(quat.rotate(s, wanted), landed)) < 1e-6) ?? [1, 0, 0, 0];
}
