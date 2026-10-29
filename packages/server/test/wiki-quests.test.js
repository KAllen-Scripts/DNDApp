/**
 * The quest board and lists (wiki space stage 8a): quests in columns by Status, grouped by arc; a move saves the
 * Status fact; lists are the DM's (never in the settings players get), and filter per viewer; Make a list keeps only
 * pages that exist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM } from './helpers.js';
import { questColumn } from '../src/wiki/views.js';

test('wiki quests: columns by status, grouped by arc, a move saves the status, a player sees only theirs', async () => {
  assert.equal(questColumn('Under way'), 'active');
  assert.equal(questColumn('Heard in the tavern (rumour)'), 'rumoured');
  assert.equal(questColumn('Completed'), 'done');
  assert.equal(questColumn('On hold'), 'on hold');
  assert.equal(questColumn(''), '');

  const t = await setup();
  const base = `/campaigns/${t.campaign.id}/wiki`;
  try {
    const make = async (body) => (await t.request('POST', base, { body: { available: 'all', sections: [{ heading: '', text: 'Words.', available: 'all' }], ...body } })).json().page;
    const arc = await make({ title: 'The Pale Hand', kind: 'arc', available: 'dm' });
    const ledger = await make({ title: 'Find the ledger', kind: 'quest', parent: arc.id, facts: [{ label: 'Status', value: 'Active' }, { label: 'Given by', value: '[[Mayor Hollis]]' }, { label: 'Reward', value: '50 gp' }] });
    const rats = await make({ title: 'Rats in the cellar', kind: 'job', facts: [{ label: 'Status', value: 'Done' }] });
    const secret = await make({ title: 'The hidden heir', kind: 'quest', available: 'dm', facts: [{ label: 'Status', value: 'On hold' }] });
    await make({ title: 'A bloody glove', kind: 'clue' });
    const plain = await make({ title: 'Lost cat', kind: 'quest' });

    const board = (await t.request('GET', `${base}/quests`)).json();
    assert.deepEqual(board.columns.map((c) => c.key), ['rumoured', 'active', 'done', 'failed', 'on hold', '']);
    const card = (id) => board.quests.find((q) => q.id === id);
    assert.equal(board.quests.length, 4, 'no clues or arcs');
    assert.deepEqual([card(ledger.id).column, card(ledger.id).given_by, card(ledger.id).reward, card(ledger.id).arc], ['active', 'Mayor Hollis', '50 gp', arc.id]);
    assert.equal(card(rats.id).column, 'done');
    assert.equal(card(plain.id).column, '');
    assert.deepEqual(board.arcs.map((a) => a.id), [arc.id]);

    // A player: their quests only, and no arc they can't see; the DM's tools aren't theirs.
    const sams = (await t.request('GET', `${base}/quests`, { as: t.sam.token })).json();
    assert.ok(!sams.quests.some((q) => q.id === secret.id));
    assert.ok(!JSON.stringify(sams).includes('Pale Hand'));
    assert.equal((await t.request('PUT', `${base}/${rats.id}/status`, { body: { status: 'failed' }, as: t.sam.token })).statusCode, 403);

    // A move: the Status fact changes (made where there was none), and the card moves.
    const moved = await t.request('PUT', `${base}/${rats.id}/status`, { body: { status: 'failed' } });
    assert.equal(moved.statusCode, 200);
    await t.request('PUT', `${base}/${plain.id}/status`, { body: { status: 'rumoured' } });
    const again = (await t.request('GET', `${base}/quests`)).json();
    assert.equal(again.quests.find((q) => q.id === rats.id).column, 'failed');
    assert.equal(again.quests.find((q) => q.id === plain.id).status, 'Rumoured');
    const facts = (await t.request('GET', `${base}/${rats.id}`)).json().page.facts;
    assert.deepEqual(facts.filter((f) => f.label === 'Status').map((f) => f.value), ['Failed']);
  } finally {
    await t.cleanup();
  }
});

test('wiki lists: saved by the DM, filtered per viewer, never in the settings; Make a list keeps real pages', async () => {
  let asked = null;
  const t = await setup({ llm: createFakeLLM({ wiki: (opts) => { asked = opts; return { name: 'Hostile NPCs', page_ids: [ids.grim, 'ffffffffff', ids.spy] }; } }) });
  const ids = {};
  const base = `/campaigns/${t.campaign.id}/wiki`;
  try {
    const make = async (body) => (await t.request('POST', base, { body: { available: 'all', sections: [{ heading: '', text: 'Words.', available: 'all' }], ...body } })).json().page;
    ids.grim = (await make({ title: 'Grim', kind: 'npc', tags: ['millbrook'], facts: [{ label: 'Status', value: 'Hostile' }] })).id;
    ids.spy = (await make({ title: 'The spy', kind: 'npc', tags: ['millbrook'], available: 'dm' })).id;
    ids.inn = (await make({ title: 'The Drowned Rat', kind: 'tavern', tags: ['millbrook'] })).id;

    const saved = await t.request('POST', `${base}/lists`, { body: { name: 'Secret: people of Millbrook', filter: { family: 'person', tag: 'Millbrook' } } });
    assert.equal(saved.statusCode, 201);
    const list = saved.json().list;
    await t.request('POST', `${base}/lists`, { body: { name: 'Hostile', filter: { fact: { label: 'status', value: 'hostile' } } } });

    const mine = (await t.request('GET', `${base}/lists`)).json().lists;
    assert.deepEqual(mine.map((l) => l.pages.map((p) => p.title)), [['Grim', 'The spy'], ['Grim']]);
    const asSam = (await t.request('GET', `${base}/lists?as=${t.sam.id}`)).json().lists;
    assert.deepEqual(asSam[0].pages.map((p) => p.title), ['Grim'], 'View as: only what Sam may see');
    // A player gets no lists, and the names aren't in the settings they get.
    assert.deepEqual((await t.request('GET', `${base}/lists`, { as: t.sam.token })).json().lists, []);
    assert.equal((await t.request('POST', `${base}/lists`, { body: { name: 'x', filter: {} }, as: t.sam.token })).statusCode, 403);
    const campaign = (await t.request('GET', `/campaigns/${t.campaign.id}`, { as: t.sam.token })).json();
    assert.ok(!JSON.stringify(campaign).includes('Secret: people'));

    // Renamed, then removed.
    await t.request('PUT', `${base}/lists/${list.id}`, { body: { name: 'Millbrook folk', filter: { family: 'person', tag: 'millbrook' } } });
    assert.equal((await t.request('GET', `${base}/lists`)).json().lists[0].name, 'Millbrook folk');
    await t.request('DELETE', `${base}/lists/${list.id}`);
    assert.deepEqual((await t.request('GET', `${base}/lists`)).json().lists.map((l) => l.name), ['Hostile']);
    assert.equal((await t.request('DELETE', `${base}/lists/${list.id}`)).statusCode, 404);

    // Make a list: one quick call on Ask's task; an id that isn't a page is dropped. Saved, it's a list of ids.
    const made = (await t.request('POST', `${base}/lists/make`, { body: { words: 'hostile NPCs in Millbrook' } })).json();
    assert.equal(asked.task, 'qa');
    assert.ok(asked.prompt.includes('hostile NPCs in Millbrook') && asked.prompt.includes('Status: Hostile'));
    assert.deepEqual(made.filter.ids, [ids.grim, ids.spy]);
    assert.deepEqual(made.pages.map((p) => p.title), ['Grim', 'The spy']);
    await t.request('POST', `${base}/lists`, { body: { name: made.name, filter: made.filter } });
    const asAlex = (await t.request('GET', `${base}/lists?as=${t.alex.id}`)).json().lists;
    assert.deepEqual(asAlex.find((l) => l.name === 'Hostile NPCs').pages.map((p) => p.title), ['Grim']);
  } finally {
    await t.cleanup();
  }
});
