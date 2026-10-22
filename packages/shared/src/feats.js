/**
 * Feats that change the sheet's numbers or rolls, found by name in the
 * player's Features & traits (or Additional features), as racial feats are
 * (race-features.js). Each is a row of the Class features box under Feats
 * (`kind` uses for Lucky's points; info with its numbers for the rest), and
 * the numbers are worked in where the sheet works them out:
 *   computeSheet (sheet.js): Alert's initiative, Tough's hit points, Mobile
 *     and Speedy's speed, Observant's passive Perception, Dual Wielder's AC
 *     (2014), Squat Nimbleness's speed;
 *   planAttack (attack-extras.js): Great Weapon Master and Sharpshooter
 *     (2014: −5 to hit for +10 damage, a tick box; 2024 Great Weapon Master:
 *     + proficiency bonus on heavy weapons), Elven Accuracy (three d20s with
 *     advantage), Dual Wielder's off-hand attack;
 *   d20 rolls from the sheet and the map: a halfling's Luck (a 1 on the d20 is
 *     rolled again; `d20Rule`).
 * From the 2014 and 2024 Player's Handbooks; the campaign's edition decides.
 *
 * Plain JS like sheet.js: the server and the page use it (/shared/feats.js).
 */
import { RACIAL_FEATS, racesOf } from './race-features.js';

const P14 = (p) => `PHB 2014 p. ${p}`;
const P24 = (p) => `PHB 2024 p. ${p}`;
const both = (p14, p24) => `${P14(p14)}; ${p24 ? P24(p24) : 'PHB 2024 ch. 5'}`;
const plus = (n) => (n < 0 ? `−${-n}` : `+${n}`);

/**
 * General feats. Fields as class-features.js rows, plus feat (its name) and
 * match (how it's found in the features text). A halfling's own Lucky trait
 * shares the feat's name, so for a halfling the feat needs "Lucky feat" or
 * "feat: Lucky" written.
 */
