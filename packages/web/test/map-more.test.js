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
