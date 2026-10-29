/**
 * The top of the Features & traits box: what the character's classes and
 * race give them that isn't a Class features row (Thieves' Cant, Expertise,
 * Cunning Action, Evasion, Unarmored Defense, Darkvision...), each named with
 * a short summary, and the choices the sheet needs from the player (fighting
 * style, the invocations that change damage, Blessed Strikes...). Anything
 * the player already wrote in the box below is left out; their own text is
 * never changed.
 *
 * The lists are in shared/class-traits.js and shared/attack-extras.js; sheet.js passes in what this needs.
 */
import { traitRows } from '/shared/class-traits.js';
import { choiceGroups, normalizeCombat } from '/shared/attack-extras.js';
import { h } from '../page/dom.js';

const HOW = { number: 'in your numbers', roll: 'in your rolls', choice: 'pick below' };

/**
 * @param {object} ctx { state, changed, render }
 * @returns {HTMLElement} redrawn when the classes, race, edition or the player's text change
 */
export function traitsList({ state, changed, render }) {
  const el = h('div', { class: 'auto-traits' });
  const edition = () => state.settings?.edition || state.edition || '2014';
  let drawn = null;
  const paint = () => {
    const rows = traitRows(state.sheet, { edition: edition(), values: state.calc?.values });
    const groups = choiceGroups(state.sheet, edition());
    const combat = normalizeCombat(state.sheet.combat);
    const key = JSON.stringify([rows, groups.map((g) => g.group), combat.choices]);
    if (key === drawn) return;
    drawn = key;
    const shown = rows.filter((r) => !r.written);
    const written = rows.length - shown.length;
    if (!rows.length && !groups.length) return el.replaceChildren();
    el.replaceChildren(h('details', { class: 'auto-traits-list', open: true },
      h('summary', {}, 'From your class, subclass and race', h('span', { class: 'muted small' }, ` · ${shown.length}${written ? `, ${written} already in your notes below` : ''}`)),
      h('ul', { class: 'small' }, shown.map((r) => h('li', { 'data-trait': r.key },
        h('strong', {}, r.name), ` ${r.text}`,
        HOW[r.how] && !/In your|pick|Tick it|rolled so/i.test(r.text) ? h('span', { class: 'muted' }, ` (${HOW[r.how]})`) : null))),
      groups.length ? h('div', { class: 'auto-choices small' }, groups.map((g) => choiceView(g, combat))) : null,
      h('p', { class: 'muted small' }, `${edition()} rules. Write anything else (feats, invocations, your background's feature) below; a feature you write there by name isn't listed twice.`),
    ));
  };

  /** One group of choices: tick boxes (fighting styles, invocations) or one of a few (Blessed Strikes). */
  function choiceView(g, combat) {
    const one = g.count === 1 && g.group !== 'style';
    const picked = g.options.filter((o) => combat.choices.includes(o.id));
    const set = (ids) => {
      const c = normalizeCombat(state.sheet.combat);
      const others = c.choices.filter((id) => !g.options.some((o) => o.id === id));
      state.sheet.combat = { ...c, choices: [...others, ...ids] };
      changed();
      render();
    };
    const head = h('span', { class: 'lbl' }, `${g.name}${g.count ? ` (${g.count})` : ''}: `);
    if (one) {
      const sel = h('select', { 'aria-label': g.name }, h('option', { value: '' }, '–'), g.options.map((o) => h('option', { value: o.id, title: o.text }, o.name)));
      sel.value = picked[0]?.id ?? '';
      sel.addEventListener('change', () => set(sel.value ? [sel.value] : []));
      return h('div', { class: 'auto-choice', 'data-group': g.group }, head, sel, picked[0] ? h('span', { class: 'muted' }, ` ${picked[0].text}`) : null);
    }
    return h('div', { class: 'auto-choice', 'data-group': g.group }, head, g.options.map((o) => {
      const box = h('input', { type: 'checkbox', checked: picked.includes(o), 'aria-label': `${g.name}: ${o.name}` });
      box.addEventListener('change', () => set(box.checked ? [...picked.map((p) => p.id), o.id] : picked.filter((p) => p !== o).map((p) => p.id)));
      return h('label', { class: 'check', title: o.text }, box, ` ${o.name}`);
    }), picked.length > (g.count ?? Infinity) ? h('span', { class: 'error' }, ` That's more than your class gives (${g.count}); the DM has the last word.`) : null);
  }

  paint();
  state.renders.push(paint);
  return el;
}
