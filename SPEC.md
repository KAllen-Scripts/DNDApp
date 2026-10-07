# DNDApp — Project Spec

> Status: v0.10 (2026-10-07). 3D dice rolled by the server (§6.5). v0.9 (2026-10-06): character sheets (§6.4), with five layouts.
> Previously v0.8 (2026-10-04). Server built and tested end to end with real AI calls, including the archivist and privacy. Web page served by the server: name + password logins (with admin-forced password changes), multiple campaigns, a player view (ask, notes) and an admin screen (accounts, campaigns, roles, session uploads with speaker linking). No DM screens yet.
> This is the source of truth for scope and design. Update it when decisions change. For the history of changes and where work left off, see [HANDOFF.md](HANDOFF.md).

## 1. Overview

DNDApp is a campaign-memory tool for a D&D group.

1. During a session (played over Discord), players use the **web page** (served by the DNDApp server) to **take private notes**. Each note is sent to the server and archived immediately.
2. The session is recorded, and separate speech-to-text software produces **one timestamped transcript**.
3. The transcript is uploaded **with its session number and the date it was played**, on the admin screen (or through the API by an account with the `dm` role). The date is what ties it to the notes players took that day. The server archives it permanently. Then an AI **archivist** reads the transcript plus that date's player notes and updates the campaign's **knowledge base**. The archivist has full authority over the knowledge base and organises it however it judges best, including **who knows what**.
4. Each player keeps their **character sheet** on the web page (§6.4).
5. Players use the web page to **ask questions** ("How much do we still owe Brother Hal?"). Answers cite the session and timestamp, and only use what that player's character should know.

The app's two core functions are **asking questions** and **taking notes during the session**. A basic UI for both exists (§3.3); it will be refined with real use.

This is a personal project for a small group of friends. It is not sold and players don't pay for it.

**People and roles:**
- **Host / project owner (Kenny):** runs the server on his machine and owns the admin login (management only). He is **not** the DM. He plays through a separate, ordinary player account.
- **Admin login:** for managing the server (accounts, campaigns, roles, session uploads). It isn't in any campaign, so it can't ask questions or take notes. It passes DM checks in the API (that's how it uploads).
- **DM:** a separate person, with role `dm` in a campaign (set on the admin screen). The DM's role and permissions will be designed later; for now the `dm` role has the permissions described in this spec. The DM can't manage accounts.
- **Players:** role `player`. One account can be in several campaigns, with a different role and character in each.

Hard design problems:

- **Scale over time.** By session 200 the transcripts won't fit in any context window. Answers come from an AI-maintained knowledge base plus targeted search, never the whole history (§5).
- **Being able to start over.** Everything except the archive can be thrown away and regenerated from it (§4.3).
- **Who knows what.** Players miss sessions, get whispered secrets, and keep private notes. Q&A must not leak (§5.5), and campaigns must not mix (§5.4).

## 2. Constraints

- **All JavaScript.** Node.js for the server; a plain web page (HTML/CSS/JS, no build step) for players. Plain JS (ES modules), with JSDoc types where useful. npm packages are welcome.
- **Self-hosted.** The server runs on the host's own machine (Kenny's). No cloud backend of our own.
- **Thin client.** The web page only talks to the DNDApp server. It sends what players type (questions, notes, sheet edits) and displays results. It never processes, indexes or stores campaign data (only the login token, in the browser), and never calls the AI. One deliberate exception: the character sheet's rules (`packages/shared/src/sheet.js`, plain arithmetic) also run in the page so automatic values update while typing; the server runs the same file and stays the authority on what's saved.
- **Archive first.** Transcripts, player notes, DM corrections and accounts are archived as plain files and never modified. Everything else is derived and can be regenerated.
- **The AI owns the knowledge base.** No human reads it directly, so it doesn't need to be human-friendly. The archivist can create, restructure, merge and delete freely.
- **Claude via the host's Claude Code.** By default all AI work runs through Claude Code on the host (Claude Agent SDK), using the host's Claude subscription. The Anthropic API is a config switch away (§3.5).
- **Recording and transcription are out of scope.** DNDApp starts from a finished transcript file.

## 3. Architecture

```
 During the session:  web page ── POST /notes ──►  archive + private search index
 After the session:   transcript + date ── upload ──►  archive
                                                         │
                                       job queue ── archivist agent (full write access)
                                                         │   reads: transcript, that date's notes,
                                                         │          roster, attendance, its guide
                                                         ▼
                                                   knowledge base (records with known_by)
                                                         │
 Any time:            web page ── POST /ask ──►  Q&A agent (read-only, filtered to the asker)
```

