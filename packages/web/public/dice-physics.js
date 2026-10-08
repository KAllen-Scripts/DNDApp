/**
 * The throw for the Deluxe dice, worked out in one go before anything is drawn
 * (cannon-es, a few milliseconds): every die's position and turn at each step,
 * when dice hit something (for sounds), and how far to turn each die's numbers
 * so it lands on the server's number (relabel in dice-shapes.js). Drawing the
 * throw is then only replaying the recording, with no physics while it plays.
 *
 * Units: a die is about 2 across; the table is z = 0 and the viewer looks
 * down from +z, so x and y are across and up the screen.
 */
import * as CANNON from '/vendor/cannon-es.js';
import { SHAPES, relabel, quat } from './dice-shapes.js';

export const STEP = 1 / 120; // seconds of throw per recorded step
const MAX_STEPS = 4.5 / STEP;
const RADIUS = { d4: 1.15, d6: 0.95, d8: 1.05, d10: 1.05, d100: 1.05, d12: 1.1, d20: 1.15 };
export const dieRadius = (shape) => RADIUS[shape] ?? 1;

const shapes = new Map();
/** cannon's shape for a die (made once per kind). Faces must go anticlockwise seen from outside. */
function shapeFor(kind) {
  if (!shapes.has(kind)) {
    const solid = SHAPES[kind];
    const r = dieRadius(kind);
    const vertices = solid.verts.map(([x, y, z]) => new CANNON.Vec3(x * r, y * r, z * r));
    const faces = solid.faces.map((f) => {
      const [a, b, c] = f.idx.map((i) => solid.verts[i]);
      const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      const out = n[0] * f.center[0] + n[1] * f.center[1] + n[2] * f.center[2] > 0;
      return out ? [...f.idx] : [...f.idx].reverse();
    });
    shapes.set(kind, new CANNON.ConvexPolyhedron({ vertices, faces }));
  }
  return shapes.get(kind);
}

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Throw dice ([{ shape, value }]) onto a table halfW × halfH (the walls are
 * the screen's edges). Returns { frames: Float32Array per step (x, y, z, qx,
 * qy, qz, qw per die), steps, hits: [{ step, speed }], fixes: the turn
 * (quaternion [w, x, y, z]) to give each die's numbers }.
 */
export function simulate(dice, { halfW, halfH, gravity = 140 }) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, -gravity), allowSleep: true });
  // A handful of dice: checking every pair is cheapest. Many: sort them along an axis first.
  world.broadphase = dice.length > 8 ? new CANNON.SAPBroadphase(world) : new CANNON.NaiveBroadphase();
  world.solver.iterations = 12;
  const table = new CANNON.Material('table');
  const wall = new CANNON.Material('wall');
  const die = new CANNON.Material('die');
  world.addContactMaterial(new CANNON.ContactMaterial(table, die, { friction: 0.35, restitution: 0.35 }));
  world.addContactMaterial(new CANNON.ContactMaterial(wall, die, { friction: 0.1, restitution: 0.6 }));
  world.addContactMaterial(new CANNON.ContactMaterial(die, die, { friction: 0.2, restitution: 0.4 }));

  world.addBody(new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: table }));
  const walls = [
    [[-halfW, 0, 0], [0, Math.PI / 2, 0]],
    [[halfW, 0, 0], [0, -Math.PI / 2, 0]],
    [[0, -halfH, 0], [-Math.PI / 2, 0, 0]],
    [[0, halfH, 0], [Math.PI / 2, 0, 0]],
  ];
  for (const [p, e] of walls) {
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: wall });
    body.position.set(...p);
    body.quaternion.setFromEuler(...e);
    world.addBody(body);
  }
  // A lid, so nothing flies out of view.
  const lid = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: wall });
  lid.position.set(0, 0, 14);
  lid.quaternion.setFromEuler(Math.PI, 0, 0);
  world.addBody(lid);

  // Thrown in together from one side, spread along it.
  const side = Math.floor(Math.random() * 4);
  const bodies = dice.map((d, i) => {
    const r = dieRadius(d.shape);
    const along = (i + 0.5) / dice.length - 0.5 + rand(-0.08, 0.08);
    const horizontal = side < 2;
    const sign = side % 2 ? 1 : -1; // which edge
    const x = horizontal ? sign * (halfW - r * 1.6) : along * halfW * 1.2;
    const y = horizontal ? along * halfH * 1.2 : sign * (halfH - r * 1.6);
    const body = new CANNON.Body({
      mass: 1, shape: shapeFor(d.shape), material: die,
      linearDamping: 0.3, angularDamping: 0.3,
      sleepSpeedLimit: 1.2, sleepTimeLimit: 0.12,
    });
    body.position.set(x, y, rand(3, 6) + r);
    body.quaternion.setFromEuler(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
    const speed = rand(24, 34);
    const aim = Math.atan2(-y + rand(-halfH, halfH) * 0.25, -x + rand(-halfW, halfW) * 0.25);
    body.velocity.set(Math.cos(aim) * speed, Math.sin(aim) * speed, rand(-2, 4));
    body.angularVelocity.set(rand(-18, 18), rand(-18, 18), rand(-10, 10));
    world.addBody(body);
    return body;
  });

  const hits = [];
  let step = 0;
  for (const body of bodies) {
    body.addEventListener('collide', (e) => {
      const speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (speed > 3) hits.push({ step, speed });
    });
  }

  const frames = [];
  const record = () => {
    const f = new Float32Array(bodies.length * 7);
    bodies.forEach((b, i) => f.set([b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], i * 7));
    frames.push(f);
  };
  record();
  while (step < MAX_STEPS) {
    world.step(STEP);
    step++;
    record();
    if (bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING)) break;
  }
  const fixes = bodies.map((b, i) => relabel(dice[i].shape, [b.quaternion.w, b.quaternion.x, b.quaternion.y, b.quaternion.z], dice[i].value));
  return { frames, steps: frames.length, hits, fixes };
}

export { quat };
