/**
 * The world, fourth stage, on the page: the DM draws roads and rivers, sets random encounters on a map
 * and an area, sends a wagon pushing on 10 hours a day, and switches parts of travel off in Campaign
 * settings ("Not all tables want the same level of detail and realism", owner 2026-10-21).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, importMap, mapReading, createFakeLLM } from './helpers.js';

const mapLLM = () => createFakeLLM({ structured: async () => mapReading() });

async function openMapTab(page) {
  page.click('[data-tab=map]');
  page.setRect('#map-view', { width: 700, height: 490 });
  page.click('#map-fit');
  await page.settle();
}

const dialog = (page) => page.$('#map-dialog');
const fieldIn = (root, label) => [...root.querySelectorAll('label.map-field')].find((l) => l.querySelector('span').textContent === label).querySelector('input, select, textarea');
const addToken = async (t, map, body) => (await t.request('POST', `/campaigns/${t.campaign.id}/maps/${map.id}/tokens`, { body })).json().token;
function pick(page, id, x, y) {
  page.pointer(page.$(`.token[data-id="${id}"]`), 'pointerdown', { clientX: x, clientY: y });
  page.pointer('#map-view', 'pointerup', { clientX: x, clientY: y });
}
function drag(page, a, b) {
  page.pointer('#map-view', 'pointerdown', { clientX: a[0], clientY: a[1] });
  page.pointer('#map-view', 'pointermove', { clientX: b[0], clientY: b[1] });
  page.pointer('#map-view', 'pointerup', { clientX: b[0], clientY: b[1] });
}

/** A region map 700 miles across (a mile a pixel), Thorin on it. */
async function vale(t) {
  const map = await importMap(t, { patch: { shown: true, name: 'The Vale' } });
  await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${map.id}`, { body: { kind: 'region', grid: null, scale: { distance: 700, unit: 'mi', per: 'width' } } });
  const thorin = await addToken(t, map, { kind: 'pc', user_id: t.sam.id, name: 'Thorin', x: 100, y: 100 });
  return { map, thorin };
}

test('world roads: the DM draws a road in two stretches that join, erases one, and sets random encounters on the map and an area', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => ({ ...(await vale(t)), dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    page.type('#map-pick', map.id);
    await page.settle();
    page.click('#map-edit');
    assert.ok(!page.$('[data-wall-mode=road]').hidden, 'Road is there on a region map');
    page.click('[data-wall-mode=road]');
    drag(page, [100, 100], [200, 100]);
    await page.settle();
    // The second stretch starts where the first ended (snapped).
    drag(page, [203, 102], [300, 150]);
    await page.settle();
    let roads = t.maps.get(t.campaign.id, map.id).roads;
    assert.deepEqual(roads.map((r) => [r.kind, r.x1, r.y1, r.x2, r.y2]), [['road', 100, 100, 200, 100], ['road', 200, 100, 300, 150]]);
    assert.equal(page.$$('#map-walls .map-road-line.road').length, 2);
    page.click('[data-wall-mode=river]');
    drag(page, [50, 400], [650, 400]);
    await page.settle();
    page.click('[data-wall-mode=erase]');
    page.pointer('#map-view', 'pointerdown', { clientX: 250, clientY: 125 });
    page.pointer('#map-view', 'pointerup', { clientX: 250, clientY: 125 });
    await page.settle();
    roads = t.maps.get(t.campaign.id, map.id).roads;
    assert.deepEqual(roads.map((r) => r.kind), ['road', 'river']);

    // Random encounters for the whole map, in Map settings.
    page.click('#map-settings');
    let form = dialog(page).querySelector('form');
    page.type(form.querySelector('.map-enc-on'), true);
    page.type(form.querySelector('.map-enc-chance'), '20');
    page.type(form.querySelector('.map-enc-every'), '8');
    page.type(form.querySelector('.map-enc-table'), '1d6+2 wolves\n\nA lost pilgrim');
    page.submit(form);
    await page.settle();
    assert.deepEqual(t.maps.get(t.campaign.id, map.id).encounters, { chance: 20, every: 8, table: ['1d6+2 wolves', 'A lost pilgrim'] });

    // An area of its own: the Misty Forest.
    page.click('[data-wall-mode=place]');
    drag(page, [400, 200], [500, 300]);
    await page.settle();
    form = dialog(page).querySelector('form');
    page.type(fieldIn(form, 'Name'), 'Misty Forest');
    page.type(form.querySelector('.map-enc-on'), true);
    page.type(form.querySelector('.map-enc-table'), 'Will-o’-wisps');
    page.submit(form);
    await page.settle();
    const forest = t.maps.get(t.campaign.id, map.id).places[0];
    assert.deepEqual(forest.encounters, { chance: 15, every: 4, table: ['Will-o’-wisps'] });
  });
});

test('world roads: the DM sends Thorin by wagon, pushing on 10 hours a day; the clock stops for an encounter and says so', async () => {
  await withPage({
    // Every d100 comes up 1: an encounter at each check.
    setup: { llm: mapLLM(), random: () => 1 },
    before: async (t) => {
      const v = await vale(t);
      const base = `/campaigns/${t.campaign.id}/maps/${v.map.id}`;
      await t.request('PATCH', `${base}/roads`, { body: { add: { kind: 'road', x1: 100, y1: 100, x2: 160, y2: 100 } } });
      await t.request('PATCH', `${base}/places`, { body: { add: { name: 'Daggerford', x: 160, y: 100, revealed: true } } });
      await t.request('PATCH', base, { body: { encounters: { chance: 10, every: 4, table: ['2d4 bandits'] } } });
      return { ...v, dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map, thorin }) => {
    await openMapTab(page);
    page.type('#map-pick', map.id);
    await page.settle();
    pick(page, thorin.id, 100, 100);
    page.click('#map-selection .map-travel');
    const form = dialog(page).querySelector('form');
    page.type(fieldIn(form, 'Where to'), t.maps.get(t.campaign.id, map.id).places[0].id);
    page.type(fieldIn(form, 'Travel by'), 'wagon');
    page.type(fieldIn(form, 'Hours a day'), '10');
    await page.waitFor(() => /^60 miles \(60 by road\): 1 day 10 hours at a normal pace/.test(page.text(form.querySelector('.map-travel-says'))), { what: 'what the trip takes' });
    assert.match(page.text(form.querySelector('.map-travel-march')), /forced march/);
    page.submit(form);
    await page.settle();
    const j = t.maps.get(t.campaign.id, map.id).tokens[0].journey;
    assert.deepEqual([j.by, j.hours, j.road_miles], ['wagon', 10, 60]);

    page.click('#map-clock');
    const clockForm = dialog(page).querySelector('form');
    page.click([...clockForm.querySelectorAll('button')].find((b) => b.textContent === '+1 day'));
    await page.settle();
    assert.equal(page.text('#map-clock'), 'Day 1, 12:00', 'stopped 4 hours on');
    assert.match(page.text(clockForm.querySelector('[role=status]')), /random encounter/);
    assert.match(page.text(clockForm.querySelector('.map-road-notes')), /Random encounter, Day 1, 12:00: Thorin, on the way to Daggerford \(The Vale\): 2 \(2d4\) bandits/);
  });
});

test('world roads: with vehicles and travel time switched off in Campaign settings, Thorin walks and gets there at once', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const v = await vale(t);
      await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${v.map.id}/places`, { body: { add: { name: 'Daggerford', x: 160, y: 100, revealed: true } } });
      return { ...v, dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map, thorin }) => {
    page.click('#settings-open');
    const settings = page.$('#settings-dialog');
    page.type(settings.querySelector('#setting-travel-time'), 'none');
    await page.settle();
    page.type(settings.querySelector('[data-travel=vehicles]'), false);
    await page.settle();
    assert.deepEqual(t.store.getSettings(t.campaign.id).travel, { time: 'none', roads: true, terrain: true, vehicles: false, marches: true, encounters: true });
    settings.close();

    await openMapTab(page);
    page.type('#map-pick', map.id);
    await page.settle();
    pick(page, thorin.id, 100, 100);
    page.click('#map-selection .map-travel');
    const form = dialog(page).querySelector('form');
    assert.ok(fieldIn(form, 'Travel by').closest('label').hidden, 'no wagons or boats');
    page.type(fieldIn(form, 'Where to'), t.maps.get(t.campaign.id, map.id).places[0].id);
    await page.waitFor(() => /skipped: they get there at once\.$/.test(page.text(form.querySelector('.map-travel-says'))), { what: 'the trip skipped' });
    page.submit(form);
    await page.settle();
    const there = t.maps.get(t.campaign.id, map.id).tokens[0];
    assert.deepEqual([there.x, there.journey, t.store.getSettings(t.campaign.id).clock], [160, null, 480]);
  });
});
