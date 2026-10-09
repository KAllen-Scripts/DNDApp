import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setup, createFakeLLM, terrain } from './helpers.js';
import { createMapReader, tidyWalls } from '../src/maps/read.js';
import { isUvtt, readUvtt, uvttContents } from '../src/maps/uvtt.js';

const draftOut = (over = {}) => ({
  walls: [{ points: [{ x: 100, y: 100 }, { x: 900, y: 102 }] }],
  doors: [{ from: { x: 500, y: 300 }, to: { x: 500, y: 400 } }],
  obstacles: [],
  notes: 'Draft.',
  ...over,
});

test('tidyWalls straightens nearly level walls, joins ends, puts ends on the grid, and leaves curves alone', () => {
  const lines = [
    { a: { x: 12, y: 33 }, b: { x: 200, y: 37 }, door: false }, // nearly level
    { a: { x: 203, y: 38 }, b: { x: 206, y: 150 }, door: false }, // nearly upright, starts near the first's end
    { a: { x: 50, y: 300 }, b: { x: 60, y: 310 }, curve: true, group: 'c1' },
    { a: { x: 60, y: 310 }, b: { x: 75, y: 315 }, curve: true, group: 'c1' },
  ];
  tidyWalls(lines, { width: 400, height: 400, grid: { size: 40, x: 0, y: 0 } });
  assert.deepEqual(lines[0], { a: { x: 0, y: 40 }, b: { x: 200, y: 40 }, door: false });
  assert.deepEqual(lines[1], { a: { x: 200, y: 40 }, b: { x: 200, y: 160 }, door: false });
  // The curve's own points don't move (not straightened, not joined to each other, not on the grid).
  assert.deepEqual([lines[2].a, lines[2].b, lines[3].b], [{ x: 50, y: 300 }, { x: 60, y: 310 }, { x: 75, y: 315 }]);
  // Without a grid: straightened and joined only.
  const free = [{ a: { x: 12, y: 33 }, b: { x: 200, y: 37 } }];
  tidyWalls(free, { width: 400, height: 400 });
  assert.deepEqual(free[0], { a: { x: 12, y: 35 }, b: { x: 200, y: 35 } });
});

test('a big map is checked in close-ups: each part keeps what lies in it, and a failed part falls back on the draft', async () => {
  let n = 0;
  const llm = createFakeLLM({
    structured: (opts) => {
      if (opts.purpose === 'map:walls') return draftOut();
      n++;
      if (opts.prompt.includes('from 0 to')) throw new Error('overloaded'); // the first part fails
      // Every part answers with the whole tracing, one wall moved: only the part it lies in keeps each piece.
      return draftOut({ walls: [{ points: [{ x: 100, y: 100 }, { x: 900, y: 100 }] }], curves: [{ through: [{ x: 600, y: 600 }, { x: 650, y: 650 }, { x: 700, y: 600 }], kind: 'wall' }], notes: `Part ${n}.` });
    },
  });
  const reader = createMapReader({ llm });
  const buf = await terrain(4000, 1000);
  const r = await reader.walls({ buf, width: 4000, height: 1000 });
  const checks = llm.calls.filter((c) => c.purpose === 'map:walls-check');
  assert.equal(checks.length, 3, '3 × 1 close-ups');
  assert.ok(checks.every((c) => /close-up of part of the map/.test(c.prompt)));
  // Each close-up is sent at full detail: wider than the whole map's copy would give it.
  const meta = await sharp(Buffer.from(checks[1].attachments[0].data, 'base64')).metadata();
  assert.ok(meta.width > 1000, `close-up ${meta.width} px wide`);
  // The wall runs through all three parts: the first part (failed) keeps the draft's, the others the checked one,
  // so it's not doubled where they overlap.
  const straight = r.walls.filter((w) => !w.group && !w.door);
  assert.equal(straight.length, 1);
  assert.equal(r.walls.filter((w) => w.door).length, 1, 'the door once');
  // The arc lies in the middle part only: once.
  assert.equal(new Set(r.walls.filter((w) => w.group).map((w) => w.group)).size, 1);
  assert.match(r.notes, /failed for 1 of 3 parts/);
  assert.match(r.notes, /Part \d\./);
});

test('if the check fails on a small map, the first draft stays and the DM is told', async () => {
  const llm = createFakeLLM({ structured: (opts) => (opts.purpose === 'map:walls' ? draftOut() : { nonsense: true }) });
  const r = await createMapReader({ llm }).walls({ buf: await terrain(600, 400), width: 600, height: 400 });
  assert.equal(r.walls.length, 2);
  assert.equal(r.notes, "Draft. The AI's check of its draft failed, so this is its first draft.");
});

/** A small Universal VTT file: a 4 × 3 square map at 50 px a square, one room wall, a door, a torch. */
async function uvttFile({ image = true } = {}) {
  return {
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 4, y: 3 }, pixels_per_grid: 50 },
    line_of_sight: [[{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }]], // the middle point goes (straight on)
    objects_line_of_sight: [[{ x: 0.5, y: 2.5 }, { x: 0.5, y: 2.9 }]],
    portals: [{ position: { x: 1, y: 1.5 }, bounds: [{ x: 1, y: 1 }, { x: 1, y: 2 }], rotation: 0, closed: true, freestanding: false }],
    lights: [{ position: { x: 2, y: 2 }, range: 4, intensity: 1, color: 'ffffaa', shadows: true }],
    ...(image ? { image: (await terrain(200, 150)).toString('base64') } : {}),
  };
}

