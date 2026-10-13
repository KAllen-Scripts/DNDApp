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
| 2026-10-10 | The page's top bar jumped sideways when switching tabs (its width followed the tab), and the bold tab name widened it. | `web/test/layout.test.js`: the bar along the top stays put: every tab has room for its bold name, and its width never depends on the tab |
| 2026-10-08 | Book lookups: words in scanned books came out broken ("H eavy"), because pdf.js gives OCR text in pieces and every piece got a space. | `server/test/books.test.js`: books: PDF text pieces are joined by position, so OCR layers read as words |
| 2026-10-07 | Classic 3D dice were invisible after another 3D roller had been used (its canvas was pushed below the window). | `web/test/dice.test.js`: dice: every roller's canvas sits on top of the others in the stage (a second 3D roller was pushed below the window) |
| 2026-10-07 | A blocked, removed or demoted account kept receiving live map updates (and the DM view) on a stream it already had open. | `server/test/security.test.js`: live map updates stop when a player is blocked or removed, and follow role changes |
| 2026-10-04 | Deleting a campaign stored with two spaces in its name silently failed: names weren't cleaned, so the typed name never matched. | `server/test/api.test.js`: names are stored with extra spaces cleaned up, matching what the page shows |
| 2026-10-03 | Q&A answers streamed nothing and never closed over a real connection (the server listened for the request closing, not the reply). `app.inject` didn't show it, so the test uses real HTTP. | `server/test/api.test.js`: Q&A streams over a real HTTP connection and closes when done |

**Past fixes not yet covered by a tagged regression test** (from the HANDOFF change log; some are partly tested inside a bigger test, so check before writing a new one):
- 2026-10-04: switching logins without a reload left the other view showing.
- 2026-10-04: the element helper `h()` only flattened one level of children (pills showed "[object HTMLSpanElement]").
- 2026-10-04: an upload with a bad speaker link was archived before the link was checked, leaving a permanent orphan session. (Partly in `server/test/api.test.js`: upload preview lists speakers...)
- 2026-10-03: the host's claude.ai connectors leaked into Claude Code runs. (Options checked in `server/test/llm.test.js`: claude-code: agent exposes only the given tools...)
- 2026-10-06: an answer with text at the top level crashed the answer renderer.
- 2026-10-08: a stat block found online lost `source: 'web'` when its creature was placed on a map. (One assert in `shared/test/map.test.js`: record links, stat blocks and hit points...)
- 2026-10-08: the DM could still get a character sheet through the server (now 403). (Inside a bigger test in `server/test/sheets.test.js`.)
- 2026-10-08: DMG citations 5 pages off (page numbers in running footers); short terms like "AC" matched inside words; an ambiguous book name searched nothing. (Inside `server/test/books.test.js`: books: titles, printed years, footer page numbers...)
- 2026-10-10: the AI walls message couldn't be closed (pressing ✕ started a map pan). (Fixed with a page test in `web/test/map.test.js`, not yet tagged.)
- 2026-10-12: the map creator skipped squares on a fast drag. (Inside `web/test/creator.test.js`.)
