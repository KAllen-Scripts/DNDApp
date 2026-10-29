import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, callTool, fakeEmbedder, SAMPLE } from './helpers.js';
import { config as baseConfig } from '../src/config.js';
import { embedWindows, WINDOW_WORDS } from '../src/kb/search.js';
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

// Tool results used to be cut at a size (`…(truncated)`), so a long record reached the AIs without its end (owner, 2026-10-14: archive thoroughly, nothing shortened).
test("regression: the archivist's tools never cut a record or a transcript line short; what doesn't fit is named", async () => {
  const t = await setup({ config: { archivist: { ...baseConfig.archivist, maxToolResultTokens: 100 } } });
  let tools;
  try {
    const cid = t.campaign.id;
    await t.request('POST', `/campaigns/${cid}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
    await t.jobs.idle();
    const { createArchivist } = await import('../src/kb/archivist.js');
    const archivist = createArchivist({ db: t.db, store: t.store, kb: t.kb, search: t.search, config: t.config, llm: { agent: async (opts) => ((tools = opts.tools), { answer: 'ok' }) } });
    await archivist.runCorrection(cid, { id: 1, text: 'x' });

    const ids = [];
    for (const n of [1, 2, 3]) ids.push((await t.kb.create(cid, 'r', { kind: 'lore', title: `Lore ${n}`, body: `${'word '.repeat(80)}END ${n}` })).id);
    const got = await callTool(tools, 'get_records', { ids });
    assert.doesNotMatch(got, /truncated/);
    assert.ok(got.includes(`${'word '.repeat(80)}END 1`), 'the first record comes whole');
    assert.match(got, new RegExp(`Not shown.*#${ids[1]} Lore 2; #${ids[2]} Lore 3`));

    // A long list comes in pages of whole lines, and every record is on one of them.
    for (let n = 4; n <= 30; n++) await t.kb.create(cid, 'r', { kind: 'lore', title: `Lore ${n}` });
    const seen = [];
    for (let offset = null, page = 0; page < 30; page++) {
      const list = await callTool(tools, 'list_records', { kind: 'lore', status: null, offset });
      seen.push(...[...list.matchAll(/^#(\d+) \| lore/gm)].map((m) => Number(m[1])));
      const next = /offset (\d+)\.$/.exec(list);
      if (!next) break;
      offset = Number(next[1]);
    }
    assert.equal(seen.length, 30);
    assert.equal(new Set(seen).size, 30);

    // The transcript stops at a whole line and says where to go on from.
    const lines = SAMPLE.split('\n');
    const part = await callTool(tools, 'read_transcript', { session: 1, from: '00:00:00', to: '09:00:00' });
    const from = /Continue with read_transcript from (\d\d:\d\d:\d\d)/.exec(part)?.[1];
    assert.ok(from, part);
    const shown = part.split('\n\n')[0].split('\n');
    for (const l of shown) assert.ok(lines.some((x) => x.endsWith(l.slice(l.indexOf(': ')))), `a whole transcript line: ${l}`);
    assert.ok(!part.includes('truncated'));
  } finally {
    await t.cleanup();
  }
});

test('regression: Q&A tools and the pre-search give whole records, never cut mid-way', async () => {
  const t = await setup({ config: { qa: { maxToolResultTokens: 50, preSearchTokens: 50 } } });
  try {
    const cid = t.campaign.id;
    const r = await t.kb.create(cid, 'r', { kind: 'npc', title: 'Brother Hal', body: `Innkeeper. ${'detail '.repeat(60)}He owes the Baron 200 gold.` });
    const { createTools } = await import('../src/qa/tools.js');
    const qa = createTools({ db: t.db, store: t.store, kb: t.kb, search: t.search, config: t.config, campaignId: cid, viewer: { userId: t.sam.id, seesAll: false } });
    const get = qa.list.find((x) => x.name === 'get_records');
    assert.match(await get.run({ ids: [r.id] }), /He owes the Baron 200 gold\.$/);
    assert.match((await qa.preSearch('Brother Hal innkeeper')).text, /He owes the Baron 200 gold\./);
  } finally {
    await t.cleanup();
  }
});

// The embedding model reads only a text's opening, so meaning search used to miss everything past the first few hundred words of a record or chunk.
test('regression: meaning search embeds all of a long text, a window at a time', async () => {
  const words = Array.from({ length: 1000 }, (_, i) => `w${i}`);
  const windows = embedWindows('Title', words.join(' '));
  assert.ok(windows.length > 1);
  const covered = new Set(windows.flatMap((w) => w.split('\n')[1].split(' ')));
  for (const w of words) assert.ok(covered.has(w), `${w} is embedded`);
  for (const w of windows) assert.ok(w.startsWith('Title\n') && w.split('\n')[1].split(' ').length <= WINDOW_WORDS);

  const t = await setup();
  try {
    const cid = t.campaign.id;
    const r = await t.kb.create(cid, 'r', { kind: 'lore', title: 'Long', body: words.join(' ') });
    const row = t.db.prepare("SELECT embedding, embed_model FROM docs WHERE kind = 'kb' AND ref_id = ?").get(String(r.id));
    const dims = (await fakeEmbedder.embed(['x']))[0].length;
    assert.ok(row.embedding.length / 4 / dims >= windows.length, 'one vector per window');
    // Docs embedded the old way (only their opening) are embedded again on start-up.
    t.db.prepare("UPDATE docs SET embed_model = ? WHERE kind = 'kb'").run(fakeEmbedder.model);
    assert.equal(await t.search.reembedStale(), 1);
    assert.equal(t.db.prepare("SELECT embed_model FROM docs WHERE kind = 'kb'").get().embed_model, row.embed_model);
  } finally {
    await t.cleanup();
  }
});
