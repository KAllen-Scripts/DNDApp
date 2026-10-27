/**
 * In-game times on the wiki (stage 4b): what the DM or the AI writes ("Day 12 night", "3 Mirtul 1492",
 * "300 years ago", "Day 3 to Day 5") read into minutes of the campaign's clock (0 = the start of Day 1;
 * before it is negative), and written back. Shared, so the editor can say what a time reads as while the
 * server keeps what it worked out when the page was saved.
 *
 * A time is { text, from, to }: `from` and `to` in minutes (`to` is where it ends; the same as `from` for a
 * moment), or both null when the text isn't a time the parser knows ("in the age of dragons"): the text is
 * kept, and the Timeline puts it with the undated.
 */
import { dateOf, dateText, monthLengths, epochDay } from './calendar.js';

const DAY = 1440;
const mod = (n, m) => ((n % m) + m) % m;
const pad = (n) => String(n).padStart(2, '0');

/** Parts of a day: [start hour, end hour] (a moment when they're the same). */
export const DAY_PARTS = {
  dawn: [5, 7], morning: [6, 12], noon: [12, 12], midday: [12, 12], afternoon: [12, 18], dusk: [18, 20], evening: [18, 22], night: [22, 30], midnight: [0, 0],
};
const PART_ORDER = ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'evening', 'night', 'midnight'];

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, fifty: 50, hundred: 100, 'a hundred': 100, thousand: 1000, 'a thousand': 1000 };
const fold = (s) => s.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A time of day: "21:00", "9pm", "9:30 pm", "at dusk", "night" → [start, end] minutes into the day, or null. */
function timeOfDay(s) {
  const t = fold(s).replace(/^(at|in the|by|,)\s*/, '').replace(/^the\s+/, '');
  if (!t) return null;
  let m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (m) {
    let hour = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (m[3] === 'pm' && hour < 12) hour += 12;
    if (m[3] === 'am' && hour === 12) hour = 0;
    if (!m[2] && !m[3]) return null; // "12" alone is a day, not a time
    if (hour > 24 || min > 59) return null;
    return [hour * 60 + min, hour * 60 + min];
  }
  m = t.match(/^(dawn|morning|noon|midday|afternoon|dusk|evening|night|midnight)$/);
  if (m) return DAY_PARTS[m[1]].map((h) => h * 60);
  return null;
}

/** A day (minutes at its start) plus an optional time of day after it: { from, to }, or null. */
function onDay(start, rest) {
  if (!rest?.trim()) return { from: start, to: start + DAY };
  const t = timeOfDay(rest);
  return t ? { from: start + t[0], to: start + t[1] } : null;
}

const UNITS = { year: 'year', years: 'year', month: 'month', months: 'month', week: 'week', weeks: 'week', tenday: 'tenday', tendays: 'tenday', day: 'day', days: 'day', hour: 'hour', hours: 'hour' };

/** How many minutes a unit is, by the calendar (its average year and month) or 365 and 30 days. */
function unitMinutes(unit, calendar) {
  let yearDays = 365;
  let monthDays = 30;
  if (calendar) {
    const span = 400;
    yearDays = (epochDay(calendar, { year: span, month: 0, day: 1 }) - epochDay(calendar, { year: 0, month: 0, day: 1 })) / span;
    const real = calendar.months.filter((m) => m.days > 1 || !m.festival);
    monthDays = yearDays / Math.max(1, real.length);
  }
  return { year: yearDays * DAY, month: monthDays * DAY, week: 7 * DAY, tenday: 10 * DAY, day: DAY, hour: 60 }[unit];
}

/** The calendar's month whose name starts `s` (the longest name that fits): { month, rest }, or null. */
function monthAt(calendar, s) {
  const names = calendar.months.map((m, i) => ({ i, name: fold(m.name) })).sort((a, b) => b.name.length - a.name.length);
  for (const { i, name } of names) {
    const m = s.match(new RegExp(`^${escape(name)}(?![a-z])\\s*,?\\s*(.*)$`));
    if (m) return { month: i, rest: m[1] };
  }
  return null;
}

/** A year, with or without the era after it: "1492", "1492 DR", "year 3". { year, rest } or null. */
function yearAt(calendar, s) {
  const era = calendar?.era ? fold(calendar.era) : '';
  const m = s.match(new RegExp(`^(?:year\\s+)?(-?\\d{1,7})(?:\\s*${era ? escape(era) : '(?!)'})?(?![\\d:])\\s*,?\\s*(.*)$`));
  return m ? { year: Number(m[1]), rest: m[2] } : null;
}

