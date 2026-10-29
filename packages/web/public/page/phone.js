/**
 * The phone layout's behaviour (its look is mobile.css). On a phone
 * (page/look-boot.js sets data-phone on <html>) each page fills the screen and the
 * top bar is hidden: a small ☰ button in the corner opens it as a menu sheet
 * from the bottom (the pages, Dice, Rest, Look, Log out…), and any choice in
 * it closes it again.
 *
 * Toolbars with more buttons than fit get a "⋯" button instead
 * (phoneMenu): the main controls stay in the row, and ⋯ opens the rest as a
 * list from the bottom. The buttons are the page's own, so everything they
 * do still works.
 */
const $ = (sel) => document.querySelector(sel);
const isPhone = () => document.documentElement.hasAttribute('data-phone');

let openMenu = null; // the menu (the nav or a toolbar) open now

function scrim() {
  let s = $('#phone-scrim');
  if (!s) {
    s = document.createElement('div');
    s.id = 'phone-scrim';
    s.className = 'phone-scrim';
    s.setAttribute('aria-hidden', 'true');
    s.addEventListener('click', () => closeMenu());
    document.body.append(s);
  }
  return s;
}

/** Open a menu (the nav, or a toolbar's ⋯), closing any other. */
function open(menu) {
  if (openMenu && openMenu !== menu) closeMenu({ refocus: false });
  openMenu = menu;
  menu.box.classList.add('menu-open');
  menu.button.setAttribute('aria-expanded', 'true');
  scrim().classList.add('on');
  // Into the menu, for keyboards and screen readers: the page it's on, or its first button.
  const first = menu.box.querySelector('[aria-selected="true"]:not([hidden]), button:not([hidden])');
  first?.focus({ preventScroll: true });
}

/** Close the open menu; focus goes back to the button that opened it. */
export function closeMenu({ refocus = true } = {}) {
  const menu = openMenu;
  if (!menu) return;
  openMenu = null;
  menu.box.classList.remove('menu-open');
  menu.button.setAttribute('aria-expanded', 'false');
  $('#phone-scrim')?.classList.remove('on');
  if (refocus && isPhone() && menu.box.contains(document.activeElement)) menu.button.focus({ preventScroll: true });
}

/** Choosing something in a menu closes it (a select or text box is still being used, so not those). */
function closesOnChoice(menu) {
  menu.box.addEventListener('click', (e) => {
    if (openMenu !== menu) return;
    const hit = e.target.closest('button, a, [role=tab]');
    if (!hit || hit === menu.button) return;
    // The page's own handler runs first; then the menu gets out of the way.
    queueMicrotask(() => closeMenu({ refocus: false }));
  });
  menu.box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openMenu === menu) { e.stopPropagation(); closeMenu(); }
  });
}

/**
 * A toolbar that folds into a "⋯" menu on a phone. The bar's children that
 * match `keep` stay in the row; the rest move into a list (display: contents
 * off a phone, so the bar looks the same there) that ⋯ opens from the bottom.
 * Ids and listeners go with the buttons, so they work as before. Returns the ⋯ button.
 */
export function phoneMenu(bar, { label = 'More', keep = null } = {}) {
  bar.classList.add('phone-menu');
  const list = document.createElement('div');
  list.className = 'phone-menu-list';
  for (const child of [...bar.children]) if (!(keep && child.matches(keep))) list.append(child);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ghost phone-menu-close';
  close.textContent = 'Close';
  list.append(close);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost icon-btn phone-more';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.setAttribute('aria-expanded', 'false');
  button.textContent = '⋯';
  bar.append(list, button);
  phoneSheet(list, button);
  return button;
}

/**
 * On a phone, `button` opens `box` itself as a menu sheet from the bottom
 * (with the scrim; choosing a button in it closes it). For a bar that already
 * floats, like the map's tools, where nothing needs moving.
 */
export function phoneSheet(box, button) {
  const menu = { box, button };
  button.addEventListener('click', () => {
    if (!isPhone()) return;
    if (openMenu === menu) closeMenu();
    else open(menu);
  });
  closesOnChoice(menu);
}

/** The ☰ button and the menu sheet the top bar becomes on a phone. */
export function initPhone() {
  const view = $('#app-view');
  const bar = view.querySelector(':scope > .topbar');
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'phone-nav';
  button.className = 'phone-nav';
  button.setAttribute('aria-label', 'Menu: pages and settings');
  button.title = 'Menu';
  button.setAttribute('aria-controls', 'app-topbar');
  button.setAttribute('aria-expanded', 'false');
  button.textContent = '☰';
  bar.id ||= 'app-topbar';
  view.prepend(button);
  phoneSheet(bar, button);

  // The picked token's bar sits just above the map's tools, however many rows of them are open.
  const bars = $('#tab-map .map-bars');
  if (bars && window.ResizeObserver) {
    new ResizeObserver(() => $('#tab-map').style.setProperty('--phone-bars-h', `${bars.offsetHeight}px`)).observe(bars);
  }

  // Leaving the phone layout (a phone turned on its side, a wider window) shuts any menu.
  window.addEventListener('dndlook', () => { if (!isPhone()) closeMenu({ refocus: false }); });
}
