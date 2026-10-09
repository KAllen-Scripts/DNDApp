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

/** Armour: base AC and type (light: + Dex; medium: + Dex up to 2; heavy: nothing; shield: + base). */
const ARMOR_ROWS = [
  ['Padded armor', 11, 'light'], ['Leather armor', 11, 'light'], ['Studded leather armor', 12, 'light'],
  ['Hide armor', 12, 'medium'], ['Chain shirt', 13, 'medium'], ['Scale mail', 14, 'medium'], ['Breastplate', 14, 'medium'], ['Half plate', 15, 'medium'],
  ['Ring mail', 14, 'heavy'], ['Chain mail', 16, 'heavy'], ['Splint armor', 17, 'heavy'], ['Plate armor', 18, 'heavy'],
  ['Shield', 2, 'shield'],
];
export const ARMOR = Object.fromEntries(ARMOR_ROWS.map(([name, base, type]) => [name.toLowerCase(), { name, base, type }]));
export const ARMOR_TYPES = ['light', 'medium', 'heavy', 'shield'];
export const ITEM_KINDS = ['weapon', 'armor', 'gear', 'tool', 'potion', 'scroll', 'magic', 'other'];
export const MAX_INVENTORY = 200;

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
  if (weapon) return { kind: 'weapon', weapon: { damage: weapon.damage, ability: weapon.ability, category: weapon.category, properties: [...weapon.properties] }, armor: null, magic };
  const armor = ARMOR[base] ?? ARMOR[`${base} armor`];
  if (armor) return { kind: 'armor', weapon: null, armor: { base: armor.base, type: armor.type }, magic };
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
    };
  }
  if (kind === 'armor' || /\b(armou?r class|AC)\s*:?\s*\d+/i.test(t)) {
    const shield = /\bshield\b/i.test(name) || /^\s*\+\s*2\b/.test(t);
    const ac = /(?:armou?r class|AC)\s*:?\s*\+?\s*(\d+)/i.exec(t);
    const type = shield ? 'shield' : /\bheavy\b/i.test(t) ? 'heavy' : /\bmedium\b|\(max(?:imum)? 2\)/i.test(t) ? 'medium' : 'light';
    return { kind: 'armor', weapon: null, armor: { base: ac ? Number(ac[1]) : shield ? 2 : 10, type }, magic };
  }
  return { kind: kind || 'other', weapon: null, armor: null, magic };
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
    armor: a ? { base: int(a.base, { min: 0, max: 30, fallback: 10 }), type: ARMOR_TYPES.includes(a.type) ? a.type : 'light' } : null,
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
export function normalizeInventory(list, { latest = null } = {}) {
  const out = (Array.isArray(list) ? list : []).slice(0, MAX_INVENTORY).map((g) => normalizeGear(g ?? {}));
  for (const slot of ['body', 'shield']) {
    const worn = out.filter((g) => g.equipped && g.armor && (g.armor.type === 'shield') === (slot === 'shield'));
    if (worn.length < 2) continue;
    const keep = worn.find((g) => g.id === latest) ?? worn[0];
    for (const g of worn) if (g !== keep) g.equipped = 0;
  }
  return out;
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
export function addToInventory(inventory, { id = null, name, kind = 'other', text = '', weight = null, attunement = false }, qty = 1, { classKey = null } = {}) {
  const list = (inventory ?? []).map((g) => ({ ...g }));
  const same = list.find((g) => (id != null && g.item_id === id) || g.name.toLowerCase() === String(name).toLowerCase());
  if (same) {
    same.qty += qty;
    return normalizeInventory(list);
  }
  const stats = itemStats({ name, kind, text });
  const line = { item_id: id, name, kind: stats.kind === 'other' ? kind : stats.kind, qty, text, weight, attunement, weapon: stats.weapon, armor: stats.armor, magic: stats.magic };
  line.proficient = classProficient(classKey, line) ?? true;
  list.push(line);
  return normalizeInventory(list);
}
