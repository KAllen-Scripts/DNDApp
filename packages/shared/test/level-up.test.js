import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSheet, emptySheet, normalizeSheet } from '../src/sheet.js';
import { LevelUpError, asiLevels, levelUp, levelUpChanges, levelUpChoices, multiclassNeeds, subclassLevel } from '../src/level-up.js';

const sheetWith = (over) => normalizeSheet({ ...emptySheet(), ...over });
// Fighter 3, Con 14: 10+2 + 2×(6+2) = 28 hit points.
const FIGHTER = () => sheetWith({ name: 'Bryn', classes: [{ name: 'Fighter', subclass: 'Champion', level: 3 }], abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 }, hp: { current: 20, temp: null } });

test('level up choices: the next level of each class, with ASIs, subclasses and multiclass warnings', () => {
  const c = levelUpChoices(FIGHTER());
  assert.equal(c.total, 3);
  assert.ok(c.can);
  assert.deepEqual(c.classes.map((x) => [x.name, x.next, x.die, x.asi, x.needsSubclass]), [['Fighter', 4, 10, true, false]]);
  // Wizard needs Intelligence 13: a warning, not a block.
  assert.match(c.others.find((o) => o.key === 'wizard').needs, /Wizard needs Intelligence of 13/);
  assert.equal(c.others.find((o) => o.key === 'barbarian').needs, '');
  assert.ok(c.others.find((o) => o.key === 'cleric').needsSubclass);
  assert.equal(subclassLevel('cleric', '2024'), 3);
  assert.deepEqual(asiLevels('fighter'), [4, 6, 8, 12, 14, 16, 19]);
  assert.equal(multiclassNeeds(FIGHTER(), 'fighter'), '');
  // Nothing to level without a class, nor past 20.
  assert.equal(levelUpChoices(emptySheet()).can, false);
  assert.equal(levelUpChoices(sheetWith({ classes: [{ name: 'Rogue', level: 20 }] })).why, 'Level 20 is as high as characters go.');
});

test('levelling up with the average: one more level, hit points up by the average plus Constitution, logged', () => {
  const { sheet, gained, entry } = levelUp(FIGHTER(), { class: 0, asi: { str: 2 } }, { at: 'now' });
  assert.equal(sheet.classes[0].level, 4);
  assert.equal(sheet.abilities.str, 18);
  assert.equal(gained, 8);
  assert.equal(computeSheet(sheet).values.hp_max, 36);
  assert.equal(sheet.hp.current, 28);
  assert.deepEqual(entry, { class: 'fighter', level: 4, die: 10, hp: null, asi: { str: 2 }, feat: '', at: 'now' });
  assert.equal(sheet.level_log.length, 1);
});

test('a rolled hit die counts instead of the average, while the class keeps that level', () => {
  const { sheet, gained } = levelUp(FIGHTER(), { class: 0, hp: 2 });
  assert.equal(gained, 4); // 2 + 2 Constitution
  assert.equal(computeSheet(sheet).values.hp_max, 32);
  // Taking the level back off by hand forgets the roll.
  sheet.classes[0].level = 3;
  assert.equal(computeSheet(sheet).values.hp_max, 28);
  assert.throws(() => levelUp(FIGHTER(), { class: 0, hp: 11 }), LevelUpError);
});

test('multiclassing, a subclass, a feat and a typed maximum', () => {
  const typed = FIGHTER();
  typed.overrides.hp_max = 40;
  const { sheet, gained } = levelUp(typed, { new_class: 'cleric', subclass: 'Life Domain', feat: 'Tough' });
  assert.deepEqual(sheet.classes.at(-1), { name: 'Cleric', subclass: 'Life Domain', level: 1 });
  assert.match(sheet.features, /Feat: Tough$/);
  // d8 average 5 + 2 Con, and Tough's 2 a level for all 4 levels.
  assert.equal(gained, 7 + 8);
  assert.equal(sheet.overrides.hp_max, 40 + gained);
  assert.throws(() => levelUp(FIGHTER(), { new_class: 'Fighter' }), /already have/);
  assert.throws(() => levelUp(FIGHTER(), { class: 0, asi: { str: 2, dex: 1 } }), /2 points in all/);
});

test('levelUpChanges says what a level brings', () => {
  const wizard = sheetWith({ classes: [{ name: 'Wizard', level: 4 }], abilities: { int: 16, con: 12 } });
  const { sheet } = levelUp(wizard, { class: 0 });
  const changes = levelUpChanges(wizard, sheet);
  assert.ok(changes.includes('Level 4 → 5'));
  assert.ok(changes.includes('Proficiency bonus +2 → +3'));
  assert.ok(changes.includes('Spell slots, 3rd level: 0 → 2'));
  assert.ok(changes.some((c) => /^Hit points \d+ → \d+$/.test(c)));
});

test('levels given by the DM and the level log survive normalising', () => {
  const s = normalizeSheet({ levels_granted: 2, level_log: [{ class: 'Wizard', level: 3, die: 6, hp: 9 }, { class: 'x', level: 2, die: 7 }] });
  assert.equal(s.levels_granted, 2);
  assert.equal(s.level_log.length, 1);
  assert.equal(s.level_log[0].hp, 6); // 9 on a d6 can't be: kept to the die
  assert.equal(s.level_log[0].class, 'wizard');
  assert.equal(normalizeSheet({}).levels_granted, 0);
});
