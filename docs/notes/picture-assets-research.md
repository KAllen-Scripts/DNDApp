# Picture assets for the map creator: research

Written 2026-10-13 in the "Map creator with assets" thread. Research only; nothing built. Waiting on Kenny: build part 1, part 2, or both?

Kenny (2026-10-13): "Do a quick bit of research on the feasibility of pulling in picture assets to use as well. So we could have something more detailed looking. Buildings, backgrounds, land, etc."

## Where things stand

Every built-in floor, wall, path and asset in the creator is drawn in code (original work, no licences; `shared/src/map-art*.js`). The DM can already upload one picture at a time as their own asset (`map_assets`, SPEC §6.6 "Making a map"), so the plumbing for picture assets exists. The new work is getting good pictures in bulk and on legal terms.

## Part 1: real textures for floors and land (recommended first)

- [Poly Haven](https://polyhaven.com) and [ambientCG](https://ambientcg.com) give away seamless ground textures (grass, dirt, stone, sand, water, wood) as **CC0**, so they can ship in the repo with no credit owed.
- The server would tile them under the map instead of the code-drawn floors (the server already draws the picture with the same code as the page, `maps/design.js`).
- Biggest visual jump for the least work.
- Catch: they're photo-real, so they may clash a little with the hand-drawn assets until part 2 is in.

## Part 2: import whole asset packs from the host's PC

- Best-looking packs: [Forgotten Adventures](https://www.patreon.com/posts/21728541), 2-Minute Tabletop, and Dungeondraft packs (buildings, trees, furniture, backgrounds).
- Their licences cover personal use, **not bundling into software**. Forgotten Adventures' current free-tier terms weren't found.
- So the safe way is the one used for the books: the owner downloads packs into a folder on his machine, and the server reads that folder into the creator's asset list, grouped by its sub-folders. Nothing goes into the repo.
- Dungeondraft packs often come with an unpacked folder of PNGs, which works as-is. Packed `.dungeondraft_pack` files would need an unpacking step (not checked yet).
- Free CC0 packs exist too, simpler and more cartoony than FA: [Kenney's Scribble Dungeons](https://opengameart.org/content/scribble-dungeons), [Screaming Brain's top-down dungeon pack](https://opengameart.org/content/top-down-dungeon-pack).

## Buildings

Work like any large picture asset. The DM marks which parts block movement, or lets the AI walls draft trace them.

## Not worth it right now

AI-generated pictures: Claude can't make images, so it would mean paying for another image service.
