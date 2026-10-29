/**
 * The table's pages that live in the wiki now (owner, 2026-10-28: "I also
 * don't think we need dedicated tabs in the table for stuff that's in the
 * wiki anymore"): the DM's Items and Merchants are views of the wiki's space
 * (#/items, #/merchants) instead of tabs. As the Atlas does with the map, the
 * page itself (#tab-<name>) is moved into the wiki's main area, not copied, so
 * it keeps everything it does, and goes back to its place on leaving.
 */
import { state } from './data.js';

const $ = (sel) => document.querySelector(sel);

/** The wiki views that are a table page, with what the rail calls them. */
export const PANEL_VIEWS = {
  items: { icon: '✧', label: 'Items' },
  merchants: { icon: '⚖', label: 'Merchants' },
};

let moved = null; // { name, panel, home }: the page in the wiki now, and the marker left in its place

/** Called when a page is shown in the wiki (app.js: merchantsOpened). */
export const panelHooks = { opened: () => {} };

/** Put the page back at the table (before any other view of the wiki draws, and on going back to the table). */
export function leavePanel() {
  if (!moved) return;
  const { panel, home } = moved;
  home.replaceWith(panel);
  panel.hidden = true;
  $('#wiki-view')?.classList.remove('wiki-panel-on');
  moved = null;
}

/** Draw a table page into the wiki's main area (the DM's only: a player's wiki has none). */
export function drawPanel(main, name) {
  if (moved?.name !== name) leavePanel();
  const panel = moved?.panel ?? $(`#tab-${name}`);
  if (!state.dm || !panel) return main.replaceChildren();
  if (!moved) {
    const home = document.createComment(`#tab-${name} is in the wiki`);
    panel.replaceWith(home);
    moved = { name, panel, home };
  }
  main.replaceChildren(panel);
  panel.hidden = false;
  $('#wiki-view').classList.add('wiki-panel-on');
  panelHooks.opened(name);
}
