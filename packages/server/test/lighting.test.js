/**
 * Darkness, lights and darkvision: in the dark, players only see lit places
 * and what their darkvision reaches, worked out on the server.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setup, createFakeLLM, terrain } from './helpers.js';

const readOut = { readable: true, kind: 'battle', name: 'Crypt', description: '', grid: { visible: true, columns: 20, rows: 14 }, scale: { distance: null, unit: null, per: null }, notes: '' };

test('darkness: players see lit places and what their darkvision reaches; lights are the DM\'s', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }) });
  try {
    const png = await terrain(700, 490, { size: 35 });
    const id = (await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'crypt.png', data: png.toString('base64') } })).json().id;
    while (t.maps.get(t.campaign.id, id).reading.status === 'pending') await new Promise((r) => setTimeout(r, 10));
    const base = `/campaigns/${t.campaign.id}/maps/${id}`;
    await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } } });
    const add = async (body) => (await t.request('POST', `${base}/tokens`, { body })).json().token;
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
    await add({ kind: 'enemy', name: 'Near', x: 122.5, y: 52.5 }); // 10 ft away
    await add({ kind: 'enemy', name: 'Far', x: 472.5, y: 52.5 }); // 60 ft away
    await add({ kind: 'enemy', name: 'Lit', x: 612.5, y: 402.5 });
    const seen = async () => (await t.request('GET', base, { as: t.sam.token })).json().tokens.map((x) => x.name).sort();

    await t.request('PATCH', `${base}/fog`, { body: { enabled: true, sight: true } });
    assert.deepEqual(await seen(), ['Far', 'Lit', 'Near', 'Thorin']); // daylight: all in sight
    // Only the DM turns on darkness and places lights.
    assert.equal((await t.request('PATCH', `${base}/fog`, { as: t.sam.token, body: { dark: true } })).statusCode, 403);
    assert.equal((await t.request('PATCH', `${base}/lights`, { as: t.sam.token, body: { add: { x: 1, y: 1, bright: 20, dim: 20 } } })).statusCode, 403);
    await t.request('PATCH', `${base}/fog`, { body: { dark: true } });
    assert.deepEqual(await seen(), ['Thorin'], 'no light, no darkvision: nothing');

    // Darkvision 30 ft: the near goblin.
    await t.request('PATCH', `${base}/tokens/${thorin.id}`, { as: t.sam.token, body: { darkvision: 30 } });
    assert.deepEqual(await seen(), ['Near', 'Thorin']);

    // A brazier by the far corner lights it (and Thorin can see that far).
    const lit = (await t.request('PATCH', `${base}/lights`, { body: { add: { x: 595, y: 385, bright: 10, dim: 10 } } })).json();
    assert.equal(lit.lights.length, 1);
    assert.deepEqual(await seen(), ['Lit', 'Near', 'Thorin']);
    const player = (await t.request('GET', base, { as: t.sam.token })).json();
    assert.deepEqual(player.lights, [], 'players never get the lights themselves');
    assert.ok(player.fog.mask.some((s) => s.clip), 'the lit place, cut to what Thorin sees');
    // Their image is dark there too: the far goblin's square is blacked out, the lit one isn't.
    const img = await sharp((await t.request('GET', `${base}/image?v=${player.image_key}`, { as: t.sam.token })).rawPayload).raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => img.data[(y * img.info.width + x) * img.info.channels];
    const orig = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const opx = (x, y) => orig.data[(y * orig.info.width + x) * orig.info.channels];
    assert.notEqual(px(472, 60), opx(472, 60), 'the far goblin is in the dark (dimmed: Thorin saw it by day)');
    assert.equal(px(612, 410), opx(612, 410), 'the brazier lights the corner');

    // A wall between Thorin and the light: he can't see the lit corner any more.
    await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 300, y1: 0, x2: 300, y2: 490 } } });
    assert.deepEqual(await seen(), ['Near', 'Thorin']);
    // A torch he carries lights his way (40 ft in all).
    await t.request('PATCH', `${base}/tokens/${thorin.id}`, { as: t.sam.token, body: { light: { bright: 20, dim: 20 }, darkvision: 0 } });
    assert.deepEqual(await seen(), ['Near', 'Thorin']);
    await t.request('PATCH', `${base}/tokens/${thorin.id}`, { as: t.sam.token, body: { x: 262.5, y: 52.5 } });
    assert.deepEqual(await seen(), ['Near', 'Thorin']);

    // Lights are moved and removed by the DM.
    const lightId = lit.lights[0].id;
    assert.equal((await t.request('PATCH', `${base}/lights`, { body: { move: { id: lightId, x: 100, y: 100 } } })).json().lights[0].x, 100);
    assert.equal((await t.request('PATCH', `${base}/lights`, { body: { add: { x: 1, y: 1, bright: 0, dim: 0 } } })).statusCode, 400);
    assert.deepEqual((await t.request('PATCH', `${base}/lights`, { body: { remove: lightId } })).json().lights, []);
    // Daylight again: everything Thorin can see past the wall.
    await t.request('PATCH', `${base}/fog`, { body: { dark: false } });
    assert.deepEqual(await seen(), ['Near', 'Thorin']);
  } finally {
    await t.cleanup();
  }
});
