# DNDApp

Campaign memory for a D&D group. Players take private notes during a session; afterwards the DM uploads the transcript. An AI "archivist" reads both and maintains its own knowledge base of everything in the campaign (people, places, debts, quests, secrets) and of who knows what. Players ask questions in the app and get answers with citations back to the session and timestamp, limited to what their character should know.

The design is in [SPEC.md](SPEC.md). Project status, change log and next steps are in [HANDOFF.md](HANDOFF.md).

## Layout

```
packages/
  shared/   transcript parser and constants (used by server and client)
  server/   Node.js server: API, archive, processing pipeline, Q&A agent
  client/   Electron app (not started yet)
```

## Server setup (host machine)

Requires Node.js 22 or newer, and Claude Code logged in on this machine (it uses your Claude subscription).

```sh
npm install
npm run admin -- init "My Campaign" "Your Name"
npm start
```

To use the Anthropic API instead of your subscription, copy `.env.example` to `.env`, set `LLM_PROVIDER=api` and add `ANTHROPIC_API_KEY`. Other settings (models, effort, limits) are in the same file.

When running through Claude Code, the server starts it with everything switched off except its own read-only search tools. That means no file, shell or web tools, no MCP servers or claude.ai connectors, no skills, plugins, hooks or CLAUDE.md files, and no saved sessions. AI usage counts toward your Claude Code limits.

`init` prints your token. It's shown once, so keep it somewhere safe. It makes you the server admin and gives you the `dm` role in that campaign. If someone else is the DM, invite them with `role: "dm"`.

The server listens on `http://127.0.0.1:4400`. The first time a transcript is processed, it downloads a small search model (~25 MB) into `data/models`.

### Data

Everything lives in `data/` (git-ignored):

- `data/archive/` is the permanent record: accounts, original transcripts, player notes, speaker map, glossary, DM corrections, and a snapshot of the knowledge base after every archivist run. **Back this folder up.**
- `data/dndapp.sqlite` is the working database. It can be rebuilt from the archive.

### Rebuilding

When the prompts or processing change, regenerate everything from the archive. Stop the server first.

```sh
npm run rebuild -- --campaign 1              # shows what it would do
npm run rebuild -- --campaign 1 --yes        # wipes the knowledge base and replays everything
```

Every session and DM correction is replayed in the original order.

### Other admin commands

```sh
npm run admin -- list
npm run admin -- reset-token <user id>
npm run admin -- campaign "Second Campaign" <dm user id>
```

## Transcript format

One line per utterance:

```
[01:23:45] Speaker Name: what they said
```

`[MM:SS]`, fractional seconds, and timestamps without brackets also work. Lines without a timestamp are joined onto the previous line.

## API

All requests except `/health` need `Authorization: Bearer <token>`. DM-only routes are marked.

| Method | Path | |
|---|---|---|
| GET | `/health` | Public liveness check |
| GET | `/me` | Your account and campaigns |
| POST | `/campaigns` | Create campaign (server admin) `{name}` |
| GET | `/campaigns/:cid` | Campaign, your role and character |
| GET / POST | `/campaigns/:cid/members` | List / invite (DM) `{name, role?, character_name?}` → token |
| POST | `/campaigns/:cid/members/:uid/reset-token` | New token (DM) |
| DELETE | `/campaigns/:cid/members/:uid` | Revoke access (DM) |
| GET / PUT | `/campaigns/:cid/speakers` | Speaker map (DM) `[{speaker, display_name, user_id}]`. Link each transcript name to an account; attendance and privacy depend on it |
| GET / PUT | `/campaigns/:cid/glossary` | Name spellings (DM) `[{term, variants[], note?}]` |
| GET | `/campaigns/:cid/sessions` | All sessions, processing status, and whether you attended |
| POST | `/campaigns/:cid/sessions` | Upload transcript (DM). JSON `{number, played_on, title?, transcript}` or `text/plain` body with `?number=&played_on=`. `played_on` (YYYY-MM-DD) links it to that day's player notes |
| GET | `/campaigns/:cid/sessions/:n` | Session and who attended |
| GET | `/campaigns/:cid/sessions/:n/transcript?from=&to=` | Transcript lines (players: only sessions they attended) |
| POST | `/campaigns/:cid/sessions/:n/process` | Retry / reprocess a session (DM) |
| POST | `/campaigns/:cid/notes` | Take a private note `{text, session_date?}` (default: today; before 6am counts as the previous day) |
| GET | `/campaigns/:cid/notes?date=` | Your own notes only (nobody else can list them, including the DM) |
| POST / GET | `/campaigns/:cid/corrections` | Correct the archivist in plain words (DM) `{text}` |
| GET | `/campaigns/:cid/questions?status=open` | Questions the archivist left about conflicts (DM) |
| POST | `/campaigns/:cid/questions/:id/answer` | Answer one (DM) `{answer}`. Becomes a correction |
| POST | `/campaigns/:cid/questions/:id/dismiss` | Dismiss one (DM) |
| GET | `/campaigns/:cid/kb` | Raw knowledge base, for debugging (DM) |
| GET | `/campaigns/:cid/jobs` | Recent jobs (processing, corrections, rebuilds) |
| GET | `/campaigns/:cid/jobs/events` | Live job progress (SSE) |
| POST | `/campaigns/:cid/rebuild` | Rebuild everything from the archive (DM) |
| POST | `/campaigns/:cid/ask` | Ask a question (SSE stream) `{question, conversationId?}` |
| GET | `/campaigns/:cid/conversations[/:id]` | Your past questions |
| GET | `/campaigns/:cid/usage` | AI usage this month by step and provider, plus average answer times (DM) |

`/ask` streams these events: `conversation`, `turn`, `tool` (what it's searching), `text` (answer tokens), `done` (`answer`, `evidence` (the transcript lines behind each citation), cost, `durationMs`), and `error`. On each new `turn`, replace any text you've displayed rather than appending to it.

## Tests

```sh
npm test
```

Tests use a fake AI (the fake archivist calls the real knowledge-base tools) and a fake search model, so they're free and run offline.
