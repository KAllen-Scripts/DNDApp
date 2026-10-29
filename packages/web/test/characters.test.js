/**
 * The player's characters on the Sheet tab (sheet/characters.js): who they
 * play now, New character, Make active, Rename, Delete (asked first).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage } from './helpers.js';
import { emptySheet } from '@dndapp/shared/sheet.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const sheetPage = () => ({ page: (t) => ({ as: t.sam, storage: NO_3D }) });
const byLabel = (page, label) => page.el(`#sheet [aria-label="${label}"]`);
const rowOf = (page, name) => [...page.document.querySelectorAll('.chars-row')].find((r) => r.querySelector('.chars-name')?.textContent.includes(name));
const button = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

test('characters: the Sheet tab says who you play; make a new one, switch back, rename and delete', async () => {
  await withPage(sheetPage(), async (page, t) => {
    const cid = t.campaign.id;
    t.sheets.save(cid, t.sam.id, { ...emptySheet({ name: 'Thorin' }), classes: [{ name: 'Rogue', subclass: '', level: 2 }] });
    page.click('[data-tab=sheet]');
    await page.waitFor(() => page.visible('#sheet-characters'));
    page.click('.chars-toggle');
    await page.settle();
    assert.match(page.text('.chars-strip'), /Playing\s*Thorin/);
    assert.match(page.text('.chars-list'), /Playing now/);

    // New character: named, then it's the sheet shown.
    page.click(button(page.el('.chars-list'), '+ New character'));
    page.type('.chars-name-form input', 'Brynja');
    page.submit('.chars-name-form');
    await page.waitFor(() => /Made Brynja/.test(page.text('.chars-message')));
    assert.equal(byLabel(page, 'Character name').value, 'Brynja');
    assert.match(page.text('.chars-strip'), /Playing\s*Brynja/);
    assert.match(page.text(rowOf(page, 'Thorin')), /Make active/);
    assert.equal(t.sheets.get(cid, t.sam.id).sheet.name, 'Brynja');

    // Typing on Brynja's sheet saves to Brynja; the strip follows the name.
    page.type(byLabel(page, 'Character name'), 'Brynja Stormborn');
    assert.match(page.text('.chars-strip'), /Brynja Stormborn/);
    await page.waitFor(() => page.text('#sheet-status') === 'Saved');
    assert.equal(t.sheets.get(cid, t.sam.id, 2).sheet.name, 'Brynja Stormborn');
    assert.equal(t.sheets.get(cid, t.sam.id, 1).sheet.name, 'Thorin');

    // Make Thorin active again.
    page.click(button(rowOf(page, 'Thorin'), 'Make active'));
    await page.waitFor(() => byLabel(page, 'Character name').value === 'Thorin');
    assert.match(page.text('#sheet .summary'), /Rogue 2/);
    assert.equal(t.sheets.activeNumber(cid, t.sam.id), 1);

    // Rename Brynja without playing her.
    page.click(button(rowOf(page, 'Brynja'), 'Rename'));
    page.type('.chars-name-form input', 'Bryn');
    page.submit('.chars-name-form');
    await page.waitFor(() => rowOf(page, 'Bryn') && /Renamed/.test(page.text('.chars-message')));
    assert.equal(t.sheets.get(cid, t.sam.id, 2).sheet.name, 'Bryn');

    // The one played has no Delete; another asks first (Cancel keeps it).
    assert.equal(button(rowOf(page, 'Thorin'), 'Delete'), undefined);
    page.answers.confirm = [false];
    page.click(button(rowOf(page, 'Bryn'), 'Delete'));
    await page.settle();
    assert.ok(rowOf(page, 'Bryn'));
    page.answers.confirm = [true];
    page.click(button(rowOf(page, 'Bryn'), 'Delete'));
    await page.waitFor(() => !rowOf(page, 'Bryn'));
    assert.match(page.dialogs.at(-1).message, /Delete Bryn\?/);
    assert.match(page.text('.chars-toggle'), /Characters \(1\)/);
  });
});

test("characters: a switch made on another device shows the other character's sheet here", async () => {
  await withPage(sheetPage(), async (page, t) => {
    const cid = t.campaign.id;
    t.sheets.save(cid, t.sam.id, emptySheet({ name: 'Thorin' }));
    t.sheets.create(cid, t.sam.id, 'Brynja', { active: false });
    page.click('[data-tab=sheet]');
    await page.settle();
    assert.equal(byLabel(page, 'Character name').value, 'Thorin');
    // The phone makes Brynja active: the live news brings her sheet.
    const res = await t.request('POST', `/campaigns/${cid}/characters/2/active`, { as: t.sam.token });
    assert.equal(res.statusCode, 200);
    await page.waitFor(() => byLabel(page, 'Character name').value === 'Brynja', { what: "Brynja's sheet" });
    assert.match(page.text('#sheet-status'), /You now play Brynja/);
    await page.waitFor(() => /Playing\s*Brynja/.test(page.text('.chars-strip')));
    assert.match(page.text('.chars-toggle'), /Characters \(2\)/);
  });
});

test('regression: the Characters strip with its list shut and no message shows no "null"', async () => {
  await withPage(sheetPage(), async (page, t) => {
    t.sheets.save(t.campaign.id, t.sam.id, emptySheet({ name: 'Thorin' }));
    page.click('[data-tab=sheet]');
    await page.waitFor(() => page.visible('#sheet-characters'));
    assert.match(page.text('#sheet-characters'), /Playing\s*Thorin/);
    assert.doesNotMatch(page.el('#sheet-characters').textContent, /null/);
  });
});
