/**
 * Map variants (other pictures of the same map) and links between maps
 * (stairs and doors a token can take to another map).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup, createFakeLLM, terrain } from './helpers.js';

const readOut = { readable: true, kind: 'battle', name: 'Keep', description: '', grid: { visible: true, columns: 20, rows: 14 }, scale: { distance: null, unit: null, per: null }, notes: '' };

async function importMap(t, filename, patch = {}) {
  const png = await terrain(700, 490, { size: 35 });
  const id = (await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename, data: png.toString('base64') } })).json().id;
  while (t.maps.get(t.campaign.id, id).reading.status === 'pending') await new Promise((r) => setTimeout(r, 10));
  await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${id}`, { body: { name: filename.split('.')[0], grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' }, ...patch } });
  return id;
}

test('variants: the DM adds another picture, fitted to the map\'s size, and picks which one everyone sees', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }) });
  try {
    const id = await importMap(t, 'Keep.png', { shown: true });
    const base = `/campaigns/${t.campaign.id}/maps/${id}`;
    // Night: a smaller dark-blue JPEG.
    const night = await sharp({ create: { width: 350, height: 245, channels: 3, background: '#102040' } }).jpeg().toBuffer();
    assert.equal((await t.request('POST', `${base}/variants`, { as: t.sam.token, body: { filename: 'night.jpg', data: night.toString('base64') } })).statusCode, 403);
    const added = await t.request('POST', `${base}/variants`, { body: { filename: 'keep_at-night.jpg', data: night.toString('base64') } });
    assert.equal(added.statusCode, 201);
    const v = added.json().variant;
    assert.equal(v.name, 'keep at night');
    assert.equal(v.type, 'image/jpeg');
    // Both the upload and the fitted copy are archived.
    const dir = path.dirname(t.maps.imagePath(t.campaign.id, id).path);
    assert.deepEqual(fs.readFileSync(path.join(dir, `variant-${v.id}-original.jpg`)), night);
    const fitted = await sharp(path.join(dir, v.file)).metadata();
    assert.deepEqual([fitted.width, fitted.height], [700, 490]);

    // Not showing yet: everyone still gets the original.
    const before = (await t.request('GET', base, { as: t.sam.token })).json();
    assert.deepEqual(before.variants, [], 'players only learn the name of the one showing');
    assert.equal((await t.request('PATCH', base, { body: { variant: 'nosuchone' } })).statusCode, 404);
    const shown = (await t.request('PATCH', base, { body: { variant: v.id } })).json();
    assert.equal(shown.variant, v.id);
    assert.notEqual(shown.image_key, 'dm', 'the DM\'s cached image changes too');
    const player = (await t.request('GET', base, { as: t.sam.token })).json();
    assert.notEqual(player.image_key, before.image_key);
    assert.deepEqual(player.variants, [{ id: v.id, name: 'keep at night' }]);
    const img = await t.request('GET', `${base}/image?v=${player.image_key}`, { as: t.sam.token });
    assert.equal(img.headers['content-type'], 'image/jpeg');
    const { data } = await sharp(img.rawPayload).raw().toBuffer({ resolveWithObject: true });
    assert.ok(Math.abs(data[2] - 0x40) < 8, 'the night picture');

    // Removing it brings the original back; its files stay in the archive.
    const removed = (await t.request('DELETE', `${base}/variants/${v.id}`)).json();
    assert.equal(removed.variant, null);
    assert.deepEqual(removed.variants, []);
    assert.ok(fs.existsSync(path.join(dir, v.file)));
    assert.equal((await t.request('GET', `${base}/image`)).headers['content-type'], 'image/png');
  } finally {
    await t.cleanup();
  }
});

test('links: a player takes their character down the stairs to a shown map; the DM can send anyone', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }) });
  try {
    const keep = await importMap(t, 'Keep.png', { shown: true });
    const cellar = await importMap(t, 'Cellar.png');
    const A = `/campaigns/${t.campaign.id}/maps/${keep}`;
    const B = `/campaigns/${t.campaign.id}/maps/${cellar}`;
    const add = async (base, body) => (await t.request('POST', `${base}/tokens`, { body })).json().token;
    const thorin = await add(A, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
    const goblin = await add(A, { kind: 'enemy', name: 'Goblin', x: 402.5, y: 402.5 });

    assert.equal((await t.request('PATCH', `${A}/links`, { as: t.sam.token, body: { add: { x: 105, y: 52.5, to: cellar } } })).statusCode, 403);
    assert.equal((await t.request('PATCH', `${A}/links`, { body: { add: { x: 105, y: 52.5, to: keep } } })).statusCode, 400);
    const dmView = (await t.request('PATCH', `${A}/links`, { body: { add: { x: 105, y: 52.5, to: cellar, label: 'Stairs down' } } })).json();
    assert.equal(dmView.links[0].to_name, 'Cellar');
    const down = dmView.links[0];
    // And back up, on the cellar map.
    await t.request('PATCH', `${B}/links`, { body: { add: { x: 612.5, y: 402.5, to: keep, label: 'Stairs up' } } });

    // The cellar isn't shown: players don't see the link and can't take it.
    assert.deepEqual((await t.request('GET', A, { as: t.sam.token })).json().links, []);
    assert.equal((await t.request('POST', `${A}/links/${down.id}/use`, { as: t.sam.token, body: { token: thorin.id } })).statusCode, 404);
    await t.request('PATCH', B, { body: { shown: true } });
    assert.deepEqual((await t.request('GET', A, { as: t.sam.token })).json().links.map((l) => [l.label, l.to_name]), [['Stairs down', 'Cellar']]);

    // Only their own character.
    assert.equal((await t.request('POST', `${A}/links/${down.id}/use`, { as: t.alex.token, body: { token: thorin.id } })).statusCode, 403);
    // Next to it (Thorin is one square away): he arrives by the stairs up, snapped to the grid.
    const used = await t.request('POST', `${A}/links/${down.id}/use`, { as: t.sam.token, body: { token: thorin.id } });
    assert.equal(used.statusCode, 200);
    const cellarMap = t.maps.get(t.campaign.id, cellar);
    assert.deepEqual(cellarMap.tokens.map((x) => [x.name, x.x, x.y, x.user_id]), [['Thorin', 612.5, 402.5, t.sam.id]]);
    assert.deepEqual(t.maps.get(t.campaign.id, keep).tokens.map((x) => x.name), ['Goblin']);

    // Too far from the link: no.
    await t.request('PATCH', `${B}/tokens/${used.json().token}`, { body: { x: 52.5, y: 52.5 } });
    const up = cellarMap.links[0];
    const far = await t.request('POST', `${B}/links/${up.id}/use`, { as: t.sam.token, body: { token: used.json().token } });
    assert.equal(far.statusCode, 400);
    assert.match(far.json().error, /next to it/);

    // The DM sends the goblin down from anywhere; it arrives by the stairs up too.
    assert.equal((await t.request('POST', `${A}/links/${down.id}/use`, { body: { token: goblin.id } })).statusCode, 200);
    assert.deepEqual(t.maps.get(t.campaign.id, cellar).tokens.map((x) => x.name), ['Thorin', 'Goblin']);
    // Removing a link.
    assert.deepEqual((await t.request('PATCH', `${A}/links`, { body: { remove: down.id } })).json().links, []);
  } finally {
    await t.cleanup();
  }
});
