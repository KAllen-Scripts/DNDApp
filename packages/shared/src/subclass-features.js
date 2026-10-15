/**
 * Subclass features on the character sheet: the uses, pools of points and
 * worked-out numbers a subclass adds (Battle Master superiority dice, Portent,
 * Circle of the Moon's Combat Wild Shape healing, Warding Flare, a domain's
 * or an oath's Channel Divinity options...). They're rows of the same Class
 * features box (class-features.js adds them to its list), shown under their
 * own heading, and matched on the subclass the player typed on the sheet.
 *
 * Plain JS like sheet.js: the server uses it and the page loads it from
 * /shared/subclass-features.js. Only the Player's Handbook's subclasses so far:
 * the 2014 ones checked against the group's 2014 Player's Handbook (pages
 * below), the 2024 ones from the 2024 Player's Handbook (not in the group's
 * books folder yet). Other books' subclasses can be added the same way; until
 * then the player adds their own rows. Every number can be typed over: the DM
 * has the last word.
 *
 * Each entry is a class feature (see FEATURES in class-features.js) with
 * `sc`, the key of its subclass in SUBCLASSES.
 */

import { BOOK_SUBCLASSES, BOOK_SUBCLASS_FEATURES, REPRINTED_IN_PHB_2024 } from './subclass-features-books.js';

/** A number from a table by level: step([[1, 2], [3, 3], [6, 4]], 5) → 3. */
const step = (table, level) => table.reduce((v, [from, n]) => (level >= from ? n : v), table[0][1]);
const atLeast1 = (n) => Math.max(1, n);
const rageDamage = (level) => step([[1, 2], [9, 3], [16, 4]], level);
const martialArts = (c) => (c.edition === '2024' ? step([[1, 6], [5, 8], [11, 10], [17, 12]], c.level) : step([[1, 4], [5, 6], [11, 8], [17, 10]], c.level));
const plus = (n) => (n < 0 ? `− ${-n}` : `+ ${n}`);


/**
 * The subclasses the sheet knows: key, class, name (as the book prints it),
 * match (tested against what the player typed, so "Battle Master",
 * "battlemaster" and "Battle Master Fighter" all count) and the editions with
 * that subclass in their Player's Handbook.
 */
const PHB_SUBCLASSES = [
  // Barbarian
  { key: 'berserker', class: 'barbarian', name: 'Path of the Berserker', match: /berserk/i, editions: ['2014', '2024'] },
  { key: 'totem_warrior', class: 'barbarian', name: 'Path of the Totem Warrior', match: /totem/i, editions: ['2014'] },
  { key: 'wild_heart', class: 'barbarian', name: 'Path of the Wild Heart', match: /wild\s*heart/i, editions: ['2024'] },
  { key: 'world_tree', class: 'barbarian', name: 'Path of the World Tree', match: /world\s*tree/i, editions: ['2024'] },
  { key: 'zealot', class: 'barbarian', name: 'Path of the Zealot', match: /zealot/i, editions: ['2024'] },
  // Bard
  { key: 'lore', class: 'bard', name: 'College of Lore', match: /lore/i, editions: ['2014', '2024'] },
  { key: 'valor', class: 'bard', name: 'College of Valor', match: /valou?r/i, editions: ['2014', '2024'] },
  { key: 'dance', class: 'bard', name: 'College of Dance', match: /danc/i, editions: ['2024'] },
  { key: 'glamour', class: 'bard', name: 'College of Glamour', match: /glamou?r/i, editions: ['2024'] },
  // Cleric
  { key: 'knowledge', class: 'cleric', name: 'Knowledge Domain', match: /knowledge/i, editions: ['2014'] },
  { key: 'life', class: 'cleric', name: 'Life Domain', match: /\blife\b/i, editions: ['2014', '2024'] },
  { key: 'light', class: 'cleric', name: 'Light Domain', match: /\blight\b/i, editions: ['2014', '2024'] },
  { key: 'nature', class: 'cleric', name: 'Nature Domain', match: /nature/i, editions: ['2014'] },
  { key: 'tempest', class: 'cleric', name: 'Tempest Domain', match: /tempest/i, editions: ['2014'] },
  { key: 'trickery', class: 'cleric', name: 'Trickery Domain', match: /trick/i, editions: ['2014', '2024'] },
  { key: 'war', class: 'cleric', name: 'War Domain', match: /\bwar\b/i, editions: ['2014', '2024'] },
  // Druid
  { key: 'land', class: 'druid', name: 'Circle of the Land', match: /\bland\b/i, editions: ['2014', '2024'] },
  { key: 'moon', class: 'druid', name: 'Circle of the Moon', match: /moon/i, editions: ['2014', '2024'] },
  { key: 'sea', class: 'druid', name: 'Circle of the Sea', match: /\bsea\b/i, editions: ['2024'] },
  { key: 'stars', class: 'druid', name: 'Circle of the Stars', match: /\bstars?\b/i, editions: ['2024'] },
  // Fighter
  { key: 'champion', class: 'fighter', name: 'Champion', match: /champion/i, editions: ['2014', '2024'] },
  { key: 'battle_master', class: 'fighter', name: 'Battle Master', match: /battle\s*master/i, editions: ['2014', '2024'] },
  { key: 'eldritch_knight', class: 'fighter', name: 'Eldritch Knight', match: /eldritch\s*knight/i, editions: ['2014', '2024'] },
  { key: 'psi_warrior', class: 'fighter', name: 'Psi Warrior', match: /psi\s*warrior/i, editions: ['2024'] },
  // Monk
  { key: 'open_hand', class: 'monk', name: 'Way of the Open Hand', match: /open\s*hand/i, editions: ['2014', '2024'] },
  { key: 'shadow', class: 'monk', name: 'Way of Shadow', match: /shadow/i, editions: ['2014', '2024'] },
  { key: 'elements', class: 'monk', name: 'Way of the Four Elements', match: /element/i, editions: ['2014', '2024'] },
  { key: 'mercy', class: 'monk', name: 'Warrior of Mercy', match: /mercy/i, editions: ['2024'] },
  // Paladin
  { key: 'devotion', class: 'paladin', name: 'Oath of Devotion', match: /devotion/i, editions: ['2014', '2024'] },
  { key: 'ancients', class: 'paladin', name: 'Oath of the Ancients', match: /ancients/i, editions: ['2014', '2024'] },
  { key: 'vengeance', class: 'paladin', name: 'Oath of Vengeance', match: /vengeance/i, editions: ['2014', '2024'] },
  { key: 'glory', class: 'paladin', name: 'Oath of Glory', match: /glory/i, editions: ['2024'] },
  // Ranger
  { key: 'hunter', class: 'ranger', name: 'Hunter', match: /hunter/i, editions: ['2014', '2024'] },
  { key: 'beast_master', class: 'ranger', name: 'Beast Master', match: /beast/i, editions: ['2014', '2024'] },
  { key: 'fey_wanderer', class: 'ranger', name: 'Fey Wanderer', match: /fey\s*wander/i, editions: ['2024'] },
  { key: 'gloom_stalker', class: 'ranger', name: 'Gloom Stalker', match: /gloom/i, editions: ['2024'] },
  // Rogue
  { key: 'thief', class: 'rogue', name: 'Thief', match: /thief/i, editions: ['2014', '2024'] },
  { key: 'assassin', class: 'rogue', name: 'Assassin', match: /assassin/i, editions: ['2014', '2024'] },
  { key: 'arcane_trickster', class: 'rogue', name: 'Arcane Trickster', match: /arcane\s*trickster/i, editions: ['2014', '2024'] },
  { key: 'soulknife', class: 'rogue', name: 'Soulknife', match: /soul\s*knife/i, editions: ['2024'] },
  // Sorcerer
  { key: 'draconic', class: 'sorcerer', name: 'Draconic Bloodline', match: /draconic|dragon/i, editions: ['2014', '2024'] },
  { key: 'wild_magic', class: 'sorcerer', name: 'Wild Magic', match: /wild\s*magic/i, editions: ['2014', '2024'] },
  { key: 'aberrant', class: 'sorcerer', name: 'Aberrant Sorcery', match: /aberra/i, editions: ['2024'] },
  { key: 'clockwork', class: 'sorcerer', name: 'Clockwork Sorcery', match: /clockwork/i, editions: ['2024'] },
  // Warlock
  { key: 'archfey', class: 'warlock', name: 'The Archfey', match: /archfey/i, editions: ['2014', '2024'] },
  { key: 'fiend', class: 'warlock', name: 'The Fiend', match: /fiend/i, editions: ['2014', '2024'] },
  { key: 'great_old_one', class: 'warlock', name: 'The Great Old One', match: /old\s*one/i, editions: ['2014', '2024'] },
  { key: 'celestial', class: 'warlock', name: 'The Celestial', match: /celestial/i, editions: ['2024'] },
  // Wizard
  { key: 'abjuration', class: 'wizard', name: 'School of Abjuration', match: /abjur/i, editions: ['2014', '2024'] },
  { key: 'conjuration', class: 'wizard', name: 'School of Conjuration', match: /conjur/i, editions: ['2014'] },
  { key: 'divination', class: 'wizard', name: 'School of Divination', match: /divin/i, editions: ['2014', '2024'] },
  { key: 'enchantment', class: 'wizard', name: 'School of Enchantment', match: /enchant/i, editions: ['2014'] },
  { key: 'evocation', class: 'wizard', name: 'School of Evocation', match: /evoc|evok/i, editions: ['2014', '2024'] },
  { key: 'illusion', class: 'wizard', name: 'School of Illusion', match: /illusion/i, editions: ['2014', '2024'] },
  { key: 'necromancy', class: 'wizard', name: 'School of Necromancy', match: /necroman/i, editions: ['2014'] },
  { key: 'transmutation', class: 'wizard', name: 'School of Transmutation', match: /transmut/i, editions: ['2014'] },
];

