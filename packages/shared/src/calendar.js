/**
 * The campaign's calendar (wiki space stage 4a): one calendar for the whole app, so the map's clock, travel,
 * rests, map events and the wiki's times all read the same dates. A campaign has none at first, and the clock
 * reads "Day 14, 18:30" as it always has; the DM can pick a preset (Harptos, Gregorian-like, Exandria) or make
 * their own in Campaign settings.
 *
 * The clock stays a count of minutes since day 1 began; the calendar only says what to call a day:
 *   { preset, name, months: [{ name, days, leap, festival }], leap: { every, except, unless } | null,
 *     weekdays: [name], weekday: n, start: { year, month, day }, era,
 *     moons: [{ name, days, full }], seasons: [{ name, month, day }], holidays: [{ name, month, day }] }
 * - a month's `leap` days are added in a leap year (Harptos's Shieldmeet is a 0-day month with leap 1), and a
 *   `festival` is a day between months, named on its own ("Midsummer 1492 DR")
 * - a leap year is one `every` years, but not one `except` years unless it's also one `unless` years
 * - `start` is the date of clock day 1; `weekday` is the weekday of the first day of year 0
 * - a moon is full on day `full` (counting from the first day of year 0, fractions allowed) and every `days` after
 * - months in `start`, seasons and holidays count from 0; days from 1
 */

export const MAX_MONTHS = 40;
export const MAX_WEEKDAYS = 20;
export const MAX_MOONS = 4;
export const MAX_SEASONS = 12;
export const MAX_HOLIDAYS = 100;
const MAX_YEAR = 1_000_000;

const harptosMonth = (name, days = 30) => ({ name, days });
const festival = (name, leap = 0) => ({ name, days: leap ? 0 : 1, leap, festival: true });

/** The presets the DM can start from (Simple is no calendar at all). Exandria's is written from memory: check it against your book. */
export const CALENDAR_PRESETS = {
  harptos: {
    name: 'Calendar of Harptos (Forgotten Realms)',
    months: [
      harptosMonth('Hammer'), festival('Midwinter'), harptosMonth('Alturiak'), harptosMonth('Ches'), harptosMonth('Tarsakh'), festival('Greengrass'),
      harptosMonth('Mirtul'), harptosMonth('Kythorn'), harptosMonth('Flamerule'), festival('Midsummer'), festival('Shieldmeet', 1), harptosMonth('Eleasis'),
      harptosMonth('Eleint'), festival('Highharvestide'), harptosMonth('Marpenoth'), harptosMonth('Uktar'), festival('Feast of the Moon'), harptosMonth('Nightal'),
    ],
    leap: { every: 4, except: 0, unless: 0 },
    weekdays: [],
    weekday: 0,
    start: { year: 1492, month: 0, day: 1 },
    era: 'DR',
    // A tenday-year of 365¼ days is 12 of Selûne's months to the day: she is full at the start of every fourth year.
    moons: [{ name: 'Selûne', days: 30.4375, full: 0.5 }],
    seasons: [{ name: 'Spring', month: 3, day: 19 }, { name: 'Summer', month: 7, day: 20 }, { name: 'Autumn', month: 12, day: 21 }, { name: 'Winter', month: 17, day: 20 }],
    holidays: [],
  },
  gregorian: {
    name: 'Gregorian-like',
    months: [
      { name: 'January', days: 31 }, { name: 'February', days: 28, leap: 1 }, { name: 'March', days: 31 }, { name: 'April', days: 30 },
      { name: 'May', days: 31 }, { name: 'June', days: 30 }, { name: 'July', days: 31 }, { name: 'August', days: 31 },
      { name: 'September', days: 30 }, { name: 'October', days: 31 }, { name: 'November', days: 30 }, { name: 'December', days: 31 },
    ],
    leap: { every: 4, except: 100, unless: 400 },
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    weekday: 5, // 1 January of year 0 (1 BC) was a Saturday
    start: { year: 1200, month: 0, day: 1 },
    era: '',
    moons: [{ name: 'The moon', days: 29.530589, full: 7.3448 }],
    seasons: [{ name: 'Spring', month: 2, day: 20 }, { name: 'Summer', month: 5, day: 21 }, { name: 'Autumn', month: 8, day: 22 }, { name: 'Winter', month: 11, day: 21 }],
    holidays: [{ name: 'New Year’s Day', month: 0, day: 1 }, { name: 'Midsummer’s Eve', month: 5, day: 23 }],
  },
  exandria: {
    name: 'Exandrian calendar',
    months: [
      { name: 'Horisal', days: 29 }, { name: 'Misuthar', days: 30 }, { name: 'Dualahei', days: 30 }, { name: 'Thunsheer', days: 31 },
      { name: 'Unndilar', days: 28 }, { name: 'Brussendar', days: 31 }, { name: 'Sydenstar', days: 32 }, { name: 'Fessuran', days: 29 },
      { name: 'Quen’pillar', days: 27 }, { name: 'Cuersaar', days: 29 }, { name: 'Duscar', days: 32 },
    ],
    leap: null,
    weekdays: ['Miresen', 'Grissen', 'Whelsen', 'Conthsen', 'Folsen', 'Yulisen', 'Da’leysen'],
    weekday: 0,
    start: { year: 836, month: 0, day: 1 },
    era: 'PD',
    moons: [{ name: 'Catha', days: 33, full: 0 }, { name: 'Ruidus', days: 328, full: 0 }],
    seasons: [],
    holidays: [{ name: 'New Dawn', month: 0, day: 1 }, { name: 'Hillsgold', month: 0, day: 27 }, { name: 'Day of Challenging', month: 1, day: 7 }],
  },
};

