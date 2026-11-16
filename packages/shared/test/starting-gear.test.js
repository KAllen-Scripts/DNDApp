import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equipmentItems, equipmentOptions, knownItemName } from '../src/starting-gear.js';

const short = (choice) => equipmentItems(choice).items.map((i) => `${i.qty}×${i.name}${i.pick ? '?' : ''}`);

test('starting gear: a line\'s choices, 2014 and 2024', () => {
  assert.deepEqual(equipmentOptions('(a) a rapier, (b) a longsword or (c) any simple weapon'), ['a rapier', 'a longsword', 'any simple weapon']);
  assert.deepEqual(equipmentOptions("(A) Greataxe, 4 Handaxes, Explorer's Pack, 15 GP; or (B) 75 GP"), ["Greataxe, 4 Handaxes, Explorer's Pack, 15 GP", '75 GP']);
  assert.deepEqual(equipmentOptions('Two daggers'), ['Two daggers']);
});

test('starting gear: each choice as items with how many, gold, and picks to make', () => {
  assert.deepEqual(short("An explorer's pack and four javelins"), ["1×Explorer's pack", '4×Javelin']);
  assert.deepEqual(short('A longbow and a quiver of 20 arrows'), ['1×Longbow', '1×Quiver', '1×Arrows (20)']);
  assert.deepEqual(short('two martial weapons'), ['1×Battleaxe?', '1×Battleaxe?']);
  assert.ok(equipmentItems('any simple melee weapon').items[0].pick.every((n) => !['Shortbow', 'Light crossbow', 'Sling', 'Dart'].includes(n)));
  assert.deepEqual(short('A shield and a holy symbol'), ['1×Shield', '1×Holy symbol: amulet?']);
  const b = equipmentItems("Greataxe, 4 Handaxes, Explorer's Pack, 15 GP");
  assert.equal(b.gold, 15);
  assert.deepEqual(b.items.map((i) => [i.name, i.qty]), [['Greataxe', 1], ['Handaxe', 4], ["Explorer's pack", 1]]);
  assert.equal(knownItemName('leather armour'), 'Leather armor');
  assert.equal(knownItemName('Druidic Focus (Quarterstaff)'), 'Quarterstaff');
  assert.equal(knownItemName('Arcane Focus (orb)'), 'Arcane focus: orb');
});