/**
 * Every subclass the sheet knows: the Player's Handbook's (above) and other
 * books' (subclass-features-books.js), with `book` for those. A PHB 2024
 * subclass that first came out in a 2014 book (the 2014 Zealot is in
 * Xanathar's) has rows for both editions.
 */
export const SUBCLASSES = [
  ...PHB_SUBCLASSES.map((s) => (REPRINTED_IN_PHB_2024[s.key] ? { ...s, editions: ['2014', '2024'], book: REPRINTED_IN_PHB_2024[s.key] } : s)),
  ...BOOK_SUBCLASSES,
];

export const SUBCLASS_BY_KEY = Object.fromEntries(SUBCLASSES.map((s) => [s.key, s]));

/** The subclass a class's typed name matches, or null: subclassOf('fighter', 'battlemaster') → Battle Master. */
export function subclassOf(classKey, typed) {
  const t = String(typed ?? '').trim();
  if (!t) return null;
  return SUBCLASSES.find((s) => s.class === classKey && s.match.test(t)) ?? null;
}

/** Names for the sheet's subclass suggestions, for one class: both editions, the edition's own first. */
export function subclassNames(classKey, edition = '2014') {
  const of = SUBCLASSES.filter((s) => s.class === classKey);
  return [...of.filter((s) => s.editions.includes(edition)), ...of.filter((s) => !s.editions.includes(edition))].map((s) => s.name);
}

const P14 = (n) => `PHB 2014 p. ${n}`;
const P24 = 'PHB 2024';
const both = (n) => `${P14(n)}; ${P24}`;

