/**
 * What class features add to the attacks on the character sheet: under each
 * attack, the extras this character can add (Sneak Attack, Divine Smite with
 * a slot, Hunter's Mark, a superiority die...) as buttons to tick, what's
 * already in (Rage, Dueling, Radiant Strikes), the weapon's mastery with its
 * numbers (2024 rules); at the top of the Attacks box, what's going on
 * (raging, Hunter's Mark, Hex) and the weapons the character has mastery with.
 *
 * The rules are in shared/attack-extras.js (planAttack, planSpell): this file
 * only shows them and rolls what they give back. sheet.js owns the sheet and
 * passes in what this needs.
 */
import { h } from './api.js';
import { roll } from './dice.js';
import {
  ACTIVE, MASTERY_PROPERTIES, WEAPON_MASTERY, masteryChoices, masteryLimit, normalizeCombat, planAttack, planSpell, spendForAttack, weaponMastery, weaponName,
} from './shared/attack-extras.js';
import { featureRow, restText } from './shared/class-features.js';
import { rollDisadvantage } from './shared/sheet.js';

const editionOf = (state) => state.settings?.edition || state.edition || '2014';
const combatOf = (state) => (state.sheet.combat = normalizeCombat(state.sheet.combat));

/** Extras picked for each attack on this page (not saved): key → { sneak_attack: true, ... }. */
const picked = new Map();
const picksFor = (key) => {
  if (!picked.has(key)) picked.set(key, {});
  return picked.get(key);
};

/** The plan for one attack now (shared/attack-extras.js planAttack). */
export function attackPlan(state, a, { key, weapon = null, two = false } = {}) {
  return planAttack(state.sheet, state.calc, a, { edition: editionOf(state), weapon, two, picks: picksFor(key) });
}

/**
 * After damage is rolled: spend what it used (a slot for a smite, a
 * superiority die...) and untick the once-a-turn extras, so the next attack
 * starts clean. Says what happened in the sheet's status line.
 */
function afterDamage(ctx, key, plan) {
  const { state, changed, render, status } = ctx;
  const picks = picksFor(key);
  const used = [];
  if (plan.spends.length) {
    try {
      const next = spendForAttack(state.sheet, plan.spends, { edition: editionOf(state), values: state.calc.values });
      state.sheet.spellcasting = next.spellcasting;
      state.sheet.class_features = next.class_features;
      used.push(...plan.spends.map((s) => (s.slot ? `a ${ordinal(s.slot)}-level slot (${s.name})` : s.pact ? `a Pact Magic slot (${s.name})` : `one ${featureRow(state.sheet, s.feature, { edition: editionOf(state), values: state.calc.values })?.name ?? s.name}`)));
    } catch (err) {
      status?.(err.message, true);
    }
  }
  const once = plan.extras.filter((x) => x.on && !x.auto && (x.once || x.spend || x.options));
  for (const x of once) delete picks[x.id];
  if (once.some((x) => x.id === 'divine_smite')) delete picks.smite_fiend;
  if (used.length || once.length) {
    changed();
    render();
    status?.([used.length && `Spent ${used.join(' and ')}.`, once.some((x) => x.once) && `${once.filter((x) => x.once).map((x) => x.name).join(' and ')}: once a turn.`].filter(Boolean).join(' '));
  }
}

/**
 * Roll an attack to hit, with its damage (and critical damage, from the
 * plan's crit range) offered with the result and the plan's notes shown.
 */
export function rollAttackPlan(ctx, { key, title, plan, mode, disadvantage = '' }) {
  const damage = plan.damage ?? (plan.flat != null ? String(plan.flat) : null);
  const then = damage || plan.notes.length ? {
    label: `${title}: damage`,
    notation: plan.damage,
    crit: plan.crit,
    crit_on: plan.crit_on,
    notes: [...(plan.flat != null ? [`Damage: ${plan.flat}${plan.type ? ` ${plan.type}` : ''} (no dice).`] : []), ...plan.notes],
    onRoll: () => afterDamage(ctx, key, plan),
  } : null;
  return roll(plan.hit, { label: `${title}: to hit`, mode, then, disadvantage });
}

/** Roll the damage straight away (the Dmg button). */
export function rollDamagePlan(ctx, { key, title, plan, label = '' }) {
  if (!plan.damage) {
    if (plan.flat != null) alert(`${title}: ${plan.flat} damage (no dice to roll).`);
    else alert(`Type the damage for ${title} first, like 1d8 slashing.`);
    return;
  }
  afterDamage(ctx, key, plan);
  roll(plan.damage, { label: `${title}: damage${label}` });
}

/**
 * The line under an attack: what's already added, the extras to tick (and
 * Divine Smite's slot), the weapon's mastery. paint() redraws it.
 */
