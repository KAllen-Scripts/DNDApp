/**
 * The Sheet tab (sheet.js): automatic values while typing, the player's own
 * values, autosave and conflicts, rolling from the sheet, spells, layouts,
 * upload and download.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withPage, addDm, createFakeLLM, openPage, openWikiView } from './helpers.js';
import { emptySheet, SHEET_FORMAT } from '@dndapp/shared/sheet.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const byLabel = (page, label) => page.el(`#sheet [aria-label="${label}"]`);
const autoBox = (page, label) => byLabel(page, label).closest('.auto');

/** Open the Sheet tab as Sam. */
const sheetPage = (opts = {}) => ({ ...opts, page: (t) => ({ as: t.sam, storage: { ...NO_3D, ...opts.storage } }) });

/** Wait for the autosave to finish. */
const saved = (page) => page.waitFor(() => page.text('#sheet-status') === 'Saved', { what: 'the sheet to save' });

const serverSheet = async (t) => (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token })).json();

test('sheet: a blank sheet; typing updates the automatic values at once and saves soon after', async () => {
  await withPage(sheetPage(), async (page, t) => {
    page.click('[data-tab=sheet]');
    assert.match(page.text('#sheet-status'), /Not saved yet/);
    assert.equal(byLabel(page, 'Strength score').value, '10');
    assert.equal(byLabel(page, 'Strength modifier').value, '+0');
    assert.equal(byLabel(page, 'Proficiency bonus').value, '+2');
    assert.equal(page.text('#sheet .summary'), 'Level 1');

    page.type(byLabel(page, 'Character name'), 'Lyra');
    page.type(byLabel(page, 'Race'), 'High Elf');
    page.type(byLabel(page, 'Class'), 'Wizard');
    page.type(byLabel(page, 'Level'), '5');
    page.type(byLabel(page, 'Intelligence score'), '18');
    page.type(byLabel(page, 'Dexterity score'), '14');

    // Worked out straight away, before anything is saved.
    assert.equal(page.text('#sheet-status'), 'Saving soon…');
    assert.equal(page.text('#sheet .summary'), 'High Elf · Wizard 5 · Level 5');
    assert.equal(byLabel(page, 'Intelligence modifier').value, '+4');
    assert.equal(byLabel(page, 'Proficiency bonus').value, '+3');
    assert.equal(byLabel(page, 'Initiative').value, '+2');
    assert.equal(byLabel(page, 'Spell save DC').value, '15');
    assert.equal(byLabel(page, 'Spell attack bonus').value, '+7');
    assert.equal(byLabel(page, '3rd level slots').value, '2');
    assert.equal(byLabel(page, '1st level slots').closest('.slot').querySelectorAll('.pips input').length, 4);

    // A number box that isn't a number is ignored, and shows the saved value again when left.
    page.type(byLabel(page, 'Dexterity score'), 'lots');
    byLabel(page, 'Dexterity score').dispatchEvent(new page.window.Event('blur'));
    assert.equal(byLabel(page, 'Dexterity score').value, '14');

    await saved(page);
    const { sheet, version } = await serverSheet(t);
    assert.equal(version, 1);
    assert.equal(sheet.name, 'Lyra');
    assert.deepEqual(sheet.classes, [{ name: 'Wizard', subclass: '', level: 5 }]);
    assert.equal(sheet.abilities.int, 18);
    assert.deepEqual(sheet.overrides, {});
  });
});

test('sheet: a value typed into an automatic box is the player\'s own until ↺; clearing the box also goes back', async () => {
  await withPage(sheetPage(), async (page, t) => {
    page.click('[data-tab=sheet]');
    const ac = byLabel(page, 'Armour class');
    assert.equal(ac.value, '10');
    page.type(ac, '15');
    assert.ok(autoBox(page, 'Armour class').classList.contains('mine'));
    const reset = autoBox(page, 'Armour class').querySelector('.reset');
    assert.ok(!reset.hidden);
    assert.match(reset.title, /automatic value is 10/);
    // Other changes don't move it.
    page.type(byLabel(page, 'Dexterity score'), '16');
    assert.equal(byLabel(page, 'Armour class').value, '15');
    await saved(page);
    assert.deepEqual((await serverSheet(t)).sheet.overrides, { ac: 15 });

    page.click(reset);
    assert.equal(ac.value, '13');
    assert.ok(reset.hidden);

    page.type(ac, '12');
    page.type(ac, '');
    ac.dispatchEvent(new page.window.Event('blur'));
    assert.equal(ac.value, '13');
    await saved(page);
    assert.deepEqual((await serverSheet(t)).sheet.overrides, {});
  });
});

test('sheet: save proficiencies, skill marks (none → proficient → expertise) and Jack of All Trades', async () => {
  await withPage(sheetPage(), async (page, t) => {
    page.click('[data-tab=sheet]');
    const save = byLabel(page, 'Proficient in Dexterity saves');
    page.type(save, true);
    assert.equal(byLabel(page, 'Dexterity save').value, '+2');
    assert.ok(!save.closest('.auto-check').querySelector('.reset').hidden);
    page.click(save.closest('.auto-check').querySelector('.reset'));
    assert.equal(byLabel(page, 'Dexterity save').value, '+0');
    assert.equal(save.checked, false);

    const mark = page.$$('#sheet .prof-mark').find((m) => m.getAttribute('aria-label').startsWith('Stealth:'));
    const stealth = () => page.$$('#sheet [aria-label="Stealth"]')[0].value;
    assert.equal(stealth(), '+0');
    page.click(mark);
    assert.equal(mark.dataset.prof, 'proficient');
    assert.equal(stealth(), '+2');
    page.click(mark);
    assert.equal(mark.dataset.prof, 'expertise');
    assert.equal(stealth(), '+4');
    page.click(mark);
    assert.equal(mark.dataset.prof, 'none');

    page.type(byLabel(page, 'Jack of All Trades'), true);
    assert.equal(stealth(), '+1');
    await saved(page);
    const { sheet } = await serverSheet(t);
    assert.deepEqual(sheet.skills, {});
    assert.equal(sheet.overrides.jack_of_all_trades, true);
  });
});

test('sheet: classes, attacks, coins, hit points, death saves and spell slots used', async () => {
  await withPage(sheetPage(), async (page, t) => {
    page.click('[data-tab=sheet]');
    page.type(byLabel(page, 'Class'), 'Ranger');
    page.type(byLabel(page, 'Level'), '4');
    page.click(page.$$('#sheet .add-row').find((b) => b.textContent.includes('Add a class')));
    page.type(page.$$('#sheet [aria-label="Class"]')[1], 'Wizard');
    page.type(page.$$('#sheet [aria-label="Level"]')[1], '3');
    assert.equal(page.text('#sheet .summary'), 'Ranger 4 / Wizard 3 · Level 7');
    // The PHB's multiclass example: 4 / 3 / 2 slots.
    assert.deepEqual([1, 2, 3].map((n) => byLabel(page, `${['', '1st', '2nd', '3rd'][n]} level slots`).value), ['4', '3', '2']);
    page.click(page.$$('#sheet [aria-label="Remove this class"]')[1]);
    assert.equal(page.text('#sheet .summary'), 'Ranger 4 · Level 4');

    page.click(page.$$('#sheet .add-row').find((b) => b.textContent.includes('Add an attack')));
    // A weapon that isn't in the inventory: no damage filled in, nothing to roll, and the sheet isn't saved until it's fixed.
    page.type(byLabel(page, 'Attack name'), 'Longbow');
    assert.equal(byLabel(page, 'Damage and type').value, '');
    assert.equal(byLabel(page, 'Roll this attack').disabled, true);
    assert.match(page.text('#sheet .atk-warn'), /You don't have a Longbow in your Inventory/);
    await page.waitFor(() => /Not saved: you don't have a Longbow in your Inventory/.test(page.text('#sheet-status')), { what: 'the save to be held' });
    assert.equal((await serverSheet(t)).version, 0);
    // Anything that isn't a weapon is fine (a spell, a feature, claws).
    page.type(byLabel(page, 'Attack name'), 'Hunter\'s volley');
    assert.equal(byLabel(page, 'Roll this attack').disabled, false);
    assert.equal(page.el('#sheet .atk-warn').hidden, true);
    page.type(byLabel(page, 'Attack bonus'), '+5');
    page.type(byLabel(page, 'Damage and type'), '1d8+3 piercing');
    page.type(byLabel(page, 'Gold pieces'), '37');
    page.type(byLabel(page, 'Current hit points'), '20');
    page.type(byLabel(page, 'Temporary hit points'), '5');
    page.type(byLabel(page, 'Temporary hit points'), ''); // nullable: cleared means none
    page.type(byLabel(page, 'Failures 2'), true);
    page.type(byLabel(page, 'Successes 1'), true);
    page.type(byLabel(page, '1st level slot used 2'), true);
    assert.equal(byLabel(page, 'Failures 1').checked, true, 'ticking the second ticks the first');
    page.type(byLabel(page, 'Failures 2'), false);

    await saved(page);
    const { sheet } = await serverSheet(t);
    assert.equal(sheet.classes.length, 1);
    assert.deepEqual(sheet.attacks, [{ name: "Hunter's volley", kind: 'attack', ability: 'str', proficient: true, magic: 0, bonus: '+5', save: '', dc: '', damage: '1d8+3 piercing', notes: '' }]);
    assert.equal(sheet.coins.gp, 37);
    assert.deepEqual(sheet.hp, { current: 20, temp: null });
    assert.deepEqual(sheet.death_saves, { successes: 1, failures: 1 });
    assert.equal(sheet.spellcasting.slots_used[1], 2);

    page.click(byLabel(page, 'Remove this attack'));
    assert.equal(page.$$('#sheet [aria-label="Attack name"]').length, 0);
  });
});

test('sheet: clicking a save, skill, ability or initiative rolls it (advantage from the sheet bar too); an attack offers its damage, doubled on a natural 20', async () => {
  const dice = [20, 6, 4, 11];
  mock.method(crypto, 'randomInt', (min) => dice.shift() ?? min);
  try {
    // Sam carries a shortsword (not equipped, so it isn't in Attacks by itself).
    const before = (t) => t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...emptySheet(), inventory: [{ name: 'Shortsword', kind: 'weapon', weapon: { damage: '1d6 piercing', ability: 'finesse' } }] }, version: 0 } });
    await withPage(sheetPage({ before }), async (page) => {
      page.click('[data-tab=sheet]');
      page.type(byLabel(page, 'Dexterity score'), '16');
      page.click(page.$$('#sheet .add-row').find((b) => b.textContent.includes('Add an attack')));
      // A weapon from the book they have fills in its damage and ability (finesse: Dex +3); to hit and damage are worked out.
      page.type(byLabel(page, 'Attack name'), 'Shortsword');
      assert.equal(byLabel(page, 'Damage and type').value, '1d6 piercing');
      assert.equal(byLabel(page, 'Ability added').value, 'finesse');
      assert.equal(byLabel(page, 'Attack bonus').placeholder, '+5');
      assert.equal(page.text('#sheet .atk-sum'), '1d20+5 to hit · 1d6+3 piercing');

      page.click(byLabel(page, 'Roll this attack'), { shiftKey: true });
      await page.settle();
      const rolls = () => page.requests.filter((r) => r.path.endsWith('/roll')).map(({ body: { label: _l, visibility: _v, ...b } }) => b);
      assert.deepEqual(rolls().at(-1), { notation: '1d20+5', mode: 'advantage' });
      assert.deepEqual(page.requests.filter((r) => r.path.endsWith('/roll')).at(-1).body, { notation: '1d20+5', mode: 'advantage', label: 'Shortsword: to hit', visibility: 'party' });
      assert.equal(page.text('#dice-result .dr-label'), 'Shortsword: to hit');
      const buttons = page.$$('#dice-result .dr-actions button').map((b) => b.textContent);
      assert.deepEqual(buttons, ['Damage (1d6+3)', 'Critical damage (2d6+3)']);
      page.click(page.$$('#dice-result .dr-actions button')[1]);
      await page.settle();
      assert.deepEqual(rolls().at(-1), { notation: '2d6+3', mode: 'normal' });
      assert.equal(page.text('#dice-result .dr-label'), 'Shortsword: damage (critical)');

      // Damage on its own, with a +1 weapon.
      page.type(byLabel(page, 'Magic bonus'), '1');
      page.click(byLabel(page, 'Roll damage'));
      await page.settle();
      assert.deepEqual(rolls().at(-1), { notation: '1d6+4', mode: 'normal' });
      assert.equal(page.text('#dice-result .dr-label'), 'Shortsword: damage');
      page.type(byLabel(page, 'Magic bonus'), '0');

      const dexSave = page.$$('#sheet .saves .roll-name').find((b) => b.textContent === 'Dexterity');
      page.click(dexSave, { altKey: true });
      await page.settle();
      assert.deepEqual(rolls().at(-1), { notation: '1d20+3', mode: 'disadvantage' });

      page.click(page.$$('#sheet .roll-name').find((b) => b.textContent.startsWith('Stealth')));
      await page.settle();
      assert.equal(rolls().at(-1).notation, '1d20+3');
      assert.equal(page.text('#dice-result .dr-label'), 'Stealth');

      page.click('#sheet .ds-roll');
      await page.settle();
      assert.equal(rolls().at(-1).notation, '1d20');
      assert.equal(page.text('#dice-result .dr-label'), 'Death save');

      // On a phone there's no Shift or Alt: the sheet's own Next d20 buttons (kept in step with the tray's).
      const modeButton = (where, mode) => page.$(`${where} .dice-modes [data-mode=${mode}]`);
      page.click(modeButton('.sheet-bar', 'advantage'));
      assert.equal(modeButton('#dice-panel', 'advantage').getAttribute('aria-pressed'), 'true');
      // Initiative also goes into a fight waiting for the character (none here).
      page.click(page.$$('#sheet .roll-name').find((b) => b.textContent === 'Initiative'));
      await page.settle();
      assert.deepEqual(page.requests.filter((r) => r.path.endsWith('/roll')).at(-1).body, { notation: '1d20+3', mode: 'advantage', label: 'Initiative', visibility: 'party', initiative: true });
      assert.equal(modeButton('.sheet-bar', 'normal').getAttribute('aria-pressed'), 'true', 'back to normal after one d20');
    });
  } finally {
    mock.restoreAll();
  }
});

