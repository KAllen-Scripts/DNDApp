/**
 * The Map tab (map.js): importing and setting up maps, tokens, moving them,
 * hit points and conditions, fog, stat blocks, records, private pins, and
 * live updates from the server.
 *
 * The map view is given a 700 x 490 size (the test maps' size), so after
 * "Fit" a point on screen is the same point on the map.
 */
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, upload, importMap, addToken, mapReading, createFakeLLM, makePdf, terrain, SAMPLE } from './helpers.js';

const mapLLM = (stats = null) => createFakeLLM({ structured: async (opts) => (opts.purpose === 'map:stats' ? stats : mapReading()) });
const SHOWN = { shown: true, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } };

/** Open the Map tab, sized like the map and fitted (1 map pixel = 1 screen pixel). */
async function openMapTab(page) {
  page.click('[data-tab=map]');
  page.setRect('#map-view', { width: 700, height: 490 });
  page.click('#map-fit');
  await page.settle();
}

const tokenEl = (page, name) => page.$(`#map-tokens .token[aria-label="${name}"]`);
const dialog = (page) => page.$('#map-dialog');
const dialogButton = (page, text) => [...dialog(page).querySelectorAll('button')].find((b) => b.textContent === text);
const selectionButton = (page, text) => [...page.$('#map-selection').querySelectorAll('button')].find((b) => b.textContent === text);
const mapsOf = async (t) => (await t.request('GET', `/campaigns/${t.campaign.id}/maps`)).json().maps;
const fieldIn = (root, label) => [...root.querySelectorAll('label')].find((l) => l.firstChild?.textContent === label)?.querySelector('input, select');
/** Add a token's "Who is it?": pick the Kind (if given), then click someone in the list. */
function pickWho(page, value, kind) {
  const form = page.$('#map-dialog form');
  if (kind) page.type(fieldIn(form, 'Kind'), kind);
  page.click(page.el(`#map-dialog .who-option[data-value="${value}"]`));
}
/** The names "Who is it?" lists now, by group. */
const whoGroups = (page) => Object.fromEntries(page.$$('#map-dialog .who-group').map((g) => [g.getAttribute('aria-label'), [...g.querySelectorAll('.who-option')].map((o) => o.textContent)]));

/** Drag with the mouse: down on `from`, through `points`, up at the last one (screen = map pixels after Fit). */
/** The fog shapes the page drew last (on the fog's canvas). */
const fogShapes = async (page) => (await page.module('map-state.js')).state.fogShapes ?? [];

function drag(page, from, points) {
  const [x0, y0] = points[0];
  page.pointer(from, 'pointerdown', { clientX: x0, clientY: y0 });
  for (const [x, y] of points.slice(1)) page.pointer('#map-view', 'pointermove', { clientX: x, clientY: y });
  const [x1, y1] = points.at(-1);
  page.pointer('#map-view', 'pointerup', { clientX: x1, clientY: y1 });
}

test('maps: with none, players are told the DM shares them here; the DM is told to import one', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    page.click('[data-tab=map]');
    assert.match(page.text('#map-empty'), /No maps to see yet/);
    assert.ok(!page.$('#tab-map').classList.contains('can-edit'));
    assert.ok(page.$('#map-fit').disabled);
    assert.ok(!page.visible('#map-pick'));
  });
  await withPage({ before: async (t) => ({ dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana }) }, async (page) => {
    page.click('[data-tab=map]');
    assert.match(page.text('#map-empty'), /No maps yet. Press New map/);
    assert.ok(page.$('#tab-map').classList.contains('can-edit'));
  });
});

test('maps: the DM imports a picture; the AI\'s reading arrives live; settings fix the grid and scale and show it', async () => {
  await withPage({ setup: { llm: mapLLM() }, before: async (t) => ({ dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana }) }, async (page, t) => {
    await openMapTab(page);
    page.click('#map-new'); page.click('#map-import');
    page.setFiles('#map-file', [{ name: 'forest_clearing.png', type: 'image/png', content: await terrain(700, 490, { size: 35 }) }]);
    // Not read until the DM asks (owner, 2026-10-16); Map settings has Read with the AI.
    await page.waitFor(() => t.maps.list(t.campaign.id).length === 1, { what: 'the import' });
    await page.settle();
    page.click('#map-settings');
    assert.match(page.text(dialog(page)), /Not read yet/);
    page.click(dialogButton(page, 'Read with the AI'));
    // Read in the background; the result comes over the live stream.
    await page.waitFor(() => /Battle map/.test(page.text('#map-status')), { what: "the AI's reading" });
    assert.equal(page.text('#map-status'), 'Battle map · 1 square = 5 ft · hidden from players'); // a battle map's squares are 5 ft unless it says
    assert.ok(page.visible('#map-stage'));
    await page.waitFor(() => /^blob:/.test(page.$('#map-image').src), { what: 'the map image' });
    assert.equal(page.$('#map-stage').style.width, '700px');
    assert.deepEqual(page.$$('#map-pick option').map((o) => o.textContent), ['Forest clearing (hidden)']);
    assert.ok(!page.$('#map-fit').disabled);

    // Settings: the grid is drawn while the dialog is open (even with "Grid" unticked).
    page.click('#map-settings');
    assert.ok(dialog(page).open);
    assert.match(page.text(dialog(page)), /A clearing with a hidden trapdoor.*The north edge is cut off/);
    const form = dialog(page).querySelector('form');
    assert.ok(Math.abs(fieldIn(form, 'Square size (px)').value - 35) < 0.5, 'the grid measured from the pixels');
    assert.ok(page.$('#map-grid path'), 'the grid is drawn while editing');
    page.type(fieldIn(form, 'Square size (px)'), '70');
    page.type(fieldIn(form, 'Offset across'), '0');
    page.type(fieldIn(form, 'Offset down'), '0');
    assert.match(page.$('#map-grid path').getAttribute('d'), /^M0 0V490M70 0V490/);
    page.type(fieldIn(form, 'Name'), 'The Clearing');
    page.type(form.querySelector('select[aria-label="Who can see it"]'), 'all'); // every player can see it
    page.type(fieldIn(form, 'Distance'), '10');
    page.submit(form);
    await page.settle();
    assert.ok(!dialog(page).open);
    assert.equal(page.$('#map-grid path'), null, 'not drawn once closed (Grid is off)');
    assert.equal(page.text('#map-status'), 'Battle map · 1 square = 10 ft');
    assert.deepEqual(page.$$('#map-pick option').map((o) => o.textContent), ['The Clearing']);
    const [saved] = await mapsOf(t);
    assert.equal(saved.shown, true);
    assert.deepEqual(saved.grid, { size: 70, x: 0, y: 0 });
    assert.deepEqual(saved.scale, { distance: 10, unit: 'ft', per: 'square' });

    // The Grid box draws it all the time (remembered in this browser).
    page.type('#map-show-grid', true);
    assert.ok(page.$('#map-grid path'));
    assert.equal(page.window.localStorage.getItem('dndapp.map.showGrid'), '1');

    // Cancel leaves it as it was.
    page.click('#map-settings');
    page.type(fieldIn(dialog(page), 'Name'), 'Never saved');
    page.click(dialogButton(page, 'Cancel'));
    assert.equal((await mapsOf(t))[0].name, 'The Clearing');
  });
});

test('maps: a PDF asks which page; cancelling imports nothing', async () => {
  await withPage({ setup: { llm: mapLLM() }, before: async (t) => ({ dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana }) }, async (page, t) => {
    await openMapTab(page);
    const pdf = makePdf([['Chapter 1'], ['The map is on this page']]);
    page.setFiles('#map-file', [{ name: 'adventure.pdf', type: 'application/pdf', content: pdf }]);
    await page.waitFor(() => dialog(page).open, { what: 'the page question' });
    assert.match(page.text(dialog(page)), /Which page is the map on\?.*adventure\.pdf/);
    page.click(dialogButton(page, 'Cancel'));
    await page.settle();
    assert.equal((await mapsOf(t)).length, 0);

    page.setFiles('#map-file', [{ name: 'adventure.pdf', type: 'application/pdf', content: pdf }]);
    await page.waitFor(() => dialog(page).open);
    page.type(dialog(page).querySelector('input[type=number]'), '2');
    page.submit(dialog(page).querySelector('form'));
    await page.waitFor(() => page.requests.some((r) => r.method === 'POST' && r.body?.page === 2), { what: 'the upload' });
    await page.waitFor(() => t.maps.list(t.campaign.id).length === 1, { what: 'the import' });
    await page.settle();
    assert.equal((await mapsOf(t))[0].pdf?.page ?? 2, 2);
  });
});

