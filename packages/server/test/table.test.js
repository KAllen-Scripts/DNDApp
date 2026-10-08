/**
 * What the table shares: dice rolls (party / DM only / just me), handouts,
 * and NPC/enemy token pictures. Plus notes that can be edited and deleted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, terrain, createFakeLLM } from './helpers.js';
import { createContext } from '../src/context.js';
import { fakeEmbedder } from './helpers.js';

/** A live stream of the campaign's table (rolls, handouts) for `token`. */
async function liveTable(t, token) {
  if (!t.app.server.listening) await t.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = t.app.server.address();
  const res = await fetch(`http://127.0.0.1:${port}/campaigns/${t.campaign.id}/live`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  return { res, reader: res.body.pipeThrough(new TextDecoderStream()).getReader(), events: [] };
}

/** Read whatever the stream has sent so far (waits a moment for it). */
async function drain(stream, ms = 150) {
  stream.text ??= '';
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    // A read still waiting from last time keeps its place, so no chunk is lost.
    stream.pending ??= stream.reader.read();
    const chunk = await Promise.race([stream.pending, new Promise((r) => setTimeout(() => r(null), deadline - Date.now()))]);
    if (!chunk) break;
    stream.pending = null;
    if (chunk.done) break;
    stream.text += chunk.value;
  }
  let m;
  while ((m = /event: ([\w-]+)\ndata: (.*)\n\n/.exec(stream.text))) {
    stream.text = stream.text.slice(m.index + m[0].length);
    stream.events.push({ event: m[1], data: JSON.parse(m[2]) });
  }
  return stream.events.splice(0);
}

const roll = (t, as, body) => t.request('POST', `/campaigns/${t.campaign.id}/roll`, { as, body: { notation: '1d20+2', ...body } });
const log = async (t, as) => (await t.request('GET', `/campaigns/${t.campaign.id}/rolls`, { as })).json().rolls;

test('rolls: shared with the party by default, or only with the DM, or kept to yourself; the DM can roll in secret', async () => {
  const t = await setup();
  const alexLive = await liveTable(t, t.alex.token);
  try {
    const party = await roll(t, t.sam.token, { label: 'Stealth' });
    assert.equal(party.statusCode, 200, party.body);
    const r = party.json();
    assert.equal(typeof r.total, 'number');
    assert.equal(r.roll.name, 'Thorin');
    assert.equal(r.roll.label, 'Stealth');
    assert.equal(r.roll.visibility, 'party');

    await roll(t, t.sam.token, { label: 'Insight', visibility: 'dm' });
    await roll(t, t.sam.token, { label: 'Just checking', visibility: 'self' });
    await roll(t, t.dmToken, { label: 'Ambush perception', visibility: 'dm' });

    assert.deepEqual((await log(t, t.alex.token)).map((x) => x.label), ['Stealth']);
    assert.deepEqual((await log(t, t.sam.token)).map((x) => x.label), ['Just checking', 'Insight', 'Stealth']);
    const dmLog = await log(t, t.dmToken);
    assert.deepEqual(dmLog.map((x) => x.label), ['Ambush perception', 'Insight', 'Stealth']);
    assert.equal(dmLog[0].from_dm, true);

    // Live: Alex only hears about the party roll.
    const heard = await drain(alexLive);
    assert.deepEqual(heard.filter((e) => e.event === 'roll').map((e) => e.data.label), ['Stealth']);

    // A bad visibility is refused.
    assert.equal((await roll(t, t.sam.token, { visibility: 'everyone' })).statusCode, 400);
  } finally {
    await alexLive.reader.cancel();
    await t.cleanup();
  }
});

