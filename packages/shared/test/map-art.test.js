import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, FLOORS, LOOK, PATH_KINDS, WALL_STYLES, WALL_TYPES, addCircle, addRoom, addWall, emptyDesign, normalizeDesign, paintFloor } from '../src/map-design.js';
import {
  drawAsset, drawBuiltIn, drawDesign, drawFloor, drawFloorSwatch, drawLabels, drawLook, drawPathSwatch, drawWallSwatch, drawWalls, labelFont, lightAreas, lightSources,
} from '../src/map-art.js';
import { ART } from '../src/map-art-assets.js';
import { fbm, hash2, mix, noise, shade, rgba, lightness } from '../src/map-paint.js';

/** A pretend canvas that writes down every call and every setting, in order. */
function recorder() {
  const calls = [];
  const gradient = (kind) => (...args) => {
    calls.push([kind, ...args]);
    return { addColorStop: (...stop) => calls.push(['addColorStop', ...stop]) };
  };
  const target = { createRadialGradient: gradient('createRadialGradient'), createLinearGradient: gradient('createLinearGradient'), measureText: (t) => ({ width: String(t).length * 5 }) };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])),
    set: (t, k, v) => {
      calls.push([`=${String(k)}`, typeof v === 'object' ? 'gradient' : v]);
      return true;
    },
  });
  return { ctx, calls };
}

/** Everything at once: every floor, a wall of every kind and style, every asset, every path and a label. */
function everything() {
  const keys = Object.keys(FLOORS);
  const cols = 16;
  const rows = 12;
  const floor = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => keys[(Math.floor(c / 2) + Math.floor(r / 2) * 8) % keys.length]).join(''));
  let d = normalizeDesign({ cols, rows, floor });
  WALL_STYLES.forEach((style, i) => {
    WALL_TYPES.forEach((type, j) => {
      d = addWall(d, { x1: j * 2, y1: i + 1, x2: j * 2 + 2, y2: i + 1, type, style });
    });
  });
  d = addCircle(d, { cx: 13, cy: 9, r: 1.5, style: 'cave' });
  return normalizeDesign({
    ...d,
    assets: Object.keys(ASSETS).map((a, i) => ({ id: `as${i}xx`, a, x: 1 + (i % 15), y: 1 + Math.floor(i / 15) % 10, rot: (i * 37) % 360, flip: i % 3 === 0 })).concat([{ id: 'up01xx', a: 'u:0123456789', x: 1, y: 1 }]),
    paths: Object.keys(PATH_KINDS).map((kind, i) => ({ id: `pa${i}xx`, kind, pts: [[0.5, i + 0.5], [5, i + 1], [9, i + 0.2], [15, i + 1]] })),
    labels: [{ id: 'lab001', text: 'Here be dragons', x: 8, y: 6, size: 1, italic: true }, { id: 'lab002', text: 'Keep', x: 3, y: 3, size: 0.6, font: 'title', colour: '#202020' }],
  });
}

test('drawing: the same design draws the same every time, with only plain canvas calls', () => {
  const { ctx, calls } = recorder();
  const d = everything();
  drawDesign(ctx, d, { cell: 20 });
  const first = JSON.stringify(calls);
  const names = new Set(calls.map((c) => c[0]));
  for (const n of ['fillRect', 'ellipse', 'clip', 'quadraticCurveTo', 'fillText', 'strokeText', 'setLineDash']) assert.ok(names.has(n), n);
  assert.equal(names.has('drawImage'), false, 'an upload with no picture loaded is a dashed box, not drawImage');
  // Only what every Canvas 2D has (a native canvas on the server, a browser's on the page).
  const allowed = new Set([
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke',
    'clip', 'fillRect', 'strokeRect', 'translate', 'rotate', 'scale', 'setLineDash', 'fillText', 'strokeText', 'drawImage', 'createRadialGradient',
    'createLinearGradient', 'addColorStop', '=fillStyle', '=strokeStyle', '=lineWidth', '=lineCap', '=lineJoin', '=font', '=textAlign', '=textBaseline',
    '=globalCompositeOperation',
  ]);
  assert.deepEqual([...names].filter((n) => !allowed.has(n)), []);
  calls.length = 0;
  drawDesign(ctx, d, { cell: 20 });
  assert.equal(JSON.stringify(calls), first);
  // At other sizes too (less detail when small), and nothing is ever NaN.
  for (const cell of [6, 20, 70]) {
    calls.length = 0;
    drawDesign(ctx, d, { cell });
    assert.ok(!JSON.stringify(calls).includes('null'), `no NaN at ${cell} px a square`);
  }
  // An uploaded asset with its picture is drawn with it.
  calls.length = 0;
  drawDesign(ctx, d, { cell: 20, images: new Map([['u:0123456789', { img: true }]]), floor: false });
  assert.ok(calls.some((c) => c[0] === 'drawImage'));
});

