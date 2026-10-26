# Books worked through for the sheet's features

Which books in Kenny's `DND books` folder have been read for the character sheet's Class features box: its class, subclass and race rows (`packages/shared/src/class-features.js`, `subclass-features.js`, `subclass-features-books.js`, `race-features.js`). When a new book goes into the folder, add it here, work through it the same way and tick it off.

**Done** means every class, subclass, race and racial feat in that book that has uses, a pool or worked-out numbers is in the box, checked against the PDF (page numbers in the rows' `page`). **Nothing to add** means the book has no character options of that kind. The [book checklist](5e-book-checklist.md) is the list of every official book; this file is only about the sheet.

| Book | In the folder | Classes and subclasses | Races and racial feats | Notes |
|---|---|---|---|---|
| Player's Handbook (2014) | 2026-10-05 | Done (2026-10-14) | Done (2026-10-15) | Dragonborn, drow, halfling, half-orc and tiefling have rows; the other races have nothing to track. 2026-10-22: every class feature (with or without uses) and the races' text traits read from the PDF into `class-traits.js`, with the numbers and attack extras (`attack-extras.js`); see the [audit](class-features-audit.md). |
| Player's Handbook (2024) | 2026-10-14 | Done from Claude's knowledge before the PDF arrived (2026-10-14); not yet re-checked line by line against the PDF | Done (2026-10-15), species pages checked | The 2024 subclasses' page numbers just say "PHB 2024". 2026-10-22: the class tables, every class feature, Weapon Mastery and the weapon table's mastery properties checked against the PDF (`class-traits.js`, `attack-extras.js`); see the [audit](class-features-audit.md). |
| Xanathar's Guide to Everything | 2026-10-14 | Done (2026-10-15): all 31 subclasses | Done (2026-10-15): all 15 racial feats | Its Zealot, Glamour, Gloom Stalker and Celestial are 2014 rows beside the PHB 2024's versions. |
| Tasha's Cauldron of Everything | 2026-10-14 | Done (2026-10-15): the artificer (already in) and its 4 subclasses, and 27 more subclasses | Nothing to add (Custom Lineage is a choice, not a race with uses) | Its Psi Warrior, Stars, Mercy, Glory, Fey Wanderer, Soulknife, Aberrant Mind and Clockwork Soul are 2014 rows beside the PHB 2024's. |
| Fizban's Treasury of Dragons | 2026-10-14 | Done (2026-10-15): Way of the Ascendant Dragon, Drakewarden | Done (2026-10-15): chromatic, metallic and gem dragonborn | Its Gift of the Chromatic/Metallic/Gem Dragon feats aren't racial feats (anyone can take them); not added. |
| Dungeon Master's Guide (2014) | 2026-10-14 | Done (2026-10-15): Death Domain, Oathbreaker | Nothing to add | |
| Bigby Presents: Glory of the Giants | 2026-10-14 | Done (2026-10-15): Path of the Giant, from Claude's knowledge | Nothing to add | The PDF is a picture-only scan with no text, so it couldn't be checked; an OCR'd copy would let a later session check it. Its giant feats aren't racial. |
| Mordenkainen Presents: Monsters of the Multiverse | 2026-10-14 | Nothing to add | Done (2026-10-15): the 33 races, those with uses or numbers have rows | Under 2014 rules its versions are used for its races (it replaced Volo's and Tome of Foes); under 2024 rules the PHB 2024's species come first. |
| Volo's Guide to Monsters | 2026-10-14 | Nothing to add | Done (2026-10-15) through Monsters of the Multiverse, which reprinted its races | Volo's own older versions (e.g. the three aasimar subraces) aren't separate rows; a player using them types over the numbers. |
| Mordenkainen's Tome of Foes | 2026-10-14 | Nothing to add | Done (2026-10-15) through Monsters of the Multiverse | The tiefling subraces' spells: the player adds them as their own rows. |
| The Book of Many Things | 2026-10-14 | Nothing to add | Nothing to add | Only the Cartomancer feat (not racial), backgrounds and items. |
| Dungeon Master's Guide (2024) | 2026-10-07 | Nothing to add | Nothing to add | |
| Monster Manual (2014) | 2026-10-14 | Nothing to add | Nothing to add | Monsters only. |
| Monster Manual (2025) | 2026-10-14 | Nothing to add | Nothing to add | Monsters only. |

Not in the folder yet, with subclasses or races the sheet would want: Sword Coast Adventurer's Guide, Eberron: Rising from the Last War, Explorer's Guide to Wildemount (Echo Knight, Chronurgy, Graviturgy), Mythic Odysseys of Theros, Van Richten's Guide to Ravenloft, Strixhaven, Spelljammer, Planescape, Eberron: Forge of the Artificer, Forgotten Realms: Heroes of Faerûn, Astarion's Book of Hungers, Lorwyn: First Light, Arcana Unleashed.

**Companions' stat blocks (2026-10-21, `shared/src/companions.js`):** Steel Defender and the 2014 Primal Companion beasts checked against Tasha's PDF; the 2024 Primal Companion beasts, Otherworldly Steed and Find Familiar list against the PHB 2024 PDF; the Drakewarden's drake from Claude's knowledge of Fizban's (not in the session's folder); the 2014 Find Familiar and Find Steed lists and the Ranger's Companion from the PHB 2014. Magic items' summons and spells (Bag of Tricks, Figurines, Horn of Valhalla, Wand and Necklace of Fireballs…) come from a summary of the DMG 2014 and 2024 made on the owner's PC (`/mnt/project-files/feedback-2026-10-21/dmg-summoning-items.md`), not the PDFs themselves.
## Backgrounds (the sheet's Background box)

Which books have been read for the backgrounds the sheet suggests and applies (`packages/shared/src/backgrounds.js`, 2026-10-22). Each row there is a short summary (skills, tools, languages, equipment, gold, and the feature's or origin feat's name with a line on what it does), not the book's text.

| Book | Backgrounds | Notes |
|---|---|---|
| Player's Handbook (2014) | Done (2026-10-22), from the PDF: all 13, and the variants Spy, Gladiator, Guild Merchant, Knight and Pirate | Personality tables aren't copied. |
| Player's Handbook (2024) | Done (2026-10-22), from the PDF: all 16, with their three abilities, origin feat, tool, and equipment (option A; option B is 50 GP) | 2024 languages come from the character, not the background. |
| Bigby Presents: Glory of the Giants | Giant Foundling and Rune Carver, from Claude's knowledge | Not in the staged folder (and the copy noted above is a picture-only scan): check them against the book. |
| The Book of Many Things | Rewarded and Ruined: skills and origin feat only, from Claude's knowledge | The PDF in the folder only names them; check the tools and equipment against the book. |
| Xanathar's, Tasha's, Fizban's, the DMGs, Monsters of the Multiverse, Volo's, Tome of Foes, the Monster Manuals | Nothing to add | No backgrounds. |

Not in the folder yet, with backgrounds the sheet would want: Sword Coast Adventurer's Guide, Eberron, Wildemount, Theros, Ravenloft, Strixhaven, Spelljammer, Planescape. Until then the DM can make them as their own backgrounds in Campaign settings.

## Help making a character (the sheet's Help panel)

`packages/shared/src/creation-help.js` (2026-10-22): each class's proficiencies, skills, starting equipment, spellcasting basics and features per level, from the Player's Handbook (2014) and (2024), and the artificer from Tasha's Cauldron of Everything (used in both editions); the PHB 2014's 15 races and subraces and the PHB 2024's 10 species. Short summaries, not the books' text. Subclass features and other books' races aren't in it yet (the Class features box has them: see above).

