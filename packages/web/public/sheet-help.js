/**
 * Help making a character: a panel above the sheet (folded away unless the
 * sheet has no class yet; remembered per browser) saying what the class,
 * race or species and background give and what to choose, by the campaign's
 * rules edition (shared/creation-help.js, shared/backgrounds.js). Nothing is
 * forced and nothing changes by itself: the player clicks to tick a skill,
 * pick a class, race or background, or put the starting equipment in the
 * Equipment box. SPEC §6.4 "Help making a character".
 */
import { h, storage } from './api.js';
import { CLASSES, SKILLS, abilityMod, classKey } from './shared/sheet.js';
import { classHelp, raceHelp, racesFor, skillPicks } from './shared/creation-help.js';
import { backgroundSummary, backgroundsFor } from './shared/backgrounds.js';
import { pickBackground, sheetBackground } from './sheet-background.js';

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

function classPart(ctx, ed) {
  const { state, changed, redraw } = ctx;
  const rows = state.sheet.classes.filter((c) => c.name.trim());
  if (!rows.length) {
    return h('section', { class: 'help-part' },
      h('h4', {}, 'Class'),
      h('p', { class: 'muted small' }, 'Pick a class to see what it gives you and what to choose:'),
      h('div', { class: 'help-chips' }, Object.values(CLASSES).map((c) => h('button', {
        type: 'button',
        class: 'help-chip',
        onclick: () => {
          state.sheet.classes[0] = { ...(state.sheet.classes[0] ?? { subclass: '', level: 1 }), name: c.name };
          redraw();
          changed();
        },
      }, c.name))));
  }
  return rows.map((row, i) => {
    const key = classKey(row.name);
    const c = key && classHelp(key, ed);
    if (!c) return h('section', { class: 'help-part' }, h('h4', {}, row.name), h('p', { class: 'muted small' }, "The help doesn't know this class: see its book."));
    const level = Number(row.level) || 1;
    const con = Number(state.calc?.values?.['mod.con'] ?? abilityMod(state.sheet.abilities?.con ?? 10)) || 0;
    const first = i === 0;
    const picks = skillPicks(state.sheet, c);
    const hasEquipment = String(state.sheet.equipment ?? '').trim();
    const shown = c.features.filter((f) => f.level <= Math.min(20, level + 1));
    return h('section', { class: 'help-part', 'data-class': key },
      h('h4', {}, `${c.name} `, h('span', { class: 'muted small' }, `(${c.book})`)),
      item('Hit points', `Hit die ${c.hit_die}. Level 1: ${c.hp_first}${first ? ` (${Math.max(1, Number(c.hit_die.slice(1)) + con)} with your Constitution)` : ''}; then ${c.hp_next}. The sheet works these out.`),
      first ? item('Saving throws', `${c.saves.join(' and ')} (ticked on the sheet for your first class)`) : item('Multiclassing', 'A class taken after the first gives fewer proficiencies (see the multiclassing rules) and no saving throws.'),
      item('Armour', c.armor || 'None'),
      item('Weapons', c.weapons),
      c.tools ? item('Tools', c.tools) : null,
      c.mastery ? item('Weapon Mastery', `Choose ${c.mastery} kinds of weapon to use the mastery properties of`) : null,
      first
        ? h('div', { class: 'help-line' },
          h('span', { class: 'help-label' }, 'Skills'),
          h('span', {},
            `Choose ${c.skills.choose}${c.skills.from.length === Object.keys(SKILLS).length ? ' (any)' : ''}: `,
            h('span', { class: `help-count${picks.left ? '' : ' done'}` }, `${picks.picked.length} of ${c.skills.choose} ticked`),
            h('span', { class: 'help-chips' }, c.skills.from.map((k) => skillChip(ctx, k, { max: c.skills.choose, count: picks.picked.length }))),
          ))
        : null,
      first
        ? h('div', { class: 'help-line' },
          h('span', { class: 'help-label' }, 'Starting equipment'),
          h('span', {},
            h('ul', {}, c.equipment.map((e) => h('li', {}, e))),
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
            h('span', { class: 'muted small' }, ' Look the items up on the Inventory tab to carry and equip them.'),
          ))
        : null,
      c.spells ? item('Spellcasting', c.spells) : null,
      h('div', { class: 'help-line' },
        h('span', { class: 'help-label' }, 'Features'),
        h('ol', { class: 'help-levels' }, shown.map((f) => h('li', { class: f.level === level ? 'now' : f.level > level ? 'next' : '', value: f.level },
          h('strong', {}, `Level ${f.level}${f.level > level ? ' (next)' : ''}: `), f.names.join('; '))))),
      level < 20 ? h('details', { class: 'help-more' }, h('summary', {}, 'Every level'),
        h('ol', { class: 'help-levels' }, c.features.map((f) => h('li', { value: f.level }, h('strong', {}, `Level ${f.level}: `), f.names.join('; '))))) : null,
    );
  });
}

