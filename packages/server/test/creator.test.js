/**
 * The map creator: maps made in the app from a design (floors, walls, doors,
 * assets), drawn by the server and played like any other map, saved again
 * after changes, and the DM's own assets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup, createFakeLLM, fakeEmbedder, terrain } from './helpers.js';
import { createContext } from '../src/context.js';
import { addRoom, addWall, emptyDesign, paintFloor } from '@dndapp/shared/map-design.js';

/** A 12 x 8 grass field with a 5 x 4 stone room (a door in its south wall), a pond, a campfire and a pillar. */
function sampleDesign() {
  let d = emptyDesign(12, 8, 'g');
  d = addRoom(d, { x1: 1, y1: 1, x2: 6, y2: 5 }, 's');
  d = addWall(d, { x1: 3, y1: 5, x2: 4, y2: 5, type: 'door' });
  d = paintFloor(d, [[9, 5], [10, 5], [9, 6], [10, 6]], 'W');
  d.assets = [
    { id: 'fire01', a: 'campfire', x: 9.5, y: 2.5 },
    { id: 'pill01', a: 'pillar', x: 3.5, y: 3, blocks: 'wall' },
  ];
  return d;
}

const create = async (t, design = sampleDesign(), name = 'Old watchpost') => {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps/design`, { body: { name, design } });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
};

test('the DM makes a map in the creator: drawn by the server, with a grid, walls, a door, a light and difficult terrain', async () => {
  const t = await setup({ llm: createFakeLLM() });
  try {
    const view = await create(t);
    assert.equal(view.name, 'Old watchpost');
    assert.equal(view.designed, true);
    assert.equal(view.design, undefined, 'the design comes on its own, not with every map update');
    assert.equal(view.shown, false);
    assert.equal(view.reading.status, 'done', 'no AI reading for a made map');
    assert.deepEqual(view.image, { file: 'image.webp', type: 'image/webp', width: 840, height: 560 });
    assert.deepEqual(view.grid, { size: 70, x: 0, y: 0 });
    assert.deepEqual(view.scale, { distance: 5, unit: 'ft', per: 'square' });

    // The room's four walls, the south one cut round the door; the pillar's outline blocks sight too.
    const map = t.maps.get(t.campaign.id, view.id);
    assert.ok(map.walls.every((w) => w.source === 'creator'));
    const doors = map.walls.filter((w) => w.door);
    assert.deepEqual(doors.map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2]), [[210, 350, 280, 350]]);
    const south = map.walls.filter((w) => !w.door && w.y1 === 350 && w.y2 === 350);
    assert.equal(south.length, 2, 'the wall goes round the doorway');
    assert.equal(map.walls.filter((w) => !w.door && w.kind === 'wall').length, 5 + 8);
    assert.deepEqual(map.lights.map(({ x, y, bright, dim, source }) => ({ x, y, bright, dim, source })), [{ x: 665, y: 175, bright: 20, dim: 20, source: 'creator' }]);
    assert.deepEqual(map.terrain.map((a) => a.points), [[[630, 350], [770, 350], [770, 490], [630, 490]]]);

    // The picture: archived, the size of the design, and grass-green at a corner.
    const file = path.join(t.paths.archive, t.campaign.slug, 'maps', view.id, 'image.webp');
    const meta = await sharp(file).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 840, 560]);
    const { data } = await sharp(file).extract({ left: 770, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[1] > data[0] && data[1] > data[2], `green grass, got ${[...data]}`);
    const img = await t.request('GET', `/campaigns/${t.campaign.id}/maps/${view.id}/image`);
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers['content-type'], 'image/webp');

    // The DM gets the design back to change it; players never do, even once the map is shown.
    const back = (await t.request('GET', `/campaigns/${t.campaign.id}/maps/${view.id}/design`)).json().design;
    assert.equal(back.cols, 12);
    assert.equal(back.floor[5].slice(9, 11), 'WW');
    await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${view.id}`, { body: { shown: true } });
    const seen = (await t.request('GET', `/campaigns/${t.campaign.id}/maps/${view.id}`, { as: t.sam.token })).json();
    assert.equal(seen.design, undefined);
    assert.equal(seen.designed, false);
    assert.ok(seen.walls.every((w) => Object.keys(w).sort().join() === 'kind,x1,x2,y1,y2'), 'only the lines, for their page to work out the fog');
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/maps/${view.id}/design`, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('POST', `/campaigns/${t.campaign.id}/maps/design`, { as: t.sam.token, body: { name: 'x', design: sampleDesign() } })).statusCode, 403);

    // An imported map has no design.
    const imported = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { read: true, filename: 'm.png', data: (await terrain(200, 140)).toString('base64') } });
    assert.equal(imported.json().designed, false);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/maps/${imported.json().id}/design`)).statusCode, 404);
  } finally {
    await t.cleanup();
  }
});

