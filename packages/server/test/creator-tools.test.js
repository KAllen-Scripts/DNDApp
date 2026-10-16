/**
 * The map creator's bigger tools: secret doors, floors of a building
 * (levels) with stairs between them, starting points (generated maps and
 * the AI's draft from a description or sketch), stamps, and taking a map to
 * another VTT as a Universal VTT file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import { setup, createFakeLLM, fakeEmbedder, terrain } from './helpers.js';
import { createContext } from '../src/context.js';
import { mapEvents } from '../src/maps/events.js';
import { uvttContents } from '../src/maps/uvtt.js';
import { addRoom, addWall, emptyDesign } from '@dndapp/shared/map-design.js';

/** A 12 x 8 grass field with a 5 x 4 stone room: a door in its south wall, a secret door in its east wall, and a campfire outside. */
function roomDesign() {
  let d = emptyDesign(12, 8, 'g');
  d = addRoom(d, { x1: 1, y1: 1, x2: 6, y2: 5 }, 's');
  d = addWall(d, { x1: 3, y1: 5, x2: 4, y2: 5, type: 'door' });
  d = addWall(d, { x1: 6, y1: 2, x2: 6, y2: 3, type: 'secret' });
  d.assets = [{ id: 'fire01', a: 'campfire', x: 9.5, y: 2.5 }];
  return d;
}

