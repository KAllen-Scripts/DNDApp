# DNDApp — Handoff and Change Log

Read this first when picking the project up on another machine or with another AI. It records what has been built, why, what's been verified, where work stopped, and what to do next. [SPEC.md](SPEC.md) is the design; [README.md](README.md) is setup and the API.

**Keep this file current.** Add a dated entry to the change log for every meaningful change, and update "Current state" and "Next steps".

**Who's who:** Kenny is the project owner and hosts the server on his machine (and his Claude subscription powers the AI). He is **not** the DM. The DM is someone else in the group, and the DM's role and permissions will be designed later. "Owner's call" below means Kenny decided.

---

## Current state (2026-10-10)

Rewritten (not appended to) on 2026-10-08 after a housekeeping audit, and kept current since. Everything below is on `main` unless it says a PR is open.

**What's built** (SPEC has the design of each; §6.1 is the list):
- **Server, end to end with real AI calls:** player notes → transcript upload (with date) → attendance → the **archivist** (an AI with full authority over the knowledge base) → per-player Q&A with privacy. Verified with a realistic two-session privacy scenario through Claude Code. Between sessions the archivist also reads character sheets (in full, then each change with its time), late note changes, handouts, and (with each session) what happened on the maps.
- **Web page** (no Electron; served by the server at `/`): name + password logins set by the admin (who can force a password change), several campaigns per account, Ask (streamed answers, citations with transcript evidence, chats you can pin, rename, delete), Notes (edit and delete keep versions), and an admin screen (accounts, campaigns, roles, session uploads with speaker linking).
- **Q&A** answers campaign questions from the sources and general D&D questions from the model's own knowledge, except that with book PDFs in `DND books` (no database) every rules question is looked up in them, using the edition of the group's Player's Handbook (checked on the owner's real PHB 2014 and DMG 2024 scans, 2026-10-08).
- **Character sheets** (players only): laid out like the 5e sheet, automatic values the player can override (always kept), autosave with version checks, AI upload of existing sheets, spell lookup (SRD, then the books, then the AI), a token picture and a private full picture the AI describes. Can sit beside the map or open in its own window.
- **Dice:** the server rolls, 3D dice land on its numbers; two rollers, **Deluxe (default)** and Classic; 23 styles plus "Match the page", special effects; rolls shared live with the party, only the DM, or only yourself.
- **Rolling from the sheet** (PR #21, merged 2026-10-09; the owner asked for it): saves, skills, ability checks, initiative, death saves, and attacks and spells, each with a roll to hit (or a DC for saves) and a damage roll that add the sheet's modifiers: attack bonuses worked out from the ability, proficiency and a magic bonus; spells read from their description (attack or save, damage or healing, more when cast higher or at cantrip levels). Everything goes through the dice and shared rolls. Initiative from the sheet, or the player's Roll in the map's turn order, goes into a fight waiting for their character. Advantage and disadvantage from the sheet bar for phones.
- **Inventory** (PR #21, merged 2026-10-09; the owner asked for it): a players' **Inventory** tab where any item is looked up by name (PHB weapons and armour from tables, no AI; anything else from the books or the AI, never the DM's own items) and equipped: several of a weapon (two daggers), one armour and one shield. Proficient is ticked from the class and the player can change it. Equipped weapons appear in Attacks with to hit and damage worked out; armour sets the AC. Items bought from merchants land in the inventory. The DM's Items tab shows what each player has equipped, with their AC, weight carried and attunements (SPEC §6.4, §6.9). Also: weights and the campaign's weight rule, charges, at most three attunements, magic items changing the sheet (AC, saves, scores, speed, spell attack and DC), heavy armour's Strength and Stealth rules, and disadvantage applied to sheet rolls.
- **Sheet fixes** (2026-10-10, PR open, the owner asked): typed attacks can't use a PHB weapon the character doesn't carry (unarmed strikes, spells and features still can; old attacks stay but don't roll, with a button to put the weapon in the Inventory); the Inventory is shown under headings by kind; **Make my own** adds a spell of the player's own with no lookup (SPEC §6.4).
- **Campaign settings** (PR #21, merged 2026-10-09): the DM's **Settings** button; one setting so far, weight limits (carrying capacity, variant encumbrance, or ignore), stored per campaign, archived and sent live (SPEC §6.10). The rules edition setting should go here next.
- **Maps:** the DM imports any map (or a PDF page); the AI reads kind, name, grid and scale, and the server measures the grid; tokens for characters, NPCs and enemies (with pictures), moved live; fog of war, walls, doors and line of sight (drawn or AI-drafted), darkness, lights and darkvision, hit points and conditions, hidden tokens, AI stat blocks, NPCs from the records, private pins, Measure, spell templates, initiative, pings and sketches, waypoints and difficult terrain, other pictures of a map, links between maps.
- **Walls and doors** (PR #17, merged 2026-10-08): doors drawn as doors and locked or unlocked with a click; Curve and Circle tools; a Walls tick box hides walls while playing; a thorough AI wall draft (a ruler on the map, a checking pass, close-ups on big maps, arcs and circles, max effort on its own `walls` task, straight walls put on the grid); exact walls, doors and lights from `.dd2vtt`/`.uvtt` files.
- **Rests and hit dice** (PR #22, merged 2026-10-09): the sheet's Hit dice box has a row per die size; **Spend** has the server roll the die plus Con (shared like any roll) and heal; **Short rest** gives back Pact Magic. The DM's **Rest** button calls a short or long rest for everyone or chosen players, by the group's edition (2014 unless their PHB is 2024, or `REST_RULES`; the owner wants this as a per-campaign setting, next steps); sheets change and players hear it live. Rests are archived (`rests.jsonl`) and counted (`rests.count`, `rests.events`), the hook for merchants restocking every N long rests (SPEC §6.8).
- **The DM:** a **Creatures** tab instead of a character sheet (saved enemies and NPCs placed on maps, several at a time; "Find online" has the AI find one on the web with a picture; stat blocks shown formatted, with "Edit text" for the Markdown; stat blocks come from the DM's own creatures first, then the group's books, then the AI's memory; Find online checks the books before the web; Ask puts the DM's creatures first when the DM asks), an **Archivist** tab (answer the archivist's questions, send corrections), **Handouts** for everyone or chosen players. The DM has no sheet at all: no Sheet tab or window, and the server refuses it.
- **Merchants and items** (PR #23, merged 2026-10-09): the DM's **Items** tab (made by hand, looked up in their own items, then the books, then the AI, or found online with a picture) and **Merchants** tab (stock with prices, how many are left and a restock level; restock every N long rests or by hand; recent sales). A merchant goes on a map as a token with a gold badge; players pick it, press Shop and buy on their own: the coins come off their sheet (with change) and the item goes into its inventory (since PR #21; the equipment text before). Each long rest the DM calls counts towards restocking. SPEC §6.9.
- **Full screen map** (PR #25, merged 2026-10-09): a Full screen button on the map toolbar; the map fills the screen and its tools float over it, see-through (0.55) until pointed at or focused; tools that are on stay solid. Only the main ones (Fit, Measure, Ping, Draw, Template, Initiative, Exit) show; More shows the rest. The DM's **Edit** button (same PR) shows or hides their set-up tools (Walls, Add token, Fog & walls, Map settings, Import map), kept per browser. Falls back to filling the window where the browser can't go full screen (iPhone). SPEC §6.6.
- **Look:** 12 themes, 4 page layouts, chat and sheet styles and layouts, plus tab order, the map toolbar's place, which panel goes beside the map, token names and an accent colour. All per browser. The owner hasn't decided which to keep (don't prune yet).
- **Security:** audited 2026-10-07 (headers, strict CSP: scripts only from the server, body limits, login limits, live streams that end with access). Hosting must go through Cloudflare Tunnel with `HOST=127.0.0.1`.

**Numbers:** schema **v15**, `PIPELINE_VERSION` **13**, **374 tests** passing (`npm test`: server 161, shared 73, web 140). Tests are offline and free: a fake AI, where the fake archivist calls the real knowledge-base tools; the page is tested in jsdom against a real test server (`packages/web/test/page.js`). Headless Chromium is only needed for what jsdom can't show (real layout, WebGL dice, touch). There's no CI: `npm test` is the check.

**Git:** `main` has PRs #1–#25 merged (#16: housekeeping; #17: walls and doors; #18: book lookups; #20: stat blocks from your creatures and books first; #21: rolling from the sheet, the Inventory tab and campaign settings; #22: rests and hit dice; #23: merchants and items, which brought #22 in with it; #24: the ruleset note in SPEC; #25: full screen map and the DM's edit mode). Open: the sheet fixes on `claude/project-thread-0b5uzi` (attacks need the weapon, Inventory by kind, spells of your own); other threads have their own PRs from the owner's 2026-10-10 list. Merges to `main` need the owner's OK.

**Installs:**
- **Owner's PC** (the server): `data/` holds the admin login ("admin") and a player account for Kenny. The database upgrades itself (to v13 with rests, v14 with merchants, v15 with campaign settings) on the next start. Start with `npm start`, open http://127.0.0.1:4400. `.env` is in the repo root (copy of `.env.example`).
- **Owner's laptop** (2026-10-07): Node 24.19, installed with the `--ignore-scripts` workaround; `data/` has only the admin login.

**Not set up yet:** the domain (`PUBLIC_URL` is the placeholder `https://dnd.example.xyz`) and Cloudflare Tunnel. **No real transcript** has been tried; the parser is built to an assumed format.

**Real AI not yet tried on:** real maps (reading, walls, lights, terrain, stat blocks), Find online, character picture descriptions, sheets reaching the archivist, map events reaching the archivist, the book tools with all the books. Most page features have only been seen in jsdom or headless Chromium, not on a real phone or GPU.

## Next steps

0. **Sheet fixes (PR open): review and merge**, then try them: type "Longsword" as an attack with no longsword (marked, no roll, not saved), press Add a Longsword to my Inventory; check an older sheet with typed weapon attacks still saves; look at the Inventory's headings on a phone; add a homebrew spell with Make my own. Not built: recognising homebrew weapon names in attacks (only PHB weapons are checked).

0. **Full screen map and the DM's edit mode (merged): try them for real** in Chrome, Firefox and on a phone (an iPhone only fills the window): check the see-through tools read well over a dark and a light map, and that the turn order and a picked token's bar sit clear of the toolbars in each toolbar place.

0. **Rolling from the sheet and the Inventory (PR #21, merged): try it at the table:** a short fight where players roll initiative from their sheets, weapons from the Inventory (add a Longsword and two daggers, equip them, check the to-hit and damage in Attacks; put on chain mail and a shield and check the AC; look up a magic item through the AI), the DM's "What the players have equipped" list, Fireball cast higher, Cure Wounds, and Adv./Disadv. on a phone. Check the attack rows' and Inventory rows' layout in the narrow and tabbed sheet layouts and on a phone (only seen in jsdom). Sheets saved before keep their attacks and equipment text; players move weapons into the Inventory themselves. Also try: the DM's Settings (weight limits) with a player's page open, a wand's charges and Recharge, attuning a fourth item, Gauntlets of Ogre Power and a Ring of Protection looked up through the AI (check their effects were read). Not built: items recharging by themselves at dawn or on the DM's long rest; magic item effects beyond the listed ones (resistances, spells, flying stay in the description). Not handled: Magic Missile's extra darts, Scorching Ray's rays and Eldritch Blast's beams (typed in by the player); hit dice (the rests work).
0. **Rules edition per campaign (owner, 2026-10-09: "We WILL want to have a setting to toggle this, per campaign").** Add a 2014/2024 setting the DM picks for each campaign (stored on the campaign, archived with it) and use it everywhere an edition matters: rests (`rests.js`, now `REST_RULES` or the PHB guess), Q&A's rules lookups (`groupEdition`), stat blocks and items from the books. Keep the PHB guess only as the default for a new campaign. Not built yet; it belongs in the campaign settings (`shared/src/settings.js`, `campaign_settings`, the DM's Settings dialog), which exist since PR #21.

0. **Merchants and items (merged): try them for real.** Set up a shop with a few looked-up items (one from the PHB, one from the AI, one found online), put it on a map, buy as a player on a phone and check the sheet's coins and equipment.

0. **Walls and doors (merged): try them for real:** have the real AI draft walls on a gridded dungeon, a map with a round tower or cave, and a big map (over 1800 px, so close-ups are used); see what still needs fixing and how long and how much a draft costs at max effort (2 to 10 calls). Import a `.dd2vtt` from Dungeondraft or a map pack. Check the door badge size at normal zoom. If drafts are still off on clean maps, the next step is snapping walls to the dark lines in the picture (option 4 in `/mnt/project-files/walls-doors/ai-walls-options.md`).

1. **Rests (merged): try with the group:** a player spends hit dice and takes a short rest from the sheet; the DM calls a long rest from the Rest button (check the 0 hit points rule and the hit dice coming back). Check which edition the Rest dialog says: it follows the PHB in the books folder. The merchants work hooks into `rests.count` / `rests.events` (SPEC §6.8). Not built: class features that recharge on a rest (Second Wind, Arcane Recovery, Channel Divinity) and exhaustion, since the sheet doesn't track them; map token HP isn't synced with sheets.
2. **Books folder (owner):** rename `Players Handbook 5th Edition DD.pdf` to `Player's Handbook (2014).pdf` so answers cite a clean title (the DMG's long download name is trimmed automatically). The 2014 DMG is an EPUB, which isn't read. The server warns at start-up about a PDF with no text layer or unreadable page numbers.
3. **Try things for real** (the owner, with the group; each line is one feature that has only been tested offline):
   - **Real transcript:** upload one from the recorder on the admin screen (check the speaker preview; if names come out wrong, adapt `packages/shared/src/transcript.js`), link speakers to accounts, process, then look at the knowledge base (`GET /campaigns/:cid/kb`) and the archivist's questions. Time the archivist and Q&A.
   - **Ask in the browser with the real AI:** a general question ("stat block for a brown bear"), a campaign one, and vague and exact rules questions against the books: check it reads the right page, cites the printed page, and keeps to the 2014 rules. It now checks the books on every rules question; time it, and if that's too slow, the old rule (books only when the wording matters) is one prompt line.
   - **Maps with the real AI:** import a battle map, a town and a PDF page; check kind, name, scale and the measured grid (faint grids may not be measured: `detectGrid` in `maps/read.js`); have it draft walls on a map with braziers and water (lights, difficult terrain); check a few AI stat blocks against the Monster Manual.
   - **A short fight, DM and player windows, on a phone too:** fog, line of sight, Darkness with a torch and darkvision, doors, initiative, a Fireball template, pings, waypoints, a night variant, stairs to another map.
   - **The DM's creatures and Find online:** make a few (one filled by the AI), place a group of goblins, save a token back; search for an official monster, a homebrew one and one from another game (how often does a picture come back?). With the Monster Manual in `DND books`: check that "Stat block (AI)" and Find online say "From your books" with the right page, and that the stat block matches the page (stat blocks are found by their "Small humanoid…" and "Armor Class" lines; a scan whose layout differs may not be found, see `findCreature` in `sheets/books.js`). As the DM, ask Ask about a saved creature whose stats differ from the book and check it answers with the DM's version.
   - **Character sheets and pictures:** a real D&D Beyond PDF and a phone photo; a real portrait (check the description and the token crop); the sheet beside the map and in its own window, on a phone.
   - **Archivist between sessions:** fill in a sheet with real Claude Code running, wait 10 minutes, check what the archivist made of it; again after a level-up. Process a session played with a map and check it used `<map_events>`.
   - **Dice:** Deluxe and Classic on a real GPU and a phone (Safari and Firefox untested). Deluxe is the default now; the owner can change it with `DICE_ROLLER`.
   - **Look:** show the players; see which themes, layouts and layout options they use, then prune (owner's call).
4. **Decisions waiting on the owner** (SPEC §9): the DM role (what the DM sees, including note- and sheet-derived knowledge through Q&A, currently yes); should the DM see players' sheets, and should Q&A read the asker's sheet; should rolls go into the archive; should the archivist see handout pictures; party-shared sight and dimming light ranges.
5. **Later, planned:** a ready-made creature library from the books once they're all scanned (SPEC §6.6); glossary and speaker-map editing on the page; session notes design (`/mnt/project-files/notes-sessions/notes-only-sessions.md` in the project files).
6. **Hosting:** buy the domain, set `PUBLIC_URL`, set up Cloudflare Tunnel, write a short player guide. Check whether Claude Code's WebFetch (Find online) can reach addresses on the home network before opening it up (SPEC §3.5).
7. **Install workaround (owner's call):** keep typing `npm install --ignore-scripts`, or add `ignore-scripts=true` to a project `.npmrc`. Revisit when npm fixes the `gypfile` bug or `better-sqlite3` changes how it ships binaries.

When you change the web page, add or update a test in `packages/web/test/` (README "Tests"). Not covered by page tests: the dice effects' visuals (`dice-fx.js`) and some admin-sessions polling paths.


## Getting running on a new machine

1. Install **Node.js 22+** (developed on 24.21) and **Claude Code**, and log in to Claude Code with the host's Claude account. The server uses that login by default.
2. `git clone https://github.com/KAllen-Scripts/DNDApp.git`, then in the repo root: `npm install --ignore-scripts`, then `npm rebuild onnxruntime-node protobufjs`.
   - **Don't use a plain `npm install`** on a machine without Python and the C++ build tools (most Windows machines). It fails on `better-sqlite3` with `gyp ERR! find Python`. `better-sqlite3` 13 ships prebuilt binaries in the package (`prebuilds/win32-x64.node` etc.) and opts out of compiling with `gypfile: false`, but npm 11 loses that opt-out when the lockfile says `hasInstallScript: true` (arborist `rebuild.js` reloads the scripts but keeps the lockfile's package data, which has no `gypfile`), so it runs `node-gyp rebuild` anyway. Installing with `--ignore-scripts` skips that. The only other install scripts are `onnxruntime-node` (downloads extra binaries on Linux only; Windows x64 ones are bundled) and `protobufjs` (a version check), so the rebuild line is a formality on Windows.
   - The same applies to adding a package later: `npm install <pkg> --ignore-scripts`. Never `npm rebuild better-sqlite3`.
   - npm 11 may warn that install scripts are "not yet covered by allowScripts". Harmless.
   - Check it worked: `npm test`, then `npm start`.
3. **Data is not in git** (`data/` is ignored). To move a live setup, copy `data/archive/` (the source of truth). With only the archive, the server restores accounts (passwords keep working; everyone logs in again), campaigns, notes and corrections on start-up; then run a rebuild to regenerate the knowledge base. Copy `data/dndapp.sqlite` too to skip the rebuild.
4. First-time setup: `npm run admin -- init "Admin" "password"` (creates the admin login only), then `npm start`, open `http://127.0.0.1:4400` and log in as admin. On the admin screen: create the campaign, the accounts (including Kenny's own player account), and set who's the DM.
   - **Database upgrades are automatic** on start-up (`db/index.js`). From before logins (schema v2): accounts keep their ids but have no password; set one for each with `npm run admin -- set-password "<name>" "<password>"` (the server warns on start-up about accounts without one). v3 → v4 just adds `must_change_password` (off).
   - Lost the admin password? `npm run admin -- set-password "admin" "<new password>"`.
5. Optional `.env` (copy `.env.example`): provider, models/effort, limits.

Dev environment so far: Windows 11, VS Code with the Claude Code extension, Git Bash and PowerShell. The git identity is "Kenny Allen".

## Architecture in one paragraph

npm workspaces: `packages/shared` (plain JS both sides use: transcript parser, citation format, sheet rules, dice notation, map geometry), `packages/server` (Fastify + better-sqlite3; `app.js` is the HTTP plumbing and the API is split by part of the app in `src/routes/`), and `packages/web` (the static page the server serves at `/`; the Map tab is `map.js` plus `map-state.js`, `map-dm.js`, `map-combat.js`, `map-templates.js`).

- **Source data** (accounts, transcripts, player notes, speaker map, glossary, corrections) is written to the **archive** (plain files under `data/archive/`) first, then the DB. Player notes are indexed immediately, visible only to their author.
- **Uploading a transcript** (with its date) queues a job: parse → speaker map + glossary → **attendance** → chunk + index (visible to attendees) → **archivist** run → snapshot to the archive.
- **The archivist** (`src/kb/archivist.js`) is an AI with full read/write tools over `kb_records`. It designs its own record kinds and a guide, keeps state (debts, quests, etc.), and sets `known_by` on each record.
- **DM corrections**, and answers to the archivist's questions, run as `correct` jobs.
- **Q&A** (`src/qa/`) pre-searches, then runs a read-only agent whose tools filter everything to what the asker may know.
- **All AI calls** go through `src/llm/` (`structured`, `agent`, `research`): the **Claude Code** provider (default; the host's subscription, locked down, with web search allowed only for Find online) or the **Anthropic API**.
- **Pictures** (maps, tokens, characters, creatures, handouts) are checked and cut to size in one place, `src/images.js`.

Details are in SPEC §3–5.

## Decisions (and why)

| Decision | Why |
|---|---|
| All JavaScript; npm packages welcome | Owner's requirement. |
| Clients are display-only; the host does all work | Owner's requirement. Keeps credentials and data on one machine. |
| Archive everything, everything else rebuildable | So the whole approach can be scrapped and regenerated if it turns out badly. |
| Knowledge base + retrieval, not whole-history prompts | Transcripts for 200 sessions won't fit in any context window. |
| Q&A as a tool-using agent | Lets the model go from the knowledge base down to exact transcript lines only when needed. |
| SQLite + FTS5 + in-memory vectors (no sqlite-vec) | One file, no native extension. Brute force is milliseconds at this scale. |
| Local embeddings (transformers.js) | Free, offline, all JS. |
| Cloudflare Tunnel + cheap domain | No static IP or port forwarding, home IP hidden, players install nothing extra. Tailscale/SSH/port forwarding rejected (SPEC §3.4). |
| AI via Claude Code on the host's subscription (default) | Owner's call: personal project for friends, not sold. API kept as a switch (`LLM_PROVIDER=api`). |
| Claude Opus 5.5 for every task | Default choice; per-task model and effort are config. |
| **Don't change the Q&A model** for speed | Owner's call. Speed comes from fewer turns instead. |
| Processing speed doesn't matter | Owner's call. Processing effort may be raised later. |
| Evidence derived from citations, not a tool | Saved a whole model turn per question. |
| No warm Claude Code process pool | Measured: saves only ~0.6s of a 4–6s answer. |
| **AI owns the knowledge base** (the archivist), replacing fixed notes, entity pages and summaries | Owner's call: the database is for the AI, not humans, so the AI should organise it as it needs. |
| No human-readable session notes | The app's core is questions + note-taking; a player can ask for a recap. |
| Player notes are private to their author (even the DM can't list them) | Owner's call. Primitive privacy for now; more later. |
| Notes link to transcripts by **date** (6am rollover) | The DM uploads transcripts with the date played. |
| The archivist decides who knows what; the server enforces it | Attendance comes from the speaker map + notes; `known_by` per record; Q&A tools filter. |
| Corrections in plain words, applied by the archivist; the archivist asks the DM about conflicts | Owner's call. |
| Accounts archived (password hashes) | So accounts and note ownership survive losing the database. |
| **Web page instead of Electron** | Owner's call: Electron is overkill; there's already a server and an address. Served by the server itself (same origin, no CORS, relative URLs). |
| **Name + password logins, set by the admin** | Owner's call: the AI tracks who knows what per account, so each player must be clearly identified. No self sign-up. Account management is admin-only (not the DM role). |
| **Admin login is management only; the admin plays via a separate player account** | Owner's call ("let's not complicate it"). Keeps one simple rule: privacy is per account, and the admin login is in no campaign. (The admin login still passes DM checks in the API; that's how the admin screen uploads transcripts.) |
| Deleting a campaign never deletes archive files | AGENTS.md rule: never modify or delete `data/archive/`. A `deleted.json` marker stops restore from bringing it back; recovery is by hand. |
| Accounts with history can't be deleted, only blocked | The archive (notes, attendance, speaker map, `known_by`) refers to accounts by id. |
| Campaign and account names unique and space-cleaned | Players pick campaigns by name; web pages collapse repeated spaces, so stored names must match what people see (found when deleting "test  camp" failed). |
| Forced password change enforced by the server, not the page | So it can't be skipped by calling the API directly. |
| One `PUBLIC_URL` setting | Owner's call: the address should be easy to change in one place. |
| Logins not archived | They're throwaway; after a database loss people just log in again. |
| **No database of the D&D books** | Owner's call (2026-10-06): the books are plain files in `DND books` (next to the repo). The server reads PDF text into memory at start-up and finds a spell by its heading when asked. |
| Character sheet: anything the player types into an automatic box is kept | Owner's requirement ("MUST be respected and preserved"). Even a typed value equal to the automatic one is kept, so later rule changes never move it; ↺ or clearing the box goes back to automatic. Only an upload's printed numbers that match the rules are left automatic (the player didn't type those here). |
| Sheet rules run in the page as well as the server | So automatic values update while typing. Same file (`shared/src/sheet.js`); the server normalises what's saved. The one exception to "clients don't process". |
| Q&A searches the books with terms the AI chooses; keyword search, not embeddings | Owner's idea: players are vague, so the AI turns the question into the book's words (plus synonyms) and searches again or browses the contents if needed. Rules questions use exact terms, so keyword search is enough and needs no stored index; a search over a 400-page book takes ~7ms. Since 2026-10-08 (owner: "this really needs to work well") every rules question is checked in the books when there are any, because the model's memory mixes the 2014 and 2024 rules; it costs a turn (a few seconds). |
| Spell sources: SRD, then the books, then the AI's memory | SRD is exact and free; the books cover the group's other spells (the AI only tidies OCR); the AI is a labelled last resort. Details are replaced only when the player asks. |
| Sheets private to their player | Same rule as notes. DM access is part of the deferred DM role. |
| Sheet saves carry a version; stale saves get 409 | So a phone and a laptop can't silently overwrite each other. |
| **Maps are imported by the DM, never premade; the AI reads them; tokens are placed by hand** | Owner's call (2026-10-07): "the map itself just needs to be the terrain", maps can be "used for anything", and players move their own tokens. |
| Map grids measured from the pixels, not taken from the AI | The AI's square counts are approximate; edge strength per column/row and the repeat distance near the AI's estimate gives the exact size and offset (tested on synthetic maps). |
| Players never see the AI's map description | It might describe something the DM hasn't revealed (a trapdoor). |
| `sharp` for images | Already installed (a dependency of the embedding library), with prebuilt binaries for Windows; resizes maps for the AI and reads pixels for the grid. |
| **Two dice rollers: Deluxe (default) and Classic** | Owner's call (2026-10-08): "just keep the classic and deluxe 3D dice, scrap the rest". Quick, Lite, Flat and None were removed. Deluxe as the default was picked by Claude (the fancier one; the owner can switch with `DICE_ROLLER`). |
| **The DM has no character sheet** | Owner's call (2026-10-08, with the Creatures tab); the audit found it was only hidden, so it's now refused by the server and skipped by the archivist. A DM sheet saved before stays in the archive. |
| Server routes split by part of the app (`src/routes/`) | Housekeeping (owner's OK, 2026-10-08): `app.js` had reached 2,468 lines. No behaviour change. |
| **Rests follow the group's edition; the DM calls long rests, players spend their own hit dice** | Owner asked for rests and hit dice (2026-10-09); the defaults were Claude's: 2014 rules unless the PHB in the books is 2024 (`REST_RULES` to force), the DM calls party rests so nobody long-rests mid-dungeon, hit dice rolled by the server through the roll log. Hit dice kept per die size for multiclass characters. |
| **The server decides dice rolls; the 3D dice are animated to land on them** | Owner's call (2026-10-07): fine as long as it looks the same to the player. D&D Beyond lets the browser's physics decide; server rolls are evenly random and can't be faked from the page, which matters once rolls are shared. The library really throws the dice, then relabels faces. |
| **Buying from a merchant pays from the sheet and fills its equipment automatically** | Owner (2026-10-09): players buy "on their own, without having to go through the DM". Picked by Claude: the server takes the coins (with change) and adds the item to the equipment text as one sheet save, so the sheet's history and the archivist see it. |

## Change log

### 2026-10-03: Project start, spec

- Cloned the empty GitHub repo. Wrote `SPEC.md` v0.1 (architecture, layered memory, Q&A, milestones).
- v0.2: thin clients, archive-first with rebuild, Q&A agent that searches in stages. Pushed (`3c12825`).
- Networking discussion: chose Cloudflare Tunnel with a cheap (numbers-only `.xyz`) domain.

### 2026-10-03: Server built (milestones 1–4)

- npm workspaces; `packages/shared` transcript parser (+ tests).
- Server: config, SQLite schema, archive, store (archive-first writes, restore from archive), token auth with DM/player roles, job queue, hybrid search, local embeddings, ingestion pipeline, DM edits that survive rebuilds, Q&A agent, all HTTP routes, `admin` and `rebuild` CLIs.
- Initially used the Anthropic API directly.
- `README.md`, `.env.example`, tests with a fake AI.
- Live smoke test: server, auth, upload and the real embedding model all worked. AI calls failed only because there was no API key.

### 2026-10-03: Switched to Claude Code (subscription) as the default provider

- Added `@anthropic-ai/claude-agent-sdk`. Split the AI layer into `src/llm/` with providers `claude-code.js` (default) and `api.js` behind one interface (`structured`, `text`, `agent`). The Q&A agent loop moved into the providers; tools became a provider-neutral list.
- `llm_usage` records `provider`; the monthly spending cap applies to the API only.
- Real end-to-end run via Claude Code: a 2-minute sample processed in ~65s with good notes and entities; Q&A answered correctly with transcript quotes.
- **Bugs found by the real run and fixed:**
  - SSE streams sent nothing and never closed. Node's `request.raw` `'close'` fires once the request body is read, not on disconnect; switched to `reply.raw`. A regression test now uses a real HTTP connection, because `app.inject` didn't show the bug.
  - The host's claude.ai connectors (Gmail/Calendar/Drive) leaked into Claude Code runs, and an answer told the player to authorise them. Fixed with `strictMcpConfig`, `settings.disableClaudeAiConnectors`, `syncClaudeAiSkills/Plugins: false` and `skills: []`.

### 2026-10-03: Q&A speed work (model unchanged)

- **Pre-search:** the server searches on the question (entities, notes, arcs, transcript chunks; `QA_PRESEARCH_TOKENS`, default 3000) and includes the results with the question.
- **Removed `save_evidence`:** evidence is now built from the answer's citations (transcript lines at cited timestamps; notes title for bare `[S#]`). `CITATION_RE` accepts ranges `[S1 00:01:10-00:01:30]`.
- The system prompt asks for parallel tool requests and answering straight away when pre-search suffices.
- **Timing:** `llm_usage.duration_ms`, `qa_log.duration_ms` and `qa_log.first_text_ms`, with averages in `GET /campaigns/:cid/usage`. Added small in-place migrations in `db/index.js`.
- Measured: exact-quote question 9.3s / 3 turns → 3.8s / 1 turn; first text ~1.5–2s. A warm Claude Code process was measured at ~0.6s saving and not adopted.
- SPEC v0.4, this file, `AGENTS.md`.

### 2026-10-04: AI-managed knowledge base, private player notes, privacy

The owner's direction:
- The AI has full authority to organise the database; no human reads it.
- Players take private notes during the session, linked to transcripts by date.
- The database tracks who knows what.
- Corrections are accepted, and the AI asks about conflicts.

Changes:
- **Removed** the fixed pipeline (session notes, entity pages and facts, arc and campaign summaries) and its notes/entities/edits endpoints.
- **Added the archivist** (`src/kb/archivist.js`): an agent with full write tools over `kb_records` (create, update, delete, guide, ask_dm, plus reading transcripts and notes). It keeps its own guide and pinned records (with a size budget); every change is journalled and each run is snapshotted to the archive.
- **Player notes**: `POST/GET /notes`. Archived per date, indexed so only the author can find them, and searchable in Q&A with `search_my_notes`.
- **Privacy**:
  - The speaker map links transcript names to accounts, which feeds the `attendance` table.
  - Transcript chunks are visible only to attendees, and every record has a `known_by` list.
  - Every Q&A tool, the pre-search, the evidence and the transcript endpoint filter by who is asking.
- **Corrections** (`POST /corrections`) and **archivist questions** (`GET /questions`; answering creates a correction; dismiss) run as `correct` jobs. Rebuild replays sessions and corrections in order; range rebuilds were removed.
- Accounts and memberships are archived, and restore brings back users with their token hashes.
- Schema v2, with an in-place migration from v1 (drops old derived tables, sets `played_on`). `PIPELINE_VERSION` = 2.
- **Real test** (Claude Code, Opus 5.5 at high effort):
  - Session 1: everyone present; a 20 gp loan from Brother Hal; a DM whisper to Lyra; private notes from both players.
  - Session 2: Lyra absent; Thorin repays 10 gp and finds a ledger.
  - The archivist built 20 records in 10 kinds with its own guide. It restricted the whisper to Alex, Sam's note-only details to Sam, and session 2 to Sam. It kept the original debt public and put the partial repayment in a Sam-only record. It asked the DM two sensible questions.
  - Q&A: Sam was told 10 gp is still owed, and Alex was told 20. Each saw only their own secrets, and Alex couldn't learn what was in the mill.
  - Timing: 5–10s per answer, mostly with no tool calls. Archivist runs took ~70–100s each.

### 2026-10-04: Roles clarified, docs brought up to date, pushed

- Kenny is the project owner and host, **not the DM**. Docs now say "host" for the machine and subscription, and "owner's call" for his decisions. The DM role and its permissions are deferred.
- Saved the real privacy scenario as `packages/server/test/fixtures/privacy-scenario/`: two transcripts, plus `drive.mjs` to replay it against a running server with real AI calls (instructions at the top of the file).
- SPEC v0.5 and this file reviewed end to end. Everything committed and pushed to GitHub.

### 2026-10-04: Web page instead of Electron; name + password logins

The owner's direction: no Electron app, a web page instead. Each player logs in with a name and password that the admin sets, because the AI's record of who knows what depends on knowing who is asking. Public URLs are placeholders, kept in one variable.

- **Auth** (`src/auth.js`): accounts have a unique name (case-insensitive) and a scrypt password hash. `POST /login` → a random token (hashed in the new `logins` table), valid 30 days since last use (`LOGIN_DAYS`). `POST /logout`. Setting a password or revoking ends all of that account's logins. Lockout after 10 failures per name in 15 minutes (in memory). Unknown names are checked against a dummy hash, so timing doesn't reveal names.
- **Admin only** now creates accounts, sets passwords and revokes (CLI, or `POST /members`, `PUT /members/:uid/password`, `DELETE /members/:uid`). Removed `reset-token`. The DM role can still list members.
- **Admin CLI:** `init` takes a password; new `add-user`, `set-password`, `revoke` (by name or id); `list` shows who has no password and all memberships.
- **Schema v3** with an in-place migration: rebuilds `users` without `token_hash` (ids kept, no passwords), adds `logins`. Tested on a v2 database built from the previous schema: ids, memberships and foreign keys intact. Archive `accounts.json` now holds `password_hash`; restoring an old archive gives accounts without passwords.
- **Web page** (`packages/web/public`: `index.html`, `app.js`, `style.css`, `icon.svg`): login; Ask tab (SSE via `fetch`, status line from `tool` events, replaces text on each `turn`, citations link to evidence, past conversations, follow-ups); Notes tab (Ctrl+Enter, grouped by session date); campaign picker; phone layout; dark mode. Served by `serveWebPage()` in `app.js`: one public route per file, `/` → `index.html`.
- **Config:** `publicUrl` (`PUBLIC_URL`), `webDir`, `auth.loginDays`, `auth.maxFailedLogins`. The server logs the public URL on start-up.
- Tests: 35 (added login, expiry and page-serving tests; the helpers create accounts with passwords and log in). The privacy-scenario `drive.mjs` now logs in with names and passwords.
- Live check on a temporary data dir: CLI commands, page and script served, wrong password refused, case-insensitive login, notes saved and listed, player blocked from creating accounts, logout ends the login. **Not checked by eye in a browser, and `/ask` from the page not run against the real AI.**

### 2026-10-04: Admin screen

The owner's direction: manage everything from an admin login with an admin UI instead of the console. The owner makes himself a regular player account from there, so privacy applies to him as a player.

- **Routes** `/admin/users` (list, create, `password`, `logout`, `block`, `unblock`, delete) and `/admin/campaigns` (list with members, create, `PUT/DELETE members/:uid` to add, change role/character, remove). Admin only. They replace `POST /campaigns` and the account routes under `/campaigns/:cid/members` (the DM still has `GET /campaigns/:cid/members`).
- **auth.js:** `unblock`, `logoutEverywhere`, `removeMember`, `deleteUser` (refused with 409 if the account has notes, conversations, attendance, speaker-map links or corrections). The admin can't block or delete their own login.
- **CLI** trimmed to `init "<admin name>" "<password>"` (admin login only, no campaign; refuses if an admin exists), `set-password`, `list`.
- **Web page:** `admin.js` (admin screen), `api.js` (shared requests + a small element helper), `app.js` routes admin logins to the admin screen. Tables stack into cards on phones. Fixed: switching logins without a reload left the other view showing.
- `drive.mjs` now creates the campaign and accounts (including a separate DM, "Dee") through `/admin`.
- Tests: 36. Live check: admin flow over HTTP, plus **screenshots in headless Edge** (login, admin desktop and phone, player Ask and Notes) with no console errors.

### 2026-10-04: Multiple campaigns everywhere

The owner's direction: campaigns must be supported everywhere. The AI keeps them separate and knows which one the player is asking in, players choose their campaign from a dropdown after logging in, and the admin picks which campaigns (plural) each account can access when adding it, and can change that later.

- **Audit:** the server already scoped everything by campaign (search, knowledge base with `id AND campaign_id`, transcripts, notes, attendance, conversations, archivist roster, Q&A prompt names the campaign). New test: Sam in two campaigns asks in the empty one with every Q&A tool; nothing from the other campaign appears, and the prompt names the right campaign and character.
- **Server:** `auth.setCampaigns(userId, list)` (exact set; adds, updates, removes; archives members.json of every affected campaign). `POST /admin/users` takes optional `campaigns`; new `PUT /admin/users/:uid/campaigns`. Refuses unknown campaigns (404), duplicates (400) and the admin login (400).
- **Player page:** campaign picker after login (skipped with one campaign; message when none). The choice is kept per browser tab in sessionStorage, and the last choice is pre-selected. "Switch campaign" link in the header.
- **Admin screen:** campaign checkboxes (with role and character) on the add-account form; "Edit campaigns" per account opens the same editor inline. The per-campaign member tables are still there.
- Checked in headless Edge: add form, editor (removing a campaign and saving), picker on desktop and phone, entering a campaign, reload keeps it. No console errors.
- Ops lesson: stopping `npm start` from a background task on Windows leaves the `node` child running on port 4400. The server is now run with `node packages/server/src/index.js` in this environment.

### 2026-10-04: Delete campaigns

The owner asked to be able to delete campaigns.

- `DELETE /admin/campaigns/:cid` (admin). `store.deleteCampaign` deletes the `campaigns` row; foreign keys cascade to memberships, sessions (+ attendance), notes, corrections, speakers, glossary, knowledge base, journal, DM questions, search docs (FTS triggers fire), jobs, conversations (+ qa_log). `llm_usage` rows are kept as usage history. The search vector cache is cleared. Refused (400) while the campaign has queued/running jobs.
- **Archive untouched** apart from a new `deleted.json` marker (name, id, when, by whom). `archive.readAll` skips marked folders, so restore never brings it back. `createCampaign` also skips slugs that already have an archive folder, so a new campaign with the same name gets a new folder.
- **Admin screen:** "Delete campaign" on each campaign; a prompt explains what goes and requires typing the campaign's name.
- Test covers the cascade, FTS integrity, the 404 afterwards, the archive files and marker, slug reuse, and restore into a fresh database. Checked in headless Edge: a wrong name is refused, the right one deletes, and the account's campaign list updates.
- **Fix (same day):** deleting "test camp" silently failed. The campaign was stored as "test  camp" (two spaces); the page collapses spaces, so the owner typed one, the exact-match check refused, and the error banner was off-screen (sticky at the top of the admin view). Now: account and campaign names are cleaned on creation and login (`cleanName` in store.js: trim, collapse whitespace); the delete confirmation ignores case and extra spaces; admin messages are a fixed toast that is always visible. Test added (40).
- Not handled: a player already inside a campaign when it's deleted sees request errors until they reload (then they get the picker).

### 2026-10-04: Campaigns stand out on the admin screen

The owner asked for the admin screen to show campaigns more distinctly.

- Each campaign is its own card (no longer rows inside one box), with its own colour (hue chosen by campaign id, so it never changes): a coloured top stripe, a tinted header with the name in that colour, and badges for sessions, players and DM ("No DM yet" in red).
- The same colour is used for the account pills ("Curse of Strahd · Lyra") that replace the comma list in the accounts table, and as a dot in the campaign checkboxes.
- Light and dark versions; checked in headless Edge at desktop and phone width.
- Fixed: the element helper `h()` in `api.js` only flattened one level of nested children (pills showed as "[object HTMLSpanElement]"); now flattens fully.
- **Campaign names are now unique** (ignoring case and extra spaces; 409). Duplicates would be indistinguishable in the players' campaign dropdown.

### 2026-10-04: "Must change password at next login"

The owner asked for Active Directory-style forced password changes, at the admin's choice.

- **Schema v4:** `users.must_change_password` (in-place `ALTER TABLE`; tested on a copy of the real v3 database before restarting on it). Archived in `accounts.json` and restored.
- **Enforced server-side:** while the flag is on, the `onRequest` hook allows only `/me`, `/logout` and `/account/password`; everything else is 403. Takes effect immediately, even for existing logins.
- **`POST /account/password`** (anyone, any time): needs the current password; the new one must differ and have 6+ characters. Clears the flag, keeps this login, ends the others.
- **Admin:** `must_change_password` on `POST /admin/users` and `PUT /admin/users/:uid/password`; new `PUT /admin/users/:uid/must-change-password`. UI: checkbox on the add-account form (ticked by default), a yes/no after "Set password", a badge and a "Require new password" / "Don't require" toggle in each account's status.
- **Player page:** forced "Choose a new password" screen right after login (no Cancel); "Change password" in the player and admin headers (with Cancel).
- Checked in headless Edge: default-ticked box, forced screen, wrong current password, mismatch, same-as-old, success goes into the campaign, voluntary change and cancel. No console errors.

### 2026-10-04: SPEC and HANDOFF reviewed

- SPEC v0.7: status, roles (admin login vs DM vs players; multiple campaigns per account), file layout of `web/public`, web page (password screen, admin screen, player view), tables, built features, security (password rules, logins), milestones.
- This file: current state (schema v4, live install, exactly what's uncommitted), next steps (commit first, then real-AI Q&A from the browser), setup notes (automatic upgrades, admin password recovery), decisions, verified table, gotchas.

### 2026-10-04: Session uploads on the admin screen

The owner asked for somewhere on the admin screen to upload session transcripts with a session number and date, see past uploads, and keep the date tied to how player notes are matched.

- **`GET /admin/campaigns/:cid/sessions`**: sessions (newest first) with status, error, job progress/message, matched note count and authors for their date, attendance count; `notes_waiting` (dates with notes but no session); `next_number`; `today` (today's note date by the same 6am rule as notes); `rollover_hour`.
- **`POST /campaigns/:cid/sessions/preview`** (DM/admin): parses without saving; returns lines, first/last timestamp, and each speaker with line count and current account link.
- **Upload** now takes optional `speakers: [{speaker, user_id}]`. They're validated **before** the transcript is archived (a bad link used to be found only after archiving, leaving a permanent orphan session; caught by the new test), and merged into the speaker map (others kept) **before** processing is queued, so attendance uses them. Display names are generated: "Thorin (Sam)", "DM (Dee)", or the raw name for guests. The reply lists `unlinked_speakers`. A re-upload of a session that's queued or processing no longer queues it twice.
- **Admin screen** (`admin-sessions.js`): per campaign card, a Sessions table (refreshes every 4s only while something is processing, without touching the upload form), a "waiting for a transcript" notice, and an upload form: number and date pre-filled, a live hint saying how many player notes the date will pick up (and warning if another session has that date), file or paste, then "Who's who in this transcript" with an account dropdown per name (current link, or a guess when exactly one account or character name is inside the transcript name). Enter can't submit before a transcript is loaded.
- Tests: 43. Checked in headless Edge with processing deliberately failing (API provider, no key): defaults, hint, file pick, guesses (Sam and Alex guessed, KennyDM linked to Dee by hand), upload, notes moving from "waiting" to the session, failed status with error and Retry, speaker map saved as "DM (Dee)", "Thorin (Sam)", "Lyra (Alex)". No console errors.
- **Not yet done with the real AI from the screen:** a successful processing run started from the upload form.

### 2026-10-06: Character sheets; no book database

The owner's direction: no longer building a database from the D&D source books (it was never in these docs; only in an assistant's memory notes, now removed); books go in the `DND books` folder and are referred to when needed. Add a character sheet for players, structured like a normal 5e sheet, autofilled from core stats, with manual changes always respected and preserved, saved between sessions, uploadable, and with a spells section that can pull spell details by name.

- **Rules** (`packages/shared/src/sheet.js`, no imports, also served to the page at `/shared/sheet.js`): `emptySheet`, `normalizeSheet`, `computeSheet` (auto values + the player's overrides), `DERIVED` keys, class/skill tables, 2014 PHB slot tables (checked against the book). 6 tests.
- **Server** (`src/sheets/`): `store.js` (get/save with version check, archive of per-save diffs, replay for restore), `import.js` (sniff file type; PDF form fields + text via pdf.js, PDF/image attached; structured AI read; printed numbers that differ from the rules become overrides), `spells.js` (SRD → books → AI memory, in-memory cache), `books.js` + `pdf.js` (read PDFs in `BOOKS_DIR`, find spells by heading, fuzzy/OCR-tolerant), `srd-spells.json` (319 SRD 5.1 spells, CC BY 4.0). Routes: `GET/PUT /campaigns/:cid/sheet`, `POST .../sheet/import`, `GET .../sheet/download`, `GET .../spells?q=`, `GET .../spells/lookup?name=`. Sheets count as account history (can't delete the account). Restore replays sheets.
- **AI layer:** `structured()` now takes `attachments` (images/PDFs) and `userId`; the Claude Code provider sends attachments as a streamed user message. New tasks `import` (medium) and `spells` (low). `SHEET_AI_PER_HOUR` (60) per player.
- **Config:** `BOOKS_DIR` (default `../DND books`), `MODEL_/EFFORT_IMPORT`, `MODEL_/EFFORT_SPELLS`, `SHEET_AI_PER_HOUR`. Schema v5 (`character_sheets`; no migration needed). New dependency `pdfjs-dist`.
- **Page:** Sheet tab (`sheet.js`, styles in `style.css`): official-sheet layout, ↺ on the player's own values, autosave (status line; 409 → choose which version to keep), upload/download/print, spells with suggestions, "Look up details", "Fill in missing details". The view widens to 1280px on this tab; 3 → 2 → 1 columns.
- **Tests:** 54 (5 new server tests: diff/replay, save/versions/privacy/archive/download-reupload, upload with overrides and attachments, spell lookup order + cache + rate limit, restore).
- **Checked for real** (throwaway server on port 4411 with a temp data dir, headless Edge, real Claude Code):
  - Filling in a 5th-level hill dwarf wizard gave HP 37, DC 15, 4/3/2 slots; a typed AC 15 stayed 15 after Dexterity changed while initiative followed; autosave worked; no console errors.
  - Spells: Fireball and Shield from the SRD (~0.5s); Hex from the PHB scan (~7s, OCR errors fixed: "Vou" → "You", "Id6" → "1d6"); Booming Blade from AI memory (~7s, labelled).
  - Upload: a text PDF of a 4th-level cleric through Claude Code with the PDF attached (~20s): fields, skills, prepared spells and coins read correctly; AC 18 and HP 35 kept as the player's values; the AI noted HP 35 looked low for a hill dwarf.
  - The PHB is read at start-up in ~1.7s, 307 spell headings found.
- **Not checked:** a real D&D Beyond or official fillable PDF, a phone photo of a paper sheet, the page on a real phone, print layout on paper, the API provider with attachments.

### 2026-10-06: General D&D questions; rich answer formatting

The owner's direction: players will ask generic questions ("What is the stat block for a standard brown bear?"). That's a valid use, so the AI shouldn't hunt through campaign notes for it or treat it as odd; it should first decide whether it can answer right away or whether the question is about this campaign. And answers should be able to show tables and similar via HTML.

- **Q&A prompt** (`src/qa/agent.js`): a first step classifies the question as general D&D knowledge (answer from own knowledge, no tools, mention a house rule only if the pre-search shows one), about the campaign (research as before, answer only from sources), or both. A "How to format" section allows markdown and a fixed HTML allowlist, with a stat-block template. Pre-search still runs (it's free and local, and catches house rules). `PIPELINE_VERSION` 2 → 3.
- **Page** (`app.js`, `style.css`): `renderAnswer` now uses `marked` (GFM, line breaks) + DOMPurify (allowlisted tags; only `class`, `colspan`, `rowspan`, `scope`, `align`, `start`, `open` attributes), then links citations by walking text nodes (skipping code), so citations work in tables too. Wide tables scroll inside the answer. Styles for headings, lists, tables, `details`, and `.stat-block` / `.ability-scores`.
- **Server** (`app.js`): serves `/vendor/marked.js` and `/vendor/purify.js` from `node_modules` alongside `/shared/sheet.js`. New dependencies `marked`, `dompurify` (server package, since the server serves them).
- **Tests:** still 54; the web-page test checks the vendor modules are served, the Q&A test checks the prompt has the general-knowledge and stat-block instructions, and the archivist test reads the outputs folder for the current `PIPELINE_VERSION`.
- **Checked in headless Edge** with the real `renderAnswer` code and `style.css`: a stat block, a markdown table with citations in cells (linked when there's evidence, plain otherwise), literal citations in `code`, and hostile HTML (`img onerror`, `script`, `javascript:` link, `style`, `onclick`) all stripped. This caught a crash on text at the top level of an answer, now fixed.
- **Not checked:** a real question through the AI from the page.

### 2026-10-06: Pin, rename and delete chats; themes and layouts

The owner asked for deleting chats and pinning ones to come back to, and "an assortment of styles and layouts for the sheets and overall page. Go nuts, be creative."

- **Server:** schema v6 (`conversations.pinned`, `conversations.deleted_at`; in-place migration). `GET /conversations` now returns `pinned` and `updated_at`, pinned first then most recent. New `PATCH /conversations/:id` (`pinned`, `title`) and `DELETE /conversations/:id`, owner only. **Delete erases** the questions, answers, evidence and tool calls and hides the chat, but keeps the bare `qa_log` rows: otherwise deleting chats would reset the hourly question limit (and drop usage figures). A deleted chat can't be opened or continued.
- **Page, chats:** the conversation dropdown is now a chat list (`#chats`): Pinned and Recent sections, a filter box, and pin/delete buttons on each row. The header above the thread shows the open chat's title with pin, rename and delete. It's a drawer in the classic and app layouts, and a sidebar in the sidebar and full-width layouts on screens 900px and wider.
- **Page, Look** (`look-boot.js`, `look.js`, `themes.css`; a "Look" button in the player and admin headers and on the login screen): themes Tavern (the old look; follows the device), Arcane Study, Dungeon Crawl, Elven Grove, Nine Hells, Frostmaiden, Ancient Scroll, Synthwave Sorcery, 8-bit Quest, Ink & Paper (high contrast), Feywild, The Abyss. Layouts: classic, sidebar, full width, app (tabs at the bottom). Text size: compact/cosy/roomy. Chat styles: bubbles, play script, letters (with a wax seal), terminal. Sheet styles: match theme, official (labels under the boxes, badge-shaped abilities), grimoire, index cards on cork, blueprint, terminal. Sheet layouts: three columns, combat first, one column. Saved per browser in localStorage, applied in `<head>` before the page draws. System fonts only. Printing resets to black on white. Animations respect reduced motion.
- **Base CSS:** new tokens (`--font-body`, `--font-head`, `--head-color`, `--bg-art`, `--topbar-bg`, `--q-bg`, `--q-text`, `--shadow`, `--base-size`). The root font size now drives everything, which is how text size works.
- **Tests:** 55 (new: pin order, rename, owner-only, delete erases, deleted chat can't be opened or continued, and deleting doesn't reset the hourly limit).
- **Checked in headless Edge** against a throwaway server (temp data dir, seeded player and chats, driven over the DevTools protocol): every theme in the dialog previews; Tavern on a dark device; Arcane + sidebar; Scroll + letters; 8-bit + terminal + full width; Grove + play script; Neon; each sheet style and layout; the app layout and drawer at phone width; the login screen; pin and delete through the real buttons. No page errors. Fixed what the screenshots showed: a double scrollbar in the dialog, the drawer see-through on themes with translucent surfaces, sheet styles picking up the theme's heading colour, 8-bit's shadow leaking into the terminal chat, a wrapped label in a preview.
- **Not checked:** a real phone, Safari/Firefox (uses `color-mix`, `:is`, `<dialog>`; all current browsers support them), printing each sheet style on paper.

### 2026-10-06: Character sheet tidied; two new sheet layouts

The owner's direction: the sheet "does not look very uniform, and the other layouts have similar issues"; make it neat and tidy in every layout, add more variety to the layouts, and take inspiration from sheets online. Looked at: the official 2014 sheet, the 2024 PHB sheet (skills grouped under their ability) and app sheets like D&D Beyond (abilities across the top, actions/spells/inventory in tabs).

What was untidy (from the owner's screenshot and screenshots of every style and layout): four kinds of container (pill rows for inspiration, proficiency and passive Perception; cards; tiles; bare fields), labels in four positions (under, above, left, right), number boxes in five widths, columns ending at different heights with big gaps, an empty cell in the header grid, Treasure alone on its row, the ○●◆ marks drawn with font glyphs of different sizes, and the two-column fallback stretching "Other proficiencies" by ~450px.

- **Blocks and layouts** (`sheet.js`): each part of the sheet is now a block built by one function (`core`, `saves`, `skills`, `abilityGroup`, `vitals`, `hp`, `hitDice`, `deathSaves`, `attacks`, `equipment`, `traits`, `features`, `details`, `spells`...). `LAYOUTS` lists, per layout, the rows of columns to put them in. Changing the layout under Look redraws the sheet (a `MutationObserver` on `data-sheet-layout`). The saved sheet format didn't change.
- **New layouts:** *By ability* (like the 2024 sheet: vitals strip across the top, then each ability as a card holding its saving throw and skills, with attacks, features, traits and equipment beside them) and *Tabs* (abilities and vitals across the top, saves and skills, then Actions / Spells / Inventory / Features & traits / Background tabs; arrow keys move between tabs; the open tab is remembered per browser in `dndapp.sheetTab`; every tab prints). Three columns, combat first and one column were rebuilt on the same blocks. Combat first now puts the traits in a 2×2 grid beside the stats with features underneath.
- **One set of measurements** (`style.css`, "character sheet"): `--ctl` (box height), `--num` (number width), `--row` (list line), `--pip` (tick circle), `--mark` (tick column), `--gap`, `--pad`. Every group is a card; every label is `.lbl` under its value (column labels above the two little tables); inspiration, proficiency bonus and passive Perception are one-line cards lined up with the save and skill lists. Every column stretches to the tallest in its row and its last box grows, so the bottoms line up. Character details: backstory spans two rows so no box sits alone. Header: a sixth cell shows the character level, and a summary line sits under the name.
- **Ticks:** all tick boxes on the sheet are circles (like the printed sheet); skill marks are drawn in CSS (○ none, ● proficient, ◆ expertise). Spell slots and Pact Magic now have one circle per slot to tick when used (same `slots_used` numbers as before; ticking the 3rd sets 3, unticking it sets 2), and death saves use the same circles (failures fill red).
- **Responsive by container width:** the sheet (`container: sheet`) and each column are size containers, so blocks adapt to the box they're in, whatever the page layout: three columns down to an 860px-wide sheet, two columns down to 640px (in three columns, the traits move beside the combat column and features goes across the bottom, which keeps both sides about the same height), then one. Attacks go to two lines in boxes under 400px; hit dice and death saves stack in narrow columns; ability names shrink in narrow tiles.
- **Styles** (`themes.css` §5) updated for the new markup. Fixed on the way: in Blueprint and Index cards your own values (↺) lost their highlight; Grimoire's name now sits on the leather like a title, and text on the leather (section titles, prepared counts, "Fill in missing details") is readable; Index cards keep the add-spell box on paper. The Look dialog has diagrams for the new layouts and the sheet-style previews use the new markup.
- **Checked in headless Chromium** (throwaway server on port 4411, temp data dir, a filled-in 6th-level multiclass sheet and an empty one): every layout at 1280, 1000, 800 and 390px wide; every sheet style; Tavern on a dark device, Arcane, Frost, 8-bit, Ancient Scroll; the app page layout on a phone; the Look dialog; print preview of the tabs layout. Driven through the real page: switching layouts from the Look dialog, tabs (click, arrow keys, remembered after reload), death-save and slot circles, inspiration, a skill mark, and ↺ on a typed AC all saved to the server correctly. No page errors. `npm test`: 55 passing.
- **Not checked:** a real phone, Safari/Firefox (container queries need Safari 16+ / Firefox 110+), printing on paper.

### 2026-10-07: Q&A looks rules up in the group's books

The owner's direction: the books stay a folder of PDF scans (no database); the AI should be able to refer to them when needed, choosing its own search terms so vague questions work, with a table of contents to browse.

- **`books.js`:** besides spell headings, each page is now kept with its lines, a search form of its text (lower case, OCR mix-ups l/1/I and 0/O folded, line-end hyphens joined) and its capitalised headings. `search(terms, { book })`: words or phrases matched at the start of a word (so plurals match), weighted by rarity, pages matching several terms first, headings count double; up to 8 pages with a snippet. `readPages(book, page, count)`. `contents(book, { fromPage, toPage })`: the PDF's bookmarks, else the headings found on each page. Printed page numbers: lines that are only a number vote for an offset from the PDF's numbering; used when at least 3 pages and half the numbered pages agree. Books are named by file name, matched loosely ("handbook" finds "Players Handbook").
- **`pdf.js`:** `readPdf(buf, { outline: true })` also returns the bookmarks with their pages.
- **Q&A:** new tools `search_books`, `read_book` (1–2 pages), `book_contents`, added only when there are books; the system prompt lists the books with their page ranges and says when and how to use them (official terms plus synonyms, never the player's sentence; search again or browse on a miss; ask when unsure which rule; fix OCR errors silently; quote only what answers; cite as `(Book p. N)`). General rules questions are still answered from the model's own knowledge unless the wording matters or the player asks. Page status labels for the three tools. `PIPELINE_VERSION` 4 (prompt and tools changed).
- **Tests:** 58 (new `books.test.js`: search ranking, hyphenated words, plurals, loose book names, printed page numbers, reading pages, contents from headings and from bookmarks, the Q&A tools end to end, and no book tools when there are no books). The test PDF builder moved to `helpers.js` and can add bookmarks.
- **Not checked:** the real books (none on this machine) and the real AI choosing search terms; whether printed page numbers come out right on the real scans.

### 2026-10-07: 3D dice, rolled by the server

The owner asked how possible a fully animated dice roller like D&D Beyond's would be, then (after hearing that D&D Beyond lets the browser's physics decide, while this would have the server decide and the dice land on its numbers) said to go ahead as long as it looks exactly the same to the player.

- **Rolling** (`shared/src/dice.js`, `POST /campaigns/:cid/roll`): notation like `1d20+5`, `2d6+1d4-1`, `d%` (d2–d20 and d100, up to 50 dice, numbers up to 999); advantage/disadvantage when there's exactly one d20; `crypto.randomInt` on the server; the result lists every die (dropped ones marked) and the natural d20. Anyone in the campaign can roll; rolls aren't saved. `findRoll` reads the dice out of an attack's damage text (`1d8+2 piercing` → `1d8+2`).
- **3D dice:** `@3d-dice/dice-box-threejs` 0.0.12 (MIT; Three.js + cannon-es bundled into one ES module, ~700 KB), served at `/vendor/dice/dice-box.js` with its sounds under `/vendor/dice/sounds/` (no textures needed), loaded on the first roll. It runs the real physics throw first, then swaps the face labels so the face that lands up shows the server's number (checked in the browser: every die landed on the server's value, including advantage and a percentile 100 as "00" + "0"). The dice take the theme's accent colours and tumble over the whole page, then fade.
- **Page** (`web/public/dice.js`): a Dice button in the player header opens the tray (dice buttons that build the notation, a notation box, Normal / Advantage / Disadvantage for the next d20, 3D and sound switches kept per browser, this session's rolls; a bottom sheet on phones). Results appear in a card at the bottom: total, each die, natural 20 / natural 1, and after an attack, a damage button (doubled dice on a natural 20). On the sheet (`sheet.js`): clicking a save, skill, ability name, initiative or spell attack rolls d20 + that value; attacks have a roll button; death saves have "Roll a death save". Shift-click = advantage, Alt-click = disadvantage. Reduced motion, no WebGL, or 3D switched off: the result appears straight away.
- **Tests:** 63 (shared: parsing, refusing bad notation, damage text, totals, advantage/disadvantage, naturals; server: the endpoint, all 20 faces come up, advantage keeps the higher, bad notation and outsiders refused, the bundle and sounds are served, no path escape).
- **Checked in headless Chromium** (software WebGL) against a throwaway server: rolling Stealth, an attack with advantage then its damage, and a typed `2d6+1d100+3` from the tray, each comparing the faces the 3D dice landed on with the server's numbers (all matched); bad notation explained; at 1280 and 390px wide; reduced motion. No page errors (apart from the deliberate 400).
- **Installing:** done with npm 11, so the lockfile only gained the new packages.
- **Not checked:** real phones and GPUs, Safari/Firefox, how the sounds feel, many dice at once on a slow phone (3D is skipped above 30 dice).

### 2026-10-07: Dice styles and special effects

The owner asked for "more dice themes? Special effects? Nice fancy shit like that."

- **24 dice styles** (`STYLES` in `dice.js`), picked in the tray with hexagon swatches: Match the page, Dragonfire, Frost, Stormcaller, Thunderhead, Poison, Acid, Necrotic, Radiant, Force, Psychic, Blood Moon, Starry Night, Astral Sea, Thylean Bronze, Here Be Dragons, Dragon's Hoard, Cold Steel, Obsidian, Bone, Old Oak, Glitter Party, Pastel Sunset, Rainbow. Most are the library's own colour/texture sets (skipping its Star Wars, Animal Crossing and joke sets). Textures are served from `/vendor/dice/textures/` (1.7 MB in all) and only the chosen style's are fetched. Picking a style throws a preview.
- **Found while checking:** the library's "metal" and "glass" materials need an environment map it switches off, so dice in them render nearly black. Every style uses the plain material (or matte "wood"); the textures still give the look. Glitter Party dropped its texture, which darkened the pastels. Light raised from 0.7 to 0.9.
- **Effects** (`dice-fx.js`, one canvas over the page, no libraries): trails behind each moving die by style (embers, snow, sparks, motes, stars, smoke, bubbles, glitter, petals), using the dice's positions projected from the 3D scene every frame. Natural 20: golden flash, two rings, stars and confetti from the d20 that shows it, a "Natural 20!" banner, and the result card shines. Natural 1: a red flash and a ring closing in on the die, smoke, red sparks, a "Natural 1" banner that falls away, and the page shakes. Maxed damage (no d20, 2+ dice all on their highest face): a sparkle and "Max damage!". Synthesised chimes (Web Audio) when sound is on. Without 3D, the bursts happen at the result card. Off with reduced motion or the Effects switch.
- **Checked in headless Chromium** (software WebGL): every style thrown and looked at; natural 20, natural 1 and max damage forced by intercepting the roll response in the test (the server's real rolls are random), banners and shake confirmed; the earlier dice checks (faces match the server, advantage, d100, phone width) still pass. No page errors. `npm test`: 63 passing.
- **Not checked:** how the styles and effects look on a real GPU (the software renderer is darker and slower, so trails and bursts last longer in it), on a phone, and the chimes by ear.

### 2026-10-07: Map prototype

The project's goal is an interactive map; this is a first prototype of the interaction only. (Replaced the same day, following the owner's direction, by server-backed maps; see "Maps (DM imports, AI reads, tokens moved live)". Leaflet and the browser-only storage were removed.)

- **Map tab** (`web/public/map.js`): Leaflet 1.9 (`CRS.Simple`, flat image coordinates) served from the npm package at `/vendor/leaflet.js` and `/vendor/leaflet.css`. Pan by dragging, zoom with the wheel, pinch or +/−. "Choose a map image" (any image the browser can show; a grid until then), "Place a pin" then tap: name it in its popup (shown as a label), drag it, or remove it. "Fit to screen", "Clear". Styled from the theme's colours.
- **Kept in the browser only** (IndexedDB, per account per campaign), so nothing is written to the archive before the sharing design is decided. Private mode just means it isn't kept.
- **Checked in headless Chromium:** grid, wheel zoom, drag, image chosen, pin placed and named, kept after reload, phone width. No page errors. `npm test`: 66 passing (the static-file test now also fetches Leaflet).
- **Not checked:** pinch zoom on a real phone, Safari/Firefox, very large images (a 10k-pixel scan may be slow to draw).

### 2026-10-07: Maps (DM imports, AI reads, tokens moved live)

Owner's direction in the project thread: no premade maps; the DM imports their own (battle maps, towns, anything); the AI turns the terrain into something interactive; the DM adds characters, enemies and NPCs by hand; players move their own tokens.

- `shared/src/map.js`: the map document (`normalizeMap`), token sizes, snapping (`snapToken`: Medium in a square's middle, Large on a corner, always on the map) and distances (`measure`: 5e squares on a grid, straight lines otherwise). Served to the page at `/shared/map.js`.
- Server: `maps/store.js` (maps table, schema v7; archive-first with the image as uploaded and append-only diffs reusing the sheets' `diffJson`; restore replays them; `view()` filters per viewer; live `events`), `maps/read.js` (`inspectImage`, `detectGrid`, the AI's structured reading on a 2000 px JPEG copy; task `maps`, medium effort), routes in `app.js` (import, list, image, settings, read again, remove, tokens, SSE). AI reads per DM per hour: `MAP_AI_PER_HOUR` (20). A read cut short by a restart is marked failed on start-up.
- Page: Map tab (`web/public/map.js`): picker, pan (drag), zoom (wheel, pinch), Fit, a grid overlay toggle, the DM's Import / Add token / Map settings (name, shown, grid drawn live while editing, scale, what the AI saw, read again, remove), a token bar (Edit/Remove for the DM), drag-to-move with the distance shown, live updates with reconnects. `api.js` gained `listen` (GET SSE) and `fileUrl` (images need the login header).
- `package-lock.json` regenerated with npm 11 (it was also missing the dice library's entries).
- Tests: `test/maps.test.js` (grid measuring, import/read/archive, hidden from players, token permissions and snapping, live events over real HTTP, failed read and read again, restore) and `shared/test/map.test.js`. Checked in headless Chromium as DM and player, desktop and phone size, with a fake AI: import, read, add tokens, drag with distance, show/hide live, a player moving their own token and not the DM's.
- Not tried: the real AI reading a real map.

### 2026-10-07: Maps: fog, hit points, hidden tokens, stat blocks, NPCs, PDF pages, pins

The owner asked for the rest of the map list to be built, one at a time, in this order, on the same draft PR and without merging until he says so. 3D stays parked.

- **Fog of war:** `fog: { enabled, shapes }` (reveal/cover rectangles applied in order). `maps/image.js` blacks out covered parts of the image for players (sharp with an SVG mask, cached by a hash of the fog, which is also the player's `image_key`); `view()` drops tokens under the fog except the player's own. `PATCH .../fog` (enabled, add, undo, reset). Page: Fog tools (Reveal/Cover drag modes snapped to squares, Undo, Reveal all, Cover all).
- **Hit points and conditions:** `hp: {current, max}`, `conditions` (5e list plus concentrating). Players may set their own token's; for NPCs and enemies they get `health` (unhurt/hurt/bloodied/down) instead of numbers. Page: HP bar on tokens, `-7` / `+5` / `12` box, condition chips.
- **Hidden tokens:** `hidden: true`; players never get them.
- **AI stat blocks:** `maps/stats.js` (one structured call, purpose `map:stats`, counted in `MAP_AI_PER_HOUR`); `POST .../tokens/:tid/stats {name?}` sets `stats`, and hit points and size unless already set. Players get `stats: null`. Page: "Stat block (AI)" button, a dialog with the Markdown block, "look up instead", and auto lookup for new enemies.
- **NPCs from records:** `record: {id, title}` on tokens; `GET .../maps/records` (DM; `PERSON_KIND` guesses people from the archivist's free-form kinds) and `GET .../maps/records/:rid?title=` (falls back to the title, since a rebuild renumbers records). The knowledge base itself is untouched. Players get `record: null`.
- **PDF pages:** `maps/pdf.js` draws the page with pdf.js on `@napi-rs/canvas` (now a direct dependency; it was already installed as pdf.js's optional one). The PDF is archived as `source.pdf` and the map's `source` says which page.
- **Private pins:** `map_pins` table (schema v8), archived at `maps/<id>/pins/<user id>.jsonl`, restored, never sent over SSE or to anyone but their owner. Page: Pin button, labelled teardrop markers that keep their size at any zoom, drag to move.
- `PIPELINE_VERSION` not bumped: maps aren't part of the pipeline.
- Tests: 82 (`maps.test.js` now covers fog, hit points/hidden, stat blocks, records, PDF pages and pins). Checked in headless Chromium with a fake AI: PDF page import, stat block dialog, NPC from a record and its record dialog, a player's pin (placed, labelled, dragged, same size when zoomed, not seen by the DM). No console errors.

### 2026-10-07: Unit tests for everything

- Asked by Kenny: too many tokens were going on manual browser testing. Now `npm test` covers the web page too, so threads check their work with it.
- **Web page tests without a browser** (`packages/web/test/`, 63 tests): `page.js` opens the real page in jsdom against a real test server (fake AI) and gives tests `click`, `type`, `submit`, `pointer`, `settle`, `waitFor` and records of requests, alerts/confirms, downloads and page errors. Covers login and passwords, the campaign picker, Ask (streaming, citations, evidence, sanitising), chats, notes, the character sheet (automatic values, overrides, autosave and conflicts, spells, uploads, print), dice (tray, sheet rolls, crits, 3D dice faked), the Look dialog, the admin screen (accounts, campaigns, session uploads) and the Map tab (import, grid, tokens, player drags, live updates, fog, pins, stat blocks, records, reconnects). jsdom gaps (`<dialog>`, `requestSubmit`, canvas, ResizeObserver, named form controls) are polyfilled in `page.js`; each page gets fresh module copies via a resolve hook (`hooks.js`).
- **Server:** database upgrades from v1–v4 to v8 (`db.test.js`), the `admin` and `rebuild` commands run as real processes against a temp data folder (`cli.test.js`), provider and embedder choice and the vector helpers (`providers.test.js`). **Shared:** more map and sheet normalising.
- No app behaviour changed (test helpers only; `terrain()` moved into the server test helpers). Two things noticed and left alone: setting your own password on the admin screen logs out every login, including the browser you're using; `normalizeScale({distance: 0})` gives 0.001 rather than "no scale" (the page never sends 0).
- `npm test`: 164 passing (was 82).

### 2026-10-07: Character pictures and player tokens

- Owner's request: players upload their character's token and a full picture; the AI describes the full picture; the token shows on the map to represent them.
- **Server** (`src/characters/pictures.js`): uploads checked with sharp (PNG, JPEG, WebP, GIF, 10 MB), archived as uploaded under `characters/<user id>/`, with `pictures.jsonl` (the whole record per change) and a `character_pictures` table (schema v9, restored from the archive). Tokens are served as 256 px squares cropped with sharp's attention strategy, full pictures at most 1600 px, both WebP and cached in memory. The description is a structured AI call (task `import`, purpose `sheet:picture`), counted in `SHEET_AI_PER_HOUR`; it saves the sheet (Appearance, and eyes/hair/skin only where empty) and returns it, so the page takes the new version. If the AI fails the picture is still saved. Map views give player character tokens a `picture` key; uploading or removing a token picture re-sends the maps their token is on. Pictures count as account history.
- **Page:** a Pictures box in the character details (every sheet layout) with a token preview as it looks on the map, the full picture, upload/change/remove and "Describe again"; when the AI's description isn't used, it's shown with "Use it". Tokens on the map draw the picture in place of initials (greyed when down).
- **Tests:** 173 (server: archive and square crop, map views for everyone and live re-send, privacy of the full picture, outsiders refused, describe/replace rules, AI failures, bad files, restore; web: upload on the sheet → shown on the map, live for another player, the Appearance flow, errors).
- Not bumping `PIPELINE_VERSION`: the knowledge-base pipeline didn't change.

### 2026-10-07: Security audit

- Owner's request: a security review before hosting on his PC, making it as safe as possible without losing functionality. Reviewed auth, every route's access checks, uploads (images, PDFs, transcripts), archive paths, live streams, the AI sandbox (Claude Code with no tools), the page's HTML rendering, and dependencies (`npm audit`: 0). Privacy filtering (`known_by`, attendance, fog, hidden tokens, pins) held up; no route was found leaking another player's data.
- **Fixed** (`app.js`, `auth.js`, `characters/pictures.js`, `index.js`):
  - Security headers on every response: CSP (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, COOP/CORP, Permissions-Policy, and HSTS when `PUBLIC_URL` is https. Checked in headless Chromium: login, every tab, the map, 3D dice with textures and the admin screen load with no CSP errors.
  - Body limits: 1 MB by default (was 50 MB for every route), 16 KB for `/login` and `/logout`, `MAX_UPLOAD_MB` only on the four upload routes (transcript + preview, sheet import, map import; pictures and sheet saves already had their own).
  - Login guessing: also limited per address (`MAX_FAILED_LOGINS_PER_ADDRESS`, 30 per 15 minutes), with `trustProxy: 'loopback'` (`TRUST_PROXY`) so cloudflared's forwarded address counts and outsiders can't fake one. The failure list no longer grows without bound.
  - Live streams (map events, job events): a blocked, logged-out or removed account kept receiving map updates on an open stream, and a DM demoted to player kept the DM view. Streams now re-check the login (`auth.check`, read-only) and membership on every update and keep-alive and end when it fails. At most `MAX_STREAMS_PER_USER` (20) per account. Stream headers are now sent at once (the page and tests used to wait for the first event or the 20 s ping).
  - Error messages: 500s, the Ask stream's error event, picture descriptions and map reads now pass errors through `publicMessage`, which hides file-system, database and programming errors (they could show folder names on the host's PC). AI errors still explain themselves. Session and job errors show players only "Processing failed."
  - Pictures: more than 100 megapixels is refused before decoding (a small file can claim a huge size).
  - Start-up warns if `HOST` isn't local or `PUBLIC_URL` isn't https.
- **Left as is, on purpose:** the login token stays in `localStorage` (moving it to an HttpOnly cookie means adding CSRF protection; the CSP now covers the XSS risk); the 6-character minimum password; DMs can upload big files and very large maps (they're trusted); players can see job progress messages (tool names only).
- `npm test`: 182 (server 87: new `test/security.test.js`).
- Not bumping `PIPELINE_VERSION`: the knowledge-base pipeline didn't change.

### 2026-10-07: Setting up on the owner's laptop (Node and install problems)

- `npm start` failed with `Cannot find package 'fastify'`: the laptop had Node 16.17 (the project needs 22+) and nothing installed. Installed Node 24.19 LTS with `winget install OpenJS.NodeJS.LTS`.
- A plain `npm install` then failed: npm tried to compile `better-sqlite3` with node-gyp, which needs Python and the C++ build tools (not on the laptop). It shouldn't have tried: `better-sqlite3` 13 bundles prebuilt binaries for every platform we'd use and sets `gypfile: false`. Cause: an npm 11 bug. The lockfile marks it `hasInstallScript: true`, and when arborist reloads the package's scripts it keeps the lockfile's package data (which has no `gypfile` field), sees `binding.gyp`, and adds `node-gyp rebuild`.
- Fixed by installing with `npm install --ignore-scripts`, then `npm rebuild onnxruntime-node protobufjs` (the other two packages with install scripts; neither does anything needed on Windows x64). Checked that `better-sqlite3`, `sharp`, `@napi-rs/canvas` and `onnxruntime-node` all load, `npm test` passes (164), and the server starts. The lockfile didn't change.
- Not done: a project `.npmrc` with `ignore-scripts=true` would make plain `npm install` work, but it would also silently skip install scripts of packages added later. Left for the owner to decide. The old setup note suggesting `npm rebuild better-sqlite3` was wrong for v13 and has been corrected.
- Created the admin login "admin" on the laptop with `npm run admin -- init`; logging in over HTTP worked.

### 2026-10-07: Map grid easier to see

- The grid was one 1px black line at 45% opacity, which got lost on dark or busy maps. Each line is now drawn twice: a 3px dark outline with a 1px light line on top, so it shows on light and dark maps (`renderGrid` in `map.js`, `.map-grid` in `style.css`). The grid is still drawn in the accent colour while it's being edited. Tests pass; not yet checked by eye on a real map.

### 2026-10-07: Faster dice, and rollers to choose from

Owner's report: "the dice is too slow", not the PC. Profiled in headless Chromium (software WebGL, so frame rates are pessimistic; what was measured is CPU and simulated time):
- **The dice take ~3.5 s to land on any machine.** dice-box-threejs plays its physics in real time and only calls a die stopped after it has been still for 0.9 s; a throw is ~230–290 physics steps at 60 per second. The result card waited for that. Faster hardware doesn't shorten it.
- **The effects were the frame-rate killer.** `dice-fx.js` set `shadowBlur` on every particle as it drew it: ~370 ms a frame with trails and a natural-20 burst (~3 fps). Now each particle is drawn from a small picture made once per shape and colour: ~17 ms a frame, same look. This fixes every roller.
- **Shadows** roughly doubled the 3D library's frame time.
- The physics itself is cheap (the pre-simulation takes 3–15 ms).

Rollers (`ROLLERS` in `dice.js`; `DICE_ROLLER` in `.env`, sent in `/me`; a Roller picker in the tray overrides it per browser): `classic` (as before), `quick` (default: `dice-quick.js` subclasses the library: no shadows, gravity 700, time 1.5×, stopped after 0.3 s still; ~1.5 s), `lite` (`dice-lite.js`: real dice shapes drawn on a 2D canvas, scripted throw, no WebGL; ~1.2 s, 60 fps in software), `flat` (spinning flat dice; ~0.9 s), `none`. Without WebGL the 3D rollers fall back to `lite`. The "3D dice" switch is now "Animated dice".

Looked at and not used: `@3d-dice/dice-box` (the Babylon.js successor, physics and drawing in a web worker, so the fastest 3D option) can't be told which numbers to land on, which the server-decides design needs; a three.js-based light roller would add a 2 MB download, so `lite` draws its own.

- **Tests:** 190 (web: fallback to Lite without WebGL, the server's roller and the tray's override, the quick roller's settings, Lite/Flat/None land on the server's numbers; `dice-lite.test.js`: every shape's faces and numbers, opposite faces, each face lands toward the viewer and upright, notation, spacing).

### 2026-10-07: Fix: Classic 3D dice invisible after another 3D roller

- Owner's report: Classic 3D showed the effects but no dice. Each roller adds its own canvas to `#dice-stage`, and the 3D library's canvas is a normal block, so after Quick 3D (the default) had been used, Classic's canvas sat below the first one, under the bottom of the window. The canvases are now stacked (`position: absolute; inset: 0`). Reproduced and checked in headless Chromium (Quick then Classic: the second canvas was at y=600 in a 600 px window; now 0).
- **Tests:** 191 (a check that the stage's canvases are stacked).

### 2026-10-07: Fog checked; walls and line of sight on maps

- Owner's report: "fog blacks the whole map for the player" (with a castle battle map). Reproduced in headless Chromium with that map: not a bug. Fog starts with everything covered, and reveals drawn by the DM showed for the player live; the player's server-side image matched pixel for pixel. The DM only sees a light shade, so it was easy to miss that the player's screen is black. Now turning fog on puts the DM straight into Reveal mode, and the panel says players see nothing until you reveal.
- Owner then asked for walls and automatic line of sight, with the AI drafting walls (owner's call: "walls plus AI draft" in one PR).
- **Walls and doors** on each map (`walls`, up to 2000; doors can be open). The Fog panel is now "Fog & walls" with a second row: Line of sight, Wall, Door, Erase, AI walls, Clear AI walls, Forget explored. Ends snap to other walls' ends and grid corners. `PATCH .../walls`, `POST .../walls/draft`.
- **Line of sight** (`fog.sight`): each player also sees what their own tokens have a clear line to (`sightPolygon`/`sightOf`/`canSee`/`fogMask` in `shared/src/map.js`); places seen before stay dimmed (`maps/sight.js`, `map_explored` table, schema v10, not archived on purpose: forgotten on rebuild). The DM's rectangles still apply outside sight. Players get `fog.mask` instead of the DM's rectangles and never get walls; their image is composited from the same mask (`maps/image.js`, cache 32). Players can't move their token through walls or closed doors.
- **AI walls** (`mapReader.walls`, purpose `map:walls`): polylines in thousandths of the image, ends within 1% joined (`joinEnds`). Replaces the AI's earlier draft; DM walls stay. New prompt, so `PIPELINE_VERSION` 5.
- Each player sees only from their own tokens (not shared with the party). No light or darkvision radius: sight is unlimited until a wall.
- Tests: 203 after merging main (server 91, shared 34, web 78): geometry, explored cells, the API (sight, doors, dim memory, forget, blocked moves, AI draft) and the page (drawing, doors, erase, line of sight, a player's view updating live). Checked once in headless Chromium with the castle map: sight polygon and blacked-out image line up. Not tried: the real AI drafting walls on a real map (accuracy unknown; expect to correct it), performance with hundreds of walls on a slow PC (first player image of a 2048 px map took ~0.3 s here).

### 2026-10-07: Doors players open, obstacles, and choices for unseen parts

- Owner's asks after trying the walls PR: doors should open (for players too), more options for what players get, and buildings in a courtyard visible but not walkable, then "an option for greyed out but not black".
- **Doors:** anyone clicks a door to open or close it (no tool needed). Players get `doors` (only those they can see) and may toggle one that isn't locked and is within a square and a half of their token (`POST .../doors/:wid/toggle`). The DM can lock doors (Lock mode; `PATCH .../walls {lock}`); opening one unlocks it.
- **Obstacles** (`walls[].kind: 'low'`, Obstacle mode): block movement, not sight. The AI draft now also returns `obstacles` (roof outlines, cliff edges, fences). Prompt changed, so `PIPELINE_VERSION` 6.
- **Unseen parts** (`fog.map`: dark, grey, shown): what players get outside their sight and the reveals; tokens there are hidden in all three. **Remember explored** (`fog.memory`) can be switched off.
- Tests: 206 (server 92, shared 36, web 78).

### 2026-10-07: Deluxe dice roller, and faster dice loading

- Owner's request: "a more fancy option, all the bells and whistles, the best we can find. Then optimize it as well."
- **`deluxe` roller** (`dice-deluxe.js`, `dice-physics.js`): own Three.js 0.186 scene and cannon-es physics (new server dependencies `three` and `cannon-es`, served at `/vendor/three/` and `/vendor/cannon-es.js` because the page's CSP only allows the server's scripts). The whole throw is simulated first (a few ms) and replayed; the symmetry of each solid turns the numbers so the server's one lands up (`symmetries`, `readDie`, `relabel` in `dice-lite.js`). Physical materials per style (metal, ice/glass, glitter, glowing), studio reflections, ACES tone mapping, soft shadows, engraved numbers, a pulse on crit/fumble/max, collision-timed sounds.
- **Optimised:** no physics during drawing; textures and materials cached; shaders compiled at load; adaptive quality tiers measured over the first frames (resolution, shadow map, transmission, shadows) and remembered per browser (`dndapp.dice.deluxe`).
- **Faster loading for every 3D roller:** library files are compressed once (brotli/gzip) with an ETag (`sendLibrary` in `app.js`): ~2.4 MB → ~414 KB (dice-box 700 → 140 KB). The tray preloads the chosen roller when it opens. First Deluxe roll ~1.7 s after the tray opens (was 4–5.5 s before preloading and compression).
- Checked in headless Chromium through the real app (CSP on): dice land on the server's numbers in every style; close-up screenshots of plain, gold, frost and astral with the crit glow. Not seen on a real GPU or phone.
- Not the default (still `quick`): owner's call.
- **Tests:** 211 after merging main (symmetry counts and relabelling for every die, physics landing 8 mixed dice and 30 d6 on the right numbers inside the table, Deluxe falling back to Lite without WebGL, vendor files served compressed with 304s).

### 2026-10-07: Initiative, Measure and spell templates on maps

- Owner asked what would make the maps competitive. Researched Foundry v13, Roll20, Owlbear Rodeo and Alchemy and ranked the gaps (write-up in the project files, `map-research/vtt-feature-gaps.md`; summary in SPEC §6.6 "Later"). Owner: "add them in order, start with 1 and 2".
- **Initiative** (`POST .../combat`, `combat` on the map document): start/end, next/back with rounds, add/take out, rolls by the server (NPCs and enemies: d20 + Dex from the stat block, read by `dexModifier`; player characters: d20 + their sheet's initiative), typed rolls, players roll once and end their own turn. Players only see visible tokens in the order. Turn order panel on the page, a ring on the current token.
- **Measure:** a local ruler (squares on a grid), plus the path line while dragging a token.
- **Spell templates** (`POST/PATCH/DELETE .../templates`, `templates` on the map document): sphere, cone, line, cube; from the player's own spells with an area (`spellArea`); caught tokens listed and lit up; owner or DM moves, turns, removes; fog hides other people's templates whose origin a player can't see.
- No schema or pipeline change (both live in the map's JSON document and its archived change lines).
- **Tests:** 225 (server `combat.test.js`, page `combat.test.js`, shared geometry and parsing). Not seen in a real browser.

### 2026-10-08: The rest of the map list: lights, pings, movement, variants, links, map events

- Owner: "Do the rest except number 8" (8 was ambient sound and weather). Same branch and PR as initiative and templates.
- **Darkness, lights and darkvision:** a Darkness switch (`fog.dark`), lights from presets placed by the DM (`PATCH .../lights`) or suggested by the AI wall draft, lights carried by tokens, darkvision per token. Players see lit places they have a line to plus their darkvision; lights never reach players. Lit areas are `{points, clip}` views, drawn with SVG clip paths on the server image and the page.
- **Pings and sketches:** `POST .../ping` and `.../draw`, sent live on the map stream, never saved; other players' only where you can see; Alt+click pings; 20 per 10 s.
- **Planned movement:** Space or W drops waypoints while dragging; the label shows distance, "difficult", and movement used this turn against the token's speed in a fight (shown, not enforced). Token PATCH takes `path` (walls checked on every leg). Difficult terrain (`PATCH .../terrain`, AI-draftable) costs double.
- **Map variants:** other pictures of the same map, stretched to its size; the original upload is archived too. Picker in the map bar; added and removed in Map settings.
- **Linked maps:** the DM places links (Link tool); clicking one takes the selected token (or a player's own character, from within 1.5 squares) to the other map, arriving at the link back.
- **Map events for the archivist:** `maps/events.js` turns a session day's archived map changes into lines (maps shown, fights, downs, conditions, doors, travel), skipping hidden tokens and unshown maps, and the archivist gets them as `<map_events>`. Archivist prompt changed, so **`PIPELINE_VERSION` 6 → 7**.
- No schema change (all in the map's JSON document). Context now creates sheets, pictures and maps before the archivist.
- **Tests:** 243 (server 101, shared 49, web 93): `lighting`, `signals`, `travel`, `mapevents` on the server; `map-more.test.js` on the page. Not seen in a real browser; the AI's lights and difficult terrain not tried with the real AI.

### 2026-10-08: Archivist tab, shared rolls, editable notes, token pictures, handouts, sheets for the archivist

- Owner asked what to add next; from the list he picked: a place for corrections and the archivist's questions, shared dice rolls, editing and deleting notes, pictures for NPC and enemy tokens, and handouts. He added: "The AI should get the sheet when it's made to add to the archive, and it should get any changes as well as when that change happened." Branch `claude/project-thread-j47qg5`, one PR.
- **Archivist tab** (DM only, `web/public/dm.js`, renamed `archivist.js` on 2026-10-08): the archivist's open questions (answer or dismiss; an answer becomes a correction), a correction box, earlier corrections. The API already existed; the open-question count shows on the tab. The rest of the DM screen stays on hold.
- **Shared rolls:** `POST /roll` takes `label` and `visibility` (`party` default, `dm`, `self`), stores the roll (`rolls`, operational, not archived) and sends it on a new campaign live stream (`GET /campaigns/:cid/live`). `GET /rolls` gives the last 50 you may see. The tray has "Who sees my rolls" (the DM: Everyone or a secret roll) and a "Table rolls" list; others' rolls pop up briefly. Default picked: rolls go to everyone unless you choose otherwise.
- **Notes:** `PATCH` / `DELETE /notes/:id` for your own; edits and deletes are new lines in the archive (restore replays them); deleted notes leave search and the archivist's reading. Edit and Delete on each note on the page.
- **Token pictures:** the DM gives NPC and enemy tokens a picture (optionally every token on the map with the same name); archived under `maps/<id>/tokens/`; the token's `art` stays on the server, the page gets `picture`; served only to people who can see the token.
- **Handouts** (`src/handouts.js`, `web/public/table.js`): title, text and/or picture, to everyone or chosen players, live, archived (`handouts/<id>/`), restored. Players never learn who else got one.
- **Sheets etc. for the archivist** (`kb/updates.js`, job `updates`): new sheets in full and each later change with its save time (same-field saves within 10 minutes merged), notes written/edited/deleted after their session was processed, and handouts. Runs after a 10-minute quiet spell (`ARCHIVIST_UPDATES_DELAY_MINUTES`), on start-up if anything is waiting, and between sessions in a rebuild (in time order). No AI call when nothing changed. The archivist is told sheet-only facts stay with their player. Prompt changed: **`PIPELINE_VERSION` 7 → 8**. New `sessions.processed_at` tells late note changes from ones the session run already saw.
- **Privacy note:** DMs see every knowledge-base record, so the DM can now learn sheet details through Q&A, the same as with private notes (already deferred with the DM role).
- **Schema v11:** `handouts`, `rolls`, `archivist_marks`; `player_notes.edited_at/deleted_at`; `sessions.processed_at`.
- **Tests:** 261 (server 112, shared 49, web 100): `table.test.js` and `updates.test.js` on the server, `table.test.js` on the page, plus note editing in `app.test.js`. The page tests' fake fetch now treats `/live` as a live stream. Not seen in a real browser; the real AI hasn't read a sheet or its changes yet.

### 2026-10-08: The sheet beside the map, or in its own window

- Owner: switching between the Map and Sheet tabs is a pain; have the sheet on the same page, or pop it out to a new window. Both built; the player picks (`web/public/sheet-place.js`).
- **Beside the map:** a Sheet button on the map bar shows the sheet to the right of the map (Hide in the sheet's bar, or the button again, takes it away). A handle between them resizes it (drag, or arrow keys; the map keeps at least 320 px). Below 760 px wide the sheet goes under the map instead. The choice and the width are saved per browser. The sheet's layouts already use container queries, so it rearranges itself for the narrower space.
- **Its own window:** Sheet window (map bar) or Pop out (sheet bar) opens the page at `/?view=sheet&campaign=<id>`, which shows only that campaign's sheet (no tabs; chats, notes and maps aren't loaded). A blocked pop-up is explained. Opening it turns off the sheet beside the map.
- **Two windows:** after each save the page tells its other windows (BroadcastChannel `dndapp.sheet`); one with nothing waiting to save loads the newer sheet. With changes waiting, the existing conflict question still decides.
- No server, schema or pipeline change. **Tests:** 266 after merging main (web 105; `sheet-place.test.js`, and `page.js` now stands in for `window.open` and BroadcastChannel and takes a `path`). Layout checked once in headless Chromium (side by side at 1400 px, stacked at 600 px); not tried on a real phone.

### 2026-10-08: The DM's creatures (saved enemies and NPCs)

- Owner: can the DM pre-make enemies and NPCs, save them and add them to the map? That makes more sense for the DM than a character sheet tab. Before this, the DM made each token by hand on each map and nothing was kept for reuse.
- **Creatures tab (DM only, in place of the Sheet tab):** New creature (name, enemy or friendly NPC, size, colour, max HP, AC, speed, darkvision, stat block, notes, picture; an empty stat block is filled by the AI from the name), a filter, and on each: Place on map, Edit, Stat block / Stat block (AI), Picture, Remove. The DM's map has no "Sheet" button. Players keep their Sheet tab and never see Creatures.
- **On the map:** Add token has "From your creatures"; picking one (or Place on map) asks how many (1-20) and whether hidden. They go in a row, numbered when there are several, carrying on from tokens already named so. Each gets the creature's picture (copied once into the map's `tokens/` folder), stat block, HP and the rest. A selected NPC or enemy token has "Save to creatures".
- **Server:** `src/creatures.js`, `creatures` table (schema v12), archived as `creatures/<id>/changes.jsonl` plus pictures, restored on start-up. Routes in README. Not read by the archivist; no `PIPELINE_VERSION` change (no prompt or schema change; the AI stat block lookup is the existing one).
- **Defaults picked (not asked):** the DM's sheet is hidden rather than deleted (its data stays); placed tokens don't follow later edits to the creature; no link back from token to creature.
- **Tests:** 277 (server `creatures.test.js` 7, `db.test.js` v11→v12; web `creatures.test.js` 3). Not tried in a real browser or with the real AI.

### 2026-10-08: Find a creature online

- Owner: the DM should be able to ask the AI to find a creature online, even an unofficial one, and pull it in with a picture.
- **Find online** (Creatures tab): the DM types what they want; the creature appears at once as "searching", and the page checks every 3 s. The AI searches and reads web pages (`llm.research`, a new method on both providers: Claude Code with only WebSearch/WebFetch allowed; the API with `web_search_20260209`/`web_fetch_20260209` and `pause_turn` handling), then a structured call tidies the notes into fields (`src/creatures-find.js`). It shows the source as a link (official or unofficial) and its stat block is marked as found on the web. "Search again" and "Cancel"/"Remove" on the card.
- **Pictures from the web** (`src/net/fetch-public.js`): the server, on the owner's PC, downloads pictures from addresses the AI found, so it only goes to the public internet: http(s), ports 80/443, no logins in the address, every name lookup (and each redirect, up to 3) must give a public address (no 127/8, 10/8, 192.168/16, 172.16/12, 169.254/16, 100.64/10, IPv6 local ranges, and so on), 10 MB, 15 s. Each candidate is checked to be a real picture; the first that works is kept, archived like an upload.
- Background job; a restart mid-search marks it failed (`creatures.failInterrupted`). Counts against `MAP_AI_PER_HOUR`. `PIPELINE_VERSION` 8 → 9 (new prompts).
- Note: with Claude Code, WebFetch runs on the owner's machine like the rest of Claude Code; it only returns page text to the model, which ends up in a DM-only stat block.
- **Tests:** 282 (server: `isPublicAddress`, `fetchPublic` refusing local addresses, the find flow, not found, can't place while searching, restart; web: the searching card turning into the found creature). Not tried with the real AI or real sites.

### 2026-10-08: More layout options and personal touches

- Owner: "more layout options, more customizability". Six additions, all per browser and set under **Look**, which now has groups (Page, Ask, Sheet, Map) so it stays short on a phone. No server, schema or pipeline change.
- **Any panel beside the map:** the map bar's Sheet button became a "Beside the map" menu: nothing, Sheet, Ask, Notes, Handouts, or (DM only) Archivist. Saved as `dndapp.beside`; the old `dndapp.sheetBeside` still counts as "Sheet". The Hide button on the sheet bar went (the menu does it). Ask beside the map always uses the chat drawer, even in the sidebar layouts. Handouts beside the map count as seen.
- **Which side:** Look → Map → Beside the map: right (default) or left; the handle widens it towards the map either way. On a phone it goes under the map (above it when "left"), and the map shrinks rather than pushing its toolbar out of sight.
- **Map toolbar:** above the map (default), below it (main bar nearest the bottom edge, for thumbs), or down the left side (below the map on a phone). The three map bars are now wrapped in `.map-bars`.
- **Map tools:** untick the ones you never use (Grid, Fit, Pin, Measure, Ping, Draw, Template, Initiative, Sheet window; each has `data-tool`). The DM's own tools always show for the DM.
- **Tabs:** reorder, hide (never all, nor all but the DM's Archivist), and pick the start tab. Hiding the tab you're on moves you to the first tab shown.
- **Token names:** always, when pointed at or picked, or never.
- **Accent colour:** your own, over any theme, with black or white text worked out to read on it. Printing still goes black and white.
- Merged with the DM's Creatures (PR #15): Creatures is one of the tabs to order and hide, and can go beside the map for the DM (the DM has no Sheet, so "Sheet beside" isn't offered to them). A tab someone doesn't have (the DM's Sheet, a player's Archivist or Creatures) is never the one they land on.
- `look-boot.js` now cleans every saved value (unknown tabs and tools are dropped; new tabs are added to the end of a saved order) and sends a `dndlook` event on change.
- **Tests:** 288 after merging main (web 115; new `test/layout.test.js`, and the look and sheet-place tests updated). Checked once in headless Chromium (left toolbar with Ask on the left at 1400 px, bottom toolbar with hidden tools, phone with the side panel stacked, the Look dialog's Map group on a phone); no console errors. Not tried on a real phone.
### 2026-10-08: A thorough AI wall draft, curved walls, .dd2vtt files, hideable walls

- Owner picked "the cheap four plus .dd2vtt" from the options (`/mnt/project-files/walls-doors/ai-walls-options.md`), then added: the AI struggles with round walls, the DM should be able to hide walls so the map looks clean, and "it is worth being expensive about this part" (maps are set up once).
- **AI draft** (`maps/read.js` `walls()`): a ruler drawn round the AI's copy (`withRuler`); a check pass with the draft drawn over the map (`withDraft`, purpose `map:walls-check`); maps over 1800 px checked in up to 3 × 3 overlapping close-ups, each keeping what lies in its own part; `curves` (arcs through 3 points) and `circles` in the schema and prompt; `tidyWalls` straightens (4°), joins ends (1% or a third of a square) and puts straight walls' ends on the grid (within 0.3 square); curves keep their shape. New LLM task `walls` (`MODEL_WALLS`, falls back to `MODEL_MAPS`; `EFFORT_WALLS`, default `max`). `PIPELINE_VERSION` 10 → 11 (main took 10 for the book lookups). After the housekeeping split (PR #16) the server side is in `routes/maps.js` and the page side in `map.js`, `map-state.js` and `map-templates.js`.
- **Curves:** `arcThrough` and `circlePoints` in `shared/src/map.js`; walls carry an optional `group` (pieces of one curve); walls PATCH takes `curve` and `circle`; `remove` takes the whole group. Curve and Circle tools on the page.
- **Universal VTT** (`maps/uvtt.js`): a `.dd2vtt`/`.uvtt` imported as a map (its picture, exact grid, 5 ft squares, walls, doors, lights; the AI still names and describes it but doesn't replace the grid), or added to a map (`POST .../walls/file`, stretched to the picture). `source: 'file'` on walls and lights (`WALL_SOURCES`).
- **Hide walls:** a Walls tick box in the DM's map bar (`dndapp.map.showWalls`); unticked, walls, obstacles and lights aren't drawn unless Fog & walls is open.
- **Tests:** 298 after merging main (new `server/test/walls.test.js`: tidying, close-ups and fallbacks, Universal VTT parsing and import, curves and circles; web: curve, circle, erase, hiding, walls from a file). The ruled picture and the check overlay were looked at once as images. Not tried with the real AI.

### 2026-10-08: Doors look like doors; the DM locks them with a click

- Owner: "DM should be able to lock and unlock doors. Doors should be more obvious as doors." Locking already existed (the Lock tool in Fog & walls, PR #9) but was easy to miss.
- **Door bar:** outside the drawing tools, a DM click on a door picks it (`state.selectedDoor`) instead of opening it; the bar under the map says Closed / Open / Locked, with Open/Close, Lock/Unlock, Remove and ✕. Uses the existing `PATCH .../walls` (`toggle`, `lock`, `remove`). Players still open a door with a click.
- **Drawing:** `doorShape()` in `map.js`: light posts across both ends of the doorway, a thick amber plank with a dark seam, and a round badge in the middle (a door glyph, or a red padlock when locked). Open: a dotted doorway, the door swung 90° from its first end, and a dotted swing arc. The picked door's posts turn gold. Same for players (they only get the doors they can see, as before). Picture: `/mnt/project-files/walls-doors/doors-closed-locked-open.png`.
- **Server:** the DM opening a locked door through `POST .../doors/:wid/toggle` now unlocks it, as the walls PATCH already did.
- **AI walls:** the owner asked how to improve them; nothing changed in the draft yet. Options and a recommendation are in `/mnt/project-files/walls-doors/ai-walls-options.md`. No prompt change, so `PIPELINE_VERSION` stays.
- **Tests:** 289 (web: the DM picks a door, locks, unlocks, opens, closes, locking an open door closes it; the player sees the padlock). Looked at once as a static render in headless Chromium.

### 2026-10-08: Housekeeping: contradictions, duplicates, dead code, file splits, dice cut to two, docs brought up to date

- Owner asked for an audit ("where things are bloated, where we have stubs, where things contradict"); report in the project files, `audit/housekeeping-audit-2026-10-08.md`, items 1–19. Then: "Tidy it all up, except the dice and layouts … SPEC and HANDOFF haven't been kept up to date. These are EXTREMELY important." Then: "just keep the classic and deluxe 3D dice, scrap the rest of the dice". Layout options (item 18) left alone, as asked. Branch `claude/project-thread-cuyr7n`, one PR.
- **The DM's old sheet (bug-level):** PR #15 had only hidden the DM's Sheet tab. Now the DM gets no Sheet window, the page never loads a sheet for them, the server answers 403 to `/sheet` and character pictures for the `dm` role, and `kb/updates.js` skips sheets of anyone who is a DM in that campaign. Nothing in the archive was touched.
- **Fix:** stat blocks found online kept `source: 'web'` on the creature but became `manual` when placed on a map (`normalizeStats` in `shared/src/map.js` didn't allow `web`). Now kept, and the map's stat block dialog says "Found on the web by the AI; check it" like the Creatures tab.
- **One copy of things that were written two or three times:** the stat block dialog (`web/public/stat-block.js`); the markdown cleaner (`web/public/markdown.js`, the strict allowlist Q&A already used, now also for stat blocks and records); picture checks and token squares (`server/src/images.js`; maps now have their own pixel limit, 250M, other pictures 100M); the citation regex (`shared/src/citations.js`, served to the page).
- **Dead code removed:** `llm.text()` (both providers), `groupIntoSections`, `ROLES`, `HEALTH`, `roleLabel` in `admin.js`.
- **Files split, no behaviour change:** the server's API went from one 2,468-line `app.js` to `app.js` (370 lines: plumbing, access checks, live streams) plus `src/routes/` (accounts, campaign, characters, table, maps, combat, creatures). The Map tab's `map.js` (2,204 lines) lost the DM's tools, initiative and templates to `map-dm.js`, `map-combat.js`, `map-templates.js`, with shared state in `map-state.js`. `dm.js` renamed `archivist.js`.
- **Dice:** only `deluxe` (now the default) and `classic`. `dice-quick.js` deleted; `dice-lite.js` became `dice-shapes.js` (just the solids and the relabelling maths Deluxe uses). If the chosen roller can't start, the other is tried, then the result just appears. A browser that had picked a removed roller goes back to the server's choice. `DICE_ROLLER` accepts `deluxe` or `classic`.
- **Skipped on purpose:** reordering `style.css` (item 19) would have let `#app-view.beside` override the print rule `#app-view.wide`; not worth the risk with no visible gain. The pricing entry for `claude-haiku-4-5` in `config.js` stays (harmless, and useful if a model setting points at it).
- **Docs:** SPEC checked line by line against the code (v0.15: repo layout, tables incl. `map_explored`, archive tree incl. character pictures and map variants, `PIPELINE_VERSION` 9, the WebSearch/WebFetch exception in the lockdown, rolls, dice rollers, the DM's missing sheet, map events in the privacy table). HANDOFF "Current state" and "Next steps" rewritten from scratch (they still listed merged PRs as drafts). README's security, Maps, Data, API and dice sections fixed.
- No schema or `PIPELINE_VERSION` change (no prompt changed).
- **Tests:** 286 (server 124, shared 49, web 113). New: the DM gets 403 for a sheet, a DM's sheet makes nothing pending for the archivist, the DM's page has no Sheet window and asks for no sheet, map pixel limits, Deluxe as the default and a removed roller falling back. Removed with their code: Quick, Lite and Flat roller tests, `groupIntoSections`.

### 2026-10-08: Book lookups checked on the real books, and fixed

The owner asked to double-check how the AI looks things up in the books ("this really needs to work well"). Tried on his two PDFs from `DND books` (`Players Handbook 5th Edition DD.pdf`, a 2014 scan; the 2024 Dungeon Master's Guide, an OCR'd scan with a long download file name) with many rules searches. The 2014 PHB worked (right pages, right printed page numbers). The DMG didn't:

- **Words broken by the OCR layer.** pdf.js gives that scan's text in pieces ("H" + "eavy", "doesn" + "’" + "t", spaces as items), and every piece got a space, so "Heavy" was "H eavy" and hyphenated words split wrongly. `pdf.js` `joinItems` now puts a space only where the print has a gap (12% of the font size). 25% less text per page too. Headings that the OCR itself split ("Heavy Precip itati on") are matched with spaces removed, for short lines and headings.
- **Wrong page numbers.** Its page numbers are in running footers ("CHAPTER 2 | RUNNING THE GAME 45"), not on lines of their own, so every DMG citation was 5 pages off. Footer numbers are now used when no page has a number on its own line.
- **A long contents was cut in half** (698 bookmarks, 21k characters, over the 10k tool limit), hiding the later chapters. Now the deepest levels are dropped until it fits, with a note to ask for a page range.
- **Citations used the download name** ("Dungeon Masters Guide (2024) -- Christopher Perkins -- … -- Anna’s Archive"). Titles now stop at " -- ".
- **Mixed editions.** The PHB is 2014, the DMG 2024, and nothing told the AI. Each book's "First Printing" year is now read and listed; the prompt explains 2014 vs 2024 rules, never to mix them, and uses the group's edition, taken from their Player's Handbook (`groupEdition` in `qa/agent.js`; both or neither: the records decide, else it says which edition).
- **Rules questions came from memory.** The prompt answered general rules questions from the model's memory and only used the books when the wording mattered. Now every rules question is looked up in the books when there are any (search in the first turn, read the page before answering, follow index hits, read two pages when a section runs on). Without books, nothing changes.
- **Smaller things:** "AC", "HP", "hex" and other terms of 3 letters or fewer match whole words only ("AC" found "action"); a heading that is the search term counts much more (Hex the spell now beats the DMG's pages about hex grids), bookmarks count as headings; an unknown book name or an ambiguous one ("Player's Handbook" with both editions) now returns an error naming the books instead of an empty search, which read as "not in the book"; `read_book` returns two full pages (it was cut at 10k characters); a PDF with mostly empty pages is logged at start-up as needing OCR; spell lookup reads the 2024 layout ("Level 3 Evocation (Wizard)") and skips class sections that looked like spells ("Arcane Trickster Spellcasting", "Cantrips").
- `PIPELINE_VERSION` 9 → 10 (Q&A prompt). Tests: 4 new in `books.test.js` (290 in all after the housekeeping merge).
- **Not checked:** the real AI with the new prompt, and how much time the extra lookup adds.

### 2026-10-09: Merchants and items

- Owner: "merchant tokens… the DM can set up and add items to. The items list will work similar to the creatures tab. You can add custom items, pull in items from books, or from the web. Merchants can then have these items, with a stock level and price, that players can buy on their own… restock every x number of long rests." (Long and short rests, hit dice and rolling from the sheet went to other threads.)
- **Items** (DM tab, `src/items.js`, `src/items-find.js`, `web/public/items.js`): like Creatures. Look up by name checks the DM's own items first, then the books (keyword search for the name, the AI copies the entry from that page and the next, `item:book`), then the AI's knowledge (`item:ai`), the same order the "Saved enemies and NPCs" thread gave creatures' stat blocks (PR #20). Find online as for creatures (`item:find`, `item:tidy`), with a picture. Prices are kept in copper pieces.
- **Merchants** (DM tab, `src/merchants.js`, `web/public/merchants.js`): stock lines (item, price, how many left or no limit, restock level), open or closed, notes, picture, colour, the last 50 sales. "Add item" accepts any name and looks it up if it isn't in Items. Placed on a map as an NPC token with `merchant: <id>` and a gold ⚖ badge.
- **Buying:** a player picks the token, presses Shop, and buys. Defaults picked (the coordinator's, not asked): buying takes the price from the sheet's coins automatically (big coins first, with change, `payCoins` in the new `shared/src/coins.js`) and adds the item to the sheet's equipment text ("Potion of Healing x3" when it's already there), as a new sheet version with the reason; the stock goes down. Both happen with no waiting in between, so two players can't buy the last one. The page saves the sheet first and reloads it after. Not built: selling back.
- **Restocking:** every N long rests per merchant, or "Restock now". Built on the rests branch (PR #22): `context.js` listens to `rests.events` and each long rest the DM calls (one call is one party rest) counts via `merchants.longRest`.
- Shared storage for items and merchants (`src/library.js`: a row per entry, the whole entry archived on each change, pictures as uploaded); `archive.js` got `items/` and `merchants/`; restore brings both back. New tables `items` and `merchants`, schema v13 → v14 (after the rests table). `PIPELINE_VERSION` 11 → 12 (new prompts). The live stream sends `merchant {id}` on any change. Items and Merchants are tabs to order, hide and put beside the map under Look.
- **Privacy:** players only see a shop while one of its tokens is on a map they can see (shown, not hidden, in their sight), and never notes or sales.
- **Tests:** 326 with the rests branch merged in (server: `merchants.test.js`, 9 tests, plus the v13 → v14 migration; shared: `coins.test.js`; web: `merchants.test.js`, 3 tests; the tab-order tests updated for the two new tabs). Not tried with the real AI, the real books or in a real browser.
### 2026-10-09: Long and short rests, spending hit dice

Owner's request: "a long rest and short rest feature. And a way to spend hit die", plus merchants that restock "every x number of long rests" (another thread), which needs a long rest to hook into.

- **Rules** in `shared/sheet.js` (pure): hit dice kept per die size (`hit_dice_spent`, replacing `hit_dice_used`; old sheets are converted, biggest die first); `spendHitDie` (die + Con, never negative, up to max), `shortRest` (Pact Magic), `longRest` (HP, temp HP, slots, death saves, hit dice: half at least one under 2014, all under 2024; nothing at 0 HP under 2014).
- **Server:** `rolls.js` (rolling, logging and sending a roll, moved out of `routes/table.js` so other features can roll), `rests.js` and `routes/rests.js`: `POST /sheet/hit-dice`, `POST /sheet/short-rest` (players), `GET`/`POST /rests` (the DM calls one for everyone or chosen players). The edition comes from `REST_RULES` or the group's PHB (`handbookEditions` in `sheets/books.js`, now shared with Q&A's `groupEdition`, same wording). Sheets are saved with a reason. Rests the DM calls are archived (`rests.jsonl`), mirrored in `rests` (schema v12 → v13), restored, sent live (`rest` on `/live`) and counted (`rests.count`, `rests.events`). Who got nothing (0 HP) is only told to the DM and that player.
- **Page:** the Hit dice box has a row per die size with ticks, how many are left, Spend (rolls through the dice tray, so the 3D dice show it) and Short rest; the DM's Rest button in the header opens a dialog (who rests, Short or Long, which rules, recent rests); players get a note and their sheet reloads (`web/public/rests.js`, `restCalled` in `sheet.js`, `showToast` in `dice.js`).
- No AI prompt or schema changed, so `PIPELINE_VERSION` stays 11. Tests: 12 new (server 5 in `rests.test.js` + the v13 migration, shared 3, web 3 in `rests.test.js`), 310 in all.
- **Not checked:** the page in a real browser (only jsdom), the 3D dice for a hit die (same path as other rolls), the archivist's reading of rest changes with the real AI.

### 2026-10-09: Stat blocks look like stat blocks, and come from the books first

The owner sent a screenshot of a creature's Edit dialog: the stat block was raw Markdown in a plain text box (`###`, `**Armor Class**`, a pipe table).
- **Edit dialog** (`web/public/creatures.js`): a saved stat block now shows formatted, through the same cleaner as everywhere (`markdown.js`). "Edit text" swaps in the Markdown box (taller now) and "Show stat block" swaps back with the changes. A new creature, or one without a stat block, starts with the empty box as before. Saving is unchanged.
- **Look** (`style.css`, class `stat-block`): red name in small caps, red rules above and below, red headings for sections like Actions, red labels, the ability scores centred between thin rules, on a light parchment tint. Used in the Edit dialog and in the "Stat block" dialog for creatures and map tokens. Uses the accent colour, so it follows the theme.
- Tests: 2 new in `web/test/creatures.test.js`.
- **Books first for creatures** (owner, same day: "Make sure the AI looks here for creatures as well, and prioritizes getting them from here", read as the group's books). `books.findCreature` finds a creature's printed stat block (a name line, a size-and-type line, then Armor Class or the 2024 "AC" a few lines on; OCR-tolerant like spells; "Goblin 3" and "a goblin" find the Goblin). "Stat block (AI)" on creatures and tokens copies it from the page (`map:stats-book`) and only falls back to the AI's memory when no book has it; Find online uses the book's stat block and searches the web only for a picture (`creature:find-book`). Stat blocks keep `source: 'book'` and `from` ("Monster Manual, page 166"), shown on the creature card, in the Stat block dialog and in the status line. `PIPELINE_VERSION` 11 → 12 (new prompts). Tests: 3 server, 1 page. Not tried on a real Monster Manual: the owner's books folder had none on 2026-10-08.
- **The DM's creatures beat everything** (owner, minutes later: "'Here' means the creatures tab. If the DM has outlined stats for a creature specifically, that takes priority over any other material", and pulling a creature in still tries the books first). "Stat block (AI)" on a token or creature now first copies the stat block of the DM's own creature of that name (`creatures.withStats`: "Ogre 3" or "an ogre" match "Ogre"; never the creature being filled), with its hit points and size and no AI call; then the books; then the AI's memory. Find online is unchanged (books, then the web). 1 more server test (305 in all).
- **Ask uses the DM's creatures** (owner: "If the DM asks about a creature, the AI should prioritize the creatures the DM has saved"). When the asker is the DM, the Q&A system prompt lists their creatures with that rule, creatures named in the question go in full after it, and a `get_my_creatures` tool fetches others (`qa/tools.js`). Players get none of it (tested). 1 more server test (306 in all). Not tried with the real AI.  Checked once in headless Chromium for layout; not yet seen by the owner in his browser.

### 2026-10-09: Rests, merchants and stat blocks merged; rules edition per campaign noted

- The owner OK'd merging rests (#22) and merchants (#23). `main` had moved on with #20 (stat blocks), so it was merged into the merchants branch first: `context.js` passes the DM's creatures to Q&A, stat blocks and Find online as #20 does, and wires items and rests as before. Both #20 and the items prompts had bumped `PIPELINE_VERSION` to 12, so it is now **13**. Schema v14. 334 tests.
- Owner, about the rules edition (rests follow 2014 or 2024 from `REST_RULES` or the group's PHB): "We WILL want to have a setting to toggle this, per campaign." Noted in SPEC §6.2, §6.8 and §9 (open questions: where the setting lives, whether Q&A and sheet rules follow it, what happens to sheets when it changes) and next step 0; not built.

### 2026-10-09: Rolling attacks and stats from the character sheet

The owner asked for "a function to roll attacks from the character sheet, as well as other stats". Most of it was already there (since the dice, 2026-10-07): clicking a save, skill, ability, initiative or spell attack rolls it, each attack has a roll button (to hit, then damage, doubled on a natural 20), death saves have one, and every roll goes through the chosen roller and shared rolls. It was easy to miss and didn't work well on phones or with the map's fights. This adds:

- **Initiative goes into the fight.** `POST /campaigns/:cid/roll` takes `initiative: true`: the total goes into every fight on a map the player can see where one of their player character tokens hasn't rolled yet (`joinFights` in `routes/table.js`; the entry's `mod` is the total minus the kept d20). The notation may be left out (d20 + the sheet's initiative, `sheetInitiative` in `routes/combat.js`, shared with the combat route). The sheet's Initiative sends it; so does a player's Roll button in the turn order (`map-combat.js`), which used to roll on the server with no dice shown and nothing in the shared rolls. The DM's rolls for tokens are unchanged. The result card says which map it went into.
- **Next d20 on the sheet bar:** Normal / Adv. / Disadv. buttons (`modeButtons` in `dice.js`, kept in step with the tray's), since Shift- and Alt-click don't exist on phones.
- **Rollable names are underlined with dots** all the time (accent colour on hover), not only on hover; not when printed.
- No schema or `PIPELINE_VERSION` change. Tests: 299 (server 135, shared 49, web 115); new server test for initiative from the dice, and the sheet and map turn-order page tests extended.
- **Not done here:** automatic attack bonuses and spell rolls (done in the next entry), hit dice (left to the rests work).

### 2026-10-09: Attack bonuses and spells roll with their modifiers

The owner, on the first version of PR #21: "No, we want bonuses to apply. And we want spells to be handled too. For this, we want a roll to hit option and a roll for damage option. If an attack is a saving throw instead, it just needs a roll for damage. Rolls for both should account for modifiers."

- **New `shared/src/rolls.js`** (served at `/shared/rolls.js`): `attackRolls` and `spellRolls` give the to-hit roll, the DC and the damage roll with the sheet's numbers; `addToRoll` merges dice and numbers ("1d8+2" + 3 = "1d8+5", "8d6" + "2d6" = "10d6"); `splitDamage` splits "1d8 slashing".
- **Attacks** (`normalizeAttack`, `newAttack`, `WEAPONS` in `sheet.js`): kind (attack roll or saving throw), ability (an ability, finesse, spellcasting, or "as written"), proficient, magic bonus, save ability, DC. To hit and DC are worked out unless typed. Old attacks load as "as written", so they roll exactly as before. Picking a PHB weapon fills in damage and ability. Each row has a d20 (to hit, damage offered after) and Dmg; a save attack has Dmg only, labelled with its DC.
- **Spells** (`normalizeSpell`): new `attack`, `save`, `damage`, `damage_mod`, `higher_damage`, read from the description by `guessSpellRolls` (checked on Fireball, Fire Bolt, Cure Wounds, Healing Word, Sacred Flame, Thunderwave, Guiding Bolt, Hold Person and others from the SRD list) for spells added, looked up, or saved before; editable in the spell's details. The spell row has a d20 for spell attacks or the DC for saves, a slot level when it does more cast higher, and Dmg/Heal. Cantrips scale with character level.
- No server API, schema or `PIPELINE_VERSION` change (no prompt changed; the upload's AI schema is unchanged, so uploaded attacks are "as written"). Saved sheets gain the new fields the next time they're saved.
- Tests: 307 before merging main (343 after: server 156, shared 61, web 126). New: `shared/test/rolls.test.js` (6), page tests for weapon attacks, save attacks and spells.
- **Not checked:** the layout in a real browser (jsdom only).

### 2026-10-09: Inventory tab: items looked up, equipped, and seen by the DM

The owner: "Players shouldn't have to choose proficiency each time. I think what we are missing is a weapons tab. Players should be able to search a weapon, similar to the creatures tab. In fact, not just weapons. Any items. And when they equip one (and they should be able to equip multiple of SOME things. Two daggers, but not two armours) then they should toggle if they are proficient in it or not. The DM should be able to see what they have equiped to prevent cheating."

- **New `shared/src/gear.js`** (served at `/shared/gear.js`): the PHB weapons (moved from `sheet.js`, now with category and properties) and armour tables, class proficiencies (`CLASS_GEAR`), `itemStats` (stats from the tables by name, with "+1", or read from a description), `normalizeInventory` (one body armour and one shield equipped, the newest winning), `armorClass`, `addToInventory`. `rolls.js` gained `gearRolls` (with the versatile two-handed damage).
- **Sheet:** a new `inventory` list (`normalizeSheet` cleans it on both sides). AC is worked out from equipped armour and shield (Unarmored Defense still counts when better). Equipped weapons show at the top of Attacks with their own roll buttons; typed attacks lost their Proficient tick (the saved value still counts).
- **Inventory tab** (players; the DM has none): Look up and add, Add by hand, rows with how many, Equipped (a count for weapons you have several of), Proficient, Attuned, and Details. Also a choice for "Beside the map", tab order and the start tab.
- **Server:** `GET /campaigns/:cid/gear/lookup?name=` (tables, then the books and the AI through `itemFinder.lookup` with `own: false` so the DM's items stay secret, counted in `SHEET_AI_PER_HOUR`); `GET /campaigns/:cid/gear/equipped` (DM only: equipped gear, AC and attacks, nothing else from the sheets). Buying from a merchant now adds to the inventory (`addToInventory`) instead of the equipment text; `addToEquipment` was removed.
- **DM:** "What the players have equipped" under the Items tab, with Refresh.
- No schema or `PIPELINE_VERSION` change (no prompt or AI schema changed; the archivist gets the inventory with the rest of the sheet).
- Tests: 352 (server 158, shared 66, web 128). New: `shared/test/gear.test.js` (6), server tests for the lookup and the DM's view, page tests for the Inventory tab and the DM's list.
- **Not checked:** a real browser or phone, the AI lookup with the real AI.

### 2026-10-09: Weight limits, charges, attunement, magic item effects; campaign settings

The owner, on the Inventory's "not built" list (encumbrance, charges, the attunement limit, magic item effects): "Build all those. But the campaign setting should have an option to ignore weight limits."

- **Campaign settings:** new `campaign_settings` table (schema v15, no migration: created by `schema.sql`), `shared/src/settings.js`, `store.getSettings` / `setSettings` (archived as `settings.json` with history, restored, `store.events` 'settings' sent on the live stream), `PATCH /campaigns/:cid/settings` (DM), settings in `GET /me` and `GET /campaigns/:cid`. Page: `campaign-settings.js`, the DM's Settings button and dialog.
- **`gear.js`:** PHB weights and armour Strength/Stealth in the tables; `itemCharges`, `itemEffects` (read from descriptions), `activeEffects`, `carriedWeight`, `encumbrance` (capacity / variant / ignore, Powerful Build), `attunementLimit`, `normalizeInventory` keeps at most that many attuned. Lines gained `charges` and `effects`.
- **`sheet.js`:** `computeSheet(sheet, settings)` applies effects (scores, saves, AC, unarmoured AC, speed, initiative, spell attack and DC), heavy armour's Strength rule and the weight rule to speed, and lists disadvantages; `rollDisadvantage`. The server passes the campaign's settings wherever it works a sheet out (maps' token speed, the DM's equipped view, the archivist's sheet text, which now lists the inventory too).
- **Page:** the Inventory tab shows weight and attunement, a warning when slowed; rows have charges (Use 1, Recharge with a roll), weight, charges and effects under Details; refusing a fourth attunement. The sheet shows "19 with items" under a score and a note under Speed; sheet rolls with disadvantage are sent that way (`roll(..., { disadvantage })` in `dice.js`).
- No `PIPELINE_VERSION` change (no prompt or AI schema changed; the archivist's sheet text gained an Inventory line).
- Tests: 361 (server 160, shared 70, web 131).
- **Not checked:** a real browser or phone; real AI lookups of magic items (whether their descriptions use the wordings `itemEffects` reads).

### 2026-10-09: PR #21 merged

The owner said "Merge". PR #21 (rolling from the sheet, the Inventory tab, weight, charges, attunement, magic item effects, campaign settings) is merged into `main`; this file was updated to say so in the PR's last commit. The database goes to v15 on the next start.

### 2026-10-09: Full screen map

The owner asked: "We want to be able to full screen the map with the tools still visible. Buttons here should be partly see through." A **Full screen** button on the map toolbar (`map-full.js`) puts the whole page full screen (the document, not just the map, so dialogs, dice and the panel beside the map keep working) and sets `data-map-full` on `<html>`. CSS hides the top bar, lets the map fill the screen and floats the toolbars over it in the place chosen under Look; tools are at 0.55 opacity and go solid on hover or focus, and pressed tools stay solid. The turn order and the selection bar move clear of the toolbars (their size is measured into `--bars-h` / `--bars-w`). Without the Fullscreen API (iPhone) the map still fills the window. Escape, the button, the browser leaving full screen or another tab puts it back. `fullscreen` is a hideable tool under Look. Also tidied two duplicated lines in SPEC §3.1's page file list. 4 new tests (`packages/web/test/map-full.test.js`), 365 in all. Not tried in a real browser.

Same day, the owner: "We don't want so many buttons all out at once." In full screen only the main tools show (Fit, Measure, Ping, Draw, Template, Initiative, Exit full screen, and any tool that's on); a **More** button shows the rest after them and they tuck away when the map is touched or full screen ends. The normal page's toolbar is unchanged. 366 tests.

Then: "The DM should be able to have an edit mode, that hides or shows the edit tools." An **Edit** button for the DM (on the normal toolbar and among the main tools in full screen) toggles a `edit-off` class on the Map tab that hides everything marked `map-edit-tool` (Walls tick box, Add token, Fog & walls, Map settings, Import map). Turning it off closes Fog & walls and drops any fog or wall tool. The variant picker stays. On by default, kept per browser (`dndapp.map.editing`). 367 tests.

### 2026-10-09: PR #25 merged

The owner said "Merge". PR #25 (full screen map with see-through tools and More, the DM's edit mode) is merged into `main`; this file was updated to say so in the PR's last commit.

### 2026-10-10: Attacks need the weapon, Inventory sorted by kind, spells of your own

Three of the owner's notes from 2026-10-10 (branch `claude/project-thread-0b5uzi`; other threads took the rest of that list):
- "Players can add attacks that use weapons not in their inventory." A typed attack naming a PHB weapon now needs a line in the inventory naming it (`attackWeapon`, `ownsWeapon`, `unownedWeaponAttacks`, `newUnownedWeaponAttacks` in `shared/src/gear.js`). Unarmed strikes, spells, features and natural weapons are untouched. Without the weapon the row is marked, doesn't roll, and offers **Add a Longsword to my Inventory** (equipped, so it shows in Attacks from there; the typed row goes). `PUT /sheet` refuses (400) a save that adds one; the page holds the save and says why. Default picked: attacks the saved sheet already had stay (old sheets, uploads, a weapon sold later), they just don't roll. Only PHB weapon names are recognised. The name box suggests Unarmed strike and the inventory's weapons; Unarmed strike fills in 1 bludgeoning.
- "Inventory should be sorted by type of item." The Inventory tab groups lines under headings (Weapons, Armour and shields, Magic items, Potions, Scrolls, Adventuring gear, Tools, Other), by name within each (`inventoryGroups`). Display only; the stored order doesn't change.
- "There is no way to add custom spells, or spells the AI doesn't generate." **Make my own** next to Add spell adds the typed name as the player's own spell (source `custom`, "Your own") with no lookup, opened to fill in; "Fill in missing details" skips it.

SPEC v0.25 (§6.4), README (`PUT /sheet` 400). 7 new tests, 374 in all. `PIPELINE_VERSION` not bumped (no prompt, schema or chunking change; the sheet's spell source just gains a value). Only seen in jsdom.

## Verified vs. not verified

| Verified for real | Not yet verified |
|---|---|
| Claude Code provider: structured output, text, agent with tools, streaming | Anthropic API provider against the real API (only unit-tested with a fake client) |
| Archivist on two short sample sessions, with notes, a whisper and an absence | A real 3–4 hour transcript (inlined up to 200k tokens; the read-in-parts path is untested with a real model) |
| Per-player Q&A privacy with real answers | The archivist over dozens of sessions (record sprawl, pinned budget, consistency) |
| Q&A over real HTTP/SSE, with tool use and citations | Q&A latency at realistic campaign size |
| Local embedding model (download + relevance) | Rebuild and corrections against real AI (logic tested with the fake archivist) |
| DB migration v1 → v2 on a real old database | Multiple players asking at once on the Claude Code provider |
| Logins, admin screen and page serving over real HTTP; v2 → v3 migration on a synthetic v2 database | Streaming answers from the real AI in the browser |
| Web page layout in headless Edge (desktop + phone), no console errors | The page on real phones / Safari |
| v3 → v4 migration on a copy of the real database, then on the real one | Several people using the page at once |
| The owner using the admin screen in a real browser | A real uploaded character sheet (D&D Beyond PDF, phone photo) |
| Character sheet in headless Edge; spell lookup (SRD, PHB scan, AI memory) and PDF sheet upload through real Claude Code | Sheet attachments on the API provider |
| 3D dice landing on the server's rolls, in headless Chromium (software WebGL) | 3D dice on real phones and GPUs; Safari/Firefox |
| Maps in headless Chromium with a fake AI (DM and player, live moves, fog, stat blocks, records, PDF page, pins); grid measuring on synthetic maps; line of sight with hand-placed walls on a real castle map | The real AI reading real maps, writing stat blocks and drafting walls; grid measuring on real (faint, textured) maps; real adventure PDFs (big scanned pages); touch dragging on real phones |

## Gotchas and lessons

- **Passwords given on the admin command line** end up in shell history. Fine for a friends' server; clear history if that matters.
- **Behind Cloudflare Tunnel every request comes from 127.0.0.1**, so the login lockout is per account name, not per IP.
- Unknown URLs return 401 (the login check runs before routing), not 404.
- **Windows + background tasks:** stopping `npm start` from a background task leaves the `node` child holding port 4400. Run `node packages/server/src/index.js` directly when the server must be restarted from a tool, and check the port is free first.
- **Web pages collapse repeated spaces**, so names shown on the page can differ from what's stored unless cleaned (see `cleanName`).
- **Privacy depends on the speaker map's `user_id` links.** Without them, everyone is assumed present at every session.
- **The `dm` role can see note-derived knowledge:** the archivist puts the DM in `known_by` for records built from a player's private note. Deferred with the rest of the DM role.
- Q&A once cited a session 2 event as `[S1 …]`. Citations are model-written; evidence lookup will then show the wrong lines.
- **Claude Opus 5.5:** thinking can't be disabled, and forced `tool_choice` (`any`/`tool`) returns 400. The API provider uses `tool_choice: {type: 'none'}` plus a "research limit reached" message to force a final answer.
- **Structured output schemas** come from zod via `z.toJSONSchema()` (strip `$schema`). Keep all fields required; use `.nullable()` instead of optional.
- `llm.structured()` is used by character sheets, maps, creatures and pictures; `llm.research()` only by Find online; `llm.agent()` by the archivist and Q&A. (`text()` was removed as unused, 2026-10-08.)
- **ESLint `no-undef` misses browser and Node globals:** when moving code between files, names like `crypto` (WebCrypto) and `status` (`window.status`) don't show as undefined but are the wrong thing. Import them by hand.
- **Book spell headings are OCR'd:** suggestions can show slightly misspelled names for non-SRD spells (e.g. "Ar Ms of Hadar"); the AI's tidied result uses the right name. Fireball's level line in the PHB scan reads "3rd~evelevoeaUon", hence the loose level-line pattern in `books.js`.
- **Bash heredocs** in this environment sometimes fail with "unexpected EOF" on long scripts; writing the script to a file first works.
- **Claude Code provider:** `result.usage` covers the main loop only; `total_cost_usd` is an estimate, not a bill on a subscription. Each call spawns a Claude Code process (~0.7s).
- **Windows:** archived transcripts are made read-only (`chmod 0o444`). Tests clean up temp dirs with `fs.rmSync(..., { force: true })`, which works.
- **Testing:** `test/helpers.js` has `setup()` (an admin account "Kenny" who is also the campaign's DM, plus players Sam/Thorin and Alex/Lyra, all logged in, with a speaker map; `PASSWORD` is every test account's password), `createFakeLLM` (archivist runs call a function that drives the real tools, `defaultArchivist` by default; Q&A follows a script of tool calls and answers), `createFakeAnthropic`, and `fakeEmbedder`. Jobs run async: call `jobs.idle()` before asserting, and `jobs.stop()` before closing the DB.
- **Shell editing:** multi-line `node -e`/heredoc replacements with backticks and regexes broke several times; direct file edits were more reliable.
- **`npm install` without access to NuGet** (e.g. a sandbox): `onnxruntime-node`'s install script downloads from nuget.org and fails. `npm install --ignore-scripts`, then `npm rebuild protobufjs`, gives a working install (the embedding model still runs). Older npm rewrites `package-lock.json` (drops `libc` fields); don't commit that.
- **`better-sqlite3` and node-gyp:** a plain `npm install` (or `npm rebuild better-sqlite3`) tries to compile it and fails without Python and C++ build tools, even though the package ships prebuilt binaries. Always install with `--ignore-scripts`; see "Getting running on a new machine" step 2.
- **Node version:** an old Node (16 was found on the owner's laptop) fails at `npm start` with `Cannot find package 'fastify'` if nothing was installed, and the dependencies need 22+ anyway. Check `node --version` first. After installing a new Node, restart VS Code so its terminals pick it up. `winget install OpenJS.NodeJS.LTS` works (it asks for admin rights).