test('a made map saved again: a new picture, its walls replaced, the DM\'s own walls, tokens and an open door kept', async () => {
  const t = await setup({ llm: createFakeLLM() });
  try {
    const view = await create(t);
    const base = `/campaigns/${t.campaign.id}/maps/${view.id}`;
    const map = t.maps.get(t.campaign.id, view.id);
    const door = map.walls.find((w) => w.door);
    t.maps.change(t.campaign.id, view.id, (m) => {
      m.walls.find((w) => w.id === door.id).open = true;
      m.walls.push({ id: 'dmwall000001', x1: 10, y1: 10, x2: 60, y2: 10, source: 'dm' });
      m.tokens.push({ id: 'tok000000001', kind: 'npc', name: 'Guard', x: 105, y: 105 });
    });

    // Bigger, with a table and the pillar taken away.
    const design = (await t.request('GET', `${base}/design`)).json().design;
    design.cols = 14;
    design.floor = design.floor.map((l) => `${l}gg`);
    design.assets = [design.assets[0], { id: 'tabl01', a: 'table', x: 12, y: 2 }];
    const res = await t.request('PUT', `${base}/design`, { body: { design } });
    assert.equal(res.statusCode, 200, res.body);
    const after = res.json();
    assert.deepEqual(after.image, { file: 'image-r2.webp', type: 'image/webp', width: 980, height: 560 });
    assert.notEqual(after.image_key, view.image_key, 'browsers fetch the new picture');
    assert.ok(fs.existsSync(path.join(t.paths.archive, t.campaign.slug, 'maps', view.id, 'image.webp')), 'the old picture stays in the archive');

    const saved = t.maps.get(t.campaign.id, view.id);
    assert.ok(saved.walls.some((w) => w.id === 'dmwall000001'), "the DM's own wall stays");
    assert.equal(saved.walls.filter((w) => w.source === 'creator' && !w.door).length, 5, 'the pillar is gone');
    const doorAfter = saved.walls.find((w) => w.door);
    assert.equal(doorAfter.id, door.id);
    assert.equal(doorAfter.open, true, 'the door is still open');
    assert.deepEqual(saved.tokens.map((x) => x.name), ['Guard']);

    // Again: image-r3.
    const third = await t.request('PUT', `${base}/design`, { body: { design } });
    assert.equal(third.json().image.file, 'image-r3.webp');

    // Only a made map can be saved this way.
    const imported = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { read: true, filename: 'm.png', data: (await terrain(200, 140)).toString('base64') } });
    assert.equal((await t.request('PUT', `/campaigns/${t.campaign.id}/maps/${imported.json().id}/design`, { body: { design } })).statusCode, 400);
  } finally {
    await t.cleanup();
  }
});

test("the DM's own assets: uploaded, placed on a made map, kept on it after being taken off the list, and back from the archive", async () => {
  const t = await setup({ llm: createFakeLLM() });
  try {
    const assets = `/campaigns/${t.campaign.id}/map-assets`;
    // A red square with a see-through border.
    const png = await sharp({ create: { width: 100, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 80, height: 40, channels: 4, background: { r: 220, g: 20, b: 20, alpha: 1 } } }).png().toBuffer(), left: 10, top: 5 }])
      .png()
      .toBuffer();
    const added = await t.request('POST', assets, { body: { filename: 'hay_cart.png', data: png.toString('base64'), blocks: 'low' } });
    assert.equal(added.statusCode, 201, added.body);
    const cart = added.json();
    assert.equal(cart.name, 'hay cart');
    assert.equal(cart.width, 100);
    assert.equal(cart.height, 50);
    assert.equal(cart.blocks, 'low');
    assert.ok(cart.picture);
    assert.equal(cart.art, undefined);
    assert.deepEqual((await t.request('GET', assets)).json().assets.map((x) => x.name), ['hay cart']);
    const pic = await t.request('GET', `${assets}/${cart.id}/picture`);
    assert.equal(pic.statusCode, 200);
    assert.equal(pic.headers['content-type'], 'image/webp');
    assert.equal((await t.request('PATCH', `${assets}/${cart.id}`, { body: { name: 'Hay cart' } })).json().name, 'Hay cart');

    // Players can't list or use them.
    assert.equal((await t.request('GET', assets, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('GET', `${assets}/${cart.id}/picture`, { as: t.sam.token })).statusCode, 403);

    // Placed on a map: drawn in the picture, blocking movement.
    const design = emptyDesign(6, 4, 'd');
    design.assets = [{ id: 'cart01', a: `u:${cart.id}`, x: 3, y: 2, w: 2, h: 1, blocks: 'low' }];
    const view = await create(t, design, 'Farmyard');
    const file = path.join(t.paths.archive, t.campaign.slug, 'maps', view.id, 'image.webp');
    const { data } = await sharp(file).extract({ left: 210, top: 140, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[0] > 150 && data[1] < 80, `the cart is drawn, got ${[...data]}`);
    assert.equal(t.maps.get(t.campaign.id, view.id).walls.filter((w) => w.kind === 'low').length, 4);

    // Taken off the list: the map keeps it and can still be saved again with it.
    assert.equal((await t.request('DELETE', `${assets}/${cart.id}`)).statusCode, 200);
    assert.deepEqual((await t.request('GET', assets)).json().assets, []);
    assert.equal((await t.request('PUT', `/campaigns/${t.campaign.id}/maps/${view.id}/design`, { body: { design } })).statusCode, 200);

    // An asset that isn't this campaign's is refused.
    design.assets[0].a = 'u:0123456789';
    const bad = await t.request('POST', `/campaigns/${t.campaign.id}/maps/design`, { body: { name: 'x', design } });
    assert.equal(bad.statusCode, 400);

    // Back from the archive after losing the database (removed, but there).
    const paths = { archive: t.archive.root, db: path.join(t.dir, 'fresh.sqlite'), models: path.join(t.dir, 'models') };
    const ctx = await createContext({ config: t.config, paths, llm: createFakeLLM(), embedder: fakeEmbedder, log: { error() {} } });
    try {
      const cid = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      assert.ok(ctx.mapAssets.file(cid, cart.id));
      assert.equal(ctx.mapAssets.get(cid, cart.id, { removed: true }).name, 'Hay cart');
      assert.ok(ctx.maps.get(cid, view.id).design, 'the design comes back with the map');
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }
  } finally {
    await t.cleanup();
  }
});
