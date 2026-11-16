/**
 * The character builder (the 2026-11 redesign's "Builder 1: steps"; SPEC §6.4 "Character builder"):
 * Class, Race or Species, Background, Ability scores, Skills, Equipment, Spells, Details, one step at a
 * time, above the sheet's header-and-tabs (the tabs are hidden while it's open). It opens by itself on a
 * new, empty character, and from ⚒ Build in the header.
 *
 * Everything it does can be taken back (the owner, 2026-11-15): while it's open, every change to the
 * sheet (made in the builder or anywhere else) is remembered, and **Undo** steps back one at a time;
 * **Start over** puts the sheet back exactly as it was when the builder opened (kept in this browser,
 * so it works after a reload). Closing keeps what was built.
 */
import { h, $ } from '../page/dom.js';
import { api, storage } from '../page/api.js';
import { ABILITIES, ABILITY_NAMES, SKILLS, classKey, normalizeSheet, normalizeSpell } from '/shared/sheet.js';
import { classHelp, raceHelp, skillPicks } from '/shared/creation-help.js';
import { changePointBuy, pointBuy } from '/shared/point-buy.js';
import { equipmentItems, equipmentOptions } from '/shared/starting-gear.js';
import { addToInventory } from '/shared/gear.js';
import { ITEM_NAMES } from '/shared/item-names.js';
import { HELP_PARTS, WORDS, editionOf, skillChip } from './creation-help.js';
import { sheetBackground } from './background.js';

const BUILD_KEY = 'dndapp.build';
const SKIP_KEY = 'dndapp.buildSkip';
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
/** Changes this close together while typing in a box are one step of Undo (typing a name). */
const TYPING_MS = 1500;
const typing = () => !!document.activeElement?.matches?.('input[type=text], textarea');

const STEPS = [
  ['class', 'Class'], ['race', 'Race'], ['background', 'Background'], ['abilities', 'Ability scores'],
  ['skills', 'Skills'], ['equipment', 'Equipment'], ['spells', 'Spells'], ['details', 'Details'],
];
const METHODS = [['point-buy', 'Point buy'], ['array', 'Standard array'], ['roll', 'Roll 4d6'], ['manual', 'Type them in']];

/**
 * The build in progress (one at a time, for one character): the sheet as it was when it opened
 * (`start`, also kept in this browser), the sheets before each change since (`history`, Undo), the
 * step showing, and the builder's own choices (how scores are made, equipment options).
 */
let build = null;
const spellLists = new Map(); // "Wizard:1" → the SRD spells it can learn (from the server)

const keyOf = (state) => `${state.campaignId}:${state.number}`;
const skipped = (state) => { try { return JSON.parse(storage.get(SKIP_KEY) ?? '[]').includes(keyOf(state)); } catch { return false; } };
function setSkipped(state, on) {
  let list = [];
  try { list = JSON.parse(storage.get(SKIP_KEY) ?? '[]'); } catch { /* broken: start again */ }
  list = list.filter((k) => k !== keyOf(state));
  if (on) list.push(keyOf(state));
  storage.set(SKIP_KEY, JSON.stringify(list.slice(-50)));
}
function keep() {
  if (!build) return storage.set(BUILD_KEY, null);
  const { key, start, step, method, pool, assign, gear, gearAdded, spellClass, levelled } = build;
  storage.set(BUILD_KEY, JSON.stringify({ key, start, step, method, pool, assign, gear, gearAdded, spellClass, levelled }));
}

/** A new character: nothing picked or typed that the builder fills in. */
const isNew = (sheet) => !sheet.classes.some((c) => c.name.trim()) && !sheet.race.trim() && !sheet.background.trim();

/**
 * Open the builder on this character (⚒ Build), on a step: after a level up, on Spells for the class
 * that went up (`spellClass`, its row on the sheet). Undo and Start over go back to the sheet as it is now.
 */
export function openBuilder(ctx, step = 'class', { spellClass = null, levelled = null } = {}) {
  const { state } = ctx;
  build = { key: keyOf(state), start: structuredClone(state.sheet), step, history: [], last: JSON.stringify(state.sheet), at: 0, assign: {}, gear: {}, gearAdded: false, spellClass, levelled };
  setSkipped(state, false);
  keep();
  ctx.render();
}

