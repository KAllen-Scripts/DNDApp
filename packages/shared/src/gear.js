/**
 * A character's gear (the sheet's `inventory`): items they carry, which are
 * equipped, and whether they're proficient with each. Equipped weapons become
 * attacks (rolls.js) and equipped armour and a shield set the armour class
 * (sheet.js). The PHB weapon and armour tables (SRD) give the numbers for
 * mundane gear by name; anything else is read from the item's description.
 *
 * Plain JS with no imports, like sheet.js: the server and the page use it.
 */

/** Weapons: damage, the ability it uses (finesse = the better of Str and Dex), simple or martial, properties. */
const WEAPON_ROWS = [
  // Simple melee
  ['Club', '1d4 bludgeoning', 'str', 'simple', ['light']],
  ['Dagger', '1d4 piercing', 'finesse', 'simple', ['finesse', 'light', 'thrown']],
  ['Greatclub', '1d8 bludgeoning', 'str', 'simple', ['two-handed']],
  ['Handaxe', '1d6 slashing', 'str', 'simple', ['light', 'thrown']],
  ['Javelin', '1d6 piercing', 'str', 'simple', ['thrown']],
  ['Light hammer', '1d4 bludgeoning', 'str', 'simple', ['light', 'thrown']],
  ['Mace', '1d6 bludgeoning', 'str', 'simple', []],
  ['Quarterstaff', '1d6 bludgeoning', 'str', 'simple', ['versatile']],
  ['Sickle', '1d4 slashing', 'str', 'simple', ['light']],
  ['Spear', '1d6 piercing', 'str', 'simple', ['thrown', 'versatile']],
  // Simple ranged
  ['Light crossbow', '1d8 piercing', 'dex', 'simple', ['ammunition', 'loading', 'two-handed']],
  ['Dart', '1d4 piercing', 'finesse', 'simple', ['finesse', 'thrown']],
  ['Shortbow', '1d6 piercing', 'dex', 'simple', ['ammunition', 'two-handed']],
  ['Sling', '1d4 bludgeoning', 'dex', 'simple', ['ammunition']],
  // Martial melee
  ['Battleaxe', '1d8 slashing', 'str', 'martial', ['versatile']],
  ['Flail', '1d8 bludgeoning', 'str', 'martial', []],
  ['Glaive', '1d10 slashing', 'str', 'martial', ['heavy', 'reach', 'two-handed']],
  ['Greataxe', '1d12 slashing', 'str', 'martial', ['heavy', 'two-handed']],
  ['Greatsword', '2d6 slashing', 'str', 'martial', ['heavy', 'two-handed']],
  ['Halberd', '1d10 slashing', 'str', 'martial', ['heavy', 'reach', 'two-handed']],
  ['Lance', '1d12 piercing', 'str', 'martial', ['reach']],
  ['Longsword', '1d8 slashing', 'str', 'martial', ['versatile']],
  ['Maul', '2d6 bludgeoning', 'str', 'martial', ['heavy', 'two-handed']],
  ['Morningstar', '1d8 piercing', 'str', 'martial', []],
  ['Pike', '1d10 piercing', 'str', 'martial', ['heavy', 'reach', 'two-handed']],
  ['Rapier', '1d8 piercing', 'finesse', 'martial', ['finesse']],
  ['Scimitar', '1d6 slashing', 'finesse', 'martial', ['finesse', 'light']],
  ['Shortsword', '1d6 piercing', 'finesse', 'martial', ['finesse', 'light']],
  ['Trident', '1d6 piercing', 'str', 'martial', ['thrown', 'versatile']],
  ['War pick', '1d8 piercing', 'str', 'martial', []],
  ['Warhammer', '1d8 bludgeoning', 'str', 'martial', ['versatile']],
  ['Whip', '1d4 slashing', 'finesse', 'martial', ['finesse', 'reach']],
  // Martial ranged
  ['Blowgun', '1 piercing', 'dex', 'martial', ['ammunition', 'loading']],
  ['Hand crossbow', '1d6 piercing', 'dex', 'martial', ['ammunition', 'light', 'loading']],
  ['Heavy crossbow', '1d10 piercing', 'dex', 'martial', ['ammunition', 'heavy', 'loading', 'two-handed']],
  ['Longbow', '1d8 piercing', 'dex', 'martial', ['ammunition', 'heavy', 'two-handed']],
  ['Net', '', 'dex', 'martial', ['thrown']],
];
export const WEAPONS = Object.fromEntries(WEAPON_ROWS.map(([name, damage, ability, category, properties]) => [name.toLowerCase(), { name, damage, ability, category, properties }]));

