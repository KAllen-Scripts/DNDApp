import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSheet, longRest, normalizeSheet, shortRest } from '../src/sheet.js';
import { arcaneRecovery, featureRow, featureRows, healWithSlot, setRolled, setSpent, useRolled } from '../src/class-features.js';
import { SUBCLASSES, subclassNames, subclassOf } from '../src/subclass-features.js';

const ABILITIES = { str: 16, dex: 14, con: 14, int: 16, wis: 16, cha: 16 }; // +3 Str, Int, Wis, Cha; +2 Dex, Con
const CLASS_NAMES = { barbarian: 'Barbarian', bard: 'Bard', cleric: 'Cleric', druid: 'Druid', fighter: 'Fighter', monk: 'Monk', paladin: 'Paladin', ranger: 'Ranger', rogue: 'Rogue', sorcerer: 'Sorcerer', warlock: 'Warlock', wizard: 'Wizard' };
const sheetOf = (classes, extra = {}) => normalizeSheet({ abilities: ABILITIES, ...extra, classes: classes.map(([name, level, subclass = '']) => ({ name, level, subclass })) });
const opts = (s, edition = '2014') => ({ edition, values: computeSheet(s).values });
const subRows = (s, edition = '2014') => featureRows(s, opts(s, edition)).filter((r) => r.subclass);
const row = (s, id, edition = '2014') => featureRow(s, id, opts(s, edition));

test('subclass features: matched on what the player typed, by class and edition', () => {
  assert.equal(subclassOf('fighter', 'battlemaster')?.key, 'battle_master');
  assert.equal(subclassOf('fighter', 'Battle Master Fighter')?.key, 'battle_master');
  assert.equal(subclassOf('wizard', 'School of Divination')?.key, 'divination');
  assert.equal(subclassOf('cleric', 'War Domain')?.key, 'war');
  assert.equal(subclassOf('cleric', 'Swords')?.key, undefined, 'a subclass from another book');
  assert.equal(subclassOf('rogue', 'Moon'), null, 'only the class\'s own subclasses');
  assert.deepEqual(subRows(sheetOf([['Fighter', 7, 'Battle Master']])).map((r) => [r.id, r.subclass, r.max]), [['superiority_dice', 'Battle Master', 5]]);
  assert.deepEqual(subRows(sheetOf([['Fighter', 7, 'Battle Master']]), '2024').map((r) => r.id), ['superiority_dice', 'know_your_enemy']);
  assert.deepEqual(subRows(sheetOf([['Fighter', 2, 'Battle Master']])), [], 'not before 3rd level');
  assert.deepEqual(subRows(sheetOf([['Barbarian', 5, 'Zealot']])), [], 'the 2014 Zealot is in Xanathar\'s, not the Player\'s Handbook');
  assert.ok(subRows(sheetOf([['Barbarian', 5, 'Zealot']]), '2024').some((r) => r.id === 'warrior_of_the_gods'));
  // Subclass levels: 1st for 2014 clerics, 3rd for every 2024 class.
  assert.deepEqual(subRows(sheetOf([['Cleric', 1, 'Light']])).map((r) => [r.id, r.max, r.recharge]), [['warding_flare', 3, 'long']]);
  assert.deepEqual(subRows(sheetOf([['Cleric', 1, 'Light']]), '2024'), []);
  assert.equal(row(sheetOf([['Cleric', 6, 'Light']]), 'warding_flare', '2024').recharge, 'short');
  // Multiclass: each class matches its own subclass.
  const multi = sheetOf([['Fighter', 3, 'Champion'], ['Wizard', 2, 'Evocation']]);
  assert.deepEqual(subRows(multi).map((r) => r.id), ['improved_critical', 'sculpt_spells']);
});

