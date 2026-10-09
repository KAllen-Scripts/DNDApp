/**
 * The Items tab (the DM's): weapons, armour, potions, gear and magic items
 * kept once and stocked by merchants (merchants.js). Like Creatures: make
 * one by hand, look one up (your own items first, then the books, then the
 * AI), or have the AI find one online with a picture. Players never see
 * this list, only what a merchant sells. Below it: what each player has
 * equipped (from their Inventory), so the DM can check it.
 */
import { api, fileUrl, h, readBase64, LoggedOut } from './api.js';
import { markdownBox } from './markdown.js';
import { formatPrice, splitPrice, COIN_VALUES } from './shared/coins.js';
import { EFFECT_TARGETS } from './shared/gear.js';

const $ = (sel) => document.querySelector(sel);
export const ITEM_KIND_NAMES = { weapon: 'Weapon', armor: 'Armour', gear: 'Adventuring gear', tool: 'Tool', potion: 'Potion', scroll: 'Scroll', magic: 'Magic item', other: 'Other' };
const RARITIES = ['', 'common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];
const FROM = { yours: 'from your items', book: 'from the books', ai: "from the AI's memory; check it" };

const state = {
  campaignId: null,
  guarded: (fn) => fn(),
  list: [],
  filter: '',
  pictures: new Map(), // `${id}:${key}` -> object URL
  poll: null, // timer while the AI is searching for one
};

const base = () => `/campaigns/${state.campaignId}/items`;

function status(text, error = false) {
  const el = $('#items-status');
  el.textContent = text;
  el.classList.toggle('error', error);
}

const report = (err) => {
  if (err instanceof LoggedOut) throw err;
  status(err.message, true);
};

/** The DM's items for this campaign (called when a DM enters a campaign). */
export async function loadItems({ campaignId, guarded }) {
  for (const url of state.pictures.values()) URL.revokeObjectURL(url);
  state.pictures.clear();
  clearTimeout(state.poll);
  Object.assign(state, { campaignId, guarded, list: [], filter: '' });
  $('#items-filter').value = '';
  status('');
  const [{ items }] = await Promise.all([api('GET', base()), loadEquipped()]);
  state.list = items;
  draw();
}

const LOAD = { encumbered: 'encumbered', heavy: 'heavily encumbered', over: 'over their carrying capacity' };

/** What each player has equipped, with the AC and attacks it gives them (the rest of their sheet stays private). */
async function loadEquipped() {
  const box = $('#items-equipped');
  try {
    const res = await state.guarded(() => api('GET', `/campaigns/${state.campaignId}/gear/equipped`));
    if (!res) return;
    const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
    box.replaceChildren(...(res.players.length ? res.players.map((p) => h('article', { class: 'equipped-player' },
      h('h3', {}, p.character || p.name, p.character ? h('span', { class: 'muted small' }, ` (${p.name})`) : null,
        p.ac != null ? h('span', { class: 'tag', title: p.ac_own ? 'The player typed this AC themselves' : 'Worked out from what they have equipped' }, `AC ${p.ac}${p.ac_own ? ' (typed)' : ''}`) : null),
      p.carried != null ? h('p', { class: 'muted small' },
        `Carrying ${p.carried} lb${p.capacity ? ` of ${p.capacity}` : ''}`,
        LOAD[p.load] ? h('strong', {}, ` (${LOAD[p.load]})`) : '',
        ` · attuned to ${p.attuned} item${p.attuned === 1 ? '' : 's'}`) : null,
      p.gear.length
        ? h('ul', { class: 'equipped-list' }, p.gear.map((g) => h('li', {},
          h('strong', {}, g.name), g.equipped > 1 ? ` ×${g.equipped}` : '',
          g.to_hit != null ? ` · ${sign(g.to_hit)} to hit, ${g.damage ?? 'no damage'}` : '',
          g.armor ? (g.armor.type === 'shield' ? ` · +${g.armor.base + g.magic} AC` : ` · ${g.armor.type} armour, AC ${g.armor.base + g.magic}`) : '',
          g.effects?.length ? ` · ${g.effects.map((e) => `${EFFECT_TARGETS[e.target] ?? e.target} ${e.value > 0 && !e.target.startsWith('score.') ? '+' : ''}${e.value}`).join(', ')}` : '',
          (g.weapon || g.armor || g.to_hit != null) && !g.proficient ? h('span', { class: 'muted' }, ' · not proficient') : '',
          g.attunement ? h('span', { class: 'muted' }, g.attuned ? ' · attuned' : ' · not attuned') : '')))
        : h('p', { class: 'muted small' }, 'Nothing equipped.'),
    )) : [h('p', { class: 'muted' }, 'No players in this campaign yet.')]));
  } catch (err) {
    if (err instanceof LoggedOut) throw err;
    box.replaceChildren(h('p', { class: 'error small' }, `Couldn't load the players' gear: ${err.message}`));
  }
}

/** The items as last loaded (the Merchants tab stocks them). */
export const itemList = () => state.list;

function upsert(x) {
  const i = state.list.findIndex((y) => y.id === x.id);
  if (i >= 0) state.list[i] = x;
  else state.list.push(x);
  state.list.sort((a, b) => a.name.localeCompare(b.name));
  draw();
}

/** Look an item up by name (your items, the books, the AI) and keep it; returns it, or throws. */
export async function lookUpItem(name) {
  const res = await state.guarded(() => api('POST', `${base()}/lookup`, { name }));
  if (!res) return null;
  upsert(res.item);
  status(`${res.item.name}: ${FROM[res.from]}.`);
  return { item: res.item, from: FROM[res.from] };
}

/** While the AI is searching the web for one, check back every few seconds. */
function watchSearches() {
  clearTimeout(state.poll);
  if (!state.list.some((x) => x.finding?.status === 'pending')) return;
  const cid = state.campaignId;
  state.poll = setTimeout(async () => {
    if (state.campaignId !== cid) return;
    try {
      const was = new Map(state.list.map((x) => [x.id, x.finding?.status]));
      state.list = (await api('GET', base())).items;
      for (const x of state.list) {
        if (was.get(x.id) !== 'pending' || x.finding?.status === 'pending') continue;
        status(x.finding ? `The AI couldn't find "${x.finding.query}".` : `Found ${x.name}${x.source?.from ? ` (${x.source.official ? 'official' : 'unofficial'}, from ${x.source.from})` : ''}. Check it before you sell it.`, !!x.finding);
      }
      draw();
    } catch (err) {
      if (err instanceof LoggedOut) return state.guarded(() => { throw err; });
      watchSearches();
    }
  }, 3000);
}

// ---------- the list ----------

/** A picture (or initials) for an item; `url` is where its picture comes from. */
export function itemFace(x, url, cache) {
  const initials = x.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const el = h('span', { class: 'creature-face item-face' }, initials);
  if (!x.picture) return el;
  const key = `${url}:${x.picture}`;
  const show = (src) => el.replaceChildren(h('img', { src, alt: '' }));
  if (cache.has(key)) show(cache.get(key));
  else {
    fileUrl(`${url}?v=${encodeURIComponent(x.picture)}`).then((src) => {
      cache.set(key, src);
      show(src);
    }).catch(() => {});
  }
  return el;
}

/** "Potion · common · 50 gp · ½ lb". */
export function itemSummary(x, price = x.price) {
  return [
    ITEM_KIND_NAMES[x.kind],
    x.rarity,
    x.attunement ? 'needs attunement' : '',
    price != null ? formatPrice(price) : '',
    x.weight ? `${x.weight} lb` : '',
  ].filter(Boolean).join(' · ');
}

function draw() {
  watchSearches();
  const box = $('#items');
  const q = state.filter.trim().toLowerCase();
  const shown = state.list.filter((x) => !q || x.name.toLowerCase().includes(q) || x.text.toLowerCase().includes(q) || x.notes.toLowerCase().includes(q));
  if (!state.list.length) {
    return box.replaceChildren(h('p', { class: 'muted' }, 'No items yet. Keep the things your merchants sell here: make one, look one up by name (your items first, then the books, then the AI), or find one online. Then stock them on the Merchants tab.'));
  }
  if (!shown.length) return box.replaceChildren(h('p', { class: 'muted' }, 'None match.'));
  box.replaceChildren(...shown.map((x) => (x.finding ? searchCard(x) : h('article', { class: 'creature item card', 'data-id': x.id },
    itemFace(x, `${base()}/${x.id}/picture`, state.pictures),
    h('div', { class: 'creature-body' },
      h('div', { class: 'creature-head' }, h('h3', {}, x.name)),
      h('p', { class: 'muted small' }, itemSummary(x)),
      sourceLine(x),
      x.notes ? h('p', { class: 'creature-notes small' }, x.notes) : null,
      h('div', { class: 'creature-actions' },
        x.text ? h('button', { type: 'button', class: 'ghost', onclick: () => detailsDialog(x) }, 'Details') : null,
        h('button', { type: 'button', class: 'ghost', onclick: () => editDialog(x) }, 'Edit'),
        x.text ? null : h('button', { type: 'button', class: 'ghost', title: 'Fill in what it is and does, from your items, the books or the AI', onclick: () => fill(x) }, 'Fill in'),
        h('button', { type: 'button', class: 'ghost', onclick: () => choosePicture(x) }, x.picture ? 'New picture' : 'Picture'),
        h('button', { type: 'button', class: 'ghost danger', onclick: () => remove(x) }, 'Remove'))),
  ))));
}

function searchCard(x) {
  const pending = x.finding.status === 'pending';
  return h('article', { class: `creature item card searching${pending ? ' pending' : ' failed'}`, 'data-id': x.id },
    h('span', { class: 'creature-face', 'aria-hidden': 'true' }, pending ? '…' : '?'),
    h('div', { class: 'creature-body' },
      h('div', { class: 'creature-head' }, h('h3', {}, x.finding.query)),
      h('p', { class: pending ? 'muted small' : 'error small', role: 'status' }, pending ? 'The AI is searching the web for it. This can take a minute or two.' : x.finding.error),
      h('div', { class: 'creature-actions' },
        pending ? null : h('button', { type: 'button', class: 'ghost', onclick: () => findOnline(x.finding.query, x) }, 'Search again'),
        h('button', { type: 'button', class: 'ghost danger', onclick: () => remove(x) }, pending ? 'Cancel' : 'Remove'))));
}

const SOURCE_TEXT = { book: 'From ', ai: "From the AI's memory", dm: '' };

function sourceLine(x) {
  const s = x.source;
  if (!s || s.kind === 'dm') return null;
  if (s.kind === 'web') {
    return h('p', { class: 'muted small creature-source' }, s.official ? 'Official · from ' : 'Unofficial · from ',
      s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.from || new URL(s.url).hostname) : s.from || 'the web');
  }
  return h('p', { class: 'muted small creature-source' }, `${SOURCE_TEXT[s.kind]}${s.kind === 'book' ? s.from : ''}`);
}