export function extrasLine(ctx, { key, name = '', plan: getPlan, onPick }) {
  const el = h('div', { class: 'atk-extras small' });
  const picks = picksFor(key);
  const paint = () => {
    const plan = getPlan();
    if (!plan || (!plan.extras?.length && !plan.mastery)) { el.hidden = true; return el.replaceChildren(); }
    const auto = plan.extras.filter((x) => x.auto);
    const choose = plan.extras.filter((x) => !x.auto && !x.needs);
    const parts = [];
    if (auto.length) parts.push(h('span', { class: 'atk-auto', title: 'Added by your class features' }, `With ${auto.map((x) => `${x.name} ${x.detail}`).join(', ')}`));
    for (const x of choose) {
      const box = h('input', { type: 'checkbox', checked: x.on, 'aria-label': `${x.name}: ${name}` });
      box.addEventListener('change', () => {
        picks[x.id] = box.checked;
        if (!box.checked && x.id === 'divine_smite') delete picks.smite_fiend;
        onPick?.();
        paint();
      });
      const chip = h('label', { class: `atk-chip${x.on ? ' on' : ''}`, title: x.note || x.name }, box, ` ${x.name} `, h('span', { class: 'muted' }, x.detail ?? ''));
      parts.push(chip);
      if (x.id === 'divine_smite' && x.on) {
        const pick = h('select', { 'aria-label': 'Divine Smite slot' }, x.options.map((o) => h('option', { value: String(o.value) }, `${o.label}: ${o.dice}`)));
        pick.value = String(x.picked ?? x.options[0].value);
        pick.addEventListener('change', () => { picks.divine_smite = pick.value === 'free' ? 'free' : Number(pick.value); onPick?.(); paint(); });
        const fiend = plan.extras.find((y) => y.id === 'smite_fiend');
        const fb = h('input', { type: 'checkbox', checked: !!fiend?.on, 'aria-label': 'Divine Smite against a fiend or undead' });
        fb.addEventListener('change', () => { picks.smite_fiend = fb.checked; onPick?.(); paint(); });
        parts.push(pick, h('label', { class: 'atk-chip', title: '+1d8 against a fiend or undead' }, fb, ' vs fiend or undead'));
      }
    }
    if (plan.mastery) parts.push(h('span', { class: 'atk-mastery', title: plan.mastery.text }, h('strong', {}, `Mastery: ${plan.mastery.name}`), ` ${plan.mastery.line.replace(/^[^:]+:\s*/, '')}`));
    const sum = plan.parts.length > 1 ? h('span', { class: 'atk-total muted' }, `Damage: ${plan.damage ?? plan.flat} (${plan.parts.join(' + ')})${plan.crit_on < 20 ? ` · crit on ${plan.crit_on}–20` : ''}`) : null;
    el.replaceChildren(...parts, sum ?? '');
    el.hidden = !parts.length && !sum;
  };
  ctx.state.renders.push(paint);
  paint();
  return el;
}

/** A spell's extras line and plan (Agonizing Blast, Potent Spellcasting, Hex...). */
export function spellPlan(state, spell, slot, key) {
  return planSpell(state.sheet, state.calc, spell, { edition: editionOf(state), slot, picks: picksFor(key) });
}
export const spellPicks = picksFor;

/**
 * The top of the Attacks box: what's going on now (Raging, Hunter's Mark,
 * Hex: ticking Raging spends a Rage use) and, under the 2024 rules, the
 * weapons the character has mastery with, with a list to change them (after
 * a long rest).
 */
