/**
 * Bridges (owner, 2026-10-18: "platforms that you can walk under"): a
 * raised area marked `bridge` is a deck with open space under it. A token
 * in it is on it or under it, sight passes under it but not through it,
 * and walking in from the ground goes under it, by stairs or from the same
 * height onto it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMap, tokenSeesOver, groundAt, bridgeAt, tokenGround, isUnder, walkLevels, pathCost, heightShadows, sightOf } from '../src/map.js';

// 1 px = 1 ft. A river runs down the middle; a bridge 15 ft up crosses it at x 80..120.
const BRIDGE = { id: 'brdg01', points: [[80, 40], [120, 40], [120, 60], [80, 60]], height: 15, bridge: true };
const tok = (id, x, extra = {}) => ({ id, kind: 'npc', x, y: 50, ...extra });
const mapOf = (raised, tokens = [], climbs = []) => normalizeMap({ image: { width: 200, height: 100 }, raised, tokens, climbs });
const sees = (raised, a, b) => {
  const m = mapOf(raised, [a, b]);
  return [tokenSeesOver(m, m.tokens[0], m.tokens[1]), tokenSeesOver(m, m.tokens[1], m.tokens[0])];
};

test('bridges: kept as bridges; the ground on one or under one', () => {
  const m = mapOf([BRIDGE, { id: 'roof01', points: [[0, 0], [10, 0], [10, 10]], height: 10, bridge: 'yes' }], [tok('aaaaaa', 100), tok('bbbbbb', 100, { under: true }), tok('cccccc', 150, { under: true })]);
  assert.equal(m.raised[0].bridge, true);
  assert.equal(m.raised[1].bridge, undefined, 'only true makes a bridge');
  assert.equal(groundAt(m, 100, 50), 15);
  assert.equal(groundAt(m, 100, 50, true), 0);
  assert.equal(bridgeAt(m, 100, 50).id, 'brdg01');
  assert.equal(bridgeAt(m, 150, 50), null);
  assert.deepEqual(m.tokens.map((t) => tokenGround(m, t)), [15, 0, 0]);
  assert.deepEqual(m.tokens.map((t) => isUnder(m, t)), [false, true, false], 'not under anything out on the bank');
});

test('bridges: sight passes under the deck, not through it', () => {
  // Under the bridge and out on the bank, both on the ground: they see each other under the deck.
  assert.deepEqual(sees([BRIDGE], tok('aaaaaa', 100, { under: true }), tok('bbbbbb', 150)), [true, true]);
  // On the bridge and right under it: the deck is between them.
  assert.deepEqual(sees([BRIDGE], tok('aaaaaa', 100), tok('bbbbbb', 100, { under: true })), [false, false]);
  assert.deepEqual(sees([BRIDGE], tok('aaaaaa', 100), tok('bbbbbb', 105, { under: true })), [false, false]);
  // On the bridge, someone close to it on the bank is hidden by the deck's edge; further out they're seen.
  assert.deepEqual(sees([BRIDGE], tok('aaaaaa', 100), tok('bbbbbb', 150)), [false, false]);
  assert.deepEqual(sees([BRIDGE], tok('aaaaaa', 100), tok('bbbbbb', 190)), [true, true]);
  // Two on the bridge see each other; so do two under it.
  assert.deepEqual(sees([BRIDGE], tok('aaaaaa', 85), tok('bbbbbb', 115)), [true, true]);
  assert.deepEqual(sees([BRIDGE], tok('aaaaaa', 85, { under: true }), tok('bbbbbb', 115, { under: true })), [true, true]);
  // The same platform as a plain raised area would hide the one beyond it from the one on the ground.
  assert.deepEqual(sees([{ ...BRIDGE, bridge: false }], tok('aaaaaa', 60), tok('bbbbbb', 150)), [false, false]);
  assert.deepEqual(sees([BRIDGE], tok('aaaaaa', 60), tok('bbbbbb', 150)), [true, true]);
});

test('bridges: walking in from the ground goes under; by stairs or from the same height, onto it', () => {
  const m = mapOf([BRIDGE]);
  // From the bank to the middle: under it, nothing climbed; and out again.
  assert.deepEqual(walkLevels(m, [{ x: 150, y: 50 }, { x: 100, y: 50 }]), { under: true, climb: 0 });
  assert.deepEqual(walkLevels(m, [{ x: 100, y: 50 }, { x: 150, y: 50 }], { under: true }), { under: false, climb: 0 });
  // Under it, it stays under while it walks about beneath.
  assert.deepEqual(walkLevels(m, [{ x: 100, y: 50 }, { x: 85, y: 45 }], { under: true }), { under: true, climb: 0 });
  // Up the stairs at its end: on it.
  const stairs = mapOf([BRIDGE], [], [{ id: 'stair1', kind: 'stairs', x1: 130, y1: 50, x2: 121, y2: 50 }]);
  assert.deepEqual(walkLevels(stairs, [{ x: 150, y: 50 }, { x: 100, y: 50 }]), { under: false, climb: 0 }, 'stairs cost nothing more');
  // From a cliff top as high as the deck: straight on, nothing climbed.
  const cliff = mapOf([BRIDGE, { id: 'cliff1', points: [[120, 0], [200, 0], [200, 100], [120, 100]], height: 15 }]);
  assert.deepEqual(walkLevels(cliff, [{ x: 150, y: 50 }, { x: 100, y: 50 }]), { under: false, climb: 0 });
  // On it, it stays on until it steps off (here down 15 ft to the bank).
  assert.deepEqual(walkLevels(m, [{ x: 100, y: 50 }, { x: 150, y: 50 }]), { under: false, climb: 15 });
  // The cost says so too (stairs cost nothing more).
  const scaled = normalizeMap({ ...stairs, grid: { size: 5, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } });
  assert.equal(pathCost(scaled, [{ x: 150, y: 50 }, { x: 100, y: 50 }]).under, false);
  assert.equal(pathCost({ ...scaled, climbs: [] }, [{ x: 150, y: 50 }, { x: 100, y: 50 }]).under, true);
});

test('bridges: the fog lets players see under a bridge from the bank', () => {
  const view = normalizeMap({ image: { width: 200, height: 100 }, fog: { enabled: true, sight: true }, raised: [BRIDGE], tokens: [{ ...tok('aaaaaa', 160), kind: 'pc', user_id: 7 }] });
  const hidden = (x, y) => heightShadows(view, 7, sightOf(view, 7)).some((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
  assert.equal(hidden(100, 50), false, 'under the bridge, seen from the bank');
  // As a plain raised area, the far side of it is out of sight.
  const solid = { ...view, raised: [{ ...BRIDGE, bridge: false, points: [[80, 0], [120, 0], [120, 100], [80, 100]] }] };
  assert.equal(heightShadows(solid, 7, sightOf(solid, 7)).some((s) => 50 >= s.x && 50 <= s.x + s.w), true);
});
