/** Players' pictures of their characters: token pictures on maps, and full pictures the AI describes for the sheet. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup, createFakeLLM, fakeEmbedder, PASSWORD } from './helpers.js';
import { createContext } from '../src/context.js';

const picture = (width, height, format = 'png') =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } } })[format]().toBuffer();

/** What the AI might say about a picture of a character. */
const described = (over = {}) => ({
  is_character: true,
  appearance: 'A tall half-elf in a travel-stained green cloak, a longbow over one shoulder.',
  eyes: 'Grey',
  hair: 'Black, tied back',
  skin: '',
  notes: '',
  ...over,
});

const pictureLLM = (handler = () => described()) => createFakeLLM({ structured: (opts) => handler(opts) });

const upload = (t, kind, buf, { as = t.sam.token, ...body } = {}) =>
  t.request('PUT', `/campaigns/${t.campaign.id}/character/${kind}`, { as, body: { filename: `${kind}.png`, data: buf.toString('base64'), ...body } });

test('pictures: a token picture is archived as uploaded, shown square to everyone in the campaign, and on the maps their token is on', async () => {
  const t = await setup();
  try {
    const cid = t.campaign.id;
    // Sam's token on a map, before he has a picture.
    const map = t.maps.create(cid, { name: 'Vale', buf: await picture(400, 300), ext: 'png', type: 'image/png', width: 400, height: 300, by: t.dm.id });
    t.maps.change(cid, map.id, (m) => {
      m.shown = true;
      m.tokens.push({ id: 'aaaaaa', kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 50, y: 50 });
      m.tokens.push({ id: 'bbbbbb', kind: 'enemy', name: 'Goblin', x: 90, y: 90 });
    });
    let mapView = (await t.request('GET', `/campaigns/${cid}/maps/${map.id}`, { as: t.alex.token })).json();
    assert.equal(mapView.tokens.find((x) => x.name === 'Thorin').picture, null);
    assert.equal((await t.request('GET', `/campaigns/${cid}/members/${t.sam.id}/token`, { as: t.alex.token })).statusCode, 404);

    const updates = [];
    const listener = (m) => updates.push(m.id);
    t.maps.events.on('update', listener);
    const buf = await picture(600, 400, 'jpeg');
    const res = await upload(t, 'token', buf);
    t.maps.events.off('update', listener);
    assert.equal(res.statusCode, 200, res.body);
    const { token } = res.json().pictures;
    assert.ok(token.key.startsWith('token-'));
    assert.deepEqual([token.width, token.height], [600, 400]);
    assert.deepEqual(updates, [map.id], 'maps with their token are sent again, live');

    // In the archive exactly as uploaded.
    const dir = path.join(t.paths.archive, t.campaign.slug, 'characters', String(t.sam.id));
    const files = fs.readdirSync(dir);
    assert.ok(fs.readFileSync(path.join(dir, files.find((f) => f.endsWith('.jpg')))).equals(buf));
    assert.ok(files.includes('pictures.jsonl'));

    // The token's picture key is on the map for everyone; the enemy has none.
    mapView = (await t.request('GET', `/campaigns/${cid}/maps/${map.id}`, { as: t.alex.token })).json();
    assert.equal(mapView.tokens.find((x) => x.name === 'Thorin').picture, token.key);
    assert.equal(mapView.tokens.find((x) => x.name === 'Goblin').picture, null);
    assert.equal((await t.request('GET', `/campaigns/${cid}/maps/${map.id}`)).json().tokens.find((x) => x.name === 'Thorin').picture, token.key);

    // Anyone in the campaign gets it as a square; nobody outside does.
    const img = await t.request('GET', `/campaigns/${cid}/members/${t.sam.id}/token`, { as: t.alex.token });
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers['content-type'], 'image/webp');
    const meta = await sharp(img.rawPayload).metadata();
    assert.deepEqual([meta.width, meta.height], [256, 256]);
    await t.auth.createUser('Zed', { password: PASSWORD });
    const zed = await t.auth.login('Zed', PASSWORD);
    assert.equal((await t.request('GET', `/campaigns/${cid}/members/${t.sam.id}/token`, { as: zed.token })).statusCode, 403);
    assert.equal((await t.request('GET', `/campaigns/${cid}/members/999/token`, { as: t.alex.token })).statusCode, 404);

    // Removing it takes it off the map (the archive keeps the file).
    const removed = await t.request('DELETE', `/campaigns/${cid}/character/token`, { as: t.sam.token });
    assert.equal(removed.json().pictures.token, null);
    mapView = (await t.request('GET', `/campaigns/${cid}/maps/${map.id}`, { as: t.alex.token })).json();
    assert.equal(mapView.tokens.find((x) => x.name === 'Thorin').picture, null);
    assert.ok(fs.readdirSync(dir).some((f) => f.endsWith('.jpg')));
  } finally {
    await t.cleanup();
  }
});

