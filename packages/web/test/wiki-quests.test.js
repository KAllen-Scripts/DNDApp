/**
 * The quest board and lists on the page (wiki space stage 8a): quests in columns, moved by dragging or by their
 * status; a Wheel filter saved as a list on the Home; Make a list; a player's board has no tools.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, createFakeLLM } from './helpers.js';

const make = (t) => async (body) => (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { available: 'all', sections: [{ heading: '', text: `About ${body.title}.`, available: 'all' }], ...body } })).json().page;

test('quest board: columns by status, a drag and a pick save it; a player only reads', async () => {
  await withPage({
    before: async (t) => {
      const ledger = await make(t)({ title: 'Find the ledger', kind: 'quest', facts: [{ label: 'Status', value: 'Active' }, { label: 'Reward', value: '50 gp' }] });
      const rats = await make(t)({ title: 'Rats in the cellar', kind: 'job' });
      return { dana: await addDm(t), ledger, rats };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/quests' }),
  }, async (page, t, { ledger, rats }) => {
    await page.waitFor(() => page.$$('#wiki-main .wiki-quest-card').length === 2);
    const col = (key) => page.$(`#wiki-main .wiki-quest-col[data-column="${key}"]`);
    assert.match(page.text(col('active')), /Find the ledger.*50 gp/);
    assert.match(page.text(col('')), /Rats in the cellar/);
    assert.ok(page.$$('#wiki-rail button').some((b) => b.title === 'Quests'));

    // Dragged to Done.
    const drop = new page.window.Event('drop', { bubbles: true, cancelable: true });
    drop.dataTransfer = { getData: () => ledger.id };
    col('done').dispatchEvent(drop);
    await page.waitFor(() => page.$(`#wiki-main .wiki-quest-col[data-column="done"] [data-page="${ledger.id}"]`));
    const facts = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${ledger.id}`)).json().page.facts;
    assert.equal(facts.find((f) => f.label === 'Status').value, 'Done');

    // Picked: Rumoured.
    const pick = page.$(`#wiki-main [data-page="${rats.id}"] select`);
    pick.value = 'rumoured';
    pick.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    await page.waitFor(() => page.$(`#wiki-main .wiki-quest-col[data-column="rumoured"] [data-page="${rats.id}"]`));
  });
});

test('quest board: a player sees their quests with no way to move them', async () => {
  await withPage({
    before: async (t) => {
      await make(t)({ title: 'Find the ledger', kind: 'quest', facts: [{ label: 'Status', value: 'Active' }] });
      await make(t)({ title: 'The hidden heir', kind: 'quest', available: 'dm' });
    },
    page: (t) => ({ as: t.sam, path: '/?space=wiki#/quests' }),
  }, async (page) => {
    await page.waitFor(() => page.$$('#wiki-main .wiki-quest-card').length === 1);
    assert.equal(page.$$('#wiki-main .wiki-quest-card select').length, 0);
    assert.doesNotMatch(page.text('#wiki-main'), /hidden heir/);
  });
});

test('lists: the Wheel\'s filter saved as a list on the Home; Make a list, saved', async () => {
  let ids = {};
  await withPage({
    setup: { llm: createFakeLLM({ wiki: () => ({ name: 'Hostile NPCs', page_ids: [ids.grim] }) }) },
    before: async (t) => {
      ids.grim = (await make(t)({ title: 'Grim', kind: 'npc', tags: ['millbrook'] })).id;
      await make(t)({ title: 'Mayor Hollis', kind: 'npc' });
      await make(t)({ title: 'The Drowned Rat', kind: 'tavern', tags: ['millbrook'] });
      return { dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/wheel/person' }),
  }, async (page) => {
    await page.waitFor(() => page.$('#wiki-main .wiki-save-list'));
    page.click(page.$$('#wiki-main .wiki-tags button').find((b) => b.textContent === '#millbrook'));
    page.click('#wiki-main .wiki-save-list');
    await page.waitFor(() => page.$('#wiki-list-save[open]'));
    assert.equal(page.$('#wiki-list-save [aria-label="Family"]').value, 'person');
    assert.equal(page.$('#wiki-list-save [aria-label="Tag"]').value, 'millbrook');
    page.type('#wiki-list-save [aria-label="Name of the list"]', 'Millbrook folk');
    page.submit('#wiki-list-save form');
    await page.waitFor(() => page.text('#wiki-status').includes('Saved'));

    page.window.location.hash = '#/home';
    page.window.dispatchEvent(new page.window.HashChangeEvent('hashchange'));
    await page.waitFor(() => page.$('#wiki-main .wiki-list-row'));
    assert.match(page.text('#wiki-main .wiki-list-row'), /Millbrook folk 1.*Grim/);

    page.type('#wiki-main [aria-label="Make a list of"]', 'hostile NPCs');
    page.submit('#wiki-main .wiki-list-make');
    await page.waitFor(() => page.$('#wiki-main .wiki-list-made .wiki-list-row'));
    page.click(page.$$('#wiki-main .wiki-list-made button').find((b) => b.textContent === 'Save it'));
    await page.waitFor(() => page.$$('#wiki-main .wiki-list-row').length === 2);
    assert.match(page.text(page.$$('#wiki-main .wiki-list-row')[1]), /Hostile NPCs 1.*Grim/);
  });
});
