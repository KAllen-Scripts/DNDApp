/**
 * The Sheet tab (sheet.js): automatic values while typing, the player's own
 * values, autosave and conflicts, rolling from the sheet, spells, layouts,
 * upload and download.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withPage, createFakeLLM } from './helpers.js';
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
    assert.deepEqual(sheet.attacks, [{ name: 'Longbow', bonus: '+5', damage: '1d8+3 piercing', notes: '' }]);
    assert.equal(sheet.coins.gp, 37);
    assert.deepEqual(sheet.hp, { current: 20, temp: null });
    assert.deepEqual(sheet.death_saves, { successes: 1, failures: 1 });
    assert.equal(sheet.spellcasting.slots_used[1], 2);

    page.click(byLabel(page, 'Remove this attack'));
    assert.equal(page.$$('#sheet [aria-label="Attack name"]').length, 0);
  });
});

test('sheet: clicking a save, skill or ability rolls it; an attack offers its damage, doubled on a natural 20', async () => {
  const dice = [20, 6, 4, 11];
  mock.method(crypto, 'randomInt', (min) => dice.shift() ?? min);
  try {
    await withPage(sheetPage(), async (page) => {
      page.click('[data-tab=sheet]');
      page.type(byLabel(page, 'Dexterity score'), '16');
      page.click(page.$$('#sheet .add-row').find((b) => b.textContent.includes('Add an attack')));
      page.type(byLabel(page, 'Attack name'), 'Shortsword');
      page.type(byLabel(page, 'Attack bonus'), '+5');
      page.type(byLabel(page, 'Damage and type'), '1d6+3 piercing');

      page.click(byLabel(page, 'Roll this attack'), { shiftKey: true });
      await page.settle();
      const rolls = () => page.requests.filter((r) => r.path.endsWith('/roll')).map((r) => r.body);
      assert.deepEqual(rolls().at(-1), { notation: '1d20+5', mode: 'advantage' });
      assert.equal(page.text('#dice-result .dr-label'), 'Shortsword: to hit');
      const buttons = page.$$('#dice-result .dr-actions button').map((b) => b.textContent);
      assert.deepEqual(buttons, ['Damage (1d6+3)', 'Critical damage (2d6+3)']);
      page.click(page.$$('#dice-result .dr-actions button')[1]);
      await page.settle();
      assert.deepEqual(rolls().at(-1), { notation: '2d6+3', mode: 'normal' });
      assert.equal(page.text('#dice-result .dr-label'), 'Shortsword: damage (critical)');

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
    });
  } finally {
    mock.restoreAll();
  }
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
