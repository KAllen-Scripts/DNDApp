# DNDApp

**The Party Ledger** (https://thepartyledger.fyi): campaign memory for a D&D group. Players log in on a web page with a name and password, and take private notes during a session; afterwards the DM uploads the transcript. An AI "archivist" reads both and maintains its own knowledge base of everything in the campaign (people, places, debts, quests, secrets) and of who knows what. Players ask questions on the web page and get answers with citations back to the session and timestamp, limited to what their character should know. Each player also keeps their character sheet there.

The design is in [SPEC.md](SPEC.md). Project status, change log and next steps are in [HANDOFF.md](HANDOFF.md).

## Layout

```
packages/
  shared/   plain JS both sides use: transcript parser, citation format, character sheet rules, dice, map geometry, coins,
            sheet rolls, the inventory (gear), campaign settings
  server/   Node.js server: API (src/routes/), archive, processing pipeline, Q&A agent; also serves the web page
  web/      the web page (plain HTML/CSS/JS in public/, no build step)
```

## Server setup (host machine)

Requires Node.js 22 or newer, and Claude Code logged in on this machine (it uses your Claude subscription).

```sh
npm install --ignore-scripts
npm rebuild onnxruntime-node protobufjs
npm run admin -- init "Admin" "admin-password"
npm start
```

Use `--ignore-scripts` (also when adding packages). A plain `npm install` makes npm 11 try to compile `better-sqlite3`, which fails without Python and C++ build tools, even though the package already includes prebuilt binaries. Details in [HANDOFF.md](HANDOFF.md) under "Getting running on a new machine".

To use the Anthropic API instead of your subscription, copy `.env.example` to `.env`, set `LLM_PROVIDER=api` and add `ANTHROPIC_API_KEY`. Other settings (models, effort, limits) are in the same file.

When running through Claude Code, the server starts it with everything switched off except its own tools. That means no file or shell tools, no MCP servers or claude.ai connectors, no skills, plugins, hooks or CLAUDE.md files, and no saved sessions. Web tools are off too, with one exception: the DM's **Find online** (Creatures, and Items in the wiki) lets the AI use WebSearch and WebFetch, and nothing else, to look a creature or item up. AI usage counts toward your Claude Code limits.

`init` creates the **admin login**. The server listens on `http://127.0.0.1:4400`: open it in a browser and log in with that name and password.

### The admin screen

The admin login is only for managing the server. It gets an admin screen instead of Ask/Notes:

- **Accounts:** add accounts (name + password, and tick which campaigns they can access, with role and character for each), change an account's campaigns later ("Edit campaigns"), set a password (logs them out everywhere), require a new password at next login, log someone out everywhere, block/unblock, delete. An account can only be deleted while it's unused (no notes, questions, sessions or speaker-map links), because the archive refers to it; otherwise block it.
- **Campaigns:** each shown as its own colour-coded card; create (names must be unique) and delete campaigns; add accounts to them as player (with a character name) or DM; change roles (e.g. make someone the DM); remove people from a campaign (their account and notes are kept).

**Must change password at next login** (like Active Directory): ticked by default when you add an account, offered when you set a password, and switchable per account ("Require new password" / "Don't require"). While it's on, that person's login can only choose a new password or log out; the server refuses everything else. They give the password you set plus a new one twice; after that their other devices are logged out. Anyone can also change their own password from "Change password" in the account menu (top right).

There's no sign-up: you create every account and tell each person their name and password. Names are what people log in with, so each must be unique (case doesn't matter). Passwords need at least 6 characters and are stored hashed.

**Deleting a campaign** (you type its name to confirm) removes it from the database: its sessions, knowledge base, notes, questions and who's in it. Accounts are kept. Its archive folder is **not** deleted: it gets a `deleted.json` marker so it isn't restored on start-up. To bring a campaign back, delete that marker file and restart the server, then run a rebuild for it. Deleting is refused while that campaign has processing queued or running.

**Session transcripts are the DM's to upload** (the owner, 2026-10-28), from the **Sessions** tab in the app, not here. The DM picks which of their campaigns it's for (any campaign they're the DM of; it starts on the one they're in), and sees past uploads with date, title, how many player notes match their date, attendance and processing status (refreshing while it runs; Retry on failure), plus dates that have player notes but no transcript yet. A transcript is uploaded with its session number and the date it was played (pre-filled: next number, newest date with waiting notes). After choosing the file, the DM links each transcript name to an account (guessed where possible); the links are saved before processing so the AI knows who was there.

**Campaigns are separate.** Each has its own sessions, knowledge base, notes, speaker map and conversations, and the AI only ever searches the campaign the question was asked in. Players in more than one campaign choose which one after logging in (and can switch from the header); someone in just one goes straight in.

**If you play too**, make yourself a separate player account on the admin screen and log in with that. It's an ordinary player account, so it only sees what your character should know. (The admin login itself isn't in any campaign.)

If you lose the admin password: `npm run admin -- set-password "Admin" "new-password"`. `npm run admin -- list` shows accounts and campaigns.

Then link each person's transcript speaker name to their account in the speaker map. The AI tracks who knows what by account, so without the link it assumes everyone was at every session.

A login lasts 30 days from when it was last used (`LOGIN_DAYS`). After 10 wrong passwords for a name in 15 minutes, that name can't log in for a while.

### Character sheets

Each player has a **Sheet** tab (the DM has Creatures instead, and no sheet), laid out like the official 5e sheet (core stats, then character details, then spells). It's private to them, saved to the server a moment after they stop typing, and archived. A player can have **several characters** and plays one at a time: the strip above the sheet says who they play now, and **Characters** lists them with **New character**, **Make active**, **Rename** and **Delete**. The active one is their sheet, their token on maps, the one rests and purchases change and the one the DM sees; the others are kept, private to them.

- **Automatic values** (modifiers, proficiency bonus, saves, skills, passive Perception, initiative, AC (from the armour and shield equipped on the Inventory tab, or unarmoured), speed, HP, hit dice, spell save DC and attack bonus, spell slots) are worked out from the scores, classes and race using the 2014 Player's Handbook rules. Anything a player types into one of those boxes becomes **their own value**: it's marked, never changed by the rules, and stays until they click ↺.
- **Upload a sheet**: a PDF (filled-in form, typed or scanned), a photo, a text file, or a sheet downloaded from here. The AI copies it in; numbers on their sheet that differ from the rules are kept as their own values. The uploaded file is archived as it was.
- **Spells**: type a name to add one, and its details are filled in from (1) the SRD 5.1 spell list built into the server, (2) the PDFs in the books folder, or (3) the AI's own knowledge, labelled as such. Every detail can be edited. Details are only replaced when the player asks.
- **Books**: drop PDFs into `DND books` next to this repo (`BOOKS_DIR` in `.env` to change it). Scanned books need an OCR text layer (if a scan has none, run it through `ocrmypdf` once). The server reads them into memory at start-up (a few seconds; nothing is stored). EPUBs aren't read. The books are used for spell lookups and by Q&A, which can search them, read pages and browse their contents to quote a rule, citing the page ("Player's Handbook p. 195"). Use each book's name and year as the file name ("Player's Handbook (2014).pdf"); that's how Q&A refers to it. Q&A checks every rules question in the books, and uses the rules of the group's Player's Handbook edition.

### Class features

Every sheet has a **Class features** box (under Attacks; in the Tabs layout, on Actions) listing what the character's classes give them to keep count of, for the campaign's rules edition: Rage, Bardic Inspiration, Channel Divinity, Second Wind, Action Surge, Ki (Focus) Points, Lay on Hands, Sorcery Points, Mystic Arcanum, Arcane Recovery and the rest, plus worked-out numbers like Sneak Attack dice. Tick a use (or spend points with − and +); the maximum comes from the level and can be typed over (↺ goes back). **Use** on Second Wind rolls the healing on the server and adds it. Sorcerers turn slots into points and back, wizards pick the slots Arcane Recovery gives back, warlocks get Pact Magic slots back. **+ Add your own** adds a row for anything else (a feat like Lucky, Breath Weapon, homebrew) with how many and when it comes back. A druid's Wild Shape is a row here, with the forms under it. Rests give uses back; the DM sees what's left under Items in the wiki.

Under them, **Subclass features** shows the rows of the subclass typed on the sheet (the subclass box suggests the Player's Handbook's, 2014 and 2024): Superiority Dice, Warding Flare, Arcane Ward, domain and oath Channel Divinity options and the rest. A Circle of the Moon druid (2014) spends a spell slot to heal their Wild Shape form (rolled on the server); a diviner rolls Portent's d20s and keeps them on the sheet until used. A subclass from another book says to add its rows by hand.

### Rests and hit dice

