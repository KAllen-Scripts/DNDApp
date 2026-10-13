# Map features from other VTTs worth adding (2026-10-07)

Research only. Compared against main after PR #10 (SPEC §6.6). Kenny's direction respected: no premade maps, DM imports terrain and places tokens by hand; 3D parked.

## What DNDApp already matches
Imported maps with grid/scale detection, live tokens with pictures, manual fog, walls/doors/locks/obstacles, per-token line of sight with explored memory, HP/conditions, hidden tokens, private pins. That is roughly Owlbear Rodeo plus its dynamic-fog extension. The AI map read, AI wall draft, AI stat blocks and record-linked NPCs are things none of the others do built in.

## Ranked gaps

1. **Initiative / turn tracker on the map.** Every competitor has one (Foundry combat tracker, Roll20 turn order, Owlbear's first official extensions were dice + initiative). Add the map's tokens, roll initiative with the server dice (enemies use their stat block's Dex), highlight whose turn it is, round counter. HP and conditions already live on tokens, so this is mostly glue. Biggest gap for actual combat.
2. **Ruler and spell templates.** A measure tool anyone can use (drag distance exists, but only while moving), plus cone / sphere / line / cube templates sized in feet that show which tokens are caught. Roll20, Foundry and Owlbear all have this. Could launch from a spell on the sheet (range and area are already in spell data).
3. **Light sources and darkvision.** Torches, lanterns, braziers with bright/dim radius, darkvision per token, and a day/night slider (Roll20 "Daylight Mode", Foundry, Owlbear 2.3 dynamic fog). Builds directly on the existing sight polygon. AI twist: the wall-draft pass could also propose light sources it sees on the art, for the DM to accept.
4. **Pings and a shared pointer / quick drawing.** Click-hold to ping a spot everyone sees, and temporary freehand marks that fade. Cheap, and the main way remote groups say "here" (Roll20, Owlbear, Foundry).
5. **Movement with waypoints and a speed budget, plus difficult terrain.** Foundry v13's headline feature: plot a path through waypoints, see total feet, cost doubled in difficult-terrain regions, path blocked by walls. Ties into initiative (movement left this turn). AI could draft difficult-terrain zones (water, rubble, undergrowth) the same way it drafts walls.
6. **Map variants and linked maps.** Alchemy's "map phases" swap day/night or before/after art on the same scene; Foundry regions teleport tokens between scenes (stairs, doors to another floor). For DNDApp: the DM uploads an alternate image for a map (same grid, walls and tokens kept), and a door or stairs can link to another map.
7. **Map events into the archivist.** Already in SPEC "Later". Who fought whom, who went down, which doors were opened, fed to the archivist after a session. No competitor does this; it's the strongest differentiator after the AI read.
8. **Atmosphere: ambient sound and weather overlays.** Alchemy's selling point (soundscapes, rain/snow/fire overlays). Nice but lowest value per effort; the strict CSP means any audio and effects have to be served by the server.

Also seen, lower priority: token auras (paladin aura, spirit guardians), elevation/flying labels, token facing, GM-only drawing layer, handouts on the map.

## Sources
- Foundry v13 release notes (drag ruler, waypoints, Modify Movement Cost regions): https://foundryvtt.com/releases/13.335, https://foundryvtt.com/releases/13.341
- Owlbear Rodeo dynamic fog (walls, doors, lights): https://blog.owlbear.rodeo/owlbear-rodeo-2-3-release-week-day-3/
- Roll20 Dynamic Lighting (night vision, daylight mode, explorable darkness): https://pages.roll20.net/dynamic-lighting
- Alchemy map phases, overlays, soundscapes: https://alchemyrpg.com/czepeku, https://startplaying.games/blog/virtual-table-tops/the-new-players-guide-to-alchemy-rpg
