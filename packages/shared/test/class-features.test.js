import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSheet, longRest, normalizeSheet, shortRest } from '../src/sheet.js';
import {
  arcaneRecovery, featureRow, featureRows, healFeature, newCustomFeature, normalizeClassFeatures, pointsToSlot, regainPactSlots,
  setSpent, slotToPoints, sorcerousRestoration, spendFeature,
} from '../src/class-features.js';

const ABILITIES = { str: 16, dex: 14, con: 14, int: 16, wis: 14, cha: 16 }; // +3 Str, Int and Cha; +2 Dex, Con and Wis
const sheetOf = (classes, extra = {}) => normalizeSheet({ abilities: ABILITIES, ...extra, classes: classes.map(([name, level, subclass = '']) => ({ name, level, subclass })) });
const opts = (s, edition = '2014') => ({ edition, values: computeSheet(s).values });
const rows = (s, edition = '2014') => featureRows(s, opts(s, edition));
const row = (s, id, edition = '2014') => featureRow(s, id, opts(s, edition));
const ids = (s, edition) => rows(s, edition).map((r) => r.id);

test('class features: each class gets its rows from the level they start at, by edition', () => {
  assert.deepEqual(ids(sheetOf([['Barbarian', 1]])), ['rage']);
  assert.deepEqual(ids(sheetOf([['Fighter', 1]])), ['second_wind']);
  assert.deepEqual(ids(sheetOf([['Fighter', 9]])), ['second_wind', 'action_surge', 'indomitable']);
  assert.deepEqual(ids(sheetOf([['Paladin', 6]])), ['divine_sense', 'lay_on_hands', 'channel_divinity_paladin', 'aura_of_protection']);
  assert.deepEqual(ids(sheetOf([['Paladin', 6]]), '2024'), ['lay_on_hands', 'paladins_smite', 'channel_divinity_paladin', 'faithful_steed', 'aura_of_protection']);
  assert.deepEqual(ids(sheetOf([['Ranger', 5]])), [], '2014 rangers have nothing to count');
  assert.deepEqual(ids(sheetOf([['Ranger', 5]]), '2024'), ['favored_enemy']);
  assert.deepEqual(ids(sheetOf([['Warlock', 13]])), ['mystic_arcanum_6', 'mystic_arcanum_7']);
  assert.deepEqual(ids(sheetOf([['Commoner', 3]])), [], 'a class the rules don\'t know has none');
});

test('class features: maximums from the class\'s own level and ability scores; 2024 numbers differ', () => {
  const s = sheetOf([['Fighter', 5], ['Barbarian', 3]]);
  assert.deepEqual(rows(s).map((r) => [r.id, r.level, r.max, r.recharge]), [
    ['rage', 3, 3, 'long'],
    ['second_wind', 5, 1, 'short'],
    ['action_surge', 5, 1, 'short'],
  ]);
  assert.deepEqual([row(s, 'rage', '2024').recharge, row(s, 'second_wind', '2024').max], ['short_one', 3]);
  assert.match(row(s, 'rage').note, /\+2 damage/);
  assert.equal(row(sheetOf([['Barbarian', 20]]), 'rage').max, null, 'unlimited rages at 20 (2014)');
  assert.equal(row(sheetOf([['Barbarian', 20]]), 'rage', '2024').max, 6);
  // Cha +3: three Bardic Inspirations, back on a long rest until Font of Inspiration (level 5).
  assert.deepEqual([row(sheetOf([['Bard', 4]]), 'bardic_inspiration').max, row(sheetOf([['Bard', 4]]), 'bardic_inspiration').recharge], [3, 'long']);
  assert.equal(row(sheetOf([['Bard', 5]]), 'bardic_inspiration').recharge, 'short');
  assert.match(row(sheetOf([['Bard', 10]]), 'bardic_inspiration').note, /A d10/);
  assert.equal(row(sheetOf([['Paladin', 4]]), 'lay_on_hands').max, 20);
  assert.equal(row(sheetOf([['Paladin', 4]]), 'divine_sense').max, 4);
  assert.deepEqual([row(sheetOf([['Monk', 6]]), 'ki').name, row(sheetOf([['Monk', 6]]), 'ki', '2024').name, row(sheetOf([['Monk', 6]]), 'ki').max], ['Ki Points', 'Focus Points', 6]);
  assert.match(row(sheetOf([['Monk', 6]]), 'ki').note, /Save DC 13/); // 8 + 3 + Wis 2
  assert.match(row(sheetOf([['Rogue', 7]]), 'sneak_attack').note, /^4d6/);
  assert.deepEqual([row(sheetOf([['Cleric', 6]]), 'channel_divinity_cleric').max, row(sheetOf([['Cleric', 6]]), 'channel_divinity_cleric', '2024').max], [2, 3]);
});

