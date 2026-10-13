import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATORS, designBuilder, generateDesign } from '../src/map-generate.js';
import { BUILT_IN_STAMPS } from '../src/map-stamps.js';
import { ASSETS, EMPTY, FLOORS, normalizeClip, normalizeDesign } from '../src/map-design.js';

/** A design without its ids (they're random), to compare two made from the same seed. */
const plain = (d) => ({
  ...d,
  walls: d.walls.map(({ id: _id, ...w }) => w),
  assets: d.assets.map(({ id: _id, ...a }) => a),
  paths: d.paths.map(({ id: _id, ...p }) => p),
  labels: d.labels.map(({ id: _id, ...l }) => l),
});

test('every kind of starting map: a valid design of its usual size, the same for the same seed, different for another', () => {
  for (const [kind, g] of Object.entries(GENERATORS)) {
    const d = generateDesign(kind, { seed: 7 });
    assert.deepEqual([d.cols, d.rows], [g.cols, g.rows], kind);
    assert.deepEqual(plain(normalizeDesign(d)), plain(d), `${kind} is already clean`);
    assert.deepEqual(plain(generateDesign(kind, { seed: 7 })), plain(d), `${kind} is the same for the same seed`);
    assert.notDeepEqual(plain(generateDesign(kind, { seed: 8 })), plain(d), `${kind} differs for another seed`);
    const floored = d.floor.join('').replace(new RegExp(`\\${EMPTY}`, 'g'), '').length;
    assert.ok(floored > d.cols * d.rows * 0.3, `${kind} has floor`);
    assert.ok(d.assets.length >= 10, `${kind} has things in it`);
    assert.ok(d.assets.every((a) => ASSETS[a.a] && a.x >= 0 && a.y >= 0 && a.x <= d.cols && a.y <= d.rows), `${kind}'s things are known and on the map`);
    assert.ok(d.floor.every((l) => [...l].every((ch) => ch === EMPTY || FLOORS[ch])), kind);
    assert.ok(d.walls.every((w) => Math.max(w.x1, w.x2) <= d.cols && Math.max(w.y1, w.y2) <= d.rows), kind);
  }
});

test('what each kind has: rooms with doors indoors, water and a bridge at the crossing, a camp fire', () => {
  const count = (d, type) => d.walls.filter((w) => w.type === type).length;
  const has = (d, a) => d.assets.some((x) => x.a === a);
  for (const kind of ['dungeon', 'tavern', 'crypt', 'village']) {
    const d = generateDesign(kind, { seed: 3 });
    assert.ok(count(d, 'wall') >= 8, `${kind} has walls`);
    assert.ok(count(d, 'door') + count(d, 'arch') >= 2, `${kind} has ways in`);
  }
  const dungeon = generateDesign('dungeon', { seed: 3 });
  assert.ok(has(dungeon, 'torch'));
  const cave = generateDesign('cave', { seed: 3 });
  assert.ok(cave.walls.length > 20 && cave.walls.every((w) => w.style === 'cave'), 'cave walls round the caverns');
  const crossing = generateDesign('crossing', { seed: 3 });
  assert.ok(crossing.paths.some((p) => p.kind === 'river') || crossing.floor.some((l) => /[WD]/.test(l)), 'a river');
  assert.ok(has(crossing, 'bridge') || has(crossing, 'bridge_stone'));
  assert.ok(has(generateDesign('camp', { seed: 3 }), 'campfire'));
  assert.ok(has(generateDesign('forest', { seed: 3 }), 'tree') || has(generateDesign('forest', { seed: 3 }), 'pine'));
  assert.ok(has(generateDesign('tavern', { seed: 3 }), 'bar'));
});

test('a size of its own (within limits), and an unknown kind refused', () => {
  const d = generateDesign('forest', { cols: 20, rows: 16, seed: 1 });
  assert.deepEqual([d.cols, d.rows], [20, 16]);
  const small = generateDesign('dungeon', { cols: 2, rows: 2, seed: 1 });
  assert.deepEqual([small.cols, small.rows], [16, 12]);
  const big = generateDesign('village', { cols: 999, rows: 999, seed: 1 });
  assert.deepEqual([big.cols, big.rows], [60, 60]);
  assert.throws(() => generateDesign('spaceship'), /Unknown kind/);
});

test('the builder: areas walled where they meet, doors cut in, things put against walls', () => {
  const b = designBuilder(10, 8, 1, 1);
  b.fill(0, 0, 10, 8, 'g');
  b.fill(1, 1, 4, 3, 's', 1);
  b.style(1, 'brick');
  b.autoWalls();
  b.setEdge(2, 3, 'S', 'door');
  b.against({ x: 1, y: 1, w: 4, h: 3 }, 'N', 'bookshelf', 2);
  const d = b.done({ mood: 'night' });
  assert.deepEqual(d.walls.filter((w) => w.type === 'door').map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2]), [[2, 4, 3, 4]]);
  assert.ok(d.walls.filter((w) => w.type === 'wall').every((w) => w.style === 'brick'));
  assert.equal(d.walls.filter((w) => w.type === 'wall').length, 5, 'four sides, the south one either side of the door');
  assert.deepEqual(d.assets.map((a) => [a.a, a.x, a.y, a.rot]), [['bookshelf', 3, 1.31, 0]]);
  assert.equal(d.look.mood, 'night');
});

test('the built-in stamps: clean clips of known things, each with its own id and a group', () => {
  assert.equal(BUILT_IN_STAMPS.length, 35);
  assert.equal(new Set(BUILT_IN_STAMPS.map((s) => s.id)).size, 35);
  for (const s of BUILT_IN_STAMPS) {
    assert.match(s.id, /^b:[a-z_]+$/);
    assert.ok(s.name && ['Rooms', 'Dungeon', 'Outdoors', 'Ships'].includes(s.group), s.id);
    assert.ok(s.clip.assets.length >= 3, `${s.id} has things in it`);
    assert.ok(s.clip.assets.every((a) => ASSETS[a.a]), s.id);
    const again = normalizeClip(s.clip);
    assert.deepEqual(plain({ ...again, paths: [], labels: [] }), plain({ ...s.clip, paths: [], labels: [] }), `${s.id} is already clean`);
  }
});
