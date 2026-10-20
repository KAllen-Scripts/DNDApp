/**
 * Height on maps (owner, 2026-10-15): raised areas (roofs, wall-walks,
 * cliffs) and how tall tokens are. Two tokens see each other over the
 * raised areas when the line from one's eyes to the top of the other's
 * head clears every edge it crosses. The cases are the owner's own
 * drawings and his giants.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMap, tokenSeesOver, parseHeight, groundAt, tokenTall, heightShadows, playerFogMask, eyeOf, headOf, sightOf, maskFillAt } from '../src/map.js';

// 1 px = 1 ft. A 15 ft roof covers x 0..40; open ground to its right.
const ROOF = [{ id: 'roof01', points: [[0, 0], [40, 0], [40, 100], [0, 100]], height: 15 }];
// A 15 ft wall, 1 ft thick, at x 99..100.
const WALL = [{ id: 'wall01', points: [[99, 0], [100, 0], [100, 100], [99, 100]], height: 15 }];
const tok = (id, x, extra = {}) => ({ id, kind: 'npc', x, y: 50, ...extra });
const sees = (raised, a, b) => {
  const m = normalizeMap({ image: { width: 200, height: 100 }, raised, tokens: [a, b] });
  return [tokenSeesOver(m, m.tokens[0], m.tokens[1]), tokenSeesOver(m, m.tokens[1], m.tokens[0])];
};

test('someone on a roof: seen from the right angles only (the owner\'s three drawings)', () => {
  // A on the roof right at its edge, B just past the foot of the wall: they see each other.
  assert.deepEqual(sees(ROOF, tok('aaaaaa', 37.5), tok('bbbbbb', 47.5)), [true, true]);
  // A 10 ft back from the edge, B in the same place: the edge is in the way, both ways.
  assert.deepEqual(sees(ROOF, tok('aaaaaa', 27.5), tok('bbbbbb', 47.5)), [false, false]);
  // The same distance apart as the last one, but A at the edge and B further out: they do.
  assert.deepEqual(sees(ROOF, tok('aaaaaa', 37.5), tok('bbbbbb', 57.5)), [true, true]);
});

test('tall creatures see and are seen over a wall shorter than them; flying counts too', () => {
  assert.deepEqual(sees(WALL, tok('aaaaaa', 85), tok('bbbbbb', 115)), [false, false], 'two people');
  assert.deepEqual(sees(WALL, tok('aaaaaa', 85, { size: 3 }), tok('bbbbbb', 115, { size: 3 })), [true, true], 'two Huge (20 ft) giants');
  assert.deepEqual(sees(WALL, tok('aaaaaa', 85, { height: 20 }), tok('bbbbbb', 115, { height: 20 })), [true, true], 'set by hand');
  assert.deepEqual(sees(WALL, tok('aaaaaa', 85, { elevation: 20 }), tok('bbbbbb', 115)), [true, true], 'flying 20 ft up');
  // A person close to the wall can't see a giant just behind it; from further back they can.
  assert.deepEqual(sees(WALL, tok('aaaaaa', 115), tok('bbbbbb', 85, { height: 20 })), [false, false]);
  assert.deepEqual(sees(WALL, tok('aaaaaa', 145), tok('bbbbbb', 85, { height: 20 })), [true, true]);
});

test('ground height: the highest raised area under a point; eyes and heads from it', () => {
  const m = normalizeMap({
    image: { width: 200, height: 100 },
    raised: [...ROOF, { id: 'tower1', points: [[0, 0], [10, 0], [10, 10], [0, 10]], height: 30 }, { id: 'pit001', points: [[150, 0], [160, 0], [160, 10], [150, 10]], height: -10 }],
    tokens: [tok('aaaaaa', 20), tok('bbbbbb', 5, { y: 5, elevation: 5 })],
  });
  assert.equal(groundAt(m, 20, 50), 15);
  assert.equal(groundAt(m, 5, 5), 30, 'the tower on the roof');
  assert.equal(groundAt(m, 155, 5), -10, 'a pit');
  assert.equal(groundAt(m, 100, 50), 0);
  assert.deepEqual(eyeOf(m, m.tokens[0]), { x: 20, y: 50, z: 20 });
  assert.deepEqual(headOf(m, m.tokens[1]), { x: 5, y: 5, z: 41 });
  // A height out of range is clamped; nonsense is dropped.
  const n = normalizeMap({ image: { width: 200, height: 100 }, raised: [{ id: 'xxxxxx', points: [[0, 0], [1, 0], [1, 1]], height: 99999 }, { id: 'yyyyyy', points: [[0, 0]], height: 3 }] });
  assert.deepEqual(n.raised, [{ id: 'xxxxxx', points: [[0, 0], [1, 0], [1, 1]], height: 1000, source: 'dm' }]);
});

test('how tall a token is: set by hand, else its sheet\'s, else its size\'s', () => {
  assert.equal(tokenTall({ size: 1 }), 6);
  assert.equal(tokenTall({ size: 0.5 }), 2);
  assert.equal(tokenTall({ size: 4 }), 30);
  assert.equal(tokenTall({ size: 1, tall: 4.5 }), 4.5);
  assert.equal(tokenTall({ size: 1, tall: 4.5, height: 12 }), 12);
  assert.deepEqual(['5\'10"', '5 ft 10 in', '6 feet', '178 cm', '1.8 m', '70 in', '4\'', 'tall', ''].map(parseHeight), [5.8, 5.8, 6, 5.8, 5.9, 5.8, 4, null, null]);
});

test('the fog covers what a player can\'t see over the raised areas, not the DM\'s reveals', () => {
  // A 40 × 20 map of 5 ft squares (1 px = 1 ft), a 15 ft roof across the middle, Sam's character on the left.
  const view = normalizeMap({
    image: { width: 200, height: 100 },
    grid: { size: 5, x: 0, y: 0 },
    fog: { enabled: true, sight: true, memory: false, shapes: [{ op: 'reveal', x: 180, y: 0, w: 20, h: 100 }] },
    raised: [{ id: 'roof01', points: [[100, 0], [140, 0], [140, 100], [100, 100]], height: 15 }],
    tokens: [{ id: 'sam001', kind: 'pc', user_id: 7, x: 92.5, y: 52.5 }],
  });
  const at = maskFillAt;
  const shadows = heightShadows(view, 7, sightOf(view, 7));
  assert.equal(at(shadows, 102.5, 52.5), 'glimpse', 'the near edge of the roof: someone standing there is seen, the roof itself isn\'t');
  assert.equal(at(shadows, 137.5, 52.5), 'cover', 'the far side of the roof, out of sight from below');
  assert.equal(at(shadows, 152.5, 52.5), 'cover', 'behind the building');
  assert.equal(at(shadows, 50, 52.5), 'clear', 'open ground');
  assert.equal(at(shadows, 190, 52.5), 'clear', 'revealed by the DM');
  // In the whole fog the page draws, the same.
  const mask = playerFogMask(view, 7);
  assert.equal(at(mask, 152.5, 52.5), 'cover');
  // Up in the middle of the roof, Sam sees the whole roof and far off, but not the ground right at the foot of the building.
  const up = normalizeMap({ ...view, tokens: [{ id: 'sam001', kind: 'pc', user_id: 7, x: 122.5, y: 52.5 }] });
  const fromUp = heightShadows(up, 7, sightOf(up, 7));
  assert.equal(at(fromUp, 102.5, 52.5), 'clear');
  assert.equal(at(fromUp, 137.5, 52.5), 'clear');
  assert.equal(at(fromUp, 10, 52.5), 'clear', 'far off');
  assert.equal(at(fromUp, 50, 52.5), 'glimpse', 'nearer, the ground is behind the roof\'s edge but someone standing is seen');
  assert.equal(at(fromUp, 97.5, 52.5), 'cover', 'dead ground under the edge');
  // Two shades (owner, 2026-10-20): a tall creature is seen before a short one, so the fog is lighter where only someone standing would be.
  assert.equal(at(shadows, 60, 52.5), 'clear', 'the floor is seen');
  assert.deepEqual(shadows.map((s) => s.fill), ['cover', 'glimpse']);
  // No raised areas: nothing added.
  assert.deepEqual(heightShadows({ ...view, raised: [] }, 7, sightOf(view, 7)), []);
});

test('regression: a raised area\'s shadow is smooth, not whole squares (owner, 2026-10-20)', () => {
  // A 15 ft block on 20 px squares; Sam stands down and to the left of it.
  const view = normalizeMap({
    image: { width: 400, height: 300 },
    grid: { size: 20, x: 0, y: 0 },
    fog: { enabled: true, sight: true, memory: false, shapes: [] },
    raised: [{ id: 'block1', points: [[200, 60], [240, 60], [240, 100], [200, 100]], height: 15 }],
    tokens: [{ id: 'sam001', kind: 'pc', user_id: 7, x: 60, y: 200 }],
  });
  const shadows = heightShadows(view, 7, sightOf(view, 7));
  assert.ok(shadows.length && shadows.every((s) => s.rings), 'drawn as outlines');
  // The shadow's edge is the line from Sam's eyes past the block's corner (240, 100): at x = 320 it's at y = 55.6,
  // half way down a square. Either side of it, inside that one square, the fog differs.
  assert.equal(maskFillAt(shadows, 320, 54), 'cover');
  assert.equal(maskFillAt(shadows, 320, 57.5), 'clear');
  // And the other edge, past the corner (200, 60): at y = 20 it's at x = 240.
  assert.equal(maskFillAt(shadows, 241.5, 20), 'cover');
  assert.equal(maskFillAt(shadows, 238.5, 20), 'clear');
});
