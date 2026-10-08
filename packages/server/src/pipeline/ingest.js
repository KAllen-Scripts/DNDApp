/**
 * Processing for one session:
 *   parse -> speaker map + glossary -> attendance -> chunk + index transcript
 *   -> archivist updates the knowledge base -> snapshot to the archive
 *
 * And for DM corrections: archivist applies the correction -> snapshot.
 * And between sessions: archivist reads sheet changes, late note edits and
 * handouts (kb/updates.js) -> snapshot.
 */
import { formatTimestamp } from '@dndapp/shared';
import { PIPELINE_VERSION } from '../config.js';
import { chunkUtterances, chunkTitle, preparedTranscript } from './prepare.js';

export function createPipeline({ db, store, archive, search, kb, archivist, updates, config }) {
  const P = config.pipeline;

  /**
   * Who was at a session: accounts linked to speakers in the transcript, plus
   * anyone who took notes that day, plus DMs. If no speaker is linked to an
   * account, everyone is assumed present.
   */
  function computeAttendance(cid, session, utterances) {
    const roster = store.roster(cid);
    const linked = store.getSpeakers(cid).filter((s) => s.user_id != null);
    if (!linked.length) return { userIds: roster.map((m) => m.user_id), assumed: true };
    const spoke = new Set(utterances.map((u) => u.rawSpeaker.toLowerCase()));
    const ids = new Set(roster.filter((m) => m.role === 'dm').map((m) => m.user_id));
    for (const s of linked) if (spoke.has(s.speaker.toLowerCase())) ids.add(s.user_id);
    for (const n of store.playerNotes(cid, { date: session.played_on })) ids.add(n.user_id);
    return { userIds: [...ids].sort((a, b) => a - b), assumed: false };
  }

  /** Index a player's note so only they can find it. */
  async function indexNote(cid, note) {
    await search.replaceDocs(cid, { kind: 'note', ref_id: note.id }, [
      { title: `My note, ${note.session_date}`, text: note.text, visible_to: [note.user_id] },
    ]);
  }

  function snapshot(cid, runLabel, report) {
    const campaign = store.getCampaign(cid);
    archive.saveRunOutput(campaign.slug, runLabel, {
      report: { run: runLabel, report },
      journal: kb.journalFor(cid, runLabel),
      knowledge_base: kb.dump(cid),
      questions: db.prepare('SELECT * FROM dm_questions WHERE campaign_id = ? AND run = ?').all(cid, runLabel),
    });
  }

  return {
    indexNote,

    /** Re-index every player note (after a rebuild wiped the index). */
    async reindexNotes(cid) {
      for (const n of store.playerNotes(cid)) await indexNote(cid, n);
    },

    /**
     * @param {number} cid
     * @param {number} sessionNum
     * @param {(fraction: number, message: string) => void} [onProgress]
     */
    async processSession(cid, sessionNum, onProgress = () => {}) {
      const session = store.getSession(cid, sessionNum);
      const reprocess = session.pipeline_version != null;
      db.prepare("UPDATE sessions SET status = 'processing', error = NULL WHERE id = ?").run(session.id);

      try {
        onProgress(0.02, 'Reading transcript');
        const raw = preparedTranscript(store, cid, sessionNum);
        if (!raw.length) throw new Error('Transcript has no lines in the expected "[HH:MM:SS] Speaker: text" format.');

        const attendance = computeAttendance(cid, session, raw);
        db.transaction(() => {
          db.prepare('DELETE FROM attendance WHERE session_id = ?').run(session.id);
          const ins = db.prepare('INSERT INTO attendance (session_id, user_id) VALUES (?, ?)');
          for (const id of attendance.userIds) ins.run(session.id, id);
        })();

        onProgress(0.05, 'Indexing transcript');
        const chunks = chunkUtterances(raw, { targetTokens: P.chunkTargetTokens, overlap: P.chunkOverlapUtterances });
        const visibleTo = attendance.assumed ? null : attendance.userIds;
        await search.replaceDocs(
          cid,
          { kind: 'chunk', session_num: sessionNum },
          chunks.map((c) => ({ ...c, title: chunkTitle(sessionNum, c), visible_to: visibleTo })),
        );

        onProgress(0.1, 'Archivist is reading the session');
        const report = await archivist.runSession(cid, { ...session, reprocess }, attendance, (calls, tool) =>
          onProgress(Math.min(0.1 + calls / config.archivist.maxToolCalls, 0.95), `Archivist: ${tool.replace(/_/g, ' ')} (${calls})`),
        );

        snapshot(cid, `session ${sessionNum}`, report);
        db.prepare("UPDATE sessions SET status = 'ready', pipeline_version = ?, processed_at = ? WHERE id = ?").run(PIPELINE_VERSION, new Date().toISOString(), session.id);
        onProgress(1, 'Done');
        return { report, attendance, duration: formatTimestamp(raw.at(-1).time) };
      } catch (err) {
        db.prepare("UPDATE sessions SET status = 'failed', error = ? WHERE id = ?").run(String(err.message ?? err), session.id);
        throw err;
      }
    },

    /**
     * Give the archivist what changed up to `until` (default now). Nothing to
     * read: no AI call. Either way, the mark moves to `until`.
     */
    async applyUpdates(cid, until, onProgress = () => {}) {
      const u = updates.collect(cid, until);
      if (u.until <= u.since) return { report: null };
      if (!u.sheets.length && !u.notes.length && !u.handouts.length) {
        updates.setMark(cid, u.until);
        return { report: null };
      }
      onProgress(0.05, 'Archivist is reading sheet changes, notes and handouts');
      const report = await archivist.runUpdates(cid, u, (calls, tool) =>
        onProgress(Math.min(0.05 + calls / config.archivist.maxToolCalls, 0.95), `Archivist: ${tool.replace(/_/g, ' ')} (${calls})`),
      );
      updates.setMark(cid, u.until);
      snapshot(cid, 'updates', report);
      return { report };
    },

    async applyCorrection(cid, correction, onProgress = () => {}) {
      onProgress(0.05, 'Archivist is applying the correction');
      const report = await archivist.runCorrection(cid, correction, (calls, tool) =>
        onProgress(Math.min(0.05 + calls / config.archivist.maxToolCalls, 0.95), `Archivist: ${tool.replace(/_/g, ' ')} (${calls})`),
      );
      snapshot(cid, `correction ${correction.id}`, report);
      return { report };
    },
  };
}
