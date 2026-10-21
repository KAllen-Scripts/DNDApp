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
 */
export const WEIGHT_RULES = { capacity: 'Carrying capacity (PHB)', variant: 'Variant encumbrance (PHB)', ignore: 'Ignore weight limits' };

export const EDITIONS = { 2014: '2014 rules', 2024: '2024 rules' };

/**
 * clock: the campaign's in-game clock (the world, owner 2026-10-18: "an in-game clock is part of the
 * basics"), in minutes since the start of day 1. The DM moves it on; journeys arrive by it. It starts
 * on day 1 at 08:00.
 */
export const START_CLOCK = 8 * 60;
export const DEFAULT_SETTINGS = Object.freeze({ weight: 'capacity', edition: null, clock: START_CLOCK });
/** The clock goes at most this far (about 27,000 years of days), so it stays a plain number. */
export const MAX_CLOCK = 1440 * 10_000_000;

/** Settings with anything unknown dropped and missing ones defaulted. */
export function normalizeSettings(s = {}) {
  return {
    weight: s && s.weight in WEIGHT_RULES ? s.weight : DEFAULT_SETTINGS.weight,
    edition: s && String(s.edition) in EDITIONS ? String(s.edition) : DEFAULT_SETTINGS.edition,
    clock: Number.isInteger(s?.clock) && s.clock >= 0 && s.clock <= MAX_CLOCK ? s.clock : DEFAULT_SETTINGS.clock,
  };
}

const pad = (n) => String(n).padStart(2, '0');
/** The clock as people say it: "Day 14, 18:30". */
export const clockText = (minutes) => `Day ${Math.floor(minutes / 1440) + 1}, ${pad(Math.floor((minutes % 1440) / 60))}:${pad(minutes % 60)}`;
/** A stretch of time as people say it: "2 days 5 hours", "40 minutes". */
export function durationText(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  const part = (n, word) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : '');
  return [part(days, 'day'), part(hours, 'hour'), days ? '' : part(mins, 'minute')].filter(Boolean).join(' ') || 'no time';
}
