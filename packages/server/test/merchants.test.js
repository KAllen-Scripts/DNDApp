/**
 * Items and merchants: the DM's items (made by hand, looked up in their own
 * items, the books and the AI, or found online), merchants that stock them
 * at a price, put on maps as tokens, players buying on their own (coins off
 * the sheet, the item into its equipment), restocking every few long rests,
 * and everything back from the archive after losing the database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, createFakeLLM, fakeEmbedder, terrain, makePdf } from './helpers.js';
import { createContext } from '../src/context.js';
import { normalizeItem } from '../src/items.js';
import { normalizeMerchant, afterLongRest } from '../src/merchants.js';
import { emptySheet } from '@dndapp/shared/sheet.js';

const readOut = { readable: true, kind: 'battle', name: 'Market', description: '', grid: { visible: false, columns: null, rows: null }, scale: { distance: null, unit: null, per: null }, notes: '' };
const healing = { found: true, name: 'Potion of Healing', kind: 'potion', rarity: 'common', attunement: false, price: '50 gp', weight_lb: 0.5, description: 'You regain 2d4 + 2 hit points when you drink this potion.' };
const llm = (extra = {}) => createFakeLLM({
  structured: (opts) => {
    if (opts.purpose === 'item:ai') return opts.prompt.includes('Zorblax') ? { ...healing, found: false } : healing;
    if (opts.purpose === 'item:book') return { ...healing, name: 'Rope, hempen (50 feet)', kind: 'gear', rarity: '', price: '1 gp', weight_lb: 10, description: 'Rope has 2 hit points and can be burst with a DC 17 Strength check.' };
    if (opts.purpose === 'item:tidy') return { ...healing, name: 'Sunblade of the Ember Court', kind: 'weapon', rarity: 'rare', price: '', description: 'A homebrew sword of light.', source_url: 'https://example.com/sunblade', source_title: 'GM Binder', official: false, image_urls: ['https://example.com/a.png'] };
    return extra[opts.purpose]?.(opts) ?? readOut;
  },
  research: async () => 'Notes about the Sunblade of the Ember Court, with a picture at https://example.com/a.png',
});

async function importMap(t) {
  const base = `/campaigns/${t.campaign.id}/maps`;
  const map = (await t.request('POST', base, { body: { filename: 'market.png', data: (await terrain(700, 490)).toString('base64') } })).json();
  for (let i = 0; t.maps.get(t.campaign.id, map.id).reading.status === 'pending' && i < 200; i++) await new Promise((r) => setTimeout(r, 20));
  await t.request('PATCH', `${base}/${map.id}`, { body: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
  return { ...map, base: `${base}/${map.id}` };
}

/** A merchant with a potion (2 in stock, 50 gp) and rope (no limit, 1 gp), on a shown map. */
async function shop(t, { onMap = true, ...fields } = {}) {
  const items = `/campaigns/${t.campaign.id}/items`;
  const potion = (await t.request('POST', items, { body: { name: 'Potion of Healing', kind: 'potion', rarity: 'common', price: 5000, text: 'Heals 2d4 + 2.', notes: 'Watered down.' } })).json();
  const rope = (await t.request('POST', items, { body: { name: 'Rope', kind: 'gear', price: 100 } })).json();
  const base = `/campaigns/${t.campaign.id}/merchants`;
  let m = (await t.request('POST', base, { body: { name: 'Mira', description: 'Sells potions.', notes: 'Fences stolen goods.', ...fields } })).json();
  m = (await t.request('POST', `${base}/${m.id}/stock`, { body: { item: potion.id, qty: 2 } })).json();
  m = (await t.request('POST', `${base}/${m.id}/stock`, { body: { item: rope.id, qty: null } })).json();
  let map = null;
  let token = null;
  if (onMap) {
    map = await importMap(t);
    const placed = await t.request('POST', `${map.base}/merchants/${m.id}`, { body: { x: 100, y: 100 } });
    assert.equal(placed.statusCode, 201, placed.body);
    token = placed.json().token;
  }
  return { m, potion, rope, map, token, base: `${base}/${m.id}` };
}