test('sheet: an attack that is a saving throw rolls damage only, with its DC; a Strength attack with Strength 8', async () => {
  await withPage(sheetPage(), async (page) => {
    page.click('[data-tab=sheet]');
    page.type(byLabel(page, 'Constitution score'), '14');
    page.click(page.$$('#sheet .add-row').find((b) => b.textContent.includes('Add an attack')));
    page.type(byLabel(page, 'Attack name'), 'Fire breath');
    page.type(byLabel(page, 'Damage and type'), '2d6 fire');
    page.type(byLabel(page, 'Attack or save'), 'save');
    page.type(byLabel(page, 'Ability added'), 'con');
    page.type(byLabel(page, 'Saving throw ability'), 'dex');
    assert.equal(page.$('#sheet [aria-label="Roll this attack"]'), null, 'no roll to hit');
    assert.equal(byLabel(page, 'Save DC').placeholder, 'DC 12'); // 8 + 2 + 2
    page.click(byLabel(page, 'Roll damage'));
    await page.settle();
    const last = () => page.requests.filter((r) => r.path.endsWith('/roll')).at(-1).body;
    assert.equal(last().notation, '2d6');
    assert.equal(last().label, 'Fire breath: damage (DC 12 Dex save)');

    page.click(page.$$('#sheet .add-row').find((b) => b.textContent.includes('Add an attack')));
    page.type(page.$$('#sheet [aria-label="Attack name"]')[1], 'Rock');
    page.type(page.$$('#sheet [aria-label="Damage and type"]')[1], '1d4 bludgeoning');
    page.type(byLabel(page, 'Strength score'), '8');
    page.click(page.$$('#sheet [aria-label="Roll this attack"]')[0]); // the breath has none
    await page.settle();
    assert.equal(last().notation, '1d20+1'); // proficient (+2), Strength 8 (−1)
    assert.match(page.text('#dice-result .dr-actions'), /Damage \(1d4-1\)/);
  });
});

test('sheet: spells roll to hit with the spell attack bonus, or show their DC, and roll damage cast higher or healing with the modifier', async () => {
  await withPage(sheetPage(), async (page) => {
    page.click('[data-tab=sheet]');
    page.type(byLabel(page, 'Intelligence score'), '18');
    page.type(byLabel(page, 'Class'), 'Wizard');
    page.type(byLabel(page, 'Level'), '5');
    const add = async (name) => {
      page.type('#sheet .add-spell input', name);
      page.submit('#sheet .add-spell');
      // Looked up (from the SRD) and drawn again.
      return page.waitFor(() => page.$$('#sheet .spell').find((c) => c.querySelector('strong').textContent === name && c.querySelector('.source-srd')), { what: name });
    };
    const last = () => page.requests.filter((r) => r.path.endsWith('/roll')).at(-1).body;

    // Fireball (SRD): a Dex save against the spell DC; 8d6, more with a higher slot.
    let card = await add('Fireball');
    assert.equal(page.text(card.querySelector('.spell-dc')), 'DC 15 Dex');
    page.type(card.querySelector('[aria-label="Fireball slot level"]'), '5');
    page.click(card.querySelector('[aria-label="Roll Fireball damage"]'));
    await page.settle();
    assert.equal(last().notation, '10d6');
    assert.equal(last().label, 'Fireball: damage at 5th level (DC 15 Dex save)');

    // Fire Bolt: a spell attack (+7), damage offered after; at 5th level it's 2d10.
    card = await add('Fire Bolt');
    page.click(card.querySelector('[aria-label="Roll Fire Bolt to hit"]'));
    await page.settle();
    assert.equal(last().notation, '1d20+7');
    assert.equal(page.$$('#dice-result .dr-actions button')[0].textContent, 'Damage (2d10)');

    // Cure Wounds heals 1d8 + Int; the details show how it rolls, and can be changed.
    card = await add('Cure Wounds');
    page.click(card.querySelector('[aria-label="Roll Cure Wounds healing"]'));
    await page.settle();
    assert.equal(last().notation, '1d8+4');
    card.open = true;
    card.dispatchEvent(new page.window.Event('toggle'));
    assert.equal(card.querySelector('[aria-label="Spell damage"]').value, '1d8 healing');
    assert.equal(card.querySelector('[aria-label="Add spellcasting modifier"]').checked, true);
    page.type(card.querySelector('[aria-label="Add spellcasting modifier"]'), false);
    page.click(card.querySelector('[aria-label="Roll Cure Wounds healing"]'));
    await page.settle();
    assert.equal(last().notation, '1d8');

    // Shield has nothing to roll: its row has the slot list and Cast.
    card = await add('Shield');
    assert.ok(card.querySelector('[aria-label="Cast Shield"]'));
    assert.equal(card.querySelector('[aria-label="Roll Shield damage"]'), null);
  });
});

test('regression: casting a spell from the sheet spends a spell slot (Cast, the to-hit roll or the damage roll), and with none left it asks before rolling', async () => {
  await withPage(sheetPage(), async (page, t) => {
    page.click('[data-tab=sheet]');
    page.type(byLabel(page, 'Intelligence score'), '18');
    page.type(byLabel(page, 'Class'), 'Wizard');
    page.type(byLabel(page, 'Level'), '3');
    const add = async (name) => {
      page.type('#sheet .add-spell input', name);
      page.submit('#sheet .add-spell');
      return page.waitFor(() => page.$$('#sheet .spell').find((c) => c.querySelector('strong').textContent === name && c.querySelector('.source-srd')), { what: name });
    };
    const card = (name) => page.$$('#sheet .spell').find((c) => c.querySelector('strong').textContent === name);
    const used = () => page.$$('#sheet .slot .pips').map((p) => [...p.querySelectorAll('input')].filter((b) => b.checked).length);
    const saved = async () => (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token })).json().sheet.spellcasting.slots_used;
    const rolls = () => page.requests.filter((r) => r.path.endsWith('/roll'));

    // Wizard 3: four 1st-level slots, two 2nd. Shield (nothing to roll) has Cast.
    await add('Shield');
    assert.equal(page.text(card('Shield').querySelector('[aria-label="Shield slot level"] option')), '1st (4 left)');
    page.click(card('Shield').querySelector('[aria-label="Cast Shield"]'));
    await page.settle();
    assert.deepEqual(used().slice(0, 2), [1, 0]);
    assert.equal((await saved())[1], 1);

    // Magic Missile (no attack roll: damage) spends one when its damage is rolled, here a 2nd-level slot.
    await add('Magic Missile');
    page.type(card('Magic Missile').querySelector('[aria-label="Magic Missile slot level"]'), '2');
    page.click(card('Magic Missile').querySelector('[aria-label="Roll Magic Missile damage"]'));
    await page.settle();
    assert.deepEqual(used().slice(0, 2), [1, 1]);
    assert.equal((await saved())[2], 1);
    assert.match(card('Magic Missile').querySelector('[aria-label="Magic Missile slot level"]').selectedOptions[0].textContent, /2nd \(1 left\)/);

    // A cantrip spends nothing.
    await add('Fire Bolt');
    page.click(card('Fire Bolt').querySelector('[aria-label="Roll Fire Bolt to hit"]'));
    await page.settle();
    assert.deepEqual(used().slice(0, 2), [1, 1]);

    // None left at the level picked: the player is asked (the list stays on 1st); saying no rolls nothing.
    page.type(byLabel(page, '1st level slot used 4'), true);
    page.answers.confirm = false;
    const before = rolls().length;
    page.click(card('Shield').querySelector('[aria-label="Cast Shield"]'));
    await page.settle();
    assert.match(page.dialogs.at(-1).message, /No 1st-level spell slots left/);
    assert.equal(rolls().length, before);
  });
});

