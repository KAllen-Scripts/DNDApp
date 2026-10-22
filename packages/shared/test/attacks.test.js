import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  afterDefenses, attackLogFor, attackSituation, concentrationDc, creatureActions, creatureDefenses, critNotation, halvesOnSave,
  refundSlot, resolveAttack, saveSituation, sheetActions, sheetDefenses, slotsLeft, spendSlot, tokenGap,
} from '../src/attacks.js';
import { attackRiders } from '../src/attack-riders.js';
import { computeSheet, emptySheet, normalizeSheet } from '../src/sheet.js';
import { normalizeGear } from '../src/gear.js';
import { normalizeAttackLog, normalizeMap } from '../src/map.js';

/** Dice that come up in order (each call takes the next number). */
const dice = (...values) => {
  const list = [...values];
  return () => {
    if (!list.length) throw new Error('ran out of dice');
    return list.shift();
  };
};

const GOBLIN = `**Goblin**
*Small humanoid (goblinoid), neutral evil*
**Armor Class** 15 (leather armor, shield)
**Hit Points** 7 (2d6)
| STR | DEX | CON | INT | WIS | CHA |
|---|---|---|---|---|---|
| 8 (-1) | 14 (+2) | 10 (+0) | 10 (+0) | 8 (-1) | 8 (-1) |
**Saving Throws** Dex +4, Wis +1
**Damage Resistances** fire; bludgeoning, piercing, and slashing from nonmagical attacks
**Damage Immunities** poison
**Condition Immunities** poisoned
***Scimitar.*** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) slashing damage plus 3 (1d6) fire damage.
***Shortbow.*** *Ranged Weapon Attack:* +4 to hit, range 80/320 ft., one target. *Hit:* 5 (1d6 + 2) piercing damage.
***Fire Breath (Recharge 5–6).*** The goblin exhales fire in a 15-foot cone. Each creature in that area must make a DC 12 Dexterity saving throw, taking 10 (3d6) fire damage on a failed save, or half as much damage on a successful one.`;

const DRAKE_2024 = `## Ash Drake
AC 14
Resistances Fire
Vulnerabilities Cold
Immunities Poison; Poisoned
Bite. Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d10 + 2) Piercing damage.
Ash Breath (Recharge 6). Constitution Saving Throw: DC 13, each creature in a 15-foot Cone. Failure: 14 (4d6) Fire damage. Success: Half damage.`;

test('creatureActions reads attacks and save actions from 2014 and 2024 stat blocks', () => {
  const [scimitar, bow, breath] = creatureActions(GOBLIN);
  assert.deepEqual(
    { name: scimitar.name, kind: scimitar.kind, bonus: scimitar.bonus, damage: scimitar.damage, ranged: scimitar.ranged },
    { name: 'Scimitar', kind: 'attack', bonus: 4, damage: [{ dice: '1d6+2', type: 'slashing' }, { dice: '1d6', type: 'fire' }], ranged: false },
  );
  assert.equal(bow.ranged, true);
  assert.deepEqual({ kind: breath.kind, dc: breath.dc, save: breath.save, damage: breath.damage, area: breath.area, half: breath.half },
    { kind: 'save', dc: 12, save: 'dex', damage: [{ dice: '3d6', type: 'fire' }], area: { shape: 'cone', size: 15 }, half: true });
  const [bite, ash] = creatureActions(DRAKE_2024);
  assert.deepEqual({ bonus: bite.bonus, damage: bite.damage }, { bonus: 5, damage: [{ dice: '1d10+2', type: 'piercing' }] });
  assert.deepEqual({ dc: ash.dc, save: ash.save, damage: ash.damage, half: ash.half, area: ash.area }, { dc: 13, save: 'con', damage: [{ dice: '4d6', type: 'fire' }], half: true, area: { shape: 'cone', size: 15 } });
});