export function detailsDialog(x, dialog = $('#item-dialog'), price) {
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner' },
      h('h2', {}, x.name),
      h('p', { class: 'muted small' }, itemSummary(x, price)),
      markdownBox(x.text || 'No description.', { class: 'a stat-text' }),
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { class: 'primary' }, 'Close'))),
  );
  dialog.showModal();
}

// ---------- finding and looking up ----------

function lookupDialog() {
  const dialog = $('#item-dialog');
  const name = h('input', { name: 'name', maxLength: 100, minLength: 2, required: true, placeholder: 'e.g. Potion of Healing, Longsword, Bag of Holding' });
  const error = h('p', { class: 'error small', hidden: true, role: 'alert' });
  const button = h('button', { class: 'primary' }, 'Look up');
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: async (e) => {
      e.preventDefault();
      button.disabled = true;
      error.hidden = true;
      try {
        if (await lookUpItem(name.value.trim())) dialog.close();
      } catch (err) {
        if (err instanceof LoggedOut) throw err;
        Object.assign(error, { hidden: false, textContent: err.message });
      } finally {
        button.disabled = false;
      }
    } },
      h('h2', {}, 'Look up an item'),
      field('Which item?', name),
      h('p', { class: 'muted small' }, "Your own items first, then the group's books, then the AI's knowledge of the rules. It's saved to your items, with its usual price."),
      error,
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        button),
    ),
  );
  dialog.showModal();
  name.focus();
}

