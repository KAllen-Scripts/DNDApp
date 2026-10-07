# DNDApp — Handoff and Change Log

Read this first when picking the project up on another machine or with another AI. It records what has been built, why, what's been verified, where work stopped, and what to do next. [SPEC.md](SPEC.md) is the design; [README.md](README.md) is setup and the API.

**Keep this file current.** Add a dated entry to the change log for every meaningful change, and update "Current state" and "Next steps".

**Who's who:** Kenny is the project owner and hosts the server on his machine (and his Claude subscription powers the AI). He is **not** the DM. The DM is someone else in the group, and the DM's role and permissions will be designed later. "Owner's call" below means Kenny decided.

---

## Current state (2026-10-07)

- **Server: built and working end to end with real AI calls.** Player notes → transcript upload (with date) → attendance → **archivist** (an AI with full authority over the knowledge base) → per-player Q&A with privacy. Verified with a realistic two-session privacy scenario through Claude Code (see the change log).
- **Character sheets** (new, 2026-10-06): a Sheet tab per player per campaign, laid out like the official 5e sheet, with automatic values the player can override (overrides are always kept), autosave with version checks, upload of existing sheets (PDF, photo, text, own JSON) read by the AI, and spells looked up by name from the SRD, then the PDFs in `DND books`, then the AI. Schema v5. See SPEC §6.4.
- **Chats can be pinned, renamed and deleted; the page has themes and layouts** (new, 2026-10-06): a chat list replaces the old dropdown; a Look dialog offers 12 themes, 4 layouts, 3 text sizes, 4 chat styles, 6 sheet styles and 5 sheet layouts, saved per browser. Schema v6.
- **Character sheet tidied, two new sheet layouts** (2026-10-06, merged to `main` 2026-10-07): every box shares one set of sizes and lines up, in every style and layout; new "By ability" (2024 sheet) and "Tabs" (like the sheet apps) layouts; spell slots and death saves are tick circles.
- **Q&A handles general D&D questions and rich formatting** (new, 2026-10-06): questions like "stat block for a brown bear?" are answered straight from the model's knowledge without searching the campaign; answers can include tables and stat blocks (markdown/HTML, sanitised on the page).
- **Q&A can look rules up in the group's books** (new, 2026-10-07): `search_books`, `read_book` and `book_contents` over the PDFs in `DND books`, still with no database. The AI picks the search terms itself, so vague questions work. See SPEC §5.3.
- **Dice** (new, 2026-10-07, merged to `main`): a Dice button in the player header; click-to-roll from the sheet; the server rolls and 3D dice land on its numbers. 24 dice styles and special effects (trails, natural 20 / natural 1 / max-damage bursts, banners, shake, chimes). Rolls aren't saved or shared yet. See SPEC §6.5.
- **Map prototype** (new, 2026-10-07, merged to `main`): a Map tab with Leaflet to pan, zoom and drop named pins on a map image the player picks. Kept in that browser only (IndexedDB); nothing on the server or in the archive yet. See SPEC §6.6.
- **Tests:** 66 passing (`npm test`). They're offline and free: a fake AI, where the fake archivist calls the real knowledge-base tools.
- **Electron dropped; it's a web page now** (owner's call: overkill when there's a server and address anyway). A basic player page (`packages/web/public`, no build step) is served by the server at `/`: log in, ask questions (streamed, clickable citations, past conversations), take notes. No DM/host screens yet.
- **Logins: name + password**, set by the admin, who can also require a new password at next login (Active Directory style, enforced by the server). Anyone can change their own password. Schema v4.
- **Multiple campaigns supported throughout.** Players in several campaigns pick one after logging in; the admin chooses each account's campaigns (plural) when adding it and can change them later.
- **Session uploads** on the admin screen: each campaign card lists its sessions (status, notes matched by date, attendance) and dates with notes but no transcript, and has an upload form (number, date, title, file) that links transcript speakers to accounts before processing.
- **Admin screen** on the web page (admin login only): accounts (add with campaign access, edit access, set password, require password change, log out everywhere, block, delete if unused) and campaigns (colour-coded cards; create with unique names, delete keeping the archive, add people as player/DM, change roles, remove). The admin login is management only; Kenny plays through a separate player account, which gets normal player privacy. The console only has `init`, `set-password` (recovery) and `list`.
- **Public URL:** `PUBLIC_URL` (in `config.js`, overridable in `.env`) is the one place it's set. Placeholder `https://dnd.example.xyz` until the domain is bought.
- **Hosting:** not set up. Cloudflare Tunnel is decided (domain not bought yet).
- **Git:** everything is on `main`, including the sheet tidy-up and new sheet layouts (merged 2026-10-07). The book tools (Q&A searching the rulebooks) were merged to `main` on 2026-10-07.
- **Live install on the owner's machine:** `data/` holds the admin login ("admin") and a player account for Kenny; the database is on schema v4 and becomes v6 the next time the server starts (v5 adds `character_sheets`; v6 adds `pinned` and `deleted_at` to `conversations`; nothing else changes). The owner has been using the admin screen in a real browser. Start the server with `npm start` (or `node packages/server/src/index.js`), then open http://127.0.0.1:4400.
- **Real transcript:** none tested yet. The parser is built to an assumed format.