### 3.1 Repo layout (npm workspaces)

```
DNDApp/
  packages/
    shared/    transcript parser, citation format, sheet.js (character sheet rules; served to the page at /shared/sheet.js)
    server/
      src/
        app.js            HTTP routes
        context.js        wires everything together
        config.js         all settings (env vars), PIPELINE_VERSION
        archive.js        archive files
        store.js          source data (archive first, then DB mirror): campaigns (create/delete), sessions, notes, corrections, restore
        auth.js           accounts, passwords, logins, must-change-password, memberships (accounts archived)
        jobs.js           background queue: ingest, correct, rebuild
        search.js         hybrid keyword + vector search with per-viewer visibility
        embeddings.js     local embedding model
        db/               schema.sql + migrations
        llm/              providers: claude-code.js, api.js, common.js
        kb/               store.js (knowledge-base records, journal), archivist.js (agent + tools)
        pipeline/         prepare.js (speakers, glossary, chunking), ingest.js (attendance, indexing, archivist run)
        qa/               agent.js, tools.js
        sheets/           store.js (sheets, archived as diffs), import.js (uploaded sheets), spells.js (lookup),
                          books.js + pdf.js (reading the books folder), srd-spells.json (SRD 5.1 spells)
        cli/              admin.js (init, set-password, list), rebuild.js
      test/               offline tests (fake AI); fixtures/privacy-scenario/ = manual real-AI scenario
    web/public/  the web page, served by the server at / (no build step):
                 index.html, app.js (login, password, campaign picker, Ask, Notes), sheet.js (Sheet tab), admin.js (admin screen),
                 admin-sessions.js (sessions + upload on each campaign card), api.js (requests, SSE, element helper),
                 style.css, icon.svg
  SPEC.md  HANDOFF.md  README.md  AGENTS.md  CLAUDE.md
```

### 3.2 Server

- Node.js (22+; developed on 24) with **Fastify**.
- **SQLite** (`better-sqlite3`), one file. FTS5 for keyword search; vectors as blobs, searched by brute force in memory.
- One background job at a time, in order (the archivist builds each session on the last). Interrupted jobs resume after a restart.

### 3.3 Web page

Electron was dropped (owner's call: overkill, since there's a server and an address anyway). Players open the server's address in a browser.

