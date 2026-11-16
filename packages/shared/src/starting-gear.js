/**
 * A class's starting equipment (creation-help.js's lines, both editions) as
 * real inventory items: each line's choices ("(a) a greataxe or (b) any
 * martial melee weapon"; 2024's "(A) Greataxe, 4 Handaxes, … 15 GP; or (B)
 * 75 GP"), and each choice read into items with how many, gold, and the
 * picks the player still makes ("any simple weapon": a list to choose from).
 * The character builder's Equipment step (web/public/sheet/builder.js) shows
 * them and puts them in the inventory with gear.js addToInventory.
 */
import { ARMOR, WEAPONS } from './gear.js';
import { ITEM_NAMES } from './item-names.js';

const NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20 };
const INSTRUMENTS = ['Bagpipes', 'Drum', 'Dulcimer', 'Flute', 'Horn', 'Lute', 'Lyre', 'Pan flute', 'Shawm', 'Viol'];
const RANGED = (w) => w.properties.includes('ammunition') || ['dart', 'net'].includes(w.name.toLowerCase());

/** The choices in one line of starting equipment: ["a greataxe", "any martial melee weapon"]; a line with none is one choice. */
export function equipmentOptions(line) {
  const text = String(line ?? '').trim();
  if (!/\(([a-c])\)/i.test(text)) return [text];
  return text.split(/\s*\([a-c]\)\s*/i).map((s) => s.replace(/[;,]?\s*(or)?\s*$/i, '').trim()).filter(Boolean);
}

/** Weapons to choose from for "any simple weapon", "two martial melee weapons"… */
function weaponPick(category, melee) {
  return Object.values(WEAPONS)
    .filter((w) => (!category || w.category === category) && (melee == null || melee !== RANGED(w)))
    .map((w) => w.name);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const allNames = () => [...Object.values(WEAPONS).map((w) => w.name), ...Object.values(ARMOR).map((a) => a.name), ...ITEM_NAMES.gear, ...ITEM_NAMES.tool];

/** A known item's name for a phrase ("handaxes" → "Handaxe", "leather armour" → "Leather armor"), or null. */
export function knownItemName(phrase) {
  const p = String(phrase ?? '').toLowerCase().replace(/armour/g, 'armor').replace(/\s+/g, ' ').trim();
  const names = allNames();
  const find = (want) => names.find((n) => n.toLowerCase() === want);
  const tries = [p, p.replace(/es$/, ''), p.replace(/s$/, ''), `${p} armor`, p.replace(/ armor$/, '')];
  for (const t of tries) if (find(t)) return find(t);
  // "Arcane focus (crystal)" → "Arcane focus: crystal"; "a wooden shield" → "Shield"; "robe" → "Robes".
  const sub = /^(.+?)\s*\((.+)\)$/.exec(p);
  if (sub && find(`${sub[1]}: ${sub[2]}`)) return find(`${sub[1]}: ${sub[2]}`);
  if (sub && WEAPONS[sub[2]]) return WEAPONS[sub[2]].name; // "Druidic Focus (Quarterstaff)": the staff is the focus
  if (/shield$/.test(p)) return 'Shield';
  if (find(`${p}s`)) return find(`${p}s`);
  return null;
}

/**
 * The items in one choice: [{ name, qty, pick? }] and gold. A `pick` is a
 * list to choose the item's name from (any simple weapon, a holy symbol, an
 * instrument); its name is the first until chosen.
 * @returns {{ items: { name: string, qty: number, pick: string[]|null, label: string }[], gold: number }}
 */
export function equipmentItems(choice) {
  const text = String(choice ?? '').replace(/\(if proficient\)/gi, '').trim();
  const items = [];
  let gold = 0;
  // Split on commas and "and", but not inside brackets.
  const parts = [];
  let depth = 0;
  let cur = '';
  const words = text.split(/(\(|\)|,|\s+and\s+)/i);
  for (const w of words) {
    if (w === '(') depth++;
    if (w === ')') depth--;
    if (depth === 0 && (w === ',' || /^\s+and\s+$/i.test(w))) {
      parts.push(cur);
      cur = '';
    } else cur += w;
  }
  parts.push(cur);
  for (let raw of parts.map((s) => s.trim()).filter(Boolean)) {
    const label = raw;
    const gp = /^(\d+)\s*gp$/i.exec(raw);
    if (gp) {
      gold += Number(gp[1]);
      continue;
    }
    // "a quiver of 20 arrows": a quiver and the arrows.
    const quiver = /^an?\s+quiver of (.+)$/i.exec(raw);
    if (quiver) {
      items.push({ name: 'Quiver', qty: 1, pick: null, label: 'a quiver' });
      raw = quiver[1];
    }
    let qty = 1;
    const count = /^(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twenty)\s+(.+)$/i.exec(raw);
    if (count) {
      qty = /^\d+$/.test(count[1]) ? Number(count[1]) : NUMBERS[count[1].toLowerCase()];
      raw = count[2];
    }
    raw = raw.replace(/^the\s+/i, '').trim();
    // Arrows and bolts come in twenties.
    const ammo = /^(arrows|bolts|crossbow bolts|sling bullets|blowgun needles)$/i.exec(raw);
    if (ammo) {
      const name = { arrows: 'Arrows (20)', bolts: 'Crossbow bolts (20)', 'crossbow bolts': 'Crossbow bolts (20)', 'sling bullets': 'Sling bullets (20)', 'blowgun needles': 'Blowgun needles (50)' }[ammo[1].toLowerCase()];
      items.push({ name, qty: Math.max(1, Math.round(qty / (name.includes('50') ? 50 : 20))), pick: null, label });
      continue;
    }
    const any = /^(?:any\s+(?:other\s+)?)?(simple|martial)\s+(melee\s+|ranged\s+)?weapons?$/i.exec(raw);
    if (any) {
      const pick = weaponPick(any[1].toLowerCase(), any[2] ? /melee/i.test(any[2]) : null);
      for (let i = 0; i < qty; i++) items.push({ name: pick[0], qty: 1, pick, label: `${any[1].toLowerCase()}${any[2] ? ` ${any[2].trim().toLowerCase()}` : ''} weapon` });
      continue;
    }
    if (/musical instrument/i.test(raw)) {
      items.push({ name: INSTRUMENTS[0], qty, pick: INSTRUMENTS, label: 'a musical instrument' });
      continue;
    }
    if (/^(holy symbol|arcane focus|druidic focus)$/i.test(raw)) {
      const pick = ITEM_NAMES.gear.filter((n) => n.toLowerCase().startsWith(raw.toLowerCase()));
      items.push({ name: pick[0], qty, pick, label: raw.toLowerCase() });
      continue;
    }
    const known = knownItemName(raw);
    items.push({ name: known ?? cap(raw), qty, pick: null, label });
  }
  return { items, gold };
}
