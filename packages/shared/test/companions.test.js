import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtStatBlock, companionSources, companionStatsText, normalizeCompanion, rangersCompanion, setCompanionHp } from '../src/companions.js';
import { normalizeSheet } from '../src/sheet.js';
import { statBlockRolls } from '../src/map.js';

const values = { proficiency_bonus: 3, spell_attack: 7, spell_dc: 15, 'mod.wis': 3, 'mod.int': 4 };
const sheetWith = (classes, spells = []) => normalizeSheet({ classes, spells: spells.map((name) => ({ name })) });

test('companions: kept on the sheet, cleaned up; hit points stay within the maximum', () => {
  const sheet = normalizeSheet({ companions: [{ id: 'a', name: 'Hoot', kind: 'familiar', form: { name: 'Owl', hp_max: 1, ac: 11 } }, { name: '', form: {} }, 'junk'] });
  assert.equal(sheet.companions.length, 3);
  assert.deepEqual(sheet.companions[0].hp, { current: 1, max: 1 });
  assert.equal(sheet.companions[0].kind, 'familiar');
  assert.equal(sheet.companions[1].kind, 'companion');
  assert.equal(setCompanionHp(sheet, 'a', 9).companion.hp.current, 1, 'not over its maximum');
  assert.equal(setCompanionHp(sheet, 'a', -3).companion.hp.current, -3);
  assert.equal(setCompanionHp(sheet, 'nope', 1).companion, null);
  assert.equal(normalizeSheet({}).companions.length, 0);
});

test('companions: the spells and features on a sheet that give one', () => {
  const ids = (sheet, edition) => companionSources(sheet, { edition }).map((s) => s.id);
  assert.deepEqual(ids(sheetWith([{ name: 'Wizard', level: 3 }], ['Find Familiar']), '2014'), ['find_familiar']);
  assert.deepEqual(ids(sheetWith([{ name: 'Druid', level: 4 }]), '2014'), ['wild_companion']);
  assert.deepEqual(ids(sheetWith([{ name: 'Ranger', subclass: 'Beast Master', level: 5 }]), '2014'), ['primal_companion', 'rangers_companion']);
  assert.deepEqual(ids(sheetWith([{ name: 'Ranger', subclass: 'Beast Master', level: 5 }]), '2024'), ['primal_companion']);
  assert.deepEqual(ids(sheetWith([{ name: 'Ranger', subclass: 'Drakewarden', level: 3 }]), '2014'), ['drake_companion']);
  assert.deepEqual(ids(sheetWith([{ name: 'Artificer', subclass: 'Battle Smith', level: 3 }]), '2014'), ['steel_defender']);
  assert.deepEqual(ids(sheetWith([{ name: 'Paladin', level: 5 }]), '2024'), ['find_steed'], '2024 paladins have Find Steed');
  assert.deepEqual(ids(sheetWith([{ name: 'Druid', level: 5 }], ['Conjure Animals']), '2014'), ['wild_companion', 'conjure_animals']);
  assert.ok(companionSources(sheetWith([{ name: 'Wizard', level: 1 }], ['Find Familiar']), { edition: '2014' })[0].creatures.includes('Owl'));
});

test('companions: stat blocks worked out from the character (Steel Defender, Primal Companion, a drake, the 2024 steed)', () => {
  const smith = builtStatBlock('steel_defender', { sheet: sheetWith([{ name: 'Artificer', subclass: 'Battle Smith', level: 5 }]), values });
  assert.equal(smith.hp_max, 2 + 4 + 25);
  assert.equal(smith.ac, 15);
  assert.deepEqual(smith.attacks[0], { ...smith.attacks[0], name: 'Force-Empowered Rend', bonus: 7, damage: '1d8+3 force' });
  assert.equal(smith.saves.dex, 4);

  const ranger = sheetWith([{ name: 'Ranger', subclass: 'Beast Master', level: 5 }]);
  const land14 = builtStatBlock('primal_companion', { sheet: ranger, values, edition: '2014', choice: 'land' });
  assert.equal(land14.ac, 16, '13 + PB');
  assert.equal(land14.hp_max, 30);
  assert.equal(land14.attacks[0].damage, '1d8+5 slashing', '1d8 + 2 + PB');
  const sky24 = builtStatBlock('primal_companion', { sheet: ranger, values, edition: '2024', choice: 'sky' });
  assert.equal(sky24.ac, 16, '13 + Wisdom');
  assert.equal(sky24.hp_max, 24);
  assert.equal(sky24.speed.fly, 60);
  assert.equal(sky24.attacks[0].damage, '1d4+6 slashing', '1d4 + 3 + Wisdom');

  const drake = builtStatBlock('drake_companion', { sheet: sheetWith([{ name: 'Ranger', subclass: 'Drakewarden', level: 7 }]), values, choice: 'cold' });
  assert.equal(drake.size, 'medium');
  assert.equal(drake.speed.fly, 40);
  assert.match(drake.traits[0].text, /cold/);

  const steed = builtStatBlock('find_steed', { sheet: ranger, values, edition: '2024', choice: 'fiend', level: 4 });
  assert.equal(steed.ac, 14);
  assert.equal(steed.hp_max, 45);
  assert.equal(steed.speed.fly, 60);
  assert.equal(steed.attacks[0].damage, '1d8+4 necrotic');
  assert.equal(builtStatBlock('nothing', { sheet: ranger, values }), null);
});

test("companions: the 2014 Ranger's Companion adds the proficiency bonus and has at least four times the ranger level in hit points", () => {
  const wolf = { name: 'Wolf', ac: 13, hp_max: 11, abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, skills: { perception: 3 }, attacks: [{ name: 'Bite', bonus: 4, damage: '2d4+2 piercing' }] };
  const c = rangersCompanion(wolf, { sheet: sheetWith([{ name: 'Ranger', subclass: 'Beast Master', level: 5 }]), values });
  assert.equal(c.ac, 16);
  assert.equal(c.hp_max, 20);
  assert.equal(c.attacks[0].bonus, 7);
  assert.equal(c.attacks[0].damage, '2d4+5 piercing');
  assert.equal(c.saves.dex, 5);
  assert.equal(c.skills.perception, 6);
});

test("companions: the token's stat block text can be rolled from on the map", () => {
  const c = normalizeCompanion({ name: 'Rex', form: { name: 'Wolf', ac: 13, hp_max: 11, abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, attacks: [{ name: 'Bite', bonus: 4, damage: '2d4+2 piercing' }] } });
  const { abilities, attacks } = statBlockRolls(companionStatsText(c));
  assert.deepEqual(attacks, [{ name: 'Bite', hit: 4, damage: ['2d4+2'] }]);
  assert.equal(abilities.find((a) => a.ability === 'DEX').mod, 2);
});
