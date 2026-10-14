import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySheet, normalizeSheet, computeSheet, shortRest, longRest } from '../src/sheet.js';
import { activeForm, crValue, endWildShape, formProblem, formStats, normalizeForm, setFormHp, startWildShape, usesLeft, wildShapeRules } from '../src/wild-shape.js';

const WOLF = normalizeForm({
  name: 'Wolf', size: 'medium', type: 'beast', cr: '1/4', ac: 13, hp_max: 11, hp_formula: '2d8+2', speed: { walk: 40 },
  abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, skills: { perception: 3, stealth: 4 },
  attacks: [{ name: 'Bite', bonus: 4, damage: '2d4+2 piercing', notes: 'Melee Weapon Attack' }],
});
const EAGLE = normalizeForm({ name: 'Giant Eagle', type: 'beast', cr: '1', hp_max: 26, speed: { walk: 10, fly: 80 } });
const CROC = normalizeForm({ name: 'Crocodile', type: 'beast', cr: '1/2', hp_max: 19, speed: { walk: 20, swim: 30 } });
const AIR = normalizeForm({ name: 'Air Elemental', type: 'elemental', cr: '5', hp_max: 90, speed: { fly: 90 } });

const druid = (level, { subclass = '', forms = [WOLF], ...over } = {}) =>
  normalizeSheet({ ...emptySheet(), classes: [{ name: 'Druid', subclass, level }], abilities: { str: 8, dex: 14, con: 14, int: 12, wis: 16, cha: 10 }, wild_shape: { forms }, ...over });

test('wild shape: challenge ratings read as numbers', () => {
  assert.equal(crValue('1/4'), 0.25);
  assert.equal(crValue('1/2 (100 XP)'), 0.5);
  assert.equal(crValue('6'), 6);
  assert.equal(crValue('?'), null);
});

test('wild shape (2014): uses, CR limits, flying and swimming by level; Circle of the Moon', () => {
  assert.equal(wildShapeRules(druid(1)).available, false);
  const l2 = wildShapeRules(druid(2));
  assert.deepEqual([l2.uses, l2.max_cr, l2.no_fly, l2.no_swim, l2.hours], [2, 0.25, true, true, 1]);
  assert.equal(formProblem(WOLF, l2), '');
  assert.match(formProblem(CROC, l2), /Challenge 1\/2/);
  const l4 = wildShapeRules(druid(4));
  assert.equal(formProblem(CROC, l4), '');
  assert.match(formProblem(EAGLE, l4), /over your limit/);
  assert.equal(formProblem(EAGLE, wildShapeRules(druid(8))), '');
  assert.equal(wildShapeRules(druid(20)).uses, null); // Archdruid: unlimited
  const moon2 = wildShapeRules(druid(2, { subclass: 'Circle of the Moon' }));
  assert.equal(moon2.max_cr, 1);
  assert.match(formProblem(EAGLE, moon2), /Flying/); // the other limits still apply
  assert.equal(wildShapeRules(druid(9, { subclass: 'Moon' })).max_cr, 3);
  assert.match(formProblem(AIR, wildShapeRules(druid(9, { subclass: 'Moon' }))), /level 10/);
  assert.equal(formProblem(AIR, wildShapeRules(druid(10, { subclass: 'Moon' }))), '');
});

test('wild shape (2024): uses 2, 3, 4; forms known; swimming any time; temporary hit points; Moon AC', () => {
  const l2 = wildShapeRules(druid(2), '2024');
  assert.deepEqual([l2.uses, l2.known, l2.temp_hp, l2.no_swim], [2, 4, 2, false]);
  assert.equal(formProblem(CROC, wildShapeRules(druid(4), '2024')), '');
  assert.deepEqual([wildShapeRules(druid(6), '2024').uses, wildShapeRules(druid(17), '2024').uses], [3, 4]);
  const moon = wildShapeRules(druid(6, { subclass: 'Circle of the Moon' }), '2024');
  assert.deepEqual([moon.max_cr, moon.temp_hp, moon.ac_floor], [2, 18, 16]);
  assert.match(formProblem(AIR, moon), /level 10/);
});

