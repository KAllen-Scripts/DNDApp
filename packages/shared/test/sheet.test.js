import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySheet, normalizeSheet, computeSheet, formatBonus, classKey } from '../src/sheet.js';

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
