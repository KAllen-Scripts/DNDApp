/**
 * What the sheet rolls (rolls.js): attacks and spells with the sheet's modifiers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSheet, emptySheet, guessSpellRolls, newAttack, normalizeAttack, normalizeSheet, normalizeSpell } from '../src/sheet.js';
import { addToRoll, attackRolls, spellRolls, splitDamage } from '../src/rolls.js';

/** A 5th-level wizard with Str 8, Dex 16, Int 18: proficiency +3. */
function wizard(extra = {}) {
  const s = normalizeSheet({ ...emptySheet(), classes: [{ name: 'Wizard', level: 5 }], abilities: { str: 8, dex: 16, con: 12, int: 18, wis: 10, cha: 10 }, ...extra });
  return { sheet: s, calc: computeSheet(s) };
}

test('rolls: damage dice and a number merged, damage split from its type', () => {
  assert.deepEqual(splitDamage('1d8+2 slashing'), { dice: '1d8+2', type: 'slashing' });
  assert.deepEqual(splitDamage('1 bludgeoning'), { dice: '1', type: 'bludgeoning' });
  assert.deepEqual(splitDamage('see notes'), { dice: null, type: 'see notes' });
  assert.equal(addToRoll('1d8+2', 3), '1d8+5');
  assert.equal(addToRoll('1d8', -1), '1d8-1');
  assert.equal(addToRoll('8d6', 0, '2d6'), '10d6');
  assert.equal(addToRoll('1d8', 0, '1d6'), '1d8+1d6');
  assert.equal(addToRoll('1', 3), null);
});

test('rolls: a weapon attack adds proficiency, the ability (finesse: the better one) and a magic bonus; a typed bonus wins', () => {
  const { calc } = wizard();
  const rapier = { ...newAttack(), name: 'Rapier', ability: 'finesse', damage: '1d8 piercing', magic: 1 };
  assert.deepEqual(attackRolls(rapier, calc), { kind: 'attack', bonus: 7, autoBonus: 7, hit: '1d20+7', dc: null, autoDc: null, save: '', damage: '1d8+4', flat: null, type: 'piercing' });
  // Strength 8: −1 to hit and damage; not proficient: no +3.
  const club = attackRolls({ ...newAttack(), ability: 'str', proficient: false, damage: '1d4 bludgeoning' }, calc);
  assert.equal(club.hit, '1d20-1');
  assert.equal(club.damage, '1d4-1');
  // The player's own number is kept.
  assert.equal(attackRolls({ ...rapier, bonus: '+9' }, calc).hit, '1d20+9');
  // An unarmed strike does a number, not a roll (at least 1).
  const fist = attackRolls({ ...newAttack(), ability: 'str', damage: '1 bludgeoning' }, calc);
  assert.equal(fist.damage, null);
  assert.equal(fist.flat, 1);
  // Spell attack ability (a staff of a caster, a pact weapon): Intelligence.
  assert.equal(attackRolls({ ...newAttack(), ability: 'spell', damage: '1d6' }, calc).hit, '1d20+7');
});

test('rolls: attacks from before abilities keep their numbers as written', () => {
  const old = normalizeAttack({ name: 'Shortsword', bonus: '+5', damage: '1d6+3 piercing' });
  assert.equal(old.ability, '');
  assert.equal(old.proficient, true);
  const r = attackRolls(old, wizard().calc);
  assert.equal(r.hit, '1d20+5');
  assert.equal(r.damage, '1d6+3');
});

test('rolls: a save attack has a DC (8 + proficiency + ability, or typed) and damage only', () => {
  const { calc } = wizard();
  const breath = { ...newAttack(), name: 'Breath', kind: 'save', ability: 'con', save: 'dex', damage: '2d6 fire' };
  const r = attackRolls(breath, calc);
  assert.equal(r.hit, null);
  assert.equal(r.dc, 12); // 8 + 3 + 1
  assert.equal(r.save, 'dex');
  assert.equal(r.damage, '2d6'); // no modifier on a save's damage
  assert.equal(attackRolls({ ...breath, dc: '14' }, calc).dc, 14);
});

test('rolls: how a spell rolls is read from its description', () => {
  const fireball = { level: 3, description: 'Each creature in a 20-foot-radius sphere must make a dexterity saving throw. A target takes 8d6 fire damage on a failed save.', higher_levels: 'When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.' };
  assert.deepEqual(guessSpellRolls(fireball), { attack: 'save', save: 'dex', damage: '8d6 fire', damage_mod: false, higher_damage: '1d6' });
  const fireBolt = { level: 0, description: "Make a ranged spell attack against the target. On a hit, the target takes 1d10 fire damage.\n\nThis spell's damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10)." };
  assert.deepEqual(guessSpellRolls(fireBolt), { attack: 'attack', save: '', damage: '1d10 fire', damage_mod: false, higher_damage: '1d10' });
  const cure = { level: 1, description: 'A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier.', higher_levels: 'the healing increases by 1d8 for each slot level above 1st.' };
  assert.deepEqual(guessSpellRolls(cure), { attack: '', save: '', damage: '1d8 healing', damage_mod: true, higher_damage: '1d8' });
  assert.deepEqual(guessSpellRolls({ level: 1, description: 'An invisible barrier of magical force appears.' }), { attack: '', save: '', damage: '', damage_mod: false, higher_damage: '' });
  // A saved spell from before rolls existed gets them; one the player changed keeps theirs.
  assert.equal(normalizeSpell({ name: 'Fireball', ...fireball }).damage, '8d6 fire');
  assert.equal(normalizeSpell({ name: 'Fireball', ...fireball, attack: '', damage: '' }).damage, '');
});

test('rolls: spells add the spell attack bonus or DC, more dice when cast higher (cantrips by level), and the modifier when ticked', () => {
  const { calc } = wizard(); // spell attack +7, DC 15, Int +4
  const fireball = normalizeSpell({ name: 'Fireball', level: 3, attack: 'save', save: 'dex', damage: '8d6 fire', higher_damage: '1d6' });
  assert.deepEqual(spellRolls(fireball, calc), { kind: 'save', hit: null, bonus: null, dc: 15, save: 'dex', damage: '8d6', type: 'fire' });
  assert.equal(spellRolls(fireball, calc, 5).damage, '10d6');
  const fireBolt = normalizeSpell({ name: 'Fire Bolt', level: 0, attack: 'attack', damage: '1d10 fire', higher_damage: '1d10' });
  const bolt = spellRolls(fireBolt, calc);
  assert.equal(bolt.hit, '1d20+7');
  assert.equal(bolt.damage, '2d10'); // 5th level
  assert.equal(spellRolls(fireBolt, { ...calc, level: 17 }).damage, '4d10');
  assert.equal(spellRolls(fireBolt, { ...calc, level: 4 }).damage, '1d10');
  const cure = normalizeSpell({ name: 'Cure Wounds', level: 1, attack: '', damage: '1d8 healing', damage_mod: true, higher_damage: '1d8' });
  assert.deepEqual(spellRolls(cure, calc, 2), { kind: '', hit: null, bonus: null, dc: null, save: '', damage: '2d8+4', type: 'healing' });
});
