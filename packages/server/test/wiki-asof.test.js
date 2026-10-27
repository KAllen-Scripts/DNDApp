/**
 * Scrubbing through time (wiki space stage 11): the Web and the Atlas as they were at a moment, from the archive;
 * a player gets only what they could see then and can see now; the Timeline's lanes by character.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, terrain } from './helpers.js';
import { timeline } from '../src/wiki-timeline.js';

const all = (text) => [{ heading: '', text, available: 'all' }];
const tick = () => new Promise((r) => setTimeout(r, 15));
const moment = async () => {
  await tick();
  const at = new Date().toISOString();
  await tick();
  return at;
};

test('wiki as of: the Web and the Atlas at two moments, and a player judged by then and now', async () => {
  const t = await setup();
  const cid = t.campaign.id;
  const wiki = `/campaigns/${cid}/wiki`;
  try {
    const map = (await t.request('POST', `/campaigns/${cid}/maps`, { body: { filename: 'vale.png', data: (await terrain(140, 140, { size: 35 })).toString('base64') } })).json();
    const base = `/campaigns/${cid}/maps/${map.id}`;
    await t.request('PATCH', base, { body: { shown: true } });
    const hand = (await t.request('POST', wiki, { body: { title: 'The Pale Hand', kind: 'faction', available: 'all', sections: all('A cult.') } })).json().page;
    const mira = (await t.request('POST', wiki, { body: { title: 'Mira', kind: 'npc', available: 'all', sections: all('A fence. Works for [[The Pale Hand]].') } })).json().page;
    t.maps.change(cid, map.id, (m) => { m.tokens.push({ id: 'aaaaaa', kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 10, y: 10 }, { id: 'bbbbbb', kind: 'npc', name: 'Spy', x: 30, y: 30, hidden: true }); }, { by: t.dm.id });
    const t1 = await moment();

    await t.wiki.update(cid, hand.id, { sections: [{ ...hand.sections[0], text: 'A cult of the Lich.' }] }, { by: t.dm.id });
    const later = (await t.request('POST', wiki, { body: { title: 'The Lich', kind: 'npc', available: 'all', sections: all('Old.') } })).json().page;
    t.maps.change(cid, map.id, (m) => { m.tokens.find((x) => x.id === 'aaaaaa').x = 90; }, { by: t.dm.id });
    const t2 = await moment();

    // The Web then and now (the DM's).
    const webAt = async (at, q = '') => (await t.request('GET', `${wiki}/web?at=${encodeURIComponent(at)}${q}`)).json();
    const ids = (w) => w.nodes.map((n) => n.id).sort();
    assert.deepEqual(ids(await webAt(t1)), [hand.id, mira.id].sort());
    assert.ok(ids(await webAt(t2)).includes(later.id));
    assert.equal((await webAt(t1)).at, t1);

    // The Atlas then: where the tokens stood.
    const atlasAt = async (at, q = '') => (await t.request('GET', `${wiki}/atlas?map=${map.id}&at=${encodeURIComponent(at)}${q}`)).json().layers;
    assert.equal((await atlasAt(t1)).then_tokens.find((x) => x.id === 'aaaaaa').x, 10);
    assert.equal((await atlasAt(t2)).then_tokens.find((x) => x.id === 'aaaaaa').x, 90);
    assert.ok((await atlasAt(t1)).then_tokens.find((x) => x.id === 'bbbbbb').hidden);
    // Before the map existed: nothing.
    assert.equal((await t.request('GET', `${wiki}/atlas?map=${map.id}&at=2020-01-01T00:00:00.000Z`)).json().layers, null);

    // Sam: not the hidden token, ever.
    assert.deepEqual((await atlasAt(t1, `&as=${t.sam.id}`)).then_tokens.map((x) => x.id), ['aaaaaa']);
    assert.deepEqual(ids(await webAt(t1, `&as=${t.sam.id}`)), [hand.id, mira.id].sort());
    // The Pale Hand is hidden from players now: Sam doesn't get it as it was then either.
    await t.wiki.update(cid, hand.id, { available: 'dm' }, { by: t.dm.id });
    const samThen = await webAt(t1, `&as=${t.sam.id}`);
    assert.deepEqual(ids(samThen), [mira.id]);
    assert.doesNotMatch(JSON.stringify(samThen), /Pale Hand|A cult/);
    // As a player himself, ?as= is ignored and it's still his.
    assert.deepEqual((await t.request('GET', `${wiki}/web?at=${encodeURIComponent(t1)}`, { as: t.sam.token })).json().nodes.map((n) => n.id), [mira.id]);
    // The map hidden from him now: he gets nothing of it then.
    await t.request('PATCH', base, { body: { shown: false } });
    assert.equal(await atlasAt(t1, `&as=${t.sam.id}`), null);

    // A bad moment is refused.
    assert.equal((await t.request('GET', `${wiki}/web?at=yesterday`)).statusCode, 400);
  } finally {
    await t.cleanup();
  }
});

test('wiki as of: the moments are the ends of the sessions played', async () => {
  const t = await setup();
  try {
    t.store.addSession(t.campaign.id, { number: 3, title: 'The mill', played_on: '2026-10-01' }, Buffer.from('DM: Hello.'));
    const { moments } = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/moments`, { as: t.sam.token })).json();
    assert.equal(moments.length, 1);
    assert.equal(moments[0].number, 3);
    assert.ok(moments[0].at.startsWith('2026-10-0'));
    assert.ok(moments[0].at > '2026-10-01T23:59:59');
  } finally {
    await t.cleanup();
  }
});

test('timeline: lanes by character, from their journeys', () => {
  const journeys = [{ id: 'm:1', map_id: 'm', map_name: 'The Vale', who: ['Thorin', 'Lyra', 'Wolf (NPC)'], to_name: 'Millbrook', to: { x: 1, y: 2 }, leaves: 100, arrives: 200, by: 'foot', done: true, stopped: false }];
  const off = timeline([], { journeys });
  assert.deepEqual(off.lanes.map((l) => l.id), ['history', 'campaign']);
  const on = timeline([], { journeys, characters: true });
  assert.deepEqual(on.lanes.map((l) => l.title), ['Lyra', 'Thorin', 'History', 'The campaign']);
  assert.deepEqual(on.items.map((x) => x.lane).sort(), ['pc:lyra', 'pc:thorin']);
  assert.match(on.items.find((x) => x.lane === 'pc:thorin').text, /Went to Millbrook with Lyra, Wolf \(NPC\)/);
});