function findDialog() {
  const dialog = $('#item-dialog');
  const query = h('input', { name: 'query', maxLength: 200, minLength: 2, required: true, placeholder: 'e.g. a frost-forged dagger, the Sunblade from Grimhollow' });
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      findOnline(query.value.trim());
      dialog.close();
    } },
      h('h2', {}, 'Find an item online'),
      field('What are you looking for?', query),
      h('p', { class: 'muted small' }, "The AI searches the web, official sources or not (homebrew sites, wikis, forums), writes it up and brings a picture. Say where it's from if you know. Check what it found before you sell it."),
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, 'Search')),
    ),
  );
  dialog.showModal();
  query.focus();
}

async function findOnline(query, old = null) {
  if (query.length < 2) return;
  try {
    const res = await state.guarded(() => api('POST', `${base()}/find`, { query }));
    if (!res) return;
    if (old) {
      await state.guarded(() => api('DELETE', `${base()}/${old.id}`)).catch(() => {});
      state.list = state.list.filter((y) => y.id !== old.id);
    }
    state.list.push(res);
    draw();
    status(`Searching the web for "${query}"…`);
  } catch (err) {
    report(err);
  }
}

async function fill(x) {
  status(`Looking up ${x.name}…`);
  try {
    const res = await state.guarded(() => api('POST', `${base()}/${x.id}/fill`, {}));
    if (!res) return;
    upsert(res.item);
    status(`${res.item.name}: ${FROM[res.from]}.`);
  } catch (err) {
    report(err);
  }
}

