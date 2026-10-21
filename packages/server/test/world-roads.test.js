/**
 * The world, fourth stage (owner, 2026-10-21: "Also wagons and maybe even random encounters as we travel";
 * "A lot of these should also be optional"): roads and rivers, difficult terrain slowing journeys, ways to
 * travel (riding, wagons, boats), forced marches, random encounters as the clock moves on, and the
 * campaign's switches for each.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, terrain } from './helpers.js';
import { journeyAt, normalizeMap, travelMinutes } from '@dndapp/shared/map.js';
import { planJourney, rollLine } from '../src/maps/travel.js';

/** A 400 × 300 map a mile a pixel. */
const mileMap = (extra = {}) => normalizeMap({ image: { width: 400, height: 300 }, scale: { distance: 400, unit: 'mi', per: 'width' }, ...extra });
const rect = (id, x0, y0, x1, y1) => ({ id, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });

test('planJourney: miles and time by pace, terrain, roads, wagons, boats and hours a day', () => {
  const from = { x: 0, y: 150 };
  const to = { x: 24, y: 150 };
  assert.equal(planJourney(mileMap(), from, to).minutes, 480, '24 miles: a day on foot');
  // Half of it through a forest: those 12 miles count double.
  const forest = mileMap({ terrain: [rect('forest1', 12, 100, 30, 200)] });
  const slow = planJourney(forest, from, to);
  assert.equal(slow.rough_miles, 12);
  assert.equal(slow.minutes, 1440 + 4 * 60, '36 miles of going: a day, a night and 4 hours');
  // A road through the forest: no difficult terrain on a road.
  const road = mileMap({ terrain: forest.terrain, roads: [{ id: 'road01', kind: 'road', x1: 0, y1: 150, x2: 24, y2: 150 }] });
  assert.deepEqual([planJourney(road, from, to).minutes, planJourney(road, from, to).road_miles], [480, 24]);
  // A wagon off the road is slow everywhere; boats go by their own speed, a crew sailing day and night.
  assert.equal(planJourney(mileMap(), from, to, { by: 'wagon' }).minutes, 1440 + 8 * 60);
  assert.equal(planJourney(mileMap(), from, to, { by: 'sailing' }).minutes, 12 * 60, '2 miles an hour, no stopping');
  assert.equal(planJourney(mileMap(), from, to, { by: 'rowboat' }).minutes, 1440 + 8 * 60, '16 hours of rowing, 8 a day');
  // Pushing on 12 hours a day.
  assert.equal(travelMinutes(36, 'normal', { hours: 12 }), 12 * 60);
  // No scale: no telling.
  assert.equal(planJourney(normalizeMap({ image: { width: 400, height: 300 } }), from, to).minutes, null);
});

test('planJourney: goes round by road when that beats the hard way, and the token follows the road', () => {
  const swamp = [rect('swamp1', 0, 50, 100, 150)];
  const roads = [
    { id: 'road01', kind: 'road', x1: 0, y1: 100, x2: 50, y2: 160 },
    { id: 'road02', kind: 'road', x1: 50, y1: 160, x2: 100, y2: 100 },
    { id: 'river1', kind: 'river', x1: 0, y1: 100, x2: 100, y2: 100 },
  ];
  const map = mileMap({ terrain: swamp, roads });
  const way = planJourney(map, { x: 0, y: 100 }, { x: 100, y: 100 });
  assert.deepEqual(way.route.map(([x, y]) => [x, y]), [[0, 100], [50, 160], [100, 100]], 'by the road, round the swamp');
  assert.equal(way.road_miles, 156.2);
  const j = { from: { x: 0, y: 100 }, to: { x: 100, y: 100 }, leaves: 0, arrives: 1000, hours: 24, route: way.route };
  assert.deepEqual(journeyAt(j, 500), { x: 50, y: 160, done: false }, 'halfway: at the bend in the road');
  // A boat takes the river, straight across.
  assert.equal(planJourney(map, { x: 0, y: 100 }, { x: 100, y: 100 }, { by: 'keelboat' }).road_miles, 100);
  // Without the swamp the straight way is shorter.
  assert.equal(planJourney(mileMap({ roads }), { x: 0, y: 100 }, { x: 100, y: 100 }).route, null);
});

test('rollLine: dice in an encounter line are rolled', () => {
  assert.equal(rollLine('1d6+2 wolves and 2d4 bats', (sides) => sides / 2), '5 (1d6+2) wolves and 4 (2d4) bats');
  assert.equal(rollLine('An old hermit', () => 1), 'An old hermit');
});

