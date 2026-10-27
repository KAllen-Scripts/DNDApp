/**
 * Tidy up on the page (wiki space stage 8c): the rules with something to fix, and their buttons fixing it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

test('wiki tidy: a missing page made, names linked, and the list follows', async () => {
  await withPage({
    before: async (t) => {
      const make = async (body) => (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { available: 'all', ...body } })).json().page;
      await make({ title: 'The Drowned Rat', kind: 'tavern', sections: [{ heading: '', text: 'A tavern.', available: 'all' }] });
      const mira = await make({ title: 'Mira', kind: 'npc', sections: [{ heading: '', text: 'Mira drinks at the Drowned Rat with [[Vex]].', available: 'all' }] });
      return { dana: await addDm(t), mira };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/tidy' }),
  }, async (page, t, { mira }) => {
    await page.waitFor(() => page.$('#wiki-main .wiki-tidy-rule'));
    assert.ok(page.$$('#wiki-rail button').some((b) => b.title === 'Tidy up'));
    const rule = (r) => page.$(`#wiki-main .wiki-tidy-rule[data-rule="${r}"]`);
    assert.match(page.text(rule('missing_link')), /Mira links "Vex", which has no page/);

    page.click(page.$$(`#wiki-main [data-rule="missing_link"] button`).find((b) => b.textContent === 'Make the page'));
    await page.waitFor(() => !rule('missing_link') && rule('unlinked'));
    assert.ok((await t.request('GET', `/campaigns/${t.campaign.id}/wiki`)).json().pages.some((p) => p.title === 'Vex'));

    page.click(page.$$(`#wiki-main [data-rule="unlinked"] button`).find((b) => b.textContent === 'Link them'));
    await page.waitFor(() => !rule('unlinked'));
    const text = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${mira.id}`)).json().page.sections[0].text;
    assert.match(text, /\[\[The Drowned Rat\|the Drowned Rat\]\]/);
  });
});
