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
import { api, fileUrl, h, storage } from './api.js';
import {
  ABILITIES, ABILITY_NAMES, SKILLS, CLASSES, RACES, BACKGROUNDS, ALIGNMENTS, SCHOOLS,
  WEAPONS, computeSheet, coerceDerived, formatBonus, newAttack, normalizeSheet, normalizeSpell, hitDice as hitDiceOf,
} from './shared/sheet.js';
import { d20Plus } from './shared/dice.js';
import { attackRolls, spellRolls } from './shared/rolls.js';
import { roll, rollModeFromEvent, modeButtons, D20_ICON } from './dice.js';

const $ = (sel) => document.querySelector(sel);
const LEVEL_NAMES = ['Cantrips', '1st level', '2nd level', '3rd level', '4th level', '5th level', '6th level', '7th level', '8th level', '9th level'];
const SPELL_DETAILS = ['name', 'level', 'school', 'casting_time', 'range', 'components', 'material', 'duration', 'concentration', 'ritual', 'description', 'higher_levels', 'attack', 'save', 'damage', 'damage_mod', 'higher_damage', 'source', 'source_note'];
const SOURCE_LABELS = { srd: 'SRD', book: 'Your book', ai: 'AI memory', import: 'Your sheet', manual: 'Typed in' };

const state = {
  campaignId: null,
  userId: null,
  pictures: { token: null, picture: null }, // this player's token and full picture: { key, width, height } each
  pictureUrls: new Map(), // picture key -> URL to show it
  unusedDescription: '', // the AI's description of the picture, when it didn't replace the player's own text
  guarded: (fn) => fn(),
  sheet: null,
  version: 0,
  calc: null,
  layout: null, // the layout the sheet was last drawn in
  renders: [], // functions that refresh automatic values
  dirty: false,
  saving: false,
  timer: null,
};

const base = () => `/campaigns/${state.campaignId}`;
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
  Object.assign(state, { campaignId, userId, guarded, dirty: false, unusedDescription: '' });
  const [{ sheet, version }, pictures] = await Promise.all([api('GET', `${base()}/sheet`), api('GET', `${base()}/character/pictures`)]);
  state.pictures = pictures;
  useSheet(sheet, version);
}

// The same sheet can be open in two windows (the map page and a popped-out sheet): each tells the others
// when it saves, and one with nothing waiting to save shows the newer version straight away.
const channel = (() => {
  try { return window.BroadcastChannel ? new window.BroadcastChannel('dndapp.sheet') : null; } catch { return null; }
})();
const announce = () => channel?.postMessage({ campaignId: String(state.campaignId), userId: String(state.userId), version: state.version });
channel?.addEventListener('message', async (e) => {
  const { campaignId, userId, version } = e.data ?? {};
  const newer = () => campaignId === String(state.campaignId) && userId === String(state.userId) && version > state.version;
  // With changes waiting here, saving them meets the newer version and asks which to keep.
  if (!newer() || state.dirty || state.saving) return;
  const res = await state.guarded(() => api('GET', `${base()}/sheet`)).catch(() => null);
  if (res && newer() && !state.dirty && !state.saving) useSheet(res.sheet, res.version);
});

function useSheet(sheet, version) {
  state.sheet = normalizeSheet(sheet);
  state.version = version;
  render();
  status(version ? 'Saved' : 'Not saved yet: fill something in to start');
}

function status(text, error = false) {
  const el = $('#sheet-status');
  el.textContent = text;
  el.classList.toggle('error', error);
}

/** Something changed: update automatic values now, save soon. */
function changed() {
  refresh();
  state.dirty = true;
  status('Saving soon…');
  clearTimeout(state.timer);
  state.timer = setTimeout(save, 800);
}