test('every built-in asset has its own drawing, which draws at any size, tinted or not, with or without shadows', () => {
  assert.deepEqual(Object.keys(ART).sort(), Object.keys(ASSETS).sort());
  const { ctx, calls } = recorder();
  for (const key of Object.keys(ASSETS)) {
    for (const opts of [{}, { tint: '#123456', seed: 9 }, { shadows: false }]) {
      calls.length = 0;
      drawBuiltIn(ctx, key, ASSETS[key].w * 30, ASSETS[key].h * 30, opts);
      assert.ok(calls.length > 3, key);
      assert.ok(!JSON.stringify(calls).includes('null'), `${key}: no NaN`);
    }
    // A tint changes the colours of assets that take one.
    if (ASSETS[key].tint) {
      calls.length = 0;
      drawBuiltIn(ctx, key, 60, 60, { tint: '#00ff00', seed: 1 });
      const tinted = JSON.stringify(calls);
      calls.length = 0;
      drawBuiltIn(ctx, key, 60, 60, { seed: 1 });
      assert.notEqual(tinted, JSON.stringify(calls), `${key} takes a colour`);
    }
  }
  // Shadows off: no shadow shapes.
  calls.length = 0;
  drawBuiltIn(ctx, 'boulder', 60, 60, { shadows: false });
  const without = calls.length;
  calls.length = 0;
  drawBuiltIn(ctx, 'boulder', 60, 60, {});
  assert.ok(calls.length > without);
  // An unknown one is a grey box.
  calls.length = 0;
  drawBuiltIn(ctx, 'nope', 10, 10);
  assert.ok(calls.some((c) => c[0] === 'fillRect' || c[0] === 'rect'));
  // A placed asset is turned and flipped where it stands.
  calls.length = 0;
  drawAsset(ctx, { id: 'tabl01', a: 'table', x: 2, y: 3, w: 2, h: 1, rot: 90, flip: true }, 10);
  assert.deepEqual(calls.slice(0, 4).map((c) => c[0]), ['save', 'translate', 'rotate', 'scale']);
  assert.deepEqual(calls[1], ['translate', 20, 30]);
  assert.deepEqual(calls[3], ['scale', -1, 1]);
});

test('floors: every floor draws; natural floors run into each other; only the part asked for is drawn', () => {
  const { ctx, calls } = recorder();
  const d = everything();
  drawFloor(ctx, d, 20);
  const soft = calls.length;
  calls.length = 0;
  drawFloor(ctx, { ...d, look: { ...d.look, soft: false } }, 20);
  assert.ok(calls.length < soft, 'hard edges: no blending pieces');
  // A part of the map (a square brushed in the creator): clipped to it.
  calls.length = 0;
  drawFloor(ctx, d, 20, { x1: 2, y1: 3, x2: 5, y2: 6 });
  assert.deepEqual(calls.slice(0, 3), [['save'], ['beginPath'], ['rect', 40, 60, 60, 60]]);
  assert.ok(calls.length < soft / 4);
  // Nothing on the floor: just the empty colour.
  calls.length = 0;
  drawFloor(ctx, emptyDesign(4, 4), 10);
  assert.ok(calls.some((c) => c[0] === '=fillStyle' && c[1] === LOOK.void));
  for (const ch of Object.keys(FLOORS)) {
    calls.length = 0;
    drawFloorSwatch(ctx, ch, 40);
    assert.ok(calls.length > 2, ch);
  }
});

test('walls: every style and kind, curved walls, and swatches', () => {
  const { ctx, calls } = recorder();
  let d = addRoom(emptyDesign(8, 8, 'g'), { x1: 1, y1: 1, x2: 6, y2: 6 }, 's');
  d = addWall(d, { x1: 3, y1: 1, x2: 4, y2: 1, type: 'door' });
  d = addWall(d, { x1: 1, y1: 3, x2: 1, y2: 4, type: 'window' });
  d = addWall(d, { x1: 6, y1: 3, x2: 6, y2: 4, type: 'arch' });
  d = addWall(d, { x1: 3, y1: 6, x2: 4, y2: 6, type: 'secret' });
  drawWalls(ctx, d, 20);
  assert.ok(calls.length > 50);
  for (const style of WALL_STYLES) {
    for (const type of WALL_TYPES) {
      calls.length = 0;
      drawWallSwatch(ctx, style, type, 80, 30);
      assert.ok(calls.length > 5, `${style} ${type}`);
    }
  }
  for (const kind of Object.keys(PATH_KINDS)) {
    calls.length = 0;
    drawPathSwatch(ctx, kind, 80, 30);
    assert.ok(calls.length > 5, kind);
  }
});

