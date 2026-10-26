/**
 * The AI's side of the DM's wiki: after the archivist changes the knowledge
 * base, the AI proposes wiki changes, and nothing reaches a page until the DM
 * approves. Who each proposed part is available to comes from the records'
 * known_by, never from the AI.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setup, createFakeLLM, fakeEmbedder, SAMPLE, SAMPLE_2 } from './helpers.js';
import { createContext } from '../src/context.js';

const upload = async (t, n, transcript, played_on) => {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: n, played_on, transcript } });
  assert.equal(res.statusCode, 201, res.body);
  await t.jobs.idle();
};

/** The id of the record with this title, as the AI's prompt shows it ("#12 Brother Hal"). */
const idIn = (prompt, title) => Number(new RegExp(`#(\\d+) ${title}`).exec(prompt)?.[1]);

const change = (c) => ({ page_id: null, section_id: null, new_page: null, section: null, players: [], sources: [], reason: 'Because.', ...c });

test('wiki AI: after each session it proposes changes; each part reaches only the players who know it, and only once the DM approves', async () => {
  let ledgerPage;
  let hal;
  const llm = createFakeLLM({
    wiki: ({ purpose, prompt }) => {
      if (purpose === 'wiki:session 1') {
        return { changes: [change({ action: 'new_page', new_page: { title: 'Brother Hal', kind: 'npc', aliases: ['Brother Hall'], parent_title: null, sections: [{ heading: 'Who he is', text: 'The innkeeper in Brindle.', sources: [idIn(prompt, 'Brother Hal')] }] } })] };
      }
      assert.match(prompt, new RegExp(`${hal.id} \\| Brother Hal \\| npc`), 'the AI sees every page by title');
      const debt = idIn(prompt, 'The cult owes the Baron 200 gold');
      assert.match(prompt, new RegExp(`<page id="${ledgerPage.id}"[^>]*available="DM only"[\\s\\S]*<section id="${ledgerPage.sections[0].id}"`), 'a page the records are about is shown whole, with who can see it');
      return {
        changes: [
          // Mixes what everyone knows with what only Thorin knows: only Thorin.
          change({ action: 'update_section', page_id: hal.id, section_id: hal.sections[0].id, section: { heading: 'Who he is', text: 'The innkeeper in Brindle, who owes the Baron.', sources: [debt, idIn(prompt, 'Brother Hal') || 0] } }),
          change({ action: 'new_page', new_page: { title: "The Baron's debt", kind: 'quest', aliases: [], parent_title: 'Brother Hal', sections: [{ heading: '', text: 'The cult owes the Baron 200 gold.', sources: [debt] }] } }),
          // Lyra wasn't there, so only Thorin is offered.
          change({ action: 'reveal', page_id: ledgerPage.id, section_id: ledgerPage.sections[0].id, players: [t.sam.id, t.alex.id], sources: [debt] }),
          change({ action: 'update_section', page_id: 'ffffffffff', section_id: 'abcdef', section: { heading: 'x', text: 'y', sources: [] } }),
        ],
      };
    },
  });
  const t = await setup({ llm });
  try {
    const base = `/campaigns/${t.campaign.id}/wiki`;
    await upload(t, 1, SAMPLE, '2026-10-01');
    assert.ok(llm.calls.some((c) => c.purpose === 'wiki:session 1' && c.task === 'wiki'), 'the AI read the records after the session');

    let { proposals } = (await t.request('GET', `${base}/proposals`)).json();
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].title, 'Brother Hal');
    assert.equal(proposals[0].page_available, 'all', 'everyone knows the innkeeper');
    assert.deepEqual((await t.request('GET', base)).json().pages, [], 'nothing reaches the wiki before the DM approves');

    // Players never see proposals, the AI's jobs, or a way to run it.
    for (const [method, url] of [['GET', `${base}/proposals`], ['POST', `${base}/proposals/run`], ['POST', `${base}/proposals/${proposals[0].id}/approve`], ['POST', `${base}/proposals/approve-all`]]) {
      assert.equal((await t.request(method, url, { as: t.sam.token, body: {} })).statusCode, 403, url);
    }
    const samJobs = (await t.request('GET', `/campaigns/${t.campaign.id}/jobs`, { as: t.sam.token })).json();
    assert.ok(!samJobs.some((j) => j.type === 'wiki'));
    assert.ok((await t.request('GET', `/campaigns/${t.campaign.id}/jobs`)).json().some((j) => j.type === 'wiki'));

    hal = (await t.request('POST', `${base}/proposals/${proposals[0].id}/approve`, { body: {} })).json().page;
    assert.equal(hal.sections[0].by, 'ai');
    assert.deepEqual(hal.aliases, ['Brother Hall']);
    ledgerPage = (await t.request('POST', base, { body: { title: "The cult's ledger", available: 'dm', sections: [{ heading: 'What it says', text: 'The cult owes the Baron.', available: 'all' }, { heading: 'Plans', text: 'The DM\'s plans.', available: 'all' }] } })).json().page;

    await upload(t, 2, SAMPLE_2, '2026-10-08');
    proposals = (await t.request('GET', `${base}/proposals`)).json().proposals;
    assert.equal(proposals.length, 3, 'the change to a page that doesn\'t exist is dropped');
    const [update, debtPage, reveal] = proposals;
    assert.equal(update.action, 'update_section');
    assert.deepEqual(update.sections[0].available, [t.sam.id], 'a section with something only Thorin knows is only Thorin\'s');
    assert.equal(update.current.text, 'The innkeeper in Brindle.', 'the DM sees what it replaces');
    assert.deepEqual(debtPage.page_available, [t.sam.id]);
    assert.equal(debtPage.parent, hal.id);
    assert.deepEqual(reveal.players, [t.sam.id], 'a reveal reaches only players who know it');

    // The reveal widens the section and the page, and nothing else on it.
    await t.request('POST', `${base}/proposals/${reveal.id}/approve`, { body: {} });
    const asSam = (await t.request('GET', `${base}/${ledgerPage.id}?as=${t.sam.id}`)).json().page;
    assert.deepEqual(asSam.sections.map((s) => s.heading), ['What it says']);
    assert.equal((await t.request('GET', `${base}/${ledgerPage.id}?as=${t.alex.id}`)).json().page, null);

    // Edited before approving: the section is the DM's.
    const edited = (await t.request('POST', `${base}/proposals/${update.id}/approve`, { body: { sections: [{ text: 'The innkeeper. He owes the Baron.', available: [t.sam.id] }] } })).json().page;
    assert.equal(edited.sections[0].by, 'dm');
    assert.equal(edited.sections[0].text, 'The innkeeper. He owes the Baron.');

    const res = (await t.request('POST', `${base}/proposals/approve-all`, { body: {} })).json();
    assert.equal(res.approved, 1);
    assert.equal(res.proposals, 0);
    assert.equal((await t.request('POST', `${base}/proposals/${reveal.id}/approve`, { body: {} })).statusCode, 400, 'already dealt with');
  } finally {
    await t.cleanup();
  }
});

