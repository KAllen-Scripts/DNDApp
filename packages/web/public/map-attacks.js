/**
 * Attacks and area spells from the map (owner, 2026-10-21: "select an enemy and make an attack. Or cast an
 * AOE spell… smooth and easy, not clunky"). Pick the enemy, Attack, tap the weapon or spell: three taps, no
 * keyboard. Or from your own token: Attack, the weapon, then tap who. An area spell places its template and
 * the server finds who's in it. The server rolls everything (routes/attacks.js); this page shows the dice it
 * rolled and a card per attack, to everyone who can see it (the map's `attacks`, filtered by the server).
 */
import { api, h } from './api.js';
import { CONDITIONS, ownToken } from './shared/map.js';
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

/** What a condition does to someone, in a word: "restrains", "paralyzes". */
const GIVES = { blinded: 'blinds', charmed: 'charms', deafened: 'deafens', frightened: 'frightens', grappled: 'grapples', incapacitated: 'incapacitates', invisible: 'makes invisible', paralyzed: 'paralyzes', petrified: 'petrifies', poisoned: 'poisons', prone: 'knocks prone', restrained: 'restrains', stunned: 'stuns', unconscious: 'knocks out' };

/** How long a spell lasts, in a few words: "concentration, 1 minute". */
function lastsText(x) {
  if (!x.lasting || x.lasting.rounds === 0) return '';
  const how = (x.duration || '').replace(/^concentration,?\s*(up to\s*)?/i, '').trim();
  return [x.lasting.concentration ? 'concentration' : '', how].filter(Boolean).join(', ');
}

/**
 * What an action does, in a few words: "+6 · 1d8+3 piercing", "DC 15 Dex · 8d6 fire · 20 ft sphere",
 * "DC 13 Str save · restrains · difficult terrain · 20 ft cube · concentration, 1 minute".
 */
function actionText(x) {
  const area = x.area ? `${x.area.size} ft ${x.area.shape === 'circle' ? 'sphere' : x.area.shape}` : '';
  const how = x.kind === 'attack' ? signed(x.bonus ?? 0) : x.kind === 'save' ? `DC ${x.dc} ${ABBR[x.save] ?? ''} save` : x.kind === 'heal' ? 'heals' : x.kind === 'effect' ? (x.self ? 'on yourself' : (x.targets_max ?? 1) > 1 ? `up to ${x.targets_max}` : '') : 'hits';
  const gives = (x.conditions ?? []).map((c) => GIVES[c] ?? c).join(', ');
  return [how, x.damage, gives, x.difficult ? 'difficult terrain' : '', area, lastsText(x)].filter(Boolean).join(' · ');
}

