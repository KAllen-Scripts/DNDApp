/**
 * The Atlas (#/atlas/<map id>): the table's own map, moved into the wiki's
 * space (not a copy, so it keeps its live stream and everything on it), with
 * the play tools hidden (<html data-browse>) and the wiki's layers on
 * (map-wiki.js). Leaving puts it back where it was. View as a player filters
 * the layers to what they may see; their fog isn't recreated.
 */
import { h } from './api.js';
import { state, nav, playerName } from './wiki-data.js';
import { openMapAt, fitMap, setTool } from './map.js';
import { setWikiLayers, pulseWikiPin } from './map-wiki.js';
import { state as mapState } from './map-state.js';
import { atlasOrder } from './shared/map.js';
import { timeSlider } from './wiki-asof.js';

const $ = (sel) => document.querySelector(sel);
let home = null; // where the map panel lives at the table: a marker left in its place

/** Is the map in the wiki now? */
export const inAtlas = () => !!home;

/** Put the map back at the table (before any other view of the wiki draws, and on going back to the table). */
export function leaveAtlas() {
  if (!home) return;
  mapState.placeForDone?.();
  const panel = $('#tab-map');
  home.replaceWith(panel);
  home = null;
  panel.hidden = true;
  delete document.documentElement.dataset.browse;
  $('#wiki-view')?.classList.remove('wiki-atlas-on');
  setWikiLayers({ forced: false, as: null, at: null });
}

/** The map the Atlas opens without one named: the one at the top of the world. */
const topMap = () => atlasOrder(mapState.maps)[0]?.map ?? null;

/** The map the Atlas shows: the one named, else the top one (state.atlasMap set, so the address can say it). */
export function pickAtlasMap() {
  const map = (state.atlasMap && mapState.maps.find((m) => m.id === state.atlasMap)) || topMap();
  state.atlasMap = map?.id ?? null;
  return map;
}

/** Draw the Atlas into the wiki's main area, on this map (or the top one). */
export async function drawAtlas(main) {
  const panel = $('#tab-map');
  const map = pickAtlasMap();
  if (!map) {
    leaveAtlas();
    main.replaceChildren(h('div', { class: 'wiki-atlas-empty' },
      h('h2', {}, 'The Atlas'),
      h('p', { class: 'muted' }, state.dm ? 'No maps yet. Import one on the Map tab; its places can then link to pages here.' : 'No maps to see yet. Your DM shares them here.')));
    return;
  }
  const viewAs = !state.dm ? null : h('select', { 'aria-label': 'View as', title: 'Show the layers as a player would get them' },
    h('option', { value: '' }, 'As you see it'),
    ...state.players.map((p) => h('option', { value: String(p.id) }, `As ${p.character_name || p.name}`)));
  const note = h('span', { class: 'muted small' });
  viewAs?.addEventListener('change', () => {
    const as = viewAs.value ? Number(viewAs.value) : null;
    note.textContent = as ? `Only the places revealed to ${playerName(as)} and the pages they may see. Their fog isn’t shown.` : '';
    setWikiLayers({ forced: true, as });
  });
  // As it was at the end of a session (stage 11): the pages then, and where the tokens stood.
  const slider = timeSlider(null, (at) => setWikiLayers({ forced: true, at }));
  const placing = h('div', { class: 'wiki-atlas-placing', role: 'status', hidden: true });
  const bar = h('div', { class: 'wiki-atlas-bar' }, ...[h('h2', {}, 'Atlas'), viewAs, slider, note, placing].filter(Boolean));
  if (!home) {
    home = document.createComment('map panel');
    panel.replaceWith(home);
  }
  main.replaceChildren(h('div', { class: 'wiki-atlas' }, bar, panel));
  panel.hidden = false;
  document.documentElement.dataset.browse = '';
  $('#wiki-view')?.classList.add('wiki-atlas-on');
  setWikiLayers({ forced: true, as: null, at: null });
  await openMapAt(map.id);
  requestAnimationFrame(() => fitMap());
  if (focus?.map_id === map.id) {
    const at = focus;
    focus = null;
    requestAnimationFrame(() => openMapAt(at.map_id, { x: at.x, y: at.y }));
    pulseWikiPin(at.place_id);
  }
  if (pending) {
    const page = pending;
    pending = null;
    startPlacing(page, placing);
  }
}

let pending = null; // a page to put on the map once the Atlas has drawn
let focus = null; // a place to show once the Atlas has drawn: { map_id, place_id, x, y }

/** The Timeline's Show on the map: the Atlas on that map, the place in the middle, its pin pulsing with its card open. */
export function showOnMap(place) {
  focus = place;
  state.atlasMap = place.map_id;
  if (state.view === 'atlas' && inAtlas()) nav.drawMain();
  else nav.go(`#/atlas/${place.map_id}`);
}

/** Click (or drag) on the map in the Atlas to put this page there as a place: the place dialog opens named and linked. */
function startPlacing(page, banner) {
  const stop = () => {
    mapState.placeFor = null;
    mapState.placeForDone = null;
    setTool({});
    banner.hidden = true;
  };
  mapState.placeFor = { id: page.id, title: page.title };
  mapState.placeForDone = stop;
  setTool({ wallMode: 'place' });
  banner.hidden = false;
  banner.replaceChildren(h('span', {}, `Click where ${page.title} goes, or drag out its area.`), h('button', { type: 'button', class: 'ghost small', onclick: stop }, 'Cancel'));
}

/** From a page: choose a map, then put the page on it in the Atlas. */
export function putOnMap(page) {
  const maps = atlasOrder(mapState.maps);
  if (!maps.length) return;
  let d = $('#wiki-put-dialog');
  if (!d) {
    d = h('dialog', { id: 'wiki-put-dialog', class: 'map-dialog wiki-dialog', 'aria-label': 'Put it on a map' });
    document.body.append(d);
  }
  const pick = h('select', { 'aria-label': 'Which map' }, ...maps.map(({ map: m, depth }) => new Option(`${'   '.repeat(depth)}${depth ? '↳ ' : ''}${m.name}`, m.id)));
  d.replaceChildren(h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
    e.preventDefault();
    d.close();
    pending = page;
    nav.go(`#/atlas/${pick.value}`);
  } },
    h('h2', {}, `Put ${page.title} on a map`),
    h('p', { class: 'muted small' }, 'Pick the map; then click on it where it goes (or drag out an area). It becomes a place there, linked to this page and hidden from players until you reveal it.'),
    pick,
    h('div', { class: 'map-dialog-actions' },
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'ghost', onclick: () => d.close() }, 'Cancel'),
      h('button', { class: 'primary' }, 'Choose the spot'))));
  d.showModal();
}
nav.putOnMap = putOnMap;

// The map shown in the Atlas changes (a place that opens a map, the map picker): the address follows.
document.addEventListener('dndmapshown', (e) => {
  if (!home || state.view !== 'atlas' || e.detail?.id === state.atlasMap) return;
  state.atlasMap = e.detail?.id ?? null;
  nav.routed();
});
