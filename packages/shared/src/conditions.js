/**
 * Conditions, exhaustion and concentration on a character sheet, and hit
 * points going up and down: what the sheet's header shows and what it does
 * to the sheet's rolls (computeSheet adds the effects; sheet/header.js shows
 * them). The same condition names as map tokens (map.js CONDITIONS).
 *
 * The rules are the PHB's (2014 appendix A, 2024 Rules Glossary), shortened.
 * Only what a sheet can apply by itself is applied: disadvantage on the
 * character's own rolls, speed, the 2024 exhaustion penalty. What a
 * condition does to others' rolls against you (advantage to hit a prone or
 * restrained target) is shown as a note for the table.
 */

/** Conditions a sheet can have (exhaustion is a level, concentration a spell: both kept apart). */
export const SHEET_CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible',
  'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
];

export const CONDITION_NAMES = Object.fromEntries(SHEET_CONDITIONS.map((c) => [c, c[0].toUpperCase() + c.slice(1)]));

/** What each condition does, in a line (both editions agree on these, shortened). */
export const CONDITION_TEXT = {
  blinded: "Can't see; fails checks that need sight. Your attacks have disadvantage; attacks against you have advantage.",
  charmed: "Can't attack the charmer or target them with harmful effects; the charmer has advantage on social checks with you.",
  deafened: "Can't hear; fails checks that need hearing.",
  frightened: "Disadvantage on ability checks and attacks while the source of your fear is in sight; can't willingly move closer to it.",
  grappled: 'Speed 0. (2024: also disadvantage on attacks against anyone but the grappler.)',
  incapacitated: "Can't take actions or reactions. (2024: also can't concentrate or speak, and roll initiative with disadvantage.)",
  invisible: "Can't be seen without magic; your attacks have advantage, attacks against you have disadvantage.",
  paralyzed: "Incapacitated, can't move or speak. Fails Strength and Dexterity saves; attacks against you have advantage, and hits from within 5 feet are critical.",
  petrified: 'Turned to stone: incapacitated, resistance to all damage, fails Strength and Dexterity saves.',
  poisoned: 'Disadvantage on attack rolls and ability checks.',
  prone: 'Your attacks have disadvantage. Attacks within 5 feet of you have advantage, others disadvantage. Standing up costs half your speed.',
  restrained: 'Speed 0. Your attacks and Dexterity saves have disadvantage; attacks against you have advantage.',
  stunned: "Incapacitated, can't move. Fails Strength and Dexterity saves; attacks against you have advantage.",
  unconscious: "Incapacitated, can't move or speak, drops what it holds, falls prone. Fails Strength and Dexterity saves; attacks against you have advantage, and hits from within 5 feet are critical.",
};

/** Exhaustion by level: the 2014 table (each level includes the ones before it); 2024 is −2 per level on d20 tests and −5 feet of speed. */
export const EXHAUSTION_2014 = [
  '',
  'Disadvantage on ability checks.',
  'Speed halved.',
  'Disadvantage on attack rolls and saving throws.',
  'Hit point maximum halved.',
  'Speed reduced to 0.',
  'Death.',
];

const ALL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/**
 * A sheet's conditions as rules: what has disadvantage (entries like
 * computeSheet's, with `kinds`: which rolls, of check, save, attack), the d20
 * penalty (2024 exhaustion), speed (0, halved, or less), whether the hit point
 * maximum is halved, and notes.
 */
export function conditionEffects(sheet, edition = '2014') {
  const has = new Set(sheet?.conditions ?? []);
  const exhaustion = Math.max(0, Math.min(6, Number(sheet?.exhaustion) || 0));
  const disadvantage = [];
  const dis = (why, kinds, abilities = ALL) => disadvantage.push({ why, skills: [], abilities, kinds, all: abilities === ALL });
  if (has.has('poisoned')) dis('Poisoned', ['check', 'attack']);
  if (has.has('frightened')) dis('Frightened', ['check', 'attack']);
  if (has.has('blinded')) dis('Blinded', ['attack']);
  if (has.has('prone')) dis('Prone', ['attack']);
  if (has.has('restrained')) { dis('Restrained', ['attack']); dis('Restrained', ['save'], ['dex']); }
  if (edition === '2024' && has.has('incapacitated')) dis('Incapacitated', ['initiative']);
  if (edition !== '2024') {
    if (exhaustion >= 1) dis(`Exhaustion ${exhaustion}`, ['check']);
    if (exhaustion >= 3) dis(`Exhaustion ${exhaustion}`, ['attack', 'save']);
  }
  const fails = ['paralyzed', 'petrified', 'stunned', 'unconscious'].filter((c) => has.has(c));
  const stopped = ['grappled', 'restrained', 'paralyzed', 'petrified', 'stunned', 'unconscious'].some((c) => has.has(c)) || (edition !== '2024' && exhaustion >= 5);
  return {
    disadvantage,
    // Strength and Dexterity saves fail outright.
    failSaves: fails.length ? { why: CONDITION_NAMES[fails[0]], abilities: ['str', 'dex'] } : null,
    d20Penalty: edition === '2024' ? -2 * exhaustion : 0,
    speed: stopped ? { zero: true } : edition === '2024' ? { minus: 5 * exhaustion } : { half: exhaustion >= 2 },
    hpMaxHalved: edition !== '2024' && exhaustion >= 4,
    exhaustion,
  };
}

/** Normalize the sheet's conditions (a list of SHEET_CONDITIONS), exhaustion (0 to 6) and concentration (a spell's name). */
export function normalizeConditions(s = {}) {
  return {
    conditions: [...new Set((Array.isArray(s.conditions) ? s.conditions : []).filter((c) => SHEET_CONDITIONS.includes(c)))],
    exhaustion: Math.max(0, Math.min(6, Math.trunc(Number(s.exhaustion) || 0))),
    concentration: typeof s.concentration === 'string' ? s.concentration.slice(0, 120) : '',
  };
}

/**
 * Hit points taking damage or healing (the header's Damage and Heal), or temporary hit points given.
 * Damage comes off temporary hit points first. Healing goes up to the maximum (none: no limit) and
 * clears death saves. Temporary hit points don't add up: the bigger number is kept.
 * @param {object} sheet
 * @param {number|null} max the hit point maximum (computeSheet's hp_max, as shown)
 * @param {{ kind: 'damage'|'heal'|'temp', amount: number }} change
 * @returns {{ sheet, concentrationDC: number|null, down: boolean }} a new sheet; the Constitution save
 *   to keep concentrating (damage while concentrating); down: dropped to 0.
 */
export function changeHp(sheet, max, { kind, amount }) {
  const n = Math.max(0, Math.trunc(Number(amount) || 0));
  const out = structuredClone(sheet);
  const now = out.hp.current ?? max ?? 0;
  let concentrationDC = null;
  let down = false;
  if (kind === 'temp') {
    out.hp.temp = Math.max(out.hp.temp ?? 0, n) || null;
  } else if (kind === 'heal') {
    out.hp.current = max == null ? now + n : Math.max(now, Math.min(max, now + n));
    if (out.hp.current > 0) out.death_saves = { successes: 0, failures: 0 };
  } else if (n) {
    const temp = out.hp.temp ?? 0;
    const fromTemp = Math.min(temp, n);
    out.hp.temp = temp - fromTemp || null;
    out.hp.current = Math.max(0, now - (n - fromTemp));
    down = now > 0 && out.hp.current === 0;
    if (out.concentration) concentrationDC = Math.max(10, Math.floor(n / 2));
  }
  return { sheet: out, concentrationDC, down };
}
