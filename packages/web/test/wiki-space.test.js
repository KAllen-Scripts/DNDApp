/**
 * The wiki's space (wiki-space.js): the Wiki button leaves the table for a
 * space of its own on the same page, whose address follows the page shown, so
 * Back, Forward and reload land in the right place. Players never get it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, openPage, setup, addDm } from './helpers.js';

const railButton = (page, label) => page.$$('#wiki-rail button').find((b) => b.textContent.includes(label));

async function twoPages(t) {
  const make = async (title, kind) => (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { title, kind, sections: [{ heading: '', text: `About ${title}.`, available: 'all' }] } })).json().page;
  return { mill: await make('Millbrook', 'village'), lady: await make('The Grey Lady', 'npc') };
}

test('wiki space: the Wiki button opens the space; pages, Back and the way back to the table follow the address', async () => {
  await withPage({
    before: async (t) => ({ dana: await addDm(t), ...(await twoPages(t)) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { mill, lady }) => {
    const root = page.document.documentElement;
    assert.equal(root.dataset.space, 'table');
    page.click('[data-tab=notes]');
    page.click('[data-tab=wiki]');
    assert.equal(root.dataset.space, 'wiki');
    assert.equal(page.window.location.search, '?space=wiki');
    assert.equal(page.window.location.hash, '#/home');
    assert.ok(railButton(page, 'Home').classList.contains('current'));

    // Opening pages: the address names each, and each joins the trail.
    page.click(page.$$('#wiki-main .wiki-card').find((c) => c.textContent.includes('Millbrook')));
    await page.waitFor(() => page.window.location.hash === `#/page/${mill.id}`);
    page.click(page.$$('#wiki-list button').find((b) => b.textContent.includes('The Grey Lady')));
    await page.waitFor(() => page.window.location.hash === `#/page/${lady.id}`);
    assert.deepEqual(page.$$('#wiki-trail .wiki-trail-chip').map((c) => c.textContent), ['Millbrook', 'The Grey Lady']);

    // Back: the page before.
    page.window.history.back();
    await page.waitFor(() => page.text('#wiki-main').includes('About Millbrook.'));
    assert.equal(page.window.location.hash, `#/page/${mill.id}`);

    // A trail chip goes straight to its page.
    page.click(page.$$('#wiki-trail .wiki-trail-chip').find((c) => c.textContent === 'The Grey Lady'));
    await page.waitFor(() => page.text('#wiki-main').includes('About The Grey Lady.'));

    // The table: back to the tab the DM came from; Back returns to the wiki.
    page.click(railButton(page, 'The table'));
    assert.equal(root.dataset.space, 'table');
    assert.ok(page.visible('#tab-notes'));
    assert.equal(page.window.location.search, '');
    page.window.history.back();
    await page.waitFor(() => root.dataset.space === 'wiki');
    assert.ok(page.visible('#tab-wiki'));
    assert.equal(page.errors.length, 0, page.errors.join('\n'));
  });
});

test('wiki space: a reload in the space opens the page the address names; a popped-out wiki has no way to the table', async () => {
  const t = await setup();
  try {
    const dana = await addDm(t);
    const { lady } = await twoPages(t);
    let page = await openPage(t, { as: dana, path: `/?space=wiki#/page/${lady.id}` });
    try {
      await page.waitFor(() => page.text('#wiki-main').includes('About The Grey Lady.'));
      assert.equal(page.document.documentElement.dataset.space, 'wiki');
      assert.ok(page.visible('#tab-wiki'));
      assert.equal(page.window.location.hash, `#/page/${lady.id}`);
    } finally {
      await page.close();
    }
    page = await openPage(t, { as: dana, path: `/?view=wiki&campaign=${t.campaign.id}` });
    try {
      assert.ok(page.visible('#tab-wiki'));
      assert.ok(railButton(page, 'Home'));
      assert.ok(!railButton(page, 'The table'));
    } finally {
      await page.close();
    }
  } finally {
    await t.cleanup();
  }
});

test("wiki space: a player sent to the wiki's address stays at the table and never asks for the wiki", async () => {
  await withPage({ page: (t) => ({ as: t.sam, path: '/?space=wiki#/home' }) }, async (page) => {
    assert.equal(page.document.documentElement.dataset.space, 'table');
    assert.equal(page.window.location.search, '');
    assert.ok(!page.visible('#tab-wiki'));
    assert.ok(!page.requests.some((r) => r.path.includes('/wiki')));
  });
});
