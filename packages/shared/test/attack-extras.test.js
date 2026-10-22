import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSheet, normalizeSheet, longRest, shortRest } from '../src/sheet.js';
import { addToInventory } from '../src/gear.js';
import {
  WEAPON_MASTERY, choiceGroups, masteryChoices, masteryLimit, normalizeCombat, planAttack, planSpell, spendForAttack, weaponMastery,
} from '../src/attack-extras.js';

/** A sheet with one equipped weapon from the tables, and the attack the sheet makes from it. */
function armed(fields, weapon, edition = '2014') {
  const sheet = normalizeSheet(fields);
  sheet.inventory = addToInventory(sheet.inventory, { name: weapon }, 1, { classKey: null });
  sheet.inventory.at(-1).equipped = 1;
  const g = sheet.inventory.at(-1);
  const calc = computeSheet(sheet, { edition });
  const a = { name: g.name, kind: 'attack', ability: g.weapon.ability, proficient: true, magic: g.magic, bonus: '', save: '', dc: '', damage: g.weapon.damage };
  const plan = (opts = {}) => planAttack(sheet, calc, a, { edition, weapon: { ...g.weapon, name: g.name }, ...opts });
  return { sheet, calc, a, plan };
}

test('every PHB 2024 weapon has its mastery property', () => {
  assert.equal(WEAPON_MASTERY.dagger, 'nick');
  assert.equal(WEAPON_MASTERY.greatsword, 'graze');
  assert.equal(WEAPON_MASTERY.greataxe, 'cleave');
  assert.equal(WEAPON_MASTERY.maul, 'topple');
  assert.equal(WEAPON_MASTERY.shortbow, 'vex');
  assert.equal(WEAPON_MASTERY.longsword, 'sap');
  assert.equal(WEAPON_MASTERY.whip, 'slow');
  assert.equal(WEAPON_MASTERY.pike, 'push');
  assert.equal(Object.keys(WEAPON_MASTERY).length, 38);
});

test('how many weapons a class has mastery with, by level; none under the 2014 rules', () => {
  const at = (name, level) => normalizeSheet({ classes: [{ name, level }] });
  assert.equal(masteryLimit(at('Rogue', 1), '2024'), 2);
  assert.equal(masteryLimit(at('Fighter', 1), '2024'), 3);
  assert.equal(masteryLimit(at('Fighter', 4), '2024'), 4);
  assert.equal(masteryLimit(at('Fighter', 16), '2024'), 6);
  assert.equal(masteryLimit(at('Barbarian', 10), '2024'), 4);
  assert.equal(masteryLimit(at('Paladin', 7), '2024'), 2);
  assert.equal(masteryLimit(at('Wizard', 7), '2024'), 0);
  assert.equal(masteryLimit(at('Rogue', 5), '2014'), 0);
  // Rogues pick from finesse and light weapons; barbarians melee ones.
  const rogue = masteryChoices(at('Rogue', 1), '2024').map((w) => w.key);
  assert.ok(rogue.includes('dagger') && rogue.includes('rapier') && rogue.includes('hand crossbow'));
  assert.ok(!rogue.includes('greataxe'));
  const barbarian = masteryChoices(at('Barbarian', 1), '2024').map((w) => w.key);
  assert.ok(barbarian.includes('greataxe') && !barbarian.includes('longbow'));
});

test('sheet.combat keeps only known weapons, choices and states', () => {
  assert.deepEqual(normalizeCombat({ masteries: ['Dagger', 'banana', 'dagger'], choices: ['dueling', 'x'], on: { rage: true, fly: true, hex: 'yes' } }), { masteries: ['dagger'], choices: ['dueling'], on: { rage: true } });
  assert.deepEqual(normalizeSheet({}).combat, { masteries: [], choices: [], on: {} });
});

test('a weapon with mastery shows its property with numbers on the attack (2024)', () => {
  const fighter = { classes: [{ name: 'Fighter', level: 5 }], abilities: { str: 16 }, combat: { masteries: ['greatsword', 'maul'] } };
  const gs = armed(fighter, 'Greatsword', '2024').plan();
  assert.equal(gs.mastery.property, 'graze');
  assert.equal(gs.mastery.graze, 3);
  assert.match(gs.notes[0], /on a miss, the target still takes 3 slashing damage/);
  const maul = armed(fighter, 'Maul', '2024').plan();
  assert.equal(maul.mastery.dc, 8 + 3 + 3);
  assert.match(maul.notes[0], /DC 14 Constitution save or falls Prone/);
  // Not chosen, or 2014 rules: nothing.
  assert.equal(armed(fighter, 'Longsword', '2024').plan().mastery, null);
  assert.equal(armed(fighter, 'Greatsword', '2014').plan().mastery, null);
  // The Inventory's view of it.
  const s = normalizeSheet(fighter);
  assert.deepEqual({ ...weaponMastery(s, '+1 Greatsword', '2024'), text: undefined }, { key: 'greatsword', property: 'graze', name: 'Graze', text: undefined, chosen: true, can: true });
  assert.equal(weaponMastery(s, 'Greatsword', '2014').can, false);
});