function racePart(ctx, ed) {
  const { state, changed, redraw } = ctx;
  const word = ed === '2024' ? 'Species' : 'Race';
  const r = raceHelp(state.sheet.race, ed);
  if (!r) {
    return h('section', { class: 'help-part' },
      h('h4', {}, word),
      h('p', { class: 'muted small' }, state.sheet.race.trim() ? `The help doesn't know "${state.sheet.race.trim()}" (see its book). The ${ed} Player's Handbook has:` : `Pick a ${word.toLowerCase()}:`),
      h('div', { class: 'help-chips' }, racesFor(ed).map((x) => h('button', {
        type: 'button',
        class: 'help-chip',
        onclick: () => {
          state.sheet.race = x.name;
          redraw();
          changed();
        },
      }, x.name))));
  }
  return h('section', { class: 'help-part', 'data-race': r.name },
    h('h4', {}, `${r.name} `, h('span', { class: 'muted small' }, `(${r.book})`)),
    item('Ability scores', r.abilities),
    item('Size and speed', `${r.size}, ${r.speed} ft`),
    item('Languages', r.languages),
    item('Traits', r.traits.join('; ')),
    r.skills.length ? h('div', { class: 'help-line' }, h('span', { class: 'help-label' }, 'Skill'), h('span', { class: 'help-chips' }, r.skills.map((k) => skillChip(ctx, k)))) : null,
    r.skill_pick ? h('div', { class: 'help-line' }, h('span', { class: 'help-label' }, 'Choose one'), h('span', { class: 'help-chips' }, r.skill_pick.map((k) => skillChip(ctx, k)))) : null,
    r.skill_choice ? item('Skills', `Choose ${r.skill_choice} of any (tick them under Skills)`) : null,
  );
}

function backgroundPart(ctx, ed) {
  const { state } = ctx;
  const b = sheetBackground(state);
  if (!b) {
    return h('section', { class: 'help-part' },
      h('h4', {}, 'Background'),
      h('p', { class: 'muted small' }, state.sheet.background.trim() ? `"${state.sheet.background.trim()}" isn't one the help knows: fill it in by hand. These are:` : 'Pick a background: it ticks its skills and fills in what\'s empty.'),
      h('div', { class: 'help-chips' }, backgroundsFor(ed, state.settings?.backgrounds ?? []).map((x) => h('button', { type: 'button', class: 'help-chip', title: x.book, onclick: () => pickBackground(ctx, x) }, x.name))));
  }
  return h('section', { class: 'help-part', 'data-background': b.name },
    h('h4', {}, `${b.name} `, h('span', { class: 'muted small' }, `(${b.book})`)),
    backgroundSummary(b).map((l) => item(l.label, l.text)),
    b.skills.length ? h('div', { class: 'help-line' }, h('span', { class: 'help-label' }, 'Its skills'), h('span', { class: 'help-chips' }, b.skills.map((k) => skillChip(ctx, k)))) : null,
  );
}

// What the panel shows depends on: when one of these changes as the player types, it's drawn again.
const shownKey = (state) => JSON.stringify([
  editionOf(state), state.sheet.classes.map((c) => [c.name, c.level]), state.sheet.race, state.sheet.background,
  state.sheet.skills, !!String(state.sheet.equipment ?? '').trim(), state.calc?.values?.['mod.con'], state.settings?.backgrounds,
]);

/**
 * The panel, drawn with the sheet. `redraw` draws the sheet again (after
 * the help changed it); `changed` saves it soon. It redraws itself as the
 * sheet is typed in (through `state.renders`, which the sheet runs on every change).
 */
export function helpPanel(ctx) {
  let panel = drawPanel(ctx);
  let key = shownKey(ctx.state);
  ctx.state.renders.push(() => {
    const now = shownKey(ctx.state);
    if (now === key) return;
    key = now;
    const next = drawPanel(ctx, panel.open); // stays open or shut as it was
    panel.replaceWith(next);
    panel = next;
  });
  return panel;
}

function drawPanel({ state, changed, redraw }, wasOpen = null) {
  const ctx = { state, changed, redraw };
  const ed = editionOf(state);
  const stored = storage.get(OPEN_KEY);
  const open = wasOpen != null ? wasOpen : stored == null ? !state.sheet.classes.some((c) => c.name.trim()) : stored === '1';
  const panel = h('details', { class: 'sh-help', open },
    h('summary', {}, `Help making a character (${ed} rules)`),
    h('p', { class: 'muted small' }, 'What your class, race and background give you, and what to choose. Click to tick a skill or fill something in; nothing is required, and it never changes what you typed.'),
    h('div', { class: 'help-parts' }, classPart(ctx, ed), racePart(ctx, ed), backgroundPart(ctx, ed)),
  );
  panel.addEventListener('toggle', () => storage.set(OPEN_KEY, panel.open ? '1' : '0'));
  return panel;
}
