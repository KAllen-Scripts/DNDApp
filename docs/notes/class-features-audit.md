# Class features audit

Made by `node scripts/class-features-audit.js` from the app's own lists (2026-10-22); run it again after changing them. Kenny asked for every class feature to be checked (feedback 2026-10-21, item 9).

**Status:** *Works (tracked)*: a row of the Class features box with its uses or points. *Works (applied)*: the app works the number out (AC, speed, saves, damage...). *Works (choice)*: the player picks it in Features & traits and the pick is applied. *Listed*: shown in Features & traits with a summary; it has nothing the sheet could work out (a language, an action the player takes). *Note only*: a Class features note with the numbers filled in; applying it is the player's (the DM decides when it applies). *Fixed*: a bug found in this audit, now covered by a regression test (docs/regressions.md).

Editions: "2014" and "2024" are the two Player's Handbooks; the campaign's Settings decide which the sheet follows. The artificer is Tasha's (2014 only).

## Classes

### Barbarian

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Rage | Barbarian 1 | 2014 | Class features row: uses ticked off, back on a long rest. Also a Now toggle; the damage is added to Strength attacks while raging. | Works (tracked) |
| Unarmored Defense | Barbarian 1 | both | Worked into the sheet's numbers; listed in Features & traits. With no armour: AC 10 + Dexterity + Constitution (a shield still counts). In your AC. | Works (applied) |
| Rage | Barbarian 1 | 2024 | Class features row: uses ticked off, one back on a short rest, all on a long rest. Also a Now toggle; the damage is added to Strength attacks while raging. | Works (tracked) |
| Weapon Mastery | Barbarian 1 | 2024 | Added to attacks or spells rolled from the sheet. Mastery properties of 2 kinds of simple or martial melee weapons; change one after a long rest. Pick them in Attacks or the Inventory. | Fixed 2026-10-22 (was not on the sheet at all) |
| Reckless Attack | Barbarian 2 | both | Listed in Features & traits with a short summary. On your first attack of a turn: advantage on Strength attack rolls this turn, and attacks against you have advantage until your next turn. | Listed (nothing to work out) |
| Danger Sense | Barbarian 2 | 2014 | Listed in Features & traits with a short summary. Advantage on Dexterity saves against effects you can see, unless you're incapacitated, blinded or deafened. | Listed (nothing to work out) |
| Danger Sense | Barbarian 2 | 2024 | Listed in Features & traits with a short summary. Advantage on Dexterity saves, unless you're incapacitated. | Listed (nothing to work out) |
| Primal Knowledge | Barbarian 3 | 2024 | Listed in Features & traits with a short summary. One more barbarian skill; while raging, Acrobatics, Intimidation, Perception, Stealth and Survival checks can use Strength. | Listed (nothing to work out) |
| Extra Attack | Barbarian 5 | both | Listed in Features & traits with a short summary. Attack twice when you take the Attack action. | Listed (nothing to work out) |
| Fast Movement | Barbarian 5 | both | Worked into the sheet's numbers; listed in Features & traits. +10 feet of speed when not wearing heavy armour. In your speed. | Works (applied) |
| Feral Instinct | Barbarian 7 | 2014 | Worked into the sheet's numbers; listed in Features & traits. Advantage on initiative (rolled so from the sheet). If surprised, you can still act on your first turn by raging first. | Works (applied) |
| Feral Instinct | Barbarian 7 | 2024 | Worked into the sheet's numbers; listed in Features & traits. Advantage on initiative (rolled so from the sheet). | Works (applied) |
| Instinctive Pounce | Barbarian 7 | 2024 | Listed in Features & traits with a short summary. When you rage, move up to half your speed. | Listed (nothing to work out) |
| Brutal Critical | Barbarian 9 | 2014 | Added to attacks or spells rolled from the sheet. 1 more weapon damage die on a melee critical hit. In your critical damage. | Works (applied) |
| Brutal Strike | Barbarian 9 | 2024 | Added to attacks or spells rolled from the sheet. With Reckless Attack, give up advantage on one Strength attack: on a hit 1d10 more and Forceful Blow (push 15 ft) or Hamstring Blow (−15 ft speed). Tick it on the attack. | Works (applied) |
| Relentless Rage | Barbarian 11 | both | Class features row: a note with its numbers. | Works (tracked) |
| Improved Brutal Strike | Barbarian 13 | 2024 | Added to attacks or spells rolled from the sheet. Staggering Blow and Sundering Blow join your Brutal Strike effects. | Works (applied) |
| Persistent Rage | Barbarian 15 | 2014 | Listed in Features & traits with a short summary. Your rage ends early only if you fall unconscious or choose to end it. | Listed (nothing to work out) |
| Persistent Rage | Barbarian 15 | 2024 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Improved Brutal Strike (17th) | Barbarian 17 | 2024 | Added to attacks or spells rolled from the sheet. Brutal Strike deals 2d10 and causes two effects. | Works (applied) |
| Indomitable Might | Barbarian 18 | both | Listed in Features & traits with a short summary. A Strength check or save lower than your Strength score uses your score instead. | Listed (nothing to work out) |
| Epic Boon | Barbarian 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |
| Primal Champion | Barbarian 20 | 2014 | Worked into the sheet's numbers; listed in Features & traits. Strength and Constitution +4 (up to 24). In your scores. | Works (applied) |
| Primal Champion | Barbarian 20 | 2024 | Worked into the sheet's numbers; listed in Features & traits. Strength and Constitution +4 (up to 25). In your scores. | Works (applied) |

### Bard

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Spellcasting | Bard 1 | both | Worked into the sheet's numbers; listed in Features & traits. Charisma spells: your spell slots, save DC and attack bonus are worked out. | Works (applied) |
| Bardic Inspiration | Bard 1 | both | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Jack of All Trades | Bard 2 | both | Worked into the sheet's numbers; listed in Features & traits. +1 (half proficiency) to ability checks you aren't proficient in, initiative too. In your skills. | Works (applied) |
| Song of Rest | Bard 2 | 2014 | Listed in Features & traits with a short summary. During a short rest, friends who spend hit dice regain 1d6 more hit points. | Listed (nothing to work out) |
| Expertise | Bard 2 | 2024 | Listed in Features & traits with a short summary. Double proficiency in two skills you're proficient in: mark them Expertise under Skills. | Listed (nothing to work out) |
| Expertise | Bard 3 | 2014 | Listed in Features & traits with a short summary. Double proficiency in two skills (or thieves' tools): mark them Expertise under Skills. | Listed (nothing to work out) |
| Font of Inspiration | Bard 5 | both | Class features row: uses ticked off, back on a short or long rest. Bardic Inspiration comes back on a short rest. | Works (tracked) |
| Countercharm | Bard 6 | 2014 | Listed in Features & traits with a short summary. An action: you and friends within 30 feet have advantage on saves against being frightened or charmed until the end of your next turn. | Listed (nothing to work out) |
| Countercharm | Bard 7 | 2024 | Listed in Features & traits with a short summary. A reaction when you or a creature within 30 feet fails a save against charmed or frightened: reroll it with advantage. | Listed (nothing to work out) |
| Magical Secrets | Bard 10 | 2014 | Listed in Features & traits with a short summary. 2 spells from any class, counted as bard spells. | Listed (nothing to work out) |
| Magical Secrets | Bard 10 | 2024 | Listed in Features & traits with a short summary. Your bard spells can come from the bard, cleric, druid and wizard lists. | Listed (nothing to work out) |
| Superior Inspiration | Bard 18 | 2024 | Class features row: uses ticked off, back on a short or long rest. | Works (tracked) |
| Epic Boon | Bard 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |
| Superior Inspiration | Bard 20 | 2014 | Class features row: uses ticked off, back on a short or long rest. | Works (tracked) |
| Words of Creation | Bard 20 | 2024 | Listed in Features & traits with a short summary. Power Word Heal and Power Word Kill are always prepared, and each can target a second creature within 10 feet of the first. | Listed (nothing to work out) |

### Cleric

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Spellcasting | Cleric 1 | both | Worked into the sheet's numbers; listed in Features & traits. Wisdom spells: your spell slots, save DC and attack bonus are worked out. | Works (applied) |
| Divine Order | Cleric 1 | 2024 | Listed in Features & traits with a short summary. Protector (martial weapons and heavy armour) or Thaumaturge (one more cantrip, + Wisdom to Arcana and Religion checks). | Listed (nothing to work out) |
| Channel Divinity | Cleric 2 | 2014 | Class features row: uses ticked off, back on a short or long rest. | Works (tracked) |
| Turn Undead | Cleric 2 | 2014 | Listed in Features & traits with a short summary. Channel Divinity: undead within 30 feet make a Wisdom save (DC 10) or are turned for 1 minute. | Listed (nothing to work out) |
| Channel Divinity | Cleric 2 | 2024 | Class features row: uses ticked off, one back on a short rest, all on a long rest. | Works (tracked) |
| Divine Spark and Turn Undead | Cleric 2 | 2024 | Listed in Features & traits with a short summary. Channel Divinity: Divine Spark heals or deals 1d8 + 0 (Constitution save, DC 10); Turn Undead frightens and incapacitates undead (Wisdom save). | Listed (nothing to work out) |
| Sear Undead | Cleric 5 | 2024 | Listed in Features & traits with a short summary. Turned undead take 1d8 radiant damage. | Listed (nothing to work out) |
| Blessed Strikes | Cleric 7 | 2024 | Picked in Features & traits; the pick changes the numbers or rolls. Divine Strike (a weapon hit deals 1d8 more, once a turn) or Potent Spellcasting (+ Wisdom to cleric cantrip damage): pick it below. | Works (choice) |
| Divine Intervention | Cleric 10 | 2014 | Class features row: uses ticked off, not by resting. | Works (tracked) |
| Divine Intervention | Cleric 10 | 2024 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Improved Blessed Strikes | Cleric 14 | 2024 | Added to attacks or spells rolled from the sheet. Divine Strike becomes 2d8; Potent Spellcasting also gives temporary hit points. | Works (applied) |
| Epic Boon | Cleric 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |
| Greater Divine Intervention | Cleric 20 | 2024 | Listed in Features & traits with a short summary. Divine Intervention can cast Wish (then not again for 2d4 long rests). | Listed (nothing to work out) |

### Druid

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Druidic | Druid 1 | both | Listed in Features & traits with a short summary. You know Druidic, the druids' secret language, and can leave hidden messages in it. | Listed (nothing to work out) |
| Spellcasting | Druid 1 | both | Worked into the sheet's numbers; listed in Features & traits. Wisdom spells: your spell slots, save DC and attack bonus are worked out. | Works (applied) |
| Primal Order | Druid 1 | 2024 | Listed in Features & traits with a short summary. Magician (one more cantrip, + Wisdom to Arcana and Nature checks) or Warden (martial weapons and medium armour). | Listed (nothing to work out) |
| Wild Shape | Druid 2 | 2014 | Class features row: uses ticked off, back on a short or long rest. | Works (tracked) |
| Wild Shape | Druid 2 | 2024 | Class features row: uses ticked off, one back on a short rest, all on a long rest. | Works (tracked) |
| Wild Companion | Druid 2 | 2024 | Listed in Features & traits with a short summary. Spend a spell slot or a Wild Shape use to cast Find Familiar without material components (a fey familiar). | Listed (nothing to work out) |
| Wild Resurgence | Druid 5 | 2024 | Class features row: uses ticked off, one back on a short rest, all on a long rest. Spend a spell slot for a Wild Shape use, or a Wild Shape use for a 1st-level slot (once a long rest). | Works (tracked) |
| Elemental Fury | Druid 7 | 2024 | Picked in Features & traits; the pick changes the numbers or rolls. Potent Spellcasting (+ Wisdom to druid cantrip damage) or Primal Strike (1d8 cold, fire, lightning or thunder once a turn): pick it below. | Works (choice) |
| Improved Elemental Fury | Druid 15 | 2024 | Added to attacks or spells rolled from the sheet. Primal Strike becomes 2d8; Potent Spellcasting cantrips reach 300 feet farther. | Works (applied) |
| Timeless Body | Druid 18 | 2014 | Listed in Features & traits with a short summary. You age one year for every ten. | Listed (nothing to work out) |
| Beast Spells | Druid 18 | both | Listed in Features & traits with a short summary. Cast spells in Wild Shape (not ones with costly material components). | Listed (nothing to work out) |
| Epic Boon | Druid 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |
| Archdruid | Druid 20 | 2014 | Listed in Features & traits with a short summary. Unlimited Wild Shape; ignore verbal, somatic and cheap material components of druid spells. | Listed (nothing to work out) |
| Archdruid | Druid 20 | 2024 | Listed in Features & traits with a short summary. Evergreen Wild Shape (a use back when you roll initiative with none), Nature Magician (Wild Shape uses into spell slots), Longevity. | Listed (nothing to work out) |

### Fighter

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Fighting Style | Fighter 1 | both | Picked in Features & traits; the pick changes the numbers or rolls. Pick your style below: Archery, Defense, Dueling and Great Weapon Fighting change your numbers. | Works (choice) |
| Second Wind | Fighter 1 | 2014 | Class features row: uses ticked off, back on a short or long rest. | Works (tracked) |
| Second Wind | Fighter 1 | 2024 | Class features row: uses ticked off, one back on a short rest, all on a long rest. | Works (tracked) |
| Weapon Mastery | Fighter 1 | 2024 | Added to attacks or spells rolled from the sheet. Mastery properties of 3 kinds of simple or martial weapons; change one after a long rest. Pick them in Attacks or the Inventory. | Fixed 2026-10-22 (was not on the sheet at all) |
| Action Surge | Fighter 2 | both | Class features row: uses ticked off, back on a short or long rest. | Works (tracked) |
| Tactical Mind | Fighter 2 | 2024 | Class features row: uses ticked off, one back on a short rest, all on a long rest. Spend a Second Wind to add 1d10 to a failed ability check. | Works (tracked) |
| Extra Attack | Fighter 5 | both | Listed in Features & traits with a short summary. Attack twice when you take the Attack action. | Listed (nothing to work out) |
| Tactical Shift | Fighter 5 | 2024 | Listed in Features & traits with a short summary. When you use Second Wind, move up to half your speed without provoking opportunity attacks. | Listed (nothing to work out) |
| Indomitable | Fighter 9 | both | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Tactical Master | Fighter 9 | 2024 | Listed in Features & traits with a short summary. Attacking with a weapon whose mastery you use, you can swap its property for Push, Sap or Slow. | Listed (nothing to work out) |
| Studied Attacks | Fighter 13 | 2024 | Listed in Features & traits with a short summary. Miss a creature: advantage on your next attack roll against it before the end of your next turn. | Listed (nothing to work out) |
| Epic Boon | Fighter 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |

### Monk

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Unarmored Defense | Monk 1 | both | Worked into the sheet's numbers; listed in Features & traits. With no armour or shield: AC 10 + Dexterity + Wisdom. In your AC. | Works (applied) |
| Martial Arts | Monk 1 | 2014 | Class features row: a note with its numbers. Unarmed strikes and monk weapons use the martial arts die and Dex. Unarmed strikes and monk weapons use the better of Strength and Dexterity and at least a d4 (no armour or shield); an unarmed strike as a bonus action. In your attacks. | Works (tracked and applied) |
| Martial Arts | Monk 1 | 2024 | Class features row: a note with its numbers. Unarmed strikes and monk weapons use the martial arts die and Dex. Unarmed strikes and monk weapons use the better of Strength and Dexterity and at least a d6 (no armour or shield); an unarmed strike as a bonus action. In your attacks. | Works (tracked and applied) |
| Ki | Monk 2 | 2014 | Class features row: a pool of points, back on a short or long rest. | Works (tracked) |
| Unarmored Movement | Monk 2 | both | Worked into the sheet's numbers; listed in Features & traits. +10 feet of speed with no armour or shield. In your speed. | Fixed 2026-10-22 (was added to speed in armour or with a shield too) |
| Monk's Focus | Monk 2 | 2024 | Class features row: a pool of points, back on a short or long rest. | Works (tracked) |
| Uncanny Metabolism | Monk 2 | 2024 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Deflect Missiles | Monk 3 | 2014 | Listed in Features & traits with a short summary. A reaction: reduce a ranged weapon attack's damage by 1d10 + 3; at 0, catch it and throw it back for 1 ki. | Listed (nothing to work out) |
| Deflect Attacks | Monk 3 | 2024 | Listed in Features & traits with a short summary. A reaction: reduce bludgeoning, piercing or slashing attack damage by 1d10 + 3; at 0, spend 1 Focus to send it back (2 martial arts dice). | Listed (nothing to work out) |
| Slow Fall | Monk 4 | both | Listed in Features & traits with a short summary. A reaction: take 20 less falling damage. | Listed (nothing to work out) |
| Extra Attack | Monk 5 | both | Listed in Features & traits with a short summary. Attack twice when you take the Attack action. | Listed (nothing to work out) |
| Stunning Strike | Monk 5 | 2014 | Listed in Features & traits with a short summary. Spend 1 ki point when you hit: Constitution save (DC 11) or stunned until your next turn. | Listed (nothing to work out) |
| Stunning Strike | Monk 5 | 2024 | Listed in Features & traits with a short summary. Spend 1 Focus Point (once a turn) when you hit: Constitution save (DC 11) or stunned until your next turn; on a success, speed halved and the next attack against it has advantage. | Listed (nothing to work out) |
| Ki-Empowered Strikes | Monk 6 | 2014 | Listed in Features & traits with a short summary. Your unarmed strikes count as magical. | Listed (nothing to work out) |
| Empowered Strikes | Monk 6 | 2024 | Listed in Features & traits with a short summary. Your unarmed strikes can deal force damage. | Listed (nothing to work out) |
| Evasion | Monk 7 | both | Listed in Features & traits with a short summary. A Dexterity save for half damage: none on a success, half on a failure. | Listed (nothing to work out) |
| Stillness of Mind | Monk 7 | 2014 | Listed in Features & traits with a short summary. An action: end one effect charming or frightening you. | Listed (nothing to work out) |
| Acrobatic Movement | Monk 9 | 2024 | Listed in Features & traits with a short summary. Move along vertical surfaces and across liquids on your turn. | Listed (nothing to work out) |
| Purity of Body | Monk 10 | 2014 | Listed in Features & traits with a short summary. Immune to disease and poison. | Listed (nothing to work out) |
| Heightened Focus | Monk 10 | 2024 | Listed in Features & traits with a short summary. Flurry of Blows makes three strikes; Patient Defense and Step of the Wind give more. | Listed (nothing to work out) |
| Self-Restoration | Monk 10 | 2024 | Listed in Features & traits with a short summary. End charmed, frightened or poisoned on yourself at the end of your turn; no exhaustion from going without food and water. | Listed (nothing to work out) |
| Tongue of the Sun and Moon | Monk 13 | 2014 | Listed in Features & traits with a short summary. You understand every spoken language, and every creature that knows one understands you. | Listed (nothing to work out) |
| Deflect Energy | Monk 13 | 2024 | Listed in Features & traits with a short summary. Deflect Attacks works on any damage type. | Listed (nothing to work out) |
| Diamond Soul | Monk 14 | 2014 | Worked into the sheet's numbers; listed in Features & traits. Proficient in every saving throw (in your saves); spend 1 ki to reroll a failed one. | Works (applied) |
| Disciplined Survivor | Monk 14 | 2024 | Worked into the sheet's numbers; listed in Features & traits. Proficient in every saving throw (in your saves); spend 1 Focus to reroll a failed one. | Works (applied) |
| Timeless Body | Monk 15 | 2014 | Listed in Features & traits with a short summary. No frailty of old age, no need for food or water. | Listed (nothing to work out) |
| Perfect Focus | Monk 15 | 2024 | Listed in Features & traits with a short summary. When you roll initiative with 3 Focus Points or fewer, you have 4. | Listed (nothing to work out) |
| Empty Body | Monk 18 | 2014 | Listed in Features & traits with a short summary. 4 ki: invisible and resistant to all damage but force for 1 minute; 8 ki: Astral Projection. | Listed (nothing to work out) |
| Superior Defense | Monk 18 | 2024 | Listed in Features & traits with a short summary. 3 Focus Points: resistance to all damage but force for 1 minute. | Listed (nothing to work out) |
| Epic Boon | Monk 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |
| Perfect Self | Monk 20 | 2014 | Listed in Features & traits with a short summary. When you roll initiative with no ki, you regain 4. | Listed (nothing to work out) |
| Body and Mind | Monk 20 | 2024 | Worked into the sheet's numbers; listed in Features & traits. Dexterity and Wisdom +4 (up to 25). In your scores. | Works (applied) |

### Paladin

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Divine Sense | Paladin 1 | 2014 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Lay on Hands | Paladin 1 | both | Class features row: a pool of points, back on a long rest. | Works (tracked) |
| Spellcasting | Paladin 1 | 2024 | Worked into the sheet's numbers; listed in Features & traits. Charisma spells: your spell slots, save DC and attack bonus are worked out. | Works (applied) |
| Weapon Mastery | Paladin 1 | 2024 | Added to attacks or spells rolled from the sheet. Mastery properties of 2 kinds of weapons; change one after a long rest. Pick them in Attacks or the Inventory. | Fixed 2026-10-22 (was not on the sheet at all) |
| Fighting Style | Paladin 2 | 2014 | Picked in Features & traits; the pick changes the numbers or rolls. Pick your style below. | Works (choice) |
| Spellcasting | Paladin 2 | 2014 | Worked into the sheet's numbers; listed in Features & traits. Charisma spells: your spell slots, save DC and attack bonus are worked out. | Works (applied) |
| Divine Smite | Paladin 2 | 2014 | Added to attacks or spells rolled from the sheet. On a melee hit, spend a slot: 2d8 radiant, +1d8 a slot level above 1st (5d8 at most), +1d8 against fiends and undead. Tick it on the attack. | Works (applied) |
| Fighting Style | Paladin 2 | 2024 | Picked in Features & traits; the pick changes the numbers or rolls. Pick your style below (or Blessed Warrior: two cleric cantrips). | Works (choice) |
| Divine Smite | Paladin 2 | 2024 | Added to attacks or spells rolled from the sheet. On a melee hit, spend a slot: 2d8 radiant, +1d8 a slot level above 1st, +1d8 against fiends and undead. Tick it on the attack. | Works (applied) |
| Paladin's Smite | Paladin 2 | 2024 | Class features row: uses ticked off, back on a long rest. 2024: Divine Smite once a long rest with no slot, from the attack. | Works (tracked) |
| Divine Health | Paladin 3 | 2014 | Listed in Features & traits with a short summary. Immune to disease. | Listed (nothing to work out) |
| Channel Divinity | Paladin 3 | 2014 | Class features row: uses ticked off, back on a short or long rest. | Works (tracked) |
| Channel Divinity | Paladin 3 | 2024 | Class features row: uses ticked off, one back on a short rest, all on a long rest. | Works (tracked) |
| Extra Attack | Paladin 5 | both | Listed in Features & traits with a short summary. Attack twice when you take the Attack action. | Listed (nothing to work out) |
| Faithful Steed | Paladin 5 | 2024 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Aura of Protection | Paladin 6 | both | Class features row: a note with its numbers. Added to the paladin's own saves. You and friends within 10 feet add +1 to saving throws. In your saves. | Fixed 2026-10-22 (was not added to the paladin's own saves) |
| Abjure Foes | Paladin 9 | 2024 | Listed in Features & traits with a short summary. Channel Divinity: up to 1 creatures within 60 feet make a Wisdom save or are frightened for 1 minute. | Listed (nothing to work out) |
| Aura of Courage | Paladin 10 | both | Listed in Features & traits with a short summary. You and friends within 10 feet can't be frightened while you're conscious. | Listed (nothing to work out) |
| Improved Divine Smite | Paladin 11 | 2014 | Added to attacks or spells rolled from the sheet. Every melee weapon hit deals 1d8 radiant damage more. In your damage. | Works (applied) |
| Radiant Strikes | Paladin 11 | 2024 | Added to attacks or spells rolled from the sheet. Every melee weapon or unarmed hit deals 1d8 radiant damage more. In your damage. | Works (applied) |
| Cleansing Touch | Paladin 14 | 2014 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Restoring Touch | Paladin 14 | 2024 | Listed in Features & traits with a short summary. Lay on Hands can also end blinded, charmed, deafened, frightened, paralysed or stunned (5 points each). | Listed (nothing to work out) |
| Aura Expansion | Paladin 18 | both | Worked into the sheet's numbers; listed in Features & traits. Your auras reach 30 feet. | Works (applied) |
| Epic Boon | Paladin 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |

