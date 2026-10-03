/**
 * Background job queue. Jobs run one at a time, in order, because the
 * archivist builds each session on top of the last. Jobs are stored in the
 * database, so a restart picks up where it left off.
 *
 *   ingest   {session}       process one session's transcript
 *   correct  {correction}    archivist applies one DM correction
 *   rebuild  {}              wipe derived data, replay every session and correction
 */
import { EventEmitter } from 'node:events';
import { json, wipeDerived } from './db/index.js';

export function createJobs({ db, store, search, pipeline, log = console }) {
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

  const correctionById = (cid, id) => store.getCorrections(cid).find((c) => c.id === id);

  async function runJob(job) {
    const cid = job.campaign_id;
    const progress = (p, message) => update(job.id, { progress: p, message });

    if (job.type === 'ingest') {
      await pipeline.processSession(cid, job.params.session, progress);
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
      for (const n of sessions) {
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

  return {
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
    },

    /** Resolves when the queue is empty (used by the CLI and tests). */
    async idle() {
      await drain();
      while (running) await new Promise((r) => setTimeout(r, 50));
    },
  };
}
