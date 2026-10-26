/**
 * The sheet's Background box (sheet.js's info box): it suggests the books'
 * backgrounds for the campaign's edition and the DM's own (campaign
 * settings), and when one is picked it applies it to the sheet
 * (shared/backgrounds.js `applyBackground`): skills ticked, its feature or
 * feat in Features & traits, tools and languages in Other proficiencies,
 * Equipment and gold only where they're empty. It says what changed, with
 * Undo, and what the background gives.
 */
import { h } from './api.js';
import { applyBackground, backgroundSummary, backgroundsFor, findBackground } from './shared/backgrounds.js';

// What was last applied, kept across redraws of the sheet: { name, changes, notes, before }.
let applied = null;

const editionOf = (state) => state.settings?.edition || state.edition || '2014';
const customOf = (state) => state.settings?.backgrounds ?? [];

/** The names the Background box suggests. */
export const backgroundNames = (state) => backgroundsFor(editionOf(state), customOf(state)).map((b) => b.name);

/** The background typed on the sheet, if the books or the DM know it. */
export const sheetBackground = (state) => findBackground(state.sheet?.background, { edition: editionOf(state), custom: customOf(state) });

/** A new sheet was loaded (another character, or another campaign): forget the last Undo. */
export function forgetApplied() {
  applied = null;
}

/**
 * Apply a background to the sheet now (picked in the Background box, or in
 * the Help panel): what changed shows under the Background box, with Undo.
 */
export function pickBackground({ state, changed, redraw }, b) {
  const before = structuredClone(state.sheet);
  state.sheet.background = b.name;
  const res = applyBackground(state.sheet, b);
  applied = { name: b.name, changes: res.changes, notes: res.notes, before: res.changes.length ? before : null };
  if (res.changes.length) Object.assign(state.sheet, res.sheet);
  redraw();
  changed();
}

/**
 * The Background input with what goes with it. `input` is the sheet's own
 * text field (typing is saved as usual); `redraw` draws the sheet again
 * after the background changed it.
 */
export function backgroundBox({ state, input, changed, redraw }) {
  const wrap = h('div', { class: 'bg-box' }, input);
  const apply = (b) => pickBackground({ state, changed, redraw }, b);
  input.addEventListener('change', () => {
    const b = sheetBackground(state);
    if (b && applied?.name !== b.name) apply(b);
  });
  const b = sheetBackground(state);
  if (applied && b?.name === applied.name) {
    wrap.append(h('div', { class: 'bg-applied notice small', role: 'status' },
      h('strong', {}, applied.changes.length ? `${applied.name} applied. ` : `${applied.name}: nothing to add, your sheet already has it. `),
      applied.changes.join(' '),
      applied.notes.length ? h('span', { class: 'muted' }, ` ${applied.notes.join(' ')}`) : null,
      applied.before ? h('button', {
        type: 'button',
        class: 'ghost small',
        onclick: () => {
          const { before } = applied;
          applied = null;
          for (const k of Object.keys(state.sheet)) delete state.sheet[k];
          Object.assign(state.sheet, before);
          redraw();
          changed();
        },
      }, 'Undo') : null,
      h('button', { type: 'button', class: 'ghost small', onclick: () => { applied = null; redraw(); } }, 'OK'),
    ));
  }
  if (b) {
    wrap.append(h('details', { class: 'bg-gives' },
      h('summary', {}, `What ${b.name} gives${b.custom ? ' (your DM\'s)' : ''}`),
      h('dl', {}, backgroundSummary(b).flatMap((l) => [h('dt', {}, l.label), h('dd', {}, l.text)])),
      h('p', { class: 'muted small' }, b.book),
      h('button', { type: 'button', class: 'ghost small', onclick: () => apply(b) }, `Apply ${b.name} to the sheet`),
    ));
  }
  return wrap;
}
