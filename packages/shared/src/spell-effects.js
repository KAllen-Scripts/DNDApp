/**
 * Spells that don't just deal damage, cast from the map (owner, 2026-10-28: "I saw no way to cast spells
 * such as 'Entangle', that aren't an attack… how do such spells interact with the map? If they don't, then
 * they should. Look at how other softwares do this"; research: docs/notes/map-spells-research.md).
 * SPEC §6.6 "Spells that aren't attacks".
 *
 * Read from a spell's text: the conditions it gives (on a failed save, or to whoever it's cast on), how long
 * it lasts, whether its area is difficult terrain, how many creatures it can target. And the map's
 * **spells in play** (`spells` on the map): a lasting spell's record, linking its caster, its area and
 * the conditions it gave, so ending it (by hand, losing concentration, or its time running out in a
 * fight) takes all of that off again.
 */
import { CONDITIONS } from './map.js';

/** Conditions a spell can give (not exhaustion, which comes in levels, nor the caster's own concentrating). */
export const SPELL_CONDITIONS = CONDITIONS.filter((c) => c !== 'exhaustion' && c !== 'concentrating');

/**
 * The conditions a spell (or a stat block's action) gives, read from its text: "must succeed on a Strength
 * saving throw or be restrained" (Entangle), "or be paralyzed for the duration" (Hold Person), "falls prone",
 * "has the Restrained condition" (2024), "becomes invisible" (Invisibility). Not ones it can't give ("can't be
 * charmed") or only mentions ("a creature restrained by the plants").
 */
export function spellConditions(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ');
  const out = [];
  for (const c of SPELL_CONDITIONS) {
    const word = c === 'prone' ? '(?:falls?|knocked|knocks? (?:it|the target|them)|is|be|lands?) prone' : null;
    const re = word
      ? new RegExp(`\\b${word}\\b`, 'i')
      : new RegExp(`(?<!(?:can't|cannot|can’t|not|immune to being|n't) )\\b(?:is|be|becomes?|becoming|falls?|are|has the|have the|gains? the|is also|be also)\\s+(?:\\w+\\s+){0,2}?${c}\\b`, 'i');
    if (re.test(s)) out.push(c);
  }
  // "be blinded or deafened" (the caster's choice): the first, the DM can change it.
  for (const m of s.matchAll(new RegExp(`\\b(${SPELL_CONDITIONS.join('|')}) or (${SPELL_CONDITIONS.join('|')})\\b`, 'gi'))) {
    const i = out.indexOf(m[2].toLowerCase());
    if (i >= 0 && out.includes(m[1].toLowerCase())) out.splice(i, 1);
  }
  // Falling asleep or unconscious knocks you prone too, but the spell's own words are what count.
  return out.slice(0, 4);
}

/**
 * How long a spell lasts, from its duration ("Concentration, up to 1 minute", "1 hour", "Instantaneous"):
 * { concentration, rounds: 10 for a minute, 0 for instantaneous, null for longer than a fight or
 * "until dispelled" }.
 */
export function spellLasting({ duration = '', concentration = false } = {}) {
  const d = String(duration ?? '');
  const conc = !!concentration || /concentration/i.test(d);
  if (/instantaneous/i.test(d)) return { concentration: conc, rounds: 0 };
  const n = (re) => Number(d.match(re)?.[1]);
  const words = { one: 1, two: 2, three: 3, ten: 10 };
  const num = (v) => Number(v) || words[String(v).toLowerCase()] || 1;
  const r = d.match(/(\d+|one|two|three|ten)\s*rounds?/i);
  if (r) return { concentration: conc, rounds: num(r[1]) };
  const m = d.match(/(\d+|one|two|three|ten)\s*minutes?/i);
  if (m) return { concentration: conc, rounds: num(m[1]) * 10 };
  const h = n(/(\d+)\s*hours?/i);
  if (h || /\bhour\b/i.test(d)) return { concentration: conc, rounds: (h || 1) * 600 };
  // Days, "until dispelled", "special", or nothing written: it outlasts any fight.
  return { concentration: conc, rounds: d.trim() || conc ? null : 0 };
}

/** The spell's area makes the ground difficult terrain (Entangle, Web, Spike Growth, Plant Growth, Grease). */
export const makesDifficult = (text) => /\b(?:is|are|becomes?|turns? [^.]{0,40}?into|count as|is considered)\s+difficult terrain\b|\bdifficult terrain (?:for|in|within)\b/i.test(String(text ?? ''));

const COUNT = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };

/**
 * How many creatures a spell without an area can target, cast at `slot`: "up to three creatures" (Bless) is
 * 3, plus "one additional creature for each slot level above 1st"; otherwise one. Self (the range): the
 * caster, so `self` is true.
 */
