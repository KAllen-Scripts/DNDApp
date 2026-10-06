/**
 * The Sheet tab: the player's character sheet, laid out like the official
 * 5e sheet (core stats, then details, then spells).
 *
 * Automatic values come from the shared rules (./shared/sheet.js, the same
 * code the server uses). Anything the player types into an automatic box is
 * kept as their own value (marked, with ↺ to go back to automatic) and is
 * never changed by the rules. Every change is saved to the server shortly
 * after typing stops.
 */
import { api, h } from './api.js';
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

const labelled = (text, control, cls = '') => h('label', { class: `fld ${cls}` }, control, h('span', { class: 'fld-label' }, text));
const box = (title, cls, ...children) => h('section', { class: `sh-box ${cls}` }, title && h('h3', {}, title), ...children);

function datalist(id, options) {
  return h('datalist', { id }, options.map((o) => h('option', { value: o })));
}

// ---------- the sheet ----------

function render() {
  state.renders = [];
  state.calc = computeSheet(state.sheet);
  const root = $('#sheet');
  root.replaceChildren(
    datalist('dl-races', RACES),
    datalist('dl-classes', Object.values(CLASSES).map((c) => c.name)),
    datalist('dl-backgrounds', BACKGROUNDS),
    datalist('dl-alignments', ALIGNMENTS),
    datalist('dl-schools', SCHOOLS),
    header(),
    h('div', { class: 'sh-grid' },
      h('div', { class: 'sh-col' }, abilities()),
      h('div', { class: 'sh-col' }, combat(), attacks(), equipment()),
      h('div', { class: 'sh-col' }, personality(), features()),
    ),
    details(),
    spellcasting(),
  );
  refresh();
}

function header() {
  const classes = h('div', { class: 'classes' });
  const drawClasses = () => {
    classes.replaceChildren(
      ...state.sheet.classes.map((c, i) =>
        h('div', { class: 'class-row' },
          field(`classes.${i}.name`, { label: 'Class', list: 'dl-classes', placeholder: 'Class' }),
          field(`classes.${i}.subclass`, { label: 'Subclass', placeholder: 'Subclass' }),
          field(`classes.${i}.level`, { label: 'Level', kind: 'int', cls: 'num' }),
          state.sheet.classes.length > 1 &&
            h('button', { type: 'button', class: 'ghost icon', title: 'Remove this class', onclick: () => { state.sheet.classes.splice(i, 1); drawClasses(); changed(); } }, '×'),
        ),
      ),
      h('button', { type: 'button', class: 'link', onclick: () => { state.sheet.classes.push({ name: '', subclass: '', level: 1 }); drawClasses(); changed(); } }, '+ Add a class (multiclass)'),
    );
  };
  drawClasses();
  const level = h('span', { class: 'muted small' });
  state.renders.push(() => (level.textContent = `Character level ${state.calc.level}`));
  return h('header', { class: 'sh-head' },
    labelled('Character name', field('name', { label: 'Character name', cls: 'big' }), 'name-fld'),
    h('div', { class: 'sh-head-grid' },
      h('div', { class: 'fld class-fld' }, classes, h('span', { class: 'fld-label' }, 'Class & level · ', level)),
      labelled('Background', field('background', { label: 'Background', list: 'dl-backgrounds' })),
      labelled('Player name', field('player_name', { label: 'Player name' })),
      labelled('Race', field('race', { label: 'Race', list: 'dl-races' })),
      labelled('Alignment', field('alignment', { label: 'Alignment', list: 'dl-alignments' })),
      labelled('Experience points', field('xp', { label: 'Experience points' })),
    ),
  );
}

