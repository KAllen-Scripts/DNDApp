/**
 * Dice: a tray (the Dice button in the header), 3D dice that tumble across
 * the screen, the result, and a history of this tab's rolls.
 *
 * The server decides every roll (POST /campaigns/:cid/roll). The 3D dice are
 * then thrown with real physics and their faces relabelled so they land on
 * the server's numbers (dice-box-threejs, loaded the first time someone
 * rolls). With reduced motion, 3D switched off, or no WebGL, the result just
 * appears.
 */
import { api, h, storage } from './api.js';
import { parseRoll } from './shared/dice.js';
import { createFx, banner, shake, chime } from './dice-fx.js';

const $ = (sel) => document.querySelector(sel);
const SETTINGS_KEY = 'dndapp.dice';
const DICE = [4, 6, 8, 10, 12, 20, 100];
const MAX_3D_DICE = 30;
const MODE_NAMES = { normal: 'Normal', advantage: 'Advantage', disadvantage: 'Disadvantage' };

/**
 * Dice styles: colours and textures for dice-box-threejs (its texture names;
 * the images are under /vendor/dice/textures and load only when a style needs
 * them), a material (glass, metal, wood, plastic or none), and the trail the
 * dice leave while rolling (dice-fx.js TRAILS). trailColors replaces the
 * trail's own colours. "match" takes the page theme's accent colours.
 */
