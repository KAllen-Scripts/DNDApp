/**
 * Help making a character: a panel above the sheet (folded away unless the
 * sheet has no class yet; remembered per browser) saying what the class,
 * race or species and background give and what to choose, by the campaign's
 * rules edition (shared/creation-help.js, shared/backgrounds.js). Nothing is
 * forced and nothing changes by itself: the player clicks to tick a skill,
 * pick a class, race or background, or put the starting equipment in the
 * Equipment box. SPEC §6.4 "Help making a character".
 */
import { storage } from '../page/api.js';
import { CLASSES, SKILLS, abilityMod, classKey } from '/shared/sheet.js';
import { classHelp, raceHelp, racesFor, skillPicks } from '/shared/creation-help.js';
import { backgroundSummary, backgroundsFor } from '/shared/backgrounds.js';
import { clearBackground, pickBackground, sheetBackground } from './background.js';
import { h } from '../page/dom.js';

const OPEN_KEY = 'dndapp.sheetHelp';

const editionOf = (state) => (state.settings?.edition || state.edition || '2014') === '2024' ? '2024' : '2014';

/** One line: a label and its text. */
const item = (label, ...text) => h('div', { class: 'help-line' }, h('span', { class: 'help-label' }, label), h('span', {}, ...text));

/** A skill the player can tick or untick from the help (expertise is left alone). */
function skillChip({ state, changed, redraw }, k, { max = null, count = 0 } = {}) {
  const mark = state.sheet.skills?.[k];
  const full = max != null && !mark && count >= max;
  return h('button', {
    type: 'button',
    class: `help-chip${mark ? ' on' : ''}`,
    'aria-pressed': String(!!mark),
    'data-skill': k,
    title: mark === 'expertise' ? 'Expertise: change it on the sheet' : mark ? 'Untick this skill on the sheet' : full ? 'You have chosen as many as the class gives (you can still tick it)' : 'Tick this skill on the sheet',
    disabled: mark === 'expertise',
    onclick: () => {
      state.sheet.skills ??= {};
      if (mark) delete state.sheet.skills[k];
      else state.sheet.skills[k] = 'proficient';
      redraw();
      changed();
    },
  }, `${mark ? '✓ ' : ''}${SKILLS[k].name}`);
}

// Which part the panel shows (class, race or background), and which part is
// showing its list to change what was picked. Kept across redraws of the sheet.
let tab = null;
let picking = null;

/** Another sheet was loaded: start again on the first part not chosen. */
export function forgetHelpTab() {
  tab = null;
  picking = null;
}

const WORDS = (ed) => ({ class: 'Class', race: ed === '2024' ? 'Species' : 'Race', background: 'Background' });

/** A part's heading: the name and book, with Change and Clear when something is picked. */
function head(ctx, part, title, book, { clear } = {}) {
  return h('div', { class: 'help-head' },
    h('h4', {}, title, book ? h('span', { class: 'muted small' }, ` ${book}`) : null),
    clear ? h('span', { class: 'help-actions' },
      h('button', { type: 'button', class: 'ghost small', onclick: () => { picking = part; ctx.again(); } }, 'Change'),
      h('button', { type: 'button', class: 'ghost small', title: 'Empties it on the sheet', onclick: () => { picking = null; clear(); ctx.redraw(); ctx.changed(); } }, 'Clear'),
    ) : null);
}

/** The list to pick from: `current` is marked, and while changing a pick it can be kept. */
function picker(ctx, part, names, current, onPick, { intro, title } = {}) {
  return h('div', { class: 'help-pick' },
    intro ? h('p', { class: 'muted small' }, intro) : null,
    h('div', { class: 'help-chips' }, names.map((x) => h('button', {
      type: 'button',
      class: `help-chip${x.name === current ? ' on' : ''}`,
      title: title?.(x),
      onclick: () => {
        picking = null;
        tab = part; // stay on it, to see what it gives
        if (x.name !== current) onPick(x);
        else ctx.again();
      },
    }, x.name))),
    picking === part && current ? h('button', { type: 'button', class: 'ghost small help-keep', onclick: () => { picking = null; ctx.again(); } }, `Keep ${current}`) : null);
}

