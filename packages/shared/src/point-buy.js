/**
 * The point buy calculator on the character sheet (SPEC §6.3).
 *
 * The sheet's ability scores stay the truth: the calculator takes the
 * ability bonuses off each score to find the score that was bought, and
 * counts what those cost (27 points, each score 8 to 15 before bonuses).
 * Where the bonuses come from depends on the rules the sheet picks:
 * - 2014: the race gives them (PHB); a Half-Elf, a Variant Human or a race
 *   the list doesn't know has the player choose some or all of them.
 * - 2024: the background gives +2 and +1, or +1 to three, and the player
 *   chooses where (the background's three abilities, when it's a PHB 2024 one or one of the DM's own).
 */
import { ABILITIES, ABILITY_NAMES, POINT_BUY_RULES, normalizePointBuy } from './sheet.js';
import { BOOK_BACKGROUNDS, backgroundAbilities } from './backgrounds.js';

export { POINT_BUY_RULES, normalizePointBuy };

export const POINT_BUY = { budget: 27, min: 8, max: 15 };
export const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

// 2014 Player's Handbook races, most specific first. choose: how many +1s the player picks
// (each to a different ability), not: abilities those can't go to.
const RACES_2014 = [
  [/variant\s*human/i, { fixed: {}, choose: 2 }],
  [/half[-\s]*elf/i, { fixed: { cha: 2 }, choose: 2, not: ['cha'] }],
  [/half[-\s]*orc/i, { fixed: { str: 2, con: 1 } }],
  [/human/i, { fixed: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } }],
  [/dragonborn/i, { fixed: { str: 2, cha: 1 } }],
  [/hill\s*dwarf/i, { fixed: { con: 2, wis: 1 } }],
  [/mountain\s*dwarf/i, { fixed: { con: 2, str: 2 } }],
  [/dwarf/i, { fixed: { con: 2 } }],
  [/high\s*elf/i, { fixed: { dex: 2, int: 1 } }],
  [/wood\s*elf/i, { fixed: { dex: 2, wis: 1 } }],
  [/drow|dark\s*elf/i, { fixed: { dex: 2, cha: 1 } }],
  [/elf/i, { fixed: { dex: 2 } }],
  [/forest\s*gnome/i, { fixed: { int: 2, dex: 1 } }],
  [/rock\s*gnome/i, { fixed: { int: 2, con: 1 } }],
  [/gnome/i, { fixed: { int: 2 } }],
  [/lightfoot/i, { fixed: { dex: 2, cha: 1 } }],
  [/stout/i, { fixed: { dex: 2, con: 1 } }],
  [/halfling/i, { fixed: { dex: 2 } }],
  [/tiefling/i, { fixed: { cha: 2, int: 1 } }],
];

/** The 2024 Player's Handbook backgrounds and the three abilities each can raise (from backgrounds.js). */
export const BACKGROUNDS_2024 = Object.fromEntries(BOOK_BACKGROUNDS.filter((b) => b.edition === '2024').map((b) => [b.name.toLowerCase(), b.abilities]));

/** A race's 2014 bonuses: { fixed, choose, not, known }. A race not in the list: the player chooses them all. */
export function raceBonuses2014(race) {
  const r = String(race ?? '').trim();
  const hit = r && RACES_2014.find(([re]) => re.test(r));
  if (!hit) return { fixed: {}, choose: null, not: [], known: false };
  return { fixed: { ...hit[1].fixed }, choose: hit[1].choose ?? 0, not: hit[1].not ?? [], known: true };
}

/** Which rules a sheet's calculator uses: its own pick, else the campaign's edition, else 2014. */
export const pointBuyRules = (sheet, settings = {}) => sheet.point_buy?.rules || (settings.edition === '2024' ? '2024' : '2014');

const plus = (n) => `+${n}`;
const names = (list) => list.map((a) => ABILITY_NAMES[a]).join(', ').replace(/, ([^,]*)$/, ' or $1');

/**
 * Everything the calculator shows for a sheet: per ability { score, bonus,
 * fixed, chosen, base, cost }, the points spent and left, what the player
 * may choose (choose: how many bonuses, max: the biggest one, not: where
 * they can't go, allowed: the only abilities they can go to) and problems
 * (plain sentences, empty when the point buy is valid).
 */