- Static files in `packages/web/public`, served by the server at `/` (each file gets its own public route; everything else needs a login). Same origin as the API, so no CORS, and all API calls use relative paths: the page works at any address.
- **Login:** name + password set by the admin (§7). The token is kept in the browser's localStorage; a 401 sends the player back to the login screen.
- **Passwords:** if the admin requires it, a "Choose a new password" screen comes straight after login and can't be skipped (the server enforces it too). "Change password" in the header lets anyone change theirs at any time.
- **Campaign choice:** after logging in, someone in several campaigns picks one from a dropdown (last choice pre-selected); in one campaign, they go straight in. The choice holds for that browser tab (survives reloads; a new visit asks again). "Switch campaign" in the header goes back to the picker. Ask, Notes and past conversations all belong to the chosen campaign.
- **Admin screen** (admin login only, instead of Ask/Notes): accounts (add with the campaigns they can access, "Edit campaigns" to change that later, set password, require a new password at next login, log out everywhere, block/unblock, delete if unused), campaigns (each a colour-coded card; create with a unique name, delete with typed-name confirmation; add people as player or DM, change roles and characters, remove). Messages appear as a toast that's always on screen.
- **Sessions** (on each campaign card, admin): past uploads (number, date, title, matched player notes, attendance, status with progress; refreshed every few seconds while processing; Retry/Process when failed or unprocessed) and **dates with player notes but no transcript**. Upload form: session number (default next), date played (default the newest date with waiting notes, else today's note date), optional title, transcript file or pasted text. Choosing a transcript calls the preview, which lists each speaker name with an account dropdown (current link, or a guess from account/character names). On upload, links are validated before anything is archived, and merged into the speaker map before processing is queued, so attendance uses them. Warns about an existing number, a date another session already has, and unlinked names. The admin login is for management only and isn't in any campaign; an admin who plays uses a separate, ordinary player account (§5.5 applies to it like anyone else).
- **Player view:** ask questions (streamed answers, a status line while it searches, clickable citations that jump to the quoted transcript lines, follow-ups); **chats**: a list (drawer, or a sidebar in wide layouts) with Pinned and Recent sections and a filter; pin, rename or delete any chat. Deleting erases its questions and answers for good, but the bare `qa_log` rows stay so the hourly limit and usage figures still count them. Take notes (saved to today's session, listed by session date); character sheet (§6.4). Works on phones.
- **Look** (per browser, saved in localStorage, applied before first paint by `look-boot.js`): 12 themes (colours, system fonts, background art; Tavern follows the device's light/dark), 4 layouts (classic, sidebar, full width, app with bottom tabs), 3 text sizes, 4 chat styles (bubbles, play script, letters, terminal), 6 sheet styles (match theme, official, grimoire, index cards, blueprint, terminal) and 5 sheet layouts (three columns, combat first, by ability like the 2024 sheet, tabs like the sheet apps, one column). All in `themes.css`, keyed by `data-*` attributes; previews in the dialog reuse the same CSS. Only system fonts, nothing loaded from outside. Printing is always black on white.
- **Dice** (§6.5): a Dice button in the player header opens the dice tray; rolls from the sheet; 3D dice over the page; results and this session's history.
- **Not built yet: DM / host features** (split between DM and host to be decided with the DM role): glossary; corrections; answer the archivist's questions; a full speaker-map editor (links are currently set while uploading). Transcript upload is on the admin screen.
- On each `turn` event from `/ask`, replace displayed text rather than appending.

### 3.4 Networking

**Decision: Cloudflare Tunnel** with a cheap domain (e.g. a numbers-only `.xyz`, ~$1/year), using Cloudflare's free plan. `cloudflared` on the host connects out to Cloudflare: no port forwarding, no static IP, home IP hidden. The server listens only on `127.0.0.1`. Every request except `/health`, `/login` and the web page's files needs a login. **`PUBLIC_URL`** (config/`.env`) is the single place the public address is set; it's a placeholder until the domain is bought. HTTPS JSON plus SSE for job progress and streamed answers.

Rejected: Tailscale (each player installs it), port forwarding (CGNAT, exposes home IP), SSH (would give players host access).

### 3.5 AI providers and models

All AI calls go through `src/llm/` (operations: `structured`, `text`, `agent`). Two providers, chosen with `LLM_PROVIDER`:

| Provider | How | Notes |
|---|---|---|
| `claude-code` (default) | Claude Agent SDK runs Claude Code locally on the host's subscription | Shares the host's Claude Code limits. `ANTHROPIC_API_KEY` is removed from its environment. |
| `api` | Anthropic SDK, per-token billing | Refusal fallback, prompt caching, monthly spending cap. |

**Claude Code lockdown** (every run): no built-in tools (files, shell, web); no user/project settings, hooks, CLAUDE.md, skills or plugins; no MCP servers or claude.ai connectors; `permissionMode: 'dontAsk'`; no saved sessions. The only tools are the server's own, as an in-process MCP server.

| Task | Model | Effort | Tool-call cap |
|---|---|---|---|
| Archivist | Claude Opus 5.5 | high | 250 per run |
| Q&A | Claude Opus 5.5 | medium | 12 per question |
| Sheet upload (`import`) | Claude Opus 5.5 | medium | none (one structured call, file attached) |
| Spell from a book or memory (`spells`) | Claude Opus 5.5 | low | none (one structured call) |

`structured()` takes optional attachments (images, PDFs); the Claude Code provider sends them as a streamed user message.

Decisions: the **Q&A model stays Opus**. Processing time doesn't matter, so the archivist runs at high effort with generous limits.

## 4. Data

### 4.1 Inputs

**Transcript**: one plain-text file per session, uploaded with a session number and the date played (`YYYY-MM-DD`):

```
[HH:MM:SS] Speaker Name: what they said
```

Also accepted: `[MM:SS]`, fractional seconds, no brackets, `0:01:30 - Name: text`. Lines without a timestamp join the previous one. If the real recorder's format differs, add an adapter in `packages/shared/src/transcript.js`. **No real sample has been tested yet.**

**Speaker map**: transcript name → display name (`Thorin (Sam)`) **and the account** (`user_id`). Attendance and privacy depend on the account link.

**Glossary**: correct spellings and their speech-to-text misspellings, fixed before anything else sees the text.

**Player notes**: free text, private to the author. Each note has a `session_date`: today by default, and notes written before 06:00 count towards the previous day. A note links to the session uploaded with the same date. Notes are append-only (no editing yet).

**DM corrections**: plain words ("the innkeeper is Brother Hal, not Hall"). Answering one of the archivist's questions creates a correction.

### 4.2 Tables

| Table | Kind | Purpose |
|---|---|---|
| `campaigns`, `users`, `memberships` | source | Campaigns (unique name), accounts (unique name, scrypt password hash, `must_change_password`), role + character per campaign. |
| `speakers`, `glossary` | source | As above. |
| `sessions` | source | Number, date played, checksum, processing status. |
| `player_notes` | source | Private notes with author and session date. |
| `character_sheets` | source | One sheet per player per campaign (JSON), with a version that goes up on each save. Schema v5. |
| `corrections` | source | DM corrections with `after_session` (where to replay them in a rebuild). |
| `attendance` | derived | Who was at each session. |
| `kb_records` | derived | The archivist's knowledge base (§5.1). |
| `kb_journal` | derived | Every knowledge-base change, with the run and reason. |
| `dm_questions` | derived | Questions the archivist left for the DM. |
| `docs` (+ `docs_fts`) | derived | Search index: transcript chunks, knowledge-base records, player notes, each with `visible_to`. |
| `logins` | operational | Logged-in browsers (hashed tokens, last used). Not archived. |
| `jobs`, `llm_usage`, `conversations`, `qa_log` | operational | Queue, AI usage/timing, Q&A history. |

### 4.3 Archive, restore and rebuild

```
data/archive/
  _server/accounts.json                users incl. password hashes (passwords survive DB loss)
  <campaign>/
    campaign.json, members.json
    speakers.json, glossary.json      (+ history/)
    corrections.jsonl                 append-only
    player-notes/<YYYY-MM-DD>.jsonl   append-only
    character-sheets/<user id>.jsonl  append-only: each save's changes (first line = whole sheet)
    character-sheets/uploads/         uploaded sheet files, as uploaded
    sessions/0001/transcript.txt      read-only, sha256 in meta.json
    outputs/v<PIPELINE_VERSION>/<timestamp>-<run>/report.json, journal.json, knowledge_base.json, questions.json
    deleted.json                      only if the admin deleted the campaign (restore skips it; nothing else is touched)
```

- **Deleting a campaign** removes it and everything derived or mirrored from it from the database (foreign-key cascades), but never touches the archive: the folder gets `deleted.json` and restore skips it. New campaigns never reuse an existing archive folder's slug. Undo by hand: remove the marker, restart, rebuild.
- A transcript can never be replaced (different bytes for an existing session number → 409).
- **Restore:** on start-up, accounts, campaigns, members, sessions, speakers, glossary, corrections, notes and character sheets (replayed from their change lines) missing from the database are restored from the archive, and notes are re-indexed. Then run a rebuild to regenerate the knowledge base.
- **Rebuild:** `npm run rebuild -- --campaign <id> --yes` (or `POST /rebuild`) wipes all derived data, re-indexes notes, then replays every session in order, each correction right after the session it was made against. The archivist is non-deterministic, so a rebuild gives an equivalent knowledge base, not an identical one.
- Bump `PIPELINE_VERSION` (now 3) when prompts, tools or the memory design change.

## 5. Knowledge base and Q&A (core design)

### 5.1 Knowledge base records

Each record has: free-form `kind`, `title`, `body` (free text), `data` (free-form JSON), `status`, `tags`, `sources` (citations), `known_by` (NULL = everyone, or a list of user ids), `pinned`, and first/last session. The archivist chooses the kinds and conventions, and records them in a **guide** (a reserved record) that it reads at the start of every run and that Q&A sees too.

Limits: 4,000 tokens per record; pinned records share a 6,000-token budget, since they go into every question. Violations come back to the archivist as errors it can fix.

In the first real run, it created kinds `summary`, `session`, `pc`, `npc`, `faction`, `place`, `item`, `debt`, `quest`, `clue`, with statuses such as `owed / partially paid / paid` for debts.

### 5.2 The archivist (processing)

Per session (job `ingest`):

1. Parse, apply speaker map and glossary.
2. **Attendance**: accounts linked to transcript speakers who spoke, plus anyone who took notes that day, plus DMs. If no speaker is linked to an account, everyone is assumed present (and the archivist is told so).
3. Chunk and index the transcript. Chunks are visible only to attendees.
4. **Archivist run** (agent). It gets the roster (user ids, names, characters, transcript names), its guide, pinned records, record counts, open DM questions, the session number/date/attendance, that date's player notes (author + time written), and the full transcript (up to 200k tokens; longer ones are read in parts with `read_transcript`).
5. Snapshot the run (report, journal, full knowledge base, questions) to the archive.

Per DM correction (job `correct`): the archivist gets the correction and its state, and applies it.

**Archivist tools** (full write access): `search_kb`, `list_records`, `get_records`, `create_record`, `update_record`, `delete_record`, `update_guide`, `ask_dm`, `search_transcript`, `read_transcript`, `read_player_notes`. Every write needs a reason and is journalled.

**Instructions, in summary:** track everything useful, especially anything with changing state (debts, promises, quests, inventory, status, relationships); update rather than duplicate; merge, restructure and delete freely; cite sources; keep pinned records short; DM narration and corrections are authoritative; player notes are perspective, not fact; ask the DM about conflicts it can't resolve rather than guess.

### 5.3 Q&A

1. **Pre-search** (free): the server searches the knowledge base, transcripts and the asker's own notes for the question (~3,000 tokens) and sends the results with it.
2. **System prompt**: rules, who is asking, the archivist's guide, and pinned records the asker may see. The model first decides whether the question is **general D&D knowledge** (rules, spells, a standard creature's stat block) or **about this campaign**. General questions are welcome and answered straight from the model's own 5e knowledge with no tool calls (noting any house rule the pre-search turned up); campaign questions are researched and answered only from the sources.
3. **Tools** (read-only, filtered to the asker): `search_kb`, `list_records`, `get_records`, `list_sessions`, `search_transcript`, `read_transcript`, `search_my_notes`.
4. **Answer** with citations `[S12]`, `[S12 01:23:45]`, `[S12 01:23:45-01:24:10]`. Evidence (the cited transcript lines) is attached server-side, only for sessions the asker attended.
5. Follow-ups include the last 3 Q&As and the last answer's sources.
6. **Formatting:** answers are markdown, optionally with HTML (tables, stat blocks with `class="stat-block"`). The page renders them with `marked` and sanitises with DOMPurify to an allowlist (no links, images, scripts or style attributes), then turns citations into buttons, including inside tables. Both libraries are served from `node_modules` at `/vendor/marked.js` and `/vendor/purify.js`.

Streaming events (`POST /campaigns/:cid/ask`, SSE): `conversation`, `turn`, `tool`, `text`, `done`, `error`.

### 5.4 Campaigns are separate

Every campaign has its own sessions, transcripts, knowledge base (and archivist guide), player notes, speaker map, glossary, corrections, DM questions and conversations. Every query is scoped by `campaign_id`; knowledge-base records are fetched with `id AND campaign_id`, so even a wrong id can't reach another campaign. Q&A only runs for a member of the campaign it was asked in, and the prompt names that campaign and the asker's character in it. A test asks in a second campaign with every tool and checks nothing from the first appears.

### 5.5 Privacy (primitive version)

Who-knows-what is decided by the archivist and enforced by the server:

| Data | Who can see it |
|---|---|
| Knowledge-base record | Its `known_by` (NULL = every member). DMs see all. |
| Transcript (search, read, evidence, `/transcript` endpoint) | Attendees of that session. DMs see all. |
| Player note (search, list) | **Only its author**, not even the DM. |
| Character sheet | **Only its player.** Not the DM (deferred with the DM role), not Q&A, not the archivist. The admin login has none. |
| Archivist | Sees everything, including all notes; decides `known_by`. |

The archivist's rules: openly happened → attendees (everyone if all attended); only in a player's note → that player; whispered/secret perception → that player; absent players don't know unless told later (then widen); mixed records get split; when in doubt, restrict.

**Deferred:** the archivist currently includes the DM in `known_by` for records built from a player's private note, so the DM can learn note contents through Q&A or the debug view. The DM role is being designed later (owner's instruction: leave it for now). More privacy work is planned.

### 5.6 Performance

- Q&A latency matters; processing time doesn't (project owner's decision).
- Measured with the real archivist knowledge base: 5–10s per question, most answered without any tool calls thanks to pinned records and pre-search. First text ~1.5–2s (earlier measurement).
- A real archivist run on a ~3-minute sample took ~70–100s at high effort.
- Not done, by decision: changing the Q&A model, lowering Q&A effort, API fast mode. A warm Claude Code process would save ~0.6s; not adopted.

