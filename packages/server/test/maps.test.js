import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup, createFakeLLM, fakeEmbedder, terrain } from './helpers.js';
import { createContext } from '../src/context.js';
import { detectGrid } from '../src/maps/read.js';
import { emptySheet } from '@dndapp/shared/sheet.js';

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

test("tokens: a player character with a saved sheet shows the sheet's hit points; a change on the map goes on the sheet", async () => {
  const t = await setup({ llm: mapLLM() });
  try {
    const map = await importMap(t, await terrain(700, 490, { size: 35 }));
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    await t.request('PATCH', base, { body: { shown: true } });
    const thorin = (await t.request('POST', `${base}/tokens`, { body: { kind: 'pc', name: 'Thorin', user_id: t.sam.id, hp: { current: 5, max: 5 } } })).json().token;
    const seen = async (as) => (await t.request('GET', base, { as })).json().tokens.find((x) => x.id === thorin.id);
    // No sheet yet: the token's own hit points.
    assert.deepEqual((await seen()).hp, { current: 5, max: 5 });
    assert.equal((await seen()).hp_sheet, false);

    // Fighter 3 (Con 10): 10 + 2 × 6 = 22 hit points; 20 now.
    const sheet = { ...emptySheet({ name: 'Thorin' }), classes: [{ name: 'Fighter', level: 3 }], hp: { current: 20, temp: null } };
    t.sheets.save(t.campaign.id, t.sam.id, sheet);
    for (const as of [undefined, t.sam.token, t.alex.token]) {
      const tok = await seen(as);
      assert.deepEqual(tok.hp, { current: 20, max: 22 });
      assert.equal(tok.hp_sheet, true);
    }

    // The DM deals 7 on the map: the sheet says 13, saved with the reason and by the DM.
    const heard = [];
    t.maps.events.on('update', (m) => heard.push(m.id));
    const res = await t.request('PATCH', `${base}/tokens/${thorin.id}`, { body: { hp: { current: 13, max: 99 } } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().token.hp, { current: 13, max: 22 }, 'the maximum stays the sheet\'s');
    assert.equal(t.sheets.get(t.campaign.id, t.sam.id).sheet.hp.current, 13);
    assert.ok(heard.includes(map.id), 'the map is sent again');
    const lines = fs.readFileSync(path.join(t.paths.archive, t.campaign.slug, 'character-sheets', `${t.sam.id}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.at(-1).reason, 'hit points changed on the map');

    // The player heals on their sheet: the token follows. And they can change it from their token too.
    t.sheets.save(t.campaign.id, t.sam.id, { ...t.sheets.get(t.campaign.id, t.sam.id).sheet, hp: { current: 25, temp: null } });
    assert.equal((await seen(t.alex.token)).hp.current, 25);
    assert.equal((await t.request('PATCH', `${base}/tokens/${thorin.id}`, { body: { hp: { current: 0, max: 22 }, conditions: ['unconscious'] }, as: t.sam.token })).statusCode, 200);
    assert.equal(t.sheets.get(t.campaign.id, t.sam.id).sheet.hp.current, 0);
    assert.deepEqual((await seen()).conditions, ['unconscious']);
  } finally {
    await t.cleanup();
  }
});

test('stat blocks: the AI fills one in for the DM; players never get it', async () => {
  const ogreBlock = {
    found: true, name: 'Ogre', size: 'large', ac: 11, hp_average: 59, hp_formula: '7d10 + 21', speed: '40 ft.', challenge: '2 (450 XP)',
    stat_block: '**Ogre** Large giant\n\n**Armor Class** 11\n\n**Greatclub.** +6 to hit, 2d8 + 4 bludgeoning.',
  };
  const llm = mapLLM((opts) => (opts.purpose === 'map:stats' ? (opts.prompt.includes('Zorblax') ? { ...ogreBlock, found: false } : ogreBlock) : readOut()));
  const t = await setup({ llm });
  try {
    const map = await importMap(t, await terrain(700, 490, { size: 35 }));
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
    const ogre = (await t.request('POST', `${base}/tokens`, { body: { kind: 'enemy', name: 'Ogre 1', x: 100, y: 100 } })).json().token;
    assert.equal((await t.request('POST', `${base}/tokens/${ogre.id}/stats`, { as: t.sam.token })).statusCode, 403);
    const res = await t.request('POST', `${base}/tokens/${ogre.id}/stats`);
    assert.equal(res.statusCode, 200);
    const filled = res.json().token;
    assert.equal(filled.stats.ac, 11);
    assert.equal(filled.stats.source, 'ai');
    assert.match(filled.stats.text, /Greatclub/);
    assert.deepEqual(filled.hp, { current: 59, max: 59 });
    assert.equal(filled.size, 2); // Large, and re-snapped to a corner
    assert.deepEqual({ x: filled.x, y: filled.y }, { x: 105, y: 105 });
    assert.match(llm.calls.find((c) => c.purpose === 'map:stats').prompt, /Ogre 1/);

    const seen = (await t.request('GET', base, { as: t.sam.token })).json().tokens[0];
    assert.equal(seen.stats, null);
    assert.equal(seen.health, 'unhurt');

    const bad = (await t.request('POST', `${base}/tokens`, { body: { kind: 'enemy', name: 'Zorblax' } })).json().token;
    assert.equal((await t.request('POST', `${base}/tokens/${bad.id}/stats`)).statusCode, 404);
  } finally {
    await t.cleanup();
  }
});

test("NPCs from the campaign's records: the DM picks one; players only see the name", async () => {
  const t = await setup({ llm: mapLLM() });
  try {
    const cid = t.campaign.id;
    const hal = await t.kb.create(cid, 'r', { kind: 'npc', title: 'Hal the innkeeper', body: 'Secretly a cultist.' });
    await t.kb.create(cid, 'r', { kind: 'location', title: 'The Prancing Pony' });
    const map = await importMap(t, await terrain(700, 490, { size: 35 }));
    const base = `/campaigns/${cid}/maps`;
    await t.request('PATCH', `${base}/${map.id}`, { body: { shown: true } });

    assert.equal((await t.request('GET', `${base}/records`, { as: t.sam.token })).statusCode, 403);
    const { records } = (await t.request('GET', `${base}/records`)).json();
    assert.deepEqual(records.map((r) => [r.title, r.person]), [['Hal the innkeeper', true], ['The Prancing Pony', false]]);

    const bad = await t.request('POST', `${base}/${map.id}/tokens`, { body: { kind: 'npc', name: 'X', record: { id: 99999 } } });
    assert.equal(bad.statusCode, 400);
    const token = (await t.request('POST', `${base}/${map.id}/tokens`, { body: { kind: 'npc', name: 'Hal', record: { id: hal.id } } })).json().token;
    assert.deepEqual(token.record, { id: hal.id, title: 'Hal the innkeeper' });

    const rec = (await t.request('GET', `${base}/records/${hal.id}`)).json();
    assert.equal(rec.body, 'Secretly a cultist.');
    assert.equal((await t.request('GET', `${base}/records/${hal.id}`, { as: t.sam.token })).statusCode, 403);
    // A rebuilt knowledge base gives records new ids; the title still finds it.
    assert.equal((await t.request('GET', `${base}/records/99999?title=${encodeURIComponent('Hal the innkeeper')}`)).json().id, hal.id);

    const seen = (await t.request('GET', `${base}/${map.id}`, { as: t.sam.token })).json().tokens[0];
    assert.equal(seen.name, 'Hal');
    assert.equal(seen.record, null);
  } finally {
    await t.cleanup();
  }
});

/** A small PDF whose pages each show one JPEG filling the page (sizes in points). */
async function pdfOf(pages) {
  const objs = [];
  const add = (o) => objs.push(o);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(null); // the page list, filled in below
  const kids = [];
  for (const { w, h, color } of pages) {
    const jpg = await sharp({ create: { width: 40, height: 30, channels: 3, background: color } }).jpeg().toBuffer();
    add({ dict: `<< /Type /XObject /Subtype /Image /Width 40 /Height 30 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, stream: jpg });
    const img = objs.length;
    const content = Buffer.from(`q ${w} 0 0 ${h} 0 0 cm /Im1 Do Q`);
    add({ dict: `<< /Length ${content.length} >>`, stream: content });
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im1 ${img} 0 R >> >> /Contents ${objs.length} 0 R >>`);
    kids.push(objs.length);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const parts = [Buffer.from('%PDF-1.4\n')];
  let len = parts[0].length;
  const offsets = objs.map((o, i) => {
    const at = len;
    const b = typeof o === 'string'
      ? Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`)
      : Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${o.dict}\nstream\n`), o.stream, Buffer.from('\nendstream\nendobj\n')]);
    parts.push(b);
    len += b.length;
    return at;
  });
  parts.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`));
  return Buffer.concat(parts);
}

