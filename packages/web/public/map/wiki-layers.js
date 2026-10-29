/**
 * The wiki's layers on a map (DM): place pins with the page's picture, faction
 * lands in the faction's colour, people at their token or where their page
 * says they are, and quests at their place or with whoever gave them. A pin
 * opens a card: picture, kind, opening words, counts, Open page and Open its
 * map. On from the map bar's Wiki button (remembered in this browser), and
 * always in the wiki's Atlas (wiki/views/atlas.js). The server works the layers out
 * from the pages the viewer may see (GET …/wiki/atlas?map=&as=).
 */
import { api, h, storage } from '../page/api.js';
import { KIND_FAMILIES } from '/shared/wiki.js';
import { nav, pictureImg } from '../wiki/data.js';
import { state } from './state.js';
import { show, svgEl } from './map.js';

const KEY = 'dndapp.map.wikiLayers';
const $ = (sel) => document.querySelector(sel);

const layer = {
  forced: false, // the Atlas has them on whatever the button says
  as: null, // view as this player (the Atlas's View as)
  at: null, // the moment shown (the Atlas's As of, stage 11), or null for now
  data: null, // { key, layers }
  loading: null,
  card: null, // what the open card is for: 'pin:<place id>' | 'person:<page id>' | 'quest:<page id>'
  pulse: null, // a place's pin to draw the eye to (the Timeline's Show on the map), for a few seconds
};

/** Draw the eye to a place's pin (its card open) for a few seconds. */
export function pulseWikiPin(placeId) {
  layer.pulse = `pin:${placeId}`;
  layer.card = layer.pulse;
  renderWikiLayers();
  setTimeout(() => {
    if (layer.pulse !== `pin:${placeId}`) return;
    layer.pulse = null;
    renderWikiLayers();
  }, 4000);
}

const on = () => state.canEdit && (layer.forced || storage.get(KEY) === 'on');
const keyOf = (map) => `${map.id}|${map.version ?? ''}|${layer.as ?? ''}|${layer.at ?? ''}`;

/** The Atlas turns the layers on (and View as a player), or back to the button's setting. */
export function setWikiLayers({ forced = layer.forced, as = layer.as, at = layer.at } = {}) {
  layer.forced = forced;
  layer.as = as;
  layer.at = forced ? at : null;
  // In the past, the live tokens fade and where they stood then shows instead.
  document.documentElement.classList.toggle('map-asof', !!layer.at);
  layer.data = null;
  renderWikiLayers();
}

/** The pages changed (a save in the wiki): fetch the layers again next time. */
export function wikiLayersStale() {
  layer.data = null;
  if (on()) renderWikiLayers();
}

async function load(map) {
  const key = keyOf(map);
  if (layer.data?.key === key) return layer.data.layers;
  if (layer.loading?.key === key) return layer.loading.promise;
  const promise = api('GET', `/campaigns/${state.campaignId}/wiki/atlas?map=${encodeURIComponent(map.id)}${layer.as ? `&as=${layer.as}` : ''}${layer.at ? `&at=${encodeURIComponent(layer.at)}` : ''}`)
    .then((res) => {
      layer.data = { key, layers: res.layers };
      return res.layers;
    })
    .catch(() => null)
    .finally(() => { if (layer.loading?.key === key) layer.loading = null; });
  layer.loading = { key, promise };
  return promise;
}

function openPageFrom(id) {
  if (document.documentElement.dataset.space === 'wiki') nav.openPage(id);
  else nav.drawer(id);
}

function card(item, kind) {
  const p = item.page;
  const family = KIND_FAMILIES[p.family] ?? KIND_FAMILIES.other;
  const counts = item.counts
    ? [[item.counts.inside, 'inside'], [item.counts.people, item.counts.people === 1 ? 'person' : 'people'], [item.counts.quests, item.counts.quests === 1 ? 'quest' : 'quests']].filter(([n]) => n).map(([n, w]) => `${n} ${w}`).join(' · ')
    : '';
  const target = item.to && state.maps.find((m) => m.id === item.to);
  return h('div', { class: `map-wiki-card fam-${p.family}`, role: 'dialog', 'aria-label': p.title, onclick: (e) => e.stopPropagation(), onpointerdown: (e) => e.stopPropagation() },
    p.picture ? h('div', { class: 'map-wiki-card-art' }, pictureImg(p.picture, { size: 'thumb', alt: '' })) : null,
    h('div', { class: 'map-wiki-card-body' },
      h('div', { class: 'map-wiki-card-kind small' }, h('span', { 'aria-hidden': 'true' }, family.icon), ` ${p.kind || family.label}`),
      h('strong', {}, p.title),
      p.excerpt ? h('p', { class: 'small' }, p.excerpt) : null,
      counts ? h('p', { class: 'muted small' }, counts) : null,
      kind === 'person' && item.from === 'place' ? h('p', { class: 'muted small' }, 'Here by their page’s “Where they are”.') : null,
      h('div', { class: 'map-wiki-card-actions' },
        h('button', { type: 'button', class: 'primary small', onclick: () => openPageFrom(p.id) }, 'Open page'),
        target ? h('button', { type: 'button', class: 'ghost small', onclick: () => { layer.card = null; show(target); } }, `Open ${target.name}`) : null,
        p.dated && document.documentElement.dataset.space === 'wiki' ? h('button', { type: 'button', class: 'ghost small', onclick: () => nav.go(`#/timeline/${p.id}`) }, 'On the timeline') : null,
        h('button', { type: 'button', class: 'ghost small', 'aria-label': 'Close', onclick: () => { layer.card = null; renderWikiLayers(); } }, '✕'))));
}