export const GENERAL_FEATS = [
  {
    id: 'feat_alert', feat: 'Alert', match: /\balert\b/i, name: 'Alert', from: 1, kind: 'info', page: both(165, 200),
    note: (c) => (c.edition === '2024'
      ? `+${c.pb} initiative (in your initiative); after rolling initiative you can swap with a willing ally.`
      : '+5 initiative (in your initiative); you can\'t be surprised while conscious, and hidden attackers gain no advantage against you.'),
  },
  {
    id: 'feat_tough', feat: 'Tough', match: /\btough\b(?!ness)/i, name: 'Tough', from: 1, kind: 'info', page: both(170, 202),
    note: (c) => `+${2 * c.level} hit points (2 each level; in your hit point maximum).`,
  },
  {
    id: 'feat_lucky', feat: 'Lucky', match: /\blucky\b/i, name: 'Lucky', from: 1, kind: 'uses', page: both(167, 201),
    max: (c) => (c.edition === '2024' ? c.pb : 3), recharge: 'long',
    note: (c) => (c.edition === '2024'
      ? 'Spend a Luck Point for advantage on a d20 test, or to give an attack against you disadvantage.'
      : 'Spend a luck point to roll one more d20 for an attack, check or save (before the result), and choose which to use; or for an attack against you.'),
  },
  {
    id: 'feat_great_weapon_master', feat: 'Great Weapon Master', match: /great[- ]weapon master/i, name: 'Great Weapon Master', from: 1, kind: 'info', page: both(167, null),
    note: (c) => (c.edition === '2024'
      ? `Heavy weapons: +${c.pb} damage on a hit with the Attack action (in your attacks). Hew: a bonus-action attack after a critical hit or dropping a creature to 0.`
      : 'Heavy melee weapons you\'re proficient with: tick −5 to hit for +10 damage under the attack. A bonus-action attack after a critical hit or dropping a creature to 0.'),
  },
  {
    id: 'feat_sharpshooter', feat: 'Sharpshooter', match: /sharpshooter/i, name: 'Sharpshooter', from: 1, kind: 'info', page: both(170, null),
    note: (c) => (c.edition === '2024'
      ? 'Ranged weapons: no disadvantage at long range or within 5 feet of an enemy; your attacks ignore half and three-quarters cover.'
      : 'Ranged weapons you\'re proficient with: tick −5 to hit for +10 damage under the attack. No disadvantage at long range; ignore half and three-quarters cover.'),
  },
  {
    id: 'feat_war_caster', feat: 'War Caster', match: /war caster/i, name: 'War Caster', from: 1, kind: 'info', page: both(170, null),
    note: () => 'Advantage on Constitution saves to keep concentration. Somatic components with your hands full; a spell as an opportunity attack.',
  },
  {
    id: 'feat_savage_attacker', feat: 'Savage Attacker', match: /savage attacker/i, name: 'Savage Attacker', from: 1, kind: 'info', page: both(169, 201),
    note: () => 'Once a turn, roll a weapon\'s damage dice twice and use either roll: roll damage again and keep the better.',
  },
  {
    id: 'feat_dual_wielder', feat: 'Dual Wielder', match: /dual[- ]wielder/i, name: 'Dual Wielder', from: 1, kind: 'info', page: both(165, null),
    note: (c) => (c.edition === '2024'
      ? 'After attacking with a Light weapon, a bonus-action attack with a different one-handed melee weapon (the off-hand line in Attacks); no modifier to its damage unless negative.'
      : '+1 AC while you hold a melee weapon in each hand (in your AC); two-weapon fighting with one-handed weapons that aren\'t light.'),
  },
  {
    id: 'feat_mobile', feat: 'Mobile', match: /\bmobile\b/i, edition: '2014', name: 'Mobile', from: 1, kind: 'info', page: P14(168),
    note: () => '+10 feet speed (in your speed); Dash ignores difficult terrain; no opportunity attacks from a creature you attacked this turn.',
  },
  {
    id: 'feat_speedy', feat: 'Speedy', match: /\bspeedy\b/i, edition: '2024', name: 'Speedy', from: 1, kind: 'info', page: 'PHB 2024 ch. 5',
    note: () => '+10 feet speed (in your speed); Dash ignores difficult terrain; opportunity attacks against you have disadvantage.',
  },
  {
    id: 'feat_observant', feat: 'Observant', match: /\bobservant\b/i, name: 'Observant', from: 1, kind: 'info', page: both(168, null),
    note: (c) => (c.edition === '2024'
      ? 'Proficiency (or expertise) in Insight, Investigation or Perception; Search as a bonus action.'
      : '+5 passive Perception and Investigation (passive Perception is in your numbers); read lips.'),
  },
  {
    id: 'feat_durable', feat: 'Durable', match: /\bdurable\b/i, name: 'Durable', from: 1, kind: 'info', page: both(166, null),
    note: (c) => (c.edition === '2024'
      ? 'Advantage on death saves; a bonus action to spend a Hit Die and heal.'
      : `Hit dice you spend heal at least ${Math.max(2, 2 * c.mod('con'))}.`),
  },
  {
    id: 'feat_crossbow_expert', feat: 'Crossbow Expert', match: /crossbow expert/i, name: 'Crossbow Expert', from: 1, kind: 'info', page: both(165, null),
    note: (c) => (c.edition === '2024'
      ? 'Ignore Loading; no disadvantage within 5 feet of an enemy with crossbows; add your modifier to a light crossbow\'s extra attack.'
      : 'Ignore loading; no disadvantage within 5 feet of an enemy; a bonus-action hand crossbow attack after attacking with a one-handed weapon.'),
  },
  {
    id: 'feat_polearm_master', feat: 'Polearm Master', match: /polearm master/i, name: 'Polearm Master', from: 1, kind: 'info', page: both(168, null),
    note: () => 'A bonus-action 1d4 bludgeoning attack with the other end of a glaive, halberd, quarterstaff or spear (pike in 2024); opportunity attacks when creatures come into your reach.',
  },
  {
    id: 'feat_sentinel', feat: 'Sentinel', match: /\bsentinel\b/i, name: 'Sentinel', from: 1, kind: 'info', page: both(169, null),
    note: () => 'A creature you hit with an opportunity attack has speed 0 for the turn; opportunity attacks even when they Disengage; react when they attack someone else.',
  },
  {
    id: 'feat_heavy_armor_master', feat: 'Heavy Armor Master', match: /heavy armou?r master/i, name: 'Heavy Armor Master', from: 1, kind: 'info', page: both(167, null),
    note: (c) => (c.edition === '2024'
      ? `In heavy armour, bludgeoning, piercing and slashing damage you take is reduced by ${c.pb}.`
      : 'In heavy armour, nonmagical bludgeoning, piercing and slashing damage you take is reduced by 3.'),
  },
  {
    id: 'feat_defensive_duelist', feat: 'Defensive Duelist', match: /defensive duelist/i, name: 'Defensive Duelist', from: 1, kind: 'info', page: both(165, null),
    note: (c) => `A reaction with a finesse weapon: +${c.pb} AC against one melee attack${c.edition === '2024' ? ' (until the start of your next turn)' : ''}.`,
  },
  {
    id: 'feat_tavern_brawler', feat: 'Tavern Brawler', match: /tavern brawler/i, name: 'Tavern Brawler', from: 1, kind: 'info', page: both(170, 202),
    note: (c) => (c.edition === '2024'
      ? `Unarmed strikes deal 1d4${plus(c.mod('str'))} bludgeoning (1s rolled again); push 5 feet once a turn.`
      : 'Unarmed strikes and improvised weapons deal 1d4; a bonus-action grapple after hitting with one.'),
  },
];

