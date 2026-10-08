/**
 * The DM's creatures: enemies and NPCs saved once and placed on any map as
 * tokens (with their picture and stat block), never seen by players, and
 * back from the archive after losing the database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, createFakeLLM, fakeEmbedder, terrain } from './helpers.js';
import { createContext } from '../src/context.js';
import { normalizeCreature, tokenNames } from '../src/creatures.js';

const readOut = { readable: true, kind: 'battle', name: 'Cave', description: '', grid: { visible: false, columns: null, rows: null }, scale: { distance: null, unit: null, per: null }, notes: '' };
const ogreBlock = {
  found: true, name: 'Ogre', size: 'large', ac: 11, hp_average: 59, hp_formula: '7d10 + 21', speed: '40 ft.', challenge: '2 (450 XP)',
  stat_block: '**Ogre** Large giant\n\n| STR | DEX |\n|---|---|\n| 19 (+4) | 8 (-1) |',
};
const llm = () => createFakeLLM({ structured: (opts) => (opts.purpose === 'map:stats' ? (opts.prompt.includes('Zorblax') ? { ...ogreBlock, found: false } : ogreBlock) : readOut) });

async function importMap(t, { grid = 35 } = {}) {
  const base = `/campaigns/${t.campaign.id}/maps`;
  const map = (await t.request('POST', base, { body: { filename: 'cave.png', data: (await terrain(700, 490)).toString('base64') } })).json();
  for (let i = 0; t.maps.get(t.campaign.id, map.id).reading.status === 'pending' && i < 200; i++) await new Promise((r) => setTimeout(r, 20));
  await t.request('PATCH', `${base}/${map.id}`, { body: { shown: true, grid: grid ? { size: grid, x: 0, y: 0 } : null } });
  return { ...map, base: `${base}/${map.id}` };
}

test('tokenNames: one creature keeps its name; a group is numbered, carrying on from tokens already on the map', () => {
  assert.deepEqual(tokenNames('Goblin', 1), ['Goblin']);
  assert.deepEqual(tokenNames('Goblin', 3), ['Goblin 1', 'Goblin 2', 'Goblin 3']);
  assert.deepEqual(tokenNames('Goblin', 2, ['Goblin 1', 'goblin 2', 'Goblin boss']), ['Goblin 3', 'Goblin 4']);
  assert.deepEqual(tokenNames('Goblin', 1, ['Goblin']), ['Goblin 2'], 'a second one alone still gets a number');
  assert.deepEqual(tokenNames('Mr. (Odd)', 1, ['Mr. (Odd)']), ['Mr. (Odd) 2'], 'odd characters in a name are fine');
});

test('normalizeCreature: fills in defaults and drops anything it does not know', () => {
  const c = normalizeCreature({ id: 'abc', name: '  ', kind: 'pc', size: 7, color: 'red', hp_max: -3, speed: 'fast', stats: { text: '' }, sneaky: true });
  assert.equal(c.name, 'Creature');
  assert.equal(c.kind, 'enemy');
  assert.equal(c.size, 1);
  assert.equal(c.color, '#b33a3a');
  assert.equal(c.hp_max, 1);
  assert.equal(c.speed, null);
  assert.equal(c.stats, null);
  assert.equal(c.sneaky, undefined);
  assert.equal(normalizeCreature({ kind: 'npc' }).color, '#3f8a4a', 'friendly ones are green by default');
});

test('creatures: only the DM saves, sees, changes and removes them; a typed stat block is the DM\'s own', async () => {
  const t = await setup({ llm: llm() });
  try {
    const base = `/campaigns/${t.campaign.id}/creatures`;
    assert.equal((await t.request('GET', base, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('POST', base, { as: t.sam.token, body: { name: 'Goblin', kind: 'enemy' } })).statusCode, 403);
    assert.equal((await t.request('POST', base, { body: { name: 'Goblin', kind: 'pc' } })).statusCode, 400, 'only enemies and NPCs');
    assert.equal((await t.request('POST', base, { body: { kind: 'enemy' } })).statusCode, 400, 'needs a name');

    const res = await t.request('POST', base, { body: { name: 'Goblin', kind: 'enemy', hp_max: 7, darkvision: 60, speed: 30, notes: 'Cowardly; flees at half HP.', stats: { text: '**Goblin** AC 15', ac: 15 } } });
    assert.equal(res.statusCode, 201, res.body);
    const goblin = res.json();
    assert.equal(goblin.color, '#b33a3a');
    assert.equal(goblin.size, 1);
    assert.equal(goblin.stats.source, 'dm');
    assert.equal(goblin.picture, null);
    const mira = (await t.request('POST', base, { body: { name: 'Mira the innkeeper', kind: 'npc' } })).json();
    assert.equal(mira.color, '#3f8a4a');

    assert.deepEqual((await t.request('GET', base)).json().creatures.map((c) => c.name), ['Goblin', 'Mira the innkeeper']);

    const changed = await t.request('PATCH', `${base}/${goblin.id}`, { body: { name: 'Goblin archer', size: 0.5, stats: null } });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal(changed.json().name, 'Goblin archer');
    assert.equal(changed.json().stats, null);
    assert.equal(changed.json().notes, 'Cowardly; flees at half HP.', 'what was not sent stays');
    assert.equal((await t.request('PATCH', `${base}/${goblin.id}`, { as: t.sam.token, body: { name: 'x' } })).statusCode, 403);
    assert.equal((await t.request('PATCH', `${base}/nope`, { body: { name: 'x' } })).statusCode, 404);

    assert.equal((await t.request('DELETE', `${base}/${mira.id}`)).statusCode, 200);
    assert.deepEqual((await t.request('GET', base)).json().creatures.map((c) => c.name), ['Goblin archer']);
    assert.equal((await t.request('PATCH', `${base}/${mira.id}`, { body: { name: 'x' } })).statusCode, 404);
    // The archive keeps every version, the removal included.
    const lines = fs.readFileSync(path.join(t.archive.root, t.campaign.slug, 'creatures', mira.id, 'changes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => l.removed), [false, true]);
  } finally {
    await t.cleanup();
  }
});

test('creatures: the AI fills in a stat block, with hit points and size unless already set; unknown creatures change nothing', async () => {
  const t = await setup({ llm: llm() });
  try {
    const base = `/campaigns/${t.campaign.id}/creatures`;
    const ogre = (await t.request('POST', base, { body: { name: 'Ogre', kind: 'enemy' } })).json();
    assert.equal((await t.request('POST', `${base}/${ogre.id}/stats`, { as: t.sam.token })).statusCode, 403);
    const filled = (await t.request('POST', `${base}/${ogre.id}/stats`)).json();
    assert.equal(filled.stats.ac, 11);
    assert.equal(filled.stats.source, 'ai');
    assert.equal(filled.hp_max, 59);
    assert.equal(filled.size, 2);

    const set = (await t.request('POST', base, { body: { name: 'Big Bob', kind: 'npc', hp_max: 20, size: 3 } })).json();
    const looked = (await t.request('POST', `${base}/${set.id}/stats`, { body: { name: 'Ogre' } })).json();
    assert.equal(looked.hp_max, 20);
    assert.equal(looked.size, 3);
    assert.match(t.llm.calls.filter((c) => c.purpose === 'map:stats').at(-1).prompt, /Ogre/);

    const odd = (await t.request('POST', base, { body: { name: 'Zorblax', kind: 'enemy' } })).json();
    assert.equal((await t.request('POST', `${base}/${odd.id}/stats`)).statusCode, 404);
  } finally {
    await t.cleanup();
  }
});

test('creatures: placed on a map as a numbered group in a row, with picture, stat block and hit points; players see only the tokens', async () => {
  const t = await setup({ llm: llm() });
  try {
    const map = await importMap(t);
    const base = `/campaigns/${t.campaign.id}/creatures`;
    const picture = { filename: 'goblin.png', data: (await terrain(80, 80)).toString('base64') };
    const goblin = (await t.request('POST', base, { body: { name: 'Goblin', kind: 'enemy', hp_max: 7, darkvision: 60, speed: 30, stats: { text: '**Goblin** AC 15', ac: 15 }, picture } })).json();
    assert.ok(goblin.picture);
    const img = await t.request('GET', `${base}/${goblin.id}/picture`);
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers['content-type'], 'image/webp');
    assert.equal((await t.request('GET', `${base}/${goblin.id}/picture`, { as: t.sam.token })).statusCode, 403);

    const place = (body, as) => t.request('POST', `${map.base}/creatures/${goblin.id}`, { body, as });
    assert.equal((await place({}, t.sam.token)).statusCode, 403);
    assert.equal((await place({ count: 21 })).statusCode, 400);
    const res = await place({ count: 3, x: 350, y: 245 });
    assert.equal(res.statusCode, 201, res.body);
    const { tokens } = res.json();
    assert.deepEqual(tokens.map((x) => x.name), ['Goblin 1', 'Goblin 2', 'Goblin 3']);
    for (const tok of tokens) {
      assert.equal(tok.kind, 'enemy');
      assert.deepEqual(tok.hp, { current: 7, max: 7 });
      assert.equal(tok.stats.ac, 15);
      assert.equal(tok.darkvision, 60);
      assert.equal(tok.speed, 30);
      assert.equal(tok.picture, goblin.picture);
      assert.equal(tok.art, undefined, 'file names stay on the server');
    }
    // A row, one square apart, snapped to the grid.
    assert.deepEqual(tokens.map((x) => x.x), [tokens[0].x, tokens[0].x + 35, tokens[0].x + 70]);
    assert.equal(new Set(tokens.map((x) => x.y)).size, 1);

    // One more alone carries on the numbering; a hidden one isn't sent to players.
    const more = (await place({ hidden: true })).json().tokens;
    assert.deepEqual(more.map((x) => x.name), ['Goblin 4']);

    // The token's picture is served to players who can see it, from the map's own copy.
    assert.equal((await t.request('GET', `${map.base}/tokens/${tokens[0].id}/picture`, { as: t.sam.token })).statusCode, 200);
    assert.equal((await t.request('GET', `${map.base}/tokens/${more[0].id}/picture`, { as: t.sam.token })).statusCode, 404);
    const copies = fs.readdirSync(path.join(t.archive.root, t.campaign.slug, 'maps', map.id, 'tokens'));
    assert.equal(copies.length, 1, 'copied once per map');

    const seen = (await t.request('GET', map.base, { as: t.sam.token })).json().tokens;
    assert.deepEqual(seen.map((x) => x.name), ['Goblin 1', 'Goblin 2', 'Goblin 3']);
    assert.ok(seen.every((x) => x.stats === null), 'players never get stat blocks');

    // Changing the creature later leaves placed tokens alone; removing it too.
    await t.request('PATCH', `${base}/${goblin.id}`, { body: { hp_max: 12 } });
    await t.request('DELETE', `${base}/${goblin.id}`);
    const after = (await t.request('GET', map.base)).json().tokens;
    assert.equal(after.length, 4);
    assert.deepEqual(after[0].hp, { current: 7, max: 7 });
    assert.equal((await place({})).statusCode, 404);
  } finally {
    await t.cleanup();
  }
});

test('creatures: a token already on a map is saved to the library with its picture and stat block', async () => {
  const t = await setup({ llm: llm() });
  try {
    const map = await importMap(t);
    const add = async (body) => (await t.request('POST', `${map.base}/tokens`, { body })).json().token;
    const ogre = await add({ kind: 'enemy', name: 'Ogre 2', x: 100, y: 100 });
    await t.request('POST', `${map.base}/tokens/${ogre.id}/stats`);
    await t.request('PUT', `${map.base}/tokens/${ogre.id}/picture`, { body: { filename: 'ogre.png', data: (await terrain(60, 60)).toString('base64') } });
    const pc = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id });

    const base = `/campaigns/${t.campaign.id}/creatures`;
    assert.equal((await t.request('POST', base, { body: { from: { map_id: map.id, token_id: pc.id } } })).statusCode, 400);
    assert.equal((await t.request('POST', base, { body: { from: { map_id: map.id, token_id: 'nope' } } })).statusCode, 404);
    assert.equal((await t.request('POST', base, { as: t.sam.token, body: { from: { map_id: map.id, token_id: ogre.id } } })).statusCode, 403);
    const res = await t.request('POST', base, { body: { from: { map_id: map.id, token_id: ogre.id } } });
    assert.equal(res.statusCode, 201, res.body);
    const saved = res.json();
    assert.equal(saved.name, 'Ogre');
    assert.equal(saved.kind, 'enemy');
    assert.equal(saved.size, 2);
    assert.equal(saved.hp_max, 59);
    assert.equal(saved.stats.source, 'ai');
    assert.ok(saved.picture);
    assert.equal((await t.request('GET', `${base}/${saved.id}/picture`)).statusCode, 200);
  } finally {
    await t.cleanup();
  }
});

test('creatures come back from the archive after losing the database', async () => {
  const t = await setup({ llm: llm() });
  try {
    const base = `/campaigns/${t.campaign.id}/creatures`;
    const goblin = (await t.request('POST', base, { body: { name: 'Goblin', kind: 'enemy', hp_max: 7, picture: { filename: 'g.png', data: (await terrain(40, 40)).toString('base64') } } })).json();
    await t.request('PATCH', `${base}/${goblin.id}`, { body: { notes: 'Ambush at the bridge.' } });
    const gone = (await t.request('POST', base, { body: { name: 'Gone', kind: 'npc' } })).json();
    await t.request('DELETE', `${base}/${gone.id}`);

    const ctx = await createContext({ config: t.config, paths: { archive: t.archive.root, db: path.join(t.dir, 'fresh.sqlite'), models: path.join(t.dir, 'models') }, llm: createFakeLLM(), embedder: fakeEmbedder, log: { error() {} } });
    try {
      const cid = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      const list = ctx.creatures.list(cid);
      assert.deepEqual(list.map((c) => [c.name, c.notes, c.hp_max]), [['Goblin', 'Ambush at the bridge.', 7]]);
      assert.ok(fs.existsSync(ctx.creatures.picturePath(cid, list[0])));
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }
  } finally {
    await t.cleanup();
  }
});