const create = async (t, design = roomDesign(), name = 'Old watchpost') => {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps/design`, { body: { name, design } });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
};
const until = async (fn) => {
  for (let i = 0; i < 500; i += 1) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out');
};

test('secret doors: wall to players until found; the DM reveals or hides one, or makes any door secret; opening one finds it', async () => {
  const t = await setup({ llm: createFakeLLM() });
  try {
    const view = await create(t);
    const base = `/campaigns/${t.campaign.id}/maps/${view.id}`;
    const map = t.maps.get(t.campaign.id, view.id);
    const secret = map.walls.find((w) => w.secret);
    const door = map.walls.find((w) => w.door && !w.secret);
    assert.deepEqual([secret.x1, secret.y1, secret.x2, secret.y2, secret.door, secret.revealed], [420, 140, 420, 210, true, false]);

    // Shown, with Thorin in the room beside both doors.
    await t.request('PATCH', base, { body: { shown: true, fog: undefined } });
    await t.request('PATCH', `${base}/fog`, { body: { enabled: true, sight: true } });
    await t.request('POST', `${base}/tokens`, { body: { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 385, y: 175 } });
    const player = async () => (await t.request('GET', base, { as: t.sam.token })).json();
    assert.deepEqual((await player()).doors.map((d) => d.id), [door.id], 'the secret door is just wall to them');
    assert.equal((await t.request('POST', `${base}/doors/${secret.id}/toggle`, { as: t.sam.token })).statusCode, 404);

    // Found: players see it as a door and can open it.
    let res = await t.request('PATCH', `${base}/walls`, { body: { reveal: secret.id } });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual((await player()).doors.map((d) => d.id).sort(), [door.id, secret.id].sort());
    assert.equal((await t.request('POST', `${base}/doors/${secret.id}/toggle`, { as: t.sam.token })).json().doors.find((d) => d.id === secret.id).open, true);

    // Hidden again: shut, and wall to them once more.
    res = await t.request('PATCH', `${base}/walls`, { body: { reveal: secret.id } });
    assert.equal(res.json().walls.find((w) => w.id === secret.id).open, false);
    assert.deepEqual((await player()).doors.map((d) => d.id), [door.id]);

    // The DM opening it finds it for good.
    await t.request('POST', `${base}/doors/${secret.id}/toggle`);
    assert.equal(t.maps.get(t.campaign.id, view.id).walls.find((w) => w.id === secret.id).revealed, true);
    await t.request('POST', `${base}/doors/${secret.id}/toggle`);
    assert.ok((await player()).doors.some((d) => d.id === secret.id), 'still known once shut again');

    // Any door can be made secret, and plain again; only doors, and only secret ones can be revealed.
    res = await t.request('PATCH', `${base}/walls`, { body: { secret: door.id } });
    assert.deepEqual(res.json().walls.filter((w) => w.secret).map((w) => w.id).sort(), [door.id, secret.id].sort());
    res = await t.request('PATCH', `${base}/walls`, { body: { secret: door.id } });
    assert.equal(res.json().walls.find((w) => w.id === door.id).secret, undefined);
    const wall = map.walls.find((w) => !w.door);
    assert.equal((await t.request('PATCH', `${base}/walls`, { body: { secret: wall.id } })).statusCode, 400);
    assert.equal((await t.request('PATCH', `${base}/walls`, { body: { reveal: door.id } })).statusCode, 400);
    assert.equal((await t.request('PATCH', `${base}/walls`, { body: { reveal: secret.id }, as: t.sam.token })).statusCode, 403);

    // Saved again in the creator, a found secret door stays found.
    const design = (await t.request('GET', `${base}/design`)).json().design;
    await t.request('PUT', `${base}/design`, { body: { design } });
    const after = t.maps.get(t.campaign.id, view.id).walls.find((w) => w.secret);
    assert.equal(after.id, secret.id);
    assert.equal(after.revealed, true);
  } finally {
    await t.cleanup();
  }
});

test('mapEvents: a secret door found is told to the archivist (once)', () => {
  const image = { file: 'image.png', type: 'image/png', width: 100, height: 100 };
  const at = (m) => new Date(2026, 9, 8, 19, m).toISOString();
  const secret = { id: 'door01', x1: 0, y1: 0, x2: 10, y2: 0, door: true, secret: true, revealed: false };
  const histories = [{
    id: 'aaaaaaaaaa',
    entries: [
      { saved_at: at(0), changes: [{ p: [], v: { name: 'Crypt', image, shown: true, walls: [secret] } }] },
      { saved_at: at(5), changes: [{ p: ['walls', 0, 'revealed'], v: true }] },
      { saved_at: at(6), changes: [{ p: ['walls', 0, 'open'], v: true }] },
    ],
  }];
  assert.deepEqual(mapEvents(histories, { date: '2026-10-08', rolloverHour: 6 }), [
    '[19:00] The DM showed the map "Crypt".',
    '[19:05] A secret door was found on "Crypt".',
    '[19:06] A door was opened on "Crypt".',
  ]);
});

test('floors of a building: added above or below a made map, and stairs between them arrive at the matching place', async () => {
  const t = await setup({ llm: createFakeLLM() });
  try {
    const ground = await create(t, roomDesign(), 'Watchtower');
    const levels = `/campaigns/${t.campaign.id}/maps/${ground.id}/levels`;
    let res = await t.request('POST', levels, { body: { n: 1 } });
    assert.equal(res.statusCode, 201, res.body);
    const upper = res.json();
    assert.equal(upper.name, 'Watchtower (First floor)');
    assert.deepEqual(upper.level, { group: ground.id, n: 1 });
    assert.equal(upper.shown, false);
    assert.deepEqual(t.maps.get(t.campaign.id, ground.id).level, { group: ground.id, n: 0 }, 'the first map becomes the ground floor');
    const upperDesign = (await t.request('GET', `/campaigns/${t.campaign.id}/maps/${upper.id}/design`)).json().design;
    const groundDesign = (await t.request('GET', `/campaigns/${t.campaign.id}/maps/${ground.id}/design`)).json().design;
    assert.deepEqual(upperDesign.floor, groundDesign.floor, 'a copy of its floor');
    assert.equal(upperDesign.walls.length, groundDesign.walls.length, 'and walls');
    assert.deepEqual(upperDesign.assets, [], 'but nothing in it');

    // A cellar, empty; from the first floor, in the same building.
    res = await t.request('POST', `/campaigns/${t.campaign.id}/maps/${upper.id}/levels`, { body: { n: -1, start: 'empty' } });
    assert.equal(res.statusCode, 201, res.body);
    const cellar = res.json();
    assert.equal(cellar.name, 'Watchtower (Cellar)');
    assert.deepEqual(cellar.level, { group: ground.id, n: -1 });
    assert.ok((await t.request('GET', `/campaigns/${t.campaign.id}/maps/${cellar.id}/design`)).json().design.floor.every((l) => /^\.+$/.test(l)));

    // One of each floor; only made maps; DM only.
    assert.equal((await t.request('POST', levels, { body: { n: 1 } })).statusCode, 400);
    assert.equal((await t.request('POST', levels, { body: { n: 0 } })).statusCode, 400);
    assert.equal((await t.request('POST', levels, { body: { n: 2 }, as: t.sam.token })).statusCode, 403);
    const imported = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'm.png', data: (await terrain(200, 140)).toString('base64') } });
    assert.equal((await t.request('POST', `/campaigns/${t.campaign.id}/maps/${imported.json().id}/levels`, { body: { n: 1 } })).statusCode, 400);

    // Stairs up in the room, a trapdoor down; on the first floor two ways back down.
    groundDesign.assets.push({ id: 'stair1', a: 'stairs', x: 2.5, y: 2.5, to: upper.id }, { id: 'trap01', a: 'trapdoor', x: 4.5, y: 3.5, to: cellar.id, label: 'Hatch' });
    assert.equal((await t.request('PUT', `/campaigns/${t.campaign.id}/maps/${ground.id}/design`, { body: { design: groundDesign } })).statusCode, 200);
    upperDesign.assets.push({ id: 'down01', a: 'stairs_down', x: 9.5, y: 6.5, to: ground.id }, { id: 'down02', a: 'stairs_down', x: 3.5, y: 2.5, to: ground.id });
    assert.equal((await t.request('PUT', `/campaigns/${t.campaign.id}/maps/${upper.id}/design`, { body: { design: upperDesign } })).statusCode, 200);
    const links = t.maps.get(t.campaign.id, ground.id).links;
    assert.deepEqual(links.map(({ x, y, to, label, source }) => ({ x, y, to, label, source })), [
      { x: 175, y: 175, to: upper.id, label: 'Stairs up', source: 'creator' },
      { x: 315, y: 245, to: cellar.id, label: 'Hatch', source: 'creator' },
    ]);

    // Saved again, the links keep their ids.
    await t.request('PUT', `/campaigns/${t.campaign.id}/maps/${ground.id}/design`, { body: { design: groundDesign } });
    assert.deepEqual(t.maps.get(t.campaign.id, ground.id).links.map((l) => l.id), links.map((l) => l.id));

    // Up the stairs: to the nearest way back down (not the middle of the map).
    const tok = (await t.request('POST', `/campaigns/${t.campaign.id}/maps/${ground.id}/tokens`, { body: { kind: 'npc', name: 'Guard', x: 175, y: 175 } })).json().token;
    res = await t.request('POST', `/campaigns/${t.campaign.id}/maps/${ground.id}/links/${links[0].id}/use`, { body: { token: tok.id } });
    assert.equal(res.statusCode, 200, res.body);
    const there = res.json().map.tokens.find((x) => x.id === res.json().token);
    assert.deepEqual([there.x, there.y], [245, 175]);

    // Down the hatch to the cellar, which has no way back: the same spot.
    const tok2 = (await t.request('POST', `/campaigns/${t.campaign.id}/maps/${ground.id}/tokens`, { body: { kind: 'npc', name: 'Cook', x: 315, y: 245 } })).json().token;
    res = await t.request('POST', `/campaigns/${t.campaign.id}/maps/${ground.id}/links/${links[1].id}/use`, { body: { token: tok2.id } });
    const below = res.json().map.tokens.find((x) => x.id === res.json().token);
    assert.deepEqual([below.x, below.y], [315, 245]);

    // A thing can't lead to its own map, or to one that isn't there.
    groundDesign.assets.push({ id: 'bad001', a: 'ladder', x: 8, y: 6, to: ground.id });
    assert.equal((await t.request('PUT', `/campaigns/${t.campaign.id}/maps/${ground.id}/design`, { body: { design: groundDesign } })).statusCode, 400);
    groundDesign.assets.at(-1).to = '0123456789';
    assert.equal((await t.request('PUT', `/campaigns/${t.campaign.id}/maps/${ground.id}/design`, { body: { design: groundDesign } })).statusCode, 400);
  } finally {
    await t.cleanup();
  }
});

test('starting points: the kinds of map, and a generated one (the same seed makes the same map)', async () => {
  const t = await setup({ llm: createFakeLLM() });
  try {
    const kinds = (await t.request('GET', `/campaigns/${t.campaign.id}/maps/design/kinds`)).json().kinds;
    assert.deepEqual(kinds.map((k) => k.key), ['dungeon', 'cave', 'forest', 'village', 'tavern', 'camp', 'crypt', 'crossing', 'ship', 'docks', 'temple', 'farm', 'mine', 'graveyard', 'tower', 'castle', 'sewer', 'lair']);
    assert.ok(kinds.every((k) => k.name && k.about && k.cols >= 16 && k.rows >= 12));
    const url = `/campaigns/${t.campaign.id}/maps/design/generate`;
    const a = (await t.request('POST', url, { body: { kind: 'tavern', seed: 42 } })).json();
    const b = (await t.request('POST', url, { body: { kind: 'tavern', seed: 42 } })).json();
    assert.equal(a.name, 'Tavern');
    assert.equal(a.seed, 42);
    assert.deepEqual(a.design.floor, b.design.floor);
    assert.deepEqual(a.design.walls.map(({ id: _id, ...w }) => w), b.design.walls.map(({ id: _id, ...w }) => w));
    assert.ok(a.design.walls.some((w) => w.type === 'door'));
    const c = (await t.request('POST', url, { body: { kind: 'cave', cols: 20, rows: 16 } })).json();
    assert.ok(c.seed >= 1);
    assert.deepEqual([c.design.cols, c.design.rows], [20, 16]);
    assert.equal((await t.request('POST', url, { body: { kind: 'spaceship' } })).statusCode, 400);
    assert.equal((await t.request('POST', url, { body: { kind: 'cave' }, as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/maps/design/kinds`, { as: t.sam.token })).statusCode, 403);

    // Saved like any design, with its paths, labels and look.
    const v = await create(t, a.design, 'The Prancing Pony');
    const back = (await t.request('GET', `/campaigns/${t.campaign.id}/maps/${v.id}/design`)).json().design;
    assert.deepEqual(back.look, a.design.look);
    assert.equal(back.assets.length, a.design.assets.length);
  } finally {
    await t.cleanup();
  }
});

