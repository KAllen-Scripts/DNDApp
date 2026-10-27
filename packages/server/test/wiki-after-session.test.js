/**
 * After the session (wiki space stage 7c): the AI checks the open prep page's clues against the session's records.
 * A clue that came out is revealed to those who found it (only players the records say know it) and gets its Found
 * fact; the prep page is marked Played; the next prep page carries the clues not found. All of it waits for the DM.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM, SAMPLE } from './helpers.js';

test('wiki after the session: clues found with the right audience, Played, and the carry-over', async () => {
  let t;
  let ledger;
  let map;
  let record;
  const llm = createFakeLLM({
    wiki: ({ purpose, prompt }) => {
      if (purpose !== 'wiki:prep') return { changes: [] };
      assert.match(prompt, /<prep_page>[\s\S]*Plan for session 1/);
      assert.match(prompt, new RegExp(`<page id="${ledger.id}"`), 'the clue pages are shown whole');
      assert.match(prompt, new RegExp(`#${record.id} `), 'with the session\'s records');
      return {
        clues: [
          // Alex wasn't there: only Sam, whom the record says knows it.
          { page_id: ledger.id, found: true, found_by: [t.sam.id, t.alex.id], sources: [record.id], reason: 'Thorin read it.' },
          { page_id: map.id, found: false, found_by: [], sources: [], reason: 'Nobody looked.' },
        ],
        strong_start: 'They wake to smoke over the mill.',
        scenes_left: 'The docks at night.',
        reason: 'They got halfway.',
      };
    },
  });
  t = await setup({ llm });
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    const make = async (body) => (await t.request('POST', base, { body })).json().page;
    ledger = await make({ title: 'The Bloody Ledger', kind: 'clue', available: 'all', sections: [{ heading: '', text: 'A ledger with the Baron\'s seal.', available: 'dm' }] });
    map = await make({ title: 'The Torn Map', kind: 'clue', available: 'all', sections: [{ heading: '', text: 'Half a map of the sewers.', available: 'dm' }] });
    const plan = await make({ title: 'Plan for session 1', kind: 'session plan', available: 'dm', sections: [
      { heading: 'Clues', text: '[[!The Bloody Ledger]]\n\n[[!The Torn Map]]', available: 'all' },
    ], facts: [{ label: 'Session', value: '1' }, { label: 'Arc', value: '[[The Pale Hand]]' }, { label: 'Played', value: '' }] });
    record = await t.kb.create(cid, 'test', { kind: 'clue', title: 'Thorin read the ledger', body: 'Thorin found the Baron\'s ledger in the loft.', known_by: [t.sam.id] });

    const res = await t.request('POST', `/campaigns/${cid}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
    assert.equal(res.statusCode, 201, res.body);
    await t.jobs.idle();
    assert.ok(llm.calls.some((c) => c.purpose === 'wiki:prep'), 'the clues were checked after the session');

    const { proposals } = (await t.request('GET', `${base}/proposals`)).json();
    const reveal = proposals.find((p) => p.action === 'reveal');
    assert.equal(reveal.page_id, ledger.id);
    assert.deepEqual(reveal.players, [t.sam.id], 'only who the records say found it');
    const foundFact = proposals.find((p) => p.action === 'set_fact' && p.page_id === ledger.id);
    assert.equal(foundFact.fact.value, 'session 1: Thorin');
    assert.equal(proposals.find((p) => p.action === 'set_fact' && p.page_id === plan.id).fact.label, 'Played');
    assert.ok(!proposals.some((p) => p.page_id === map.id), 'nothing for a clue not found');
    const next = proposals.find((p) => p.action === 'new_page');
    assert.equal(next.title, 'Session 2 plan');
    assert.equal(next.page_available, 'dm');
    assert.deepEqual(next.sections.map((s) => s.heading), ['Strong start', 'Scenes', 'Clues']);
    assert.equal(next.sections[2].text, '[[!The Torn Map]]', 'the clue not found carries over');
    assert.ok(next.sections.every((s) => s.canon === 'planned'));
    assert.deepEqual(next.facts.map((f) => `${f.label}=${f.value}`), ['Session=2', 'Arc=[[The Pale Hand]]', 'Played=']);

    // Nothing changed before the DM approves; then the clue reaches Sam, and the plan shows what became of each.
    assert.ok(!(await t.request('GET', `${base}/${ledger.id}`, { as: t.sam.token })).body.includes('Baron'));
    assert.equal((await t.request('POST', `${base}/proposals/approve-all`, { body: {} })).json().failed.length, 0);
    assert.match((await t.request('GET', `${base}/${ledger.id}`, { as: t.sam.token })).json().page.sections[0].text, /Baron's seal/);
    assert.equal((await t.request('GET', `${base}/${ledger.id}`, { as: t.alex.token })).statusCode, 404);
    const embeds = (await t.request('GET', `${base}/${plan.id}`)).json().embeds;
    assert.deepEqual([embeds['the bloody ledger'].status, embeds['the bloody ledger'].found], ['found', 'session 1: Thorin']);
    assert.deepEqual([embeds['the torn map'].status, embeds['the torn map'].carried_to], ['carried', 'Session 2 plan']);
    assert.equal((await t.request('GET', `${base}/home`)).json().prep.title, 'Session 2 plan', 'the next plan is the open one');
  } finally {
    await t.cleanup();
  }
});
