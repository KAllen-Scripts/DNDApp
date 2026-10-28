/**
 * Who knows what on the page (wiki space stage 8b): the grid, a cell's player version, Reveal to… with the spoiler
 * check asking first; the warning on Waiting; a handout that would spoil asks first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

const make = (t) => async (body) => (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { available: 'all', ...body } })).json().page;

test('who knows what: the grid, a player\'s version, and Reveal to… after the spoiler check', async () => {
  await withPage({
    before: async (t) => {
      await make(t)({ title: 'The Pale Hand', kind: 'faction', available: 'dm', sections: [{ heading: '', text: 'A cult.', available: 'all' }] });
      const mira = await make(t)({ title: 'Mira', kind: 'npc', sections: [{ heading: '', text: 'A fence.', available: 'all' }, { heading: 'Secret', text: 'She spies for [[The Pale Hand]].', available: 'dm' }] });
      return { dana: await addDm(t), mira };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/knows' }),
  }, async (page, t, { mira }) => {
    await page.waitFor(() => page.$$('#wiki-main .wiki-knows-cell').length === 4);
    assert.ok(page.$$('#wiki-rail button').some((b) => b.title === 'Who knows'));
    const cell = () => page.$(`#wiki-main tr[data-page="${mira.id}"] .wiki-knows-cell[data-player="${t.alex.id}"]`);
    assert.ok(cell().classList.contains('knows-some'));
    page.click(cell());
    await page.waitFor(() => page.$('#wiki-main .wiki-knows-version'));
    assert.match(page.text('#wiki-main .wiki-knows-side h3'), /Mira, as Lyra has it/);
    assert.doesNotMatch(page.text('#wiki-main .wiki-knows-version'), /spies/);

    // Tick the secret; the spoiler check asks, and saying no reveals nothing.
    page.$$('#wiki-main .wiki-knows-parts input').find((b) => b.value === mira.sections[1].id).checked = true;
    page.answers.confirm = false;
    page.click(page.$$('#wiki-main .wiki-knows-side button').find((b) => b.textContent === 'Reveal to Lyra'));
    await page.waitFor(() => page.dialogs.some((d) => /Pale Hand, which Lyra/.test(d.message ?? d)));
    await page.settle();
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${mira.id}`, { as: t.alex.token })).json().page.sections.length, 1);

    page.answers.confirm = true;
    page.click(page.$$('#wiki-main .wiki-knows-side button').find((b) => b.textContent === 'Reveal to Lyra'));
    await page.waitFor(() => page.text('#wiki-status').includes('Revealed to Lyra'));
    await page.waitFor(() => cell()?.classList.contains('knows-all'));
  });
});

test('who knows what: a player\'s lore that would spoil shows the warning under Waiting', async () => {
  await withPage({
    before: async (t) => {
      await make(t)({ title: 'The Pale Hand', kind: 'faction', available: 'dm', sections: [{ heading: '', text: 'A cult.', available: 'all' }] });
      await make(t)({ title: 'Thorin', kind: 'character', player: t.sam.id, sections: [{ heading: '', text: 'A dwarf.', available: 'all' }] });
      await t.request('POST', `/campaigns/${t.campaign.id}/wiki/lore`, { body: { type: 'section', heading: 'Ashes', text: 'The Pale Hand burned my village.', available: 'all' }, as: t.sam.token });
      return { dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/waiting' }),
  }, async (page) => {
    await page.waitFor(() => page.$('#wiki-main .wiki-spoilers'));
    assert.match(page.text('#wiki-main .wiki-spoilers'), /names The Pale Hand, which Lyra doesn't know yet/);
  });
});

test("regression: a Who knows cell for a page the player can't see says so (it crashed on the server's empty page)", async () => {
  await withPage({
    before: async (t) => {
      const hand = await make(t)({ title: 'The Pale Hand', kind: 'faction', available: 'dm', sections: [{ heading: '', text: 'A cult.', available: 'all' }] });
      return { dana: await addDm(t), hand };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/knows' }),
  }, async (page, t, { hand }) => {
    const cell = () => page.$(`#wiki-main tr[data-page="${hand.id}"] .wiki-knows-cell[data-player="${t.alex.id}"]`);
    await page.waitFor(() => cell());
    page.click(cell());
    await page.waitFor(() => /can't see this page/.test(page.text('#wiki-main .wiki-knows-side')));
    assert.match(page.text('#wiki-main .wiki-knows-side h3'), /The Pale Hand, as Lyra has it/);
    assert.ok(page.$('#wiki-main .wiki-knows-parts'), 'the parts to reveal are still offered');
  });
});
