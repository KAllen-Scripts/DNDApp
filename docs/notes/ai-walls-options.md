# AI walls: how they work now, and how to make them better

Written 2026-10-08. **Update, same day:** the owner picked 1, 2, 3, 6 and 7, then asked for round walls, hideable walls and a thorough (expensive) draft. Built in PR #17: ruler, check pass, close-ups for big maps (5), grid snap and straightening, max effort on its own task, arcs and circles, .dd2vtt import. Not built: 4 (snap to the drawn lines in the picture).

## How the draft works today (`packages/server/src/maps/read.js`, `walls()`)

- One call to Claude Opus 5.5 at **medium** effort (the `maps` task, shared with the map reading; `MODEL_MAPS` / `EFFORT_MAPS` in `.env`).
- The map is shrunk to **2000 px** on its long side as a JPEG. The API shrinks images again to roughly 1,500 px on the long side, so on a big dungeon (60+ squares across) each square is only ~20 px when the AI sees it.
- The AI answers with lines as **numbers from 0 to 1000** across and down the image, from memory of what it saw. There is nothing on the picture to measure against.
- The server then only joins line ends that are within 1% of each other. It does **not** use the grid it already measured, or the pixels of the walls.
- It has **never been tried with the real AI** on a real map, so how bad it is is still a guess. The usual weakness of this approach: walls in roughly the right place but a few pixels to half a square off, wobbly instead of straight, and small gaps, which matter for line of sight.

## What would help, best value first

| # | Change | What it fixes | Cost per draft | Work |
|---|---|---|---|---|
| 1 | **Snap to the grid** (no AI): on maps with a measured grid, move wall ends onto grid corners and edges when they're close, and straighten nearly-horizontal or vertical walls | Most of the "half a square off" and wobble on battle maps | Free | Small |
| 2 | **A ruler on the picture**: draw faint labelled tick marks every 50 units round the edge of the copy the AI sees (and a faint coordinate grid) | The AI can read positions off the marks instead of guessing | Free | Small |
| 3 | **A second look**: draw the AI's first draft over the map in red and send it back: "fix what's wrong, fill the gaps, add missed doors" | Missing walls, gaps, missed doors | About 2× | Small |
| 4 | **Snap to the drawn walls** (no AI): look near each AI wall in the full-size image for a strong dark line and slide the wall onto it | Exact placement on maps with clear wall lines (most dungeon maps) | Free | Medium |
| 5 | **Tiles for big maps**: cut maps over ~30 squares into overlapping pieces at full detail, trace each, join them | Detail on large maps | 4-9× | Medium |
| 6 | **Higher effort** for walls only (a new `EFFORT_MAPS_WALLS`, try `high`) | Better at closing every room and spotting doors; doesn't make positions more precise | ~1.5-2× and slower | Tiny |
| 7 | **Import Universal VTT files** (`.dd2vtt` / `.uvtt`, exported by Dungeondraft, Dungeon Alchemist and many Patreon map makers) | Exact walls, doors and lights, no AI at all, for maps that come with one | Free | Medium |

**Model:** it already uses the strongest model (Opus 5.5). A different model wouldn't place walls better; Sonnet would only be cheaper and faster.

## Recommendation

Build **1, 2, 3 and 6** together: they're small, keep one AI path, and attack both precision (grid snap, ruler) and completeness (second look, effort). Add **7** if the owner's maps tend to come with a `.dd2vtt` file. Leave 4 and 5 until the real AI has been tried and we know whether precision or big maps are the problem.

Before building, try today's draft on two or three real maps (a gridded dungeon, a building, a cave) so there's a before-and-after.