function abilities() {
  const scores = h('div', { class: 'abilities' },
    ABILITIES.map((a) =>
      h('div', { class: 'ability' },
        h('span', { class: 'ability-name' }, ABILITY_NAMES[a]),
        auto(`mod.${a}`, { kind: 'bonus', label: `${ABILITY_NAMES[a]} modifier`, cls: 'mod' }),
        field(`abilities.${a}`, { label: `${ABILITY_NAMES[a]} score`, kind: 'int', cls: 'score' }),
      ),
    ),
  );
  const insp = h('input', { type: 'checkbox', checked: state.sheet.inspiration, onchange: (e) => { state.sheet.inspiration = e.target.checked; changed(); } });
  const saves = ABILITIES.map((a) =>
    h('li', {}, autoCheck(`save_prof.${a}`, `Proficient in ${ABILITY_NAMES[a]} saves`), auto(`save.${a}`, { kind: 'bonus', label: `${ABILITY_NAMES[a]} save`, cls: 'small-auto' }), h('span', {}, ABILITY_NAMES[a])),
  );
  const skills = Object.entries(SKILLS).map(([k, { name, ability }]) => {
    const marks = { undefined: '○', proficient: '●', expertise: '◆' };
    const titles = { undefined: 'Not proficient', proficient: 'Proficient', expertise: 'Expertise (double proficiency)' };
    const mark = h('button', { type: 'button', class: 'prof-mark' });
    const paint = () => {
      const p = state.sheet.skills[k];
      mark.textContent = marks[p];
      mark.title = `${titles[p]}. Click to change.`;
      mark.setAttribute('aria-label', `${name}: ${titles[p]}`);
    };
    mark.addEventListener('click', () => {
      const next = { undefined: 'proficient', proficient: 'expertise', expertise: undefined }[state.sheet.skills[k]];
      if (next) state.sheet.skills[k] = next;
      else delete state.sheet.skills[k];
      paint();
      changed();
    });
    paint();
    return h('li', {}, mark, auto(`skill.${k}`, { kind: 'bonus', label: name, cls: 'small-auto' }), h('span', {}, name, h('span', { class: 'muted small' }, ` (${ability.charAt(0).toUpperCase() + ability.slice(1)})`)));
  });
  return h('div', { class: 'sh-stats' },
    scores,
    h('div', { class: 'sh-stack' },
      h('div', { class: 'pill-row' }, h('label', { class: 'pill-box' }, insp, h('span', {}, 'Inspiration'))),
      h('div', { class: 'pill-row' }, auto('proficiency_bonus', { kind: 'bonus', label: 'Proficiency bonus', cls: 'small-auto' }), h('span', {}, 'Proficiency bonus')),
      box('Saving throws', 'list-box', h('ul', { class: 'checklist' }, saves)),
      box('Skills', 'list-box', h('ul', { class: 'checklist' }, skills),
        h('p', { class: 'muted small legend' }, '○ none · ● proficient · ◆ expertise'),
        h('div', { class: 'pill-row small-text' }, autoCheck('jack_of_all_trades', 'Jack of All Trades'), h('span', {}, 'Jack of All Trades (half proficiency on other checks)')),
      ),
      h('div', { class: 'pill-row' }, auto('passive_perception', { label: 'Passive Wisdom (Perception)', cls: 'small-auto' }), h('span', {}, 'Passive Wisdom (Perception)')),
      box('Other proficiencies & languages', '', field('proficiencies_languages', { label: 'Other proficiencies and languages', kind: 'longtext', rows: 5 })),
    ),
  );
}

function combat() {
  const deathSaves = (kind, label) =>
    h('div', { class: 'death-row' }, h('span', {}, label),
      [1, 2, 3].map((n) => {
        const b = h('input', { type: 'checkbox', 'aria-label': `${label} ${n}`, checked: state.sheet.death_saves[kind] >= n });
        b.addEventListener('change', () => {
          state.sheet.death_saves[kind] = b.checked ? n : n - 1;
          b.parentElement.querySelectorAll('input').forEach((x, i) => (x.checked = i < state.sheet.death_saves[kind]));
          changed();
        });
        return b;
      }));
  return box(null, 'combat',
    h('div', { class: 'big-three' },
      h('div', { class: 'stat' }, auto('ac', { label: 'Armour class' }), h('span', {}, 'Armour class')),
      h('div', { class: 'stat' }, auto('initiative', { kind: 'bonus', label: 'Initiative' }), h('span', {}, 'Initiative')),
      h('div', { class: 'stat' }, auto('speed', { label: 'Speed (feet)' }), h('span', {}, 'Speed')),
    ),
    h('div', { class: 'hp' },
      h('div', { class: 'hp-max' }, h('span', {}, 'Hit point maximum'), auto('hp_max', { label: 'Hit point maximum', cls: 'small-auto' })),
      labelled('Current hit points', field('hp.current', { label: 'Current hit points', kind: 'int', nullable: true, cls: 'big-num' })),
      labelled('Temporary hit points', field('hp.temp', { label: 'Temporary hit points', kind: 'int', nullable: true, cls: 'num' })),
    ),
    h('div', { class: 'hd-death' },
      h('div', { class: 'hd' },
        h('div', { class: 'pill-row' }, h('span', {}, 'Hit dice'), auto('hit_dice', { kind: 'text', label: 'Hit dice', cls: 'text-auto' })),
        labelled('Used', field('hit_dice_used', { label: 'Hit dice used', kind: 'int', cls: 'num' }), 'inline'),
      ),
      h('div', { class: 'death' }, h('span', { class: 'fld-label' }, 'Death saves'), deathSaves('successes', 'Successes'), deathSaves('failures', 'Failures')),
    ),
  );
}

