/**
 * The DM's map creator (map-creator.js and its parts): starting a new map
 * (blank, one the server makes, the AI's draft, or work kept in the
 * browser), saving it, changing it again from Map settings, the DM's own
 * pictures, closing with unsaved changes, the floors of a building, and
 * downloading a map for other VTTs. The drawing tools are tested in
 * creator-tools.test.js.
 *
 * At zoom 1 a square is 28 px on the creator's canvas, which sits at the
 * page's top left in jsdom, so square (x, y) is at (28x, 28y) on screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { addRoom, emptyDesign } from '@dndapp/shared/map-design.js';
import { withPage, addDm, createFakeLLM } from './helpers.js';

const S = 28;
const dm = ({ llm = createFakeLLM(), page = () => ({}) } = {}) => ({
  setup: { llm },
  before: async (t) => ({ dana: await addDm(t) }),
  page: (t, { dana }) => ({ as: dana, ...page(t) }),
});

function drag(page, from, to) {
  page.pointer('#creator-canvas', 'pointerdown', { clientX: from[0] * S, clientY: from[1] * S });
  page.pointer('#creator-canvas', 'pointermove', { clientX: to[0] * S, clientY: to[1] * S });
  page.pointer('#creator-canvas', 'pointerup', { clientX: to[0] * S, clientY: to[1] * S });
}
const click = (page, at) => drag(page, at, at);
const tool = (page, key) => page.click(`[data-creator-tool="${key}"]`);
const pressed = (page, sel) => page.$(sel)?.getAttribute('aria-pressed') === 'true';
const buttonIn = (page, sel, text) => [...page.$(sel).querySelectorAll('button')].find((b) => b.textContent === text);

/** Open the creator for a new map (it shows the start screen first). */
async function openNew(page) {
  page.click('[data-tab=map]');
  await page.settle();
  page.click('#map-create');
  await page.settle();
  assert.ok(page.$('#map-creator').open);
}

/** Save and wait for the creator to close. */
async function saveAndClose(page) {
  page.click('#creator-save');
  await page.waitFor(() => !page.$('#map-creator').open, { what: 'the creator to close' });
  await page.settle();
}

/** Map settings, then "Change in the map creator". */
async function changeInCreator(page) {
  page.click('#map-settings');
  buttonIn(page, '#map-dialog', 'Change in the map creator').click();
  await page.settle();
  assert.ok(page.$('#map-creator').open);
}

