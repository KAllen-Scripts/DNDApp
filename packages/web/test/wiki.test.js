/**
 * The DM's Wiki tab on the page: only the DM has it; the DM makes a page with
 * a section for one player and a block only for the DM, follows a [[link]],
 * views it as a player, edits it and brings an earlier version back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

const button = (page, scope, text) => page.$$(`${scope} button`).find((b) => b.textContent.trim() === text);

test('wiki tab: only the DM has it', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    assert.ok(!page.visible('[data-tab=wiki]'));
    assert.ok(!page.requests.some((r) => r.path.includes('/wiki')), "a player's page never asks for the wiki");
  });
});

test('wiki tab: the DM makes a page, links it, sees it as a player, edits it and brings back the first version', async () => {
  await withPage({
    before: async (t) => ({ dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    assert.ok(page.visible('[data-tab=wiki]'));
    page.click('[data-tab=wiki]');
    assert.ok(page.visible('#tab-wiki'));
    assert.match(page.text('#wiki-list'), /No pages yet/);

    page.click('#wiki-new');
    let form = page.$('.wiki-editor');
    page.type(form.querySelector('[aria-label=Title]'), 'The Grey Lady');
    page.type(form.querySelector('[aria-label=Kind]'), 'npc');
    page.type(form.querySelector('[aria-label="Other names"]'), 'Ilse Varn');
    page.type(form.querySelector('[aria-label="Page available to"]'), 'all');
    page.type(form.querySelector('[aria-label="Section text"]'), 'A ghost at the [[Hollow Mill]].\n:::for Thorin\nShe hid the deed under the millstone.\n:::\n:::dm\nShe betrays them at the full moon.\n:::');
    page.submit(form);
    await page.waitFor(() => page.text('#wiki-main').includes('Available to everyone'));
    const [lady] = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki`)).json().pages;
    assert.equal(lady.title, 'The Grey Lady');
    assert.deepEqual(lady.aliases, ['Ilse Varn']);
    assert.match(page.text('#wiki-main'), /Only for Thorin/);
    assert.match(page.text('#wiki-main'), /Only you/);

    // As Thorin's player: the shared part and Thorin's block, never the DM's.
    page.type('#wiki-main select[aria-label="View as"]', String(t.sam.id));
    await page.waitFor(() => page.text('#wiki-main').includes('What Ask can tell Thorin'));
    assert.match(page.text('#wiki-main'), /millstone/);
    assert.doesNotMatch(page.text('#wiki-main'), /full moon/);
    page.type('#wiki-main select[aria-label="View as"]', String(t.alex.id));
    await page.waitFor(() => page.text('#wiki-main').includes('What Ask can tell Lyra'));
    assert.doesNotMatch(page.text('#wiki-main'), /millstone|full moon/);

    // A link to a page that doesn't exist yet offers to make it.
    page.click(page.$('#wiki-main button.wiki-link.missing'));
    form = page.$('.wiki-editor');
    assert.equal(form.querySelector('[aria-label=Title]').value, 'Hollow Mill');
    page.type(form.querySelector('[aria-label="Section text"]'), 'An old mill north of Brindle.');
    page.submit(form);
    await page.waitFor(() => page.text('#wiki-main').includes('Mentioned in: The Grey Lady'));
    assert.match(page.text('#wiki-main'), /Available to only you/, 'a new page is only the DM\'s');

    // Edit the Grey Lady, then bring her first version back.
    page.click(button(page, '#wiki-list', 'The Grey Lady shared'));
    await page.waitFor(() => page.text('#wiki-main h2') === 'The Grey Lady');
    page.click(button(page, '#wiki-main', 'Edit'));
    form = page.$('.wiki-editor');
    page.type(form.querySelector('[aria-label=Title]'), 'The Pale Lady');
    page.submit(form);
    await page.waitFor(() => page.text('#wiki-main h2') === 'The Pale Lady');
    assert.match(page.text('#wiki-main'), /also called Ilse Varn, The Grey Lady/);
    page.click(button(page, '#wiki-main', 'History'));
    await page.waitFor(() => page.$$('.wiki-history li').length === 2);
    page.click(button(page, '.wiki-history', 'Version 1'));
    await page.waitFor(() => !!button(page, '#wiki-main', 'Bring this version back'));
    page.click(button(page, '#wiki-main', 'Bring this version back'));
    await page.waitFor(() => page.text('#wiki-main h2') === 'The Grey Lady');
    await page.settle();
    const back = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${lady.id}`)).json().page;
    assert.equal(back.version, 3);
  });
});