test('maps: the DM adds tokens; HP changes ("-3", "+10", "4"), conditions, hidden, edit and remove', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => ({ dana: await addDm(t), map: await importMap(t, { patch: SHOWN }) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    assert.equal(page.text('#map-status'), 'Battle map · 1 square = 5 ft');

    // Add a player's token: picking the player names it after their character.
    page.click('#map-add-token');
    await page.waitFor(() => dialog(page).open);
    const form = () => dialog(page).querySelector('form');
    pickWho(page, `p:${t.sam.id}`, 'pc');
    assert.equal(fieldIn(form(), 'Name').value, 'Thorin');
    page.submit(form());
    await page.settle();
    assert.ok(tokenEl(page, 'Thorin'));
    // New tokens go in the middle of what's on screen, snapped to the grid.
    const [thorin] = (await mapsOf(t))[0].tokens;
    assert.deepEqual([thorin.x, thorin.y, thorin.user_id], [367.5, 262.5, t.sam.id]);

    // An enemy with max HP, without the AI.
    page.click('#map-add-token');
    await page.waitFor(() => dialog(page).open);
    page.type(fieldIn(form(), 'Name'), 'Goblin');
    page.type(fieldIn(form(), 'Max HP'), '7');
    page.type([...form().querySelectorAll('input[type=checkbox]')].at(-1), false); // don't ask the AI
    page.submit(form());
    await page.settle();
    const goblin = tokenEl(page, 'Goblin');
    assert.ok(goblin.classList.contains('token-enemy'));
    assert.ok(page.visible('#map-selection'), 'a new token is selected');
    assert.match(page.text('#map-selection'), /^Goblin ?Enemy · Medium ?7 \/ 7 HP/);

    const hp = (v) => {
      page.type('#map-selection [aria-label="Change hit points"]', v);
      page.key('#map-selection [aria-label="Change hit points"]', 'Enter');
    };
    hp('-3');
    await page.settle();
    assert.match(page.text('#map-selection .hp-text'), /^4 \/ 7 HP$/);
    hp('+10');
    await page.settle();
    assert.equal(page.text('#map-selection .hp-text'), '7 / 7 HP', 'healing stops at the maximum');
    hp('0');
    await page.settle();
    assert.ok(tokenEl(page, 'Goblin').classList.contains('down'));
    hp('lots');
    await page.settle();
    assert.equal(page.text('#map-selection .hp-text'), '0 / 7 HP');

    page.type('#map-selection [aria-label="Add a condition"]', 'prone');
    await page.settle();
    assert.equal(page.text('#map-selection .chip'), 'prone✕');
    assert.equal(page.text(tokenEl(page, 'Goblin').querySelector('.token-conditions')), '1');
    page.click('#map-selection [aria-label="Remove prone"]');
    await page.settle();
    assert.equal(page.$('#map-selection .chip'), null);

    page.type([...page.$$('#map-selection input[type=checkbox]')].at(-1), true);
    await page.settle();
    assert.ok(tokenEl(page, 'Goblin').classList.contains('hidden-token'));

    // Edit: rename and resize.
    page.click(selectionButton(page, 'Edit'));
    await page.waitFor(() => dialog(page).open);
    assert.equal(page.text(form().querySelector('h2')), 'Change token');
    page.type(fieldIn(form(), 'Name'), 'Goblin boss');
    page.type(fieldIn(form(), 'Size'), '2');
    page.submit(form());
    await page.settle();
    assert.match(page.text('#map-selection'), /^Goblin boss ?Enemy · Large/);

    // Remove (after confirming); closing the bar deselects.
    page.answers.confirm = [false, true];
    page.click(selectionButton(page, 'Remove'));
    await page.settle();
    assert.ok(tokenEl(page, 'Goblin boss'));
    page.click(selectionButton(page, 'Remove'));
    await page.settle();
    assert.equal(tokenEl(page, 'Goblin boss'), null);
    assert.ok(!page.visible('#map-selection'));
    assert.equal((await mapsOf(t))[0].tokens.length, 1);
    assert.ok(map);
  });
});

test('maps: a player drags their own token (distance shown, snapped by the server); others only select', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      await addToken(t, map, { kind: 'enemy', name: 'Ogre', x: 297.5, y: 297.5, hp: { current: 20, max: 59 } });
      return { map };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    assert.ok(!page.$('#tab-map').classList.contains('can-edit'));
    assert.ok(tokenEl(page, 'Thorin').classList.contains('mine'));
    assert.ok(tokenEl(page, 'Thorin').classList.contains('movable'));
    assert.ok(!tokenEl(page, 'Ogre').classList.contains('movable'));

    // Drag Thorin three squares right: the distance shows while dragging.
    page.pointer(tokenEl(page, 'Thorin'), 'pointerdown', { clientX: 52, clientY: 52 });
    page.pointer('#map-view', 'pointermove', { clientX: 100, clientY: 55 });
    page.pointer('#map-view', 'pointermove', { clientX: 160, clientY: 55 });
    assert.ok(page.visible('#map-measure'));
    assert.equal(page.text('#map-measure'), '15 ft');
    page.pointer('#map-view', 'pointerup', { clientX: 160, clientY: 55 });
    assert.ok(!page.visible('#map-measure'));
    await page.settle();
    const moved = (await mapsOf(t))[0].tokens.find((x) => x.name === 'Thorin');
    assert.deepEqual([moved.x, moved.y], [157.5, 52.5]);
    assert.equal(tokenEl(page, 'Thorin').style.left, `${157.5 - 17.5}px`);

    // The ogre: a click selects it; its hit points show only as how hurt it looks.
    page.pointer(tokenEl(page, 'Ogre'), 'pointerdown', { clientX: 297, clientY: 297 });
    page.pointer('#map-view', 'pointerup', { clientX: 297, clientY: 297 });
    assert.match(page.text('#map-selection'), /^Ogre ?Enemy · Medium ?Bloodied/);
    assert.equal(page.$('#map-selection [aria-label="Change hit points"]'), null);
    assert.equal(selectionButton(page, 'Edit'), undefined);
    // A plain click on the map clears the selection.
    page.pointer('#map-view', 'pointerdown', { clientX: 600, clientY: 400 });
    page.pointer('#map-view', 'pointerup', { clientX: 600, clientY: 400 });
    assert.ok(!page.visible('#map-selection'));

    // Their own token: hit points they can change.
    page.key(tokenEl(page, 'Thorin'), 'Enter');
    assert.match(page.text('#map-selection'), /^Thorin ?Player character · Medium ?No HP/);
    assert.match(page.text('#map-selection'), /Drag to move/);
    page.type('#map-selection [aria-label="Change hit points"]', '24');
    page.key('#map-selection [aria-label="Change hit points"]', 'Enter');
    await page.settle();
    assert.equal(page.text('#map-selection .hp-text'), '24 / 24 HP');
    assert.ok(map);
  });
});

test('maps: changes reach a player live; a map being hidden disappears; a new one appears', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      const ogre = await addToken(t, map, { kind: 'enemy', name: 'Ogre', x: 297.5, y: 297.5 });
      return { map, ogre };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { map, ogre }) => {
    await openMapTab(page);
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    await t.request('PATCH', `${base}/tokens/${ogre.id}`, { body: { x: 87.5, y: 87.5 } });
    await page.waitFor(() => tokenEl(page, 'Ogre').style.left === '70px', { what: 'the ogre to move' });
    await t.request('POST', `${base}/tokens`, { body: { kind: 'npc', name: 'Brother Hal', x: 10, y: 10 } });
    await page.waitFor(() => tokenEl(page, 'Brother Hal'), { what: 'the new token' });
    await t.request('POST', `${base}/tokens`, { body: { kind: 'enemy', name: 'Lurker', x: 10, y: 10, hidden: true } });
    await t.request('PATCH', `${base}/tokens/${ogre.id}`, { body: { x: 122.5, y: 87.5 } });
    await page.waitFor(() => tokenEl(page, 'Ogre').style.left === '105px');
    assert.equal(tokenEl(page, 'Lurker'), null, 'hidden tokens never reach players');

    await t.request('PATCH', base, { body: { shown: false } });
    await page.waitFor(() => page.visible('#map-empty'), { what: 'the map to go' });
    assert.match(page.text('#map-empty'), /No maps to see yet/);

    const second = await importMap(t, { patch: { ...SHOWN, name: 'The Mill' } });
    await page.waitFor(() => page.visible('#map-stage'), { what: 'the new map' });
    assert.deepEqual(page.$$('#map-pick option').map((o) => o.textContent), ['The Mill']);
    assert.ok(second);
  });
});

