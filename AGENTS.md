# Notes for AI coding assistants

Before doing anything, read:

1. [HANDOFF.md](HANDOFF.md): current state, change log, decisions, what's verified, next steps.
2. [SPEC.md](SPEC.md): the design. It is the source of truth; update it when a decision changes.
3. [README.md](README.md): setup, commands, API.
4. [docs/notes/](docs/notes/README.md) when you need the background: design notes, research and checklists for features not built yet.

Rules for this project:

- All JavaScript (ES modules, Node 22+). npm packages are welcome.
- Clients are display-only. All processing, indexing and AI calls happen on the server.
- The knowledge base belongs to the archivist AI. Don't add fixed human-readable structures to it; change the archivist's instructions or tools instead.
- Privacy is enforced in server code (`known_by`, attendance, note ownership). Every new read path must filter by the viewer.
- Never modify or delete anything in `data/archive/`. Everything else can be regenerated from it.
- Bump `PIPELINE_VERSION` in `packages/server/src/config.js` when prompts, schemas, chunking or the memory design change.
- Don't change the Q&A model without asking the project owner (Kenny). Kenny hosts the server; he is not the DM.
- Run `npm test` before finishing. Tests are offline and free (fake AI).
- **Regression tests** ([docs/regressions.md](docs/regressions.md)): whenever something is found wrong and fixed, add a test named `regression: …` that fails without the fix and passes with it, and list it in `docs/regressions.md`. Use the `regression-keeper` worker (`.claude/agents/regression-keeper.md`) for this. After any change, run `npm run test:regressions` (fast), then `npm test`. Regression tests are small checks that a past bug hasn't returned, never end-to-end runs or real AI calls (they waste credits). A check that only the owner's machine can do goes on HANDOFF.md's "Checks to run in VS Code" list; a VS Code session runs that list and clears what it ran. A failing regression test means the change re-broke something: fix the code, never weaken the test. A hook runs the regression tests before every `git commit` that touches `packages/` and stops it if one fails.
- When you finish a piece of work, add a dated entry to the change log in HANDOFF.md and update its "Current state" and "Next steps".