export function spellTargets(spell, slot = null) {
  const text = `${spell?.description ?? ''} ${spell?.higher_levels ?? ''}`;
  const self = /^\s*self\b/i.test(String(spell?.range ?? '')) && !/\(/.test(String(spell?.range ?? ''));
  const up = text.match(/\bup to (\w+) (?:willing )?(?:creatures|targets|humanoids|beasts|allies)/i);
  let n = up ? Number(up[1]) || COUNT[up[1].toLowerCase()] || 1 : 1;
  if (spell?.level >= 1 && slot > spell.level && /\b(?:one|an) additional (?:creature|target|humanoid|beast)\b/i.test(text)) n += slot - spell.level;
  return { max: Math.min(12, n), self };
}

/**
 * What a spell does that isn't damage, for the map: { conditions, lasting, difficult, targets }. `kind` is
 * the action's: conditions come on a failed save for a save spell, and straight away for a spell with no
 * roll (Invisibility, a 2024 spell that just says the target "has the Charmed condition").
 */
export function spellEffects(spell, slot = null) {
  return {
    conditions: spellConditions(spell?.description),
    lasting: spellLasting(spell),
    difficult: makesDifficult(spell?.description),
    targets: spellTargets(spell, slot),
  };
}

// ---------- spells in play on a map ----------

/**
 * End a spell in play on a map (changed in place): its area goes (when it was the spell's), the conditions it
 * gave come off (unless another spell in play gives the same one to the same token), and its caster stops
 * concentrating when it was their concentration spell. Returns the ended record, or null.
 */
export function endMapSpell(m, id) {
  const sp = (m.spells ?? []).find((x) => x.id === id);
  if (!sp) return null;
  m.spells = m.spells.filter((x) => x.id !== id);
  if (sp.template) m.templates = (m.templates ?? []).filter((t) => !(t.id === sp.template && t.spell === sp.id));
  for (const a of sp.affected ?? []) {
    const token = m.tokens.find((t) => t.id === a.id);
    if (!token) continue;
    const still = new Set(m.spells.flatMap((x) => (x.affected ?? []).filter((y) => y.id === a.id).flatMap((y) => y.conditions)));
    token.conditions = token.conditions.filter((c) => !a.conditions.includes(c) || still.has(c));
  }
  if (sp.concentration) {
    const caster = m.tokens.find((t) => t.id === sp.caster);
    if (caster && !m.spells.some((x) => x.caster === sp.caster && x.concentration)) caster.conditions = caster.conditions.filter((c) => c !== 'concentrating');
  }
  return sp;
}

/** The caster's concentration ended (a failed save, a new concentration spell): end the spell(s) it held. */
export function endConcentration(m, casterId) {
  return (m.spells ?? []).filter((x) => x.caster === casterId && x.concentration).map((x) => endMapSpell(m, x.id)).filter(Boolean);
}

/**
 * A turn passed in a fight: spells whose time is up end. A spell cast in round R lasting N rounds ends at
 * the start of its caster's turn in round R + N (or as that round starts, when the caster isn't in the
 * order). Returns the ended ones.
 */
export function expireMapSpells(m) {
  const c = m.combat;
  if (!c) return [];
  const inOrder = new Set(c.entries.map((e) => e.id));
  const due = (m.spells ?? []).filter((sp) => sp.ends && (c.round > sp.ends.round || (c.round === sp.ends.round && (!inOrder.has(sp.ends.turn) || c.turn === sp.ends.turn))));
  return due.map((sp) => endMapSpell(m, sp.id)).filter(Boolean);
}

/** Rounds left of a spell in play in the fight, or null (no fight, or it isn't counted). */
export function roundsLeft(sp, combat) {
  if (!sp?.ends || !combat) return null;
  return Math.max(0, sp.ends.round - combat.round);
}

/**
 * Spells in play as one viewer may see them. The DM: all. A player: ones they cast, or whose caster or an
 * affected token they can see, or whose area they get; the caster is "someone you can't see" when they
 * can't; only the affected tokens they can see; the save DC only on their own.
 */
export function mapSpellsFor(list, { dm, visible, own, templates }) {
  if (dm) return list ?? [];
  const areas = new Set((templates ?? []).map((t) => t.id));
  const out = [];
  for (const sp of list ?? []) {
    const mine = own.has(sp.caster);
    const seesCaster = mine || visible.has(sp.caster);
    const affected = (sp.affected ?? []).filter((a) => visible.has(a.id) || own.has(a.id));
    if (!seesCaster && !affected.length && !areas.has(sp.template)) continue;
    out.push({
      ...sp,
      caster: seesCaster ? sp.caster : null,
      caster_name: seesCaster ? sp.caster_name : 'Someone you can’t see',
      dc: mine ? sp.dc : null,
      affected,
      template: areas.has(sp.template) ? sp.template : null,
    });
  }
  return out;
}