test('creatureDefenses reads AC, saves (listed, else the ability) and resistances', () => {
  const d = creatureDefenses({ text: GOBLIN });
  assert.equal(d.ac, 15);
  assert.equal(d.saves.dex, 4);
  assert.equal(d.saves.wis, 1);
  assert.equal(d.saves.str, -1);
  assert.deepEqual(d.immune, [{ type: 'poison', nonmagical: false }]);
  assert.deepEqual(d.resist.map((r) => `${r.type}${r.nonmagical ? '*' : ''}`), ['fire', 'bludgeoning*', 'piercing*', 'slashing*']);
  assert.equal(creatureDefenses({ text: GOBLIN, ac: 17 }).ac, 17, 'the token stat block AC wins');
  const drake = creatureDefenses({ text: DRAKE_2024 });
  assert.equal(drake.ac, 14);
  assert.deepEqual([drake.resist[0].type, drake.vulnerable[0].type, drake.immune.map((x) => x.type)], ['fire', 'cold', ['poison']]);
});

test('afterDefenses: immune, resistant (not to magic weapons when it says nonmagical), vulnerable', () => {
  const d = creatureDefenses({ text: GOBLIN });
  assert.deepEqual(afterDefenses(9, 'poison', d), { amount: 0, note: 'immune' });
  assert.deepEqual(afterDefenses(9, 'fire', d), { amount: 4, note: 'resistant' });
  assert.deepEqual(afterDefenses(9, 'slashing', d), { amount: 4, note: 'resistant' });
  assert.deepEqual(afterDefenses(9, 'slashing', d, { magical: true }), { amount: 9, note: '' });
  assert.deepEqual(afterDefenses(5, 'cold', creatureDefenses({ text: DRAKE_2024 })), { amount: 10, note: 'vulnerable' });
});

test('critNotation doubles the dice, not the modifier', () => {
  assert.equal(critNotation('1d8+3'), '2d8+3');
  assert.equal(critNotation('2d6+1d4-1'), '4d6+2d4-1');
  assert.equal(critNotation('4'), '4');
});

test('halvesOnSave reads the spell, and cantrips without the words do nothing on a save', () => {
  assert.equal(halvesOnSave('…or half as much damage on a successful one.'), true);
  assert.equal(halvesOnSave('The target must succeed on a Dexterity saving throw or take 1d8 radiant damage.', { cantrip: true }), false);
  assert.equal(halvesOnSave('', { cantrip: false }), true);
});

const rogue = () => {
  const sheet = normalizeSheet({
    ...emptySheet(), classes: [{ name: 'Rogue', level: 5 }], abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10 },
    inventory: [normalizeGear({ name: 'Rapier', equipped: 1, proficient: true, weapon: { damage: '1d8 piercing', ability: 'finesse', category: 'martial', properties: ['finesse'] } })],
    attacks: [{ name: 'Fire breath', kind: 'save', ability: 'con', save: 'dex', damage: '2d6 fire' }, { name: 'Longsword', damage: '1d8 slashing' }],
    features: 'Hellish Resistance. You have resistance to fire damage.',
  });
  return { sheet, calc: computeSheet(sheet) };
};

test('sheetActions: equipped weapons as the sheet rolls them, typed attacks (not ones for weapons not carried), spells', () => {
  const { sheet, calc } = rogue();
  const actions = sheetActions(sheet, calc);
  const rapier = actions.find((a) => a.name === 'Rapier');
  assert.deepEqual({ kind: rapier.kind, bonus: rapier.bonus, damage: rapier.damage, finesse: rapier.finesse }, { kind: 'attack', bonus: 6, damage: [{ dice: '1d8+3', type: 'piercing' }], finesse: true });
  const breath = actions.find((a) => a.name === 'Fire breath');
  assert.deepEqual({ kind: breath.kind, dc: breath.dc, save: breath.save, half: breath.half }, { kind: 'save', dc: 12, save: 'dex', half: true });
  assert.equal(actions.find((a) => a.name === 'Longsword'), undefined, 'no longsword in the inventory, so it does not roll');
});

