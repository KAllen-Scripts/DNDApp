/**
 * Merchants. For the DM, the Merchants tab: shops with a picture, a
 * description players see, notes only the DM sees, and stock (items from
 * the Items tab, each with a price, how many are left and what restocking
 * brings it back up to). Put one on a map as a token; it restocks every so
 * many long rests, or when the DM says.
 *
 * For everyone, the shop (openShop): players open it from a merchant's
 * token on the map and buy on their own. The coins come off their sheet and
 * the item goes into its inventory (the server does both).
 */
import { api, h, readBase64, LoggedOut } from './api.js';
import { formatPrice, totalCp } from './shared/coins.js';
import { itemList, itemFace, itemSummary, detailsDialog, lookUpItem, priceInputs } from './items.js';
import { flush as flushSheet, reloadSheet } from './sheet.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  campaignId: null,
  guarded: (fn) => fn(),
  isDm: false,
  list: [],
  filter: '',
  pictures: new Map(), // picture url:key -> object URL
  place: null, // (merchant) => void, from map-dm.js
  shop: null, // the shop open in the dialog: { id, data }
  refresh: null, // timer: look again after a change elsewhere
};

const base = () => `/campaigns/${state.campaignId}/merchants`;

function status(text, error = false) {
  const el = $('#merchants-status');
  el.textContent = text;
  el.classList.toggle('error', error);
}

const report = (err) => {
  if (err instanceof LoggedOut) throw err;
  status(err.message, true);
};

/** Enter a campaign: the DM's merchants (players only ever open a shop from the map). */
export async function loadMerchants({ campaignId, guarded, isDm }) {
  for (const url of state.pictures.values()) URL.revokeObjectURL(url);
  state.pictures.clear();
  clearTimeout(state.refresh);
  Object.assign(state, { campaignId, guarded, isDm, list: [], filter: '', shop: null });
  if (!isDm) return;
  $('#merchants-filter').value = '';
  status('');
  state.list = (await api('GET', base())).merchants;
  draw();
}

/** A merchant changed somewhere (a sale, a restock, the DM's edits): look again at what's showing. */
export function merchantChanged(id) {
  clearTimeout(state.refresh);
  state.refresh = setTimeout(async () => {
    try {
      if (state.shop?.id === id && $('#shop-dialog').open) await showShop(id);
      if (state.isDm) {
        state.list = (await state.guarded(() => api('GET', base()))).merchants;
        draw();
      }
    } catch { /* the next change tries again */ }
  }, 300);
}

/** The merchants as last loaded (map-dm.js offers them). */
export const merchantList = () => state.list;

function upsert(m) {
  const i = state.list.findIndex((x) => x.id === m.id);
  if (i >= 0) state.list[i] = m;
  else state.list.push(m);
  state.list.sort((a, b) => a.name.localeCompare(b.name));
  draw();
}

// ---------- the DM's list ----------

function face(m) {
  return itemFace({ name: m.name, picture: m.picture }, `${base()}/${m.id}/picture`, state.pictures);
}

function restockText(m) {
  if (!m.restock.every) return 'Restocks only when you say.';
  const n = m.restock.every;
  return `Restocks every ${n === 1 ? 'long rest' : `${n} long rests`}${n > 1 ? ` (${m.restock.rests} so far)` : ''}.`;
}

const leftText = (l) => (l.qty == null ? 'no limit' : `${l.qty} left${l.full != null && l.full !== l.qty ? `, restocks to ${l.full}` : ''}`);

function stockTable(m) {
  if (!m.stock.length) return h('p', { class: 'muted small' }, 'Nothing for sale yet. Add items from your Items tab.');
  return h('table', { class: 'stock' },
    h('tbody', {}, ...m.stock.map((l) => h('tr', { 'data-line': l.id },
      h('td', {}, h('button', { type: 'button', class: 'link', onclick: () => detailsDialog(l.item, $('#merchant-dialog'), l.price) }, l.item.name)),
      h('td', { class: 'num' }, formatPrice(l.price)),
      h('td', { class: 'muted small' }, leftText(l)),
      h('td', { class: 'stock-actions' },
        h('button', { type: 'button', class: 'ghost', 'aria-label': `Change ${l.item.name}`, onclick: () => lineDialog(m, l) }, 'Change'),
        h('button', { type: 'button', class: 'ghost danger icon-btn', 'aria-label': `Stop selling ${l.item.name}`, onclick: () => removeLine(m, l) }, '✕'))))));
}