/** A whole month of a year (or the whole year with no month): { from, to }, or null for a month with no days that year. */
function wholeOf(calendar, year, month) {
  const lengths = monthLengths(calendar, year);
  const start = epochDay(calendar, calendar.start);
  if (month != null) {
    if (!lengths[month]) return null;
    const from = (epochDay(calendar, { year, month, day: 1 }) - start) * DAY;
    return { from, to: from + lengths[month] * DAY };
  }
  const from = (epochDay(calendar, { year, month: lengths.findIndex((n) => n > 0), day: 1 }) - start) * DAY;
  return { from, to: from + lengths.reduce((a, b) => a + b, 0) * DAY };
}

/** One time (not a range), or null. */
function single(raw, calendar, now) {
  let s = fold(raw).replace(/[.]$/, '');
  if (!s) return null;
  if (s === 'now') return { from: now, to: now };
  if (s === 'today') return { from: Math.floor(now / DAY) * DAY, to: Math.floor(now / DAY) * DAY + DAY };

  // "300 years ago", "a tenday ago", "3 years before" (Day 1), "2 days later" (than now)
  let m = s.match(/^(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|fifty|a hundred|hundred|a thousand|thousand)\s+([a-z]+)\s+(ago|before|before day 1|before the campaign|later|from now)$/);
  if (m && UNITS[m[2]]) {
    const unit = UNITS[m[2]];
    const n = Number(m[1]) || WORDS[m[1]];
    const span = Math.round(n * unitMinutes(unit, calendar));
    const at = m[3].startsWith('before') ? -span : m[3] === 'ago' ? now - span : now + span;
    if (unit === 'hour') return { from: at, to: at };
    // As near as it says: "300 years ago" is that year (with a calendar), "3 months ago" that month, "2 days ago" that day.
    if (calendar && (unit === 'year' || unit === 'month')) {
      const d = dateOf(at, calendar);
      return wholeOf(calendar, d.year, unit === 'month' ? d.month : null);
    }
    const day = Math.floor(at / DAY) * DAY;
    return { from: day, to: day + DAY };
  }

  // "Day 12", "Day 12, 21:00", "Day 12 night", "the night of Day 12"
  m = s.match(/^(?:the\s+)?(dawn|morning|noon|midday|afternoon|dusk|evening|night|midnight)\s+of\s+(day\s+-?\d+)$/);
  if (m) s = `${m[2]} ${m[1]}`;
  m = s.match(/^day\s+(-?\d+)\s*,?\s*(.*)$/);
  if (m) return onDay((Number(m[1]) - 1) * DAY, m[2]);

  if (!calendar) return null;
  // A weekday in front says nothing more.
  for (const w of calendar.weekdays) {
    const k = fold(w);
    if (s.startsWith(`${k} `) || s.startsWith(`${k},`)) s = s.slice(k.length).replace(/^,?\s*/, '');
  }
  const nowDate = dateOf(now, calendar);
  const at = (year, month, day, rest) => {
    if (!(day >= 1 && day <= monthLengths(calendar, year)[month])) return null;
    return onDay((epochDay(calendar, { year, month, day }) - epochDay(calendar, calendar.start)) * DAY, rest); // before Day 1 too
  };
  const whole = (year, month) => wholeOf(calendar, year, month);

  // "3 Mirtul 1492", "the 3rd of Mirtul", "3 Mirtul, 18:30"
  m = s.match(/^(?:the\s+)?(\d{1,3})(?:st|nd|rd|th)?\s+(?:of\s+)?(.*)$/);
  if (m) {
    const mo = monthAt(calendar, m[2]);
    if (mo) {
      const y = yearAt(calendar, mo.rest);
      return at(y ? y.year : nowDate.year, mo.month, Number(m[1]), y ? y.rest : mo.rest);
    }
  }
  const mo = monthAt(calendar, s);
  if (mo) {
    // "Mirtul 3, 1492", "Mirtul 3"
    const d = mo.rest.match(/^(\d{1,3})(?:st|nd|rd|th)?(?!\d)\s*,?\s*(.*)$/);
    const y = yearAt(calendar, mo.rest);
    if (d && !(y && String(y.year) === d[1] && /^\d{4}/.test(mo.rest))) {
      const y2 = yearAt(calendar, d[2]);
      return at(y2 ? y2.year : nowDate.year, mo.month, Number(d[1]), y2 ? y2.rest : d[2]);
    }
    // "Midsummer 1492" (a festival day), "Mirtul 1492" (the whole month)
    const year = y ? y.year : nowDate.year;
    const rest = y ? y.rest : mo.rest;
    const days = monthLengths(calendar, year)[mo.month];
    if (days === 1) return at(year, mo.month, 1, rest);
    return rest ? null : whole(year, mo.month);
  }
  // "1489 DR", "year 1489": the whole year
  const y = yearAt(calendar, s);
  if (y && !y.rest && (/^year\s/.test(s) || (calendar.era && new RegExp(`${escape(fold(calendar.era))}$`).test(s)) || /^-?\d{3,}$/.test(s))) return whole(y.year, null);
  return null;
}

