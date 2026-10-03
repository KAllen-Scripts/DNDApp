import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, callTool } from './helpers.js';
import { sessionDateFor } from '../src/store.js';

const NULLS = {
  kind: null, title: null, body: null, data_json: null, status: null, tags: null,
  visibility: null, known_by: null, pinned: null, sources: null,
};

test('knowledge base: create, update, delete are journalled and indexed', async () => {
  const t = await setup();
  try {
    const cid = t.campaign.id;
    const r = await t.kb.create(cid, 'session 1', { kind: 'debt', title: 'Owe Hal 5gp', status: 'open', data: { amount: 5 } }, { session: 1, reason: 'heard it' });
    assert.equal(r.first_session, 1);
    await t.kb.update(cid, 'session 2', r.id, { status: 'paid' }, { session: 2, reason: 'paid him' });
    const updated = t.kb.get(cid, r.id);
    assert.equal(updated.status, 'paid');
    assert.equal(updated.last_session, 2);
    assert.deepEqual(updated.data, { amount: 5 });

    const hits = await t.search.search(cid, 'owe Hal', { kinds: ['kb'] });
    assert.equal(Number(hits[0].ref_id), r.id);

    await t.kb.remove(cid, 'session 3', r.id, { reason: 'merged' });
    assert.equal(t.kb.get(cid, r.id), undefined);
    assert.equal((await t.search.search(cid, 'owe Hal', { kinds: ['kb'] })).length, 0);
    const ops = t.db.prepare('SELECT run, op, reason FROM kb_journal ORDER BY id').all();
    assert.deepEqual(ops, [
      { run: 'session 1', op: 'create', reason: 'heard it' },
      { run: 'session 2', op: 'update', reason: 'paid him' },
      { run: 'session 3', op: 'delete', reason: 'merged' },
    ]);
  } finally {
    await t.cleanup();
  }
});

test('knowledge base: visibility filters every read path', async () => {
  const t = await setup();
  try {
    const cid = t.campaign.id;
    const open = await t.kb.create(cid, 'r', { kind: 'npc', title: 'Hal the innkeeper', pinned: true });
    const secret = await t.kb.create(cid, 'r', { kind: 'secret', title: 'Hal is a cultist', known_by: [t.alex.id], pinned: true });
    const sam = { userId: t.sam.id, seesAll: false };
    const alex = { userId: t.alex.id, seesAll: false };
    const dm = { userId: t.dm.id, seesAll: true };

    assert.deepEqual(t.kb.getMany(cid, [open.id, secret.id], sam).map((r) => r.id), [open.id]);
    assert.deepEqual(t.kb.getMany(cid, [open.id, secret.id], alex).map((r) => r.id), [open.id, secret.id]);
    assert.equal(t.kb.list(cid, { viewer: sam }).length, 1);
    assert.equal(t.kb.list(cid, { viewer: dm }).length, 2);
    assert.equal(t.kb.pinned(cid, sam).length, 1);
    assert.equal((await t.search.search(cid, 'Hal cultist', { kinds: ['kb'], viewer: sam })).length, 1);
    assert.equal((await t.search.search(cid, 'Hal cultist', { kinds: ['kb'], viewer: alex })).length, 2);
  } finally {
    await t.cleanup();
  }
});

test('knowledge base: size limits, pinned budget and the reserved guide kind', async () => {
  const t = await setup({ config: { kb: { pinnedTokens: 50, maxRecordTokens: 100 } } });
  try {
    const cid = t.campaign.id;
    await assert.rejects(t.kb.create(cid, 'r', { kind: 'x', title: 't', body: 'a'.repeat(1000) }), /limit is 100/);
    await t.kb.create(cid, 'r', { kind: 'x', title: 't', body: 'a'.repeat(150), pinned: true });
    await assert.rejects(t.kb.create(cid, 'r', { kind: 'x', title: 't2', body: 'b'.repeat(150), pinned: true }), /budget is 50/);
    await assert.rejects(t.kb.create(cid, 'r', { kind: '_guide', title: 'g' }), /reserved/);
    await t.kb.setGuide(cid, 'r', 'my guide', 'start');
    assert.equal(t.kb.guide(cid), 'my guide');
    assert.equal(t.kb.list(cid).length, 1); // the guide isn't a regular record
  } finally {
    await t.cleanup();
  }
});

test('archivist tools: visibility, JSON data, errors returned to the model, questions', async () => {
  let tools;
  const t = await setup();
  try {
    // Capture the real tools from a run, with a stand-in model.
    const { createArchivist } = await import('../src/kb/archivist.js');
    const archivist = createArchivist({
      db: t.db,
      store: t.store,
      kb: t.kb,
      search: t.search,
      config: t.config,
      llm: { agent: async (opts) => ((tools = opts.tools), { answer: 'ok' }) },
    });
    await archivist.runCorrection(t.campaign.id, { id: 9, text: 'x' });

    const created = await callTool(tools, 'create_record', {
      kind: 'secret', title: 'Only Lyra saw the rune', body: '[S1]', data_json: '{"rune":"fire"}', status: '', tags: ['rune'],
      visibility: 'restricted', known_by: [t.alex.id, t.alex.id], pinned: false, sources: ['S1'], reason: 'whisper',
    });
    const id = Number(/#(\d+)/.exec(created)[1]);
    let r = t.kb.get(t.campaign.id, id);
    assert.deepEqual(r.known_by, [t.alex.id]);
    assert.deepEqual(r.data, { rune: 'fire' });

    await callTool(tools, 'update_record', { ...NULLS, id, visibility: 'everyone', reason: 'Lyra told everyone' });
    r = t.kb.get(t.campaign.id, id);
    assert.equal(r.known_by, null);
    assert.equal(t.kb.journalFor(t.campaign.id, 'correction 9').length, 2);

    assert.match(await callTool(tools, 'update_record', { ...NULLS, id, data_json: 'not json', reason: 'x' }), /^Error:/);
    assert.match(await callTool(tools, 'update_record', { ...NULLS, id, data_json: '[1,2]', reason: 'x' }), /must be a JSON object/);
    assert.match(await callTool(tools, 'delete_record', { id: 9999, reason: 'x' }), /No record #9999/);

    await callTool(tools, 'ask_dm', { question: 'Q?', context: 'C' });
    assert.equal(t.db.prepare("SELECT run FROM dm_questions").get().run, 'correction 9');
  } finally {
    await t.cleanup();
  }
});

test('notes after midnight count towards the previous day', () => {
  assert.equal(sessionDateFor(new Date(2026, 9, 3, 23, 30), 6), '2026-10-03');
  assert.equal(sessionDateFor(new Date(2026, 9, 4, 1, 15), 6), '2026-10-03');
  assert.equal(sessionDateFor(new Date(2026, 9, 4, 7, 0), 6), '2026-10-04');
});