// Proposals made in the same millisecond came back in a random order (sorted by their random ids), so the
// DM's list shuffled and the test above failed now and then under load.
test('regression: proposals made in the same millisecond keep the order the AI gave them', async () => {
  const titles = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
  const llm = createFakeLLM({
    wiki: ({ prompt }) => ({ changes: titles.map((title) => change({ action: 'new_page', new_page: { title, kind: 'place', aliases: [], parent_title: null, sections: [{ heading: '', text: `${title}.`, sources: [idIn(prompt, 'The mill')] }] } })) }),
  });
  const t = await setup({ llm });
  try {
    const cid = t.campaign.id;
    await t.kb.create(cid, 'test', { kind: 'place', title: 'The mill', body: 'North of Brindle.' });
    // Every proposal gets the same time, as when the server is fast.
    mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-21T12:00:00Z') });
    try {
      assert.equal((await t.request('POST', `/campaigns/${cid}/wiki/proposals/run`, { body: {} })).statusCode, 200);
      await t.jobs.idle();
    } finally {
      mock.timers.reset();
    }
    const { proposals } = (await t.request('GET', `/campaigns/${cid}/wiki/proposals`)).json();
    assert.deepEqual(proposals.map((p) => p.title), titles);
  } finally {
    await t.cleanup();
  }
});