function draw() {
  const box = $('#merchants');
  if (!box || !state.isDm) return;
  const q = state.filter.trim().toLowerCase();
  const shown = state.list.filter((m) => !q || m.name.toLowerCase().includes(q) || m.notes.toLowerCase().includes(q) || m.stock.some((l) => l.item.name.toLowerCase().includes(q)));
  if (!state.list.length) {
    return box.replaceChildren(h('p', { class: 'muted' }, 'No merchants yet. Set one up, stock it with items from the Items tab at your prices, then put it on a map. Players open its shop from the token and buy on their own: the coins come off their sheet and the item goes into their inventory, ready to equip.'));
  }
  if (!shown.length) return box.replaceChildren(h('p', { class: 'muted' }, 'None match.'));
  box.replaceChildren(...shown.map((m) => h('article', { class: 'creature merchant card', 'data-id': m.id },
    face(m),
    h('div', { class: 'creature-body' },
      h('div', { class: 'creature-head' },
        h('h3', {}, m.name),
        h('span', { class: `chip merchant-open${m.open ? '' : ' closed'}` }, m.open ? 'Open' : 'Closed')),
      m.description ? h('p', { class: 'small' }, m.description) : null,
      m.notes ? h('p', { class: 'creature-notes small' }, m.notes) : null,
      h('p', { class: 'muted small' }, restockText(m), ' ', m.on_maps.length ? `On ${[...new Set(m.on_maps.map((x) => x.map_name))].join(', ')}.` : 'Not on a map yet.'),
      stockTable(m),
      h('div', { class: 'creature-actions' },
        h('button', { type: 'button', class: 'primary', onclick: () => addDialog(m) }, 'Add item'),
        h('button', { type: 'button', class: 'ghost', onclick: () => state.place?.(m) }, 'Place on map'),
        h('button', { type: 'button', class: 'ghost', title: 'Everything back up to its restock level', onclick: () => restock(m) }, 'Restock now'),
        h('button', { type: 'button', class: 'ghost', onclick: () => openShop(m.id) }, 'See shop'),
        m.sales.length ? h('button', { type: 'button', class: 'ghost', onclick: () => salesDialog(m) }, 'Sales') : null,
        h('button', { type: 'button', class: 'ghost', onclick: () => editDialog(m) }, 'Edit'),
        h('button', { type: 'button', class: 'ghost danger', onclick: () => remove(m) }, 'Remove'))),
  )));
}

// ---------- the DM's changes ----------

const field = (label, input) => h('label', { class: 'map-field' }, h('span', {}, label), input);
const countInput = (value, placeholder) => h('input', { type: 'number', min: '0', step: '1', value: value ?? '', placeholder });
const count = (el) => (el.value === '' ? null : Math.max(0, Math.round(Number(el.value) || 0)));

/** A dialog with a form; `save` returns the merchant to show, or throws to show its message. */
function formDialog(title, fields, save, submit = 'Save') {
  const dialog = $('#merchant-dialog');
  const error = h('p', { class: 'error small', hidden: true, role: 'alert' });
  const button = h('button', { class: 'primary' }, submit);
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: async (e) => {
      e.preventDefault();
      error.hidden = true;
      button.disabled = true;
      try {
        const m = await save();
        if (m) upsert(m);
        dialog.close();
      } catch (err) {
        if (err instanceof LoggedOut) throw err;
        Object.assign(error, { hidden: false, textContent: err.message });
      } finally {
        button.disabled = false;
      }
    } },
      h('h2', {}, title),
      ...fields,
      error,
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        button)),
  );
  dialog.showModal();
  dialog.querySelector('input, select, textarea')?.focus();
}

function editDialog(m = null) {
  const name = h('input', { value: m?.name ?? '', maxLength: 80, required: true, placeholder: 'Mira the potion seller' });
  const description = h('textarea', { rows: 2, maxLength: 2000, placeholder: 'What players see: "A cramped stall that smells of herbs."' }, m?.description ?? '');
  const notes = h('textarea', { rows: 2, maxLength: 4000, placeholder: 'Only you see these: haggling, secrets, who they fence for.' }, m?.notes ?? '');
  const open = h('input', { type: 'checkbox', checked: m ? m.open : true });
  const every = countInput(m?.restock.every, 'never');
  every.min = '1';
  const color = h('input', { type: 'color', value: m?.color ?? '#c9a227' });
  const picture = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', 'aria-label': 'Picture' });
  formDialog(m ? `Change ${m.name}` : 'New merchant', [
    field('Name', name),
    field('Description', description),
    field('Notes', notes),
    h('div', { class: 'map-row' }, field('Restock every … long rests', every), field('Token colour', color)),
    h('label', { class: 'map-check' }, open, ' Open: players can buy'),
    field(m?.picture ? 'New picture (optional)' : 'Picture (optional)', picture),
  ], async () => {
    const body = { name: name.value.trim(), description: description.value, notes: notes.value, open: open.checked, restock_every: count(every) || null, color: color.value };
    let saved = await state.guarded(() => (m ? api('PATCH', `${base()}/${m.id}`, body) : api('POST', base(), body)));
    const f = picture.files[0];
    if (saved && f) {
      if (f.size > 10 * 1024 * 1024) throw new Error('That picture is too big (10 MB at most).');
      saved = await state.guarded(async () => api('PUT', `${base()}/${saved.id}/picture`, { filename: f.name, data: await readBase64(f) }));
    }
    if (saved) status(m ? `${saved.name} saved.` : `${saved.name} is set up. Add items, then put them on a map.`);
    return saved;
  }, m ? 'Save' : 'Add');
}

