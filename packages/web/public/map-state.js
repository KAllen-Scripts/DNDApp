/**
 * What the Map tab's parts share: the page's map state and small helpers (map.js and its parts).
 */

import { LoggedOut } from './api.js';

const $ = (sel) => document.querySelector(sel);

export const state = {
  campaignId: null,
  userId: null,
  guarded: (fn) => fn(),
  canEdit: false,
  maps: [],
  current: null, // the map on screen
  images: new Map(), // map id -> { key, url } of its image (players' changes with the fog)
  view: { x: 0, y: 0, k: 1 }, // screen = image * k + (x, y)
  fitted: false,
  selected: null, // token id
  drag: null, // a token being moved: { id, start, pointer, x, y, moved }
  pointers: new Map(), // pointers down on the background (panning, pinching)
  draftGrid: undefined, // grid being edited in the settings dialog (shown live)
  fogMode: null, // DM drawing fog: 'reveal' | 'cover'
  fogDraw: null, // the rectangle being drawn: { pointer, a, b }
  wallMode: null, // DM working on walls: 'wall' | 'low' | 'door' | 'curve' | 'circle' | 'lock' | 'light' | 'difficult' | 'link' | 'erase'
  terrainDraw: null, // difficult terrain being drawn: { pointer, a, b }
  wallDraw: null, // the wall being drawn: { pointer, a, b, sx, sy }
  curveBend: null, // a curved wall waiting to be bent: { a, b, m } (m follows the pointer; a click places it)
  live: null, // AbortController for the live stream
  pins: new Map(), // map id -> this person's private pins on it
  pinMode: false, // the next click on the map drops a pin
  selectedPin: null, // pin id
  pinDrag: null, // a pin being moved: { id, pointer, x, y, moved, sx, sy }
  tokenPictures: new Map(), // `${user id}:${picture key}` -> URL of a player's token picture, or null while loading
  measuring: false, // the Measure tool: dragging on the map measures
  ruler: null, // the line being (or last) measured: { pointer, a, b, done }
  templateDraft: null, // a template about to be placed: { shape, size, width, label, color }
  templatePlace: null, // the template being placed: { pointer, a, b }
  selectedTemplate: null, // template id
  selectedDoor: null, // the DM's: a door's id (to open, close, lock or unlock it)
  templateDrag: null, // a template being moved: { id, pointer, grab, x, y, moved, sx, sy }
  caught: new Set(), // tokens inside the selected (or placed) template
  combatOpen: false, // the turn order panel is open
  combatActive: new Map(), // map id -> whether it had a fight when last drawn (the panel opens when one starts)
  pinging: false, // the Ping tool: a click on the map pings it
  drawing: false, // the Draw tool: dragging sketches on the map
  stroke: null, // the sketch being drawn: { pointer, points }
  signals: [], // pings and sketches on screen: { id, kind, map_id, points, color, name, until }
};

export const base = () => `/campaigns/${state.campaignId}/maps`;
export const PICK_KEY = () => `dndapp.map.${state.campaignId}`;
export const SHOW_GRID_KEY = 'dndapp.map.showGrid';
export const SHOW_WALLS_KEY = 'dndapp.map.showWalls';

export function status(text, error = false) {
  const el = $('#map-status');
  el.textContent = text;
  el.classList.toggle('error', error);
}

export const report = (err) => {
  if (err instanceof LoggedOut) throw err;
  status(err.message, true);
};
