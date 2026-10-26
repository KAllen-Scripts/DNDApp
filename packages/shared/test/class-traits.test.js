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