test('subclass features: every Player\'s Handbook subclass has rows at 20th level, with no gaps in their text', () => {
  for (const edition of ['2014', '2024']) {
    for (const sc of SUBCLASSES.filter((s) => s.editions.includes(edition))) {
      const rows = subRows(sheetOf([[CLASS_NAMES[sc.class], 20, sc.name]]), edition);
      assert.ok(rows.length, `${sc.name} (${edition}) has rows`);
      for (const r of rows) assert.doesNotMatch(`${r.name} ${r.note} ${r.max}`, /undefined|NaN|\[object/, `${r.id} (${edition})`);
    }
  }
  assert.equal(subclassNames('druid', '2024')[0], 'Circle of the Land');
  assert.ok(subclassNames('druid', '2014').indexOf('Circle of the Sea') > subclassNames('druid', '2014').indexOf('Circle of the Moon'), 'the edition\'s own first');
});

test('subclass features: numbers from the level and scores; rests give them back', () => {
  const bm = sheetOf([['Fighter', 10, 'Battle Master']]);
  assert.match(row(bm, 'superiority_dice').note, /^d10s for your manoeuvres; save DC 15/); // 8 + 4 + Str 3
  let s = setSpent(bm, 'superiority_dice', 5);
  assert.equal(shortRest(s).class_features.spent.superiority_dice, undefined, 'back on a short rest');
  assert.equal(row(sheetOf([['Wizard', 6, 'Abjuration']]), 'arcane_ward').max, 15); // 2 × 6 + 3
  assert.match(row(sheetOf([['Cleric', 5, 'Life']]), 'preserve_life').note, /restore 25 hit points/);
  assert.equal(row(sheetOf([['Monk', 6, 'Open Hand']]), 'wholeness_of_body').heal, '18');
  assert.equal(row(sheetOf([['Monk', 6, 'Open Hand']]), 'wholeness_of_body', '2024').heal, '1d8+3');
  // A typed-over maximum wins, like any class feature.
  s = sheetOf([['Fighter', 3, 'Battle Master']]);
  s.class_features.max.superiority_dice = 6;
  assert.equal(row(normalizeSheet(s), 'superiority_dice').max, 6);
});

test('subclass features: Natural Recovery gives back slots like Arcane Recovery', () => {
  let s = sheetOf([['Druid', 4, 'Circle of the Land']], { spellcasting: { slots_used: { 1: 2, 2: 1 } } });
  assert.throws(() => arcaneRecovery(s, { 2: 1, 1: 1 }, { ...opts(s), id: 'natural_recovery' }), /add up to 3 levels; Natural Recovery gives back 2/);
  s = arcaneRecovery(s, { 2: 1 }, { ...opts(s), id: 'natural_recovery' });
  assert.deepEqual([s.spellcasting.slots_used, s.class_features.spent.natural_recovery], [{ 1: 2 }, 1]);
  assert.equal(row(sheetOf([['Druid', 4, 'Land']]), 'natural_recovery', '2024'), null, '2024: from 6th level');
});

test('subclass features: Combat Wild Shape spends a slot and heals the form; Portent keeps its dice until used or a long rest', () => {
  const form = { id: 'wolf', name: 'Wolf', cr: '1/4', ac: 13, hp_max: 11 };
  const moon = sheetOf([['Druid', 4, 'Moon']], { hp: { current: 20 }, wild_shape: { forms: [form], active: { form: 'wolf', hp: 3, uses: 1 } } });
  let { sheet, healed } = healWithSlot(moon, 'combat_wild_shape', 2, 12, opts(moon));
  assert.deepEqual([sheet.wild_shape.active.hp, healed, sheet.hp.current, sheet.spellcasting.slots_used[2]], [11, 8, 20, 1]);
  assert.throws(() => healWithSlot(moon, 'combat_wild_shape', 3, 5, opts(moon)), /no 3rd-level spell slots left/);
  assert.equal(row(moon, 'combat_wild_shape', '2024'), null, '2024 Moon druids heal differently');

  let s = setRolled(sheetOf([['Wizard', 14, 'Divination']]), 'portent', [17, 2, 9, 4]);
  assert.deepEqual(row(s, 'portent').rolled, [17, 2, 9], 'three at 14th level, no more');
  assert.equal(row(s, 'portent').dice, 3);
  s = useRolled(s, 'portent', 1);
  assert.deepEqual(normalizeSheet(JSON.parse(JSON.stringify(s))).class_features.rolled.portent, [17, 9]);
  assert.deepEqual(shortRest(s).class_features.rolled.portent, [17, 9]);
  assert.deepEqual(longRest(s).sheet.class_features.rolled, {});
});
