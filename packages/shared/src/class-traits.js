/**
 * Every class feature in the class tables, by class, level and edition, with
 * a short summary and how the sheet handles it (`how`):
 *   tracked: a row of the Class features box (uses, points or a number; `id`
 *            is its row in class-features.js);
 *   number:  worked out into the sheet's numbers (AC, speed, saves... in
 *            sheet.js computeSheet), and listed in Features & traits;
 *   roll:    added to attacks or spells rolled from the sheet
 *            (attack-extras.js), and listed in Features & traits;
 *   choice:  the player picks it in Features & traits (a fighting style...);
 *   text:    listed in Features & traits, named with a short summary.
 * An entry with `id` is (also) a row of the Class features box, so it's
 * shown there and not in Features & traits (Sneak Attack is a row there and
 * a roll on attacks). Features & traits shows every one that isn't
 * (traitRows), leaving out any the player already wrote down. The audit
 * (docs/notes/class-features-audit.md) is made from this list
 * (scripts/class-features-audit.js).
 *
 * Plain JS like sheet.js: the server and the page use it (/shared/class-traits.js).
 * From the 2014 and 2024 Player's Handbooks (the campaign's edition decides)
 * and Tasha's for the artificer. Summaries are short: the book has the rest.
 */
import { classLevels } from './class-features.js';
import { racesOf } from './race-features.js';

const step = (table, level) => table.reduce((v, [from, n]) => (level >= from ? n : v), table[0][1]);
const plus = (n) => (n < 0 ? `−${-n}` : `+${n}`);
const E14 = '2014';
const E24 = '2024';

/**
 * [class, edition ('' both), level, name, how, text (string or (c) => string), id (tracked row)].
 * c: { level, edition, pb, mod(a) }.
 */
