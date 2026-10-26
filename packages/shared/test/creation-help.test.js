/** Help making a character (creation-help.js): classes, races and species by edition. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, SKILLS, emptySheet } from '../src/sheet.js';
import { HELP_CLASSES, classHelp, raceHelp, racesFor, skillPicks } from '../src/creation-help.js';

test('creation help: every class in both editions, with saves, skills to choose from, equipment and level 1 features', () => {
  assert.deepEqual([...HELP_CLASSES].sort(), Object.keys(CLASSES).sort());
  for (const ed of ['2014', '2024']) {
    for (const key of HELP_CLASSES) {
      const c = classHelp(key, ed);
      assert.ok(c.skills.choose >= 2 && c.skills.from.length >= c.skills.choose, `${key} ${ed}`);
      for (const k of c.skills.from) assert.ok(SKILLS[k], `${key} ${ed}: ${k}`);
      assert.equal(c.saves.length, 2);
      assert.ok(c.equipment.length, `${key} ${ed}`);
      assert.equal(c.features[0].level, 1);
      assert.ok(c.features.every((f) => f.level >= 1 && f.level <= 20 && f.names.length));
    }
  }
  const rogue = classHelp('rogue', '2014');
  assert.equal(rogue.hit_die, 'd8');
  assert.equal(rogue.hp_first, '8 + your Constitution modifier');
  assert.deepEqual(rogue.saves, ['Dexterity', 'Intelligence']);
  assert.equal(rogue.skills.choose, 4);
  assert.ok(rogue.skills.from.includes('performance'));
  assert.match(rogue.features[0].names.join(' '), /Thieves' Cant/);
  // 2024 differs: no Performance for a rogue, Weapon Mastery, the gold option, Epic Boon at 19.
  const r24 = classHelp('rogue', '2024');
  assert.ok(!r24.skills.from.includes('performance'));
  assert.equal(r24.mastery, 2);
  assert.match(r24.equipment[0], /or \(B\) 100 GP/);
  assert.match(r24.features.find((f) => f.level === 19).names.join(' '), /Epic Boon/);
  assert.match(classHelp('fighter', '2014').features.find((f) => f.level === 4).names[0], /Ability Score Improvement/);
  assert.equal(classHelp('paladin', '2014').spells.startsWith('Charisma, from level 2'), true);
  assert.equal(classHelp('nobody'), null);
});

test('creation help: races (2014) with their ability increases, species (2024) from the background', () => {
  assert.equal(racesFor('2014').length, 15);
  assert.equal(racesFor('2024').length, 10);
  const elf = raceHelp('Wood Elf', '2014');
  assert.equal(elf.name, 'Wood Elf');
  assert.equal(elf.speed, 35);
  assert.equal(elf.abilities, '+2 Dexterity, +1 Wisdom');
  assert.deepEqual(elf.skills, ['perception']);
  assert.equal(raceHelp('drow', '2014').name, 'Dark Elf (Drow)');
  assert.match(raceHelp('Half-Elf', '2014').abilities, /\+2 Charisma, \+1 to 2 of your choice/);
  const elf24 = raceHelp('Wood Elf', '2024');
  assert.equal(elf24.name, 'Elf');
  assert.equal(elf24.abilities, 'From your background (2024)');
  assert.equal(raceHelp('Warforged', '2024'), null);
  assert.equal(raceHelp('', '2014'), null);
});

test('creation help: which of the class skills are picked and how many are left', () => {
  const s = { ...emptySheet(), skills: { stealth: 'proficient', arcana: 'proficient' } };
  assert.deepEqual(skillPicks(s, classHelp('rogue', '2014')), { picked: ['stealth'], left: 3 });
});