/** What the AI plans for "a small inn by a road" (as the real one would answer). */
const PLAN = {
  name: 'The Wayside Inn',
  cols: 20, rows: 14,
  ground: 'grass',
  areas: [{ shape: 'oval', x: 14, y: 1, w: 5, h: 4, floor: 'water' }, { shape: 'rect', x: 0, y: 11, w: 20, h: 3, floor: 'dirt' }],
  rooms: [
    { name: 'common room', x: 2, y: 2, w: 7, h: 6, floor: 'wooden_boards', walls: 'wood', doors: [{ side: 'south', at: 3, type: 'door' }, { side: 'west', at: 2, type: 'window' }] },
    { name: 'kitchen', x: 9, y: 2, w: 4, h: 4, floor: 'flagstones', walls: 'wood', doors: [{ side: 'west', at: 1, type: 'door' }, { side: 'north', at: 2, type: 'secret' }] },
    { name: 'store', x: 9, y: 6, w: 4, h: 2, floor: 'flagstones', walls: 'wood', doors: [{ side: 'north', at: 1, type: 'arch' }, { side: 'south', at: 9, type: 'door' }] },
  ],
  walls: [{ points: [{ x: 14, y: 6 }, { x: 19, y: 6 }, { x: 19, y: 10 }], type: 'low', style: 'wood' }],
  paths: [{ kind: 'road', width: null, points: [{ x: 0, y: 12.5 }, { x: 20, y: 12.5 }] }, { kind: 'trail', width: 0.6, points: [{ x: 5.5, y: 8 }, { x: 5.5, y: 12 }] }],
  things: [
    { asset: 'bar', x: 4.5, y: 2.6, turn: 0, w: null, h: null, tint: null },
    { asset: 'fireplace', x: 8.45, y: 5, turn: 90, w: null, h: null, tint: null },
    { asset: 'rug', x: 5, y: 5.5, turn: 0, w: 2, h: 1.5, tint: '#3c5a8a' },
    { asset: 'stove', x: 11, y: 2.55, turn: 0, w: null, h: null, tint: null },
  ],
  scatter: [{ asset: 'tree', x: 13, y: 0, w: 7, h: 11, count: 6 }, { asset: 'tree', x: 2, y: 2, w: 6, h: 5, count: 5 }],
  labels: [{ text: 'The Wayside Inn', x: 5.5, y: 9.5, size: null, font: 'old' }],
  look: { mood: 'dusk', grid: 'faint' },
  notes: 'I put the stables off the map.',
};

