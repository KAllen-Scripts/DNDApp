/**
 * Class features on the character sheet: the limited uses, pools of points
 * and worked-out numbers each class gets (Rage, Bardic Inspiration, Channel
 * Divinity, Second Wind, Ki, Lay on Hands, Sorcery Points, Arcane Recovery...),
 * and rows the player adds by hand (a feat like Lucky, Breath Weapon,
 * homebrew). One box on the sheet shows the rows that apply to this
 * character; Wild Shape is one of them, with its forms (wild-shape.js) under it.
 *
 * Plain JS like sheet.js: the server uses it and the page loads it from
 * /shared/class-features.js. Rules for both editions (the campaign's
 * setting). Pages are the 2014 Player's Handbook's; the 2024 rules are from
 * the 2024 Player's Handbook. The artificer is from Tasha's Cauldron of
 * Everything (both editions).
 *
 * Subclasses add their rows from subclass-features.js, matched on the
 * subclass typed on the sheet; the box shows them under their own heading.
 *
 * What's saved is small: sheet.class_features = { spent: { id: n }, max: {
 * id: n }, custom: [rows], rolled: { id: [numbers] } } (rolled: dice kept for
 * later, like a diviner's Portent). Maximums are worked out from class levels,
 * ability scores and the edition every time; max holds only numbers the
 * player typed over them (the DM has the last word, so nothing is locked).
 *
 * Kinds of row: uses (tick boxes), pool (points spent from a number) and
 * info (a worked-out number, nothing to spend). Recharge: short (a short or
 * long rest gives them all back), long (a long rest), short_one (2024: a
 * short rest gives one back, a long rest all), none (the player resets it).
 */
import { abilityMod, classKey } from './sheet.js';
import { activeForm, formHasHp, setFormHp, wildShapeRules } from './wild-shape.js';
import { SUBCLASS_BY_KEY, SUBCLASS_FEATURES } from './subclass-features.js';
import { RACE_BY_KEY, RACE_FEATURES, RACIAL_FEATS, racesOf } from './race-features.js';
import { GENERAL_FEATS, featsOf } from './feats.js';

export const FEATURE_KINDS = ['uses', 'pool', 'info'];
export const MAX_ROLLED = 3;
export const RECHARGES = ['short', 'long', 'short_one', 'none'];
export const RECHARGE_NAMES = {
  short: 'Short or long rest',
  long: 'Long rest',
  short_one: 'One back on a short rest, all on a long rest',
  none: 'Reset by hand',
};
export const MAX_CUSTOM = 30;

const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);
const int = (v, { min = -999, max = 999, fallback = null } = {}) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/^\s*\+/, ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** A number from a table by level: step([[1, 2], [3, 3], [6, 4]], 5) → 3. */
const step = (table, level) => table.reduce((v, [from, n]) => (level >= from ? n : v), table[0][1]);
const atLeast1 = (n) => Math.max(1, n);

// Spell slots a sorcerer can make from sorcery points (Flexible Casting): slot level → points.
export const SLOT_COST = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };

/**
 * Every class feature the sheet tracks. Each: id (unique), class, name,
 * edition ('2014', '2024' or both when left out), from (the class level it
 * starts at), kind, max(c) (null: unlimited), recharge (or recharge(c)),
 * note(c) (a short line under it), page, and for some an action the box
 * offers (heal: dice rolled and added to hit points by the server; the rest
 * are worked out on the page). c is the context from featureContext().
 */