export const SUBCLASS_FEATURES = [
  // ---------- Barbarian ----------
  {
    id: 'frenzy', class: 'barbarian', sc: 'berserker', name: 'Frenzy', from: 3, kind: 'info', page: both(49),
    note: (c) => (c.edition === '2024'
      ? `Reckless Attack while raging: the first creature you hit on your turn takes ${rageDamage(c.level)}d6 more damage.`
      : 'While raging you can go into a frenzy: a melee weapon attack as a bonus action on each of your turns. When the rage ends you suffer a level of exhaustion.'),
  },
  {
    id: 'intimidating_presence', class: 'barbarian', sc: 'berserker', name: 'Intimidating Presence', from: 10, page: both(49),
    kind: (c) => (c.edition === '2024' ? 'uses' : 'info'), max: () => 1, recharge: 'long',
    note: (c) => (c.edition === '2024'
      ? `A bonus action: creatures you choose within 30 feet make a Wisdom save (DC ${8 + c.pb + c.mod('str')}) or are frightened for 1 minute. Spend a Rage use to get it back.`
      : `An action: frighten a creature within 30 feet (Wisdom save, DC ${8 + c.pb + c.mod('cha')}).`),
  },
  {
    id: 'totem_spirit', class: 'barbarian', sc: 'totem_warrior', name: 'Totem Spirit', edition: '2014', from: 3, kind: 'info', page: P14(50),
    note: (c) => `While raging: Bear, resistance to all damage but psychic; Eagle, others have disadvantage on opportunity attacks against you and you can Dash as a bonus action; Wolf, friends have advantage on melee attacks against enemies within 5 feet of you.${c.level >= 6 ? ' Aspect of the Beast (6th) and' : ''}${c.level >= 14 ? ' Totemic Attunement (14th) too.' : c.level >= 6 ? ' more as you go.' : ''}`,
  },
  {
    id: 'rage_of_the_wilds', class: 'barbarian', sc: 'wild_heart', name: 'Rage of the Wilds', edition: '2024', from: 3, kind: 'info', page: P24,
    note: () => 'When you rage, pick one: Bear (resistance to all damage but force, necrotic, psychic and radiant), Eagle (Dash and Disengage as part of the bonus action) or Wolf (friends have advantage against enemies within 5 feet of you).',
  },
  {
    id: 'vitality_of_the_tree', class: 'barbarian', sc: 'world_tree', name: 'Vitality of the Tree', edition: '2024', from: 3, kind: 'info', page: P24,
    note: (c) => `When you rage: ${c.level} temporary hit points. At the start of each of your turns while raging, give a creature within 10 feet ${rageDamage(c.level)}d6 temporary hit points.`,
  },
  {
    id: 'divine_fury', class: 'barbarian', sc: 'zealot', name: 'Divine Fury', edition: '2024', from: 3, kind: 'info', page: P24,
    note: (c) => `While raging, the first creature you hit on each of your turns takes 1d6 + ${Math.floor(c.level / 2)} necrotic or radiant damage more.`,
  },
  {
    id: 'warrior_of_the_gods', class: 'barbarian', sc: 'zealot', name: 'Warrior of the Gods', edition: '2024', from: 3, kind: 'pool', recharge: 'long', page: P24,
    max: (c) => step([[3, 4], [6, 5], [12, 6], [17, 7]], c.level),
    note: () => 'A pool of d12s: a bonus action to spend any number, roll them and regain that many hit points.',
  },
  {
    id: 'zealous_presence', class: 'barbarian', sc: 'zealot', name: 'Zealous Presence', edition: '2024', from: 10, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: () => 'A bonus action: up to ten creatures within 60 feet have advantage on attacks and saves until your next turn. Spend a Rage use to get it back.',
  },
  {
    id: 'rage_of_the_gods', class: 'barbarian', sc: 'zealot', name: 'Rage of the Gods', edition: '2024', from: 14, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: () => 'When you rage, take a divine form for 1 minute: fly, resist necrotic, psychic and radiant damage, and spend a Rage use to keep a creature from dropping to 0.',
  },

  // ---------- Bard ----------
  {
    id: 'cutting_words', class: 'bard', sc: 'lore', name: 'Cutting Words', from: 3, kind: 'info', page: both(54),
    note: (c) => `A reaction: spend a Bardic Inspiration and take the die from a creature's attack roll, ability check or damage roll.${c.level >= 14 ? ' Peerless Skill: spend one to add it to your own ability check.' : ''}`,
  },
  {
    id: 'combat_inspiration', class: 'bard', sc: 'valor', name: 'Combat Inspiration', from: 3, kind: 'info', page: both(55),
    note: (c) => `A creature with your Bardic Inspiration can add the die to a weapon damage roll, or to its AC against one attack.${c.level >= 6 ? ' Extra Attack.' : ''}${c.level >= 14 ? ' Battle Magic: a weapon attack as a bonus action after casting a spell.' : ''}`,
  },
  {
    id: 'dazzling_footwork', class: 'bard', sc: 'dance', name: 'Dazzling Footwork', edition: '2024', from: 3, kind: 'info', page: P24,
    note: (c) => `Without armour or a shield: AC ${10 + c.mod('dex') + c.mod('cha')} (10 + Dex + Cha), and your unarmed strikes can use Dexterity and deal your Bardic Inspiration die. Spending a Bardic Inspiration lets you make an unarmed strike as part of it.`,
  },
  {
    id: 'beguiling_magic', class: 'bard', sc: 'glamour', name: 'Beguiling Magic', edition: '2024', from: 3, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: (c) => `After casting an enchantment or illusion spell: a creature within 60 feet makes a Wisdom save (DC ${8 + c.pb + c.mod('cha')}) or is charmed or frightened for 1 minute. Spend a Bardic Inspiration to get it back.`,
  },
  {
    id: 'mantle_of_inspiration', class: 'bard', sc: 'glamour', name: 'Mantle of Inspiration', edition: '2024', from: 3, kind: 'info', page: P24,
    note: (c) => `A bonus action: spend a Bardic Inspiration and roll it; up to ${atLeast1(c.mod('cha'))} creatures within 60 feet gain twice the roll in temporary hit points and can move without opportunity attacks.`,
  },
  {
    id: 'mantle_of_majesty', class: 'bard', sc: 'glamour', name: 'Mantle of Majesty', edition: '2024', from: 6, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: () => 'A bonus action: cast Command without a slot, and again as a bonus action each turn for 1 minute. Spend a 3rd-level or higher slot to get it back.',
  },
  {
    id: 'unbreakable_majesty', class: 'bard', sc: 'glamour', name: 'Unbreakable Majesty', edition: '2024', from: 14, kind: 'uses', max: () => 1, recharge: 'short', page: P24,
    note: (c) => `A bonus action for 1 minute: a creature that hits you for the first time on a turn makes a Charisma save (DC ${8 + c.pb + c.mod('cha')}) or the attack misses.`,
  },

  // ---------- Cleric ----------
  {
    id: 'knowledge_channel', class: 'cleric', sc: 'knowledge', name: 'Domain Channel Divinity', edition: '2014', from: 2, kind: 'info', page: P14(59),
    note: (c) => `Knowledge of the Ages: proficiency with a skill or tool for 10 minutes.${c.level >= 6 ? ` Read Thoughts: read a creature's surface thoughts (Wisdom save, DC ${8 + c.pb + c.mod('wis')}), then cast Suggestion on it without a slot.` : ''}`,
  },
  {
    id: 'visions_of_the_past', class: 'cleric', sc: 'knowledge', name: 'Visions of the Past', edition: '2014', from: 17, kind: 'uses', max: () => 1, recharge: 'short', page: P14(60),
    note: () => 'Meditate to see visions of an object\'s past owners or of recent events where you are.',
  },
  {
    id: 'disciple_of_life', class: 'cleric', sc: 'life', name: 'Disciple of Life', from: 1, kind: 'info', page: both(60),
    note: (c) => `Healing spells of 1st level or higher heal 2 + the spell's level more.${c.level >= 6 ? ' Blessed Healer: when such a spell heals someone else, you regain 2 + its level.' : ''}${c.level >= 17 ? ' Supreme Healing: healing dice from spells count as their highest number.' : ''}`,
  },
  {
    id: 'preserve_life', class: 'cleric', sc: 'life', name: 'Preserve Life', from: 2, kind: 'info', page: both(60),
    note: (c) => `Channel Divinity: restore ${5 * c.level} hit points shared among creatures within 30 feet, none above half its maximum.`,
  },
  {
    id: 'warding_flare', class: 'cleric', sc: 'light', name: 'Warding Flare', from: 1, kind: 'uses', page: both(61),
    max: (c) => atLeast1(c.mod('wis')),
    recharge: (c) => (c.edition === '2024' && c.level >= 6 ? 'short' : 'long'),
    note: (c) => `A reaction: an attacker within 30 feet has disadvantage on its attack roll.${c.level >= 6 ? ` Improved: also when it attacks someone else${c.edition === '2024' ? ', who gains 2d6 + ' + c.mod('wis') + ' temporary hit points if it hits; a short rest gives them all back' : ''}.` : ''}`,
  },
  {
    id: 'radiance_of_the_dawn', class: 'cleric', sc: 'light', name: 'Radiance of the Dawn', from: 2, kind: 'info', page: both(61),
    note: (c) => `Channel Divinity: magical darkness within 30 feet ends, and enemies there take 2d10 + ${c.level} radiant damage (Constitution save, DC ${8 + c.pb + c.mod('wis')}, for half).`,
  },
  {
    id: 'corona_of_light', class: 'cleric', sc: 'light', name: 'Corona of Light', from: 17, page: both(61),
    kind: (c) => (c.edition === '2024' ? 'uses' : 'info'), max: (c) => atLeast1(c.mod('wis')), recharge: 'long',
    note: () => 'An action for 1 minute: bright light 60 feet; enemies in it have disadvantage on saves against fire and radiant spells.',
  },
  {
    id: 'nature_channel', class: 'cleric', sc: 'nature', name: 'Charm Animals and Plants', edition: '2014', from: 2, kind: 'info', page: P14(62),
    note: (c) => `Channel Divinity: beasts and plant creatures within 30 feet make a Wisdom save (DC ${8 + c.pb + c.mod('wis')}) or are charmed for 1 minute.`,
  },
  {
    id: 'wrath_of_the_storm', class: 'cleric', sc: 'tempest', name: 'Wrath of the Storm', edition: '2014', from: 1, kind: 'uses', recharge: 'long', page: P14(62),
    max: (c) => atLeast1(c.mod('wis')),
    note: (c) => `A reaction when a creature within 5 feet hits you: 2d8 lightning or thunder damage (Dexterity save, DC ${8 + c.pb + c.mod('wis')}, for half).`,
  },
  {
    id: 'destructive_wrath', class: 'cleric', sc: 'tempest', name: 'Destructive Wrath', edition: '2014', from: 2, kind: 'info', page: P14(62),
    note: () => 'Channel Divinity: deal the most lightning or thunder damage the dice can roll instead of rolling.',
  },
  {
    id: 'invoke_duplicity', class: 'cleric', sc: 'trickery', name: 'Invoke Duplicity', from: 2, kind: 'info', page: both(63),
    note: (c) => `Channel Divinity: an illusion of you for 1 minute (concentration); cast spells from its space, and advantage on attacks against a creature next to it.${c.edition === '2014' && c.level >= 6 ? ' Cloak of Shadows: Channel Divinity to turn invisible until the end of your next turn.' : ''}`,
  },
  {
    id: 'war_priest', class: 'cleric', sc: 'war', name: 'War Priest', from: 1, kind: 'uses', page: both(63),
    max: (c) => atLeast1(c.mod('wis')),
    recharge: (c) => (c.edition === '2024' ? 'short' : 'long'),
    note: () => 'After taking the Attack action, one weapon attack as a bonus action.',
  },
  {
    id: 'guided_strike', class: 'cleric', sc: 'war', name: 'Guided Strike', from: 2, kind: 'info', page: both(63),
    note: (c) => `Channel Divinity: +10 to an attack roll${c.edition === '2024' ? ', yours or a creature\'s within 30 feet' : ''}.${c.level >= 6 ? (c.edition === '2024' ? ' War God\'s Blessing: Channel Divinity to cast Shield of Faith or Spiritual Weapon without a slot.' : ' War God\'s Blessing: a reaction, +10 to a creature\'s attack within 30 feet.') : ''}`,
  },

  // ---------- Druid ----------
  {
    id: 'natural_recovery', class: 'druid', sc: 'land', name: 'Natural Recovery', kind: 'uses', max: () => 1, recharge: 'long', page: both(68),
    from: (c) => (c.edition === '2024' ? 6 : 2),
    action: 'arcane_recovery',
    note: (c) => `During a short rest, get back spell slots adding up to ${Math.ceil(c.level / 2)} levels (none of 6th level or higher).${c.edition === '2024' ? ' You can also cast one of your circle spells without a slot, once per long rest.' : ''}`,
  },
  {
    id: 'lands_aid', class: 'druid', sc: 'land', name: "Land's Aid", edition: '2024', from: 3, kind: 'info', page: P24,
    note: (c) => `Spend a Wild Shape use: creatures in a 10-foot sphere within 60 feet take ${step([[3, 2], [10, 3], [14, 4]], c.level)}d6 necrotic damage (Constitution save, DC ${8 + c.pb + c.mod('wis')}, for half), and one creature there regains ${step([[3, 2], [10, 3], [14, 4]], c.level)}d6 hit points.`,
  },
  {
    id: 'combat_wild_shape', class: 'druid', sc: 'moon', name: 'Combat Wild Shape', edition: '2014', from: 2, kind: 'info', page: P14(69),
    action: 'slot_heal', dieSize: 8,
    note: () => 'Wild Shape as a bonus action. While in a form: a bonus action, spend a spell slot to regain 1d8 hit points per level of the slot.',
  },
  {
    id: 'moonlight_step', class: 'druid', sc: 'moon', name: 'Moonlight Step', edition: '2024', from: 10, kind: 'uses', recharge: 'long', page: P24,
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'A bonus action: teleport 30 feet and have advantage on your next spell attack this turn. Spend a 2nd-level or higher slot to get one back.',
  },
  {
    id: 'improved_circle_forms', class: 'druid', sc: 'moon', name: 'Improved Circle Forms', edition: '2024', from: 6, kind: 'info', page: P24,
    note: (c) => `In a form: your attacks can deal radiant damage, and you add +${c.mod('wis')} to Constitution saves.${c.level >= 14 ? ' Lunar Form: once a turn, 2d10 radiant damage more on a hit, and Moonlight Step can take a willing creature with you.' : ''}`,
  },
  {
    id: 'wrath_of_the_sea', class: 'druid', sc: 'sea', name: 'Wrath of the Sea', edition: '2024', from: 3, kind: 'info', page: P24,
    note: (c) => `Spend a Wild Shape use: a 5-foot emanation for 10 minutes (10 feet from 10th level). A bonus action: a creature in it takes ${atLeast1(c.mod('wis'))}d6 cold damage (Constitution save, DC ${8 + c.pb + c.mod('wis')}) and is pushed 15 feet.`,
  },
  {
    id: 'star_map', class: 'druid', sc: 'stars', name: 'Star Map', edition: '2024', from: 3, kind: 'uses', recharge: 'long', page: P24,
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'Cast Guiding Bolt without a slot. You also know Guidance.',
  },
  {
    id: 'starry_form', class: 'druid', sc: 'stars', name: 'Starry Form', edition: '2024', from: 3, kind: 'info', page: P24,
    note: (c) => `Spend a Wild Shape use for 10 minutes: Archer (a bonus action, a ranged spell attack for 1d8 + ${c.mod('wis')} radiant), Chalice (healing spells heal someone 1d8 + ${c.mod('wis')} more) or Dragon (Intelligence and Wisdom checks and concentration saves roll at least 10).`,
  },
  {
    id: 'cosmic_omen', class: 'druid', sc: 'stars', name: 'Cosmic Omen', edition: '2024', from: 6, kind: 'uses', recharge: 'long', page: P24,
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'After a long rest roll a die: even (Weal) or odd (Woe). A reaction: add or take away 1d6 from a creature\'s d20 test.',
  },

  // ---------- Fighter ----------
  {
    id: 'improved_critical', class: 'fighter', sc: 'champion', name: 'Improved Critical', from: 3, kind: 'info', page: both(72),
    note: (c) => `Your weapon attacks score a critical hit on a ${c.level >= 15 ? '18' : '19'}–20.${c.edition === '2024' && c.level >= 10 ? ' Heroic Warrior: in combat, gain Heroic Inspiration at the start of your turn if you have none.' : ''}`,
  },
  {
    id: 'survivor', class: 'fighter', sc: 'champion', name: 'Survivor', from: 18, kind: 'info', page: both(73),
    note: (c) => `At the start of each of your turns, if you have no more than half your hit points (and at least 1), regain ${5 + c.mod('con')} hit points.${c.edition === '2024' ? ' Defy Death: advantage on death saves, and a roll of 18–20 counts as a 20.' : ''}`,
  },
  {
    id: 'superiority_dice', class: 'fighter', sc: 'battle_master', name: 'Superiority Dice', from: 3, kind: 'uses', recharge: 'short', page: both(73),
    max: (c) => step([[3, 4], [7, 5], [15, 6]], c.level),
    note: (c) => `d${step([[3, 8], [10, 10], [18, 12]], c.level)}s for your manoeuvres; save DC ${8 + c.pb + Math.max(c.mod('str'), c.mod('dex'))}.${c.level >= 15 ? (c.edition === '2024' ? ' Relentless: once a turn, with none left, use a d8 instead.' : ' Relentless: get one back when you roll initiative with none left.') : ''}`,
  },
  {
    id: 'know_your_enemy', class: 'fighter', sc: 'battle_master', name: 'Know Your Enemy', edition: '2024', from: 7, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: () => 'A bonus action: learn a creature\'s immunities, resistances and vulnerabilities. Spend a superiority die to get it back.',
  },
  {
    id: 'war_magic', class: 'fighter', sc: 'eldritch_knight', name: 'War Magic', from: 7, kind: 'info', page: both(75),
    note: (c) => (c.edition === '2024'
      ? 'Replace one of your attacks with a cantrip.'
      : `After casting a cantrip, one weapon attack as a bonus action.${c.level >= 18 ? ' Improved: after a spell of any level.' : ''}`) + (c.level >= 10 ? ' Eldritch Strike: a creature you hit has disadvantage on its next save against your spells.' : ''),
  },
  {
    id: 'psionic_energy', class: 'fighter', sc: 'psi_warrior', name: 'Psionic Energy', edition: '2024', from: 3, kind: 'uses', recharge: 'short_one', page: P24,
    max: (c) => step([[3, 4], [5, 6], [9, 8], [13, 10], [17, 12]], c.level),
    note: (c) => `d${step([[3, 6], [5, 8], [11, 10], [17, 12]], c.level)}s for Protective Field, Psionic Strike and Telekinetic Movement.`,
  },

  // ---------- Monk ----------
  {
    id: 'open_hand_technique', class: 'monk', sc: 'open_hand', name: 'Open Hand Technique', from: 3, kind: 'info', page: both(79),
    note: (c) => `When you hit with Flurry of Blows: knock the target prone or push it 15 feet (save DC ${8 + c.pb + c.mod('wis')}), or it can't take reactions.${c.level >= 17 ? ` Quivering Palm: ${c.edition === '2024' ? 4 : 3} ${c.edition === '2024' ? 'Focus Points' : 'ki'}.` : ''}`,
  },
  {
    id: 'wholeness_of_body', class: 'monk', sc: 'open_hand', name: 'Wholeness of Body', from: 6, kind: 'uses', recharge: 'long', page: both(79),
    max: (c) => (c.edition === '2024' ? atLeast1(c.mod('wis')) : 1),
    heal: (c) => (c.edition === '2024' ? `1d${martialArts(c)}${c.mod('wis') ? (c.mod('wis') > 0 ? '+' : '') + c.mod('wis') : ''}` : String(3 * c.level)),
    note: (c) => (c.edition === '2024' ? `A bonus action: regain 1d${martialArts(c)} ${plus(c.mod('wis'))} hit points.` : `An action: regain ${3 * c.level} hit points.`),
  },
  {
    id: 'shadow_arts', class: 'monk', sc: 'shadow', name: 'Shadow Arts', from: 3, kind: 'info', page: both(80),
    note: (c) => (c.edition === '2024'
      ? 'Spend 1 Focus Point to cast Darkness without a slot (you can see through it, and move it). Darkvision 60 feet.'
      : 'Spend 2 ki to cast Darkness, Darkvision, Pass without Trace or Silence.') + (c.level >= 6 ? ' Shadow Step: teleport from dim light or darkness to dim light or darkness 60 feet away.' : ''),
  },
  {
    id: 'elemental_disciplines', class: 'monk', sc: 'elements', name: (c) => (c.edition === '2024' ? 'Elemental Attunement' : 'Elemental Disciplines'), from: 3, kind: 'info', page: both(80),
    note: (c) => (c.edition === '2024'
      ? 'Spend 1 Focus Point for 10 minutes: your unarmed strikes reach 10 feet more, deal acid, cold, fire, lightning or thunder damage, and can push or pull.'
      : `Spend ki on your disciplines: at most ${step([[3, 2], [5, 3], [9, 4], [13, 5], [17, 6]], c.level)} ki on one (for a spell, a point more than its level casts it higher).`),
  },
  {
    id: 'hand_of_healing', class: 'monk', sc: 'mercy', name: 'Hand of Healing and Harm', edition: '2024', from: 3, kind: 'info', page: P24,
    note: (c) => `Spend 1 Focus Point: heal a creature 1d${martialArts(c)} ${plus(c.mod('wis'))}, or on a hit deal 1d${martialArts(c)} ${plus(c.mod('wis'))} necrotic damage more (once a turn).`,
  },
  {
    id: 'hand_of_ultimate_mercy', class: 'monk', sc: 'mercy', name: 'Hand of Ultimate Mercy', edition: '2024', from: 17, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: (c) => `Spend 5 Focus Points: bring back a creature that died in the last 24 hours with 4d10 ${plus(c.mod('wis'))} hit points.`,
  },

  // ---------- Paladin ----------
  {
    id: 'devotion_channel', class: 'paladin', sc: 'devotion', name: 'Sacred Weapon', from: 3, kind: 'info', page: both(86),
    note: (c) => `Channel Divinity: for ${c.edition === '2024' ? '10 minutes' : '1 minute'} add +${atLeast1(c.mod('cha'))} to attack rolls with a weapon, which gives light.${c.edition === '2014' ? ' Or Turn the Unholy.' : ''}${c.level >= 7 ? ` Aura of Devotion: you and friends within ${c.level >= 18 ? 30 : 10} feet can't be charmed.` : ''}`,
  },
  {
    id: 'holy_nimbus', class: 'paladin', sc: 'devotion', name: 'Holy Nimbus', from: 20, kind: 'uses', max: () => 1, recharge: 'long', page: both(86),
    note: (c) => `An action for 1 minute: bright light 30 feet; enemies starting their turn in it take 10 radiant damage${c.edition === '2024' ? ' (plus your Charisma modifier). Spend a 5th-level slot to get it back' : ''}.`,
  },
  {
    id: 'ancients_channel', class: 'paladin', sc: 'ancients', name: "Nature's Wrath", from: 3, kind: 'info', page: both(87),
    note: (c) => `Channel Divinity: vines restrain creatures you choose${c.edition === '2014' ? ' (one creature; Strength or Dexterity save' : ' within 15 feet (Strength save'}, DC ${8 + c.pb + c.mod('cha')}).${c.edition === '2014' ? ' Or Turn the Faithless.' : ''}${c.level >= 7 ? ` Aura of Warding: you and friends within ${c.level >= 18 ? 30 : 10} feet resist damage from spells.` : ''}`,
  },
  {
    id: 'undying_sentinel', class: 'paladin', sc: 'ancients', name: 'Undying Sentinel', from: 15, kind: 'uses', max: () => 1, recharge: 'long', page: both(87),
    note: (c) => `Drop to 1 hit point instead of 0${c.edition === '2024' ? `, then regain ${3 * c.level}` : ''}.`,
  },
  {
    id: 'elder_champion', class: 'paladin', sc: 'ancients', name: 'Elder Champion', from: 20, kind: 'uses', max: () => 1, recharge: 'long', page: both(87),
    note: (c) => `An action for 1 minute: regain 10 hit points at the start of each turn, cast paladin spells as a bonus action, enemies within 10 feet have disadvantage on saves against them.${c.edition === '2024' ? ' Spend a 5th-level slot to get it back.' : ''}`,
  },
  {
    id: 'vengeance_channel', class: 'paladin', sc: 'vengeance', name: 'Vow of Enmity', from: 3, kind: 'info', page: both(88),
    note: (c) => `Channel Divinity: advantage on attacks against a creature within ${c.edition === '2024' ? 30 : 10} feet for 1 minute.${c.edition === '2014' ? ` Or Abjure Enemy (Wisdom save, DC ${8 + c.pb + c.mod('cha')}).` : ''}`,
  },
  {
    id: 'avenging_angel', class: 'paladin', sc: 'vengeance', name: 'Avenging Angel', from: 20, kind: 'uses', max: () => 1, recharge: 'long', page: both(88),
    note: (c) => `An action for 1 hour: wings (flying speed 60) and a 30-foot aura of menace (Wisdom save or frightened).${c.edition === '2024' ? ' Spend a 5th-level slot to get it back.' : ''}`,
  },
  {
    id: 'inspiring_smite', class: 'paladin', sc: 'glory', name: 'Inspiring Smite', edition: '2024', from: 3, kind: 'info', page: P24,
    note: (c) => `Channel Divinity after Divine Smite: share 2d8 + ${c.level} temporary hit points among creatures within 30 feet. Peerless Athlete: Channel Divinity for an hour of advantage on Athletics and Acrobatics.`,
  },
  {
    id: 'glorious_defense', class: 'paladin', sc: 'glory', name: 'Glorious Defense', edition: '2024', from: 15, kind: 'uses', recharge: 'long', page: P24,
    max: (c) => atLeast1(c.mod('cha')),
    note: (c) => `A reaction: +${c.mod('cha')} AC for you or a creature within 10 feet against an attack; if it misses, you can attack the attacker.`,
  },
  {
    id: 'living_legend', class: 'paladin', sc: 'glory', name: 'Living Legend', edition: '2024', from: 20, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: () => 'A bonus action for 10 minutes: advantage on Charisma checks, a missed attack can hit once a turn, and reroll a failed save. Spend a 5th-level slot to get it back.',
  },

  // ---------- Ranger ----------
  {
    id: 'hunters_prey', class: 'ranger', sc: 'hunter', name: "Hunter's Prey", from: 3, kind: 'info', page: both(93),
    note: (c) => `Colossus Slayer (1d8 more damage once a turn against a creature below its hit point maximum)${c.edition === '2014' ? ', Giant Killer' : ''} or Horde Breaker (one more attack against another creature within 5 feet of the first).`,
  },
  {
    id: 'beast_companion', class: 'ranger', sc: 'beast_master', name: (c) => (c.edition === '2024' ? 'Primal Companion' : "Ranger's Companion"), from: 3, kind: 'info', page: both(93),
    note: () => 'Your beast goes on the map as a companion token you control.',
  },
  {
    id: 'dreadful_strikes', class: 'ranger', sc: 'fey_wanderer', name: 'Dreadful Strikes', edition: '2024', from: 3, kind: 'info', page: P24,
    note: (c) => `Once a turn, a weapon hit deals 1d${c.level >= 11 ? 6 : 4} psychic damage more. Otherworldly Glamour: +${atLeast1(c.mod('wis'))} to Charisma checks.`,
  },
  {
    id: 'fey_reinforcements', class: 'ranger', sc: 'fey_wanderer', name: 'Fey Reinforcements', edition: '2024', from: 11, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: () => 'Cast Summon Fey without a slot or material component.',
  },
  {
    id: 'misty_wanderer', class: 'ranger', sc: 'fey_wanderer', name: 'Misty Wanderer', edition: '2024', from: 15, kind: 'uses', recharge: 'long', page: P24,
    max: (c) => atLeast1(c.mod('wis')),
    note: () => 'Cast Misty Step without a slot, bringing a willing creature within 5 feet with you.',
  },
  {
    id: 'dread_ambusher', class: 'ranger', sc: 'gloom_stalker', name: 'Dreadful Strike', edition: '2024', from: 3, kind: 'uses', recharge: 'long', page: P24,
    max: (c) => atLeast1(c.mod('wis')),
    note: (c) => `On a weapon hit, 2d${c.level >= 11 ? 8 : 6} psychic damage more (once a turn). Dread Ambusher: +${c.mod('wis')} initiative, and 10 feet more speed on your first turn.`,
  },

  // ---------- Rogue ----------
  {
    id: 'fast_hands', class: 'rogue', sc: 'thief', name: 'Fast Hands', from: 3, kind: 'info', page: both(97),
    note: (c) => (c.edition === '2024'
      ? 'Cunning Action can also be a Sleight of Hand check, using thieves\' tools, or the Utilize action. Second-Story Work: a climbing speed equal to your speed, and jumps use Dexterity.'
      : `Cunning Action can also be a Sleight of Hand check, using thieves' tools, or the Use an Object action. Second-Story Work: climbing costs no extra movement, and running jumps go ${c.mod('dex')} feet further.`)
      + (c.level >= 17 ? ' Thief\'s Reflexes: two turns in the first round of a fight (the second at your initiative − 10).' : ''),
  },
  {
    id: 'assassinate', class: 'rogue', sc: 'assassin', name: 'Assassinate', from: 3, kind: 'info', page: both(97),
    note: (c) => `Advantage on attacks against a creature that hasn't taken a turn in the fight yet${c.edition === '2024' ? `; your first Sneak Attack each fight deals ${c.level} damage more` : ', and a hit on a surprised creature is a critical hit'}.`,
  },
  {
    id: 'spell_thief', class: 'rogue', sc: 'arcane_trickster', name: 'Spell Thief', from: 17, kind: 'uses', max: () => 1, recharge: 'long', page: both(98),
    note: (c) => `A reaction when a creature casts a spell at you: it makes a save (DC ${8 + c.pb + c.mod('int')}); on a fail the spell does nothing to you and you can cast it for 8 hours.`,
  },
  {
    id: 'soulknife_energy', class: 'rogue', sc: 'soulknife', name: 'Psionic Energy', edition: '2024', from: 3, kind: 'uses', recharge: 'short_one', page: P24,
    max: (c) => step([[3, 4], [5, 6], [9, 8], [13, 10], [17, 12]], c.level),
    note: (c) => `d${step([[3, 6], [5, 8], [11, 10], [17, 12]], c.level)}s for Psi-Bolstered Knack and Psychic Whispers. Psychic Blades: 1d6 and 1d4 psychic.`,
  },

  // ---------- Sorcerer ----------
  {
    id: 'draconic_resilience', class: 'sorcerer', sc: 'draconic', name: 'Draconic Resilience', from: (c) => (c.edition === '2024' ? 3 : 1), kind: 'info', page: both(102),
    note: (c) => `Hit point maximum +${c.level} (add it to your maximum). Without armour: AC ${c.edition === '2024' ? `${10 + c.mod('dex') + c.mod('cha')} (10 + Dex + Cha)` : `${13 + c.mod('dex')} (13 + Dex)`}.${c.level >= 6 ? ` Elemental Affinity: +${c.mod('cha')} damage with spells of your dragon's type${c.edition === '2014' ? '; 1 sorcery point for an hour of resistance to it' : ', and resistance to it'}.` : ''}`,
  },
  {
    id: 'dragon_wings', class: 'sorcerer', sc: 'draconic', name: 'Dragon Wings', from: 14, page: both(103),
    kind: (c) => (c.edition === '2024' ? 'uses' : 'info'), max: () => 1, recharge: 'long',
    note: (c) => (c.edition === '2024' ? 'A bonus action: flying speed 60 for an hour. Spend 3 sorcery points to get it back.' : 'A bonus action: wings, with a flying speed equal to your speed.'),
  },
  {
    id: 'tides_of_chaos', class: 'sorcerer', sc: 'wild_magic', name: 'Tides of Chaos', from: (c) => (c.edition === '2024' ? 3 : 1), kind: 'uses', max: () => 1, recharge: 'long', page: both(103),
    note: (c) => `Advantage on one attack roll, ability check or save. ${c.edition === '2024' ? 'Casting a sorcerer spell before a long rest makes you roll for a Wild Magic Surge and gives it back.' : 'The DM can have you roll for a Wild Magic Surge to give it back.'}${c.level >= 6 ? ` Bend Luck: a reaction, spend ${c.edition === '2024' ? 1 : 2} sorcery point${c.edition === '2024' ? '' : 's'} to add or take away 1d4 from someone's roll.` : ''}`,
  },
  {
    id: 'tamed_surge', class: 'sorcerer', sc: 'wild_magic', name: 'Tamed Surge', edition: '2024', from: 18, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: () => 'After casting a sorcerer spell with a slot, pick an effect from the Wild Magic Surge table instead of rolling.',
  },
  {
    id: 'psionic_sorcery', class: 'sorcerer', sc: 'aberrant', name: 'Psionic Sorcery', edition: '2024', from: 6, kind: 'info', page: P24,
    note: (c) => `Cast your Psionic Spells with sorcery points instead of a slot (points equal to the spell's level), needing no verbal or somatic components.${c.level >= 14 ? ' Revelation in Flesh: spend sorcery points for flying, swimming, seeing the invisible or squeezing through gaps.' : ''}`,
  },
  {
    id: 'warping_implosion', class: 'sorcerer', sc: 'aberrant', name: 'Warping Implosion', edition: '2024', from: 18, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: (c) => `Teleport 120 feet; creatures within 30 feet of where you left make a Strength save (DC ${8 + c.pb + c.mod('cha')}) or take 3d10 force damage and are pulled in. Spend 5 sorcery points to get it back.`,
  },
  {
    id: 'restore_balance', class: 'sorcerer', sc: 'clockwork', name: 'Restore Balance', edition: '2024', from: 3, kind: 'uses', recharge: 'long', page: P24,
    max: (c) => atLeast1(c.mod('cha')),
    note: (c) => `A reaction: cancel advantage or disadvantage on a d20 test within 60 feet.${c.level >= 6 ? ' Bastion of Law: spend 1 to 5 sorcery points for a ward of that many d6s that soaks damage.' : ''}`,
  },
  {
    id: 'trance_of_order', class: 'sorcerer', sc: 'clockwork', name: 'Trance of Order', edition: '2024', from: 14, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: () => 'A bonus action for 1 minute: attacks against you can\'t have advantage, and your d20 rolls under 10 count as 10. Spend 5 sorcery points to get it back.',
  },
  {
    id: 'clockwork_cavalcade', class: 'sorcerer', sc: 'clockwork', name: 'Clockwork Cavalcade', edition: '2024', from: 18, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: () => 'An action: restore 100 hit points among creatures in a 30-foot cube, repair objects, and end spells of 6th level or lower there. Spend 7 sorcery points to get it back.',
  },

  // ---------- Warlock ----------
  {
    id: 'fey_presence', class: 'warlock', sc: 'archfey', name: 'Fey Presence', edition: '2014', from: 1, kind: 'uses', max: () => 1, recharge: 'short', page: P14(109),
    note: (c) => `An action: creatures in a 10-foot cube from you make a Wisdom save (DC ${8 + c.pb + c.mod('cha')}) or are charmed or frightened until the end of your next turn.`,
  },
  {
    id: 'steps_of_the_fey', class: 'warlock', sc: 'archfey', name: 'Steps of the Fey', edition: '2024', from: 3, kind: 'uses', recharge: 'long', page: P24,
    max: (c) => atLeast1(c.mod('cha')),
    note: () => 'Cast Misty Step without a slot, with a refreshing step (1d10 temporary hit points) or a taunting step (disadvantage on attacks for nearby creatures).',
  },
  {
    id: 'misty_escape', class: 'warlock', sc: 'archfey', name: 'Misty Escape', from: 6, page: both(109),
    kind: (c) => (c.edition === '2024' ? 'info' : 'uses'), max: () => 1, recharge: 'short',
    note: (c) => (c.edition === '2024'
      ? 'A reaction when you take damage: cast Misty Step (from Steps of the Fey), and you can turn invisible or deal 2d10 psychic damage when you leave.'
      : 'A reaction when you take damage: turn invisible and teleport 60 feet; you stay invisible until the start of your next turn or you attack or cast a spell.'),
  },
  {
    id: 'beguiling_defenses', class: 'warlock', sc: 'archfey', name: 'Beguiling Defenses', from: 10, page: both(109),
    kind: (c) => (c.edition === '2024' ? 'uses' : 'info'), max: () => 1, recharge: 'long',
    note: (c) => (c.edition === '2024'
      ? 'Immune to being charmed. A reaction when hit: half the damage, and the attacker takes the other half as psychic damage (Wisdom save). Spend a Pact Magic slot to get it back.'
      : 'Immune to being charmed. A reaction when someone tries to charm you: turn it back on them (Wisdom save).'),
  },
  {
    id: 'dark_delirium', class: 'warlock', sc: 'archfey', name: 'Dark Delirium', edition: '2014', from: 14, kind: 'uses', max: () => 1, recharge: 'short', page: P14(109),
    note: (c) => `An action: a creature within 60 feet makes a Wisdom save (DC ${8 + c.pb + c.mod('cha')}) or is charmed or frightened for 1 minute, lost in an illusory realm.`,
  },
  {
    id: 'dark_ones_blessing', class: 'warlock', sc: 'fiend', name: "Dark One's Blessing", from: (c) => (c.edition === '2024' ? 3 : 1), kind: 'info', page: both(109),
    note: (c) => `When you drop a hostile creature to 0 hit points${c.edition === '2024' ? ' (or someone within 10 feet of you does)' : ''}: gain ${atLeast1(c.mod('cha') + c.level)} temporary hit points.`,
  },
  {
    id: 'dark_ones_own_luck', class: 'warlock', sc: 'fiend', name: "Dark One's Own Luck", from: 6, kind: 'uses', page: both(109),
    max: (c) => (c.edition === '2024' ? atLeast1(c.mod('cha')) : 1),
    recharge: (c) => (c.edition === '2024' ? 'long' : 'short'),
    note: () => 'Add a d10 to an ability check or saving throw (after seeing the roll, before the result).',
  },
  {
    id: 'hurl_through_hell', class: 'warlock', sc: 'fiend', name: 'Hurl Through Hell', from: 14, kind: 'uses', max: () => 1, recharge: 'long', page: both(109),
    note: (c) => `When you hit a creature: it vanishes through the lower planes until the end of your next turn and takes 10d10 psychic damage${c.edition === '2024' ? ` (Charisma save, DC ${8 + c.pb + c.mod('cha')}). Spend a Pact Magic slot to get it back` : ' if it isn\'t a fiend'}.`,
  },
  {
    id: 'entropic_ward', class: 'warlock', sc: 'great_old_one', name: (c) => (c.edition === '2024' ? 'Clairvoyant Combatant' : 'Entropic Ward'), from: 6, kind: 'uses', max: () => 1, recharge: 'short', page: both(110),
    note: (c) => (c.edition === '2024'
      ? `With Awakened Mind: a creature makes a Wisdom save (DC ${8 + c.pb + c.mod('cha')}) or you have advantage on attacks against it and it has disadvantage against you. Spend a Pact Magic slot to get it back.`
      : 'A reaction: an attack against you has disadvantage; if it misses, your next attack against it has advantage.'),
  },
  {
    id: 'healing_light', class: 'warlock', sc: 'celestial', name: 'Healing Light', edition: '2024', from: 3, kind: 'pool', recharge: 'long', page: P24,
    max: (c) => 1 + c.level,
    note: (c) => `A pool of d6s: a bonus action to spend up to ${atLeast1(c.mod('cha'))} and heal a creature within 60 feet that much.${c.level >= 6 ? ` Radiant Soul: +${c.mod('cha')} to one fire or radiant damage roll of your spells.` : ''}`,
  },
  {
    id: 'searing_vengeance', class: 'warlock', sc: 'celestial', name: 'Searing Vengeance', edition: '2024', from: 14, kind: 'uses', max: () => 1, recharge: 'long', page: P24,
    note: (c) => `On a death save, regain ${Math.floor(c.level / 2)} hit points instead and stand up; enemies within 30 feet take 2d8 + ${c.mod('cha')} radiant damage and are blinded.`,
  },

  // ---------- Wizard ----------
  {
    id: 'arcane_ward', class: 'wizard', sc: 'abjuration', name: 'Arcane Ward', from: (c) => (c.edition === '2024' ? 3 : 2), kind: 'pool', recharge: 'long', page: both(115),
    max: (c) => 2 * c.level + c.mod('int'),
    note: (c) => `A ward of hit points that takes damage for you, made when you cast an abjuration spell of 1st level or higher (once per long rest). Casting another gives it back 2 × the spell's level${c.edition === '2024' ? ', and so does spending a slot as a bonus action' : ''}.${c.level >= 6 ? ' Projected Ward: a reaction to have it take damage for a creature within 30 feet.' : ''}`,
  },
  {
    id: 'benign_transposition', class: 'wizard', sc: 'conjuration', name: 'Benign Transposition', edition: '2014', from: 6, kind: 'uses', max: () => 1, recharge: 'long', page: P14(116),
    note: () => 'An action: teleport 30 feet, or swap places with a willing Small or Medium creature. Casting a conjuration spell of 1st level or higher gives it back.',
  },
  {
    id: 'portent', class: 'wizard', sc: 'divination', name: 'Portent', from: (c) => (c.edition === '2024' ? 3 : 2), kind: 'info', page: both(116),
    action: 'portent', dice: (c) => (c.level >= 14 ? 3 : 2),
    note: (c) => `After a long rest, roll ${c.level >= 14 ? 'three' : 'two'} d20s and keep the numbers: put one in place of any attack roll, save or ability check you can see, before it's rolled. A long rest clears unused ones.${c.level >= 6 ? ' Expert Divination: casting a divination spell of 2nd level or higher gives back a lower-level slot.' : ''}`,
  },
  {
    id: 'the_third_eye', class: 'wizard', sc: 'divination', name: 'The Third Eye', from: 10, kind: 'uses', max: () => 1, recharge: 'short', page: both(117),
    note: () => 'An action: darkvision 60 feet, see into the Ethereal Plane, read any language, or see the invisible within 10 feet, until you rest or are incapacitated.',
  },
  {
    id: 'hypnotic_gaze', class: 'wizard', sc: 'enchantment', name: 'Hypnotic Gaze', edition: '2014', from: 2, kind: 'info', page: P14(117),
    note: (c) => `An action: a creature within 5 feet makes a Wisdom save (DC ${8 + c.pb + c.mod('int')}) or is charmed and incapacitated while you keep it up.${c.level >= 6 ? ' Instinctive Charm: a reaction to turn an attack on you to another creature (once per long rest against the same creature if it saves).' : ''}`,
  },
  {
    id: 'sculpt_spells', class: 'wizard', sc: 'evocation', name: 'Sculpt Spells', from: (c) => (c.edition === '2024' ? 3 : 2), kind: 'info', page: both(117),
    note: (c) => `Up to 1 + a spell's level creatures you choose succeed on its save and take no damage.${c.level >= 6 ? ' Potent Cantrip: half damage from your cantrips when they miss or are saved against.' : ''}${c.level >= 10 ? ` Empowered Evocation: +${c.mod('int')} to one damage roll of a wizard evocation spell.` : ''}`,
  },
  {
    id: 'overchannel', class: 'wizard', sc: 'evocation', name: 'Overchannel', from: 14, kind: 'uses', max: () => 1, recharge: 'long', page: both(118),
    note: () => 'Deal the most damage the dice can roll with a 1st- to 5th-level wizard spell. Using it again before a long rest costs 2d12 necrotic damage per spell level (1d12 more each time) that can\'t be reduced.',
  },
  {
    id: 'illusory_self', class: 'wizard', sc: 'illusion', name: 'Illusory Self', from: 10, kind: 'uses', max: () => 1, recharge: 'short', page: both(118),
    note: (c) => `A reaction: an attack against you misses automatically.${c.edition === '2024' ? ' Spend a 2nd-level or higher slot to get it back.' : ''}`,
  },
  {
    id: 'grim_harvest', class: 'wizard', sc: 'necromancy', name: 'Grim Harvest', edition: '2014', from: 2, kind: 'info', page: P14(118),
    note: () => 'When a spell of 1st level or higher kills a creature (not a construct or undead), regain 2 × the spell\'s level hit points (3 × for necromancy spells).',
  },
  {
    id: 'shapechanger', class: 'wizard', sc: 'transmutation', name: 'Shapechanger', edition: '2014', from: 10, kind: 'uses', max: () => 1, recharge: 'short', page: P14(119),
    note: () => 'Cast Polymorph on yourself without a slot, into a beast of challenge 1 or lower.',
  },

  // ---------- Other books (subclass-features-books.js) ----------
  ...BOOK_SUBCLASS_FEATURES,
];