test('the look: lights glow, dusk and night darken round them, a grid; labels in their fonts', () => {
  let d = paintFloor(emptyDesign(10, 10, 'g'), [[8, 8], [8, 9], [9, 8], [9, 9]], 'L');
  d = normalizeDesign({ ...d, assets: [
    { id: 'fire01', a: 'campfire', x: 2, y: 2 },
    { id: 'fire02', a: 'campfire', x: 4, y: 2, light: false },
    { id: 'crys01', a: 'crystal', x: 5, y: 5, tint: '#00ff00' },
  ], paths: [{ id: 'lava01', kind: 'lava', pts: [[0, 9], [5, 9]] }] });
  const lights = lightSources(d);
  assert.deepEqual(lights[0], { x: 2, y: 2, r: 8, bright: 4, colour: '#ffae42', owner: 'fire01', rot: 0 });
  assert.equal(lights[1].colour, '#00ff00', 'a crystal glows in its own colour');
  assert.ok(!lights.some((l) => l.x === 4 && l.y === 2), 'a campfire put out gives no light');
  assert.ok(lights.some((l) => l.colour === '#ff6a1a' && l.x === 8.5), 'lava glows');
  assert.ok(lights.filter((l) => l.colour === '#ff6a1a').length > 4, 'and so does a lava flow');

  const { ctx, calls } = recorder();
  // Daylight: only the glow (screen), no tint.
  drawLook(ctx, d, 20);
  assert.ok(calls.some((c) => c[0] === '=globalCompositeOperation' && c[1] === 'screen'));
  assert.ok(!calls.some((c) => c[1] === 'multiply'));
  // Night with a canvas for the light: darkness with holes round the lights, drawn over the map.
  calls.length = 0;
  const made = [];
  const makeCanvas = (w, h) => {
    const r = recorder();
    made.push({ w, h, calls: r.calls });
    return { width: w, height: h, getContext: () => r.ctx };
  };
  drawLook(ctx, { ...d, look: { ...d.look, mood: 'night', grid: 'dark' } }, 20, { makeCanvas });
  assert.equal(made.length, 1);
  assert.deepEqual([made[0].w, made[0].h], [120, 120], 'a small mask, scaled up');
  assert.ok(made[0].calls.some((c) => c[0] === '=globalCompositeOperation' && c[1] === 'destination-out'));
  assert.ok(calls.some((c) => c[0] === 'drawImage'));
  assert.ok(calls.some((c) => c[0] === '=globalCompositeOperation' && c[1] === 'multiply'));
  assert.equal(calls.filter((c) => c[0] === 'moveTo').length, 18, 'the grid: 9 lines across and 9 down');
  // Without one: an even tint.
  calls.length = 0;
  drawLook(ctx, { ...d, look: { ...d.look, mood: 'dusk', glow: false } }, 20);
  assert.ok(calls.some((c) => c[0] === 'fillRect' && c[3] === 200));
  assert.ok(!calls.some((c) => c[1] === 'screen'), 'glow off');

  assert.equal(labelFont({ font: 'title', italic: false }, 20.4), 'normal bold 20px Cinzel, Georgia, "Times New Roman", "Liberation Serif", serif'.replace('normal bold', 'bold'));
  assert.ok(labelFont({ font: 'old', italic: true }, 3).startsWith('italic normal 4px "IM Fell English"'));
  calls.length = 0;
  drawLabels(ctx, normalizeDesign({ labels: [{ text: 'North', colour: '#ffffff' }, { text: 'South', colour: '#000000', halo: false }] }), 20);
  assert.deepEqual(calls.filter((c) => c[0] === 'fillText' || c[0] === 'strokeText').map((c) => c[0]), ['strokeText', 'fillText', 'fillText']);
  assert.ok(calls.some((c) => c[0] === '=strokeStyle' && String(c[1]).startsWith('rgba(20,16,12')), 'a dark halo round light lettering');
});

/** Is the point inside the polygon? */
function inside(poly, [x, y]) {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
  }
  return inn;
}

