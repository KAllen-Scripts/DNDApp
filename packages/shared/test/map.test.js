import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMap, snapToken, measure, formatDistance, tokenPx, healthOf, isFogged, fogRect, normalizePins, normalizeRecordLink,
  normalizeStats, normalizeHp, normalizeToken, normalizeGrid, normalizeScale, unitsPerPx, squarePx, isTokenId,
  PERSON_KIND, MAX_PINS, PIN_COLOR, TOKEN_COLORS,
  normalizeWalls, segmentsCross, wallBetween, sightPolygon, pointInPolygon, sightOf, canSee, fogMask, nearestWall, snapWallPoint,
  distanceToWall, doorReach,
  pathCost, isDifficult, speedFromText, normalizeTerrain,
  litAreas, inView, normalizeLights, normalizeLightRadii,
  normalizeCombat, stepTurn, dexModifier, normalizeTemplates, templateShape, tokensInTemplate, inTemplate, snapTemplatePoint, spellArea,
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
  assert.deepEqual(m.tokens, [{ id: 'abc123', kind: 'pc', name: 'Player character', user_id: 4, color: '#2f6fb3', size: 1, x: 100, y: 0, hp: null, conditions: [], hidden: false, stats: null, record: null, light: null, darkvision: 0, speed: null }]);
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
    { id: 'aaaaaa', x1: 0, y1: 10, x2: 100, y2: 10, kind: 'wall', door: false, open: false, locked: false, source: 'ai' },
    { id: 'dddddd', x1: 1, y1: 1, x2: 1, y2: 20, kind: 'wall', door: true, open: true, locked: false, source: 'dm' },
  ]);
  const m = normalizeMap({ image: { width: 10, height: 10 } });
  assert.deepEqual(m.walls, []);
  assert.deepEqual(m.wall_draft, { status: '', error: '', notes: '' });
  assert.equal(m.fog.sight, false);
  assert.equal(m.fog.memory, true);
  assert.equal(m.fog.map, 'dark');
  // Doors are never obstacles; an open door can't be locked.
  const [low, door, open] = normalizeWalls([
    { id: 'llllll', x1: 0, y1: 0, x2: 9, y2: 0, kind: 'low', locked: true },
    { id: 'oooooo', x1: 0, y1: 0, x2: 9, y2: 0, kind: 'low', door: true, locked: true },
    { id: 'pppppp', x1: 0, y1: 0, x2: 9, y2: 0, door: true, open: true, locked: true },
  ], { width: 10, height: 10 });
  assert.deepEqual([low.kind, low.locked, door.kind, door.locked, open.locked], ['low', false, 'wall', true, false]);
});

test('obstacles block movement but not sight', () => {
  const m = room({ walls: [{ id: 'roof01', x1: 50, y1: 0, x2: 50, y2: 100, kind: 'low' }] });
  assert.ok(wallBetween(m, { x: 25, y: 50 }, { x: 75, y: 50 }));
  assert.ok(pointInPolygon(90, 50, sightPolygon(m, { x: 25, y: 50 })));
});

test('distanceToWall and doorReach', () => {
  assert.equal(distanceToWall({ x: 5, y: 3 }, { x1: 0, y1: 0, x2: 10, y2: 0 }), 3);
  assert.equal(distanceToWall({ x: 13, y: 4 }, { x1: 0, y1: 0, x2: 10, y2: 0 }), 5);
  assert.equal(doorReach(normalizeMap({ image: { width: 100, height: 100 }, grid: { size: 20, x: 0, y: 0 } })), 30);
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
  // Greyed out: unseen and covered parts are dim, not dark.
  const grey = room({ fog: { enabled: true, map: 'grey', shapes: [{ op: 'cover', x: 0, y: 0, w: 5, h: 5 }] } });
  assert.deepEqual(fogMask(grey).map((x) => x.fill), ['dim', 'dim']);
});

test('nearestWall picks the wall under a click; snapWallPoint joins wall ends, then grid corners', () => {
  const m = room({ grid: { size: 20, x: 0, y: 0 } });
  assert.equal(nearestWall(m, { x: 52, y: 50 }, 5).id, 'door01');
  assert.equal(nearestWall(m, { x: 60, y: 50 }, 5), null);
  assert.deepEqual(snapWallPoint(m, { x: 47, y: 42 }, 5), { x: 50, y: 40 });
  assert.deepEqual(snapWallPoint(m, { x: 21, y: 38 }, 5), { x: 20, y: 40 });
  assert.deepEqual(snapWallPoint(m, { x: 30.04, y: 30 }, 5), { x: 30, y: 30 });
});

