import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSETS, DESIGN_MAX, EMPTY, FLOORS, addRoom, addWall, assetAt, assetOutline, brushCells, designToMap, difficultAreas,
  drawDesign, emptyDesign, eraseWallAt, fillFloor, normalizeDesign, paintFloor, resizeDesign, seeded, uploadedRefs,
} from '../src/map-design.js';
import { normalizeMap } from '../src/map.js';

test('normalizeDesign: sizes limited, unknown floors emptied, walls put on half squares inside the map, assets checked', () => {
  const d = normalizeDesign({
    cols: 500,
    rows: 2,
    floor: ['gg?W', 'x'],
    walls: [
      { x1: 0.2, y1: 0, x2: 3.74, y2: 0, type: 'wall' },
      { x1: 3.5, y1: 0, x2: 0, y2: 0, type: 'wall' }, // the same wall drawn the other way
      { x1: 1, y1: 1, x2: 1, y2: 1 }, // no length
      { x1: 'a', y1: 0, x2: 1, y2: 0 },
      { x1: -5, y1: 0, x2: 900, y2: 0, type: 'door', style: 'wood' },
    ],
    assets: [
      { id: 'tree01', a: 'tree', x: 2, y: 1, rot: -90 },
      { a: 'nope', x: 1, y: 1 },
      { id: 'up0001', a: 'u:0123456789', x: 1, y: 1, w: 3, h: 1, blocks: 'wall', light: true },
    ],
  });
  assert.equal(d.cols, DESIGN_MAX);
  assert.equal(d.rows, 4, 'at least 4 squares');
  assert.equal(d.floor[0].slice(0, 5), `gg${EMPTY}W${EMPTY}`);
  assert.equal(d.floor[3], EMPTY.repeat(DESIGN_MAX));
  assert.deepEqual(d.walls, [
    { x1: 0, y1: 0, x2: 3.5, y2: 0, type: 'wall', style: 'stone' },
    { x1: 0, y1: 0, x2: 60, y2: 0, type: 'door', style: 'wood' },
  ]);
  assert.deepEqual(d.assets[0], { id: 'tree01', a: 'tree', x: 2, y: 1, w: 2, h: 2, rot: 270, blocks: 'none', light: false });
  assert.equal(d.assets.length, 2);
  assert.equal(d.assets[1].light, false, "an uploaded asset gives no light");
  assert.equal(d.assets[1].blocks, 'wall');
  assert.deepEqual(uploadedRefs(d), ['u:0123456789']);
  // A map document keeps its design normalised.
  assert.equal(normalizeMap({ design: { cols: 5, rows: 5, floor: [] } }).design.floor.length, 5);
  assert.equal(normalizeMap({}).design, null);
});

test('painting floors: a brush, a bucket fill that stops at other floors, and rubbing out', () => {
  let d = emptyDesign(6, 4);
  assert.deepEqual(brushCells(2, 2, 1), [[2, 2]]);
  assert.equal(brushCells(2, 2, 3).length, 9);
  assert.deepEqual(brushCells(2, 2, 3)[0], [1, 1]);
  d = paintFloor(d, brushCells(1, 1, 3), 's');
  assert.deepEqual(d.floor, ['sss...', 'sss...', 'sss...', '......']);
  d = paintFloor(d, [[1, 1], [99, 0], [0, 99]], EMPTY);
  assert.equal(d.floor[1], 's.s...');
  d = fillFloor(d, 5, 0, 'g');
  assert.deepEqual(d.floor, ['sssggg', 's.sggg', 'sssggg', 'gggggg'], 'the bucket fills joined squares, not the hole walled in by stone');
  assert.equal(fillFloor(d, 0, 0, 's'), d, 'filling with the same floor changes nothing');
  assert.ok(Object.keys(FLOORS).every((k) => k.length === 1 && k !== EMPTY));
});

test('walls and doors: a door cuts its doorway out of a wall, a wall drawn over a door goes round it, a room is floored and walled', () => {
  let d = emptyDesign(10, 10);
  d = addWall(d, { x1: 0, y1: 2, x2: 6, y2: 2 });
  d = addWall(d, { x1: 2, y1: 2, x2: 3, y2: 2, type: 'door' });
  assert.deepEqual(d.walls.map(({ x1, x2, type }) => [x1, x2, type]), [[0, 2, 'wall'], [3, 6, 'wall'], [2, 3, 'door']]);
  // Another wall along the same line, over the door: the doorway stays open.
  d = addWall(d, { x1: 0, y1: 2, x2: 8, y2: 2, style: 'wood' });
  assert.ok(!d.walls.some((w) => w.type !== 'door' && w.x1 < 2.5 && w.x2 > 2.5), 'nothing blocks the door');
  // A door across a wall (not along it) doesn't cut it.
  const before = d.walls.length;
  d = addWall(d, { x1: 4, y1: 1, x2: 4, y2: 3, type: 'door' });
  assert.equal(d.walls.length, before + 1);
  d = eraseWallAt(d, 4.1, 1.5);
  assert.equal(d.walls.length, before, 'the nearest wall is rubbed out');
  assert.equal(eraseWallAt(d, 9, 9), d, 'nothing near: nothing changes');

  let room = addRoom(emptyDesign(8, 8), { x1: 5, y1: 4, x2: 1, y2: 1 }, 'w', 'wood');
  assert.deepEqual(room.floor.slice(0, 5), ['........', '.wwww...', '.wwww...', '.wwww...', '........']);
  assert.equal(room.walls.length, 4);
  assert.ok(room.walls.every((w) => w.style === 'wood' && w.type === 'wall'));
  assert.equal(addRoom(room, { x1: 2, y1: 2, x2: 2, y2: 6 }, 's'), room, 'a room needs at least a square');
});

