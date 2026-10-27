# The wiki as its own space: build plan

Kenny, 2026-10-27:
- "This is a big unit of work. Before you start, plan it all out on high effort, then we will develop on medium to save tokens. Plan for now."
- "I want the truth/rumour switch. And yes, players should be able to contribute their own lore regarding their characters. Remember, an important part here is a VISUAL navigation. Fold everything you found into the planning before we proceed."
- "The stuff in wiki-gaps-and-improvements.md gets folded into the planning as well, mind."

This is the whole plan. It builds on [wiki-beyond-a-tab.md](wiki-beyond-a-tab.md, in the project files) (research and sketches) and [wiki-gaps-and-improvements.md](wiki-gaps-and-improvements.md, in the project files) (what others have, and how to do better). **Every item in the gaps note is in a stage below**, except the three it marked "no" (audio, co-editing, a public website), which stay out unless Kenny asks.

It's written for development sessions on **medium effort**: each PR says what it's for, which files it touches, what changes on the server and on the page, and how it's tested, so nobody has to plan it again. Nothing is built yet. It was checked against `main` at PR #97 (`PIPELINE_VERSION` 28, schema v20).

## What's decided

| Question | Answer | From |
|---|---|---|
| Is the wiki a tab? | No: a space of its own, with visual navigation | Kenny, 2026-10-27 |
| Truth and rumour | Yes: a switch on every part (see "Truth and rumour") | Kenny, 2026-10-27 |
| Do players write? | Yes, about their own characters: their lore, which the DM reviews (stage 6) | Kenny, 2026-10-27 (replaces "players never write" from 2026-10-20) |
| Players reading the wiki | Their filtered version opens in stage 6, because their lore needs a home they can see. This is the plan's default; say if lore should live on the Sheet instead. | Assumed from the line above |
| Space only, woven in, or both | **Both**, the recommendation. The decision card is still open. "Space only" drops PR 1d's links and drawer; "woven in" drops the shell. | Default |
| The AI's changes, the DM approving, Ask reading the wiki, granular "available to" | As before | Kenny, 2026-10-20 |

## Visual navigation (the main design rule)

Kenny: "an important part here is a VISUAL navigation". In the space, you move around by pictures, not by lists of words. Lists exist only as a fallback (screen readers, and some phone views).

