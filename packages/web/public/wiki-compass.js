/**
 * A page's compass: the strip under its banner that says where the page sits,
 * in pictures. Its family (to the Wheel), what it's inside (the chain up),
 * what's inside it, the pages it links to and that link to it, and a small
 * map of where it is (opening the Atlas). Later stages add a ring of people
 * and a ribbon of moments to it (mini-views.js). The server works it out for the viewer (GET …/wiki/:pid/compass).
 */
import { api, h, fileUrl } from './api.js';
import { miniCrop } from './mini-views.js';
import { KIND_FAMILIES } from './shared/wiki.js';
import { state, nav, base, pictureImg, fam } from './wiki-data.js';

const chip = (p) => h('button', { type: 'button', class: `wiki-compass-chip fam-${fam(p.kind)}`, title: p.title, onclick: () => nav.go(`#/page/${p.id}`) },
  h('span', { class: `wiki-compass-art${p.picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, p.picture ? pictureImg(p.picture, { size: 'thumb' }) : null),
  h('span', { class: 'wiki-compass-title' }, p.title));

/** The compass's mini-map: where the page is on its first map, opening the Atlas there. */
function miniMap(page, o) {
  const c = o.crop;
  const btn = h('button', { type: 'button', class: 'wiki-compass-map', title: `${o.name} on ${o.map_name}: open the Atlas there`, onclick: () => {
    nav.closeDrawer?.();
    nav.enter();
    nav.go(`#/atlas/${o.map_id}`);
  } });
  const draw = (src) => btn.replaceChildren(miniCrop({ src, crop: { x: 0, y: 0, w: c.w, h: c.h }, pins: [{ x: o.x - c.x, y: o.y - c.y, family: fam(page.kind), title: o.name }], width: 120, height: 80, label: `${o.name} on ${o.map_name}` }));
  draw(null);
  fileUrl(`/campaigns/${state.campaignId}/maps/${o.map_id}/image?crop=${c.x},${c.y},${c.w},${c.h}&size=240`).then(draw, () => {});
  return btn;
}

/** The compass for a page, as an element that fills in when the server answers (empty for a new page). `onMaps` from GET …/wiki/:pid. */
export function drawCompass(page, { onMaps = [] } = {}) {
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
      onMaps.length ? h('div', { class: 'wiki-compass-group' }, h('span', { class: 'wiki-compass-label' }, 'On the map'), miniMap(page, onMaps[0])) : null,
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
