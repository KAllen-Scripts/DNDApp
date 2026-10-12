/**
 * The DM's map creator (map-creator.js): drawing a room, a door, water and an
 * asset, saving it as a map, changing it again from Map settings, the DM's
 * own assets, and closing with unsaved changes.
 *
 * At zoom 1 a square is 28 px on the creator's canvas, which sits at the
 * page's top left in jsdom, so square (x, y) is at (28x, 28y) on screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { withPage, addDm, createFakeLLM } from './helpers.js';

const S = 28;
const dm = { setup: { llm: createFakeLLM() }, before: async (t) => ({ dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana }) };

function drag(page, from, to) {
  page.pointer('#creator-canvas', 'pointerdown', { clientX: from[0] * S, clientY: from[1] * S });
  page.pointer('#creator-canvas', 'pointermove', { clientX: to[0] * S, clientY: to[1] * S });
  page.pointer('#creator-canvas', 'pointerup', { clientX: to[0] * S, clientY: to[1] * S });
}
const click = (page, at) => drag(page, at, at);
const tool = (page, key) => page.click(`[data-creator-tool="${key}"]`);
const pressed = (page, sel) => page.$(sel).getAttribute('aria-pressed') === 'true';

test('creator: the DM draws a room with a door, a pond and a campfire, saves it as a map, then changes it from Map settings', async () => {
  await withPage(dm, async (page, t) => {
    page.click('[data-tab=map]');
    await page.settle();
    assert.match(page.text('#map-empty'), /Make a map/);
    page.click('#map-create');
    await page.settle();
    assert.ok(page.$('#map-creator').open);
    assert.equal(page.$('#creator-cols').value, '30');
    assert.ok(pressed(page, '[data-creator-tool="room"]'), 'Room is the first tool');

    // Saving with no floor says what to do.
    page.click('#creator-save');
    await page.settle();
    assert.match(page.text('#creator-status'), /Paint some floor/);

    // Grass everywhere, a stone room from (2, 2) to (6, 5), a door in its south wall.
    page.click('[data-floor="g"]');
    page.click('#creator-fill-all');
    page.click('[data-floor="s"]');
    tool(page, 'room');
    drag(page, [2, 2], [6, 5]);
    tool(page, 'door');
    drag(page, [3, 5], [4, 5]);
    // A pond, painted with a 2 x 2 brush.
    page.click('[data-floor="W"]');
    assert.ok(pressed(page, '[data-creator-tool="floor"]'), 'picking a floor picks the paint brush');
    page.$('#creator-tools select').value = '2';
    page.$('#creator-tools select').dispatchEvent(new page.window.Event('change'));
    click(page, [10.5, 10.5]);
    // A dirt path in one fast drag: no squares skipped between the pointer's stops.
    page.click('[data-floor="d"]');
    drag(page, [1.5, 15.5], [8.5, 15.5]);
    // A campfire outside.
    page.click('[data-asset="campfire"]');
    assert.ok(pressed(page, '[data-creator-tool="asset"]'));
    click(page, [8.4, 3.4]);
    // A wall drawn by mistake, undone.
    tool(page, 'wall');
    drag(page, [12, 0], [12, 8]);
    page.click('#creator-undo');

    page.type(page.$('#creator-name'), 'Watchpost');
    page.click('#creator-save');
    await page.waitFor(() => !page.$('#map-creator').open, { what: 'the creator to close' });
    await page.settle();

    const [map] = t.maps.list(t.campaign.id);
    assert.equal(map.name, 'Watchpost');
    assert.deepEqual(map.image, { file: 'image.webp', type: 'image/webp', width: 2100, height: 1400 });
    const d = map.design;
    assert.equal(d.floor[2].slice(0, 7), 'ggssssg');
    assert.equal(d.floor[10].slice(10, 12), 'WW');
    assert.equal(d.floor[11].slice(10, 12), 'WW');
    assert.equal(d.floor[15].slice(1, 10), 'ddddddddd');
    assert.equal(d.walls.filter((w) => w.type === 'wall').length, 5, 'four room walls, the south one in two, and no undone wall');
    assert.deepEqual(d.walls.filter((w) => w.type === 'door').map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2]), [[3, 5, 4, 5]]);
    assert.deepEqual(d.assets.map(({ a, x, y, light }) => [a, x, y, light]), [['campfire', 8.5, 3.5, true]]);
    assert.equal(map.lights.length, 1);
    assert.deepEqual(page.$$('#map-pick option').map((o) => o.textContent), ['Watchpost (hidden)']);

    // Map settings: change it in the creator (instead of reading it with the AI).
    page.click('#map-settings');
    const button = [...page.$('#map-dialog').querySelectorAll('button')].find((b) => b.textContent === 'Change in the map creator');
    assert.ok(button);
    assert.ok(![...page.$('#map-dialog').querySelectorAll('button')].some((b) => /Read again/.test(b.textContent)));
    button.click();
    await page.settle();
    assert.ok(page.$('#map-creator').open);
    assert.match(page.text('#map-creator h2'), /Change map/);
    // Pick the campfire, turn it off as a light, then remove it with the Delete key... after a copy.
    tool(page, 'select');
    click(page, [8.5, 3.5]);
    assert.ok(page.$('#creator-selected'), 'the picked asset has its controls');
    assert.match(page.text('#creator-selected'), /Campfire/);
    [...page.$('#creator-selected').querySelectorAll('button')].find((b) => b.textContent === 'Copy').click();
    page.click('#creator-remove');
    // And make the map bigger.
    page.type(page.$('#creator-cols'), '32');
    page.click('#creator-resize');
    page.click('#creator-save');
    await page.waitFor(() => !page.$('#map-creator').open, { what: 'the creator to close' });
    await page.settle();
    const after = t.maps.get(t.campaign.id, map.id);
    assert.equal(after.image.file, 'image-r2.webp');
    assert.equal(after.image.width, 32 * 70);
    assert.deepEqual(after.design.assets.map((a) => [a.a, a.x, a.y]), [['campfire', 8.5, 3.5]], 'the copy went; the first campfire stays');
  });
});

test("creator: the DM's own picture as an asset, placed on the map; closing with changes asks first", async () => {
  await withPage({ ...dm, page: (t, { dana }) => ({ as: dana, answers: { confirm: [false, true] } }) }, async (page, t) => {
    page.click('[data-tab=map]');
    await page.settle();
    page.click('#map-create');
    await page.settle();
    const png = await sharp({ create: { width: 120, height: 60, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }).png().toBuffer();
    page.setFiles('#creator-upload', [{ name: 'hay_cart.png', type: 'image/png', content: png }]);
    await page.waitFor(() => page.$('#creator-own [data-asset^="u:"]'), { what: 'the uploaded asset in the list' });
    await page.settle();
    assert.match(page.text('#creator-own'), /hay cart/);
    assert.match(page.text('#creator-status'), /Added hay cart/);
    assert.ok(pressed(page, '#creator-own [data-asset^="u:"]'), 'the new asset is picked to place');
    click(page, [5, 5]);

    // Closing with that change: asked, and "no" keeps it open; "yes" closes.
    [...page.$('#map-creator').querySelectorAll('button')].find((b) => b.textContent === 'Close').click();
    assert.ok(page.$('#map-creator').open);
    assert.match(page.dialogs.at(-1).message, /Close without saving/);
    [...page.$('#map-creator').querySelectorAll('button')].find((b) => b.textContent === 'Close').click();
    assert.ok(!page.$('#map-creator').open);
    assert.deepEqual(t.maps.list(t.campaign.id), [], 'nothing was saved');
    // The asset itself is kept for next time.
    const [asset] = t.mapAssets.list(t.campaign.id);
    assert.equal(asset.name, 'hay cart');
    assert.ok(fs.existsSync(path.join(t.paths.archive, t.campaign.slug, 'map_assets', asset.id, asset.art.file)));
  });
});
