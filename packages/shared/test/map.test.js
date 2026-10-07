import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMap, snapToken, measure, formatDistance, tokenPx, healthOf, isFogged, fogRect, normalizePins, normalizeRecordLink,
  normalizeStats, normalizeHp, normalizeToken, normalizeGrid, normalizeScale, unitsPerPx, squarePx, isTokenId,
  PERSON_KIND, MAX_PINS, PIN_COLOR, TOKEN_COLORS,
  normalizeWalls, segmentsCross, wallBetween, sightPolygon, pointInPolygon, sightOf, canSee, fogMask, nearestWall, snapWallPoint,
} from '../src/map.js';

const battle = normalizeMap({ image: { width: 700, height: 490 }, grid: { size: 70, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } });

test('normalizeMap keeps known fields only and drops a per-square scale without a grid', () => {
  const m = normalizeMap({
    name: '  Old   mill ', image: { width: 100, height: 50 }, evil: true, scale: { distance: 5, unit: 'ft', per: 'square' },
    tokens: [{ id: 'abc123', kind: 'pc', user_id: 4, x: 500, y: -3, size: 7 }, { id: 'abc123', kind: 'npc' }, { id: 'no' }],
  });
  assert.equal(m.name, 'Old mill');
  assert.equal(m.evil, undefined);
  assert.equal(m.scale, null);
  assert.equal(m.shown, false);
  assert.deepEqual(m.tokens, [{ id: 'abc123', kind: 'pc', name: 'Player character', user_id: 4, color: '#2f6fb3', size: 1, x: 100, y: 0, hp: null, conditions: [], hidden: false, stats: null, record: null }]);
});

test('snapToken: Medium in the middle of a square, Large on a corner, always on the map', () => {
  assert.deepEqual(snapToken(battle, { size: 1 }, 100, 100), { x: 105, y: 105 });
  assert.deepEqual(snapToken(battle, { size: 0.5 }, 100, 100), { x: 105, y: 105 });
  assert.deepEqual(snapToken(battle, { size: 2 }, 290, 290), { x: 280, y: 280 });
  assert.deepEqual(snapToken(battle, { size: 2 }, 9999, -50), { x: 630, y: 70 });
  const offset = normalizeMap({ ...battle, grid: { size: 70, x: 20, y: 10 } });
  assert.deepEqual(snapToken(offset, { size: 1 }, 100, 100), { x: 125, y: 115 });
  // No grid: placed freely, kept inside.
  const region = normalizeMap({ image: { width: 4000, height: 2000 } });
  assert.equal(tokenPx(region, { size: 1 }), 100);
  assert.deepEqual(snapToken(region, { size: 1 }, 1234.567, 3), { x: 1234.57, y: 50 });
});

test('measure: 5e squares on a grid, straight lines otherwise', () => {
  const d = measure(battle, { x: 35, y: 35 }, { x: 35 + 70 * 4, y: 35 + 70 * 2 });
  assert.deepEqual(d, { value: 20, unit: 'ft', squares: 4 });
  assert.equal(formatDistance(d), '20 ft');
  const region = normalizeMap({ image: { width: 3000, height: 2000 }, scale: { distance: 30, unit: 'mi', per: 'width' } });
  assert.equal(formatDistance(measure(region, { x: 0, y: 0 }, { x: 300, y: 400 })), '5 mi');
  assert.equal(measure(normalizeMap({ image: { width: 10, height: 10 } }), { x: 0, y: 0 }, { x: 1, y: 1 }), null);
});

test('healthOf: how hurt a creature looks', () => {
  assert.equal(healthOf(null), null);
  assert.equal(healthOf({ current: 10, max: 10 }), 'unhurt');
  assert.equal(healthOf({ current: 6, max: 10 }), 'hurt');
  assert.equal(healthOf({ current: 5, max: 10 }), 'bloodied');
  assert.equal(healthOf({ current: -2, max: 10 }), 'down');
});

test('fog: later rectangles win; rectangles line up with the grid', () => {
  const m = normalizeMap({ ...battle, fog: { enabled: true, shapes: [{ op: 'reveal', x: 0, y: 0, w: 350, h: 490 }, { op: 'cover', x: 70, y: 70, w: 70, h: 70 }] } });
  assert.equal(isFogged(m, 600, 100), true);
  assert.equal(isFogged(m, 10, 10), false);
  assert.equal(isFogged(m, 100, 100), true);
  assert.equal(isFogged(normalizeMap({ ...m, fog: { ...m.fog, enabled: false } }), 600, 100), false);
  assert.deepEqual(fogRect(battle, { x: 100, y: 30 }, { x: 20, y: 150 }), { x: 0, y: 0, w: 140, h: 210 });
});

