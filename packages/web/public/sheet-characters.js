/**
 * The player's characters, above the sheet on the Sheet tab: a player can have
 * several, and plays one at a time (the active one: the sheet below, their
 * token on maps, rests, purchases and what the DM sees). The strip says who
 * they play now; Characters opens the list with New character, Make active,
 * Rename and Delete (asked first). The server keeps the list (sheets/store.js).
 *
 * sheet.js owns the sheet itself: it hands this module the campaign and is
 * told (onSheet) when another character's sheet should be shown.
 */
import { api, h, storage } from './api.js';

const OPEN_KEY = 'dndapp.charactersOpen';

const state = {
  campaignId: null,
  guarded: (fn) => fn(),
  characters: [],
  active: 1,
  open: false,
  renaming: null, // the number of the character being renamed
  adding: false, // the New character form is showing
  busy: false,
  message: '',
  error: false,
  onSheet: () => {}, // show this sheet (a GET /sheet answer) below
  beforeSwitch: async () => {}, // save what's waiting on the sheet first
};

const $ = (sel) => document.querySelector(sel);
const base = () => `/campaigns/${state.campaignId}`;

/** Called by sheet.js when a campaign is entered (players only). */
export async function loadCharacters({ campaignId, guarded, onSheet, beforeSwitch }) {
  Object.assign(state, { campaignId, guarded, onSheet, beforeSwitch, renaming: null, adding: false, message: '', error: false });
  state.open = storage.get(OPEN_KEY) === '1';
  await refreshCharacters();
}

/** Ask the server for the list again (after a save renamed the character, or a switch elsewhere). */
export async function refreshCharacters() {
  if (!state.campaignId) return;
  const res = await state.guarded(() => api('GET', `${base()}/characters`)).catch(() => null);
  if (res) use(res);
  draw();
}

/** The sheet's name was typed: the strip and list show it without asking the server. */
export function nameTyped(number, name) {
  const c = state.characters.find((x) => x.number === number);
  if (!c || c.name === name) return;
  c.name = name;
  draw();
}

function use(res) {
  state.characters = res.characters ?? state.characters;
  state.active = res.active ?? state.active;
}

function say(text, error = false) {
  state.message = text;
  state.error = error;
}

/** Run a change on the server: the list comes back, and the sheet too when the active character changed. */
async function change(fn, { done, switching = false } = {}) {
  if (state.busy) return;
  state.busy = true;
  say('');
  draw();
  try {
    if (switching) await state.beforeSwitch();
    const res = await state.guarded(fn);
    if (!res) return;
    use(res);
    if (res.sheet) await state.onSheet(res.sheet);
    say(done?.(res) ?? '');
  } catch (err) {
    say(err.message, true);
  } finally {
    state.busy = false;
    draw();
  }
}

const activeOne = () => state.characters.find((c) => c.number === state.active) ?? state.characters[0];
const nameOf = (c) => c?.name?.trim() || 'Unnamed character';

function strip() {
  const now = activeOne();
  return h('div', { class: 'chars-strip' },
    h('span', { class: 'chars-now' },
      h('span', { class: 'muted small' }, 'Playing '),
      h('strong', {}, nameOf(now)),
      now?.summary ? h('span', { class: 'muted small' }, ` · ${now.summary}`) : null),
    h('button', {
      type: 'button',
      class: 'ghost small chars-toggle',
      'aria-expanded': String(state.open),
      'aria-controls': 'sheet-characters-list',
      title: 'Your characters here: make a new one, switch which one you play, rename or delete them',
      onclick: () => {
        state.open = !state.open;
        storage.set(OPEN_KEY, state.open ? '1' : '0');
        draw();
      },
    }, `Characters (${state.characters.length}) ${state.open ? '▴' : '▾'}`),
  );
}

function nameForm({ value = '', label, submit, cancel }) {
  const input = h('input', { type: 'text', value, maxLength: 100, 'aria-label': label, placeholder: 'Character name', required: true });
  const form = h('form', { class: 'chars-name-form', onsubmit: (e) => { e.preventDefault(); if (input.value.trim()) submit(input.value.trim()); } },
    input,
    h('button', { type: 'submit', class: 'small' }, label.startsWith('New') ? 'Create' : 'Save'),
    h('button', { type: 'button', class: 'ghost small', onclick: cancel }, 'Cancel'),
  );
  queueMicrotask(() => input.isConnected && input.focus());
  return form;
}

function row(c) {
  const playing = c.number === state.active;
  const renaming = state.renaming === c.number;
  const name = renaming
    ? nameForm({
      value: c.name,
      label: `New name for ${nameOf(c)}`,
      submit: (n) => change(() => api('PATCH', `${base()}/characters/${c.number}`, { name: n }), { done: () => { state.renaming = null; return `Renamed to ${n}.`; } }),
      cancel: () => { state.renaming = null; draw(); },
    })
    : h('span', { class: 'chars-name' }, h('strong', {}, nameOf(c)), c.summary ? h('span', { class: 'muted small' }, ` · ${c.summary}`) : null);
  return h('li', { class: `chars-row${playing ? ' playing' : ''}`, 'data-number': c.number },
    name,
    playing
      ? h('span', { class: 'chars-badge' }, 'Playing now')
      : h('button', {
        type: 'button',
        class: 'small',
        disabled: state.busy,
        title: 'Play this character: it becomes your sheet, your token on maps and what the DM sees',
        onclick: () => change(() => api('POST', `${base()}/characters/${c.number}/active`), { switching: true, done: () => `You now play ${nameOf(c)}.` }),
      }, 'Make active'),
    renaming ? null : h('button', { type: 'button', class: 'ghost small', disabled: state.busy, onclick: () => { state.renaming = c.number; state.adding = false; draw(); } }, 'Rename'),
    playing
      ? null
      : h('button', {
        type: 'button',
        class: 'ghost small danger',
        disabled: state.busy,
        onclick: () => {
          if (!confirm(`Delete ${nameOf(c)}? Their sheet goes from your list for good (the server's archive still keeps a copy).`)) return;
          change(() => api('DELETE', `${base()}/characters/${c.number}`), { done: () => `Deleted ${nameOf(c)}.` });
        },
      }, 'Delete'),
  );
}

function list() {
  return h('div', { class: 'chars-list', id: 'sheet-characters-list' },
    h('ul', {}, state.characters.map(row)),
    state.adding
      ? nameForm({
        label: 'New character name',
        submit: (n) => change(() => api('POST', `${base()}/characters`, { name: n }), { switching: true, done: () => { state.adding = false; return `Made ${n}: you play them now. ${state.characters.length > 1 ? 'Your other characters are kept.' : ''}`.trim(); } }),
        cancel: () => { state.adding = false; draw(); },
      })
      : h('button', { type: 'button', class: 'add-row', disabled: state.busy, onclick: () => { state.adding = true; state.renaming = null; draw(); } }, '+ New character'),
    h('p', { class: 'muted small' }, 'You play one character at a time: the one marked Playing now is your sheet, your token on maps and the one the DM sees. The others are kept, and only you see them.'),
  );
}

/** Draw the strip (and the list, when open) into #sheet-characters. */
export function draw() {
  const el = $('#sheet-characters');
  if (!el) return;
  el.hidden = !state.campaignId;
  // replaceChildren would print a null as the text "null", so the parts not shown are left out.
  el.replaceChildren(...[
    strip(),
    state.open ? list() : null,
    state.message ? h('p', { class: `chars-message small${state.error ? ' error' : ''}`, role: 'status' }, state.message) : null,
  ].filter(Boolean));
}
