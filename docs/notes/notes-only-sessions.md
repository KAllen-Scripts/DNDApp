# Sessions built from notes (no transcript)

Design notes from Kenny, 2026-10-07. Not built yet.

## Why

Some groups won't record their sessions. Players take notes on laptops instead, so the knowledge base may be built from notes rather than transcripts.

## How it works today

It doesn't. Notes are archived and searchable by their author straight away, but they only reach the archivist when a transcript is uploaded for that date. Session upload requires a transcript (`packages/server/src/app.js:534`), and the archivist only runs from the `ingest` job, which starts by parsing the transcript. The admin screen lists "dates with player notes but no transcript", and those dates wait forever.

## Kenny's design

- **Anyone submits.** Any user, DM or player, can submit their notes with a session number. The AI builds the session from whatever notes it gets. A transcript stays optional.
- **The archivist infers, as always.** It decides who knows what from the notes themselves (for example, two players noting the same event suggests it happened openly), the same way it does from transcripts.
- **Private notes.** A note can be marked private. Unmarked notes are left to the archivist's judgement as usual; a private one is a hard rule: anything learned only from it stays known by its author alone.
- **Kept simple:** no special DM flow, no attendance ticking, no offline caching (the page needs the server anyway).

## Things to settle when building it

- **Where the button lives:** "Submit notes for session N" on the Notes tab. The session is created if it doesn't exist yet.
- **More notes later:** the archivist re-runs when more notes are submitted for the same session (it already handles re-runs and updates records).
- **Attendance:** whoever submitted notes for the session, plus the DM. That matches how note-takers already count as present today.
- **Private and the DM:** today the archivist includes the DM in `known_by` for records built from private notes (SPEC §5.5, deferred with the DM role). A private flag should probably mean "not even the DM". That needs Kenny's call.
- **Private is enforced in code too:** the archivist's tools should refuse a `known_by` wider than the author on a record whose only source is a private note, so this doesn't rely on the model alone (AGENTS.md: privacy is enforced in server code).
- **Mixing with transcripts:** if a session has a transcript and notes, both feed the same archivist run, as now.
- **Pipeline:** a new ingest path with no transcript (skip parse, speaker map and chunking), and the archivist told when notes are the only record. Prompt and schema change, so bump `PIPELINE_VERSION`.
