/**
 * The wiki's space (owner, 2026-10-27: "A wiki is far too big to be just a
 * page… we want it visual"). The Wiki button leaves the table (the top bar
 * and its tabs) for a space of its own on the same page, so the map's live
 * stream, dice and Ask keep running: a rail of views down the side, a bar with
 * the trail of pages opened and the in-game time, and the view.
 *
 * The address says where you are, so Back, Forward and reload work:
 * ?space=wiki#/home, #/page/<id>, #/page/<id>/edit, #/page/<id>/history,
 * #/new and #/waiting. More views join the rail as they're built
 * (docs/notes/wiki-space.md).
 */
import { initTruthToggle } from './wiki-canon.js';
import { api, h } from './api.js';
import { clockText } from './shared/settings.js';
import { state, nav, pictureImg, fam } from './wiki-data.js';
import { openFind } from './wiki-find.js';
import { leaveAtlas } from './wiki-atlas.js';

const $ = (sel) => document.querySelector(sel);
const TRAIL_MAX = 8;

let trail = []; // pages opened, newest last: { id, title, kind, picture }
let applying = false; // drawing a route from the address, so the address isn't pushed again
let ready = false; // the address has been read (or the DM came in): until then a draw mustn't overwrite it
let toTable = null; // back to the table (none in a popped-out wiki window)

/** Is the address the wiki's space? */
export const spaceInUrl = () => new URLSearchParams(location.search).get('space') === 'wiki';

const inSpace = () => document.documentElement.dataset.space === 'wiki';

/** The route of what the wiki shows now. */
export function currentRoute() {
  if (state.view === 'review') return '#/waiting';
  if (state.view === 'wheel') return `#/wheel${state.kindFilter ? `/${state.kindFilter}` : ''}`;
  if (state.view === 'atlas') return `#/atlas${state.atlasMap ? `/${state.atlasMap}` : ''}`;
  if (state.view === 'web') return `#/web${state.webAround ? `/${state.webAround}` : ''}`;
  if (!state.open) return '#/home';
  const id = state.open.page.id;
  if (id == null) return '#/new';
  return `#/page/${id}${state.view === 'edit' ? '/edit' : state.view === 'history' ? '/history' : ''}`;
}