test('the look: light stops at walls, closed doors and things that block sight, not at windows or its own thing', () => {
  let d = addRoom(emptyDesign(24, 12, 'g'), { x1: 2, y1: 2, x2: 9, y2: 8 }, 'w', 'stone');
  d = addWall(d, { x1: 12, y1: 1, x2: 12, y2: 11, type: 'wall' });
  d = addWall(d, { x1: 12, y1: 4, x2: 12, y2: 6, type: 'window' });
  d = normalizeDesign({ ...d, assets: [
    { id: 'fire01', a: 'campfire', x: 5, y: 5 },
    { id: 'torc01', a: 'torch', x: 4, y: 2.2 },
    { id: 'torc02', a: 'torch', x: 8.8, y: 6, rot: 90 },
    { id: 'crys01', a: 'crystal_big', x: 18, y: 6 },
    { id: 'pill01', a: 'pillar', x: 20.5, y: 6 },
    { id: 'lamp01', a: 'lamp_post', x: 10.5, y: 5 },
  ] });
  const lights = lightSources(d);
  const areas = lightAreas(d, lights);
  const of = (id) => areas[lights.findIndex((l) => l.owner === id)];
  // A fire in a closed room lights the room and nothing outside it.
  assert.ok(inside(of('fire01'), [3, 3]) && inside(of('fire01'), [8.5, 7.5]));
  assert.ok(!inside(of('fire01'), [1, 5]) && !inside(of('fire01'), [10, 5]) && !inside(of('fire01'), [5, 9]));
  // A torch hung on the wall shines into the room, not through the wall behind it.
  for (const id of ['torc01', 'torc02']) {
    assert.ok(of(id).length > 8, id);
    assert.ok(inside(of(id), [5, 4]), `${id} lights the room`);
    assert.ok(!inside(of(id), [4, 1.5]) && !inside(of(id), [9.5, 6]), `${id} stays inside`);
  }
  // A crystal that blocks sight still lights round itself; a pillar throws a shadow.
  assert.ok(inside(of('crys01'), [16.5, 6]) && inside(of('crys01'), [19.5, 6]));
  assert.ok(!inside(of('crys01'), [21.6, 6]), 'behind the pillar');
  assert.ok(inside(of('crys01'), [21.6, 4.5]), 'beside the pillar');
  // A window lets the light through; the wall round it doesn't.
  assert.ok(inside(of('lamp01'), [13, 5]), 'through the window');
  assert.ok(!inside(of('lamp01'), [13.5, 9.5]), 'not through the wall');
  // Nothing in the way: no clipping at all.
  assert.deepEqual(lightAreas(normalizeDesign({ cols: 10, rows: 10, assets: [{ id: 'fire01', a: 'campfire', x: 5, y: 5 }] }), lightSources(normalizeDesign({ cols: 10, rows: 10, assets: [{ id: 'fire01', a: 'campfire', x: 5, y: 5 }] }))), [null]);

  // At night the light's hole in the dark, and its glow, are clipped to where it reaches.
  const { ctx, calls } = recorder();
  const made = [];
  const makeCanvas = (w, h) => {
    const r = recorder();
    made.push(r.calls);
    return { width: w, height: h, getContext: () => r.ctx };
  };
  drawLook(ctx, { ...d, look: { ...d.look, mood: 'night' } }, 20, { makeCanvas });
  assert.equal(made[0].filter((c) => c[0] === 'clip').length, lights.length);
  assert.equal(calls.filter((c) => c[0] === 'clip').length, lights.length);
});

test('painting helpers: colours and noise', () => {
  assert.equal(shade('#808080', 0.1), '#9a9a9a');
  assert.equal(shade('#ffffff', 0.5), '#ffffff');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(rgba('#ff8000', 0.5), 'rgba(255,128,0,0.5)');
  assert.equal(lightness('#ffffff'), 1);
  assert.equal(hash2(3, 4, 5), hash2(3, 4, 5));
  assert.notEqual(hash2(3, 4, 5), hash2(4, 3, 5));
  for (let i = 0; i < 50; i += 1) {
    const v = noise(i * 0.37, i * 0.91, 3);
    assert.ok(v >= 0 && v <= 1);
    assert.ok(Math.abs(noise(i * 0.37 + 0.001, i * 0.91, 3) - v) < 0.01, 'smooth');
    const f = fbm(i * 0.5, i * 0.2, 1);
    assert.ok(f >= 0 && f <= 1);
  }
});