/** Close it, keeping what was built; it won't open by itself again on this character (⚒ Build does). */
function closeBuilder(ctx) {
  setSkipped(ctx.state, true);
  build = null;
  keep();
  ctx.render();
}

/** Put the sheet back as it was in `json` (Undo, Start over) and save that. */
function restore(ctx, json) {
  ctx.state.sheet = normalizeSheet(JSON.parse(json));
  build.last = JSON.stringify(ctx.state.sheet);
  build.at = 0;
  ctx.render();
  ctx.changed();
}

/** ⚒ Build in the header (Edit mode). */
export function builderButton(ctx) {
  return h('button', { type: 'button', class: 'ghost build-open edit-only', title: 'Build this character step by step: everything it does can be undone', onclick: () => (build ? closeBuilder(ctx) : openBuilder(ctx)) },
    h('span', { 'aria-hidden': 'true' }, '⚒ '), h('span', { class: 'btn-text' }, 'Build'));
}

/**
 * The builder, drawn with the sheet (or nothing when it's closed).
 * @param {{ state, changed, render, field, pointBuyBox, roll, base, edition }} ctx
 */
export function builderPanel(ctx) {
  const { state } = ctx;
  // A build left open in this browser (a reload) comes back; another character's doesn't.
  if (!build) {
    try {
      const kept = JSON.parse(storage.get(BUILD_KEY) ?? 'null');
      if (kept?.key === keyOf(state)) build = { ...kept, assign: kept.assign ?? {}, gear: kept.gear ?? {}, history: [], last: JSON.stringify(state.sheet), at: 0 };
    } catch { /* nothing kept */ }
  }
  if (build && build.key !== keyOf(state)) build = null;
  if (!build && isNew(state.sheet) && !skipped(state)) {
    build = { key: keyOf(state), start: structuredClone(state.sheet), step: 'class', history: [], last: JSON.stringify(state.sheet), at: 0, assign: {}, gear: {}, gearAdded: false, fresh: true };
    keep();
  }
  $('#sheet')?.classList.toggle('building', !!build);
  if (!build) return h('span', { hidden: true });

  const ed = editionOf(state);
  const words = WORDS(ed);
  const stepName = (k, n) => (k === 'race' ? words.race : n);
  const at = STEPS.findIndex(([k]) => k === build.step);
  const go = (k) => { build.step = k; build.fresh = false; keep(); ctx.render(); };

  // Undo: every change to the sheet while the builder is open, one step at a time.
  const undo = h('button', { type: 'button', class: 'ghost small build-undo', onclick: () => restore(ctx, build.history.pop()) });
  const paintUndo = () => {
    undo.disabled = !build.history.length;
    undo.textContent = build.history.length ? `↶ Undo (${build.history.length})` : '↶ Undo';
  };
  state.renders.push(() => {
    if (!build) return;
    const now = JSON.stringify(state.sheet);
    if (now === build.last) return;
    if (!(typing() && Date.now() - build.at < TYPING_MS && build.history.length)) build.history.push(build.last);
    build.last = now;
    build.at = Date.now();
    paintUndo();
  });
  paintUndo();
  const startOver = h('button', { type: 'button', class: 'ghost small build-reset', title: 'Put the sheet back exactly as it was when the builder opened' }, 'Start over');
  startOver.addEventListener('click', () => {
    if (startOver.dataset.sure !== '1') {
      startOver.dataset.sure = '1';
      startOver.textContent = 'Sure? Undo everything';
      setTimeout(() => { startOver.dataset.sure = ''; startOver.textContent = 'Start over'; }, 5000);
      return;
    }
    build.history = [];
    build.gearAdded = false;
    restore(ctx, JSON.stringify(build.start));
  });

  const steps = h('nav', { class: 'build-steps', role: 'tablist', 'aria-label': 'Builder steps' }, STEPS.map(([k, n], i) => h('button', {
    type: 'button', role: 'tab', 'data-step': k, 'aria-selected': String(k === build.step),
    class: `build-step${k === build.step ? ' on' : ''}${done(ctx, k) ? ' done' : ''}`,
    onclick: () => go(k),
  }, h('span', { class: 'build-n' }, done(ctx, k) ? '✓' : String(i + 1)), h('span', {}, stepName(k, n)))));

  const body = STEP_BODIES[build.step](ctx, ed);
  const prev = STEPS[at - 1];
  const next = STEPS[at + 1];
  return h('section', { class: 'builder', 'aria-label': 'Character builder' },
    h('header', { class: 'build-head' },
      h('div', {}, h('h2', {}, 'Build your character'), h('p', { class: 'muted small' }, `${ed} rules. Undo takes back any change; Start over puts the sheet back as it was.`)),
      h('div', { class: 'build-actions' }, undo, startOver,
        h('button', { type: 'button', class: 'small build-close', onclick: () => closeBuilder(ctx) }, 'Close builder'))),
    build.fresh ? h('p', { class: 'build-intro' },
      'A new character: work through the steps, or ',
      h('button', { type: 'button', class: 'link build-upload', onclick: () => { closeBuilder(ctx); $('#sheet-upload')?.click(); } }, 'upload a sheet instead'),
      ', or ',
      h('button', { type: 'button', class: 'link build-skip', onclick: () => closeBuilder(ctx) }, 'skip to the blank sheet'),
      '.') : null,
    steps,
    h('div', { class: 'build-body', role: 'tabpanel', 'data-step': build.step }, body),
    h('footer', { class: 'build-foot' },
      prev ? h('button', { type: 'button', class: 'ghost build-back', onclick: () => go(prev[0]) }, `← ${stepName(...prev)}`) : h('span'),
      next ? h('button', { type: 'button', class: 'primary build-next', onclick: () => go(next[0]) }, `${stepName(...next)} →`)
        : h('button', { type: 'button', class: 'primary build-finish', onclick: () => closeBuilder(ctx) }, 'Finish')),
  );
}

