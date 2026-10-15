/**
 * Race features on the character sheet: the racial traits with uses or
 * worked-out numbers (Breath Weapon, Relentless Endurance, Fey Step, Infernal
 * Legacy's spells...) and the racial feats from Xanathar's Guide to
 * Everything (Elven Accuracy, Second Chance...). They're rows of the same
 * Class features box (class-features.js adds them to its list), shown under
 * their own heading and matched on the race typed on the sheet; a racial feat
 * shows when its name is in Features & traits and the race fits.
 *
 * Which version of a race: under 2014 rules the Player's Handbook (2014) for
 * its races and the newest 2014-rules book for the rest (Mordenkainen
 * Presents: Monsters of the Multiverse replaced Volo's and Tome of Foes
 * versions; Fizban's for chromatic, metallic and gem dragonborn); under 2024
 * rules the 2024 Player's Handbook for its species, and Monsters of the
 * Multiverse for the others. Checked against the group's PDFs.
 *
 * Plain JS like sheet.js: the server uses it and the page loads it from
 * /shared/race-features.js. Every number can be typed over: the DM has the
 * last word.
 *
 * Each entry is a class feature (see FEATURES in class-features.js) with
 * `race` (its key in RACE_LIST) instead of `class`, and `from` is the
 * character level. A racial feat has `feat` (its name) and `races`.
 */

const step = (table, level) => table.reduce((v, [from, n]) => (level >= from ? n : v), table[0][1]);
const atLeast1 = (n) => Math.max(1, n);
const dc = (c, a) => 8 + c.pb + c.mod(a);
const castWith = (c) => Math.max(c.mod('int'), c.mod('wis'), c.mod('cha'));

const P14 = (n) => `PHB 2014 p. ${n}`;
const P24 = (n) => `PHB 2024 p. ${n}`;
const MPMM = (n) => `Monsters of the Multiverse p. ${n}`;
const FTD = (n) => `Fizban's p. ${n}`;
const XGE = (n) => `Xanathar's p. ${n}`;

/**
 * The races the sheet knows: key, name, match (tested against the typed
 * race), not (a race this one mustn't be mistaken for) and the book. A sheet
 * can match more than one (a "Wood Elf" is also an elf).
 */