test('sheetActions: spells with attacks, saves (areas, upcasting) and healing', () => {
  const sheet = normalizeSheet({
    ...emptySheet(), classes: [{ name: 'Wizard', level: 5 }], abilities: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10 },
    spells: [
      { name: 'Fireball', level: 3, range: '150 feet', description: 'Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.', higher_levels: 'the damage increases by 1d6 for each slot level above 3rd.' },
      { name: 'Fire Bolt', level: 0, description: 'Make a ranged spell attack against the target. On a hit, the target takes 1d10 fire damage. This spell’s damage increases by 1d10 when you reach 5th level (2d10).' },
      { name: 'Cure Wounds', level: 1, description: 'A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier.' },
    ],
  });
  const calc = computeSheet(sheet);
  const acts = sheetActions(sheet, calc, { slots: {} });
  const fireball = acts.find((a) => a.name === 'Fireball');
  assert.deepEqual({ kind: fireball.kind, dc: fireball.dc, save: fireball.save, damage: fireball.damage, area: fireball.area, half: fireball.half, upcast: fireball.upcast },
    { kind: 'save', dc: 15, save: 'dex', damage: [{ dice: '8d6', type: 'fire' }], area: { shape: 'circle', size: 20 }, half: true, upcast: true });
  const fireball4 = sheetActions(sheet, calc, { slots: { [fireball.id.slice(6)]: 4 } }).find((a) => a.name === 'Fireball');
  assert.equal(fireball4.damage[0].dice, '9d6');
  const bolt = acts.find((a) => a.name === 'Fire Bolt');
  assert.deepEqual({ kind: bolt.kind, bonus: bolt.bonus, damage: bolt.damage, ranged: bolt.ranged }, { kind: 'attack', bonus: 7, damage: [{ dice: '2d10', type: 'fire' }], ranged: true });
  const cure = acts.find((a) => a.name === 'Cure Wounds');
  assert.deepEqual({ kind: cure.kind, damage: cure.damage }, { kind: 'heal', damage: [{ dice: '1d8+4', type: 'healing' }] });
});

test('spell slots: spend an ordinary slot, else a pact slot of that level; refund puts it back', () => {
  const sheet = normalizeSheet({ ...emptySheet(), classes: [{ name: 'Wizard', level: 3 }], spellcasting: { slots_used: { 2: 2 } } });
  const calc = computeSheet(sheet);
  assert.equal(slotsLeft(sheet, calc)[1], 4);
  assert.equal(slotsLeft(sheet, calc)[2], 0);
  assert.equal(spendSlot(sheet, calc, 2), null);
  const spent = spendSlot(sheet, calc, 1);
  assert.equal(spent.used, 'slot');
  assert.equal(spent.sheet.spellcasting.slots_used[1], 1);
  assert.equal(refundSlot(spent.sheet, 1, 'slot').spellcasting.slots_used[1], 0);
  const lock = normalizeSheet({ ...emptySheet(), classes: [{ name: 'Warlock', level: 3 }] });
  const lc = computeSheet(lock);
  const pact = spendSlot(lock, lc, 2);
  assert.equal(pact.used, 'pact');
  assert.equal(pact.sheet.spellcasting.pact_used, 1);
});

test('sheetDefenses: AC and saves from the sheet, resistances written in features', () => {
  const { sheet, calc } = rogue();
  const d = sheetDefenses(sheet, calc);
  assert.equal(d.ac, 13);
  assert.equal(d.saves.dex, 6);
  assert.deepEqual(d.resist.map((r) => r.type), ['fire']);
});

test('attackSituation: conditions give advantage or disadvantage, and a paralysed target next to you is a critical hit', () => {
  const a = { name: 'Ana', conditions: [] };
  assert.deepEqual(attackSituation({ attacker: a, target: { name: 'Orc', conditions: ['prone'] }, gap: 5 }), { mode: 'advantage', reasons: ['Orc is prone'], autoCrit: false });
  assert.equal(attackSituation({ attacker: a, target: { name: 'Orc', conditions: ['prone'] }, gap: 30, ranged: true }).mode, 'disadvantage');
  assert.equal(attackSituation({ attacker: { name: 'Ana', conditions: ['poisoned'] }, target: { name: 'Orc', conditions: ['restrained'] } }).mode, 'normal', 'advantage and disadvantage cancel');
  assert.equal(attackSituation({ attacker: a, target: { name: 'Orc', conditions: ['paralyzed'] }, gap: 5 }).autoCrit, true);
  assert.equal(attackSituation({ attacker: a, target: { name: 'Orc', conditions: ['paralyzed'] }, gap: 10 }).autoCrit, false);
  assert.equal(attackSituation({ attacker: a, target: { name: 'Orc', conditions: [] }, gap: 5, ranged: true }).mode, 'disadvantage');
  assert.equal(attackSituation({ attacker: a, target: { name: 'Orc', conditions: [] }, chosen: 'advantage' }).mode, 'advantage');
});

