# DNDApp — Project Spec

The design, and the source of truth: update it when a decision changes. This file is the core (what the app is, its architecture, data, the knowledge base and privacy); each feature's detail is in [docs/spec/](docs/spec/), read when working on that feature. The version history and the full text before the 2026-11-02 compaction are in [docs/archive/](docs/archive/README.md) (don't read it by default).

## 1. Overview

DNDApp is a campaign-memory tool for a D&D group.

1. During a session (played over Discord), players use the **web page** (served by the DNDApp server) to **take private notes**. Each note is sent to the server and archived immediately.
2. The session is recorded, and speech-to-text produces **one timestamped transcript**: from any recorder (a phone on the table, another program), or from the server's own Discord bot, which records each player's voice separately and transcribes it on the host's PC (§6.12).
3. The transcript is uploaded **with its session number and the date it was played**, by the DM on the **Sessions** tab of the campaign they're in (or through the API by an account with the `dm` role). The date is what ties it to the notes players took that day. The server archives it permanently. Then an AI **archivist** reads the transcript plus that date's player notes and updates the campaign's **knowledge base**. The archivist has full authority over the knowledge base and organises it however it judges best, including **who knows what**.
4. Each player keeps their **character sheet** on the web page (§6.4).
5. Players use the web page to **ask questions** ("How much do we still owe Brother Hal?"). Answers cite the session and timestamp, and only use what that player's character should know.

The app's two core functions are **asking questions** and **taking notes during the session**. A basic UI for both exists (§3.3); it will be refined with real use.

This is a personal project for a small group of friends. It is not sold and players don't pay for it.

