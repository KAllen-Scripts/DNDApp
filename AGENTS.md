# Notes for AI coding assistants

Before doing anything, read:

1. [HANDOFF.md](HANDOFF.md): current state, change log, decisions, what's verified, next steps.
2. [SPEC.md](SPEC.md): the design. It is the source of truth; update it when a decision changes.
3. [README.md](README.md): setup, commands, API.

Rules for this project:

- All JavaScript (ES modules, Node 22+). npm packages are welcome.
- Clients are display-only. All processing, indexing and AI calls happen on the server.
- The knowledge base belongs to the archivist AI. Don't add fixed human-readable structures to it; change the archivist's instructions or tools instead.
- Privacy is enforced in server code (`known_by`, attendance, note ownership). Every new read path must filter by the viewer.
- Never modify or delete anything in `data/archive/`. Everything else can be regenerated from it.
- Bump `PIPELINE_VERSION` in `packages/server/src/config.js` when prompts, schemas, chunking or the memory design change.
- Don't change the Q&A model without asking the project owner (Kenny). Kenny hosts the server; he is not the DM.
- Run `npm test` before finishing. Tests are offline and free (fake AI).
- When you finish a piece of work, add a dated entry to the change log in HANDOFF.md and update its "Current state" and "Next steps".