/** Whether a step looks done (a ✓ on its tab; nothing is required). */
function done({ state }, step) {
  const s = state.sheet;
  const ed = editionOf(state);
  const c = firstClass(state, ed);
  switch (step) {
    case 'class': return s.classes.some((x) => x.name.trim());
    case 'race': return !!s.race.trim();
    case 'background': return !!s.background.trim();
    case 'abilities': return ABILITIES.some((a) => Number(s.abilities[a]) !== 10);
    case 'skills': return !!c && !skillPicks(s, c).left;
    case 'equipment': return !!build?.gearAdded || s.inventory.length > 0;
    case 'spells': return s.spells.length > 0;
    case 'details': return !!(s.name.trim() && (s.alignment.trim() || s.backstory.trim() || s.personality.trim()));
    default: return false;
  }
}

const firstClass = (state, ed) => {
  const key = classKey(state.sheet.classes[0]?.name ?? '');
  return key ? classHelp(key, ed) : null;
};

const partCtx = (ctx) => ({ state: ctx.state, changed: ctx.changed, redraw: ctx.render, again: ctx.render, inBuilder: true });
const nothing = (text) => h('p', { class: 'muted' }, text);

// ---------- the steps ----------

const STEP_BODIES = {
  class: (ctx, ed) => HELP_PARTS.class(partCtx(ctx), ed),
  race: (ctx, ed) => HELP_PARTS.race(partCtx(ctx), ed),
  background: (ctx, ed) => HELP_PARTS.background(partCtx(ctx), ed),
  abilities: abilitiesStep,
  skills: skillsStep,
  equipment: equipmentStep,
  spells: spellsStep,
  details: detailsStep,
};

function abilitiesStep(ctx) {
  const { state } = ctx;
  const method = build.method ?? (state.sheet.point_buy.on ? 'point-buy' : 'array');
  const choose = (m) => {
    build.method = m;
    keep();
    if (m === 'point-buy' && !state.sheet.point_buy.on) {
      state.sheet.point_buy.on = true;
      ctx.render();
      ctx.changed();
    } else ctx.render();
  };
  const chips = h('div', { class: 'help-chips', role: 'radiogroup', 'aria-label': 'How to make the scores' }, METHODS.map(([k, n]) => h('button', {
    type: 'button', role: 'radio', class: `help-chip${k === method ? ' on' : ''}`, 'aria-checked': String(k === method), 'data-method': k, onclick: () => choose(k),
  }, n)));
  let part;
  if (method === 'point-buy') part = ctx.pointBuyBox({ id: 'point-buy-build' });
  else if (method === 'manual') {
    part = h('div', { class: 'build-scores' }, ABILITIES.map((a) => h('label', {}, h('span', {}, ABILITY_NAMES[a]), ctx.field(`abilities.${a}`, { label: `${ABILITY_NAMES[a]} score (builder)`, kind: 'int' }))));
  } else part = assignTable(ctx, method);
  return h('section', { class: 'help-part' },
    h('h4', {}, 'Ability scores'),
    h('p', { class: 'muted small' }, 'Point buy spends 27 points; the standard array is 15, 14, 13, 12, 10 and 8 to place; rolling is 4d6 six times, the lowest die dropped (rolled by the server, so the table sees them). Bonuses from your race or background are added.'),
    chips, part);
}

