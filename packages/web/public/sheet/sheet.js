/**
 * The Sheet tab: the player's character sheet. The parts of the sheet are
 * built as blocks, and the layout chosen under Look arranges them (like the
 * official 5e sheet by default; see LAYOUTS).
 *
 * Automatic values come from the shared rules (./shared/sheet.js, the same
 * code the server uses). Anything the player types into an automatic box is
 * kept as their own value (marked, with ↺ to go back to automatic) and is
 * never changed by the rules. Every change is saved to the server shortly
 * after typing stops.
 */
import { api, fileUrl, storage } from '../page/api.js';
import {
  ABILITIES, ABILITY_NAMES, SKILLS, CLASSES, RACES, ALIGNMENTS, SCHOOLS,
  WEAPONS, classKey, computeSheet, coerceDerived, formatBonus, newAttack, normalizeSheet, hitDice as hitDiceOf, rollDisadvantage,
  rollAdvantage, checkNotation,
} from '/shared/sheet.js';
import { d20Plus } from '/shared/dice.js';
import { attackRolls, gearRolls } from '/shared/rolls.js';
import { attackWeapon, itemStats, newUnownedWeaponAttacks, ownsWeapon } from '/shared/gear.js';
import { markdownEditor } from '../page/markdown.js';
import { POINT_BUY, POINT_COST, changePointBuy, pointBuy, stepPointBuy } from '/shared/point-buy.js';
import { roll, rollModeFromEvent, modeButtons, D20_ICON } from '../dice/dice.js';
import { wildShapeBox, wildShapeBanner } from './wild-shape.js';
import { classFeaturesBox } from './class-features.js';
import { companionsBox } from './companions.js';
import { itemActionsBox } from './item-actions.js';
import { knownItem } from '/shared/item-actions.js';
import { subclassNames } from '/shared/subclass-features.js';
import { featureRows } from '/shared/class-features.js';
import { MORE_RACES } from '/shared/race-features.js';
import { loadCharacters, refreshCharacters, nameTyped } from './characters.js';
import { traitsList } from './traits.js';
import { offhandWeapon } from '/shared/attack-extras.js';
import { withD20Rule } from '/shared/feats.js';
import { attackPlan, combatBar, extrasLine, rollAttackPlan, rollDamagePlan } from './attacks.js';
import { backgroundBox, backgroundNames, forgetApplied } from './background.js';
import { helpPanel } from './creation-help.js';
import { itemNames } from '/shared/item-names.js';
import { GEAR_KINDS } from '../items/item-card.js';
import { levelUpBanner } from './level-up.js';
import { $, cap, h, readBase64, setChildren } from '../page/dom.js';
import { addGear, closePreview, gearStatus, inventoryTab, kindFields, previewGear, reopen } from './inventory.js';
import { spells } from './spells.js';

export const state = {
  campaignId: null,
  userId: null,
  pictures: { token: null, picture: null }, // this player's token and full picture: { key, width, height } each
  pictureUrls: new Map(), // picture key -> URL to show it
  itemPictures: new Map(), // the DM's items in the inventory (bought from a merchant): item id -> picture key, or null
  itemPicturesLoading: null, // while asking for them
  unusedDescription: '', // the AI's description of the picture, when it didn't replace the player's own text
  guarded: (fn) => fn(),
  sheet: null,
  version: 0,
  number: 1, // which of the player's characters this is (the active one; sheet/characters.js switches)
  savedSheet: null, // the sheet as the server has it (attacks it already had with weapons not carried may stay)
  calc: null,
  settings: { weight: 'capacity' }, // the campaign's (campaign/settings.js)
  edition: '2014', // the rules edition the campaign plays by, from the server (when the DM hasn't chosen one in settings)
  layout: null, // the layout the sheet was last drawn in
  renders: [], // functions that refresh automatic values
  gearDraws: [], // functions that redraw what shows the inventory (the Inventory tab, equipped weapons in Attacks)
  attackDraws: [], // the Attacks boxes (equipped weapons show there)
  dirty: false,
  saving: false,
  timer: null,
};

export const base = () => `/campaigns/${state.campaignId}`;
const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const setPath = (obj, path, v) => {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = v;
};

// ---------- loading and saving ----------

/** Show the sheet for this campaign (called when entering a campaign). */
export async function loadSheet({ campaignId, userId, guarded }) {
  await flush();
  for (const url of state.pictureUrls.values()) URL.revokeObjectURL(url);
  state.pictureUrls.clear();
  state.itemPictures.clear();
  Object.assign(state, { campaignId, userId, guarded, dirty: false, unusedDescription: '', itemPicturesLoading: null });
  forgetApplied();
  const review = $('#sheet-review-result');
  if (review) review.hidden = true;
  const [{ sheet, version, edition, number }, pictures] = await Promise.all([api('GET', `${base()}/sheet`), api('GET', `${base()}/character/pictures`)]);
  state.pictures = pictures;
  state.edition = edition ?? '2014';
  useSheet(sheet, version, number);
  await loadCharacters({ campaignId, guarded, onSheet: showCharacter, beforeSwitch: flush });
}

/** Another of the player's characters is now the active one: show its sheet and pictures. */
async function showCharacter(res) {
  if (res.edition) state.edition = res.edition;
  clearTimeout(state.timer);
  state.dirty = false;
  const review = $('#sheet-review-result');
  if (review) review.hidden = true;
  state.pictures = (await state.guarded(() => api('GET', `${base()}/character/pictures`)).catch(() => null)) ?? { token: null, picture: null };
  useSheet(res.sheet, res.version, res.number);
  announce();
}

// The same sheet can be open in two windows (the map page and a popped-out sheet): each tells the others
// when it saves, and one with nothing waiting to save shows the newer version straight away.
const channel = (() => {
  try { return window.BroadcastChannel ? new window.BroadcastChannel('dndapp.sheet') : null; } catch { return null; }
})();
export const announce = () => channel?.postMessage({ campaignId: String(state.campaignId), userId: String(state.userId), version: state.version, number: state.number });
channel?.addEventListener('message', async (e) => {
  const { campaignId, userId, version, number } = e.data ?? {};
  // Newer: a later save, or another character made active there.
  const newer = () => campaignId === String(state.campaignId) && userId === String(state.userId) && (version > state.version || (number != null && number !== state.number));
  // With changes waiting here, saving them meets the newer version and asks which to keep.
  if (!newer() || state.dirty || state.saving) return;
  const res = await state.guarded(() => api('GET', `${base()}/sheet`)).catch(() => null);
  if (!res || !newer() || state.dirty || state.saving) return;
  const switched = res.number !== state.number;
  useSheet(res.sheet, res.version, res.number);
  if (switched) refreshCharacters();
});

/** The campaign's settings changed (or a campaign was entered): work the sheet out again. */
export function setSheetSettings(settings) {
  state.settings = settings;
  if (state.sheet && $('#sheet').childElementCount) render();
}

export function useSheet(sheet, version, number = state.number) {
  // Another character (or campaign): the Background box's Undo was for the last one.
  if ((number ?? 1) !== state.number || !state.sheet) forgetApplied();
  state.sheet = normalizeSheet(sheet);
  state.savedSheet = structuredClone(state.sheet);
  state.version = version;
  state.number = number ?? 1;
  render();
  status(version ? 'Saved' : 'Not saved yet: fill something in to start');
}

export function status(text, error = false) {
  const el = $('#sheet-status');
  el.textContent = text;
  el.classList.toggle('error', error);
}

/** Something changed: update automatic values now, save soon. */
export function changed() {
  refresh();
  nameTyped(state.number, state.sheet.name);
  state.dirty = true;
  status('Saving soon…');
  clearTimeout(state.timer);
  state.timer = setTimeout(save, 800);
}

async function save() {
  clearTimeout(state.timer);
  if (state.saving || !state.dirty) return;
  // The server refuses a new attack with a weapon not in the inventory: say so and wait for the player to fix it.
  const missing = [...new Set(newUnownedWeaponAttacks(state.sheet, state.savedSheet).map((a) => a.weapon))];
  if (missing.length) return status(`Not saved: you don't have ${missing.length > 1 ? `these weapons: ${missing.join(', ')}` : `a ${missing[0]}`} in your Inventory. Add ${missing.length > 1 ? 'them' : 'it'} there, or rename or remove the attack.`, true);
  state.saving = true;
  state.dirty = false;
  status('Saving…');
  try {
    const sent = structuredClone(state.sheet);
    const res = await state.guarded(() => api('PUT', `${base()}/sheet`, { sheet: sent, version: state.version, character: state.number }));
    if (!res) return; // logged out: the login screen is showing
    state.version = res.version;
    state.savedSheet = sent;
    announce();
    status(state.dirty ? 'Saving soon…' : 'Saved');
  } catch (err) {
    if (err.status === 409 && err.data?.switched && err.data.current) {
      // Another character was made active elsewhere: show that one (what was typed here belonged to the other).
      useSheet(err.data.current.sheet, err.data.current.version, err.data.current.number);
      refreshCharacters();
      status(`Not saved: ${err.data.error} This is now the sheet of the character you play.`, true);
    } else if (err.status === 409 && err.data?.current) {
      const keepMine = confirm(
        'This sheet was changed in another tab or on another device since you opened it.\n\n' +
          'OK: keep what is on this screen (replaces the other version).\nCancel: load the other version (your recent changes here are dropped).',
      );
      if (keepMine) {
        state.version = err.data.current.version;
        state.dirty = true;
      } else {
        useSheet(err.data.current.sheet, err.data.current.version, err.data.current.number);
      }
    } else {
      state.dirty = true;
      status(`Couldn't save (${err.message}). Trying again…`, true);
      state.timer = setTimeout(save, 5000);
      return;
    }
  } finally {
    state.saving = false;
  }
  if (state.dirty) state.timer = setTimeout(save, 300);
}