export const FEATURES = [
  // ---------- Barbarian ----------
  {
    id: 'rage', class: 'barbarian', name: 'Rage', from: 1, kind: 'uses', page: 'PHB 2014 p. 48; PHB 2024 p. 51',
    max: (c) => (c.edition === '2014' && c.level >= 20 ? null : step([[1, 2], [3, 3], [6, 4], [12, 5], [17, 6]], c.level)),
    recharge: (c) => (c.edition === '2024' ? 'short_one' : 'long'),
    note: (c) => `+${step([[1, 2], [9, 3], [16, 4]], c.level)} damage on Strength attacks; resistance to bludgeoning, piercing and slashing; advantage on Strength checks and saves. ${c.edition === '2024' ? 'Lasts until the end of your next turn unless you keep it going (up to 10 minutes)' : 'Lasts 1 minute'}.`,
  },
  {
    id: 'relentless_rage', class: 'barbarian', name: 'Relentless Rage', from: 11, kind: 'info', page: 'PHB 2014 p. 49; PHB 2024 p. 52',
    note: (c) => (c.edition === '2024'
      ? 'Dropping to 0 hit points while raging: DC 10 Constitution save (+5 each time) to drop to twice your barbarian level instead. The DC resets on a short or long rest.'
      : 'Dropping to 0 hit points while raging: DC 10 Constitution save (+5 each time) to drop to 1 hit point instead. The DC resets on a short or long rest.'),
  },
  {
    id: 'persistent_rage', class: 'barbarian', name: 'Persistent Rage', edition: '2024', from: 15, kind: 'uses', max: () => 1, recharge: 'long', page: 'PHB 2024 p. 52',
    note: () => 'When you roll initiative, get all your Rage uses back.',
  },

  // ---------- Bard ----------
  {
    id: 'bardic_inspiration', class: 'bard', name: 'Bardic Inspiration', from: 1, kind: 'uses', page: 'PHB 2014 p. 53; PHB 2024 p. 59',
    max: (c) => atLeast1(c.mod('cha')),
    recharge: (c) => (c.level >= 5 ? 'short' : 'long'),
    note: (c) => `A d${step([[1, 6], [5, 8], [10, 10], [15, 12]], c.level)} for a creature you choose.${c.level >= 5 ? ' Font of Inspiration: a short rest gives them back too.' : ''}${c.edition === '2024' && c.level >= 5 ? ' You can spend a spell slot to get one back.' : ''}${c.edition === '2014' && c.level >= 20 ? ' Superior Inspiration: get one back when you roll initiative with none left.' : ''}${c.edition === '2024' && c.level >= 18 ? ' Superior Inspiration: when you roll initiative, get uses back up to 2.' : ''}`,
  },

  // ---------- Cleric ----------
  {
    id: 'channel_divinity_cleric', class: 'cleric', name: 'Channel Divinity', from: 2, kind: 'uses', page: 'PHB 2014 p. 58; PHB 2024 p. 70',
    max: (c) => (c.edition === '2024' ? step([[2, 2], [6, 3], [18, 4]], c.level) : step([[2, 1], [6, 2], [18, 3]], c.level)),
    recharge: (c) => (c.edition === '2024' ? 'short_one' : 'short'),
    note: (c) => (c.edition === '2024' ? 'Divine Spark or Turn Undead, or your domain\'s option.' : `Turn Undead, or your domain's option.${c.level >= 5 ? ` Destroy Undead: challenge ${step([[5, '1/2'], [8, '1'], [11, '2'], [14, '3'], [17, '4']], c.level)} or lower.` : ''}`),
  },
  {
    id: 'divine_intervention', class: 'cleric', name: 'Divine Intervention', from: 10, kind: 'uses', max: () => 1, page: 'PHB 2014 p. 59; PHB 2024 p. 71',
    recharge: (c) => (c.edition === '2024' ? 'long' : 'none'),
    note: (c) => (c.edition === '2024'
      ? 'Cast any cleric spell of 5th level or lower without a slot or material components.'
      : `${c.level >= 20 ? 'It always works.' : `Roll d100: ${c.level} or lower and your deity helps.`} If it works, you can't use it again for 7 days; if not, after a long rest.`),
  },

  // ---------- Druid ----------
  {
    id: 'wild_shape', class: 'druid', name: 'Wild Shape', from: 2, kind: 'uses', page: 'PHB 2014 p. 66; PHB 2024 p. 80',
    max: (c) => wildShapeRules(c.sheet, c.edition).uses,
    recharge: (c) => (c.edition === '2024' ? 'short_one' : 'short'),
    note: (c) => (c.edition === '2024'
      ? `Your forms are below.${c.level >= 5 ? ' Wild Resurgence: once per long rest, spend a spell slot to get a use back.' : ''}`
      : 'Your forms are below. An elemental (Circle of the Moon, level 10) costs two uses.'),
  },

  // ---------- Fighter ----------
  {
    id: 'second_wind', class: 'fighter', name: 'Second Wind', from: 1, kind: 'uses', page: 'PHB 2014 p. 72; PHB 2024 p. 91',
    max: (c) => (c.edition === '2024' ? step([[1, 2], [4, 3], [10, 4]], c.level) : 1),
    recharge: (c) => (c.edition === '2024' ? 'short_one' : 'short'),
    heal: (c) => `1d10+${c.level}`,
    note: (c) => `A bonus action: regain 1d10 + ${c.level} hit points.${c.edition === '2024' && c.level >= 2 ? ' Tactical Mind: spend one to add 1d10 to a failed ability check (not spent if it still fails).' : ''}`,
  },
  {
    id: 'action_surge', class: 'fighter', name: 'Action Surge', from: 2, kind: 'uses', recharge: 'short', page: 'PHB 2014 p. 72; PHB 2024 p. 92',
    max: (c) => (c.level >= 17 ? 2 : 1),
    note: (c) => `One more action on your turn${c.level >= 17 ? ' (once a turn)' : ''}.`,
  },
  {
    id: 'indomitable', class: 'fighter', name: 'Indomitable', from: 9, kind: 'uses', recharge: 'long', page: 'PHB 2014 p. 72; PHB 2024 p. 92',
    max: (c) => step([[9, 1], [13, 2], [17, 3]], c.level),
    note: (c) => `Reroll a failed saving throw${c.edition === '2024' ? `, adding ${c.level}` : ''}; you must use the new roll.`,
  },

  // ---------- Monk ----------
  {
    id: 'ki', class: 'monk', name: (c) => (c.edition === '2024' ? 'Focus Points' : 'Ki Points'), from: 2, kind: 'pool', recharge: 'short', page: 'PHB 2014 p. 78; PHB 2024 p. 102',
    max: (c) => c.level,
    note: (c) => `Save DC ${8 + c.pb + c.mod('wis')}. Flurry of Blows, Patient Defense, Step of the Wind: 1 point each.`,
  },
  {
    id: 'martial_arts', class: 'monk', name: 'Martial Arts', from: 1, kind: 'info', page: 'PHB 2014 p. 78; PHB 2024 p. 101',
    note: (c) => `Unarmed strikes and monk weapons: 1d${c.edition === '2024' ? step([[1, 6], [5, 8], [11, 10], [17, 12]], c.level) : step([[1, 4], [5, 6], [11, 8], [17, 10]], c.level)} damage, Strength or Dexterity (worked into your attacks when you wear no armour or shield).`,
  },
  {
    id: 'uncanny_metabolism', class: 'monk', name: 'Uncanny Metabolism', edition: '2024', from: 2, kind: 'uses', max: () => 1, recharge: 'long', page: 'PHB 2024 p. 102',
    heal: (c) => `1d${step([[1, 6], [5, 8], [11, 10], [17, 12]], c.level)}+${c.level}`,
    note: (c) => `When you roll initiative: all your Focus Points back, and regain 1d${step([[1, 6], [5, 8], [11, 10], [17, 12]], c.level)} + ${c.level} hit points.`,
    refill: 'ki',
  },

  // ---------- Paladin ----------
  {
    id: 'divine_sense', class: 'paladin', name: 'Divine Sense', edition: '2014', from: 1, kind: 'uses', recharge: 'long', page: 'PHB 2014 p. 84',
    max: (c) => 1 + c.mod('cha'),
    note: () => 'Sense celestials, fiends and undead within 60 feet until the end of your next turn.',
  },
  {
    id: 'lay_on_hands', class: 'paladin', name: 'Lay on Hands', from: 1, kind: 'pool', recharge: 'long', page: 'PHB 2014 p. 84; PHB 2024 p. 110',
    max: (c) => 5 * c.level,
    note: () => 'Touch a creature and restore hit points from the pool, or spend 5 to cure a disease or poison.',
  },
  {
    id: 'paladins_smite', class: 'paladin', name: "Paladin's Smite", edition: '2024', from: 2, kind: 'uses', max: () => 1, recharge: 'long', page: 'PHB 2024 p. 110',
    note: () => 'Cast Divine Smite once without a spell slot.',
  },
  {
    id: 'channel_divinity_paladin', class: 'paladin', name: 'Channel Divinity', from: 3, kind: 'uses', page: 'PHB 2014 p. 85; PHB 2024 p. 111',
    max: (c) => (c.edition === '2024' ? step([[3, 2], [11, 3]], c.level) : 1),
    recharge: (c) => (c.edition === '2024' ? 'short_one' : 'short'),
    note: (c) => (c.edition === '2024' ? 'Divine Sense, or your oath\'s option.' : 'Your oath\'s options.'),
  },
  {
    id: 'faithful_steed', class: 'paladin', name: 'Faithful Steed', edition: '2024', from: 5, kind: 'uses', max: () => 1, recharge: 'long', page: 'PHB 2024 p. 111',
    note: () => 'Cast Find Steed once without a spell slot.',
  },
  {
    id: 'aura_of_protection', class: 'paladin', name: 'Aura of Protection', from: 6, kind: 'info', page: 'PHB 2014 p. 85; PHB 2024 p. 111',
    note: (c) => `You and friends within ${c.level >= 18 ? 30 : 10} feet add +${atLeast1(c.mod('cha'))} to saving throws while you're conscious (in your saves).`,
  },
  {
    id: 'cleansing_touch', class: 'paladin', name: 'Cleansing Touch', edition: '2014', from: 14, kind: 'uses', recharge: 'long', page: 'PHB 2014 p. 85',
    max: (c) => atLeast1(c.mod('cha')),
    note: () => 'End one spell on yourself or a willing creature you touch.',
  },

  // ---------- Ranger ----------
  {
    id: 'favored_enemy', class: 'ranger', name: 'Favored Enemy', edition: '2024', from: 1, kind: 'uses', recharge: 'long', page: 'PHB 2024 p. 120',
    max: (c) => step([[1, 2], [5, 3], [9, 4], [13, 5], [17, 6]], c.level),
    note: () => 'Cast Hunter\'s Mark without a spell slot.',
  },
  {
    id: 'tireless', class: 'ranger', name: 'Tireless', edition: '2024', from: 10, kind: 'uses', recharge: 'long', page: 'PHB 2024 p. 121',
    max: (c) => atLeast1(c.mod('wis')),
    note: (c) => `A magic action: gain 1d8 + ${c.mod('wis')} temporary hit points. A short rest also takes away a level of exhaustion.`,
  },
  {
    id: 'natures_veil', class: 'ranger', name: "Nature's Veil", edition: '2024', from: 14, kind: 'uses', recharge: 'long', page: 'PHB 2024 p. 121',
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'A bonus action: invisible until the end of your next turn.',
  },

  // ---------- Rogue ----------
  {
    id: 'sneak_attack', class: 'rogue', name: 'Sneak Attack', from: 1, kind: 'info', page: 'PHB 2014 p. 96; PHB 2024 p. 129',
    note: (c) => `${Math.ceil(c.level / 2)}d6 extra damage once a turn, with advantage or an ally next to the target (finesse or ranged weapon): tick Sneak Attack under the attack in Attacks and it's added to the damage (doubled on a critical hit).${c.edition === '2024' && c.level >= 5 ? ' Cunning Strike: give up dice for an effect.' : ''}`,
  },
  {
    id: 'stroke_of_luck', class: 'rogue', name: 'Stroke of Luck', from: 20, kind: 'uses', max: () => 1, recharge: 'short', page: 'PHB 2014 p. 96; PHB 2024 p. 131',
    note: (c) => (c.edition === '2024' ? 'Turn a failed d20 test into a 20.' : 'Turn a miss into a hit, or a failed ability check into a 20.'),
  },

  // ---------- Sorcerer ----------
  {
    id: 'innate_sorcery', class: 'sorcerer', name: 'Innate Sorcery', edition: '2024', from: 1, kind: 'uses', max: () => 2, recharge: 'long', page: 'PHB 2024 p. 140',
    note: (c) => `A bonus action for 1 minute: spell save DC +1 and advantage on sorcerer spell attacks.${c.level >= 7 ? ' Sorcery Incarnate: with none left, spend 2 sorcery points instead.' : ''}`,
  },
  {
    id: 'sorcery_points', class: 'sorcerer', name: 'Sorcery Points', from: 2, kind: 'pool', recharge: 'long', page: 'PHB 2014 p. 101; PHB 2024 p. 140',
    max: (c) => c.level,
    action: 'flexible_casting',
    note: (c) => `Metamagic, or Flexible Casting: turn a spell slot into points (its level), or points into a slot (1st 2, 2nd 3, 3rd 5, 4th 6, 5th 7).${c.edition === '2014' && c.level >= 20 ? ' Sorcerous Restoration: a short rest gives 4 points back.' : ''}`,
  },
  {
    id: 'sorcerous_restoration', class: 'sorcerer', name: 'Sorcerous Restoration', edition: '2024', from: 5, kind: 'uses', max: () => 1, recharge: 'long', page: 'PHB 2024 p. 141',
    action: 'sorcerous_restoration',
    note: (c) => `After a short rest, get back up to ${Math.floor(c.level / 2)} sorcery points.`,
  },

  // ---------- Warlock ----------
  {
    id: 'magical_cunning', class: 'warlock', name: 'Magical Cunning', edition: '2024', from: 2, kind: 'uses', max: () => 1, recharge: 'long', page: 'PHB 2024 p. 154',
    action: 'pact_slots',
    note: (c) => `A 1-minute rite: get back ${c.level >= 20 ? 'all your' : 'up to half your'} Pact Magic slots${c.level >= 20 ? ' (Eldritch Master)' : ''}.`,
  },
  {
    id: 'contact_patron', class: 'warlock', name: 'Contact Patron', edition: '2024', from: 9, kind: 'uses', max: () => 1, recharge: 'long', page: 'PHB 2024 p. 154',
    note: () => 'Cast Contact Other Plane without a spell slot; you succeed on its save.',
  },
  ...[[11, 6], [13, 7], [15, 8], [17, 9]].map(([from, level]) => ({
    id: `mystic_arcanum_${level}`, class: 'warlock', name: `Mystic Arcanum (${level}th level)`, from, kind: 'uses', max: () => 1, recharge: 'long', page: 'PHB 2014 p. 108; PHB 2024 p. 155',
    note: () => `Cast your ${level}th-level arcanum spell once without a slot.`,
  })),
  {
    id: 'eldritch_master', class: 'warlock', name: 'Eldritch Master', edition: '2014', from: 20, kind: 'uses', max: () => 1, recharge: 'long', page: 'PHB 2014 p. 108',
    action: 'pact_slots',
    note: () => 'Spend 1 minute entreating your patron: all your Pact Magic slots come back.',
  },

  // ---------- Wizard ----------
  {
    id: 'arcane_recovery', class: 'wizard', name: 'Arcane Recovery', from: 1, kind: 'uses', max: () => 1, recharge: 'long', page: 'PHB 2014 p. 115; PHB 2024 p. 166',
    action: 'arcane_recovery',
    note: (c) => `After a short rest, get back spell slots adding up to ${Math.ceil(c.level / 2)} levels (none of 6th level or higher).`,
  },
  {
    id: 'signature_spells', class: 'wizard', name: 'Signature Spells', from: 20, kind: 'uses', max: () => 2, recharge: 'short', page: 'PHB 2014 p. 115; PHB 2024 p. 168',
    note: () => 'Cast each of your two 3rd-level signature spells once at 3rd level without a slot.',
  },

  // ---------- Artificer (Tasha's Cauldron of Everything) ----------
  {
    id: 'infusions', class: 'artificer', name: 'Infusions', from: 2, kind: 'info', page: "Tasha's p. 12",
    note: (c) => `You know ${step([[2, 4], [6, 6], [10, 8], [14, 10], [18, 12]], c.level)} infusions and can have ${step([[2, 2], [6, 3], [10, 4], [14, 5], [18, 6]], c.level)} infused items at once.`,
  },
  {
    id: 'flash_of_genius', class: 'artificer', name: 'Flash of Genius', from: 7, kind: 'uses', recharge: 'long', page: "Tasha's p. 11",
    max: (c) => atLeast1(c.mod('int')),
    note: (c) => `A reaction: add +${c.mod('int')} to an ability check or saving throw you or a creature near you makes.`,
  },

  {
    id: 'spell_storing_item', class: 'artificer', name: 'Spell-Storing Item', from: 11, kind: 'uses', recharge: 'long', page: "Tasha's p. 12",
    max: (c) => Math.max(2, 2 * c.mod('int')),
    note: () => 'A 1st- or 2nd-level artificer spell stored in a weapon or focus: whoever holds it can cast it from it, this many times.',
  },

  // ---------- Subclasses (subclass-features.js) ----------
  ...SUBCLASS_FEATURES,

  // ---------- Races and racial feats (race-features.js) ----------
  ...RACE_FEATURES,
  ...RACIAL_FEATS,
  ...GENERAL_FEATS,
];