test('wild shape (2014): turning into a form uses a use; its own hit points; at 0 you change back and the rest carries over', () => {
  let s = druid(2, { hp: { current: 15, temp: null } });
  s = startWildShape(s, WOLF.id);
  assert.equal(activeForm(s).name, 'Wolf');
  assert.deepEqual(s.wild_shape.active, { form: WOLF.id, hp: 11, uses: 1 });
  assert.equal(usesLeft(s, wildShapeRules(s)), 1);
  assert.equal(setFormHp(s, 20).sheet.wild_shape.active.hp, 11, 'never above the form\'s maximum');
  const hurt = setFormHp(s, 4);
  assert.deepEqual([hurt.reverted, hurt.sheet.wild_shape.active.hp], [false, 4]);
  const down = setFormHp(s, -3);
  assert.deepEqual([down.reverted, down.carried, down.sheet.wild_shape.active, down.sheet.hp.current], [true, 3, null, 12]);
  s = startWildShape(endWildShape(s), WOLF.id);
  assert.throws(() => startWildShape(s, WOLF.id), /no Wild Shape uses left/);
  // A short rest gives both back (2014).
  assert.equal(shortRest(s).class_features.spent.wild_shape, undefined);
});

test('wild shape (2024): temporary hit points instead of the form\'s; a short rest gives one use back, a long rest all', () => {
  let s = druid(5, { hp: { current: 30, temp: 2 } });
  s = startWildShape(s, WOLF.id, '2024');
  assert.equal(s.wild_shape.active.hp, null);
  assert.equal(s.hp.temp, 5);
  assert.equal(setFormHp(s, 22).sheet.hp.current, 22, 'damage comes off your own hit points');
  s = startWildShape(s, WOLF.id, '2024');
  assert.equal(s.class_features.spent.wild_shape, 2);
  assert.equal(shortRest(s, { edition: '2024' }).class_features.spent.wild_shape, 1);
  assert.equal(longRest(s, { edition: '2024' }).sheet.class_features.spent.wild_shape, undefined);
});

test('wild shape: in a form, the beast\'s Str, Dex, Con, AC and speed with your Int, Wis, Cha; proficiencies, the beast\'s bonus when higher', () => {
  const s = startWildShape(druid(2, { skills: { perception: 'proficient', athletics: 'proficient' } }), WOLF.id);
  const f = formStats(s, WOLF, computeSheet(s));
  assert.deepEqual(f.scores, { str: 12, dex: 15, con: 12, int: 12, wis: 16, cha: 10 });
  assert.equal(f.saves.wis, 5); // Wisdom 16 + proficiency (druid)
  assert.equal(f.saves.dex, 2);
  assert.equal(f.skills.perception, 5); // yours (+3 Wis +2) beats the wolf's +3
  assert.equal(f.skills.stealth, 4); // the wolf's +4 beats your +2
  assert.equal(f.skills.athletics, 3); // the wolf's Strength with your proficiency
  assert.deepEqual([f.ac, f.speed, f.initiative, f.passive_perception], [13, { walk: 40 }, 2, 15]);
  assert.deepEqual(f.hp, { current: 11, max: 11 });
  // 2024 Circle of the Moon: AC at least 13 + Wisdom modifier.
  const moon = druid(3, { subclass: 'Circle of the Moon' });
  assert.equal(formStats(moon, WOLF, computeSheet(moon), '2024').ac, 16);
});

test('wild shape: saved with the sheet; a form that is gone isn\'t active; other classes have none', () => {
  const s = normalizeSheet({ ...druid(2), wild_shape: { forms: [WOLF], uses_spent: 1, active: { form: 'nope', hp: 3 } } });
  assert.equal(s.wild_shape.active, null);
  assert.equal(s.class_features.spent.wild_shape, 1, 'uses spent on a sheet from before the Class features box carry over');
  assert.equal(normalizeSheet(emptySheet()).wild_shape.forms.length, 0);
  assert.deepEqual(normalizeSheet({}).wild_shape, { forms: [], active: null });
});