/** Save straight away if anything is waiting (leaving the page, switching campaign). */
export async function flush() {
  if (state.dirty && !state.saving) await save();
}

/** The server changed the sheet (something bought from a merchant): show the new version, here and in other windows. */
export async function reloadSheet() {
  if (!state.campaignId || state.dirty || state.saving) return;
  const res = await state.guarded(() => api('GET', `${base()}/sheet`)).catch(() => null);
  if (!res || state.dirty || state.saving) return;
  useSheet(res.sheet, res.version, res.number);
  announce();
}

document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
window.addEventListener('beforeunload', (e) => {
  if (state.dirty || state.saving) {
    flush();
    e.preventDefault();
  }
});

// ---------- automatic values ----------

/** The rules edition the campaign plays by: the DM's setting, else the server's. */
const editionNow = () => state.settings?.edition || state.edition || '2014';

export function refresh() {
  state.calc = computeSheet(state.sheet, { ...state.settings, edition: editionNow() });
  for (const r of state.renders) r();
}

const show = (key, kind) => {
  const v = state.calc.values[key];
  return v == null || v === '' ? '' : kind === 'bonus' ? formatBonus(v) : String(v);
};

/**
 * A box with an automatic value. Typing a value makes it the player's own
 * (kept until ↺ is clicked); clearing the box goes back to automatic.
 */
export function auto(key, { kind = 'int', label, cls = '' } = {}) {
  const input = h('input', { type: 'text', class: 'auto-input', 'aria-label': label, inputMode: kind === 'text' ? 'text' : 'numeric', autocomplete: 'off' });
  const reset = h('button', { type: 'button', class: 'reset', hidden: true }, '↺');
  const wrap = h('span', { class: `auto ${cls}` }, input, reset);
  const overrides = () => state.sheet.overrides;
  input.addEventListener('input', () => {
    const raw = input.value.trim();
    if (raw === '') delete overrides()[key];
    else {
      const v = coerceDerived(key, raw);
      if (v === undefined) return;
      overrides()[key] = v;
    }
    changed();
  });
  input.addEventListener('blur', () => paint(true));
  reset.addEventListener('click', () => {
    delete overrides()[key];
    changed();
    paint(true);
  });
  const paint = (force = false) => {
    const mine = key in overrides();
    wrap.classList.toggle('mine', mine);
    reset.hidden = !mine;
    const autoValue = state.calc.auto[key];
    const autoText = autoValue == null || autoValue === '' ? 'nothing' : kind === 'bonus' ? formatBonus(autoValue) : autoValue;
    reset.title = `You set this yourself. The automatic value is ${autoText}. Click to use the automatic value.`;
    input.title = mine ? 'Your own value: kept even when other things change.' : 'Worked out automatically. Type to set your own.';
    if (force || document.activeElement !== input) input.value = show(key, kind);
  };
  state.renders.push(paint);
  return wrap;
}

/** A tick box with an automatic value (e.g. saving throw proficiency). */
function autoCheck(key, label) {
  const box = h('input', { type: 'checkbox', 'aria-label': label });
  const reset = h('button', { type: 'button', class: 'reset', hidden: true }, '↺');
  box.addEventListener('change', () => {
    state.sheet.overrides[key] = box.checked;
    changed();
  });
  reset.addEventListener('click', () => {
    delete state.sheet.overrides[key];
    changed();
  });
  const wrap = h('span', { class: 'auto-check' }, box, reset);
  state.renders.push(() => {
    const mine = key in state.sheet.overrides;
    box.checked = !!state.calc.values[key];
    wrap.classList.toggle('mine', mine);
    reset.hidden = !mine;
    reset.title = `You set this yourself (automatic: ${state.calc.auto[key] ? 'ticked' : 'not ticked'}). Click to use the automatic value.`;
  });
  return wrap;
}

// ---------- plain fields ----------

/** An input bound to a path in the sheet. kind: text | int | number (decimals) | longtext */
export function field(path, { label, kind = 'text', placeholder = '', list, cls = '', nullable = false, rows = 4, onChange } = {}) {
  const value = getPath(state.sheet, path);
  const el =
    kind === 'longtext'
      ? h('textarea', { rows, placeholder, 'aria-label': label })
      : h('input', { type: 'text', placeholder, 'aria-label': label, inputMode: kind === 'int' ? 'numeric' : kind === 'number' ? 'decimal' : 'text', list, autocomplete: 'off' });
  el.value = value ?? '';
  el.className = cls;
  el.addEventListener('input', () => {
    let v = el.value;
    if (kind === 'int' || kind === 'number') {
      if (v.trim() === '') {
        if (!nullable) return;
        v = null;
      } else {
        v = kind === 'int' ? parseInt(v.replace(/^\s*\+/, ''), 10) : Number(v.trim());
        if (!Number.isFinite(v) || (kind === 'number' && v < 0)) return;
      }
    }
    setPath(state.sheet, path, v);
    onChange?.();
    changed();
  });
  if (kind === 'int' || kind === 'number') el.addEventListener('blur', () => (el.value = getPath(state.sheet, path) ?? ''));
  return el;
}

/** A long text bound to the sheet, shown formatted as Markdown until it's clicked to edit (page/markdown.js). */
export const markdownField = (path, opts) => markdownEditor(field(path, { ...opts, kind: 'longtext' }), { cls: 'sheet-md' }).el;

/**
 * Round tick boxes counting up to a number kept at `path` (death saves, spell
 * slots used): ticking the third sets 3, unticking it sets 2. `count` is a
 * number or a function, so the boxes follow the automatic slot count.
 */
export function pips(path, label, count, max = 20) {
  const wrap = h('span', { class: 'pips' });
  state.renders.push(() => {
    const n = Math.max(0, Math.min(max, Number(typeof count === 'function' ? count() : count) || 0));
    if (wrap.childElementCount !== n) {
      wrap.replaceChildren(...Array.from({ length: n }, (_, i) => {
        const b = h('input', { type: 'checkbox', 'aria-label': `${label} ${i + 1}` });
        b.addEventListener('change', () => {
          setPath(state.sheet, path, b.checked ? i + 1 : i);
          changed();
        });
        return b;
      }));
    }
    const used = getPath(state.sheet, path) ?? 0;
    wrap.querySelectorAll('input').forEach((b, i) => (b.checked = i < used));
  });
  return wrap;
}

// ---------- building blocks ----------
//
// Every part of the sheet is a block built by one function below. Layouts
// (further down) arrange the same blocks in different ways, and style.css
// gives them all the same measurements, so boxes line up in any layout.

const lbl = (text) => h('span', { class: 'lbl' }, text);
/** A field with its label underneath, like the printed sheet. */
export const labelled = (text, control, cls = '') => h('label', { class: `fld ${cls}` }, control, lbl(text));
/** A titled box. */
export const box = (title, cls, ...children) => h('section', { class: `sh-box ${cls}` }, title && h('h3', {}, title), ...children);
/** A value with its label underneath (armour class, hit points, spell save DC...); the label rolls it if get is given. */
export const stat = (control, label, cls = '', get) => h('label', { class: `stat ${cls}` }, control, get ? rollButton(label, get, 'lbl') : lbl(label));
/** A one-line box, lined up with the save and skill lists: a value, then what it is. */
const line = (control, label, cls = '') => h('label', { class: `sh-line ${cls}` }, h('span'), h('span', { class: 'line-val' }, control), lbl(label));
const col = (...blocks) => h('div', { class: 'sh-col' }, blocks);
export const row = (name, ...children) => h('div', { class: `sh-row row-${name}` }, children);
const section = (title, ...content) => h('details', { class: 'sh-section', open: true }, h('summary', {}, title), ...content);
export const removeButton = (title, onclick) => h('button', { type: 'button', class: 'icon-x', title, 'aria-label': title, onclick }, '×');
export const addButton = (text, onclick) => h('button', { type: 'button', class: 'add-row', onclick }, `+ ${text}`);

/**
 * A name you click to roll (a save, skill, ability...). get() gives
 * { notation, label, then } at the moment of the click, so it uses the
 * current values. Shift-click: advantage; Alt-click: disadvantage.
 */
function rollButton(content, get, cls = '') {
  const b = h('button', { type: 'button', class: `roll-name ${cls}`, title: 'Click to roll (Shift: advantage, Alt: disadvantage)' }, content);
  b.addEventListener('click', (e) => {
    const r = get();
    // A halfling's Luck: a 1 on the d20 is rolled again (state.calc.d20, shared/feats.js).
    roll(withD20Rule(r.notation, state.calc.d20), { label: r.label, mode: rollModeFromEvent(e), then: r.then, initiative: r.initiative, disadvantage: r.disadvantage, advantage: r.advantage });
  });
  return b;
}
/**
 * A d20 plus an automatic value: "Stealth" → 1d20+2. why: { ability, skill } it uses, for disadvantage from
 * the sheet (heavy armour, weight) and advantage from class features (Feral Instinct on initiative). A skill
 * the character is proficient in rolls 1d20min10 with Reliable Talent.
 */
export const check = (key, label, why = {}) => () => ({
  notation: why.skill ? checkNotation(state.calc, state.sheet, why.skill, state.calc.values[key]) : d20Plus(state.calc.values[key]),
  label: why.skill && state.calc.reliable && state.sheet.skills?.[why.skill] ? `${label} (Reliable Talent)` : label,
  disadvantage: rollDisadvantage(state.calc, why),
  advantage: rollAdvantage(state.calc, why),
});

