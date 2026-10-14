# Regressions

Every bug that was found and fixed, and the test that keeps it fixed. The **regression-keeper** worker (`.claude/agents/regression-keeper.md`) keeps this list and the tests up to date; see AGENTS.md for the rule.

**How it works**
- A regression test is an ordinary test whose name starts with `regression: `. It sits in the test file for the part of the app it covers, next to the related tests.
- `npm run test:regressions` runs only those tests (about 20 seconds). `npm test` runs everything, regressions included.
- Before every `git commit` that touches `packages/`, a Claude Code hook (`.claude/hooks/regressions.mjs`) runs `npm run test:regressions` and stops the commit if one fails.
- A regression test must fail on the code before the fix and pass after it.
- **Small, not end to end** (the owner's rule): a regression test checks that one past bug hasn't come back, at the lowest level that shows it, with the fake AI. Never a real AI call, a whole flow from login to result, or anything else that spends credits.
- **Checks that need the owner's machine** (a real browser or GPU, his book PDFs, the real AI) are not regression tests. Put them under "Checks to run in VS Code" in HANDOFF.md instead. The next VS Code session runs them and takes them off that list, so they're only run again when someone adds them back.
- A failing regression test means the change broke something that was fixed before. Fix the code, not the test. Change or remove a regression test only when the owner has decided the behaviour should change, and say so in its row below.

**Adding one:** add a row below (newest first): the date, what was wrong in plain words, and where the test is (`package/test/file.test.js`, then the test's name after `regression: `).

| Date | What was wrong | Test |
|---|---|---|
| 2026-10-14 | The archivist's tool results were cut mid-record at a size ("…(truncated)"), so a long record or transcript part reached it without its end. | `server/test/kb.test.js`: the archivist's tools never cut a record or a transcript line short; what doesn't fit is named |
| 2026-10-14 | Q&A's tools cut records at 2,500 tokens and the pre-search cut every piece to an equal share, so answers could miss a record's end. | `server/test/kb.test.js`: Q&A tools and the pre-search give whole records, never cut mid-way |
| 2026-10-14 | Meaning search only saw the first ~256 words of a record or chunk (the embedding model's limit). | `server/test/kb.test.js`: meaning search embeds all of a long text, a window at a time |
| 2026-10-14 | The archivist got sheet text cut at 4,000 characters and changes (and note edits) cut at 600, and no item descriptions. | `server/test/updates.test.js`: the archivist gets a sheet, its items and long changes in full, never cut short |
| 2026-10-14 | The map creator's Room tool always added walls all round, so a patch of another floor needed its walls rubbed out. | `web/test/creator-tools.test.js`: creator: the Room tool can lay its floor without walls |
| 2026-10-13 | The Cloudflare details file `API_key` wasn't git-ignored, so git offered to commit it. | `server/test/security.test.js`: the API_key file (Cloudflare details) is git-ignored |
| 2026-10-12 | The map creator skipped squares on a fast drag (one pointer move across many squares painted only its ends). | `web/test/creator.test.js`: creator: a fast floor drag paints every square between the pointer's stops |
| 2026-10-10 | The AI walls message couldn't be closed: pressing ✕ started a map pan, so the map got the click. | `web/test/map.test.js`: pressing on the AI walls message does not start a pan, so it can be closed |
| 2026-10-10 | The page's top bar jumped sideways when switching tabs (its width followed the tab), and the bold tab name widened it. | `web/test/layout.test.js`: the bar along the top stays put: every tab has room for its bold name, and its width never depends on the tab |
| 2026-10-08 | DMG citations were pages off: that scan's page numbers are only in running footers ("CHAPTER 2 \| RUNNING THE GAME 45"). | `server/test/books.test.js`: books: page numbers in running footers give the printed page, not the PDF page |
| 2026-10-08 | A stat block found online lost `source: 'web'` when its creature was placed on a map. | `shared/test/map.test.js`: a stat block found on the web keeps source "web" when cleaned for a map token |
| 2026-10-08 | The DM could still get a character sheet (and character pictures) through the server; only the tab was hidden. | `server/test/sheets.test.js`: the DM gets no character sheet or character pictures from the server |
| 2026-10-08 | Book search: short terms like "AC" matched inside words ("action"). | `server/test/books.test.js`: books: a term of 3 letters or fewer matches whole words only |
| 2026-10-08 | Book search: an ambiguous name ("Players Handbook" with both editions) searched nothing, which read as "not in the book". | `server/test/books.test.js`: books: an ambiguous book name is an error naming the books, not an empty search |
| 2026-10-08 | Book lookups: words in scanned books came out broken ("H eavy"), because pdf.js gives OCR text in pieces and every piece got a space. | `server/test/books.test.js`: books: PDF text pieces are joined by position, so OCR layers read as words |
| 2026-10-07 | Classic 3D dice were invisible after another 3D roller had been used (its canvas was pushed below the window). | `web/test/dice.test.js`: dice: every roller's canvas sits on top of the others in the stage (a second 3D roller was pushed below the window) |
| 2026-10-07 | A blocked, removed or demoted account kept receiving live map updates (and the DM view) on a stream it already had open. | `server/test/security.test.js`: live map updates stop when a player is blocked or removed, and follow role changes |
| 2026-10-06 | An answer with text at its top level (not inside a paragraph) crashed the answer renderer. | `web/test/app.test.js`: an answer with text at its top level is shown, not a crash |
| 2026-10-04 | Deleting a campaign stored with two spaces in its name silently failed: names weren't cleaned, so the typed name never matched. | `server/test/api.test.js`: names are stored with extra spaces cleaned up, matching what the page shows |
| 2026-10-04 | Logging out and in as someone else without a reload left the other screen (the admin screen) showing. | `web/test/app.test.js`: logging out of the admin screen and in as a player shows only the player app |
| 2026-10-04 | The element helper `h()` only flattened one level of children (pills showed "[object HTMLSpanElement]"). | `web/test/app.test.js`: the element helper h() takes children nested to any depth |
| 2026-10-04 | An upload with a bad speaker link was archived before the link was checked, leaving a permanent orphan session. | `server/test/api.test.js`: an upload with a bad speaker link is refused before anything is archived |
| 2026-10-03 | Q&A answers streamed nothing and never closed over a real connection (the server listened for the request closing, not the reply). `app.inject` didn't show it, so the test uses real HTTP. | `server/test/api.test.js`: Q&A streams over a real HTTP connection and closes when done |
| 2026-10-03 | The host's claude.ai connectors (Gmail, Calendar, Drive) leaked into Claude Code runs; an answer told a player to authorise them. | `server/test/llm.test.js`: claude-code: the host's claude.ai connectors, synced skills and other MCP servers stay out of runs |

**Past fixes not yet covered by a tagged regression test:** none. Every fix in the HANDOFF change log up to 2026-10-13 has one.