test('sheet: Wild Shape shows only for druids (a row of Class features); forms are looked up, turned into (a use spent), rolled from, hurt until they change back', async () => {
  const dice = [15, 3, 2];
  mock.method(crypto, 'randomInt', (min) => dice.shift() ?? min);
  try {
    const before = (t) => t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...emptySheet({ name: 'Fern' }), classes: [{ name: 'Wizard', subclass: '', level: 2 }], abilities: { str: 8, dex: 14, con: 10, int: 12, wis: 16, cha: 10 }, hp: { current: 12, temp: null } }, version: 0 } });
    await withPage(sheetPage({ before }), async (page, t) => {
      page.click('[data-tab=sheet]');
      assert.equal(page.$$('#sheet .wild-shape, #sheet [data-feature="wild_shape"]').length, 0, 'not a druid: no Wild Shape');
      page.type(byLabel(page, 'Class'), 'Druid');
      assert.ok(page.el('#sheet [data-feature="wild_shape"] .wild-shape'), 'the forms sit under the Wild Shape row of Class features');
      const usesLeft = () => page.$$('#sheet [data-feature="wild_shape"] .pips input').filter((b) => !b.checked).length;
      assert.match(page.text('#sheet .ws-rules'), /Druid 2, 2014 rules\. Up to challenge 1\/4, no flying or swimming speed, for up to 1 hour/);
      assert.equal(usesLeft(), 2);
      assert.doesNotMatch(page.text('#sheet .wild-shape'), /null|undefined/);

      await page.waitFor(() => page.$$('#dl-forms option').length, { what: 'form suggestions' });
      assert.ok(page.$$('#dl-forms option').some((o) => o.value === 'Wolf'));
      for (const name of ['Wolf', 'Giant Eagle']) {
        page.type(byLabel(page, 'Form to add'), name);
        page.submit('#sheet .ws-add');
        await page.waitFor(() => page.$$('#sheet .ws-form-name').some((n) => n.textContent === name), { what: `${name} on the sheet` });
      }
      const formRow = (name) => page.$$('#sheet .ws-form').find((f) => f.querySelector('.ws-form-name').textContent === name);
      const turnInto = (name) => [...formRow(name).querySelectorAll('button')].find((b) => /Turn into|Now/.test(b.textContent));
      assert.ok(turnInto('Giant Eagle').disabled, 'too big and it flies');
      assert.match(page.text(formRow('Giant Eagle')), /Not yet: Challenge 1 is over your limit/);

      page.click(turnInto('Wolf'));
      assert.match(page.text('#sheet .ws-banner'), /Wild Shape: Wolf, 11 of 11 hit points/);
      assert.equal(usesLeft(), 1);
      assert.match(page.text('#sheet .ws-active h4'), /as a Wolf/);
      // The wolf's Strength (12) and Dexterity (15) with Fern's Wisdom (16, proficient save).
      const scoreRolls = page.$$('#sheet .ws-score');
      assert.equal(page.text(scoreRolls[1].querySelector('.ws-mod')), '+2');
      assert.equal(page.text(scoreRolls[4].querySelector('.ws-save')), 'Save +5');

      page.click(byLabel(page, 'Roll Bite to hit'));
      await page.settle();
      const last = () => page.requests.filter((r) => r.path.endsWith('/roll')).at(-1).body;
      assert.deepEqual([last().notation, last().label], ['1d20+4', 'Wolf: Bite: to hit']);
      page.click(byLabel(page, 'Roll Bite damage'));
      await page.settle();
      assert.equal(last().notation, '2d4+2');

      // 15 damage on the wolf: it drops and Fern takes the other 4.
      page.type(byLabel(page, 'Wolf hit points'), '-4');
      assert.match(page.dialogs.at(-1).message, /Wolf dropped to 0 hit points: you change back and take the other 4 damage yourself/);
      assert.ok(page.el('#sheet .ws-banner').hidden);
      assert.equal(byLabel(page, 'Current hit points').value, '8');
      await saved(page);
      const { sheet } = await serverSheet(t);
      assert.equal(sheet.wild_shape.active, null);
      assert.equal(sheet.class_features.spent.wild_shape, 1);
      assert.equal(sheet.hp.current, 8);
      assert.deepEqual(sheet.wild_shape.forms.map((f) => f.name), ['Wolf', 'Giant Eagle']);
    });
  } finally {
    mock.restoreAll();
  }
});

test('sheet: Class features shows this class\'s uses, ticks them, takes a typed maximum and your own rows; Second Wind is rolled by the server', async () => {
  const before = (t) => t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...emptySheet({ name: 'Brakka' }), classes: [{ name: 'Fighter', subclass: '', level: 2 }], abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 }, hp: { current: 5, temp: null } }, version: 0 } });
  await withPage(sheetPage({ before }), async (page, t) => {
    page.click('[data-tab=sheet]');
    const row = (id) => page.el(`#sheet [data-feature="${id}"]`);
    assert.deepEqual(page.$$('#sheet .cf-row').map((r) => r.dataset.feature), ['second_wind', 'action_surge']);
    assert.match(page.text(row('second_wind')), /regain 1d10 \+ 2 hit points/);

    // Tick Action Surge; type over its maximum (the DM allows two).
    page.click(byLabel(page, 'Action Surge use 1 spent'));
    page.type(byLabel(page, 'Action Surge maximum'), '2');
    assert.equal(page.$$('#sheet [data-feature="action_surge"] .pips input').length, 2);
    assert.ok(byLabel(page, "Action Surge: back to the rules' maximum"));

    // A row of your own.
    page.click(page.el('#sheet .cf-add-open'));
    page.type(byLabel(page, 'Name'), 'Lucky');
    page.type(byLabel(page, 'How many'), '3');
    page.submit('#sheet .cf-add');
    assert.match(page.text('#sheet .class-features'), /Lucky/);
    await saved(page);
    let { sheet } = await serverSheet(t);
    assert.deepEqual([sheet.class_features.spent.action_surge, sheet.class_features.max.action_surge], [1, 2]);
    assert.deepEqual(sheet.class_features.custom.map((c) => [c.name, c.max, c.recharge]), [['Lucky', 3, 'long']]);

    // Second Wind: the server rolls it and the hit points go up.
    page.click([...row('second_wind').querySelectorAll('button')].find((b) => /^Use/.test(b.textContent)));
    await page.waitFor(() => page.requests.some((r) => r.path.endsWith('/sheet/features/use')), { what: 'Second Wind used' });
    await page.settle();
    ({ sheet } = await serverSheet(t));
    assert.equal(sheet.class_features.spent.second_wind, 1);
    assert.ok(sheet.hp.current > 5);
    await page.waitFor(() => page.$$('#sheet [data-feature="second_wind"] .pips input:checked').length === 1, { what: 'the use ticked' });
  });
});

test('sheet: Subclass features sit under their own heading; the subclass box suggests the book\'s subclasses; one from another book says to add rows by hand', async () => {
  const before = (t) => t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...emptySheet({ name: 'Brakka' }), classes: [{ name: 'Fighter', subclass: 'Battle Master', level: 3 }, { name: 'Cleric', subclass: 'Arcana', level: 1 }], abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } }, version: 0 } });
  await withPage(sheetPage({ before }), async (page, t) => {
    page.click('[data-tab=sheet]');
    const section = page.el('#sheet .cf-subclass');
    assert.match(page.text(section.querySelector('h4')), /Subclass features \(Battle Master\)/);
    assert.deepEqual([...section.querySelectorAll('.cf-row')].map((r) => r.dataset.feature), ['superiority_dice']);
    assert.equal(section.querySelectorAll('[data-feature="superiority_dice"] .pips input').length, 4);
    assert.match(page.text(section.querySelector('.cf-unknown')), /Arcana: not in the list yet/);
    const sub = byLabel(page, 'Subclass');
    assert.equal(sub.getAttribute('list'), 'dl-subclasses-fighter');
    assert.ok([...page.el('#dl-subclasses-fighter').options].some((o) => o.value === 'Battle Master'));
    // Ticking a die saves like any class feature.
    page.click(byLabel(page, 'Superiority Dice use 1 spent'));
    await saved(page);
    const { sheet } = await serverSheet(t);
    assert.equal(sheet.class_features.spent.superiority_dice, 1);
  });
});