test('a page of a PDF becomes a map; the PDF is archived with it', async () => {
  const t = await setup({ llm: mapLLM() });
  try {
    const pdf = await pdfOf([{ w: 612, h: 792, color: '#ffffff' }, { w: 300, h: 200, color: '#33aa77' }]);
    const base = `/campaigns/${t.campaign.id}/maps`;
    const bad = await t.request('POST', base, { body: { filename: 'pack.pdf', data: pdf.toString('base64'), page: 3 } });
    assert.equal(bad.statusCode, 400, bad.body);
    assert.match(bad.json().error, /2 pages/);

    const map = await importMap(t, pdf, { filename: 'Lost_Mine_maps.pdf', page: 2 });
    assert.deepEqual(map.image, { file: 'image.png', type: 'image/png', width: 1800, height: 1200 }); // a small page, drawn at most 6× (432 dpi)
    assert.deepEqual(map.source, { file: 'source.pdf', page: 2 });
    assert.equal(map.name, 'Forest clearing'); // the AI's name replaces "Lost Mine maps, page 2"
    const dir = path.join(t.paths.archive, t.campaign.slug, 'maps', map.id);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'source.pdf')), pdf);
    const { channels } = await sharp(fs.readFileSync(path.join(dir, 'image.png'))).stats();
    assert.deepEqual(channels.slice(0, 3).map((c) => Math.round(c.mean / 10)), [5, 17, 12]); // the page's picture, drawn

    assert.equal((await t.request('POST', base, { body: { filename: 'notes.pdf', data: Buffer.from('%PDF-1.4 nonsense').toString('base64') } })).statusCode, 400);
  } finally {
    await t.cleanup();
  }
});