export const FEATURE_IDS = new Set(FEATURES.map((f) => f.id));

/** sheet.class_features, cleaned up. */
export function normalizeClassFeatures(cf = {}) {
  const out = { spent: {}, max: {}, custom: [], rolled: {} };
  out.custom = (Array.isArray(cf?.custom) ? cf.custom : []).slice(0, MAX_CUSTOM).map(normalizeCustom).filter((r) => r.name);
  const ids = new Set([...FEATURE_IDS, ...out.custom.map((r) => r.id)]);
  for (const [id, n] of Object.entries(cf?.spent ?? {})) {
    const v = int(n, { min: 0, max: 999, fallback: 0 });
    if (ids.has(id) && v) out.spent[id] = v;
  }
  for (const [id, n] of Object.entries(cf?.max ?? {})) {
    const v = int(n, { min: 0, max: 999 });
    if (FEATURE_IDS.has(id) && v != null) out.max[id] = v;
  }
  for (const [id, list] of Object.entries(cf?.rolled ?? {})) {
    const nums = (Array.isArray(list) ? list : []).slice(0, MAX_ROLLED).map((n) => int(n, { min: 1, max: 20 })).filter((n) => n != null);
    if (FEATURE_IDS.has(id) && nums.length) out.rolled[id] = nums;
  }
  return out;
}

