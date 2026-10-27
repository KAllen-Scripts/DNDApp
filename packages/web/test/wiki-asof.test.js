/**
 * Scrubbing through time (wiki space stage 11): the Web's As of slider goes back to the end of a session; the
 * Timeline's Lanes by character turns on (the lanes themselves: server/test/wiki-asof.test.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

test('wiki as of: the Web at the end of an old session, then now again', async () => {
  await withPage({
    before: async (t) => {
      const cid = t.campaign.id;
      // A session played long before the pages were written.
      t.store.addSession(cid, { number: 1, title: 'The start', played_on: '2020-01-01' }, Buffer.from('DM: Hello.'));
      const make = async (body) => (await t.request('POST', `/campaigns/${cid}/wiki`, { body })).json().page;
      await make({ title: 'The Pale Hand', kind: 'faction', available: 'all', sections: [{ heading: '', text: 'A cult.', available: 'all' }] });
      await make({ title: 'Mira', kind: 'npc', available: 'all', sections: [{ heading: '', text: 'A fence.', available: 'all' }], facts: [{ label: 'Allegiance', value: '[[The Pale Hand]]', available: 'all' }] });
      return { dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/web' }),
  }, async (page) => {
    await page.waitFor(() => page.$$('#wiki-main .wiki-web-node').length === 2);
    const range = page.$('#wiki-main .wiki-asof input[type=range]');
    await page.waitFor(() => !range.disabled);
    assert.equal(range.max, '1');
    assert.match(page.text('#wiki-main .wiki-asof'), /Now/);
    range.value = '0';
    range.dispatchEvent(new page.window.Event('input', { bubbles: true }));
    range.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    await page.waitFor(() => page.$('#wiki-main .wiki-web-empty'));
    assert.match(page.text('#wiki-main .wiki-asof'), /session 1: The start \(2020-01-01\)/);
    range.value = '1';
    range.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    await page.waitFor(() => page.$$('#wiki-main .wiki-web-node').length === 2);
  });
});

test('wiki timeline: Lanes by character', async () => {
  await withPage({
    before: async (t) => ({ dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/timeline' }),
  }, async (page) => {
    await page.waitFor(() => page.$$('#wiki-main button').some((b) => b.textContent === 'Lanes by character'));
    page.click(page.$$('#wiki-main button').find((b) => b.textContent === 'Lanes by character'));
    await page.waitFor(() => page.$$('#wiki-main button').find((b) => b.textContent === 'Lanes by character')?.getAttribute('aria-pressed') === 'true');
  });
});