function classPart(ctx, ed) {
  const { state, changed, redraw } = ctx;
  const rows = state.sheet.classes.filter((c) => c.name.trim());
  const pickClass = (c) => {
    state.sheet.classes[0] = { ...(state.sheet.classes[0] ?? { subclass: '', level: 1 }), name: c.name };
    redraw();
    changed();
  };
  const current = state.sheet.classes[0]?.name.trim() ?? '';
  if (!rows.length || picking === 'class') {
    return h('section', { class: 'help-part' },
      h('h4', {}, current ? `Change your class (${current} now)` : 'Pick a class'),
      picker(ctx, 'class', Object.values(CLASSES), current, pickClass, { intro: 'See what it gives you and what to choose.' }));
  }
  return rows.map((row, i) => {
    const key = classKey(row.name);
    const c = key && classHelp(key, ed);
    const first = i === 0;
    const clear = first ? () => { state.sheet.classes[0].name = ''; } : null;
    if (!c) return h('section', { class: 'help-part' }, head(ctx, 'class', row.name, '', { clear }), h('p', { class: 'muted small' }, "The help doesn't know this class: see its book."));
    const level = Number(row.level) || 1;
    const con = Number(state.calc?.values?.['mod.con'] ?? abilityMod(state.sheet.abilities?.con ?? 10)) || 0;
    const picks = skillPicks(state.sheet, c);
    const hasEquipment = String(state.sheet.equipment ?? '').trim();
    const shown = c.features.filter((f) => f.level <= Math.min(20, level + 1));
    const facts = h('div', { class: 'help-col' },
      item('Hit points', `Hit die ${c.hit_die}. Level 1: ${c.hp_first}${first ? ` (${Math.max(1, Number(c.hit_die.slice(1)) + con)} with your Constitution)` : ''}; then ${c.hp_next}. The sheet works these out.`),
      first ? item('Saving throws', `${c.saves.join(' and ')} (ticked on the sheet for your first class)`) : item('Multiclassing', 'A class taken after the first gives fewer proficiencies (see the multiclassing rules) and no saving throws.'),
      item('Armour', c.armor || 'None'),
      item('Weapons', c.weapons),
      c.tools ? item('Tools', c.tools) : null,
      c.mastery ? item('Weapon Mastery', `Choose ${c.mastery} kinds of weapon to use the mastery properties of`) : null,
      c.spells ? item('Spellcasting', c.spells) : null,
      first
        ? h('div', { class: 'help-line' },
          h('span', { class: 'help-label' }, 'Skills'),
          h('span', {},
            `Choose ${c.skills.choose}${c.skills.from.length === Object.keys(SKILLS).length ? ' (any)' : ''}: `,
            h('span', { class: `help-count${picks.left ? '' : ' done'}` }, `${picks.picked.length} of ${c.skills.choose} ticked`),
            h('span', { class: 'help-chips' }, c.skills.from.map((k) => skillChip(ctx, k, { max: c.skills.choose, count: picks.picked.length }))),
          ))
        : null);
    const more = h('div', { class: 'help-col' },
      first
        ? h('div', { class: 'help-line' },
          h('span', { class: 'help-label' }, 'Starting equipment'),
          h('span', {},
            h('ul', {}, c.equipment.map((e) => h('li', {}, e))),
            h('div', { class: 'help-do' },
              h('button', {
                type: 'button',
                class: 'ghost small',
                title: hasEquipment ? 'Adds these lines under what is in your Equipment box' : 'Puts these lines in your Equipment box',
                onclick: () => {
                  const lines = c.equipment.filter((e) => !String(state.sheet.equipment ?? '').includes(e));
                  if (!lines.length) return;
                  state.sheet.equipment = [String(state.sheet.equipment ?? '').trim(), `${c.name} starting equipment (choose):`, ...lines.map((e) => `- ${e}`)].filter(Boolean).join('\n');
                  redraw();
                  changed();
                },
              }, hasEquipment ? 'Add to the Equipment box' : 'Put in the Equipment box'),
              h('span', { class: 'muted small' }, 'Then look the items up on the Inventory tab to carry and equip them.')),
          ))
        : null,
      h('div', { class: 'help-line' },
        h('span', { class: 'help-label' }, 'Features'),
        h('span', {},
          h('ol', { class: 'help-levels' }, shown.map((f) => h('li', { class: f.level === level ? 'now' : f.level > level ? 'next' : '', value: f.level },
            h('strong', {}, `Level ${f.level}${f.level > level ? ' (next)' : ''}: `), f.names.join('; ')))),
          level < 20 ? h('details', { class: 'help-more' }, h('summary', {}, 'Every level'),
            h('ol', { class: 'help-levels all' }, c.features.map((f) => h('li', { value: f.level, class: f.level === level ? 'now' : '' }, h('strong', {}, `${f.level}: `), f.names.join('; '))))) : null)));
    return h('section', { class: 'help-part', 'data-class': key },
      head(ctx, 'class', c.name, `(${c.book})`, { clear }),
      h('div', { class: 'help-cols' }, facts, more));
  });
}

