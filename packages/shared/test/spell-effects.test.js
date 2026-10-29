import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makesDifficult, endMapSpell, endConcentration, expireMapSpells, mapSpellsFor, spellConditions, spellLasting, spellTargets } from '../src/spell-effects.js';
import { resolveAttack, rollToEnd, sheetActions } from '../src/attacks.js';
import { computeSheet, normalizeSheet } from '../src/sheet.js';
import { isDifficult, normalizeMap, spellArea } from '../src/map.js';

const ENTANGLE = {
  name: 'Entangle', level: 1, range: '90 feet', duration: 'Concentration, up to 1 minute', concentration: true,
  description: 'Grasping weeds and vines sprout from the ground in a 20-foot square starting from a point within range. For the duration, these plants turn the ground in the area into difficult terrain. A creature in the area when you cast the spell must succeed on a Strength saving throw or be restrained by the entangling plants until the spell ends. A creature restrained by the plants can use its action to make a Strength check against your spell save DC.',
};
const BLESS = { name: 'Bless', level: 1, range: '30 feet', duration: 'Concentration, up to 1 minute', description: 'You bless up to three creatures of your choice within range.', higher_levels: 'you can target one additional creature for each slot level above 1st.' };

test('spellConditions reads what a spell does to whoever it catches, not what it only mentions', () => {
  assert.deepEqual(spellConditions(ENTANGLE.description), ['restrained']);
  assert.deepEqual(spellConditions('must succeed on a Wisdom saving throw or be paralyzed for the duration.'), ['paralyzed']);
  assert.deepEqual(spellConditions('On a failed save, the creature becomes charmed for the duration. While charmed by this spell, the creature is incapacitated'), ['charmed', 'incapacitated']);
  assert.deepEqual(spellConditions('must make a Wisdom saving throw or be blinded or deafened'), ['blinded'], 'the caster picks one: the first');
  assert.deepEqual(spellConditions('The target falls prone, becoming incapacitated'), ['incapacitated', 'prone']);
  assert.deepEqual(spellConditions('2024: Failure: The target has the Restrained condition.'), ['restrained']);
  assert.deepEqual(spellConditions('A creature you touch becomes invisible until the spell ends.'), ['invisible']);
  assert.deepEqual(spellConditions("For the duration, the target can't be charmed or frightened."), []);
});

test('spellLasting, makesDifficult, spellTargets and the square area', () => {
  assert.deepEqual(spellLasting(ENTANGLE), { concentration: true, rounds: 10 });
  assert.deepEqual(spellLasting({ duration: 'Instantaneous' }), { concentration: false, rounds: 0 });
  assert.deepEqual(spellLasting({ duration: '1 round' }), { concentration: false, rounds: 1 });
  assert.deepEqual(spellLasting({ duration: '8 hours' }), { concentration: false, rounds: 4800 });
  assert.deepEqual(spellLasting({ duration: 'Until dispelled' }), { concentration: false, rounds: null });
  assert.equal(makesDifficult(ENTANGLE.description), true);
  assert.equal(makesDifficult('The webs are difficult terrain and lightly obscure their area.'), true);
  assert.equal(makesDifficult('You ignore difficult terrain.'), false);
  assert.deepEqual(spellTargets(BLESS), { max: 3, self: false });
  assert.deepEqual(spellTargets(BLESS, 3), { max: 5, self: false });
  assert.deepEqual(spellTargets({ range: 'Self', description: 'You teleport' }), { max: 1, self: true });
  assert.deepEqual(spellArea(ENTANGLE), { shape: 'cube', size: 20 });
});