async function save() {
  clearTimeout(state.timer);
  if (state.saving || !state.dirty) return;
  state.saving = true;
  state.dirty = false;
  status('Saving…');
  try {
    const res = await state.guarded(() => api('PUT', `${base()}/sheet`, { sheet: state.sheet, version: state.version }));
    if (!res) return; // logged out: the login screen is showing
    state.version = res.version;
    announce();
    status(state.dirty ? 'Saving soon…' : 'Saved');
  } catch (err) {
    if (err.status === 409 && err.data?.current) {
      const keepMine = confirm(
        'This sheet was changed in another tab or on another device since you opened it.\n\n' +
          'OK: keep what is on this screen (replaces the other version).\nCancel: load the other version (your recent changes here are dropped).',
      );
      if (keepMine) {
        state.version = err.data.current.version;
        state.dirty = true;
      } else {
        useSheet(err.data.current.sheet, err.data.current.version);
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
  useSheet(res.sheet, res.version);
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

function refresh() {
  state.calc = computeSheet(state.sheet);
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
function auto(key, { kind = 'int', label, cls = '' } = {}) {
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

/** An input bound to a path in the sheet. kind: text | int | longtext */
function field(path, { label, kind = 'text', placeholder = '', list, cls = '', nullable = false, rows = 4, onChange } = {}) {
  const value = getPath(state.sheet, path);
  const el =
    kind === 'longtext'
      ? h('textarea', { rows, placeholder, 'aria-label': label })
      : h('input', { type: 'text', placeholder, 'aria-label': label, inputMode: kind === 'int' ? 'numeric' : 'text', list, autocomplete: 'off' });
  el.value = value ?? '';
  el.className = cls;
  el.addEventListener('input', () => {
    let v = el.value;
    if (kind === 'int') {
      if (v.trim() === '') {
        if (!nullable) return;
        v = null;
      } else {
        v = parseInt(v.replace(/^\s*\+/, ''), 10);
        if (!Number.isFinite(v)) return;
      }
    }
    setPath(state.sheet, path, v);
    onChange?.();
    changed();
  });
  if (kind === 'int') el.addEventListener('blur', () => (el.value = getPath(state.sheet, path) ?? ''));
  return el;
}

/**
 * Round tick boxes counting up to a number kept at `path` (death saves, spell
 * slots used): ticking the third sets 3, unticking it sets 2. `count` is a
 * number or a function, so the boxes follow the automatic slot count.
 */
function pips(path, label, count, max = 20) {
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
const labelled = (text, control, cls = '') => h('label', { class: `fld ${cls}` }, control, lbl(text));
/** A titled box. */
const box = (title, cls, ...children) => h('section', { class: `sh-box ${cls}` }, title && h('h3', {}, title), ...children);
/** A value with its label underneath (armour class, hit points, spell save DC...); the label rolls it if get is given. */
const stat = (control, label, cls = '', get) => h('label', { class: `stat ${cls}` }, control, get ? rollButton(label, get, 'lbl') : lbl(label));
/** A one-line box, lined up with the save and skill lists: a value, then what it is. */
const line = (control, label, cls = '') => h('label', { class: `sh-line ${cls}` }, h('span'), h('span', { class: 'line-val' }, control), lbl(label));
const col = (...blocks) => h('div', { class: 'sh-col' }, blocks);
const row = (name, ...children) => h('div', { class: `sh-row row-${name}` }, children);
const section = (title, ...content) => h('details', { class: 'sh-section', open: true }, h('summary', {}, title), ...content);
const removeButton = (title, onclick) => h('button', { type: 'button', class: 'icon-x', title, 'aria-label': title, onclick }, '×');
const addButton = (text, onclick) => h('button', { type: 'button', class: 'add-row', onclick }, `+ ${text}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A name you click to roll (a save, skill, ability...). get() gives
 * { notation, label, then } at the moment of the click, so it uses the
 * current values. Shift-click: advantage; Alt-click: disadvantage.
 */
function rollButton(content, get, cls = '') {
  const b = h('button', { type: 'button', class: `roll-name ${cls}`, title: 'Click to roll (Shift: advantage, Alt: disadvantage)' }, content);
  b.addEventListener('click', (e) => {
    const r = get();
    roll(r.notation, { label: r.label, mode: rollModeFromEvent(e), then: r.then, initiative: r.initiative });
  });
  return b;
}
/** A d20 plus an automatic value: "Stealth" → 1d20+2. */
const check = (key, label) => () => ({ notation: d20Plus(state.calc.values[key]), label });

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
    h('section', { class: 'sh-box name-box' }, field('name', { label: 'Character name', cls: 'big' }), lbl('Character name'), summary),
    infoBox(),
  );
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
          field(`classes.${i}.subclass`, { label: 'Subclass' }),
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
  return h('section', { class: 'sh-box info-box' },
    classes,
    h('div', { class: 'info-grid' },
      labelled('Background', field('background', { label: 'Background', list: 'dl-backgrounds' })),
      labelled('Race', field('race', { label: 'Race', list: 'dl-races' })),
      labelled('Alignment', field('alignment', { label: 'Alignment', list: 'dl-alignments' })),
      labelled('Player name', field('player_name', { label: 'Player name' })),
      labelled('Experience points', field('xp', { label: 'Experience points' })),
      labelled('Character level', level),
    ),
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
        rollButton(ABILITY_NAMES[a], check(`mod.${a}`, `${ABILITY_NAMES[a]} check`), 'lbl'),
        auto(`mod.${a}`, { kind: 'bonus', label: `${ABILITY_NAMES[a]} modifier`, cls: 'mod' }),
        field(`abilities.${a}`, { label: `${ABILITY_NAMES[a]} score`, kind: 'int', cls: 'score' }),
      ),
    ),
  );
}

/** One ability with its saving throw and skills underneath (like the 2024 sheet). */
function abilityGroup(a) {
  const score = field(`abilities.${a}`, { label: `${ABILITY_NAMES[a]} score`, kind: 'int', cls: 'score' });
  score.title = 'Score';
  return h('section', { class: 'sh-box ability-group' },
    h('div', { class: 'ability-head' },
      h('h3', {}, rollButton(ABILITY_NAMES[a], check(`mod.${a}`, `${ABILITY_NAMES[a]} check`))),
      auto(`mod.${a}`, { kind: 'bonus', label: `${ABILITY_NAMES[a]} modifier`, cls: 'mod' }),
      score,
    ),
    h('ul', { class: 'checklist' }, saveRow(a, 'Saving throw'), SKILLS_BY_ABILITY[a].map((k) => skillRow(k, false))),
  );
}

function saveRow(a, name = ABILITY_NAMES[a]) {
  return h('li', {},
    autoCheck(`save_prof.${a}`, `Proficient in ${ABILITY_NAMES[a]} saves`),
    auto(`save.${a}`, { kind: 'bonus', label: `${ABILITY_NAMES[a]} save` }),
    rollButton(name, check(`save.${a}`, `${ABILITY_NAMES[a]} save`), 'row-name'),
  );
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
    rollButton([name, withAbility && h('span', { class: 'muted small' }, ` (${cap(ability)})`)], check(`skill.${k}`, name), 'row-name'),
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
const core = () => h('div', { class: 'core' }, abilityTiles(), h('div', { class: 'core-stack' }, inspiration(), proficiency(), saves(), skills()));

// Combat.

const vitals = () =>
  h('div', { class: 'vitals' },
    stat(auto('ac', { label: 'Armour class' }), 'Armour class', 'big'),
    stat(auto('initiative', { kind: 'bonus', label: 'Initiative' }), 'Initiative', 'big', () => ({ ...check('initiative', 'Initiative')(), initiative: true })),
    stat(auto('speed', { label: 'Speed (feet)' }), 'Speed', 'big'),
  );

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
    h('button', { type: 'button', class: 'ghost hd-short-rest', title: 'Warlocks get their Pact Magic slots back; spend hit dice to heal', onclick: takeShortRest }, 'Short rest'),
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
      useSheet(res.sheet, res.version);
      announce();
      status(`Spent a d${die} hit die: ${res.healed ? `regained ${res.healed} hit point${res.healed === 1 ? '' : 's'}` : 'no hit points regained'}.`);
    },
  });
}

async function takeShortRest() {
  await flush();
  try {
    const res = await state.guarded(() => api('POST', `${base()}/sheet/short-rest`));
    if (!res) return;
    useSheet(res.sheet, res.version);
    announce();
    status(`Short rest taken${state.calc.values.pact_slots ? ': Pact Magic slots are back' : ''}. Spend hit dice to heal.`);
  } catch (err) {
    status(`Couldn't take a short rest: ${err.message}`, true);
  }
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
  if (!res || state.dirty || res.version <= state.version) return;
  useSheet(res.sheet, res.version);
  announce();
  status(rest.kind === 'long' ? 'The DM called a long rest: your sheet is updated.' : 'The DM called a short rest: spend hit dice to heal.');
}

const deathSaves = () =>
  box('Death saves', 'death',
    h('div', { class: 'ds' },
      ['successes', 'failures'].map((kind) => h('div', { class: `ds-row ds-${kind}` }, h('span', {}, cap(kind)), pips(`death_saves.${kind}`, cap(kind), 3))),
    ),
    h('button', { type: 'button', class: 'ghost ds-roll', onclick: (e) => roll('1d20', { label: 'Death save', mode: rollModeFromEvent(e) }) }, 'Roll a death save'),
  );

const combat = () => h('div', { class: 'combat' }, vitals(), hp(), h('div', { class: 'pair' }, hitDice(), deathSaves()));

function attacks() {
  const list = h('div', { class: 'sh-table attacks' });
  const draw = () => {
    list.replaceChildren(
      ...(state.sheet.attacks.length ? [h('div', { class: 'tr th' }, lbl('Name'), lbl('To hit / DC'), lbl('Damage / type'), h('span'), h('span'), h('span'))] : []),
      ...state.sheet.attacks.map((_, i) => attackRow(i, draw)),
      addButton('Add an attack', () => { state.sheet.attacks.push(newAttack()); draw(); changed(); }),
    );
  };
  draw();
  return box('Attacks & spellcasting', 'attacks-box', list, datalist('dl-weapons', Object.values(WEAPONS).map((w) => w.name)));
}

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
  const name = field(`${p}.name`, { label: 'Attack name', placeholder: 'Name', list: 'dl-weapons', onChange: () => {
    // A weapon from the book fills in its damage and ability, when they're still empty.
    const w = WEAPONS[a.name.trim().toLowerCase()];
    if (w && !save && !a.damage.trim()) {
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
      : h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: a.proficient, 'aria-label': 'Proficient', onchange: (e) => { a.proficient = e.target.checked; changed(); } }), 'Proficient'),
    labelled('Magic', field(`${p}.magic`, { label: 'Magic bonus', kind: 'int', cls: 'num' }), 'inline'),
    sum,
  );
  const paint = () => {
    const r = attackRolls(a, state.calc);
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
    const r = attackRolls(a, state.calc);
    const title = a.name.trim() || 'Attack';
    roll(r.hit, { label: `${title}: to hit`, mode: rollModeFromEvent(e), then: r.damage && { label: `${title}: damage`, notation: r.damage } });
  });
  const damage = h('button', { type: 'button', class: 'icon-roll dmg-roll', title: 'Roll damage', 'aria-label': 'Roll damage' }, 'Dmg');
  damage.addEventListener('click', () => {
    const r = attackRolls(a, state.calc);
    const title = a.name.trim() || 'Attack';
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
  );
  if (state.calc) paint();
  return row;
}

// Everything else.

const COIN_NAMES = { cp: 'Copper', sp: 'Silver', ep: 'Electrum', gp: 'Gold', pp: 'Platinum' };
const equipment = () =>
  box('Equipment', 'equipment',
    h('div', { class: 'coins' }, Object.entries(COIN_NAMES).map(([c, name]) => labelled(c.toUpperCase(), field(`coins.${c}`, { label: `${name} pieces`, kind: 'int' })))),
    field('equipment', { label: 'Equipment', kind: 'longtext', rows: 8 }),
  );

/** A box that's just a titled text area. */
const text = (key, title, rows, cls = '') => box(title, cls, field(key, { label: title, kind: 'longtext', rows }));

const TRAITS = { personality: 'Personality traits', ideals: 'Ideals', bonds: 'Bonds', flaws: 'Flaws' };
const traits = () => h('div', { class: 'traits' }, Object.entries(TRAITS).map(([k, title]) => text(k, title, 3)));
const features = () => text('features', 'Features & traits', 12);
const proficiencies = () => text('proficiencies_languages', 'Other proficiencies & languages', 5);

function details() {
  return h('div', { class: 'sh-details' },
    h('section', { class: 'sh-box looks' }, ['age', 'height', 'weight', 'eyes', 'skin', 'hair'].map((k) => labelled(cap(k), field(k, { label: cap(k) })))),
    h('div', { class: 'details-grid' },
      pictures(),
      text('appearance', 'Character appearance', 5, 'd-appearance'),
      text('backstory', 'Character backstory', 12, 'd-backstory'),
      text('allies', 'Allies & organisations', 5, 'd-allies'),
      text('treasure', 'Treasure', 4, 'd-treasure'),
      text('additional_features', 'Additional features & traits', 5, 'd-additional'),
    ),
  );
}

// Pictures of the character: the token that stands for them on maps (everyone
// in the campaign sees it there), and a full picture (only theirs) that the
// AI describes into the Appearance box.

const readBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

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
    el.replaceChildren(
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
    useSheet(res.sheet.sheet, res.sheet.version);
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

const pages = () => [section('Character details', details()), section('Spells', spells())];

const LAYOUTS = {
  // The official 2014 sheet: three columns, then details and spells.
  classic: () => [
    row('classic', col(core(), passive(), proficiencies()), col(combat(), attacks(), equipment()), col(traits(), features())),
    ...pages(),
  ],
  // What you need in a fight across the top.
  combat: () => [
    row('combat', col(combat()), col(attacks()), col(equipment())),
    row('stats', col(core(), passive(), proficiencies()), col(traits(), features())),
    ...pages(),
  ],
  // Like the 2024 sheet: each ability holds its saving throw and skills.
  abilities: () => [
    row('vitals', vitals(), hp(), hitDice(), deathSaves()),
    row('abilities',
      col(proficiency(), inspiration(), ...['str', 'dex', 'con'].map((a) => abilityGroup(a)), skillNotes(), passive(), proficiencies()),
      col(...['int', 'wis', 'cha'].map((a) => abilityGroup(a))),
      col(attacks(), features()),
      col(traits(), equipment()),
    ),
    ...pages(),
  ],
  // Like the sheets in apps: abilities and vitals across the top, the rest in tabs.
  tabs: () => [
    row('strip', abilityTiles()),
    row('vitals', vitals(), hp(), hitDice(), deathSaves()),
    row('tabs',
      col(proficiency(), inspiration(), saves(), passive(), proficiencies()),
      col(skills()),
      col(tabbed([
        ['actions', 'Actions', attacks],
        ['spells', 'Spells', spells],
        ['inventory', 'Inventory', equipment],
        ['features', 'Features & traits', features],
        ['background', 'Background', () => [traits(), details()]],
      ])),
    ),
  ],
  // Everything in one scrolling column.
  single: () => [
    row('single', col(core(), passive(), combat(), attacks(), equipment(), proficiencies(), traits(), features())),
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
  state.calc = computeSheet(state.sheet);
  state.layout = currentLayout();
  $('#sheet').replaceChildren(
    datalist('dl-races', RACES),
    datalist('dl-classes', Object.values(CLASSES).map((c) => c.name)),
    datalist('dl-backgrounds', BACKGROUNDS),
    datalist('dl-alignments', ALIGNMENTS),
    datalist('dl-schools', SCHOOLS),
    header(),
    ...LAYOUTS[state.layout](),
  );
  refresh();
}

// ---------- spells ----------

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

function spells() {
  const classPick = h('select', { 'aria-label': 'Spellcasting class' });
  const paintClassPick = () => {
    const names = [...new Set(state.sheet.classes.map((c) => c.name.trim()).filter(Boolean))];
    const current = state.sheet.spellcasting.class;
    const first = state.calc.casters[0]?.name;
    classPick.replaceChildren(
      new Option(first ? `Automatic (${first})` : 'Automatic', ''),
      ...names.map((n) => new Option(n, n)),
      ...(current && !names.includes(current) ? [new Option(current, current)] : []),
    );
    classPick.value = current;
  };
  classPick.addEventListener('change', () => { state.sheet.spellcasting.class = classPick.value; changed(); });
  state.renders.push(() => document.activeElement !== classPick && paintClassPick());

  const abilityPick = h('select', { 'aria-label': 'Spellcasting ability' }, new Option('', ''), ABILITIES.map((a) => new Option(ABILITY_NAMES[a], a)));
  const abilityReset = h('button', { type: 'button', class: 'reset', hidden: true, onclick: () => { delete state.sheet.overrides.spell_ability; changed(); } }, '↺');
  abilityPick.addEventListener('change', () => { state.sheet.overrides.spell_ability = abilityPick.value; changed(); });
  const abilityWrap = h('span', { class: 'auto-select' }, abilityPick, abilityReset);
  state.renders.push(() => {
    const mine = 'spell_ability' in state.sheet.overrides;
    abilityPick.value = state.calc.values.spell_ability ?? '';
    abilityWrap.classList.toggle('mine', mine);
    abilityReset.hidden = !mine;
    abilityReset.title = 'You chose this yourself. Click to use the automatic one.';
  });

  const slotTile = (n) => {
    const tile = h('div', { class: 'slot' },
      h('span', { class: 'slot-level' }, ORDINALS[n]),
      auto(`slots.${n}`, { label: `${LEVEL_NAMES[n]} slots` }),
      pips(`spellcasting.slots_used.${n}`, `${LEVEL_NAMES[n]} slot used`, () => state.calc.values[`slots.${n}`]),
    );
    state.renders.push(() => tile.classList.toggle('none', !state.calc.values[`slots.${n}`]));
    return tile;
  };
  const pact = h('div', { class: 'slot pact' },
    h('span', { class: 'slot-level' }, 'Pact magic'),
    h('div', { class: 'pact-nums' }, stat(auto('pact_slots', { label: 'Pact Magic slots' }), 'Slots'), stat(auto('pact_level', { label: 'Pact slot level' }), 'Slot level')),
    pips('spellcasting.pact_used', 'Pact slot used', () => state.calc.values.pact_slots, 10),
  );
  state.renders.push(() => (pact.hidden = !state.calc.values.pact_slots && !('pact_slots' in state.sheet.overrides)));

  const list = h('div', { class: 'spell-list' });
  const drawList = () => list.replaceChildren(...spellGroups(drawList));
  drawList();

  return h('div', { class: 'sh-spells' },
    h('div', { class: 'spell-head' },
      stat(classPick, 'Spellcasting class', 'pick'),
      stat(abilityWrap, 'Spellcasting ability', 'pick'),
      stat(auto('spell_dc', { label: 'Spell save DC' }), 'Spell save DC', 'big'),
      stat(auto('spell_attack', { kind: 'bonus', label: 'Spell attack bonus' }), 'Spell attack bonus', 'big', check('spell_attack', 'Spell attack')),
    ),
    h('div', { class: 'slots' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(slotTile), pact),
    h('p', { class: 'muted small slot-help' }, 'Slots per long rest are worked out for you (type a number to change one). Tick a circle when you use a slot.'),
    addSpell(drawList),
    list,
  );
}

function addSpell(drawList) {
  const input = h('input', { type: 'text', placeholder: 'Spell name, e.g. Shield', list: 'dl-spells', autocomplete: 'off', 'aria-label': 'Spell to add' });
  const suggestions = h('datalist', { id: 'dl-spells' });
  const note = h('span', { class: 'muted small' });
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) return;
      const names = await state.guarded(() => api('GET', `${base()}/spells?q=${encodeURIComponent(q)}`)).catch(() => []);
      suggestions.replaceChildren(...(names ?? []).map((s) => h('option', { value: s.name }, s.source === 'book' ? `${s.name} (${s.book})` : s.name)));
    }, 200);
  });
  const add = async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    const spell = normalizeSpell({ name, source: 'manual' });
    state.sheet.spells.push(spell);
    input.value = '';
    changed();
    drawList();
    note.textContent = `Looking up ${name}…`;
    note.textContent = (await lookupInto(spell)) ? '' : `Couldn't find details for ${name}. Type them in below.`;
    drawList();
  };
  const unfilled = () => state.sheet.spells.filter((s) => !s.description.trim());
  const fill = h('button', { type: 'button', class: 'ghost', onclick: async () => {
    const todo = unfilled();
    for (const [i, s] of todo.entries()) {
      note.textContent = `Looking up ${s.name} (${i + 1} of ${todo.length})…`;
      await lookupInto(s);
      drawList();
    }
    note.textContent = unfilled().length ? `Couldn't find: ${unfilled().map((s) => s.name).join(', ')}.` : 'Done.';
  } }, 'Fill in missing details');
  state.renders.push(() => {
    const n = unfilled().length;
    fill.hidden = !n;
    fill.textContent = `Fill in missing details (${n})`;
  });
  return h('form', { class: 'add-spell', onsubmit: add }, suggestions, input, h('button', { type: 'submit', class: 'primary' }, 'Add spell'), fill, note);
}

/**
 * Fill a spell's details from the server (SRD, the group's books, or the AI).
 * Only called when the player asks (adding a spell, "Look up", "Fill in"),
 * so typed details are never replaced without them knowing.
 */
async function lookupInto(spell) {
  try {
    const found = await state.guarded(() => api('GET', `${base()}/spells/lookup?name=${encodeURIComponent(spell.name)}`));
    if (!found) return false;
    for (const k of SPELL_DETAILS) spell[k] = found[k];
    changed();
    return true;
  } catch (err) {
    if (err.status !== 404) alert(`Couldn't look up ${spell.name}: ${err.message}`);
    return false;
  }
}

function spellGroups(drawList) {
  const spells = state.sheet.spells;
  if (!spells.length) return [h('p', { class: 'muted' }, 'No spells yet. Add one above: its details are filled in from the SRD, your books, or the AI, and you can change anything.')];
  const groups = new Map();
  for (const s of [...spells].sort((a, b) => (a.level ?? 99) - (b.level ?? 99) || a.name.localeCompare(b.name))) {
    const key = s.level ?? 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups].map(([level, list]) =>
    h('section', { class: 'spell-group' },
      h('h4', {}, level === 'unknown' ? 'Level not set' : LEVEL_NAMES[level], level !== 0 && level !== 'unknown' ? h('span', { class: 'muted small' }, ` · ${list.filter((s) => s.prepared).length} prepared`) : null),
      list.map((s) => spellCard(s, drawList)),
    ),
  );
}

function spellCard(spell, drawList) {
  const path = () => `spells.${state.sheet.spells.indexOf(spell)}`;
  const meta = [spell.casting_time, spell.range, spell.duration].filter(Boolean).join(' · ');
  const tags = [spell.concentration && 'C', spell.ritual && 'R'].filter(Boolean);
  const prepared = h('input', { type: 'checkbox', checked: spell.prepared, title: 'Prepared', 'aria-label': `${spell.name} prepared`, onclick: (e) => e.stopPropagation() });
  prepared.addEventListener('change', () => { spell.prepared = prepared.checked; changed(); });
  const body = h('div', { class: 'spell-body' });
  const card = h('details', { class: 'spell' },
    h('summary', {},
      spell.level ? prepared : h('span', { class: 'prep-space' }),
      h('strong', {}, spell.name),
      tags.length ? h('span', { class: 'tags' }, tags.map((t) => h('span', { class: 'tag', title: t === 'C' ? 'Concentration' : 'Ritual' }, t))) : null,
      h('span', { class: 'muted small spell-meta' }, meta),
      spellRollButtons(spell),
      h('span', { class: `source source-${spell.source}`, title: spell.source_note }, SOURCE_LABELS[spell.source] ?? ''),
    ),
    body,
  );
  card.__spell = spell;
  // Fields are built when opened, so a long list stays light.
  card.addEventListener('toggle', () => {
    if (!card.open || body.childElementCount) return;
    const p = path();
    const levelPick = h('select', { 'aria-label': 'Spell level' }, new Option('Not set', ''), LEVEL_NAMES.map((n, i) => new Option(i === 0 ? 'Cantrip' : n, i)));
    levelPick.value = spell.level ?? '';
    levelPick.addEventListener('change', () => { spell.level = levelPick.value === '' ? null : Number(levelPick.value); changed(); drawList(); });
    const flag = (k, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: spell[k], onchange: (e) => { spell[k] = e.target.checked; changed(); } }), label);
    body.append(
      h('div', { class: 'spell-fields' },
        labelled('Name', field(`${p}.name`, { label: 'Spell name' })),
        labelled('Level', levelPick),
        labelled('School', field(`${p}.school`, { label: 'School', list: 'dl-schools' })),
        labelled('Casting time', field(`${p}.casting_time`, { label: 'Casting time' })),
        labelled('Range', field(`${p}.range`, { label: 'Range' })),
        labelled('Components', field(`${p}.components`, { label: 'Components' })),
        labelled('Duration', field(`${p}.duration`, { label: 'Duration' })),
        labelled('Material', field(`${p}.material`, { label: 'Material component' }), 'wide'),
        h('div', { class: 'flags' }, flag('concentration', 'Concentration'), flag('ritual', 'Ritual')),
      ),
      labelled('Description', field(`${p}.description`, { label: 'Description', kind: 'longtext', rows: 8 }), 'wide'),
      labelled('At higher levels', field(`${p}.higher_levels`, { label: 'At higher levels', kind: 'longtext', rows: 2 }), 'wide'),
      spellRollFields(spell, p),
      h('p', { class: 'muted small' }, spell.source_note ? `Source: ${spell.source_note}` : ''),
      h('div', { class: 'spell-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: async (e) => {
          if (spell.description.trim() && !confirm(`Replace the details of ${spell.name} with the looked-up ones? What's written now will be lost.`)) return;
          e.target.disabled = true;
          e.target.textContent = 'Looking up…';
          if (!(await lookupInto(spell))) alert(`Couldn't find details for "${spell.name}".`);
          drawList();
        } }, 'Look up details'),
        h('button', { type: 'button', class: 'ghost danger', onclick: () => {
          if (!confirm(`Remove ${spell.name} from your sheet?`)) return;
          state.sheet.spells.splice(state.sheet.spells.indexOf(spell), 1);
          changed();
          drawList();
        } }, 'Remove spell'),
      ),
    );
    // Typing in these fields only changes the sheet; the summary refreshes when the list is redrawn.
    body.addEventListener('focusout', () => setTimeout(() => !card.contains(document.activeElement) && refreshSummary(card, spell)));
  });
  return card;
}