const T = [
  // ---------- Barbarian ----------
  ['barbarian', '', 1, 'Rage', 'tracked', '', 'rage'],
  ['barbarian', '', 1, 'Unarmored Defense', 'number', 'With no armour: AC 10 + Dexterity + Constitution (a shield still counts). In your AC.'],
  ['barbarian', E24, 1, 'Weapon Mastery', 'roll', (c) => `Mastery properties of ${step([[1, 2], [4, 3], [10, 4]], c.level)} kinds of simple or martial melee weapons; change one after a long rest. Pick them in Attacks or the Inventory.`],
  ['barbarian', '', 2, 'Reckless Attack', 'text', 'On your first attack of a turn: advantage on Strength attack rolls this turn, and attacks against you have advantage until your next turn.'],
  ['barbarian', '', 2, 'Danger Sense', 'text', (c) => `Advantage on Dexterity saves${c.edition === E14 ? ' against effects you can see' : ''}, unless you're incapacitated${c.edition === E14 ? ', blinded or deafened' : ''}.`],
  ['barbarian', E24, 3, 'Primal Knowledge', 'text', 'One more barbarian skill; while raging, Acrobatics, Intimidation, Perception, Stealth and Survival checks can use Strength.'],
  ['barbarian', '', 5, 'Extra Attack', 'text', 'Attack twice when you take the Attack action.'],
  ['barbarian', '', 5, 'Fast Movement', 'number', '+10 feet of speed when not wearing heavy armour. In your speed.'],
  ['barbarian', '', 7, 'Feral Instinct', 'number', (c) => `Advantage on initiative (rolled so from the sheet).${c.edition === E14 ? ' If surprised, you can still act on your first turn by raging first.' : ''}`],
  ['barbarian', E24, 7, 'Instinctive Pounce', 'text', 'When you rage, move up to half your speed.'],
  ['barbarian', E14, 9, 'Brutal Critical', 'roll', (c) => `${step([[9, 1], [13, 2], [17, 3]], c.level)} more weapon damage die on a melee critical hit. In your critical damage.`],
  ['barbarian', E24, 9, 'Brutal Strike', 'roll', (c) => `With Reckless Attack, give up advantage on one Strength attack: on a hit ${c.level >= 17 ? '2d10' : '1d10'} more and ${c.level >= 13 ? 'one of Forceful, Hamstring, Staggering or Sundering Blow' : 'Forceful Blow (push 15 ft) or Hamstring Blow (−15 ft speed)'}${c.level >= 17 ? ' (two effects)' : ''}. Tick it on the attack.`],
  ['barbarian', '', 11, 'Relentless Rage', 'tracked', '', 'relentless_rage'],
  ['barbarian', E24, 13, 'Improved Brutal Strike', 'roll', 'Staggering Blow and Sundering Blow join your Brutal Strike effects.'],
  ['barbarian', E14, 15, 'Persistent Rage', 'text', 'Your rage ends early only if you fall unconscious or choose to end it.'],
  ['barbarian', E24, 15, 'Persistent Rage', 'tracked', '', 'persistent_rage'],
  ['barbarian', E24, 17, 'Improved Brutal Strike (17th)', 'roll', 'Brutal Strike deals 2d10 and causes two effects.'],
  ['barbarian', '', 18, 'Indomitable Might', 'text', 'A Strength check or save lower than your Strength score uses your score instead.'],
  ['barbarian', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],
  ['barbarian', '', 20, 'Primal Champion', 'number', (c) => `Strength and Constitution +4 (up to ${c.edition === E24 ? 25 : 24}). In your scores.`],

  // ---------- Bard ----------
  ['bard', '', 1, 'Spellcasting', 'number', 'Charisma spells: your spell slots, save DC and attack bonus are worked out.'],
  ['bard', '', 1, 'Bardic Inspiration', 'tracked', '', 'bardic_inspiration'],
  ['bard', E24, 2, 'Expertise', 'text', (c) => `Double proficiency in ${c.level >= 9 ? 'four' : 'two'} skills you're proficient in: mark them Expertise under Skills.`],
  ['bard', '', 2, 'Jack of All Trades', 'number', (c) => `+${Math.floor(c.pb / 2)} (half proficiency) to ability checks you aren't proficient in${c.edition === E14 ? ', initiative too' : ', initiative too'}. In your skills.`],
  ['bard', E14, 2, 'Song of Rest', 'text', (c) => `During a short rest, friends who spend hit dice regain 1d${step([[2, 6], [9, 8], [13, 10], [17, 12]], c.level)} more hit points.`],
  ['bard', E14, 3, 'Expertise', 'text', (c) => `Double proficiency in ${c.level >= 10 ? 'four' : 'two'} skills (or thieves' tools): mark them Expertise under Skills.`],
  ['bard', '', 5, 'Font of Inspiration', 'tracked', 'Bardic Inspiration comes back on a short rest.', 'bardic_inspiration'],
  ['bard', E14, 6, 'Countercharm', 'text', 'An action: you and friends within 30 feet have advantage on saves against being frightened or charmed until the end of your next turn.'],
  ['bard', E24, 7, 'Countercharm', 'text', 'A reaction when you or a creature within 30 feet fails a save against charmed or frightened: reroll it with advantage.'],
  ['bard', E14, 10, 'Magical Secrets', 'text', (c) => `${step([[10, 2], [14, 4], [18, 6]], c.level)} spells from any class, counted as bard spells.`],
  ['bard', E24, 10, 'Magical Secrets', 'text', 'Your bard spells can come from the bard, cleric, druid and wizard lists.'],
  ['bard', E24, 18, 'Superior Inspiration', 'tracked', '', 'bardic_inspiration'],
  ['bard', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],
  ['bard', E14, 20, 'Superior Inspiration', 'tracked', '', 'bardic_inspiration'],
  ['bard', E24, 20, 'Words of Creation', 'text', 'Power Word Heal and Power Word Kill are always prepared, and each can target a second creature within 10 feet of the first.'],

  // ---------- Cleric ----------
  ['cleric', '', 1, 'Spellcasting', 'number', 'Wisdom spells: your spell slots, save DC and attack bonus are worked out.'],
  ['cleric', E24, 1, 'Divine Order', 'text', 'Protector (martial weapons and heavy armour) or Thaumaturge (one more cantrip, + Wisdom to Arcana and Religion checks).'],
  ['cleric', '', 2, 'Channel Divinity', 'tracked', '', 'channel_divinity_cleric'],
  ['cleric', E14, 2, 'Turn Undead', 'text', (c) => `Channel Divinity: undead within 30 feet make a Wisdom save (DC ${8 + c.pb + c.mod('wis')}) or are turned for 1 minute.${c.level >= 5 ? ' Destroy Undead: low-challenge ones are destroyed.' : ''}`],
  ['cleric', E24, 2, 'Divine Spark and Turn Undead', 'text', (c) => `Channel Divinity: Divine Spark heals or deals ${step([[2, 1], [7, 2], [13, 3], [18, 4]], c.level)}d8 + ${c.mod('wis')} (Constitution save, DC ${8 + c.pb + c.mod('wis')}); Turn Undead frightens and incapacitates undead (Wisdom save).`],
  ['cleric', E24, 5, 'Sear Undead', 'text', (c) => `Turned undead take ${Math.max(1, c.mod('wis'))}d8 radiant damage.`],
  ['cleric', E24, 7, 'Blessed Strikes', 'choice', 'Divine Strike (a weapon hit deals 1d8 more, once a turn) or Potent Spellcasting (+ Wisdom to cleric cantrip damage): pick it below.'],
  ['cleric', '', 10, 'Divine Intervention', 'tracked', '', 'divine_intervention'],
  ['cleric', E24, 14, 'Improved Blessed Strikes', 'roll', 'Divine Strike becomes 2d8; Potent Spellcasting also gives temporary hit points.'],
  ['cleric', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],
  ['cleric', E24, 20, 'Greater Divine Intervention', 'text', 'Divine Intervention can cast Wish (then not again for 2d4 long rests).'],

  // ---------- Druid ----------
  ['druid', '', 1, 'Druidic', 'text', 'You know Druidic, the druids\' secret language, and can leave hidden messages in it.'],
  ['druid', '', 1, 'Spellcasting', 'number', 'Wisdom spells: your spell slots, save DC and attack bonus are worked out.'],
  ['druid', E24, 1, 'Primal Order', 'text', 'Magician (one more cantrip, + Wisdom to Arcana and Nature checks) or Warden (martial weapons and medium armour).'],
  ['druid', '', 2, 'Wild Shape', 'tracked', '', 'wild_shape'],
  ['druid', E24, 2, 'Wild Companion', 'text', 'Spend a spell slot or a Wild Shape use to cast Find Familiar without material components (a fey familiar).'],
  ['druid', E24, 5, 'Wild Resurgence', 'tracked', 'Spend a spell slot for a Wild Shape use, or a Wild Shape use for a 1st-level slot (once a long rest).', 'wild_shape'],
  ['druid', E24, 7, 'Elemental Fury', 'choice', 'Potent Spellcasting (+ Wisdom to druid cantrip damage) or Primal Strike (1d8 cold, fire, lightning or thunder once a turn): pick it below.'],
  ['druid', E24, 15, 'Improved Elemental Fury', 'roll', 'Primal Strike becomes 2d8; Potent Spellcasting cantrips reach 300 feet farther.'],
  ['druid', E14, 18, 'Timeless Body', 'text', 'You age one year for every ten.'],
  ['druid', '', 18, 'Beast Spells', 'text', 'Cast spells in Wild Shape (not ones with costly material components).'],
  ['druid', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],
  ['druid', '', 20, 'Archdruid', 'text', (c) => (c.edition === E24 ? 'Evergreen Wild Shape (a use back when you roll initiative with none), Nature Magician (Wild Shape uses into spell slots), Longevity.' : 'Unlimited Wild Shape; ignore verbal, somatic and cheap material components of druid spells.')],

  // ---------- Fighter ----------
  ['fighter', '', 1, 'Fighting Style', 'choice', 'Pick your style below: Archery, Defense, Dueling and Great Weapon Fighting change your numbers.'],
  ['fighter', '', 1, 'Second Wind', 'tracked', '', 'second_wind'],
  ['fighter', E24, 1, 'Weapon Mastery', 'roll', (c) => `Mastery properties of ${step([[1, 3], [4, 4], [10, 5], [16, 6]], c.level)} kinds of simple or martial weapons; change one after a long rest. Pick them in Attacks or the Inventory.`],
  ['fighter', '', 2, 'Action Surge', 'tracked', '', 'action_surge'],
  ['fighter', E24, 2, 'Tactical Mind', 'tracked', 'Spend a Second Wind to add 1d10 to a failed ability check.', 'second_wind'],
  ['fighter', '', 5, 'Extra Attack', 'text', (c) => `Attack ${c.level >= 20 ? 'four times' : c.level >= 11 ? 'three times' : 'twice'} when you take the Attack action.`],
  ['fighter', E24, 5, 'Tactical Shift', 'text', 'When you use Second Wind, move up to half your speed without provoking opportunity attacks.'],
  ['fighter', '', 9, 'Indomitable', 'tracked', '', 'indomitable'],
  ['fighter', E24, 9, 'Tactical Master', 'text', 'Attacking with a weapon whose mastery you use, you can swap its property for Push, Sap or Slow.'],
  ['fighter', E24, 13, 'Studied Attacks', 'text', 'Miss a creature: advantage on your next attack roll against it before the end of your next turn.'],
  ['fighter', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],

  // ---------- Monk ----------
  ['monk', '', 1, 'Unarmored Defense', 'number', 'With no armour or shield: AC 10 + Dexterity + Wisdom. In your AC.'],
  ['monk', '', 1, 'Martial Arts', 'roll', (c) => `Unarmed strikes and monk weapons use the better of Strength and Dexterity and at least a d${c.edition === E24 ? step([[1, 6], [5, 8], [11, 10], [17, 12]], c.level) : step([[1, 4], [5, 6], [11, 8], [17, 10]], c.level)} (no armour or shield); an unarmed strike as a bonus action. In your attacks.`, 'martial_arts'],
  ['monk', '', 2, (c) => (c.edition === E24 ? "Monk's Focus" : 'Ki'), 'tracked', '', 'ki'],
  ['monk', '', 2, 'Unarmored Movement', 'number', (c) => `+${step([[2, 10], [6, 15], [10, 20], [14, 25], [18, 30]], c.level)} feet of speed with no armour or shield. In your speed.${c.level >= 9 ? ' You can run along walls and across liquids on your turn.' : ''}`],
  ['monk', E24, 2, 'Uncanny Metabolism', 'tracked', '', 'uncanny_metabolism'],
  ['monk', E14, 3, 'Deflect Missiles', 'text', (c) => `A reaction: reduce a ranged weapon attack's damage by 1d10 + ${c.mod('dex') + c.level}; at 0, catch it and throw it back for 1 ki.`],
  ['monk', E24, 3, 'Deflect Attacks', 'text', (c) => `A reaction: reduce bludgeoning, piercing or slashing attack damage by 1d10 + ${c.mod('dex') + c.level}; at 0, spend 1 Focus to send it back (2 martial arts dice).`],
  ['monk', '', 4, 'Slow Fall', 'text', (c) => `A reaction: take ${5 * c.level} less falling damage.`],
  ['monk', '', 5, 'Extra Attack', 'text', 'Attack twice when you take the Attack action.'],
  ['monk', '', 5, 'Stunning Strike', 'text', (c) => `Spend 1 ${c.edition === E24 ? 'Focus Point (once a turn)' : 'ki point'} when you hit: Constitution save (DC ${8 + c.pb + c.mod('wis')}) or stunned until your next turn${c.edition === E24 ? '; on a success, speed halved and the next attack against it has advantage' : ''}.`],
  ['monk', '', 6, (c) => (c.edition === E24 ? 'Empowered Strikes' : 'Ki-Empowered Strikes'), 'text', (c) => (c.edition === E24 ? 'Your unarmed strikes can deal force damage.' : 'Your unarmed strikes count as magical.')],
  ['monk', '', 7, 'Evasion', 'text', 'A Dexterity save for half damage: none on a success, half on a failure.'],
  ['monk', E14, 7, 'Stillness of Mind', 'text', 'An action: end one effect charming or frightening you.'],
  ['monk', E24, 9, 'Acrobatic Movement', 'text', 'Move along vertical surfaces and across liquids on your turn.'],
  ['monk', E14, 10, 'Purity of Body', 'text', 'Immune to disease and poison.'],
  ['monk', E24, 10, 'Heightened Focus', 'text', 'Flurry of Blows makes three strikes; Patient Defense and Step of the Wind give more.'],
  ['monk', E24, 10, 'Self-Restoration', 'text', 'End charmed, frightened or poisoned on yourself at the end of your turn; no exhaustion from going without food and water.'],
  ['monk', E14, 13, 'Tongue of the Sun and Moon', 'text', 'You understand every spoken language, and every creature that knows one understands you.'],
  ['monk', E24, 13, 'Deflect Energy', 'text', 'Deflect Attacks works on any damage type.'],
  ['monk', E14, 14, 'Diamond Soul', 'number', 'Proficient in every saving throw (in your saves); spend 1 ki to reroll a failed one.'],
  ['monk', E24, 14, 'Disciplined Survivor', 'number', 'Proficient in every saving throw (in your saves); spend 1 Focus to reroll a failed one.'],
  ['monk', E14, 15, 'Timeless Body', 'text', 'No frailty of old age, no need for food or water.'],
  ['monk', E24, 15, 'Perfect Focus', 'text', 'When you roll initiative with 3 Focus Points or fewer, you have 4.'],
  ['monk', E14, 18, 'Empty Body', 'text', '4 ki: invisible and resistant to all damage but force for 1 minute; 8 ki: Astral Projection.'],
  ['monk', E24, 18, 'Superior Defense', 'text', '3 Focus Points: resistance to all damage but force for 1 minute.'],
  ['monk', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],
  ['monk', E14, 20, 'Perfect Self', 'text', 'When you roll initiative with no ki, you regain 4.'],
  ['monk', E24, 20, 'Body and Mind', 'number', 'Dexterity and Wisdom +4 (up to 25). In your scores.'],

  // ---------- Paladin ----------
  ['paladin', E14, 1, 'Divine Sense', 'tracked', '', 'divine_sense'],
  ['paladin', '', 1, 'Lay on Hands', 'tracked', '', 'lay_on_hands'],
  ['paladin', E24, 1, 'Spellcasting', 'number', 'Charisma spells: your spell slots, save DC and attack bonus are worked out.'],
  ['paladin', E24, 1, 'Weapon Mastery', 'roll', 'Mastery properties of 2 kinds of weapons; change one after a long rest. Pick them in Attacks or the Inventory.'],
  ['paladin', '', 2, 'Fighting Style', 'choice', (c) => `Pick your style below${c.edition === E24 ? ' (or Blessed Warrior: two cleric cantrips)' : ''}.`],
  ['paladin', E14, 2, 'Spellcasting', 'number', 'Charisma spells: your spell slots, save DC and attack bonus are worked out.'],
  ['paladin', '', 2, 'Divine Smite', 'roll', (c) => `On a melee hit, spend a slot: 2d8 radiant, +1d8 a slot level above 1st${c.edition === E14 ? ' (5d8 at most)' : ''}, +1d8 against fiends and undead. Tick it on the attack.`],
  ['paladin', E24, 2, "Paladin's Smite", 'tracked', '', 'paladins_smite'],
  ['paladin', E14, 3, 'Divine Health', 'text', 'Immune to disease.'],
  ['paladin', '', 3, 'Channel Divinity', 'tracked', '', 'channel_divinity_paladin'],
  ['paladin', '', 5, 'Extra Attack', 'text', 'Attack twice when you take the Attack action.'],
  ['paladin', E24, 5, 'Faithful Steed', 'tracked', '', 'faithful_steed'],
  ['paladin', '', 6, 'Aura of Protection', 'number', (c) => `You and friends within ${c.level >= 18 ? 30 : 10} feet add +${Math.max(1, c.mod('cha'))} to saving throws. In your saves.`, 'aura_of_protection'],
  ['paladin', E24, 9, 'Abjure Foes', 'text', (c) => `Channel Divinity: up to ${Math.max(1, c.mod('cha'))} creatures within 60 feet make a Wisdom save or are frightened for 1 minute.`],
  ['paladin', '', 10, 'Aura of Courage', 'text', (c) => `You and friends within ${c.level >= 18 ? 30 : 10} feet can't be frightened while you're conscious.`],
  ['paladin', E14, 11, 'Improved Divine Smite', 'roll', 'Every melee weapon hit deals 1d8 radiant damage more. In your damage.'],
  ['paladin', E24, 11, 'Radiant Strikes', 'roll', 'Every melee weapon or unarmed hit deals 1d8 radiant damage more. In your damage.'],
  ['paladin', E14, 14, 'Cleansing Touch', 'tracked', '', 'cleansing_touch'],
  ['paladin', E24, 14, 'Restoring Touch', 'text', 'Lay on Hands can also end blinded, charmed, deafened, frightened, paralysed or stunned (5 points each).'],
  ['paladin', '', 18, 'Aura Expansion', 'number', 'Your auras reach 30 feet.'],
  ['paladin', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],

  // ---------- Ranger ----------
  ['ranger', E14, 1, 'Favored Enemy', 'text', 'Advantage on Survival checks to track your favoured enemies and Intelligence checks to recall about them; one of their languages.'],
  ['ranger', E24, 1, 'Favored Enemy', 'tracked', '', 'favored_enemy'],
  ['ranger', E14, 1, 'Natural Explorer', 'text', 'In your favoured terrain: double proficiency on Intelligence and Wisdom checks about it, no slowing from difficult terrain, never lost, and more.'],
  ['ranger', E24, 1, 'Spellcasting', 'number', 'Wisdom spells: your spell slots, save DC and attack bonus are worked out.'],
  ['ranger', E24, 1, 'Weapon Mastery', 'roll', 'Mastery properties of 2 kinds of weapons; change one after a long rest. Pick them in Attacks or the Inventory.'],
  ['ranger', E24, 2, 'Deft Explorer', 'text', 'Expertise in one skill (mark it under Skills) and two languages.'],
  ['ranger', '', 2, 'Fighting Style', 'choice', (c) => `Pick your style below${c.edition === E24 ? ' (or Druidic Warrior: two druid cantrips)' : ''}.`],
  ['ranger', E14, 2, 'Spellcasting', 'number', 'Wisdom spells: your spell slots, save DC and attack bonus are worked out.'],
  ['ranger', E14, 3, 'Primeval Awareness', 'text', 'Spend a spell slot: sense aberrations, celestials, dragons, elementals, fey, fiends and undead within a mile (6 in favoured terrain).'],
  ['ranger', '', 5, 'Extra Attack', 'text', 'Attack twice when you take the Attack action.'],
  ['ranger', E24, 6, 'Roving', 'number', '+10 feet of speed out of heavy armour (in your speed), and a climb and swim speed equal to it.'],
  ['ranger', E14, 8, "Land's Stride", 'text', 'Non-magical difficult terrain doesn\'t slow you; advantage on saves against magical plants.'],
  ['ranger', E24, 9, 'Expertise', 'text', 'Expertise in two more skills: mark them under Skills.'],
  ['ranger', E14, 10, 'Hide in Plain Sight', 'text', 'Spend a minute camouflaging: +10 to Stealth while you stay still.'],
  ['ranger', E24, 10, 'Tireless', 'tracked', '', 'tireless'],
  ['ranger', E24, 13, 'Relentless Hunter', 'text', "Taking damage can't break your concentration on Hunter's Mark."],
  ['ranger', E14, 14, 'Vanish', 'text', 'Hide as a bonus action; you can\'t be tracked by non-magical means.'],
  ['ranger', E24, 14, "Nature's Veil", 'tracked', '', 'natures_veil'],
  ['ranger', E24, 17, 'Precise Hunter', 'text', "Advantage on attack rolls against the creature marked by your Hunter's Mark."],
  ['ranger', '', 18, 'Feral Senses', 'text', (c) => (c.edition === E24 ? 'Blindsight 30 feet.' : 'No disadvantage attacking creatures you can\'t see; you know where invisible creatures within 30 feet are.')],
  ['ranger', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],
  ['ranger', E14, 20, 'Foe Slayer', 'text', (c) => `Once a turn, add ${plus(c.mod('wis'))} to an attack or damage roll against a favoured enemy.`],
  ['ranger', E24, 20, 'Foe Slayer', 'roll', "Hunter's Mark deals 1d10 instead of 1d6. In your damage."],

  // ---------- Rogue ----------
  ['rogue', '', 1, 'Expertise', 'text', (c) => `Double proficiency in ${c.level >= 6 ? 'four' : 'two'} skills${c.edition === E14 ? ' (or thieves\' tools)' : ''}: mark them Expertise under Skills.`],
  ['rogue', '', 1, 'Sneak Attack', 'roll', (c) => `${Math.ceil(c.level / 2)}d6 more damage once a turn with a finesse or ranged weapon, with advantage or an ally next to the target. Tick it on the attack.`, 'sneak_attack'],
  ['rogue', '', 1, "Thieves' Cant", 'text', (c) => `The secret mix of dialect, jargon and code of thieves: hide messages in ordinary talk, and read their secret signs${c.edition === E24 ? '; you also know one more language' : ''}.`],
  ['rogue', E24, 1, 'Weapon Mastery', 'roll', 'Mastery properties of 2 kinds of weapons with Finesse or Light (daggers and shortbows, say); change one after a long rest. Pick them in Attacks or the Inventory.'],
  ['rogue', '', 2, 'Cunning Action', 'text', 'Dash, Disengage or Hide as a bonus action.'],
  ['rogue', E24, 3, 'Steady Aim', 'text', 'A bonus action if you haven\'t moved: advantage on your next attack this turn (your speed is 0 until the end of it).'],
  ['rogue', E24, 5, 'Cunning Strike', 'text', 'When you deal Sneak Attack damage, give up dice for an effect: Poison (1d6), Trip (1d6), Withdraw (1d6).'],
  ['rogue', '', 5, 'Uncanny Dodge', 'text', 'A reaction when an attacker you can see hits you: halve the damage.'],
  ['rogue', '', 7, 'Evasion', 'text', 'A Dexterity save for half damage: none on a success, half on a failure.'],
  ['rogue', E24, 7, 'Reliable Talent', 'number', 'A d20 of 9 or lower on a check with a skill or tool you\'re proficient in counts as 10 (rolled so from your skills).'],
  ['rogue', E24, 11, 'Improved Cunning Strike', 'text', 'Use two Cunning Strike effects at once.'],
  ['rogue', E14, 11, 'Reliable Talent', 'number', 'A d20 of 9 or lower on a check you\'re proficient in counts as 10 (rolled so from your skills).'],
  ['rogue', E14, 14, 'Blindsense', 'text', 'You know where hidden or invisible creatures within 10 feet are, if you can hear.'],
  ['rogue', E24, 14, 'Devious Strikes', 'text', 'New Cunning Strike effects: Daze (2d6), Knock Out (6d6), Obscure (3d6).'],
  ['rogue', '', 15, 'Slippery Mind', 'number', (c) => `Proficient in Wisdom${c.edition === E24 ? ' and Charisma' : ''} saving throws. In your saves.`],
  ['rogue', '', 18, 'Elusive', 'text', 'No attack roll has advantage against you while you aren\'t incapacitated.'],
  ['rogue', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],
  ['rogue', '', 20, 'Stroke of Luck', 'tracked', '', 'stroke_of_luck'],

  // ---------- Sorcerer ----------
  ['sorcerer', '', 1, 'Spellcasting', 'number', 'Charisma spells: your spell slots, save DC and attack bonus are worked out.'],
  ['sorcerer', E24, 1, 'Innate Sorcery', 'tracked', '', 'innate_sorcery'],
  ['sorcerer', '', 2, 'Font of Magic', 'tracked', 'Sorcery points, and Flexible Casting between points and slots (buttons in Class features).', 'sorcery_points'],
  ['sorcerer', E24, 2, 'Metamagic', 'text', (c) => `${step([[2, 2], [10, 4], [17, 6]], c.level)} Metamagic options (Careful, Distant, Empowered, Extended, Heightened, Quickened, Seeking, Subtle, Transmuted, Twinned), paid with sorcery points.`],
  ['sorcerer', E14, 3, 'Metamagic', 'text', (c) => `${step([[3, 2], [10, 3], [17, 4]], c.level)} Metamagic options (Careful, Distant, Empowered, Extended, Heightened, Quickened, Subtle, Twinned), paid with sorcery points.`],
  ['sorcerer', E24, 5, 'Sorcerous Restoration', 'tracked', '', 'sorcerous_restoration'],
  ['sorcerer', E24, 7, 'Sorcery Incarnate', 'tracked', 'With no Innate Sorcery uses, spend 2 sorcery points; two Metamagic options on one spell while it\'s on.', 'innate_sorcery'],
  ['sorcerer', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],
  ['sorcerer', E14, 20, 'Sorcerous Restoration', 'tracked', 'A short rest gives 4 sorcery points back.', 'sorcery_points'],
  ['sorcerer', E24, 20, 'Arcane Apotheosis', 'text', 'While Innate Sorcery is on, one Metamagic option a turn costs no sorcery points.'],

  // ---------- Warlock ----------
  ['warlock', '', 1, 'Pact Magic', 'number', 'Charisma spells: your Pact Magic slots (all the same level, back on a short rest), save DC and attack bonus are worked out.'],
  ['warlock', E24, 1, 'Eldritch Invocations', 'choice', (c) => `${step([[1, 1], [2, 3], [5, 5], [7, 6], [9, 7], [12, 8], [15, 9], [18, 10]], c.level)} invocations (Pact of the Blade, Chain or Tome among them). Write them in Features & traits; Agonizing Blast, Eldritch Smite and Lifedrinker are picked below and change your rolls.`],
  ['warlock', E14, 2, 'Eldritch Invocations', 'choice', (c) => `${step([[2, 2], [5, 3], [7, 4], [9, 5], [12, 6], [15, 7], [18, 8]], c.level)} invocations. Write them in Features & traits; Agonizing Blast, Eldritch Smite and Lifedrinker are picked below and change your rolls.`],
  ['warlock', E24, 2, 'Magical Cunning', 'tracked', '', 'magical_cunning'],
  ['warlock', E14, 3, 'Pact Boon', 'text', 'Pact of the Chain (a special familiar), the Blade (a pact weapon) or the Tome (three more cantrips).'],
  ['warlock', E24, 9, 'Contact Patron', 'tracked', '', 'contact_patron'],
  ['warlock', '', 11, 'Mystic Arcanum', 'tracked', 'One spell of 6th level (7th at 13, 8th at 15, 9th at 17) once a long rest without a slot.', 'mystic_arcanum_6'],
  ['warlock', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],
  ['warlock', E14, 20, 'Eldritch Master', 'tracked', '', 'eldritch_master'],
  ['warlock', E24, 20, 'Eldritch Master', 'tracked', 'Magical Cunning gives back all your Pact Magic slots.', 'magical_cunning'],

  // ---------- Wizard ----------
  ['wizard', '', 1, 'Spellcasting', 'number', 'Intelligence spells from your spellbook: your spell slots, save DC and attack bonus are worked out.'],
  ['wizard', E24, 1, 'Ritual Adept', 'text', 'Cast any ritual spell in your spellbook as a ritual without preparing it.'],
  ['wizard', '', 1, 'Arcane Recovery', 'tracked', '', 'arcane_recovery'],
  ['wizard', E24, 2, 'Scholar', 'text', 'Expertise in one of Arcana, History, Investigation, Medicine, Nature or Religion: mark it under Skills.'],
  ['wizard', E24, 5, 'Memorize Spell', 'text', 'After a short rest, swap one prepared spell for another in your spellbook.'],
  ['wizard', '', 18, 'Spell Mastery', 'text', 'One 1st-level and one 2nd-level spell you can cast at their lowest level without a slot.'],
  ['wizard', E24, 19, 'Epic Boon', 'text', 'An Epic Boon feat (or another feat).'],
  ['wizard', '', 20, 'Signature Spells', 'tracked', '', 'signature_spells'],

  // ---------- Artificer (Tasha's, both editions) ----------
  ['artificer', '', 1, 'Magical Tinkering', 'text', (c) => `Give a Tiny object a small magical property (light, a recorded message, a smell...); up to ${Math.max(1, c.mod('int'))} at once.`],
  ['artificer', '', 1, 'Spellcasting', 'number', 'Intelligence spells through tools: your spell slots, save DC and attack bonus are worked out.'],
  ['artificer', '', 2, 'Infuse Item', 'tracked', '', 'infusions'],
  ['artificer', '', 3, 'The Right Tool for the Job', 'text', 'An hour with thieves\' tools or artisan\'s tools: make a set of artisan\'s tools.'],
  ['artificer', '', 6, 'Tool Expertise', 'text', 'Double proficiency with any tool you\'re proficient with.'],
  ['artificer', '', 7, 'Flash of Genius', 'tracked', '', 'flash_of_genius'],
  ['artificer', '', 10, 'Magic Item Adept', 'number', 'Attune to four magic items (five at 14th, six at 18th: in your Inventory); common and uncommon items cost less to make.'],
  ['artificer', '', 11, 'Spell-Storing Item', 'tracked', '', 'spell_storing_item'],
  ['artificer', '', 14, 'Magic Item Savant', 'text', 'Ignore class, race, spell and level requirements on magic items.'],
  ['artificer', '', 20, 'Soul of Artifice', 'number', '+1 to all saving throws for each magic item you\'re attuned to (in your saves); end an infusion to drop to 1 hit point instead of 0.'],
];