/** The standard array or rolled scores: one to each ability, with its bonus. */
function assignTable(ctx, method) {
  const { state } = ctx;
  const pool = method === 'array' ? STANDARD_ARRAY : build.pool ?? [];
  const assign = (build.assign[method] ??= {});
  const pb = pointBuy(state.sheet, state.settings);
  const apply = (next) => {
    Object.assign(state.sheet.abilities, next.abilities);
    state.sheet.point_buy = next.point_buy ?? state.sheet.point_buy;
    ctx.render();
    ctx.changed();
  };
  const rows = ABILITIES.map((a) => {
    const taken = new Set(Object.entries(assign).filter(([b]) => b !== a).map(([, i]) => i));
    const pick = h('select', { 'aria-label': `${ABILITY_NAMES[a]}: score to place` },
      new Option('–', ''), ...pool.map((v, i) => (taken.has(i) ? null : new Option(String(v), String(i)))).filter(Boolean));
    pick.value = assign[a] != null && !taken.has(assign[a]) ? String(assign[a]) : '';
    pick.addEventListener('change', () => {
      if (pick.value === '') delete assign[a];
      else assign[a] = Number(pick.value);
      keep();
      if (pick.value !== '') state.sheet.abilities[a] = Math.min(30, pool[Number(pick.value)] + pb.abilities[a].bonus);
      ctx.render();
      ctx.changed();
    });
    const x = pb.abilities[a];
    const closed = pb.choose === 0 || pb.not.includes(a) || (pb.allowed && !pb.allowed.includes(a) && !x.chosen);
    const bonus = closed ? null : h('select', { 'aria-label': `${ABILITY_NAMES[a]} bonus you choose (builder)` }, ['', '1', '2'].filter((v) => v !== '2' || pb.max >= 2).map((v) => new Option(v ? `+${v}` : '–', v)));
    if (bonus) {
      bonus.value = x.chosen ? String(x.chosen) : '';
      bonus.addEventListener('change', () => {
        const choice = Object.fromEntries(ABILITIES.map((b) => [b, b === a ? Number(bonus.value) : pb.abilities[b].chosen]));
        apply(changePointBuy(state.sheet, { choice }, state.settings));
      });
    }
    return h('tr', {}, h('th', { scope: 'row' }, ABILITY_NAMES[a]), h('td', {}, pick), h('td', {}, x.fixed ? `+${x.fixed} ` : '', bonus), h('td', { class: 'build-score' }, String(x.score)));
  });
  const rollButton = method === 'roll' ? h('button', { type: 'button', class: 'build-roll', onclick: () => rollScores(ctx) }, build.pool ? 'Roll again' : 'Roll the six scores') : null;
  return h('div', { class: 'build-assign' },
    rollButton,
    method === 'roll' && build.pool ? h('p', { class: 'small' }, `Rolled: ${build.pool.join(', ')}.`) : null,
    pool.length ? h('table', { class: 'pb-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Ability'), h('th', {}, 'Score'), h('th', {}, 'Bonus'), h('th', {}, 'Total'))), h('tbody', {}, rows)) : null,
    pb.problems.length && pb.rules === '2024' ? h('p', { class: 'muted small' }, pb.problems.filter((p) => !/point buy|points? over/.test(p)).join(' ')) : null);
}

/** Roll 4d6 six times on the server (the table sees them), keeping the best three of each. */
async function rollScores(ctx) {
  const scores = [];
  for (let i = 1; i <= 6; i++) {
    await ctx.roll('4d6', {
      label: `Ability score ${i} of 6 (4d6, the lowest dropped)`,
      onServer: (r) => {
        const dice = (r.terms ?? []).flatMap((t) => t.dice ?? []).filter((d) => d.kept !== false).map((d) => d.value);
        scores.push(dice.reduce((n, v) => n + v, 0) - (dice.length ? Math.min(...dice) : 0));
      },
    });
  }
  if (!build || scores.length !== 6) return;
  build.pool = scores.sort((a, b) => b - a);
  build.assign.roll = {};
  keep();
  ctx.render();
}

