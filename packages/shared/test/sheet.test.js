import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySheet, normalizeSheet, computeSheet, formatBonus, classKey, hitDicePool, hitDice, spendHitDie, shortRest, longRest } from '../src/sheet.js';

const sheetWith = (over) => normalizeSheet({ ...emptySheet(), ...over });

test('blank sheet: level 1, +2 proficiency, plain 10s', () => {
  const { values, level } = computeSheet(emptySheet());
  assert.equal(level, 1);
  assert.equal(values.proficiency_bonus, 2);
  assert.equal(values['mod.str'], 0);
  assert.equal(values.passive_perception, 10);
  assert.equal(values.ac, 10);
  assert.equal(values.speed, 30);
  assert.equal(values.hp_max, null); // no class yet
  assert.equal(values.spell_dc, null);
});

test('a 5th-level wizard: modifiers, saves, skills, HP, spellcasting, slots', () => {
  const s = sheetWith({
    race: 'Hill Dwarf',
    classes: [{ name: 'Wizard', subclass: 'School of Evocation', level: 5 }],
    abilities: { str: 8, dex: 14, con: 15, int: 18, wis: 12, cha: 9 },
    skills: { arcana: 'proficient', history: 'expertise' },
  });
  const { values } = computeSheet(s);
  assert.equal(values.proficiency_bonus, 3);
  assert.equal(values['mod.int'], 4);
  assert.equal(values['mod.cha'], -1);
  assert.equal(values['save_prof.int'], true);
  assert.equal(values['save.int'], 7);
  assert.equal(values['save.str'], -1);
  assert.equal(values['skill.arcana'], 7);
  assert.equal(values['skill.history'], 10);
  assert.equal(values['skill.stealth'], 2);
  assert.equal(values.passive_perception, 11);
  assert.equal(values.speed, 25);
  // d6: 6 + 4 x 4, plus Con +2 and hill dwarf +1 per level
  assert.equal(values.hp_max, 6 + 4 * 4 + 5 * 3);
  assert.equal(values.hit_dice, '5d6');
  assert.equal(values.spell_ability, 'int');
  assert.equal(values.spell_dc, 15);
  assert.equal(values.spell_attack, 7);
  assert.deepEqual([1, 2, 3, 4].map((n) => values[`slots.${n}`]), [4, 3, 2, 0]);
});

test('half and third casters, multiclass slots (PHB example: ranger 4 / wizard 3), warlock pact magic', () => {
  const paladin = computeSheet(sheetWith({ classes: [{ name: 'Paladin', level: 5 }] })).values;
  assert.deepEqual([paladin['slots.1'], paladin['slots.2'], paladin['slots.3']], [4, 2, 0]);
  assert.equal(computeSheet(sheetWith({ classes: [{ name: 'Paladin', level: 1 }] })).values['slots.1'], 0);

  const ek = computeSheet(sheetWith({ classes: [{ name: 'Fighter', subclass: 'Eldritch Knight', level: 7 }] })).values;
  assert.deepEqual([ek['slots.1'], ek['slots.2']], [4, 2]);
  assert.equal(ek.spell_ability, 'int');
  assert.equal(computeSheet(sheetWith({ classes: [{ name: 'Fighter', subclass: 'Champion', level: 7 }] })).values.spell_ability, '');

  const multi = computeSheet(sheetWith({ classes: [{ name: 'Ranger', level: 4 }, { name: 'Wizard', level: 3 }] })).values;
  assert.deepEqual([multi['slots.1'], multi['slots.2'], multi['slots.3']], [4, 3, 2]);
  assert.equal(multi.spell_ability, 'wis'); // first casting class unless one is chosen
  assert.equal(multi['save_prof.str'], true); // saves from the first class only
  assert.equal(multi['save_prof.int'], false);
  assert.equal(multi.hit_dice, '4d10 + 3d6');
  const chosen = computeSheet(sheetWith({ classes: [{ name: 'Ranger', level: 4 }, { name: 'Wizard', level: 3 }], spellcasting: { class: 'Wizard' } }));
  assert.equal(chosen.values.spell_ability, 'int');

  const warlock = computeSheet(sheetWith({ classes: [{ name: 'Warlock', level: 5 }] })).values;
  assert.equal(warlock.pact_slots, 2);
  assert.equal(warlock.pact_level, 3);
  assert.equal(warlock['slots.1'], 0);
});