test('creator: the DM starts blank, draws a room with a door, a pond and a campfire, saves it as a map, then changes it from Map settings', async () => {
  await withPage(dm(), async (page, t) => {
    page.click('[data-tab=map]');
    await page.settle();
    assert.match(page.text('#map-empty'), /Make a map/);
    await openNew(page);
    // A new map starts with the choice of how: blank, made by the server, or drafted by the AI.
    assert.ok(page.visible('#creator-start'));
    assert.ok(!page.visible('#creator-save'), 'nothing to save yet');
    assert.ok(!page.visible('#creator-undo'));
    page.type('#creator-ground', '.');
    page.click('#creator-blank');
    assert.ok(!page.$('#creator-start'));
    assert.ok(page.visible('#creator-save'));
    assert.equal(page.$('#creator-cols').value, '30');
    assert.equal(page.$('#creator-rows').value, '20');
    assert.ok(pressed(page, '[data-creator-tool="select"]'), 'Pick is the first tool');

    // Saving with no floor says what to do.
    page.click('#creator-save');
    await page.settle();
    assert.match(page.text('#creator-status'), /Paint some floor/);

    // Grass everywhere, a stone room from (2, 2) to (6, 5), a door in its south wall.
    tool(page, 'floor');
    page.click('[data-floor="g"]');
    page.click('#creator-fill-all');
    tool(page, 'room');
    page.click('[data-floor="s"]');
    assert.ok(pressed(page, '[data-creator-tool="room"]'), 'picking the room floor keeps the room tool');
    drag(page, [2, 2], [6, 5]);
    tool(page, 'door');
    drag(page, [3, 5], [4, 5]);
    // A pond, painted with a 2 x 2 brush.
    tool(page, 'floor');
    page.click('[data-floor="W"]');
    page.type('#creator-brush', '2');
    click(page, [10.5, 10.5]);
    // A dirt path in one fast drag: no squares skipped between the pointer's stops.
    page.click('[data-floor="d"]');
    drag(page, [1.5, 15.5], [8.5, 15.5]);
    // A campfire outside: picking it picks the Place tool.
    page.click('[data-asset="campfire"]');
    assert.ok(pressed(page, '[data-creator-tool="place"]'));
    assert.match(page.text('#creator-options'), /Campfire/);
    click(page, [8.4, 3.4]);
    // A wall drawn by mistake, undone.
    tool(page, 'wall');
    drag(page, [12, 0], [12, 8]);
    page.click('#creator-undo');

    page.type(page.$('#creator-name'), 'Watchpost');
    await saveAndClose(page);

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
    assert.ok(buttonIn(page, '#map-dialog', 'Change in the map creator'));
    assert.ok(![...page.$('#map-dialog').querySelectorAll('button')].some((b) => /Read again/.test(b.textContent)));
    buttonIn(page, '#map-dialog', 'Change in the map creator').click();
    await page.settle();
    assert.ok(page.$('#map-creator').open);
    assert.match(page.text('#map-creator h2'), /Change map/);
    assert.ok(!page.$('#creator-start'), 'a saved map opens straight in the editor');
    // Pick the campfire, copy it, then remove the copy.
    click(page, [8.5, 3.5]);
    assert.ok(page.visible('#creator-selected'), 'the picked thing has its controls');
    assert.match(page.text('#creator-selected h3'), /Campfire/);
    buttonIn(page, '#creator-selected', 'Copy').click();
    page.click('#creator-remove');
    // And make the map bigger.
    page.type(page.$('#creator-cols'), '32');
    page.click('#creator-resize');
    await saveAndClose(page);
    const after = t.maps.get(t.campaign.id, map.id);
    assert.equal(after.image.file, 'image-r2.webp');
    assert.equal(after.image.width, 32 * 70);
    assert.deepEqual(after.design.assets.map((a) => [a.a, a.x, a.y]), [['campfire', 8.5, 3.5]], 'the copy went; the first campfire stays');
  });
});

