import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSheet, longRest, normalizeSheet, shortRest } from '../src/sheet.js';
import { featureRow, featureRows, setSpent } from '../src/class-features.js';
import { RACE_LIST, RACE_FEATURES, knownRace, racesOf } from '../src/race-features.js';

const ABILITIES = { str: 16, dex: 14, con: 16, int: 10, wis: 12, cha: 14 }; // +3 Str, Con; +2 Dex, Cha
const sheetOf = (race, level = 5, extra = {}) => normalizeSheet({ abilities: ABILITIES, race, ...extra, classes: [{ name: 'Fighter', level }] });
const opts = (s, edition = '2014') => ({ edition, values: computeSheet(s).values });
const raceRows = (s, edition = '2014') => featureRows(s, opts(s, edition)).filter((r) => r.race);
const row = (s, id, edition = '2014') => featureRow(s, id, opts(s, edition));

test('race features: matched on the typed race, subraces too, and not mistaken for a similar race', () => {
  assert.deepEqual(racesOf('Wood Elf'), ['elf', 'wood_elf']);
  assert.deepEqual(racesOf('Elf (Drow)'), ['elf', 'drow']);
  assert.deepEqual(racesOf('Half-Elf'), ['half_elf']);
  assert.deepEqual(racesOf('Half-Orc'), ['half_orc']);
  assert.deepEqual(racesOf('Orc'), ['orc']);
  assert.deepEqual(racesOf('Hobgoblin'), ['hobgoblin']);
  assert.deepEqual(racesOf('Goblin'), ['goblin', 'small']);
  assert.deepEqual(racesOf('Gold Metallic Dragonborn'), ['metallic_dragonborn']);
  assert.deepEqual(racesOf('Deep Gnome'), ['deep_gnome', 'small']);
  assert.deepEqual(racesOf(''), []);
  assert.equal(knownRace('Kobold'), false, 'only Small for the feats');
  for (const r of RACE_LIST.filter((x) => !x.feat)) assert.ok(racesOf(r.name).includes(r.key), `${r.name} matches itself`);
});

test('race features: every race has clean rows at 1st and 20th level, in both editions', () => {
  for (const edition of ['2014', '2024']) {
    for (const r of RACE_LIST.filter((x) => !x.feat)) {
      for (const level of [1, 20]) {
        for (const x of raceRows(sheetOf(r.name, level), edition)) assert.doesNotMatch(`${x.name} ${x.note} ${x.max} ${x.page}`, /undefined|NaN|\[object/, `${x.id} (${r.name}, ${edition}, ${level})`);
      }
    }
  }
  const ids = RACE_FEATURES.map((f) => f.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
});

test('race features: numbers from the character level and edition; rests give them back', () => {
  // 2014 Breath Weapon: once per short rest, 3d6 at 6th; 2024: proficiency bonus per long rest, d10s.
  const dragon = sheetOf('Red Dragonborn', 6);
  assert.deepEqual([row(dragon, 'breath_weapon_2014').max, row(dragon, 'breath_weapon_2014').recharge], [1, 'short']);
  assert.match(row(dragon, 'breath_weapon_2014').note, /3d6 fire damage \(save DC 14/); // 8 + 3 + 3
  assert.equal(row(dragon, 'breath_weapon_2024', '2024').max, 3);
  assert.match(row(dragon, 'breath_weapon_2024', '2024').note, /2d10 fire/);
  assert.equal(row(dragon, 'breath_weapon_2024'), null, 'not under 2014 rules');
  // The level counts every class: a Fighter 2 / Wizard 3 tiefling has Darkness.
  const tief = normalizeSheet({ abilities: ABILITIES, race: 'Tiefling', classes: [{ name: 'Fighter', level: 2 }, { name: 'Wizard', level: 3 }] });
  assert.deepEqual(raceRows(tief).map((r) => r.id), ['tiefling_legacy_3', 'tiefling_legacy_5']);
  assert.equal(row(tief, 'tiefling_legacy_3', '2024').name, 'Hellish Rebuke (Tiefling)');
  assert.equal(row(sheetOf('Abyssal Tiefling', 3), 'tiefling_legacy_3', '2024').name, 'Ray of Sickness (Tiefling)');
  // Orc: Adrenaline Rush back on a long rest (Monsters of the Multiverse) or a short rest (2024).
  const orc = sheetOf('Orc', 5);
  assert.equal(row(orc, 'adrenaline_rush').recharge, 'long');
  assert.equal(row(orc, 'adrenaline_rush', '2024').recharge, 'short');
  assert.ok(row(orc, 'relentless_endurance_orc', '2024'));
  assert.equal(row(orc, 'relentless_endurance_orc'), null);
  // Spent uses come back on rests like class features.
  let s = setSpent(sheetOf('Half-Orc', 3), 'relentless_endurance', 1);
  assert.equal(shortRest(s).class_features.spent.relentless_endurance, 1, 'not on a short rest');
  assert.equal(longRest(s).sheet.class_features.spent.relentless_endurance, undefined);
  s = setSpent(dragon, 'breath_weapon_2014', 1);
  assert.equal(shortRest(s).class_features.spent.breath_weapon_2014, undefined);
  // Triton: one spell more at 3rd and 5th.
  assert.deepEqual([1, 3, 5].map((l) => row(sheetOf('Triton', l), 'control_air_and_water').max), [1, 2, 3]);
});

test('racial feats: shown when named in the features and the race fits', () => {
  const ids = (s) => raceRows(s).filter((r) => r.race === 'Racial feat').map((r) => r.id);
  assert.deepEqual(ids(sheetOf('Halfling', 4, { features: 'Feat: Second Chance\nElven Accuracy' })), ['feat_second_chance']);
  assert.deepEqual(ids(sheetOf('High Elf', 4, { additional_features: 'elven  accuracy, fey teleportation' })), ['feat_elven_accuracy', 'feat_fey_teleportation']);
  assert.deepEqual(ids(sheetOf('Mountain Dwarf', 4, { features: 'Squat Nimbleness' })), ['feat_squat_nimbleness']);
  assert.deepEqual(ids(sheetOf('Rock Gnome', 4, { features: 'Squat Nimbleness' })), ['feat_squat_nimbleness'], 'a Small race');
  assert.deepEqual(ids(sheetOf('Human', 4, { features: 'Second Chance' })), []);
  assert.equal(row(sheetOf('Wood Elf', 4, { features: 'Wood Elf Magic' }), 'feat_wood_elf_magic').max, 2);
  assert.match(row(sheetOf('Dragonborn', 4, { features: 'Dragon Hide' }), 'feat_dragon_hide').note, /AC 15/);
});