/**
 * A spell's roll buttons in its row: to hit (a spell attack, then its damage
 * offered) and damage (or healing), with the slot it's cast with for spells
 * that do more when cast higher.
 */
function spellRollButtons(spell) {
  const wrap = h('span', { class: 'spell-rolls' });
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  const draw = () => {
    wrap.replaceChildren();
    if (!spell.attack && !spell.damage.trim()) return;
    const upcast = spell.level >= 1 && spell.higher_damage.trim();
    const slot = upcast ? h('select', { 'aria-label': `${spell.name} slot level`, title: 'Cast with a slot of this level', onclick: (e) => e.stopPropagation() }, Array.from({ length: 10 - spell.level }, (_, k) => new Option(ORDINALS[spell.level + k], spell.level + k))) : null;
    const rolls = () => spellRolls(spell, state.calc, slot ? Number(slot.value) : spell.level);
    const at = () => (slot && Number(slot.value) > spell.level ? ` at ${ORDINALS[slot.value]} level` : '');
    const heal = /heal/i.test(spell.damage);
    if (spell.attack === 'attack') {
      const hit = h('button', { type: 'button', class: 'icon-roll', title: 'Spell attack (Shift: advantage, Alt: disadvantage)', 'aria-label': `Roll ${spell.name} to hit` });
      hit.innerHTML = D20_ICON;
      hit.addEventListener('click', (e) => {
        stop(e);
        const r = rolls();
        roll(r.hit, { label: `${spell.name}: to hit`, mode: rollModeFromEvent(e), then: r.damage && { label: `${spell.name}: damage${at()}`, notation: r.damage } });
      });
      wrap.append(hit);
    } else if (spell.attack === 'save') {
      const r = rolls();
      wrap.append(h('span', { class: 'muted small spell-dc', title: 'Targets make this saving throw' }, `DC ${r.dc ?? '?'}${r.save ? ` ${cap(r.save)}` : ''}`));
    }
    if (spell.damage.trim()) {
      if (slot) wrap.append(slot);
      wrap.append(h('button', { type: 'button', class: 'icon-roll dmg-roll', title: heal ? 'Roll healing' : 'Roll damage', 'aria-label': `Roll ${spell.name} ${heal ? 'healing' : 'damage'}`, onclick: (e) => {
        stop(e);
        const r = rolls();
        if (!r.damage) return alert(`Type the dice for ${spell.name} first, like 8d6 fire.`);
        const dc = r.kind === 'save' ? ` (DC ${r.dc}${r.save ? ` ${cap(r.save)}` : ''} save)` : '';
        roll(r.damage, { label: `${spell.name}: ${heal ? 'healing' : 'damage'}${at()}${dc}` });
      } }, heal ? 'Heal' : 'Dmg'));
    }
  };
  draw();
  wrap.redraw = draw;
  return wrap;
}