### Ranger

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Favored Enemy | Ranger 1 | 2014 | Listed in Features & traits with a short summary. Advantage on Survival checks to track your favoured enemies and Intelligence checks to recall about them; one of their languages. | Listed (nothing to work out) |
| Natural Explorer | Ranger 1 | 2014 | Listed in Features & traits with a short summary. In your favoured terrain: double proficiency on Intelligence and Wisdom checks about it, no slowing from difficult terrain, never lost, and more. | Listed (nothing to work out) |
| Favored Enemy | Ranger 1 | 2024 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Spellcasting | Ranger 1 | 2024 | Worked into the sheet's numbers; listed in Features & traits. Wisdom spells: your spell slots, save DC and attack bonus are worked out. | Works (applied) |
| Weapon Mastery | Ranger 1 | 2024 | Added to attacks or spells rolled from the sheet. Mastery properties of 2 kinds of weapons; change one after a long rest. Pick them in Attacks or the Inventory. | Fixed 2026-10-22 (was not on the sheet at all) |
| Fighting Style | Ranger 2 | 2014 | Picked in Features & traits; the pick changes the numbers or rolls. Pick your style below. | Works (choice) |
| Spellcasting | Ranger 2 | 2014 | Worked into the sheet's numbers; listed in Features & traits. Wisdom spells: your spell slots, save DC and attack bonus are worked out. | Works (applied) |
| Deft Explorer | Ranger 2 | 2024 | Listed in Features & traits with a short summary. Expertise in one skill (mark it under Skills) and two languages. | Listed (nothing to work out) |
| Fighting Style | Ranger 2 | 2024 | Picked in Features & traits; the pick changes the numbers or rolls. Pick your style below (or Druidic Warrior: two druid cantrips). | Works (choice) |
| Primeval Awareness | Ranger 3 | 2014 | Listed in Features & traits with a short summary. Spend a spell slot: sense aberrations, celestials, dragons, elementals, fey, fiends and undead within a mile (6 in favoured terrain). | Listed (nothing to work out) |
| Extra Attack | Ranger 5 | both | Listed in Features & traits with a short summary. Attack twice when you take the Attack action. | Listed (nothing to work out) |
| Roving | Ranger 6 | 2024 | Worked into the sheet's numbers; listed in Features & traits. +10 feet of speed out of heavy armour (in your speed), and a climb and swim speed equal to it. | Works (applied) |
| Land's Stride | Ranger 8 | 2014 | Listed in Features & traits with a short summary. Non-magical difficult terrain doesn't slow you; advantage on saves against magical plants. | Listed (nothing to work out) |
| Expertise | Ranger 9 | 2024 | Listed in Features & traits with a short summary. Expertise in two more skills: mark them under Skills. | Listed (nothing to work out) |
| Hide in Plain Sight | Ranger 10 | 2014 | Listed in Features & traits with a short summary. Spend a minute camouflaging: +10 to Stealth while you stay still. | Listed (nothing to work out) |
| Tireless | Ranger 10 | 2024 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Relentless Hunter | Ranger 13 | 2024 | Listed in Features & traits with a short summary. Taking damage can't break your concentration on Hunter's Mark. | Listed (nothing to work out) |
| Vanish | Ranger 14 | 2014 | Listed in Features & traits with a short summary. Hide as a bonus action; you can't be tracked by non-magical means. | Listed (nothing to work out) |
| Nature's Veil | Ranger 14 | 2024 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Precise Hunter | Ranger 17 | 2024 | Listed in Features & traits with a short summary. Advantage on attack rolls against the creature marked by your Hunter's Mark. | Listed (nothing to work out) |
| Feral Senses | Ranger 18 | 2014 | Listed in Features & traits with a short summary. No disadvantage attacking creatures you can't see; you know where invisible creatures within 30 feet are. | Listed (nothing to work out) |
| Feral Senses | Ranger 18 | 2024 | Listed in Features & traits with a short summary. Blindsight 30 feet. | Listed (nothing to work out) |
| Epic Boon | Ranger 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |
| Foe Slayer | Ranger 20 | 2014 | Listed in Features & traits with a short summary. Once a turn, add +0 to an attack or damage roll against a favoured enemy. | Listed (nothing to work out) |
| Foe Slayer | Ranger 20 | 2024 | Added to attacks or spells rolled from the sheet. Hunter's Mark deals 1d10 instead of 1d6. In your damage. | Works (applied) |

