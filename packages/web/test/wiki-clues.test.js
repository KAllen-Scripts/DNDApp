/**
 * Clues on the page (wiki space stage 7a): `[[!Clue]]` shows the clue's words in a box where it's written, for the
 * DM with who has it; a player gets it only once the clue is theirs, and nothing before.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

async function prep(t, { revealed }) {
  const base = `/campaigns/${t.campaign.id}/wiki`;
  const make = async (body) => (await t.request('POST', base, { body })).json().page;
  await make({ title: 'The Bloody Ledger', kind: 'clue', available: 'all', sections: [{ heading: '', text: 'A ledger with the Baron\'s seal.', available: revealed ? 'all' : 'dm' }] });
  return make({ title: 'Hollow Mill', kind: 'place', available: 'all', sections: [{ heading: '', text: 'An old mill.\n\n[[!The Bloody Ledger]]\n\n[[!Nothing Yet]]', available: 'all' }] });
}

test('wiki clues: the DM sees the clue boxed where it\'s embedded, and who has it', async () => {
  let mill;
  await withPage({
    before: async (t) => {
      mill = await prep(t, { revealed: false });
      return { dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana, path: `/?space=wiki#/page/${mill.id}` }),
  }, async (page) => {
    await page.waitFor(() => page.$('#wiki-main .wiki-embed:not(.missing)'));
    const box = page.text(page.$('#wiki-main .wiki-embed:not(.missing)'));
    assert.match(box, /Clue: The Bloody Ledger/);
    assert.match(box, /Baron's seal/);
    assert.match(box, /Only/i);
    assert.match(page.text(page.$('#wiki-main .wiki-embed.missing')), /No page called "Nothing Yet"/);
  });
});

test('wiki clues: a player gets the clue only once it\'s theirs', async () => {
  for (const revealed of [false, true]) {
    let mill;
    await withPage({
      before: async (t) => { mill = await prep(t, { revealed }); },
      page: (t) => ({ as: t.sam, path: `/?space=wiki#/page/${mill.id}` }),
    }, async (page) => {
      await page.waitFor(() => page.text('#wiki-main').includes('An old mill.'));
      assert.equal(page.text('#wiki-main').includes('Baron\'s seal'), revealed);
      assert.ok(!page.text('#wiki-main').includes(revealed ? 'Nothing Yet' : 'Ledger'));
      assert.ok(!page.$('#wiki-main .wiki-embed.missing'));
    });
  }
});
