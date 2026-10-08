/**
 * More of the Map tab (map.js): lights and darkness, pings and quick
 * drawing, planned movement, map variants and linked maps.
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
const mapOf = async (t, map) => (await t.request('GET', `/campaigns/${t.campaign.id}/maps/${map.id}`)).json();

/** Click on the map at (x, y) (screen = map pixels after Fit). */
function click(page, x, y, target = '#map-view') {
  page.pointer(target, 'pointerdown', { clientX: x, clientY: y });
  page.pointer('#map-view', 'pointerup', { clientX: x, clientY: y });
}

test('lights: the DM turns on darkness, places a torch and a brazier, and erases one; a player lights their own torch', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      return { map, dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    page.click('#map-fog-open');
    assert.ok(page.$('#map-dark-on').disabled, 'darkness needs fog and line of sight');
    page.type('#map-fog-on', true);
    await page.settle();
    page.type('#map-sight-on', true);
    await page.settle();
    page.type('#map-dark-on', true);
    await page.settle();
    assert.equal((await mapOf(t, map)).fog.dark, true);

    // A torch (the default), then a brazier picked from the list.
    page.click('[data-wall-mode=light]');
    click(page, 300, 200);
    await page.settle();
    page.type('#map-light-kind', 'fire');
    click(page, 500, 300);
    await page.settle();
    const { lights } = await mapOf(t, map);
    assert.deepEqual(lights.map(({ x, y, bright, dim }) => ({ x, y, bright, dim })), [{ x: 300, y: 200, bright: 20, dim: 20 }, { x: 500, y: 300, bright: 20, dim: 20 }]);
    assert.equal(page.$$('#map-walls .light-dim').length, 2);
    assert.equal(Number(page.$('#map-walls .light-dim').getAttribute('r')), 280); // 40 ft
    assert.match(page.text('#map-wall-hint'), /2 lights.*where there is light or their darkvision reaches/);

    // Erase: a click on the light removes it.
    page.click('[data-wall-mode=erase]');
    click(page, 302, 198);
    await page.settle();
    assert.equal((await mapOf(t, map)).lights.length, 1);

    // The DM gives Thorin darkvision in the token dialog.
    click(page, 52, 52, tokenEl(page, 'Thorin'));
    page.click([...page.$('#map-selection').querySelectorAll('button')].find((b) => b.textContent === 'Edit'));
    await page.waitFor(() => page.$('#map-dialog').open);
    const dv = [...page.$('#map-dialog').querySelectorAll('label')].find((l) => /^Darkvision/.test(l.textContent)).querySelector('input');
    page.type(dv, '60');
    page.submit(page.$('#map-dialog form'));
    await page.settle();
    assert.equal((await mapOf(t, map)).tokens[0].darkvision, 60);
  });

  // The player picks a torch for their own token.
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      return { map };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    page.key(tokenEl(page, 'Thorin'), 'Enter');
    page.type('#map-selection [aria-label="Light carried"]', 'torch');
    await page.settle();
    assert.deepEqual((await mapOf(t, map)).tokens[0].light, { bright: 20, dim: 20 });
    assert.equal(page.$('#map-selection [aria-label="Light carried"]').value, 'torch');
  });
});