test('normalizePins: kept on the map, unique ids, labels and colours tidied, at most MAX_PINS', () => {
  const image = { width: 100, height: 50 };
  const pins = normalizePins([
    { id: 'pin001', x: 500, y: -5, label: '  Secret   door? ', color: '#00FF00' },
    { id: 'pin001', x: 1, y: 1 }, // same id again
    { id: 'NO!', x: 1, y: 1 },
    null,
    { id: 'pin002', x: 'left', label: 'x'.repeat(200), color: 'red' },
  ], image);
  assert.deepEqual(pins, [
    { id: 'pin001', x: 100, y: 0, label: 'Secret door?', color: '#00ff00' },
    { id: 'pin002', x: 50, y: 25, label: 'x'.repeat(80), color: PIN_COLOR },
  ]);
  assert.deepEqual(normalizePins('nonsense', image), []);
  const many = Array.from({ length: MAX_PINS + 5 }, (_, i) => ({ id: `pin${String(i).padStart(4, '0')}`, x: 1, y: 1 }));
  assert.equal(normalizePins(many, image).length, MAX_PINS);
});

test('record links, stat blocks and hit points are cleaned or dropped', () => {
  assert.deepEqual(normalizeRecordLink({ id: '12', title: '  Brother   Hal ' }), { id: 12, title: 'Brother Hal' });
  for (const bad of [null, 'x', { id: 0, title: 'x' }, { id: 1.5, title: 'x' }, { id: 3, title: '  ' }]) assert.equal(normalizeRecordLink(bad), null);

  assert.ok(PERSON_KIND.test('npc') && PERSON_KIND.test('Monster') && PERSON_KIND.test('faction member'));
  assert.ok(!PERSON_KIND.test('location') && !PERSON_KIND.test('debt'));

  assert.deepEqual(normalizeStats({ name: ' Ogre ', ac: 150, hp_formula: '7d10 + 21', speed: '40 ft.', challenge: '2', text: '  **Ogre**  ', source: 'ai', extra: 1 }),
    { name: 'Ogre', ac: 99, hp_formula: '7d10 + 21', speed: '40 ft.', challenge: '2', text: '**Ogre**', source: 'ai' });
  assert.equal(normalizeStats({ name: 'Ogre', text: '   ' }), null, 'no text, no stat block');
  assert.equal(normalizeStats('Ogre'), null);
  assert.equal(normalizeStats({ text: 'x', source: 'hacker' }).source, 'manual');
  assert.equal(normalizeStats({ text: 'x', ac: 'high' }).ac, null);

  assert.deepEqual(normalizeHp({ current: 4.6, max: '7' }), { current: 5, max: 7 });
  assert.deepEqual(normalizeHp({ current: -500000 }), { current: -99999, max: null });
  assert.deepEqual(normalizeHp({ max: 0 }), { current: null, max: 1 }, 'a max is at least 1');
  assert.equal(normalizeHp(null), null);
  assert.equal(normalizeHp({}), null);
});

test('tokens: unknown kinds become NPCs; only player characters belong to a player; ungridded sizes follow the map', () => {
  const map = normalizeMap({ image: { width: 800, height: 400 } });
  const t = normalizeToken({ id: 'tok123', kind: 'dragon', user_id: 3, size: 9, color: 'blue', conditions: ['prone', 'prone', 'sleepy'], hidden: 'yes' }, map);
  assert.equal(t.kind, 'npc');
  assert.equal(t.name, 'NPC');
  assert.equal(t.user_id, null);
  assert.equal(t.size, 1);
  assert.equal(t.color, TOKEN_COLORS.npc);
  assert.deepEqual(t.conditions, ['prone']);
  assert.equal(t.hidden, false);
  assert.deepEqual([t.x, t.y], [400, 200], 'no position: the middle');
  assert.equal(normalizeToken({ kind: 'pc', user_id: '7' }, map).user_id, 7);
  assert.equal(normalizeToken({ id: 'UPPER1' }).id, '');
  assert.ok(isTokenId('abc123') && !isTokenId('ab') && !isTokenId('a'.repeat(17)));
  // Without a grid a Medium token is 1/40 of the longer side, and isn't snapped.
  assert.equal(squarePx(map), 20);
  assert.equal(tokenPx(map, { size: 2 }), 40);
  assert.deepEqual(snapToken(map, { size: 1 }, 123.456, 3), { x: 123.46, y: 10 });
});

