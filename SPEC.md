# DNDApp — Project Spec

> Status: draft v0.2 (2026-10-03). This is the source of truth for scope and design. Update it when decisions change.

## 1. Overview

DNDApp is a note-taking and campaign-memory tool for a D&D group.

1. Sessions are played over Discord and recorded.
2. Separate recording + speech-to-text software produces **one timestamped transcript per session**.
3. The transcript is uploaded to the **DNDApp server**, which **archives it permanently**, then uses an LLM to generate session notes and keep a long-term campaign knowledge base up to date.
4. Players use an **Electron desktop app** to read notes and **ask an AI questions** about the campaign ("What did the innkeeper in Brindle tell us about the cult?").

There are two hard design problems:

- **Scale over time.** By session 200 the total transcript text will be far larger than any LLM context window. The system must answer questions accurately without ever sending the whole campaign history to the model (see §5).
- **Being able to start over.** The way we summarize and index will probably change. Everything except the archive must be rebuildable from the archive (see §4.3).

## 2. Constraints

- **All JavaScript.** Node.js for the server, Electron for clients. Plain JS (ES modules), with JSDoc types where useful. No other languages in the codebase.
- **Self-hosted.** The server runs on the DM's own machine. No cloud backend of our own.
- **Thin clients.** The Electron apps only talk to the DNDApp server. They do no processing, indexing, or storage of campaign data, and never call the LLM or any other service directly. All work happens on the host machine.
- **Archive first.** Original transcripts and all DM edits are kept forever and never modified. Everything else is derived data and can be thrown away and regenerated.
- **External LLM API.** Text generation uses a hosted LLM API (Claude by default) with the host's API key. Costs fall on the host, so usage must be bounded.
- **Recording and transcription are out of scope.** DNDApp starts from a finished transcript file.

## 3. Architecture

```
 Discord session
      │  (external recorder + speech-to-text)
      ▼
 transcript.txt ──upload──►  DNDApp Server (host machine, Node.js)
                              ├─ HTTP API + auth
                              ├─ Archive (immutable transcripts + DM edits)
                              ├─ Ingestion pipeline (chunk → notes → entities → index)
                              ├─ Q&A agent (search in stages → build context → answer)
                              ├─ SQLite database (+ vector index) — derived, rebuildable
                              └─ LLM API client
                                   ▲
        Electron clients ──HTTPS───┘
        (DM + players: display + input only)
```

Clients send requests and display results. Nothing else.

### 3.1 Repo layout (npm workspaces)

```
DNDApp/
  packages/
    server/    Node.js API, pipeline, Q&A, database
    client/    Electron app (DM + player, role-based UI)
    shared/    Shared constants, schemas, transcript parser
  SPEC.md
```

### 3.2 Server

- Node.js (LTS) with a small HTTP framework (Fastify or Express).
- **SQLite** (`better-sqlite3`) as the only database: one file, easy to back up.
- Vector search via a SQLite extension (`sqlite-vec`) so everything stays in one file.
- Full-text search via SQLite **FTS5** (keyword search is important for proper nouns).
- Long jobs (processing a 4-hour transcript) run in a background job queue and report progress to clients.

### 3.3 Client (Electron)

- One app for everyone; features depend on the user's role (DM or player).
- Connects to the host's server by URL + invite token.
- A pure front end: it calls the server's API and renders the responses. No local database, no indexing, no LLM calls, no API keys.
- Packaged with `electron-builder` for Windows (other platforms as needed).

### 3.4 Networking

Players connect over the internet to the host's machine. Options, in order of preference:

1. **Tailscale** (or similar private network). No open ports, encrypted. Preferred.
2. Port forwarding + HTTPS. More setup and more exposure.

The server is only reachable while the host's machine is on. That's acceptable.

## 4. Data model

### 4.1 Transcript input format

One plain-text file per session, one utterance per line:

```
[HH:MM:SS] Speaker Name: what they said
```

- Speaker names come from Discord display names. The server keeps a **speaker map** (Discord name → player → character) so notes use character names.
- If the external tool's format differs, write an adapter in `packages/shared` and don't change the core pipeline.

### 4.2 Core entities