function address(space, route = '') {
  const params = new URLSearchParams(location.search);
  if (space) params.set('space', 'wiki');
  else params.delete('space');
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ''}${route}`;
}

/**
 * Show one space or the other (<html data-space>). `push` adds the change to
 * the browser's history (not when it came from Back or a reload).
 */
export function setSpace(space, { push = true } = {}) {
  if (space !== 'wiki') leaveAtlas();
  document.documentElement.dataset.space = space;
  if (push) ready = true;
  if (space === 'wiki') {
    drawRail();
    drawTrail();
    showClock();
  }
  // The address follows: a new entry in the history, or (Back, a reload, a player who can't have the wiki) a correction.
  if ((space === 'wiki') === spaceInUrl()) return;
  const to = space === 'wiki' ? address(true, currentRoute()) : address(false);
  if (push) history.pushState(null, '', to);
  else history.replaceState(null, '', to);
}

/** Draw what the address says (on entering the space from Back, Forward or a reload). */
export async function routeFromUrl() {
  const m = /^#\/(home|waiting|new|wheel(?:\/([a-z]+))?|page\/([a-f0-9]+)(?:\/(edit|history))?|atlas(?:\/([A-Za-z0-9_-]+))?|web(?:\/([a-f0-9]{10}))?)?$/.exec(location.hash) ?? [];
  applying = true;
  ready = true;
  try {
    if (m[3]) {
      const id = m[3];
      const view = m[4] ?? 'page';
      if (state.open?.page.id === id) {
        state.view = view;
        nav.drawList();
        nav.drawMain();
      } else {
        await nav.openPage(id, { view });
      }
    } else if (m[1] === 'new') {
      nav.newPage();
    } else if (m[1]?.startsWith('atlas')) {
      state.open = null;
      state.view = 'atlas';
      state.atlasMap = m[5] ?? null;
      nav.drawList();
      nav.drawMain();
    } else if (m[1]?.startsWith('web')) {
      state.open = null;
      state.view = 'web';
      state.webAround = m[6] ?? null;
      nav.drawList();
      nav.drawMain();
    } else if (m[1]?.startsWith('wheel')) {
      state.open = null;
      state.view = 'wheel';
      state.kindFilter = m[2] ?? null;
      state.kindKey = null;
      nav.drawList();
      nav.drawMain();
    } else {
      state.open = null;
      state.view = m[1] === 'waiting' ? 'review' : 'page';
      nav.drawList();
      nav.drawMain();
    }
  } finally {
    applying = false;
  }
}

/** After the wiki draws: the address follows it, and an opened page joins the trail. */
export function routed() {
  if (!inSpace() || !ready) return;
  const route = currentRoute();
  if (location.hash !== route) {
    if (applying || !spaceInUrl()) history.replaceState(null, '', address(true, route));
    else history.pushState(null, '', address(true, route));
  }
  const page = state.open?.page;
  if (page?.id != null && state.view === 'page') {
    trail = [...trail.filter((p) => p.id !== page.id), { id: page.id, title: page.title, kind: page.kind, picture: page.picture?.id ?? null }].slice(-TRAIL_MAX);
  }
  drawRail();
  drawTrail();
}

// ---------- the rail: the views, as pictures ----------

function drawRail() {
  const rail = $('#wiki-rail');
  if (!rail) return;
  const route = currentRoute();
  const item = (to, icon, label, { count = 0, onclick = null, cls = '' } = {}) => h('button', {
    type: 'button',
    class: `wiki-rail-btn${route === to ? ' current' : ''}${cls}`,
    'aria-current': route === to ? 'page' : null,
    title: label,
    onclick: onclick ?? (() => go(to)),
  },
  h('span', { class: 'wiki-rail-art', 'aria-hidden': 'true' }, icon, count ? h('span', { class: 'wiki-rail-count' }, String(count)) : null),
  h('span', { class: 'wiki-rail-label' }, label));
  rail.replaceChildren(...[
    item('#/home', '❦', 'Home'),
    item(route.startsWith('#/wheel') ? route : '#/wheel', '❂', 'Wheel'),
    item(route.startsWith('#/atlas') ? route : '#/atlas', '⌖', 'Atlas'),
    item(route.startsWith('#/web') ? route : '#/web', '⁂', 'Web'),
    item('#find', '⌕', 'Find', { onclick: () => openFind() }),
    item('#/new', '✚', 'New page', { onclick: () => nav.newPage() }),
    item('#/waiting', '✎', 'Waiting', { count: state.proposals }),
    h('span', { class: 'wiki-rail-gap' }),
    toTable && item('#table', '⌂', 'The table', { onclick: () => toTable(), cls: ' wiki-to-table' }),
  ].filter(Boolean));
}

/** Go to a route of the space (a click on a view, a card, a slice of the Home's wheel). */
export async function go(route) {
  if (location.hash === route) return;
  history.pushState(null, '', address(true, route));
  await routeFromUrl();
}

// ---------- the bar: the trail and the clock ----------

function drawTrail() {
  const box = $('#wiki-trail');
  if (!box) return;
  // Pages deleted or renamed since: the trail keeps up.
  const byId = new Map(state.pages.map((p) => [p.id, p]));
  trail = trail.filter((p) => byId.has(p.id)).map((p) => ({ ...p, title: byId.get(p.id).title }));
  const open = state.open?.page.id;
  box.replaceChildren(...trail.map((p) => h('button', {
    type: 'button',
    class: `wiki-trail-chip fam-${fam(p.kind)}${p.id === open ? ' current' : ''}`,
    title: p.title,
    onclick: () => go(`#/page/${p.id}`),
  },
  h('span', { class: `wiki-trail-art${p.picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, p.picture ? pictureImg(p.picture, { size: 'thumb' }) : null),
  h('span', { class: 'wiki-trail-title' }, p.title))));
}

async function showClock() {
  const box = $('#wiki-clock');
  if (!box || state.campaignId == null) return;
  try {
    const { clock, calendar } = await api('GET', `/campaigns/${state.campaignId}/clock`);
    box.textContent = clock == null ? '' : clockText(clock, calendar);
  } catch {
    box.textContent = '';
  }
}

/** Set up the space. `table()` goes back to the table (app.js's last tab), null in a popped-out wiki window; `enter()` goes into the space. */
export function initSpace({ table, enter }) {
  toTable = table;
  nav.enter = enter;
  nav.routed = routed;
  nav.go = go;
  initTruthToggle();
}

/** Another campaign: a new trail. */
export function resetSpace() {
  trail = [];
  ready = false;
}