test('sheet: Race features sit under their own heading, with racial feats named in Features & traits; a race the list doesn\'t know says to add rows by hand', async () => {
  const before = (t) => t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...emptySheet({ name: 'Grusk' }), race: 'Half-Orc', features: 'Feats: Orcish Fury, Elven Accuracy', classes: [{ name: 'Fighter', subclass: 'Cavalier', level: 3 }], abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } }, version: 0 } });
  await withPage(sheetPage({ before }), async (page, t) => {
    page.click('[data-tab=sheet]');
    assert.ok([...page.el('#sheet .cf-subclass:not(.cf-race)').querySelectorAll('.cf-row')].some((r) => r.dataset.feature === 'unwavering_mark'), 'a Xanathar\'s subclass');
    const section = page.el('#sheet .cf-race');
    assert.match(page.text(section.querySelector('h4')), /Race features \(Half-Orc\)/);
    assert.deepEqual([...section.querySelectorAll('.cf-row')].map((r) => r.dataset.feature), ['relentless_endurance', 'feat_orcish_fury'], 'Elven Accuracy isn\'t a half-orc feat');
    assert.ok([...page.el('#dl-races').options].some((o) => o.value === 'Tabaxi'));
    page.click(byLabel(page, 'Relentless Endurance use 1 spent'));
    await saved(page);
    assert.equal((await serverSheet(t)).sheet.class_features.spent.relentless_endurance, 1);
    page.type(byLabel(page, 'Race'), 'Kobold');
    await page.waitFor(() => page.el('#sheet .cf-race .cf-unknown'));
    assert.match(page.text(page.el('#sheet .cf-race .cf-unknown')), /Kobold: not in the list yet/);
  });
});

test('sheet: changed elsewhere meanwhile: keep mine (OK) or load the other version (Cancel)', async () => {
  await withPage(sheetPage(), async (page, t) => {
    page.click('[data-tab=sheet]');
    page.type(byLabel(page, 'Character name'), 'Thorin');
    await saved(page);
    const other = async (name) => {
      const { sheet, version } = await serverSheet(t);
      const res = await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...sheet, name }, version } });
      assert.equal(res.statusCode, 200);
    };

    await other('Thorin from the phone');
    page.answers.confirm = [true];
    page.type(byLabel(page, 'Character name'), 'Thorin from the laptop');
    await page.waitFor(() => page.dialogs.length === 1);
    await saved(page);
    assert.match(page.dialogs[0].message, /changed in another tab/);
    assert.equal((await serverSheet(t)).sheet.name, 'Thorin from the laptop');

    await other('Thorin again from the phone');
    page.answers.confirm = [false];
    page.type(byLabel(page, 'Character name'), 'Lost change');
    await page.waitFor(() => page.dialogs.length === 2);
    await page.settle();
    assert.equal(byLabel(page, 'Character name').value, 'Thorin again from the phone');
    assert.equal((await serverSheet(t)).sheet.name, 'Thorin again from the phone');
  });
});

test('sheet: spells are looked up when added, grouped by level, can be edited, prepared and removed', async () => {
  const llm = createFakeLLM({ structured: async () => ({ found: false, name: '', level: null, school: '', casting_time: '', range: '', components: '', material: '', duration: '', concentration: false, ritual: false, description: '', higher_levels: '' }) });
  await withPage(sheetPage({ setup: { llm } }), async (page, t) => {
    page.click('[data-tab=sheet]');
    assert.match(page.text('#sheet .spell-list'), /No spells yet/);

    // Suggestions while typing.
    page.type('#sheet .add-spell input', 'fire');
    await page.waitFor(() => page.$$('#dl-spells option').length, { what: 'spell suggestions' });
    assert.ok(page.$$('#dl-spells option').some((o) => o.value === 'Fireball'));

    page.type('#sheet .add-spell input', 'fireball');
    page.submit('#sheet .add-spell');
    await page.settle();
    const card = await page.waitFor(() => page.$$('#sheet .spell').find((c) => c.querySelector('strong').textContent === 'Fireball'));
    assert.equal(page.text(card.closest('.spell-group').querySelector('h4')), '3rd level · 0 prepared');
    assert.equal(page.text(card.querySelector('.source')), 'SRD');
    assert.match(page.text(card.querySelector('.spell-meta')), /1 action · 150 feet/);

    // A spell nobody knows: kept, with a note to fill it in by hand.
    page.type('#sheet .add-spell input', 'Zorblax\'s Whimsy');
    page.submit('#sheet .add-spell');
    await page.settle();
    assert.match(page.text('#sheet .add-spell-wrap'), /Couldn't find details for Zorblax's Whimsy/);
    assert.equal(page.text(page.$$('#sheet .spell-group h4').at(-1)), 'Level not set');
    assert.match(page.text('#sheet .add-spell-wrap .fill-missing'), /Fill in missing details \(1\)/);

    // Open the unknown one, set its level and description.
    const whimsy = page.$$('#sheet .spell').find((c) => c.textContent.includes('Zorblax'));
    whimsy.open = true;
    whimsy.dispatchEvent(new page.window.Event('toggle'));
    page.type(whimsy.querySelector('[aria-label="Spell level"]'), '1');
    page.type(whimsy.querySelector('[aria-label="Description"]'), 'It is whimsical.');
    assert.equal(page.text(page.$$('#sheet .spell-group h4')[0]), '1st level · 0 prepared');

    // Prepare Fireball.
    const fireball = page.$$('#sheet .spell').find((c) => c.textContent.includes('Fireball'));
    page.type(fireball.querySelector('[aria-label="Fireball prepared"]'), true);

    await saved(page);
    const { sheet } = await serverSheet(t);
    assert.deepEqual(sheet.spells.map((s) => [s.name, s.level, s.prepared, s.source]), [['Fireball', 3, true, 'srd'], ["Zorblax's Whimsy", 1, false, 'manual']]);

    // Remove it (after confirming).
    fireball.open = true;
    fireball.dispatchEvent(new page.window.Event('toggle'));
    page.answers.confirm = [false, true];
    const remove = () => page.click([...fireball.querySelectorAll('button')].find((b) => b.textContent === 'Remove spell'));
    remove();
    assert.ok(page.$$('#sheet .spell').some((c) => c.textContent.includes('Fireball')));
    remove();
    assert.ok(!page.$$('#sheet .spell').some((c) => c.textContent.includes('Fireball')));
  });
});

test('sheet: a spell of your own is added without a lookup, opened to fill in, and never counted as missing details', async () => {
  const llm = createFakeLLM({ structured: async () => assert.fail('a custom spell is never looked up') });
  await withPage(sheetPage({ setup: { llm } }), async (page, t) => {
    page.click('[data-tab=sheet]');
    const make = () => page.click(page.$$('#sheet .add-spell button').find((b) => b.textContent === 'Make my own'));
    make();
    assert.match(page.text('#sheet .add-spell-wrap'), /Type the name of your spell first/);
    assert.match(page.text('#sheet .spell-list'), /No spells yet/);

    // Even a name the SRD knows: the player's own version, not looked up.
    page.type('#sheet .add-spell input', 'Fireball');
    make();
    const card = page.$$('#sheet .spell').find((c) => c.querySelector('strong').textContent === 'Fireball');
    assert.ok(card.open, 'opened to fill in');
    assert.equal(page.text(card.querySelector('.source')), 'Your own');
    assert.equal(page.el('#sheet .add-spell input').value, '');
    assert.equal(page.$('#sheet .add-spell-wrap .fill-missing').hidden, true, 'not a spell waiting for a lookup');
    page.type(card.querySelector('[aria-label="Spell level"]'), '2');
    page.type(card.querySelector('[aria-label="Description"]'), 'A small, cold fireball. Each creature in a 10-foot sphere makes a Dexterity saving throw, taking 3d6 cold damage.');
    page.type(card.querySelector('[aria-label="Spell damage"]'), '3d6 cold');

    await saved(page);
    const { sheet } = await serverSheet(t);
    assert.deepEqual(sheet.spells.map((s) => [s.name, s.level, s.source, s.damage, s.description.slice(0, 7)]), [['Fireball', 2, 'custom', '3d6 cold', 'A small']]);
    assert.equal(page.requests.filter((r) => r.path.includes('/spells/lookup')).length, 0);
  });
});

test('attacks: a typed weapon attack offers to put the weapon in the Inventory, where it attacks from', async () => {
  await withPage(sheetPage(), async (page, t) => {
    page.click('[data-tab=sheet]');
    page.type(byLabel(page, 'Class'), 'Fighter');
    page.click(page.$$('#sheet .add-row').find((b) => b.textContent.includes('Add an attack')));
    page.type(byLabel(page, 'Attack name'), 'Greataxe');
    page.type(byLabel(page, 'Magic bonus'), '1');
    // Suggested names: an unarmed strike and what's in the inventory (nothing yet).
    assert.deepEqual(page.$$('#dl-attacks option').map((o) => o.value), ['Unarmed strike']);
    page.click(page.$$('#sheet .atk-warn button').find((b) => b.textContent === 'Add a +1 Greataxe to my Inventory'));
    assert.equal(page.$$('#sheet [aria-label="Attack name"]').length, 0, 'the typed row is gone');
    assert.match(page.text('#sheet .gear-attack'), /\+1 Greataxe/);
    assert.deepEqual(page.$$('#dl-attacks option').map((o) => o.value), ['Unarmed strike', '+1 Greataxe']);

    // Now a typed Greataxe attack is fine (it's in the inventory); an unarmed strike fills itself in.
    page.click(page.$$('#sheet .add-row').find((b) => b.textContent.includes('Add an attack')));
    page.type(byLabel(page, 'Attack name'), 'Unarmed strike');
    assert.equal(byLabel(page, 'Damage and type').value, '1 bludgeoning');
    await saved(page);
    const { sheet } = await serverSheet(t);
    assert.deepEqual(sheet.inventory.map((g) => [g.name, g.kind, g.equipped, g.magic, g.proficient, g.weapon?.damage]), [['+1 Greataxe', 'weapon', 1, 1, true, '1d12 slashing']]);
    assert.deepEqual(sheet.attacks.map((a) => a.name), ['Unarmed strike']);
  });
});