function attacks() {
  const list = h('div', { class: 'attacks' });
  const draw = () => {
    list.replaceChildren(
      ...(state.sheet.attacks.length ? [h('div', { class: 'attack-row attack-head' }, h('span', {}, 'Name'), h('span', {}, 'Atk bonus'), h('span', {}, 'Damage / type'), h('span', {}))] : []),
      ...state.sheet.attacks.map((_, i) =>
        h('div', { class: 'attack-row' },
          field(`attacks.${i}.name`, { label: 'Attack name' }),
          field(`attacks.${i}.bonus`, { label: 'Attack bonus' }),
          field(`attacks.${i}.damage`, { label: 'Damage and type' }),
          h('button', { type: 'button', class: 'ghost icon', title: 'Remove', onclick: () => { state.sheet.attacks.splice(i, 1); draw(); changed(); } }, '×'),
        ),
      ),
      h('button', { type: 'button', class: 'link', onclick: () => { state.sheet.attacks.push({ name: '', bonus: '', damage: '', notes: '' }); draw(); changed(); } }, '+ Add an attack'),
    );
  };
  draw();
  return box('Attacks & spellcasting', '', list);
}

function equipment() {
  return box('Equipment', '',
    h('div', { class: 'coins' }, ['cp', 'sp', 'ep', 'gp', 'pp'].map((c) => labelled(c.toUpperCase(), field(`coins.${c}`, { label: c.toUpperCase(), kind: 'int', cls: 'num' })))),
    field('equipment', { label: 'Equipment', kind: 'longtext', rows: 8 }),
  );
}

function personality() {
  return h('div', { class: 'traits' },
    ['personality', 'ideals', 'bonds', 'flaws'].map((k) =>
      box({ personality: 'Personality traits', ideals: 'Ideals', bonds: 'Bonds', flaws: 'Flaws' }[k], '', field(k, { label: k, kind: 'longtext', rows: 3 })),
    ),
  );
}

function features() {
  return box('Features & traits', '', field('features', { label: 'Features and traits', kind: 'longtext', rows: 16 }));
}

function details() {
  return h('details', { class: 'sh-section', open: true },
    h('summary', {}, 'Character details'),
    h('div', { class: 'sh-details' },
      h('div', { class: 'looks' }, ['age', 'height', 'weight', 'eyes', 'skin', 'hair'].map((k) => labelled(k.charAt(0).toUpperCase() + k.slice(1), field(k, { label: k })))),
      h('div', { class: 'sh-grid two' },
        box('Character appearance', '', field('appearance', { label: 'Appearance', kind: 'longtext', rows: 6 })),
        box('Allies & organisations', '', field('allies', { label: 'Allies and organisations', kind: 'longtext', rows: 6 })),
        box('Character backstory', '', field('backstory', { label: 'Backstory', kind: 'longtext', rows: 10 })),
        box('Additional features & traits', '', field('additional_features', { label: 'Additional features and traits', kind: 'longtext', rows: 10 })),
        box('Treasure', '', field('treasure', { label: 'Treasure', kind: 'longtext', rows: 4 })),
      ),
    ),
  );
}

// ---------- spells ----------

function spellcasting() {
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

  const slots = h('div', { class: 'slots' },
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
      h('div', { class: 'slot' },
        h('span', { class: 'slot-level' }, LEVEL_NAMES[n].replace(' level', '')),
        h('span', { class: 'fld-label' }, 'Total'),
        auto(`slots.${n}`, { label: `${LEVEL_NAMES[n]} slots`, cls: 'small-auto' }),
        h('span', { class: 'fld-label' }, 'Used'),
        field(`spellcasting.slots_used.${n}`, { label: `${LEVEL_NAMES[n]} slots used`, kind: 'int', nullable: true, cls: 'num' }),
      ),
    ),
  );
  const pact = h('div', { class: 'slot pact' },
    h('span', { class: 'slot-level' }, 'Pact Magic'),
    h('span', { class: 'fld-label' }, 'Slots'),
    auto('pact_slots', { label: 'Pact Magic slots', cls: 'small-auto' }),
    h('span', { class: 'fld-label' }, 'Slot level'),
    auto('pact_level', { label: 'Pact slot level', cls: 'small-auto' }),
    h('span', { class: 'fld-label' }, 'Used'),
    field('spellcasting.pact_used', { label: 'Pact slots used', kind: 'int', cls: 'num' }),
  );
  state.renders.push(() => {
    pact.hidden = !state.calc.values.pact_slots && !('pact_slots' in state.sheet.overrides);
    slots.querySelectorAll('.slot').forEach((el, i) => el.classList.toggle('none', !state.calc.values[`slots.${i + 1}`]));
  });

  const list = h('div', { class: 'spell-list' });
  const drawList = () => list.replaceChildren(...spellGroups(drawList));
  drawList();

  return h('details', { class: 'sh-section', open: true },
    h('summary', {}, 'Spells'),
    h('div', { class: 'spell-head' },
      labelled('Spellcasting class', classPick),
      labelled('Spellcasting ability', abilityWrap),
      h('div', { class: 'stat' }, auto('spell_dc', { label: 'Spell save DC' }), h('span', {}, 'Spell save DC')),
      h('div', { class: 'stat' }, auto('spell_attack', { kind: 'bonus', label: 'Spell attack bonus' }), h('span', {}, 'Spell attack bonus')),
    ),
    slots,
    pact,
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
