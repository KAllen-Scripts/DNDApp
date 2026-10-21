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

// ---------- stage two: where everyone is ----------

/** Pick a token on the map (a press and let go without moving). */
function pick(page, id, x, y) {
  page.pointer(page.$(`.token[data-id="${id}"]`), 'pointerdown', { clientX: x, clientY: y });
  page.pointer('#map-view', 'pointerup', { clientX: x, clientY: y });
}

const addToken = async (t, map, body) => (await t.request('POST', `/campaigns/${t.campaign.id}/maps/${map.id}/tokens`, { body })).json().token;

test("world: a player's page goes where their character goes; they follow Lyra and go into the town with her", async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const vale = await importMap(t, { patch: { ...SHOWN, name: 'The Vale' } });
      const town = await importMap(t, { patch: { ...SHOWN, name: 'Millbrook' } });
      const road = await importMap(t, { patch: { ...SHOWN, name: 'Road' } });
      await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${vale.id}/places`, { body: { add: { name: 'Millbrook', x: 200, y: 150, to: town.id, revealed: true } } });
      const thorin = await addToken(t, vale, { kind: 'pc', user_id: t.sam.id, name: 'Thorin', x: 400, y: 300 });
      const lyra = await addToken(t, vale, { kind: 'pc', user_id: t.alex.id, name: 'Lyra', x: 200, y: 150 });
      return { vale, town, road, thorin, lyra };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { vale, town, road, thorin, lyra }) => {
    await openMapTab(page);
    assert.equal(page.$('#map-pick').value, vale.id, `it opens where Thorin is, not the newest map (${road.name})`);

    // Thorin follows Lyra.
    pick(page, thorin.id, 400, 300);
    const follow = page.$('#map-selection select.map-follow');
    assert.ok(follow, 'a Follow choice for his own character');
    page.type(follow, lyra.id);
    await page.settle();
    assert.equal(t.maps.get(t.campaign.id, vale.id).tokens.find((x) => x.id === thorin.id).follows, lyra.id);
    assert.ok(!page.$('#map-selection .map-enter'), 'Thorin isn\'t at the town himself');

    // Alex takes Lyra into the town: Thorin goes along, and Sam's page with him.
    const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps/${vale.id}/places/${t.maps.get(t.campaign.id, vale.id).places[0].id}/enter`, { body: { token: lyra.id }, as: t.alex.token });
    assert.equal(res.statusCode, 200, res.body);
    await page.waitFor(() => page.$('#map-pick').value === town.id, { what: 'the page to go to the town' });
    assert.match(page.text('#map-status'), /Thorin is here now/);
    assert.equal(trail(page), 'The Vale›Millbrook');

    // Out to the vale again (the town has no way out drawn, so from anywhere).
    const there = t.maps.get(t.campaign.id, town.id).tokens.find((x) => x.name === 'Thorin');
    pick(page, there.id, there.x, there.y);
    const out = page.$('#map-selection .map-leave');
    assert.equal(out.textContent, 'Out to The Vale');
    page.click(out);
    await page.settle();
    assert.equal(page.$('#map-pick').value, vale.id);
    const back = t.maps.get(t.campaign.id, vale.id).tokens.find((x) => x.name === 'Thorin');
    assert.ok(Math.hypot(back.x - 200, back.y - 150) < 15, `out at the town (${back.x}, ${back.y})`);
    assert.equal(back.follows, null, 'on his own: he left Lyra behind');
  });
});

test('world: on a region map tokens are pins of one size that fan out where they meet; the party panel brings a character over', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const vale = await importMap(t, { patch: { ...SHOWN, name: 'The Vale' } });
      const inn = await importMap(t, { patch: { ...SHOWN, name: 'Inn' } });
      await addToken(t, vale, { kind: 'pc', user_id: t.sam.id, name: 'Thorin', x: 300, y: 200 });
      await addToken(t, vale, { kind: 'pc', user_id: t.alex.id, name: 'Lyra', x: 302, y: 201 });
      return { vale, inn, dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { vale, inn }) => {
    await openMapTab(page);
    page.type('#map-pick', vale.id);
    await page.settle();
    assert.ok(!page.$('#map-tokens .token-pin'), 'ordinary tokens until it is a region map');
    // The DM says it's a region map in Map settings.
    page.click('#map-edit');
    page.click('#map-settings');
    const form = dialog(page).querySelector('form');
    page.type(fieldIn(form, 'Kind'), 'region');
    page.submit(form);
    await page.settle();
    page.click('#map-edit-done');
    assert.deepEqual([t.maps.get(t.campaign.id, vale.id).kind, t.maps.get(t.campaign.id, vale.id).kind_set], ['region', true]);
    const pins = page.$$('#map-tokens .token');
    assert.ok(pins.every((el) => el.classList.contains('token-pin')));
    assert.ok(pins.every((el) => el.style.width === '40px'), 'one size on screen');
    const fans = pins.map((el) => [el.style.getPropertyValue('--fan-x'), el.style.getPropertyValue('--fan-y')].join());
    assert.equal(new Set(fans).size, 2, 'the two pins fan out instead of covering each other');

    // The party panel, from the inn.
    page.type('#map-pick', inn.id);
    await page.settle();
    page.click('#map-party');
    await page.settle();
    const rows = () => page.$$('#map-dialog .map-party-row');
    assert.deepEqual(rows().map((r) => r.querySelector('strong').textContent), ['Lyra', 'Thorin']);
    assert.match(rows()[1].textContent, /The Vale/);
    page.click([...rows()[1].querySelectorAll('button')].find((b) => b.textContent === 'Bring here'));
    await page.settle();
    assert.deepEqual(t.maps.get(t.campaign.id, inn.id).tokens.map((x) => x.name), ['Thorin']);
    assert.deepEqual(t.maps.get(t.campaign.id, vale.id).tokens.map((x) => x.name), ['Lyra']);
    assert.match(rows()[1].textContent, /Inn/);
    assert.ok(page.$('#map-tokens .token:not(.token-pin)'), 'on the inn Thorin is an ordinary token');
  });
});