function racePart(ctx, ed) {
  const { state, changed, redraw } = ctx;
  const word = WORDS(ed).race;
  const typed = state.sheet.race.trim();
  const r = raceHelp(state.sheet.race, ed);
  const pick = (x) => {
    state.sheet.race = x.name;
    redraw();
    changed();
  };
  if (!r || picking === 'race') {
    const intro = r ? null : typed ? `The help doesn't know "${typed}" (see its book). The ${ed} Player's Handbook has:` : null;
    return h('section', { class: 'help-part' },
      h('h4', {}, r ? `Change your ${word.toLowerCase()} (${r.name} now)` : `Pick a ${word.toLowerCase()}`),
      picker(ctx, 'race', racesFor(ed), r?.name ?? '', pick, { intro }));
  }
  return h('section', { class: 'help-part', 'data-race': r.name },
    head(ctx, 'race', r.name, `(${r.book})`, { clear: () => { state.sheet.race = ''; } }),
    item('Ability scores', r.abilities),
    item('Size and speed', `${r.size}, ${r.speed} ft`),
    item('Languages', r.languages),
    item('Traits', h('ul', {}, r.traits.map((t) => h('li', {}, t)))),
    r.skills.length ? h('div', { class: 'help-line' }, h('span', { class: 'help-label' }, 'Skill'), h('span', { class: 'help-chips' }, r.skills.map((k) => skillChip(ctx, k)))) : null,
    r.skill_pick ? h('div', { class: 'help-line' }, h('span', { class: 'help-label' }, 'Choose one'), h('span', { class: 'help-chips' }, r.skill_pick.map((k) => skillChip(ctx, k)))) : null,
    r.skill_choice ? item('Skills', `Choose ${r.skill_choice} of any (tick them under Skills)`) : null,
  );
}

