/**
 * Ask's speed work (owner, 2026-10-21: "Ask is way too slow… We don't need to
 * know how the editions differ"): general D&D lookups take the quick way, every
 * answer sticks to the campaign's edition, the book search prefers that
 * edition's books, and each answer's timings are logged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup, createFakeLLM, makePdf, SAMPLE } from './helpers.js';
import { routeQuestion } from '../src/qa/route.js';
import { groupEdition, createQA } from '../src/qa/agent.js';
import { openDb } from '../src/db/index.js';

const KENNY = "What's that dnd item that is a bag you can pull summons out of?";

const parseSse = (body) =>
  body
    .trim()
    .split('\n\n')
    .map((b) => {
      const [e, d] = b.split('\n');
      return { event: e.slice(7), data: JSON.parse(d.slice(6)) };
    });

async function upload(t, n = 1, transcript = SAMPLE, played_on = '2026-10-01') {
  await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: n, played_on, transcript } });
  await t.jobs.idle();
}

const ask = async (t, question, as, extra = {}) =>
  parseSse((await t.request('POST', `/campaigns/${t.campaign.id}/ask`, { body: { question, ...extra }, as })).body);

const qaCalls = (llm) => llm.calls.filter((c) => c.purpose === 'qa');

test('Ask: general D&D lookups go the quick way; anything about the campaign goes the full way', () => {
  const quick = [
    KENNY,
    'What does Bless do?',
    'How does grappling work?',
    'What is a beholder?',
    'Does sneak attack work with a longbow?',
    'Can I cast a cantrip as a bonus action?',
    "What's the stat block for a brown bear?",
    'What weapon masteries does a 2024 rogue get?',
  ];
  for (const q of quick) assert.equal(routeQuestion(q).path, 'quick', q);

  const full = [
    'Who is the innkeeper?',
    'Where was the trapdoor?',
    'What did the ledger say?',
    'How many sessions?',
    'How much do we still owe Brother Hal?',
    'Can I hit the goblin running away from me?',
    'What spells does my character know?',
    'What did the DM rule about flanking?',
    "What is the innkeeper's name?",
    'And the cult?',
  ];
  for (const q of full) assert.equal(routeQuestion(q).path, 'full', q);

  // A name from the campaign makes it a campaign question; short names don't count.
  assert.equal(routeQuestion('What spells does Brother Hal know?', { names: ['Brother Hal'] }).path, 'full');
  assert.equal(routeQuestion('What spells does Brother Hal know?').path, 'quick');
  assert.equal(routeQuestion('What does Bless do?', { names: ['Bo', ''] }).path, 'quick');
  // A follow-up in a campaign conversation stays the full way; the asker's pick wins.
  assert.equal(routeQuestion('What does Bless do?', { previous: 'full' }).path, 'full');
  assert.equal(routeQuestion('What does Bless do?', { previous: 'quick' }).path, 'quick');
  assert.equal(routeQuestion(KENNY, { mode: 'thorough' }).path, 'full');
  assert.equal(routeQuestion('Who is the innkeeper?', { mode: 'quick' }).path, 'quick');
});

test("Ask: the quick way answers at lower effort, with fewer lookups and none of the archivist's guide or pinned records", async () => {
  const llm = createFakeLLM({ qaScript: [[{ answer: '**Bag of Tricks.** A grey, rust or tan bag…' }], [{ answer: 'Brother Hal.' }]] });
  const t = await setup({ llm });
  try {
    await upload(t);
    const events = await ask(t, KENNY, t.sam.token);
    const done = events.find((e) => e.event === 'done').data;
    assert.equal(done.path, 'quick');
    const [quick] = qaCalls(llm);
    assert.equal(quick.effort, 'low');
    assert.equal(quick.limits.maxToolCalls, t.config.qa.quickMaxToolCalls);
    assert.match(quick.system, /general Dungeons & Dragons question/);
    assert.match(quick.system, /books \(when listed below\) are there when the exact wording or numbers matter/);
    assert.doesNotMatch(quick.system, /<archivist_guide>|<pinned_records>/);
    // Only records and the wiki are searched beforehand: no transcript lines or notes.
    assert.doesNotMatch(quick.prompt, /\[S1 \d\d:\d\d:\d\d-/);
    assert.equal(t.db.prepare('SELECT path FROM qa_log ORDER BY id DESC').get().path, 'quick');

    // A campaign question: the full way, at the task's own effort, with the guide and pinned records.
    const events2 = await ask(t, 'Who is the innkeeper?', t.sam.token);
    assert.equal(events2.find((e) => e.event === 'done').data.path, 'full');
    const full = qaCalls(llm)[1];
    assert.equal(full.effort, undefined);
    assert.equal(full.limits.maxToolCalls, t.config.qa.maxToolCalls);
    assert.match(full.system, /<archivist_guide>\nKinds: npc, debt, story/);
    assert.match(full.system, /<pinned_records>[\s\S]*Story so far/);
  } finally {
    await t.cleanup();
  }
});

test('Ask: "Look it up properly" asks the same question the thorough way', async () => {
  const llm = createFakeLLM({ qaScript: [[{ answer: 'Quick.' }], [{ answer: 'Thorough.' }]] });
  const t = await setup({ llm });
  try {
    const first = (await ask(t, KENNY, t.sam.token)).find((e) => e.event === 'done').data;
    const again = (await ask(t, KENNY, t.sam.token, { mode: 'thorough', conversationId: first.conversationId })).find((e) => e.event === 'done').data;
    assert.equal(again.path, 'full');
    assert.match(qaCalls(llm)[1].system, /<archivist_guide>/);
    assert.equal((await t.request('POST', `/campaigns/${t.campaign.id}/ask`, { as: t.sam.token, body: { question: 'x', mode: 'slow' } })).statusCode, 400);
  } finally {
    await t.cleanup();
  }
});

test("Ask: a record's name sends a question the full way only for those who may see that record", async () => {
  const llm = createFakeLLM({ qaScript: [[{ answer: 'a' }], [{ answer: 'b' }]] });
  const t = await setup({ llm });
  try {
    // A record only Sam knows about.
    t.db.prepare("INSERT INTO kb_records (campaign_id, kind, title, body, known_by) VALUES (?, 'item', 'Moonglass Lantern', 'Found by Thorin.', ?)").run(t.campaign.id, JSON.stringify([t.sam.id]));
    const question = 'What spell could light the Moonglass Lantern?';
    const sam = (await ask(t, question, t.sam.token)).find((e) => e.event === 'done').data;
    const alex = (await ask(t, question, t.alex.token)).find((e) => e.event === 'done').data;
    assert.equal(sam.path, 'full');
    assert.equal(alex.path, 'quick', "Alex can't see the record, so it can't change how Alex is answered");
  } finally {
    await t.cleanup();
  }
});

test("Ask: answers stick to the campaign's edition and never set the two side by side", async () => {
  const both = [{ title: "Player's Handbook (2014)" }, { title: "Player's Handbook (2024)" }];
  assert.match(groupEdition(both, null, '2024'), /answer with the 2024 rules and say so in a few words\. Don't give both\./);
  assert.doesNotMatch(groupEdition(both), /give both where they differ/);
  assert.match(groupEdition([], null, '2014'), /unknown[\s\S]*2014 rules/);

  const llm = createFakeLLM({ qaScript: [[{ answer: 'a' }], [{ answer: 'b' }]] });
  const t = await setup({ llm });
  try {
    t.store.setSettings(t.campaign.id, { edition: '2024' });
    await ask(t, KENNY, t.sam.token);
    await ask(t, 'Who is the innkeeper?', t.sam.token);
    for (const call of qaCalls(llm)) {
      // Both ways, with or without books.
      assert.match(call.system, /Answer for the group's edition only[\s\S]*don't compare editions, unless the player asks/);
      assert.match(call.system, /set this campaign to the 2024 rules/);
    }
  } finally {
    await t.cleanup();
  }
});

// Ask's book search ignored the campaign's edition (the spell and creature lookups didn't), so answers quoted and compared both editions (owner, 2026-10-21).
test("regression: Ask's search_books looks in the campaign's edition's books first (it mixed both editions), and in all of them when those have nothing", async () => {
  const llm = createFakeLLM({
    qaScript: [
      [
        { tool: 'search_books', input: { terms: ['Bag of Tricks'], book: null } },
        { tool: 'search_books', input: { terms: ['Old Thing'], book: null } },
        { tool: 'search_books', input: { terms: ['Bag of Tricks'], book: "Dungeon Master's Guide (2014)" } },
        { answer: 'Bag of Tricks.' },
      ],
    ],
  });
  const t = await setup({ llm });
  try {
    fs.mkdirSync(t.config.booksDir, { recursive: true });
    fs.writeFileSync(path.join(t.config.booksDir, "Dungeon Master's Guide (2014).pdf"), makePdf([['BAG OF TRICKS', 'Wondrous item, uncommon', 'Old Thing']]));
    fs.writeFileSync(path.join(t.config.booksDir, "Dungeon Master's Guide (2024).pdf"), makePdf([['BAG OF TRICKS', 'Wondrous Item, Uncommon', 'New wording']]));
    fs.writeFileSync(path.join(t.config.booksDir, 'Monster Manual.pdf'), makePdf([['Bag of Tricks creatures', 'a list']]));
    t.store.setSettings(t.campaign.id, { edition: '2024' });
    await ask(t, KENNY, t.sam.token);
    const [own, fallback, named] = qaCalls(llm)[0].toolResults.map((r) => r.result);
    assert.match(own, /Dungeon Master's Guide \(2024\)/);
    assert.match(own, /Monster Manual/, 'books of no known edition stay in');
    assert.doesNotMatch(own, /\(2014\)/);
    assert.match(fallback, /Dungeon Master's Guide \(2014\)/, 'only the other edition has it: used anyway');
    assert.match(named, /^--- \(Dungeon Master's Guide \(2014\)/, 'a book asked for by name is searched');
  } finally {
    await t.cleanup();
  }
});

test('Ask: every answer comes with where the time went (for data/server.log)', async () => {
  const llm = createFakeLLM({ qaScript: [[{ tool: 'search_kb', input: { query: 'innkeeper', kind: null } }, { answer: 'Brother Hal.' }]] });
  const t = await setup({ llm });
  try {
    await upload(t);
    const { timing, path: way } = await t.qa.ask({ campaignId: t.campaign.id, userId: t.sam.id, question: 'Who is the innkeeper?' });
    assert.equal(way, 'full');
    assert.equal(timing.path, 'full');
    assert.equal(timing.turns, 1);
    assert.deepEqual(timing.tools.map((x) => x.name), ['search_kb']);
    for (const k of ['prep_ms', 'first_turn_ms', 'first_text_ms', 'total_ms', 'system_chars', 'prompt_chars']) assert.ok(timing[k] >= 0, k);
    assert.ok(timing.tools[0].ms >= 0 && timing.tools[0].at_ms >= timing.prep_ms);
    assert.ok(!JSON.stringify(timing).includes('innkeeper'), 'no question text in the log');
  } finally {
    await t.cleanup();
  }
});

test("Ask's path column is added to an older database", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dndapp-qa-path-'));
  try {
    const file = path.join(dir, 'db.sqlite');
    const db = openDb(file);
    db.exec('ALTER TABLE qa_log DROP COLUMN path');
    db.close();
    const again = openDb(file);
    assert.ok(again.prepare('PRAGMA table_info(qa_log)').all().some((c) => c.name === 'path'));
    again.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Ask: a quick question doesn't wait while the books are still being read after a restart; a full one does", async () => {
  const llm = createFakeLLM({ qaScript: [[{ answer: 'a' }], [{ answer: 'b' }]] });
  const t = await setup({ llm });
  try {
    let finish;
    const slow = new Promise((resolve) => (finish = resolve));
    const shelf = [{ title: "Player's Handbook (2024)", year: 2024, range: '1-300' }];
    let done = false;
    const books = { load: () => slow.then(() => (done = true)), loading: () => !done, status: () => ({ books: done ? shelf : [] }), search: async () => [] };
    const qa = createQA({ ...t, books, llm });
    const quick = await qa.ask({ campaignId: t.campaign.id, userId: t.sam.id, question: KENNY });
    assert.equal(quick.timing.books, 'still loading: answered without them');
    assert.ok(!qaCalls(llm)[0].tools.includes('search_books'));
    const full = qa.ask({ campaignId: t.campaign.id, userId: t.sam.id, question: 'Who is the innkeeper?' });
    finish();
    assert.equal((await full).timing.books, undefined);
    assert.match(qaCalls(llm)[1].system, /<books [^>]*>\n- Player's Handbook \(2024\)/);
  } finally {
    await t.cleanup();
  }
});