// ---------- stage three: travel and time ----------

test('world: the DM sends Thorin to Daggerford at a normal pace; the clock brings him there; a player sees the clock move', async () => {
  const setupRoad = async (t) => {
    const vale = await importMap(t, { patch: { ...SHOWN, name: 'The Vale' } });
    const base = `/campaigns/${t.campaign.id}/maps/${vale.id}`;
    // 700 px across is 175 miles: a quarter of a mile a pixel.
    await t.request('PATCH', base, { body: { kind: 'region', grid: null, scale: { distance: 175, unit: 'mi', per: 'width' } } });
    await t.request('PATCH', `${base}/places`, { body: { add: { name: 'Daggerford', x: 340, y: 100, revealed: true } } });
    const thorin = await addToken(t, vale, { kind: 'pc', user_id: t.sam.id, name: 'Thorin', x: 100, y: 100 });
    return { vale, thorin };
  };
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => ({ ...(await setupRoad(t)), dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { vale, thorin }) => {
    await openMapTab(page);
    page.type('#map-pick', vale.id);
    await page.settle();
    assert.equal(page.text('#map-clock'), 'Day 1, 08:00');
    pick(page, thorin.id, 100, 100);
    page.click('#map-selection .map-travel');
    const form = dialog(page).querySelector('form');
    page.type(fieldIn(form, 'Where to'), t.maps.get(t.campaign.id, vale.id).places[0].id);
    assert.equal(page.text(form.querySelector('.map-travel-says')), '60 miles: 2 days 4 hours at a normal pace, arriving Day 3, 12:00.');
    page.submit(form);
    await page.settle();
    const j = t.maps.get(t.campaign.id, vale.id).tokens[0].journey;
    assert.deepEqual([j.to_name, j.leaves, j.arrives], ['Daggerford', 480, 3600]);
    assert.ok(page.$(`#map-routes line[data-route="${thorin.id}"]`), 'a line to where he is headed');
    assert.match(page.text('#map-selection'), /On the road to Daggerford, due Day 3, 12:00/);

    // The clock: a day on, then to when he gets there.
    page.click('#map-clock');
    const clockForm = dialog(page).querySelector('form');
    page.click([...clockForm.querySelectorAll('button')].find((b) => b.textContent === '+1 day'));
    await page.settle();
    assert.equal(page.text('#map-clock'), 'Day 2, 08:00');
    assert.ok(t.maps.get(t.campaign.id, vale.id).tokens[0].x > 100);
    page.click('#map-clock-next');
    await page.settle();
    assert.equal(page.text('#map-clock'), 'Day 3, 12:00');
    const there = t.maps.get(t.campaign.id, vale.id).tokens[0];
    assert.deepEqual([there.x, there.journey], [340, null]);
    assert.ok(!page.$('#map-routes line'));
  });

  await withPage({ setup: { llm: mapLLM() }, before: setupRoad, page: (t) => ({ as: t.sam }) }, async (page, t, { vale, thorin }) => {
    await openMapTab(page);
    assert.ok(page.$('#map-clock').disabled, 'players only read the clock');
    pick(page, thorin.id, 100, 100);
    page.click('#map-selection .map-travel');
    const form = dialog(page).querySelector('form');
    assert.ok(fieldIn(form, 'Days').closest('.map-row').hidden, 'only the DM says how long');
    page.type(fieldIn(form, 'Pace'), 'fast');
    page.submit(form);
    await page.settle();
    assert.equal(t.maps.get(t.campaign.id, vale.id).tokens[0].journey.pace, 'fast');
    await t.request('POST', `/campaigns/${t.campaign.id}/clock`, { body: { add: 60 } });
    await page.waitFor(() => page.text('#map-clock') === 'Day 1, 09:00', { what: 'the clock to move' });
  });
});

test("regression: the DM's travel dialog can be sent when the trip's hours aren't whole (the Hours box refused 4.9)", async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const vale = await importMap(t, { patch: { ...SHOWN, name: 'The Vale' } });
      const base = `/campaigns/${t.campaign.id}/maps/${vale.id}`;
      await t.request('PATCH', base, { body: { kind: 'region', grid: null, scale: { distance: 400, unit: 'mi', per: 'width' } } });
      const thorin = await addToken(t, vale, { kind: 'pc', user_id: t.sam.id, name: 'Thorin', x: 100, y: 100 });
      await t.request('PATCH', `${base}/places`, { body: { add: { name: 'Millbrook', x: 330, y: 190, revealed: true } } });
      return { vale, thorin, dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { vale, thorin }) => {
    await openMapTab(page);
    page.type('#map-pick', vale.id);
    await page.settle();
    pick(page, thorin.id, 100, 100);
    page.click('#map-selection .map-travel');
    const form = dialog(page).querySelector('form');
    page.type(fieldIn(form, 'Where to'), t.maps.get(t.campaign.id, vale.id).places[0].id);
    assert.ok(form.checkValidity(), `the form can be sent (hours: ${fieldIn(form, 'Hours').value})`);
  });
});
