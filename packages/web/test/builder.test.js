/**
 * The character builder (sheet/builder.js): steps above the sheet, opening by itself on a new
 * character. Every change can be taken back: Undo one at a time, Start over to the sheet as it was.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withPage } from './helpers.js';
import { emptySheet } from '@dndapp/shared/sheet.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const byLabel = (page, label) => page.el(`#sheet [aria-label="${label}"]`);
const chip = (page, text) => [...page.document.querySelectorAll('#sheet .builder .help-chip')].find((b) => b.textContent.replace('✓ ', '').trim() === text);
const button = (page, text) => [...page.document.querySelectorAll('#sheet .builder button')].find((b) => b.textContent.trim() === text);
const step = (page, k) => page.el(`#sheet .builder [data-step="${k}"]`);
const saved = (t) => t.sheets.get(t.campaign.id, t.sam.id).sheet;
const thorin = (t) => { t.sheets.save(t.campaign.id, t.sam.id, emptySheet({ name: 'Thorin' })); };

test('builder: opens on a new character; pick a class, race and background, tick skills, take the starting equipment; Undo and Start over take it all back', async () => {
  await withPage({ before: thorin, page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page, t) => {
    page.click('[data-tab=sheet]');
    assert.ok(page.$('#sheet .builder'), 'open on a character with nothing picked');
    assert.ok(page.$('#sheet').classList.contains('building'));
    assert.match(page.text('#sheet .builder .build-head'), /2014 rules/);
    page.click(chip(page, 'Rogue'));
    await page.settle();
    assert.equal(byLabel(page, 'Class').value, 'Rogue');
    assert.match(page.text('#sheet .builder [data-class="rogue"]'), /Hit die d8/);
    assert.match(page.text('#sheet .builder .build-undo'), /Undo \(1\)/);

    // Undo: the class goes again.
    page.click('#sheet .builder .build-undo');
    assert.equal(byLabel(page, 'Class').value, '');
    assert.equal(page.$('#sheet .builder .build-undo').disabled, true);
    page.click(chip(page, 'Rogue'));
    page.click('#sheet .builder .build-next');
    assert.equal(step(page, 'race').getAttribute('aria-selected'), 'true');
    page.click(chip(page, 'Hill Dwarf'));
    page.click(step(page, 'background'));
    page.click(chip(page, 'Acolyte'));
    await page.settle();

    page.click(step(page, 'skills'));
    assert.match(page.text('#sheet .builder .build-body'), /1 of 4 ticked/, "the background's Insight is on the rogue's list");
    page.click(chip(page, 'Stealth'));
    assert.match(page.text('#sheet .builder .build-body'), /2 of 4 ticked/);

    page.click(step(page, 'equipment'));
    page.click(page.$$('#sheet .build-gear[data-line="1"] .help-chip').find((b) => b.textContent === 'a shortsword'));
    page.click(button(page, 'Put these in my inventory'));
    assert.match(page.text('#sheet .builder .build-body'), /In your inventory now/);
    await page.waitFor(() => page.text('#sheet-status') === 'Saved' && saved(t).inventory.length > 0);
    let sheet = saved(t);
    const names = sheet.inventory.map((g) => g.name);
    for (const n of ['Rapier', 'Shortsword', 'Leather armor', 'Dagger', "Thieves' tools", "Burglar's pack"]) assert.ok(names.includes(n), n);
    assert.equal(sheet.inventory.find((g) => g.name === 'Dagger').qty, 2);
    assert.equal(sheet.skills.stealth, 'proficient');
    assert.equal(sheet.skills.insight, 'proficient', "the background's skills");
    assert.equal(sheet.race, 'Hill Dwarf');

    // Undo once: the equipment comes back out, the rest stays.
    page.click('#sheet .builder .build-undo');
    await page.waitFor(() => page.text('#sheet-status') === 'Saved' && saved(t).inventory.length === 0);
    assert.equal(saved(t).skills.stealth, 'proficient');

    // Start over (asks once more): the sheet as it was when the builder opened.
    page.click('#sheet .builder .build-reset');
    assert.match(page.text('#sheet .builder .build-reset'), /Sure/);
    page.click('#sheet .builder .build-reset');
    await page.waitFor(() => page.text('#sheet-status') === 'Saved' && saved(t).race === '');
    sheet = saved(t);
    assert.deepEqual([sheet.classes[0].name, sheet.background, sheet.skills, sheet.name], ['', '', {}, 'Thorin']);
    assert.equal(sheet.features, '');

    // Closing keeps the sheet; ⚒ Build opens it again.
    page.click('#sheet .builder .build-close');
    assert.equal(page.$('#sheet .builder'), null);
    assert.ok(!page.$('#sheet').classList.contains('building'));
    page.click('#sheet .build-open');
    assert.ok(page.$('#sheet .builder'));
  });
});

test('builder: ability scores from the standard array or rolled on the server, with the race\'s bonuses', async () => {
  mock.method(crypto, 'randomInt', () => 5);
  try {
    await withPage({ before: thorin, page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page, t) => {
      page.click('[data-tab=sheet]');
      page.click(chip(page, 'Wizard'));
      page.click(step(page, 'race'));
      page.click(chip(page, 'High Elf'));
      page.click(step(page, 'abilities'));
      page.click('#sheet .builder [data-method="array"]');
      page.type(byLabel(page, 'Intelligence: score to place'), '0'); // the 15
      assert.equal(byLabel(page, 'Intelligence score').value, '16', '15 + 1 (High Elf)');
      assert.equal(byLabel(page, 'Strength: score to place').querySelectorAll('option').length, 6, 'the 15 is taken');
      page.type(byLabel(page, 'Dexterity: score to place'), '1'); // the 14
      assert.equal(byLabel(page, 'Dexterity score').value, '16', '14 + 2');

      page.click('#sheet .builder [data-method="roll"]');
      page.click('#sheet .builder .build-roll');
      await page.waitFor(() => page.$('#sheet .builder .build-assign p'), { what: 'the six rolls' });
      assert.match(page.text('#sheet .builder .build-assign'), /Rolled: 15, 15, 15, 15, 15, 15/);
      page.type(byLabel(page, 'Strength: score to place'), '0');
      assert.equal(byLabel(page, 'Strength score').value, '15');
      await page.waitFor(() => page.text('#sheet-status') === 'Saved' && saved(t).abilities.str === 15);

      page.click(step(page, 'spells'));
      await page.waitFor(() => page.$('#sheet .builder .build-spell-group'), { what: 'the wizard spells' });
      assert.match(page.text('#sheet .builder .build-body'), /Cantrips/);
      page.click(byLabel(page, 'Magic Missile on my sheet'));
      await page.waitFor(() => page.text('#sheet-status') === 'Saved' && saved(t).spells.length === 1);
      assert.equal(saved(t).spells[0].level, 1);
      assert.ok(saved(t).spells[0].prepared);
      // A Player's Handbook spell beyond the SRD: on the list too, added with its level (details looked up).
      page.click(byLabel(page, 'Chromatic Orb on my sheet'));
      await page.waitFor(() => page.text('#sheet-status') === 'Saved' && saved(t).spells.length === 2);
      assert.equal(saved(t).spells.find((s) => s.name === 'Chromatic Orb').level, 1);
      // Any other spell by name.
      page.type(byLabel(page, 'Another spell to add (builder)'), 'Shield');
      page.submit('#sheet .build-other-spell');
      await page.waitFor(() => page.text('#sheet-status') === 'Saved' && saved(t).spells.length === 3);
      assert.ok(saved(t).spells.some((s) => s.name === 'Shield'));
    });
  } finally {
    mock.restoreAll();
  }
});

test('builder: follows the campaign edition; the sheet as it was is kept in this browser; a skipped build stays closed', async () => {
  await withPage({
    before: async (t) => {
      await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { edition: '2024' } });
      thorin(t);
    },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page) => {
    page.click('[data-tab=sheet]');
    assert.match(page.text('#sheet .builder .build-head'), /2024 rules/);
    assert.match(page.text(step(page, 'race')), /Species/);
    page.click(step(page, 'race'));
    assert.ok(chip(page, 'Goliath'), "2024's species");
    page.click(step(page, 'class'));
    page.click(chip(page, 'Fighter'));
    page.click(step(page, 'equipment'));
    assert.match(page.text('#sheet .builder .build-body'), /155 GP/);
    const kept = JSON.parse(page.window.localStorage.getItem('dndapp.build'));
    assert.equal(kept.start.classes[0].name, '', 'the sheet as it was is kept in this browser');
    page.click(button(page, 'Close builder'));
    assert.equal(page.window.localStorage.getItem('dndapp.build'), null);
  });
  // Skipped: a new character doesn't open it again.
  await withPage({ before: thorin, page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page) => {
    page.click('[data-tab=sheet]');
    page.click('#sheet .builder .build-skip');
    assert.equal(page.$('#sheet .builder'), null);
    page.click('[data-tab=ask]');
    page.click('[data-tab=sheet]');
    assert.equal(page.$('#sheet .builder'), null);
  });
});