export function pointBuy(sheet, settings = {}) {
  const rules = pointBuyRules(sheet, settings);
  const pb = normalizePointBuy(sheet.point_buy);
  const chosen = pb.choice[rules];
  let fixed = {};
  let pick = { choose: 3, max: 2, not: [], allowed: null, known: true };
  const problems = [];
  if (rules === '2014') {
    const race = raceBonuses2014(sheet.race);
    fixed = race.fixed;
    pick = race.known ? { choose: race.choose, max: 1, not: race.not, allowed: null, known: true } : { choose: null, max: 2, not: [], allowed: null, known: false };
  } else {
    // A 2024 background's three abilities: the book's, or the DM's own background's (campaign settings).
    pick.allowed = backgroundAbilities(sheet.background, { custom: settings.backgrounds ?? [] });
  }
  const abilities = {};
  let spent = 0;
  for (const a of ABILITIES) {
    const score = Number(sheet.abilities?.[a]) || 0;
    const own = pick.choose === 0 ? 0 : Math.min(chosen[a] ?? 0, pick.max);
    const bonus = (fixed[a] ?? 0) + own;
    const base = score - bonus;
    const cost = POINT_COST[base] ?? null;
    if (cost != null) spent += cost;
    abilities[a] = { score, bonus, fixed: fixed[a] ?? 0, chosen: own, base, cost };
    if (base < POINT_BUY.min) problems.push(`${ABILITY_NAMES[a]} is ${base} before ${bonus ? 'its bonus' : 'bonuses'}: point buy starts at ${POINT_BUY.min}.`);
    else if (base > POINT_BUY.max) problems.push(`${ABILITY_NAMES[a]} is ${base} before ${bonus ? 'its bonus' : 'bonuses'}: point buy goes up to ${POINT_BUY.max}.`);
  }
  if (spent > POINT_BUY.budget) problems.push(`That's ${spent - POINT_BUY.budget} point${spent - POINT_BUY.budget === 1 ? '' : 's'} over the ${POINT_BUY.budget}.`);

  const picks = ABILITIES.filter((a) => abilities[a].chosen).map((a) => abilities[a].chosen);
  const total = picks.reduce((n, v) => n + v, 0);
  if (rules === '2024') {
    const shape = picks.sort().join(',');
    if (shape !== '1,2' && shape !== '1,1,1') problems.push('Your background raises one ability by 2 and another by 1, or three abilities by 1 each: choose them.');
    const outside = pick.allowed ? ABILITIES.filter((a) => abilities[a].chosen && !pick.allowed.includes(a)) : [];
    if (outside.length) problems.push(`The ${String(sheet.background).trim()} background raises ${names(pick.allowed)}, not ${names(outside)}.`);
  } else if (pick.choose) {
    const race = String(sheet.race).trim();
    if (total !== pick.choose) problems.push(`A ${race} chooses ${pick.choose} abilities to raise by 1${pick.not.length ? ` (not ${names(pick.not)})` : ''}: ${total ? `${total} chosen` : 'choose them'}.`);
    const wrong = ABILITIES.filter((a) => abilities[a].chosen && pick.not.includes(a));
    if (wrong.length) problems.push(`A ${race}'s choices can't go to ${names(wrong)}.`);
  }
  return {
    rules,
    abilities,
    spent,
    left: POINT_BUY.budget - spent,
    budget: POINT_BUY.budget,
    choose: pick.choose,
    max: pick.max,
    not: pick.not,
    allowed: pick.allowed,
    raceKnown: pick.known,
    problems,
    describe: (a) => {
      const x = abilities[a];
      return x.bonus ? `${x.base} ${plus(x.bonus)} = ${x.score}` : `${x.score}`;
    },
  };
}

/**
 * Change the sheet's point buy (a new rules pick or bonus choice) keeping each
 * bought score where it was: the ability scores move with the bonuses.
 * change: { rules?, choice?: { a: n } (this rules' choices, replacing them) }.
 * @returns a new sheet
 */
export function changePointBuy(sheet, change, settings = {}) {
  const before = pointBuy(sheet, settings);
  const out = structuredClone(sheet);
  out.point_buy = normalizePointBuy(out.point_buy);
  if ('rules' in change) out.point_buy.rules = POINT_BUY_RULES.includes(change.rules) ? change.rules : '';
  if (change.choice) out.point_buy.choice[pointBuyRules(out, settings)] = change.choice;
  out.point_buy = normalizePointBuy(out.point_buy);
  const after = pointBuy(out, settings);
  for (const a of ABILITIES) {
    out.abilities[a] = Math.min(30, Math.max(1, before.abilities[a].base + after.abilities[a].bonus));
  }
  return out;
}

/** Buy one more (step 1) or one less (step -1) of an ability, within 8 to 15 before bonuses. Returns a new sheet, or the same one when it can't. */
export function stepPointBuy(sheet, a, step, settings = {}) {
  const { abilities } = pointBuy(sheet, settings);
  const x = abilities[a];
  const base = Math.min(POINT_BUY.max, Math.max(POINT_BUY.min, x.base + step));
  if (base === x.base) return sheet;
  const out = structuredClone(sheet);
  out.abilities[a] = base + x.bonus;
  return out;
}