const giveCoins = (t, who, coins, equipment = '') => t.sheets.save(t.campaign.id, who.id, { ...emptySheet({ name: who.name === 'Sam' ? 'Thorin' : 'Lyra' }), coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...coins }, equipment });

test('normalizeItem and normalizeMerchant: defaults, and anything unknown dropped', () => {
  const x = normalizeItem({ id: 'abc', name: ' ', kind: 'spaceship', rarity: 'mythic', price: -5, weight: 'heavy', sneaky: 1 });
  assert.equal(x.name, 'Item');
  assert.equal(x.kind, 'other');
  assert.equal(x.rarity, '');
  assert.equal(x.price, 0);
  assert.equal(x.weight, null);
  assert.equal(x.sneaky, undefined);
  const m = normalizeMerchant({ id: 'abc', stock: [{ item: 'nope' }, { item: 'aaaaaaaaaa', price: 10.4, qty: -1 }], restock: { every: 0 } });
  assert.equal(m.name, 'Merchant');
  assert.equal(m.open, true);
  assert.equal(m.stock.length, 1, 'lines need a real item');
  assert.equal(m.stock[0].price, 10);
  assert.equal(m.stock[0].qty, 0);
  assert.equal(m.restock.every, 1);
});

test('afterLongRest: counts rests and restocks on the Nth, back up to each level', () => {
  const m = normalizeMerchant({ id: 'x', stock: [{ item: 'aaaaaaaaaa', qty: 0, full: 3 }, { item: 'bbbbbbbbbb', qty: 5, full: 2 }, { item: 'cccccccccc', qty: null, full: null }], restock: { every: 2 } });
  const t0 = Date.parse('2026-10-09T10:00:00Z');
  const at = (ms) => new Date(t0 + ms).toISOString();
  const one = afterLongRest(m, at(0));
  assert.equal(one.restock.rests, 1);
  assert.equal(one.stock[0].qty, 0, 'not yet');
  const two = afterLongRest(one, at(3600_000));
  assert.equal(two.restock.rests, 0);
  assert.equal(two.stock[0].qty, 3, 'back up to its level');
  assert.equal(two.stock[1].qty, 5, 'never down');
  assert.equal(two.stock[2].qty, null);
  assert.equal(afterLongRest(normalizeMerchant({ id: 'y' }), at(0)), null, 'no restocking set: nothing to count');
});

