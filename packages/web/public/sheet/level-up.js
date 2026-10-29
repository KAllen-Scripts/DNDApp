/**
 * Level up on the sheet (shared/level-up.js has the rules; the server applies it). Under the character's
 * name: a Level up button when the player may level up (always, or only once the DM has given a level, as
 * the campaign's setting says), and a note when the DM has given one. The dialog asks which class, hit points
 * (the average, or roll the hit die), a subclass when the class picks one at that level, and an Ability Score
 * Improvement or a feat at the levels that give one; it shows what the level brings before it's taken.
 */
import { api } from '../page/api.js';
import { ABILITIES, ABILITY_NAMES, CLASSES } from '/shared/sheet.js';
import { levelUp, levelUpChanges, levelUpChoices } from '/shared/level-up.js';
import { GENERAL_FEATS } from '/shared/feats.js';
import { roll } from '../dice/dice.js';
import { h } from '../page/dom.js';

/**
 * The note and button under the name. ctx: { state, base, flush, adopt (res: show the sheet the server
 * returned), status, edition () }.
 */
export function levelUpBanner(ctx) {
  const { state } = ctx;
  const text = h('span');
  const button = h('button', { type: 'button', class: 'ghost small level-up-open', onclick: () => openLevelUp(ctx) }, '⬆ Level up');
  const el = h('p', { class: 'level-up-banner small', role: 'status' }, text, ' ', button);
  state.renders.push(() => {
    const granted = state.sheet.levels_granted ?? 0;
    const { can } = levelUpChoices(state.sheet, { edition: ctx.edition() });
    const byDm = state.settings?.level_up === 'dm';
    el.hidden = !can || (byDm && !granted);
    el.classList.toggle('granted', granted > 0);
    text.textContent = granted ? `The DM has given you ${granted === 1 ? 'a level' : `${granted} levels`}.` : '';
  });
  return el;
}

const FEATS = [...new Set(GENERAL_FEATS.map((f) => f.feat))].sort();

