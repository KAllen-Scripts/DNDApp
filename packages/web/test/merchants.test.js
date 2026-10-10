/**
 * Items and merchants on the page: the DM has Items and Merchants tabs
 * (players don't), makes and looks up items, sets up a merchant with stock
 * and puts it on the map; a player opens the shop from the token and buys,
 * and their sheet shows the coins gone and the item in their inventory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySheet } from '@dndapp/shared/sheet.js';
import { withPage, addDm, importMap, createFakeLLM, mapReading, terrain } from './helpers.js';

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
      t.sheets.save(t.campaign.id, t.sam.id, { ...emptySheet({ name: 'Thorin' }), coins: { cp: 0, sp: 0, ep: 0, gp: 70, pp: 0 }, inventory: [{ name: 'Backpack' }] });
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
    assert.deepEqual(sheet.inventory.map((g) => g.name), ['Backpack', 'Potion of Healing']);
    page.click('[data-tab=sheet]');
    await page.settle();
    assert.equal(page.$('#sheet [aria-label="Gold pieces"]').value, '20', 'the sheet on screen shows it');
  });
});

test('items and merchants: the DM makes a new item by hand right from the merchant, with a picture; the buyer sees the picture in their inventory', async () => {
  await withPage({
    before: async (t) => {
      const map = await importMap(t, { patch: { shown: true } });
      const m = (await t.request('POST', `/campaigns/${t.campaign.id}/merchants`, { body: { name: 'Mira' } })).json();
      await t.request('POST', `/campaigns/${t.campaign.id}/maps/${map.id}/merchants/${m.id}`, { body: {} });
      return { dana: await addDm(t), m };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { m }) => {
    page.click('[data-tab=merchants]');
    page.click(button(page, '#merchants .merchant', 'Add item'));
    page.click(button(page, '#merchant-dialog', 'Make a new item'));
    const form = page.$('#merchant-dialog form');
    assert.match(page.text(form.querySelector('h2')), /A new item for Mira/);
    page.type(form.querySelector('[name=name]'), 'Ember Charm');
    page.$('#merchant-dialog [name=kind]').value = 'magic';
    page.type(form.querySelector('[name=text]'), 'Warm to the touch.');
    page.type(form.querySelector('[aria-label=Price]'), '25');
    page.type(form.querySelectorAll('input[type=number]')[2], '4');
    page.setFiles('#merchant-dialog input[type=file]', [{ name: 'charm.png', type: 'image/png', content: await terrain(40, 40) }]);
    page.submit(form);
    await page.waitFor(() => page.text('#merchants .stock').includes('Ember Charm'), { what: 'the new item on sale' });
    assert.match(page.text('#merchants .stock'), /Ember Charm ?25 gp ?4 left/);

    const [charm] = (await t.request('GET', `/campaigns/${t.campaign.id}/items`)).json().items;
    assert.deepEqual([charm.name, charm.kind, charm.price, charm.text, charm.source.kind], ['Ember Charm', 'magic', 2500, 'Warm to the touch.', 'dm']);
    assert.ok(charm.picture, 'with its picture');
    assert.equal(t.merchants.get(t.campaign.id, m.id).stock[0].item, charm.id);
    page.click('[data-tab=items]');
    assert.match(page.text('#items'), /Ember Charm/, 'it joined the Items tab');
  });

  // Sam buys it: the inventory line shows its picture.
  await withPage({
    before: async (t) => {
      const map = await importMap(t, { patch: { shown: true } });
      const items = `/campaigns/${t.campaign.id}/items`;
      const charm = (await t.request('POST', items, { body: { name: 'Ember Charm', kind: 'magic', price: 100, text: 'Warm.', picture: { filename: 'c.png', data: (await terrain(40, 40)).toString('base64') } } })).json();
      const base = `/campaigns/${t.campaign.id}/merchants`;
      const m = (await t.request('POST', base, { body: { name: 'Mira' } })).json();
      const line = (await t.request('POST', `${base}/${m.id}/stock`, { body: { item: charm.id } })).json().stock[0];
      await t.request('POST', `/campaigns/${t.campaign.id}/maps/${map.id}/merchants/${m.id}`, { body: {} });
      t.sheets.save(t.campaign.id, t.sam.id, { ...emptySheet({ name: 'Thorin' }), coins: { cp: 0, sp: 0, ep: 0, gp: 5, pp: 0 }, inventory: [{ name: 'Backpack' }] });
      await t.request('POST', `${base}/${m.id}/buy`, { as: t.sam.token, body: { line: line.id } });
    },
    page: (t) => ({ as: t.sam }),
  }, async (page) => {
    page.click('[data-tab=inventory]');
    await page.waitFor(() => /^blob:/.test(page.$('#inventory img.gear-picture')?.src ?? ''), { what: 'the picture in the inventory' });
    assert.equal(page.$$('#inventory img.gear-picture').length, 1, 'only the bought item has one');
  });
});
