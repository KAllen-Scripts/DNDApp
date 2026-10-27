/**
 * Tidy up (wiki space stage 8c): each rule finds what it's for, and nothing it isn't.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, terrain } from './helpers.js';

test('wiki tidy: every rule', async () => {
  const t = await setup();
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    const make = async (body) => (await t.request('POST', base, { body: { available: 'all', ...body } })).json().page;
    const text = (s) => [{ heading: '', text: s, available: 'all' }];
    const gone = await make({ title: 'Old Tom', kind: 'npc', sections: text('Dead now.') });
    await t.request('DELETE', `${base}/${gone.id}`);
    const mira = await make({ title: 'Mira', kind: 'npc', sections: text('Mira drinks at the Drowned Rat with [[Vex]].\n\n:::for Gandalf\nA wizard?\n:::'), facts: [{ label: 'Friend', value: '[[Old Tom]]' }] });
    const rat = await make({ title: 'The Drowned Rat', kind: 'tavern', sections: text('A tavern.'), picture: null });
    const lonely = await make({ title: 'A lonely legend', kind: 'lore', sections: text('Nobody cares.') });
    const plan = await make({ title: 'The plot', kind: 'lore', sections: [{ heading: '', text: 'The duke is behind it, see [[Mira]].', available: 'dm', canon: 'planned' }] });
    const told = await make({ title: 'Thorin', kind: 'character', player: t.sam.id, sections: [{ heading: '', text: 'He says he was a prince.', available: 'all', canon: 'told' }] });

    // A map with a place that has no page, and the tavern pinned on it.
    const map = (await t.request('POST', `/campaigns/${cid}/maps`, { body: { filename: 'town.png', data: (await terrain(140, 140, { size: 35 })).toString('base64') } })).json();
    await t.request('PATCH', `/campaigns/${cid}/maps/${map.id}/places`, { body: { add: { name: 'The well', x: 10, y: 10 } } });
    // Three sessions played since the plot was written.
    for (const n of [1, 2, 3]) t.db.prepare("INSERT INTO sessions (campaign_id, number, status, played_on, checksum, processed_at) VALUES (?, ?, 'ready', '2026-10-01', 'c', ?)").run(cid, n, '2999-01-01T00:00:00Z');

    const res = await t.request('GET', `${base}/tidy`);
    assert.equal(res.statusCode, 200);
    const { items, rules } = res.json();
    const of = (rule) => items.filter((i) => i.rule === rule);
    assert.deepEqual(of('missing_link').map((i) => [i.page.title, i.name]), [['Mira', 'Vex']]);
    assert.deepEqual(of('dead_fact').map((i) => [i.page.title, i.label]), [['Mira', 'Friend']]);
    assert.deepEqual(of('unlinked').map((i) => i.page.title), ['Mira'], 'Mira names the Drowned Rat');
    assert.ok(of('no_links').some((i) => i.page.id === lonely.id));
    assert.ok(!of('no_links').some((i) => [mira.id, plan.id].includes(i.page.id)), 'they link, or are linked');
    assert.deepEqual(of('place_not_on_map').map((i) => i.page.id), [rat.id]);
    assert.deepEqual(of('place_no_page').map((i) => i.name), ['The well']);
    assert.deepEqual(of('no_picture').map((i) => i.page.title).sort(), ['Mira', 'Thorin']);
    assert.deepEqual(of('unknown_for').map((i) => i.names), [['Gandalf']]);
    assert.deepEqual(of('still_planned').map((i) => [i.page.id, i.sessions]), [[plan.id, 3]]);
    assert.deepEqual(of('told').map((i) => i.page.id), [told.id]);
    assert.equal(rules.find((r) => r.rule === 'unlinked').count, 1);
    assert.equal((await t.request('GET', `${base}/tidy`, { as: t.sam.token })).statusCode, 403);

    // Fixed: the tavern linked from Mira, the well given a page; those go.
    await t.request('POST', `${base}/${mira.id}/links`, { body: { section_id: mira.sections[0].id, page_id: rat.id } });
    await t.request('POST', `${base}/from-map`, { body: { map_id: map.id, kind: 'place', id: (await t.request('GET', `/campaigns/${cid}/maps/${map.id}`)).json().places[0].id } });
    const after = (await t.request('GET', `${base}/tidy`)).json().items;
    assert.ok(!after.some((i) => i.rule === 'unlinked'));
    assert.ok(!after.some((i) => i.rule === 'place_no_page'));
  } finally {
    await t.cleanup();
  }
});
