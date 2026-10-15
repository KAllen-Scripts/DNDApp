/**
 * Subclasses from books other than the Player's Handbook, in the same shape
 * as subclass-features.js (which adds them to its lists): Xanathar's Guide to
 * Everything, Tasha's Cauldron of Everything, Fizban's Treasury of Dragons,
 * the 2014 Dungeon Master's Guide and Bigby Presents: Glory of the Giants. Checked against the group's PDFs
 * (pages below; Glory of the Giants is a picture-only scan, so its subclass
 * is from Claude's knowledge of the book). docs/notes/books-worked-through.md
 * lists which books are done.
 *
 * These books are 2014-rules books, but their subclasses can be used in a
 * 2024 game too, so most rows have no edition. Where the 2024 Player's
 * Handbook reprinted a subclass (Zealot, Glamour, Psi Warrior, Soulknife...),
 * the rows here are the 2014 versions (edition '2014') and the PHB's are in
 * subclass-features.js.
 */

const step = (table, level) => table.reduce((v, [from, n]) => (level >= from ? n : v), table[0][1]);
const atLeast1 = (n) => Math.max(1, n);
const dc = (c, a) => 8 + c.pb + c.mod(a);
const martialArts = (c) => step([[1, 4], [5, 6], [11, 8], [17, 10]], c.level);
const halfUp = (n) => Math.ceil(n / 2);

const XGE = (n) => `Xanathar's p. ${n}`;
const TCE = (n) => `Tasha's p. ${n}`;
const DMG = (n) => `DMG 2014 p. ${n}`;
const GOTG = (n) => `Glory of the Giants p. ${n}`;
const FTD = (n) => `Fizban's p. ${n}`;

/**
 * More subclasses: as SUBCLASSES in subclass-features.js, plus the book. The
 * ones the 2024 Player's Handbook reprinted aren't here: their 2014 rows use
 * the PHB entry's key, and subclass-features.js marks those as both editions.
 */
export const BOOK_SUBCLASSES = [
  // Artificer (Tasha's)
  { key: 'alchemist', class: 'artificer', name: 'Alchemist', match: /alchemist/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'armorer', class: 'artificer', name: 'Armorer', match: /armou?rer/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'artillerist', class: 'artificer', name: 'Artillerist', match: /artillerist/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'battle_smith', class: 'artificer', name: 'Battle Smith', match: /battle\s*smith/i, editions: ['2014', '2024'], book: "Tasha's" },
  // Barbarian
  { key: 'ancestral_guardian', class: 'barbarian', name: 'Path of the Ancestral Guardian', match: /ancestral/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'storm_herald', class: 'barbarian', name: 'Path of the Storm Herald', match: /storm\s*herald/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'beast', class: 'barbarian', name: 'Path of the Beast', match: /\bbeast\b/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'wild_magic_barbarian', class: 'barbarian', name: 'Path of Wild Magic', match: /wild\s*magic/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'giant', class: 'barbarian', name: 'Path of the Giant', match: /\bgiant\b/i, editions: ['2014', '2024'], book: 'Glory of the Giants' },
  // Bard
  { key: 'swords', class: 'bard', name: 'College of Swords', match: /swords?\b/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'whispers', class: 'bard', name: 'College of Whispers', match: /whisper/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'creation', class: 'bard', name: 'College of Creation', match: /creation/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'eloquence', class: 'bard', name: 'College of Eloquence', match: /eloquen/i, editions: ['2014', '2024'], book: "Tasha's" },
  // Cleric
  { key: 'forge', class: 'cleric', name: 'Forge Domain', match: /forge/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'grave', class: 'cleric', name: 'Grave Domain', match: /grave/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'order', class: 'cleric', name: 'Order Domain', match: /\border\b/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'peace', class: 'cleric', name: 'Peace Domain', match: /peace/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'twilight', class: 'cleric', name: 'Twilight Domain', match: /twilight/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'death', class: 'cleric', name: 'Death Domain', match: /death/i, editions: ['2014', '2024'], book: 'DMG 2014' },
  // Druid
  { key: 'dreams', class: 'druid', name: 'Circle of Dreams', match: /dream/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'shepherd', class: 'druid', name: 'Circle of the Shepherd', match: /shepherd/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'spores', class: 'druid', name: 'Circle of Spores', match: /spore/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'wildfire', class: 'druid', name: 'Circle of Wildfire', match: /wildfire/i, editions: ['2014', '2024'], book: "Tasha's" },
  // Fighter
  { key: 'arcane_archer', class: 'fighter', name: 'Arcane Archer', match: /arcane\s*archer/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'cavalier', class: 'fighter', name: 'Cavalier', match: /cavalier/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'samurai', class: 'fighter', name: 'Samurai', match: /samurai/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'rune_knight', class: 'fighter', name: 'Rune Knight', match: /rune\s*knight/i, editions: ['2014', '2024'], book: "Tasha's" },
  // Monk
  { key: 'drunken_master', class: 'monk', name: 'Way of the Drunken Master', match: /drunk/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'kensei', class: 'monk', name: 'Way of the Kensei', match: /kensei/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'sun_soul', class: 'monk', name: 'Way of the Sun Soul', match: /sun\s*soul/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'ascendant_dragon', class: 'monk', name: 'Way of the Ascendant Dragon', match: /ascendant|dragon/i, editions: ['2014', '2024'], book: "Fizban's" },
  { key: 'astral_self', class: 'monk', name: 'Way of the Astral Self', match: /astral/i, editions: ['2014', '2024'], book: "Tasha's" },
  // Paladin
  { key: 'conquest', class: 'paladin', name: 'Oath of Conquest', match: /conquest/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'redemption', class: 'paladin', name: 'Oath of Redemption', match: /redemption/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'watchers', class: 'paladin', name: 'Oath of the Watchers', match: /watcher/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'oathbreaker', class: 'paladin', name: 'Oathbreaker', match: /oath\s*breaker/i, editions: ['2014', '2024'], book: 'DMG 2014' },
  // Ranger
  { key: 'horizon_walker', class: 'ranger', name: 'Horizon Walker', match: /horizon/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'monster_slayer', class: 'ranger', name: 'Monster Slayer', match: /monster\s*slayer/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'drakewarden', class: 'ranger', name: 'Drakewarden', match: /drake/i, editions: ['2014', '2024'], book: "Fizban's" },
  { key: 'swarmkeeper', class: 'ranger', name: 'Swarmkeeper', match: /swarm/i, editions: ['2014', '2024'], book: "Tasha's" },
  // Rogue
  { key: 'inquisitive', class: 'rogue', name: 'Inquisitive', match: /inquisitive/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'mastermind', class: 'rogue', name: 'Mastermind', match: /mastermind/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'scout', class: 'rogue', name: 'Scout', match: /scout/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'swashbuckler', class: 'rogue', name: 'Swashbuckler', match: /swashbuckl/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'phantom', class: 'rogue', name: 'Phantom', match: /phantom/i, editions: ['2014', '2024'], book: "Tasha's" },
  // Sorcerer
  { key: 'divine_soul', class: 'sorcerer', name: 'Divine Soul', match: /divine\s*soul/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'shadow_magic', class: 'sorcerer', name: 'Shadow Magic', match: /shadow/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'storm_sorcery', class: 'sorcerer', name: 'Storm Sorcery', match: /storm/i, editions: ['2014', '2024'], book: "Xanathar's" },
  // Warlock
  { key: 'hexblade', class: 'warlock', name: 'The Hexblade', match: /hexblade/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'fathomless', class: 'warlock', name: 'The Fathomless', match: /fathomless/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'genie', class: 'warlock', name: 'The Genie', match: /genie/i, editions: ['2014', '2024'], book: "Tasha's" },
  // Wizard
  { key: 'war_magic_school', class: 'wizard', name: 'War Magic', match: /war\s*magic/i, editions: ['2014', '2024'], book: "Xanathar's" },
  { key: 'bladesinging', class: 'wizard', name: 'Bladesinging', match: /blade\s*sing/i, editions: ['2014', '2024'], book: "Tasha's" },
  { key: 'scribes', class: 'wizard', name: 'Order of Scribes', match: /scribe/i, editions: ['2014', '2024'], book: "Tasha's" },
];

/** The 2024 Player's Handbook subclasses that first came out in these books (their 2014 rows are below). */
export const REPRINTED_IN_PHB_2024 = {
  zealot: "Xanathar's", glamour: "Xanathar's", gloom_stalker: "Xanathar's", celestial: "Xanathar's",
  psi_warrior: "Tasha's", stars: "Tasha's", mercy: "Tasha's", glory: "Tasha's", fey_wanderer: "Tasha's",
  soulknife: "Tasha's", aberrant: "Tasha's", clockwork: "Tasha's",
};

const E14 = '2014';

