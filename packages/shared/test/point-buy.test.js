/** The point buy calculator (point-buy.js): costs, bonuses by the 2014 and 2024 rules, and the buttons. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySheet, normalizeSheet } from '../src/sheet.js';
import { changePointBuy, normalizePointBuy, pointBuy, raceBonuses2014, stepPointBuy } from '../src/point-buy.js';

const sheet = (abilities, extra = {}) => normalizeSheet({ ...emptySheet(), abilities, ...extra });
const STANDARD = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }; // 9 + 7 + 5 + 4 + 2 + 0 = 27

test('point buy: off and following the campaign until the player changes it; kept by normalizeSheet', () => {
  assert.deepEqual(emptySheet().point_buy, { on: false, rules: '', choice: { 2014: {}, 2024: {} } });
  const s = normalizeSheet({ point_buy: { on: true, rules: '2024', choice: { 2024: { str: 2, dex: 1, con: 5 }, 2014: { wis: 'x' } } } });
  assert.deepEqual(s.point_buy, { on: true, rules: '2024', choice: { 2014: {}, 2024: { str: 2, dex: 1 } } });
  assert.deepEqual(normalizePointBuy({ rules: '2030' }).rules, '');
  assert.equal(pointBuy(emptySheet()).rules, '2014');
  assert.equal(pointBuy(emptySheet(), { edition: '2024' }).rules, '2024');
  assert.equal(pointBuy(sheet(STANDARD, { point_buy: { rules: '2014' } }), { edition: '2024' }).rules, '2014');
});

test('point buy: costs and points left; scores outside 8 to 15 and overspending are problems', () => {
  const pb = pointBuy(sheet(STANDARD, { point_buy: { rules: '2014' }, race: 'Goliath' , }));
  assert.equal(pb.spent, 27);
  assert.equal(pb.left, 0);
  // A race the list doesn't know: no bonuses until the player chooses them, and no problem with that.
  assert.deepEqual(pb.problems, []);
  assert.equal(pointBuy(emptySheet()).spent, 12); // six 10s

  const bad = pointBuy(sheet({ str: 16, dex: 15, con: 15, int: 7, wis: 10, cha: 10 }, { point_buy: { rules: '2014' } }));
  assert.equal(bad.abilities.str.cost, null);
  assert.ok(bad.problems.some((p) => /Strength is 16 before bonuses: point buy goes up to 15/.test(p)));
  assert.ok(bad.problems.some((p) => /Intelligence is 7 before bonuses: point buy starts at 8/.test(p)));
  const over = pointBuy(sheet({ str: 15, dex: 15, con: 15, int: 10, wis: 10, cha: 10 }, { point_buy: { rules: '2014' } }));
  assert.equal(over.left, -6);
  assert.ok(over.problems.some((p) => /6 points over the 27/.test(p)));
});

test('point buy, 2014: the race gives its bonuses; Half-Elf and Variant Human choose theirs', () => {
  assert.deepEqual(raceBonuses2014('Mountain Dwarf').fixed, { con: 2, str: 2 });
  assert.deepEqual(raceBonuses2014('dark elf (drow)').fixed, { dex: 2, cha: 1 });
  assert.deepEqual(raceBonuses2014('Human').fixed, { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 });
  assert.equal(raceBonuses2014('Variant Human').choose, 2);
  assert.equal(raceBonuses2014('Kenku').known, false);

  // A High Elf with 15 Dex and 13 Int on the sheet bought 13 and 12.
  const elf = pointBuy(sheet({ str: 15, dex: 15, con: 13, int: 13, wis: 10, cha: 8 }, { race: 'High Elf', point_buy: { rules: '2014' } }));
  assert.equal(elf.abilities.dex.base, 13);
  assert.equal(elf.abilities.int.base, 12);
  assert.equal(elf.spent, 9 + 5 + 5 + 4 + 2 + 0);
  // Choices don't count for a race with fixed bonuses.
  const ignored = pointBuy(sheet(STANDARD, { race: 'Tiefling', point_buy: { rules: '2014', choice: { 2014: { str: 1 } } } }));
  assert.equal(ignored.abilities.str.bonus, 0);
  assert.equal(ignored.choose, 0);

  const halfElf = (choice) => pointBuy(sheet({ str: 8, dex: 15, con: 14, int: 10, wis: 10, cha: 17 }, { race: 'Half-Elf', point_buy: { rules: '2014', choice: { 2014: choice } } }));
  assert.ok(halfElf({}).problems.some((p) => /A Half-Elf chooses 2 abilities to raise by 1 \(not Charisma\): choose them/.test(p)));
  const ok = halfElf({ dex: 1, con: 1 });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.abilities.cha.base, 15);
  assert.equal(ok.abilities.dex.base, 14);
  assert.ok(halfElf({ dex: 1, cha: 1 }).problems.some((p) => /can't go to Charisma/.test(p)));
  // A Half-Elf's choices are +1 each, even if a +2 was stored.
  assert.equal(halfElf({ dex: 2, con: 1 }).abilities.dex.chosen, 1);
});

test('point buy, 2024: the player puts +2 and +1, or three +1s; the background limits where', () => {
  const at = (choice, background = '') => pointBuy(sheet(STANDARD, { background, point_buy: { rules: '2024', choice: { 2024: choice } } }));
  assert.ok(at({}).problems.some((p) => /raises one ability by 2 and another by 1, or three abilities by 1/.test(p)));
  assert.ok(at({ str: 2, dex: 2 }).problems.length);
  assert.ok(at({ str: 1, dex: 1 }).problems.length);
  const two = at({ str: 2, con: 1 });
  assert.equal(two.abilities.str.base, 13);
  assert.equal(two.abilities.con.base, 12);
  assert.deepEqual(at({ str: 1, dex: 1, con: 1 }).problems.filter((p) => /background/.test(p)), []);
  // The Sage raises Constitution, Intelligence or Wisdom.
  assert.ok(at({ str: 2, con: 1 }, 'Sage').problems.some((p) => /The Sage background raises Constitution, Intelligence or Wisdom, not Strength/.test(p)));
  assert.equal(at({ str: 2, con: 1 }, 'Sage').allowed.join(), 'con,int,wis');
});

test('point buy: choosing bonuses and rules moves the scores so what was bought stays; the buttons stay within 8 to 15', () => {
  let s = sheet(STANDARD, { point_buy: { rules: '2024' } });
  s = changePointBuy(s, { choice: { str: 2, con: 1 } });
  assert.equal(s.abilities.str, 17);
  assert.equal(s.abilities.con, 14);
  assert.equal(pointBuy(s).spent, 27);
  s = changePointBuy(s, { choice: { dex: 2, con: 1 } });
  assert.deepEqual([s.abilities.str, s.abilities.dex, s.abilities.con], [15, 16, 14]);
  // To 2014 as a Dragonborn (+2 Str, +1 Cha): the 2024 choices come off, the race's go on.
  s = changePointBuy({ ...s, race: 'Dragonborn' }, { rules: '2014' });
  assert.deepEqual([s.abilities.str, s.abilities.dex, s.abilities.con, s.abilities.cha], [17, 14, 13, 9]);
  assert.deepEqual(s.point_buy.choice[2024], { dex: 2, con: 1 }); // kept for going back

  const up = stepPointBuy(s, 'wis', 1);
  assert.equal(up.abilities.wis, 11);
  assert.equal(s.abilities.wis, 10); // a new sheet
  assert.equal(stepPointBuy(s, 'str', 1), s); // 15 bought already
  assert.equal(stepPointBuy(s, 'cha', -1), s); // 8 bought already
});
