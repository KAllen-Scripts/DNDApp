/**
 * Character sheet rules (D&D 5e, 2014 Player's Handbook).
 *
 * Plain JS (it imports only gear.js, the inventory rules): the server uses it, and the web page loads the
 * same file from /shared/sheet.js so automatic values update as the player
 * types. The server stays the authority on what is saved.
 *
 * A sheet holds what the player entered. Values the rules can work out
 * (modifiers, saves, skills, AC, HP, spell DC, spell slots...) are "derived":
 * the automatic value is shown unless the player typed their own. A typed
 * value is kept in sheet.overrides[key] and always wins until they reset it.
 */

import { WEAPONS, activeEffects, armorClass, attunementLimit, carriedWeight, encumbrance, normalizeInventory } from './gear.js';

export { WEAPONS };

export const SHEET_FORMAT = 'dndapp-sheet';

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

export const SKILLS = {
  acrobatics: { name: 'Acrobatics', ability: 'dex' },
  animal_handling: { name: 'Animal Handling', ability: 'wis' },
  arcana: { name: 'Arcana', ability: 'int' },
  athletics: { name: 'Athletics', ability: 'str' },
  deception: { name: 'Deception', ability: 'cha' },
  history: { name: 'History', ability: 'int' },
  insight: { name: 'Insight', ability: 'wis' },
  intimidation: { name: 'Intimidation', ability: 'cha' },
  investigation: { name: 'Investigation', ability: 'int' },
  medicine: { name: 'Medicine', ability: 'wis' },
  nature: { name: 'Nature', ability: 'int' },
  perception: { name: 'Perception', ability: 'wis' },
  performance: { name: 'Performance', ability: 'cha' },
  persuasion: { name: 'Persuasion', ability: 'cha' },
  religion: { name: 'Religion', ability: 'int' },
  sleight_of_hand: { name: 'Sleight of Hand', ability: 'dex' },
  stealth: { name: 'Stealth', ability: 'dex' },
  survival: { name: 'Survival', ability: 'wis' },
};

/** caster: full | half (from 2nd level) | third (subclass only) | pact (warlock) | artificer (half, rounded up). */
export const CLASSES = {
  artificer: { name: 'Artificer', hitDie: 8, saves: ['con', 'int'], caster: 'artificer', ability: 'int' },
  barbarian: { name: 'Barbarian', hitDie: 12, saves: ['str', 'con'], caster: null },
  bard: { name: 'Bard', hitDie: 8, saves: ['dex', 'cha'], caster: 'full', ability: 'cha' },
  cleric: { name: 'Cleric', hitDie: 8, saves: ['wis', 'cha'], caster: 'full', ability: 'wis' },
  druid: { name: 'Druid', hitDie: 8, saves: ['int', 'wis'], caster: 'full', ability: 'wis' },
  fighter: { name: 'Fighter', hitDie: 10, saves: ['str', 'con'], caster: null, third: /eldritch\s*knight/i },
  monk: { name: 'Monk', hitDie: 8, saves: ['str', 'dex'], caster: null },
  paladin: { name: 'Paladin', hitDie: 10, saves: ['wis', 'cha'], caster: 'half', ability: 'cha' },
  ranger: { name: 'Ranger', hitDie: 10, saves: ['str', 'dex'], caster: 'half', ability: 'wis' },
  rogue: { name: 'Rogue', hitDie: 8, saves: ['dex', 'int'], caster: null, third: /arcane\s*trickster/i },
  sorcerer: { name: 'Sorcerer', hitDie: 6, saves: ['con', 'cha'], caster: 'full', ability: 'cha' },
  warlock: { name: 'Warlock', hitDie: 8, saves: ['wis', 'cha'], caster: 'pact', ability: 'cha' },
  wizard: { name: 'Wizard', hitDie: 6, saves: ['int', 'wis'], caster: 'full', ability: 'int' },
};

// Suggestions for the page's free-text fields (anything can be typed).
export const RACES = [
  'Dragonborn', 'Hill Dwarf', 'Mountain Dwarf', 'High Elf', 'Wood Elf', 'Dark Elf (Drow)', 'Forest Gnome', 'Rock Gnome',
  'Half-Elf', 'Half-Orc', 'Lightfoot Halfling', 'Stout Halfling', 'Human', 'Variant Human', 'Tiefling',
];
export const BACKGROUNDS = [
  'Acolyte', 'Charlatan', 'Criminal', 'Entertainer', 'Folk Hero', 'Guild Artisan', 'Hermit', 'Noble', 'Outlander', 'Sage', 'Sailor', 'Soldier', 'Urchin',
];
export const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];
export const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];

