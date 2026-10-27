/**
 * Character pages on the page (wiki space stage 6b): Waiting offers one for each character; the page shows the
 * sheet's parts live; its player chooses what the other players see.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

const SHEET = { name: 'Thorin', race: 'Dwarf', classes: [{ name: 'Fighter', subclass: '', level: 3 }], backstory: 'Exiled from the Iron Hills.', appearance: 'A braided red beard.' };

test('character pages: the DM makes one from Waiting and sees the sheet live', async () => {
  await withPage({
    before: async (t) => {
      t.sheets.save(t.campaign.id, t.sam.id, SHEET, { baseVersion: 0, by: t.sam.id });
      return { dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/waiting' }),
  }, async (page) => {
    await page.waitFor(() => page.$$('.wiki-character-offers button').length === 2);
    page.click(page.$$('.wiki-character-offers button').find((b) => b.textContent.includes('Thorin')));
    await page.waitFor(() => page.$('#wiki-main .wiki-from-sheet'));
    const box = page.text('#wiki-main .wiki-from-sheet');
    assert.match(box, /Dwarf/);
    assert.match(box, /Iron Hills/);
    assert.equal(page.$$('#wiki-main .wiki-sheet-share input').length, 4, 'the DM can choose too');
  });
});

test('character pages: the player shares their backstory, and another player sees only that', async () => {
  let pageId;
  await withPage({
    before: async (t) => {
      t.sheets.save(t.campaign.id, t.sam.id, SHEET, { baseVersion: 0, by: t.sam.id });
      pageId = (await t.request('POST', `/campaigns/${t.campaign.id}/wiki/characters`, { body: { player: t.sam.id } })).json().page.id;
    },
    page: (t) => ({ as: t.sam, path: `/?space=wiki#/page/${pageId}` }),
  }, async (page, t) => {
    await page.waitFor(() => page.$('#wiki-main .wiki-from-sheet'));
    assert.match(page.text('#wiki-main .wiki-from-sheet h3'), /From your sheet/);
    const tick = page.$$('#wiki-main .wiki-sheet-share input').find((x) => x.value === 'backstory');
    tick.checked = true;
    tick.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    await page.waitFor(() => page.text('#wiki-status').includes('Saved'));
    const alex = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${pageId}`, { as: t.alex.token })).json();
    assert.deepEqual(alex.from_sheet.sections.map((s) => s.heading), ['Backstory']);
    assert.deepEqual(alex.from_sheet.facts, []);
  });
});
