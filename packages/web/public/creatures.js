/**
 * The Creatures tab (the DM's, in place of a character sheet): enemies and
 * NPCs saved once, with a picture, hit points, a stat block and notes, and
 * put on the map as tokens (map.js, "Place on map" or Add token). Players
 * never see it.
 */
import { api, fileUrl, h, readBase64, LoggedOut } from './api.js';
import { showStatBlock, statsFound } from './stat-block.js';
import { markdownFragment } from './markdown.js';
import { TOKEN_SIZES, TOKEN_SIZE_NAMES, TOKEN_COLORS } from './shared/map.js';

const $ = (sel) => document.querySelector(sel);
const KIND_NAMES = { enemy: 'Enemy', npc: 'Friendly NPC' };

const state = {
  campaignId: null,
  guarded: (fn) => fn(),
  list: [],
  filter: '',
  pictures: new Map(), // `${id}:${key}` -> object URL
  place: null, // (creature) => void, from map.js
  poll: null, // timer while the AI is searching for one
};

const base = () => `/campaigns/${state.campaignId}/creatures`;

function status(text, error = false) {
  const el = $('#creatures-status');
  el.textContent = text;
  el.classList.toggle('error', error);
}

const report = (err) => {
  if (err instanceof LoggedOut) throw err;
  status(err.message, true);
};

/** The DM's creatures for this campaign (called when a DM enters a campaign). */
export async function loadCreatures({ campaignId, guarded }) {
  for (const url of state.pictures.values()) URL.revokeObjectURL(url);
  state.pictures.clear();
  clearTimeout(state.poll);
  Object.assign(state, { campaignId, guarded, list: [], filter: '' });
  $('#creatures-filter').value = '';
  status('');
  state.list = (await api('GET', base())).creatures;
  draw();
}

/** While the AI is searching the web for one, check back every few seconds. */
function watchSearches() {
  clearTimeout(state.poll);
  if (!state.list.some((c) => c.finding?.status === 'pending')) return;
  const cid = state.campaignId;
  state.poll = setTimeout(async () => {
    if (state.campaignId !== cid) return;
    try {
      const was = new Map(state.list.map((c) => [c.id, c.finding?.status]));
      state.list = (await api('GET', base())).creatures;
      for (const c of state.list) {
        if (was.get(c.id) !== 'pending' || c.finding?.status === 'pending') continue;
        status(c.finding ? `The AI couldn't find "${c.finding.query}".` : `Found ${c.name}${c.source ? ` (${c.source.official ? 'official' : 'unofficial'}, from ${c.source.title || 'the web'})` : ''}. Check its stat block before you use it.`, !!c.finding);
      }
      draw();
    } catch (err) {
      if (err instanceof LoggedOut) return state.guarded(() => { throw err; });
      watchSearches();
    }
  }, 3000);
}

/** The creatures as last loaded (map.js offers them in Add token). */
export const creatureList = () => state.list;

/** Something else saved one (a token saved from the map): show it. */
export function creatureSaved(c) {
  upsert(c);
  status(`${c.name} is in your creatures now.`);
}

function upsert(c) {
  const i = state.list.findIndex((x) => x.id === c.id);
  if (i >= 0) state.list[i] = c;
  else state.list.push(c);
  state.list.sort((a, b) => a.name.localeCompare(b.name));
  draw();
}

// ---------- the list ----------

function face(c) {
  const initials = c.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const el = h('span', { class: 'creature-face', style: `--token:${c.color}` }, initials);
  if (!c.picture) return el;
  const key = `${c.id}:${c.picture}`;
  const show = (url) => el.replaceChildren(h('img', { src: url, alt: '' }));
  if (state.pictures.has(key)) show(state.pictures.get(key));
  else {
    const cid = state.campaignId;
    fileUrl(`${base()}/${c.id}/picture?v=${encodeURIComponent(c.picture)}`)
      .then((url) => {
        if (state.campaignId !== cid) return URL.revokeObjectURL(url);
        state.pictures.set(key, url);
        show(url);
      })
      .catch(() => {});
  }
  return el;
}

