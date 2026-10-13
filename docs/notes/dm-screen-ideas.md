# DM screen: brainstorm

Written 2026-10-07 for Kenny to review later. Ideas only; nothing is built or decided.

Grounded in what's on `main` today (SPEC.md §5–6, HANDOFF.md). Each idea is tagged:

- **Reuse**: mostly a new view over pieces that already exist on the server.
- **Some new**: needs a new endpoint, table or AI task, but builds on existing pieces.
- **New**: needs something the app doesn't have yet (usually a live per-campaign channel or new data).

## Two things to settle first

1. **The DM role is still deferred.** A DM screen is the first real piece of it. Two open questions decide a lot of what follows: can the DM see character sheets (today: no, only the player), and should the DM see knowledge built from players' private notes (today: yes, by accident of the archivist's `known_by`)?
2. **What "DM screen" means here.** Two readings, and they can coexist:
   - **The table screen**: what the DM looks at *during* a session (initiative, monsters' HP, party stats, quick rules, secret rolls).
   - **The prep and campaign desk**: what the DM uses *between* sessions (the archivist's questions, corrections, glossary, speaker map, records). HANDOFF "Next steps" item 9 already lists these as missing from the page.

My suggestion: build the table screen as a DM-only tab or layout, and fold the campaign desk in as a second panel, rather than two separate screens.

(The notes-only sessions design moved to [notes-only-sessions.md](notes-only-sessions.md).)

## The table screen (during a session)

### 1. Party panel at a glance — *Some new*
One row per player character: name, AC, current/max HP, passive Perception/Insight/Investigation, spell save DC, conditions, concentration.
- Reuses: sheet rules in `shared/src/sheet.js` (all those values are already computed), token HP and conditions from the Map.
- Needs: the decision that the DM can read sheets (or a read-only "DM summary" subset, which is a nice middle ground: the DM sees the numbers, not backstory or notes).
- Live updates: HP on map tokens already goes over SSE; sheet changes would need the same.

### 2. Initiative tracker — *Some new*
Roll initiative for everyone at once, order the list, step through turns, round counter, highlight the active token on the map.
- Reuses: server dice (`POST /roll`), initiative bonus from sheets, enemy stat blocks (DEX), map tokens and their SSE stream.
- Needs: an `encounter` on the map document (order, current turn, round). Already on the Maps "Later" list.
- Nice touch: players see "you're up" / "on deck" on their own page.

### 3. Monster cards with click-to-roll — *Reuse*
Every enemy/NPC token on the shown map gets a card: the AI stat block already stored on the token, HP with the `-7` / `+5` box, conditions, and clickable attacks and saves that roll with the 3D dice.
- Reuses: `map:stats` stat blocks, token HP, the sheet's click-to-roll and damage-after-attack logic in `dice.js`.
- Needs: parsing attack lines out of the stat block Markdown (or asking the AI to return them as fields too; that's a schema change, so bump `PIPELINE_VERSION`).

### 4. Secret DM rolls and a shared roll log — *New*
The DM rolls behind the screen (only the DM sees it); players' rolls can optionally show up in a party log.
- Reuses: server-side dice, 3D dice, effects.
- Needs: a live channel per campaign for rolls (the Map SSE pattern can be copied), and Kenny's call from HANDOFF item 4 (share rolls? archive them for the archivist?).

### 5. Quick-reference strip — *Reuse*
Conditions, cover, exhaustion levels, travel pace, DCs by difficulty, jumping/falling, light. One click opens the full text.
- Reuses: the book tools (`search_books`, `read_book`) to pull the real wording from the group's PHB/DMG, cached once per campaign; SRD as a fallback.
- Could also be a "pin a rule" button on any Ask answer, so the DM builds their own strip.

### 6. "Ask as DM" — *Reuse*
The Ask box, with the DM's full view: "what did the party promise the harbourmaster?", "who knows about the stolen ledger?", "stat block for a bone naga".
- Reuses: Q&A as-is (DMs already see all records and transcripts).
- New angle worth having: "who knows X?" answered from `known_by`, so the DM can check before an NPC lets something slip.

### 7. Encounter builder — *Some new*
Pick creatures (by name, or from the records), see XP and difficulty for this party's levels, then "drop on map" places hidden tokens with stat blocks filled in.
- Reuses: stat-block lookup, hidden tokens, party levels from sheets.
- Needs: the XP/difficulty tables (DMG; can live in `shared/`) and a small UI.

### 8. Session notes and quick log — *Some new*
A DM scratchpad for the session ("the guard was bribed 10 gp", "Mira took the amulet"). Each line is timestamped, and the archivist gets it alongside the transcript.
- Reuses: player notes (same storage, archive and indexing path), the archivist's ingest run which already reads that day's notes.
- Needs: DM notes treated as DM-only by default; worth deciding whether the archivist may use them to set `known_by` (it should: the DM writing "secret: the mayor is a cultist" is exactly what it needs).

### 9. Reveal and handout controls — *Some new*
One place for "what can the players see right now": which map is shown, fog reveal shortcuts, hidden tokens to unhide, and handouts (an image or text pushed to one player or everyone).
- Reuses: show/hide map, fog, hidden tokens.
- Needs: handouts (new, small: an image plus `visible_to`, archived like maps).

### 10. Random tables and name generator — *Some new*
"Give me a dwarf innkeeper name", "random tavern rumour", rolled from the group's books or by the AI, with a button to add the result as an NPC record or token.
- Reuses: dice, book tools, the AI, NPC tokens.
- Watch out: the knowledge base belongs to the archivist, so "add as record" should go in as a DM correction ("there's an innkeeper called Brann at the Gilded Goat") rather than writing a record directly.

## The campaign desk (between sessions)

### 11. Archivist inbox — *Reuse*
The archivist's open questions for the DM, one card each, with an answer box. Answers already become corrections on the server.
- This is pure UI; the endpoints exist. Probably the most useful single thing for keeping the knowledge base right.

### 12. Corrections — *Reuse*
"Tell the archivist something" in plain words ("Brann is actually Mira's brother"), with the status of past corrections.
- Endpoints and the `correct` job exist; no page yet.

### 13. Glossary and speaker map — *Reuse*
Edit the spelling of names the transcriber gets wrong, and who's who in the transcript.
- Exists on the server; the admin screen has a partial speaker editor at upload time.

### 14. Campaign state board — *Reuse*
The archivist already tracks open quests, debts, clues and factions as records with statuses. A board view of them (columns by status) gives the DM a "where are we" page before each session.
- Reuses: `GET /campaigns/:cid/kb`. No fixed structure needed: group by whatever kinds the archivist made.
- Note the AGENTS.md rule: this must be a *view* over the archivist's records, not a new human-maintained structure.

### 15. Session prep brief — *Some new*
"Prepare me for next session": the AI writes a one-page brief from the records (last session's recap, open threads, NPCs likely to come up, things players don't know yet).
- Reuses: Q&A agent with DM visibility.
- Needs: a prompt and a button; output could be saved as a DM note.

### 16. Who-knows-what view — *Reuse*
For any record, show which players know it, and let the DM widen it ("they all heard this at the trial") via a correction.
- Reuses: `known_by`, corrections. Helps with the DM-privacy question above.

## Layout ideas

- **Tri-fold screen**: like a physical DM screen, three panels side by side (Party | Map or Initiative | Reference/Monsters), each panel switchable. Fits a laptop; collapses to tabs on a tablet.
- **Map-centred**: the existing Map tab with DM sidebars (initiative on the left, selected token's stat block on the right, party strip along the bottom). Least new layout work, since the map page already has a selection bar.
- **Dashboard of cards**: draggable cards the DM arranges and the layout is saved per browser, like the Look dialog's settings. Most flexible, most work.
- Reuse the **Look** themes and layouts so the DM screen matches the rest of the page.
- A **second-screen mode**: the DM screen on a laptop, and a "table view" (map only, no UI) on a TV or projector, using the player view of the map with a spectator login.

## Strongest few (my picks)

1. **Initiative tracker + monster cards on the map** (2 and 3). Biggest payoff at the table, and most of the pieces (tokens, HP, stat blocks, dice, SSE) already exist.
2. **Party panel** (1), as a read-only DM summary of sheets. Needs Kenny's call on sheet visibility, but it's the classic DM-screen feature.
3. **Archivist inbox + corrections** (11, 12). Pure UI over existing endpoints, and it keeps the knowledge base accurate, which everything else (Ask, NPC links, prep briefs) depends on.
4. **Campaign state board + prep brief** (14, 15). Turns the archivist's work into something the DM uses every week.

## Questions for Kenny when you come back to this

- Can the DM see players' sheets? All of it, or only a numbers summary?
- Should DM rolls be secret by default, and should rolls be shared or archived at all?
- Table screen, campaign desk, or both first?
- Who's the DM, and would they try an early version? Their habits (paper screen, D&D Beyond, Foundry, Owlbear) would shape the layout more than anything here.