function skillsStep(ctx, ed) {
  const { state } = ctx;
  const pc = partCtx(ctx);
  const c = firstClass(state, ed);
  const r = raceHelp(state.sheet.race, ed);
  const b = sheetBackground(state);
  const line = (label, ...rest) => h('div', { class: 'help-line' }, h('span', { class: 'help-label' }, label), h('span', {}, ...rest));
  const picks = c ? skillPicks(state.sheet, c) : null;
  return h('section', { class: 'help-part' },
    h('h4', {}, 'Skills'),
    c ? line(`${c.name}`, `Choose ${c.skills.choose}: `, h('span', { class: `help-count${picks.left ? '' : ' done'}` }, `${picks.picked.length} of ${c.skills.choose} ticked`),
      h('span', { class: 'help-chips' }, c.skills.from.map((k) => skillChip(pc, k, { max: c.skills.choose, count: picks.picked.length })))) : nothing('Pick a class first to see its skills.'),
    b?.skills.length ? line(`${b.name} (background)`, h('span', { class: 'help-chips' }, b.skills.map((k) => skillChip(pc, k)))) : null,
    r?.skills.length ? line(r.name, h('span', { class: 'help-chips' }, r.skills.map((k) => skillChip(pc, k)))) : null,
    r?.skill_pick ? line(`${r.name}: choose one`, h('span', { class: 'help-chips' }, r.skill_pick.map((k) => skillChip(pc, k)))) : null,
    r?.skill_choice ? line(r.name, `Choose ${r.skill_choice} of any below.`) : null,
    h('details', { class: 'help-more' }, h('summary', {}, 'Every skill'), h('span', { class: 'help-chips' }, Object.keys(SKILLS).map((k) => skillChip(pc, k)))));
}

function equipmentStep(ctx, ed) {
  const { state } = ctx;
  const c = firstClass(state, ed);
  if (!c) return nothing('Pick a class first to see its starting equipment.');
  const lines = c.equipment.map((line, li) => {
    const options = equipmentOptions(line);
    const chosen = Math.min(build.gear[li]?.option ?? 0, options.length - 1);
    const picks = build.gear[li]?.picks ?? {};
    const { items, gold } = equipmentItems(options[chosen]);
    const set = (change) => { build.gear[li] = { option: chosen, picks, ...change }; keep(); ctx.render(); };
    return h('fieldset', { class: 'build-gear', 'data-line': li },
      h('legend', {}, options.length > 1 ? 'Choose one' : 'You get'),
      options.length > 1 ? h('div', { class: 'help-chips' }, options.map((o, i) => h('button', {
        type: 'button', class: `help-chip${i === chosen ? ' on' : ''}`, 'aria-pressed': String(i === chosen), onclick: () => set({ option: i, picks: {} }),
      }, o))) : null,
      h('ul', { class: 'small' },
        items.map((it, j) => h('li', {}, it.qty > 1 ? `${it.qty} × ` : '',
          it.pick ? h('select', { 'aria-label': `Which ${it.label}`, onchange: (e) => set({ picks: { ...picks, [j]: e.target.value } }) },
            it.pick.map((n) => h('option', { value: n, selected: (picks[j] ?? it.name) === n }, n))) : it.name)),
        gold ? h('li', {}, `${gold} gp`) : null));
  });
  const add = () => {
    const ck = classKey(c.name);
    let inv = state.sheet.inventory;
    let gp = 0;
    c.equipment.forEach((line, li) => {
      const options = equipmentOptions(line);
      const chosen = Math.min(build.gear[li]?.option ?? 0, options.length - 1);
      const picks = build.gear[li]?.picks ?? {};
      const { items, gold } = equipmentItems(options[chosen]);
      gp += gold;
      items.forEach((it, j) => {
        const name = picks[j] ?? it.name;
        const kind = ITEM_NAMES.gear.includes(name) ? 'gear' : ITEM_NAMES.tool.includes(name) ? 'tool' : 'other';
        inv = addToInventory(inv, { name, kind }, it.qty, { classKey: ck, edition: ed });
      });
    });
    state.sheet.inventory = inv;
    state.sheet.coins.gp = (Number(state.sheet.coins.gp) || 0) + gp;
    build.gearAdded = true;
    keep();
    ctx.render();
    ctx.changed();
  };
  return h('section', { class: 'help-part' },
    h('h4', {}, `${c.name} starting equipment`),
    lines,
    build.gearAdded
      ? h('p', { class: 'build-done' }, '✓ In your inventory now (Undo takes it back out). Equip armour and weapons on the Inventory tab.')
      : h('button', { type: 'button', class: 'primary build-add-gear', onclick: add }, 'Put these in my inventory'),
    String(state.sheet.equipment ?? '').trim() ? h('p', { class: 'muted small' }, 'Your background\'s equipment is in the Equipment box on the Inventory tab.') : null);
}

