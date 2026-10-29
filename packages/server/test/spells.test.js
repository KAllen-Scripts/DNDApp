/**
 * Spells that aren't attacks, cast from the map (owner, 2026-10-28: "no way to cast spells such as 'Entangle'…
 * how do such spells interact with the map?"): conditions on a failed save, the spell's area left in play as
 * difficult terrain, concentration (a new concentration spell ends the old one), breaking free, rolling it
 * again for who's in the area, ending it, Undo, durations in a fight, and what players see of it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDifficult } from '@dndapp/shared/map.js';
import { setup, createFakeLLM, terrain } from './helpers.js';

const readOut = { readable: true, kind: 'battle', name: 'Grove', description: '', grid: { visible: true, columns: 20, rows: 14 }, scale: { distance: null, unit: null, per: null }, notes: '' };

function scripted() {
  const queue = [];
  return { random: (sides) => Math.min(sides, queue.length ? queue.shift() : 10), next: (...n) => queue.push(...n) };
}

async function table() {
  const dice = scripted();
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }), random: dice.random });
  const png = await terrain(700, 490, { size: 35 });
  const id = (await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { read: true, filename: 'grove.png', data: png.toString('base64') } })).json().id;
  while (t.maps.get(t.campaign.id, id).reading.status === 'pending') await new Promise((r) => setTimeout(r, 10));
  const base = `/campaigns/${t.campaign.id}/maps/${id}`;
  await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } } });
  const add = async (body) => (await t.request('POST', `${base}/tokens`, { body })).json().token;
  const sheet = async (who, changes) => {
    const got = (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: who.token })).json();
    const r = await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: who.token, body: { sheet: { ...got.sheet, ...changes }, version: got.version } });
    assert.equal(r.statusCode, 200, r.body);
  };
  const map = () => t.maps.get(t.campaign.id, id);
  const token = (tid) => map().tokens.find((x) => x.id === tid);
  return { t, dice, base, add, sheet, map, token, attack: (body, as) => t.request('POST', `${base}/attack`, { body, as }), spell: (sid, body, as) => t.request('POST', `${base}/spells/${sid}`, { body, as }) };
}

const GOBLIN = `**Goblin**
**Armor Class** 15
**Saving Throws** Dex +4
| STR | DEX | CON | INT | WIS | CHA |
|---|---|---|---|---|---|
| 8 (-1) | 14 (+2) | 10 (+0) | 10 (+0) | 8 (-1) | 8 (-1) |`;

const ENTANGLE = {
  name: 'Entangle', level: 1, range: '90 feet', duration: 'Concentration, up to 1 minute', concentration: true,
  description: 'Grasping weeds and vines sprout from the ground in a 20-foot square starting from a point within range. For the duration, these plants turn the ground in the area into difficult terrain. A creature in the area when you cast the spell must succeed on a Strength saving throw or be restrained by the entangling plants until the spell ends. A creature restrained by the plants can use its action to make a Strength check against your spell save DC. On a success, it frees itself.',
};
const BLESS = {
  name: 'Bless', level: 1, range: '30 feet', duration: 'Concentration, up to 1 minute', concentration: true,
  description: 'You bless up to three creatures of your choice within range. Whenever a target makes an attack roll or a saving throw before the spell ends, the target can roll a d4 and add the number rolled to the attack roll or saving throw.',
  higher_levels: 'When you cast this spell using a spell slot of 2nd level or higher, you can target one additional creature for each slot level above 1st.',
};
const DRUID = { classes: [{ name: 'Druid', subclass: '', level: 3 }], abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 10 }, spells: [ENTANGLE, BLESS] };

test('Entangle from the map: a failed save restrains, its area stays as difficult terrain, the druid concentrates; break free, roll again, a new concentration spell ends it', async () => {
  const { t, dice, base, add, sheet, map, token, attack, spell } = await table();
  try {
    await sheet(t.alex, DRUID);
    await sheet(t.sam, { classes: [{ name: 'Fighter', subclass: '', level: 3 }] });
    const ivy = await add({ kind: 'pc', name: 'Lyra', user_id: t.alex.id, x: 437.5, y: 437.5 });
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 402.5, y: 437.5 });
    const goblin = await add({ kind: 'enemy', name: 'Goblin', x: 157.5, y: 157.5, stats: { text: GOBLIN } });
    const orc = await add({ kind: 'enemy', name: 'Orc', x: 192.5, y: 192.5, stats: { text: GOBLIN } });

    // Entangle is offered, with what it does.
    const acts = (await t.request('GET', `${base}/tokens/${ivy.id}/actions`, { as: t.alex.token })).json();
    const ent = acts.actions.find((x) => x.name === 'Entangle');
    assert.deepEqual([ent.kind, ent.save, ent.dc, ent.area, ent.conditions, ent.difficult], ['save', 'str', 13, { shape: 'cube', size: 20 }, ['restrained'], true]);
    assert.deepEqual(ent.lasting, { concentration: true, rounds: 10 });
    const bless = acts.actions.find((x) => x.name === 'Bless');
    assert.deepEqual([bless.kind, bless.targets_max], ['effect', 3]);

    // The square over both; the goblin fails (5 - 1), the orc saves (18 - 1).
    const tpl = (await t.request('POST', `${base}/templates`, { as: t.alex.token, body: { shape: 'cube', x: 140, y: 140, angle: 0, size: 20, label: 'Entangle' } })).json().template;
    dice.next(5, 18);
    const res = await attack({ attacker: ivy.id, action: ent.id, template: tpl.id }, t.alex.token);
    assert.equal(res.statusCode, 200, res.body);
    const card = res.json().attack;
    assert.deepEqual(card.targets.map((x) => [x.name, x.save.success, x.conditions ?? []]), [['Goblin', false, ['restrained']], ['Orc', true, []]]);
    assert.deepEqual(card.action.lasting, { concentration: true, rounds: 10, duration: 'Concentration, up to 1 minute' });
    assert.deepEqual(token(goblin.id).conditions, ['restrained']);
    assert.deepEqual(token(orc.id).conditions, []);
    assert.deepEqual(token(ivy.id).conditions, ['concentrating']);
    const [sp] = map().spells;
    assert.deepEqual([sp.name, sp.caster, sp.template, sp.dc, sp.save, sp.check, sp.concentration], ['Entangle', ivy.id, tpl.id, 13, 'str', 'str', true]);
    assert.deepEqual(sp.affected, [{ id: goblin.id, conditions: ['restrained'] }]);
    const area = map().templates.find((x) => x.id === tpl.id);
    assert.deepEqual([area.spell, area.difficult], [sp.id, true]);
    assert.equal(isDifficult(map(), 210, 210), true, 'the area is difficult terrain');
    assert.equal(isDifficult(map(), 400, 400), false);

    // Sam sees it in play (not its DC); he can't end it or roll for the goblin.
    const seen = (await t.request('GET', base, { as: t.sam.token })).json().spells;
    assert.deepEqual(seen.map((x) => [x.name, x.caster_name, x.dc]), [['Entangle', 'Lyra', null]]);
    assert.equal((await spell(sp.id, { do: 'end' }, t.sam.token)).statusCode, 403);
    assert.equal((await spell(sp.id, { do: 'break', target: goblin.id }, t.sam.token)).statusCode, 403);

    // The goblin uses its action: a Strength check (20 - 1 = 19 against 13), free.
    dice.next(20);
    const broke = await spell(sp.id, { do: 'break', target: goblin.id });
    assert.equal(broke.statusCode, 200, broke.body);
    assert.deepEqual([broke.json().attack.targets[0].save.check, broke.json().attack.targets[0].save.success], [true, true]);
    assert.deepEqual(token(goblin.id).conditions, []);
    assert.deepEqual(map().spells[0].affected, [], 'the area stays: Entangle goes on');

    // Rolled again for who's in it (both fail now): no slot spent.
    const slotsBefore = (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.alex.token })).json().sheet.spellcasting.slots_used[1];
    dice.next(2, 3);
    const again = await spell(sp.id, { do: 'again' }, t.alex.token);
    assert.equal(again.statusCode, 200, again.body);
    assert.equal(again.json().attack.action.again, true);
    assert.deepEqual(token(goblin.id).conditions, ['restrained']);
    assert.deepEqual(token(orc.id).conditions, ['restrained']);
    assert.equal(map().spells[0].affected.length, 2);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.alex.token })).json().sheet.spellcasting.slots_used[1], slotsBefore);

    // Bless on three is fine, on four isn't; Thorin and Ivy: Entangle ends (concentration), freeing both.
    assert.equal((await attack({ attacker: ivy.id, action: bless.id, targets: [ivy.id, thorin.id, goblin.id, orc.id] }, t.alex.token)).statusCode, 400);
    const b = await attack({ attacker: ivy.id, action: bless.id, targets: [ivy.id, thorin.id] }, t.alex.token);
    assert.equal(b.statusCode, 200, b.body);
    assert.deepEqual(b.json().attack.ended, ['Entangle']);
    assert.deepEqual(b.json().attack.targets.map((x) => x.effect), [true, true]);
    assert.deepEqual([token(goblin.id).conditions, token(orc.id).conditions], [[], []]);
    assert.equal(map().templates.some((x) => x.id === tpl.id), false, 'its area went with it');
    assert.deepEqual(map().spells.map((x) => [x.name, x.affected.length]), [['Bless', 2]]);
    assert.deepEqual(token(ivy.id).conditions, ['concentrating']);

    // Taking Concentrating off Ivy's token ends Bless.
    await t.request('PATCH', `${base}/tokens/${ivy.id}`, { as: t.alex.token, body: { conditions: [] } });
    assert.deepEqual(map().spells, []);
  } finally {
    await t.cleanup();
  }
});

test('a spell in play: the caster ends it, the DM undoes it, and in a fight it ends when its rounds are up', async () => {
  const { t, dice, base, add, sheet, map, token, attack, spell } = await table();
  try {
    await sheet(t.alex, DRUID);
    const ivy = await add({ kind: 'pc', name: 'Lyra', user_id: t.alex.id, x: 437.5, y: 437.5 });
    const goblin = await add({ kind: 'enemy', name: 'Goblin', x: 157.5, y: 157.5, stats: { text: GOBLIN } });
    const ent = 'spell:' + (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.alex.token })).json().sheet.spells[0].id;
    const place = async () => (await t.request('POST', `${base}/templates`, { as: t.alex.token, body: { shape: 'cube', x: 140, y: 140, angle: 0, size: 20 } })).json().template;

    // Ended by the caster: the area and the condition go, Ivy stops concentrating.
    dice.next(1);
    await attack({ attacker: ivy.id, action: ent, template: (await place()).id }, t.alex.token);
    const sp = map().spells[0];
    const ended = await spell(sp.id, { do: 'end' }, t.alex.token);
    assert.equal(ended.statusCode, 200, ended.body);
    assert.deepEqual([map().spells, map().templates, token(goblin.id).conditions, token(ivy.id).conditions], [[], [], [], []]);

    // Undone by the DM: the same, and the slot is back.
    dice.next(1);
    const card = (await attack({ attacker: ivy.id, action: ent, template: (await place()).id }, t.alex.token)).json().attack;
    assert.deepEqual(token(goblin.id).conditions, ['restrained']);
    const undo = await t.request('POST', `${base}/attacks/${card.id}`, { body: { do: 'undo' } });
    assert.equal(undo.statusCode, 200, undo.body);
    assert.deepEqual([map().spells, map().templates, token(goblin.id).conditions, token(ivy.id).conditions], [[], [], [], []]);

    // In a fight: Ivy goes first (20), the goblin next. Entangle lasts 10 rounds: it ends as Ivy's turn comes round in round 11.
    await t.request('POST', `${base}/combat`, { body: { action: 'start' } });
    await t.request('POST', `${base}/combat`, { body: { action: 'set', id: ivy.id, init: 20 } });
    await t.request('POST', `${base}/combat`, { body: { action: 'set', id: goblin.id, init: 5 } });
    await t.request('POST', `${base}/combat`, { body: { action: 'next' } });
    dice.next(1);
    await attack({ attacker: ivy.id, action: ent, template: (await place()).id }, t.alex.token);
    assert.deepEqual(map().spells[0].ends, { round: 11, turn: ivy.id });
    for (let i = 0; i < 19; i++) await t.request('POST', `${base}/combat`, { body: { action: 'next' } });
    assert.equal(map().spells.length, 1, 'round 10, the goblin\'s turn: still going');
    await t.request('POST', `${base}/combat`, { body: { action: 'next' } });
    assert.deepEqual([map().combat.round, map().spells, token(goblin.id).conditions], [11, [], []]);
  } finally {
    await t.cleanup();
  }
});
