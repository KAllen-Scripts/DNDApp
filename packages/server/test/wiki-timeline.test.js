/**
 * The Timeline (wiki space stage 4c): lanes (History, the campaign, the DM's own), items in order, trays for what
 * has no time, places for Show on the map; and for a player, no DM-only or planned event, no lane of a page they
 * can't see, no place not revealed to them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, terrain } from './helpers.js';
import { timeline } from '../src/wiki/timeline.js';

const D = 1440;
const all = (text) => [{ heading: '', text, available: 'all' }];

async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await check()) return;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('wiki timeline: lanes, order and trays', () => {
  const page = (id, title, kind, more = {}) => ({ id, title, aliases: [], kind, parent: null, tags: [], sections: [], facts: [], events: [], when: null, picture: null, banner: null, gallery: [], ...more });
  const at = (from, to = from + D, text = 'x') => ({ text, from, to });
  const pages = [
    page('a000000001', 'The Crows', 'faction', { events: [{ id: 'e00001', when: at(-100 * D), text: 'Founded.', canon: 'true' }, { id: 'e00002', when: at(5 * D), text: 'Burned the mill.', canon: 'rumour' }] }),
    page('b000000001', 'Vex', 'npc', { sections: all('Leads [[The Crows]].'), events: [{ id: 'e00003', when: at(2 * D), text: 'Arrived.', canon: 'true' }] }),
    page('c000000001', 'Session 3', 'session', { when: at(3 * D, 4 * D, 'Day 4') }),
    page('d000000001', 'Session 1', 'session'),
    page('e000000001', 'Session 2', 'session', { when: { text: 'some time', from: null, to: null } }),
    page('f000000001', 'Old war', 'event', { when: at(-300 * D), events: [{ id: 'e00004', when: null, text: 'Someone died.', canon: 'true' }] }),
  ];
  const t = timeline(pages);
  assert.deepEqual(t.lanes.map((l) => l.id), ['history', 'campaign']);
  assert.deepEqual(t.items.map((x) => [x.type === 'page' ? x.title : x.text, x.lane]), [['Old war', 'history'], ['Founded.', 'history'], ['Arrived.', 'campaign'], ['Session 3', 'campaign'], ['Burned the mill.', 'campaign']]);
  assert.deepEqual(t.undated.map((x) => x.text ?? x.title), ['Session 2', 'Someone died.']);
  assert.deepEqual(t.sessions.map((s) => s.title), ['Session 1'], 'session pages with no time at all');

  const crows = timeline(pages, { lanes: ['a000000001', 'ffffffffff'] });
  assert.deepEqual(crows.lanes.map((l) => l.id), ['a000000001', 'history', 'campaign'], 'a lane of a page that isn\'t there is left out');
  assert.deepEqual(crows.items.filter((x) => x.lane === 'a000000001').map((x) => x.text), ['Founded.', 'Arrived.', 'Burned the mill.'], 'the page and the pages linking to it');
  assert.equal(timeline(pages, { truth: true }).items.some((x) => x.text === 'Burned the mill.'), false, 'what is true leaves rumours out');
});

test('wiki timeline: a player gets only what they may see, places included', async () => {
  const t = await setup();
  const base = `/campaigns/${t.campaign.id}/wiki`;
  const make = async (body) => (await t.request('POST', base, { body: { available: 'all', sections: all('Text.'), ...body } })).json().page;
  try {
    const mill = await make({ title: 'Hollow Mill', events: [
      { when: { text: 'Day 2' }, text: 'The wheel stopped.', available: 'all' },
      { when: { text: 'Day 3' }, text: 'The DM knows.', available: 'dm' },
      { when: { text: 'Day 4' }, text: 'Cultists will meet.', available: 'all', canon: 'planned' },
      { when: { text: 'Day 5' }, text: 'Sam saw a light.', available: [t.sam.id] },
    ] });
    const masked = await make({ title: 'The Masked One', available: 'dm', events: [{ when: { text: 'Day 1' }, text: 'Hid the key.', available: 'all' }] });
    const tower = await make({ title: 'Hidden tower', when: { text: 'Day 6' } });
    await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { wiki: { lanes: [masked.id] } } });

    const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { read: true, filename: 'vale.png', data: (await terrain(700, 490, { size: 35 })).toString('base64') } });
    const map = res.json();
    await until(() => t.maps.get(t.campaign.id, map.id).reading.status !== 'pending');
    const mapBase = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    await t.request('PATCH', mapBase, { body: { shown: true } });
    await t.request('PATCH', `${mapBase}/places`, { body: { add: { name: 'Hollow Mill', x: 100, y: 100, revealed: true, page: { id: mill.id } } } });
    await t.request('PATCH', `${mapBase}/places`, { body: { add: { name: 'Tower', x: 200, y: 100, page: { id: tower.id } } } });

    const dm = (await t.request('GET', `${base}/timeline`)).json();
    assert.deepEqual(dm.lanes.map((l) => l.title), ['The Masked One', 'History', 'The campaign']);
    assert.equal(dm.items.length, 6);
    assert.equal(dm.items.find((x) => x.text === 'The DM knows.').available, 'dm');
    assert.equal(dm.items.find((x) => x.title === 'Hidden tower').place.map_id, map.id);
    assert.equal(dm.now, 480);

    const alex = (await t.request('GET', `${base}/timeline?as=${t.alex.id}`)).json();
    assert.deepEqual(alex.lanes.map((l) => l.id), ['history', 'campaign']);
    assert.deepEqual(alex.items.map((x) => x.text ?? x.title), ['The wheel stopped.', 'Hidden tower']);
    assert.equal(alex.items[0].place.place_id != null, true, 'a revealed place');
    assert.equal(alex.items[1].place, null, 'not a place they have been shown');
    assert.doesNotMatch(JSON.stringify(alex), new RegExp(`${masked.id}|Masked|DM knows|Cultists|Sam saw|available`));
    const sam = (await t.request('GET', `${base}/timeline?as=${t.sam.id}`)).json();
    assert.ok(sam.items.some((x) => x.text === 'Sam saw a light.'));
    assert.deepEqual((await t.request('GET', `${base}/timeline?as=${t.alex.id}`, { as: t.sam.token })).json(), sam, 'a player gets their own (stage 6a)');

    const home = (await t.request('GET', `${base}/home?as=${t.alex.id}`)).json();
    assert.deepEqual(home.moments.map((m) => m.title), ['The wheel stopped.', 'Hidden tower']);
  } finally {
    await t.cleanup();
  }
});