const tidy = (s) => String(s ?? '').replace(/[’']/g, "'");

/**
 * The feats this character has: general feats named in Features & traits or
 * Additional features (for the campaign's edition), and racial feats for a
 * race they're for. [row]
 */
export function featsOf(sheet, { edition = '2014' } = {}) {
  const ed = edition === '2024' ? '2024' : '2014';
  const text = tidy(`${sheet?.features ?? ''}\n${sheet?.additional_features ?? ''}`);
  const races = new Set(racesOf(sheet?.race));
  const halfling = races.has('halfling');
  const general = GENERAL_FEATS.filter((f) => (!f.edition || f.edition === ed) && f.match.test(text)
    && !(f.id === 'feat_lucky' && halfling && !/lucky\s+feat|feat\s*[:(]\s*lucky|feats?:[^\n]*\blucky\b/i.test(text)));
  const racial = RACIAL_FEATS.filter((f) => f.match.test(text) && f.races.some((r) => races.has(r)));
  return [...general, ...racial];
}

/** Whether the character has a feat, by id ('feat_alert', 'feat_elven_accuracy'...). */
export const hasFeat = (sheet, id, opts) => featsOf(sheet, opts).some((f) => f.id === id);

/**
 * What every d20 the character rolls gets, as notation for the d20 term:
 * 'ro1' for a halfling's Luck (a 1 is rolled again), '' otherwise.
 */
export function d20Rule(sheet) {
  return racesOf(sheet?.race).includes('halfling') ? 'ro1' : '';
}

/**
 * Some notation with the character's d20 rule on its d20 ("1d20+5" →
 * "1d20ro1+5"); unchanged without one or when there's no single d20.
 */
export function withD20Rule(notation, rule) {
  if (!rule || !notation) return notation;
  const s = String(notation);
  if ((s.match(/\d*d20/gi) ?? []).length !== 1 || /d20(?:\s*(?:min\d+|ea))*\s*ro\d/i.test(s)) return s;
  return s.replace(/(\b1?d20)/i, `$1${rule}`);
}