test('regression: spells with nothing to roll are offered on the map (Bless), and Entangle has its area and restrains', () => {
  // Before: sheetActions left out spells with no attack, save or damage, and Entangle's "20-foot square" had no area.
  const sheet = normalizeSheet({ classes: [{ name: 'Druid', subclass: '', level: 3 }], abilities: { wis: 16 }, spells: [ENTANGLE, BLESS] });
  const list = sheetActions(sheet, computeSheet(sheet));
  const ent = list.find((x) => x.name === 'Entangle');
  const bless = list.find((x) => x.name === 'Bless');
  assert.ok(bless, 'Bless is offered');
  assert.deepEqual([bless.kind, bless.targets_max, bless.lasting.concentration], ['effect', 3, true]);
  assert.deepEqual([ent.kind, ent.save, ent.area, ent.conditions, ent.difficult, ent.check], ['save', 'str', { shape: 'cube', size: 20 }, ['restrained'], true, 'str']);
});

test('resolveAttack: a failed save gives the spell\'s conditions; a spell with no roll gives them to everyone', () => {
  const dice = [5, 15];
  const random = () => dice.shift();
  const save = resolveAttack({ action: { name: 'Entangle', kind: 'save', save: 'str', dc: 13, damage: [], conditions: ['restrained'] }, targets: [{ id: 'aaaaaa', name: 'A', saves: { str: 0 }, conditions: [] }, { id: 'bbbbbb', name: 'B', saves: { str: 0 }, conditions: [] }], random });
  assert.deepEqual(save.targets.map((x) => x.conditions ?? null), [['restrained'], null]);
  const fx = resolveAttack({ action: { name: 'Invisibility', kind: 'effect', damage: [], conditions: ['invisible'] }, targets: [{ id: 'aaaaaa', name: 'A', conditions: [] }], random });
  assert.deepEqual([fx.targets[0].effect, fx.targets[0].conditions, fx.rolls.length], [true, ['invisible'], 0]);
  // Breaking free with a Strength check uses the ability, not the save.
  const r = rollToEnd({ target: { name: 'A', conditions: [], saves: { str: 5 }, mods: { str: -1 } }, ability: 'str', check: 'str', dc: 13, random: () => 14 });
  assert.deepEqual([r.kind, r.total, r.success], ['check', 13, true]);
});

test('spells in play end with their area and conditions (kept when another spell gives the same), and run out in a fight', () => {
  const m = normalizeMap({
    image: { width: 700, height: 490 }, grid: { size: 35, x: 0, y: 0 },
    tokens: [{ id: 'caster', kind: 'npc', name: 'C', x: 10, y: 10, conditions: ['concentrating'] }, { id: 'target', kind: 'enemy', name: 'T', x: 160, y: 160, conditions: ['restrained'] }],
    templates: [{ id: 'area01', shape: 'cube', x: 140, y: 140, size: 20, spell: 'spell1', difficult: true }],
    combat: { round: 3, turn: 'target', entries: [{ id: 'caster', init: 20 }, { id: 'target', init: 5 }] },
    spells: [
      { id: 'spell1', name: 'Entangle', caster: 'caster', concentration: true, template: 'area01', affected: [{ id: 'target', conditions: ['restrained'] }], ends: { round: 4, turn: 'caster' } },
      { id: 'spell2', name: 'Web', caster: 'other1', template: null, affected: [{ id: 'target', conditions: ['restrained'] }] },
    ],
  });
  assert.equal(isDifficult(m, 150, 150), true);
  assert.deepEqual(mapSpellsFor(m.spells, { dm: false, visible: new Set(['target']), own: new Set(), templates: [] }).map((x) => [x.caster_name, x.dc, x.template]), [['Someone you can’t see', null, null], ['Someone you can’t see', null, null]]);
  // Round 4 starts with the caster's turn: Entangle is up; Web still holds the target.
  Object.assign(m.combat, { round: 4, turn: 'caster' });
  assert.deepEqual(expireMapSpells(m).map((x) => x.name), ['Entangle']);
  assert.deepEqual([m.templates, m.tokens[0].conditions, m.tokens[1].conditions], [[], [], ['restrained']]);
  assert.equal(isDifficult(m, 150, 150), false);
  endMapSpell(m, 'spell2');
  assert.deepEqual(m.tokens[1].conditions, []);
  assert.deepEqual(endConcentration(m, 'caster'), []);
});
