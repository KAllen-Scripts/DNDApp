/**
 * Session prep on the page (wiki space stage 7b): the Home's Next session tile opens the prep page; its Prep board
 * shows the pages it names, clues first; the Timeline makes a lane for each arc.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

test('wiki prep: Next session, the Prep board and lanes by arc', async () => {
  await withPage({
    before: async (t) => {
      const base = `/campaigns/${t.campaign.id}/wiki`;
      const make = async (body) => (await t.request('POST', base, { body: { available: 'dm', sections: [{ heading: '', text: `About ${body.title}.`, available: 'all' }], ...body } })).json().page;
      await make({ title: 'The Bloody Ledger', kind: 'clue' });
      await make({ title: 'Rennick', kind: 'npc' });
      const arc = await make({ title: 'The Pale Hand', kind: 'arc', when: { text: 'Day 1' } });
      await make({ title: 'Plan for session 2', kind: 'session plan', sections: [
        { heading: 'Clues', text: '[[!The Bloody Ledger]]', available: 'all' },
        { heading: 'People', text: '[[Rennick]] at the docks.', available: 'all' },
      ], facts: [{ label: 'Arc', value: '[[The Pale Hand]]' }] });
      return { dana: await addDm(t), arc };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/home' }),
  }, async (page, t, { arc }) => {
    await page.waitFor(() => page.$('#wiki-main .wiki-tile-prep'));
    assert.match(page.text(page.$('#wiki-main .wiki-tile-prep')), /Plan for session 2/);
    page.click(page.$('#wiki-main .wiki-tile-prep'));
    await page.waitFor(() => page.$$('#wiki-main .wiki-actions button').some((b) => b.textContent === 'Prep board'));
    page.click(page.$$('#wiki-main .wiki-actions button').find((b) => b.textContent === 'Prep board'));
    const groups = page.$$('#wiki-main .wiki-prep-group').map((g) => page.text(g));
    assert.match(groups[0], /^Clues \(1\).*The Bloody Ledger/);
    assert.ok(groups.some((g) => /^People \(1\).*Rennick/.test(g)));
    assert.ok(groups.some((g) => /The Pale Hand/.test(g)), 'facts count too');

    // The Timeline: a lane for each arc.
    page.window.location.hash = '#/timeline';
    page.window.dispatchEvent(new page.window.HashChangeEvent('hashchange'));
    await page.waitFor(() => page.$$('#wiki-main button').some((b) => b.textContent === 'Lanes by arc'));
    page.click(page.$$('#wiki-main button').find((b) => b.textContent === 'Lanes by arc'));
    await page.waitFor(() => t.store.getSettings(t.campaign.id).wiki.lanes.length);
    assert.deepEqual(t.store.getSettings(t.campaign.id).wiki.lanes, [arc.id]);
  });
});
