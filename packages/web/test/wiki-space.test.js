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

test('wiki space: the Home is a hub (last session, a small wheel, recent changes) and the Wheel shows a family\'s kinds and pages', async () => {
  await withPage({
    before: async (t) => {
      const dana = await addDm(t);
      const pages = await twoPages(t);
      const s1 = (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { title: 'Session 1', kind: 'session', sections: [{ heading: '', text: 'They met the Lady.', available: 'all' }] } })).json().page;
      return { dana, ...pages, s1 };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { mill, s1 }) => {
    page.click('[data-tab=wiki]');
    await page.waitFor('.wiki-hub .wiki-last');
    assert.match(page.text('.wiki-hub-last'), /Session 1\s*They met the Lady/);
    assert.equal(page.$$('.wiki-hub .wiki-mini-card').length, 3);
    assert.equal(page.$$('.wiki-hub .wiki-wheel .wiki-slice').length, 9);
    assert.match(page.text('.wiki-hub-party'), /Thorin/);
    assert.equal(page.$$('#wiki-main .wiki-card').length, 3, 'every page as a card below the hub');

    // A slice of the Home's wheel opens the Wheel on that family.
    page.click('.wiki-hub .wiki-slice[data-family="place"]');
    await page.waitFor(() => page.window.location.hash === '#/wheel/place' && page.$('.wiki-wheel-view .wiki-wheel'));
    assert.ok(page.$('.wiki-wheel-view .wiki-slice.on[data-family="place"]'));
    assert.match(page.text('.wiki-wheel-side'), /Places\s*1 page\s*village 1/);
    assert.deepEqual(page.$$('.wiki-wheel-view .wiki-card-title').map((e) => e.textContent), ['Millbrook']);

    // Another family; then the rail's Wheel button keeps it, and a card opens its page.
    page.click('.wiki-wheel-view .wiki-slice[data-family="person"]');
    assert.equal(page.window.location.hash, '#/wheel/person');
    assert.deepEqual(page.$$('.wiki-wheel-view .wiki-card-title').map((e) => e.textContent), ['The Grey Lady']);
    page.click(page.$$('.wiki-wheel-view .wiki-card')[0]);
    await page.waitFor(() => page.text('#wiki-main').includes('About The Grey Lady.'));
    page.window.history.back();
    await page.waitFor(() => page.$('.wiki-wheel-view .wiki-slice.on[data-family="person"]'));
    assert.ok(mill && s1);
    assert.equal(page.errors.length, 0, page.errors.join('\n'));
  });
});