test('inventory: shown sorted by kind under headings, whatever order things were added in', async () => {
  const before = (t) => t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { version: 0, sheet: { ...emptySheet(), inventory: [
    { name: 'Rope', kind: 'gear' },
    { name: 'Potion of Healing', kind: 'potion', qty: 3 },
    { name: 'Shield', kind: 'armor', armor: { base: 2, type: 'shield' } },
    { name: 'Longsword', kind: 'weapon', weapon: { damage: '1d8 slashing' } },
    { name: 'Bag of Holding', kind: 'magic' },
    { name: 'Dagger', kind: 'weapon', qty: 2, weapon: { damage: '1d4 piercing', ability: 'finesse' } },
  ] } } });
  await withPage(sheetPage({ before }), async (page, t) => {
    page.click('[data-tab=inventory]');
    const groups = page.$$('#inventory .gear-group').map((g) => [page.text(g.querySelector('h4')), [...g.querySelectorAll('.gear-title')].map((e) => e.textContent)]);
    assert.deepEqual(groups, [
      ['Weapons · 3', ['Dagger', 'Longsword']],
      ['Armour and shields · 1', ['Shield']],
      ['Magic items · 1', ['Bag of Holding']],
      ['Potions · 3', ['Potion of Healing']],
      ['Adventuring gear · 1', ['Rope']],
    ]);
    // Changing a line's kind moves it; the saved order stays as it was.
    const rope = page.$$('#inventory .gear-row').find((r) => r.querySelector('.gear-title').textContent === 'Rope');
    const details = rope.querySelector('details');
    details.open = true;
    details.dispatchEvent(new page.window.Event('toggle'));
    page.type(page.el('#inventory [aria-label="Kind: Rope"]'), 'tool');
    assert.equal(page.text(page.$$('#inventory .gear-group').at(-1).querySelector('h4')), 'Tools · 1');
    await saved(page);
    assert.deepEqual((await serverSheet(t)).sheet.inventory.map((g) => g.name), ['Rope', 'Potion of Healing', 'Shield', 'Longsword', 'Bag of Holding', 'Dagger']);
  });
});

test('sheet: the point buy calculator is off until turned on, follows the scores as they are typed, and its buttons and bonuses change them', async () => {
  await withPage(sheetPage(), async (page, t) => {
    page.click('[data-tab=sheet]');
    const pb = () => page.$('#point-buy');
    assert.ok(pb().hidden);
    assert.equal(page.el('#sheet .pb-toggle').getAttribute('aria-pressed'), 'false');
    page.click('#sheet .pb-toggle');
    assert.ok(!pb().hidden);
    assert.equal(page.text('#point-buy .pb-points'), '12 of 27 points spent, 15 left.');

    // Typed scores: a High Elf (2014, the campaign's rules) with 15 Dex has bought 13.
    page.type(byLabel(page, 'Race'), 'High Elf');
    page.type(byLabel(page, 'Strength score'), '15');
    page.type(byLabel(page, 'Dexterity score'), '15');
    assert.equal(page.el('#point-buy [aria-label="Dexterity before bonuses"]').value, '13');
    assert.equal(page.text(page.el('#point-buy [aria-label="Dexterity before bonuses"]').closest('tr').querySelector('.pb-fixed')), '+2');
    assert.equal(page.text('#point-buy .pb-points'), '21 of 27 points spent, 6 left.');
    assert.ok(page.el('#point-buy [aria-label="Intelligence bonus you choose"]').hidden); // a High Elf's bonuses are fixed

    // The buttons change the sheet's scores; + stops when the points run out.
    page.click('#point-buy [aria-label="One more Constitution"]');
    assert.equal(byLabel(page, 'Constitution score').value, '11');
    assert.equal(byLabel(page, 'Constitution modifier').value, '+0');
    page.click('#point-buy [aria-label="One less Wisdom"]');
    page.click('#point-buy [aria-label="One less Wisdom"]');
    assert.equal(byLabel(page, 'Wisdom score').value, '8');
    assert.ok(page.el('#point-buy [aria-label="One less Wisdom"]').disabled);

    // 2024: the race's bonuses come off, and the player chooses where the background's go.
    page.type('#point-buy [aria-label="Point buy rules"]', '2024');
    assert.equal(byLabel(page, 'Dexterity score').value, '13');
    assert.equal(byLabel(page, 'Intelligence score').value, '9'); // the High Elf's +1 came off: 9 was bought
    assert.match(page.text('#point-buy .pb-problems'), /raises one ability by 2 and another by 1/);
    page.type('#point-buy [aria-label="Strength bonus you choose"]', '2');
    page.type('#point-buy [aria-label="Dexterity bonus you choose"]', '1');
    assert.equal(byLabel(page, 'Strength score').value, '17');
    assert.equal(byLabel(page, 'Dexterity score').value, '14');
    assert.ok(page.$('#point-buy .pb-problems').hidden);

    await saved(page);
    const { sheet } = await serverSheet(t);
    assert.deepEqual(sheet.point_buy, { on: true, rules: '2024', choice: { 2014: {}, 2024: { str: 2, dex: 1 } } });
    assert.equal(sheet.abilities.str, 17);

    page.click('#sheet .pb-toggle');
    assert.ok(pb().hidden);
  });
});

test('sheet: the layouts chosen under Look draw the same sheet; the Tabs layout remembers its tab', async () => {
  await withPage(sheetPage(), async (page) => {
    page.click('[data-tab=sheet]');
    page.type(byLabel(page, 'Character name'), 'Lyra');
    for (const layout of ['combat', 'abilities', 'tabs', 'single', 'classic']) {
      page.$('#tab-sheet').dataset.sheetLayout = layout;
      await page.waitFor(() => page.$(`#sheet .row-${layout === 'tabs' ? 'strip' : layout === 'abilities' ? 'abilities' : layout}`), { what: `the ${layout} layout` });
      assert.equal(byLabel(page, 'Character name').value, 'Lyra', layout);
      assert.equal(page.$$('#sheet [aria-label="Strength score"]').length, 1, layout);
      assert.equal(page.$$('#sheet .pb-toggle').length, 1, layout);
      assert.ok(page.$('#sheet [aria-label="Armour class"]'), layout);
    }

    page.$('#tab-sheet').dataset.sheetLayout = 'tabs';
    await page.waitFor('#sheet .sh-tabbar');
    const selected = () => page.$('#sheet .sh-tabbar [aria-selected=true]').textContent;
    assert.equal(selected(), 'Actions');
    page.click(page.$$('#sheet .sh-tabbar button').find((b) => b.textContent === 'Spells'));
    assert.equal(selected(), 'Spells');
    assert.ok(!page.$('#sheet-tab-spells').hidden);
    assert.ok(page.$('#sheet-tab-actions').hidden);
    page.key('#sheet .sh-tabbar', 'ArrowRight');
    assert.equal(selected(), 'Inventory');
    page.key('#sheet .sh-tabbar', 'ArrowLeft');
    page.key('#sheet .sh-tabbar', 'ArrowLeft');
    page.key('#sheet .sh-tabbar', 'ArrowLeft');
    assert.equal(selected(), 'Background', 'wraps around');
    assert.equal(page.window.localStorage.getItem('dndapp.sheetTab'), 'background');
  });
});

test('sheet: uploading the app\'s own file loads it; uploading again asks first; download and print', async () => {
  await withPage(sheetPage(), async (page, t) => {
    page.click('[data-tab=sheet]');
    const mine = { ...emptySheet({ name: 'Thorin Oakenshield' }), classes: [{ name: 'Rogue', subclass: 'Thief', level: 3 }], overrides: { ac: 14 } };
    page.click('#sheet-upload'); // nothing saved yet: no question
    assert.equal(page.dialogs.length, 0);
    page.setFiles('#sheet-file', [{ name: 'thorin.json', type: 'application/json', content: JSON.stringify({ format: SHEET_FORMAT, sheet: mine }) }]);
    await page.waitFor(() => page.text('#sheet-status').startsWith('Loaded'));
    assert.equal(page.text('#sheet-status'), 'Loaded thorin.json. Check it over: 1 value from your sheet differ from the automatic ones and are marked ↺.');
    assert.equal(byLabel(page, 'Character name').value, 'Thorin Oakenshield');
    assert.ok(autoBox(page, 'Armour class').classList.contains('mine'));
    assert.equal((await serverSheet(t)).version, 1);

    // Now there's a saved sheet: replacing it asks first.
    page.answers.confirm = [false];
    page.click('#sheet-upload');
    assert.match(page.dialogs.at(-1).message, /replaces the one here/);

    page.setFiles('#sheet-file', [{ name: 'junk.bin', type: 'application/octet-stream', content: Buffer.from([0, 1, 2, 0xff]) }]);
    await page.waitFor(() => page.text('#sheet-status').startsWith("Couldn't read that sheet"));
    assert.ok(page.$('#sheet-status').classList.contains('error'));
    assert.equal(page.$('#sheet-upload').disabled, false);

    page.click('#sheet-download');
    await page.waitFor(() => page.downloads.length);
    assert.equal(page.downloads[0].name, 'Thorin Oakenshield.json');
    const file = JSON.parse(await page.downloads[0].text);
    assert.equal(file.format, SHEET_FORMAT);
    assert.equal(file.sheet.name, 'Thorin Oakenshield');

    page.click('#sheet-print');
    assert.equal(page.printed, 1);
  });
});

test('sheet: an upload the AI reads shows its notes', async () => {
  const llm = createFakeLLM({
    structured: async () => ({
      readable: true, name: 'Pip', player_name: '', race: 'Halfling', background: '', alignment: '', xp: '',
      classes: [{ name: 'Bard', subclass: '', level: 2 }],
      abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
      save_proficiencies: [], skills: [],
      printed: { proficiency_bonus: null, ac: null, initiative: null, speed: null, hp_max: null, passive_perception: null, hit_dice: null, saves: { str: null, dex: null, con: null, int: null, wis: null, cha: null }, spell_save_dc: null, spell_attack_bonus: null, spell_slots: [] },
      inspiration: false, hp_current: null, hp_temp: null, attacks: [], coins: { cp: null, sp: null, ep: null, gp: null, pp: null },
      text: Object.fromEntries(['equipment', 'proficiencies_languages', 'features', 'personality', 'ideals', 'bonds', 'flaws', 'age', 'height', 'weight', 'eyes', 'skin', 'hair', 'appearance', 'allies', 'backstory', 'treasure', 'additional_features'].map((k) => [k, null])),
      spellcasting_class: null, spells: [], notes: 'The XP box was smudged.',
    }),
  });
  await withPage(sheetPage({ setup: { llm } }), async (page) => {
    page.click('[data-tab=sheet]');
    const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(32)]);
    page.setFiles('#sheet-file', [{ name: 'photo.png', type: 'image/png', content: png }]);
    await page.waitFor(() => page.text('#sheet-status').startsWith('Loaded'));
    assert.equal(page.text('#sheet-status'), 'Loaded photo.png. Check it over.');
    assert.match(page.dialogs.at(-1).message, /The XP box was smudged/);
    assert.equal(page.text('#sheet .summary'), 'Halfling · Bard 2 · Level 2');
  });
});