test("creator: the DM's own picture as an asset, placed on the map; closing with changes asks first", async () => {
  await withPage(dm({ page: () => ({ answers: { confirm: [false, true] } }) }), async (page, t) => {
    await openNew(page);
    page.click('#creator-blank');
    // Nothing drawn yet: closing doesn't ask.
    assert.equal(page.dialogs.length, 0);
    const png = await sharp({ create: { width: 120, height: 60, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }).png().toBuffer();
    page.setFiles('#creator-upload', [{ name: 'hay_cart.png', type: 'image/png', content: png }]);
    await page.waitFor(() => page.$('#creator-own [data-asset^="u:"]'), { what: 'the uploaded asset in the list' });
    await page.settle();
    assert.match(page.text('#creator-own'), /hay cart/);
    assert.match(page.text('#creator-status'), /Added hay cart/);
    assert.ok(pressed(page, '#creator-own [data-asset^="u:"]'), 'the new asset is picked to place');
    assert.ok(pressed(page, '[data-creator-tool="place"]'));
    click(page, [5, 5]);
    const placed = (await page.module('map-creator.js')).creatorDesign().assets;
    assert.equal(placed.length, 1);
    assert.deepEqual([placed[0].w, placed[0].h], [2, 1], 'a picture twice as wide as high starts 2 squares by 1');

    // Closing with that change: asked, and "no" keeps it open; "yes" closes.
    buttonIn(page, '#map-creator', 'Close').click();
    assert.ok(page.$('#map-creator').open);
    assert.match(page.dialogs.at(-1).message, /Close without saving/);
    buttonIn(page, '#map-creator', 'Close').click();
    assert.ok(!page.$('#map-creator').open);
    assert.deepEqual(t.maps.list(t.campaign.id), [], 'nothing was saved');
    // The asset itself is kept for next time.
    const [asset] = t.mapAssets.list(t.campaign.id);
    assert.equal(asset.name, 'hay cart');
    assert.ok(fs.existsSync(path.join(t.paths.archive, t.campaign.slug, 'map_assets', asset.id, asset.art.file)));
  });
});

test('creator: starting from a map the server makes (a tavern, another, then a cave at a size of its own), used and saved', async () => {
  await withPage(dm(), async (page, t) => {
    await openNew(page);
    await page.waitFor('[data-generate="tavern"]', { what: 'the kinds of map' });
    assert.deepEqual(page.$$('[data-generate]').map((b) => b.dataset.generate), ['dungeon', 'cave', 'forest', 'village', 'tavern', 'camp', 'crypt', 'crossing']);
    assert.match(page.text('[data-generate="tavern"]'), /Tavern/);
    assert.match(page.text('#creator-result'), /shows here first/);

    page.click('[data-generate="tavern"]');
    await page.waitFor('#creator-use', { what: 'the tavern' });
    assert.equal(page.text('#creator-result h3'), 'Tavern');
    assert.ok(page.$('#creator-preview'), 'shown first');
    assert.match(page.text('#creator-result'), /28 × 22 squares/);
    const made = () => page.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/maps/design/generate'));
    assert.deepEqual(made().map((r) => r.body), [{ kind: 'tavern' }]);
    // Another one.
    page.click('#creator-again');
    await page.settle();
    assert.deepEqual(made().map((r) => r.body.kind), ['tavern', 'tavern']);

    // A cave at a size of its own.
    page.type('#creator-make-sized', true);
    page.type('#creator-make-cols', '24');
    page.type('#creator-make-rows', '18');
    page.click('[data-generate="cave"]');
    await page.waitFor(() => page.text('#creator-result h3') === 'Cave', { what: 'the cave' });
    assert.deepEqual(made().at(-1).body, { kind: 'cave', cols: 24, rows: 18 });
    assert.match(page.text('#creator-result'), /24 × 18 squares/);
    page.click('#creator-use');
    assert.ok(!page.$('#creator-start'));
    assert.equal(page.$('#creator-name').value, 'Cave');
    assert.equal(page.$('#creator-cols').value, '24');
    assert.match(page.text('#creator-status'), /Here's Cave/);
    const design = (await page.module('map-creator.js')).creatorDesign();
    assert.ok(design.walls.length > 10 && design.walls.every((w) => w.style === 'cave'));

    await saveAndClose(page);
    const [map] = t.maps.list(t.campaign.id);
    assert.equal(map.name, 'Cave');
    assert.deepEqual([map.design.cols, map.design.rows], [24, 18]);
    assert.ok(map.walls.length > 10, 'the cave walls are the map walls');
  });
});

/** What the fake AI plans for "a small inn by a road". */
const PLAN = {
  name: 'The Wayside Inn',
  cols: 20, rows: 14,
  ground: 'grass',
  areas: [{ shape: 'rect', x: 0, y: 11, w: 20, h: 3, floor: 'dirt' }],
  rooms: [
    { name: 'common room', x: 2, y: 2, w: 7, h: 6, floor: 'wooden_boards', walls: 'wood', doors: [{ side: 'south', at: 3, type: 'door' }] },
    { name: 'kitchen', x: 9, y: 2, w: 4, h: 4, floor: 'flagstones', walls: 'wood', doors: [{ side: 'west', at: 1, type: 'door' }] },
  ],
  walls: [],
  paths: [{ kind: 'road', width: null, points: [{ x: 0, y: 12.5 }, { x: 20, y: 12.5 }] }],
  things: [{ asset: 'bar', x: 4.5, y: 2.6, turn: 0, w: null, h: null, tint: null }],
  scatter: [],
  labels: [{ text: 'The Wayside Inn', x: 5.5, y: 9.5, size: null, font: 'old' }],
  look: { mood: 'dusk', grid: 'faint' },
  notes: 'I put the stables off the map.',
};

test("creator: the AI's draft from a description and a sketch: a failure says why, asking again works, and the draft is used", async () => {
  let asked = 0;
  const llm = createFakeLLM({
    structured: async (opts) => {
      assert.equal(opts.task, 'design');
      asked += 1;
      if (asked === 1) throw new Error('overloaded');
      return PLAN;
    },
  });
  await withPage(dm({ llm }), async (page, t) => {
    await openNew(page);
    page.click('#creator-draft');
    assert.match(page.text('#creator-status'), /Describe the map first/);

    page.type('#creator-describe', 'A small inn by a road, with a kitchen.');
    const sketch = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#ffffff' } }).png().toBuffer();
    page.setFiles('#creator-sketch', [{ name: 'sketch.png', type: 'image/png', content: sketch }]);
    page.type('#creator-ai-sized', true);
    page.type('#creator-ai-cols', '20');
    page.type('#creator-ai-rows', '14');
    page.click('#creator-draft');
    await page.waitFor('#creator-waiting', { what: 'the waiting message' });
    assert.match(page.text('#creator-waiting'), /drafting your map/);
    await page.waitFor(() => /couldn't draft this map/.test(page.text('#creator-status')), { what: 'the failure' });
    assert.ok(!page.$('#creator-draft').disabled, 'ready to ask again');

    page.click('#creator-draft');
    await page.waitFor('#creator-use', { what: 'the draft' });
    assert.equal(page.text('#creator-result h3'), 'The Wayside Inn');
    assert.match(page.text('#creator-result'), /20 × 14 squares\. I put the stables off the map\./);
    assert.ok(page.$('#creator-redraft'), 'Ask again');
    assert.ok(!page.$('#creator-again'), 'no "Make another" for a draft');
    const calls = t.llm.calls.filter((c) => c.task === 'design');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].attachments.length, 1, 'the sketch');
    assert.match(calls[1].prompt, /A small inn by a road/);
    assert.match(calls[1].prompt, /20 x 14 squares/);

    page.click('#creator-use');
    assert.equal(page.$('#creator-name').value, 'The Wayside Inn');
    assert.equal(page.$('#creator-cols').value, '20');
    await saveAndClose(page);
    const [map] = t.maps.list(t.campaign.id);
    assert.equal(map.name, 'The Wayside Inn');
    assert.deepEqual(map.design.labels.map((l) => l.text), ['The Wayside Inn']);
    assert.equal(map.design.look.mood, 'dusk');
    assert.equal(map.walls.filter((w) => w.door).length, 2, 'the two doors are doors on the map');
  });
});

test('creator: unsaved work is kept in the browser and offered back; closing without saving forgets it', async () => {
  const kept = addRoom(emptyDesign(20, 14, 'g'), { x1: 2, y1: 2, x2: 8, y2: 7 }, 's', 'brick');
  const key = (t) => `dndapp.creator.${t.campaign.id}.new`;
  await withPage(dm({ page: (t) => ({ storage: { [key(t)]: JSON.stringify({ name: 'Lost work', design: kept, at: Date.now() - 60_000 }) }, answers: { confirm: [true, true, false] } }) }), async (page, t) => {
    await openNew(page);
    assert.match(page.dialogs[0].message, /You have unsaved work on a new map from .*\. Carry on with it\?/);
    assert.ok(!page.$('#creator-start'), 'straight back to work');
    assert.equal(page.$('#creator-name').value, 'Lost work');
    assert.equal(page.$('#creator-cols').value, '20');
    const creator = await page.module('map-creator.js');
    assert.equal(creator.creatorDesign().walls.length, kept.walls.length);

    // A change is kept a moment later.
    tool(page, 'wall');
    drag(page, [12, 1], [12, 9]);
    await new Promise((r) => setTimeout(r, 1700));
    const draft = JSON.parse(page.window.localStorage.getItem(key(t)));
    assert.equal(draft.name, 'Lost work');
    assert.equal(draft.design.walls.length, kept.walls.length + 1);

    // Closing without saving (yes, close): forgotten, so the next new map starts at the start screen.
    buttonIn(page, '#map-creator', 'Close').click();
    assert.match(page.dialogs.at(-1).message, /Close without saving/);
    assert.equal(page.window.localStorage.getItem(key(t)), null);
    page.click('#map-create');
    await page.settle();
    assert.ok(page.$('#creator-start'));
    assert.equal(page.dialogs.length, 2, 'nothing offered back');
    buttonIn(page, '#map-creator', 'Close').click();

    // Saying no to unsaved work forgets it too.
    page.window.localStorage.setItem(key(t), JSON.stringify({ name: 'Lost work', design: kept, at: Date.now() }));
    page.click('#map-create');
    await page.settle();
    assert.match(page.dialogs.at(-1).message, /Carry on with it/);
    assert.ok(page.$('#creator-start'));
    assert.equal(page.window.localStorage.getItem(key(t)), null);
  });
});

test('creator: the floors of a building: a first floor added above (with the walls of the one below), shown faintly, and stairs leading down', async () => {
  await withPage(dm(), async (page, t) => {
    await openNew(page);
    page.click('#creator-blank');
    tool(page, 'room');
    drag(page, [2, 2], [8, 7]);
    page.type('#creator-name', 'Keep');
    // The Map tab says what saving first allows.
    page.click('[data-creator-tab="map"]');
    assert.match(page.text('#creator-tools'), /Save the map first/);
    await saveAndClose(page);
    const [keep] = t.maps.list(t.campaign.id);

    await changeInCreator(page);
    page.click('[data-creator-tab="map"]');
    const floors = () => page.$$('#creator-levels li').map((li) => [...li.children].map((e) => e.textContent.trim()).join(' | '));
    assert.deepEqual(floors(), ['Ground floor Keep | open now']);
    assert.equal(page.text('#creator-add-above'), 'Add first floor');
    assert.equal(page.text('#creator-add-below'), 'Add cellar');
    assert.ok(page.$('#creator-ghost').disabled, 'no other floor to show yet');

    // The map as a Universal VTT file.
    page.click('#creator-export');
    await page.waitFor(() => page.downloads.length, { what: 'the download' });
    assert.equal(page.downloads[0].name, 'Keep.dd2vtt');
    const uvtt = JSON.parse(await page.downloads[0].text);
    assert.equal(uvtt.resolution.pixels_per_grid, 70);
    assert.equal(uvtt.line_of_sight.length, 4, 'the room');

    // A first floor above, with this floor's walls: opened in the creator straight away.
    page.click('#creator-add-above');
    await page.waitFor(() => page.$('#creator-name')?.value === 'Keep (First floor)', { what: 'the first floor in the creator' });
    await page.settle();
    assert.match(page.dialogs.at(-1).message, /Open "Keep \(First floor\)" in the creator now\?/);
    const first = t.maps.list(t.campaign.id).find((m) => m.id !== keep.id);
    assert.deepEqual(first.level, { group: keep.id, n: 1 });
    assert.deepEqual(t.maps.get(t.campaign.id, keep.id).level, { group: keep.id, n: 0 });
    assert.equal(first.design.walls.length, keep.design.walls.length, "the floor below's walls");
    page.click('[data-creator-tab="map"]');
    assert.deepEqual(floors(), ['First floor Keep (First floor) | open now', 'Ground floor Keep | Open']);
    assert.equal(page.text('#creator-add-above'), 'Add second floor');
    page.type('#creator-ghost', true);
    await page.settle();
    assert.match(page.text(page.$('#creator-ghost').parentElement), /Show ground floor faintly/);

    // Stairs down, leading to the ground floor.
    page.click('[data-creator-tab="things"]');
    page.click('[data-asset="stairs_down"]');
    click(page, [4, 4]);
    tool(page, 'select');
    click(page, [4, 4]);
    assert.match(page.text('#creator-selected h3'), /Stairs down/);
    assert.deepEqual(page.$$('#creator-leads option').map((o) => o.textContent), ['Nowhere', 'Ground floor: Keep']);
    page.type('#creator-leads', keep.id);
    page.type(page.$('#creator-selected input[placeholder="Stairs down"]'), 'Down to the hall');
    await saveAndClose(page);
    const saved = t.maps.get(t.campaign.id, first.id);
    assert.deepEqual(saved.design.assets.map((a) => [a.a, a.to, a.label]), [['stairs_down', keep.id, 'Down to the hall']]);
    assert.deepEqual(saved.links.map((l) => [l.to, l.label, l.source]), [[keep.id, 'Down to the hall', 'creator']]);
  });
});

test('map settings: a map with a grid downloads as a Universal VTT file', async () => {
  await withPage(dm(), async (page, t) => {
    await openNew(page);
    page.click('#creator-blank');
    tool(page, 'room');
    drag(page, [1, 1], [5, 4]);
    tool(page, 'door');
    click(page, [2.5, 4]);
    page.type('#creator-name', 'Hut: north/south');
    await saveAndClose(page);
    page.click('#map-settings');
    assert.ok(!page.$('#map-export').disabled);
    page.click('#map-export');
    await page.waitFor(() => page.downloads.length, { what: 'the download' });
    assert.equal(page.downloads[0].name, 'Hut northsouth.dd2vtt');
    const uvtt = JSON.parse(await page.downloads[0].text);
    assert.equal(uvtt.format, 0.3);
    assert.deepEqual(uvtt.resolution.map_size, { x: 30, y: 20 });
    assert.equal(uvtt.portals.length, 1, 'the door');
    assert.equal(uvtt.portals[0].closed, true);
    assert.ok(uvtt.image.length > 1000);
    assert.equal(t.maps.list(t.campaign.id).length, 1);
  });
});