test('Sneak Attack is offered on finesse and ranged weapons, adds its d6s, and doubles on a critical hit', () => {
  const rogue = { classes: [{ name: 'Rogue', level: 5 }], abilities: { dex: 16 } };
  const plain = armed(rogue, 'Rapier').plan();
  const sneak = plain.extras.find((x) => x.id === 'sneak_attack');
  assert.equal(sneak.detail, '3d6');
  assert.equal(sneak.on, false);
  assert.equal(plain.damage, '1d8+3');
  const on = armed(rogue, 'Rapier').plan({ picks: { sneak_attack: true } });
  assert.equal(on.damage, '1d8+3d6+3');
  assert.equal(on.crit, '2d8+6d6+3');
  assert.ok(on.notes.includes('Sneak Attack: once a turn.'));
  assert.ok(armed(rogue, 'Shortbow').plan().extras.some((x) => x.id === 'sneak_attack'));
  assert.ok(!armed(rogue, 'Club').plan().extras.some((x) => x.id === 'sneak_attack'));
});

test('Divine Smite spends a slot for 2d8 more per level (5d8 at most in 2014), +1d8 against fiends', () => {
  const pal = { classes: [{ name: 'Paladin', level: 9 }], abilities: { str: 16, cha: 14 } };
  const { sheet, calc, plan } = armed(pal, 'Longsword');
  const smite = plan({ picks: { divine_smite: 3, smite_fiend: true } });
  assert.equal(smite.damage, '6d8+3');
  assert.deepEqual(smite.spends, [{ slot: 3, name: 'Divine Smite' }]);
  assert.equal(plan({ picks: { divine_smite: 1 } }).damage, '3d8+3');
  const after = spendForAttack(sheet, smite.spends, { values: calc.values });
  assert.equal(after.spellcasting.slots_used[3], 1);
  // Not on a ranged weapon.
  assert.ok(!armed(pal, 'Longbow').plan().extras.some((x) => x.id === 'divine_smite'));
  // 2014: Improved Divine Smite is always in from 11th level.
  assert.equal(armed({ ...pal, classes: [{ name: 'Paladin', level: 11 }] }, 'Longsword').plan().damage, '2d8+3');
});

test('Rage adds its damage to Strength attacks while raging; Dueling and Archery are numbers; Great Weapon Fighting changes the dice', () => {
  const barb = { classes: [{ name: 'Barbarian', level: 9 }], abilities: { str: 18 }, combat: { on: { rage: true } } };
  assert.equal(armed(barb, 'Greataxe').plan().damage, '1d12+7');
  // 2014 Brutal Critical: one more weapon die on a critical hit.
  assert.equal(armed(barb, 'Greataxe').plan().crit, '3d12+7');
  assert.equal(armed({ ...barb, combat: {} }, 'Greataxe').plan().damage, '1d12+4');
  const duel = armed({ classes: [{ name: 'Fighter', level: 1 }], abilities: { str: 16 }, combat: { choices: ['dueling'] } }, 'Longsword').plan();
  assert.equal(duel.damage, '1d8+5');
  const archer = armed({ classes: [{ name: 'Fighter', level: 1 }], abilities: { dex: 16 }, combat: { choices: ['archery'] } }, 'Longbow').plan();
  assert.equal(archer.hit, '1d20+7');
  const gwf = { classes: [{ name: 'Fighter', level: 1 }], abilities: { str: 16 }, combat: { choices: ['great_weapon'] } };
  assert.equal(armed(gwf, 'Greatsword', '2024').plan().damage, '2d6min3+3');
  assert.equal(armed(gwf, 'Greatsword', '2014').plan().damage, '2d6ro2+3');
  assert.equal(armed(gwf, 'Longsword', '2014').plan().damage, '1d8+3');
  assert.equal(armed(gwf, 'Longsword', '2014').plan({ two: true }).damage, '1d10ro2+3');
});

