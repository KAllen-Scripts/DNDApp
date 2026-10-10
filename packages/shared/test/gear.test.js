/**
 * The inventory (gear.js): items carried, what they do when equipped, the
 * equip rules, and the AC and attacks they give the sheet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToInventory, armorClass, attackWeapon, attunementLimit, carriedWeight, classProficient, encumbrance, inventoryGroups, itemCharges, itemEffects, itemStats, magicName, newUnownedWeaponAttacks, normalizeGear, normalizeInventory, ownsWeapon, unownedWeaponAttacks } from '../src/gear.js';
import { computeSheet, emptySheet, normalizeSheet, rollDisadvantage } from '../src/sheet.js';
import { normalizeSettings } from '../src/settings.js';
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
  assert.deepEqual(itemStats({ name: 'Chain mail' }).armor, { base: 16, type: 'heavy', strength: 13, stealth: true });
  assert.equal(itemStats({ name: 'Chain mail' }).weight, 55);
  assert.equal(itemStats({ name: 'Dagger' }).weight, 1);
  assert.deepEqual(itemStats({ name: 'Leather' }).armor, { base: 11, type: 'light', strength: 0, stealth: false });
  assert.deepEqual(itemStats({ name: 'Shield' }).armor, { base: 2, type: 'shield', strength: 0, stealth: false });

  // Not in the tables: read from the description.
  const blade = itemStats({ name: 'Sun Blade', kind: 'weapon', text: 'Martial melee weapon (finesse, versatile). 2d6 radiant damage.' });
  assert.deepEqual(blade.weapon, { damage: '2d6 radiant', ability: 'finesse', category: 'martial', properties: ['finesse', 'versatile'] });
  assert.equal(itemStats({ name: 'Elven Mail', kind: 'armor', text: 'Medium armour. AC 14 + Dex modifier (max 2).' }).armor.type, 'medium');
  assert.deepEqual(itemStats({ name: 'Bag of Holding', kind: 'magic', text: 'A bag.' }), { kind: 'magic', weapon: null, armor: null, magic: 0, weight: null, charges: null, effects: [] });
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

test('gear: charges and what magic items do, read from their descriptions', () => {
  assert.deepEqual(itemCharges('This wand has 7 charges. … The wand regains 1d6 + 1 expended charges daily at dawn.'), { max: 7, used: 0, recharge: '1d6+1', when: 'dawn' });
  assert.deepEqual(itemCharges('The staff has 10 charges and regains all expended charges daily at dawn.'), { max: 10, used: 0, recharge: 'all', when: 'dawn' });
  assert.equal(itemCharges('A plain rope.'), null);

  assert.deepEqual(itemEffects('You gain a +1 bonus to AC and saving throws while you wear this ring.'), [{ target: 'ac', value: 1 }, { target: 'saves', value: 1 }]);
  assert.deepEqual(itemEffects('Your Strength score is 19 while you wear these gauntlets.'), [{ target: 'score.str', value: 19 }]);
  assert.deepEqual(itemEffects('You gain a +2 bonus to AC if you are wearing no armor and using no shield.'), [{ target: 'ac_unarmored', value: 2 }]);
  assert.deepEqual(itemEffects('You gain a +2 bonus to spell attack rolls and to the saving throw DCs of your warlock spells.'), [{ target: 'spell_attack', value: 2 }, { target: 'spell_dc', value: 2 }]);
  assert.deepEqual(itemEffects('While you wear these boots, your walking speed increases by 10 feet.'), [{ target: 'speed', value: 10 }]);
  assert.deepEqual(itemEffects('A bag that holds things.'), []);
  // Kept clean: unknown targets and zero values dropped.
  assert.deepEqual(normalizeGear({ name: 'X', effects: [{ target: 'ac', value: '2' }, { target: 'flying', value: 1 }, { target: 'saves', value: 0 }] }).effects, [{ target: 'ac', value: 2 }]);
});

test('gear: three attuned items at most (artificers more), only items that need it, the newest winning', () => {
  const ring = (id) => ({ id, name: `Ring ${id}`, attunement: true, attuned: true });
  const list = [ring('a'), ring('b'), ring('c'), ring('d'), { id: 'e', name: 'Rope', attuned: true }];
  assert.deepEqual(normalizeInventory(list).map((g) => g.attuned), [true, true, true, false, false]);
  assert.deepEqual(normalizeInventory(list, { latest: 'd' }).map((g) => g.attuned), [true, true, false, true, false]);
  assert.deepEqual(normalizeInventory(list, { attuneMax: 4 }).map((g) => g.attuned), [true, true, true, true, false]);
  assert.deepEqual([0, 10, 14, 18].map(attunementLimit), [3, 4, 5, 6]);
  // The sheet works out an artificer's limit itself.
  const sheet = (classes) => normalizeSheet({ ...emptySheet(), classes, inventory: list }).inventory.filter((g) => g.attuned).length;
  assert.equal(sheet([{ name: 'Wizard', level: 12 }]), 3);
  assert.equal(sheet([{ name: 'Artificer', level: 10 }]), 4);
});

test('gear: weight carried and the campaign\'s weight rule', () => {
  const inv = [normalizeGear({ name: 'Plate armor', ...itemStats({ name: 'Plate armor' }) }), normalizeGear({ name: 'Dagger', qty: 4, ...itemStats({ name: 'Dagger' }) }), normalizeGear({ name: 'Rope' })];
  assert.equal(carriedWeight(inv, { gp: 100 }), 65 + 4 + 2);
  assert.equal(encumbrance(100, 10, 'ignore'), null);
  assert.deepEqual(encumbrance(100, 10, 'capacity'), { rule: 'capacity', carried: 100, capacity: 150, level: 'none', speed: 0, disadvantage: false });
  assert.equal(encumbrance(151, 10, 'capacity').level, 'over');
  assert.equal(encumbrance(151, 10, 'capacity', { bigger: true }).level, 'none', 'Powerful Build doubles it');
  assert.deepEqual(['none', 'encumbered', 'heavy', 'over'].map((l, i) => encumbrance([50, 51, 101, 151][i], 10, 'variant').level), ['none', 'encumbered', 'heavy', 'over']);
  assert.equal(encumbrance(101, 10, 'variant').speed, -20);
  assert.equal(encumbrance(101, 10, 'variant').disadvantage, true);
  assert.deepEqual(normalizeSettings({ weight: 'nonsense', other: 1 }), { weight: 'capacity' });
  assert.deepEqual(normalizeSettings({ weight: 'ignore' }), { weight: 'ignore' });

  // On the sheet: Str 10, 30 ft. Plate armour (65 lb) without Strength 15: −10 ft and Stealth disadvantage.
  const plate = { ...normalizeGear({ name: 'Plate armor', ...itemStats({ name: 'Plate armor' }) }), equipped: 1 };
  const s = normalizeSheet({ ...emptySheet(), race: 'Human', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, inventory: [plate, normalizeGear({ name: 'Anvil', weight: 90 })] });
  assert.equal(computeSheet(s, { weight: 'ignore' }).values.speed, 20);
  assert.equal(computeSheet(s, { weight: 'variant' }).values.speed, 5, '155 lb with Str 10: over 150');
  assert.equal(computeSheet(s).values.speed, 5, 'over carrying capacity');
  s.inventory[1].weight = 40; // 105 lb: heavily encumbered under the variant rule, fine otherwise
  assert.equal(computeSheet(s).values.speed, 20);
  const heavy = computeSheet(s, { weight: 'variant' });
  assert.equal(heavy.values.speed, 0);
  assert.equal(rollDisadvantage(heavy, { ability: 'str' }), 'heavily encumbered');
  assert.equal(rollDisadvantage(heavy, { ability: 'wis', skill: 'stealth' }), 'Plate armor');
  assert.equal(rollDisadvantage(computeSheet(s), { ability: 'str' }), '');
});

test('gear: magic items change the sheet while equipped, and attuned when they need it; typed values still win', () => {
  const item = (name, text, extra = {}) => normalizeGear({ name, kind: 'magic', equipped: 1, ...itemStats({ name, kind: 'magic', text }), ...extra });
  const s = normalizeSheet({
    ...emptySheet(), race: 'Human', classes: [{ name: 'Warlock', level: 1 }],
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 10, cha: 16 },
    inventory: [
      item('Ring of Protection', 'You gain a +1 bonus to AC and saving throws while you wear this ring.', { attunement: true, attuned: true }),
      item('Gauntlets of Ogre Power', 'Your Strength score is 19 while you wear these gauntlets.', { attunement: true, attuned: false }),
      item('Bracers of Defense', 'You gain a +2 bonus to AC if you are wearing no armor and using no shield.', { attunement: true, attuned: true }),
      item('Rod of the Pact Keeper, +1', 'You gain a +1 bonus to spell attack rolls and to the saving throw DCs of your warlock spells.', { attunement: true, attuned: true }),
    ],
  });
  let c = computeSheet(s);
  assert.equal(c.values.ac, 10 + 2 + 1 + 2);
  assert.equal(c.values['save.int'], 1);
  assert.equal(c.values['save.cha'], 3 + 2 + 1, 'proficient (warlock) + ring');
  assert.equal(c.values['mod.str'], -1, 'gauntlets not attuned: no effect');
  assert.equal(c.values.spell_attack, 2 + 3 + 1);
  assert.equal(c.values.spell_dc, 8 + 2 + 3 + 1);
  s.inventory[1].attuned = true;
  s.inventory = normalizeInventory(s.inventory, { latest: s.inventory[1].id });
  c = computeSheet(s);
  assert.equal(s.inventory.filter((g) => g.attuned).length, 3, 'a fourth attunement pushes one off');
  assert.equal(c.scores.str, 19);
  assert.equal(c.values['mod.str'], 4);
  // Armour on: the bracers stop working.
  s.inventory.push({ ...normalizeGear({ name: 'Leather armor', ...itemStats({ name: 'Leather armor' }) }), equipped: 1 });
  assert.equal(computeSheet(s).values.ac, 11 + 2 + (s.inventory[0].attuned ? 1 : 0));
  s.overrides.ac = 12;
  assert.equal(computeSheet(s).values.ac, 12);
});

test('attacks: a typed attack naming a PHB weapon needs that weapon in the inventory; unarmed strikes, spells and features don\'t', () => {
  assert.equal(attackWeapon('Longsword'), 'Longsword');
  assert.equal(attackWeapon('+1 longsword (two hands)'), 'Longsword');
  assert.equal(attackWeapon('Thrown daggers'), 'Dagger');
  assert.equal(attackWeapon('Hand crossbow'), 'Hand crossbow');
  assert.equal(attackWeapon('Shillelagh (quarterstaff)'), 'Quarterstaff');
  for (const name of ['Unarmed strike', 'Fire breath', 'Fire Bolt', 'Claws', 'Magnetic pull', 'Sneak attack', '']) assert.equal(attackWeapon(name), null, name);

  const inv = normalizeInventory([{ name: '+1 Longsword' }, { name: 'Dagger of Venom' }, { name: 'Rope' }]);
  assert.equal(ownsWeapon('Longsword', inv), true);
  assert.equal(ownsWeapon('Dagger', inv), true);
  assert.equal(ownsWeapon('Shortsword', inv), false);
  assert.equal(ownsWeapon('Longbow', []), false);

  const sheet = normalizeSheet({ inventory: inv, attacks: [{ name: 'Longsword' }, { name: 'Shortbow' }, { name: 'Unarmed strike' }, { name: 'Daggers' }] });
  assert.deepEqual(unownedWeaponAttacks(sheet), [{ index: 1, name: 'Shortbow', weapon: 'Shortbow' }]);
  // One the saved sheet already had stays (old and uploaded sheets); a new one doesn't.
  const before = normalizeSheet({ attacks: [{ name: 'Shortbow' }] });
  assert.deepEqual(newUnownedWeaponAttacks(sheet, before), []);
  const more = normalizeSheet({ ...sheet, attacks: [...sheet.attacks, { name: 'Greataxe' }] });
  assert.deepEqual(newUnownedWeaponAttacks(more, before).map((a) => a.weapon), ['Greataxe']);
  assert.deepEqual(newUnownedWeaponAttacks(more, emptySheet()).map((a) => a.weapon), ['Shortbow', 'Greataxe']);
});

test('inventory: grouped by kind in a fixed order, by name within each (ignoring a +1 in front)', () => {
  const inv = normalizeInventory([
    { name: 'Rope', kind: 'gear' },
    { name: 'Potion of Healing', kind: 'potion' },
    { name: 'Shield', armor: { base: 2, type: 'shield' } },
    { name: 'Longsword', weapon: { damage: '1d8 slashing' } },
    { name: "Thieves' tools", kind: 'tool' },
    { name: '+1 Dagger', weapon: { damage: '1d4 piercing' } },
    { name: 'Chain mail', armor: { base: 16, type: 'heavy' } },
    { name: 'Bag of Holding', kind: 'magic' },
    { name: 'Torch', kind: 'gear' },
    { name: 'Scroll of Fireball', kind: 'scroll' },
    { name: 'Mystery', kind: 'other' },
  ]);
  const groups = inventoryGroups(inv);
  assert.deepEqual(groups.map((g) => [g.label, g.items.map((i) => i.name)]), [
    ['Weapons', ['+1 Dagger', 'Longsword']],
    ['Armour and shields', ['Chain mail', 'Shield']],
    ['Magic items', ['Bag of Holding']],
    ['Potions', ['Potion of Healing']],
    ['Scrolls', ['Scroll of Fireball']],
    ['Adventuring gear', ['Rope', 'Torch']],
    ['Tools', ["Thieves' tools"]],
    ['Other', ['Mystery']],
  ]);
  // The same objects, and the stored order is left alone.
  assert.equal(groups[0].items[1], inv[3]);
  assert.equal(inv[0].name, 'Rope');
  assert.deepEqual(inventoryGroups([]), []);
});

test('spells: a custom spell keeps its source', () => {
  assert.equal(normalizeSheet({ spells: [{ name: 'Kenny\'s Kettle', source: 'custom' }] }).spells[0].source, 'custom');
  assert.equal(normalizeSheet({ spells: [{ name: 'X', source: 'nonsense' }] }).spells[0].source, 'manual');
});
