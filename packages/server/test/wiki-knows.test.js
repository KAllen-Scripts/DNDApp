/**
 * Who knows what, Reveal to… and the spoiler check (wiki space stage 8b): the grid's cells per player, a reveal of
 * chosen parts in one save, and what newly visible words name that a player can't see yet (here, on a reveal and
 * on what waits for the DM).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { spoilers } from '../src/wiki-views.js';

test('spoilers: names by link and written out, only those the player can\'t see, never the page itself', () => {
  const pages = [
    { id: 'a', title: 'The Pale Hand', aliases: ['the Hand'], sections: [], facts: [] },
    { id: 'b', title: 'Mira', aliases: [], sections: [], facts: [] },
    { id: 'c', title: 'Inn', aliases: [], sections: [], facts: [] },
  ];
  const visible = new Map([[1, new Set(['b'])], [2, new Set(['a', 'b'])]]);
  assert.deepEqual(spoilers('Mira works for [[the Hand]] at the inn.', pages, visible), [{ player: 1, names: [{ id: 'a', title: 'The Pale Hand' }] }]);
  assert.deepEqual(spoilers('The pale hand is behind it.', pages, visible, ['a']), [], 'the page being shown');
  assert.deepEqual(spoilers('Handsome Mira.', pages, visible), [], 'whole words only; "Inn" is too short to count written out');
});

test('wiki knows: the grid, Reveal to… in one save, and the spoiler check', async () => {
  const t = await setup();
  const base = `/campaigns/${t.campaign.id}/wiki`;
  try {
    const make = async (body) => (await t.request('POST', base, { body: { available: 'all', ...body } })).json().page;
    const hand = await make({ title: 'The Pale Hand', kind: 'faction', available: 'dm', sections: [{ heading: '', text: 'A cult.', available: 'all' }] });
    const mira = await make({ title: 'Mira', kind: 'npc', sections: [
      { heading: '', text: 'A fence at the docks.\n\n:::for Thorin\nShe owes Thorin money.\n:::', available: 'all' },
      { heading: 'Secret', text: 'She spies for [[The Pale Hand]].', available: 'dm' },
    ], facts: [{ label: 'Allegiance', value: '[[The Pale Hand]]', available: 'dm' }] });
    const docks = await make({ title: 'The docks', kind: 'place', sections: [{ heading: '', text: 'Wet.', available: 'all' }] });

    const grid = (await t.request('GET', `${base}/knows`)).json();
    assert.deepEqual(grid.players.map((p) => p.character_name).sort(), ['Lyra', 'Thorin']);
    const cells = (id) => grid.pages.find((p) => p.id === id).cells;
    assert.deepEqual(cells(hand.id), { [t.sam.id]: 'none', [t.alex.id]: 'none' });
    assert.deepEqual(cells(mira.id), { [t.sam.id]: 'some', [t.alex.id]: 'some' });
    assert.deepEqual(cells(docks.id), { [t.sam.id]: 'all', [t.alex.id]: 'all' });
    assert.equal((await t.request('GET', `${base}/knows`, { as: t.sam.token })).statusCode, 403);

    // Before revealing Mira's secret to Lyra: it names the Pale Hand, which she can't see.
    const secret = mira.sections[1].id;
    const check = (await t.request('POST', `${base}/spoilers`, { body: { page_id: mira.id, players: [t.alex.id], sections: [secret] } })).json();
    assert.deepEqual(check.spoilers.map((s) => [s.name, s.names.map((n) => n.title)]), [['Lyra', ['The Pale Hand']]]);
    assert.deepEqual((await t.request('POST', `${base}/spoilers`, { body: { text: 'The docks are wet.', players: 'everyone' } })).json().spoilers, []);

    // Reveal the secret and the fact to Lyra in one save: Thorin's block stays his, Thorin doesn't get the secret.
    const res = await t.request('POST', `${base}/${mira.id}/reveal`, { body: { players: [t.alex.id], sections: [secret], facts: ['Allegiance'] } });
    assert.equal(res.statusCode, 200);
    const lyra = (await t.request('GET', `${base}/${mira.id}`, { as: t.alex.token })).json().page;
    assert.match(lyra.sections.map((s) => s.text).join(' '), /spies for The Pale Hand/);
    assert.ok(lyra.facts.some((f) => f.label === 'Allegiance'));
    const thorin = (await t.request('GET', `${base}/${mira.id}`, { as: t.sam.token })).json().page;
    assert.doesNotMatch(thorin.sections.map((s) => s.text).join(' '), /spies/);
    // Lyra's cell: everything but Thorin's block, so still some.
    assert.equal(res.json().knows[t.alex.id], 'some');

    // A hidden page revealed whole to Thorin: the page and all of it.
    await t.request('POST', `${base}/${hand.id}/reveal`, { body: { players: [t.sam.id] } });
    const after = (await t.request('GET', `${base}/knows`)).json().pages.find((p) => p.id === hand.id).cells;
    assert.deepEqual(after, { [t.sam.id]: 'all', [t.alex.id]: 'none' });
  } finally {
    await t.cleanup();
  }
});

test('wiki knows: a waiting reveal and a player\'s lore carry the spoiler check', async () => {
  const t = await setup();
  const base = `/campaigns/${t.campaign.id}/wiki`;
  try {
    await t.request('POST', base, { body: { title: 'The Pale Hand', kind: 'faction', available: 'dm', sections: [{ heading: '', text: 'A cult.', available: 'all' }] } });
    const page = (await t.request('POST', base, { body: { title: 'Thorin', kind: 'character', available: 'all', player: t.sam.id, sections: [{ heading: '', text: 'A dwarf.', available: 'all' }] } })).json().page;
    // Thorin's player writes that the Pale Hand burned his village, for everyone.
    const lore = await t.request('POST', `${base}/lore`, { body: { type: 'section', heading: 'Ashes', text: 'The Pale Hand burned my village.', available: 'all' }, as: t.sam.token });
    assert.equal(lore.statusCode, 201);
    const waiting = (await t.request('GET', `${base}/proposals`)).json().proposals;
    const p = waiting.find((x) => x.from === 'player');
    assert.ok(p, JSON.stringify(waiting));
    assert.deepEqual(p.spoilers.map((s) => s.name), ['Lyra'], 'not Thorin: they wrote it');
    assert.ok(page.id);
  } finally {
    await t.cleanup();
  }
});