export const RACE_LIST = [
  { key: 'aasimar', name: 'Aasimar', match: /aasimar/i, book: 'Monsters of the Multiverse; PHB 2024' },
  { key: 'dragonborn', name: 'Dragonborn', match: /dragonborn/i, not: /chromatic|metallic|\bgem\b/i, book: 'PHB 2014; PHB 2024' },
  { key: 'chromatic_dragonborn', name: 'Chromatic Dragonborn', match: /chromatic/i, book: "Fizban's" },
  { key: 'metallic_dragonborn', name: 'Metallic Dragonborn', match: /metallic/i, book: "Fizban's" },
  { key: 'gem_dragonborn', name: 'Gem Dragonborn', match: /\bgem\b/i, book: "Fizban's" },
  { key: 'dwarf', name: 'Dwarf', match: /dwarf/i, not: /duergar|gr[ae]y\s*dwarf/i, book: 'PHB 2014; PHB 2024' },
  { key: 'duergar', name: 'Duergar', match: /duergar|gr[ae]y\s*dwarf/i, book: 'Monsters of the Multiverse' },
  { key: 'elf', name: 'Elf', match: /\belf\b|elven|drow/i, not: /half[\s-]*elf|sea\s*elf|shadar|eladrin/i, book: 'PHB 2014; PHB 2024' },
  { key: 'drow', name: 'Drow', match: /drow|dark\s*elf/i, book: 'PHB 2014; PHB 2024' },
  { key: 'high_elf', name: 'High Elf', match: /high\s*elf/i, book: 'PHB 2014; PHB 2024' },
  { key: 'wood_elf', name: 'Wood Elf', match: /wood\s*elf/i, book: 'PHB 2014; PHB 2024' },
  { key: 'half_elf', name: 'Half-Elf', match: /half[\s-]*elf/i, book: 'PHB 2014' },
  { key: 'eladrin', name: 'Eladrin', match: /eladrin/i, book: 'Monsters of the Multiverse' },
  { key: 'shadar_kai', name: 'Shadar-kai', match: /shadar/i, book: 'Monsters of the Multiverse' },
  { key: 'gnome', name: 'Gnome', match: /gnome/i, not: /deep\s*gnome|svirfneblin/i, book: 'PHB 2014; PHB 2024' },
  { key: 'forest_gnome', name: 'Forest Gnome', match: /forest\s*gnome/i, book: 'PHB 2014; PHB 2024' },
  { key: 'deep_gnome', name: 'Deep Gnome', match: /deep\s*gnome|svirfneblin/i, book: 'Monsters of the Multiverse' },
  { key: 'goliath', name: 'Goliath', match: /goliath/i, book: 'Monsters of the Multiverse; PHB 2024' },
  { key: 'halfling', name: 'Halfling', match: /halfling/i, book: 'PHB 2014; PHB 2024' },
  { key: 'human', name: 'Human', match: /human/i, book: 'PHB 2014; PHB 2024' },
  { key: 'half_orc', name: 'Half-Orc', match: /half[\s-]*orc/i, book: 'PHB 2014' },
  { key: 'orc', name: 'Orc', match: /\borcs?\b/i, not: /half[\s-]*orc/i, book: 'Monsters of the Multiverse; PHB 2024' },
  { key: 'tiefling', name: 'Tiefling', match: /tiefling/i, book: 'PHB 2014; PHB 2024' },
  { key: 'fairy', name: 'Fairy', match: /\bfair(y|ies)\b/i, book: 'Monsters of the Multiverse' },
  { key: 'firbolg', name: 'Firbolg', match: /firbolg/i, book: 'Monsters of the Multiverse' },
  { key: 'genasi', name: 'Genasi', match: /genasi/i, book: 'Monsters of the Multiverse' },
  { key: 'githyanki', name: 'Githyanki', match: /githyanki/i, book: 'Monsters of the Multiverse' },
  { key: 'githzerai', name: 'Githzerai', match: /githzerai/i, book: 'Monsters of the Multiverse' },
  { key: 'goblin', name: 'Goblin', match: /\bgoblin/i, book: 'Monsters of the Multiverse' },
  { key: 'harengon', name: 'Harengon', match: /harengon/i, book: 'Monsters of the Multiverse' },
  { key: 'hobgoblin', name: 'Hobgoblin', match: /hobgoblin/i, book: 'Monsters of the Multiverse' },
  { key: 'kenku', name: 'Kenku', match: /kenku/i, book: 'Monsters of the Multiverse' },
  { key: 'lizardfolk', name: 'Lizardfolk', match: /lizard/i, book: 'Monsters of the Multiverse' },
  { key: 'shifter', name: 'Shifter', match: /shifter/i, book: 'Monsters of the Multiverse' },
  { key: 'tabaxi', name: 'Tabaxi', match: /tabaxi/i, book: 'Monsters of the Multiverse' },
  { key: 'triton', name: 'Triton', match: /triton/i, book: 'Monsters of the Multiverse' },
  { key: 'yuan_ti', name: 'Yuan-ti', match: /yuan/i, book: 'Monsters of the Multiverse' },
  // Races only for Xanathar's racial feats (nothing of their own to track).
  { key: 'small', name: 'Small race', match: /gnome|halfling|\bgoblin|kobold|svirfneblin/i, feat: true },
];

export const RACE_BY_KEY = Object.fromEntries(RACE_LIST.map((r) => [r.key, r]));

/** The keys of every race a typed race matches: racesOf('Wood Elf') → ['elf', 'wood_elf']. */
export function racesOf(typed) {
  const t = String(typed ?? '').trim();
  if (!t) return [];
  return RACE_LIST.filter((r) => r.match.test(t) && !(r.not && r.not.test(t))).map((r) => r.key);
}

/** True if the typed race is one the box has rows for. */
export const knownRace = (typed) => racesOf(typed).some((k) => !RACE_BY_KEY[k].feat);

/** The damage type a dragonborn's typed race names ("Red Dragonborn" → fire), or ''. */
const DRAGON_TYPES = {
  black: 'acid', blue: 'lightning', brass: 'fire', bronze: 'lightning', copper: 'acid', gold: 'fire', green: 'poison', red: 'fire', silver: 'cold', white: 'cold',
  amethyst: 'force', crystal: 'radiant', emerald: 'psychic', sapphire: 'thunder', topaz: 'necrotic',
};
const breathType = (c) => {
  const word = Object.keys(DRAGON_TYPES).find((k) => new RegExp(`\\b${k}\\b`, 'i').test(c.race));
  return word ? `${DRAGON_TYPES[word]} ` : '';
};
/** The Genasi kind from the typed race. */
const genasiKind = (c) => (/air/i.test(c.race) ? 'air' : /earth/i.test(c.race) ? 'earth' : /fire/i.test(c.race) ? 'fire' : /water/i.test(c.race) ? 'water' : '');
/** The 2024 tiefling's Fiendish Legacy from the typed race (Infernal when it doesn't say). */
const legacy = (c) => (/abyss/i.test(c.race) ? 'abyssal' : /chthon/i.test(c.race) ? 'chthonic' : 'infernal');