/** A row the player added: { id, name, kind: uses | pool, max, recharge, note }. */
export function normalizeCustom(r = {}) {
  return {
    id: str(r?.id, 64) || `custom-${newId()}`,
    name: str(r?.name, 80).trim(),
    kind: r?.kind === 'pool' ? 'pool' : 'uses',
    max: int(r?.max, { min: 0, max: 999, fallback: 1 }),
    recharge: RECHARGES.includes(r?.recharge) ? r.recharge : 'long',
    note: str(r?.note, 500),
  };
}

/** A new hand-made row. */
export const newCustomFeature = (fields = {}) => normalizeCustom({ ...fields, id: `custom-${newId()}` });

/** Levels in each class on the sheet: { fighter: 5, barbarian: 3 }, and their subclasses. */
export function classLevels(sheet) {
  const levels = {};
  const subclasses = {};
  for (const c of sheet?.classes ?? []) {
    const key = classKey(c?.name);
    if (!key) continue;
    levels[key] = Math.min(20, (levels[key] ?? 0) + (Number(c.level) || 1));
    if (c.subclass) subclasses[key] = [subclasses[key], c.subclass].filter(Boolean).join(', ');
  }
  return { levels, subclasses };
}

/**
 * What a feature's rules need: this class's level, the edition, proficiency
 * bonus and ability modifiers (values from computeSheet, so magic items count).
 */
