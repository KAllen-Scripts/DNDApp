/**
 * Boards (wiki space stage 10b): the DM makes a board, puts a page and a note on it and it saves; a page card opens
 * the drawer; a player's board shows a card for a page hidden since as "gone".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

test('wiki boards: make one, put a page and a note on it, and it saves', async () => {
  await withPage({
    before: async (t) => {
      await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { title: 'Mira', kind: 'npc', available: 'dm', sections: [{ heading: '', text: 'A fence at the docks.', available: 'all' }] } });
      return { dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/boards' }),
  }, async (page, t) => {
    await page.waitFor(() => page.text('#wiki-main').includes('No boards yet.'));
    page.type(page.$('#wiki-main input[type=text]'), 'Suspects');
    page.click(page.$$('#wiki-main button').find((b) => b.textContent === 'New board'));
    await page.waitFor(() => page.$('#wiki-main .wiki-board-frame'));
    assert.match(page.text('#wiki-main .wiki-board-tools'), /Suspects/);

    page.click(page.$$('#wiki-main .wiki-board-tools button').find((b) => b.textContent === '+ Page'));
    await page.waitFor(() => page.$$('#wiki-dialog .wiki-embed-choices button').length === 1);
    page.click(page.$('#wiki-dialog .wiki-embed-choices button'));
    await page.waitFor(() => page.text('#wiki-main .wiki-board-card.kind-page').includes('Mira'));

    page.click(page.$$('#wiki-main .wiki-board-tools button').find((b) => b.textContent === '+ Note'));
    await page.waitFor(() => page.$('#wiki-main .wiki-board-card.kind-note textarea'));
    page.type(page.$('#wiki-main .wiki-board-card.kind-note textarea'), 'Who pays her?');
    const cid = t.campaign.id;
    const dm = { role: 'dm', userId: t.dm.id };
    const saved = () => {
      const [b] = t.wikiBoards.list(cid, dm);
      return !!b && t.wikiBoards.view(cid, b.id, dm).items.some((x) => x.kind === 'note' && x.text === 'Who pays her?');
    };
    await page.waitFor(saved);
    assert.equal(t.wikiBoards.list(cid, dm)[0].cards, 2);
  });
});

test('wiki boards: a player\'s card for a page hidden since is gone', async () => {
  let id;
  await withPage({
    before: async (t) => {
      const cid = t.campaign.id;
      const p = (await t.request('POST', `/campaigns/${cid}/wiki`, { body: { title: 'The Pale Hand', available: 'all', sections: [{ heading: '', text: 'A cult.', available: 'all' }] } })).json().page;
      id = t.wikiBoards.create(cid, { title: 'Conspiracy', items: [{ id: 'aaaaaa', kind: 'page', ref: p.id, x: 0, y: 0 }, { id: 'bbbbbb', kind: 'note', text: 'Mira lies', x: 300, y: 0 }] }, { role: 'player', userId: t.sam.id }).id;
      await t.wiki.update(cid, p.id, { available: 'dm' }, { by: t.dm.id });
    },
    page: (t) => ({ as: t.sam, path: `/?space=wiki#/boards/${id}` }),
  }, async (page) => {
    await page.waitFor(() => page.$$('#wiki-main .wiki-board-card').length === 2);
    assert.ok(page.$('#wiki-main .wiki-board-card.gone'));
    assert.doesNotMatch(page.text('#wiki-main'), /Pale Hand|A cult/);
    assert.ok(page.$$('#wiki-main .wiki-board-tools label').some((l) => l.textContent.includes('Share with the DM')));
  });
});
