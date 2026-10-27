/**
 * The Web (wiki space stage 3d): lines from relationship facts, from pages
 * inside others and (on request) from links in the text; merged per pair;
 * steps out from a page; the same picture each time; and for a player, no
 * hidden page, no line from a part they can't see.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { webGraph } from '../src/wiki-web.js';

const page = (id, title, kind, { facts = [], parent = null, text = '' } = {}) => ({
  id, title, aliases: [], kind, parent, tags: [], sections: [{ id: 'aaaaaa', heading: '', text, canon: 'true', by: 'dm' }], facts, picture: null, banner: null, gallery: [],
});
const fact = (label, value, more = {}) => ({ label, value, available: 'all', canon: 'true', ...more });

test('wiki web: lines, merging, steps, presets and a stable layout', () => {
  const pages = [
    page('a000000001', 'Thorin', 'npc', { facts: [fact('Rival', '[[Vex]]'), fact('Mother', '[[Hilda]]')], parent: 'c000000001' }),
    page('b000000001', 'Vex', 'npc', { facts: [fact('Enemy', '[[Thorin]]')], parent: 'c000000001' }),
    page('h000000001', 'Hilda', 'npc', { facts: [fact('Married', '[[Bram]]')] }),
    page('e000000001', 'Bram', 'npc', { text: 'Knows [[Oskar]].' }),
    page('f000000001', 'Oskar', 'npc'),
    page('c000000001', 'The Crows', 'faction', { facts: [fact('At war with', '[[The Gulls]]')] }),
    page('d000000001', 'The Gulls', 'faction'),
  ];
  const whole = webGraph(pages);
  const pair = whole.lines.find((l) => [l.from, l.to].sort().join() === 'a000000001,b000000001');
  assert.deepEqual(pair.labels, ['Rival', 'Enemy'], 'two facts between a pair make one line');
  assert.equal(pair.tone, 'hostile');
  assert.ok(whole.lines.some((l) => l.kind === 'inside' && l.to === 'c000000001'));
  assert.ok(!whole.lines.some((l) => l.kind === 'mention'), 'text links only on request');
  assert.ok(webGraph(pages, { mentions: true }).lines.some((l) => l.kind === 'mention' && l.to === 'f000000001'));
  assert.equal(whole.bubbles.length, 1, 'the Crows hold two pages in view');

  const one = webGraph(pages, { around: 'a000000001', steps: 1 });
  assert.deepEqual(one.nodes.map((n) => n.title).sort(), ['Hilda', 'The Crows', 'Thorin', 'Vex']);
  assert.ok(webGraph(pages, { around: 'a000000001', steps: 2 }).nodes.some((n) => n.title === 'Bram'));
  assert.deepEqual(webGraph(pages, { around: 'a000000001', steps: 1 }), one, 'the same pages, the same picture');
  assert.deepEqual(one.nodes.find((n) => n.id === 'a000000001').x, 0);

  assert.deepEqual(webGraph(pages, { preset: 'factions' }).nodes.map((n) => n.title).sort(), ['The Crows', 'The Gulls']);
  const tree = webGraph(pages, { preset: 'family' });
  const y = Object.fromEntries(tree.nodes.map((n) => [n.title, n.y]));
  assert.ok(y.Hilda < y.Thorin, 'a mother is a generation up');
  assert.equal(y.Hilda, y.Bram, 'married, the same generation');

  const rumour = [page('a000000001', 'A', 'npc', { facts: [fact('Ally', '[[B]]', { canon: 'rumour' })] }), page('b000000001', 'B', 'npc')];
  assert.equal(webGraph(rumour).lines.length, 1);
  assert.equal(webGraph(rumour, { truth: true }).lines.length, 0, 'what is true leaves rumours out');
});

test('wiki web: a player gets no hidden page and no line from a part they cannot see', async () => {
  const t = await setup();
  const base = `/campaigns/${t.campaign.id}/wiki`;
  const make = async (body) => (await t.request('POST', base, { body: { available: 'all', ...body } })).json().page;
  try {
    const secret = await make({ title: 'The Masked One', available: 'dm' });
    const thorin = await make({
      title: 'Thorin',
      facts: [
        { label: 'Rival', value: '[[Vex]]', available: 'all' },
        { label: 'Secret ally', value: '[[Mira]]', available: 'dm' },
        { label: 'Will betray', value: '[[Oskar]]', available: 'all', canon: 'planned' },
        { label: 'Hunted by', value: '[[The Masked One]]', available: 'all' },
      ],
      sections: [{ heading: '', text: 'Friends with [[Bram]].\n:::dm\nSpies for [[Ilsa]].\n:::', available: 'all' }],
    });
    for (const title of ['Vex', 'Mira', 'Oskar', 'Bram', 'Ilsa']) await make({ title, sections: [{ heading: '', text: 'Someone.', available: 'all' }] });

    const dm = (await t.request('GET', `${base}/web?around=${thorin.id}&mentions=1`)).json();
    assert.deepEqual(dm.lines.map((l) => l.labels.join('/') || l.kind).sort(), ['Hunted by', 'Rival', 'Secret ally', 'Will betray', 'mention', 'mention']);
    assert.ok(dm.lines.find((l) => l.labels[0] === 'Secret ally').available === 'dm', 'the DM sees who a line is available to');
    assert.ok(dm.nodes.some((n) => n.id === secret.id));

    const sam = (await t.request('GET', `${base}/web?around=${thorin.id}&mentions=1&as=${t.sam.id}`)).json();
    const text = JSON.stringify(sam);
    assert.deepEqual(sam.lines.map((l) => l.labels.join('/') || l.kind).sort(), ['Rival', 'mention']);
    assert.doesNotMatch(text, new RegExp(`${secret.id}|Masked|Secret ally|Will betray|Ilsa|available`));
    assert.equal((await t.request('GET', `${base}/web?around=${secret.id}&as=${t.sam.id}`)).json().around, null, 'a hidden page in the middle is ignored');
    assert.equal((await t.request('GET', `${base}/web`, { as: t.sam.token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});
