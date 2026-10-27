/**
 * How we know it (wiki space stage 3b): sections and facts keep the transcript
 * citations they came from; approving the AI's change copies them from the
 * records; the evidence route shows the lines, and only from sessions a player
 * was at.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM, SAMPLE, SAMPLE_2 } from './helpers.js';
import { normalizeSources, sourceLabel } from '@dndapp/shared/citations.js';

const upload = async (t, n, transcript, played_on) => {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: n, played_on, transcript } });
  assert.equal(res.statusCode, 201, res.body);
  await t.jobs.idle();
};

test('wiki sources: only transcript citations, in one spelling, with a label', () => {
  assert.deepEqual(normalizeSources(['S12 01:02:03', 'note S12 Sam', 'S12  01:02:03', 'S3', 'S4 1:00:00–1:00:10', 'handout X']), ['S12 01:02:03', 'S3', 'S4 1:00:00-1:00:10']);
  assert.equal(sourceLabel('S12 01:02:03-01:04:10'), 'From session 12, 1:02:03');
  assert.equal(sourceLabel('S3'), 'From session 3');
});

test('wiki sources: kept through edits, history and restore; approving copies them from the records; evidence follows attendance', async () => {
  let changes = [];
  const llm = createFakeLLM({ wiki: () => ({ changes }) });
  const t = await setup({ llm });
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    await upload(t, 1, SAMPLE, '2026-10-01');
    await upload(t, 2, SAMPLE_2, '2026-10-08');

    // The DM's own page with sources on a section and a fact.
    let page = (await t.request('POST', base, { body: {
      title: 'The mill', available: 'all',
      sections: [{ heading: '', text: 'Locked.', available: 'all', sources: ['S2 00:00:05', 'note S2 Sam', 'S1'] }],
      facts: [{ label: 'Where', value: 'North of Brindle', available: 'all', sources: ['S1 00:01:30'] }],
    } })).json().page;
    assert.deepEqual(page.sections[0].sources, ['S2 00:00:05', 'S1']);
    assert.deepEqual(page.facts[0].sources, ['S1 00:01:30']);
    page = (await t.request('PUT', `${base}/${page.id}`, { body: { version: page.version, title: 'The old mill', sections: page.sections, facts: page.facts } })).json().page;
    assert.deepEqual(page.sections[0].sources, ['S2 00:00:05', 'S1']);
    const first = (await t.request('GET', `${base}/${page.id}/history`)).json().versions.at(-1);
    const back = (await t.request('POST', `${base}/${page.id}/restore`, { body: { version: first.version } })).json().page;
    assert.equal(back.title, 'The mill');
    assert.deepEqual(back.facts[0].sources, ['S1 00:01:30']);

    // Evidence: the DM gets both sessions; Lyra (Alex) wasn't at session 2.
    const q = '?s=S2%2000:00:05&s=S1%2000:01:30&s=S1';
    const dm = (await t.request('GET', `${base}/evidence${q}`)).json().evidence;
    assert.deepEqual(dm.map((e) => e.source), ['S2 00:00:05', 'S1 00:01:30', 'S1']);
    assert.match(dm[0].excerpt, /old mill alone/);
    const alex = (await t.request('GET', `${base}/evidence${q}&as=${t.alex.id}`)).json().evidence;
    assert.deepEqual(alex.map((e) => e.source), ['S1 00:01:30', 'S1']);
    // A player gets their own (stage 6a), whatever ?as= says.
    assert.deepEqual((await t.request('GET', `${base}/evidence${q}&as=${t.sam.id}`, { as: t.alex.token })).json().evidence, alex);

    // The AI's change: approving it copies the records' citations (their sources, then their text).
    const { id: rec } = await t.kb.create(cid, 'test', { kind: 'npc', title: 'Brother Hall', body: 'Innkeeper of Brindle [S1 00:00:40].', sources: ['S1 00:00:20', 'note S1 Sam'] });
    changes = [{ action: 'new_page', page_id: null, section_id: null, section: null, players: [], sources: [], reason: 'New.', new_page: { title: 'Brother Hall', kind: 'npc', aliases: [], parent_title: null, sections: [{ heading: '', text: 'The innkeeper.', sources: [rec] }] } }];
    await t.wikiAI.chronicle(cid);
    const [proposal] = (await t.request('GET', `${base}/proposals`)).json().proposals;
    const hall = (await t.request('POST', `${base}/proposals/${proposal.id}/approve`, { body: {} })).json().page;
    assert.deepEqual(hall.sections[0].sources, ['S1 00:00:20', 'S1 00:00:40']);
  } finally {
    await t.cleanup();
  }
});
