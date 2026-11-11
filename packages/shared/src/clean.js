/**
 * Small cleaners for values in saved documents and requests (the sheet, its
 * inventory, class features, Wild Shape, companions, item actions), so each of
 * those modules doesn't keep its own copy.
 */

/** Text, at most `max` characters ('' for nothing). */
export const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);

/** A whole number between min and max ("+3" → 3, 4.7 → 4), or the fallback when it isn't a number. */
export const int = (v, { min = -999, max = 999, fallback = null } = {}) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/^\s*\+/, ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};

/** A new random id (crypto's UUID where there is one). */
export const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