test('grids and scales: offsets wrap into one square; bad values are dropped; scale across the whole map', () => {
  assert.deepEqual(normalizeGrid({ size: 70, x: -10, y: 145 }, { width: 700, height: 490 }), { size: 70, x: 60, y: 5 });
  assert.deepEqual(normalizeGrid({ size: 2 }, { width: 700 }), { size: 4, x: 0, y: 0 }, 'at least 4 px');
  assert.equal(normalizeGrid({ size: 'big' }), null);
  assert.equal(normalizeGrid(null), null);
  assert.deepEqual(normalizeGrid({ size: 5000 }, { width: 700, height: 490 }), { size: 700, x: 0, y: 0 });
  assert.deepEqual(normalizeScale({ distance: '2', unit: 'parsecs', per: 'map' }), { distance: 2, unit: 'ft', per: 'square' });
  assert.equal(normalizeScale({ distance: '' }), null);
  assert.equal(normalizeScale('far'), null);

  const region = normalizeMap({ image: { width: 1000, height: 600 }, scale: { distance: 50, unit: 'mi', per: 'width' } });
  assert.equal(unitsPerPx(region), 0.05);
  assert.deepEqual(measure(region, { x: 0, y: 0 }, { x: 300, y: 400 }), { value: 25, unit: 'mi' });
  assert.equal(formatDistance(measure(region, { x: 0, y: 0 }, { x: 1000, y: 0 })), '50 mi');
  assert.equal(formatDistance({ value: 1234.4, unit: 'ft' }), '1,234 ft');
  assert.equal(formatDistance({ value: 12.34, unit: 'km' }), '12.3 km');
  assert.equal(formatDistance(null), '');
  assert.equal(unitsPerPx(normalizeMap({ image: { width: 10, height: 10 } })), null);
  // A per-square scale with no grid can't measure (normalizeMap drops it anyway).
  assert.equal(unitsPerPx({ scale: { distance: 5, per: 'square' }, grid: null, image: { width: 10 } }), null);
});

// A 100 × 100 room split by a wall down the middle, with a door in it from y 40 to 60.
const room = (over = {}) => normalizeMap({
  image: { width: 100, height: 100 },
  fog: { enabled: true, sight: true },
  walls: [
    { id: 'wall01', x1: 50, y1: 0, x2: 50, y2: 40 },
    { id: 'door01', x1: 50, y1: 40, x2: 50, y2: 60, door: true },
    { id: 'wall02', x1: 50, y1: 60, x2: 50, y2: 100 },
  ],
  tokens: [{ id: 'thorin', kind: 'pc', user_id: 3, x: 25, y: 50 }],
  ...over,
});

test('normalizeWalls keeps real lines on the image; only doors can be open', () => {
  const walls = normalizeWalls([
    { id: 'aaaaaa', x1: -5, y1: 10, x2: 500, y2: 10, open: true, source: 'ai' },
    { id: 'aaaaaa', x1: 0, y1: 0, x2: 10, y2: 10 },
    { id: 'bbbbbb', x1: 5, y1: 5, x2: 5.2, y2: 5 },
    { id: 'cccccc', x1: 1, y1: 1, x2: 1, y2: 'x' },
    { id: 'dddddd', x1: 1, y1: 1, x2: 1, y2: 20, door: true, open: true, source: 'evil' },
    { id: 'no', x1: 1, y1: 1, x2: 9, y2: 9 },
  ], { width: 100, height: 50 });
  assert.deepEqual(walls, [
    { id: 'aaaaaa', x1: 0, y1: 10, x2: 100, y2: 10, door: false, open: false, source: 'ai' },
    { id: 'dddddd', x1: 1, y1: 1, x2: 1, y2: 20, door: true, open: true, source: 'dm' },
  ]);
  const m = normalizeMap({ image: { width: 10, height: 10 } });
  assert.deepEqual(m.walls, []);
  assert.deepEqual(m.wall_draft, { status: '', error: '', notes: '' });
  assert.equal(m.fog.sight, false);
});

