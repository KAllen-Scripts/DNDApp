import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup, createFakeLLM, fakeEmbedder } from './helpers.js';
import { createContext } from '../src/context.js';
import { detectGrid } from '../src/maps/read.js';

/** A grey terrain picture, with dark grid lines every `size` pixels if asked. */
async function terrain(width, height, { size = null, x = 0, y = 0, line = 2 } = {}) {
  const buf = Buffer.alloc(width * height * 3);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let v = 120 + 60 * Math.sin(px / 90) * Math.cos(py / 70) + (rnd() - 0.5) * 40;
      if (size) {
        const dx = (((px - x) % size) + size) % size;
        const dy = (((py - y) % size) + size) % size;
        if (dx < line || dy < line) v = 40;
      }
      buf.fill(Math.max(0, Math.min(255, Math.round(v))), (py * width + px) * 3, (py * width + px) * 3 + 3);
    }
  }
  return sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** What the AI might say about a battle map: a grid of roughly `columns` squares, no scale printed. */
const readOut = (over = {}) => ({
  readable: true,
  kind: 'battle',
  name: 'Forest clearing',
  description: 'A clearing with a hidden trapdoor under the well.',
  grid: { visible: true, columns: 20, rows: 14 },
  scale: { distance: null, unit: null, per: null },
  notes: 'The north edge is cut off.',
  ...over,
});

const mapLLM = (handler = () => readOut()) => createFakeLLM({ structured: (opts) => handler(opts) });

/** Wait until `check()` returns something truthy (maps are read in the background). */
async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function importMap(t, buf, body = {}) {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'forest_clearing.png', data: buf.toString('base64'), ...body } });
  assert.equal(res.statusCode, 201, res.body);
  const map = res.json();
  const read = await until(() => {
    const m = t.maps.get(t.campaign.id, map.id);
    return m.reading.status !== 'pending' && m;
  });
  return read;
}

test('detectGrid measures a drawn grid exactly, and finds none on plain terrain', async () => {
  const g = await detectGrid(await terrain(1500, 1100, { size: 37.3, x: 12, y: 20 }), { columns: 40 });
  assert.ok(Math.abs(g.size - 37.3) < 0.2, `size ${g.size}`);
  // The lines are 2 px wide, so they're centred a pixel in.
  assert.ok(Math.abs(g.x - 13) <= 2 && Math.abs(g.y - 21) <= 2, `offset ${g.x},${g.y}`);
  // Without the AI's estimate it still finds the square, not a multiple of it.
  const big = await detectGrid(await terrain(1800, 1200, { size: 90.5, x: 30, y: 5 }));
  assert.ok(Math.abs(big.size - 90.5) < 0.3, `size ${big.size}`);
  assert.equal(await detectGrid(await terrain(1200, 900)), null);
});

test('the DM imports a map: archived as uploaded, read by the AI, hidden from players until shown', async () => {
  const llm = mapLLM();
  const t = await setup({ llm });
  try {
    const png = await terrain(1400, 980, { size: 70 });
    const map = await importMap(t, png);
    assert.equal(map.reading.status, 'done');
    assert.equal(map.name, 'Forest clearing'); // the AI's name replaces the file name
    assert.equal(map.kind, 'battle');
    assert.ok(Math.abs(map.grid.size - 70) < 0.2, `grid ${JSON.stringify(map.grid)}`);
    assert.deepEqual(map.scale, { distance: 5, unit: 'ft', per: 'square' });
    assert.deepEqual(map.image, { file: 'image.png', type: 'image/png', width: 1400, height: 980 });
    const call = llm.calls.find((c) => c.purpose === 'map:read');
    assert.equal(call.attachments[0].media_type, 'image/jpeg');

    // Archived exactly as uploaded, with every change.
    const dir = path.join(t.paths.archive, t.campaign.slug, 'maps', map.id);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'image.png')), png);
    assert.ok(fs.readFileSync(path.join(dir, 'changes.jsonl'), 'utf8').trim().split('\n').length >= 2);

    // Players can't see it, or tell that it exists.
    const base = `/campaigns/${t.campaign.id}/maps`;
    assert.deepEqual((await t.request('GET', base, { as: t.sam.token })).json(), { can_edit: false, maps: [] });
    assert.equal((await t.request('GET', `${base}/${map.id}`, { as: t.sam.token })).statusCode, 404);
    assert.equal((await t.request('GET', `${base}/${map.id}/image`, { as: t.sam.token })).statusCode, 404);
    // Only the DM imports or changes maps.
    assert.equal((await t.request('POST', base, { as: t.sam.token, body: { data: png.toString('base64') } })).statusCode, 403);
    assert.equal((await t.request('PATCH', `${base}/${map.id}`, { as: t.sam.token, body: { shown: true } })).statusCode, 403);

    // Shown: players see it, but not the AI's description or notes (they could give secrets away).
    assert.equal((await t.request('PATCH', `${base}/${map.id}`, { body: { shown: true } })).statusCode, 200);
    const seen = (await t.request('GET', `${base}/${map.id}`, { as: t.sam.token })).json();
    assert.equal(seen.description, '');
    assert.equal(seen.reading.notes, '');
    assert.equal(seen.can_edit, false);
    assert.equal((await t.request('GET', base)).json().maps[0].description, 'A clearing with a hidden trapdoor under the well.');
    const img = await t.request('GET', `${base}/${map.id}/image`, { as: t.sam.token });
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers['content-type'], 'image/png');
    assert.deepEqual(img.rawPayload, png);

    // Not an image.
    const bad = await t.request('POST', base, { body: { filename: 'x.txt', data: Buffer.from('hello').toString('base64') } });
    assert.equal(bad.statusCode, 400);
  } finally {
    await t.cleanup();
  }
});