// Spell slots by caster level (PHB Multiclass Spellcaster table; also the full casters' own table).
const FULL_SLOTS = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
// Warlock Pact Magic: [slots, slot level] by warlock level.
const PACT = [[0, 0], [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]];

/**
 * Every derived value the page shows, with its type. Each can be overridden
 * by the player (sheet.overrides[key]).
 */
export const DERIVED = {
  proficiency_bonus: 'int',
  ...Object.fromEntries(ABILITIES.map((a) => [`mod.${a}`, 'int'])),
  ...Object.fromEntries(ABILITIES.map((a) => [`save_prof.${a}`, 'bool'])),
  ...Object.fromEntries(ABILITIES.map((a) => [`save.${a}`, 'int'])),
  ...Object.fromEntries(Object.keys(SKILLS).map((s) => [`skill.${s}`, 'int'])),
  jack_of_all_trades: 'bool',
  passive_perception: 'int',
  initiative: 'int',
  ac: 'int',
  speed: 'int',
  hp_max: 'int',
  hit_dice: 'text',
  spell_ability: 'ability',
  spell_dc: 'int',
  spell_attack: 'int',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`slots.${n}`, 'int'])),
  pact_slots: 'int',
  pact_level: 'int',
};

export const TEXT_FIELDS = {
  name: 100, player_name: 100, race: 100, background: 100, alignment: 60, xp: 30,
  equipment: 20_000, proficiencies_languages: 10_000, features: 40_000,
  personality: 5000, ideals: 5000, bonds: 5000, flaws: 5000,
  age: 30, height: 30, weight: 30, eyes: 30, skin: 30, hair: 30,
  appearance: 10_000, allies: 20_000, backstory: 40_000, treasure: 10_000, additional_features: 40_000,
};

const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'];

/**
 * What an attack adds to hit and to damage: '' = nothing (the bonus and
 * damage are as written, as on sheets from before 2026-10-09 and uploads),
 * an ability, finesse (the better of Strength and Dexterity) or spell (the
 * spellcasting ability).
 */
export const ATTACK_ABILITIES = ['', ...ABILITIES, 'finesse', 'spell'];
export const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

/** A new attack: proficient, Strength, nothing written yet. */
export const newAttack = () => ({ name: '', kind: 'attack', ability: 'str', proficient: true, magic: 0, bonus: '', save: '', dc: '', damage: '', notes: '' });
// Where a spell's details came from; custom: the player's own (homebrew, or one nobody else knows), never looked up.
const SPELL_SOURCES = ['srd', 'book', 'ai', 'import', 'manual', 'custom'];

// ---------- helpers ----------

export const abilityMod = (score) => Math.floor((Number(score) - 10) / 2);
export const formatBonus = (n) => (n == null || Number.isNaN(n) ? '' : n >= 0 ? `+${n}` : `${n}`);

/** "Wizard", "wizard (evoker)" -> "wizard"; null if it isn't a PHB class. */
export function classKey(name) {
  const word = String(name ?? '').toLowerCase().match(/[a-z]+/)?.[0];
  return word && CLASSES[word] ? word : null;
}

/** Normal walking speed for a race name (PHB races; 30 ft. if unknown). */
export function raceSpeed(race) {
  const r = String(race ?? '').toLowerCase();
  if (/wood\s*elf/.test(r)) return 35;
  if (/dwarf|halfling|gnome/.test(r)) return 25;
  return 30;
}

const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);
const int = (v, { min = -999, max = 999, fallback = null } = {}) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/^\s*\+/, ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
const bool = (v) => v === true || v === 'true' || v === 1;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ---------- the sheet ----------

export function emptySheet({ name = '', player_name = '' } = {}) {
  return {
    ...Object.fromEntries(Object.keys(TEXT_FIELDS).map((k) => [k, ''])),
    name,
    player_name,
    classes: [{ name: '', subclass: '', level: 1 }],
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, 10])),
    inspiration: false,
    skills: {}, // skill key -> 'proficient' | 'expertise'
    hp: { current: null, temp: null },
    hit_dice_spent: {}, // die size -> how many of those hit dice are spent, e.g. { 10: 2, 6: 1 }
    death_saves: { successes: 0, failures: 0 },
    attacks: [], // see newAttack() and normalizeAttack()
    inventory: [], // gear carried and equipped (gear.js)
    coins: Object.fromEntries(COINS.map((c) => [c, 0])),
    spellcasting: { class: '', slots_used: {}, pact_used: 0 },
    spells: [],
    overrides: {},
  };
}