test("the AI's draft: a map planned from the DM's description (and sketch), made into a design to open in the creator", async () => {
  const llm = createFakeLLM({ structured: async () => PLAN });
  const t = await setup({ llm });
  try {
    const url = `/campaigns/${t.campaign.id}/maps/design/draft`;
    const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#ffffff' } }).png().toBuffer();
    let res = await t.request('POST', url, { body: { prompt: 'A small inn by a road, with a kitchen and a store room.', sketch: png.toString('base64') } });
    assert.equal(res.statusCode, 202, res.body);
    const { id } = res.json();
    const done = await until(async () => {
      const d = (await t.request('GET', `${url}/${id}`)).json();
      return d.status !== 'pending' && d;
    });
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.name, 'The Wayside Inn');
    assert.equal(done.notes, 'I put the stables off the map.');
    const d = done.design;
    assert.deepEqual([d.cols, d.rows], [20, 14]);
    assert.equal(d.floor[0][0], 'g');
    assert.equal(d.floor[3][3], 'w', 'the common room has wooden boards');
    assert.equal(d.floor[3][10], 'f', 'the kitchen flagstones');
    assert.equal(d.floor[12][0], 'd');
    assert.ok(d.floor.some((l) => l.includes('W')), 'the pond');
    // The rooms walled where they meet anything else (shared walls once), with their doors cut in.
    const at = (type) => d.walls.filter((w) => w.type === type).map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2]);
    assert.deepEqual(at('door'), [[5, 8, 6, 8], [12, 8, 13, 8], [9, 3, 9, 4]], "the store's door past the end of its side goes at the end");
    assert.deepEqual(at('window'), [[2, 4, 2, 5]]);
    assert.deepEqual(at('secret'), [[11, 2, 12, 2]]);
    assert.deepEqual(at('arch'), [[10, 6, 11, 6]]);
    assert.equal(at('low').length, 2);
    assert.ok(d.walls.filter((w) => w.type === 'wall').every((w) => w.style === 'wood' || w.style === 'stone'));
    // Things where the AI put them; scattered trees kept out of the rooms.
    assert.deepEqual(d.assets.filter((a) => a.a !== 'tree').map((a) => [a.a, a.x, a.y, a.rot]), [['bar', 4.5, 2.6, 0], ['fireplace', 8.45, 5, 90], ['rug', 5, 5.5, 0], ['stove', 11, 2.55, 0]]);
    assert.equal(d.assets.find((a) => a.a === 'rug').tint, '#3c5a8a');
    const trees = d.assets.filter((a) => a.a === 'tree');
    assert.ok(trees.length >= 2);
    assert.ok(trees.every((a) => a.x >= 13 && !(d.floor[Math.floor(a.y)][Math.floor(a.x)] === 'W')), 'none in the rooms or the pond');
    assert.deepEqual(d.paths.map((p) => [p.kind, p.w]), [['road', 1.6], ['trail', 0.6]]);
    assert.deepEqual(d.labels.map((l) => [l.text, l.size, l.font]), [['The Wayside Inn', 0.8, 'old']]);
    assert.deepEqual(d.look, { void: '#17161a', grid: 'faint', shadows: true, glow: true, mood: 'dusk', soft: true });

    // What the AI was asked: the design task, every asset and floor, the description, and the sketch to follow.
    const call = llm.calls.find((c) => c.purpose === 'map:design');
    assert.equal(call.task, 'design');
    assert.match(call.system, /- campfire: Campfire \(1 x 1, gives light\)/);
    assert.match(call.system, /- wooden_boards: built/);
    assert.match(call.prompt, /A small inn by a road/);
    assert.match(call.prompt, /Size: your choice/);
    assert.match(call.prompt, /sketch is attached/);
    assert.equal(call.attachments.length, 1);
    assert.equal(call.attachments[0].media_type, 'image/jpeg');

    // Saved as it came: an ordinary made map.
    const saved = await create(t, d, done.name);
    assert.equal(saved.image.width, 1400);

    // The DM's own size wins.
    res = await t.request('POST', url, { body: { prompt: 'The same, but bigger.', cols: 30, rows: 24 } });
    const big = await until(async () => {
      const x = (await t.request('GET', `${url}/${res.json().id}`)).json();
      return x.status !== 'pending' && x;
    });
    assert.deepEqual([big.design.cols, big.design.rows], [30, 24]);
    assert.match(llm.calls.at(-1).prompt, /Size: 30 x 24 squares/);
    assert.equal(llm.calls.at(-1).attachments.length, 0);

    // Only the DM; drafts are the campaign's; a size has both sides; the sketch must be a picture.
    assert.equal((await t.request('POST', url, { body: { prompt: 'A cave.' }, as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('GET', `${url}/${id}`, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('GET', `${url}/0123456789abcdef`)).statusCode, 404);
    assert.equal((await t.request('POST', url, { body: { prompt: 'A cave.', cols: 20 } })).statusCode, 400);
    assert.equal((await t.request('POST', url, { body: { prompt: 'A cave.', sketch: Buffer.from('not a picture').toString('base64') } })).statusCode, 400);
  } finally {
    await t.cleanup();
  }
});

