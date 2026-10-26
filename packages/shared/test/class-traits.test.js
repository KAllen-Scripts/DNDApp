import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSheet, computeSheet } from '../src/sheet.js';
import { CLASS_TRAITS, traitRows } from '../src/class-traits.js';

const CLASSES = ['artificer', 'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];
const rows = (fields, edition = '2014') => {
  const s = normalizeSheet(fields);
  return traitRows(s, { edition, values: computeSheet(s, { edition }).values });
};

test('every class has text features listed in both editions', () => {
  for (const c of CLASSES) {
    for (const ed of ['2014', '2024']) {
      if (c === 'artificer' && ed === '2024') continue;
      assert.ok(CLASS_TRAITS.some((t) => t.class === c && (!t.edition || t.edition === ed)), `${c} ${ed}`);
    }
  }
});

test('a rogue gets Expertise, Thieves\' Cant, Cunning Action at their level; Evasion only from 7th', () => {
  const names = (lvl, ed) => rows({ classes: [{ name: 'Rogue', level: lvl }] }, ed).map((r) => r.name);
  assert.ok(names(1).includes("Thieves' Cant") && names(1).includes('Expertise'));
  assert.ok(names(2).includes('Cunning Action'));
  assert.ok(!names(6).includes('Evasion') && names(7).includes('Evasion'));
  assert.ok(names(1, '2024').includes("Thieves' Cant"));
  // Sneak Attack is a Class features row (it has uses and dice), so not here.
  assert.ok(!names(5).includes('Sneak Attack'));
});

test('race traits follow the race', () => {
  const names = rows({ race: 'Hill Dwarf' }).map((r) => r.name);
  assert.ok(names.includes('Darkvision') && names.includes('Dwarven Toughness'));
  assert.equal(rows({ race: 'Mountain Dwarf' }).some((r) => r.name === 'Dwarven Toughness'), false);
  assert.match(rows({ race: 'Dwarf' }, '2024').find((r) => r.name === 'Darkvision').text, /120/);
});

test('a feature the player wrote is marked written, and their text is untouched', () => {
  const fields = { classes: [{ name: 'Rogue', level: 1 }], features: "thieves’ cant: the secret signs." };
  const r = rows(fields).find((x) => x.name === "Thieves' Cant");
  assert.equal(r.written, true);
  assert.equal(normalizeSheet(fields).features, fields.features);
});

test("regression: Thieves' Cant is listed in Features & traits for a rogue (it was nowhere on the sheet)", () => {
  assert.ok(rows({ classes: [{ name: 'Rogue', level: 1 }] }).some((r) => r.name === "Thieves' Cant" && !r.written));
});

test('subclass text features are listed by subclass, level and edition, and not when they are Class features rows', async () => {
  const { SUBCLASS_TRAITS } = await import('../src/subclass-traits.js');
  const { SUBCLASS_BY_KEY } = await import('../src/subclass-features.js');
  for (const t of SUBCLASS_TRAITS) {
    assert.ok(SUBCLASS_BY_KEY[t.sc], `${t.sc} is a subclass`);
    assert.ok(!t.edition || SUBCLASS_BY_KEY[t.sc].editions.includes(t.edition), `${t.sc} ${t.name} is in ${t.edition}`);
  }
  const names = (cls, sub, lvl, ed) => rows({ classes: [{ name: cls, subclass: sub, level: lvl }] }, ed).map((r) => r.name);
  // A Champion: Remarkable Athlete at 7th in 2014, at 3rd in 2024; Improved Critical and Survivor are rows of the Class features box.
  assert.ok(!names('Fighter', 'Champion', 6).includes('Remarkable Athlete'));
  assert.ok(names('Fighter', 'Champion', 7).includes('Remarkable Athlete'));
  assert.ok(names('Fighter', 'Champion', 3, '2024').includes('Remarkable Athlete'));
  assert.ok(!names('Fighter', 'Champion', 20).includes('Improved Critical'));
  assert.ok(!names('Fighter', 'Champion', 20).includes('Survivor'));
  // A Thief's Second-Story Work, and nothing of another rogue's subclass.
  const thief = names('Rogue', 'Thief', 3);
  assert.ok(thief.includes('Second-Story Work') && !thief.includes('Mage Hand Legerdemain'));
  // 2014 clerics pick a domain at 1st; in 2024 every subclass starts at 3rd.
  assert.ok(names('Cleric', 'Trickery Domain', 1).includes('Blessing of the Trickster'));
  assert.ok(!names('Cleric', 'Trickery Domain', 2, '2024').includes('Blessing of the Trickster'));
  assert.ok(names('Cleric', 'Trickery Domain', 3, '2024').includes('Blessing of the Trickster'));
  // Frenzy is a row (both editions), so neither summary of it shows here.
  assert.ok(!names('Barbarian', 'Berserker', 3).some((n) => /^Frenzy/.test(n)));
  assert.ok(!names('Barbarian', 'Berserker', 3, '2024').some((n) => /^Frenzy/.test(n)));
  // A book subclass (Xanathar's).
  assert.ok(names('Rogue', 'Swashbuckler', 9).includes('Panache'));
  // No subclass typed: no subclass features.
  assert.ok(!names('Fighter', '', 20).includes('Remarkable Athlete'));
});

test('a subclass feature the player wrote is marked written', () => {
  const s = { classes: [{ name: 'Wizard', subclass: 'Evocation', level: 6 }], features: 'Potent Cantrip: half damage on a save.' };
  assert.equal(rows(s).find((r) => r.name === 'Potent Cantrip').written, true);
});
