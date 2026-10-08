/**
 * A campaign's sessions and what's made from them: members, the speaker map and glossary, transcript
 * uploads, players' private notes, the DM's corrections and the archivist's questions, jobs, Q&A and usage.
 */
import { formatTimestamp, formatUtterance, parseTimestamp, parseTranscript } from '@dndapp/shared';
import { z } from 'zod';
import { AuthError } from '../auth.js';
import { BadRequestError, NotFoundError } from '../store.js';
import { preparedTranscript } from '../pipeline/prepare.js';

export function registerCampaign(app, r) {
  const { DATE, access, attended, config, db, forViewer, jobs, kb, openLiveStream, openSse, pipeline, publicMessage, qa, search, store, upload } = r;

  // ---------- members (DM) ----------

  app.get('/campaigns/:cid/members', async (request) => {
    const { cid } = access(request, { dm: true });
    return db
      .prepare(
        `SELECT u.id, u.name, u.revoked_at, m.role, m.character_name FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.campaign_id = ? ORDER BY m.role, u.name`,
      )
      .all(cid);
  });

  // ---------- speaker map & glossary (DM) ----------

  app.get('/campaigns/:cid/speakers', async (request) => store.getSpeakers(access(request, { dm: true }).cid));

  /** Link each transcript name to an account (user_id) so attendance and privacy work. */
  app.put('/campaigns/:cid/speakers', async (request) => {
    const { cid } = access(request, { dm: true });
    const speakers = z
      .array(z.object({ speaker: z.string().min(1), display_name: z.string().min(1), user_id: z.number().int().nullish() }))
      .parse(request.body);
    store.setSpeakers(cid, speakers);
    return store.getSpeakers(cid);
  });

  app.get('/campaigns/:cid/glossary', async (request) => store.getGlossary(access(request, { dm: true }).cid));

  app.put('/campaigns/:cid/glossary', async (request) => {
    const { cid } = access(request, { dm: true });
    const entries = z
      .array(z.object({ term: z.string().min(1), variants: z.array(z.string()).default([]), note: z.string().nullish() }))
      .parse(request.body);
    store.setGlossary(cid, entries);
    return store.getGlossary(cid);
  });

  // ---------- sessions ----------

  app.get('/campaigns/:cid/sessions', async (request) => {
    const { cid, role } = access(request);
    return db
      .prepare('SELECT id, number, title, played_on, status, error, pipeline_version, created_at FROM sessions WHERE campaign_id = ? ORDER BY number')
      .all(cid)
      .map(({ id, ...s }) => forViewer(role, { ...s, attended: role === 'dm' || attended(id, request.user.id) }));
  });

  /**
   * Upload a transcript (DM). Either JSON { number, played_on, title?, transcript }
   * or a text/plain body with ?number=&played_on=&title= in the query string.
   * played_on (YYYY-MM-DD) links the session to players' notes from that date.
   */
  /** Who speaks in a transcript, with their current speaker-map link. Nothing is saved. */
  const transcriptSpeakers = (cid, utterances) => {
    const map = new Map(store.getSpeakers(cid).map((s) => [s.speaker, s]));
    const counts = new Map();
    for (const u of utterances) counts.set(u.speaker, (counts.get(u.speaker) ?? 0) + 1);
    return [...counts].map(([speaker, lines]) => ({ speaker, lines, user_id: map.get(speaker)?.user_id ?? null }));
  };

  const parseOrFail = (transcript) => {
    const { utterances } = parseTranscript(transcript);
    if (!utterances.length) throw new BadRequestError('No lines in the expected "[HH:MM:SS] Speaker: text" format were found.');
    return utterances;
  };

  /** Check a transcript before uploading it: line count, length, and who speaks (DM). */
  app.post('/campaigns/:cid/sessions/preview', upload, async (request) => {
    const { cid } = access(request, { dm: true });
    const { transcript } = z.object({ transcript: z.string().min(1) }).parse(request.body);
    const utterances = parseOrFail(transcript);
    return {
      lines: utterances.length,
      first: formatTimestamp(utterances[0].time),
      last: formatTimestamp(utterances.at(-1).time),
      speakers: transcriptSpeakers(cid, utterances),
    };
  });

  /**
   * Speaker-map entries for transcript names linked to accounts (user_id null =
   * not a member, e.g. a guest). Throws before anything is saved if a link is bad.
   */
  function speakerEntries(cid, links) {
    const roster = new Map(store.roster(cid).map((m) => [m.user_id, m]));
    return links.map(({ speaker, user_id }) => {
      const m = user_id == null ? null : roster.get(user_id);
      if (user_id != null && !m) throw new BadRequestError(`Account ${user_id} isn't in this campaign`);
      const display_name = !m ? speaker : m.role === 'dm' ? `DM (${m.name})` : `${m.character_name || m.name} (${m.name})`;
      return { speaker, display_name, user_id: m ? user_id : null };
    });
  }

  /** Merge entries into the speaker map, keeping everyone else's links. */
  function mergeSpeakers(cid, entries) {
    const map = new Map(store.getSpeakers(cid).map((s) => [s.speaker, s]));
    for (const e of entries) map.set(e.speaker, e);
    store.setSpeakers(cid, [...map.values()]);
  }

  app.post('/campaigns/:cid/sessions', upload, async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const isText = typeof request.body === 'string';
    const meta = z
      .object({
        number: z.coerce.number().int().positive(),
        played_on: DATE,
        title: z.string().trim().max(200).nullish(),
        transcript: z.string().min(1).optional(),
        // Optional: link this transcript's speakers to accounts before it is processed.
        speakers: z.array(z.object({ speaker: z.string().min(1), user_id: z.number().int().nullable() })).optional(),
      })
      .parse(isText ? request.query : request.body);
    const transcript = isText ? request.body : meta.transcript;
    if (!transcript) throw new BadRequestError('transcript is required');
    const utterances = parseOrFail(transcript);
    // Validate links first: the archive is permanent, so nothing is saved if a link is wrong.
    const links = speakerEntries(cid, meta.speakers ?? []);

    const { session, alreadyArchived } = store.addSession(cid, { ...meta, title: meta.title || null }, Buffer.from(transcript, 'utf8'));
    // Links go in before processing is queued, so attendance uses them.
    if (links.length) mergeSpeakers(cid, links);
    const busy = session.status === 'queued' || session.status === 'processing';
    const job = session.status === 'ready' || busy ? null : jobs.enqueueIngest(cid, session.number);
    reply.status(alreadyArchived ? 200 : 201);
    const speakers = [...new Set(utterances.map((u) => u.speaker))];
    const linked = new Set(store.getSpeakers(cid).filter((s) => s.user_id != null).map((s) => s.speaker));
    return {
      session: store.getSession(cid, session.number),
      job,
      already_archived: alreadyArchived,
      lines: utterances.length,
      speakers,
      // Attendance and privacy depend on these being linked to accounts in the speaker map.
      unlinked_speakers: speakers.filter((s) => !linked.has(s)),
      player_notes: store.playerNotes(cid, { date: meta.played_on }).length,
    };
  });

  app.get('/campaigns/:cid/sessions/:n', async (request) => {
    const { cid, role } = access(request);
    const session = store.getSession(cid, Number(request.params.n));
    const attendees = db
      .prepare('SELECT u.id, u.name FROM attendance a JOIN users u ON u.id = a.user_id WHERE a.session_id = ? ORDER BY u.name')
      .all(session.id);
    return { session: forViewer(role, session), attendees, attended: role === 'dm' || attended(session.id, request.user.id) };
  });

  /** Transcript lines. Players only get sessions they attended. */
  app.get('/campaigns/:cid/sessions/:n/transcript', async (request) => {
    const { cid, role } = access(request);
    const session = store.getSession(cid, Number(request.params.n));
    if (role !== 'dm' && !attended(session.id, request.user.id)) throw new AuthError("You weren't at this session", 403);
    const q = z.object({ from: z.string().optional(), to: z.string().optional() }).parse(request.query);
    const from = q.from ? parseTimestamp(q.from) : 0;
    const to = q.to ? parseTimestamp(q.to) : Infinity;
    return preparedTranscript(store, cid, session.number)
      .filter((u) => u.time >= from && u.time <= to)
      .map((u) => ({ time: formatTimestamp(u.time), speaker: u.speaker, text: u.text, line: formatUtterance(u) }));
  });

  /** Queue a session for (re)processing, e.g. after a failure or a glossary fix. */
  app.post('/campaigns/:cid/sessions/:n/process', async (request) => {
    const { cid } = access(request, { dm: true });
    const session = store.getSession(cid, Number(request.params.n));
    if (session.status === 'queued' || session.status === 'processing') {
      throw Object.assign(new Error('This session is already queued'), { statusCode: 409 });
    }
    return jobs.enqueueIngest(cid, session.number);
  });

  // ---------- player notes (private) ----------

  /**
   * Take a note during the session. Private to the author. Belongs to the
   * session played on session_date (default: today; notes before 6am count
   * towards the previous day).
   */
  app.post('/campaigns/:cid/notes', async (request, reply) => {
    const { cid } = access(request);
    const body = z.object({ text: z.string().trim().min(1).max(10_000), session_date: DATE.optional() }).parse(request.body);
    const note = store.addPlayerNote(cid, request.user.id, body);
    await pipeline.indexNote(cid, note);
    // A note for a session that was already processed reaches the archivist later (kb/updates.js).
    jobs.scheduleUpdates(cid);
    reply.status(201);
    return note;
  });

  /** Change the text of your own note: { text }. The archive keeps the earlier version. */
  app.patch('/campaigns/:cid/notes/:nid', async (request) => {
    const { cid } = access(request);
    const { text } = z.object({ text: z.string().trim().min(1).max(10_000) }).parse(request.body);
    const { user_name: _u, ...note } = store.editPlayerNote(cid, request.user.id, request.params.nid, { text });
    await pipeline.indexNote(cid, note);
    jobs.scheduleUpdates(cid);
    return note;
  });

  /** Delete your own note. It's gone from your notes and searches; the archive keeps it. */
  app.delete('/campaigns/:cid/notes/:nid', async (request) => {
    const { cid } = access(request);
    const note = store.deletePlayerNote(cid, request.user.id, request.params.nid);
    await search.replaceDocs(cid, { kind: 'note', ref_id: note.id }, []);
    jobs.scheduleUpdates(cid);
    return { deleted: note.id };
  });

  /** Your own notes only, optionally for one session date. */
  app.get('/campaigns/:cid/notes', async (request) => {
    const { cid } = access(request);
    const { date } = z.object({ date: DATE.optional() }).parse(request.query);
    return store.playerNotes(cid, { userId: request.user.id, date }).map(({ user_name, ...n }) => n);
  });

  // ---------- corrections & archivist questions (DM) ----------

  /** A correction in plain words. The archivist applies it in the background. */
  app.post('/campaigns/:cid/corrections', async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const { text } = z.object({ text: z.string().trim().min(1).max(10_000) }).parse(request.body);
    const correction = store.addCorrection(cid, { text, created_by: request.user.id });
    const job = jobs.enqueueCorrection(cid, correction.id);
    reply.status(201);
    return { correction, job };
  });

  app.get('/campaigns/:cid/corrections', async (request) => store.getCorrections(access(request, { dm: true }).cid));

  /** Questions the archivist left about conflicts it couldn't resolve. */
  app.get('/campaigns/:cid/questions', async (request) => {
    const { cid } = access(request, { dm: true });
    const { status } = z.object({ status: z.enum(['open', 'answered', 'dismissed']).optional() }).parse(request.query);
    return db
      .prepare('SELECT * FROM dm_questions WHERE campaign_id = @cid AND (@status IS NULL OR status = @status) ORDER BY id')
      .all({ cid, status: status ?? null });
  });

  /** Answering a question turns the answer into a correction. */
  app.post('/campaigns/:cid/questions/:qid/answer', async (request) => {
    const { cid } = access(request, { dm: true });
    const q = db.prepare('SELECT * FROM dm_questions WHERE id = ? AND campaign_id = ?').get(Number(request.params.qid), cid);
    if (!q) throw new NotFoundError('Question not found');
    const { answer } = z.object({ answer: z.string().trim().min(1).max(10_000) }).parse(request.body);
    const correction = store.addCorrection(cid, {
      text: `You asked: ${q.question}\nContext you gave: ${q.context}\nThe DM's answer: ${answer}`,
      created_by: request.user.id,
    });
    db.prepare("UPDATE dm_questions SET status = 'answered', answer = ? WHERE id = ?").run(answer, q.id);
    return { correction, job: jobs.enqueueCorrection(cid, correction.id) };
  });

  app.post('/campaigns/:cid/questions/:qid/dismiss', async (request) => {
    const { cid } = access(request, { dm: true });
    const { changes } = db.prepare("UPDATE dm_questions SET status = 'dismissed' WHERE id = ? AND campaign_id = ?").run(Number(request.params.qid), cid);
    if (!changes) throw new NotFoundError('Question not found');
    return { dismissed: Number(request.params.qid) };
  });

  /** Raw knowledge base, for debugging (DM). Not meant for regular reading. */
  app.get('/campaigns/:cid/kb', async (request) => kb.dump(access(request, { dm: true }).cid));

  // ---------- jobs ----------

  app.get('/campaigns/:cid/jobs', async (request) => {
    const { cid, role } = access(request);
    return jobs.list(cid).map((j) => forViewer(role, j));
  });

  /** Live job progress (SSE). Sends the current state of recent jobs, then updates. */
  app.get('/campaigns/:cid/jobs/events', async (request, reply) => {
    const { cid, role, userId } = access(request);
    const { sse, current } = openLiveStream(request, reply, { cid, role, userId });
    for (const j of jobs.list(cid, 5).reverse()) sse.send('job', forViewer(role, j));
    const listener = (job) => {
      if (job.campaign_id !== cid) return;
      const now = current();
      if (!now) return sse.end();
      sse.send('job', forViewer(now.role, job));
    };
    jobs.events.on('update', listener);
    sse.onClose(() => jobs.events.off('update', listener));
  });

  /** Wipe all generated data and replay every session and correction (DM). */
  app.post('/campaigns/:cid/rebuild', async (request) => jobs.enqueueRebuild(access(request, { dm: true }).cid));

  // ---------- Q&A ----------

  /**
   * Ask a question. Streams SSE events:
   *   conversation {conversationId} | turn {turn} | tool {name, input} | text {delta}
   *   | done {answer, evidence, ...} | error {error}
   * Text from a turn that ends in tool calls is the model thinking aloud;
   * clients should replace (not append to) displayed text on each "turn".
   */
  app.post('/campaigns/:cid/ask', async (request, reply) => {
    const { cid } = access(request);
    const body = z
      .object({ question: z.string().min(1).max(2000), conversationId: z.number().int().optional() })
      .parse(request.body);
    const sse = openSse(request, reply);
    try {
      await qa.ask({
        campaignId: cid,
        userId: request.user.id,
        question: body.question,
        conversationId: body.conversationId,
        emit: (e) => sse.send(e.type, e),
      });
    } catch (err) {
      request.log.warn(err);
      sse.send('error', { error: publicMessage(err) });
    } finally {
      sse.end();
    }
  });

  // A player's own conversations. Pinned ones first, then newest (by last question).
  app.get('/campaigns/:cid/conversations', async (request) => {
    const { cid } = access(request);
    return db
      .prepare(
        `SELECT c.id, c.title, c.pinned, c.created_at, COALESCE(MAX(q.created_at), c.created_at) AS updated_at
         FROM conversations c LEFT JOIN qa_log q ON q.conversation_id = c.id
         WHERE c.campaign_id = ? AND c.user_id = ? AND c.deleted_at IS NULL
         GROUP BY c.id ORDER BY c.pinned DESC, updated_at DESC, c.id DESC`,
      )
      .all(cid, request.user.id)
      .map((c) => ({ ...c, pinned: !!c.pinned }));
  });

  const ownConversation = (request, cid) => {
    const conv = db
      .prepare('SELECT * FROM conversations WHERE id = ? AND campaign_id = ? AND user_id = ? AND deleted_at IS NULL')
      .get(Number(request.params.id), cid, request.user.id);
    if (!conv) throw new NotFoundError('Conversation not found');
    return conv;
  };

  app.get('/campaigns/:cid/conversations/:id', async (request) => {
    const { cid } = access(request);
    const conv = ownConversation(request, cid);
    const turns = db
      .prepare("SELECT id, question, answer, evidence, created_at FROM qa_log WHERE conversation_id = ? AND status = 'ok' ORDER BY id")
      .all(conv.id)
      .map((t) => ({ ...t, evidence: JSON.parse(t.evidence) }));
    return { ...conv, pinned: !!conv.pinned, deleted_at: undefined, turns };
  });

  app.patch('/campaigns/:cid/conversations/:id', async (request) => {
    const { cid } = access(request);
    const conv = ownConversation(request, cid);
    const body = z.object({ pinned: z.boolean().optional(), title: z.string().trim().min(1).max(80).optional() }).parse(request.body ?? {});
    db.prepare('UPDATE conversations SET pinned = COALESCE(?, pinned), title = COALESCE(?, title) WHERE id = ?').run(
      body.pinned === undefined ? null : Number(body.pinned),
      body.title ?? null,
      conv.id,
    );
    const row = db.prepare('SELECT id, title, pinned, created_at FROM conversations WHERE id = ?').get(conv.id);
    return { ...row, pinned: !!row.pinned };
  });

  // Deleting erases the questions and answers for good. The bare rows stay, so the hourly
  // question limit and usage figures still count them (otherwise deleting would reset the limit).
  app.delete('/campaigns/:cid/conversations/:id', async (request) => {
    const { cid } = access(request);
    const conv = ownConversation(request, cid);
    db.transaction(() => {
      db.prepare("UPDATE qa_log SET question = '', answer = NULL, evidence = '[]', tool_calls = '[]' WHERE conversation_id = ?").run(conv.id);
      db.prepare("UPDATE conversations SET title = NULL, pinned = 0, deleted_at = datetime('now') WHERE id = ?").run(conv.id);
    })();
    return { ok: true };
  });

  // ---------- usage (DM) ----------

  app.get('/campaigns/:cid/usage', async (request) => {
    const { cid } = access(request, { dm: true });
    return {
      provider: config.llm.provider,
      // Real spend on the API. Claude Code usage is on the subscription and not counted here.
      apiSpendThisMonthUsd: db
        .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM llm_usage WHERE provider = 'api' AND created_at >= datetime('now', 'start of month')")
        .get().c,
      monthlyCapUsd: config.monthlySpendCapUsd,
      byPurpose: db
        .prepare(
          `SELECT provider, CASE WHEN purpose = 'qa' THEN 'qa' ELSE substr(purpose, 1, instr(purpose || ':', ':') - 1) END AS purpose,
             COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
             SUM(cost_usd) AS est_cost_usd, ROUND(AVG(duration_ms)) AS avg_ms FROM llm_usage
           WHERE campaign_id = ? AND created_at >= datetime('now', 'start of month') GROUP BY 1, 2 ORDER BY est_cost_usd DESC`,
        )
        .all(cid),
      questions: db
        .prepare(
          `SELECT COUNT(*) AS asked, ROUND(AVG(q.duration_ms)) AS avg_ms, ROUND(AVG(q.first_text_ms)) AS avg_first_text_ms,
             MAX(q.duration_ms) AS max_ms
           FROM qa_log q JOIN conversations c ON c.id = q.conversation_id
           WHERE c.campaign_id = ? AND q.status = 'ok' AND q.created_at >= datetime('now', 'start of month')`,
        )
        .get(cid),
    };
  });
}
