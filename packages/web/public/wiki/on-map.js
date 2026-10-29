/**
 * A page's On the map box (DM): each place and token on a map linked to the
 * page, as a crop of that map with a pin, its map's name and whether players
 * see it. A click opens the map there. A hidden place on a page that's shared
 * offers Also reveal it on the map (the two stay separate settings). The links
 * are made from the map (the place's or token's Wiki page row), or from here
 * with Put it on a map (wiki/views/atlas.js).
 */
import { api, fileUrl } from '../page/api.js';
import { state, nav, report, status } from './data.js';
import { state as mapState } from '../map/state.js';
import { h } from '../page/dom.js';

const mapsBase = () => `/campaigns/${state.campaignId}/maps`;

function cropImg(o) {
  const c = o.crop;
  const img = h('img', { alt: `${o.name} on ${o.map_name}`, decoding: 'async' });
  fileUrl(`${mapsBase()}/${o.map_id}/image?crop=${c.x},${c.y},${c.w},${c.h}&size=320`).then((src) => { img.src = src; }, () => img.remove());
  return img;
}

/** The box (with Put it on a map, when there are maps). `onMaps` comes with the page (GET …/wiki/:pid). */
export function drawOnMap(page, onMaps, { reload }) {
  const put = nav.putOnMap && mapState.maps.length
    ? h('button', { type: 'button', class: 'ghost small', title: 'Choose a map, then click where it goes', onclick: () => nav.putOnMap(page) }, 'Put it on a map')
    : null;
  if (!onMaps?.length) return put ? h('section', { class: 'wiki-onmap', 'aria-label': 'On the map' }, h('h3', {}, 'On the map'), h('p', { class: 'muted small' }, 'It isn’t on a map yet. ', put)) : null;
  const reveal = async (o) => {
    try {
      const to = page.available === 'all' ? null : page.available;
      await api('PATCH', `${mapsBase()}/${o.map_id}/places`, { set: { id: o.id, revealed: true, revealed_to: to } });
      status(`${o.name} is revealed on ${o.map_name} to ${to ? 'the players the page is shared with' : 'every player'}.`);
      reload();
    } catch (err) {
      report(err);
    }
  };
  return h('section', { class: 'wiki-onmap', 'aria-label': 'On the map' },
    h('div', { class: 'wiki-onmap-head' }, h('h3', {}, 'On the map'), put),
    h('div', { class: 'wiki-onmap-grid' }, ...onMaps.map((o) => {
      const pin = h('span', { class: `wiki-onmap-pin ${o.kind}`, style: `left: ${(((o.x - o.crop.x) / o.crop.w) * 100).toFixed(2)}%; top: ${(((o.y - o.crop.y) / o.crop.h) * 100).toFixed(2)}%`, 'aria-hidden': 'true' });
      const open = h('button', { type: 'button', class: 'wiki-onmap-open', title: nav.showMap ? `Open ${o.map_name} here` : o.map_name, disabled: !nav.showMap, onclick: () => nav.showMap?.(o.map_id, { x: o.x, y: o.y }) },
        h('span', { class: 'wiki-onmap-crop' }, cropImg(o), pin));
      const seen = o.kind === 'token' ? 'A token' : o.revealed ? 'Revealed to players' : 'Hidden from players';
      return h('figure', { class: 'wiki-onmap-card' }, open,
        h('figcaption', {},
          h('strong', {}, o.name), h('span', { class: 'muted small' }, ` on ${o.map_name}`),
          h('div', { class: 'small muted' }, seen),
          o.kind === 'place' && !o.revealed && page.available !== 'dm'
            ? h('button', { type: 'button', class: 'ghost small', title: 'The page is shared, the place is not: reveal the place to the same players', onclick: () => reveal(o) }, 'Also reveal it on the map')
            : null));
    })),
  );
}
