/**
 * The Map tab's fight tools (map.js): the turn order panel, the Measure
 * tool and spell templates.
 *
 * Like map.test.js, the map view is 700 x 490 and fitted, so a point on
 * screen is the same point on the map (35 px squares, 5 ft each).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, importMap, addToken, mapReading, createFakeLLM } from './helpers.js';

const mapLLM = () => createFakeLLM({ structured: async () => mapReading() });
const SHOWN = { shown: true, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } };

async function openMapTab(page) {
  page.click('[data-tab=map]');
  page.setRect('#map-view', { width: 700, height: 490 });
  page.click('#map-fit');
  await page.settle();
}

const tokenEl = (page, name) => page.$(`#map-tokens .token[aria-label="${name}"]`);
const panelButton = (page, text) => [...page.$('#map-combat').querySelectorAll('button')].find((b) => b.textContent === text);
const selectionButton = (page, text) => [...page.$('#map-selection').querySelectorAll('button')].find((b) => b.textContent === text);
const dialog = (page) => page.$('#map-dialog');
const fieldIn = (root, label) => [...root.querySelectorAll('label')].find((l) => l.firstChild?.textContent.startsWith(label))?.querySelector('input, select');
const order = (page) => page.$$('#map-combat li .who').map((b) => b.textContent);

/** Click on the map at (x, y) (screen = map pixels after Fit). */
function click(page, x, y, target = '#map-view') {
  page.pointer(target, 'pointerdown', { clientX: x, clientY: y });
  page.pointer('#map-view', 'pointerup', { clientX: x, clientY: y });
}

test('initiative: the DM starts a fight from the panel; the player rolls, takes their turn and ends it', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      const thorin = await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      const goblin = await addToken(t, map, { kind: 'enemy', name: 'Goblin', x: 122.5, y: 52.5, stats: { text: 'DEX 14 (+2)' } });
      const lurker = await addToken(t, map, { kind: 'enemy', name: 'Lurker', x: 192.5, y: 52.5, hidden: true });
      return { map, thorin, goblin, lurker, dana: await addDm(t) };
    },
    page: (t) => ({ as: t.sam, storage: { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) } }),
  }, async (page, t, { map, thorin, goblin, lurker }) => {
    await openMapTab(page);
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    // No fight: the panel is closed; opening it says so.
    assert.ok(!page.visible('#map-combat'));
    page.click('#map-combat-open');
    assert.match(page.text('#map-combat'), /No fight on this map\./);
    assert.equal(panelButton(page, 'Start a fight'), undefined);
    page.click('#map-combat-open');

    // The DM starts one: it opens on its own, without the hidden lurker.
    await t.request('POST', `${base}/combat`, { body: { action: 'start' } });
    await page.waitFor(() => page.visible('#map-combat') && order(page).length, { what: 'the fight to start' });
    assert.deepEqual(order(page), ['Goblin', 'Thorin']); // the goblin rolled; Thorin hasn't yet
    assert.match(page.text('#map-combat'), /Round 1.*not started yet/);
    assert.equal(page.$('#map-combat [aria-label="Initiative for Goblin"]'), null, "not Sam's to change");

    // Sam rolls for Thorin: with the dice (shown and shared like any roll), straight into the fight.
    page.click('#map-combat [aria-label="Roll initiative for Thorin"]');
    await page.settle();
    const sent = page.requests.filter((r) => r.path.endsWith('/roll')).at(-1).body;
    assert.deepEqual(sent, { mode: 'normal', label: 'Initiative', visibility: 'party', initiative: true });
    assert.equal(page.text('#dice-result .dr-label'), 'Initiative');
    assert.match(page.text('#dice-result .dr-note'), /^In the turn order on .+\.$/);
    await page.waitFor(() => !page.$('#map-combat [aria-label="Roll initiative for Thorin"]'), { what: 'the roll to reach the fight' });
    assert.ok(t.maps.get(t.campaign.id, map.id).combat.entries.find((e) => e.id === thorin.id).init != null);
    // He types what he rolled at the table instead.
    page.type('#map-combat [aria-label="Initiative for Thorin"]', '25');
    await page.settle();
    assert.deepEqual(order(page), ['Thorin', 'Goblin']);

    // The DM starts the turns: Thorin's token is marked and Sam can end his turn.
    // Fix the others' rolls so the order is known: Thorin 25, Goblin 20, the lurker 1.
    await t.request('POST', `${base}/combat`, { body: { action: 'set', id: goblin.id, init: 20 } });
    await t.request('POST', `${base}/combat`, { body: { action: 'set', id: lurker.id, init: 1 } });
    await t.request('POST', `${base}/combat`, { body: { action: 'next' } });
    await page.waitFor(() => tokenEl(page, 'Thorin').classList.contains('turn'), { what: "Thorin's turn" });
    assert.match(page.text('#map-combat'), /Thorin's turn/);
    assert.ok(page.$('#map-combat li.current').textContent.startsWith('Thorin'));
    page.click(panelButton(page, 'End my turn'));
    await page.settle();
    assert.ok(tokenEl(page, 'Goblin').classList.contains('turn'));
    assert.equal(panelButton(page, 'End my turn'), undefined);
    assert.equal((await t.request('GET', base)).json().combat.turn, goblin.id);

    // Clicking a name selects that token.
    page.click(page.$$('#map-combat li .who')[1]);
    assert.match(page.text('#map-selection'), /^Goblin/);

    // The DM ends the fight: the panel closes for players.
    await t.request('POST', `${base}/combat`, { body: { action: 'end' } });
    await page.waitFor(() => !page.visible('#map-combat'), { what: 'the panel to close' });
    assert.ok(!tokenEl(page, 'Goblin').classList.contains('turn'));
    assert.ok(thorin);
  });
});