test("the AI's draft: a failure is shown, and two at once is the most", async () => {
  let release;
  const wait = new Promise((r) => { release = r; });
  let n = 0;
  const llm = createFakeLLM({
    structured: async () => {
      n += 1;
      if (n === 1) throw new Error('overloaded');
      await wait;
      return PLAN;
    },
  });
  const t = await setup({ llm });
  try {
    const url = `/campaigns/${t.campaign.id}/maps/design/draft`;
    const failed = (await t.request('POST', url, { body: { prompt: 'A crypt.' } })).json();
    const f = await until(async () => {
      const d = (await t.request('GET', `${url}/${failed.id}`)).json();
      return d.status !== 'pending' && d;
    });
    assert.equal(f.status, 'failed');
    assert.match(f.error, /^The AI couldn't draft this map/);
    assert.equal(f.design, null);
    assert.equal((await t.request('POST', url, { body: { prompt: 'A crypt.' } })).statusCode, 202);
    assert.equal((await t.request('POST', url, { body: { prompt: 'A crypt.' } })).statusCode, 202);
    const third = await t.request('POST', url, { body: { prompt: 'A crypt.' } });
    assert.equal(third.statusCode, 400);
    assert.match(third.json().error, /already drafting/);
    release();
  } finally {
    release();
    await t.cleanup();
  }
});

test("stamps: the built-in ones, the DM's own kept, renamed and taken off the list, and back from the archive", async () => {
  const t = await setup({ llm: createFakeLLM() });
  try {
    const url = `/campaigns/${t.campaign.id}/map-stamps`;
    let list = (await t.request('GET', url)).json();
    assert.equal(list.builtIn.length, 35);
    assert.ok(list.builtIn.every((s) => s.id.startsWith('b:') && s.name && s.group && s.clip.cols >= 1));
    assert.deepEqual(list.stamps, []);

    const clip = {
      cols: 3, rows: 2,
      floor: ['www', 'w.w'],
      walls: [{ x1: 0, y1: 0, x2: 3, y2: 0, type: 'wall', style: 'wood' }],
      assets: [{ a: 'bed', x: 0.5, y: 1, to: '0123456789' }, { a: 'chest', x: 2.5, y: 1.5 }, { a: 'chest', x: 9, y: 9 }],
      paths: [],
      labels: [{ text: 'Guest room', x: 1.5, y: 1 }],
    };
    const res = await t.request('POST', url, { body: { name: 'Guest room', clip } });
    assert.equal(res.statusCode, 201, res.body);
    const stamp = res.json();
    assert.equal(stamp.name, 'Guest room');
    assert.deepEqual(stamp.clip.floor, ['www', 'w.w']);
    assert.deepEqual(stamp.clip.assets.map((a) => [a.a, a.to]), [['bed', null], ['chest', null]], 'nothing off the clip, nowhere to lead');
    assert.equal(stamp.created_by, undefined);
    assert.equal((await t.request('POST', url, { body: { name: 'Nothing', clip: { cols: 2, rows: 2, floor: ['..', '..'], walls: [], assets: [] } } })).statusCode, 400);
    assert.equal((await t.request('POST', url, { body: { name: 'Theirs', clip: { ...clip, assets: [{ a: 'u:0123456789', x: 1, y: 1 }] } } })).statusCode, 400);
    assert.equal((await t.request('PATCH', `${url}/${stamp.id}`, { body: { name: 'Spare room' } })).json().name, 'Spare room');
    list = (await t.request('GET', url)).json();
    assert.deepEqual(list.stamps.map((s) => s.name), ['Spare room']);

    // The DM's alone.
    assert.equal((await t.request('GET', url, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('POST', url, { as: t.sam.token, body: { name: 'x', clip } })).statusCode, 403);

    // Taken off the list, but kept in the archive.
    assert.equal((await t.request('DELETE', `${url}/${stamp.id}`)).statusCode, 200);
    assert.deepEqual((await t.request('GET', url)).json().stamps, []);
    assert.equal((await t.request('PATCH', `${url}/${stamp.id}`, { body: { name: 'Back' } })).statusCode, 404);
    const paths = { archive: t.archive.root, db: path.join(t.dir, 'fresh.sqlite'), models: path.join(t.dir, 'models') };
    const ctx = await createContext({ config: t.config, paths, llm: createFakeLLM(), embedder: fakeEmbedder, log: { error() {} } });
    try {
      const cid = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      const back = ctx.mapStamps.get(cid, stamp.id, { removed: true });
      assert.equal(back.name, 'Spare room');
      assert.deepEqual(back.clip.floor, ['www', 'w.w']);
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }
  } finally {
    await t.cleanup();
  }
});

test('a map taken to another VTT: a Universal VTT file with its picture, grid, walls, doors and lights, that reads back the same', async () => {
  const t = await setup({ llm: createFakeLLM() });
  try {
    const view = await create(t);
    const res = await t.request('GET', `/campaigns/${t.campaign.id}/maps/${view.id}/export.dd2vtt`);
    assert.equal(res.statusCode, 200, res.body);
    assert.match(res.headers['content-disposition'], /^attachment; filename="Old watchpost\.dd2vtt"/);
    const doc = res.json();
    assert.equal(doc.format, 0.3);
    assert.deepEqual(doc.resolution, { map_origin: { x: 0, y: 0 }, map_size: { x: 12, y: 8 }, pixels_per_grid: 70 });
    const map = t.maps.get(t.campaign.id, view.id);
    const sight = map.walls.filter((w) => !w.door && w.kind === 'wall');
    assert.equal(doc.line_of_sight.length, sight.length);
    assert.deepEqual(doc.portals.map((p) => [p.bounds, p.closed]), [
      [[{ x: 3, y: 5 }, { x: 4, y: 5 }], true],
      [[{ x: 6, y: 2 }, { x: 6, y: 3 }], true],
    ]);
    assert.deepEqual(doc.lights.map((l) => [l.position, l.range]), [[{ x: 9.5, y: 2.5 }, 8]]);
    const meta = await sharp(Buffer.from(doc.image, 'base64')).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['png', 840, 560]);

    // Read back (as an import would), the same walls, doors and light.
    const back = uvttContents(doc, { width: 840, height: 560 });
    const key = (w) => [w.x1, w.y1, w.x2, w.y2, w.door].join();
    assert.deepEqual(back.walls.map(key).sort(), map.walls.filter((w) => w.door || w.kind === 'wall').map(key).sort());
    assert.deepEqual(back.lights, [{ x: 665, y: 175, bright: 20, dim: 20 }]);
    assert.deepEqual(back.grid, { size: 70, x: 0, y: 0 });

    // A map with no grid can't be; players can't.
    const imported = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'm.png', data: (await terrain(200, 140)).toString('base64') } });
    await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${imported.json().id}`, { body: { grid: null } });
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/maps/${imported.json().id}/export.dd2vtt`)).statusCode, 400);
    await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${view.id}`, { body: { shown: true } });
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/maps/${view.id}/export.dd2vtt`, { as: t.sam.token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('regression: saving a map again in the creator keeps the scale the DM set on it', async () => {
  const t = await setup({ llm: createFakeLLM() });
  try {
    const view = await create(t);
    const base = `/campaigns/${t.campaign.id}/maps/${view.id}`;
    assert.deepEqual(t.maps.get(t.campaign.id, view.id).scale, { distance: 5, unit: 'ft', per: 'square' }, 'a new one: 5 ft squares');
    await t.request('PATCH', base, { body: { scale: { distance: 2.5, unit: 'ft', per: 'square' } } });
    const design = (await t.request('GET', `${base}/design`)).json().design;
    await t.request('PUT', `${base}/design`, { body: { design } });
    assert.deepEqual(t.maps.get(t.campaign.id, view.id).scale, { distance: 2.5, unit: 'ft', per: 'square' });
  } finally {
    await t.cleanup();
  }
});

test('heights from the creator: a raised room and a round tower become raised areas, the tower round', async () => {
  const t = await setup({ llm: createFakeLLM() });
  try {
    const { addCircle, fillHeight } = await import('@dndapp/shared/map-design.js');
    let d = fillHeight(roomDesign(), 3, 3, 10);
    d = fillHeight(addCircle(d, { cx: 9, cy: 5, r: 2 }), 9, 5, 30);
    const view = await create(t, d);
    const raised = t.maps.get(t.campaign.id, view.id).raised;
    assert.deepEqual(raised.map((r) => [r.height, r.points.length, r.source]), [[30, 32, 'creator'], [10, 4, 'creator']]);
    assert.deepEqual(raised[1].points, [[70, 70], [420, 70], [420, 350], [70, 350]]);
    assert.deepEqual(raised[0].points[0], [770, 350], 'on the circle: 2 squares right of its middle');
  } finally {
    await t.cleanup();
  }
});