test('Universal VTT files: walls, doors, lights and the grid, stretched to the map picture', async () => {
  const doc = await uvttFile();
  const buf = Buffer.from(JSON.stringify(doc));
  assert.ok(isUvtt(buf));
  assert.ok(!isUvtt(await terrain(20, 20)));
  assert.throws(() => readUvtt(Buffer.from('{"resolution": {}}')), /isn't a Universal VTT file/);
  // The DM's own picture of the same map at twice the size: everything doubles.
  const c = uvttContents(readUvtt(buf), { width: 400, height: 300 });
  assert.deepEqual(c.walls, [
    { x1: 100, y1: 100, x2: 100, y2: 200, door: true, open: false, kind: 'wall' },
    { x1: 100, y1: 100, x2: 300, y2: 100, door: false, open: false, kind: 'wall' },
    { x1: 300, y1: 100, x2: 300, y2: 200, door: false, open: false, kind: 'wall' },
    { x1: 50, y1: 250, x2: 50, y2: 290, door: false, open: false, kind: 'wall' },
  ]);
  assert.deepEqual(c.lights, [{ x: 200, y: 200, bright: 10, dim: 10 }]);
  assert.deepEqual(c.grid, { size: 100, x: 0, y: 0 });
});

test('the DM imports a .dd2vtt as a map (picture, exact grid, walls, doors, lights), or adds one to a map', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: () => ({ readable: true, kind: 'dungeon', name: 'Crypt', description: 'A crypt.', grid: { visible: false, columns: null, rows: null }, scale: { distance: null, unit: null, per: null }, notes: '' }) }) });
  try {
    const doc = await uvttFile();
    const data = Buffer.from(JSON.stringify(doc)).toString('base64');
    const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'crypt.dd2vtt', data } });
    assert.equal(res.statusCode, 201, res.body);
    const id = res.json().id;
    await t.jobs?.idle?.();
    for (let i = 0; i < 100 && t.maps.get(t.campaign.id, id).reading.status === 'pending'; i++) await new Promise((r) => setTimeout(r, 20));
    const map = t.maps.get(t.campaign.id, id);
    assert.deepEqual(map.image, { ...map.image, width: 200, height: 150 });
    // The file's grid stays (the AI saw no grid; it doesn't get to remove the exact one).
    assert.deepEqual(map.grid, { size: 50, x: 0, y: 0 });
    assert.deepEqual(map.scale, { distance: 5, unit: 'ft', per: 'square' });
    assert.equal(map.name, 'Crypt');
    assert.deepEqual(map.walls.map((w) => [w.door, w.source]), [[true, 'file'], [false, 'file'], [false, 'file'], [false, 'file']]);
    assert.deepEqual(map.lights.map(({ x, y, bright, dim, source }) => ({ x, y, bright, dim, source })), [{ x: 100, y: 100, bright: 10, dim: 10, source: 'file' }]);

    // Adding a file to a map: replaces the last file's walls; the DM's own stay. Players can't.
    const base = `/campaigns/${t.campaign.id}/maps/${id}`;
    await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 5, y1: 5, x2: 60, y2: 5 } } });
    assert.equal((await t.request('POST', `${base}/walls/file`, { as: t.sam.token, body: { data } })).statusCode, 403);
    const again = await t.request('POST', `${base}/walls/file`, { body: { data } });
    assert.equal(again.statusCode, 200, again.body);
    assert.deepEqual(again.json().walls.map((w) => w.source).sort(), ['dm', 'file', 'file', 'file', 'file']);
    const bad = await t.request('POST', `${base}/walls/file`, { body: { data: (await terrain(20, 20)).toString('base64') } });
    assert.equal(bad.statusCode, 400);
    // A file with no picture can't be imported as a map.
    const bare = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'x.dd2vtt', data: Buffer.from(JSON.stringify(await uvttFile({ image: false }))).toString('base64') } });
    assert.equal(bare.statusCode, 400);
    assert.match(bare.json().error, /no picture/);
  } finally {
    await t.cleanup();
  }
});

test('the DM draws curved and round walls; erasing one piece erases the whole curve', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: () => ({ readable: true, kind: 'battle', name: 'X', description: '', grid: { visible: false, columns: null, rows: null }, scale: { distance: null, unit: null, per: null }, notes: '' }) }) });
  try {
    const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'x.png', data: (await terrain(400, 300)).toString('base64') } });
    const base = `/campaigns/${t.campaign.id}/maps/${res.json().id}`;
    const walls = (body) => t.request('PATCH', `${base}/walls`, { body });
    let map = (await walls({ curve: { x1: 100, y1: 100, mx: 150, my: 150, x2: 200, y2: 100 } })).json();
    assert.equal(map.walls.length, 18, 'a half circle in 10° pieces');
    assert.equal(new Set(map.walls.map((w) => w.group)).size, 1);
    map = (await walls({ circle: { x: 300, y: 200, r: 40, kind: 'low' } })).json();
    assert.equal(map.walls.length, 18 + 36);
    assert.ok(map.walls.slice(18).every((w) => w.kind === 'low'));
    map = (await walls({ remove: map.walls[5].id })).json();
    assert.equal(map.walls.length, 36, 'the whole curve went');
    assert.equal((await walls({ curve: { x1: 1, y1: 1, mx: 2, my: 2, x2: 3, y2: 3, kind: 'door' } })).statusCode, 400);
  } finally {
    await t.cleanup();
  }
});
