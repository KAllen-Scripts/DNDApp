/**
 * Background job queue. Jobs run one at a time, in order, because the
 * archivist builds each session on top of the last. Jobs are stored in the
 * database, so a restart picks up where it left off.
 *
 *   ingest   {session}       process one session's transcript
 *   correct  {correction}    archivist applies one DM correction
 *   updates  {}              archivist reads sheet changes, late note edits and handouts (kb/updates.js)
 *   rebuild  {}              wipe derived data, replay every session and correction
 */
import { EventEmitter } from 'node:events';
import { json, wipeDerived } from './db/index.js';

export function createJobs({ db, store, search, pipeline, config, log = console }) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  let running = false;
  let stopped = false;

  const get = (id) => {
    const j = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    return j && { ...j, params: json.parse(j.params, {}) };
  };

  const update = (id, fields) => {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE jobs SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...fields, id });
    events.emit('update', get(id));
  };

  function enqueue(campaignId, type, params) {
    const id = Number(
      db
        .prepare('INSERT INTO jobs (campaign_id, type, params) VALUES (?, ?, ?)')
        .run(campaignId, type, json.str(params)).lastInsertRowid,
    );
    events.emit('update', get(id));
    setImmediate(drain);
    return get(id);
  }

  // Between sessions, the archivist reads sheet changes and the like once things go quiet (see scheduleUpdates).
  const updateTimers = new Map();

  const correctionById = (cid, id) => store.getCorrections(cid).find((c) => c.id === id);

  async function runJob(job) {
    const cid = job.campaign_id;
    const progress = (p, message) => update(job.id, { progress: p, message });

    if (job.type === 'ingest') {
      await pipeline.processSession(cid, job.params.session, progress);
    } else if (job.type === 'updates') {
      await pipeline.applyUpdates(cid, undefined, progress);
    } else if (job.type === 'correct') {
      const correction = correctionById(cid, job.params.correction);
      if (!correction) throw new Error(`Correction ${job.params.correction} not found`);
      await pipeline.applyCorrection(cid, correction, progress);
    } else if (job.type === 'rebuild') {
      wipeDerived(db, cid);
      search.invalidate(cid);
      await pipeline.reindexNotes(cid);
      const sessions = db.prepare('SELECT number FROM sessions WHERE campaign_id = ? ORDER BY number').all(cid).map((s) => s.number);
      const corrections = store.getCorrections(cid);
      // Each correction is replayed right after the session it was made against.
      let prev = -Infinity;
      const steps = sessions.length + corrections.length || 1;
      let done = 0;
      const stepProgress = (label) => (p, message) => update(job.id, { progress: (done + p) / steps, message: `${label}: ${message}` });
      // Sheet changes and handouts are read in time order between the sessions.
      const sessionStart = (n) => {
        const { played_on } = store.getSession(cid, n);
        return new Date(`${played_on}T${String(config?.notes?.rolloverHour ?? 6).padStart(2, '0')}:00:00`).toISOString();
      };
      for (const n of sessions) {
        await pipeline.applyUpdates(cid, sessionStart(n), stepProgress('Sheets and handouts'));
        await pipeline.processSession(cid, n, stepProgress(`Session ${n}`));
        done++;
        for (const c of corrections.filter((c) => c.after_session > prev && c.after_session <= n)) {
          await pipeline.applyCorrection(cid, c, stepProgress(`Correction ${c.id}`));
          done++;
        }
        prev = n;
      }
      for (const c of corrections.filter((c) => c.after_session > prev)) {
        await pipeline.applyCorrection(cid, c, stepProgress(`Correction ${c.id}`));
        done++;
      }
      await pipeline.applyUpdates(cid, undefined, stepProgress('Sheets and handouts'));
    } else {
      throw new Error(`Unknown job type ${job.type}`);
    }
  }

  async function drain() {
    if (running || stopped) return;
    running = true;
    try {
      for (;;) {
        if (stopped) break;
        const next = db.prepare("SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1").get();
        if (!next) break;
        const job = get(next.id);
        update(job.id, { status: 'running', message: 'Starting', error: null });
        try {
          await runJob(job);
          update(job.id, { status: 'done', progress: 1, message: 'Done', finished_at: new Date().toISOString() });
        } catch (err) {
          log.error?.(err);
          update(job.id, { status: 'failed', error: String(err.message ?? err), finished_at: new Date().toISOString() });
        }
      }
    } finally {
      running = false;
    }
  }

  const jobs = {
    events,
    get,
    list: (campaignId, limit = 20) =>
      db
        .prepare('SELECT * FROM jobs WHERE campaign_id = ? ORDER BY id DESC LIMIT ?')
        .all(campaignId, limit)
        .map((j) => ({ ...j, params: json.parse(j.params, {}) })),

    enqueueIngest(campaignId, sessionNum) {
      db.prepare("UPDATE sessions SET status = 'queued' WHERE campaign_id = ? AND number = ?").run(campaignId, sessionNum);
      return enqueue(campaignId, 'ingest', { session: sessionNum });
    },

    enqueueCorrection: (campaignId, correctionId) => enqueue(campaignId, 'correct', { correction: correctionId }),

    /** Have the archivist read sheet changes, note edits and handouts now. */
    enqueueUpdates(campaignId) {
      clearTimeout(updateTimers.get(campaignId));
      updateTimers.delete(campaignId);
      const waiting = db.prepare("SELECT id FROM jobs WHERE campaign_id = ? AND type = 'updates' AND status = 'queued'").get(campaignId);
      return waiting ? get(waiting.id) : enqueue(campaignId, 'updates', {});
    },

    /**
     * Something the archivist should read changed (a sheet, a late note, a
     * handout). It's read once nothing more has changed for a while, so a
     * player filling in a sheet becomes one run, not one per keystroke.
     */
    scheduleUpdates(campaignId) {
      if (stopped) return;
      clearTimeout(updateTimers.get(campaignId));
      const ms = (config?.archivist?.updatesDelayMinutes ?? 10) * 60_000;
      const t = setTimeout(() => {
        updateTimers.delete(campaignId);
        if (!stopped) jobs.enqueueUpdates(campaignId);
      }, ms);
      t.unref?.();
      updateTimers.set(campaignId, t);
    },

    /** Wipes all derived data and replays every session and correction. */
    enqueueRebuild: (campaignId) => enqueue(campaignId, 'rebuild', {}),

    /** Resume jobs interrupted by a restart. */
    start() {
      db.prepare("UPDATE jobs SET status = 'queued' WHERE status = 'running'").run();
      setImmediate(drain);
    },

    /** Stop picking up new jobs (the current one finishes). */
    stop() {
      stopped = true;
      for (const t of updateTimers.values()) clearTimeout(t);
      updateTimers.clear();
    },

    /** Resolves when the queue is empty (used by the CLI and tests). */
    async idle() {
      await drain();
      while (running) await new Promise((r) => setTimeout(r, 50));
    },
  };
  return jobs;
}
