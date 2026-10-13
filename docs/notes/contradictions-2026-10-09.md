# Contradictions check, 2026-10-09

Checked on `main` at f2adf29 (after PR #21): SPEC.md, HANDOFF.md and README.md against each other and against the code. `npm test` passes (361: server 160, shared 70, web 131), matching HANDOFF. Nothing was changed.

## A. Docs that say the opposite of what the code does

1. **Buying from a merchant: "equipment" vs "inventory".** Since PR #21 a bought item goes into the sheet's structured Inventory (`addToInventory`, `server/src/routes/merchants.js:253`). Three places still say it goes into the free-text equipment:
   - HANDOFF Decisions table, "Buying from a merchant pays from the sheet and fills its equipment automatically" (HANDOFF.md:153).
   - README "Items and merchants": "the item goes into their equipment" (README.md:131).
   - The code comment at the top of `server/src/merchants.js` (line 5).
   SPEC §6.9 and HANDOFF "Current state" are right.
2. **Typed attacks and the Proficient tick (SPEC contradicts itself).** SPEC §6.4 "An attack" says an attack has "Proficient (ticked by default)". The next bullet, "Equipped weapons", says typed attacks no longer have a Proficient tick. The page matches the second: `web/public/sheet.js` only shows Proficient on inventory lines.
3. **AC and weapon bonuses listed as "Later".** SPEC §6.3 still lists "armour and shields for AC… weapon attack bonuses" as future automation. Both are built: `armorClass` in `gear.js`, plus to-hit worked out in `rolls.js`. SPEC §6.4 "Rules" says so too.
4. **README says AC is "unarmoured AC" only.** README "Character sheets" lists the automatic values as including "unarmoured AC". AC now comes from equipped armour and shields, and from magic items.
5. **AI models table is missing the walls task.** SPEC §3.5 puts "drafting walls" under the `maps` task at **medium** effort. The code has its own `walls` task at **max** effort (`config.js:69`, `MODEL_WALLS`/`EFFORT_WALLS`), which is what SPEC §6.6 describes.
6. **Find online is described as creatures only.** SPEC §3.5 ("research(), used only by the DM's Find online (§6.6)") and README (near the top: "Find online (Creatures tab)… to look a creature up") both say this. Items have Find online too (`items-find.js`, SPEC §6.9), with the same web access.
7. **Schema version in the repo layout.** SPEC §3.1 says `db/ … (schema v14)`. The code is v15 (`db/index.js:11`), and SPEC §4.2 and HANDOFF both say v15.
8. **SPEC §3.1 web file list is garbled.** Two lines (map-templates, creatures, archivist, table) appear twice with different text. `campaign-settings.js` (the DM's Settings dialog) is missing.

## B. Privacy statements that disagree

9. **Can the DM see players' sheets?** Several places say only the player can:
   - SPEC §5.5 Character sheet row: "Only its player… Not the DM".
   - SPEC §9: "Currently only the player can".
   - HANDOFF Decisions table: "Sheets private to their player… DM access is part of the deferred DM role".
   Since PR #21 the DM does see part of every sheet: equipped items, AC, weight carried, load and attunements (`GET /gear/equipped`). The SPEC §5.5 Inventory row describes this as an exception, but those three lines were never updated. The DM's Merchants tab also shows who bought what, so the DM sees some carried items as well.
10. **"The DM's role will be designed later."** SPEC §1, HANDOFF "Who's who" and SPEC §9 all say this. Meanwhile the DM has been given a lot of powers piece by piece: Creatures, Items, Merchants, Rest, Settings, all map control, and the equipped view. This is not wrong yet, but the "deferred" wording no longer describes the situation.

## C. Features that disagree with each other

11. **Rules editions can disagree inside one campaign.** The sheet always uses 2014 rules (`shared/src/sheet.js`). Rests use `REST_RULES`, or 2024 when the group's Player's Handbook in the books folder is the 2024 one. Q&A follows the Player's Handbook too. With a 2024 PHB in the books folder, the sheet works things out by 2014 rules while rests and answers use 2024. This is already planned to be fixed by the per-campaign edition setting (HANDOFF next step 0, SPEC §6.2 and §9), but today it is a real mismatch.
12. **A player character has two hit point totals.** The map token's HP is set separately from the sheet's, and rests don't change it. Other map features do read the sheet: token speed (with encumbrance) and initiative. HP is the only one that doesn't. This is documented (SPEC §6.8 "Not changed by rests"), but players will see two different numbers.
13. **Charges vs rests.** The DM's long rest gives back slots and hit dice, and counts towards merchant restocks, but leaves item charges alone. Players press Recharge themselves. This is documented and deliberate, just inconsistent with what a long rest does elsewhere.

## D. Smaller drift (omissions, not contradictions)

- HANDOFF next step 0 ends with "Not handled: … hit dice (the rests work)". This reads as if hit dice aren't handled, but they are (PR #22). It is probably a leftover.
- SPEC §4.2 `creatures` row and the README `POST /creatures` route don't mention `ac`, which the code stores (`creatures.js:34`) and the README Creatures section mentions.
- README has no section on the Inventory tab or campaign settings (they appear only in the API table). Its Data list leaves out `rests.jsonl` and `settings.json`. Its Layout line for `shared/` leaves out `rolls.js`, `gear.js` and `settings.js`.
- SPEC §8 milestone 7 lists the DM tabs as Creatures, Archivist and map tools, but not Items, Merchants, Rest or Settings.

Memory hints that turned out to be already fixed: HANDOFF's Git line now lists #1–#23 (including #16 and #20) as merged, and dice are Deluxe and Classic only everywhere.