/** Read a time: { text, from, to }, with from and to null when it isn't one the parser knows. `now` is the clock. */
export function parseWhen(text, calendar = null, { now = 0 } = {}) {
  const t = String(text ?? '').trim().slice(0, 200);
  const none = { text: t, from: null, to: null };
  if (!t) return null;
  const one = single(t, calendar, now);
  if (one) return { text: t, ...one };
  // A range: "Day 3 to Day 5", "from 1 Mirtul to 3 Mirtul 1492", "between Day 3 and Day 5", "Day 3 – Day 5"
  const s = fold(t).replace(/^(from|between)\s+/, '');
  for (const sep of [/\s+(?:to|until|till|through)\s+/, /\s+and\s+/, /\s*[–—]\s*/, /\s+-\s+/]) {
    const parts = s.split(sep);
    if (parts.length !== 2) continue;
    const b = single(parts[1], calendar, now);
    // "3 to 5 Mirtul 1492": the first takes the rest from the second
    let a = single(parts[0], calendar, now);
    if (!a && b && /^\d{1,3}(st|nd|rd|th)?$/.test(parts[0].trim())) a = single(parts[1].replace(/^\d{1,3}(st|nd|rd|th)?/, parts[0].trim()), calendar, now);
    if (a && b && b.to >= a.from) return { text: t, from: a.from, to: b.to };
  }
  return none;
}

/** Where a time sits on the clock, for sorting: undated ones last. */
export const whenKey = (w) => (w && w.from != null ? w.from : Infinity);

const timeText = (m) => `${pad(Math.floor(mod(m, DAY) / 60))}:${pad(mod(m, DAY) % 60)}`;

/** A day as people say it, before Day 1 too (with no calendar: "40 days before Day 1"). */
function dayText(m, calendar) {
  if (calendar || m >= 0) return dateText(m, calendar);
  const days = Math.ceil(-m / DAY);
  if (days >= 365 * 2) return `${Math.round(days / 365)} years before Day 1`;
  return `${days} day${days === 1 ? '' : 's'} before Day 1`;
}

/** A time as people say it: "3 Mirtul 1492 DR", "Day 12 night", "Mirtul 1492 DR", "Day 3 to Day 5", or the text kept. */
export function whenText(when, calendar = null) {
  if (!when) return '';
  if (when.from == null) return when.text ?? '';
  const { from, to } = when;
  const startOfDay = (m) => mod(m, DAY) === 0;
  if (!calendar && from < 0 && to < DAY) return dayText(from, null);
  if (to === from) return `${dayText(from, calendar)}${calendar || from >= 0 ? `, ${timeText(from)}` : ''}`;
  if (startOfDay(from) && startOfDay(to)) {
    if (to - from === DAY) return dayText(from, calendar);
    if (calendar) {
      const a = dateOf(from, calendar);
      const b = dateOf(to, calendar);
      const era = calendar.era ? ` ${calendar.era}` : '';
      if (a.day === 1 && b.day === 1) {
        const firstMonth = monthLengths(calendar, a.year).findIndex((n) => n > 0);
        if (a.month === firstMonth && b.year === a.year + 1 && b.month === monthLengths(calendar, b.year).findIndex((n) => n > 0)) return `${a.year}${era}`;
        const next = calendar.months.findIndex((_, i) => i > a.month && monthLengths(calendar, a.year)[i] > 0);
        if ((next === -1 ? b.year === a.year + 1 : b.year === a.year && b.month === next)) return `${a.monthName} ${a.year}${era}`;
      }
    }
    return `${dayText(from, calendar)} to ${dayText(to - DAY, calendar)}`;
  }
  // Part of one day: "Day 12 night"
  const day = Math.floor(from / DAY) * DAY;
  for (const part of PART_ORDER) {
    const [a, b] = DAY_PARTS[part];
    if (a !== b && from === day + a * 60 && to === day + b * 60) return `${dayText(day, calendar)} ${part}`;
  }
  return `${dayText(from, calendar)}, ${timeText(from)} to ${Math.floor(to / DAY) === Math.floor(from / DAY) ? '' : `${dayText(to, calendar)}, `}${timeText(to)}`;
}