function datalist(id, options) {
  return h('datalist', { id }, options.map((o) => h('option', { value: o })));
}

// Header: name, classes and the other details at the top of the sheet.

function header() {
  // "High Elf · Wizard 5 / Fighter 1 · Level 6", under the name.
  const summary = h('p', { class: 'summary' });
  state.renders.push(() => {
    const classes = state.sheet.classes.filter((c) => c.name.trim()).map((c) => `${c.name.trim()} ${c.level}`).join(' / ');
    summary.textContent = [state.sheet.race.trim(), classes, `Level ${state.calc.level}`].filter(Boolean).join(' · ');
  });
  return h('header', { class: 'sh-head' },
    h('section', { class: 'sh-box name-box' }, field('name', { label: 'Character name', cls: 'big' }), lbl('Character name'), summary, wildShapeBanner({ state }),
      levelUpBanner({ state, base, flush, status, edition: editionNow, adopt: (res) => { useSheet(res.sheet, res.version, res.number); announce(); } })),
    infoBox(),
  );
}

/** The subclass box suggests the Player's Handbook's subclasses for the class typed beside it. */
function subclassField(c, i) {
  const el = field(`classes.${i}.subclass`, { label: 'Subclass' });
  const list = () => {
    const key = classKey(c.name);
    if (key && CLASSES[key]) el.setAttribute('list', `dl-subclasses-${key}`);
    else el.removeAttribute('list');
  };
  list();
  el.addEventListener('focus', list);
  return el;
}

function infoBox() {
  const classes = h('div', { class: 'sh-table classes' });
  const drawClasses = () => {
    const several = state.sheet.classes.length > 1;
    classes.replaceChildren(
      h('div', { class: 'tr th' }, lbl('Class'), lbl('Subclass'), lbl('Level'), h('span')),
      ...state.sheet.classes.map((c, i) =>
        h('div', { class: 'tr' },
          field(`classes.${i}.name`, { label: 'Class', list: 'dl-classes' }),
          subclassField(c, i),
          field(`classes.${i}.level`, { label: 'Level', kind: 'int', cls: 'num' }),
          several ? removeButton('Remove this class', () => { state.sheet.classes.splice(i, 1); drawClasses(); changed(); }) : h('span'),
        ),
      ),
      addButton('Add a class (multiclass)', () => { state.sheet.classes.push({ name: '', subclass: '', level: 1 }); drawClasses(); changed(); }),
    );
  };
  drawClasses();
  const level = h('output', { class: 'readout', title: 'Worked out from your class levels' });
  state.renders.push(() => (level.textContent = state.calc.level));
  const bg = backgroundBox({ state, input: field('background', { label: 'Background', list: 'dl-backgrounds' }), changed, redraw: render });
  return h('section', { class: 'sh-box info-box' },
    classes,
    h('div', { class: 'info-grid' },
      labelled('Background', bg.box),
      labelled('Race', field('race', { label: 'Race', list: 'dl-races' })),
      labelled('Alignment', field('alignment', { label: 'Alignment', list: 'dl-alignments' })),
      labelled('Player name', field('player_name', { label: 'Player name' })),
      labelled('Experience points', field('xp', { label: 'Experience points' })),
      labelled('Character level', level),
    ),
    bg.more,
  );
}

// Abilities, saves and skills.

const SKILLS_BY_ABILITY = Object.fromEntries(ABILITIES.map((a) => [a, Object.keys(SKILLS).filter((k) => SKILLS[k].ability === a)]));
const PROF = { none: 'Not proficient', proficient: 'Proficient', expertise: 'Expertise (double proficiency)' };
const NEXT_PROF = { none: 'proficient', proficient: 'expertise', expertise: 'none' };

/** The six ability tiles: name, modifier (big) and score. */
function abilityTiles() {
  return h('div', { class: 'abilities' },
    ABILITIES.map((a) =>
      h('div', { class: 'ability' },
        rollButton(ABILITY_NAMES[a], check(`mod.${a}`, `${ABILITY_NAMES[a]} check`, { ability: a }), 'lbl'),
        auto(`mod.${a}`, { kind: 'bonus', label: `${ABILITY_NAMES[a]} modifier`, cls: 'mod' }),
        scoreField(a),
        itemScore(a),
      ),
    ),
  );
}

/** One ability with its saving throw and skills underneath (like the 2024 sheet). */
function abilityGroup(a) {
  const score = scoreField(a);
  score.title = 'Score';
  return h('section', { class: 'sh-box ability-group' },
    h('div', { class: 'ability-head' },
      h('h3', {}, rollButton(ABILITY_NAMES[a], check(`mod.${a}`, `${ABILITY_NAMES[a]} check`, { ability: a }))),
      auto(`mod.${a}`, { kind: 'bonus', label: `${ABILITY_NAMES[a]} modifier`, cls: 'mod' }),
      score,
      itemScore(a),
    ),
    h('ul', { class: 'checklist' }, saveRow(a, 'Saving throw'), SKILLS_BY_ABILITY[a].map((k) => skillRow(k, false))),
  );
}

function saveRow(a, name = ABILITY_NAMES[a]) {
  return h('li', {},
    autoCheck(`save_prof.${a}`, `Proficient in ${ABILITY_NAMES[a]} saves`),
    auto(`save.${a}`, { kind: 'bonus', label: `${ABILITY_NAMES[a]} save` }),
    rollButton(name, check(`save.${a}`, `${ABILITY_NAMES[a]} save`, { ability: a }), 'row-name'),
  );
}

/** The score a magic item gives (Gauntlets of Ogre Power: 19), when it's not the one typed. */
function itemScore(a) {
  const el = h('span', { class: 'item-score muted small' });
  const paint = () => {
    const own = Number(state.sheet.abilities[a]);
    const now = state.calc.scores?.[a] ?? own;
    const from = (state.calc.effects ?? []).filter((e) => e.target === `score.${a}` || e.target === `bonus.${a}`).map((e) => e.from);
    el.textContent = now !== own ? `${now} with items` : '';
    el.title = now !== own ? `From ${[...new Set(from)].join(', ')} (Inventory)` : '';
  };
  paint();
  state.renders.push(paint);
  return el;
}

/** An ability score box. It follows the sheet, so the point buy calculator's buttons show in it. */
function scoreField(a) {
  const el = field(`abilities.${a}`, { label: `${ABILITY_NAMES[a]} score`, kind: 'int', cls: 'score' });
  state.renders.push(() => {
    if (document.activeElement !== el) el.value = state.sheet.abilities[a];
  });
  return el;
}

const RULES_NAMES = { 2014: '2014: bonuses from your race', 2024: '2024: choose your bonuses' };

/**
 * The point buy calculator, beside the ability scores: hidden until the
 * player turns it on. It reads the scores on the sheet (typing in them
 * updates it) and its − and + buttons change them.
 */