const E14 = '2014';
const E24 = '2024';

export const RACE_FEATURES = [
  // ---------- Aasimar (Monsters of the Multiverse; the 2024 PHB's is the same) ----------
  {
    id: 'healing_hands', race: 'aasimar', name: 'Healing Hands', from: 1, kind: 'uses', max: () => 1, recharge: 'long', page: `${MPMM(7)}; ${P24(186)}`,
    note: (c) => `An action: touch a creature and heal it ${c.pb}d4.`,
  },
  {
    id: 'celestial_revelation', race: 'aasimar', name: 'Celestial Revelation', from: 3, kind: 'uses', max: () => 1, recharge: 'long', page: `${MPMM(7)}; ${P24(186)}`,
    note: (c) => `A bonus action for 1 minute: Heavenly Wings (fly), Inner Radiance (light, ${c.pb} radiant to creatures within 10 feet each turn) or Necrotic Shroud (frighten, Charisma save DC ${dc(c, 'cha')}); once a turn deal ${c.pb} radiant or necrotic damage more.`,
  },

  // ---------- Dragonborn ----------
  {
    id: 'breath_weapon_2014', race: 'dragonborn', edition: E14, name: 'Breath Weapon', from: 1, kind: 'uses', max: () => 1, recharge: 'short', page: P14(34),
    note: (c) => `An action: a 5 by 30-foot line or 15-foot cone (by ancestry) of ${step([[1, 2], [6, 3], [11, 4], [16, 5]], c.level)}d6 ${breathType(c)}damage (save DC ${dc(c, 'con')}, half on a success).`,
  },
  {
    id: 'breath_weapon_2024', race: 'dragonborn', edition: E24, name: 'Breath Weapon', from: 1, kind: 'uses', recharge: 'long', page: P24(187),
    max: (c) => c.pb,
    note: (c) => `In place of an attack: a 15-foot cone or 30-foot line of ${step([[1, 1], [5, 2], [11, 3], [17, 4]], c.level)}d10 ${breathType(c)}damage (Dexterity save, DC ${dc(c, 'con')}, for half).`,
  },
  {
    id: 'draconic_flight', race: 'dragonborn', edition: E24, name: 'Draconic Flight', from: 5, kind: 'uses', max: () => 1, recharge: 'long', page: P24(187),
    note: () => 'A bonus action: spectral wings for 10 minutes, a flying speed equal to your speed.',
  },
  ...['chromatic', 'metallic', 'gem'].map((kind) => ({
    id: `breath_weapon_${kind}`, race: `${kind}_dragonborn`, name: 'Breath Weapon', from: 1, kind: 'uses', recharge: 'long', page: FTD(kind === 'chromatic' ? 10 : kind === 'gem' ? 11 : 12),
    max: (c) => c.pb,
    note: (c) => `In place of an attack: a ${kind === 'chromatic' ? '5 by 30-foot line' : '15-foot cone'} of ${step([[1, 1], [5, 2], [11, 3], [17, 4]], c.level)}d10 ${breathType(c)}damage (Dexterity save, DC ${dc(c, 'con')}, for half).${kind === 'gem' ? ' Psionic Mind: telepathy 30 feet.' : ''}`,
  })),
  {
    id: 'chromatic_warding', race: 'chromatic_dragonborn', name: 'Chromatic Warding', from: 5, kind: 'uses', max: () => 1, recharge: 'long', page: FTD(10),
    note: (c) => `An action: immune to ${breathType(c) ? breathType(c).trim() : 'your ancestry\'s'} damage for 1 minute.`,
  },
  {
    id: 'metallic_breath', race: 'metallic_dragonborn', name: 'Metallic Breath Weapon', from: 5, kind: 'uses', max: () => 1, recharge: 'long', page: FTD(12),
    note: (c) => `In place of an attack, a 15-foot cone (DC ${dc(c, 'con')}): Enervating (Constitution save or incapacitated until your next turn) or Repulsion (Strength save or pushed 20 feet and prone).`,
  },
  {
    id: 'gem_flight', race: 'gem_dragonborn', name: 'Gem Flight', from: 5, kind: 'uses', max: () => 1, recharge: 'long', page: FTD(11),
    note: () => 'A bonus action: spectral wings for 1 minute, a flying speed equal to your walking speed, and hover.',
  },

  // ---------- Dwarves ----------
  {
    id: 'stonecunning_2024', race: 'dwarf', edition: E24, name: 'Stonecunning', from: 1, kind: 'uses', recharge: 'long', page: P24(188),
    max: (c) => c.pb,
    note: () => 'A bonus action on or touching stone: tremorsense 60 feet for 10 minutes.',
  },
  {
    id: 'duergar_magic', race: 'duergar', name: 'Duergar Magic', from: 3, kind: 'uses', recharge: 'long', page: MPMM(12),
    max: (c) => (c.level >= 5 ? 2 : 1),
    note: (c) => `Enlarge/Reduce on yourself${c.level >= 5 ? ' and Invisibility on yourself' : ''}, each once per long rest without a slot (Int, Wis or Cha).`,
  },

  // ---------- Elves ----------
  {
    id: 'drow_magic_3', race: 'drow', name: 'Faerie Fire (Drow)', from: 3, kind: 'uses', max: () => 1, recharge: 'long', page: `${P14(24)}; ${P24(190)}`,
    note: (c) => `Cast Faerie Fire without a slot (${c.edition === '2024' ? 'Int, Wis or Cha' : 'Charisma'}).`,
  },
  {
    id: 'drow_magic_5', race: 'drow', name: 'Darkness (Drow)', from: 5, kind: 'uses', max: () => 1, recharge: 'long', page: `${P14(24)}; ${P24(190)}`,
    note: (c) => `Cast Darkness without a slot (${c.edition === '2024' ? 'Int, Wis or Cha' : 'Charisma'}).`,
  },
  {
    id: 'high_elf_magic_3', race: 'high_elf', edition: E24, name: 'Detect Magic (High Elf)', from: 3, kind: 'uses', max: () => 1, recharge: 'long', page: P24(190),
    note: () => 'Cast Detect Magic without a slot. You can also cast it with your slots.',
  },
  {
    id: 'high_elf_magic_5', race: 'high_elf', edition: E24, name: 'Misty Step (High Elf)', from: 5, kind: 'uses', max: () => 1, recharge: 'long', page: P24(190),
    note: () => 'Cast Misty Step without a slot.',
  },
  {
    id: 'wood_elf_magic_3', race: 'wood_elf', edition: E24, name: 'Longstrider (Wood Elf)', from: 3, kind: 'uses', max: () => 1, recharge: 'long', page: P24(190),
    note: () => 'Cast Longstrider without a slot.',
  },
  {
    id: 'wood_elf_magic_5', race: 'wood_elf', edition: E24, name: 'Pass without Trace (Wood Elf)', from: 5, kind: 'uses', max: () => 1, recharge: 'long', page: P24(190),
    note: () => 'Cast Pass without Trace without a slot.',
  },
  {
    id: 'fey_step', race: 'eladrin', name: 'Fey Step', from: 1, kind: 'uses', recharge: 'long', page: MPMM(13),
    max: (c) => c.pb,
    note: (c) => `A bonus action: teleport 30 feet.${c.level >= 3 ? ` Your season adds an effect (save DC ${8 + c.pb + castWith(c)}): Autumn charms, Winter frightens, Spring moves a willing creature instead, Summer deals ${c.pb} fire damage.` : ''}`,
  },
  {
    id: 'blessing_of_the_raven_queen', race: 'shadar_kai', name: 'Blessing of the Raven Queen', from: 1, kind: 'uses', recharge: 'long', page: MPMM(31),
    max: (c) => c.pb,
    note: (c) => `A bonus action: teleport 30 feet.${c.level >= 3 ? ' You also resist all damage until the start of your next turn.' : ''}`,
  },

  // ---------- Gnomes ----------
  {
    id: 'forest_gnome_animals', race: 'forest_gnome', edition: E24, name: 'Speak with Animals (Forest Gnome)', from: 1, kind: 'uses', recharge: 'long', page: P24(191),
    max: (c) => c.pb,
    note: () => 'Cast Speak with Animals without a slot. You also know Minor Illusion.',
  },
  {
    id: 'svirfneblin_camouflage', race: 'deep_gnome', name: 'Svirfneblin Camouflage', from: 1, kind: 'uses', recharge: 'long', page: MPMM(11),
    max: (c) => c.pb,
    note: () => 'Advantage on a Dexterity (Stealth) check.',
  },
  {
    id: 'gift_of_the_svirfneblin', race: 'deep_gnome', name: 'Gift of the Svirfneblin', from: 3, kind: 'uses', recharge: 'long', page: MPMM(11),
    max: (c) => (c.level >= 5 ? 2 : 1),
    note: (c) => `Disguise Self${c.level >= 5 ? ' and Nondetection (on yourself)' : ''}, each once per long rest without a slot or material components.`,
  },

  // ---------- Goliath ----------
  {
    id: 'stones_endurance', race: 'goliath', edition: E14, name: "Stone's Endurance", from: 1, kind: 'uses', recharge: 'long', page: MPMM(21),
    max: (c) => c.pb,
    note: (c) => `A reaction when you take damage: take 1d12 ${c.mod('con') < 0 ? '−' : '+'} ${Math.abs(c.mod('con'))} off it.`,
  },
  {
    id: 'giant_ancestry', race: 'goliath', edition: E24, name: 'Giant Ancestry', from: 1, kind: 'uses', recharge: 'long', page: P24(192),
    max: (c) => c.pb,
    note: (c) => `Your ancestry's boon: Cloud's Jaunt (teleport 30 feet), Fire's Burn (1d10 fire), Frost's Chill (1d6 cold, −10 speed), Hill's Tumble (knock Large or smaller prone), Stone's Endurance (a reaction, 1d12 + ${c.mod('con')} off damage) or Storm's Thunder (a reaction, 1d8 thunder to an attacker).`,
  },
  {
    id: 'large_form', race: 'goliath', edition: E24, name: 'Large Form', from: 5, kind: 'uses', max: () => 1, recharge: 'long', page: P24(192),
    note: () => 'A bonus action for 10 minutes: Large, advantage on Strength checks, +10 feet speed.',
  },

  // ---------- Halflings and humans ----------
  {
    id: 'halfling_luck', race: 'halfling', name: 'Luck', from: 1, kind: 'info', page: `${P14(28)}; ${P24(193)}`,
    note: () => 'When you roll a 1 on the d20 of an attack, ability check or saving throw, reroll it and use the new roll.',
  },
  {
    id: 'heroic_inspiration_human', race: 'human', edition: E24, name: 'Resourceful', from: 1, kind: 'uses', max: () => 1, recharge: 'long', page: P24(194),
    note: () => 'You gain Heroic Inspiration whenever you finish a long rest: reroll any die you roll.',
  },

  // ---------- Orcs ----------
  {
    id: 'relentless_endurance', race: 'half_orc', name: 'Relentless Endurance', from: 1, kind: 'uses', max: () => 1, recharge: 'long', page: P14(41),
    note: () => 'When you drop to 0 hit points but aren\'t killed outright, drop to 1 instead. Savage Attacks: one more weapon die on a melee critical hit.',
  },
  {
    id: 'adrenaline_rush', race: 'orc', name: 'Adrenaline Rush', from: 1, kind: 'uses', page: `${MPMM(28)}; ${P24(195)}`,
    max: (c) => c.pb,
    recharge: (c) => (c.edition === '2024' ? 'short' : 'long'),
    note: (c) => `Dash as a bonus action and gain ${c.pb} temporary hit points.`,
  },
  {
    id: 'relentless_endurance_orc', race: 'orc', edition: E24, name: 'Relentless Endurance', from: 1, kind: 'uses', max: () => 1, recharge: 'long', page: P24(195),
    note: () => 'When you drop to 0 hit points but aren\'t killed outright, drop to 1 instead.',
  },

  // ---------- Tiefling ----------
  {
    id: 'tiefling_legacy_3', race: 'tiefling', name: (c) => `${{ abyssal: 'Ray of Sickness', chthonic: 'False Life', infernal: 'Hellish Rebuke' }[c.edition === '2024' ? legacy(c) : 'infernal']} (Tiefling)`, from: 3, kind: 'uses', max: () => 1, recharge: 'long', page: `${P14(43)}; ${P24(197)}`,
    note: (c) => (c.edition === '2024'
      ? `Fiendish Legacy (${legacy(c)}): cast it without a slot, once per long rest (Int, Wis or Cha); also with your slots. Write Abyssal or Chthonic in the race for those legacies.`
      : 'Infernal Legacy: cast Hellish Rebuke as a 2nd-level spell without a slot (Charisma). A Tome of Foes subrace has other spells: add them as rows of your own.'),
  },
  {
    id: 'tiefling_legacy_5', race: 'tiefling', name: (c) => `${{ abyssal: 'Hold Person', chthonic: 'Ray of Enfeeblement', infernal: 'Darkness' }[c.edition === '2024' ? legacy(c) : 'infernal']} (Tiefling)`, from: 5, kind: 'uses', max: () => 1, recharge: 'long', page: `${P14(43)}; ${P24(197)}`,
    note: (c) => `Cast it without a slot, once per long rest (${c.edition === '2024' ? 'Int, Wis or Cha' : 'Charisma'}).`,
  },

  // ---------- Monsters of the Multiverse ----------
  {
    id: 'fairy_magic', race: 'fairy', name: 'Fairy Magic', from: 3, kind: 'uses', recharge: 'long', page: MPMM(14),
    max: (c) => (c.level >= 5 ? 2 : 1),
    note: (c) => `Faerie Fire${c.level >= 5 ? ' and Enlarge/Reduce' : ''}, each once per long rest without a slot. You know Druidcraft and can fly.`,
  },
  {
    id: 'firbolg_magic', race: 'firbolg', name: 'Firbolg Magic', from: 1, kind: 'uses', max: () => 2, recharge: 'long', page: MPMM(15),
    note: () => 'Detect Magic and Disguise Self, each once per long rest without a slot.',
  },
  {
    id: 'hidden_step', race: 'firbolg', name: 'Hidden Step', from: 1, kind: 'uses', recharge: 'long', page: MPMM(15),
    max: (c) => c.pb,
    note: () => 'A bonus action: invisible until the start of your next turn, or until you attack, deal damage or force a save.',
  },
  {
    id: 'genasi_magic', race: 'genasi', name: 'Genasi Magic', kind: 'uses', recharge: 'long', page: MPMM(16),
    from: (c) => (genasiKind(c) === 'earth' ? 5 : 3),
    max: (c) => (c.level >= 5 && genasiKind(c) !== 'earth' ? 2 : 1),
    note: (c) => {
      const spells = { air: ['Feather Fall', 'Levitate'], earth: ['Pass without Trace', ''], fire: ['Burning Hands', 'Flame Blade'], water: ['Create or Destroy Water', 'Water Walk'] }[genasiKind(c)];
      if (!spells) return 'Your kind\'s spells (Air, Earth, Fire or Water: type it in the race), each once per long rest without a slot.';
      return `${[spells[0], c.level >= 5 ? spells[1] : ''].filter(Boolean).join(' and ')}, each once per long rest without a slot.`;
    },
  },
  {
    id: 'githyanki_psionics', race: 'githyanki', name: 'Githyanki Psionics', from: 3, kind: 'uses', recharge: 'long', page: MPMM(18),
    max: (c) => (c.level >= 5 ? 2 : 1),
    note: (c) => `Jump${c.level >= 5 ? ' and Misty Step' : ''}, each once per long rest without a slot or components. You know Mage Hand (invisible).`,
  },
  {
    id: 'githzerai_psionics', race: 'githzerai', name: 'Githzerai Psionics', from: 3, kind: 'uses', recharge: 'long', page: MPMM(19),
    max: (c) => (c.level >= 5 ? 2 : 1),
    note: (c) => `Shield${c.level >= 5 ? ' and Detect Thoughts' : ''}, each once per long rest without a slot or components. You know Mage Hand (invisible).`,
  },
  {
    id: 'fury_of_the_small', race: 'goblin', name: 'Fury of the Small', from: 1, kind: 'uses', recharge: 'long', page: MPMM(20),
    max: (c) => c.pb,
    note: (c) => `Once a turn, when you damage a larger creature: ${c.pb} damage more. Nimble Escape: Disengage or Hide as a bonus action.`,
  },
  {
    id: 'rabbit_hop', race: 'harengon', name: 'Rabbit Hop', from: 1, kind: 'uses', recharge: 'long', page: MPMM(22),
    max: (c) => c.pb,
    note: (c) => `A bonus action: jump ${5 * c.pb} feet without opportunity attacks.`,
  },
  {
    id: 'fey_gift', race: 'hobgoblin', name: 'Fey Gift', from: 1, kind: 'uses', recharge: 'long', page: MPMM(23),
    max: (c) => c.pb,
    note: (c) => `Help as a bonus action.${c.level >= 3 ? ` Add Hospitality (1d6 + ${c.pb} temporary hit points each), Passage (+10 feet speed each) or Spite (disadvantage on an attack).` : ''}`,
  },
  {
    id: 'fortune_from_the_many', race: 'hobgoblin', name: 'Fortune from the Many', from: 1, kind: 'uses', recharge: 'long', page: MPMM(23),
    max: (c) => c.pb,
    note: () => 'After a miss or a failed check or save: add the number of allies you can see within 30 feet (up to +3).',
  },
  {
    id: 'kenku_recall', race: 'kenku', name: 'Kenku Recall', from: 1, kind: 'uses', recharge: 'long', page: MPMM(24),
    max: (c) => c.pb,
    note: () => 'Advantage on an ability check with a skill you\'re proficient in, before rolling.',
  },
  {
    id: 'hungry_jaws', race: 'lizardfolk', name: 'Hungry Jaws', from: 1, kind: 'uses', recharge: 'long', page: MPMM(26),
    max: (c) => c.pb,
    note: (c) => `A bonus action: a bite attack; on a hit you gain ${c.pb} temporary hit points.`,
  },
  {
    id: 'shifting', race: 'shifter', name: 'Shifting', from: 1, kind: 'uses', recharge: 'long', page: MPMM(32),
    max: (c) => c.pb,
    note: (c) => `A bonus action for 1 minute: gain ${2 * c.pb} temporary hit points and your shifter's benefit (Beasthide, Longtooth, Swiftstride or Wildhunt).`,
  },
  {
    id: 'feline_agility', race: 'tabaxi', name: 'Feline Agility', from: 1, kind: 'uses', max: () => 1, recharge: 'none', page: MPMM(33),
    note: () => 'Double your speed until the end of the turn. Back when you spend a turn without moving (tick it back by hand).',
  },
  {
    id: 'control_air_and_water', race: 'triton', name: 'Control Air and Water', from: 1, kind: 'uses', recharge: 'long', page: MPMM(34),
    max: (c) => step([[1, 1], [3, 2], [5, 3]], c.level),
    note: (c) => `${['Fog Cloud', c.level >= 3 ? 'Gust of Wind' : '', c.level >= 5 ? 'Water Walk' : ''].filter(Boolean).join(', ')}: each once per long rest without a slot.`,
  },
  {
    id: 'serpentine_spellcasting', race: 'yuan_ti', name: 'Serpentine Spellcasting', from: 3, kind: 'uses', max: () => 1, recharge: 'long', page: MPMM(36),
    note: () => 'Suggestion without a slot, once per long rest. Animal Friendship on snakes at will; you know Poison Spray.',
  },
];