test('maps: the DM picks between maps; the choice is remembered; removing one shows the next', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const first = await importMap(t, { patch: { ...SHOWN, name: 'First' } });
      const second = await importMap(t, { patch: { ...SHOWN, name: 'Second' } });
      return { dana: await addDm(t), first, second };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { first }) => {
    await openMapTab(page);
    assert.equal(page.$('#map-pick').value, page.$$('#map-pick option')[1].value, 'the newest is shown first');
    page.type('#map-pick', first.id);
    await page.settle();
    assert.equal(page.window.localStorage.getItem(`dndapp.map.${t.campaign.id}`), first.id);

    page.click('#map-settings');
    page.answers.confirm = [true];
    page.click(dialogButton(page, 'Remove map'));
    await page.settle();
    assert.ok(!dialog(page).open);
    assert.deepEqual(page.$$('#map-pick option').map((o) => o.textContent), ['Second']);
    assert.equal((await mapsOf(t)).length, 1);
  });
});

test("maps: the DM's Show players this map shows a hidden map, moves the players there and then reads Players are here", async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const road = await importMap(t, { patch: { ...SHOWN, name: 'Road' } });
      const keep = await importMap(t, { patch: { name: 'Keep' } });
      // Fog on, line of sight off, nothing revealed: the players would see only fog.
      await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${keep.id}/fog`, { body: { enabled: true } });
      return { dana: await addDm(t), road, keep };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { road, keep }) => {
    await openMapTab(page);
    assert.equal(page.$('#map-pick').value, keep.id);
    assert.equal(page.text('#map-bring'), 'Show players this map');
    assert.ok(!page.$('#map-bring').disabled);
    assert.match(page.$('#map-bring').title, /hidden from them now/);

    page.click('#map-bring');
    await page.waitFor(() => page.text('#map-bring') === 'Players are here', { what: 'the button to say the players are here' });
    assert.ok(page.$('#map-bring').disabled);
    assert.match(page.text('#map-status'), /The players now see this map, but only fog: reveal parts, or tick Line of sight, in Fog & sight/);
    assert.deepEqual(page.$$('#map-pick option').map((o) => o.textContent), ['Road', 'Keep (players here)']);
    assert.equal(t.maps.get(t.campaign.id, keep.id).shown, true, 'bringing them shows it');

    page.type('#map-pick', road.id);
    await page.settle();
    assert.equal(page.text('#map-bring'), 'Show players this map');
    assert.ok(!page.$('#map-bring').disabled);
  });
});

test("maps: a player's page goes where the DM brings everyone and opens there; they can look elsewhere; a map hidden for a moment comes back", async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const keep = await importMap(t, { patch: { ...SHOWN, name: 'Keep' } });
      const road = await importMap(t, { patch: { ...SHOWN, name: 'Road' } });
      const cellar = await importMap(t, { patch: { name: 'Cellar' } });
      await t.request('POST', `/campaigns/${t.campaign.id}/maps/${keep.id}/bring`);
      return { keep, road, cellar };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { keep, road, cellar }) => {
    const base = `/campaigns/${t.campaign.id}/maps`;
    await openMapTab(page);
    assert.equal(page.$('#map-pick').value, keep.id, 'it opens on the players\' map, not the newest');
    assert.deepEqual(page.$$('#map-pick option').map((o) => o.textContent), ['Keep (party here)', 'Road']);
    assert.ok(page.$('#map-bring').classList.contains('dm-only') && !page.$('#tab-map').classList.contains('can-edit'), 'only the DM moves everyone');

    // The DM brings everyone down to the cellar (hidden until now): the page follows and says so.
    await t.request('POST', `${base}/${cellar.id}/bring`);
    await page.waitFor(() => page.$('#map-pick').value === cellar.id, { what: 'the page to go to the cellar' });
    assert.match(page.text('#map-status'), /Your DM brought everyone here/);

    // They look at the road themselves; changes on the cellar don't pull them back.
    page.type('#map-pick', road.id);
    await page.settle();
    await t.request('POST', `${base}/${cellar.id}/tokens`, { body: { kind: 'npc', name: 'Rat', x: 10, y: 10 } });
    const { state } = await page.module('map-state.js');
    await page.waitFor(() => state.maps.find((m) => m.id === cellar.id).tokens.some((tk) => tk.name === 'Rat'), { what: 'the change on the cellar' });
    await page.settle();
    assert.equal(page.$('#map-pick').value, road.id);

    // The DM hides the road for a moment: the page goes to the players' map, and back when it's shown again.
    await t.request('PATCH', `${base}/${road.id}`, { body: { shown: false } });
    await page.waitFor(() => page.$('#map-pick').value === cellar.id, { what: 'the page to fall back to the players\' map' });
    await t.request('PATCH', `${base}/${road.id}`, { body: { shown: true } });
    await page.waitFor(() => page.$('#map-pick').value === road.id, { what: 'the road to come back' });
  });
});

test('maps: read again with the AI (after confirming)', async () => {
  let reads = 0;
  const llm = createFakeLLM({ structured: async () => (++reads === 1 ? mapReading() : mapReading({ name: 'Second look', kind: 'town' })) });
  await withPage({
    setup: { llm },
    before: async (t) => ({ dana: await addDm(t), map: await importMap(t) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page) => {
    await openMapTab(page);
    page.click('#map-settings');
    page.answers.confirm = [true];
    page.click(dialogButton(page, 'Read again with the AI'));
    await page.waitFor(() => /^Town/.test(page.text('#map-status')), { what: 'the second reading' });
    assert.equal(reads, 2);
  });
});

test('fog of war: the DM turns it on, reveals by dragging, undoes, reveals and covers everything', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => ({ dana: await addDm(t), map: await importMap(t, { patch: SHOWN }) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    await openMapTab(page);
    const fog = async () => (await mapsOf(t))[0].fog;
    page.click('#map-fog-open');
    assert.ok(page.visible('#map-fog-tools'));
    assert.equal(page.$('#map-fog-open').getAttribute('aria-pressed'), 'true');
    assert.ok(page.$('[data-fog-mode=reveal]').disabled, 'nothing to draw until fog is on');

    page.type('#map-fog-on', true);
    await page.settle();
    assert.equal((await fog()).enabled, true);
    assert.ok((await fogShapes(page)).length, 'the fog is drawn');
    assert.ok(!page.$('[data-fog-mode=reveal]').disabled);

    // Everything starts covered, so turning fog on goes straight to revealing.
    assert.equal(page.$('[data-fog-mode=reveal]').getAttribute('aria-pressed'), 'true');
    assert.ok(page.$('#map-view').classList.contains('fog-drawing'));
    // Drag a rectangle: it's drawn while dragging, and snaps to the grid.
    page.pointer('#map-view', 'pointerdown', { clientX: 40, clientY: 40 });
    page.pointer('#map-view', 'pointermove', { clientX: 100, clientY: 90 });
    assert.ok(page.$('#map-fog rect.fog-draft.reveal'));
    page.pointer('#map-view', 'pointerup', { clientX: 100, clientY: 90 });
    await page.settle();
    assert.deepEqual((await fog()).shapes, [{ op: 'reveal', x: 35, y: 35, w: 70, h: 70 }]);
    assert.equal((await fogShapes(page)).length, 2);

    page.click('[data-fog-action=undo]');
    await page.settle();
    assert.deepEqual((await fog()).shapes, []);

    page.answers.confirm = [false, true, true];
    page.click('[data-fog-action=reveal]');
    await page.settle();
    assert.deepEqual((await fog()).shapes, []);
    page.click('[data-fog-action=reveal]');
    await page.settle();
    assert.equal((await fog()).shapes.length, 1);
    page.click('[data-fog-action=cover]');
    await page.settle();
    assert.deepEqual((await fog()).shapes, []);

    // Leaving fog mode: the same button again, or closing the tools.
    page.click('[data-fog-mode=cover]');
    page.click('[data-fog-mode=cover]');
    assert.ok(!page.$('#map-view').classList.contains('fog-drawing'));
    page.click('#map-fog-open');
    assert.ok(!page.visible('#map-fog-tools'));
  });
});

test('walls: the DM draws walls and doors (snapped to wall ends and grid corners), opens a door, erases, and asks the AI for a draft', async () => {
  const llm = createFakeLLM({
    structured: async (opts) => (opts.purpose.startsWith('map:walls')
      ? { walls: [{ points: [{ x: 500, y: 0 }, { x: 500, y: 1000 }] }], doors: [], notes: 'Rough around the tower.' }
      : mapReading()),
  });
  await withPage({
    setup: { llm },
    before: async (t) => ({ dana: await addDm(t), map: await importMap(t, { patch: SHOWN }) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    await openMapTab(page);
    const map = async () => (await mapsOf(t))[0];
    page.click('#map-edit');
    assert.ok(page.visible('#map-wall-tools'));
    assert.ok(page.$('#map-sight-on').disabled, 'line of sight needs the fog on');
    assert.match(page.text('#map-wall-hint'), /once Fog & sight has Line of sight on/);

    // A wall: drawn while dragging; its start snaps to the grid corner (35, 35).
    page.click('[data-wall-mode=wall]');
    assert.equal(page.$('[data-wall-mode=wall]').getAttribute('aria-pressed'), 'true');
    assert.ok(page.$('#map-view').classList.contains('fog-drawing'));
    page.pointer('#map-view', 'pointerdown', { clientX: 40, clientY: 40 });
    page.pointer('#map-view', 'pointermove', { clientX: 100, clientY: 90 });
    assert.ok(page.$('#map-walls line.wall-draft'));
    page.pointer('#map-view', 'pointerup', { clientX: 100, clientY: 90 });
    await page.settle();
    let walls = (await map()).walls;
    assert.deepEqual(walls.map(({ x1, y1, x2, y2, door }) => ({ x1, y1, x2, y2, door })), [{ x1: 35, y1: 35, x2: 100, y2: 90, door: false }]);
    assert.ok(page.$('#map-walls line.wall'));

    // A door that starts on the wall's end, then a click on it opens it.
    page.click('[data-wall-mode=door]');
    drag(page, '#map-view', [[103, 93], [103, 140], [103, 160]]);
    await page.settle();
    walls = (await map()).walls;
    const door = walls.find((w) => w.door);
    assert.deepEqual({ x1: door.x1, y1: door.y1 }, { x1: 100, y1: 90 });
    drag(page, '#map-view', [[101, 120]]);
    await page.settle();
    assert.equal((await map()).walls.find((w) => w.door).open, true);
    assert.ok(page.$('#map-walls line.door.open'));

    // Erase the wall with a click.
    page.click('[data-wall-mode=erase]');
    drag(page, '#map-view', [[60, 58]]);
    await page.settle();
    assert.deepEqual((await map()).walls.map((w) => w.door), [true]);

    // Done editing; line of sight, once the fog is on (turning fog on goes straight to revealing).
    page.click('#map-edit-done');
    assert.equal(page.$('[data-wall-mode=erase]').getAttribute('aria-pressed'), 'false');
    page.click('#map-fog-open');
    assert.ok(page.visible('#map-fog-tools') && !page.visible('#map-wall-tools'));
    page.type('#map-fog-on', true);
    await page.settle();
    assert.equal(page.$('[data-fog-mode=reveal]').getAttribute('aria-pressed'), 'true');
    page.type('#map-sight-on', true);
    await page.settle();
    assert.equal((await map()).fog.sight, true);
    page.click('#map-edit');
    assert.equal(page.$('[data-fog-mode=reveal]').getAttribute('aria-pressed'), 'false', 'editing puts the fog tool down');
    assert.equal(page.text('#map-wall-hint'), '0 walls, 0 obstacles, 1 door, 0 lights.');

    // Lock the door (it shows red), draw an obstacle players see over.
    page.click('[data-wall-mode=lock]');
    drag(page, '#map-view', [[101, 120]]);
    await page.settle();
    assert.deepEqual((({ open, locked }) => ({ open, locked }))((await map()).walls[0]), { open: false, locked: true });
    assert.ok(page.$('#map-walls line.door.locked'));
    page.click('[data-wall-mode=low]');
    drag(page, '#map-view', [[300, 300], [400, 300]]);
    await page.settle();
    assert.equal((await map()).walls.find((w) => !w.door).kind, 'low');
    assert.ok(page.$('#map-walls line.wall.low'));

    // What players get of the parts they can't see; remembering where they've been.
    page.click('#map-edit-done');
    page.click('#map-fog-open');
    assert.equal(page.$('#map-fog-map').value, 'dark');
    page.type('#map-fog-map', 'grey');
    await page.settle();
    assert.equal((await map()).fog.map, 'grey');
    assert.ok(page.$('#map-memory-on').disabled, 'nothing to remember when unseen parts are greyed anyway');
    page.type('#map-fog-map', 'dark');
    await page.settle();
    assert.ok(page.$('#map-memory-on').checked);
    page.type('#map-memory-on', false);
    await page.settle();
    assert.equal((await map()).fog.memory, false);
    assert.ok(page.$('[data-wall-action=forget]').disabled);

    // The AI's draft arrives live, in its own colour, and can be cleared.
    page.click('#map-edit');
    page.click('#map-walls-draft'); page.submit('#map-dialog form');
    // Its first draft is drawn as soon as it has one, before the check is done (owner, 2026-10-16).
    await page.waitFor(() => page.$('#map-walls line.wall.ai'), { what: "the AI's walls" });
    await page.waitFor(() => t.maps.list(t.campaign.id)[0].wall_draft.status === 'done', { what: 'the draft done' });
    assert.equal((await map()).wall_draft.notes, 'Rough around the tower.');
    page.click('[data-wall-action=clear-ai]');
    await page.settle();
    assert.ok(!page.$('#map-walls line.wall.ai'));
    assert.ok(page.$('[data-wall-action=clear-ai]').disabled);
  });
});

test('AI walls: the DM sees it working (step and time so far), then what it found or why it failed, and can try again', async () => {
  // The AI answers only when the test lets it, so the "working" state can be seen.
  let release;
  let fail = false;
  const llm = createFakeLLM({
    structured: async (opts) => {
      if (!opts.purpose.startsWith('map:walls')) return mapReading();
      if (opts.purpose === 'map:walls') await new Promise((r) => { release = r; });
      if (fail) throw new Error('overloaded');
      return { walls: [{ points: [{ x: 500, y: 0 }, { x: 500, y: 1000 }] }], doors: [{ from: { x: 0, y: 500 }, to: { x: 100, y: 500 } }], notes: 'Rough around the tower.' };
    },
  });
  await withPage({
    setup: { llm },
    before: async (t) => ({ dana: await addDm(t), map: await importMap(t, { patch: SHOWN }) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page) => {
    await openMapTab(page);
    assert.ok(!page.visible('#map-ai-note'), 'nothing to say yet');
    page.click('#map-edit');
    const button = page.$('#map-walls-draft');
    page.click('#map-walls-draft'); page.submit('#map-dialog form');
    // Straight away, before the server answers.
    assert.equal(button.textContent, 'AI walls: starting…');
    assert.ok(button.disabled);
    await page.waitFor(() => release, { what: 'the AI asked' });
    await page.waitFor(() => page.visible('#map-ai-note'), { what: 'the working message' });
    assert.equal(button.textContent, 'AI walls: working…');
    assert.ok(button.classList.contains('busy'));
    assert.equal(button.getAttribute('aria-busy'), 'true');
    assert.ok(page.$('#map-ai-note .spinner'));
    assert.match(page.text('#map-ai-note'), /AI walls: tracing the walls, doors and lights… \d+ s so far\./);
    assert.match(page.text('#map-ai-note'), /carry on meanwhile/);
    // It shows over the map whatever tools are open.
    page.click('#map-edit-done');
    assert.ok(page.visible('#map-ai-note'));
    page.click('#map-edit');

    release();
    await page.waitFor(() => /AI walls done/.test(page.text('#map-ai-note')), { what: 'the done message' });
    assert.match(page.text('#map-ai-note'), /AI walls done: 1 wall and 1 door in \d+ s \(extra high effort\)\. They're drawn in purple/);
    assert.match(page.text('#map-ai-note'), /Rough around the tower\./);
    assert.equal(button.textContent, 'AI walls…');
    assert.ok(!button.disabled);
    assert.ok(!page.$('#map-ai-note .spinner'));
    // Pressing on the message is the message's, not the map's: the map doesn't take the pointer
    // (in a browser it would then get the click, and the message couldn't be closed).
    page.pointer('#map-ai-note [aria-label=Close]', 'pointerdown', { clientX: 350, clientY: 20 });
    assert.ok(!page.$('#map-view').hasPointerCapture(1), 'the map took the pointer');
    page.pointer('#map-ai-note [aria-label=Close]', 'pointerup', { clientX: 350, clientY: 20 });
    // Closed, it stays closed (in this browser) until the next go.
    page.click('#map-ai-note [aria-label=Close]');
    assert.ok(!page.visible('#map-ai-note'));
    page.click('#map-fit');
    await page.settle();
    assert.ok(!page.visible('#map-ai-note'));

    // The next go fails: the DM is told why, and tries again from the message.
    fail = true;
    release = null;
    page.click('#map-walls-draft'); page.submit('#map-dialog form');
    await page.waitFor(() => release, { what: 'the AI asked again' });
    release();
    await page.waitFor(() => page.$('#map-ai-note.failed'), { what: 'the failed message' });
    assert.match(page.text('#map-ai-note'), /The AI couldn't draft walls/);
    fail = false;
    release = null;
    const again = [...page.$('#map-ai-note').querySelectorAll('button')].find((b) => b.textContent === 'Try again');
    again.click();
    await page.waitFor(() => release, { what: 'the AI asked a third time' });
    await page.waitFor(() => /tracing/.test(page.text('#map-ai-note')), { what: 'working again' });
    release();
    await page.waitFor(() => /AI walls done/.test(page.text('#map-ai-note')), { what: 'done again' });
  });
});

// Pressing ✕ on the AI walls message started a map pan, so the map got the click and the message stuck.
test('regression: Add a token asks who it is once (players, your creatures and the records in one list, not three overlapping fields)', async () => {
  await withPage({
    setup: { llm: createFakeLLM({ structured: async () => mapReading() }) },
    before: async (t) => {
      await upload(t, { transcript: SAMPLE });
      const dana = await addDm(t);
      const map = await importMap(t, { patch: SHOWN });
      await t.request('POST', `/campaigns/${t.campaign.id}/creatures`, { body: { name: 'Mira the innkeeper', kind: 'npc' } });
      return { dana, map };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    await openMapTab(page);
    page.click('#map-add-token');
    await page.waitFor(() => dialog(page).open);
    const form = dialog(page).querySelector('form');
    const labels = [...form.querySelectorAll('label.map-field > span')].map((l) => l.textContent);
    for (const old of ['From your creatures', "From the campaign's records", 'Player']) assert.ok(!labels.includes(old), `no separate "${old}" field`);
    assert.equal(page.$$('#map-dialog [role=listbox]').length, 1, 'one list of who it is');
    assert.equal(page.text('#map-dialog .who-option'), 'Someone new');
    page.type(fieldIn(form, 'Kind'), 'pc');
    assert.ok(whoGroups(page).Players.some((o) => o.startsWith('Thorin')), 'the players');
    page.type(fieldIn(form, 'Kind'), 'npc');
    assert.deepEqual(whoGroups(page)['Your creatures'], ['Mira the innkeeper (NPC)']);
    assert.ok(whoGroups(page)["In the campaign's records"].includes('Brother Hal'));
    pickWho(page, `p:${t.sam.id}`, 'pc');
    assert.equal(fieldIn(form, 'Kind').value, 'pc');
    assert.equal(fieldIn(form, 'Name').value, 'Thorin');
  });
});

// The owner (2026-10-20): "we can select what kind, but the list still shows all. Also, this list should be searchable".
test('regression: Add a token\'s "Who is it?" shows only the Kind picked, and its search box narrows it', async () => {
  await withPage({
    setup: { llm: createFakeLLM({ structured: async () => mapReading() }) },
    before: async (t) => {
      const dana = await addDm(t);
      const map = await importMap(t, { patch: SHOWN });
      for (const [name, kind] of [['Mira the innkeeper', 'npc'], ['Goblin boss', 'enemy'], ['Goblin archer', 'enemy'], ['Ogre', 'enemy']]) {
        await t.request('POST', `/campaigns/${t.campaign.id}/creatures`, { body: { name, kind } });
      }
      return { dana, map };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page) => {
    await openMapTab(page);
    page.click('#map-add-token');
    await page.waitFor(() => dialog(page).open);
    const form = dialog(page).querySelector('form');
    assert.equal(fieldIn(form, 'Kind').value, 'enemy');
    assert.deepEqual(whoGroups(page)['Your creatures'], ['Goblin archer (enemy)', 'Goblin boss (enemy)', 'Ogre (enemy)'], 'enemies only');
    assert.ok(!whoGroups(page).Players, 'no players for an enemy');
    page.type(fieldIn(form, 'Kind'), 'npc');
    assert.deepEqual(whoGroups(page)['Your creatures'], ['Mira the innkeeper (NPC)'], 'NPCs only');
    page.type(fieldIn(form, 'Kind'), 'enemy');
    const search = page.el('#map-dialog input[type=search]');
    page.type(search, 'gob');
    assert.deepEqual(whoGroups(page)['Your creatures'], ['Goblin archer (enemy)', 'Goblin boss (enemy)']);
    page.type(search, 'ARCHER');
    assert.deepEqual(whoGroups(page)['Your creatures'], ['Goblin archer (enemy)'], 'any case');
    page.type(search, 'dragon');
    assert.deepEqual(whoGroups(page), {});
    assert.match(page.text('#map-dialog .who-none'), /No Enemy called "dragon"/);
    assert.equal(page.text('#map-dialog .who-option'), 'Someone new', 'someone new is always there');
  });
});

// The owner (2026-10-20): "I don't see the option to change reasoning effort for AI walls".
test('regression: AI walls asks how hard the AI should think every time, sends it, and remembers the pick', async () => {
  const llm = createFakeLLM({
    structured: async (opts) => (opts.purpose.startsWith('map:walls') ? { walls: [{ points: [{ x: 500, y: 0 }, { x: 500, y: 1000 }] }], doors: [], notes: '' } : mapReading()),
  });
  await withPage({
    setup: { llm },
    before: async (t) => ({ dana: await addDm(t), map: await importMap(t, { patch: SHOWN }) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    await openMapTab(page);
    page.click('#map-edit');
    page.click('#map-walls-draft');
    assert.ok(dialog(page).open, 'a dialog, not a hidden setting');
    const radios = () => page.$$('#map-dialog input[name=walls-effort]');
    assert.deepEqual(radios().map((r) => r.value), ['low', 'medium', 'high', 'xhigh', 'max']);
    assert.equal(radios().find((r) => r.checked).value, 'xhigh', "the server's usual to start with");
    assert.match(page.text('#map-dialog'), /Extra high \(the usual\)/);
    page.type(radios()[0], true);
    page.submit('#map-dialog form');
    await page.waitFor(() => t.maps.list(t.campaign.id)[0].wall_draft.status === 'done', { what: 'the draft done' });
    assert.equal(t.maps.list(t.campaign.id)[0].wall_draft.effort, 'low');
    await page.waitFor(() => /AI walls done/.test(page.text('#map-ai-note')), { what: 'the done message' });
    assert.match(page.text('#map-ai-note'), /\(low effort\)/);
    page.click('#map-walls-draft');
    assert.equal(radios().find((r) => r.checked).value, 'low', 'kept for next time');
  });
});

// The owner (2026-10-20): the picked token's bar "is in the way of seeing the whole map".
test('regression: what is picked on the map shows below the map, not over it (except full screen and phones)', async () => {
  const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  const rule = css.match(/\n\.map-selection \{([^}]*)\}/)[1];
  assert.doesNotMatch(rule, /position:\s*absolute/, 'in the page');
  assert.match(css, /:root:is\(\[data-map-full\], \[data-phone\]\) \.map-selection \{[^}]*position: absolute/);
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await addToken(t, map, { kind: 'enemy', name: 'Ogre', x: 297.5, y: 297.5 });
      return { dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page) => {
    await openMapTab(page);
    assert.ok(!page.$('#map-view').contains(page.$('#map-selection')), 'not inside the map');
    assert.equal(page.$('#map-selection').previousElementSibling, page.$('#map-view'), 'right below it');
    page.key(tokenEl(page, 'Ogre'), 'Enter');
    assert.ok(page.visible('#map-selection'));
    // One short row: the rarer controls (light, height, picture, keeping, removing) wait under More.
    const more = page.$('#map-selection details.sel-more');
    assert.ok(more && !more.open);
    for (const text of ['Picture', 'Save to creatures', 'Remove']) assert.ok([...more.querySelectorAll('button')].some((b) => b.textContent === text), text);
    assert.ok(more.querySelector('[aria-label="Light carried"]') && more.querySelector('[aria-label="Height in feet"]'));
    assert.ok([...page.$('#map-selection').children].some((b) => b.textContent === 'Edit'), 'Edit stays out');
  });
});

test('regression: pressing on the AI walls message does not start a pan, so it can be closed', async () => {
  const llm = createFakeLLM({
    structured: async (opts) => (opts.purpose.startsWith('map:walls') ? { walls: [{ points: [{ x: 500, y: 0 }, { x: 500, y: 1000 }] }], doors: [], notes: '' } : mapReading()),
  });
  await withPage({
    setup: { llm },
    before: async (t) => ({ dana: await addDm(t), map: await importMap(t, { patch: SHOWN }) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page) => {
    await openMapTab(page);
    page.click('#map-edit');
    page.click('#map-walls-draft'); page.submit('#map-dialog form');
    await page.waitFor(() => /AI walls done/.test(page.text('#map-ai-note')), { what: 'the done message' });
    page.pointer('#map-ai-note [aria-label=Close]', 'pointerdown', { clientX: 350, clientY: 20 });
    assert.ok(!page.$('#map-view').hasPointerCapture(1), 'the map took the pointer');
  });
});

test('regression: a player\'s fog is drawn on a canvas, not an SVG mask (phones drew no fog at all)', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 320, y: 230 });
      await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 350, y1: 0, x2: 350, y2: 490 } } });
      await t.request('PATCH', `${base}/fog`, { body: { enabled: true, sight: true, map: 'grey' } });
    },
    page: (t) => ({ as: t.sam }),
  }, async (page) => {
    await openMapTab(page);
    assert.ok((await fogShapes(page)).length, 'there is fog to draw');
    assert.ok(page.$('#map-fog-canvas').width > 1, 'the fog canvas is sized to the map');
    assert.equal(page.$('#map-fog mask'), null, 'no SVG mask (some phone browsers silently skip a large one)');
  });
});

test('line of sight: a player sees what their token sees, opens the door next to them with a click; walls aren\'t drawn', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 320, y: 230 });
      await addToken(t, map, { kind: 'enemy', name: 'Goblin', x: 600, y: 400 });
      await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 350, y1: 0, x2: 350, y2: 210 } } });
      const res = await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 350, y1: 210, x2: 350, y2: 280, door: true } } });
      await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 350, y1: 280, x2: 350, y2: 490 } } });
      await t.request('PATCH', `${base}/fog`, { body: { enabled: true, sight: true } });
      return { base, door: res.json().walls.find((w) => w.door) };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { base, door }) => {
    await openMapTab(page);
    assert.ok((await fogShapes(page)).some((s) => s.points), 'his sight is cut out of the fog');
    // Only the door he can see, to click; no walls.
    assert.equal(page.$$('#map-walls line.door').length, 1);
    assert.ok(!page.$('#map-walls line.wall'));
    assert.ok(!page.visible('#map-wall-tools'));
    assert.ok(tokenEl(page, 'Thorin'));
    assert.ok(!tokenEl(page, 'Goblin'));
    drag(page, '#map-view', [[350, 245]]);
    await page.waitFor(() => tokenEl(page, 'Goblin'), { what: 'the goblin through the open door' });
    assert.ok(page.$('#map-walls line.door.open'));
    // Locked by the DM: it won't open again for him.
    await t.request('PATCH', `${base}/walls`, { body: { lock: door.id } });
    await page.waitFor(() => page.$('#map-walls line.door.locked'), { what: 'the door locked' });
    assert.ok(page.$('#map-walls .door-badge.locked'), 'he sees a padlock on it');
    drag(page, '#map-view', [[350, 245]]);
    await page.settle();
    assert.match(page.text('#map-status'), /locked/);
  });
});

test('regression: a player\'s fog follows their token while it is dragged, and stops at walls', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 87.5, y: 87.5 });
      // A room in the top left corner, open to the south; a wall further right.
      await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 210, y1: 0, x2: 210, y2: 210 } } });
      await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 420, y1: 0, x2: 420, y2: 490 } } });
      await t.request('PATCH', `${base}/fog`, { body: { enabled: true, sight: true } });
    },
    page: (t) => ({ as: t.sam }),
  }, async (page) => {
    await openMapTab(page);
    const sight = async () => JSON.stringify((await fogShapes(page)).find((s) => s.points)?.points);
    const before = await sight();
    assert.ok(before);
    const frame = () => new Promise((r) => setTimeout(r, 40));
    // Down below the room: the fog moves with him before he lets go.
    page.pointer(tokenEl(page, 'Thorin'), 'pointerdown', { clientX: 87, clientY: 87 });
    page.pointer('#map-view', 'pointermove', { clientX: 90, clientY: 150 });
    page.pointer('#map-view', 'pointermove', { clientX: 150, clientY: 350 });
    await frame();
    const moved = await sight();
    assert.notEqual(moved, before, 'the fog moved while dragging');
    // Over the far wall: he can't go there, so it still sees from where he was dragged from.
    page.pointer('#map-view', 'pointermove', { clientX: 500, clientY: 300 });
    await frame();
    assert.equal(await sight(), before);
    page.pointer('#map-view', 'pointermove', { clientX: 150, clientY: 350 });
    await frame();
    assert.equal(await sight(), moved);
    page.pointer('#map-view', 'pointerup', { clientX: 150, clientY: 350 });
    await page.settle();
  });
});

test('doors: drawn as doors; the DM clicks one to open, close, lock and unlock it', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const dana = await addDm(t);
      const map = await importMap(t, { patch: SHOWN });
      const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
      await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 350, y1: 210, x2: 350, y2: 280, door: true } } });
      return { dana, base };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { base }) => {
    await openMapTab(page);
    const door = async () => (await t.request('GET', base)).json().walls[0];
    // A closed door: frame posts at both ends, a plank with a door badge in the middle.
    assert.equal(page.$$('#map-walls .door-post').length, 2);
    assert.ok(page.$('#map-walls .door-badge:not(.locked)'));
    assert.ok(page.$('#map-selection').hidden);

    // A click picks it: what it is, and the buttons.
    drag(page, '#map-view', [[350, 245]]);
    await page.settle();
    assert.ok(!page.$('#map-selection').hidden);
    assert.match(page.text('#map-selection'), /Door.*Closed/);
    const button = (name) => page.$$('#map-selection button').find((b) => b.textContent === name);

    button('Lock').click();
    await page.settle();
    assert.equal((await door()).locked, true);
    assert.match(page.text('#map-selection'), /Locked: players can't open it/);
    assert.ok(page.$('#map-walls .door-badge.locked'), 'a padlock shows');

    button('Unlock').click();
    await page.settle();
    assert.equal((await door()).locked, false);

    // Open: it swings from its hinge and the badge goes.
    button('Open').click();
    await page.settle();
    assert.equal((await door()).open, true);
    assert.ok(page.$('#map-walls .door-swing'));
    assert.ok(!page.$('#map-walls .door-badge'));
    button('Close').click();
    await page.settle();
    assert.equal((await door()).open, false);

    // Locking an open door closes it; ✕ puts the bar away.
    button('Open').click();
    await page.settle();
    button('Lock').click();
    await page.settle();
    assert.deepEqual((({ open, locked }) => ({ open, locked }))(await door()), { open: false, locked: true });
    page.click('#map-selection [aria-label=Close]');
    assert.ok(page.$('#map-selection').hidden);
  });
});

test('curved and round walls, hiding the walls, and walls from a map maker\'s file', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => ({ dana: await addDm(t), map: await importMap(t, { patch: SHOWN }) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    await openMapTab(page);
    const map = async () => (await mapsOf(t))[0];
    page.click('#map-edit');

    // Curve: drag from end to end, move to bend it, click.
    page.click('[data-wall-mode=curve]');
    drag(page, '#map-view', [[100, 100], [150, 100], [200, 100]]);
    assert.match(page.text('#map-status'), /bend/);
    page.pointer('#map-view', 'pointermove', { clientX: 150, clientY: 150 });
    assert.ok(page.$('#map-walls polyline.wall-draft'), 'the bent curve shows while bending');
    page.pointer('#map-view', 'pointerdown', { clientX: 150, clientY: 150 });
    page.pointer('#map-view', 'pointerup', { clientX: 150, clientY: 150 });
    await page.settle();
    let walls = (await map()).walls;
    const curve = walls.length;
    assert.ok(curve >= 12, `a half circle in short pieces (${curve})`);
    assert.equal(new Set(walls.map((w) => w.group)).size, 1);
    assert.ok(walls.some((w) => Math.abs(w.y2 - 150) < 1 || Math.abs(w.y1 - 150) < 1), 'through the point it was bent to');

    // Circle: drag from the centre out.
    page.click('[data-wall-mode=circle]');
    drag(page, '#map-view', [[400, 300], [420, 300], [440, 300]]);
    await page.settle();
    walls = (await map()).walls;
    assert.equal(walls.length, curve + 36);

    // Erasing one piece of the curve erases all of it.
    page.click('[data-wall-mode=erase]');
    drag(page, '#map-view', [[440, 300]]);
    await page.settle();
    assert.equal((await map()).walls.length, curve, 'the whole circle went');

    // Walls hidden for a clean map (Fog & sight's Show walls): gone once done editing, back while editing.
    page.type('#map-show-walls', false);
    assert.ok(page.$('#map-walls line.wall'), 'still shown while editing');
    page.click('#map-edit-done');
    assert.ok(!page.$('#map-walls line.wall'));
    page.click('#map-edit');
    assert.ok(page.$('#map-walls line.wall'));
    page.type('#map-show-walls', true);

    // A Dungeondraft file of this map: exact walls and doors, no AI.
    const file = {
      format: 0.3,
      resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 20, y: 14 }, pixels_per_grid: 35 },
      line_of_sight: [[{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 5 }]],
      portals: [{ position: { x: 1, y: 2 }, bounds: [{ x: 1, y: 1 }, { x: 1, y: 3 }], closed: true }],
      lights: [],
    };
    page.setFiles('#map-walls-file-input', [{ name: 'clearing.dd2vtt', type: '', content: Buffer.from(JSON.stringify(file)) }]);
    await page.waitFor(() => /From the file/.test(page.text('#map-status')), { what: 'the walls from the file' });
    assert.match(page.text('#map-status'), /2 walls, 1 doors, 0 lights/);
    const fromFile = (await map()).walls.filter((w) => w.source === 'file');
    assert.deepEqual(fromFile.map(({ x1, y1, x2, y2, door }) => ({ x1, y1, x2, y2, door })), [
      { x1: 35, y1: 35, x2: 35, y2: 105, door: true },
      { x1: 35, y1: 35, x2: 175, y2: 35, door: false },
      { x1: 175, y1: 35, x2: 175, y2: 175, door: false },
    ]);

    // And out again from the same panel, as a Universal VTT file (the map has a grid).
    assert.ok(!page.$('#map-walls-export').disabled);
    page.click('#map-walls-export');
    await page.waitFor(() => page.downloads.length, { what: 'the download' });
    const out = JSON.parse(await page.downloads[0].text);
    assert.equal(out.portals.length, (await map()).walls.filter((w) => w.door).length);
    assert.ok(out.dndapp, 'with our own block for heights and stairs');
  });
});

test('maps: panning, wheel zoom (around the pointer) and Fit', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => ({ map: await importMap(t, { patch: SHOWN }) }),
    page: (t) => ({ as: t.sam }),
  }, async (page) => {
    await openMapTab(page);
    const transform = () => page.$('#map-stage').style.transform;
    assert.equal(transform(), 'translate(0px, 0px) scale(1)');
    drag(page, '#map-view', [[300, 200], [320, 230], [350, 260]]);
    assert.equal(transform(), 'translate(50px, 60px) scale(1)');
    page.$('#map-view').dispatchEvent(new page.window.WheelEvent('wheel', { deltaY: -462, clientX: 50, clientY: 60, bubbles: true, cancelable: true }));
    assert.match(transform(), /^translate\(50px, 60px\) scale\(1\.99/);
    page.click('#map-fit');
    assert.equal(transform(), 'translate(0px, 0px) scale(1)');
  });
});

test('maps: twisting two fingers turns the map (past a small twist), pins land under the finger, and N turns it back', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => ({ map: await importMap(t, { patch: SHOWN }) }),
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    const { state } = await page.module('map-state.js');
    const transform = () => page.$('#map-stage').style.transform;
    const finger = (type, id, x, y) => page.pointer('#map-view', type, { pointerId: id, clientX: x, clientY: y, isPrimary: id === 1 });
    const at = (deg, r = 100) => [300 + r * Math.cos((deg * Math.PI) / 180), 200 + r * Math.sin((deg * Math.PI) / 180)];
    finger('pointerdown', 1, 300, 200);
    finger('pointerdown', 2, ...at(0));
    // A pinch twists a little: no turn.
    finger('pointermove', 2, ...at(10));
    assert.equal(state.view.r, 0);
    assert.doesNotMatch(transform(), /rotate/);
    // Past the start, it turns the whole way the fingers have.
    for (const deg of [20, 40, 60, 90]) finger('pointermove', 2, ...at(deg));
    assert.ok(Math.abs(state.view.r - Math.PI / 2) < 1e-9, `turned ${state.view.r}`);
    assert.match(transform(), /rotate\(1\.57\d*rad\)/);
    finger('pointerup', 2, ...at(90));
    finger('pointerup', 1, 300, 200);
    assert.equal(page.$('#map-north').hidden, false, 'N shows while the map is turned');
    assert.match(page.$('#map-stage').style.getPropertyValue('--unturn'), /^-1\.57/, 'tokens and pins stay upright');

    // A pin dropped on the turned map lands on the map where the finger was.
    const { x, y, k, r } = state.view;
    const [sx, sy] = [400, 300];
    const want = { x: ((sx - x) * Math.cos(r) + (sy - y) * Math.sin(r)) / k, y: ((sy - y) * Math.cos(r) - (sx - x) * Math.sin(r)) / k };
    page.click('#map-pin');
    page.pointer('#map-view', 'pointerdown', { clientX: sx, clientY: sy });
    page.pointer('#map-view', 'pointerup', { clientX: sx, clientY: sy });
    await page.settle();
    const [pin] = (await t.request('GET', `/campaigns/${t.campaign.id}/maps/${map.id}/pins`, { as: t.sam.token })).json().pins;
    assert.ok(Math.abs(pin.x - want.x) < 0.01 && Math.abs(pin.y - want.y) < 0.01, `pin at ${pin.x},${pin.y}, wanted ${want.x},${want.y}`);

    page.click('#map-north');
    assert.equal(state.view.r, 0);
    assert.equal(page.$('#map-north').hidden, true);
    assert.doesNotMatch(transform(), /rotate/);

    // Turned a little and let go near north: it straightens.
    finger('pointerdown', 1, 300, 200);
    finger('pointerdown', 2, ...at(0));
    for (const deg of [10, 20, 25, 5]) finger('pointermove', 2, ...at(deg));
    assert.ok(state.view.r > 0);
    finger('pointerup', 2, ...at(5));
    finger('pointerup', 1, 300, 200);
    assert.equal(state.view.r, 0);

    // Fit turns it north up too.
    finger('pointerdown', 1, 300, 200);
    finger('pointerdown', 2, ...at(0));
    for (const deg of [20, 60]) finger('pointermove', 2, ...at(deg));
    finger('pointerup', 2, ...at(60));
    finger('pointerup', 1, 300, 200);
    assert.ok(state.view.r > 0.5);
    page.click('#map-fit');
    assert.equal(transform(), 'translate(0px, 0px) scale(1)');
  });
});

test('regression: the finger that stays still in a pinch is not a tap when it lifts (it dropped a pin in Pin mode)', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => ({ map: await importMap(t, { patch: SHOWN }) }),
    page: (t) => ({ as: t.sam }),
  }, async (page) => {
    await openMapTab(page);
    const finger = (type, id, x, y) => page.pointer('#map-view', type, { pointerId: id, clientX: x, clientY: y, isPrimary: id === 1 });
    page.click('#map-pin');
    finger('pointerdown', 1, 300, 200);
    finger('pointerdown', 2, 400, 200);
    finger('pointermove', 2, 450, 205);
    finger('pointerup', 2, 450, 205);
    finger('pointerup', 1, 300, 200);
    await page.settle();
    assert.equal(page.$$('#map-pins .map-pin').length, 0);
  });
});

test('pins: a player drops a pin only they see, labels it, recolours it, moves it and removes it', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => ({ map: await importMap(t, { patch: SHOWN }) }),
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    const pins = async (as = t.sam.token) => (await t.request('GET', `/campaigns/${t.campaign.id}/maps/${map.id}/pins`, { as })).json().pins;
    page.click('#map-pin');
    assert.equal(page.$('#map-pin').getAttribute('aria-pressed'), 'true');
    assert.match(page.text('#map-status'), /Click the map where the pin goes/);
    page.pointer('#map-view', 'pointerdown', { clientX: 200, clientY: 150 });
    page.pointer('#map-view', 'pointerup', { clientX: 200, clientY: 150 });
    await page.settle();
    assert.equal(page.$('#map-pin').getAttribute('aria-pressed'), 'false');
    assert.equal(page.$$('#map-pins .map-pin').length, 1);
    assert.match(page.text('#map-selection'), /Your pin.*Only you see it/);
    let [pin] = await pins();
    assert.deepEqual([pin.x, pin.y], [200, 150]);
    assert.deepEqual(await pins(t.alex.token), []);
    assert.deepEqual(await pins(t.dmToken), [], 'not even the DM');

    page.type('#map-selection [aria-label="Pin label"]', ' Secret door? ');
    await page.settle();
    page.type('#map-selection [aria-label="Pin colour"]', '#00ff00');
    await page.settle();
    [pin] = await pins();
    assert.equal(pin.label, 'Secret door?');
    assert.equal(pin.color, '#00ff00');
    assert.equal(page.text('#map-pins .map-pin-label'), 'Secret door?');

    drag(page, '#map-pins .map-pin', [[200, 150], [250, 180], [300, 200]]);
    await page.settle();
    [pin] = await pins();
    assert.deepEqual([pin.x, pin.y], [300, 200]);

    page.key('#map-pins .map-pin', 'Enter');
    page.click(selectionButton(page, 'Remove'));
    await page.settle();
    assert.deepEqual(await pins(), []);
    assert.equal(page.$$('#map-pins .map-pin').length, 0);
  });
});

test('stat blocks: the DM asks the AI for one, sees it, and can look up another creature', async () => {
  const ogreBlock = {
    found: true, name: 'Ogre', size: 'large', ac: 11, hp_average: 59, hp_formula: '7d10 + 21', speed: '40 ft.', challenge: '2 (450 XP)',
    stat_block: '**Ogre** Large giant\n\n**Greatclub.** +6 to hit, 2d8 + 4 bludgeoning.<img src=x onerror="window.hacked=1">',
  };
  await withPage({
    setup: { llm: mapLLM(ogreBlock) },
    before: async (t) => ({ dana: await addDm(t), map: await importMap(t, { patch: SHOWN }) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map }) => {
    await addToken(t, map, { kind: 'enemy', name: 'Ogre 1', x: 105, y: 105 });
    await openMapTab(page);
    await page.waitFor(() => tokenEl(page, 'Ogre 1'));
    page.key(tokenEl(page, 'Ogre 1'), 'Enter');
    page.click(selectionButton(page, 'Stat block (AI)'));
    await page.waitFor(() => selectionButton(page, 'Stat block'), { what: 'the stat block' });
    assert.match(page.text('#map-selection'), /59 \/ 59 HP/);
    assert.match(page.text('#map-selection'), /Large/);
    page.click(selectionButton(page, 'Stat block'));
    assert.ok(dialog(page).open);
    assert.equal(page.text(dialog(page).querySelector('h2')), 'Ogre 1: Ogre');
    assert.equal(page.text(dialog(page).querySelector('h2 + p')), 'AC 11 · HP 7d10 + 21 · 40 ft. · CR 2 (450 XP)');
    assert.match(page.text(dialog(page).querySelector('.stat-text')), /Greatclub/);
    assert.equal(dialog(page).querySelector('.stat-text img'), null);

    page.type(dialog(page).querySelector('input'), 'Bugbear');
    page.submit(dialog(page).querySelector('form'));
    await page.settle();
    assert.ok(!dialog(page).open);
    assert.ok(page.requests.some((r) => r.path.endsWith('/stats') && r.body?.name === 'Bugbear'));
  });
});

test("records: a token for someone in the campaign's records; the DM reads what the archivist wrote", async () => {
  await withPage({
    setup: { llm: createFakeLLM({ structured: async () => mapReading() }) },
    before: async (t) => {
      await upload(t, { transcript: SAMPLE });
      return { dana: await addDm(t), map: await importMap(t, { patch: SHOWN }) };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page) => {
    await openMapTab(page);
    page.click('#map-add-token');
    await page.waitFor(() => dialog(page).open);
    const form = dialog(page).querySelector('form');
    page.type(fieldIn(form, 'Kind'), 'npc');
    const hal = page.$$('#map-dialog .who-option').find((o) => o.textContent === 'Brother Hal');
    assert.ok(hal, 'the archivist recorded Brother Hal');
    page.click(hal);
    assert.equal(fieldIn(form, 'Name').value, 'Brother Hal');
    assert.equal(fieldIn(form, 'Kind').value, 'npc');
    page.submit(form);
    await page.settle();
    page.click(selectionButton(page, 'Record'));
    await page.waitFor(() => dialog(page).open && /Innkeeper/.test(page.text(dialog(page))), { what: 'the record' });
    assert.equal(page.text(dialog(page).querySelector('h2')), 'Brother Hal');
    assert.match(page.text(dialog(page).querySelector('.stat-text')), /^Innkeeper in Brindle/);
  });
});

test('maps: after the live connection drops, the page reconnects and catches up on what it missed', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      return { map, ogre: await addToken(t, map, { kind: 'enemy', name: 'Ogre', x: 297.5, y: 297.5 }) };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { map, ogre }) => {
    await openMapTab(page);
    const listens = () => page.requests.filter((r) => r.path.endsWith('/maps/events')).length;
    assert.equal(listens(), 1);
    t.app.server.closeAllConnections();
    await new Promise((r) => setTimeout(r, 50));
    await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${map.id}/tokens/${ogre.id}`, { body: { x: 87.5, y: 87.5 } });
    await page.waitFor(() => tokenEl(page, 'Ogre').style.left === '70px', { what: 'the catch-up' });
    await page.waitFor(() => listens() === 2, { what: 'the reconnect' });
  });
});

