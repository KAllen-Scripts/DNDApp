# Notes for AI coding assistants

Before doing anything, read:

1. [HANDOFF.md](HANDOFF.md): current state, next steps, open questions, decisions, lessons, recent changes.
2. [SPEC.md](SPEC.md): the design's core. It is the source of truth; update it when a decision changes.

Then read only what your task needs:

3. [docs/spec/](docs/spec/) for the feature you're working on (SPEC §6 lists which file holds which feature: sheets, dice, maps, map combat, the world, the map creator, creatures and items, handouts/rests/settings, the wiki, recording, the page frame).
4. [README.md](README.md) and [docs/hosting.md](docs/hosting.md) (setup, hosting, data), [docs/api.md](docs/api.md) (the API), [docs/testing.md](docs/testing.md) (tests), [docs/features.md](docs/features.md) (each feature for its users), [docs/regressions.md](docs/regressions.md) (when adding a regression test).
5. [docs/notes/](docs/notes/README.md) for background: design notes, research and checklists for features not built yet.
6. [docs/vscode-checks.md](docs/vscode-checks.md) only in a VS Code session that runs the owner's checks (others just add a line to it).

**Don't read [docs/archive/](docs/archive/README.md)** unless you need history (why something was done, what was tried): it holds the full old HANDOFF, SPEC and change log. Search it with grep rather than reading it whole.

**Reading code:** the tools read a file whole (up to 2,000 lines) or a range of lines; there's no reading one function. So find what you need first (grep for the function or the route, or `grep -n "^export\|^function\|^const .* = (" file`), then read just those lines with an offset and limit. Many files are 1,000–2,400 lines; don't read one whole to change a few lines.

Rules for this project:

- All JavaScript (ES modules, Node 22+). npm packages are welcome.
- **Where code goes** (SPEC §3.1 lists every folder): web page files go in the folder for their part of the page (`page/`, `sheet/`, `map/`, `wiki/`, `dice/`, `campaign/`, `items/`, `creatures/`…), named for what they do without repeating the folder (`map/combat.js`, not `map/map-combat.js`). Making elements and status messages (`h`, `svg`, `$`, `note`) comes from `page/dom.js` and talking to the server from `page/api.js`; don't define your own copies. Server files go in the folder for their feature (`wiki/`, `maps/`, `sheets/`, `items/`…), not loose in `src/`. `packages/shared/src` stays one flat folder, because the page loads it from `/shared/<file>`.
- Clients are display-only. All processing, indexing and AI calls happen on the server. (One exception, the owner's call on 2026-10-14: a player's page works out their map fog from the walls the server sends, so it can follow a dragged token.)
- The knowledge base belongs to the archivist AI. Don't add fixed human-readable structures to it; change the archivist's instructions or tools instead.
- Privacy is enforced in server code (`known_by`, attendance, note ownership). Every new read path must filter by the viewer. On maps, players get the picture and the wall layout (the owner accepts that a determined player could see them in their browser); the server still decides which tokens and other things under the fog they get.
- Never modify or delete anything in `data/archive/`. Everything else can be regenerated from it.
- Bump `PIPELINE_VERSION` in `packages/server/src/config.js` when prompts, schemas, chunking or the memory design change.
- Don't change the Q&A model without asking the project owner (Kenny). Kenny hosts the server; he is not the DM.
- Run `npm test` before finishing. Tests are offline and free (fake AI).
- **Restarting the server** (for example when Kenny asks from a phone over Remote Control): run `npm run restart` (or `npm run server:start` / `npm run server:stop`). It stops whatever node process holds port 4400, runs `npm install`, starts the server so it outlives your session, waits until it answers, and logs to `data/server.log`. On Windows the server is created by Windows itself (WMI), outside the Claude app: a plain detached process still dies when the app closes or updates. `server:start` does nothing if the server is already running. Don't start the server as a background task instead: on Windows, stopping that task leaves the old process holding the port. A restart briefly takes the live site down for the players, so say so when you do it.
- **Regression tests** ([docs/regressions.md](docs/regressions.md)): whenever something is found wrong and fixed, add a test named `regression: …` that fails without the fix and passes with it, and list it in `docs/regressions.md`. Use the `regression-keeper` worker (`.claude/agents/regression-keeper.md`) for this. After any change, run `npm run test:regressions` (fast), then `npm test`. Regression tests are small checks that a past bug hasn't returned, never end-to-end runs or real AI calls (they waste credits). A check that only the owner's machine can do goes in docs/vscode-checks.md; a VS Code session runs that list and clears what it ran. A failing regression test means the change re-broke something: fix the code, never weaken the test. A hook runs the regression tests before every `git commit` that touches `packages/` and stops it if one fails. During staged work (the owner, 2026-10-27), run the regression tests and `npm test` once at the end of each stage, not after every PR: put `SKIP_REGRESSIONS=1` in front of a mid-stage `git commit` and the hook lets it through.
- **Real browser** (only for what jsdom can't show: layout, the canvas fog, WebGL dice, console errors): `scripts/browser.js` `openTable({ accounts: [...] })` starts a throwaway server on a copy of `data/` (fake AI, no jobs, port 4401; the live data is only read) and gives logged-in Playwright pages in the installed Chrome, one per account, with their console errors collected. Write the steps in a script in your scratchpad, not in the repo.
- When you finish a piece of work, add a short dated entry at the top of HANDOFF.md's change log and update its "Current state" and "Next steps"; put the design detail in SPEC or its docs/spec file, not the change log.
