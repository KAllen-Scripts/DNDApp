/**
 * The AI as a writing partner (wiki space stage 5b): Draft from the records, Expand and Tidy become proposals
 * with the right audiences; Make up gives a planned page only the DM sees; link suggestions (no AI).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM } from './helpers.js';

test('wiki draft: draft, expand, tidy and make up become proposals; audiences from the records', async () => {
  let answer = {};
  const calls = [];
  const llm = createFakeLLM({ wiki: (opts) => { calls.push(opts); return answer; } });
  const t = await setup({ llm });
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  const draft = (body) => t.request('POST', `${base}/draft`, { body });
  const waiting = async () => (await t.request('GET', `${base}/proposals`)).json().proposals;
  try {
    const secret = await t.kb.create(cid, 'test', { kind: 'npc', title: 'Hilda the miller', body: 'Hilda hides a map [S1 00:00:20].', known_by: [t.sam.id] });
    const open = await t.kb.create(cid, 'test', { kind: 'npc', title: 'Hilda runs the mill', body: 'Everyone knows Hilda.', sources: ['S1 00:01:00'] });

    // A new page from the editor, drafted from the records.
    answer = { sections: [{ heading: 'At the table', text: 'Gruff.', sources: [open.id] }, { heading: 'Secrets', text: 'She hides a map.', sources: [secret.id] }], facts: [], when: null, events: [], reason: 'From two records.' };
    let res = await draft({ mode: 'draft', page: { title: 'Hilda', kind: 'npc', sections: [{ heading: 'At the table', prompt: 'Voice and manner' }] } });
    assert.equal(res.json().made, 1, res.body);
    assert.equal(calls.at(-1).task, 'wiki_draft');
    assert.match(calls.at(-1).prompt, /Hilda hides a map/, 'the records found by search');
    assert.match(calls.at(-1).prompt, /At the table \(Voice and manner\)/);
    let [p] = await waiting();
    assert.equal(p.action, 'new_page');
    assert.equal(p.run, 'Draft from the records');
    assert.deepEqual(p.sections.map((s) => s.available), ['all', [t.sam.id]]);
    const hilda = (await t.request('POST', `${base}/proposals/${p.id}/approve`, { body: {} })).json().page;

    // Expand a section: an update, never wider than it was.
    answer = { section: { heading: 'ignored', text: 'Gruff. She hums while she works.', sources: [open.id] }, reason: 'More from the records.' };
    res = await draft({ mode: 'expand', page_id: hilda.id, section_id: hilda.sections[1].id });
    [p] = await waiting();
    assert.equal(p.action, 'update_section');
    assert.equal(p.sections[0].heading, 'Secrets', 'the heading stays');
    assert.deepEqual(p.sections[0].available, [t.sam.id]);
    await t.request('POST', `${base}/proposals/${p.id}/reject`, { body: {} });

    // Tidy: the wording only; it stays available to whoever it was; no records needed.
    answer = { heading: 'At the table', text: 'Gruff and short with strangers.', reason: 'Smoother.' };
    await draft({ mode: 'tidy', page_id: hilda.id, section_id: hilda.sections[0].id });
    [p] = await waiting();
    assert.equal(p.run, 'Tidy');
    assert.equal(p.sections[0].available, 'all');
    let page = (await t.request('POST', `${base}/proposals/${p.id}/approve`, { body: {} })).json().page;
    assert.equal(page.sections[0].text, 'Gruff and short with strangers.');

    // Draft an existing page: a known heading is an update, a new one a new section.
    answer = { sections: [{ heading: 'At the table', text: 'Gruff and short. Runs the mill.', sources: [open.id] }, { heading: 'Family', text: 'A son.', sources: [open.id] }], facts: [{ label: 'Role', value: 'Miller', tone: null, canon: 'true', sources: [open.id] }], when: null, events: [], reason: 'More.' };
    res = await draft({ mode: 'draft', page_id: hilda.id });
    assert.equal(res.json().made, 3);
    assert.deepEqual((await waiting()).map((x) => x.action), ['update_section', 'add_section', 'set_fact']);
    for (const x of await waiting()) await t.request('POST', `${base}/proposals/${x.id}/reject`, { body: {} });

    // Make up: a planned page, only the DM's, with the wiki read first.
    answer = { title: 'The Rusty Nail', kind: 'tavern', aliases: [], sections: [{ heading: '', text: 'A smoky tavern where [[Hilda]] drinks.' }], facts: [{ label: 'Owner', value: 'Brannoc', tone: null }], reason: 'Near the mill.' };
    res = await draft({ mode: 'make_up', what: 'a tavern', notes: 'near the mill' });
    assert.equal(res.json().made, 1);
    assert.match(calls.at(-1).prompt, /<related_pages>[\s\S]*Hilda/, 'it reads related pages first');
    [p] = await waiting();
    assert.equal(p.page_available, 'dm');
    page = (await t.request('POST', `${base}/proposals/${p.id}/approve`, { body: {} })).json().page;
    assert.equal(page.available, 'dm');
    assert.deepEqual(page.sections.map((s) => s.canon), ['planned']);
    assert.deepEqual(page.facts.map((f) => [f.label, f.canon]), [['Owner', 'planned']]);

    assert.equal((await draft({ mode: 'make_up' })).statusCode, 400, 'say what');
    assert.equal((await t.request('POST', `${base}/draft`, { body: { mode: 'make_up', what: 'x' }, as: t.sam.token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('wiki draft: link suggestions for names that match a page', async () => {
  const t = await setup();
  const base = `/campaigns/${t.campaign.id}/wiki`;
  try {
    const make = async (title, text, more = {}) => (await t.request('POST', base, { body: { title, available: 'all', sections: [{ heading: '', text, available: 'all' }], ...more } })).json().page;
    await make('Lord Vex', 'A noble.', { aliases: ['Vex'] });
    await make('Hollow Mill', 'A mill.');
    const page = await make('Hilda', 'Hilda works at the hollow mill. [[Lord Vex]] owns it; Vex is cruel. ![Hollow Mill](picture:aaaaaaaaaa)');
    const { suggestions } = (await t.request('GET', `${base}/${page.id}/links`)).json();
    assert.deepEqual(suggestions.map((s) => [s.name, s.title]), [['hollow mill', 'Hollow Mill']], 'Vex is linked already; the picture\'s caption isn\'t text');
    const other = await make('Brannoc', 'Brannoc fears Vex.');
    assert.deepEqual((await t.request('GET', `${base}/${other.id}/links`)).json().suggestions.map((s) => [s.name, s.title, s.section_id]), [['Vex', 'Lord Vex', other.sections[0].id]]);
  } finally {
    await t.cleanup();
  }
});