function addDialog(m) {
  const items = itemList().filter((x) => !x.finding);
  const listId = `merchant-items-${m.id}`;
  const name = h('input', { list: listId, maxLength: 100, required: true, placeholder: 'An item from your Items tab, or any name to look up' });
  const options = h('datalist', { id: listId }, ...items.map((x) => h('option', { value: x.name })));
  const price = priceInputs(null, { placeholder: 'usual price' });
  const qty = countInput(1, 'no limit');
  const full = countInput('', 'same as in stock');
  formDialog(`Sell something at ${m.name}`, [
    field('Item', name), options,
    h('div', { class: 'map-row' }, field('Price', price.el), field('In stock', qty), field('Restock to', full)),
    h('p', { class: 'muted small' }, "An item that isn't in your Items tab yet is looked up (the books, then the AI) and added there. Leave the price empty for its usual price, and In stock empty for no limit."),
  ], async () => {
    const want = name.value.trim().toLowerCase();
    let item = itemList().find((x) => !x.finding && x.name.toLowerCase() === want);
    if (!item) {
      status(`Looking up ${name.value.trim()}…`);
      item = (await lookUpItem(name.value.trim()))?.item;
      if (!item) return null;
    }
    const body = { item: item.id, qty: count(qty) };
    if (price.value() != null) body.price = price.value();
    if (full.value !== '') body.full = count(full);
    const saved = await state.guarded(() => api('POST', `${base()}/${m.id}/stock`, body));
    if (saved) status(`${m.name} sells ${item.name} now.`);
    return saved;
  }, 'Add');
}

function lineDialog(m, l) {
  const price = priceInputs(l.price);
  const qty = countInput(l.qty, 'no limit');
  const full = countInput(l.full, 'never');
  formDialog(`${l.item.name} at ${m.name}`, [
    h('div', { class: 'map-row' }, field('Price', price.el), field('In stock', qty), field('Restock to', full)),
    h('p', { class: 'muted small' }, 'In stock empty: no limit. Restock to empty: restocking leaves it alone.'),
  ], () => state.guarded(() => api('PATCH', `${base()}/${m.id}/stock/${l.id}`, { price: price.value() ?? 0, qty: count(qty), full: count(full) })));
}

async function removeLine(m, l) {
  try {
    const res = await state.guarded(() => api('DELETE', `${base()}/${m.id}/stock/${l.id}`));
    if (res) upsert(res);
  } catch (err) {
    report(err);
  }
}

async function restock(m) {
  try {
    const res = await state.guarded(() => api('POST', `${base()}/${m.id}/restock`));
    if (!res) return;
    upsert(res);
    status(`${m.name} is restocked.`);
  } catch (err) {
    report(err);
  }
}

function salesDialog(m) {
  const dialog = $('#merchant-dialog');
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner' },
      h('h2', {}, `Sold at ${m.name}`),
      h('ul', { class: 'sales' }, ...[...m.sales].reverse().map((s) => h('li', {},
        h('span', {}, `${s.who || 'Someone'} bought ${s.qty > 1 ? `${s.qty} × ` : ''}${s.name} for ${formatPrice(s.paid)}`),
        h('span', { class: 'muted small' }, ` ${new Date(s.at).toLocaleString()}`)))),
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { class: 'primary' }, 'Close'))),
  );
  dialog.showModal();
}

async function remove(m) {
  if (!confirm(`Close ${m.name} down? Its tokens stay on the maps as ordinary NPCs.`)) return;
  try {
    const res = await state.guarded(() => api('DELETE', `${base()}/${m.id}`));
    if (!res) return;
    state.list = state.list.filter((x) => x.id !== m.id);
    draw();
    status(`${m.name} closed down.`);
  } catch (err) {
    report(err);
  }
}

// ---------- the shop (players buy; the DM sees what they see) ----------

