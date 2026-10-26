/** Backgrounds (backgrounds.js): the books' lists by edition, the DM's own, and applying one to a sheet. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySheet, normalizeSheet, SKILLS, ABILITIES } from '../src/sheet.js';
import { BOOK_BACKGROUNDS, applyBackground, backgroundAbilities, backgroundSummary, backgroundsFor, findBackground, normalizeCustomBackgrounds } from '../src/backgrounds.js';

test('backgrounds: every book background has two real skills; 2024 ones three abilities and a feat; 2014 ones a feature', () => {
  for (const b of BOOK_BACKGROUNDS) {
    assert.equal(b.skills.length, 2, b.name);
    for (const k of b.skills) assert.ok(SKILLS[k], `${b.name}: ${k}`);
    if (b.edition === '2024') {
      assert.equal(b.abilities.length, 3, b.name);
      for (const a of b.abilities) assert.ok(ABILITIES.includes(a));
      assert.ok(b.feat, b.name);
      assert.ok(b.gold > 0 && b.equipment, b.name);
    }
    if (b.edition === '2014') assert.ok(b.feature?.name && b.feature.text, b.name);
  }
  assert.equal(BOOK_BACKGROUNDS.filter((b) => b.edition === '2024').length, 16);
  assert.equal(BOOK_BACKGROUNDS.filter((b) => b.edition === '2014' && !b.variant).length, 13);
  // A game picks its edition's list (and Glory of the Giants' for either).
  const names = (ed) => backgroundsFor(ed).map((b) => b.name);
  assert.ok(names('2024').includes('Farmer') && !names('2024').includes('Urchin') && names('2024').includes('Rune Carver'));
  assert.ok(names('2014').includes('Urchin') && !names('2014').includes('Farmer'));
  assert.equal(findBackground('  acolyte ', { edition: '2024' }).feat, 'Magic Initiate (Cleric)');
  assert.equal(findBackground('Acolyte').feature.name, 'Shelter of the Faithful');
  // A name only the other edition has is still found.
  assert.equal(findBackground('Farmer', { edition: '2014' }).edition, '2024');
  assert.equal(findBackground('Nobody'), null);
  assert.deepEqual(backgroundAbilities('Sage'), ['con', 'int', 'wis']);
});

test("backgrounds: the DM's own are cleaned, listed first, and found by name", () => {
  const own = normalizeCustomBackgrounds([
    { name: 'Dockhand', skills: ['athletics', 'perception', 'flying'], tools: "Navigator's tools", gold: 12.4, feature: { name: 'Harbour Friends', text: 'Dockers help you.' }, abilities: ['str', 'con', 'wis'], feat: 'Tough' },
    { name: 'dockhand' }, { name: '' }, { name: 'Half', abilities: ['str'] },
  ]);
  assert.equal(own.length, 2);
  assert.deepEqual(own[0].skills, ['athletics', 'perception']);
  assert.equal(own[0].gold, 12);
  assert.deepEqual(own[1].abilities, []);
  const list = backgroundsFor('2014', own);
  assert.equal(list[0].name, 'Dockhand');
  assert.equal(list[0].custom, true);
  assert.equal(findBackground('Dockhand', { custom: own }).feature.name, 'Harbour Friends');
  assert.deepEqual(backgroundAbilities('Dockhand', { custom: own }), ['str', 'con', 'wis']);
  assert.ok(backgroundSummary(list[0]).some((l) => l.label === 'Origin feat' && l.text === 'Tough'));
});

test("backgrounds: applying one ticks skills, adds its feature, tools and languages, fills only what's empty", () => {
  const s = normalizeSheet({ ...emptySheet(), skills: { insight: 'expertise' }, features: 'Darkvision', proficiencies_languages: '' });
  const { sheet, changes, notes } = applyBackground(s, findBackground('Acolyte', { edition: '2014' }));
  assert.equal(sheet.skills.insight, 'expertise'); // never lowered
  assert.equal(sheet.skills.religion, 'proficient');
  assert.match(sheet.features, /^Darkvision\nShelter of the Faithful \(Acolyte background\)/);
  assert.match(sheet.proficiencies_languages, /Languages: Two of your choice/);
  assert.match(sheet.equipment, /holy symbol/);
  assert.equal(sheet.coins.gp, 15);
  assert.deepEqual(changes, ['Ticked Religion.', 'Added Shelter of the Faithful to Features & traits.', 'Added languages to Other proficiencies & languages.', 'Filled in Equipment.', 'Set your gold to 15 gp.']);
  assert.match(notes.join(' '), /Pick the tools and languages/);
  // Again: nothing more to add.
  assert.deepEqual(applyBackground(sheet, findBackground('Acolyte', { edition: '2014' })).changes, []);
  // What the player typed stays: their equipment, their coins.
  const typed = normalizeSheet({ ...emptySheet(), equipment: 'My own pack', coins: { cp: 0, sp: 3, ep: 0, gp: 0, pp: 0 } });
  const after = applyBackground(typed, findBackground('Soldier', { edition: '2024' }));
  assert.equal(after.sheet.equipment, 'My own pack');
  assert.equal(after.sheet.coins.gp, 0);
  assert.match(after.sheet.features, /Origin feat: Savage Attacker \(Soldier background\)/);
  assert.match(after.notes[0], /Raise Strength, Dexterity and Constitution/);
});