test("wiki space: a page's compass shows where it sits; History shows what changed in each version", async () => {
  await withPage({
    before: async (t) => {
      const dana = await addDm(t);
      const { mill, lady } = await twoPages(t);
      const res = await t.request('PUT', `/campaigns/${t.campaign.id}/wiki/${lady.id}`, { body: { version: lady.version, parent: mill.id, sections: [{ ...lady.sections[0], text: 'About The Grey Lady. She haunts [[Millbrook]].' }] } });
      assert.equal(res.statusCode, 200, res.body);
      return { dana, mill, lady };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { mill, lady }) => {
    page.click('[data-tab=wiki]');
    await page.waitFor('.wiki-card');
    await (await page.module('wiki-space.js')).go(`#/page/${lady.id}`);
    await page.waitFor('.wiki-compass .wiki-compass-chip');
    const group = (label) => page.$$('.wiki-compass-group').find((g) => g.querySelector('.wiki-compass-label').textContent === label);
    const chips = (label) => [...group(label).querySelectorAll('.wiki-compass-title')].map((e) => e.textContent);
    assert.match(page.text(group('Kind')), /People/);
    assert.deepEqual(chips('Inside'), ['Millbrook']);
    assert.deepEqual(chips('Links to'), ['Millbrook']);
    page.click(group('Inside').querySelector('.wiki-compass-chip'));
    await page.waitFor(() => page.window.location.hash === `#/page/${mill.id}`);
    await page.waitFor(() => group('Holds'));
    assert.deepEqual(chips('Holds'), ['The Grey Lady']);
    assert.deepEqual(chips('Linked from'), ['The Grey Lady']);

    // History: version 2 of the Lady shows the sentence added to version 1.
    await (await page.module('wiki-space.js')).go(`#/page/${lady.id}/history`);
    await page.waitFor(() => page.$$('.wiki-history button').length === 2);
    page.click(page.$$('.wiki-history button').find((b) => b.textContent === 'Version 2'));
    await page.waitFor('.wiki-diff');
    assert.match(page.text('.wiki-diff summary'), /What changed from version 1/);
    assert.equal(page.$$('.wiki-diff ins').map((e) => e.textContent).join(''), ' She haunts [[Millbrook]].');
    assert.equal(page.errors.length, 0, page.errors.join('\n'));
  });
});


test('wiki space: names in an answer open the drawer; Ctrl K finds a page by what its text says; a player gets no names', async () => {
  await withPage({
    before: async (t) => {
      const dana = await addDm(t);
      const { mill, lady } = await twoPages(t);
      await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { title: 'Rennick', kind: 'npc', sections: [{ heading: '', text: 'A smuggler with an eyepatch who knows [[The Grey Lady]].', available: 'all' }] } });
      return { dana, mill, lady };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { mill, lady }) => {
    const { markNames } = await page.module('wiki-names.js');
    const answer = page.document.createElement('div');
    answer.innerHTML = '<p>You met <strong>the grey lady</strong> near Millbrook. <code>Millbrook</code></p>';
    page.$('#thread').append(answer);
    markNames(answer);
    assert.deepEqual([...answer.querySelectorAll('.wiki-name')].map((b) => b.textContent), ['the grey lady', 'Millbrook'], 'any case, whole names, never in code');

    // The drawer: the page, its compass, a link inside opens there too, Escape closes it.
    page.click(answer.querySelector('.wiki-name'));
    await page.waitFor(() => page.visible('#wiki-drawer') && page.text('#wiki-drawer h2') === 'The Grey Lady');
    assert.equal(page.document.documentElement.dataset.space, 'table', 'still at the table');
    page.key('#wiki-drawer', 'Escape');
    assert.ok(!page.visible('#wiki-drawer'));
    page.click(answer.querySelectorAll('.wiki-name')[1]);
    await page.waitFor(() => page.visible('#wiki-drawer') && page.text('#wiki-drawer h2') === 'Millbrook');
    page.click(page.$$('#wiki-drawer button').find((b) => b.textContent === 'Open in the wiki'));
    await page.waitFor(() => page.window.location.hash === `#/page/${mill.id}`);
    assert.equal(page.document.documentElement.dataset.space, 'wiki');
    assert.ok(!page.visible('#wiki-drawer'));

    // Ctrl K: found by its text; in the wiki a card opens the page.
    page.document.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    assert.ok(page.$('#wiki-find').open);
    page.type('#wiki-find input', 'eyepatch');
    await page.waitFor(() => page.$('#wiki-find .wiki-find-card'));
    assert.match(page.text(page.$('#wiki-find .wiki-find-card')), /Rennick.*found in its text/);
    page.key('#wiki-find input', 'Enter');
    await page.waitFor(() => page.text('#wiki-main h2') === 'Rennick');
    assert.ok(!page.$('#wiki-find').open);
    assert.ok(lady);
    assert.equal(page.errors.length, 0, page.errors.join('\n'));
  });
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    const { markNames } = await page.module('wiki-names.js');
    const answer = page.document.createElement('div');
    answer.textContent = 'You met the Grey Lady near Millbrook.';
    markNames(answer);
    assert.equal(answer.querySelectorAll('.wiki-name').length, 0);
    page.document.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    assert.ok(!page.$('#wiki-find'));
  });
});
