/**
 * Rests and hit dice: players spend hit dice (rolled by the server, shared
 * like any roll) and take short rests; the DM calls short and long rests for
 * the party, which change the sheets, go out live, are archived and counted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, createFakeLLM, fakeEmbedder } from './helpers.js';
import { createContext } from '../src/context.js';

const THORIN = {
  name: 'Thorin',
  classes: [{ name: 'Fighter', subclass: '', level: 3 }, { name: 'Wizard', subclass: '', level: 2 }],
  abilities: { str: 16, dex: 12, con: 14, int: 12, wis: 10, cha: 8 },
  hp: { current: 10, temp: 4 },
  hit_dice_spent: { 10: 3, 6: 1 },
  death_saves: { successes: 1, failures: 2 },
  spellcasting: { class: 'Wizard', slots_used: { 1: 2 }, pact_used: 0 },
};
// Fighter 3 / Wizard 2, Con +2: 10+2 + 2×(6+2) + 2×(4+2) = 40 hit points; hit dice 3d10 + 2d6.

const saveSheet = async (t, who, sheet) => {
  const res = await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: who.token, body: { sheet, version: 0 } });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
};
const sheetOf = async (t, who) => (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: who.token })).json();

test('spending a hit die: the server rolls it plus Constitution, heals up to the maximum, marks it spent, and shares the roll', async () => {
  const t = await setup();
  try {
    await saveSheet(t, t.sam, THORIN);
    const base = `/campaigns/${t.campaign.id}/sheet/hit-dice`;
    const res = await t.request('POST', base, { as: t.sam.token, body: { die: 6 } });
    assert.equal(res.statusCode, 200, res.body);
    const r = res.json();
    assert.equal(r.notation, '1d6+2');
    assert.ok(r.total >= 3 && r.total <= 8);
    assert.equal(r.healed, r.total);
    assert.equal(r.sheet.hp.current, 10 + r.total);
    assert.deepEqual(r.sheet.hit_dice_spent, { 10: 3, 6: 2 });
    assert.equal(r.version, 2);
    assert.equal(r.roll.label, 'Hit die (d6)');
    // It's in the roll log like any roll: Alex sees it.
    const alexLog = (await t.request('GET', `/campaigns/${t.campaign.id}/rolls`, { as: t.alex.token })).json().rolls;
    assert.deepEqual(alexLog.map((x) => x.label), ['Hit die (d6)']);
    // The archive says why the sheet changed.
    const lines = fs.readFileSync(path.join(t.archive.root, t.campaign.slug, 'character-sheets', `${t.sam.id}.jsonl`), 'utf8').trim().split('\n').map(JSON.parse);
    assert.match(lines.at(-1).reason, /spent a d6 hit die/);

    // None left of that size, or a size they don't have: refused.
    assert.match((await t.request('POST', base, { as: t.sam.token, body: { die: 10 } })).json().error, /no d10 hit dice left/);
    assert.match((await t.request('POST', base, { as: t.sam.token, body: { die: 12 } })).json().error, /no d12/);
    assert.equal((await t.request('POST', base, { as: t.sam.token, body: { die: 7 } })).statusCode, 400);
    // The DM has no sheet, so no hit dice.
    assert.equal((await t.request('POST', base, { body: { die: 6 } })).statusCode, 403);

    // Healing stops at the maximum.
    await t.request('POST', base, { as: t.sam.token, body: { die: 6 } });
    const near = await sheetOf(t, t.sam);
    near.sheet.hp.current = 39;
    near.sheet.hit_dice_spent = {};
    await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: near });
    const capped = (await t.request('POST', base, { as: t.sam.token, body: { die: 10, visibility: 'self' } })).json();
    assert.equal(capped.sheet.hp.current, 40);
    assert.equal(capped.healed, 1);
    assert.equal(capped.roll.visibility, 'self');
  } finally {
    await t.cleanup();
  }
});

test("a player's short rest brings back Pact Magic slots and nothing else", async () => {
  const t = await setup();
  try {
    await saveSheet(t, t.alex, { name: 'Lyra', classes: [{ name: 'Warlock', level: 3 }], hp: { current: 5 }, spellcasting: { class: 'Warlock', pact_used: 2 } });
    const res = await t.request('POST', `/campaigns/${t.campaign.id}/sheet/short-rest`, { as: t.alex.token });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().sheet.spellcasting.pact_used, 0);
    assert.equal(res.json().sheet.hp.current, 5);
    assert.equal((await t.request('POST', `/campaigns/${t.campaign.id}/sheet/short-rest`)).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('the DM calls a long rest: sheets restored (2014: half the hit dice back), players hear it live, archived, counted, restored', async () => {
  const t = await setup();
  try {
    await saveSheet(t, t.sam, THORIN);
    await saveSheet(t, t.alex, { name: 'Lyra', classes: [{ name: 'Rogue', level: 2 }], hp: { current: 0 } });
    const base = `/campaigns/${t.campaign.id}/rests`;
    // Only the DM calls rests.
    assert.equal((await t.request('POST', base, { as: t.sam.token, body: { kind: 'long' } })).statusCode, 403);
    const heard = [];
    t.rests.events.on('rest', (r) => heard.push(r));

    const res = await t.request('POST', base, { body: { kind: 'long' } });
    assert.equal(res.statusCode, 201, res.body);
    const rest = res.json();
    assert.equal(rest.kind, 'long');
    assert.equal(rest.edition, '2014');
    assert.deepEqual(rest.user_ids.sort(), [t.sam.id, t.alex.id].sort());
    // Lyra was at 0 hit points: under the 2014 rules she gets nothing from it.
    assert.deepEqual(rest.skipped, [t.alex.id]);
    assert.equal(heard.length, 1);
    assert.equal(heard[0].campaign_id, t.campaign.id);

    const thorin = (await sheetOf(t, t.sam)).sheet;
    assert.equal(thorin.hp.current, 40);
    assert.equal(thorin.hp.temp, null);
    assert.deepEqual(thorin.death_saves, { successes: 0, failures: 0 });
    assert.deepEqual(thorin.spellcasting.slots_used, {});
    // 5 hit dice in all, so 2 come back, the biggest first: of 3d10 and 1d6 spent, 1d10 and 1d6 stay spent.
    assert.deepEqual(thorin.hit_dice_spent, { 10: 1, 6: 1 });
    assert.equal((await sheetOf(t, t.alex)).sheet.hp.current, 0);

    // A short rest for Sam only.
    const short = (await t.request('POST', base, { body: { kind: 'short', to: [t.sam.id] } })).json();
    assert.deepEqual(short.user_ids, [t.sam.id]);
    // Not a player in this campaign: refused.
    assert.equal((await t.request('POST', base, { body: { kind: 'long', to: [t.dm.id] } })).statusCode, 400);

    // Anyone in the campaign can see the list; counting is for things like merchants restocking.
    const list = (await t.request('GET', base, { as: t.alex.token })).json();
    assert.deepEqual(list.rests.map((r) => r.kind), ['short', 'long']);
    // Who got nothing (at 0 hit points, from a private sheet): only the DM and that player are told.
    assert.deepEqual(list.rests[1].skipped, [t.alex.id]);
    assert.deepEqual((await t.request('GET', base, { as: t.sam.token })).json().rests[1].skipped, []);
    assert.deepEqual((await t.request('GET', base)).json().rests[1].skipped, [t.alex.id]);
    assert.equal(list.edition, '2014');
    assert.equal(t.rests.count(t.campaign.id), 1);
    assert.equal(t.rests.count(t.campaign.id, { kind: 'short' }), 1);
    assert.equal(t.rests.count(t.campaign.id, { since: rest.at }), 0);

    // Archived, and back after losing the database.
    const ctx = await createContext({ config: t.config, paths: { archive: t.archive.root, db: path.join(t.dir, 'fresh.sqlite'), models: path.join(t.dir, 'models') }, llm: createFakeLLM(), embedder: fakeEmbedder, log: { error() {} } });
    try {
      const cid = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      assert.deepEqual(ctx.rests.list(cid).map((r) => r.id), [short.id, rest.id]);
      assert.equal(ctx.rests.count(cid), 1);
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }
  } finally {
    await t.cleanup();
  }
});

test('2024 rules (REST_RULES or a 2024 Player\'s Handbook): every hit die back, and a character at 0 hit points rests too', async () => {
  const t = await setup({ config: { sheets: { aiPerHour: 60, restRules: '2024' } } });
  try {
    await saveSheet(t, t.sam, THORIN);
    await saveSheet(t, t.alex, { name: 'Lyra', classes: [{ name: 'Rogue', level: 2 }], hp: { current: 0 } });
    const rest = (await t.request('POST', `/campaigns/${t.campaign.id}/rests`, { body: { kind: 'long' } })).json();
    assert.equal(rest.edition, '2024');
    assert.deepEqual(rest.skipped, []);
    assert.deepEqual((await sheetOf(t, t.sam)).sheet.hit_dice_spent, {});
    assert.equal((await sheetOf(t, t.alex)).sheet.hp.current, 13);
  } finally {
    await t.cleanup();
  }
});

test('rests go out live: each player hears the ones that include them, the DM hears every one', async () => {
  const t = await setup();
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = t.app.server.address();
  const open = async (token) => {
    const res = await fetch(`http://127.0.0.1:${port}/campaigns/${t.campaign.id}/live`, { headers: { authorization: `Bearer ${token}` } });
    return { reader: res.body.pipeThrough(new TextDecoderStream()).getReader(), text: '' };
  };
  const read = async (s) => {
    const deadline = Date.now() + 200;
    while (Date.now() < deadline) {
      s.pending ??= s.reader.read();
      const chunk = await Promise.race([s.pending, new Promise((r) => setTimeout(() => r(null), deadline - Date.now()))]);
      if (!chunk) break;
      s.pending = null;
      if (chunk.done) break;
      s.text += chunk.value;
    }
    return [...s.text.matchAll(/event: rest\ndata: (.*)\n/g)].map((m) => JSON.parse(m[1]));
  };
  const alex = await open(t.alex.token);
  const dm = await open(t.dmToken);
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/rests`, { body: { kind: 'short', to: [t.sam.id] } });
    await t.request('POST', `/campaigns/${t.campaign.id}/rests`, { body: { kind: 'long' } });
    assert.deepEqual((await read(alex)).map((r) => r.kind), ['long']);
    const dmHeard = await read(dm);
    assert.deepEqual(dmHeard.map((r) => r.kind), ['short', 'long']);
    assert.equal(dmHeard[0].campaign_id, undefined);
  } finally {
    await alex.reader.cancel();
    await dm.reader.cancel();
    await t.cleanup();
  }
});
