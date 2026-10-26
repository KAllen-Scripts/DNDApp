/**
 * Dice notation and rolling ("1d20+5", "2d6+1d4-1", "d%").
 *
 * Plain JS with no imports, like sheet.js: the server rolls with this (using
 * a secure random number), and the page loads the same file from
 * /shared/dice.js to read dice out of text such as "1d8+2 piercing". The page
 * never decides a roll; it only animates the result the server sends.
 */

/** Dice the 3D roller can show. d100 is drawn as a tens die and a units die. */
export const DICE_SIDES = [2, 4, 6, 8, 10, 12, 20, 100];
export const MAX_DICE = 50; // per roll
const MAX_TERMS = 20;
const MAX_CONSTANT = 999;
export const ROLL_MODES = ['normal', 'advantage', 'disadvantage'];

// A dice term can end in min<n> (each die counts as at least n: 2024 Great Weapon Fighting's 3, Reliable
// Talent's 10), ro<n> (each die of n or less is rolled once more and the new one kept: 2014 Great Weapon
// Fighting, a halfling's Luck on a d20's 1) and, on a d20, ea (Elven Accuracy: with advantage, three d20s).
const TERM = /([+-]?)\s*(?:(\d*)\s*d\s*(\d+|%)((?:\s*(?:min|ro)\s*\d+|\s*ea(?![a-z]))*)|(\d+))/giy;

/**
 * Read dice notation. Returns { notation, terms } where each term is
 * { sign, count, sides } or { sign, value }. Throws an Error with a message a
 * player can act on if the notation isn't valid.
 */
export function parseRoll(text) {
  const src = String(text ?? '').trim();
  if (!src) throw new Error('Type some dice, like 1d20+5 or 2d6.');
  if (src.length > 100) throw new Error('That roll is too long.');
  const terms = [];
  TERM.lastIndex = 0;
  let pos = 0;
  while (pos < src.length) {
    while (src[pos] === ' ') pos++;
    if (pos >= src.length) break;
    TERM.lastIndex = pos;
    const m = TERM.exec(src);
    if (!m || m.index !== pos) throw new Error(`Couldn't read "${src}". Use dice like 1d20+5 or 2d6+1d4.`);
    if (terms.length && !m[1]) throw new Error(`Put + or - between the parts of "${src}".`);
    const sign = m[1] === '-' ? -1 : 1;
    if (m[5] !== undefined) {
      const value = Number(m[5]);
      if (value > MAX_CONSTANT) throw new Error(`${value} is too big a number to add.`);
      terms.push({ sign, value });
    } else {
      const count = m[2] === '' ? 1 : Number(m[2]);
      const sides = m[3] === '%' ? 100 : Number(m[3]);
      if (!DICE_SIDES.includes(sides)) throw new Error(`There's no d${sides} here. Dice: ${DICE_SIDES.map((s) => `d${s}`).join(', ')}.`);
      if (count < 1) throw new Error('Roll at least one die.');
      const term = { sign, count, sides };
      for (const [, rule, num] of (m[4] ?? '').matchAll(/(min|ro|ea)\s*(\d*)/gi)) {
        if (rule.toLowerCase() === 'ea') {
          if (sides !== 20) throw new Error('ea (Elven Accuracy) is only for a d20.');
          term.elven = true;
          continue;
        }
        const n = Number(num);
        if (!(n >= 1 && n <= sides)) throw new Error(`${rule}${n} doesn't fit a d${sides}.`);
        if (rule.toLowerCase() === 'min') term.min = n;
        else if (n < sides) term.reroll = n;
      }
      terms.push(term);
    }
    if (terms.length > MAX_TERMS) throw new Error('That roll has too many parts.');
    pos = TERM.lastIndex;
  }
  const dice = terms.reduce((n, t) => n + (t.count ?? 0), 0);
  if (!dice) throw new Error('Include at least one die, like 1d20.');
  if (dice > MAX_DICE) throw new Error(`That's ${dice} dice; the most in one roll is ${MAX_DICE}.`);
  return { notation: formatTerms(terms), terms };
}