test('a Champion crits on 19–20; Hunter\'s Mark, Hex, Colossus Slayer and superiority dice are offered', () => {
  assert.equal(armed({ classes: [{ name: 'Fighter', subclass: 'Champion', level: 3 }] }, 'Longsword').plan().crit_on, 19);
  assert.equal(armed({ classes: [{ name: 'Fighter', subclass: 'Champion', level: 15 }] }, 'Longsword').plan().crit_on, 18);
  const ranger = armed({ classes: [{ name: 'Ranger', subclass: 'Hunter', level: 3 }], abilities: { dex: 16 }, combat: { on: { hunters_mark: true } } }, 'Longbow').plan();
  assert.equal(ranger.extras.find((x) => x.id === 'hunters_mark').on, true);
  assert.ok(ranger.extras.some((x) => x.id === 'colossus_slayer'));
  assert.equal(ranger.damage, '1d8+1d6+3');
  const bm = armed({ classes: [{ name: 'Fighter', subclass: 'Battle Master', level: 10 }], abilities: { str: 16 } }, 'Longsword');
  const sup = bm.plan({ picks: { superiority: true } });
  assert.equal(sup.damage, '1d8+1d10+3');
  assert.deepEqual(sup.spends, [{ feature: 'superiority_dice', name: 'Superiority die' }]);
  assert.equal(spendForAttack(bm.sheet, sup.spends, { edition: '2014', values: bm.calc.values }).class_features.spent.superiority_dice, 1);
});

test('a monk\'s unarmed strike uses the martial arts die and Dexterity, without armour', () => {
  const monk = normalizeSheet({ classes: [{ name: 'Monk', level: 5 }], abilities: { dex: 16, str: 10 }, attacks: [{ name: 'Unarmed strike', ability: 'str', damage: '1 bludgeoning' }] });
  assert.equal(planAttack(monk, computeSheet(monk), monk.attacks[0]).damage, '1d6+3');
  assert.equal(planAttack(monk, computeSheet(monk, { edition: '2024' }), monk.attacks[0], { edition: '2024' }).damage, '1d8+3');
  monk.inventory = addToInventory([], { name: 'Leather armor' }, 1);
  monk.inventory[0].equipped = 1;
  assert.equal(planAttack(monk, computeSheet(monk), monk.attacks[0]).flat, 1);
});

test('spells get Agonizing Blast, Potent Spellcasting, Empowered Evocation and Disciple of Life', () => {
  const lock = normalizeSheet({ classes: [{ name: 'Warlock', level: 5 }], abilities: { cha: 18 }, combat: { choices: ['agonizing_blast'] }, spells: [{ name: 'Eldritch Blast', level: 0, attack: 'attack', damage: '1d10 force' }] });
  const eb = planSpell(lock, computeSheet(lock), lock.spells[0]);
  assert.equal(eb.damage, '1d10+4');
  assert.equal(eb.crit, '2d10+4');
  const evoker = normalizeSheet({ classes: [{ name: 'Wizard', subclass: 'Evocation', level: 10 }], abilities: { int: 18 }, spells: [{ name: 'Fireball', level: 3, school: 'Evocation', attack: 'save', save: 'dex', damage: '8d6 fire' }] });
  assert.equal(planSpell(evoker, computeSheet(evoker), evoker.spells[0]).damage, '8d6+4');
  const life = normalizeSheet({ classes: [{ name: 'Cleric', subclass: 'Life', level: 3 }], abilities: { wis: 16 }, spells: [{ name: 'Cure Wounds', level: 1, attack: '', damage: '1d8 healing', damage_mod: true }] });
  assert.equal(planSpell(life, computeSheet(life), life.spells[0], { slot: 2 }).damage, '1d8+7');
});

test('choice groups follow the class: fighting styles, invocations, 2024 Blessed Strikes', () => {
  const groups = (classes, ed = '2014') => choiceGroups(normalizeSheet({ classes }), ed).map((g) => `${g.group}:${g.count}`);
  assert.deepEqual(groups([{ name: 'Fighter', level: 1 }]), ['style:1']);
  assert.deepEqual(groups([{ name: 'Paladin', level: 1 }]), []);
  assert.deepEqual(groups([{ name: 'Fighter', subclass: 'Champion', level: 10 }]), ['style:2']);
  assert.deepEqual(groups([{ name: 'Cleric', level: 7 }], '2024'), ['blessed:1']);
  assert.deepEqual(groups([{ name: 'Warlock', level: 2 }]), ['invocation:null']);
});

test('rests end raging, Hunter\'s Mark and Hex', () => {
  const s = normalizeSheet({ classes: [{ name: 'Barbarian', level: 3 }], combat: { on: { rage: true } } });
  assert.deepEqual(shortRest(s).combat.on, {});
  assert.deepEqual(longRest(s).sheet.combat.on, {});
});

test('regression: Sneak Attack can be applied to an attack from the sheet (it was only a note in Class features)', () => {
  const r = armed({ classes: [{ name: 'Rogue', level: 3 }], abilities: { dex: 14 } }, 'Dagger').plan({ picks: { sneak_attack: true } });
  assert.equal(r.damage, '1d4+2d6+2');
});