The Hit dice box on a player's sheet has a row per die size (a Fighter 3 / Wizard 2 has d10s and d6s) with a tick per spent die. **Spend** rolls that die plus the Constitution modifier (on the server, shown with the dice and shared like any roll) and adds the hit points, up to the maximum. **Short rest** gives back what a short rest does on the sheet (Pact Magic slots). The DM gets a **Rest** button in the header: tick who rests (everyone by default) and choose Short rest or Long rest. A long rest gives back all hit points, every spell slot, and spent hit dice (up to half the character's total under the 2014 rules, all of them under 2024), and clears temporary hit points and death saves; under the 2014 rules a character at 0 hit points gets nothing from it. Each player's sheet changes at once and they get a note. The rules follow the campaign's **Rules edition** (the DM's Settings). Until the DM picks one: `REST_RULES=2014` or `2024` in `.env`, else the edition of the Player's Handbook in your books folder (2014 if there's none, or both). A player character's map token shows the sheet's hit points, so it follows; NPCs' and enemies' tokens aren't changed, and nor are item charges.

### Inventory and campaign settings

Players have an **Inventory** tab: look an item up by name (PHB weapons and armour straight from the tables, anything else from the books or the AI, never the DM's own items) or add one by hand, then equip it. Equipped weapons show in Attacks with their to-hit and damage worked out; equipped armour and a shield set the AC; weight, charges, attunement and magic items' effects on the sheet are tracked there too. The DM's Items (in the wiki) shows what each player has **equipped** (with their AC, weight carried and attunements), not the rest of their sheet.

The DM's **Campaign settings** (in the account menu under their name, top right) holds the campaign's settings: the **Rules edition** (2014 or 2024: rests, Ask's rules answers and lookups in the books follow it; the character sheet itself always uses the 2014 rules for now) and **Weight limits** (carrying capacity, variant encumbrance, or ignore), and the **Calendar**: Simple (Day 1, Day 2…), Harptos, Gregorian-like, Exandria or your own, which the in-game clock reads everywhere ("3 Mirtul 1492 DR, 18:30 · Full moon"). It also holds **Your own backgrounds**: the DM's own, with their skills, tools, languages, equipment, gold and a feature or origin feat, which every player's sheet then suggests.

On the sheet, the **Background** box suggests the books' backgrounds for the campaign's edition (and the DM's own). Pick one and it fills in the sheet: its skills ticked, its feature or feat in Features & traits, its tools and languages, and equipment and gold only where they're empty. A note says what changed, with Undo. Above the sheet, **Help making a character** (open while the sheet has no class) says what the class, race or species and background give and what to choose, by the campaign's edition: click a skill to tick it, or put the class's starting equipment in the Equipment box.

### Dice

The **Dice** button in the player's header opens a dice tray: click dice to build a roll (or type one, like `2d6+3` or `d%`), choose advantage or disadvantage for the next d20, choose **who sees your rolls** (everyone, only the DM, or only you; the DM's "only me" is a secret roll), and see the table's recent rolls, yours and everyone else's you may see. Someone else's roll pops up briefly at the top right. On the Sheet tab, clicking a save, skill, ability name, initiative or spell attack rolls it, and the dice button next to an attack rolls to hit, then offers its damage (doubled dice on a natural 20). Shift-click rolls with advantage, Alt-click with disadvantage.

The **server rolls** (a secure random number). The page then throws 3D dice with real physics and relabels their faces so they land on the server's numbers, so a roll can't be faked from the browser. The 3D dice (Three.js and cannon-es for Deluxe, [dice-box-threejs](https://github.com/3d-dice/dice-box-threejs), MIT, for Classic) are served by this server and loaded when the dice tray opens; by default they take the theme's accent colour, and the tray has 23 other **dice styles** (Dragonfire, Frost, Necrotic, Thylean Bronze, Here Be Dragons, Glitter Party...; textures load only for the style in use). **Effects:** each style's dice leave a trail while they roll (embers, snow, sparks, stars, smoke, bubbles, petals); a natural 20 gets a golden burst and banner, a natural 1 a red flash, smoke and a shake, and damage with every die on its highest face a sparkle, with small chimes when sound is on. Animation, effects and sound can each be switched off in the tray; with reduced motion on, the result just appears. Rolls are kept in the database (not the archive) for the table's roll list.

**Rollers:** two, set for everyone with `DICE_ROLLER` in `.env` (restart the server); anyone can pick the other for their own browser under **Roller** in the dice tray.

| `DICE_ROLLER` | What you get |
|---|---|
| `deluxe` (default) | The fanciest: glossy, metal and see-through dice with reflections, soft shadows, engraved and glowing numbers, sounds, and a pulsing glow on a natural 20, natural 1 or max damage. About 1.7 s. Lowers its own quality on a slow device. |
| `classic` | The original 3D dice ([dice-box-threejs](https://github.com/3d-dice/dice-box-threejs)): full physics and shadows. About 3.5 s a roll. |

If one can't start (no WebGL), the other is tried, then the result just appears. The dice libraries are sent compressed (about 2.4 MB down to about 0.4 MB) and start loading when the dice tray opens, so the first roll doesn't wait for them.

### Handouts

The **Handouts** tab: the DM gives players a picture and/or text (a letter, a wanted poster, a riddle), to everyone or to chosen players, and can change who gets it or take it back. Players see only the ones given to them; a new one arrives straight away and puts a count on the tab. Handouts are archived, and the archivist gets them (with who got them) between sessions.

### The DM's Wiki tab

Only the DM writes it; each player reads their own version, with only the pages and parts available to them. Pages for people, places, factions, lore, anything: each has sections, other names, a kind, tags and can sit inside another page; `[[Page name]]` links pages. Every page, section, and block of text (`:::for Thorin` … `:::`, `:::dm` … `:::`) says who it's available to; new pages are the DM's alone. View as shows a page as a player sees it. Ask uses all of it for the DM and only what's available to the asking player. Every save is kept, and History can bring an older version back.

After each session (and each correction or batch of sheet changes) the AI reads what the archivist recorded and proposes wiki changes: new pages, changed or new sections, and reveals ("Thorin read the ledger: make that section available to him?"). They wait under **The AI's changes** for the DM to approve, edit then approve, or reject; nothing reaches a page before that. Each proposed part is offered only to the players who know it. A section the AI wrote stays the AI's to keep up to date until the DM changes it. **Read the records now** runs it on demand (for a campaign that already had sessions); `WIKI_AUTO=off` leaves it to that button. `MODEL_WIKI` and `EFFORT_WIKI` (default `medium`) set its model and effort.

### The DM's Archivist tab

Only the DM has it. It lists the archivist's questions (when sources disagree, e.g. two spellings of an NPC), each with an answer box and Dismiss; an answer becomes a correction. Below, the DM can send any correction in plain words and see earlier ones. The archivist applies them in the background.

### Notes

The **Notes** tab: private notes, grouped by session date. Each can be edited or deleted; the archive keeps every version. Changes to notes for a session that was already processed reach the archivist later, like sheet changes.

### What the archivist reads between sessions

Besides transcripts and notes, the archivist gets each player's character sheet (in full the first time, then every change with the time it was saved), notes written, edited or deleted after their session was processed, and handouts (their text, and what the AI read in their pictures: any writing word for word, then what it shows). This runs once things have been quiet for `ARCHIVIST_UPDATES_DELAY_MINUTES` (default 10), so filling in a sheet is one AI run, not one per keystroke. What's only on a sheet stays known only by that player in the knowledge base, though the DM sees every record (as with notes).

### Maps

The **Map** tab shows maps the DM imported: a battle map, a town, a region, anything (PNG, JPEG or WebP, or one page of a PDF). The AI doesn't read a new map unless asked: **Map settings → Read with the AI** has it work out what kind it is, a name, whether it has a grid and its scale, in the background. Where it sees a grid, the server measures the exact square size from the image, so tokens line up. The DM can correct the grid (it's drawn over the map while the settings are open) and the scale under **Map settings**, and decides when players can see the map (new maps start hidden).

The DM can also **make a map from scratch**: **New map → Make a map**. Start blank, from one of 18 kinds of map the server makes for you (a dungeon, cave, village, tavern, ships at sea, castle, dragon's lair and more; press again for another), or from an **AI draft** of a description ("a smugglers' cave under a lighthouse, with a jetty") and, if you like, a sketch. Then paint 32 kinds of floor (natural ones blend into each other), drag out rooms and round towers, draw walls in 8 styles (straight or curved), doors, secret doors, windows and archways, roads and rivers, and labels, and place, scatter or stamp down things from 356 built-in assets in 14 groups (trees, ships, furniture, tavern and temple fittings, traps, treasure, magic...), or your own pictures (Add a picture…, a PNG with a see-through background works best). Pieces of map can be copied, kept as your own stamps, or put down from 35 that come with it. The Look tab sets daylight, dusk, night or gloom (lights glow, and stop at walls), a grid on the picture and shadows. Unsaved work is kept in the browser in case it closes. Save it and the server draws it into an ordinary map, with its grid, walls, doors, obstacles, lights, difficult terrain and links already set up. To change it later: Map settings → Change in the map creator. Once saved, the creator's Map tab adds floors above or cellars below (each its own map; stairs between them arrive at the same place). Any map with a grid can be downloaded as a Universal VTT file (`.dd2vtt`) for Foundry, Dungeondraft and others (Edit map → Download .dd2vtt, or Map settings → Other VTTs); brought back in here, it keeps its heights, stairs, ladders, obstacles and secret doors too. The AI draft uses its own model and effort settings in `.env`: `MODEL_DESIGN` (default: the maps model) and `EFFORT_DESIGN` (default `high`); it counts against `MAP_AI_PER_HOUR`.

The DM adds **tokens** for player characters (tied to a player), NPCs and enemies, with a size from Tiny to Gargantuan and a colour. **Players can drag their own token; the DM can drag any.** Players add their own **companions and summons** (Companion on the map toolbar): theirs to move, heal and dismiss, they see what it sees, and **Roll** rolls its attacks and checks from its stat block. Tokens snap to the grid, the distance moved shows while dragging, and every move appears live on everyone's screen. Drag the map to pan; zoom with the mouse wheel or by pinching. The image and every change are archived.

For running a fight, the DM has:

- **Fog & sight** and **Edit map**: in Fog & sight, turn on fog of war and drag rectangles to reveal or cover parts of the map (turning fog on starts in Reveal, since everything begins covered). In Edit map (the walls, heights, lights and settings, out of the way while you play), draw walls and doors (or let **AI walls…** draft them from the picture at the effort you pick, then correct them); then tick **Line of sight** in Fog & sight: each player then also sees whatever their own token has a clear line to, and places they've seen before stay dimmed. Draw **obstacles** for things players see over but can't cross (a building's roof, a cliff edge). Anyone clicks a door to open or close it: players only doors next to their token, and not ones the DM has locked (Lock mode). **Unseen parts** sets what players get outside their sight: dark, greyed out, or the map shown (tokens there are hidden either way); **Remember explored** keeps a dim view of where they've been. Players can't move their token through walls, obstacles or closed doors. Players' copy of the image is blacked out on the server, and tokens they can't see are hidden from them.
- **Hit points and conditions** on each token (type `-7`, `+5` or `12` in the bar below the map when it's picked). Players see enemies' and NPCs' health only as unhurt, hurt, bloodied or down. A player character's token uses the hit points on that player's sheet: damage on the map changes the sheet, and healing on the sheet changes the token.
- **Hidden** tokens that players don't see at all.
- **Stat block (AI)**: fills in an enemy's 5e stat block, hit points and size, copied from the DM's own creature of that name if there is one, else from the group's books (it says which book and page), else from the AI's memory. Only the DM sees it.
- **Who is it?** in Add token: pick the Kind, then a player, one of your creatures or someone from the campaign's records, with a search box (put someone the archivist knows about on the map and read their record from there).
- **Token pictures** for NPCs and enemies (optionally every token with the same name).
- **Initiative**: start a fight; NPCs roll with their stat block's Dex, players roll their own (or type it); turns and rounds, a ring on whose turn it is.
- **Darkness and lights**: night or underground, torches and other lights (placed, carried, or suggested by the AI's wall draft), darkvision per token.
- **Height**: raised areas (roofs, castle wall-walks, cliffs) and how tall tokens are; players see over them only where the line from their eyes clears the edges.
- **Difficult terrain** (costs double), **other pictures** of the same map (night, after a fire) and **links** between maps (stairs, a trapdoor) that take a token through.

Everyone can **Measure** distances, place **spell templates** (sphere, cone, line, cube; from their own spells too) that show who they catch, **attack** a picked enemy or cast an area spell (the server rolls, applies damage and saves, and shows a card), **ping** a spot or **sketch** a line (gone after a few seconds), and plan a move round corners with waypoints (Space or W while dragging; in a fight it shows movement used against speed).

### The DM's Creatures tab

In place of a character sheet, the DM keeps enemies and friendly NPCs: name, size, colour, hit points, AC, speed, darkvision, a stat block (typed, or filled in by the AI), a picture and private notes. **Place on map** (or picking one under **Who is it?** in Add token) puts one or a numbered group on the map; **Save to creatures** keeps a token from a map. **Find online** has the AI search the web (official or homebrew) for a creature and bring back its stat block, a link to where it found it, and a picture if it can download one. The server only downloads from the public internet, never from your PC or home network.

Everyone can drop **pins** with a note on a map; only the person who placed them sees them, not even the DM.

### Items and merchants (the DM)

**Items** keeps what merchants sell: make one, **Look up** one by name (your items first, then the books in `DND books`, then the AI), or **Find online**. **Merchants** sets up shops: add items with a price, how many are in stock (or no limit) and what restocking brings them back up to; restock every so many long rests the DM calls with **Rest**, or with **Restock now**; **Place on map** puts the merchant down as a token with a gold badge. Players pick the token, press **Shop** and buy on their own: the coins come off their sheet (with change) and the item goes into their Inventory. **Sales** shows who bought what.

### The public address

Players open **https://thepartyledger.fyi** (`www.` works too). `PUBLIC_URL` (default `https://thepartyledger.fyi`, can be changed in `.env`) is the only place the URL is set. The web page is served by this server and calls it with relative paths, so the page itself never needs the URL. The server prints it on start-up.

How the address reaches this PC (set up 2026-10-13):

- The domain is registered with **Cloudflare Registrar** (renews 2027-10-13) and its DNS is on Cloudflare (Free plan).
- A **Cloudflare Tunnel** called `thepartyledger` is managed from the Cloudflare dashboard (Zero Trust → Networks → Tunnels). It sends `thepartyledger.fyi` and `www.thepartyledger.fyi` to `http://127.0.0.1:4400` and answers anything else with 404. Both names are proxied CNAME records pointing at the tunnel.
- **`cloudflared`** is installed on this PC (winget package `Cloudflare.cloudflared`) and runs as the Windows service **cloudflared**, which starts with Windows. It only connects out to Cloudflare. Check it with `Get-Service cloudflared`; update it with `winget upgrade Cloudflare.cloudflared` (as admin).
- The zone redirects http to https ("Always Use HTTPS") and accepts TLS 1.2 or newer. The certificate is Cloudflare's free Universal SSL.
- **The server itself isn't a service.** The site only works while the server is running; when it isn't, players get Cloudflare's 502 page. `npm start` runs it in your terminal. `npm run restart` stops the running one (whichever way it was started) and starts it again in the background, so it keeps going after the terminal, the Claude Code session or the Claude app closes (on Windows it is created through WMI, so it isn't tied to whatever ran the command); its output goes to `data/server.log` (the run before is in `data/server-previous.log`). `npm run server:stop` stops it, and `npm run server:start` starts it only if it isn't running. Starting runs `npm install` first.
- The Cloudflare API token used for the setup lives in `API_key` at the repo root, which git ignores. Nothing needs it while the site runs; the tunnel uses its own token, stored in the service.

### Letting players in safely

The server is meant to run on your own PC with players reaching it over the internet through **Cloudflare Tunnel** (SPEC §3.4). Keep it that way:

- Keep `HOST=127.0.0.1`. `cloudflared` on the same PC connects out to Cloudflare, so nothing on your router is opened and players get https. Don't port-forward 4400 and don't set `HOST=0.0.0.0`: logins and passwords would cross the internet unencrypted. The server warns at start-up if `HOST` isn't local or `PUBLIC_URL` isn't https.
- If Windows asks whether Node.js may accept connections, say no (or private networks only). The tunnel doesn't need it.
- `TRUST_PROXY` (default `loopback`) lets the server see players' real addresses through a tunnel on this PC, for limiting password guesses. Leave it alone unless the proxy runs on another machine.

What the server does on its own: every page and API response carries security headers (the page only runs its own scripts, can't be put in a frame on another site, and sends no referrer); requests other than uploads are limited to 1 MB, and logins to 16 KB; 30 wrong passwords from one address in 15 minutes stop logins from there (as well as 10 per name); a login can hold at most 20 live connections (map moves, job progress), and those end as soon as the login is logged out, blocked or removed from the campaign; unexpected errors are logged, and people are only told something went wrong (no folder names from your PC); players see that processing failed, not why. The AI runs with no file or shell tools (see above), so a transcript, note or picture can't make it touch your PC. The exception to "no web tools" is Find online: Claude Code's WebFetch runs on your PC like the rest of Claude Code, and it hasn't been checked whether it can be pointed at addresses on your home network; what it reads only ends up in a DM-only stat block. The server's own download of the creature's picture is refused for anything but the public internet (`net/fetch-public.js`).

The first time a transcript is processed, the server downloads a small search model (~25 MB) into `data/models`.

### Data

Everything lives in `data/` (git-ignored):

- `data/archive/` is the permanent record: accounts, original transcripts, player notes (every version), character sheets (every change, plus uploaded files), character pictures, maps (the images or PDFs as imported, the pictures drawn for maps made in the creator, other pictures of them, token pictures, every change, and everyone's private pins), handouts, the DM's creatures, items and merchants (with recent sales), the DM's own map creator assets, the rests the DM called (`rests.jsonl`), the campaign's settings (`settings.json`), speaker map, glossary, DM corrections, and a snapshot of the knowledge base after every archivist run. **Back this folder up.**
- `data/dndapp.sqlite` is the working database. It can be rebuilt from the archive.

**Example data.** `DATA_SET=example` in `.env` runs the server on `data-example/` instead: a made-up campaign (The Lanterns of Saltreach) with accounts, sheets, a wiki, creatures, items, merchants and linked maps, seeded the first time it starts, plus four session transcripts to feed in. Remove the line to go back to the real data; the two folders never mix. See [example/README.md](example/README.md).

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

Log in with `POST /login`; send the token it returns as `Authorization: Bearer <token>` on every other request (except `/health` and the web page's files). DM-only and admin-only routes are marked. The admin login also passes DM checks.

| Method | Path | |
|---|---|---|
| GET | `/health` | Public liveness check |
| POST | `/login` | `{name, password}` → `{token, user}`. Public |
| POST | `/logout` | Ends this login |
| GET | `/me` | Your account and campaigns (each with its `settings`) |
| GET | `/campaigns/:cid` | Campaign, your role and character, and its `settings` |
| PATCH | `/campaigns/:cid/settings` | Change the campaign's settings (DM) `{weight?: capacity \| variant \| ignore, edition?: 2014 \| 2024 \| null, travel?: {time?: clock \| skip \| none, roads?, terrain?, vehicles?, marches?, encounters?}, backgrounds?: [{id?, name, skills, tools, languages, equipment, gold, feature: {name, text} \| null, abilities: [3] \| [], feat}] (the whole list, up to 50), attacks?: {on?, damage?: auto \| dm, show_ac?}, calendar?: {preset, months, leap, weekdays, start, era, moons, seasons, holidays} \| null, wiki?: {lanes: [page ids]}}` (`null`: not chosen, follow `REST_RULES` or the books' Player's Handbook; travel switches change one at a time) → the settings; sent live as `settings` |
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
| POST | `/campaigns/:cid/sessions` | Upload transcript (DM). JSON `{number, played_on, title?, transcript}` or `text/plain` body with `?number=&played_on=`. `played_on` (YYYY-MM-DD) links it to that day's player notes. Optional `speakers: [{speaker, user_id}]` are merged into the speaker map before processing. The reply lists `unlinked_speakers` |
| POST | `/campaigns/:cid/sessions/preview` | Check a transcript without saving it (DM) `{transcript}` → lines, first/last timestamp, speakers with their current account link |
| GET | `/campaigns/:cid/sessions/overview` | The Sessions tab (DM): sessions with status, matched note counts and attendance; dates with notes but no transcript; next number; today's note date; the members names can be linked to |
| GET | `/campaigns/:cid/sessions/:n` | Session and who attended |
| GET | `/campaigns/:cid/sessions/:n/transcript?from=&to=` | Transcript lines (players: only sessions they attended) |
| POST | `/campaigns/:cid/sessions/:n/process` | Retry / reprocess a session (DM) |
| POST | `/campaigns/:cid/notes` | Take a private note `{text, session_date?}` (default: today; before 6am counts as the previous day) |
| GET | `/campaigns/:cid/notes?date=` | Your own notes only (nobody else can list them, including the DM) |
| PATCH / DELETE | `/campaigns/:cid/notes/:id` | Edit one of your own notes `{text}` / delete it. The archive keeps every version |
| POST / GET | `/campaigns/:cid/corrections` | Correct the archivist in plain words (DM) `{text}` |
| GET | `/campaigns/:cid/questions?status=open` | Questions the archivist left about conflicts (DM) |
| POST | `/campaigns/:cid/questions/:id/answer` | Answer one (DM) `{answer}`. Becomes a correction |
| POST | `/campaigns/:cid/questions/:id/dismiss` | Dismiss one (DM) |
| GET | `/campaigns/:cid/kb` | Raw knowledge base, for debugging (DM) |
| GET | `/campaigns/:cid/jobs` | Recent jobs (processing, corrections, rebuilds) |
| GET | `/campaigns/:cid/jobs/events` | Live job progress (SSE) |
| POST | `/campaigns/:cid/rebuild` | Rebuild everything from the archive (DM) |
| POST | `/campaigns/:cid/ask` | Ask a question (SSE stream) `{question, conversationId?, mode?}` (`mode`: `auto` (default), `quick` or `thorough`, SPEC §5.3) |
| GET | `/campaigns/:cid/conversations[/:id]` | Your chats (pinned first, then most recent) |
| PATCH | `/campaigns/:cid/conversations/:id` | `{ pinned?, title? }`: pin/unpin or rename one of your chats |
| DELETE | `/campaigns/:cid/conversations/:id` | Delete one of your chats (its questions and answers are erased; it still counts toward the hourly limit) |
| GET / PUT | `/campaigns/:cid/sheet` | Your active character's sheet `{sheet, version, number, edition}` (blank, version 0, if none) / save it `{sheet, version, character?}`. 409 `{error, current}` if it was saved elsewhere since `version`, or `{…, switched: true}` if `character` isn't the active one any more. 400 if it adds an attack with a PHB weapon that isn't in the sheet's inventory (one the saved sheet already had may stay). Players only: 403 for the DM (who has Creatures), as for all sheet and character picture routes |
| GET / POST | `/campaigns/:cid/characters` | Your characters `{characters: [{number, name, summary, active, version, updated_at}], active}` / make a new one `{name, active?}` (made active unless `active: false`; 201 with the list, `number` and, when active, its `sheet`). Players only, only ever your own |
| POST | `/campaigns/:cid/characters/:n/active` | Play character `n`: it becomes your sheet everywhere. Replies with the list and its `sheet` |
| PATCH / DELETE | `/campaigns/:cid/characters/:n` | Rename `{name}` / delete one you aren't playing (400 for the active one; the archive keeps it) |
| POST | `/campaigns/:cid/sheet/import` | Upload a sheet `{filename, data (base64), version?}`: PDF, image, text, or a downloaded sheet. Replies with the saved sheet and the AI's `notes` |
| GET | `/campaigns/:cid/character/pictures` | Your token and full picture `{token, picture}` (each null or `{key, width, height}`) |
| PUT / DELETE | `/campaigns/:cid/character/token` | Upload your token picture `{filename?, data (base64)}` (shown on your token on maps) / stop using it |
| PUT / DELETE | `/campaigns/:cid/character/picture` | Upload a full picture `{filename?, data, describe? (default true), replace?}`: the AI describes it into your sheet's Appearance (only replacing your own text if `replace`). Replies `{pictures, description, applied, sheet}` / stop using it |
| POST | `/campaigns/:cid/character/picture/describe` | Describe your full picture again `{replace?}` |
| GET | `/campaigns/:cid/character/picture/image` | Your full picture (only you) |
| GET | `/campaigns/:cid/members/:uid/token` | A member's token picture, 256 px square (anyone in the campaign) |
| GET | `/campaigns/:cid/sheet/download` | Your sheet as a file (`{format: "dndapp-sheet", sheet}`) that can be uploaded again |
| GET | `/campaigns/:cid/spells?q=` | Spell name suggestions (SRD and your books) |
| POST | `/campaigns/:cid/sheet/review` | Review your saved sheet (players): rules checks, then the AI against your books (and the web for what they don't cover) → `{edition, summary, findings: [{severity: problem \| check, area, message, source}], ai, error?, lookups}`. Nothing is saved; the AI part counts towards `SHEET_AI_PER_HOUR` |
| GET | `/campaigns/:cid/spells/lookup?name=` | A spell's details: SRD, else your books (tidied by the AI), else the AI's memory. 404 if not found; 429 past `SHEET_AI_PER_HOUR` AI calls |
| GET | `/campaigns/:cid/forms` | The SRD's Wild Shape forms (beasts and the four elementals) for suggestions: `[{ name, cr, type, speed }]` |
| GET | `/campaigns/:cid/forms/lookup?name=` | A Wild Shape form: SRD, else your books (copied by the AI), else the AI's memory; never the DM's creatures. 404 if not found; 429 past `SHEET_AI_PER_HOUR` AI calls |
| GET | `/campaigns/:cid/gear/lookup?name=` | An item for your Inventory (players): PHB weapons and armour from the tables (also "+1 Longsword"), else your books, else the AI's memory, never the DM's own items → `{item, from: srd \| book \| ai}` (an unsaved inventory line); 404 if not found; 429 past `SHEET_AI_PER_HOUR` AI calls |
| GET | `/campaigns/:cid/gear/pictures` | Pictures of the DM's items in your Inventory (players; bought from a merchant) → `{pictures: {item id: key}}`, only those with one |
| GET | `/campaigns/:cid/gear/items/:iid/picture?v=` | One of them, cut to a square (webp); 404 unless that item is in your own inventory and has a picture |
| POST | `/campaigns/:cid/roll` | Roll dice: `{notation: "1d20+5", mode?: normal \| advantage \| disadvantage, label?, visibility?: party \| dm \| self, initiative?: true}` → `{notation, mode, terms, total, natural, roll, initiative?}`. d2–d20 and d100, up to 50 dice. Logged and sent live to whoever may see it (`party`: everyone, the default; `dm`: the DM and you, a secret roll for the DM; `self`: only you). With `initiative` the notation may be left out (d20 + the initiative on your sheet), and the total goes into every fight on a map waiting for one of your player character tokens: `initiative: [{map_id, map, token_id, name}]` |
| GET | `/campaigns/:cid/rolls` | The last 50 rolls you may see `{rolls: [{id, user_id, name, from_dm, visibility, label, result, rolled_at}]}` |
| GET | `/campaigns/:cid/live` | Live news for the campaign (SSE): `roll` (a roll you may see), `handout` (one given to you, or changed), `handout-gone` `{id}`, `rest` (a rest the DM called that includes you; the DM hears all), `merchant` `{id}` (a merchant's stock, prices or shop changed), `settings` (the DM changed the campaign's settings), `sheet` `{version}` (your own sheet was saved somewhere else: hit points changed on the map, a purchase, a rest) |
| POST | `/campaigns/:cid/sheet/hit-dice` | Spend one of your hit dice `{die: 8, visibility?}`: the server rolls it plus your Constitution modifier (logged and shared like `/roll`) and adds the hit points. Replies like `/roll` plus `{healed, sheet, version, updated_at}`. 400 if you have none of that size left |
| POST | `/campaigns/:cid/sheet/features/use` | Use a class feature that heals `{id: "second_wind", visibility?}`: a use is spent, the server rolls the healing (logged and shared like `/roll`) and adds it → what `/sheet/hit-dice` returns |
| POST | `/campaigns/:cid/sheet/gear/drink` | Drink a potion that heals from your inventory `{id, visibility?}` (the line's id): the server rolls what it heals (logged and shared like `/roll`), adds it and takes one away → what `/sheet/hit-dice` returns. 400 if it isn't there or doesn't heal |
| POST | `/campaigns/:cid/sheet/gear/use` | Use one of an inventory item's actions `{id, action, extra?, visibility?}` (players): checks attunement, equipped and charges, spends them, rolls on the server (a summon's table and count, a spell's damage with extra charges, an attack's to hit, healing) and does it; a summon joins the sheet's companions and goes on the map next to the character → the main roll like `/roll` plus `{sheet, version, rolls, summoned, placed, crumbled, healed, damage, message}` |
| GET | `/campaigns/:cid/sheet/companions/where` | Where your sheet's companions are on maps you're shown → `{where: {[companion id]: {map_id, map_name, token_id}}}` (players) |
| POST | `/campaigns/:cid/sheet/companions/:id/map` | Put a sheet companion on a map `{map_id?}` (default: your character's), next to your character and following them → `{map, token}` |
| DELETE | `/campaigns/:cid/sheet/companions/:id/map` | Take a sheet companion off the map (it stays on the sheet) |
| POST | `/campaigns/:cid/sheet/short-rest` | A short rest on your own sheet (Pact Magic slots and class features that come back on a short rest) → `{sheet, version, updated_at}` |
| GET / POST | `/campaigns/:cid/rests` | The rests the DM called, newest first, and the rules used `{edition: "2014" \| "2024", rests: [{id, kind, at, by, edition, user_ids, skipped}]}` / call one (DM) `{kind: short \| long, to?: "everyone" \| [player ids], clock?: true}` (clock: the in-game clock moves on an hour, or 8 hours for a long rest): every sheet in it changes, players hear it live (`skipped`: at 0 hit points, so a 2014 long rest did nothing) |
| GET / POST | `/campaigns/:cid/handouts` | Handouts given to you (DM: all) `{can_edit, handouts}` / give one (DM) `{title, text?, to: "everyone" \| [user ids], picture?: {filename, data (base64)}}` (text or a picture) |
| PATCH / DELETE | `/campaigns/:cid/handouts/:hid` | Change one (DM) `{title?, text?, to?}` / take it back (DM; kept in the archive) |
| GET | `/campaigns/:cid/handouts/:hid/image` | A handout's picture (only for those it was given to, and the DM) |
| POST | `/campaigns/:cid/wiki/draft` | The AI as a writing partner (DM) `{mode: draft \| expand \| tidy \| make_up, page_id?, section_id?, page?: {title, kind, sections: [{heading, prompt}]}, what?, notes?}` → `{made, proposals}`; what it writes waits under Waiting |
| GET | `/campaigns/:cid/wiki/:pid/links` | Names in the page's text that match another page but aren't linked (DM) → `{suggestions: [{section_id, name, page_id, title, at}]}` |
| POST | `/campaigns/:cid/wiki/:pid/links` | Link it `{section_id, page_id, version?}` → `{page}` |
| GET | `/campaigns/:cid/wiki/templates` | Templates for new pages (DM) → `{starters: [{id, title, kind, family, sections: [{heading, text (the prompt), available, canon}], facts, builtin}], own: [pages with template: true]}`. A template is made with `POST /campaigns/:cid/wiki` and `template: true` |
| GET | `/campaigns/:cid/wiki/timeline` | The Timeline (DM) `?as=<player id>&truth=1` → `{lanes: [{id, title, page?}], items: [{id, type: page \| event \| journey (from the maps' changes: `done`, `stopped`), page_id, title, text?, family, picture, when: {text, from, to}, canon, by, lane, place: {map_id, map_name, place_id, x, y} \| null, available? (DM)}], undated, sessions, now, calendar, capped, as}` |
| GET / POST | `/campaigns/:cid/wiki` | The wiki's pages and the campaign's players `{pages, players, calendar, clock}` (a player: only the pages they may see, each filtered, links to pages they can't see turned into their words) / make a page `{title, aliases?, kind?, parent?, tags?, available?: "dm" \| "all" \| [user ids], sections?: [{heading, text, available?, canon?, truth?, owner?, sources?}], picture?, banner?, gallery?, when?: {text} \| null, player?: user id \| null (a character's page), events?: [{id?, when: {text} \| null, text, available?, canon?, truth?, sources?}] (the server works out each time from its text with the calendar: `{text, from, to}` in minutes of the clock, null when it isn't a time it knows), facts?: [{label, value, available?, tone?: "friendly" \| "neutral" \| "hostile", sources?}] (up to 60)}`; each section, fact and picture takes `canon`: `true` \| `rumour` \| `false` (with `truth`, never sent to players) \| `planned` (never sent to players) \| `told` (with `owner`) (DM only) |
| GET / PUT / DELETE | `/campaigns/:cid/wiki/:pid` | A page with `mentioned_in`, `unknown_names` and `on_maps` (the places and tokens linked to it: `[{map_id, map_name, kind, id, name}]`) (`?as=<user id>`: what that player may see, or `null`; a player gets their own version, or 404); each also has `embeds` (the pages embedded with `[[!Title]]`, by lower-case name: `{id, title, kind, available, section, section_available, text, canon}`, only those the viewer may see); a character's page also has `from_sheet: {facts, sections, share, mine}`, drawn live from the sheet (everything for the DM and its player, the shared parts for others) / save it `{version, …}` (409 if someone saved first) / delete it (kept in the archive) (DM only) |
| GET | `/campaigns/:cid/wiki/wheel` | The Wheel: every kind family with its count and kinds, the party, and the pages as cards `{families, party, pages}` (`?as=<user id>`: only what that player may see) (a player gets only what they may see: `?as=` is always themselves) |
| GET | `/campaigns/:cid/wiki/home` | The Home: `{count, hero, last_session, families, recent, party, waiting, prep}` (`prep`: the prep page being prepared, a `session plan` page not yet Played, or null) (`?as=`: as that player, without `waiting`) (a player gets only what they may see: `?as=` is always themselves) |
| GET | `/campaigns/:cid/wiki/find?q=` | Find pages (Ctrl K): names first, then pages whose text matches `{pages: [{…, found_by: "name" \| "text"}]}` (`?as=`: only what that player may see) (a player gets only what they may see: `?as=` is always themselves) |
| GET | `/campaigns/:cid/wiki/atlas?map=` | The Atlas's wiki layers on a map (the top one without `map`): `{layers: {map, pins, lands, people, quests}}` (`?as=`: only what that player may see; `layers: null` if they can't see the map) (a player gets only what they may see: `?as=` is always themselves) |
| POST | `/campaigns/:cid/wiki/from-map` | A new page for a map place or token, linked to it `{map_id, kind: "place" \| "token", id}` → `{page, made}` (the page it has if it's linked already) (DM only) |
| POST | `/campaigns/:cid/wiki/:pid/handout` | Send part of a page as a handout `{part: {section} \| {picture} \| {glance: true}, to: "everyone" \| [player ids], share?}` → `{handout, page, page_hidden}` (DM only) |
| GET | `/campaigns/:cid/wiki/web` | The Web: `{around, nodes: [{id, title, kind, family, picture, x, y, r}], lines: [{from, to, labels, tone, canon, by, kind, available?}], bubbles}` (`?around=<page id>&steps=1-3&families=a,b&mentions=1&preset=factions\|family&truth=1&as=`) (a player gets only what they may see: `?as=` is always themselves) |
| GET | `/campaigns/:cid/wiki/evidence` | The transcript lines behind sources `?s=S12 01:02:03` (once per source) → `{evidence: [{source, excerpt}]}` (`?as=`: only sessions that player was at) (a player gets only what they may see: `?as=` is always themselves) |
| GET | `/campaigns/:cid/wiki/:pid/compass` | A page's compass: `{family, chain, children, links_to, linked_from}` (`?as=`: as that player; `compass: null` if they can't see the page) (a player gets only what they may see: `?as=` is always themselves) |
| GET | `/campaigns/:cid/wiki/:pid/history` (`/:version`) | Every version of a page / one version (DM only) |
| POST | `/campaigns/:cid/wiki/:pid/restore` | Bring an earlier version back as a new one `{version}` (DM only) |
| GET / POST | `/campaigns/:cid/wiki/pictures` | The wiki's pictures and everything else with a picture `{pictures, sources}` / add one `{filename, data}` or copy one `{from: {kind, id}}` (DM only) |
| GET | `/campaigns/:cid/wiki/pictures/:id` | A wiki picture, smaller (`?size=thumb`); the DM gets any, a player only one in a part of a page available to them (404 otherwise) |
| GET | `/campaigns/:cid/wiki/picture-sources/:kind/:id` | A small copy of a creature's, item's, map's… picture for the chooser (DM only) |
| GET | `/campaigns/:cid/wiki/proposals` | The AI's proposed changes waiting for the DM, each with what's on the page now, its last run, and the players' characters with no page yet `{proposals, ai_run, characters: [{id, name, character_name, token}]}` (DM only) |
| POST | `/campaigns/:cid/wiki/characters` | Make a character's page `{player}`: named after the character, kind `character`, for everyone, with their token picture → `{page}` (DM only) |
| PUT | `/campaigns/:cid/wiki/:pid/sheet-share` | Which parts of the sheet a character's page shows the other players `{share: [basics \| appearance \| backstory \| allies]}` → `{share}` (the character's player, or the DM) |
| POST | `/campaigns/:cid/wiki/proposals/run` | Have the AI read what the archivist changed now (DM only) |
| POST | `/campaigns/:cid/wiki/proposals/:id/approve` | Approve one, optionally edited `{title?, kind?, page_available?, sections?: [{heading?, text?, available?}], players?, fact?, when?, event?: {when?, text?, available?}, canon?: told \| true \| false, truth? (a player's lore)}` (DM only; an edited section becomes the DM's) |
| GET | `/campaigns/:cid/wiki/quests` | The quest board for the viewer (DM, `?as=` a player, or a player) `{columns: [{key, label}], arcs: [page card], quests: [page card + {status, column, given_by, reward, arc}]}` |
| PUT | `/campaigns/:cid/wiki/:pid/status` | Set a quest's Status fact `{status: a column key or words, version?}` → `{page}` (DM only) |
| GET / POST | `/campaigns/:cid/wiki/lists` | The DM's lists, each with its pages for the viewer (`?as=`) `{lists: [{id, name, filter, pages}]}` (a player gets none) / save one `{name, filter: {family?, kind?, tag?, canon?, fact?: {label, value}} \| {ids}}` (DM only) |
| PUT / DELETE | `/campaigns/:cid/wiki/lists/:id` | Change or remove a list (DM only) |
| POST | `/campaigns/:cid/wiki/lists/make` | Make a list from plain words `{words}` (one quick AI call) → `{name, filter: {ids}, pages}`, not saved (DM only) |
| GET | `/campaigns/:cid/wiki/knows` | Who knows what `{players, pages: [page card + {cells: {<player id>: "all" \| "some" \| "none"}}]}` (DM only) |
| POST | `/campaigns/:cid/wiki/:pid/reveal` | Reveal chosen parts to players in one save `{players, sections?: [ids], facts?: [labels], events?: [ids], version?}` (none chosen: the page and all of it) → `{page, knows}` (DM only) |
| POST | `/campaigns/:cid/wiki/spoilers` | The spoiler check `{players: [ids] \| "everyone", page_id?, sections?, facts?, events?, text?}` → `{spoilers: [{player, name, names: [{id, title}]}]}` (DM only) |
| GET | `/campaigns/:cid/wiki/tidy` | Tidy up: `{rules: [{rule, label, fix, count}], items: [{rule, page?, text, …}]}` (DM only) |
| GET | `/campaigns/:cid/wiki/insights` | What the AI noticed after the sessions, still open `{insights: [{id, type: previously \| loose_thread \| contradiction, kind, text, page_id, page_title, can_fix, run}]}` (DM only) |
| POST | `/campaigns/:cid/wiki/insights/:id/dismiss` · `/fix` | Dismiss one for good / propose a contradiction's fix (it waits under Waiting) → `{insights}` (DM only) |
| GET | `/campaigns/:cid/wiki/embeds` | What a page can embed live (DM only) `{choices: [{kind: creature \| item \| merchant \| handout \| map, name}]}`; `[[kind:Name]]` in a section shows it, and `GET …/wiki/:pid` sends them as `embeds` (keyed `kind:name`, lower case) for that viewer |
| POST | `/campaigns/:cid/wiki/import` | Import (DM) `{filename, data (base64)}` or `{text}`: a zip of Markdown files becomes pages at once `{pages: [{id, title}], skipped: [{name, why}], pictures}`; anything else (a note, text, a Word file, pasted text) goes to the AI and waits under Waiting `{proposals}` |
| GET | `/campaigns/:cid/wiki/export.zip` | The wiki as a zip of Markdown files with its pictures, as the viewer sees it (DM `?as=<player id>` for a player's version; a player gets their own) |
| GET / POST | `/campaigns/:cid/wiki/boards` | Boards the viewer may open (the DM's and those shared with the DM; a player's own) `{boards: [{id, title, dm, owner, owner_name, shared_with_dm, mine, cards, updated_at}]}` / make one, theirs `{title, items?, arrows?}` |
| GET / PUT / DELETE | `/campaigns/:cid/wiki/boards/:id` | One board as the viewer gets it (a card they can't see is `{gone: true}` with its place only) / save (its owner) `{version, title?, items?, arrows?, shared_with_dm?}`, 409 if saved since / delete |
| GET | `/campaigns/:cid/wiki/moments` | The moments to look back to: the end of each session played `{moments: [{number, title, played_on, at}]}`; `?at=<ISO time>` on `GET …/wiki/web` and `GET …/wiki/atlas` (whose layers then have `then_tokens`) shows them as they were; `?characters=1` on `GET …/wiki/timeline` gives each character a lane |
| GET / POST | `/campaigns/:cid/wiki/lore` | A player's lore about their own character (players only): theirs and what became of each `{lore: [{id, type, title, status, page_id, created_at}]}` / add some `{type: section \| page \| relationship \| event, heading?, text?, title?, kind?, label?, value?, when?, available?: "dm" \| "all" \| [user ids]}` (waits for the DM under Waiting) |
| PUT | `/campaigns/:cid/wiki/:pid/lore` | A player changes their own approved part `{section_id, heading?, text}` \| `{event_id, when?, text}` \| `{fact_label, label?, value}` → `{page}` (only its player; one confirmed as true goes back to their account) |
| POST | `/campaigns/:cid/wiki/proposals/:id/reject` | Reject one; the AI won't propose it again (DM only) |
| POST | `/campaigns/:cid/wiki/proposals/approve-all` | Approve every waiting change as it is `{approved, failed}` (DM only) |
| GET / POST | `/campaigns/:cid/maps` | Maps you can see `{can_edit, maps}` (players: only shown maps, without the AI's description) / import one (DM) `{filename, data (base64), name?, page?, read?}` (an image, or a PDF and the page to use, default 1); with `read: true` the AI reads it in the background (otherwise `reading.status` is `none` until `POST .../read`). 429 past `MAP_AI_PER_HOUR` AI calls |
| POST | `/campaigns/:cid/maps/design` | Make a map in the creator (DM) `{name, design}` (SPEC §6.6 "Making a map"): the server draws its picture and sets up its grid, walls, doors, lights and difficult terrain; starts hidden |
| GET / PUT | `/campaigns/:cid/maps/:mid/design` | A made map's design (DM) `{design}` / save it again `{design}`: a new picture, the creator's walls, links, lights and terrain replaced, everything else kept |
| GET | `/campaigns/:cid/maps/design/kinds` | The kinds of starting map the server can make (DM) `{kinds: [{key, name, about, cols, rows}]}` |
| POST | `/campaigns/:cid/maps/design/generate` | Make a starting map (DM) `{kind, cols? (16-60), rows? (12-60), seed?}` → `{name, seed, design}`. Nothing is saved; the same seed and size make the same map |
| POST | `/campaigns/:cid/maps/design/draft` | The AI drafts a map (DM) `{prompt, cols?, rows?, sketch? (base64 picture)}` (both sizes or neither) → 202 `{id, status: pending, ...}`; runs in the background. Two at once per person; 429 past `MAP_AI_PER_HOUR` AI calls |
| GET | `/campaigns/:cid/maps/design/draft/:id` | How a draft is getting on (DM) `{id, status: pending \| done \| failed, error, name, notes, design, started_at}`; kept an hour after it finishes. Nothing is saved |
| POST | `/campaigns/:cid/maps/:mid/levels` | Add a floor to a made map's building (DM) `{n (-9 to 9, not taken), start?: copy \| empty, name?}` → the new map (same size, hidden, `level: {group, n}`) |
| GET | `/campaigns/:cid/maps/:mid/export.dd2vtt` | The map as a Universal VTT file (DM; the map needs a grid): picture, grid, walls, doors and lights, as a download |
| GET / POST | `/campaigns/:cid/map-stamps` | Stamps for the creator (DM) `{builtIn, stamps}` (the 35 that come with it, and the DM's own) / keep one `{name, clip}` (a piece of map: `{cols, rows, floor, walls, assets, paths, labels}`; at most 200) |
| PATCH / DELETE | `/campaigns/:cid/map-stamps/:sid` | Rename a stamp `{name}` / take it off the list (kept in the archive) (DM) |
| GET / POST | `/campaigns/:cid/map-assets` | The DM's own assets for the creator `{assets}` / add one `{name?, filename?, data (base64), blocks?: none \| low \| wall}` (DM) |
| PATCH / DELETE | `/campaigns/:cid/map-assets/:aid` | Rename it or change what it blocks `{name?, blocks?}` / take it off the list (maps using it keep it) (DM) |
| GET | `/campaigns/:cid/map-assets/:aid/picture` | An asset's picture, at most 512 px, WebP (DM) |
| GET | `/campaigns/:cid/maps/events` | Live changes (SSE): `map` (the map as you may see it), `gone` `{id}`, and pings and sketches `ping` / `draw` `{map_id, by, name, color, points}` |
| GET / PATCH / DELETE | `/campaigns/:cid/maps/:mid` | One map / change it (DM) `{name?, kind?: battle \| dungeon \| building \| town \| region \| world \| other (kept when the AI reads it again; on a region or world map tokens are pins), shown?, shown_to?: [user ids] \| null (only these players see it when shown; null: every player), grid?: {size, x, y} \| null, scale?: {distance, unit, per: square \| width} \| null, variant?: id \| null}` / remove it (DM; kept in the archive) |
| POST | `/campaigns/:cid/maps/:mid/bring` | Show players this map (DM): shows it if hidden and makes it the players' map (`brought_at`); every player's page switches to it live and opens on it → the map |
| GET | `/campaigns/:cid/maps/:mid/image` | The picture showing (the original or the chosen variant), the same for players: their page draws the fog over it. The DM can add `?crop=x,y,w,h&size=480` for a small webp of part of it |
| PATCH | `/campaigns/:cid/maps/:mid/fog` | Fog of war (DM) `{enabled?, sight?, map?: dark \| grey \| shown, memory?, dark?, add?: {op: reveal \| cover, x, y, w, h}, undo?, reset?: reveal \| cover, forget?}` (`sight`: line of sight; `map`: what players get outside their sight; `memory`: remember explored; `forget`: players lose the dim view of places they saw) |
| PATCH | `/campaigns/:cid/maps/:mid/walls` | Walls and doors (DM) `{add?: {x1, y1, x2, y2, door?, kind?: wall \| low}, remove?: id, toggle?: id, lock?: id, secret?: id, reveal?: id, clear?: ai \| all}` (`low`: an obstacle, blocks movement only; `toggle` opens or closes a door, `lock` locks or unlocks it, `secret` makes a door secret or ordinary again, `reveal` shows a secret door to players or hides it again) |
| PATCH | `/campaigns/:cid/maps/:mid/lights` | Light sources (DM) `{add?: {x, y, bright, dim}, move?: {id, x, y}, remove?: id, clear?: ai \| all}` (radii in the map's unit; players get where they are, for their page's fog) |
| PATCH | `/campaigns/:cid/maps/:mid/terrain` | Difficult terrain (DM) `{add?: {points: [[x, y], ...]}, remove?: id, clear?: ai \| all}` |
| PATCH | `/campaigns/:cid/maps/:mid/raised` | Raised areas (DM): roofs, wall-walks, cliffs, flat-topped, in feet `{add?: {points: [[x, y], ...], height, bridge?}, set?: {id, height?, points?, bridge?}, accept?: id\|all, remove?: id, clear?: ai\|all}` (accept or correct the AI's guesses; a bridge can be walked under) (SPEC §6.6 "Height") |
| PATCH | `/campaigns/:cid/maps/:mid/climbs` | Stairs and ladders (DM): a line up each, bottom to top `{add?: {kind: stairs\|ladder, x1, y1, x2, y2}, remove?: id, clear?: ai\|all}`; climbing a ladder costs a foot per foot (SPEC §6.6 "Stairs and ladders") |
| POST / DELETE | `/campaigns/:cid/maps/:mid/variants[/:vid]` | Add another picture of the map (DM) `{filename, data (base64), name?}`, stretched to the map's size, the upload archived as it came → `{map, variant}` / remove one (kept in the archive) |
| PATCH | `/campaigns/:cid/maps/:mid/links` | Links to other maps (DM) `{add?: {x, y, to, label?}, move?: {id, x, y}, remove?: id}` |
| PATCH | `/campaigns/:cid/maps/:mid/places` | Places on the map, the world's atlas (DM) `{add?: {name, x, y, points? (an area), group?, to? (a smaller map it opens), record?: {id}, revealed?, revealed_to?: [user ids] \| null}, set?: {id, ...}, move?: {id, x, y}, remove?: id}`; each map is a place on one map only, never inside itself. Players get the places revealed to them (no record), opening a map only if it's shown to them |
| POST | `/campaigns/:cid/maps/:mid/links/:lid/use` | Take a token through a link `{token}` → `{map (the other one), token (its id there)}`. A player: their own character, within a square and a half, to a shown map. The DM: any token |
| POST | `/campaigns/:cid/maps/:mid/places/:pid/enter` | Go into a place `{token}` → `{map (the one it opens), token}`: the token and whoever follows it arrive at that map's way back out, or its middle. A player: their own, at a place revealed to them, to a map shown to them. The DM: any token |
| POST | `/campaigns/:cid/maps/:mid/leave` | Out to the map around this one `{token}` → `{map, token}`: arriving at this map's place there, with whoever follows. A player: their own, to a map shown to them, at a way out (a link there) if they can see one |
| POST | `/campaigns/:cid/maps/:mid/tokens/:tid/journey` | A journey across the map `{x, y} \| {place}, pace?: slow \| normal \| fast, by?: foot \| riding \| wagon \| rowboat \| keelboat \| sailing \| longship \| galley \| warship, hours? (on the road a day), minutes? (DM)` → `{map, token, clock, notes? (DM)}`: the token and whoever follows it set off by the in-game clock along the way the server works out (roads, rivers, difficult terrain), arriving when the clock reaches its time (the campaign's travel settings can skip it). `{preview: true}` → `{plan}` only says what it would be. `{stop: true}` ends it where they are; `{arrive: true}` (DM) puts them there now. A player: their own token |
| GET / POST | `/campaigns/:cid/clock` | The in-game clock `{clock, calendar}` (minutes since day 1 began, and the campaign's calendar or null) / move it (DM) `{add?, set?, next_arrival?: true, stop?: false}` → `{clock, notes}`: everyone on a journey moves along, and arrives when it reaches their time; random encounters (which stop the clock unless `stop: false`), forced marches and merchants restocking by days are in `notes` |
| PATCH | `/campaigns/:cid/maps/:mid/roads` | Roads and rivers (DM) `{add?: {kind: road \| river, x1, y1, x2, y2}, remove?: id, clear?: 'all'}` |
| POST | `/campaigns/:cid/maps/:mid/ping` / `draw` | Ping a spot `{x, y}` / sketch a line `{points: [[x, y], ...]}` (2 to 500) for everyone looking; not saved; 20 per 10 s |
| POST | `/campaigns/:cid/maps/:mid/doors/:wid/toggle` | Open or close a door. The DM: any. A player: a door they can see, not locked, within a square and a half of their token |
| POST | `/campaigns/:cid/maps/:mid/walls/draft` | The AI drafts walls and doors from the picture, in the background (DM) `{effort?}` (`low` to `max`; left out, `EFFORT_WALLS`). Replaces its earlier draft; the DM's own walls stay |
| GET | `/campaigns/:cid/maps/records` | The campaign's records, people first, for linking a token (DM) |
| GET | `/campaigns/:cid/maps/records/:rid` | One record (DM); `?title=` finds it if its id changed |
| POST | `/campaigns/:cid/maps/:mid/read` | Read the map with the AI again (DM) |
| POST | `/campaigns/:cid/maps/:mid/tokens` | Add a token (DM) `{kind: pc \| npc \| enemy \| companion, name?, user_id?, size?, color?, x?, y?, hp?: {current, max}, conditions?, hidden?, record?: {id}}`. A player adds a companion or summon of their own `{name, size?, color?, x?, y?, hp?, darkvision?, speed?, stats?}` (at x, y if they can see it, else next to their character, which it follows; 12 per player per map). A player character is on one map at a time: adding one who is on another map brings their token (and whoever follows it) over |
| PATCH / DELETE | `/campaigns/:cid/maps/:mid/tokens/:tid` | Change a token: the player it belongs to may set `{x, y, path?, hp, conditions, light, darkvision, follows}` (`follows`: a token on this map they can see, or null; moving it themselves stops it following, and its own followers walk behind it outside a fight) (`path`: waypoints on the way, walls checked on every leg; in a fight the cost counts toward the turn's movement), on their companions and summons also `{name, size, color, speed, stats}`; the DM anything (also `speed`) / remove it (DM; a player dismisses their own companion). Snapped to the grid by the server. A player character whose player has saved a sheet has the sheet's hit points (`hp_sheet: true`): `hp.current` is saved to the sheet and `hp.max` is ignored |
| PUT / DELETE | `/campaigns/:cid/maps/:mid/tokens/:tid/picture` | Give an NPC or enemy token a picture (DM) `{filename, data (base64), same_name?}` (`same_name`: every token on the map with that name) / back to initials |
| GET | `/campaigns/:cid/maps/:mid/tokens/:tid/picture` | That picture, 256 px square (for whoever can see the token) |
| POST | `/campaigns/:cid/maps/:mid/tokens/:tid/stats` | Fill the token's stat block with the AI (DM, or a player for their own companion: never from the DM's creatures) `{name?}`; 404 if the AI doesn't know the creature |
| POST | `/campaigns/:cid/maps/:mid/creatures/:crid` | Put one of the DM's creatures on a map (DM) `{count? (1-20), x?, y?, hidden?, name?}`; a group is numbered and set out in a row. Returns `{map, tokens}` |
| GET / POST | `/campaigns/:cid/creatures` | The DM's creatures (DM only) `{creatures}` / save one `{name, kind: enemy \| npc, size?, color?, hp_max?, ac?, darkvision?, speed?, stats?, record?, notes?, picture?: {filename, data}}`, or `{from: {map_id, token_id}}` to save a token from a map |
| PATCH / DELETE | `/campaigns/:cid/creatures/:crid` | Change one (DM; placed tokens keep what they had) / remove it (DM; kept in the archive) |
| GET / PUT / DELETE | `/campaigns/:cid/creatures/:crid/picture` | Its picture, cut to a square (DM) / give it one `{filename, data}` / back to initials |
| POST | `/campaigns/:cid/creatures/:crid/stats` | Fill its stat block with the AI (DM) `{name?}`; 404 if the AI doesn't know the creature |
| GET / POST | `/campaigns/:cid/items` | The DM's items (DM only) `{items}` / save one `{name, kind?, rarity?, attunement?, price? (copper), weight?, text?, notes?, stats? (the numbers for its kind: `{weapon, armor, magic, heal, charges, effects}`, null to read them from the description), picture?: {filename, data}}` |
| PATCH / DELETE | `/campaigns/:cid/items/:iid` | Change one (DM) / take it off the list (DM; merchants keep selling it; kept in the archive) |
| GET / PUT / DELETE | `/campaigns/:cid/items/:iid/picture` | Its picture, square (DM) / give it one `{filename, data}` / none |
| POST | `/campaigns/:cid/items/lookup` | Look an item up and save it (DM) `{name}`: your items, then the books, then the AI → `{item, from: yours \| book \| ai}`; 404 if no one knows it |
| GET | `/campaigns/:cid/gear/equipped` | What each player has equipped (DM): `{players: [{user_id, name, character, ac, ac_own, gear: [{name, item_id, picture, kind, equipped, qty, proficient, magic, attuned, attunement, armor, effects, to_hit, damage}], carried, capacity, load, attuned, features: [{id, name, kind, max, left, recharge, custom}], wild_shape}]}` (class features' uses left, the Wild Shape form they're in); nothing else from the sheets |
| POST | `/campaigns/:cid/items/:iid/fill` | Fill in a saved item the same way (DM) `{name?}`; a price you set stays |
| POST | `/campaigns/:cid/items/find` | Have the AI find an item on the web with a picture (DM) `{query}`; 202, fills in in the background like creatures |
| GET / POST | `/campaigns/:cid/merchants` | The DM's merchants with stock, sales and where their tokens are (DM only) / set one up `{name, description?, notes?, color?, open?, restock_every? (long rests), restock_days? (in-game days), picture?}` |
| PATCH / DELETE | `/campaigns/:cid/merchants/:mid` | Change one (DM) / close it down (DM; its tokens stay as NPCs) |
| GET / PUT / DELETE | `/campaigns/:cid/merchants/:mid/picture` | Its picture (the DM, or a player who can see it) / give it one (DM) / none (DM) |
| POST | `/campaigns/:cid/merchants/:mid/stock` | Sell an item (DM) `{item, price? (copper; default its usual price), qty? (null: no limit; default 1), full? (restock to; default qty)}` |
| PATCH / DELETE | `/campaigns/:cid/merchants/:mid/stock/:lid` | Change a line `{price?, qty?, full?}` / stop selling it (DM) |
| POST | `/campaigns/:cid/merchants/:mid/restock` | Everything back up to its restock level now (DM) |
| POST | `/campaigns/:cid/maps/:mid/merchants/:mrid` | Put a merchant on a map as a token (DM) `{x?, y?, hidden?}` → `{map, token}` |
| GET | `/campaigns/:cid/merchants/:mid/shop` | The shop: what it sells, prices, how many are left, and (players) the coins on your sheet. Players: only while they can see one of its tokens (else 404) |
| GET | `/campaigns/:cid/merchants/:mid/items/:iid/picture` | The picture of an item it sells (as the shop) |
| POST | `/campaigns/:cid/merchants/:mid/buy` | Buy (players) `{line, qty?}`: the coins come off your sheet (with change), the item goes into its inventory, the stock goes down → `{shop, sheet_version, bought}`; 400 if closed, sold out or you can't afford it |
| POST | `/campaigns/:cid/creatures/find` | Have the AI find a creature on the web, official or not, with a picture (DM) `{query}`. 202 with the creature as `finding: {status: pending}`; it fills in (or `failed`, with `error`) in the background. 429 past `MAP_AI_PER_HOUR` |
| POST | `/campaigns/:cid/maps/:mid/combat` | The fight on a map `{action: start \| end \| next \| prev \| add \| remove \| roll \| set, ids?, id?, init?}` (entries count `moved` this turn) → `{map, rolls: [{id, name, d20, mod, total}]}`. DM: everything (`start` with `ids` or every token; NPCs and enemies roll at once; `roll` without `id` rolls every NPC not rolled yet). A player: `roll` (once) or `set` for their own token, and `next` on their own turn |
| GET | `/campaigns/:cid/maps/:mid/tokens/:tid/actions?target=` | What a token can attack or cast with (its owner or the DM): `{attacker, target, gap, unit, actions: [{id, name, kind: attack \| save \| auto \| heal, bonus?, dc?, save?, damage, area?, level?, situation}], riders, slots}` |
| POST | `/campaigns/:cid/maps/:mid/attack` | Attack or cast from the map `{attacker, action, target? \| template?, mode?: normal \| advantage \| disadvantage, slot?, use_slot?, riders?, rider_options?: {rider id: slot level \| "free"}, two_hands?}`: the server rolls, applies damage and saves (or leaves them for the DM's OK) and Weapon Mastery (Graze on a miss, Topple's prone) → `{map, attack, rolls}`. Players only with their own tokens; off when Campaign settings say so |
| POST | `/campaigns/:cid/maps/:mid/attacks/:aid` | The DM settles an attack `{do: apply \| half \| skip \| undo, target?}` → `{map, attack}` |
| POST | `/campaigns/:cid/maps/:mid/templates` | Place an area of effect (anyone who can see the map) `{shape: circle \| cone \| line \| cube, x, y, angle?, size, width?, label?, color?}` (size and width in the map's unit) |
| PATCH / DELETE | `/campaigns/:cid/maps/:mid/templates/:tid` | Move, turn, resize or relabel a template / remove it (whoever placed it, or the DM) |
| GET / POST | `/campaigns/:cid/maps/:mid/pins` | Your own pins on the map `{pins}` / add one `{x, y, label?, color?}` |
| PATCH / DELETE | `/campaigns/:cid/maps/:mid/pins/:pid` | Move or relabel one of your pins / remove it |
| GET | `/campaigns/:cid/usage` | AI usage this month by step and provider, plus average answer times (DM) |

`/ask` streams these events: `conversation`, `turn`, `tool` (what it's searching), `text` (answer tokens), `done` (`answer`, `evidence` (the transcript lines behind each citation), cost, `durationMs`, `path`: `quick` for a general D&D lookup answered the quick way, else `full`), and `error`. On each new `turn`, replace any text you've displayed rather than appending to it.

## Tests

```sh
npm test
```

Tests use a fake AI (the fake archivist calls the real knowledge-base tools) and a fake search model, so they're free and run offline.

The web page is tested without a browser: `packages/web/test/page.js` loads the real page in jsdom against a real test server. A page test looks like:

```js
import { withPage } from './helpers.js';

test('notes: a player saves a note', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page, t) => {
    page.click('[data-tab=notes]');
    page.type('#note-form textarea', 'The miller lied.');
    page.submit('#note-form');
    await page.settle();
    // assert on page.$(...), page.requests, or the server through t
  });
});
```

`withPage` fails the test if the page throws. See the existing tests in `packages/web/test/` for dialogs, uploads, dragging and live updates.

**Regression tests** guard bugs that were found and fixed. They're ordinary tests whose names start with `regression: `, kept next to the related tests; [docs/regressions.md](docs/regressions.md) lists each bug and its test.

```sh
npm run test:regressions   # only the regression tests (about 20 seconds)
```

In Claude Code, the `regression-keeper` worker (`.claude/agents/`) writes and checks them, and a hook (`.claude/settings.json`, `.claude/hooks/regressions.mjs`) runs them before every `git commit` that touches `packages/`, stopping the commit if one fails.

## Licences

Spell text in `packages/server/src/sheets/srd-spells.json` and the beast stat blocks in `packages/server/src/sheets/srd-beasts.json` are from the System Reference Document 5.1 by Wizards of the Coast LLC, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode), as prepared by the [5e-bits/5e-database](https://github.com/5e-bits/5e-database) project (MIT).

The 3D dice and their sounds are [@3d-dice/dice-box-threejs](https://github.com/3d-dice/dice-box-threejs) (MIT), which bundles [Three.js](https://threejs.org) and [cannon-es](https://github.com/pmndrs/cannon-es) (both MIT).
