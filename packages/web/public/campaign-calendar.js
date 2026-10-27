/**
 * The campaign's calendar, in Campaign settings (campaign-settings.js): a preset to start from (Simple keeps
 * "Day 1, Day 2…"), and an editor for months, weekdays, the year, moons, seasons and holidays. It's kept in
 * the campaign's settings (`calendar`, shared/calendar.js), so the map's clock, travel, rests and the wiki
 * read the same dates.
 */
import { h } from './api.js';
import { CALENDAR_CHOICES, calendarPreset, dateText, normalizeCalendar } from './shared/calendar.js';
import { clockText } from './shared/settings.js';

const num = (v, d = 0) => (v === '' || !Number.isFinite(Number(v)) ? d : Number(v));

/**
 * The Calendar part of the settings dialog. `get()` gives the settings now; `save(patch, done)` saves (and
 * resolves to something other than false when it worked).
 */
export function calendarSection({ get, save }) {
  const box = h('div', { class: 'cal-settings' });
  const pick = h('select', { id: 'setting-calendar', 'aria-label': 'Calendar' }, Object.entries(CALENDAR_CHOICES).map(([v, n]) => new Option(n, v)));
  const says = h('p', { class: 'muted small', id: 'calendar-says' });
  let open = false;

  pick.addEventListener('change', () => {
    const calendar = pick.value ? calendarPreset(pick.value) : null;
    save({ calendar }, pick.value ? 'Saved. The clock reads this calendar now.' : 'Saved. The clock reads Day 1, Day 2… again.').then(draw);
  });

  const editor = (cal) => {
    const c = structuredClone(cal);
    const message = h('p', { class: 'muted small', role: 'status' });
    const input = (value, label, { type = 'text', max = 60, step } = {}) => {
      const el = h('input', { type, 'aria-label': label, ...(type === 'text' ? { maxLength: max } : { step: step ?? '1' }) });
      el.value = value ?? '';
      return el;
    };
    const fld = (label, el) => h('label', { class: 'fld' }, h('span', {}, label), el);
    const monthSelect = (value, label) => {
      const el = h('select', { 'aria-label': label }, c.months.map((m, i) => new Option(m.name, String(i))));
      el.value = String(value ?? 0);
      return el;
    };
    // A list of rows, each with its own fields; `read(row)` turns a row back into an item.
    const rows = (title, items, make, blank, max) => {
      const list = h('div', { class: 'cal-rows' });
      const add = (item) => {
        const { el, read } = make(item);
        const row = h('div', { class: 'cal-row' }, el, h('button', { type: 'button', class: 'ghost small', title: 'Remove', 'aria-label': `Remove from ${title}`, onclick: () => row.remove() }, '✕'));
        row.read = read;
        list.append(row);
      };
      items.forEach(add);
      return {
        el: h('fieldset', { class: 'cal-list' }, h('legend', {}, title), list,
          h('button', { type: 'button', class: 'ghost small', onclick: () => list.children.length < max && add(blank()) }, `+ Add`)),
        read: () => [...list.children].map((r) => r.read()),
      };
    };

    const name = input(c.name, 'Calendar name');
    const era = input(c.era, 'Era', { max: 12 });
    const year = input(c.start.year, 'Year of day 1', { type: 'number' });
    const startMonth = monthSelect(c.start.month, 'Month of day 1');
    const startDay = input(c.start.day, 'Day of the month of day 1', { type: 'number' });
    const weekdays = h('textarea', { rows: 2, maxLength: 800, 'aria-label': 'Weekdays' });
    weekdays.value = c.weekdays.join(', ');
    const leapEvery = input(c.leap?.every || '', 'Leap year every', { type: 'number' });
    const leapExcept = input(c.leap?.except || '', 'but not every', { type: 'number' });
    const leapUnless = input(c.leap?.unless || '', 'unless also every', { type: 'number' });
    const months = rows('Months (in order)', c.months, (m) => {
      const n = input(m.name, 'Month name', { max: 40 });
      const d = input(m.days, 'Days', { type: 'number' });
      const leap = input(m.leap || '', 'Extra days in a leap year', { type: 'number' });
      const fest = h('input', { type: 'checkbox', checked: !!m.festival, 'aria-label': 'A festival day between months' });
      return {
        el: h('div', { class: 'cal-fields' }, fld('Name', n), fld('Days', d), fld('Leap +', leap), h('label', { class: 'check' }, fest, ' Festival')),
        read: () => ({ name: n.value, days: num(d.value, 30), leap: num(leap.value), festival: fest.checked }),
      };
    }, () => ({ name: '', days: 30 }), 40);
    const moons = rows('Moons', c.moons, (m) => {
      const n = input(m.name, 'Moon name', { max: 40 });
      const d = input(m.days, 'Days from full to full', { type: 'number', step: 'any' });
      const full = input(m.full, 'Full on day (from year 0)', { type: 'number', step: 'any' });
      return {
        el: h('div', { class: 'cal-fields' }, fld('Name', n), fld('Days, full to full', d), fld('Full on day (counted from year 0)', full)),
        read: () => ({ name: n.value, days: num(d.value, 30), full: num(full.value) }),
      };
    }, () => ({ name: '', days: 30, full: 0 }), 4);
    const dated = (title, list, max) => rows(title, list, (x) => {
      const n = input(x.name, 'Name', { max: 60 });
      const m = monthSelect(x.month, 'Month');
      const d = input(x.day, 'Day', { type: 'number' });
      return {
        el: h('div', { class: 'cal-fields' }, fld('Name', n), fld('Month', m), fld('Day', d)),
        read: () => ({ name: n.value, month: Number(m.value), day: num(d.value, 1) }),
      };
    }, () => ({ name: '', month: 0, day: 1 }), max);
    const seasons = dated('Seasons (the day each begins)', c.seasons, 12);
    const holidays = dated('Holidays', c.holidays, 100);

    const read = () => normalizeCalendar({
      ...c,
      name: name.value,
      era: era.value,
      months: months.read(),
      leap: num(leapEvery.value) ? { every: num(leapEvery.value), except: num(leapExcept.value), unless: num(leapUnless.value) } : null,
      weekdays: weekdays.value.split(',').map((w) => w.trim()).filter(Boolean),
      start: { year: num(year.value, 1), month: Number(startMonth.value), day: num(startDay.value, 1) },
      moons: moons.read(),
      seasons: seasons.read(),
      holidays: holidays.read(),
    });
    return h('div', { class: 'cal-editor' },
      h('div', { class: 'cal-fields' }, fld('Name', name), fld('Era (after the year)', era)),
      h('p', { class: 'muted small' }, 'Day 1 of the clock is:'),
      h('div', { class: 'cal-fields' }, fld('Day', startDay), fld('Month', startMonth), fld('Year', year)),
      fld('Weekdays, in order (commas between; none for no week)', weekdays),
      months.el,
      h('p', { class: 'muted small' }, 'Leap years: every so many years, but not every so many, unless also every so many (Gregorian: 4, 100, 400). Leave it empty for none.'),
      h('div', { class: 'cal-fields' }, fld('Every', leapEvery), fld('But not every', leapExcept), fld('Unless also every', leapUnless)),
      moons.el,
      seasons.el,
      holidays.el,
      message,
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', {
        type: 'button',
        class: 'primary',
        onclick: () => {
          const next = read();
          if (!next) return (message.textContent = 'A calendar needs at least one month with days in it.');
          save({ calendar: next }, 'Saved the calendar. The clock reads it now.').then((ok) => ok !== false && draw());
        },
      }, 'Save calendar')),
    );
  };

  function draw() {
    const { calendar, clock } = get();
    pick.value = calendar?.preset ?? '';
    says.textContent = calendar
      ? `Day 1 is ${dateText(0, calendar)}. It's now ${clockText(clock, calendar)}.`
      : `The clock says Day 1, Day 2… (now ${clockText(clock)}). Pick a calendar to give the days names, months, years and moons.`;
    const details = calendar ? h('details', { class: 'cal-details', open, ontoggle: (e) => { open = e.target.open; } }, h('summary', {}, 'Change the months, days, year and moons'), editor(calendar)) : null;
    box.replaceChildren(...[h('label', { class: 'fld' }, h('span', {}, 'Calendar'), pick), says, details].filter(Boolean));
  }
  draw();
  return { el: h('div', {}, h('h3', {}, 'Calendar'), box), draw };
}
