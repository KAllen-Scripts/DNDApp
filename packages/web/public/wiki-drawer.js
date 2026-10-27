/**
 * The drawer: a wiki page shown at the side, over either space, without
 * leaving what you're doing (a name in Ask's answer, a search result while at
 * the table). It has the page's compass, Open in the wiki and Edit; Escape or
 * ✕ closes it. On a phone it's a sheet from the bottom. Only the DM's (the
 * wiki is the DM's).
 */
import { api, h } from './api.js';
import { state, nav, base, report, fam, kindBadge } from './wiki-data.js';
import { pageContent, hidePreview } from './wiki-page.js';
import { drawCompass } from './wiki-compass.js';

const $ = (sel) => document.querySelector(sel);

function drawerBox() {
  let box = $('#wiki-drawer');
  if (!box) {
    box = h('aside', { id: 'wiki-drawer', class: 'wiki-drawer', 'aria-label': 'Wiki page', hidden: true });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeDrawer(); } });
    $('#app-view').append(box);
  }
  return box;
}

/** Show a page in the drawer. */
export async function openDrawer(id) {
  hidePreview();
  const box = drawerBox();
  let page;
  try {
    page = (await state.guarded(() => api('GET', `${base()}/${id}`))).page;
  } catch (err) {
    return report(err);
  }
  const go = async (view) => {
    closeDrawer();
    nav.enter();
    await nav.go(`#/page/${page.id}${view === 'edit' ? '/edit' : ''}`);
  };
  box.className = `wiki-drawer fam-${fam(page.kind)}`;
  box.replaceChildren(
    h('div', { class: 'wiki-drawer-head' },
      kindBadge(page.kind),
      h('h2', {}, page.title),
      h('button', { type: 'button', class: 'ghost icon-btn wiki-drawer-close', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => closeDrawer() }, '✕'),
    ),
    h('div', { class: 'wiki-drawer-actions' },
      h('button', { type: 'button', class: 'primary', onclick: () => go('page') }, 'Open in the wiki'),
      h('button', { type: 'button', class: 'ghost', onclick: () => go('edit') }, 'Edit'),
    ),
    drawCompass(page),
    h('div', { class: 'wiki-drawer-body wiki-content' }, ...pageContent(page, { dm: true })),
  );
  box.hidden = false;
  box.querySelector('.wiki-drawer-close').focus({ preventScroll: true });
}

export function closeDrawer() {
  const box = $('#wiki-drawer');
  if (!box || box.hidden) return;
  box.hidden = true;
  hidePreview();
}

nav.drawer = openDrawer;
