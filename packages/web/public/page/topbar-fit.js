/**
 * The top bar keeps to one row in every theme and layout. Some themes write
 * the tabs in capitals with wide letter spacing (Dungeon Crawl, Nine Hells,
 * Synthwave, 8-bit), so a bar that fits in one theme ran onto two or three
 * rows in another. Rather than guess from the window's width, the page tries
 * the bar and steps down until it fits: the tools drop their names (the names
 * stay in their tooltips), then the tabs close up, then the tabs go onto two
 * lines in their own box, between the campaign's name and the tools. Layout
 * only; on a phone the bar is the ☰ sheet and is left alone.
 */
export const FIT_STEPS = ['fit-icons', 'fit-tight', 'fit-wrap'];

const shown = (el) => !el.hidden && el.getClientRects().length > 0;

/** Does the bar run onto another row: is anything in it above or below the tabs? */
export function barWraps(bar) {
  const tabs = bar.querySelector('.tabs');
  if (!tabs || !shown(tabs)) return false;
  const row = tabs.getBoundingClientRect();
  return [...bar.children].some((el) => {
    if (el === tabs || !shown(el)) return false;
    const r = el.getBoundingClientRect();
    return r.top >= row.bottom - 1 || r.bottom <= row.top + 1;
  });
}

/** Try the bar as it is, then each step in turn, until it's one row. Gives the steps it took. */
export function fitBar(bar, wraps = barWraps) {
  bar.classList.remove(...FIT_STEPS);
  const taken = [];
  for (const step of FIT_STEPS) {
    if (!wraps(bar)) break;
    bar.classList.add(step);
    taken.push(step);
  }
  return taken;
}

/** Refit whenever the bar or its tabs change size (window, theme, fonts, the DM's extra tabs) or the look changes. */
export function initBarFit(bar) {
  const tabs = bar?.querySelector('.tabs');
  if (!tabs || typeof ResizeObserver === 'undefined') return;
  let queued = false;
  const fit = () => {
    queued = false;
    // On a phone the bar is the ☰ sheet, and with the app layout the tabs are along the bottom: no row to keep.
    if (document.documentElement.hasAttribute('data-phone') || getComputedStyle(tabs).position === 'fixed') bar.classList.remove(...FIT_STEPS);
    else fitBar(bar);
  };
  const later = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(fit);
  };
  const watch = new ResizeObserver(later);
  watch.observe(bar);
  watch.observe(tabs);
  window.addEventListener('dndlook', later);
  document.fonts?.ready.then(later);
}