function pointBuyBox() {
  const panel = h('div', { class: 'pb-panel', id: 'point-buy' });
  const toggle = h('button', { type: 'button', class: 'pb-toggle', 'aria-controls': 'point-buy' }, 'Point buy');
  toggle.addEventListener('click', () => {
    state.sheet.point_buy.on = !state.sheet.point_buy.on;
    changed();
  });
  const apply = (next) => {
    Object.assign(state.sheet.abilities, next.abilities);
    state.sheet.point_buy = next.point_buy ?? state.sheet.point_buy;
    changed();
  };
  const campaignRules = h('option', { value: '' });
  const rules = h('select', { 'aria-label': 'Point buy rules' }, campaignRules, Object.entries(RULES_NAMES).map(([v, n]) => new Option(n, v)));
  rules.addEventListener('change', () => apply(changePointBuy(state.sheet, { rules: rules.value }, state.settings)));
  const rows = ABILITIES.map((a) => {
    const minus = h('button', { type: 'button', class: 'pb-step', 'aria-label': `One less ${ABILITY_NAMES[a]}`, onclick: () => apply(stepPointBuy(state.sheet, a, -1, state.settings)) }, '−');
    const plus = h('button', { type: 'button', class: 'pb-step', 'aria-label': `One more ${ABILITY_NAMES[a]}`, onclick: () => apply(stepPointBuy(state.sheet, a, 1, state.settings)) }, '+');
    const base = h('output', { class: 'pb-base', 'aria-label': `${ABILITY_NAMES[a]} before bonuses` });
    const cost = h('span', { class: 'pb-cost' });
    const fixed = h('span', { class: 'pb-fixed' });
    const pick = h('select', { 'aria-label': `${ABILITY_NAMES[a]} bonus you choose` }, ['', '1', '2'].map((v) => new Option(v ? `+${v}` : '–', v)));
    pick.addEventListener('change', () => {
      const { abilities } = pointBuy(state.sheet, state.settings);
      const choice = Object.fromEntries(ABILITIES.map((b) => [b, b === a ? Number(pick.value) : abilities[b].chosen]));
      apply(changePointBuy(state.sheet, { choice }, state.settings));
    });
    const total = h('span', { class: 'pb-total' });
    const tr = h('tr', {}, h('th', { scope: 'row' }, ABILITY_NAMES[a]), h('td', { class: 'pb-buy' }, minus, base, plus), h('td', {}, cost), h('td', { class: 'pb-bonus' }, fixed, pick), h('td', {}, total));
    return { a, tr, minus, plus, base, cost, fixed, pick, total };
  });
  const points = h('p', { class: 'pb-points' });
  const problems = h('ul', { class: 'pb-problems' });
  const note = h('p', { class: 'muted small pb-note' });
  panel.append(
    h('label', { class: 'pb-rules' }, h('span', {}, 'Rules'), rules),
    h('table', { class: 'pb-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Ability'), h('th', {}, 'Bought'), h('th', {}, 'Cost'), h('th', {}, 'Bonus'), h('th', {}, 'Score'))),
      h('tbody', {}, rows.map((r) => r.tr))),
    points, problems, note,
  );
  const paint = () => {
    const on = state.sheet.point_buy.on;
    toggle.setAttribute('aria-pressed', String(on));
    toggle.title = on ? 'Hide the point buy calculator' : 'Show a point buy calculator for your ability scores';
    panel.hidden = !on;
    if (!on) return;
    const pb = pointBuy(state.sheet, state.settings);
    campaignRules.textContent = `The campaign's rules (${state.settings.edition === '2024' ? '2024' : '2014'})`;
    if (document.activeElement !== rules) rules.value = state.sheet.point_buy.rules;
    const canChoose = pb.choose !== 0;
    for (const r of rows) {
      const x = pb.abilities[r.a];
      r.base.value = String(x.base);
      r.base.classList.toggle('bad', x.cost == null);
      r.minus.disabled = x.base <= POINT_BUY.min;
      r.plus.disabled = x.base >= POINT_BUY.max || (x.cost != null && POINT_COST[x.base + 1] - x.cost > pb.left);
      r.cost.textContent = x.cost == null ? '–' : String(x.cost);
      r.fixed.textContent = x.fixed ? `+${x.fixed}` : '';
      const closed = !canChoose || pb.not.includes(r.a) || (pb.allowed && !pb.allowed.includes(r.a) && !x.chosen);
      r.pick.hidden = closed;
      r.pick.options[2].hidden = pb.max < 2;
      if (document.activeElement !== r.pick) r.pick.value = x.chosen ? String(x.chosen) : '';
      if (closed && !x.fixed) r.fixed.textContent = '–';
      r.total.textContent = String(x.score);
    }
    points.textContent = `${pb.spent} of ${pb.budget} points spent, ${pb.left} left.`;
    points.classList.toggle('bad', pb.left < 0);
    problems.replaceChildren(...pb.problems.map((p) => h('li', {}, p)));
    problems.hidden = !pb.problems.length;
    note.textContent = [
      `Each score is bought from ${POINT_BUY.min} to ${POINT_BUY.max} before bonuses: 9 to 13 cost 1 point each, 14 and 15 cost 2.`,
      pb.rules === '2024' ? `Your background raises one ability by 2 and another by 1, or three by 1${pb.allowed ? ` (${state.sheet.background.trim()}: ${pb.allowed.map((a) => ABILITY_NAMES[a]).join(', ')})` : ''}.` : null,
      pb.rules === '2014' && !pb.raceKnown ? (state.sheet.race.trim() ? `${state.sheet.race.trim()} isn't a race from the 2014 Player's Handbook: choose its bonuses.` : 'Type your race at the top to get its bonuses, or choose them here.') : null,
      'Bonuses from levels or feats aren\'t counted: the calculator is for a new character.',
    ].filter(Boolean).join(' ');
  };
  state.renders.push(paint);
  return h('section', { class: 'sh-box point-buy' }, toggle, panel);
}

function skillRow(k, withAbility = true) {
  const { name, ability } = SKILLS[k];
  const mark = h('button', { type: 'button', class: 'prof-mark' });
  const paint = () => {
    const p = state.sheet.skills[k] ?? 'none';
    mark.dataset.prof = p;
    mark.title = `${PROF[p]}. Click to change.`;
    mark.setAttribute('aria-label', `${name}: ${PROF[p]}`);
  };
  mark.addEventListener('click', () => {
    const next = NEXT_PROF[state.sheet.skills[k] ?? 'none'];
    if (next === 'none') delete state.sheet.skills[k];
    else state.sheet.skills[k] = next;
    paint();
    changed();
  });
  paint();
  return h('li', {},
    mark,
    auto(`skill.${k}`, { kind: 'bonus', label: name }),
    rollButton([name, withAbility && h('span', { class: 'muted small' }, ` (${cap(ability)})`)], check(`skill.${k}`, name, { ability, skill: k }), 'row-name'),
  );
}

const saves = () => box('Saving throws', 'saves', h('ul', { class: 'checklist' }, ABILITIES.map((a) => saveRow(a))));
const skills = () => box('Skills', 'skills', h('ul', { class: 'checklist' }, Object.keys(SKILLS).map((k) => skillRow(k))), h('div', { class: 'list-foot' }, legend(), jack()));
/** The skill marks explained, and Jack of All Trades (for layouts without a Skills box). */
const skillNotes = () => box(null, 'skill-notes', legend(), jack());

const legend = () =>
  h('p', { class: 'legend' }, ['none', 'proficient', 'expertise'].map((p) => h('span', {}, h('i', { class: 'mark', 'data-prof': p }), p)));
const jack = () =>
  h('label', { class: 'jack' }, autoCheck('jack_of_all_trades', 'Jack of All Trades'), h('span', {}, 'Jack of All Trades: half proficiency on other checks'));

function inspiration() {
  const tick = h('input', { type: 'checkbox', checked: state.sheet.inspiration, onchange: (e) => { state.sheet.inspiration = e.target.checked; changed(); } });
  return line(tick, 'Inspiration', 'inspiration');
}
const proficiency = () => line(auto('proficiency_bonus', { kind: 'bonus', label: 'Proficiency bonus' }), 'Proficiency bonus');
const passive = () => line(auto('passive_perception', { label: 'Passive Wisdom (Perception)' }), 'Passive Wisdom (Perception)');

/** Ability tiles beside inspiration, proficiency, saves and skills: the left of the official sheet. */
const core = () => [h('div', { class: 'core' }, abilityTiles(), h('div', { class: 'core-stack' }, inspiration(), proficiency(), saves(), skills())), pointBuyBox()];

// Combat.

const vitals = () =>
  h('div', { class: 'vitals' },
    stat(auto('ac', { label: 'Armour class' }), 'Armour class', 'big'),
    stat(auto('initiative', { kind: 'bonus', label: 'Initiative' }), 'Initiative', 'big', () => ({ ...check('initiative', 'Initiative', { ability: 'dex' })(), advantage: rollAdvantage(state.calc, { initiative: true }), initiative: true })),
    stat(auto('speed', { label: 'Speed (feet)' }), 'Speed', 'big'),
    loadNote('sheet-warn'),
  );

/** What the gear does to speed and rolls: too heavy, armour without the Strength for it, noisy armour. */
export function loadNote(cls) {
  const el = h('p', { class: `${cls} small`, role: 'note' });
  const paint = () => {
    const { load, tooHeavy, disadvantage } = state.calc;
    const notes = [];
    if (load?.level === 'over') notes.push(`Over your carrying capacity (${load.carried} of ${load.capacity} lb): speed 5 ft${load.disadvantage ? ', disadvantage on Strength, Dexterity and Constitution rolls' : ''}.`);
    else if (load?.level === 'heavy') notes.push(`Heavily encumbered (${load.carried} lb): speed −20 ft, disadvantage on Strength, Dexterity and Constitution rolls.`);
    else if (load?.level === 'encumbered') notes.push(`Encumbered (${load.carried} lb): speed −10 ft.`);
    if (tooHeavy) notes.push(`${tooHeavy.name} needs Strength ${tooHeavy.armor.strength}: speed −10 ft.`);
    const noisy = disadvantage?.find((d) => d.skills.includes('stealth'));
    if (noisy) notes.push(`${noisy.why}: disadvantage on Stealth.`);
    el.textContent = notes.join(' ');
    el.hidden = !notes.length;
  };
  paint();
  state.renders.push(paint);
  return el;
}

const hp = () =>
  box('Hit points', 'hp',
    h('div', { class: 'tiles' },
      stat(field('hp.current', { label: 'Current hit points', kind: 'int', nullable: true }), 'Current', 'hp-current'),
      stat(auto('hp_max', { label: 'Hit point maximum' }), 'Maximum'),
      stat(field('hp.temp', { label: 'Temporary hit points', kind: 'int', nullable: true }), 'Temporary'),
    ),
  );

/**
 * Hit dice: the total (automatic, or typed), then a row per die size with a
 * tick per spent die and Spend, which has the server roll it and add the hit
 * points. Short rest gives back what a short rest does (Pact Magic slots).
 */
function hitDice() {
  const rows = h('div', { class: 'hd-rows' });
  let drawn = '';
  state.renders.push(() => {
    const dice = hitDiceOf(state.sheet, state.calc.values);
    const shape = dice.map((d) => `${d.die}:${d.total}`).join();
    if (shape !== drawn) {
      drawn = shape;
      rows.replaceChildren(...dice.map(({ die, total }) =>
        h('div', { class: 'hd-row', 'data-die': die },
          h('span', { class: 'hd-die' }, `d${die}`),
          h('span', { class: 'pips' }, Array.from({ length: total }, (_, i) => {
            const b = h('input', { type: 'checkbox', 'aria-label': `d${die} hit die spent ${i + 1}` });
            b.addEventListener('change', () => {
              const n = b.checked ? i + 1 : i;
              if (n) state.sheet.hit_dice_spent[die] = n;
              else delete state.sheet.hit_dice_spent[die];
              changed();
            });
            return b;
          })),
          h('span', { class: 'hd-left muted' }),
          h('button', { type: 'button', class: 'ghost hd-spend', title: `Roll a d${die} plus your Constitution modifier and regain that many hit points`, onclick: () => spendHitDie(die) }, 'Spend'),
        )));
    }
    for (const { die, spent, left } of dice) {
      const row = rows.querySelector(`[data-die="${die}"]`);
      row.querySelectorAll('input').forEach((b, i) => (b.checked = i < spent));
      row.querySelector('.hd-left').textContent = `${left} left`;
      row.querySelector('.hd-spend').disabled = !left;
    }
  });
  return box('Hit dice', 'hd',
    h('div', { class: 'tiles' }, stat(auto('hit_dice', { kind: 'text', label: 'Hit dice' }), 'Total')),
    rows,
    h('button', { type: 'button', class: 'ghost hd-short-rest', title: 'Class features that recharge on a short rest come back (and warlocks\' Pact Magic slots); spend hit dice to heal', onclick: takeShortRest }, 'Short rest'),
  );
}

