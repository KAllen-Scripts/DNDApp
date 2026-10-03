import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, createFakeLLM, SAMPLE, SAMPLE_2, fakeEmbedder } from './helpers.js';
import { createContext } from '../src/context.js';

/** Parse an SSE response body into [{event, data}]. */
const parseSse = (body) =>
  body
    .split('\n\n')
    .filter((b) => b.startsWith('event:'))
    .map((b) => {
      const [e, d] = b.split('\n');
      return { event: e.slice(7), data: JSON.parse(d.slice(6)) };
    });

async function upload(t, n = 1, transcript = SAMPLE, played_on = '2026-10-01') {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: n, played_on, transcript } });
  await t.jobs.idle();
  return res;
}

const ask = async (t, question, as) => {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/ask`, { body: { question }, as });
  return parseSse(res.body);
};

// ---------- accounts ----------

test('auth: rejects missing/invalid tokens and non-members', async () => {
  const t = await setup();
  try {
    assert.equal((await t.app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
    assert.equal((await t.app.inject({ method: 'GET', url: '/me' })).statusCode, 401);
    assert.equal((await t.request('GET', '/me', { as: 'nope' })).statusCode, 401);
    const { token } = t.auth.createUser('Outsider');
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}`, { as: token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('DM invites a player; players cannot do DM things; revoke works', async () => {
  const t = await setup();
  try {
    const invite = await t.request('POST', `/campaigns/${t.campaign.id}/members`, { body: { name: 'Jo', character_name: 'Pip' } });
    const { token, user } = invite.json();
    const me = (await t.request('GET', '/me', { as: token })).json();
    assert.equal(me.campaigns[0].role, 'player');

    for (const [method, url, body] of [
      ['POST', `/campaigns/${t.campaign.id}/sessions`, { number: 1, played_on: '2026-10-01', transcript: SAMPLE }],
      ['POST', `/campaigns/${t.campaign.id}/corrections`, { text: 'x' }],
      ['GET', `/campaigns/${t.campaign.id}/questions`],
      ['GET', `/campaigns/${t.campaign.id}/kb`],
    ]) {
      assert.equal((await t.request(method, url, { as: token, body })).statusCode, 403, url);
    }

    await t.request('DELETE', `/campaigns/${t.campaign.id}/members/${user.id}`);
    assert.equal((await t.request('GET', '/me', { as: token })).statusCode, 401);
  } finally {
    await t.cleanup();
  }
});

// ---------- sessions & archivist ----------

test('upload needs a date; transcripts are archived and never replaced', async () => {
  const t = await setup();
  try {
    const noDate = await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: 1, transcript: SAMPLE } });
    assert.equal(noDate.statusCode, 400);

    assert.equal((await upload(t)).statusCode, 201);
    const archived = path.join(t.paths.archive, t.campaign.slug, 'sessions', '0001', 'transcript.txt');
    assert.equal(fs.readFileSync(archived, 'utf8'), SAMPLE);

    const same = await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
    assert.equal(same.statusCode, 200);
    const different = await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, {
      body: { number: 1, played_on: '2026-10-01', transcript: `${SAMPLE}\n[00:03:00] KennyDM: extra` },
    });
    assert.equal(different.statusCode, 409);

    const text = await t.request('POST', `/campaigns/${t.campaign.id}/sessions?number=2&played_on=2026-10-08`, {
      body: SAMPLE_2,
      headers: { 'content-type': 'text/plain' },
    });
    assert.equal(text.statusCode, 201);
    await t.jobs.idle();
  } finally {
    await t.cleanup();
  }
});

