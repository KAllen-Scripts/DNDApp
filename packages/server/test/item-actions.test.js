/**
 * Using items from the sheet (routes/item-actions.js): Bag of Tricks rolls
 * its table on the server and the creature joins the sheet's companions and
 * the map; Wand of Fireballs spends charges for more damage; the 2024 bag's
 * creature vanishes at 0 hit points and at dawn; what the AI read is marked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM, terrain } from './helpers.js';
import { emptySheet } from '@dndapp/shared/sheet.js';
import { addToInventory } from '@dndapp/shared/gear.js';
import { knownItem } from '@dndapp/shared/item-actions.js';

const readOut = () => ({
  readable: true, kind: 'battle', name: 'Cave', description: 'A cave.', grid: { visible: true, columns: 20, rows: 14 },
  scale: { distance: null, unit: null, per: null }, notes: '',
});

async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function cave(t) {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { read: true, filename: 'cave.png', data: (await terrain(700, 490, { size: 35 })).toString('base64') } });
  const map = res.json();
  await until(() => t.maps.get(t.campaign.id, map.id).reading.status !== 'pending');
  const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
  await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
  const thorin = (await t.request('POST', `${base}/tokens`, { body: { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 50, y: 50 } })).json().token;
  return { map, base, thorin };
}

const withItems = (t, names, edition = '2014') => {
  let inventory = [];
  for (const name of names) inventory = addToInventory(inventory, { name, kind: 'magic' }, 1, { edition });
  t.sheets.save(t.campaign.id, t.sam.id, { ...emptySheet({ name: 'Thorin' }), inventory });
  return t.sheets.get(t.campaign.id, t.sam.id).sheet.inventory;
};
const use = (t, body, as) => t.request('POST', `/campaigns/${t.campaign.id}/sheet/gear/use`, { body, as: as ?? t.sam.token });

test('item actions: Bag of Tricks rolls its d8 table on the server; the creature joins the sheet with its stat block and appears on the map next to the character', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: () => readOut() }) });
  try {
    const { map, thorin } = await cave(t);
    const [bag] = withItems(t, ['Bag of Tricks (Gray)']);
    assert.equal(bag.actions[0].id, 'pull');
    assert.deepEqual(bag.charges, { max: 3, used: 0, recharge: 'all', when: 'dawn' });

    // Only the player whose sheet it is; the DM has none.
    assert.equal((await use(t, { id: bag.id, action: 'pull' }, t.dmToken)).statusCode, 403);
    assert.equal((await use(t, { id: 'nope', action: 'pull' })).statusCode, 404);

    const res = await use(t, { id: bag.id, action: 'pull' });
    assert.equal(res.statusCode, 200, res.body);
    const out = res.json();
    assert.equal(out.rolls[0].notation, '1d8');
    const row = knownItem('Bag of Tricks (Gray)').actions[0].table.find((r) => r.min === out.total);
    assert.deepEqual(out.summoned, [row.creature]);
    const c = out.sheet.companions[0];
    assert.equal(c.name, row.creature);
    assert.equal(c.form.name.toLowerCase(), row.creature.toLowerCase(), 'its stat block (the SRD)');
    assert.ok(c.form.hp_max > 1);
    assert.equal(c.kind, 'summon');
    assert.deepEqual(c.from, { kind: 'item', name: 'Bag of Tricks (Gray)', item_id: bag.id });
    assert.equal(c.vanishes, true);
    assert.equal(c.expires, '', '2014: no set duration');
    assert.equal(out.sheet.inventory[0].charges.used, 1);
    assert.equal(out.placed.map_id, map.id);
    const token = t.maps.get(t.campaign.id, map.id).tokens.find((x) => x.companion === c.id);
    assert.ok(token, 'on the map');
    assert.equal(token.follows, thorin.id);
    assert.ok(token.x > thorin.x && token.x <= thorin.x + 70, 'next to Thorin');

    // The roll is in the dice log, rolled by the server.
    const log = (await t.request('GET', `/campaigns/${t.campaign.id}/rolls`, { as: t.sam.token })).json();
    assert.ok(JSON.stringify(log).includes('Bag of Tricks (Gray): Pull out a fuzzy ball'));

    // Three a dawn: the fourth is refused.
    await use(t, { id: bag.id, action: 'pull' });
    await use(t, { id: bag.id, action: 'pull' });
    const fourth = await use(t, { id: bag.id, action: 'pull' });
    assert.equal(fourth.statusCode, 400);
    assert.match(fourth.json().error, /0 charges left \(they come back at dawn\)/);
  } finally {
    await t.cleanup();
  }
});

test('item actions: the 2024 bag\'s creature vanishes at 0 hit points on the map, and the rest at dawn on the campaign clock', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: () => readOut() }) });
  try {
    t.store.setSettings(t.campaign.id, { edition: '2024' });
    const { map, base } = await cave(t);
    const [bag] = withItems(t, ['Rust Bag of Tricks'], '2024');
    const one = (await use(t, { id: bag.id, action: 'pull' })).json();
    assert.equal(one.sheet.companions[0].expires, 'dawn');
    const two = (await use(t, { id: bag.id, action: 'pull' })).json();
    assert.equal(two.sheet.companions.length, 2);

    // Down to 0 on the map: gone from the sheet and the map.
    const first = one.sheet.companions[0];
    const token = t.maps.get(t.campaign.id, map.id).tokens.find((x) => x.companion === first.id);
    const hit = await t.request('PATCH', `${base}/tokens/${token.id}`, { body: { hp: { current: 0, max: first.hp.max } }, as: t.sam.token });
    assert.equal(hit.statusCode, 200, hit.body);
    assert.deepEqual(t.sheets.get(t.campaign.id, t.sam.id).sheet.companions.map((c) => c.id), [two.sheet.companions[1].id]);
    assert.ok(!t.maps.get(t.campaign.id, map.id).tokens.some((x) => x.companion === first.id));

    // A day passes: dawn, and the other one goes too.
    const clock = await t.request('POST', `/campaigns/${t.campaign.id}/clock`, { body: { add: 24 * 60, stop: false } });
    assert.equal(clock.statusCode, 200, clock.body);
    assert.ok(clock.json().notes.some((n) => n.kind === 'dawn'));
    assert.equal(t.sheets.get(t.campaign.id, t.sam.id).sheet.companions.length, 0);
    assert.ok(!t.maps.get(t.campaign.id, map.id).tokens.some((x) => x.kind === 'companion'));
  } finally {
    await t.cleanup();
  }
});

test('item actions: Wand of Fireballs spends a charge for 8d6 (DC 15), more for more damage, and the last charge may crumble it', async () => {
  const t = await setup();
  try {
    const [wand] = withItems(t, ['Wand of Fireballs']);
    assert.equal(wand.charges.max, 7);
    const one = (await use(t, { id: wand.id, action: 'fireball' })).json();
    assert.equal(one.notation, '8d6');
    assert.match(one.roll.label, /Wand of Fireballs: Fireball \(DC 15 Dexterity save\), damage/);
    assert.equal(one.sheet.inventory[0].charges.used, 1);
    const three = (await use(t, { id: wand.id, action: 'fireball', extra: 2 })).json();
    assert.equal(three.notation, '10d6', 'two extra charges: +2d6');
    assert.equal(three.sheet.inventory[0].charges.used, 4);
    const tooMany = await use(t, { id: wand.id, action: 'fireball', extra: 6 });
    assert.equal(tooMany.statusCode, 400, '3 left, 7 asked');
    const last = (await use(t, { id: wand.id, action: 'fireball', extra: 2 })).json();
    assert.equal(last.rolls.at(-1).notation, '1d20', 'the last charge: a d20 for crumbling');
    assert.equal(last.crumbled, last.rolls.at(-1).total === 1);
  } finally {
    await t.cleanup();
  }
});

test('item actions: an item the AI read on lookup brings its actions marked as the AI\'s', async () => {
  const llm = createFakeLLM({
    structured: (opts) => (opts.purpose?.startsWith('item') || opts.schema ? {
      found: true, name: 'Staff of Frost', kind: 'magic', rarity: 'very rare', attunement: true, price: '', weight_lb: 4,
      description: 'This staff has 10 charges. You can expend 1 or more of its charges to cast one of the following spells from it, using your spell save DC: cone of cold (5 charges), fog cloud (1 charge), ice storm (4 charges), or wall of ice (4 charges).',
      uses: { max: 10, recharge: '1d6+4', when: 'dawn' },
      actions: [{ name: 'Cone of Cold', kind: 'spell', charges: 5, needs: 'attuned', consumed: false, spell: 'Cone of Cold', spell_level: 5, save_dc: null, save_ability: 'con', attack_bonus: null, damage: '8d8 cold', extra_per_charge: '', max_extra_charges: 0, heal: '', summon_roll: '', summon_table: [], summon_creature: '', summon_count: '', lasts: '', vanishes_at_dawn: false, text: 'A 60-foot cone.' }],
    } : null),
  });
  const t = await setup({ llm });
  try {
    const res = await t.request('GET', `/campaigns/${t.campaign.id}/gear/lookup?name=${encodeURIComponent('Staff of Frost')}`, { as: t.sam.token });
    assert.equal(res.statusCode, 200, res.body);
    const { item } = res.json();
    assert.equal(item.actions[0].name, 'Cone of Cold');
    assert.equal(item.actions[0].source, 'ai');
    assert.equal(item.actions[0].damage, '8d8 cold');
    assert.deepEqual(item.charges, { max: 10, used: 0, recharge: '1d6+4', when: 'dawn' });
  } finally {
    await t.cleanup();
  }
});