/** Every class's features as rows: { class, edition ('' both), from, name, how, text, id }. */
export const CLASS_TRAITS = T.map(([cls, edition, from, name, how, text, id = null]) => ({ class: cls, edition, from, name, how, text, id }));

/**
 * Race traits that are text (the ones with uses are rows of the Class
 * features box, race-features.js): the PHB races of both editions.
 * [race key, edition ('' both), name, text, how]
 */
const R = [
  ['dwarf', '', 'Darkvision', (c) => `${c.edition === E24 ? 120 : 60} feet.`],
  ['dwarf', '', 'Dwarven Resilience', 'Advantage on saves against poison, and resistance to poison damage.'],
  ['dwarf', '', 'Dwarven Toughness', (c) => `${c.edition === E24 ? 'One' : 'Hill dwarves: one'} more hit point each level. In your hit points.`, 'number'],
  ['dwarf', E14, 'Stonecunning', 'Double proficiency on History checks about stonework.'],
  ['elf', '', 'Darkvision', (c) => (/drow/i.test(c.race) ? '120 feet.' : '60 feet.')],
  ['elf', '', 'Fey Ancestry', 'Advantage on saves against being charmed; magic can\'t put you to sleep.'],
  ['elf', '', 'Keen Senses', (c) => (c.edition === E24 ? 'Proficiency in Insight, Perception or Survival.' : 'Proficiency in Perception.')],
  ['elf', '', 'Trance', 'Meditate 4 hours instead of sleeping 8.'],
  ['drow', E14, 'Sunlight Sensitivity', 'Disadvantage on attack rolls and sight-based Perception checks in direct sunlight.'],
  ['halfling', '', 'Brave', 'Advantage on saves against being frightened.'],
  ['halfling', '', 'Halfling Nimbleness', 'Move through the space of a creature larger than you.'],
  ['halfling', '', 'Naturally Stealthy', 'You can hide behind a creature at least one size larger than you.'],
  ['gnome', '', 'Darkvision', '60 feet.'],
  ['gnome', '', 'Gnome Cunning', 'Advantage on Intelligence, Wisdom and Charisma saves.'],
  ['dragonborn', '', 'Damage Resistance', 'Resistance to your ancestry\'s damage type.'],
  ['dragonborn', E24, 'Darkvision', '60 feet.'],
  ['half_elf', E14, 'Darkvision', '60 feet.'],
  ['half_elf', E14, 'Fey Ancestry', 'Advantage on saves against being charmed; magic can\'t put you to sleep.'],
  ['half_orc', E14, 'Darkvision', '60 feet.'],
  ['half_orc', E14, 'Menacing', 'Proficiency in Intimidation.'],
  ['half_orc', E14, 'Savage Attacks', 'One more weapon damage die on a melee critical hit. In your critical damage.', 'roll'],
  ['orc', '', 'Darkvision', (c) => `${c.edition === E24 ? 120 : 60} feet.`],
  ['orc', '', 'Powerful Build', 'You count as one size larger for carrying (in your carrying capacity) and pushing.', 'number'],
  ['tiefling', '', 'Darkvision', '60 feet.'],
  ['tiefling', E14, 'Hellish Resistance', 'Resistance to fire damage.'],
  ['tiefling', E24, 'Otherworldly Presence', 'You know Thaumaturgy.'],
  ['aasimar', '', 'Darkvision', '60 feet.'],
  ['aasimar', '', 'Celestial Resistance', 'Resistance to necrotic and radiant damage.'],
  ['goliath', '', 'Powerful Build', 'You count as one size larger for carrying (in your carrying capacity); advantage on ending the grappled condition (2024).', 'number'],
  ['human', E24, 'Skillful', 'Proficiency in one skill.'],
  ['human', E24, 'Versatile', 'An Origin feat.'],
];

