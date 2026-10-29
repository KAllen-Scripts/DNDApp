/**
 * A place's or token's wiki page, in the map's dialogs (DM): pick a page by its
 * title, make one from the place or token (the server names it, cuts its
 * picture from the map and puts it inside the right page), open it in the
 * drawer, or unlink it. Maps own where things are, the wiki what they are, so
 * only the link is kept (stage 2 of docs/notes/wiki-space.md).
 */
import { api, h } from '../page/api.js';
import { nav } from '../wiki/data.js';
import { state } from './state.js';

const wikiBase = () => `/campaigns/${state.campaignId}/wiki`;

/** The DM's pages ({ id, title, aliases, available, … }), fetched once per dialog. */
export async function wikiPages() {
  try {
    return (await api('GET', wikiBase())).pages ?? [];
  } catch {
    return [];
  }
}

const findPage = (pages, title) => {
  const key = title.trim().toLowerCase();
  return key ? pages.find((p) => p.title.toLowerCase() === key) ?? pages.find((p) => p.aliases?.some((a) => a.toLowerCase() === key)) : null;
};

/**
 * The Wiki page row: `link` is the thing's page ({ id, title } or null); `thing` ({ kind: 'place'|'token', id }) once it's
 * saved, so a page can be made from it. Returns { el, read() → { id } | null, pages() }; read throws on a title with no page.
 */
export function wikiPageField(link, thing = null) {
  let pages = [];
  const listId = `map-wiki-pages-${Math.random().toString(36).slice(2, 8)}`;
  const input = h('input', { value: link?.title ?? '', maxLength: 200, list: listId, placeholder: 'None', 'aria-label': 'Wiki page' });
  const list = h('datalist', { id: listId });
  const open = h('button', { type: 'button', class: 'ghost', title: 'Open the page at the side' }, 'Open');
  const make = h('button', { type: 'button', class: 'ghost', title: 'A new page named after it, with a picture from the map, only for you to start with' }, 'Make a page from this');
  const unlink = h('button', { type: 'button', class: 'ghost', title: 'Take the link off (the page stays)' }, 'Unlink');
  const note = h('span', { class: 'muted small map-wiki-note' });
  const sync = () => {
    const p = findPage(pages, input.value) ?? (link && input.value.trim() === link.title ? link : null);
    open.hidden = !p || !nav.drawer;
    unlink.hidden = !input.value.trim();
    make.hidden = !thing || !!input.value.trim();
  };
  input.addEventListener('input', sync);
  open.addEventListener('click', () => {
    const p = findPage(pages, input.value) ?? link;
    if (p) nav.drawer?.(p.id);
  });
  unlink.addEventListener('click', () => { input.value = ''; sync(); });
  make.addEventListener('click', async () => {
    make.disabled = true;
    note.textContent = 'Making the page…';
    try {
      const res = await api('POST', `${wikiBase()}/from-map`, { map_id: state.current.id, ...thing });
      pages.push(res.page);
      list.append(new Option(res.page.title));
      input.value = res.page.title;
      link = { id: res.page.id, title: res.page.title };
      note.textContent = res.made ? `Made "${res.page.title}" (only yours until you share it).` : '';
    } catch (err) {
      note.textContent = err.message;
    }
    make.disabled = false;
    sync();
  });
  sync();
  wikiPages().then((all) => {
    pages = all;
    list.replaceChildren(...pages.map((p) => new Option(p.title)));
    sync();
  });
  return {
    el: h('div', { class: 'map-field map-wiki-field' }, h('span', {}, 'Wiki page'), h('div', { class: 'map-row' }, input, open, make, unlink), list, note),
    read() {
      const title = input.value.trim();
      if (!title) return null;
      if (link && title === link.title) return { id: link.id };
      const p = findPage(pages, title);
      if (!p) throw new Error(`There's no wiki page called "${title}". Pick one from the list, or clear it.`);
      return { id: p.id };
    },
    pages: () => pages,
  };
}

/** Is a page's own "available to" setting open to all of these players (null: every player)? */
export function pageOpenTo(page, to) {
  if (!page || page.available === 'all') return true;
  if (page.available === 'dm' || !Array.isArray(page.available)) return false;
  return Array.isArray(to) && to.every((id) => page.available.includes(id));
}

/** The page's setting opened to these players too (null: every player). */
export const widened = (available, to) => (to == null || available === 'all' ? 'all' : [...new Set([...(Array.isArray(available) ? available : []), ...to])]);

/** After revealing a linked place: offer to share its page with the same players. Separate settings, so it only asks. */
export async function offerShareAfterReveal(pageId, to, pages) {
  const page = pages.find((p) => p.id === pageId);
  if (!page || pageOpenTo(page, to)) return;
  if (!confirm(`Also share the wiki page "${page.title}" with ${to ? 'them' : 'every player'}? (Its sections keep their own settings.)`)) return;
  const { page: full } = await api('GET', `${wikiBase()}/${pageId}`);
  await api('PUT', `${wikiBase()}/${pageId}`, { version: full.version, available: widened(full.available, to) });
}