test('class features: rests give back what each says (short, long, one on a short rest)', () => {
  let s = sheetOf([['Fighter', 5], ['Barbarian', 3]]);
  for (const id of ['rage', 'second_wind', 'action_surge']) s = spendFeature(s, id, 1);
  s = spendFeature(s, 'rage', 1);
  assert.throws(() => spendFeature(s, 'second_wind', 1), /no Second Wind left\. A short or long rest gives them back/);
  const short = shortRest(s);
  assert.deepEqual(short.class_features.spent, { rage: 2 }, 'rage waits for a long rest (2014)');
  assert.deepEqual(longRest(short).sheet.class_features.spent, {});
  // 2024: one Rage and one Second Wind back on a short rest.
  let n = sheetOf([['Fighter', 5], ['Barbarian', 3]]);
  n = setSpent(setSpent(n, 'rage', 3), 'second_wind', 2);
  assert.deepEqual(shortRest(n, { edition: '2024' }).class_features.spent, { rage: 2, second_wind: 1 });
  // A row reset by hand (2014 Divine Intervention) keeps its number through rests.
  const cleric = setSpent(sheetOf([['Cleric', 10]]), 'divine_intervention', 1);
  assert.equal(longRest(cleric).sheet.class_features.spent.divine_intervention, 1);
});

test('class features: a typed maximum wins; the player\'s own rows are saved and rest like the others', () => {
  let s = sheetOf([['Barbarian', 3]]);
  s.class_features.max.rage = 5;
  s.class_features.custom.push(newCustomFeature({ name: 'Lucky', max: 3, recharge: 'long' }), newCustomFeature({ name: 'Breath Weapon', max: 1, recharge: 'short', note: '2d6 fire' }));
  s = normalizeSheet(JSON.parse(JSON.stringify(s)));
  assert.deepEqual([row(s, 'rage').max, row(s, 'rage').auto, row(s, 'rage').own], [5, 3, true]);
  const [lucky, breath] = s.class_features.custom;
  assert.deepEqual(rows(s).filter((r) => r.custom).map((r) => [r.name, r.max, r.recharge]), [['Lucky', 3, 'long'], ['Breath Weapon', 1, 'short']]);
  s = spendFeature(spendFeature(s, lucky.id, 2), breath.id, 1);
  assert.deepEqual(shortRest(s).class_features.spent, { [lucky.id]: 2 });
  assert.deepEqual(longRest(s).sheet.class_features.spent, {});
  // Junk is dropped: unknown ids, nameless rows, odd numbers.
  assert.deepEqual(normalizeClassFeatures({ spent: { nope: 2, rage: 'x', ki: 3 }, max: { nope: 1, ki: -4 }, custom: [{ name: '' }, { name: 'X', recharge: 'weekly', kind: 'odd', max: 'lots' }] }).spent, { ki: 3 });
  const odd = normalizeClassFeatures({ custom: [{ name: 'X', recharge: 'weekly', kind: 'odd', max: 'lots' }] }).custom[0];
  assert.deepEqual([odd.recharge, odd.kind, odd.max], ['long', 'uses', 1]);
});

