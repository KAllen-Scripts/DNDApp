import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSETS, ASSET_GROUPS, DESIGN_MAX, EMPTY, FLOORS, LABEL_FONTS, LOOK, MAX_DESIGN_LABELS, PATH_KINDS, WALL_STYLES,
  addCircle, addRoom, addWall, assetAt, hullShape, assetOutline, brushCells, clearArea, copyArea, cutWallAt, designToMap, difficultAreas,
  drawOrder, emptyDesign, eraseWallAt, fillFloor, labelAt, normalizeClip, normalizeDesign, paintFloor, pasteClip, pathAt,
  pathOutline, rectCells, resizeDesign, scatterAssets, seeded, shiftDesign, transformClip, uploadedRefs, wallAt, wallEdges, wallPoints,
} from '../src/map-design.js';
import { normalizeMap } from '../src/map.js';

const strip = (walls) => walls.map(({ id: _id, ...w }) => w);

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
      { id: 'up0001', a: 'u:0123456789', x: 1, y: 1, w: 3, h: 1, blocks: 'wall', light: true, tint: '#ff0000' },
    ],
  });
  assert.equal(d.v, 2);
  assert.equal(d.cols, DESIGN_MAX);
  assert.equal(d.rows, 4, 'at least 4 squares');
  assert.equal(d.floor[0].slice(0, 5), `gg${EMPTY}W${EMPTY}`);
  assert.equal(d.floor[3], EMPTY.repeat(DESIGN_MAX));
  assert.deepEqual(strip(d.walls), [
    { x1: 0, y1: 0, x2: 3.5, y2: 0, type: 'wall', style: 'stone' },
    { x1: 0, y1: 0, x2: 60, y2: 0, type: 'door', style: 'wood' },
  ]);
  assert.ok(d.walls.every((w) => /^[a-z0-9]{4,16}$/.test(w.id)) && d.walls[0].id !== d.walls[1].id, 'every wall gets its own id');
  assert.deepEqual(d.assets[0], {
    id: 'tree01', a: 'tree', x: 2, y: 1, w: 2, h: 2, rot: 270, flip: false, tint: null, layer: null, blocks: 'none', light: false, difficult: false, to: null, label: '',
  });
  assert.equal(d.assets.length, 2);
  assert.equal(d.assets[1].light, false, 'an uploaded asset gives no light');
  assert.equal(d.assets[1].tint, null, 'nor takes a colour');
  assert.equal(d.assets[1].blocks, 'wall');
  assert.deepEqual(uploadedRefs(d), ['u:0123456789']);
  assert.deepEqual(d.paths, []);
  assert.deepEqual(d.labels, []);
  assert.deepEqual(d.look, LOOK);
  // A map document keeps its design normalised.
  assert.equal(normalizeMap({ design: { cols: 5, rows: 5, floor: [] } }).design.floor.length, 5);
  assert.equal(normalizeMap({}).design, null);
});

