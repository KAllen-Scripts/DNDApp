# DNDApp

Campaign memory for a D&D group. Players log in on a web page with a name and password, and take private notes during a session; afterwards the DM uploads the transcript. An AI "archivist" reads both and maintains its own knowledge base of everything in the campaign (people, places, debts, quests, secrets) and of who knows what. Players ask questions on the web page and get answers with citations back to the session and timestamp, limited to what their character should know.

The design is in [SPEC.md](SPEC.md). Project status, change log and next steps are in [HANDOFF.md](HANDOFF.md).

## Layout

```
packages/
  shared/   transcript parser and constants
  server/   Node.js server: API, archive, processing pipeline, Q&A agent; also serves the web page
  web/      player web page (plain HTML/CSS/JS in public/, no build step)
```

## Server setup (host machine)

Requires Node.js 22 or newer, and Claude Code logged in on this machine (it uses your Claude subscription).

```sh
npm install
npm run admin -- init "Admin" "admin-password"
npm start
```

To use the Anthropic API instead of your subscription, copy `.env.example` to `.env`, set `LLM_PROVIDER=api` and add `ANTHROPIC_API_KEY`. Other settings (models, effort, limits) are in the same file.

When running through Claude Code, the server starts it with everything switched off except its own read-only search tools. That means no file, shell or web tools, no MCP servers or claude.ai connectors, no skills, plugins, hooks or CLAUDE.md files, and no saved sessions. AI usage counts toward your Claude Code limits.

`init` creates the **admin login**. The server listens on `http://127.0.0.1:4400`: open it in a browser and log in with that name and password.

### The admin screen

The admin login is only for managing the server. It gets an admin screen instead of Ask/Notes:

- **Accounts:** add accounts (name + password, and tick which campaigns they can access, with role and character for each), change an account's campaigns later ("Edit campaigns"), set a password (logs them out everywhere), require a new password at next login, log someone out everywhere, block/unblock, delete. An account can only be deleted while it's unused (no notes, questions, sessions or speaker-map links), because the archive refers to it; otherwise block it.
- **Campaigns:** each shown as its own colour-coded card; create (names must be unique) and delete campaigns; add accounts to them as player (with a character name) or DM; change roles (e.g. make someone the DM); remove people from a campaign (their account and notes are kept).

**Must change password at next login** (like Active Directory): ticked by default when you add an account, offered when you set a password, and switchable per account ("Require new password" / "Don't require"). While it's on, that person's login can only choose a new password or log out; the server refuses everything else. They give the password you set plus a new one twice; after that their other devices are logged out. Anyone can also change their own password from "Change password" in the header.

There's no sign-up: you create every account and tell each person their name and password. Names are what people log in with, so each must be unique (case doesn't matter). Passwords need at least 6 characters and are stored hashed.

**Deleting a campaign** (you type its name to confirm) removes it from the database: its sessions, knowledge base, notes, questions and who's in it. Accounts are kept. Its archive folder is **not** deleted: it gets a `deleted.json` marker so it isn't restored on start-up. To bring a campaign back, delete that marker file and restart the server, then run a rebuild for it. Deleting is refused while that campaign has processing queued or running.

**Campaigns are separate.** Each has its own sessions, knowledge base, notes, speaker map and conversations, and the AI only ever searches the campaign the question was asked in. Players in more than one campaign choose which one after logging in (and can switch from the header); someone in just one goes straight in.

**If you play too**, make yourself a separate player account on the admin screen and log in with that. It's an ordinary player account, so it only sees what your character should know. (The admin login itself isn't in any campaign.)

If you lose the admin password: `npm run admin -- set-password "Admin" "new-password"`. `npm run admin -- list` shows accounts and campaigns.

Then link each person's transcript speaker name to their account in the speaker map. The AI tracks who knows what by account, so without the link it assumes everyone was at every session.

A login lasts 30 days from when it was last used (`LOGIN_DAYS`). After 10 wrong passwords for a name in 15 minutes, that name can't log in for a while.

### The public address

`PUBLIC_URL` in `.env` is the address players use (a placeholder, `https://dnd.example.xyz`, until the domain is bought). It's the only place the URL is set. The web page is served by this server and calls it with relative paths, so the page itself never needs the URL. The server prints it on start-up.

The first time a transcript is processed, the server downloads a small search model (~25 MB) into `data/models`.

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

## Transcript format

One line per utterance:

```
[01:23:45] Speaker Name: what they said
```

`[MM:SS]`, fractional seconds, and timestamps without brackets also work. Lines without a timestamp are joined onto the previous line.

## API

Log in with `POST /login`; send the token it returns as `Authorization: Bearer <token>` on every other request (except `/health` and the web page's files). DM-only and admin-only routes are marked. The admin login also passes DM checks (e.g. for uploading transcripts through the API until the DM screens exist).

| Method | Path | |
|---|---|---|
| GET | `/health` | Public liveness check |
| POST | `/login` | `{name, password}` → `{token, user}`. Public |
| POST | `/logout` | Ends this login |
| GET | `/me` | Your account and campaigns |
| GET | `/campaigns/:cid` | Campaign, your role and character |
| GET | `/campaigns/:cid/members` | List members (DM) |
| GET / POST | `/admin/users` | List accounts (with campaigns, logins, status) / create `{name, password}` (admin) |
| PUT | `/admin/users/:uid/campaigns` | Set exactly which campaigns an account can access `{campaigns: [{campaign_id, role, character_name?}]}` (admin). `POST /admin/users` takes the same optional `campaigns` |
| POST | `/account/password` | Change your own password `{current_password, new_password}`. Clears "must change"; logs out your other devices |
| PUT | `/admin/users/:uid/must-change-password` | `{must_change_password}`: require (or stop requiring) a new password at next login (admin). `POST /admin/users` and `PUT .../password` accept the same field |
| PUT | `/admin/users/:uid/password` | Set a password `{password}`; logs them out everywhere and unblocks (admin) |
| POST | `/admin/users/:uid/logout` | Log out everywhere (admin) |
| POST | `/admin/users/:uid/block`, `/unblock` | Block / unblock (admin) |
| DELETE | `/admin/users/:uid` | Delete an unused account (admin) |
| GET / POST | `/admin/campaigns` | List campaigns with members / create `{name}` (admin) |
| DELETE | `/admin/campaigns/:cid` | Delete a campaign from the database; its archive folder is kept and marked deleted (admin) |
| PUT | `/admin/campaigns/:cid/members/:uid` | Add to a campaign or change role/character `{role, character_name?}` (admin) |
| DELETE | `/admin/campaigns/:cid/members/:uid` | Remove from a campaign (admin) |
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
