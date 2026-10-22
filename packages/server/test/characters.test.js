/**
 * A player's characters: several sheets, one active (the one they play),
 * private to them, archived and restored, and everything that reads "the
 * player's sheet" uses the active one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, createFakeLLM, fakeEmbedder } from './helpers.js';
import sharp from 'sharp';
import { createContext } from '../src/context.js';
import { emptySheet } from '@dndapp/shared/sheet.js';

const fighter = (name, over = {}) => ({ ...emptySheet({ name }), classes: [{ name: 'Fighter', subclass: '', level: 3 }], ...over });

test('characters: a new one becomes active, the first is kept; switching, renaming and deleting', async () => {
  const t = await setup();
  try {
    const base = `/campaigns/${t.campaign.id}`;
    const as = t.sam.token;
    // Before anything is saved: the blank first character.
    let list = (await t.request('GET', `${base}/characters`, { as })).json();
    assert.deepEqual(list.characters.map((c) => [c.number, c.name, c.active, c.version]), [[1, 'Thorin', true, 0]]);

    await t.request('PUT', `${base}/sheet`, { as, body: { sheet: fighter('Thorin'), version: 0 } });
    const made = await t.request('POST', `${base}/characters`, { as, body: { name: 'Brynja' } });
    assert.equal(made.statusCode, 201);
    assert.equal(made.json().number, 2);
    assert.equal(made.json().sheet.sheet.name, 'Brynja');
    assert.equal(made.json().sheet.number, 2);
    assert.equal(made.json().sheet.sheet.player_name, 'Sam');
    list = made.json();
    assert.deepEqual(list.characters.map((c) => [c.number, c.name, c.active]), [[1, 'Thorin', false], [2, 'Brynja', true]]);
    assert.equal(list.characters[0].summary, 'Fighter 3');

    // The sheet is now Brynja's; the membership's character follows (Ask, the archivist, speakers).
    let sheet = (await t.request('GET', `${base}/sheet`, { as })).json();
    assert.equal(sheet.sheet.name, 'Brynja');
    assert.equal(sheet.number, 2);
    assert.equal(t.auth.membership(t.campaign.id, t.sam.id).character_name, 'Brynja');
    const members = JSON.parse(fs.readFileSync(path.join(t.paths.archive, t.campaign.slug, 'members.json'), 'utf8'));
    assert.equal(members.find((m) => m.user_id === t.sam.id).character_name, 'Brynja');

    // A page still showing Thorin can't save over Brynja, even at the same version.
    const stale = await t.request('PUT', `${base}/sheet`, { as, body: { sheet: fighter('Thorin', { xp: '900' }), version: 1, character: 1 } });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().switched, true);
    assert.equal(stale.json().current.number, 2);
    assert.equal((await t.request('PUT', `${base}/sheet`, { as, body: { sheet: { ...sheet.sheet, xp: '50' }, version: 1, character: 2 } })).statusCode, 200);

    // Rename the one not played; it keeps everything else.
    const renamed = await t.request('PATCH', `${base}/characters/1`, { as, body: { name: 'Thorin Oakenshield' } });
    assert.equal(renamed.statusCode, 200);
    assert.equal(renamed.json().characters[0].name, 'Thorin Oakenshield');
    assert.equal(t.sheets.get(t.campaign.id, t.sam.id, 1).sheet.classes[0].name, 'Fighter');
    assert.equal(t.auth.membership(t.campaign.id, t.sam.id).character_name, 'Brynja');

    // Switch back.
    const back = await t.request('POST', `${base}/characters/1/active`, { as });
    assert.equal(back.statusCode, 200);
    assert.equal(back.json().sheet.sheet.name, 'Thorin Oakenshield');
    assert.equal(back.json().active, 1);
    assert.equal(t.auth.membership(t.campaign.id, t.sam.id).character_name, 'Thorin Oakenshield');

    // The active one can't be deleted; another can, and is gone from the list (the archive keeps it).
    const refused = await t.request('DELETE', `${base}/characters/1`, { as });
    assert.equal(refused.statusCode, 400);
    assert.match(refused.json().error, /Make another one active first/);
    const deleted = await t.request('DELETE', `${base}/characters/2`, { as });
    assert.equal(deleted.statusCode, 200);
    assert.deepEqual(deleted.json().characters.map((c) => c.number), [1]);
    assert.equal((await t.request('POST', `${base}/characters/2/active`, { as })).statusCode, 404);
    const dir = path.join(t.paths.archive, t.campaign.slug, 'character-sheets');
    assert.ok(fs.existsSync(path.join(dir, `${t.sam.id}-2.jsonl`)));
    const lists = fs.readFileSync(path.join(dir, `${t.sam.id}.characters.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lists.at(-1).deleted.map((d) => d.number), [2]);
    assert.equal(lists.at(-1).active, 1);

    // A new one gets a fresh number; a name is needed.
    assert.equal((await t.request('POST', `${base}/characters`, { as, body: { name: '  ' } })).statusCode, 400);
    const third = (await t.request('POST', `${base}/characters`, { as, body: { name: 'Cora', active: false } })).json();
    assert.equal(third.number, 3);
    assert.equal(third.active, 1);
    assert.equal(third.sheet, undefined);
  } finally {
    await t.cleanup();
  }
});

test("characters: private to their player; the DM has none and sees only the one each player plays", async () => {
  const t = await setup();
  try {
    const base = `/campaigns/${t.campaign.id}`;
    await t.request('PUT', `${base}/sheet`, { as: t.sam.token, body: { sheet: fighter('Thorin'), version: 0 } });
    await t.request('POST', `${base}/characters`, { as: t.sam.token, body: { name: 'Secret Second' } });
    // Alex sees only their own list; they can't touch Sam's characters (the numbers are per player).
    const alexList = (await t.request('GET', `${base}/characters`, { as: t.alex.token })).json();
    assert.deepEqual(alexList.characters.map((c) => c.name), ['Lyra']);
    assert.equal((await t.request('POST', `${base}/characters/2/active`, { as: t.alex.token })).statusCode, 404);
    assert.equal((await t.request('GET', `${base}/characters`, { as: t.dmToken })).statusCode, 403);
    assert.equal((await t.request('POST', `${base}/characters`, { as: t.dmToken, body: { name: 'X' } })).statusCode, 403);
    // The DM's view of equipped gear shows the active character only.
    const eq = (await t.request('GET', `${base}/gear/equipped`, { as: t.dmToken })).json();
    const sam = eq.players.find((p) => p.user_id === t.sam.id);
    assert.equal(sam.character, 'Secret Second');
    assert.ok(!JSON.stringify(eq).includes('"Thorin"'));
  } finally {
    await t.cleanup();
  }
});

test('characters: rests, map tokens and pictures use the active character', async () => {
  const t = await setup();
  try {
    const base = `/campaigns/${t.campaign.id}`;
    const cid = t.campaign.id;
    await t.request('PUT', `${base}/sheet`, { as: t.sam.token, body: { sheet: fighter('Thorin', { hp: { current: 5, temp: null } }), version: 0 } });
    await t.request('POST', `${base}/characters`, { as: t.sam.token, body: { name: 'Brynja' } });
    await t.sheets.save(cid, t.sam.id, fighter('Brynja', { hp: { current: 3, temp: null } }), { number: 2 });
    // The map token is named after the character played now, with that sheet's hit points.
    const buf = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#888' } }).png().toBuffer();
    const map = t.maps.create(cid, { name: 'Vale', buf, ext: 'png', type: 'image/png', width: 200, height: 100, by: t.dm.id });
    t.maps.change(cid, map.id, (m) => { m.tokens.push({ id: 'aaaaaa', kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 50, y: 50 }); }, { by: t.dm.id });
    const token = () => t.maps.view(t.maps.get(cid, map.id), { role: 'dm', userId: t.dm.id }).tokens[0];
    assert.equal(token().name, 'Brynja');
    assert.equal(token().hp.current, 3);
    const heard = [];
    t.sheets.events.on('save', (e) => heard.push(e));
    t.sheets.setActive(cid, t.sam.id, 1);
    assert.equal(heard.at(-1).switched, true);
    assert.equal(heard.at(-1).number, 1);
    assert.equal(token().name, 'Thorin');
    assert.equal(token().hp.current, 5);
    // Hit points changed from the map land on the active sheet only.
    t.maps.setSheetHp(cid, t.sam.id, 9, { by: t.dm.id });
    assert.equal(t.sheets.get(cid, t.sam.id, 1).sheet.hp.current, 9);
    assert.equal(t.sheets.get(cid, t.sam.id, 2).sheet.hp.current, 3);
    // A save to a character not played isn't announced as the player's sheet (maps, other windows).
    const before = heard.length;
    t.sheets.save(cid, t.sam.id, fighter('Brynja', { xp: '10' }), { number: 2 });
    assert.equal(heard.length, before);
    // Pictures belong to a character.
    t.db.prepare("INSERT INTO character_pictures (campaign_id, user_id, number, data, updated_at) VALUES (?, ?, 2, ?, 'x')")
      .run(cid, t.sam.id, JSON.stringify({ token: { file: 'token-a.png', type: 'image/png', width: 1, height: 1, uploaded_at: 'x' } }));
    assert.equal(t.pictures.tokenKey(cid, t.sam.id), null);
    t.sheets.setActive(cid, t.sam.id, 2);
    assert.equal(t.pictures.tokenKey(cid, t.sam.id), 'token-a');
  } finally {
    await t.cleanup();
  }
});

test('characters: restored from the archive with the same one active and deleted ones hidden', async () => {
  const t = await setup();
  try {
    const cid = t.campaign.id;
    t.sheets.save(cid, t.sam.id, fighter('Thorin'));
    t.sheets.create(cid, t.sam.id, 'Brynja');
    t.sheets.create(cid, t.sam.id, 'Cora');
    t.sheets.save(cid, t.sam.id, fighter('Cora', { xp: '77' }));
    t.sheets.setActive(cid, t.sam.id, 2);
    t.sheets.remove(cid, t.sam.id, 3);
    t.sheets.save(cid, t.alex.id, fighter('Lyra'));
    const ctx = await createContext({ config: t.config, paths: { ...t.paths, db: path.join(t.dir, 'restored.sqlite') }, llm: createFakeLLM(), embedder: fakeEmbedder, log: { error() {} } });
    try {
      const rid = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      assert.deepEqual(ctx.sheets.list(rid, t.sam.id).map((c) => [c.number, c.name, c.active]), [[1, 'Thorin', false], [2, 'Brynja', true]]);
      assert.equal(ctx.sheets.get(rid, t.sam.id).sheet.name, 'Brynja');
      assert.equal(ctx.sheets.get(rid, t.sam.id, 3), null);
      assert.equal(ctx.db.prepare('SELECT data FROM character_sheets WHERE campaign_id = ? AND user_id = ? AND number = 3').get(rid, t.sam.id) != null, true);
      assert.equal(ctx.sheets.get(rid, t.alex.id).sheet.name, 'Lyra');
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }
  } finally {
    await t.cleanup();
  }
});

test('characters: the archivist reads every character, marked, and hears about switches', async () => {
  const t = await setup();
  try {
    const cid = t.campaign.id;
    t.updates.setMark(cid, '2000-01-01T00:00:00.000Z');
    t.sheets.save(cid, t.sam.id, fighter('Thorin'));
    t.sheets.create(cid, t.sam.id, 'Brynja');
    t.sheets.remove(cid, t.sam.id, 1);
    assert.equal(t.updates.pendingSince(cid), true);
    const got = await t.updates.collect(cid);
    const text = got.sheets.join('\n\n');
    assert.match(text, /character="1" status="deleted by the player"/);
    assert.match(text, /character="2" status="the character they play now"/);
    assert.match(text, /now plays Brynja instead of Thorin/);
    assert.match(text, /deleted their character Thorin/);
    assert.match(text, /plays="Brynja"/);
  } finally {
    await t.cleanup();
  }
});
