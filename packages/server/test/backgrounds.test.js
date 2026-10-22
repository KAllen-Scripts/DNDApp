import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setup, createFakeLLM, fakeEmbedder } from './helpers.js';
import { createContext } from '../src/context.js';

test("custom backgrounds: only the DM saves them; they're cleaned, sent to the players, archived and restored", async () => {
  const t = await setup();
  try {
    const url = `/campaigns/${t.campaign.id}/settings`;
    const smuggler = { id: 'abc123de', name: '  River   Smuggler ', skills: ['stealth', 'deception', 'flying'], tools: "Navigator's tools", languages: '', equipment: 'A rowing boat', gold: 12, feature: { name: 'Quiet Water', text: 'You know the hidden landings.' }, abilities: ['dex', 'int', 'cha'], feat: 'Lucky' };
    assert.equal((await t.request('PATCH', url, { as: t.sam.token, body: { backgrounds: [smuggler] } })).statusCode, 403);
    assert.equal((await t.request('PATCH', url, { body: { backgrounds: 'Smuggler' } })).statusCode, 400);
    assert.equal((await t.request('PATCH', url, { body: { backgrounds: Array.from({ length: 51 }, (_, i) => ({ name: `B${i}` })) } })).statusCode, 400);

    const heard = [];
    t.store.events.on('settings', (e) => heard.push(e));
    const res = await t.request('PATCH', url, { body: { backgrounds: [smuggler, { name: 'river smuggler' }, { name: '' }, { name: 'Odd', abilities: ['str', 'dex'] }] } });
    assert.equal(res.statusCode, 200);
    const want = [
      { id: 'abc123de', name: 'River Smuggler', skills: ['stealth', 'deception'], tools: "Navigator's tools", languages: '', equipment: 'A rowing boat', gold: 12, feature: { name: 'Quiet Water', text: 'You know the hidden landings.' }, abilities: ['dex', 'int', 'cha'], feat: 'Lucky' },
      { id: res.json().backgrounds[1].id, name: 'Odd', skills: [], tools: '', languages: '', equipment: '', gold: 0, feature: null, abilities: [], feat: '' },
    ];
    // Duplicates and nameless ones are dropped; two abilities aren't three, so none.
    assert.deepEqual(res.json().backgrounds, want);
    assert.deepEqual(heard.at(-1).settings.backgrounds, want);
    const players = (await t.request('GET', '/me', { as: t.alex.token })).json().campaigns.find((c) => c.id === t.campaign.id).settings;
    assert.deepEqual(players.backgrounds, want);
    // Other settings are left as they were.
    assert.equal(players.weight, 'capacity');

    const ctx = await createContext({ config: t.config, paths: { ...t.paths, db: path.join(t.dir, 'restored.sqlite') }, llm: createFakeLLM(), embedder: fakeEmbedder, log: { error() {} } });
    try {
      const cid = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      assert.deepEqual(ctx.store.getSettings(cid).backgrounds, want);
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }
  } finally {
    await t.cleanup();
  }
});