function featureContext(sheet, values, key, level, edition) {
  return {
    sheet,
    edition: edition === '2024' ? '2024' : '2014',
    level,
    pb: values?.proficiency_bonus ?? 2,
    mod: (a) => values?.[`mod.${a}`] ?? abilityMod(sheet?.abilities?.[a] ?? 10),
    subclass: key ? classLevels(sheet).subclasses[key] ?? '' : '',
    race: String(sheet?.race ?? ''),
  };
}

const call = (v, c) => (typeof v === 'function' ? v(c) : v);

/**
 * The rows this sheet's box shows, in class order, then the player's own:
 * { id, name, class, kind, max (null: unlimited), auto (the rules' max),
 * own (the player typed the max), spent, left, recharge, note, page, heal,
 * action, custom }. values: computeSheet(sheet).values.
 */
export function featureRows(sheet, { edition = '2014', values = null } = {}) {
  const cf = sheet?.class_features ?? { spent: {}, max: {}, custom: [] };
  const { levels, subclasses } = classLevels(sheet);
  const rows = [];
  // Race rows use the character level; a racial feat needs its name in the features text and a race it's for.
  const total = Math.min(20, Object.values(levels).reduce((a, b) => a + b, 0)) || 1;
  const races = new Set(racesOf(sheet?.race));
  const feats = new Set(featsOf(sheet, { edition }).map((f) => f.id));
  for (const f of FEATURES) {
    const race = f.race ? RACE_BY_KEY[f.race] : null;
    if (f.race ? !races.has(f.race) : f.feat ? !feats.has(f.id) : false) continue;
    const level = f.race || f.feat ? total : levels[f.class];
    if (!level) continue;
    if (f.edition && f.edition !== (edition === '2024' ? '2024' : '2014')) continue;
    const sub = f.sc ? SUBCLASS_BY_KEY[f.sc] : null;
    if (sub && !sub.match.test(subclasses[f.class] ?? '')) continue;
    const c = featureContext(sheet, values, f.class ?? null, level, edition);
    // Every 2024 subclass starts at 3rd level (2014 clerics, sorcerers and warlocks pick theirs at 1st, druids and wizards at 2nd).
    if (level < (sub && c.edition === '2024' ? Math.max(3, call(f.from, c)) : call(f.from, c))) continue;
    const kind = call(f.kind, c);
    const base = {
      id: f.id, name: call(f.name, c), class: f.class ?? null, subclass: sub?.name ?? null, race: race?.name ?? (f.feat ? (f.races ? 'Racial feat' : 'Feat') : null), level, kind, note: f.note ? f.note(c) : '', page: f.page, custom: false,
      action: f.action ?? null, dieSize: f.dieSize ?? null, dice: f.dice ? f.dice(c) : null, rolled: cf.rolled?.[f.id] ?? [],
    };
    if (kind === 'info') {
      rows.push({ ...base, max: null, auto: null, own: false, spent: 0, left: null, recharge: null, heal: null });
      continue;
    }
    const auto = f.max(c);
    const own = f.id in (cf.max ?? {});
    const max = own ? cf.max[f.id] : auto;
    const spent = cf.spent?.[f.id] ?? 0;
    rows.push({
      ...base,
      max,
      auto,
      own,
      spent: max == null ? 0 : Math.min(spent, max),
      left: max == null ? null : Math.max(0, max - spent),
      recharge: call(f.recharge, c),
      heal: f.heal ? f.heal(c) : null,
      refill: f.refill ?? null,
    });
  }
  for (const r of cf.custom ?? []) {
    const spent = cf.spent?.[r.id] ?? 0;
    rows.push({ ...r, class: null, subclass: null, race: null, level: null, rolled: [], dice: null, auto: r.max, own: false, spent: Math.min(spent, r.max), left: Math.max(0, r.max - spent), page: '', heal: null, action: null, custom: true });
  }
  return rows;
}