const STYLES = {
  match: { name: 'Match the page', trail: 'motes' },
  dragonfire: { name: 'Dragonfire', foreground: '#f8d84f', background: ['#f8d84f', '#f9b02d', '#f43c04', '#910200', '#4c1009'], texture: 'fire', material: 'plastic', trail: 'embers' },
  frost: { name: 'Frost', foreground: '#60E9FF', background: ['#214fa3', '#3c6ac1', '#253f70', '#0b56e2', '#09317a'], texture: 'ice', material: 'plastic', trail: 'snow' },
  storm: { name: 'Stormcaller', foreground: '#FFC500', background: ['#f17105', '#f3ca40', '#eddea4', '#df9a57', '#dea54b'], texture: 'ice', material: 'plastic', trail: 'sparks' },
  thunder: { name: 'Thunderhead', foreground: '#FFC500', background: ['#7D7D7D', '#5f6670', '#8a8f99'], texture: 'cloudy', material: 'plastic', trail: 'sparks', trailColors: ['#fff6a8', '#ffd500', '#ffffff'] },
  poison: { name: 'Poison', foreground: '#D6A8FF', background: ['#313866', '#504099', '#66409e', '#934fc3', '#c949fc'], texture: 'cloudy', material: 'plastic', trail: 'bubbles', trailColors: ['#d6a8ff', '#c949fc', '#f0dcff'] },
  acid: { name: 'Acid', foreground: '#A9FF70', background: ['#a6ff00', '#83b625', '#5ace04', '#69f006', '#b0f006'], texture: 'marble', material: 'plastic', trail: 'bubbles' },
  necrotic: { name: 'Necrotic', foreground: '#ffffff', background: ['#6F0000', '#3a0000', '#4b0a0a'], texture: 'skulls', material: 'plastic', trail: 'smoke' },
  radiant: { name: 'Radiant', foreground: '#F9B333', background: ['#FFFFFF', '#fff6df'], texture: 'paper', material: 'wood', trail: 'motes' },
  force: { name: 'Force', foreground: '#ffffff', background: ['#FF97FF', '#FF68FF', '#C651C6'], texture: 'stars', material: 'plastic', trail: 'stars', trailColors: ['#ffffff', '#ffb8ff', '#ff68ff'] },
  psychic: { name: 'Psychic', foreground: '#D6A8FF', background: ['#313866', '#504099', '#66409E', '#934FC3', '#C949FC'], texture: 'speckles', material: 'plastic', trail: 'glitter', trailColors: ['#d6a8ff', '#c949fc', '#8a7dff', '#ffffff'] },
  bloodmoon: { name: 'Blood Moon', foreground: '#CDB800', background: ['#6F0000', '#8a0a0a', '#520000'], texture: 'marble', material: 'plastic', trail: 'embers', trailColors: ['#ff3b3b', '#a31212', '#ffd36b'] },
  starrynight: { name: 'Starry Night', foreground: '#c9d8ef', background: ['#091636', '#233660', '#4F708F'], texture: 'speckles', material: 'plastic', trail: 'stars' },
  astral: { name: 'Astral Sea', foreground: '#565656', background: ['#ffffff', '#eef1ff'], texture: 'astral', material: 'plastic', trail: 'stars' },
  bronze: { name: 'Thylean Bronze', foreground: ['#FF9159', '#FFB066', '#FFBF59', '#FFD059'], background: ['#705206', '#7A4E06', '#643100', '#7A2D06'], texture: ['bronze01', 'bronze02', 'bronze03', 'bronze03a', 'bronze03b', 'bronze04'], material: 'plastic', trail: 'sparks', trailColors: ['#ffb066', '#ff9159', '#ffd059'] },
  dragons: { name: 'Here Be Dragons', foreground: '#FFFFFF', background: ['#B80000', '#4D5A5A', '#5BB8FF', '#7E934E', '#862C1A', '#A78437'], texture: ['dragon', 'lizard'], material: 'plastic', trail: 'embers' },
  gold: { name: 'Dragon’s Hoard', foreground: '#2b1d00', background: ['#b8860b', '#d4af37', '#c9a227'], texture: 'metal', material: 'plastic', trail: 'glitter', trailColors: ['#fff3a8', '#ffd84a', '#ffffff'] },
  steel: { name: 'Cold Steel', foreground: '#101418', background: ['#7d858d', '#a7afb7', '#5f666d'], texture: 'metal', material: 'plastic', trail: 'sparks', trailColors: ['#ffffff', '#cfe3ff', '#ffd36b'] },
  obsidian: { name: 'Obsidian', foreground: '#d4af37', background: ['#0b0b10', '#16161f', '#20202b'], texture: 'none', material: 'plastic', trail: 'motes' },
  bone: { name: 'Bone', foreground: '#3b2f22', background: ['#e9e1cc', '#d8ccb0', '#efe6d2'], texture: 'paper', material: 'wood', trail: null },
  oak: { name: 'Old Oak', foreground: '#f3e6c8', background: ['#8b5a2b', '#6e4423', '#a0703f'], texture: 'wood', material: 'wood', trail: null },
  glitter: { name: 'Glitter Party', foreground: '#ffffff', background: ['#FFB5F5', '#7FC9FF', '#A17FFF'], texture: 'none', material: 'plastic', trail: 'glitter' },
  pastel: { name: 'Pastel Sunset', foreground: ['#5E175E', '#564A5E', '#45455E', '#3D5A5E', '#1E595E'], background: ['#FE89CF', '#DFD4F2', '#C2C2E8', '#CCE7FA', '#A1D9FC'], texture: 'marble', material: 'plastic', trail: 'petals' },
  rainbow: { name: 'Rainbow', foreground: ['#FF5959', '#FFA74F', '#FFFF56', '#59FF59', '#2374FF', '#00FFFF', '#FF59FF'], background: ['#900000', '#CE3900', '#BCBC00', '#00B500', '#00008E', '#008282', '#A500A5'], texture: 'none', material: 'plastic', trail: 'glitter' },
};

export const D20_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="M12 2 7.5 9.5h9zM3 7l4.5 2.5L3 17M21 7l-4.5 2.5L21 17M7.5 9.5 12 17l4.5-7.5M12 17v5M3 17l9 0 9 0"/></svg>';

const state = {
  campaignId: null,
  guarded: (fn) => fn(),
  nextMode: 'normal', // for the next d20 roll, then back to normal
  history: [],
  seq: 0, // the newest roll; an older one still animating doesn't show its result
  no3d: false, // WebGL or the dice failed to load on this device
  fadeTimer: null,
  hideTimer: null,
  settings: { threeD: true, sound: true, effects: true, style: 'match' },
  fx: null,
};