test('pings and sketches: shown live for a moment; other players\' only where you can see; Alt+click pings', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      await addToken(t, map, { kind: 'pc', name: 'Lyra', user_id: t.alex.id, x: 612.5, y: 402.5, color: '#aa3399' });
      // Fog: Sam only sees the top-left quarter.
      await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${map.id}/fog`, { body: { enabled: true, add: { op: 'reveal', x: 0, y: 0, w: 350, h: 245 } } });
      return { map };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    const pings = () => page.$$('#map-signals .ping-mark');

    // The DM pings somewhere fogged: Sam still sees it (the DM is pointing).
    await t.request('POST', `${base}/ping`, { body: { x: 600, y: 400 } });
    await page.waitFor(() => pings().length === 1, { what: "the DM's ping" });
    assert.equal(pings()[0].getAttribute('style'), '--sig:#ffd54a');
    assert.match(page.text('#map-status'), /pinged the map/);
    // Alex pings where Sam can't see: nothing. Then where he can: Lyra's colour.
    await t.request('POST', `${base}/ping`, { as: t.alex.token, body: { x: 600, y: 400 } });
    await t.request('POST', `${base}/ping`, { as: t.alex.token, body: { x: 100, y: 100 } });
    await page.waitFor(() => pings().some((p) => p.getAttribute('style') === '--sig:#aa3399'), { what: "Alex's ping" });
    assert.equal(pings().length, 2);

    // Sam pings with the tool, and with Alt+click.
    page.click('#map-ping');
    assert.equal(page.$('#map-ping').getAttribute('aria-pressed'), 'true');
    click(page, 200, 150);
    await page.waitFor(() => pings().length === 3, { what: "Sam's ping" });
    page.click('#map-ping');
    page.pointer('#map-view', 'pointerdown', { clientX: 120, clientY: 120, altKey: true });
    page.pointer('#map-view', 'pointerup', { clientX: 120, clientY: 120, altKey: true });
    await page.waitFor(() => pings().length === 4, { what: 'the Alt+click ping' });

    // A sketch: drawn while dragging, then everyone's.
    page.click('#map-draw');
    page.pointer('#map-view', 'pointerdown', { clientX: 50, clientY: 200 });
    for (let x = 60; x <= 200; x += 20) page.pointer('#map-view', 'pointermove', { clientX: x, clientY: 200 + (x % 40) });
    assert.ok(page.$('#map-signals polyline'), 'drawn while dragging');
    page.pointer('#map-view', 'pointerup', { clientX: 200, clientY: 200 });
    await page.waitFor(() => page.$('#map-signals polyline[data-signal]'), { what: 'the sketch' });
    assert.equal(page.$('#map-signals polyline[data-signal]').getAttribute('points').split(' ').length, 9);

    // Pings go after a few seconds.
    await page.waitFor(() => pings().length === 0, { what: 'the pings to go', timeout: 6000 });
  });
});

test('movement: Space adds a waypoint while dragging; the label counts difficult terrain and the turn\'s speed', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      const thorin = await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 17.5, y: 17.5, speed: 30 });
      const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
      await t.request('PATCH', `${base}/terrain`, { body: { add: { points: [[105, 0], [175, 0], [175, 490], [105, 490]] } } });
      await t.request('POST', `${base}/combat`, { body: { action: 'start' } });
      await t.request('POST', `${base}/combat`, { body: { action: 'set', id: thorin.id, init: 10 } });
      await t.request('POST', `${base}/combat`, { body: { action: 'next' } });
      return { map };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    assert.ok(page.$('#map-terrain polygon.difficult'), 'players see difficult terrain');
    // Down two squares, Space, then right four (two of them difficult).
    page.pointer(tokenEl(page, 'Thorin'), 'pointerdown', { clientX: 17, clientY: 17 });
    page.pointer('#map-view', 'pointermove', { clientX: 17, clientY: 50 });
    page.pointer('#map-view', 'pointermove', { clientX: 17, clientY: 87 });
    page.key(page.window.document.body, ' ');
    assert.equal(page.$$('#map-ruler-line circle.waypoint').length, 1);
    page.pointer('#map-view', 'pointermove', { clientX: 157, clientY: 87 });
    assert.equal(page.text('#map-measure'), '40 ft · difficult · 40 / 30 ft this turn');
    assert.ok(page.$('#map-measure').classList.contains('over'));
    page.pointer('#map-view', 'pointerup', { clientX: 157, clientY: 87 });
    await page.settle();
    const saved = await mapOf(t, map);
    assert.deepEqual([saved.tokens[0].x, saved.tokens[0].y], [157.5, 87.5]);
    assert.equal(saved.combat.entries[0].moved, 40);
  });
});

test('difficult terrain: the DM drags an area (snapped to squares) and erases it', async () => {
  await withPage({
    setup: { llm: mapLLM() },
    before: async (t) => ({ map: await importMap(t, { patch: SHOWN }), dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    page.click('#map-fog-open');
    page.click('[data-wall-mode=difficult]');
    page.pointer('#map-view', 'pointerdown', { clientX: 40, clientY: 40 });
    page.pointer('#map-view', 'pointermove', { clientX: 100, clientY: 90 });
    assert.ok(page.$('#map-terrain polygon.difficult'), 'drawn while dragging');
    page.pointer('#map-view', 'pointerup', { clientX: 100, clientY: 90 });
    await page.settle();
    assert.deepEqual((await mapOf(t, map)).terrain[0].points, [[35, 35], [105, 35], [105, 105], [35, 105]]);
    page.click('[data-wall-mode=erase]');
    click(page, 70, 70);
    await page.settle();
    assert.deepEqual((await mapOf(t, map)).terrain, []);
  });
});
