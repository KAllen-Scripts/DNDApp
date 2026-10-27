/**
 * A page's compass: the strip under its banner that says where the page sits,
 * in pictures. Its family (to the Wheel), what it's inside (the chain up),
 * what's inside it, and the pages it links to and that link to it. Later
 * stages add a small map, a ring of people and a ribbon of moments to it
 * (mini-views.js). The server works it out for the viewer (GET …/wiki/:pid/compass).
 */
import { api, h } from './api.js';
import { KIND_FAMILIES } from './shared/wiki.js';
import { nav, base, pictureImg, fam } from './wiki-data.js';

const chip = (p) => h('button', { type: 'button', class: `wiki-compass-chip fam-${fam(p.kind)}`, title: p.title, onclick: () => nav.go(`#/page/${p.id}`) },
  h('span', { class: `wiki-compass-art${p.picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, p.picture ? pictureImg(p.picture, { size: 'thumb' }) : null),
  h('span', { class: 'wiki-compass-title' }, p.title));

/** The compass for a page, as an element that fills in when the server answers (empty for a new page). */
export function drawCompass(page) {
  const box = h('nav', { class: 'wiki-compass', 'aria-label': 'Where this page sits' });
  if (page.id == null) return box;
  (async () => {
    let c;
    try {
      c = (await api('GET', `${base()}/${page.id}/compass`)).compass;
    } catch {
      return;
    }
    if (!c || !box.isConnected) return;
    const family = KIND_FAMILIES[c.family];
    const group = (label, list, more = null) => (list.length ? h('div', { class: 'wiki-compass-group' },
      h('span', { class: 'wiki-compass-label' }, label),
      h('div', { class: 'wiki-compass-chips' }, ...list.slice(0, 8).map(chip), list.length > 8 ? h('span', { class: 'muted small' }, `+${list.length - 8} more`) : null, more)) : null);
    box.replaceChildren(...[
      h('div', { class: 'wiki-compass-group' },
        h('span', { class: 'wiki-compass-label' }, 'Kind'),
        h('button', { type: 'button', class: `wiki-compass-family fam-${c.family}`, title: `${family.label} on the Wheel`, onclick: () => nav.go(`#/wheel/${c.family}`) },
          h('span', { 'aria-hidden': 'true' }, family.icon), ` ${family.label}`)),
      group('Inside', c.chain),
      group('Holds', c.children),
      group('Links to', c.links_to),
      group('Linked from', c.linked_from),
    ].filter(Boolean));
  })();
  return box;
}