try {
  Object.assign(state.settings, JSON.parse(storage.get(SETTINGS_KEY)) ?? {});
} catch { /* nothing saved */ }
const saveSettings = () => storage.set(SETTINGS_KEY, JSON.stringify(state.settings));

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const animated = () => state.settings.threeD && !state.no3d && !reducedMotion?.matches;
const effects = () => state.settings.effects && !reducedMotion?.matches;
const style = () => STYLES[state.settings.style] ?? STYLES.match;

/** Rolls belong to a campaign (called when entering one). */
export function setDiceCampaign({ campaignId, guarded }) {
  Object.assign(state, { campaignId, guarded, history: [] });
  drawHistory();
}

/** Shift-click rolls with advantage, Alt-click with disadvantage. */
export const rollModeFromEvent = (e) => (e?.shiftKey ? 'advantage' : e?.altKey ? 'disadvantage' : null);

/**
 * Roll some dice and show them. label names the roll ("Stealth"); mode is
 * advantage/disadvantage (default: whatever the tray says for the next d20);
 * then is a follow-up offered with the result ({ label, notation }: damage
 * after an attack).
 */
export async function roll(notation, { label = '', mode = null, then = null } = {}) {
  if (!state.campaignId) return;
  const id = ++state.seq;
  let result;
  try {
    result = await state.guarded(() => api('POST', `/campaigns/${state.campaignId}/roll`, { notation, mode: mode ?? state.nextMode }));
  } catch (err) {
    return showError(err.message);
  }
  if (!result) return; // logged out
  if (result.natural != null && state.nextMode !== 'normal') setNextMode('normal');
  const entry = { label: label || result.notation, result, then, at: new Date() };
  state.history.unshift(entry);
  state.history.length = Math.min(state.history.length, 25);
  drawHistory();
  const threeD = animated() && diceCount(result) <= MAX_3D_DICE;
  if (threeD) await animate(result, id);
  if (id !== state.seq) return;
  showResult(entry);
  if (!threeD || state.no3d) celebrate(result);
}

// ---------- 3D ----------

let boxPromise = null;

/** The dice-box colorset for the chosen style (or the page's accent colours). */
function colorset() {
  const key = state.settings.style in STYLES ? state.settings.style : 'match';
  if (key !== 'match') {
    const { foreground, background, texture, material } = STYLES[key];
    return { name: `dndapp-${key}`, foreground, background, outline: 'none', texture, material };
  }
  const css = getComputedStyle(document.documentElement);
  const background = css.getPropertyValue('--accent').trim() || '#8b2e2e';
  const foreground = css.getPropertyValue('--accent-text').trim() || '#ffffff';
  return { name: `dndapp-${background}-${foreground}`, foreground, background, outline: background, texture: 'none', material: 'plastic' };
}

function getBox() {
  boxPromise ??= (async () => {
    const { default: DiceBox } = await import('/vendor/dice/dice-box.js');
    const box = new DiceBox('#dice-stage', {
      assetPath: '/vendor/dice/',
      sounds: state.settings.sound,
      volume: 50,
      theme_customColorset: colorset(),
      theme_material: 'plastic',
      light_intensity: 0.9,
      strength: 1.3,
    });
    await box.initialize();
    return box;
  })();
  boxPromise.catch(() => {
    state.no3d = true;
    boxPromise = null;
    drawSettings();
  });
  return boxPromise;
}

const diceCount = (result) => result.terms.reduce((n, t) => n + (t.dice?.length ?? 0) * (t.sides === 100 ? 2 : 1), 0);

/**
 * The 3D library's notation for dice that must land on our numbers, e.g.
 * "1d20+2d6@14,3,5". Dice are grouped by type (the library merges same-type
 * dice, which would otherwise shuffle the order). A d100 is a tens die and a
 * units die: 47 is "40" and "7", 100 is "00" and "0".
 */