test('class features: bard Jack of All Trades, monk and barbarian AC, monk speed', () => {
  const bard = computeSheet(sheetWith({ classes: [{ name: 'Bard', level: 2 }], abilities: { dex: 14 } })).values;
  assert.equal(bard['skill.athletics'], 1); // half of +2
  assert.equal(bard.initiative, 3);
  const monk = computeSheet(sheetWith({ race: 'Wood Elf', classes: [{ name: 'Monk', level: 6 }], abilities: { dex: 16, wis: 14 } })).values;
  assert.equal(monk.ac, 15);
  assert.equal(monk.speed, 50);
  const barb = computeSheet(sheetWith({ classes: [{ name: 'barbarian', level: 1 }], abilities: { dex: 14, con: 16 } })).values;
  assert.equal(barb.ac, 15);
  assert.equal(barb.hp_max, 15);
});

test("the player's own values always win, and everything built on them follows", () => {
  const s = sheetWith({
    classes: [{ name: 'Rogue', level: 1 }],
    abilities: { wis: 14 },
    skills: { perception: 'proficient' },
    overrides: { 'skill.perception': 9, ac: 14, 'save_prof.wis': true, 'slots.1': 2, bogus: 1, hp_max: 'twelve' },
  });
  assert.deepEqual(Object.keys(s.overrides).sort(), ['ac', 'save_prof.wis', 'skill.perception', 'slots.1']);
  const { values, auto, overridden } = computeSheet(s);
  assert.equal(auto['skill.perception'], 4);
  assert.equal(values['skill.perception'], 9);
  assert.equal(values.passive_perception, 19);
  assert.equal(values.ac, 14);
  assert.equal(values['save.wis'], 4);
  assert.equal(values['slots.1'], 2);
  assert.ok(overridden.has('ac') && !overridden.has('initiative'));
});

test('normalizeSheet cleans input; helpers', () => {
  const s = normalizeSheet({
    name: 'x'.repeat(500),
    classes: [{ name: 'Cleric', level: 99 }],
    abilities: { str: '17', dex: 'abc' },
    skills: { stealth: 'expertise', flying: 'proficient', arcana: 'yes' },
    spells: [{ name: 'Bless', level: '1', prepared: true }, { name: '' }],
    coins: { gp: -5 },
    junk: true,
  });
  assert.equal(s.name.length, 100);
  assert.equal(s.classes[0].level, 20);
  assert.deepEqual([s.abilities.str, s.abilities.dex], [17, 10]);
  assert.deepEqual(s.skills, { stealth: 'expertise' });
  assert.equal(s.spells.length, 1);
  assert.equal(s.spells[0].level, 1);
  assert.ok(s.spells[0].id);
  assert.equal(s.coins.gp, 0);
  assert.equal('junk' in s, false);
  assert.equal(formatBonus(3), '+3');
  assert.equal(formatBonus(-1), '-1');
  assert.equal(classKey('wizard (evoker)'), 'wizard');
  assert.equal(classKey('Blood Hunter'), null);
});

test('spell slots for a single class: artificers round up, half casters start at 2nd level, third casters at 3rd', () => {
  const slots = (name, level) => {
    const { values } = computeSheet(sheetWith({ classes: [{ name, subclass: '', level }] }));
    return [1, 2, 3, 4, 5].map((n) => values[`slots.${n}`] ?? 0);
  };
  assert.deepEqual(slots('Artificer', 1), [2, 0, 0, 0, 0]);
  assert.deepEqual(slots('Artificer', 5), [4, 2, 0, 0, 0]);
  assert.deepEqual(slots('Paladin', 1), [0, 0, 0, 0, 0]);
  assert.deepEqual(slots('Paladin', 5), [4, 2, 0, 0, 0]);
  assert.deepEqual(slots('Ranger', 2), [2, 0, 0, 0, 0]);
  assert.deepEqual(slots('Barbarian', 20), [0, 0, 0, 0, 0]);
});

test('normalizeSheet: attacks keep what was typed (spaces too, as it\'s typed live), as text, at most 50; death saves stay 0 to 3', () => {
  const s = normalizeSheet({
    attacks: [{ name: '  Long   sword ', bonus: 5, damage: '1d8+3', notes: 'versatile', extra: true }, null, ...Array.from({ length: 60 }, () => ({}))],
    death_saves: { successes: 7, failures: -2 },
  });
  assert.deepEqual(s.attacks[0], { name: '  Long   sword ', bonus: '5', damage: '1d8+3', notes: 'versatile' });
  assert.deepEqual(s.attacks[1], { name: '', bonus: '', damage: '', notes: '' });
  assert.equal(s.attacks.length, 50);
  assert.deepEqual(s.death_saves, { successes: 3, failures: 0 });
});

