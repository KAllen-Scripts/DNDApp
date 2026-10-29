/**
 * Level up: players level their own character up (when they're ready, or once the DM gives them a level, as
 * the campaign's setting says); the server rolls rolled hit points; the DM sees levels and gives them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

const THORIN = { name: 'Thorin', classes: [{ name: 'Fighter', subclass: '', level: 3 }], abilities: { str: 16, dex: 12, con: 14, int: 12, wis: 10, cha: 8 }, hp: { current: 20 } };

test('a player levels up: average or rolled hit points, a subclass and an ASI; the DM-only setting needs a level given first', async () => {
  const t = await setup();
  try {
    const cid = t.campaign.id;
    assert.equal((await t.request('PUT', `/campaigns/${cid}/sheet`, { as: t.sam.token, body: { sheet: THORIN, version: 0 } })).statusCode, 200);
    const up = (body) => t.request('POST', `/campaigns/${cid}/sheet/level-up`, { as: t.sam.token, body });

    // Players level up when they're ready (the default).
    let res = await up({ class: 0, hp: 'average', asi: { str: 2 } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().sheet.classes[0].level, 4);
    assert.equal(res.json().sheet.abilities.str, 18);
    assert.equal(res.json().gained, 8);
    assert.equal(res.json().sheet.hp.current, 28);

    // Rolled: the server rolls the hit die and shares it like any roll.
    res = await up({ new_class: 'Barbarian', hp: 'roll' });
    assert.equal(res.statusCode, 200, res.body);
    const r = res.json();
    assert.equal(r.notation, '1d12');
    assert.equal(r.roll.label, 'Hit points for a new level (d12)');
    assert.equal(r.gained, r.total + 2);
    assert.deepEqual(r.sheet.level_log.map((e) => [e.class, e.level, e.hp]), [['fighter', 4, null], ['barbarian', 1, r.total]]);
    // A choice that can't be taken is refused before anything is rolled.
    const rolls = (await t.request('GET', `/campaigns/${cid}/rolls`, { as: t.sam.token })).json().rolls.length;
    assert.match((await up({ class: 0, hp: 'roll', asi: { str: 2, dex: 2 } })).json().error, /2 points in all/);
    assert.equal((await t.request('GET', `/campaigns/${cid}/rolls`, { as: t.sam.token })).json().rolls.length, rolls);
    // The DM has no character to level up.
    assert.equal((await t.request('POST', `/campaigns/${cid}/sheet/level-up`, { body: { class: 0 } })).statusCode, 403);

    // The DM switches to giving levels: Sam can't until given one.
    assert.equal((await t.request('PATCH', `/campaigns/${cid}/settings`, { body: { level_up: 'dm' } })).json().level_up, 'dm');
    assert.equal((await up({ class: 0 })).statusCode, 403);
    // A player can't give themselves one by saving the sheet.
    const mine = (await t.request('GET', `/campaigns/${cid}/sheet`, { as: t.sam.token })).json();
    await t.request('PUT', `/campaigns/${cid}/sheet`, { as: t.sam.token, body: { sheet: { ...mine.sheet, levels_granted: 3 }, version: mine.version } });
    assert.equal((await t.request('GET', `/campaigns/${cid}/sheet`, { as: t.sam.token })).json().sheet.levels_granted, 0);

    // The DM gives everyone a level; Alex has no sheet yet, so is left out.
    res = await t.request('POST', `/campaigns/${cid}/levels/grant`, { body: { to: 'everyone' } });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json().skipped, [t.alex.id]);
    const sam = res.json().players.find((p) => p.id === t.sam.id);
    assert.equal(sam.level, 5);
    assert.equal(sam.granted, 1);
    assert.equal(sam.classes, 'Fighter 4 / Barbarian 1');
    // Players can't see or give levels.
    assert.equal((await t.request('GET', `/campaigns/${cid}/levels`, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('POST', `/campaigns/${cid}/levels/grant`, { as: t.sam.token, body: {} })).statusCode, 403);

    res = await up({ class: 0 });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().sheet.levels_granted, 0);
    assert.equal((await up({ class: 0 })).statusCode, 403);

    // Given and taken back.
    await t.request('POST', `/campaigns/${cid}/levels/grant`, { body: { to: [t.sam.id] } });
    res = await t.request('POST', `/campaigns/${cid}/levels/grant`, { body: { to: [t.sam.id], take: true } });
    assert.equal(res.json().players.find((p) => p.id === t.sam.id).granted, 0);
  } finally {
    await t.cleanup();
  }
});
