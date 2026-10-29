# Using the app

What each part of The Party Ledger does, for the admin, the DM and the players. Setup and hosting are in [hosting.md](hosting.md); the design behind each feature is in [SPEC.md](../SPEC.md) §6.

## The admin screen

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

## Character sheets

Each player has a **Sheet** tab (the DM has Creatures instead, and no sheet), laid out like the official 5e sheet (core stats, then character details, then spells). It's private to them, saved to the server a moment after they stop typing, and archived. A player can have **several characters** and plays one at a time: the strip above the sheet says who they play now, and **Characters** lists them with **New character**, **Make active**, **Rename** and **Delete**. The active one is their sheet, their token on maps, the one rests and purchases change and the one the DM sees; the others are kept, private to them.

- **Automatic values** (modifiers, proficiency bonus, saves, skills, passive Perception, initiative, AC (from the armour and shield equipped on the Inventory tab, or unarmoured), speed, HP, hit dice, spell save DC and attack bonus, spell slots) are worked out from the scores, classes and race using the 2014 Player's Handbook rules. Anything a player types into one of those boxes becomes **their own value**: it's marked, never changed by the rules, and stays until they click ↺.
- **Upload a sheet**: a PDF (filled-in form, typed or scanned), a photo, a text file, or a sheet downloaded from here. The AI copies it in; numbers on their sheet that differ from the rules are kept as their own values. The uploaded file is archived as it was.
- **Spells**: type a name to add one, and its details are filled in from (1) the SRD 5.1 spell list built into the server, (2) the PDFs in the books folder, or (3) the AI's own knowledge, labelled as such. Every detail can be edited. Details are only replaced when the player asks.
- **Books**: drop PDFs into `DND books` next to this repo (`BOOKS_DIR` in `.env` to change it). Scanned books need an OCR text layer (if a scan has none, run it through `ocrmypdf` once). The server reads them into memory at start-up (a few seconds; nothing is stored). EPUBs aren't read. The books are used for spell lookups and by Q&A, which can search them, read pages and browse their contents to quote a rule, citing the page ("Player's Handbook p. 195"). Use each book's name and year as the file name ("Player's Handbook (2014).pdf"); that's how Q&A refers to it. Q&A checks every rules question in the books, and uses the rules of the group's Player's Handbook edition.

## Class features

Every sheet has a **Class features** box (under Attacks; in the Tabs layout, on Actions) listing what the character's classes give them to keep count of, for the campaign's rules edition: Rage, Bardic Inspiration, Channel Divinity, Second Wind, Action Surge, Ki (Focus) Points, Lay on Hands, Sorcery Points, Mystic Arcanum, Arcane Recovery and the rest, plus worked-out numbers like Sneak Attack dice. Tick a use (or spend points with − and +); the maximum comes from the level and can be typed over (↺ goes back). **Use** on Second Wind rolls the healing on the server and adds it. Sorcerers turn slots into points and back, wizards pick the slots Arcane Recovery gives back, warlocks get Pact Magic slots back. **+ Add your own** adds a row for anything else (a feat like Lucky, Breath Weapon, homebrew) with how many and when it comes back. A druid's Wild Shape is a row here, with the forms under it. Rests give uses back; the DM sees what's left under Items in the wiki.

Under them, **Subclass features** shows the rows of the subclass typed on the sheet (the subclass box suggests the Player's Handbook's, 2014 and 2024): Superiority Dice, Warding Flare, Arcane Ward, domain and oath Channel Divinity options and the rest. A Circle of the Moon druid (2014) spends a spell slot to heal their Wild Shape form (rolled on the server); a diviner rolls Portent's d20s and keeps them on the sheet until used. A subclass from another book says to add its rows by hand.

## Rests and hit dice

