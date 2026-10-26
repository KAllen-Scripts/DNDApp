import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionProblem, actionSummary, damageWithExtra, itemActions, knownItem, normalizeActions, readItemActions } from '../src/item-actions.js';
import { expireAtDawn, passedDawn, setCompanionHp } from '../src/companions.js';
import { normalizeSheet } from '../src/sheet.js';
import { addToInventory, itemStats } from '../src/gear.js';

test('item actions: Bag of Tricks by any of its names, its d8 table per colour, and what 2024 changes', () => {
  for (const name of ['Bag of Tricks (Gray)', 'gray bag of tricks', 'Bag of Tricks, Grey', 'Bag of tricks']) assert.equal(knownItem(name).actions[0].table[0].creature, 'Weasel', name);
  const rust = knownItem('Rust Bag of Tricks').actions[0];
  assert.deepEqual(rust.table.map((r) => r.creature), ['Rat', 'Owl', 'Mastiff', 'Goat', 'Giant Goat', 'Giant Boar', 'Lion', 'Brown Bear']);
  assert.equal(rust.roll, '1d8');
  assert.equal(rust.expires, '', '2014: no duration');
  assert.equal(knownItem('Rust Bag of Tricks', '2024').actions[0].expires, 'dawn');
  assert.deepEqual(knownItem('Tan Bag of Tricks').charges, { max: 3, recharge: 'all', when: 'dawn' });
  assert.equal(knownItem('Tan Bag of Tricks').actions[0].table[7].creature, 'Tiger');
});

test('item actions: figurines, the Horn of Valhalla by edition, the Deck of Illusions and the fireball items', () => {
  const fly = knownItem('Figurine of Wondrous Power (Ebony Fly)').actions[0];
  assert.equal(fly.form.name, 'Giant Fly', 'its own stat block');
  assert.equal(knownItem('Golden Lions').actions[0].count, '2');
  assert.equal(knownItem('Figurine of Wondrous Power, Ivory Goats').actions.length, 3);
  assert.equal(knownItem('Iron Horn of Valhalla').actions[0].count, '5d4+5');
  assert.equal(knownItem('Iron Horn of Valhalla', '2024').actions[0].count, '5');
  const deck24 = knownItem('Deck of Illusions', '2024').actions[0];
  assert.deepEqual(deck24.table[0], { min: 1, max: 3, creature: 'Adult Red Dragon', count: '1', size: 'large' });
  assert.equal(deck24.table.at(-1).max, 100);
  assert.equal(knownItem('Deck of Illusions').actions[0].table.length, 34);
  const wand = knownItem('Wand of Fireballs');
  assert.deepEqual(wand.charges, { max: 7, recharge: '1d6+1', when: 'dawn' });
  assert.equal(wand.actions[0].dc, 15);
  assert.equal(wand.actions[0].crumble, true);
  assert.equal(knownItem('Wand of Fireballs', '2024').actions[0].max_extra, 2, '2024: at most 3 charges');
  assert.equal(knownItem('Necklace of Fireballs').charges.max, 6);
  assert.equal(damageWithExtra(wand.actions[0], 2), '10d6 fire');
  assert.equal(damageWithExtra(wand.actions[0], 0), '8d6 fire');
  assert.equal(knownItem('Longsword'), null);
});

test("item actions: read from a description's usual wording; never from 'one of the following'", () => {
  const read = readItemActions('This wand has 7 charges. While holding it, you can use an action to expend 1 of its charges to cast the lightning bolt spell (save DC 15) from it.');
  assert.deepEqual(read.map((a) => [a.name, a.cost, a.dc, a.source]), [['Lightning Bolt', 1, 15, 'text']]);
  assert.deepEqual(readItemActions('You can expend 1 or more of its charges to cast one of the following spells from it'), []);
  assert.equal(itemActions({ name: 'Wand of Fireballs', text: 'anything' })[0].source, 'rules', 'the known rules win');
  const st = itemStats({ name: 'Bag of Tricks (Gray)', kind: 'magic' });
  assert.equal(st.actions[0].rule, 'bag-of-tricks:gray');
  assert.deepEqual(st.charges, { max: 3, recharge: 'all', when: 'dawn', used: 0 });
  // A DM's item that the AI read: its actions come along, unless the app knows the item.
  const inv = addToInventory([], { name: 'Staff of Frost', kind: 'magic', actions: [{ name: 'Cone of Cold', kind: 'spell', cost: 5, source: 'ai' }], uses: { max: 10, recharge: '1d6+4', when: 'dawn' } });
  assert.equal(inv[0].actions[0].source, 'ai');
  assert.equal(inv[0].charges.max, 10);
  assert.equal(addToInventory([], { name: 'Wand of Fireballs', actions: [{ name: 'Boom', source: 'ai' }] })[0].actions[0].source, 'rules');
});

test('item actions: what stops one (attunement, equipped, charges), and a summary', () => {
  const [a] = normalizeActions([{ name: 'Fireball', kind: 'spell', cost: 1, damage: '8d6 fire', dc: 15, save: 'dex', extra: '1d6' }]);
  const line = { name: 'Wand', attunement: true, attuned: false, equipped: false, charges: { max: 7, used: 7, when: 'dawn' } };
  assert.equal(actionProblem(line, a), 'Attune to Wand first.');
  assert.equal(actionProblem({ ...line, attuned: true }, a), 'Wand has 0 charges left (they come back at dawn).');
  assert.equal(actionProblem({ ...line, attuned: true, charges: { max: 7, used: 0 } }, a), '');
  assert.equal(actionProblem({ name: 'Cloak', equipped: false }, { ...a, cost: 0, needs: 'equipped' }), 'Equip Cloak first.');
  assert.equal(actionProblem({ name: 'Stick' }, a), 'Stick has no charges set: add them under Details.');
  assert.equal(actionSummary(a), '1 charge · Fireball, DC 15 Dex, 8d6 fire (+1d6 a charge more)');
});

test('item actions: summons that vanish at 0 hit points, and at dawn on the clock', () => {
  const sheet = normalizeSheet({ companions: [{ id: 'a', name: 'Boar', vanishes: true, expires: 'dawn', form: { hp_max: 11 } }, { id: 'b', name: 'Rex', form: { hp_max: 11 } }] });
  const hit = setCompanionHp(sheet, 'a', 0);
  assert.equal(hit.gone, true);
  assert.deepEqual(hit.sheet.companions.map((c) => c.id), ['b']);
  assert.equal(setCompanionHp(sheet, 'b', 0).gone, false, 'a pet stays at 0');
  assert.deepEqual(expireAtDawn(sheet).gone, ['Boar']);
  assert.equal(passedDawn(8 * 60, 20 * 60), false, 'the same day');
  assert.equal(passedDawn(20 * 60, 30 * 60), true, 'past 6 the next morning');
  assert.equal(passedDawn(30 * 60, 20 * 60), false, 'going back');
});