export function combatBar(ctx) {
  const { state, changed, render } = ctx;
  const el = h('div', { class: 'combat-bar small' });
  let choosing = false;
  let drawn = null;
  const paint = () => {
    const ed = editionOf(state);
    const combat = combatOf(state);
    const levels = (state.sheet.classes ?? []).map((c) => String(c.name).toLowerCase());
    const has = (re) => levels.some((n) => re.test(n));
    const limit = masteryLimit(state.sheet, ed);
    const key = JSON.stringify([ed, combat, limit, choosing, state.sheet.classes, (state.sheet.spells ?? []).map((s) => s.name)]);
    if (key === drawn) return;
    drawn = key;
    const toggles = [];
    const show = {
      rage: has(/barbarian/),
      bladesong: (state.sheet.classes ?? []).some((c) => /wizard/i.test(c.name) && /blade\s*sing/i.test(c.subclass ?? '')) || combat.on.bladesong,
      hunters_mark: has(/ranger/) || combat.on.hunters_mark || (state.sheet.spells ?? []).some((s) => /hunter'?s mark/i.test(s.name)),
      hex: has(/warlock/) || combat.on.hex || (state.sheet.spells ?? []).some((s) => /^hex$/i.test(s.name)),
    };
    for (const [id, name] of Object.entries(ACTIVE)) {
      if (!show[id]) continue;
      const box = h('input', { type: 'checkbox', checked: !!combat.on[id], 'aria-label': name });
      box.addEventListener('change', () => {
        const c = combatOf(state);
        // Starting a rage or a Bladesong spends a use.
        if (box.checked && (id === 'rage' || id === 'bladesong')) {
          const row = featureRow(state.sheet, id, { edition: ed, values: state.calc.values });
          if (row && row.max != null) {
            if (!row.left) {
              box.checked = false;
              return alert(`You have no ${row.name} left. ${restText(row.recharge)}`);
            }
            state.sheet.class_features.spent[id] = row.spent + 1;
          }
        }
        if (box.checked) c.on[id] = true;
        else delete c.on[id];
        changed();
        render();
      });
      toggles.push(h('label', { class: `atk-chip${combat.on[id] ? ' on' : ''}`, title: id === 'rage' ? 'Ticking it spends a Rage use; damage on Strength attacks goes up while it\'s on' : id === 'bladesong' ? 'Ticking it spends a Bladesong use; your AC and speed go up while it\'s on' : 'Adds its damage to your attacks (tick it under an attack when it\'s against another creature)' }, box, ` ${name}`));
    }
    const parts = [];
    if (toggles.length) parts.push(h('div', { class: 'combat-on' }, h('span', { class: 'lbl' }, 'Now'), ...toggles));
    if (limit) parts.push(masteryView(limit));
    el.replaceChildren(...parts);
    el.hidden = !parts.length;
  };

  /** Weapon Mastery: the chosen weapons and their properties; Change opens tick boxes. */
  function masteryView(limit) {
    const combat = combatOf(state);
    const chosen = combat.masteries;
    const head = h('div', { class: 'mastery-head' },
      h('strong', {}, 'Weapon Mastery'),
      h('span', { class: chosen.length > limit ? 'error' : 'muted' }, ` ${chosen.length} of ${limit}: `),
      chosen.length ? chosen.map((k, i) => h('span', { title: MASTERY_PROPERTIES[masteryProp(k)].text }, `${i ? ', ' : ''}${weaponName(k)} (${MASTERY_PROPERTIES[masteryProp(k)].name})`)) : h('span', { class: 'muted' }, 'none chosen yet'),
      ' ',
      h('button', { type: 'button', class: 'ghost small', 'aria-expanded': String(choosing), onclick: () => { choosing = !choosing; drawn = null; paint(); } }, choosing ? 'Done' : 'Change'),
    );
    if (!choosing) return h('div', { class: 'mastery' }, head);
    const options = masteryChoices(state.sheet, editionOf(state));
    return h('div', { class: 'mastery' }, head,
      h('p', { class: 'muted' }, `Pick ${limit} kinds of weapon; you can change them after a long rest. Each one's property applies when you attack with it.`),
      h('div', { class: 'mastery-list' }, options.map((o) => {
        const box = h('input', { type: 'checkbox', checked: chosen.includes(o.key), 'aria-label': `Mastery with ${o.name}` });
        box.addEventListener('change', () => {
          const c = combatOf(state);
          c.masteries = box.checked ? [...c.masteries, o.key] : c.masteries.filter((k) => k !== o.key);
          if (c.masteries.length > limit) ctx.status?.(`That's ${c.masteries.length} weapons; your class gives ${limit}. The DM has the last word.`, true);
          changed();
          drawn = null;
          paint();
          render();
        });
        return h('label', { class: 'check', title: MASTERY_PROPERTIES[o.property].text }, box, ` ${o.name} `, h('span', { class: 'muted' }, MASTERY_PROPERTIES[o.property].name));
      })),
    );
  }

  state.renders.push(paint);
  paint();
  return el;
}

const masteryProp = (key) => WEAPON_MASTERY[key];

/**
 * A weapon's mastery in the Inventory: its property and what it does, and,
 * when the character's class has Weapon Mastery (2024 rules), a tick box to
 * choose it. Null for a weapon without one.
 */
export function inventoryMastery(ctx, g) {
  const { state, changed, render } = ctx;
  const ed = editionOf(state);
  const m = weaponMastery(state.sheet, g.name, ed);
  if (!m) return null;
  if (!m.can) return h('span', { class: 'muted small gear-mastery', title: m.text }, `Mastery: ${m.name}${ed === '2024' ? ' (your class doesn\'t have Weapon Mastery)' : ' (2024 rules)'}`);
  const box = h('input', { type: 'checkbox', checked: m.chosen, 'aria-label': `Weapon mastery: ${g.name}` });
  box.addEventListener('change', () => {
    const c = combatOf(state);
    c.masteries = box.checked ? [...new Set([...c.masteries, m.key])] : c.masteries.filter((k) => k !== m.key);
    const limit = masteryLimit(state.sheet, ed);
    if (c.masteries.length > limit) ctx.status?.(`That's ${c.masteries.length} weapons with mastery; your class gives ${limit}. The DM has the last word.`, true);
    changed();
    render();
  });
  return h('label', { class: 'check small gear-mastery', title: m.text }, box, ` Mastery: ${m.name}`, h('span', { class: 'muted' }, ` · ${m.text}`));
}

/** Whether a roll from an attack has disadvantage from the sheet (heavy armour without the Strength...). */
export const attackDisadvantage = (state, ability) => rollDisadvantage(state.calc, { ability: ability === 'finesse' ? 'dex' : ability });

const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