/** "AC 15 · HP 7 · CR 1/4 · Small", from what it has. */
function summary(c) {
  const st = c.stats ?? {};
  return [
    st.ac != null ? `AC ${st.ac}` : '',
    c.hp_max ? `HP ${c.hp_max}` : '',
    st.challenge ? `CR ${st.challenge.split(' ')[0]}` : '',
    TOKEN_SIZE_NAMES[c.size],
    c.speed ? `${c.speed} ft.` : '',
    c.darkvision ? `darkvision ${c.darkvision} ft.` : '',
  ].filter(Boolean).join(' · ');
}

function draw() {
  watchSearches();
  const box = $('#creatures');
  const q = state.filter.trim().toLowerCase();
  const shown = state.list.filter((c) => !q || c.name.toLowerCase().includes(q) || c.notes.toLowerCase().includes(q));
  if (!state.list.length) {
    return box.replaceChildren(h('p', { class: 'muted' }, 'No creatures yet. Make the enemies and NPCs you need once here, then put them on any map with "Place on map" (or Add token on the map). You can also save a token that is already on a map.'));
  }
  if (!shown.length) return box.replaceChildren(h('p', { class: 'muted' }, 'None match.'));
  box.replaceChildren(...shown.map((c) => (c.finding ? searchCard(c) : h('article', { class: `creature card ${c.kind}`, 'data-id': c.id },
    face(c),
    h('div', { class: 'creature-body' },
      h('div', { class: 'creature-head' },
        h('h3', {}, c.name),
        h('span', { class: `chip creature-kind ${c.kind}` }, KIND_NAMES[c.kind])),
      h('p', { class: 'muted small' }, summary(c)),
      sourceLine(c),
      c.notes ? h('p', { class: 'creature-notes small' }, c.notes) : null,
      h('div', { class: 'creature-actions' },
        h('button', { type: 'button', class: 'primary', onclick: () => state.place?.(c) }, 'Place on map'),
        h('button', { type: 'button', class: 'ghost', onclick: () => editDialog(c) }, 'Edit'),
        c.stats
          ? h('button', { type: 'button', class: 'ghost', onclick: () => statsDialog(c) }, 'Stat block')
          : h('button', { type: 'button', class: 'ghost', title: 'Fill in its stat block, hit points and size with the AI', onclick: () => fillStats(c) }, 'Stat block (AI)'),
        h('button', { type: 'button', class: 'ghost', onclick: () => choosePicture(c) }, c.picture ? 'New picture' : 'Picture'),
        h('button', { type: 'button', class: 'ghost danger', onclick: () => remove(c) }, 'Remove'))),
  ))));
}

/** One the AI is still searching for, or couldn't find. */
function searchCard(c) {
  const pending = c.finding.status === 'pending';
  return h('article', { class: `creature card searching${pending ? ' pending' : ' failed'}`, 'data-id': c.id },
    h('span', { class: 'creature-face', 'aria-hidden': 'true' }, pending ? '…' : '?'),
    h('div', { class: 'creature-body' },
      h('div', { class: 'creature-head' }, h('h3', {}, c.finding.query)),
      h('p', { class: pending ? 'muted small' : 'error small', role: 'status' }, pending ? 'The AI is searching the web for it. This can take a minute or two.' : c.finding.error),
      h('div', { class: 'creature-actions' },
        pending ? null : h('button', { type: 'button', class: 'ghost', onclick: () => findOnline(c.finding.query, c) }, 'Search again'),
        h('button', { type: 'button', class: 'ghost danger', onclick: () => remove(c) }, pending ? 'Cancel' : 'Remove'))));
}

/** Where one found online came from, as a link. */
function sourceLine(c) {
  if (!c.source) return null;
  return h('p', { class: 'muted small creature-source' }, c.source.official ? 'Official · from ' : 'Unofficial · from ',
    h('a', { href: c.source.url, target: '_blank', rel: 'noopener noreferrer' }, c.source.title || new URL(c.source.url).hostname));
}

// ---------- finding one online ----------