/** One row by id, or null. */
export const featureRow = (sheet, id, opts) => featureRows(sheet, opts).find((r) => r.id === id) ?? null;

/** Set how many of a row are spent (ticking boxes, or a pool's number). Returns a new sheet. */
export function setSpent(sheet, id, n) {
  const out = structuredClone(sheet);
  out.class_features ??= { spent: {}, max: {}, custom: [] };
  const v = Math.max(0, Math.trunc(Number(n) || 0));
  if (v) out.class_features.spent[id] = v;
  else delete out.class_features.spent[id];
  return out;
}

/**
 * Spend `n` of a row (a use, or points from a pool). Throws when there
 * aren't that many left (an unlimited row never runs out).
 * @returns a new sheet
 */
export function spendFeature(sheet, id, n = 1, opts = {}) {
  const row = featureRow(sheet, id, opts);
  if (!row || row.kind === 'info') throw new Error('That isn\'t one of your class features.');
  if (row.max == null) return structuredClone(sheet);
  if (row.left < n) throw new Error(`You have ${row.left ? `only ${row.left}` : 'no'} ${row.name} left. ${restText(row.recharge)}`);
  return setSpent(sheet, id, row.spent + n);
}

/** "A long rest gives them back." */
export function restText(recharge) {
  return {
    short: 'A short or long rest gives them back.',
    long: 'A long rest gives them back.',
    short_one: 'A short rest gives one back, a long rest all of them.',
    none: 'Reset it yourself when the DM says.',
  }[recharge] ?? '';
}

