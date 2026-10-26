/**
 * Attacks and area spells from the map (owner, 2026-10-21: "select an enemy and make an attack. Or cast an
 * AOE spell… smooth and easy, not clunky"). Pick the enemy, Attack, tap the weapon or spell: three taps, no
 * keyboard. Or from your own token: Attack, the weapon, then tap who. An area spell places its template and
 * the server finds who's in it. The server rolls everything (routes/attacks.js); this page shows the dice it
 * rolled and a card per attack, to everyone who can see it (the map's `attacks`, filtered by the server).
 */
import { api, h } from './api.js';
import { ownToken } from './shared/map.js';
import { campaignSettings } from './campaign-settings.js';
import { base, report, state, status } from './map-state.js';
import { onMap, renderMeasureTools, renderPinTool, renderRuler, renderTokens, setTool } from './map.js';
import { hideRollResult, nextD20Mode, showRolls } from './dice.js';

const $ = (sel) => document.querySelector(sel);
const ABBR = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };
const MODES = { normal: 'Normal', advantage: 'Advantage', disadvantage: 'Disadvantage' };
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const FOOT = { ft: 1, m: 0.3, mi: 1 / 5280, km: 0.0003 };
const signed = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

const attacksOn = () => !!campaignSettings().attacks?.on;
/** Tokens this viewer acts with: the DM any (not players' own characters by default), a player their own. */
const controls = (t) => (state.canEdit ? true : ownToken(t, state.userId));
const canAct = (t) => controls(t) && (t.kind === 'pc' || !!t.stats || state.canEdit);

/** Who attacks when someone picks a target: whose turn it is if it's theirs to run, else the last one used, else their character. */
function defaultAttacker(target) {
  const map = state.current;
  const mine = map.tokens.filter((t) => t.id !== target?.id && canAct(t) && (!state.canEdit || t.kind !== 'pc'));
  const turn = mine.find((t) => t.id === map.combat?.turn);
  return turn ?? mine.find((t) => t.id === state.lastAttacker) ?? mine.find((t) => t.kind === 'pc') ?? mine[0] ?? null;
}

/** The Attack button for the picked token's bar: act with it (your own) or at it (anyone else). */
export function attackControls(token) {
  if (!attacksOn() || !state.current) return [];
  const actWith = state.canEdit ? token.kind !== 'pc' : ownToken(token, state.userId);
  if (actWith) return canAct(token) ? [h('button', { class: 'primary', 'data-attack': 'with', title: `Attack or cast a spell with ${token.name}`, onclick: () => pickAction({ attacker: token }) }, 'Attack')] : [];
  if (!defaultAttacker(token)) return [];
  return [h('button', { class: 'primary', 'data-attack': 'at', title: `Attack ${token.name}, or cast a spell at it`, onclick: () => pickAction({ target: token }) }, 'Attack')];
}

/** What an action does, in a few words: "+6 · 1d8+3 piercing", "DC 15 Dex · 8d6 fire · 20 ft sphere". */
function actionText(x) {
  const area = x.area ? `${x.area.size} ft ${x.area.shape === 'circle' ? 'sphere' : x.area.shape}` : '';
  const how = x.kind === 'attack' ? signed(x.bonus ?? 0) : x.kind === 'save' ? `DC ${x.dc} ${ABBR[x.save] ?? ''} save` : x.kind === 'heal' ? 'heals' : 'hits';
  return [how, x.damage, area].filter(Boolean).join(' · ');
}

/**
 * The attack picker: who attacks (if there's a choice), Normal / Advantage / Disadvantage, and one big
 * button per weapon and spell. A tap on one attacks (or places its area, or asks who).
 */
