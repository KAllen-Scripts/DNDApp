/**
 * The campaign's calendar (wiki space stage 4a): each preset's months, leap years and moons, the clock's
 * text with and without a calendar, and an old campaign (no calendar) reading as it always did.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarPreset, clockOf, dateOf, dateText, isLeapYear, monthLengths, normalizeCalendar } from '../src/calendar.js';
import { clockText, normalizeSettings } from '../src/settings.js';

const at = (cal, days, hour = 0) => days * 1440 + hour * 60;
const starting = (preset, start) => normalizeCalendar({ ...calendarPreset(preset), start });

test('calendar: no calendar reads Day N, as old campaigns always have', () => {
  assert.equal(clockText(13 * 1440 + 18 * 60 + 30), 'Day 14, 18:30');
  assert.equal(clockText(13 * 1440 + 18 * 60 + 30, null), 'Day 14, 18:30');
  assert.equal(normalizeSettings({}).calendar, null);
  assert.equal(normalizeSettings({ weight: 'variant' }).calendar, null, 'settings saved before calendars have none');
  assert.equal(normalizeCalendar({ months: [{ name: 'Empty', days: 0 }] }), null, 'no days, no calendar');
});

test('calendar: Harptos, its festivals, Shieldmeet every fourth year, seasons and Selûne', () => {
  const h = calendarPreset('harptos');
  assert.equal(monthLengths(h, 1491).reduce((a, b) => a + b), 365);
  assert.equal(monthLengths(h, 1492).reduce((a, b) => a + b), 366, '1492 has Shieldmeet');
  assert.equal(clockText(at(h, 0, 8), h), '1 Hammer 1492 DR, 08:00 · Full moon');
  assert.equal(dateText(at(h, 30), h), 'Midwinter 1492 DR', 'a festival is named on its own');
  assert.equal(dateText(at(h, 31), h), '1 Alturiak 1492 DR');
  // Hammer, Midwinter, Alturiak, Ches, Tarsakh, Greengrass: 122 days, then Mirtul.
  assert.equal(dateText(at(h, 124), h), '3 Mirtul 1492 DR');
  const midsummer = 30 + 1 + 30 * 3 + 1 + 30 * 3;
  assert.equal(dateText(at(h, midsummer), h), 'Midsummer 1492 DR');
  assert.equal(dateText(at(h, midsummer + 1), h), 'Shieldmeet 1492 DR');
  assert.equal(dateText(at(h, midsummer + 2), h), '1 Eleasis 1492 DR');
  const y93 = starting('harptos', { year: 1493, month: 0, day: 1 });
  assert.equal(dateText(at(y93, midsummer + 1), y93), '1 Eleasis 1493 DR', 'no Shieldmeet in 1493');
  assert.equal(dateOf(at(h, 124), h).season, 'Spring');
  assert.equal(dateOf(at(h, 10), h).season, 'Winter', 'before the year\'s first season, last year\'s last');
  // Selûne: full every 30.4375 days, so at the start of every fourth year again.
  assert.equal(dateOf(at(h, 1461), h).moons[0].phase, 'Full');
  assert.equal(dateOf(at(h, 15), h).moons[0].phase, 'New');
  assert.equal(dateOf(at(h, 7), h).moons[0].phase, 'Last quarter');
});

test('calendar: Gregorian-like leap years, weekdays and the moon', () => {
  const g = starting('gregorian', { year: 2024, month: 0, day: 1 });
  assert.deepEqual([2024, 2023, 1900, 2000].map((y) => isLeapYear(g, y)), [true, false, false, true]);
  assert.equal(dateText(at(g, 59), g), 'Thursday 29 February 2024');
  assert.equal(dateText(at(g, 366), g), 'Wednesday 1 January 2025');
  assert.equal(dateText(at(g, 366 + 44), g), 'Friday 14 February 2025');
  assert.equal(clockText(at(g, 10, 6), g), 'Thursday 11 January 2024, 06:00 · New moon');
  assert.deepEqual(dateOf(at(g, 0), g).holidays, ['New Year’s Day']);
  assert.equal(clockOf(g, { year: 2024, month: 1, day: 29 }), 59 * 1440);
  assert.equal(clockOf(g, { year: 2023, month: 1, day: 29 }), null, 'not a day that year');
  assert.equal(clockOf(g, { year: 2023, month: 0, day: 1 }), null, 'before day 1');
});

test('calendar: Exandria, two moons, and a calendar of one\'s own made safe', () => {
  const e = calendarPreset('exandria');
  assert.equal(monthLengths(e, 836).reduce((a, b) => a + b), 328);
  assert.equal(dateText(at(e, 328), e), 'Conthsen 1 Horisal 837 PD');
  assert.equal(clockText(0, e), 'Folsen 1 Horisal 836 PD, 00:00 · Ruidus full', 'two moons: each by name');

  const own = normalizeCalendar({ months: [{ name: 'Long', days: 5000 }, { name: ' Short ', days: 10, leap: 2 }], leap: { every: 3 }, start: { year: 3, month: 1, day: 12 }, moons: [{ name: '', days: 5 }], junk: 1 });
  assert.equal(own.months[0].days, 30, 'a month can\'t have 5000 days');
  assert.equal(own.months[1].name, 'Short');
  assert.deepEqual(own.start, { year: 3, month: 1, day: 12 }, 'year 3 is a leap year: Short has 12 days');
  assert.deepEqual(own.moons, [], 'a moon needs a name');
  assert.equal(own.junk, undefined);
  assert.equal(own.preset, 'custom');
  assert.deepEqual(normalizeCalendar({ months: [{ name: 'Short', days: 10, leap: 2 }], leap: { every: 3 }, start: { year: 4, day: 12 } }).start, { year: 4, month: 0, day: 1 });
});
