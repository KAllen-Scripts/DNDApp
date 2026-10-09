/**
 * A campaign's settings, chosen by its DM and used by the server and the page.
 *
 * weight: how weight limits work (gear.js `encumbrance`): 'capacity' (the
 * PHB's carrying capacity, the default), 'variant' (the PHB's variant
 * encumbrance) or 'ignore' (no weight limits at all).
 */
export const WEIGHT_RULES = { capacity: 'Carrying capacity (PHB)', variant: 'Variant encumbrance (PHB)', ignore: 'Ignore weight limits' };

export const DEFAULT_SETTINGS = Object.freeze({ weight: 'capacity' });

/** Settings with anything unknown dropped and missing ones defaulted. */
export function normalizeSettings(s = {}) {
  return { weight: s && s.weight in WEIGHT_RULES ? s.weight : DEFAULT_SETTINGS.weight };
}