/** The names the settings show for each choice ('' is no calendar). */
export const CALENDAR_CHOICES = { '': 'Simple: Day 1, Day 2…', harptos: CALENDAR_PRESETS.harptos.name, gregorian: CALENDAR_PRESETS.gregorian.name, exandria: CALENDAR_PRESETS.exandria.name, custom: 'My own' };

/** A fresh copy of a preset ('custom' starts from twelve months of 30 days). */
export function calendarPreset(preset) {
  if (preset === 'custom') {
    return normalizeCalendar({ preset: 'custom', name: 'My calendar', months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })), weekdays: [], start: { year: 1, month: 0, day: 1 }, moons: [{ name: 'The moon', days: 30, full: 0 }] });
  }
  return CALENDAR_PRESETS[preset] ? normalizeCalendar({ preset, ...structuredClone(CALENDAR_PRESETS[preset]) }) : null;
}

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, min, max, d) => (Number.isInteger(v) && v >= min && v <= max ? v : d);
const num = (v, min, max, d) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : d);

/** A calendar with anything unknown dropped and the rest made safe; null (Simple) if it has no months worth having. */
export function normalizeCalendar(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.months)) return null;
  const months = c.months.slice(0, MAX_MONTHS).map((m, i) => ({
    name: text(m?.name, 40) || `Month ${i + 1}`,
    days: int(m?.days, 0, 400, 30),
    ...(int(m?.leap, 1, 10, 0) && { leap: m.leap }),
    ...(m?.festival === true && { festival: true }),
  }));
  if (!months.some((m) => m.days > 0)) return null;
  const leapRule = c.leap && int(c.leap.every, 1, 10_000, 0)
    ? { every: c.leap.every, except: int(c.leap.except, 0, 10_000, 0), unless: int(c.leap.unless, 0, 10_000, 0) }
    : null;
  const dated = (list, max) => (Array.isArray(list) ? list : []).slice(0, max)
    .map((x) => ({ name: text(x?.name, 60), month: int(x?.month, 0, months.length - 1, 0), day: int(x?.day, 1, 400, 1) }))
    .filter((x) => x.name);
  const weekdays = (Array.isArray(c.weekdays) ? c.weekdays : []).slice(0, MAX_WEEKDAYS).map((w) => text(w, 30)).filter(Boolean);
  const cal = {
    preset: c.preset in CALENDAR_PRESETS || c.preset === 'custom' ? c.preset : 'custom',
    name: text(c.name, 60),
    months,
    leap: leapRule,
    weekdays,
    weekday: int(c.weekday, 0, Math.max(0, weekdays.length - 1), 0),
    start: { year: int(c.start?.year, -MAX_YEAR, MAX_YEAR, 1), month: 0, day: 1 },
    era: text(c.era, 12),
    moons: (Array.isArray(c.moons) ? c.moons : []).slice(0, MAX_MOONS)
      .map((m) => ({ name: text(m?.name, 40), days: num(m?.days, 1, 10_000, 0), full: num(m?.full, -1e9, 1e9, 0) }))
      .filter((m) => m.name && m.days),
    seasons: dated(c.seasons, MAX_SEASONS),
    holidays: dated(c.holidays, MAX_HOLIDAYS),
  };
  // The start date has to be a day the calendar has (in its year).
  const month = int(c.start?.month, 0, months.length - 1, 0);
  const lengths = monthLengths(cal, cal.start.year);
  if (lengths[month] > 0) Object.assign(cal.start, { month, day: int(c.start?.day, 1, lengths[month], 1) });
  else cal.start.month = lengths.findIndex((n) => n > 0);
  return cal;
}

