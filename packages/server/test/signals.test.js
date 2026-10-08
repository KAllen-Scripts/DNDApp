/** Pings and quick drawings: who may send them, what's checked, and the rate limit. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM, terrain } from './helpers.js';

const readOut = { readable: true, kind: 'battle', name: 'Field', description: '', grid: { visible: false, columns: null, rows: null }, scale: { distance: null, unit: null, per: null }, notes: '' };

test('pings and drawings: anyone who can see the map; checked; not too many', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }) });
  try {
    const png = await terrain(700, 490);
    const id = (await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'field.png', data: png.toString('base64') } })).json().id;
    while (t.maps.get(t.campaign.id, id).reading.status === 'pending') await new Promise((r) => setTimeout(r, 10));
    const base = `/campaigns/${t.campaign.id}/maps/${id}`;
    const sent = [];
    t.maps.events.on('signal', (s) => sent.push(s));

    // A hidden map: players can't ping it.
    assert.equal((await t.request('POST', `${base}/ping`, { as: t.sam.token, body: { x: 1, y: 1 } })).statusCode, 404);
    await t.request('PATCH', base, { body: { shown: true } });
    assert.equal((await t.request('POST', `${base}/ping`, { as: t.sam.token, body: { x: 900, y: 1 } })).statusCode, 200);
    assert.deepEqual(sent.at(-1).points, [[700, 1]], 'kept on the map');
    assert.equal(sent.at(-1).kind, 'ping');
    assert.equal(sent.at(-1).from_dm, false);
    assert.equal((await t.request('POST', `${base}/draw`, { body: { points: [[1, 1]] } })).statusCode, 400, 'a drawing needs two points');
    assert.equal((await t.request('POST', `${base}/draw`, { body: { points: [[1, 1], [5, 5]] } })).statusCode, 200);
    assert.equal(sent.at(-1).from_dm, true);
    assert.equal(sent.at(-1).color, '#ffd54a');
    // Twenty in ten seconds, then 429.
    let last;
    for (let i = 0; i < 25; i++) last = await t.request('POST', `${base}/ping`, { as: t.alex.token, body: { x: 1, y: 1 } });
    assert.equal(last.statusCode, 429);
  } finally {
    await t.cleanup();
  }
});
