/**
 * Templates (wiki space stage 5a): the starters, the DM's own (kept apart from the wiki: never in the list, Ask,
 * the views or a player's wiki), and a new page made from one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { STARTER_TEMPLATES, templateFor, fromTemplate } from '@dndapp/shared/wiki-templates.js';

test('templates: starters for every family; the family\'s by default; a page from one', () => {
  assert.deepEqual([...new Set(STARTER_TEMPLATES.map((t) => t.family))].sort(), ['creature', 'faction', 'item', 'lore', 'person', 'place', 'quest', 'session']);
  assert.ok(STARTER_TEMPLATES.some((t) => t.title === 'Clue') && STARTER_TEMPLATES.some((t) => t.title === 'Arc'));
  const person = templateFor('NPC');
  assert.equal(person.title, 'Person');
  assert.equal(person.sections[0].heading, 'At the table', 'people lead with the table card');
  assert.equal(templateFor('Tavern').title, 'Place', 'by family');
  assert.equal(templateFor(''), null);
  const mine = { title: 'Shopkeeper', kind: 'shopkeeper', sections: [], facts: [] };
  assert.equal(templateFor('Shopkeeper', [mine]), mine, 'the DM\'s own first');
  const fields = fromTemplate(person);
  assert.equal(fields.kind, 'npc');
  assert.ok(fields.sections.every((s) => s.text === '' && s.prompt));
  assert.deepEqual(fields.sections[0].available, 'dm');
  assert.ok(fields.facts.every((f) => f.value === '' && f.prompt));
});

test('templates: the DM\'s own are kept apart from the wiki and from players', async () => {
  const t = await setup();
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    const res = await t.request('POST', base, { body: { title: 'Shopkeeper', kind: 'shopkeeper', template: true, available: 'all', sections: [{ heading: 'Wares', text: 'What they sell and what it costs.', available: 'all' }], facts: [{ label: 'Shop', value: '[[A place]]' }] } });
    assert.equal(res.statusCode, 201, res.body);
    const tpl = res.json().page;
    assert.equal(tpl.template, true);
    assert.equal(tpl.available, 'dm', 'always the DM\'s');
    const list = (await t.request('GET', `${base}/templates`)).json();
    assert.ok(list.starters.length >= 10);
    assert.deepEqual(list.own.map((x) => x.title), ['Shopkeeper']);
    assert.ok(!(await t.request('GET', base)).json().pages.some((p) => p.id === tpl.id), 'not in the wiki\'s list');
    assert.equal((await t.request('GET', `${base}/${tpl.id}`)).json().page.title, 'Shopkeeper', 'the DM can open it to edit');
    assert.equal((await t.request('GET', `${base}/${tpl.id}`, { as: t.sam.token })).statusCode, 404, 'a player never gets a template');
    assert.equal((await t.request('GET', `${base}/templates`, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.search.search(cid, 'what they sell', { kinds: ['wiki'] })).length, 0, 'never indexed for Ask');
    // A page can share a template's name; edits and deletes work.
    assert.equal((await t.request('POST', base, { body: { title: 'Shopkeeper', available: 'all', sections: [{ heading: '', text: 'Hilda.', available: 'all' }] } })).statusCode, 201);
    assert.equal((await t.search.search(cid, 'Hilda', { kinds: ['wiki'] })).length, 1, 'a page is');
    const saved = (await t.request('PUT', `${base}/${tpl.id}`, { body: { version: tpl.version, title: 'Merchant' } })).json().page;
    assert.equal(saved.template, true);
    assert.equal((await t.request('DELETE', `${base}/${tpl.id}`)).statusCode, 200);
    assert.deepEqual((await t.request('GET', `${base}/templates`)).json().own, []);
  } finally {
    await t.cleanup();
  }
});