1. **Four ways in, all pictures.** Every view answers one question:

   | Question | View |
   |---|---|
   | Where? | the **Atlas**: maps with page pins |
   | Who? | the **Web**: portraits with labelled lines |
   | When? | the **Timeline**: a ribbon of picture cards |
   | What? | the **Wheel**: kind families in a colour wheel around the party, opening into picture cards (ScribesBlade's World Bible) |

2. **The Home is a visual hub**, not a menu: the campaign's picture, the Wheel, a live mini-Atlas, a mini-Web around the party, a mini-Timeline of recent sessions, and picture cards of what changed. Clicking any of them goes into that view at that spot.
3. **Every page has a compass strip.** Under the banner sit four small live views of that page: its spot on the map, its nearest people as a ring of portraits, its moments on a mini ribbon, and its family colour with "inside" and "contains" as picture chips. Clicking one opens the full view centred on the page. You can always go from a page to any view, and back, by picture.
4. **Breadcrumbs and history as pictures.** "World › The Vale › Millbrook" is a row of small pictures. The **trail** of pages you've opened is a strip of portraits at the top, a visual Back.
5. **Zoom to go in.** In the Atlas, zooming into a place that opens a map goes into that map, and names appear as you zoom (ScribesBlade's deep zoom). Zooming out goes back up.
6. **One colour language.** Each kind family has one colour and icon (`KIND_FAMILIES`), used everywhere: the Wheel's slices, the Web's node rings, the Timeline's bars, the Atlas's pins, card edges and link underlines. Truth and rumour also look the same everywhere (see below).
7. **The rail is pictures too.** Each view's button carries a tiny live picture of it (the world map, the web, the ribbon) and folds to icons. On a phone, the ☰ sheet shows the same tiles.
8. **Search answers with cards.** Ctrl K shows picture cards, not a list of titles.
9. **The phone stays visual.** The Wheel and cards fit as they are. The Atlas is the map. The Web becomes a **ring**: one page in the middle with its neighbours round it, and a tap re-centres. The Timeline becomes a vertical ribbon of cards.
10. **Every PR that adds a view checks it in a real browser** (`scripts/browser.js`) at 1280 px and 390 px, in a light and a dark theme, and puts screenshots in the PR.

## Truth and rumour

Every section, fact (so every relationship), event and picture caption has a **canon**:

| Canon | Means | The DM sees | A player sees |
|---|---|---|---|
| `true` (default) | It's so | plain | plain |
| `rumour` | Heard, not confirmed | a "Rumour" badge, dotted line or pin | "Rumour" |
| `false` | The players believe it, but it isn't so; the DM can add the truth beside it (`truth`, DM only) | "False", struck red, with the truth beside it | "Rumour", never "false" |
| `planned` | The DM's prep, which may change and hasn't happened in play | faint, "Planned" | **nothing**: the server treats planned parts as the DM's only, whatever "available to" says, until the DM switches them to true |
| `told` | A player's account (their character's lore, a backstory) until the DM confirms or denies it | "Thorin's account" | "Thorin's account" (or "Your account" to Thorin) |

- It looks the same in every view: dotted or wavy for rumour, struck red for false (DM only), faint for planned (DM only), and a quote mark for an account.
- The DM's **Truth** toggle in the space bar switches between "what's true" (rumours and falsehoods hidden, truths shown) and "as they believe it". View as a player always shows their belief.
- **Ask** gets the canon with each part: `[rumour]`, `[Thorin's account]`, and for the DM `[false: the players believe this. Truth: …]`. Its prompt says to answer players with rumours as rumours, never to confirm or deny falsehoods, and to tell the DM what's true. The Q&A *model* doesn't change, only its instructions.
- **The AI** sets canon on what it proposes from the records' wording and status (a record marked as a rumour or unconfirmed gives `rumour`). The server never lets the AI make a part `planned` or `told`, and a reveal never changes canon.

## Players' lore about their characters

- Each player character gets a **character page** linked to the player (`page.player`). The DM makes it, or approves the one offered automatically when a character first appears. The sheet's name, race, class and level appear live in its facts, and its appearance, backstory and allies appear live as "From the sheet" parts. These are drawn from the sheet, never copied, and follow the sheet's privacy: the DM and the owner see them, and other players only if the owner shares.
- A player can write **lore**:
  - sections on their own character page
  - **new pages about their past**: people, places, factions, items, lore ("My old mentor Brannoc", "The village of Hollowmere")
  - their character's **relationships** (facts like "Mentor: [[Brannoc]]") and **events** ("Year 1480: Hollowmere burned")
- They choose who each part is for: only the DM (the default, for backstory secrets), the DM and chosen players, or everyone.
- What they write waits for the DM under **Waiting for you → From players**, next to the AI's changes: Approve, Edit then approve, or Reject. Approved parts are `by: 'player'`, owned by that player, with canon `told`. The player can keep editing their own approved parts, and those edits apply at once and show in the DM's Recent changes. New pages and new sections always wait.
- The DM can switch a part to true or false (with the truth beside it), narrow who it's for, add their own sections and `:::dm` notes, and edit it, which keeps it the player's but marks it "edited by the DM". The AI never rewrites a player's part. Like DM sections, it only suggests changes when the records disagree.
- **Ask** reads lore like any other part (who it's for, plus its canon). The archivist keeps not reading the wiki (as decided 2026-10-20). It already reads the sheet's backstory, which is still "the player's account until play confirms it".

## Rules every PR keeps

1. **One owner for each thing, links between them, never copies.**
   - The maps own geography and who sees it.
   - The wiki owns what things are.
   - Creatures, Items, Merchants and Handouts own their statblocks, items, shops and handouts; pages embed them live.
   - The sheet owns the character; character pages show it live.
2. **Every view is a way of looking at pages.**
   - Relationships are facts holding `[[links]]`.
   - Events are dated lines on pages.
   - Clues and secrets are small pages embedded in others.
   - Faction lands are area places linked to faction pages.
   - People's spots come from their tokens or their "Where they are" fact.
   - Only boards are new data (stage 10).
3. **The server filters everything for the viewer.** Each endpoint takes `?as=<player id>` for View as and works out the DM's and a player's versions in the same code. Anything hidden is never sent: no node, pin, event, line, label, count, position, id or picture. A `planned` part is the DM's only. Every endpoint with `?as=` checks that the id is a player in the campaign.
4. **Archive first.** New things live inside things that are already archived (page JSON in `wiki/<id>/changes.jsonl`, map JSON, campaign settings, `wiki/proposals.jsonl`), or get their own archive file (boards). A rebuild restores all of it.
5. **`PIPELINE_VERSION` +1** with every change to an AI prompt or schema (marked "AI +1" in the PRs). Number each bump when it lands, because PRs land one after another. Schema v21 comes only with boards.
6. **Tests:** each PR adds tests for what it builds (`server/test/wiki-*.test.js`, `web/test/wiki*.test.js`, fake AI only), and each view or route adds a **privacy test**: a player's version never contains a hidden page's id, title or picture, a `planned` part, a `:::dm` part, another player's lore meant only for the DM, a hidden line, event or pin, or a count that includes hidden things. Regression tests (`regression: …`, listed in `docs/regressions.md`) are only for bugs found and fixed along the way. Run `npm run test:regressions` and then `npm test`.
7. **Docs in each PR:** SPEC §6.11 (rewritten in PR 1a as "The wiki's space", with a subsection per view), HANDOFF (the change log, Current state, Next steps, and "Checks to run in VS Code" for what only Kenny's machine can show), and the README API list.
8. **Kenny's rule:** merge each PR once it's green, then go on to the next.

## How it fits together

### The page

- **Spaces.** `<html data-space="table|wiki">`. The table space is today's top bar and tabs. The wiki space hides them and shows `#wiki-space`, which has a rail (`#wiki-rail`), a bar (`#wiki-bar`: search, View as, Truth, the clock, the trail) and the view (`#wiki-view`). Switching happens on the same page with `history.pushState`, so the map stream, dice and Ask keep running and Back works. The address is `?space=wiki&campaign=<id>#/<view>/<arg>`.
- **Routes** use the hash:
  - `#/home`
  - `#/wheel` (the family wheel and cards; `#/wheel/place` opens a family)
  - `#/page/<id>`, `#/page/<id>/edit`, `#/page/<id>/history`
  - `#/atlas/<mapId>`
  - `#/web/<pageId>`, and `#/web` for the whole web
  - `#/timeline`
  - `#/quests`
  - `#/knows`
  - `#/tidy`
  - `#/boards/<id>`
  - `#/waiting` (from the AI and from players)
  - `#/lists/<id>`
  - `#/import`
- **Opening it.** The Wiki button in the top bar switches space; Ctrl-click opens a new window. Fix while there: `sheet-place.js` `TABS` leaves out `wiki`, so popping out the wiki doesn't work today.
- **Players** get the same space from stage 6, with only their views.

### Modules (page)

Stage 0 splits `web/public/wiki.js` (1,142 lines, state tied to `#tab-wiki`), and later stages add the rest:

| Module | Holds |
|---|---|
| `wiki-data.js` | Page summaries, players, counts, `byName`, `refresh()`, change events |
| `wiki-page.js` | `renderPage(container, page, { dm, compact })`, the editor, history with differences, pictures, previews |
| `wiki-waiting.js` | The AI's and players' changes (today's review code) |
| `wiki-space.js` | The shell, rail, router, bar, trail, View as, Truth |
| `wiki-home.js` | The visual hub |
| `wiki-wheel.js` | The family wheel and cards |
| `wiki-compass.js` | A page's four mini views |
| `wiki-drawer.js` | The drawer |
| `wiki-find.js` | Ctrl K |
| `wiki-names.js` | Names as links |
| `map-wiki.js` | The wiki's layers on the map, page links in the place and token dialogs |
| `wiki-web.js`, `wiki-timeline.js` | The Web and the Timeline |
| `wiki-quests.js`, `wiki-knows.js`, `wiki-tidy.js`, `wiki-lists.js` | Stage 8 |
| `wiki-boards.js` | Boards |
| `wiki-import.js` | Import and export |
| `wiki-lore.js` | The players' lore editor |
| `pan-zoom.js` | Drag, wheel and pinch for the Web, Timeline, Wheel and Boards |
| `mini-views.js` | Small, non-interactive drawings of a map crop, a web ring and a ribbon, used by the compass, the Home and the rail |

### Modules (server)

| Module | For |
|---|---|
| `src/wiki-views.js` | Home, wheel counts, quests, who knows what, tidy, lists, compass: pure functions of (pages, maps, settings, viewer) |
| `src/wiki-web.js` | The graph and its layout (`d3-force`, `d3-hierarchy`; npm, ISC licence; run on the server so the page only draws) |
| `shared/src/wiki-time.js` | Reading and writing in-game times with the calendar (shared so the editor previews) |
| `shared/src/calendar.js` | The one calendar |
| `src/wiki-embeds.js` | Live embeds of creatures, items, merchants, handouts, maps and clue pages, per viewer |
| `src/wiki-io.js` | Import and export |
| `src/wiki-boards.js` | Boards |
| `src/wiki-history.js` | The map and web as of an earlier time (stage 11) |
| `routes/wiki.js` | Split into `routes/wiki-views.js` and `routes/wiki-players.js` when it passes about 400 lines |

A speed-up the views need from the start: `rows(cid)` in `src/wiki.js` parses every page on every call. Add a per-campaign cache, cleared on `write()`, in PR 1a.

## Data changes, all in one place

| What | Kept in | Shape | PR |
|---|---|---|---|
| A place's or token's page | the map JSON (`shared/src/map.js` `normalizePlaces`, `normalizeToken`) | `page: { id, title } \| null` beside `record` | 2a |
| Where a page is on the maps | derived | `on_maps` in `GET …/wiki/:pid` | 2a |
| Canon | each section, fact, event and picture | `canon: 'true' \| 'rumour' \| 'false' \| 'planned' \| 'told'`, plus `truth` (text, DM only) when false | 3a |
| How we know it | each section, fact and event | `sources: ['S12 01:02:03-01:04:10', …]`, transcript citations copied from the cited records when the DM approves (stable, unlike record ids) | 3b |
| A relationship's tone | a fact | `tone: 'friendly' \| 'neutral' \| 'hostile' \| null` (null: guessed from the label) | 3c |
| More facts | `WIKI_LIMITS.facts` | 30 → 60 | 3c |
| The calendar | campaign settings | `calendar: { preset, months: [{ name, days }], weekdays: [...], year, era, moons: [{ name, days, offset }], seasons: [{ name, month, day }], holidays: [{ name, month, day }] } \| null`; null = "Day N" as today | 4a |
| When a page happened | the page | `when: { text, from, to } \| null` (in-game minutes; 0 = the start of Day 1) | 4b |
| Dated lines on a page | the page | `events: [{ id, when, text, canon, sources, by, owner, available }]`, up to 100 | 4b |
| Timeline lanes, the front picture | campaign settings | `wiki: { front, lanes: [page ids] }` | 1b, 4c |
| Saved lists | `wiki_proposals` (`action: 'list'`, status `saved` or `removed`), not the settings, which players get | `{ id, name, filter }` | 8a |
| Templates | pages of kind `template` (DM only, never offered to players or Ask) | the sections, facts and prompts a new page of a kind starts with | 5a |
| Who wrote it | sections, facts and events | `by: 'dm' \| 'ai' \| 'player'`, plus `owner` (user id) for a player's | 6c |
| A character's page | the page | `player: <user id> \| null` | 6b |
| Players' lore waiting | `wiki_proposals` (`from: 'player'`, `by`) | the same shape as the AI's proposals | 6c |
| Clues and secrets | pages of kind `clue` | embedded with `[[!Clue title]]` | 7a |
| Arcs | pages of kind `arc`; quests and sessions inside them | the existing `parent` | 7b |
| A clue's state | a fact on the clue page | `Found: [[Session 13]] (Thorin, Mira)`, set by the AI's proposals | 7c |
| The AI's notes for the Home | `wiki_proposals` with `action: 'insight'` | `{ kind: 'loose_thread' \| 'previously' \| 'contradiction', text, pages, sources }` | 8d |
| Boards | new table `wiki_boards` (**schema v21**), archived in `wiki/boards/<id>/changes.jsonl` | `{ id, title, owner (null = the DM, or a player), shared_with_dm, items, arrows, version }` | 10a |

Page JSON changes need no SQL change: `normalizeWikiPage` drops what it doesn't know and fills defaults. The editor, history, restore, `filtered()`, `index()` and `pagePictureIds` learn each new field in the PR that adds it.

## The stages

### Stage 0: get ready (1 PR)

**0a: split the wiki page, pan and zoom, dependencies.** No change in behaviour.
- Move code from `web/public/wiki.js` into `wiki-data.js`, `wiki-page.js` and `wiki-waiting.js`. Add `pan-zoom.js` and `mini-views.js` (with tests).
- Add `d3-force` and `d3-hierarchy` to `packages/server/package.json`.
- Copy this plan to `docs/notes/wiki-space.md` and link it from `docs/notes/README.md`.
- Test: today's `web/test/wiki.test.js` passes unchanged.

### Stage 1: the space and visual navigation (4 PRs)

**1a: the space.**
- `index.html` gets `#wiki-space`, `#wiki-rail`, `#wiki-bar` and `#wiki-view`, and today's `#tab-wiki` content moves inside. `app.js` gets `showSpace()`, pushState and popstate, `?space=` on load, and the phone ☰ for each space.
- `wiki-space.js`:
  - the rail: picture buttons, folding to icons, only for the views built so far
  - the router
  - the bar: View as, Truth (from 3a), the clock read-only from `GET /campaigns/:cid/clock`, and the **trail** of pages opened as portrait chips
  - breadcrumbs as picture chips
- Add the page cache in `src/wiki.js`.
- Fix `TABS` in `sheet-place.js`.
- `style.css` and `mobile.css`, in every theme.
- SPEC §6.11 rewritten.
- Tests: open, Back and reload land in the right place; a player never gets `#wiki-space` or `/wiki` requests yet; the phone ☰ sheet shows the tiles.

**1b: the Wheel and the Home.**
- **The Wheel** (`#/wheel`, `wiki-wheel.js`): nine family slices in their colours round the party's portraits (from the roster and their tokens), with counts. A click turns that family to the middle and fans out its kinds (npc, villain, merchant…) with counts. A kind opens its picture cards, with tag chips. It's SVG with `pan-zoom.js`. On a phone, the wheel fills the width and cards follow. Server: `GET …/wiki/wheel[?as=]` (families, kinds, counts, the party).
- **The Home** (`#/home`, `wiki-home.js`, sketch 1) holds:
  - the hero: the front picture (Campaign settings → Wiki), else a crop of the top world map, else the family colours
  - "Last time": the newest session's page, its picture and opening words
  - the Wheel, small
  - tiles for the Atlas, the Web and the Timeline. Each shows a picture and "coming soon" until its stage lands, then a live mini view.
  - picture cards of what changed since the last session
  - the party
  - Waiting for you, with counts
  - Server: `GET …/wiki/home[?as=]` in `wiki-views.js`. With `as`, it leaves out the waiting list and other players' counts.
- Settings get `wiki.front` (`normalizeSettings`).
- Tests: the counts, the lists, View as filtering. Real browser check: the Wheel and the Home.

**1c: the page's compass, and history with differences.**
- `wiki-compass.js`: a strip under each page's banner. To start with it holds the family chip, "inside" (the parent's picture chip and the chain up) and "contains" (children as picture chips), plus "links here" and "links from here" as a short row of portraits. Stages 2d, 3d and 4c add the mini-map, mini-web and mini-ribbon to it. Server: `GET …/wiki/:pid/compass[?as=]` gives the neighbours, filtered.
- History: picking a version shows what changed against the one before, as additions and removals by section and fact (`wiki-page.js`, a small word diff written for this, no library).
- Tests: the compass's neighbours, filtered for View as; the diff marks a changed sentence.

**1d: the drawer, Ctrl K by meaning, and names as links.**
- `#wiki-drawer` is an `aside` in both spaces: the page drawn compact, with its compass, Open in the wiki, Edit, and (from 2c) Show on the map. Escape closes it. On a phone it's a sheet.
- `wiki-find.js` (Ctrl K or Cmd K, for the DM): **picture cards**, with title and other-name matches first, then **meaning** matches from the search index's `wiki` docs (`GET …/wiki/find?q=&as=`, which uses `search.js` with the viewer's audience), so "the guy with the eyepatch" finds Rennick.
- `wiki-names.js` `markNames(root, names)`: page titles and other names become coloured links with preview cards, in Ask's answers, the Archivist tab's records, map place and token cards, and handouts (the DM's view). The names come from the DM's page list, which only the DM gets. From stage 6, a player gets a server list of the titles they can see, never other names.
- Tests: an answer naming a page links it and opens the drawer; Ctrl K finds by meaning; a player's answer has no links.

### Stage 2: Atlas (4 PRs)

**2a: places and tokens link to pages.**
- `shared/src/map.js`: `normalizePageLink`, and `page` on places and tokens.
- `routes/maps.js`: places PATCH and tokens POST/PATCH take `page: { id } | null`, checked by `linkPage` (like `linkRecord`).
- `maps/store.js` `view()`: no `page` for players until stage 6.
- `GET …/wiki/:pid` gains `on_maps`. Pass `maps` into `registerWiki`.
- A page rename updates the kept titles, and renames a place whose name was the old title (one map change per map, reason `wiki rename`).
- Map crops: `GET …/maps/:mid/image?crop=x,y,w,h&size=480` (DM, sharp, the image cache), and `POST …/wiki/pictures { from: { kind: 'map', id, crop } }`.
- Tests: linking, the player view, `on_maps`, rename, crops.

**2b: from either side, revealing in pairs, sending as a handout.**
- The map's place and token dialogs (`map-places.js`, `map-dm.js`) get a Wiki page row: a picker, **Make a page from this place** (named after it, its kind from the map's kind, a picture cut from the map, and the parent suggested from the page of the place that opens this map) and Unlink. A DM's click on a linked place or token gives **Wiki: <title>**, which opens the drawer.
- Revealing a place offers **Also share the page with them**, and sharing a page that's on a map offers **Also reveal it on the map**. The two stay separate settings.
- The page's **On the map** box (the crop with a pin, which becomes the compass's mini-map in 2d) and **Put it on a map**: choose the map, then click or drag in the Atlas. When the page has no parent and the map is inside another one whose place has a page, offer "Put it inside Millbrook".
- **Send as a handout**, from any section, picture or the page's at-a-glance box: it makes a handout for the chosen players through the Handouts code, and offers to make that part available to them in the wiki.
- Tests: both directions, the reveal offers, send as a handout.

**2c: the Atlas view and its layers.**
- `#/atlas/<mapId>` moves the existing `#tab-map` into `#wiki-view` (as `placeBeside` moves panels) and back out on leaving, without cloning it. `data-browse` hides the play tools with CSS. Relayout and fit. With no map id, it opens the first top map in `atlasOrder`.
- `map-wiki.js` adds the **wiki layers** (an SVG layer), from the map bar's **Wiki** button (in the space and on the Map tab, remembered per browser):
  - place pins with the page's picture or icon
  - faction lands filled with the faction's colour
  - people at their token or at their "Where they are" place
  - quests at their "Where" or "Given by" place
  - rumoured places as "?" pins
  - (after 4b) events at their places
- A pin's card: picture, kind, opening words, counts (only of what the viewer can see), Open page, Open its map, and (after 4c) On the timeline.
- Server: `GET …/wiki/atlas?map=&as=`. View as filters the layers and places, but doesn't recreate a player's fog, and says so on screen.
- Tests: the layer filtering and counts; the map moving in and back; the Map tab and "Beside the map" still work after.
- Real browser check, desktop and phone.
- If moving the map fights back, fall back to opening the Map tab with the layers on. It's the same map either way.

**2d: zoom to go in, and the mini-map.**
- In the Atlas, zooming past a threshold on a place that opens a map goes into that map, with a short zoom transition, and zooming out past the start goes back up. Names fade in by zoom.
- The compass gets its **mini-map**. The Home's Atlas tile and the rail's Atlas button become live (`mini-views.js`, drawn from the crop endpoint).
- Tests: entering and leaving by zoom, and the minis' links.

### Stage 3: truth, evidence and the Web (5 PRs)

**3a: truth and rumour.**
- `canon` and `truth` on sections, facts and picture captions (`normalizeWikiPage`, zod, the editor: a canon picker per part, and a Truth box when `false`).
- `filtered()`: `planned` parts are the DM's only; for players, `false` is shown as `rumour` and `truth` is dropped.
- The badges and styles everywhere (the CSS in one place, used by every view), and the DM's **Truth** toggle in the bar.
- `index()` and Ask: canon markers in the docs and in `read_wiki_page`; Q&A instructions on rumours, accounts and falsehoods. **AI +1.**
- Tests: a player never gets `planned` or `truth`, and gets `false` as a rumour; Ask's context for a player carries `[rumour]` and never "false"; the DM's carries the truth.

**3b: how we know it.**
- `sources` on sections and facts. When the DM approves the AI's change, the cited records' transcript citations are copied onto it (`wiki-ai.js` approve).
- Each part shows **From session 12, 1:02:03** chips, which open the evidence the way Ask's citations do (`linkCitations` in `app.js`, moved to a shared module). For players (stage 6), only sessions they attended, as Ask does today.
- Tests: the sources are kept through edit, history and restore; the chips; a player's evidence is filtered.

**3c: relationships are facts.**
- `factLinks(fact)`, `guessTone(label)`, `tone`, and facts 30 → 60 (`shared/src/wiki.js`, `src/wiki.js`, the route).
- The editor gets a tone picker on facts that hold a link.
- Tests: tone round-trips, and the filtered page keeps it.

**3d: the Web.**
- Server `src/wiki-web.js` `graph(cid, { around, steps, families, mentions, preset, viewer, truth })`:
  - Nodes: pages the viewer can see.
  - Lines: from facts with links (labelled, toned, with canon), parents (drawn as **bubbles** when the parent is a faction or a place in view) and text links (with `mentions`).
  - A line is kept only if the viewer can see its part **and** the page at the other end. Two lines between the same pair are merged.
  - Around a page: up to 3 steps out, the nearest 80 pages. The whole web caps at 400.
  - Layout: `d3-force` from positions derived from the page ids and a fixed number of steps, so the same pages give the same picture. Bubbles come from `packEnclose`. It's worked out from the viewer's nodes only.
  - Presets: around a person; **Factions** (a diplomacy web: faction pages and their friendly or hostile lines); **Family**, as a **tree** (generations top to bottom from parent, child, married and sibling labels, laid out in layers, not by force).
  - Returns nodes `{ id, title, family, picture, x, y, r }`, lines `{ from, to, labels, tone, canon, by, kind, available? }` (`available` for the DM only) and bubbles.
- `GET …/wiki/web?…&as=&truth=`.
- `wiki-web.js` (sketch 2):
  - SVG and `pan-zoom.js`, with portrait nodes in family-coloured rings.
  - Lines are coloured by tone and styled by canon. **"From play" lines (`by: 'ai'`) are solid, and "your notes" lines (`by: 'dm'`) are drawn with a hand-drawn dash**, so play and prep look different (Kanka's living web, made automatic). Players' lore lines carry a quote mark.
  - A side card with Open page, Centre here, and **Add a link…** (which saves a fact through the usual PUT with its version).
  - Chips for families, steps and mentions, and the presets.
  - Phone: the **ring**: one page in the middle with its neighbours round it, and a tap re-centres.
- The compass's **mini-web** (the nearest 6 portraits) and the Home's Web tile, around the party, become live.
- Tests: lines from each source; merging; steps; the layout is stable. Privacy: no hidden node or id, no line from a DM-only fact or a `:::dm` link or to a hidden page, no `planned` line, and positions from visible nodes only. Web: nodes, lines, Add a link. Real browser check with 60 pages, desktop and phone ring.

**3e: the AI proposes relationships.**
- `wiki-ai.js` action `set_fact` (`page_id` or a page new in the same answer; `fact: { label, value, tone, canon }`; `sources`). The audience comes from `known_by`. A change never widens. Approving keeps the sources (3b). Proposal cards show facts.
- The prompt: relationships as facts labelled with the relationship and linking the other page; canon from the records.
- **AI +1.**
- Tests: audience, approve, edit, reject not repeated, canon kept.

### Stage 4: time (4 PRs)

**4a: one calendar for the whole app.**
- `shared/src/calendar.js`: presets (**Simple**: Day N, as today; **Harptos**; **Gregorian-like**; **Exandria**; **Custom**), with months, weekdays, year and era, moons (phases worked out from the clock), seasons and holidays.
- `clockText(clock, calendar)` reads "3 Mirtul 1492 DR, 18:30 · Full moon" when there's a calendar, and "Day 14, 18:30" when there isn't.
- Used everywhere the clock shows: the map, travel, rests, merchants and map events. Map events are what the archivist reads, so if their wording changes, **AI +1**.
- Campaign settings get a Calendar section with a preset picker and an editor.
- Tests: the presets' arithmetic (month lengths, leap rules of each preset, moon phases); clock text with and without a calendar; old campaigns unchanged.

**4b: when, and events on pages.**
- `shared/src/wiki-time.js` `parseWhen(text, calendar)` understands:
  - "Day 12", "Day 12, 21:00", "Day 12 night", morning, noon
  - calendar dates ("3 Mirtul 1492")
  - ranges
  - "300 years ago" and "3 years before"
  - "1489 DR"

  Anything else keeps its text with `from: null`, which goes in the Undated tray. `whenText` writes times back.
- Pages get `when` and `events` (each with canon, sources, by and available), in the editor with a live "reads as …" preview. `filtered()` and `index()` handle events per audience and canon, so Ask can answer "what happened on Day 12".
- Tests: a table of parser inputs; events filtered and indexed; history and restore.

**4c: the Timeline.**
- Server `GET …/wiki/timeline[?as=&truth=]`:
  - items: pages with `when` and every event, with family, picture, canon, by, and `place` (from `on_maps`)
  - lanes: **History** (anything before Day 1), **The campaign**, a lane per page in `settings.wiki.lanes` (that page, its children and pages linking it), and **arcs** (from 7b) as bands
  - now, undated items and the calendar's months and moons for the scale
  - all filtered
- `wiki-timeline.js` (sketch 4):
  - lanes, picture cards for pages and slim bars for events
  - styled by canon and by from play or from notes
  - horizontal `pan-zoom.js`, zooming from ages to days with the calendar's names on the scale
  - the Now line, and "Add a lane…"
  - **Show on the map** (the Atlas at that place, with a pulse); and the Atlas card's **On the timeline**, the other way
  - sessions without `when` in a tray in played-on order
  - Phone: a vertical ribbon of cards.
- The compass's **mini-ribbon** and the Home's Timeline tile become live.
- Tests: lanes and filtering (a DM-only event, a planned event, a lane page the player can't see); the jump to the map. Real browser check.

**4d: the AI proposes times and events.**
- Actions `set_when` and `add_event`, with audiences from `known_by`, sources and canon.
- The prompt: date things in the in-game time the records give; one event per thing worth remembering, on the page it's most about, linking the others; a session page's `when` is the in-game span it covered.
- **AI +1.**
- Also: past **journeys** as bars on the campaign lane, worked out from the archived map changes (a token's `journey`, from set off to arrival), never stored twice.
- Tests: as in 3e; journeys from a fixture archive.

### Stage 5: templates, and the AI as a writing partner (2 PRs)

**5a: templates and prompts.**
- Pages of kind `template` (DM only, never in Ask, the Wheel or players' views) hold a kind's sections (each with a writing prompt shown as a placeholder), facts and canon defaults. The app comes with a starter set per family:
  - **Person**, which leads with the **table card**: voice and manner, what they want, what they know, what they'll trade (so the drawer shows that first for people)
  - Place, Faction, Item, Quest, Session, Lore
  - **Clue** and **Arc** for stage 7
- New page → choose a template (the family's by default). The DM can make their own, or save a page as a template.
- Tests: a new page from a template; templates never reach players or Ask.

**5b: Draft with the AI, Make up…, link suggestions.**
- In the editor:
  - **Draft from the records**: fill this template from what the records say, with sources and audiences from `known_by`
  - **Expand** a section
  - **Tidy** a section's wording
  - **Make up…** (in Ctrl K and the Home): an NPC, a tavern, a shop, a rumour, a name, consistent with the wiki (it reads related pages first), saved as a `planned` draft page
- Each result arrives as a proposal under Waiting for you (one AI call each, task `wiki_draft`, `MODEL_WIKI`).
- **Link suggestions**: names in a section's text that match a page are underlined with "Link it" (matched on the server, no AI).
- **AI +1.**
- Tests: drafts become proposals with the right audiences; Make up gives a planned page; the link suggestions.

### Stage 6: players, their world and their characters' lore (3 PRs)

**6a: players read their version.**
- Player routes, each calling the same builders with the player as the viewer:
  - home, wheel, page, compass, find, atlas layers, web, timeline, quests
  - the picture route as now
  - a names list for links (titles only)
- Fix `filtered()` keeping `parent` when the parent is hidden. A place's and token's `page` reach a player only if the page is available to them.
- The rail for players leaves out Waiting for you, Who knows what, Tidy up, templates and the DM's boards.
- Names in players' Ask answers become links.
- Tests: **a privacy test per route** (hidden page ids, titles, pictures, planned parts, `truth`, `:::dm`, other names, hidden lines, pins and events, counts), plus a sweep test: a player's every wiki response is searched for each hidden page's id and title.

**6b: character pages.**
- `page.player`. A character page is offered for each player character (Waiting for you, one click), named after the character, with the token picture.
- Facts and "From the sheet" parts drawn live from the sheet (appearance, backstory, allies, race, class, level), following the sheet's privacy, never copied. The page sits in the Wheel's middle with the party.
- Tests: the live parts follow the sheet; another player doesn't see them unless the owner shares.

**6c: players' lore.**
- `wiki-lore.js`: on their character page, **Add to your story**: a section, a page about your past, a relationship or an event. Each has "who it's for" (only the DM by default, chosen players, or everyone), and pictures uploaded into the wiki's pictures, private to where they're used.
- `POST …/wiki/lore` (player) makes a `wiki_proposals` entry (`from: 'player'`).
- The DM's **Waiting for you → From players**: Approve, Edit then approve, Reject, each with a canon picker (`told` by default, or true or false with the truth beside it). Approved parts are `by: 'player'`, `owner`. Their owner's edits to approved parts apply at once (the server checks ownership) and show in Recent changes. The AI never rewrites them.
- Ask marks them "Thorin's account". **AI +1** (Ask's and the wiki AI's instructions mention accounts).
- Tests: a player can only touch their own parts and pages; another player never gets a DM-only part; approval, edits, canon; the AI's proposals skip player parts.

### Stage 7: session prep that checks itself (3 PRs)

**7a: clues and reusable secrets.**
- Pages of kind `clue` (from the template): the clue's text, canon, who it's available to, and a Found fact. `[[!Clue title]]` embeds a clue's text where it's written. **Revealing it once reveals it everywhere** it's embedded, because availability lives on the clue page.
- `filtered()` resolves embeds per viewer (an embed they can't see vanishes, with no trace).
- Tests: embeds per viewer; one reveal shows everywhere; no hidden clue title in a player's page.

**7b: arcs and the prep page.**
- Pages of kind `arc`, with quests and sessions inside them.
- The **Next session** page (from the Session plan template): a strong start, scenes, **clues** (embedded clue pages), NPCs, places, encounters (live Creatures and maps, through 9a's embeds once that lands, links until then) and treasure.
- **Prep board** button: the plan's pages and clues laid out as cards (from stage 10, links until then).
- The Quests board and the Timeline group by arc.
- Tests: an arc's grouping; the prep page's links.

**7c: after the session.**
- When the archivist finishes a session, the `wiki` job also gets the **open prep page's clues**. It proposes which came out and to whom (a reveal with sources), sets each clue's Found fact, and proposes the **next prep page** carrying the clues not found and the scenes not reached.
- The prep page shows ✓ (found by Thorin, Mira), ✗ (missed) and ↷ (carried).
- **AI +1.**
- Tests (fake AI): a proposal marks a clue found with the right audience, and the carry-over.

### Stage 8: the DM's overview (4 PRs)

**8a: the quest board and lists.**
- `#/quests`: quest pages in columns by Status (Rumoured, Active, Done, Failed, and others), grouped by arc. Cards show picture, Given by and Reward. Dragging saves Status.
- **Lists:** save any Wheel filter (family, kind, tags, canon, a fact's value) as a list on the Home, as a row of cards. **Make a list** in plain words ("hostile NPCs in Millbrook") uses the quick Ask path (no new model) to pick from the viewer's pages, and returns cards, saveable.
- Tests: the columns, a drag saves, lists filter per viewer.

**8b: who knows what, reveal planning and the spoiler check.**
- `#/knows`: pages (rows) against players (columns), with each cell all, some or none, coloured. A click shows that player's version. Choose parts and **Reveal to…** in one go.
- **Spoiler check:** before a reveal, a handout send or a lore approval, list what the newly visible text names that the players can't see yet ("This names the Pale Hand, which Mira doesn't know"). It's worked out on the server from links and names.
- Tests: the grid; the spoiler check finds a hidden name.

**8c: Tidy up.**
- `#/tidy`, each item with a button to fix it:
  - pages with no links
  - place pages not on a map, and places with no page
  - people with no picture
  - links to missing pages
  - unlinked mentions (Link them)
  - unknown `:::for` names
  - facts linking deleted pages
  - planned parts older than N sessions ("still planned?")
  - accounts waiting for canon
- Tests: each rule.

**8d: a Home that thinks.**
- After each session the `wiki` job also returns **insights**: **loose threads** (rumoured quests not followed, NPCs unseen for N sessions, promises made, clues not found), **Previously on…** (a read-aloud recap of the last session, from its page and records) and **contradictions** (a page against the records).
- They go to `wiki_proposals` as `action: 'insight'`, archived. They're shown on the Home as cards with Dismiss and "Open", and a contradiction offers to propose the fix.
- **AI +1.**
- Tests (fake AI): insights shown, dismissed and not repeated.

### Stage 9: the wiki and the rest of the app (2 PRs)

**9a: live embeds.**
- `[[creature:Goblin boss]]`, `[[item:…]]`, `[[merchant:…]]`, `[[handout:…]]`, `[[map:…]]` show the live card: a statblock with click-to-roll, an item, a shop, a handout, a map thumbnail. They're never copies. The editor's "+ Embed" chooses one.
- Per viewer: creatures, items and merchants are the DM's, so a player gets nothing (or a merchant only if they can shop there). A handout only if they got it. A map only if it's shown to them.
- Tests: each kind; a player's version drops what they can't see.

**9b: import and export.**
- **Import** (`#/import`):
  - a **Markdown or Obsidian folder** as a zip: one page per file; front matter for kind, tags and aliases; `[[links]]` kept; pictures added to the wiki's pictures; folders become "inside"; all DM-only
  - **messy notes** (text, Markdown, Word as text): the AI sorts them into proposed pages (task `wiki_draft`)
- **Export:**
  - a Markdown zip of the whole wiki
  - **a player's version** (only what they can see)
  - **Print**: print CSS for a page or a chosen set of pages, for paper or PDF through the browser
- Tests: a fixture vault imports with links and pictures; export round-trips; a player's export has nothing hidden.

### Stage 10: boards (2 PRs)

**10a: storing boards.**
- Table `wiki_boards`, **schema v21**, with a db upgrade test. Archived whole after each save in `wiki/boards/<id>/changes.jsonl` and restored on start-up.
- A board: `{ id, title, owner, shared_with_dm, items: [{ id, kind: page | note | picture | board, ref, x, y, w, h, size, text, color }], arrows: [{ id, from, to, label }], version }`, with 500 items and 500 arrows at most and a 409 on an old version.
- Routes: the DM's boards. **Players' own boards**: a player makes boards with cards of pages they can see and their own notes (their conspiracy board). The DM sees one only if the player shares it. A card for a page that later becomes hidden is drawn as "gone", without its title.
- Tests: save, conflict, owners, sharing, the gone card.

**10b: the board view.**
- `#/boards/<id>`: `pan-zoom.js` with HTML cards: page cards (small, medium or large, picture and opening words), sticky notes, wiki pictures, links to boards, and labelled arrows. Drag, resize, and save after a pause.
- A page card opens the drawer. The prep page's **Prep board** (7b) opens one laid out from the plan.
- Phone: view and move only.
- Tests: the basics. Real browser check.

### Stage 11: scrub through time (1 PR)

**11a: the Atlas and Web as they were.**
- A time slider in the Atlas and the Web: **as of session N**, or (with the clock's history) **as of an in-game day**.
  - The Atlas replays the archived map changes to that moment (tokens, revealed places, people on the road).
  - The Web uses each page's version at that moment (`readWikiChanges`).
  - The Timeline gets **swimlanes per character** (where each was, from journeys and map moves).
- It's all derived from the archive, never stored twice. The server caches each moment it builds.
- View as applies, judged by the player's access **now** (never show a player what they couldn't see then *or* now).
- Tests: a fixture archive gives the right state at two moments; privacy as above.

## Order and sizes

| PR | Needs | Size | AI change? |
|---|---|---|---|
| 0a split, pan-zoom, minis | – | M | – |
| 1a space | 0a | M | – |
| 1b Wheel and Home | 1a | M | – |
| 1c compass, history differences | 1a | M | – |
| 1d drawer, Ctrl K by meaning, names | 1a | M | – |
| 2a place and token links, crops | 1a | M | – |
| 2b both sides, paired reveals, send as handout | 2a, 1d | M | – |
| 2c Atlas and layers | 2a | L | – |
| 2d zoom to go in, mini-map | 2c, 1c | M | – |
| 3a truth and rumour | 1a | M | +1 (Ask) |
| 3b evidence | 3a | M | – |
| 3c facts as relationships | 3a | S | – |
| 3d Web | 3c, 1c | L | – |
| 3e AI relationships | 3c, 3b | M | +1 |
| 4a one calendar | – | M | +1 if map event wording changes |
| 4b when and events | 4a, 3a | M | – |
| 4c Timeline | 4b, 2c | L | – |
| 4d AI times, events, journeys | 4b, 3b | M | +1 |
| 5a templates | 1a | M | – |
| 5b Draft, Make up, link suggestions | 5a, 3b | M | +1 |
| 6a players read | 3d, 4c (their views) | L | – |
| 6b character pages | 6a | M | – |
| 6c players' lore | 6b, 3a | L | +1 |
| 7a clues and secrets | 3a | M | – |
| 7b arcs and prep | 7a, 5a | M | – |
| 7c after the session | 7b, 3e | M | +1 |
| 8a quests and lists | 7b | M | – |
| 8b who knows what, spoiler check | 1a | M | – |
| 8c Tidy up | 2a, 3c | S | – |
| 8d Home that thinks | 7c | M | +1 |
| 9a live embeds | 1a | M | – |
| 9b import and export | 5b | L | – |
| 10a boards stored | – | M | schema v21 |
| 10b boards view | 10a | L | – |
| 11a scrub through time | 2c, 3d, 4c | L | – |

That's **35 PRs**, done one after another, in the order above. Each stage leaves something usable:
- after stage 1: the space and its visual hub
- after 2: the maps joined
- after 3: truth and the Web
- after 4: time
- after 6: the players are in
- after 7: prep closes the loop

## Notes for the medium-effort sessions

- Read this plan's section for the PR, SPEC §6.11 and the files it names. Don't re-plan. If something here turns out wrong, fix it in the PR and update `docs/notes/wiki-space.md`.
- House style: plain modules, `h()` for elements, `api()` for requests, zod on every route, comments saying why in plain words, and names like the code around them.
- Visual first: a new view's default is pictures. Use the family colours and canon styles from the one shared stylesheet. Screenshots at 1280 px and 390 px, light and dark, go in the PR.
- The map module is a singleton tied to element ids. Never clone `#tab-map`; move it, and put it back.
- Cap graph, timeline and list sizes on the server, and say so in the page when a cap bites ("Showing the nearest 80").
- Merge once green (Kenny's rule). Put real-browser checks for Kenny on HANDOFF's "Checks to run in VS Code".

## Risks

- **Moving the map into the space** (2c): it has a fallback (the Map tab with the layers).
- **Players reading the wiki** (stage 6) is the biggest privacy step: a test per route, the sweep test, and View as built from the same code since stage 1.
- **Truth and rumour** must never leak "false" or a planned part to a player. That's tested in 3a and in every view after.
- **Empty views:** each says how to start, and the AI's proposals (3e, 4d, 7c, 8d) fill them on a real campaign.
- **Cost:** the new AI work rides on the existing `wiki` job (one structured call per 25 records), apart from on-demand drafts and lists, which the DM asks for.
- **Calendar** (4a) touches every clock text in the app. It's tested against the old "Day N" text, which stays the default.
- **Size:** 35 PRs is a lot. The order front-loads what Kenny asked for first (the space, visual navigation, the Atlas, the Web, truth and rumour) and leaves the reach goals (boards, scrubbing through time) for last.

## Still open

1. The decision card: space only, woven in, or both. The plan assumes both.
2. Players reading their version of the wiki in stage 6. The plan assumes yes, because their lore needs a home.
3. The calendar presets to ship: the plan offers Simple, Harptos, Gregorian-like, Exandria and Custom.
