/**
 * Items and merchants on the page: the DM has Items and Merchants tabs
 * (players don't), makes and looks up items, sets up a merchant with stock
 * and puts it on the map; a player opens the shop from the token and buys,
 * and their sheet shows the coins gone and the item in their equipment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySheet } from '@dndapp/shared/sheet.js';
import { withPage, addDm, importMap, createFakeLLM, mapReading } from './helpers.js';

const healing = { found: true, name: 'Potion of Healing', kind: 'potion', rarity: 'common', attunement: false, price: '50 gp', weight_lb: 0.5, description: 'You regain **2d4 + 2** hit points.' };
const llm = () => createFakeLLM({ structured: (opts) => (opts.purpose === 'item:ai' ? healing : mapReading()) });
const button = (page, scope, text) => page.$$(`${scope} button`).find((b) => b.textContent === text);

test('items and merchants: the DM has the tabs, players never do', async () => {
  await withPage({
    before: async (t) => ({ dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page) => {
    assert.ok(page.visible('[data-tab=items]'));
    assert.ok(page.visible('[data-tab=merchants]'));
    page.click('[data-tab=items]');
    assert.match(page.text('#items'), /No items yet/);
    page.click('[data-tab=merchants]');
    assert.match(page.text('#merchants'), /No merchants yet/);
  });
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    assert.ok(!page.visible('[data-tab=items]'));
    assert.ok(!page.visible('[data-tab=merchants]'));
    assert.ok(!page.requests.some((r) => r.path.endsWith('/merchants') || r.path.endsWith('/items')), 'the lists are never loaded');
  });
});

test('items and merchants: the DM makes rope, sets up a shop that also sells a looked-up potion, and puts it on the map', async () => {
  await withPage({
    setup: { llm: llm() },
    before: async (t) => ({ dana: await addDm(t), map: await importMap(t, { patch: { shown: true } }) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map }) => {
    page.click('[data-tab=items]');
    page.click('#item-new');
    let form = page.$('#item-dialog form');
    page.type(form.querySelector('[name=name]'), 'Rope');
    page.type(form.querySelector('[name=text]'), '50 feet of hempen rope.');
    page.type(form.querySelector('[aria-label=Price]'), '1');
    page.submit(form);
    await page.waitFor(() => page.text('#items').includes('Rope'));
    assert.match(page.text('#items .item'), /Rope ?Adventuring gear · 1 gp/);

    page.click('[data-tab=merchants]');
    page.click('#merchant-new');
    form = page.$('#merchant-dialog form');
    page.type(form.querySelector('input'), 'Mira');
    page.type(form.querySelector('textarea'), 'A cramped stall that smells of herbs.');
    page.submit(form);
    await page.waitFor(() => page.text('#merchants').includes('Mira'));

    // Stock rope (from the Items tab), then a potion nobody has made yet: it's looked up.
    for (const [name, qty] of [['Rope', ''], ['healing potion', '3']]) {
      page.click(button(page, '#merchants .merchant', 'Add item'));
      form = page.$('#merchant-dialog form');
      page.type(form.querySelector('[list]'), name);
      page.type(form.querySelectorAll('input[type=number]')[1], qty);
      page.submit(form);
      await page.settle();
    }
    const [m] = (await t.request('GET', `/campaigns/${t.campaign.id}/merchants`)).json().merchants;
    assert.deepEqual(m.stock.map((l) => [l.item.name, l.price, l.qty]), [['Rope', 100, null], ['Potion of Healing', 5000, 3]]);
    assert.match(page.text('#merchants .stock'), /Rope ?1 gp ?no limit.*Potion of Healing ?50 gp ?3 left/);
    page.click('[data-tab=items]');
    assert.match(page.text('#items'), /Potion of Healing/, 'the looked-up potion joined the items');

    page.click('[data-tab=merchants]');
    page.click(button(page, '#merchants .merchant', 'Place on map'));
    await page.settle();
    assert.ok(page.visible('#tab-map'));
    const token = t.maps.get(t.campaign.id, map.id).tokens.find((x) => x.merchant === m.id);
    assert.equal(token?.name, 'Mira');
    assert.ok(page.$('#map-tokens .token[aria-label="Mira"] .token-shop'), 'a merchant badge on the token');
  });
});

test('items and merchants: a player opens the shop from the token and buys; the sheet shows it', async () => {
  await withPage({
    before: async (t) => {
      const map = await importMap(t, { patch: { shown: true } });
      const items = `/campaigns/${t.campaign.id}/items`;
      const potion = (await t.request('POST', items, { body: { name: 'Potion of Healing', kind: 'potion', price: 5000, text: 'Heals.', notes: 'Secretly watered down.' } })).json();
      const base = `/campaigns/${t.campaign.id}/merchants`;
      const m = (await t.request('POST', base, { body: { name: 'Mira', notes: 'Fences goods.' } })).json();
      await t.request('POST', `${base}/${m.id}/stock`, { body: { item: potion.id, qty: 2 } });
      await t.request('POST', `/campaigns/${t.campaign.id}/maps/${map.id}/merchants/${m.id}`, { body: {} });
      t.sheets.save(t.campaign.id, t.sam.id, { ...emptySheet({ name: 'Thorin' }), coins: { cp: 0, sp: 0, ep: 0, gp: 70, pp: 0 }, equipment: 'Backpack' });
      return { m };
    },
    page: (t) => ({ as: t.sam }),
  }, async (page, t) => {
    page.click('[data-tab=map]');
    await page.settle();
    page.key('#map-tokens .token[aria-label="Mira"]', 'Enter');
    page.click(button(page, '#map-selection', 'Shop'));
    await page.waitFor(() => page.visible('#shop-dialog') && page.text('#shop-dialog').includes('Potion'));
    assert.match(page.text('#shop-dialog'), /You have 70 gp/);
    assert.match(page.text('#shop-dialog'), /Potion of Healing.*50 gp.*2 left/);
    assert.doesNotMatch(page.text('#shop-dialog'), /Fences|watered/, "never the DM's notes");

    page.click('#shop-dialog .shop-item-name');
    assert.ok(page.visible('#shop-item-dialog'), "the item's description");
    assert.match(page.text('#shop-item-dialog'), /Heals\./);
    page.$('#shop-item-dialog').close();

    page.click(button(page, '#shop-dialog', 'Buy'));
    await page.waitFor(() => page.text('#shop-dialog').includes('You bought'));
    assert.match(page.text('#shop-dialog'), /You have 20 gp/);
    assert.match(page.text('#shop-dialog'), /1 left/);
    assert.ok(page.dialogs.some((d) => /Buy Potion of Healing for 50 gp/.test(d.message ?? d)), 'asked first');
    assert.equal(page.$('#shop-dialog .shop-item button.primary').disabled, true, "can't afford another");

    const { sheet } = t.sheets.get(t.campaign.id, t.sam.id);
    assert.equal(sheet.coins.gp, 20);
    assert.equal(sheet.equipment, 'Backpack\nPotion of Healing');
    page.click('[data-tab=sheet]');
    await page.settle();
    assert.equal(page.$('#sheet [aria-label="Gold pieces"]').value, '20', 'the sheet on screen shows it');
  });
});