// ---------- making and changing one ----------

const field = (label, input) => h('label', { class: 'map-field' }, h('span', {}, label), input);

/** A price as an amount and a coin, for forms (also the Merchants tab). */
export function priceInputs(cp, { placeholder = 'unknown' } = {}) {
  const { amount, unit } = cp == null ? { amount: '', unit: 'gp' } : splitPrice(cp);
  const amountEl = h('input', { type: 'number', min: '0', step: 'any', value: amount, placeholder, 'aria-label': 'Price' });
  const unitEl = h('select', { 'aria-label': 'Coin' }, ...['cp', 'sp', 'gp', 'pp'].map((c) => new Option(c, c)));
  unitEl.value = unit;
  return {
    el: h('span', { class: 'price-inputs' }, amountEl, unitEl),
    value: () => (amountEl.value === '' ? null : Math.max(0, Math.round(Number(amountEl.value) * COIN_VALUES[unitEl.value]))),
  };
}

function editDialog(x = null) {
  const dialog = $('#item-dialog');
  const name = h('input', { name: 'name', value: x?.name ?? '', maxLength: 80, required: true, placeholder: 'Potion of Healing, Longsword…' });
  const kind = h('select', { name: 'kind' }, ...Object.entries(ITEM_KIND_NAMES).map(([k, label]) => new Option(label, k)));
  kind.value = x?.kind ?? 'gear';
  const rarity = h('select', { name: 'rarity' }, ...RARITIES.map((r) => new Option(r || 'Mundane', r)));
  rarity.value = x?.rarity ?? '';
  const attunement = h('input', { type: 'checkbox', checked: !!x?.attunement });
  const price = priceInputs(x?.price ?? null);
  const weight = h('input', { name: 'weight', type: 'number', min: '0', step: 'any', value: x?.weight ?? '', placeholder: '–' });
  const text = h('textarea', { name: 'text', rows: 6, maxLength: 8000, placeholder: 'What it is and does: damage and properties, AC, effects. Players see this at a merchant. Markdown is fine.' }, x?.text ?? '');
  const notes = h('textarea', { name: 'notes', rows: 2, maxLength: 4000, placeholder: 'Only you see these.' }, x?.notes ?? '');
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', 'aria-label': 'Picture' });
  const error = h('p', { class: 'error small', hidden: true, role: 'alert' });

  const save = async () => {
    const body = {
      name: name.value.trim(),
      kind: kind.value,
      rarity: rarity.value,
      attunement: attunement.checked,
      price: price.value(),
      weight: weight.value === '' ? null : Math.max(0, Number(weight.value) || 0),
      notes: notes.value,
    };
    // Only send the description when it changed (one from a book or the web keeps where it came from).
    if (text.value.trim() !== (x?.text ?? '').trim()) body.text = text.value;
    const f = file.files[0];
    if (f && f.size > 10 * 1024 * 1024) throw new Error('That picture is too big (10 MB at most).');
    if (!x && f) body.picture = { filename: f.name, data: await readBase64(f) };
    const saved = await state.guarded(() => (x ? api('PATCH', `${base()}/${x.id}`, body) : api('POST', base(), body)));
    if (!saved) return;
    upsert(saved);
    status(x ? `${saved.name} saved.` : `${saved.name} added to your items.`);
  };

  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      error.hidden = true;
      save().then(() => dialog.close()).catch((err) => {
        if (err instanceof LoggedOut) throw err;
        Object.assign(error, { hidden: false, textContent: err.message });
      });
    } },
      h('h2', {}, x ? `Change ${x.name}` : 'New item'),
      field('Name', name),
      h('div', { class: 'map-row' }, field('Kind', kind), field('Rarity', rarity)),
      h('div', { class: 'map-row' }, field('Usual price', price.el), field('Weight (lb)', weight)),
      h('label', { class: 'map-check' }, attunement, ' Needs attunement'),
      field('Description', text),
      field('Notes', notes),
      x ? null : field('Picture (optional)', file),
      error,
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, x ? 'Save' : 'Add')),
    ),
  );
  dialog.showModal();
  name.focus();
}