/** The Level up dialog. */
export async function openLevelUp(ctx) {
  const { state } = ctx;
  await ctx.flush();
  const edition = ctx.edition();
  const choices = levelUpChoices(state.sheet, { edition });
  if (!choices.can) return ctx.status(choices.why, true);
  let d = document.querySelector('#level-up-dialog');
  if (!d) {
    d = h('dialog', { id: 'level-up-dialog', class: 'map-dialog level-up-dialog', 'aria-label': 'Level up' });
    document.body.append(d);
  }
  const all = [...choices.classes.map((c) => ({ ...c, value: `c${c.index}` })), ...choices.others.map((c) => ({ ...c, value: `n${c.key}` }))];
  const pick = h('select', { 'aria-label': 'Class to take a level in', id: 'level-up-class' },
    h('optgroup', { label: 'Your classes' }, choices.classes.map((c) => new Option(`${c.name} ${c.level} → ${c.next}`, `c${c.index}`))),
    h('optgroup', { label: 'A new class (multiclass)' }, choices.others.map((c) => new Option(`${c.name} 1`, `n${c.key}`))));
  const chosen = () => all.find((c) => c.value === pick.value);
  const warning = h('p', { class: 'small level-up-warning' });
  // Hit points: the average or a roll of the hit die (the server rolls it; Constitution is added).
  const hpAverage = h('input', { type: 'radio', name: 'level-up-hp', value: 'average', checked: true });
  const hpRoll = h('input', { type: 'radio', name: 'level-up-hp', value: 'roll' });
  const averageText = h('span');
  const rollText = h('span');
  // Subclass, when the class picks one at this level.
  const subclass = h('input', { type: 'text', 'aria-label': 'Subclass', maxlength: 80, list: 'level-up-subclasses' });
  const subclassList = h('datalist', { id: 'level-up-subclasses' });
  const subclassBox = h('label', { class: 'fld' }, h('span', {}, 'Subclass'), subclass, subclassList);
  // Ability Score Improvement or a feat.
  const asiKind = h('select', { 'aria-label': 'Ability Score Improvement or feat' },
    new Option('+2 to one ability score', 'two'), new Option('+1 to two ability scores', 'one'), new Option('A feat instead', 'feat'), new Option('Nothing now (I’ll do it by hand)', 'none'));
  const abilityPick = (label) => h('select', { 'aria-label': label }, ABILITIES.map((a) => new Option(`${ABILITY_NAMES[a]} (${state.sheet.abilities[a]})`, a)));
  const first = abilityPick('Ability to raise');
  const second = abilityPick('Second ability to raise');
  second.value = 'con';
  const feat = h('input', { type: 'text', 'aria-label': 'Feat', maxlength: 100, list: 'level-up-feats', placeholder: 'Which feat' });
  const asiBox = h('fieldset', { class: 'level-up-asi' }, h('legend', {}, edition === '2024' ? 'Ability Score Improvement (or another feat)' : 'Ability Score Improvement'),
    asiKind, first, second, feat, h('datalist', { id: 'level-up-feats' }, FEATS.map((f) => h('option', { value: f }))));
  const changes = h('ul', { class: 'small level-up-changes' });
  const result = h('p', { class: 'small', role: 'status' });

  const asi = () => {
    if (asiBox.hidden) return undefined;
    if (asiKind.value === 'two') return { [first.value]: 2 };
    if (asiKind.value === 'one') return first.value === second.value ? { [first.value]: 2 } : { [first.value]: 1, [second.value]: 1 };
    return undefined;
  };
  const choiceNow = () => {
    const c = chosen();
    return {
      ...(c.value.startsWith('c') ? { class: c.index } : { new_class: CLASSES[c.key].name }),
      ...(!subclassBox.hidden && subclass.value.trim() && { subclass: subclass.value.trim() }),
      ...(asi() && { asi: asi() }),
      ...(!asiBox.hidden && asiKind.value === 'feat' && feat.value.trim() && { feat: feat.value.trim() }),
    };
  };
  const draw = () => {
    const c = chosen();
    const con = Math.floor((state.sheet.abilities.con - 10) / 2);
    const plus = con ? ` ${con > 0 ? '+' : '−'} ${Math.abs(con)} Constitution` : '';
    averageText.textContent = ` Take the average: ${c.average}${plus}`;
    rollText.textContent = ` Roll a d${c.die}${plus} (the dice show it)`;
    warning.textContent = c.needs ? `Multiclassing rules: ${c.needs}. Your DM can allow it anyway.` : '';
    warning.hidden = !c.needs;
    subclassBox.hidden = !c.needsSubclass;
    subclassList.replaceChildren(...(c.subclasses ?? []).map((n) => h('option', { value: n })));
    asiBox.hidden = !c.asi;
    second.hidden = asiKind.value !== 'one';
    first.hidden = !['one', 'two'].includes(asiKind.value);
    feat.hidden = asiKind.value !== 'feat';
    // What the level brings (with average hit points; a roll changes those).
    try {
      const after = levelUp(state.sheet, { ...choiceNow(), hp: null }, { edition }).sheet;
      changes.replaceChildren(...levelUpChanges(state.sheet, after, { edition }).map((line) => h('li', {}, line)));
    } catch (err) {
      changes.replaceChildren(h('li', { class: 'error' }, err.message));
    }
  };
  for (const el of [pick, asiKind, first, second]) el.addEventListener('change', draw);
  for (const el of [subclass, feat]) el.addEventListener('input', draw);

  const take = async () => {
    const body = { ...choiceNow(), hp: hpRoll.checked ? 'roll' : 'average' };
    const name = chosen().name;
    const done = (res) => {
      d.close();
      ctx.adopt(res);
      ctx.status(`Levelled up: ${name} ${res.entry.level}, ${res.gained >= 0 ? '+' : ''}${res.gained} maximum hit points${res.entry.hp != null ? ` (rolled ${res.entry.hp})` : ''}. Add any new spells in Spells.`);
    };
    if (body.hp === 'roll') {
      // The dice tray shows the roll; errors show there too.
      await roll('', { label: `Hit points for a new level (d${chosen().die})`, path: `${ctx.base()}/sheet/level-up`, body, onServer: done });
      return;
    }
    try {
      const res = await state.guarded(() => api('POST', `${ctx.base()}/sheet/level-up`, body));
      if (res) done(res);
    } catch (err) {
      result.textContent = `Couldn’t level up: ${err.message}`;
    }
  };

  d.replaceChildren(h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => { e.preventDefault(); take(); } },
    h('h2', {}, `Level up to ${choices.total + 1}`),
    h('label', { class: 'fld' }, h('span', {}, 'Take a level in'), pick),
    warning,
    h('fieldset', { class: 'level-up-hp' }, h('legend', {}, 'Hit points'),
      h('label', { class: 'check' }, hpAverage, averageText), h('label', { class: 'check' }, hpRoll, rollText)),
    subclassBox,
    asiBox,
    h('h3', {}, 'What you get'),
    changes,
    h('p', { class: 'muted small' }, 'Class features are added to your sheet. New spells and anything else the level gives you are yours to add; everything stays editable.'),
    result,
    h('div', { class: 'map-dialog-actions' },
      h('button', { type: 'button', class: 'ghost', onclick: () => d.close() }, 'Cancel'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'submit', class: 'primary' }, 'Level up')),
  ));
  draw();
  d.showModal();
}
