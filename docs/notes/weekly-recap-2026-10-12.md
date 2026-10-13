# Map progress recap: week of 5 to 12 October 2026

Checked against `origin/main` and the open PRs on GitHub on 12 October. Map files: `packages/server/src/maps/`, `routes/maps.js`, `shared/src/map.js`, `web/public/map*.js` and their tests.

## What landed (all merged to main)

**7 Oct: the map came to life (PRs #1 to #9)**
- The DM imports any map or a PDF page; the AI reads its kind, name, grid and scale, and the server measures the grid.
- Tokens for characters, NPCs and enemies, moved live. Player token pictures come from character sheets.
- Fog of war, hit points and conditions, hidden tokens, AI stat blocks, NPCs from the campaign's records, private pins.
- Walls, doors and line of sight with an AI wall draft; doors players open; obstacles.
- Initiative tracker, Measure tool and spell templates.

**8 Oct: deeper play (PRs #11 to #17)**
- Darkness, light sources and darkvision; pings and quick sketches; planned movement with waypoints, speed and difficult terrain.
- Map variants (a night version) and links between maps (stairs to another map).
- Map events (fights, downs, doors, travel) go to the archivist with each session.
- The DM's saved creatures placed on any map; Find online for stat blocks and pictures.
- Walls and doors (#17): doors drawn as doors and locked with a click, curved and round walls, walls from .dd2vtt files, hideable walls, a thorough AI wall draft.
- Map code split into `map-state.js`, `map-templates.js`, `map-combat.js`, `map-dm.js`.

**9 Oct: the table around the map (PRs #20 to #25)**
- Initiative rolled from the sheet goes into the fight; merchant tokens players buy from.
- Full screen map (#25): the map fills the screen with see-through tools; the DM's Edit button shows or hides set-up tools.

**10 Oct: polish (PRs #29 to #32)**
- AI walls show progress, done and failed messages (#29), and the message closes again (#32).
- A player character's token uses the sheet's hit points (#31).
- "Beside the map" picks the side panel in Look (#30).

## Open PR

- **#33 The DM picks the AI walls effort** (opened 11 Oct, 18 files, +118 / −34): lets the DM choose how hard the AI works on a wall draft. Waiting on Kenny's review. https://github.com/KAllen-Scripts/DNDApp/pull/33

## What's left (from HANDOFF.md "Next steps")

1. **Review and merge #33.**
2. **Try the merged map work with the real AI**, which none of it has had yet: reading real maps (faint grids may not be measured), AI walls on a dungeon, a round tower or cave, and a big map (cost and time at xhigh effort), lights and difficult terrain, stat blocks.
3. **A short real fight with DM and player windows, on a phone too:** fog, line of sight, darkness with a torch and darkvision, doors, initiative, a Fireball template, pings, waypoints, a night variant, stairs to another map.
4. **Full screen and edit mode in Chrome, Firefox and on a phone:** the see-through tools over light and dark maps; the turn order and token bar clear of the toolbars.
5. **Token hit points linked to the sheet:** deal damage from a token and check the sheet follows.
6. **Check map events reach the archivist** after processing a session played with a map.
7. **Later, planned:** a ready-made creature library from the books once they're scanned.
