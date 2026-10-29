# The Party Ledger

**https://thepartyledger.fyi** · campaign memory for a D&D group.

Players log in, take private notes during a session and keep their character sheets. Afterwards the DM uploads the session transcript (or the app's Discord bot records it). An AI "archivist" reads everything and keeps its own record of the campaign: people, places, quests, debts, secrets, and who knows what. Anyone can then ask it questions and get answers that cite the session and timestamp, limited to what their character should know.

## What's in it

- **Ask**: questions about the campaign or the rules, answered from the sessions, notes and the group's rulebooks, with citations.
- **Notes**: private notes per session, read by the archivist.
- **Character sheets**: 5e sheets that work out the numbers, with spells, inventory, class features, rests, levelling up and sheet upload.
- **Dice**: rolled on the server, shown as 3D dice, with secret rolls for the DM.
- **Maps**: import a map or build one, with live tokens, fog of war, walls and line of sight, lights, heights, initiative, spell templates and attacks.
- **The DM's tools**: a campaign wiki (with AI-suggested updates the DM approves), creatures and NPCs, items and merchants, handouts, rests, and corrections for the archivist.
- **Sessions**: transcript upload, or recording straight from a Discord voice call, transcribed on the host's PC.

[docs/features.md](docs/features.md) walks through each of these.

## Running it

You need Node.js 22 or newer and Claude Code logged in on the machine (the AI runs on your Claude subscription; the Anthropic API works too).

```sh
npm install --ignore-scripts
npm rebuild onnxruntime-node protobufjs
npm run admin -- init "Admin" "admin-password"
npm start
```

Open http://127.0.0.1:4400 and log in as the admin to create campaigns and accounts. There's no sign-up: you make every account. Settings go in `.env` (copy `.env.example`).

Handy commands:

| Command | What it does |
|---|---|
| `npm run restart` | Restart the server in the background (logs to `data/server.log`) |
| `npm run server:stop` / `server:start` | Stop it / start it if it isn't running |
| `npm run admin -- list` | Show accounts and campaigns |
| `npm run admin -- set-password "Name" "password"` | Reset a password |
| `npm run rebuild -- --campaign 1 --yes` | Rebuild a campaign's knowledge from the archive (server stopped) |
| `npm test` | Run the tests (offline, fake AI) |

Everything is kept in `data/`. **Back up `data/archive/`**: it's the permanent record, and everything else can be rebuilt from it. `DATA_SET=example` in `.env` runs on a made-up example campaign instead ([example/README.md](example/README.md)).

## More

- [docs/hosting.md](docs/hosting.md): full setup, the public address (Cloudflare Tunnel), security, Discord recording, data and rebuilding, the transcript format.
- [docs/features.md](docs/features.md): how each part of the app works.
- [docs/api.md](docs/api.md): the server's API.
- [docs/testing.md](docs/testing.md): tests and regression tests.
- [SPEC.md](SPEC.md): the design. [HANDOFF.md](HANDOFF.md): current state, change log and next steps.

## Licences

Spell text in `packages/server/src/sheets/srd-spells.json` and the beast stat blocks in `packages/server/src/sheets/srd-beasts.json` are from the System Reference Document 5.1 by Wizards of the Coast LLC, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode), as prepared by the [5e-bits/5e-database](https://github.com/5e-bits/5e-database) project (MIT).

The 3D dice and their sounds are [@3d-dice/dice-box-threejs](https://github.com/3d-dice/dice-box-threejs) (MIT), which bundles [Three.js](https://threejs.org) and [cannon-es](https://github.com/pmndrs/cannon-es) (both MIT).
