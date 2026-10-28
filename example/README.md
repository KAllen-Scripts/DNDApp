# The example campaign: The Lanterns of Saltreach

Made-up test data for trying the app before there's a real group: a campaign prepared up to the first
session, and (in `transcripts/`) four long session transcripts to feed in. **Nothing that happens in play
is in the data**: no sessions, notes, knowledge base, wiki proposals, handouts given, rolls or rests. All of
that comes from feeding the transcripts in.

## Switching it on and off

The server runs on one of two data folders, never both, so the example never mixes with the real data:

| `.env` | Data folder | |
|---|---|---|
| (nothing), or `DATA_SET=real` | `data/` (`DATA_DIR`) | the real campaign |
| `DATA_SET=example` | `data-example/` (`EXAMPLE_DATA_DIR`) | this example |

Put `DATA_SET=example` in `.env` and run `npm run restart`. The first time, the server seeds the example
(about half a minute; the made maps are the slow part) before it opens, and writes the accounts and their
password to `data-example/example-accounts.txt`. Set `EXAMPLE_PASSWORD` first if you want to choose it.
Remove the line (or set `DATA_SET=real`) and restart to go back to the real data. The log's `Data:` line
says which one is running.

To start the example again from nothing: stop the server, delete `data-example/`, start it again.

## What's in it

- **Accounts:** `test-admin` (admin), `test-rowan` (the DM), and four players: `test-mags` (Wren Ashdown,
  wood elf Circle of the Moon druid), `test-theo` (Bran Hale, human Battle Master fighter), `test-jules`
  (Pip Thistlewood, halfling Arcane Trickster rogue; also has a second, inactive character, Corvin Marsh)
  and `test-priya` (Oriel Vane, tiefling Celestial warlock). All level 3.
- **Settings:** 2014 rules, its own calendar (the Tide Reckoning) with a moon, seasons and holidays, the clock at
  08:00 on 3 Rimewane 1147, a custom background (Lamplighter), the glossary.
- **Creatures** (15, with stat blocks), **items** (about 37, with prices) and **merchants** (5, with stock
  and restocking), some placed on the maps.
- **Maps** (10): the Greyhallow Coast region map (painted in code) with places that open the other maps,
  roads, a river, a marsh with random encounters; Saltreach harbour, the Brined Eel, the lighthouse (three
  levels, with a secret door down to the Drowned Chapel), the Gull Steps caves, Fenwick and Mother
  Sallow's stilt-house.
- **The DM's wiki** (about 60 pages): the world, places, factions, religion, people, quests with their
  status, clues, rumours (true, rumour and false), an arc and the first session's plan. Some pages and parts
  are DM-only, some for one player (Bran's debt is Theo's alone), and each character has a page.
- **Pictures:** `pictures/` (public domain or CC0; `pictures/credits.json` says where each came from). The seed
  skips any that are missing.

The data is in `campaign/` as plain JavaScript; `packages/server/src/example/seed.js` puts it in through the
server's own API (so it's validated and archived like anything the DM makes) with no AI calls.

## Feeding the transcripts in

Upload them in order as the DM (`test-rowan`) on the **Sessions** tab, one session each, dated **after** the day the example was
seeded (sessions take the map and sheet changes made on their date, and the seed made lots). Link the
speakers on the first upload (left to you on purpose, to try the upload screen's guesses): Rowan is the DM
(`test-rowan`), Mags plays Wren (`test-mags`), Theo plays Bran (`test-theo`), Jules plays Pip (`test-jules`),
Priya plays Oriel (`test-priya`).
`transcripts/README.md` has what each session covers and what to check after it, and
[ask-checks.md](ask-checks.md) has questions to ask as each player, with what must not come out.
