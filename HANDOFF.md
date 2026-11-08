# DNDApp — Handoff

Where the project stands, what to do next, open questions, decisions and lessons. [SPEC.md](SPEC.md) is the design (its core; each feature's detail is in [docs/spec/](docs/spec/)). [README.md](README.md) is the short overview; setup and hosting are in [docs/hosting.md](docs/hosting.md), the API in [docs/api.md](docs/api.md), tests in [docs/testing.md](docs/testing.md), each feature for its users in [docs/features.md](docs/features.md). Checks only the owner's machine can do are in [docs/vscode-checks.md](docs/vscode-checks.md).

**The full history** (every change-log entry from 2026-10-03 to 2026-10-30, and this file as it was) is in [docs/archive/](docs/archive/README.md). Don't read it by default; search it (`grep`) when you need why something was done, or what was tried before.

**Keep this file current and short.** For each piece of work: a dated change-log entry at the top of "Change log" (a few lines: what changed, where, tests; the detail belongs in SPEC or docs/spec), update "Current state" (rewrite, don't append) and prune "Next steps". When the change log passes about 20 entries, move the oldest into the archive (`docs/archive/changelog.md`).

**Who's who:** Kenny is the project owner and hosts the server on his machine (his Claude subscription powers the AI). He is **not** the DM; the DM is someone else in the group and can do what's built. "Owner's call" means Kenny decided.

**Working with the owner:**
- **SPEC.md and HANDOFF.md must stay current** ("EXTREMELY important", 2026-10-08). Every PR updates both to match what it changes: SPEC's design (the core or the docs/spec file), repo layout (§3.1), tables (§4.2), archive tree (§4.3), `PIPELINE_VERSION` and privacy rules; here, the change log, Current state and Next steps.
- **Merge PRs yourself once the tests pass** (2026-10-13: "Just merge stuff. If it's broken we will fix it."). Don't ask whether to carry on; staged work goes straight on to the next stage.
- **Watch the token cost.** He's on a Claude plan with 5-hour and weekly limits and has hit them. Unit tests over manual testing; during staged work run the regression tests and `npm test` once at the end of each stage (AGENTS.md). Read big files in parts (AGENTS.md "Reading code").
- **Explain in plain words** and lead with the answer; he decides features, Claude picks reasonable defaults and says which.
- Don't prune Look's themes or layouts until he says.
- Book PDFs live in his `DND books` folder next to the repo, never in the repo ([docs/notes/books-worked-through.md](docs/notes/books-worked-through.md), [docs/notes/5e-book-checklist.md](docs/notes/5e-book-checklist.md)).

---

## Current state (2026-11-02)

**What's built:** SPEC §6.1 is the list and docs/spec/ has each design. In short: transcript upload (or recording from Discord) → attendance → the archivist (an AI that owns the knowledge base) → per-player Q&A with privacy; notes; character sheets (several characters, Inventory, class/subclass/race features, Wild Shape, companions, item actions, level up, Review sheet); server-rolled 3D dice; maps (fog, walls, line of sight, heights, lights, combat, attacks and spells from the map, the world and travel, the map creator with realistic CC0 art); the DM's Bestiary, items and merchants; handouts, rests, campaign settings; the DM's wiki as its own space (stages 0 to 11), with a filtered Wiki tab for players; the phone layout; example data (`DATA_SET=example`).

**Most recent work** (2026-10-28 to 2026-11-02, see the change log): docs compacted and split; pick who to log in as on the example data; code in feature folders; Discord recording; the DM's own effects and NPC spells; spells that aren't attacks; casting from the sheet spends slots; the Bestiary; Items and Merchants moved into the wiki; level up; a shorter sheet; Ask's faster model (`MODEL_QA_FAST`).

**Numbers** (2026-11-02): schema **v21**, `PIPELINE_VERSION` **39**. Tests are offline and free (fake AI; the page in jsdom against a real test server). **938 tests** (server 370, shared 322, web 246; all pass 2026-11-02, including the example-data login picker's). There's no CI: `npm test` is the check, `npm run test:regressions` the quick one.

**Live:** https://thepartyledger.fyi when the server runs on the owner's PC (Cloudflare Tunnel `thepartyledger` → `127.0.0.1:4400`, `cloudflared` as a Windows service, https forced). Merged PRs aren't live until his checkout is pulled and restarted (`npm run restart`); the permission check in a Remote Control session blocks that unless he says so in words. On 2026-10-28 `.env` had `DATA_SET=example` (the live server ran on the example data); take it out to go back to the real data. `API_key` in the repo root holds the Cloudflare token (git-ignored; never print or commit it). No player guide yet.

**Installs:** the owner's PC (the server; `data/` holds the admin login "admin" and Kenny's player account; the database upgrades itself on start). His laptop (Node 24.19, `data/` with only the admin login). His Remote Control folder is `D:\Code` (checkout `D:\Code\DNDApp`). His Galaxy A20e in Termux is being set up as the host in the PC's place ([docs/hosting.md](docs/hosting.md), 2026-11-05 change log): `~/dndapp-start.sh`, `~/dndapp-stop.sh`, on the `claude/phone-host` branch until PR #154 is merged, real data active.

**Not yet tried for real:** a real transcript (the parser is built to an assumed format); the real AI on the map creator's draft, handout pictures, real maps (reading, walls, heights, stat blocks), Find online, picture descriptions, sheets and map events reaching the archivist, the book tools with every book, the wiki's AI, Review sheet, Ask's timings; Discord on a real call; most page features on a real phone or GPU (only jsdom and headless Chromium). Each has a line in [docs/vscode-checks.md](docs/vscode-checks.md).

**Verified for real:** the Claude Code provider (structured output, agents with tools, streaming); the archivist on two short sample sessions (notes, a whisper, an absence); per-player Q&A privacy with real answers over HTTP/SSE with citations; the local embedding model; DB migrations v1→v4 on real databases; logins, admin screen and page serving; the sheet's spell lookup (SRD, PHB scan, AI) and a PDF sheet upload through Claude Code; 3D dice in headless Chromium; maps in headless Chromium with a fake AI; book lookups on the owner's PHB 2014 and DMG 2024 scans. Not verified: the Anthropic API provider against the real API; a 3–4 hour transcript; the archivist over dozens of sessions; Q&A latency at real size; rebuild and corrections with the real AI; several people at once.

## Next steps

1. **The owner tries what's built** ([docs/vscode-checks.md](docs/vscode-checks.md)), most urgently: Discord recording (make the bot, paste its key on the campaign's Sessions tab, then pick the speech-to-text engine by speed on his card: `local` on CPU is likely hours for a 4-hour session, `whisper-cpp`'s NVIDIA build minutes; watch for gaps when someone joins or leaves, discord.js issue #11441); feeding the example transcripts in (`example/transcripts/README.md`, `example/ask-checks.md`); Ask's timings with the faster model (send the `Ask answered` log lines; tune `qa/route.js` from the log's `why`); the wiki's AI on his campaign (tune `src/wiki/ai.js`, bump `PIPELINE_VERSION`); thorough archiving with the real AI (raise `ARCHIVIST_MAX_TOOL_CALLS` if a run hits 500; a rebuild re-archives past sessions).
2. **Waiting on his calls** (defaults in place): map attacks on by default with damage applied straight away; item charges never recharging by themselves (a Recharge at dawn button could follow); should a summon's "until" also run out on the clock; Sonnet's answers good enough (`MODEL_QA_FAST=off` undoes it). Also "Open questions" below.
3. **Not built yet, if wanted** (by feature; designs in docs/spec/):
   - *Recording:* transcribing during the session; playing a line's audio.
   - *Sheet:* picking new spells in the level-up dialog, multiclass proficiencies; Battle Master manoeuvre choices, Metamagic and Invocation choices, rows that refill on initiative; feats outside `shared/src/feats.js` (War Caster, Sentinel… are the player's to apply); Luck and Elven Accuracy on Wild Shape forms' attacks; the AI sheet review checks 2014 numbers (its prompt: bump `PIPELINE_VERSION`); re-checking the 2024 PHB subclass rows against the PDF; subclasses and other books' races in the creation help; backgrounds from books not in the folder; Wild Shape's hours and the 2024 form swap; companions ending when their time runs out, Wild Companion spending the use, drag from sheet to map; homebrew weapon names in attacks; pictures for players' own inventory lines and looked-up items; magic item effects beyond the listed ones; Q&A reading the asker's own sheet; restoring an earlier sheet version from the page; the DM seeing or switching a player's other characters.
   - *Map combat:* Multiattack in one go, Magic Missile darts and Scorching Ray beams, cover, once-a-turn limits on extra damage, attacks in the roll log and in the archivist's map events (bump `PIPELINE_VERSION`); Bless's d4 and Shield's AC by themselves, auras following the caster, rolling on entering an area, durations outside a fight; saved custom effects, counting an NPC's slots and uses a day. New on-hit damage goes in `shared/src/attack-riders.js`; feats and features in `feats.js` / `subclass-traits.js`, numbers in `weaponExtras` (attack-extras.js) or `computeSheet`.
   - *Maps:* raised edges blocking moves except at stairs, cover hints, a Height box on creatures, the measure tool counting height, "last seen" markers, hiding from some players, one-way walls, heights in the explored-places memory; bridges in the creator and too-tall creatures under bridges; one editor for imported pictures too (the creator only edits maps it made); snapping AI walls to dark lines (option 4 in `docs/notes/ai-walls-options.md`); party-shared sight; dim light looking different.
   - *Map creator and art:* sails on generated ships; a premade creature and asset library; asset packs from a folder on the host (part 2 of `docs/notes/picture-assets-research.md`), per-asset heights, a hex grid; ~300 props still drawn in code, trees, the grandfather clock (art picks in `scripts/art/picks.js`, rebuild with `node scripts/art/build.js <downloads> <renders>`, downloads in `D:\Code\map-assets`). Known limit: a small map grown to 60 squares keeps its px a square (8400 px pictures).
   - *The world:* weather, getting lost, a mount's gallop, wagons' cargo, food and water, layers, AI help.
   - *Wiki:* as of an in-game day (needs the clock's history), the old map picture in the past, pictures in players' lore; a players' bestiary.
   - *Pop-out windows:* windows other than the sheet's telling each other about changes.
   - *Later, planned:* sessions built from notes only ([docs/notes/notes-only-sessions.md](docs/notes/notes-only-sessions.md), SPEC §6.3); glossary and speaker-map editing on the page; a creature library from the books; the rest of the DM screen (on hold).
4. **Books folder (owner):** rename `Players Handbook 5th Edition DD.pdf` to `Player's Handbook (2014).pdf`. The 2014 DMG is an EPUB, which isn't read.
5. **Hosting:** a short player guide; whether the server should start with Windows; whether Claude Code's WebFetch (Find online) can reach home-network addresses; Cloudflare's Browser Cache TTL to "Respect Existing Headers" (it keeps old .js for 4 hours).
6. **Install workaround (owner's call):** keep typing `npm install --ignore-scripts`, or add `ignore-scripts=true` to a project `.npmrc`.

When you change the web page, add or update a test in `packages/web/test/` (docs/testing.md). Not covered by page tests: the dice effects' visuals (`dice/effects.js`) and some of the Sessions tab's polling paths.

## Open questions for the owner

Every question still waiting on Kenny, in one place (SPEC §9 points here). When one is answered, move the answer to "Decisions" (and SPEC) and take it off.

1. **Picture assets for the map creator:** part 2 (asset packs read from a folder on his PC)? Part 1 became the realistic CC0 art. ([docs/notes/picture-assets-research.md](docs/notes/picture-assets-research.md))
2. **Private notes and the DM** (for sessions built from notes): should a note marked private be hidden from the DM too? Recommended yes. Asked 2026-10-07, never answered.
3. Should the DM see knowledge the archivist built from players' private notes and sheets through Ask? (Today yes: the archivist puts the DM in `known_by`.)
4. Should Ask read the asker's own character sheet ("what's my AC?")?
5. Should the DM see more of players' sheets than equipped gear, AC, weight, attunements, class feature uses and map hit points?
6. Should dice rolls go into the archive for the archivist? Claude's defaults from PR #13, never confirmed: rolls go to the whole party unless the roller picks otherwise; rolls aren't archived or sent to the archivist.
7. **The sheet and 2024 rules:** what else a 2024 sheet changes, and what happens to saved sheets when a campaign's edition changes.
8. **Maps:** party-shared sight, and light that dims (bright and dim look the same to players).
9. **Look:** which themes, layouts and options to keep once the players have used them.
10. **DM screen** (on hold; [docs/notes/dm-screen-ideas.md](docs/notes/dm-screen-ideas.md)): table screen, campaign desk, or both? DM rolls secret by default? Would the DM try an early version?
11. Is an explicit "session started" button needed, instead of matching notes to sessions by date (6am rollover)?
12. What exact format does the recorder produce, and are speakers labelled reliably per Discord user?
13. How well does the archivist hold up over dozens of sessions (record sprawl, pinned budget, consistency)? A late-uploaded earlier session is seen after later ones until a rebuild; acceptable?
14. Is Ask fast enough now ([docs/notes/ask-speed.md](docs/notes/ask-speed.md))?
15. Hosting: start the server with Windows too?

## Getting running on a new machine

1. Install **Node.js 22+** (developed on 24) and **Claude Code**, logged in with the host's Claude account (the server uses that login by default).
2. `git clone https://github.com/KAllen-Scripts/DNDApp.git`, then in the repo root: `npm install --ignore-scripts`, then `npm rebuild onnxruntime-node protobufjs`.
   - **Don't use a plain `npm install`** on a machine without Python and the C++ build tools (most Windows machines): it fails on `better-sqlite3` with `gyp ERR! find Python`. `better-sqlite3` ships prebuilt binaries and opts out of compiling with `gypfile: false`, but npm 11 loses that opt-out when the lockfile says `hasInstallScript: true` (arborist reloads the scripts but keeps the lockfile's package data), so it runs `node-gyp rebuild` anyway. The only other install scripts are `onnxruntime-node` (extra binaries on Linux only) and `protobufjs` (a version check).
   - Adding a package later: `npm install <pkg> --ignore-scripts`. Never `npm rebuild better-sqlite3`. npm 11's "not yet covered by allowScripts" warning is harmless.
   - In a cloud container also set `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`.
   - Check: `npm test`, then `npm start`.
3. **Data is not in git** (`data/` is ignored). To move a live setup, copy `data/archive/` (the source of truth): the server restores accounts (passwords keep working; everyone logs in again), campaigns, notes and the rest on start-up; then run a rebuild for the knowledge base. Copy `data/dndapp.sqlite` too to skip the rebuild.
4. First-time setup: `npm run admin -- init "Admin" "password"`, then `npm start`, open `http://127.0.0.1:4400`, log in as admin, create the campaign and accounts, set who's the DM. Database upgrades are automatic (`db/index.js`); accounts from before logins need `npm run admin -- set-password "<name>" "<password>"` (also the way to recover the admin password).
5. Optional `.env` (copy `.env.example`): provider, models and effort, limits, `DATA_SET`, `DISCORD_BOT_TOKEN` (optional: each campaign's DM can give their own bot key on the Sessions tab).

Dev environment: Windows 11, VS Code with the Claude Code extension, Git Bash and PowerShell. Git identity "Kenny Allen".

## Decisions (and why)

| Decision | Why |
|---|---|
| All JavaScript; npm packages welcome | Owner's requirement. |
| Clients are display-only; the host does all work | Owner's requirement. One exception: players' pages work out their map fog from the walls (2026-10-14: "high effort cheating just isn't that huge of a concern. It's just a game for mates"); the server still filters tokens. |
| Archive everything, everything else rebuildable | So the whole approach can be scrapped and regenerated. |
| Knowledge base + retrieval, not whole-history prompts; Q&A as a tool-using agent | 200 sessions won't fit any context window; the agent goes from records down to exact transcript lines only when needed. |
| SQLite + FTS5 + in-memory vectors; local embeddings (transformers.js) | One file, no native extension, free and offline; brute force is milliseconds at this scale. |
| Cloudflare Tunnel + cheap domain | No static IP or port forwarding, home IP hidden, players install nothing. Tailscale/SSH/port forwarding rejected (SPEC §3.4). |
| AI via Claude Code on the host's subscription (default); Opus for every task | Owner's call: a personal project for friends. API kept as a switch (`LLM_PROVIDER=api`); per-task model and effort are config. |
| **Don't change the Q&A model** without asking | Owner's call. Speed comes from fewer turns; 2026-10-28 he asked for `MODEL_QA_FAST` where the records already have the answer, `MODEL_QA` unchanged. |
| Processing speed doesn't matter | Owner's call. |
| Evidence derived from citations, not a tool; no warm Claude Code pool | Saves a model turn per question; a warm process saves only ~0.6 s. |
| **AI owns the knowledge base** (the archivist); no human-readable session notes | Owner's call: the database is for the AI; a player can ask for a recap. |
| Player notes private to their author (even the DM can't list them); notes link to transcripts by **date** (6am rollover) | Owner's call; the DM uploads transcripts with the date played. |
| The archivist decides who knows what; the server enforces it | Attendance from the speaker map + notes; `known_by` per record; tools filter. |
| Corrections in plain words, applied by the archivist, which asks the DM about conflicts | Owner's call. |
| Accounts archived (password hashes); logins not | Accounts and note ownership survive losing the database; logins are throwaway. |
| **Web page instead of Electron**, served by the server | Owner's call: Electron is overkill. Same origin, no CORS, relative URLs. |
| **Name + password logins set by the admin**; the admin login is management only (the admin plays through a separate account) | The AI tracks who knows what per account. No self sign-up. The admin login still passes DM checks in the API. |
| Deleting a campaign never deletes archive files; accounts with history can only be blocked | AGENTS.md: never touch `data/archive/` (a `deleted.json` marker stops restore); the archive refers to accounts by id. |
| Campaign and account names unique and space-cleaned | Pages collapse repeated spaces, so stored names must match what people see. |
| Forced password change enforced by the server | So the API can't skip it. |
| One `PUBLIC_URL` setting | Owner's call: one place to change the address. |
| **No database of the D&D books** | Owner's call (2026-10-06): plain PDFs in `DND books`, read into memory at start-up. |
| Q&A searches the books with terms the AI chooses (keyword, not embeddings); every full-way rules question checks the books | Owner's idea: players are vague, so the AI turns the question into the book's words. ~7 ms a search. The model's memory mixes 2014 and 2024 rules ("this really needs to work well"). |
| Spell sources: SRD, then the books, then the AI's memory | SRD exact and free; the AI a labelled last resort. |
| Character sheet: anything the player types into an automatic box is kept | Owner: "MUST be respected and preserved". ↺ or clearing the box goes back to automatic. |
| Sheet rules run in the page as well as the server (`shared/src/sheet.js`) | Automatic values update while typing; the server normalises what's saved. |
| Sheets private to their player, except what the DM needs at the table | The owner (2026-10-10): the DM sees equipped gear, AC, weight, attunements, merchant sales; hit points on map tokens. |
| Sheet saves carry a version; stale saves get 409 | A phone and a laptop can't silently overwrite each other. |
| **Maps imported by the DM or made in the creator, never premade; tokens placed by hand** | Owner's call (2026-10-07). |
| Map grids measured from the pixels, not the AI | The AI's square counts are approximate. |
| Players never see the AI's map description | It might describe something unrevealed. |
| **The server decides dice rolls; 3D dice land on them**; two rollers, Deluxe (default) and Classic | Owner's calls (2026-10-07, 2026-10-08). Fair, and can't be faked from the page. |
| **The DM has no character sheet** | Owner's call (2026-10-08); refused by the server, skipped by the archivist. |
| **Rests follow the campaign's edition; the DM calls long rests, players spend their own hit dice** | Claude's defaults on the owner's ask (2026-10-09); hit dice per die size. |
| **The DM's long rest doesn't recharge item charges** | Owner (2026-10-10): "A long rest might not always happen at night." Players press Recharge. |
| **Buying from a merchant pays from the sheet and fills its inventory** | Owner: players buy "without having to go through the DM"; one sheet save, so the archivist sees it. |
| **A rules edition per campaign** | Owner (2026-10-09/10). "Not chosen" keeps the old guess (`REST_RULES`, else the books' PHB, else 2014). The sheet's numbers follow it since 2026-10-22. |
| **A player character's token uses the sheet's hit points** | Owner (2026-10-10): "Link them". Each change is a sheet save with a reason. |
| Several characters per player: switching is the player's alone; the DM sees only the active one | Claude's call (2026-10-21), keeps inactive sheets private. |

## Parked, ruled out and on hold

Don't pursue these unless the owner raises them again.

| Idea | Status | Why, and what's known |
|---|---|---|
| **3D renders of imported maps** | Parked (2026-10-07) | Best option was an in-house tilted Three.js view (optionally Depth Anything V2 Small for relief). Generative services (Meshy, Tripo, World Labs) lose the grid; Dungeon Alchemist needs tracing; D&D Beyond Sigil shut down. Never add a paid 3D service without asking. |
| **Rewrite in C, C++ or C#** | Advised against (2026-10-08) | The page must stay JS; the server mostly waits on the AI. |
| **DM screen** (party panel, monster cards, encounter builder, prep brief…) | On hold (2026-10-07) | 16 ideas in [docs/notes/dm-screen-ideas.md](docs/notes/dm-screen-ideas.md); several built since in other forms. |
| **Ambient sound and weather on maps** | Left out (2026-10-08) | Item 8 of [docs/notes/vtt-feature-gaps.md](docs/notes/vtt-feature-gaps.md). Audio would have to be served by the server (CSP). |
| **Premade or stock maps; AI-placed pins** | Ruled out (2026-10-07) | |
| **Sessions from notes: "End session" button, attendance ticking, offline note caching** | Ruled out (2026-10-07) | His simpler design: [docs/notes/notes-only-sessions.md](docs/notes/notes-only-sessions.md). |
| **AI-generated pictures** | Not worth it (2026-10-13) | Would need another paid service. |
| **Quick, Lite, Flat and None dice rollers** | Removed (2026-10-08) | Only Deluxe and Classic kept. |
| **Bundling commercial asset packs in the repo** | Ruled out (licences) | Forgotten Adventures, 2-Minute Tabletop and Dungeondraft packs allow personal use only: read them from a folder on the host instead. |

## Gotchas and lessons

- **Players' fog drawn in the page failed on the owner's phone (2026-10-14), cause never found.** PR #45 (SVG mask) and #46 (canvas) both showed his phone no fog; the data was right (checked point for point) and stale files were ruled out, so it was the browser's drawing. Rolled back to server-drawn fog with faster sight maths (PR #47), then page-drawn fog put back for a retest with cleared browser data (PR #54); result not reported (docs/vscode-checks.md). jsdom stubs the canvas and headless Chromium drew both fine, so a passing suite says nothing about whether fog is visible. Next time get the device, browser and a console screenshot first, check on a real phone before merging, and keep a fallback (the server-drawn picture shows fog even if the overlay draws nothing).
- **Shared modules must stay in one flat folder** (`packages/shared/src`): the page loads them from `/shared/<file>`, so their imports of each other only work at that address. Moving them passes the jsdom tests (which resolve from disk) but breaks the real page.
- **Tests under load:** the default Deluxe dice load Three.js and then fail in jsdom, redrawing the dice settings after a page closed ("document is not defined"); `test/page.js` waits for `rollersLoaded()`. Wiki proposals needed a fixed order. Run a flaky test 16–32 times, 8–16 at once, before calling it fixed.
- **Windows:** sharp kept up to 20 pictures it read by path open, so Windows couldn't delete them (tests failed with EPERM); `images.js` sets `sharp.cache({ files: 0 })`. Archived transcripts are read-only (`chmod 0o444`); tests clean up with `fs.rmSync(..., { force: true })`. The Claude desktop app runs sessions in a job object, so a detached `node` child dies when the app closes or updates; `npm run restart` creates the server through WMI. Stopping `npm start` from a background task leaves `node` holding port 4400.
- **The page reloaded itself forever after a restart** (2026-10-28): cached pictures carried an old `X-Page-Version`; only `api()` and the live streams check it now. Cloudflare's Browser Cache TTL can keep an old .js for 4 hours.
- **Passwords given on the admin command line** end up in shell history.
- **Behind Cloudflare Tunnel the socket is always 127.0.0.1**; `TRUST_PROXY=loopback` believes `X-Forwarded-For`, so the login lockout sees real addresses.
- **Cloudflare API from scripts:** the token in `API_key` is account-owned: verify with `/accounts/<id>/tokens/verify`. Read the file in the script, never print it. A new zone's certificate takes minutes. Windows caches "domain doesn't exist" (`ipconfig /flushdns`).
- Unknown URLs return 401 (the login check runs before routing), not 404.
- **Web pages collapse repeated spaces**, so names shown can differ from what's stored unless cleaned (`cleanName`).
- **Privacy depends on the speaker map's `user_id` links.** Without them everyone is assumed present. The `dm` role can see note-derived knowledge (the archivist puts the DM in `known_by`).
- Q&A once cited a session 2 event as `[S1 …]`: citations are model-written, so evidence can show the wrong lines.
- **Claude Opus 5.5:** thinking can't be disabled, and forced `tool_choice` (`any`/`tool`) returns 400; the API provider uses `tool_choice: {type: 'none'}` plus a "research limit reached" message to force a final answer.
- **Structured output schemas** come from zod via `z.toJSONSchema()` (strip `$schema`). Keep all fields required; use `.nullable()` instead of optional.
- `llm.structured()`: sheets, maps, creatures, pictures, the wiki; `llm.research()`: Find online and a sheet review's web lookups; `llm.agent()`: the archivist, Q&A and the sheet review.
- **ESLint `no-undef` misses browser and Node globals:** when moving code, `crypto` and `status` (`window.status`) don't show as undefined but are the wrong thing. Import them by hand.
- **Book spell headings are OCR'd:** suggestions can be misspelled for non-SRD spells; Fireball's level line in the PHB scan is garbled, hence the loose level-line pattern in `books.js`.
- **Claude Code provider:** `result.usage` covers the main loop only; `total_cost_usd` is an estimate. Each call spawns a Claude Code process (~0.65 s with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`).
- **Testing:** `test/helpers.js` `setup()` (admin "Kenny", also the campaign's DM; players Sam/Thorin and Alex/Lyra, all logged in, a speaker map; `PASSWORD` for all), `createFakeLLM` (archivist runs drive the real tools via `defaultArchivist`; Q&A follows a script), `createFakeAnthropic`, `fakeEmbedder`. Jobs run async: `jobs.idle()` before asserting, `jobs.stop()` before closing the DB. Every page test fails if "null", "undefined" or "NaN" shows (`shownMissing`).
- **Shell editing:** long heredocs sometimes fail with "unexpected EOF", and multi-line `node -e` replacements with backticks and regexes broke several times; write a script file or edit files directly.
- **`npm install` without NuGet access** (a sandbox): `onnxruntime-node`'s install script fails; `--ignore-scripts` then `npm rebuild protobufjs` works. Older npm rewrites `package-lock.json` (drops `libc`); don't commit that.
- **Node version:** Node 16 fails at `npm start` with `Cannot find package 'fastify'`; the dependencies need 22+. After installing Node, restart VS Code. `winget install OpenJS.NodeJS.LTS` works.
- The owner's $100 usage credit (2026-10-08): the plan's 5-hour allowance is used first; credits only start at the limit, and only if switched on in claude.ai Settings > Usage.

## Change log

Newest first. Older entries: [docs/archive/changelog.md](docs/archive/changelog.md).

### 2026-11-05: Hosting on the owner's phone (Termux), in progress

- Galaxy A20e, Termux debug build, so `adb shell run-as com.termux` works. `CLAUDE_CODE_PATH` and `scripts/termux/install.sh` are new (PR #154); the setup is in docs/hosting.md.
- Done and checked: a clean install; `data/` and `data-example/` copied from the PC (checksums match), with the real data active; the server starting on them; embeddings on the real model through ONNX's WebAssembly build (0.74 s for 3 sentences, about 670 MB); `claude --version` in Debian through proot; `/sdcard/DND books` as `BOOKS_DIR`.
- Claude is logged in there: a real AI call with a tool through the server's provider worked (Haiku, 23.6 s, mostly slow start-up through proot). Remote Control is connected in tmux (`~/rc-start.sh`), not yet tried from a client.
- 2026-11-08: **the phone is the host**, meant to run with the PC off. The tunnel runs there; the PC's `cloudflared` service is stopped and set to Manual (don't start it while the phone's runs). `~/dndapp-watchdog.sh` restarts the server, the tunnel and Remote Control within a minute if one stops; `~/.termux/boot/start-dndapp` starts it at boot once the Termux:Boot app is installed (not yet). The public site answered from the phone.
- Found on the phone's real data: a sheet-updates job fails in `applyJson` (`sheets/store.js`, "Cannot set properties of undefined (setting 'on')"), called from `kb/updates.js` `sheetChanges`. Not looked into; likely on the PC's copy too.
- Left: merging PR #154; Termux:Boot. Not done: `whisper.cpp` on the phone (download and build blocked pending his OK), so no local transcription; Discord voice untried; no start after a reboot.
- Tests that read `.env`: `app.test.js`'s real-data login test fails with `DATA_SET=example` in the host's `.env`.

### 2026-11-02: Discord bot key per campaign
- The owner: "You've got the discord bot setup so we add the key in the server. But a DM may be in multiple servers. This should be set at the campaign level."
- Each campaign's DM pastes their own bot's key on the Sessions tab (Record from Discord); one bot runs per key (`startDiscordBots`), and `DISCORD_BOT_TOKEN` is now only the default. Keys are in `data/recordings/keys.json`, never archived or sent back. `PUT /campaigns/:cid/recordings/key`. docs/spec/recording.md.
- Tests: `server/test/recording.test.js` (a campaign's own key: never in a reply, the settings or the archive; two bots in one Discord server each answering for their own campaign; removing a key logs its bot out; a refused key says so), `web/test/recording.test.js` (setting and removing the key on the page).

### 2026-11-02: Docs compacted; agents read less
- The owner: token use was getting high; compact HANDOFF and SPEC (they repeated each other), archive the originals so they aren't read every time, and look for repeated work and oversized files in the code, without losing anything.
- `docs/archive/` holds HANDOFF and SPEC exactly as they were and the whole old change log (`changelog.md`); AGENTS.md says not to read it by default. SPEC.md is now the core (338 KB → about 80 KB): the version history went to the archive, and each feature's design moved, word for word apart from the owner's quotes in brackets, into `docs/spec/` (sheets, dice, maps, map-combat, world, map-creator, creatures-items, table, wiki, recording, page), with an index in SPEC §6. HANDOFF (442 KB → about 35 KB) keeps the current state, next steps, questions, decisions and lessons; the VS Code checks moved to `docs/vscode-checks.md`. Stale lines fixed on the way (routes list, schema v21, `wiki_boards`, players' Wiki tab, the Cloudflare Tunnel done).
- Code reviewed for repeated work with jscpd (packages/, tests left out): 0.05% of lines are copies at 12+ lines, 0.7% at 5+. The only real copies were two hand-written `readBase64`s (`sheet/sheet.js`, `map/dm-tools.js`), now `page/dom.js`'s. Left as they are: the 5-line `str`/`int`/`newId` cleaners repeated in six `shared/src` files (sharing them needs a new `/shared/` module in `app.js`'s list for very little), and look-alike blocks that differ in what they do. AGENTS.md now says how to read code cheaply (grep, then a line range).
- Big files that would be worth splitting later (each read whole costs 25–30k tokens): `web/public/map/map.js` (2,370 lines), `shared/src/map.js` (2,340: geometry, sight, heights, the world and travel), `web/public/sheet/sheet.js` (2,250), `server/src/routes/maps.js` (1,530, one `registerMaps` function), `styles/style.css` (2,810). Not split now: grep and line ranges get most of the saving, and each split risks breaking imports the page loads by address.

### 2026-10-30: Pick who to log in as on the example data
With `DATA_SET=example` the login page shows a "Log in as" list of every unblocked account in place of the name and password (`page/pick-login.js`; `GET/POST /login/pick` in `routes/accounts.js`, `auth.pickableAccounts` / `auth.loginWithoutPassword`). On the real data the list is empty and `POST /login/pick` is a 404. Tests in server `security.test.js`, web `app.test.js`.

### 2026-10-29: The code tidied into feature folders (PRs #147–#150)
The web page's files are in folders by part (`page/`, `styles/`, `admin/`, `campaign/`, `sheet/`, `items/`, `creatures/`, `dice/`, `map/` + `map/creator/`, `wiki/` + `wiki/views/`), the element helpers (`h`, `setChildren`, `note`, `readBase64`, `$`, `cap`, `svg`) in `page/dom.js`; the server's loose files in `wiki/`, `creatures/`, `items/`, `table/`, `maps/`, `sheets/`, `kb/`, `llm/`. `packages/shared/src` stays flat (Gotchas). No behaviour change. SPEC §3.1.

### 2026-10-29: A short README
README.md is a one-screen overview; the rest moved word for word into `docs/hosting.md`, `features.md`, `api.md`, `testing.md`. New API routes go in `docs/api.md`.

### 2026-10-29: Recording sessions from Discord
The server's bot (`src/recording/`, discord.js 14.27, `@discordjs/voice` 0.19.2 for Discord's end-to-end encryption) records each voice as Ogg Opus clips and transcribes them on the host's PC (`local` Whisper large-v3-turbo through transformers.js, or `whisper-cpp`); the Sessions tab's Record from Discord, Use for upload. Settings gained `discord`. Tests: `server/test/recording.test.js` (fake Discord, fake engine), `web/test/recording.test.js`. docs/spec/recording.md.

### 2026-10-29: The DM's own attacks, spells and effects; NPCs cast their stat block's spells
`creatureSpellList` / `creatureSpells` (`shared/src/attacks.js`) read Spellcasting traits; `customAction` / `customDamage` and `CUSTOM` in `routes/attacks.js` for the DM's own (any token or none, several targets, conditions, lasting effects). Page: **Effect** and **Something else…** (`map/attacks.js` `customForm`). Tests in server and shared `attacks.test.js`, web `map-attacks.test.js`. docs/spec/map-combat.md.

### 2026-10-29: Spells that aren't attacks, on the map
`shared/src/spell-effects.js` (conditions from a spell's text, lasting spells, difficult areas, targets; spells in play, ending, concentration, privacy); `POST …/attack` with several or no targets; `POST …/spells/:sid` (end, again, break). Research: `docs/notes/map-spells-research.md`. Tests: shared `spell-effects.test.js`, server `spells.test.js`, web `map-attacks.test.js`.

### 2026-10-29: The top bar keeps to one row in every theme
`page/topbar-fit.js` steps down while the bar would wrap: icons only, tighter tabs, tabs on two lines. Regression test in `web/test/layout.test.js`.

### 2026-10-29: A shorter character sheet
`sheet/fold.js` folds (remembered while the page is open): Wild Shape forms, adding a companion or a spell, spell levels with no slots; class feature texts one line until clicked. Test in `web/test/sheet.test.js`.

### 2026-10-28: Items and Merchants move into the wiki; the Bestiary
Items and Merchants are views on the wiki space's rail (`wiki/panels.js` moves the tabs' pages in and back). The Creatures tab is the **Bestiary** (`shared/src/bestiary.js`: `group` creature | person, types, challenge), `PIPELINE_VERSION` 39. Tests: `merchants.test.js`, creatures tests.

### 2026-10-28: Level up; casting from the sheet spends slots; Ask's faster model
`shared/src/level-up.js`, `routes/level-up.js` (`level_up` setting: player | dm), `sheet/level-up.js`, `campaign/levels.js`. `shared/src/spell-slots.js` and `POST /sheet/spells/cast`. `qa/route.js` `pickModel` and `MODEL_QA_FAST`. Tests: `level-up.test.js` (shared, server, web), `ask-models.test.js`.

### 2026-10-28: Example data; the DM uploads transcripts; restart scripts; separation checked
`DATA_SET=example` runs on `data-example/`, seeded from `example/` (no AI, nothing from play; `server/test/example.test.js`); four transcripts and `example/ask-checks.md`. The DM's Sessions tab replaces the admin screen's uploads (`GET /campaigns/:cid/sessions/overview`), for the campaign the DM is in. `scripts/restart-server.js` start | stop | restart (WMI on Windows). Every route checked for campaign separation; `PUT /speakers` now refuses accounts from other campaigns (regression test). The VS Code checks' first pass in Chrome fixed six page bugs (each with a regression test).