test('items: only the DM keeps them; a typed description is the DM\'s own; removing keeps the archive', async () => {
  const t = await setup({ llm: llm() });
  try {
    const base = `/campaigns/${t.campaign.id}/items`;
    assert.equal((await t.request('GET', base, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('POST', base, { as: t.sam.token, body: { name: 'Rope' } })).statusCode, 403);
    assert.equal((await t.request('POST', base, { body: { kind: 'gear' } })).statusCode, 400, 'needs a name');
    const res = await t.request('POST', base, { body: { name: 'Longsword', kind: 'weapon', price: 1500, weight: 3, text: '1d8 slashing, versatile (1d10).', picture: { filename: 's.png', data: (await terrain(40, 40)).toString('base64') } } });
    assert.equal(res.statusCode, 201, res.body);
    const sword = res.json();
    assert.equal(sword.source.kind, 'dm');
    assert.ok(sword.picture);
    assert.equal((await t.request('GET', `${base}/${sword.id}/picture`)).statusCode, 200);
    const changed = (await t.request('PATCH', `${base}/${sword.id}`, { body: { name: 'Longsword +1', rarity: 'uncommon' } })).json();
    assert.equal(changed.price, 1500, 'what was not sent stays');
    assert.equal((await t.request('DELETE', `${base}/${sword.id}`)).statusCode, 200);
    assert.deepEqual((await t.request('GET', base)).json().items, []);
    const lines = fs.readFileSync(path.join(t.archive.root, t.campaign.slug, 'items', sword.id, 'changes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => l.removed), [false, false, false, true]);
  } finally {
    await t.cleanup();
  }
});

test('items: looked up in your own items first, then the books, then the AI; unknown ones change nothing', async () => {
  const t = await setup({ llm: llm() });
  fs.mkdirSync(t.config.booksDir, { recursive: true });
  fs.writeFileSync(path.join(t.config.booksDir, "Player's Handbook.pdf"), makePdf([['ADVENTURING GEAR', 'Rope, hempen (50 feet) 1 gp 10 lb.', 'Rope has 2 hit points and can be burst with a DC 17 Strength check.']]));
  try {
    const base = `/campaigns/${t.campaign.id}/items`;
    const ai = await t.request('POST', `${base}/lookup`, { body: { name: 'healing potion' } });
    assert.equal(ai.statusCode, 201, ai.body);
    assert.equal(ai.json().from, 'ai');
    assert.equal(ai.json().item.name, 'Potion of Healing');
    assert.equal(ai.json().item.price, 5000, '"50 gp" in copper');
    assert.equal(ai.json().item.source.kind, 'ai');

    const book = (await t.request('POST', `${base}/lookup`, { body: { name: 'Rope, hempen' } })).json();
    assert.equal(book.from, 'book');
    assert.equal(book.item.price, 100);
    assert.match(book.item.source.from, /Player's Handbook, page 1/);
    assert.match(t.llm.calls.find((c) => c.purpose === 'item:book').prompt, /DC 17 Strength/);

    const before = t.llm.calls.length;
    const again = (await t.request('POST', `${base}/lookup`, { body: { name: 'potion of healing' } })).json();
    assert.equal(again.from, 'yours', 'one you already have');
    assert.equal(again.item.id, ai.json().item.id);
    assert.equal(t.llm.calls.length, before, 'no AI call');

    // Filling one in that's saved: from your other items first.
    const mine = (await t.request('POST', base, { body: { name: 'Potion of Healing', price: 4000 } })).json();
    const filled = (await t.request('POST', `${base}/${mine.id}/fill`)).json();
    assert.equal(filled.from, 'yours');
    assert.equal(filled.item.text, 'You regain 2d4 + 2 hit points when you drink this potion.');
    assert.equal(filled.item.price, 4000, 'a price the DM set stays');

    assert.equal((await t.request('POST', `${base}/lookup`, { body: { name: 'Zorblax' } })).statusCode, 404);
    assert.equal((await t.request('POST', `${base}/lookup`, { as: t.sam.token, body: { name: 'Rope' } })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('items: found online in the background, with a picture from the public internet', async () => {
  const picture = await terrain(60, 60);
  const t = await setup({ llm: llm(), fetchImage: async () => ({ buf: picture }) });
  try {
    const base = `/campaigns/${t.campaign.id}/items`;
    const res = await t.request('POST', `${base}/find`, { body: { query: 'Sunblade of the Ember Court' } });
    assert.equal(res.statusCode, 202, res.body);
    assert.equal(res.json().finding.status, 'pending');
    let item;
    for (let i = 0; i < 100; i++) {
      [item] = (await t.request('GET', base)).json().items;
      if (!item.finding) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(item.finding, null);
    assert.equal(item.kind, 'weapon');
    assert.equal(item.price, null, 'no price given');
    assert.equal(item.source.kind, 'web');
    assert.equal(item.source.url, 'https://example.com/sunblade');
    assert.equal(item.source.official, false);
    assert.ok(item.picture);
  } finally {
    await t.cleanup();
  }
});

test('merchants: the DM sets one up with stock and puts it on a map; players see only the shop, never notes or sales', async () => {
  const t = await setup({ llm: llm() });
  try {
    const { m, potion, map, token, base } = await shop(t);
    assert.equal(token.merchant, m.id);
    assert.equal(token.kind, 'npc');
    assert.equal(token.name, 'Mira');
    assert.equal(m.stock.length, 2);
    assert.equal(m.stock[0].price, 5000, "the item's usual price");
    assert.equal(m.stock[0].full, 2, 'restocks to what it started with');
    assert.equal(m.stock[1].qty, null, 'no limit');

    const list = (await t.request('GET', `/campaigns/${t.campaign.id}/merchants`)).json().merchants;
    assert.deepEqual(list[0].on_maps, [{ map_id: map.id, map_name: list[0].on_maps[0].map_name, token_id: token.id }]);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/merchants`, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('POST', `${base}/stock`, { as: t.sam.token, body: { item: potion.id } })).statusCode, 403);

    const seen = await t.request('GET', `${base}/shop`, { as: t.sam.token });
    assert.equal(seen.statusCode, 200, seen.body);
    const s = seen.json();
    assert.equal(s.description, 'Sells potions.');
    assert.equal(s.notes, undefined);
    assert.equal(s.sales, undefined);
    assert.equal(s.stock[0].item.notes, undefined, "the DM's item notes stay hidden");
    assert.equal(s.stock[0].item.text, 'Heals 2d4 + 2.');
    assert.deepEqual(s.purse, { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

    // Players can't change which merchant a token is.
    assert.equal((await t.request('PATCH', `${map.base}/tokens/${token.id}`, { as: t.sam.token, body: { merchant: null } })).statusCode, 403, 'not their token');
    // Hidden token, or not on a shown map: the shop isn't there for players.
    await t.request('PATCH', `${map.base}/tokens/${token.id}`, { body: { hidden: true } });
    assert.equal((await t.request('GET', `${base}/shop`, { as: t.sam.token })).statusCode, 404);
    await t.request('PATCH', `${map.base}/tokens/${token.id}`, { body: { hidden: false } });
    await t.request('PATCH', map.base, { body: { shown: false } });
    assert.equal((await t.request('GET', `${base}/shop`, { as: t.sam.token })).statusCode, 404);
    assert.equal((await t.request('GET', `${base}/shop`)).statusCode, 200, 'the DM always can');
  } finally {
    await t.cleanup();
  }
});

test('merchants: a player buys; coins come off their sheet (with change), the item goes into equipment, stock goes down', async () => {
  const t = await setup({ llm: llm() });
  try {
    const { m, base } = await shop(t);
    const [potionLine, ropeLine] = m.stock;
    giveCoins(t, t.sam, { gp: 120, sp: 3 }, 'Backpack\nPotion of Healing');
    const buy = (body, as = t.sam.token) => t.request('POST', `${base}/buy`, { as, body });

    const res = await buy({ line: potionLine.id, qty: 2 });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json().bought, { name: 'Potion of Healing', qty: 2, paid: 10_000 });
    const { sheet, version } = t.sheets.get(t.campaign.id, t.sam.id);
    assert.equal(res.json().sheet_version, version);
    assert.deepEqual(sheet.coins, { cp: 0, sp: 3, ep: 0, gp: 20, pp: 0 });
    assert.equal(sheet.equipment, 'Backpack\nPotion of Healing x3', 'the count goes up');
    assert.equal(res.json().shop.stock[0].qty, 0);

    assert.equal((await buy({ line: potionLine.id })).statusCode, 400, 'sold out');
    // Silver for a gold price: change comes back.
    giveCoins(t, t.alex, { sp: 15 });
    assert.equal((await buy({ line: ropeLine.id }, t.alex.token)).statusCode, 200);
    const alex = t.sheets.get(t.campaign.id, t.alex.id).sheet;
    assert.deepEqual(alex.coins, { cp: 0, sp: 5, ep: 0, gp: 0, pp: 0 });
    assert.equal(alex.equipment, 'Rope');
    const tooDear = await buy({ line: ropeLine.id, qty: 6 }, t.alex.token);
    assert.equal(tooDear.statusCode, 400);
    assert.match(tooDear.json().error, /costs 6 gp and you have 5 sp/);

    assert.equal((await buy({ line: ropeLine.id }, t.dmToken)).statusCode, 403, 'the DM has no sheet to buy with');
    await t.request('PATCH', base, { body: { open: false } });
    assert.equal((await buy({ line: ropeLine.id })).statusCode, 400, 'shop closed');

    // The DM sees the sales; the sheet keeps why it changed.
    const dm = (await t.request('GET', `/campaigns/${t.campaign.id}/merchants`)).json().merchants[0];
    assert.deepEqual(dm.sales.map((s) => [s.who, s.name, s.qty, s.paid]), [['Thorin', 'Potion of Healing', 2, 10_000], ['Lyra', 'Rope', 1, 100]]);
    const archived = fs.readFileSync(path.join(t.archive.root, t.campaign.slug, 'character-sheets', `${t.sam.id}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.match(archived.at(-1).reason, /bought 2 × Potion of Healing from Mira for 100 gp/);
  } finally {
    await t.cleanup();
  }
});

test('merchants: restock every N long rests the DM calls (short rests do not count), or by hand', async () => {
  const t = await setup({ llm: llm() });
  try {
    const { m, base } = await shop(t, { restock_every: 2 });
    giveCoins(t, t.sam, { gp: 200 });
    await t.request('POST', `${base}/buy`, { as: t.sam.token, body: { line: m.stock[0].id, qty: 2 } });
    const stock = async () => (await t.request('GET', `/campaigns/${t.campaign.id}/merchants`)).json().merchants[0];
    const rest = async (kind) => {
      const res = await t.request('POST', `/campaigns/${t.campaign.id}/rests`, { body: { kind } });
      assert.ok(res.statusCode < 300, res.body);
    };
    await rest('long');
    await rest('short');
    assert.equal((await stock()).restock.rests, 1, 'one long rest; the short one does not count');
    assert.equal((await stock()).stock[0].qty, 0);
    await rest('long');
    const after = await stock();
    assert.equal(after.stock[0].qty, 2, 'restocked');
    assert.equal(after.restock.rests, 0);

    await t.request('POST', `${base}/buy`, { as: t.sam.token, body: { line: m.stock[0].id } });
    assert.equal((await t.request('POST', `${base}/restock`, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('POST', `${base}/restock`)).json().stock[0].qty, 2);
    // A line's price and levels can change, or it can go.
    const line = (await t.request('PATCH', `${base}/stock/${m.stock[0].id}`, { body: { price: 4500, full: 5 } })).json().stock[0];
    assert.deepEqual([line.price, line.qty, line.full], [4500, 2, 5]);
    assert.equal((await t.request('DELETE', `${base}/stock/${m.stock[0].id}`)).json().stock.length, 1);
  } finally {
    await t.cleanup();
  }
});

test('items and merchants: back from the archive after losing the database', async () => {
  const t = await setup({ llm: llm() });
  try {
    const { m, base } = await shop(t, { onMap: false });
    await t.request('PUT', `${base}/picture`, { body: { filename: 'm.png', data: (await terrain(40, 40)).toString('base64') } });
    const paths = { archive: t.archive.root, db: path.join(t.dir, 'fresh.sqlite'), models: path.join(t.dir, 'models') };
    const ctx = await createContext({ config: t.config, paths, llm: createFakeLLM(), embedder: fakeEmbedder, log: { error() {} } });
    try {
      const cid = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      const [back] = ctx.merchants.list(cid);
      assert.equal(back.id, m.id);
      assert.equal(back.notes, 'Fences stolen goods.');
      assert.equal(back.stock.length, 2);
      assert.ok(back.art);
      assert.deepEqual(ctx.items.list(cid).map((x) => x.name), ['Potion of Healing', 'Rope']);
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }
  } finally {
    await t.cleanup();
  }
});
