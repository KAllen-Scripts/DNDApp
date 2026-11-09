# Tests

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

`page.settle()` and `page.waitFor()` give up after 20 s (a passing test never waits that long; on a slow machine running the whole suite, 5 s wasn't enough). `withPage` fails the test if the page throws. See the existing tests in `packages/web/test/` for dialogs, uploads, dragging and live updates.

**Regression tests** guard bugs that were found and fixed. They're ordinary tests whose names start with `regression: `, kept next to the related tests; [docs/regressions.md](regressions.md) lists each bug and its test.

```sh
npm run test:regressions   # only the regression tests (about 20 seconds)
```

In Claude Code, the `regression-keeper` worker (`.claude/agents/`) writes and checks them, and a hook (`.claude/settings.json`, `.claude/hooks/regressions.mjs`) runs them before every `git commit` that touches `packages/`, stopping the commit if one fails.

**On a slow, small machine** (the owner's phone host, 2026-11-09: 8 slow cores, 2.7 GB of memory) the suite runs, but slowly (a page test takes 15 to 50 s), and `web/test/sheet.test.js` outgrows Node's default heap there (about 780 MB). Give it more memory, and run fewer files at once (from a package's folder; npm's workspaces don't pass the option on):

```sh
cd packages/web && NODE_OPTIONS=--max-old-space-size=2048 node --test --test-concurrency=2 "test/*.test.js"
```