export const BOOK_SUBCLASS_FEATURES = [
  // ---------- Artificer ----------
  {
    id: 'experimental_elixir', sc: 'alchemist', class: 'artificer', name: 'Experimental Elixir', from: 3, kind: 'uses', recharge: 'long', page: TCE(14),
    max: (c) => step([[3, 1], [6, 2], [15, 3]], c.level),
    note: (c) => `After a long rest, make free elixirs (roll a d6 for each: healing 2d4 + ${c.mod('int')}, swiftness, resilience, boldness, flight or transformation); more by spending a spell slot.${c.level >= 5 ? ` Alchemical Savant: +${atLeast1(c.mod('int'))} to a healing, acid, fire, necrotic or poison roll of your spells.` : ''}`,
  },
  {
    id: 'restorative_reagents', sc: 'alchemist', class: 'artificer', name: 'Restorative Reagents', from: 9, kind: 'uses', recharge: 'long', page: TCE(15),
    max: (c) => atLeast1(c.mod('int')),
    note: (c) => `Cast Lesser Restoration without a slot. Your elixirs also give 2d6 + ${c.mod('int')} temporary hit points.${c.level >= 15 ? ' Chemical Mastery: resist acid and poison, and cast Greater Restoration and Heal once each per long rest.' : ''}`,
  },
  {
    id: 'arcane_armor', sc: 'armorer', class: 'artificer', name: 'Armor Model', from: 3, kind: 'info', page: TCE(15),
    note: (c) => `Guardian: thunder gauntlets (1d8 thunder; a creature hit has disadvantage on attacks against others) and Defensive Field (a bonus action: ${c.level} temporary hit points, ${c.pb} times per long rest). Infiltrator: lightning launcher (1d6, once a turn 1d6 more), +5 speed, advantage on Stealth.${c.level >= 5 ? ' Extra Attack.' : ''}${c.level >= 15 ? ' Perfected Armor.' : ''}`,
  },
  {
    id: 'defensive_field', sc: 'armorer', class: 'artificer', name: 'Defensive Field (Guardian)', from: 3, kind: 'uses', recharge: 'long', page: TCE(16),
    max: (c) => c.pb,
    note: (c) => `A bonus action in the Guardian model while bloodied: gain ${c.level} temporary hit points.`,
  },
  {
    id: 'eldritch_cannon', sc: 'artillerist', class: 'artificer', name: 'Eldritch Cannon', from: 3, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(17),
    note: (c) => `An action: make a cannon (flamethrower, force ballista or protector, ${c.level >= 9 ? '3d8' : '2d8'}; save DC ${dc(c, 'int')}) for 1 hour; or spend a spell slot to make one.${c.level >= 5 ? ` Arcane Firearm: +1d8 to one spell's damage roll.` : ''}${c.level >= 15 ? ' Fortified Position: two cannons at once, and half cover near them.' : c.level >= 9 ? ' Explosive Cannon: detonate it (3d8 force).' : ''}`,
  },
  {
    id: 'steel_defender', sc: 'battle_smith', class: 'artificer', name: 'Steel Defender', from: 3, kind: 'info', page: TCE(18),
    note: (c) => `Your steel defender: AC 15, ${2 + c.mod('int') + 5 * c.level} hit points, acts after you; force-empowered rend 1d8 + ${c.pb}. Battle Ready: magic weapons can use Intelligence.${c.level >= 5 ? ' Extra Attack.' : ''}${c.level >= 15 ? ' Improved Defender: Arcane Jolt 4d6, +2 AC, Deflect Attack hurts.' : ''}`,
  },
  {
    id: 'arcane_jolt', sc: 'battle_smith', class: 'artificer', name: 'Arcane Jolt', from: 9, kind: 'uses', recharge: 'long', page: TCE(19),
    max: (c) => atLeast1(c.mod('int')),
    note: (c) => `When you or your defender hit with a magic weapon attack: ${c.level >= 15 ? '4d6' : '2d6'} force damage more, or heal a creature within 30 feet that much.`,
  },

  // ---------- Barbarian ----------
  {
    id: 'ancestral_protectors', sc: 'ancestral_guardian', class: 'barbarian', name: 'Ancestral Protectors', from: 3, kind: 'info', page: XGE(9),
    note: (c) => `While raging, the first creature you hit on your turn has disadvantage on attacks against anyone else, who resists its damage.${c.level >= 6 ? ` Spirit Shield: a reaction while raging, take ${step([[6, 2], [10, 3], [14, 4]], c.level)}d6 off damage to a creature within 30 feet${c.level >= 14 ? ' (Vengeful Ancestors: the attacker takes that much force damage)' : ''}.` : ''}`,
  },
  {
    id: 'consult_the_spirits', sc: 'ancestral_guardian', class: 'barbarian', name: 'Consult the Spirits', from: 10, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(10),
    note: () => 'Cast Augury or Clairvoyance without a slot (Wisdom).',
  },
  {
    id: 'storm_aura', sc: 'storm_herald', class: 'barbarian', name: 'Storm Aura', from: 3, kind: 'info', page: XGE(10),
    note: (c) => `While raging, a 10-foot aura (again each turn as a bonus action). Desert: ${step([[3, 2], [5, 3], [10, 4], [15, 5], [20, 6]], c.level)} fire damage to others in it. Sea: a creature takes ${step([[3, 1], [10, 2], [15, 3], [20, 4]], c.level)}d6 lightning (Dexterity save, DC ${dc(c, 'con')}, for half). Tundra: you and others choose gain ${step([[3, 2], [5, 3], [10, 4], [15, 5], [20, 6]], c.level)} temporary hit points.${c.level >= 6 ? ' Storm Soul and' : ''}${c.level >= 10 ? ' Shielding Storm (resistance for those in the aura)' : c.level >= 6 ? ' more as you go.' : ''}${c.level >= 14 ? ', Raging Storm.' : ''}`,
  },
  {
    id: 'divine_fury_2014', sc: 'zealot', edition: E14, class: 'barbarian', name: 'Divine Fury', from: 3, kind: 'info', page: XGE(11),
    note: (c) => `While raging, the first creature you hit with a weapon on each of your turns takes 1d6 + ${Math.floor(c.level / 2)} necrotic or radiant damage more. Warrior of the Gods: no material components to raise you.${c.level >= 6 ? ' Fanatical Focus: reroll a failed save once per rage.' : ''}${c.level >= 14 ? ' Rage beyond Death: at 0 hit points you keep fighting until the rage ends.' : ''}`,
  },
  {
    id: 'zealous_presence_2014', sc: 'zealot', edition: E14, class: 'barbarian', name: 'Zealous Presence', from: 10, kind: 'uses', max: () => 1, recharge: 'long', page: XGE(11),
    note: () => 'A bonus action: up to ten creatures within 60 feet have advantage on attacks and saves until your next turn.',
  },
  {
    id: 'form_of_the_beast', sc: 'beast', class: 'barbarian', name: 'Form of the Beast', from: 3, kind: 'info', page: TCE(24),
    note: (c) => `When you rage, grow a bite (1d8; heal ${c.pb} once a turn when bloodied), claws (1d6, an extra claw attack) or a tail (1d8, reach; a reaction for +1d8 AC).${c.level >= 6 ? ' Bestial Soul: magic natural weapons; swim, climb or jump each rest.' : ''}${c.level >= 14 ? ` Call the Hunt: when you rage, up to ${atLeast1(c.mod('con'))} willing creatures gain 1d6 damage once a turn, and you gain 5 temporary hit points each.` : ''}`,
  },
  {
    id: 'infectious_fury', sc: 'beast', class: 'barbarian', name: 'Infectious Fury', from: 10, kind: 'uses', recharge: 'long', page: TCE(25),
    max: (c) => c.pb,
    note: (c) => `When your natural weapons hit: Wisdom save (DC ${dc(c, 'con')}) or it attacks another creature, or takes 2d12 psychic damage.`,
  },
  {
    id: 'call_the_hunt', sc: 'beast', class: 'barbarian', name: 'Call the Hunt', from: 14, kind: 'uses', recharge: 'long', page: TCE(25),
    max: (c) => c.pb,
    note: () => 'Used when you rage (see Form of the Beast).',
  },
  {
    id: 'magic_awareness', sc: 'wild_magic_barbarian', class: 'barbarian', name: 'Magic Awareness', from: 3, kind: 'uses', recharge: 'long', page: TCE(25),
    max: (c) => c.pb,
    note: (c) => `An action: sense spells and magic items within 60 feet. Wild Surge: when you rage, roll on the Wild Magic table (save DC ${dc(c, 'con')}).${c.level >= 14 ? ' Controlled Surge: roll twice and choose.' : c.level >= 10 ? ' Unstable Backlash: a reaction to surge again when hurt or failing a save.' : ''}`,
  },
  {
    id: 'bolstering_magic', sc: 'wild_magic_barbarian', class: 'barbarian', name: 'Bolstering Magic', from: 6, kind: 'uses', recharge: 'long', page: TCE(26),
    max: (c) => c.pb,
    note: () => 'An action: a creature adds 1d3 to attacks and checks for 10 minutes, or regains a spell slot of level 1d3.',
  },
  {
    id: 'giants_havoc', sc: 'giant', class: 'barbarian', name: "Giant's Havoc", from: 3, kind: 'info', page: GOTG(12),
    note: (c) => `Giant's Power: Druidcraft or Thaumaturgy, and Giant language. While raging: Large size if there's room, reach +5 feet, and Crushing Throw (thrown weapons deal your Rage damage again).${c.level >= 6 ? ' Elemental Cleaver: infuse a weapon with acid, cold, fire, thunder or lightning (1d6 more, 2d6 from 14th), it returns when thrown.' : ''}${c.level >= 10 ? ' Mighty Impel: a bonus action while raging, throw a Medium or smaller creature 30 feet.' : ''}${c.level >= 14 ? ' Demiurgic Colossus: Large or Huge, reach +10, Mighty Impel throws Large creatures.' : ''}`,
  },

  // ---------- Bard ----------
  {
    id: 'mantle_of_inspiration_2014', sc: 'glamour', edition: E14, class: 'bard', name: 'Mantle of Inspiration', from: 3, kind: 'info', page: XGE(14),
    note: (c) => `A bonus action: spend a Bardic Inspiration; up to ${atLeast1(c.mod('cha'))} creatures within 60 feet gain ${step([[3, 5], [5, 8], [10, 11], [15, 14]], c.level)} temporary hit points and can move without opportunity attacks.`,
  },
  {
    id: 'enthralling_performance', sc: 'glamour', edition: E14, class: 'bard', name: 'Enthralling Performance', from: 3, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(14),
    note: (c) => `After performing for at least 1 minute: up to ${atLeast1(c.mod('cha'))} listeners make a Wisdom save (DC ${dc(c, 'cha')}) or are charmed for 1 hour.`,
  },
  {
    id: 'mantle_of_majesty_2014', sc: 'glamour', edition: E14, class: 'bard', name: 'Mantle of Majesty', from: 6, kind: 'uses', max: () => 1, recharge: 'long', page: XGE(14),
    note: () => 'A bonus action: cast Command without a slot, and again as a bonus action each turn for 1 minute (concentration).',
  },
  {
    id: 'unbreakable_majesty_2014', sc: 'glamour', edition: E14, class: 'bard', name: 'Unbreakable Majesty', from: 14, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(14),
    note: (c) => `A bonus action for 1 minute: a creature attacking you for the first time on a turn makes a Charisma save (DC ${dc(c, 'cha')}) or picks another target.`,
  },
  {
    id: 'blade_flourish', sc: 'swords', class: 'bard', name: 'Blade Flourish', from: 3, kind: 'info', page: XGE(15),
    note: (c) => `Attack action: +10 feet speed; on a hit, spend a Bardic Inspiration for Defensive (die to AC), Slashing (die to a nearby creature) or Mobile (die damage and push) Flourish.${c.level >= 6 ? ' Extra Attack.' : ''}${c.level >= 14 ? ' Master\'s Flourish: use a d6 instead of spending an Inspiration.' : ''}`,
  },
  {
    id: 'psychic_blades', sc: 'whispers', class: 'bard', name: 'Psychic Blades', from: 3, kind: 'info', page: XGE(16),
    note: (c) => `On a weapon hit, once a turn: spend a Bardic Inspiration for ${step([[3, 2], [5, 3], [10, 5], [15, 8]], c.level)}d6 psychic damage more.`,
  },
  {
    id: 'words_of_terror', sc: 'whispers', class: 'bard', name: 'Words of Terror', from: 3, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(16),
    note: (c) => `After talking alone with a creature for 1 minute: Wisdom save (DC ${dc(c, 'cha')}) or frightened of you or someone you choose for 1 hour.`,
  },
  {
    id: 'mantle_of_whispers', sc: 'whispers', class: 'bard', name: 'Mantle of Whispers', from: 6, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(16),
    note: () => "A reaction when a humanoid dies within 30 feet: take its shadow, and take on its appearance and surface memories for 1 hour.",
  },
  {
    id: 'shadow_lore', sc: 'whispers', class: 'bard', name: 'Shadow Lore', from: 14, kind: 'uses', max: () => 1, recharge: 'long', page: XGE(16),
    note: (c) => `An action: a creature within 30 feet makes a Wisdom save (DC ${dc(c, 'cha')}) or is charmed and obeys you for 8 hours, fearing you'll reveal its secret.`,
  },
  {
    id: 'mote_of_potential', sc: 'creation', class: 'bard', name: 'Mote of Potential', from: 3, kind: 'info', page: TCE(27),
    note: (c) => `Your Bardic Inspiration comes with a mote: on an ability check roll the die twice; on an attack the target and those within 5 feet take the die's roll in thunder damage (Constitution save, DC ${dc(c, 'cha')}); on a save gain the die's roll + ${c.mod('cha')} temporary hit points.`,
  },
  {
    id: 'performance_of_creation', sc: 'creation', class: 'bard', name: 'Performance of Creation', from: 3, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(28),
    note: (c) => `An action: make a nonmagical item worth up to ${20 * c.level} gp, ${c.level >= 14 ? 'Gargantuan' : c.level >= 6 ? 'Large' : 'Medium'} or smaller. Spend a 2nd-level or higher slot to use it again.`,
  },
  {
    id: 'animating_performance', sc: 'creation', class: 'bard', name: 'Animating Performance', from: 6, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(28),
    note: (c) => `An action: animate a Large or smaller item for 1 hour (AC 16, ${10 + 5 * c.level} hit points, Irrepressible Dance). Spend a 3rd-level or higher slot to use it again.${c.level >= 14 ? ' Creative Crescendo: make several items at once.' : ''}`,
  },
  {
    id: 'silver_tongue', sc: 'eloquence', class: 'bard', name: 'Silver Tongue', from: 3, kind: 'info', page: TCE(29),
    note: (c) => `Persuasion and Deception checks roll at least 10. Unsettling Words: a bonus action, spend a Bardic Inspiration to take the roll off a creature's next save.${c.level >= 6 ? ' Unfailing Inspiration: a die that doesn\'t help is kept. Universal Speech.' : ''}`,
  },
  {
    id: 'universal_speech', sc: 'eloquence', class: 'bard', name: 'Universal Speech', from: 6, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(29),
    note: (c) => `An action: up to ${atLeast1(c.mod('cha'))} creatures understand you for 1 hour. Spend a spell slot to use it again.`,
  },
  {
    id: 'infectious_inspiration', sc: 'eloquence', class: 'bard', name: 'Infectious Inspiration', from: 14, kind: 'uses', recharge: 'long', page: TCE(29),
    max: (c) => atLeast1(c.mod('cha')),
    note: () => 'A reaction when a creature uses your Bardic Inspiration and succeeds: give one to another creature, without spending one.',
  },

  // ---------- Cleric ----------
  {
    id: 'blessing_of_the_forge', sc: 'forge', class: 'cleric', name: 'Blessing of the Forge', from: 1, kind: 'uses', max: () => 1, recharge: 'long', page: XGE(19),
    note: (c) => `At the end of a long rest, make a weapon or armour +1.${c.level >= 2 ? ' Artisan\'s Blessing (Channel Divinity): an hour to make a metal item worth up to 100 gp.' : ''}${c.level >= 6 ? ' Soul of the Forge: resist fire, +1 AC in heavy armour.' : ''}${c.level >= 17 ? ' Saint of Forge and Fire: immune to fire, resist nonmagical weapons in heavy armour.' : ''}`,
  },
  {
    id: 'circle_of_mortality', sc: 'grave', class: 'cleric', name: 'Circle of Mortality', from: 1, kind: 'info', page: XGE(20),
    note: (c) => `Healing a creature at 0 hit points uses the highest number on each die. Spare the Dying as a bonus action at 30 feet.${c.level >= 2 ? ' Path to the Grave (Channel Divinity): a creature is vulnerable to all damage from the next hit.' : ''}${c.level >= 17 ? ' Keeper of Souls: heal when an enemy dies near you.' : ''}`,
  },
  {
    id: 'eyes_of_the_grave', sc: 'grave', class: 'cleric', name: 'Eyes of the Grave', from: 1, kind: 'uses', recharge: 'long', page: XGE(20),
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'An action: sense undead within 60 feet until the end of your next turn.',
  },
  {
    id: 'sentinel_at_deaths_door', sc: 'grave', class: 'cleric', name: "Sentinel at Death's Door", from: 6, kind: 'uses', recharge: 'long', page: XGE(20),
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'A reaction: a critical hit on a creature within 30 feet becomes a normal hit.',
  },
  {
    id: 'voice_of_authority', sc: 'order', class: 'cleric', name: 'Voice of Authority', from: 1, kind: 'info', page: TCE(31),
    note: (c) => `When your spell of 1st level or higher targets an ally, they can make a weapon attack as a reaction.${c.level >= 2 ? ` Order's Demand (Channel Divinity): creatures you choose within 30 feet make a Wisdom save (DC ${dc(c, 'wis')}) or are charmed and drop what they hold.` : ''}${c.level >= 8 ? ' Divine Strike: 1d8 psychic damage once a turn (2d8 at 14th).' : ''}${c.level >= 17 ? ' Order\'s Wrath: a creature hit by Divine Strike takes 2d8 psychic more from the next ally hit.' : ''}`,
  },
  {
    id: 'embodiment_of_the_law', sc: 'order', class: 'cleric', name: 'Embodiment of the Law', from: 6, kind: 'uses', recharge: 'long', page: TCE(32),
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'Cast an enchantment spell of 1st level or higher as a bonus action instead of an action.',
  },
  {
    id: 'emboldening_bond', sc: 'peace', class: 'cleric', name: 'Emboldening Bond', from: 1, kind: 'uses', recharge: 'long', page: TCE(32),
    max: (c) => c.pb,
    note: (c) => `An action: bond ${c.pb} creatures within 30 feet for 10 minutes; while within 30 feet of each other, each can add a d4 to one roll a turn.${c.level >= 2 ? ` Balm of Peace (Channel Divinity): move without opportunity attacks and heal each creature you pass 2d6 + ${c.mod('wis')}.` : ''}${c.level >= 6 ? ' Protective Bond: a reaction to teleport and take a bonded creature\'s damage.' : ''}${c.level >= 17 ? ' Expansive Bond: 60 feet, and resistance.' : ''}`,
  },
  {
    id: 'eyes_of_night', sc: 'twilight', class: 'cleric', name: 'Eyes of Night', from: 1, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(34),
    note: (c) => `Darkvision 300 feet. An action: share it with up to ${atLeast1(c.mod('wis'))} creatures for 1 hour; spend a spell slot to share it again. Vigilant Blessing: advantage on one creature's next initiative.${c.level >= 2 ? ` Twilight Sanctuary (Channel Divinity): for 1 minute, creatures in a 30-foot sphere gain 1d6 + ${c.level} temporary hit points or lose charmed or frightened at the end of their turns.` : ''}${c.level >= 17 ? ' Twilight Shroud: half cover in the sanctuary.' : ''}`,
  },
  {
    id: 'steps_of_night', sc: 'twilight', class: 'cleric', name: 'Steps of Night', from: 6, kind: 'uses', recharge: 'long', page: TCE(35),
    max: (c) => c.pb,
    note: () => 'A bonus action in dim light or darkness: a flying speed equal to your walking speed for 1 minute.',
  },
  {
    id: 'reaper', sc: 'death', class: 'cleric', name: 'Reaper', from: 1, kind: 'info', page: DMG(96),
    note: (c) => `Your necromancy cantrips that target one creature can target two within 5 feet of each other.${c.level >= 2 ? ` Touch of Death (Channel Divinity): on a melee hit, ${5 + 2 * c.level} necrotic damage more.` : ''}${c.level >= 6 ? ' Inescapable Destruction: your necrotic damage ignores resistance.' : ''}${c.level >= 8 ? ' Divine Strike: 1d8 necrotic (2d8 at 14th).' : ''}${c.level >= 17 ? ' Improved Reaper: necromancy spells of 1st to 5th level can target two creatures.' : ''}`,
  },

  // ---------- Druid ----------
  {
    id: 'balm_of_the_summer_court', sc: 'dreams', class: 'druid', name: 'Balm of the Summer Court', from: 2, kind: 'pool', recharge: 'long', page: XGE(23),
    max: (c) => c.level,
    note: (c) => `A pool of d6s: a bonus action to spend up to ${Math.floor(c.level / 2)} on a creature within 120 feet; it regains that many and gains 1 temporary hit point per die.${c.level >= 6 ? ' Hearth of Moonlight and Shadow: a warded camp during a rest.' : ''}`,
  },
  {
    id: 'hidden_paths', sc: 'dreams', class: 'druid', name: 'Hidden Paths', from: 10, kind: 'uses', recharge: 'long', page: XGE(23),
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'A bonus action: teleport 60 feet, or an action to teleport a willing creature you touch 30 feet.',
  },
  {
    id: 'walker_in_dreams', sc: 'dreams', class: 'druid', name: 'Walker in Dreams', from: 14, kind: 'uses', max: () => 1, recharge: 'long', page: XGE(23),
    note: () => 'After a short rest: cast Dream, Scrying or Teleportation Circle (to where you last slept) without a slot.',
  },
  {
    id: 'spirit_totem', sc: 'shepherd', class: 'druid', name: 'Spirit Totem', from: 2, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(24),
    note: (c) => `A bonus action for 1 minute: Bear (${5 + c.level} temporary hit points to creatures in a 30-foot aura; advantage on Strength), Hawk (a reaction to give advantage on an attack) or Unicorn (healing spells heal everyone in the aura ${c.level} more).${c.level >= 6 ? ' Mighty Summoner: summoned beasts and fey get 2 more hit points per Hit Die and magic attacks.' : ''}${c.level >= 10 ? ' Guardian Spirit: they heal half your level in the aura.' : ''}`,
  },
  {
    id: 'faithful_summons', sc: 'shepherd', class: 'druid', name: 'Faithful Summons', from: 14, kind: 'uses', max: () => 1, recharge: 'long', page: XGE(24),
    note: () => 'When you drop to 0 hit points or are incapacitated: four beasts of CR 2 or lower appear to protect you for 1 hour (Conjure Animals).',
  },
  {
    id: 'halo_of_spores', sc: 'spores', class: 'druid', name: 'Halo of Spores', from: 2, kind: 'info', page: TCE(36),
    note: (c) => `A reaction: a creature within 10 feet takes ${step([[2, 4], [6, 6], [10, 8], [14, 10]], c.level)} necrotic damage (1d${step([[2, 4], [6, 6], [10, 8], [14, 10]], c.level)}; Constitution save, DC ${dc(c, 'wis')}). Symbiotic Entity: spend a Wild Shape use for ${4 * c.level} temporary hit points; while they last the halo rolls twice and your melee hits deal 1d6 necrotic more.${c.level >= 10 ? ' Spreading Spores.' : ''}${c.level >= 14 ? ' Fungal Body: immune to blinded, deafened, frightened, poisoned and critical hits.' : ''}`,
  },
  {
    id: 'fungal_infestation', sc: 'spores', class: 'druid', name: 'Fungal Infestation', from: 6, kind: 'uses', recharge: 'long', page: TCE(37),
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'A reaction when a beast or humanoid dies within 10 feet: it rises as a zombie with 1 hit point for 1 hour.',
  },
  {
    id: 'star_map_2014', sc: 'stars', edition: E14, class: 'druid', name: 'Star Map', from: 2, kind: 'uses', recharge: 'long', page: TCE(38),
    max: (c) => c.pb,
    note: () => 'Cast Guiding Bolt without a slot. You also know Guidance.',
  },
  {
    id: 'starry_form_2014', sc: 'stars', edition: E14, class: 'druid', name: 'Starry Form', from: 2, kind: 'info', page: TCE(38),
    note: (c) => `Spend a Wild Shape use for 10 minutes: Archer (a bonus action, a ranged spell attack for 1d8 + ${c.mod('wis')} radiant), Chalice (healing spells heal someone 1d8 + ${c.mod('wis')} more) or Dragon (Intelligence and Wisdom checks and concentration saves roll at least 10).${c.level >= 10 ? ' Twinkling Constellations: 2d8, and change the form each turn.' : ''}${c.level >= 14 ? ' Full of Stars: resist bludgeoning, piercing and slashing in the form.' : ''}`,
  },
  {
    id: 'cosmic_omen_2014', sc: 'stars', edition: E14, class: 'druid', name: 'Cosmic Omen', from: 6, kind: 'uses', recharge: 'long', page: TCE(38),
    max: (c) => c.pb,
    note: () => 'After a long rest roll a die: even (Weal) or odd (Woe). A reaction: add or take away 1d6 from a creature\'s attack, save or check within 30 feet.',
  },
  {
    id: 'wildfire_spirit', sc: 'wildfire', class: 'druid', name: 'Summon Wildfire Spirit', from: 2, kind: 'info', page: TCE(39),
    note: (c) => `Spend a Wild Shape use: a wildfire spirit for 1 hour (AC 13, ${5 + 5 * c.level} hit points; arrival 2d6 fire, Dexterity save DC ${dc(c, 'wis')}; Flame Seed 1d6 + ${c.pb}).${c.level >= 6 ? ' Enhanced Bond: 1d8 more fire or healing on your spells while it\'s out, and cast through it.' : ''}`,
  },
  {
    id: 'cauterizing_flames', sc: 'wildfire', class: 'druid', name: 'Cauterizing Flames', from: 10, kind: 'uses', recharge: 'long', page: TCE(40),
    max: (c) => c.pb,
    note: (c) => `When a creature dies within 30 feet of your spirit: a flame; a reaction when someone enters it to heal or hurt them 2d10 + ${c.mod('wis')}.`,
  },
  {
    id: 'blazing_revival', sc: 'wildfire', class: 'druid', name: 'Blazing Revival', from: 14, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(40),
    note: () => 'When you drop to 0 hit points with your spirit within 120 feet: it drops to 0 and you regain half your hit points and stand up.',
  },

  // ---------- Fighter ----------
  {
    id: 'arcane_shot', sc: 'arcane_archer', class: 'fighter', name: 'Arcane Shot', from: 3, kind: 'uses', max: () => 2, recharge: 'short', page: XGE(28),
    note: (c) => `Once a turn on a hit with a bow: use one of your ${step([[3, 2], [7, 3], [10, 4], [15, 5], [18, 6]], c.level)} Arcane Shot options (save DC ${dc(c, 'int')}).${c.level >= 7 ? ' Curving Shot: a bonus action to redirect a miss. Magic Arrow.' : ''}${c.level >= 15 ? ' Ever-Ready Shot: get one back when you roll initiative with none left.' : ''}`,
  },
  {
    id: 'unwavering_mark', sc: 'cavalier', class: 'fighter', name: 'Unwavering Mark', from: 3, kind: 'uses', recharge: 'long', page: XGE(30),
    max: (c) => atLeast1(c.mod('str')),
    note: (c) => `Mark a creature you hit in melee; if it hurts someone else, a bonus action: a weapon attack with advantage and ${Math.floor(c.level / 2)} damage more.${c.level >= 10 ? ' Hold the Line.' : ''}${c.level >= 15 ? ` Ferocious Charger: knock prone (Strength save, DC ${dc(c, 'str')}).` : ''}${c.level >= 18 ? ' Vigilant Defender.' : ''}`,
  },
  {
    id: 'warding_maneuver', sc: 'cavalier', class: 'fighter', name: 'Warding Maneuver', from: 7, kind: 'uses', recharge: 'long', page: XGE(30),
    max: (c) => atLeast1(c.mod('con')),
    note: () => 'A reaction when a creature within 5 feet is hit: add 1d8 to its AC, and it resists the damage if it still hits.',
  },
  {
    id: 'fighting_spirit', sc: 'samurai', class: 'fighter', name: 'Fighting Spirit', from: 3, kind: 'uses', max: () => 3, recharge: 'long', page: XGE(31),
    note: (c) => `A bonus action: advantage on weapon attacks this turn and ${step([[3, 5], [10, 10], [15, 15]], c.level)} temporary hit points.${c.level >= 10 ? ' Tireless Spirit: get one back when you roll initiative with none left.' : ''}${c.level >= 15 ? ' Rapid Strike.' : ''}${c.level >= 18 ? ' Strength before Death: an extra turn at 0 hit points (once per long rest).' : ''}`,
  },
  {
    id: 'psionic_energy_2014', sc: 'psi_warrior', edition: E14, class: 'fighter', name: 'Psionic Energy', from: 3, kind: 'pool', recharge: 'long', page: TCE(43),
    max: (c) => 2 * c.pb,
    note: (c) => `Psionic Energy dice (d${step([[3, 6], [5, 8], [11, 10], [17, 12]], c.level)}); a bonus action to get one back once per short rest. Protective Field (a reaction, the die + ${c.mod('int')} off damage), Psionic Strike (once a turn, the die + ${c.mod('int')} force), Telekinetic Movement.${c.level >= 7 ? ' Telekinetic Adept: Psi-Powered Leap, Telekinetic Thrust.' : ''}${c.level >= 10 ? ' Guarded Mind.' : ''}`,
  },
  {
    id: 'bulwark_of_force', sc: 'psi_warrior', edition: E14, class: 'fighter', name: 'Bulwark of Force', from: 15, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(43),
    note: (c) => `A bonus action: up to ${atLeast1(c.mod('int'))} creatures within 30 feet have half cover for 1 minute. Spend a Psionic Energy die to use it again.`,
  },
  {
    id: 'telekinetic_master', sc: 'psi_warrior', edition: E14, class: 'fighter', name: 'Telekinetic Master', from: 18, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(43),
    note: () => 'Cast Telekinesis without a slot (Intelligence), with a weapon attack as a bonus action each turn while concentrating. Spend a Psionic Energy die to use it again.',
  },
  {
    id: 'giants_might', sc: 'rune_knight', class: 'fighter', name: "Giant's Might", from: 3, kind: 'uses', recharge: 'long', page: TCE(44),
    max: (c) => c.pb,
    note: (c) => `A bonus action for 1 minute: ${c.level >= 18 ? 'Huge' : 'Large'}, advantage on Strength, and ${step([[3, 6], [10, 8], [18, 10]], c.level)} damage more once a turn (1d${step([[3, 6], [10, 8], [18, 10]], c.level)}). Runes: each ${c.level >= 15 ? 'twice' : 'once'} per short rest (save DC ${dc(c, 'con')}).${c.level >= 10 ? ' Great Stature.' : ''}`,
  },
  {
    id: 'runic_shield', sc: 'rune_knight', class: 'fighter', name: 'Runic Shield', from: 7, kind: 'uses', recharge: 'long', page: TCE(45),
    max: (c) => c.pb,
    note: () => 'A reaction when a creature within 60 feet is hit: the attacker rerolls and uses the new roll.',
  },

  // ---------- Monk ----------
  {
    id: 'drunken_technique', sc: 'drunken_master', class: 'monk', name: 'Drunken Technique', from: 3, kind: 'info', page: XGE(34),
    note: (c) => `Flurry of Blows also gives you Disengage and +10 feet speed.${c.level >= 6 ? ' Tipsy Sway: stand for 5 feet; 1 ki to redirect a missed melee attack.' : ''}${c.level >= 11 ? ' Drunkard\'s Luck: 2 ki to cancel disadvantage.' : ''}${c.level >= 17 ? ' Intoxicated Frenzy: up to five Flurry attacks at different creatures.' : ''}`,
  },
  {
    id: 'path_of_the_kensei', sc: 'kensei', class: 'monk', name: 'Path of the Kensei', from: 3, kind: 'info', page: XGE(34),
    note: (c) => `${step([[3, 2], [6, 3], [11, 4], [17, 5]], c.level)} kensei weapons. Agile Parry: +2 AC after an unarmed strike. Kensei's Shot: a bonus action, ranged kensei weapons deal 1d4 more.${c.level >= 6 ? ` One with the Blade: magic kensei weapons; Deft Strike, 1 ki for 1d${martialArts(c)} more.` : ''}${c.level >= 11 ? ' Sharpen the Blade: up to 3 ki for up to +3 for 1 minute.' : ''}${c.level >= 17 ? ' Unerring Accuracy: reroll a miss once a turn.' : ''}`,
  },
  {
    id: 'radiant_sun_bolt', sc: 'sun_soul', class: 'monk', name: 'Radiant Sun Bolt', from: 3, kind: 'info', page: XGE(35),
    note: (c) => `A ranged spell attack, 30 feet: 1d${martialArts(c)} + ${c.mod('dex')} radiant (1 ki for two as a bonus action).${c.level >= 6 ? ' Searing Arc Strike: 2 ki for Burning Hands after attacking.' : ''}${c.level >= 11 ? ' Searing Sunburst: 2d6 radiant in a 20-foot sphere, +2d6 per ki (up to 3).' : ''}${c.level >= 17 ? ` Sun Shield: light, and ${5 + c.mod('wis')} radiant damage to melee attackers.` : ''}`,
  },
  {
    id: 'breath_of_the_dragon', sc: 'ascendant_dragon', class: 'monk', name: 'Breath of the Dragon', from: 3, kind: 'uses', recharge: 'long', page: FTD(14),
    max: (c) => c.pb,
    note: (c) => `Replace an attack: a 20-foot cone or 30-foot line, ${c.level >= 11 ? 3 : 2}d${martialArts(c)} acid, cold, fire, lightning or poison (Dexterity save, DC ${dc(c, 'wis')}, for half). With none left, 2 ki for another. Draconic Strike: change your unarmed strikes' damage type.${c.level >= 17 ? ' Ascendant Aspect: 1 ki to blind-breathe for more damage, blindsight 10 feet.' : ''}`,
  },
  {
    id: 'draconic_presence', sc: 'ascendant_dragon', class: 'monk', name: 'Draconic Presence', from: 3, kind: 'uses', max: () => 1, recharge: 'long', page: FTD(13),
    note: () => 'A reaction: reroll a failed Intimidation or Persuasion check (used up only when it turns into a success).',
  },
  {
    id: 'wings_unfurled', sc: 'ascendant_dragon', class: 'monk', name: 'Wings Unfurled', from: 6, kind: 'uses', recharge: 'long', page: FTD(14),
    max: (c) => c.pb,
    note: () => 'With Step of the Wind: draconic wings, a flying speed equal to your walking speed until the end of the turn.',
  },
  {
    id: 'aspect_of_the_wyrm', sc: 'ascendant_dragon', class: 'monk', name: 'Aspect of the Wyrm', from: 11, kind: 'uses', max: () => 1, recharge: 'long', page: FTD(14),
    note: () => 'A bonus action for 1 minute: a 10-foot aura of Frightful Presence (Wisdom save) or Resistance (one damage type for you and allies). 3 ki to use it again.',
  },
  {
    id: 'arms_of_the_astral_self', sc: 'astral_self', class: 'monk', name: 'Arms of the Astral Self', from: 3, kind: 'info', page: TCE(50),
    note: (c) => `1 ki, a bonus action, 10 minutes: astral arms (Wisdom for Strength checks and saves, reach +5, 1d${martialArts(c)} force with Wisdom); summoning them deals 2d${martialArts(c)} force to creatures within 10 feet (Dexterity save, DC ${8 + c.pb + c.mod('wis')}).${c.level >= 6 ? ' Visage of the Astral Self.' : ''}${c.level >= 11 ? ' Body of the Astral Self: deflect damage, Empowered Arms.' : ''}${c.level >= 17 ? ' Awakened Astral Self: +2 AC, three attacks.' : ''}`,
  },
  {
    id: 'hand_of_healing_2014', sc: 'mercy', edition: E14, class: 'monk', name: 'Hand of Healing', from: 3, kind: 'info', page: TCE(49),
    note: (c) => `1 ki (or in place of a Flurry strike): heal 1d${martialArts(c)} + ${c.mod('wis')}. Hand of Harm: once a turn, 1 ki for 1d${martialArts(c)} + ${c.mod('wis')} necrotic more.${c.level >= 6 ? ' Physician\'s Touch: also end a disease or condition, or poison.' : ''}${c.level >= 11 ? ' Flurry of Healing and Harm.' : ''}`,
  },
  {
    id: 'hand_of_ultimate_mercy_2014', sc: 'mercy', edition: E14, class: 'monk', name: 'Hand of Ultimate Mercy', from: 17, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(50),
    note: (c) => `5 ki: bring back a creature that died in the last 24 hours with 4d10 + ${c.mod('wis')} hit points.`,
  },

  // ---------- Paladin ----------
  {
    id: 'conquest_channel', sc: 'conquest', class: 'paladin', name: 'Conquest Channel Divinity', from: 3, kind: 'info', page: XGE(38),
    note: (c) => `Conquering Presence: creatures you choose within 30 feet make a Wisdom save (DC ${dc(c, 'cha')}) or are frightened for 1 minute. Guided Strike: +10 to an attack.${c.level >= 7 ? ` Aura of Conquest: frightened enemies within ${c.level >= 18 ? 30 : 10} feet have speed 0 and take ${Math.floor(c.level / 2)} psychic damage.` : ''}${c.level >= 15 ? ' Scornful Rebuke.' : ''}`,
  },
  {
    id: 'invincible_conqueror', sc: 'conquest', class: 'paladin', name: 'Invincible Conqueror', from: 20, kind: 'uses', max: () => 1, recharge: 'long', page: XGE(38),
    note: () => 'An action for 1 minute: resistance to all damage, an extra attack, and critical hits on 19–20.',
  },
  {
    id: 'redemption_channel', sc: 'redemption', class: 'paladin', name: 'Redemption Channel Divinity', from: 3, kind: 'info', page: XGE(39),
    note: (c) => `Emissary of Peace: +5 to Persuasion for 10 minutes. Rebuke the Violent: a reaction, deal an attacker's damage back to it (Wisdom save, DC ${dc(c, 'cha')}, for half).${c.level >= 7 ? ' Aura of the Guardian: a reaction to take a creature\'s damage.' : ''}${c.level >= 15 ? ` Protective Spirit: regain 1d6 + ${Math.floor(c.level / 2)} at the end of your turns when below half.` : ''}`,
  },
  {
    id: 'emissary_of_redemption', sc: 'redemption', class: 'paladin', name: 'Emissary of Redemption', from: 20, kind: 'info', page: XGE(39),
    note: () => 'Resistance to all damage from creatures, and attackers take half the damage back, unless you attack or cast a spell at them.',
  },
  {
    id: 'inspiring_smite_2014', sc: 'glory', edition: E14, class: 'paladin', name: 'Glory Channel Divinity', from: 3, kind: 'info', page: TCE(53),
    note: (c) => `Peerless Athlete: advantage on Athletics and Acrobatics for 10 minutes. Inspiring Smite: after a Divine Smite, share 2d8 + ${c.level} temporary hit points.${c.level >= 7 ? ' Aura of Alacrity: +10 feet speed.' : ''}`,
  },
  {
    id: 'glorious_defense_2014', sc: 'glory', edition: E14, class: 'paladin', name: 'Glorious Defense', from: 15, kind: 'uses', recharge: 'long', page: TCE(54),
    max: (c) => atLeast1(c.mod('cha')),
    note: (c) => `A reaction: +${c.mod('cha')} AC against an attack on a creature within 10 feet; if it misses, you attack the attacker.`,
  },
  {
    id: 'living_legend_2014', sc: 'glory', edition: E14, class: 'paladin', name: 'Living Legend', from: 20, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(54),
    note: () => 'A bonus action for 1 minute: advantage on Charisma checks, turn a miss into a hit once a turn, reroll a failed save.',
  },
  {
    id: 'watchers_channel', sc: 'watchers', class: 'paladin', name: "Watchers' Channel Divinity", from: 3, kind: 'info', page: TCE(54),
    note: (c) => `Watcher's Will: up to ${atLeast1(c.mod('cha'))} creatures have advantage on Intelligence, Wisdom and Charisma saves for 1 minute. Abjure the Extraplanar: aberrations, celestials, elementals, fey and fiends within 30 feet make a Wisdom save (DC ${dc(c, 'cha')}) or are turned.${c.level >= 7 ? ` Aura of the Sentinel: +${c.pb} initiative within ${c.level >= 18 ? 30 : 10} feet.` : ''}${c.level >= 15 ? ` Vigilant Rebuke: 2d8 + ${c.mod('cha')} force when someone saves against a mental effect.` : ''}`,
  },
  {
    id: 'mortal_bulwark', sc: 'watchers', class: 'paladin', name: 'Mortal Bulwark', from: 20, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(55),
    note: () => 'A bonus action for 1 minute: truesight 120 feet, advantage against aberrations, celestials, elementals, fey and fiends, and banish them on a hit. Spend a 5th-level slot to use it again.',
  },
  {
    id: 'oathbreaker_channel', sc: 'oathbreaker', class: 'paladin', name: 'Oathbreaker Channel Divinity', from: 3, kind: 'info', page: DMG(97),
    note: (c) => `Control Undead: an undead within 30 feet obeys you for 24 hours (Wisdom save, DC ${dc(c, 'cha')}). Dreadful Aspect: creatures you choose within 30 feet are frightened for 1 minute.${c.level >= 7 ? ` Aura of Hate: you and fiends and undead within ${c.level >= 18 ? 30 : 10} feet add +${atLeast1(c.mod('cha'))} to melee damage.` : ''}${c.level >= 15 ? ' Supernatural Resistance: resist nonmagical weapons.' : ''}`,
  },
  {
    id: 'dread_lord', sc: 'oathbreaker', class: 'paladin', name: 'Dread Lord', from: 20, kind: 'uses', max: () => 1, recharge: 'long', page: DMG(97),
    note: (c) => `An action for 1 minute: a 30-foot aura of gloom; frightened enemies take 4d10 psychic damage, and a bonus action for a 3d10 + ${c.mod('cha')} necrotic shadow attack.`,
  },

  // ---------- Ranger ----------
  {
    id: 'dread_ambusher_2014', sc: 'gloom_stalker', edition: E14, class: 'ranger', name: 'Dread Ambusher', from: 3, kind: 'info', page: XGE(42),
    note: (c) => `+${c.mod('wis')} to initiative; on your first turn of combat +10 feet speed and one more weapon attack (1d8 damage more). Umbral Sight: darkvision 60 feet, invisible to darkvision.${c.level >= 7 ? ' Iron Mind: Wisdom save proficiency.' : ''}${c.level >= 11 ? ' Stalker\'s Flurry: attack again after a miss.' : ''}${c.level >= 15 ? ' Shadowy Dodge.' : ''}`,
  },
  {
    id: 'detect_portal', sc: 'horizon_walker', class: 'ranger', name: 'Detect Portal', from: 3, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(42),
    note: (c) => `An action: sense the nearest planar portal within 1 mile. Planar Warrior: a bonus action, your next hit deals force damage and ${c.level >= 11 ? '2d8' : '1d8'} more.${c.level >= 11 ? ' Distant Strike: teleport 10 feet before each attack.' : ''}${c.level >= 15 ? ' Spectral Defense: a reaction to resist an attack\'s damage.' : ''}`,
  },
  {
    id: 'ethereal_step', sc: 'horizon_walker', class: 'ranger', name: 'Ethereal Step', from: 7, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(43),
    note: () => 'A bonus action: cast Etherealness without a slot, until the end of the turn.',
  },
  {
    id: 'slayers_prey', sc: 'monster_slayer', class: 'ranger', name: "Slayer's Prey", from: 3, kind: 'info', page: XGE(43),
    note: (c) => `A bonus action: mark a creature; your first hit on it each turn deals 1d6 more.${c.level >= 7 ? ' Supernatural Defense: add 1d6 to saves and grapple escapes against your prey.' : ''}${c.level >= 15 ? ' Slayer\'s Counter: a reaction attack when your prey forces a save.' : ''}`,
  },
  {
    id: 'hunters_sense', sc: 'monster_slayer', class: 'ranger', name: "Hunter's Sense", from: 3, kind: 'uses', recharge: 'long', page: XGE(43),
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'An action: a creature within 60 feet: learn its immunities, resistances and vulnerabilities.',
  },
  {
    id: 'magic_users_nemesis', sc: 'monster_slayer', class: 'ranger', name: "Magic-User's Nemesis", from: 11, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(43),
    note: (c) => `A reaction when a creature within 60 feet casts a spell or teleports: Wisdom save (DC ${dc(c, 'wis')}) or it fails.`,
  },
  {
    id: 'dreadful_strikes_2014', sc: 'fey_wanderer', edition: E14, class: 'ranger', name: 'Dreadful Strikes', from: 3, kind: 'info', page: TCE(59),
    note: (c) => `Once a turn per creature: ${c.level >= 11 ? '1d6' : '1d4'} psychic damage more on a weapon hit. Otherworldly Glamour: +${atLeast1(c.mod('wis'))} to Charisma checks.${c.level >= 7 ? ' Beguiling Twist: a reaction to turn a charm or fear onto someone else.' : ''}`,
  },
  {
    id: 'fey_reinforcements_2014', sc: 'fey_wanderer', edition: E14, class: 'ranger', name: 'Fey Reinforcements', from: 11, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(59),
    note: () => 'Cast Summon Fey without a slot or material component (optionally without concentration, for 1 minute).',
  },
  {
    id: 'misty_wanderer_2014', sc: 'fey_wanderer', edition: E14, class: 'ranger', name: 'Misty Wanderer', from: 15, kind: 'uses', recharge: 'long', page: TCE(59),
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'Cast Misty Step without a slot, and bring a willing creature within 5 feet.',
  },
  {
    id: 'drake_companion', sc: 'drakewarden', class: 'ranger', name: 'Drake Companion', from: 3, kind: 'uses', max: () => 1, recharge: 'long', page: FTD(15),
    note: (c) => `An action: summon your drake (AC ${14 + c.pb}, ${5 * c.level} hit points, ${c.level >= 15 ? 'Large' : c.level >= 7 ? 'Medium' : 'Small'}; bite 1d6 + ${c.pb} plus ${c.level >= 15 ? '2d6' : c.level >= 7 ? '1d6' : 'no'} infused damage). Spend a spell slot to summon it again. Draconic Gift: Thaumaturgy and Draconic.${c.level >= 7 ? ' Bond of Fang and Scale: ride it, fly on it, resist its damage type.' : ''}`,
  },
  {
    id: 'drakes_breath', sc: 'drakewarden', class: 'ranger', name: "Drake's Breath", from: 11, kind: 'uses', max: () => 1, recharge: 'long', page: FTD(16),
    note: (c) => `An action: you or your drake breathe a 30-foot cone, ${c.level >= 15 ? '10d6' : '8d6'} acid, cold, fire, lightning or poison (Dexterity save, DC ${dc(c, 'wis')}, for half). Spend a 3rd-level or higher slot to use it again.`,
  },
  {
    id: 'reflexive_resistance', sc: 'drakewarden', class: 'ranger', name: 'Reflexive Resistance (drake)', from: 15, kind: 'uses', recharge: 'long', page: FTD(16),
    max: (c) => c.pb,
    note: () => "Perfected Bond: a reaction when you take damage near your drake: resistance to it. Your drake's bite deals 1d6 more.",
  },
  {
    id: 'gathered_swarm', sc: 'swarmkeeper', class: 'ranger', name: 'Gathered Swarm', from: 3, kind: 'info', page: TCE(59),
    note: (c) => `Once a turn after a hit: ${c.level >= 11 ? '1d8' : '1d6'} piercing more, or push 15 feet (Strength save, DC ${dc(c, 'wis')}), or move 5 feet.${c.level >= 11 ? ' Mighty Swarm: knock prone, half cover.' : ''}`,
  },
  {
    id: 'writhing_tide', sc: 'swarmkeeper', class: 'ranger', name: 'Writhing Tide', from: 7, kind: 'uses', recharge: 'long', page: TCE(60),
    max: (c) => c.pb,
    note: () => 'A bonus action: fly 10 feet and hover for 1 minute.',
  },
  {
    id: 'swarming_dispersal', sc: 'swarmkeeper', class: 'ranger', name: 'Swarming Dispersal', from: 15, kind: 'uses', recharge: 'long', page: TCE(60),
    max: (c) => c.pb,
    note: () => 'A reaction when you take damage: resist it, and teleport 30 feet.',
  },

  // ---------- Rogue ----------
  {
    id: 'insightful_fighting', sc: 'inquisitive', class: 'rogue', name: 'Insightful Fighting', from: 3, kind: 'info', page: XGE(45),
    note: (c) => `A bonus action: Insight against a creature's Deception; if you win, Sneak Attack it without advantage for 1 minute. Ear for Deceit: Insight rolls at least 8. Eye for Detail.${c.level >= 9 ? ' Steady Eye.' : ''}${c.level >= 13 ? ' Unerring Eye.' : ''}${c.level >= 17 ? ' Eye for Weakness: 3d6 more Sneak Attack with Insightful Fighting.' : ''}`,
  },
  {
    id: 'unerring_eye', sc: 'inquisitive', class: 'rogue', name: 'Unerring Eye', from: 13, kind: 'uses', recharge: 'long', page: XGE(46),
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'An action: sense illusions, shapechangers and other magical deception within 30 feet.',
  },
  {
    id: 'master_of_tactics', sc: 'mastermind', class: 'rogue', name: 'Master of Tactics', from: 3, kind: 'info', page: XGE(46),
    note: (c) => `Help as a bonus action, at 30 feet. Master of Intrigue.${c.level >= 9 ? ' Insightful Manipulator.' : ''}${c.level >= 13 ? ' Misdirection: a reaction to turn an attack on a creature giving you cover.' : ''}${c.level >= 17 ? ' Soul of Deceit.' : ''}`,
  },
  {
    id: 'skirmisher', sc: 'scout', class: 'rogue', name: 'Skirmisher', from: 3, kind: 'info', page: XGE(47),
    note: (c) => `A reaction: move half your speed when an enemy ends its turn within 5 feet, without opportunity attacks. Survivalist.${c.level >= 9 ? ' Superior Mobility: +10 feet.' : ''}${c.level >= 13 ? ' Ambush Master: advantage on initiative; allies get advantage against the first creature you hit.' : ''}${c.level >= 17 ? ' Sudden Strike.' : ''}`,
  },
  {
    id: 'fancy_footwork', sc: 'swashbuckler', class: 'rogue', name: 'Fancy Footwork', from: 3, kind: 'info', page: XGE(47),
    note: (c) => `A creature you attack in melee can't make opportunity attacks against you this turn. Rakish Audacity: +${c.mod('cha')} to initiative; Sneak Attack with no ally near when it's the only creature within 5 feet.${c.level >= 9 ? ' Panache.' : ''}${c.level >= 13 ? ' Elegant Maneuver.' : ''}`,
  },
  {
    id: 'master_duelist', sc: 'swashbuckler', class: 'rogue', name: 'Master Duelist', from: 17, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(48),
    note: () => 'Reroll a missed attack with advantage.',
  },
  {
    id: 'wails_from_the_grave', sc: 'phantom', class: 'rogue', name: 'Wails from the Grave', from: 3, kind: 'uses', recharge: 'long', page: TCE(62),
    max: (c) => c.pb,
    note: (c) => `After Sneak Attack: a second creature within 30 feet takes ${halfUp(halfUp(c.level))}d6 necrotic (half your Sneak Attack dice). Whispers of the Dead: a tool or skill proficiency after each rest.${c.level >= 9 ? ' Tokens of the Departed: soul trinkets (as many as your proficiency bonus) give a use back.' : ''}${c.level >= 17 ? ' Death\'s Friend: a free use when you have none, and both creatures.' : ''}`,
  },
  {
    id: 'ghost_walk', sc: 'phantom', class: 'rogue', name: 'Ghost Walk', from: 13, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(63),
    note: () => 'A bonus action for 10 minutes: fly 10 feet, attacks against you have disadvantage, move through objects. Destroy a soul trinket to use it again.',
  },
  {
    id: 'psionic_energy_soulknife_2014', sc: 'soulknife', edition: E14, class: 'rogue', name: 'Psionic Energy', from: 3, kind: 'pool', recharge: 'long', page: TCE(63),
    max: (c) => 2 * c.pb,
    note: (c) => `Psionic Energy dice (d${step([[3, 6], [5, 8], [11, 10], [17, 12]], c.level)}); a bonus action to get one back once per short rest. Psi-Bolstered Knack, Psychic Whispers. Psychic Blades: 1d6 (1d4 off hand), thrown 60 feet.${c.level >= 9 ? ' Soul Blades: Homing Strikes, Psychic Teleportation.' : ''}`,
  },
  {
    id: 'psychic_veil', sc: 'soulknife', edition: E14, class: 'rogue', name: 'Psychic Veil', from: 13, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(64),
    note: () => 'An action: invisible for 1 hour. Spend a Psionic Energy die to use it again.',
  },
  {
    id: 'rend_mind', sc: 'soulknife', edition: E14, class: 'rogue', name: 'Rend Mind', from: 17, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(64),
    note: (c) => `After Sneak Attack with your blades: Wisdom save (DC ${8 + c.pb + c.mod('dex')}) or stunned for 1 minute. Spend 3 Psionic Energy dice to use it again.`,
  },

  // ---------- Sorcerer ----------
  {
    id: 'favored_by_the_gods', sc: 'divine_soul', class: 'sorcerer', name: 'Favored by the Gods', from: 1, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(50),
    note: (c) => `Add 2d4 to a failed save or missed attack. Divine Magic: cleric spells too.${c.level >= 6 ? ' Empowered Healing: 1 sorcery point to reroll healing dice.' : ''}${c.level >= 14 ? ' Otherworldly Wings: fly 30 feet.' : ''}`,
  },
  {
    id: 'unearthly_recovery', sc: 'divine_soul', class: 'sorcerer', name: 'Unearthly Recovery', from: 18, kind: 'uses', max: () => 1, recharge: 'long', page: XGE(50),
    note: () => 'A bonus action when below half your hit points: regain half your hit point maximum.',
  },
  {
    id: 'strength_of_the_grave', sc: 'shadow_magic', class: 'sorcerer', name: 'Strength of the Grave', from: 1, kind: 'uses', max: () => 1, recharge: 'long', page: XGE(51),
    note: (c) => `When damage drops you to 0 (not radiant or a critical hit): Charisma save (DC 5 + the damage) to drop to 1 instead. Eyes of the Dark: darkvision 120 feet${c.level >= 3 ? ', Darkness for 2 sorcery points (you see through it)' : ''}.${c.level >= 6 ? ' Hound of Ill Omen: 3 sorcery points.' : ''}${c.level >= 14 ? ' Shadow Walk: teleport 120 feet between dim spots.' : ''}`,
  },
  {
    id: 'umbral_form', sc: 'shadow_magic', class: 'sorcerer', name: 'Umbral Form', from: 18, kind: 'info', page: XGE(51),
    note: () => '6 sorcery points, a bonus action, 1 minute: resist all damage but force and radiant, and move through creatures and objects.',
  },
  {
    id: 'tempestuous_magic', sc: 'storm_sorcery', class: 'sorcerer', name: 'Tempestuous Magic', from: 1, kind: 'info', page: XGE(51),
    note: (c) => `After casting a spell of 1st level or higher: fly 10 feet as a bonus action without opportunity attacks.${c.level >= 6 ? ` Heart of the Storm: resist lightning and thunder; your lightning and thunder spells deal ${Math.floor(c.level / 2)} damage to creatures you choose within 10 feet. Storm Guide.` : ''}${c.level >= 14 ? ` Storm's Fury: a reaction, ${c.level} lightning to a melee attacker and push it (Strength save, DC ${dc(c, 'cha')}).` : ''}${c.level >= 18 ? ' Wind Soul: fly 60 feet; share 30 feet with others for an hour once per short rest.' : ''}`,
  },
  {
    id: 'psionic_sorcery_2014', sc: 'aberrant', edition: E14, class: 'sorcerer', name: 'Telepathic Speech', from: 1, kind: 'info', page: TCE(66),
    note: (c) => `A bonus action: talk telepathically with a creature within ${30 * atLeast1(c.mod('cha'))} miles for ${c.level} minutes.${c.level >= 6 ? ' Psionic Sorcery: cast Psionic Spells with sorcery points, no components. Psychic Defenses.' : ''}${c.level >= 14 ? ' Revelation in Flesh: 1 sorcery point each for flying, swimming, seeing the invisible or squeezing.' : ''}`,
  },
  {
    id: 'warping_implosion_2014', sc: 'aberrant', edition: E14, class: 'sorcerer', name: 'Warping Implosion', from: 18, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(67),
    note: (c) => `An action: teleport 120 feet; creatures within 30 feet of where you left take 3d10 force and are pulled (Strength save, DC ${dc(c, 'cha')}, for half). 5 sorcery points to use it again.`,
  },
  {
    id: 'restore_balance_2014', sc: 'clockwork', edition: E14, class: 'sorcerer', name: 'Restore Balance', from: 1, kind: 'uses', recharge: 'long', page: TCE(68),
    max: (c) => c.pb,
    note: (c) => `A reaction: cancel advantage or disadvantage on a roll within 60 feet.${c.level >= 6 ? ' Bastion of Law: spend 1 to 5 sorcery points for a ward of that many d8s.' : ''}`,
  },
  {
    id: 'trance_of_order_2014', sc: 'clockwork', edition: E14, class: 'sorcerer', name: 'Trance of Order', from: 14, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(69),
    note: () => 'A bonus action for 1 minute: attacks against you lose advantage, and your attacks, checks and saves roll at least 10. 5 sorcery points to use it again.',
  },
  {
    id: 'clockwork_cavalcade_2014', sc: 'clockwork', edition: E14, class: 'sorcerer', name: 'Clockwork Cavalcade', from: 18, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(69),
    note: () => 'An action: in a 30-foot cube, heal up to 100 hit points shared, repair objects and end spells of 6th level or lower. 7 sorcery points to use it again.',
  },

  // ---------- Warlock ----------
  {
    id: 'healing_light_2014', sc: 'celestial', edition: E14, class: 'warlock', name: 'Healing Light', from: 1, kind: 'pool', recharge: 'long', page: XGE(55),
    max: (c) => 1 + c.level,
    note: (c) => `A pool of d6s: a bonus action to spend up to ${atLeast1(c.mod('cha'))} and heal a creature within 60 feet that much.${c.level >= 6 ? ` Radiant Soul: resist radiant, +${c.mod('cha')} to one fire or radiant damage roll.` : ''}${c.level >= 10 ? ` Celestial Resilience: after a rest, ${c.level + c.mod('cha')} temporary hit points for you and ${Math.floor(c.level / 2) + c.mod('cha')} for up to five others.` : ''}`,
  },
  {
    id: 'searing_vengeance_2014', sc: 'celestial', edition: E14, class: 'warlock', name: 'Searing Vengeance', from: 14, kind: 'uses', max: () => 1, recharge: 'long', page: XGE(56),
    note: (c) => `On a death save, regain ${Math.floor(c.level / 2)} hit points and stand up; enemies within 30 feet take 2d8 + ${c.mod('cha')} radiant damage and are blinded.`,
  },
  {
    id: 'hexblades_curse', sc: 'hexblade', class: 'warlock', name: "Hexblade's Curse", from: 1, kind: 'uses', max: () => 1, recharge: 'short', page: XGE(55),
    note: (c) => `A bonus action for 1 minute: +${c.pb} damage against the target, critical hits on 19–20, and regain ${c.level + c.mod('cha')} hit points if it dies. Hex Warrior: Charisma for a pact or chosen weapon.${c.level >= 10 ? ' Armor of Hexes: a reaction, roll a d6; on a 4+ the cursed target\'s attack misses.' : ''}${c.level >= 14 ? ' Master of Hexes: move the curse when the target dies.' : ''}`,
  },
  {
    id: 'accursed_specter', sc: 'hexblade', class: 'warlock', name: 'Accursed Specter', from: 6, kind: 'uses', max: () => 1, recharge: 'long', page: XGE(56),
    note: (c) => `When you slay a humanoid: its specter serves you until your next long rest, with ${Math.floor(c.level / 2)} temporary hit points and +${atLeast1(c.mod('cha'))} to attacks.`,
  },
  {
    id: 'tentacle_of_the_deeps', sc: 'fathomless', class: 'warlock', name: 'Tentacle of the Deeps', from: 1, kind: 'uses', recharge: 'long', page: TCE(72),
    max: (c) => c.pb,
    note: (c) => `A bonus action for 1 minute: a tentacle hits for ${c.level >= 10 ? '2d8' : '1d8'} cold and slows by 10 feet. Gift of the Sea: swim 40 feet, breathe water.${c.level >= 6 ? ' Oceanic Soul. Guardian Coil: a reaction, take ' + (c.level >= 10 ? '2d8' : '1d8') + ' off damage near the tentacle.' : ''}${c.level >= 14 ? ' Fathomless Plunge.' : ''}`,
  },
  {
    id: 'grasping_tentacles', sc: 'fathomless', class: 'warlock', name: 'Grasping Tentacles', from: 10, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(73),
    note: (c) => `Cast Evard's Black Tentacles without a slot; you gain ${c.level} temporary hit points and damage can't break your concentration on it.`,
  },
  {
    id: 'fathomless_plunge', sc: 'fathomless', class: 'warlock', name: 'Fathomless Plunge', from: 14, kind: 'uses', max: () => 1, recharge: 'short', page: TCE(73),
    note: () => 'An action: you and up to five willing creatures within 30 feet teleport to a body of water you\'ve seen within 1 mile.',
  },
  {
    id: 'genies_vessel', sc: 'genie', class: 'warlock', name: "Genie's Vessel", from: 1, kind: 'info', page: TCE(73),
    note: (c) => `Genie's Wrath: once a turn, +${c.pb} damage of your genie's type on a hit.${c.level >= 6 ? ' Elemental Gift.' : ''}${c.level >= 10 ? ' Sanctuary Vessel: bring up to five others into the vessel.' : ''}`,
  },
  {
    id: 'bottled_respite', sc: 'genie', class: 'warlock', name: 'Bottled Respite', from: 1, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(73),
    note: (c) => `An action: step into your vessel for up to ${2 * c.pb} hours.`,
  },
  {
    id: 'elemental_gift', sc: 'genie', class: 'warlock', name: 'Elemental Gift', from: 6, kind: 'uses', recharge: 'long', page: TCE(74),
    max: (c) => c.pb,
    note: () => 'A bonus action: fly 30 feet for 10 minutes. You also resist your genie\'s damage type.',
  },
  {
    id: 'limited_wish', sc: 'genie', class: 'warlock', name: 'Limited Wish', from: 14, kind: 'uses', max: () => 1, recharge: 'none', page: TCE(74),
    note: () => 'An action: the effect of any 6th-level or lower spell with a casting time of one action, with no components. Back after 1d4 long rests (tick it back by hand).',
  },

  // ---------- Wizard ----------
  {
    id: 'arcane_deflection', sc: 'war_magic_school', class: 'wizard', name: 'Arcane Deflection', from: 2, kind: 'info', page: XGE(59),
    note: (c) => `A reaction when hit or failing a save: +2 AC or +4 to the save (only cantrips next turn). Tactical Wit: +${c.mod('int')} to initiative.${c.level >= 10 ? ` Durable Magic: +2 AC and saves while concentrating.` : ''}${c.level >= 14 ? ` Deflecting Shroud: Arcane Deflection deals ${Math.floor(c.level / 2)} force to three creatures within 60 feet.` : ''}`,
  },
  {
    id: 'power_surge', sc: 'war_magic_school', class: 'wizard', name: 'Power Surge', from: 6, kind: 'uses', recharge: 'long', page: XGE(60),
    max: (c) => atLeast1(c.mod('int')),
    note: (c) => `Spend one on a damage spell for ${Math.floor(c.level / 2)} force damage more. You gain one when you end a spell with Dispel Magic or Counterspell; a short rest brings you back to one if you have none (tick it back by hand).`,
  },
  {
    id: 'bladesong', sc: 'bladesinging', class: 'wizard', name: 'Bladesong', from: 2, kind: 'uses', recharge: 'long', page: TCE(76),
    max: (c) => c.pb,
    note: (c) => `A bonus action for 1 minute: +${atLeast1(c.mod('int'))} AC, +10 feet speed, advantage on Acrobatics, +${atLeast1(c.mod('int'))} to concentration saves.${c.level >= 6 ? ' Extra Attack (a cantrip can replace one).' : ''}${c.level >= 10 ? ' Song of Defense: a reaction, spend a slot to take 5 × its level off damage.' : ''}${c.level >= 14 ? ` Song of Victory: +${atLeast1(c.mod('int'))} to melee damage.` : ''}`,
  },
  {
    id: 'manifest_mind', sc: 'scribes', class: 'wizard', name: 'Manifest Mind', from: 6, kind: 'uses', recharge: 'long', page: TCE(78),
    max: (c) => c.pb,
    note: () => 'Cast a spell through your manifested mind as if you were in its space. Wizardly Quill and Awakened Spellbook (swap a spell\'s damage type; ritual in normal time once per long rest).',
  },
  {
    id: 'awakened_spellbook', sc: 'scribes', class: 'wizard', name: 'Awakened Spellbook', from: 2, kind: 'uses', max: () => 1, recharge: 'long', page: TCE(77),
    note: (c) => `Cast a ritual spell in its normal time. Spells can take the damage type of another spell of that level in your book.${c.level >= 10 ? ' Master Scrivener: a free scroll after each long rest.' : ''}${c.level >= 14 ? ' One with the Word: advantage on Arcana; a reaction to spend spells from your book to avoid damage.' : ''}`,
  },
];
