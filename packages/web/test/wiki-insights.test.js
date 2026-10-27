/**
 * A Home that thinks on the page (wiki space stage 8d): the DM's Home shows what the AI noticed; Dismiss takes one
 * away for good; a contradiction's fix goes to Waiting.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, createFakeLLM, SAMPLE } from './helpers.js';

test('wiki insights: on the Home, dismissed, and a fix proposed', async () => {
  let mira;
  await withPage({
    setup: { llm: createFakeLLM({ wiki: ({ purpose }) => (purpose !== 'wiki:insights' ? { changes: [] } : {
      loose_threads: [{ kind: 'unseen', text: 'Nobody has seen Mira for three sessions.', page_id: mira.id }],
      previously: 'Last time, the party reached Brindle at dusk.',
      contradictions: [{ page_id: mira.id, section_id: mira.sections[0].id, text: 'The records say Mira is a priest.', fix: 'A priest at the docks.', sources: [] }],
    }) }) },
    before: async (t) => {
      mira = (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { title: 'Mira', kind: 'npc', available: 'all', sections: [{ heading: '', text: 'A fence at the docks.', available: 'all' }] } })).json().page;
      await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
      await t.jobs.idle();
      return { dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/home' }),
  }, async (page, t) => {
    await page.waitFor(() => page.$$('#wiki-main .wiki-insight').length === 3);
    assert.match(page.text('#wiki-main .insight-previously'), /Previously on….*reached Brindle/);

    page.click(page.$$('#wiki-main .insight-loose_thread button').find((b) => b.textContent === 'Dismiss'));
    await page.waitFor(() => page.$$('#wiki-main .wiki-insight').length === 2);

    page.click(page.$$('#wiki-main .insight-contradiction button').find((b) => b.textContent === 'Propose the fix'));
    await page.waitFor(() => page.text('#wiki-status').includes('waits for you under Waiting'));
    const waiting = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/proposals`)).json().proposals;
    assert.ok(waiting.some((p) => p.action === 'update_section' && p.sections[0].text === 'A priest at the docks.'));
  });
});
