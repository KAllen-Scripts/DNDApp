/**
 * Seeing your character sheet while on the map, without switching tabs:
 * beside the map on the same page (drag the handle between them to resize),
 * or popped out into a window of its own. Both choices, and the width, are
 * saved in this browser.
 *
 * The popped-out window is this same page at ?view=sheet&campaign=<id>: it
 * shows only the sheet. The sheet keeps itself up to date across windows
 * (sheet.js).
 */
import { storage } from './api.js';

const $ = (sel) => document.querySelector(sel);
const BESIDE_KEY = 'dndapp.sheetBeside';
const WIDTH_KEY = 'dndapp.sheetWidth';
const MIN_WIDTH = 320; // px
const MIN_MAP = 320; // the map keeps at least this much
const DEFAULT_WIDTH = 540;

const params = new URLSearchParams(location.search);
/** Is this page the popped-out sheet window? */
export const SHEET_WINDOW = params.get('view') === 'sheet';
/** The campaign the popped-out window was opened for. */
export const windowCampaign = () => params.get('campaign');

let campaignId = null;
let relayout = () => {};

/** Is the sheet shown beside the map (when the map tab is open)? */
export const sheetBeside = () => !SHEET_WINDOW && storage.get(BESIDE_KEY) === '1';

export function setSheetCampaign(id) {
  campaignId = id;
}

function setBeside(on) {
  storage.set(BESIDE_KEY, on ? '1' : null);
  relayout();
}

/** Called by the page whenever the tabs change: show or hide what goes with the sheet beside the map. */
export function placeSheet(beside) {
  $('#app-view').classList.toggle('sheet-beside', beside);
  $('#sheet-splitter').hidden = !beside;
  $('#map-sheet-beside').setAttribute('aria-pressed', String(beside));
  $('#sheet-beside-close').hidden = !beside;
  if (beside) applyWidth(Number(storage.get(WIDTH_KEY)) || DEFAULT_WIDTH);
}

const maxWidth = () => Math.max(MIN_WIDTH, (window.innerWidth || 1280) - MIN_MAP);
const clampWidth = (w) => Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, w)));

function applyWidth(w) {
  const width = clampWidth(w);
  $('#app-view').style.setProperty('--sheet-width', `${width}px`);
  const splitter = $('#sheet-splitter');
  splitter.setAttribute('aria-valuenow', String(width));
  splitter.setAttribute('aria-valuemin', String(MIN_WIDTH));
  splitter.setAttribute('aria-valuemax', String(maxWidth()));
  return width;
}

const saveWidth = (w) => storage.set(WIDTH_KEY, String(applyWidth(w)));
const currentWidth = () => Number($('#sheet-splitter').getAttribute('aria-valuenow')) || DEFAULT_WIDTH;

/** Open the sheet in its own window (or bring that window forward if it's open). */
export function popOut() {
  if (campaignId == null) return;
  const url = `${location.pathname}?view=sheet&campaign=${encodeURIComponent(campaignId)}`;
  const win = window.open(url, `dndapp-sheet-${campaignId}`, 'popup,width=760,height=900');
  if (!win) {
    alert('Your browser stopped the sheet window from opening. Allow pop-ups for this site, or use the Sheet button to show it beside the map.');
    return;
  }
  win.focus?.();
  // One place for the sheet is enough.
  if (sheetBeside()) setBeside(false);
}

export function initSheetPlace({ onChange }) {
  relayout = onChange;
  if (SHEET_WINDOW) {
    document.documentElement.classList.add('sheet-window');
    $('#sheet-popout').hidden = true;
  }
  $('#map-sheet-beside').addEventListener('click', () => setBeside(!sheetBeside()));
  $('#sheet-beside-close').addEventListener('click', () => setBeside(false));
  $('#map-sheet-window').addEventListener('click', popOut);
  $('#sheet-popout').addEventListener('click', popOut);

  // The handle: drag it, or use the arrow keys. The sheet is on the right, so dragging left widens it.
  const splitter = $('#sheet-splitter');
  let drag = null;
  splitter.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, width: currentWidth() };
    splitter.setPointerCapture?.(e.pointerId);
    splitter.classList.add('dragging');
    e.preventDefault();
  });
  splitter.addEventListener('pointermove', (e) => {
    if (drag) applyWidth(drag.width + (drag.x - e.clientX));
  });
  const end = (e) => {
    if (!drag) return;
    saveWidth(drag.width + (drag.x - e.clientX));
    drag = null;
    splitter.classList.remove('dragging');
  };
  splitter.addEventListener('pointerup', end);
  splitter.addEventListener('pointercancel', end);
  splitter.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 80 : 20;
    const by = { ArrowLeft: step, ArrowRight: -step }[e.key];
    if (by) {
      e.preventDefault();
      saveWidth(currentWidth() + by);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      saveWidth(e.key === 'Home' ? maxWidth() : MIN_WIDTH);
    }
  });
  window.addEventListener('resize', () => sheetBeside() && applyWidth(Number(storage.get(WIDTH_KEY)) || DEFAULT_WIDTH));
}
