# Housekeeping audit (2026-10-08)

Audit of `main` after PR #15, the last merge. Nothing has been changed yet. Each item says what I checked. Items are numbered so you can reply with the ones to fix, e.g. "1–4, 8, 11".

Tests on `main` as it stands: all passing (server 124, shared 49, web 115).

---

## A. Things that contradict each other in the code

**1. The DM's old sheet is hidden, but it can still be opened and still goes to the archivist.** PR #15 swapped the DM's Sheet tab for Creatures, but only by hiding the tab:
- The **Sheet window** button on the map bar still shows for the DM and opens the DM's own character sheet. In the popped-out window, `dmMode` is forced off (`web/public/app.js:181`), so the sheet tab comes back. The button is never hidden for the DM (`index.html:244`, `sheet-place.js:105`).
- The page still loads the DM's sheet every time they enter a campaign (`app.js:203`, `loadSheet` is called for everyone).
- The server still lets the DM save a sheet (`server/src/app.js:836-845`). The archivist's between-sessions job reads **every** sheet in the campaign (`kb/updates.js:140`), so a DM sheet saved before PR #15, or through Sheet window, gets read as if it were a player's.
- SPEC §6.6 says "the map has no sheet beside it for them". That's true for the menu beside the map, but not for Sheet window.
- *Fix:* hide Sheet window for the DM, don't load a sheet for the DM, have the server refuse sheets for the `dm` role, and skip DM sheets in `updates.js`. Any DM sheet already saved stays in the archive, untouched.

**2. Copy-pasted stat block dialog, already drifting.** `statsDialog` and `fillStats` are in both `web/public/map.js:2006-2040` and `web/public/creatures.js:295-330`, almost line for line. They've already diverged: a creature found online keeps `source: 'web'` when placed on a map, but the map's copy of the dialog has no "found on the web, check it" line, so it says only "Only you see this."
- *Fix:* one shared function, used by both.

**3. Token picture cropping is written three times.** The "cut to a 256 px square around what stands out, cache it" code appears at `server/src/app.js:2059-2063` (token pictures), `app.js:2174-2178` (creature pictures) and `characters/pictures.js:131-135` (player tokens), each with its own cache.
- *Fix:* one helper.

**4. Two different checks for uploaded images.** Map images go through `inspectImage` (`maps/read.js:24`), which has no size or pixel limit of its own. Every other picture goes through `inspectPicture` (`characters/pictures.js:45`): 10 MB and 100 million pixels at most. Maps are still capped by the upload limit and sharp's own default pixel limit, so this isn't a hole, just two rules for one job.
- *Fix:* one checker, with a higher limit for maps.

**5. Markdown is cleaned three ways.** Q&A answers use a strict allowlist (`app.js:293`). Stat blocks and records on the map and Creatures tabs use a different blocklist (`map.js:1952`, `map.js:2023`, `creatures.js:311`). The strict CSP makes this safe today, but it's one job done two ways.
- *Fix:* one `renderMarkdown` used everywhere.

## B. Dead code and stubs

**6. `llm.text()`** is in both AI providers (`llm/api.js:106`, `llm/claude-code.js:126`) but nothing calls it. The fake AI in the tests throws "text() is not used any more" (`test/helpers.js:118`). HANDOFF calls it "kept as a general capability".

**7. `groupIntoSections`** (`pipeline/prepare.js:58`) is left over from the map/reduce pipeline that was removed on 2026-10-04. Only a test uses it.

**8. Unused constants:** `ROLES` (`shared/src/index.js:3`) and `HEALTH` (`shared/src/map.js:25`) are exported and never used.

I found no TODO/FIXME markers and no half-built features in the code. The real stubs are on the docs side (section C).

## C. Docs that contradict the code (or each other)