test('private pins: only the person who placed them ever sees them, not even the DM', async () => {
  const t = await setup({ llm: mapLLM() });
  try {
    const map = await importMap(t, await terrain(700, 490));
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    // Not shown yet: players can't pin it.
    assert.equal((await t.request('POST', `${base}/pins`, { as: t.sam.token, body: { x: 1, y: 1 } })).statusCode, 404);
    await t.request('PATCH', base, { body: { shown: true } });

    const added = await t.request('POST', `${base}/pins`, { as: t.sam.token, body: { x: 200, y: 9999, label: 'Trap here?' } });
    assert.equal(added.statusCode, 201);
    const pin = added.json().pin;
    assert.deepEqual({ ...pin, id: 'x' }, { id: 'x', x: 200, y: 490, label: 'Trap here?', color: '#d9a400' });
    assert.equal((await t.request('PATCH', `${base}/pins/${pin.id}`, { as: t.sam.token, body: { label: 'Trap!' } })).json().pin.label, 'Trap!');

    assert.deepEqual((await t.request('GET', `${base}/pins`, { as: t.alex.token })).json(), { pins: [] });
    assert.deepEqual((await t.request('GET', `${base}/pins`)).json(), { pins: [] });
    assert.equal((await t.request('PATCH', `${base}/pins/${pin.id}`, { as: t.alex.token, body: { label: 'mine' } })).statusCode, 404);
    assert.equal((await t.request('DELETE', `${base}/pins/${pin.id}`)).statusCode, 404);
    assert.ok(!JSON.stringify((await t.request('GET', base)).json()).includes('Trap'));

    // Archived per person, and restored.
    const file = path.join(t.paths.archive, t.campaign.slug, 'maps', map.id, 'pins', `${t.sam.id}.jsonl`);
    assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 2);
    const fresh = await createContext({ config: t.config, paths: { ...t.paths, db: path.join(t.dir, 'fresh.sqlite') }, llm: createFakeLLM(), embedder: fakeEmbedder });
    try {
      const c = fresh.db.prepare('SELECT id FROM campaigns').get();
      assert.equal(fresh.maps.pins(c.id, map.id, t.sam.id)[0].label, 'Trap!');
    } finally {
      fresh.db.close();
    }

    assert.deepEqual((await t.request('DELETE', `${base}/pins/${pin.id}`, { as: t.sam.token })).json(), { pins: [] });
  } finally {
    await t.cleanup();
  }
});