/** Weapons' weights in pounds (PHB). */
const WEAPON_WEIGHTS = {
  club: 2, dagger: 1, greatclub: 10, handaxe: 2, javelin: 2, 'light hammer': 2, mace: 4, quarterstaff: 4, sickle: 2, spear: 3,
  'light crossbow': 5, dart: 0.25, shortbow: 2, sling: 0,
  battleaxe: 4, flail: 2, glaive: 6, greataxe: 7, greatsword: 6, halberd: 6, lance: 6, longsword: 3, maul: 10, morningstar: 4, pike: 18,
  rapier: 2, scimitar: 3, shortsword: 2, trident: 4, 'war pick': 2, warhammer: 2, whip: 3,
  blowgun: 1, 'hand crossbow': 3, 'heavy crossbow': 18, longbow: 2, net: 3,
};
for (const w of Object.values(WEAPONS)) w.weight = WEAPON_WEIGHTS[w.name.toLowerCase()] ?? null;

/**
 * Armour: base AC and type (light: + Dex; medium: + Dex up to 2; heavy: nothing; shield: + base), weight,
 * the Strength it needs (less: speed −10 ft) and whether it gives disadvantage on Stealth.
 */
const ARMOR_ROWS = [
  ['Padded armor', 11, 'light', 8, 0, true], ['Leather armor', 11, 'light', 10, 0, false], ['Studded leather armor', 12, 'light', 13, 0, false],
  ['Hide armor', 12, 'medium', 12, 0, false], ['Chain shirt', 13, 'medium', 20, 0, false], ['Scale mail', 14, 'medium', 45, 0, true], ['Breastplate', 14, 'medium', 20, 0, false], ['Half plate', 15, 'medium', 40, 0, true],
  ['Ring mail', 14, 'heavy', 40, 0, true], ['Chain mail', 16, 'heavy', 55, 13, true], ['Splint armor', 17, 'heavy', 60, 15, true], ['Plate armor', 18, 'heavy', 65, 15, true],
  ['Shield', 2, 'shield', 6, 0, false],
];
export const ARMOR = Object.fromEntries(ARMOR_ROWS.map(([name, base, type, weight, strength, stealth]) => [name.toLowerCase(), { name, base, type, weight, strength, stealth }]));
export const ARMOR_TYPES = ['light', 'medium', 'heavy', 'shield'];
export const ITEM_KINDS = ['weapon', 'armor', 'gear', 'tool', 'potion', 'scroll', 'magic', 'other'];
export const MAX_INVENTORY = 200;

/**
 * What a magic item can change while it's equipped (and attuned, if it needs it). value is a number;
 * "score.<ability>" sets the score to at least value (Gauntlets of Ogre Power: 19), "bonus.<ability>" adds to it.
 */
export const EFFECT_TARGETS = {
  ac: 'AC', ac_unarmored: 'AC (no armour or shield)', saves: 'All saving throws',
  'save.str': 'Strength saves', 'save.dex': 'Dexterity saves', 'save.con': 'Constitution saves', 'save.int': 'Intelligence saves', 'save.wis': 'Wisdom saves', 'save.cha': 'Charisma saves',
  'score.str': 'Strength becomes', 'score.dex': 'Dexterity becomes', 'score.con': 'Constitution becomes', 'score.int': 'Intelligence becomes', 'score.wis': 'Wisdom becomes', 'score.cha': 'Charisma becomes',
  'bonus.str': 'Strength +', 'bonus.dex': 'Dexterity +', 'bonus.con': 'Constitution +', 'bonus.int': 'Intelligence +', 'bonus.wis': 'Wisdom +', 'bonus.cha': 'Charisma +',
  speed: 'Speed (feet)', initiative: 'Initiative', spell_attack: 'Spell attacks', spell_dc: 'Spell save DC',
};
export const MAX_EFFECTS = 8;
/** How many magic items one character can be attuned to (PHB; artificers more from 10th level). */
export const attunementLimit = (artificerLevel = 0) => (artificerLevel >= 18 ? 6 : artificerLevel >= 14 ? 5 : artificerLevel >= 10 ? 4 : 3);

