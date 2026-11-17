/**
 * The sheet's header (the 2026-11 redesign, Option A): always at the top of the sheet, and kept in view
 * while the rest scrolls. The character (picture, name, race and classes), hit points with Damage, Heal
 * and Temp, AC, initiative, speed, proficiency, spell save DC, inspiration, conditions, exhaustion and
 * concentration, Rest (a panel saying what comes back, with hit dice to spend) and the Edit switch.
 * Death saves show here while the character is at 0 hit points.
 *
 * sheet.js owns the sheet and passes in what this needs (ctx), as with the other boxes.
 */
import { h } from '../page/dom.js';
import { storage } from '../page/api.js';
import { featureRows } from '/shared/class-features.js';
import { shortRest, longRest, formatBonus } from '/shared/sheet.js';
import { CONDITION_NAMES, CONDITION_TEXT, EXHAUSTION_2014, SHEET_CONDITIONS, changeHp } from '/shared/conditions.js';

const MODE_KEY = 'dndapp.sheetMode';
/** Whether the Rest panel is open: kept while the sheet redraws (spending a hit die redraws it). */
let restOpen = false;

/**
 * Play or Edit. Play: worked-out numbers, scores and the character's details are shown, not typed into
 * (they still roll); Edit: everything is a box to type in, with ↺ on the player's own values. Remembered
 * in this browser; a sheet with no class yet opens in Edit until the player picks.
 */
export function sheetMode(state) {
  const saved = storage.get(MODE_KEY);
  if (saved === 'play' || saved === 'edit') return saved;
  return state.sheet?.classes?.some((c) => c.name.trim()) ? 'play' : 'edit';
}

export function setSheetMode(mode) {
  storage.set(MODE_KEY, mode);
  applyMode(mode);
}

/** Show the mode on the sheet: data-mode, and edit-only boxes read-only in Play. */
export function applyMode(mode) {
  const sheet = document.querySelector('#sheet');
  if (!sheet) return;
  sheet.dataset.mode = mode;
  for (const el of sheet.querySelectorAll('.auto-input, input.edit-only, .edit-only input, .edit-only textarea')) el.readOnly = mode === 'play';
  const toggle = sheet.querySelector('.mode-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(mode === 'edit'));
    toggle.replaceChildren(h('span', { 'aria-hidden': 'true' }, mode === 'edit' ? '✓ ' : '✎ '), h('span', { class: 'btn-text' }, mode === 'edit' ? 'Done editing' : 'Edit'));
    toggle.title = mode === 'edit' ? 'Back to playing: numbers are shown, not typed into' : 'Change anything on the sheet: scores, numbers worked out for you (type your own), class, race, background';
  }
}

/**
 * @param {object} ctx
 * @param {object} ctx.state
 * @param {() => void} ctx.changed
 * @param {(key, opts) => HTMLElement} ctx.auto  a box with an automatic value
 * @param {(path, opts) => HTMLElement} ctx.field  a box bound to the sheet
 * @param {(control, label, cls?, get?) => HTMLElement} ctx.stat  a value with its label (which rolls, given get)
 * @param {(key, label, why) => () => object} ctx.check  what a d20 check rolls
 * @param {object} ctx.rollAdvantage
 * @param {() => HTMLElement} ctx.picture  the token picture (or nothing)
 * @param {() => HTMLElement[]} ctx.banners  Wild Shape and Level up lines under the name
 * @param {() => HTMLElement} ctx.hitDice  the hit dice box (spend, short rest)
 * @param {() => HTMLElement} ctx.deathSaves
 * @param {() => HTMLElement} ctx.loadNote
 * @param {() => Promise} ctx.shortRest  take a short rest (the server does it)
 * @param {(text, error?) => void} ctx.status
 * @param {(notation, opts) => void} ctx.roll
 * @param {() => string} ctx.edition
 */
