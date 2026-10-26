/**
 * Help making a character (SPEC §6.4 "Help making a character"): what a
 * class, a race or species and a background give, and what the player
 * chooses, by the campaign's rules edition. The sheet's Help panel shows it
 * (web/public/sheet-help.js) and can tick the chosen skills and saves; it is
 * never forced and never changes anything by itself.
 *
 * Classes: the Player's Handbook 2014 and 2024 (the artificer from Tasha's,
 * for either), checked against the owner's PDFs. Short summaries in our own
 * words: names, numbers and choices, not the books' text.
 * Races: the 2014 PHB's races (their ability increases come from
 * point-buy.js) and the 2024 PHB's species. Backgrounds: backgrounds.js.
 *
 * Plain JS: the server and the page load the same file.
 */
import { CLASSES, SKILLS, ABILITY_NAMES } from './sheet.js';
import { raceBonuses2014 } from './point-buy.js';

const sk = (...names) => names.map((n) => n.toLowerCase().replace(/ /g, '_'));
const ALL_SKILLS = Object.keys(SKILLS);
/** Hit points each level after the first, taking the fixed value: half the die, rounded up. */
export const FIXED_HP = { 6: 4, 8: 5, 10: 6, 12: 7 };

/**
 * Each level's features: "Name; Name (a choice: …)". "ASI" is an Ability
 * Score Improvement (or a feat, if the DM allows feats in 2014; in 2024 the
 * feat is the rule, the improvement one of the feats).
 */
const levels = (o) => Object.fromEntries(Object.entries(o).map(([l, s]) => [Number(l), s.split('; ')]));