/** Every name the tables know (for suggestions). */
export const GEAR_NAMES = [...WEAPON_ROWS.map((w) => w[0]), ...ARMOR_ROWS.map((a) => a[0])];

/**
 * Which weapons and armour a class is proficient with (PHB). The page uses it
 * to tick Proficient when something is first equipped; the player can change it.
 */
const CLASS_GEAR = {
  artificer: { weapons: ['simple'], armor: ['light', 'medium', 'shield'] },
  barbarian: { weapons: ['simple', 'martial'], armor: ['light', 'medium', 'shield'] },
  bard: { weapons: ['simple', 'hand crossbow', 'longsword', 'rapier', 'shortsword'], armor: ['light'] },
  cleric: { weapons: ['simple'], armor: ['light', 'medium', 'shield'] },
  druid: { weapons: ['club', 'dagger', 'dart', 'javelin', 'mace', 'quarterstaff', 'scimitar', 'sickle', 'sling', 'spear'], armor: ['light', 'medium', 'shield'] },
  fighter: { weapons: ['simple', 'martial'], armor: ['light', 'medium', 'heavy', 'shield'] },
  monk: { weapons: ['simple', 'shortsword'], armor: [] },
  paladin: { weapons: ['simple', 'martial'], armor: ['light', 'medium', 'heavy', 'shield'] },
  ranger: { weapons: ['simple', 'martial'], armor: ['light', 'medium', 'shield'] },
  rogue: { weapons: ['simple', 'hand crossbow', 'longsword', 'rapier', 'shortsword'], armor: ['light'] },
  sorcerer: { weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'], armor: [] },
  warlock: { weapons: ['simple'], armor: ['light'] },
  wizard: { weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'], armor: [] },
};

const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);
const int = (v, { min, max, fallback }) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/^\s*\+/, ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** "+1 Longsword", "Longsword +1", "Longsword, +1" → { base: "longsword", magic: 1 }. */
export function magicName(name) {
  const n = String(name ?? '').trim();
  const m = /^\+(\d)\s+(.+)$/.exec(n) ?? /^(.+?),?\s+\+(\d)$/.exec(n);
  if (!m) return { base: n.toLowerCase(), magic: 0 };
  return /^\+/.test(n) ? { base: m[2].toLowerCase(), magic: Number(m[1]) } : { base: m[1].toLowerCase(), magic: Number(m[2]) };
}

const DAMAGE_TYPES = 'acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder';

/**
 * What an item does when equipped, from the tables by name, else read from
 * its description: { kind, weapon: { damage, ability, category, properties }
 * | null, armor: { base, type } | null, magic }.
 */
export function itemStats({ name = '', kind = '', text = '' } = {}) {
  const { base, magic } = magicName(name);
  const weapon = WEAPONS[base];
  const extra = { charges: itemCharges(text), effects: itemEffects(text) };
  if (weapon) return { kind: 'weapon', weapon: { damage: weapon.damage, ability: weapon.ability, category: weapon.category, properties: [...weapon.properties] }, armor: null, magic, weight: weapon.weight, ...extra };
  const armor = ARMOR[base] ?? ARMOR[`${base} armor`];
  if (armor) return { kind: 'armor', weapon: null, armor: { base: armor.base, type: armor.type, strength: armor.strength, stealth: armor.stealth }, magic, weight: armor.weight, ...extra };
  const t = String(text);
  // A weapon described in words ("Melee weapon … 1d8 slashing damage", "Damage: 1d6 piercing").
  const dmg = new RegExp(`(\\d+d\\d+)\\s*(?:\\+\\s*\\d+\\s*)?(${DAMAGE_TYPES})`, 'i').exec(t);
  if (kind === 'weapon' || (dmg && /\bweapon\b/i.test(t) && kind !== 'armor')) {
    const finesse = /\bfinesse\b/i.test(t);
    const ranged = /\b(ranged|ammunition)\b/i.test(t) && !/\bmelee\b/i.test(t);
    const properties = ['finesse', 'light', 'thrown', 'heavy', 'reach', 'two-handed', 'versatile', 'ammunition', 'loading'].filter((p) => new RegExp(`\\b${p}\\b`, 'i').test(t));
    return {
      kind: 'weapon',
      weapon: { damage: dmg ? `${dmg[1]} ${dmg[2].toLowerCase()}` : '', ability: finesse ? 'finesse' : ranged ? 'dex' : 'str', category: /\bmartial\b/i.test(t) ? 'martial' : 'simple', properties },
      armor: null,
      magic,
      weight: null,
      ...extra,
    };
  }
  if (kind === 'armor' || /\b(armou?r class|AC)\s*:?\s*\d+/i.test(t)) {
    const shield = /\bshield\b/i.test(name) || /^\s*\+\s*2\b/.test(t);
    const ac = /(?:armou?r class|AC)\s*:?\s*\+?\s*(\d+)/i.exec(t);
    const type = shield ? 'shield' : /\bheavy\b/i.test(t) ? 'heavy' : /\bmedium\b|\(max(?:imum)? 2\)/i.test(t) ? 'medium' : 'light';
    return { kind: 'armor', weapon: null, armor: { base: ac ? Number(ac[1]) : shield ? 2 : 10, type, strength: Number(/Strength\s*(?:score\s*(?:of\s*)?)?(\d{2})/i.exec(t)?.[1] ?? 0), stealth: /disadvantage on (?:Dexterity \()?Stealth/i.test(t) }, magic, weight: null, ...extra };
  }
  return { kind: kind || 'other', weapon: null, armor: null, magic, weight: null, ...extra };
}

/** "This wand has 7 charges… regains 1d6 + 1 expended charges daily at dawn" → { max, used: 0, recharge }; null if none. */
export function itemCharges(text = '') {
  const t = String(text);
  const n = /\b(?:has|with|holds|starts with)\s+(\d{1,3})\s+charges\b/i.exec(t) ?? /\b(\d{1,3})\s+charges\b/i.exec(t);
  if (!n) return null;
  const r = /regains?\s+(all(?:\s+of)?(?:\s+its)?|(\d+d\d+(?:\s*[+-]\s*\d+)?)|\d+)\s+(?:expended\s+)?charges?/i.exec(t);
  const recharge = !r ? '' : /^all/i.test(r[1]) ? 'all' : r[1].replace(/\s+/g, '');
  return { max: Math.min(999, Number(n[1])), used: 0, recharge, when: /\bdawn\b/i.test(t) ? 'dawn' : /\blong rest\b/i.test(t) ? 'long rest' : /\bshort rest\b/i.test(t) ? 'short rest' : '' };
}

const ABILITY_WORDS = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const ABILITY_RE = 'Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma';

/** What a magic item does to the sheet, read from its description (the common wordings); the player can change them. */
export function itemEffects(text = '') {
  const t = String(text).replace(/\s+/g, ' ');
  const out = [];
  const add = (target, value) => {
    if (Number.isFinite(value) && value && !out.some((e) => e.target === target)) out.push({ target, value });
  };
  const acSaves = /\+(\d) bonus to (?:AC|Armor Class|armour class) and (?:to )?saving throws/i.exec(t);
  if (acSaves) {
    add('ac', Number(acSaves[1]));
    add('saves', Number(acSaves[1]));
  }
  const ac = /\+(\d) bonus to (?:AC|Armor Class|armour class)/i.exec(t);
  if (ac && !acSaves) add(/no armou?r and (?:are )?(?:using|wielding) no shield|aren't wearing armou?r|wearing no armou?r/i.test(t) ? 'ac_unarmored' : 'ac', Number(ac[1]));
  const saves = /\+(\d) bonus to (?:all )?saving throws/i.exec(t);
  if (saves) add('saves', Number(saves[1]));
  for (const m of t.matchAll(new RegExp(`your (${ABILITY_RE}) score (?:is|becomes|changes to) (\\d{1,2})`, 'gi'))) add(`score.${ABILITY_WORDS[m[1].toLowerCase()]}`, Number(m[2]));
  for (const m of t.matchAll(new RegExp(`(?:increases? your|your) (${ABILITY_RE}) score (?:increases )?by (\\d)`, 'gi'))) add(`bonus.${ABILITY_WORDS[m[1].toLowerCase()]}`, Number(m[2]));
  const spell = /\+(\d) bonus to spell attack rolls(?:[^.]*?saving throw DCs?)?/i.exec(t);
  if (spell) {
    add('spell_attack', Number(spell[1]));
    if (/saving throw DCs?/i.test(spell[0])) add('spell_dc', Number(spell[1]));
  }
  const speed = /(?:walking )?speed (?:increases|is increased) by (\d+) feet/i.exec(t);
  if (speed) add('speed', Number(speed[1]));
  const init = /\+(\d) bonus to initiative/i.exec(t);
  if (init) add('initiative', Number(init[1]));
  return out;
}

/** Whether a sheet's first class is proficient with this gear (PHB); null when it can't tell. */
export function classProficient(classKeyName, entry) {
  const gear = CLASS_GEAR[classKeyName];
  if (!gear) return null;
  if (entry.armor) return gear.armor.includes(entry.armor.type);
  if (entry.weapon) {
    const base = magicName(entry.name).base;
    return gear.weapons.includes(entry.weapon.category) || gear.weapons.includes(base);
  }
  return null;
}

/** A clean inventory line. */
export function normalizeGear(g = {}) {
  const qty = int(g.qty, { min: 1, max: 9999, fallback: 1 });
  const w = g.weapon && typeof g.weapon === 'object' ? g.weapon : null;
  const a = g.armor && typeof g.armor === 'object' ? g.armor : null;
  return {
    id: str(g.id, 64) || newId(),
    item_id: g.item_id == null ? null : str(g.item_id, 64),
    name: str(g.name, 80).trim() || 'Item',
    kind: ITEM_KINDS.includes(g.kind) ? g.kind : 'other',
    qty,
    // How many are equipped (two daggers: 2). Armour and shields: 0 or 1.
    equipped: Math.min(a ? 1 : qty, int(g.equipped === true ? 1 : g.equipped, { min: 0, max: 9999, fallback: 0 })),
    proficient: !!g.proficient,
    attuned: !!g.attuned,
    attunement: !!g.attunement,
    magic: int(g.magic, { min: -5, max: 5, fallback: 0 }),
    weapon: w ? {
      damage: str(w.damage, 60),
      ability: ['str', 'dex', 'finesse'].includes(w.ability) ? w.ability : 'str',
      category: w.category === 'martial' ? 'martial' : 'simple',
      properties: (Array.isArray(w.properties) ? w.properties : []).map((p) => str(p, 20)).filter(Boolean).slice(0, 12),
    } : null,
    armor: a ? {
      base: int(a.base, { min: 0, max: 30, fallback: 10 }),
      type: ARMOR_TYPES.includes(a.type) ? a.type : 'light',
      strength: int(a.strength, { min: 0, max: 30, fallback: 0 }),
      stealth: !!a.stealth,
    } : null,
    // Charges (a wand's 7): how many, how many used, and what comes back (dice, a number or "all") and when.
    charges: g.charges && typeof g.charges === 'object' && Number(g.charges.max) > 0 ? (() => {
      const max = int(g.charges.max, { min: 1, max: 999, fallback: 1 });
      return { max, used: int(g.charges.used, { min: 0, max, fallback: 0 }), recharge: str(g.charges.recharge, 20).replace(/\s+/g, ''), when: str(g.charges.when, 30) };
    })() : null,
    // What it does to the sheet while equipped (and attuned if it needs it): [{ target, value }].
    effects: (Array.isArray(g.effects) ? g.effects : [])
      .filter((e) => e && e.target in EFFECT_TARGETS)
      .map((e) => ({ target: e.target, value: int(e.value, { min: -30, max: 30, fallback: 0 }) }))
      .filter((e) => e.value)
      .slice(0, MAX_EFFECTS),
    weight: g.weight == null || g.weight === '' || !Number.isFinite(Number(g.weight)) ? null : Math.max(0, Number(g.weight)),
    text: str(g.text, 8000),
    source: str(g.source, 200),
  };
}

/**
 * The whole inventory, cleaned, with the equip rules: as many of a weapon
 * as you have, but one suit of armour and one shield at a time (the last
 * one equipped wins: pass the line just equipped as `latest`).
 */
export function normalizeInventory(list, { latest = null, attuneMax = 3 } = {}) {
  const out = (Array.isArray(list) ? list : []).slice(0, MAX_INVENTORY).map((g) => normalizeGear(g ?? {}));
  for (const slot of ['body', 'shield']) {
    const worn = out.filter((g) => g.equipped && g.armor && (g.armor.type === 'shield') === (slot === 'shield'));
    if (worn.length < 2) continue;
    const keep = worn.find((g) => g.id === latest) ?? worn[0];
    for (const g of worn) if (g !== keep) g.equipped = 0;
  }
  // Attuned only to items that need it, and to at most attuneMax (the one just attuned stays).
  for (const g of out) if (!g.attunement) g.attuned = false;
  const attuned = out.filter((g) => g.attuned);
  if (attuned.length > attuneMax) {
    const keep = new Set(attuned.filter((g) => g.id !== latest).slice(0, attuneMax - (attuned.some((g) => g.id === latest) ? 1 : 0)));
    for (const g of attuned) if (g.id !== latest && !keep.has(g)) g.attuned = false;
  }
  return out;
}

/** The effects of what's equipped (and attuned, for items that need it): [{ target, value, from }]. */
export function activeEffects(inventory) {
  return (inventory ?? [])
    .filter((g) => g.equipped && (!g.attunement || g.attuned))
    .flatMap((g) => (g.effects ?? []).map((e) => ({ ...e, from: g.name })));
}

/** Pounds carried: each line's weight × how many, and coins (50 to the pound). */
export function carriedWeight(inventory, coins = {}) {
  const items = (inventory ?? []).reduce((sum, g) => sum + (g.weight ?? 0) * g.qty, 0);
  const coinCount = ['cp', 'sp', 'ep', 'gp', 'pp'].reduce((sum, c) => sum + (Number(coins?.[c]) || 0), 0);
  return Math.round((items + coinCount / 50) * 100) / 100;
}

/**
 * Weight limits (PHB) by the campaign's setting: 'capacity' (carrying capacity Str × 15; more and your speed is 5 ft),
 * 'variant' (variant encumbrance: over Str × 5 speed −10 ft, over Str × 10 speed −20 ft and disadvantage on Str, Dex
 * and Con rolls, never over Str × 15) or 'ignore'. bigger doubles it (Powerful Build). Returns null when ignored.
 */
export function encumbrance(carried, strength, rule = 'capacity', { bigger = false } = {}) {
  if (rule === 'ignore') return null;
  const s = Math.max(1, strength) * (bigger ? 2 : 1);
  const capacity = s * 15;
  const over = carried > capacity;
  if (rule === 'variant') {
    const level = over ? 'over' : carried > s * 10 ? 'heavy' : carried > s * 5 ? 'encumbered' : 'none';
    return { rule, carried, capacity, encumbered: s * 5, heavy: s * 10, level, speed: { none: 0, encumbered: -10, heavy: -20, over: null }[level], disadvantage: level === 'heavy' || level === 'over' };
  }
  return { rule: 'capacity', carried, capacity, level: over ? 'over' : 'none', speed: over ? null : 0, disadvantage: false };
}

/** Armour class from what's equipped: { ac, armor, shield } or null when nothing worn. dexMod is the Dex modifier. */
export function armorClass(inventory, dexMod) {
  const worn = (inventory ?? []).filter((g) => g.equipped && g.armor);
  const body = worn.find((g) => g.armor.type !== 'shield');
  const shield = worn.find((g) => g.armor.type === 'shield');
  if (!body && !shield) return null;
  let ac = 10 + dexMod;
  if (body) {
    const { base, type } = body.armor;
    ac = base + (type === 'light' ? dexMod : type === 'medium' ? Math.min(2, dexMod) : 0) + body.magic;
  }
  if (shield) ac += shield.armor.base + shield.magic;
  return { ac, armor: body ?? null, shield: shield ?? null };
}

/**
 * The inventory with `qty` of an item added (bought at a merchant): more of
 * a line already there (the same item, or the same name), else a new line
 * with what the item does when equipped (itemStats), Proficient ticked if
 * the character's class (`classKey`, e.g. "fighter") is.
 */
export function addToInventory(inventory, { id = null, name, kind = 'other', text = '', weight = null, attunement = false }, qty = 1, { classKey = null, attuneMax = 3 } = {}) {
  const list = (inventory ?? []).map((g) => ({ ...g }));
  const same = list.find((g) => (id != null && g.item_id === id) || g.name.toLowerCase() === String(name).toLowerCase());
  if (same) {
    same.qty += qty;
    return normalizeInventory(list, { attuneMax });
  }
  const stats = itemStats({ name, kind, text });
  const line = { item_id: id, name, kind: stats.kind === 'other' ? kind : stats.kind, qty, text, weight: weight ?? stats.weight, attunement, weapon: stats.weapon, armor: stats.armor, magic: stats.magic, charges: stats.charges, effects: stats.effects };
  line.proficient = classProficient(classKey, line) ?? true;
  list.push(line);
  return normalizeInventory(list, { attuneMax });
}