### Rogue

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Expertise | Rogue 1 | 2014 | Listed in Features & traits with a short summary. Double proficiency in two skills (or thieves' tools): mark them Expertise under Skills. | Listed (nothing to work out) |
| Sneak Attack | Rogue 1 | both | Class features row: a note with its numbers. 1d6 more damage once a turn with a finesse or ranged weapon, with advantage or an ally next to the target. Tick it on the attack. | Fixed 2026-10-22 (was only a note; nothing added its dice to an attack) |
| Thieves' Cant | Rogue 1 | 2014 | Listed in Features & traits with a short summary. The secret mix of dialect, jargon and code of thieves: hide messages in ordinary talk, and read their secret signs. | Fixed 2026-10-22 (was nowhere on the sheet) |
| Expertise | Rogue 1 | 2024 | Listed in Features & traits with a short summary. Double proficiency in two skills: mark them Expertise under Skills. | Listed (nothing to work out) |
| Thieves' Cant | Rogue 1 | 2024 | Listed in Features & traits with a short summary. The secret mix of dialect, jargon and code of thieves: hide messages in ordinary talk, and read their secret signs; you also know one more language. | Fixed 2026-10-22 (was nowhere on the sheet) |
| Weapon Mastery | Rogue 1 | 2024 | Added to attacks or spells rolled from the sheet. Mastery properties of 2 kinds of weapons with Finesse or Light (daggers and shortbows, say); change one after a long rest. Pick them in Attacks or the Inventory. | Fixed 2026-10-22 (was not on the sheet at all) |
| Cunning Action | Rogue 2 | both | Listed in Features & traits with a short summary. Dash, Disengage or Hide as a bonus action. | Listed (nothing to work out) |
| Steady Aim | Rogue 3 | 2024 | Listed in Features & traits with a short summary. A bonus action if you haven't moved: advantage on your next attack this turn (your speed is 0 until the end of it). | Listed (nothing to work out) |
| Uncanny Dodge | Rogue 5 | both | Listed in Features & traits with a short summary. A reaction when an attacker you can see hits you: halve the damage. | Listed (nothing to work out) |
| Cunning Strike | Rogue 5 | 2024 | Listed in Features & traits with a short summary. When you deal Sneak Attack damage, give up dice for an effect: Poison (1d6), Trip (1d6), Withdraw (1d6). | Listed (nothing to work out) |
| Evasion | Rogue 7 | both | Listed in Features & traits with a short summary. A Dexterity save for half damage: none on a success, half on a failure. | Listed (nothing to work out) |
| Reliable Talent | Rogue 7 | 2024 | Worked into the sheet's numbers; listed in Features & traits. A d20 of 9 or lower on a check with a skill or tool you're proficient in counts as 10 (rolled so from your skills). | Works (applied) |
| Reliable Talent | Rogue 11 | 2014 | Worked into the sheet's numbers; listed in Features & traits. A d20 of 9 or lower on a check you're proficient in counts as 10 (rolled so from your skills). | Works (applied) |
| Improved Cunning Strike | Rogue 11 | 2024 | Listed in Features & traits with a short summary. Use two Cunning Strike effects at once. | Listed (nothing to work out) |
| Blindsense | Rogue 14 | 2014 | Listed in Features & traits with a short summary. You know where hidden or invisible creatures within 10 feet are, if you can hear. | Listed (nothing to work out) |
| Devious Strikes | Rogue 14 | 2024 | Listed in Features & traits with a short summary. New Cunning Strike effects: Daze (2d6), Knock Out (6d6), Obscure (3d6). | Listed (nothing to work out) |
| Slippery Mind | Rogue 15 | 2014 | Worked into the sheet's numbers; listed in Features & traits. Proficient in Wisdom saving throws. In your saves. | Works (applied) |
| Slippery Mind | Rogue 15 | 2024 | Worked into the sheet's numbers; listed in Features & traits. Proficient in Wisdom and Charisma saving throws. In your saves. | Works (applied) |
| Elusive | Rogue 18 | both | Listed in Features & traits with a short summary. No attack roll has advantage against you while you aren't incapacitated. | Listed (nothing to work out) |
| Epic Boon | Rogue 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |
| Stroke of Luck | Rogue 20 | both | Class features row: uses ticked off, back on a short or long rest. | Works (tracked) |

### Sorcerer

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Spellcasting | Sorcerer 1 | both | Worked into the sheet's numbers; listed in Features & traits. Charisma spells: your spell slots, save DC and attack bonus are worked out. | Works (applied) |
| Innate Sorcery | Sorcerer 1 | 2024 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Font of Magic | Sorcerer 2 | both | Class features row: a pool of points, back on a long rest. Sorcery points, and Flexible Casting between points and slots (buttons in Class features). | Works (tracked) |
| Metamagic | Sorcerer 2 | 2024 | Listed in Features & traits with a short summary. 2 Metamagic options (Careful, Distant, Empowered, Extended, Heightened, Quickened, Seeking, Subtle, Transmuted, Twinned), paid with sorcery points. | Listed (nothing to work out) |
| Metamagic | Sorcerer 3 | 2014 | Listed in Features & traits with a short summary. 2 Metamagic options (Careful, Distant, Empowered, Extended, Heightened, Quickened, Subtle, Twinned), paid with sorcery points. | Listed (nothing to work out) |
| Sorcerous Restoration | Sorcerer 5 | 2024 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Sorcery Incarnate | Sorcerer 7 | 2024 | Class features row: uses ticked off, back on a long rest. With no Innate Sorcery uses, spend 2 sorcery points; two Metamagic options on one spell while it's on. | Works (tracked) |
| Epic Boon | Sorcerer 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |
| Sorcerous Restoration | Sorcerer 20 | 2014 | Class features row: a pool of points, back on a long rest. A short rest gives 4 sorcery points back. | Works (tracked) |
| Arcane Apotheosis | Sorcerer 20 | 2024 | Listed in Features & traits with a short summary. While Innate Sorcery is on, one Metamagic option a turn costs no sorcery points. | Listed (nothing to work out) |

### Warlock

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Pact Magic | Warlock 1 | both | Worked into the sheet's numbers; listed in Features & traits. Charisma spells: your Pact Magic slots (all the same level, back on a short rest), save DC and attack bonus are worked out. | Works (applied) |
| Eldritch Invocations | Warlock 1 | 2024 | Picked in Features & traits; the pick changes the numbers or rolls. 1 invocations (Pact of the Blade, Chain or Tome among them). Write them in Features & traits; Agonizing Blast, Eldritch Smite and Lifedrinker are picked below and change your rolls. | Works (choice) |
| Eldritch Invocations | Warlock 2 | 2014 | Picked in Features & traits; the pick changes the numbers or rolls. 2 invocations. Write them in Features & traits; Agonizing Blast, Eldritch Smite and Lifedrinker are picked below and change your rolls. | Works (choice) |
| Magical Cunning | Warlock 2 | 2024 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Pact Boon | Warlock 3 | 2014 | Listed in Features & traits with a short summary. Pact of the Chain (a special familiar), the Blade (a pact weapon) or the Tome (three more cantrips). | Listed (nothing to work out) |
| Contact Patron | Warlock 9 | 2024 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Mystic Arcanum | Warlock 11 | both | Class features row: uses ticked off, back on a long rest. One spell of 6th level (7th at 13, 8th at 15, 9th at 17) once a long rest without a slot. | Works (tracked) |
| Mystic Arcanum (7th level) | Warlock 13 | both | Class features row: uses ticked off, back on a long rest. Cast your 7th-level arcanum spell once without a slot. | Works (tracked) |
| Mystic Arcanum (8th level) | Warlock 15 | both | Class features row: uses ticked off, back on a long rest. Cast your 8th-level arcanum spell once without a slot. | Works (tracked) |
| Mystic Arcanum (9th level) | Warlock 17 | both | Class features row: uses ticked off, back on a long rest. Cast your 9th-level arcanum spell once without a slot. | Works (tracked) |
| Epic Boon | Warlock 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |
| Eldritch Master | Warlock 20 | 2014 | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Eldritch Master | Warlock 20 | 2024 | Class features row: uses ticked off, back on a long rest. Magical Cunning gives back all your Pact Magic slots. | Works (tracked) |

### Wizard

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Spellcasting | Wizard 1 | both | Worked into the sheet's numbers; listed in Features & traits. Intelligence spells from your spellbook: your spell slots, save DC and attack bonus are worked out. | Works (applied) |
| Arcane Recovery | Wizard 1 | both | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Ritual Adept | Wizard 1 | 2024 | Listed in Features & traits with a short summary. Cast any ritual spell in your spellbook as a ritual without preparing it. | Listed (nothing to work out) |
| Scholar | Wizard 2 | 2024 | Listed in Features & traits with a short summary. Expertise in one of Arcana, History, Investigation, Medicine, Nature or Religion: mark it under Skills. | Listed (nothing to work out) |
| Memorize Spell | Wizard 5 | 2024 | Listed in Features & traits with a short summary. After a short rest, swap one prepared spell for another in your spellbook. | Listed (nothing to work out) |
| Spell Mastery | Wizard 18 | both | Listed in Features & traits with a short summary. One 1st-level and one 2nd-level spell you can cast at their lowest level without a slot. | Listed (nothing to work out) |
| Epic Boon | Wizard 19 | 2024 | Listed in Features & traits with a short summary. An Epic Boon feat (or another feat). | Listed (nothing to work out) |
| Signature Spells | Wizard 20 | both | Class features row: uses ticked off, back on a short or long rest. | Works (tracked) |

### Artificer

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Magical Tinkering | Artificer 1 | both | Listed in Features & traits with a short summary. Give a Tiny object a small magical property (light, a recorded message, a smell...); up to 1 at once. | Listed (nothing to work out) |
| Spellcasting | Artificer 1 | both | Worked into the sheet's numbers; listed in Features & traits. Intelligence spells through tools: your spell slots, save DC and attack bonus are worked out. | Works (applied) |
| Infuse Item | Artificer 2 | both | Class features row: a note with its numbers. | Works (tracked) |
| The Right Tool for the Job | Artificer 3 | both | Listed in Features & traits with a short summary. An hour with thieves' tools or artisan's tools: make a set of artisan's tools. | Listed (nothing to work out) |
| Tool Expertise | Artificer 6 | both | Listed in Features & traits with a short summary. Double proficiency with any tool you're proficient with. | Listed (nothing to work out) |
| Flash of Genius | Artificer 7 | both | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Magic Item Adept | Artificer 10 | both | Worked into the sheet's numbers; listed in Features & traits. Attune to four magic items (five at 14th, six at 18th: in your Inventory); common and uncommon items cost less to make. | Works (applied) |
| Spell-Storing Item | Artificer 11 | both | Class features row: uses ticked off, back on a long rest. | Works (tracked) |
| Magic Item Savant | Artificer 14 | both | Listed in Features & traits with a short summary. Ignore class, race, spell and level requirements on magic items. | Listed (nothing to work out) |
| Soul of Artifice | Artificer 20 | both | Worked into the sheet's numbers; listed in Features & traits. +1 to all saving throws for each magic item you're attuned to (in your saves); end an infusion to drop to 1 hit point instead of 0. | Works (applied) |

## Subclasses

Subclass features with uses or numbers are rows of the Class features box (under a Subclass heading). Those marked *applied* are also worked into the numbers or rolls. Subclass features with no uses and nothing to work out (most ribbons) aren't listed on the sheet; the player writes them in Features & traits. That is a gap left for later (see HANDOFF.md).

### Barbarian subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Frenzy | Barbarian (Path of the Berserker) 3 | 2014 | Class features row: a note with its numbers. 2024: a tick box on Strength attacks while raging adds the d6s. While raging you can go into a frenzy: a melee weapon attack as a bonus action on each of your turns. When the rage ends you suffer a level of exhaustion. | Works (applied) |
| Frenzy | Barbarian (Path of the Berserker) 3 | 2024 | Class features row: a note with its numbers. 2024: a tick box on Strength attacks while raging adds the d6s. Reckless Attack while raging: the first creature you hit on your turn takes 2d6 more damage. | Works (applied) |
| Intimidating Presence | Barbarian (Path of the Berserker) 10 | 2014 | Class features row: a note with its numbers. An action: frighten a creature within 30 feet (Wisdom save, DC 12). | Note only |
| Intimidating Presence | Barbarian (Path of the Berserker) 10 | 2024 | Class features row: uses ticked off, back on a long rest. A bonus action: creatures you choose within 30 feet make a Wisdom save (DC 12) or are frightened for 1 minute. Spend a Rage use to get it back. | Works (tracked) |
| Totem Spirit | Barbarian (Path of the Totem Warrior) 3 | 2014 | Class features row: a note with its numbers. While raging: Bear, resistance to all damage but psychic; Eagle, others have disadvantage on opportunity attacks against you and you can Dash as a bonus action; Wolf, friends… | Note only |
| Rage of the Wilds | Barbarian (Path of the Wild Heart) 3 | 2024 | Class features row: a note with its numbers. When you rage, pick one: Bear (resistance to all damage but force, necrotic, psychic and radiant), Eagle (Dash and Disengage as part of the bonus action) or Wolf (friends have… | Note only |
| Vitality of the Tree | Barbarian (Path of the World Tree) 3 | 2024 | Class features row: a note with its numbers. When you rage: 3 temporary hit points. At the start of each of your turns while raging, give a creature within 10 feet 2d6 temporary hit points. | Note only |
| Divine Fury | Barbarian (Path of the Zealot) 3 | 2024 | Class features row: a note with its numbers. Added to the first hit each turn while raging (a tick box). While raging, the first creature you hit on each of your turns takes 1d6 + 1 necrotic or radiant damage more. | Works (applied) |
| Warrior of the Gods | Barbarian (Path of the Zealot) 3 | 2024 | Class features row: a pool of points, back on a long rest. A pool of d12s: a bonus action to spend any number, roll them and regain that many hit points. | Works (tracked) |
| Zealous Presence | Barbarian (Path of the Zealot) 10 | 2024 | Class features row: uses ticked off, back on a long rest. A bonus action: up to ten creatures within 60 feet have advantage on attacks and saves until your next turn. Spend a Rage use to get it back. | Works (tracked) |
| Rage of the Gods | Barbarian (Path of the Zealot) 14 | 2024 | Class features row: uses ticked off, back on a long rest. When you rage, take a divine form for 1 minute: fly, resist necrotic, psychic and radiant damage, and spend a Rage use to keep a creature from dropping to 0. | Works (tracked) |
| Ancestral Protectors | Barbarian (Path of the Ancestral Guardian) 3 | both | Class features row: a note with its numbers. While raging, the first creature you hit on your turn has disadvantage on attacks against anyone else, who resists its damage. | Note only |
| Consult the Spirits | Barbarian (Path of the Ancestral Guardian) 10 | both | Class features row: uses ticked off, back on a short or long rest. Cast Augury or Clairvoyance without a slot (Wisdom). | Works (tracked) |
| Storm Aura | Barbarian (Path of the Storm Herald) 3 | both | Class features row: a note with its numbers. While raging, a 10-foot aura (again each turn as a bonus action). Desert: 2 fire damage to others in it. Sea: a creature takes 1d6 lightning (Dexterity save, DC 10, for half).… | Note only |
| Divine Fury | Barbarian (Path of the Zealot) 3 | both | Class features row: a note with its numbers. Added to the first hit each turn while raging (a tick box). While raging, the first creature you hit with a weapon on each of your turns takes 1d6 + 1 necrotic or radiant damage more. Warrior of the Gods: no material components to raise… | Works (applied) |
| Zealous Presence | Barbarian (Path of the Zealot) 10 | both | Class features row: uses ticked off, back on a long rest. A bonus action: up to ten creatures within 60 feet have advantage on attacks and saves until your next turn. | Works (tracked) |
| Form of the Beast | Barbarian (Path of the Beast) 3 | both | Class features row: a note with its numbers. When you rage, grow a bite (1d8; heal 2 once a turn when bloodied), claws (1d6, an extra claw attack) or a tail (1d8, reach; a reaction for +1d8 AC). | Note only |
| Infectious Fury | Barbarian (Path of the Beast) 10 | both | Class features row: uses ticked off, back on a long rest. When your natural weapons hit: Wisdom save (DC 12) or it attacks another creature, or takes 2d12 psychic damage. | Works (tracked) |
| Call the Hunt | Barbarian (Path of the Beast) 14 | both | Class features row: uses ticked off, back on a long rest. Used when you rage (see Form of the Beast). | Works (tracked) |
| Magic Awareness | Barbarian (Path of Wild Magic) 3 | both | Class features row: uses ticked off, back on a long rest. An action: sense spells and magic items within 60 feet. Wild Surge: when you rage, roll on the Wild Magic table (save DC 10). | Works (tracked) |
| Bolstering Magic | Barbarian (Path of Wild Magic) 6 | both | Class features row: uses ticked off, back on a long rest. An action: a creature adds 1d3 to attacks and checks for 10 minutes, or regains a spell slot of level 1d3. | Works (tracked) |
| Giant's Havoc | Barbarian (Path of the Giant) 3 | both | Class features row: a note with its numbers. Giant's Power: Druidcraft or Thaumaturgy, and Giant language. While raging: Large size if there's room, reach +5 feet, and Crushing Throw (thrown weapons deal your Rage damage… | Note only |

### Bard subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Cutting Words | Bard (College of Lore) 3 | both | Class features row: a note with its numbers. A reaction: spend a Bardic Inspiration and take the die from a creature's attack roll, ability check or damage roll. | Note only |
| Combat Inspiration | Bard (College of Valor) 3 | both | Class features row: a note with its numbers. A creature with your Bardic Inspiration can add the die to a weapon damage roll, or to its AC against one attack. | Note only |
| Dazzling Footwork | Bard (College of Dance) 3 | 2024 | Class features row: a note with its numbers. AC 10+Dex+Cha without armour; unarmed strikes use Dex and the Bardic Inspiration die. Without armour or a shield: AC 10 (10 + Dex + Cha), and your unarmed strikes can use Dexterity and deal your Bardic Inspiration die. Spending a Bardic Inspiration lets you make… | Works (applied) |
| Beguiling Magic | Bard (College of Glamour) 3 | 2024 | Class features row: uses ticked off, back on a long rest. After casting an enchantment or illusion spell: a creature within 60 feet makes a Wisdom save (DC 10) or is charmed or frightened for 1 minute. Spend a Bardic Inspiration to get… | Works (tracked) |
| Mantle of Inspiration | Bard (College of Glamour) 3 | 2024 | Class features row: a note with its numbers. A bonus action: spend a Bardic Inspiration and roll it; up to 1 creatures within 60 feet gain twice the roll in temporary hit points and can move without opportunity attacks. | Note only |
| Mantle of Majesty | Bard (College of Glamour) 6 | 2024 | Class features row: uses ticked off, back on a long rest. A bonus action: cast Command without a slot, and again as a bonus action each turn for 1 minute. Spend a 3rd-level or higher slot to get it back. | Works (tracked) |
| Unbreakable Majesty | Bard (College of Glamour) 14 | 2024 | Class features row: uses ticked off, back on a short or long rest. A bonus action for 1 minute: a creature that hits you for the first time on a turn makes a Charisma save (DC 13) or the attack misses. | Works (tracked) |
| Mantle of Inspiration | Bard (College of Glamour) 3 | both | Class features row: a note with its numbers. A bonus action: spend a Bardic Inspiration; up to 1 creatures within 60 feet gain 5 temporary hit points and can move without opportunity attacks. | Note only |
| Enthralling Performance | Bard (College of Glamour) 3 | both | Class features row: uses ticked off, back on a short or long rest. After performing for at least 1 minute: up to 1 listeners make a Wisdom save (DC 10) or are charmed for 1 hour. | Works (tracked) |
| Mantle of Majesty | Bard (College of Glamour) 6 | both | Class features row: uses ticked off, back on a long rest. A bonus action: cast Command without a slot, and again as a bonus action each turn for 1 minute (concentration). | Works (tracked) |
| Unbreakable Majesty | Bard (College of Glamour) 14 | both | Class features row: uses ticked off, back on a short or long rest. A bonus action for 1 minute: a creature attacking you for the first time on a turn makes a Charisma save (DC 13) or picks another target. | Works (tracked) |
| Blade Flourish | Bard (College of Swords) 3 | both | Class features row: a note with its numbers. Attack action: +10 feet speed; on a hit, spend a Bardic Inspiration for Defensive (die to AC), Slashing (die to a nearby creature) or Mobile (die damage and push) Flourish. | Note only |
| Psychic Blades | Bard (College of Whispers) 3 | both | Class features row: a note with its numbers. On a weapon hit, once a turn: spend a Bardic Inspiration for 2d6 psychic damage more. | Note only |
| Words of Terror | Bard (College of Whispers) 3 | both | Class features row: uses ticked off, back on a short or long rest. After talking alone with a creature for 1 minute: Wisdom save (DC 10) or frightened of you or someone you choose for 1 hour. | Works (tracked) |
| Mantle of Whispers | Bard (College of Whispers) 6 | both | Class features row: uses ticked off, back on a short or long rest. A reaction when a humanoid dies within 30 feet: take its shadow, and take on its appearance and surface memories for 1 hour. | Works (tracked) |
| Shadow Lore | Bard (College of Whispers) 14 | both | Class features row: uses ticked off, back on a long rest. An action: a creature within 30 feet makes a Wisdom save (DC 13) or is charmed and obeys you for 8 hours, fearing you'll reveal its secret. | Works (tracked) |
| Mote of Potential | Bard (College of Creation) 3 | both | Class features row: a note with its numbers. Your Bardic Inspiration comes with a mote: on an ability check roll the die twice; on an attack the target and those within 5 feet take the die's roll in thunder damage… | Note only |
| Performance of Creation | Bard (College of Creation) 3 | both | Class features row: uses ticked off, back on a long rest. An action: make a nonmagical item worth up to 60 gp, Medium or smaller. Spend a 2nd-level or higher slot to use it again. | Works (tracked) |
| Animating Performance | Bard (College of Creation) 6 | both | Class features row: uses ticked off, back on a long rest. An action: animate a Large or smaller item for 1 hour (AC 16, 40 hit points, Irrepressible Dance). Spend a 3rd-level or higher slot to use it again. | Works (tracked) |
| Silver Tongue | Bard (College of Eloquence) 3 | both | Class features row: a note with its numbers. Persuasion and Deception checks roll at least 10. Unsettling Words: a bonus action, spend a Bardic Inspiration to take the roll off a creature's next save. | Note only |
| Universal Speech | Bard (College of Eloquence) 6 | both | Class features row: uses ticked off, back on a long rest. An action: up to 1 creatures understand you for 1 hour. Spend a spell slot to use it again. | Works (tracked) |
| Infectious Inspiration | Bard (College of Eloquence) 14 | both | Class features row: uses ticked off, back on a long rest. A reaction when a creature uses your Bardic Inspiration and succeeds: give one to another creature, without spending one. | Works (tracked) |

### Cleric subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Domain Channel Divinity | Cleric (Knowledge Domain) 2 | 2014 | Class features row: a note with its numbers. Knowledge of the Ages: proficiency with a skill or tool for 10 minutes. | Note only |
| Visions of the Past | Cleric (Knowledge Domain) 17 | 2014 | Class features row: uses ticked off, back on a short or long rest. Meditate to see visions of an object's past owners or of recent events where you are. | Works (tracked) |
| Disciple of Life | Cleric (Life Domain) 1 | both | Class features row: a note with its numbers. Added to the healing of 1st-level and higher spells. Healing spells of 1st level or higher heal 2 + the spell's level more. | Works (applied) |
| Preserve Life | Cleric (Life Domain) 2 | both | Class features row: a note with its numbers. Channel Divinity: restore 10 hit points shared among creatures within 30 feet, none above half its maximum. | Note only |
| Warding Flare | Cleric (Light Domain) 1 | both | Class features row: uses ticked off, back on a long rest. A reaction: an attacker within 30 feet has disadvantage on its attack roll. | Works (tracked) |
| Radiance of the Dawn | Cleric (Light Domain) 2 | both | Class features row: a note with its numbers. Channel Divinity: magical darkness within 30 feet ends, and enemies there take 2d10 + 2 radiant damage (Constitution save, DC 10, for half). | Note only |
| Corona of Light | Cleric (Light Domain) 17 | 2014 | Class features row: a note with its numbers. An action for 1 minute: bright light 60 feet; enemies in it have disadvantage on saves against fire and radiant spells. | Note only |
| Corona of Light | Cleric (Light Domain) 17 | 2024 | Class features row: uses ticked off, back on a long rest. An action for 1 minute: bright light 60 feet; enemies in it have disadvantage on saves against fire and radiant spells. | Works (tracked) |
| Charm Animals and Plants | Cleric (Nature Domain) 2 | 2014 | Class features row: a note with its numbers. Channel Divinity: beasts and plant creatures within 30 feet make a Wisdom save (DC 10) or are charmed for 1 minute. | Note only |
| Wrath of the Storm | Cleric (Tempest Domain) 1 | 2014 | Class features row: uses ticked off, back on a long rest. A reaction when a creature within 5 feet hits you: 2d8 lightning or thunder damage (Dexterity save, DC 10, for half). | Works (tracked) |
| Destructive Wrath | Cleric (Tempest Domain) 2 | 2014 | Class features row: a note with its numbers. Channel Divinity: deal the most lightning or thunder damage the dice can roll instead of rolling. | Note only |
| Invoke Duplicity | Cleric (Trickery Domain) 2 | both | Class features row: a note with its numbers. Channel Divinity: an illusion of you for 1 minute (concentration); cast spells from its space, and advantage on attacks against a creature next to it. | Note only |
| War Priest | Cleric (War Domain) 1 | 2014 | Class features row: uses ticked off, back on a long rest. After taking the Attack action, one weapon attack as a bonus action. | Works (tracked) |
| War Priest | Cleric (War Domain) 1 | 2024 | Class features row: uses ticked off, back on a short or long rest. After taking the Attack action, one weapon attack as a bonus action. | Works (tracked) |
| Guided Strike | Cleric (War Domain) 2 | 2014 | Class features row: a note with its numbers. Channel Divinity: +10 to an attack roll. | Note only |
| Guided Strike | Cleric (War Domain) 2 | 2024 | Class features row: a note with its numbers. Channel Divinity: +10 to an attack roll, yours or a creature's within 30 feet. | Note only |
| Blessing of the Forge | Cleric (Forge Domain) 1 | both | Class features row: uses ticked off, back on a long rest. At the end of a long rest, make a weapon or armour +1. | Works (tracked) |
| Circle of Mortality | Cleric (Grave Domain) 1 | both | Class features row: a note with its numbers. Healing a creature at 0 hit points uses the highest number on each die. Spare the Dying as a bonus action at 30 feet. | Note only |
| Eyes of the Grave | Cleric (Grave Domain) 1 | both | Class features row: uses ticked off, back on a long rest. An action: sense undead within 60 feet until the end of your next turn. | Works (tracked) |
| Sentinel at Death's Door | Cleric (Grave Domain) 6 | both | Class features row: uses ticked off, back on a long rest. A reaction: a critical hit on a creature within 30 feet becomes a normal hit. | Works (tracked) |
| Voice of Authority | Cleric (Order Domain) 1 | both | Class features row: a note with its numbers. When your spell of 1st level or higher targets an ally, they can make a weapon attack as a reaction. | Note only |
| Embodiment of the Law | Cleric (Order Domain) 6 | both | Class features row: uses ticked off, back on a long rest. Cast an enchantment spell of 1st level or higher as a bonus action instead of an action. | Works (tracked) |
| Emboldening Bond | Cleric (Peace Domain) 1 | both | Class features row: uses ticked off, back on a long rest. An action: bond 2 creatures within 30 feet for 10 minutes; while within 30 feet of each other, each can add a d4 to one roll a turn. | Works (tracked) |
| Eyes of Night | Cleric (Twilight Domain) 1 | both | Class features row: uses ticked off, back on a long rest. Darkvision 300 feet. An action: share it with up to 1 creatures for 1 hour; spend a spell slot to share it again. Vigilant Blessing: advantage on one creature's next initiative. | Works (tracked) |
| Steps of Night | Cleric (Twilight Domain) 6 | both | Class features row: uses ticked off, back on a long rest. A bonus action in dim light or darkness: a flying speed equal to your walking speed for 1 minute. | Works (tracked) |
| Reaper | Cleric (Death Domain) 1 | both | Class features row: a note with its numbers. Your necromancy cantrips that target one creature can target two within 5 feet of each other. | Note only |

### Druid subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Natural Recovery | Druid (Circle of the Land) 2 | 2014 | Class features row: uses ticked off, back on a long rest. During a short rest, get back spell slots adding up to 1 levels (none of 6th level or higher). | Works (tracked) |
| Natural Recovery | Druid (Circle of the Land) 6 | 2024 | Class features row: uses ticked off, back on a long rest. During a short rest, get back spell slots adding up to 3 levels (none of 6th level or higher). You can also cast one of your circle spells without a slot, once per long rest. | Works (tracked) |
| Land's Aid | Druid (Circle of the Land) 3 | 2024 | Class features row: a note with its numbers. Spend a Wild Shape use: creatures in a 10-foot sphere within 60 feet take 2d6 necrotic damage (Constitution save, DC 10, for half), and one creature there regains 2d6 hit points. | Note only |
| Combat Wild Shape | Druid (Circle of the Moon) 2 | 2014 | Class features row: a note with its numbers. Wild Shape as a bonus action. While in a form: a bonus action, spend a spell slot to regain 1d8 hit points per level of the slot. | Note only |
| Moonlight Step | Druid (Circle of the Moon) 10 | 2024 | Class features row: uses ticked off, back on a long rest. A bonus action: teleport 30 feet and have advantage on your next spell attack this turn. Spend a 2nd-level or higher slot to get one back. | Works (tracked) |
| Improved Circle Forms | Druid (Circle of the Moon) 6 | 2024 | Class features row: a note with its numbers. In a form: your attacks can deal radiant damage, and you add +0 to Constitution saves. | Note only |
| Wrath of the Sea | Druid (Circle of the Sea) 3 | 2024 | Class features row: a note with its numbers. Spend a Wild Shape use: a 5-foot emanation for 10 minutes (10 feet from 10th level). A bonus action: a creature in it takes 1d6 cold damage (Constitution save, DC 10) and is… | Note only |
| Star Map | Druid (Circle of the Stars) 3 | 2024 | Class features row: uses ticked off, back on a long rest. Cast Guiding Bolt without a slot. You also know Guidance. | Works (tracked) |
| Starry Form | Druid (Circle of the Stars) 3 | 2024 | Class features row: a note with its numbers. Spend a Wild Shape use for 10 minutes: Archer (a bonus action, a ranged spell attack for 1d8 + 0 radiant), Chalice (healing spells heal someone 1d8 + 0 more) or Dragon… | Note only |
| Cosmic Omen | Druid (Circle of the Stars) 6 | 2024 | Class features row: uses ticked off, back on a long rest. After a long rest roll a die: even (Weal) or odd (Woe). A reaction: add or take away 1d6 from a creature's d20 test. | Works (tracked) |
| Balm of the Summer Court | Druid (Circle of Dreams) 2 | both | Class features row: a pool of points, back on a long rest. A pool of d6s: a bonus action to spend up to 1 on a creature within 120 feet; it regains that many and gains 1 temporary hit point per die. | Works (tracked) |
| Hidden Paths | Druid (Circle of Dreams) 10 | both | Class features row: uses ticked off, back on a long rest. A bonus action: teleport 60 feet, or an action to teleport a willing creature you touch 30 feet. | Works (tracked) |
| Walker in Dreams | Druid (Circle of Dreams) 14 | both | Class features row: uses ticked off, back on a long rest. After a short rest: cast Dream, Scrying or Teleportation Circle (to where you last slept) without a slot. | Works (tracked) |
| Spirit Totem | Druid (Circle of the Shepherd) 2 | both | Class features row: uses ticked off, back on a short or long rest. A bonus action for 1 minute: Bear (7 temporary hit points to creatures in a 30-foot aura; advantage on Strength), Hawk (a reaction to give advantage on an attack) or Unicorn… | Works (tracked) |
| Faithful Summons | Druid (Circle of the Shepherd) 14 | both | Class features row: uses ticked off, back on a long rest. When you drop to 0 hit points or are incapacitated: four beasts of CR 2 or lower appear to protect you for 1 hour (Conjure Animals). | Works (tracked) |
| Halo of Spores | Druid (Circle of Spores) 2 | both | Class features row: a note with its numbers. A reaction: a creature within 10 feet takes 4 necrotic damage (1d4; Constitution save, DC 10). Symbiotic Entity: spend a Wild Shape use for 8 temporary hit points; while they… | Note only |
| Fungal Infestation | Druid (Circle of Spores) 6 | both | Class features row: uses ticked off, back on a long rest. A reaction when a beast or humanoid dies within 10 feet: it rises as a zombie with 1 hit point for 1 hour. | Works (tracked) |
| Star Map | Druid (Circle of the Stars) 2 | both | Class features row: uses ticked off, back on a long rest. Cast Guiding Bolt without a slot. You also know Guidance. | Works (tracked) |
| Starry Form | Druid (Circle of the Stars) 2 | both | Class features row: a note with its numbers. Spend a Wild Shape use for 10 minutes: Archer (a bonus action, a ranged spell attack for 1d8 + 0 radiant), Chalice (healing spells heal someone 1d8 + 0 more) or Dragon… | Note only |
| Cosmic Omen | Druid (Circle of the Stars) 6 | both | Class features row: uses ticked off, back on a long rest. After a long rest roll a die: even (Weal) or odd (Woe). A reaction: add or take away 1d6 from a creature's attack, save or check within 30 feet. | Works (tracked) |
| Summon Wildfire Spirit | Druid (Circle of Wildfire) 2 | both | Class features row: a note with its numbers. Spend a Wild Shape use: a wildfire spirit for 1 hour (AC 13, 15 hit points; arrival 2d6 fire, Dexterity save DC 10; Flame Seed 1d6 + 2). | Note only |
| Cauterizing Flames | Druid (Circle of Wildfire) 10 | both | Class features row: uses ticked off, back on a long rest. When a creature dies within 30 feet of your spirit: a flame; a reaction when someone enters it to heal or hurt them 2d10 + 0. | Works (tracked) |
| Blazing Revival | Druid (Circle of Wildfire) 14 | both | Class features row: uses ticked off, back on a long rest. When you drop to 0 hit points with your spirit within 120 feet: it drops to 0 and you regain half your hit points and stand up. | Works (tracked) |

### Fighter subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Improved Critical | Fighter (Champion) 3 | both | Class features row: a note with its numbers. Critical hits on 19–20 (18–20 from 15th level). Your weapon attacks score a critical hit on a 19–20. | Works (applied) |
| Survivor | Fighter (Champion) 18 | 2014 | Class features row: a note with its numbers. At the start of each of your turns, if you have no more than half your hit points (and at least 1), regain 5 hit points. | Note only |
| Survivor | Fighter (Champion) 18 | 2024 | Class features row: a note with its numbers. At the start of each of your turns, if you have no more than half your hit points (and at least 1), regain 5 hit points. Defy Death: advantage on death saves, and a roll of 18–20… | Note only |
| Superiority Dice | Fighter (Battle Master) 3 | both | Class features row: uses ticked off, back on a short or long rest. A tick box on weapon attacks adds a die and spends it. d8s for your manoeuvres; save DC 10. | Works (applied) |
| Know Your Enemy | Fighter (Battle Master) 7 | 2024 | Class features row: uses ticked off, back on a long rest. A bonus action: learn a creature's immunities, resistances and vulnerabilities. Spend a superiority die to get it back. | Works (tracked) |
| War Magic | Fighter (Eldritch Knight) 7 | 2014 | Class features row: a note with its numbers. After casting a cantrip, one weapon attack as a bonus action. | Note only |
| War Magic | Fighter (Eldritch Knight) 7 | 2024 | Class features row: a note with its numbers. Replace one of your attacks with a cantrip. | Note only |
| Psionic Energy | Fighter (Psi Warrior) 3 | 2024 | Class features row: uses ticked off, one back on a short rest, all on a long rest. Psionic Strike: a tick box on weapon attacks adds the die and spends it. d6s for Protective Field, Psionic Strike and Telekinetic Movement. | Works (applied) |
| Arcane Shot | Fighter (Arcane Archer) 3 | both | Class features row: uses ticked off, back on a short or long rest. Once a turn on a hit with a bow: use one of your 2 Arcane Shot options (save DC 10). | Works (tracked) |
| Unwavering Mark | Fighter (Cavalier) 3 | both | Class features row: uses ticked off, back on a long rest. Mark a creature you hit in melee; if it hurts someone else, a bonus action: a weapon attack with advantage and 1 damage more. | Works (tracked) |
| Warding Maneuver | Fighter (Cavalier) 7 | both | Class features row: uses ticked off, back on a long rest. A reaction when a creature within 5 feet is hit: add 1d8 to its AC, and it resists the damage if it still hits. | Works (tracked) |
| Fighting Spirit | Fighter (Samurai) 3 | both | Class features row: uses ticked off, back on a long rest. A bonus action: advantage on weapon attacks this turn and 5 temporary hit points. | Works (tracked) |
| Psionic Energy | Fighter (Psi Warrior) 3 | both | Class features row: a pool of points, back on a long rest. Psionic Strike: a tick box on weapon attacks adds the die and spends it. Psionic Energy dice (d6); a bonus action to get one back once per short rest. Protective Field (a reaction, the die + 0 off damage), Psionic Strike (once a turn, the die + 0… | Works (applied) |
| Bulwark of Force | Fighter (Psi Warrior) 15 | both | Class features row: uses ticked off, back on a long rest. A bonus action: up to 1 creatures within 30 feet have half cover for 1 minute. Spend a Psionic Energy die to use it again. | Works (tracked) |
| Telekinetic Master | Fighter (Psi Warrior) 18 | both | Class features row: uses ticked off, back on a long rest. Cast Telekinesis without a slot (Intelligence), with a weapon attack as a bonus action each turn while concentrating. Spend a Psionic Energy die to use it again. | Works (tracked) |
| Giant's Might | Fighter (Rune Knight) 3 | both | Class features row: uses ticked off, back on a long rest. A tick box on weapon attacks adds the d6. A bonus action for 1 minute: Large, advantage on Strength, and 6 damage more once a turn (1d6). Runes: each once per short rest (save DC 10). | Works (applied) |
| Runic Shield | Fighter (Rune Knight) 7 | both | Class features row: uses ticked off, back on a long rest. A reaction when a creature within 60 feet is hit: the attacker rerolls and uses the new roll. | Works (tracked) |

### Monk subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Open Hand Technique | Monk (Way of the Open Hand) 3 | both | Class features row: a note with its numbers. When you hit with Flurry of Blows: knock the target prone or push it 15 feet (save DC 10), or it can't take reactions. | Note only |
| Wholeness of Body | Monk (Way of the Open Hand) 6 | 2014 | Class features row: uses ticked off, back on a long rest. An action: regain 18 hit points. | Works (tracked) |
| Wholeness of Body | Monk (Way of the Open Hand) 6 | 2024 | Class features row: uses ticked off, back on a long rest. A bonus action: regain 1d8 + 0 hit points. | Works (tracked) |
| Shadow Arts | Monk (Way of Shadow) 3 | 2014 | Class features row: a note with its numbers. Spend 2 ki to cast Darkness, Darkvision, Pass without Trace or Silence. | Note only |
| Shadow Arts | Monk (Way of Shadow) 3 | 2024 | Class features row: a note with its numbers. Spend 1 Focus Point to cast Darkness without a slot (you can see through it, and move it). Darkvision 60 feet. | Note only |
| Elemental Disciplines | Monk (Way of the Four Elements) 3 | 2014 | Class features row: a note with its numbers. Spend ki on your disciplines: at most 2 ki on one (for a spell, a point more than its level casts it higher). | Note only |
| Elemental Attunement | Monk (Way of the Four Elements) 3 | 2024 | Class features row: a note with its numbers. Spend 1 Focus Point for 10 minutes: your unarmed strikes reach 10 feet more, deal acid, cold, fire, lightning or thunder damage, and can push or pull. | Note only |
| Hand of Healing and Harm | Monk (Warrior of Mercy) 3 | 2024 | Class features row: a note with its numbers. Spend 1 Focus Point: heal a creature 1d6 + 0, or on a hit deal 1d6 + 0 necrotic damage more (once a turn). | Note only |
| Hand of Ultimate Mercy | Monk (Warrior of Mercy) 17 | 2024 | Class features row: uses ticked off, back on a long rest. Spend 5 Focus Points: bring back a creature that died in the last 24 hours with 4d10 + 0 hit points. | Works (tracked) |
| Drunken Technique | Monk (Way of the Drunken Master) 3 | both | Class features row: a note with its numbers. Flurry of Blows also gives you Disengage and +10 feet speed. | Note only |
| Path of the Kensei | Monk (Way of the Kensei) 3 | both | Class features row: a note with its numbers. 2 kensei weapons. Agile Parry: +2 AC after an unarmed strike. Kensei's Shot: a bonus action, ranged kensei weapons deal 1d4 more. | Note only |
| Radiant Sun Bolt | Monk (Way of the Sun Soul) 3 | both | Class features row: a note with its numbers. A ranged spell attack, 30 feet: 1d4 + 0 radiant (1 ki for two as a bonus action). | Note only |
| Breath of the Dragon | Monk (Way of the Ascendant Dragon) 3 | both | Class features row: uses ticked off, back on a long rest. Replace an attack: a 20-foot cone or 30-foot line, 2d4 acid, cold, fire, lightning or poison (Dexterity save, DC 10, for half). With none left, 2 ki for another. Draconic Strike:… | Works (tracked) |
| Draconic Presence | Monk (Way of the Ascendant Dragon) 3 | both | Class features row: uses ticked off, back on a long rest. A reaction: reroll a failed Intimidation or Persuasion check (used up only when it turns into a success). | Works (tracked) |
| Wings Unfurled | Monk (Way of the Ascendant Dragon) 6 | both | Class features row: uses ticked off, back on a long rest. With Step of the Wind: draconic wings, a flying speed equal to your walking speed until the end of the turn. | Works (tracked) |
| Aspect of the Wyrm | Monk (Way of the Ascendant Dragon) 11 | both | Class features row: uses ticked off, back on a long rest. A bonus action for 1 minute: a 10-foot aura of Frightful Presence (Wisdom save) or Resistance (one damage type for you and allies). 3 ki to use it again. | Works (tracked) |
| Arms of the Astral Self | Monk (Way of the Astral Self) 3 | both | Class features row: a note with its numbers. 1 ki, a bonus action, 10 minutes: astral arms (Wisdom for Strength checks and saves, reach +5, 1d4 force with Wisdom); summoning them deals 2d4 force to creatures within 10 feet… | Note only |
| Hand of Healing | Monk (Warrior of Mercy) 3 | both | Class features row: a note with its numbers. 1 ki (or in place of a Flurry strike): heal 1d4 + 0. Hand of Harm: once a turn, 1 ki for 1d4 + 0 necrotic more. | Note only |
| Hand of Ultimate Mercy | Monk (Warrior of Mercy) 17 | both | Class features row: uses ticked off, back on a long rest. 5 ki: bring back a creature that died in the last 24 hours with 4d10 + 0 hit points. | Works (tracked) |

### Paladin subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Sacred Weapon | Paladin (Oath of Devotion) 3 | 2014 | Class features row: a note with its numbers. Channel Divinity: for 1 minute add +1 to attack rolls with a weapon, which gives light. Or Turn the Unholy. | Note only |
| Sacred Weapon | Paladin (Oath of Devotion) 3 | 2024 | Class features row: a note with its numbers. Channel Divinity: for 10 minutes add +1 to attack rolls with a weapon, which gives light. | Note only |
| Holy Nimbus | Paladin (Oath of Devotion) 20 | 2014 | Class features row: uses ticked off, back on a long rest. An action for 1 minute: bright light 30 feet; enemies starting their turn in it take 10 radiant damage. | Works (tracked) |
| Holy Nimbus | Paladin (Oath of Devotion) 20 | 2024 | Class features row: uses ticked off, back on a long rest. An action for 1 minute: bright light 30 feet; enemies starting their turn in it take 10 radiant damage (plus your Charisma modifier). Spend a 5th-level slot to get it back. | Works (tracked) |
| Nature's Wrath | Paladin (Oath of the Ancients) 3 | 2014 | Class features row: a note with its numbers. Channel Divinity: vines restrain creatures you choose (one creature; Strength or Dexterity save, DC 10). Or Turn the Faithless. | Note only |
| Nature's Wrath | Paladin (Oath of the Ancients) 3 | 2024 | Class features row: a note with its numbers. Channel Divinity: vines restrain creatures you choose within 15 feet (Strength save, DC 10). | Note only |
| Undying Sentinel | Paladin (Oath of the Ancients) 15 | 2014 | Class features row: uses ticked off, back on a long rest. Drop to 1 hit point instead of 0. | Works (tracked) |
| Undying Sentinel | Paladin (Oath of the Ancients) 15 | 2024 | Class features row: uses ticked off, back on a long rest. Drop to 1 hit point instead of 0, then regain 45. | Works (tracked) |
| Elder Champion | Paladin (Oath of the Ancients) 20 | 2014 | Class features row: uses ticked off, back on a long rest. An action for 1 minute: regain 10 hit points at the start of each turn, cast paladin spells as a bonus action, enemies within 10 feet have disadvantage on saves against them. | Works (tracked) |
| Elder Champion | Paladin (Oath of the Ancients) 20 | 2024 | Class features row: uses ticked off, back on a long rest. An action for 1 minute: regain 10 hit points at the start of each turn, cast paladin spells as a bonus action, enemies within 10 feet have disadvantage on saves against them.… | Works (tracked) |
| Vow of Enmity | Paladin (Oath of Vengeance) 3 | 2014 | Class features row: a note with its numbers. Channel Divinity: advantage on attacks against a creature within 10 feet for 1 minute. Or Abjure Enemy (Wisdom save, DC 10). | Note only |
| Vow of Enmity | Paladin (Oath of Vengeance) 3 | 2024 | Class features row: a note with its numbers. Channel Divinity: advantage on attacks against a creature within 30 feet for 1 minute. | Note only |
| Avenging Angel | Paladin (Oath of Vengeance) 20 | 2014 | Class features row: uses ticked off, back on a long rest. An action for 1 hour: wings (flying speed 60) and a 30-foot aura of menace (Wisdom save or frightened). | Works (tracked) |
| Avenging Angel | Paladin (Oath of Vengeance) 20 | 2024 | Class features row: uses ticked off, back on a long rest. An action for 1 hour: wings (flying speed 60) and a 30-foot aura of menace (Wisdom save or frightened). Spend a 5th-level slot to get it back. | Works (tracked) |
| Inspiring Smite | Paladin (Oath of Glory) 3 | 2024 | Class features row: a note with its numbers. Channel Divinity after Divine Smite: share 2d8 + 3 temporary hit points among creatures within 30 feet. Peerless Athlete: Channel Divinity for an hour of advantage on Athletics… | Note only |
| Glorious Defense | Paladin (Oath of Glory) 15 | 2024 | Class features row: uses ticked off, back on a long rest. A reaction: +0 AC for you or a creature within 10 feet against an attack; if it misses, you can attack the attacker. | Works (tracked) |
| Living Legend | Paladin (Oath of Glory) 20 | 2024 | Class features row: uses ticked off, back on a long rest. A bonus action for 10 minutes: advantage on Charisma checks, a missed attack can hit once a turn, and reroll a failed save. Spend a 5th-level slot to get it back. | Works (tracked) |
| Conquest Channel Divinity | Paladin (Oath of Conquest) 3 | both | Class features row: a note with its numbers. Conquering Presence: creatures you choose within 30 feet make a Wisdom save (DC 10) or are frightened for 1 minute. Guided Strike: +10 to an attack. | Note only |
| Invincible Conqueror | Paladin (Oath of Conquest) 20 | both | Class features row: uses ticked off, back on a long rest. An action for 1 minute: resistance to all damage, an extra attack, and critical hits on 19–20. | Works (tracked) |
| Redemption Channel Divinity | Paladin (Oath of Redemption) 3 | both | Class features row: a note with its numbers. Emissary of Peace: +5 to Persuasion for 10 minutes. Rebuke the Violent: a reaction, deal an attacker's damage back to it (Wisdom save, DC 10, for half). | Note only |
| Emissary of Redemption | Paladin (Oath of Redemption) 20 | both | Class features row: a note with its numbers. Resistance to all damage from creatures, and attackers take half the damage back, unless you attack or cast a spell at them. | Note only |
| Glory Channel Divinity | Paladin (Oath of Glory) 3 | both | Class features row: a note with its numbers. Peerless Athlete: advantage on Athletics and Acrobatics for 10 minutes. Inspiring Smite: after a Divine Smite, share 2d8 + 3 temporary hit points. | Note only |
| Glorious Defense | Paladin (Oath of Glory) 15 | both | Class features row: uses ticked off, back on a long rest. A reaction: +0 AC against an attack on a creature within 10 feet; if it misses, you attack the attacker. | Works (tracked) |
| Living Legend | Paladin (Oath of Glory) 20 | both | Class features row: uses ticked off, back on a long rest. A bonus action for 1 minute: advantage on Charisma checks, turn a miss into a hit once a turn, reroll a failed save. | Works (tracked) |
| Watchers' Channel Divinity | Paladin (Oath of the Watchers) 3 | both | Class features row: a note with its numbers. Watcher's Will: up to 1 creatures have advantage on Intelligence, Wisdom and Charisma saves for 1 minute. Abjure the Extraplanar: aberrations, celestials, elementals, fey and… | Note only |
| Mortal Bulwark | Paladin (Oath of the Watchers) 20 | both | Class features row: uses ticked off, back on a long rest. A bonus action for 1 minute: truesight 120 feet, advantage against aberrations, celestials, elementals, fey and fiends, and banish them on a hit. Spend a 5th-level slot to use it… | Works (tracked) |
| Oathbreaker Channel Divinity | Paladin (Oathbreaker) 3 | both | Class features row: a note with its numbers. Control Undead: an undead within 30 feet obeys you for 24 hours (Wisdom save, DC 10). Dreadful Aspect: creatures you choose within 30 feet are frightened for 1 minute. | Note only |
| Dread Lord | Paladin (Oathbreaker) 20 | both | Class features row: uses ticked off, back on a long rest. An action for 1 minute: a 30-foot aura of gloom; frightened enemies take 4d10 psychic damage, and a bonus action for a 3d10 + 0 necrotic shadow attack. | Works (tracked) |

### Ranger subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Hunter's Prey | Ranger (Hunter) 3 | 2014 | Class features row: a note with its numbers. Colossus Slayer or Horde Breaker chosen in Features & traits; Colossus Slayer is a tick box on attacks. Colossus Slayer (1d8 more damage once a turn against a creature below its hit point maximum), Giant Killer or Horde Breaker (one more attack against another creature within 5… | Works (applied) |
| Hunter's Prey | Ranger (Hunter) 3 | 2024 | Class features row: a note with its numbers. Colossus Slayer or Horde Breaker chosen in Features & traits; Colossus Slayer is a tick box on attacks. Colossus Slayer (1d8 more damage once a turn against a creature below its hit point maximum) or Horde Breaker (one more attack against another creature within 5 feet of the first). | Works (applied) |
| Ranger's Companion | Ranger (Beast Master) 3 | both | Class features row: a note with its numbers. Your beast goes on the map as a companion token you control. | Note only |
| Dreadful Strikes | Ranger (Fey Wanderer) 3 | 2024 | Class features row: a note with its numbers. A tick box on weapon attacks adds the psychic damage. Once a turn, a weapon hit deals 1d4 psychic damage more. Otherworldly Glamour: +1 to Charisma checks. | Works (applied) |
| Fey Reinforcements | Ranger (Fey Wanderer) 11 | 2024 | Class features row: uses ticked off, back on a long rest. Cast Summon Fey without a slot or material component. | Works (tracked) |
| Misty Wanderer | Ranger (Fey Wanderer) 15 | 2024 | Class features row: uses ticked off, back on a long rest. Cast Misty Step without a slot, bringing a willing creature within 5 feet with you. | Works (tracked) |
| Dreadful Strike | Ranger (Gloom Stalker) 3 | 2024 | Class features row: uses ticked off, back on a long rest. 2024 Dreadful Strike: a tick box adds the d8 and spends a use; Wisdom on initiative. On a weapon hit, 2d6 psychic damage more (once a turn). Dread Ambusher: +0 initiative, and 10 feet more speed on your first turn. | Works (applied) |
| Dread Ambusher | Ranger (Gloom Stalker) 3 | both | Class features row: a note with its numbers. A tick box adds 1d8 on the first turn; Wisdom on initiative. +0 to initiative; on your first turn of combat +10 feet speed and one more weapon attack (1d8 damage more). Umbral Sight: darkvision 60 feet, invisible to darkvision. | Works (applied) |
| Detect Portal | Ranger (Horizon Walker) 3 | both | Class features row: uses ticked off, back on a short or long rest. An action: sense the nearest planar portal within 1 mile. Planar Warrior: a bonus action, your next hit deals force damage and 1d8 more. | Works (tracked) |
| Ethereal Step | Ranger (Horizon Walker) 7 | both | Class features row: uses ticked off, back on a short or long rest. A bonus action: cast Etherealness without a slot, until the end of the turn. | Works (tracked) |
| Slayer's Prey | Ranger (Monster Slayer) 3 | both | Class features row: a note with its numbers. A tick box on weapon attacks adds 1d6. A bonus action: mark a creature; your first hit on it each turn deals 1d6 more. | Works (applied) |
| Hunter's Sense | Ranger (Monster Slayer) 3 | both | Class features row: uses ticked off, back on a long rest. An action: a creature within 60 feet: learn its immunities, resistances and vulnerabilities. | Works (tracked) |
| Magic-User's Nemesis | Ranger (Monster Slayer) 11 | both | Class features row: uses ticked off, back on a short or long rest. A reaction when a creature within 60 feet casts a spell or teleports: Wisdom save (DC 12) or it fails. | Works (tracked) |
| Dreadful Strikes | Ranger (Fey Wanderer) 3 | both | Class features row: a note with its numbers. A tick box on weapon attacks adds the psychic damage. Once a turn per creature: 1d4 psychic damage more on a weapon hit. Otherworldly Glamour: +1 to Charisma checks. | Works (applied) |
| Fey Reinforcements | Ranger (Fey Wanderer) 11 | both | Class features row: uses ticked off, back on a long rest. Cast Summon Fey without a slot or material component (optionally without concentration, for 1 minute). | Works (tracked) |
| Misty Wanderer | Ranger (Fey Wanderer) 15 | both | Class features row: uses ticked off, back on a long rest. Cast Misty Step without a slot, and bring a willing creature within 5 feet. | Works (tracked) |
| Drake Companion | Ranger (Drakewarden) 3 | both | Class features row: uses ticked off, back on a long rest. An action: summon your drake (AC 16, 15 hit points, Small; bite 1d6 + 2 plus no infused damage). Spend a spell slot to summon it again. Draconic Gift: Thaumaturgy and Draconic. | Works (tracked) |
| Drake's Breath | Ranger (Drakewarden) 11 | both | Class features row: uses ticked off, back on a long rest. An action: you or your drake breathe a 30-foot cone, 8d6 acid, cold, fire, lightning or poison (Dexterity save, DC 12, for half). Spend a 3rd-level or higher slot to use it again. | Works (tracked) |
| Reflexive Resistance (drake) | Ranger (Drakewarden) 15 | both | Class features row: uses ticked off, back on a long rest. Perfected Bond: a reaction when you take damage near your drake: resistance to it. Your drake's bite deals 1d6 more. | Works (tracked) |
| Gathered Swarm | Ranger (Swarmkeeper) 3 | both | Class features row: a note with its numbers. Once a turn after a hit: 1d6 piercing more, or push 15 feet (Strength save, DC 10), or move 5 feet. | Note only |
| Writhing Tide | Ranger (Swarmkeeper) 7 | both | Class features row: uses ticked off, back on a long rest. A bonus action: fly 10 feet and hover for 1 minute. | Works (tracked) |
| Swarming Dispersal | Ranger (Swarmkeeper) 15 | both | Class features row: uses ticked off, back on a long rest. A reaction when you take damage: resist it, and teleport 30 feet. | Works (tracked) |

### Rogue subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Fast Hands | Rogue (Thief) 3 | 2014 | Class features row: a note with its numbers. Cunning Action can also be a Sleight of Hand check, using thieves' tools, or the Use an Object action. Second-Story Work: climbing costs no extra movement, and running jumps go 0… | Note only |
| Fast Hands | Rogue (Thief) 3 | 2024 | Class features row: a note with its numbers. Cunning Action can also be a Sleight of Hand check, using thieves' tools, or the Utilize action. Second-Story Work: a climbing speed equal to your speed, and jumps use Dexterity. | Note only |
| Assassinate | Rogue (Assassin) 3 | 2014 | Class features row: a note with its numbers. Advantage on attacks against a creature that hasn't taken a turn in the fight yet, and a hit on a surprised creature is a critical hit. | Note only |
| Assassinate | Rogue (Assassin) 3 | 2024 | Class features row: a note with its numbers. Advantage on attacks against a creature that hasn't taken a turn in the fight yet; your first Sneak Attack each fight deals 3 damage more. | Note only |
| Spell Thief | Rogue (Arcane Trickster) 17 | both | Class features row: uses ticked off, back on a long rest. A reaction when a creature casts a spell at you: it makes a save (DC 14); on a fail the spell does nothing to you and you can cast it for 8 hours. | Works (tracked) |
| Psionic Energy | Rogue (Soulknife) 3 | 2024 | Class features row: uses ticked off, one back on a short rest, all on a long rest. d6s for Psi-Bolstered Knack and Psychic Whispers. Psychic Blades: 1d6 and 1d4 psychic. | Works (tracked) |
| Insightful Fighting | Rogue (Inquisitive) 3 | both | Class features row: a note with its numbers. A bonus action: Insight against a creature's Deception; if you win, Sneak Attack it without advantage for 1 minute. Ear for Deceit: Insight rolls at least 8. Eye for Detail. | Note only |
| Unerring Eye | Rogue (Inquisitive) 13 | both | Class features row: uses ticked off, back on a long rest. An action: sense illusions, shapechangers and other magical deception within 30 feet. | Works (tracked) |
| Master of Tactics | Rogue (Mastermind) 3 | both | Class features row: a note with its numbers. Help as a bonus action, at 30 feet. Master of Intrigue. | Note only |
| Skirmisher | Rogue (Scout) 3 | both | Class features row: a note with its numbers. A reaction: move half your speed when an enemy ends its turn within 5 feet, without opportunity attacks. Survivalist. | Note only |
| Fancy Footwork | Rogue (Swashbuckler) 3 | both | Class features row: a note with its numbers. A creature you attack in melee can't make opportunity attacks against you this turn. Rakish Audacity: +0 to initiative; Sneak Attack with no ally near when it's the only creature… | Note only |
| Master Duelist | Rogue (Swashbuckler) 17 | both | Class features row: uses ticked off, back on a short or long rest. Reroll a missed attack with advantage. | Works (tracked) |
| Wails from the Grave | Rogue (Phantom) 3 | both | Class features row: uses ticked off, back on a long rest. After Sneak Attack: a second creature within 30 feet takes 1d6 necrotic (half your Sneak Attack dice). Whispers of the Dead: a tool or skill proficiency after each rest. | Works (tracked) |
| Ghost Walk | Rogue (Phantom) 13 | both | Class features row: uses ticked off, back on a long rest. A bonus action for 10 minutes: fly 10 feet, attacks against you have disadvantage, move through objects. Destroy a soul trinket to use it again. | Works (tracked) |
| Psionic Energy | Rogue (Soulknife) 3 | both | Class features row: a pool of points, back on a long rest. Psionic Energy dice (d6); a bonus action to get one back once per short rest. Psi-Bolstered Knack, Psychic Whispers. Psychic Blades: 1d6 (1d4 off hand), thrown 60 feet. | Works (tracked) |
| Psychic Veil | Rogue (Soulknife) 13 | both | Class features row: uses ticked off, back on a long rest. An action: invisible for 1 hour. Spend a Psionic Energy die to use it again. | Works (tracked) |
| Rend Mind | Rogue (Soulknife) 17 | both | Class features row: uses ticked off, back on a long rest. After Sneak Attack with your blades: Wisdom save (DC 14) or stunned for 1 minute. Spend 3 Psionic Energy dice to use it again. | Works (tracked) |

### Sorcerer subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Draconic Resilience | Sorcerer (Draconic Bloodline) 1 | 2014 | Class features row: a note with its numbers. AC (13+Dex in 2014, 10+Dex+Cha in 2024) and one more hit point each level. Hit point maximum +1 and, without armour, AC 13 (13 + Dex) (both worked into your sheet). | Fixed 2026-10-22 (was AC and hit points not applied; the 2024 AC was missing) |
| Draconic Resilience | Sorcerer (Draconic Bloodline) 3 | 2024 | Class features row: a note with its numbers. AC (13+Dex in 2014, 10+Dex+Cha in 2024) and one more hit point each level. Hit point maximum +3 and, without armour, AC 10 (10 + Dex + Cha) (both worked into your sheet). | Fixed 2026-10-22 (was AC and hit points not applied; the 2024 AC was missing) |
| Dragon Wings | Sorcerer (Draconic Bloodline) 14 | 2014 | Class features row: a note with its numbers. A bonus action: wings, with a flying speed equal to your speed. | Note only |
| Dragon Wings | Sorcerer (Draconic Bloodline) 14 | 2024 | Class features row: uses ticked off, back on a long rest. A bonus action: flying speed 60 for an hour. Spend 3 sorcery points to get it back. | Works (tracked) |
| Tides of Chaos | Sorcerer (Wild Magic) 1 | 2014 | Class features row: uses ticked off, back on a long rest. Advantage on one attack roll, ability check or save. The DM can have you roll for a Wild Magic Surge to give it back. | Works (tracked) |
| Tides of Chaos | Sorcerer (Wild Magic) 3 | 2024 | Class features row: uses ticked off, back on a long rest. Advantage on one attack roll, ability check or save. Casting a sorcerer spell before a long rest makes you roll for a Wild Magic Surge and gives it back. | Works (tracked) |
| Tamed Surge | Sorcerer (Wild Magic) 18 | 2024 | Class features row: uses ticked off, back on a long rest. After casting a sorcerer spell with a slot, pick an effect from the Wild Magic Surge table instead of rolling. | Works (tracked) |
| Psionic Sorcery | Sorcerer (Aberrant Sorcery) 6 | 2024 | Class features row: a note with its numbers. Cast your Psionic Spells with sorcery points instead of a slot (points equal to the spell's level), needing no verbal or somatic components. | Note only |
| Warping Implosion | Sorcerer (Aberrant Sorcery) 18 | 2024 | Class features row: uses ticked off, back on a long rest. Teleport 120 feet; creatures within 30 feet of where you left make a Strength save (DC 14) or take 3d10 force damage and are pulled in. Spend 5 sorcery points to get it back. | Works (tracked) |
| Restore Balance | Sorcerer (Clockwork Sorcery) 3 | 2024 | Class features row: uses ticked off, back on a long rest. A reaction: cancel advantage or disadvantage on a d20 test within 60 feet. | Works (tracked) |
| Trance of Order | Sorcerer (Clockwork Sorcery) 14 | 2024 | Class features row: uses ticked off, back on a long rest. A bonus action for 1 minute: attacks against you can't have advantage, and your d20 rolls under 10 count as 10. Spend 5 sorcery points to get it back. | Works (tracked) |
| Clockwork Cavalcade | Sorcerer (Clockwork Sorcery) 18 | 2024 | Class features row: uses ticked off, back on a long rest. An action: restore 100 hit points among creatures in a 30-foot cube, repair objects, and end spells of 6th level or lower there. Spend 7 sorcery points to get it back. | Works (tracked) |
| Favored by the Gods | Sorcerer (Divine Soul) 1 | both | Class features row: uses ticked off, back on a short or long rest. Add 2d4 to a failed save or missed attack. Divine Magic: cleric spells too. | Works (tracked) |
| Unearthly Recovery | Sorcerer (Divine Soul) 18 | both | Class features row: uses ticked off, back on a long rest. A bonus action when below half your hit points: regain half your hit point maximum. | Works (tracked) |
| Strength of the Grave | Sorcerer (Shadow Magic) 1 | both | Class features row: uses ticked off, back on a long rest. When damage drops you to 0 (not radiant or a critical hit): Charisma save (DC 5 + the damage) to drop to 1 instead. Eyes of the Dark: darkvision 120 feet. | Works (tracked) |
| Umbral Form | Sorcerer (Shadow Magic) 18 | both | Class features row: a note with its numbers. 6 sorcery points, a bonus action, 1 minute: resist all damage but force and radiant, and move through creatures and objects. | Note only |
| Tempestuous Magic | Sorcerer (Storm Sorcery) 1 | both | Class features row: a note with its numbers. After casting a spell of 1st level or higher: fly 10 feet as a bonus action without opportunity attacks. | Note only |
| Telepathic Speech | Sorcerer (Aberrant Sorcery) 1 | both | Class features row: a note with its numbers. A bonus action: talk telepathically with a creature within 30 miles for 1 minutes. | Note only |
| Warping Implosion | Sorcerer (Aberrant Sorcery) 18 | both | Class features row: uses ticked off, back on a long rest. An action: teleport 120 feet; creatures within 30 feet of where you left take 3d10 force and are pulled (Strength save, DC 14, for half). 5 sorcery points to use it again. | Works (tracked) |
| Restore Balance | Sorcerer (Clockwork Sorcery) 1 | both | Class features row: uses ticked off, back on a long rest. A reaction: cancel advantage or disadvantage on a roll within 60 feet. | Works (tracked) |
| Trance of Order | Sorcerer (Clockwork Sorcery) 14 | both | Class features row: uses ticked off, back on a long rest. A bonus action for 1 minute: attacks against you lose advantage, and your attacks, checks and saves roll at least 10. 5 sorcery points to use it again. | Works (tracked) |
| Clockwork Cavalcade | Sorcerer (Clockwork Sorcery) 18 | both | Class features row: uses ticked off, back on a long rest. An action: in a 30-foot cube, heal up to 100 hit points shared, repair objects and end spells of 6th level or lower. 7 sorcery points to use it again. | Works (tracked) |

### Warlock subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Fey Presence | Warlock (The Archfey) 1 | 2014 | Class features row: uses ticked off, back on a short or long rest. An action: creatures in a 10-foot cube from you make a Wisdom save (DC 10) or are charmed or frightened until the end of your next turn. | Works (tracked) |
| Steps of the Fey | Warlock (The Archfey) 3 | 2024 | Class features row: uses ticked off, back on a long rest. Cast Misty Step without a slot, with a refreshing step (1d10 temporary hit points) or a taunting step (disadvantage on attacks for nearby creatures). | Works (tracked) |
| Misty Escape | Warlock (The Archfey) 6 | 2014 | Class features row: uses ticked off, back on a short or long rest. A reaction when you take damage: turn invisible and teleport 60 feet; you stay invisible until the start of your next turn or you attack or cast a spell. | Works (tracked) |
| Misty Escape | Warlock (The Archfey) 6 | 2024 | Class features row: a note with its numbers. A reaction when you take damage: cast Misty Step (from Steps of the Fey), and you can turn invisible or deal 2d10 psychic damage when you leave. | Note only |
| Beguiling Defenses | Warlock (The Archfey) 10 | 2014 | Class features row: a note with its numbers. Immune to being charmed. A reaction when someone tries to charm you: turn it back on them (Wisdom save). | Note only |
| Beguiling Defenses | Warlock (The Archfey) 10 | 2024 | Class features row: uses ticked off, back on a long rest. Immune to being charmed. A reaction when hit: half the damage, and the attacker takes the other half as psychic damage (Wisdom save). Spend a Pact Magic slot to get it back. | Works (tracked) |
| Dark Delirium | Warlock (The Archfey) 14 | 2014 | Class features row: uses ticked off, back on a short or long rest. An action: a creature within 60 feet makes a Wisdom save (DC 13) or is charmed or frightened for 1 minute, lost in an illusory realm. | Works (tracked) |
| Dark One's Blessing | Warlock (The Fiend) 1 | 2014 | Class features row: a note with its numbers. When you drop a hostile creature to 0 hit points: gain 1 temporary hit points. | Note only |
| Dark One's Blessing | Warlock (The Fiend) 3 | 2024 | Class features row: a note with its numbers. When you drop a hostile creature to 0 hit points (or someone within 10 feet of you does): gain 3 temporary hit points. | Note only |
| Dark One's Own Luck | Warlock (The Fiend) 6 | 2014 | Class features row: uses ticked off, back on a short or long rest. Add a d10 to an ability check or saving throw (after seeing the roll, before the result). | Works (tracked) |
| Dark One's Own Luck | Warlock (The Fiend) 6 | 2024 | Class features row: uses ticked off, back on a long rest. Add a d10 to an ability check or saving throw (after seeing the roll, before the result). | Works (tracked) |
| Hurl Through Hell | Warlock (The Fiend) 14 | 2014 | Class features row: uses ticked off, back on a long rest. When you hit a creature: it vanishes through the lower planes until the end of your next turn and takes 10d10 psychic damage if it isn't a fiend. | Works (tracked) |
| Hurl Through Hell | Warlock (The Fiend) 14 | 2024 | Class features row: uses ticked off, back on a long rest. When you hit a creature: it vanishes through the lower planes until the end of your next turn and takes 10d10 psychic damage (Charisma save, DC 13). Spend a Pact Magic slot to… | Works (tracked) |
| Entropic Ward | Warlock (The Great Old One) 6 | 2014 | Class features row: uses ticked off, back on a short or long rest. A reaction: an attack against you has disadvantage; if it misses, your next attack against it has advantage. | Works (tracked) |
| Clairvoyant Combatant | Warlock (The Great Old One) 6 | 2024 | Class features row: uses ticked off, back on a short or long rest. With Awakened Mind: a creature makes a Wisdom save (DC 11) or you have advantage on attacks against it and it has disadvantage against you. Spend a Pact Magic slot to get it back. | Works (tracked) |
| Healing Light | Warlock (The Celestial) 3 | 2024 | Class features row: a pool of points, back on a long rest. A pool of d6s: a bonus action to spend up to 1 and heal a creature within 60 feet that much. | Works (tracked) |
| Searing Vengeance | Warlock (The Celestial) 14 | 2024 | Class features row: uses ticked off, back on a long rest. On a death save, regain 7 hit points instead and stand up; enemies within 30 feet take 2d8 + 0 radiant damage and are blinded. | Works (tracked) |
| Healing Light | Warlock (The Celestial) 1 | both | Class features row: a pool of points, back on a long rest. A pool of d6s: a bonus action to spend up to 1 and heal a creature within 60 feet that much. | Works (tracked) |
| Searing Vengeance | Warlock (The Celestial) 14 | both | Class features row: uses ticked off, back on a long rest. On a death save, regain 7 hit points and stand up; enemies within 30 feet take 2d8 + 0 radiant damage and are blinded. | Works (tracked) |
| Hexblade's Curse | Warlock (The Hexblade) 1 | both | Class features row: uses ticked off, back on a short or long rest. A tick box adds the proficiency bonus to damage; critical hits on 19–20. A bonus action for 1 minute: +2 damage against the target, critical hits on 19–20, and regain 1 hit points if it dies. Hex Warrior: Charisma for a pact or chosen weapon. | Works (applied) |
| Accursed Specter | Warlock (The Hexblade) 6 | both | Class features row: uses ticked off, back on a long rest. When you slay a humanoid: its specter serves you until your next long rest, with 3 temporary hit points and +1 to attacks. | Works (tracked) |
| Tentacle of the Deeps | Warlock (The Fathomless) 1 | both | Class features row: uses ticked off, back on a long rest. A bonus action for 1 minute: a tentacle hits for 1d8 cold and slows by 10 feet. Gift of the Sea: swim 40 feet, breathe water. | Works (tracked) |
| Grasping Tentacles | Warlock (The Fathomless) 10 | both | Class features row: uses ticked off, back on a long rest. Cast Evard's Black Tentacles without a slot; you gain 10 temporary hit points and damage can't break your concentration on it. | Works (tracked) |
| Fathomless Plunge | Warlock (The Fathomless) 14 | both | Class features row: uses ticked off, back on a short or long rest. An action: you and up to five willing creatures within 30 feet teleport to a body of water you've seen within 1 mile. | Works (tracked) |
| Genie's Vessel | Warlock (The Genie) 1 | both | Class features row: a note with its numbers. Genie's Wrath: once a turn, +2 damage of your genie's type on a hit. | Note only |
| Bottled Respite | Warlock (The Genie) 1 | both | Class features row: uses ticked off, back on a long rest. An action: step into your vessel for up to 4 hours. | Works (tracked) |
| Elemental Gift | Warlock (The Genie) 6 | both | Class features row: uses ticked off, back on a long rest. A bonus action: fly 30 feet for 10 minutes. You also resist your genie's damage type. | Works (tracked) |
| Limited Wish | Warlock (The Genie) 14 | both | Class features row: uses ticked off, not by resting. An action: the effect of any 6th-level or lower spell with a casting time of one action, with no components. Back after 1d4 long rests (tick it back by hand). | Works (tracked) |

### Wizard subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Arcane Ward | Wizard (School of Abjuration) 2 | both | Class features row: a pool of points, back on a long rest. A ward of hit points that takes damage for you, made when you cast an abjuration spell of 1st level or higher (once per long rest). Casting another gives it back 2 × the spell's… | Works (tracked) |
| Benign Transposition | Wizard (School of Conjuration) 6 | 2014 | Class features row: uses ticked off, back on a long rest. An action: teleport 30 feet, or swap places with a willing Small or Medium creature. Casting a conjuration spell of 1st level or higher gives it back. | Works (tracked) |
| Portent | Wizard (School of Divination) 2 | both | Class features row: a note with its numbers. After a long rest, roll two d20s and keep the numbers: put one in place of any attack roll, save or ability check you can see, before it's rolled. A long rest clears unused ones. | Note only |
| The Third Eye | Wizard (School of Divination) 10 | both | Class features row: uses ticked off, back on a short or long rest. An action: darkvision 60 feet, see into the Ethereal Plane, read any language, or see the invisible within 10 feet, until you rest or are incapacitated. | Works (tracked) |
| Hypnotic Gaze | Wizard (School of Enchantment) 2 | 2014 | Class features row: a note with its numbers. An action: a creature within 5 feet makes a Wisdom save (DC 10) or is charmed and incapacitated while you keep it up. | Note only |
| Sculpt Spells | Wizard (School of Evocation) 2 | both | Class features row: a note with its numbers. Up to 1 + a spell's level creatures you choose succeed on its save and take no damage. | Note only |
| Overchannel | Wizard (School of Evocation) 14 | both | Class features row: uses ticked off, back on a long rest. Deal the most damage the dice can roll with a 1st- to 5th-level wizard spell. Using it again before a long rest costs 2d12 necrotic damage per spell level (1d12 more each time)… | Works (tracked) |
| Illusory Self | Wizard (School of Illusion) 10 | 2014 | Class features row: uses ticked off, back on a short or long rest. A reaction: an attack against you misses automatically. | Works (tracked) |
| Illusory Self | Wizard (School of Illusion) 10 | 2024 | Class features row: uses ticked off, back on a short or long rest. A reaction: an attack against you misses automatically. Spend a 2nd-level or higher slot to get it back. | Works (tracked) |
| Grim Harvest | Wizard (School of Necromancy) 2 | 2014 | Class features row: a note with its numbers. When a spell of 1st level or higher kills a creature (not a construct or undead), regain 2 × the spell's level hit points (3 × for necromancy spells). | Note only |
| Shapechanger | Wizard (School of Transmutation) 10 | 2014 | Class features row: uses ticked off, back on a short or long rest. Cast Polymorph on yourself without a slot, into a beast of challenge 1 or lower. | Works (tracked) |
| Arcane Deflection | Wizard (War Magic) 2 | both | Class features row: a note with its numbers. A reaction when hit or failing a save: +2 AC or +4 to the save (only cantrips next turn). Tactical Wit: +0 to initiative. | Note only |
| Power Surge | Wizard (War Magic) 6 | both | Class features row: uses ticked off, back on a long rest. Spend one on a damage spell for 3 force damage more. You gain one when you end a spell with Dispel Magic or Counterspell; a short rest brings you back to one if you have none… | Works (tracked) |
| Bladesong | Wizard (Bladesinging) 2 | both | Class features row: uses ticked off, back on a long rest. A Now toggle: AC +Int, speed +10 (spends a use). A bonus action for 1 minute: +1 AC, +10 feet speed, advantage on Acrobatics, +1 to concentration saves. | Works (applied) |
| Manifest Mind | Wizard (Order of Scribes) 6 | both | Class features row: uses ticked off, back on a long rest. Cast a spell through your manifested mind as if you were in its space. Wizardly Quill and Awakened Spellbook (swap a spell's damage type; ritual in normal time once per long rest). | Works (tracked) |
| Awakened Spellbook | Wizard (Order of Scribes) 2 | both | Class features row: uses ticked off, back on a long rest. Cast a ritual spell in its normal time. Spells can take the damage type of another spell of that level in your book. | Works (tracked) |

### Artificer subclasses

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Experimental Elixir | Artificer (Alchemist) 3 | both | Class features row: uses ticked off, back on a long rest. After a long rest, make free elixirs (roll a d6 for each: healing 2d4 + 0, swiftness, resilience, boldness, flight or transformation); more by spending a spell slot. | Works (tracked) |
| Restorative Reagents | Artificer (Alchemist) 9 | both | Class features row: uses ticked off, back on a long rest. Cast Lesser Restoration without a slot. Your elixirs also give 2d6 + 0 temporary hit points. | Works (tracked) |
| Armor Model | Artificer (Armorer) 3 | both | Class features row: a note with its numbers. Guardian: thunder gauntlets (1d8 thunder; a creature hit has disadvantage on attacks against others) and Defensive Field (a bonus action: 3 temporary hit points, 2 times per long… | Note only |
| Defensive Field (Guardian) | Artificer (Armorer) 3 | both | Class features row: uses ticked off, back on a long rest. A bonus action in the Guardian model while bloodied: gain 3 temporary hit points. | Works (tracked) |
| Eldritch Cannon | Artificer (Artillerist) 3 | both | Class features row: uses ticked off, back on a long rest. An action: make a cannon (flamethrower, force ballista or protector, 2d8; save DC 10) for 1 hour; or spend a spell slot to make one. | Works (tracked) |
| Steel Defender | Artificer (Battle Smith) 3 | both | Class features row: a note with its numbers. Your steel defender: AC 15, 17 hit points, acts after you; force-empowered rend 1d8 + 2. Battle Ready: magic weapons can use Intelligence. | Note only |
| Arcane Jolt | Artificer (Battle Smith) 9 | both | Class features row: uses ticked off, back on a long rest. When you or your defender hit with a magic weapon attack: 2d6 force damage more, or heal a creature within 30 feet that much. | Works (tracked) |

## Races

| Feature | Class/level | Edition | What it does in the app now | Status |
|---|---|---|---|---|
| Darkvision | Dwarf | 2014 | Listed in Features & traits with a short summary. 60 feet. | Listed (nothing to work out) |
| Darkvision | Dwarf | 2024 | Listed in Features & traits with a short summary. 120 feet. | Listed (nothing to work out) |
| Dwarven Resilience | Dwarf | both | Listed in Features & traits with a short summary. Advantage on saves against poison, and resistance to poison damage. | Listed (nothing to work out) |
| Dwarven Toughness | Dwarf | 2014 | Worked into the sheet's numbers; listed in Features & traits. Hill dwarves: one more hit point each level. In your hit points. | Works (applied) |
| Dwarven Toughness | Dwarf | 2024 | Worked into the sheet's numbers; listed in Features & traits. One more hit point each level. In your hit points. | Works (applied) |
| Stonecunning | Dwarf | 2014 | Listed in Features & traits with a short summary. Double proficiency on History checks about stonework. | Listed (nothing to work out) |
| Darkvision | Elf | both | Listed in Features & traits with a short summary. 60 feet. | Listed (nothing to work out) |
| Fey Ancestry | Elf | both | Listed in Features & traits with a short summary. Advantage on saves against being charmed; magic can't put you to sleep. | Listed (nothing to work out) |
| Keen Senses | Elf | 2014 | Listed in Features & traits with a short summary. Proficiency in Perception. | Listed (nothing to work out) |
| Keen Senses | Elf | 2024 | Listed in Features & traits with a short summary. Proficiency in Insight, Perception or Survival. | Listed (nothing to work out) |
| Trance | Elf | both | Listed in Features & traits with a short summary. Meditate 4 hours instead of sleeping 8. | Listed (nothing to work out) |
| Sunlight Sensitivity | Drow | 2014 | Listed in Features & traits with a short summary. Disadvantage on attack rolls and sight-based Perception checks in direct sunlight. | Listed (nothing to work out) |
| Brave | Halfling | both | Listed in Features & traits with a short summary. Advantage on saves against being frightened. | Listed (nothing to work out) |
| Halfling Nimbleness | Halfling | both | Listed in Features & traits with a short summary. Move through the space of a creature larger than you. | Listed (nothing to work out) |
| Naturally Stealthy | Halfling | both | Listed in Features & traits with a short summary. You can hide behind a creature at least one size larger than you. | Listed (nothing to work out) |
| Darkvision | Gnome | both | Listed in Features & traits with a short summary. 60 feet. | Listed (nothing to work out) |
| Gnome Cunning | Gnome | both | Listed in Features & traits with a short summary. Advantage on Intelligence, Wisdom and Charisma saves. | Listed (nothing to work out) |
| Damage Resistance | Dragonborn | both | Listed in Features & traits with a short summary. Resistance to your ancestry's damage type. | Listed (nothing to work out) |
| Darkvision | Dragonborn | 2024 | Listed in Features & traits with a short summary. 60 feet. | Listed (nothing to work out) |
| Darkvision | Half-Elf | 2014 | Listed in Features & traits with a short summary. 60 feet. | Listed (nothing to work out) |
| Fey Ancestry | Half-Elf | 2014 | Listed in Features & traits with a short summary. Advantage on saves against being charmed; magic can't put you to sleep. | Listed (nothing to work out) |
| Darkvision | Half-Orc | 2014 | Listed in Features & traits with a short summary. 60 feet. | Listed (nothing to work out) |
| Menacing | Half-Orc | 2014 | Listed in Features & traits with a short summary. Proficiency in Intimidation. | Listed (nothing to work out) |
| Savage Attacks | Half-Orc | 2014 | Added to attacks or spells rolled from the sheet. One more weapon damage die on a melee critical hit. In your critical damage. | Works (applied) |
| Darkvision | Orc | 2014 | Listed in Features & traits with a short summary. 60 feet. | Listed (nothing to work out) |
| Darkvision | Orc | 2024 | Listed in Features & traits with a short summary. 120 feet. | Listed (nothing to work out) |
| Powerful Build | Orc | both | Worked into the sheet's numbers; listed in Features & traits. You count as one size larger for carrying (in your carrying capacity) and pushing. | Works (applied) |
| Darkvision | Tiefling | both | Listed in Features & traits with a short summary. 60 feet. | Listed (nothing to work out) |
| Hellish Resistance | Tiefling | 2014 | Listed in Features & traits with a short summary. Resistance to fire damage. | Listed (nothing to work out) |
| Otherworldly Presence | Tiefling | 2024 | Listed in Features & traits with a short summary. You know Thaumaturgy. | Listed (nothing to work out) |
| Darkvision | Aasimar | both | Listed in Features & traits with a short summary. 60 feet. | Listed (nothing to work out) |
| Celestial Resistance | Aasimar | both | Listed in Features & traits with a short summary. Resistance to necrotic and radiant damage. | Listed (nothing to work out) |
| Powerful Build | Goliath | both | Worked into the sheet's numbers; listed in Features & traits. You count as one size larger for carrying (in your carrying capacity); advantage on ending the grappled condition (2024). | Works (applied) |
| Skillful | Human | 2024 | Listed in Features & traits with a short summary. Proficiency in one skill. | Listed (nothing to work out) |
| Versatile | Human | 2024 | Listed in Features & traits with a short summary. An Origin feat. | Listed (nothing to work out) |
| Healing Hands | Aasimar | both | Race features row: uses ticked off, back on a long rest. An action: touch a creature and heal it 2d4. | Works (tracked) |
| Celestial Revelation | Aasimar 3 | both | Race features row: uses ticked off, back on a long rest. A bonus action for 1 minute: Heavenly Wings (fly), Inner Radiance (light, 2 radiant to creatures within 10 feet each turn) or Necrotic Shroud (frighten, Charisma save DC 10);… | Works (tracked) |
| Breath Weapon | Dragonborn | 2014 | Race features row: uses ticked off, back on a short or long rest. An action: a 5 by 30-foot line or 15-foot cone (by ancestry) of 2d6 damage (save DC 10, half on a success). | Works (tracked) |
| Breath Weapon | Dragonborn | 2024 | Race features row: uses ticked off, back on a long rest. In place of an attack: a 15-foot cone or 30-foot line of 1d10 damage (Dexterity save, DC 10, for half). | Works (tracked) |
| Draconic Flight | Dragonborn 5 | 2024 | Race features row: uses ticked off, back on a long rest. A bonus action: spectral wings for 10 minutes, a flying speed equal to your speed. | Works (tracked) |
| Breath Weapon | Chromatic Dragonborn | both | Race features row: uses ticked off, back on a long rest. In place of an attack: a 5 by 30-foot line of 1d10 damage (Dexterity save, DC 10, for half). | Works (tracked) |
| Breath Weapon | Metallic Dragonborn | both | Race features row: uses ticked off, back on a long rest. In place of an attack: a 15-foot cone of 1d10 damage (Dexterity save, DC 10, for half). | Works (tracked) |
| Breath Weapon | Gem Dragonborn | both | Race features row: uses ticked off, back on a long rest. In place of an attack: a 15-foot cone of 1d10 damage (Dexterity save, DC 10, for half). Psionic Mind: telepathy 30 feet. | Works (tracked) |
| Chromatic Warding | Chromatic Dragonborn 5 | both | Race features row: uses ticked off, back on a long rest. An action: immune to your ancestry's damage for 1 minute. | Works (tracked) |
| Metallic Breath Weapon | Metallic Dragonborn 5 | both | Race features row: uses ticked off, back on a long rest. In place of an attack, a 15-foot cone (DC 11): Enervating (Constitution save or incapacitated until your next turn) or Repulsion (Strength save or pushed 20 feet and prone). | Works (tracked) |
| Gem Flight | Gem Dragonborn 5 | both | Race features row: uses ticked off, back on a long rest. A bonus action: spectral wings for 1 minute, a flying speed equal to your walking speed, and hover. | Works (tracked) |
| Stonecunning | Dwarf | 2024 | Race features row: uses ticked off, back on a long rest. A bonus action on or touching stone: tremorsense 60 feet for 10 minutes. | Works (tracked) |
| Duergar Magic | Duergar 3 | both | Race features row: uses ticked off, back on a long rest. Enlarge/Reduce on yourself, each once per long rest without a slot (Int, Wis or Cha). | Works (tracked) |
| Faerie Fire (Drow) | Drow 3 | 2014 | Race features row: uses ticked off, back on a long rest. Cast Faerie Fire without a slot (Charisma). | Works (tracked) |
| Faerie Fire (Drow) | Drow 3 | 2024 | Race features row: uses ticked off, back on a long rest. Cast Faerie Fire without a slot (Int, Wis or Cha). | Works (tracked) |
| Darkness (Drow) | Drow 5 | 2014 | Race features row: uses ticked off, back on a long rest. Cast Darkness without a slot (Charisma). | Works (tracked) |
| Darkness (Drow) | Drow 5 | 2024 | Race features row: uses ticked off, back on a long rest. Cast Darkness without a slot (Int, Wis or Cha). | Works (tracked) |
| Detect Magic (High Elf) | High Elf 3 | 2024 | Race features row: uses ticked off, back on a long rest. Cast Detect Magic without a slot. You can also cast it with your slots. | Works (tracked) |
| Misty Step (High Elf) | High Elf 5 | 2024 | Race features row: uses ticked off, back on a long rest. Cast Misty Step without a slot. | Works (tracked) |
| Longstrider (Wood Elf) | Wood Elf 3 | 2024 | Race features row: uses ticked off, back on a long rest. Cast Longstrider without a slot. | Works (tracked) |
| Pass without Trace (Wood Elf) | Wood Elf 5 | 2024 | Race features row: uses ticked off, back on a long rest. Cast Pass without Trace without a slot. | Works (tracked) |
| Fey Step | Eladrin | both | Race features row: uses ticked off, back on a long rest. A bonus action: teleport 30 feet. | Works (tracked) |
| Blessing of the Raven Queen | Shadar-kai | both | Race features row: uses ticked off, back on a long rest. A bonus action: teleport 30 feet. | Works (tracked) |
| Speak with Animals (Forest Gnome) | Forest Gnome | 2024 | Race features row: uses ticked off, back on a long rest. Cast Speak with Animals without a slot. You also know Minor Illusion. | Works (tracked) |
| Svirfneblin Camouflage | Deep Gnome | both | Race features row: uses ticked off, back on a long rest. Advantage on a Dexterity (Stealth) check. | Works (tracked) |
| Gift of the Svirfneblin | Deep Gnome 3 | both | Race features row: uses ticked off, back on a long rest. Disguise Self, each once per long rest without a slot or material components. | Works (tracked) |
| Stone's Endurance | Goliath | 2014 | Race features row: uses ticked off, back on a long rest. A reaction when you take damage: take 1d12 + 0 off it. | Works (tracked) |
| Giant Ancestry | Goliath | 2024 | Race features row: uses ticked off, back on a long rest. Your ancestry's boon: Cloud's Jaunt (teleport 30 feet), Fire's Burn (1d10 fire), Frost's Chill (1d6 cold, −10 speed), Hill's Tumble (knock Large or smaller prone), Stone's… | Works (tracked) |
| Large Form | Goliath 5 | 2024 | Race features row: uses ticked off, back on a long rest. A bonus action for 10 minutes: Large, advantage on Strength checks, +10 feet speed. | Works (tracked) |
| Luck | Halfling | both | Race features row: a note with its numbers. When you roll a 1 on the d20 of an attack, ability check or saving throw, reroll it and use the new roll. | Note only |
| Resourceful | Human | 2024 | Race features row: uses ticked off, back on a long rest. You gain Heroic Inspiration whenever you finish a long rest: reroll any die you roll. | Works (tracked) |
| Relentless Endurance | Half-Orc | both | Race features row: uses ticked off, back on a long rest. When you drop to 0 hit points but aren't killed outright, drop to 1 instead. Savage Attacks: one more weapon die on a melee critical hit. | Works (tracked) |
| Adrenaline Rush | Orc | 2014 | Race features row: uses ticked off, back on a long rest. Dash as a bonus action and gain 2 temporary hit points. | Works (tracked) |
| Adrenaline Rush | Orc | 2024 | Race features row: uses ticked off, back on a short or long rest. Dash as a bonus action and gain 2 temporary hit points. | Works (tracked) |
| Relentless Endurance | Orc | 2024 | Race features row: uses ticked off, back on a long rest. When you drop to 0 hit points but aren't killed outright, drop to 1 instead. | Works (tracked) |
| Hellish Rebuke (Tiefling) | Tiefling 3 | 2014 | Race features row: uses ticked off, back on a long rest. Infernal Legacy: cast Hellish Rebuke as a 2nd-level spell without a slot (Charisma). A Tome of Foes subrace has other spells: add them as rows of your own. | Works (tracked) |
| Hellish Rebuke (Tiefling) | Tiefling 3 | 2024 | Race features row: uses ticked off, back on a long rest. Fiendish Legacy (infernal): cast it without a slot, once per long rest (Int, Wis or Cha); also with your slots. Write Abyssal or Chthonic in the race for those legacies. | Works (tracked) |
| Darkness (Tiefling) | Tiefling 5 | 2014 | Race features row: uses ticked off, back on a long rest. Cast it without a slot, once per long rest (Charisma). | Works (tracked) |
| Darkness (Tiefling) | Tiefling 5 | 2024 | Race features row: uses ticked off, back on a long rest. Cast it without a slot, once per long rest (Int, Wis or Cha). | Works (tracked) |
| Fairy Magic | Fairy 3 | both | Race features row: uses ticked off, back on a long rest. Faerie Fire, each once per long rest without a slot. You know Druidcraft and can fly. | Works (tracked) |
| Firbolg Magic | Firbolg | both | Race features row: uses ticked off, back on a long rest. Detect Magic and Disguise Self, each once per long rest without a slot. | Works (tracked) |
| Hidden Step | Firbolg | both | Race features row: uses ticked off, back on a long rest. A bonus action: invisible until the start of your next turn, or until you attack, deal damage or force a save. | Works (tracked) |
| Genasi Magic | Genasi 3 | both | Race features row: uses ticked off, back on a long rest. Your kind's spells (Air, Earth, Fire or Water: type it in the race), each once per long rest without a slot. | Works (tracked) |
| Githyanki Psionics | Githyanki 3 | both | Race features row: uses ticked off, back on a long rest. Jump, each once per long rest without a slot or components. You know Mage Hand (invisible). | Works (tracked) |
| Githzerai Psionics | Githzerai 3 | both | Race features row: uses ticked off, back on a long rest. Shield, each once per long rest without a slot or components. You know Mage Hand (invisible). | Works (tracked) |
| Fury of the Small | Goblin | both | Race features row: uses ticked off, back on a long rest. Once a turn, when you damage a larger creature: 2 damage more. Nimble Escape: Disengage or Hide as a bonus action. | Works (tracked) |
| Rabbit Hop | Harengon | both | Race features row: uses ticked off, back on a long rest. A bonus action: jump 10 feet without opportunity attacks. | Works (tracked) |
| Fey Gift | Hobgoblin | both | Race features row: uses ticked off, back on a long rest. Help as a bonus action. | Works (tracked) |
| Fortune from the Many | Hobgoblin | both | Race features row: uses ticked off, back on a long rest. After a miss or a failed check or save: add the number of allies you can see within 30 feet (up to +3). | Works (tracked) |
| Kenku Recall | Kenku | both | Race features row: uses ticked off, back on a long rest. Advantage on an ability check with a skill you're proficient in, before rolling. | Works (tracked) |
| Hungry Jaws | Lizardfolk | both | Race features row: uses ticked off, back on a long rest. A bonus action: a bite attack; on a hit you gain 2 temporary hit points. | Works (tracked) |
| Shifting | Shifter | both | Race features row: uses ticked off, back on a long rest. A bonus action for 1 minute: gain 4 temporary hit points and your shifter's benefit (Beasthide, Longtooth, Swiftstride or Wildhunt). | Works (tracked) |
| Feline Agility | Tabaxi | both | Race features row: uses ticked off, not by resting. Double your speed until the end of the turn. Back when you spend a turn without moving (tick it back by hand). | Works (tracked) |
| Control Air and Water | Triton | both | Race features row: uses ticked off, back on a long rest. Fog Cloud: each once per long rest without a slot. | Works (tracked) |
| Serpentine Spellcasting | Yuan-ti 3 | both | Race features row: uses ticked off, back on a long rest. Suggestion without a slot, once per long rest. Animal Friendship on snakes at will; you know Poison Spray. | Works (tracked) |
| Speed | Dwarf, halfling, gnome | 2024 | Worked into the sheet's speed: 30 feet (25 under 2014) | Fixed 2026-10-22 (was 25 feet under 2024 rules too) |

## Still not on the sheet

- Subclass features with nothing to track or work out (most "ribbons") aren't listed in Features & traits yet; the player writes them in.
- Feats (Great Weapon Master, Sharpshooter, Elven Accuracy...) and the halfling's Luck rerolls aren't applied to rolls; they're text the player keeps.
- Two-Weapon Fighting's off-hand attack isn't its own attack line; the Two-Weapon Fighting style is chosen in Features & traits and noted on the attack.
- The AI sheet review (Review sheet) still checks the 2014 numbers; its prompt says so.