/** Spend a hit die: the server rolls it (the dice show it like any roll) and the sheet gets the hit points. */
async function spendHitDie(die) {
  await flush();
  await roll('', {
    label: `Hit die (d${die})`,
    path: `${base()}/sheet/hit-dice`,
    body: { die },
    onServer: (res) => {
      useSheet(res.sheet, res.version, res.number);
      announce();
      status(`Spent a d${die} hit die: ${res.healed ? `regained ${res.healed} hit point${res.healed === 1 ? '' : 's'}` : 'no hit points regained'}.`);
    },
  });
}

/**
 * Use a class feature the server rolls for: one that heals (Second Wind), one
 * that heals with a spell slot (Combat Wild Shape: extra = { slot }), or
 * Portent's d20s. A set number of hit points (Wholeness of Body, 2014) isn't
 * a roll, so it skips the dice.
 */
async function useFeature(row, extra = {}) {
  await flush();
  const path = `${base()}/sheet/features/use`;
  const body = { id: row.id, ...extra };
  const done = (res) => {
    useSheet(res.sheet, res.version, res.number);
    announce();
    if (res.rolled_numbers) status(`${row.name}: ${res.rolled_numbers.join(', ')}. They're kept in the box until you use them.`);
    else status(`${row.name}: ${res.healed ? `regained ${res.healed} hit point${res.healed === 1 ? '' : 's'}` : 'no hit points regained'}.`);
  };
  if (row.heal && !/d/i.test(row.heal) && !extra.slot) {
    try {
      done(await api('POST', path, body));
    } catch (err) {
      alert(err.message);
    }
    return;
  }
  await roll('', { label: row.name, path, body, onServer: done });
}

async function takeShortRest() {
  await flush();
  try {
    const spentBefore = { ...state.sheet.class_features.spent };
    const res = await state.guarded(() => api('POST', `${base()}/sheet/short-rest`));
    if (!res) return;
    useSheet(res.sheet, res.version, res.number);
    announce();
    // Name what came back: Pact Magic slots, and class features with fewer spent than before.
    const features = featureRows(state.sheet, { edition: state.settings?.edition || state.edition, values: state.calc.values })
      .filter((r) => (spentBefore[r.id] ?? 0) > (state.sheet.class_features.spent[r.id] ?? 0)).map((r) => r.name);
    const back = [state.calc.values.pact_slots ? 'Pact Magic slots' : '', ...features].filter(Boolean);
    const list = back.length > 1 ? `${back.slice(0, -1).join(', ')} and ${back.at(-1)}` : back[0];
    status(`Short rest taken${list ? `: ${list} ${back.length > 1 || /s$/.test(list) ? 'are' : 'is'} back` : ''}. Spend hit dice to heal.`);
  } catch (err) {
    status(`Couldn't take a short rest: ${err.message}`, true);
  }
}

/**
 * The player's sheet was saved somewhere else (live, from table.js): hit
 * points changed on the map, a purchase, a rest, another window. A newer
 * version is loaded unless something here is waiting to be saved (saving it
 * then meets the newer version and asks which to keep).
 */
export async function sheetHeard({ version, number }) {
  // Another of the player's characters made active elsewhere: show it whatever its version.
  const other = (n) => n != null && n !== state.number;
  if (!state.sheet || state.dirty || state.saving || (version <= state.version && !other(number))) return;
  const res = await state.guarded(() => api('GET', `${base()}/sheet`)).catch(() => null);
  if (!res || state.dirty || state.saving || (res.version <= state.version && !other(res.number))) return;
  if (other(res.number)) {
    const pictures = await state.guarded(() => api('GET', `${base()}/character/pictures`)).catch(() => null);
    // This page may have switched itself meanwhile (its own Make active), or the player started typing.
    if (state.dirty || state.saving || !other(res.number)) return;
    state.pictures = pictures ?? state.pictures;
    useSheet(res.sheet, res.version, res.number);
    refreshCharacters();
    status(`You now play ${res.sheet.name || 'another character'} (changed on another device).`);
    announce();
    return;
  }
  // Keep what the status line says (a rest's or a purchase's note may be there).
  const note = $('#sheet-status').textContent;
  const given = (res.sheet.levels_granted ?? 0) > (state.sheet.levels_granted ?? 0);
  useSheet(res.sheet, res.version, res.number);
  if (given) status('The DM has given you a level: press Level up under your name.');
  else if (note) status(note);
  announce();
}

/**
 * The DM called a rest that includes this player (live, from table.js): load
 * the changed sheet. With changes waiting here, saving them first meets the
 * newer version and asks which to keep, as with another device.
 */
export async function restCalled(rest) {
  if (!state.sheet || state.saving) return;
  if (state.dirty) return save();
  const res = await state.guarded(() => api('GET', `${base()}/sheet`)).catch(() => null);
  if (!res || state.dirty) return;
  // The sheet may already be loaded (the live `sheet` news can come first).
  if (res.version > state.version) {
    useSheet(res.sheet, res.version, res.number);
    announce();
  }
  status(rest.kind === 'long' ? 'The DM called a long rest: your sheet is updated.' : 'The DM called a short rest: spend hit dice to heal.');
}

const deathSaves = () =>
  box('Death saves', 'death',
    h('div', { class: 'ds' },
      ['successes', 'failures'].map((kind) => h('div', { class: `ds-row ds-${kind}` }, h('span', {}, cap(kind)), pips(`death_saves.${kind}`, cap(kind), 3))),
    ),
    h('button', { type: 'button', class: 'ghost ds-roll', onclick: (e) => roll(withD20Rule('1d20', state.calc.d20), { label: 'Death save', mode: rollModeFromEvent(e) }) }, 'Roll a death save'),
  );

const combat = () => h('div', { class: 'combat' }, vitals(), hp(), h('div', { class: 'pair' }, hitDice(), deathSaves()));

function attacks() {
  const list = h('div', { class: 'sh-table attacks' });
  // Suggested names: an unarmed strike and the weapons in the inventory (weapon attacks need the weapon).
  const names = h('datalist', { id: 'dl-attacks' });
  const draw = () => {
    names.replaceChildren(...['Unarmed strike', ...new Set(state.sheet.inventory.filter((g) => g.weapon).map((g) => g.name))].map((n) => h('option', { value: n })));
    list.replaceChildren(
      ...(state.sheet.attacks.length || equippedWeapons().length ? [h('div', { class: 'tr th' }, lbl('Name'), lbl('To hit / DC'), lbl('Damage / type'), h('span'), h('span'), h('span'))] : []),
      ...equippedWeapons().map((g) => gearAttackRow(g)),
      ...(offhandWeapon(state.sheet, editionNow()) ? [gearAttackRow(offhandWeapon(state.sheet, editionNow()), { offhand: true })] : []),
      ...state.sheet.attacks.map((_, i) => attackRow(i, draw)),
      addButton('Add an attack', () => { state.sheet.attacks.push(newAttack()); draw(); changed(); }),
    );
  };
  draw();
  state.gearDraws.push(draw);
  state.attackDraws.push(draw);
  return box('Attacks & spellcasting', 'attacks-box', combatBar(attackCtx()), list, names);
}

/** What sheet/attacks.js needs from the sheet. */
export const attackCtx = () => ({ state, changed, render, status });

const ATTACK_ABILITY_NAMES = { '': 'As written', ...ABILITY_NAMES, finesse: 'Finesse (Str or Dex)', spell: 'Spellcasting ability' };
const ABBR = (a) => (a ? cap(a) : '');

/**
 * One attack: its name, to hit (or the save's DC), damage, and buttons to
 * roll to hit and to roll damage; under it, what's added: the ability,
 * proficiency, a magic bonus, or a saving throw instead of an attack roll.
 */
