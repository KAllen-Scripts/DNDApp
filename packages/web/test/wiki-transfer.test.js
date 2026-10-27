/**
 * Moving the wiki in and out (wiki space stage 9b): the DM imports a vault zip and pastes notes for the AI; a page
 * prints; a player gets Export and print, without Import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { withPage, addDm, createFakeLLM } from './helpers.js';

test('wiki import and print: a vault zip, notes for the AI, and printing pages', async () => {
  await withPage({
    setup: { llm: createFakeLLM({ wiki: ({ purpose }) => (purpose !== 'wiki:import' ? { changes: [] } : {
      pages: [{ title: 'Old Pell', kind: 'npc', sections: [{ heading: '', text: 'Sells rope.' }] }],
    }) }) },
    before: async (t) => ({ dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/import' }),
  }, async (page, t) => {
    await page.waitFor(() => page.text('#wiki-main').includes('Import and export'));
    const vault = Buffer.from(zipSync({ 'Millbrook/Millbrook.md': strToU8('---\nkind: town\n---\nA town.'), 'Millbrook/The Drowned Rat.md': strToU8('An inn in [[Millbrook]].') }));
    page.setFiles(page.$('#wiki-main input[type=file]'), [{ name: 'vault.zip', type: 'application/zip', content: vault }]);
    page.click(page.$$('#wiki-main button').find((b) => b.textContent === 'Import the file'));
    await page.waitFor(() => page.text('#wiki-main .wiki-import-out').includes('Imported 2 pages'));
    assert.deepEqual(t.wiki.list(t.campaign.id).map((p) => p.title).sort(), ['Millbrook', 'The Drowned Rat']);

    page.type(page.$('#wiki-main textarea'), 'pell sells rope');
    page.click(page.$$('#wiki-main button').find((b) => b.textContent === '✦ Sort into pages'));
    await page.waitFor(() => page.text('#wiki-main .wiki-import-out').includes('1 page and additions wait for you under Waiting'));

    // Print two pages: they're put together for the printer, then taken away.
    await page.waitFor(() => page.$$('#wiki-main .wiki-print-choice').length === 2);
    for (const box of page.$$('#wiki-main .wiki-print-choice input')) page.click(box);
    page.click(page.$$('#wiki-main button').find((b) => b.textContent === 'Print the ticked pages'));
    await page.waitFor(() => page.printed === 1);
    assert.equal(page.$$('#wiki-print .wiki-print-page').length, 2);
    assert.match(page.text('#wiki-print'), /A town\.[\s\S]*An inn in/);
    page.window.dispatchEvent(new page.window.Event('afterprint'));
    assert.equal(page.$('#wiki-print'), null);
  });
});

test('wiki export: a player gets Export and print, not Import', async () => {
  await withPage({
    before: async (t) => {
      await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { title: 'The Vale', available: 'all', sections: [{ heading: '', text: 'Green hills.', available: 'all' }] } });
    },
    page: (t) => ({ as: t.sam, path: '/?space=wiki#/import' }),
  }, async (page) => {
    await page.waitFor(() => page.text('#wiki-main').includes('Export and print'));
    assert.doesNotMatch(page.text('#wiki-main'), /Import the file|Sort into pages/);
    assert.ok(page.$$('#wiki-rail a, #wiki-rail button').some((x) => /Export and print/.test(x.textContent + (x.title ?? '') + (x.getAttribute('aria-label') ?? ''))));
    assert.ok(page.$$('#wiki-main button').some((b) => b.textContent === 'Download the zip'));
  });
});