test('initiative: the DM runs the fight from the panel (start, add, first turn, back, take out, end)', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      await addToken(t, map, { kind: 'enemy', name: 'Goblin', x: 122.5, y: 52.5 });
      return { map, dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    page.click('#map-combat-open');
    assert.equal(page.$('#map-combat-open').getAttribute('aria-pressed'), 'true');
    page.click(panelButton(page, 'Start a fight'));
    await page.settle();
    assert.match(page.text('#map-status'), /^Goblin rolled \d+ for initiative/);
    assert.deepEqual(order(page), ['Goblin', 'Thorin']);
    assert.ok(panelButton(page, 'Back').disabled);

    // A new token joins through "+ Add"; "Roll for NPCs" rolls the ones not rolled yet.
    await addToken(t, map, { kind: 'npc', name: 'Brother Hal', x: 262.5, y: 52.5 });
    await page.waitFor(() => page.$('#map-combat [aria-label="Add to the fight"]'), { what: 'someone to add' });
    page.type('#map-combat [aria-label="Add to the fight"]', page.$$('#map-combat [aria-label="Add to the fight"] option')[1].value);
    await page.settle();
    assert.equal(order(page).length, 3);
    page.click(panelButton(page, 'Roll for NPCs'));
    await page.settle();
    assert.match(page.text('#map-status'), /^Brother Hal rolled/);
    assert.equal(panelButton(page, 'Roll for NPCs'), undefined);

    // The DM types the rolls, then runs the turns.
    page.type('#map-combat [aria-label="Initiative for Thorin"]', '20');
    await page.settle();
    page.type('#map-combat [aria-label="Initiative for Goblin"]', '10');
    await page.settle();
    page.type('#map-combat [aria-label="Initiative for Brother Hal"]', '5');
    await page.settle();
    assert.deepEqual(order(page), ['Thorin', 'Goblin', 'Brother Hal']);
    page.click(panelButton(page, 'First turn'));
    await page.settle();
    page.click(panelButton(page, 'Next turn'));
    await page.settle();
    assert.match(page.text('#map-combat'), /Round 1.*Goblin's turn/);
    page.click(panelButton(page, 'Back'));
    await page.settle();
    assert.match(page.text('#map-combat'), /Thorin's turn/);
    // Taking Thorin out on his turn passes it on.
    page.click('#map-combat [aria-label="Take Thorin out of the fight"]');
    await page.settle();
    assert.deepEqual(order(page), ['Goblin', 'Brother Hal']);
    assert.match(page.text('#map-combat'), /Goblin's turn/);

    page.click(panelButton(page, 'End fight'));
    await page.settle();
    assert.match(page.text('#map-combat'), /No fight on this map/);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/maps/${map.id}`)).json().combat, null);
  });
});

test('measure: drag on the map to measure (squares on a grid); the line stays until Measure is switched off', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      return { map };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page) => {
    await openMapTab(page);
    page.click('#map-ruler');
    assert.equal(page.$('#map-ruler').getAttribute('aria-pressed'), 'true');
    assert.match(page.text('#map-status'), /Drag on the map to measure/);
    // Starting on a token measures from it rather than moving it.
    page.pointer(tokenEl(page, 'Thorin'), 'pointerdown', { clientX: 52, clientY: 52 });
    page.pointer('#map-view', 'pointermove', { clientX: 125, clientY: 130 });
    assert.equal(page.text('#map-measure'), '10 ft · 2 squares');
    page.pointer('#map-view', 'pointermove', { clientX: 160, clientY: 55 });
    page.pointer('#map-view', 'pointerup', { clientX: 160, clientY: 55 });
    await page.settle();
    assert.equal(page.text('#map-measure'), '15 ft · 3 squares');
    assert.ok(page.visible('#map-measure'));
    const line = page.$('#map-ruler-line line.ruler');
    assert.deepEqual(['x1', 'y1', 'x2', 'y2'].map((a) => Number(line.getAttribute(a))), [52.5, 52.5, 157.5, 52.5]);
    assert.equal(tokenEl(page, 'Thorin').style.left, `${52.5 - 17.5}px`, 'the token stayed put');

    page.click('#map-ruler');
    assert.ok(!page.visible('#map-measure'));
    assert.equal(page.$('#map-ruler-line line'), null);
  });
});

test('templates: a player places a spell from their sheet, sees who it catches, moves it; others see it live', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      await addToken(t, map, { kind: 'enemy', name: 'Goblin', x: 332.5, y: 332.5 });
      await addToken(t, map, { kind: 'enemy', name: 'Orc', x: 402.5, y: 297.5 });
      const { sheet, version } = (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token })).json();
      const spells = [
        { name: 'Fireball', level: 3, range: '150 feet', description: 'Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw.' },
        { name: 'Magic Missile', level: 1, range: '120 feet', description: 'You create three glowing darts.' },
      ];
      await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...sheet, spells }, version } });
      return { map };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    page.click('#map-template');
    await page.waitFor(() => dialog(page).open, { what: 'the template dialog' });
    const form = dialog(page).querySelector('form');
    const spell = fieldIn(form, 'One of your spells');
    // Only spells with an area are offered.
    assert.deepEqual([...spell.options].map((o) => o.textContent), ['None (choose a shape)', 'Fireball (20 ft radius)']);
    page.type(spell, '0');
    assert.equal(fieldIn(form, 'Shape').value, 'circle');
    assert.equal(fieldIn(form, 'Radius').value, '20');
    assert.equal(fieldIn(form, 'Label').value, 'Fireball');
    page.submit(form);
    assert.equal(page.$('#map-template').getAttribute('aria-pressed'), 'true');

    // Click where it centres: the nearest square corner (350, 315).
    click(page, 352, 318);
    await page.settle();
    const [tpl] = (await t.request('GET', `/campaigns/${t.campaign.id}/maps/${map.id}`)).json().templates;
    assert.deepEqual({ shape: tpl.shape, x: tpl.x, y: tpl.y, size: tpl.size, label: tpl.label, user_id: tpl.user_id }, { shape: 'circle', x: 350, y: 315, size: 20, label: 'Fireball', user_id: t.sam.id });
    assert.equal(page.$('#map-template').getAttribute('aria-pressed'), 'false');
    assert.equal(Number(page.$('#map-templates circle').getAttribute('r')), 140); // 20 ft = 4 squares
    assert.match(page.text('#map-selection'), /Fireball.*20 ft radius.*Catches Goblin, Orc/);
    assert.ok(tokenEl(page, 'Goblin').classList.contains('caught'));
    assert.ok(!tokenEl(page, 'Thorin').classList.contains('caught'));

    // Drag it over Thorin: now only he is caught.
    page.pointer('#map-view', 'pointerdown', { clientX: 350, clientY: 315 });
    page.pointer('#map-view', 'pointermove', { clientX: 200, clientY: 200 });
    page.pointer('#map-view', 'pointermove', { clientX: 70, clientY: 70 });
    page.pointer('#map-view', 'pointerup', { clientX: 70, clientY: 70 });
    await page.settle();
    const moved = (await t.request('GET', `/campaigns/${t.campaign.id}/maps/${map.id}`)).json().templates[0];
    assert.deepEqual([moved.x, moved.y], [70, 70]);
    assert.match(page.text('#map-selection'), /Catches Thorin(?!,)/);

    // Closing the bar, then clicking inside the template picks it again.
    page.click(selectionButton(page, '✕'));
    assert.ok(!page.visible('#map-selection'));
    click(page, 60, 60);
    assert.match(page.text('#map-selection'), /Fireball/);

    // A cone from the DM arrives live; Sam can't turn or remove it.
    await t.request('POST', `/campaigns/${t.campaign.id}/maps/${map.id}/templates`, { body: { shape: 'cone', x: 560, y: 245, angle: 180, size: 15, label: 'Breath' } });
    await page.waitFor(() => page.$('#map-templates polygon'), { what: 'the cone' });
    click(page, 530, 245);
    assert.match(page.text('#map-selection'), /Breath.*15 ft cone/);
    assert.equal(selectionButton(page, 'Remove'), undefined);

    // His own he removes.
    click(page, 60, 60);
    page.click(selectionButton(page, 'Remove'));
    await page.settle();
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/maps/${map.id}`)).json().templates.length, 1);
    assert.equal(page.$('#map-templates circle'), null);
  });
});