// ---------- the arithmetic ----------

/** Whether `year` is a leap year. */
export function isLeapYear(cal, year) {
  const l = cal?.leap;
  if (!l) return false;
  const on = (n) => n > 0 && ((year % n) + n) % n === 0;
  return on(l.every) && !(on(l.except) && !on(l.unless));
}

/** The days in each month of `year`. */
export const monthLengths = (cal, year) => {
  const leap = isLeapYear(cal, year);
  return cal.months.map((m) => m.days + (leap ? m.leap ?? 0 : 0));
};

const yearLength = (cal, year) => monthLengths(cal, year).reduce((a, b) => a + b, 0);

/** The years after which the leap years start over, and the days in them. */
function cycle(cal) {
  const l = cal.leap;
  const years = !l ? 1 : l.unless || l.except || l.every;
  let days = 0;
  for (let y = 0; y < years; y++) days += yearLength(cal, y);
  return { years, days };
}

/** The days from the first day of year 0 to the first day of `year` (negative before it). */
function yearStart(cal, year, c = cycle(cal)) {
  const q = Math.floor(year / c.years);
  let days = q * c.days;
  for (let y = q * c.years; y < year; y++) days += yearLength(cal, y);
  return days;
}

/** The day (counting from the first day of year 0) of a date. */
export function epochDay(cal, { year, month, day }) {
  const lengths = monthLengths(cal, year);
  let days = yearStart(cal, year);
  for (let i = 0; i < month; i++) days += lengths[i];
  return days + day - 1;
}

/** The date of a day counted from the first day of year 0: { year, month, day }. */
function dateOfEpoch(cal, e) {
  const c = cycle(cal);
  let year = Math.floor(e / c.days) * c.years;
  let rest = e - yearStart(cal, year, c);
  while (rest >= yearLength(cal, year)) rest -= yearLength(cal, year++);
  const lengths = monthLengths(cal, year);
  let month = 0;
  while (rest >= lengths[month]) rest -= lengths[month++];
  return { year, month, day: rest + 1 };
}

/** How full a moon is on a day, as the part of its month gone since it was full (0 full, 0.5 new). */
export const moonAge = (moon, e) => ((((e - moon.full) % moon.days) + moon.days) % moon.days) / moon.days;

