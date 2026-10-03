# DNDApp — Project Spec

> Status: v0.5 (2026-10-04). Server built and tested end to end with real AI calls, including the archivist and privacy. Electron client not started.
> This is the source of truth for scope and design. Update it when decisions change. For the history of changes and where work left off, see [HANDOFF.md](HANDOFF.md).

## 1. Overview

DNDApp is a campaign-memory tool for a D&D group.

1. During a session (played over Discord), players use the **Electron app** to **take private notes**. Each note is sent to the server and archived immediately.
2. The session is recorded, and separate speech-to-text software produces **one timestamped transcript**.
3. The transcript is uploaded **with the date it was played** (currently by any account with the `dm` role or the server admin). The server archives it permanently. Then an AI **archivist** reads the transcript plus that date's player notes and updates the campaign's **knowledge base**. The archivist has full authority over the knowledge base and organises it however it judges best, including **who knows what**.
4. Players use the app to **ask questions** ("How much do we still owe Brother Hal?"). Answers cite the session and timestamp, and only use what that player's character should know.

The app's two core functions are **asking questions** and **taking notes during the session**. The UI isn't designed yet.

This is a personal project for a small group of friends. It is not sold and players don't pay for it.

**People and roles:**
- **Host / project owner (Kenny):** runs the server on his machine and owns the server admin account. He is **not** the DM.
- **DM:** a separate person, with role `dm` in the campaign. The DM's role and permissions will be designed later; for now the `dm` role has the permissions described in this spec.
- **Players:** role `player`.

Hard design problems:

- **Scale over time.** By session 200 the transcripts won't fit in any context window. Answers come from an AI-maintained knowledge base plus targeted search, never the whole history (§5).
- **Being able to start over.** Everything except the archive can be thrown away and regenerated from it (§4.3).
- **Who knows what.** Players miss sessions, get whispered secrets, and keep private notes. Q&A must not leak (§5.4).

## 2. Constraints

- **All JavaScript.** Node.js for the server, Electron for clients. Plain JS (ES modules), with JSDoc types where useful. npm packages are welcome.
- **Self-hosted.** The server runs on the host's own machine (Kenny's). No cloud backend of our own.
- **Thin clients.** The Electron apps only talk to the DNDApp server. They send what players type (questions, notes) and display results. They never process, index or store campaign data, and never call the AI.
- **Archive first.** Transcripts, player notes, DM corrections and accounts are archived as plain files and never modified. Everything else is derived and can be regenerated.
- **The AI owns the knowledge base.** No human reads it directly, so it doesn't need to be human-friendly. The archivist can create, restructure, merge and delete freely.
- **Claude via the host's Claude Code.** By default all AI work runs through Claude Code on the host (Claude Agent SDK), using the host's Claude subscription. The Anthropic API is a config switch away (§3.5).
- **Recording and transcription are out of scope.** DNDApp starts from a finished transcript file.

## 3. Architecture

```
 During the session:  player app ── POST /notes ──►  archive + private search index
 After the session:   transcript + date ── upload ──►  archive
                                                         │
                                       job queue ── archivist agent (full write access)
                                                         │   reads: transcript, that date's notes,
                                                         │          roster, attendance, its guide
                                                         ▼
                                                   knowledge base (records with known_by)
                                                         │
 Any time:            player app ── POST /ask ──►  Q&A agent (read-only, filtered to the asker)
```

### 3.1 Repo layout (npm workspaces)

```
DNDApp/
  packages/
    shared/    transcript parser, citation format (used by server and client)
    server/
      src/
        app.js            HTTP routes
        context.js        wires everything together
        config.js         all settings (env vars), PIPELINE_VERSION
        archive.js        archive files
        store.js          source data (archive first, then DB mirror): sessions, notes, corrections, restore
        auth.js           tokens, memberships (also archived)
        jobs.js           background queue: ingest, correct, rebuild
        search.js         hybrid keyword + vector search with per-viewer visibility
        embeddings.js     local embedding model
        db/               schema.sql + migrations
        llm/              providers: claude-code.js, api.js, common.js
        kb/               store.js (knowledge-base records, journal), archivist.js (agent + tools)
        pipeline/         prepare.js (speakers, glossary, chunking), ingest.js (attendance, indexing, archivist run)
        qa/               agent.js, tools.js
        cli/              admin.js, rebuild.js
      test/               offline tests (fake AI); fixtures/privacy-scenario/ = manual real-AI scenario
    client/    Electron app (not started)
  SPEC.md  HANDOFF.md  README.md  AGENTS.md  CLAUDE.md
```

### 3.2 Server

- Node.js (22+; developed on 24) with **Fastify**.
- **SQLite** (`better-sqlite3`), one file. FTS5 for keyword search; vectors as blobs, searched by brute force in memory.
- One background job at a time, in order (the archivist builds each session on the last). Interrupted jobs resume after a restart.

### 3.3 Client (Electron)

- One app for everyone; features depend on role (DM or player).
- **Core player features:** ask questions (streamed answers with clickable citations); take notes during the current session.
- **DM / host features** (split between DM and host to be decided with the DM role): upload transcripts with date; speaker map (linking transcript names to accounts); glossary; members/invites; corrections; answer the archivist's questions; job progress.
- Connects by server URL + token; a pure front end (no local data, no AI calls).
- On each `turn` event from `/ask`, replace displayed text rather than appending.