The Hit dice box on a player's sheet has a row per die size (a Fighter 3 / Wizard 2 has d10s and d6s) with a tick per spent die. **Spend** rolls that die plus the Constitution modifier (on the server, shown with the dice and shared like any roll) and adds the hit points, up to the maximum. **Short rest** gives back what a short rest does on the sheet (Pact Magic slots). The DM gets a **Rest** button in the header: tick who rests (everyone by default) and choose Short rest or Long rest. A long rest gives back all hit points, every spell slot, and spent hit dice (up to half the character's total under the 2014 rules, all of them under 2024), and clears temporary hit points and death saves; under the 2014 rules a character at 0 hit points gets nothing from it. Each player's sheet changes at once and they get a note. The rules follow the campaign's **Rules edition** (the DM's Settings). Until the DM picks one: `REST_RULES=2014` or `2024` in `.env`, else the edition of the Player's Handbook in your books folder (2014 if there's none, or both). A player character's map token shows the sheet's hit points, so it follows; NPCs' and enemies' tokens aren't changed, and nor are item charges.

## Inventory and campaign settings

Players have an **Inventory** tab: look an item up by name (PHB weapons and armour straight from the tables, anything else from the books or the AI, never the DM's own items) or add one by hand, then equip it. Equipped weapons show in Attacks with their to-hit and damage worked out; equipped armour and a shield set the AC; weight, charges, attunement and magic items' effects on the sheet are tracked there too. The DM's Items (in the wiki) shows what each player has **equipped** (with their AC, weight carried and attunements), not the rest of their sheet.

The DM's **Campaign settings** (in the account menu under their name, top right) holds the campaign's settings: the **Rules edition** (2014 or 2024: rests, Ask's rules answers and lookups in the books follow it; the character sheet itself always uses the 2014 rules for now) and **Weight limits** (carrying capacity, variant encumbrance, or ignore), and the **Calendar**: Simple (Day 1, Day 2…), Harptos, Gregorian-like, Exandria or your own, which the in-game clock reads everywhere ("3 Mirtul 1492 DR, 18:30 · Full moon"). It also holds **Your own backgrounds**: the DM's own, with their skills, tools, languages, equipment, gold and a feature or origin feat, which every player's sheet then suggests.

On the sheet, the **Background** box suggests the books' backgrounds for the campaign's edition (and the DM's own). Pick one and it fills in the sheet: its skills ticked, its feature or feat in Features & traits, its tools and languages, and equipment and gold only where they're empty. A note says what changed, with Undo. Above the sheet, **Help making a character** (open while the sheet has no class) says what the class, race or species and background give and what to choose, by the campaign's edition: click a skill to tick it, or put the class's starting equipment in the Equipment box.

## Dice

The **Dice** button in the player's header opens a dice tray: click dice to build a roll (or type one, like `2d6+3` or `d%`), choose advantage or disadvantage for the next d20, choose **who sees your rolls** (everyone, only the DM, or only you; the DM's "only me" is a secret roll), and see the table's recent rolls, yours and everyone else's you may see. Someone else's roll pops up briefly at the top right. On the Sheet tab, clicking a save, skill, ability name, initiative or spell attack rolls it, and the dice button next to an attack rolls to hit, then offers its damage (doubled dice on a natural 20). Shift-click rolls with advantage, Alt-click with disadvantage.

The **server rolls** (a secure random number). The page then throws 3D dice with real physics and relabels their faces so they land on the server's numbers, so a roll can't be faked from the browser. The 3D dice (Three.js and cannon-es for Deluxe, [dice-box-threejs](https://github.com/3d-dice/dice-box-threejs), MIT, for Classic) are served by this server and loaded when the dice tray opens; by default they take the theme's accent colour, and the tray has 23 other **dice styles** (Dragonfire, Frost, Necrotic, Thylean Bronze, Here Be Dragons, Glitter Party...; textures load only for the style in use). **Effects:** each style's dice leave a trail while they roll (embers, snow, sparks, stars, smoke, bubbles, petals); a natural 20 gets a golden burst and banner, a natural 1 a red flash, smoke and a shake, and damage with every die on its highest face a sparkle, with small chimes when sound is on. Animation, effects and sound can each be switched off in the tray; with reduced motion on, the result just appears. Rolls are kept in the database (not the archive) for the table's roll list.

**Rollers:** two, set for everyone with `DICE_ROLLER` in `.env` (restart the server); anyone can pick the other for their own browser under **Roller** in the dice tray.

| `DICE_ROLLER` | What you get |
|---|---|
| `deluxe` (default) | The fanciest: glossy, metal and see-through dice with reflections, soft shadows, engraved and glowing numbers, sounds, and a pulsing glow on a natural 20, natural 1 or max damage. About 1.7 s. Lowers its own quality on a slow device. |
| `classic` | The original 3D dice ([dice-box-threejs](https://github.com/3d-dice/dice-box-threejs)): full physics and shadows. About 3.5 s a roll. |

If one can't start (no WebGL), the other is tried, then the result just appears. The dice libraries are sent compressed (about 2.4 MB down to about 0.4 MB) and start loading when the dice tray opens, so the first roll doesn't wait for them.

## Handouts

The **Handouts** tab: the DM gives players a picture and/or text (a letter, a wanted poster, a riddle), to everyone or to chosen players, and can change who gets it or take it back. Players see only the ones given to them; a new one arrives straight away and puts a count on the tab. Handouts are archived, and the archivist gets them (with who got them) between sessions.

## The DM's Wiki tab

Only the DM writes it; each player reads their own version, with only the pages and parts available to them. Pages for people, places, factions, lore, anything: each has sections, other names, a kind, tags and can sit inside another page; `[[Page name]]` links pages. Every page, section, and block of text (`:::for Thorin` … `:::`, `:::dm` … `:::`) says who it's available to; new pages are the DM's alone. View as shows a page as a player sees it. Ask uses all of it for the DM and only what's available to the asking player. Every save is kept, and History can bring an older version back.

After each session (and each correction or batch of sheet changes) the AI reads what the archivist recorded and proposes wiki changes: new pages, changed or new sections, and reveals ("Thorin read the ledger: make that section available to him?"). They wait under **The AI's changes** for the DM to approve, edit then approve, or reject; nothing reaches a page before that. Each proposed part is offered only to the players who know it. A section the AI wrote stays the AI's to keep up to date until the DM changes it. **Read the records now** runs it on demand (for a campaign that already had sessions); `WIKI_AUTO=off` leaves it to that button. `MODEL_WIKI` and `EFFORT_WIKI` (default `medium`) set its model and effort.

## The DM's Archivist tab

Only the DM has it. It lists the archivist's questions (when sources disagree, e.g. two spellings of an NPC), each with an answer box and Dismiss; an answer becomes a correction. Below, the DM can send any correction in plain words and see earlier ones. The archivist applies them in the background.

## Notes

The **Notes** tab: private notes, grouped by session date. Each can be edited or deleted; the archive keeps every version. Changes to notes for a session that was already processed reach the archivist later, like sheet changes.

## What the archivist reads between sessions

Besides transcripts and notes, the archivist gets each player's character sheet (in full the first time, then every change with the time it was saved), notes written, edited or deleted after their session was processed, and handouts (their text, and what the AI read in their pictures: any writing word for word, then what it shows). This runs once things have been quiet for `ARCHIVIST_UPDATES_DELAY_MINUTES` (default 10), so filling in a sheet is one AI run, not one per keystroke. What's only on a sheet stays known only by that player in the knowledge base, though the DM sees every record (as with notes).

## Maps

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

## The DM's Creatures tab

In place of a character sheet, the DM keeps a **Bestiary** tab with two lists: the bestiary (kinds of creature, under their type and by challenge) and **People** (NPCs, one each, with their role). Each has a name, friendly or hostile, size, colour, hit points, AC, speed, darkvision, a stat block (typed, or filled in by the AI), a picture and private notes. **Place on map** (or picking one under **Who is it?** in Add token) puts one or a numbered group on the map; **Save to creatures** keeps a token from a map. **Find online** has the AI search the web (official or homebrew) for a creature and bring back its stat block, a link to where it found it, and a picture if it can download one. The server only downloads from the public internet, never from your PC or home network.

Everyone can drop **pins** with a note on a map; only the person who placed them sees them, not even the DM.

## Items and merchants (the DM)

**Items** keeps what merchants sell: make one, **Look up** one by name (your items first, then the books in `DND books`, then the AI), or **Find online**. **Merchants** sets up shops: add items with a price, how many are in stock (or no limit) and what restocking brings them back up to; restock every so many long rests the DM calls with **Rest**, or with **Restock now**; **Place on map** puts the merchant down as a token with a gold badge. Players pick the token, press **Shop** and buy on their own: the coins come off their sheet (with change) and the item goes into their Inventory. **Sales** shows who bought what.