const C2014 = {
  artificer: {
    armor: 'Light and medium armour, shields', weapons: 'Simple weapons', tools: "Thieves' tools, tinker's tools, one type of artisan's tools of your choice",
    skills: { choose: 2, from: sk('Arcana', 'History', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Sleight of Hand') },
    equipment: ['Any two simple weapons', 'A light crossbow and 20 bolts', '(a) studded leather armour or (b) scale mail', "Thieves' tools and a dungeoneer's pack"],
    spells: 'Intelligence. 2 cantrips; prepare Intelligence modifier + half your artificer level (at least 1) from the artificer list; you need tools as your focus. Half caster, slots from level 1.',
    book: "Tasha's Cauldron of Everything",
    features: levels({ 1: 'Magical Tinkering; Spellcasting', 2: 'Infuse Item (choose 4 infusions to know, 2 active)', 3: 'Artificer Specialist (choose: Alchemist, Armorer, Artillerist or Battle Smith); The Right Tool for the Job', 4: 'ASI', 5: 'Specialist feature', 6: 'Tool Expertise; more infusions', 7: 'Flash of Genius', 8: 'ASI', 9: 'Specialist feature', 10: 'Magic Item Adept', 11: 'Spell-Storing Item', 12: 'ASI', 14: 'Magic Item Savant', 15: 'Specialist feature', 16: 'ASI', 18: 'Magic Item Master', 19: 'ASI', 20: 'Soul of Artifice' }),
  },
  barbarian: {
    armor: 'Light and medium armour, shields', weapons: 'Simple and martial weapons', tools: '',
    skills: { choose: 2, from: sk('Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival') },
    equipment: ['(a) a greataxe or (b) any martial melee weapon', '(a) two handaxes or (b) any simple weapon', "An explorer's pack and four javelins"],
    features: levels({ 1: 'Rage; Unarmored Defense', 2: 'Reckless Attack; Danger Sense', 3: 'Primal Path (choose: Berserker or Totem Warrior)', 4: 'ASI', 5: 'Extra Attack; Fast Movement', 6: 'Path feature', 7: 'Feral Instinct', 8: 'ASI', 9: 'Brutal Critical (1 die)', 10: 'Path feature', 11: 'Relentless Rage', 12: 'ASI', 13: 'Brutal Critical (2 dice)', 14: 'Path feature', 15: 'Persistent Rage', 16: 'ASI', 17: 'Brutal Critical (3 dice)', 18: 'Indomitable Might', 19: 'ASI', 20: 'Primal Champion' }),
  },
  bard: {
    armor: 'Light armour', weapons: 'Simple weapons, hand crossbows, longswords, rapiers, shortswords', tools: 'Three musical instruments of your choice',
    skills: { choose: 3, from: ALL_SKILLS },
    equipment: ['(a) a rapier, (b) a longsword or (c) any simple weapon', "(a) a diplomat's pack or (b) an entertainer's pack", '(a) a lute or (b) any other musical instrument', 'Leather armour and a dagger'],
    spells: 'Charisma. 2 cantrips and 4 spells known from the bard list; 2 first-level slots; rituals; a musical instrument as your focus.',
    features: levels({ 1: 'Spellcasting; Bardic Inspiration (d6)', 2: 'Jack of All Trades; Song of Rest (d6)', 3: 'Bard College (choose: Lore or Valor); Expertise (choose two skills)', 4: 'ASI', 5: 'Bardic Inspiration (d8); Font of Inspiration', 6: 'Countercharm; College feature', 8: 'ASI', 9: 'Song of Rest (d8)', 10: 'Bardic Inspiration (d10); Expertise (two more skills); Magical Secrets (two spells from any list)', 12: 'ASI', 13: 'Song of Rest (d10)', 14: 'Magical Secrets; College feature', 15: 'Bardic Inspiration (d12)', 16: 'ASI', 17: 'Song of Rest (d12)', 18: 'Magical Secrets', 19: 'ASI', 20: 'Superior Inspiration' }),
  },
  cleric: {
    armor: 'Light and medium armour, shields', weapons: 'Simple weapons', tools: '',
    skills: { choose: 2, from: sk('History', 'Insight', 'Medicine', 'Persuasion', 'Religion') },
    equipment: ['(a) a mace or (b) a warhammer (if proficient)', '(a) scale mail, (b) leather armour or (c) chain mail (if proficient)', '(a) a light crossbow and 20 bolts or (b) any simple weapon', "(a) a priest's pack or (b) an explorer's pack", 'A shield and a holy symbol'],
    spells: 'Wisdom. 3 cantrips; prepare Wisdom modifier + cleric level from the whole cleric list each day; 2 first-level slots; rituals; a holy symbol as your focus.',
    features: levels({ 1: 'Spellcasting; Divine Domain (choose: Knowledge, Life, Light, Nature, Tempest, Trickery or War; it gives domain spells and a feature)', 2: 'Channel Divinity (1 per rest); Domain feature', 4: 'ASI', 5: 'Destroy Undead (CR 1/2)', 6: 'Channel Divinity (2 per rest); Domain feature', 8: 'ASI; Destroy Undead (CR 1); Domain feature', 10: 'Divine Intervention', 11: 'Destroy Undead (CR 2)', 12: 'ASI', 14: 'Destroy Undead (CR 3)', 16: 'ASI', 17: 'Destroy Undead (CR 4); Domain feature', 18: 'Channel Divinity (3 per rest)', 19: 'ASI', 20: 'Divine Intervention improvement' }),
  },
  druid: {
    armor: 'Light and medium armour, shields (druids won\'t wear metal armour or use metal shields)', weapons: 'Clubs, daggers, darts, javelins, maces, quarterstaffs, scimitars, sickles, slings, spears', tools: 'Herbalism kit',
    skills: { choose: 2, from: sk('Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival') },
    equipment: ['(a) a wooden shield or (b) any simple weapon', '(a) a scimitar or (b) any simple melee weapon', "Leather armour, an explorer's pack and a druidic focus"],
    spells: 'Wisdom. 2 cantrips; prepare Wisdom modifier + druid level from the whole druid list each day; 2 first-level slots; rituals; a druidic focus.',
    features: levels({ 1: 'Druidic; Spellcasting', 2: 'Wild Shape; Druid Circle (choose: Land or Moon)', 4: 'Wild Shape improvement; ASI', 6: 'Circle feature', 8: 'Wild Shape improvement; ASI', 10: 'Circle feature', 12: 'ASI', 14: 'Circle feature', 16: 'ASI', 18: 'Timeless Body; Beast Spells', 19: 'ASI', 20: 'Archdruid' }),
  },
  fighter: {
    armor: 'All armour, shields', weapons: 'Simple and martial weapons', tools: '',
    skills: { choose: 2, from: sk('Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival') },
    equipment: ['(a) chain mail or (b) leather armour, a longbow and 20 arrows', '(a) a martial weapon and a shield or (b) two martial weapons', '(a) a light crossbow and 20 bolts or (b) two handaxes', "(a) a dungeoneer's pack or (b) an explorer's pack"],
    features: levels({ 1: 'Fighting Style (choose: Archery, Defense, Dueling, Great Weapon Fighting, Protection or Two-Weapon Fighting); Second Wind', 2: 'Action Surge (one use)', 3: 'Martial Archetype (choose: Champion, Battle Master or Eldritch Knight)', 4: 'ASI', 5: 'Extra Attack', 6: 'ASI', 7: 'Archetype feature', 8: 'ASI', 9: 'Indomitable (one use)', 10: 'Archetype feature', 11: 'Extra Attack (2)', 12: 'ASI', 13: 'Indomitable (two uses)', 14: 'ASI', 15: 'Archetype feature', 16: 'ASI', 17: 'Action Surge (two uses); Indomitable (three uses)', 18: 'Archetype feature', 19: 'ASI', 20: 'Extra Attack (3)' }),
  },
  monk: {
    armor: 'None', weapons: 'Simple weapons, shortswords', tools: "One type of artisan's tools or one musical instrument",
    skills: { choose: 2, from: sk('Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth') },
    equipment: ['(a) a shortsword or (b) any simple weapon', "(a) a dungeoneer's pack or (b) an explorer's pack", '10 darts'],
    features: levels({ 1: 'Unarmored Defense; Martial Arts', 2: 'Ki; Unarmored Movement', 3: 'Monastic Tradition (choose: Open Hand, Shadow or Four Elements); Deflect Missiles', 4: 'ASI; Slow Fall', 5: 'Extra Attack; Stunning Strike', 6: 'Ki-Empowered Strikes; Tradition feature', 7: 'Evasion; Stillness of Mind', 8: 'ASI', 9: 'Unarmored Movement improvement', 10: 'Purity of Body', 11: 'Tradition feature', 12: 'ASI', 13: 'Tongue of the Sun and Moon', 14: 'Diamond Soul', 15: 'Timeless Body', 16: 'ASI', 17: 'Tradition feature', 18: 'Empty Body', 19: 'ASI', 20: 'Perfect Self' }),
  },
  paladin: {
    armor: 'All armour, shields', weapons: 'Simple and martial weapons', tools: '',
    skills: { choose: 2, from: sk('Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion') },
    equipment: ['(a) a martial weapon and a shield or (b) two martial weapons', '(a) five javelins or (b) any simple melee weapon', "(a) a priest's pack or (b) an explorer's pack", 'Chain mail and a holy symbol'],
    spells: 'Charisma, from level 2. Prepare Charisma modifier + half your paladin level (at least 1) from the paladin list; a holy symbol as your focus.',
    features: levels({ 1: 'Divine Sense; Lay on Hands', 2: 'Fighting Style (choose: Defense, Dueling, Great Weapon Fighting or Protection); Spellcasting; Divine Smite', 3: 'Divine Health; Sacred Oath (choose: Devotion, Ancients or Vengeance)', 4: 'ASI', 5: 'Extra Attack', 6: 'Aura of Protection', 7: 'Oath feature', 8: 'ASI', 10: 'Aura of Courage', 11: 'Improved Divine Smite', 12: 'ASI', 14: 'Cleansing Touch', 15: 'Oath feature', 16: 'ASI', 18: 'Aura improvements (30 ft)', 19: 'ASI', 20: 'Oath feature' }),
  },
  ranger: {
    armor: 'Light and medium armour, shields', weapons: 'Simple and martial weapons', tools: '',
    skills: { choose: 3, from: sk('Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival') },
    equipment: ['(a) scale mail or (b) leather armour', '(a) two shortswords or (b) two simple melee weapons', "(a) a dungeoneer's pack or (b) an explorer's pack", 'A longbow and a quiver of 20 arrows'],
    spells: 'Wisdom, from level 2. 2 spells known from the ranger list, more as you level.',
    features: levels({ 1: 'Favored Enemy (choose a type of enemy, and a language they speak); Natural Explorer (choose a favoured terrain)', 2: 'Fighting Style (choose: Archery, Defense, Dueling or Two-Weapon Fighting); Spellcasting', 3: 'Ranger Archetype (choose: Hunter or Beast Master); Primeval Awareness', 4: 'ASI', 5: 'Extra Attack', 6: 'Favored Enemy and Natural Explorer improvements', 7: 'Archetype feature', 8: 'ASI; Land\'s Stride', 10: 'Natural Explorer improvement; Hide in Plain Sight', 11: 'Archetype feature', 12: 'ASI', 14: 'Favored Enemy improvement; Vanish', 15: 'Archetype feature', 16: 'ASI', 18: 'Feral Senses', 19: 'ASI', 20: 'Foe Slayer' }),
  },
  rogue: {
    armor: 'Light armour', weapons: 'Simple weapons, hand crossbows, longswords, rapiers, shortswords', tools: "Thieves' tools",
    skills: { choose: 4, from: sk('Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth') },
    equipment: ['(a) a rapier or (b) a shortsword', '(a) a shortbow and a quiver of 20 arrows or (b) a shortsword', "(a) a burglar's pack, (b) a dungeoneer's pack or (c) an explorer's pack", "Leather armour, two daggers and thieves' tools"],
    features: levels({ 1: "Expertise (choose two of your skills, or one and thieves' tools); Sneak Attack (1d6); Thieves' Cant", 2: 'Cunning Action', 3: 'Roguish Archetype (choose: Thief, Assassin or Arcane Trickster); Sneak Attack 2d6', 4: 'ASI', 5: 'Uncanny Dodge; Sneak Attack 3d6', 6: 'Expertise (two more)', 7: 'Evasion; Sneak Attack 4d6', 8: 'ASI', 9: 'Archetype feature; Sneak Attack 5d6', 10: 'ASI', 11: 'Reliable Talent; Sneak Attack 6d6', 12: 'ASI', 13: 'Archetype feature; Sneak Attack 7d6', 14: 'Blindsense', 15: 'Slippery Mind; Sneak Attack 8d6', 16: 'ASI', 17: 'Archetype feature; Sneak Attack 9d6', 18: 'Elusive', 19: 'ASI; Sneak Attack 10d6', 20: 'Stroke of Luck' }),
  },
  sorcerer: {
    armor: 'None', weapons: 'Daggers, darts, slings, quarterstaffs, light crossbows', tools: '',
    skills: { choose: 2, from: sk('Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion') },
    equipment: ['(a) a light crossbow and 20 bolts or (b) any simple weapon', '(a) a component pouch or (b) an arcane focus', "(a) a dungeoneer's pack or (b) an explorer's pack", 'Two daggers'],
    spells: 'Charisma. 4 cantrips and 2 spells known from the sorcerer list; 2 first-level slots; an arcane focus.',
    features: levels({ 1: 'Spellcasting; Sorcerous Origin (choose: Draconic Bloodline or Wild Magic)', 2: 'Font of Magic (sorcery points)', 3: 'Metamagic (choose two options)', 4: 'ASI', 6: 'Origin feature', 8: 'ASI', 10: 'Metamagic (one more)', 12: 'ASI', 14: 'Origin feature', 16: 'ASI', 17: 'Metamagic (one more)', 18: 'Origin feature', 19: 'ASI', 20: 'Sorcerous Restoration' }),
  },
  warlock: {
    armor: 'Light armour', weapons: 'Simple weapons', tools: '',
    skills: { choose: 2, from: sk('Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion') },
    equipment: ['(a) a light crossbow and 20 bolts or (b) any simple weapon', '(a) a component pouch or (b) an arcane focus', "(a) a scholar's pack or (b) a dungeoneer's pack", 'Leather armour, any simple weapon and two daggers'],
    spells: 'Charisma, Pact Magic. 2 cantrips and 2 spells known from the warlock list; 1 slot that comes back on a short rest (2 from level 2); an arcane focus.',
    features: levels({ 1: 'Otherworldly Patron (choose: Archfey, Fiend or Great Old One); Pact Magic', 2: 'Eldritch Invocations (choose two)', 3: 'Pact Boon (choose: Chain, Blade or Tome)', 4: 'ASI', 6: 'Patron feature', 8: 'ASI', 10: 'Patron feature', 11: 'Mystic Arcanum (6th level)', 12: 'ASI', 13: 'Mystic Arcanum (7th level)', 14: 'Patron feature', 15: 'Mystic Arcanum (8th level)', 16: 'ASI', 17: 'Mystic Arcanum (9th level)', 19: 'ASI', 20: 'Eldritch Master' }),
  },
  wizard: {
    armor: 'None', weapons: 'Daggers, darts, slings, quarterstaffs, light crossbows', tools: '',
    skills: { choose: 2, from: sk('Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion') },
    equipment: ['(a) a quarterstaff or (b) a dagger', '(a) a component pouch or (b) an arcane focus', "(a) a scholar's pack or (b) an explorer's pack", 'A spellbook'],
    spells: 'Intelligence. 3 cantrips; a spellbook with six 1st-level wizard spells (two more each level); prepare Intelligence modifier + wizard level from it each day; 2 first-level slots; rituals from the book.',
    features: levels({ 1: 'Spellcasting; Arcane Recovery', 2: 'Arcane Tradition (choose a school: Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy or Transmutation)', 4: 'ASI', 6: 'Tradition feature', 8: 'ASI', 10: 'Tradition feature', 12: 'ASI', 14: 'Tradition feature', 16: 'ASI', 18: 'Spell Mastery', 19: 'ASI', 20: 'Signature Spells' }),
  },
};

const C2024 = {
  artificer: C2014.artificer,
  barbarian: {
    armor: 'Light and medium armour, shields', weapons: 'Simple and martial weapons', tools: '', mastery: 2,
    skills: { choose: 2, from: sk('Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival') },
    equipment: ["(A) Greataxe, 4 Handaxes, Explorer's Pack, 15 GP; or (B) 75 GP"],
    features: levels({ 1: 'Rage; Unarmored Defense; Weapon Mastery (choose 2 kinds of weapon)', 2: 'Danger Sense; Reckless Attack', 3: 'Barbarian Subclass (choose: Berserker, Wild Heart, World Tree or Zealot); Primal Knowledge (one more skill from the class list)', 4: 'ASI', 5: 'Extra Attack; Fast Movement', 6: 'Subclass feature', 7: 'Feral Instinct; Instinctive Pounce', 8: 'ASI', 9: 'Brutal Strike', 10: 'Subclass feature', 11: 'Relentless Rage', 12: 'ASI', 13: 'Improved Brutal Strike', 14: 'Subclass feature', 15: 'Persistent Rage', 16: 'ASI', 17: 'Improved Brutal Strike', 18: 'Indomitable Might', 19: 'Epic Boon (choose an Epic Boon feat)', 20: 'Primal Champion' }),
  },
  bard: {
    armor: 'Light armour', weapons: 'Simple weapons', tools: 'Three musical instruments of your choice',
    skills: { choose: 3, from: ALL_SKILLS },
    equipment: ["(A) Leather Armor, 2 Daggers, a Musical Instrument of your choice, Entertainer's Pack, 19 GP; or (B) 90 GP"],
    spells: 'Charisma. 2 cantrips; 4 prepared spells from the bard list; 2 level 1 slots; a musical instrument as your focus.',
    features: levels({ 1: 'Bardic Inspiration (d6); Spellcasting', 2: 'Expertise (choose two skills); Jack of All Trades', 3: 'Bard Subclass (choose: Dance, Glamour, Lore or Valor)', 4: 'ASI', 5: 'Font of Inspiration; Bardic Inspiration d8', 6: 'Subclass feature', 7: 'Countercharm', 8: 'ASI', 9: 'Expertise (two more)', 10: 'Magical Secrets; Bardic Inspiration d10', 12: 'ASI', 14: 'Subclass feature', 15: 'Bardic Inspiration d12', 16: 'ASI', 18: 'Superior Inspiration', 19: 'Epic Boon', 20: 'Words of Creation' }),
  },
  cleric: {
    armor: 'Light and medium armour, shields', weapons: 'Simple weapons', tools: '',
    skills: { choose: 2, from: sk('History', 'Insight', 'Medicine', 'Persuasion', 'Religion') },
    equipment: ["(A) Chain Shirt, Shield, Mace, Holy Symbol, Priest's Pack, 7 GP; or (B) 110 GP"],
    spells: 'Wisdom. 3 cantrips; 4 prepared spells from the cleric list (changed after a long rest); 2 level 1 slots; a holy symbol as your focus.',
    features: levels({ 1: 'Spellcasting; Divine Order (choose: Protector, for martial weapons and heavy armour, or Thaumaturge, for a cantrip and Arcana or Religion)', 2: 'Channel Divinity', 3: 'Cleric Subclass (choose: Life, Light, Trickery or War Domain)', 4: 'ASI', 5: 'Sear Undead', 6: 'Subclass feature', 7: 'Blessed Strikes (choose: Divine Strike or Potent Spellcasting)', 8: 'ASI', 10: 'Divine Intervention', 12: 'ASI', 14: 'Improved Blessed Strikes', 16: 'ASI', 17: 'Subclass feature', 19: 'Epic Boon', 20: 'Greater Divine Intervention' }),
  },
  druid: {
    armor: 'Light armour, shields', weapons: 'Simple weapons', tools: 'Herbalism kit',
    skills: { choose: 2, from: sk('Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival') },
    equipment: ["(A) Leather Armor, Shield, Sickle, Druidic Focus (Quarterstaff), Explorer's Pack, Herbalism Kit, 9 GP; or (B) 50 GP"],
    spells: 'Wisdom. 2 cantrips; 4 prepared spells from the druid list; 2 level 1 slots; a druidic focus.',
    features: levels({ 1: 'Spellcasting; Druidic; Primal Order (choose: Magician, for a cantrip and Arcana or Nature, or Warden, for martial weapons and medium armour)', 2: 'Wild Shape; Wild Companion', 3: 'Druid Subclass (choose: Land, Moon, Sea or Stars)', 4: 'ASI', 5: 'Wild Resurgence', 6: 'Subclass feature', 7: 'Elemental Fury (choose: Potent Spellcasting or Primal Strike)', 8: 'ASI', 10: 'Subclass feature', 12: 'ASI', 14: 'Subclass feature', 15: 'Improved Elemental Fury', 16: 'ASI', 18: 'Beast Spells', 19: 'Epic Boon', 20: 'Archdruid' }),
  },
  fighter: {
    armor: 'Light, medium and heavy armour, shields', weapons: 'Simple and martial weapons', tools: '', mastery: 3,
    skills: { choose: 2, from: sk('Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Persuasion', 'Perception', 'Survival') },
    equipment: ["(A) Chain Mail, Greatsword, Flail, 8 Javelins, Dungeoneer's Pack, 4 GP; (B) Studded Leather Armor, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Dungeoneer's Pack, 11 GP; or (C) 155 GP"],
    features: levels({ 1: 'Fighting Style (choose a Fighting Style feat); Second Wind; Weapon Mastery (choose 3 kinds of weapon)', 2: 'Action Surge; Tactical Mind', 3: 'Fighter Subclass (choose: Battle Master, Champion, Eldritch Knight or Psi Warrior)', 4: 'ASI', 5: 'Extra Attack; Tactical Shift', 6: 'ASI', 7: 'Subclass feature', 8: 'ASI', 9: 'Indomitable; Tactical Master', 10: 'Subclass feature', 11: 'Two Extra Attacks', 12: 'ASI', 13: 'Indomitable (two uses); Studied Attacks', 14: 'ASI', 15: 'Subclass feature', 16: 'ASI', 17: 'Action Surge (two uses); Indomitable (three uses)', 18: 'Subclass feature', 19: 'Epic Boon', 20: 'Three Extra Attacks' }),
  },
  monk: {
    armor: 'None', weapons: 'Simple weapons, and martial weapons that have the Light property', tools: "One type of artisan's tools or one musical instrument",
    skills: { choose: 2, from: sk('Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth') },
    equipment: ["(A) Spear, 5 Daggers, the artisan's tools or musical instrument chosen above, Explorer's Pack, 11 GP; or (B) 50 GP"],
    features: levels({ 1: 'Martial Arts; Unarmored Defense', 2: "Monk's Focus; Unarmored Movement; Uncanny Metabolism", 3: 'Deflect Attacks; Monk Subclass (choose: Mercy, Shadow, Elements or Open Hand)', 4: 'ASI; Slow Fall', 5: 'Extra Attack; Stunning Strike', 6: 'Empowered Strikes; Subclass feature', 7: 'Evasion', 8: 'ASI', 9: 'Acrobatic Movement', 10: 'Heightened Focus; Self-Restoration', 11: 'Subclass feature', 12: 'ASI', 13: 'Deflect Energy', 14: 'Disciplined Survivor', 15: 'Perfect Focus', 16: 'ASI', 17: 'Subclass feature', 18: 'Superior Defense', 19: 'Epic Boon', 20: 'Body and Mind' }),
  },
  paladin: {
    armor: 'Light, medium and heavy armour, shields', weapons: 'Simple and martial weapons', tools: '', mastery: 2,
    skills: { choose: 2, from: sk('Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion') },
    equipment: ["(A) Chain Mail, Shield, Longsword, 6 Javelins, Holy Symbol, Priest's Pack, 9 GP; or (B) 150 GP"],
    spells: 'Charisma, from level 1. 2 prepared spells from the paladin list; 2 level 1 slots; a holy symbol as your focus.',
    features: levels({ 1: 'Lay on Hands; Spellcasting; Weapon Mastery (choose 2 kinds of weapon)', 2: "Fighting Style (choose a Fighting Style feat, or Blessed Warrior); Paladin's Smite", 3: 'Channel Divinity; Paladin Subclass (choose: Devotion, Glory, Ancients or Vengeance)', 4: 'ASI', 5: 'Extra Attack; Faithful Steed', 6: 'Aura of Protection', 7: 'Subclass feature', 8: 'ASI', 9: 'Abjure Foes', 10: 'Aura of Courage', 11: 'Radiant Strikes', 12: 'ASI', 14: 'Restoring Touch', 15: 'Subclass feature', 16: 'ASI', 18: 'Aura Expansion', 19: 'Epic Boon', 20: 'Subclass feature' }),
  },
  ranger: {
    armor: 'Light and medium armour, shields', weapons: 'Simple and martial weapons', tools: '', mastery: 2,
    skills: { choose: 3, from: sk('Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival') },
    equipment: ["(A) Studded Leather Armor, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Druidic Focus (sprig of mistletoe), Explorer's Pack, 7 GP; or (B) 150 GP"],
    spells: 'Wisdom, from level 1. 2 prepared spells from the ranger list; 2 level 1 slots; Hunter\'s Mark always prepared (Favored Enemy).',
    features: levels({ 1: 'Spellcasting; Favored Enemy (Hunter\'s Mark without a slot); Weapon Mastery (choose 2 kinds of weapon)', 2: 'Deft Explorer (Expertise in one skill, two languages); Fighting Style (choose a Fighting Style feat, or Druidic Warrior)', 3: 'Ranger Subclass (choose: Beast Master, Fey Wanderer, Gloom Stalker or Hunter)', 4: 'ASI', 5: 'Extra Attack', 6: 'Roving', 7: 'Subclass feature', 8: 'ASI', 9: 'Expertise (two skills)', 10: 'Tireless', 11: 'Subclass feature', 12: 'ASI', 13: 'Relentless Hunter', 14: "Nature's Veil", 15: 'Subclass feature', 16: 'ASI', 17: 'Precise Hunter', 18: 'Feral Senses', 19: 'Epic Boon', 20: 'Foe Slayer' }),
  },
  rogue: {
    armor: 'Light armour', weapons: 'Simple weapons, and martial weapons that have the Finesse or Light property', tools: "Thieves' tools", mastery: 2,
    skills: { choose: 4, from: sk('Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Persuasion', 'Sleight of Hand', 'Stealth') },
    equipment: ["(A) Leather Armor, 2 Daggers, Shortsword, Shortbow, 20 Arrows, Quiver, Thieves' Tools, Burglar's Pack, 8 GP; or (B) 100 GP"],
    features: levels({ 1: "Expertise (choose two of your skills); Sneak Attack (1d6); Thieves' Cant (and one more language); Weapon Mastery (choose 2 kinds of weapon)", 2: 'Cunning Action', 3: 'Rogue Subclass (choose: Arcane Trickster, Assassin, Soulknife or Thief); Steady Aim; Sneak Attack 2d6', 4: 'ASI', 5: 'Cunning Strike; Uncanny Dodge; Sneak Attack 3d6', 6: 'Expertise (two more)', 7: 'Evasion; Reliable Talent; Sneak Attack 4d6', 8: 'ASI', 9: 'Subclass feature; Sneak Attack 5d6', 10: 'ASI', 11: 'Improved Cunning Strike; Sneak Attack 6d6', 12: 'ASI', 13: 'Subclass feature; Sneak Attack 7d6', 14: 'Devious Strikes', 15: 'Slippery Mind; Sneak Attack 8d6', 16: 'ASI', 17: 'Subclass feature; Sneak Attack 9d6', 18: 'Elusive', 19: 'Epic Boon; Sneak Attack 10d6', 20: 'Stroke of Luck' }),
  },
  sorcerer: {
    armor: 'None', weapons: 'Simple weapons', tools: '',
    skills: { choose: 2, from: sk('Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion') },
    equipment: ["(A) Spear, 2 Daggers, Arcane Focus (crystal), Dungeoneer's Pack, 28 GP; or (B) 50 GP"],
    spells: 'Charisma. 4 cantrips; 2 prepared spells from the sorcerer list; 2 level 1 slots; an arcane focus.',
    features: levels({ 1: 'Spellcasting; Innate Sorcery', 2: 'Font of Magic; Metamagic (choose two options)', 3: 'Sorcerer Subclass (choose: Aberrant, Clockwork, Draconic or Wild Magic)', 4: 'ASI', 5: 'Sorcerous Restoration', 6: 'Subclass feature', 7: 'Sorcery Incarnate', 8: 'ASI', 10: 'Metamagic (two more)', 12: 'ASI', 14: 'Subclass feature', 16: 'ASI', 17: 'Metamagic (two more)', 18: 'Subclass feature', 19: 'Epic Boon', 20: 'Arcane Apotheosis' }),
  },
  warlock: {
    armor: 'Light armour', weapons: 'Simple weapons', tools: '',
    skills: { choose: 2, from: sk('Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion') },
    equipment: ["(A) Leather Armor, Sickle, 2 Daggers, Arcane Focus (orb), Book (occult lore), Scholar's Pack, 15 GP; or (B) 100 GP"],
    spells: 'Charisma, Pact Magic. 2 cantrips; 2 prepared spells from the warlock list; 1 slot that comes back on a short rest (2 from level 2); an arcane focus.',
    features: levels({ 1: 'Eldritch Invocations (choose one, such as Pact of the Blade, Chain or Tome); Pact Magic', 2: 'Magical Cunning; Eldritch Invocations (three)', 3: 'Warlock Subclass (choose: Archfey, Celestial, Fiend or Great Old One Patron)', 4: 'ASI', 6: 'Subclass feature', 8: 'ASI', 9: 'Contact Patron', 10: 'Subclass feature', 11: 'Mystic Arcanum (level 6 spell)', 12: 'ASI', 13: 'Mystic Arcanum (level 7)', 14: 'Subclass feature', 15: 'Mystic Arcanum (level 8)', 16: 'ASI', 17: 'Mystic Arcanum (level 9)', 19: 'Epic Boon', 20: 'Eldritch Master' }),
  },
  wizard: {
    armor: 'None', weapons: 'Simple weapons', tools: '',
    skills: { choose: 2, from: sk('Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Nature', 'Religion') },
    equipment: ["(A) 2 Daggers, Arcane Focus (Quarterstaff), Robe, Spellbook, Scholar's Pack, 5 GP; or (B) 55 GP"],
    spells: 'Intelligence. 3 cantrips; a spellbook with six level 1 wizard spells (two more each level); 4 prepared spells from it; 2 level 1 slots; rituals from the book.',
    features: levels({ 1: 'Spellcasting; Ritual Adept; Arcane Recovery', 2: 'Scholar (Expertise in one of Arcana, History, Investigation, Medicine, Nature or Religion)', 3: 'Wizard Subclass (choose: Abjurer, Diviner, Evoker or Illusionist)', 4: 'ASI', 5: 'Memorize Spell', 6: 'Subclass feature', 8: 'ASI', 10: 'Subclass feature', 12: 'ASI', 14: 'Subclass feature', 16: 'ASI', 18: 'Spell Mastery', 19: 'Epic Boon', 20: 'Signature Spells' }),
  },
};

const ASI_TEXT = {
  2014: 'Ability Score Improvement: +2 to one ability or +1 to two (none above 20), or a feat if your DM uses feats',
  2024: 'Ability Score Improvement feat, or another feat you qualify for',
};

/**
 * What a class gives and asks for, for an edition: { key, name, edition,
 * book, hit_die, hp_first, hp_next, saves, armor, weapons, tools, mastery,
 * skills: { choose, from }, equipment, spells, features: [{ level, names }] }.
 * null for a class the sheet doesn't know.
 */
export function classHelp(key, edition = '2014') {
  const ed = edition === '2024' ? '2024' : '2014';
  const base = CLASSES[key];
  const c = (ed === '2024' ? C2024 : C2014)[key];
  if (!base || !c) return null;
  const die = base.hitDie;
  return {
    key,
    name: base.name,
    edition: ed,
    book: c.book ?? `Player's Handbook (${ed})`,
    hit_die: `d${die}`,
    hp_first: `${die} + your Constitution modifier`,
    hp_next: `1d${die} (or ${FIXED_HP[die]}) + your Constitution modifier per level`,
    saves: base.saves.map((a) => ABILITY_NAMES[a]),
    save_keys: [...base.saves],
    armor: c.armor,
    weapons: c.weapons,
    tools: c.tools,
    mastery: c.mastery ?? 0,
    skills: { choose: c.skills.choose, from: [...c.skills.from] },
    equipment: [...c.equipment],
    spells: c.spells ?? '',
    features: Object.entries(c.features).map(([level, names]) => ({ level: Number(level), names: names.map((n) => (n === 'ASI' ? ASI_TEXT[ed] : n)) })),
  };
}

/** Every class's key the help knows. */
export const HELP_CLASSES = Object.keys(C2014);

// ---------- races (2014) and species (2024) ----------

/** The 2014 Player's Handbook's races: size, speed, languages and traits (ability increases: point-buy.js). */
const R2014 = [
  { name: 'Dragonborn', size: 'Medium', speed: 30, languages: 'Common, Draconic', traits: ['Draconic Ancestry (choose a dragon colour: your breath weapon and damage resistance)', 'Breath Weapon', 'Damage Resistance'] },
  { name: 'Hill Dwarf', size: 'Medium', speed: 25, languages: 'Common, Dwarvish', traits: ['Darkvision 60 ft', 'Dwarven Resilience', 'Dwarven Combat Training', "Tool Proficiency (choose smith's tools, brewer's supplies or mason's tools)", 'Stonecunning', 'Dwarven Toughness (+1 hit point per level)'] },
  { name: 'Mountain Dwarf', size: 'Medium', speed: 25, languages: 'Common, Dwarvish', traits: ['Darkvision 60 ft', 'Dwarven Resilience', 'Dwarven Combat Training', "Tool Proficiency (choose smith's tools, brewer's supplies or mason's tools)", 'Stonecunning', 'Dwarven Armor Training (light and medium armour)'] },
  { name: 'High Elf', size: 'Medium', speed: 30, languages: 'Common, Elvish and one more of your choice', traits: ['Darkvision 60 ft', 'Keen Senses (Perception)', 'Fey Ancestry', 'Trance', 'Elf Weapon Training', 'Cantrip (choose one wizard cantrip)'], skills: sk('Perception') },
  { name: 'Wood Elf', size: 'Medium', speed: 35, languages: 'Common, Elvish', traits: ['Darkvision 60 ft', 'Keen Senses (Perception)', 'Fey Ancestry', 'Trance', 'Elf Weapon Training', 'Fleet of Foot', 'Mask of the Wild'], skills: sk('Perception') },
  { name: 'Dark Elf (Drow)', size: 'Medium', speed: 30, languages: 'Common, Elvish', traits: ['Superior Darkvision 120 ft', 'Keen Senses (Perception)', 'Fey Ancestry', 'Trance', 'Sunlight Sensitivity', 'Drow Magic', 'Drow Weapon Training'], skills: sk('Perception') },
  { name: 'Forest Gnome', size: 'Small', speed: 25, languages: 'Common, Gnomish', traits: ['Darkvision 60 ft', 'Gnome Cunning', 'Natural Illusionist (Minor Illusion)', 'Speak with Small Beasts'] },
  { name: 'Rock Gnome', size: 'Small', speed: 25, languages: 'Common, Gnomish', traits: ['Darkvision 60 ft', 'Gnome Cunning', "Artificer's Lore", "Tinker (tinker's tools)"] },
  { name: 'Half-Elf', size: 'Medium', speed: 30, languages: 'Common, Elvish and one more of your choice', traits: ['Darkvision 60 ft', 'Fey Ancestry', 'Skill Versatility (choose two skills)', 'Ability increases: +2 Charisma and +1 to two others of your choice'], skill_choice: 2 },
  { name: 'Half-Orc', size: 'Medium', speed: 30, languages: 'Common, Orc', traits: ['Darkvision 60 ft', 'Menacing (Intimidation)', 'Relentless Endurance', 'Savage Attacks'], skills: sk('Intimidation') },
  { name: 'Lightfoot Halfling', size: 'Small', speed: 25, languages: 'Common, Halfling', traits: ['Lucky', 'Brave', 'Halfling Nimbleness', 'Naturally Stealthy'] },
  { name: 'Stout Halfling', size: 'Small', speed: 25, languages: 'Common, Halfling', traits: ['Lucky', 'Brave', 'Halfling Nimbleness', 'Stout Resilience'] },
  { name: 'Human', size: 'Medium', speed: 30, languages: 'Common and one more of your choice', traits: ['+1 to every ability score'] },
  { name: 'Variant Human', size: 'Medium', speed: 30, languages: 'Common and one more of your choice', traits: ['+1 to two abilities of your choice', 'One skill of your choice', 'One feat of your choice'], skill_choice: 1 },
  { name: 'Tiefling', size: 'Medium', speed: 30, languages: 'Common, Infernal', traits: ['Darkvision 60 ft', 'Hellish Resistance (fire)', 'Infernal Legacy (Thaumaturgy; Hellish Rebuke at 3rd level; Darkness at 5th)'] },
].map((r) => ({ ...r, edition: '2014', book: "Player's Handbook (2014)" }));

/** The 2024 Player's Handbook's species. Ability increases come from the background in 2024. */
const R2024 = [
  { name: 'Aasimar', size: 'Medium or Small', speed: 30, traits: ['Celestial Resistance (necrotic and radiant)', 'Darkvision 60 ft', 'Healing Hands', 'Light Bearer (Light cantrip)', 'Celestial Revelation at level 3 (choose: Heavenly Wings, Inner Radiance or Necrotic Shroud)'] },
  { name: 'Dragonborn', size: 'Medium', speed: 30, traits: ['Draconic Ancestry (choose a dragon: your damage type)', 'Breath Weapon', 'Damage Resistance', 'Darkvision 60 ft', 'Draconic Flight at level 5'] },
  { name: 'Dwarf', size: 'Medium', speed: 30, traits: ['Darkvision 120 ft', 'Dwarven Resilience', 'Dwarven Toughness (+1 hit point per level)', 'Stonecunning'] },
  { name: 'Elf', size: 'Medium', speed: 30, traits: ['Darkvision 60 ft', 'Elven Lineage (choose: Drow, High Elf or Wood Elf; with spells at levels 1, 3 and 5)', 'Fey Ancestry', 'Keen Senses (choose Insight, Perception or Survival)', 'Trance'], skill_pick: sk('Insight', 'Perception', 'Survival') },
  { name: 'Gnome', size: 'Small', speed: 30, traits: ['Darkvision 60 ft', 'Gnomish Cunning', 'Gnomish Lineage (choose: Forest Gnome or Rock Gnome)'] },
  { name: 'Goliath', size: 'Medium', speed: 35, traits: ['Giant Ancestry (choose: Cloud, Fire, Frost, Hill, Stone or Storm)', 'Large Form at level 5', 'Powerful Build'] },
  { name: 'Halfling', size: 'Small', speed: 30, traits: ['Brave', 'Halfling Nimbleness', 'Luck', 'Naturally Stealthy'] },
  { name: 'Human', size: 'Medium or Small', speed: 30, traits: ['Resourceful (Heroic Inspiration after a long rest)', 'Skillful (choose one skill)', 'Versatile (choose an origin feat)'], skill_choice: 1 },
  { name: 'Orc', size: 'Medium', speed: 30, traits: ['Adrenaline Rush', 'Darkvision 120 ft', 'Relentless Endurance'] },
  { name: 'Tiefling', size: 'Medium or Small', speed: 30, traits: ['Darkvision 60 ft', 'Fiendish Legacy (choose: Abyssal, Chthonic or Infernal; with spells at levels 1, 3 and 5)', 'Otherworldly Presence (Thaumaturgy)'] },
].map((r) => ({ ...r, edition: '2024', book: "Player's Handbook (2024)", languages: 'Common and two other standard languages of your choice (2024: every character)' }));

/** The races (2014) or species (2024) the help lists, for the edition. */
export const racesFor = (edition = '2014') => (edition === '2024' ? R2024 : R2014);

/**
 * What a race or species gives, by what's typed: the most specific match for
 * the edition ("Wood Elf" in 2024 is an Elf with the Wood Elf lineage), with
 * the 2014 ability increases. null when the help doesn't know it.
 */
export function raceHelp(typed, edition = '2014') {
  const t = String(typed ?? '').trim().toLowerCase();
  if (!t) return null;
  const list = racesFor(edition);
  const norm = (s) => s.toLowerCase().replace(/[()]/g, '');
  const exact = list.find((r) => norm(r.name) === norm(t)) ?? (edition !== '2024' && /drow|dark\s*elf/.test(t) ? list.find((r) => r.name.startsWith('Dark Elf')) : null);
  const loose = exact ?? [...list].sort((a, b) => b.name.length - a.name.length).find((r) => t.includes(r.name.toLowerCase().split(' ').at(-1)));
  if (!loose) return null;
  const out = { ...loose, traits: [...loose.traits], skills: loose.skills ?? [], skill_choice: loose.skill_choice ?? 0 };
  if (edition !== '2024') {
    const b = raceBonuses2014(loose.name);
    out.abilities = Object.entries(b.fixed).map(([a, n]) => `+${n} ${ABILITY_NAMES[a]}`).join(', ') + (b.choose ? `${Object.keys(b.fixed).length ? ', ' : ''}+1 to ${b.choose} of your choice` : '');
  } else {
    out.abilities = 'From your background (2024)';
  }
  return out;
}

/** The skills a class lets you choose from that the sheet hasn't ticked, and how many are ticked of them. */
export function skillPicks(sheet, help) {
  if (!help) return { picked: [], left: 0 };
  const picked = help.skills.from.filter((k) => sheet.skills?.[k]);
  return { picked, left: Math.max(0, help.skills.choose - picked.length) };
}