function backgroundPart(ctx, ed) {
  const { state } = ctx;
  const b = sheetBackground(state);
  const typed = state.sheet.background.trim();
  if (!b || picking === 'background') {
    const intro = b
      ? `Picking another takes ${b.name}'s skills and lines back off (where you haven't changed them) and fills in the new one's.`
      : typed ? `"${typed}" isn't one the help knows: fill it in by hand. These are:` : 'It ticks its skills and fills in what\'s empty.';
    return h('section', { class: 'help-part' },
      h('h4', {}, b ? `Change your background (${b.name} now)` : 'Pick a background'),
      picker(ctx, 'background', backgroundsFor(ed, state.settings?.backgrounds ?? []), b?.name ?? '', (x) => pickBackground(ctx, x), { intro, title: (x) => x.book }));
  }
  return h('section', { class: 'help-part', 'data-background': b.name },
    head(ctx, 'background', b.name, `(${b.book})`, { clear: () => clearBackground({ state, redraw: () => {}, changed: () => {} }) }),
    backgroundSummary(b).map((l) => item(l.label, l.text)),
    b.skills.length ? h('div', { class: 'help-line' }, h('span', { class: 'help-label' }, 'Its skills'), h('span', { class: 'help-chips' }, b.skills.map((k) => skillChip(ctx, k)))) : null,
  );
}

/** What each tab says is picked: the name, or nothing yet. */
const chosen = (state) => ({
  class: state.sheet.classes.filter((c) => c.name.trim()).map((c) => `${c.name.trim()} ${Number(c.level) || 1}`).join(' / '),
  race: state.sheet.race.trim(),
  background: state.sheet.background.trim(),
});

// What the panel shows depends on: when one of these changes as the player types, it's drawn again.
const shownKey = (state) => JSON.stringify([
  editionOf(state), state.sheet.classes.map((c) => [c.name, c.level]), state.sheet.race, state.sheet.background,
  state.sheet.skills, !!String(state.sheet.equipment ?? '').trim(), state.calc?.values?.['mod.con'], state.settings?.backgrounds,
]);

/**
 * The panel, drawn with the sheet. `redraw` draws the sheet again (after
 * the help changed it); `changed` saves it soon. It redraws itself as the
 * sheet is typed in (through `state.renders`, which the sheet runs on every
 * change), and when a tab or Change is clicked (the sheet doesn't change then).
 */
export function helpPanel(ctx) {
  let panel;
  let key = shownKey(ctx.state);
  const again = () => {
    key = shownKey(ctx.state);
    const next = drawPanel({ ...ctx, again }, panel.open); // stays open or shut as it was
    panel.replaceWith(next);
    panel = next;
  };
  panel = drawPanel({ ...ctx, again });
  ctx.state.renders.push(() => {
    if (shownKey(ctx.state) !== key) again();
  });
  return panel;
}

function drawPanel(ctx, wasOpen = null) {
  const { state, again } = ctx;
  const ed = editionOf(state);
  const stored = storage.get(OPEN_KEY);
  const open = wasOpen != null ? wasOpen : stored == null ? !state.sheet.classes.some((c) => c.name.trim()) : stored === '1';
  const picked = chosen(state);
  const words = WORDS(ed);
  const parts = { class: classPart, race: racePart, background: backgroundPart };
  const shown = tab ?? Object.keys(parts).find((k) => !picked[k]) ?? 'class';
  const panel = h('details', { class: 'sh-help', open },
    h('summary', {}, `Help making a character (${ed} rules)`),
    h('p', { class: 'muted small' }, `What your class, ${words.race.toLowerCase()} and background give you, and what to choose. Click to tick a skill or fill something in; nothing is required, and Change or Clear takes a pick back.`),
    h('div', { class: 'help-steps', role: 'tablist' }, Object.keys(parts).map((k) => h('button', {
      type: 'button',
      role: 'tab',
      class: `help-step${k === shown ? ' on' : ''}${picked[k] ? ' done' : ''}`,
      'aria-selected': String(k === shown),
      'data-step': k,
      onclick: () => {
        tab = k;
        if (picking !== k) picking = null;
        again();
      },
    }, h('span', { class: 'help-step-word' }, words[k]), h('span', { class: 'help-step-name' }, picked[k] || 'Not chosen')))),
    h('div', { class: 'help-parts', role: 'tabpanel' }, parts[shown](ctx, ed)),
  );
  panel.addEventListener('toggle', () => storage.set(OPEN_KEY, panel.open ? '1' : '0'));
  return panel;
}