export function sheetHeader(ctx) {
  const { state, changed, auto, field, stat, check } = ctx;

  // Name and summary: "Wood Elf · Druid 3 (Circle of the Moon) · Level 3".
  const summary = h('p', { class: 'summary' });
  state.renders.push(() => {
    const classes = state.sheet.classes.filter((c) => c.name.trim()).map((c) => `${c.name.trim()} ${c.level}${c.subclass.trim() ? ` (${c.subclass.trim()})` : ''}`).join(' / ');
    summary.textContent = [state.sheet.race.trim(), classes, `Level ${state.calc.level}`].filter(Boolean).join(' · ');
  });
  const name = field('name', { label: 'Character name', cls: 'big edit-only', placeholder: 'Character name' });
  // Wild Shape's line stays under the name; Level up sits with the header's buttons.
  const [wildShapeLine, levelUpLine] = ctx.banners();
  const who = h('div', { class: 'sh-who' }, ctx.picture(), h('div', { class: 'sh-who-text' }, name, summary, wildShapeLine));

  // Hit points: current of maximum (temporary beside), a bar, and a number with Damage, Heal and Temp.
  const amount = h('input', { type: 'text', inputMode: 'numeric', class: 'hp-amount', placeholder: '0', 'aria-label': 'Hit points to take or give', autocomplete: 'off' });
  const hpLine = h('div', { class: 'hp-line' },
    h('label', { class: 'hp-now' }, field('hp.current', { label: 'Current hit points', kind: 'int', nullable: true, cls: 'hp-current' }), h('span', { class: 'muted' }, ' / '),
      h('span', { class: 'hp-max-wrap' }, auto('hp_max', { label: 'Hit point maximum', cls: 'hp-max' }))),
    h('label', { class: 'hp-temp-wrap', title: 'Temporary hit points: taken first, gone after a long rest' }, h('span', { class: 'muted small' }, 'Temp'), field('hp.temp', { label: 'Temporary hit points', kind: 'int', nullable: true, cls: 'hp-temp' })),
  );
  const bar = h('div', { class: 'hp-bar', 'aria-hidden': 'true' }, h('i'));
  const apply = (kind) => {
    const n = parseInt(amount.value, 10);
    if (!(n > 0)) { amount.focus(); return; }
    const res = changeHp(state.sheet, state.calc.values.hp_max, { kind, amount: n });
    state.sheet.hp = res.sheet.hp;
    state.sheet.death_saves = res.sheet.death_saves;
    amount.value = '';
    changed();
    const hp = state.sheet.hp.current;
    if (kind === 'damage') {
      ctx.status(`Took ${n} damage: ${hp} hit point${hp === 1 ? '' : 's'} left${res.down ? '. Down! Roll death saves at the start of your turns.' : '.'}`);
      if (res.concentrationDC) concentrationCheck(res.concentrationDC);
    } else if (kind === 'heal') ctx.status(`Healed ${n}: ${hp} hit points.`);
    else ctx.status(`${state.sheet.hp.temp ?? 0} temporary hit points.`);
  };
  amount.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), apply(e.shiftKey ? 'heal' : 'damage')));
  const hpBox = h('section', { class: 'sh-hp', 'aria-label': 'Hit points' },
    hpLine, bar,
    h('div', { class: 'hp-change' }, amount,
      h('button', { type: 'button', class: 'small hp-damage', title: 'Take this much damage (temporary hit points go first)', onclick: () => apply('damage') }, 'Damage'),
      h('button', { type: 'button', class: 'small ghost hp-heal', title: 'Regain this many hit points (up to your maximum)', onclick: () => apply('heal') }, 'Heal'),
      h('button', { type: 'button', class: 'small ghost hp-give-temp', title: 'Gain this many temporary hit points (they don\'t add up: the bigger number stays)', onclick: () => apply('temp') }, 'Temp')),
  );
  state.renders.push(() => {
    const max = Number(state.calc.values.hp_max) || 0;
    const now = state.sheet.hp.current ?? max;
    const current = hpLine.querySelector('.hp-current');
    if (current) current.placeholder = max ? String(max) : '';
    // Boxes bound with field() don't follow the sheet by themselves: Damage, Heal, Temp and rests change these.
    const temp = hpLine.querySelector('.hp-temp');
    for (const [el, v] of [[current, state.sheet.hp.current], [temp, state.sheet.hp.temp]]) {
      if (el && el !== document.activeElement) el.value = v ?? '';
    }
    bar.firstChild.style.width = max ? `${Math.max(0, Math.min(100, (now / max) * 100))}%` : '0';
    bar.dataset.level = !max ? '' : now <= 0 ? 'down' : now <= max / 4 ? 'low' : now <= max / 2 ? 'half' : 'ok';
    hpBox.classList.toggle('down', max > 0 && now <= 0);
  });

  /** Damage while concentrating: a Constitution save to keep it, offered as a roll. */
  function concentrationCheck(dc) {
    const r = check('save.con', 'Constitution save', { ability: 'con', kind: 'save' })();
    ctx.roll(r.notation, { label: `Concentration (${state.sheet.concentration}): Constitution save, DC ${dc}`, disadvantage: r.disadvantage, advantage: r.advantage });
  }

  // The numbers: AC, initiative (rolls), speed, proficiency, spell save DC (casters), inspiration.
  const inspiration = h('input', { type: 'checkbox', 'aria-label': 'Inspiration', onchange: (e) => { state.sheet.inspiration = e.target.checked; changed(); } });
  state.renders.push(() => (inspiration.checked = state.sheet.inspiration));
  const dc = stat(auto('spell_dc', { label: 'Spell save DC' }), 'Spell DC', 'spell-dc');
  state.renders.push(() => (dc.hidden = state.calc.values.spell_dc == null && !('spell_dc' in state.sheet.overrides)));
  const numbers = h('div', { class: 'sh-numbers' },
    stat(auto('ac', { label: 'Armour class' }), 'AC', 'big'),
    stat(auto('initiative', { kind: 'bonus', label: 'Initiative' }), 'Initiative', 'big', () => ({ ...check('initiative', 'Initiative', { ability: 'dex', initiative: true })(), advantage: ctx.rollAdvantage(state.calc, { initiative: true }), initiative: true })),
    stat(auto('speed', { label: 'Speed (feet)' }), 'Speed', 'big'),
    stat(auto('proficiency_bonus', { kind: 'bonus', label: 'Proficiency bonus' }), 'Prof', 'big'),
    dc,
    h('label', { class: 'stat inspiration', title: 'Inspiration: spend it for advantage' }, inspiration, h('span', { class: 'lbl' }, 'Inspiration')),
  );

  // Conditions, exhaustion and concentration, each a chip with × to end it.
  const chips = h('div', { class: 'sh-conditions', role: 'group', 'aria-label': 'Conditions' });
  const add = h('select', { class: 'cond-add', 'aria-label': 'Add a condition' });
  add.addEventListener('change', () => {
    const v = add.value;
    add.value = '';
    if (v === 'exhaustion') state.sheet.exhaustion = Math.min(6, (state.sheet.exhaustion ?? 0) + 1);
    else if (SHEET_CONDITIONS.includes(v) && !state.sheet.conditions.includes(v)) state.sheet.conditions.push(v);
    changed();
  });
  const chip = (text, title, cls, onRemove, label) => h('span', { class: `chip ${cls}`, title },
    h('span', {}, text), h('button', { type: 'button', class: 'chip-x', 'aria-label': label, title: label, onclick: onRemove }, '×'));
  let drawnConditions = '';
  state.renders.push(() => {
    const key = JSON.stringify([state.sheet.conditions, state.sheet.exhaustion, state.sheet.concentration, ctx.edition()]);
    if (key === drawnConditions) return;
    drawnConditions = key;
    const ex = state.sheet.exhaustion ?? 0;
    const exText = ctx.edition() === '2024' ? `−${2 * ex} to every d20 test, −${5 * ex} ft speed` : EXHAUSTION_2014.slice(1, ex + 1).join(' ');
    add.replaceChildren(new Option('+ Condition', ''), ...SHEET_CONDITIONS.filter((c) => !state.sheet.conditions.includes(c)).map((c) => new Option(CONDITION_NAMES[c], c)),
      ...(ex < 6 ? [new Option(ex ? `Exhaustion ${ex + 1}` : 'Exhaustion', 'exhaustion')] : []));
    chips.replaceChildren(
      ...(state.sheet.concentration ? [chip(`Concentrating: ${state.sheet.concentration}`, 'Damage asks for a Constitution save to keep it. Casting another concentration spell ends it.', 'conc',
        () => { state.sheet.concentration = ''; changed(); }, `Stop concentrating on ${state.sheet.concentration}`)] : []),
      ...state.sheet.conditions.map((c) => chip(CONDITION_NAMES[c], CONDITION_TEXT[c], 'cond', () => {
        state.sheet.conditions = state.sheet.conditions.filter((x) => x !== c);
        changed();
      }, `End ${CONDITION_NAMES[c]}`)),
      ...(ex ? [chip(`Exhaustion ${ex}`, exText, 'cond exhaustion', () => { state.sheet.exhaustion = ex - 1; changed(); }, 'One less level of exhaustion')] : []),
      add,
    );
  });

  // Rest: what a short rest gives back (and hit dice to spend), and what the DM's long rest will.
  const restPanel = h('section', { class: 'sh-rest', hidden: !restOpen, 'aria-label': 'Rest' });
  const restButton = h('button', { type: 'button', class: 'ghost rest-open', 'aria-expanded': String(restOpen), onclick: () => {
    restOpen = restPanel.hidden;
    restPanel.hidden = !restOpen;
    restButton.setAttribute('aria-expanded', String(restOpen));
    if (restOpen) drawRest();
  } }, 'Rest');
  const dice = ctx.hitDice(); // made once: it keeps its own redraw
  const drawRest = (refresh = true) => {
    const ed = ctx.edition();
    const back = (after) => {
      const rows = featureRows(state.sheet, { edition: ed, values: state.calc.values });
      const named = rows.filter((r) => (state.sheet.class_features.spent[r.id] ?? 0) > (after.class_features.spent[r.id] ?? 0)).map((r) => r.name);
      return named;
    };
    const short = shortRest(state.sheet, { edition: ed });
    const shortBack = [...(state.sheet.spellcasting.pact_used ? ['Pact Magic slots'] : []), ...back(short)];
    const long = longRest(state.sheet, { edition: ed });
    const slotsUsed = Object.values(state.sheet.spellcasting.slots_used).some(Boolean) || state.sheet.spellcasting.pact_used;
    const longBack = [
      long.regained.hp ? `${long.regained.hp} hit points` : '',
      long.regained.hit_dice ? `${long.regained.hit_dice} hit ${long.regained.hit_dice === 1 ? 'die' : 'dice'}` : '',
      slotsUsed ? 'spell slots' : '',
      ...back(long.sheet),
      (state.sheet.exhaustion ?? 0) > 0 ? 'one level of exhaustion' : '',
    ].filter(Boolean);
    const list = (xs) => (xs.length ? xs.join(', ') : 'nothing spent yet');
    restPanel.replaceChildren(
      h('header', {}, h('h3', {}, 'Rest'), h('button', { type: 'button', class: 'ghost small', onclick: () => restButton.click() }, 'Close')),
      h('div', { class: 'rest-cols' },
        h('div', {},
          h('h4', {}, 'Short rest (an hour)'),
          h('p', { class: 'small' }, `Comes back: ${list(shortBack)}. Spend hit dice below to heal.`),
          dice,
        ),
        h('div', {},
          h('h4', {}, 'Long rest'),
          h('p', { class: 'small' }, `The DM calls long rests for the party. One now would give back: ${list(longBack)}.`),
          long.rested ? null : h('p', { class: 'small warn' }, 'At 0 hit points a long rest gives nothing (2014 rules): you need at least 1 hit point.'),
        ),
      ),
    );
    if (refresh) ctx.refresh();
  };
  // Open (kept open through a redraw): what comes back follows the sheet.
  state.renders.push(() => { if (!restPanel.hidden) drawRest(false); });

  const modeToggle = h('button', { type: 'button', class: 'ghost mode-toggle', onclick: () => setSheetMode(document.querySelector('#sheet')?.dataset.mode === 'edit' ? 'play' : 'edit') }, '✎ Edit');

  const death = ctx.deathSaves();
  state.renders.push(() => {
    const max = Number(state.calc.values.hp_max) || 0;
    const now = state.sheet.hp.current ?? max;
    death.hidden = !(max > 0 && now <= 0) && !state.sheet.death_saves.successes && !state.sheet.death_saves.failures;
  });

  // One row on a wide sheet (the mock-up): who, hit points, the numbers, conditions, then the buttons.
  const loadNote = ctx.loadNote();
  const status = h('div', { class: 'sh-header-status' }, loadNote);
  return h('header', { class: 'sh-header' },
    h('div', { class: 'sh-header-top' },
      who,
      hpBox,
      numbers,
      // Conditions and buttons move to a second line together when the row is full.
      h('div', { class: 'sh-header-end' }, chips, h('div', { class: 'sh-header-buttons' }, levelUpLine, ...(ctx.buttons ?? []), restButton, modeToggle)),
    ),
    status,
    death,
    restPanel,
  );
}
