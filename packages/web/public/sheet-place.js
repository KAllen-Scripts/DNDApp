/**
 * Another panel while on the map, without switching tabs: the sheet (or the
 * DM's Creatures), Ask, Notes, Handouts or the DM's Archivist beside the map on the same
 * page (drag the handle between them to resize; which side is chosen under
 * Look), or any page popped out into a window of its own. The choice and
 * the width are saved in this browser.
 *
 * A popped-out window is this same page at ?view=<tab>&campaign=<id>: it
 * shows only that tab (the sheet's is ?view=sheet). The sheet keeps itself up
 * to date across windows (sheet.js); the other pages load as they do in the
 * main window.
 */
import { storage } from './api.js';

const $ = (sel) => document.querySelector(sel);
const BESIDE_KEY = 'dndapp.beside';
const OLD_KEY = 'dndapp.sheetBeside'; // before other panels could go beside the map: '1' meant the sheet
const WIDTH_KEY = 'dndapp.sheetWidth';
const MIN_WIDTH = 320; // px
const MIN_MAP = 320; // the map keeps at least this much
const DEFAULT_WIDTH = 540;
const PANELS = ['sheet', 'inventory', 'creatures', 'items', 'merchants', 'ask', 'notes', 'handouts', 'archivist'];
const TABS = [...PANELS, 'map'];

const params = new URLSearchParams(location.search);
/** The tab this page shows on its own when it is a popped-out window, or null. */
export const WINDOW_TAB = TABS.includes(params.get('view')) ? params.get('view') : null;
/** Is this page the popped-out sheet window? */
export const SHEET_WINDOW = WINDOW_TAB === 'sheet';
/** The campaign the popped-out window was opened for. */
export const windowCampaign = () => params.get('campaign');

let campaignId = null;
let relayout = () => {};

// Can this panel go beside the map? (Only tabs this person has: the Sheet and Inventory are the players', Creatures, Items, Merchants and Archivist the DM's.)
const available = (name) => PANELS.includes(name) && !$(`[data-tab="${name}"]`)?.hidden;

/** Which panel goes beside the map (when the map tab is open), or null. A phone has no room for one. */
export function besidePanel() {
  if (WINDOW_TAB || document.documentElement.hasAttribute('data-phone')) return null;
  let saved = storage.get(BESIDE_KEY);
  if (saved == null && storage.get(OLD_KEY) === '1') saved = 'sheet';
  return available(saved) ? saved : null;
}

export function setSheetCampaign(id) {
  campaignId = id;
}

function setBeside(name) {
  storage.set(BESIDE_KEY, name || null);
  storage.set(OLD_KEY, null);
  relayout();
}

/** Called by the page whenever the tabs change: show or hide what goes with a panel beside the map. */
export function placeBeside(name) {
  const view = $('#app-view');
  view.classList.toggle('beside', !!name);
  for (const p of PANELS) $(`#tab-${p}`).classList.toggle('beside-panel', p === name);
  $('#sheet-splitter').hidden = !name;
  if (name) $('#sheet-splitter').setAttribute('aria-controls', `tab-${name}`);
  const pick = $('#map-beside');
  for (const option of pick.options) option.hidden = !!option.value && !available(option.value);
  pick.value = besidePanel() ?? '';
  if (name) applyWidth(Number(storage.get(WIDTH_KEY)) || DEFAULT_WIDTH);
}

const maxWidth = () => Math.max(MIN_WIDTH, (window.innerWidth || 1280) - MIN_MAP);
const clampWidth = (w) => Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, w)));
// The panel is on the right unless chosen otherwise under Look; dragging towards the map widens it.
const onLeft = () => document.documentElement.dataset.besideSide === 'left';

function applyWidth(w) {
  const width = clampWidth(w);
  $('#app-view').style.setProperty('--side-width', `${width}px`);
  const splitter = $('#sheet-splitter');
  splitter.setAttribute('aria-valuenow', String(width));
  splitter.setAttribute('aria-valuemin', String(MIN_WIDTH));
  splitter.setAttribute('aria-valuemax', String(maxWidth()));
  return width;
}

const saveWidth = (w) => storage.set(WIDTH_KEY, String(applyWidth(w)));
const currentWidth = () => Number($('#sheet-splitter').getAttribute('aria-valuenow')) || DEFAULT_WIDTH;

// The map needs more room than a sheet-sized window.
const SIZES = { map: 'popup,width=1200,height=900' };

/** Open a tab (the sheet unless named) in its own window, or bring that window forward if it's open. */
export function popOut(tab = 'sheet') {
  if (campaignId == null || !TABS.includes(tab)) return;
  const url = `${location.pathname}?view=${tab}&campaign=${encodeURIComponent(campaignId)}`;
  const win = window.open(url, `dndapp-${tab}-${campaignId}`, SIZES[tab] ?? 'popup,width=760,height=900');
  if (!win) {
    const label = $(`[data-tab="${tab}"] [data-label]`)?.dataset.label || tab;
    const beside = PANELS.includes(tab) ? `, or pick "${label} beside" on the map to show it beside the map` : '';
    alert(`Your browser stopped the ${label.toLowerCase()} window from opening. Allow pop-ups for this site${beside}.`);
    return;
  }
  win.focus?.();
  // One place for a panel is enough.
  if (besidePanel() === tab) setBeside(null);
}

export function initSheetPlace({ onChange, currentTab }) {
  relayout = onChange;
  if (WINDOW_TAB) {
    document.documentElement.classList.add('popped-window');
    if (SHEET_WINDOW) document.documentElement.classList.add('sheet-window');
    $('#sheet-popout').hidden = true;
    $('#tab-popout').hidden = true;
  }
  $('#map-beside').addEventListener('change', (e) => setBeside(e.target.value));
  $('#map-sheet-window').addEventListener('click', () => popOut('sheet'));
  $('#sheet-popout').addEventListener('click', () => popOut('sheet'));
  $('#tab-popout').addEventListener('click', () => popOut(currentTab()));

  // The handle: drag it, or use the arrow keys.
  const splitter = $('#sheet-splitter');
  const grow = (dx) => (onLeft() ? dx : -dx);
  let drag = null;
  splitter.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, width: currentWidth() };
    splitter.setPointerCapture?.(e.pointerId);
    splitter.classList.add('dragging');
    e.preventDefault();
  });
  splitter.addEventListener('pointermove', (e) => {
    if (drag) applyWidth(drag.width + grow(e.clientX - drag.x));
  });
  const end = (e) => {
    if (!drag) return;
    saveWidth(drag.width + grow(e.clientX - drag.x));
    drag = null;
    splitter.classList.remove('dragging');
  };
  splitter.addEventListener('pointerup', end);
  splitter.addEventListener('pointercancel', end);
  splitter.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 80 : 20;
    const by = { ArrowLeft: -step, ArrowRight: step }[e.key];
    if (by) {
      e.preventDefault();
      saveWidth(currentWidth() + grow(by));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      saveWidth(e.key === 'Home' ? maxWidth() : MIN_WIDTH);
    }
  });
  window.addEventListener('resize', () => besidePanel() && applyWidth(Number(storage.get(WIDTH_KEY)) || DEFAULT_WIDTH));
}
