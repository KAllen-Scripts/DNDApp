/**
 * The turn order panel on the map (initiative): starting and ending a fight, rolling, turns.
 */
import { onMap, select } from './map.js';
import { api, h } from './api.js';
import { base, report, state, status } from './map-state.js';
import { roll, rollModeFromEvent } from './dice.js';

const $ = (sel) => document.querySelector(sel);

// ---------- initiative (the turn order in a fight) ----------

async function combat(body) {
  try {
    const res = await state.guarded(() => api('POST', `${base()}/${state.current.id}/combat`, body));
    if (!res) return;
    onMap(res.map);
    const sign = (n) => `${n < 0 ? '−' : '+'} ${Math.abs(n)}`;
    if (res.rolls.length === 1) {
      const [r] = res.rolls;
      status(`${r.name} rolled ${r.total} for initiative (d20 ${r.d20} ${sign(r.mod)}).`);
    } else if (res.rolls.length) {
      status(`Initiative: ${res.rolls.map((r) => `${r.name} ${r.total}`).join(', ')}.`);
    }
  } catch (err) {
    report(err);
  }
}

/** The turn order panel: open when there's a fight (or when someone opens it). */
export function renderCombat() {
  const panel = $('#map-combat');
  const map = state.current;
  if (map) {
    const active = !!map.combat;
    const was = state.combatActive.get(map.id);
    if (active && !was) state.combatOpen = true; // a fight started (or this is the first look at one)
    if (!active && was && !state.canEdit) state.combatOpen = false;
    state.combatActive.set(map.id, active);
  }
  $('#map-combat-open').setAttribute('aria-pressed', String(!!map && state.combatOpen));
  panel.hidden = !map || !state.combatOpen;
  if (panel.hidden) return panel.replaceChildren();
  // Don't rebuild the list while someone is typing a roll into it.
  if (panel.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const c = map.combat;
  const close = h('button', { class: 'ghost icon-btn', 'aria-label': 'Close the turn order', onclick: () => {
    state.combatOpen = false;
    renderCombat();
  } }, '✕');
  if (!c) {
    return panel.replaceChildren(
      h('header', {}, h('strong', {}, 'Initiative'), close),
      h('p', { class: 'muted small' }, state.canEdit
        ? 'No fight on this map. Start one: everyone on the map joins, and NPCs and enemies roll straight away (with their Dexterity from the stat block). Players roll their own.'
        : 'No fight on this map.'),
      h('footer', {}, state.canEdit ? h('button', { class: 'primary', onclick: () => combat({ action: 'start' }) }, 'Start a fight') : null),
    );
  }
  const byId = new Map(map.tokens.map((t) => [t.id, t]));
  const turnToken = byId.get(c.turn);
  const mine = (t) => state.canEdit || (t.user_id != null && t.user_id === state.userId);
  const rows = c.entries.map((e) => {
    const t = byId.get(e.id);
    if (!t) return null;
    let init;
    if (mine(t)) {
      init = h('input', { type: 'number', step: '1', value: e.init ?? '', placeholder: '–', 'aria-label': `Initiative for ${t.name}`, title: 'Type what you rolled at the table' });
      init.addEventListener('change', () => init.value !== '' && combat({ action: 'set', id: t.id, init: Math.round(Number(init.value)) }));
      init.addEventListener('keydown', (ev) => ev.key === 'Enter' && init.blur());
    } else {
      init = h('span', { class: 'init' }, e.init ?? '–');
    }
    return h('li', { class: `${c.turn === e.id ? 'current' : ''}${t.hidden ? ' hidden-token' : ''}`, 'data-id': t.id },
      h('span', { class: 'swatch', style: `background:${t.color}` }),
      h('button', { class: 'who', title: `Show ${t.name} on the map`, onclick: () => select(t.id) }, t.name),
      init,
      mine(t) && (e.init == null || state.canEdit) ? h('button', { class: 'ghost', 'aria-label': `Roll initiative for ${t.name}`, title: 'Roll a d20 plus their initiative', onclick: (ev) => (e.init == null && !state.canEdit
        // A player's own roll goes through the dice (3D, shared like any roll) and into the fight.
        ? roll(null, { label: 'Initiative', initiative: true, mode: rollModeFromEvent(ev) })
        : combat({ action: 'roll', id: t.id })) }, e.init == null ? 'Roll' : '↻') : null,
      state.canEdit ? h('button', { class: 'ghost icon-btn', 'aria-label': `Take ${t.name} out of the fight`, onclick: () => combat({ action: 'remove', id: t.id }) }, '✕') : null);
  });
  const whose = turnToken ? `${turnToken.name}'s turn` : c.turn_unseen ? "someone you can't see" : 'not started yet';
  const footer = [];
  if (state.canEdit) {
    const rolled = c.entries.some((e) => e.init != null);
    footer.push(h('button', { class: 'ghost', disabled: !c.turn, onclick: () => combat({ action: 'prev' }) }, 'Back'));
    footer.push(h('button', { class: 'primary', disabled: !rolled, onclick: () => combat({ action: 'next' }) }, c.turn ? 'Next turn' : 'First turn'));
    if (c.entries.some((e) => e.init == null && byId.get(e.id)?.kind !== 'pc')) footer.push(h('button', { class: 'ghost', onclick: () => combat({ action: 'roll' }) }, 'Roll for NPCs'));
    const out = map.tokens.filter((t) => !c.entries.some((e) => e.id === t.id));
    if (out.length) {
      const add = h('select', { 'aria-label': 'Add to the fight' }, new Option('+ Add', ''), ...out.map((t) => new Option(t.name, t.id)));
      add.addEventListener('change', () => add.value && combat({ action: 'add', ids: [add.value] }));
      footer.push(add);
    }
    footer.push(h('button', { class: 'ghost danger', onclick: () => confirm('End the fight? The turn order is cleared.') && combat({ action: 'end' }) }, 'End fight'));
  } else if (turnToken && turnToken.user_id === state.userId) {
    footer.push(h('button', { class: 'primary', onclick: () => combat({ action: 'next' }) }, 'End my turn'));
  }
  panel.replaceChildren(
    h('header', {}, h('strong', {}, `Round ${c.round}`), h('span', { class: 'muted small' }, whose), close),
    h('ol', { 'aria-label': 'Turn order' }, ...rows.filter(Boolean)),
    h('footer', {}, ...footer),
  );
}