test('archivist gets the transcript, notes, roster and attendance, and builds the knowledge base', async () => {
  const t = await setup();
  try {
    await t.store.setGlossary(t.campaign.id, [{ term: 'Brother Hal', variants: ['Brother Hall'] }]);
    await t.request('POST', `/campaigns/${t.campaign.id}/notes`, {
      as: t.sam.token,
      body: { text: 'Innkeeper is called Hal. Owes us nothing yet.', session_date: '2026-10-01' },
    });
    await t.request('POST', `/campaigns/${t.campaign.id}/notes`, {
      as: t.sam.token,
      body: { text: 'Note for a different day', session_date: '2026-09-01' },
    });

    const res = await upload(t);
    assert.equal(res.json().player_notes, 1);
    const s1 = (await t.request('GET', `/campaigns/${t.campaign.id}/sessions/1`)).json();
    assert.equal(s1.session.status, 'ready', s1.session.error);
    assert.deepEqual(s1.attendees.map((a) => a.name).sort(), ['Alex', 'Kenny', 'Sam']);

    const run = t.llm.calls.find((c) => c.purpose === 'archivist:session 1');
    assert.match(run.system, /full authority over the campaign's knowledge base/);
    assert.match(run.prompt, /\[00:00:40\] DM: Brother Hal, the innkeeper/); // speaker map + glossary applied
    assert.match(run.prompt, /user \d+ \(Sam\): Innkeeper is called Hal/); // that day's notes, attributed
    assert.doesNotMatch(run.prompt, /different day/);
    assert.match(run.prompt, /user \d+ \| Sam \| player \| plays Thorin \| transcript name: SamPlays/);
    assert.match(run.prompt, /empty: the knowledge base is new/);

    const dump = (await t.request('GET', `/campaigns/${t.campaign.id}/kb`)).json();
    assert.equal(dump.guide, 'Kinds: npc, debt, story. Story is pinned.');
    assert.deepEqual(dump.records.map((r) => r.title).sort(), ['Brother Hal', 'Story so far']);

    const questions = (await t.request('GET', `/campaigns/${t.campaign.id}/questions`)).json();
    assert.equal(questions[0].question, 'Is it Brother Hal or Brother Hall?');

    // Snapshot of the run (report, journal, full knowledge base) in the archive.
    const outputs = path.join(t.paths.archive, t.campaign.slug, 'outputs', 'v2');
    const [snap] = fs.readdirSync(outputs);
    const journal = JSON.parse(fs.readFileSync(path.join(outputs, snap, 'journal.json'), 'utf8'));
    assert.deepEqual(journal.map((j) => j.op), ['guide', 'create', 'create']);

    // Second run sees the guide and pinned records it made.
    await upload(t, 2, SAMPLE_2, '2026-10-08');
    const run2 = t.llm.calls.find((c) => c.purpose === 'archivist:session 2');
    assert.match(run2.prompt, /<guide>\nKinds: npc, debt, story/);
    assert.match(run2.prompt, /<pinned_records>[\s\S]*Story so far/);
    assert.match(run2.prompt, /<open_questions_for_dm>\n- Is it Brother Hal or Brother Hall\?/);
  } finally {
    await t.cleanup();
  }
});

test('a failed session can be retried', async () => {
  let fail = true;
  const llm = createFakeLLM({
    archivist: async () => {
      if (fail) throw new Error('Claude Code not logged in');
      return 'ok';
    },
  });
  const t = await setup({ llm });
  try {
    await upload(t);
    let s = (await t.request('GET', `/campaigns/${t.campaign.id}/sessions/1`)).json().session;
    assert.equal(s.status, 'failed');
    assert.equal(s.error, 'Claude Code not logged in');
    fail = false;
    assert.equal((await t.request('POST', `/campaigns/${t.campaign.id}/sessions/1/process`)).statusCode, 200);
    await t.jobs.idle();
    s = (await t.request('GET', `/campaigns/${t.campaign.id}/sessions/1`)).json().session;
    assert.equal(s.status, 'ready');
  } finally {
    await t.cleanup();
  }
});

// ---------- player notes ----------

test('player notes are private, archived, and searchable only by their author', async () => {
  const llm = createFakeLLM({
    qaScript: [
      [{ tool: 'search_my_notes', input: { query: 'cellar trapdoor' } }, { answer: 'From your notes.' }],
      [{ tool: 'search_my_notes', input: { query: 'cellar trapdoor' } }, { answer: 'Nothing.' }],
      [{ tool: 'search_my_notes', input: { query: 'cellar trapdoor' } }, { answer: 'Nothing.' }],
    ],
  });
  const t = await setup({ llm });
  try {
    const created = await t.request('POST', `/campaigns/${t.campaign.id}/notes`, {
      as: t.sam.token,
      body: { text: 'Secret trapdoor in the cellar of the inn' },
    });
    assert.equal(created.statusCode, 201);
    const note = created.json();
    assert.match(note.session_date, /^\d{4}-\d{2}-\d{2}$/);

    // Only the author can list it. Not other players, not the DM.
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/notes`, { as: t.sam.token })).json().length, 1);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/notes`, { as: t.alex.token })).json().length, 0);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/notes`)).json().length, 0);

    // Archived immediately.
    const file = path.join(t.paths.archive, t.campaign.slug, 'player-notes', `${note.session_date}.jsonl`);
    assert.match(fs.readFileSync(file, 'utf8'), /Secret trapdoor/);

    // Searchable in Q&A by the author only, even before any transcript exists.
    await ask(t, 'Where was the trapdoor?', t.sam.token);
    await ask(t, 'Where was the trapdoor?', t.alex.token);
    await ask(t, 'Where was the trapdoor?', t.dmToken);
    const [samCall, alexCall, dmCall] = llm.calls.filter((c) => c.purpose === 'qa');
    assert.match(samCall.toolResults[0].result, /Secret trapdoor/);
    assert.match(samCall.prompt, /automatic_search_results[\s\S]*Secret trapdoor/);
    assert.equal(alexCall.toolResults[0].result, 'No matching notes.');
    assert.doesNotMatch(alexCall.prompt, /trapdoor in the cellar/);
    assert.equal(dmCall.toolResults[0].result, 'No matching notes.');
  } finally {
    await t.cleanup();
  }
});

// ---------- privacy in Q&A ----------

test('players only see records and transcripts they should know about', async () => {
  const llm = createFakeLLM({
    qaScript: [
      // Sam was at session 2.
      [
        { tool: 'list_records', input: { kind: null, status: null } },
        { tool: 'read_transcript', input: { session: 2, from: '00:00:00', to: '00:02:00' } },
        { answer: 'The cult owes the Baron 200 gold [S2 00:01:00].' },
      ],
      // Alex missed session 2.
      [
        { tool: 'list_records', input: { kind: null, status: null } },
        { tool: 'search_kb', input: { query: 'Baron ledger gold', kind: null } },
        { tool: 'search_transcript', input: { query: 'ledger Baron', from_session: null, to_session: null } },
        { tool: 'read_transcript', input: { session: 2, from: '00:00:00', to: '00:02:00' } },
        { answer: 'Something [S2 00:01:00].' },
      ],
    ],
  });
  const t = await setup({ llm });
  try {
    await upload(t, 1);
    await upload(t, 2, SAMPLE_2, '2026-10-08'); // AlexR doesn't speak: Alex absent

    const s2 = (await t.request('GET', `/campaigns/${t.campaign.id}/sessions/2`)).json();
    assert.deepEqual(s2.attendees.map((a) => a.name).sort(), ['Kenny', 'Sam']);
    const debt = t.db.prepare("SELECT known_by FROM kb_records WHERE kind = 'debt'").get();
    assert.deepEqual(JSON.parse(debt.known_by), [t.dm.id, t.sam.id]);

    const samEvents = await ask(t, 'What did the ledger say?', t.sam.token);
    const alexEvents = await ask(t, 'What did the ledger say?', t.alex.token);
    const [samCall, alexCall] = llm.calls.filter((c) => c.purpose === 'qa');

    assert.match(samCall.toolResults[0].result, /The cult owes the Baron 200 gold/);
    assert.match(samCall.toolResults[1].result, /Thorin finds a ledger/);
    assert.equal(samEvents.at(-1).data.evidence[0].source, 'S2 00:01:00');

    assert.doesNotMatch(alexCall.toolResults[0].result, /Baron/);
    assert.doesNotMatch(alexCall.toolResults[1].result, /Baron/);
    assert.doesNotMatch(alexCall.toolResults[2].result, /ledger/);
    assert.match(alexCall.toolResults[3].result, /wasn't at session 2/);
    assert.doesNotMatch(alexCall.prompt, /Baron/);
    assert.deepEqual(alexEvents.at(-1).data.evidence, []);

    // Pinned records (visible to everyone) reach both.
    assert.match(alexCall.system, /<pinned_records>[\s\S]*Story so far/);
    assert.match(alexCall.system, /You are answering: Alex, who plays Lyra/);

    // Transcript endpoint follows attendance too.
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/sessions/2/transcript`, { as: t.alex.token })).statusCode, 403);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/sessions/2/transcript`, { as: t.sam.token })).statusCode, 200);
    const sessions = (await t.request('GET', `/campaigns/${t.campaign.id}/sessions`, { as: t.alex.token })).json();
    assert.deepEqual(sessions.map((s) => s.attended), [true, false]);
  } finally {
    await t.cleanup();
  }
});

// ---------- corrections & questions ----------

test('DM corrections and answers to archivist questions are applied by the archivist', async () => {
  const t = await setup();
  try {
    await upload(t);
    const res = await t.request('POST', `/campaigns/${t.campaign.id}/corrections`, { body: { text: "The innkeeper's name is Brother Hal." } });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().correction.after_session, 1);
    await t.jobs.idle();

    const run = t.llm.calls.find((c) => c.purpose.startsWith('archivist:correction'));
    assert.match(run.prompt, /<dm_correction id="1">\nThe innkeeper's name is Brother Hal\./);
    assert.equal(t.db.prepare("SELECT title FROM kb_records WHERE kind = 'npc'").get().title, 'Brother Hal (corrected)');
    assert.match(fs.readFileSync(path.join(t.paths.archive, t.campaign.slug, 'corrections.jsonl'), 'utf8'), /Brother Hal/);

    const [q] = (await t.request('GET', `/campaigns/${t.campaign.id}/questions?status=open`)).json();
    const answered = await t.request('POST', `/campaigns/${t.campaign.id}/questions/${q.id}/answer`, { body: { answer: 'Brother Hal.' } });
    assert.match(answered.json().correction.text, /You asked: Is it Brother Hal or Brother Hall\?[\s\S]*The DM's answer: Brother Hal\./);
    await t.jobs.idle();
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/questions?status=open`)).json().length, 0);
    assert.equal(t.llm.calls.filter((c) => c.purpose.startsWith('archivist:correction')).length, 2);
  } finally {
    await t.cleanup();
  }
});