test('wiki AI: a newer proposal replaces a waiting one, a rejected one isn\'t made again, a rebuild proposes nothing, and the archive keeps them', async () => {
  let text = 'First draft.';
  const llm = createFakeLLM({
    wiki: ({ prompt }) => ({ changes: [change({ action: 'new_page', new_page: { title: 'The Mill', kind: 'place', aliases: [], parent_title: null, sections: [{ heading: '', text, sources: [idIn(prompt, 'The mill')] }] } })] }),
  });
  const t = await setup({ llm });
  try {
    const cid = t.campaign.id;
    const base = `/campaigns/${cid}/wiki`;
    const run = async () => {
      assert.equal((await t.request('POST', `${base}/proposals/run`, { body: {} })).statusCode, 200);
      await t.jobs.idle();
      return (await t.request('GET', `${base}/proposals`)).json().proposals;
    };
    const mill = await t.kb.create(cid, 'test', { kind: 'place', title: 'The mill', body: 'North of Brindle.' });
    assert.equal((await run()).length, 1);

    // Nothing new in the records: no AI call.
    const before = llm.calls.length;
    await run();
    assert.equal(llm.calls.length, before);

    text = 'Second draft.';
    await t.kb.update(cid, 'test', mill.id, { body: 'North of Brindle, burned.' });
    let proposals = await run();
    assert.deepEqual(proposals.map((p) => p.sections[0].text), ['Second draft.']);

    await t.request('POST', `${base}/proposals/${proposals[0].id}/reject`, { body: {} });
    await t.kb.update(cid, 'test', mill.id, { body: 'North of Brindle, rebuilt.' });
    assert.deepEqual(await run(), [], 'the AI is told, and the same proposal isn\'t made again');
    assert.match(llm.calls.at(-1).prompt, /rejected_by_the_dm[\s\S]*The Mill/);

    // A rebuild replays everything, but that isn't news for the wiki.
    await t.request('POST', `/campaigns/${cid}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
    await t.jobs.idle();
    const wikiCalls = llm.calls.filter((c) => c.task === 'wiki').length;
    t.jobs.enqueueRebuild(cid);
    await t.jobs.idle();
    assert.equal(llm.calls.filter((c) => c.task === 'wiki').length, wikiCalls);

    // A fresh database over the same archive has the same proposals.
    const ctx = await createContext({ config: t.config, paths: { archive: t.archive.root, db: path.join(t.dir, 'fresh.sqlite'), models: path.join(t.dir, 'models') }, llm: createFakeLLM(), embedder: fakeEmbedder, log: { error() {} } });
    try {
      const fresh = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      const statuses = ctx.db.prepare('SELECT status FROM wiki_proposals WHERE campaign_id = ? ORDER BY created_at').all(fresh).map((r) => r.status);
      assert.deepEqual(statuses, t.db.prepare('SELECT status FROM wiki_proposals WHERE campaign_id = ? ORDER BY created_at').all(cid).map((r) => r.status));
      assert.ok(statuses.includes('replaced') && statuses.includes('rejected'));
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }
  } finally {
    await t.cleanup();
  }
});

test('wiki AI: the DM changing an AI section in the editor makes it the DM\'s; saving it unchanged doesn\'t', async () => {
  const t = await setup();
  try {
    const base = `/campaigns/${t.campaign.id}/wiki`;
    const page = await t.wiki.create(t.campaign.id, { title: 'Brindle', sections: [{ heading: 'Overview', text: 'A village.', by: 'ai' }, { heading: 'Inn', text: 'The Hollow Mug.', by: 'ai' }] }, { by: t.dm.id });
    const send = page.sections.map(({ id, heading, text, available }) => ({ id, heading, text, available }));
    send[1].text = 'The Hollow Mug, run by Brother Hal.';
    const saved = (await t.request('PUT', `${base}/${page.id}`, { body: { version: 1, sections: send } })).json().page;
    assert.deepEqual(saved.sections.map((s) => s.by), ['ai', 'dm']);
  } finally {
    await t.cleanup();
  }
});

test('regression: proposals made in one run are listed in the order the AI gave them (they shared a millisecond and were sorted by their random ids)', async () => {
  const titles = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
  const llm = createFakeLLM({
    wiki: ({ prompt }) => ({ changes: titles.map((title) => change({ action: 'new_page', new_page: { title, kind: 'lore', aliases: [], parent_title: null, sections: [{ heading: '', text: `${title}.`, sources: [idIn(prompt, 'The mill')] }] } })) }),
  });
  const t = await setup({ llm });
  try {
    const cid = t.campaign.id;
    await t.kb.create(cid, 'test', { kind: 'place', title: 'The mill', body: 'North of Brindle.' });
    assert.equal((await t.request('POST', `/campaigns/${cid}/wiki/proposals/run`, { body: {} })).statusCode, 200);
    await t.jobs.idle();
    const { proposals } = (await t.request('GET', `/campaigns/${cid}/wiki/proposals`)).json();
    assert.deepEqual(proposals.map((p) => p.title), titles);
  } finally {
    await t.cleanup();
  }
});
