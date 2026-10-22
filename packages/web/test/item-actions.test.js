/**
 * The sheet's Item actions box (sheet-item-actions.js): Bag of Tricks'
 * Use pulls out a creature (the server rolls), which joins Companions;
 * Wand of Fireballs spends extra charges; what stops an action is shown and
 * what the AI read is marked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage } from './helpers.js';
import { emptySheet } from '@dndapp/shared/sheet.js';
import { addToInventory } from '@dndapp/shared/gear.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };

test('item actions: Use on Bag of Tricks pulls out a creature that joins Companions; the wand spends extra charges', async () => {
  await withPage({
    before: async (t) => {
      let inventory = addToInventory([], { name: 'Bag of Tricks (Rust)', kind: 'magic' });
      inventory = addToInventory(inventory, { name: 'Wand of Fireballs', kind: 'magic', attunement: true });
      t.sheets.save(t.campaign.id, t.sam.id, { ...emptySheet({ name: 'Thorin' }), inventory });
    },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page, t) => {
    page.click('[data-tab=sheet]');
    const box = () => page.$('#sheet .item-actions');
    assert.ok(!box().hidden);
    assert.match(box().textContent, /Bag of Tricks \(Rust\)\s*3 of 3 charges left · back at dawn/);
    assert.match(box().textContent, /Pull out a fuzzy ball/);

    page.click(box().querySelector('[aria-label="Use Bag of Tricks (Rust): Pull out a fuzzy ball"]'));
    await page.waitFor(() => page.$('#sheet .companions .companion'), { what: 'the creature in Companions' });
    const sheet = t.sheets.get(t.campaign.id, t.sam.id).sheet;
    assert.equal(sheet.companions.length, 1);
    assert.equal(page.$('#sheet .companions .companion-name').textContent, sheet.companions[0].name);
    assert.match(page.$('#sheet .companions').textContent, /from Bag of Tricks \(Rust\) \(item\)/);
    assert.match(box().textContent, /2 of 3 charges left/);

    // The wand needs attunement first: Use waits, and says why.
    const wand = () => box().querySelector('[aria-label="Use Wand of Fireballs: Fireball"]');
    assert.ok(wand().disabled);
    assert.match(box().textContent, /Attune to Wand of Fireballs first/);
    page.click([...page.$$('#inventory input[type=checkbox]')].find((c) => /Attuned/i.test(c.closest('label')?.textContent ?? '') && c.closest('.gear-row')?.textContent.includes('Wand of Fireballs')));
    await page.waitFor(() => !wand().disabled, { what: 'the wand usable' });
    page.type(box().querySelector('[aria-label="Extra charges for Fireball: Wand of Fireballs"]'), '2');
    page.click(wand());
    await page.waitFor(() => /4 of 7 charges left/.test(box().textContent), { what: 'three charges spent' });
    const used = page.requests.filter((r) => r.path.endsWith('/sheet/gear/use')).at(-1);
    assert.deepEqual({ action: used.body.action, extra: used.body.extra }, { action: 'fireball', extra: 2 });
  });
});

test("item actions: what the AI read when the item was looked up is marked to check, and there's no box without actions", async () => {
  await withPage({
    before: async (t) => {
      t.sheets.save(t.campaign.id, t.sam.id, {
        ...emptySheet({ name: 'Thorin' }),
        inventory: [{ name: 'Rope', kind: 'gear' }, { name: 'Staff of Frost', kind: 'magic', charges: { max: 10, used: 0 }, actions: [{ name: 'Cone of Cold', kind: 'spell', cost: 5, damage: '8d8 cold', source: 'ai' }] }],
      });
    },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page) => {
    page.click('[data-tab=sheet]');
    const box = page.$('#sheet .item-actions');
    assert.match(box.querySelector('.ai-tag').textContent, /AI: check it/);
    assert.match(box.textContent, /5 charges · Cone of Cold, 8d8 cold/);
  });
});
