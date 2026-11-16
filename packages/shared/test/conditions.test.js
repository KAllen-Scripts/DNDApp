import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSheet, emptySheet, normalizeSheet, rollDisadvantage, longRest } from '../src/sheet.js';
import { changeHp, conditionEffects, normalizeConditions } from '../src/conditions.js';

const sheetWith = (over) => normalizeSheet({ ...emptySheet(), ...over });
const FIGHTER = (over = {}) => sheetWith({ classes: [{ name: 'Fighter', subclass: '', level: 4 }], abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 }, ...over });

test('conditions: kept as known names; exhaustion 0 to 6; concentration a short name', () => {
  assert.deepEqual(normalizeConditions({ conditions: ['prone', 'prone', 'sleepy'], exhaustion: 9, concentration: 7 }), { conditions: ['prone'], exhaustion: 6, concentration: '' });
  const s = sheetWith({ conditions: ['poisoned'], exhaustion: 2, concentration: 'Bless' });
  assert.deepEqual([s.conditions, s.exhaustion, s.concentration], [['poisoned'], 2, 'Bless']);
  assert.deepEqual([emptySheet().conditions, emptySheet().exhaustion], [[], 0]);
});

test('conditions: what they do to the sheet\'s own rolls and speed (2014 and 2024)', () => {
  const poisoned = computeSheet(FIGHTER({ conditions: ['poisoned'] }));
  assert.equal(rollDisadvantage(poisoned, { ability: 'str', skill: 'athletics', kind: 'check' }), 'Poisoned');
  assert.equal(rollDisadvantage(poisoned, { ability: 'str', kind: 'attack' }), 'Poisoned');
  assert.equal(rollDisadvantage(poisoned, { ability: 'str', kind: 'save' }), '');
  assert.equal(rollDisadvantage(poisoned, { initiative: true }), 'Poisoned', 'initiative is a Dexterity check');

  const restrained = computeSheet(FIGHTER({ conditions: ['restrained'] }));
  assert.equal(restrained.values.speed, 0);
  assert.equal(rollDisadvantage(restrained, { ability: 'dex', kind: 'save' }), 'Restrained');
  assert.equal(rollDisadvantage(restrained, { ability: 'con', kind: 'save' }), '');

  const plain = computeSheet(FIGHTER());
  const tired = computeSheet(FIGHTER({ exhaustion: 4 }));
  assert.equal(tired.values.speed, plain.values.speed / 2);
  assert.equal(tired.values.hp_max, Math.floor(plain.values.hp_max / 2));
  assert.equal(rollDisadvantage(tired, { ability: 'con', kind: 'save' }), 'Exhaustion 4');

  const later = conditionEffects({ exhaustion: 3, conditions: ['incapacitated'] }, '2024');
  assert.equal(later.d20Penalty, -6);
  assert.deepEqual(later.speed, { minus: 15 });
  assert.equal(later.hpMaxHalved, false);
  assert.ok(later.disadvantage.some((d) => d.kinds.includes('initiative')));
  assert.deepEqual(conditionEffects({ conditions: ['stunned'] }).failSaves, { why: 'Stunned', abilities: ['str', 'dex'] });
});

test('conditions: a long rest takes off one level of exhaustion', () => {
  const s = FIGHTER({ exhaustion: 2 });
  assert.equal(longRest(s).sheet.exhaustion, 1);
});

test('hit points: damage takes temporary hit points first; heal stops at the maximum; temp keeps the bigger number', () => {
  const s = sheetWith({ hp: { current: 10, temp: 4 }, concentration: 'Bless' });
  let r = changeHp(s, 20, { kind: 'damage', amount: 7 });
  assert.deepEqual(r.sheet.hp, { current: 7, temp: null });
  assert.equal(r.concentrationDC, 10);
  r = changeHp(s, 20, { kind: 'damage', amount: 30 });
  assert.equal(r.sheet.hp.current, 0);
  assert.equal(r.down, true);
  assert.equal(r.concentrationDC, 15);
  r = changeHp(sheetWith({ hp: { current: 0, temp: null }, death_saves: { successes: 1, failures: 2 } }), 20, { kind: 'heal', amount: 50 });
  assert.equal(r.sheet.hp.current, 20);
  assert.deepEqual(r.sheet.death_saves, { successes: 0, failures: 0 });
  assert.equal(changeHp(s, 20, { kind: 'temp', amount: 3 }).sheet.hp.temp, 4);
  assert.equal(changeHp(s, 20, { kind: 'temp', amount: 6 }).sheet.hp.temp, 6);
  assert.equal(s.hp.current, 10, 'the sheet given is not changed');
});