test('segmentsCross and wallBetween: walls and closed doors are in the way, open doors are not', () => {
  assert.ok(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }));
  assert.ok(!segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 }));
  assert.ok(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }), 'touching counts');
  const m = room();
  assert.ok(wallBetween(m, { x: 25, y: 20 }, { x: 75, y: 20 }));
  assert.ok(wallBetween(m, { x: 25, y: 50 }, { x: 75, y: 50 }), 'closed door');
  assert.ok(!wallBetween(m, { x: 25, y: 20 }, { x: 40, y: 80 }));
  const open = room();
  open.walls[1].open = true;
  assert.ok(!wallBetween(open, { x: 25, y: 50 }, { x: 75, y: 50 }));
});

test('sightPolygon: a token sees its own side of a wall, and through an open door', () => {
  const m = room();
  const poly = sightPolygon(m, { x: 25, y: 50 });
  assert.ok(pointInPolygon(10, 10, poly));
  assert.ok(pointInPolygon(45, 95, poly));
  assert.ok(!pointInPolygon(55, 50, poly));
  assert.ok(!pointInPolygon(90, 90, poly));

  const open = room();
  open.walls[1].open = true;
  const through = sightPolygon(open, { x: 25, y: 50 });
  assert.ok(pointInPolygon(90, 50, through), 'straight through the doorway');
  assert.ok(!pointInPolygon(90, 5, through), 'not round the corner');

  // No walls: the whole image.
  const all = sightPolygon(normalizeMap({ image: { width: 100, height: 100 } }), { x: 0, y: 100 });
  for (const [x, y] of [[1, 1], [99, 1], [99, 99]]) assert.ok(pointInPolygon(x, y, all), `${x},${y}`);
});

test('sightOf and canSee: only with fog and line of sight on, and only from the player\'s own tokens', () => {
  const m = room();
  assert.equal(sightOf(m, 3).length, 1);
  assert.deepEqual(sightOf(m, 4), []);
  assert.deepEqual(sightOf(room({ fog: { enabled: true } }), 3), []);
  assert.deepEqual(sightOf(room({ fog: { enabled: false, sight: true } }), 3), []);
  const polys = sightOf(m, 3);
  assert.ok(canSee(m, polys, 10, 10));
  assert.ok(!canSee(m, polys, 75, 50));
  // The DM's reveals still show outside sight.
  const revealed = room({ fog: { enabled: true, sight: true, shapes: [{ op: 'reveal', x: 60, y: 0, w: 40, h: 100 }] } });
  assert.ok(canSee(revealed, sightOf(revealed, 3), 75, 50));
  assert.ok(canSee(room({ fog: { enabled: false } }), [], 75, 50));
});

test('fogMask: covered, then places seen before, then the DM\'s rectangles, then what is in sight', () => {
  const m = room({ fog: { enabled: true, sight: true, shapes: [{ op: 'reveal', x: 0, y: 0, w: 10, h: 10 }, { op: 'cover', x: 0, y: 0, w: 5, h: 5 }] } });
  assert.deepEqual(fogMask(m, { polygons: [[[0, 0], [1, 0], [1, 1]]], explored: [{ x: 1, y: 2, w: 3, h: 4 }] }), [
    { fill: 'cover', x: 0, y: 0, w: 100, h: 100 },
    { fill: 'dim', x: 1, y: 2, w: 3, h: 4 },
    { fill: 'clear', x: 0, y: 0, w: 10, h: 10 },
    { fill: 'cover', x: 0, y: 0, w: 5, h: 5 },
    { fill: 'clear', points: [[0, 0], [1, 0], [1, 1]] },
  ]);
  assert.deepEqual(fogMask(room({ fog: { enabled: false } })), []);
});

test('nearestWall picks the wall under a click; snapWallPoint joins wall ends, then grid corners', () => {
  const m = room({ grid: { size: 20, x: 0, y: 0 } });
  assert.equal(nearestWall(m, { x: 52, y: 50 }, 5).id, 'door01');
  assert.equal(nearestWall(m, { x: 60, y: 50 }, 5), null);
  assert.deepEqual(snapWallPoint(m, { x: 47, y: 42 }, 5), { x: 50, y: 40 });
  assert.deepEqual(snapWallPoint(m, { x: 21, y: 38 }, 5), { x: 20, y: 40 });
  assert.deepEqual(snapWallPoint(m, { x: 30.04, y: 30 }, 5), { x: 30, y: 30 });
});
