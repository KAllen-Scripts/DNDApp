/**
 * Help making a character (sheet-help.js): a panel above the sheet saying
 * what the class, race and background give and what to choose. Nothing is
 * forced: clicking ticks a skill or fills something in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage } from './helpers.js';
import { emptySheet } from '@dndapp/shared/sheet.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const byLabel = (page, label) => page.el(`#sheet [aria-label="${label}"]`);
const chip = (page, sel, text) => [...page.document.querySelectorAll(`#sheet .sh-help ${sel} .help-chip`)].find((b) => b.textContent.replace('✓ ', '').trim() === text);
const button = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const saved = (t) => t.sheets.get(t.campaign.id, t.sam.id).sheet;

test('creation help: open on a new sheet; pick a class, tick its skills, put its equipment in, pick a race and a background', async () => {
  await withPage({
    before: async (t) => { t.sheets.save(t.campaign.id, t.sam.id, emptySheet({ name: 'Thorin' })); },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page, t) => {
    page.click('[data-tab=sheet]');
    assert.ok(page.el('#sheet .sh-help').open, 'open while the sheet has no class');
    assert.match(page.text('#sheet .sh-help summary'), /2014 rules/);
    page.click(chip(page, '.help-part', 'Rogue'));
    await page.settle();
    assert.equal(byLabel(page, 'Class').value, 'Rogue');
    const rogue = () => page.el('#sheet .sh-help [data-class="rogue"]');
    assert.match(page.text(rogue()), /Hit die d8/);
    assert.match(page.text(rogue()), /Dexterity and Intelligence/);
    assert.match(page.text(rogue()), /Choose 4/);
    assert.match(page.text(rogue()), /0 of 4 ticked/);
    assert.match(page.text(rogue()), /Sneak Attack/);

    page.click(chip(page, '[data-class="rogue"]', 'Stealth'));
    await page.settle();
    assert.match(page.text(rogue()), /1 of 4 ticked/);
    page.click(button(rogue(), 'Put in the Equipment box'));
    await page.settle();
    page.click(chip(page, '.help-part', 'Hill Dwarf'));
    await page.settle();
    assert.match(page.text('#sheet .sh-help [data-race="Hill Dwarf"]'), /Darkvision/);
    page.click(chip(page, '.help-part', 'Acolyte'));
    await page.waitFor(() => page.text('#sheet-status') === 'Saved' && saved(t).background === 'Acolyte');
    const sheet = saved(t);
    assert.equal(sheet.skills.stealth, 'proficient');
    assert.equal(sheet.skills.insight, 'proficient', "the background's skills");
    assert.match(sheet.equipment, /Rogue starting equipment/);
    assert.match(sheet.equipment, /thieves' tools/);
    assert.equal(sheet.race, 'Hill Dwarf');
    assert.ok(page.el('#sheet .sh-help').open, 'it stays open while you use it');
  });
});

test('creation help: follows the campaign edition, and redraws as the class is typed', async () => {
  await withPage({
    before: async (t) => {
      await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { edition: '2024' } });
      t.sheets.save(t.campaign.id, t.sam.id, emptySheet({ name: 'Thorin' }));
    },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page) => {
    page.click('[data-tab=sheet]');
    assert.match(page.text('#sheet .sh-help summary'), /2024 rules/);
    assert.ok(chip(page, '.help-part', 'Goliath'), "2024's species");
    page.type(byLabel(page, 'Class'), 'Fighter');
    await page.settle();
    const fighter = page.el('#sheet .sh-help [data-class="fighter"]');
    assert.match(page.text(fighter), /Weapon Mastery/);
    assert.match(page.text(fighter), /Tactical Mind/);
    // Folding it away is remembered.
    page.el('#sheet .sh-help').open = false;
    page.el('#sheet .sh-help').dispatchEvent(new page.window.Event('toggle'));
    assert.equal(page.window.localStorage.getItem('dndapp.sheetHelp'), '0');
  });
});