## 6. Features

### 6.1 Built

- [x] Accounts with name + password (set by the admin), logins, DM/player roles, block/unblock; archived.
- [x] "Must change password at next login" (admin's choice, server-enforced); anyone can change their own password.
- [x] Multiple campaigns: kept separate everywhere; an account can be in several; players choose after logging in.
- [x] Admin screen on the web page: accounts, campaign access, roles; create and delete campaigns (archive kept).
- [x] Basic player web page: log in, choose campaign, ask questions, take notes.
- [x] Session upload on the admin screen: number, date, title, speaker → account links, status/progress, notes matched by date.
- [x] Transcript upload with date; archived; processed in the background with progress; retry.
- [x] Private player notes during the session; archived; searchable by their author immediately.
- [x] Archivist with full authority over the knowledge base, its own guide, journal, and snapshots.
- [x] Attendance and who-knows-what; Q&A and transcripts filtered per player.
- [x] DM corrections in plain words; archivist questions for the DM; answers become corrections.
- [x] Q&A with pre-search, staged tool search, streaming, cited transcript evidence.
- [x] Rebuild and restore from the archive.
- [x] Usage and timing stats.
- [x] Character sheets: automatic values with player overrides, upload, spells with lookup (§6.4).
- [x] Dice: rolled by the server, shown as 3D dice landing on those numbers; click-to-roll from the sheet (§6.5).

### 6.2 Next

- [ ] Real transcript from the recorder.
- [ ] DM features on the web page (glossary, corrections, archivist questions, speaker-map editing).
- [ ] Try the web page with the players on a real session.
- [ ] Cloudflare Tunnel set up on the host.

### 6.3 Later

- Fuller privacy model (DM access to note-derived knowledge; sharing notes; per-character knowledge beyond attendance).
- Edit or delete your own notes (as new archived versions).
- Explicit "session in progress" marker instead of date matching.
- Character sheets: let Q&A read the asker's own sheet ("what's my AC?"); decide whether the DM can see sheets (part of the DM role); more automation (armour and shields for AC, feats such as Tough or Observant, racial ability bonuses, background skills, weapon attack bonuses); restore an earlier sheet version from the page (the archive has every version).

### 6.4 Character sheets

Owner's requirements (2026-10-06): structured like a normal 5e sheet; autofill what can be worked out from the core stats; **anything the player changes by hand must be respected and preserved**; saved between sessions; players can upload an existing sheet; a spells section with full spell details, which can be pulled in by name.

- **Contents** (Sheet tab, `web/public/sheet.js`): page 1 (name, with a one-line summary such as "High Elf · Wizard 5 / Fighter 1 · Level 6"; class & level with multiclass rows, background, race, alignment, player name, XP, character level; ability scores; inspiration, proficiency bonus, saves, skills marked ○/●/◆ for none/proficient/expertise, passive Perception, other proficiencies; AC, initiative, speed, HP, hit dice, death saves; attacks; coins and equipment; personality, ideals, bonds, flaws; features); page 2 (details, appearance, allies, backstory, treasure); page 3 (spellcasting class and ability, save DC, attack bonus, slots per level and Pact Magic, each with a circle to tick per slot used; spells grouped by level with prepared ticks). Download (JSON), upload, print.
- **Layouts:** each part of the sheet is a block built by one function; a layout (chosen under Look, §3.3) arranges the same blocks into rows of columns: three columns (the official 2014 sheet), combat first, by ability (each ability holds its save and skills, like the 2024 sheet), tabs (abilities and vitals across the top, saves and skills, then Actions / Spells / Inventory / Features & traits / Background tabs, like the sheet apps; the open tab is remembered per browser) and one column. Changing layout redraws the sheet; nothing about the saved sheet changes. One set of measurements for every box (control height, number width, list row, tick size), every group is a card with its label underneath (or a heading on top), and every column stretches to the tallest in its row with its last box growing, so the bottoms line up. Widths come from container queries (the sheet's and each column's own width), so the same rules work in every page layout and on phones; printing shows every tab.
- **Rules** (`shared/src/sheet.js`, 2014 PHB): modifiers; proficiency bonus by total level; save proficiencies from the first class; skills (expertise doubles; bard Jack of All Trades from 2nd level); passive Perception; initiative; unarmoured AC (monk and barbarian Unarmored Defense); speed by race (+ monk); HP (max die at 1st level, then the fixed average, + Con, + hill dwarf); hit dice by die size; spellcasting ability, DC, attack; spell slots for full, half (paladin/ranger from 2nd, artificer rounded up) and third casters (Eldritch Knight, Arcane Trickster), the multiclass table, and warlock Pact Magic. Checked against the PHB tables.
- **Player's own values:** every derived value has a key (`DERIVED`). Typing into its box stores `overrides[key]`, which always wins and is marked on the page with ↺ to return to automatic; clearing the box also returns to automatic. Values built on others use the effective value (passive Perception follows a typed Perception). The rules never write to fields the player owns. Spell details are only replaced when the player asks ("Look up details", confirmed if there's already a description).
- **Saving:** the page autosaves the whole sheet ~0.8s after typing stops (also when the tab is hidden, on campaign switch and on logout). `PUT` carries the version the page loaded; if the sheet was saved elsewhere since, it's refused (409 with the current sheet) and the player chooses which to keep, so devices never silently overwrite each other. The server normalises every sheet (`normalizeSheet`: known fields only, types fixed, sizes capped). The archive gets only the changes per save.
- **Upload:** PDF (form fields and page text extracted with pdf.js; the PDF is also attached so the AI can see checkboxes; scans work), images (PNG, JPEG, WebP, GIF up to 5 MB), text, or this app's own download (loaded without the AI). The AI fills a fixed schema: the fields, plus the numbers as printed. Printed numbers that differ from the rules become overrides; ones that match don't, so they keep updating. Save proficiencies become overrides only where the marks differ from the class default. The AI's notes (what it couldn't read, likely mistakes) are shown to the player.
- **Spell lookup:** (1) SRD 5.1 (319 spells, bundled; exact name or a small typo); (2) the books folder, with no database: PDFs are read into memory at start-up (~1.7s for the PHB); a spell is found by its printed heading (a capitalised line followed by "1st-level evocation" / "Evocation cantrip", tolerant of OCR errors, fuzzy-matched), its text is cut out up to the next heading, and the AI tidies the scan into fields without changing the wording; (3) the AI's memory, labelled "AI memory" and told to say not-found rather than guess. Book and AI results are cached in memory. Each spell records its source and page. Measured with Claude Code: ~0.5s SRD, ~7s book or memory.
- **Limits:** `SHEET_AI_PER_HOUR` (60) AI calls per player for uploads and non-SRD lookups; 5 MB per save; 30 MB PDFs.

