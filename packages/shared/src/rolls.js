/**
 * What the character sheet rolls: an attack's to-hit and damage, a spell's
 * attack or save DC and its damage, with the sheet's modifiers added.
 *
 * Plain JS like sheet.js and dice.js (which it uses): the page loads it from
 * /shared/rolls.js to build the rolls it asks the server for, and the tests
 * check the rules here.
 */
import { parseRoll } from './dice.js';

const DAMAGE_START = /^\s*((?:[+-]?\s*(?:\d*\s*d\s*(?:\d+|%)|\d+)\s*)+)/i;

/** "1d8+2 slashing" → { dice: "1d8+2", type: "slashing" }; dice is null without any. */
export function splitDamage(text) {
  const src = String(text ?? '');
  const m = DAMAGE_START.exec(src);
  if (!m) return { dice: null, type: src.trim() };
  try {
    return { dice: parseRoll(m[1]).notation, type: src.slice(m[0].length).trim() };
  } catch {
    // A plain number ("1 piercing") has no dice: it's still damage.
    const n = /^\s*(\d+)\s*$/.exec(m[1]);
    return n ? { dice: n[1], type: src.slice(m[0].length).trim() } : { dice: null, type: src.trim() };
  }
}

/**
 * Dice with more dice and a number added, like terms merged: ("1d8+2", 3) →
 * "1d8+5"; ("8d6", 0, "2d6") → "10d6". Without dice it's just the number
 * ("1", 3 → "4"), which the server can't roll, so null then.
 */
export function addToRoll(notation, n = 0, moreDice = null) {
  const terms = [];
  let constant = Number(n) || 0;
  const read = (text) => {
    for (const t of /d/i.test(text) ? parseRoll(text).terms : [{ sign: 1, value: Number(text) || 0 }]) {
      if (t.value !== undefined) constant += t.sign * t.value;
      else {
        const same = terms.find((x) => x.sides === t.sides && x.sign === t.sign);
        if (same) same.count += t.count;
        else terms.push({ ...t });
      }
    }
  };
  read(notation);
  if (moreDice) read(moreDice);
  if (!terms.length) return null;
  const dice = terms.map((t, i) => `${t.sign < 0 ? '-' : i ? '+' : ''}${t.count}d${t.sides}`).join('');
  return constant ? `${dice}${constant > 0 ? '+' : ''}${constant}` : dice;
}

/** A typed bonus or DC ("+5", "15"), or null when the box is blank or not a number. */
const typed = (text) => {
  const n = parseInt(String(text ?? '').replace(/^\s*\+/, ''), 10);
  return Number.isFinite(n) ? n : null;
};

/** The modifier for an attack ability ('' none, an ability, finesse, spell). */
export function abilityModifier(ability, values) {
  if (!ability) return 0;
  if (ability === 'finesse') return Math.max(values['mod.str'] ?? 0, values['mod.dex'] ?? 0);
  if (ability === 'spell') return values.spell_ability ? values[`mod.${values.spell_ability}`] ?? 0 : 0;
  return values[`mod.${ability}`] ?? 0;
}

/**
 * An attack's rolls, from computeSheet's values. Returns { kind, bonus (to
 * hit, with the automatic one in autoBonus), hit (notation, or null for a
 * save), dc and autoDc (for a save), save (the ability), damage (notation or
 * null), flat (damage with no dice: a number), type }.
 * To hit: proficiency (if proficient) + the ability's modifier + the magic
 * bonus, unless the player typed their own. Damage: the weapon's dice + the
 * ability's modifier (attacks only) + the magic bonus. Save DC: 8 +
 * proficiency + the ability's modifier, unless typed.
 */
export function attackRolls(a, { values }) {
  const mod = abilityModifier(a.ability, values);
  const magic = Number(a.magic) || 0;
  const pb = values.proficiency_bonus ?? 2;
  const autoBonus = (a.proficient ? pb : 0) + mod + magic;
  const bonus = typed(a.bonus) ?? autoBonus;
  const autoDc = 8 + pb + mod;
  const { dice, type } = splitDamage(a.damage);
  const plus = (a.kind === 'save' ? 0 : mod) + magic;
  const damage = dice ? addToRoll(dice, plus) : null;
  // Damage with no dice (an unarmed strike's 1) is a number, not a roll.
  const flat = dice && !damage ? Math.max(1, Number(dice) + plus) : null;
  return a.kind === 'save'
    ? { kind: 'save', bonus: null, autoBonus: null, hit: null, dc: typed(a.dc) ?? autoDc, autoDc, save: a.save, damage, flat, type }
    : { kind: 'attack', bonus, autoBonus, hit: d20(bonus), dc: null, autoDc: null, save: '', damage, flat, type };
}

const d20 = (bonus) => (bonus ? `1d20${bonus > 0 ? '+' : ''}${bonus}` : '1d20');

/** How many times a cantrip's damage has gone up by its character level: 0, then 1 at 5th, 2 at 11th, 3 at 17th. */
export const cantripSteps = (level) => (level >= 17 ? 3 : level >= 11 ? 2 : level >= 5 ? 1 : 0);

/**
 * A spell's rolls, from computeSheet's result, cast with a slot of `slot`
 * (default: its own level). Returns { kind: 'attack' | 'save' | '', hit
 * (d20 + spell attack bonus), dc (spell save DC), save, damage, type }.
 * Damage: its dice, plus higher_damage per slot level above its own (for a
 * cantrip, at 5th, 11th and 17th character level), plus the spellcasting
 * modifier if damage_mod is ticked.
 */
export function spellRolls(spell, { values, level }, slot = spell.level) {
  const steps = spell.level === 0 ? cantripSteps(level) : Math.max(0, (Number(slot) || 0) - (spell.level ?? 0));
  const { dice, type } = splitDamage(spell.damage);
  const more = splitDamage(spell.higher_damage).dice;
  const moreDice = more && steps && /d/i.test(more) ? addToRoll(more.replace(/^(\d*)d/i, (_, c) => `${(Number(c) || 1) * steps}d`)) : null;
  const mod = spell.damage_mod ? abilityModifier('spell', values) : 0;
  const damage = dice ? addToRoll(dice, mod, moreDice) : null;
  const kind = spell.attack || '';
  return {
    kind,
    hit: kind === 'attack' ? d20(values.spell_attack ?? 0) : null,
    bonus: kind === 'attack' ? values.spell_attack ?? 0 : null,
    dc: kind === 'save' ? values.spell_dc : null,
    save: kind === 'save' ? spell.save : '',
    damage,
    type,
  };
}

/** One die size up, for a versatile weapon used with two hands: "1d8 slashing" → "1d10 slashing". */
const biggerDie = (damage) => String(damage ?? '').replace(/d(4|6|8|10)\b/, (_, n) => `d${{ 4: 6, 6: 8, 8: 10, 10: 12 }[n]}`);

/**
 * An equipped weapon's rolls (an inventory line, gear.js): as an attack with
 * its ability, the proficiency set on the line and its magic bonus.
 * Versatile weapons also give damage2, with both hands.
 */
export function gearRolls(g, calc) {
  const attack = { kind: 'attack', ability: g.weapon.ability, proficient: g.proficient, magic: g.magic, bonus: '', save: '', dc: '', damage: g.weapon.damage };
  const r = attackRolls(attack, calc);
  const damage2 = g.weapon.properties.includes('versatile') ? attackRolls({ ...attack, damage: biggerDie(g.weapon.damage) }, calc).damage : null;
  return { ...r, damage2 };
}
