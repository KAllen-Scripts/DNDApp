/**
 * Ask picks its model (owner, 2026-10-28: "could we quickly decide if it's
 * stored in the data we have, or needs looking up, then assign a fast model if
 * we have it, or more intelligent model if we don't?"): general lookups and
 * questions the records already answer go to the faster model, everything else
 * to the main one, decided without the AI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM, SAMPLE } from './helpers.js';
import { routeQuestion, pickModel } from '../src/qa/route.js';

const KENNY = "What's that dnd item that is a bag you can pull summons out of?";
const FAST = 'claude-sonnet-5-5';

const done = async (t, question, extra = {}) => {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/ask`, { body: { question, ...extra }, as: t.sam.token });
  const last = res.body.trim().split('\n\n').at(-1).split('\n');
  assert.equal(last[0], 'event: done', res.body);
  return JSON.parse(last[1].slice(6));
};
const qaCalls = (llm) => llm.calls.filter((c) => c.purpose === 'qa');

test('Ask picks the fast model for general lookups and for what the records found already cover', () => {
  const pick = (q, opts = {}) => pickModel(q, routeQuestion(q, opts), { fast: FAST, ...opts }).model;
  assert.equal(pick(KENNY), 'fast');
  assert.equal(pick('What does Brother Hal want?', { names: ['Brother Hal'], found: ['Brother Hal'] }), 'fast');
  // Named, but the search didn't bring its record: it needs looking up.
  assert.equal(pick('What does Brother Hal want?', { names: ['Brother Hal'], found: ['Story so far'] }), 'main');
  // Nothing named: it needs digging, whatever the search turned up.
  assert.equal(pick('What happened at the bridge?', { found: ['Brother Hal'] }), 'main');
  // "Look it up properly", or no fast model set: always the main one.
  assert.equal(pick(KENNY, { mode: 'thorough' }), 'main');
  assert.equal(pickModel(KENNY, routeQuestion(KENNY), { fast: null }).model, 'main');
  // Names too short to mean anything don't count.
  assert.equal(pick('What does Bo want with the ox?', { names: ['Bo'], found: ['Bo'] }), 'main');
});

test('Ask runs on the fast model when it picks it, and on the main one for "Look it up properly" and for digging', async () => {
  const llm = createFakeLLM({ qaScript: [[{ answer: 'Bag of Tricks.' }], [{ answer: 'Hal.' }], [{ answer: 'Hal, properly.' }], [{ answer: 'The cult.' }]] });
  const t = await setup({ llm });
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
    await t.jobs.idle();

    const quick = await done(t, KENNY);
    assert.deepEqual([quick.path, quick.fast], ['quick', true]);
    assert.equal(qaCalls(llm)[0].model, FAST);

    // The fake archivist recorded Brother Hal: the full way, but the records have it.
    const hal = await done(t, 'What does Brother Hal want?');
    assert.deepEqual([hal.path, hal.fast], ['full', true]);
    assert.equal(qaCalls(llm)[1].model, FAST);
    assert.match(qaCalls(llm)[1].system, /<archivist_guide>/);

    const again = await done(t, 'What does Brother Hal want?', { mode: 'thorough', conversationId: hal.conversationId });
    assert.deepEqual([again.path, again.fast], ['full', false]);
    assert.equal(qaCalls(llm)[2].model, undefined, "the task's own model");

    const dig = await done(t, 'Who has been taking travellers?');
    assert.equal(dig.fast, false);
    assert.equal(qaCalls(llm)[3].model, undefined);
  } finally {
    await t.cleanup();
  }
});

test('Ask: MODEL_QA_FAST=off keeps every answer on the main model', async () => {
  const llm = createFakeLLM({ qaScript: [[{ answer: 'Bag of Tricks.' }]] });
  const t = await setup({ llm, config: { qa: { fastModel: null } } });
  try {
    assert.equal((await done(t, KENNY)).fast, false);
    assert.equal(qaCalls(llm)[0].model, undefined);
  } finally {
    await t.cleanup();
  }
});
