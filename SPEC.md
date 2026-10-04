# DNDApp — Project Spec

> Status: v0.7 (2026-10-04). Server built and tested end to end with real AI calls, including the archivist and privacy. Web page served by the server: name + password logins (with admin-forced password changes), multiple campaigns, a player view (ask, notes) and an admin screen (accounts, campaigns, roles). No DM/host screens yet.
> This is the source of truth for scope and design. Update it when decisions change. For the history of changes and where work left off, see [HANDOFF.md](HANDOFF.md).

## 1. Overview

DNDApp is a campaign-memory tool for a D&D group.

1. During a session (played over Discord), players use the **web page** (served by the DNDApp server) to **take private notes**. Each note is sent to the server and archived immediately.
2. The session is recorded, and separate speech-to-text software produces **one timestamped transcript**.
3. The transcript is uploaded **with the date it was played** (currently through the API, by any account with the `dm` role or the admin login; there's no upload screen yet). The server archives it permanently. Then an AI **archivist** reads the transcript plus that date's player notes and updates the campaign's **knowledge base**. The archivist has full authority over the knowledge base and organises it however it judges best, including **who knows what**.
4. Players use the web page to **ask questions** ("How much do we still owe Brother Hal?"). Answers cite the session and timestamp, and only use what that player's character should know.

The app's two core functions are **asking questions** and **taking notes during the session**. A basic UI for both exists (§3.3); it will be refined with real use.

This is a personal project for a small group of friends. It is not sold and players don't pay for it.

**People and roles:**
- **Host / project owner (Kenny):** runs the server on his machine and owns the admin login (management only). He is **not** the DM. He plays through a separate, ordinary player account.
- **Admin login:** for managing the server only (accounts, campaigns, roles). It isn't in any campaign. It also passes DM checks in the API, so transcripts can be uploaded before DM screens exist.
- **DM:** a separate person, with role `dm` in a campaign (set on the admin screen). The DM's role and permissions will be designed later; for now the `dm` role has the permissions described in this spec. The DM can't manage accounts.
- **Players:** role `player`. One account can be in several campaigns, with a different role and character in each.

Hard design problems:

- **Scale over time.** By session 200 the transcripts won't fit in any context window. Answers come from an AI-maintained knowledge base plus targeted search, never the whole history (§5).
- **Being able to start over.** Everything except the archive can be thrown away and regenerated from it (§4.3).
- **Who knows what.** Players miss sessions, get whispered secrets, and keep private notes. Q&A must not leak (§5.5), and campaigns must not mix (§5.4).

## 2. Constraints

- **All JavaScript.** Node.js for the server; a plain web page (HTML/CSS/JS, no build step) for players. Plain JS (ES modules), with JSDoc types where useful. npm packages are welcome.
- **Self-hosted.** The server runs on the host's own machine (Kenny's). No cloud backend of our own.
- **Thin client.** The web page only talks to the DNDApp server. It sends what players type (questions, notes) and displays results. It never processes, indexes or stores campaign data (only the login token, in the browser), and never calls the AI.
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
    shared/    transcript parser, citation format
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
        cli/              admin.js (init, set-password, list), rebuild.js
      test/               offline tests (fake AI); fixtures/privacy-scenario/ = manual real-AI scenario
    web/public/  the web page, served by the server at / (no build step):
                 index.html, app.js (login, password, campaign picker, Ask, Notes), admin.js (admin screen),
                 api.js (requests, SSE, element helper), style.css, icon.svg
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
- **Admin screen** (admin login only, instead of Ask/Notes): accounts (add with the campaigns they can access, "Edit campaigns" to change that later, set password, require a new password at next login, log out everywhere, block/unblock, delete if unused), campaigns (each a colour-coded card; create with a unique name, delete with typed-name confirmation; add people as player or DM, change roles and characters, remove). Messages appear as a toast that's always on screen. The admin login is for management only and isn't in any campaign; an admin who plays uses a separate, ordinary player account (§5.5 applies to it like anyone else).
- **Player view:** ask questions (streamed answers, a status line while it searches, clickable citations that jump to the quoted transcript lines, past conversations, follow-ups); take notes (saved to today's session, listed by session date). Works on phones; light and dark themes.
- **Not built yet: DM / host features** (split between DM and host to be decided with the DM role): upload transcripts with date; speaker map (linking transcript names to accounts); glossary; corrections; answer the archivist's questions; job progress.
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
    sessions/0001/transcript.txt      read-only, sha256 in meta.json
    outputs/v<PIPELINE_VERSION>/<timestamp>-<run>/report.json, journal.json, knowledge_base.json, questions.json
    deleted.json                      only if the admin deleted the campaign (restore skips it; nothing else is touched)
```

- **Deleting a campaign** removes it and everything derived or mirrored from it from the database (foreign-key cascades), but never touches the archive: the folder gets `deleted.json` and restore skips it. New campaigns never reuse an existing archive folder's slug. Undo by hand: remove the marker, restart, rebuild.
- A transcript can never be replaced (different bytes for an existing session number → 409).
- **Restore:** on start-up, accounts, campaigns, members, sessions, speakers, glossary, corrections and notes missing from the database are restored from the archive, and notes are re-indexed. Then run a rebuild to regenerate the knowledge base.
- **Rebuild:** `npm run rebuild -- --campaign <id> --yes` (or `POST /rebuild`) wipes all derived data, re-indexes notes, then replays every session in order, each correction right after the session it was made against. The archivist is non-deterministic, so a rebuild gives an equivalent knowledge base, not an identical one.
- Bump `PIPELINE_VERSION` (now 2) when prompts, tools or the memory design change.

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
2. **System prompt**: rules, who is asking, the archivist's guide, and pinned records the asker may see.
3. **Tools** (read-only, filtered to the asker): `search_kb`, `list_records`, `get_records`, `list_sessions`, `search_transcript`, `read_transcript`, `search_my_notes`.
4. **Answer** with citations `[S12]`, `[S12 01:23:45]`, `[S12 01:23:45-01:24:10]`. Evidence (the cited transcript lines) is attached server-side, only for sessions the asker attended.
5. Follow-ups include the last 3 Q&As and the last answer's sources.

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
- [x] Transcript upload with date; archived; processed in the background with progress; retry.
- [x] Private player notes during the session; archived; searchable by their author immediately.
- [x] Archivist with full authority over the knowledge base, its own guide, journal, and snapshots.
- [x] Attendance and who-knows-what; Q&A and transcripts filtered per player.
- [x] DM corrections in plain words; archivist questions for the DM; answers become corrections.
- [x] Q&A with pre-search, staged tool search, streaming, cited transcript evidence.
- [x] Rebuild and restore from the archive.
- [x] Usage and timing stats.

### 6.2 Next

- [ ] Real transcript from the recorder.
- [ ] DM / host features on the web page (upload, speaker map, glossary, corrections, archivist questions, job progress).
- [ ] Try the web page with the players on a real session.
- [ ] Cloudflare Tunnel set up on the host.

### 6.3 Later

- Fuller privacy model (DM access to note-derived knowledge; sharing notes; per-character knowledge beyond attendance).
- Edit or delete your own notes (as new archived versions).
- Explicit "session in progress" marker instead of date matching.

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
7. **Client**: web page. Player view ✅ (login, campaign choice, questions, notes); admin screen ✅; DM/host screens next.
8. **Hosting**: domain, Cloudflare Tunnel, packaging, player setup guide.

## 9. Open questions

- **DM role (deferred by the owner):** what the DM can see and do, including whether the DM sees knowledge derived from players' private notes (currently yes).
- What exact format does the recorder produce? Are speakers labelled reliably per Discord user?
- Note-to-session matching is by date (with a 6am rollover). Is an explicit "session started" button needed?
- Sessions must be processed in order. A late-uploaded earlier session is handled, but the archivist sees it after later ones until a rebuild.
- How well does the archivist hold up over dozens of sessions (record sprawl, pinned budget, consistency)? Needs real data.
