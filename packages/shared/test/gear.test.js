/**
 * The inventory (gear.js): items carried, what they do when equipped, the
 * equip rules, and the AC and attacks they give the sheet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToInventory, armorClass, classProficient, itemStats, magicName, normalizeGear, normalizeInventory } from '../src/gear.js';
import { computeSheet, emptySheet, normalizeSheet } from '../src/sheet.js';
import { gearRolls } from '../src/rolls.js';

const sheetWith = (inventory, extra = {}) => {
  const s = normalizeSheet({ ...emptySheet(), classes: [{ name: 'Fighter', level: 5 }], abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, inventory, ...extra });
  return { sheet: s, calc: computeSheet(s) };
};

test('gear: magic names and what an item does, from the tables or its description', () => {
  assert.deepEqual(magicName('+1 Longsword'), { base: 'longsword', magic: 1 });
  assert.deepEqual(magicName('Longsword, +2'), { base: 'longsword', magic: 2 });
  assert.deepEqual(magicName('Rope'), { base: 'rope', magic: 0 });

  const sword = itemStats({ name: '+1 Longsword' });
  assert.equal(sword.kind, 'weapon');
  assert.equal(sword.magic, 1);
  assert.equal(sword.weapon.category, 'martial');
  assert.ok(sword.weapon.properties.includes('versatile'));
  assert.deepEqual(itemStats({ name: 'Chain mail' }).armor, { base: 16, type: 'heavy' });
  assert.deepEqual(itemStats({ name: 'Leather' }).armor, { base: 11, type: 'light' });
  assert.deepEqual(itemStats({ name: 'Shield' }).armor, { base: 2, type: 'shield' });

  // Not in the tables: read from the description.
  const blade = itemStats({ name: 'Sun Blade', kind: 'weapon', text: 'Martial melee weapon (finesse, versatile). 2d6 radiant damage.' });
  assert.deepEqual(blade.weapon, { damage: '2d6 radiant', ability: 'finesse', category: 'martial', properties: ['finesse', 'versatile'] });
  assert.equal(itemStats({ name: 'Elven Mail', kind: 'armor', text: 'Medium armour. AC 14 + Dex modifier (max 2).' }).armor.type, 'medium');
  assert.deepEqual(itemStats({ name: 'Bag of Holding', kind: 'magic', text: 'A bag.' }), { kind: 'magic', weapon: null, armor: null, magic: 0 });
});

test('gear: class proficiency from the PHB, unknown classes left to the player', () => {
  const longsword = { name: 'Longsword', ...itemStats({ name: 'Longsword' }) };
  const plate = { name: 'Plate armor', ...itemStats({ name: 'Plate armor' }) };
  assert.equal(classProficient('fighter', longsword), true);
  assert.equal(classProficient('wizard', longsword), false);
  assert.equal(classProficient('rogue', longsword), true); // named weapon
  assert.equal(classProficient('wizard', { name: 'Dagger', ...itemStats({ name: 'Dagger' }) }), true);
  assert.equal(classProficient('cleric', plate), false);
  assert.equal(classProficient('paladin', plate), true);
  assert.equal(classProficient('homebrew', plate), null);
  assert.equal(classProficient('fighter', { name: 'Rope', weapon: null, armor: null }), null);
});

test('gear: several of a weapon equipped, but one suit of armour and one shield, the newest winning', () => {
  const daggers = normalizeGear({ name: 'Dagger', qty: 2, equipped: 5, ...itemStats({ name: 'Dagger' }) });
  assert.equal(daggers.equipped, 2, 'no more equipped than carried');
  assert.equal(normalizeGear({ name: 'Plate', qty: 2, equipped: 2, armor: { base: 18, type: 'heavy' } }).equipped, 1);

  const list = [
    { id: 'a', name: 'Leather armor', equipped: 1, armor: { base: 11, type: 'light' } },
    { id: 'b', name: 'Chain mail', equipped: 1, armor: { base: 16, type: 'heavy' } },
    { id: 'c', name: 'Shield', equipped: 1, armor: { base: 2, type: 'shield' } },
    { id: 'd', name: 'Dagger', qty: 2, equipped: 2, ...itemStats({ name: 'Dagger' }) },
  ];
  const first = normalizeInventory(list);
  assert.deepEqual(first.map((g) => g.equipped), [1, 0, 1, 2], 'the first armour stays on when nothing says which is new');
  const latest = normalizeInventory(list, { latest: 'b' });
  assert.deepEqual(latest.map((g) => g.equipped), [0, 1, 1, 2], 'the one just equipped wins');
});

test('gear: AC from equipped armour, Dex limits by type, shields and magic; typed AC still wins', () => {
  const armor = (name, magic = 0) => ({ name, equipped: 1, ...itemStats({ name }), magic });
  assert.equal(armorClass([], 2), null);
  assert.equal(armorClass([armor('Leather armor')], 3).ac, 14);
  assert.equal(armorClass([armor('Half plate')], 3).ac, 17, 'medium: Dex up to +2');
  assert.equal(armorClass([armor('Plate armor', 1), armor('Shield')], 3).ac, 21);
  assert.equal(armorClass([armor('Shield')], 2).ac, 14);

  assert.equal(sheetWith([]).calc.values.ac, 12, 'nothing worn: 10 + Dex');
  assert.equal(sheetWith([armor('Chain mail'), armor('Shield')]).calc.values.ac, 18);
  assert.equal(sheetWith([{ ...armor('Chain mail'), equipped: 0 }]).calc.values.ac, 12, 'carried but not worn');
  assert.equal(sheetWith([armor('Chain mail')], { overrides: { ac: 25 } }).calc.values.ac, 25);
  // Unarmoured Defence still counts with a shield (barbarian) but not armour.
  const barb = (inv) => sheetWith(inv, { classes: [{ name: 'Barbarian', level: 3 }] }).calc.values.ac;
  assert.equal(barb([armor('Shield')]), 10 + 2 + 2 + 2);
  assert.equal(barb([armor('Leather armor')]), 13);
});

test('gear: equipped weapons roll with proficiency, ability and magic; versatile with both hands', () => {
  const { calc } = sheetWith([]);
  const sword = normalizeGear({ name: '+1 Longsword', proficient: true, equipped: 1, ...itemStats({ name: '+1 Longsword' }) });
  const r = gearRolls(sword, calc);
  assert.equal(r.bonus, 3 + 3 + 1, 'proficiency 3, Str 3, +1');
  assert.equal(r.damage, '1d8+4');
  assert.equal(r.type, 'slashing');
  assert.equal(r.damage2, '1d10+4');
  assert.equal(gearRolls({ ...sword, proficient: false }, calc).bonus, 4);
  const rapier = normalizeGear({ name: 'Rapier', proficient: true, ...itemStats({ name: 'Rapier' }) });
  assert.equal(gearRolls(rapier, sheetWith([], { abilities: { str: 8, dex: 18, con: 10, int: 10, wis: 10, cha: 10 } }).calc).bonus, 3 + 4, 'finesse: the better of Str and Dex');
  assert.equal(gearRolls(rapier, calc).damage2, null);
});

test('gear: bought items join the inventory, stacking with the same item', () => {
  let inv = addToInventory([], { id: 'i1', name: 'Longsword', kind: 'weapon', text: '' }, 1, { classKey: 'wizard' });
  assert.equal(inv[0].proficient, false, "a wizard isn't proficient with a longsword");
  assert.equal(inv[0].weapon.damage, '1d8 slashing');
  inv = addToInventory(inv, { id: 'i1', name: 'Longsword' }, 2);
  assert.equal(inv.length, 1);
  assert.equal(inv[0].qty, 3);
  inv = addToInventory(inv, { id: 'i2', name: 'Potion of Healing', kind: 'potion', text: 'Regain 2d4+2 hit points.' }, 2, { classKey: 'wizard' });
  assert.deepEqual(inv.map((g) => [g.name, g.kind, g.qty, g.equipped]), [['Longsword', 'weapon', 3, 0], ['Potion of Healing', 'potion', 2, 0]]);
  assert.equal(inv[1].proficient, true, 'not a weapon or armour: nothing to be proficient with');
});