function spellsStep(ctx, ed) {
  const { state } = ctx;
  // The classes that cast: one at a time (after a level up, the one that went up).
  const casters = state.sheet.classes.map((row, i) => ({ i, c: classKey(row.name) && classHelp(classKey(row.name), ed) })).filter((x) => x.c?.spells);
  const first = firstClass(state, ed);
  if (!first && !casters.length) return nothing('Pick a class first.');
  if (!casters.length) return nothing(`${first.name}s don't cast spells (a subclass might, later: see Level up).`);
  const showing = casters.find((x) => x.i === build.spellClass) ?? casters[0];
  const c = showing.c;
  const which = casters.length > 1 ? h('div', { class: 'help-chips' }, casters.map((x) => h('button', {
    type: 'button', class: `help-chip${x === showing ? ' on' : ''}`, onclick: () => { build.spellClass = x.i; keep(); ctx.render(); },
  }, x.c.name))) : null;
  const values = state.calc.values;
  const top = Math.max(0, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => Number(values[`slots.${n}`]) > 0), Number(values.pact_slots) > 0 ? Number(values.pact_level) || 0 : 0);
  const key = `${editionOf(ctx.state)}:${c.name}:${top}`;
  const list = h('div', { class: 'build-spells' }, spellLists.has(key) ? null : nothing('Finding the spells…'));
  const draw = (spells) => {
    if (!spells.length) return list.replaceChildren(nothing(top ? `No ${c.name.toLowerCase()} spell list here: find spells by name below.` : `No ${c.name.toLowerCase()} spells at this level yet.`));
    const has = (sp) => state.sheet.spells.some((s) => s.name.toLowerCase() === sp.name.toLowerCase());
    const groups = new Map();
    for (const sp of spells) {
      if (!groups.has(sp.level)) groups.set(sp.level, []);
      groups.get(sp.level).push(sp);
    }
    list.replaceChildren(...[...groups].map(([level, group]) => h('section', { class: 'build-spell-group' },
      h('h5', {}, level ? `Level ${level}` : 'Cantrips', h('span', { class: 'muted small' }, ` · ${group.filter(has).length} chosen`)),
      h('ul', {}, group.map((sp) => {
        const box = h('input', { type: 'checkbox', checked: has(sp), 'aria-label': `${sp.name} on my sheet` });
        box.addEventListener('change', () => {
          if (box.checked) {
            const { details, ...spell } = sp;
            addSpell(ctx, spell, { lookUp: !details, done: () => draw(spells) });
          } else {
            state.sheet.spells = state.sheet.spells.filter((x) => x.name.toLowerCase() !== sp.name.toLowerCase());
            ctx.changed();
          }
          draw(spells);
        });
        return h('li', {}, h('label', { title: sp.description?.slice(0, 300) ?? '' }, box, ' ', h('strong', {}, sp.name),
          h('span', { class: 'muted small' }, ` ${[sp.school, sp.casting_time, sp.concentration && 'concentration', sp.ritual && 'ritual', !sp.details && sp.source_note].filter(Boolean).join(' · ')}`)));
      })))));
  };
  if (spellLists.has(key)) draw(spellLists.get(key));
  else {
    api('GET', `${ctx.base()}/spells/class?name=${encodeURIComponent(c.name)}&level=${top}`)
      .then((spells) => { spellLists.set(key, spells ?? []); draw(spells ?? []); })
      .catch((err) => list.replaceChildren(nothing(`Couldn't load the spell list: ${err.message}`)));
  }
  return h('section', { class: 'help-part' },
    h('h4', {}, `${c.name} spells`),
    build.levelled ? h('p', { class: 'build-done' }, `${build.levelled}: tick the spells the new level gives you.`) : null,
    which,
    h('p', { class: 'small' }, c.spells),
    top ? null : h('p', { class: 'muted small' }, 'No spell slots yet: just cantrips for now (spells come with a later level).'),
    list,
    ed === '2024' ? h('p', { class: 'muted small' }, "The 2024 Player's Handbook's new spells are on these lists by name; which classes get them hasn't been checked against the book yet.") : null,
    otherSpell(ctx));
}