test('sheet: "Fill in missing details" and "Look up details" ask the server again (replacing typed details only after asking)', async () => {
  let known = false;
  const booming = { found: true, name: 'Booming Blade', level: 0, school: 'evocation', casting_time: '1 action', range: 'Self (5-foot radius)', components: 'S, M', material: 'a melee weapon', duration: '1 round', concentration: false, ritual: false, description: 'You brandish the weapon used in the spell\'s casting.', higher_levels: '' };
  const llm = createFakeLLM({ structured: async () => (known ? booming : { ...booming, found: false }) });
  await withPage(sheetPage({ setup: { llm } }), async (page) => {
    page.click('[data-tab=sheet]');
    page.type('#sheet .add-spell input', 'Booming Blade');
    page.submit('#sheet .add-spell');
    await page.settle();
    assert.match(page.text('#sheet .add-spell-wrap'), /Couldn't find details for Booming Blade/);

    // Found the second time.
    known = true;
    page.click(page.$$('#sheet .add-spell-wrap button').find((b) => b.textContent.startsWith('Fill in missing details')));
    await page.waitFor(() => /Done\./.test(page.text('#sheet .add-spell-wrap')), { what: 'the lookups' });
    const card = () => page.$$('#sheet .spell').find((c) => c.textContent.includes('Booming Blade'));
    assert.equal(page.text(card().closest('.spell-group').querySelector('h4')), 'Cantrips');
    assert.equal(page.text(card().querySelector('.source')), 'AI memory');
    assert.ok(page.$('#sheet .add-spell-wrap .fill-missing').hidden, 'nothing left to fill in');

    // Look up again from the card: it has details now, so it asks first.
    card().open = true;
    card().dispatchEvent(new page.window.Event('toggle'));
    page.type(card().querySelector('[aria-label="Description"]'), 'My own words.');
    page.answers.confirm = [false, true];
    const lookUp = () => page.click([...card().querySelectorAll('button')].find((b) => b.textContent === 'Look up details'));
    lookUp();
    await page.settle();
    assert.equal(card().querySelector('[aria-label="Description"]').value, 'My own words.');
    lookUp();
    await page.settle();
    assert.match(page.dialogs.at(-1).message, /Replace the details of Booming Blade/);
    card().open = true;
    card().dispatchEvent(new page.window.Event('toggle'));
    assert.match(card().querySelector('[aria-label="Description"]').value, /You brandish/);
  });
});

test('inventory: items looked up and added, weapons equipped (two daggers), one armour at a time, proficiency from the class; equipped weapons attack from the sheet and armour sets AC', async () => {
  const dice = [15, 4];
  mock.method(crypto, 'randomInt', (min) => dice.shift() ?? min);
  try {
    await withPage(sheetPage(), async (page, t) => {
      page.click('[data-tab=sheet]');
      page.type(byLabel(page, 'Class'), 'Wizard');
      page.type(byLabel(page, 'Dexterity score'), '14');
      page.type(byLabel(page, 'Strength score'), '12');
      assert.equal(byLabel(page, 'Armour class').value, '12');

      page.click('[data-tab=inventory]');
      assert.match(page.text('#inventory'), /Nothing here yet/);
      const add = async (name) => {
        page.el('#gear-name').value = name;
        page.submit('#gear-add');
        // Its card shows first; Add puts it in the inventory.
        await page.waitFor(() => page.$('#gear-preview .gear-card'), { what: `${name}'s card` });
        page.click('#gear-preview .gear-card-actions .primary');
        await page.waitFor(() => /^Added|Couldn|know/.test(page.text('#gear-status')), { what: `${name} to be added` });
      };
      const row = (name) => page.$$('#inventory .gear-row').find((r) => r.querySelector('.gear-title').textContent === name);
      const inv = (label) => page.el(`#inventory [aria-label="${label}"]`);

      await add('Dagger');
      await add('Longsword');
      await add('Chain mail');
      await add('Leather armor');
      assert.deepEqual(page.$$('#inventory .gear-title').map((e) => e.textContent), ['Dagger', 'Longsword', 'Chain mail', 'Leather armor']);
      // A wizard: proficient with daggers, not longswords or armour (they can change it).
      assert.equal(inv('Proficient: Dagger').checked, true);
      assert.equal(inv('Proficient: Longsword').checked, false);
      assert.equal(inv('Proficient: Chain mail').checked, false);
      assert.match(row('Dagger').querySelector('.gear-sum').textContent, /^\+4 to hit · 1d4\+2 piercing/);

      // Two daggers: equip both.
      page.type(inv('How many: Dagger'), '2');
      page.type(inv('How many equipped: Dagger'), '2');
      page.click(inv('Equipped: Longsword'));
      page.click(inv('Proficient: Longsword'));

      // One suit of armour: putting on the second takes off the first. AC follows.
      page.click(inv('Equipped: Chain mail'));
      page.click(inv('Equipped: Leather armor'));
      assert.equal(inv('Equipped: Chain mail').checked, false);
      assert.equal(inv('Equipped: Leather armor').checked, true);
      assert.match(page.text('#gear-status'), /Took off Chain mail/);
      page.click('[data-tab=sheet]');
      assert.equal(byLabel(page, 'Armour class').value, '13');

      // Equipped weapons show in Attacks, worked out, with to hit and damage rolls (versatile: both hands too).
      const attacks = page.$$('#sheet .gear-attack');
      // Two daggers: an off-hand attack too, without the Dexterity modifier on its damage.
      assert.deepEqual(attacks.map((a) => a.querySelector('.gear-name').textContent), ['Dagger ×2', 'Longsword', 'Dagger (off-hand)']);
      assert.deepEqual(attacks.map((a) => a.querySelector('.gear-num').textContent), ['+4', '+3', '+4']);
      assert.deepEqual(attacks.map((a) => a.querySelector('.gear-dmg').textContent), ['1d4+2 piercing', '1d8+1 slashing', '1d4 piercing']);
      page.click(byLabel(page, 'Roll Longsword to hit'));
      await page.settle();
      const rolls = () => page.requests.filter((r) => r.path.endsWith('/roll')).map((r) => r.body);
      assert.deepEqual(rolls().at(-1), { notation: '1d20+3', mode: 'normal', label: 'Longsword: to hit', visibility: 'party' });
      page.click(byLabel(page, 'Roll Longsword damage with both hands'));
      await page.settle();
      assert.equal(rolls().at(-1).notation, '1d10+1');

      await saved(page);
      const { sheet } = await serverSheet(t);
      assert.deepEqual(sheet.inventory.map((g) => [g.name, g.qty, g.equipped, g.proficient]), [['Dagger', 2, 2, true], ['Longsword', 1, 1, true], ['Chain mail', 1, 0, false], ['Leather armor', 1, 1, false]]);

      // The DM sees what's equipped, and nothing else on the sheet.
      const dm = (await t.request('GET', `/campaigns/${t.campaign.id}/gear/equipped`)).json();
      assert.deepEqual(dm.players.find((p) => p.name === 'Sam').gear.map((g) => g.name), ['Dagger', 'Longsword', 'Leather armor']);
    });
  } finally {
    mock.restoreAll();
  }
});

test('inventory: the DM sees what each player has equipped in the Items tab, and refreshes it', async () => {
  const thorin = (inventory) => ({ ...emptySheet({ name: 'Thorin' }), inventory });
  await withPage({
    before: async (t) => {
      t.sheets.save(t.campaign.id, t.sam.id, thorin([{ name: 'Shield', kind: 'armor', equipped: 1, proficient: false, armor: { base: 2, type: 'shield' } }, { name: 'Rope', kind: 'gear' }]));
      return { dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana, storage: NO_3D }),
  }, async (page, t) => {
    await openWikiView(page, 'items');
    await page.waitFor(() => page.$$('#items-equipped .equipped-player').length === 2, { what: 'the players\u2019 gear' });
    const card = (name) => page.$$('#items-equipped .equipped-player').find((p) => p.textContent.includes(name));
    assert.match(card('Thorin').textContent, /AC 12/);
    assert.match(card('Thorin').textContent, /Shield · \+2 AC · not proficient/);
    assert.doesNotMatch(card('Thorin').textContent, /Rope/);
    assert.match(card('Alex').textContent, /Nothing equipped/);
    assert.ok(!page.visible('[data-tab=inventory]'), 'the DM has no inventory');

    const v = t.sheets.get(t.campaign.id, t.sam.id).version;
    t.sheets.save(t.campaign.id, t.sam.id, thorin([{ name: 'Greataxe', kind: 'weapon', equipped: 1, proficient: true, weapon: { damage: '1d12 slashing', ability: 'str', category: 'martial', properties: ['heavy', 'two-handed'] } }]), { version: v });
    page.click('#equipped-refresh');
    await page.waitFor(() => /Greataxe/.test(card('Thorin').textContent), { what: 'the new gear' });
    assert.match(card('Thorin').textContent, /Greataxe · \+2 to hit, 1d12 slashing/);
  });
});

test('inventory: weight against the campaign rule, charges used and rolled back, three attunements, magic items on the sheet, noisy armour on Stealth', async () => {
  const dice = [5, 3, 12];
  mock.method(crypto, 'randomInt', (min) => dice.shift() ?? min);
  const magic = (name, text, extra = {}) => ({ name, kind: 'magic', text, attunement: true, ...extra });
  try {
    await withPage(sheetPage({
      before: async (t) => {
        t.sheets.save(t.campaign.id, t.sam.id, {
          ...emptySheet({ name: 'Thorin' }), race: 'Human', classes: [{ name: 'Fighter', level: 1 }],
          abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          inventory: [
            magic('Wand of Magic Missiles', 'x', { attunement: false, charges: { max: 7, used: 0, recharge: '1d6+1', when: 'dawn' } }),
            magic('Gauntlets of Ogre Power', 'g', { effects: [{ target: 'score.str', value: 19 }], equipped: 1 }),
            magic('Ring of Protection', 'r', { effects: [{ target: 'ac', value: 1 }, { target: 'saves', value: 1 }], equipped: 1, attuned: true }),
            magic('Cloak of Elvenkind', 'c', { attuned: true }),
            magic('Amulet', 'a', { attuned: true }),
            { name: 'Chain mail', kind: 'armor', weight: 55, armor: { base: 16, type: 'heavy', strength: 13, stealth: true } },
            { name: 'Anvil', weight: 100 },
          ],
        });
      },
    }), async (page) => {
      page.click('[data-tab=inventory]');
      const inv = (label) => page.el(`#inventory [aria-label="${label}"]`);
      const top = () => page.text('#tab-inventory .gear-summary');
      assert.match(top(), /Carrying 155 lb of 150 lb\. Attuned to 3 of 3\./);
      assert.match(page.text('#tab-inventory .gear-warn'), /Over your carrying capacity \(155 of 150 lb\): speed 5 ft/);

      // A fourth attunement is refused.
      page.click(inv('Attuned: Gauntlets of Ogre Power'));
      assert.equal(inv('Attuned: Gauntlets of Ogre Power').checked, false);
      assert.match(page.text('#gear-status'), /attuned to 3 items at most/);
      page.click(inv('Attuned: Amulet'));
      page.click(inv('Attuned: Gauntlets of Ogre Power'));
      assert.equal(inv('Attuned: Gauntlets of Ogre Power').checked, true);
      // Strength 19 now: capacity 285, so not over any more.
      assert.match(top(), /of 285 lb/);
      assert.ok(page.$('#tab-inventory .gear-warn').hidden);

      // Charges: use two, then recharge with the wand's 1d6+1 (rolled: 3 + 1).
      page.click(inv('Use a charge: Wand of Magic Missiles'));
      page.click(inv('Use a charge: Wand of Magic Missiles'));
      assert.match(page.text('#inventory .charges'), /5 of 7 charges/);
      page.click(inv('Recharge: Wand of Magic Missiles'));
      await page.settle();
      assert.equal(page.requests.filter((r) => r.path.endsWith('/roll')).at(-1).body.notation, '1d6+1');
      await page.waitFor(() => /7 of 7 charges/.test(page.text('#inventory .charges')), { what: 'the charges back' });

      // The sheet: Strength from the gauntlets, AC and saves from the ring, Stealth with disadvantage in chain mail.
      page.click('[data-tab=sheet]');
      assert.equal(byLabel(page, 'Strength modifier').value, '+4');
      assert.match(page.text('#sheet .item-score'), /19 with items/);
      assert.equal(byLabel(page, 'Armour class').value, '11');
      assert.equal(byLabel(page, 'Wisdom save').value, '+1');
      page.click('[data-tab=inventory]');
      page.click(inv('Equipped: Chain mail'));
      page.click('[data-tab=sheet]');
      assert.equal(byLabel(page, 'Armour class').value, '17');
      assert.match(page.text('#sheet .sheet-warn'), /Chain mail: disadvantage on Stealth/);
      page.click(page.$$('#sheet .roll-name').find((b) => b.textContent.startsWith('Stealth')));
      await page.settle();
      const last = page.requests.filter((r) => r.path.endsWith('/roll')).at(-1).body;
      assert.equal(last.mode, 'disadvantage');
      assert.equal(last.label, 'Stealth (disadvantage: Chain mail)');
    });
  } finally {
    mock.restoreAll();
  }
});

test('campaign settings: the DM ignores weight limits from Settings', async () => {
  await withPage({ before: async (t) => ({ dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana, storage: NO_3D }) }, async (page, t) => {
    page.click('#settings-open');
    assert.equal(page.el('#setting-weight').value, 'capacity');
    page.type('#setting-weight', 'ignore');
    await page.waitFor(() => /Saved/.test(page.text('#settings-dialog')), { what: 'the setting to save' });
    assert.deepEqual(t.store.getSettings(t.campaign.id), { weight: 'ignore', edition: null, level_up: 'player', clock: 480, travel: { time: 'clock', roads: true, terrain: true, vehicles: true, marches: true, encounters: true }, attacks: { on: true, damage: 'auto', show_ac: false }, backgrounds: [], calendar: null, wiki: { lanes: [] }, discord: { guild_id: null, channel_id: null } });
  });
});

test('campaign settings: the DM picks the rules edition, and the Rest dialog follows it', async () => {
  await withPage({ before: async (t) => ({ dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana, storage: NO_3D }) }, async (page, t) => {
    page.click('#settings-open');
    assert.equal(page.el('#setting-edition').value, '');
    await page.waitFor(() => /now 2014/.test(page.text('#setting-edition')), { what: 'the edition in use' });
    page.type('#setting-edition', '2024');
    await page.waitFor(() => /Saved/.test(page.text('#settings-dialog')), { what: 'the setting to save' });
    assert.equal(t.store.getSettings(t.campaign.id).edition, '2024');
    const rests = await t.request('GET', `/campaigns/${t.campaign.id}/rests`);
    assert.equal(rests.json().edition, '2024');
  });
});

test('campaign settings: a player\u2019s sheet follows the DM\u2019s weight rule live; players have no Settings', async () => {
  await withPage(sheetPage({
    before: async (t) => { t.sheets.save(t.campaign.id, t.sam.id, { ...emptySheet({ name: 'Thorin' }), race: 'Human', inventory: [{ name: 'Anvil', weight: 200 }] }); },
  }), async (page, t) => {
    assert.ok(!page.visible('#settings-open'));
    page.click('[data-tab=inventory]');
    assert.match(page.text('#tab-inventory .gear-warn'), /Over your carrying capacity/);
    page.click('[data-tab=sheet]');
    assert.equal(byLabel(page, 'Speed (feet)').value, '5');
    await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { weight: 'ignore' } });
    await page.waitFor(() => byLabel(page, 'Speed (feet)').value === '30', { what: 'the sheet to hear the new rule' });
    page.click('[data-tab=inventory]');
    assert.match(page.text('#tab-inventory .gear-summary'), /Carrying 200 lb \(ignore weight limits: this campaign has none\)/);
    assert.ok(page.$('#tab-inventory .gear-warn').hidden);
  });
});