const PHASES = ['Full', 'Waning gibbous', 'Last quarter', 'Waning crescent', 'New', 'Waxing crescent', 'First quarter', 'Waxing gibbous'];
/** A moon's phase on a day (counting from year 0), by name; "Full" and "New" only on the day it turns. */
export function moonPhase(moon, e) {
  const has = (at) => ((((at - e) % moon.days) + moon.days) % moon.days) < 1; // the moment falls within the day
  if (has(moon.full)) return 'Full';
  if (has(moon.full + moon.days / 2)) return 'New';
  const age = moonAge(moon, e + 0.5);
  return PHASES[[1, 2, 3, 3, 5, 6, 7, 7][Math.floor(age * 8)]];
}

/**
 * Everything about the day `minutes` falls on: { year, month, day, monthName, festival, weekday, season, holidays,
 * moons: [{ name, phase }], epoch, hour, minute }. Null without a calendar.
 */
export function dateOf(minutes, cal) {
  if (!cal) return null;
  const clockDay = Math.floor(minutes / 1440);
  const e = epochDay(cal, cal.start) + clockDay;
  const d = dateOfEpoch(cal, e);
  const m = cal.months[d.month];
  const at = (x) => epochDay(cal, { year: d.year, month: x.month, day: Math.min(x.day, monthLengths(cal, d.year)[x.month] || 1) });
  const seasons = cal.seasons.map((s) => ({ ...s, e: at(s) })).sort((a, b) => a.e - b.e);
  // The season that began last (in the year before, before this year's first).
  const season = (seasons.filter((s) => s.e <= e).pop() ?? seasons.at(-1))?.name ?? null;
  const mins = ((minutes % 1440) + 1440) % 1440;
  return {
    ...d,
    monthName: m.name,
    festival: !!m.festival,
    weekday: cal.weekdays.length ? cal.weekdays[(((e + cal.weekday) % cal.weekdays.length) + cal.weekdays.length) % cal.weekdays.length] : null,
    season,
    holidays: cal.holidays.filter((x) => x.month === d.month && x.day === d.day).map((x) => x.name),
    moons: cal.moons.map((moon) => ({ name: moon.name, phase: moonPhase(moon, e) })),
    epoch: e,
    hour: Math.floor(mins / 60),
    minute: mins % 60,
  };
}

/** The clock (minutes) at the start of a date, or null if it's before day 1 or not a day the calendar has. */
export function clockOf(cal, { year, month, day }) {
  if (!cal || !Number.isInteger(year) || !(month >= 0 && month < cal.months.length)) return null;
  if (!(day >= 1 && day <= monthLengths(cal, year)[month])) return null;
  const d = epochDay(cal, { year, month, day }) - epochDay(cal, cal.start);
  return d < 0 ? null : d * 1440;
}

const yearText = (cal, year) => `${year}${cal.era ? ` ${cal.era}` : ''}`;

/** A date as people say it: "3 Mirtul 1492 DR", "Midsummer 1492 DR", "Conthsen 3 Horisal 836 PD". */
export function dateText(minutes, cal) {
  const d = dateOf(minutes, cal);
  if (!d) return `Day ${Math.floor(minutes / 1440) + 1}`;
  const day = d.festival && cal.months[d.month].days + (cal.months[d.month].leap ?? 0) <= 1 ? d.monthName : `${d.day} ${d.monthName}`;
  return `${d.weekday ? `${d.weekday} ` : ''}${day} ${yearText(cal, d.year)}`;
}

/** The moons worth a mention on a day: "Full moon", or with more than one moon "Catha full, Ruidus new". */
export function moonText(minutes, cal) {
  const d = dateOf(minutes, cal);
  const shown = (d?.moons ?? []).filter((m) => m.phase === 'Full' || m.phase === 'New');
  if (!shown.length) return '';
  if (cal.moons.length === 1) return `${shown[0].phase} moon`;
  return shown.map((m) => `${m.name} ${m.phase.toLowerCase()}`).join(', ');
}
