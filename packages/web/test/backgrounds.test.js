/**
 * Backgrounds on the sheet (sheet-background.js): picking one applies it,
 * says what changed, and can be undone; the DM's own (campaign-backgrounds.js)
 * are suggested on players' sheets and apply the same way.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';
import { emptySheet } from '@dndapp/shared/sheet.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const byLabel = (page, label) => page.el(`#sheet [aria-label="${label}"]`);
const button = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const suggested = (page) => [...page.document.querySelectorAll('#dl-backgrounds option')].map((o) => o.value);

test('backgrounds: picking Acolyte ticks its skills, adds its feature, fills only what is empty, says so, and Undo puts it back', async () => {
  await withPage({
    before: async (t) => { t.sheets.save(t.campaign.id, t.sam.id, { ...emptySheet({ name: 'Thorin' }), equipment: 'My own pack', skills: { religion: 'expertise' } }); },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page, t) => {
    page.click('[data-tab=sheet]');
    assert.ok(suggested(page).includes('Acolyte'));
    assert.ok(!suggested(page).includes('Sage (2024)') && !suggested(page).includes('Farmer'), "2014 game: 2024's backgrounds aren't suggested");
    page.type(byLabel(page, 'Background'), 'acolyte');
    await page.waitFor(() => page.el('#sheet .bg-applied'));
    assert.match(page.text('#sheet .bg-applied'), /Acolyte applied/);
    await page.waitFor(() => page.text('#sheet-status') === 'Saved');
    const { sheet } = t.sheets.get(t.campaign.id, t.sam.id);
    assert.equal(sheet.background, 'Acolyte');
    assert.equal(sheet.skills.insight, 'proficient');
    assert.equal(sheet.skills.religion, 'expertise', 'expertise is never lowered');
    assert.match(sheet.features, /Shelter of the Faithful/);
    assert.equal(sheet.equipment, 'My own pack', 'equipment already typed is kept');
    assert.match(page.text('#sheet .bg-gives'), /What Acolyte gives/);

    page.click(button(page.el('#sheet .bg-applied'), 'Undo'));
    await page.waitFor(() => page.text('#sheet-status') === 'Saved' && !t.sheets.get(t.campaign.id, t.sam.id).sheet.skills.insight);
    const back = t.sheets.get(t.campaign.id, t.sam.id).sheet;
    assert.equal(back.background, 'acolyte', 'what was typed stays; what it added goes');
    assert.doesNotMatch(back.features, /Shelter/);
    assert.equal(page.$('#sheet .bg-applied'), null);
  });
});

test("backgrounds: the DM makes one in Campaign settings; a player's sheet suggests it live and applies it", async () => {
  await withPage({ before: async (t) => ({ dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana, storage: NO_3D }) }, async (page, t) => {
    page.click('#settings-open');
    page.click(button(page.el('#settings-dialog'), '+ New background'));
    page.type('#settings-dialog .bg-form [aria-label="Name"]', 'River Smuggler');
    page.click('#settings-dialog [data-bg="skills-stealth"]');
    page.click('#settings-dialog [data-bg="skills-deception"]');
    page.type('#settings-dialog [aria-label="Feature name"]', 'Quiet Water');
    page.click(button(page.el('#settings-dialog'), 'Save background'));
    await page.waitFor(() => /Saved River Smuggler/.test(page.text('#settings-dialog')), { what: 'the background to save' });
    assert.match(page.text('#settings-dialog .bg-list'), /River Smuggler/);
    const [b] = t.store.getSettings(t.campaign.id).backgrounds;
    assert.deepEqual([b.name, b.skills, b.feature.name], ['River Smuggler', ['stealth', 'deception'], 'Quiet Water']);
  });

  await withPage({
    before: async (t) => {
      t.sheets.save(t.campaign.id, t.sam.id, emptySheet({ name: 'Thorin' }));
    },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page, t) => {
    page.click('[data-tab=sheet]');
    assert.ok(!suggested(page).includes('Hill Bandit'));
    await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { backgrounds: [{ name: 'Hill Bandit', skills: ['stealth', 'survival'], feature: { name: 'Hideout', text: 'You know a cave.' } }] } });
    await page.waitFor(() => suggested(page).includes('Hill Bandit'), { what: "the DM's background to reach the sheet" });
    page.type(byLabel(page, 'Background'), 'Hill Bandit');
    await page.waitFor(() => /Hill Bandit applied/.test(page.text('#sheet .bg-applied')));
    assert.match(page.text('#sheet .bg-gives'), /your DM/);
    await page.waitFor(() => page.text('#sheet-status') === 'Saved');
    const { sheet } = t.sheets.get(t.campaign.id, t.sam.id);
    assert.equal(sheet.skills.survival, 'proficient');
    assert.match(sheet.features, /Hideout/);
  });
});

test('regression: what a background gives sits full width under the info grid, not in its narrow cell, and Apply goes once it would add nothing', async () => {
  await withPage({
    before: async (t) => { t.sheets.save(t.campaign.id, t.sam.id, { ...emptySheet({ name: 'Wren' }), background: 'Outlander' }); },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page) => {
    page.click('[data-tab=sheet]');
    const gives = page.el('#sheet .bg-gives');
    assert.ok(gives, 'Outlander is known, so what it gives is shown');
    assert.equal(gives.closest('.info-grid'), null, 'not inside a grid cell (a sixth of the width squeezed it to a letter a line)');
    assert.equal(gives.closest('label'), null, 'not inside the Background label (its clicks went to the input)');
    assert.ok(button(gives, 'Apply Outlander to the sheet'), 'offered while it would still add something');

    page.click(button(gives, 'Apply Outlander to the sheet'));
    await page.waitFor(() => /Outlander applied/.test(page.text('#sheet .bg-applied')));
    assert.equal(button(page.el('#sheet .bg-gives'), 'Apply Outlander to the sheet'), undefined, 'already applied: the button goes');
    page.click(button(page.el('#sheet .bg-applied'), 'OK'));
    await page.waitFor(() => !page.$('#sheet .bg-applied'));
    assert.equal(button(page.el('#sheet .bg-gives'), 'Apply Outlander to the sheet'), undefined, 'and stays gone after OK');
  });
});