test('sheet: Review sheet shows the rules checks and the AI\'s findings above the sheet, and closes', async () => {
  const llm = createFakeLLM({
    qaScript: [[
      { tool: 'submit_review', input: { summary: 'One thing to fix.', findings: [{ severity: 'problem', area: 'Class features', message: 'Action Surge comes at 2nd level.', source: "Player's Handbook p. 72" }] } },
      { answer: 'Done.' },
    ]],
  });
  await withPage(sheetPage({ setup: { llm } }), async (page) => {
    page.click('[data-tab=sheet]');
    assert.ok(page.el('#sheet-review-result').hidden);
    page.type(byLabel(page, 'Class'), 'Fighter');
    page.type(byLabel(page, 'Proficiency bonus'), '4');
    page.click('#sheet-review');
    await page.waitFor(() => page.$('#sheet-review-result h3'), { what: 'the review' });
    const box = page.el('#sheet-review-result');
    assert.equal(page.text(box.querySelector('h3')), 'Sheet review (2014 rules)');
    assert.match(page.text(box), /One thing to fix\./);
    const problems = page.$$('#sheet-review-result .review-problems li').map((li) => page.text(li));
    assert.equal(problems.length, 2);
    assert.match(problems[0], /^Proficiency bonus: The sheet says \+4; at level 1 it is \+2\./);
    assert.match(problems[1], /Action Surge comes at 2nd level\. \(Player's Handbook p\. 72\)/);
    page.click(page.$$('#sheet-review-result button').find((b) => page.text(b) === 'Close'));
    assert.ok(box.hidden);
  });
});

// The review's empty "Against the rules" heading and list went into the box as null, printed "nullnull".
test('regression: a Sheet review with nothing against the rules shows no "null" in its box', async () => {
  const llm = createFakeLLM({
    qaScript: [[
      { tool: 'submit_review', input: { summary: 'Looks fine.', findings: [{ severity: 'check', area: 'Skills', message: 'Only four skills.', source: '' }] } },
      { answer: 'Done.' },
    ]],
  });
  await withPage(sheetPage({ setup: { llm } }), async (page) => {
    page.click('[data-tab=sheet]');
    page.type(byLabel(page, 'Class'), 'Rogue');
    page.click('#sheet-review');
    await page.waitFor(() => page.$('#sheet-review-result h3'), { what: 'the review' });
    const text = page.el('#sheet-review-result').textContent;
    assert.match(text, /Worth checking/);
    assert.doesNotMatch(text, /null|undefined/);
  });
});

// With no subclass or race features, those two sections went into the box as null, printed "nullnull".
test('regression: Class features with no subclass or race rows shows no "null"', async () => {
  await withPage(sheetPage(), async (page) => {
    page.click('[data-tab=sheet]');
    const text = page.el('#sheet .class-features').textContent;
    assert.match(text, /Nothing to track for your class/);
    assert.doesNotMatch(text, /null|undefined/);
  });
});

// With no note to show, the Companions box put null into the page, printed "null" under its text.
test('regression: the Companions box with no companions shows no "null"', async () => {
  await withPage(sheetPage(), async (page) => {
    page.click('[data-tab=sheet]');
    const text = page.el('#sheet .companions').textContent;
    assert.match(text, /Familiars, pets/);
    assert.doesNotMatch(text, /null|undefined/);
  });
});

test('regression: the Inventory suggests names of the kind picked, not always weapons', async () => {
  await withPage(sheetPage(), async (page) => {
    page.click('[data-tab=inventory]');
    const suggested = () => page.$$('#dl-gear option').map((o) => o.value);
    // Any kind: everything, weapons included.
    assert.ok(suggested().includes('Longsword'));
    assert.ok(suggested().includes('Bag of Holding'));
    page.type('#gear-kind', 'potion');
    assert.ok(suggested().includes('Potion of Healing'));
    assert.ok(!suggested().includes('Longsword'), 'no weapons under Potion');
    page.type('#gear-kind', 'armor');
    assert.ok(suggested().includes('Chain mail'));
    assert.ok(!suggested().includes('Dagger'));
    page.type('#gear-kind', 'magic');
    assert.ok(suggested().includes('Bag of Tricks (Gray)'));
    assert.ok(!suggested().includes('Longsword'));
    page.type('#gear-kind', 'gear');
    assert.ok(suggested().includes('Backpack'));
  });
});

test('inventory: looking an item up shows its card (stats, rarity, attunement, description as Markdown) with Add and Cancel', async () => {
  const llm = createFakeLLM({
    structured: async () => ({
      found: true, name: 'Cloak of Protection', kind: 'magic', rarity: 'uncommon', attunement: true, price: '', weight_lb: 1,
      description: 'You gain a **+1 bonus to AC and saving throws** while you wear this cloak.\n\n| Worn | Bonus |\n| --- | --- |\n| yes | +1 |',
    }),
  });
  await withPage(sheetPage({ setup: { llm } }), async (page) => {
    page.click('[data-tab=inventory]');
    page.type('#gear-kind', 'magic');
    page.el('#gear-name').value = 'cloak of protection';
    page.submit('#gear-add');
    await page.waitFor(() => page.$('#gear-preview .gear-card'), { what: 'the card' });
    const card = page.$('#gear-preview .gear-card');
    assert.equal(card.querySelector('h3').textContent, 'Cloak of Protection');
    assert.deepEqual([...card.querySelectorAll('.gear-card-tags .tag')].map((e) => e.textContent), ['Magic item', 'Uncommon', 'Needs attunement']);
    assert.match(card.querySelector('.gear-card-facts').textContent, /On your sheet\+1 AC, \+1 saving throws/);
    assert.match(card.querySelector('.gear-card-facts').textContent, /Weight1 lb/);
    // The description is rendered, not raw Markdown.
    assert.ok(card.querySelector('.gear-card-text strong'));
    assert.ok(card.querySelector('.gear-card-text table'));
    assert.match(card.textContent, /AI's memory/);
    assert.equal(page.$$('#inventory .gear-row').length, 0, 'nothing added yet');

    // Cancel: gone, nothing added.
    page.click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Cancel'));
    assert.ok(page.$('#gear-preview').hidden);
    assert.equal(page.$$('#inventory .gear-row').length, 0);

    // Picking a suggestion shows its card at once (a table weapon: no AI call).
    page.type('#gear-kind', 'weapon');
    const name = page.el('#gear-name');
    name.value = 'Rapier';
    name.dispatchEvent(new page.window.Event('input'));
    await page.waitFor(() => page.$('#gear-preview .gear-card h3')?.textContent === 'Rapier', { what: "the rapier's card" });
    assert.match(page.text('#gear-preview .gear-card-facts'), /Damage1d8 piercing/);
    assert.match(page.text('#gear-preview .gear-card-facts'), /WeaponMartial: finesse/);
    page.click('#gear-preview .gear-card-actions .primary');
    await page.waitFor(() => /^Added Rapier/.test(page.text('#gear-status')), { what: 'the rapier added' });
    assert.ok(page.$('#gear-preview').hidden);
    assert.deepEqual(page.$$('#inventory .gear-title').map((e) => e.textContent), ['Rapier']);
  });
});

test('inventory: Add by hand asks the kind first and opens the fields for it; armour made by hand sets the AC, a potion is drunk', async () => {
  await withPage(sheetPage({
    before: async (t) => {
      t.sheets.save(t.campaign.id, t.sam.id, {
        ...emptySheet({ name: 'Thorin' }), race: 'Human', classes: [{ name: 'Fighter', level: 1 }],
        abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 }, hp: { current: 3, temp: null },
        inventory: [{ name: 'Potion of Healing', kind: 'potion', qty: 2, heal: '2d4+2' }],
      });
    },
  }), async (page, t) => {
    page.click('[data-tab=inventory]');
    const inv = (label) => page.el(`#inventory [aria-label="${label}"]`);
    page.type('#gear-name', 'Mithral coat');
    page.type('#gear-kind', 'armor');
    page.click('#gear-own');
    await page.waitFor(() => page.$('#inventory [aria-label="Armour type: Mithral coat"]'), { what: 'the armour fields' });
    assert.ok(!page.$('#inventory [aria-label="Weapon damage"]'), 'no weapon fields on armour');
    page.type(inv('Armour type: Mithral coat'), 'medium');
    await page.waitFor(() => page.$('#inventory [aria-label="Armour class"]'), { what: 'the details to stay open' });
    page.type(inv('Armour class'), '14');
    page.click(inv('Equipped: Mithral coat'));
    page.click('[data-tab=sheet]');
    assert.equal(byLabel(page, 'Armour class').value, '16', '14 + Dex (max 2)');

    // The potion: Drink rolls 2d4+2 on the server and one is used up.
    page.click('[data-tab=inventory]');
    page.click(inv('Drink Potion of Healing'));
    await page.waitFor(() => /Drank Potion of Healing: regained \d+ hit points/.test(page.text('#gear-status')), { what: 'the potion drunk' });
    const healed = Number(/regained (\d+)/.exec(page.text('#gear-status'))[1]);
    assert.ok(healed >= 4 && healed <= 10);
    assert.equal(page.requests.find((r) => r.path.endsWith('/sheet/gear/drink')).body.visibility, 'party');
    const { sheet } = t.sheets.get(t.campaign.id, t.sam.id);
    assert.equal(sheet.hp.current, 3 + healed);
    assert.equal(sheet.inventory.find((g) => g.name === 'Potion of Healing').qty, 1);
    assert.equal(sheet.inventory.find((g) => g.name === 'Mithral coat').armor.base, 14);
  });
});

test('class features on the sheet: Sneak Attack ticked under a weapon adds its dice; Weapon Mastery picked in the Inventory shows on the attack; Thieves\' Cant is in Features & traits, once', async () => {
  const { addToInventory } = await import('@dndapp/shared/gear.js');
  const before = async (t) => {
    t.store.setSettings(t.campaign.id, { edition: '2024' });
    const inventory = addToInventory([], { name: 'Rapier' }, 1);
    inventory[0].equipped = 1;
    inventory[0].proficient = true;
    await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...emptySheet(), classes: [{ name: 'Rogue', subclass: '', level: 5 }], abilities: { ...emptySheet().abilities, dex: 16 }, inventory, features: 'Expertise: Stealth and thieves’ tools.' }, version: 0 } });
  };
  await withPage(sheetPage({ before }), async (page) => {
    page.click('[data-tab=sheet]');
    await page.waitFor(() => page.$('#sheet [aria-label="Sneak Attack: Rapier"]'), { what: 'the Sneak Attack tick box' });
    page.click(byLabel(page, 'Sneak Attack: Rapier'));
    page.click(byLabel(page, 'Roll Rapier damage'));
    await page.settle();
    const rolls = () => page.requests.filter((r) => r.path.endsWith('/roll')).map((r) => r.body);
    assert.equal(rolls().at(-1).notation, '1d8+3d6+3');
    // Once a turn: it's unticked after the damage is rolled.
    assert.equal(byLabel(page, 'Sneak Attack: Rapier').checked, false);

    // Weapon Mastery: two weapons for a 2024 rogue, chosen from the Inventory.
    assert.match(page.text('#sheet .combat-bar'), /Weapon Mastery 0 of 2/);
    page.click('[data-tab=inventory]');
    page.click(page.el('#inventory [aria-label="Weapon mastery: Rapier"]'));
    page.click('[data-tab=sheet]');
    assert.match(page.text('#sheet .combat-bar'), /Rapier \(Vex\)/);
    assert.match(page.text('#sheet .atk-mastery'), /Mastery: Vex/);

    // Features & traits lists the rogue's text features; Expertise is already written, so it isn't listed again.
    const traits = page.$$('#sheet .auto-traits li').map((li) => li.querySelector('strong').textContent);
    assert.ok(traits.includes("Thieves' Cant"));
    assert.ok(!traits.includes('Expertise'));
    // The player's own text is left as it was.
    assert.equal(page.$$('#sheet textarea').find((x) => x.getAttribute('aria-label') === 'Features & traits').value, 'Expertise: Stealth and thieves\u2019 tools.');
  });
});