test('hit dice: read from the Hit dice box (typed or automatic), kept per die size; old sheets count spent dice from the biggest down', () => {
  assert.deepEqual(hitDicePool('4d10 + 3d6'), { 10: 4, 6: 3 });
  assert.deepEqual(hitDicePool('2d8, 1 d8 and 3d7'), { 8: 3 });
  assert.deepEqual(hitDicePool(''), {});
  const multi = { classes: [{ name: 'Fighter', subclass: '', level: 4 }, { name: 'Wizard', subclass: '', level: 3 }] };
  // A sheet saved before hit dice were kept per size had one number.
  assert.deepEqual(normalizeSheet({ ...multi, hit_dice_used: 5 }).hit_dice_spent, { 10: 4, 6: 1 });
  assert.deepEqual(normalizeSheet({ ...multi, hit_dice_used: 5, hit_dice_spent: { 6: 1 } }).hit_dice_spent, { 6: 1 });
  assert.deepEqual(normalizeSheet({ hit_dice_spent: { 8: 2, 7: 1, 10: 0, 12: 'x' } }).hit_dice_spent, { 8: 2 });
  // A typed Hit dice box is what counts.
  const typed = sheetWith({ ...multi, overrides: { hit_dice: '7d8' }, hit_dice_spent: { 8: 9, 10: 1 } });
  assert.deepEqual(hitDice(typed), [{ die: 8, total: 7, spent: 7, left: 0 }]);
});

test('spending a hit die heals what was rolled (never less than nothing), up to the maximum; a blank Current means full', () => {
  // Wizard 3, Con 14: 6+2 + 2×(4+2) = 20 hit points, 3d6.
  const s = sheetWith({ classes: [{ name: 'Wizard', subclass: '', level: 3 }], abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }, hp: { current: 12, temp: null } });
  const a = spendHitDie(s, 6, 5);
  assert.equal(a.healed, 5);
  assert.equal(a.sheet.hp.current, 17);
  assert.deepEqual(a.sheet.hit_dice_spent, { 6: 1 });
  assert.equal(s.hp.current, 12, 'the sheet passed in is not changed');
  assert.equal(spendHitDie(a.sheet, 6, 6).sheet.hp.current, 20);
  assert.equal(spendHitDie(a.sheet, 6, -1).healed, 0);
  assert.equal(spendHitDie(sheetWith({ ...s, hp: { current: null } }), 6, 4).sheet.hp.current, 20);
  assert.throws(() => spendHitDie(s, 8, 4), /no d8/);
  assert.throws(() => spendHitDie(sheetWith({ ...s, hit_dice_spent: { 6: 3 } }), 6, 4), /no d6 hit dice left/);
});

test('rests: a short rest gives back Pact Magic; a long rest gives back everything, with half the hit dice (2014) or all (2024)', () => {
  const s = sheetWith({
    classes: [{ name: 'Warlock', subclass: '', level: 5 }, { name: 'Cleric', subclass: '', level: 2 }],
    hp: { current: 3, temp: 5 },
    hit_dice_spent: { 8: 6 },
    death_saves: { successes: 2, failures: 1 },
    spellcasting: { class: 'Cleric', slots_used: { 1: 2 }, pact_used: 2 },
  });
  const short = shortRest(s);
  assert.equal(short.spellcasting.pact_used, 0);
  assert.deepEqual(short.spellcasting.slots_used, { 1: 2 });
  assert.equal(short.hp.current, 3);

  const max = computeSheet(s).values.hp_max;
  const long = longRest(s);
  assert.equal(long.rested, true);
  assert.equal(long.sheet.hp.current, max);
  assert.equal(long.sheet.hp.temp, null);
  assert.deepEqual(long.sheet.death_saves, { successes: 0, failures: 0 });
  assert.deepEqual(long.sheet.spellcasting.slots_used, {});
  assert.equal(long.sheet.spellcasting.pact_used, 0);
  // 7 hit dice: 3 come back.
  assert.deepEqual(long.sheet.hit_dice_spent, { 8: 3 });
  assert.deepEqual(long.regained, { hp: max - 3, hit_dice: 3 });
  assert.deepEqual(longRest(s, { edition: '2024' }).sheet.hit_dice_spent, {});
  // At least one comes back, even at 1st level.
  assert.deepEqual(longRest(sheetWith({ classes: [{ name: 'Rogue', subclass: '', level: 1 }], hit_dice_spent: { 8: 1 } })).sheet.hit_dice_spent, {});
  // 2014: at 0 hit points a long rest does nothing; 2024 doesn't have that rule.
  const down = sheetWith({ ...s, hp: { current: 0, temp: null } });
  assert.equal(longRest(down).rested, false);
  assert.equal(longRest(down).sheet, down);
  assert.equal(longRest(down, { edition: '2024' }).sheet.hp.current, max);
});
