/**
 * The Sheet tab (sheet.js): automatic values while typing, the player's own
 * values, autosave and conflicts, rolling from the sheet, spells, layouts,
 * upload and download.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withPage, addDm, createFakeLLM, openPage } from './helpers.js';
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
    page.type(byLabel(page, 'Attack name'), 'Longbow');
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
    // Longbow is a weapon from the book: Dexterity, proficient (the damage was typed over).
    assert.deepEqual(sheet.attacks, [{ name: 'Longbow', kind: 'attack', ability: 'dex', proficient: true, magic: 0, bonus: '+5', save: '', dc: '', damage: '1d8+3 piercing', notes: '' }]);
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
    await withPage(sheetPage(), async (page) => {
      page.click('[data-tab=sheet]');
      page.type(byLabel(page, 'Dexterity score'), '16');
      page.click(page.$$('#sheet .add-row').find((b) => b.textContent.includes('Add an attack')));
      // A weapon from the book fills in its damage and ability (finesse: Dex +3); to hit and damage are worked out.
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

    // Shield has nothing to roll.
    card = await add('Shield');
    assert.equal(card.querySelector('.spell-rolls').childElementCount, 0);
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
    assert.match(page.text('#sheet .add-spell'), /Couldn't find details for Zorblax's Whimsy/);
    assert.equal(page.text(page.$$('#sheet .spell-group h4').at(-1)), 'Level not set');
    assert.match(page.text('#sheet .add-spell button.ghost'), /Fill in missing details \(1\)/);

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

test('sheet: the layouts chosen under Look draw the same sheet; the Tabs layout remembers its tab', async () => {
  await withPage(sheetPage(), async (page) => {
    page.click('[data-tab=sheet]');
    page.type(byLabel(page, 'Character name'), 'Lyra');
    for (const layout of ['combat', 'abilities', 'tabs', 'single', 'classic']) {
      page.$('#tab-sheet').dataset.sheetLayout = layout;
      await page.waitFor(() => page.$(`#sheet .row-${layout === 'tabs' ? 'strip' : layout === 'abilities' ? 'abilities' : layout}`), { what: `the ${layout} layout` });
      assert.equal(byLabel(page, 'Character name').value, 'Lyra', layout);
      assert.equal(page.$$('#sheet [aria-label="Strength score"]').length, 1, layout);
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
    assert.match(page.text('#sheet .add-spell'), /Couldn't find details for Booming Blade/);

    // Found the second time.
    known = true;
    page.click(page.$$('#sheet .add-spell button').find((b) => b.textContent.startsWith('Fill in missing details')));
    await page.waitFor(() => /Done\./.test(page.text('#sheet .add-spell')), { what: 'the lookups' });
    const card = () => page.$$('#sheet .spell').find((c) => c.textContent.includes('Booming Blade'));
    assert.equal(page.text(card().closest('.spell-group').querySelector('h4')), 'Cantrips');
    assert.equal(page.text(card().querySelector('.source')), 'AI memory');
    assert.ok(page.$('#sheet .add-spell button.ghost').hidden, 'nothing left to fill in');

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
      assert.deepEqual(attacks.map((a) => a.querySelector('.gear-name').textContent), ['Dagger ×2', 'Longsword']);
      assert.deepEqual(attacks.map((a) => a.querySelector('.gear-num').textContent), ['+4', '+3']);
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
    page.click('[data-tab=items]');
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
    assert.deepEqual(t.store.getSettings(t.campaign.id), { weight: 'ignore', edition: null });
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