test("feats and subclass features on the sheet: a feat named in Features & traits gets a Feats row, a Champion's Remarkable Athlete is listed, a halfling's d20 rolls reroll 1s", async () => {
  const before = async (t) => {
    await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...emptySheet(), race: 'Lightfoot Halfling', classes: [{ name: 'Fighter', subclass: 'Champion', level: 7 }], features: 'Feat: Great Weapon Master' }, version: 0 } });
  };
  await withPage(sheetPage({ before }), async (page) => {
    page.click('[data-tab=sheet]');
    await page.waitFor(() => page.$('#sheet .cf-feats [data-feature="feat_great_weapon_master"]'), { what: 'the Feats row' });
    const traits = page.$$('#sheet .auto-traits li').map((li) => li.querySelector('strong').textContent);
    assert.ok(traits.includes('Remarkable Athlete'), traits.join(', '));
    assert.ok(!traits.includes('Improved Critical'), 'a Class features row, not listed twice');
    const save = page.$$('#sheet button.row-name').find((b) => /Strength/.test(b.textContent));
    page.click(save);
    await page.settle();
    assert.match(page.requests.filter((r) => r.path.endsWith('/roll')).at(-1).body.notation, /^1d20ro1/);
  });
});

test('sheet: options open when asked (adding a spell, spell levels with no slots), and stay open when the sheet redraws', async () => {
  await withPage(sheetPage(), async (page) => {
    page.click('[data-tab=sheet]');
    await page.settle();
    // No spells yet: adding one starts open. No class: every level has no slots, so they're hidden.
    const add = page.$('#sheet .spell-fold');
    assert.ok(add.open, 'adding the first spell starts open');
    const slots = page.$('#sheet .slots');
    const toggle = page.$('#sheet .slot-levels');
    assert.ok(slots.classList.contains('only-used'));
    assert.match(page.text(toggle), /Show all levels \(9 with no slots\)/);
    page.click(toggle);
    assert.ok(!slots.classList.contains('only-used'));
    assert.match(page.text(toggle), /Hide levels with no slots/);

    // A Wizard 3 has 1st- and 2nd-level slots: those show, and "all levels" stays as chosen through the redraw.
    page.click(toggle);
    page.type('#sheet [aria-label="Class"]', 'Wizard');
    page.type('#sheet [aria-label="Level"]', '3');
    await page.settle();
    const shown = page.$$('#sheet .slots > .slot:not(.pact)').filter((s) => !s.classList.contains('none')).map((s) => page.text(s.querySelector('.slot-level')));
    assert.deepEqual(shown, ['1st', '2nd']);
    assert.ok(slots.classList.contains('only-used'));
    assert.match(page.text(toggle), /7 with no slots/);
  });
});