function attackRow(i, draw) {
  const a = state.sheet.attacks[i];
  const p = `attacks.${i}`;
  const save = a.kind === 'save';
  const name = field(`${p}.name`, { label: 'Attack name', placeholder: 'Name', list: 'dl-attacks', onChange: () => {
    // A weapon from the book (one they have) fills in its damage and ability, when they're still empty; so does an unarmed strike.
    const typed = a.name.trim().toLowerCase();
    const unarmed = typed === 'unarmed strike';
    const w = unarmed ? { damage: '1 bludgeoning', ability: 'str' } : WEAPONS[typed];
    if (w && !save && !a.damage.trim() && (unarmed || ownsWeapon(w.name, state.sheet.inventory))) {
      Object.assign(a, { damage: w.damage, ability: w.ability });
      row.querySelector('[aria-label="Damage and type"]').value = a.damage;
      row.querySelector('[aria-label="Ability added"]').value = a.ability;
      paint();
    }
  } });
  const hitBox = save
    ? field(`${p}.dc`, { label: 'Save DC', cls: 'num' })
    : field(`${p}.bonus`, { label: 'Attack bonus', cls: 'num' });
  const sum = h('span', { class: 'muted small atk-sum' });
  const select = (key, label, options, after) => {
    const el = h('select', { 'aria-label': label }, Object.entries(options).map(([v, n]) => new Option(n, v)));
    el.value = a[key];
    el.addEventListener('change', () => { a[key] = el.value; changed(); after?.(); });
    return el;
  };
  const opts = h('div', { class: 'atk-opts' },
    select('kind', 'Attack or save', { attack: 'Attack roll', save: 'Saving throw' }, draw),
    labelled('Adds', select('ability', 'Ability added', ATTACK_ABILITY_NAMES), 'inline'),
    save
      ? labelled('Save', select('save', 'Saving throw ability', { '': '–', ...ABILITY_NAMES }), 'inline')
      : null,
    labelled('Magic', field(`${p}.magic`, { label: 'Magic bonus', kind: 'int', cls: 'num' }), 'inline'),
    sum,
  );
  // A weapon attack needs the weapon in the inventory: without it the attack doesn't roll (and a new one isn't saved).
  const warn = h('div', { class: 'atk-warn error small', hidden: true });
  const paintOwned = () => {
    const weapon = attackWeapon(a.name);
    const missing = !!weapon && !ownsWeapon(weapon, state.sheet.inventory);
    row.classList.toggle('unowned', missing);
    warn.hidden = !missing;
    hit.disabled = damage.disabled = missing;
    if (!missing) return;
    const item = a.magic > 0 ? `+${a.magic} ${weapon}` : weapon;
    warn.replaceChildren(
      `You don't have a ${weapon} in your Inventory, so this attack can't be rolled. `,
      h('button', { type: 'button', class: 'ghost small', onclick: () => {
        // Into the Inventory, equipped: it shows in Attacks from there, so this typed row goes.
        state.sheet.attacks.splice(state.sheet.attacks.indexOf(a), 1);
        const stats = itemStats({ name: item });
        addGear({ name: item, qty: 1, equipped: 1, kind: stats.kind, weapon: stats.weapon, magic: stats.magic, weight: stats.weight, source: "Player's Handbook (SRD)" });
      } }, `Add a ${item} to my Inventory`),
    );
  };
  const key = () => `attack:${state.sheet.attacks.indexOf(a)}`;
  const plan = () => attackPlan(state, a, { key: key() });
  const paint = () => {
    paintOwned();
    const r = save ? attackRolls(a, state.calc) : plan();
    hitBox.placeholder = save ? `DC ${r.autoDc}` : formatBonus(r.autoBonus);
    const dmg = r.damage ?? (r.flat != null ? String(r.flat) : '');
    sum.textContent = [
      save ? `DC ${r.dc}${r.save ? ` ${ABBR(r.save)}` : ''} save` : `${r.hit} to hit`,
      dmg && `${dmg}${r.type ? ` ${r.type}` : ''}`,
    ].filter(Boolean).join(' · ');
  };
  state.renders.push(paint);
  const hit = h('button', { type: 'button', class: 'icon-roll', title: 'Roll to hit (Shift: advantage, Alt: disadvantage)', 'aria-label': 'Roll this attack', hidden: save });
  hit.innerHTML = D20_ICON;
  hit.addEventListener('click', (e) => {
    const title = a.name.trim() || 'Attack';
    rollAttackPlan(attackCtx(), { key: key(), title, plan: plan(), mode: rollModeFromEvent(e), disadvantage: rollDisadvantage(state.calc, { ability: a.ability === 'finesse' ? 'dex' : a.ability }) });
  });
  const damage = h('button', { type: 'button', class: 'icon-roll dmg-roll', title: 'Roll damage', 'aria-label': 'Roll damage' }, 'Dmg');
  damage.addEventListener('click', () => {
    const title = a.name.trim() || 'Attack';
    if (!save) return rollDamagePlan(attackCtx(), { key: key(), title, plan: plan() });
    const r = attackRolls(a, state.calc);
    if (r.damage) roll(r.damage, { label: `${title}: damage${save ? ` (DC ${r.dc}${r.save ? ` ${ABBR(r.save)}` : ''} save)` : ''}` });
    else if (r.flat != null) alert(`${title}: ${r.flat} damage (no dice to roll).`);
    else alert(`Type the damage for ${title} first, like 1d8 slashing.`);
  });
  const row = h('div', { class: `tr${save ? ' save' : ''}` },
    name,
    hitBox,
    field(`${p}.damage`, { label: 'Damage and type', placeholder: 'e.g. 1d8 slashing' }),
    save ? h('span') : hit,
    damage,
    removeButton('Remove this attack', () => { state.sheet.attacks.splice(i, 1); draw(); changed(); }),
    opts,
    save ? null : extrasLine(attackCtx(), { key: key(), name: a.name, plan, onPick: () => paint() }),
    warn,
  );
  if (state.calc) paint();
  return row;
}

const equippedWeapons = () => state.sheet.inventory.filter((g) => g.equipped && g.weapon);

/** An equipped weapon from the inventory, as an attack: to hit, damage (and with both hands, if versatile). */
function gearAttackRow(g, { offhand = false } = {}) {
  const title = offhand ? `${g.name} (off-hand)` : g.name;
  const key = `${offhand ? 'offhand' : 'gear'}:${g.id}`;
  const attack = () => ({ name: g.name, kind: 'attack', ability: g.weapon.ability, proficient: g.proficient, magic: g.magic, bonus: '', save: '', dc: '', damage: g.weapon.damage });
  const plan = (two = false) => attackPlan(state, attack(), { key, weapon: { ...g.weapon, name: g.name }, two, offhand });
  const r = gearRolls(g, state.calc);
  const hit = h('button', { type: 'button', class: 'icon-roll', title: 'Roll to hit (Shift: advantage, Alt: disadvantage)', 'aria-label': `Roll ${title} to hit` });
  hit.innerHTML = D20_ICON;
  hit.addEventListener('click', (e) => {
    rollAttackPlan(attackCtx(), { key, title, plan: plan(), mode: rollModeFromEvent(e), disadvantage: rollDisadvantage(state.calc, { ability: g.weapon.ability === 'finesse' ? 'dex' : g.weapon.ability }) });
  });
  const damage = (two) => h('button', { type: 'button', class: 'icon-roll dmg-roll', title: two ? 'Roll damage with both hands (versatile)' : 'Roll damage', 'aria-label': `Roll ${title} damage${two ? ' with both hands' : ''}`, onclick: () => {
    const now = plan(two);
    if (now.damage || now.flat != null) rollDamagePlan(attackCtx(), { key, title, plan: now, label: two ? ' (both hands)' : '' });
    else alert(`${title} has no damage set. Set it in your Inventory.`);
  } }, two ? '2H' : 'Dmg');
  const num = h('span', { class: 'num gear-num' });
  const dmg = h('span', { class: 'gear-dmg' });
  const paint = () => {
    const p = plan();
    num.textContent = formatBonus(p.bonus);
    const base = offhand ? { ...p, damage: p.parts.length ? p.parts[0].replace(/\s.*$/, '') : p.damage } : gearRolls(g, state.calc);
    dmg.textContent = base.damage ? `${base.damage}${base.type ? ` ${base.type}` : ''}` : base.flat != null ? `${base.flat}${base.type ? ` ${base.type}` : ''}` : '–';
  };
  paint();
  state.renders.push(paint);
  return h('div', { class: 'tr gear-attack', title: 'From your Inventory: change it there' },
    h('span', { class: 'gear-name' }, title, g.equipped > 1 && !offhand ? h('span', { class: 'muted small' }, ` ×${g.equipped}`) : null, g.proficient ? null : h('span', { class: 'muted small' }, ' (not proficient)')),
    num,
    dmg,
    hit,
    r.damage2 && !offhand ? h('span', { class: 'gear-dmg-pair' }, damage(false), damage(true)) : damage(false),
    h('span'),
    extrasLine(attackCtx(), { key, name: title, plan: () => plan(), onPick: paint }),
  );
}

// Everything else.

const COIN_NAMES = { cp: 'Copper', sp: 'Silver', ep: 'Electrum', gp: 'Gold', pp: 'Platinum' };
const equipment = () =>
  box('Equipment', 'equipment',
    h('div', { class: 'coins' }, Object.entries(COIN_NAMES).map(([c, name]) => labelled(c.toUpperCase(), field(`coins.${c}`, { label: `${name} pieces`, kind: 'int' })))),
    field('equipment', { label: 'Equipment', kind: 'longtext', rows: 8 }),
  );

/** A box that's just a titled text area. */
export const text = (key, title, rows, cls = '') => box(title, cls, field(key, { label: title, kind: 'longtext', rows }));

const TRAITS = { personality: 'Personality traits', ideals: 'Ideals', bonds: 'Bonds', flaws: 'Flaws' };
const traits = () => h('div', { class: 'traits' }, Object.entries(TRAITS).map(([k, title]) => text(k, title, 3)));
// Features & traits: what the class and race give (sheet/traits.js) above the player's own text (shown formatted, page/markdown.js).
const features = () => box('Features & traits', '', traitsList({ state, changed, render }), markdownField('features', { label: 'Features & traits', rows: 12 }));
const proficiencies = () => text('proficiencies_languages', 'Other proficiencies & languages', 5);

export function details() {
  return h('div', { class: 'sh-details' },
    h('section', { class: 'sh-box looks' }, ['age', 'height', 'weight', 'eyes', 'skin', 'hair'].map((k) => labelled(cap(k), field(k, { label: cap(k) })))),
    h('div', { class: 'details-grid' },
      pictures(),
      text('appearance', 'Character appearance', 5, 'd-appearance'),
      text('backstory', 'Character backstory', 12, 'd-backstory'),
      text('allies', 'Allies & organisations', 5, 'd-allies'),
      text('treasure', 'Treasure', 4, 'd-treasure'),
      box('Additional features & traits', 'd-additional', markdownField('additional_features', { label: 'Additional features & traits', rows: 5 })),
    ),
  );
}