// ---------- initiative ----------

test('normalizeCombat keeps the turn order sorted, drops tokens that are gone, and only a rolled turn', () => {
  const tokens = [
    { id: 'aaaaaa', kind: 'enemy', name: 'Goblin' },
    { id: 'bbbbbb', kind: 'pc', name: 'Thorin' },
    { id: 'cccccc', kind: 'npc', name: 'Hal' },
  ];
  const c = normalizeCombat({ round: 2, turn: 'cccccc', entries: [
    { id: 'cccccc', init: null }, { id: 'aaaaaa', init: 12, mod: 2 }, { id: 'bbbbbb', init: 12, mod: 2 }, { id: 'zzzzzz', init: 30 }, { id: 'aaaaaa', init: 1 },
  ] }, tokens);
  // Ties: the higher modifier, then player characters; not rolled yet goes last.
  assert.deepEqual(c.entries.map((e) => e.id), ['bbbbbb', 'aaaaaa', 'cccccc']);
  assert.equal(c.turn, null, "Hal hasn't rolled, so it can't be his turn");
  assert.equal(c.round, 2);
  assert.equal(normalizeCombat(null, tokens), null);
  assert.deepEqual(normalizeMap({ tokens: [{ id: 'aaaaaa' }], combat: { entries: [{ id: 'aaaaaa', init: 5 }], turn: 'aaaaaa' } }).combat, { round: 1, turn: 'aaaaaa', entries: [{ id: 'aaaaaa', init: 5, mod: null, moved: 0 }] });
});

test('stepTurn goes round the rolled entries, into the next round and back', () => {
  const c = { round: 1, turn: null, entries: [{ id: 'a', init: 20 }, { id: 'b', init: 10 }, { id: 'c', init: null }] };
  assert.deepEqual(stepTurn(c, 1), { round: 1, turn: 'a' });
  assert.deepEqual(stepTurn({ ...c, turn: 'a' }, 1), { round: 1, turn: 'b' });
  assert.deepEqual(stepTurn({ ...c, turn: 'b' }, 1), { round: 2, turn: 'a' }); // c hasn't rolled: skipped
  assert.deepEqual(stepTurn({ ...c, round: 2, turn: 'a' }, -1), { round: 1, turn: 'b' });
  assert.deepEqual(stepTurn({ ...c, turn: 'a' }, -1), { round: 1, turn: 'a' }); // never before round 1
  assert.equal(stepTurn({ round: 1, turn: null, entries: [{ id: 'a', init: null }] }, 1), null);
});

test('dexModifier reads a stat block: inline, Markdown tables, a bare score, or nothing', () => {
  assert.equal(dexModifier('STR 10 (+0) DEX 16 (+3) CON 12 (+1)'), 3);
  assert.equal(dexModifier('**DEX** 8 (−1)'), -1);
  assert.equal(dexModifier('| STR | DEX | CON |\n|:-:|:-:|:-:|\n| 8 (-1) | 14 (+2) | 10 (+0) |'), 2);
  assert.equal(dexModifier('| **Str** | **Dex** |\n|---|---|\n| 19 | 7 |'), -2);
  assert.equal(dexModifier('Dexterity 18'), 4);
  assert.equal(dexModifier('A big angry bear.'), null);
  assert.equal(dexModifier(null), null);
});

// ---------- spell templates ----------