### 6.5 Dice

Owner's requirement (2026-10-07): an animated dice roller like D&D Beyond's, as long as it looks exactly the same to the player. D&D Beyond lets the physics in the browser decide the roll; here **the server decides** and the dice are animated to land on its numbers, which looks the same, is evenly random, and can't be faked from the page (that matters once rolls are shared).

- **Rolling:** `POST /campaigns/:cid/roll` (anyone in the campaign) with notation (`1d20+5`, `2d6+1d4-1`, `d%`; d2, d4, d6, d8, d10, d12, d20, d100; up to 50 dice) and a mode. Advantage/disadvantage applies when the roll has exactly one d20: it's rolled twice and the higher/lower kept. Numbers come from `crypto.randomInt`. Parsing and the arithmetic are in `shared/src/dice.js` (the page uses the same file to read dice out of an attack's damage, e.g. `1d8+2 piercing`). Rolls are **not stored** and nobody else sees them yet.
- **3D:** [dice-box-threejs](https://github.com/3d-dice/dice-box-threejs) (Three.js + cannon-es, one self-contained ES module) is served at `/vendor/dice/dice-box.js` and its sounds under `/vendor/dice/sounds/`, loaded the first time someone rolls (~700 KB). It simulates a real throw, then swaps face labels so the face that lands up shows the server's number. A d100 is a tens die and a units die. Dice take the theme's accent colours. Off with reduced motion, without WebGL, or when switched off in the tray; then the result just appears.
- **Dice styles and effects** (owner's request, 2026-10-07: "more dice themes, special effects, fancy stuff"): 24 styles in the tray (`STYLES` in `dice.js`: "Match the page" plus colour/texture sets, most adapted from the library's own; textures served from `/vendor/dice/textures/` and fetched only for the style in use). All use the library's plain or matte materials: its metal and glass need a reflection map the library switches off, so they render nearly black. `dice-fx.js` draws on a canvas over the page: each style's trail behind every moving die (positions projected from the 3D scene each frame), a natural 20 (golden flash, rings, stars and confetti at the die, a banner, a shine on the result), a natural 1 (red flash closing in, smoke, a banner, the page shakes) and maxed damage (2+ dice, no d20, all on their highest face). Chimes are synthesised with Web Audio. "Try it" and picking a style throw a preview (rolled in the page, shown only, never recorded). Effects can be switched off; they're always off with reduced motion.
- **Page** (`web/public/dice.js`): the tray (dice buttons and a notation box, Normal / Advantage / Disadvantage for the next d20, dice style, 3D / effects / sound switches kept per browser, this session's rolls), the result card (total, every die with dropped ones struck through, natural 20 / natural 1, and a damage roll offered after an attack: doubled dice on a natural 20). On the sheet, clicking a save, skill, ability name, initiative or spell attack rolls a d20 plus that value; each attack has a roll button; death saves have one. Shift-click: advantage; Alt-click: disadvantage.
- **Later (owner's call):** sharing rolls with the party or the DM live, DM-only rolls, and whether rolls go into the archive for the archivist. These need a live channel per campaign and decisions that are part of the DM role.

## 7. Security & cost controls

- **Accounts:** no self sign-up. The server admin creates accounts, sets passwords and assigns roles on the admin screen (`/admin/*` routes, admin login only); the DM role can't. The console only does `init` (create the admin login), `set-password` (recovery) and `list`. Accounts with history can only be blocked, not deleted (the archive refers to them by id). Names are unique (ignoring case). Passwords: at least 6 characters, stored as scrypt hashes, never in plain text, including the archive.
- **Must change password at next login** (`users.must_change_password`, schema v4): set by the admin (default on for new accounts in the UI; optional on resets; toggle per account). While set, the server only allows `/me`, `/logout` and `POST /account/password` for that login (403 otherwise), so it can't be skipped by the client. The player gives their current password and a different new one; this clears the flag and ends their other logins. `POST /account/password` also works any time ("Change password" in the header).
- **Logins:** `POST /login` returns a random token (stored hashed in `logins`). It lasts `LOGIN_DAYS` (30) since last use; logging out ends it; a password set by the admin, or a block, ends all of that account's logins (changing your own ends all but the current one). After `MAX_FAILED_LOGINS` (10) wrong passwords for a name in 15 minutes, that name is refused for a while. Unknown names take as long as wrong passwords, so names can't be probed by timing.
- Role checks are server-side. Account and campaign names are cleaned (trimmed, repeated spaces collapsed) so stored names match what the page shows.
- AI credentials exist only on the server. Claude Code runs are locked down (§3.5).
- Privacy filtering is enforced in the server's tools and endpoints, not left to the model's discretion (§5.4, §5.5).
- Per-player Q&A rate limit; tool-call and cost caps per question and per archivist run; monthly spending cap on the API provider. Every AI call is logged in `llm_usage`.
- Back up `data/archive/`. The database can be rebuilt from it.

## 8. Milestones

1. ✅ Foundation. 2. ✅ Ingestion. 3. ✅ Memory. 4. ✅ Q&A.
5. ✅ **AI-managed knowledge base**: archivist, player notes, privacy, corrections and questions.
6. **Real data**: a real transcript; check the parser, the archivist's output, and timings at realistic size.
7. **Client**: web page. Player view ✅ (login, campaign choice, questions, notes); admin screen ✅ (incl. session uploads); DM screens next.
8. **Hosting**: domain, Cloudflare Tunnel, packaging, player setup guide.

## 9. Open questions

- Should the DM see players' character sheets, and should Q&A use them? (Currently only the player can.)
- Should dice rolls be shared with the party or the DM live, can the DM roll in secret, and should rolls be archived for the archivist? (Currently private and not stored.)
- **DM role (deferred by the owner):** what the DM can see and do, including whether the DM sees knowledge derived from players' private notes (currently yes).
- What exact format does the recorder produce? Are speakers labelled reliably per Discord user?
- Note-to-session matching is by date (with a 6am rollover). Is an explicit "session started" button needed?
- Sessions must be processed in order. A late-uploaded earlier session is handled, but the archivist sees it after later ones until a rebuild.
- How well does the archivist hold up over dozens of sessions (record sprawl, pinned budget, consistency)? Needs real data.
