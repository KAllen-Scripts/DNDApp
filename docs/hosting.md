# Running the server

Setting up, hosting and looking after the server on the host machine. The short version is in the [README](../README.md).

## Setup

Requires Node.js 22 or newer, and Claude Code logged in on this machine (it uses your Claude subscription).

```sh
npm install --ignore-scripts
npm rebuild onnxruntime-node protobufjs
npm run admin -- init "Admin" "admin-password"
npm start
```

Use `--ignore-scripts` (also when adding packages). A plain `npm install` makes npm 11 try to compile `better-sqlite3`, which fails without Python and C++ build tools, even though the package already includes prebuilt binaries. Details in [HANDOFF.md](../HANDOFF.md) under "Getting running on a new machine".

To use the Anthropic API instead of your subscription, copy `.env.example` to `.env`, set `LLM_PROVIDER=api` and add `ANTHROPIC_API_KEY`. Other settings (models, effort, limits) are in the same file.

When running through Claude Code, the server starts it with everything switched off except its own tools. That means no file or shell tools, no MCP servers or claude.ai connectors, no skills, plugins, hooks or CLAUDE.md files, and no saved sessions. Web tools are off too, with one exception: the DM's **Find online** (Creatures, and Items in the wiki) lets the AI use WebSearch and WebFetch, and nothing else, to look a creature or item up. AI usage counts toward your Claude Code limits.

`init` creates the **admin login**. The server listens on `http://127.0.0.1:4400`: open it in a browser and log in with that name and password.

## The public address

Players open **https://thepartyledger.fyi** (`www.` works too). `PUBLIC_URL` (default `https://thepartyledger.fyi`, can be changed in `.env`) is the only place the URL is set. The web page is served by this server and calls it with relative paths, so the page itself never needs the URL. The server prints it on start-up.

How the address reaches this PC (set up 2026-10-13):

- The domain is registered with **Cloudflare Registrar** (renews 2027-10-13) and its DNS is on Cloudflare (Free plan).
- A **Cloudflare Tunnel** called `thepartyledger` is managed from the Cloudflare dashboard (Zero Trust → Networks → Tunnels). It sends `thepartyledger.fyi` and `www.thepartyledger.fyi` to `http://127.0.0.1:4400` and answers anything else with 404. Both names are proxied CNAME records pointing at the tunnel.
- **`cloudflared`** is installed on this PC (winget package `Cloudflare.cloudflared`) and runs as the Windows service **cloudflared**, which starts with Windows. It only connects out to Cloudflare. Check it with `Get-Service cloudflared`; update it with `winget upgrade Cloudflare.cloudflared` (as admin).
- The zone redirects http to https ("Always Use HTTPS") and accepts TLS 1.2 or newer. The certificate is Cloudflare's free Universal SSL.
- **The server itself isn't a service.** The site only works while the server is running; when it isn't, players get Cloudflare's 502 page. `npm start` runs it in your terminal. `npm run restart` stops the running one (whichever way it was started) and starts it again in the background, so it keeps going after the terminal, the Claude Code session or the Claude app closes (on Windows it is created through WMI, so it isn't tied to whatever ran the command); its output goes to `data/server.log` (the run before is in `data/server-previous.log`). `npm run server:stop` stops it, and `npm run server:start` starts it only if it isn't running. Starting runs `npm install` first.
- The Cloudflare API token used for the setup lives in `API_key` at the repo root, which git ignores. Nothing needs it while the site runs; the tunnel uses its own token, stored in the service.

## Letting players in safely

The server is meant to run on your own PC with players reaching it over the internet through **Cloudflare Tunnel** (SPEC §3.4). Keep it that way:

- Keep `HOST=127.0.0.1`. `cloudflared` on the same PC connects out to Cloudflare, so nothing on your router is opened and players get https. Don't port-forward 4400 and don't set `HOST=0.0.0.0`: logins and passwords would cross the internet unencrypted. The server warns at start-up if `HOST` isn't local or `PUBLIC_URL` isn't https.
- If Windows asks whether Node.js may accept connections, say no (or private networks only). The tunnel doesn't need it.
- `TRUST_PROXY` (default `loopback`) lets the server see players' real addresses through a tunnel on this PC, for limiting password guesses. Leave it alone unless the proxy runs on another machine.