function findDialog() {
  const dialog = $('#creature-dialog');
  const query = h('input', { name: 'query', maxLength: 200, minLength: 2, required: true, placeholder: 'e.g. Ember Wyrmling, a crystal golem, the Hollow King from Grimhollow' });
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      findOnline(query.value.trim());
      dialog.close();
    } },
      h('h2', {}, 'Find a creature online'),
      field('What are you looking for?', query),
      h('p', { class: 'muted small' }, "The AI searches the web, official sources or not (homebrew sites, wikis, forums), writes up its stat block and brings a picture. Say where it's from if you know. Check what it found before you use it."),
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, 'Search')),
    ),
  );
  dialog.showModal();
  query.focus();
}

/** Start a search (again, replacing `old`). The card shows until the AI is done. */
async function findOnline(query, old = null) {
  if (query.length < 2) return;
  try {
    const res = await state.guarded(() => api('POST', `${base()}/find`, { query }));
    if (!res) return;
    if (old) {
      await state.guarded(() => api('DELETE', `${base()}/${old.id}`)).catch(() => {});
      state.list = state.list.filter((x) => x.id !== old.id);
    }
    state.list.push(res);
    draw();
    status(`Searching the web for "${query}"…`);
  } catch (err) {
    report(err);
  }
}

// ---------- making and changing one ----------

const field = (label, input) => h('label', { class: 'map-field' }, h('span', {}, label), input);

/** New (c = null) or change one: everything but the picture, which is chosen here only for a new one. */
function editDialog(c = null) {
  const dialog = $('#creature-dialog');
  const name = h('input', { name: 'name', value: c?.name ?? '', maxLength: 80, required: true, placeholder: 'Goblin, Mira the innkeeper…' });
  const kind = h('select', { name: 'kind' }, ...Object.entries(KIND_NAMES).map(([k, label]) => new Option(label, k)));
  kind.value = c?.kind ?? 'enemy';
  const size = h('select', { name: 'size' }, ...TOKEN_SIZES.map((s) => new Option(TOKEN_SIZE_NAMES[s], s)));
  size.value = String(c?.size ?? 1);
  const color = h('input', { name: 'color', type: 'color', value: c?.color ?? TOKEN_COLORS[kind.value] });
  let colorTouched = !!c;
  color.addEventListener('input', () => (colorTouched = true));
  kind.addEventListener('change', () => { if (!colorTouched) color.value = TOKEN_COLORS[kind.value]; });
  const hp = h('input', { name: 'hp_max', type: 'number', min: '1', step: '1', value: c?.hp_max ?? '', placeholder: 'unknown' });
  const speed = h('input', { name: 'speed', type: 'number', min: '0', step: '5', value: c?.speed ?? '', placeholder: 'from stat block' });
  const darkvision = h('input', { name: 'darkvision', type: 'number', min: '0', step: '5', value: c?.darkvision || '', placeholder: 'none' });
  const stats = h('textarea', { name: 'stats', rows: c?.stats?.text ? 14 : 6, maxLength: 8000, placeholder: 'Paste or type its stat block (Markdown is fine), or leave it empty and use "Stat block (AI)".' }, c?.stats?.text ?? '');
  // Shown as a formatted stat block; "Edit text" swaps in the Markdown to change it.
  const preview = h('div', { class: 'a stat-text stat-block' });
  const editText = h('button', { type: 'button', class: 'ghost small' });
  const showStats = (editing) => {
    const empty = !stats.value.trim();
    stats.hidden = !editing && !empty;
    preview.hidden = !stats.hidden;
    editText.hidden = empty;
    editText.textContent = stats.hidden ? 'Edit text' : 'Show stat block';
    if (stats.hidden) preview.replaceChildren(markdownFragment(stats.value));
  };
  editText.addEventListener('click', () => {
    showStats(stats.hidden);
    if (!stats.hidden) stats.focus();
  });
  stats.addEventListener('input', () => { editText.hidden = !stats.value.trim(); });
  showStats(false);
  const ac = h('input', { name: 'ac', type: 'number', step: '1', value: c?.stats?.ac ?? '', placeholder: '–' });
  const notes = h('textarea', { name: 'notes', rows: 3, maxLength: 4000, placeholder: 'Only you see these: tactics, what they know, what they want.' }, c?.notes ?? '');
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', 'aria-label': 'Picture' });
  const lookUp = h('input', { type: 'checkbox', checked: true });
  const error = h('p', { class: 'error small', hidden: true, role: 'alert' });

  const save = async () => {
    const typed = stats.value.trim();
    const body = {
      name: name.value.trim(),
      kind: kind.value,
      size: Number(size.value),
      color: color.value,
      hp_max: Number(hp.value) > 0 ? Math.round(Number(hp.value)) : null,
      speed: speed.value === '' ? null : Math.max(0, Number(speed.value) || 0),
      darkvision: Math.max(0, Number(darkvision.value) || 0),
      notes: notes.value,
    };
    // Only send the stat block when it changed (an AI one keeps its details otherwise).
    const acValue = ac.value === '' ? null : Math.round(Number(ac.value));
    if (typed !== (c?.stats?.text ?? '').trim() || acValue !== (c?.stats?.ac ?? null)) body.stats = typed ? { ...(c?.stats ?? {}), text: typed, ac: acValue } : null;
    if (body.stats) delete body.stats.source;
    const f = file.files[0];
    if (f && f.size > 10 * 1024 * 1024) throw new Error('That picture is too big (10 MB at most).');
    if (!c && f) body.picture = { filename: f.name, data: await readBase64(f) };
    const saved = await state.guarded(() => (c ? api('PATCH', `${base()}/${c.id}`, body) : api('POST', base(), body)));
    if (!saved) return;
    upsert(saved);
    status(c ? `${saved.name} saved.` : `${saved.name} added to your creatures.`);
    if (!c && !saved.stats && lookUp.checked) fillStats(saved);
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
      h('h2', {}, c ? `Change ${c.name}` : 'New creature'),
      field('Name', name),
      h('div', { class: 'map-row' }, field('Kind', kind), field('Size', size), field('Colour', color)),
      h('div', { class: 'map-row' }, field('Max HP', hp), field('AC', ac), field('Speed (ft)', speed), field('Darkvision (ft)', darkvision)),
      h('div', { class: 'map-field' }, h('span', { class: 'stat-block-head' }, 'Stat block', editText), preview, stats),
      field('Notes', notes),
      c ? null : field('Picture (optional)', file),
      c ? null : h('label', { class: 'map-check' }, lookUp, ' No stat block? Fill it in with the AI from its name'),
      error,
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, c ? 'Save' : 'Add')),
    ),
  );
  dialog.showModal();
  name.focus();
}

