/**
 * The DM's items, with usual prices in copper (gp × 100) and weights in pounds. Weapons and armour use the PHB
 * table names so the inventory knows their numbers; the magic items the app knows by name (Wand of Magic
 * Missiles, Bag of Tricks) get their charges and actions from its rules.
 */

const gp = (n) => Math.round(n * 100);

export const ITEMS = [
  // ---------- adventuring gear ----------
  { name: 'Hempen rope (50 feet)', kind: 'gear', price: gp(1), weight: 10, text: '50 feet of hempen rope. It has 2 hit points and can be burst with a DC 17 Strength check.' },
  { name: 'Hooded lantern', kind: 'gear', price: gp(5), weight: 2, text: 'Casts bright light in a 30-foot radius and dim light for an additional 30 feet. Once lit, it burns for 6 hours on a flask of oil. As an action, you can lower the hood, reducing the light to dim light in a 5-foot radius.' },
  { name: 'Oil (flask)', kind: 'gear', price: gp(0.1), weight: 1, text: 'A clay flask of lamp oil. Burns 6 hours in a lantern. Can be thrown (20 ft) and set alight: 5 fire damage to anything in a 5-foot square for 2 rounds.' },
  { name: 'Rations (1 day)', kind: 'gear', price: gp(0.5), weight: 2, text: 'Hard tack, salt cod and dried apples.' },
  { name: 'Caltrops (bag of 20)', kind: 'gear', price: gp(1), weight: 2, text: 'Covers a 5-foot square. A creature entering it must succeed on a DC 15 Dexterity saving throw or stop moving and take 1 piercing damage; its walking speed is reduced by 10 feet until it regains at least 1 hit point.' },
  { name: "Healer's kit", kind: 'gear', price: gp(5), weight: 3, text: "A leather pouch of bandages, salves and splints. Ten uses. As an action, expend one use to stabilise a creature at 0 hit points without a Wisdom (Medicine) check." },
  { name: 'Crossbow bolts (20)', kind: 'gear', price: gp(1), weight: 1.5, text: 'Twenty bolts in a waxed case.' },
  { name: 'Arrows (20)', kind: 'gear', price: gp(1), weight: 1, text: 'Twenty goose-fletched arrows.' },
  { name: 'Oilskin cloak', kind: 'gear', price: gp(2), weight: 4, text: 'A fisherman\'s waxed cloak. Keeps you dry in anything short of going overboard.' },
  { name: 'Grappling hook', kind: 'gear', price: gp(2), weight: 4, text: 'An iron grappling hook.' },
  { name: 'Chalk (1 piece)', kind: 'gear', price: 1, weight: 0, text: 'A stick of white chalk. The Gullwings\' signs are written in it.' },
  { name: "Thieves' tools", kind: 'tool', price: gp(25), weight: 1, text: 'A small file, lock picks, a mirror on a handle, narrow scissors and pliers.' },
  // ---------- weapons and armour (PHB names) ----------
  { name: 'Longsword', kind: 'weapon', price: gp(15), weight: 3 },
  { name: 'Shortsword', kind: 'weapon', price: gp(10), weight: 2 },
  { name: 'Scimitar', kind: 'weapon', price: gp(25), weight: 3 },
  { name: 'Dagger', kind: 'weapon', price: gp(2), weight: 1 },
  { name: 'Handaxe', kind: 'weapon', price: gp(5), weight: 2 },
  { name: 'Light Crossbow', kind: 'weapon', price: gp(25), weight: 5 },
  { name: 'Harpoon', kind: 'weapon', price: gp(5), weight: 4, text: '1d8 piercing (as a spear: thrown 20/60, versatile 1d10). On a hit with a thrown harpoon against a Large or smaller creature, you can keep hold of its line: the creature is grappled (escape DC 12) while you hold on.' },
  { name: 'Leather Armor', kind: 'armor', price: gp(10), weight: 10 },
  { name: 'Studded Leather Armor', kind: 'armor', price: gp(45), weight: 13 },
  { name: 'Chain Shirt', kind: 'armor', price: gp(50), weight: 20 },
  { name: 'Shield', kind: 'armor', price: gp(10), weight: 6 },
  // ---------- potions and scrolls ----------
  { name: 'Potion of Healing', kind: 'potion', rarity: 'common', price: gp(50), weight: 0.5, text: 'You regain 2d4 + 2 hit points when you drink this potion. The potion\'s red liquid glimmers when agitated.' },
  { name: 'Potion of Greater Healing', kind: 'potion', rarity: 'uncommon', price: gp(150), weight: 0.5, text: 'You regain 4d4 + 4 hit points when you drink this potion.' },
  { name: 'Potion of Water Breathing', kind: 'potion', rarity: 'uncommon', price: gp(180), weight: 0.5, text: 'You can breathe underwater for 1 hour after drinking this potion. Its cloudy green fluid smells of the sea and has a jellyfish-like bubble floating in it.' },
  { name: 'Antitoxin (vial)', kind: 'potion', price: gp(50), weight: 0, text: 'A creature that drinks this vial of liquid gains advantage on saving throws against poison for 1 hour. It confers no benefit to undead or constructs.' },
  { name: 'Spell Scroll of Cure Wounds', kind: 'scroll', rarity: 'common', price: gp(60), weight: 0, text: 'A scroll bearing the *cure wounds* spell (1st level). If the spell is on your class\'s spell list, you can read the scroll and cast the spell without providing any material components. Otherwise, the scroll is unintelligible. A creature you touch regains 1d8 + your spellcasting ability modifier hit points.' },
  // ---------- magic items ----------
  { name: 'Wand of Magic Missiles', kind: 'magic', rarity: 'uncommon', price: gp(400), weight: 1, text: "This wand has 7 charges. While holding it, you can use an action to expend 1 or more of its charges to cast the magic missile spell from it. For 1 charge, you cast the 1st-level version of the spell. You can increase the spell slot level by one for each additional charge you expend.\n\nThe wand regains 1d6 + 1 expended charges daily at dawn. If you expend the wand's last charge, roll a d20. On a 1, the wand crumbles into ashes and is destroyed." },
  { name: 'Gray Bag of Tricks', kind: 'magic', rarity: 'uncommon', price: gp(350), weight: 0.5, text: 'This ordinary bag, made from gray cloth, appears empty. Reaching inside the bag, however, reveals the presence of a small, fuzzy object. As an action, you can pull the fuzzy object from the bag and throw it up to 20 feet. When the object lands, it transforms into a creature you determine by rolling a d8. The bag can be used three times, and regains all expended uses daily at dawn.' },
  { name: 'Ring of Swimming', kind: 'magic', rarity: 'uncommon', price: gp(300), weight: 0, text: 'You have a swimming speed of 40 feet while wearing this ring.', notes: 'Ferret Lusk has one, lifted off a drowned merchant\'s finger. He swears it\'s from an estate sale.' },
  { name: 'Driftglass Lens', kind: 'magic', rarity: 'uncommon', attunement: true, price: gp(120), weight: 0, picture: 'driftglass-lens.jpg', text: 'A disc of sea-smoothed green glass in a brass ring.\n\nWhile attuned and looking through it, you can see through fog, mist and smoke as if they weren\'t there, out to 60 feet, and you can see the true forms of undead that are hiding in fog (the fog-drowned lose their advantage on Stealth against you).', notes: 'Made by Tamsin\'s grandmother for the keepers. Ferret Lusk bought it from a Choir cultist who didn\'t know what it was. Asks 150 gp, takes 90.' },
  { name: 'Tidecaller Conch', kind: 'magic', rarity: 'rare', attunement: true, price: gp(800), weight: 2, picture: 'tidecaller-conch.jpg', text: 'A pink-and-white conch the size of two fists, carved inside with tiny waves.\n\nThe conch has 3 charges. As an action you can blow it and expend 1 charge to summon a **Giant Shore Crab** in an unoccupied space of water or shore within 30 feet. It is friendly to you and your companions, obeys your spoken commands and vanishes after 1 hour or at 0 hit points.\n\nAs an action you can expend 2 charges to cast *tidal wave* (save DC 13).\n\nThe conch regains 1d3 expended charges daily at dawn.', notes: 'In the Drowned Chapel\'s vestry, the Choir\'s ceremonial horn.' },
  { name: 'Lantern of Saint Aubrel', kind: 'magic', rarity: 'very rare', attunement: true, price: null, weight: 4, picture: 'lantern-of-saint-aubrel.jpg', text: 'A tall lantern of tarnished silver with panes of white crystal. It never needs oil.\n\nAs a bonus action you can light or douse it. Lit, it sheds bright light in a 30-foot radius and dim light for another 30 feet. Undead in the bright light have disadvantage on attack rolls, and fog-drowned in it can\'t regain hit points.\n\n**Beacon (1/dawn).** As an action you can raise the lantern and make it blaze: each undead or fiend of your choice within 30 feet must succeed on a DC 15 Wisdom saving throw or take 3d8 radiant damage and be frightened of you until the end of your next turn. A creature that succeeds takes half the damage and isn\'t frightened.\n\n**Keeper\'s Light.** A warlock of the Celestial patron attuned to the lantern adds 1 die to their Healing Light pool.', notes: 'The great lamp of Lamplight Point was once lit from this lantern. Corra hid it in the chapel; it is what she means to "drown" on the night of the new moon. The finale turns on it.' },
  // ---------- story objects ----------
  { name: "Tamsin Rook's logbook", kind: 'other', price: null, weight: 2, picture: 'tamsins-logbook.jpg', text: 'The keeper\'s log of Lamplight Point, bound in tarred canvas: a line for every night, the weather, the oil burned and every ship that passed. The last pages are in a hurried hand.', notes: 'Left on the lamp-room desk. Its last entry is the wiki page "Clue: Tamsin\'s last log entry".' },
  { name: 'Gullwing ledger page', kind: 'other', price: null, weight: 0, picture: 'gullwing-ledger.jpg', text: 'A page torn from the smugglers\' book: dates, boats, cargo and who paid. Six shipments of "lamp oil, sea-grade" to the Lamplighters\' Guild warehouse, signed C.L., and two more marked "on to Varrowgate".', notes: 'Saltjaw keeps the book. He will tear this page out for anyone who takes his bargain.' },
];