/** Open a merchant's shop (from its token on the map, or the DM's list). */
export async function openShop(id) {
  state.shop = { id, data: null, message: '' };
  try {
    await showShop(id);
  } catch (err) {
    if (err instanceof LoggedOut) return state.guarded(() => { throw err; });
    alert(err.message);
  }
}

async function showShop(id) {
  const data = await state.guarded(() => api('GET', `${base()}/${id}/shop`));
  if (!data) return;
  state.shop = { ...state.shop, id, data };
  drawShop();
}

function drawShop(message = state.shop.message, error = false) {
  const dialog = $('#shop-dialog');
  const s = state.shop.data;
  state.shop.message = message;
  const purse = s.purse ? totalCp(s.purse) : null;
  const rows = s.stock.map((l) => {
    const qty = h('input', { type: 'number', min: '1', max: String(Math.min(100, l.qty ?? 100)), step: '1', value: '1', class: 'shop-qty', 'aria-label': `How many ${l.item.name}` });
    const soldOut = l.qty === 0;
    const buy = h('button', { type: 'button', class: 'primary', disabled: soldOut || !s.open || s.can_edit || (purse != null && purse < l.price), onclick: () => buyLine(l, Math.max(1, Math.round(Number(qty.value) || 1))) }, soldOut ? 'Sold out' : 'Buy');
    return h('li', { class: 'shop-item', 'data-line': l.id },
      itemFace(l.item, `${base()}/${s.id}/items/${l.item.id}/picture`, state.pictures),
      h('div', { class: 'shop-item-body' },
        h('button', { type: 'button', class: 'link shop-item-name', onclick: () => detailsDialog(l.item, $('#shop-item-dialog'), l.price) }, l.item.name),
        h('span', { class: 'muted small' }, itemSummary(l.item, null))),
      h('span', { class: 'shop-price' }, formatPrice(l.price)),
      h('span', { class: 'muted small shop-left' }, l.qty == null ? '' : soldOut ? 'none left' : `${l.qty} left`),
      s.can_edit ? null : h('span', { class: 'shop-buy' }, soldOut ? null : qty, buy));
  });
  dialog.replaceChildren(
    h('div', { class: 'map-dialog-inner shop' },
      h('div', { class: 'shop-head' },
        s.picture ? itemFace({ name: s.name, picture: s.picture }, `${base()}/${s.id}/picture`, state.pictures) : null,
        h('div', {}, h('h2', {}, s.name), s.description ? h('p', { class: 'muted small' }, s.description) : null)),
      s.open ? null : h('p', { class: 'error small' }, `${s.name} isn't selling right now.`),
      s.can_edit ? h('p', { class: 'muted small' }, 'This is what players see (without your notes). They buy from the token on the map.') : null,
      purse != null ? h('p', { class: 'shop-purse' }, `You have ${formatPrice(purse)}`, h('span', { class: 'muted small' }, ' (the coins on your sheet)')) : null,
      rows.length ? h('ul', { class: 'shop-list' }, ...rows) : h('p', { class: 'muted' }, 'Nothing for sale.'),
      h('p', { class: error ? 'error small' : 'muted small', role: 'status' }, message || ''),
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'primary', onclick: () => dialog.close() }, 'Close'))),
  );
  if (!dialog.open) dialog.showModal();
}

async function buyLine(l, qty) {
  const s = state.shop.data;
  const total = l.price * qty;
  if (!confirm(`Buy ${qty > 1 ? `${qty} × ` : ''}${l.item.name} for ${formatPrice(total)}? It comes off the coins on your sheet.`)) return;
  try {
    // Anything waiting to save on the sheet goes first, so the purchase doesn't meet an older sheet.
    await flushSheet();
    const res = await state.guarded(() => api('POST', `${base()}/${s.id}/buy`, { line: l.id, qty }));
    if (!res) return;
    state.shop.data = res.shop;
    drawShop(`You bought ${res.bought.qty > 1 ? `${res.bought.qty} × ` : ''}${res.bought.name} for ${formatPrice(res.bought.paid)}. It's in your Inventory.`);
    await reloadSheet();
  } catch (err) {
    if (err instanceof LoggedOut) return state.guarded(() => { throw err; });
    drawShop(err.message, true);
  }
}

/** Wire the DM's tab once. place(merchant) puts one on the map (map-dm.js). */
export function initMerchantActions({ place }) {
  state.place = place;
  $('#merchant-new').addEventListener('click', () => editDialog());
  $('#merchants-filter').addEventListener('input', (e) => {
    state.filter = e.target.value;
    draw();
  });
}

/** The DM opened the tab: look again (an item may have been renamed or changed meanwhile). */
export function merchantsOpened() {
  if (state.isDm && state.campaignId) merchantChanged(null);
}