/**
 * The dice at the start of some text, e.g. "1d8+2" from "1d8+2 piercing",
 * or null if it doesn't start with dice. For attacks' damage boxes.
 */
export function findRoll(text) {
  const m = /^\s*((?:[+-]?\s*(?:\d*\s*d\s*(?:\d+|%)|\d+)\s*)+)/i.exec(String(text ?? ''));
  if (!m) return null;
  try {
    return parseRoll(m[1]).notation;
  } catch {
    return null;
  }
}

/** Terms back into notation: [{ sign: 1, count: 2, sides: 6, min: 3 }, { sign: 1, value: 4 }] → "2d6min3+4". */
export function formatTerms(terms) {
  return terms
    .map((t, i) => (t.sign < 0 ? '-' : i ? '+' : '') + (t.value !== undefined ? t.value : `${t.count}d${t.sides}${t.reroll ? `ro${t.reroll}` : ''}${t.min ? `min${t.min}` : ''}${t.elven ? 'ea' : ''}`))
    .join('');
}

/** "1d20" plus a bonus: "1d20+5", "1d20-1", "1d20". */
export const d20Plus = (bonus) => {
  const n = Number(bonus) || 0;
  return n ? `1d20${n > 0 ? '+' : ''}${n}` : '1d20';
};

/**
 * Roll parsed notation. random(sides) must return a whole number from 1 to
 * sides. Advantage and disadvantage apply when the roll has exactly one d20:
 * it's rolled twice and the higher (or lower) is kept.
 *
 * Returns { notation, mode, terms, total, natural }: each dice term has
 * dice: [{ value, kept }], and natural is the kept d20 when there's exactly one
 * (20 and 1 are special in D&D). A term with min counts each die as at least
 * that (the die keeps its face in value, and counts: what it added); one with
 * reroll rolls each die at or under it once more and keeps the new one (the
 * first is marked not kept, like advantage's other d20).
 */
export function rollDice({ notation, terms }, { mode = 'normal', random }) {
  const d20s = terms.filter((t) => t.sides === 20).reduce((n, t) => n + t.count, 0);
  const twice = d20s === 1 && (mode === 'advantage' || mode === 'disadvantage');
  let total = 0;
  let natural = null;
  const out = terms.map((t) => {
    if (t.value !== undefined) {
      total += t.sign * t.value;
      return { sign: t.sign, value: t.value };
    }
    // One die, rolled again once if it's at or under the reroll number (the first then isn't kept).
    const one = () => {
      const d = { value: random(t.sides), kept: true };
      if (t.reroll && d.value <= t.reroll) {
        d.kept = false;
        return [d, { value: random(t.sides), kept: true }];
      }
      return [d];
    };
    const dice = [];
    for (let i = 0; i < t.count; i++) dice.push(...one());
    if (t.sides === 20 && twice) {
      // Advantage or disadvantage: one more d20 (two more with Elven Accuracy's advantage); the best (or worst) is kept.
      const extra = t.elven && mode === 'advantage' ? 2 : 1;
      for (let i = 0; i < extra; i++) dice.push(...one());
      const kept = dice.filter((d) => d.kept);
      const best = kept.reduce((b, d) => ((mode === 'advantage' ? d.value > b.value : d.value < b.value) ? d : b));
      for (const d of kept) if (d !== best) d.kept = false;
    }
    if (t.min) for (const d of dice) if (d.value < t.min) d.counts = t.min;
    for (const d of dice) if (d.kept) total += t.sign * (d.counts ?? d.value);
    if (t.sides === 20 && d20s === 1) natural = dice.find((d) => d.kept).value;
    return { sign: t.sign, sides: t.sides, dice, ...(t.min && { min: t.min }), ...(t.reroll && { reroll: t.reroll }), ...(t.elven && { elven: true }) };
  });
  return { notation, mode: twice ? mode : 'normal', terms: out, total, natural };
}