test('saveSituation: paralysed creatures fail Strength and Dexterity saves; restrained have disadvantage on Dexterity', () => {
  assert.equal(saveSituation({ name: 'X', conditions: ['stunned'] }, 'dex').autoFail, true);
  assert.equal(saveSituation({ name: 'X', conditions: ['stunned'] }, 'wis').autoFail, false);
  assert.equal(saveSituation({ name: 'X', conditions: ['restrained'] }, 'dex').mode, 'disadvantage');
});

test('tokenGap counts reach the 5e way: side by side is 5 ft, a Large creature reaches further', () => {
  const map = normalizeMap({ image: { width: 700, height: 700 }, grid: { size: 70, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } });
  assert.equal(tokenGap(map, { x: 35, y: 35, size: 1 }, { x: 105, y: 105, size: 1 }), 5);
  assert.equal(tokenGap(map, { x: 35, y: 35, size: 1 }, { x: 245, y: 35, size: 1 }), 15);
  assert.equal(tokenGap(map, { x: 70, y: 70, size: 2 }, { x: 175, y: 35, size: 1 }), 5);
});

test('resolveAttack: a hit rolls damage with the resistances; a miss rolls none', () => {
  const [scimitar] = creatureActions(GOBLIN);
  const target = { id: 't1', name: 'Ana', ac: 14, resist: [{ type: 'fire', nonmagical: false }], conditions: [] };
  const hit = resolveAttack({ action: scimitar, attacker: { name: 'Goblin', conditions: [] }, targets: [target], random: dice(12, 4, 5) });
  const t = hit.targets[0];
  assert.deepEqual({ hit: t.hit, crit: t.crit, total: t.attack.total, amount: t.amount }, { hit: true, crit: false, total: 16, amount: 6 + 2 });
  assert.deepEqual(t.rolled, [{ notation: '1d6+2', type: 'slashing', total: 6 }, { notation: '1d6', type: 'fire', total: 5 }]);
  assert.ok(t.notes.includes('resistant to fire'));
  assert.equal(hit.rolls.length, 3);
  const miss = resolveAttack({ action: scimitar, targets: [target], random: dice(9) });
  assert.deepEqual({ hit: miss.targets[0].hit, amount: miss.targets[0].amount, rolled: miss.targets[0].rolled }, { hit: false, amount: 0, rolled: [] });
});

test('resolveAttack: a natural 20 always hits and doubles the dice (riders too); a natural 1 always misses', () => {
  const [scimitar] = creatureActions(GOBLIN);
  const target = { id: 't1', name: 'Ana', ac: 30, conditions: [] };
  const crit = resolveAttack({ action: scimitar, targets: [target], riders: [{ dice: '3d6', type: '' }], random: dice(20, ...Array(10).fill(1)) });
  assert.equal(crit.targets[0].crit, true);
  assert.deepEqual(crit.targets[0].rolled.map((r) => r.notation), ['2d6+2', '2d6', '6d6']);
  assert.equal(crit.targets[0].amount, 4 + 2 + 6, 'a rider with no type takes nothing off for resistance');
  const fumble = resolveAttack({ action: scimitar, targets: [{ ...target, ac: 2 }], random: dice(1) });
  assert.equal(fumble.targets[0].hit, false);
});

test('resolveAttack: an unknown AC leaves the hit to the DM', () => {
  const [scimitar] = creatureActions(GOBLIN);
  const r = resolveAttack({ action: scimitar, targets: [{ id: 'x', name: 'Mystery', ac: null, conditions: [] }], random: dice(10, 3, 3) });
  assert.equal(r.targets[0].hit, null);
  assert.ok(r.targets[0].notes.some((n) => /DM decides/.test(n)));
});

test('resolveAttack: an area save rolls damage once, each target saves, half on a success, nothing for the immune', () => {
  const breath = creatureActions(GOBLIN)[2];
  const targets = [
    { id: 'a', name: 'Ana', saves: { dex: 2 }, conditions: [] },
    { id: 'b', name: 'Bo', saves: { dex: 5 }, conditions: [] },
    { id: 'c', name: 'Cy', saves: { dex: 9 }, conditions: ['paralyzed'] },
    { id: 'd', name: 'Imp', saves: { dex: 0 }, immune: [{ type: 'fire' }], conditions: [] },
  ];
  // Damage 3d6 = 4+5+6 = 15, then saves: Ana 5+2 fails, Bo 10+5 succeeds, Cy (no roll needed but rolled) auto-fails, Imp 2 fails.
  const r = resolveAttack({ action: breath, targets, random: dice(4, 5, 6, 5, 10, 18, 2) });
  assert.equal(r.damage[0].total, 15);
  assert.deepEqual(r.targets.map((t) => [t.name, t.save.success, t.amount]), [['Ana', false, 15], ['Bo', true, 7], ['Cy', false, 15], ['Imp', false, 0]]);
  assert.equal(r.targets[2].save.auto_fail, true);
});