export async function pickAction({ attacker = null, target = null }) {
  const map = state.current;
  attacker ??= defaultAttacker(target);
  if (!map || !attacker) return;
  const dialog = $('#map-dialog');
  let res;
  try {
    res = await state.guarded(() => api('GET', `${base()}/${map.id}/tokens/${attacker.id}/actions${target ? `?target=${target.id}` : ''}`));
  } catch (err) {
    return report(err);
  }
  if (!res) return;
  let mode = nextD20Mode();
  const modeRow = h('div', { class: 'attack-modes', role: 'group', 'aria-label': 'Advantage' });
  const drawModes = () => modeRow.replaceChildren(...Object.entries(MODES).map(([k, n]) => h('button', { type: 'button', class: mode === k ? 'primary' : 'ghost', 'aria-pressed': String(mode === k), onclick: () => { mode = k; drawModes(); } }, n)));
  drawModes();
  // Choosing someone else to attack with reopens the picker for them.
  const choices = map.tokens.filter((t) => t.id !== target?.id && canAct(t) && (!state.canEdit || t.kind !== 'pc' || t.id === attacker.id));
  const who = choices.length > 1 ? h('select', { 'aria-label': 'Who attacks', onchange: (e) => pickAction({ attacker: map.tokens.find((t) => t.id === e.target.value), target }) }, choices.map((t) => new Option(t.name, t.id, false, t.id === attacker.id))) : null;
  const slots = res.slots;
  const rows = res.actions.map((x) => {
    // What the character can add on a hit; one with options (Divine Smite's slot) has a picker beside it.
    const picks = {};
    const riders = (res.riders?.[x.id] ?? []).map((rd) => {
      const box = h('input', { type: 'checkbox', checked: rd.checked, 'data-rider': rd.id });
      const what = rd.hit ? `${rd.hit} to hit, +${rd.dice}` : `+${rd.dice}`;
      const label = h('label', { class: 'map-check small', title: rd.note }, box, ` ${rd.name} (${what})`);
      if (!rd.options?.length) return label;
      const pick = h('select', { 'aria-label': `${rd.name}: slot`, class: 'small' }, rd.options.map((o) => new Option(`${o.label}: ${o.dice}`, String(o.value), false, String(o.value) === String(rd.picked))));
      picks[rd.id] = pick;
      return h('span', { class: 'attack-rider' }, label, ' ', pick);
    });
    const twoHands = x.damage2 ? h('input', { type: 'checkbox' }) : null;
    const slotPick = x.level >= 1 && x.upcast ? h('select', { 'aria-label': `${x.name}: slot level` }, Array.from({ length: 10 - x.level }, (_, k) => new Option(`${ORD[x.level + k]} level${slots ? ` (${slots[x.level + k] ?? 0}${slots.pact?.level === x.level + k ? ` + ${slots.pact.left} pact` : ''} left)` : ''}`, x.level + k))) : null;
    const useSlot = x.level >= 1 ? h('input', { type: 'checkbox', checked: true }) : null;
    const left = x.level >= 1 && slots && !slotPick ? h('span', { class: 'muted small' }, ` ${(slots[x.level] ?? 0) + (slots.pact?.level === x.level ? slots.pact.left : 0)} ${ORD[x.level]}-level slots left`) : null;
    const go = () => {
      const opts = {
        mode,
        riders: riders.map((l) => l.querySelector('input')).filter((b) => b.checked).map((b) => b.dataset.rider),
        rider_options: Object.fromEntries(Object.entries(picks).map(([id, sel]) => [id, sel.value === 'free' ? 'free' : Number(sel.value)])),
        two_hands: !!twoHands?.checked,
        ...(slotPick && { slot: Number(slotPick.value) }),
        ...(useSlot && { use_slot: useSlot.checked }),
      };
      dialog.close();
      state.lastAttacker = attacker.id;
      nextD20Mode({ used: true });
      if (x.area && !(target && x.kind !== 'save')) return placeArea(attacker, x, opts);
      if (target) return send({ attacker: attacker.id, action: x.id, target: target.id, ...opts });
      startTargeting(attacker, x, opts);
    };
    const sit = x.situation && x.situation.mode !== 'normal' ? h('span', { class: `small attack-sit ${x.situation.mode}` }, `${MODES[x.situation.mode]}: ${x.situation.reasons.join(', ')}`) : null;
    return h('div', { class: 'attack-row', 'data-action': x.id },
      h('button', { type: 'button', class: 'attack-go', onclick: go },
        h('strong', {}, x.name),
        h('span', { class: 'muted small' }, actionText(x)),
      ),
      sit,
      ...(riders.length || twoHands || slotPick || useSlot ? [h('div', { class: 'attack-opts' },
        ...riders,
        twoHands ? h('label', { class: 'map-check small' }, twoHands, ` Two hands (${x.damage2})`) : null,
        slotPick,
        useSlot ? h('label', { class: 'map-check small', title: 'Untick for a scroll, an item or a free casting' }, useSlot, ' Use a spell slot') : null,
        left,
      )] : []),
    );
  });
  const attacks = rows.filter((_, i) => res.actions[i].source !== 'spell');
  const spells = rows.filter((_, i) => res.actions[i].source === 'spell');
  const unit = res.unit ?? 'ft';
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner attack-picker', onsubmit: (e) => e.preventDefault() },
      h('h2', {}, target ? `Attack ${target.name}` : `${attacker.name}: attack or cast`),
      h('p', { class: 'muted small' },
        who ? h('span', {}, 'With ', who) : h('span', {}, `With ${attacker.name}`),
        target && res.gap != null ? ` · ${res.gap} ${unit} away` : '',
        target ? '' : ' · then tap who (an area spell: place it)',
      ),
      modeRow,
      attacks.length ? h('h3', {}, 'Attacks') : null,
      ...attacks,
      spells.length ? h('h3', {}, 'Spells') : null,
      ...spells,
      !rows.length ? h('p', { class: 'muted' }, attacker.kind === 'pc' ? 'Nothing on the character sheet rolls yet: equip a weapon in the Inventory, or add attacks and spells with damage.' : 'Its stat block has no attacks the app can read. Fill it in (Stat block) and try again.') : null,
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel')),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

// ---------- picking who, or where ----------

/** Waiting for a tap on the target. A bar over the map says so, with Cancel (no Escape key on a phone). */
function startTargeting(attacker, action, opts) {
  setTool({});
  state.targeting = { attacker: attacker.id, action, opts };
  const bar = $('#map-targeting');
  bar.replaceChildren(
    h('span', {}, `Tap who ${attacker.name} attacks with ${action.name}`),
    h('button', { type: 'button', class: 'ghost', onclick: stopTargeting }, 'Cancel'),
  );
  bar.hidden = false;
  renderTokens();
}

export function stopTargeting() {
  if (!state.targeting) return;
  state.targeting = null;
  $('#map-targeting').hidden = true;
  renderTokens();
}

/** A tap on a token while picking a target (map.js calls it before anything else a tap does). */
export function pickTarget(token) {
  const t = state.targeting;
  stopTargeting();
  if (!t) return;
  send({ attacker: t.attacker, action: t.action.id, target: token.id, ...t.opts });
}

/** An area spell: place its template (its shape and size from the spell), then the server finds who's in it. */
function placeArea(attacker, action, opts) {
  const unit = state.current.scale?.unit ?? 'ft';
  const k = FOOT[unit] ?? 1;
  setTool({});
  Object.assign(state, { measuring: false, ruler: null, pinMode: false, pinging: false, drawing: false });
  state.templateDraft = {
    shape: action.area.shape,
    size: Math.round(action.area.size * k * 100) / 100,
    width: action.area.shape === 'line' ? Math.round((action.area.width ?? 5) * k * 100) / 100 : null,
    label: action.name.slice(0, 80),
    color: '#e8743b',
    attack: { attacker: attacker.id, action: action.id, ...opts },
  };
  renderPinTool();
  renderMeasureTools();
  renderRuler();
  status(action.area.shape === 'circle' ? `Tap where ${action.name} centres.` : `Press where ${action.name} starts and drag to aim it.`);
}

/** The template for an area spell was placed (map-templates.js): cast it there. */
export const castAt = (attack, templateId) => send({ ...attack, template: templateId });

// ---------- attacking, and the cards ----------

async function send(body) {
  const map = state.current;
  let res;
  try {
    res = await state.guarded(() => api('POST', `${base()}/${map.id}/attack`, body));
  } catch (err) {
    return report(err);
  }
  if (!res) return;
  if (res.attack) seen(map.id).add(res.attack.id);
  onMap(res.map);
  // The dice: to hit and damage; for an area, the damage (the saves are on the card).
  const rolls = res.rolls.filter((r) => !/: (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) save$/.test(r.label)).slice(0, 4);
  await showRolls(rolls);
  if (!res.attack) return;
  // The card says it all (the dice stay in the tray's list).
  hideRollResult();
  showCard(res.attack);
}

const seenIds = new Map(); // map id -> attack ids already shown (or there when the map was first seen)
const seen = (id) => {
  if (!seenIds.has(id)) seenIds.set(id, new Set());
  return seenIds.get(id);
};

/** A map arrived (live or loaded): new attacks someone else made pop up as cards; the log button shows when there are any. */
export function seeAttacks(map) {
  const log = map.attacks ?? [];
  const first = !seenIds.has(map.id);
  const ids = seen(map.id);
  if (state.current?.id === map.id) {
    const btn = $('#map-attacks-log');
    if (btn) btn.hidden = !attacksOn() && !log.length;
  }
  for (const e of log) {
    if (ids.has(e.id)) {
      // Something changed on one shown (the DM applied it, or undid it): redraw it if it's up.
      const up = document.querySelector(`.attack-card[data-attack="${e.id}"]`);
      if (up && up.dataset.v !== cardKey(e)) up.replaceWith(card(e));
      continue;
    }
    ids.add(e.id);
    if (!first && state.current?.id === map.id) showCard(e);
  }
}

const cardKey = (e) => `${e.status}:${e.targets.map((t) => t.status).join(',')}`;

/** Show one card over the map (a few at most); it goes after a while unless it's waiting for the DM. */
export function showCard(e) {
  const box = $('#map-attack-cards');
  if (!box) return;
  box.querySelector(`.attack-card[data-attack="${e.id}"]`)?.remove();
  const el = card(e, { close: true });
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  if (!(state.canEdit && e.status === 'pending')) setTimeout(() => !el.matches(':hover, :focus-within') && el.remove(), 15000);
}

/** One target's line: "Goblin: 19 vs AC 15, hit: 14 damage" or "Dex save 16 vs DC 15: saved, 12 fire (half)". */
function targetLine(e, t) {
  const bits = [];
  if (t.attack) {
    const d20 = t.attack.d20.length > 1 ? ` (${t.attack.d20.join(', ')})` : '';
    bits.push(`${t.attack.total}${d20}${t.ac != null ? ` vs AC ${t.ac}` : ''}`);
    bits.push(t.crit ? 'critical hit!' : t.hit === true ? 'hit' : t.hit === false ? (t.attack.natural === 1 ? 'natural 1, miss' : 'miss') : 'the DM decides');
  }
  if (t.save) bits.push(`${ABBR[t.save.ability] ?? ''} save ${t.save.auto_fail ? 'fails (can’t move)' : `${t.save.total} vs DC ${t.save.dc}: ${t.save.success ? 'saved' : 'failed'}`}`);
  const types = [...new Set((t.rolled ?? []).map((p) => p.type).filter(Boolean))].join(', ');
  if (t.amount > 0) bits.push(t.heal ? `heals ${t.amount}` : `${t.amount} ${types} damage`.replace(/\s+/g, ' '));
  else if (t.hit !== false && !t.heal && (t.rolled ?? []).length) bits.push('no damage');
  const hp = t.after && t.after.current != null ? ` (now ${t.after.current}${t.after.max != null ? ` / ${t.after.max}` : ''} HP)` : '';
  const state_ = { pending: ' · waiting for the DM', skipped: ' · not applied', undone: ' · undone', applied: hp }[t.status] ?? '';
  const notes = (t.notes ?? []).filter(Boolean);
  const conc = t.concentration ? (t.concentration.rolled == null ? ` Concentration: Con save DC ${t.concentration.dc}.` : ` Concentration (DC ${t.concentration.dc}): ${t.concentration.rolled}, ${t.concentration.kept ? 'kept' : 'lost'}.`) : '';
  return h('li', { class: `attack-target${t.hit === false || (t.save?.success && !t.amount) ? ' missed' : ''}${t.crit ? ' crit' : ''}` },
    h('strong', {}, t.name), ': ', bits.join(', '), state_,
    notes.length ? h('span', { class: 'muted small' }, ` (${notes.join('; ')})`) : null,
    conc ? h('span', { class: 'small' }, conc) : null,
    state.canEdit && t.status === 'pending' ? h('span', { class: 'attack-dm' },
      h('button', { type: 'button', class: 'primary', onclick: () => settle(e, 'apply', t.id) }, 'Apply'),
      h('button', { type: 'button', class: 'ghost', onclick: () => settle(e, 'half', t.id) }, 'Half'),
      h('button', { type: 'button', class: 'ghost', onclick: () => settle(e, 'skip', t.id) }, 'Skip'),
    ) : null,
  );
}

/** A card: who did what to whom, a line per target; the DM's has Apply / Half / Skip and Undo. */
export function card(e, { close = false } = {}) {
  const what = [e.action.name, e.action.slot ? `${ORD[e.action.slot]} level` : '', e.action.riders?.length ? `+ ${e.action.riders.join(', ')}` : ''].filter(Boolean).join(' · ');
  const el = h('article', { class: `attack-card ${e.status}`, 'data-attack': e.id, 'data-v': cardKey(e) },
    h('header', {},
      h('span', {}, h('strong', {}, e.attacker.name), ` · ${what}`),
      close ? h('button', { type: 'button', class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => el.remove() }, '✕') : null,
    ),
    e.targets.length ? h('ul', {}, e.targets.map((t) => targetLine(e, t))) : h('p', { class: 'muted small' }, 'Nobody was caught in it.'),
    state.canEdit && e.status !== 'undone' ? h('footer', {},
      e.status === 'pending' && e.targets.filter((t) => t.status === 'pending').length > 1 ? h('button', { type: 'button', class: 'primary', onclick: () => settle(e, 'apply') }, 'Apply all') : null,
      h('button', { type: 'button', class: 'ghost', title: 'Put the hit points (and any spell slot) back', onclick: () => settle(e, 'undo') }, 'Undo'),
    ) : null,
    e.status === 'undone' ? h('p', { class: 'muted small' }, 'Undone by the DM.') : null,
  );
  return el;
}

async function settle(e, what, target) {
  try {
    const res = await state.guarded(() => api('POST', `${base()}/${state.current.id}/attacks/${e.id}`, { do: what, ...(target && { target }) }));
    if (!res) return;
    onMap(res.map);
    if (res.attack) for (const el of document.querySelectorAll(`.attack-card[data-attack="${e.id}"]`)) el.replaceWith(card(res.attack, { close: !!el.closest('#map-attack-cards') }));
  } catch (err) {
    report(err);
  }
}

/** The attack log: the last attacks on this map that this viewer may see, newest first. */
export function attackLog() {
  const map = state.current;
  if (!map) return;
  const dialog = $('#map-dialog');
  const log = [...(map.attacks ?? [])].reverse();
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner attack-log' },
      h('h2', {}, 'Attack log'),
      log.length ? h('div', { class: 'attack-log-list' }, log.map((e) => card(e))) : h('p', { class: 'muted' }, 'No attacks on this map yet. Pick an enemy and press Attack.'),
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { class: 'primary' }, 'Close')),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}
