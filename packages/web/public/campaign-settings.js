/**
 * The campaign's settings (shared/settings.js). The DM changes them from the
 * Settings button in the top bar; everyone's page hears the change live
 * (table.js calls settingsHeard) and the sheet works itself out again.
 */
import { api, h } from './api.js';
import { WEIGHT_RULES, normalizeSettings } from './shared/settings.js';
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

function openDialog() {
  const dialog = $('#settings-dialog');
  const result = h('p', { class: 'muted small', role: 'status' });
  const help = h('p', { class: 'muted small' }, WEIGHT_HELP[state.settings.weight]);
  const weight = h('select', { id: 'setting-weight', 'aria-label': 'Weight limits' }, Object.entries(WEIGHT_RULES).map(([v, n]) => new Option(n, v)));
  weight.value = state.settings.weight;
  weight.addEventListener('change', async () => {
    help.textContent = WEIGHT_HELP[weight.value];
    try {
      const saved = await state.guarded(() => api('PATCH', `/campaigns/${state.campaignId}/settings`, { weight: weight.value }));
      if (!saved) return;
      settingsHeard(saved);
      result.textContent = 'Saved. Everyone’s sheet follows it now.';
    } catch (err) {
      result.textContent = `Couldn't save that: ${err.message}`;
    }
  });
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => e.preventDefault() },
      h('h2', {}, 'Campaign settings'),
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
