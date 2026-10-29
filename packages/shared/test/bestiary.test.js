import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOf, typeFromStats, creatureType, challengeValue, challengeLabel } from '../src/bestiary.js';

test('bestiary: a creature saved before people had their own list is a person when friendly, else a creature', () => {
  assert.equal(groupOf({ kind: 'npc' }), 'person');
  assert.equal(groupOf({ kind: 'enemy' }), 'creature');
  assert.equal(groupOf({ kind: 'npc', group: 'creature' }), 'creature', 'the DM chose');
  assert.equal(groupOf({ kind: 'enemy', group: 'person' }), 'person');
});

test("bestiary: the type comes from the stat block's size line, unless the DM gave one", () => {
  assert.equal(typeFromStats('*Medium undead, neutral evil*\n**Armor Class** 11'), 'undead');
  assert.equal(typeFromStats('**Goblin** Small humanoid (goblinoid), neutral evil'), 'humanoid');
  assert.equal(typeFromStats('*Medium swarm of Tiny beasts, unaligned*'), 'beast');
  assert.equal(typeFromStats('*Medium or Small humanoid*'), 'humanoid');
  assert.equal(typeFromStats('Just some notes'), '');
  assert.equal(typeFromStats(''), '');
  assert.equal(creatureType({ type: 'Undead', stats: { text: 'Large beast' } }), 'undead');
  assert.equal(creatureType({ stats: { text: 'Large beast' } }), 'beast');
  assert.equal(creatureType({}), '');
});

test('bestiary: challenge ratings sort as numbers and show as written', () => {
  assert.equal(challengeValue('1/4 (50 XP)'), 0.25);
  assert.equal(challengeValue('1/2'), 0.5);
  assert.equal(challengeValue('2 (450 XP)'), 2);
  assert.equal(challengeValue('—'), null);
  assert.equal(challengeValue(undefined), null);
  assert.equal(challengeLabel('1/4 (50 XP)'), '1/4');
  assert.equal(challengeLabel(null), '');
});
