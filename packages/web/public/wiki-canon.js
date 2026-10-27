/**
 * Truth and rumour on the wiki's pages (docs/notes/wiki-space.md): every section, fact and picture caption has a
 * canon. The badge, the class that styles a part (style.css, "truth and rumour", one place for every view), the
 * editor's picker, and the DM's Truth toggle in the space's bar. The server already gives a player a falsehood as a
 * rumour and never a planned part or the truth; this only draws what it gets.
 */
import { h } from './api.js';
import { CANONS, normalizeCanon } from './shared/wiki.js';
import { state, nav, playerName } from './wiki-data.js';

const TRUTH_KEY = 'dndapp.wiki.truth';

/** The class a part gets for its canon ('' for a true one). */
export const canonClass = (x) => (normalizeCanon(x?.canon) === 'true' ? '' : ` canon-${normalizeCanon(x.canon)}`);

const accountOf = (owner, me) => (owner != null && owner === me ? 'Your account' : `${owner != null ? `${playerName(owner)}'s` : "A player's"} account`);

/** The badge before a part: null for a true one. `me` is the player it's drawn for, if any. */
export function canonBadge(x, { me = null } = {}) {
  const c = normalizeCanon(x?.canon);
  if (c === 'true') return null;
  const text = { rumour: 'Rumour', false: 'False', planned: 'Planned', told: accountOf(x.owner, me) }[c];
  const title = {
    rumour: 'Heard, not confirmed',
    false: 'The players believe this, but it isn\'t so',
    planned: 'Your prep: players get nothing of it until you make it true',
    told: 'A player\'s telling, until you confirm or deny it',
  }[c];
  return h('span', { class: `wiki-canon canon-${c}`, title }, text);
}

/** The truth beside a falsehood, for the DM (a player's page never has it). */
export const truthNote = (x) => (normalizeCanon(x?.canon) === 'false'
  ? h('span', { class: 'wiki-truth' }, h('strong', {}, 'Truth: '), x.truth?.trim() || 'not written yet')
  : null);

const LABELS = { true: 'True', rumour: 'Rumour', false: 'False (they believe it)', planned: 'Planned (my prep)', told: 'A player\'s account' };

/** The editor's canon picker: a select, the Truth box for a falsehood, the teller for an account. { el, value() }. */
export function canonPicker(x, { label }) {
  const mode = h('select', { 'aria-label': `${label}: true or rumour`, class: 'wiki-canon-pick' }, ...CANONS.map((c) => h('option', { value: c }, LABELS[c])));
  mode.value = normalizeCanon(x?.canon);
  const truth = h('textarea', { rows: 2, maxLength: 2000, class: 'wiki-truth-box', placeholder: 'What is really so (only you see this)', 'aria-label': `${label}: the truth` });
  truth.value = x?.truth ?? '';
  const owner = h('select', { 'aria-label': `${label}: whose account` },
    h('option', { value: '' }, 'A player'),
    ...state.players.map((p) => h('option', { value: String(p.id), selected: p.id === x?.owner }, p.character_name || p.name)));
  const show = () => {
    truth.hidden = mode.value !== 'false';
    owner.hidden = mode.value !== 'told';
  };
  mode.addEventListener('change', show);
  show();
  return {
    el: h('span', { class: 'wiki-canon-picker' }, mode, owner, truth),
    value: () => ({
      canon: mode.value,
      ...(mode.value === 'false' && { truth: truth.value.trim() }),
      ...(mode.value === 'told' && { owner: owner.value ? Number(owner.value) : null }),
    }),
  };
}

// ---------- the Truth toggle ----------

const readTruth = () => {
  try {
    return localStorage.getItem(TRUTH_KEY) === 'true';
  } catch {
    return false;
  }
};

/** Show the DM's choice on the space: `data-truth` hides rumours and what's believed, so only what's true is left. */
function applyTruth(on) {
  document.querySelector('#tab-wiki')?.toggleAttribute('data-truth', on);
  const btn = document.querySelector('#wiki-truth');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? 'Showing what\'s true' : 'Showing what they believe';
  btn.title = on ? 'Rumours and falsehoods are hidden and the truth is shown. Press to see it as the players believe it.' : 'Rumours and falsehoods are shown as the players believe them. Press to see only what\'s true.';
}

/** Set up the toggle in the bar (once). */
export function initTruthToggle() {
  const btn = document.querySelector('#wiki-truth');
  if (!btn || btn.dataset.ready) return;
  btn.dataset.ready = '1';
  applyTruth(readTruth());
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    try {
      localStorage.setItem(TRUTH_KEY, String(on));
    } catch { /* private window: just for now */ }
    applyTruth(on);
    if (state.view === 'web') nav.drawMain(); // the Web asks the server again, with or without the rumours
  });
}