test('resolveAttack: healing heals; a spell that just hits takes no roll to hit', () => {
  const heal = resolveAttack({ action: { name: 'Cure Wounds', kind: 'heal', damage: [{ dice: '1d8+3', type: 'healing' }] }, targets: [{ id: 'a', name: 'Ana' }], random: dice(5) });
  assert.deepEqual([heal.targets[0].heal, heal.targets[0].amount], [true, 8]);
  const missile = resolveAttack({ action: { name: 'Magic Missile', kind: 'auto', damage: [{ dice: '1d4+1', type: 'force' }], magical: true }, targets: [{ id: 'a', name: 'Ana' }], random: dice(3) });
  assert.equal(missile.targets[0].amount, 4);
});

test('concentrationDc is 10 or half the damage', () => {
  assert.equal(concentrationDc(7), 10);
  assert.equal(concentrationDc(31), 15);
});

test('attackRiders: Sneak Attack for a rogue with a finesse or ranged weapon, suggested with advantage or an ally near', () => {
  const { sheet, calc } = rogue();
  const actions = sheetActions(sheet, calc);
  const [sneak] = attackRiders(sheet, calc.values, actions.find((a) => a.name === 'Rapier'));
  assert.deepEqual([sneak.id, sneak.dice], ['sneak_attack', '3d6']);
  assert.equal(sneak.suggest('advantage', false), true);
  assert.equal(sneak.suggest('normal', true), true);
  assert.equal(sneak.suggest('disadvantage', true), false);
  assert.equal(sneak.suggest('normal', false), false);
  assert.deepEqual(attackRiders(sheet, calc.values, actions.find((a) => a.name === 'Fire breath')), []);
});

test('attackLogFor: players see only what they can see, never an enemy AC unless shown, nor its hit points', () => {
  const log = normalizeAttackLog([{
    id: 'atk001', at: '2026-10-21T10:00:00Z', by: 1, status: 'done',
    attacker: { id: 'gob001', name: 'Goblin', kind: 'enemy' }, action: { name: 'Fire Breath', kind: 'save', dice: '3d6' },
    targets: [
      { id: 'ana001', name: 'Ana', kind: 'pc', ac: 14, rolled: [{ notation: '3d6', type: 'fire', total: 12 }], amount: 12, before: { current: 20 }, after: { current: 8 } },
      { id: 'orc001', name: 'Orc', kind: 'enemy', ac: 13, rolled: [{ notation: '3d6', type: 'fire', total: 12 }], amount: 12, before: { current: 15 }, after: { current: 3 } },
      { id: 'hid001', name: 'Lurker', kind: 'enemy', ac: 16, rolled: [], amount: 12 },
    ],
  }]);
  const ana = attackLogFor(log, { dm: false, visible: new Set(['ana001', 'orc001']), own: new Set(['ana001']), showAc: false });
  assert.equal(ana[0].attacker.name, 'Someone you can’t see');
  assert.deepEqual(ana[0].targets.map((t) => t.name), ['Ana', 'Orc']);
  assert.equal(ana[0].targets[1].ac, null);
  assert.equal(ana[0].targets[1].after, null);
  assert.equal(ana[0].targets[1].rolled[0].notation, '');
  assert.deepEqual(ana[0].targets[0].after, { current: 8 });
  assert.equal(ana[0].action.dice, '');
  assert.equal(attackLogFor(log, { dm: false, visible: new Set(['ana001', 'orc001']), own: new Set(['ana001']), showAc: true })[0].targets[1].ac, 13);
  assert.deepEqual(attackLogFor(log, { dm: false, visible: new Set(), own: new Set(), showAc: false }), [], 'nothing they can see: no card');
  assert.equal(attackLogFor(log, { dm: true })[0].targets.length, 3);
});