test('walls and line of sight: players see their own side, through open doors, and keep a dim view of where they have been', async () => {
  const t = await setup({ llm: mapLLM() });
  try {
    const png = await terrain(700, 490, { size: 35 });
    const map = await importMap(t, png);
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
    const add = async (body) => (await t.request('POST', `${base}/tokens`, { body })).json().token;
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 50, y: 50 });
    await add({ kind: 'enemy', name: 'Goblin', x: 600, y: 400 });
    const seen = async () => (await t.request('GET', base, { as: t.sam.token })).json();
    const image = async () => (await t.request('GET', `${base}/image`, { as: t.sam.token })).rawPayload;
    const pixel = async (buf, x, y) => (await sharp(buf).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer())[0];
    const walls = (body, as) => t.request('PATCH', `${base}/walls`, { body, ...(as && { as }) });

    // A wall down the middle with a door in it. Only the DM draws walls, and players never get them.
    assert.equal((await walls({ add: { x1: 350, y1: 0, x2: 350, y2: 210 } }, t.sam.token)).statusCode, 403);
    await walls({ add: { x1: 350, y1: 0, x2: 350, y2: 210 } });
    await walls({ add: { x1: 350, y1: 210, x2: 350, y2: 280, door: true } });
    const dm = (await walls({ add: { x1: 350, y1: 280, x2: 350, y2: 490 } })).json();
    assert.equal(dm.walls.length, 3);
    const door = dm.walls.find((w) => w.door);
    assert.deepEqual({ ...door, id: 'x' }, { id: 'x', x1: 350, y1: 210, x2: 350, y2: 280, kind: 'wall', door: true, open: false, locked: false, source: 'dm' });
    assert.deepEqual((await seen()).walls, []);
    assert.equal((await walls({ toggle: dm.walls[0].id })).statusCode, 400, 'only doors open');
    assert.equal((await walls({ remove: 'nosuchwall' })).statusCode, 404);

    // Line of sight on: Thorin (52.5, 52.5) sees his half of the map, not the goblin behind the wall.
    assert.equal((await t.request('PATCH', `${base}/fog`, { as: t.sam.token, body: { sight: true } })).statusCode, 403);
    await t.request('PATCH', `${base}/fog`, { body: { enabled: true, sight: true } });
    let view = await seen();
    assert.deepEqual(view.tokens.map((x) => x.name), ['Thorin']);
    assert.deepEqual(view.fog.shapes, []);
    assert.equal(view.fog.sight, true);
    assert.ok(view.fog.mask.some((s) => s.points), 'his sight comes as a polygon');
    let img = await image();
    assert.equal(await pixel(img, 100, 300), await pixel(png, 100, 300));
    assert.ok((await pixel(img, 600, 100)) < 30);
    const closedKey = view.image_key;

    // Open the door: he sees through it to the goblin (on the line from him through the doorway).
    await walls({ toggle: door.id });
    view = await seen();
    assert.deepEqual(view.tokens.map((x) => x.name).sort(), ['Goblin', 'Thorin']);
    assert.notEqual(view.image_key, closedKey);
    img = await image();
    assert.equal(await pixel(img, 500, 332), await pixel(png, 500, 332));
    assert.ok((await pixel(img, 600, 60)) < 30, 'not round the corner');

    // Close it again: the goblin is gone, and what he saw through the door stays, dimmed.
    await walls({ toggle: door.id });
    view = await seen();
    assert.deepEqual(view.tokens.map((x) => x.name), ['Thorin']);
    assert.ok(view.fog.mask.some((s) => s.fill === 'dim'));
    img = await image();
    const dim = await pixel(img, 500, 332);
    const original = await pixel(png, 500, 332);
    assert.ok(Math.abs(dim - (0.4 * original + 0.6 * 0x14)) < 15, `dim ${dim} from ${original}`);

    // He can't walk through the wall or the closed door; the DM can put a token anywhere.
    const move = (body, as = t.sam.token) => t.request('PATCH', `${base}/tokens/${thorin.id}`, { as, body });
    const blocked = await move({ x: 400, y: 245 });
    assert.equal(blocked.statusCode, 400);
    assert.match(blocked.json().error, /wall in the way/);
    assert.equal((await move({ x: 100, y: 400 })).statusCode, 200);
    assert.equal((await move({ x: 52.5, y: 52.5 })).statusCode, 200);

    // The DM makes everyone forget where they've been.
    await t.request('PATCH', `${base}/fog`, { body: { forget: true } });
    const inDim = (v, x, y) => v.fog.mask.some((s) => s.fill === 'dim' && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
    assert.ok(!inDim(await seen(), 500, 332), 'only where he can see now');
    assert.ok((await pixel(await image(), 500, 332)) < 30);

    // Through the open door he can walk.
    await walls({ toggle: door.id });
    assert.equal((await move({ x: 402.5, y: 245 })).statusCode, 200);
    await walls({ toggle: door.id });
    assert.equal((await move({ x: 52.5, y: 52.5 })).statusCode, 400, 'shut behind him');
    assert.equal((await move({ x: 52.5, y: 52.5 }, t.dmToken)).statusCode, 200);

    // DM rectangles still show outside sight; line of sight off leaves only them.
    await t.request('PATCH', `${base}/fog`, { body: { add: { op: 'reveal', x: 560, y: 350, w: 140, h: 140 } } });
    assert.deepEqual((await seen()).tokens.map((x) => x.name).sort(), ['Goblin', 'Thorin']);
    await t.request('PATCH', `${base}/fog`, { body: { sight: false } });
    view = await seen();
    assert.ok(!view.fog.mask.some((s) => s.points || s.fill === 'dim'));
    assert.ok((await pixel(await image(), 100, 300)) < 30);

    await walls({ clear: 'all' });
    assert.deepEqual(t.maps.get(t.campaign.id, map.id).walls, []);
  } finally {
    await t.cleanup();
  }
});