/** A spell (not an attack roll) that can be cast on several, or on nobody: pick them on the map, then Cast. */
const picksSeveral = (x) => x.source === 'spell' && x.kind !== 'attack' && !x.area && !x.self && ((x.targets_max ?? 1) > 1 || x.kind === 'effect');

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
    // A creature's spells use no slots the app keeps (the DM keeps count; its uses a day are shown).
    const useSlot = x.level >= 1 && slots ? h('input', { type: 'checkbox', checked: true }) : null;
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
      if (x.area && !(target && x.kind !== 'save' && x.kind !== 'effect')) return placeArea(attacker, x, opts);
      // On yourself (range Self: Shield, Mage Armor on you, Misty Step).
      if (x.self) return send({ attacker: attacker.id, action: x.id, targets: [attacker.id], ...opts });
      if (picksSeveral(x)) return startTargeting(attacker, x, opts, target ? [target.id] : []);
      if (target) return send({ attacker: attacker.id, action: x.id, target: target.id, ...opts });
      startTargeting(attacker, x, opts);
    };
    const sit = x.situation && x.situation.mode !== 'normal' ? h('span', { class: `small attack-sit ${x.situation.mode}` }, `${MODES[x.situation.mode]}: ${x.situation.reasons.join(', ')}`) : null;
    return h('div', { class: 'attack-row', 'data-action': x.id },
      h('button', { type: 'button', class: 'attack-go', onclick: go },
        h('strong', {}, x.name),
        h('span', { class: 'muted small' }, [actionText(x), x.uses].filter(Boolean).join(' · ')),
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
      !rows.length ? h('p', { class: 'muted' }, attacker.kind === 'pc' ? 'Nothing on the character sheet to use yet: equip a weapon in the Inventory, or add attacks and spells.' : `Its stat block has no attacks the app can read. Fill it in (Stat block) and try again${state.canEdit ? ', or make your own with Something else' : ''}.`) : null,
      h('div', { class: 'map-dialog-actions' },
        // The DM: anything else, made up on the spot (a bugged spell, a lair action, a custom ability).
        state.canEdit ? h('button', { type: 'button', class: 'ghost', 'data-custom': '', title: 'Make up an attack, spell or effect: to hit or a save, damage, conditions, an area', onclick: () => customForm({ attacker, target }) }, 'Something else…') : null,
        h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel')),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

// ---------- the DM's own: anything, from anyone or nobody ----------

const KINDS = { attack: 'An attack roll', save: 'A saving throw', auto: 'Damage, no roll', heal: 'Healing', effect: 'Just an effect (conditions)' };
const SHAPES = { '': 'No area: tap who', circle: 'Sphere (radius)', cone: 'Cone', line: 'Line', cube: 'Cube' };
const GIVEABLE = CONDITIONS.filter((c) => c !== 'exhaustion' && c !== 'concentrating');

/**
 * The DM makes up an attack, spell or effect (owner, 2026-10-29: "place attacks, spells, and whatever else on
 * the map. In case something bugs out or something custom needs doing"): who does it (any token, or nobody: a
 * trap, the room), to hit or a save, damage, conditions, an area and how long it lasts. Then it goes like any
 * other: tap who, or place its area; the server rolls (routes/attacks.js `custom`).
 */
export function customForm({ attacker = null, target = null } = {}) {
  const map = state.current;
  if (!map || !state.canEdit) return;
  const dialog = $('#map-dialog');
  const last = state.lastCustom ?? {};
  const field = (label, input, attrs = {}) => h('label', { class: 'custom-field', ...attrs }, h('span', { class: 'small' }, label), input);
  const doer = h('select', { name: 'by', 'aria-label': 'Who does it' },
    new Option('Nobody (a trap, the room, the DM)', ''),
    ...map.tokens.filter((t) => t.id !== target?.id).map((t) => new Option(t.name, t.id, false, t.id === attacker?.id)));
  const from = h('input', { name: 'from', maxlength: 60, placeholder: 'The DM', value: last.from ?? '' });
  const name = h('input', { name: 'name', required: true, maxlength: 80, placeholder: 'Lightning trap, Lair action, Bugged spell…', value: last.name ?? '' });
  const kind = h('select', { name: 'kind' }, Object.entries(KINDS).map(([k, n]) => new Option(n, k, false, k === (last.kind ?? 'save'))));
  const bonus = h('input', { name: 'bonus', type: 'number', min: -10, max: 30, value: last.bonus ?? 5 });
  const ranged = h('input', { name: 'ranged', type: 'checkbox', checked: !!last.ranged });
  const dc = h('input', { name: 'dc', type: 'number', min: 1, max: 40, value: last.dc ?? 13 });
  const save = h('select', { name: 'save' }, Object.entries(ABBR).map(([k, n]) => new Option(n, k, false, k === (last.save ?? 'dex'))));
  const half = h('input', { name: 'half', type: 'checkbox', checked: last.half ?? true });
  const damage = h('input', { name: 'damage', maxlength: 100, placeholder: '2d6 fire + 1d4 cold', value: last.damage ?? '' });
  const conds = GIVEABLE.map((c) => h('label', { class: 'map-check small' }, h('input', { type: 'checkbox', 'data-condition': c, checked: (last.conditions ?? []).includes(c) }), ` ${c}`));
  const shape = h('select', { name: 'shape' }, Object.entries(SHAPES).map(([k, n]) => new Option(n, k, false, k === (last.area?.shape ?? ''))));
  const size = h('input', { name: 'size', type: 'number', min: 1, max: 1000, value: last.area?.size ?? 20 });
  const lasts = h('input', { name: 'lasts', type: 'checkbox', checked: !!last.lasts });
  const rounds = h('input', { name: 'rounds', type: 'number', min: 0, max: 14400, value: last.rounds ?? 10, title: '0: until you end it' });
  const conc = h('input', { name: 'concentration', type: 'checkbox', checked: !!last.concentration });
  const difficult = h('input', { name: 'difficult', type: 'checkbox', checked: !!last.difficult });
  const parts = {
    from: field('Named', from), bonus: field('To hit', bonus), ranged: h('label', { class: 'map-check small' }, ranged, ' Ranged'),
    dc: field('DC', dc), save: field('Save', save), half: h('label', { class: 'map-check small' }, half, ' Half damage on a save'),
    damage: field('Damage or healing', damage), conditions: h('fieldset', { class: 'custom-conditions' }, h('legend', { class: 'small' }, 'Gives (on a hit, a failed save, or straight away)'), ...conds),
    size: field('Size (ft)', size), difficult: h('label', { class: 'map-check small' }, difficult, ' Difficult terrain'),
    rounds: field('Rounds (0: until ended)', rounds), conc: h('label', { class: 'map-check small' }, conc, ' Concentration'),
  };
  const show = () => {
    const k = kind.value;
    parts.from.hidden = !!doer.value;
    parts.bonus.hidden = parts.ranged.hidden = k !== 'attack';
    parts.dc.hidden = parts.save.hidden = parts.half.hidden = k !== 'save';
    parts.damage.hidden = k === 'effect';
    parts.conditions.hidden = k === 'heal';
    parts.size.hidden = parts.difficult.hidden = !shape.value;
    parts.rounds.hidden = !lasts.checked;
    parts.conc.hidden = !lasts.checked || !doer.value;
    go.textContent = shape.value ? 'Place its area' : target ? `Do it to ${target.name}` : 'Pick who';
  };
  const go = h('button', { type: 'submit', class: 'primary', 'data-custom-go': '' }, 'Pick who');
  for (const el of [doer, kind, shape, lasts]) el.addEventListener('change', show);
  const submit = (e) => {
    e.preventDefault();
    if (!name.value.trim()) return name.focus();
    const custom = {
      name: name.value.trim(), kind: kind.value,
      ...(!doer.value && from.value.trim() && { from: from.value.trim() }),
      ...(kind.value === 'attack' && { bonus: Number(bonus.value) || 0, ranged: ranged.checked }),
      ...(kind.value === 'save' && { dc: Number(dc.value) || 10, save: save.value, half: half.checked }),
      ...(kind.value !== 'effect' && { damage: damage.value.trim() }),
      conditions: kind.value === 'heal' ? [] : conds.map((l) => l.querySelector('input')).filter((b) => b.checked).map((b) => b.dataset.condition),
      ...(lasts.checked && { lasts: true, rounds: Number(rounds.value) || 0, concentration: !!doer.value && conc.checked }),
      ...(shape.value && { difficult: difficult.checked }),
    };
    const area = shape.value ? { shape: shape.value, size: Number(size.value) || 5, ...(shape.value === 'line' && { width: 5 }) } : null;
    state.lastCustom = { ...custom, from: from.value.trim(), area };
    dialog.close();
    const by = map.tokens.find((t) => t.id === doer.value) ?? null;
    const action = { id: 'custom', name: custom.name, source: 'custom', kind: custom.kind, area, targets_max: custom.kind === 'attack' && target ? 1 : 12 };
    const opts = { custom, mode: 'normal' };
    if (area) return placeArea(by, action, opts);
    if (target) return send({ attacker: by?.id, target: target.id, ...opts });
    startTargeting(by ?? { id: null }, action, opts, []);
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner custom-action', onsubmit: submit },
      h('h2', {}, target ? `Something else at ${target.name}` : 'Something else'),
      h('p', { class: 'muted small' }, 'Make up an attack, spell or effect: a trap, a lair action, a spell the app gets wrong. The server rolls it like any other, and Undo works.'),
      h('div', { class: 'custom-grid' }, field('Name', name), field('Done by', doer), parts.from, field('It is', kind), parts.bonus, parts.ranged, parts.dc, parts.save, parts.half, parts.damage),
      parts.conditions,
      h('div', { class: 'custom-grid' }, field('Area', shape), parts.size, parts.difficult, h('label', { class: 'map-check small' }, lasts, ' Stays in play'), parts.rounds, parts.conc),
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'), go),
    ),
  );
  show();
  dialog.onclose = null;
  dialog.showModal();
  name.focus();
}

// ---------- picking who, or where ----------

/**
 * Waiting for a tap on the target. A bar over the map says so, with Cancel (no Escape key on a phone). A
 * spell that takes several (Bless's three) or none (Mage Armor's caster can pick nobody first) collects
 * taps in `picked`, and its bar has Cast and On yourself.
 */
function startTargeting(attacker, action, opts, picked = null) {
  setTool({});
  state.targeting = { attacker: attacker?.id ?? null, action, opts, ...(picked && { picked: [...picked] }) };
  drawTargeting();
  renderTokens();
}

function drawTargeting() {
  const t = state.targeting;
  const bar = $('#map-targeting');
  const attacker = state.current.tokens.find((x) => x.id === t.attacker);
  const name = attacker?.name ?? 'They';
  if (!t.picked) {
    bar.replaceChildren(
      h('span', {}, `Tap who ${name} ${t.action.source === 'spell' ? 'casts' : 'attacks with'} ${t.action.name}${t.action.source === 'spell' ? ' on' : ''}`),
      h('button', { type: 'button', class: 'ghost', onclick: stopTargeting }, 'Cancel'),
    );
  } else {
    const max = t.action.targets_max ?? 1;
    const names = t.picked.map((id) => state.current.tokens.find((x) => x.id === id)?.name).filter(Boolean);
    const cast = () => {
      const { picked, action, opts } = t;
      stopTargeting();
      send({ attacker: t.attacker, action: action.id, ...(picked.length && { targets: picked }), ...opts });
    };
    bar.replaceChildren(...[
      h('span', {}, names.length ? `${t.action.name} on ${names.join(', ')}${max > 1 && max < 12 ? ` (${names.length} of ${max})` : ''}` : `Tap who ${t.attacker ? `${name} casts ` : 'gets '}${t.action.name}${t.attacker ? ' on' : ''}${max > 1 ? (max < 12 ? ` (up to ${max})` : ' (as many as you like)') : ''}`),
      t.attacker && !t.picked.includes(t.attacker) && t.picked.length < max ? h('button', { type: 'button', class: 'ghost', onclick: () => { t.picked.push(t.attacker); drawTargeting(); renderTokens(); } }, 'On yourself') : null,
      h('button', { type: 'button', class: 'primary', 'data-cast': '', disabled: !t.picked.length && t.action.kind !== 'effect', onclick: cast }, t.picked.length ? (t.action.source === 'custom' ? 'Do it' : 'Cast') : 'Cast on nobody'),
      h('button', { type: 'button', class: 'ghost', onclick: stopTargeting }, 'Cancel'),
    ].filter(Boolean));
  }
  bar.hidden = false;
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
  if (t?.picked) {
    // Several: a tap adds them (up to the spell's number) or takes them off again.
    const i = t.picked.indexOf(token.id);
    if (i >= 0) t.picked.splice(i, 1);
    else if (t.picked.length < (t.action.targets_max ?? 1)) t.picked.push(token.id);
    drawTargeting();
    return renderTokens();
  }
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
    attack: { attacker: attacker?.id, action: action.id, ...opts },
  };
  renderPinTool();
  renderMeasureTools();
  renderRuler();
  status(action.area.shape === 'circle' ? `Tap where ${action.name} centres.` : `Press where ${action.name} starts and drag to aim it.`);
}

/** The template for an area spell was placed (map-templates.js): cast it there. */
export const castAt = (attack, templateId) => send({ ...attack, template: templateId });

// ---------- attacking, and the cards ----------

async function send(body, path = 'attack') {
  const map = state.current;
  // The DM's own effect from no token (a trap): no attacker at all.
  if (body.attacker == null) delete body.attacker;
  let res;
  try {
    res = await state.guarded(() => api('POST', `${base()}/${map.id}/${path}`, body));
  } catch (err) {
    return report(err);
  }
  if (!res) return;
  if (res.attack) seen(map.id).add(res.attack.id);
  onMap(res.map);
  if (res.ended) status(`${res.ended} has ended.`);
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
    if (btn) btn.hidden = !attacksOn() && !log.length && !(map.spells ?? []).length;
    const effect = $('#map-dm-effect');
    if (effect) effect.hidden = !attacksOn() || !state.canEdit;
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
  if (t.save) bits.push(`${ABBR[t.save.ability] ?? ''} ${t.save.check ? 'check' : 'save'} ${t.save.auto_fail ? 'fails (can’t move)' : `${t.save.total} vs DC ${t.save.dc}: ${t.save.success ? (t.save.check ? 'breaks free' : 'saved') : 'failed'}`}`);
  // What the spell did besides damage: Entangle's restrained, Invisibility's invisible.
  if (t.conditions?.length) bits.push(t.conditions.join(', '));
  else if (t.effect) bits.push('under the spell');
  const types = [...new Set((t.rolled ?? []).map((p) => p.type).filter(Boolean))].join(', ');
  if (t.amount > 0) bits.push(t.heal ? `heals ${t.amount}` : `${t.amount} ${types} damage`.replace(/\s+/g, ' '));
  else if (t.hit !== false && !t.heal && (t.rolled ?? []).length) bits.push('no damage');
  const hp = t.after && t.after.current != null ? ` (now ${t.after.current}${t.after.max != null ? ` / ${t.after.max}` : ''} HP)` : '';
  const state_ = { pending: ' · waiting for the DM', skipped: ' · not applied', undone: ' · undone', applied: hp }[t.status] ?? '';
  const notes = (t.notes ?? []).filter(Boolean);
  const ended = t.concentration?.ended?.length ? `, ${t.concentration.ended.join(' and ')} ends` : '';
  const conc = t.concentration ? (t.concentration.rolled == null ? ` Concentration: Con save DC ${t.concentration.dc}.` : ` Concentration (DC ${t.concentration.dc}): ${t.concentration.rolled}, ${t.concentration.kept ? 'kept' : 'lost'}${ended}.`) : '';
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
  const what = [e.action.name, e.action.slot ? `${ORD[e.action.slot]} level` : '', e.action.riders?.length ? `+ ${e.action.riders.join(', ')}` : '', e.action.again ? 'again' : ''].filter(Boolean).join(' · ');
  const lasts = e.action.lasting && !e.action.again ? lastsText({ lasting: e.action.lasting, duration: e.action.lasting.duration }) : '';
  const el = h('article', { class: `attack-card ${e.status}`, 'data-attack': e.id, 'data-v': cardKey(e) },
    h('header', {},
      h('span', {}, h('strong', {}, e.attacker.name), ` · ${what}`),
      close ? h('button', { type: 'button', class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => el.remove() }, '✕') : null,
    ),
    e.targets.length ? h('ul', {}, e.targets.map((t) => targetLine(e, t))) : h('p', { class: 'muted small' }, e.action.kind === 'effect' ? 'Cast.' : 'Nobody was caught in it.'),
    lasts || e.ended?.length ? h('p', { class: 'muted small' }, [lasts && `Lasts: ${lasts}.`, e.ended?.length && `${e.ended.join(' and ')} ended (concentration).`].filter(Boolean).join(' ')) : null,
    state.canEdit && e.status !== 'undone' && e.action.kind !== 'break' ? h('footer', {},
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
      (map.spells ?? []).length ? h('section', { class: 'spells-in-play' }, h('h3', {}, 'Spells in play'), ...map.spells.map((sp) => spellInPlay(sp))) : null,
      log.length ? h('div', { class: 'attack-log-list' }, log.map((e) => card(e))) : h('p', { class: 'muted' }, 'No attacks on this map yet. Pick an enemy and press Attack.'),
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { class: 'primary' }, 'Close')),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

// ---------- spells in play (lasting spells: Entangle's area, Hold Person, Bless) ----------

const tokenName = (id) => state.current?.tokens.find((t) => t.id === id)?.name ?? 'someone';
/** Whoever cast it (or the DM) ends it or rolls it again. */
const runsSpell = (sp) => state.canEdit || sp.user_id === state.userId || ownToken(state.current?.tokens.find((t) => t.id === sp.caster), state.userId);

/** Rounds left in the fight: "4 rounds left", or ''. */
function spellTime(sp) {
  const c = state.current?.combat;
  if (!sp.ends || !c) return '';
  const n = Math.max(0, sp.ends.round - c.round);
  return n ? `${n} round${n === 1 ? '' : 's'} left` : 'ends this round';
}

/** Act on a spell in play: end it, roll it again for who's in its area, or roll for one under it to break free. */
export async function spellAction(sp, what, target) {
  const map = state.current;
  if (!map) return;
  if (what === 'end') {
    try {
      const res = await state.guarded(() => api('POST', `${base()}/${map.id}/spells/${sp.id}`, { do: 'end' }));
      if (res) {
        onMap(res.map);
        status(`${sp.name} has ended.`);
      }
    } catch (err) {
      report(err);
    }
    return;
  }
  $('#map-dialog').close?.();
  await send({ do: what, ...(target && { target }) }, `spells/${sp.id}`);
}

/** One spell in play: who cast it, who's under it (with their conditions), time left, and its buttons. */
export function spellInPlay(sp, { compact = false } = {}) {
  const mine = runsSpell(sp);
  const rolls = !!(sp.save || sp.check);
  const who = sp.affected.map((a) => h('li', {},
    h('strong', {}, tokenName(a.id)), a.conditions.length ? `: ${a.conditions.join(', ')}` : '',
    rolls && (state.canEdit || ownToken(state.current.tokens.find((t) => t.id === a.id), state.userId))
      ? h('button', { type: 'button', class: 'ghost small', 'data-spell-break': a.id, title: sp.check ? `Use the action to break free (a ${ABBR[sp.check]} check against the caster's spell save DC)` : 'Make the saving throw again', onclick: () => spellAction(sp, 'break', a.id) }, sp.check ? 'Break free' : 'Save again')
      : null,
  ));
  return h('div', { class: 'spell-in-play', 'data-spell': sp.id },
    h('div', {},
      h('strong', {}, sp.name), h('span', { class: 'muted small' }, ` · ${sp.caster_name}${sp.concentration ? ' (concentrating)' : ''}${spellTime(sp) ? ` · ${spellTime(sp)}` : ''}`),
    ),
    who.length ? h('ul', { class: 'small' }, who) : compact ? null : h('p', { class: 'muted small' }, sp.template ? 'Nobody is held by it right now.' : 'Nobody is under it.'),
    mine ? h('div', { class: 'spell-buttons' },
      sp.template ? h('button', { type: 'button', class: 'ghost small', 'data-spell-again': '', title: 'Roll it for whoever is in the area now (someone walked in, or a new turn): no slot', onclick: () => spellAction(sp, 'again') }, 'Roll for who’s in it') : null,
      h('button', { type: 'button', class: 'ghost small danger', 'data-spell-end': '', title: 'End the spell: its area goes and the conditions it gave come off', onclick: () => spellAction(sp, 'end') }, 'End spell'),
    ) : null,
  );
}

/** Spells a token is under, for its bar: "Under Entangle (restrained)". */
export function spellTags(token) {
  const list = (state.current?.spells ?? []).filter((sp) => sp.affected.some((a) => a.id === token.id));
  if (!list.length) return [];
  const text = list.map((sp) => {
    const c = sp.affected.find((a) => a.id === token.id).conditions;
    return `${sp.name}${c.length ? ` (${c.join(', ')})` : ''}`;
  }).join(', ');
  return [h('span', { class: 'small spell-tags', title: 'Spells in play on it: see the Attack log' }, `Under ${text}`)];
}