/** Coerce a value to a derived key's type; undefined if it can't be. */
export function coerceDerived(key, v) {
  switch (DERIVED[key]) {
    case 'int': return int(v) ?? undefined;
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'text': return v == null ? undefined : str(v, 100);
    case 'ability': return v === '' || ABILITIES.includes(v) ? v : undefined;
    default: return undefined;
  }
}

/**
 * An attack or other action on the sheet. kind: attack (a d20 to hit, then
 * damage) or save (the target saves against a DC; damage only). bonus and dc
 * are the player's own numbers (blank: worked out); damage is dice and a
 * type, "1d8 slashing", plus anything extra the player adds ("1d8+1d6 slashing").
 */
export function normalizeAttack(a = {}) {
  return {
    name: str(a.name, 100),
    kind: a.kind === 'save' ? 'save' : 'attack',
    // Attacks saved before abilities existed keep their numbers exactly as written.
    ability: ATTACK_ABILITIES.includes(a.ability) ? a.ability : '',
    proficient: a.proficient === undefined ? true : bool(a.proficient),
    magic: int(a.magic, { min: -10, max: 10, fallback: 0 }),
    bonus: str(a.bonus, 20),
    save: ABILITIES.includes(a.save) ? a.save : '',
    dc: str(a.dc, 20),
    damage: str(a.damage, 100),
    notes: str(a.notes, 500),
  };
}

const ABILITY_WORDS = Object.fromEntries(ABILITIES.map((a) => [ABILITY_NAMES[a].toLowerCase(), a]));
const DICE = String.raw`\d+\s*d\s*\d+(?:\s*\+\s*\d+(?!\s*d))?`;

/**
 * How a spell rolls, read from its description: { attack: '' | 'attack' |
 * 'save', save: ability, damage: "8d6 fire" | "1d8 healing", damage_mod: add
 * the spellcasting modifier, higher_damage: dice added per slot level above
 * the spell's (a cantrip: at 5th, 11th and 17th level) }. A guess the player
 * can change on the sheet.
 */