test('normalizeDesign: curved walls, ids kept and made unique, tints, layers, links, paths, labels and the look', () => {
  const d = normalizeDesign({
    cols: 10,
    rows: 10,
    walls: [
      { id: 'wall0001', x1: 1, y1: 5, x2: 5, y2: 5, arc: { x: 3, y: 3 } },
      { id: 'wall0001', x1: 1, y1: 1, x2: 2, y2: 1 }, // the same id again: a new one
      { x1: 1, y1: 7, x2: 5, y2: 7, arc: { x: 3, y: 7 } }, // a curve through a point in line is straight
      { x1: 1, y1: 8, x2: 2, y2: 8, type: 'door', arc: { x: 1.5, y: 7 } }, // doors don't curve
      { x1: 0, y1: 9, x2: 3, y2: 9, type: 'secret', style: 'hedge' },
      { x1: 0, y1: 2, x2: 3, y2: 2, type: 'nope', style: 'nope' },
    ],
    assets: [
      { id: 'camp01', a: 'campfire', x: 1, y: 1, light: false },
      { id: 'tent01', a: 'tent', x: 3, y: 3, tint: '#ABCDEF', layer: 2, flip: true, to: 'abcdef0123', label: '  Way   down ' },
      { id: 'tabl01', a: 'table', x: 5, y: 5, tint: '#abcdef', layer: 7, to: 'not a map' },
      { id: 'rubl01', a: 'rubble', x: 6, y: 6, difficult: false },
    ],
    paths: [
      { id: 'road01', kind: 'road', pts: [[0, 0], [0.01, 0.01], [5, 5], ['x', 1], [9, 2]] },
      { kind: 'river', w: 99, pts: [[1, 1], [2, 2]] },
      { kind: 'nope', pts: [[1, 1], [2, 2]] },
      { kind: 'trail', pts: [[1, 1]] },
    ],
    labels: [
      { id: 'lab001', text: '  The   Old Mill ', x: 4, y: 2, size: 1.2, rot: -45, colour: '#112233', font: 'title', italic: true, halo: false },
      { text: '', x: 1, y: 1 },
      { text: 'x'.repeat(200), font: 'nope', colour: 'red' },
    ],
    look: { void: '#000000', grid: 'dark', shadows: false, glow: 0, mood: 'night', soft: false },
  });
  assert.equal(d.walls.length, 6);
  assert.deepEqual(d.walls[0], { id: 'wall0001', x1: 1, y1: 5, x2: 5, y2: 5, type: 'wall', style: 'stone', arc: { x: 3, y: 3 } });
  assert.notEqual(d.walls[1].id, 'wall0001');
  assert.equal(d.walls[2].arc, undefined);
  assert.equal(d.walls[3].arc, undefined);
  assert.equal(d.walls[3].type, 'door');
  assert.deepEqual([d.walls[4].type, d.walls[4].style], ['secret', 'hedge']);
  assert.deepEqual([d.walls[5].type, d.walls[5].style], ['wall', 'stone'], 'an unknown kind or look: a stone wall');
  assert.equal(d.assets[0].light, false, 'a campfire put out');
  assert.equal(d.assets[1].tint, '#abcdef');
  assert.equal(d.assets[1].layer, 2);
  assert.equal(d.assets[1].flip, true);
  assert.equal(d.assets[1].to, 'abcdef0123');
  assert.equal(d.assets[1].label, 'Way down');
  assert.equal(d.assets[2].tint, null, "a table's colour can't change");
  assert.equal(d.assets[2].layer, null);
  assert.equal(d.assets[2].to, null);
  assert.equal(d.assets[3].difficult, false, 'rubble the DM made easy to cross');
  assert.equal(d.paths.length, 2);
  assert.deepEqual(d.paths[0], { id: 'road01', kind: 'road', w: PATH_KINDS.road.w, pts: [[0, 0], [5, 5], [9, 2]] });
  assert.equal(d.paths[1].w, 8, 'at most 8 squares wide');
  assert.equal(d.labels.length, 2);
  assert.deepEqual(d.labels[0], { id: 'lab001', text: 'The Old Mill', x: 4, y: 2, size: 1.2, rot: 315, colour: '#112233', font: 'title', italic: true, halo: false });
  assert.equal(d.labels[1].text.length, 80);
  assert.equal(d.labels[1].font, 'old');
  assert.equal(d.labels[1].colour, '#f4ead5');
  assert.deepEqual(d.look, { void: '#000000', grid: 'dark', shadows: false, glow: true, mood: 'night', soft: false });
  assert.equal(normalizeDesign({ labels: Array.from({ length: 150 }, () => ({ text: 'a' })) }).labels.length, MAX_DESIGN_LABELS);
  // Normalising twice changes nothing.
  assert.deepEqual(normalizeDesign(d), d);
});