test('handouts: the DM gives one to chosen players; others never see it or its picture; taking it back hides it', async () => {
  const t = await setup();
  const samLive = await liveTable(t, t.sam.token);
  const alexLive = await liveTable(t, t.alex.token);
  const base = `/campaigns/${t.campaign.id}/handouts`;
  try {
    const png = (await terrain(64, 48)).toString('base64');
    // Players can't give handouts.
    assert.equal((await t.request('POST', base, { as: t.sam.token, body: { title: 'x', text: 'y', to: 'everyone' } })).statusCode, 403);
    // Needs text or a picture; recipients must be in the campaign.
    assert.equal((await t.request('POST', base, { body: { title: 'Empty', to: 'everyone' } })).statusCode, 400);
    assert.equal((await t.request('POST', base, { body: { title: 'x', text: 'y', to: [9999] } })).statusCode, 400);

    const res = await t.request('POST', base, { body: { title: 'Letter from the Baron', text: 'Meet me at the mill.', to: [t.sam.id], picture: { filename: 'seal.png', data: png } } });
    assert.equal(res.statusCode, 201, res.body);
    const h = res.json();
    assert.deepEqual(h.to, [t.sam.id]);
    assert.equal(h.image.width, 64);

    const samSees = (await t.request('GET', base, { as: t.sam.token })).json();
    assert.equal(samSees.can_edit, false);
    assert.deepEqual(samSees.handouts.map((x) => x.title), ['Letter from the Baron']);
    assert.equal(samSees.handouts[0].to, undefined, 'players are not told who else got it');
    assert.equal((await t.request('GET', base, { as: t.alex.token })).json().handouts.length, 0);

    const img = await t.request('GET', `${base}/${h.id}/image`, { as: t.sam.token });
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers['content-type'], 'image/webp');
    assert.equal((await t.request('GET', `${base}/${h.id}/image`, { as: t.alex.token })).statusCode, 404);

    let samHeard = await drain(samLive);
    assert.deepEqual(samHeard.filter((e) => e.event === 'handout').map((e) => e.data.title), ['Letter from the Baron']);
    let alexHeard = await drain(alexLive);
    assert.equal(alexHeard.filter((e) => e.event === 'handout').length, 0);

    // Given to everyone: Alex gets it live.
    const changed = await t.request('PATCH', `${base}/${h.id}`, { body: { to: 'everyone' } });
    assert.equal(changed.statusCode, 200, changed.body);
    alexHeard = await drain(alexLive);
    assert.deepEqual(alexHeard.filter((e) => e.event === 'handout').map((e) => e.data.id), [h.id]);

    // Taken back: gone for everyone; the archive keeps every version and the picture.
    assert.equal((await t.request('DELETE', `${base}/${h.id}`)).statusCode, 200);
    samHeard = await drain(samLive);
    assert.ok(samHeard.some((e) => e.event === 'handout-gone' && e.data.id === h.id));
    assert.equal((await t.request('GET', base, { as: t.sam.token })).json().handouts.length, 0);
    assert.equal((await t.request('GET', base)).json().handouts.length, 0);
    const dir = path.join(t.archive.root, t.campaign.slug, 'handouts', h.id);
    const lines = fs.readFileSync(path.join(dir, 'changes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => [l.to, l.removed]), [[[t.sam.id], false], ['everyone', false], ['everyone', true]]);
    assert.ok(fs.readdirSync(dir).some((f) => f.endsWith('.png')));
  } finally {
    await samLive.reader.cancel();
    await alexLive.reader.cancel();
    await t.cleanup();
  }
});

test('handouts and edited notes come back from the archive after losing the database', async () => {
  const t = await setup();
  try {
    const base = `/campaigns/${t.campaign.id}`;
    await t.request('POST', `${base}/handouts`, { body: { title: 'Wanted poster', text: '500 gold for the Ashen Prophet.', to: 'everyone' } });
    const note = (await t.request('POST', `${base}/notes`, { as: t.sam.token, body: { text: 'Hall?' } })).json();
    await t.request('PATCH', `${base}/notes/${note.id}`, { as: t.sam.token, body: { text: 'Hal, not Hall.' } });
    const gone = (await t.request('POST', `${base}/notes`, { as: t.sam.token, body: { text: 'Delete me' } })).json();
    await t.request('DELETE', `${base}/notes/${gone.id}`, { as: t.sam.token });

    // A fresh database over the same archive.
    const ctx = await createContext({ config: t.config, paths: { archive: t.archive.root, db: path.join(t.dir, 'fresh.sqlite'), models: path.join(t.dir, 'models') }, llm: createFakeLLM(), embedder: fakeEmbedder, log: { error() {} } });
    try {
      const cid = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      assert.deepEqual(ctx.handouts.list(cid, { role: 'player', userId: t.alex.id }).map((h) => h.title), ['Wanted poster']);
      assert.deepEqual(ctx.store.playerNotes(cid, { userId: t.sam.id }).map((n) => n.text), ['Hal, not Hall.']);
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }
  } finally {
    await t.cleanup();
  }
});

test('token pictures: the DM gives NPCs and enemies pictures (all the goblins at once); players see them only on tokens they can see', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: () => ({ readable: true, kind: 'battle', name: 'Cave', description: '', grid: { visible: false, columns: null, rows: null }, scale: { distance: null, unit: null, per: null }, notes: '' }) }) });
  try {
    const base = `/campaigns/${t.campaign.id}/maps`;
    const map = (await t.request('POST', base, { body: { filename: 'cave.png', data: (await terrain(300, 300)).toString('base64') } })).json();
    for (let i = 0; t.maps.get(t.campaign.id, map.id).reading.status === 'pending' && i < 200; i++) await new Promise((r) => setTimeout(r, 20));
    await t.request('PATCH', `${base}/${map.id}`, { body: { shown: true } });
    const add = async (body) => (await t.request('POST', `${base}/${map.id}/tokens`, { body })).json().token;
    const g1 = await add({ kind: 'enemy', name: 'Goblin', x: 50, y: 50 });
    const g2 = await add({ kind: 'enemy', name: 'goblin', x: 100, y: 50 });
    const boss = await add({ kind: 'enemy', name: 'Goblin boss', x: 150, y: 50, hidden: true });
    const pc = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 200, y: 50 });
    const picture = { filename: 'goblin.png', data: (await terrain(80, 80)).toString('base64') };

    // Players can't; player characters use their own player's picture.
    assert.equal((await t.request('PUT', `${base}/${map.id}/tokens/${g1.id}/picture`, { as: t.sam.token, body: picture })).statusCode, 403);
    assert.equal((await t.request('PUT', `${base}/${map.id}/tokens/${pc.id}/picture`, { body: picture })).statusCode, 400);

    const res = await t.request('PUT', `${base}/${map.id}/tokens/${g1.id}/picture`, { body: { ...picture, same_name: true } });
    assert.equal(res.statusCode, 200, res.body);
    const byId = (m) => new Map(m.tokens.map((x) => [x.id, x]));
    const tokens = byId(res.json().map);
    assert.ok(tokens.get(g1.id).picture);
    assert.equal(tokens.get(g2.id).picture, tokens.get(g1.id).picture, 'same name, same picture');
    assert.equal(tokens.get(boss.id).picture, null, 'a different name is left alone');
    assert.equal(tokens.get(g1.id).art, undefined, 'file names stay on the server');

    const img = await t.request('GET', `${base}/${map.id}/tokens/${g1.id}/picture`, { as: t.sam.token });
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers['content-type'], 'image/webp');
    // A hidden token's picture isn't served to players.
    await t.request('PUT', `${base}/${map.id}/tokens/${boss.id}/picture`, { body: picture });
    assert.equal((await t.request('GET', `${base}/${map.id}/tokens/${boss.id}/picture`, { as: t.sam.token })).statusCode, 404);
    assert.equal((await t.request('GET', `${base}/${map.id}/tokens/${boss.id}/picture`)).statusCode, 200);

    // Removed: back to initials; the archive keeps the file.
    const cleared = await t.request('DELETE', `${base}/${map.id}/tokens/${g2.id}/picture`);
    assert.equal(byId(cleared.json().map).get(g2.id).picture, null);
    assert.ok(fs.readdirSync(path.join(t.archive.root, t.campaign.slug, 'maps', map.id, 'tokens')).length >= 2);
  } finally {
    await t.cleanup();
  }
});