async function fillStats(c, other) {
  status(`Looking up ${other ?? c.name}…`);
  try {
    const res = await state.guarded(() => api('POST', `${base()}/${c.id}/stats`, other ? { name: other } : {}));
    if (!res) return;
    upsert(res);
    status(statsFound(res.name, res.stats.name));
  } catch (err) {
    report(err);
  }
}

const statsDialog = (c) => showStatBlock($('#creature-dialog'), { title: c.name, stats: c.stats, onLookup: (name) => fillStats(c, name) });

function choosePicture(c) {
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.remove();
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return status('That picture is too big (10 MB at most).', true);
    try {
      status('Uploading…');
      const res = await state.guarded(async () => api('PUT', `${base()}/${c.id}/picture`, { filename: f.name, data: await readBase64(f) }));
      if (!res) return;
      upsert(res);
      status(`${res.name} has a picture now. Tokens you place from now on get it.`);
    } catch (err) {
      report(err);
    }
  });
  document.body.append(input);
  input.click();
}

async function remove(c) {
  if (!confirm(`Remove ${c.name} from your creatures? Tokens already on maps stay.`)) return;
  try {
    const res = await state.guarded(() => api('DELETE', `${base()}/${c.id}`));
    if (!res) return;
    state.list = state.list.filter((x) => x.id !== c.id);
    draw();
    status(`${c.name} removed.`);
  } catch (err) {
    report(err);
  }
}

/** Wire the tab's buttons once. place(creature) puts one on the map (map.js). */
export function initCreatureActions({ place }) {
  state.place = place;
  $('#creature-new').addEventListener('click', () => editDialog());
  $('#creature-find').addEventListener('click', () => findDialog());
  $('#creatures-filter').addEventListener('input', (e) => {
    state.filter = e.target.value;
    draw();
  });
}
