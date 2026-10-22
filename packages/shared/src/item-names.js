/**
 * Item names to suggest in the Inventory's add box, by kind: what a player
 * picks from while typing (the lookup then fills in the rest from the PHB
 * tables, the group's books or the AI). Names only, from the PHB's equipment
 * chapter and the SRD's magic items; anything else can still be typed.
 *
 * Plain JS like gear.js: the page loads it from /shared/item-names.js.
 */
import { ARMOR, WEAPONS } from './gear.js';

const GEAR = [
  'Abacus', 'Acid (vial)', "Alchemist's fire (flask)", 'Antitoxin (vial)', 'Arrows (20)', 'Backpack', 'Ball bearings (bag of 1,000)', 'Barrel', 'Basket',
  'Bedroll', 'Bell', 'Blanket', 'Block and tackle', 'Blowgun needles (50)', 'Book', 'Bottle, glass', 'Bucket', 'Caltrops (bag of 20)', 'Candle',
  'Case, crossbow bolt', 'Case, map or scroll', 'Chain (10 feet)', 'Chalk (1 piece)', 'Chest', "Climber's kit", 'Clothes, common', 'Clothes, costume',
  'Clothes, fine', "Clothes, traveler's", 'Component pouch', 'Crossbow bolts (20)', 'Crowbar', 'Arcane focus: crystal', 'Arcane focus: orb',
  'Arcane focus: rod', 'Arcane focus: staff', 'Arcane focus: wand', 'Druidic focus: sprig of mistletoe', 'Druidic focus: yew wand', 'Fishing tackle',
  'Flask or tankard', 'Grappling hook', 'Hammer', 'Hammer, sledge', "Healer's kit", 'Holy symbol: amulet', 'Holy symbol: emblem', 'Holy symbol: reliquary',
  'Holy water (flask)', 'Hourglass', 'Hunting trap', 'Ink (1 ounce bottle)', 'Ink pen', 'Jug or pitcher', 'Ladder (10-foot)', 'Lamp', 'Lantern, bullseye',
  'Lantern, hooded', 'Lock', 'Magnifying glass', 'Manacles', 'Mess kit', 'Mirror, steel', 'Oil (flask)', 'Paper (one sheet)', 'Parchment (one sheet)',
  'Perfume (vial)', "Pick, miner's", 'Piton', 'Poison, basic (vial)', 'Pole (10-foot)', 'Pot, iron', 'Pouch', 'Quiver', 'Ram, portable', 'Rations (1 day)',
  'Robes', 'Rope, hempen (50 feet)', 'Rope, silk (50 feet)', 'Sack', "Scale, merchant's", 'Sealing wax', 'Shovel', 'Signal whistle', 'Signet ring', 'Sling bullets (20)',
  'Soap', 'Spellbook', 'Spikes, iron (10)', 'Spyglass', 'Tent, two-person', 'Tinderbox', 'Torch', 'Vial', 'Waterskin', 'Whetstone',
  "Burglar's pack", "Diplomat's pack", "Dungeoneer's pack", "Entertainer's pack", "Explorer's pack", "Priest's pack", "Scholar's pack",
];

const TOOLS = [
  "Alchemist's supplies", "Brewer's supplies", "Calligrapher's supplies", "Carpenter's tools", "Cartographer's tools", "Cobbler's tools", "Cook's utensils",
  "Glassblower's tools", "Jeweler's tools", "Leatherworker's tools", "Mason's tools", "Painter's supplies", "Potter's tools", "Smith's tools", "Tinker's tools",
  "Weaver's tools", "Woodcarver's tools", 'Disguise kit', 'Forgery kit', 'Herbalism kit', "Navigator's tools", "Poisoner's kit", "Thieves' tools",
  'Dice set', 'Dragonchess set', 'Playing card set', 'Three-Dragon Ante set',
  'Bagpipes', 'Drum', 'Dulcimer', 'Flute', 'Horn', 'Lute', 'Lyre', 'Pan flute', 'Shawm', 'Viol',
];