export function guessSpellRolls({ description = '', higher_levels = '', level = null } = {}) {
  const text = String(description);
  const out = { attack: '', save: '', damage: '', damage_mod: false, higher_damage: '' };
  const attack = /\bmake (?:a|an|one) (?:melee|ranged) spell attack/i.exec(text);
  const save = /\b(strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw/i.exec(text);
  if (attack && (!save || attack.index < save.index)) out.attack = 'attack';
  else if (save) Object.assign(out, { attack: 'save', save: ABILITY_WORDS[save[1].toLowerCase()] });
  const damage = new RegExp(`(${DICE})\\s+(${DAMAGE_TYPES.join('|')})\\s+damage`, 'i').exec(text);
  const heal = new RegExp(`regains?\\s+(?:a\\s+number\\s+of\\s+)?hit\\s+points\\s+equal\\s+to\\s+(${DICE})`, 'i').exec(text);
  const first = [damage, heal].filter(Boolean).sort((x, y) => x.index - y.index)[0];
  if (first) {
    out.damage = `${first[1].replace(/\s+/g, '')} ${first === damage ? damage[2].toLowerCase() : 'healing'}`;
    out.damage_mod = /^\s*\+\s*your spellcasting ability modifier/i.test(text.slice(first.index + first[0].length));
  }
  const more = /\b(?:damage|healing)\s+increases\s+by\s+(\d+d\d+)/i.exec(level === 0 ? text : higher_levels);
  if (more && out.damage) out.higher_damage = more[1];
  return out;
}

export function normalizeSpell(s = {}) {
  // A spell from before rolls existed (or a new one): read how it rolls from its text.
  const rolls = s.attack === undefined ? guessSpellRolls({ description: str(s.description, 20_000), higher_levels: str(s.higher_levels, 5000), level: int(s.level, { min: 0, max: 9 }) }) : s;
  return {
    id: str(s.id, 64) || newId(),
    name: str(s.name, 120).trim(),
    level: int(s.level, { min: 0, max: 9 }),
    school: str(s.school, 40).replace(/^\w/, (c) => c.toUpperCase()),
    casting_time: str(s.casting_time, 120),
    range: str(s.range, 120),
    components: str(s.components, 60),
    material: str(s.material, 500),
    duration: str(s.duration, 120),
    concentration: bool(s.concentration),
    ritual: bool(s.ritual),
    description: str(s.description, 20_000),
    higher_levels: str(s.higher_levels, 5000),
    attack: ['attack', 'save'].includes(rolls.attack) ? rolls.attack : '',
    save: ABILITIES.includes(rolls.save) ? rolls.save : '',
    damage: str(rolls.damage, 100),
    damage_mod: bool(rolls.damage_mod),
    higher_damage: str(rolls.higher_damage, 40),
    prepared: bool(s.prepared),
    source: SPELL_SOURCES.includes(s.source) ? s.source : 'manual',
    source_note: str(s.source_note, 300),
  };
}

/**
 * A clean, complete sheet from anything (a saved sheet, the page's edits, an
 * import). Unknown fields are dropped, types fixed, sizes limited.
 */
export function normalizeSheet(input = {}) {
  const s = input && typeof input === 'object' ? input : {};
  const out = emptySheet();
  for (const [k, max] of Object.entries(TEXT_FIELDS)) out[k] = str(s[k], max);
  if (Array.isArray(s.classes) && s.classes.length) {
    out.classes = s.classes.slice(0, 12).map((c) => ({
      name: str(c?.name, 60),
      subclass: str(c?.subclass, 80),
      level: int(c?.level, { min: 1, max: 20, fallback: 1 }),
    }));
  }
  for (const a of ABILITIES) out.abilities[a] = int(s.abilities?.[a], { min: 1, max: 30, fallback: 10 });
  out.inspiration = bool(s.inspiration);
  for (const [k, v] of Object.entries(s.skills ?? {})) {
    if (SKILLS[k] && (v === 'proficient' || v === 'expertise')) out.skills[k] = v;
  }
  out.hp = { current: int(s.hp?.current, { min: -999, max: 9999 }), temp: int(s.hp?.temp, { min: 0, max: 9999 }) };
  for (const [die, n] of Object.entries(s.hit_dice_spent ?? {})) {
    const used = int(n, { min: 0, max: 40, fallback: 0 });
    if (HIT_DIE_SIZES.includes(Number(die)) && used) out.hit_dice_spent[die] = used;
  }
  out.death_saves = {
    successes: int(s.death_saves?.successes, { min: 0, max: 3, fallback: 0 }),
    failures: int(s.death_saves?.failures, { min: 0, max: 3, fallback: 0 }),
  };
  out.attacks = (Array.isArray(s.attacks) ? s.attacks : []).slice(0, 50).map((a) => normalizeAttack(a ?? {}));
  const artificer = (out.classes ?? []).filter((c) => classKey(c.name) === 'artificer').reduce((n, c) => n + (c.level || 0), 0);
  out.inventory = normalizeInventory(s.inventory, { attuneMax: attunementLimit(artificer) });
  for (const c of COINS) out.coins[c] = int(s.coins?.[c], { min: 0, max: 99_999_999, fallback: 0 });
  out.spellcasting.class = str(s.spellcasting?.class, 60);
  for (let n = 1; n <= 9; n++) {
    const used = int(s.spellcasting?.slots_used?.[n], { min: 0, max: 20, fallback: 0 });
    if (used) out.spellcasting.slots_used[n] = used;
  }
  out.spellcasting.pact_used = int(s.spellcasting?.pact_used, { min: 0, max: 10, fallback: 0 });
  out.spells = (Array.isArray(s.spells) ? s.spells : []).slice(0, 400).map(normalizeSpell).filter((sp) => sp.name);
  for (const [k, v] of Object.entries(s.overrides ?? {})) {
    const c = coerceDerived(k, v);
    if (c !== undefined) out.overrides[k] = c;
  }
  // Sheets from before hit dice were kept per die size had one number: count those from the biggest die down.
  const legacy = int(s.hit_dice_used, { min: 0, max: 40, fallback: 0 });
  if (legacy && s.hit_dice_spent == null) out.hit_dice_spent = spendFromBiggest(hitDicePool(computeSheet(out).values.hit_dice), {}, legacy);
  return out;
}

// ---------- hit dice and rests ----------

/** Hit dice come in these sizes (a typed-in "3d20" is ignored). */
export const HIT_DIE_SIZES = [4, 6, 8, 10, 12, 20];

/** "4d10 + 3d6" -> { 10: 4, 6: 3 }. Reads whatever is in the Hit dice box, typed or automatic. */
export function hitDicePool(text) {
  const pool = {};
  for (const [, n, die] of String(text ?? '').matchAll(/(\d+)\s*d\s*(\d+)/gi)) {
    if (HIT_DIE_SIZES.includes(Number(die))) pool[die] = Math.min(40, (pool[die] ?? 0) + Number(n));
  }
  return pool;
}

/** Spend `n` more hit dice, the biggest first, as far as the pool goes. */
function spendFromBiggest(pool, spent, n) {
  const out = { ...spent };
  const sizes = Object.keys(pool).map(Number).sort((a, b) => b - a);
  for (const die of sizes) {
    const take = Math.min(n, pool[die] - (out[die] ?? 0));
    if (take > 0) {
      out[die] = (out[die] ?? 0) + take;
      n -= take;
    }
  }
  return out;
}

/** Per die size: { die, total, spent, left }, biggest first. */
export function hitDice(sheet, values = computeSheet(sheet).values) {
  const pool = hitDicePool(values.hit_dice);
  return Object.keys(pool).map(Number).sort((a, b) => b - a)
    .map((die) => {
      const spent = Math.min(pool[die], sheet.hit_dice_spent?.[die] ?? 0);
      return { die, total: pool[die], spent, left: pool[die] - spent };
    });
}

/**
 * Spend one hit die: `total` is what was rolled (the die plus the Constitution modifier).
 * You regain that many hit points (never fewer than none), up to your maximum.
 * @returns {{ sheet, healed }} a new sheet; healed is how many hit points it gave back.
 */
export function spendHitDie(sheet, die, total) {
  const { values } = computeSheet(sheet);
  const row = hitDice(sheet, values).find((d) => d.die === die);
  if (!row?.left) throw new Error(row ? `You have no d${die} hit dice left.` : `Your hit dice have no d${die}.`);
  const out = structuredClone(sheet);
  out.hit_dice_spent[die] = row.spent + 1;
  const max = values.hp_max;
  const now = out.hp.current ?? max ?? 0;
  const after = max == null ? now + Math.max(0, total) : Math.max(now, Math.min(max, now + Math.max(0, total)));
  out.hp.current = after;
  return { sheet: out, healed: after - now };
}

/** A short rest: warlocks get their Pact Magic slots back. (Hit dice are spent one at a time, with spendHitDie.) */
export function shortRest(sheet) {
  const out = structuredClone(sheet);
  out.spellcasting.pact_used = 0;
  return out;
}

/**
 * A long rest. Both editions: all hit points back, temporary hit points gone,
 * every spell slot back, death saves cleared. Spent hit dice: the 2014 rules
 * give back up to half your total (at least one), the biggest first; the 2024
 * rules give them all back. In 2014 a character at 0 hit points gets nothing
 * from it (you need at least 1 hit point when it starts).
 * @returns {{ sheet, rested: boolean, regained: { hp, hit_dice } }}
 */
export function longRest(sheet, { edition = '2014' } = {}) {
  const { values } = computeSheet(sheet);
  if (edition !== '2024' && sheet.hp.current != null && sheet.hp.current <= 0) return { sheet, rested: false, regained: { hp: 0, hit_dice: 0 } };
  const out = structuredClone(sheet);
  const before = out.hp.current ?? values.hp_max ?? 0;
  if (values.hp_max != null) out.hp.current = values.hp_max;
  out.hp.temp = null;
  out.death_saves = { successes: 0, failures: 0 };
  out.spellcasting.slots_used = {};
  out.spellcasting.pact_used = 0;
  const dice = hitDice(sheet, values);
  const all = dice.reduce((sum, d) => sum + d.total, 0);
  let back = edition === '2024' ? all : Math.max(1, Math.floor(all / 2));
  const spent = {};
  let regained = 0;
  for (const d of dice) {
    const take = Math.min(back, d.spent);
    back -= take;
    regained += take;
    if (d.spent - take) spent[d.die] = d.spent - take;
  }
  out.hit_dice_spent = spent;
  return { sheet: out, rested: true, regained: { hp: (out.hp.current ?? before) - before, hit_dice: regained } };
}

/** The sheet's classes with their rules (null rules for classes outside the PHB). */
function classList(sheet) {
  return (sheet.classes ?? [])
    .filter((c) => c.name?.trim())
    .map((c) => {
      const key = classKey(c.name);
      const rules = key ? CLASSES[key] : null;
      const caster = rules?.caster ?? (rules?.third?.test(c.subclass ?? '') ? 'third' : null);
      return { ...c, level: c.level || 1, key, rules, caster, ability: rules?.ability ?? (caster === 'third' ? 'int' : null) };
    });
}

function slotsFor(casters) {
  const nonPact = casters.filter((c) => c.caster !== 'pact');
  if (!nonPact.length) return [];
  if (nonPact.length === 1) {
    const { caster, level: L } = nonPact[0];
    if (caster === 'full') return FULL_SLOTS[L];
    if (caster === 'artificer') return FULL_SLOTS[Math.ceil(L / 2)];
    if (caster === 'half') return L >= 2 ? FULL_SLOTS[Math.ceil(L / 2)] : [];
    if (caster === 'third') return L >= 3 ? FULL_SLOTS[Math.ceil(L / 3)] : [];
    return [];
  }
  const level = nonPact.reduce((sum, { caster, level: L }) => sum + (
    caster === 'full' ? L : caster === 'artificer' ? Math.ceil(L / 2) : caster === 'half' ? Math.floor(L / 2) : Math.floor(L / 3)
  ), 0);
  return FULL_SLOTS[Math.min(20, level)];
}

/**
 * Work out every derived value.
 * @returns {{ auto: Record<string, any>, values: Record<string, any>, overridden: Set<string>, level: number, casters: object[] }}
 *   auto: what the rules give; values: what to show and use (the player's override if there is one).
 */
/** Races with Powerful Build (count as one size larger for carrying). */
const POWERFUL_BUILD = /goliath|firbolg|bugbear|loxodon|centaur|\borc\b/i;

/**
 * Everything worked out from the sheet. opts.weight is the campaign's weight
 * rule (settings.js: 'capacity', 'variant' or 'ignore').
 */
export function computeSheet(sheet, { weight = 'capacity' } = {}) {
  const overrides = sheet.overrides ?? {};
  const auto = {};
  const values = {};
  const set = (key, v) => {
    auto[key] = v;
    values[key] = key in overrides ? overrides[key] : v;
    return values[key];
  };
  const classes = classList(sheet);
  const levelIn = (key) => classes.filter((c) => c.key === key).reduce((sum, c) => sum + c.level, 0);
  const level = Math.min(20, Math.max(1, classes.reduce((sum, c) => sum + c.level, 0)));

  const pb = set('proficiency_bonus', 2 + Math.floor((level - 1) / 4));
  // Magic items equipped (and attuned) change the sheet: a score set (Gauntlets of Ogre Power) or raised, AC, saves...
  const effects = activeEffects(sheet.inventory);
  const sum = (target) => effects.filter((e) => e.target === target).reduce((n, e) => n + e.value, 0);
  const scores = {};
  for (const a of ABILITIES) {
    const own = Number(sheet.abilities?.[a] ?? 10);
    const setTo = Math.max(own, ...effects.filter((e) => e.target === `score.${a}`).map((e) => e.value));
    scores[a] = Math.min(30, setTo + sum(`bonus.${a}`));
    set(`mod.${a}`, abilityMod(scores[a]));
  }
  const mod = (a) => values[`mod.${a}`];

  // Saving throw proficiencies come from your first class.
  const first = classes[0]?.rules;
  for (const a of ABILITIES) {
    const prof = set(`save_prof.${a}`, !!first?.saves.includes(a));
    set(`save.${a}`, mod(a) + (prof ? pb : 0) + sum('saves') + sum(`save.${a}`));
  }

  // Bards from 2nd level add half their proficiency bonus to checks they aren't proficient in.
  const jack = set('jack_of_all_trades', levelIn('bard') >= 2);
  const half = jack ? Math.floor(pb / 2) : 0;
  for (const [k, { ability }] of Object.entries(SKILLS)) {
    const p = sheet.skills?.[k];
    const mult = p === 'expertise' ? 2 : p === 'proficient' ? 1 : 0;
    set(`skill.${k}`, mod(ability) + (mult ? mult * pb : half));
  }
  set('passive_perception', 10 + values['skill.perception']);
  set('initiative', mod('dex') + half + sum('initiative'));

  // AC from the armour and shield equipped in the inventory, else unarmoured (monk and barbarian
  // Unarmored Defense), plus magic items (a Ring of Protection; Bracers of Defense only with neither).
  // Features that change AC some other way are typed in by the player.
  const worn = armorClass(sheet.inventory, mod('dex'));
  const shieldAc = worn?.shield ? worn.shield.armor.base + worn.shield.magic : 0;
  const ac = [worn?.armor ? worn.ac : 10 + mod('dex') + shieldAc];
  if (levelIn('monk') && !worn) ac.push(10 + mod('dex') + mod('wis'));
  if (levelIn('barbarian') && !worn?.armor) ac.push(10 + mod('dex') + mod('con') + shieldAc);
  set('ac', Math.max(...ac) + sum('ac') + (worn ? 0 : sum('ac_unarmored')));

  // Speed: race and monk, magic items, then heavy armour without the Strength for it (−10 ft) and weight.
  const monk = levelIn('monk');
  const monkSpeed = monk >= 18 ? 30 : monk >= 14 ? 25 : monk >= 10 ? 20 : monk >= 6 ? 15 : monk >= 2 ? 10 : 0;
  const tooHeavy = worn?.armor && worn.armor.armor.strength > scores.str ? worn.armor : null;
  const load = encumbrance(carriedWeight(sheet.inventory, sheet.coins), scores.str, weight, { bigger: POWERFUL_BUILD.test(sheet.race ?? '') });
  let speed = raceSpeed(sheet.race) + monkSpeed + sum('speed') - (tooHeavy ? 10 : 0);
  if (load) speed = load.speed == null ? 5 : speed + load.speed;
  set('speed', Math.max(0, speed));

  // Rolls made with disadvantage: Stealth in noisy armour; Strength, Dexterity and Constitution when heavily encumbered.
  const disadvantage = [];
  const noisy = (sheet.inventory ?? []).find((g) => g.equipped && g.armor?.stealth);
  if (noisy) disadvantage.push({ why: noisy.name, skills: ['stealth'], abilities: [] });
  if (load?.disadvantage) disadvantage.push({ why: load.level === 'over' ? 'over your carrying capacity' : 'heavily encumbered', skills: [], abilities: ['str', 'dex', 'con'] });

  // HP: max hit die at 1st level, then the fixed average per level; Constitution each level.
  const hillDwarf = /hill\s*dwarf/i.test(sheet.race ?? '') ? 1 : 0;
  let hp = 0;
  let firstLevel = true;
  const dice = new Map();
  for (const c of classes) {
    const die = c.rules?.hitDie ?? 8;
    dice.set(die, (dice.get(die) ?? 0) + c.level);
    for (let i = 0; i < c.level; i++) {
      hp += Math.max(1, (firstLevel ? die : die / 2 + 1) + mod('con') + hillDwarf);
      firstLevel = false;
    }
  }
  set('hp_max', classes.length ? hp : null);
  set('hit_dice', [...dice].sort((x, y) => y[0] - x[0]).map(([die, n]) => `${n}d${die}`).join(' + '));

  // Spellcasting: the chosen spellcasting class, else the first class that casts.
  const casters = classes.filter((c) => c.caster);
  const chosen = classKey(sheet.spellcasting?.class);
  const primary = casters.find((c) => c.key === chosen) ?? casters[0];
  const ability = set('spell_ability', primary?.ability ?? '');
  set('spell_dc', ability ? 8 + pb + mod(ability) + sum('spell_dc') : null);
  set('spell_attack', ability ? pb + mod(ability) + sum('spell_attack') : null);
  const slots = slotsFor(casters);
  for (let n = 1; n <= 9; n++) set(`slots.${n}`, slots[n - 1] ?? 0);
  const [pactSlots, pactLevel] = PACT[Math.min(20, levelIn('warlock'))];
  set('pact_slots', pactSlots);
  set('pact_level', pactLevel);

  return { auto, values, overridden: new Set(Object.keys(overrides).filter((k) => k in auto)), level, casters, scores, effects, load, tooHeavy, disadvantage };
}

/**
 * Why a roll has disadvantage from the sheet ('' if it doesn't): pass the
 * ability it uses (str, dex... for checks, saves and attacks) and the skill, if any.
 */
export function rollDisadvantage(calc, { ability = '', skill = '' } = {}) {
  const hit = (calc?.disadvantage ?? []).find((d) => d.skills.includes(skill) || d.abilities.includes(ability));
  return hit ? hit.why : '';
}
