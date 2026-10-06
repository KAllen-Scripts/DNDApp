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
import { api, h, storage } from './api.js';
import {
  ABILITIES, ABILITY_NAMES, SKILLS, CLASSES, RACES, BACKGROUNDS, ALIGNMENTS, SCHOOLS,
  computeSheet, coerceDerived, formatBonus, normalizeSheet, normalizeSpell,
} from './shared/sheet.js';

const $ = (sel) => document.querySelector(sel);
const LEVEL_NAMES = ['Cantrips', '1st level', '2nd level', '3rd level', '4th level', '5th level', '6th level', '7th level', '8th level', '9th level'];
const SPELL_DETAILS = ['name', 'level', 'school', 'casting_time', 'range', 'components', 'material', 'duration', 'concentration', 'ritual', 'description', 'higher_levels', 'source', 'source_note'];
const SOURCE_LABELS = { srd: 'SRD', book: 'Your book', ai: 'AI memory', import: 'Your sheet', manual: 'Typed in' };

const state = {
  campaignId: null,
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
export async function loadSheet({ campaignId, guarded }) {
  await flush();
  Object.assign(state, { campaignId, guarded, dirty: false });
  const { sheet, version } = await api('GET', `${base()}/sheet`);
  useSheet(sheet, version);
}

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
/** A value with its label underneath (armour class, hit points, spell save DC...). */
const stat = (control, label, cls = '') => h('label', { class: `stat ${cls}` }, control, lbl(label));
/** A one-line box, lined up with the save and skill lists: a value, then what it is. */
const line = (control, label, cls = '') => h('label', { class: `sh-line ${cls}` }, h('span'), h('span', { class: 'line-val' }, control), lbl(label));
const col = (...blocks) => h('div', { class: 'sh-col' }, blocks);
const row = (name, ...children) => h('div', { class: `sh-row row-${name}` }, children);
const section = (title, ...content) => h('details', { class: 'sh-section', open: true }, h('summary', {}, title), ...content);
const removeButton = (title, onclick) => h('button', { type: 'button', class: 'icon-x', title, 'aria-label': title, onclick }, '×');
const addButton = (text, onclick) => h('button', { type: 'button', class: 'add-row', onclick }, `+ ${text}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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
        lbl(ABILITY_NAMES[a]),
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
      h('h3', {}, ABILITY_NAMES[a]),
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
    h('span', { class: 'row-name' }, name),
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
    h('span', { class: 'row-name' }, name, withAbility && h('span', { class: 'muted small' }, ` (${cap(ability)})`)),
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
    stat(auto('initiative', { kind: 'bonus', label: 'Initiative' }), 'Initiative', 'big'),
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

const hitDice = () =>
  box('Hit dice', 'hd',
    h('div', { class: 'tiles' },
      stat(auto('hit_dice', { kind: 'text', label: 'Hit dice' }), 'Total'),
      stat(field('hit_dice_used', { label: 'Hit dice used', kind: 'int' }), 'Used'),
    ),
  );

const deathSaves = () =>
  box('Death saves', 'death',
    h('div', { class: 'ds' },
      ['successes', 'failures'].map((kind) => h('div', { class: `ds-row ds-${kind}` }, h('span', {}, cap(kind)), pips(`death_saves.${kind}`, cap(kind), 3))),
    ),
  );

const combat = () => h('div', { class: 'combat' }, vitals(), hp(), h('div', { class: 'pair' }, hitDice(), deathSaves()));

function attacks() {
  const list = h('div', { class: 'sh-table attacks' });
  const draw = () => {
    list.replaceChildren(
      ...(state.sheet.attacks.length ? [h('div', { class: 'tr th' }, lbl('Name'), lbl('Atk bonus'), lbl('Damage / type'), h('span'))] : []),
      ...state.sheet.attacks.map((_, i) =>
        h('div', { class: 'tr' },
          field(`attacks.${i}.name`, { label: 'Attack name', placeholder: 'Name' }),
          field(`attacks.${i}.bonus`, { label: 'Attack bonus', placeholder: '+0', cls: 'num' }),
          field(`attacks.${i}.damage`, { label: 'Damage and type', placeholder: 'Damage / type' }),
          removeButton('Remove this attack', () => { state.sheet.attacks.splice(i, 1); draw(); changed(); }),
        ),
      ),
      addButton('Add an attack', () => { state.sheet.attacks.push({ name: '', bonus: '', damage: '', notes: '' }); draw(); changed(); }),
    );
  };
  draw();
  return box('Attacks & spellcasting', 'attacks-box', list);
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
      text('appearance', 'Character appearance', 5, 'd-appearance'),
      text('backstory', 'Character backstory', 12, 'd-backstory'),
      text('allies', 'Allies & organisations', 5, 'd-allies'),
      text('treasure', 'Treasure', 4, 'd-treasure'),
      text('additional_features', 'Additional features & traits', 5, 'd-additional'),
    ),
  );
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
      stat(auto('spell_attack', { kind: 'bonus', label: 'Spell attack bonus' }), 'Spell attack bonus', 'big'),
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
      h('span', { class: `source source-${spell.source}`, title: spell.source_note }, SOURCE_LABELS[spell.source] ?? ''),
    ),
    body,
  );
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
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await state.guarded(() => api('POST', `${base()}/sheet/import`, { filename: file.name, data, version: state.version }));
      if (!res) return;
      useSheet(res.sheet, res.version);
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
}
