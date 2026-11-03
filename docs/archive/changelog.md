# Change log, 2026-10-03 to 2026-10-30

Every entry from HANDOFF.md before the 2026-11-02 compaction, word for word, oldest first as they were kept (entries after 2026-10-16 were appended further down the old file, so dates jump). Newer entries are in HANDOFF.md.

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
- **Page, Look** (`page/look-boot.js`, `look.js`, `themes.css`; a "Look" button in the player and admin headers and on the login screen): themes Tavern (the old look; follows the device), Arcane Study, Dungeon Crawl, Elven Grove, Nine Hells, Frostmaiden, Ancient Scroll, Synthwave Sorcery, 8-bit Quest, Ink & Paper (high contrast), Feywild, The Abyss. Layouts: classic, sidebar, full width, app (tabs at the bottom). Text size: compact/cosy/roomy. Chat styles: bubbles, play script, letters (with a wax seal), terminal. Sheet styles: match theme, official (labels under the boxes, badge-shaped abilities), grimoire, index cards on cork, blueprint, terminal. Sheet layouts: three columns, combat first, one column. Saved per browser in localStorage, applied in `<head>` before the page draws. System fonts only. Printing resets to black on white. Animations respect reduced motion.
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
- **Page** (`web/public/dice/dice.js`): a Dice button in the player header opens the tray (dice buttons that build the notation, a notation box, Normal / Advantage / Disadvantage for the next d20, 3D and sound switches kept per browser, this session's rolls; a bottom sheet on phones). Results appear in a card at the bottom: total, each die, natural 20 / natural 1, and after an attack, a damage button (doubled dice on a natural 20). On the sheet (`sheet.js`): clicking a save, skill, ability name, initiative or spell attack rolls d20 + that value; attacks have a roll button; death saves have "Roll a death save". Shift-click = advantage, Alt-click = disadvantage. Reduced motion, no WebGL, or 3D switched off: the result appears straight away.
- **Tests:** 63 (shared: parsing, refusing bad notation, damage text, totals, advantage/disadvantage, naturals; server: the endpoint, all 20 faces come up, advantage keeps the higher, bad notation and outsiders refused, the bundle and sounds are served, no path escape).
- **Checked in headless Chromium** (software WebGL) against a throwaway server: rolling Stealth, an attack with advantage then its damage, and a typed `2d6+1d100+3` from the tray, each comparing the faces the 3D dice landed on with the server's numbers (all matched); bad notation explained; at 1280 and 390px wide; reduced motion. No page errors (apart from the deliberate 400).
- **Installing:** done with npm 11, so the lockfile only gained the new packages.
- **Not checked:** real phones and GPUs, Safari/Firefox, how the sounds feel, many dice at once on a slow phone (3D is skipped above 30 dice).

### 2026-10-07: Dice styles and special effects

The owner asked for "more dice themes? Special effects? Nice fancy shit like that."

- **24 dice styles** (`STYLES` in `dice.js`), picked in the tray with hexagon swatches: Match the page, Dragonfire, Frost, Stormcaller, Thunderhead, Poison, Acid, Necrotic, Radiant, Force, Psychic, Blood Moon, Starry Night, Astral Sea, Thylean Bronze, Here Be Dragons, Dragon's Hoard, Cold Steel, Obsidian, Bone, Old Oak, Glitter Party, Pastel Sunset, Rainbow. Most are the library's own colour/texture sets (skipping its Star Wars, Animal Crossing and joke sets). Textures are served from `/vendor/dice/textures/` (1.7 MB in all) and only the chosen style's are fetched. Picking a style throws a preview.
- **Found while checking:** the library's "metal" and "glass" materials need an environment map it switches off, so dice in them render nearly black. Every style uses the plain material (or matte "wood"); the textures still give the look. Glitter Party dropped its texture, which darkened the pastels. Light raised from 0.7 to 0.9.
- **Effects** (`dice/effects.js`, one canvas over the page, no libraries): trails behind each moving die by style (embers, snow, sparks, motes, stars, smoke, bubbles, glitter, petals), using the dice's positions projected from the 3D scene every frame. Natural 20: golden flash, two rings, stars and confetti from the d20 that shows it, a "Natural 20!" banner, and the result card shines. Natural 1: a red flash and a ring closing in on the die, smoke, red sparks, a "Natural 1" banner that falls away, and the page shakes. Maxed damage (no d20, 2+ dice all on their highest face): a sparkle and "Max damage!". Synthesised chimes (Web Audio) when sound is on. Without 3D, the bursts happen at the result card. Off with reduced motion or the Effects switch.
- **Checked in headless Chromium** (software WebGL): every style thrown and looked at; natural 20, natural 1 and max damage forced by intercepting the roll response in the test (the server's real rolls are random), banners and shake confirmed; the earlier dice checks (faces match the server, advantage, d100, phone width) still pass. No page errors. `npm test`: 63 passing.
- **Not checked:** how the styles and effects look on a real GPU (the software renderer is darker and slower, so trails and bursts last longer in it), on a phone, and the chimes by ear.

### 2026-10-07: Map prototype

The project's goal is an interactive map; this is a first prototype of the interaction only. (Replaced the same day, following the owner's direction, by server-backed maps; see "Maps (DM imports, AI reads, tokens moved live)". Leaflet and the browser-only storage were removed.)

- **Map tab** (`web/public/map/map.js`): Leaflet 1.9 (`CRS.Simple`, flat image coordinates) served from the npm package at `/vendor/leaflet.js` and `/vendor/leaflet.css`. Pan by dragging, zoom with the wheel, pinch or +/−. "Choose a map image" (any image the browser can show; a grid until then), "Place a pin" then tap: name it in its popup (shown as a label), drag it, or remove it. "Fit to screen", "Clear". Styled from the theme's colours.
- **Kept in the browser only** (IndexedDB, per account per campaign), so nothing is written to the archive before the sharing design is decided. Private mode just means it isn't kept.
- **Checked in headless Chromium:** grid, wheel zoom, drag, image chosen, pin placed and named, kept after reload, phone width. No page errors. `npm test`: 66 passing (the static-file test now also fetches Leaflet).
- **Not checked:** pinch zoom on a real phone, Safari/Firefox, very large images (a 10k-pixel scan may be slow to draw).

### 2026-10-07: Maps (DM imports, AI reads, tokens moved live)

Owner's direction in the project thread: no premade maps; the DM imports their own (battle maps, towns, anything); the AI turns the terrain into something interactive; the DM adds characters, enemies and NPCs by hand; players move their own tokens.

- `shared/src/map.js`: the map document (`normalizeMap`), token sizes, snapping (`snapToken`: Medium in a square's middle, Large on a corner, always on the map) and distances (`measure`: 5e squares on a grid, straight lines otherwise). Served to the page at `/shared/map.js`.
- Server: `maps/store.js` (maps table, schema v7; archive-first with the image as uploaded and append-only diffs reusing the sheets' `diffJson`; restore replays them; `view()` filters per viewer; live `events`), `maps/read.js` (`inspectImage`, `detectGrid`, the AI's structured reading on a 2000 px JPEG copy; task `maps`, medium effort), routes in `app.js` (import, list, image, settings, read again, remove, tokens, SSE). AI reads per DM per hour: `MAP_AI_PER_HOUR` (20). A read cut short by a restart is marked failed on start-up.
- Page: Map tab (`web/public/map/map.js`): picker, pan (drag), zoom (wheel, pinch), Fit, a grid overlay toggle, the DM's Import / Add token / Map settings (name, shown, grid drawn live while editing, scale, what the AI saw, read again, remove), a token bar (Edit/Remove for the DM), drag-to-move with the distance shown, live updates with reconnects. `api.js` gained `listen` (GET SSE) and `fileUrl` (images need the login header).
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
- **Server** (`src/sheets/pictures.js`): uploads checked with sharp (PNG, JPEG, WebP, GIF, 10 MB), archived as uploaded under `characters/<user id>/`, with `pictures.jsonl` (the whole record per change) and a `character_pictures` table (schema v9, restored from the archive). Tokens are served as 256 px squares cropped with sharp's attention strategy, full pictures at most 1600 px, both WebP and cached in memory. The description is a structured AI call (task `import`, purpose `sheet:picture`), counted in `SHEET_AI_PER_HOUR`; it saves the sheet (Appearance, and eyes/hair/skin only where empty) and returns it, so the page takes the new version. If the AI fails the picture is still saved. Map views give player character tokens a `picture` key; uploading or removing a token picture re-sends the maps their token is on. Pictures count as account history.
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
- **The effects were the frame-rate killer.** `dice/effects.js` set `shadowBlur` on every particle as it drew it: ~370 ms a frame with trails and a natural-20 burst (~3 fps). Now each particle is drawn from a small picture made once per shape and colour: ~17 ms a frame, same look. This fixes every roller.
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
- **`deluxe` roller** (`dice/deluxe.js`, `dice/physics.js`): own Three.js 0.186 scene and cannon-es physics (new server dependencies `three` and `cannon-es`, served at `/vendor/three/` and `/vendor/cannon-es.js` because the page's CSP only allows the server's scripts). The whole throw is simulated first (a few ms) and replayed; the symmetry of each solid turns the numbers so the server's one lands up (`symmetries`, `readDie`, `relabel` in `dice-lite.js`). Physical materials per style (metal, ice/glass, glitter, glowing), studio reflections, ACES tone mapping, soft shadows, engraved numbers, a pulse on crit/fumble/max, collision-timed sounds.
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
- **Handouts** (`src/table/handouts.js`, `web/public/campaign/table.js`): title, text and/or picture, to everyone or chosen players, live, archived (`handouts/<id>/`), restored. Players never learn who else got one.
- **Sheets etc. for the archivist** (`kb/updates.js`, job `updates`): new sheets in full and each later change with its save time (same-field saves within 10 minutes merged), notes written/edited/deleted after their session was processed, and handouts. Runs after a 10-minute quiet spell (`ARCHIVIST_UPDATES_DELAY_MINUTES`), on start-up if anything is waiting, and between sessions in a rebuild (in time order). No AI call when nothing changed. The archivist is told sheet-only facts stay with their player. Prompt changed: **`PIPELINE_VERSION` 7 → 8**. New `sessions.processed_at` tells late note changes from ones the session run already saw.
- **Privacy note:** DMs see every knowledge-base record, so the DM can now learn sheet details through Q&A, the same as with private notes (already deferred with the DM role).
- **Schema v11:** `handouts`, `rolls`, `archivist_marks`; `player_notes.edited_at/deleted_at`; `sessions.processed_at`.
- **Tests:** 261 (server 112, shared 49, web 100): `table.test.js` and `updates.test.js` on the server, `table.test.js` on the page, plus note editing in `app.test.js`. The page tests' fake fetch now treats `/live` as a live stream. Not seen in a real browser; the real AI hasn't read a sheet or its changes yet.

### 2026-10-08: The sheet beside the map, or in its own window

- Owner: switching between the Map and Sheet tabs is a pain; have the sheet on the same page, or pop it out to a new window. Both built; the player picks (`web/public/page/side-panel.js`).
- **Beside the map:** a Sheet button on the map bar shows the sheet to the right of the map (Hide in the sheet's bar, or the button again, takes it away). A handle between them resizes it (drag, or arrow keys; the map keeps at least 320 px). Below 760 px wide the sheet goes under the map instead. The choice and the width are saved per browser. The sheet's layouts already use container queries, so it rearranges itself for the narrower space.
- **Its own window:** Sheet window (map bar) or Pop out (sheet bar) opens the page at `/?view=sheet&campaign=<id>`, which shows only that campaign's sheet (no tabs; chats, notes and maps aren't loaded). A blocked pop-up is explained. Opening it turns off the sheet beside the map.
- **Two windows:** after each save the page tells its other windows (BroadcastChannel `dndapp.sheet`); one with nothing waiting to save loads the newer sheet. With changes waiting, the existing conflict question still decides.
- No server, schema or pipeline change. **Tests:** 266 after merging main (web 105; `sheet-place.test.js`, and `page.js` now stands in for `window.open` and BroadcastChannel and takes a `path`). Layout checked once in headless Chromium (side by side at 1400 px, stacked at 600 px); not tried on a real phone.

### 2026-10-08: The DM's creatures (saved enemies and NPCs)

- Owner: can the DM pre-make enemies and NPCs, save them and add them to the map? That makes more sense for the DM than a character sheet tab. Before this, the DM made each token by hand on each map and nothing was kept for reuse.
- **Creatures tab (DM only, in place of the Sheet tab):** New creature (name, enemy or friendly NPC, size, colour, max HP, AC, speed, darkvision, stat block, notes, picture; an empty stat block is filled by the AI from the name), a filter, and on each: Place on map, Edit, Stat block / Stat block (AI), Picture, Remove. The DM's map has no "Sheet" button. Players keep their Sheet tab and never see Creatures.
- **On the map:** Add token has "From your creatures"; picking one (or Place on map) asks how many (1-20) and whether hidden. They go in a row, numbered when there are several, carrying on from tokens already named so. Each gets the creature's picture (copied once into the map's `tokens/` folder), stat block, HP and the rest. A selected NPC or enemy token has "Save to creatures".
- **Server:** `src/creatures/store.js`, `creatures` table (schema v12), archived as `creatures/<id>/changes.jsonl` plus pictures, restored on start-up. Routes in README. Not read by the archivist; no `PIPELINE_VERSION` change (no prompt or schema change; the AI stat block lookup is the existing one).
- **Defaults picked (not asked):** the DM's sheet is hidden rather than deleted (its data stays); placed tokens don't follow later edits to the creature; no link back from token to creature.
- **Tests:** 277 (server `creatures.test.js` 7, `db.test.js` v11→v12; web `creatures.test.js` 3). Not tried in a real browser or with the real AI.

### 2026-10-08: Find a creature online

- Owner: the DM should be able to ask the AI to find a creature online, even an unofficial one, and pull it in with a picture.
- **Find online** (Creatures tab): the DM types what they want; the creature appears at once as "searching", and the page checks every 3 s. The AI searches and reads web pages (`llm.research`, a new method on both providers: Claude Code with only WebSearch/WebFetch allowed; the API with `web_search_20260209`/`web_fetch_20260209` and `pause_turn` handling), then a structured call tidies the notes into fields (`src/creatures/find.js`). It shows the source as a link (official or unofficial) and its stat block is marked as found on the web. "Search again" and "Cancel"/"Remove" on the card.
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
- `page/look-boot.js` now cleans every saved value (unknown tabs and tools are dropped; new tabs are added to the end of a saved order) and sends a `dndlook` event on change.
- **Tests:** 288 after merging main (web 115; new `test/layout.test.js`, and the look and sheet-place tests updated). Checked once in headless Chromium (left toolbar with Ask on the left at 1400 px, bottom toolbar with hidden tools, phone with the side panel stacked, the Look dialog's Map group on a phone); no console errors. Not tried on a real phone.
### 2026-10-08: A thorough AI wall draft, curved walls, .dd2vtt files, hideable walls

- Owner picked "the cheap four plus .dd2vtt" from the options (`docs/notes/ai-walls-options.md`), then added: the AI struggles with round walls, the DM should be able to hide walls so the map looks clean, and "it is worth being expensive about this part" (maps are set up once).
- **AI draft** (`maps/read.js` `walls()`): a ruler drawn round the AI's copy (`withRuler`); a check pass with the draft drawn over the map (`withDraft`, purpose `map:walls-check`); maps over 1800 px checked in up to 3 × 3 overlapping close-ups, each keeping what lies in its own part; `curves` (arcs through 3 points) and `circles` in the schema and prompt; `tidyWalls` straightens (4°), joins ends (1% or a third of a square) and puts straight walls' ends on the grid (within 0.3 square); curves keep their shape. New LLM task `walls` (`MODEL_WALLS`, falls back to `MODEL_MAPS`; `EFFORT_WALLS`, default `max`). `PIPELINE_VERSION` 10 → 11 (main took 10 for the book lookups). After the housekeeping split (PR #16) the server side is in `routes/maps.js` and the page side in `map.js`, `map/state.js` and `map/spell-templates.js`.
- **Curves:** `arcThrough` and `circlePoints` in `shared/src/map.js`; walls carry an optional `group` (pieces of one curve); walls PATCH takes `curve` and `circle`; `remove` takes the whole group. Curve and Circle tools on the page.
- **Universal VTT** (`maps/uvtt.js`): a `.dd2vtt`/`.uvtt` imported as a map (its picture, exact grid, 5 ft squares, walls, doors, lights; the AI still names and describes it but doesn't replace the grid), or added to a map (`POST .../walls/file`, stretched to the picture). `source: 'file'` on walls and lights (`WALL_SOURCES`).
- **Hide walls:** a Walls tick box in the DM's map bar (`dndapp.map.showWalls`); unticked, walls, obstacles and lights aren't drawn unless Fog & walls is open.
- **Tests:** 298 after merging main (new `server/test/walls.test.js`: tidying, close-ups and fallbacks, Universal VTT parsing and import, curves and circles; web: curve, circle, erase, hiding, walls from a file). The ruled picture and the check overlay were looked at once as images. Not tried with the real AI.

### 2026-10-08: Doors look like doors; the DM locks them with a click

- Owner: "DM should be able to lock and unlock doors. Doors should be more obvious as doors." Locking already existed (the Lock tool in Fog & walls, PR #9) but was easy to miss.
- **Door bar:** outside the drawing tools, a DM click on a door picks it (`state.selectedDoor`) instead of opening it; the bar under the map says Closed / Open / Locked, with Open/Close, Lock/Unlock, Remove and ✕. Uses the existing `PATCH .../walls` (`toggle`, `lock`, `remove`). Players still open a door with a click.
- **Drawing:** `doorShape()` in `map.js`: light posts across both ends of the doorway, a thick amber plank with a dark seam, and a round badge in the middle (a door glyph, or a red padlock when locked). Open: a dotted doorway, the door swung 90° from its first end, and a dotted swing arc. The picked door's posts turn gold. Same for players (they only get the doors they can see, as before). Picture: `docs/notes/doors-closed-locked-open.png`.
- **Server:** the DM opening a locked door through `POST .../doors/:wid/toggle` now unlocks it, as the walls PATCH already did.
- **AI walls:** the owner asked how to improve them; nothing changed in the draft yet. Options and a recommendation are in `docs/notes/ai-walls-options.md`. No prompt change, so `PIPELINE_VERSION` stays.
- **Tests:** 289 (web: the DM picks a door, locks, unlocks, opens, closes, locking an open door closes it; the player sees the padlock). Looked at once as a static render in headless Chromium.

### 2026-10-08: Housekeeping: contradictions, duplicates, dead code, file splits, dice cut to two, docs brought up to date

- Owner asked for an audit ("where things are bloated, where we have stubs, where things contradict"); report in the project files, `audit/housekeeping-audit-2026-10-08.md`, items 1–19. Then: "Tidy it all up, except the dice and layouts … SPEC and HANDOFF haven't been kept up to date. These are EXTREMELY important." Then: "just keep the classic and deluxe 3D dice, scrap the rest of the dice". Layout options (item 18) left alone, as asked. Branch `claude/project-thread-cuyr7n`, one PR.
- **The DM's old sheet (bug-level):** PR #15 had only hidden the DM's Sheet tab. Now the DM gets no Sheet window, the page never loads a sheet for them, the server answers 403 to `/sheet` and character pictures for the `dm` role, and `kb/updates.js` skips sheets of anyone who is a DM in that campaign. Nothing in the archive was touched.
- **Fix:** stat blocks found online kept `source: 'web'` on the creature but became `manual` when placed on a map (`normalizeStats` in `shared/src/map.js` didn't allow `web`). Now kept, and the map's stat block dialog says "Found on the web by the AI; check it" like the Creatures tab.
- **One copy of things that were written two or three times:** the stat block dialog (`web/public/creatures/stat-block.js`); the markdown cleaner (`web/public/page/markdown.js`, the strict allowlist Q&A already used, now also for stat blocks and records); picture checks and token squares (`server/src/images.js`; maps now have their own pixel limit, 250M, other pictures 100M); the citation regex (`shared/src/citations.js`, served to the page).
- **Dead code removed:** `llm.text()` (both providers), `groupIntoSections`, `ROLES`, `HEALTH`, `roleLabel` in `admin.js`.
- **Files split, no behaviour change:** the server's API went from one 2,468-line `app.js` to `app.js` (370 lines: plumbing, access checks, live streams) plus `src/routes/` (accounts, campaign, characters, table, maps, combat, creatures). The Map tab's `map.js` (2,204 lines) lost the DM's tools, initiative and templates to `map/dm-tools.js`, `map/combat.js`, `map/spell-templates.js`, with shared state in `map/state.js`. `dm.js` renamed `archivist.js`.
- **Dice:** only `deluxe` (now the default) and `classic`. `dice-quick.js` deleted; `dice-lite.js` became `dice/shapes.js` (just the solids and the relabelling maths Deluxe uses). If the chosen roller can't start, the other is tried, then the result just appears. A browser that had picked a removed roller goes back to the server's choice. `DICE_ROLLER` accepts `deluxe` or `classic`.
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
- **Items** (DM tab, `src/items/store.js`, `src/items/find.js`, `web/public/items/items.js`): like Creatures. Look up by name checks the DM's own items first, then the books (keyword search for the name, the AI copies the entry from that page and the next, `item:book`), then the AI's knowledge (`item:ai`), the same order the "Saved enemies and NPCs" thread gave creatures' stat blocks (PR #20). Find online as for creatures (`item:find`, `item:tidy`), with a picture. Prices are kept in copper pieces.
- **Merchants** (DM tab, `src/items/merchants.js`, `web/public/items/merchants.js`): stock lines (item, price, how many left or no limit, restock level), open or closed, notes, picture, colour, the last 50 sales. "Add item" accepts any name and looks it up if it isn't in Items. Placed on a map as an NPC token with `merchant: <id>` and a gold ⚖ badge.
- **Buying:** a player picks the token, presses Shop, and buys. Defaults picked (the coordinator's, not asked): buying takes the price from the sheet's coins automatically (big coins first, with change, `payCoins` in the new `shared/src/coins.js`) and adds the item to the sheet's equipment text ("Potion of Healing x3" when it's already there), as a new sheet version with the reason; the stock goes down. Both happen with no waiting in between, so two players can't buy the last one. The page saves the sheet first and reloads it after. Not built: selling back.
- **Restocking:** every N long rests per merchant, or "Restock now". Built on the rests branch (PR #22): `context.js` listens to `rests.events` and each long rest the DM calls (one call is one party rest) counts via `merchants.longRest`.
- Shared storage for items and merchants (`src/library.js`: a row per entry, the whole entry archived on each change, pictures as uploaded); `archive.js` got `items/` and `merchants/`; restore brings both back. New tables `items` and `merchants`, schema v13 → v14 (after the rests table). `PIPELINE_VERSION` 11 → 12 (new prompts). The live stream sends `merchant {id}` on any change. Items and Merchants are tabs to order, hide and put beside the map under Look.
- **Privacy:** players only see a shop while one of its tokens is on a map they can see (shown, not hidden, in their sight), and never notes or sales.
- **Tests:** 326 with the rests branch merged in (server: `merchants.test.js`, 9 tests, plus the v13 → v14 migration; shared: `coins.test.js`; web: `merchants.test.js`, 3 tests; the tab-order tests updated for the two new tabs). Not tried with the real AI, the real books or in a real browser.
### 2026-10-09: Long and short rests, spending hit dice

Owner's request: "a long rest and short rest feature. And a way to spend hit die", plus merchants that restock "every x number of long rests" (another thread), which needs a long rest to hook into.

- **Rules** in `shared/sheet.js` (pure): hit dice kept per die size (`hit_dice_spent`, replacing `hit_dice_used`; old sheets are converted, biggest die first); `spendHitDie` (die + Con, never negative, up to max), `shortRest` (Pact Magic), `longRest` (HP, temp HP, slots, death saves, hit dice: half at least one under 2014, all under 2024; nothing at 0 HP under 2014).
- **Server:** `rolls.js` (rolling, logging and sending a roll, moved out of `routes/table.js` so other features can roll), `rests.js` and `routes/rests.js`: `POST /sheet/hit-dice`, `POST /sheet/short-rest` (players), `GET`/`POST /rests` (the DM calls one for everyone or chosen players). The edition comes from `REST_RULES` or the group's PHB (`handbookEditions` in `sheets/books.js`, now shared with Q&A's `groupEdition`, same wording). Sheets are saved with a reason. Rests the DM calls are archived (`rests.jsonl`), mirrored in `rests` (schema v12 → v13), restored, sent live (`rest` on `/live`) and counted (`rests.count`, `rests.events`). Who got nothing (0 HP) is only told to the DM and that player.
- **Page:** the Hit dice box has a row per die size with ticks, how many are left, Spend (rolls through the dice tray, so the 3D dice show it) and Short rest; the DM's Rest button in the header opens a dialog (who rests, Short or Long, which rules, recent rests); players get a note and their sheet reloads (`web/public/campaign/rests.js`, `restCalled` in `sheet.js`, `showToast` in `dice.js`).
- No AI prompt or schema changed, so `PIPELINE_VERSION` stays 11. Tests: 12 new (server 5 in `rests.test.js` + the v13 migration, shared 3, web 3 in `rests.test.js`), 310 in all.
- **Not checked:** the page in a real browser (only jsdom), the 3D dice for a hit die (same path as other rolls), the archivist's reading of rest changes with the real AI.

### 2026-10-09: Stat blocks look like stat blocks, and come from the books first

The owner sent a screenshot of a creature's Edit dialog: the stat block was raw Markdown in a plain text box (`###`, `**Armor Class**`, a pipe table).
- **Edit dialog** (`web/public/creatures/creatures.js`): a saved stat block now shows formatted, through the same cleaner as everywhere (`markdown.js`). "Edit text" swaps in the Markdown box (taller now) and "Show stat block" swaps back with the changes. A new creature, or one without a stat block, starts with the empty box as before. Saving is unchanged.
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

- **Initiative goes into the fight.** `POST /campaigns/:cid/roll` takes `initiative: true`: the total goes into every fight on a map the player can see where one of their player character tokens hasn't rolled yet (`joinFights` in `routes/table.js`; the entry's `mod` is the total minus the kept d20). The notation may be left out (d20 + the sheet's initiative, `sheetInitiative` in `routes/combat.js`, shared with the combat route). The sheet's Initiative sends it; so does a player's Roll button in the turn order (`map/combat.js`), which used to roll on the server with no dice shown and nothing in the shared rolls. The DM's rolls for tokens are unchanged. The result card says which map it went into.
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

- **Campaign settings:** new `campaign_settings` table (schema v15, no migration: created by `schema.sql`), `shared/src/settings.js`, `store.getSettings` / `setSettings` (archived as `settings.json` with history, restored, `store.events` 'settings' sent on the live stream), `PATCH /campaigns/:cid/settings` (DM), settings in `GET /me` and `GET /campaigns/:cid`. Page: `campaign/settings.js`, the DM's Settings button and dialog.
- **`gear.js`:** PHB weights and armour Strength/Stealth in the tables; `itemCharges`, `itemEffects` (read from descriptions), `activeEffects`, `carriedWeight`, `encumbrance` (capacity / variant / ignore, Powerful Build), `attunementLimit`, `normalizeInventory` keeps at most that many attuned. Lines gained `charges` and `effects`.
- **`sheet.js`:** `computeSheet(sheet, settings)` applies effects (scores, saves, AC, unarmoured AC, speed, initiative, spell attack and DC), heavy armour's Strength rule and the weight rule to speed, and lists disadvantages; `rollDisadvantage`. The server passes the campaign's settings wherever it works a sheet out (maps' token speed, the DM's equipped view, the archivist's sheet text, which now lists the inventory too).
- **Page:** the Inventory tab shows weight and attunement, a warning when slowed; rows have charges (Use 1, Recharge with a roll), weight, charges and effects under Details; refusing a fourth attunement. The sheet shows "19 with items" under a score and a note under Speed; sheet rolls with disadvantage are sent that way (`roll(..., { disadvantage })` in `dice.js`).
- No `PIPELINE_VERSION` change (no prompt or AI schema changed; the archivist's sheet text gained an Inventory line).
- Tests: 361 (server 160, shared 70, web 131).
- **Not checked:** a real browser or phone; real AI lookups of magic items (whether their descriptions use the wordings `itemEffects` reads).

### 2026-10-09: PR #21 merged

The owner said "Merge". PR #21 (rolling from the sheet, the Inventory tab, weight, charges, attunement, magic item effects, campaign settings) is merged into `main`; this file was updated to say so in the PR's last commit. The database goes to v15 on the next start.

### 2026-10-09: Full screen map

The owner asked: "We want to be able to full screen the map with the tools still visible. Buttons here should be partly see through." A **Full screen** button on the map toolbar (`map/full-screen.js`) puts the whole page full screen (the document, not just the map, so dialogs, dice and the panel beside the map keep working) and sets `data-map-full` on `<html>`. CSS hides the top bar, lets the map fill the screen and floats the toolbars over it in the place chosen under Look; tools are at 0.55 opacity and go solid on hover or focus, and pressed tools stay solid. The turn order and the selection bar move clear of the toolbars (their size is measured into `--bars-h` / `--bars-w`). Without the Fullscreen API (iPhone) the map still fills the window. Escape, the button, the browser leaving full screen or another tab puts it back. `fullscreen` is a hideable tool under Look. Also tidied two duplicated lines in SPEC §3.1's page file list. 4 new tests (`packages/web/test/map-full.test.js`), 365 in all. Not tried in a real browser.

Same day, the owner: "We don't want so many buttons all out at once." In full screen only the main tools show (Fit, Measure, Ping, Draw, Template, Initiative, Exit full screen, and any tool that's on); a **More** button shows the rest after them and they tuck away when the map is touched or full screen ends. The normal page's toolbar is unchanged. 366 tests.

Then: "The DM should be able to have an edit mode, that hides or shows the edit tools." An **Edit** button for the DM (on the normal toolbar and among the main tools in full screen) toggles a `edit-off` class on the Map tab that hides everything marked `map-edit-tool` (Walls tick box, Add token, Fog & walls, Map settings, Import map). Turning it off closes Fog & walls and drops any fog or wall tool. The variant picker stays. On by default, kept per browser (`dndapp.map.editing`). 367 tests.

### 2026-10-09: PR #25 merged

The owner said "Merge". PR #25 (full screen map with see-through tools and More, the DM's edit mode) is merged into `main`; this file was updated to say so in the PR's last commit.

### 2026-10-10: The archivist sees handout pictures

The owner: "Make sure the archivist can see handouts as well." Handout text already reached it between sessions; pictures didn't ("It has a picture, which you cannot see"). Now, before the archivist's between-sessions run, the AI reads each new or changed handout picture (`handouts.js`, `llm.structured` with purpose `handout:picture` on the `import` task, image shrunk to 1568 px as for character pictures): every word written in it, word for word, then what it shows. That goes into the `<handout>` block with the text and who got it, so privacy is unchanged (the archivist already treats a handout as known by those who got it). Readings are kept in memory per picture (changing who gets a handout doesn't read it again); a failed read fails the run, the mark doesn't move, and it's tried next time. `updates.collect` is now async. Archivist prompt line about handouts updated; `PIPELINE_VERSION` 13 → 14. SPEC §5.2, §6.7, the privacy table and §9 (open question removed). 368 tests.

### 2026-10-10: PR #26 merged

The owner said "Merge". PR #26 (the archivist reads handout pictures) is merged into `main`; this file was updated to say so in the PR's last commit.

### 2026-10-10: Item pictures in inventories; custom items made from a merchant

From the owner's list after the contradictions audit: "Items should have pictures" and "When adding items to the merchants, we should be able to make new custom items there instead of only being able to ask the AI to do it. We still want the AI feature as well, but we also want to be able to do it manually." Items already had pictures on the Items tab and in shops (uploaded, or from Find online). Now a bought item keeps showing its picture in the buyer's Inventory tab (new `GET /campaigns/:cid/gear/pictures` and `GET /campaigns/:cid/gear/items/:iid/picture`, limited to items in the asker's own inventory, kept after the DM removes the item) and in the DM's equipped list (`item_id` and `picture` added to `/gear/equipped`). A merchant's Add item dialog has **Make a new item**: the Items tab's form (`itemForm` in `web/public/items/items.js`, shared by both) plus In stock and Restock to; the item is saved to Items as the DM's own and stocked at its usual price; Look up by name (books, then the AI) is unchanged. No schema or prompt change, so no `PIPELINE_VERSION` bump. SPEC v0.25 (§6.4, §6.9, §5.5), README API. 370 tests (2 new). PR #28.

### 2026-10-10: PR #28 merged

The owner said "Merge". PR #28 (item pictures in inventories, Make a new item from a merchant) is merged into `main`; this file was updated to say so in the PR's last commit.

### 2026-10-10: Attacks need the weapon, Inventory sorted by kind, spells of your own

Three of the owner's notes from 2026-10-10 (branch `claude/project-thread-0b5uzi`; other threads took the rest of that list):
- "Players can add attacks that use weapons not in their inventory." A typed attack naming a PHB weapon now needs a line in the inventory naming it (`attackWeapon`, `ownsWeapon`, `unownedWeaponAttacks`, `newUnownedWeaponAttacks` in `shared/src/gear.js`). Unarmed strikes, spells, features and natural weapons are untouched. Without the weapon the row is marked, doesn't roll, and offers **Add a Longsword to my Inventory** (equipped, so it shows in Attacks from there; the typed row goes). `PUT /sheet` refuses (400) a save that adds one; the page holds the save and says why. Default picked: attacks the saved sheet already had stay (old sheets, uploads, a weapon sold later), they just don't roll. Only PHB weapon names are recognised. The name box suggests Unarmed strike and the inventory's weapons; Unarmed strike fills in 1 bludgeoning.
- "Inventory should be sorted by type of item." The Inventory tab groups lines under headings (Weapons, Armour and shields, Magic items, Potions, Scrolls, Adventuring gear, Tools, Other), by name within each (`inventoryGroups`). Display only; the stored order doesn't change.
- "There is no way to add custom spells, or spells the AI doesn't generate." **Make my own** next to Add spell adds the typed name as the player's own spell (source `custom`, "Your own") with no lookup, opened to fill in; "Fill in missing details" skips it.

SPEC v0.27 (§6.4), README (`PUT /sheet` 400). 7 new tests, 374 in all (377 after merging #26 and #28). `PIPELINE_VERSION` not bumped (no prompt, schema or chunking change; the sheet's spell source just gains a value). Only seen in jsdom.

### 2026-10-10: PR #27 merged

The owner said "Merge". PR #27 (attacks need the weapon, Inventory by kind, spells of your own) is merged into `main`, after merging #26 into it (SPEC v0.27); this file was updated to say so in the PR's last commit.

### 2026-10-10: The top bar stays put; "Beside the map" in Look

The owner: the bar holding the tabs moved as he clicked through Ask, Notes, Creatures and so on, and the Look option "Beside the map" didn't seem to change anything.

- **Top bar:** `#app-view` had a different `max-width` per tab (860px for Ask and Notes, 1280px for the sheet and map, none with a panel beside the map), and the bar sat inside it, so it re-centred on every switch (measured in headless Chromium: the tabs jumped from x=533 to 457, and to 218 with a panel beside the map). Now the page fills the window, each panel is centred at `--page-width`, and the bar's contents are always laid out at `--bar-width` (set per Look layout, never per tab). The selected tab's bold name used to widen it by a pixel or two; each tab label now reserves its bold width (`data-label` and a hidden `::after`). Re-measured: nothing moves across all tabs for a player and the DM, at 1000 and 1600px.
- **Beside the map:** the Look setting only chose the side, and only does anything once a panel is picked in the map toolbar's menu, which wasn't obvious. Look's Map group now has "What goes there" (the same choice as the toolbar menu, which it drives, so they always agree), and the two side cards are greyed out and can't be picked until something is beside the map, with a line saying so. All Look options are kept.

2 new tests in `packages/web/test/layout.test.js` (Look's beside picker; the bar's width never set per tab, and every tab label reserving its bold width), 379 in all (after merging #26, #27 and #28).

### 2026-10-10: PR #30 merged

The owner said "Merge". PR #30 (the top bar stays put, "Beside the map" in Look) is merged into `main` after bringing #26, #27 and #28 in; this file was updated to say so in the PR's last commit.

### 2026-10-10: Contradictions resolved (rules edition per campaign, token hit points from the sheet, docs)

The owner asked whether any features and specs contradicted each other. An audit (`docs/notes/contradictions-2026-10-09.md`) found docs that disagreed with the code, privacy lines that disagreed with what the DM sees, and features that disagreed with each other; the owner answered the questions on 2026-10-10.
- **Rules edition per campaign:** `edition` in the campaign settings (`shared/src/settings.js`: '2014', '2024' or null), chosen in the DM's Settings dialog (which says what "not chosen" means now). New `src/sheets/editions.js` answers which edition a campaign plays by (the setting, else `REST_RULES`, else the books' Player's Handbook, else 2014). Rests use it (`rests.edition(cid)`); Q&A states it (`groupEdition(shelf, chosen)`, also without books); spells, stat blocks, Find online for creatures and item lookups try that edition's books first (`findSpell`/`findCreature` `{ edition }`, `search` `{ edition }`, `bookEdition`). The sheet's rules stay 2014 (later, SPEC §6.3). `PIPELINE_VERSION` 14 → 15 (Q&A prompt; main had reached 14 with the handout pictures). No schema change (settings are JSON).
- **Token hit points from the sheet:** a player character's token, once its player has saved a sheet, shows the sheet's current and maximum hit points (`hp_sheet: true` in the map view); hit points changed on the map are saved to the sheet (`maps.setSheetHp`, reason "hit points changed on the map"); the DM's token dialog greys out the maximum. `sheets.events` emits `save`; maps with that character are sent again (`maps.sheetChanged`) and the player hears `sheet {version}` on `/live`, so their open sheet loads the new version (keeping the status line's note). The token PATCH now returns the viewed token and copes with nothing to change on the map.
- **No charge recharge on a long rest** (owner's call), written into SPEC §6.4 and §6.8.
- **Docs made to match the code:** merchants put bought items into the inventory (HANDOFF decisions, README, `merchants.js` comment); typed attacks have no Proficient tick; AC and weapon bonuses are no longer "Later"; README's AC; SPEC §3.5's models table has the `walls` task at max effort; Find online covers items too; schema v15 and `campaign/settings.js`/`editions.js` in §3.1; creatures' AC in §4.2 and the README; the DM's view of equipped gear and of sales in the privacy table; the DM role wording ("the DM can do what's built; more may come"); §8 milestone 7; §9 open questions; README sections for the Inventory and campaign settings, the data list and the shared folder line.
- **Tests:** 375 after merging main (server 165: the edition beats `REST_RULES`, books pick the campaign's edition, `groupEdition` with a chosen edition, token hit points from the sheet; web 140: the Settings dialog's edition, the sheet following the token's hit points live).
- **Not tried for real:** in a real browser, or Ask with the real AI and an edition set.

### 2026-10-10: PR #31 merged

The owner said "Merge". `main` (with #26, #27, #28 and #30) was merged into the branch first (384 tests); both sides had bumped `PIPELINE_VERSION` to 14, so it is now **15**. PR #31 is merged into `main`; this file was updated to say so in the PR's last commit.

### 2026-10-10: AI walls show they're working

The owner: "The AI walls feature has no feedback. When we click the button, we have no idea if it's doing anything." Before, the only sign was a small grey line in the toolbar, and nothing said when it finished. Now:
- **Server:** `mapReader.walls` takes `onProgress` and reports `tracing`, `checking` (parts and parts done, as each close-up's check comes back), `tidying`; a throwing listener never stops the draft. The route writes it to `wall_draft` (`step`, `parts`, `parts_done`, `started_at`), so it reaches the DM live like any map change; on the end it adds `finished_at`, and on success `found` (counts of what was kept). Players get none of it. `normalizeMap` checks the new fields. No prompt change, so `PIPELINE_VERSION` stays; no schema change (it's in the map's JSON).
- **Page:** the button says "AI walls: starting…" at once and "AI walls: working…" with a spinner while pending. A message over the top of the map (`#map-ai-note`, so it shows in full screen and with Fog & walls closed) says the step and time so far (ticking each second), then "AI walls done: … in N min" with the notes, or why it failed with Try again. Closing it is remembered per browser until the next draft. The old status-line text for the draft was removed.
- Tests: 386 after bringing in PRs #26 to #28, #30 and #31 (server 167, shared 73, web 146): the reader's progress order, the route's live steps, `found` and times, a failed draft and a retry, and a page test of the working, done, closed and failed states.
- **Not checked:** a real browser, and the real AI's timings.

### 2026-10-10: PR #29 merged

The owner said "Resolve conflicts and merge". PR #29 (AI walls progress) had only SPEC and HANDOFF conflicts with PRs #26, #27, #28, #30 and #31; both kept. Merged into `main`; this file was updated to say so in the PR's last commit.

### 2026-10-10: The AI walls message closes again; walls at xhigh effort

The owner: "When we get the window saying the map was generated, it gets stuck. We cannot dismiss it", and "map generation consumes like 30% of the session tokens... instead of maximum effort reasoning, we will bring it to the next level down."
- **Stuck message:** the AI walls message (`#map-ai-note`, PR #29) sits inside `#map-view`, whose `pointerdown` handler (`viewDown`) skipped only the selection bar and turn order. Pressing ✕ or Try again started a pan and captured the pointer, so the browser sent the click to the map, not the button. `viewDown` now skips `.map-ai-note` too. The jsdom stand-in for pointer capture now remembers it (`hasPointerCapture`), and the page test presses on ✕ and checks the map didn't take the pointer (it failed before the fix).
- **Effort:** the `walls` task defaults to `xhigh` instead of `max` (`config.js`, `.env.example`; `EFFORT_WALLS=max` in `.env` brings it back). Nothing else in the draft changed (still a draft plus a check, close-ups on big maps). No prompt change, so `PIPELINE_VERSION` stays. If the owner's `.env` sets `EFFORT_WALLS`, that wins.
- Tests: 387 (server 168: the default effort).
- **Not checked:** a real browser; the token use at xhigh.

### 2026-10-10: PR #32 merged

The owner said "Merge". PR #32 (the AI walls message closes again, walls at xhigh effort) is merged into `main`; this file was updated to say so in the PR's last commit.

### 2026-10-12: The map creator (first stage)

The owner (2026-10-11): "I also want to be able to create maps from scratch. Meaning we want assets! And a fully fleshed out map creator. Let's start with the basics and we will build it up from there." This changes the 2026-10-07 direction that maps only come from imports: the DM can now make one, and a made map is an ordinary map.
- **Shared** (`shared/src/map-design.js`, served at `/shared/map-design.js`): the design (floors as a string per row, walls on half squares, placed assets), `normalizeDesign`, the tools' changes (`paintFloor`, `brushCells`, `fillFloor`, `addWall` with doors cutting their doorway out of walls and walls going round doors, `addRoom`, `eraseWallAt`, `assetAt`, `resizeDesign`), `designToMap` (pixels, grid, 5 ft squares, walls, fences as obstacles, doors, blocking outlines of assets, lights, difficult terrain as merged rectangles), and drawing with plain Canvas 2D calls: 11 floors and 22 assets drawn in code (seeded, so a map draws the same every time). `normalizeMap` keeps `design`, allows `image-r<n>` files, and walls, lights and terrain may have `source: 'creator'`.
- **Server:** `maps/design.js` draws a design on `@napi-rs/canvas` (70 px a square, WebP). `maps.createDesigned` and `maps.redesign` (a new `image-r<n>.webp` each save; `applyDesign` replaces the creator's walls, lights and terrain, keeps the DM's own, keeps a door open or locked, keeps ids of unchanged walls; forgets explored areas if the size changed). The view drops `design` (players never get it; the DM fetches it) and says `designed`; image keys change with a new picture. `routes/map-creator.js`: `POST maps/design`, `GET/PUT maps/:mid/design`, and the DM's own assets (`maps/assets.js`, a library like items: `map_assets` table, **schema v16**, archived as `map_assets/<id>/`, restored). No AI, so `PIPELINE_VERSION` stays 15.
- **Page:** `map/creator/creator.js`, opened from **Make a map** (map toolbar, an edit tool) or Map settings → Change in the map creator (in place of Read again with the AI for made maps). Tools down the left, the map on a canvas; the floor is kept on its own canvas and only painted squares are redrawn.
- Tests: 399 (server 172: creating, saving again, assets and restore, the db upgrade; shared 79: the design and its tools, designToMap, drawing the same twice; web 148: drawing a room, door, pond and campfire and saving, changing it from Map settings, an uploaded asset, closing with changes).
- **Checked in headless Chromium once:** the creator and the saved map look right (a fast drag skipped squares; fixed and tested). **Not checked:** a phone, a real GPU, big maps (60 × 60 is 4200 px; drawing it takes a moment on the server).

### 2026-10-12: PR #34 merged

The owner said "Merge". PR #34 (the map creator) is merged into `main`; `main` had nothing new, so the 399 tests are the ones that ran on the branch. This file was updated to say so in the PR's last commit.

### 2026-10-13: The map creator, second stage

Building on the first stage (the owner, 2026-10-11: "a fully fleshed out map creator. Let's start with the basics and we will build it up from there"). On the branch `claude/project-thread-iiuzhf` (merged as PR #35, below); SPEC v0.33, §6.6 "Making a map" has the details.
- **What can be in a design** (`shared/src/map-design.js`, design `v: 2`; older designs read the same): 32 floors (`FLOORS`: 14 built, 14 natural that blend into each other with uneven edges, and marsh, water, deep water and lava), 9 kinds of path (`PATH_KINDS`: roads, footpath, stepping stones, river, stream, lava flow, crack, blood trail), walls in 8 styles (`WALL_STYLES`) straight or curved (`arc`), with secret doors, windows and archways as openings; labels in three letterings (`LABEL_FONTS`, with IM Fell English and Cinzel bundled from `@fontsource` so the server's picture matches the page); the look (`LOOK`: mood daylight, dusk, night or gloom, a grid, shadows, glow, blending, the empty colour); and **356 built-in assets in 14 groups** (`ASSET_GROUPS`), including the Ship's deck (`hull`, outline from `hullShape`) and Round floor (`floor_round`). Assets can be tinted, flipped, layered, made difficult ground and made to lead to another map. Limits: 1500 walls, 800 assets, 80 paths, 100 labels. Helpers for scatter, copy, paste, turn and flip of areas.
- **Drawing** (`shared/src/map-art.js`, with `map-art-assets.js`, `map-art-farm.js`, `map-art-temple.js`, `map-art-ships.js`, `map-art-furniture.js`, `map-art-dungeon.js`, `map-art-outdoors.js`, `map-art-pieces.js`, `map-paint.js`): every floor, wall style, path and asset is drawn in code (original work, no licences), seeded so a map draws the same every time. Lights in the picture stop at walls, closed and secret doors and things that block sight (`lightAreas`, using the map's line of sight code).
- **Starting maps** (`shared/src/map-generate.js`, `map-generate-kit.js`, `map-generate-more.js`): 18 kinds made from a seed (`GENERATORS`): dungeon, cave, forest glade, village, tavern, camp, crypt, river crossing, ships at sea, harbour, temple, farm, mine, graveyard, wizard's tower, castle, sewer, dragon's lair.
- **Stamps:** 35 built in (`shared/src/map-stamps.js`: Rooms 16, Dungeon 6, Outdoors 10, Ships 3) and the DM's own (`server/src/maps/stamps.js`, `map_stamps` table, **schema v17**, archived as `map_stamps/<id>/changes.jsonl` and restored).
- **Server:** `maps/design-draft.js`, the **AI draft** from a description and an optional sketch (new task `design`: `MODEL_DESIGN`, else the maps model; `EFFORT_DESIGN`, default high; one structured call; in the background, kept an hour; counts against `MAP_AI_PER_HOUR`). **`PIPELINE_VERSION` 16** for its prompt. `routes/map-creator.js`: `GET maps/design/kinds`, `POST maps/design/generate`, `POST maps/design/draft` and `GET maps/design/draft/:id`, `POST maps/:mid/levels` (floors of a building: `level: {group, n}` on the map, -9 to 9), and `GET/POST/PATCH/DELETE map-stamps`. `routes/maps.js`: `GET maps/:mid/export.dd2vtt` (Universal VTT 0.3, `toUvtt` in `maps/uvtt.js`), walls PATCH `secret` and `reveal`, and tokens taking stairs between floors arrive at the same place. Secret doors look like wall to players until found (`doorKnown`), and map events tell the archivist when one is found. A made map's links come from its design (`source: 'creator'`).
- **Page:** `map/creator/creator.js` with `map/creator/panel.js` (14 tools with keys, the Things, Stamps, Look and Map tabs, and the box for what's picked) and `map/creator/start.js` (the start screen and floors of a building, with the floor below shown faintly). Pick several, redo, autosave to the browser. The DM's door bar has Make secret and Reveal; Map settings has Download .dd2vtt.
- Tests: 439 (server 182, shared 99, web 158).
- **Not checked:** the AI draft with the real AI; any of it in a real browser, on a phone or a real GPU; big maps' drawing time on the server; a `.dd2vtt` opened in another VTT. Kenny hasn't seen the new asset drawings yet.

### 2026-10-13: PR #35 merged

The owner: "Just go ahead and merge when it's done." Two small drawing bugs were fixed after the asset drawings were merged in, then PR #35 (the map creator's second stage) was merged into `main` with all 439 tests passing.

### 2026-10-13: Docs brought up to date with the whole first project

The owner is starting a new Claude project and asked for SPEC and HANDOFF to be "entirely up to date with everything discussed in this project". Checked against the old project's chat, every thread, its memory and its shared files, and the numbers against the code (schema v17, `PIPELINE_VERSION` 16, 356 assets in 14 groups, 32 floors, 18 starting-map kinds, 35 stamps). No code changed.
- **`docs/notes/`** (new): the design notes, research and checklists that only lived in the old project's files (sessions from notes, DM screen ideas, picture-asset research, VTT feature research, AI walls options, both audits, the map testing checklist, the 5e book checklist, the weekly recap), with a README listing each one's state. References to the old project's files now point here.
- **HANDOFF:** PR #35 marked merged and the numbers made `main`'s; PR #33's state (open, needs `main` merged in again); the owner's standing preferences ("Working with the owner"); a new "Parked, ruled out and on hold" table (3D renders, a C/C++/C# rewrite, a faster Ask model, the DM screen, ambient sound, premade maps, AI-made pictures, notes-session ideas he turned down); next steps for PR #33 and the picture-asset choice.
- **SPEC v0.34:** the picture-asset research (§6.6), sessions from notes only and the DM screen on hold (§6.3), PR #33 noted as proposed (§6.6), open questions gathered (§9), `docs/notes/` and the newer `map-art-*.js` files in the repo layout (§3.1).

### 2026-10-13: Every open question in HANDOFF; PR #36 merged

The owner: "Put all questions in the handoff and then merge." A new section, "Open questions for the owner", lists every question still waiting on him (19, from the first project's chat, threads, notes and SPEC §9), so the new project starts with them. PR #36 (this docs catch-up) is merged into `main`; this file was updated to say so in the PR's last commit.

### 2026-10-13: Regression tests and the regression-keeper worker

The owner asked for "a worker that will update and maintain regression tests": whenever something is found wrong and fixed, a test goes in for it, and every later change runs them again.
- **Regression tests** are ordinary tests named `regression: …`, kept next to the related tests. `npm run test:regressions` (root and each package) runs only them, with `--test-name-pattern` (about 17 seconds instead of 2.5 minutes). `npm test` still runs everything.
- **`docs/regressions.md`** lists each fixed bug, its date and its test, the rules (a regression test must fail without its fix; fix the code, never weaken the test unless the owner changes the behaviour), and past fixes from this log not yet covered by a tagged test.
- **The worker:** `.claude/agents/regression-keeper.md`, a Claude Code subagent that adds a test for a fix (and proves it fails with the fix taken out), checks a change against the regression tests and the full suite, and backfills past fixes.
- **The hook:** `.claude/settings.json` runs `.claude/hooks/regressions.mjs` before every `git commit` in Claude Code; if `packages/` has changes it runs `npm run test:regressions` and stops the commit when one fails. Checked: other commands and clean runs pass through; a regression test made to fail stops the commit with its name.
- **First two:** the SSE stream that never closed (2026-10-03) and OCR words broken into pieces (2026-10-08) already had tests; they were renamed `regression: …`. Six more past fixes are listed for backfilling.
- AGENTS.md has the rule; README "Tests" and SPEC §3.1 describe it. No app behaviour changed; 439 tests pass.

### 2026-10-13: Regression suite reviewed; four more past fixes tagged

The owner started a "Regression tests" thread in the new project to own this suite. The suite above was on a branch that hadn't been merged yet, so it comes in with this change.
- Went through this change log for every bug that was fixed and looked for a test guarding each. Four already had a test that does exactly that and were renamed `regression: …`: the top bar jumping between tabs (2026-10-10), Classic 3D dice pushed below the window (2026-10-07), live map streams carrying on after a block, removal or demotion (2026-10-07), and campaign names with extra spaces that couldn't be deleted (2026-10-04). 6 regression tests now.
- `docs/regressions.md` "not yet covered" now lists ten past fixes, with where each is partly tested already. Next: backfill them a few at a time, each proved to fail without its fix.
- **The owner's rule** (2026-10-13): regression tests only check that past bugs haven't returned; they are never end-to-end tests, which waste credits. Checks that need his machine go in the new "Checks to run in VS Code" section above, which a VS Code session runs and then clears. Written into AGENTS.md, `docs/regressions.md` and the worker's guide.
- No app behaviour changed; 439 tests pass.

### 2026-10-13: Review sheet

The owner: "One nice feature may be to review a character sheet. See if it's valid based on level, class, etc. The AI can do this, using the books as guides and, if missing, looking it up online." (The point buy calculator in the same message is its own thread.)
- **Default picked:** the review runs only when the player presses **Review sheet** (not on every edit), to keep AI use down; it reviews the saved sheet and saves nothing.
- **Server** (`sheets/review.js`, `POST /campaigns/:cid/sheet/review`, players and their own sheet only): `sheetChecks` does what needs no AI (levels, XP unless milestone, scores, multiclass prerequisites, spells above the slots, expertise, typed-over proficiency bonus, slots, saves and hit points); then an agent run (task `review`, medium effort, 16 tool calls) with Ask's book tools (moved into `bookTools()` in `qa/tools.js`, shared), a `look_up_online` tool that runs `research()` (3 per review) and `submit_review` for its findings. The AI counts towards `SHEET_AI_PER_HOUR`; when it can't run, the rules checks still come back with why. Only the rules parts of the sheet go to the AI (no backstory or looks).
- **Page:** the button next to Upload a sheet; results above the sheet under "Against the rules" and "Worth checking", with the edition and where each rule is, until closed; hidden when printing.
- SPEC §6.4, §3.1, §3.5 and §6.1, README's API table and `.env.example` updated. 457 tests pass (server 193, shared 100, web 164). Not tried with the real AI yet: on the VS Code list.

### 2026-10-13: Every past fix has a regression test

The owner: "Just merge stuff. If it's broken we will fix it." PRs #37 (the regression setup) and #38 (four tests tagged, the VS Code list) were merged. Then the past fixes that had no tagged test got one each (12 tests, in two batches): the DM's sheet (403), a web stat block keeping its source on a map, DMG footer page numbers, the AI walls message that couldn't be closed, logins switching without a reload, `h()` nested children, a bad speaker link refused before archiving, the claude.ai connectors kept out of Claude Code runs, top-level text in an answer, short book-search terms as whole words, an ambiguous book name, and a fast drag in the map creator. Each was checked to fail with its fix taken out of the source and to pass with it back. 18 regression tests, all small with the fake AI; nothing needed the VS Code list. 451 tests pass.

### 2026-10-13: Point buy calculator

The owner asked for "a point buy calculator. It shouldn't always be visible. Maybe a toggle that makes it appear near the core abilities and updates as you enter them. 2014 rules set bonuses based on race while 2024 let's you choose." Built as SPEC §6.4 "Point buy calculator": a Point buy button by the ability scores in every layout (off to start, `point_buy.on` on the sheet); the rules in `shared/src/point-buy.js` (27 points, 8 to 15, the PHB costs; 2014 race bonuses for the 15 PHB races and subraces, Half-Elf and Variant Human choosing; 2024 bonuses chosen by the player, limited to a 2024 PHB background's three abilities). The sheet's scores stay the truth: the calculator works back from them, so typing updates it, and its buttons and bonus choices change the scores. Defaults picked: the campaign's edition unless the sheet picks one; bonuses from levels and feats not counted. The archivist doesn't see the calculator's settings as sheet changes. New tests: shared (5), web (1), server (1); a check in a real browser and on a phone is on the VS Code list.

### 2026-10-13: Live at thepartyledger.fyi

The owner picked and bought `thepartyledger.fyi` (Cloudflare Registrar), put the Cloudflare API details in `API_key`, and asked to "get it set up properly so the server can be accessed through the domain".
- **`API_key`** is git-ignored now (it had never been committed), and `.vscode/settings.json` tells VS Code it's plain text (it guessed JSON and showed errors). Regression test `server/test/security.test.js`: the API_key file (Cloudflare details) is git-ignored.
- **Cloudflare, through the API:** a tunnel `thepartyledger` managed from the dashboard; `thepartyledger.fyi` and `www.` routed to `http://127.0.0.1:4400` (anything else 404); proxied CNAMEs to the tunnel; Always Use HTTPS on; minimum TLS 1.2. Universal SSL (Let's Encrypt) issued about 20 minutes after the zone went live.
- **This PC:** `cloudflared` 2026.10.0 installed with winget and running as the automatic Windows service `cloudflared` (one admin prompt).
- **`PUBLIC_URL`** defaults to `https://thepartyledger.fyi` (`config.js`, `.env.example`), so HSTS is sent for real and the start-up line shows the real address.
- **A site password in front was considered and dropped** (owner: "It already has a login page anyway"). Cloudflare Access (email codes) would be the built-in way if it's wanted later; a shared password would need code, since the page's `Authorization: Bearer` header rules out HTTP Basic auth.
- **Checked through the domain:** the page (200, valid certificate, CSP and HSTS headers), `www.`, http → https (301), `/me` without a login (401), and the server sees players' real addresses (not 127.0.0.1) for its login limits.
- Docs: README "The public address" (how it's set up and where), SPEC §3.4 and v0.37.
- Tests: `npm run test:regressions` passes. `npm test`: shared 105/105; server 192/195 and web 163/165, where every failure is the Windows `EPERM` clean-up in the map creator tests. That also fails on unchanged `main` (Next steps 6a).

### 2026-10-13: Restarting the server from a phone (Remote Control)

The owner wants to give Claude Code orders from a phone and have it edit this PC's copy in VS Code and restart the server. That's Claude Code's Remote Control (`/remote-control` in the VS Code extension, then the session shows in the Claude app under Code). Nothing in the repo is needed for Remote Control itself. The CLI `claude` isn't installed on this PC, only the VS Code extension.
- **`npm run restart`** (`scripts/restart-server.js`): stops the node process listening on the server's port (only if it is node; it refuses anything else), starts `packages/server/src/index.js` detached with output to `data/server.log` (the previous run's moved to `server-previous.log`), and waits up to 30 seconds for it to answer, printing the log's end if it doesn't. `npm run restart -- stop` only stops. Port and data folder come from `config.js`, so `.env`/`PORT`/`DATA_DIR` are respected. On Windows the old server is ended at once (no clean shutdown is possible from another process), like closing its terminal.
- AGENTS.md tells sessions to use it, and to say that a restart briefly takes the site down. README "The public address" and the Windows gotcha point to it.
- **Checked:** on port 4401 with a throwaway data folder (the live server on 4400 untouched): start with nothing running, the server still answering after the shell that started it ended, restart (old pid stopped, new one answering, the previous log kept), stop. **Not checked:** that a server started this way keeps running after VS Code itself closes; a real restart of the live server from the phone.

### 2026-10-14: A Room without walls

The owner, after the entry below: the trouble with several floors was that each Room comes walled all round; the wall style could change but not whether there are walls. The Room tool now has **Walls all round** (ticked to start with); unticked, it lays only its floor (the wall styles hide), for a patch of another floor indoors or out. The Floor tool's Rectangle already did that, but the owner reached for Room. SPEC §6.6.
- Test: `web/test/creator-tools.test.js`, "regression: creator: the Room tool can lay its floor without walls" (in docs/regressions.md).

### 2026-10-14: Several floors in one map, made plain

The owner noticed the map creator asks for one floor and said maps need several kinds. The creator could already do that (every square has its own floor: the Floor brush and rectangle, Fill, a Room's own floor, Round's floor; generated maps and AI drafts mix them), but the start screen's lone, unlabelled "floor everywhere" box read as "the map's floor". Now it's labelled **Floor to start with** with a line saying a map can have as many kinds of floor as you like and how to paint them, and the Floor tool's panel says to pick a floor, paint, then pick another. SPEC §6.6 says so too.
- Test: `web/test/creator.test.js`, "creator: the start screen says its floor is only a start, and a blank map takes several floors" (flagstones, then a square of stone and one of water, saved as one map).

### 2026-10-14: The archivist archives thoroughly; nothing is cut short

The owner: "I want to make sure it archives data THOROUGHLY. No truncating or shortening. We can make the databases we store information in as complicated as large as we like, as long as they're usable. What matters is speed and accuracy here." There's one archivist; its knowledge base answers both the DM's and the players' questions, so both sides were covered.
- **Instructions** (`kb/archivist.js`): be thorough (every detail, not a summary; exact wording kept for deals, oaths, prophecies, riddles, inscriptions, letters; size is not a concern), never lose information when updating, merging, splitting or restructuring (keep the history of changed states), split a record that nears the size limit rather than shortening it, go through the material start to end and check it again before finishing. Pinned records stay short but point to the full ones. `PIPELINE_VERSION` 17.
- **Nothing cut short** (`fit.js`): every archivist and Q&A tool result is built from whole records, chunks and lines; what doesn't fit is named with the tool to fetch it (`list_records` pages with `offset`; `read_transcript` says where to continue). Before, results were cut mid-record at 8,000 tokens (archivist) and 2,500 (Q&A), and the Q&A pre-search cut every piece to an equal share. Budgets now 24,000 and 5,000 tokens, pre-search 5,000; Claude Code's own 25,000-token cut on a tool result is lifted (`MAX_MCP_OUTPUT_TOKENS`).
- **What the archivist reads between sessions** (`kb/updates.js`): sheet text fields were cut at 4,000 characters and each change (and note edit) at 600; now everything is whole, a long text that changed gives its changed lines word for word, and the sheet adds each item's description, inspiration, hit dice spent, death saves, spell slots used and the player's own spells' text. Handout pictures are described in full, not in "two to six sentences".
- **Search over long text** (`search.js`): the embedding model reads only a text's first ~256 words, so meaning search missed the rest of long records and chunks. Docs are now embedded in overlapping 150-word windows and score by their best one; old docs are embedded again in the background on start-up.
- **Bigger limits:** a record may be 8,000 tokens (was 4,000); an archivist run 500 tool calls (was 250) and $50 on the API (was $25). The pinned budget (6,000) is unchanged, since it goes into every question (speed).
- Regression tests: `server/test/kb.test.js` (archivist tools, Q&A tools and pre-search, meaning search windows) and `server/test/updates.test.js` (sheets and long changes in full); each fails without the fix.
- Docs: SPEC v0.38 (§3.1, §3.5, §5.1, §5.2, §5.3), `docs/regressions.md`. On the VS Code list: a real run.
### 2026-10-14: Faster line of sight

- The owner: "The field of view feature on the map is slow and laggy." Researched first (timings in the Claude project's `research/field-of-view-performance.md`): every token move had the server recompute every player's sight (every ray against every wall, lit areas per player) and redraw the whole picture per player with sharp (4 to 6 s on a 60 × 60 creator map), and the page only showed newly seen places once that new picture arrived. Panning a dark map ran at about half speed (the fog's SVG mask redrawn every frame).
- The owner then decided what a determined player can dig out of their browser doesn't matter ("just a game for mates"). So: players get the plain picture (the same immutable file as the DM), the walls that block as plain lines (secret doors as wall), the lights and `fog.explored`; the page draws the fog with `playerFogMask` (shared), following their token while it's dragged (not past a wall). The server still decides which tokens, doors, links, templates and terrain they get, and marks explored cells. `maps/image.js` is gone. AGENTS.md's rules on display-only clients and privacy note the exception.
- `sightPolygon`: walls in a grid of cells, each ray walks the cells (DDA) and stops at its first hit; shared ends cast one set of rays; with a reach, walls out of reach are left out and the corners where walls cross the reach's edge are exact (they used to be cut off: a regression test). `litAreas` keeps each light's polygon per set of walls, shared by every player and kept while tokens move; lights nowhere near a token's sight are skipped.
- The map stage gets `will-change: transform` while panning or zooming, cleared 250 ms after it settles (so it's sharp at the new zoom).
- Tests: three regression tests (light corners, a 2,000-piece map quick and identical to testing every wall, the fog following a drag); the fog tests now check the mask the page would draw instead of the server's picture. No prompts changed, so `PIPELINE_VERSION` stays.

### 2026-10-14: Open pages reload after an update

- The owner, after the line-of-sight update and restart: "There's no fog of war now at all." [Edit, later the same day: wrong guess, see "Players' fog back on the server" below; the reload is kept anyway, since an old tab could run old page code.] His phone's tab was thought to be from before the restart, so running the old page (which expected the server to black out the picture) against the new server (which sends the plain picture). A reload fixed it, but any player with a tab open during an update would have seen the whole map.
- Every response now carries `X-Page-Version` (a hash of `web/public` and the modules the page imports, worked out when the server starts; set on the raw response so live streams carry it too). `api.js` remembers the first one it sees and reloads the page when it changes, waiting until the person leaves a field they're typing in (or the tab is hidden).
- Tests: a regression test (the page reloads, not while typing, once) and a server test (the header on ordinary responses, failed logins and live streams).

### 2026-10-14: Fog drawn on a canvas

- The owner, after the line-of-sight update: "There's no fog of war now at all. Nothing greyed out", still after reloading his phone. The fog's data was right (checked on his machine: 75 fog shapes for a player on the castle courtyard map, grey mode), so the phone's browser wasn't drawing the large SVG `<mask>`; before the update the server had blacked out the picture itself, which hid this. Desktop and emulated-phone Chromium draw the mask fine, so it couldn't be reproduced here.
- The fog is now painted on a `<canvas>` (`#map-fog-canvas`, at most 2048 px across) in `drawFog`: each shape first clears what's under it, then fills with its shade, clipped to the token's sight where it has one. The DM still sees it at 55% so the picture shows through. The SVG layer keeps only the DM's fog-rectangle draft.
- Tests: a regression test (the fog goes to the canvas, no SVG mask); the fog tests read the drawn shapes from `state.fogShapes`.

### 2026-10-14: Players' fog back on the server

- The owner, after the canvas fog was live and pulled onto his machine: "Still broken. Maybe rollback to previous method with optimizations there." So the server draws each player's fog into their picture again, as before "Faster line of sight": players get no walls or lights, `fog.mask` comes from the server, `image_key` changes with it, and `maps/image.js` is back. Kept: the faster sight maths and lit-area cache (`shared/map.js`), `will-change` while panning, the canvas drawing of the page's fog layer, and pages reloading after an update.
- Dropped: the fog following a dragged token (it needs the walls on the page), and its regression test.
- `maps/image.js` now draws the fog as a plain greyscale SVG (shapes painted in order on black, no `<mask>`) and uses it as the transparency of a fog-coloured layer, and encodes WebP at effort 1: a 4200 × 4200 picture takes about 2.5 s instead of 6.6 s. The per-player redraw on each move is still the main cost on big maps.
- Tests: a regression test (a player's picture is greyed out behind a wall by the server, and players get no walls); the server's pre-#45 fog tests are back. SPEC v0.41, AGENTS.md (the client-side fog exception removed), README.

### 2026-10-14: Phone layout, first stage (shell, Ask, Notes, Handouts)

- PR #48, merged 2026-10-14.

- The owner: "start working on a mobile UI… It can't work like the desktop one… Each page should be a full layout with no wasted space, and nav buttons should be only visible when called on. Compact menus are key." The plan, the stages and how it works: [docs/notes/mobile-ui.md](docs/notes/mobile-ui.md).
- On a phone (`data-phone` on `<html>`, from `page/look-boot.js`: under 640px wide, or a touch screen under 500px tall), the top bar is hidden; a ☰ button in the top right corner opens it as a sheet from the bottom (the pages as tiles, then Dice, Rest, Settings, Look, password, log out). Toolbars fold into ⋯ menus (`phoneMenu()` in `phone.js`). Look → Page → **Phone layout**: Automatic (default), Always, Never. Styles in `mobile.css`, all scoped to `:root[data-phone]`.
- Converted: Ask (pin, rename, delete and New chat in ⋯; a one-line question box that grows), Notes (box and Save in one row; no Ctrl+Enter hint), Handouts. Other pages are unchanged, just pushed below ☰. Nothing goes beside the map on a phone. Tabs don't focus their text box on a phone (no keyboard popping up).
- Checked in headless Chromium at iPhone 13 size (Tavern and Arcane): the menu, Ask with an answer, the chat menu and drawer, Notes, Handouts; no page errors. Not on a real phone yet (on the VS Code list).
- Tests: `web/test/phone.test.js` (when the layout applies, the ☰ menu opening and closing, the chat's ⋯ menu, nothing beside the map, every phone rule scoped to phones). SPEC v0.42 (§3.1, §3.3).

### 2026-10-14: Phone layout, second stage (Sheet and Inventory)

- PR #49, merged 2026-10-14.

- The Sheet's bar stays at the top while the sheet scrolls, in one row: Next d20 (Normal / Adv. / Disadv.), whether it's saved, and ⋯ for Review sheet, Upload, Download, Print and Pop out. The sheet's boxes are tighter on a phone (`--gap`, `--pad`, `--ctl`).
- Inventory: the item box and Add in one sticky row, Add by hand in ⋯; "Added Longsword" shows as a small note under the row.
- `phoneMenu()` now moves the folded buttons into a list inside the bar (`display: contents` off a phone, so the desktop page is unchanged), so opening ⋯ no longer lifts the whole bar out of the page; it has a Close button.
- Checked in headless Chromium at iPhone 13 size: the sheet scrolled with the bar staying put, its ⋯ menu, the Inventory with two items and its ⋯ menu; no page errors. Tests: `phone.test.js` (the sheet's and the Inventory's menus, Print from ⋯).

### 2026-10-14: Phone layout, third stage (Map)

- PR #50, merged 2026-10-14.

- On a phone the map fills the whole screen with no border. Its main tools (Fit, Measure, Ping, Draw, Initiative, plus any tool that's on) float in one row at the bottom, in reach of a thumb; **⋯** opens every map tool as a sheet from the bottom (the map picker, what the map is, Grid, Walls, Pin, Template, and the DM's Edit, Add token, Fog & walls, Map settings, Import, Make a map). Picking a tool closes it; ticking Grid or Walls doesn't. It is `#map-more` (full screen's More), opened as a sheet by `phoneSheet()` on a phone.
- The DM's fog and wall tools are strips above the main row that scroll sideways. The picked token's bar sits just above the tools (their height is measured), the turn order under ☰, the AI walls note at the top left.
- Hidden on a phone: Beside the map, Sheet window and Full screen (the map already fills the screen). The map toolbar place under Look doesn't apply on a phone.
- Checked in headless Chromium at iPhone 13 size as a player and as the DM (the row, the ⋯ sheet, a picked token, the turn order, fog and wall strips); no page errors. Pinch zoom and dragging tokens need a real phone (on the VS Code list).
- Tests: `phone.test.js` (⋯ opens the sheet, Measure closes it and is on, Grid leaves it open, off a phone More opens no sheet).

### 2026-10-14: Phone layout, fourth stage (dice and dialogs)

- PR #51, merged 2026-10-14.

- On a phone every dialog (Rest, Settings, Look, tokens, creatures, items, merchants, the shop…) is a sheet from the bottom, the full width of the screen, with its buttons in a row that stays at the bottom while the rest scrolls. The map creator is left as a whole page.
- The dice tray comes up from the bottom too, without the keyboard tips, and opening it focuses its first button instead of the notation box (the keyboard would cover the dice).
- Checked in headless Chromium at iPhone 13 size: dice, Look, Rest, Settings and New creature; no page errors. Tests: `phone.test.js` (the dice tray doesn't focus a text box on a phone, does on a PC).

### 2026-10-14: Phone layout, fifth stage (the DM's pages)

- PR #52, merged 2026-10-14.

- Creatures, Items and Merchants on a phone: Find and **+ New** in a row that stays at the top while the list scrolls; Find online (and Items' Look up) in ⋯; the status ("Looking up…") shows as a small note under the row. "What the players have equipped" has a smaller heading with Refresh beside it. The Archivist's first heading leaves room for ☰. The map creator is left as it is (a whole page).
- Checked in headless Chromium at iPhone 13 size as the DM; no page errors. Tests: `phone.test.js` (what stays in each row, what goes in ⋯, New still opens its dialog).

### 2026-10-14: Phone layout, last stage (login and admin), and ⋯ menus under the scrim

- Login, password and campaign screens on a phone: the form fills the screen (no floating card). The admin screen: the header stays at the top with Look, Change password and Log out in ⋯; tighter sections; the access rows no longer spill sideways.
- **Fixed:** the ⋯ menus of bars that stay at the top (Sheet, Inventory, Creatures, Items, admin; since PRs #49 and #52) opened under the dimmed scrim: the bar's own z-index kept its menu below it, so a tap closed the menu instead of pressing the button. A bar with its menu open is now lifted over the scrim. Regression test in `phone.test.js`, listed in `docs/regressions.md`. Seen in headless Chromium: the Sheet's Review and the admin's Look now open from ⋯.
- All six stages of [docs/notes/mobile-ui.md](docs/notes/mobile-ui.md) are built. Nothing of it has been seen on a real phone yet (the VS Code list has the check).

### 2026-10-14: Page-drawn fog put back for a retest

- The owner: "We tried to make fog of war faster earlier. It didn't work. I think it's because I had cached data. So let's try again what we tried before and this time I'll clear data before a test." So the "Players' fog back on the server" change is reverted: the code is as it was after "Fog drawn on a canvas" (players get walls and lights and the plain picture; `maps/image.js` is gone again; the fog follows a dragged token, with its regression test back). The rollback's own regression test (the server draws fog into the picture) went with it.
- Note for the retest: the page's own modules are served `no-cache` and pages reload on a new `X-Page-Version`, so stale page code was thought ruled out; the picture itself is cached for good (`immutable`, keyed by variant). Clearing the site's data covers both.
- On the VS Code list: the retest on a phone, with what to note if it fails.

### 2026-10-14: Companions and summons as tokens players control

- The owner: "If players have companions or summons, they should be tokens under the players control. Which also means their rolls and movement." A fourth token kind, `companion` ("Companion or summon"), with a `user_id` like a player character's (`PLAYER_KINDS`, `ownToken` in `shared/map.js`).
- Players add their own with **Companion** on the map toolbar (`map/companions.js`; one of the map tools Look can hide): name, size, max HP, darkvision, and the stat block from the AI by default. The server (`addCompanion` in `routes/maps.js`) only takes those fields, puts it where they can see or next to their character, and caps it at 12 per player per map. The DM's Add token has the kind too: pick the player under "Who is it?" and tick "A companion or summon of theirs" (Kind stays hidden for a player, as the regression test from #56 wants).
- The player moves it (walls stop it), changes its HP, conditions, light, darkvision, name, size, colour, speed and stat block, fills its stat block with the AI (their lookup skips the DM's creatures: `dmCreatures: false` in `maps/stats.js`), and dismisses it. Its stat block goes only to them and the DM; everyone sees its HP in full.
- It's one of the player's tokens for line of sight (`sightOf`), doors and links, so a familiar can scout. In a fight it rolls initiative from its stat block like an NPC; its player can type its roll and end its turn.
- **Roll** on a selected companion: its attacks (to hit, then damage) and ability checks, read from the stat block (`statBlockRolls`, `abilityModifier`; `dexModifier` now uses the latter).
- Tests: `test/companions.test.js` (server), a page test in `web/test/map.test.js`, and `statBlockRolls` in `shared/test/map.test.js`. Not tried in a real browser or with the real AI (VS Code list).
- Not built: companions listed on the character sheet (they're per map for now), and druids' Wild Shape forms (asked for separately).

### 2026-10-14: Turning the map with two fingers

- The owner, trying the phone layout: "We should be able to rotate the map on mobile." Twisting two fingers on the map now turns it (after 15°, so a pinch doesn't), on any touch screen. Tokens, pins and links stay upright; an N button (top left, only while turned) turns it back; within 8° of north it straightens when the fingers lift; Fit resets it. Each screen's own view, never saved. `turnAt`, `northUp` and `toView` in `map.js`; `toImage` undoes the turn.
- **Fixed:** the finger that stayed still in a pinch counted as a tap when lifted (in Pin or Ping mode it dropped a pin or pinged). Regression test in `map.test.js`.
- Seen in headless Chromium only; turning with real fingers is on the VS Code list.

### 2026-10-14: Add a token asks who it is once

- The owner, with a phone screenshot: "For adding a token, those top three overlap in meaning. We want this screen more tidy and sensible." "From your creatures", "From the campaign's records", "Kind" (and "Player", shown for a player character) all asked who the token is.
- Now one **Who is it?** list: Someone new, then Players, Your creatures, the people in the records and the other things in them, each group only when it has something. Picking a player makes a player character and hides Kind; a creature goes to Place as before; a record names the token and guesses the kind. Name and Kind share a row (Name gets two thirds). Editing a token has the same list without creatures ("Nobody in particular" unlinks it). Picking a player keeps a record the token was already linked to. Only `map/dm-tools.js` and a few lines of CSS; the server is unchanged.
- Regression test in `map.test.js`. Seen in jsdom only; a look on a real phone is on the VS Code list.

### 2026-10-14: Status messages can be closed and go by themselves

The owner (from his phone): the "Searching the web for …" message on the Items page "stays around. There's no way to get rid of it and it doesn't seem to time out." On a phone the status lines of Items, Creatures, Merchants and the Inventory's add box float over the page, and they kept their last message forever. Now every message there (`note()` in `api.js`) has a ✕ and goes by itself: 8 seconds when done, 20 for an error, up to 2 minutes for one still working ("…"). The "Searching the web" message also goes as soon as nothing is being searched for. Regression test: `web/test/app.test.js`, "a status message can be dismissed and goes by itself".

### 2026-10-14: Wild Shape for druids

- The owner asked: "Druids should be able to present forms that they can turn into from their character sheet (this should only show if they are a druid), and these forms, when activated, should have tracked health, abilities, and roles. Look up existing druid mechanics for context."
- `shared/src/wild-shape.js`: forms on the sheet (`wild_shape: { forms, uses_spent, active }`), limits by druid level for 2014 (PHB p. 66, Moon CR and elementals) and 2024 (uses 2/3/4, forms known, temporary hit points, Moon AC), turning into a form, form hit points with carry-over at 0, stats in a form (beast physical scores, the druid's mental ones and proficiencies, the beast's bonus when higher), rests.
- `server/src/sheets/forms.js` + `srd-beasts.json` (the SRD 5.1's 87 beasts and 4 elementals from 5e-bits/5e-database, CC BY 4.0): `GET /forms` and `GET /forms/lookup` (SRD, books, AI memory; never the DM's creatures). `GET /sheet` now also returns the campaign's `edition`.
- `web/public/sheet/wild-shape.js`: the box (in every layout under Attacks; in Tabs, on the Actions tab) and a line under the name while in a form. Map tokens show a 2014 form's hit points and speed; damage on the token goes to the form (`maps/store.js`). Short and long rests give uses back (`shortRest` takes the edition now). The archivist's sheet text lists the forms and the one in use.
- Defaults Claude picked: the limits are enforced (Turn into is greyed out with the reason) except 2024's forms known, which is only noted; the form's details come from the lookup and aren't edited on the sheet (remove and add again).
- Tests: shared (rules, both editions), server (lookup, map token hit points), web (the box end to end); seen in headless Chromium at phone and desktop width.
- Follow-up (owner): spells stay usable in a form; the box's note says casting needs druid 18 (Beast Spells) and that the DM decides, and from 18 that they can. Class and subclass features are noted under Next steps as later work.

### 2026-10-14: Class features box (every class), Wild Shape moved into it

- The owner asked for a survey of which classes need features like Wild Shape (`research/class-features-survey.md` in the project's shared folder; the 2014 PHB from his PC, 2024 from the web), then agreed a design (`research/class-features-design.md`): one rules list and one box, the DM sees it, Rage as charges like spell slots, rows of the player's own, Wild Shape part of it. Then: "add the class features one by one, for each class. If anything already exists on the sheet for a class, migrate it."
- `shared/src/class-features.js`: every class's rows for 2014 and 2024 (Barbarian to Wizard, plus Tasha's Artificer), worked out from each class's own level; uses, pools and info rows; recharge short / long / short_one / none; typed-over maximums; the player's own rows; `restClassFeatures` (called by `shortRest`/`longRest`); Flexible Casting, Arcane Recovery, pact slot recovery, Sorcerous Restoration, healing rows.
- Migrated: Wild Shape's uses moved from `wild_shape.uses_spent` to `class_features.spent.wild_shape` (read over from old sheets in `normalizeSheet`); its box became the forms panel under the Wild Shape row. Nothing else on the sheet was class-specific state (Unarmored Defense, Pact Magic and the monk's speed stay as they were).
- Server: `POST /sheet/features/use` (Second Wind, Uncanny Metabolism: rolled like hit dice); `GET /gear/equipped` adds each player's `features` and `wild_shape`, shown on the DM's Items tab; the archivist's sheet text lists the uses left.
- Defaults Claude picked: ticking is never blocked (the DM decides); a short rest's status names what came back; Flexible Casting only gets back spent slots (no slots above the maximum); Metamagic and Invocations stay in Features & traits.
- Tests: shared (rows by class, level and edition, rests, own rows, migration, slot actions), server (Second Wind route, rests, the DM's view), web (the box: ticks, a typed maximum, an own row, Second Wind; Wild Shape inside it).

### 2026-10-14: Every page can pop out into its own window

The owner asked for what the sheet already had on every page. A **Pop out** button in the top bar opens the tab you're on in a window of its own: the same page at `/?view=<tab>&campaign=<id>` (the map's window is bigger), showing only that tab with no tabs bar and nothing beside the map. The sheet's own Pop out and the map's Sheet window are unchanged (`?view=sheet` still loads only the sheet). Popping out a panel that was beside the map takes it away from there; a blocked pop-up is explained; a window for a page the person doesn't have (a player at `?view=creatures`, say) says so. Other windows than the sheet load as the main window does, so they don't tell each other about changes (only the sheet does). No Pop out on a phone. Code: `page/side-panel.js` (`WINDOW_TAB`, `popOut(tab)`), `app.js`; tests in `web/test/sheet-place.test.js`.

### 2026-10-14: Subclass features

- The owner: "We have a feature for class features. I want one for sub-classes too. Start working through the books to add them." The books folder has the 2014 PHB (read for the subclass pages) and the 2024 DMG; the 2024 PHB's subclasses come from Claude's knowledge, as the class features did.
- `shared/src/subclass-features.js`: `SUBCLASSES` (all 54 PHB subclasses: 40 in 2014, 48 in 2024, many in both) and their rows, added to `FEATURES` with `sc`; `featureRows` matches them on the typed subclass per class, keeps 2024 subclass rows from 3rd level, and rows carry `subclass`. New actions: `healWithSlot` (Combat Wild Shape, heals the form), `setRolled`/`useRolled` (Portent, cleared on a long rest), `arcaneRecovery` takes an `id` (Natural Recovery); healing rows can heal a set number (2014 Wholeness of Body) with no roll.
- Server: `POST /sheet/features/use` takes `slot` and handles Portent; `/shared/subclass-features.js` is served to the page.
- Page: the box has a Subclass features heading, a line for subclasses it doesn't know, Heal form with a slot picker, Portent's kept numbers; the subclass box on the sheet suggests the class's PHB subclasses.
- Defaults Claude picked: Combat Wild Shape's button works outside a form too (heals the druid; the DM decides); a subclass from another book isn't guessed at; nothing is blocked by the box.
- Tests: shared (`subclass-features.test.js`: matching, editions, levels, every subclass has clean rows, numbers, rests, Natural Recovery, Combat Wild Shape, Portent), server (the use route for the slot heal, Portent and a set heal), web (the section, the suggestions, a subclass from another book).

### 2026-10-15: Height on maps (raised areas, token heights, sight over them)

- The owner, with a castle map: buildings you can see onto but not past, castle walls you can stand on, tall creatures. After a brainstorm in the Claude project (his side-view drawings showed simpler rules were wrong), he asked for the standard method: two creatures see each other if the straight line from one's eyes to the top of the other's head stays above the ground. Then: "Implement it".
- `shared/src/map.js`: `raised` on maps (`normalizeRaised`, up to 300 flat-topped areas with a height in feet, the highest counting where they overlap; `groundAt`), `height` (null: the sheet's or the size's, `SIZE_HEIGHTS`) and `elevation` (feet above the ground) on tokens, `parseHeight` for the sheet's Height text, `tokenTall`, `eyeOf`/`headOf` (eyes 1 ft below the top), `heightEdges` (every edge with the higher side's height, cached), `heightClear` (the line's height at each edge it crosses must clear it), `canSeeToken` (sight polygons, then heights; the DM's reveals win), `heightShadows` (fog cells, the map's squares or 1/64 of its long side, covered where none of the player's tokens sees a Medium creature standing there; explored cells dim, the DM's reveals clear), added to `playerFogMask`.
- Server: `PATCH /campaigns/:cid/maps/:mid/raised` (DM: add, set a height, remove, clear); tokens take `height` and `elevation` (players for their own); the view gives every token `tall` (from a player character's sheet) and players `raised`, and filters tokens with `canSeeToken`.
- Page: Raised area tool and a feet box in Fog & walls (drag for a new one, click one to give it the box's height, Erase removes it), outlines and heights shown while the panel is open, an ↑/↓ badge on tokens that aren't on the ground, Tall and Up boxes in the token's bar.
- Defaults Claude picked: walls still block whatever the height; raised edges don't block movement yet; the fog shows where a Medium creature would be seen; with several tokens a player sees what any of them sees over the heights.
- Tests: shared (`map-height.test.js`: the owner's three drawings, giants, flying, ground height, sheet heights, the fog), server (`heights.test.js`: who players get, the DM's route, sheet heights), web (the Raised area tool and the badge).

### 2026-10-15: Subclasses from more books, race features and racial feats

- The owner: "There are more books on my device. Keep track of what you've worked through, and start working through the new ones to add classes and subclasses. In the same way we have class and sub-class specific feats, we also want race feats where applicable." The folder (now `D:\Code\DND books`, beside the repo) has 14 PDFs; Glory of the Giants is a picture-only scan with no text.
- `docs/notes/books-worked-through.md` (new): each book, what was taken from it, and what's left.
- `shared/src/subclass-features-books.js` (new): 58 subclasses (Xanathar's, Tasha's with the artificer's, Fizban's, DMG 2014, Glory of the Giants) in the PHB's shape, checked against the PDFs; joined into `SUBCLASSES` and `SUBCLASS_FEATURES`. The PHB 2024 subclasses first printed in those books (`REPRINTED_IN_PHB_2024`) now have 2014 rows too.
- `shared/src/race-features.js` (new): `RACE_LIST`, `racesOf`, `RACE_FEATURES` (rows matched on the race, by character level, both editions), `RACIAL_FEATS` (Xanathar's, matched on the features text and the race), `MORE_RACES` for the race box. `featureRows` handles race and feat rows; rows carry `race`.
- Page: a Race features section in the Class features box (with a line for a race it doesn't know); the subclass line names the books it knows; the race box suggests more races. Served as `/shared/subclass-features-books.js` and `/shared/race-features.js`.
- Defaults Claude picked: "race feats" read as both racial traits with uses and Xanathar's racial feats; under 2014 rules Monsters of the Multiverse's version of a race it reprinted (not Volo's or Tome of Foes'), under 2024 rules the PHB 2024 species first; the 2024 tiefling's legacy is Infernal unless the race says Abyssal or Chthonic; a genasi's kind and a dragonborn's colour are read from the race; feats are found by name in Features & traits (the sheet has no feat list); Volo's aasimar subraces and Tome of Foes' tiefling subraces aren't separate rows; Fizban's dragon gift feats and Glory of the Giants' giant feats aren't racial, so they aren't in.
- Tests: shared (`race-features.test.js`; `subclass-features.test.js`: every subclass matches its own name, ids unique, reprints have both editions, numbers from each book), web (the Race features section, a Xanathar's subclass, an unknown race).
- This machine's `node_modules/@dndapp/*` links pointed at the repo's old folder, so the server and web tests couldn't load the shared package; `npm install --offline` remade them (node_modules only).

### 2026-10-16: Stairs and ladders

- The owner: "Ladders and stairs. We won't make stairs use any extra movement cause it gets a bit too pedantic then. But we do want climbing ladders to use DND rules. And we want the AI walls feature to recognize where ladders are. We also need ladders and stairs in the map builder".
- `shared/src/map.js`: `climbs` on maps (`normalizeClimbs`, `CLIMB_KINDS`, `MAX_CLIMBS` 300); `pathCost(map, points, token)` adds climbing where the ground height changes along the path, unless stairs are within ¾ of a square of the crossing (returns `climb` in feet and `wall` when nothing was there); free for `climber` tokens or ones with `elevation` above 0; `hasClimbSpeed`.
- `shared/src/map-design.js`: the stairs, stairs down, spiral stairs and ladder assets carry `climb`; `designToMap` gives `climbs` (a line along each piece), skipping ones linked to another map; `applyDesign` keeps them as `source: 'creator'`.
- Server: `PATCH /campaigns/:cid/maps/:mid/climbs` (DM); the AI wall draft's schema and prompts have stairs and ladders (a line from bottom to top; purple on the checking picture), stored as `source: 'ai'` and counted in `found`; tokens in the view carry `climber`; players get `climbs`; a move in a fight counts climbing. `PIPELINE_VERSION` 18.
- Page: Stairs and Ladder tools in Fog & walls, purple lines while the panel is open, Erase, Clear AI, the done message, and the drag readout's "climbs N ft".
- Defaults Claude picked: climbing counts up and down (5e); crossing a height with nothing nearby counts as climbing (flagged, never refused); no minimum step height; a climbing speed or flying makes it free; the map creator still has no raised areas, so the DM adds the heights on the map.
- Tests: shared (`pathCost` climbing, `normalizeClimbs`, `designToMap` climbs), server (`heights.test.js`: the route, players' view, climbing in a fight; `maps.test.js`: the AI draft's ladder).

### 2026-10-16: Heights in the map creator

- The owner: "Let's try and get raised areas into the builder".
- `shared/src/map-design.js`: designs have `heights` (feet per square, cleaned by `normalizeDesign`); `paintHeight`, `fillHeight` (the bucket's region: same floor and height, up to walls), `heightAreas` (one rectangle per run of a height; `difficultAreas` now shares the same rectangle-finding); copy, clear, paste, turn, flip, clips, resize and shift carry heights; `designToMap` gives `raised`.
- Server: the creator's design and stamp bodies accept `heights`; `applyDesign` replaces the map's `source: 'creator'` raised areas.
- Page: a Height tool (H) in the creator with a feet box; heights drawn over the squares while it's picked.
- Defaults Claude picked: a click fills like the bucket (so open ground with no walls fills the whole floor of that kind); heights are per square, so a round tower is raised square by square; the picture doesn't show heights.
- Tests: shared (painting, filling, areas, the map's raised areas, copy, turn, paste, clear, resize, shift), web (the Height tool, click and drag, saved as raised areas).

### 2026-10-16: Finer heights in the creator; saving keeps the map's scale

- The owner asked about making the creator's squares smaller and scaling the map up; Claude pointed out that saving in the creator reset the map's scale to 5 ft a square. The owner: "Fix the builder for now. Let's try the simpler approach first and see" (5 ft squares, finer heights).
- `applyDesign` keeps a scale the DM set on the map (regression test in `server/test/creator-tools.test.js`).
- Heights are kept per half square (`paintHalves`, `paintHeightRect`, `fillHeight(design, x, y, h)` with walls on half squares; designs saved with a number per square read as halves). `heightAreas` gives shapes (`points`): a circle inside a round wall whose inside shares one height, rectangles of half squares for the rest. The Height tool's drag goes by half squares.
- Tests: shared (half squares, a half-square wall-walk, a round tower, old per-square heights), server (the scale, a raised room and a round tower from the creator), web (the tool on half squares).

### 2026-10-16: AI walls guess heights, for the DM to accept or correct

- The owner: "Does the AI maps currently handle elevation now? ... We used to define buildings as impassible but see through, now we don't", then "We should be able to accept or correct".
- `server/src/maps/read.js`: `raised` in the wall draft's schema (an outline, or a circle, and a height in feet), the prompts (buildings drawn as roofs, tower tops, wall-walks, cliffs, pits, with rough heights; obstacles now only fences, hedges, low walls and deep water), cyan on the checking picture; converted to pixels from the whole-map draft (as difficult terrain). `PIPELINE_VERSION` 19.
- Server: the draft stores them as `source: 'ai'` and counts them in `found.raised`; `PATCH .../raised` takes `accept` (an id or `all`) and `clear: 'ai'`, and setting a height accepts.
- Page: guesses dashed with "?" on their height; with Raised area a click accepts one (its height into the box), a second click corrects it; Accept AI heights (n); Clear AI and the done message include them.
- Defaults Claude picked: guesses work for sight and movement straight away (not only once accepted); a building drawn as a floor plan still gets walls.
- Tests: server (the draft's raised areas, a circle, a bad one dropped; accept, correct, clear), shared (found), web (the labels, accept, correct, accept all).

### 2026-10-16: Item kinds with their own fields; potions you can drink

- The owner: "Items should be categorized. Armour, weapons, potions, etc. and the inputs should depend on the category. Because when a player equips armour, for example, the app should automatically update their stats". Kinds already existed, and equipped armour already set the AC, but the DM's items had only a description for the app to read numbers from, and Add by hand made a blank "Other".
- `shared/src/gear.js`: `normalizeItemStats` (the numbers for an item's kind), `itemStats({ stats })` uses them over the tables and the description; `addToInventory` carries them; potions: `heal` on a line, `POTION_HEALING`, `itemHeal`, `drinkPotion`.
- Server: items keep `stats` (`items.js`, `PATCH`/`POST` take it, Fill in clears it); `POST /campaigns/:cid/sheet/gear/drink` (`rests.drink`) rolls the heal, adds the hit points and uses one up.
- Page: the DM's item form (`items.js` `statsSection`) shows the kind's fields, prefilled from what the app reads, saved only once the DM changes one; the card shows them. The Inventory's Add by hand has a kind picker and opens the new line's details; changing a kind or type keeps the details open; Heals under Details and Drink on a potion's row.
- Defaults Claude picked: scrolls, tools and gear have no fields of their own; the stats are the DM's only once they change one (untouched items stay read from their text); drinking a potion heals your own hit points, not a Wild Shape form's.
- Tests: shared (heal parsing, the DM's numbers winning, AC from a bought armour, a typed AC still winning, drinking), server (stats saved and bought, drink route), web (the DM form by kind, Add by hand armour setting AC, Drink).

### 2026-10-22: Class features in play (Weapon Mastery, Sneak Attack, Features & traits, the audit)

The owner (feedback 2026-10-21, item 9): no way to pick Weapon Mastery, Thieves' Cant missing, Sneak Attack not applicable, "go through ALL class features and check these actually work".
- `shared/src/class-traits.js`: every class feature of the 13 classes in both PHBs, with how the sheet handles it, and the PHB races' text traits. Features & traits lists the ones that apply (by class, level, subclass, race, edition) above the player's own text, leaving out any they wrote by name; the choices (fighting styles, damage invocations, Blessed Strikes, Elemental Fury, Hunter's Prey) are picked there.
- `shared/src/attack-extras.js`: Weapon Mastery (counts by class and level, the PHB 2024 weapon table, the property with its numbers on each attack) and `planAttack` / `planSpell` / `spendForAttack`: the extras a character can add to an attack or spell, applied to its rolls (Sneak Attack, Divine Smite, Rage, Hunter's Mark, Hex, Great Weapon Fighting, Dueling, Archery, Martial Arts, Brutal Critical, Champion crits, superiority dice, Psionic Strike, Agonizing Blast and more). Page: `web/public/sheet/attacks.js` and `sheet/traits.js`.
- Dice notation: `min<n>` and `ro<n>`. The dice card names a crit range under 20 and lists the attack's reminders.
- `computeSheet` takes the edition (the page, rests and the gear route pass the campaign's) and works in more features (SPEC §6.4).
- Bugs found and fixed, each with a regression test: Sneak Attack couldn't be applied; Thieves' Cant was nowhere; monk Unarmored Movement counted in armour; 2024 dwarves, halflings and gnomes had 25 ft speed; Aura of Protection missed the paladin's own saves; Draconic Resilience's AC and hit points weren't applied.
- The map's attack riders (`attack-riders.js`, from the map-attacks PR) are now made from the same extras, so the map offers Divine Smite, Hunter's Mark, Hex, Rage and the rest too; what a rider uses up is spent on a hit.
- The audit: `node scripts/class-features-audit.js` writes docs/notes/class-features-audit.md from the lists (each feature, class and level, edition, what the app does, status). Worked from the 2014 and 2024 Player's Handbooks.

### 2026-10-26: Class features, second pass (map numbers, Weapon Mastery on the map, feats, off-hand, subclass traits)

The coordinator, for the owner ("ALL class features actually work"): the gaps left by the first pass.
- Map attacks are planned by `planAttack` like the sheet's (Archery, Dueling, Great Weapon Fighting, martial arts, crit range, Elven Accuracy and halfling Luck on the d20); riders can carry a to-hit change (Great Weapon Master / Sharpshooter −5) and options: Divine Smite's slot is picked in a select and sent as `rider_options`. Weapon Mastery on the target (`masteryOnTarget` in `shared/src/attacks.js`): Graze deals damage on a miss, Topple rolls the target's Con save and adds prone (undone with the attack), the others are named on the result.
- `shared/src/feats.js`: general feats found by name in Features & traits, rows under Feats in Class features, numbers in `computeSheet` (Alert, Tough, Mobile, Speedy, Observant, Dual Wielder) and `planAttack` (Great Weapon Master, Sharpshooter, Elven Accuracy); Lucky's points; reminders for the rest. A halfling's Luck: `d20Rule` puts `ro1` on every d20 from the sheet and the map.
- Dice: `ea` on a d20 (three d20s with advantage); suffixes combine (`1d20ro1ea+7`); rerolls apply to advantage's extra die too.
- Two-Weapon Fighting: `offhandWeapon` and `planAttack({ offhand })`: an off-hand line in Attacks and on the map (Nick in 2024; the modifier only with the style).
- `shared/src/subclass-traits.js`: the text-only features of every subclass the sheet knows (PHB 2014 and 2024 and the other books'), listed in Features & traits by subclass, level and edition, skipping names that are Class features rows. The audit lists them and the feats (regenerated).
- Bug found and fixed (regression test): the wiki's AI proposals made in one run came back in a random order (same millisecond, sorted by random ids), which made `wiki-ai.test.js` flaky; `list()` now orders by `created_at, rowid`.
- Not changed: the AI sheet review prompt (no PIPELINE_VERSION bump).

### 2026-10-16: Map export keeps heights, stairs and ladders; a Download button in Fog & walls

The owner: "I noticed we can import a tabletop file. We should be able to export one too." A Universal VTT (.dd2vtt) export already existed (since PR #35) but sat in Map settings → Other VTTs, and left out everything the format has no place for.
- **Server** (`maps/uvtt.js`): `toUvtt` adds a `dndapp` block that other VTTs ignore (obstacles, raised areas with heights in feet, stairs and ladders, difficult terrain, in squares) and `secret`/`locked` on portals and exact `bright`/`dim` on lights. `uvttContents` reads them back; `applyUvtt` (`routes/maps.js`) stores raised areas, climbs and terrain as `source: 'file'`, replacing the last file's (only when the file has some), so the DM's own stay. Foundry, Dungeondraft and others still get the plain format (portals as doors, lights by range).
- **Page:** a **Download .dd2vtt** button next to Walls from file in Fog & walls (disabled without a grid); the walls-from-file message also counts raised areas, stairs and ladders and terrain. Map settings still has it.
- **Tests:** a round trip (out and back in as a new map, then added to it again) in `creator-tools.test.js`; the Fog & walls button in `map.test.js`. All suites pass.


### 2026-10-16: Maps aren't read by the AI on import; AI walls draws as it works

The owner: "it automatically started in the AI analysis after importing. That shouldn't be automatic" (and chose "Make it a button" on the decision card), then "I would like to see the map changing as the AI works. Makes it feel more like it's doing something and not hanging".
- **Import:** `POST /campaigns/:cid/maps` reads the map with the AI only with `read: true`; otherwise `reading.status` is the new `none` (shared `normalizeMap`) and the name comes from the file. Map settings says "Not read yet" and its button reads **Read with the AI** (no confirm the first time). The per-hour AI limit only counts imports that read.
- **Live AI walls:** `mapReader.walls` gives `onProgress` a `preview` (the first draft, then each checked close-up swapped in, from the same `assemble` the answer uses); the route puts it on the map with `applyWallDraft` (the same merge as the finished draft), so the DM's map redraws as it goes. Players get the walls as they appear, as they would the finished draft.
- Tests: `regression: importing a map does not start the AI reading it; the DM asks for that` (maps.test.js, listed in docs/regressions.md); the walls tests check the previews and that the first draft is on the map while it's checked. Every other test import passes `read: true`.


### 2026-10-18: Checking and changing heights; bridges

The owner: "I noticed there was no obvious way to confirm or change recommended heights. Neither their elevation level or what area they cover. Also, bridges… tokens to be able to walk under bridges, show they are under, and be handled well."
- **Heights:** a click on a raised area (Fog & walls open, or Raised area on) picks it; the bar has its height, Bridge, Remove, and for AI guesses Looks right / Next guess. Check AI heights (n) walks through the guesses, bringing each into view (`selectRaised`, `centerOn` in `web/public/map/map.js`). The picked area has corner handles to drag (half squares), side dots to add a corner, corner-on-neighbour to remove, and a drag inside moves it. `PATCH .../raised` `set` takes `height?`, `points?`, `bridge?`. Raised mode's click no longer accepts or sets the box's height (it picks); Accept all is still there.
- **Bridges:** `bridge` on raised areas, `under` on tokens (shared `normalizeRaised`/`normalizeToken`); `groundAt(map, x, y, under)`, `bridgeAt`, `tokenGround`, `isUnder`, `levelWalker`/`walkLevels` (onto a bridge from within 5 ft of its deck or by stairs/ladder, else under), and `heightClear` checks `edges.decks` with `throughDeck`. The server sets `under` on every move unless it's sent. The AI walls schema has `bridge` (PIPELINE_VERSION 20). Kept in .dd2vtt exports. Players get `bridge`.
- Tests: `shared/test/map-bridge.test.js`, server `heights.test.js` (reshape, bridge, walk under, sight), `maps.test.js` (AI bridge), `creator-tools.test.js` (export round trip), web `map-more.test.js` (pick, drag corners, add and drop a corner, move, Check AI heights, token under a bridge).
- Not yet: bridges in the map creator; a bridge's deck doesn't stop a too-tall creature walking under it.

### 2026-10-20: Smooth shadows behind raised areas

The owner, with a screenshot of a block's stepped shadow beside a curved wall's: "It should all be 'smooth', like what is coming off the curved wall". The fog over heights was worked out per grid square (`heightShadows`). Now it looks at points a square apart, then a quarter square apart only in squares whose corners differ, and traces the outline (marching squares), finding each crossing by halving to a hundredth of the step, so straight shadow edges come out straight. The shapes are `{ fill, rings }`, filled even-odd by the page's canvas (`drawFog`); `maskFillAt` / `inMaskShape` in `shared/src/map.js` read a mask at a point (tests use them). The shadow no longer stops at the edge of what the player sees (it's fog there anyway), so there are no seams. About 6–15 ms on a 2100 × 1500 map with 20 blocks (the squares took about 2 ms); corners can be cut by up to a quarter square. Tests: shared `map-height.test.js` (regression), `map-bridge.test.js` and server `maps.test.js` updated to read rings. The owner also asked how the tops of raised areas should show (a tall creature up there is seen before a short one) and chose **two shades** from three options: clear where a player's token sees the floor, a light shade (`glimpse`, 30% on the canvas) where only someone standing there would be seen (a roof from below, the ground just past a low edge), fog where neither. The sample points went to an eighth of a square (sharper corners), about 12 ms on the test map. Tokens were already shown by their own height, unchanged. PR #74 (smooth) and the two-shades PR, both merged.

### 2026-10-20: Show players this map (players' pages follow the DM)

The owner, testing with a DM window and a player window: first "the player cannot see the map they are currently on", then, with screenshots of both, "Not the same map. Switching what map is showing should be seamless and easy". What had happened (from the map's archived changes): the DM put the player's token on the keep map, showed it, turned fog on (line of sight off, nothing revealed), hid it and showed it again. A player's page never changed map by itself, so it stayed on (and bounced back to) "New map"; and on the keep a player would have seen solid black anyway (dark fog, nothing revealed). Checked by running the server's player view on a copy of the database: one opaque fog rectangle, no error.
- **Server:** `POST /campaigns/:cid/maps/:mid/bring` (DM) sets `shown` and `brought_at` (shared `normalizeMap`), reason "players brought here". `playersMap(maps)` (shared `map.js`) is the shown map with the latest `brought_at`. No schema change: it's in the map's JSON and archived with its changes. Map events: "The DM brought the players to the map …", or "… and brought the players there" when it showed the map too (no PIPELINE_VERSION bump: no prompt or schema changed).
- **Page** (`map.js`): a **Show players this map** button beside the map list (`#map-bring`, DM only, `map-main` so it shows in full screen; on a phone it's in ⋯); on the players' map it reads Players are here (disabled), and the list marks it "(players here)" for the DM, "(party here)" for players. Players' pages follow each new bring once (`state.broughtSeen`), open on the players' map, fall back to it when the map on screen is hidden, and return to a hidden map when it's shown again (`state.bouncedFrom`). Messages about a map stay in its status line for 10 seconds through updates (`noteOnMap`). After a bring, the DM is warned when players would see only dark fog (`howToSeeAnything`).
- **Console error:** the owner saw a red error in the browser console that evening but didn't paste it. Two headless Chrome runs (DM and player, on a copy of the data, through the steps he took: Check AI heights, switching maps, hiding and showing, line of sight, moving tokens) logged none. Still unknown.
- **`npm test` on Windows** (found while checking this): 6 server and web tests failed with EPERM deleting their temp folders, on `main` too. sharp keeps up to 20 pictures it read by path open (WebP and GIF; PNG and JPEG it closes), and Windows can't delete an open file; the live server held archive pictures open the same way. `images.js` now sets `sharp.cache({ files: 0 })` for the whole process. Regression test: `regression: sharp keeps no picture it read open, so map pictures can be deleted (Windows refused to)` (server `maps.test.js`, in docs/regressions.md). Earlier "all suites pass" runs were likely on Linux, which deletes open files.
- Tests: server `maps.test.js` (bring: shown, live, players' map, hidden falls back, players refused), `mapevents.test.js`; web `map.test.js` (the DM's button and its warning; a player's page following, looking elsewhere, a hidden map coming back). Not a regression test: nothing that worked before broke.

### 2026-10-20: Playwright for real-browser checks

The owner: "can you set playwright up? Would this help with your testing?" Yes: the session before drove Chrome by hand over the DevTools protocol. `playwright-core` (dev dependency, no browser download: it uses the installed Chrome) and `scripts/browser.js`: `openTable({ accounts })` copies `data/` (SQLite backup, archive copied), starts the server on the copy with the fake AI and no job runner on port 4401, sets the named accounts' passwords on the copy, and opens one logged-in page per account, collecting console errors, uncaught exceptions and failed requests. Tried on the Show players this map flow (DM and player, no errors). Not part of `npm test`; AGENTS.md says when to use it.

### 2026-10-20: The world, first stage (places, maps inside maps, who sees what)

The owner, 2026-10-18: "The world. We don't just want individual maps. We want to be able to make an entire world. Connected maps, a world map, etc. ... only do research for features for now." Research in the project's `research/world/connected-world-research.md` (what DNDApp had, Foundry, Roll20, Owlbear, World Anvil, LegendKeeper, Kanka, a build order). His answers: "No hex grid. The DM will choose who to reveal what to. We don't want one token for the whole party, because they won't always all travel as one... Let's take the features of other platforms and combine them." Then, 2026-10-20: "Start".
- **Shared** (`shared/src/map.js`): `shown_to` on maps and `shownTo`; `places` (`normalizePlaces`, up to 200, 40 points an area) and `placeRevealedTo`; `normalizeUserIds`; `parentOf`, `mapTrail`, `atlasOrder`, `placeProblem` (one place per map, never inside itself). No schema change: all in the map's JSON, archived with its changes.
- **Server:** `PATCH .../maps/:mid` takes `shown_to` (the campaign's players only); `PATCH .../maps/:mid/places` (DM) `{ add?, set?, move?, remove? }`, checking the map it opens and the record; `maps.view` filters maps by `shownTo`, links by the target's `shownTo`, places by `placeRevealedTo` and sight, and strips `record`, `revealed_to` and `shown_to` for players; link use checks `shownTo`. Map events on a map shown to some players end "[seen only by user N]" (none on a map shown to nobody in its list), and the archivist's instructions say what that means: `PIPELINE_VERSION` 21.
- **Page:** `web/public/map/places.js`: places drawn (pins with names, areas outlined; unrevealed ones grey and dashed for the DM), Place in Fog & walls (click: a pin, drag: an area; with Place on, click a place to change it, drag to move it), the place dialog, the breadcrumb (`#map-trail`), the Places groups button and dialog, and `whoField` (nobody / every player / the players ticked) used by Map settings too. The map list is in world order.
- Checked in headless Chromium (desktop DM and a 390 px phone player, a test server): places, the area, the breadcrumb and opening maps through places looked right, no console errors.
- Tests: server `world.test.js` (shown to chosen players, links to them, places revealed per player, one place per map and no loops, breadcrumb and world order, map events), web `world.test.js` (Place tool, area, map list order, opening through a place, breadcrumb, a player's places and groups, Map settings' players); web `map.test.js` updated for the new "Who can see this map" field. Not a regression test: nothing that worked before broke.

### 2026-10-20: The DM's wiki, stage 1

The owner asked for research (2026-10-18), made the decisions (2026-10-20: DM only at first with granular sharing; separate from the archivist's records but Ask reads it; a section the DM edits is the DM's; AI changes wait for approval; players can't write; the AI suggests reveals) and added "If the part of the wiki is available to the players, then their ask should use it", then "Start on the work".

- **Server:** `src/wiki/store.js` (pages, versions, history, restore, per-part search docs with `visible_to`, other names as a DM-only doc), `routes/wiki.js` (DM only; `?as=` for View as), `wiki_pages` table (**schema v18**), archived as `wiki/<id>/changes.jsonl` and restored on start-up; a rebuild re-indexes it.
- **Shared:** `shared/src/wiki.js`: `:::for` / `:::dm` blocks, `[[links]]`, narrowest audience, names resolved to players by character or account name.
- **Ask:** `search_wiki` and `read_wiki_page` plus wiki parts in the pre-search, only when the asker can see some of the wiki; text always comes from the live page filtered for the asker, so a stale index can't leak. Prompt changed: **`PIPELINE_VERSION` 21 → 22**.
- **Page:** the Wiki tab (`web/public/wiki/wiki.js`): list by kind with a filter, page view with blocks boxed, View as, editor with an availability picker per page and section, history. Phone: the list hides while reading.
- **Tests:** `server/test/wiki.test.js` (5) and `web/test/wiki.test.js` (2); db and tab-order tests updated.

### 2026-10-21: The DM's Map page trimmed (Edit map, the picked token's bar below the map, Who is it? by Kind, AI walls effort)

The owner, with screenshots: "that bar at the bottom. It's in the way of seeing the whole map… we now have a bunch of map editing stuff even though we have a dedicated map editor. So that's not necessary anymore… trim it down and make it more clean to use, without removing any actual features"; "under add token, we can select what kind, but the list still shows all. Also, this list should be searchable"; then "I don't see the option to change reasoning effort for AI walls. We need to make that more clear".
- **Edit map** (`#map-edit`, `state.editing`, `.map-panel.editing`): the old Edit toggle (`edit-off`, `dndapp.map.editing`) is gone. Edit map swaps the play tools for the edit bar (`#map-wall-tools`: Done, Map settings, Open in the map creator for made maps, every wall/height/light/link/place tool, AI walls…, Walls from file, Download .dd2vtt, Clear AI draft). Fog & walls became **Fog & sight** (fog, Unseen parts, Reveal/Cover, Line of sight, Remember explored, Forget explored, Darkness, Show walls). Import map and Make a map became **New map** (a dialog). Nothing was removed; the map creator still can't edit an imported picture, so its walls are drawn in Edit map.
- **The picked token's bar** (`#map-selection`) moved out of `#map-view` into `.map-area`, below the map; it floats only in full screen and on a phone. Light, Tall, Up, Under the bridge, Record, Stat block (AI), Picture, No picture, Save to creatures and Remove went under **More** (`details.sel-more`, kept open across rebuilds and while typing in it).
- **Who is it?** (`tokenDialog`): Kind first; a search box and a list (`.who-list`, `role=listbox`) of only that kind; records' places and things only when searched for.
- **AI walls effort:** PR #33's server half brought in (`EFFORTS`, `{ effort }` on `walls/draft`, `wall_draft.effort`, `walls_effort` for the DM); the page asks in a dialog every time (`wallsDraftDialog`), remembers the pick (`dndapp.map.wallsEffort`), shows it in the messages; Try again reuses it. PR #33 closed as superseded.
- **Tests:** existing map tests moved to the new buttons; four new regression tests (docs/regressions.md); the old "asks who it is once" regression test now checks the one list under Kind. Looked at in headless Chromium at desk and phone sizes (no console errors). `npm test` passes.

### 2026-10-21: Check after the close-together merges (PRs #73 to #78)

The owner: "a lot happened at the same time there. Make sure nothing conflicted… if something was working on fog and walls, did that conflict with the UI cleanup? check it all".
- **Checked:** every merge since PR #72 (#73 to #78 and the two branch merges), the three times main was merged into the Map page overhaul (#78) and how each conflict was resolved (the shared imports in `routes/maps.js`, the Place button in `index.html`, HANDOFF and SPEC): nothing lost. Smooth and two-shade height fog (#74, #76), places (#75) and the wiki (#77) are all intact on main; every element id the page's scripts look up exists; `PIPELINE_VERSION` went up once per change (22).
- **Real browser** (scratch script with `setup()` from the server tests and the container's Chromium): the DM's Edit map shows every wall tool (Place, Stairs, Ladder, Raised area included), draws a wall, shows and picks raised areas with their heights, opens AI walls (effort) and Map settings; Done brings the play tools back; Fog & sight's Show walls hides walls outside Edit map only; the token bar shows below the map; New map and Add token (with search) open; a player sees their fog with the height shadows and the right tokens; on a phone the ⋯ sheet has Edit map, Fog & sight, New map and Add token, and the edit bar and token bar float above the bottom tools. No console errors.
- **Fixed:** wording that still sent the DM to the old "Fog & walls" panel: the server's error for a .dd2vtt with no picture (regression test), code comments, SPEC (§6.6 heights, stairs, links, places, export, full screen, walls) and README. Older change-log entries keep the old name, as history.
- 590 tests pass.

### 2026-10-21: The AI keeps the wiki up to date (proposals the DM approves, reveals)

The owner, after stage 1: "Start on them" (the AI drafting pages for approval, then suggesting reveals).

- **Server:** `src/wiki/ai.js`. A `wiki` job after each ingest, correction or updates job (when `WIKI_AUTO` isn't off and the journal has news) reads the records changed since `wiki_chronicle.journal_id`, 25 per structured call (task `wiki`), with all page titles, related pages in full (named in the records, or found by searching the wiki's docs), waiting and rejected proposals. Answers become proposals (`wiki_proposals`, **schema v19**, archived in `wiki/proposals.jsonl`, restored); a newer one for the same thing replaces a waiting one; one matching a rejection is skipped. Audiences come from `known_by` (intersection over a section's sources; new page = widest section; a change never widens; a reveal only to players who know the sources). Approving writes the page through `wiki.create`/`wiki.update`; a reveal widens the section and the page and pins the page's other "as the page" sections to what the page was. A rebuild moves the cursor to the end. `wiki.update` now keeps `by: 'ai'` on a section saved unchanged and makes a changed one the DM's. Players' job lists leave out `wiki` jobs. New prompt: **`PIPELINE_VERSION` 22 → 23**.
- **Page:** The AI's changes button (with a count) on the Wiki tab: each proposal tagged New page, Change, New section, Reveal or Suggestion for your section, with Now beside Proposed, who each part would be available to, Approve, Edit (heading, text, who) then approve, Reject, Approve all, Read the records now (polls while it runs). AI sections say "Written by the AI" on the page. Checked in headless Chromium (desktop and a 390 px phone).
- **Tests:** `server/test/wiki-ai.test.js` (3), a web test in `wiki.test.js`, db test for v19. The fake AI's `wiki` handler defaults to no changes.

### 2026-10-21: The world, second stage (where everyone is)

The owner, 2026-10-18: "We don't want one token for the whole party, because they won't always all travel as one. We must handle that properly"; then "Start on it" for the second stage of the research's plan (SPEC §6.6 "Where everyone is").
- **Shared** (`shared/src/map.js`): `follows` on a token (cleared when it points off the map); `isPinMap` (world and region maps), `characterMap`, `followGroup`, `followLoop`, `trailFollowers` (followers walk behind the leader along its route), `arrivalSpots`, `nearPlace`.
- **Server** (`routes/maps.js`): `moveGroup` takes a token and its followers to another map in one change on each (reasons `left for` / `arrived from`, so map events still say who went where) and `clearCharacter` removes any other copy of a character; link use goes through it; new `POST .../places/:pid/enter` and `POST .../leave`; the DM adding a character who is on another map brings their token over; turning a token into a character who's on a map is refused; `follows` in a token change (players: their own, following tokens they see, no circles); moving a token stops it following and trails its followers (not in a fight); a player's new companion follows their character. Players get `follows` only when they see the leader.
- **Map settings → Kind** (`PATCH .../maps/:mid` `kind`; `kind_set` keeps it when the AI reads the map again), so the DM can make a map a region or world map.
- **Page:** new `web/public/map/world.js`: the token bar's Follows… choice, Go into <place> and Out to <map>, pins on world and region maps (40 px on screen, fanned out where they meet, again when the zoom settles), players' pages going where their character goes ("Thorin is here now"; they open on their character's map), and the DM's **Party** panel (Go there, Bring here).
- Checked in headless Chromium on a test server (desktop DM and player, a 390 px phone): pins fan out, Go into Millbrook takes Thorin and his wolf, the phone opens on the town, the party panel lists everyone; no console errors.
- Tests: server `world-travel.test.js` (one map per character and Bring here, following and trailing, links/places/leaving with followers, the helpers), web `world.test.js` (a player's page following their character and the Follow/Out to controls; pins fanning out; the party panel). 601 tests with the wiki changes merged in. No prompt or schema change, so `PIPELINE_VERSION` stays 22.


### 2026-10-21: The world, third stage (travel and time)

The owner: "Start on it" for the third stage of the research's plan (SPEC §6.6 "Travel and time"; the in-game clock was one of his "basics").
- **Shared:** `clock` in the campaign's settings (minutes since day 1 began; starts Day 1, 08:00), `clockText`, `durationText` (`shared/src/settings.js`); `journey` on a token, `PACES` (18/24/30 miles a day, each edition's effect), `milesBetween`, `travelMinutes` (8 hours on the road a day), `journeyAt` (`shared/src/map.js`).
- **Server** (`routes/maps.js`): `moveClock` moves the clock and everyone on the road (arriving whoever's time has come); `GET/POST /campaigns/:cid/clock`; `POST .../tokens/:tid/journey` (set off for a place or a spot with followers, stop, the DM's arrive now or own time); moving a token or taking it to another map ends its journey; the clock goes out on the maps' live stream and in the map list; `POST .../rests` takes `clock`. Players don't get the place name of another token's journey. Map events: who set off (together in one line), where to, the miles, pace and in-game times, who arrived or stopped; one sentence in the archivist's instructions about the in-game day; `PIPELINE_VERSION` 24.
- **Page:** new `web/public/map/travel.js`: the clock over the map (the DM's dialog: +1 hour, +8 hours, +1 day, To the next arrival, set a day and time, who's on the road), Travel… on world and region maps (where to, pace with its effect, miles and time, arrival; the DM's own days and hours), Stop here / Arrive now, dashed lines to where each is headed; the party panel says who's on the road; Rest has "Move the in-game clock on".
- **Fixed before merging:** the travel dialog filled in hours like 4.9, which the whole-number Hours box refused, so Set off did nothing in a real browser (jsdom didn't mind). Regression test in `web/test/world.test.js`.
- Checked in headless Chromium on a test server (the DM's travel dialog, Set off, the clock dialog, the road line). Tests: server `world-travel.test.js` (a journey, the clock moving it, next arrival, stopping, the DM's own time, a rest moving the clock; travel time, clock words and map events), web `world.test.js` (the DM's journey and clock, a player's journey and the clock moving live, the regression). 605 tests.

### 2026-10-21: The world, fourth stage (roads, terrain, wagons and boats, forced marches, random encounters, restocking by days, the table's switches)

The owner: "Yeah, start it. Also wagons and maybe even random encounters as we travel", then "A lot of these should also be optional. Something the DM can toggle on and off. For example, some DM's might want to timeskip past travel. Not all tables want the same level of detail and realism" (SPEC §6.6 "More to travel").
- **Shared:** `TRAVEL_BY` (foot, riding, wagon, six boats from the PHB's vehicles table), `MARCH_HOURS`, `travelMinutes` with `by` and `hours`, `journeyAt` along a `route` and only while on the road, `normalizeRoads`, `snapRoadPoint`, `normalizeEncounters` (maps and area places), journeys' `by`, `hours`, `route`, `road_miles`, `rough_miles`, `lead`, `noted` (`shared/src/map.js`); `travel` in the campaign's settings (`TRAVEL_TIME`, `TRAVEL_PARTS`, `normalizeTravel`).
- **Server:** new `src/maps/travel.js`: `planJourney` (roads or rivers as a network, shortest way, straight when that's quicker; difficult terrain counts double off the road; a wagon off the road counts double everywhere), `onTheWay` (encounter checks and forced-march saves between two clock times), `rollLine`. `moveClock` returns `{ clock, notes }`, stops at the first encounter (unless `stop: false`) and restocks merchants by days (`merchants.clockMoved`, `restock.days`). Journey route takes `by`, `hours`, `preview`, and follows the travel settings (skip and none arrive at once). `PATCH .../roads`; `encounters` on PATCH map and places; players get no roads or tables. `buildApp` takes `random` (tests: `setup({ random })`). Map events say how they travelled; `PIPELINE_VERSION` 25.
- **Page:** Road and River tools in Edit map (world and region maps); the travel dialog asks the server (`preview`) and has Travel by, Hours a day and a forced-march warning; the route line follows the roads; the clock dialog's "Stop for random encounters" and its notes; Random encounters in Map settings and in an area's dialog; Rest shows what happened on the road; a merchant's "Or every … in-game days"; Campaign settings → Travel in the world.
- Tests: server `world-roads.test.js` (planning, routes round a swamp, dice in lines, wagon and forced march, encounters stopping the clock once, the switches, skip and none), merchants by days; shared map test; web `world-roads.test.js` (drawing and erasing roads, encounter tables, a wagon journey and the clock stopping, the switches). Two wiki AI tests failed once each under the full suite's load and pass alone (timing; not this change).

### 2026-10-21: Realistic map art (photo textures, props from 3D models, sharper pictures)

The owner: "I want better assets for the map. Higher quality", "All of it. Floors, walls, props, anything map related", "We want to replace what we have with better stuff, not just add to it"; after the research (`/mnt/project-files/research/map-assets/map-assets-research.md`) he picked option 1, realistic and all CC0, and turned on Remote Control so the downloads could run on his PC (this sandbox can't reach Poly Haven or ambientCG).
- **Downloads:** 131 textures and 347 models (1k), all CC0, with a manifest of source, author and size, in `D:\Code\map-assets` on the owner's PC; copied here through folder access.
- **Art:** `scripts/art/build.js` (sharp) turns the picks in `scripts/art/picks.js` into WebP tiles sized for 140 px a square (a little bigger than life so the repeat shows less), the props into pictures that face the way their box does, with how much of the box they fill from the model's real size, one sheet of 64 px swatches, `CREDITS.md`, and `shared/src/map-art-files.js`; it refuses anything not CC0. `scripts/art/render-props.js` renders the models from straight above (three.js in headless Chrome). 29 floors, 8 wall styles, 58 props (58 of 100 models tried: the rest were rows of tiny things, looked wrong from above, or were modern).
- **Drawing:** `map-art.js` fills floors and walls with the textures (natural floors get a second turned layer and soft patches; lumps and posts are shaded), draws a prop's picture when it's loaded and not recoloured, else the drawn one. The server (`maps/design.js`) loads the art a design uses; the creator loads it as needed (`map/creator/art-loader.js`) and redraws when it arrives; `/art/` is served with an ETag.
- **Sharper pictures:** `designCell` in `map-design.js`: 140 px a square up to 30 squares, less above, never under 70; saving again keeps the map's own size so tokens, fog and the DM's walls stay put. The WebP is made by sharp.
- **Fixed on the way:** each prop picture's canvas shadow blurred at full size took the server a tenth of a second a prop (a tavern 45 s at 140 px); the shadow is now made once per picture, small, and stretched. Even so a picture at 140 px a square takes the canvas about 3 to 5 s (four times the pixels; a texture fill alone is most of a second on this sandbox), which on the server's own thread froze rolls and live updates, so the drawing now runs in a worker thread (`maps/design-draw.js`). Regression tests in `shared/test/map-art.test.js` and `server/test/creator.test.js`. The page tests' waits for a save went from 5 to 30 s.
- Tests: shared `map-art.test.js` (every file there, credited, CC0, under 3 MB; pictures fill part of their box; recoloured props stay drawn; the shadow regression); server and web creator tests updated for 140 px squares, plus a server test that a map made at 70 px keeps 70 when saved again.

### 2026-10-21: Several characters per player, one active

The owner's feedback (item 5): "I want players to be able to have multiple sheets with multiple characters. Only one can be active at a time". Branch `claude/project-thread-3lrb70-characters`.
- **Server:** `character_sheets` is keyed by the player's character `number` with `active` (one per player, a unique index), `activated_at` and `deleted_at`; `character_pictures` by `number` too (**schema v20**, `migrateV19` makes each sheet character 1, active). `sheets/store.js` keeps `get(cid, uid)` returning the active character, so maps, rests, merchants, potions, class features, the DM's Items tab, Review sheet and uploads follow it without changes; new `list`, `create`, `setActive`, `rename`, `remove` (hides, never deletes). Archive: `character-sheets/<uid>-<n>.jsonl` for characters after the first and `<uid>.characters.jsonl` for which is active and which are deleted; pictures `pictures-<n>.jsonl`; restore reads them. New routes `GET/POST /characters`, `POST /characters/:n/active`, `PATCH/DELETE /characters/:n`, players only and only their own. `PUT /sheet` takes the page's `character`; a stale one gets 409 `switched`. Switching (or renaming the active one) sets the membership's character name (`auth.setCharacterName`, archived), so speaker names, Ask, rolls and the archivist's roster follow. A PC token's name shows the active character's name.
- **Archivist:** reads every character's changes, each marked as played now, not played now or deleted, and gets `<characters_changed>` lines for switches and deletions; its instructions say what a switch means. **`PIPELINE_VERSION` 26 → 27** (Ask's speed work took 26).
- **Page:** `web/public/sheet/characters.js` (the strip and list above the sheet); `sheet.js` sends the character's number with saves and follows switches made in another window or device (live `sheet` events carry `number`).
- **Decided (Claude's call):** switching is the player's alone; the DM sees only the active character (no list, no switching), to keep inactive sheets private. Up to 20 characters per player per campaign. The active one can't be deleted.
- **Tests:** `server/test/characters.test.js` (5), a v19 → v20 test in `db.test.js`, `web/test/characters.test.js` (3).
- 2026-10-26, merging main: the Characters strip printed "null" when its list was shut (the page tests' new null check found it); fixed, with a regression test (`docs/regressions.md`).

### 2026-10-21: Ask made faster (the quick way, the campaign's edition only, a quicker start, timings)

- The owner: "Ask is way too slow. Research how we can make this faster. The example was me asking 'What's that dnd item that is a bag you can pull summons out of?'… Maybe it is being too thorough for some stuff? We don't need to know how the editions differ." Research and measurements: [docs/notes/ask-speed.md](docs/notes/ask-speed.md). The Q&A model wasn't changed.
- Where the time went: every rules question, items too, was looked up in the books (a search turn, a read turn, then the answer), at medium effort, with the archivist's guide, pinned records and transcript search results in the prompt; Ask's book search ignored the campaign's edition, so both editions' pages came back and got compared; and Claude Code took ~2.9 s to start each call, ~2.3 s of it its telemetry and update checks (measured offline, no model call).
- `qa/route.js` (no AI) sends general D&D lookups the **quick way**: same model at `EFFORT_QA_QUICK` (`low`), at most 4 lookups, no guide or pinned records, a records-and-wiki pre-search of 1,500 tokens, books only when the wording matters, a short answer. Campaign words, first person outside rules phrasing, who/where/when/why, the past tense, or a name the asker can see (records, wiki pages, characters, the DM's creatures) send it the full way; when unsure, full. A follow-up in a full conversation stays full. `mode` on `/ask` (`thorough` / `quick`); `done` says `path`; `qa_log.path` (added on start whatever the schema version, `db/index.js` `addMissingColumns`).
- The page: a quick answer says "Quick answer." with **Look it up properly**, which asks again the full way in the same chat.
- Both ways: answers are for the group's edition only (one prompt line), the edition is always stated, and two Player's Handbooks with no setting pick the fallback edition rather than "give both". `search_books` prefers the campaign's edition's books when it's known for sure (`editions.known`, `books.search({ prefer })`): a bug fix.
- Claude Code runs with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` (`CLAUDE_CODE_QUIET_START=off` to undo): ~2.9 s → ~0.65 s to start, for every AI call. Agents take an `effort` (both providers).
- A quick question doesn't wait while the books are still being read after a restart (`books.loading()`).
- Timings: one `Ask answered (quick|full) in N ms` line per answer in `data/server.log`, with the way, prompt sizes, prep, books wait, first turn, first text, turns, each tool's start and length, total; no question text.
- Looked at, not done: a warm Claude Code process (`prewarm()` is alpha and fixes the tools at start, while Ask's are per asker; ~0.6 s), caching book searches (10–50 ms), an AI classifier (costs a call).
- Suggested, waiting on the owner: a faster model for the quick way only (`MODEL_QA_QUICK`).
- `PIPELINE_VERSION` 26 (prompts). SPEC v0.68 (§5.3). README (`/ask` `mode`, `done.path`), `.env.example`.
- Tests: server (`ask-speed.test.js`: which way questions go, the quick way's effort, limits and prompt, Look it up properly, a hidden record's name doesn't change how others are answered, edition-only lines, the regression for the book search's edition, timings, the books still loading, the column added to an old database; `llm.test.js`: the quiet start and effort for both providers), web (`app.test.js`: Look it up properly).

### 2026-10-21: Tidier pages (feedback items 1, 4, 6, 14, 15)

The owner's feedback of 2026-10-21 (`/mnt/project-files/feedback-2026-10-21/`), the UI tidy-ups:
- **Name (14):** "The domain is thepartyledger, but the tab still says campaign memory": the title, login heading and app-name metas say **The Party Ledger**; once in a campaign the tab reads "<campaign> · The Party Ledger" (popped-out pages keep "<page> · <campaign>"). README's first line too.
- **Top bar (15):** "It is not tidy and spills into a second row": Pop out, Dice and Rest are compact icon-and-word buttons, and Settings (now "Campaign settings"), Look, Change password and Log out moved into an account menu (⚙ your name ▾; `initAccountMenu` in `app.js`). Under 1180 px the three tools keep only their icons. On a phone the menu's buttons sit in the ☰ sheet as before. Checked in headless Chromium at 1280, 1440 and 1920 px as DM and player: one row each time (the DM's campaign name wraps under itself in its own corner at 1280 px).
- **Turn order (1):** "this looks messy. The side scrolling. I also want to be able to move this window": the scroll bar came from the top bar's `.who` rule (flex, wrapping) also styling the panel's name buttons, so a long name couldn't shrink; `.who` is now scoped to `.topbar`. Rows: name (…), hit points as the viewer may see them, initiative box, the DM's buttons; a cleaner look (rule under the header, a marker on the current turn, no number spinners). Dragging the header moves the panel inside the map (pointer capture; kept in localStorage `dndapp.turnOrderPlace` as a share of the free room, so it stays on screen when the map's box changes; a ResizeObserver re-places it); double-click puts it back. Not on a phone (it stays top right there). Kept to layout and moving, since map attacks (item 2) may add to the panel.
- **Markdown (4):** "Description text isn't formatted right here": `markdownEditor` in `markdown.js` shows a textarea's Markdown formatted until it's clicked or Edit text is pressed; clicking away formats it again. Used in the DM's item dialog, the Inventory's item details, a spell's description and "At higher levels", Features & traits and Additional features. Handouts' text is rendered with `markdownBox`. Item Details (Items, merchants, the shop) already rendered it.
- **"null" (6):** both screenshots were `replaceChildren` getting `cond ? el : null` (the DOM prints null as "null"; `h()` already skipped them). New `setChildren(el, ...)` in `api.js` skips null/false like `h()`; used for the Sheet review, Class features, the item dialog's stats, a magic item's effects list and the sheet's Pictures box (which printed "null" when there was no unused AI description). An inventory item with no source printed "null" too (fixed). The whole page was scanned (an AST script over every insert and template literal); the page tests now fail on any null put into the DOM and on "null", "undefined" or "NaN" showing anywhere on the page (error messages excepted, since they quote the server). Regression tests for the two seen.
- Tests: new page tests for the title, the account menu, moving the turn order, the item dialog's formatted description and handouts' Markdown; 3 regression tests (the third: merging the companions work, the null check caught the new Companions box printing "null"; fixed with `setChildren`).

### 2026-10-21: The Inventory's add area: suggestions by kind, an item's card before adding

- The owner: "This should be cleaner… It always suggests weapons regardless of what category I select. And I feel like there should be some way to check an items stats before you add it."
- Why it always suggested weapons: the name box's suggestions were `GEAR_NAMES` (the PHB weapons and armour tables) whatever was picked, and the kind picker beside it only fed Add by hand. Now one **Kind** picker (Any kind first) decides the suggestions (`itemNames` in the new `shared/src/item-names.js`: PHB weapons, armour, adventuring gear, tools, potions, spell scrolls and the SRD magic items) and the kind Add by hand makes.
- **Look up** (or picking a suggestion) shows the item's **card** under the form (`web/public/items/item-card.js`, the description through the app's Markdown renderer): kind, rarity, attunement, damage and properties, AC, charges, healing, effects on the sheet, weight, source, with **Add** and **Cancel**. Inventory lines keep `rarity` (shown as a tag). The add row is one line: Kind, name, Look up, Add by hand (on a phone, Add by hand in ⋯).
- Tests: `regression: the Inventory suggests names of the kind picked, not always weapons` and a card test in `web/test/sheet.test.js`; the inventory test adds through the card now. SPEC §6.4 Adding.

### 2026-10-21: Companions kept on the character sheet

- The owner: "We worked on a feature before to add familiars and pets, and summons. I do not see this anywhere. If it is not there, add it. The player should be able to have these."
- Why he didn't see it: PR #58 (merged 2026-10-14) was there, but only as the map toolbar's **Companion** button: players only (hidden from a DM's account), not one of the main map tools (so hidden behind More in full screen), and nothing on the sheet. Now the button is a main tool (`regression: the map's Companion button is one of the main map tools…`) and companions live on the sheet.
- `shared/src/companions.js` (rules: `normalizeCompanion`, `companionSources`, `builtStatBlock`, `rangersCompanion`, the token's stat block text), `web/public/sheet/companions.js` (the box), `server/src/routes/companions.js` (Put on the map, Take off, where). Tokens have `companion` (the entry's id); `maps.view` shows the sheet's name, stat block and hit points on them, `maps.setCompanionHp` sends a map change to the sheet, and `maps.sheetChanged` removes tokens of dismissed entries. The map's Companion dialog lists the sheet's companions first.
- Stat blocks for Steel Defender and Primal Companion checked against Tasha's and the PHB 2024 PDFs (staged for this session); the drake from Fizban's from memory (not staged).
- Tests: `shared/test/companions.test.js`, a server test in `server/test/companions.test.js`, page tests in `web/test/companions.test.js`. SPEC §6.4 Companions, §6.6.

### 2026-10-22: Items that give abilities (Item actions)

- The owner (2026-10-21 feedback, item 13): items carry actions read on lookup or by the DM: charges, spells cast with the item's DC, attacks, healing and summons, with a Use button that spends charges, rolls on the server and does the thing; Bag of Tricks rolls its d8 table and the creature becomes a companion on the map.
- `shared/src/item-actions.js` (the rules for the DMG items by edition, from the DMG summary staged for the session; the description's wording; `actionProblem`, `damageWithExtra`, `actionSummary`), `server/src/routes/item-actions.js` (Use), `web/public/sheet/item-actions.js` (the box). The item-reading AI's schema (`items/find.js`) gains `uses` and `actions`, marked `ai`: **PIPELINE_VERSION 27** (26 was Ask's quick lookups). The DM's items keep `actions` and `uses`; a purchase carries them into the inventory. Companions gain `vanishes`; the clock removes `expires: 'dawn'` companions at dawn.
- Tests: `shared/test/item-actions.test.js` (5), `server/test/item-actions.test.js` (4: Bag of Tricks on the map, vanishing at 0 HP and dawn, Wand of Fireballs, the AI's actions), `web/test/item-actions.test.js` (2). SPEC §6.4 Item actions.

### 2026-10-22: The wiki is visual (pictures, banners, an at-a-glance box, cards, link previews)

The owner (2026-10-21 feedback, item 3): "I really want the wiki to be more visual. This needs an overhaul, so we can add visual imagery and pictures, and really vibe it up." Ideas taken from World Anvil (article sidebars with a portrait and fields, header images, hover tooltips), Kanka (entity header image, attributes, mention tooltips with the picture, card lists by type), LegendKeeper (page cover images, clean pages) and Obsidian Portal (character cards with portraits).

- **Pictures** (`src/wiki/pictures.js`): the wiki keeps its own pictures, archived as they came in `wiki/pictures/<id>.<ext>` with a line each in `wiki/pictures/pictures.jsonl` (read straight from the archive; no table, so no schema change). Uploaded (choose, paste or drop) or copied from a creature's, item's, merchant's, map's (made smaller, 2400 px), handout's or player's token picture, so the wiki doesn't change when those do. Sent smaller as WebP (`?size=thumb` 480 px, else 1800 px) through the shared image cache.
- **Pages** gain `picture` (the main picture, in the box), `banner` (with `focus`, where the strip is cut), `gallery` and `facts` (label, value, available); each picture and fact has its own "available to", narrowed by the page's. In the text, `![caption|right](picture:<id>)` (`|left`, `|small`, `|wide`). A page can only use pictures the wiki has. History and restore carry them.
- **Privacy:** the filtered page (View as, Ask) drops pictures and facts not available to the viewer, and the text's pictures go with their text (a `:::dm` block's never reach a player). `GET …/wiki/pictures/:id` is the one wiki route a player may call: it answers 404 unless the picture is in a part of a page available to them (`wiki.pictureVisible`). Ask reads facts as an "At a glance" section and pictures as `[picture: caption]` (never their ids); the search index gets facts and captions with their audiences.
- **The AI:** a new page it proposes is offered the picture of the DM's creature, item, merchant, map or handout with the same name (matched on the server, no AI call); the DM unticks it or not. A changed section keeps the pictures the DM had put in it. No prompt change, so `PIPELINE_VERSION` stays.
- **Page** (`web/public/wiki/wiki.js`, style.css, mobile.css): the front page is cards (picture or the kind's icon on its colour, kind, title, opening words) with kind and tag chips; kinds fall into families (people, places, factions, items, creatures, quests, sessions, lore; `KIND_FAMILIES` in `shared/src/wiki.js`) with a colour and icon mixed into each theme. A page has a banner (or the kind's colours), breadcrumbs, the box (picture, facts, inside, what's inside it), a drop cap, pictures in the text, a gallery, a lightbox, and hover previews on links. The editor has Main picture, Banner (with a slider), Gallery, At a glance (with "+ The usual for <kind>"), and "+ Picture", paste and drop in each section. On a phone the cards are the list.
- **Tests:** `server/test/wiki-pictures.test.js` (4: the syntax and kinds; upload, archive, sizes and copies; a player never gets a hidden picture's id or bytes, through View as, the picture route or Ask; the AI's picture and kept pictures), two page tests in `web/test/wiki.test.js`. Screenshots in headless Chromium: tavern (light and dark), arcane, scroll, dungeon, frost, neon, and a 390 px phone.

### 2026-10-22: Attacks and area spells from the map

The owner (2026-10-21 feedback, item 2): "some way of managing attacks and such from the map. This should be optional as a feature, but the player should be able to select an enemy and make an attack. Or cast an AOE spell and appropriate actions taken. The DM should also be able to do this with enemies… smooth and easy, not clunky." Research on Foundry (with Midi-QOL), Roll20, Owlbear Rodeo, D&D Beyond Maps and Fantasy Grounds in `docs/notes/map-attacks-research.md`; what we took: target then act, the server does all the rolling and applying, one card per attack, the DM's undo and optional OK.

- **Rules** (`shared/src/attacks.js`): what a sheet can attack or cast with (weapons, attacks, damaging spells, a Wild Shape form's attacks, using the sheet's own bonuses), what a stat block can (2014 and 2024 attack and save lines), defenses (AC, saves, resistances, immunities, vulnerabilities; "resistance to … damage" on a sheet), advantage and disadvantage from conditions and distance, rolling (a 20 doubles the damage dice, a 1 misses), saves for half, spell slots, concentration DCs, and `attackLogFor`, the log filtered for a player. `shared/src/attack-riders.js`: extra damage on a hit, Sneak Attack first.
- **Server** (`server/src/routes/attacks.js`): `GET …/tokens/:tid/actions` (what this token can do, against which target, with the situation), `POST …/maps/:mid/attack` (rolls, damage, saves, slots, hit points on tokens and sheets, the log on the map), `POST …/attacks/:aid` (the DM's Apply, Half, Skip, Undo). Players act only with their own tokens and only at tokens they can see; a creature's AC, saves and hit points never reach them. `attacks` in the campaign's settings (on by default; damage waits for the DM or not; show AC). The map's `attacks` log (last 30) is archived with the map like any change. No prompt or schema change, so `PIPELINE_VERSION` stays.
- **Page** (`web/public/map/attacks.js`): Attack on a picked token's bar, the action picker (one tap per action, Normal / Advantage / Disadvantage, extra damage, two hands, slot), tap-to-target, template placing for area spells, the cards (at the top on a phone), the Attack log, Campaign settings' section. `dice.js` shows the server's rolls with the 3D dice.
- **Tests:** `shared/test/attacks.test.js` (20), `server/test/attacks.test.js` (4: weapon attack, crits and the pending OK and Undo; area spell saves and slots; privacy of the log and AC; switched off), `web/test/map-attacks.test.js` (3 page tests). Checked in a real browser (desktop and phone width, player and DM): no console errors.
### 2026-10-22: Backgrounds from the books, applied when picked; the DM's own

- The owner asked for every background from his books, filled in when picked, and backgrounds the DM can make. `shared/src/backgrounds.js`: the books' backgrounds as short summaries (PHB 2014 and 2024 checked against the PDFs; Glory of the Giants and The Book of Many Things from memory), `applyBackground` (ticks skills without lowering expertise, adds the feature or feat and the tools and languages without repeating lines, fills Equipment and gold only where empty, and lists what changed) and the DM's list (`normalizeCustomBackgrounds`, up to 50). `point-buy.js` now takes the 2024 backgrounds' abilities from there, and the DM's 2024-style ones too.
- The sheet's Background box (`web/public/sheet/background.js`): suggestions by edition with the DM's first, applied on pick with a note and Undo, and "What X gives" with Apply. Campaign settings has **Your own backgrounds** (`web/public/campaign/backgrounds.js`); `PATCH /campaigns/:cid/settings` takes `backgrounds`.
- Books recorded in `docs/notes/books-worked-through.md` (a Backgrounds table). Tests: server `backgrounds.test.js`, shared `backgrounds.test.js`, web `backgrounds.test.js`.

### 2026-10-22: Help making a character

- The owner asked for help when making a character, not forced: what a class gives and what to choose. `shared/src/creation-help.js` holds, for 2014 and 2024 (the PHBs, and Tasha's artificer), each class's hit die and hit points, saves, armour, weapon and tool proficiencies, weapon mastery, skills (how many, from which), starting equipment choices, spellcasting basics and features per level, and the PHB races (2014) and species (2024). `web/public/sheet/creation-help.js` is the panel above the sheet: chips tick skills, pick a class, race or background, and a button puts the starting equipment in the Equipment box. It redraws as the sheet is typed in and stays open or shut as the player left it.
- Tests: shared `creation-help.test.js`, web `creation-help.test.js`.

### 2026-10-26: Tests that failed now and then under load
- **Wiki proposals' order** was already fixed on main (PR #96), behind both the server's "wiki AI: after each session…" test and the web's "the AI's changes wait in a list…" test failing at random.
- **Dice after a page closed.** In the page tests, the default Deluxe dice load Three.js and then fail (no WebGL in jsdom), which redraws the dice settings. Under load that landed after the page had closed ("document is not defined", seen in the map companions test). `dice.js` has `rollersLoaded()`, and `test/page.js` waits for it when a page closes.
- **Bag of Tricks.** `item-actions.test.js` asserted more than 1 hit point, but the weasel (a 1 on the d8) has 1. It now checks the SRD's own hit points; a regression test forces the weasel.
- Checked by running each test 16–32 times, 8–16 at once, and the web suite twice beside the server suite. The creatures tab's "Add token offers the DM's creatures" failure seen once could not be reproduced (24 runs at 12 at once, and full runs under load); no change for it.

### 2026-10-27: The wiki's space, stage 0 (no change in behaviour)
- The owner: the wiki is "far too big to be just a page"; it gets a space of its own with visual navigation. The plan is [docs/notes/wiki-space.md](docs/notes/wiki-space.md) (35 PRs in stages 0 to 11, every item from the gaps research folded in, the truth/rumour switch and players' lore about their characters included).
- `web/public/wiki/wiki.js` is split: `wiki/data.js` (the state, pictures, kinds and `nav`, the moves between views that wiki.js fills in), `wiki/page.js` (a page drawn and edited) and `wiki/views/waiting.js` (the AI's changes). wiki.js keeps the tab: the list, the front page and which view shows.
- New `web/public/page/pan-zoom.js` (drag, wheel and pinch for the big views; the maths is plain functions) and `web/public/page/mini-views.js` (a map crop with pins, a ring of portraits, a ribbon of moments, for the compass, the Home and the rail), with `web/test/pan-zoom.test.js` and `web/test/mini-views.test.js`.

### 2026-10-27: The wiki's space, stage 1a: a space of its own
- The Wiki button now leaves the table for the wiki's own space on the same page (`web/public/wiki/space.js`, `<html data-space>`): the top bar gives way to a rail (Home, New page, Waiting with its count, The table) and a bar (the trail of the last 8 pages opened as picture chips, and the in-game time). The map stream, dice and Ask keep running behind it.
- The address follows what's shown (`?space=wiki#/home`, `#/page/<id>`, `/edit`, `/history`, `#/new`, `#/waiting`), so Back, Forward and reload land there; a player sent to it stays at the table and never asks for the wiki. The wiki can now be popped out (`page/side-panel.js` `TABS` lacked it). On a phone the rail is a row along the top.
- `src/wiki/store.js` keeps each campaign's pages in memory until the next write (callers get copies).
- Tests: `web/test/wiki-space.test.js` (3). SPEC §6.11 has "The wiki's space".

### 2026-10-27: The wiki's space, stage 1b: the Wheel and the Home
- **The Home** (`web/public/wiki/views/home.js`): above the cards, a hub: the campaign's picture, Last time (the last session's page), the Wheel small, tiles for the Atlas, Web and Timeline (marked coming soon), the party, what waits, and the pages changed lately.
- **The Wheel** (`web/public/wiki/views/wheel.js`, `#/wheel/<family>`): the kind families as an SVG colour wheel round the party's token pictures. A slice shows its kinds as chips and its pages as cards. It's on the rail.
- **Server** (`src/wiki/views.js`): `GET …/wiki/wheel` and `…/wiki/home`, both with `?as=` a player, counting only what that viewer may see. The page summary moved there from `routes/wiki.js`.
- Not built: the DM choosing the Home's picture (campaign settings go to players; to do with care later).
- Tests: `server/test/wiki-views.test.js` (2, with privacy), a page test in `web/test/wiki-space.test.js`. Checked in headless Chromium at 1280 and 390 px, light and dark: no console errors.

### 2026-10-27: The wiki's space, stage 1c: the compass and History's differences
- **Compass** (`web/public/wiki/compass.js`, `GET …/wiki/:pid/compass`, `compass()` in `src/wiki/views.js`): picture chips under each page's banner for its family, the pages it's inside, the pages it holds, and its links both ways, for the DM or as a player.
- **History** marks what changed in each version against the one before (`web/public/wiki/diff.js`: a word diff, sections matched by id, facts by label).
- Tests: a compass test in `server/test/wiki-views.test.js` (privacy included), `web/test/wiki-diff.test.js` (2), a page test in `web/test/wiki-space.test.js`.

### 2026-10-27: The wiki's space, stage 11: scrub through time
- **As of** (`src/wiki/asof.js`, `web/public/wiki/asof.js`): a slider in the Atlas and the Web goes back to the end of each session played (`GET …/wiki/moments`: the day played plus the late-night rollover). It's all worked out from the archive, never stored twice: each page's version saved by then (`readWikiChanges`), each map's change lines replayed to then (`readMapChanges`, `applyJson`); a moment in the past is cached (200 at most). `?at=` (an ISO time) on `GET …/wiki/web` and `GET …/wiki/atlas`; the Atlas's answer has `then_tokens` (where each token stood, and where it was going), drawn as dots with names while the live tokens fade (`map/wiki-layers.js`, `<html class="map-asof">`).
- **Privacy:** a player (or the DM viewing as one) is judged by then AND now: a page, section, fact, event or picture they couldn't see then or can't see now is left out (`wiki.filterFor` on the old version, cut to `listFor` now); a map must be shown to them then and now, with the places they see in both and the tokens they saw then that they still see now (or that are gone since).
- **Lanes by character** on the Timeline (`?characters=1`, `timeline({ characters })`): each player character's own lane of their journeys on the maps.
- Not built: "as of an in-game day" (the clock keeps no history yet), and the map's picture as it was (the Atlas shows today's picture).
- Tests: `server/test/wiki-asof.test.js` (two moments, privacy then and now, the moments, character lanes), `web/test/wiki-asof.test.js`.
- End of stage 11: the regression tests and the full `npm test` pass (server 343, shared 229, web 298).

### 2026-10-27: The wiki's space, stage 10: boards
- **Storing them** (10a): table `wiki_boards`, **schema v21** (db upgrade test), archived whole after each save in `wiki/boards/<id>/changes.jsonl` and restored from there (`src/wiki/boards.js`, `normalizeBoard`). A board is `{ id, title, owner, dm, shared_with_dm, items: [{ id, kind: page | note | picture | board, ref, x, y, w, h, size, text, color }], arrows: [{ id, from, to, label }], version }`, 500 items and 500 arrows at most; a save from an old version gets a 409. A DM's board is every DM's; a player's is theirs, and the DM's to read (never change) only when they share it. Only what the viewer can see goes on a board (a page, picture or board they can't see is refused like one that doesn't exist); a card for a page hidden since comes as `gone` (no title or anything else), an arrow to it without its label, and saving it back keeps its ref and label on the server. Routes: `GET`/`POST …/wiki/boards`, `GET`/`PUT`/`DELETE …/wiki/boards/:id`.
- **The board view** (10b, `web/public/wiki/views/boards.js`): `#/boards` (Boards on the rail, for players too) and `#/boards/<id>`: pan and zoom (`page/pan-zoom.js`), HTML cards (pages small, medium or large with picture and opening words; sticky notes in six colours; wiki pictures, the DM's; links to other boards) and labelled arrows (select a card, → Arrow from here, click the other). Drag to move, the corner to resize; it saves 0.8 s after the last change. A page card opens the drawer. On a phone it's for looking and moving only. A prep page's Prep board has **Lay it out as a board** (its groups as columns).
- Tests: `server/test/wiki-boards.test.js`, `server/test/db.test.js` (v20 → v21), `web/test/wiki-boards.test.js`.
- End of stage 10: the regression tests and the full `npm test` pass (server 340, shared 229, web 296).

### 2026-10-27: The wiki's space, stage 9b: import and export
- **Import** (`#/import`, **Import and export** on the rail; `POST …/wiki/import`, the DM's; `src/wiki/transfer.js`): a Markdown or Obsidian folder as a zip becomes pages at once: one a file, the front matter's title, kind (or type), tags and aliases, its other short keys as facts; `[[links]]` kept (`[[Page#Heading]]` links the page); pictures (`![[map.png]]`, `![alt](path)`) go into the wiki's pictures; folders become "inside" (a folder's own note, `Millbrook/Millbrook.md`, or a new page for the folder). All the DM's; a title the wiki has is left out, never overwritten. Anything else (a single note, text, a Word file: its paragraphs, read on the server; or pasted notes) goes to the AI (`wikiAI.importNotes`, task `wiki_draft`, purpose `wiki:import`, about 24,000 characters a call): new pages wait under Waiting as the DM's, and additions to existing pages as sections only for the DM. `PIPELINE_VERSION` 38.
- **Export** (`GET …/wiki/export.zip`): Markdown files in folders by what each page is inside, front matter (title, kind, tags, aliases, inside, facts), pictures in `pictures/`; it imports back. As the viewer sees the wiki: the DM's, `?as=` a player's version, or a player's own (players get **Export and print** on the rail).
- **Print**: a Print button on every page, and ticked pages on `#/import`, one a sheet (`#wiki-print`, print CSS in `style.css`), for paper or Save as PDF.
- `fflate` added to the server (zip in and out).
- Tests: `server/test/wiki-transfer.test.js` (a vault with links, pictures and folders; the round trip; a player's export; notes and a Word file to the AI), `web/test/wiki-transfer.test.js`.
- End of stage 9: the regression tests and the full `npm test` pass (server 338, shared 229, web 294).

### 2026-10-27: The wiki's space, stage 9a: live embeds
- `[[creature:Name]]`, `[[item:…]]`, `[[merchant:…]]`, `[[handout:…]]` and `[[map:…]]` in a section show the thing itself, live, never a copy (`APP_EMBED_RE`, `appEmbeds` in `shared/src/wiki.js`; they're not links, so never a missing page). The server sends the page's embeds with it (`embeds`, keyed `kind:name`, from `src/wiki/embeds.js`, `wiki.appEmbeds`): a creature's stat block with buttons to roll its attacks and checks, an item's card, a merchant with Open the shop, a handout, a map's picture that opens it. The DM is told when a name matches nothing.
- Per viewer: creatures and items are the DM's; a merchant reaches a player only when they can see one of its tokens; a handout only when they got it; a map only when it's shown to them. `wiki.listFor` drops the rest from a player's text (the name too), and players' search leaves them out.
- The section editor's **+ Embed** (`GET …/wiki/embeds`, the DM's) chooses one and puts `[[kind:Name]]` in the text. `web/public/wiki/embeds.js`.
- Tests: `server/test/wiki-embeds.test.js`, `web/test/wiki-embeds.test.js`.

### 2026-10-27: The wiki's space, stage 8d: a Home that thinks
- After a session's chronicle (beside the prep check), one more AI call (purpose `wiki:insights`, `InsightsSchema`, `INSIGHTS_SYSTEM` in `src/wiki/ai.js`) returns **insights**: loose threads (rumoured quests not followed, people unseen, promises, clues not found), **Previously on…** (a recap to read aloud, only what the players saw) and **contradictions** (a section the records disagree with, with a rewrite). They're kept beside the proposals (`action: 'insight'`, status open, dismissed or done; archived). The AI is told what it noticed before, and the server never makes one again with the same key, or for the same page and kind; only the newest recap stays open. A failure leaves the run's other proposals and is noted in the job's message. `PIPELINE_VERSION` 37.
- The DM's Home shows them under **Since last time** (`web/public/wiki/views/insights.js`), with Open, Dismiss and, for a contradiction, **Propose the fix** (its rewrite becomes an ordinary change under Waiting). Routes: `GET …/wiki/insights`, `POST …/insights/:id/dismiss`, `POST …/insights/:id/fix`; `GET …/wiki/home` has `insights` for the DM only.
- Tests (fake AI): `server/test/wiki-insights.test.js`, `web/test/wiki-insights.test.js`.
- End of stage 8: the regression tests and the full `npm test` pass (server 332, shared 229, web 290).

### 2026-10-27: The wiki's space, stage 8c: Tidy up
- `#/tidy` (`web/public/wiki/views/tidy.js`, the DM's, **Tidy up** on the rail): what in the wiki needs a hand, by rule (`TIDY_RULES` and `tidyItems` in `src/wiki/views.js`, `GET …/wiki/tidy`), each with a button: links to pages that don't exist (**Make the page**, only for the DM), facts linking deleted pages (`wiki.removedNames`; Edit), names written out but not linked (**Link them**: every Link it suggestion on the page), pages with no links in or out (Open), places not on a map (**Put it on a map**), places on maps with no page (**Make a page**), people with no picture (**Choose a picture**), blocks for names that match no player (Edit), planned parts unchanged for 3 sessions or more (prep pages left out; Edit) and players' accounts not yet marked true or false (Open).
- Tests: `server/test/wiki-tidy.test.js` (each rule), `web/test/wiki-tidy.test.js`.

### 2026-10-27: The wiki's space, stage 8b: who knows what and the spoiler check
- `#/knows` (`web/public/wiki/views/knows.js`, the DM's, **Who knows** on the rail): the DM's pages against the players, each cell all (●), some (◐) or nothing (○), from `wiki.coverage(cid, viewer)` (`src/wiki/store.js`: the page's blocks, facts, events and pictures the player gets; planned parts never count). A click shows that player's version beside the page's parts; tick some (or none: all of it) and **Reveal to** them in one save (`POST …/wiki/:pid/reveal`: the page becomes theirs to see, the parts chosen widen, a part "as the page" that wasn't chosen keeps what the page was).
- **The spoiler check** (`spoilers` in `src/wiki/views.js`, `spoilerCheckFor` in `src/routes/wiki-viewer.js`): what newly visible words name (links, and titles or other names written out, four letters or more, whole words) that a player can't see yet, leaving out the page being shown. `POST …/wiki/spoilers` (a page's parts, or text); before Reveal to and before sending a section as a handout, the page asks first; under Waiting, a reveal and a player's lore carry `spoilers` and show "This names the Pale Hand, which Lyra doesn't know yet" (never warning a player about their own words).
- Tests: `server/test/wiki-knows.test.js`, `web/test/wiki-knows.test.js`.

### 2026-10-27: The wiki's space, stage 8a: the quest board and lists
- `#/quests` (`web/public/wiki/views/quests.js`, a Quests button on the rail and a tile on the Home): the quests the viewer may see (pages in the quest family, not clues, arcs or plans) as cards in columns by their Status fact, read loosely (`questColumn`: "Under way" is Active), with any other status as its own column and "No status" last; a row for each arc (the arc page a quest is inside, or the one its Arc fact links). Cards show the picture, Given by and Reward. The DM drags a card to a column, or picks its status from the card (phones), and `PUT …/wiki/:pid/status` sets the Status fact (theirs, true). Players see their own board, without the tools.
- **Lists:** the Wheel's **Save as a list** saves a filter (family, kind, tag, a part's canon, a fact's words); **Make a list** on the Home asks the AI in plain words ("hostile NPCs in Millbrook"): one quick call on Ask's model at its quick effort (purpose `wiki:list`, the model unchanged), returning page ids. The Home shows each list as a row of cards. Lists are kept beside the proposals (`action: 'list'`, so the archive keeps them), never in the campaign settings, which players get: a list's name can give a secret away. `GET …/wiki/lists` filters each list's pages for the viewer (`?as=`); a player gets none. `PIPELINE_VERSION` 36 (a new prompt).
- `src/routes/wiki-overview.js` holds stage 8's routes; `viewerPages` moved to `src/routes/wiki-viewer.js` so both route files share it.
- Tests: `server/test/wiki-quests.test.js`, `web/test/wiki-quests.test.js`.

### 2026-10-27: The wiki's space, stage 7c: after the session
- `afterSession` in `src/wiki/ai.js`: after a session's chronicle, if there's an open prep page with embedded clues, one more AI call (purpose `wiki:prep`, `PrepSchema`, `PREP_SYSTEM`) says which came out. Proposals: a reveal of a found clue's opening to its finders (only those the cited records' `known_by` allow), the clue's Found fact, Played on the prep page, and the next prep page ("Session N+1 plan": strong start, scenes not reached, the clues not found, the Arc). A failure here leaves the run's other proposals and notes it in the job's message. `PIPELINE_VERSION` 35.
- `prepMarks` (`src/wiki/views.js`) gives the DM each embedded clue's outcome on a prep page: found (its Found fact), carried (a later prep page embeds it) or missed (played, not found); the page shows ✓, ↷ or ✗ beside it.
- Tests: `server/test/wiki-after-session.test.js` (fake AI).
- End of stage 7: the regression tests and the full `npm test` pass (shared 325, server 229, web 283).

### 2026-10-27: The wiki's space, stage 7b: arcs and the prep page
- `shared/src/wiki.js`: `PREP_KIND` ("session plan"), `isPrepPage`, `isArcPage`, `prepPlayed`, `openPrepPage` (the newest prep page whose Played fact is empty). `shared/src/wiki-templates.js`: the **Session plan** starter (Strong start, Scenes, Clues, People, Places, Encounters, Treasure; Session, Arc, Played), all the DM's and planned.
- `GET …/wiki/home` gives the DM `prep` (the open prep page); `lastSessionPage` leaves prep pages out.
- Page: the Home's **Next session** tile (opens the prep page, or a new one from the template); **Prep board** on a prep page (`web/public/wiki/views/prep.js`: the pages it names as cards, clues first, then by family); the Timeline's **Lanes by arc**. The Quests board (stage 8a) will group by arc when it lands.
- Tests: `server/test/wiki-prep.test.js`, `web/test/wiki-prep.test.js`.

### 2026-10-27: The wiki's space, stage 7a: clues and reusable secrets
- `[[!Clue title]]` (`EMBED_RE`, `embedNames`, `unembed` in `shared/src/wiki.js`) puts a page's opening section where it's written. `embedsIn(page, pages, openings)` (`src/wiki/views.js`) gives each embed for the viewer: `GET …/wiki/:pid` (the DM, `?as=` and a player) has `embeds`. For a player, `wiki.listFor` drops an embed they can't see from the text (and a section that was nothing else); one they can see stays as `[[!Title]]`. Availability lives on the clue's own section, so one reveal shows it everywhere.
- `wikiLinks` counts an embed as a link to its page; `unlink` (search, excerpts, the AI, Ask's reading) drops embeds.
- Page (`web/public/wiki/page.js` `richText`, `embedBox`): the clue boxed with "Clue: title" (a link) and, for the DM, who has it; a missing one offers Make it (DM only). The drawer and View as show them too. The editor's hint mentions `[[!Clue name]]`.
- Tests: `server/test/wiki-clues.test.js`, `web/test/wiki-clues.test.js` (2).

### 2026-10-27: The wiki's space, stage 6c: players' lore
- `wikiAI.lore` / `loreOf` (`src/wiki/ai.js`), `POST`/`GET …/wiki/lore` (players only): a player adds a section, a page (inside their character's), a relationship or an event about their own character, for only the DM (default), chosen players or everyone. It waits under Waiting as an ordinary proposal marked `from: 'player'`, `by_player`; the card says "From Thorin" and has **Approve it as**: Thorin's account (`told`), True, False (with the truth). Approved parts are `by: 'player'`, `owner` (`src/wiki/store.js` `byOf`; the DM saving the page unchanged keeps them theirs, changing one makes it the DM's).
- `PUT …/wiki/:pid/lore`: the player changes their own section, event or fact at once (anyone else's is a 404); a part the DM confirmed as true goes back to `told`. On the page: **Your story** (Add to your story, and what they've sent with its status) on their own character's page (`web/public/wiki/lore.js`), and Change on their own sections.
- The AI never rewrites players' parts: `update_section` skips them, Expand and Tidy refuse them, a set_fact never replaces their tie, and its instructions say so. `PIPELINE_VERSION` 34.
- Not yet: pictures in players' lore (the wiki's picture upload is the DM's); changing facts and events from the page (the API does it).
- Tests: `server/test/wiki-lore.test.js` (2), `web/test/wiki-lore.test.js` (2).
- End of stage 6: regression tests and the full `npm test` pass (shared 322, server 229, web 280).

### 2026-10-27: The wiki's space, stage 6b: character pages
- A page can be a player's character's: `player` on the page (`src/wiki/store.js`; one page per player, only a campaign's player; `POST`/`PUT …/wiki` take it). Waiting lists **Character pages**, one button for each character with a name and no page (`characters` from `GET …/wiki/proposals`); `POST …/wiki/characters {player}` makes the page: the character's name, kind `character`, for everyone, with a copy of their token picture. They aren't AI proposals, so the AI's counts and Approve all are unchanged.
- **From the sheet** (`web/public/wiki/character-sheet.js`; `sheetParts` and `SHEET_PARTS` in `shared/src/wiki.js`): race, class and level; looks (age, height, eyes…, the appearance text); backstory; allies. The server works them out from the active sheet on every read (`from_sheet` beside the page) and never stores them in the wiki. The DM and the player see them all; the other players only the parts the player ticks (`sheet_share`, `PUT …/wiki/:pid/sheet-share`, the player or the DM). The DM's View as shows what that player gets.
- The party in the Wheel's middle and on the Home opens their pages. A character's page shows to the party even with nothing written on it.
- The View as line now reads "What Thorin gets from this page" (players read the wiki themselves now, not only through Ask).
- Tests: `server/test/wiki-characters.test.js`, `web/test/wiki-characters.test.js`. (The first web test in a file that opens the DM's page takes about 70 seconds, mostly in setup or teardown; it was like that before this stage.)

### 2026-10-27: The wiki's space, stage 6a: players read their own wiki
- Server: `wiki.listFor(cid, viewer)` (`src/wiki/store.js`) is a player's whole wiki: every page through `filtered()`, parents they can't see dropped, and `[[links]]` to pages they can't see rewritten to the words shown (so `[[Secret Lair|the old den]]` reads "the old den" and a hidden title never leaks). `viewerPages` in `src/routes/wiki.js` treats a player as `?as=` themselves on every read route (list, page, Home, Wheel, Find, Web, Timeline, Atlas, compass, evidence); a page they can't see is a 404; the Atlas lists only maps shown to them; templates, history, proposals, links, drafts and pictures for the chooser stay DM only (403). Ask's names (`qa/agent.js`) use `listFor`.
- Page: the Wiki tab is everyone's (`app.js`); `loadWiki({ isDm, userId })` sets `state.dm`/`state.me`, and a player's page leaves out New page, Templates, Waiting, the truth switch, The AI's changes, Edit, History, View as, Save as a template, Delete, Make up… and Link it; the DM's addresses (`#/new`, `#/waiting`, `…/edit`) open the Home. The drawer has no Edit for them.
- The DM's View as now shows exactly what the player gets, so a link to a page that doesn't exist yet is only words there (the DM's own view still offers to make it).
- Tests: `server/test/wiki-players.test.js` (every player route swept for the DM's secrets, the 404s, the 403s, the old den link); several server tests now check a player's own response equals the DM's `?as=` view; `web/test/wiki.test.js` (a player reads their own wiki with none of the DM's tools); `web/test/wiki-space.test.js` (a player sent to the wiki's address lands in it; Find works for them, without Make up…).

### 2026-10-27: The wiki's space, stage 5b: the AI as a writing partner
- `wikiAI.draft` (`src/wiki/ai.js`, `POST …/wiki/draft`, task `wiki_draft`: `MODEL_WIKI_DRAFT`, else `MODEL_WIKI`; one call each, run on the request, not the job queue, so it doesn't wait behind a session): **Draft from the records** (a saved page, or a new one from the editor with its template's headings and prompts: the records found by search; sections, facts, time and events become the usual proposals, with audiences from `known_by`), **Expand** a section (an update, never wider), **Tidy** a section (wording only; it keeps who it's available to and its sources; the DM's stays the DM's), **Make up…** (an NPC, a tavern, a shop, a rumour, a name, or anything, with the DM's few words; it reads the related pages first; a new page only the DM sees, its sections and facts `planned`). Everything waits under Waiting for you, marked with what made it. `PIPELINE_VERSION` 33 (new prompts).
- **Link it** (no AI): `wiki.linkSuggestions` finds names of other pages (titles and other names, the longest first) in a page's text that aren't linked, outside links, pictures and block lines, and not pages the section links already; `GET …/wiki/:pid/links`; `POST …/wiki/:pid/links` makes the first one a `[[Title|as written]]`. The page underlines them with a Link it button.
- Page (`web/public/wiki/write.js`): ✦ Draft from the records at the foot of the editor, ✦ Expand and ✦ Tidy on each saved section, ✦ Make up… in Find (Ctrl K) and on the Home.
- Tests: `server/test/wiki-draft.test.js` (2), `web/test/wiki-write.test.js`.
- End of stage 5: regression tests pass; the full `npm test` passed apart from the dice-physics timing test ("thrown dice land … within a few seconds"), which passes on its own: it's timing-sensitive under the full run's load, and this stage didn't touch dice.

### 2026-10-27: The wiki's space, stage 5a: templates
- `shared/src/wiki-templates.js`: starter templates Person (leads with **At the table**: voice and manner, wants, knows, would trade; the DM's), Place, Faction, Item, Creature, Quest, Session, Lore, and **Clue** and **Arc** for stage 7; `templateFor(kind, own)` (the DM's for that kind, the starter for it, then the family's), `fromTemplate` (empty sections and facts with the prompts beside them). "arc" joins the quest family.
- The DM's own templates are wiki pages with `template: true` (`POST …/wiki` takes `template`), always the DM's, kept apart from the wiki: not in the list, Ask's search, the views, the AI's reading, maps or a player's wiki (`wiki.get` refuses one unless asked with `templates`; only the DM's `GET …/wiki/:id` and edits do). Their names only clash with other templates. `GET …/wiki/templates` gives `{starters, own}`.
- Page: **Start from** in a new page's editor (Blank, yours, starters; typing a kind picks its template while nothing is written yet); the prompts are placeholders; sections left unwritten aren't kept. **Templates** in the rail (`#/templates`, `web/public/wiki/templates.js`): cards with New page from this, Make my own from this (starters), Edit and Delete (yours), + New template. A page's **Save as a template**. A template is edited in the page editor (prompts instead of text).
- Tests: `server/test/wiki-templates.test.js` (2), `web/test/wiki-templates.test.js`; the editor test in `web/test/wiki.test.js` goes back to Blank after the kind brings its template.

### 2026-10-27: The wiki's space, stage 4d: the AI dates things; past journeys on the Timeline
- The wiki's AI (`src/wiki/ai.js`) has two more actions: **set_when** (a page's time; a session page gets the in-game span it covered) and **add_event** (a dated line on the page it's most about, linking the others; canon and sources; who it's for from the records' `known_by`, as with sections and ties). A new page can carry its `when` and `events`. The prompt gets `<in_game_time>` (the clock now, and the calendar's months and era) and the pages' times and events. A time the page already has, or an event it already has, isn't proposed; a rejected one isn't proposed again. Approving saves them dated by the server (old events keep their times); an edited event is the DM's. `PIPELINE_VERSION` 32.
- Waiting: **Time** cards (Now beside Proposed, with what the calendar reads it as) and **Event** cards (Edit: when, words, who it's for); a new page's card lists its time and events. `POST …/approve` takes `when` and `event: {when, text, available}`.
- **Journeys** (`mapJourneys` in `src/maps/events.js`, `maps.journeys(cid, { forUser })`, cached until a map has new change lines): worked out from the maps' archived changes, never stored twice; those going together are one journey; arrived, stopped on the way or still going. For a player only maps shown to them when it began and tokens not hidden. They're dashed bars on The campaign lane (`type: 'journey'`), with Show on the map at the destination.
- Tests: `server/test/wiki-ai-time.test.js`, `server/test/wiki-journeys.test.js` (2, privacy included), `web/test/wiki-time-cards.test.js`.
- End of stage 4: three tests that compare the whole settings object (`shared/test/gear.test.js`, `server/test/sheets.test.js`, `web/test/sheet.test.js`) now expect 4a's `calendar` and `wiki` too. Regression tests and the full `npm test` pass.

### 2026-10-27: The wiki's space, stage 4c: the Timeline
- Server `src/wiki/timeline.js` (`timeline`), `GET …/wiki/timeline?as=&truth=1`: lanes (the DM's own from `wiki.lanes` in the campaign's settings: a page, the pages inside it and those linking to it; then History, anything before Day 1; then The campaign), dated items (pages with a time, every event) with family, picture, canon, by and `place` (`pagePlaces` in `src/wiki/maps.js`: for a player only revealed places on maps shown to them), undated items and session pages with no time, the clock and the calendar; filtered for the viewer, at most 600. `PATCH …/settings` takes `wiki: { lanes }`. The Home gives `moments` for its tile.
- Page `web/public/wiki/views/timeline.js`, route `#/timeline(/page id)`, rail item ⟿: lanes with picture cards for pages and bars for events (dotted for a rumour, faint for false or planned, striped for your notes), dragged sideways and zoomed with the wheel or a pinch from centuries to hours, the calendar's names on the scale (`timeTicks`) and full moons (`fullMoons`, in `shared/src/wiki-time.js`), the Now line, Fit all, View as, Add a lane… (and ✕ on a lane), trays for Undated and Sessions with no time yet. A card: Open page and **Show on the map** (the Atlas on that map, the place in the middle, its pin pulsing with its card open; `showOnMap` in `wiki/views/atlas.js`, `pulseWikiPin` in `map/wiki-layers.js`). The Atlas card's **On the timeline** goes the other way. On a phone, a vertical ribbon of cards. It opens on the campaign's times (History off to the left); Fit all shows everything.
- The compass's **When** mini-ribbon and the Home's Timeline tile are live. The Truth button redraws the Timeline too.
- Tests: `server/test/wiki-timeline.test.js` (2, privacy included), `web/test/wiki-timeline.test.js`, a scale test in `shared/test/wiki-time.test.js`. Checked in headless Chromium at 1280 and 390 px, no console errors.

### 2026-10-27: The wiki's space, stage 4b: when, and events on pages
- `shared/src/wiki-time.js`: `parseWhen(text, calendar, { now })` reads "Day 12", "Day 12, 21:00", "Day 12 night", "the morning of Day 3", calendar dates ("3 Mirtul 1492", "Mirtul 3, 1492", "the 3rd of Mirtul", with a time or part of the day), whole months and years ("Mirtul 1492", "1489 DR"), festival days, ranges ("Day 3 to Day 5", "1 to 3 Mirtul 1492", "between … and …"), "300 years ago" (that year, with a calendar), "3 years before" (Day 1), "today"; anything else is kept as written with `from: null`. `whenText` writes times back; `whenKey` sorts.
- Pages get `when` and `events` (`src/wiki/store.js`: up to 100, each with canon, sources, who it's for, `by: 'ai'` kept when saved unchanged). The server dates them from their text with the campaign's calendar and clock (`dated`); a text that didn't change keeps its time, so "300 years ago" doesn't drift; a restored version keeps its own. `filtered()` drops planned and unavailable events; the search index and Ask's wiki sections give them dated ("Day 13: The mill burned."), so Ask can answer "what happened on Day 12". `GET …/wiki` gives the calendar and clock.
- The page shows its time under the title and an **Events** list in order (undated last), with badges and session chips; the editor has a **When** box and **Events** rows, each with what it reads as, live.
- Tests: `shared/test/wiki-time.test.js` (3), `server/test/wiki-time.test.js`, `web/test/wiki-time.test.js`. Checked in headless Chromium at 1280 and 390 px, no console errors.

### 2026-10-27: The wiki's space, stage 4a: one calendar for the whole app
- `shared/src/calendar.js`: presets Harptos (festivals, Shieldmeet every fourth year, Selûne, seasons), Gregorian-like (leap years, weekdays, the moon), Exandria (from memory: check it against the book) and the DM's own; date arithmetic (`dateOf`, `clockOf`, `dateText`, `moonText`, leap rules, moon phases). `clockText(minutes, calendar)` reads "3 Mirtul 1492 DR, 18:30 · Full moon"; with no calendar it's "Day 14, 18:30" as before, so old campaigns are unchanged.
- `calendar` in the campaign's settings (`PATCH …/settings`, cleaned by `normalizeCalendar`); `GET …/clock` gives it too. The map's clock, the clock dialog (the day number says its date), travel, rests' notes, the wiki bar and the map events the archivist reads all use it. `PIPELINE_VERSION` 31 (map events' wording).
- Campaign settings → **Calendar** (`web/public/campaign/calendar.js`): pick a preset, then change months, weekdays, day 1's date, leap years, moons, seasons and holidays.
- Tests: `shared/test/calendar.test.js` (4), `server/test/calendar.test.js` (2), `web/test/calendar.test.js`.

### 2026-10-27: The wiki's space, stage 3e: the AI proposes ties
- `src/wiki/ai.js`: `FactSchema`, action `set_fact`, `facts` on `new_page`, `cleanFact`/`asPart` (audience from `known_by`, never wider), approve with `edits.fact`, `factOf` (citations, `by: 'ai'`), a marked fact keeps its canon; the prompt lists each page's facts. `src/wiki/store.js` keeps `by: 'ai'` on facts saved unchanged. `PIPELINE_VERSION` 30.
- Waiting (`web/public/wiki/views/waiting.js`): a Tie card, Now beside Proposed, Edit (words, tone, who it's for); new-page cards list their ties.
- Tests: `server/test/wiki-ai-ties.test.js`, a card test in `web/test/wiki-web.test.js`. Stage 3 is complete.

### 2026-10-27: The wiki's space, stage 3d: the Web
- Server `src/wiki/web.js` (`webLines`, `webGraph`; adds `d3-force` and `d3-hierarchy` for the layout and bubbles), `GET …/wiki/web`.
- Page `web/public/wiki/views/web.js`: route `#/web(/id)`, rail item, chips (Ties, Factions, Family, Whole web, steps, kinds behind "Every kind", links in the text), View as, card with Open page, Centre here, Add a link…; phone ring. Compass Ties group; Home's Web tile live; the Truth button redraws the Web.
- Tests: `server/test/wiki-web.test.js` (lines, merging, steps, presets, stable layout, privacy), `web/test/wiki-web.test.js`. Looked at in headless Chromium, desktop and phone, with 13 pages (not 60).

### 2026-10-27: The wiki's space, stage 3c: relationships are facts
- `TONES`, `factLinks`, `guessTone`, `factTone` in `shared/src/wiki.js`; facts keep `tone` only when chosen; facts 30 → 60.
- Editor: a tone picker on facts that link a page ("Hostile (from the label)" by default). Page: a linked fact gets its tone's colour (`--tone-*` in `style.css`).
- Tests: `server/test/wiki-ties.test.js`, a page test in `web/test/wiki-canon.test.js`.

### 2026-10-27: The wiki's space, stage 3b: how we know it
- `sources` (transcript citations) on sections and facts: `normalizeSources`, `sourceLabel` in `shared/src/citations.js`; `sourcesOf` in `src/wiki/store.js`; zod in `routes/wiki.js`.
- The AI's proposals keep the record ids of each section (`records`); approving copies those records' citations (`citationsFrom` in `src/wiki/ai.js`).
- `GET …/wiki/evidence?s=&as=` (the DM's): the transcript lines, through `evidenceFor` in `qa/tools.js`, so a player's view only gets sessions they were at.
- Page: chips under each section and fact that open the lines; the editor lists them with ✕ (`web/public/wiki/sources.js`).
- Tests: `server/test/wiki-sources.test.js` (edit, history, restore, approve, attendance), a page test in `web/test/wiki-canon.test.js`.

### 2026-10-27: The wiki's space, stage 3a: truth and rumour
- Every section, fact and picture caption has a `canon` (`true`, `rumour`, `false` with a DM-only `truth`, `planned`, `told` with an `owner`): `CANONS`, `playerCanon` and `canonMarker` in `shared/src/wiki.js`; zod in `routes/wiki.js`; `canonOf` in `src/wiki/store.js`.
- Players: a falsehood comes as a rumour without its truth, and planned parts never come (`filtered()`, `extras()`, the search index's docs). Ask: markers before each part in `read_wiki_page` and the facts, and Q&A instructions on rumours, accounts and falsehoods (`PIPELINE_VERSION` 29; the model is unchanged).
- Page (`web/public/wiki/canon.js`, CSS under "Truth and rumour" in `style.css`): badges and styles, a canon picker per part in the editor (a Truth box for false, whose account for told), and the DM's Truth button in the bar (what they believe / what's true; localStorage `dndapp.wiki.truth`).
- Not done: the AI setting canon on its proposals (approving keeps the DM's canon); rumoured places on the Atlas.
- Tests: `server/test/wiki-canon.test.js` (markers, privacy, Ask for a player and the DM), `web/test/wiki-canon.test.js`. Looked at in headless Chromium.

### 2026-10-27: The wiki's space, stage 2d: zoom to go in, the mini-map (same PR as 2c)
- In the Atlas (`data-browse`), `zoomAt` in `map.js` hands over to `zoomThrough`: far into a place that opens a map goes in; out past the whole map goes up, zoomed on its place (a 0.35 s zoom animation; the address follows through a `dndmapshown` event).
- The compass's mini-map (`miniCrop` from the crop endpoint) opens the Atlas there; the Home's Atlas tile shows the top map.
- Not done: names fading in by zoom (the place labels keep their size at every zoom already).
- Tests: the compass's mini-map in `web/test/wiki-maps.test.js`. Zooming through was checked in headless Chromium (jsdom has no layout to zoom in).
- Stage 2 is complete.

### 2026-10-27: The wiki's space, stage 2c: the Atlas and its layers
- `#/atlas/<map id>` (`web/public/wiki/views/atlas.js`) moves `#tab-map` into the wiki (a comment marks its place) and back on leaving any other view or the space; `data-browse` hides the play tools with CSS.
- Wiki layers (`web/public/map/wiki-layers.js`, drawn in `#map-wiki-lands` and `#map-wiki` inside the map's stage; `renderWikiLayers` from `map.js` `render()`): pins, faction lands, people, quests, and a card per pin. The Map tab's Wiki button turns them on there.
- Server: `GET …/wiki/atlas?map=&as=` (`atlasLayers` in `src/wiki/maps.js`).
- Put it on a map from a page (left over from 2b): choose a map, click in the Atlas; the place dialog opens named and linked (`state.placeFor` in `map/places.js`).
- Tests: an atlas test in `server/test/wiki-maps.test.js` (privacy included) and one in `web/test/wiki-maps.test.js` (the map moves in and back, the card, Put it on a map, the Map tab after). Checked in headless Chromium on desktop and phone.

### 2026-10-27: The wiki's space, stage 2b: from either side, reveals in pairs, handouts
- The map's place and token dialogs have a Wiki page row (`web/public/map/wiki-link.js`): pick, Open (drawer), Unlink, Make a page from this (`POST …/wiki/from-map`, `makePageFor` in `src/wiki/maps.js`). A token with a page has a Wiki button.
- A page's On the map box (`web/public/wiki/on-map.js`): crops with pins; opens the map there (`openMapAt` in `map.js`, `nav.showMap` from `app.js`).
- Reveals in pairs: revealing a linked place offers to share the page; a shared page with a hidden place offers Also reveal it on the map.
- Send as a handout (`web/public/wiki/handout.js`, `POST …/wiki/:pid/handout`) from a section, a gallery picture or the glance box.
- Not done from 2b's plan: Put it on a map from the page (needs the Atlas, 2c).
- Tests: two more in `server/test/wiki-maps.test.js`, and `web/test/wiki-maps.test.js`.

### 2026-10-27: The wiki's space, stage 2a: places and tokens link to pages
- Places and tokens take `page: { id } | null` and keep `{ id, title }` (`shared/src/map.js` `normalizePageLink`, `linkPage` in `routes/maps.js`); players get `page: null`.
- `GET …/wiki/:pid` gives `on_maps`. The wiki store now has `events` (`renamed`, `removed`), which `src/wiki/maps.js` follows to rename or drop the maps' links.
- Map crops: `GET …/maps/:mid/image?crop=x,y,w,h&size=` (DM) and `POST …/wiki/pictures { from: { kind: 'map', id, crop } }` (`mapCrop` in `src/wiki/pictures.js`).
- No screens yet: the dialogs and the page's On the map box come in 2b.
- Tests: `server/test/wiki-maps.test.js`.

### 2026-10-27: The wiki's space, stage 1d: the drawer, Find and names as links
- **Drawer** (`web/public/wiki/drawer.js`): a page at the side over either space, with its compass, Open in the wiki and Edit.
- **Find** (`web/public/wiki/find.js`, Ctrl K or Cmd K, and Find on the rail; `GET …/wiki/find`): names first, then up to six pages whose text matches (FTS and meaning, filtered by `visible_to`).
- **Names as links** (`web/public/wiki/names.js`): page names in Ask's answers open the drawer (DM only; the check also covers a DM who switched to a campaign where they're a player).
- Stage 1 is complete. Not done from 1d's plan: names in handouts and the Archivist tab (it holds questions, not records); map cards come with stage 2.
- Tests: a find test in `server/test/wiki-views.test.js` (privacy included), a page test in `web/test/wiki-space.test.js`.

### 2026-10-28: Example data, and a switch between it and the real data
- The owner (2026-10-28): "Make some. Character sheets, wiki material, creatures merchants items, all of it… Maps too, linked and world info… Do not generate any session data outside of the transcripts", and "a toggle somewhere, like the config, that switches between the example data and real data".
- **The switch:** `DATA_SET=example` in `.env` runs the server on `data-example/` (`EXAMPLE_DATA_DIR`) instead of `data/`; `DATA_DIR` names only the real folder, so a `.env` with `DATA_DIR=data` can't send the example there. The embedding model is shared from `data/models`. The log's `Data:` line says which is running.
- **The example campaign**, *The Lanterns of Saltreach* (`example/`, README there): seeded the first time the server starts on an empty example folder (`src/example/startup.js` → `seed.js`, about 30 s, all through the API with `app.inject`, no AI). Five accounts plus `test-admin`, the password in `data-example/example-accounts.txt` (or `EXAMPLE_PASSWORD`); settings with its own calendar and moon; four level 3 sheets with SRD spells, gear and Wild Shape forms, plus a spare inactive character; 15 creatures, about 37 items, 5 merchants; about 60 wiki pages with DM-only and per-player parts, clues, quests, rumours, an arc and the first session's plan; 10 maps (a painted region map, `region-map.js`, with places opening the others, roads, a river and an encounter area; made maps from the creator's generator, a three-level lighthouse with a secret door to the chapel); the speaker map left empty, so the first upload tries the upload screen's guesses. Nothing from play is in it.
- Pictures (public domain or CC0) in `example/pictures/` with `credits.json`; missing ones are skipped.
- Test: `server/test/example.test.js` seeds an empty folder and checks the counts, privacy, no AI calls and no play data.

### 2026-10-28: The example campaign's four transcripts
- `example/transcripts/session-1.txt` to `session-4.txt`: about 2 to 3 hours each (65k words in all), written to read like speech-to-text: crosstalk, rules mistakes corrected at the table, wrong recaps put right, misheard names, private scenes run out loud ("Bot, this bit is just Pip"). Session 3 uses the `0:01:30 - Name:` timestamp style and Theo is away for it. All four parse with `parseTranscript`.
- `example/transcripts/README.md`: what each session covers, how to upload them (speakers left unlinked on purpose) and what to check after each one. `example/ask-checks.md`: 41 questions, who asks, the answer to expect and what must not come out (Nell being Pip's sister, Wren's dream, Oriel's patron's words, what Bran missed in session 3).
- No code changes.

### 2026-10-28: The DM uploads transcripts, and picks the campaign
- The owner: "the DM should be the one uploading transcripts. Doesn't make sense to keep that in the admin space. And the DM should choose which campaign it's for."
- New DM-only **Sessions** tab (`web/public/campaign/sessions.js`, was `admin-sessions.js`): a Campaign picker with every campaign the account is the DM of (by name, starting on the one they're in; campaigns they play in aren't offered), then that campaign's uploads, waiting notes and the upload form, as before. Messages say which campaign it went to.
- `GET /campaigns/:cid/sessions/overview` (DM of that campaign; admins pass DM checks) replaces `GET /admin/campaigns/:cid/sessions` and also lists the members a name can be linked to. The admin screen's campaign cards no longer have Sessions.
- `sessions` added to the tab list (Look's tab order, after Handouts).
- Tests: `web/test/sessions.test.js` (the admin page's session tests moved there, plus the picker); the server's overview test checks a player and another campaign's DM are refused.

### 2026-10-28: Server start, stop and restart scripts that outlive the Claude app
- The live site went down at about 09:05: the Claude desktop app updated itself (Windows event log, 09:06:22) and took the server with it. On Windows the app runs its sessions in a job object, and a `detached` node child stays in that job, so it dies when the app closes.
- `scripts/restart-server.js` now takes `start`, `stop` or `restart` (`npm run server:start`, `server:stop`, `server:restart`; `npm run restart` and `npm run restart -- stop` still work). Start and restart run `npm install` first. `start` does nothing when the server is already up.
- On Windows the server is created through WMI (`Win32_Process.Create`), with this script's environment (so `DATA_SET` carries over) and no window. Checked on this PC: the server's parent is `cmd.exe` under `WmiPrvSE`, `IsProcessInJob` is false for it (true for the Claude shell that ran the script), and the site answered 200 after restart, stop and start.

### 2026-10-28: The page reloaded itself forever after a restart
- Cause: `fileUrl` (pictures that need the login) ran the page-version check, but those pictures are cached for a year (`private, max-age=31536000, immutable`) along with the `X-Page-Version` they first came with. After a restart with changed page files, every cached picture looked like "the server was updated", so the page reloaded, loaded the cached picture again, and so on. `fileUrl` no longer checks; `api()` and the live streams still do.
- Cloudflare sends `Cache-Control: max-age=14400` on the page's .js files although the server says `no-cache` (its Browser Cache TTL setting), so a browser can keep an old `api.js` for up to 4 hours. The owner can set Caching > Browser Cache TTL to "Respect Existing Headers".

### 2026-10-28: Campaign separation checked
- The owner asked how several campaigns are kept from crossing over. Audited every route and store: every campaign route goes through `access()` (membership of that campaign, or the admin), every lookup by id also checks `campaign_id` (knowledge base, sessions, notes, conversations, maps, map links, wiki pages, boards, pictures, creatures, items, merchants, handouts, stamps, assets, map-creator drafts), the search index and its vector cache are per campaign, the AI tools are built for one campaign, AI runs have no file tools and keep no session, live streams drop other campaigns' events, and the archive is a folder per campaign. Shared on purpose: the rulebooks, the built-in map art and the embedding model.
- One gap fixed: `PUT /campaigns/:cid/speakers` took any account id, so the DM could link a transcript name to someone from another campaign, who would then be in this campaign's attendance and `known_by` (they still couldn't open it, but would see those records if added later). It now refuses accounts not in the campaign, like the upload's links already did. Regression test in `server/test/api.test.js`.

### 2026-10-28: The VS Code checks, first pass in Chrome

- Ran the checks list in Chrome with `scripts/browser.js` on a copy of the example data (fake AI, port 4401; the live server untouched): every tab and wiki view as the DM (test-rowan) and a player (test-jules) at PC and phone widths, a dark theme, the wiki's space (Back, reload, the trail and clock, The table), the Atlas (wheel zoom into Saltreach's harbour map and back out, the Map tab after), Who knows, Tidy up and a transcript upload.
- Fixed: a Who knows cell for a page the player can't see crashed the side panel; the DM's top bar put a long campaign name under the tabs (now cut short with a tooltip, the bar is wider and the DM's tools go to icons below 1440 px); on a phone the Atlas's map was a short strip, ☰ covered the wiki rail's last button, and the Sessions table pushed the page past the screen's edge; a player's empty Atlas told them to import a map; transcript speakers were only guessed when they contained an account's name ("Rowan" now finds test-rowan). Each has a regression test.
- Taken off the list (done): the wiki's space, the example data (but the live server is on the example data until `DATA_SET=example` comes out of `.env`). Narrowed to what's left: transcript progress, the Atlas's two-finger zoom, Who knows' reveal and handout warning, Tidy up's buttons on a phone, Tidier pages' other parts. The rest of the list (the real AI, a real phone, Foundry, Obsidian, the books) is still there.
- Seen but left: after zooming out in the Atlas, the table's Map tab keeps that zoom (press Fit); labels on the region map overlap a little where places are close (Mother Sallow's stilt-house and The Sallowmere).

### 2026-10-29: The top bar keeps to one row in every theme
- The owner's feedback (2026-10-28, item 1): "Some themes mess with the layout", with a screenshot of 8-bit Quest: the DM's bar on two rows, the ⚙ account button under the campaign's name. Swept every theme × layout × 1024–1920 px in headless Chromium on the example data: Dungeon Crawl, Nine Hells, Synthwave and 8-bit (spaced capital tabs) ran onto two or three rows even at 1600–1920 px, and the sidebar layout did it in every theme. The tools only dropped their names below fixed window widths (1180/1440 px), which those themes outgrow.
- **Fix** (`web/public/page/topbar-fit.js`, style.css): the page tries the bar and steps down while it would wrap: tool icons only, then tighter tabs, then the tabs on two lines in their own box. The campaign's name keeps 8rem first. Refits on resize, theme change and font load; left alone on a phone and with the app layout. After: no wraps in any theme, layout or width swept, no console errors, phone unchanged. SPEC §3.3.
- Regression test in `web/test/layout.test.js`; the PC's Chrome check is on the VS Code list.
### 2026-10-28: Sessions follows the campaign the DM is in
- The owner: "In 'Sessions', the DM can choose a campaign. This actually doesn't make sense because the DM chooses one at login. Speaking of, how do they change the campaign they are viewing?"
- The Sessions tab's Campaign picker is gone: the tab is for the campaign the DM is in, and says so ("For …"). `loadSessions` takes `{ campaign, guarded }`.
- Switch campaign, which was only a small link beside the campaign's name, is now also in the ⚙ account menu (on a phone, the ☰ sheet). It still shows only to someone in two or more campaigns; with one campaign there's nothing to switch to.
- Tests: `web/test/sessions.test.js` (the tab has no picker and follows Switch campaign from the ⚙ menu; one campaign, no Switch campaign anywhere).

### 2026-10-28: Sheet's background panel fixed
- Feedback: "What Outlander gives" was squeezed to a letter a line, and "Apply Outlander to the sheet" never went away. The panel (and the "applied" notice) lived inside the Background cell of the six-column info grid, inside its `<label>`. `backgroundBox` (`sheet/background.js`) now returns `{ box, more }`: the input stays in its cell, and what it gives goes full width under the grid. The Apply button only shows while applying would still change something (`applyBackground(...).changes`). Regression test in `web/test/backgrounds.test.js`.

### 2026-10-28: Ask picks a faster model when the records already have the answer
- The owner: "could we quickly decide if it's stored in the data we have, or needs looking up, then assign a fast model if we have it, or more intelligent model if we don't? Would this be faster and/or save tokens?"
- `qa/route.js` `pickModel` (no AI, after the automatic search): the quick way, and full-way questions naming a record or wiki page the search put in front of the model, run on `MODEL_QA_FAST` (default `claude-sonnet-5-5`; `off` for `MODEL_QA` everywhere); the rest and `mode: 'thorough'` stay on `MODEL_QA`. `preSearch` now returns `{ text, found }` (titles shown). Agents take a `model` (both providers).
- The page: **Look it up properly** also under a faster model's full-way answers ("Quick answer from the records"); `done` carries `fast`. The log line has `model` and `model_why`.
- Not timed with the real AI. SPEC v0.99 (§5.3), docs/notes/ask-speed.md, `.env.example`.
- Tests: server `ask-models.test.js` (which model, the model passed, thorough and off go to the main one); web `app.test.js` (the button under a fast answer from the records).

### 2026-10-28: Level up
- The owner's feedback (2026-10-28): "We want a 'level up' feature if not already. Triggered by the DM, or the player, depending on what the DM choose." There was none (only Review sheet's "Time to level up?").
- `shared/src/level-up.js`: choices (each class's next level, new classes with the PHB multiclass 13s as a warning, subclass levels by edition, ASI levels with fighters' and rogues' extras), `levelUp` (the level, a subclass, ASI or a feat written as "Feat: …", hit points up by what the maximum goes up by, a typed maximum too, logged in `level_log`), `levelUpChanges` (the preview). Rolled hit points count instead of the average in `computeSheet` while the class keeps that level. `MULTICLASS` moved here from the sheet review.
- Server `routes/level-up.js`: `POST /sheet/level-up` (rolls through the roll log, refuses before rolling), `GET /levels` and `POST /levels/grant` for the DM. New setting `level_up` (player | dm). `levels_granted` on the sheet changes only through these routes (`sheets.save(…, { levels: true })`).
- Page: `sheet/level-up.js` (the button and note under the name, the dialog), `campaign/levels.js` (Levelling up in Campaign settings).
- Tests: `shared/test/level-up.test.js`, `server/test/level-up.test.js`, `web/test/level-up.test.js`.

### 2026-10-29: A shorter character sheet
- The owner (feedback, 2026-10-28): "compact the character sheet a bit. It's getting a bit long. Can some things show their options when prompted rather than all the time?"
- New `web/public/sheet/fold.js`: a fold (a `<details>`) that remembers being opened while the page is open, so the sheet redrawing after a tick or a save doesn't close it.
- Folded: the Wild Shape forms with Add form (**Turn into a form (4)**; starts open with no forms), adding a companion (the explanation went inside), adding a spell (starts open with no spells; Fill in missing details and the messages stay in view), and spell levels with no slots (**Show all levels (7 with no slots)**; a sheet with no slots at all shows only that link). A class feature's text is one line until its name or the line is clicked (the worked-out numbers, like Sneak Attack's dice or the ki save DC, come first in the line). Printing shows the feature texts in full.
- Checked in Chrome on the example data (Wren, the druid): the sheet went from 4,533 to 3,615 px tall at 1600 px wide and from 8,001 to 6,980 px at 420 px; folds stay open after ticking a Wild Shape use. Test: `sheet: options open when asked…` in `web/test/sheet.test.js`; three spell tests now read the messages from `.add-spell-wrap`.

### 2026-10-28: The Bestiary, with people apart from creatures

- The owner's feedback (item 2): "separate 'people' from 'creatures', and have some sort of bestiary". The DM's Creatures tab is now the **Bestiary** (the tab id and API stay `creatures`), with a **Bestiary | People** switch. The bestiary groups kinds of creature under their 5e type (the DM's own word, else read from the stat block's size line), weakest challenge first, with chips to show one type; People lists one NPC each with a role. Friendly or hostile is still `kind`, apart from the new `group` (`creature` | `person`), so villains are hostile people. Old friendly creatures count as people, the rest as creatures (`shared/src/bestiary.js`); Edit's "Goes in" moves one. Cards open the matching wiki page in the drawer. Find online from People files the find there. Ask lists each as "person, friendly" / "creature (undead), hostile" (`PIPELINE_VERSION` 39; SPEC v1.02). The example campaign's NPCs have their groups and roles.
- Checked in a real browser (Chromium, the example data, fake AI): PC in the default and Neon themes and a phone; on the phone the switch sits under the search row. No console errors.
- Not done (a follow-up if wanted): a players' bestiary of what their characters have learned about creatures they met.

### 2026-10-28: Items and Merchants move from the table's tabs into the wiki

The owner's feedback: "I also don't think we need dedicated tabs in the table for stuff that's in the wiki anymore". The wiki already shows the DM's items and merchants (live embeds, `[[item:…]]`, `[[merchant:…]]`), so their tabs left the top bar and became views on the wiki space's rail, **Items** and **Merchants** (DM only). `wiki/panels.js` moves the existing `#tab-items` / `#tab-merchants` into `#wiki-main` (as the Atlas moves the map, no copy) and back on leaving, so every feature stays; Put on the map still switches to the Map tab. They no longer go beside the map or pop out; Look drops them from saved tab orders. Creatures was left alone (the bestiary thread is reworking it), and Handouts stays a tab (players get theirs there during play, with the unread badge and beside the map). Tests: `merchants.test.js` checks the tabs are gone, the views open from the rail and put the page back, and a player never gets them; the other item and merchant tests open them through the rail (`openWikiView` in `test/helpers.js`). No schema or `PIPELINE_VERSION` change.

## Newest entries at the time (2026-10-28 to 2026-10-30)

### 2026-10-30: Pick who to log in as on the example data

The owner: on the example data, pick who to log in as from a dropdown, no password. With `DATA_SET=example` the login page shows a "Log in as" list of every unblocked account (with what they play: "test-mags (Wren)", "test-rowan (DM)") in place of the name and password (`page/pick-login.js`; server `GET/POST /login/pick` in `routes/accounts.js`, `auth.pickableAccounts` / `auth.loginWithoutPassword`). On the real data the list is empty and `POST /login/pick` is a 404, so the normal login is unchanged. Tests written (server `security.test.js`, web `app.test.js`) but **not run**: the owner said to skip them (low on credits). Run them next VS Code session.

### 2026-10-29: The code tidied into feature folders

The owner: "Codebase is also super messy. Let's tidy it up! For example, we have just a whole bunch of files shoved into the web folder. Let's organize this a bit, make it clear what stuff does and keep functions where they belong." No behaviour changes; done in stages, each merged once its tests passed (PRs #147, #148, #149 and this one).
- **The web page** (`packages/web/public`): its 95 loose files are in folders by part: `page/` (the frame: app, api, dom, look, phone, side panel…), `styles/`, `admin/`, `campaign/`, `sheet/`, `items/`, `creatures/`, `dice/`, `map/` (+ `map/creator/`) and `wiki/` (+ `wiki/views/`). The folder replaces the old prefix (`map-combat.js` is `map/combat.js`), and some names now say what the file does (`sheet-place.js` → `page/side-panel.js`, `map-dm.js` → `map/dm-tools.js`, `map-templates.js` → `map/spell-templates.js`, `gear-card.js` → `items/item-card.js`, `sheet-help.js` → `sheet/creation-help.js`, `wiki-sheet.js` → `wiki/character-sheet.js`). The page imports shared modules by their address (`/shared/map.js`). SPEC §3.1 lists every folder.
- **Functions where they belong:** the element helpers (`h`, `setChildren`, `note`, `readBase64`) left `page/api.js` (which is about the server) for a new `page/dom.js`, with `$`, `cap` and `svg`, which 43, 5 and 3 files had each defined for themselves. The wiki's `truthOn` is in `wiki/data.js` once.
- **The server** (`packages/server/src`): the 26 loose files moved to `wiki/` (`wiki.js` is `wiki/store.js`), `creatures/`, `items/` (with merchants), `table/` (rolls, handouts), `maps/` (the creator's assets and stamps), `sheets/` (rests, editions, character pictures), `kb/` (search, embeddings) and `llm/` (fit). The top level is the core (app, index, config, context, archive, store, auth, jobs, images, library).
- **Left as they are:** `packages/shared/src` stays one folder: the page loads those files from `/shared/<file>`, so a module's imports of its neighbours have to work at that one address (folders there would need the server to serve the tree and every page import to change). The test folders stay flat (one test file per feature, named after it).
- Docs: SPEC §3.1 rewritten, file paths in SPEC and this file updated. Not live until the server is pulled and restarted.

### 2026-10-29: A short README

The owner: "I think the read me is getting a little long. Let's compact it. The AI has the handoff and spec. So the readme should be fit for a human to digest." README.md is now a one-screen overview: what the app is, the main features, how to run it, handy commands, where to read more, licences. Nothing was dropped; the rest moved, word for word, into `docs/`: `hosting.md` (setup, the Claude Code lockdown, the public address, letting players in safely, Discord recording, data, rebuilding, transcript format), `features.md` (the admin screen and each tab, as the users see them), `api.md` (the API table and `/ask` events) and `testing.md` (tests, page tests, regression tests). References in AGENTS.md, SPEC, HANDOFF's current state and the regression-keeper worker point to the new files; older change-log entries still say "README" as history. **New API routes go in `docs/api.md`.** Docs only.

### 2026-10-29: Recording sessions from Discord
- The owner (2026-10-29): "Research the possibility of me having an integrated bot that joins discord calls and transcribes audio… Want something free"; after the research (project files `research/discord-transcription/`): "we still want to be able to upload transcripts. And these could come from anything… What we add is an integration with discord. If that's do-able, then get started"; "We won't take it off server, so no groq or such".
- **The bot** (`src/recording/discord-bot.js`, started by `index.js` only when `DISCORD_BOT_TOKEN` is set): discord.js 14.27 and `@discordjs/voice` 0.19.2 (which decrypts Discord's end-to-end encrypted calls with `@snazzah/davey`; 0.19.0 and 0.19.1 couldn't hear). Joins on the Sessions tab's Start or `/record`; `/stop`; `/norecord`; nickname 🔴 Recording; stops by itself when the channel's empty 5 minutes, after 8 hours or on disconnect; a server shutdown keeps what was said.
- **Recordings** (`src/recording/recordings.js`, `data/recordings/`): each burst of a person's speech an Ogg Opus clip (`ogg.js`, written here: prism-media 1.3 has no Ogg writer) with its start time; transcribed one at a time after it stops (`transcribe.js`, `engines.js`: `local` transformers.js Whisper large-v3-turbo by default, or `whisper-cpp`; decoded with opusscript, no native build). Names prompt from characters and glossary; known Whisper inventions dropped. Restarts pick up where they left off.
- **Sessions tab** (`sessions.js`, `routes/recordings.js`): Record from Discord (invite link, server and voice channel, Start/Stop, recordings with progress, Use for upload, Retry, Delete). Campaign settings gained `discord: { guild_id, channel_id }` (`normalizeDiscordSettings`).
- **Tests:** `server/test/recording.test.js` (12, with a fake Discord in `server/test/fake-discord.js` and the fake speech-to-text engine), `web/test/recording.test.js` (2). The real model and a real call are on the VS Code list.
- Installing in the cloud container needs `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` (onnxruntime-node's install script fetches CUDA files from a blocked host); not needed on the owner's PC.

### 2026-10-29: The DM places their own attacks, spells and effects; NPCs cast their stat block's spells
- The owner (2026-10-29): "What we want is also for the DM to be able to place attacks, spells, and whatever else on the map. In case something bugs out or something custom needs doing. Also, make sure, if not already, the DM can cast spells and attacks and such from NPC's unto player or other NPC's, for combat and such."
- **What was there:** the DM could already attack from any NPC or enemy token at players or other NPCs with the stat block's attacks and save actions. Missing: the spells in a stat block's Spellcasting trait (a mage couldn't cast Fireball), and anything the app can't read.
- **NPC spells** (`shared/src/attacks.js`): `creatureSpellList` reads Spellcasting / Innate Spellcasting (2014 slots and 2024 "2/Day Each", "level 4 version", one-paragraph traits); `creatureSpells` makes each spell an action with the creature's DC and attack bonus. `sheetActions`' spell code moved into `spellAction`, shared by both. The server looks the spells up (`spells.lookup`: SRD, books, AI; names not found remembered until restart). The picker shows each spell's uses; no slot tick box for creatures.
- **The DM's own** (`customAction`, `customDamage`; `CUSTOM` in `routes/attacks.js`): `POST …/attack { custom }` with any token or none; attacks may take several targets; conditions on a hit (attacks), a failed save, or straight away; lasting ones go in Spells in play with no caster when nobody did it (`custom` kept on the spell for Roll for who's in it, stripped for players). Privacy: a nobody's card and spell show their name to players only when a target is one they see.
- **Page** (`map/attacks.js`, `index.html`, `map.js`, `style.css`): **Effect** on the map bar (DM, while Attacks from the map is on) and **Something else…** in the picker open `customForm` (remembers the last one); then tap who (Do it) or place its area.
- **Tests:** `server/test/attacks.test.js` (3: an NPC's Fireball and Hold Person (a regression), a trap from nobody with an area, a custom attack from an NPC and a heal from nobody), `shared/test/attacks.test.js` (2), a page test in `web/test/map-attacks.test.js`.
- Not built: counting a creature's slots or uses a day; saving custom effects to reuse (the form remembers the last one per page).

### 2026-10-29: Spells that aren't attacks, on the map (Entangle, Hold Person, Bless)
- The owner's feedback (2026-10-28): "I saw no way to cast spells such as 'Entangle', that aren't an attack. Speaking of, how do such spells interact with the map? If they don't, then they should. Look at how other softwares do this." Research: `docs/notes/map-spells-research.md` (Foundry with Midi-QOL, DAE and regions; Fantasy Grounds' effects; Roll20; D&D Beyond Maps; Owlbear). What we took: cast any spell, conditions from a failed save on the tokens, the area stays and changes the ground, concentration ties the area, the conditions and the caster together, durations count in a fight.
- **Rules** (`shared/src/spell-effects.js`, new): `spellConditions`, `spellLasting`, `makesDifficult`, `spellTargets`; spells in play on a map: `endMapSpell`, `endConcentration`, `expireMapSpells`, `mapSpellsFor` (privacy). `shared/src/attacks.js`: every spell is an action (`effect` when nothing rolls), with `conditions`, `lasting`, `difficult`, `targets_max`, `self`, `check`; failed saves (and effects) carry their conditions; `rollToEnd` (save again or a Strength check to break free); `mods` in defenses. `shared/src/map.js`: "20-foot square" is an area (a cube), templates keep `spell` and `difficult`, `isDifficult` counts a difficult spell area, `normalizeMapSpells` (`spells` on the map).
- **Server** (`routes/attacks.js`): `POST …/attack` takes `targets` (several, up to what the spell takes for players) or none for an effect; conditions go on the tokens; a lasting spell is put in play (template marked, caster Concentrating, the caster's earlier concentration spell ended, `ends` in a fight); a failed concentration save ends the spell; Undo ends it. `POST …/spells/:sid` `{ do: end | again | break }`. `routes/combat.js`: spells run out on next turn; removing a spell's template ends it. `routes/maps.js`: taking Concentrating off a token ends its spell. `maps/store.js`: players get `spells` filtered. No prompt or schema change, so `PIPELINE_VERSION` stays.
- **Page** (`map/attacks.js`, `map/spell-templates.js`, `map.js`): the picker lists every spell with what it does; tap several then **Cast** (with **On yourself**, and **Cast on nobody** for an effect); cards show conditions, how long it lasts and what ended; **Spells in play** at the top of the Attack log and on a spell area's bar (End spell, Roll for who's in it, Break free / Save again); "Under Entangle (restrained)" on a token's bar.
- **Tests:** `shared/test/spell-effects.test.js` (5, one a regression), `server/test/spells.test.js` (2), a page test in `web/test/map-attacks.test.js`.
- Not built: buffs changing numbers by themselves (Bless's d4, Shield's +5), auras that follow the caster, rolling on entering an area, durations outside a fight.

### 2026-10-28: Casting a spell from the sheet spends a spell slot
- The owner's feedback: "Using a spell does not burn a spell slot at the moment." Casting on the map already did; the sheet's spell rolls didn't.
- `shared/src/spell-slots.js` (new, served to the page): `slotsLeft`, `spendSlot`, `refundSlot` moved out of `attacks.js` (which re-exports them), plus `castLevels` (the levels a spell can use, with what's left, pact included) and `castWithSlot` (spend one or say why not). One place for slot rules: the map, the sheet, and non-attack spells (Entangle) when they come.
- `POST /campaigns/:cid/sheet/spells/cast` `{ id, slot? }` (players): spends the slot and saves the sheet with the reason ("cast Shield (1st-level slot)").
- The sheet: every spell of 1st level or higher has a slot list ("1st (2 left)") and spends the slot on its to-hit roll (spell attacks), its damage/heal roll (anything else) or a new **Cast** button (nothing to roll: Shield, Entangle). None left: asks whether to roll anyway (scroll, item, free cast). Cantrips unchanged.
- Map: with no slot level picked, it now uses the lowest level with a slot left (a warlock's 1st-level spell takes the pact slot instead of failing).
- Not handled: casting a ritual without a slot (untick a slot box after, or say no to the question when out of slots).

