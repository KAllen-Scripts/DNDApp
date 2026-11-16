/**
 * The Spend list (top of the Actions tab): everything the character uses up and gets back, in one place.
 * Spell slots and Pact Magic slots, the uses and points of class, subclass, race and feat rows (Class
 * features), hit dice left, and items' charges. Ticking here is the same as ticking in the box each
 * comes from (Spells, Class features, Inventory); Rest in the header gives them back.
 */
import { h } from '../page/dom.js';
import { featureRows, setSpent, RECHARGE_NAMES } from '/shared/class-features.js';
import { hitDice } from '/shared/sheet.js';

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const MAX_TICKS = 10;

/** Round ticks for `used` of `max`; setUsed(n) when one is clicked (the nth ticked, or unticked). */
function ticks(label, max, used, setUsed) {
  return h('span', { class: 'pips' }, Array.from({ length: max }, (_, i) => {
    const b = h('input', { type: 'checkbox', checked: i < used, 'aria-label': `${label} ${i + 1}` });
    b.addEventListener('change', () => setUsed(b.checked ? i + 1 : i));
    return b;
  }));
}

/** A number left of a maximum with − and + (pools of points, and uses past ten). */
function counter(label, max, used, setUsed) {
  const left = Math.max(0, max - used);
  return h('span', { class: 'spend-count' },
    h('button', { type: 'button', class: 'pb-step', 'aria-label': `Use one ${label}`, disabled: !left, onclick: () => setUsed(used + 1) }, '−'),
    h('span', {}, `${left} / ${max}`),
    h('button', { type: 'button', class: 'pb-step', 'aria-label': `One more ${label}`, disabled: !used, onclick: () => setUsed(used - 1) }, '+'));
}

/** @param {{ state, changed: () => void, edition: () => string }} ctx */
export function spendBox({ state, changed, edition }) {
  const el = h('section', { class: 'sh-box spend', 'aria-label': 'Spend' });
  let drawn = '';
  const draw = () => {
    const values = state.calc.values;
    const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ n, max: Number(values[`slots.${n}`]) || 0, used: state.sheet.spellcasting.slots_used[n] ?? 0 })).filter((s) => s.max);
    const pact = Number(values.pact_slots) || 0;
    const rows = featureRows(state.sheet, { edition: edition(), values }).filter((r) => r.kind !== 'info' && r.max);
    const dice = hitDice(state.sheet, values);
    const charged = state.sheet.inventory.filter((g) => g.charges?.max);
    const key = JSON.stringify([slots, pact, values.pact_level, state.sheet.spellcasting.pact_used, rows.map((r) => [r.id, r.name, r.max, r.spent, r.kind, r.recharge]), dice, charged.map((g) => [g.id, g.name, g.charges])]);
    if (key === drawn) return;
    drawn = key;
    const line = (name, control, note = '') => h('div', { class: 'spend-row' }, h('span', { class: 'spend-name' }, name), control, note ? h('span', { class: 'muted small' }, note) : null);
    const groups = [];
    if (slots.length || pact) {
      groups.push(h('div', { class: 'spend-group' }, h('h4', {}, 'Spell slots'),
        slots.map((s) => line(ORDINALS[s.n], ticks(`${ORDINALS[s.n]} level slot used (Spend)`, s.max, s.used, (n) => {
          if (n) state.sheet.spellcasting.slots_used[s.n] = n;
          else delete state.sheet.spellcasting.slots_used[s.n];
          changed();
        }))),
        pact ? line(`Pact (${ORDINALS[values.pact_level] ?? ''})`, ticks('Pact slot used (Spend)', pact, state.sheet.spellcasting.pact_used, (n) => { state.sheet.spellcasting.pact_used = n; changed(); }), 'short rest') : null));
    }
    if (rows.length) {
      const set = (r) => (n) => { state.sheet.class_features = setSpent(state.sheet, r.id, n).class_features; changed(); };
      groups.push(h('div', { class: 'spend-group' }, h('h4', {}, 'Features'),
        rows.map((r) => line(r.name,
          r.kind === 'pool' || r.max > MAX_TICKS ? counter(r.name, r.max, r.spent, set(r)) : ticks(`${r.name} used (Spend)`, r.max, r.spent, set(r)),
          RECHARGE_NAMES?.[r.recharge] ? String(RECHARGE_NAMES[r.recharge]).toLowerCase() : ''))));
    }
    if (dice.length) {
      groups.push(h('div', { class: 'spend-group' }, h('h4', {}, 'Hit dice'),
        dice.map((d) => line(`d${d.die}`, h('span', {}, `${d.left} of ${d.total} left`), 'spend them under Rest'))));
    }
    if (charged.length) {
      groups.push(h('div', { class: 'spend-group' }, h('h4', {}, 'Item charges'),
        charged.map((g) => line(g.name, h('span', {}, `${g.charges.max - g.charges.used} of ${g.charges.max} left`), g.charges.when || ''))));
    }
    el.replaceChildren(h('h3', {}, 'Spend'), ...(groups.length ? groups : [h('p', { class: 'muted small' }, 'Nothing to spend yet: spell slots, feature uses, hit dice and item charges show here.')]));
  };
  state.renders.push(draw);
  return el;
}