**9. SPEC:**
- §3.3 says DM features "not built yet: … corrections; answer the archivist's questions". Both are on the Archivist tab now.
- §3.5 says Claude Code runs with "no built-in tools (files, shell, web)". Find online turns on WebSearch and WebFetch (`llm/claude-code.js:131`). §6.6 says so, but §3.5 doesn't.
- §4.3 says `PIPELINE_VERSION` is "now 8". It's 9 (`config.js:21`).
- §5.5, Map row: "Not the archivist or Q&A (yet)". The archivist has been getting map events since today.
- §6.5 Dice: "Rolls are **not stored** and nobody else sees them yet". The Sharing paragraph further down says the opposite, and that's what's true.
- §3.1, the repo layout, is missing about 15 files: creatures, handouts, the `characters/`, `net/` and `kb/updates.js` server files, `maps/events.js`, and on the web side `dm.js` (the Archivist tab), `table.js`, `creatures.js`, `look*.js`, `sheet-place.js`, the `dice-*.js` files and `themes.css`. §4.2 is missing the `map_explored` table, and §4.3's archive tree is missing `characters/` and map variants.
- The status line at the top stops at "v0.14 creatures" and leaves out layout options, the sheet beside the map, and the rest of today's work.

**10. HANDOFF "Current state"** reads like a history, not a current state:
- About eight items still say "branch X, draft PR" for PRs that are merged.
- "Tests … on branch `claude/unit-tests-da0yyf`, draft PR #3."
- "No DM/host screens yet."
- Dice: "Rolls aren't saved or shared yet."
- "Live install … database on schema v4, becomes v7". It's v12 now.
- "Second install … 164 tests passing."

**11. HANDOFF "Next steps"** has ten items all numbered `0.`, then 1–11. At least six of them say "review and merge the PR (ask the owner first)" for PRs you've already merged. "Character pictures … possible next: the DM giving NPCs pictures" is done. Dice items 4 and 0 repeat each other.
- *Fix:* collapse into one short "try for real" list, one line per feature.

**12. HANDOFF "Architecture"** says `shared` is "transcript parser, citation regex". It also holds the sheet rules, dice and map geometry.

**13. README:**
- "The AI runs with no file, shell or web tools … so a transcript, note or picture can't make it touch your PC." That's no longer true of web tools (Find online), and it's in the security section, so it matters most there. The server's own picture download is guarded against the home network (`net/fetch-public.js`). Claude Code's WebFetch runs on your PC too. I haven't checked whether it can be pointed at addresses on your home network, and that's worth checking.
- The Maps section stops at stat blocks and records: no initiative, Measure, templates, lights, pings, variants, links or Creatures tab.
- The Data section's list of what's archived leaves out handouts, creatures and character pictures.
- The API intro says the admin login passes DM checks "until the DM screens exist".

**14. `config.js` and `.env.example`:** the `DICE_ROLLER` comment in `config.js` lists five rollers and leaves out `deluxe`. `.env.example` has all six. The pricing table still includes `claude-haiku-4-5`, which nothing uses.

## D. Bloat (your call; nothing is broken)

**15. `server/src/app.js` is 2,468 lines (126 KB)**: every route in one function, including about 900 lines of map routes and 200 of creatures. Splitting it into route files (maps, creatures, admin, sheets) would make it easier to work on. The tests cover the routes, so `npm test` would catch breakage. It's a big diff with no visible change.

**16. `web/public/map.js` is 2,204 lines (100 KB)**, with the DM's tools taking about 470 of them. It could be split the same way: templates, initiative and DM tools in their own files.

**17. Six dice rollers and two separate 3D engines.** Classic and Quick use dice-box-threejs. Deluxe brings its own Three.js plus cannon-es. That's about 2,400 lines of dice code plus both libraries. HANDOFF already says to drop the rollers nobody wants once you've tried them. If you pick a default, the rest can go (e.g. keep Deluxe or Quick, plus Lite as the no-WebGL fallback, plus None).

**18. Look options:** 12 themes, 4 page layouts, 4 chat styles, 6 sheet styles and 5 sheet layouts (`themes.css` 50 KB, `look.js`). Same as above: worth pruning once the players have tried them, not before.

**19. Small tidy-ups:** `dm.js` holds the Archivist tab (rename it `archivist.js`); the sheet's CSS is split in two by the "beside the map" block in `style.css:551-915`; `CITATION_RE` is copied into `web/public/app.js:282` because `shared/index.js` isn't served to the page.

---

## Suggested batch

- **One PR, low risk:** 1–14 and 19. That's bug-level contradictions, dead code and docs. Behaviour only changes for item 1: the DM loses Sheet window.
- **Separate, only if you want it:** 15–16, a refactor with no visible change.
- **Needs your decision first:** 17–18, which rollers and Look options to keep.
