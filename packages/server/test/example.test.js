import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config as baseConfig } from '../src/config.js';
import { createContext } from '../src/context.js';
import { buildApp } from '../src/app.js';
import { seedIfEmpty } from '../src/example/startup.js';
import { createFakeLLM, fakeEmbedder } from './helpers.js';

/** A server on an empty data folder of its own, as the example data starts. */
async function emptyServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dndapp-example-'));
  const paths = { archive: path.join(dir, 'archive'), db: path.join(dir, 'db.sqlite'), models: path.join(dir, 'models') };
  const llm = createFakeLLM();
  const config = { ...baseConfig, dataDir: dir, booksDir: path.join(dir, 'books') };
  const ctx = await createContext({ config, paths, llm, embedder: fakeEmbedder, log: { error() {} } });
  const app = buildApp({ ...ctx, logger: false });
  return {
    ctx, app, llm, dir,
    cleanup: async () => {
      ctx.jobs.stop();
      await ctx.jobs.idle();
      await app.close();
      ctx.db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('the example campaign seeds into an empty data folder, all through the API, with no AI', { timeout: 300_000 }, async () => {
  const s = await emptyServer();
  try {
    const log = { info() {} };
    const made = await seedIfEmpty(s.ctx, s.app, log);
    assert.ok(made.password);
    assert.ok(fs.readFileSync(path.join(s.dir, 'example-accounts.txt'), 'utf8').includes(made.password));
    assert.equal(s.llm.calls.length, 0, 'no AI calls');

    const login = async (name) => (await s.ctx.auth.login(name, made.password)).token;
    const get = async (token, url) => {
      const res = await s.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
      assert.equal(res.statusCode, 200, `${url}: ${res.body}`);
      return res.json();
    };
    const dm = await login('test-rowan');
    const me = await get(dm, '/me');
    const cid = me.campaigns[0].id;
    assert.equal(me.campaigns[0].name, 'The Lanterns of Saltreach');
    const settings = me.campaigns[0].settings;
    assert.equal(settings.edition, '2014');
    assert.equal(settings.calendar.name, 'The Tide Reckoning');
    // The speakers are linked by hand at the first upload (it tests the upload screen's guesses).
    assert.equal((await get(dm, `/campaigns/${cid}/speakers`)).length, 0);

    assert.equal((await get(dm, `/campaigns/${cid}/creatures`)).creatures.length, 15);
    assert.ok((await get(dm, `/campaigns/${cid}/items`)).items.length >= 35);
    const merchants = await get(dm, `/campaigns/${cid}/merchants`);
    assert.equal((merchants.merchants ?? merchants).length, 5);
    const wiki = await get(dm, `/campaigns/${cid}/wiki`);
    assert.ok(wiki.pages.length >= 55, `${wiki.pages.length} wiki pages`);
    const maps = (await get(dm, `/campaigns/${cid}/maps`)).maps;
    assert.equal(maps.length, 10);
    const region = maps.find((m) => m.name === 'The Greyhallow Coast');
    assert.equal(region.kind, 'region');
    assert.ok(region.places.length >= 7);
    assert.ok(region.places.filter((p) => p.to).length >= 5, 'places open other maps');

    // Each player has their sheet; one has a second character only they can see.
    const pip = await login('test-jules');
    const sheet = await get(pip, `/campaigns/${cid}/sheet`);
    assert.equal(sheet.sheet.name, 'Pip Thistlewood');
    assert.ok(sheet.sheet.spells.some((x) => x.name === 'Mage Hand' && x.source === 'srd'));
    assert.ok(sheet.sheet.inventory.some((g) => /bag of tricks/i.test(g.name) && g.actions?.length));
    const chars = await get(pip, `/campaigns/${cid}/characters`);
    assert.deepEqual(chars.characters.map((c) => [c.name, c.active]), [['Pip Thistlewood', true], ['Corvin Marsh', false]]);
    const wren = (await get(await login('test-mags'), `/campaigns/${cid}/sheet`)).sheet;
    assert.ok(wren.wild_shape.forms.length >= 3);

    // Nothing that happens in play: no sessions, notes, knowledge base or wiki proposals.
    for (const table of ['sessions', 'player_notes', 'kb_records', 'wiki_proposals', 'handouts']) {
      assert.equal(s.ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
    }

    // A player reads only what's theirs: Bran's debt is Theo's alone.
    const priya = await login('test-priya');
    const theirs = (await get(priya, `/campaigns/${cid}/wiki`)).pages.map((p) => p.title);
    assert.ok(theirs.includes('Saltreach'));
    assert.ok(!theirs.includes("Bran's Debt"));
    assert.ok(!theirs.includes('The Choir of the Deep'));
    assert.ok((await get(await login('test-theo'), `/campaigns/${cid}/wiki`)).pages.some((p) => p.title === "Bran's Debt"));

    // A second start leaves it alone.
    assert.equal(await seedIfEmpty(s.ctx, s.app, log), null);
  } finally {
    await s.cleanup();
  }
});
