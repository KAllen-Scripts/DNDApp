/**
 * The world (owner, 2026-10-18: "We want to be able to make an entire world. Connected maps, a world map"):
 * maps shown to chosen players, and places on maps that open smaller maps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, terrain } from './helpers.js';
import { mapEvents } from '../src/maps/events.js';
import { atlasOrder, mapTrail, placeProblem } from '@dndapp/shared/map.js';

async function newMap(t, name) {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'map.png', name, data: (await terrain(400, 300)).toString('base64') } });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
}

test('world: the DM shows a map to chosen players; the others never get it, nor links to it', async () => {
  const t = await setup();
  try {
    const base = `/campaigns/${t.campaign.id}/maps`;
    const road = await newMap(t, 'Road');
    const tower = await newMap(t, 'Tower');
    await t.request('PATCH', `${base}/${road.id}`, { body: { shown: true } });
    await t.request('PATCH', `${base}/${road.id}/links`, { body: { add: { x: 10, y: 10, to: tower.id } } });
    const res = await t.request('PATCH', `${base}/${tower.id}`, { body: { shown: true, shown_to: [t.sam.id] } });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json().shown_to, [t.sam.id]);

    const names = async (as) => (await t.request('GET', base, { as })).json().maps.map((m) => m.name).sort();
    assert.deepEqual(await names(t.sam.token), ['Road', 'Tower']);
    assert.deepEqual(await names(t.alex.token), ['Road']);
    assert.equal((await t.request('GET', `${base}/${tower.id}`, { as: t.alex.token })).statusCode, 404);
    assert.equal((await t.request('GET', `${base}/${tower.id}/image`, { as: t.alex.token })).statusCode, 404);
    // Players don't learn who else it's shown to.
    assert.equal((await t.request('GET', `${base}/${tower.id}`, { as: t.sam.token })).json().shown_to, null);
    const linksFor = async (as) => (await t.request('GET', `${base}/${road.id}`, { as })).json().links.length;
    assert.equal(await linksFor(t.sam.token), 1);
    assert.equal(await linksFor(t.alex.token), 0);

    // Back to everyone.
    await t.request('PATCH', `${base}/${tower.id}`, { body: { shown_to: null } });
    assert.deepEqual(await names(t.alex.token), ['Road', 'Tower']);

    // Only the campaign's players can be picked, and only by the DM.
    assert.equal((await t.request('PATCH', `${base}/${tower.id}`, { body: { shown_to: [99999] } })).statusCode, 400);
    assert.equal((await t.request('PATCH', `${base}/${tower.id}`, { body: { shown_to: [t.sam.id] }, as: t.sam.token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('world: places on a map open smaller maps; players get only the ones revealed to them, never the record', async () => {
  const t = await setup();
  try {
    const base = `/campaigns/${t.campaign.id}/maps`;
    const region = await newMap(t, 'The Vale');
    const town = await newMap(t, 'Millbrook');
    const inn = await newMap(t, 'The Drowned Rat');
    await t.request('PATCH', `${base}/${region.id}`, { body: { shown: true } });
    const add = (on, place) => t.request('PATCH', `${base}/${on}/places`, { body: { add: place } });
    let res = await add(region.id, { name: 'Millbrook', x: 100, y: 120, group: 'Towns', to: town.id });
    assert.equal(res.statusCode, 200, res.body);
    const placeId = res.json().places[0].id;
    assert.equal(res.json().places[0].to_name, 'Millbrook');
    assert.equal(res.json().places[0].revealed, false);
    assert.equal((await add(town.id, { name: 'The Drowned Rat', x: 50, y: 50, points: [[40, 40], [60, 40], [60, 60], [40, 60]], to: inn.id })).statusCode, 200);

    // Each map is a place on one map only, and never inside itself.
    assert.match((await add(region.id, { name: 'Again', x: 1, y: 1, to: town.id })).json().error, /already a place/);
    assert.match((await add(inn.id, { name: 'Up', x: 1, y: 1, to: region.id })).json().error, /inside itself/);
    assert.equal((await add(region.id, { name: 'Itself', x: 1, y: 1, to: region.id })).statusCode, 400);
    assert.equal((await add(region.id, { name: 'Nope', x: 1, y: 1 })).statusCode, 200);
    assert.equal((await t.request('PATCH', `${base}/${region.id}/places`, { body: { add: { name: 'Mine', x: 1, y: 1 } }, as: t.sam.token })).statusCode, 403);

    const placesFor = async (as) => (await t.request('GET', `${base}/${region.id}`, { as })).json().places;
    assert.deepEqual(await placesFor(t.sam.token), [], 'not revealed yet');
    // Revealed to Sam only; the town isn't shown to anyone yet, so it opens nothing for him.
    res = await t.request('PATCH', `${base}/${region.id}/places`, { body: { set: { id: placeId, revealed: true, revealed_to: [t.sam.id] } } });
    assert.equal(res.statusCode, 200, res.body);
    let [seen] = await placesFor(t.sam.token);
    assert.equal(seen.name, 'Millbrook');
    assert.equal(seen.to, null);
    assert.equal(seen.revealed_to, null);
    assert.equal(seen.record, null);
    assert.deepEqual(await placesFor(t.alex.token), []);
    await t.request('PATCH', `${base}/${town.id}`, { body: { shown: true } });
    [seen] = await placesFor(t.sam.token);
    assert.equal(seen.to, town.id);
    assert.equal(seen.to_name, 'Millbrook');

    // Moving an area moves all of it.
    const area = t.maps.get(t.campaign.id, town.id).places[0];
    res = await t.request('PATCH', `${base}/${town.id}/places`, { body: { move: { id: area.id, x: 60, y: 70 } } });
    assert.deepEqual(res.json().places[0].points[0], [50, 60]);
    // Removing the place frees the town to go somewhere else.
    await t.request('PATCH', `${base}/${region.id}/places`, { body: { remove: placeId } });
    assert.equal((await add(inn.id, { name: 'Cellar town', x: 1, y: 1, to: town.id })).statusCode, 400, 'the inn is inside the town');
    assert.equal((await add(region.id, { name: 'Millbrook', x: 5, y: 5, to: town.id })).statusCode, 200);
  } finally {
    await t.cleanup();
  }
});

test('world: the breadcrumb and the DM\'s map list follow the places', () => {
  const maps = [
    { id: 'aaaaaaaaaa', name: 'World', places: [{ id: 'p1', to: 'bbbbbbbbbb' }] },
    { id: 'cccccccccc', name: 'Inn', places: [] },
    { id: 'bbbbbbbbbb', name: 'Town', places: [{ id: 'p2', to: 'cccccccccc' }] },
    { id: 'dddddddddd', name: 'Elsewhere', places: [] },
  ];
  assert.deepEqual(mapTrail(maps, 'cccccccccc').map((m) => m.name), ['World', 'Town', 'Inn']);
  assert.deepEqual(atlasOrder(maps).map(({ map, depth }) => `${depth}${map.name}`), ['0World', '1Town', '2Inn', '0Elsewhere']);
  assert.equal(placeProblem(maps, 'cccccccccc', 'aaaaaaaaaa'), 'That map is around this one already: a map can’t be inside itself.');
  assert.equal(placeProblem(maps, 'dddddddddd', 'cccccccccc').startsWith('That map is already a place on "Town"'), true);
  assert.equal(placeProblem(maps, 'aaaaaaaaaa', 'bbbbbbbbbb', 'p1'), '', 'the same place may keep its map');
});

test('world: map events on a map shown to some players say who saw them; shown to nobody, nothing', () => {
  const image = { file: 'image.png', type: 'image/png', width: 100, height: 100 };
  const at = (h, m = 0) => new Date(2026, 9, 8, h, m).toISOString();
  const histories = [{
    id: 'aaaaaaaaaa',
    entries: [
      { saved_at: at(19), changes: [{ p: [], v: { name: 'Tower', image, shown: true, shown_to: [], tokens: [] } }] },
      { saved_at: at(19, 5), changes: [{ p: ['tokens', 0], v: { id: 'gob001', name: 'Goblin', kind: 'enemy', x: 1, y: 1 } }] },
      { saved_at: at(19, 10), changes: [{ p: ['shown_to', 0], v: 3 }] },
      { saved_at: at(19, 20), changes: [{ p: ['tokens', 1], v: { id: 'orc001', name: 'Orc', kind: 'enemy', x: 1, y: 1 } }] },
    ],
  }];
  assert.deepEqual(mapEvents(histories, { date: '2026-10-08', rolloverHour: 6 }), [
    '[19:10] The DM showed the map "Tower". [seen only by user 3]',
    '[19:20] Orc (enemy) appeared on "Tower". [seen only by user 3]',
  ]);
});
