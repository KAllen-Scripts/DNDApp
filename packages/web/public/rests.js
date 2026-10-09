/**
 * Rests the DM calls for the party. The DM gets a Rest button in the top bar:
 * pick who (everyone by default), then Short rest or Long rest. The server
 * changes each player's sheet; players hear about it live (table.js calls
 * restHeard) and their sheet reloads. Players spend hit dice and take their
 * own short rests from the Hit dice box on their sheet (sheet.js).
 */
import { api, h } from './api.js';
import { showToast } from './dice.js';
import { restCalled } from './sheet.js';

const $ = (sel) => document.querySelector(sel);

const state = { campaignId: null, guarded: (fn) => fn(), isDm: false, userId: null };
const base = () => `/campaigns/${state.campaignId}`;

const WHAT = {
  long: (edition) => `Hit points, spell slots and Pact Magic come back, temporary hit points and death saves are cleared, and ${edition === '2024' ? 'every spent hit die comes back' : 'up to half of each character\'s hit dice come back (a character at 0 hit points gets nothing from it)'}.`,
  short: () => 'Pact Magic slots come back. Each player can then spend hit dice from their sheet to heal.',
};

/** Enter a campaign: the DM gets the Rest button. */
export function setRestsCampaign({ campaignId, guarded, isDm, userId }) {
  Object.assign(state, { campaignId, guarded, isDm, userId });
  $('#rest-open').hidden = !isDm;
}

/** A rest arrived live: players' sheets reload, everyone gets a note. */
export function restHeard(rest) {
  const kind = rest.kind === 'long' ? 'long rest' : 'short rest';
  if (state.isDm) return;
  showToast('The DM called a ', h('strong', {}, kind), rest.skipped.includes(state.userId) ? ' (you were at 0 hit points, so it did nothing for you).' : '.');
  restCalled(rest);
}

async function openDialog() {
  const dialog = $('#rest-dialog');
  const [members, { edition, rests }] = await Promise.all([
    state.guarded(() => api('GET', `${base()}/members`)),
    state.guarded(() => api('GET', `${base()}/rests`)),
  ]).catch((err) => [null, { error: err }]);
  if (!members) return;
  const players = members.filter((m) => m.role === 'player' && !m.revoked_at);
  const nameOf = (id) => { const m = players.find((p) => p.id === id); return m ? m.character_name || m.name : 'someone'; };
  const ticks = players.map((p) => h('input', { type: 'checkbox', checked: true, value: p.id, 'aria-label': p.character_name || p.name }));
  const result = h('p', { class: 'muted small rest-result', role: 'status' });
  const call = async (kind) => {
    const chosen = ticks.filter((t) => t.checked).map((t) => Number(t.value));
    if (!chosen.length) return (result.textContent = 'Tick at least one player.');
    try {
      const rest = await state.guarded(() => api('POST', `${base()}/rests`, { kind, to: chosen.length === players.length ? 'everyone' : chosen }));
      if (!rest) return;
      const skipped = rest.skipped.map(nameOf);
      result.textContent = `${kind === 'long' ? 'Long' : 'Short'} rest done for ${rest.user_ids.map(nameOf).join(', ')}.${skipped.length ? ` ${skipped.join(', ')} ${skipped.length === 1 ? 'was' : 'were'} at 0 hit points and got nothing from it.` : ''}`;
      list.prepend(restItem(rest));
    } catch (err) {
      result.textContent = `Couldn't do that: ${err.message}`;
    }
  };
  const restItem = (r) => h('li', {}, `${r.kind === 'long' ? 'Long' : 'Short'} rest, ${new Date(r.at).toLocaleString()}: ${r.user_ids.map(nameOf).join(', ')}`);
  const list = h('ul', { class: 'rest-list small' }, rests.slice(0, 5).map(restItem));
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => e.preventDefault() },
      h('h2', {}, 'Rest'),
      players.length
        ? h('fieldset', { class: 'rest-who' }, h('legend', {}, 'Who rests'), players.map((p, i) => h('label', {}, ticks[i], ` ${p.character_name || p.name}`)))
        : h('p', { class: 'muted' }, 'There are no players in this campaign yet.'),
      h('p', { class: 'muted small' }, h('strong', {}, 'Short rest: '), WHAT.short()),
      h('p', { class: 'muted small' }, h('strong', {}, 'Long rest: '), WHAT.long(edition), ` (${edition} rules)`),
      result,
      rests.length ? h('details', {}, h('summary', { class: 'small' }, 'Recent rests'), list) : list,
      h('div', { class: 'map-dialog-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Close'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', disabled: !players.length, onclick: () => call('short') }, 'Short rest'),
        h('button', { type: 'button', class: 'primary', disabled: !players.length, onclick: () => call('long') }, 'Long rest')),
    ),
  );
  dialog.showModal();
}

export function initRests() {
  $('#rest-open').addEventListener('click', () => openDialog());
}