test('tokens: the DM places them; players move only their own, snapped to the grid', async () => {
  const t = await setup({ llm: mapLLM() });
  try {
    const map = await importMap(t, await terrain(1400, 980, { size: 70 }));
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    await t.request('PATCH', base, { body: { shown: true, grid: { size: 70, x: 0, y: 0 } } });

    const add = (body, as) => t.request('POST', `${base}/tokens`, { body, as });
    assert.equal((await add({ kind: 'enemy', name: 'Goblin' }, t.sam.token)).statusCode, 403);
    const thorin = (await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 100, y: 100 })).json().token;
    assert.deepEqual({ x: thorin.x, y: thorin.y }, { x: 105, y: 105 }); // middle of a square
    const ogre = (await add({ kind: 'enemy', name: 'Ogre', size: 2, x: 290, y: 290 })).json().token;
    assert.deepEqual({ x: ogre.x, y: ogre.y }, { x: 280, y: 280 }); // a Large token sits on a corner
    assert.equal(ogre.color, '#b33a3a');
    assert.equal((await add({ kind: 'pc', name: 'Stranger', user_id: 9999 })).statusCode, 400);

    const move = (id, body, as) => t.request('PATCH', `${base}/tokens/${id}`, { body, as });
    const moved = await move(thorin.id, { x: 330, y: 190 }, t.sam.token);
    assert.equal(moved.statusCode, 200);
    const t2 = moved.json().token;
    assert.deepEqual({ x: t2.x, y: t2.y }, { x: 315, y: 175 });
    assert.equal((await move(ogre.id, { x: 10, y: 10 }, t.sam.token)).statusCode, 403); // not theirs
    assert.equal((await move(thorin.id, { x: 10, y: 10 }, t.alex.token)).statusCode, 403); // not Alex's
    assert.equal((await move(thorin.id, { name: 'Bob' }, t.sam.token)).statusCode, 403); // renaming is the DM's
    assert.equal((await move(ogre.id, { x: 5000, y: -50 })).json().token.x, 1400 - 70); // kept on the map
    assert.equal((await t.request('DELETE', `${base}/tokens/${ogre.id}`, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('DELETE', `${base}/tokens/${ogre.id}`)).statusCode, 200);

    // Hidden again: players can't move tokens on it either.
    await t.request('PATCH', base, { body: { shown: false } });
    assert.equal((await move(thorin.id, { x: 10, y: 10 }, t.sam.token)).statusCode, 404);
  } finally {
    await t.cleanup();
  }
});