test('rebuild wipes the knowledge base and replays sessions and corrections in order', async () => {
  const t = await setup();
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/notes`, { as: t.sam.token, body: { text: 'trapdoor note', session_date: '2026-10-01' } });
    await upload(t, 1);
    await t.request('POST', `/campaigns/${t.campaign.id}/corrections`, { body: { text: 'Fix after session 1' } });
    await t.jobs.idle();
    await upload(t, 2, SAMPLE_2, '2026-10-08');
    const before = t.db.prepare('SELECT COUNT(*) AS n FROM kb_records').get().n;

    t.llm.calls.length = 0;
    t.jobs.enqueueRebuild(t.campaign.id);
    await t.jobs.idle();

    assert.deepEqual(
      t.llm.calls.map((c) => c.purpose),
      ['archivist:session 1', 'archivist:correction 1', 'archivist:session 2'],
    );
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM kb_records').get().n, before);
    assert.equal(t.db.prepare("SELECT title FROM kb_records WHERE kind = 'npc'").get().title, 'Brother Hal (corrected)');
    // Player notes are re-indexed.
    assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM docs WHERE kind = 'note'").get().n, 1);
    const jobsList = (await t.request('GET', `/campaigns/${t.campaign.id}/jobs`)).json();
    assert.equal(jobsList[0].status, 'done', jobsList[0].error);
  } finally {
    await t.cleanup();
  }
});

// ---------- Q&A ----------

test('Q&A pre-searches, cites transcript evidence, and remembers the conversation', async () => {
  const llm = createFakeLLM({
    qaScript: [
      [
        { tool: 'search_kb', input: { query: 'innkeeper', kind: null } },
        { answer: 'Brother Hal is the innkeeper [S1 00:00:40]. He gave you a key [S1 00:01:30-00:02:00] [S1].' },
      ],
      [{ answer: 'The cult hides in the old mill [S1].' }],
    ],
  });
  const t = await setup({ llm });
  try {
    await upload(t);
    const events = await ask(t, 'Who is the innkeeper?', t.sam.token);
    const done = events.find((e) => e.event === 'done').data;
    assert.deepEqual(events.filter((e) => e.event === 'tool').map((e) => e.data.name), ['search_kb']);
    assert.ok(done.durationMs >= 0);

    const qaCall = llm.calls.find((c) => c.purpose === 'qa');
    assert.match(qaCall.prompt, /Question: Who is the innkeeper\?\n\n<automatic_search_results[\s\S]*Brother Hal/);
    assert.match(qaCall.toolResults[0].result, /#\d+ Brother Hal/);
    assert.match(qaCall.system, /<archivist_guide>\nKinds: npc, debt, story/);

    assert.deepEqual(done.evidence.map((e) => e.source), ['S1 00:00:40', 'S1 00:01:30-00:02:00', 'S1']);
    assert.match(done.evidence[0].excerpt, /^\[00:00:40\] DM: Brother Hall, the innkeeper/);
    assert.equal(done.evidence[1].excerpt.split('\n').length, 2);

    await t.request('POST', `/campaigns/${t.campaign.id}/ask`, {
      as: t.sam.token,
      body: { question: 'And the cult?', conversationId: done.conversationId },
    });
    const followUp = llm.calls.filter((c) => c.purpose === 'qa').at(-1);
    assert.match(followUp.prompt, /earlier_in_this_conversation[\s\S]*Brother Hal is the innkeeper[\s\S]*Sources cited/);

    // Conversations are per user.
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/conversations/${done.conversationId}`, { as: t.alex.token })).statusCode, 404);
  } finally {
    await t.cleanup();
  }
});