### 3.4 Networking

**Decision: Cloudflare Tunnel** with a cheap domain (e.g. a numbers-only `.xyz`, ~$1/year), using Cloudflare's free plan. `cloudflared` on the host connects out to Cloudflare: no port forwarding, no static IP, home IP hidden. The server listens only on `127.0.0.1`. Every request except `/health` needs a token. HTTPS JSON plus SSE for job progress and streamed answers.

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
| `campaigns`, `users`, `memberships` | source | Campaigns, accounts (hashed tokens), role + character per campaign. |
| `speakers`, `glossary` | source | As above. |
| `sessions` | source | Number, date played, checksum, processing status. |
| `player_notes` | source | Private notes with author and session date. |
| `corrections` | source | DM corrections with `after_session` (where to replay them in a rebuild). |
| `attendance` | derived | Who was at each session. |
| `kb_records` | derived | The archivist's knowledge base (§5.1). |
| `kb_journal` | derived | Every knowledge-base change, with the run and reason. |
| `dm_questions` | derived | Questions the archivist left for the DM. |
| `docs` (+ `docs_fts`) | derived | Search index: transcript chunks, knowledge-base records, player notes, each with `visible_to`. |
| `jobs`, `llm_usage`, `conversations`, `qa_log` | operational | Queue, AI usage/timing, Q&A history. |

### 4.3 Archive, restore and rebuild

```
data/archive/
  _server/accounts.json                users incl. token hashes (tokens survive DB loss)
  <campaign>/
    campaign.json, members.json
    speakers.json, glossary.json      (+ history/)
    corrections.jsonl                 append-only
    player-notes/<YYYY-MM-DD>.jsonl   append-only
    sessions/0001/transcript.txt      read-only, sha256 in meta.json
    outputs/v<PIPELINE_VERSION>/<timestamp>-<run>/report.json, journal.json, knowledge_base.json, questions.json
```

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

### 5.4 Privacy (primitive version)

Who-knows-what is decided by the archivist and enforced by the server:

| Data | Who can see it |
|---|---|
| Knowledge-base record | Its `known_by` (NULL = every member). DMs see all. |
| Transcript (search, read, evidence, `/transcript` endpoint) | Attendees of that session. DMs see all. |
| Player note (search, list) | **Only its author**, not even the DM. |
| Archivist | Sees everything, including all notes; decides `known_by`. |

The archivist's rules: openly happened → attendees (everyone if all attended); only in a player's note → that player; whispered/secret perception → that player; absent players don't know unless told later (then widen); mixed records get split; when in doubt, restrict.

**Deferred:** the archivist currently includes the DM in `known_by` for records built from a player's private note, so the DM can learn note contents through Q&A or the debug view. The DM role is being designed later (owner's instruction: leave it for now). More privacy work is planned.

### 5.5 Performance

- Q&A latency matters; processing time doesn't (project owner's decision).
- Measured with the real archivist knowledge base: 5–10s per question, most answered without any tool calls thanks to pinned records and pre-search. First text ~1.5–2s (earlier measurement).
- A real archivist run on a ~3-minute sample took ~70–100s at high effort.
- Not done, by decision: changing the Q&A model, lowering Q&A effort, API fast mode. A warm Claude Code process would save ~0.6s; not adopted.

## 6. Features

### 6.1 Built

- [x] Accounts with tokens, DM/player roles, invites, revocation; archived.
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
- [ ] Electron client (notes + questions first).
- [ ] Cloudflare Tunnel set up on the host.

### 6.3 Later

- Fuller privacy model (DM access to note-derived knowledge; sharing notes; per-character knowledge beyond attendance).
- Edit or delete your own notes (as new archived versions).
- Explicit "session in progress" marker instead of date matching.

## 7. Security & cost controls

- Tokens are random, stored hashed, shown once, revocable. Role checks are server-side.
- AI credentials exist only on the server. Claude Code runs are locked down (§3.5).
- Privacy filtering is enforced in the server's tools and endpoints, not left to the model's discretion (§5.4).
- Per-player Q&A rate limit; tool-call and cost caps per question and per archivist run; monthly spending cap on the API provider. Every AI call is logged in `llm_usage`.
- Back up `data/archive/`. The database can be rebuilt from it.

## 8. Milestones

1. ✅ Foundation. 2. ✅ Ingestion. 3. ✅ Memory. 4. ✅ Q&A.
5. ✅ **AI-managed knowledge base**: archivist, player notes, privacy, corrections and questions.
6. **Real data**: a real transcript; check the parser, the archivist's output, and timings at realistic size.
7. **Client**: Electron app.
8. **Hosting**: domain, Cloudflare Tunnel, packaging, player setup guide.

## 9. Open questions

- **DM role (deferred by the owner):** what the DM can see and do, including whether the DM sees knowledge derived from players' private notes (currently yes).
- What exact format does the recorder produce? Are speakers labelled reliably per Discord user?
- Note-to-session matching is by date (with a 6am rollover). Is an explicit "session started" button needed?
- Sessions must be processed in order. A late-uploaded earlier session is handled, but the archivist sees it after later ones until a rebuild.
- How well does the archivist hold up over dozens of sessions (record sprawl, pinned budget, consistency)? Needs real data.