test('walls drafted by the AI replace its earlier draft, keep the DM\'s own, and can be cleared', async () => {
  let draft = 0;
  const t = await setup({
    llm: mapLLM((opts) => {
      // The check: the same, plus a round tower it missed.
      if (opts.purpose === 'map:walls-check') return { ...firstDraft(), circles: [{ center: { x: 200, y: 600 }, edge: { x: 250, y: 600 }, kind: 'wall' }], notes: draft === 1 ? 'The tower walls are a guess.' : '' };
      if (opts.purpose !== 'map:walls') return readOut();
      draft++;
      return firstDraft();
    }),
  });
  function firstDraft() {
      return {
        walls: [{ points: [{ x: 500, y: 0 }, { x: 500, y: 498 }, { x: 1000, y: 498 }] }],
        doors: [{ from: { x: 502, y: 500 }, to: { x: 502, y: 700 } }],
        obstacles: [{ points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] }],
        lights: [{ x: 100, y: 900, kind: 'brazier' }],
        difficult: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] }],
        notes: 'First go.',
      };
  }
  try {
    const map = await importMap(t, await terrain(700, 490));
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    await t.request('PATCH', base, { body: { shown: true } });
    await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 10, y1: 10, x2: 100, y2: 10 } } });
    assert.equal((await t.request('POST', `${base}/walls/draft`, { as: t.sam.token })).statusCode, 403);
    const started = (await t.request('POST', `${base}/walls/draft`)).json();
    assert.equal(started.wall_draft.status, 'pending');
    const done = await until(() => {
      const m = t.maps.get(t.campaign.id, map.id);
      return m.wall_draft.status === 'done' && m;
    });
    assert.equal(done.wall_draft.notes, 'The tower walls are a guess.');
    const ai = done.walls.filter((w) => w.source === 'ai');
    // Positions are thousandths of the image; the map has 35 px squares, so ends near a grid line or corner go onto it
    // (the wall's corner at 244 → 245, the door's foot at 343 → 350) and walls that meet share it.
    const straight = ai.filter((w) => !w.group);
    assert.deepEqual(straight.map(({ x1, y1, x2, y2, door, kind }) => ({ x1, y1, x2, y2, door, kind })), [
      { x1: 350, y1: 0, x2: 350, y2: 245, door: false, kind: 'wall' },
      { x1: 350, y1: 245, x2: 700, y2: 245, door: false, kind: 'wall' },
      { x1: 70, y1: 49, x2: 140, y2: 49, door: false, kind: 'low' },
      { x1: 350, y1: 245, x2: 350, y2: 350, door: true, kind: 'wall' },
    ]);
    // The round tower the check added: 36 short pieces round (140, 294), radius 35, one group, left off the grid.
    const tower = ai.filter((w) => w.group);
    assert.equal(tower.length, 36);
    assert.equal(new Set(tower.map((w) => w.group)).size, 1);
    for (const w of tower) assert.ok(Math.abs(Math.hypot(w.x1 - 140, w.y1 - 294) - 35) < 0.2, `${w.x1},${w.y1} on the circle`);
    // The check saw the draft drawn over the map, and the draft's data; both on the walls task.
    const check = t.llm.calls.find((c) => c.purpose === 'map:walls-check');
    assert.equal(check.attachments.length, 1);
    assert.match(check.prompt, /<draft>.*"walls"/s);
    assert.ok(t.llm.calls.filter((c) => c.purpose.startsWith('map:walls')).every((c) => c.task === 'walls'));
    assert.equal(done.walls.filter((w) => w.source === 'dm').length, 1);
    // Lights it saw, as the light they give.
    assert.deepEqual(done.lights.map(({ x, y, bright, dim, source }) => ({ x, y, bright, dim, source })), [{ x: 70, y: 441, bright: 20, dim: 20, source: 'ai' }]);
    assert.deepEqual((await t.request('GET', base, { as: t.sam.token })).json().lights, [], 'players never get the lights');
    assert.deepEqual(done.terrain.map(({ points, source }) => ({ points, source })), [{ points: [[0, 0], [70, 0], [70, 49]], source: 'ai' }]);
    const call = t.llm.calls.find((c) => c.purpose === 'map:walls');
    assert.equal(call.attachments.length, 1);
    assert.match(call.prompt, /700 × 490/);
    // Players never get the draft's notes.
    assert.equal((await t.request('GET', base, { as: t.sam.token })).json().wall_draft.notes, '');

    await t.request('POST', `${base}/walls/draft`);
    const again = await until(() => {
      const m = t.maps.get(t.campaign.id, map.id);
      return m.wall_draft.status === 'done' && draft === 2 && m;
    });
    assert.equal(again.walls.length, done.walls.length, 'the old draft was replaced, not added to');
    assert.equal(again.lights.length, 1);
    await t.request('PATCH', `${base}/walls`, { body: { clear: 'ai' } });
    assert.deepEqual(t.maps.get(t.campaign.id, map.id).walls.map((w) => w.source), ['dm']);
  } finally {
    await t.cleanup();
  }
});