test('pictures: anything that is not a picture is refused', async () => {
  const t = await setup();
  try {
    let res = await upload(t, 'token', Buffer.from('not a picture'));
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /isn't a picture/);
    res = await t.request('PUT', `/campaigns/${t.campaign.id}/character/sword`, { as: t.sam.token, body: { data: 'aGk=' } });
    assert.equal(res.statusCode, 404);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/character/pictures`, { as: t.sam.token })).json().token, null);
  } finally {
    await t.cleanup();
  }
});

test('pictures: a full picture is private, and the AI describes it into the sheet without overwriting what the player wrote', async () => {
  const llm = pictureLLM();
  const t = await setup({ llm });
  try {
    const cid = t.campaign.id;
    let res = await upload(t, 'picture', await picture(800, 1200));
    assert.equal(res.statusCode, 200, res.body);
    let body = res.json();
    assert.ok(body.pictures.picture.key.startsWith('picture-'));
    assert.equal(body.applied, true);
    assert.equal(body.sheet.sheet.appearance, described().appearance);
    assert.equal(body.sheet.sheet.eyes, 'Grey');
    assert.equal(body.sheet.sheet.hair, 'Black, tied back');
    assert.equal(body.sheet.sheet.skin, '');
    const call = llm.calls.find((c) => c.purpose === 'sheet:picture');
    assert.equal(call.attachments[0].media_type, 'image/jpeg');

    // The sheet really changed (the page reloads it from this answer).
    const sheet = (await t.request('GET', `/campaigns/${cid}/sheet`, { as: t.sam.token })).json();
    assert.equal(sheet.sheet.appearance, described().appearance);
    assert.equal(sheet.version, body.sheet.version);

    // Only Sam gets his full picture; nobody else's is reachable.
    const own = await t.request('GET', `/campaigns/${cid}/character/picture/image`, { as: t.sam.token });
    assert.equal(own.statusCode, 200);
    assert.deepEqual([(await sharp(own.rawPayload).metadata()).height], [1200]);
    assert.equal((await t.request('GET', `/campaigns/${cid}/character/picture/image`, { as: t.alex.token })).statusCode, 404);
    assert.equal((await t.request('GET', `/campaigns/${cid}/members/${t.sam.id}/token`, { as: t.alex.token })).statusCode, 404, 'a full picture is not a token');

    // Sam edits his appearance; a new picture doesn't overwrite it unless he says so.
    await t.request('PUT', `/campaigns/${cid}/sheet`, { as: t.sam.token, body: { sheet: { ...sheet.sheet, appearance: 'My words.', eyes: 'Blue' }, version: sheet.version } });
    res = await upload(t, 'picture', await picture(500, 500));
    body = res.json();
    assert.equal(body.applied, false);
    assert.equal(body.description.appearance, described().appearance);
    assert.equal(body.sheet.sheet.appearance, 'My words.');
    assert.equal(body.sheet.sheet.eyes, 'Blue');
    res = await t.request('POST', `/campaigns/${cid}/character/picture/describe`, { as: t.sam.token, body: { replace: true } });
    assert.equal(res.json().applied, true);
    assert.equal(res.json().sheet.sheet.appearance, described().appearance);
    assert.equal(res.json().sheet.sheet.eyes, 'Blue', 'eyes, hair and skin are only filled in when empty');

    // Without asking the AI.
    const calls = llm.calls.length;
    res = await upload(t, 'picture', await picture(300, 300), { describe: false });
    assert.equal(res.json().description, undefined);
    assert.equal(llm.calls.length, calls);
  } finally {
    await t.cleanup();
  }
});

test("pictures: if the AI sees no character, or can't be reached, the picture is still saved and the sheet left alone", async () => {
  let reply = () => described({ is_character: false, appearance: '', notes: 'This is a landscape.' });
  const t = await setup({ llm: pictureLLM(() => reply()) });
  try {
    let res = await upload(t, 'picture', await picture(400, 400));
    let body = res.json();
    assert.equal(body.applied, false);
    assert.equal(body.description.notes, 'This is a landscape.');
    assert.equal(body.sheet, undefined);
    reply = () => {
      throw new Error('the AI is down');
    };
    res = await upload(t, 'picture', await picture(400, 400));
    body = res.json();
    assert.equal(res.statusCode, 200);
    assert.match(body.error, /saved, but the AI couldn't describe it: the AI is down/);
    assert.ok(body.pictures.picture);
    // Describing on its own reports the error.
    res = await t.request('POST', `/campaigns/${t.campaign.id}/character/picture/describe`, { as: t.sam.token, body: {} });
    assert.equal(res.statusCode, 500);
  } finally {
    await t.cleanup();
  }
});

test('pictures: restored from the archive', async () => {
  const t = await setup();
  try {
    await upload(t, 'token', await picture(300, 300));
    await upload(t, 'picture', await picture(300, 500), { describe: false });
    await upload(t, 'token', await picture(320, 320));
    const before = t.pictures.view(t.campaign.id, t.sam.id);
    const fresh = await createContext({ config: t.config, paths: { ...t.paths, db: path.join(t.dir, 'fresh.sqlite') }, llm: createFakeLLM(), embedder: fakeEmbedder });
    try {
      const c = fresh.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug);
      assert.deepEqual(fresh.pictures.view(c.id, t.sam.id), before);
      assert.equal(before.token.width, 320);
      const img = await fresh.pictures.image(c.id, t.sam.id, 'token');
      assert.equal(img.type, 'image/webp');
    } finally {
      fresh.jobs.stop();
      await fresh.jobs.idle();
      fresh.db.close();
    }
  } finally {
    await t.cleanup();
  }
});