function badge(item, kind, id, { dx = 0 } = {}) {
  const p = item.page;
  const el = h('button', {
    type: 'button',
    class: `map-wiki-pin ${kind} fam-${p.family}${p.picture ? ' has-picture' : ''}${layer.pulse === id ? ' pulse' : ''}`,
    title: p.title,
    'aria-label': `${p.title} (wiki)`,
    onclick: (e) => {
      e.stopPropagation();
      layer.card = layer.card === id ? null : id;
      renderWikiLayers();
    },
    onpointerdown: (e) => e.stopPropagation(),
  }, p.picture ? pictureImg(p.picture, { size: 'thumb', alt: '' }) : h('span', { 'aria-hidden': 'true' }, kind === 'quest' ? '✦' : (KIND_FAMILIES[p.family] ?? KIND_FAMILIES.other).icon));
  const wrap = h('div', { class: 'map-wiki-at' }, el, layer.card === id ? card(item, kind) : null);
  wrap.style.cssText = `left:${item.x}px;top:${item.y}px;--dx:${dx}px`;
  return wrap;
}

/** Draw the layers for the map on screen (or clear them). Called from map.js render(). */
export async function renderWikiLayers() {
  const map = state.current;
  const button = $('#map-wiki-layers');
  if (button) {
    button.hidden = !state.canEdit || layer.forced;
    button.setAttribute('aria-pressed', String(on()));
  }
  const areas = $('#map-wiki-lands');
  const pins = $('#map-wiki');
  if (!areas || !pins) return;
  if (!map || !on()) {
    areas.replaceChildren();
    pins.replaceChildren();
    return;
  }
  const layers = await load(map);
  if (state.current !== map || !on()) return;
  areas.setAttribute('viewBox', `0 0 ${map.image.width} ${map.image.height}`);
  if (!layers) {
    areas.replaceChildren();
    pins.replaceChildren(h('p', { class: 'map-wiki-none small' }, layer.as ? 'That player can’t see this map.' : ''));
    return;
  }
  areas.replaceChildren(...layers.lands.map((l) => svgEl('polygon', { points: l.points.map((q) => q.join(',')).join(' '), class: `map-wiki-land fam-${l.page.family}` })));
  // Several things at one spot sit side by side.
  const seen = new Map();
  const spread = (item) => {
    const k = `${Math.round(item.x)},${Math.round(item.y)}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return { dx: n * 34 };
  };
  pins.replaceChildren(
    ...layers.pins.map((p) => badge(p, 'place', `pin:${p.place_id}`, spread(p))),
    ...layers.people.map((p) => badge(p, 'person', `person:${p.page.id}`, spread(p))),
    ...layers.quests.map((q) => badge(q, 'quest', `quest:${q.page.id}`, spread(q))),
    // Where the tokens stood then (stage 11).
    ...(layer.at ? layers.then_tokens ?? [] : []).map((t) => {
      const el = h('div', { class: `map-wiki-at map-then-token kind-${t.kind}${t.hidden ? ' hidden-token' : ''}`, title: `${t.name}${t.going_to ? `, on the way to ${t.going_to}` : ''}` },
        h('span', { class: 'map-then-dot', 'aria-hidden': 'true' }), h('span', { class: 'map-then-name small' }, t.name));
      el.style.cssText = `left:${t.x}px;top:${t.y}px`;
      return el;
    }),
  );
}

/** The map bar's Wiki button. */
export function initWikiLayers() {
  const button = $('#map-wiki-layers');
  button?.addEventListener('click', () => {
    storage.set(KEY, storage.get(KEY) === 'on' ? null : 'on');
    layer.card = null;
    renderWikiLayers();
  });
  // A click on the map elsewhere closes an open card.
  $('#map-view')?.addEventListener('click', () => {
    if (!layer.card) return;
    layer.card = null;
    renderWikiLayers();
  });
}