/**
 * Put a spell on the sheet, prepared. One from the Player's Handbook beyond the SRD (or found by name)
 * has its details looked up (the group's books, else the AI): filling them in is part of the same Undo step.
 */
function addSpell(ctx, spell, { lookUp = false, done = () => {}, note = null } = {}) {
  const { state } = ctx;
  if (state.sheet.spells.some((x) => x.name.toLowerCase() === spell.name.toLowerCase())) return;
  const added = normalizeSpell({ ...structuredClone(spell), prepared: true });
  state.sheet.spells.push(added);
  ctx.changed();
  if (!lookUp) return done();
  if (note) note.textContent = `Looking up ${spell.name}…`;
  api('GET', `${ctx.base()}/spells/lookup?name=${encodeURIComponent(spell.name)}`).then((found) => {
    const now = state.sheet.spells.find((x) => x.name.toLowerCase() === spell.name.toLowerCase());
    if (!found || !now || !build) return;
    Object.assign(now, { ...found, id: now.id, prepared: now.prepared, level: found.level ?? now.level });
    build.last = JSON.stringify(state.sheet); // the details join the step that added it
    if (note) note.textContent = `${found.name}: details from ${found.source_note || found.source || 'the lookup'}.`;
    ctx.changed();
    done();
  }).catch((err) => {
    if (note) note.textContent = `Added ${spell.name}; its details weren't found (${err.message}): fill them in on the Spells tab.`;
  });
}

/** Any other spell, by name: other books (Xanathar's, Tasha's…), found in the group's books or by the AI. */
function otherSpell(ctx) {
  const input = h('input', { type: 'text', placeholder: 'Any spell, e.g. Toll the Dead', list: 'dl-build-spells', autocomplete: 'off', 'aria-label': 'Another spell to add (builder)' });
  const names = h('datalist', { id: 'dl-build-spells' });
  const note = h('span', { class: 'muted small' });
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) return;
      const found = await api('GET', `${ctx.base()}/spells?q=${encodeURIComponent(q)}`).catch(() => []);
      names.replaceChildren(...(found ?? []).map((x) => h('option', { value: x.name }, x.source === 'book' ? `${x.name} (${x.book})` : x.name)));
    }, 200);
  });
  const add = (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    input.value = '';
    addSpell(ctx, { name, source: 'manual' }, { lookUp: true, note });
  };
  return h('form', { class: 'build-other-spell', onsubmit: add },
    h('label', {}, h('span', { class: 'small' }, 'A spell from another book (your DM says yes): '), names, input),
    h('button', { type: 'submit', class: 'ghost small' }, 'Add'), note);
}

function detailsStep(ctx) {
  const f = (path, label, opts = {}) => h('label', { class: 'build-field' }, h('span', {}, label), ctx.field(path, { label: `${label} (builder)`, ...opts }));
  return h('section', { class: 'help-part build-details' },
    h('h4', {}, 'Details'),
    f('name', 'Name'),
    f('alignment', 'Alignment', { list: 'dl-alignments' }),
    f('appearance', 'Appearance', { kind: 'longtext', rows: 2 }),
    f('personality', 'Personality traits', { kind: 'longtext', rows: 2 }),
    f('ideals', 'Ideals', { kind: 'longtext', rows: 2 }),
    f('bonds', 'Bonds', { kind: 'longtext', rows: 2 }),
    f('flaws', 'Flaws', { kind: 'longtext', rows: 2 }),
    f('backstory', 'Backstory', { kind: 'longtext', rows: 4 }));
}
