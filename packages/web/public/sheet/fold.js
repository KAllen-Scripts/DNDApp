/**
 * Options shown only when asked, to keep the character sheet short (Kenny,
 * 2026-10-28): adding a spell, a companion or a Wild Shape form, a feature's
 * rules text. A fold is a <details> that remembers whether it was opened, so
 * the sheet redrawing (after a tick, a roll, a save) doesn't close it again.
 * Opened and closed folds are remembered for this page only; on a fresh load
 * they start the way the sheet asks (closed, unless there's nothing yet).
 */
import { h } from '../page/dom.js';

const opened = new Map();

/** Whether the fold with this key is open (its own default until it's been toggled). */
export const isOpen = (key, open = false) => opened.get(key) ?? open;
/** Remember a fold as open or closed (for toggles that aren't a fold, like a feature's notes). */
export const setOpen = (key, open) => opened.set(key, open);

/** A fold: summary is what you click (a string or elements), content what it opens. */
export function fold(key, summary, content, { open = false, cls = '' } = {}) {
  const el = h('details', { class: `sh-fold ${cls}`, open: isOpen(key, open) }, h('summary', {}, summary), ...[content].flat());
  el.addEventListener('toggle', () => setOpen(key, el.open));
  return el;
}
