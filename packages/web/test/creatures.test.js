/**
 * The DM's Creatures tab on the page: it replaces the DM's Sheet tab; the DM
 * makes a creature (with a picture and an AI stat block), places a group of
 * them on the map, picks one in Add token, and saves a map token to it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, importMap, addToken, terrain, createFakeLLM, mapReading } from './helpers.js';

const ogreBlock = {
  found: true, name: 'Goblin', size: 'small', ac: 15, hp_average: 7, hp_formula: '2d6', speed: '30 ft.', challenge: '1/4 (50 XP)',
  stat_block: '**Goblin** Small humanoid\n\n**Armor Class** 15',
};
const llm = () => createFakeLLM({ structured: (opts) => (opts.purpose === 'map:stats' ? ogreBlock : mapReading()) });

const button = (page, scope, text) => page.$$(`${scope} button`).find((b) => b.textContent === text);

test('creatures tab: the DM has Creatures instead of a Sheet; players keep their Sheet and never see Creatures', async () => {
  await withPage({
    before: async (t) => ({ dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page) => {
    assert.ok(page.visible('[data-tab=creatures]'));
    assert.ok(!page.visible('[data-tab=sheet]'));
    assert.ok(!page.visible('#map-sheet-beside'), 'no sheet beside the map for the DM');
    page.click('[data-tab=creatures]');
    assert.ok(page.visible('#tab-creatures'));
    assert.match(page.text('#creatures'), /No creatures yet/);
  });
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    assert.ok(page.visible('[data-tab=sheet]'));
    assert.ok(!page.visible('[data-tab=creatures]'));
  });
});

test('creatures tab: the DM makes a goblin with a picture, the AI fills its stat block, and three go on the map', async () => {
  await withPage({
    setup: { llm: llm() },
    before: async (t) => ({ dana: await addDm(t), map: await importMap(t, { patch: { shown: true, grid: { size: 35, x: 0, y: 0 } } }) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map }) => {
    page.click('[data-tab=creatures]');
    page.click('#creature-new');
    const form = page.$('#creature-dialog form');
    assert.ok(page.visible('#creature-dialog'));
    page.type(form.querySelector('[name=name]'), 'Goblin');
    page.type(form.querySelector('[name=notes]'), 'Flees at half HP.');
    page.setFiles(form.querySelector('input[type=file]'), [{ name: 'goblin.png', type: 'image/png', content: await terrain(64, 64) }]);
    page.submit(form);
    await page.waitFor(() => page.text('#creatures').includes('AC 15'));
    await page.settle();
    const [goblin] = (await t.request('GET', `/campaigns/${t.campaign.id}/creatures`)).json().creatures;
    assert.equal(goblin.kind, 'enemy');
    assert.equal(goblin.notes, 'Flees at half HP.');
    assert.equal(goblin.hp_max, 7, 'from the AI');
    assert.equal(goblin.size, 1, 'Small takes one square');
    assert.ok(goblin.picture);
    assert.match(page.text('#creatures .creature'), /Goblin ?Enemy ?AC 15 · HP 7 · CR 1\/4 · Medium/);
    assert.ok(page.$('#creatures .creature-face img'), 'its picture is shown');

    // Place on map: switches to the map and asks how many.
    page.click(button(page, '#creatures .creature', 'Place on map'));
    assert.ok(page.visible('#tab-map'));
    const place = page.$('#map-dialog form');
    assert.match(page.text(place), /Place Goblin/);
    page.type(place.querySelector('[name=count]'), '3');
    page.submit(place);
    await page.settle();
    const tokens = t.maps.get(t.campaign.id, map.id).tokens;
    assert.deepEqual(tokens.map((x) => x.name), ['Goblin 1', 'Goblin 2', 'Goblin 3']);
    assert.ok(tokens.every((x) => x.stats?.ac === 15 && x.hp?.max === 7 && x.art));
    assert.match(page.text('#map-status'), /Goblin 1, Goblin 2, Goblin 3 are on the map/);
  });
});

test('map: Add token offers the DM\'s creatures, and a token on the map can be saved to them', async () => {
  await withPage({
    setup: { llm: llm() },
    before: async (t) => {
      const dana = await addDm(t);
      const map = await importMap(t, { patch: { shown: true } });
      await t.request('POST', `/campaigns/${t.campaign.id}/creatures`, { body: { name: 'Mira the innkeeper', kind: 'npc', hp_max: 9 } });
      const ogre = await addToken(t, map, { kind: 'enemy', name: 'Ogre 2', x: 100, y: 100, hp: { current: 30, max: 59 } });
      return { dana, map, ogre };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map, ogre }) => {
    page.click('[data-tab=map]');
    await page.settle();
    page.click('#map-add-token');
    await page.settle();
    const pick = page.$$('#map-dialog select').find((s) => [...s.options].some((o) => o.textContent === 'Mira the innkeeper (NPC)'));
    assert.ok(pick, 'the creatures are offered');
    page.type(pick, pick.options[1].value);
    assert.match(page.text('#map-dialog h2'), /Place Mira the innkeeper/);
    page.submit('#map-dialog form');
    await page.settle();
    const mira = t.maps.get(t.campaign.id, map.id).tokens.find((x) => x.name === 'Mira the innkeeper');
    assert.equal(mira.kind, 'npc');
    assert.deepEqual(mira.hp, { current: 9, max: 9 });

    // Select the ogre and keep it.
    const el = page.$$('#map-tokens .token').find((x) => x.dataset.id === ogre.id);
    page.pointer(el, 'pointerdown', { clientX: 50, clientY: 50 });
    page.pointer('#map-view', 'pointerup', { clientX: 50, clientY: 50 });
    page.click(button(page, '#map-selection', 'Save to creatures'));
    await page.settle();
    const names = (await t.request('GET', `/campaigns/${t.campaign.id}/creatures`)).json().creatures.map((c) => [c.name, c.hp_max]);
    assert.deepEqual(names, [['Mira the innkeeper', 9], ['Ogre', 59]]);
    assert.match(page.text('#map-status'), /Ogre is in your creatures now/);
    page.click('[data-tab=creatures]');
    assert.match(page.text('#creatures'), /Ogre/);
  });
});
