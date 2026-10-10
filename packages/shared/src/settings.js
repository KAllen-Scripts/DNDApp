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

export const DEFAULT_SETTINGS = Object.freeze({ weight: 'capacity', edition: null });

/** Settings with anything unknown dropped and missing ones defaulted. */
export function normalizeSettings(s = {}) {
  return {
    weight: s && s.weight in WEIGHT_RULES ? s.weight : DEFAULT_SETTINGS.weight,
    edition: s && String(s.edition) in EDITIONS ? String(s.edition) : DEFAULT_SETTINGS.edition,
  };
}
