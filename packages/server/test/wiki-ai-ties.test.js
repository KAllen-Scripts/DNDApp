/**
 * The AI proposes relationships (wiki space stage 3e): a tie as a fact, on an
 * existing page or a new one, available only to the players who know it;
 * approving keeps the records' citations and the DM's canon; a rejected tie
 * isn't proposed again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM } from './helpers.js';

const change = (c) => ({ page_id: null, section_id: null, new_page: null, section: null, fact: null, players: [], sources: [], reason: 'A tie.', ...c });

test('wiki AI ties: audience, approve with edits, canon kept, reject not repeated', async () => {
  let changes = [];
  const llm = createFakeLLM({ wiki: () => ({ changes }) });
  const t = await setup({ llm });
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  const run = async (list) => {
    changes = list;
    await t.kb.create(cid, 'test', { kind: 'note', title: `News ${Math.random()}`, body: 'Something new for the AI to read.' }); // the AI reads only what changed
    await t.wikiAI.chronicle(cid);
    return (await t.request('GET', `${base}/proposals`)).json().proposals;
  };
  try {
    const make = async (title, more = {}) => (await t.request('POST', base, { body: { title, available: 'all', sections: [{ heading: '', text: 'Someone.', available: 'all' }], ...more } })).json().page;
    const thorin = await make('Thorin', { facts: [{ label: 'Ally', value: '[[Mira]]', available: 'all', canon: 'false', truth: 'She spies on him.' }] });
    await make('Vex');
    await make('Mira');
    const known = await t.kb.create(cid, 'test', { kind: 'npc', title: 'Vex hates Thorin', body: 'Vex swore revenge [S1 00:00:20].', known_by: [t.sam.id] });
    const all = await t.kb.create(cid, 'test', { kind: 'npc', title: 'Mira is Thorin\'s ally', body: 'Everyone saw it.', sources: ['S1 00:01:00'] });

    // A new tie only Thorin's player knows: only theirs.
    let [p] = await run([change({ action: 'set_fact', page_id: thorin.id, fact: { label: 'Rival', value: '[[Vex]]', tone: null, canon: 'rumour', sources: [known.id] } })]);
    assert.equal(p.action, 'set_fact');
    assert.deepEqual(p.fact.available, [t.sam.id]);
    assert.equal(p.fact.canon, 'rumour');
    let page = (await t.request('POST', `${base}/proposals/${p.id}/approve`, { body: { fact: { label: 'Sworn enemy', tone: 'hostile' } } })).json().page;
    const rival = page.facts.find((f) => f.label === 'Sworn enemy');
    assert.deepEqual(rival, { label: 'Sworn enemy', value: '[[Vex]]', available: [t.sam.id], canon: 'rumour', sources: ['S1 00:00:20'], tone: 'hostile' }, 'edited, so the DM\'s (no by)');
    const sam = (await t.request('GET', `${base}/web?around=${thorin.id}&as=${t.alex.id}`)).json();
    assert.ok(!sam.lines.some((l) => l.labels.includes('Sworn enemy')), 'Lyra doesn\'t know it');

    // Replacing an existing tie keeps the DM's canon (false, with the truth) and adds the records' citations.
    [p] = await run([change({ action: 'set_fact', page_id: thorin.id, fact: { label: 'Ally', value: '[[Mira]], since the fire', tone: 'friendly', canon: 'true', sources: [all.id] } })]);
    page = (await t.request('POST', `${base}/proposals/${p.id}/approve`, { body: {} })).json().page;
    const ally = page.facts.find((f) => f.label === 'Ally');
    assert.equal(ally.canon, 'false');
    assert.equal(ally.truth, 'She spies on him.');
    assert.deepEqual(ally.sources, ['S1 00:01:00']);
    assert.equal(ally.by, 'ai');
    // Saved by the DM unchanged, it stays the AI's; the Web draws it solid.
    page = (await t.request('PUT', `${base}/${thorin.id}`, { body: { version: page.version, facts: page.facts.map(({ by, ...f }) => f) } })).json().page;
    assert.equal(page.facts.find((f) => f.label === 'Ally').by, 'ai');
    assert.equal((await t.request('GET', `${base}/web?around=${thorin.id}`)).json().lines.find((l) => l.labels.includes('Ally')).by, 'ai');

    // A rejected tie isn't proposed again; a new page can carry ties.
    [p] = await run([change({ action: 'set_fact', page_id: thorin.id, fact: { label: 'Owes money to', value: '[[Vex]]', tone: null, canon: 'true', sources: [all.id] } })]);
    await t.request('POST', `${base}/proposals/${p.id}/reject`, { body: {} });
    assert.deepEqual(await run([change({ action: 'set_fact', page_id: thorin.id, fact: { label: 'Owes money to', value: '[[Vex]]', tone: null, canon: 'true', sources: [all.id] } })]), []);
    [p] = await run([change({ action: 'new_page', new_page: { title: 'Hilda', kind: 'npc', aliases: [], parent_title: null, sections: [{ heading: '', text: 'Thorin\'s mother.', sources: [all.id] }], facts: [{ label: 'Child', value: '[[Thorin]]', tone: null, canon: 'true', sources: [all.id] }] } })]);
    const hilda = (await t.request('POST', `${base}/proposals/${p.id}/approve`, { body: {} })).json().page;
    assert.deepEqual(hilda.facts.map((f) => [f.label, f.value, f.available, f.by]), [['Child', '[[Thorin]]', 'all', 'ai']]);
  } finally {
    await t.cleanup();
  }
});