const POTIONS = [
  'Potion of Healing', 'Potion of Greater Healing', 'Potion of Superior Healing', 'Potion of Supreme Healing',
  'Potion of Animal Friendship', 'Potion of Clairvoyance', 'Potion of Climbing', 'Potion of Diminution', 'Potion of Fire Breath', 'Potion of Flying',
  'Potion of Gaseous Form', 'Potion of Hill Giant Strength', 'Potion of Frost Giant Strength', 'Potion of Stone Giant Strength', 'Potion of Fire Giant Strength',
  'Potion of Cloud Giant Strength', 'Potion of Storm Giant Strength', 'Potion of Growth', 'Potion of Heroism', 'Potion of Invisibility', 'Potion of Longevity',
  'Potion of Mind Reading', 'Potion of Poison', 'Potion of Resistance', 'Potion of Speed', 'Potion of Vitality', 'Potion of Water Breathing',
  'Elixir of Health', 'Oil of Etherealness', 'Oil of Sharpness', 'Oil of Slipperiness', 'Philter of Love',
];

const SCROLLS = [
  'Spell Scroll (cantrip)', 'Spell Scroll (1st level)', 'Spell Scroll (2nd level)', 'Spell Scroll (3rd level)', 'Spell Scroll (4th level)',
  'Spell Scroll (5th level)', 'Spell Scroll (6th level)', 'Spell Scroll (7th level)', 'Spell Scroll (8th level)', 'Spell Scroll (9th level)', 'Scroll of Protection',
];