test('maps: moves reach everyone live; a map being hidden is "gone" for players', async () => {
  const t = await setup({ llm: mapLLM() });
  try {
    const map = await importMap(t, await terrain(700, 490, { size: 35 }));
    const base = `/campaigns/${t.campaign.id}/maps`;
    await t.request('PATCH', `${base}/${map.id}`, { body: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
    const thorin = (await t.request('POST', `${base}/${map.id}/tokens`, { body: { kind: 'pc', name: 'Thorin', user_id: t.sam.id } })).json().token;

    await t.app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = t.app.server.address();
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}${base}/events`, { headers: { authorization: `Bearer ${t.alex.token}` }, signal: controller.signal });
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let text = '';
    const next = async (event) => {
      for (;;) {
        const m = new RegExp(`event: ${event}\\ndata: (.*)\\n\\n`).exec(text);
        if (m) {
          text = text.slice(m.index + m[0].length);
          return JSON.parse(m[1]);
        }
        const { value } = await reader.read();
        text += value;
      }
    };
    await t.request('PATCH', `${base}/${map.id}/tokens/${thorin.id}`, { as: t.sam.token, body: { x: 100, y: 100 } });
    const update = await next('map');
    assert.equal(update.tokens[0].x, 87.5); // 35 px squares: the middle of the third square
    assert.equal(update.description, ''); // filtered for the player
    await t.request('PATCH', `${base}/${map.id}`, { body: { shown: false } });
    assert.deepEqual(await next('gone'), { id: map.id });
    controller.abort();
  } finally {
    await t.cleanup();
  }
});

test('maps: a failed read can be run again; DM corrections survive; restore replays maps from the archive', async () => {
  let fail = true;
  const t = await setup({
    llm: mapLLM(() => {
      if (fail) throw new Error('overloaded');
      return readOut({ grid: { visible: false, columns: null, rows: null }, kind: 'region', name: 'The Vale', scale: { distance: 30, unit: 'mi', per: 'width' } });
    }),
  });
  try {
    const map = await importMap(t, await terrain(600, 400), { name: 'My vale' });
    assert.equal(map.reading.status, 'failed');
    assert.match(map.reading.error, /overloaded/);
    fail = false;
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    assert.equal((await t.request('POST', `${base}/read`)).statusCode, 200);
    const read = await until(() => {
      const m = t.maps.get(t.campaign.id, map.id);
      return m.reading.status === 'done' && m;
    });
    assert.equal(read.name, 'My vale'); // the DM's name stays
    assert.equal(read.grid, null);
    assert.deepEqual(read.scale, { distance: 30, unit: 'mi', per: 'width' });
    await t.request('POST', `${base}/tokens`, { body: { kind: 'npc', name: 'Hermit', x: 123.4, y: 50 } });

    const fresh = await createContext({ config: t.config, paths: { ...t.paths, db: path.join(t.dir, 'fresh.sqlite') }, llm: createFakeLLM(), embedder: fakeEmbedder });
    try {
      const c = fresh.db.prepare('SELECT id FROM campaigns').get();
      const restored = fresh.maps.get(c.id, map.id);
      assert.equal(restored.name, 'My vale');
      assert.equal(restored.version, t.maps.get(t.campaign.id, map.id).version);
      assert.equal(restored.tokens[0].name, 'Hermit');
      assert.equal(restored.tokens[0].x, 123.4); // no grid: placed freely
    } finally {
      fresh.db.close();
    }

    // Removed: gone from the page, kept in the archive.
    assert.equal((await t.request('DELETE', base)).statusCode, 200);
    assert.deepEqual((await t.request('GET', `/campaigns/${t.campaign.id}/maps`)).json().maps, []);
    assert.ok(fs.existsSync(path.join(t.paths.archive, t.campaign.slug, 'maps', map.id, 'image.png')));
  } finally {
    await t.cleanup();
  }
});

test('fog of war: players get covered parts blacked out and no tokens hidden in the fog', async () => {
  const t = await setup({ llm: mapLLM() });
  try {
    const png = await terrain(700, 490, { size: 35 });
    const map = await importMap(t, png);
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
    const add = async (body) => (await t.request('POST', `${base}/tokens`, { body })).json().token;
    await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 50, y: 50 });
    const goblin = await add({ kind: 'enemy', name: 'Goblin', x: 600, y: 400 });
    const seen = async () => (await t.request('GET', base, { as: t.sam.token })).json();

    assert.equal((await t.request('PATCH', `${base}/fog`, { as: t.sam.token, body: { enabled: true } })).statusCode, 403);
    await t.request('PATCH', `${base}/fog`, { body: { enabled: true } });
    // Everything covered: Sam still sees his own token, not the goblin.
    assert.deepEqual((await seen()).tokens.map((x) => x.name), ['Thorin']);
    assert.equal((await t.request('PATCH', `${base}/tokens/${goblin.id}`, { as: t.sam.token, body: { x: 1, y: 1 } })).statusCode, 404);
    const fogged = await seen();
    assert.notEqual(fogged.image_key, 'clear');

    // The image players get is dark where covered; the DM's is the original.
    const pixel = async (buf, x, y) => (await sharp(buf).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer())[0];
    const playerImg = (await t.request('GET', `${base}/image`, { as: t.sam.token })).rawPayload;
    assert.ok((await pixel(playerImg, 600, 400)) < 30);
    assert.deepEqual((await t.request('GET', `${base}/image`)).rawPayload, png);

    // Reveal the bottom-right room (snapped to squares on the page; any rectangle here).
    await t.request('PATCH', `${base}/fog`, { body: { add: { op: 'reveal', x: 560, y: 350, w: 140, h: 140 } } });
    const revealed = await seen();
    assert.deepEqual(revealed.tokens.map((x) => x.name).sort(), ['Goblin', 'Thorin']);
    assert.notEqual(revealed.image_key, fogged.image_key);
    const after = (await t.request('GET', `${base}/image`, { as: t.sam.token })).rawPayload;
    assert.equal(await pixel(after, 600, 401), await pixel(png, 600, 401));
    // Cover part of it again, then undo that.
    await t.request('PATCH', `${base}/fog`, { body: { add: { op: 'cover', x: 605, y: 395, w: 15, h: 15 } } }); // the goblin snapped to (612.5, 402.5)
    assert.deepEqual((await seen()).tokens.map((x) => x.name), ['Thorin']);
    await t.request('PATCH', `${base}/fog`, { body: { undo: true } });
    assert.equal((await seen()).tokens.length, 2);
    await t.request('PATCH', `${base}/fog`, { body: { reset: 'cover' } });
    assert.equal((await seen()).tokens.length, 1);
    await t.request('PATCH', `${base}/fog`, { body: { enabled: false } });
    assert.equal((await seen()).image_key, 'clear');
  } finally {
    await t.cleanup();
  }
});

test('tokens: hit points and conditions; players see how hurt enemies look, never hidden tokens', async () => {
  const t = await setup({ llm: mapLLM() });
  try {
    const map = await importMap(t, await terrain(700, 490, { size: 35 }));
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    await t.request('PATCH', base, { body: { shown: true } });
    const add = async (body) => (await t.request('POST', `${base}/tokens`, { body })).json().token;
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, hp: { current: 24, max: 24 } });
    const ogre = await add({ kind: 'enemy', name: 'Ogre', hp: { current: 59, max: 59 }, conditions: ['prone', 'prone'] });
    await add({ kind: 'enemy', name: 'Assassin', hidden: true });
    assert.equal((await t.request('POST', `${base}/tokens`, { body: { kind: 'enemy', conditions: ['sleepy'] } })).statusCode, 400);

    const seen = async (as = t.alex.token) => (await t.request('GET', base, { as })).json();
    const tokens = (await seen()).tokens;
    assert.deepEqual(tokens.map((x) => x.name), ['Thorin', 'Ogre']); // the hidden assassin isn't sent
    const ogreSeen = tokens.find((x) => x.name === 'Ogre');
    assert.equal(ogreSeen.hp, null);
    assert.equal(ogreSeen.health, 'unhurt');
    assert.deepEqual(ogreSeen.conditions, ['prone']);
    assert.deepEqual(tokens.find((x) => x.name === 'Thorin').hp, { current: 24, max: 24 }); // the party's numbers are shown

    const patch = (id, body, as) => t.request('PATCH', `${base}/tokens/${id}`, { body, as });
    await patch(ogre.id, { hp: { current: 29, max: 59 } });
    assert.equal((await seen()).tokens.find((x) => x.name === 'Ogre').health, 'bloodied');
    await patch(ogre.id, { hp: { current: 0, max: 59 } });
    assert.equal((await seen()).tokens.find((x) => x.name === 'Ogre').health, 'down');
    assert.equal((await t.request('GET', base)).json().tokens.find((x) => x.name === 'Ogre').hp.current, 0); // the DM sees numbers

    // Sam keeps his own hit points and conditions, but can't touch the ogre's or hide himself.
    assert.equal((await patch(thorin.id, { hp: { current: 17, max: 24 }, conditions: ['poisoned'] }, t.sam.token)).statusCode, 200);
    assert.equal((await patch(ogre.id, { hp: { current: 1, max: 59 } }, t.sam.token)).statusCode, 403);
    assert.equal((await patch(thorin.id, { hidden: true }, t.sam.token)).statusCode, 403);
    assert.deepEqual((await seen()).tokens.find((x) => x.name === 'Thorin').conditions, ['poisoned']);
  } finally {
    await t.cleanup();
  }
});
