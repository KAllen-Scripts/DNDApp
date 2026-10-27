import { normalizeCustomBackgrounds } from './backgrounds.js';
import { dateText, moonText, normalizeCalendar } from './calendar.js';

/**
 * A campaign's settings, chosen by its DM and used by the server and the page.
 *
 * weight: how weight limits work (gear.js `encumbrance`): 'capacity' (the
 * PHB's carrying capacity, the default), 'variant' (the PHB's variant
 * encumbrance) or 'ignore' (no weight limits at all).
 *
 * edition: which rules the campaign plays by, '2014' or '2024', or null while
 * the DM hasn't chosen (the server then uses REST_RULES, else the edition of
 * the group's Player's Handbook in the books folder, else 2014). Rests, Ask's
 * rules answers and lookups in the books follow it. The character sheet's own
 * rules are 2014 whatever it says (a 2024 sheet is a job for later).
 *
 * backgrounds: the DM's own backgrounds (backgrounds.js `normalizeCustomBackground`),
 * suggested on every player's sheet beside the books' ones.
 *
 * calendar: what the in-game clock's days are called (calendar.js), or null for "Day 1, Day 2…" as before.
 */
export const WEIGHT_RULES = { capacity: 'Carrying capacity (PHB)', variant: 'Variant encumbrance (PHB)', ignore: 'Ignore weight limits' };

export const EDITIONS = { 2014: '2014 rules', 2024: '2024 rules' };

/**
 * clock: the campaign's in-game clock (the world, owner 2026-10-18: "an in-game clock is part of the
 * basics"), in minutes since the start of day 1. The DM moves it on; journeys arrive by it. It starts
 * on day 1 at 08:00.
 */
export const START_CLOCK = 8 * 60;

/**
 * travel: how much of the world's travel the table wants (owner, 2026-10-21: "Not all tables want the same
 * level of detail and realism"). time: 'clock' (journeys take their time as the DM moves the clock on),
 * 'skip' (they get there at once and the clock jumps on by the journey) or 'none' (they get there at once;
 * the clock stays put). The rest switch parts on and off: roads (journeys keep to roads and rivers), terrain
 * (difficult terrain slows them), vehicles (riding, wagons and boats; off: everyone walks), marches (pushing
 * on past 8 hours a day calls for saves), encounters (random encounters on the way).
 */
export const TRAVEL_TIME = { clock: 'Journeys take their time as you move the clock on', skip: 'They get there at once, and the clock jumps on by the journey', none: 'They get there at once, and the clock stays put' };
export const TRAVEL_PARTS = {
  roads: 'Roads and rivers: journeys keep to them where that’s quicker',
  terrain: 'Difficult terrain slows journeys',
  vehicles: 'Riding, wagons and boats (off: everyone goes on foot)',
  marches: 'Forced marches: past 8 hours a day on the road calls for Constitution saves',
  encounters: 'Random encounters on the way',
};
export const DEFAULT_TRAVEL = Object.freeze({ time: 'clock', roads: true, terrain: true, vehicles: true, marches: true, encounters: true });
export const normalizeTravel = (t = {}) => ({
  time: t && t.time in TRAVEL_TIME ? t.time : DEFAULT_TRAVEL.time,
  ...Object.fromEntries(Object.keys(TRAVEL_PARTS).map((k) => [k, typeof t?.[k] === 'boolean' ? t[k] : DEFAULT_TRAVEL[k]])),
});
/**
 * attacks: attacks and area spells from the map (owner, 2026-10-21: "This should be optional as a feature").
 * on: players and the DM can attack from the map (on by default, so people find it); damage: how damage from
 * players' attacks lands, 'auto' (straight away) or 'dm' (it waits for the DM's Apply); show_ac: players see
 * an enemy's AC on the result (off: only hit or miss).
 */
export const ATTACK_DAMAGE = { auto: 'Straight away', dm: 'When the DM applies it (the DM gets Apply buttons)' };
export const DEFAULT_ATTACKS = Object.freeze({ on: true, damage: 'auto', show_ac: false });
export const normalizeAttackSettings = (a = {}) => ({
  on: typeof a?.on === 'boolean' ? a.on : DEFAULT_ATTACKS.on,
  damage: a && a.damage in ATTACK_DAMAGE ? a.damage : DEFAULT_ATTACKS.damage,
  show_ac: typeof a?.show_ac === 'boolean' ? a.show_ac : DEFAULT_ATTACKS.show_ac,
});
export const DEFAULT_SETTINGS = Object.freeze({ weight: 'capacity', edition: null, clock: START_CLOCK, travel: DEFAULT_TRAVEL, attacks: DEFAULT_ATTACKS, backgrounds: Object.freeze([]), calendar: null });
/** The clock goes at most this far (about 27,000 years of days), so it stays a plain number. */
export const MAX_CLOCK = 1440 * 10_000_000;

/** Settings with anything unknown dropped and missing ones defaulted. */
export function normalizeSettings(s = {}) {
  return {
    weight: s && s.weight in WEIGHT_RULES ? s.weight : DEFAULT_SETTINGS.weight,
    edition: s && String(s.edition) in EDITIONS ? String(s.edition) : DEFAULT_SETTINGS.edition,
    clock: Number.isInteger(s?.clock) && s.clock >= 0 && s.clock <= MAX_CLOCK ? s.clock : DEFAULT_SETTINGS.clock,
    travel: normalizeTravel(s?.travel),
    attacks: normalizeAttackSettings(s?.attacks),
    backgrounds: normalizeCustomBackgrounds(s?.backgrounds),
    calendar: normalizeCalendar(s?.calendar),
  };
}

const pad = (n) => String(n).padStart(2, '0');
/**
 * The clock as people say it: "Day 14, 18:30", or with the campaign's calendar (calendar.js)
 * "3 Mirtul 1492 DR, 18:30 · Full moon".
 */
export function clockText(minutes, calendar = null) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const moon = calendar ? moonText(minutes, calendar) : '';
  return `${dateText(minutes, calendar)}, ${time}${moon ? ` · ${moon}` : ''}`;
}
/** A stretch of time as people say it: "2 days 5 hours", "40 minutes". */
export function durationText(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  const part = (n, word) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : '');
  return [part(days, 'day'), part(hours, 'hour'), days ? '' : part(mins, 'minute')].filter(Boolean).join(' ') || 'no time';
}
