/**
 * Past journeys on the Timeline (wiki space stage 4d): worked out from the maps' archived changes (never stored
 * twice), those going together as one bar, and for a player only maps shown to them and tokens not hidden.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, terrain } from './helpers.js';
import { mapJourneys } from '../src/maps/events.js';

const image = { file: 'image.png', type: 'image/png', width: 100, height: 100 };
const tok = (id, name, extra = {}) => ({ id, name, kind: 'pc', user_id: 1, x: 10, y: 10, journey: null, ...extra });
const j = (leaves, arrives, to_name) => ({ from: { x: 10, y: 10 }, to: { x: 90, y: 10 }, leaves, arrives, pace: 'normal', miles: 30, to_name });

test('journeys: from the archived changes, grouped, arrived, stopped and on the way', () => {
  const histories = [{
    id: 'aaaaaaaaaa',
    entries: [
      { changes: [{ p: [], v: { name: 'The Vale', image, shown: true, tokens: [tok('aaa111', 'Thorin'), tok('bbb222', 'Lyra'), tok('ccc333', 'Spy', { hidden: true })] } }] },
      { reason: 'journey', changes: [{ p: ['tokens', 0, 'journey'], v: j(480, 2160, 'Daggerford') }, { p: ['tokens', 1, 'journey'], v: j(480, 2160, 'Daggerford') }] },
      { reason: 'journey', changes: [{ p: ['tokens', 2, 'journey'], v: j(500, 900, 'Waterdeep') }] },
      { reason: 'clock', changes: [{ p: ['tokens', 0, 'journey'], v: null }, { p: ['tokens', 1, 'journey'], v: null }] },
      { reason: 'journey', changes: [{ p: ['tokens', 0, 'journey'], v: j(3000, 4000, 'Baldur\'s Gate') }] },
      { reason: 'journey stopped', changes: [{ p: ['tokens', 0, 'journey'], v: null }] },
      { reason: 'journey', changes: [{ p: ['tokens', 1, 'journey'], v: j(5000, 6000, null) }] },
    ],
  }, {
    id: 'bbbbbbbbbb', // never shown to the players
    entries: [
      { changes: [{ p: [], v: { name: 'Secret', image, shown: false, tokens: [tok('ddd444', 'Vex')] } }] },
      { reason: 'journey', changes: [{ p: ['tokens', 0, 'journey'], v: j(100, 200, 'Lair') }] },
    ],
  }];
  const dm = mapJourneys(histories);
  assert.deepEqual(dm.map((g) => [g.map_name, g.who, g.to_name, g.leaves, g.arrives, g.done, g.stopped]), [
    ['Secret', ['Vex'], 'Lair', 100, 200, false, false],
    ['The Vale', ['Thorin', 'Lyra'], 'Daggerford', 480, 2160, true, false],
    ['The Vale', ['Spy'], 'Waterdeep', 500, 900, false, false],
    ['The Vale', ['Thorin'], 'Baldur\'s Gate', 3000, 4000, true, true],
    ['The Vale', ['Lyra'], '', 5000, 6000, false, false],
  ]);
  const player = mapJourneys(histories, { forUser: 3 });
  assert.deepEqual(player.map((g) => g.to_name), ['Daggerford', 'Baldur\'s Gate', ''], 'no hidden map or token');
});

test('journeys: on the Timeline\'s campaign lane, for the DM and the players who saw the map', async () => {
  const t = await setup();
  const cid = t.campaign.id;
  try {
    const res = await t.request('POST', `/campaigns/${cid}/maps`, { body: { filename: 'map.png', name: 'The Vale', data: (await terrain(400, 300)).toString('base64') } });
    const map = res.json();
    await t.request('PATCH', `/campaigns/${cid}/maps/${map.id}`, { body: { shown: true, shown_to: [t.sam.id] } });
    const token = (await t.request('POST', `/campaigns/${cid}/maps/${map.id}/tokens`, { body: { name: 'Thorin', kind: 'pc', x: 20, y: 20 } })).json().token;
    await t.maps.change(cid, map.id, (m) => { m.tokens.find((x) => x.id === token.id).journey = j(480, 2160, 'Daggerford'); }, { by: t.dm.id, reason: 'journey' });
    const items = (as) => t.request('GET', `/campaigns/${cid}/wiki/timeline${as ? `?as=${as}` : ''}`).then((r) => r.json().items.filter((x) => x.type === 'journey'));
    const [bar] = await items();
    assert.equal(bar.lane, 'campaign');
    assert.deepEqual([bar.when.from, bar.when.to, bar.done], [480, 2160, false]);
    assert.match(bar.text, /Thorin on the way to Daggerford/);
    assert.equal(bar.place.map_id, map.id);
    assert.equal((await items(t.sam.id)).length, 1);
    assert.equal((await items(t.alex.id)).length, 0, 'the map wasn\'t shown to them');
  } finally {
    await t.cleanup();
  }
});