// Pictures of the character: the token that stands for them on maps (everyone
// in the campaign sees it there), and a full picture (only theirs) that the
// AI describes into the Appearance box.

/** Show a picture once it's fetched (it needs the login, so an <img> can't fetch it itself). */
function pictureImg(kind, cls) {
  const entry = state.pictures[kind];
  const img = h('img', { class: cls, alt: kind === 'token' ? 'Your token' : 'Your character' });
  const url = kind === 'token' ? `${base()}/members/${state.userId}/token` : `${base()}/character/picture/image`;
  const cached = state.pictureUrls.get(entry.key);
  if (cached) img.src = cached;
  else {
    fileUrl(`${url}?v=${encodeURIComponent(entry.key)}`)
      .then((u) => {
        state.pictureUrls.set(entry.key, u);
        img.src = u;
      })
      .catch(() => { img.alt = "Couldn't load the picture"; });
  }
  return img;
}

function pictures() {
  const el = h('section', { class: 'sh-box d-pictures' });
  const draw = () => {
    const { token, picture } = state.pictures;
    const fileInput = (kind) => {
      const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, 'aria-label': kind === 'token' ? 'Token picture' : 'Character picture' });
      input.addEventListener('change', () => {
        const file = input.files[0];
        input.value = '';
        if (file) uploadPicture(kind, file, draw);
      });
      return input;
    };
    const tokenInput = fileInput('token');
    const pictureInput = fileInput('picture');
    const button = (text, onclick, title) => h('button', { type: 'button', class: 'ghost small', onclick, title }, text);
    setChildren(el,
      h('h3', {}, 'Pictures'),
      h('div', { class: 'pictures' },
        h('figure', { class: 'pic pic-token' },
          token ? pictureImg('token', 'token-preview') : h('div', { class: 'token-preview no-picture' }, '?'),
          h('figcaption', {}, lbl('Token'), h('span', { class: 'muted small' }, 'Shows on the map for everyone')),
          h('div', { class: 'pic-actions' },
            button(token ? 'Change' : 'Upload token', () => tokenInput.click(), 'A picture for your token on maps (square works best)'),
            token && button('Remove', () => removePicture('token', draw)),
          ),
          tokenInput,
        ),
        h('figure', { class: 'pic pic-full' },
          picture ? pictureImg('picture', 'full-preview') : h('div', { class: 'full-preview no-picture' }, 'No picture'),
          h('figcaption', {}, lbl('Full picture'), h('span', { class: 'muted small' }, 'Only you see it; the AI describes it for your sheet')),
          h('div', { class: 'pic-actions' },
            button(picture ? 'Change' : 'Upload picture', () => pictureInput.click()),
            picture && button('Describe again', () => describeAgain(draw), 'Have the AI describe this picture again'),
            picture && button('Remove', () => removePicture('picture', draw)),
          ),
          pictureInput,
        ),
      ),
      state.unusedDescription && h('div', { class: 'unused-description' },
        h('p', { class: 'small' }, h('strong', {}, "The AI's description"), ' (your own Appearance text was kept):'),
        h('p', { class: 'small' }, state.unusedDescription),
        h('div', { class: 'pic-actions' },
          button('Use it', () => {
            state.sheet.appearance = state.unusedDescription;
            state.unusedDescription = '';
            render();
            changed();
          }),
          button('Dismiss', () => { state.unusedDescription = ''; draw(); }),
        ),
      ),
    );
  };
  draw();
  return el;
}

/** Ask before the AI replaces Appearance text the player already has. */
const replaceAppearance = () =>
  !state.sheet.appearance.trim() || confirm("Replace your Appearance text with the AI's description of this picture?\n\nCancel keeps your text (you'll see the description and can still use it).");

/** The server described the picture and saved the sheet: show that sheet, or the description it didn't use. */
function described(res) {
  if (res.sheet) {
    useSheet(res.sheet.sheet, res.sheet.version, res.sheet.number);
    announce();
  }
  state.unusedDescription = !res.applied && res.description?.appearance ? res.description.appearance : '';
  if (state.unusedDescription) render();
  const notes = res.description?.notes;
  if (res.error) status(res.error, true);
  else if (res.applied) status(`The AI described your picture in Appearance. Change anything it got wrong.${notes ? ` ${notes}` : ''}`);
  else if (!res.description?.appearance) status(notes || "The AI couldn't describe that picture.", true);
  else status(`The AI described your picture below; your own Appearance text was kept.${notes ? ` ${notes}` : ''}`);
}

async function uploadPicture(kind, file, draw) {
  await flush();
  const replace = kind === 'picture' ? replaceAppearance() : false;
  status(kind === 'token' ? `Uploading ${file.name}…` : `Uploading ${file.name}; the AI is describing it… (this can take a minute)`);
  try {
    const data = await readBase64(file);
    const res = await state.guarded(() => api('PUT', `${base()}/character/${kind}`, { filename: file.name, data, replace }));
    if (!res) return;
    state.pictures = res.pictures;
    if (kind === 'token') {
      status('Your token picture is saved. It shows on any map your token is on.');
      draw();
    } else {
      described(res);
      draw();
    }
  } catch (err) {
    status(`Couldn't upload that picture: ${err.message}`, true);
  }
}

async function describeAgain(draw) {
  await flush();
  const replace = replaceAppearance();
  status('The AI is describing your picture…');
  try {
    const res = await state.guarded(() => api('POST', `${base()}/character/picture/describe`, { replace }));
    if (!res) return;
    described(res);
    draw();
  } catch (err) {
    status(`Couldn't describe your picture: ${err.message}`, true);
  }
}

async function removePicture(kind, draw) {
  if (!confirm(kind === 'token' ? 'Remove your token picture? Your token goes back to your initials.' : 'Remove your full picture?')) return;
  try {
    const res = await state.guarded(() => api('DELETE', `${base()}/character/${kind}`));
    if (!res) return;
    state.pictures = res.pictures;
    draw();
  } catch (err) {
    status(`Couldn't remove that picture: ${err.message}`, true);
  }
}

// ---------- layouts ----------
//
// Chosen under Look (data-sheet-layout on #tab-sheet). Each returns the rows
// below the header; the column widths and how they fold up on narrow
// screens are in themes.css. Every column stretches to the tallest one in its
// row, and its last block grows to fill, so the bottoms line up.

/**
 * Class features (sheet/class-features.js): Rage, Second Wind, Ki... for this
 * character's classes, and the player's own rows. Druids get their Wild Shape
 * forms under the Wild Shape row (sheet/wild-shape.js).
 */
const classFeatures = () => classFeaturesBox({ state, changed, render, heal: useFeature, wildShape: () => wildShapeBox({ state, changed, render }) });

/** Companions (sheet/companions.js): familiars, pets, mounts, summons, with their stat blocks; on the map with Put on the map. */
const companions = () => companionsBox({ state, changed, flush });

/** Item actions (sheet/item-actions.js): Bag of Tricks, a wand's Fireball… with Use (the server spends, rolls and does it). */
const itemActions = () => itemActionsBox({ state, use: useItem });

/** Use an item: the server checks and spends its charges, rolls (the dice show it) and does it; the sheet comes back. */
async function useItem(g, a, extra = 0) {
  await flush();
  const path = `${base()}/sheet/gear/use`;
  const body = { id: g.id, action: a.id, extra };
  const done = (res) => {
    useSheet(res.sheet, res.version);
    announce();
    status(res.message || `${g.name}: ${a.name}.`);
  };
  const rolls = a.kind !== 'other' && (a.table.length || /d/i.test(a.count) || a.damage || a.heal || a.kind === 'attack' || a.crumble);
  if (!rolls) {
    try {
      done(await state.guarded(() => api('POST', path, body)));
    } catch (err) {
      alert(err.message);
    }
    return;
  }
  const label = a.kind === 'summon' ? `${g.name}: ${a.name}` : `${g.name}: ${a.spell || a.name}`;
  const damage = a.kind === 'attack' && /^\s*\d+d\d+/i.test(a.damage) ? { label: `${g.name}: ${a.name} damage`, notation: /^\s*(\d+d\d+(?:\s*[+-]\s*\d+)?)/i.exec(a.damage)[1].replace(/\s+/g, '') } : null;
  await roll('', { label, path, body, onServer: done, then: damage });
}

const pages = () => [section('Character details', details()), section('Spells', spells())];

const LAYOUTS = {
  // The official 2014 sheet: three columns, then details and spells.
  classic: () => [
    row('classic', col(core(), passive(), proficiencies()), col(combat(), attacks(), itemActions(), classFeatures(), companions(), equipment()), col(traits(), features())),
    ...pages(),
  ],
  // What you need in a fight across the top.
  combat: () => [
    row('combat', col(combat()), col(attacks(), itemActions(), classFeatures(), companions()), col(equipment())),
    row('stats', col(core(), passive(), proficiencies()), col(traits(), features())),
    ...pages(),
  ],
  // Like the 2024 sheet: each ability holds its saving throw and skills.
  abilities: () => [
    row('vitals', vitals(), hp(), hitDice(), deathSaves()),
    row('abilities',
      col(proficiency(), inspiration(), pointBuyBox(), ...['str', 'dex', 'con'].map((a) => abilityGroup(a)), skillNotes(), passive(), proficiencies()),
      col(...['int', 'wis', 'cha'].map((a) => abilityGroup(a))),
      col(attacks(), itemActions(), classFeatures(), companions(), features()),
      col(traits(), equipment()),
    ),
    ...pages(),
  ],
  // Like the sheets in apps: abilities and vitals across the top, the rest in tabs.
  tabs: () => [
    row('strip', abilityTiles()),
    row('point-buy', pointBuyBox()),
    row('vitals', vitals(), hp(), hitDice(), deathSaves()),
    row('tabs',
      col(proficiency(), inspiration(), saves(), passive(), proficiencies()),
      col(skills()),
      col(tabbed([
        ['actions', 'Actions', () => [attacks(), itemActions(), classFeatures(), companions()]],
        ['spells', 'Spells', spells],
        ['inventory', 'Inventory', equipment],
        ['features', 'Features & traits', features],
        ['background', 'Background', () => [traits(), details()]],
      ])),
    ),
  ],
  // Everything in one scrolling column.
  single: () => [
    row('single', col(core(), passive(), combat(), attacks(), itemActions(), classFeatures(), companions(), equipment(), proficiencies(), traits(), features())),
    ...pages(),
  ],
};

