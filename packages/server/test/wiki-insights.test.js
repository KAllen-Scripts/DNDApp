/**
 * A Home that thinks (wiki space stage 8d): after a session the AI's insights (loose threads, Previously on…,
 * contradictions) show on the DM's Home; one dismissed isn't made again; a contradiction's fix waits under Waiting;
 * players never get them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM, SAMPLE, SAMPLE_2 } from './helpers.js';

test('wiki insights: shown, dismissed, not repeated, and a fix proposed', async () => {
  let mira;
  let asked = [];
  const llm = createFakeLLM({
    wiki: ({ purpose, prompt }) => {
      if (purpose !== 'wiki:insights') return { changes: [] };
      asked.push(prompt);
      return {
        loose_threads: [{ kind: 'rumour', text: 'Nobody followed the rumour of the haunted mill.', page_id: mira.id }],
        previously: `Last time (${asked.length}): the party reached Millbrook.`,
        contradictions: [{ page_id: mira.id, section_id: mira.sections[0].id, text: 'The page says Mira is a fence; the records say she\'s a priest.', fix: 'A priest at the docks.', sources: [] }],
      };
    },
  });
  const t = await setup({ llm });
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    mira = (await t.request('POST', base, { body: { title: 'Mira', kind: 'npc', available: 'all', sections: [{ heading: '', text: 'A fence at the docks.', available: 'all' }] } })).json().page;
    await t.request('POST', `/campaigns/${cid}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
    await t.jobs.idle();
    assert.equal(asked.length, 1, 'one call after the session');
    assert.match(asked[0], new RegExp(`${mira.id} \\| Mira`));

    const home = (await t.request('GET', `${base}/home`)).json();
    assert.deepEqual(home.insights.map((x) => x.type).sort(), ['contradiction', 'loose_thread', 'previously']);
    assert.equal(home.insights.find((x) => x.type === 'contradiction').can_fix, true);
    // Players never hear of them.
    assert.equal((await t.request('GET', `${base}/home`, { as: t.sam.token })).json().insights, undefined);
    assert.equal((await t.request('GET', `${base}/insights`, { as: t.sam.token })).statusCode, 403);

    const thread = home.insights.find((x) => x.type === 'loose_thread');
    await t.request('POST', `${base}/insights/${thread.id}/dismiss`, { body: {} });

    // The next session: the same thread and contradiction again, a new recap.
    await t.request('POST', `/campaigns/${cid}/sessions`, { body: { number: 2, played_on: '2026-10-08', transcript: SAMPLE_2 ?? SAMPLE } });
    await t.jobs.idle();
    assert.equal(asked.length, 2);
    assert.match(asked[1], /<noticed_before>[\s\S]*haunted mill/, 'told what it noticed before');
    const now = (await t.request('GET', `${base}/insights`)).json().insights;
    assert.ok(!now.some((x) => x.type === 'loose_thread'), 'dismissed: not made again');
    assert.equal(now.filter((x) => x.type === 'contradiction').length, 1, 'not repeated');
    assert.deepEqual(now.filter((x) => x.type === 'previously').map((x) => x.text), ['Last time (2): the party reached Millbrook.'], 'only the newest recap');

    // The contradiction's fix waits for the DM.
    const contra = now.find((x) => x.type === 'contradiction');
    const fixed = (await t.request('POST', `${base}/insights/${contra.id}/fix`, { body: {} })).json();
    assert.equal(fixed.proposal.action, 'update_section');
    const waiting = (await t.request('GET', `${base}/proposals`)).json().proposals;
    assert.equal(waiting.find((p) => p.id === fixed.proposal.id).sections[0].text, 'A priest at the docks.');
    assert.ok(!fixed.insights.some((x) => x.id === contra.id));
  } finally {
    await t.cleanup();
  }
});
