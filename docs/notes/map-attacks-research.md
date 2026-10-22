# Attacks and area spells from the map: how other tables do it

Research for Kenny's request of 2026-10-21 ("the player should be able to select an enemy and make an attack. Or cast an AOE spell and appropriate actions taken. The DM should also be able to do this with enemies… smooth and easy, not clunky"). What each platform does, and what we take from it. Built as SPEC §6.6 "Attacks from the map".

## Foundry VTT: dnd5e system, plus Midi-QOL (and MARS 5e)

- **Targeting is separate from selecting.** You *select* your own token and *target* others (T key, or double right-click). The attack then runs against whatever is targeted. Two kinds of "picked" is powerful but confusing for new players.
- **dnd5e on its own:** rolling an item puts a chat card with the attack total; the GM (or players, if allowed) right-clicks the damage roll to apply full, half, double or healing to the selected tokens. Saves show as a button on the card that each target's owner presses.
- **Midi-QOL** automates the whole chain ("workflow"): attack roll, compared with each target's AC (hit or miss on the card), damage rolled on a hit (dice doubled on a crit), saves rolled for the targets (auto for NPCs, prompted or auto for players), half damage on a save where the item says so, damage immunities/resistances/vulnerabilities applied, and the damage applied. Options people actually use: **auto-target on template draw** (placing a Fireball's template targets every token whose squares are inside it), "**GM must confirm damage**" (the damage card waits with Apply buttons), hiding the roll details or the target's AC from players, and concentration checks rolled when a concentrating creature takes damage.
- **MARS 5e** (a lighter alternative): targets are added to the card when you roll; hits are worked out against AC but the GM can flip hit/miss (cover isn't automatic); the damage card has an Apply button per target with the resistance multiplier already chosen; cantrips give 0 on a successful save, other spells half.
- **Take:** one action does everything, the card shows each target's result on its own line, the template finds the targets, the GM can make damage wait, and there's a way to flip things that the rules engine got wrong. Avoid the select/target split: we use "tap the enemy, then pick the attack".

## Roll20 (5e by Roll20 sheet, API scripts)

- The sheet's attack button rolls to hit and damage together into chat (with crit damage alongside), but **nothing is compared with AC or applied**: the GM reads it and edits the token's bar. Targeting is a separate `@{target|…}` prompt ("click a token") that only some macros use.
- API scripts (Pro only) fill the gap: ApplyDamage / GroupCheck roll saves for every selected token and apply full or half damage; TokenMod changes bars. It works but needs macros and a paid tier, and players find it fiddly.
- **Take:** rolling to hit and damage in one go is what players expect; the "click a token" target prompt is a good, simple model. The lesson is to make the comparing and applying automatic, not a script.

## Owlbear Rodeo (extensions)

- Owlbear itself is a clean map with no rules. Extensions add pieces: HP trackers (bars on tokens, edit by typing -7), dice rollers (Rodeo Dice, Dice+), initiative trackers, and a few attack helpers that roll from a stat block and post to a shared log. Applying damage is still "type it into the HP bar".
- **Take:** keep it light. The token bar's `-7` box we already have is the Owlbear way; the attack flow should only add the parts players can't easily do in their heads (AC, saves, resistances, halving).

## D&D Beyond Maps

- Monster stat blocks open inside Maps; HP is tracked in the initiative order (click to apply damage or healing, temp HP, max override). Attacks and damage roll from the stat block and from the character sheet (Game Log), but **rolls aren't compared with the target's AC or applied**: the DM still applies damage in the initiative list. Players asked for advantage, disadvantage and crits on monster rolls.
- **Take:** rolls from the sheet the players already use; the DM's creatures roll from their stat blocks; one shared log card. Do advantage and crits properly.

## Fantasy Grounds (5e ruleset)

- The most automated: drag an attack from the sheet onto a target token (or target first, then click), and the attack is compared with AC; damage dropped on a target is applied with resistances, immunities and vulnerabilities from the NPC's sheet. Spells have "cast" actions with save DCs; targets roll their saves, and **half on success** is part of the action. Effects ("ADVATK", "RESIST: fire", conditions) change rolls automatically: prone, restrained, invisible and so on give advantage or disadvantage.
- **Take:** conditions on tokens should change the roll (we already track the 5e conditions on tokens), resistances should come from the stat block, and saves with half damage should be part of a spell.

## What we build (and why)

1. **One switch** in Campaign settings (on by default, so people find it), plus "damage from players' attacks waits for the DM's OK" and "players see enemies' AC" (off by default, as at most tables).
2. **Select the enemy, tap Attack, tap the weapon or spell.** Three taps, no keyboard: works on a phone. Or from your own token: Attack, the weapon, then tap the target. An area spell places its template (size and shape from the spell) and the server finds who's in it (Midi's auto-target on template).
3. **The server does it all** (our rule anyway): to hit vs AC (nat 20 always hits and crits with doubled dice, nat 1 always misses), damage on a hit, each target's save (creatures from their stat block's saving throws or ability scores, characters from their sheet), half or nothing on a save as the spell says, resistances/immunities/vulnerabilities from the stat block, then hit points (temp HP first for characters). Conditions on the tokens give advantage or disadvantage, and paralysed or unconscious targets within 5 ft are crits (as Fantasy Grounds and Midi do).
4. **One card** per attack for everyone who can see it, with a line per target; the DM's card has Apply / Half / Skip when damage waits, and **Undo** (puts the hit points and the spell slot back), like Midi's damage card.
5. **Privacy like the rest of the map:** players only target what they can see; a card shows only the tokens they can see; the enemy's AC, stat block and hit points never go to players (unless the DM shows AC); an unseen attacker is "someone you can't see".
6. **Extension point for extra damage on a hit** (Sneak Attack, Divine Smite, Hunter's Mark…): `shared/src/attack-riders.js`, so the sheet's class features can add riders.
</content>
</invoke>