## Next steps

1. Get a **real transcript** from the recorder. Upload it on the admin screen (check the speaker preview: if the names come out wrong, adapt `packages/shared/src/transcript.js`), link every speaker to an account, let it process, and inspect the knowledge base (`GET /campaigns/:cid/kb`) and the archivist's questions. Measure archivist time and Q&A latency.
2. **DM role: deferred.** The owner said to leave it for now. When it's designed, decide what the DM can see (including knowledge derived from players' private notes, currently visible to the `dm` role) and do.
3. **Try the tidied sheet and the dice for real:** each sheet layout and style in the Look dialog, and some rolls, on a laptop and a phone (Safari/Firefox untested; the 3D dice need WebGL, and were only seen in headless Chromium's software renderer).
4. **Dice, next (owner's call):** should rolls be shared with the party and/or the DM live (D&D Beyond's game log), can the DM roll in secret, and should rolls go into the archive for the archivist? Needs a live channel per campaign; ties into the DM role.
5. **Character sheets with real players:** have someone upload their real sheet (a D&D Beyond PDF and a phone photo are the likely cases) and check what the AI got wrong. Then decide with the owner: should Q&A read the asker's sheet, and can the DM see sheets (part of the DM role)?
6. Show the players the **Look** dialog and see which themes and sheet layouts they actually use; prune or add.
7. **Try the book tools with the real books and real AI:** check each PDF has a text layer (the server logs the books it read at start-up), then ask vague rules questions ("can I hit the guy running away?", "what happens when I drop to 0?") and exact ones ("what does the PHB say about Hex?"). Check it picks good search terms, finds the right page, and that the printed page numbers it cites match the paper book (if they don't, the offset detection in `books.js` missed; the scan's page-number lines may be OCR'd with extra characters). Measure the extra time per lookup. Decide with the owner whether it should check the books on every rules question (now: only when the wording matters or the player asks).
8. Try **asking a question from the web page against the real AI** (streaming, citations, evidence in the browser), then use the page with the players in a real session. Include a general question ("stat block for a brown bear") and a campaign one, and check the AI picks the right path and the table/stat-block formatting looks right.
9. Add **DM screens** to the web page: glossary; corrections; the archivist's questions; a full speaker-map editor. Which belong to the DM vs the host is part of the deferred DM-role design. (Accounts and session uploads are on the admin screen.)
10. Buy the domain, set `PUBLIC_URL`, set up **Cloudflare Tunnel**, write a short player guide (address + "log in with what Kenny gave you").

11. **Map, next (owner's call):** try the prototype (Map tab), then decide who puts maps up, whether maps and pins are shared or private, and whether the DM needs fog of war. Then move maps and pins to the server and the archive, filtered per viewer (SPEC §6.6).

## Getting running on a new machine

1. Install **Node.js 22+** (developed on 24.21) and **Claude Code**, and log in to Claude Code with the host's Claude account. The server uses that login by default.
2. `git clone https://github.com/KAllen-Scripts/DNDApp.git`, then `npm install` in the repo root.
   - npm 11 may warn that install scripts for `better-sqlite3`, `onnxruntime-node` and `protobufjs` are "not yet covered by allowScripts". Everything worked on Windows x64 anyway (prebuilt binaries). If `better-sqlite3` fails to load on another platform, run `npm install-scripts approve better-sqlite3` and reinstall.
3. **Data is not in git** (`data/` is ignored). To move a live setup, copy `data/archive/` (the source of truth). With only the archive, the server restores accounts (passwords keep working; everyone logs in again), campaigns, notes and corrections on start-up; then run a rebuild to regenerate the knowledge base. Copy `data/dndapp.sqlite` too to skip the rebuild.
4. First-time setup: `npm run admin -- init "Admin" "password"` (creates the admin login only), then `npm start`, open `http://127.0.0.1:4400` and log in as admin. On the admin screen: create the campaign, the accounts (including Kenny's own player account), and set who's the DM.
   - **Database upgrades are automatic** on start-up (`db/index.js`). From before logins (schema v2): accounts keep their ids but have no password; set one for each with `npm run admin -- set-password "<name>" "<password>"` (the server warns on start-up about accounts without one). v3 → v4 just adds `must_change_password` (off).
   - Lost the admin password? `npm run admin -- set-password "admin" "<new password>"`.
5. Optional `.env` (copy `.env.example`): provider, models/effort, limits.

Dev environment so far: Windows 11, VS Code with the Claude Code extension, Git Bash and PowerShell. The git identity is "Kenny Allen".

## Architecture in one paragraph

npm workspaces: `packages/shared` (transcript parser, citation regex), `packages/server` (Fastify + better-sqlite3), and `packages/web` (static player page the server serves at `/`).

- **Source data** (accounts, transcripts, player notes, speaker map, glossary, corrections) is written to the **archive** (plain files under `data/archive/`) first, then the DB. Player notes are indexed immediately, visible only to their author.
- **Uploading a transcript** (with its date) queues a job: parse → speaker map + glossary → **attendance** → chunk + index (visible to attendees) → **archivist** run → snapshot to the archive.
- **The archivist** (`src/kb/archivist.js`) is an AI with full read/write tools over `kb_records`. It designs its own record kinds and a guide, keeps state (debts, quests, etc.), and sets `known_by` on each record.
- **DM corrections**, and answers to the archivist's questions, run as `correct` jobs.
- **Q&A** (`src/qa/`) pre-searches, then runs a read-only agent whose tools filter everything to what the asker may know.
- **All AI calls** go through `src/llm/`: the **Claude Code** provider (default; the host's subscription, locked down) or the **Anthropic API**.

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
| **Admin login is management only; the admin plays via a separate player account** | Owner's call ("let's not complicate it"). Keeps one simple rule: privacy is per account, and the admin login is in no campaign. (The admin login still passes DM checks in the API so transcripts can be uploaded before DM screens exist.) |
| Deleting a campaign never deletes archive files | AGENTS.md rule: never modify or delete `data/archive/`. A `deleted.json` marker stops restore from bringing it back; recovery is by hand. |
| Accounts with history can't be deleted, only blocked | The archive (notes, attendance, speaker map, `known_by`) refers to accounts by id. |
| Campaign and account names unique and space-cleaned | Players pick campaigns by name; web pages collapse repeated spaces, so stored names must match what people see (found when deleting "test  camp" failed). |
| Forced password change enforced by the server, not the page | So it can't be skipped by calling the API directly. |
| One `PUBLIC_URL` setting | Owner's call: the address should be easy to change in one place. |
| Logins not archived | They're throwaway; after a database loss people just log in again. |
| **No database of the D&D books** | Owner's call (2026-10-06): the books are plain files in `DND books` (next to the repo). The server reads PDF text into memory at start-up and finds a spell by its heading when asked. |
| Character sheet: anything the player types into an automatic box is kept | Owner's requirement ("MUST be respected and preserved"). Even a typed value equal to the automatic one is kept, so later rule changes never move it; ↺ or clearing the box goes back to automatic. Only an upload's printed numbers that match the rules are left automatic (the player didn't type those here). |
| Sheet rules run in the page as well as the server | So automatic values update while typing. Same file (`shared/src/sheet.js`); the server normalises what's saved. The one exception to "clients don't process". |
| Q&A searches the books with terms the AI chooses; keyword search, not embeddings | Owner's idea: players are vague, so the AI turns the question into the book's words (plus synonyms) and searches again or browses the contents if needed. Rules questions use exact terms, so keyword search is enough and needs no stored index; a search over a 400-page book takes ~7ms. The books are only checked when the wording matters, so simple rules questions stay as fast as before. |
| Spell sources: SRD, then the books, then the AI's memory | SRD is exact and free; the books cover the group's other spells (the AI only tidies OCR); the AI is a labelled last resort. Details are replaced only when the player asks. |
| Sheets private to their player | Same rule as notes. DM access is part of the deferred DM role. |
| Sheet saves carry a version; stale saves get 409 | So a phone and a laptop can't silently overwrite each other. |
| **The server decides dice rolls; the 3D dice are animated to land on them** | Owner's call (2026-10-07): fine as long as it looks the same to the player. D&D Beyond lets the browser's physics decide; server rolls are evenly random and can't be faked from the page, which matters once rolls are shared. The library really throws the dice, then relabels faces. |

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

The project's goal is an interactive map; this is a first prototype of the interaction only.

- **Map tab** (`web/public/map.js`): Leaflet 1.9 (`CRS.Simple`, flat image coordinates) served from the npm package at `/vendor/leaflet.js` and `/vendor/leaflet.css`. Pan by dragging, zoom with the wheel, pinch or +/−. "Choose a map image" (any image the browser can show; a grid until then), "Place a pin" then tap: name it in its popup (shown as a label), drag it, or remove it. "Fit to screen", "Clear". Styled from the theme's colours.
- **Kept in the browser only** (IndexedDB, per account per campaign), so nothing is written to the archive before the sharing design is decided. Private mode just means it isn't kept.
- **Checked in headless Chromium:** grid, wheel zoom, drag, image chosen, pin placed and named, kept after reload, phone width. No page errors. `npm test`: 66 passing (the static-file test now also fetches Leaflet).
- **Not checked:** pinch zoom on a real phone, Safari/Firefox, very large images (a 10k-pixel scan may be slow to draw).

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
- `llm.structured()` is used by character sheets (uploads, spell lookups); `llm.text()` is unused, kept as a general capability.
- **Book spell headings are OCR'd:** suggestions can show slightly misspelled names for non-SRD spells (e.g. "Ar Ms of Hadar"); the AI's tidied result uses the right name. Fireball's level line in the PHB scan reads "3rd~evelevoeaUon", hence the loose level-line pattern in `books.js`.
- **Bash heredocs** in this environment sometimes fail with "unexpected EOF" on long scripts; writing the script to a file first works.
- **Claude Code provider:** `result.usage` covers the main loop only; `total_cost_usd` is an estimate, not a bill on a subscription. Each call spawns a Claude Code process (~0.7s).
- **Windows:** archived transcripts are made read-only (`chmod 0o444`). Tests clean up temp dirs with `fs.rmSync(..., { force: true })`, which works.
- **Testing:** `test/helpers.js` has `setup()` (an admin account "Kenny" who is also the campaign's DM, plus players Sam/Thorin and Alex/Lyra, all logged in, with a speaker map; `PASSWORD` is every test account's password), `createFakeLLM` (archivist runs call a function that drives the real tools, `defaultArchivist` by default; Q&A follows a script of tool calls and answers), `createFakeAnthropic`, and `fakeEmbedder`. Jobs run async: call `jobs.idle()` before asserting, and `jobs.stop()` before closing the DB.
- **Shell editing:** multi-line `node -e`/heredoc replacements with backticks and regexes broke several times; direct file edits were more reliable.
- **`npm install` without access to NuGet** (e.g. a sandbox): `onnxruntime-node`'s install script downloads from nuget.org and fails. `npm install --ignore-scripts`, then `npm rebuild better-sqlite3 protobufjs`, gives a working install (the embedding model still runs). Older npm rewrites `package-lock.json` (drops `libc` fields); don't commit that.
