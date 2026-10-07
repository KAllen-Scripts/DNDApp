/**
 * Map (prototype): a map you can drag around, zoom, and drop labelled pins on.
 *
 * Leaflet does the panning and zooming (CRS.Simple: flat image coordinates,
 * not the globe). A player picks a map image from their own device; without
 * one there's a plain grid to try it on.
 *
 * Prototype only: the image and the pins are kept in this browser
 * (IndexedDB, per account per campaign), not on the server, until it's
 * decided who owns a map and who sees it (see SPEC §6.6).
 */
import * as L from './vendor/leaflet.js';
import { h } from './api.js';

const $ = (sel) => document.querySelector(sel);
const GRID_SIZE = 1000; // the blank map is GRID_SIZE x GRID_SIZE units
const GRID_STEP = 50;

const state = {
  key: null, // `${userId}:${campaignId}`
  map: null,
  base: null, // the image or grid layer
  imageUrl: null,
  data: null, // { image: Blob|null, width, height, markers: [{ id, lat, lng, label }] }
  pins: new Map(), // marker id -> Leaflet marker
  placing: false,
};

// ---------- storage (this browser only) ----------

const DB_NAME = 'dndapp-maps';
const STORE = 'maps';
let dbPromise;
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const emptyMap = () => ({ image: null, width: GRID_SIZE, height: GRID_SIZE, markers: [] });

async function load(key) {
  try {
    return (await idb('readonly', (s) => s.get(key))) ?? emptyMap();
  } catch {
    return emptyMap(); // private mode or storage blocked: the map still works, it just isn't kept
  }
}
async function save() {
  const { key, data } = state;
  try {
    await idb('readwrite', (s) => s.put(data, key));
    setStatus('');
  } catch {
    setStatus("This browser won't keep the map (private mode?), so it'll be gone after a reload.");
  }
}

const setStatus = (text) => ($('#map-status').textContent = text);

// ---------- drawing ----------

/** A square grid, so there's something to pan and zoom before a map image is chosen. */
function gridLayer() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${GRID_SIZE} ${GRID_SIZE}`);
  svg.setAttribute('class', 'map-grid');
  let d = '';
  for (let i = 0; i <= GRID_SIZE; i += GRID_STEP) d += `M${i} 0V${GRID_SIZE}M0 ${i}H${GRID_SIZE}`;
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return L.svgOverlay(svg, [[0, 0], [GRID_SIZE, GRID_SIZE]]);
}

function drawBase() {
  const { map, data } = state;
  state.base?.remove();
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.imageUrl = null;
  const bounds = L.latLngBounds([0, 0], [data.height, data.width]);
  if (data.image) {
    state.imageUrl = URL.createObjectURL(data.image);
    state.base = L.imageOverlay(state.imageUrl, bounds).addTo(map);
  } else {
    state.base = gridLayer().addTo(map);
  }
  map.setMaxBounds(bounds.pad(0.5));
  map.fitBounds(bounds);
  $('#map-empty').hidden = !!data.image;
}

const pinIcon = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 24], popupAnchor: [0, -24] });

function popupFor(m, marker) {
  const input = h('input', { value: m.label, placeholder: 'Name this place', maxLength: 80, 'aria-label': 'Pin name' });
  input.addEventListener('input', () => {
    m.label = input.value;
    labelPin(marker, m.label);
  });
  input.addEventListener('change', save);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && marker.closePopup());
  const remove = h('button', { type: 'button', class: 'ghost danger', onclick: () => removePin(m.id) }, 'Remove pin');
  return h('div', { class: 'map-popup' }, input, remove);
}

function labelPin(marker, label) {
  marker.unbindTooltip();
  if (label.trim()) marker.bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -24], className: 'map-label' });
}

function addPin(m) {
  const marker = L.marker([m.lat, m.lng], { icon: pinIcon, draggable: true, title: m.label || 'Pin', keyboard: true }).addTo(state.map);
  marker.bindPopup(() => popupFor(m, marker), { minWidth: 180 });
  marker.on('popupopen', (e) => e.popup.getElement()?.querySelector('input')?.focus());
  marker.on('dragend', () => {
    ({ lat: m.lat, lng: m.lng } = marker.getLatLng());
    save();
  });
  labelPin(marker, m.label);
  state.pins.set(m.id, marker);
  return marker;
}

function removePin(id) {
  state.pins.get(id)?.remove();
  state.pins.delete(id);
  state.data.markers = state.data.markers.filter((m) => m.id !== id);
  save();
}

function drawPins() {
  for (const marker of state.pins.values()) marker.remove();
  state.pins.clear();
  for (const m of state.data.markers) addPin(m);
}

function setPlacing(on) {
  state.placing = on;
  $('#map-place').setAttribute('aria-pressed', String(on));
  $('#map').classList.toggle('placing', on);
  if (on) setStatus('Tap the map where the pin should go.');
  else setStatus('');
}

// ---------- setup ----------

function createMap() {
  const map = L.map($('#map'), {
    crs: L.CRS.Simple,
    minZoom: -4,
    maxZoom: 4,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 120,
    attributionControl: false,
  });
  map.on('click', (e) => {
    if (!state.placing) return;
    setPlacing(false);
    const m = { id: crypto.randomUUID(), lat: e.latlng.lat, lng: e.latlng.lng, label: '' };
    state.data.markers.push(m);
    addPin(m).openPopup();
    save();
  });
  return map;
}

/** Read an image file's size, so it can be laid out at 1 unit per pixel. */
function imageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image this browser can show."));
    };
    img.src = url;
  });
}

export function initMapActions() {
  $('#map-place').addEventListener('click', () => setPlacing(!state.placing));
  $('#map-fit').addEventListener('click', () => state.map?.fitBounds([[0, 0], [state.data.height, state.data.width]]));
  $('#map-image').addEventListener('click', () => $('#map-file').click());
  $('#map-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { width, height } = await imageSize(file);
      // Pins on the old map keep their position only if the new map is the same size.
      if (state.data.markers.length && (width !== state.data.width || height !== state.data.height)) {
        if (!confirm('This map is a different size, so the pins on the current map would land in the wrong places. Remove them?')) return;
        state.data.markers = [];
      }
      Object.assign(state.data, { image: file, width, height });
      drawBase();
      drawPins();
      save();
    } catch (err) {
      setStatus(err.message);
    }
  });
  $('#map-clear').addEventListener('click', () => {
    if (!confirm('Remove the map image and all its pins from this browser?')) return;
    state.data = emptyMap();
    drawBase();
    drawPins();
    save();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && state.placing && setPlacing(false));
}

/** Load this player's map for this campaign. Draws when the Map tab is shown. */
export async function loadMap({ campaignId, userId }) {
  state.key = `${userId}:${campaignId}`;
  state.data = await load(state.key);
  setPlacing(false);
  if (state.map) {
    drawBase();
    drawPins();
  }
}

/** Called when the Map tab is shown: Leaflet can only measure a visible map. */
export function showMap() {
  if (!state.data) return;
  if (!state.map) {
    state.map = createMap();
    drawBase();
    drawPins();
  } else {
    state.map.invalidateSize();
  }
}