function forcedNotation(result) {
  const groups = new Map();
  const add = (type, value) => {
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(value);
  };
  for (const t of result.terms) {
    for (const d of t.dice ?? []) {
      if (t.sides === 100) {
        const tens = Math.floor(d.value / 10) % 10;
        const units = d.value % 10;
        add('d100', tens === 0 ? 100 : tens * 10);
        add('d10', units === 0 ? 10 : units);
      } else {
        add(`d${t.sides}`, d.value);
      }
    }
  }
  const types = [...groups.keys()];
  return `${types.map((t) => `${groups.get(t).length}${t}`).join('+')}@${types.flatMap((t) => groups.get(t)).join(',')}`;
}

async function animate(result, id) {
  const stage = $('#dice-stage');
  clearTimeout(state.fadeTimer);
  stage.classList.remove('fading');
  let box;
  try {
    box = await getBox();
    const theme = colorset();
    if (box.theme_customColorset?.name !== theme.name) await box.updateConfig({ theme_customColorset: theme });
    if (box.sounds !== state.settings.sound) {
      box.sounds = state.settings.sound;
      if (box.sounds) await box.loadSounds().catch(() => (box.sounds = false));
    }
  } catch {
    return; // no 3D on this device: the result just appears
  }
  if (id !== state.seq) return;
  stage.classList.add('rolling');
  const stopTrails = trails(box, id);
  // A newer roll clears these dice and never finishes this one, hence the time limit.
  await Promise.race([box.roll(forcedNotation(result)), new Promise((r) => setTimeout(r, 8000))]);
  stopTrails();
  if (id !== state.seq) return;
  celebrate(result, box);
  state.fadeTimer = setTimeout(() => {
    stage.classList.add('fading');
    state.fadeTimer = setTimeout(() => {
      if (id !== state.seq) return;
      box.clearDice();
      stage.classList.remove('rolling', 'fading');
    }, 600);
  }, 2600);
}

// ---------- special effects ----------

/** Where a die is on screen. */
function onScreen(box, mesh) {
  const p = mesh.position.clone().project(box.camera);
  const rect = box.container.getBoundingClientRect();
  return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
}