function choosePicture(x) {
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.remove();
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return status('That picture is too big (10 MB at most).', true);
    try {
      status('Uploading…');
      const res = await state.guarded(async () => api('PUT', `${base()}/${x.id}/picture`, { filename: f.name, data: await readBase64(f) }));
      if (!res) return;
      upsert(res);
      status(`${res.name} has a picture now.`);
    } catch (err) {
      report(err);
    }
  });
  document.body.append(input);
  input.click();
}

async function remove(x) {
  if (!confirm(`Remove ${x.name} from your items? Merchants that sell it keep selling it until you take it off their stock.`)) return;
  try {
    const res = await state.guarded(() => api('DELETE', `${base()}/${x.id}`));
    if (!res) return;
    state.list = state.list.filter((y) => y.id !== x.id);
    draw();
    status(`${x.name} removed.`);
  } catch (err) {
    report(err);
  }
}

/** Wire the tab's buttons once. */
export function initItemActions() {
  $('#item-new').addEventListener('click', () => editDialog());
  $('#item-lookup').addEventListener('click', () => lookupDialog());
  $('#item-find').addEventListener('click', () => findDialog());
  $('#equipped-refresh').addEventListener('click', () => loadEquipped());
  $('#items-filter').addEventListener('input', (e) => {
    state.filter = e.target.value;
    draw();
  });
}