test('Q&A streams over a real HTTP connection and closes when done', async () => {
  const llm = createFakeLLM({ qaScript: [[{ tool: 'list_sessions', input: {} }, { answer: 'One session so far [S1].' }]] });
  const t = await setup({ llm });
  try {
    await upload(t);
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = t.app.server.address();
    const res = await fetch(`http://127.0.0.1:${port}/campaigns/${t.campaign.id}/ask`, {
      method: 'POST',
      headers: { authorization: `Bearer ${t.dmToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'How many sessions?' }),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    const events = parseSse(await res.text()); // resolves only if the server ends the stream
    assert.deepEqual(events.map((e) => e.event), ['conversation', 'turn', 'tool', 'text', 'done']);
  } finally {
    await t.cleanup();
  }
});

// ---------- restore ----------

test('accounts, campaigns, notes and corrections are restored from the archive', async () => {
  const t = await setup();
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/notes`, { as: t.sam.token, body: { text: 'my private note', session_date: '2026-10-01' } });
    await upload(t);
    await t.request('POST', `/campaigns/${t.campaign.id}/corrections`, { body: { text: 'a correction' } });
    await t.jobs.idle();

    const fresh = await createContext({
      config: t.config,
      paths: { ...t.paths, db: path.join(t.dir, 'fresh.sqlite') },
      llm: createFakeLLM(),
      embedder: fakeEmbedder,
    });
    try {
      assert.deepEqual(fresh.restored, [t.campaign.slug]);
      // Tokens still work and keep the same user ids, so note ownership holds.
      assert.equal(fresh.auth.authenticate(`Bearer ${t.sam.token}`).id, t.sam.id);
      const c = fresh.db.prepare('SELECT id FROM campaigns').get();
      assert.equal(fresh.auth.membership(c.id, t.sam.id).character_name, 'Thorin');
      assert.equal(fresh.store.playerNotes(c.id, { userId: t.sam.id })[0].text, 'my private note');
      assert.equal(fresh.store.getCorrections(c.id)[0].text, 'a correction');
      assert.equal(fresh.store.getSpeakers(c.id).find((s) => s.speaker === 'SamPlays').user_id, t.sam.id);
      assert.equal(fresh.db.prepare("SELECT COUNT(*) AS n FROM docs WHERE kind = 'note'").get().n, 1);
    } finally {
      fresh.db.close();
    }
  } finally {
    await t.cleanup();
  }
});