test('what can be in a design: every floor, asset, path and font is described', () => {
  assert.ok(Object.keys(FLOORS).length >= 30);
  assert.ok(Object.keys(FLOORS).every((k) => k.length === 1 && k !== EMPTY));
  for (const [k, f] of Object.entries(FLOORS)) {
    assert.ok(f.name && /^#[0-9a-f]{6}$/.test(f.base), k);
    assert.ok(['Built', 'Natural', 'Water'].includes(f.group), k);
    assert.equal(f.group === 'Built', f.blend === undefined, `${k}: natural floors blend, built ones don't`);
  }
  assert.equal(new Set(Object.values(FLOORS).filter((f) => f.blend !== undefined).map((f) => f.blend)).size, Object.values(FLOORS).filter((f) => f.blend !== undefined).length, 'one natural floor over another, never a tie');
  assert.ok(Object.keys(ASSETS).length >= 140);
  for (const [k, a] of Object.entries(ASSETS)) {
    assert.ok(/^[a-z_]+$/.test(k) && a.name, k);
    assert.ok(ASSET_GROUPS.includes(a.group), `${k}: group`);
    assert.ok(a.w > 0 && a.h > 0 && ['round', 'rect'].includes(a.shape) && [0, 1, 2].includes(a.layer), k);
    assert.ok(['none', 'low', 'wall'].includes(a.blocks), k);
    if (a.light) assert.ok(a.light.bright >= 0 && a.light.dim >= 0 && a.glow, `${k}: a light has a glow`);
    if (a.glow === 'tint') assert.ok(a.tint, `${k}: glows in its own colour`);
  }
  assert.ok(ASSET_GROUPS.every((g) => Object.values(ASSETS).some((a) => a.group === g)));
  assert.ok(Object.values(PATH_KINDS).every((p) => p.name && p.w > 0));
  assert.ok(Object.values(LABEL_FONTS).every((f) => f.name && f.family));
  assert.ok(WALL_STYLES.length >= 8);
});

test('painting floors: a brush, a round brush, a rectangle, a bucket fill that stops at other floors and walls, and rubbing out', () => {
  let d = emptyDesign(6, 4);
  assert.deepEqual(brushCells(2, 2, 1), [[2, 2]]);
  assert.equal(brushCells(2, 2, 3).length, 9);
  assert.deepEqual(brushCells(2, 2, 3)[0], [1, 1]);
  assert.equal(brushCells(5, 5, 5, true).length, 21, 'a round brush leaves out the corners');
  d = paintFloor(d, brushCells(1, 1, 3), 's');
  assert.deepEqual(d.floor, ['sss...', 'sss...', 'sss...', '......']);
  d = paintFloor(d, [[1, 1], [99, 0], [0, 99]], EMPTY);
  assert.equal(d.floor[1], 's.s...');
  d = fillFloor(d, 5, 0, 'g');
  assert.deepEqual(d.floor, ['sssggg', 's.sggg', 'sssggg', 'gggggg'], 'the bucket fills joined squares, not the hole walled in by stone');
  assert.equal(fillFloor(d, 0, 0, 's'), d, 'filling with the same floor changes nothing');
  assert.deepEqual(rectCells(d, { x1: 4.5, y1: 3.2, x2: 9, y2: 2 }), [[4, 2], [5, 2], [4, 3], [5, 3]]);
  // A wall stops the bucket.
  let w = addWall(emptyDesign(6, 4, 'g'), { x1: 3, y1: 0, x2: 3, y2: 4 });
  w = fillFloor(w, 0, 0, 'd');
  assert.deepEqual(w.floor, ['dddggg', 'dddggg', 'dddggg', 'dddggg']);
  assert.equal(wallEdges(w).size, 4, 'the wall stands between four pairs of squares');
});

test('walls and openings: doors, secret doors, windows and archways cut their stretch out of a wall; walls join and go round openings', () => {
  let d = emptyDesign(10, 10);
  d = addWall(d, { x1: 0, y1: 2, x2: 6, y2: 2 });
  d = addWall(d, { x1: 2, y1: 2, x2: 3, y2: 2, type: 'door' });
  assert.deepEqual(d.walls.map(({ x1, x2, type }) => [x1, x2, type]), [[0, 2, 'wall'], [3, 6, 'wall'], [2, 3, 'door']]);
  // Another wall along the same line, over the door: the doorway stays open, the walls join up.
  d = addWall(d, { x1: 0, y1: 2, x2: 8, y2: 2, style: 'wood' });
  assert.ok(!d.walls.some((w) => w.type !== 'door' && w.x1 < 2.5 && w.x2 > 2.5), 'nothing blocks the door');
  d = addWall(d, { x1: 4, y1: 2, x2: 5, y2: 2, type: 'secret' });
  d = addWall(d, { x1: 6, y1: 2, x2: 7, y2: 2, type: 'window' });
  assert.deepEqual(d.walls.filter((w) => w.y1 === 2 && w.y2 === 2).map((w) => w.type).sort(), ['door', 'secret', 'wall', 'wall', 'wall', 'wall', 'window']);
  // An archway over a window replaces it.
  d = addWall(d, { x1: 6, y1: 2, x2: 7, y2: 2, type: 'arch' });
  assert.ok(!d.walls.some((w) => w.type === 'window'));
  assert.ok(d.walls.some((w) => w.type === 'arch' && w.x1 === 6));
  // Two walls of the same kind and look along a line join into one.
  let j = addWall(emptyDesign(10, 10), { x1: 0, y1: 1, x2: 3, y2: 1 });
  j = addWall(j, { x1: 2, y1: 1, x2: 6, y2: 1 });
  assert.deepEqual(strip(j.walls), [{ x1: 0, y1: 1, x2: 6, y2: 1, type: 'wall', style: 'stone' }]);
  // A door across a wall (not along it) doesn't cut it.
  const before = d.walls.length;
  d = addWall(d, { x1: 4, y1: 1, x2: 4, y2: 3, type: 'door' });
  assert.equal(d.walls.length, before + 1);
  d = eraseWallAt(d, 4.1, 1.5);
  assert.equal(d.walls.length, before, 'the nearest wall is rubbed out');
  assert.equal(eraseWallAt(d, 9, 9), d, 'nothing near: nothing changes');
  assert.equal(addWall(d, { x1: 1, y1: 1, x2: 1, y2: 1 }), d, 'a wall needs a length');
});

test('curved and round walls, the rubber, and picking walls', () => {
  let d = addWall(emptyDesign(10, 10), { x1: 1, y1: 5, x2: 5, y2: 5, arc: { x: 3, y: 3 } });
  assert.equal(d.walls.length, 1);
  const pts = wallPoints(d.walls[0]);
  assert.ok(pts.length > 4, 'a curve is drawn as pieces');
  assert.ok(pts.every(([x, y]) => Math.abs(Math.hypot(x - 3, y - 5) - 2) < 1e-6), 'on the circle through its ends and middle');
  assert.equal(wallAt(d, 3, 3.1).id, d.walls[0].id, 'picked along its curve');
  assert.equal(wallAt(d, 3, 5), null, 'not across its chord');
  d = addCircle(emptyDesign(10, 10), { cx: 5, cy: 5, r: 2, style: 'brick' });
  assert.equal(d.walls.length, 2, 'a round wall is two halves');
  assert.ok(d.walls.every((w) => w.arc && w.style === 'brick'));
  assert.equal(addCircle(d, { cx: 5, cy: 5, r: 0.2 }), d, 'too small');
  // The rubber takes a square's stretch out of a straight wall, the whole of anything else.
  let r = addWall(emptyDesign(10, 10), { x1: 0, y1: 3, x2: 6, y2: 3 });
  r = cutWallAt(r, 2.5, 3.1);
  assert.deepEqual(r.walls.map(({ x1, x2 }) => [x1, x2]), [[0, 2], [3, 6]]);
  r = addWall(r, { x1: 8, y1: 0, x2: 8, y2: 6 });
  r = cutWallAt(r, 8.1, 0.5);
  assert.ok(r.walls.some((w) => w.x1 === 8 && w.y1 === 1 && w.y2 === 6), 'down the map too');
  r = addWall(r, { x1: 1, y1: 8, x2: 4, y2: 8, arc: { x: 2.5, y: 7 } });
  r = cutWallAt(r, 2.5, 7.05);
  assert.ok(!r.walls.some((w) => w.arc), 'a curved wall goes whole');
  assert.equal(cutWallAt(r, 9.5, 9.5), r);
});

test('rooms: floored and walled round', () => {
  const room = addRoom(emptyDesign(8, 8), { x1: 5, y1: 4, x2: 1, y2: 1 }, 'w', 'wood');
  assert.deepEqual(room.floor.slice(0, 5), ['........', '.wwww...', '.wwww...', '.wwww...', '........']);
  assert.equal(room.walls.length, 4);
  assert.ok(room.walls.every((w) => w.style === 'wood' && w.type === 'wall'));
  assert.equal(addRoom(room, { x1: 2, y1: 2, x2: 2, y2: 6 }, 's'), room, 'a room needs at least a square');
  // A room beside another shares its wall rather than doubling it.
  const two = addRoom(room, { x1: 5, y1: 1, x2: 7, y2: 4 }, 'w', 'wood');
  assert.equal(two.walls.filter((w) => w.x1 === 5 && w.x2 === 5).length, 1);
});

test('assets: picked by where they are drawn (turned, by layer), the top one first; resizing and shifting', () => {
  const d = normalizeDesign({
    cols: 10, rows: 10,
    assets: [
      { id: 'tree01', a: 'tree', x: 5, y: 5 }, // overhead
      { id: 'rug001', a: 'rug', x: 5, y: 5 },
      { id: 'tabl01', a: 'table', x: 5, y: 5, rot: 90 },
      { id: 'tree02', a: 'tree', x: 9, y: 9 },
    ],
    labels: [{ id: 'lab001', text: 'Hall', x: 2, y: 2, size: 1 }],
    paths: [{ id: 'road01', kind: 'road', w: 1, pts: [[0, 8], [4, 8]] }],
  });
  assert.deepEqual(drawOrder(d.assets).map((a) => a.id), ['rug001', 'tabl01', 'tree01', 'tree02'], 'by layer: rugs, then tables, then tree tops');
  assert.equal(assetAt(d, 5, 5.8).id, 'tree01', 'the tree top is over everything');
  const noTree = { ...d, assets: d.assets.filter((a) => a.a !== 'tree') };
  assert.equal(assetAt(noTree, 5, 5.8).id, 'tabl01', 'the table (turned upright) is on top of the rug');
  assert.equal(assetAt(noTree, 5.8, 5).id, 'rug001', 'beside the turned table, the rug');
  assert.equal(assetAt(d, 1, 1), null);
  assert.equal(labelAt(d, 2.3, 2).id, 'lab001');
  assert.equal(labelAt(d, 2, 4), null);
  assert.equal(pathAt(d, 2, 8.3).id, 'road01');
  assert.equal(pathAt(d, 2, 9.2), null);
  const small = resizeDesign({ ...d, walls: [{ x1: 1, y1: 1, x2: 9, y2: 1, type: 'wall', style: 'stone' }] }, 6, 6);
  assert.equal(small.cols, 6);
  assert.deepEqual(small.assets.map((a) => a.id), ['tree01', 'rug001', 'tabl01']);
  assert.deepEqual(small.walls, []);
  assert.deepEqual(small.paths, []);
  assert.equal(small.labels.length, 1);
  assert.equal(small.floor[0].length, 6);
  const big = resizeDesign(d, 12, 11);
  assert.equal(big.floor.length, 11);
  assert.equal(big.floor[10], EMPTY.repeat(12));
  const moved = shiftDesign(paintFloor(d, [[0, 0]], 's'), 2, 1);
  assert.equal(moved.floor[1][2], 's');
  assert.equal(moved.floor[0][0], EMPTY);
  assert.deepEqual(moved.assets.find((a) => a.id === 'rug001'), { ...d.assets[1], x: 7, y: 6 }, 'ids kept');
  assert.equal(moved.assets.some((a) => a.id === 'tree02'), false, 'pushed off the edge');
  assert.deepEqual(moved.labels[0], { ...d.labels[0], x: 4, y: 3 });
});

test('areas: copy, cut, turn, flip and paste; clips and stamps cleaned up', () => {
  let d = addRoom(emptyDesign(12, 12), { x1: 1, y1: 1, x2: 4, y2: 3 }, 'w');
  d = addWall(d, { x1: 2, y1: 1, x2: 3, y2: 1, type: 'door' });
  d = normalizeDesign({ ...d, assets: [{ id: 'tabl01', a: 'table', x: 2, y: 2 }], labels: [{ id: 'lab001', text: 'Den', x: 3, y: 2 }] });
  const clip = copyArea(d, { x1: 1, y1: 1, x2: 4, y2: 3 });
  assert.equal(clip.cols, 3);
  assert.equal(clip.rows, 2);
  assert.deepEqual(clip.floor, ['www', 'www']);
  assert.equal(clip.walls.length, 6, 'four sides (the top in two pieces either side of the door) and the door');
  assert.deepEqual([clip.assets[0].x, clip.assets[0].y], [1, 1]);
  const cut = clearArea(d, { x1: 1, y1: 1, x2: 4, y2: 3 });
  assert.equal(cut.floor[1], EMPTY.repeat(12));
  assert.deepEqual([cut.walls, cut.assets, cut.labels], [[], [], []]);
  // Pasted elsewhere: the same room with new ids.
  const pasted = pasteClip(cut, clip, { x: 6, y: 6 });
  assert.equal(pasted.floor[6].slice(6, 9), 'www');
  assert.equal(pasted.walls.filter((w) => w.type === 'door').length, 1);
  assert.deepEqual([pasted.assets[0].x, pasted.assets[0].y], [7, 7]);
  assert.notEqual(pasted.assets[0].id, 'tabl01');
  // Off the edge: what falls off is left out.
  const edge = pasteClip(cut, clip, { x: 10, y: 10 });
  assert.equal(edge.floor[10].slice(10), 'ww');
  assert.equal(edge.assets.length, 1);
  assert.equal(edge.labels.length, 1, 'a middle on the edge is still on the map');
  assert.equal(pasteClip(cut, clip, { x: 11, y: 10 }).labels.length, 0, "the label's middle would be off the map");
  // A quarter turn clockwise: 3 x 2 becomes 2 x 3.
  const turned = transformClip(clip, { rot: 90 });
  assert.deepEqual([turned.cols, turned.rows], [2, 3]);
  assert.deepEqual([turned.assets[0].x, turned.assets[0].y, turned.assets[0].rot], [1, 1, 90]);
  assert.deepEqual(transformClip(transformClip(clip, { rot: 180 }), { rot: 180 }).floor, clip.floor);
  const flipped = transformClip({ ...clip, floor: ['wws', 'www'] }, { flip: true });
  assert.deepEqual(flipped.floor, ['sww', 'www']);
  assert.equal(flipped.assets[0].flip, true);
  // A stamp from outside (the archive, the AI) is cleaned up and keeps its own small size.
  const stamp = normalizeClip({ cols: 2, rows: 1, floor: ['g?', 'gg'], walls: [{ x1: 0, y1: 0, x2: 2, y2: 0 }, { x1: 0, y1: 0, x2: 5, y2: 0 }], assets: [{ a: 'bush', x: 1, y: 0.5 }, { a: 'bush', x: 3, y: 0.5 }] });
  assert.deepEqual([stamp.cols, stamp.rows, stamp.floor], [2, 1, ['g.']]);
  assert.equal(stamp.walls.length, 1);
  assert.equal(stamp.assets.length, 1);
});

test('scattering: the same seed scatters the same way, spread out, inside the area', () => {
  const d = emptyDesign(20, 20, 'g');
  const a = scatterAssets(d, 'tree', { x1: 2, y1: 2, x2: 12, y2: 10 }, { seed: 7 });
  const b = scatterAssets(d, 'tree', { x1: 2, y1: 2, x2: 12, y2: 10 }, { seed: 7 });
  const strip2 = (x) => x.assets.map(({ id: _id, ...rest }) => rest);
  assert.deepEqual(strip2(a), strip2(b));
  assert.ok(a.assets.length >= 5, `${a.assets.length} trees`);
  assert.ok(a.assets.every((t) => t.x >= 2 && t.x <= 12 && t.y >= 2 && t.y <= 10));
  for (const t of a.assets) for (const u of a.assets) if (t !== u) assert.ok(Math.hypot(t.x - u.x, t.y - u.y) > 0.9, 'a little apart');
  assert.notDeepEqual(strip2(scatterAssets(d, 'tree', { x1: 2, y1: 2, x2: 12, y2: 10 }, { seed: 8 })), strip2(a));
  assert.equal(scatterAssets(d, 'tree', { x1: 2, y1: 2, x2: 12, y2: 10 }, { count: 3, seed: 1 }).assets.length, 3);
  assert.equal(scatterAssets(d, 'nope', { x1: 0, y1: 0, x2: 5, y2: 5 }), d);
  assert.equal(scatterAssets(d, 'flowers', { x1: 0, y1: 0, x2: 5, y2: 5 }, { tint: '#ffffff' }).assets[0].tint, '#ffffff');
  const r1 = seeded(1, 2);
  const r2 = seeded(1, 2);
  assert.equal(r1(), r2());
});

test('designToMap: pixels, an exact grid, walls, doors, secret doors, windows, curves, blocking outlines, lights, difficult terrain and links', () => {
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
    { id: 'stai01', a: 'stairs_down', x: 7, y: 4, to: 'abcdef0123' },
    { id: 'trap01', a: 'trapdoor', x: 6, y: 5, to: '0123456789', label: 'Cellar' },
  ] });
  const m = designToMap(d, 10);
  assert.equal(m.width, 80);
  assert.equal(m.height, 60);
  assert.deepEqual(m.grid, { size: 10, x: 0, y: 0 });
  assert.deepEqual(m.scale, { distance: 5, unit: 'ft', per: 'square' });
  assert.deepEqual(m.walls.slice(0, 4), [
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
  assert.deepEqual(m.links, [
    { x: 70, y: 40, to: 'abcdef0123', label: 'Stairs down' },
    { x: 60, y: 50, to: '0123456789', label: 'Cellar' },
  ]);

  // Secret doors are doors that say so; windows block movement, not sight; archways nothing; curves come in pieces that share a group.
  let e = emptyDesign(10, 10);
  e = addWall(e, { x1: 0, y1: 1, x2: 6, y2: 1 });
  e = addWall(e, { x1: 1, y1: 1, x2: 2, y2: 1, type: 'secret' });
  e = addWall(e, { x1: 3, y1: 1, x2: 4, y2: 1, type: 'window' });
  e = addWall(e, { x1: 5, y1: 1, x2: 6, y2: 1, type: 'arch' });
  e = addWall(e, { x1: 1, y1: 8, x2: 5, y2: 8, arc: { x: 3, y: 6 } });
  e = normalizeDesign({ ...e, paths: [{ kind: 'river', w: 2, pts: [[0, 4], [10, 4]] }, { kind: 'road', pts: [[0, 6], [10, 6]] }] });
  const n = designToMap(e, 10);
  assert.deepEqual(n.walls.filter((w) => w.secret), [{ x1: 10, y1: 10, x2: 20, y2: 10, door: true, kind: 'wall', secret: true }]);
  assert.deepEqual(n.walls.filter((w) => w.y1 === 10 && w.x1 === 30).map((w) => [w.kind, w.door]), [['low', false]]);
  assert.ok(!n.walls.some((w) => w.y1 === 10 && w.x1 === 50 && w.x2 === 60), 'an archway blocks nothing');
  const curve = n.walls.filter((w) => w.group);
  assert.ok(curve.length > 3 && curve.every((w) => w.group === curve[0].group && /^[a-z0-9]{6,16}$/.test(w.group)));
  assert.equal(n.terrain.length, 1, 'the river is difficult terrain; the road is not');
  assert.ok(n.terrain[0].points.length >= 4 && n.terrain[0].points.length <= 200);
  assert.ok(pathOutline(e.paths[0]).every(([, y]) => y >= 2.9 && y <= 5.1));
});

test("a ship's hull: a pointed bow at the top, straight sides from the stern, inside its box", () => {
  const { outline, L } = hullShape(6, 18);
  assert.deepEqual(outline[0], [-3, 9]);
  assert.deepEqual(outline.at(-1), [3, 9]);
  assert.ok(outline.some(([x, y]) => x === 0 && y === -9), 'the bow tip');
  assert.ok(outline.every(([x, y]) => Math.abs(x) <= 3 + 1e-9 && Math.abs(y) <= 9 + 1e-9));
  assert.ok(Math.abs(L - 6) < 1e-9);
  assert.equal(ASSETS.hull.group, 'Ships');
  assert.equal(ASSETS.floor_round.shape, 'round');
});