const MAGIC = [
  'Adamantine Armor', 'Amulet of Health', 'Amulet of Proof against Detection and Location', 'Amulet of the Planes', 'Animated Shield', 'Armor of Invulnerability',
  'Armor of Resistance', 'Arrow of Slaying', 'Bag of Beans', 'Bag of Holding', 'Bag of Tricks (Gray)', 'Bag of Tricks (Rust)', 'Bag of Tricks (Tan)', 'Bead of Force',
  'Belt of Dwarvenkind', 'Belt of Hill Giant Strength', 'Belt of Stone Giant Strength', 'Belt of Frost Giant Strength', 'Belt of Fire Giant Strength',
  'Belt of Cloud Giant Strength', 'Belt of Storm Giant Strength', 'Berserker Axe', 'Boots of Elvenkind', 'Boots of Levitation', 'Boots of Speed',
  'Boots of Striding and Springing', 'Boots of the Winterlands', 'Bowl of Commanding Water Elementals', 'Bracers of Archery', 'Bracers of Defense',
  'Brazier of Commanding Fire Elementals', 'Brooch of Shielding', 'Broom of Flying', 'Candle of Invocation', 'Cape of the Mountebank', 'Carpet of Flying',
  'Censer of Controlling Air Elementals', 'Chime of Opening', 'Circlet of Blasting', 'Cloak of Displacement', 'Cloak of Elvenkind', 'Cloak of Protection',
  'Cloak of the Bat', 'Cloak of the Manta Ray', 'Crystal Ball', 'Cube of Force', 'Decanter of Endless Water', 'Deck of Illusions', 'Deck of Many Things',
  'Defender', 'Dimensional Shackles', 'Dragon Scale Mail', 'Dragon Slayer', 'Dust of Disappearance', 'Dust of Dryness', 'Dust of Sneezing and Choking',
  'Dwarven Plate', 'Dwarven Thrower', 'Efficient Quiver', 'Efreeti Bottle', 'Elemental Gem', 'Elven Chain', 'Eversmoking Bottle', 'Eyes of Charming',
  'Eyes of Minute Seeing', 'Eyes of the Eagle', 'Figurine of Wondrous Power (Bronze Griffon)', 'Figurine of Wondrous Power (Ebony Fly)',
  'Figurine of Wondrous Power (Golden Lions)', 'Figurine of Wondrous Power (Ivory Goats)', 'Figurine of Wondrous Power (Marble Elephant)',
  'Figurine of Wondrous Power (Obsidian Steed)', 'Figurine of Wondrous Power (Onyx Dog)', 'Figurine of Wondrous Power (Serpentine Owl)',
  'Figurine of Wondrous Power (Silver Raven)', 'Flame Tongue', 'Folding Boat', 'Frost Brand', 'Gauntlets of Ogre Power', 'Gem of Brightness', 'Gem of Seeing',
  'Giant Slayer', 'Glamoured Studded Leather', 'Gloves of Missile Snaring', 'Gloves of Swimming and Climbing', 'Goggles of Night', 'Hammer of Thunderbolts',
  'Handy Haversack', 'Hat of Disguise', 'Headband of Intellect', 'Helm of Brilliance', 'Helm of Comprehending Languages', 'Helm of Telepathy',
  'Helm of Teleportation', 'Holy Avenger', 'Horn of Blasting', 'Horn of Valhalla (Silver)', 'Horn of Valhalla (Brass)', 'Horn of Valhalla (Bronze)',
  'Horn of Valhalla (Iron)', 'Horseshoes of a Zephyr', 'Horseshoes of Speed', 'Immovable Rod', 'Instant Fortress', 'Ioun Stone', 'Iron Bands of Bilarro',
  'Iron Flask', 'Javelin of Lightning', 'Lantern of Revealing', 'Luck Blade', 'Mace of Disruption', 'Mace of Smiting', 'Mace of Terror',
  'Mantle of Spell Resistance', 'Manual of Bodily Health', 'Manual of Gainful Exercise', 'Manual of Quickness of Action', 'Medallion of Thoughts',
  'Mirror of Life Trapping', 'Mithral Armor', 'Necklace of Adaptation', 'Necklace of Fireballs', 'Necklace of Prayer Beads', 'Nine Lives Stealer', 'Oathbow',
  'Pearl of Power', 'Periapt of Health', 'Periapt of Proof against Poison', 'Periapt of Wound Closure', 'Pipes of Haunting', 'Pipes of the Sewers',
  'Portable Hole', "Quaal's Feather Token", 'Ring of Animal Influence', 'Ring of Djinni Summoning', 'Ring of Elemental Command', 'Ring of Evasion',
  'Ring of Feather Falling', 'Ring of Free Action', 'Ring of Invisibility', 'Ring of Jumping', 'Ring of Mind Shielding', 'Ring of Protection',
  'Ring of Regeneration', 'Ring of Resistance', 'Ring of Shooting Stars', 'Ring of Spell Storing', 'Ring of Spell Turning', 'Ring of Swimming',
  'Ring of Telekinesis', 'Ring of the Ram', 'Ring of Three Wishes', 'Ring of Warmth', 'Ring of Water Walking', 'Ring of X-ray Vision', 'Robe of Eyes',
  'Robe of Scintillating Colors', 'Robe of Stars', 'Robe of the Archmagi', 'Robe of Useful Items', 'Rod of Absorption', 'Rod of Alertness',
  'Rod of Lordly Might', 'Rod of Rulership', 'Rod of Security', 'Rope of Climbing', 'Rope of Entanglement', 'Scarab of Protection', 'Scimitar of Speed',
  'Sentinel Shield', 'Shield, +1', 'Shield, +2', 'Shield, +3', 'Shield of Missile Attraction', 'Slippers of Spider Climbing', 'Sovereign Glue',
  'Spellguard Shield', 'Sphere of Annihilation', 'Staff of Charming', 'Staff of Fire', 'Staff of Frost', 'Staff of Healing', 'Staff of Power',
  'Staff of Striking', 'Staff of Swarming Insects', 'Staff of the Magi', 'Staff of the Python', 'Staff of the Woodlands', 'Staff of Thunder and Lightning',
  'Staff of Withering', 'Stone of Controlling Earth Elementals', 'Stone of Good Luck (Luckstone)', 'Sun Blade', 'Sword of Life Stealing',
  'Sword of Sharpness', 'Sword of Wounding', 'Talisman of Pure Good', 'Tome of Clear Thought', 'Tome of Leadership and Influence', 'Tome of Understanding',
  'Trident of Fish Command', 'Universal Solvent', 'Vicious Weapon', 'Vorpal Sword', 'Wand of Binding', 'Wand of Enemy Detection', 'Wand of Fear',
  'Wand of Fireballs', 'Wand of Lightning Bolts', 'Wand of Magic Detection', 'Wand of Magic Missiles', 'Wand of Paralysis', 'Wand of Polymorph',
  'Wand of Secrets', 'Wand of the War Mage, +1', 'Wand of Web', 'Wand of Wonder', 'Weapon, +1', 'Weapon, +2', 'Weapon, +3', 'Well of Many Worlds',
  'Wings of Flying',
];

/** The names to suggest for each kind of item (the Inventory's kind picker). */
export const ITEM_NAMES = {
  weapon: Object.values(WEAPONS).map((w) => w.name),
  armor: Object.values(ARMOR).map((a) => a.name),
  gear: GEAR,
  tool: TOOLS,
  potion: POTIONS,
  scroll: SCROLLS,
  magic: MAGIC,
  other: [],
};

/** The names to suggest for a kind: '' (or anything unknown) means every kind. */
export function itemNames(kind = '') {
  if (Object.hasOwn(ITEM_NAMES, kind) && kind !== 'other') return ITEM_NAMES[kind];
  return [...new Set(Object.values(ITEM_NAMES).flat())];
}