test('companions: a player adds their wolf (stat block from the AI), rolls its bite from the stat block, and dismisses it; the Companion button is for players', async () => {
  const wolf = {
    found: true, name: 'Wolf', size: 'medium', ac: 13, hp_average: 11, hp_formula: '2d8 + 2', speed: '40 ft.', challenge: '1/4 (50 XP)',
    stat_block: '**Wolf**\n\n| STR | DEX | CON | INT | WIS | CHA |\n|---|---|---|---|---|---|\n| 12 (+1) | 15 (+2) | 12 (+1) | 3 (-4) | 12 (+1) | 6 (-2) |\n\n***Bite.*** *Melee Weapon Attack:* +4 to hit. *Hit:* 7 (2d4 + 2) piercing damage.',
  };
  await withPage({
    setup: { llm: mapLLM(wolf) },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      return { map };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t) => {
    await openMapTab(page);
    page.click('#map-add-companion');
    await page.waitFor(() => dialog(page).open);
    const form = dialog(page).querySelector('form');
    page.type(fieldIn(form, 'Name'), 'Wolf');
    page.submit(form);
    await page.waitFor(() => tokenEl(page, 'Wolf')?.classList.contains('mine'));
    await page.waitFor(() => selectionButton(page, 'Roll'));
    const token = (await mapsOf(t))[0].tokens.find((x) => x.name === 'Wolf');
    assert.equal(token.kind, 'companion');
    assert.equal(token.user_id, t.sam.id);
    assert.deepEqual(token.hp, { current: 11, max: 11 });
    assert.ok(tokenEl(page, 'Wolf').classList.contains('movable'));

    selectionButton(page, 'Roll').click();
    await page.waitFor(() => dialog(page).open && dialogButton(page, 'To hit +4'));
    assert.ok(dialogButton(page, 'Damage 2d4+2'));
    assert.ok(dialogButton(page, 'DEX +2'));
    dialogButton(page, 'To hit +4').click();
    await page.settle();
    const sent = page.requests.filter((r) => r.path.endsWith('/roll')).at(-1);
    assert.equal(sent.body.notation, '1d20+4');
    assert.equal(sent.body.label, 'Wolf: Bite to hit');

    selectionButton(page, 'Dismiss').click();
    await page.settle();
    assert.ok(!(await mapsOf(t))[0].tokens.some((x) => x.name === 'Wolf'));
  });
  await withPage({ setup: { llm: mapLLM() }, before: async (t) => ({ map: await importMap(t, { patch: SHOWN }), dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana }) }, async (page, t) => {
    await openMapTab(page);
    assert.ok(page.$('#tab-map').classList.contains('can-edit'));
    // Players only (the stylesheet hides .player-only for the DM; the DM adds companions with Add token).
    assert.ok(page.$('#map-add-companion').classList.contains('player-only'));
    page.click('#map-add-token');
    await page.waitFor(() => dialog(page).open);
    const form = dialog(page).querySelector('form');
    const tick = [...form.querySelectorAll('label.map-check')].find((l) => /companion or summon of theirs/.test(l.textContent));
    assert.ok(tick.hidden, 'only once a player is picked');
    pickWho(page, `p:${t.sam.id}`, 'pc');
    assert.ok(!tick.hidden);
    page.type(tick.querySelector('input'), true);
    page.type(fieldIn(form, 'Name'), 'Hawk');
    page.submit(form);
    await page.settle();
    const hawk = (await mapsOf(t))[0].tokens.find((x) => x.name === 'Hawk');
    assert.deepEqual([hawk.kind, hawk.user_id], ['companion', t.sam.id]);
  });
});
