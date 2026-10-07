/**
 * The light dice's maths (dice-lite.js): every die shape has the right faces,
 * and a die told to show a number ends with that face toward the viewer, its
 * number upright.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, quat, restingRotation, restingSpots, parseForced, faceLabel, symmetries, relabel, readDie } from '../public/dice-lite.js';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test('dice-lite: every die has one face per number, all facing outward', () => {
  for (const [shape, sides] of [['d4', 4], ['d6', 6], ['d8', 8], ['d10', 10], ['d12', 12], ['d20', 20]]) {
    const { faces } = SHAPES[shape];
    assert.equal(faces.length, sides, shape);
    assert.deepEqual(faces.map((f) => f.value).sort((a, b) => a - b), Array.from({ length: sides }, (_, i) => i + 1), shape);
    for (const f of faces) assert.ok(f.normal[0] * f.center[0] + f.normal[1] * f.center[1] + f.normal[2] * f.center[2] > 0, `${shape} face ${f.value} faces out`);
  }
});

test('dice-lite: opposite faces add up like real dice (d6, d8, d12, d20)', () => {
  for (const [shape, sides] of [['d6', 6], ['d8', 8], ['d12', 12], ['d20', 20]]) {
    for (const f of SHAPES[shape].faces) {
      const opp = SHAPES[shape].faces.find((g) => g.normal.every((v, k) => Math.abs(v + f.normal[k]) < 1e-6));
      assert.equal(f.value + opp.value, sides + 1, `${shape} ${f.value}`);
    }
  }
});

test('dice-lite: a die lands with the asked-for face toward the viewer and its number upright', () => {
  for (const shape of ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']) {
    for (const face of SHAPES[shape].faces) {
      const value = shape === 'd100' ? face.value * 10 : face.value;
      const q = restingRotation(shape, value);
      const n = quat.rotate(q, face.normal);
      const up = quat.rotate(q, face.up);
      close(n[2], 1, `${shape} ${value} faces the viewer`);
      close(up[1], 1, `${shape} ${value} reads upright`);
    }
  }
});

test('dice-lite: the forced notation from dice.js, and what the faces say', () => {
  assert.deepEqual(parseForced('1d20+2d6@14,3,5'), [{ shape: 'd20', value: 14 }, { shape: 'd6', value: 3 }, { shape: 'd6', value: 5 }]);
  assert.deepEqual(parseForced('1d100+1d10@40,10'), [{ shape: 'd100', value: 40 }, { shape: 'd10', value: 10 }]);
  assert.equal(faceLabel('d100', 100), '00');
  assert.equal(faceLabel('d100', 40), '40');
  assert.equal(faceLabel('d10', 10), '0');
  assert.equal(faceLabel('d20', 20), '20');
});

test('dice-lite: dice come to rest apart from each other', () => {
  for (const n of [1, 2, 5, 12, 30]) {
    const spots = restingSpots(n, 500, 400, 60);
    assert.equal(spots.length, n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) >= 50, `${n} dice: ${i} and ${j} overlap`);
  }
});

test('dice-lite: each die has its full set of turns that leave the shape in place', () => {
  const expected = { d4: 12, d6: 24, d8: 24, d10: 10, d12: 60, d20: 60, d100: 10 };
  for (const [shape, n] of Object.entries(expected)) assert.equal(symmetries(shape).length, n, shape);
});

test('dice-lite: relabelling a landed die makes it show any number asked for (the Deluxe dice land this way)', () => {
  for (const shape of ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']) {
    const max = shape === 'd100' ? 10 : Number(shape.slice(1));
    for (let k = 0; k < 10; k++) {
      const q = quat.axisAngle([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5], Math.random() * 7);
      for (let v = 1; v <= max; v++) {
        const value = shape === 'd100' ? v * 10 : v;
        assert.equal(readDie(shape, quat.mul(q, relabel(shape, q, value))), value, `${shape} ${value}`);
      }
    }
  }
});