async function region(t) {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'map.png', name: 'The Vale', data: (await terrain(400, 300)).toString('base64') } });
  const map = res.json();
  await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${map.id}`, { body: { shown: true, kind: 'region', scale: { distance: 400, unit: 'mi', per: 'width' } } });
  const add = async (body) => (await t.request('POST', `/campaigns/${t.campaign.id}/maps/${map.id}/tokens`, { body })).json().token;
  const thorin = await add({ kind: 'pc', user_id: t.sam.id, name: 'Thorin', x: 10, y: 150 });
  return { map, thorin, base: `/campaigns/${t.campaign.id}/maps/${map.id}` };
}

test('world travel: by wagon along a road, forced marches, the preview, and players not getting roads or encounter tables', async () => {
  const t = await setup();
  try {
    const { map, thorin, base } = await region(t);
    for (const add of [{ kind: 'road', x1: 10, y1: 150, x2: 40, y2: 150 }, { kind: 'river', x1: 0, y1: 0, x2: 400, y2: 0 }]) {
      assert.equal((await t.request('PATCH', `${base}/roads`, { body: { add } })).statusCode, 200);
    }
    await t.request('PATCH', `${base}`, { body: { encounters: { chance: 20, every: 4, table: ['2d4 wolves'] } } });
    const go = (body, as) => t.request('POST', `${base}/tokens/${thorin.id}/journey`, { body, ...(as && { as }) });
    // Sam asks what a wagon ride would take: nothing changes.
    const preview = (await go({ x: 40, y: 150, by: 'wagon', preview: true }, t.sam.token)).json().plan;
    assert.deepEqual([preview.miles, preview.road_miles, preview.minutes, preview.arrives], [30, 30, 1440 + 120, 480 + 1440 + 120]);
    assert.equal(t.maps.get(t.campaign.id, map.id).tokens[0].journey, null);
    // Pushing on 10 hours a day.
    const res = await go({ x: 40, y: 150, by: 'wagon', hours: 10 }, t.sam.token);
    assert.equal(res.statusCode, 200, res.body);
    const j = t.maps.get(t.campaign.id, map.id).tokens[0].journey;
    assert.deepEqual([j.by, j.hours, j.lead, j.arrives - j.leaves], ['wagon', 10, thorin.id, 600]);
    const moved = (await t.request('POST', `/campaigns/${t.campaign.id}/clock`, { body: { add: 1440, stop: false } })).json();
    const march = moved.notes.filter((n) => n.kind === 'march');
    assert.equal(march.length, 1);
    assert.match(march[0].text, /^Thorin pushed on past 8 hours .*DC 11 and 12/);
    // Players never get the roads or the tables.
    const seen = (await t.request('GET', base, { as: t.sam.token })).json();
    assert.deepEqual([seen.roads, seen.encounters], [[], null]);
    assert.equal((await t.request('PATCH', `${base}/roads`, { body: { clear: 'all' }, as: t.sam.token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('world travel: a random encounter stops the clock where it happens, rolled once, and the switches turn things off', async () => {
  // d100 rolls 10 (under the 50 chance), the table's first line, each die 3.
  const t = await setup({ random: (sides) => (sides === 100 ? 10 : sides === 6 ? 3 : 1) });
  try {
    const { map, thorin, base } = await region(t);
    const place = (await t.request('PATCH', `${base}/places`, { body: { add: { name: 'Misty Forest', x: 50, y: 150, points: [[30, 100], [80, 100], [80, 200], [30, 200]], encounters: { chance: 50, every: 4, table: ['1d6+2 wolves'] } } } })).json().places[0];
    assert.equal(place.encounters.every, 4);
    await t.request('POST', `${base}/tokens/${thorin.id}/journey`, { body: { x: 58, y: 150 } }); // 48 miles: two days
    const clock = (body) => t.request('POST', `/campaigns/${t.campaign.id}/clock`, { body });
    let res = (await clock({ add: 1440 })).json();
    // 4 hours in, he's 12 miles on, not in the forest yet; 8 hours in, he's at the forest's edge (34).
    assert.deepEqual(res.notes.map((n) => [n.kind, n.at]), [['encounter', 480 + 480]]);
    assert.equal(res.clock, 960, 'the clock stopped there');
    assert.match(res.notes[0].text, /^Thorin, camped for the night on the road \(The Vale\) in Misty Forest: 5 \(1d6\+2\) wolves$/);
    // Moving on doesn't roll that one again.
    res = (await clock({ add: 1440 * 3 })).json();
    assert.ok(res.notes.length && res.notes.every((n) => n.at > 960), 'the next one in the forest stops it again');
    // Without stopping, he gets there.
    await clock({ add: 1440 * 3, stop: false });
    assert.equal(t.maps.get(t.campaign.id, map.id).tokens[0].x, 58);
    // Players don't see a place's table.
    const seen = (await t.request('GET', base, { as: t.sam.token })).json();
    assert.ok(seen.places.every((p) => !('encounters' in p)));

    // Encounters off, travel time skipped: he gets there at once and the clock jumps on by the journey.
    await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { travel: { encounters: false, time: 'skip' } } });
    const before = (await clock({})).json().clock;
    const back = (await t.request('POST', `${base}/tokens/${thorin.id}/journey`, { body: { x: 10, y: 150 } })).json();
    assert.equal(back.token.journey, null);
    assert.equal(back.token.x, 10);
    assert.equal(back.clock, before + 1440 + 8 * 60, 'two days of walking skipped (48 miles, 16 hours on the road)');
    // No travel time at all: the clock stays.
    await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { travel: { time: 'none', vehicles: false } } });
    const s = (await t.request('GET', `/campaigns/${t.campaign.id}`)).json().settings.travel;
    assert.deepEqual(s, { time: 'none', roads: true, terrain: true, vehicles: false, marches: true, encounters: false });
    const none = (await t.request('POST', `${base}/tokens/${thorin.id}/journey`, { body: { x: 100, y: 150, by: 'galley', preview: true } })).json().plan;
    assert.equal(none.by, 'foot', 'vehicles off: on foot');
    assert.equal(none.arrives, back.clock);
    assert.equal(map.id, back.map.id);
  } finally {
    await t.cleanup();
  }
});
