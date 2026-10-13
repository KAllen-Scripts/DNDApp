# Regressions

Every bug that was found and fixed, and the test that keeps it fixed. The **regression-keeper** worker (`.claude/agents/regression-keeper.md`) keeps this list and the tests up to date; see AGENTS.md for the rule.

**How it works**
- A regression test is an ordinary test whose name starts with `regression: `. It sits in the test file for the part of the app it covers, next to the related tests.
- `npm run test:regressions` runs only those tests (about 20 seconds). `npm test` runs everything, regressions included.
- Before every `git commit` that touches `packages/`, a Claude Code hook (`.claude/hooks/regressions.mjs`) runs `npm run test:regressions` and stops the commit if one fails.
- A regression test must fail on the code before the fix and pass after it.
- A failing regression test means the change broke something that was fixed before. Fix the code, not the test. Change or remove a regression test only when the owner has decided the behaviour should change, and say so in its row below.

**Adding one:** add a row below (newest first): the date, what was wrong in plain words, and where the test is (`package/test/file.test.js`, then the test's name after `regression: `).

| Date | What was wrong | Test |
|---|---|---|
| 2026-10-08 | Book lookups: words in scanned books came out broken ("H eavy"), because pdf.js gives OCR text in pieces and every piece got a space. | `server/test/books.test.js`: books: PDF text pieces are joined by position, so OCR layers read as words |
| 2026-10-03 | Q&A answers streamed nothing and never closed over a real connection (the server listened for the request closing, not the reply). `app.inject` didn't show it, so the test uses real HTTP. | `server/test/api.test.js`: Q&A streams over a real HTTP connection and closes when done |

**Past fixes not yet covered by a tagged regression test** (from the HANDOFF change log; some may already be tested under another name, so check before writing a new test):
- 2026-10-04: switching logins without a reload left the other view showing.
- 2026-10-04: the element helper `h()` only flattened one level of children (pills showed "[object HTMLSpanElement]").
- 2026-10-07: Classic 3D dice invisible after another 3D roller had been used.
- 2026-10-08: a stat block found online lost `source: 'web'` when its creature was placed on a map.
- 2026-10-08: the DM could still get a character sheet through the server (now 403).
- 2026-10-08: DMG citations 5 pages off (page numbers in running footers).