**People and roles:**
- **Host / project owner (Kenny):** runs the server on his machine and owns the admin login (management only). He is **not** the DM. He plays through a separate, ordinary player account.
- **Admin login:** for managing the server (accounts, campaigns, roles, session uploads). It isn't in any campaign, so it can't ask questions or take notes. It passes DM checks in the API (that's how it uploads).
- **DM:** a separate person, with role `dm` in a campaign (set on the admin screen). The DM can do what's built, as this spec describes; more may come. The DM can't manage accounts.
- **Players:** role `player`. One account can be in several campaigns, with a different role and character in each.

Hard design problems:

- **Scale over time.** By session 200 the transcripts won't fit in any context window. Answers come from an AI-maintained knowledge base plus targeted search, never the whole history (§5).
- **Being able to start over.** Everything except the archive can be thrown away and regenerated from it (§4.3).
- **Who knows what.** Players miss sessions, get whispered secrets, and keep private notes. Q&A must not leak (§5.5), and campaigns must not mix (§5.4).

## 2. Constraints

- **All JavaScript.** Node.js for the server; a plain web page (HTML/CSS/JS, no build step) for players. Every response carries `X-Page-Version`, a fingerprint of the page's files and the modules it imports (`pageVersion` in `server/src/app.js`, live streams included); the page (`api.js`) reloads when it changes, after the person leaves any field they're typing in or the tab is hidden. Plain JS (ES modules), with JSDoc types where useful. npm packages are welcome.
- **Self-hosted.** The server runs on the host's own machine (Kenny's). No cloud backend of our own.
- **Thin client.** The web page only talks to the DNDApp server. It sends what players type (questions, notes, sheet edits) and displays results. It never processes, indexes or stores campaign data (only the login token, in the browser), and never calls the AI. One deliberate exception: the character sheet's rules (`packages/shared/src/sheet.js`, plain arithmetic) also run in the page so automatic values update while typing; the server runs the same file and stays the authority on what's saved.
- **Archive first.** Transcripts, player notes, DM corrections and accounts are archived as plain files and never modified. Everything else is derived and can be regenerated.
- **The AI owns the knowledge base.** No human reads it directly, so it doesn't need to be human-friendly. The archivist can create, restructure, merge and delete freely.
- **Claude via the host's Claude Code.** By default all AI work runs through Claude Code on the host (Claude Agent SDK), using the host's Claude subscription. The Anthropic API is a config switch away (§3.5).
- **Processing starts from a finished transcript file**, whatever made it. Recording is optional: the Discord bot (§6.12, owner 2026-10-29) is one way to get a transcript, never the only one. Its audio is transcribed on the host's PC and never sent elsewhere (owner, 2026-10-29).

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
    shared/src/   plain JS used by both the server and the page (the server serves every file here at /shared/<file> and the
                  page loads them from there, so these stay in one folder: a module's imports of its neighbours must work at that
                  address too; the package exports ./* for the server). clean.js (the str/int/newId cleaners the sheet modules share),
                  transcript.js (transcript parser), citations.js (the [S12 01:23:45] citation format),
                  sheet.js (character sheet rules), dice.js (dice notation and rolling),
                  map.js (map documents: tokens, pins, fog, initiative, templates, snapping and distances) re-exporting map-world.js
                           (places, maps inside maps, journeys, travel times, roads, random encounters), map-sight.js (walls and doors,
                           line of sight, lights, the players' fog mask) and map-height.js (raised areas, stairs, bridges, seeing over
                           edges, what moving across levels and difficult terrain costs),
                  map-design.js (maps made in the creator: the design, what can be in it (floors, walls, assets, paths, labels, the look),
                           the tools' changes, what a design gives the map),
                  map-art.js (drawing a design: floors, paths, walls, the look, lights, labels) with map-art-library.js and map-art-files.js (the CC0 art pictures), map-art-assets.js,
                           map-art-farm.js, map-art-temple.js, map-art-ships.js, map-art-furniture.js, map-art-dungeon.js,
                           map-art-outdoors.js (the assets' drawings), map-art-pieces.js and map-paint.js (drawing helpers),
                  map-generate.js with map-generate-kit.js and map-generate-more.js (starting maps made from a seed),
                  map-stamps.js (the stamps that come with the creator),
                  coins.js (prices in copper, paying from a purse with change),
                  rolls.js (what the sheet rolls: attacks, spells and equipped weapons with their modifiers),
                  gear.js (the inventory: PHB weapons and armour, what an item does when equipped, the equip rules, AC from armour,
                           weight and encumbrance, charges, attunement, magic item effects, typed attacks needing the weapon carried,
                           the Inventory's groups by kind),
                  point-buy.js (the sheet's point buy calculator: costs, 2014 race bonuses, 2024 chosen bonuses),
                  wild-shape.js (druids' Wild Shape: forms, uses, CR and speed limits by level and edition, form hit points, stats in a form),
                  class-features.js (the Class features box's rules: each class's uses, pools and numbers by level and edition, the player's own rows, rests, Flexible Casting, Arcane Recovery...),
                  subclass-features.js (the Player's Handbook's subclasses and their rows for the same box: Superiority Dice, Portent, Combat Wild Shape...),
                  subclass-features-books.js (other books' subclasses: Xanathar's, Tasha's, Fizban's, DMG 2014, Glory of the Giants),
                  race-features.js (racial traits with uses or numbers, and Xanathar's racial feats, for the same box),
                  settings.js (a campaign's settings: the weight rule, the rules edition, attacks from the map), calendar.js (the
                           campaign's calendar), level-up.js (levelling up), spell-slots.js (spending and giving back slots),
                  class-traits.js and subclass-traits.js (every class and subclass feature with a summary and how the sheet handles it),
                  feats.js (feats that change the sheet's numbers or rolls), attack-extras.js (what class features add to an attack
                           or spell: Weapon Mastery, Sneak Attack, Smite, Rage...), item-names.js (names the Inventory suggests),
                  bestiary.js (the DM's creatures: a kind of creature or a person, type and challenge),
                  attacks.js (attacks and area spells from the map: a sheet's and a stat block's actions and spells, the DM's own (custom), defenses, advantage, rolling, the log players get) with attack-riders.js (extra damage on a hit, like Sneak Attack) and spell-effects.js (what a spell does besides damage: conditions, how long it lasts, difficult terrain, targets; spells in play on a map and how they end),
                  wiki.js (wiki text: `:::for` / `:::dm` blocks, [[links]], who a part is available to), wiki-time.js (in-game times
                           read and written), wiki-templates.js (the starter templates)
    server/
      src/
        index.js          start-up
        app.js            the HTTP server: security headers, the login check, static and /vendor files,
                          live streams (SSE), who may see what (access, forViewer, attended); registers routes/
        routes/           the API, one file per part of the app, each `registerX(app, r)`:
                          accounts.js (login, own account, admin screen), campaign.js (members, speakers, glossary,
                          sessions, notes, corrections, the archivist's questions, jobs, Q&A, usage),
                          characters.js (sheets, character pictures), table.js (dice rolls, handouts, the campaign live stream),
                          rests.js (hit dice, short and long rests), level-up.js (levelling up; the DM giving levels),
                          maps.js (maps, fog, walls, lights, terrain, variants, links, places, travel, pings) with map-tokens.js (tokens and their pictures, pins), attacks.js (attacks and area spells from the map),
                          map-creator.js (maps made in the creator, starting maps, the AI draft, levels, the DM's own assets and stamps),
                          combat.js (initiative, spell templates), creatures.js (the DM's creatures, Find online),
                          companions.js (companions on the sheet), item-actions.js (Use on an item's action),
                          items.js (the DM's items: look up, Find online), merchants.js (merchants, stock, buying, placing on maps),
                          wiki.js (the DM's wiki: pages, history, View as) with wiki-viewer.js (players' wiki), wiki-overview.js,
                          wiki-boards.js, wiki-transfer.js (import, export), recordings.js (recording from Discord: link, start, stop, transcripts)
        context.js        wires everything together (tests pass a fake AI and embedder)
        config.js         all settings (env vars), PIPELINE_VERSION
        archive.js        archive files
        store.js          source data (archive first, then DB mirror): campaigns (create/delete), sessions, notes, corrections, restore
        auth.js           accounts, passwords, logins, must-change-password, memberships (accounts archived)
        jobs.js           background queue: ingest, correct, updates, rebuild
        images.js         one set of checks for every uploaded picture (maps get a higher pixel limit) and the
                          token-square / shrunk copies sent to the page
        library.js        the storage items, merchants and the map creator's assets and stamps share (a row per entry, the whole entry archived on each change)
        (everything else is in a folder by what it's for:)
        wiki/             the DM's wiki: store.js (pages: archived, restored, indexed per part with who may see it),
                          ai.js (the AI's proposals after each archivist run, approving them, drafting), views.js (the space's views
                          for one viewer), web.js, timeline.js, maps.js (pages linked to maps), embeds.js, boards.js, asof.js (the wiki
                          and maps at a moment), pictures.js, transfer.js (import and export)
        table/            what the table shares live: rolls.js (dice rolls: roll, log and send live; rolls made for something else,
                          like a hit die), handouts.js (handouts, archived and restored)
        creatures/        store.js (the DM's saved creatures, archived and restored), find.js (Find online)
        items/            store.js (the DM's items), find.js (look up: your items, the books, the AI; Find online),
                          merchants.js (stock, prices, sales, restocking after long rests)
        recording/        recording sessions from Discord (§6.12): discord-bot.js (the bot: /record, /stop, /norecord,
                          each voice saved separately), recordings.js (data/recordings, transcribing one at a time),
                          ogg.js (Ogg Opus files), audio.js (decoding to 16 kHz), engines.js (speech-to-text: local
                          transformers.js or whisper.cpp, always on this PC), transcribe.js (clips to "[HH:MM:SS] Name: text")
        net/              fetch-public.js (downloads from the public internet only, for Find online's pictures)
        db/               schema.sql + migrations (schema v21)
        llm/              providers: claude-code.js, api.js, common.js (operations: structured, agent, research); fit.js (tool
                          results from whole records, chunks and lines, never cut mid-way)
        kb/               store.js (knowledge-base records, journal), archivist.js (agent + tools), search.js (hybrid keyword +
                          vector search with per-viewer visibility; long text embedded in windows), embeddings.js (the local embedding model),
                          updates.js (sheet changes, late note changes and handouts for the archivist between sessions)
        pipeline/         prepare.js (speakers, glossary, chunking), ingest.js (attendance, indexing, archivist run)
        qa/               agent.js, tools.js, route.js (quick or full, no AI)
        sheets/           store.js (sheets, archived as diffs), rests.js (hit dice and rests on players' sheets; rests the DM calls),
                          editions.js (which rules a campaign plays by, 2014 or 2024: the DM's setting, else REST_RULES, else the books' Player's Handbook),
                          pictures.js (token and full pictures of characters; the AI's description), import.js (uploaded sheets), spells.js (lookup), forms.js (Wild Shape form lookup), review.js (Review sheet),
                          books.js + pdf.js (reading the books folder: spell headings, page search, contents), srd-spells.json (SRD 5.1 spells),
                          srd-beasts.json (SRD 5.1 beasts and the four elementals, for Wild Shape)
        maps/             store.js (maps and pins, archived; who sees what), assets.js and stamps.js (the DM's own pictures and stamps for the map creator), read.js (the AI's reading, measuring the grid, drafting and tidying walls),
                          design.js (drawing a map made in the creator into its picture) with design-draw.js (the drawing, in a worker thread), design-draft.js (the AI's draft of a map from a description or sketch),
                          fonts.js (the label fonts),
                          uvtt.js (walls from Universal VTT files, and maps as one), sight.js (players' line of sight and explored areas),
                          stats.js (AI stat blocks), pdf.js (drawing a PDF page), events.js (what happened on the maps, for the archivist)
        cli/              admin.js (init, set-password, list), rebuild.js
        example/          seed.js (the example campaign put in through the API, no AI), startup.js (seeding an empty example folder at start), region-map.js (its region map, painted)
      test/               offline tests (fake AI); fixtures/privacy-scenario/ = manual real-AI scenario
    web/
      public/     the web page, served by the server at / (no build step). index.html and icon.svg, then a folder per part:
                  page/       the frame every tab sits in: app.js (login, password, campaign picker, tabs, Ask, Notes), api.js (requests,
                              live streams, the login token), dom.js (making elements: h, svg, $; status-line messages), markdown.js (AI
                              text to safe HTML), look.js + page/look-boot.js (the Look dialog, applied before first paint), pick-login.js (Log in as,
                              on the example data), phone.js (the phone
                              layout's ☰ and ⋯ menus), page/topbar-fit.js, side-panel.js (a panel beside the map, Sheet window), page/pan-zoom.js, page/mini-views.js
                  styles/     style.css, themes.css, mobile.css (the phone layout)
                  admin/      admin.js (the admin screen)
                  campaign/   settings.js (the DM's Campaign settings) with backgrounds.js, calendar.js and levels.js; sessions.js (the DM's
                              Sessions tab: recording from Discord, transcript uploads); archivist.js (the DM's Archivist tab); table.js (the
                              campaign live stream: others' rolls, rests, the Handouts tab); rests.js (the DM's Rest dialog, rests arriving)
                  sheet/      sheet.js (Sheet tab) with inventory.js (the Inventory tab), spells.js (the Spells box), characters.js (the
                              player's characters above it), creation-help.js, background.js,
                              traits.js, attacks.js, class-features.js, wild-shape.js, companions.js, item-actions.js, level-up.js, fold.js
                              (options that open when asked)
                  items/      items.js (the DM's Items, shown in the wiki's space), merchants.js (the DM's Merchants and the shop players buy
                              from), item-card.js (an item's card)
                  creatures/  creatures.js (the DM's Bestiary tab), creatures/stat-block.js (the stat block dialog)
                  dice/       dice.js (tray, rolls) with deluxe.js, physics.js, shapes.js (the Deluxe roller) and effects.js
                  map/        map.js (Map tab: loading, drawing, tokens, selection, panning and zooming) with state.js (shared state),
                              fog.js (fog of war and the DM's fog tools), walls.js (walls, doors, terrain, raised areas, stairs, lights,
                              AI walls), pins.js, signals.js (pings and quick drawings), ruler.js (measuring), dm-tools.js (the DM's
                              tools), combat.js (turn order),
                              companions.js (a player's companions and summons), spell-templates.js, attacks.js (attacks and area spells:
                              the picker, targeting, the cards, the Attack log), full-screen.js, places.js (the world: places, the breadcrumb,
                              who sees a map or a place), world.js, travel.js, wiki-layers.js, wiki-link.js;
                              creator/ (the DM's map creator: creator.js, panel.js (its tools and tabs), start.js (starting a map, floors of a
                              building), art-loader.js)
                  wiki/       wiki.js (the Wiki tab), space.js (the wiki's own space and its addresses), data.js (what its parts share), page.js
                              (a page, drawn and edited), and the parts of a page (drawer, find, names, canon, compass, sources, handout, on-map,
                              embeds, character-sheet, lore, write, templates, asof, diff, panels: Items and Merchants moved into the space);
                              views/ (the whole-screen views: home, insights, wheel, atlas, web, timeline, boards, quests, knows, tidy, lists,
                              prep, waiting, transfer)
                  art/        the map art pictures
      test/       page tests in jsdom against a real test server (page.js), fakes for the dice libraries
  example/        the example campaign (owner, 2026-10-28): campaign/ (its data as JS: accounts, settings, sheets, creatures, items, merchants, maps, wiki),
                  pictures/ (public domain or CC0, credits.json), transcripts/ (four sessions to feed in, with a README), ask-checks.md, README.md
  docs/notes/     design notes, research and checklists from the first Claude project (README.md lists them)
  scripts/        restart-server.js (npm run restart); class-features-audit.js (writes docs/notes/class-features-audit.md); browser.js (real-browser checks: Playwright with the installed Chrome on a throwaway copy of data/, fake AI); art/ (build.js, picks.js, render-props.js: the map creator's CC0 art, see §6.6 Map art)
  docs/regressions.md  every bug found and fixed, and the `regression: …` test that keeps it fixed
  docs/hosting.md, features.md, api.md, testing.md  the detail behind the short README: setup and hosting, each feature for its users, the API, tests
  .claude/        Claude Code set-up: agents/regression-keeper.md (the worker that writes and checks regression tests),
                  settings.json + hooks/regressions.mjs (regression tests run before every commit touching packages/)
  SPEC.md  HANDOFF.md  README.md  AGENTS.md  CLAUDE.md
```

### 3.2 Server

- Node.js (22+; developed on 24) with **Fastify**.
- Native modules (`better-sqlite3`, `sharp`, `@napi-rs/canvas`, `onnxruntime-node`) must come prebuilt; the host isn't expected to have a compiler or Python. Install with `npm install --ignore-scripts`, because npm 11 otherwise tries to compile `better-sqlite3` (see HANDOFF "Getting running on a new machine").
- **SQLite** (`better-sqlite3`), one file. FTS5 for keyword search; vectors as blobs, searched by brute force in memory.
- One background job at a time, in order (the archivist builds each session on the last). Interrupted jobs resume after a restart.

### 3.3 Web page

Electron was dropped (owner's call: overkill, since there's a server and an address anyway). Players open the server's address in a browser.

- Static files in `packages/web/public`, served by the server at `/` (each file gets its own public route; everything else needs a login). Same origin as the API, so no CORS, and all API calls use relative paths: the page works at any address.
- **Login:** name + password set by the admin (§7). The token is kept in the browser's localStorage; a 401 sends the player back to the login screen.
- **Name, top bar, Markdown descriptions, Look, phone layout:** the site is **The Party Ledger**; the top bar keeps to one row in every theme (`page/topbar-fit.js`) with an ⚙ account menu; descriptions that are often Markdown show formatted (`markdown.js` `markdownEditor`); Look (themes, layouts, styles, per browser, `page/look-boot.js`, `themes.css`); the phone layout (`data-phone`, `mobile.css`, `phone.js`). Detail: [docs/spec/page.md](docs/spec/page.md).
- **Passwords:** if the admin requires it, a "Choose a new password" screen comes straight after login and can't be skipped (the server enforces it too). "Change password" in the account menu lets anyone change theirs at any time.
- **Campaign choice:** after logging in, someone in several campaigns picks one from a dropdown (last choice pre-selected); in one campaign, they go straight in. The choice holds for that browser tab (survives reloads; a new visit asks again). "Switch campaign" (beside the campaign's name, and in the ⚙ account menu; shown only to someone in two or more campaigns) goes back to the picker. Ask, Notes and past conversations all belong to the chosen campaign.
- **Admin screen** (admin login only, instead of Ask/Notes): accounts (add with the campaigns they can access, "Edit campaigns" to change that later, set password, require a new password at next login, log out everywhere, block/unblock, delete if unused), campaigns (each a colour-coded card; create with a unique name, delete with typed-name confirmation; add people as player or DM, change roles and characters, remove). Messages appear as a toast that's always on screen. Transcripts aren't uploaded here (the owner, 2026-10-28: the DM uploads them).
- **Sessions tab** (DM only, `sessions.js`): for the campaign the DM is in (owner, 2026-10-28: the DM already picks one at login, so the tab has no picker of its own; Switch campaign changes it): **Record from Discord** (§6.12), its uploads with processing status and Retry, player notes waiting for a transcript, and the upload form (number, date, title, file or paste, who's who). `GET /campaigns/:cid/sessions/overview` and `GET /campaigns/:cid/recordings` give it all, DM only.
- **Sessions in detail:** past uploads (number, date, title, matched player notes, attendance, status with progress; refreshed every few seconds while processing; Retry/Process when failed or unprocessed) and **dates with player notes but no transcript**. Upload form: session number (default next), date played (default the newest date with waiting notes, else today's note date), optional title, transcript file or pasted text. Choosing a transcript calls the preview, which lists each speaker name with an account dropdown (current link, or a guess from account/character names). On upload, links are validated before anything is archived, and merged into the speaker map before processing is queued, so attendance uses them. Warns about an existing number, a date another session already has, and unlinked names. The admin login is for management only and isn't in any campaign; an admin who plays uses a separate, ordinary player account (§5.5 applies to it like anyone else).
- **Player view:** ask questions (streamed answers, a status line while it searches, clickable citations that jump to the quoted transcript lines, follow-ups); **chats**: a list (drawer, or a sidebar in wide layouts) with Pinned and Recent sections and a filter; pin, rename or delete any chat. Deleting erases its questions and answers for good, but the bare `qa_log` rows stay so the hourly limit and usage figures still count them. Take notes (saved to today's session, listed by session date); character sheet (§6.4). Works on phones.
- **Rest** (§6.8): the DM gets a Rest button in the header (short or long rest for everyone or chosen players).
- **Dice** (§6.5): a Dice button in the player header opens the dice tray; rolls from the sheet; 3D dice over the page; results, and the table's rolls you may see.
- **Map** (§6.6): a Map tab. The DM imports maps (or a PDF page), places tokens, runs the fog, tracks hit points and conditions, and gets stat blocks and records; players see shown maps, move their own token and keep private pins; changes are live.
- **DM tabs:** for someone with the `dm` role, the **Bestiary** (once Creatures) replaces the Sheet tab (the DM has no character sheet: no Sheet tab, no Sheet window, and the server refuses `/sheet` for the `dm` role; §6.6), an Archivist tab holds the archivist's open questions and the DM's corrections (§4.1). Players have an Inventory tab instead (§6.4), which the DM doesn't. All of them can go beside the map too. **Items and Merchants aren't tabs** (owner, 2026-10-28): they're views of the DM's wiki space, **Items** (`#/items`) and **Merchants** (`#/merchants`) on its rail (`wiki/panels.js`). As the Atlas does with the map, the page itself is moved into the wiki's main area (the page list hidden) and put back on leaving, so it keeps everything it does; Put on the map goes to the Map tab. They don't go beside the map or pop out any more, and a saved Look that named them (tab order, the tab to open on) drops them. A player's wiki has neither.
- **Handouts tab** (§6.7) for everyone.
- **Wiki tab** (§6.11): the DM's whole wiki; a player's tab shows only the parts available to them (since stage 6a).
- **Not built yet: more DM / host features** (split between DM and host to be decided with the DM role): glossary editing; a full speaker-map editor (links are currently set while uploading). Transcript upload is the DM's Sessions tab.
- On each `turn` event from `/ask`, replace displayed text rather than appending.

### 3.4 Networking

**Decision: Cloudflare Tunnel** with a cheap domain, using Cloudflare's free plan. The domain is **`thepartyledger.fyi`** (owner's pick, 2026-10-13, instead of the numbers-only `.xyz` first planned), registered with Cloudflare Registrar. A tunnel managed from the Cloudflare dashboard sends it and `www.` to `http://127.0.0.1:4400`; `cloudflared` runs on the host as a Windows service; the zone forces https (docs/hosting.md, "The public address"). No extra gate in front of the site (owner, 2026-10-13: the app's own login is enough; Cloudflare Access would have been the built-in one). `cloudflared` on the host connects out to Cloudflare: no port forwarding, no static IP, home IP hidden. The server listens only on `127.0.0.1`. Every request except `/health`, `/login` and the web page's files needs a login. **`PUBLIC_URL`** (config/`.env`) is the single place the public address is set; it's a placeholder until the domain is bought. HTTPS JSON plus SSE for job progress and streamed answers.

Hardening (2026-10-07 audit): every response carries a Content-Security-Policy (own scripts only, no framing), `X-Frame-Options`, `nosniff`, `Referrer-Policy: no-referrer` and, with an https `PUBLIC_URL`, HSTS. Bodies are limited to 1 MB except upload routes (`MAX_UPLOAD_MB`). Logins are limited per name and per address (`TRUST_PROXY=loopback` so the tunnel's forwarded address is believed). Live streams are capped per login and re-check the login and membership with every update and keep-alive. Unexpected errors (file system, database, programming) reach people only as a general message; processing errors reach players only as "failed".

Rejected: Tailscale (each player installs it), port forwarding (CGNAT, exposes home IP), SSH (would give players host access).

### 3.5 AI providers and models

All AI calls go through `src/llm/` (operations: `structured`, `agent`, `research`). Two providers, chosen with `LLM_PROVIDER`:

| Provider | How | Notes |
|---|---|---|
| `claude-code` (default) | Claude Agent SDK runs Claude Code locally on the host's subscription | Shares the host's Claude Code limits. `ANTHROPIC_API_KEY` is removed from its environment. |
| `api` | Anthropic SDK, per-token billing | Refusal fallback, prompt caching, monthly spending cap. |

**Claude Code lockdown** (every run): no built-in tools (files, shell, web); no user/project settings, hooks, CLAUDE.md, skills or plugins; no MCP servers or claude.ai connectors; `permissionMode: 'dontAsk'`; no saved sessions. The only tools are the server's own, as an in-process MCP server. **One exception:** `research()`, used by the DM's Find online for creatures and items (§6.6, §6.9) and by a sheet review's `look_up_online` tool (§6.4: a question the AI writes about a rule, at most `SHEET_REVIEW_WEB_LOOKUPS` per review), allows Claude Code's WebSearch and WebFetch and nothing else (with the API provider, Anthropic's server-side web search and fetch tools). WebFetch runs on the host like the rest of Claude Code; whether it can be pointed at addresses on the home network hasn't been checked. What it reads ends up only in a DM-only stat block, and the server's own picture download is limited to the public internet (`net/fetch-public.js`).

| Task | Model | Effort | Tool-call cap |
|---|---|---|---|
| Archivist | Claude Opus 5.5 | high | 500 per run |
| Q&A | Claude Opus 5.5 | medium | 12 per question |
| Sheet upload (`import`) | Claude Opus 5.5 | medium | none (one structured call, file attached) |
| Spell from a book or memory (`spells`) | Claude Opus 5.5 | low | none (one structured call) |
| Reviewing a character sheet (`review`) | Claude Opus 5.5 | medium (`EFFORT_REVIEW`) | 16 per review (`SHEET_REVIEW_MAX_TOOL_CALLS`), 3 of them web lookups (`SHEET_REVIEW_WEB_LOOKUPS`) |
| Reading an imported map, a creature's stat block, looking up an item, Find online for creatures and items (`maps`) | Claude Opus 5.5 | medium | none (one structured call each; the map's image attached), except Find online (a web research run, then one structured call) |
| Drafting walls, doors, lights and terrain (`walls`) | Claude Opus 5.5 (`MODEL_WALLS`, else the maps model) | xhigh | none (a draft and a checking call; close-ups on big maps: 2 to 10 calls) |
| Drafting a whole map in the map creator from the DM's description or sketch (`design`) | Claude Opus 5.5 (`MODEL_DESIGN`, else the maps model) | high (`EFFORT_DESIGN`) | none (one structured call, the sketch attached) |

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

**Player notes**: free text, private to the author. Each note has a `session_date`: today by default, and notes written before 06:00 count towards the previous day. A note links to the session uploaded with the same date. The author can edit or delete a note; the archive keeps every version (an edit or delete is a later line with the same id), and changes made after the session was processed reach the archivist between sessions (§5.2).

**DM corrections**: plain words ("the innkeeper is Brother Hal, not Hall"). Answering one of the archivist's questions creates a correction. The DM writes both on the Archivist tab.

**Character sheets** and **handouts** also reach the archivist, between sessions (§5.2).

### 4.2 Tables

| Table | Kind | Purpose |
|---|---|---|
| `campaigns`, `users`, `memberships` | source | Campaigns (unique name), accounts (unique name, scrypt password hash, `must_change_password`), role + character per campaign. |
| `speakers`, `glossary` | source | As above. |
| `campaign_settings` | source | The DM's settings per campaign (JSON, §6.10); no row means the defaults. Schema v15. |
| `sessions` | source | Number, date played, checksum, processing status, when it was last processed (`processed_at`, schema v11). |
| `player_notes` | source | Private notes with author and session date; `edited_at`, `deleted_at` (schema v11). |
| `character_sheets` | source | Each player's characters per campaign, one sheet each (JSON), keyed by the player's character `number` (1, 2, …), with a version that goes up on each save; `active` marks the one they play now (at most one per player: a unique index), `activated_at` when it last became active, `deleted_at` when the player deleted it (hidden, kept). Players only (the server refuses the `dm` role; sheets a DM saved before 2026-10-08 stay but are ignored). Schema v5; several characters since v20 (each sheet before became its player's character 1, active). |
| `maps` | source | Maps the DM imported (JSON: image, source page, grid, scale, fog, tokens, shown), with a version. Schema v7. |
| `map_pins` | source | Each person's private pins on a map (JSON list), only ever sent to them. Schema v8. |
| `map_explored` | operational | Which parts of a map each player has seen (line of sight with Remember explored). Database only, not archived: a rebuild forgets it. Schema v10. |
| `character_pictures` | source | Which token picture and full picture each of a player's characters uses (JSON; the files are in the archive), by character `number` (v20). The active character's are the ones in use. Schema v9. |
| `handouts` | source | Handouts the DM gave (JSON: title, text, picture, `to`: "everyone" or user ids, removed). Schema v11. |
| `creatures` | source | The DM's saved enemies and NPCs (JSON: name, kind, size, colour, max HP, AC, darkvision, speed, stat block, picture, record link, notes, `source` when found online, `finding` while the AI searches, removed). Schema v12. |
| `items` | source | The DM's items (JSON: name, kind, rarity, attunement, usual price in copper, weight, description, notes, picture, `source`: dm, book, ai or web, `finding` while the AI searches, removed). Schema v14. |
| `map_assets` | source | The DM's own pictures for the map creator (JSON: name, picture, its size in pixels, what it blocks by default, removed). Schema v16. |
| `map_stamps` | source | The DM's own stamps for the map creator (JSON: name, `clip`: the floor, walls, assets, paths and labels of a rectangle of squares, removed; at most 200). Schema v17. |
| `wiki_proposals` | source | The AI's proposed wiki changes (JSON: action new_page / update_section / add_section / reveal, the page and section, proposed sections with who each is available to, players for a reveal, reason, run; status pending / approved / rejected / replaced). Schema v19. |
| `wiki_chronicle` | derived | How far the AI has read `kb_journal` for the wiki. Schema v19. |
| `wiki_pages` | source | The DM's wiki pages (JSON: title, aliases, kind, parent, tags, `available`, sections with heading, text, `by`, `available`; version, removed). Schema v18. |
| `wiki_boards` | source | Boards: the DM's and each player's canvases of cards and arrows (docs/spec/wiki.md, stage 10). Schema v21. |
| `merchants` | source | Merchants (JSON: name, description, notes, colour, picture, open, `stock`: lines of item, price, qty, restock level; `restock`: every N long rests and the count; the last 50 `sales`, removed). Schema v14. |
| `rests` | source | Short and long rests the DM called (JSON: kind, when, by, edition, the players in it, who got nothing from it). Schema v13. |
| `corrections` | source | DM corrections with `after_session` (where to replay them in a rebuild). |
| `attendance` | derived | Who was at each session. |
| `kb_records` | derived | The archivist's knowledge base (§5.1). |
| `kb_journal` | derived | Every knowledge-base change, with the run and reason. |
| `dm_questions` | derived | Questions the archivist left for the DM. |
| `archivist_marks` | derived | How far the archivist has read sheet changes, late note changes and handouts (`updates_until`). Schema v11. |
| `docs` (+ `docs_fts`) | derived | Search index: transcript chunks, knowledge-base records, player notes, each with `visible_to`. |
| `logins` | operational | Logged-in browsers (hashed tokens, last used). Not archived. |
| `jobs`, `llm_usage`, `conversations`, `qa_log` | operational | Queue, AI usage/timing, Q&A history. |
| `rolls` | operational | Dice rolls with who rolled, label, result and who may see them (`party`, `dm`, `self`). Not archived. Schema v11. |

### 4.3 Archive, restore and rebuild

The server runs on one data folder: `data/` (`DATA_DIR`) normally, or with `DATA_SET=example` (owner, 2026-10-28) `data-example/` (`EXAMPLE_DATA_DIR`), which it seeds with the example campaign the first time it starts there (`src/example/`). The two never mix; only the embedding model (`models/`) is shared, from the real folder. The example holds nothing from play (no sessions, notes, knowledge base, proposals, handouts given, rolls or rests): that comes from feeding its transcripts in.

Beside the archive, `data/recordings/` holds Discord recordings until the DM deletes them, and each campaign's Discord bot key (`keys.json`, a secret, so never archived) (§6.12). They aren't archived or restored: a recording becomes part of the campaign when its transcript is uploaded.

```
data/archive/
  _server/accounts.json                users incl. password hashes (passwords survive DB loss)
  <campaign>/
    campaign.json, members.json
    speakers.json, glossary.json      (+ history/)
    settings.json                     the DM's campaign settings, with when they changed (+ history/)
    corrections.jsonl                 append-only
    player-notes/<YYYY-MM-DD>.jsonl   append-only; an edit or delete is a later line with the same id
    character-sheets/<user id>.jsonl  append-only: each save's changes to the player's first character (first line = whole sheet)
    character-sheets/<user id>-<n>.jsonl  the same for their character number n (2, 3, …)
    character-sheets/<user id>.characters.jsonl  append-only: which character is active and which are deleted (the whole record each time; none for a player with one character)
    character-sheets/uploads/         uploaded sheet files, as uploaded
    characters/<user id>/<file>       a player's token and full pictures, as uploaded
    characters/<user id>/pictures.jsonl  append-only: which pictures are in use (the whole record each time); pictures-<n>.jsonl for character n
    maps/<id>/image.<ext>             a map the DM imported, as uploaded (or drawn from its design, for a map made in the creator)
    maps/<id>/image-r<n>.webp         a map made in the creator, drawn again each time it's saved again (the older ones stay)
    maps/<id>/changes.jsonl           append-only: each change to that map (first line = whole map)
    maps/<id>/source.pdf              the PDF, when the map is a page of one
    maps/<id>/variant-<v>-original.<ext>  another picture of the map, as uploaded (+ variant-<v>.<ext>, stretched to the map's size)
    maps/<id>/pins/<user id>.jsonl    append-only: someone's private pins on that map (the whole list each time)
    maps/<id>/tokens/<file>           a picture the DM gave an NPC or enemy token, as uploaded
    handouts/<id>/<picture>           a handout's picture, as uploaded
    handouts/<id>/changes.jsonl       append-only: the whole handout after each change
    wiki/<id>/changes.jsonl           append-only: the whole wiki page after each change (its history)
    wiki/proposals.jsonl              append-only: the AI's proposed wiki changes, the whole proposal after each change
    creatures/<id>/<picture>          a picture for one of the DM's creatures, as uploaded
    creatures/<id>/changes.jsonl      append-only: the whole creature after each change
    items/<id>/<picture>              a picture for one of the DM's items, as uploaded
    items/<id>/changes.jsonl          append-only: the whole item after each change
    merchants/<id>/<picture>          a merchant's picture, as uploaded
    merchants/<id>/changes.jsonl      append-only: the whole merchant (stock, prices, recent sales) after each change
    map_assets/<id>/<picture>         one of the DM's own pictures for the map creator, as uploaded
    map_assets/<id>/changes.jsonl     append-only: the whole asset after each change
    map_stamps/<id>/changes.jsonl     append-only: the whole stamp (one of the DM's own, for the map creator) after each change
    rests.jsonl                       append-only: each rest the DM called
    sessions/0001/transcript.txt      read-only, sha256 in meta.json
    outputs/v<PIPELINE_VERSION>/<timestamp>-<run>/report.json, journal.json, knowledge_base.json, questions.json
    deleted.json                      only if the admin deleted the campaign (restore skips it; nothing else is touched)
```

- **Deleting a campaign** removes it and everything derived or mirrored from it from the database (foreign-key cascades), but never touches the archive: the folder gets `deleted.json` and restore skips it. New campaigns never reuse an existing archive folder's slug. Undo by hand: remove the marker, restart, rebuild.
- A transcript can never be replaced (different bytes for an existing session number → 409).
- **Restore:** on start-up, accounts, campaigns, members, campaign settings, sessions, speakers, glossary, corrections, notes (with their edits and deletes), character sheets and maps (both replayed from their change lines), character pictures, handouts, the DM's creatures, rests the DM called, items, merchants, the DM's map creator assets and stamps, and private map pins missing from the database are restored from the archive, and notes are re-indexed. Then run a rebuild to regenerate the knowledge base.
- **Rebuild:** `npm run rebuild -- --campaign <id> --yes` (or `POST /rebuild`) wipes all derived data, re-indexes notes, then replays every session in order, each correction right after the session it was made against. Sheet changes and handouts are read in time order between the sessions (those from before a session's day, before it; the rest at the end). The archivist is non-deterministic, so a rebuild gives an equivalent knowledge base, not an identical one.
- Bump `PIPELINE_VERSION` (now 23, since the AI proposes wiki changes, 2026-10-21) when prompts, tools or the memory design change.

## 5. Knowledge base and Q&A (core design)

### 5.1 Knowledge base records

Each record has: free-form `kind`, `title`, `body` (free text), `data` (free-form JSON), `status`, `tags`, `sources` (citations), `known_by` (NULL = everyone, or a list of user ids), `pinned`, and first/last session. The archivist chooses the kinds and conventions, and records them in a **guide** (a reserved record) that it reads at the start of every run and that Q&A sees too.

Limits: 8,000 tokens per record (`KB_MAX_RECORD_TOKENS`; past it the archivist splits the record, and is told never to shorten one); pinned records share a 6,000-token budget, since they go into every question. Violations come back to the archivist as errors it can fix.

**Nothing is cut short** (owner, 2026-10-14). Every tool result for the archivist and for Q&A is built from whole pieces (records, transcript chunks, transcript lines, list lines) up to a size (`fit.js`): the first piece always comes whole, and the pieces that don't fit are named at the end with the tool to fetch them; `list_records` pages with `offset`, `read_transcript` stops at a whole line and says where to continue. The archivist's budget is `ARCHIVIST_MAX_TOOL_RESULT_TOKENS` (24,000), Q&A's `QA_MAX_TOOL_RESULT_TOKENS` (5,000). Claude Code's own limit on a tool result is raised (`MAX_MCP_OUTPUT_TOKENS`) so it never cuts one either.

**Search over long text.** The local embedding model reads only the first ~256 words it's given, so every search doc (record, transcript chunk, note) is embedded in overlapping windows of 150 words (each with the doc's title), stored end to end in its `embedding`, and a doc scores by its best window. Docs embedded the old way (tagged with the bare model name) are embedded again in the background on start-up (`search.reembedStale`).

In the first real run, it created kinds `summary`, `session`, `pc`, `npc`, `faction`, `place`, `item`, `debt`, `quest`, `clue`, with statuses such as `owed / partially paid / paid` for debts.

### 5.2 The archivist (processing)

Per session (job `ingest`):

1. Parse, apply speaker map and glossary.
2. **Attendance**: accounts linked to transcript speakers who spoke, plus anyone who took notes that day, plus DMs. If no speaker is linked to an account, everyone is assumed present (and the archivist is told so).
3. Chunk and index the transcript. Chunks are visible only to attendees.
4. **Archivist run** (agent). It gets the roster (user ids, names, characters, transcript names), its guide, pinned records, record counts, open DM questions, the session number/date/attendance, that date's player notes (author + time written), and the full transcript (up to 200k tokens; longer ones are read in parts with `read_transcript`).
5. Snapshot the run (report, journal, full knowledge base, questions) to the archive.

Per DM correction (job `correct`): the archivist gets the correction and its state, and applies it.

Between sessions (job `updates`, `kb/updates.js`; owner's request, 2026-10-08): the archivist gets
- **character sheets**: a new sheet in full (what the player entered, plus the numbers worked out from it, every text field whole, each item with its description, inspiration, hit dice spent, death saves, spell slots used, and the text of the player's own spells), then each change since it last read that sheet, with the time it was saved (`[2026-10-08 14:03] classes[Fighter].level: 3 → 4`). Saves of the same field within 10 minutes count as one change; a field changed and changed back is no change. Read from the archive, which keeps every save with its time, so a rebuild sees the same changes.
- **late note changes**: notes written, edited or deleted after their session was processed (an edit says what it said before; a delete says to drop what only that note supported). Everything comes in full; a long text that changed (a note, a backstory) gives the lines that changed, word for word, and the line before them, rather than the whole text twice. Notes for sessions not processed yet wait for the session.
- **handouts** given, changed or taken back, with who got them. The archivist can't see pictures, so each handout picture is first read by the AI (`handout:picture`, the `import` task: any writing word for word, then everything it shows in full detail, kept in memory so a picture is read once per server run); if that read fails, the whole run fails and is tried again later, so no handout is skipped.
The job runs once nothing has changed for `ARCHIVIST_UPDATES_DELAY_MINUTES` (default 10), so filling in a sheet is one run, not one per keystroke; anything left from before a restart is picked up on start-up. With nothing new, no AI call is made. A mark (`archivist_marks`) says how far it has read. The archivist is told sheets are private to their player (anything only on a sheet stays known by that player, unless play shows others know it) and handouts are known by the players who got them.

**Archivist tools** (full write access): `search_kb`, `list_records`, `get_records`, `create_record`, `update_record`, `delete_record`, `update_guide`, `ask_dm`, `search_transcript`, `read_transcript`, `read_player_notes`. Every write needs a reason and is journalled.

**Instructions, in summary:** track everything useful, especially anything with changing state (debts, promises, quests, inventory, status, relationships); **be thorough**: archive every detail the sources give, not a summary (names and spellings, numbers, prices, who said what, descriptions, what was tried), with anything that may matter in its exact words (deals, oaths, prophecies, riddles, inscriptions, letters) kept word for word, since size is not a concern; **never lose information** when updating, merging, splitting or restructuring, and keep the history of changed states; split a record that nears the size limit rather than shortening it; go through the material start to end and check it again before finishing; update rather than duplicate; merge, restructure and delete freely; cite sources; keep pinned records short (they point to the full records); DM narration and corrections are authoritative; player notes are perspective, not fact; ask the DM about conflicts it can't resolve rather than guess.

### 5.3 Q&A

0. **Two ways of answering** (owner, 2026-10-21). Before any AI call, `qa/route.js` decides by rules alone (no AI): **quick** for a general D&D lookup, **full** for everything else. Quick needs a D&D signal (a rules word such as spell, item, condition, stat block, "dnd", or the shape "what is a…", "what does … do", "how does … work") and nothing pointing at the campaign: no "we", "our", "party", "session", "the DM" and the like, no first person outside rules phrasing ("can I", "do I" are rules questions; "my character", "what did I" aren't), no who / where / when / why, nothing in the past tense, and no name of a record, wiki page, character or (for the DM) saved creature **that this asker can see** (so the way a question is answered gives nothing away). A follow-up in a conversation answered the full way stays full. When unsure, full. The quick way runs **the same model** at `EFFORT_QA_QUICK` (default `low`; the full way stays at `EFFORT_QA`, `medium`), with at most `QA_QUICK_MAX_TOOL_CALLS` (4) lookups, a shorter prompt without the archivist's guide or pinned records, a pre-search of the records and wiki only (`QA_QUICK_PRESEARCH_TOKENS`, 1,500), the books only when the exact wording or numbers matter, and a short answer. A quick answer on the page has **Look it up properly**, which asks the same question again the full way (`mode: 'thorough'`); `mode: 'quick'` forces the quick way. `qa_log.path` records which way each answer went. **Which model** (owner, 2026-10-28): after the automatic search, `pickModel` (`qa/route.js`, no AI) sends the quick way, and a full-way question that names a record or wiki page the automatic search put in front of the model, to the faster model (`MODEL_QA_FAST`, default `claude-sonnet-5-5`; `off` for `MODEL_QA` everywhere); everything else (nothing named, or the search didn't bring its record) and every `mode: 'thorough'` go to `MODEL_QA`. The faster model keeps every tool. Its full-way answers also carry **Look it up properly** ("Quick answer from the records"). An AI deciding this would cost a call of its own, so it's rules only. While the books are still being read after a restart, a quick question doesn't wait for them (it's answered without them); a full one does.
1. **Pre-search** (free): the server searches the knowledge base, transcripts and the asker's own notes for the question and sends the results with it: the best of each kind first, then the next best, each whole (never cut), up to ~5,000 tokens (`QA_PRESEARCH_TOKENS`), then the names of what else matched.
2. **System prompt**: rules, who is asking, the archivist's guide, and pinned records the asker may see. The model first decides whether the question is **general D&D knowledge** (rules, spells, a standard creature's stat block) or **about this campaign**. General questions are welcome and answered straight from the model's own 5e knowledge with no tool calls (noting any house rule the pre-search turned up); campaign questions are researched and answered only from the sources.
3. **Tools** (read-only, filtered to the asker): `search_kb`, `list_records`, `get_records`, `list_sessions`, `search_transcript`, `read_transcript`, `search_my_notes`.
3a. **The group's books** (only when `BOOKS_DIR` has PDFs; they're listed in the system prompt with the year each was first printed, read from its credits page, and their page ranges): `search_books` (1–8 terms the model writes itself, not the player's sentence; keyword search over the page text held in memory, rarer terms and pages matching several terms rank higher, a heading counts double and a heading that is the term counts most (capitalised lines, the PDF's bookmarks, and short lines compared without spaces for headings the OCR split), terms of 3 letters or fewer match whole words only, longer ones the start of a word, OCR mix-ups and line-end hyphens are folded; returns up to 8 pages with a snippet; an unknown or ambiguous book name is an error naming the books), `read_book` (1–2 pages, never cut short), `book_contents` (the PDF's bookmarks, else the capitalised headings on each page; when too long for a tool result, the deepest levels are dropped first). PDF text is joined by position, so an OCR layer's word pieces read as words. Pages are numbered as printed when the page numbers can be read (lines that are only a number, else numbers in running headers and footers; a consistent offset from the PDF's numbering), else by PDF page. Titles are the file name up to any " -- " (downloaded files' extras). No database and nothing stored: the text is read from the PDFs at start-up; a PDF with mostly empty pages is logged as needing OCR. With books, **every rules question asked the full way is looked up in them** (the quick way only when the wording or numbers matter, item 0) (rules, conditions, spells, features, items, tables, stat blocks): search in the first turn, read the page before answering, follow index hits, and say so when the books don't cover it (then answer from memory). Editions: books first printed 2024 or later use the 2024 rules, earlier ones the 2014 rules; never mixed in one answer; the group's edition is the campaign's setting when the DM has chosen one (§6.10), else taken from their Player's Handbook (both or neither: what the records say, else the campaign's fallback edition from `editions.js`, and the answer says so in a few words). The edition is always stated in the prompt, both ways, with or without books, and **answers are for that edition only**: the model doesn't say how the other edition differs or compare them unless the player asks (owner, 2026-10-21). When the edition is known for sure (the DM's setting, `REST_RULES`, or one Player's Handbook), `search_books` leaves out the other edition's books (books of no known edition stay in) and searches them all only when that finds nothing; a book named in the call is always searched. Vague questions: it works out which rule is meant, searches with the book's terms plus synonyms, searches again or browses the contents if that misses, and asks when it can't tell. Book pages are cited as `(Player's Handbook p. 195)`; they aren't campaign sources, so there's no `[S…]` citation or evidence for them. The books aren't campaign data, so everyone in any campaign may search them.
3b. **The DM's creatures** (owner's request, 2026-10-09; only when the asker's role is `dm`): the system prompt lists the DM's saved creatures (name, kind, whether it has a stat block) with the rule that a saved creature of that name is the DM's own version and beats the books, the records and the model's knowledge; creatures named in the question ("Goblin 3", "goblins" match "Goblin") are put in full after the question (`<my_creatures>`); `get_my_creatures` gives others in full (stat block and where it came from, hit points, size, speed, darkvision, the DM's notes). Players never get the list, the block or the tool.
3c. **The DM's wiki** (§6.11; only when the asker can see some of it): `search_wiki` and `read_wiki_page`, and the pre-search includes wiki parts. The DM gets every part, marked with who it's available to; a player gets only the parts available to them, found by title only (other names can be secrets). Text always comes from the page as it is now, filtered for the asker, never from the search index. Cited as (wiki: Page title). A player with nothing available gets no tools and no mention of a wiki.
4. **Answer** with citations `[S12]`, `[S12 01:23:45]`, `[S12 01:23:45-01:24:10]`. Evidence (the cited transcript lines) is attached server-side, only for sessions the asker attended.
5. Follow-ups include the last 3 Q&As and the last answer's sources.
6. **Formatting:** answers are markdown, optionally with HTML (tables, stat blocks with `class="stat-block"`). The page renders them with `marked` and sanitises with DOMPurify to an allowlist (no links, images, scripts or style attributes), then turns citations into buttons, including inside tables. Stat blocks and records on the Map and Creatures tabs go through the same cleaner (`web/public/page/markdown.js`). Both libraries are served from `node_modules` at `/vendor/marked.js` and `/vendor/purify.js`.

Streaming events (`POST /campaigns/:cid/ask` `{question, conversationId?, mode?}`, SSE): `conversation`, `turn`, `tool`, `text`, `done` (with `path`: `quick` or `full`, and `fast`: whether the faster model answered), `error`.

**Timings** (2026-10-21): every answer writes one line to the server log (`data/server.log`): `Ask answered (quick) in 4100 ms` with `ask: {path, why, effort, model, model_why, system_chars, prompt_chars, prep_ms, books_wait_ms, first_turn_ms, first_text_ms, turns, tools: [{name, at_ms, ms}], total_ms}`. No question text (it can be private). Research and measurements: [docs/notes/ask-speed.md](docs/notes/ask-speed.md).

**Claude Code's start-up** (the default provider): every AI call starts a Claude Code process. It's started with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` (no telemetry, error reports or update checks), which took ~2.9 s → ~0.65 s to the point where it's ready, measured 2026-10-21; `CLAUDE_CODE_QUIET_START=off` turns it off.

### 5.4 Campaigns are separate

Every campaign has its own sessions, transcripts, knowledge base (and archivist guide), player notes, speaker map, glossary, corrections, DM questions and conversations. Every query is scoped by `campaign_id`; knowledge-base records are fetched with `id AND campaign_id`, so even a wrong id can't reach another campaign. Speaker links (on upload and in the speaker map) only take accounts in that campaign. Q&A only runs for a member of the campaign it was asked in, and the prompt names that campaign and the asker's character in it. A test asks in a second campaign with every tool and checks nothing from the first appears.

### 5.5 Privacy (primitive version)

Who-knows-what is decided by the archivist and enforced by the server:

| Data | Who can see it |
|---|---|
| Knowledge-base record | Its `known_by` (NULL = every member). DMs see all. |
| Transcript (search, read, evidence, `/transcript` endpoint) | Attendees of that session. DMs see all. |
| Player note (search, list) | **Only its author**, not even the DM. |
| Character sheet | **Only its player** on the page and through the API, not Q&A directly. A player's other characters (not the active one) too: only they list or open them (`GET /characters`); everyone else, the DM included, sees only the active character (2026-10-21). The DM sees only the parts in the Inventory row below (owner, 2026-10-10) and, on maps, a character's hit points like everyone in the party (§6.6). The DM has no sheet of their own (Creatures instead), and a DM sheet left from before is never sent to the archivist. The archivist reads it (§5.2) and keeps what's only on a sheet `known_by` that player, so Q&A can answer the player from it; but DMs see every record, so the DM can learn sheet details through Q&A (same as notes, below). The admin login has none. |
| Dice roll | Party rolls: everyone in the campaign. "Only the DM": the DM and whoever rolled (the DM's own is a secret roll). "Only me": whoever rolled. |
| Character level (Levelling up) | The DM sees each player's active character's name, classes and levels, and the levels given and not taken (`GET /levels`), nothing else from the sheet. |
| Rest the DM called | The DM, and the players it was for (live); the list, to everyone in the campaign. Who got nothing from a long rest (at 0 hit points, from their private sheet): only the DM and that player. A hit die spent is a roll, shared like any roll ("Who sees my rolls"). |
| Handout | The DM, and the players it was given to (`to`: everyone, or chosen players). Its picture is served only to them. Players aren't told who else got it. Its text and what the AI read in its picture reach the archivist with who got it, so knowledge from it is known only by them. |
| Map | The DM: everything except players' private pins. Players: only maps the DM has shown them (to every player, or to them among chosen players: `shown_to`), and only the places on a map revealed to them (`revealed_to`) where they can see them, without a place's record, without the AI's description and reading notes, stat blocks, record links, hidden tokens, or tokens and other things under the fog (their page draws the fog over the whole picture from the walls and lights it gets: owner, 2026-10-14, a determined player could see the picture and the wall layout in their browser, and that's fine); NPCs' and enemies' hit points only as how hurt they look; they can change only their own tokens (their character, and the companions and summons they control, whose stat blocks only they get), and make them follow only tokens they can see (whom a token follows they get only when they can see that one too); whoever follows their token goes with it to another map. A player character's hit points on its token are its sheet's current and maximum (when the player has saved a sheet), shown to everyone who sees the token, as token hit points always were. Private pins: only their owner. The archivist gets what happened on maps players could see, without hidden tokens (§6.6 "Map events"); Q&A doesn't read maps. |
| Creatures | Only the DM (the Creatures tab and its API, and Ask when the DM asks: §5.3 step 3b). A token placed from one is an ordinary token: players see it like any other. |
| Inventory (equipped gear) | Like the sheet (it is part of it), except that the DM sees what each player has **equipped**: its name, how many, proficient or not, attuned, magic bonus, armour, the to-hit and damage it gives, what magic items do to the sheet, and the AC worked out (and whether the player typed their own AC); also the total weight carried against the campaign's limit (and whether they're encumbered) and how many items they're attuned to. Not what's only carried, nor the rest of the sheet (`GET /gear/equipped`, DM only). A player's item lookup never uses the DM's own items (they may hold secrets); it goes to the PHB tables, the books and the AI. |
| Items, merchants | The lists, notes and sales: only the DM. The sales say who bought what, so the DM learns some of what players carry (owner, 2026-10-10: fine). A player sees a merchant's shop (name, description, picture, what it sells, prices, how many are left, and each item's description and picture) only while one of its tokens is on a map they can see (shown, not hidden, in their sight); otherwise 404. Buying changes only the buyer's own sheet. A player gets the picture of one of the DM's items only through a shop they can see or while it's in their own inventory (bought there); nothing else of the item. |
| Wiki | Only the DM writes it. A player reads their own version (tab and API, stage 6a): only the pages and parts available to them, filtered on the server for every route (a player's `?as=` is always themselves); links to pages they can't see are only their words; templates, history, proposals and planned or false parts never reach them. Only the DM sees the AI's proposals and its wiki jobs (players' job lists leave them out). A proposed part is offered to the players who know every record it was written from (`known_by`); a change never widens a section; a reveal reaches only players who know the records behind it, and the DM approves each. Each page, section and `:::for` / `:::dm` block has who it's available to; the narrowest wins. Ask gives a player only the parts available to them (filtered live from the page, never from the index); other names are DM-only. |
| Discord recording (§6.12) | Only the campaign's DMs (the Sessions tab and its API): the campaign's bot key (write-only: nobody gets it back), the recording list, its transcript and its audio, which stay on the host's PC (`data/recordings/`). Players see none of it until the DM uploads the transcript, which is then a transcript like any other. Anyone in the voice channel can leave their voice out (`/norecord`). |
| Archivist | Sees everything, including all notes; decides `known_by`. |

The archivist's rules: openly happened → attendees (everyone if all attended); only in a player's note → that player; whispered/secret perception → that player; absent players don't know unless told later (then widen); mixed records get split; when in doubt, restrict.

**Deferred:** the archivist currently includes the DM in `known_by` for records built from a player's private note, so the DM can learn note contents through Q&A or the debug view. The same now goes for what's only on a character sheet (DMs see every record). The DM can do what's built; more may come (owner, 2026-10-10). More privacy work is planned.

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
- [x] Session upload (on the DM's Sessions tab since 2026-10-28; the admin screen before): number, date, title, speaker → account links, status/progress, notes matched by date.
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
- [x] Maps: the DM imports any map, the AI reads its grid and scale, tokens for characters, enemies and NPCs, players move their own, live for everyone (§6.6).
- [x] Maps: fog of war, hit points and conditions, hidden tokens, AI stat blocks, NPCs from the records, PDF page import, private pins (§6.6).
- [x] Maps: walls, doors and line of sight; a Measure tool, spell templates and an initiative tracker (§6.6).
- [x] Maps: darkness, lights and darkvision; pings and sketches; waypoints, speed per turn and difficult terrain; other pictures of a map; links between maps; map events for the archivist (§6.6).
- [x] Edit and delete your own notes (as new archived versions).
- [x] The DM's Archivist tab: the archivist's questions (answer or dismiss) and corrections in plain words.
- [x] Dice rolls shared live: with the party, only the DM (a secret roll when the DM makes it), or only yourself (§6.5).
- [x] Handouts: the DM gives pictures and text to everyone or chosen players, live (§6.7).
- [x] Pictures for NPC and enemy tokens (§6.6).
- [x] The DM's creatures: enemies and NPCs saved once and placed on any map, in place of the DM's Sheet tab (§6.6).
- [x] The archivist reads character sheets (in full, then each change with its time), late note changes and handouts between sessions (§5.2).
- [x] Find a creature online: the AI searches the web, official or homebrew, with a picture (§6.6).
- [x] The sheet (or another panel) beside the map, or in its own window (§6.4).
- [x] Layout options under Look: tab order, map toolbar place, hidden map tools, token names, accent colour (§3.3).
- [x] Full screen map with see-through floating tools; the DM's edit mode (§6.6).
- [x] Rules edition per campaign (2014 or 2024, campaign settings): rests, Ask and lookups in the books follow it (§6.10).
- [x] A player character's token shows and changes the sheet's hit points (§6.6).
- [x] The map creator: the DM makes a map from scratch (floors, rooms, walls, fences, doors, built-in assets and their own pictures), drawn by the server into an ordinary map (§6.6).
- [x] The map creator's second stage: 32 blending floors, 356 built-in assets in 14 groups, wall styles, curves, round towers, secret doors, windows and archways, roads and rivers, labels, the look and moods, scatter, areas and stamps (built in and the DM's own), 18 kinds of starting map, an AI draft from a description or sketch, floors of a building, autosave, and a .dd2vtt download (§6.6).
- [x] Merchants and items: the DM's Items (made, looked up, or found online) and Merchants tabs; merchant tokens players buy from on their own; restocking every N long rests (§6.9).
- [x] Rests and hit dice: spend hit dice from the sheet, short rests; the DM calls short and long rests for the party (§6.8).
- [x] Wild Shape: druids keep the beast forms they can take on their sheet; in a form, its hit points, scores, saves, skills and attacks roll from the sheet and its token (§6.4).
- [x] Class features: one box with every class's uses, pools and worked-out numbers (both editions), the player's own rows, Wild Shape as a row; rests give them back; the DM sees what's left (§6.4).
- [x] Subclass features: the Player's Handbook's subclasses (2014 and 2024) as a section of the same box, with Combat Wild Shape's slot healing and Portent (§6.4).
- [x] The wiki is visual: pictures, banners, an at-a-glance box, a gallery, picture cards and link previews, each picture available to whom the DM says (§6.11).
- [x] The AI keeps the wiki up to date: proposals after every archivist run (new pages, changed sections, reveals) that the DM approves, edits or rejects (§6.11).
- [x] The DM's wiki, stage 1: pages the DM writes, with who each part is available to, links, history, View as; Ask reads it (all for the DM, only what's available for a player) (§6.11).
- [x] Review sheet: is a character sheet valid for its level, classes and race? Rules checks, then the AI against the books and, for what they don't cover, the web (§6.4).

### 6.2 Next

- [x] Recording sessions from Discord: the bot and speech-to-text on the host's PC (§6.12; not yet tried on a real call).
- [ ] Real transcript from the recorder.
- [ ] More DM features on the web page (glossary, speaker-map editing). Corrections and the archivist's questions are on the Archivist tab.
- [ ] Try the web page with the players on a real session.
- [x] Cloudflare Tunnel set up on the host (thepartyledger.fyi, 2026-10-13).

### 6.3 Later

- Fuller privacy model (DM access to note-derived knowledge; sharing notes; per-character knowledge beyond attendance).
- Explicit "session in progress" marker instead of date matching.
- **Sessions built from notes only** (owner, 2026-10-07; designed, not built: `docs/notes/notes-only-sessions.md`). Some groups won't record, so the knowledge base may come from notes alone. Any user, DM or player, submits their notes with a session number ("Submit notes for session N" on the Notes tab; the session is made if it doesn't exist); the archivist builds the session from whatever notes arrive and re-runs when more come; a transcript stays optional and, when there is one, both feed the same run. Attendance: whoever submitted notes, plus the DM. The archivist infers who knows what, as always; a note can be **marked private**, and anything learned only from it stays with its author, enforced in the archivist's tools too (a `known_by` wider than the author is refused on a record whose only source is a private note). Needs a new ingest path with no transcript (no parsing, speaker map or chunking) and a prompt change (`PIPELINE_VERSION`). Ruled out by the owner as overcomplicated: an "End session" button, ticking attendance, offline caching of notes (the page needs the server anyway). Open: §9.
- **The rest of the DM screen** (on hold, owner 2026-10-07): ideas in `docs/notes/dm-screen-ideas.md` (party panel, monster cards with click-to-roll, encounter builder, quick-reference strip, campaign board, session prep brief, who-knows-what view).
- Parked or ruled out (details and reasons in HANDOFF "Parked, ruled out and on hold"): 3D renders of maps; a rewrite in C, C++ or C#; a faster model for Ask; ambient sound and weather; premade maps; AI-made pictures.
- Character sheets: let Q&A read the asker's own sheet ("what's my AC?"); more automation (racial ability bonuses); the AI sheet review still checks 2014 numbers. (Done since: the sheet's numbers follow the campaign's edition, 2026-10-22; feats such as Tough and Observant; background skills.); restore an earlier sheet version from the page (the archive has every version).

### 6.4 to 6.12: each feature's design

| § | Feature | Where |
|---|---|---|
| 6.4 | Character sheets: several characters, contents, attacks and spells, Inventory, item actions, Wild Shape, companions, class/subclass/race features, features in play, level up, creation help, backgrounds, point buy, layouts, rules, saving, upload, spell lookup, pictures, beside the map, Review sheet | [docs/spec/sheets.md](docs/spec/sheets.md) |
| 6.5 | Dice: server rolls, 3D rollers (Deluxe, Classic), styles, sharing | [docs/spec/dice.md](docs/spec/dice.md) |
| 6.6 | Maps: import, showing, reading, tokens, companions, fog, walls and sight, height, bridges, stairs, hit points, stat blocks, pins, lights, pings, movement, variants, full screen, Edit map, links, map events, who can do what | [docs/spec/maps.md](docs/spec/maps.md) |
| 6.6 | Combat on maps: spell templates, initiative, attacks and area spells, spells that aren't attacks, the DM's own effects | [docs/spec/map-combat.md](docs/spec/map-combat.md) |
| 6.6 | The world: places, maps inside maps, who sees what, where everyone is, travel and time, roads, encounters | [docs/spec/world.md](docs/spec/world.md) |
| 6.6 | The map creator: tools, floors, walls, assets, stamps, AI draft, levels, saving, export, map art | [docs/spec/map-creator.md](docs/spec/map-creator.md) |
| 6.6, 6.9 | The DM's creatures (Bestiary and People, Find online), items and merchants | [docs/spec/creatures-items.md](docs/spec/creatures-items.md) |
| 6.7, 6.8, 6.10 | Handouts; rests and hit dice; campaign settings | [docs/spec/table.md](docs/spec/table.md) |
| 6.11 | The DM's wiki and its space (stages 0 to 11) | [docs/spec/wiki.md](docs/spec/wiki.md) |
| 6.12 | Recording sessions from Discord | [docs/spec/recording.md](docs/spec/recording.md) |

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
7. **Client**: web page. Player view ✅ (login, campaign choice, questions, notes, sheet, dice, maps, handouts); admin screen ✅; DM tabs ✅ (Sessions with transcript uploads, Creatures, Items, Merchants, Archivist, the DM's map tools, Rest and Settings); more DM screens (glossary, speaker map) later.
8. **Hosting**: domain, Cloudflare Tunnel, packaging, player setup guide.

## 9. Open questions

Every question waiting on the owner, design ones included, is in HANDOFF "Open questions for the owner" (one list, so it isn't kept twice).
