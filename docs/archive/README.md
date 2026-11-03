# Archive (don't read by default)

The project's docs as they were before the 2026-11-02 compaction, kept word for word so nothing is lost. Agents don't read these by default (AGENTS.md); search them with grep when you need history: why something was done, what was tried, or a detail the compact docs left to the past.

| File | What |
|---|---|
| [HANDOFF-2026-11-02.md](HANDOFF-2026-11-02.md) | HANDOFF.md as it was (442 KB): current state, next steps, VS Code checks, decisions, every change-log entry. |
| [SPEC-2026-11-02.md](SPEC-2026-11-02.md) | SPEC.md as it was (338 KB), with its version history (v0.1 to v1.04). |
| [changelog.md](changelog.md) | Every change-log entry from 2026-10-03 to 2026-10-30. Move HANDOFF's oldest entries here (at the end) when its change log grows past about 20. |

What changed in the compaction: SPEC's feature sections moved to `docs/spec/` (word for word, except that the owner's quoted words inside brackets like `(owner, 2026-10-21: "…")` were cut to `(owner, 2026-10-21)`; the quotes are here). HANDOFF's "Checks to run in VS Code" moved to `docs/vscode-checks.md`, its open questions merged with SPEC §9, and its long "What's built" list, which repeated SPEC §6.1, became a summary.