| Entity | Purpose |
|---|---|
| `campaign` | Top-level container (supports more than one campaign). |
| `user` | DM or player. Has a role and an auth token. |
| `character` | Player character, linked to a user and speaker name(s). |
| `session` | Number, date, title, raw transcript, processing status. |
| `chunk` | A slice of a transcript (~a few minutes of play) with start/end timestamps, text, and embedding. |
| `session_notes` | Generated notes for one session (summary, key events, loot, decisions, open threads). |
| `entity` | Something in the world: NPC, location, faction, item, quest. Has a living "wiki page" summary. |
| `entity_mention` | Links an entity to the chunks/sessions where it appears. |
| `arc_summary` | Rolled-up summary covering a range of sessions (e.g. every 10). |
| `campaign_summary` | One short "story so far" document, rewritten as the campaign goes on. |
| `glossary` | Correct spellings of names and terms, used to fix transcription errors. |
| `qa_log` | Questions asked, answers, sources used, token cost. |

### 4.3 Archive and rebuild

Data is split into two kinds:

**Archive (source of truth, never modified, never deleted)**
- Original transcript files, stored byte-for-byte as uploaded, in `data/archive/<campaign>/session-<n>/`, with a checksum.
- Session metadata (number, date, title).
- Speaker map and glossary, with history.
- DM edits and corrections, stored as separate records ("change X to Y in session 12 notes"), not as overwrites of generated text.
- Every generated output (session notes, entity pages, summaries) is also saved as a versioned snapshot tagged with the pipeline version that made it. Old versions are kept, so we can compare approaches.

**Derived (disposable)**
- Chunks, embeddings, search indexes, entity pages, arc and campaign summaries, the current session notes.

**Rebuild.** One command wipes all derived data and re-runs the ingestion pipeline over every archived session in order, then reapplies DM edits. This lets us change chunk sizes, prompts, embedding models, or the whole memory design and regenerate everything. Rebuilds use the LLM and cost money, so the command shows an estimate first and can run on a range of sessions.

Each pipeline change bumps a `PIPELINE_VERSION` constant so we always know which approach produced which data.

The archive folder is the thing to back up. The SQLite database is a convenience copy.

## 5. Handling context limits (core design)

We never put the whole campaign into the prompt. We build **layered memory** at ingestion time and **retrieve** only what a question needs at query time.

### 5.1 Memory layers

From most compressed to most detailed:

1. **Campaign summary.** ~1–2k tokens. Always included. The "story so far" plus the party roster.
2. **Arc summaries.** One per block of sessions (e.g. 10). Built from session notes, not raw text.
3. **Entity pages.** One per NPC/place/faction/item/quest. Updated after each session with new facts and the session they came from. Answers "who is X?" without searching 200 sessions.
4. **Session notes.** One per session, a few thousand tokens at most.
5. **Transcript chunks.** Raw text, timestamped, searchable. The ground truth for exact details ("what exactly did she say?").

Ingestion cost scales with **one session**, not the whole campaign: each new session only updates the summaries and entity pages it touches.

### 5.2 Ingestion pipeline (per session)

1. **Parse** the transcript, apply the speaker map, apply glossary fixes.
2. **Chunk** by time/size (e.g. ~3–5 minutes or ~1,500 tokens) with small overlaps. Keep timestamps.
3. **Index** chunks: full-text (FTS5) + embeddings.
4. **Generate session notes.** If the transcript is too long for one call, summarize chunks in groups first, then combine (map → reduce).
5. **Extract entities** and new facts from the notes and chunks. Match them against existing entities (including aliases and misspellings) and update their pages.
6. **Update the arc summary** for the current block and **rewrite the campaign summary**.
7. Mark the session as processed. The DM can review and edit the generated output; edits are kept and not overwritten by reprocessing.

### 5.3 Q&A agent (search in stages)

Q&A works like a research assistant, not a single prompt. The model is given **search tools** over the summarized knowledge base and runs in a loop: search, read results, decide what else it needs, search again, and add the useful pieces to a **working context**. When it has enough, it writes the answer. This is the same way a coding agent explores a large codebase without reading every file.

**Tools the agent can call** (all run on the server):