export const RACE_TRAITS = R.map(([race, edition, name, text, how = 'text']) => ({ race, edition, name, text, how }));

const tidy = (s) => String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');

/**
 * What Features & traits lists for this character: each class feature and
 * race trait they have at their level and edition that isn't a Class
 * features row, named, with a short summary. One the player already wrote in
 * Features & traits (or Additional features) is marked `written` (the page
 * leaves it out). [{ key, name, text, how, class, race, from, written }]
 */
export function traitRows(sheet, { edition = '2014', values = null } = {}) {
  const ed = edition === '2024' ? E24 : E14;
  const { levels } = classLevels(sheet);
  const pb = values?.proficiency_bonus ?? 2 + Math.floor((Math.min(20, Math.max(1, Object.values(levels).reduce((a, b) => a + b, 0))) - 1) / 4);
  const mod = (a) => values?.[`mod.${a}`] ?? Math.floor(((sheet?.abilities?.[a] ?? 10) - 10) / 2);
  const typed = tidy(`${sheet?.features ?? ''}\n${sheet?.additional_features ?? ''}`);
  const out = [];
  const seen = new Set();
  const push = (row) => {
    const name = row.name;
    const key = `${row.class ?? 'race'}:${tidy(name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...row, key, written: typed.includes(tidy(name)) });
  };
  for (const t of CLASS_TRAITS) {
    const level = levels[t.class];
    // A Class features row (Rage, Sneak Attack...) shows there, not here.
    if (!level || level < t.from || (t.edition && t.edition !== ed) || t.id) continue;
    const c = { level, edition: ed, pb, mod, race: String(sheet?.race ?? '') };
    push({ name: typeof t.name === 'function' ? t.name(c) : t.name, text: typeof t.text === 'function' ? t.text(c) : t.text, how: t.how, class: t.class, race: null, from: t.from });
  }
  const races = racesOf(sheet?.race);
  for (const t of RACE_TRAITS) {
    if (!races.includes(t.race) || (t.edition && t.edition !== ed)) continue;
    if (t.name === 'Dwarven Toughness' && ed === E14 && !/hill/i.test(sheet?.race ?? '')) continue;
    const c = { level: 1, edition: ed, pb, mod, race: String(sheet?.race ?? '') };
    push({ name: t.name, text: typeof t.text === 'function' ? t.text(c) : t.text, how: t.how, class: null, race: t.race, from: 1 });
  }
  return out;
}
