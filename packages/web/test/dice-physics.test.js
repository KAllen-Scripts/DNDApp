/**
 * The Deluxe dice's throw (dice-physics.js, real cannon-es physics): dice stay
 * on the table, come to rest in time, and with their numbers turned they show
 * exactly the server's numbers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './page.js'; // the module hooks: "/vendor/cannon-es.js" is the package the server serves
const { simulate, STEP } = await import('../public/dice-physics.js');
const { readDie, quat } = await import('../public/dice-lite.js');

test('dice-physics: thrown dice land on the asked-for numbers, on the table, within a few seconds', () => {
  const dice = [
    { shape: 'd20', value: 17 }, { shape: 'd6', value: 3 }, { shape: 'd6', value: 6 }, { shape: 'd8', value: 8 },
    { shape: 'd4', value: 2 }, { shape: 'd12', value: 11 }, { shape: 'd100', value: 40 }, { shape: 'd10', value: 10 },
  ];
  for (let k = 0; k < 8; k++) {
    const { frames, steps, fixes, hits } = simulate(dice, { halfW: 16, halfH: 9 });
    assert.equal(frames.length, steps);
    assert.ok(steps * STEP <= 4.5, `took ${steps * STEP}s`);
    assert.ok(hits.length > 0, 'the dice hit things (sounds)');
    const last = frames.at(-1);
    dice.forEach((d, i) => {
      const o = i * 7;
      assert.ok(Math.abs(last[o]) < 16 && Math.abs(last[o + 1]) < 9 && last[o + 2] > 0, `${d.shape} stayed on the table`);
      const q = [last[o + 6], last[o + 3], last[o + 4], last[o + 5]];
      assert.equal(readDie(d.shape, quat.mul(q, fixes[i])), d.value, `${d.shape} shows ${d.value}`);
    });
  }
});

test('dice-physics: thirty dice at once still settle', () => {
  const dice = Array.from({ length: 30 }, (_, i) => ({ shape: 'd6', value: (i % 6) + 1 }));
  const { steps } = simulate(dice, { halfW: 24, halfH: 14 });
  assert.ok(steps * STEP <= 4.5);
});