What the server does on its own: every page and API response carries security headers (the page only runs its own scripts, can't be put in a frame on another site, and sends no referrer); requests other than uploads are limited to 1 MB, and logins to 16 KB; 30 wrong passwords from one address in 15 minutes stop logins from there (as well as 10 per name); a login can hold at most 20 live connections (map moves, job progress), and those end as soon as the login is logged out, blocked or removed from the campaign; unexpected errors are logged, and people are only told something went wrong (no folder names from your PC); players see that processing failed, not why. The AI runs with no file or shell tools (see above), so a transcript, note or picture can't make it touch your PC. The exception to "no web tools" is Find online: Claude Code's WebFetch runs on your PC like the rest of Claude Code, and it hasn't been checked whether it can be pointed at addresses on your home network; what it reads only ends up in a DM-only stat block. The server's own download of the creature's picture is refused for anything but the public internet (`net/fetch-public.js`).

The first time a transcript is processed, the server downloads a small search model (~25 MB) into `data/models`.

## Recording sessions from Discord

If the group plays on Discord, the server's own bot can record the session and write the transcript; transcripts from anything else (a phone on the table, another program) are still uploaded the usual way. Discord sends each person's voice separately, so every line knows who said it, and people talking over each other doesn't garble it. **The audio never leaves this PC**: it's saved in `data/recordings/` and transcribed here (the owner, 2026-10-29).

**Setting it up (once, the host):**

1. At https://discord.com/developers/applications: **New Application** (e.g. "Party Ledger"), then **Bot** → **Reset Token**, and copy the token.
2. Put it in `.env` as `DISCORD_BOT_TOKEN=...` and restart the server. The log says `Discord bot: logged in as …`.
3. The DM's **Sessions** tab now has **Record from Discord** with an invite link. Whoever manages the group's Discord server opens it and adds the bot (it asks to see channels, join voice, send messages and change its own nickname).
4. On the Sessions tab, the DM picks the Discord server and voice channel.

**Recording:** the DM presses **Start recording** on the Sessions tab, or types `/record` in Discord (the bot joins the voice channel they're in). It posts that the session is being recorded and its nickname shows 🔴 Recording. Anyone can type `/norecord` to leave their voice out (again to be recorded). **Stop** or `/stop` ends it; it also stops by itself 5 minutes after everyone leaves, after 8 hours, or if Discord disconnects it. `/record` and `/stop` work for whoever manages the Discord server and for the DM once their Discord name is linked to their account (after the first recording's upload).

**After:** the recording is transcribed on this PC, and appears under **Record from Discord** with its progress. **Use for upload** puts its transcript into the upload form with the date it was played: the DM checks the session number and who's who (the names are Discord usernames, linked to accounts once and remembered), then uploads it like any transcript. **Delete** removes a recording and its audio (an uploaded transcript stays in the archive).

**Speech-to-text** (`TRANSCRIBE_ENGINE`):

- `local` (the default): Whisper large-v3-turbo through transformers.js. Nothing to install; the model (about 1 GB) downloads into `data/models` the first time. It runs on the CPU, which is slow for a long session (likely hours). `TRANSCRIBE_LOCAL_DEVICE=dml` tries the graphics card through DirectX on Windows.
- `whisper-cpp`: whisper.cpp's own program, much faster with an NVIDIA card (minutes for a session). Download a release from https://github.com/ggml-org/whisper.cpp/releases (the `cublas` build for NVIDIA) and a model such as `ggml-large-v3-turbo.bin` from https://huggingface.co/ggerganov/whisper.cpp, then set `WHISPER_CPP_BIN` (the `whisper-cli.exe` path) and `WHISPER_CPP_MODEL`.

Either way it's told the campaign's character names and glossary terms so it spells them right, and the glossary's fixes still run when the transcript is processed. Recordings cut off by a restart are transcribed when the server starts again.

Discord encrypts calls end to end (since March 2026); the bot uses `@discordjs/voice` 0.19.2 or later, which handles that. Discord never officially supported bots hearing calls, so if it ever stops working, upload transcripts from another recorder meanwhile.

## Data

Everything lives in `data/` (git-ignored):

- `data/archive/` is the permanent record: accounts, original transcripts, player notes (every version), character sheets (every change, plus uploaded files), character pictures, maps (the images or PDFs as imported, the pictures drawn for maps made in the creator, other pictures of them, token pictures, every change, and everyone's private pins), handouts, the DM's creatures, items and merchants (with recent sales), the DM's own map creator assets, the rests the DM called (`rests.jsonl`), the campaign's settings (`settings.json`), speaker map, glossary, DM corrections, and a snapshot of the knowledge base after every archivist run. **Back this folder up.**
- `data/dndapp.sqlite` is the working database. It can be rebuilt from the archive.
- `data/recordings/` holds Discord recordings (each person's speech as Ogg Opus files, and the transcript once written) until the DM deletes them. Not part of the archive: a recording becomes part of the campaign when its transcript is uploaded.

**Example data.** `DATA_SET=example` in `.env` runs the server on `data-example/` instead: a made-up campaign (The Lanterns of Saltreach) with accounts, sheets, a wiki, creatures, items, merchants and linked maps, seeded the first time it starts, plus four session transcripts to feed in. Remove the line to go back to the real data; the two folders never mix. See [example/README.md](../example/README.md).

## Rebuilding

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