const grid = (over = {}) => normalizeMap({ image: { width: 700, height: 490 }, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' }, ...over });

test('templateShape: circles, 5e cones (as wide as long), lines and cubes, in image pixels', () => {
  const map = grid();
  const t = (o) => normalizeTemplates([{ id: 'tttttt', x: 70, y: 70, ...o }], map.image)[0];
  assert.deepEqual(templateShape(map, t({ shape: 'circle', size: 20 })), { circle: { cx: 70, cy: 70, r: 140 } });
  assert.deepEqual(templateShape(map, t({ shape: 'cone', size: 15, angle: 0 })).points, [[70, 70], [175, 17.5], [175, 122.5]]);
  assert.deepEqual(templateShape(map, t({ shape: 'line', size: 30, width: 5, angle: 90 })).points, [[87.5, 70], [87.5, 280], [52.5, 280], [52.5, 70]]);
  // A cube lies on the side its angle points to.
  assert.deepEqual(templateShape(map, t({ shape: 'cube', size: 10, angle: 135 })).points, [[70, 70], [0, 70], [0, 140], [70, 140]]);
  // Without a scale, a square counts as 5 ft.
  const noScale = normalizeMap({ image: { width: 700, height: 490 }, grid: { size: 50, x: 0, y: 0 } });
  assert.equal(templateShape(noScale, t({ shape: 'circle', size: 10 })).circle.r, 100);
});

test('tokensInTemplate: a token is caught when any of its squares\' middles is inside', () => {
  const map = grid({ tokens: [
    { id: 'aaaaaa', x: 87.5, y: 87.5 }, // the square just inside the corner
    { id: 'bbbbbb', x: 227.5, y: 87.5 }, // 4 squares across: its middle is 157.5 px away
    { id: 'cccccc', x: 245, y: 245, size: 2 }, // Large: its nearest square's middle is ~223 px away
  ] });
  const fireball = normalizeTemplates([{ id: 'tttttt', shape: 'circle', x: 70, y: 70, size: 20 }], map.image)[0];
  assert.deepEqual(tokensInTemplate(map, fireball).map((t) => t.id), ['aaaaaa']);
  const bigger = { ...fireball, size: 35 };
  assert.deepEqual(tokensInTemplate(map, bigger).map((t) => t.id), ['aaaaaa', 'bbbbbb', 'cccccc']);
  // Off a grid, only the centre counts.
  const free = normalizeMap({ ...map, grid: null, scale: { distance: 5, unit: 'ft', per: 'width' }, tokens: [{ id: 'aaaaaa', x: 10, y: 0 }] });
  assert.deepEqual(tokensInTemplate(free, { shape: 'circle', x: 0, y: 0, size: 0.05 }).map((t) => t.id), []); // 7 px across
  assert.ok(inTemplate(map, { shape: 'cone', x: 70, y: 70, angle: 0, size: 15 }, 175, 17.5), 'a corner counts');
});

test('snapTemplatePoint puts the origin on a square corner on a grid', () => {
  assert.deepEqual(snapTemplatePoint(grid(), { x: 52, y: 89 }), { x: 35, y: 105 });
  assert.deepEqual(snapTemplatePoint(normalizeMap({ image: { width: 700, height: 490 } }), { x: 52.123, y: 89 }), { x: 52.12, y: 89 });
});

test('normalizeTemplates: known shapes, sizes required, angles kept within a turn, width only on lines', () => {
  const [a, b] = normalizeTemplates([
    { id: 'tttttt', shape: 'cone', x: 5000, y: -3, angle: -90, size: 15, width: 9, color: 'red', label: '  Burning   Hands ', user_id: 4 },
    { id: 'uuuuuu', shape: 'line', x: 1, y: 1, size: 60 },
    { id: 'vvvvvv', shape: 'circle', x: 1, y: 1 },
    { id: 'tttttt', shape: 'circle', x: 1, y: 1, size: 5 },
  ], { width: 700, height: 490 });
  assert.deepEqual(a, { id: 'tttttt', shape: 'cone', x: 700, y: 0, angle: 270, size: 15, width: null, label: 'Burning Hands', color: '#e8743b', user_id: 4 });
  assert.equal(b.width, 5);
  assert.equal(normalizeTemplates([{ id: 'x', shape: 'circle', size: 5 }]).length, 0);
});

test('spellArea reads a spell\'s area from its range or description', () => {
  assert.deepEqual(spellArea({ range: '150 feet', description: 'Each creature in a 20-foot-radius sphere centered on that point' }), { shape: 'circle', size: 20 });
  assert.deepEqual(spellArea({ range: 'Self (15-foot cone)', description: 'Each creature in a 15-foot cone must make a Dexterity saving throw.' }), { shape: 'cone', size: 15 });
  assert.deepEqual(spellArea({ range: 'Self (100-foot line)' }), { shape: 'line', size: 100, width: 5 });
  assert.deepEqual(spellArea({ range: 'Self', description: 'A line of strong wind 60 feet long and 10 feet wide blasts from you' }), { shape: 'line', size: 60, width: 10 });
  assert.deepEqual(spellArea({ range: '90 feet', description: 'a 20-foot cube of fog' }), { shape: 'cube', size: 20 });
  assert.equal(spellArea({ range: '120 feet', description: 'three glowing darts' }), null);
});

// ---------- light and darkness ----------

test('sightPolygon with a reach stops at that distance (a light, darkvision)', () => {
  const map = normalizeMap({ image: { width: 700, height: 490 } });
  const poly = sightPolygon(map, { x: 350, y: 245 }, 100);
  assert.ok(poly.length >= 72);
  for (const [x, y] of poly) assert.ok(Math.hypot(x - 350, y - 245) <= 100.1);
  assert.ok(pointInPolygon(440, 245, poly));
  assert.ok(!pointInPolygon(460, 245, poly));
});

test('sightOf in darkness: darkvision, and lit places cut to what the token sees', () => {
  const map = normalizeMap({
    image: { width: 700, height: 490 }, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' },
    fog: { enabled: true, sight: true, dark: true },
    tokens: [{ id: 'aaaaaa', kind: 'pc', user_id: 1, x: 52.5, y: 52.5, darkvision: 30 }],
    lights: [{ id: 'llllll', x: 600, y: 400, bright: 10, dim: 10 }],
  });
  const views = sightOf(map, 1);
  assert.equal(views.length, 2);
  assert.ok(Array.isArray(views[0]), 'darkvision: a plain polygon');
  assert.ok(views[1].clip, 'the light: its area, clipped to the token\'s sight');
  assert.ok(canSee(map, views, 200, 52.5), '30 ft of darkvision');
  assert.ok(!canSee(map, views, 300, 52.5));
  assert.ok(canSee(map, views, 620, 420), 'lit');
  assert.ok(inView(620, 420, views[1]));
  // A wall in between: the light is still there, but not seen.
  const walled = normalizeMap({ ...map, walls: [{ id: 'wwwwww', x1: 500, y1: 0, x2: 500, y2: 490 }] });
  assert.ok(!canSee(walled, sightOf(walled, 1), 620, 420));
  // A token's own light counts; daylight ignores all of it.
  assert.equal(litAreas(normalizeMap({ ...map, lights: [], tokens: [{ ...map.tokens[0], light: { bright: 20, dim: 20 } }] })).length, 1);
  assert.equal(sightOf(normalizeMap({ ...map, fog: { enabled: true, sight: true } }), 1).length, 1);
});

test('lights and token light radii are normalised', () => {
  assert.equal(normalizeLightRadii({ bright: 0, dim: 0 }), null);
  assert.deepEqual(normalizeLightRadii({ bright: '20', dim: 20 }), { bright: 20, dim: 20 });
  assert.deepEqual(normalizeLights([{ id: 'llllll', x: 900, y: 5, bright: 5, dim: 5, source: 'ai' }, { id: 'mmmmmm', bright: 0 }], { width: 700, height: 490 }),
    [{ id: 'llllll', x: 700, y: 5, bright: 5, dim: 5, source: 'ai' }]);
  assert.equal(normalizeMap({}).fog.dark, false);
});

// ---------- movement ----------

test('pathCost: squares the 5e way along waypoints, double in difficult terrain; length off a grid', () => {
  const map = normalizeMap({
    image: { width: 700, height: 490 }, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' },
    terrain: [{ id: 'dddddd', points: [[105, 0], [175, 0], [175, 490], [105, 490]] }], // columns 3 and 4
  });
  const p = (x, y) => ({ x: x * 35 + 17.5, y: y * 35 + 17.5 });
  assert.deepEqual(pathCost(map, [p(0, 0), p(2, 0)]), { value: 10, unit: 'ft', squares: 2, difficult: false });
  // Across the two difficult columns: 1 + 1 + 2 + 2 + 1.
  assert.deepEqual(pathCost(map, [p(0, 0), p(5, 0)]), { value: 35, unit: 'ft', squares: 7, difficult: true });
  // Waypoints: down 2, then across 2 diagonally (each diagonal step one square).
  assert.equal(pathCost(map, [p(0, 0), p(0, 2), p(2, 4)]).squares, 4);
  assert.ok(isDifficult(map, 120, 300));
  const free = normalizeMap({ image: { width: 1000, height: 500 }, scale: { distance: 100, unit: 'ft', per: 'width' } });
  assert.deepEqual(pathCost(free, [{ x: 0, y: 0 }, { x: 300, y: 400 }]), { value: 50, unit: 'ft', difficult: false });
  assert.equal(pathCost(normalizeMap({ image: { width: 10, height: 10 } }), [{ x: 0, y: 0 }, { x: 5, y: 5 }]), null);
});

test('speedFromText and normalizeTerrain', () => {
  assert.equal(speedFromText('30 ft., fly 60 ft.'), 30);
  assert.equal(speedFromText('Speed 25 feet'), 25);
  assert.equal(speedFromText(''), null);
  assert.deepEqual(normalizeTerrain([{ id: 'dddddd', points: [[0, 0], [900, 0], [10, 10]], source: 'ai' }, { id: 'eeeeee', points: [[0, 0], [1, 1]] }], { width: 700, height: 490 }),
    [{ id: 'dddddd', points: [[0, 0], [700, 0], [10, 10]], source: 'ai' }]);
});