test('doors players open, locked doors, obstacles they see over, and what players get outside their sight', async () => {
  const t = await setup({ llm: mapLLM() });
  try {
    const png = await terrain(700, 490, { size: 35 });
    const map = await importMap(t, png);
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
    const add = async (body) => (await t.request('POST', `${base}/tokens`, { body })).json().token;
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 300, y: 245 });
    await add({ kind: 'enemy', name: 'Goblin', x: 600, y: 60 });
    const seen = async () => (await t.request('GET', base, { as: t.sam.token })).json();
    const image = async () => (await t.request('GET', `${base}/image`, { as: t.sam.token })).rawPayload;
    const pixel = async (buf, x, y) => (await sharp(buf).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer())[0];
    const walls = (body) => t.request('PATCH', `${base}/walls`, { body });
    await walls({ add: { x1: 350, y1: 0, x2: 350, y2: 210 } });
    await walls({ add: { x1: 350, y1: 280, x2: 350, y2: 490 } });
    const door = (await walls({ add: { x1: 350, y1: 210, x2: 350, y2: 280, door: true } })).json().walls.find((w) => w.door);
    // A building in the far corner, seen from above: an obstacle.
    const roof = (await walls({ add: { x1: 420, y1: 140, x2: 560, y2: 140, kind: 'low' } })).json().walls.find((w) => w.kind === 'low');
    await t.request('PATCH', `${base}/fog`, { body: { enabled: true, sight: true } });

    // Players get the doors they can see (to open them), never the walls.
    let view = await seen();
    assert.deepEqual(view.walls, []);
    assert.deepEqual(view.doors, [{ id: door.id, x1: 350, y1: 210, x2: 350, y2: 280, open: false, locked: false }]);
    const toggle = (as = t.sam.token, id = door.id) => t.request('POST', `${base}/doors/${id}/toggle`, { as });
    assert.equal((await toggle(t.sam.token, roof.id)).statusCode, 404, 'not a door');

    // Thorin is next to the door (52.5 px away; a square and a half is 52.5): he opens it and sees through.
    assert.equal((await toggle()).statusCode, 200);
    view = await seen();
    assert.equal(view.doors[0].open, true);
    // Over the roof to the goblin: obstacles don't block sight.
    assert.deepEqual(view.tokens.map((x) => x.name).sort(), ['Goblin', 'Thorin']);
    // ...but he can't walk through it.
    const move = (x, y) => t.request('PATCH', `${base}/tokens/${thorin.id}`, { as: t.sam.token, body: { x, y } });
    assert.equal((await move(402.5, 245)).statusCode, 200);
    assert.equal((await move(472.5, 87.5)).statusCode, 400, 'through the roof line');
    assert.equal((await move(87.5, 245)).statusCode, 200, 'back out through the open door');
    await toggle(t.dmToken);

    // Too far away now; and a locked door won't open for him at all.
    const far = await toggle();
    assert.equal(far.statusCode, 400);
    assert.match(far.json().error, /too far/);
    await move(297.5, 245);
    await walls({ lock: door.id });
    assert.equal((await seen()).doors[0].locked, true);
    assert.match((await toggle()).json().error, /locked/);
    assert.equal((await toggle(t.dmToken)).statusCode, 200, 'the DM can');
    assert.equal(t.maps.get(t.campaign.id, map.id).walls.find((w) => w.door).locked, false, 'opening unlocks');
    await toggle(t.dmToken);

    // Outside his sight: dark (default), greyed out, or the map as it is. Tokens stay hidden in all three.
    await t.request('PATCH', `${base}/fog`, { body: { forget: true } });
    assert.ok((await pixel(await image(), 600, 400)) < 30);
    await t.request('PATCH', `${base}/fog`, { body: { map: 'grey', memory: false } });
    view = await seen();
    assert.equal(view.fog.map, 'grey');
    assert.equal(view.fog.mask[0].fill, 'dim');
    assert.ok(!view.tokens.some((x) => x.name === 'Goblin'));
    const grey = await pixel(await image(), 600, 400);
    const original = await pixel(png, 600, 400);
    assert.ok(Math.abs(grey - (0.4 * original + 0.6 * 0x14)) < 15, `grey ${grey} from ${original}`);
    await t.request('PATCH', `${base}/fog`, { body: { map: 'shown' } });
    view = await seen();
    assert.deepEqual(view.fog.mask, []);
    assert.equal(view.image_key, 'clear');
    assert.deepEqual((await image()), png);
    assert.ok(!view.tokens.some((x) => x.name === 'Goblin'));

    // Memory off: nothing is remembered.
    await t.request('PATCH', `${base}/fog`, { body: { map: 'dark' } });
    assert.ok(!(await seen()).fog.mask.some((x) => x.fill === 'dim'));
  } finally {
    await t.cleanup();
  }
});