const currentLayout = () => {
  const layout = $('#tab-sheet')?.dataset.sheetLayout;
  return Object.hasOwn(LAYOUTS, layout) ? layout : 'classic';
};

const TAB_KEY = 'dndapp.sheetTab';

/** Tabs: [key, title, build] each. The open tab is remembered in this browser. */
function tabbed(tabs) {
  let current = storage.get(TAB_KEY);
  if (!tabs.some(([key]) => key === current)) current = tabs[0][0];
  const buttons = [];
  const panels = [];
  const select = (key, focus = false) => {
    current = key;
    storage.set(TAB_KEY, key);
    tabs.forEach(([k], i) => {
      buttons[i].setAttribute('aria-selected', String(k === key));
      buttons[i].tabIndex = k === key ? 0 : -1;
      panels[i].hidden = k !== key;
      if (k === key && focus) buttons[i].focus();
    });
  };
  for (const [key, title, build] of tabs) {
    const id = `sheet-tab-${key}`;
    buttons.push(h('button', { type: 'button', role: 'tab', id: `${id}-button`, 'aria-controls': id, onclick: () => select(key) }, title));
    panels.push(h('div', { class: 'sh-tabpanel', role: 'tabpanel', id, 'aria-labelledby': `${id}-button` }, build()));
  }
  const bar = h('div', { class: 'sh-tabbar', role: 'tablist', 'aria-label': 'Sheet sections' }, buttons);
  bar.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = tabs.findIndex(([k]) => k === current);
    select(tabs[(i + step + tabs.length) % tabs.length][0], true);
  });
  select(current);
  return h('div', { class: 'sh-tabs' }, bar, panels);
}

// ---------- the sheet ----------

function render() {
  state.renders = [];
  state.gearDraws = [];
  state.attackDraws = [];
  state.calc = computeSheet(state.sheet, { ...state.settings, edition: editionNow() });
  state.layout = currentLayout();
  $('#sheet').replaceChildren(
    datalist('dl-races', [...RACES, ...MORE_RACES]),
    datalist('dl-classes', Object.values(CLASSES).map((c) => c.name)),
    ...Object.keys(CLASSES).map((key) => datalist(`dl-subclasses-${key}`, subclassNames(key, state.settings?.edition || state.edition || '2014'))),
    datalist('dl-backgrounds', backgroundNames(state)),
    datalist('dl-alignments', ALIGNMENTS),
    datalist('dl-schools', SCHOOLS),
    header(),
    helpPanel({ state, changed, redraw: render }),
    ...LAYOUTS[state.layout](),
  );
  inventoryTab();
  refresh();
}

// ---------- review ----------

/**
 * Review the saved sheet: the server's rules checks, then the AI against the
 * group's books (and the web). Only when the player presses the button: it
 * costs an AI call. Shown above the sheet until closed.
 */
async function reviewSheet() {
  if (!state.sheet) return;
  await flush();
  const button = $('#sheet-review');
  const box = $('#sheet-review-result');
  button.disabled = true;
  box.hidden = false;
  box.replaceChildren(h('p', { class: 'muted' }, 'Reviewing your sheet against the rules and your books… (this can take a minute or two)'));
  try {
    const res = await state.guarded(() => api('POST', `${base()}/sheet/review`));
    if (!res) { box.hidden = true; return; }
    showReview(res);
  } catch (err) {
    box.replaceChildren(h('p', { class: 'error' }, `Couldn't review the sheet: ${err.message}`));
  } finally {
    button.disabled = false;
  }
}

function showReview(res) {
  const box = $('#sheet-review-result');
  const list = (severity) => res.findings.filter((f) => f.severity === severity).map((f) => h('li', {},
    h('strong', {}, `${f.area}: `), f.message, f.source ? h('span', { class: 'source' }, ` (${f.source})`) : null));
  const problems = list('problem');
  const checks = list('check');
  setChildren(box,
    h('header', {},
      h('h3', {}, `Sheet review (${res.edition} rules)`),
      h('button', { type: 'button', class: 'ghost small', onclick: () => { box.hidden = true; } }, 'Close')),
    res.summary ? h('p', {}, res.summary) : null,
    problems.length ? h('h4', {}, 'Against the rules') : null,
    problems.length ? h('ul', { class: 'review-problems' }, problems) : null,
    checks.length ? h('h4', {}, 'Worth checking') : null,
    checks.length ? h('ul', { class: 'review-checks' }, checks) : null,
    !problems.length && !checks.length && res.ai ? h('p', {}, 'Nothing found: the sheet looks valid.') : null,
    res.error ? h('p', { class: 'error' }, res.error) : null,
  );
}

// ---------- upload and download ----------

export function initSheetActions() {
  // A new layout chosen under Look: draw the sheet again in it.
  new MutationObserver(() => state.sheet && currentLayout() !== state.layout && render())
    .observe($('#tab-sheet'), { attributes: true, attributeFilter: ['data-sheet-layout'] });

  const fileInput = $('#sheet-file');
  $('#sheet-upload').addEventListener('click', () => {
    if (state.version && !confirm('Uploading a sheet replaces the one here. Carry on?')) return;
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    await flush();
    const button = $('#sheet-upload');
    button.disabled = true;
    status(`Reading ${file.name}… (this can take a minute)`);
    try {
      const data = await readBase64(file);
      const res = await state.guarded(() => api('POST', `${base()}/sheet/import`, { filename: file.name, data, version: state.version }));
      if (!res) return;
      useSheet(res.sheet, res.version, res.number);
      announce();
      const own = Object.keys(res.sheet.overrides).length;
      status(`Loaded ${file.name}. Check it over${own ? `: ${own} value${own === 1 ? '' : 's'} from your sheet differ from the automatic ones and are marked ↺` : ''}.`);
      if (res.notes) alert(`Notes from reading your sheet:\n\n${res.notes}`);
    } catch (err) {
      status(`Couldn't read that sheet: ${err.message}`, true);
    } finally {
      button.disabled = false;
    }
  });

  $('#sheet-download').addEventListener('click', async () => {
    await flush();
    const file = await state.guarded(() => api('GET', `${base()}/sheet/download`));
    if (!file) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `${(state.sheet.name || 'character').replace(/[^\w -]+/g, '').trim() || 'character'}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  $('#sheet-print').addEventListener('click', () => window.print());

  $('#sheet-review').addEventListener('click', reviewSheet);

  // The Inventory tab's add form: pick a kind (it decides what's suggested), type or pick a name, and Look up
  // shows the item's card (from the PHB tables at once, else the books or the AI) to Add or Cancel.
  const kindPick = $('#gear-kind');
  kindPick.replaceChildren(new Option('Any kind', ''), ...Object.entries(GEAR_KINDS).map(([k, n]) => new Option(n, k)));
  kindPick.value = '';
  const suggest = () => $('#dl-gear').replaceChildren(...itemNames(kindPick.value).map((n) => h('option', { value: n })));
  suggest();
  kindPick.addEventListener('change', suggest);
  $('#gear-add').addEventListener('submit', (e) => {
    e.preventDefault();
    previewGear($('#gear-name').value.trim());
  });
  // Picking a suggestion shows its card straight away (typing a name doesn't, until Look up).
  $('#gear-name').addEventListener('input', (e) => {
    const name = $('#gear-name').value.trim();
    if (e.inputType && e.inputType !== 'insertReplacementText') return;
    if (name && itemNames(kindPick.value).includes(name)) previewGear(name);
  });
  // By hand: the kind chosen first, so the details open with the fields for it (a weapon's damage, armour's AC, what a potion heals).
  $('#gear-own').addEventListener('click', () => {
    if (!state.sheet) return;
    const name = $('#gear-name').value.trim() || prompt('What is it called?')?.trim();
    if (!name) return;
    const kind = kindPick.value || 'other';
    closePreview();
    // An item the app knows the rules for (Bag of Tricks, Wand of Fireballs…) comes with its actions and charges.
    const known = knownItem(name, state.settings?.edition || state.edition || '2014');
    const g = addGear({ name, ...kindFields(kind), ...(known && { actions: known.actions, ...(known.charges && { charges: { ...known.charges, used: 0 } }) }) });
    $('#gear-name').value = '';
    reopen(g);
    gearStatus(`Added ${g.name}. Fill in its details${kind === 'armor' ? ': equip it to set your AC' : kind === 'weapon' ? ': equip it to attack with it' : ''}.`);
  });
  // Advantage and disadvantage without Shift or Alt (phones).
  $('#sheet-status').after(h('div', { class: 'sheet-modes' }, h('span', { class: 'muted small' }, 'Next d20:'), modeButtons({ normal: 'Normal', advantage: 'Adv.', disadvantage: 'Disadv.' })));
}