/** How a spell rolls, in its details: read from its description, and the player can change it. */
function spellRollFields(spell, p) {
  const select = (key, label, options) => {
    const el = h('select', { 'aria-label': label }, Object.entries(options).map(([v, n]) => new Option(n, v)));
    el.value = spell[key];
    el.addEventListener('change', () => { spell[key] = el.value; changed(); paintSave(); redrawRolls(spell); });
    return el;
  };
  const saveBox = labelled('Save', select('save', 'Spell saving throw', { '': '–', ...ABILITY_NAMES }));
  const paintSave = () => (saveBox.hidden = spell.attack !== 'save');
  paintSave();
  return h('div', { class: 'spell-fields spell-roll-fields' },
    labelled('Roll', select('attack', 'Spell roll', { '': 'No attack or save', attack: 'Spell attack', save: 'Saving throw' })),
    saveBox,
    labelled('Damage / healing', field(`${p}.damage`, { label: 'Spell damage', placeholder: 'e.g. 8d6 fire', onChange: () => redrawRolls(spell) })),
    labelled(spell.level === 0 ? 'More at 5th/11th/17th' : 'More per slot level', field(`${p}.higher_damage`, { label: 'More damage when cast higher', placeholder: 'e.g. 1d6', onChange: () => redrawRolls(spell) })),
    h('div', { class: 'flags' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: spell.damage_mod, 'aria-label': 'Add spellcasting modifier', onchange: (e) => { spell.damage_mod = e.target.checked; changed(); } }), `+ spellcasting modifier`)),
  );
}

/** Redraw a spell's roll buttons after its damage changed (without closing its details). */
function redrawRolls(spell) {
  for (const card of document.querySelectorAll('#sheet details.spell')) {
    if (card.__spell === spell) card.querySelector('.spell-rolls')?.redraw();
  }
}

function refreshSummary(card, spell) {
  card.querySelector('summary strong').textContent = spell.name;
  card.querySelector('.spell-meta').textContent = [spell.casting_time, spell.range, spell.duration].filter(Boolean).join(' · ');
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
      useSheet(res.sheet, res.version);
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
  // Advantage and disadvantage without Shift or Alt (phones).
  $('#sheet-status').after(h('div', { class: 'sheet-modes' }, h('span', { class: 'muted small' }, 'Next d20:'), modeButtons({ normal: 'Normal', advantage: 'Adv.', disadvantage: 'Disadv.' })));
}
