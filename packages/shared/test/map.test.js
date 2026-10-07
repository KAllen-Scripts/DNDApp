import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMap, snapToken, measure, formatDistance, tokenPx, healthOf, isFogged, fogRect } from '../src/map.js';

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
  assert.deepEqual(m.tokens, [{ id: 'abc123', kind: 'pc', name: 'Player character', user_id: 4, color: '#2f6fb3', size: 1, x: 100, y: 0, hp: null, conditions: [], hidden: false, stats: null }]);
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
