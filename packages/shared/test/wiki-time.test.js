/**
 * In-game times on the wiki (stage 4b): what the parser reads, and what it writes back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhen, whenText, whenKey } from '../src/wiki-time.js';
import { calendarPreset } from '../src/calendar.js';

const D = 1440;
const now = 20 * D + 600; // Day 21, 10:00

test('wiki time: without a calendar', () => {
  const cases = [
    ['Day 12', 11 * D, 12 * D, 'Day 12'],
    ['Day 12, 21:00', 11 * D + 1260, 11 * D + 1260, 'Day 12, 21:00'],
    ['day 12 at 9pm', 11 * D + 1260, 11 * D + 1260, 'Day 12, 21:00'],
    ['Day 12 night', 11 * D + 22 * 60, 12 * D + 6 * 60, 'Day 12 night'],
    ['the morning of Day 3', 2 * D + 360, 2 * D + 720, 'Day 3 morning'],
    ['Day 3 noon', 2 * D + 720, 2 * D + 720, 'Day 3, 12:00'],
    ['Day 3 to Day 5', 2 * D, 5 * D, 'Day 3 to Day 5'],
    ['between Day 3 and Day 4', 2 * D, 4 * D, 'Day 3 to Day 4'],
    ['Day 3 – Day 5', 2 * D, 5 * D, 'Day 3 to Day 5'],
    ['2 days ago', 18 * D, 19 * D, 'Day 19'],
    ['5 hours ago', now - 300, now - 300, 'Day 21, 05:00'],
    ['300 years ago', 20 * D - 300 * 365 * D, 21 * D - 300 * 365 * D, '300 years before Day 1'],
    ['3 years before', -3 * 365 * D, -3 * 365 * D + D, '3 years before Day 1'],
    ['a tenday before', -10 * D, -9 * D, '10 days before Day 1'],
    ['today', 20 * D, 21 * D, 'Day 21'],
  ];
  for (const [text, from, to, back] of cases) {
    const w = parseWhen(text, null, { now });
    assert.deepEqual([w.from, w.to], [from, to], text);
    assert.equal(whenText(w, null), back, text);
  }
  assert.deepEqual(parseWhen('in the age of dragons', null, { now }), { text: 'in the age of dragons', from: null, to: null });
  assert.equal(whenText(parseWhen('in the age of dragons')), 'in the age of dragons', 'kept as written');
  assert.equal(parseWhen('3 Mirtul 1492', null).from, null, 'no calendar, no months');
  assert.equal(parseWhen('  '), null);
  assert.equal(whenKey(null), Infinity);
  assert.ok(whenKey(parseWhen('Day 2')) < whenKey(parseWhen('Day 3')));
});

test('wiki time: with Harptos', () => {
  const h = calendarPreset('harptos'); // Day 1 is 1 Hammer 1492 DR
  const mirtul = 122 * D;
  const cases = [
    ['3 Mirtul 1492', mirtul + 2 * D, mirtul + 3 * D, '3 Mirtul 1492 DR'],
    ['3 Mirtul 1492 DR, 18:30', mirtul + 2 * D + 1110, mirtul + 2 * D + 1110, '3 Mirtul 1492 DR, 18:30'],
    ['Mirtul 3, 1492', mirtul + 2 * D, mirtul + 3 * D, '3 Mirtul 1492 DR'],
    ['the 3rd of Mirtul', mirtul + 2 * D, mirtul + 3 * D, '3 Mirtul 1492 DR'],
    ['3 Mirtul 1492 at dusk', mirtul + 2 * D + 1080, mirtul + 2 * D + 1200, '3 Mirtul 1492 DR dusk'],
    ['Mirtul 1492', mirtul, mirtul + 30 * D, 'Mirtul 1492 DR'],
    ['Midsummer 1492', 212 * D, 213 * D, 'Midsummer 1492 DR'],
    ['1 to 3 Mirtul 1492', mirtul, mirtul + 3 * D, '1 Mirtul 1492 DR to 3 Mirtul 1492 DR'],
    ['1492 DR', 0, 366 * D, '1492 DR'],
    ['year 1489', -(365 * 3) * D, -(365 * 2) * D, '1489 DR'],
    ['Day 12', 11 * D, 12 * D, '12 Hammer 1492 DR'],
  ];
  for (const [text, from, to, back] of cases) {
    const w = parseWhen(text, h, { now });
    assert.deepEqual([w.from, w.to], [from, to], text);
    assert.equal(whenText(w, h), back, text);
  }
  assert.equal(parseWhen('31 Mirtul 1492', h).from, null, 'no such day');
  assert.equal(whenText(parseWhen('300 years ago', h, { now })), '300 years before Day 1', 'no calendar given: said from Day 1');
  assert.equal(whenText(parseWhen('300 years ago', h, { now }), h), '1192 DR', 'that year');
  assert.equal(whenText(parseWhen('2 months ago', h, { now }), h), 'Uktar 1491 DR', 'that month (61 days back, past Nightal and the Feast of the Moon)');
});

test('wiki time: Gregorian-like weekdays are read past', () => {
  const g = calendarPreset('gregorian'); // Day 1 is 1 January 1200
  const w = parseWhen('Monday 3 January 1200', g);
  assert.deepEqual([w.from, w.to], [2 * D, 3 * D]);
  assert.match(whenText(w, g), /3 January 1200$/);
});

test('wiki time: the Timeline scale names hours, days, months and years by the calendar, and finds full moons', async () => {
  const { timeTicks, fullMoons } = await import('../src/wiki-time.js');
  const h = calendarPreset('harptos');
  const labels = (from, to, px, cal) => timeTicks(from, to, px, cal).map((t) => `${t.label}${t.major ? '*' : ''}`);
  assert.deepEqual(labels(0, 2 * D, 0.05, h), ['Hammer 1492 DR*', '2', '3'], 'a day each; the first names its month');
  assert.deepEqual(labels(0, 2 * D, 0.05, null), ['Day 1*', 'Day 2', 'Day 3']);
  assert.deepEqual(labels(0, D / 2, 2, null).slice(0, 3), ['Day 1*', '01:00', '02:00'], 'hours');
  assert.deepEqual(labels(0, 400 * D, 1000 / (400 * D), h).slice(0, 3), ['1492 DR*', 'Alturiak', 'Ches'], 'months, festival days left out');
  assert.deepEqual(labels(-300 * 365 * D, 30 * D, 1000 / (300 * 365 * D), h).slice(0, 2), ['1200 DR', '1250 DR'], 'years');
  assert.deepEqual(labels(-300 * 365 * D, 30 * D, 1000 / (300 * 365 * D), null).at(-1), 'Day 1*');
  assert.deepEqual(fullMoons(0, 70 * D, h).map((m) => m.at / D), [0, 30, 61]);
  assert.deepEqual(fullMoons(0, 500 * D, h), [], 'not over long spans');
});