| Tool | Returns |
|---|---|
| `get_campaign_summary()` | The "story so far". Always loaded at the start. |
| `find_entities(query)` | Matching NPCs/places/factions/items/quests (names, aliases, short descriptions). |
| `read_entity(id)` | The full entity page, with the sessions each fact came from. |
| `search_notes(query, session_range?)` | Matching passages from session notes and arc summaries (hybrid keyword + vector search). |
| `read_session_notes(session)` | Full notes for one session. |
| `search_transcript(query, session_range?)` | Matching raw transcript chunks, with timestamps. For exact details and quotes. |
| `read_transcript(session, from, to)` | A specific stretch of transcript. |
| `add_to_context(source, excerpt, why)` | Keeps a piece of evidence for the final answer. |

**Flow for one question:**

1. Start with the campaign summary and the question.
2. The agent searches the cheapest, most compressed layers first (entities, summaries), and only drops to session notes and raw transcript when it needs more detail.
3. It collects only the relevant excerpts into the working context, not whole search results.
4. It stops when it can answer, or when it hits a limit.
5. A final call answers from the working context only, **with citations** (session number + timestamp). If the evidence doesn't cover the question, it says it doesn't know.

**Limits (config values):** maximum tool calls per question, maximum tokens in the working context, and a maximum cost per question. These keep cost flat no matter how big the campaign gets. Only the pool being searched grows.

**Follow-up questions** keep a short summary of the conversation and the working context from the previous question, not the full chat history.

The tool calls and the working context are saved to `qa_log`, so we can see how an answer was found and tune the search.

### 5.4 Embeddings

- Default: **local embeddings in JS** via `transformers.js` (a small sentence-embedding model). Free, offline, no extra API key.
- Optional: a hosted embedding API, behind the same interface.
- The model name is stored with each vector, so the index can be rebuilt if we switch.

## 6. Features

### 6.1 MVP

- [ ] Server: campaigns, sessions, users with invite tokens (DM / player roles).
- [ ] Upload a transcript (DM only); archived permanently, then processed in the background with progress.
- [ ] Rebuild command: regenerate all derived data from the archive.
- [ ] Speaker map and glossary management (DM).
- [ ] Generated session notes: summary, key events, NPCs met, loot, decisions, open threads.
- [ ] Entity pages (NPCs, locations, factions, items, quests) built automatically.
- [ ] Campaign summary ("story so far").
- [ ] Q&A agent with staged search and citations to session + timestamp.
- [ ] Electron client: connect to server, browse sessions/notes/entities, ask questions.
- [ ] DM can edit any generated content.

### 6.2 Later

- DM-only notes and secrets, hidden from players and from player Q&A.
- Player personal notes (private or shared with the party).
- Reprocess a single session after glossary or speaker-map fixes.
- Full-text search UI across all transcripts.
- Timeline view of events across sessions.
- Side-by-side comparison of outputs from different pipeline versions.
- Export notes to Markdown.

## 7. Security & cost controls

- Every client request needs an auth token. Tokens are issued per user by the DM and can be revoked.
- Role checks happen on the server, never only in the UI.
- The LLM API key exists only on the server. Clients never see it.
- Per-user rate limits on Q&A, plus a monthly spending cap. Token usage is logged in `qa_log` and for each ingestion job.
- Back up the archive folder regularly (simple scheduled copy). The database can be rebuilt from it.

## 8. Milestones

1. **Foundation.** Monorepo, server skeleton, archive storage, SQLite schema, transcript parser + tests using a sample transcript.
2. **Ingestion.** Chunking, indexing (FTS + embeddings), session notes generation, rebuild command.
3. **Memory.** Entity extraction/merging, entity pages, arc + campaign summaries.
4. **Q&A.** Search tools, agent loop with limits, cited answers.
5. **Client.** Electron app: connect, browse, ask.
6. **Hardening.** Auth, rate limits, DM editing, packaging, networking setup guide.

## 9. Open questions

- What exact output format does the recorder/transcription tool produce? Get a real sample to build the parser against.
- Does the transcript label speakers reliably (per-user Discord tracks), or will speaker detection be noisy?
- Should players who missed a session be able to see its notes? (Probably yes. In-character knowledge filtering is out of scope.)
- Which LLM model tiers to use for each step (cheaper model for chunk summaries and extraction, stronger model for notes and Q&A)?
- One campaign or several on the same server from day one? (Schema supports several; UI can start with one.)