test('assets: picked by where they are drawn (turned), the top one first; resizing drops what falls off', () => {
  const d = normalizeDesign({
    cols: 10, rows: 10,
    assets: [
      { id: 'rug001', a: 'rug', x: 5, y: 5 },
      { id: 'tabl01', a: 'table', x: 5, y: 5, rot: 90 },
      { id: 'tree01', a: 'tree', x: 9, y: 9 },
    ],
  });
  assert.equal(assetAt(d, 5, 5.8).id, 'tabl01', 'the table (turned upright) is on top of the rug');
  assert.equal(assetAt(d, 5.8, 5).id, 'rug001', 'beside the turned table, the rug');
  assert.equal(assetAt(d, 1, 1), null);
  const small = resizeDesign({ ...d, walls: [{ x1: 1, y1: 1, x2: 9, y2: 1, type: 'wall', style: 'stone' }] }, 6, 6);
  assert.equal(small.cols, 6);
  assert.deepEqual(small.assets.map((a) => a.id), ['rug001', 'tabl01']);
  assert.deepEqual(small.walls, []);
  assert.equal(small.floor[0].length, 6);
  const big = resizeDesign(d, 12, 11);
  assert.equal(big.floor.length, 11);
  assert.equal(big.floor[10], EMPTY.repeat(12));
});

test('designToMap: pixels, an exact grid, walls and doors, blocking outlines, lights and difficult terrain joined into rectangles', () => {
  let d = emptyDesign(8, 6, 'g');
  d = addWall(d, { x1: 0, y1: 0, x2: 4, y2: 0 });
  d = addWall(d, { x1: 1, y1: 0, x2: 2, y2: 0, type: 'door' });
  d = addWall(d, { x1: 0, y1: 5, x2: 8, y2: 5, type: 'low' });
  d = paintFloor(d, [[5, 1], [6, 1], [5, 2], [6, 2], [5, 3], [7, 3]], 'W');
  d = normalizeDesign({ ...d, assets: [
    { id: 'fire01', a: 'campfire', x: 2, y: 3 },
    { id: 'fire02', a: 'campfire', x: 3, y: 3, light: false },
    { id: 'bold01', a: 'boulder', x: 1, y: 2 },
    { id: 'crat01', a: 'crate', x: 4, y: 4, rot: 45 },
  ] });
  const m = designToMap(d, 10);
  assert.equal(m.width, 80);
  assert.equal(m.height, 60);
  assert.deepEqual(m.grid, { size: 10, x: 0, y: 0 });
  assert.deepEqual(m.scale, { distance: 5, unit: 'ft', per: 'square' });
  const plain = m.walls.slice(0, 4);
  assert.deepEqual(plain, [
    { x1: 0, y1: 0, x2: 10, y2: 0, door: false, kind: 'wall' },
    { x1: 20, y1: 0, x2: 40, y2: 0, door: false, kind: 'wall' },
    { x1: 10, y1: 0, x2: 20, y2: 0, door: true, kind: 'wall' },
    { x1: 0, y1: 50, x2: 80, y2: 50, door: false, kind: 'low' },
  ]);
  // The boulder (blocks sight: 8 sides) and the crate (an obstacle: 4 sides, turned).
  assert.equal(m.walls.filter((w) => w.kind === 'wall').length, 3 + 8);
  assert.equal(m.walls.filter((w) => w.kind === 'low').length, 1 + 4);
  const crate = assetOutline(d.assets[3]);
  assert.ok(Math.abs(crate[0][0] - 4) < 1e-9, 'turned 45°: a corner straight above the middle');
  assert.deepEqual(m.lights, [{ x: 20, y: 30, bright: 20, dim: 20 }]);
  assert.deepEqual(difficultAreas(d), [{ x1: 5, y1: 1, x2: 7, y2: 3 }, { x1: 5, y1: 3, x2: 6, y2: 4 }, { x1: 7, y1: 3, x2: 8, y2: 4 }]);
  assert.equal(m.terrain.length, 3);
  assert.deepEqual(m.terrain[0].points, [[50, 10], [70, 10], [70, 30], [50, 30]]);
});

test('drawing: the same design draws the same every time, with only plain canvas calls', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, k) => (k in target ? target[k] : (...args) => calls.push([k, ...args])),
    set: (target, k, v) => {
      calls.push([`=${String(k)}`, v]);
      return true;
    },
  });
  let d = addRoom(emptyDesign(5, 5, 'g'), { x1: 1, y1: 1, x2: 4, y2: 4 }, 's');
  d = normalizeDesign({ ...d, assets: Object.keys(ASSETS).map((a, i) => ({ id: `as${i}xx`, a, x: 2, y: 2 })).concat([{ id: 'up01xx', a: 'u:0123456789', x: 1, y: 1 }]) });
  drawDesign(ctx, d, { cell: 20 });
  const first = JSON.stringify(calls);
  const names = new Set(calls.map((c) => c[0]));
  assert.ok(names.has('fillRect') && names.has('ellipse') && names.has('drawImage') === false, 'an upload with no picture loaded is a dashed box, not drawImage');
  calls.length = 0;
  drawDesign(ctx, d, { cell: 20 });
  assert.equal(JSON.stringify(calls), first);
  const r1 = seeded(1, 2);
  const r2 = seeded(1, 2);
  assert.equal(r1(), r2());
  // An uploaded asset with its picture is drawn with it.
  calls.length = 0;
  drawDesign(ctx, d, { cell: 20, images: new Map([['u:0123456789', { img: true }]]), floor: false });
  assert.ok(calls.some((c) => c[0] === 'drawImage'));
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[3] === 20 && c[4] === 20 && c[1] === 0 && c[2] === 0), 'no floor drawn with floor: false');
});
