/**
 * Live embeds on a page (wiki space stage 9a): a creature's stat block with its rolls, an item's card, a handout,
 * and "+ Embed" in the editor puts `[[kind:Name]]` into the text. A player sees only what they could see anyway.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

const TEXT = 'They meet [[creature:Goblin boss]].\n\n[[item:Sun Blade]]\n\n[[handout:The letter]]\n\n[[creature:Nobody]]';

test('wiki live embeds: drawn on the page, and + Embed inserts one', async () => {
  await withPage({
    before: async (t) => {
      const cid = t.campaign.id;
      t.creatures.create(cid, { name: 'Goblin boss', stats: { name: 'Goblin Boss', ac: 17, hp_formula: '6d6', text: '**Scimitar.** Melee Weapon Attack: +4 to hit, reach 5 ft. Hit: 5 (1d6 + 2) slashing damage.' } }, { by: t.dm.id });
      t.items.create(cid, { name: 'Sun Blade', kind: 'weapon', rarity: 'rare', text: 'A hilt.' }, { by: t.dm.id });
      await t.handouts.create(cid, { title: 'The letter', text: 'Meet me at dawn.', to: [t.sam.id] }, { by: t.dm.id });
      const page = (await t.request('POST', `/campaigns/${cid}/wiki`, { body: { title: 'Ambush', kind: 'lore', available: 'all', sections: [{ heading: '', available: 'all', text: TEXT }] } })).json().page;
      return { dana: await addDm(t), page };
    },
    page: (t, { dana, page }) => ({ as: dana, path: `/?space=wiki#/page/${page.id}` }),
  }, async (page) => {
    await page.waitFor(() => page.$$('#wiki-main .wiki-app-embed').length === 3);
    const creature = page.$('#wiki-main .app-creature');
    assert.match(creature.textContent, /Goblin boss.*AC 17/);
    assert.ok([...creature.querySelectorAll('.wiki-app-rolls button')].some((b) => b.textContent === 'Scimitar +4'));
    assert.match(page.text('#wiki-main .app-item'), /Sun Blade/);
    assert.match(page.text('#wiki-main .app-handout'), /Meet me at dawn/);
    assert.match(page.text('#wiki-main'), /No creature called "Nobody"/);
    assert.doesNotMatch(page.text('#wiki-main'), /\[\[/);

    // + Embed in the editor puts one into the text.
    page.click(page.$$('.wiki-actions button').find((b) => b.textContent === 'Edit'));
    await page.waitFor(() => page.$$('.wiki-text-tools button').some((b) => b.textContent === '+ Embed'));
    const area = page.$$('.wiki-edit-section textarea').find((a) => a.value.includes('Goblin boss'));
    area.value = '';
    page.click(page.$$('.wiki-text-tools button').find((b) => b.textContent === '+ Embed'));
    await page.waitFor(() => page.$$('#wiki-dialog .wiki-embed-choices button').length >= 3);
    page.click(page.$$('#wiki-dialog .wiki-embed-choices button').find((b) => b.textContent === 'Sun Blade'));
    await page.waitFor(() => area.value.includes('[[item:Sun Blade]]'));
  });
});

test('wiki live embeds: a player sees only the handout they got', async () => {
  await withPage({
    before: async (t) => {
      const cid = t.campaign.id;
      t.creatures.create(cid, { name: 'Goblin boss' }, { by: t.dm.id });
      await t.handouts.create(cid, { title: 'The letter', text: 'Meet me at dawn.', to: [t.sam.id] }, { by: t.dm.id });
      const page = (await t.request('POST', `/campaigns/${cid}/wiki`, { body: { title: 'Ambush', kind: 'lore', available: 'all', sections: [{ heading: '', available: 'all', text: TEXT }] } })).json().page;
      return { page };
    },
    page: (t, { page }) => ({ as: t.sam, path: `/?space=wiki#/page/${page.id}` }),
  }, async (page) => {
    await page.waitFor(() => page.$$('#wiki-main .wiki-app-embed').length === 1);
    assert.match(page.text('#wiki-main .app-handout'), /Meet me at dawn/);
    assert.doesNotMatch(page.text('#wiki-main'), /Goblin|Sun Blade|Nobody/);
  });
});
