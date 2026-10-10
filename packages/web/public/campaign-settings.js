/**
 * The campaign's settings (shared/settings.js). The DM changes them from the
 * Settings button in the top bar; everyone's page hears the change live
 * (table.js calls settingsHeard) and the sheet works itself out again.
 */
import { api, h } from './api.js';
import { EDITIONS, WEIGHT_RULES, normalizeSettings } from './shared/settings.js';
import { setSheetSettings } from './sheet.js';

const $ = (sel) => document.querySelector(sel);

const state = { campaignId: null, guarded: (fn) => fn(), isDm: false, settings: normalizeSettings() };

const WEIGHT_HELP = {
  capacity: 'Characters can carry 15 lb per point of Strength (double with Powerful Build). More than that and their speed drops to 5 ft.',
  variant: 'Over 5 lb per point of Strength: speed −10 ft. Over 10 lb per point: speed −20 ft and disadvantage on Strength, Dexterity and Constitution rolls. Never over 15 lb per point.',
  ignore: 'No weight limits: carry anything. Weights are still added up on the Inventory tab.',
};

/** Enter a campaign with its settings (from /me): the DM gets the Settings button. */
export function setSettingsCampaign({ campaignId, guarded, isDm, settings }) {
  Object.assign(state, { campaignId, guarded, isDm, settings: normalizeSettings(settings) });
  $('#settings-open').hidden = !isDm;
  setSheetSettings(state.settings);
}

/** The DM changed the settings (live). */
export function settingsHeard(settings) {
  state.settings = normalizeSettings(settings);
  setSheetSettings(state.settings);
}

const EDITION_HELP = 'Rests, Ask’s rules answers and lookups in your books (spells, stat blocks, items) follow it. The character sheet still works itself out with the 2014 rules.';

function openDialog() {
  const dialog = $('#settings-dialog');
  const result = h('p', { class: 'muted small', role: 'status' });
  const save = async (patch, done) => {
    try {
      const saved = await state.guarded(() => api('PATCH', `/campaigns/${state.campaignId}/settings`, patch));
      if (!saved) return;
      settingsHeard(saved);
      result.textContent = done;
    } catch (err) {
      result.textContent = `Couldn't save that: ${err.message}`;
    }
  };
  const help = h('p', { class: 'muted small' }, WEIGHT_HELP[state.settings.weight]);
  const weight = h('select', { id: 'setting-weight', 'aria-label': 'Weight limits' }, Object.entries(WEIGHT_RULES).map(([v, n]) => new Option(n, v)));
  weight.value = state.settings.weight;
  weight.addEventListener('change', () => {
    help.textContent = WEIGHT_HELP[weight.value];
    save({ weight: weight.value }, 'Saved. Everyone’s sheet follows it now.');
  });
  // Not chosen: the server follows REST_RULES or the books' Player's Handbook; the Rests list says which.
  const unset = new Option('Not chosen: follow the Player’s Handbook in the books', '');
  const edition = h('select', { id: 'setting-edition', 'aria-label': 'Rules edition' }, unset, Object.entries(EDITIONS).map(([v, n]) => new Option(n, v)));
  edition.value = state.settings.edition ?? '';
  api('GET', `/campaigns/${state.campaignId}/rests`)
    .then((r) => { unset.textContent = `Not chosen: follow the Player’s Handbook in the books (now ${r.edition})`; })
    .catch(() => {});
  edition.addEventListener('change', () => save({ edition: edition.value || null }, 'Saved. Rests, Ask and lookups follow it now.'));
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => e.preventDefault() },
      h('h2', {}, 'Campaign settings'),
      h('label', { class: 'fld' }, h('span', {}, 'Rules edition'), edition),
      h('p', { class: 'muted small' }, EDITION_HELP),
      h('label', { class: 'fld' }, h('span', {}, 'Weight limits'), weight),
      help,
      result,
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'primary', onclick: () => dialog.close() }, 'Done')),
    ),
  );
  dialog.showModal();
}

export function initSettings() {
  $('#settings-open').addEventListener('click', () => openDialog());
}
