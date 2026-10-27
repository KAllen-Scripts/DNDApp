/**
 * Players' lore on the page (wiki space stage 6c): a player adds to their character's story from its page; the DM
 * approves it under Waiting with a canon; the player changes their own part.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

test('players\' lore: a player adds to their story, then changes it once approved', async () => {
  let pageId;
  await withPage({
    before: async (t) => {
      pageId = (await t.request('POST', `/campaigns/${t.campaign.id}/wiki/characters`, { body: { player: t.sam.id } })).json().page.id;
    },
    page: (t) => ({ as: t.sam, path: `/?space=wiki#/page/${pageId}` }),
  }, async (page, t) => {
    await page.waitFor(() => page.$('#wiki-main .wiki-lore'));
    page.click(page.$$('#wiki-main .wiki-lore button').find((b) => b.textContent.includes('Add to your story')));
    const d = page.$('#wiki-lore-add');
    page.type(d.querySelector('[aria-label=Heading]'), 'Exile');
    page.type(d.querySelector('[aria-label="Your words"]'), 'Cast out of the Iron Hills.');
    page.type(d.querySelector('[aria-label="Who it\'s for"]'), 'all');
    page.submit(d.querySelector('form'));
    await page.waitFor(() => page.text('#wiki-main .wiki-lore-list').includes('waiting for the DM'));

    // The DM approves it as Thorin's account.
    const { proposals } = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/proposals`)).json();
    const p = proposals.find((x) => x.from === 'player');
    assert.equal(p.sections[0].available, 'all');
    assert.equal((await t.request('POST', `/campaigns/${t.campaign.id}/wiki/proposals/${p.id}/approve`, { body: { canon: 'told' } })).statusCode, 200);

    page.window.location.hash = '#/home';
    page.window.dispatchEvent(new page.window.HashChangeEvent('hashchange'));
    await page.settle();
    page.window.location.hash = `#/page/${pageId}`;
    page.window.dispatchEvent(new page.window.HashChangeEvent('hashchange'));
    await page.waitFor(() => page.text('#wiki-main').includes('Cast out of the Iron Hills.'));
    page.click(page.$('#wiki-main .wiki-lore-change'));
    page.type(page.$('#wiki-main .wiki-lore-edit textarea'), 'Cast out, and glad of it.');
    page.click(page.$$('#wiki-main .wiki-lore-edit button').find((b) => b.textContent === 'Save'));
    await page.waitFor(() => page.text('#wiki-main').includes('glad of it'));
  });
});

test('players\' lore: the DM sees it under Waiting as from the player, with a canon to choose', async () => {
  await withPage({
    before: async (t) => {
      const base = `/campaigns/${t.campaign.id}/wiki`;
      await t.request('POST', `${base}/characters`, { body: { player: t.sam.id } });
      await t.request('POST', `${base}/lore`, { as: t.sam.token, body: { type: 'relationship', label: 'Sister', value: 'Dagna' } });
      return { dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/waiting' }),
  }, async (page, t) => {
    await page.waitFor(() => page.$('.wiki-proposal .wiki-lore-canon'));
    const card = page.$('.wiki-proposal');
    assert.match(page.text(card), /From Thorin/);
    page.type(card.querySelector('[aria-label="Approve it as"]'), 'false');
    page.type(card.querySelector('[aria-label="The truth"]'), 'Dagna is dead.');
    page.click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Approve'));
    await page.waitFor(() => page.text('#wiki-main').includes('Nothing waiting'));
    const pages = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki`)).json().pages;
    const thorin = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${pages.find((x) => x.title === 'Thorin').id}`)).json().page;
    assert.deepEqual([thorin.facts[0].canon, thorin.facts[0].truth, thorin.facts[0].by], ['false', 'Dagna is dead.', 'player']);
  });
});
