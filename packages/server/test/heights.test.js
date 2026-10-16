/**
 * Height on maps (owner, 2026-10-15): the DM's raised areas and tokens'
 * heights decide which tokens a player gets, worked out on the server.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM, terrain } from './helpers.js';

const readOut = { readable: true, kind: 'battle', name: 'Courtyard', description: '', grid: { visible: true, columns: 20, rows: 14 }, scale: { distance: 5, unit: 'ft', per: 'square' }, notes: '' };

test('raised areas: players see onto a roof but not past it; tall creatures over it; the DM sets them', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }) });
  try {
    const png = await terrain(700, 490, { size: 35 });
    const id = (await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'yard.png', data: png.toString('base64') } })).json().id;
    while (t.maps.get(t.campaign.id, id).reading.status === 'pending') await new Promise((r) => setTimeout(r, 10));
    const base = `/campaigns/${t.campaign.id}/maps/${id}`;
    // 35 px squares of 5 ft: 7 px a foot.
    await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } } });
    const add = async (body) => (await t.request('POST', `${base}/tokens`, { body })).json().token;
    const sam = await add({ kind: 'pc', name: 'Sam', user_id: t.sam.id, x: 52.5, y: 227.5 });
    // A 10 ft hall from x 280 to 420 (20 ft across); Sam is 32 ft from its near side.
    await add({ kind: 'enemy', name: 'Archer', x: 297.5, y: 227.5 }); // on the roof, near its edge (filled in once the roof exists)
    await add({ kind: 'enemy', name: 'Behind', x: 507.5, y: 227.5 }); // on the ground past the hall
    const giant = await add({ kind: 'enemy', name: 'Giant', x: 612.5, y: 227.5, size: 3 }); // 20 ft, further past
    const seen = async () => (await t.request('GET', base, { as: t.sam.token })).json().tokens.map((x) => x.name).sort();
    await t.request('PATCH', `${base}/fog`, { body: { enabled: true, sight: true } });
    assert.deepEqual(await seen(), ['Archer', 'Behind', 'Giant', 'Sam'], 'flat: no walls, all in sight');

    // Only the DM raises areas.
    const hall = { points: [[280, 0], [420, 0], [420, 490], [280, 490]], height: 10 };
    assert.equal((await t.request('PATCH', `${base}/raised`, { as: t.sam.token, body: { add: hall } })).statusCode, 403);
    const dm = (await t.request('PATCH', `${base}/raised`, { body: { add: hall } })).json();
    assert.equal(dm.raised.length, 1);
    assert.equal(dm.raised[0].height, 10);
    // The archer stands on the roof by its edge; the one behind the hall is out of sight; the 20 ft giant's head shows over it.
    assert.deepEqual(await seen(), ['Archer', 'Giant', 'Sam']);
    const player = (await t.request('GET', base, { as: t.sam.token })).json();
    assert.deepEqual(player.raised, [{ points: hall.points, height: 10 }], 'their page needs the raised areas for the fog');

    // Sam flies up 25 ft (a player sets their own token's height above the ground): over the hall.
    await t.request('PATCH', `${base}/tokens/${sam.id}`, { as: t.sam.token, body: { elevation: 25 } });
    assert.deepEqual(await seen(), ['Archer', 'Behind', 'Giant', 'Sam']);
    await t.request('PATCH', `${base}/tokens/${sam.id}`, { as: t.sam.token, body: { elevation: 0 } });

    // A higher roof hides the giant too; the DM changes the height of an area by its id.
    const raisedId = dm.raised[0].id;
    await t.request('PATCH', `${base}/raised`, { body: { set: { id: raisedId, height: 40 } } });
    assert.deepEqual(await seen(), ['Archer', 'Sam']);
    // The DM's reveal shows whatever the heights.
    await t.request('PATCH', `${base}/fog`, { body: { add: { op: 'reveal', x: 595, y: 210, w: 35, h: 35 } } });
    assert.deepEqual(await seen(), ['Archer', 'Giant', 'Sam']);
    // A token set shorter by hand: the DM can make the giant 6 ft.
    await t.request('PATCH', `${base}/fog`, { body: { add: { op: 'cover', x: 595, y: 210, w: 35, h: 35 } } });
    await t.request('PATCH', `${base}/raised`, { body: { set: { id: raisedId, height: 10 } } });
    await t.request('PATCH', `${base}/tokens/${giant.id}`, { body: { height: 6 } });
    assert.deepEqual(await seen(), ['Archer', 'Sam']);
    // A player can't change someone else's token's height.
    assert.equal((await t.request('PATCH', `${base}/tokens/${giant.id}`, { as: t.sam.token, body: { height: 30 } })).statusCode, 404, 'not one they can see');

    // Removed: everyone in sight again.
    assert.deepEqual((await t.request('PATCH', `${base}/raised`, { body: { remove: raisedId } })).json().raised, []);
    assert.deepEqual(await seen(), ['Archer', 'Behind', 'Giant', 'Sam']);
    assert.equal((await t.request('PATCH', `${base}/raised`, { body: { remove: raisedId } })).statusCode, 404);
  } finally {
    await t.cleanup();
  }
});

test('a player character is as tall as the Height on its sheet', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }) });
  try {
    const png = await terrain(700, 490, { size: 35 });
    const id = (await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'yard.png', data: png.toString('base64') } })).json().id;
    while (t.maps.get(t.campaign.id, id).reading.status === 'pending') await new Promise((r) => setTimeout(r, 10));
    const base = `/campaigns/${t.campaign.id}/maps/${id}`;
    await t.request('PATCH', base, { body: { shown: true } });
    await t.request('POST', `${base}/tokens`, { body: { kind: 'pc', name: 'Sam', user_id: t.sam.id, x: 52.5, y: 52.5 } });
    const tall = async () => (await t.request('GET', base, { as: t.sam.token })).json().tokens[0].tall;
    assert.equal(await tall(), null, 'no sheet: its size decides');
    const sheet = (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token })).json();
    await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...sheet.sheet, height: '4\'2"' }, version: sheet.version } });
    assert.equal(await tall(), 4.2);
  } finally {
    await t.cleanup();
  }
});

test('stairs and ladders: the DM draws them; climbing a ladder or a bare wall costs a foot per foot in a fight, stairs nothing', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }) });
  try {
    const png = await terrain(700, 490, { size: 35 });
    const id = (await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'yard.png', data: png.toString('base64') } })).json().id;
    while (t.maps.get(t.campaign.id, id).reading.status === 'pending') await new Promise((r) => setTimeout(r, 10));
    const base = `/campaigns/${t.campaign.id}/maps/${id}`;
    await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } } });
    await t.request('PATCH', `${base}/raised`, { body: { add: { points: [[280, 0], [420, 0], [420, 490], [280, 490]], height: 10 } } });
    const add = async (body) => (await t.request('POST', `${base}/tokens`, { body })).json().token;
    const sam = await add({ kind: 'pc', name: 'Sam', user_id: t.sam.id, x: 227.5, y: 227.5 });
    const spider = await add({ kind: 'enemy', name: 'Spider', x: 227.5, y: 297.5, stats: { text: 'Giant Spider. Speed 30 ft., climb 30 ft.', speed: '30 ft., climb 30 ft.' } });

    const ladder = { kind: 'ladder', x1: 270, y1: 227.5, x2: 290, y2: 227.5 };
    assert.equal((await t.request('PATCH', `${base}/climbs`, { as: t.sam.token, body: { add: ladder } })).statusCode, 403);
    const dm = (await t.request('PATCH', `${base}/climbs`, { body: { add: ladder } })).json();
    assert.deepEqual(dm.climbs.map(({ kind, source }) => ({ kind, source })), [{ kind: 'ladder', source: 'dm' }]);
    const view = async (as) => (await t.request('GET', base, { as })).json();
    assert.deepEqual((await view(t.sam.token)).climbs, [{ kind: 'ladder', x1: 270, y1: 227.5, x2: 290, y2: 227.5 }], 'their page needs them for the movement cost');
    assert.equal((await view()).tokens.find((x) => x.id === spider.id).climber, true);
    assert.equal((await view(t.sam.token)).tokens.find((x) => x.id === sam.id).climber, false);

    await t.request('POST', `${base}/combat`, { body: { action: 'start' } });
    await t.request('POST', `${base}/combat`, { body: { action: 'set', id: sam.id, init: 20 } });
    await t.request('POST', `${base}/combat`, { body: { action: 'set', id: spider.id, init: 10 } });
    await t.request('POST', `${base}/combat`, { body: { action: 'next' } });
    const moved = async (tid) => (await view()).combat.entries.find((e) => e.id === tid).moved;
    // Up the ladder onto the 10 ft roof, 2 squares: 10 ft plus 10 ft climbing.
    await t.request('PATCH', `${base}/tokens/${sam.id}`, { as: t.sam.token, body: { x: 297.5, y: 227.5 } });
    assert.equal(await moved(sam.id), 20);
    // Up the bare wall: the spider climbs at no extra cost.
    await t.request('PATCH', `${base}/tokens/${spider.id}`, { body: { x: 297.5, y: 297.5 } });
    assert.equal(await moved(spider.id), 10);

    // Stairs instead: down again costs only the walk.
    await t.request('PATCH', `${base}/climbs`, { body: { remove: dm.climbs[0].id } });
    await t.request('PATCH', `${base}/climbs`, { body: { add: { ...ladder, kind: 'stairs' } } });
    await t.request('PATCH', `${base}/tokens/${sam.id}`, { as: t.sam.token, body: { x: 227.5, y: 227.5 } });
    assert.equal(await moved(sam.id), 30);
    assert.deepEqual((await t.request('PATCH', `${base}/climbs`, { body: { clear: 'all' } })).json().climbs, []);
  } finally {
    await t.cleanup();
  }
});
