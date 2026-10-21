/**
 * The DM's wiki: pages only the DM edits, with who each part is available to,
 * archived like other source data, and read by Ask: all of it for the DM,
 * only the parts available to them for a player.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setup, createFakeLLM, fakeEmbedder } from './helpers.js';
import { createContext } from '../src/context.js';
import { wikiPieces, blockAudience, narrowest } from '@dndapp/shared/wiki.js';

const GREY_LADY = {
  title: 'The Grey Lady',
  aliases: ['Ilse Varn'],
  kind: 'npc',
  available: 'all',
  sections: [
    { heading: 'Who she seems to be', text: 'A ghost seen at the [[Hollow Mill]] at dusk.', available: 'all' },
    { heading: 'True name', text: 'She was the miller\'s daughter.\n:::for Thorin\nThorin read her letter: she hid the deed under the millstone.\n:::\n:::dm\nShe will betray the party at the full moon.\n:::', available: 'all' },
    { heading: 'Plans', text: 'She wants the Baron dead.', available: 'dm' },
  ],
};

const ask = (t, token, question) =>
  t.request('POST', `/campaigns/${t.campaign.id}/ask`, { as: token, body: { question } });

test('wiki text: blocks, names and audiences', () => {
  const pieces = wikiPieces('Open.\n:::for Thorin, Lyra\nShared.\n:::\n:::dm\nSecret.');
  assert.deepEqual(pieces.map((p) => p.text), ['Open.', 'Shared.', 'Secret.']);
  assert.deepEqual(pieces[1].block, { names: ['Thorin', 'Lyra'] });
  assert.deepEqual(pieces[2].block, { dm: true }, 'an unclosed block runs to the end');
  const roster = [{ user_id: 2, name: 'Sam', character_name: 'Thorin', role: 'player' }, { user_id: 1, name: 'Kenny', role: 'dm' }];
  assert.deepEqual(blockAudience({ names: ['thorin', 'Nobody'] }, roster), [2]);
  assert.deepEqual(blockAudience({ names: ['Kenny'] }, roster), [], 'the DM is never a block audience; it stays DM-only');
  assert.deepEqual(narrowest([2, 3], [3]), [3]);
  assert.equal(narrowest(null, null), null);
});

test('wiki: only the DM can read or write it; pages save, keep history and restore', async () => {
  const t = await setup();
  try {
    const base = `/campaigns/${t.campaign.id}/wiki`;
    for (const as of [t.sam.token, t.alex.token]) {
      assert.equal((await t.request('GET', base, { as })).statusCode, 403);
      assert.equal((await t.request('POST', base, { as, body: { title: 'x' } })).statusCode, 403);
    }
    const res = await t.request('POST', base, { body: { title: 'Hollow Mill', kind: 'place', sections: [{ heading: '', text: 'Old mill north of Brindle.', available: 'all' }] } });
    assert.equal(res.statusCode, 201);
    const mill = res.json().page;
    assert.equal(mill.available, 'dm', 'a new page is only the DM\'s until shared');

    const lady = (await t.request('POST', base, { body: { ...GREY_LADY, sections: [{ heading: 'Notes', text: 'Haunts the [[Hollow Mill]]. :::for Nobody', available: 'all' }] } })).json().page;
    const got = (await t.request('GET', `${base}/${mill.id}`)).json();
    assert.deepEqual(got.mentioned_in, [{ id: lady.id, title: 'The Grey Lady' }]);

    // Names must be unique across titles and aliases.
    assert.equal((await t.request('POST', base, { body: { title: 'ilse varn' } })).statusCode, 400);

    // Saving needs the version the editor opened.
    const saved = (await t.request('PUT', `${base}/${mill.id}`, { body: { version: 1, title: 'The Hollow Mill' } })).json().page;
    assert.equal(saved.version, 2);
    assert.deepEqual(saved.aliases, ['Hollow Mill'], 'the old title stays as another name, so links keep working');
    const stale = await t.request('PUT', `${base}/${mill.id}`, { body: { version: 1, title: 'Lost edit' } });
    assert.equal(stale.statusCode, 409);

    const history = (await t.request('GET', `${base}/${mill.id}/history`)).json().versions;
    assert.deepEqual(history.map((v) => v.title), ['The Hollow Mill', 'Hollow Mill']);
    const restored = (await t.request('POST', `${base}/${mill.id}/restore`, { body: { version: 1 } })).json().page;
    assert.equal(restored.title, 'Hollow Mill');
    assert.equal(restored.version, 3);

    // Loops are refused.
    await t.request('PUT', `${base}/${lady.id}`, { body: { version: 1, parent: mill.id } });
    assert.equal((await t.request('PUT', `${base}/${mill.id}`, { body: { version: 3, parent: lady.id } })).statusCode, 400);

    assert.equal((await t.request('DELETE', `${base}/${mill.id}`)).statusCode, 200);
    const left = (await t.request('GET', base)).json().pages;
    assert.deepEqual(left.map((p) => p.title), ['The Grey Lady']);
    assert.equal(left[0].parent, null, 'a page inside a deleted one moves up');
  } finally {
    await t.cleanup();
  }
});

test('wiki: View as shows a player only what is available to them', async () => {
  const t = await setup();
  try {
    const base = `/campaigns/${t.campaign.id}/wiki`;
    const page = (await t.request('POST', base, { body: GREY_LADY })).json().page;
    const asSam = (await t.request('GET', `${base}/${page.id}?as=${t.sam.id}`)).json().page;
    const samText = JSON.stringify(asSam);
    assert.match(samText, /millstone/);
    assert.match(samText, /miller's daughter/);
    assert.doesNotMatch(samText, /full moon|Baron dead|:::/);
    assert.deepEqual(asSam.aliases, [], 'other names can be secrets');
    const asAlex = JSON.stringify((await t.request('GET', `${base}/${page.id}?as=${t.alex.id}`)).json().page);
    assert.doesNotMatch(asAlex, /millstone|full moon|Baron dead/);

    // A page only the DM has: nothing for players.
    const secret = (await t.request('POST', base, { body: { title: 'The Baron\'s plot', sections: [{ heading: '', text: 'Poison at the feast.', available: 'all' }] } })).json().page;
    assert.equal((await t.request('GET', `${base}/${secret.id}?as=${t.sam.id}`)).json().page, null);
  } finally {
    await t.cleanup();
  }
});

test('wiki: Ask reads all of it for the DM and only what is available for a player', async () => {
  const llm = createFakeLLM({
    qaScript: [
      [{ tool: 'search_wiki', input: { query: 'Grey Lady millstone moon Baron' } }, { tool: 'read_wiki_page', input: { title: 'The Grey Lady' } }, { answer: 'dm' }],
      [{ tool: 'search_wiki', input: { query: 'Grey Lady millstone moon Baron' } }, { tool: 'read_wiki_page', input: { title: 'The Grey Lady' } }, { tool: 'read_wiki_page', input: { title: 'Ilse Varn' } }, { answer: 'sam' }],
    ],
  });
  const t = await setup({ llm });
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: GREY_LADY });
    await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { title: 'The Baron\'s plot', sections: [{ heading: '', text: 'Poison at the feast.', available: 'all' }] } });

    assert.equal((await ask(t, t.dmToken, 'What is the Grey Lady planning?')).statusCode, 200);
    const dmCall = llm.calls.at(-1);
    assert.ok(dmCall.tools.includes('search_wiki'));
    assert.match(dmCall.system, /DM's wiki/);
    const dmSaw = dmCall.toolResults.map((r) => r.result).join('\n') + dmCall.prompt;
    assert.match(dmSaw, /full moon/);
    assert.match(dmSaw, /Baron dead/);
    assert.match(dmSaw, /Only for Thorin/);

    assert.equal((await ask(t, t.sam.token, 'What do I know about the Grey Lady, the millstone, the moon and the Baron?')).statusCode, 200);
    const samCall = llm.calls.at(-1);
    // (The last result repeats the name Sam asked for, so it's checked on its own below.)
    const samSaw = samCall.toolResults.slice(0, -1).map((r) => r.result).join('\n') + samCall.prompt + samCall.system;
    assert.match(samSaw, /millstone/);
    const leak = /full moon|Baron dead|Poison at the feast|Ilse Varn/.exec(samSaw);
    assert.equal(leak, null, leak && `${leak[0]} in: ${samSaw.slice(Math.max(0, leak.index - 80), leak.index + 80)}`);
    assert.match(samCall.toolResults.at(-1).result, /No wiki page called/, 'a secret other name finds nothing');

    // Alex gets the part everyone may know (the pre-search finds it), and nothing of Thorin's or the DM's.
    await ask(t, t.alex.token, 'Who is the Grey Lady? A ghost? Millstone, moon, Baron?');
    const alexCall = llm.calls.at(-1);
    assert.ok(alexCall.tools.includes('search_wiki'));
    assert.match(alexCall.prompt, /A ghost seen at the Hollow Mill/);
    assert.doesNotMatch(alexCall.prompt + alexCall.system, /millstone|full moon|Baron dead|Poison/);

    // With nothing available to a player at all: no wiki tools and no word of the wiki.
    const lady = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki`)).json().pages.find((p) => p.title === 'The Grey Lady');
    await t.request('DELETE', `/campaigns/${t.campaign.id}/wiki/${lady.id}`);
    await ask(t, t.alex.token, 'Grey Lady millstone moon Baron plot feast?');
    const later = llm.calls.at(-1);
    assert.ok(!later.tools.includes('search_wiki'));
    assert.doesNotMatch(later.prompt + later.system, /Poison|wiki/i);
  } finally {
    await t.cleanup();
  }
});

test('wiki: pages come back from the archive, and a rebuild keeps them searchable', async () => {
  const t = await setup();
  try {
    const page = (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { ...GREY_LADY, available: [t.sam.id] } })).json().page;
    const sam = { userId: t.sam.id, seesAll: false };

    // A fresh database over the same archive.
    const ctx = await createContext({ config: t.config, paths: { archive: t.archive.root, db: path.join(t.dir, 'fresh.sqlite'), models: path.join(t.dir, 'models') }, llm: createFakeLLM(), embedder: fakeEmbedder, log: { error() {} } });
    try {
      const cid = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      const back = ctx.wiki.get(cid, page.id);
      assert.deepEqual(back.available, [t.sam.id]);
      assert.equal(back.sections.length, 3);
      assert.ok((await ctx.search.search(cid, 'millstone', { kinds: ['wiki'], viewer: sam })).length, 'restored pages are indexed again');
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }

    // A rebuild wipes the search index; the wiki is indexed again.
    t.jobs.enqueueRebuild(t.campaign.id);
    await t.jobs.idle();
    assert.ok((await t.search.search(t.campaign.id, 'millstone', { kinds: ['wiki'], viewer: sam })).length);
    const samHits = await t.search.search(t.campaign.id, 'full moon betray', { kinds: ['wiki'], viewer: sam });
    assert.doesNotMatch(samHits.map((h) => h.text).join('\n'), /full moon|Ilse Varn/, "the DM's block and the other names stay out of a player's results");
  } finally {
    await t.cleanup();
  }
});
