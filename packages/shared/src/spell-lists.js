/**
 * The Player's Handbook (2014) spells that aren't in the SRD 5.1, by level, school and the classes whose
 * lists have them (names and lists only: their text comes from the group's books or the AI, through the
 * server's spell lookup). With the SRD's own lists (server/src/sheets/srd-spells.json) every class has its
 * whole PHB list in the character builder's Spells step; spells from other books are found by name there.
 */
const ROWS = [
  ['Blade Ward', 0, 'Abjuration', 'bard sorcerer warlock wizard'],
  ['Friends', 0, 'Enchantment', 'bard sorcerer warlock wizard'],
  ['Thorn Whip', 0, 'Transmutation', 'druid'],
  ['Armor of Agathys', 1, 'Abjuration', 'warlock'],
  ['Arms of Hadar', 1, 'Conjuration', 'warlock'],
  ['Chromatic Orb', 1, 'Evocation', 'sorcerer wizard'],
  ['Compelled Duel', 1, 'Enchantment', 'paladin'],
  ['Dissonant Whispers', 1, 'Enchantment', 'bard'],
  ['Ensnaring Strike', 1, 'Conjuration', 'ranger'],
  ['Hail of Thorns', 1, 'Conjuration', 'ranger'],
  ['Hex', 1, 'Enchantment', 'warlock'],
  ['Searing Smite', 1, 'Evocation', 'paladin'],
  ['Thunderous Smite', 1, 'Evocation', 'paladin'],
  ['Witch Bolt', 1, 'Evocation', 'sorcerer warlock wizard'],
  ['Wrathful Smite', 1, 'Evocation', 'paladin'],
  ['Beast Sense', 2, 'Divination', 'druid ranger'],
  ['Cloud of Daggers', 2, 'Conjuration', 'bard sorcerer warlock wizard'],
  ['Cordon of Arrows', 2, 'Transmutation', 'ranger'],
  ['Crown of Madness', 2, 'Enchantment', 'bard sorcerer warlock wizard'],
  ['Phantasmal Force', 2, 'Illusion', 'bard sorcerer wizard'],
  ['Aura of Vitality', 3, 'Evocation', 'paladin'],
  ['Blinding Smite', 3, 'Evocation', 'paladin'],
  ['Conjure Barrage', 3, 'Conjuration', 'ranger'],
  ["Crusader's Mantle", 3, 'Evocation', 'paladin'],
  ['Elemental Weapon', 3, 'Transmutation', 'paladin'],
  ['Feign Death', 3, 'Necromancy', 'bard cleric druid wizard'],
  ['Hunger of Hadar', 3, 'Conjuration', 'warlock'],
  ['Lightning Arrow', 3, 'Transmutation', 'ranger'],
  ['Aura of Life', 4, 'Abjuration', 'paladin'],
  ['Aura of Purity', 4, 'Abjuration', 'paladin'],
  ['Grasping Vine', 4, 'Conjuration', 'druid ranger'],
  ['Staggering Smite', 4, 'Evocation', 'paladin'],
  ['Banishing Smite', 5, 'Abjuration', 'paladin'],
  ['Circle of Power', 5, 'Abjuration', 'paladin'],
  ['Conjure Volley', 5, 'Conjuration', 'ranger'],
  ['Destructive Wave', 5, 'Evocation', 'paladin'],
  ['Swift Quiver', 5, 'Transmutation', 'ranger'],
  ['Telepathy', 8, 'Evocation', 'wizard'],
  ['Tsunami', 8, 'Conjuration', 'druid'],
  ['Power Word Heal', 9, 'Evocation', 'bard'],
];

/** [{ name, level, school, classes: ['Bard', …] }] */
export const PHB_EXTRA_SPELLS = ROWS.map(([name, level, school, classes]) => ({
  name, level, school, classes: classes.split(' ').map((c) => c[0].toUpperCase() + c.slice(1)),
}));
