/**
 * The world on the Map tab (map-places.js): places that open smaller maps, the breadcrumb, groups of
 * places, and who the DM shows a map or a place to.
 *
 * Like map-more.test.js, the map view is 700 x 490 and fitted, so a point on screen is the same point on the map.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, importMap, mapReading, createFakeLLM } from './helpers.js';

const mapLLM = () => createFakeLLM({ structured: async () => mapReading() });
const SHOWN = { shown: true };

async function openMapTab(page) {
  page.click('[data-tab=map]');
  page.setRect('#map-view', { width: 700, height: 490 });
  page.click('#map-fit');
  await page.settle();
}

const dialog = (page) => page.$('#map-dialog');
const fieldIn = (root, label) => [...root.querySelectorAll('label.map-field')].find((l) => l.querySelector('span').textContent === label).querySelector('input, select');
const placeEl = (page, name) => page.$$('#map-places .map-place').find((el) => el.querySelector('.map-place-label').textContent === name);
const trail = (page) => (page.$('#map-trail').hidden ? '' : page.text('#map-trail'));

test('world: the DM puts a town on the region map that opens its map, for one player; the map list and breadcrumb follow', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const vale = await importMap(t, { patch: { ...SHOWN, name: 'The Vale' } });
      const town = await importMap(t, { patch: { ...SHOWN, name: 'Millbrook' } });
      return { vale, town, dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { vale, town }) => {
    await openMapTab(page);
    page.type('#map-pick', vale.id);
    await page.settle();
    page.click('#map-edit');
    page.click('[data-wall-mode=place]');
    page.pointer('#map-view', 'pointerdown', { clientX: 200, clientY: 150 });
    page.pointer('#map-view', 'pointerup', { clientX: 200, clientY: 150 });
    await page.settle();
    const form = dialog(page).querySelector('form');
    assert.ok(dialog(page).open);
    assert.match(page.text(form.querySelector('h2')), /New place/);
    page.type(fieldIn(form, 'Name'), 'Millbrook');
    page.type(fieldIn(form, 'Group (for showing and hiding together)'), 'Towns');
    page.type(fieldIn(form, 'Opens the map'), town.id);
    page.type(form.querySelector('select[aria-label="Who can see it"]'), 'some');
    await page.settle();
    const thorin = [...form.querySelectorAll('.map-who-list label')].find((l) => /Thorin/.test(l.textContent)).querySelector('input');
    page.type(thorin, true);
    page.submit(form);
    await page.settle();
    const [place] = t.maps.get(t.campaign.id, vale.id).places;
    assert.deepEqual([place.name, place.x, place.y, place.group, place.to, place.revealed, place.revealed_to], ['Millbrook', 200, 150, 'Towns', town.id, true, [t.sam.id]]);
    assert.ok(placeEl(page, 'Millbrook'));
    // The map list puts the town under the region.
    assert.deepEqual(page.$$('#map-pick option').map((o) => o.textContent.trim()), ['The Vale', '↳ Millbrook']);

    // A drag makes an area.
    page.pointer('#map-view', 'pointerdown', { clientX: 300, clientY: 300 });
    page.pointer('#map-view', 'pointermove', { clientX: 400, clientY: 380 });
    page.pointer('#map-view', 'pointerup', { clientX: 400, clientY: 380 });
    await page.settle();
    assert.match(page.text(dialog(page).querySelector('h2')), /New area/);
    page.type(fieldIn(dialog(page), 'Name'), 'Whispering Wood');
    page.submit(dialog(page).querySelector('form'));
    await page.settle();
    const wood = t.maps.get(t.campaign.id, vale.id).places[1];
    assert.deepEqual(wood.points, [[300, 300], [400, 300], [400, 380], [300, 380]]);
    assert.equal(wood.revealed, false);
    assert.ok(page.$('#map-place-areas polygon.place-area.unrevealed'));

    // With Place off, a click on the town opens its map, under the region in the breadcrumb.
    page.click('[data-wall-mode=place]');
    page.click(placeEl(page, 'Millbrook'));
    await page.settle();
    assert.equal(page.$('#map-pick').value, town.id);
    assert.equal(trail(page), 'The Vale›Millbrook');
    page.click(page.$$('#map-trail button').find((b) => b.textContent === 'The Vale'));
    await page.settle();
    assert.equal(page.$('#map-pick').value, vale.id);
    assert.equal(trail(page), '', 'no breadcrumb on a top map');
  });
});

test('world: a player sees only the places revealed to them, opens the town through one, and can hide a group', async () => {
  const setupWorld = async (t) => {
    const vale = await importMap(t, { patch: { ...SHOWN, name: 'The Vale' } });
    const town = await importMap(t, { patch: { ...SHOWN, name: 'Millbrook' } });
    const base = `/campaigns/${t.campaign.id}/maps/${vale.id}/places`;
    await t.request('PATCH', base, { body: { add: { name: 'Millbrook', x: 200, y: 150, group: 'Towns', to: town.id, revealed: true, revealed_to: [t.sam.id] } } });
    await t.request('PATCH', base, { body: { add: { name: 'Old Mill', x: 500, y: 300, revealed: true } } });
    await t.request('PATCH', base, { body: { add: { name: 'Lich lair', x: 600, y: 400 } } });
    return { vale, town };
  };
  await withPage({ setup: { llm: mapLLM() }, before: setupWorld, page: (t) => ({ as: t.sam }) }, async (page, t, { vale, town }) => {
    await openMapTab(page);
    page.type('#map-pick', vale.id);
    await page.settle();
    assert.deepEqual(page.$$('#map-places .map-place-label').map((el) => el.textContent), ['Millbrook', 'Old Mill']);
    // Hiding the Towns group (this browser only).
    assert.ok(!page.$('#map-place-groups').hidden);
    page.click('#map-place-groups');
    const box = [...dialog(page).querySelectorAll('label')].find((l) => /Towns/.test(l.textContent)).querySelector('input');
    page.type(box, false);
    assert.deepEqual(page.$$('#map-places .map-place-label').map((el) => el.textContent), ['Old Mill']);
    assert.equal(page.text('#map-place-groups'), 'Places (0/1)');
    page.type(box, true);
    dialog(page).close();
    page.click(placeEl(page, 'Millbrook'));
    await page.settle();
    assert.equal(page.$('#map-pick').value, town.id);
    assert.equal(trail(page), 'The Vale›Millbrook');
  });
  await withPage({ setup: { llm: mapLLM() }, before: setupWorld, page: (t) => ({ as: t.alex }) }, async (page, t, { vale }) => {
    await openMapTab(page);
    page.type('#map-pick', vale.id);
    await page.settle();
    assert.deepEqual(page.$$('#map-places .map-place-label').map((el) => el.textContent), ['Old Mill']);
    assert.ok(page.$('#map-place-groups').hidden, 'no groups among the places Alex has');
  });
});

test('world: the DM shows a map to chosen players in Map settings', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => ({ map: await importMap(t, { patch: { name: 'Tower' } }), dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    page.click('#map-settings');
    const form = dialog(page).querySelector('form');
    page.type(form.querySelector('select[aria-label="Who can see it"]'), 'some');
    await page.settle();
    const lyra = [...form.querySelectorAll('.map-who-list label')].find((l) => /Lyra/.test(l.textContent)).querySelector('input');
    page.type(lyra, true);
    page.submit(form);
    await page.settle();
    const saved = t.maps.get(t.campaign.id, map.id);
    assert.equal(saved.shown, true);
    assert.deepEqual(saved.shown_to, [t.alex.id]);
    assert.match(page.text('#map-status'), /shown to 1 player/);
    assert.deepEqual(page.$$('#map-pick option').map((o) => o.textContent), ['Tower (shown to 1)']);
  });
});
