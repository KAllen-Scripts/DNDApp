# Map testing checklist

For the Maps features merged on 2026-10-07 (PR #1 and #2). Tick each box as you go and jot notes under anything that looks wrong.

The automated tests (`npm test`) already cover permissions, snapping, fog filtering, live updates and restore, using a stand-in AI. What they can't cover is the real AI, real maps and PDFs, and real phones, so Part 1 comes first.

## Before you start

- [ ] Pull `main` and run `npm install` (new packages: `@napi-rs/canvas`, pdf.js).
- [ ] Start the server (`npm start`) and check the log: the database upgrades to schema v8 with no errors.
- [ ] Open http://127.0.0.1:4400 as the DM in one browser window.
- [ ] Log in as a player in a second window (a private/incognito window works). Make sure that player is in the campaign.
- [ ] Have a phone on the same network ready for Part 4.
- [ ] Gather test material: a gridded battle map, a gridless town or region map, a map with faint or dashed grid lines, and a real adventure PDF that has a map page.

## Part 1: Things only you can check (real AI, real files)

### The AI reading real maps
- [ ] Import a gridded battle map. "The AI is reading this map…" shows, then finishes.
- [ ] In Map settings, "What the AI saw": the kind (battle map, dungeon, town…), name and description make sense.
- [ ] The grid drawn over the map lines up with the real squares across the whole map, not just one corner.
- [ ] The scale is right (5 ft per square if the map doesn't say otherwise).
- [ ] Import a gridless town or region map. It's read as having no grid, and any scale bar or label ("1 inch = 1 mile") is picked up.
- [ ] Import a map with faint, dashed or textured grid lines. Note whether the grid lines up. (This is the case most likely to be off.)
- [ ] If a grid is off, fix it by hand with Square size (px), Offset across and Offset down. The overlay moves live as you type and stays fixed after Save.
- [ ] "Read again with the AI" works and doesn't throw away your manual fixes unexpectedly (note what happens).
- [ ] Rough timing: how long a read takes. Note it.

### A page of a real PDF
- [ ] Import a real adventure PDF; at "Which page is the map on?" give the map's page number.
- [ ] The right page shows up, sharp enough to zoom in on.
- [ ] Try a big scanned PDF (tens of MB). Note whether it imports and how long it takes. The page limit is 35 MB.
- [ ] Try a page number past the end of the PDF. You get a clear error, not a crash.
- [ ] The AI reading works on the PDF page too.

### AI stat blocks
- [ ] Add an enemy token named after a common creature (e.g. Goblin) with the auto lookup box ticked. The stat block, hit points and size fill in by themselves.
- [ ] Open "Stat block (AI)" and compare AC, HP, speed and CR with the Monster Manual, for 3 or 4 creatures (one small, one large, one spellcaster).
- [ ] Name a token "Boss", then use "Look up instead" with "Bugbear". The Bugbear's block is used.
- [ ] Look up a made-up creature. Nothing changes and you get a sensible message.
- [ ] Hit points or size you set yourself are not overwritten by a lookup.

## Part 2: As the DM

### Importing and managing maps
- [ ] Import a PNG, a JPEG and a WebP. All three show.
- [ ] Try a file over the size limit. You get "That file is too big".
- [ ] A new map starts hidden from players (check in the player window).
- [ ] Rename a map in Map settings. The new name shows in the picker.
- [ ] Show the map to players. It appears in the player window right away, without a refresh.
- [ ] Hide it again. It disappears from the player window right away.
- [ ] Remove a map. It's gone from the picker. (It's kept in the archive; nothing is deleted.)
- [ ] Pan by dragging, zoom with the wheel, Fit to screen, and the grid overlay toggle all work.

### Tokens
- [ ] Add a player character token tied to the test player. It's named after their character.
- [ ] Add an NPC token with "Nobody (the DM moves it)".
- [ ] Add an enemy token (e.g. "Goblin 1").
- [ ] Try each size, Tiny to Gargantuan. Each covers the right number of squares (½, 1, 2, 3, 4).
- [ ] Colours apply and are easy to tell apart.
- [ ] Drag a token on a grid. It snaps to squares (Medium in a square's middle, Large on a corner) and stays on the map.
- [ ] The distance shows while dragging. Diagonals count as one square each (5e rule).
- [ ] On a gridless map, tokens move freely and the distance uses the map's scale.
- [ ] Edit a token (name, size, colour) and remove one.

### NPCs from the records
- [ ] When adding a token, pick someone from the campaign records. "People and creatures" are listed first.
- [ ] The token is named after them, and you can open what the records say about them from the map.

### Fog of war
- [ ] Turn Fog on. The player sees the map blacked out.
- [ ] Drag a Reveal rectangle. It snaps to squares and that part appears for the player.
- [ ] Cover part of it again. It goes dark for the player.
- [ ] Undo, Reveal all and Cover all each work (both ask to confirm where expected).
- [ ] The DM sees fog as a shade, not black.
- [ ] Enemy tokens under the fog don't show for the player. The player's own token always shows.
- [ ] Privacy check: in the player window, right-click the map and "Open image in new tab". The covered parts are black in the actual image too.

### Walls and line of sight
- [ ] In "Fog & walls", press AI walls on a real battle map. Walls appear (purple) after a bit. Note how much is wrong.
- [ ] Fix them: Erase the wrong ones (click), draw missing ones with Wall (drag). Ends snap together.
- [ ] Draw a Door across a doorway. In Door mode, clicking it opens and closes it (dashed when open).
- [ ] Turn on Fog of war and Line of sight. The player sees only what their token can see; enemies behind walls don't show.
- [ ] Open the door: the player sees through it, live. Close it: what they saw stays dim.
- [ ] As the player, try to drag your token through a wall or a closed door. It refuses ("There's a wall in the way").
- [ ] Forget explored: the dim areas go away for the player.
- [ ] Draw an Obstacle round a building's roof. The player sees over it but can't walk through it.
- [ ] As the player, stand next to a door and click it: it opens. From far away it refuses. Lock it as DM: the player can't open it.
- [ ] Try Unseen parts: Dark, Greyed out, Map shown. Enemies out of sight stay hidden in all three.

### Hit points and conditions
- [ ] Give a token max HP. In the selection bar type `-7`, `+5` and `12`. Current HP changes each time.
- [ ] Add and remove conditions, including concentrating.
- [ ] Take an enemy to half HP or less. The player sees "Bloodied", not the numbers. At 0 they see "down".

### Hidden tokens
- [ ] Hide a token. The DM sees it faded; the player doesn't see it at all.
- [ ] Unhide it. It appears for the player right away.

## Part 3: As a player

- [ ] Before the DM shows any map: "No maps to see yet. Your DM shares them here."
- [ ] Move your own token. The DM sees it move live.
- [ ] Try to drag an NPC, an enemy or another player's token. It doesn't move.
- [ ] You can't see Import, Add a token, Map settings, Fog or Stat block anywhere.
- [ ] Change your own token's HP and conditions. The DM sees the change.
- [ ] Your character's HP numbers show; enemies only show Unhurt / Hurt / Bloodied / down.
- [ ] You never see the AI's description, stat blocks, record links or hidden tokens.
- [ ] Drop a pin with a label and colour, then drag it. It stays the same size when you zoom.
- [ ] The DM can't see your pin, and nor can another player.
- [ ] Your pins are still there after a page refresh and after the server restarts.

## Part 4: On a phone

Do these on a real phone, as the player and then as the DM.

- [ ] Log in and open the Map tab. Everything fits; nothing is cut off.
- [ ] Pinch to zoom and drag to pan.
- [ ] Drag your token with a finger. It doesn't pan the map by mistake, and the distance shows.
- [ ] Tap a token to select it; the selection bar is usable (HP box, conditions).
- [ ] Drop and drag a pin.
- [ ] As DM: import a photo from the phone, add a token, and drag a fog rectangle.
- [ ] Lock the phone for a minute and come back. Live updates reconnect and moves still show up.

## Part 5: Live updates and restarts

- [ ] With both windows open, every DM change (move, add, hide, fog, HP) shows in the player window within a second or two.
- [ ] Restart the server while both windows are open. Both reconnect and catch up.
- [ ] Restart the server in the middle of an AI read. The read is marked failed and "Read again with the AI" works.
- [ ] After a restart, all maps, tokens, fog, HP and pins are as you left them.

## Notes

Write anything odd here, with which map or file it happened on.
