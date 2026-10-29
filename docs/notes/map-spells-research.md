# Spells that aren't attacks, on the map: how other tables do it

Research for Kenny's feedback of 2026-10-28: "I saw no way to cast spells such as 'Entangle', that aren't an attack. Speaking of, how do such spells interact with the map? If they don't, then they should. Look at how other softwares do this." Built as SPEC §6.6 "Spells that aren't attacks". The earlier research on attacks is in [map-attacks-research.md](map-attacks-research.md).

## What a spell like Entangle needs

Entangle is a good test because it does four things at once: it has an **area** (a 20-foot square), a **saving throw** whose failure gives a **condition** (restrained), it changes the **ground** (difficult terrain for its duration), and it **lasts** (concentration, up to a minute), with a way to **break free** (a Strength check with your action). Hold Person (one target, paralyzed, a new save each turn), Web (area, restrained, difficult terrain), Faerie Fire (area, no condition but a lasting mark), Bless (up to three targets, no roll at all), Invisibility (one target, a condition straight away) and Spirit Guardians (an area that hurts whoever's in it each turn) cover the rest.

## Foundry VTT (dnd5e, with Midi-QOL, DAE and the region modules)

- **Every spell is castable.** A spell is an item with *activities* (attack, save, damage, heal, utility). A spell with nothing to roll still has a "Cast" (utility) button that spends the slot and posts a chat card.
- **Effects, not just damage.** A save activity carries *Active Effects*: on a failed save the target gets the Restrained status (and its rules: disadvantage on Dex saves, attacks against it at advantage). Midi-QOL applies them automatically to the targets that failed.
- **The template stays.** The measured template is placed from the spell and left on the scene. Newer Foundry turns it into a **Region** with *behaviours*: difficult terrain inside it, and "on enter / at the start of a turn" triggers that run the save again (the Persistent Zones and Region helper modules do this for Entangle, Web, Spirit Guardians, Cloud of Daggers).
- **Concentration links it all.** DAE and Midi mark the caster as concentrating and tie the template and the effects to it: when concentration ends (a failed Con save, casting another concentration spell, or by hand) the template and every effect it gave are removed together.
- **Durations** count down in the combat tracker; effects expire on their round.
- **Take:** cast any spell; conditions from a failed save go on the tokens; the area stays and changes the ground; concentration ties the area, the conditions and the caster together, so ending it cleans up everything; durations count in rounds.

## Fantasy Grounds (5e ruleset)

- Spells have *cast*, *save*, *damage* and *effect* actions. An effect line like `Restrained; (C)` is applied to each target that fails, shown on its combat tracker row, with a duration in rounds; `(C)` marks it as the caster's concentration, so when the caster stops concentrating every linked effect is removed.
- Effects can ask for a save again ("SAVEE: Wisdom" for Hold Person's save at the end of each turn); the DM can drag an effect off a token by hand.
- **Take:** the effect is a record linked to its caster, with a duration and a way to roll again; the DM can always take it off.

## Roll20

- Templates are drawings (the AoE tool or a token with an aura); conditions are status markers set by hand; the spell card posts the DC. Nothing links them: when Entangle ends, someone deletes the drawing and clears the markers. The new Beacon sheets roll saves from the card but still don't apply conditions.
- **Take:** this is what happens without automation, and it's the clunky part players complain about.

## D&D Beyond Maps

- Areas of effect can be dropped from the character sheet's spell, conditions are tracked on tokens and in the initiative list (2024 update), and the DM applies them. Templates and conditions are not linked to concentration, and there's no difficult terrain.
- **Take:** conditions on tokens, set from the spell, are what players expect to see.

## Owlbear Rodeo (extensions)

- Extensions add AoE templates, condition markers and "aura" rings that follow a token. Still manual.

## What we build (and why)

1. **Every spell on the sheet can be cast from the map**, not just ones that roll damage. A spell with nothing to roll (Bless, Mage Armor, Invisibility) is cast on whoever you tap (up to the number it says, more when cast higher), on yourself, or on nobody. The slot is spent like any other spell's.
2. **Conditions from the spell's text** (`spellConditions`): "or be restrained", "or be paralyzed", "becomes charmed… is incapacitated", "falls prone", "has the Restrained condition" (2024), "becomes invisible". They go on the tokens that fail the save (or straight away for a spell with no roll). The attack rules already use those conditions (advantage against the restrained, a paralyzed target hit from 5 ft is a crit).
3. **Lasting spells stay in play** (the map's `spells`): the spell, its caster, its area (the template stays, marked as the spell's), who's under it and with what, its save DC, and how it ends. Like Foundry's concentration link and Fantasy Grounds' `(C)` effects:
   - **Concentration:** the caster's token gets Concentrating; a failed concentration save, a new concentration spell, or taking Concentrating off the token ends the spell.
   - **Ending** a spell (End spell, Undo, its time running out, removing its area) takes its area away and the conditions it gave off (unless another spell gives the same one).
   - **Durations** count in a fight: a spell lasting a minute ends as its caster's turn comes round 10 rounds later. Outside a fight it lasts until someone ends it (the app doesn't keep the time of day for maps).
4. **Areas change the map**: an area that says it's difficult terrain (Entangle, Web, Spike Growth, Grease) is difficult terrain for movement while the spell lasts (moving through it costs double, as drawn terrain does).
5. **Rolling again**: *Break free* / *Save again* for someone under it (Entangle's Strength check with their action, Hold Person's save at the end of each turn), and *Roll for who's in it* for the area (someone walks into the Entangle; Spirit Guardians on a new turn), without a slot.
6. Kept simple, like the attacks: the server does the rolling and the bookkeeping; the DM can always change a token's conditions by hand; players only see what they can see.

Not yet: buffs that change numbers automatically (Bless's d4, Shield's +5 AC), auras that follow a token (Spirit Guardians moves with the caster: move its area by hand), triggers on entering an area (use Roll for who's in it), durations outside a fight.