/**
 * Xanathar's racial feats: shown when the feat's name is in the sheet's
 * features (Features & traits, or Additional features) and the race fits.
 */
export const RACIAL_FEATS = [
  {
    id: 'feat_bountiful_luck', feat: 'Bountiful Luck', races: ['halfling'], name: 'Bountiful Luck', from: 1, kind: 'info', page: XGE(73),
    note: () => 'A reaction when an ally within 30 feet rolls a 1 on an attack, check or save: they reroll it (you can\'t use Luck until your next turn).',
  },
  {
    id: 'feat_dragon_fear', feat: 'Dragon Fear', races: ['dragonborn', 'chromatic_dragonborn', 'metallic_dragonborn', 'gem_dragonborn'], name: 'Dragon Fear', from: 1, kind: 'info', page: XGE(74),
    note: (c) => `Spend a Breath Weapon use to roar: creatures you choose within 30 feet make a Wisdom save (DC ${dc(c, 'cha')}) or are frightened for 1 minute.`,
  },
  {
    id: 'feat_dragon_hide', feat: 'Dragon Hide', races: ['dragonborn', 'chromatic_dragonborn', 'metallic_dragonborn', 'gem_dragonborn'], name: 'Dragon Hide', from: 1, kind: 'info', page: XGE(74),
    note: (c) => `Without armour: AC ${13 + c.mod('dex')}. Claws: 1d4 + ${c.mod('str')} slashing unarmed strikes.`,
  },
  {
    id: 'feat_drow_high_magic', feat: 'Drow High Magic', races: ['drow'], name: 'Drow High Magic', from: 1, kind: 'uses', max: () => 2, recharge: 'long', page: XGE(74),
    note: () => 'Levitate and Dispel Magic, each once per long rest without a slot. Detect Magic at will.',
  },
  {
    id: 'feat_dwarven_fortitude', feat: 'Dwarven Fortitude', races: ['dwarf', 'duergar'], name: 'Dwarven Fortitude', from: 1, kind: 'info', page: XGE(74),
    note: (c) => `When you take the Dodge action, spend a Hit Die to heal it + ${c.mod('con')}.`,
  },
  {
    id: 'feat_elven_accuracy', feat: 'Elven Accuracy', races: ['elf', 'drow', 'high_elf', 'wood_elf', 'half_elf', 'eladrin', 'shadar_kai'], name: 'Elven Accuracy', from: 1, kind: 'info', page: XGE(74),
    note: () => 'With advantage on a Dexterity, Intelligence, Wisdom or Charisma attack, reroll one of the dice once.',
  },
  {
    id: 'feat_fade_away', feat: 'Fade Away', races: ['gnome', 'forest_gnome', 'deep_gnome'], name: 'Fade Away', from: 1, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(74),
    note: () => 'A reaction when you take damage: invisible until the end of your next turn, or until you attack, deal damage or force a save.',
  },
  {
    id: 'feat_fey_teleportation', feat: 'Fey Teleportation', races: ['high_elf'], name: 'Fey Teleportation', from: 1, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(74),
    note: () => 'Cast Misty Step without a slot (Intelligence). You also speak Sylvan.',
  },
  {
    id: 'feat_flames_of_phlegethos', feat: 'Flames of Phlegethos', races: ['tiefling'], name: 'Flames of Phlegethos', from: 1, kind: 'info', page: XGE(74),
    note: () => 'Reroll 1s on fire spell damage; after casting one, flames wreathe you until your next turn (1d4 fire to melee attackers, light 30 feet).',
  },
  {
    id: 'feat_infernal_constitution', feat: 'Infernal Constitution', races: ['tiefling'], name: 'Infernal Constitution', from: 1, kind: 'info', page: XGE(75),
    note: () => 'Resist cold and poison; advantage on saves against being poisoned.',
  },
  {
    id: 'feat_orcish_fury', feat: 'Orcish Fury', races: ['half_orc', 'orc'], name: 'Orcish Fury', from: 1, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(75),
    note: () => 'On a simple or martial weapon hit: roll one of its damage dice again and add it. When you use Relentless Endurance, a weapon attack as a reaction.',
  },
  {
    id: 'feat_prodigy', feat: 'Prodigy', races: ['half_elf', 'half_orc', 'human'], name: 'Prodigy', from: 1, kind: 'info', page: XGE(75),
    note: () => 'One more skill, tool and language, and expertise in one skill.',
  },
  {
    id: 'feat_second_chance', feat: 'Second Chance', races: ['halfling'], name: 'Second Chance', from: 1, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(75),
    note: () => 'A reaction when a creature hits you: it rerolls the attack and uses the new roll. Back when you roll initiative too.',
  },
  {
    id: 'feat_squat_nimbleness', feat: 'Squat Nimbleness', races: ['dwarf', 'duergar', 'small'], name: 'Squat Nimbleness', from: 1, kind: 'info', page: XGE(75),
    note: () => '+5 feet speed, Acrobatics or Athletics, and advantage on checks to escape a grapple.',
  },
  {
    id: 'feat_wood_elf_magic', feat: 'Wood Elf Magic', races: ['wood_elf'], name: 'Wood Elf Magic', from: 1, kind: 'uses', max: () => 2, recharge: 'long', page: XGE(75),
    note: () => 'Longstrider and Pass without Trace, each once per long rest without a slot (Wisdom). You know a druid cantrip.',
  },
].map((f) => ({ ...f, match: new RegExp(`\\b${f.feat.replace(/ /g, '\\s+')}\\b`, 'i') }));

/** The racial feats the sheet's features text names (whatever the race): ['Elven Accuracy']. */
export function featsNamed(sheet) {
  const text = `${sheet?.features ?? ''}\n${sheet?.additional_features ?? ''}`;
  return RACIAL_FEATS.filter((f) => f.match.test(text));
}

/** More names for the sheet's race suggestions (the Player's Handbook's are in sheet.js). */
export const MORE_RACES = [
  'Aasimar', 'Chromatic Dragonborn', 'Metallic Dragonborn', 'Gem Dragonborn', 'Duergar', 'Eladrin', 'Shadar-kai', 'Deep Gnome',
  'Goliath', 'Orc', 'Fairy', 'Firbolg', 'Air Genasi', 'Earth Genasi', 'Fire Genasi', 'Water Genasi', 'Githyanki', 'Githzerai',
  'Goblin', 'Harengon', 'Hobgoblin', 'Kenku', 'Lizardfolk', 'Shifter', 'Tabaxi', 'Triton', 'Yuan-ti',
];