/**
 * A rest: each row gets back what its recharge says (short_one: one on a
 * short rest). Rows that don't apply any more keep their numbers. A long
 * rest clears dice kept from the last one (Portent), to be rolled again.
 * @returns a new sheet
 */
export function restClassFeatures(sheet, kind, edition = '2014', values = null) {
  const out = structuredClone(sheet);
  if (!out.class_features) return out;
  if (kind === 'long' && out.class_features.rolled) out.class_features.rolled = {};
  for (const row of featureRows(sheet, { edition, values })) {
    if (!row.spent || row.kind === 'info') continue;
    const back = kind === 'long'
      ? ['short', 'long', 'short_one'].includes(row.recharge)
      : row.recharge === 'short' ? true : row.recharge === 'short_one' ? 'one' : false;
    if (back === 'one') out.class_features.spent[row.id] = row.spent - 1;
    else if (back) delete out.class_features.spent[row.id];
    if (!out.class_features.spent[row.id]) delete out.class_features.spent[row.id];
  }
  return out;
}

// ---------- actions the box offers ----------

/**
 * Flexible Casting (sorcerer): turn an unspent slot of `level` (1-9) into
 * that many sorcery points. Throws if no slot of that level is left or the
 * points would go over the maximum.
 * @param {object} values computeSheet(sheet).values (for the slot counts)
 */
export function slotToPoints(sheet, level, { edition = '2014', values } = {}) {
  const row = featureRow(sheet, 'sorcery_points', { edition, values });
  if (!row) throw new Error('Flexible Casting needs sorcerer level 2.');
  const total = values?.[`slots.${level}`] ?? 0;
  const used = sheet.spellcasting?.slots_used?.[level] ?? 0;
  if (used >= total) throw new Error(`You have no ${ordinal(level)}-level spell slots left.`);
  if (row.spent < level) throw new Error(`That would take you over ${row.max} sorcery points.`);
  const out = setSpent(sheet, 'sorcery_points', row.spent - level);
  out.spellcasting.slots_used[level] = used + 1;
  return out;
}

/**
 * Flexible Casting the other way: spend sorcery points (SLOT_COST) to get
 * back a spent slot of `level` (1-5). Throws if there aren't enough points or
 * none of those slots are spent.
 */
export function pointsToSlot(sheet, level, { edition = '2014', values } = {}) {
  const cost = SLOT_COST[level];
  if (!cost) throw new Error('Sorcery points make slots of 5th level or lower.');
  const used = sheet.spellcasting?.slots_used?.[level] ?? 0;
  if (!used) throw new Error(`None of your ${ordinal(level)}-level slots are spent.`);
  const out = spendFeature(sheet, 'sorcery_points', cost, { edition, values });
  if (used > 1) out.spellcasting.slots_used[level] = used - 1;
  else delete out.spellcasting.slots_used[level];
  return out;
}

/** Sorcerous Restoration (2024): up to half your sorcerer level in points back, once per long rest. */
export function sorcerousRestoration(sheet, { edition = '2024', values } = {}) {
  const row = featureRow(sheet, 'sorcerous_restoration', { edition, values });
  const points = featureRow(sheet, 'sorcery_points', { edition, values });
  if (!row || !points) throw new Error('Sorcerous Restoration needs sorcerer level 5 (2024 rules).');
  const out = spendFeature(sheet, 'sorcerous_restoration', 1, { edition, values });
  return setSpent(out, 'sorcery_points', Math.max(0, points.spent - Math.floor(row.level / 2)));
}

/**
 * Arcane Recovery (wizard): get back spent slots, `picks` = { level: how many },
 * adding up to half your wizard level (rounded up), none of 6th level or higher.
 */
export function arcaneRecovery(sheet, picks, { edition = '2014', values, id = 'arcane_recovery' } = {}) {
  const row = featureRow(sheet, id, { edition, values });
  if (!row || row.action !== 'arcane_recovery') throw new Error(id === 'arcane_recovery' ? 'Arcane Recovery is a wizard feature.' : 'That isn\'t one of your class features.');
  const budget = Math.ceil(row.level / 2);
  let total = 0;
  const take = {};
  for (const [lv, n] of Object.entries(picks ?? {})) {
    const level = Number(lv);
    const count = Math.max(0, Math.trunc(Number(n) || 0));
    if (!count) continue;
    if (!(level >= 1 && level <= 5)) throw new Error(`${row.name} can't give back slots of 6th level or higher.`);
    const used = sheet.spellcasting?.slots_used?.[level] ?? 0;
    if (count > used) throw new Error(`You have only ${used} ${ordinal(level)}-level slot${used === 1 ? '' : 's'} spent.`);
    take[level] = count;
    total += level * count;
  }
  if (!total) throw new Error('Pick the slots to get back.');
  if (total > budget) throw new Error(`Those add up to ${total} levels; ${row.name} gives back ${budget}.`);
  const out = spendFeature(sheet, id, 1, { edition, values });
  for (const [level, n] of Object.entries(take)) {
    const left = (out.spellcasting.slots_used[level] ?? 0) - n;
    if (left) out.spellcasting.slots_used[level] = left;
    else delete out.spellcasting.slots_used[level];
  }
  return out;
}

