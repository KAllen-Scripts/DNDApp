/**
 * The turn order panel on the map (initiative): starting and ending a fight, rolling, turns.
 */
import { onMap, select } from './map.js';
import { api, h, storage } from './api.js';
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

// ---------- moving the panel (its header is the handle) ----------

const PLACE_KEY = 'dndapp.turnOrderPlace'; // where this browser keeps the panel: { x, y }, 0..1 of the free room each way
const MOVE_HINT = 'Drag to move this panel (double-click to put it back)';
const isPhone = () => document.documentElement.hasAttribute('data-phone');

function savedPlace() {
  try {
    const p = JSON.parse(storage.get(PLACE_KEY));
    return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? p : null;
  } catch { return null; }
}

/** The free room the panel can move in: the map's box less the panel's own size. */
function room(panel) {
  const box = panel.parentElement.getBoundingClientRect();
  const own = panel.getBoundingClientRect();
  return { box, w: Math.max(0, box.width - own.width), h: Math.max(0, box.height - own.height) };
}

/** Put the panel where it was moved to (kept on screen), or back in its usual corner. On a phone it stays put (mobile.css). */
export function placeCombat() {
  const panel = $('#map-combat');
  const place = savedPlace();
  if (!panel || panel.hidden || !place || isPhone()) {
    panel?.classList.remove('moved');
    panel?.style.removeProperty('left');
    panel?.style.removeProperty('top');
    return;
  }
  const { w, h: free } = room(panel);
  panel.classList.add('moved');
  panel.style.left = `${Math.round(Math.min(1, Math.max(0, place.x)) * w)}px`;
  panel.style.top = `${Math.round(Math.min(1, Math.max(0, place.y)) * free)}px`;
}

function startMove(e) {
  const panel = $('#map-combat');
  if (e.button !== 0 || isPhone() || !e.target.closest('header') || e.target.closest('button, input, select')) return;
  e.preventDefault();
  const start = { x: e.clientX, y: e.clientY, ...room(panel), left: panel.getBoundingClientRect().left, top: panel.getBoundingClientRect().top };
  const at = (ev) => ({
    x: start.w ? Math.min(1, Math.max(0, (start.left - start.box.left + ev.clientX - start.x) / start.w)) : 0,
    y: start.h ? Math.min(1, Math.max(0, (start.top - start.box.top + ev.clientY - start.y) / start.h)) : 0,
  });
  panel.setPointerCapture?.(e.pointerId);
  panel.classList.add('moving');
  let moved = false;
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return; // a click, not a drag
    moved = true;
    const p = at(ev);
    panel.classList.add('moved');
    panel.style.left = `${Math.round(p.x * start.w)}px`;
    panel.style.top = `${Math.round(p.y * start.h)}px`;
  };
  const end = (ev) => {
    panel.removeEventListener('pointermove', move);
    panel.removeEventListener('pointerup', end);
    panel.removeEventListener('pointercancel', end);
    panel.classList.remove('moving');
    if (ev.type !== 'pointerup') return;
    move(ev);
    if (moved) storage.set(PLACE_KEY, JSON.stringify(at(ev)));
  };
  panel.addEventListener('pointermove', move);
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
}

function initMoving(panel) {
  if (panel.dataset.movable) return;
  panel.dataset.movable = '1';
  panel.addEventListener('pointerdown', startMove);
  // A double-click on the header puts it back in its corner.
  panel.addEventListener('dblclick', (e) => {
    if (!e.target.closest('header') || e.target.closest('button, input, select')) return;
    storage.set(PLACE_KEY, null);
    placeCombat();
  });
  // The map's box changes size (the window, full screen, a panel beside it): keep the panel inside it.
  if (window.ResizeObserver) new ResizeObserver(() => placeCombat()).observe(panel.parentElement);
  else window.addEventListener('resize', placeCombat);
  window.addEventListener('dndlook', placeCombat);
}

/** Hit points in a few characters: numbers where this viewer gets them, else how hurt it looks. */
const HURT = { unhurt: 'Unhurt', hurt: 'Hurt', bloodied: 'Bloodied', down: 'Down' };
function hpShort(t) {
  if (t.hp?.max != null || t.hp?.current != null) return t.hp.max != null ? `${t.hp.current ?? '?'}/${t.hp.max}` : `${t.hp.current}`;
  return HURT[t.health] ?? '';
}

/** The turn order panel: open when there's a fight (or when someone opens it). */
export function renderCombat() {
  drawCombat();
  placeCombat();
}

function drawCombat() {
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
  initMoving(panel);
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
      h('header', { title: MOVE_HINT }, h('strong', {}, 'Initiative'), close),
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
      h('button', { class: 'who', title: `${t.name}: show on the map`, onclick: () => select(t.id) }, t.name),
      hpShort(t) ? h('span', { class: 'hp muted small', title: 'Hit points' }, hpShort(t)) : null,
      init,
      mine(t) && (e.init == null || state.canEdit) ? h('button', { class: 'ghost', 'aria-label': `Roll initiative for ${t.name}`, title: 'Roll a d20 plus their initiative', onclick: (ev) => (e.init == null && !state.canEdit && t.kind === 'pc'
        // A player's own character's roll goes through the dice (3D, shared like any roll) and into the fight;
        // a companion's or summon's is rolled by the server from its stat block, like an NPC's.
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
    h('header', { title: MOVE_HINT }, h('strong', {}, `Round ${c.round}`), h('span', { class: 'muted small whose' }, whose), close),
    h('ol', { 'aria-label': 'Turn order' }, ...rows.filter(Boolean)),
    h('footer', {}, ...footer),
  );
}
