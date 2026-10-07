import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoll, findRoll, rollDice, d20Plus, MAX_DICE } from '../src/dice.js';

/** A random() that hands out the given numbers in order. */
const fixed = (...values) => () => values.shift();

test('reads dice notation and tidies it', () => {
  assert.deepEqual(parseRoll('1d20+5').terms, [{ sign: 1, count: 1, sides: 20 }, { sign: 1, value: 5 }]);
  assert.equal(parseRoll(' 2d6 + 1d4 - 1 ').notation, '2d6+1d4-1');
  assert.equal(parseRoll('d20').notation, '1d20');
  assert.equal(parseRoll('d%').notation, '1d100');
  assert.equal(parseRoll('-1d4+3').notation, '-1d4+3');
});

test('refuses notation it cannot roll, with a message', () => {
  for (const bad of ['', 'banana', '1d7', '0d6', '5', '1d20 5', `${MAX_DICE + 1}d6`, '1d20+5000', 'x'.repeat(101)]) {
    assert.throws(() => parseRoll(bad), Error, bad);
  }
});

test('finds the dice at the start of an attack\'s damage', () => {
  assert.equal(findRoll('1d8+2 piercing'), '1d8+2');
  assert.equal(findRoll('2d6 + 3 fire'), '2d6+3');
  assert.equal(findRoll('1d6-1 bludgeoning'), '1d6-1');
  assert.equal(findRoll('fire, 2d6'), null);
  assert.equal(findRoll('5 slashing'), null); // no dice
  assert.equal(findRoll(''), null);
});

test('d20Plus writes a check', () => {
  assert.equal(d20Plus(5), '1d20+5');
  assert.equal(d20Plus(-1), '1d20-1');
  assert.equal(d20Plus(0), '1d20');
});

test('totals the dice and the numbers', () => {
  const r = rollDice(parseRoll('2d6+1d4-1'), { random: fixed(3, 5, 2) });
  assert.equal(r.total, 3 + 5 + 2 - 1);
  assert.deepEqual(r.terms[0].dice, [{ value: 3, kept: true }, { value: 5, kept: true }]);
  assert.equal(r.natural, null);
  assert.equal(r.mode, 'normal');
});

test('advantage and disadvantage roll the d20 twice and keep one', () => {
  const adv = rollDice(parseRoll('1d20+3'), { mode: 'advantage', random: fixed(4, 17) });
  assert.deepEqual(adv.terms[0].dice, [{ value: 4, kept: false }, { value: 17, kept: true }]);
  assert.equal(adv.total, 20);
  assert.equal(adv.natural, 17);
  const dis = rollDice(parseRoll('1d20+3'), { mode: 'disadvantage', random: fixed(4, 17) });
  assert.equal(dis.total, 7);
  assert.equal(dis.natural, 4);
  assert.equal(dis.mode, 'disadvantage');
  // Only a single d20 can have advantage.
  const many = rollDice(parseRoll('2d20'), { mode: 'advantage', random: fixed(1, 2) });
  assert.equal(many.mode, 'normal');
  assert.equal(many.terms[0].dice.length, 2);
  assert.equal(many.natural, null);
});

test('a natural 20 is reported', () => {
  assert.equal(rollDice(parseRoll('1d20-2'), { random: fixed(20) }).natural, 20);
});