/** Magical Cunning (2024; all of them at 20) or Eldritch Master (2014): Pact Magic slots back. */
export function regainPactSlots(sheet, id, { edition = '2014', values } = {}) {
  const row = featureRow(sheet, id, { edition, values });
  if (!row || row.action !== 'pact_slots') throw new Error('That isn\'t one of your class features.');
  const out = spendFeature(sheet, id, 1, { edition, values });
  const max = values?.pact_slots ?? 0;
  const all = id === 'eldritch_master' || row.level >= 20;
  out.spellcasting.pact_used = all ? 0 : Math.max(0, (out.spellcasting.pact_used ?? 0) - Math.ceil(max / 2));
  return out;
}

/**
 * Use a row that heals (Second Wind, Uncanny Metabolism): spend a use, add the
 * rolled `total` to hit points (up to the maximum), and refill the pool it
 * names (Uncanny Metabolism: Focus Points). The server rolls the dice.
 * @returns {{ sheet, healed }}
 */
export function healFeature(sheet, id, total, { edition = '2014', values } = {}) {
  const row = featureRow(sheet, id, { edition, values });
  if (!row?.heal) throw new Error('That feature doesn\'t heal.');
  let out = spendFeature(sheet, id, 1, { edition, values });
  if (row.refill) out = setSpent(out, row.refill, 0);
  const max = values?.hp_max ?? null;
  const now = out.hp.current ?? max ?? 0;
  const after = max == null ? now + Math.max(0, total) : Math.max(now, Math.min(max, now + Math.max(0, total)));
  out.hp.current = after;
  return { sheet: out, healed: after - now };
}

/**
 * Heal by spending a spell slot (Circle of the Moon's Combat Wild Shape,
 * 2014): a slot of `slot` level is used and the rolled `total` (1d8 a level,
 * rolled by the server) goes to the Wild Shape form's hit points, or your own
 * when you aren't in a form with its own (the DM has the last word on when
 * it's allowed). Throws when no slot of that level is left.
 * @returns {{ sheet, healed }}
 */
export function healWithSlot(sheet, id, slot, total, { edition = '2014', values } = {}) {
  const row = featureRow(sheet, id, { edition, values });
  if (row?.action !== 'slot_heal') throw new Error('That feature doesn\'t heal with spell slots.');
  const level = Math.trunc(Number(slot));
  const max = values?.[`slots.${level}`] ?? 0;
  const used = sheet.spellcasting?.slots_used?.[level] ?? 0;
  if (!(level >= 1 && level <= 9) || used >= max) throw new Error(`You have no ${ordinal(level)}-level spell slots left.`);
  let out = structuredClone(sheet);
  out.spellcasting.slots_used[level] = used + 1;
  const heal = Math.max(0, Math.trunc(total));
  if (formHasHp(out)) {
    const before = out.wild_shape.active.hp;
    out = setFormHp(out, before + heal).sheet;
    return { sheet: out, healed: out.wild_shape.active.hp - before };
  }
  const hpMax = values?.hp_max ?? null;
  const now = out.hp.current ?? hpMax ?? 0;
  out.hp.current = hpMax == null ? now + heal : Math.max(now, Math.min(hpMax, now + heal));
  return { sheet: out, healed: out.hp.current - now };
}

/** Keep dice rolled for a feature (Portent's d20s), replacing any kept before. */
export function setRolled(sheet, id, numbers) {
  const out = structuredClone(sheet);
  out.class_features ??= { spent: {}, max: {}, custom: [], rolled: {} };
  out.class_features.rolled ??= {};
  const nums = numbers.slice(0, MAX_ROLLED).map((n) => Math.trunc(Number(n))).filter((n) => n >= 1 && n <= 20);
  if (nums.length) out.class_features.rolled[id] = nums;
  else delete out.class_features.rolled[id];
  return out;
}

/** Use one of the kept dice (the `index`th): it's gone once used. */
export function useRolled(sheet, id, index) {
  const list = sheet.class_features?.rolled?.[id] ?? [];
  if (!(index >= 0 && index < list.length)) throw new Error('That roll has been used.');
  return setRolled(sheet, id, list.filter((_, i) => i !== index));
}

/** True when the sheet's active Wild Shape form has its own hit points (Combat Wild Shape heals those). */
export const healsForm = (sheet) => activeForm(sheet) != null && formHasHp(sheet);

const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/** A line per row for the archivist and the DM: "Rage: 1 of 3 left (long rest)". */
export function featureSummary(rows) {
  return rows.filter((r) => r.kind !== 'info').map((r) => `${r.name}: ${r.max == null ? 'unlimited' : `${r.left} of ${r.max} left`}${r.custom ? ' (their own)' : ''}`);
}