test('class features: Wild Shape is a row (its uses spent carry over from sheets saved before)', () => {
  const s = normalizeSheet({ abilities: ABILITIES, classes: [{ name: 'Druid', level: 2 }], wild_shape: { forms: [], uses_spent: 1 } });
  assert.equal(s.class_features.spent.wild_shape, 1);
  assert.deepEqual([row(s, 'wild_shape').max, row(s, 'wild_shape').left, row(s, 'wild_shape').recharge], [2, 1, 'short']);
  assert.equal(row(s, 'wild_shape', '2024').recharge, 'short_one');
});

test('class features: Second Wind heals with the rolled total up to the maximum; Uncanny Metabolism refills Focus Points', () => {
  let s = sheetOf([['Fighter', 3]], { hp: { current: 10, temp: null } });
  const hpMax = computeSheet(s).values.hp_max; // 10+2 + 2×(6+2) = 28
  const res = healFeature(s, 'second_wind', 30, opts(s));
  assert.deepEqual([res.healed, res.sheet.hp.current, res.sheet.class_features.spent.second_wind], [hpMax - 10, hpMax, 1]);
  assert.equal(row(s, 'second_wind').heal, '1d10+3');
  assert.throws(() => healFeature(res.sheet, 'second_wind', 5, opts(s)), /no Second Wind left/);
  s = setSpent(sheetOf([['Monk', 4]], { hp: { current: 5, temp: null } }), 'ki', 4);
  const monk = healFeature(s, 'uncanny_metabolism', 7, opts(s, '2024'));
  assert.deepEqual([monk.sheet.class_features.spent, monk.sheet.hp.current], [{ uncanny_metabolism: 1 }, 12]);
});

test('class features: Flexible Casting, Sorcerous Restoration, Arcane Recovery and getting pact slots back change the slots', () => {
  let s = sheetOf([['Sorcerer', 5]]); // slots 4/3/2
  s = setSpent(s, 'sorcery_points', 4);
  s = slotToPoints(s, 2, opts(s));
  assert.deepEqual([s.class_features.spent.sorcery_points, s.spellcasting.slots_used[2]], [2, 1]);
  assert.throws(() => slotToPoints(s, 3, opts(s)), /over 5 sorcery points/);
  s = pointsToSlot(s, 2, opts(s));
  assert.deepEqual([s.class_features.spent.sorcery_points, s.spellcasting.slots_used[2]], [5, undefined]);
  assert.throws(() => pointsToSlot(s, 1, opts(s)), /None of your 1st-level slots are spent/);
  s = sorcerousRestoration(s, opts(s, '2024'));
  assert.deepEqual(s.class_features.spent, { sorcery_points: 3, sorcerous_restoration: 1 });

  let w = sheetOf([['Wizard', 6]], { spellcasting: { class: 'Wizard', slots_used: { 1: 2, 2: 1, 3: 1 }, pact_used: 0 } });
  assert.throws(() => arcaneRecovery(w, { 3: 1, 1: 1 }, opts(w)), /add up to 4 levels; Arcane Recovery gives back 3/);
  assert.throws(() => arcaneRecovery(w, { 2: 2 }, opts(w)), /only 1 2nd-level slot spent/);
  w = arcaneRecovery(w, { 2: 1, 1: 1 }, opts(w));
  assert.deepEqual(w.spellcasting.slots_used, { 1: 1, 3: 1 });
  assert.throws(() => arcaneRecovery(w, { 1: 1 }, opts(w)), /no Arcane Recovery left/);

  const lock = sheetOf([['Warlock', 5]], { spellcasting: { class: 'Warlock', slots_used: {}, pact_used: 2 } });
  assert.equal(regainPactSlots(lock, 'magical_cunning', opts(lock, '2024')).spellcasting.pact_used, 1, 'half of 2, rounded up');
});
