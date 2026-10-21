/**
 * The world, second stage: where everyone is (owner, 2026-10-18: "We don't want one token for the whole
 * party, because they won't always all travel as one"). A character is on one map at a time, tokens can
 * follow each other and go along, and places can be gone into and left.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, terrain } from './helpers.js';
import { arrivalSpots, characterMap, followGroup, followLoop, trailFollowers } from '@dndapp/shared/map.js';

async function newMap(t, name, patch = { shown: true }) {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'map.png', name, data: (await terrain(400, 300)).toString('base64') } });
  assert.equal(res.statusCode, 201, res.body);
  await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${res.json().id}`, { body: patch });
  return res.json();
}

const tokensOn = (t, map) => t.maps.get(t.campaign.id, map.id).tokens;

async function addToken(t, map, body) {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps/${map.id}/tokens`, { body });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().token;
}

test('world: a character is on one map at a time; adding them elsewhere brings their token and their followers', async () => {
  const t = await setup();
  try {
    const road = await newMap(t, 'Road');
    const tower = await newMap(t, 'Tower');
    const thorin = await addToken(t, road, { kind: 'pc', user_id: t.sam.id, name: 'Thorin', x: 100, y: 100 });
    // Sam's wolf follows Thorin from the start.
    const wolf = (await t.request('POST', `/campaigns/${t.campaign.id}/maps/${road.id}/tokens`, { body: { name: 'Wolf' }, as: t.sam.token })).json().token;
    assert.equal(wolf.follows, thorin.id);
    const goblin = await addToken(t, road, { kind: 'enemy', name: 'Goblin', x: 300, y: 200 });

    // The party panel's Bring here: the DM adds Thorin on the tower.
    const moved = await addToken(t, tower, { kind: 'pc', user_id: t.sam.id, name: 'Thorin', x: 200, y: 150 });
    assert.equal(moved.id, thorin.id, 'the same token, with its hit points and all');
    assert.deepEqual(tokensOn(t, road).map((x) => x.name), ['Goblin']);
    assert.deepEqual(tokensOn(t, tower).map((x) => [x.name, x.follows]), [['Thorin', null], ['Wolf', thorin.id]]);
    assert.equal(characterMap(t.maps.list(t.campaign.id), t.sam.id).id, tower.id);

    // Adding him where he is just moves him there.
    await addToken(t, tower, { kind: 'pc', user_id: t.sam.id, name: 'Thorin', x: 50, y: 50 });
    assert.equal(tokensOn(t, tower).filter((x) => x.kind === 'pc').length, 1);

    // Turning the goblin into Thorin would put him on two maps.
    const res = await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${road.id}/tokens/${goblin.id}`, { body: { kind: 'pc', user_id: t.sam.id } });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /on "Tower" already/);
  } finally {
    await t.cleanup();
  }
});

test('world: a token follows another, walking behind it, and stops when moved on its own', async () => {
  const t = await setup();
  try {
    const road = await newMap(t, 'Road');
    const base = `/campaigns/${t.campaign.id}/maps/${road.id}/tokens`;
    const thorin = await addToken(t, road, { kind: 'pc', user_id: t.sam.id, name: 'Thorin', x: 100, y: 150 });
    const lyra = await addToken(t, road, { kind: 'pc', user_id: t.alex.id, name: 'Lyra', x: 60, y: 150 });
    // Only Alex picks whom Lyra follows.
    assert.equal((await t.request('PATCH', `${base}/${lyra.id}`, { body: { follows: thorin.id }, as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('PATCH', `${base}/${lyra.id}`, { body: { follows: thorin.id }, as: t.alex.token })).statusCode, 200);
    // No circles.
    assert.equal((await t.request('PATCH', `${base}/${thorin.id}`, { body: { follows: lyra.id }, as: t.sam.token })).statusCode, 400);

    await t.request('PATCH', `${base}/${thorin.id}`, { body: { x: 300, y: 150 }, as: t.sam.token });
    let l = tokensOn(t, road).find((x) => x.id === lyra.id);
    assert.ok(l.x > 200 && l.x < 300, `Lyra walks behind Thorin (${l.x})`);
    assert.equal(l.follows, thorin.id);

    // In a fight, nobody is dragged along.
    t.maps.change(t.campaign.id, road.id, (m) => {
      m.combat = { round: 1, turn: null, entries: [{ id: thorin.id, init: 10 }] };
    });
    const before = l.x;
    await t.request('PATCH', `${base}/${thorin.id}`, { body: { x: 350, y: 150 }, as: t.sam.token });
    assert.equal(tokensOn(t, road).find((x) => x.id === lyra.id).x, before);

    await t.request('PATCH', `${base}/${lyra.id}`, { body: { x: 40, y: 40 }, as: t.alex.token });
    l = tokensOn(t, road).find((x) => x.id === lyra.id);
    assert.equal(l.follows, null, 'moved on her own, she stops following');
  } finally {
    await t.cleanup();
  }
});

test('world: through a link, into a place and back out, whoever follows goes along', async () => {
  const t = await setup();
  try {
    const vale = await newMap(t, 'The Vale');
    const town = await newMap(t, 'Millbrook');
    const cellar = await newMap(t, 'Cellar', { shown: false });
    const campaign = `/campaigns/${t.campaign.id}/maps`;
    const place = (await t.request('PATCH', `${campaign}/${vale.id}/places`, { body: { add: { name: 'Millbrook', x: 200, y: 150, to: town.id, revealed: true } } })).json().places[0];
    const thorin = await addToken(t, vale, { kind: 'pc', user_id: t.sam.id, name: 'Thorin', x: 50, y: 50 });
    const lyra = await addToken(t, vale, { kind: 'pc', user_id: t.alex.id, name: 'Lyra', x: 60, y: 60 });
    await t.request('PATCH', `${campaign}/${vale.id}/tokens/${lyra.id}`, { body: { follows: thorin.id }, as: t.alex.token });

    const enter = (as) => t.request('POST', `${campaign}/${vale.id}/places/${place.id}/enter`, { body: { token: thorin.id }, as });
    let res = await enter(t.sam.token);
    assert.equal(res.statusCode, 400, 'too far from the town');
    assert.match(res.json().error, /to Millbrook first/);
    assert.equal((await enter(t.alex.token)).statusCode, 403, 'not her character');
    await t.request('PATCH', `${campaign}/${vale.id}/tokens/${thorin.id}`, { body: { x: 205, y: 150 }, as: t.sam.token });
    res = await enter(t.sam.token);
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(tokensOn(t, vale), []);
    const inTown = tokensOn(t, town);
    assert.deepEqual(inTown.map((x) => x.name), ['Thorin', 'Lyra']);
    assert.deepEqual([inTown[0].x, inTown[0].y], [200, 150], 'the middle of the town (it has no way out to the vale)');

    // Back out: they come out at the town on the vale.
    res = await t.request('POST', `${campaign}/${town.id}/leave`, { body: { token: thorin.id }, as: t.sam.token });
    assert.equal(res.statusCode, 200, res.body);
    const out = tokensOn(t, vale);
    assert.deepEqual(out.map((x) => x.name), ['Thorin', 'Lyra']);
    assert.deepEqual([out[0].x, out[0].y], [200, 150]);
    assert.equal(out[1].follows, out[0].id);

    // A map with nothing around it has no leaving; a map nobody's shown can't be gone into.
    assert.equal((await t.request('POST', `${campaign}/${vale.id}/leave`, { body: { token: thorin.id } })).statusCode, 400);
    const door = (await t.request('PATCH', `${campaign}/${town.id}/places`, { body: { add: { name: 'Cellar door', x: 10, y: 10, to: cellar.id, revealed: true } } })).json().places[0];
    await t.request('POST', `${campaign}/${vale.id}/places/${place.id}/enter`, { body: { token: thorin.id } });
    const sam = tokensOn(t, town).find((x) => x.name === 'Thorin');
    await t.request('PATCH', `${campaign}/${town.id}/tokens/${sam.id}`, { body: { x: 10, y: 10 }, as: t.sam.token });
    assert.equal((await t.request('POST', `${campaign}/${town.id}/places/${door.id}/enter`, { body: { token: sam.id }, as: t.sam.token })).statusCode, 404);

    // With a way out to the vale, a player has to stand at it to leave.
    await t.request('PATCH', `${campaign}/${town.id}/links`, { body: { add: { x: 390, y: 290, to: vale.id } } });
    res = await t.request('POST', `${campaign}/${town.id}/leave`, { body: { token: sam.id }, as: t.sam.token });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /way out/);
  } finally {
    await t.cleanup();
  }
});

test('world: following, trailing and arriving, worked out', () => {
  const map = { image: { width: 1000, height: 1000 }, grid: null, tokens: [] };
  const tok = (id, x, follows = null) => ({ id, x, y: 500, size: 1, follows });
  map.tokens = [tok('a', 600), tok('b', 100, 'a'), tok('c', 50, 'b'), tok('d', 900)];
  assert.deepEqual(followGroup(map.tokens, 'a').map((x) => x.id), ['a', 'b', 'c']);
  assert.equal(followLoop(map.tokens, 'a', 'c'), true);
  assert.equal(followLoop(map.tokens, 'd', 'a'), false);
  // a walked from 100 to 600 (b was at its heels at 100); b and c line up behind it.
  map.tokens[1].x = 100;
  trailFollowers(map, 'a', [{ x: 100, y: 500 }, { x: 600, y: 500 }]);
  const px = 1000 * 0.025;
  const [, b, c] = map.tokens;
  assert.ok(Math.abs(b.x - (600 - px)) < 1e-6 && Math.abs(c.x - (600 - 2 * px)) < 1e-6, `${b.x} ${c.x}`);
  const spots = arrivalSpots(map, map.tokens.slice(0, 3), { x: 500, y: 500 });
  assert.deepEqual(spots[0], { x: 500, y: 500 });
  assert.equal(new Set(spots.map((s) => `${s.x},${s.y}`)).size, 3, 'no two on the same spot');
});
