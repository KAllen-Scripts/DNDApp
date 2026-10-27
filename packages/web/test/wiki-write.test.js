/**
 * The AI as a writing partner on the page (wiki space stage 5b): Tidy in the editor, Make up… from Find, and
 * Link it on a page's underlined names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, createFakeLLM } from './helpers.js';

test('wiki write: Tidy and Make up wait under Waiting; Link it links a name', async () => {
  const asked = [];
  const llm = createFakeLLM({
    wiki: (opts) => {
      asked.push(opts.purpose);
      if (opts.purpose === 'wiki:tidy') return { heading: '', text: 'Hilda runs the mill near Brannoc\'s farm.', reason: 'Smoother.' };
      return { title: 'The Rusty Nail', kind: 'tavern', aliases: [], sections: [{ heading: '', text: 'A smoky tavern.' }], facts: [], reason: 'Fits.' };
    },
  });
  let hilda;
  await withPage({
    setup: { llm },
    before: async (t) => {
      const dana = await addDm(t);
      await t.wiki.create(t.campaign.id, { title: 'Brannoc', available: 'all', sections: [{ heading: '', text: 'A farmer.', available: 'all' }] }, { by: dana.id });
      hilda = await t.wiki.create(t.campaign.id, { title: 'Hilda', available: 'all', sections: [{ heading: '', text: 'Hilda run mill, near brannoc farm.', available: 'all' }] }, { by: dana.id });
      return { dana };
    },
    page: (t, { dana }) => ({ as: dana, path: `/?space=wiki#/page/${hilda.id}` }),
  }, async (page, t) => {
    // The name of another page is underlined with Link it.
    await page.waitFor(() => page.$('.wiki-link-hint'));
    assert.equal(page.$('.wiki-link-hint').firstChild.textContent, 'brannoc');
    page.click('.wiki-link-it');
    await page.waitFor(() => t.wiki.get(t.campaign.id, hilda.id).sections[0].text.includes('[[Brannoc|brannoc]]'));

    // Tidy in the editor: a proposal under Waiting.
    await page.waitFor(() => page.$$('.wiki-actions button').some((b) => b.textContent === 'Edit') && !page.$('.wiki-link-hint'));
    page.click(page.$$('.wiki-actions button').find((b) => b.textContent === 'Edit'));
    await page.waitFor(() => page.$$('.wiki-ai-btn').some((b) => b.textContent === '✦ Tidy'));
    page.click(page.$$('.wiki-ai-btn').find((b) => b.textContent === '✦ Tidy'));
    await page.waitFor(() => page.text('#wiki-status').includes('waits for you under Waiting'));
    assert.deepEqual(asked, ['wiki:tidy']);

    // Make up… from Find (Ctrl K).
    page.document.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await page.waitFor(() => page.$('#wiki-find')?.open);
    page.type(page.$('#wiki-find input'), 'a tavern near the mill');
    page.click(page.$$('#wiki-find button').find((b) => b.textContent === '✦ Make up…'));
    await page.waitFor(() => page.$('#wiki-make-up')?.open);
    assert.equal(page.$('#wiki-make-up textarea').value, 'a tavern near the mill');
    page.type(page.$('#wiki-make-up select'), 'a tavern');
    page.click(page.$$('#wiki-make-up button').find((b) => b.textContent === 'Make it up'));
    await page.waitFor(() => page.$$('.wiki-proposal').length === 2);
    assert.ok(page.$$('.wiki-proposal').some((c) => /New page[\s\S]*The Rusty Nail/.test(c.textContent)));
    await page.settle();
  });
});