/** While the dice roll, each moving die leaves its style's trail. Returns a function to stop. */
function trails(box, id) {
  const { trail, trailColors } = style();
  if (!effects() || !trail) return () => {};
  const fx = state.fx;
  const last = new Map();
  let on = true;
  const frame = () => {
    if (!on || id !== state.seq) return;
    for (const mesh of box.diceList) {
      const now = onScreen(box, mesh);
      const before = last.get(mesh) ?? now;
      last.set(mesh, now);
      const speed = Math.hypot(now.x - before.x, now.y - before.y);
      if (speed > 1.2) fx.trail(now.x, now.y, trail, speed > 8 ? 2 : 1, now.x - before.x, now.y - before.y, trailColors);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => (on = false);
}

/**
 * The big moments: a natural 20 or 1 (at the d20 that shows it), or damage
 * where every die shows its highest face. Without 3D, at the result card.
 */
function celebrate(result, box = null) {
  const kind = result.natural === 20 ? 'crit' : result.natural === 1 ? 'fumble' : maxed(result) ? 'max' : null;
  if (!kind || !effects()) return;
  let at = null;
  if (box?.diceList?.length) {
    const mesh = kind === 'max' ? box.diceList[0] : box.diceList.find((m) => m.shape === 'd20' && Number(m.getLastValue?.().value) === result.natural);
    if (mesh) at = onScreen(box, mesh);
  }
  if (!at) {
    const card = $('#dice-result').getBoundingClientRect();
    at = card.width ? { x: card.left + card.width / 2, y: card.top } : { x: innerWidth / 2, y: innerHeight * 0.6 };
  }
  state.fx[kind](at.x, at.y);
  banner($('#dice-fx-layer'), { crit: 'Natural 20!', fumble: 'Natural 1', max: 'Max damage!' }[kind], kind);
  if (kind === 'fumble') shake();
  if (state.settings.sound) chime(kind);
}

/** No d20, at least two dice, and every one on its highest face. */
function maxed(result) {
  const dice = result.terms.flatMap((t) => (t.dice ? t.dice.map((d) => ({ ...d, sides: t.sides })) : []));
  return result.natural == null && !result.terms.some((t) => t.sides === 20) && dice.length >= 2 && dice.every((d) => d.value === d.sides);
}

// ---------- results ----------

/** "d20 (14, 3) + 2": every die, dropped ones struck through. */
function breakdown(result) {
  return result.terms.map((t, i) => {
    const sign = t.sign < 0 ? ' − ' : i ? ' + ' : '';
    if (t.value !== undefined) return [sign, String(t.value)];
    const dice = t.dice.map((d, j) => [j ? ', ' : '', d.kept ? String(d.value) : h('s', { title: 'Not kept' }, String(d.value))]);
    return [sign, `${t.dice.filter((d) => d.kept).length}d${t.sides} (`, dice, ')'];
  });
}

/** Double the dice for a critical hit: "1d8+2" → "2d8+2". */
function critical(notation) {
  try {
    const { terms } = parseRoll(notation);
    return terms.map((t, i) => (t.sign < 0 ? '-' : i ? '+' : '') + (t.value !== undefined ? t.value : `${t.count * 2}d${t.sides}`)).join('');
  } catch {
    return null;
  }
}

function showResult({ label, result, then }) {
  const card = $('#dice-result');
  const nat = result.natural === 20 ? 'crit' : result.natural === 1 ? 'fumble' : '';
  const follow = [];
  if (then) {
    follow.push(h('button', { type: 'button', class: 'ghost', onclick: () => roll(then.notation, { label: then.label }) }, `Damage (${then.notation})`));
    const crit = result.natural === 20 && critical(then.notation);
    if (crit) follow.push(h('button', { type: 'button', class: 'primary', onclick: () => roll(crit, { label: `${then.label} (critical)` }) }, `Critical damage (${crit})`));
  }
  card.className = `dice-result ${nat}`;
  card.replaceChildren(
    h('div', { class: 'dr-head' },
      h('span', { class: 'dr-label' }, label),
      result.mode !== 'normal' && h('span', { class: 'dr-mode' }, MODE_NAMES[result.mode]),
      h('button', { type: 'button', class: 'icon-btn dr-close', title: 'Close', 'aria-label': 'Close', onclick: hideResult }, '×'),
    ),
    h('div', { class: 'dr-body' },
      h('span', { class: 'dr-total' }, String(result.total)),
      h('span', { class: 'dr-detail' },
        nat && h('strong', { class: 'dr-nat' }, nat === 'crit' ? 'Natural 20!' : 'Natural 1'),
        h('span', {}, breakdown(result)),
      ),
    ),
    ...(follow.length ? [h('div', { class: 'dr-actions' }, follow)] : []),
  );
  card.hidden = false;
  clearTimeout(state.hideTimer);
  state.hideTimer = setTimeout(() => !card.matches(':hover, :focus-within') && hideResult(), 12000);
}

function hideResult() {
  clearTimeout(state.hideTimer);
  $('#dice-result').hidden = true;
}

function showError(message) {
  const el = $('#dice-error');
  el.textContent = message;
  el.hidden = false;
  if ($('#dice-panel').hidden) {
    const card = $('#dice-result');
    card.className = 'dice-result error';
    card.replaceChildren(h('div', { class: 'dr-head' }, h('span', { class: 'dr-label' }, `Couldn't roll: ${message}`), h('button', { type: 'button', class: 'icon-btn dr-close', 'aria-label': 'Close', onclick: hideResult }, '×')));
    card.hidden = false;
  }
}

// ---------- the tray ----------

function setNextMode(mode) {
  state.nextMode = mode;
  for (const b of document.querySelectorAll('#dice-panel [data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  $('#dice-open').classList.toggle('has-mode', mode !== 'normal');
  $('#dice-open').title = mode === 'normal' ? 'Roll dice' : `Roll dice (next d20 with ${mode})`;
}

/** Clicking a die adds one to what's typed: "1d20" then d6 → "1d20+1d6", d6 again → "1d20+2d6". */
function addDie(sides) {
  const input = $('#dice-notation');
  let terms = [];
  try {
    if (input.value.trim()) terms = parseRoll(input.value).terms;
  } catch {
    input.value = `${input.value.trim()}+1d${sides}`;
    return;
  }
  const same = terms.find((t) => t.sides === sides && t.sign > 0);
  const firstNumber = terms.findIndex((t) => t.value !== undefined);
  if (same) same.count++;
  else terms.splice(firstNumber < 0 ? terms.length : firstNumber, 0, { sign: 1, count: 1, sides }); // dice before "+3"
  input.value = terms.map((t, i) => (t.sign < 0 ? '-' : i ? '+' : '') + (t.value !== undefined ? t.value : `${t.count}d${t.sides}`)).join('');
}

function drawSettings() {
  const threeD = $('#dice-3d');
  if (!threeD) return;
  threeD.checked = state.settings.threeD && !state.no3d;
  threeD.disabled = state.no3d || !!reducedMotion?.matches;
  $('#dice-3d-note').textContent = state.no3d ? "3D dice aren't available on this device." : reducedMotion?.matches ? 'Off because your device asks for less motion.' : '';
  $('#dice-sound').checked = state.settings.sound;
  $('#dice-effects').checked = state.settings.effects;
  $('#dice-effects').disabled = !!reducedMotion?.matches;
  for (const b of document.querySelectorAll('.dice-style')) b.setAttribute('aria-checked', String(b.dataset.style === (state.settings.style in STYLES ? state.settings.style : 'match')));
}

/** A swatch per style: its colours, with a number in its ink. */
function stylePicker() {
  const first = (c) => (Array.isArray(c) ? c[0] : c);
  return h('div', { class: 'dice-styles', role: 'radiogroup', 'aria-label': 'Dice style' },
    Object.entries(STYLES).map(([key, st]) => {
      const swatch = key === 'match'
        ? 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #000))'
        : `linear-gradient(135deg, ${[].concat(st.background).slice(0, 4).join(', ')}${[].concat(st.background).length === 1 ? `, ${first(st.background)}` : ''})`;
      return h('button', { type: 'button', class: 'dice-style', role: 'radio', 'data-style': key, title: st.name, onclick: () => {
        state.settings.style = key;
        saveSettings();
        drawSettings();
        preview();
      } },
        h('span', { class: 'ds-swatch', style: `background: ${swatch}; color: ${key === 'match' ? 'var(--accent-text)' : first(st.foreground)}` }, '20'),
        h('span', { class: 'ds-name' }, st.name),
      );
    }),
  );
}

/** Show off the chosen style: a d20 and a d6 that don't count (rolled here, not by the server, and not kept). */
function preview() {
  if (!animated()) return;
  const id = ++state.seq;
  const d20 = 1 + Math.floor(Math.random() * 20);
  animate({ terms: [{ sign: 1, sides: 20, dice: [{ value: d20, kept: true }] }, { sign: 1, sides: 6, dice: [{ value: 1 + Math.floor(Math.random() * 6), kept: true }] }], natural: d20 }, id);
}

function drawHistory() {
  const list = $('#dice-history');
  if (!list) return;
  list.replaceChildren(
    ...(state.history.length
      ? state.history.map(({ label, result, at }) =>
        h('li', {},
          h('span', { class: 'dh-total' }, String(result.total)),
          h('span', { class: 'dh-what' }, h('strong', {}, label), h('span', { class: 'muted small' }, breakdown(result))),
          h('time', { class: 'muted small', datetime: at.toISOString() }, at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
        ))
      : [h('li', { class: 'muted small dh-none' }, 'No rolls yet.')]),
  );
}

/** Build the tray and the 3D stage (once, at start-up). */
export function initDice() {
  const open = $('#dice-open');
  open.innerHTML = `${D20_ICON}<span>Dice</span>`;
  const input = h('input', { id: 'dice-notation', type: 'text', placeholder: 'e.g. 2d6+3', autocomplete: 'off', 'aria-label': 'Dice to roll' });
  const form = h('form', { class: 'dice-form', onsubmit: (e) => {
    e.preventDefault();
    $('#dice-error').hidden = true;
    if (input.value.trim()) roll(input.value.trim());
  } },
    h('div', { class: 'dice-buttons' }, DICE.map((s) => h('button', { type: 'button', class: 'die', title: `Add a d${s}`, onclick: () => addDie(s) }, `d${s}`))),
    h('div', { class: 'dice-input' }, input,
      h('button', { type: 'button', class: 'ghost', onclick: () => { input.value = ''; input.focus(); } }, 'Clear'),
      h('button', { type: 'submit', class: 'primary' }, 'Roll')),
    h('p', { id: 'dice-error', class: 'error small', hidden: true, role: 'alert' }),
  );
  const modes = h('div', { class: 'dice-modes', role: 'group', 'aria-label': 'Next d20 roll' },
    Object.entries(MODE_NAMES).map(([mode, name]) => h('button', { type: 'button', 'data-mode': mode, 'aria-pressed': String(mode === 'normal'), onclick: () => setNextMode(mode) }, name)));
  const panel = h('section', { id: 'dice-panel', class: 'dice-panel', hidden: true, 'aria-label': 'Dice' },
    h('header', { class: 'dice-panel-head' }, h('h2', {}, 'Dice'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => toggle(false) }, '×')),
    form,
    h('div', { class: 'dice-mode-row' }, h('span', { class: 'muted small' }, 'Next d20:'), modes),
    h('p', { class: 'muted small dice-hint' }, 'On your sheet, click a save, skill, ability or the dice by an attack to roll it. Shift-click for advantage, Alt-click for disadvantage.'),
    h('h3', { class: 'dice-history-title' }, 'Dice style'),
    stylePicker(),
    h('div', { class: 'dice-settings' },
      h('label', { class: 'check' }, h('input', { id: 'dice-3d', type: 'checkbox', onchange: (e) => { state.settings.threeD = e.target.checked; saveSettings(); } }), '3D dice'),
      h('label', { class: 'check' }, h('input', { id: 'dice-effects', type: 'checkbox', onchange: (e) => { state.settings.effects = e.target.checked; saveSettings(); } }), 'Effects'),
      h('label', { class: 'check' }, h('input', { id: 'dice-sound', type: 'checkbox', onchange: (e) => { state.settings.sound = e.target.checked; saveSettings(); } }), 'Sound'),
      h('button', { type: 'button', class: 'link', onclick: () => preview() }, 'Try it'),
      h('span', { id: 'dice-3d-note', class: 'muted small' }),
    ),
    h('h3', { class: 'dice-history-title' }, 'This session'),
    h('ol', { id: 'dice-history', class: 'dice-history' }),
  );
  const toggle = (show = panel.hidden) => {
    panel.hidden = !show;
    open.setAttribute('aria-expanded', String(show));
    if (show) input.focus();
  };
  open.setAttribute('aria-expanded', 'false');
  open.setAttribute('aria-controls', 'dice-panel');
  open.addEventListener('click', () => toggle());
  panel.addEventListener('keydown', (e) => e.key === 'Escape' && (toggle(false), open.focus()));
  const fxCanvas = h('canvas', { id: 'dice-fx', class: 'dice-fx', 'aria-hidden': 'true' });
  $('#app-view').append(
    panel,
    h('div', { id: 'dice-stage', class: 'dice-stage', 'aria-hidden': 'true' }),
    fxCanvas,
    h('div', { id: 'dice-fx-layer', class: 'dice-fx-layer', 'aria-hidden': 'true' }),
    h('div', { id: 'dice-result', class: 'dice-result', role: 'status', 'aria-live': 'polite', hidden: true }),
  );
  state.fx = createFx(fxCanvas);
  reducedMotion?.addEventListener?.('change', drawSettings);
  drawSettings();
  drawHistory();
}
