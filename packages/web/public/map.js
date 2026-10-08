/**
 * The Map tab: maps the DM imported, with tokens for characters, enemies and
 * NPCs. The DM imports maps, sets them up and places tokens; players move
 * their own token. Every change comes back from the server over a live
 * stream, so everyone sees the same map.
 *
 * The page only displays and sends what people do. Snapping and measuring
 * while dragging use the same rules the server applies (./shared/map.js);
 * the server decides where a token really ends up.
 */
import { api, listen, fileUrl, h, storage, LoggedOut, readBase64 } from './api.js';
import { marked } from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';
import {
  TOKEN_KINDS, TOKEN_KIND_NAMES, TOKEN_SIZES, TOKEN_SIZE_NAMES, TOKEN_COLORS, UNITS,
  CONDITIONS, snapToken, tokenPx, measure, formatDistance, fogRect, healthOf,
  fogMask, FOG_MASK_FILL, snapWallPoint, nearestWall,
  LIGHT_PRESETS, pxPerUnit, squarePx, pathCost, pointInPolygon, TEMPLATE_SHAPES, TEMPLATE_SHAPE_NAMES, TEMPLATE_COLOR, templateShape, tokensInTemplate, inTemplate, snapTemplatePoint, spellArea,
} from './shared/map.js';
import { creatureList, creatureSaved } from './creatures.js';

const $ = (sel) => document.querySelector(sel);
const KIND_LABELS = { battle: 'Battle map', dungeon: 'Dungeon', building: 'Building', town: 'Town', region: 'Region', world: 'World', other: 'Map' };
const MAX_ZOOM = 8;

const state = {
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
  wallMode: null, // DM working on walls: 'wall' | 'low' | 'door' | 'lock' | 'light' | 'difficult' | 'link' | 'erase'
  terrainDraw: null, // difficult terrain being drawn: { pointer, a, b }
  wallDraw: null, // the wall being drawn: { pointer, a, b, sx, sy }
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

const base = () => `/campaigns/${state.campaignId}/maps`;
const PICK_KEY = () => `dndapp.map.${state.campaignId}`;
const SHOW_GRID_KEY = 'dndapp.map.showGrid';

function status(text, error = false) {
  const el = $('#map-status');
  el.textContent = text;
  el.classList.toggle('error', error);
}

const report = (err) => {
  if (err instanceof LoggedOut) throw err;
  status(err.message, true);
};

// ---------- loading, and staying up to date ----------

/** Show the maps for this campaign (called when entering a campaign). */
export async function loadMaps({ campaignId, userId, guarded }) {
  state.live?.abort();
  Object.assign(state, { campaignId, userId, guarded, current: null, selected: null, fitted: false });
  for (const { url } of state.images.values()) URL.revokeObjectURL(url);
  state.images.clear();
  for (const url of state.tokenPictures.values()) if (url) URL.revokeObjectURL(url);
  state.tokenPictures.clear();
  const { can_edit, maps } = await api('GET', base());
  state.canEdit = can_edit;
  state.maps = maps;
  $('#tab-map').classList.toggle('can-edit', can_edit);
  const remembered = maps.find((m) => m.id === storage.get(PICK_KEY()));
  await show(remembered ?? maps.at(-1) ?? null);
  startLive();
}

/** Keep listening for changes; reconnect after a dropped connection. */
function startLive() {
  const controller = new AbortController();
  state.live = controller;
  const cid = state.campaignId;
  (async () => {
    let wait = 1000;
    while (!controller.signal.aborted) {
      try {
        await listen(`/campaigns/${cid}/maps/events`, (event, data) => {
          wait = 1000;
          if (event === 'map') onMap(data);
          else if (event === 'gone') onGone(data.id);
          else if (event === 'ping' || event === 'draw') onSignal(event, data);
        }, { signal: controller.signal });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof LoggedOut) return state.guarded(() => { throw err; });
      }
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 2, 30_000);
      // Catch up on anything missed while disconnected.
      if (!controller.signal.aborted) {
        try {
          const { maps } = await api('GET', base());
          state.maps = maps;
          const current = maps.find((m) => m.id === state.current?.id) ?? null;
          if (current) onMap(current);
          else if (state.current) await show(maps.at(-1) ?? null);
          renderPicker();
        } catch { /* try again on the next round */ }
      }
    }
  })();
}

function onMap(map) {
  const i = state.maps.findIndex((m) => m.id === map.id);
  if (i >= 0 && state.maps[i].version > map.version) return; // an older update arriving late
  if (i >= 0) state.maps[i] = map;
  else state.maps.push(map);
  renderPicker();
  if (state.current?.id === map.id) {
    state.current = map;
    render();
  } else if (!state.current) {
    show(map);
  }
}

function onGone(id) {
  state.maps = state.maps.filter((m) => m.id !== id);
  renderPicker();
  if (state.current?.id === id) show(state.maps.at(-1) ?? null);
}

/** Put a map on screen (or the empty message). */
async function show(map) {
  state.current = map;
  state.selected = null;
  state.selectedPin = null;
  state.selectedTemplate = null;
  state.selectedDoor = null;
  state.ruler = null;
  state.fitted = false;
  if (map) storage.set(PICK_KEY(), map.id);
  renderPicker();
  render();
  if (!map) return;
  loadPins(map);
  await loadImage(map);
  if (state.current?.id === map.id) fit();
}

/** This person's own pins on a map (nobody else ever gets them). */
async function loadPins(map) {
  try {
    const res = await state.guarded(() => api('GET', `${base()}/${map.id}/pins`));
    if (!res) return;
    state.pins.set(map.id, res.pins);
    if (state.current?.id === map.id) renderPins();
  } catch (err) {
    report(err);
  }
}

/** Fetch the map's image if this viewer's version of it changed (players: the fog moved). */
async function loadImage(map) {
  try {
    let entry = state.images.get(map.id);
    if (entry?.key !== map.image_key) {
      const url = await fileUrl(`${base()}/${map.id}/image?v=${encodeURIComponent(map.image_key)}`);
      if (entry) URL.revokeObjectURL(entry.url);
      entry = { key: map.image_key, url };
      state.images.set(map.id, entry);
    }
    if (state.current?.id === map.id && $('#map-image').getAttribute('src') !== entry.url) $('#map-image').src = entry.url;
  } catch (err) {
    report(err);
  }
}

// ---------- drawing ----------

function renderPicker() {
  const select = $('#map-pick');
  select.replaceChildren(
    ...state.maps.map((m) => new Option(`${m.name}${state.canEdit && !m.shown ? ' (hidden)' : ''}`, m.id)),
  );
  select.value = state.current?.id ?? '';
  select.hidden = !state.maps.length;
}

function render() {
  const map = state.current;
  const empty = $('#map-empty');
  renderVariantPicker();
  $('#map-stage').hidden = !map;
  for (const b of document.querySelectorAll('.map-needs-map')) b.disabled = !map;
  if (!map) {
    $('#map-image').removeAttribute('src');
    $('#map-tokens').replaceChildren();
    $('#map-pins').replaceChildren();
    $('#map-links').replaceChildren();
    $('#map-templates').replaceChildren();
    $('#map-ruler-line').replaceChildren();
    renderSelection();
    renderCombat();
    $('#map-signals').replaceChildren();
    empty.hidden = false;
    empty.textContent = state.canEdit
      ? 'No maps yet. Import one: a battle map, a town, a region, anything. The AI reads its grid and scale, then you can add tokens.'
      : 'No maps to see yet. Your DM shares them here.';
    status('');
    return;
  }
  empty.hidden = true;
  const { width, height } = map.image;
  const stage = $('#map-stage');
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  renderGrid();
  renderTerrain();
  renderFog();
  renderWalls();
  renderTemplates();
  renderTokens();
  renderRuler();
  renderLinks();
  renderPins();
  renderSelection();
  renderFogTools();
  renderCombat();
  renderSignals();
  if (state.images.has(map.id) && state.images.get(map.id).key !== map.image_key) loadImage(map);
  const reading = map.reading.status;
  if (reading === 'pending') status('The AI is reading this map…');
  else if (reading === 'failed' && state.canEdit) status(map.reading.error || "The AI couldn't read this map.", true);
  else if (state.canEdit && map.wall_draft.status === 'pending') status('The AI is tracing the walls…');
  else if (state.canEdit && map.wall_draft.status === 'failed') status(map.wall_draft.error || "The AI couldn't draft walls.", true);
  else status([KIND_LABELS[map.kind], scaleText(map), state.canEdit && !map.shown ? 'hidden from players' : ''].filter(Boolean).join(' · '));
}

function scaleText(map) {
  const s = map.scale;
  if (!s) return map.grid ? 'grid, no scale' : '';
  return s.per === 'square' ? `1 square = ${s.distance} ${s.unit}` : `${s.distance} ${s.unit} across`;
}

function renderGrid() {
  const map = state.current;
  const grid = state.draftGrid !== undefined ? state.draftGrid : map.grid;
  const svg = $('#map-grid');
  const showGrid = state.draftGrid !== undefined || storage.get(SHOW_GRID_KEY) === '1';
  svg.setAttribute('viewBox', `0 0 ${map.image.width} ${map.image.height}`);
  svg.replaceChildren();
  if (!grid || !showGrid) return;
  const lines = [];
  for (let x = grid.x; x <= map.image.width; x += grid.size) lines.push(`M${x} 0V${map.image.height}`);
  for (let y = grid.y; y <= map.image.height; y += grid.size) lines.push(`M0 ${y}H${map.image.width}`);
  if (lines.length > 4000) return; // a mistyped tiny square; don't freeze the page
  // A dark outline under a light line, so the grid shows on both dark and light maps.
  const d = lines.join('');
  const editing = state.draftGrid !== undefined ? ' editing' : '';
  svg.append(svgEl('path', { d, class: `halo${editing}` }), svgEl('path', { d, class: `line${editing}` }));
}

const SVG = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/**
 * Fog of war: the DM sees their rectangles shaded; players see what the
 * server worked out for them (covered parts dark, places seen before dim;
 * their image is blacked out there too).
 */
function renderFog() {
  const map = state.current;
  const svg = $('#map-fog');
  const { width, height } = map.image;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.classList.toggle('dm', state.canEdit);
  svg.replaceChildren();
  const shapes = state.canEdit ? fogMask(map) : (map.fog?.mask ?? []);
  if (shapes.length) {
    const mask = svgEl('mask', { id: 'map-fog-mask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width, height });
    const defs = svgEl('defs', {});
    const pts = (list) => list.map((p) => p.join(',')).join(' ');
    shapes.forEach((r, i) => {
      const fill = FOG_MASK_FILL[r.fill];
      if (!r.points) return mask.append(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill }));
      const poly = svgEl('polygon', { points: pts(r.points), fill });
      // A lit place, cut to what the token can see.
      if (r.clip) {
        const clip = svgEl('clipPath', { id: `map-fog-clip-${i}`, clipPathUnits: 'userSpaceOnUse' });
        clip.append(svgEl('polygon', { points: pts(r.clip) }));
        defs.append(clip);
        poly.setAttribute('clip-path', `url(#map-fog-clip-${i})`);
      }
      mask.append(poly);
    });
    defs.append(mask);
    svg.append(defs, svgEl('rect', { width, height, class: 'fog', mask: 'url(#map-fog-mask)' }));
  }
  if (state.fogDraw) {
    const r = fogRect(map, state.fogDraw.a, state.fogDraw.b);
    svg.append(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, class: `fog-draft ${state.fogMode}` }));
  }
}

function renderFogTools() {
  const map = state.current;
  const tools = $('#map-fog-tools');
  const walls = $('#map-wall-tools');
  walls.hidden = tools.hidden;
  $('#map-fog-open').setAttribute('aria-pressed', String(!tools.hidden));
  $('#map-view').classList.toggle('fog-drawing', !!map && ((!!state.fogMode && !!map.fog?.enabled) || !!state.wallMode));
  if (tools.hidden || !map) return;
  $('#map-fog-on').checked = !!map.fog?.enabled;
  $('#map-fog-map').value = map.fog.map;
  $('#map-fog-map').disabled = !map.fog.enabled;
  for (const b of tools.querySelectorAll('[data-fog-mode]')) {
    b.setAttribute('aria-pressed', String(state.fogMode === b.dataset.fogMode));
    b.disabled = !map.fog?.enabled;
  }
  for (const b of tools.querySelectorAll('[data-fog-action]')) b.disabled = !map.fog?.enabled;
  const sight = $('#map-sight-on');
  sight.checked = !!map.fog?.sight;
  sight.disabled = !map.fog?.enabled;
  const dark = $('#map-dark-on');
  dark.checked = !!map.fog?.dark;
  dark.disabled = !map.fog?.enabled || !map.fog.sight;
  const memory = $('#map-memory-on');
  memory.checked = map.fog.memory;
  memory.disabled = !map.fog.enabled || !map.fog.sight || map.fog.map !== 'dark';
  for (const b of walls.querySelectorAll('[data-wall-mode]')) b.setAttribute('aria-pressed', String(state.wallMode === b.dataset.wallMode));
  // Where a new link leads: any other map.
  const linkTo = $('#map-link-to');
  const others = state.maps.filter((m) => m.id !== map.id);
  const chosen = linkTo.value;
  linkTo.replaceChildren(...others.map((m) => new Option(m.name, m.id)));
  if (others.some((m) => m.id === chosen)) linkTo.value = chosen;
  linkTo.disabled = !others.length;
  walls.querySelector('[data-wall-mode="link"]').disabled = !others.length;
  $('#map-walls-draft').disabled = map.wall_draft.status === 'pending';
  walls.querySelector('[data-wall-action="clear-ai"]').disabled = ![...map.walls, ...(map.lights ?? []), ...(map.terrain ?? [])].some((w) => w.source === 'ai');
  walls.querySelector('[data-wall-action="forget"]').disabled = !map.fog?.enabled || !map.fog.sight || !map.fog.memory;
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const doors = map.walls.filter((w) => w.door).length;
  const low = map.walls.filter((w) => w.kind === 'low').length;
  $('#map-wall-hint').textContent = !map.fog?.enabled
    ? 'Turn on Fog of war first. Then, with Line of sight, players see what their own token can see past the walls.'
    : map.fog.sight
      ? `${count(map.walls.length - doors - low, 'wall')}, ${count(low, 'obstacle')}, ${count(doors, 'door')}, ${count(map.lights?.length ?? 0, 'light')}. Players see what their own token can see${map.fog.dark ? ' where there is light or their darkvision reaches' : ''}, and open doors next to them.`
      : 'Players only see what you reveal. Tick Line of sight to let their tokens see past the walls.';
}

/**
 * Walls and doors. The DM sees them all (walls the AI drafted and obstacles
 * in their own colours); players only get the doors they can see, to click.
 */
function renderWalls() {
  const map = state.current;
  const svg = $('#map-walls');
  svg.setAttribute('viewBox', `0 0 ${map.image.width} ${map.image.height}`);
  svg.classList.toggle('players', !state.canEdit);
  svg.replaceChildren();
  const list = state.canEdit ? map.walls : (map.doors ?? []);
  const line = (w, cls) => svgEl('line', { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, class: cls });
  const cls = (w) => (w.door || !state.canEdit
    ? `door${w.open ? ' open' : ''}${w.locked ? ' locked' : ''}`
    : `wall${w.kind === 'low' ? ' low' : ''}${w.source === 'ai' ? ' ai' : ''}`);
  // Lights (the DM's): the dim reach, the bright reach and the source.
  if (state.canEdit) {
    const k = pxPerUnit(map);
    for (const l of map.lights ?? []) {
      svg.append(
        svgEl('circle', { cx: l.x, cy: l.y, r: (l.bright + l.dim) * k, class: `light-dim${l.source === 'ai' ? ' ai' : ''}` }),
        svgEl('circle', { cx: l.x, cy: l.y, r: l.bright * k, class: 'light-bright' }),
        svgEl('circle', { cx: l.x, cy: l.y, r: Math.max(3, squarePx(map) / 8), class: 'light-dot' }),
      );
    }
  }
  const doors = list.filter((w) => w.door || !state.canEdit);
  for (const w of list) if (!doors.includes(w)) svg.append(line(w, 'wall-halo'));
  for (const w of list) if (!doors.includes(w)) svg.append(line(w, cls(w)));
  // Doors on top, drawn as doors so nobody mistakes them for walls.
  for (const w of doors) svg.append(doorShape(map, w, cls(w)));
  const d = state.wallDraw;
  if (d) svg.append(line({ x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y }, `wall-draft${state.wallMode === 'door' || state.wallMode === 'low' ? ` ${state.wallMode}` : ''}`));
}

/**
 * A door as a door: frame posts at both sides of the doorway, the door itself
 * as a thick plank across it (swung open from its hinge when open), and a
 * badge in the middle (a door, or a padlock when it's locked).
 */
function doorShape(map, w, cls) {
  const g = svgEl('g', { class: `door-shape${w.id === state.selectedDoor ? ' selected' : ''}` });
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
  const ux = (w.x2 - w.x1) / len;
  const uy = (w.y2 - w.y1) / len;
  const sq = squarePx(map);
  const r = Math.min(Math.max(8, sq * 0.28), len / 2.2 || 8);
  const post = Math.min(len / 3, sq * 0.25);
  const line = (x1, y1, x2, y2, c) => svgEl('line', { x1, y1, x2, y2, class: c });
  // The frame: short posts across the doorway at each end.
  for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) g.append(line(x - uy * post, y + ux * post, x + uy * post, y - ux * post, 'door-post'));
  if (w.open) {
    // The doorway stays marked, and the door stands open from its hinge (the first end).
    const ex = w.x1 - uy * len;
    const ey = w.y1 + ux * len;
    g.append(
      line(w.x1, w.y1, w.x2, w.y2, 'doorway'),
      svgEl('path', { d: `M ${w.x2} ${w.y2} A ${len} ${len} 0 0 1 ${ex} ${ey}`, class: 'door-swing' }),
      line(w.x1, w.y1, ex, ey, 'wall-halo'),
      line(w.x1, w.y1, ex, ey, `${cls} door-leaf`),
    );
    return g;
  }
  g.append(line(w.x1, w.y1, w.x2, w.y2, 'wall-halo door-halo'), line(w.x1, w.y1, w.x2, w.y2, cls), line(w.x1, w.y1, w.x2, w.y2, 'door-grain'));
  const badge = svgEl('g', { class: `door-badge${w.locked ? ' locked' : ''}`, transform: `translate(${(w.x1 + w.x2) / 2} ${(w.y1 + w.y2) / 2}) scale(${r / 10})` });
  badge.append(svgEl('circle', { r: 10, class: 'door-badge-bg' }));
  if (w.locked) {
    badge.append(
      svgEl('path', { d: 'M -3.5 -1 V -3.5 A 3.5 3.5 0 0 1 3.5 -3.5 V -1', class: 'glyph-line' }),
      svgEl('rect', { x: -5.5, y: -1, width: 11, height: 8, rx: 1.2, class: 'glyph-fill' }),
      svgEl('circle', { cx: 0, cy: 2.6, r: 1.3, class: 'glyph-hole' }),
    );
  } else {
    badge.append(
      svgEl('rect', { x: -4, y: -6.5, width: 8, height: 13, rx: 0.8, class: 'glyph-line' }),
      svgEl('circle', { cx: 1.8, cy: 0.5, r: 1.1, class: 'glyph-dot' }),
    );
  }
  g.append(badge);
  return g;
}

/** Difficult terrain: hatched areas (players get the ones they can see). */
function renderTerrain() {
  const map = state.current;
  const svg = $('#map-terrain');
  svg.setAttribute('viewBox', `0 0 ${map.image.width} ${map.image.height}`);
  svg.classList.toggle('players', !state.canEdit);
  const size = squarePx(map) / 3;
  const pattern = svgEl('pattern', { id: 'map-terrain-hatch', patternUnits: 'userSpaceOnUse', width: size, height: size, patternTransform: 'rotate(45)' });
  pattern.append(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: size, class: 'hatch' }));
  const defs = svgEl('defs', {});
  defs.append(pattern);
  const pts = (list) => list.map((p) => p.join(',')).join(' ');
  svg.replaceChildren(defs, ...(map.terrain ?? []).map((a) => svgEl('polygon', { points: pts(a.points), class: `difficult${a.source === 'ai' ? ' ai' : ''}` })));
  if (state.terrainDraw) {
    const r = fogRect(map, state.terrainDraw.a, state.terrainDraw.b);
    svg.append(svgEl('polygon', { points: pts([[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]), class: 'difficult' }));
  }
}

async function terrain(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/terrain`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

/** Open or close a door (anyone: players only doors next to their token; the server checks). */
async function toggleDoor(door) {
  try {
    const saved = await state.guarded(() => api('POST', `${base()}/${state.current.id}/doors/${door.id}/toggle`, {}));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

/** The door under a click, if any (the DM's from all walls, a player's from the doors they can see). */
function doorAt(clientX, clientY) {
  const map = state.current;
  const doors = state.canEdit ? map.walls.filter((w) => w.door) : (map.doors ?? []);
  return nearestWall({ walls: doors }, toImage(clientX, clientY), SNAP_PX / state.view.k);
}

async function lights(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/lights`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

async function walls(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/walls`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

/** Set the DM's tool: a fog mode, a wall mode, or none (they're exclusive, and exclusive with placing a pin). */
function setTool({ fogMode = null, wallMode = null }) {
  state.fogMode = fogMode;
  state.wallMode = wallMode;
  if (fogMode || wallMode) Object.assign(state, { pinMode: false, measuring: false, templateDraft: null, ruler: null, pinging: false, drawing: false });
  renderPinTool();
  renderFogTools();
  renderMeasureTools();
}

async function fog(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/fog`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

const initials = (name) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

/**
 * The URL of a token's picture (a player character's own, or the one the DM
 * gave an NPC or enemy), or null until it's loaded (the tokens are drawn
 * again then). Each picture is fetched once.
 */
function tokenPicture(t) {
  if (!t.picture || (t.kind === 'pc' && t.user_id == null)) return null;
  const key = t.kind === 'pc' ? `${t.user_id}:${t.picture}` : `art:${t.picture}`;
  if (state.tokenPictures.has(key)) return state.tokenPictures.get(key);
  state.tokenPictures.set(key, null);
  const cid = state.campaignId;
  const url = t.kind === 'pc'
    ? `/campaigns/${cid}/members/${t.user_id}/token?v=${encodeURIComponent(t.picture)}`
    : `/campaigns/${cid}/maps/${state.current.id}/tokens/${t.id}/picture?v=${encodeURIComponent(t.picture)}`;
  fileUrl(url)
    .then((url) => {
      if (state.campaignId !== cid) return URL.revokeObjectURL(url);
      state.tokenPictures.set(key, url);
      if (state.current) renderTokens();
    })
    .catch(() => { /* drawn with initials instead */ });
  return null;
}

const canMove = (token) => state.canEdit || (token.user_id != null && token.user_id === state.userId);

function renderTokens() {
  const map = state.current;
  const layer = $('#map-tokens');
  layer.replaceChildren(
    ...map.tokens.map((t) => {
      const d = tokenPx(map, t);
      const dragging = state.drag?.id === t.id;
      const x = dragging ? state.drag.x : t.x;
      const y = dragging ? state.drag.y : t.y;
      const health = t.hp ? healthOf(t.hp) : t.health;
      const picture = tokenPicture(t);
      const el = h('div', {
        class: `token token-${t.kind}${picture ? ' has-picture' : ''}${canMove(t) ? ' movable' : ''}${t.user_id === state.userId ? ' mine' : ''}${state.selected === t.id ? ' selected' : ''}${dragging ? ' dragging' : ''}${t.hidden ? ' hidden-token' : ''}${health === 'down' ? ' down' : ''}${state.caught.has(t.id) ? ' caught' : ''}${map.combat?.turn === t.id ? ' turn' : ''}`,
        title: [t.name, TOKEN_KIND_NAMES[t.kind], hpText(t), ...t.conditions].filter(Boolean).join(' · '),
        role: 'button',
        tabindex: '0',
        'aria-label': t.name,
        'data-id': t.id,
      },
      picture ? h('img', { class: 'token-picture', src: picture, alt: '', draggable: 'false' }) : h('span', { class: 'token-initials' }, initials(t.name)),
      h('span', { class: 'token-name' }, t.name),
      health ? h('span', { class: `token-hp ${health}` }, h('span', { style: `width:${hpFraction(t, health) * 100}%` })) : null,
      t.conditions.length ? h('span', { class: 'token-conditions', title: t.conditions.join(', ') }, String(t.conditions.length)) : null);
      el.style.cssText = `left:${x - d / 2}px;top:${y - d / 2}px;width:${d}px;height:${d}px;--token:${t.color};font-size:${d * 0.38}px`;
      el.addEventListener('pointerdown', (e) => tokenDown(e, t));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select(t.id);
        }
      });
      return el;
    }),
  );
}

/** The DM's quick switch between a map's pictures (day and night, before and after). */
function renderVariantPicker() {
  const select = $('#map-variant');
  const map = state.current;
  select.hidden = !state.canEdit || !map?.variants?.length;
  if (select.hidden) return select.replaceChildren();
  select.replaceChildren(new Option('Original picture', ''), ...map.variants.map((v) => new Option(v.name, v.id)));
  select.value = map.variant ?? '';
}

/** Stairs and doors to other maps (players get the ones they can see that lead to maps they're shown). */
function renderLinks() {
  const map = state.current;
  $('#map-links').replaceChildren(
    ...(map.links ?? []).map((l) => {
      const name = `${l.label || 'Way'} to ${l.to_name ?? 'a removed map'}`;
      const el = h('button', { type: 'button', class: 'map-link', title: name, 'aria-label': name, 'data-link': l.id }, '⇅', h('span', { class: 'map-link-label' }, l.label || l.to_name || ''));
      el.style.cssText = `left:${l.x}px;top:${l.y}px`;
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', () => useLink(l));
      return el;
    }),
  );
}

/**
 * Click a link: the DM erasing removes it. Otherwise the selected token (or a player's own
 * character) goes through to the other map, and the view follows; with no token, just look at that map.
 */
async function useLink(link) {
  const map = state.current;
  if (state.canEdit && state.wallMode === 'erase') return links({ remove: link.id });
  const selected = map.tokens.find((t) => t.id === state.selected && canMove(t));
  const token = selected ?? (state.canEdit ? null : map.tokens.find((t) => t.kind === 'pc' && t.user_id === state.userId));
  try {
    if (!token) {
      const target = state.maps.find((m) => m.id === link.to);
      if (target) return show(target);
      return status(`${link.to_name ?? 'That map'} isn't available.`, true);
    }
    const res = await state.guarded(() => api('POST', `${base()}/${map.id}/links/${link.id}/use`, { token: token.id }));
    if (!res) return;
    onMap(res.map);
    await show(state.maps.find((m) => m.id === res.map.id) ?? res.map);
    select(res.token);
    status(`${token.name} went to ${res.map.name}.`);
  } catch (err) {
    report(err);
  }
}

async function links(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/links`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

const myPins = () => (state.current && state.pins.get(state.current.id)) || [];

function renderPins() {
  const layer = $('#map-pins');
  layer.replaceChildren(
    ...myPins().map((p) => {
      const dragging = state.pinDrag?.id === p.id;
      const el = h('div', {
        class: `map-pin${state.selectedPin === p.id ? ' selected' : ''}${dragging ? ' dragging' : ''}`,
        title: p.label ? `${p.label} (only you see this pin)` : 'Your pin (only you see it)',
        role: 'button',
        tabindex: '0',
        'aria-label': p.label || 'Pin',
        'data-pin': p.id,
      }, p.label ? h('span', { class: 'map-pin-label' }, p.label) : null);
      el.style.cssText = `left:${dragging ? state.pinDrag.x : p.x}px;top:${dragging ? state.pinDrag.y : p.y}px;--pin:${p.color}`;
      el.addEventListener('pointerdown', (e) => pinDown(e, p));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectPin(p.id);
        }
      });
      return el;
    }),
  );
}

function selectPin(id) {
  state.selectedPin = id;
  if (id) Object.assign(state, { selected: null, selectedTemplate: null, selectedDoor: null });
  renderTemplates();
  renderTokens();
  renderPins();
  renderSelection();
}

/** Change this person's pins on the server; the answer is their whole list. */
async function pinRequest(method, path, body) {
  const map = state.current;
  try {
    const res = await state.guarded(() => api(method, `${base()}/${map.id}/pins${path}`, body));
    if (!res) return null;
    state.pins.set(map.id, res.pins);
    if (state.current?.id === map.id) {
      renderPins();
      renderSelection();
    }
    return res;
  } catch (err) {
    report(err);
    return null;
  }
}

async function dropPin(at) {
  state.pinMode = false;
  renderPinTool();
  render();
  const res = await pinRequest('POST', '', { x: at.x, y: at.y });
  if (res) {
    selectPin(res.pin.id);
    $('#map-selection input')?.focus();
  }
}

function renderPinTool() {
  $('#map-pin').setAttribute('aria-pressed', String(state.pinMode));
  $('#map-view').classList.toggle('pin-placing', state.pinMode || state.pinging || state.drawing);
}

function pinDown(e, pin) {
  e.stopPropagation();
  $('#map-view').setPointerCapture(e.pointerId);
  state.pinDrag = { id: pin.id, pointer: e.pointerId, x: pin.x, y: pin.y, moved: false, sx: e.clientX, sy: e.clientY };
}

function pinMove(e) {
  const drag = state.pinDrag;
  if (e.pointerId !== drag.pointer) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
  drag.moved = true;
  const map = state.current;
  const at = toImage(e.clientX, e.clientY);
  drag.x = Math.max(0, Math.min(map.image.width, at.x));
  drag.y = Math.max(0, Math.min(map.image.height, at.y));
  const el = document.querySelector(`.map-pin[data-pin="${drag.id}"]`);
  if (el) {
    el.style.left = `${drag.x}px`;
    el.style.top = `${drag.y}px`;
    el.classList.add('dragging');
  }
}

function pinUp(e) {
  const drag = state.pinDrag;
  if (e.pointerId !== drag.pointer) return;
  state.pinDrag = null;
  if (!drag.moved) return selectPin(drag.id);
  const pin = myPins().find((p) => p.id === drag.id);
  if (pin) Object.assign(pin, { x: drag.x, y: drag.y });
  renderPins();
  pinRequest('PATCH', `/${drag.id}`, { x: drag.x, y: drag.y });
}

function pinControls(pin) {
  const label = h('input', { value: pin.label, maxLength: 80, placeholder: 'A note to yourself', 'aria-label': 'Pin label', class: 'map-pin-input' });
  label.addEventListener('change', () => pinRequest('PATCH', `/${pin.id}`, { label: label.value.trim() }));
  label.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') label.blur();
  });
  const color = h('input', { type: 'color', value: pin.color, 'aria-label': 'Pin colour', class: 'map-pin-color' });
  color.addEventListener('change', () => pinRequest('PATCH', `/${pin.id}`, { color: color.value }));
  return [
    h('span', { class: 'swatch', style: `background:${pin.color}` }),
    h('strong', {}, 'Your pin'),
    label,
    color,
    h('span', { class: 'muted small' }, 'Only you see it. Drag to move.'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'ghost danger', onclick: () => {
      selectPin(null);
      pinRequest('DELETE', `/${pin.id}`);
    } }, 'Remove'),
    h('button', { class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => selectPin(null) }, '✕'),
  ];
}

const HEALTH_NAMES = { unhurt: 'Unhurt', hurt: 'Hurt', bloodied: 'Bloodied', down: 'Down' };
const HEALTH_FRACTION = { unhurt: 1, hurt: 0.75, bloodied: 0.4, down: 0 };

/** Hit points as text: numbers where this viewer gets them, else how hurt it looks. */
function hpText(t) {
  if (t.hp) return `${t.hp.current ?? '?'}${t.hp.max ? ` / ${t.hp.max}` : ''} HP`;
  return t.health ? HEALTH_NAMES[t.health] : '';
}

function hpFraction(t, health) {
  if (t.hp?.max && t.hp.current != null) return Math.max(0, Math.min(1, t.hp.current / t.hp.max));
  return HEALTH_FRACTION[health] ?? 1;
}

async function patchToken(token, body) {
  try {
    const res = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/tokens/${token.id}`, body));
    if (res) onMap(res.map);
  } catch (err) {
    report(err);
  }
}

/** The light a token carries: none, or one of the usual ones. */
function lightSelect(token) {
  const key = token.light ? Object.keys(LIGHT_PRESETS).find((k) => LIGHT_PRESETS[k].bright === token.light.bright && LIGHT_PRESETS[k].dim === token.light.dim) ?? 'other' : '';
  const sel = h('select', { 'aria-label': 'Light carried', title: 'A light this token carries (it matters in darkness)' },
    new Option('No light', ''),
    ...Object.entries(LIGHT_PRESETS).filter(([k]) => k !== 'fire').map(([k, p]) => new Option(p.name, k)),
    key === 'other' ? new Option(`${token.light.bright}/${token.light.dim} ft`, 'other') : null);
  sel.value = key;
  sel.addEventListener('change', () => {
    const p = LIGHT_PRESETS[sel.value];
    if (sel.value !== 'other') patchToken(token, { light: p ? { bright: p.bright, dim: p.dim } : null });
  });
  return sel;
}

/** Hit points and conditions: the DM for any token, a player for their own. */
function tokenControls(token) {
  const editable = state.canEdit || (token.user_id != null && token.user_id === state.userId);
  const parts = [];
  if (editable) {
    // "-7" deals 7 damage, "+5" heals 5, a plain number sets current hit points.
    const change = h('input', { class: 'hp-change', placeholder: token.hp ? '-7, +5 or 12' : 'max HP', 'aria-label': 'Change hit points', inputMode: 'numeric', size: 7 });
    change.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = change.value.trim();
      const n = Number(v);
      if (!v || !Number.isFinite(n)) return;
      const hp = token.hp ?? { current: null, max: null };
      let next;
      if (!token.hp) next = { current: Math.round(n), max: Math.max(1, Math.round(n)) };
      else if (/^[+-]/.test(v)) next = { ...hp, current: Math.min(hp.max ?? Infinity, (hp.current ?? hp.max ?? 0) + Math.round(n)) };
      else next = { ...hp, current: Math.round(n) };
      patchToken(token, { hp: next });
    });
    parts.push(h('span', { class: 'hp-text' }, hpText(token) || 'No HP'), change);
    parts.push(lightSelect(token));
    const add = h('select', { 'aria-label': 'Add a condition' }, new Option('+ Condition', ''), ...CONDITIONS.filter((c) => !token.conditions.includes(c)).map((c) => new Option(c, c)));
    add.addEventListener('change', () => add.value && patchToken(token, { conditions: [...token.conditions, add.value] }));
    parts.push(add);
  } else if (hpText(token)) {
    parts.push(h('span', { class: 'hp-text' }, hpText(token)));
  }
  for (const c of token.conditions) {
    parts.push(h('span', { class: 'chip' }, c, editable ? h('button', { class: 'chip-x', 'aria-label': `Remove ${c}`, onclick: () => patchToken(token, { conditions: token.conditions.filter((x) => x !== c) }) }, '✕') : null));
  }
  if (state.canEdit) {
    const hidden = h('input', { type: 'checkbox', checked: token.hidden });
    hidden.addEventListener('change', () => patchToken(token, { hidden: hidden.checked }));
    parts.push(h('label', { class: 'map-check small', title: 'Players never see hidden tokens' }, hidden, ' Hidden'));
  }
  return parts;
}

function renderSelection() {
  const bar = $('#map-selection');
  const token = state.current?.tokens.find((t) => t.id === state.selected);
  const pin = !token && myPins().find((p) => p.id === state.selectedPin);
  const tpl = !token && !pin && state.current?.templates?.find((t) => t.id === state.selectedTemplate);
  const door = !token && !pin && !tpl && state.canEdit && state.current?.walls.find((w) => w.door && w.id === state.selectedDoor);
  bar.hidden = !token && !pin && !tpl && !door;
  if (door) {
    bar.dataset.pin = '';
    return bar.replaceChildren(...doorControls(door));
  }
  if (tpl) {
    bar.dataset.pin = '';
    return bar.replaceChildren(...templateControls(tpl));
  }
  // Don't rebuild the pin's label box while someone is typing in it.
  if (pin && bar.dataset.pin === pin.id && bar.contains(document.activeElement)) return;
  bar.dataset.pin = pin ? pin.id : '';
  if (pin) return bar.replaceChildren(...pinControls(pin));
  if (!token) return bar.replaceChildren();
  bar.replaceChildren(
    ...[
      h('span', { class: 'swatch', style: `background:${token.color}` }),
      h('strong', {}, token.name),
      h('span', { class: 'muted small' }, `${TOKEN_KIND_NAMES[token.kind]} · ${TOKEN_SIZE_NAMES[token.size]}`),
      ...tokenControls(token),
      h('span', { class: 'spacer' }),
      canMove(token) && !state.canEdit ? h('span', { class: 'muted small' }, 'Drag to move') : null,
      state.canEdit && token.record ? h('button', { class: 'ghost', title: `What the campaign's records say about ${token.record.title}`, onclick: () => recordDialog(token) }, 'Record') : null,
      state.canEdit && token.stats ? h('button', { class: 'ghost', onclick: () => statsDialog(token) }, 'Stat block') : null,
      state.canEdit && !token.stats && token.kind !== 'pc' ? h('button', { class: 'ghost', title: 'Fill in its stat block, hit points and size with the AI', onclick: () => fillStats(token) }, 'Stat block (AI)') : null,
      state.canEdit && token.kind !== 'pc' ? h('button', { class: 'ghost', title: 'Give this token a picture (players see it on the map)', onclick: () => chooseTokenPicture(token) }, token.picture ? 'New picture' : 'Picture') : null,
      state.canEdit && token.kind !== 'pc' && token.picture ? h('button', { class: 'ghost', title: 'Go back to initials', onclick: () => removeTokenPicture(token) }, 'No picture') : null,
      state.canEdit && token.kind !== 'pc' ? h('button', { class: 'ghost', title: 'Keep this one (picture, stat block and all) in your creatures, to put on other maps', onclick: () => saveCreature(token) }, 'Save to creatures') : null,
      state.canEdit ? h('button', { class: 'ghost', onclick: () => tokenDialog(token) }, 'Edit') : null,
      state.canEdit ? h('button', { class: 'ghost danger', onclick: () => removeToken(token) }, 'Remove') : null,
      h('button', { class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => select(null) }, '✕'),
    ].filter(Boolean),
  );
}

/** The DM picks a door (a click on it) to open, close, lock or unlock it. */
function selectDoor(id) {
  Object.assign(state, { selectedDoor: id, selected: null, selectedPin: null, selectedTemplate: null });
  renderWalls();
  renderTemplates();
  renderTokens();
  renderPins();
  renderSelection();
}

function doorControls(door) {
  const what = door.locked ? 'Locked' : door.open ? 'Open' : 'Closed';
  return [
    h('strong', {}, 'Door'),
    h('span', { class: 'muted small' }, `${what}${door.locked ? ": players can't open it" : ''}`),
    h('span', { class: 'spacer' }),
    h('button', { class: 'ghost', onclick: () => walls({ toggle: door.id }) }, door.open ? 'Close' : 'Open'),
    h('button', { class: 'ghost', title: door.locked ? 'Let players open it again' : "Players can't open a locked door (you still can)", onclick: () => walls({ lock: door.id }) }, door.locked ? 'Unlock' : 'Lock'),
    h('button', { class: 'ghost danger', onclick: () => walls({ remove: door.id }).then(() => selectDoor(null)) }, 'Remove'),
    h('button', { class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => selectDoor(null) }, '✕'),
  ];
}

function select(id) {
  state.selected = id;
  state.selectedPin = null;
  state.selectedTemplate = null;
  state.selectedDoor = null;
  if (state.current) renderWalls();
  renderTemplates();
  renderPins();
  renderTokens();
  renderSelection();
}

// ---------- panning and zooming ----------

function applyView() {
  const { x, y, k } = state.view;
  $('#map-stage').style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  // Pins stay the same size on screen at any zoom.
  $('#map-stage').style.setProperty('--unzoom', String(1 / k));
  if (state.ruler && !state.drag) placeMeasure(state.ruler.b);
}

function fit() {
  const map = state.current;
  const box = $('#map-view').getBoundingClientRect();
  if (!map || !box.width || !box.height) return;
  const k = Math.min(box.width / map.image.width, box.height / map.image.height);
  state.view = { k, x: (box.width - map.image.width * k) / 2, y: (box.height - map.image.height * k) / 2 };
  state.fitted = true;
  applyView();
}

function zoomAt(px, py, factor) {
  const map = state.current;
  if (!map) return;
  const box = $('#map-view').getBoundingClientRect();
  const min = Math.min(box.width / map.image.width, box.height / map.image.height) / 2;
  const k = Math.min(MAX_ZOOM, Math.max(min, state.view.k * factor));
  const f = k / state.view.k;
  state.view = { k, x: px - (px - state.view.x) * f, y: py - (py - state.view.y) * f };
  applyView();
}

/** How close (screen pixels) a wall end snaps to another wall's end or a grid corner, and how close a click picks a wall. */
const SNAP_PX = 12;

/** Finish drawing a wall or door, or (a click, not a drag) erase a wall or open/close a door. */
function wallUp(e) {
  const d = state.wallDraw;
  state.wallDraw = null;
  renderWalls();
  if (e.type !== 'pointerup') return;
  const map = state.current;
  const click = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4;
  if (click) {
    const at = toImage(e.clientX, e.clientY);
    if (state.wallMode === 'light') {
      const { bright, dim } = LIGHT_PRESETS[$('#map-light-kind').value] ?? LIGHT_PRESETS.torch;
      return lights({ add: { x: at.x, y: at.y, bright, dim } });
    }
    if (state.wallMode === 'link') {
      const to = $('#map-link-to').value;
      return to ? links({ add: { x: at.x, y: at.y, to } }) : status('Import another map to link to first.', true);
    }
    const light = state.wallMode === 'erase' && (map.lights ?? []).find((l) => Math.hypot(l.x - at.x, l.y - at.y) <= SNAP_PX / state.view.k);
    if (light) return lights({ remove: light.id });
    const near = nearestWall(map, at, SNAP_PX / state.view.k);
    const door = doorAt(e.clientX, e.clientY);
    if (state.wallMode === 'erase' && near) walls({ remove: near.id });
    else if (state.wallMode === 'erase' && (map.terrain ?? []).some((a) => pointInPolygon(at.x, at.y, a.points))) {
      terrain({ remove: map.terrain.findLast((a) => pointInPolygon(at.x, at.y, a.points)).id });
    }
    else if (state.wallMode === 'door' && door) walls({ toggle: door.id });
    else if (state.wallMode === 'lock' && door) walls({ lock: door.id });
    return;
  }
  if (state.wallMode === 'erase' || state.wallMode === 'lock' || state.wallMode === 'light' || state.wallMode === 'link') return;
  if (Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) < 1) return;
  walls({ add: { x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y, door: state.wallMode === 'door', kind: state.wallMode === 'low' ? 'low' : 'wall' } });
}

/** Screen coordinates → the map image's pixels. */
function toImage(clientX, clientY) {
  const box = $('#map-view').getBoundingClientRect();
  return { x: (clientX - box.left - state.view.x) / state.view.k, y: (clientY - box.top - state.view.y) / state.view.k };
}

function viewDown(e) {
  if (!state.current || e.target.closest('.map-selection, .map-combat')) return;
  // Measuring and placing a template can start on a token; otherwise tokens and pins handle their own pointers.
  // Alt+click pings, whatever tool is on.
  if (e.altKey && !state.pointers.size) {
    e.preventDefault();
    return ping(toImage(e.clientX, e.clientY));
  }
  if (state.drawing && !state.pointers.size && !state.stroke) {
    e.currentTarget.setPointerCapture(e.pointerId);
    state.stroke = { pointer: e.pointerId, points: [toImage(e.clientX, e.clientY)] };
    return renderSignals();
  }
  const aiming = state.measuring || !!state.templateDraft;
  if (e.target.closest('.token, .map-pin') && !aiming) return;
  e.currentTarget.setPointerCapture(e.pointerId);
  if (aiming && !state.pointers.size && !state.ruler?.pointer && !state.templatePlace) {
    const at = toImage(e.clientX, e.clientY);
    if (state.measuring) {
      const a = rulerPoint(at);
      state.ruler = { pointer: e.pointerId, a, b: a, done: false };
      return renderRuler();
    }
    const a = snapTemplatePoint(state.current, at);
    state.templatePlace = { pointer: e.pointerId, a, b: a };
    return renderTemplates();
  }
  // Dragging the selected template (its owner, or the DM) moves it.
  const tpl = state.current.templates?.find((t) => t.id === state.selectedTemplate);
  if (tpl && canChangeTemplate(tpl) && !state.pointers.size && !state.fogMode && !state.wallMode && !state.pinMode) {
    const at = toImage(e.clientX, e.clientY);
    if (inTemplate(state.current, tpl, at.x, at.y)) {
      state.templateDrag = { id: tpl.id, pointer: e.pointerId, grab: { x: at.x - tpl.x, y: at.y - tpl.y }, x: tpl.x, y: tpl.y, moved: false, sx: e.clientX, sy: e.clientY };
      return;
    }
  }
  if (state.fogMode && state.current.fog?.enabled && !state.pointers.size && !state.fogDraw) {
    const at = toImage(e.clientX, e.clientY);
    state.fogDraw = { pointer: e.pointerId, a: at, b: at };
    return;
  }
  if (state.wallMode === 'difficult' && !state.pointers.size && !state.terrainDraw) {
    const at = toImage(e.clientX, e.clientY);
    state.terrainDraw = { pointer: e.pointerId, a: at, b: at };
    return;
  }
  if (state.wallMode && !state.pointers.size && !state.wallDraw) {
    const at = snapWallPoint(state.current, toImage(e.clientX, e.clientY), SNAP_PX / state.view.k);
    state.wallDraw = { pointer: e.pointerId, a: at, b: at, sx: e.clientX, sy: e.clientY };
    return;
  }
  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
}

function viewMove(e) {
  if (state.drag) return tokenMove(e);
  if (state.pinDrag) return pinMove(e);
  if (state.ruler?.pointer === e.pointerId && !state.ruler.done) {
    state.ruler.b = rulerPoint(toImage(e.clientX, e.clientY));
    return renderRuler();
  }
  if (state.stroke?.pointer === e.pointerId) {
    const at = toImage(e.clientX, e.clientY);
    const last = state.stroke.points.at(-1);
    if (Math.hypot(at.x - last.x, at.y - last.y) * state.view.k >= 3) state.stroke.points.push(at);
    return renderSignals();
  }
  if (state.templatePlace?.pointer === e.pointerId) {
    state.templatePlace.b = toImage(e.clientX, e.clientY);
    renderTemplates();
    return renderTokens();
  }
  if (state.templateDrag?.pointer === e.pointerId) return templateMove(e);
  if (state.fogDraw?.pointer === e.pointerId) {
    state.fogDraw.b = toImage(e.clientX, e.clientY);
    return renderFog();
  }
  if (state.terrainDraw?.pointer === e.pointerId) {
    state.terrainDraw.b = toImage(e.clientX, e.clientY);
    return renderTerrain();
  }
  if (state.wallDraw?.pointer === e.pointerId) {
    state.wallDraw.b = snapWallPoint(state.current, toImage(e.clientX, e.clientY), SNAP_PX / state.view.k);
    return renderWalls();
  }
  const p = state.pointers.get(e.pointerId);
  if (!p) return;
  const box = $('#map-view').getBoundingClientRect();
  if (state.pointers.size === 2) {
    // Pinch: zoom by the change in distance between the fingers, around their middle.
    const [a, b] = [...state.pointers.values()];
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    p.x = e.clientX;
    p.y = e.clientY;
    const after = Math.hypot(a.x - b.x, a.y - b.y);
    if (before > 0) zoomAt((a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top, after / before);
    return;
  }
  state.view.x += e.clientX - p.x;
  state.view.y += e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  applyView();
}

function viewUp(e) {
  if (state.drag) return tokenUp(e);
  if (state.pinDrag) return pinUp(e);
  if (state.ruler?.pointer === e.pointerId && !state.ruler.done) {
    // The line stays until the next one (or Measure is switched off).
    state.ruler.done = true;
    state.ruler.pointer = null;
    return renderRuler();
  }
  if (state.templatePlace?.pointer === e.pointerId) return placeTemplate(e);
  if (state.stroke?.pointer === e.pointerId) return finishStroke(e);
  if (state.templateDrag?.pointer === e.pointerId) return templateUp(e);
  if (state.fogDraw?.pointer === e.pointerId) {
    const r = fogRect(state.current, state.fogDraw.a, state.fogDraw.b);
    state.fogDraw = null;
    renderFog();
    if (r.w > 0 && r.h > 0) fog({ add: { op: state.fogMode, ...r } });
    return;
  }
  if (state.wallDraw?.pointer === e.pointerId) return wallUp(e);
  if (state.terrainDraw?.pointer === e.pointerId) {
    const r = fogRect(state.current, state.terrainDraw.a, state.terrainDraw.b);
    state.terrainDraw = null;
    renderTerrain();
    if (e.type === 'pointerup' && r.w > 0 && r.h > 0) terrain({ add: { points: [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]] } });
    return;
  }
  const p = state.pointers.get(e.pointerId);
  state.pointers.delete(e.pointerId);
  // A click on the map itself (not a drag) drops a pin when placing one, else clears the selection.
  if (p && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 4 && !state.pointers.size) {
    if (state.pinMode && e.type === 'pointerup') return dropPin(toImage(e.clientX, e.clientY));
    if (state.pinging && e.type === 'pointerup') return ping(toImage(e.clientX, e.clientY));
    // A click on a door: the DM picks it (to open, close, lock or unlock it); a player opens or closes it.
    const door = e.type === 'pointerup' ? doorAt(e.clientX, e.clientY) : null;
    if (door) return state.canEdit ? selectDoor(door.id) : toggleDoor(door);
    // A click on a template picks it (to see who it catches).
    const at = toImage(e.clientX, e.clientY);
    const tpl = e.type === 'pointerup' ? (state.current.templates ?? []).findLast((t) => inTemplate(state.current, t, at.x, at.y)) : null;
    if (tpl) return selectTemplate(tpl.id);
    select(null);
  }
}

// ---------- moving tokens ----------

function tokenDown(e, token) {
  if (state.measuring || state.templateDraft || state.drawing || e.altKey) return; // the map view measures, aims, sketches or pings from here
  e.stopPropagation();
  if (!canMove(token)) return select(token.id);
  $('#map-view').setPointerCapture(e.pointerId);
  const at = toImage(e.clientX, e.clientY);
  state.drag = { id: token.id, pointer: e.pointerId, start: { x: token.x, y: token.y }, grab: { x: at.x - token.x, y: at.y - token.y }, x: token.x, y: token.y, moved: false, sx: e.clientX, sy: e.clientY, waypoints: [], lastEvent: e };
}

function tokenMove(e) {
  const drag = state.drag;
  if (e.pointerId !== drag.pointer) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
  drag.moved = true;
  drag.lastEvent = e;
  const at = toImage(e.clientX, e.clientY);
  drag.x = at.x - drag.grab.x;
  drag.y = at.y - drag.grab.y;
  const map = state.current;
  const token = map.tokens.find((t) => t.id === drag.id);
  const el = document.querySelector(`.token[data-id="${drag.id}"]`);
  if (!token || !el) return;
  const d = tokenPx(map, token);
  el.style.left = `${drag.x - d / 2}px`;
  el.style.top = `${drag.y - d / 2}px`;
  el.classList.add('dragging');
  // How far it's going, along its waypoints to where it would land (difficult terrain costs double).
  const end = snapToken(map, token, drag.x, drag.y);
  const cost = pathCost(map, [drag.start, ...drag.waypoints, end]);
  let distance = formatDistance(cost);
  if (cost?.difficult) distance += ' · difficult';
  // In a fight: how much of its speed it has used this turn.
  const entry = map.combat?.entries.find((x) => x.id === token.id);
  const over = !!(entry && token.move_speed && entry.moved + cost.value > token.move_speed);
  if (cost && entry && token.move_speed) distance += ` · ${Math.round((entry.moved + cost.value) * 10) / 10} / ${token.move_speed} ${cost.unit} this turn`;
  const label = $('#map-measure');
  label.hidden = !distance;
  label.textContent = distance;
  label.classList.toggle('over', over);
  const box = $('#map-view').getBoundingClientRect();
  label.style.left = `${e.clientX - box.left + 14}px`;
  label.style.top = `${e.clientY - box.top - 30}px`;
  renderRuler();
}

/** While dragging a token, Space (or W) turns here: a waypoint where it would land now. */
function addWaypoint() {
  const drag = state.drag;
  const map = state.current;
  const token = drag?.moved && map?.tokens.find((t) => t.id === drag.id);
  if (!token) return false;
  const at = snapToken(map, token, drag.x, drag.y);
  const last = drag.waypoints.at(-1) ?? drag.start;
  if (at.x !== last.x || at.y !== last.y) drag.waypoints.push(at);
  tokenMove(drag.lastEvent);
  return true;
}

async function tokenUp(e) {
  const drag = state.drag;
  if (e.pointerId !== drag.pointer) return;
  state.drag = null;
  $('#map-measure').hidden = true;
  $('#map-measure').classList.remove('over');
  renderRuler();
  const map = state.current;
  const token = map.tokens.find((t) => t.id === drag.id);
  if (!drag.moved || !token) return select(drag.id);
  // Show it where it will land straight away; the server's answer (and everyone else's screens) follow.
  Object.assign(token, snapToken(map, token, drag.x, drag.y));
  renderTokens();
  try {
    const path = drag.waypoints.map((p) => [p.x, p.y]);
    const res = await state.guarded(() => api('PATCH', `${base()}/${map.id}/tokens/${token.id}`, { x: drag.x, y: drag.y, ...(path.length && { path }) }));
    if (res) onMap(res.map);
  } catch (err) {
    Object.assign(token, drag.start);
    renderTokens();
    report(err);
  }
}

// ---------- pings and quick drawings ----------

const PING_MS = 2700;
const STROKE_MS = 20_000;

/** Ping a spot: everyone looking at the map sees it (the server decides who). */
async function ping(at) {
  try {
    await state.guarded(() => api('POST', `${base()}/${state.current.id}/ping`, { x: at.x, y: at.y }));
  } catch (err) {
    report(err);
  }
}

/** Send the sketch just drawn (a short line is shared as it is; long ones are thinned out). */
async function finishStroke(e) {
  const stroke = state.stroke;
  state.stroke = null;
  renderSignals();
  if (e.type !== 'pointerup' || stroke.points.length < 2) return;
  const step = Math.ceil(stroke.points.length / 500);
  const points = stroke.points.filter((_, i) => i % step === 0 || i === stroke.points.length - 1).map((p) => [p.x, p.y]);
  try {
    await state.guarded(() => api('POST', `${base()}/${state.current.id}/draw`, { points }));
  } catch (err) {
    report(err);
  }
}

let signalCount = 0;

/** A ping or sketch from the server: shown for a while on the map it's on. */
function onSignal(kind, data) {
  const ms = kind === 'ping' ? PING_MS : STROKE_MS;
  const sig = { ...data, id: ++signalCount, kind, until: Date.now() + ms };
  state.signals.push(sig);
  if (state.current?.id === data.map_id) {
    renderSignals();
    if (kind === 'ping') status(`${data.name} pinged the map.`);
  }
  // A sketch starts fading a few seconds before it goes.
  if (kind === 'draw') setTimeout(() => document.querySelector(`#map-signals [data-signal="${sig.id}"]`)?.classList.add('fading'), ms - 3000);
  setTimeout(() => {
    state.signals = state.signals.filter((x) => x !== sig);
    if (state.current) renderSignals();
  }, ms);
}

function renderSignals() {
  const map = state.current;
  const svg = $('#map-signals');
  if (!map) return svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${map.image.width} ${map.image.height}`);
  const r = squarePx(map) * 0.7;
  const line = (points, extra = {}) => svgEl('polyline', { points: points.map((p) => (Array.isArray(p) ? p : [p.x, p.y]).join(',')).join(' '), class: 'stroke', ...extra });
  svg.replaceChildren(
    ...state.signals.filter((sig) => sig.map_id === map.id).map((sig) => {
      if (sig.kind === 'draw') return line(sig.points, { style: `--sig:${sig.color}`, 'data-signal': sig.id });
      const [x, y] = sig.points[0];
      const g = svgEl('g', { style: `--sig:${sig.color}`, 'data-signal': sig.id, class: 'ping-mark' });
      const title = svgEl('title', {});
      title.textContent = `${sig.name} pinged here`;
      g.append(title, svgEl('circle', { cx: x, cy: y, r, class: 'ping' }), svgEl('circle', { cx: x, cy: y, r: r / 6, class: 'ping-dot' }));
      return g;
    }),
    ...(state.stroke ? [line(state.stroke.points, { style: '--sig:var(--accent)' })] : []),
  );
}

// ---------- measuring ----------

/** Where a ruler end goes: the middle of a square on a grid, else where the pointer is. */
const rulerPoint = (at) => (state.current.grid ? snapToken(state.current, { size: 1 }, at.x, at.y) : at);

/** Put the distance label next to a point on the map. */
function placeMeasure(at) {
  const label = $('#map-measure');
  label.style.left = `${at.x * state.view.k + state.view.x + 14}px`;
  label.style.top = `${at.y * state.view.k + state.view.y - 30}px`;
}

/** The measuring line (only on this screen): the Measure tool's, or a token's path while it's dragged. */
function renderRuler() {
  const map = state.current;
  const svg = $('#map-ruler-line');
  if (!map) return;
  svg.setAttribute('viewBox', `0 0 ${map.image.width} ${map.image.height}`);
  svg.replaceChildren();
  let line = null;
  const token = state.drag?.moved && map.tokens.find((t) => t.id === state.drag.id);
  if (token) line = [state.drag.start, ...state.drag.waypoints, snapToken(map, token, state.drag.x, state.drag.y)];
  else if (state.ruler) line = [state.ruler.a, state.ruler.b];
  if (line) {
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      for (const cls of ['ruler-halo', 'ruler']) svg.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls }));
    }
    for (const p of line.slice(1, -1)) svg.append(svgEl('circle', { cx: p.x, cy: p.y, r: squarePx(map) / 6, class: 'waypoint' }));
  }
  if (state.drag) return; // the drag shows its own distance
  const label = $('#map-measure');
  label.hidden = !state.ruler;
  if (!state.ruler) return;
  const d = measure(map, state.ruler.a, state.ruler.b);
  label.textContent = d ? `${formatDistance(d)}${d.squares != null ? ` · ${d.squares} square${d.squares === 1 ? '' : 's'}` : ''}` : 'No scale';
  placeMeasure(state.ruler.b);
}

function renderMeasureTools() {
  $('#map-ruler').setAttribute('aria-pressed', String(state.measuring));
  $('#map-ping').setAttribute('aria-pressed', String(state.pinging));
  $('#map-draw').setAttribute('aria-pressed', String(state.drawing));
  $('#map-view').classList.toggle('pin-placing', state.pinMode || state.pinging || state.drawing);
  $('#map-template').setAttribute('aria-pressed', String(!!state.templateDraft));
  $('#map-view').classList.toggle('measuring', state.measuring || !!state.templateDraft);
}

// ---------- spell templates (areas of effect) ----------

const canChangeTemplate = (t) => state.canEdit || (t.user_id != null && t.user_id === state.userId);

/** The direction from a to b in degrees, in steps of 15. */
function aim(a, b) {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1) return 0;
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return ((Math.round(deg / 15) * 15) % 360 + 360) % 360;
}

/** The template being placed, as it would be saved. */
function draftTemplate(place) {
  return { ...state.templateDraft, id: 'placing', x: place.a.x, y: place.a.y, angle: aim(place.a, place.b) };
}

/** Templates on the map (everyone's the viewer gets), and which tokens the selected or placed one catches. */
function renderTemplates() {
  const map = state.current;
  const svg = $('#map-templates');
  state.caught = new Set();
  if (!map) return;
  svg.setAttribute('viewBox', `0 0 ${map.image.width} ${map.image.height}`);
  svg.replaceChildren();
  const drag = state.templateDrag?.moved ? state.templateDrag : null;
  const list = (map.templates ?? []).map((t) => (drag?.id === t.id ? { ...t, x: drag.x, y: drag.y } : t));
  let focus = list.find((t) => t.id === state.selectedTemplate);
  if (state.templatePlace && state.templateDraft) {
    focus = draftTemplate(state.templatePlace);
    list.push(focus);
  }
  for (const t of list) {
    const shape = templateShape(map, t);
    const cls = `template${t === focus ? (t.id === 'placing' ? ' placing' : ' selected') : ''}`;
    const style = `--tpl:${t.color}`;
    svg.append(shape.circle
      ? svgEl('circle', { cx: shape.circle.cx, cy: shape.circle.cy, r: shape.circle.r, class: cls, style, 'data-template': t.id })
      : svgEl('polygon', { points: shape.points.map((p) => p.join(',')).join(' '), class: cls, style, 'data-template': t.id }));
  }
  if (focus) state.caught = new Set(tokensInTemplate(map, focus).map((t) => t.id));
}

function selectTemplate(id) {
  Object.assign(state, { selectedTemplate: id, selected: null, selectedPin: null, selectedDoor: null });
  renderTemplates();
  renderTokens();
  renderPins();
  renderSelection();
}

/** Place, change or remove a template; the answer is the whole map. */
async function templateRequest(method, path, body) {
  try {
    const res = await state.guarded(() => api(method, `${base()}/${state.current.id}/templates${path}`, body));
    if (res) onMap(res.map);
    return res;
  } catch (err) {
    report(err);
    return null;
  }
}

async function placeTemplate(e) {
  const place = state.templatePlace;
  state.templatePlace = null;
  if (e.type !== 'pointerup') {
    renderTemplates();
    return renderTokens();
  }
  const { shape, x, y, angle, size, width, label, color } = draftTemplate(place);
  state.templateDraft = null;
  renderMeasureTools();
  const res = await templateRequest('POST', '', { shape, x, y, angle, size, width, label, color });
  if (res) selectTemplate(res.template.id);
  else render();
}

function templateMove(e) {
  const drag = state.templateDrag;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
  drag.moved = true;
  const at = toImage(e.clientX, e.clientY);
  Object.assign(drag, snapTemplatePoint(state.current, { x: at.x - drag.grab.x, y: at.y - drag.grab.y }));
  renderTemplates();
  renderTokens();
}

function templateUp(e) {
  const drag = state.templateDrag;
  state.templateDrag = null;
  if (!drag.moved) return;
  const tpl = state.current.templates.find((t) => t.id === drag.id);
  if (tpl && e.type === 'pointerup') {
    Object.assign(tpl, { x: drag.x, y: drag.y });
    templateRequest('PATCH', `/${tpl.id}`, { x: drag.x, y: drag.y });
  }
  renderTemplates();
  renderTokens();
  renderSelection();
}

/** What a template is: "20 ft radius", "15 ft cone", "100 × 5 ft line". */
function templateText(map, t) {
  const unit = map.scale?.unit ?? 'ft';
  if (t.shape === 'circle') return `${t.size} ${unit} radius`;
  if (t.shape === 'line') return `${t.size} × ${t.width} ${unit} line`;
  return `${t.size} ${unit} ${t.shape}`;
}

function templateControls(tpl) {
  const map = state.current;
  const caught = tokensInTemplate(map, tpl);
  const mine = canChangeTemplate(tpl);
  return [
    h('span', { class: 'swatch', style: `background:${tpl.color}` }),
    h('strong', {}, tpl.label || TEMPLATE_SHAPE_NAMES[tpl.shape]),
    h('span', { class: 'muted small' }, templateText(map, tpl)),
    h('span', { class: 'small template-caught' }, caught.length ? `Catches ${caught.map((t) => t.name).join(', ')}` : 'Catches nobody you can see'),
    h('span', { class: 'spacer' }),
    mine ? h('span', { class: 'muted small' }, 'Drag to move.') : null,
    mine && tpl.shape !== 'circle' ? h('button', { class: 'ghost', title: 'Turn it 45°', onclick: () => templateRequest('PATCH', `/${tpl.id}`, { angle: (tpl.angle + 45) % 360 }) }, 'Turn') : null,
    mine ? h('button', { class: 'ghost danger', onclick: () => {
      selectTemplate(null);
      templateRequest('DELETE', `/${tpl.id}`);
    } }, 'Remove') : null,
    h('button', { class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => selectTemplate(null) }, '✕'),
  ].filter(Boolean);
}

/** How many of the map's units one foot is (spells are in feet). */
const FOOT = { ft: 1, m: 0.3, mi: 1 / 5280, km: 0.0003 };

/** Choose a template (or one of your spells with an area), then click and drag on the map to place and aim it. */
async function templateDialog() {
  const map = state.current;
  if (!map) return;
  const unit = map.scale?.unit ?? 'ft';
  // Your spells that have an area, from your character sheet.
  let spells = [];
  try {
    const res = await api('GET', `/campaigns/${state.campaignId}/sheet`);
    spells = (res.sheet.spells ?? []).map((sp) => ({ name: sp.name, area: spellArea(sp) })).filter((sp) => sp.area);
  } catch (err) {
    if (err instanceof LoggedOut) throw err;
  }
  const dialog = $('#map-dialog');
  const spell = h('select', {}, new Option('None (choose a shape)', ''), ...spells.map((sp, i) => new Option(`${sp.name} (${sp.area.size} ft ${sp.area.shape === 'circle' ? 'radius' : sp.area.shape})`, i)));
  const shape = h('select', {}, ...TEMPLATE_SHAPES.map((sh) => new Option(TEMPLATE_SHAPE_NAMES[sh], sh)));
  const size = h('input', { type: 'number', min: '0.5', step: 'any', value: '20', required: true });
  const width = h('input', { type: 'number', min: '0.5', step: 'any', value: String(5 * FOOT[unit]) });
  const label = h('input', { maxLength: 80, placeholder: 'Fireball' });
  const color = h('input', { type: 'color', value: TEMPLATE_COLOR });
  const sizeField = field(`Size (${unit})`, size);
  const widthField = field(`Width (${unit})`, width);
  const sync = () => {
    widthField.hidden = shape.value !== 'line';
    sizeField.firstChild.textContent = `${shape.value === 'circle' ? 'Radius' : 'Length'} (${unit})`;
  };
  shape.addEventListener('change', sync);
  spell.addEventListener('change', () => {
    const sp = spells[Number(spell.value)];
    if (!sp || spell.value === '') return;
    shape.value = sp.area.shape;
    size.value = String(Math.round(sp.area.size * FOOT[unit] * 100) / 100);
    if (sp.area.width) width.value = String(Math.round(sp.area.width * FOOT[unit] * 100) / 100);
    label.value = sp.name.slice(0, 80);
    sync();
  });
  sync();
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      const n = Number(size.value);
      if (!(n > 0)) return;
      setTool({});
      state.templateDraft = { shape: shape.value, size: n, width: shape.value === 'line' ? Number(width.value) || 5 * FOOT[unit] : null, label: label.value.trim(), color: color.value };
      Object.assign(state, { measuring: false, ruler: null, pinMode: false, pinging: false, drawing: false });
      renderPinTool();
      renderMeasureTools();
      renderRuler();
      status(state.templateDraft.shape === 'circle' ? 'Click where it centres. Everyone can see it.' : 'Press where it starts and drag to aim it. Everyone can see it.');
      dialog.close();
    } },
      h('h2', {}, 'Place a template'),
      spells.length ? field('One of your spells', spell) : null,
      h('div', { class: 'map-row' }, field('Shape', shape), sizeField, widthField),
      h('div', { class: 'map-row' }, field('Label', label), field('Colour', color)),
      map.scale ? null : h('p', { class: 'muted small' }, "This map has no scale yet, so a square counts as 5 ft."),
      h('p', { class: 'muted small' }, 'On a grid it starts on a square\'s corner; tokens with any square\'s middle inside are caught.'),
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, 'Place it'),
      ),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

// ---------- initiative (the turn order in a fight) ----------

async function combat(body) {
  try {
    const res = await state.guarded(() => api('POST', `${base()}/${state.current.id}/combat`, body));
    if (!res) return;
    onMap(res.map);
    const sign = (n) => `${n < 0 ? '−' : '+'} ${Math.abs(n)}`;
    if (res.rolls.length === 1) {
      const [r] = res.rolls;
      status(`${r.name} rolled ${r.total} for initiative (d20 ${r.d20} ${sign(r.mod)}).`);
    } else if (res.rolls.length) {
      status(`Initiative: ${res.rolls.map((r) => `${r.name} ${r.total}`).join(', ')}.`);
    }
  } catch (err) {
    report(err);
  }
}

/** The turn order panel: open when there's a fight (or when someone opens it). */
function renderCombat() {
  const panel = $('#map-combat');
  const map = state.current;
  if (map) {
    const active = !!map.combat;
    const was = state.combatActive.get(map.id);
    if (active && !was) state.combatOpen = true; // a fight started (or this is the first look at one)
    if (!active && was && !state.canEdit) state.combatOpen = false;
    state.combatActive.set(map.id, active);
  }
  $('#map-combat-open').setAttribute('aria-pressed', String(!!map && state.combatOpen));
  panel.hidden = !map || !state.combatOpen;
  if (panel.hidden) return panel.replaceChildren();
  // Don't rebuild the list while someone is typing a roll into it.
  if (panel.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const c = map.combat;
  const close = h('button', { class: 'ghost icon-btn', 'aria-label': 'Close the turn order', onclick: () => {
    state.combatOpen = false;
    renderCombat();
  } }, '✕');
  if (!c) {
    return panel.replaceChildren(
      h('header', {}, h('strong', {}, 'Initiative'), close),
      h('p', { class: 'muted small' }, state.canEdit
        ? 'No fight on this map. Start one: everyone on the map joins, and NPCs and enemies roll straight away (with their Dexterity from the stat block). Players roll their own.'
        : 'No fight on this map.'),
      h('footer', {}, state.canEdit ? h('button', { class: 'primary', onclick: () => combat({ action: 'start' }) }, 'Start a fight') : null),
    );
  }
  const byId = new Map(map.tokens.map((t) => [t.id, t]));
  const turnToken = byId.get(c.turn);
  const mine = (t) => state.canEdit || (t.user_id != null && t.user_id === state.userId);
  const rows = c.entries.map((e) => {
    const t = byId.get(e.id);
    if (!t) return null;
    let init;
    if (mine(t)) {
      init = h('input', { type: 'number', step: '1', value: e.init ?? '', placeholder: '–', 'aria-label': `Initiative for ${t.name}`, title: 'Type what you rolled at the table' });
      init.addEventListener('change', () => init.value !== '' && combat({ action: 'set', id: t.id, init: Math.round(Number(init.value)) }));
      init.addEventListener('keydown', (ev) => ev.key === 'Enter' && init.blur());
    } else {
      init = h('span', { class: 'init' }, e.init ?? '–');
    }
    return h('li', { class: `${c.turn === e.id ? 'current' : ''}${t.hidden ? ' hidden-token' : ''}`, 'data-id': t.id },
      h('span', { class: 'swatch', style: `background:${t.color}` }),
      h('button', { class: 'who', title: `Show ${t.name} on the map`, onclick: () => select(t.id) }, t.name),
      init,
      mine(t) && (e.init == null || state.canEdit) ? h('button', { class: 'ghost', 'aria-label': `Roll initiative for ${t.name}`, title: 'Roll a d20 plus their initiative', onclick: () => combat({ action: 'roll', id: t.id }) }, e.init == null ? 'Roll' : '↻') : null,
      state.canEdit ? h('button', { class: 'ghost icon-btn', 'aria-label': `Take ${t.name} out of the fight`, onclick: () => combat({ action: 'remove', id: t.id }) }, '✕') : null);
  });
  const whose = turnToken ? `${turnToken.name}'s turn` : c.turn_unseen ? "someone you can't see" : 'not started yet';
  const footer = [];
  if (state.canEdit) {
    const rolled = c.entries.some((e) => e.init != null);
    footer.push(h('button', { class: 'ghost', disabled: !c.turn, onclick: () => combat({ action: 'prev' }) }, 'Back'));
    footer.push(h('button', { class: 'primary', disabled: !rolled, onclick: () => combat({ action: 'next' }) }, c.turn ? 'Next turn' : 'First turn'));
    if (c.entries.some((e) => e.init == null && byId.get(e.id)?.kind !== 'pc')) footer.push(h('button', { class: 'ghost', onclick: () => combat({ action: 'roll' }) }, 'Roll for NPCs'));
    const out = map.tokens.filter((t) => !c.entries.some((e) => e.id === t.id));
    if (out.length) {
      const add = h('select', { 'aria-label': 'Add to the fight' }, new Option('+ Add', ''), ...out.map((t) => new Option(t.name, t.id)));
      add.addEventListener('change', () => add.value && combat({ action: 'add', ids: [add.value] }));
      footer.push(add);
    }
    footer.push(h('button', { class: 'ghost danger', onclick: () => confirm('End the fight? The turn order is cleared.') && combat({ action: 'end' }) }, 'End fight'));
  } else if (turnToken && turnToken.user_id === state.userId) {
    footer.push(h('button', { class: 'primary', onclick: () => combat({ action: 'next' }) }, 'End my turn'));
  }
  panel.replaceChildren(
    h('header', {}, h('strong', {}, `Round ${c.round}`), h('span', { class: 'muted small' }, whose), close),
    h('ol', { 'aria-label': 'Turn order' }, ...rows.filter(Boolean)),
    h('footer', {}, ...footer),
  );
}

// ---------- the DM's tools ----------

async function importMap(file) {
  if (file.size > 35 * 1024 * 1024) return status('That file is too big (35 MB at most).', true);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const page = isPdf ? await askPage(file.name) : null;
  if (isPdf && !page) return;
  status(isPdf ? `Uploading page ${page}…` : 'Uploading…');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const map = await api('POST', base(), { filename: file.name, data, ...(page && { page }) });
  onMap(map);
  await show(map);
}

/** Which page of a PDF has the map (1-based), or null if the DM cancels. */
function askPage(filename) {
  const dialog = $('#map-dialog');
  const page = h('input', { type: 'number', min: '1', step: '1', value: '1', required: true });
  return new Promise((resolve) => {
    let chosen = null;
    dialog.replaceChildren(
      h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
        e.preventDefault();
        chosen = Math.max(1, Math.round(Number(page.value) || 1));
        dialog.close();
      } },
        h('h2', {}, 'Which page is the map on?'),
        h('p', { class: 'muted small' }, `${filename}: the page is turned into the map's picture. The PDF is kept with it.`),
        field('Page', page),
        h('div', { class: 'map-dialog-actions' },
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
          h('button', { class: 'primary' }, 'Import'),
        ),
      ),
    );
    dialog.onclose = () => resolve(chosen);
    dialog.showModal();
    page.select();
  });
}

const field = (label, input) => h('label', { class: 'map-field' }, h('span', {}, label), input);

/** Map settings: name, shown to players, grid (drawn on the map while editing), scale, the AI's reading. */
function settingsDialog() {
  const map = state.current;
  if (!map) return;
  const dialog = $('#map-dialog');
  const name = h('input', { value: map.name, maxLength: 100, required: true });
  const shown = h('input', { type: 'checkbox', checked: map.shown });
  const hasGrid = h('input', { type: 'checkbox', checked: !!map.grid });
  const size = h('input', { type: 'number', min: '4', step: '0.1', value: map.grid?.size ?? Math.round(map.image.width / 20) });
  const gx = h('input', { type: 'number', step: '0.5', value: map.grid?.x ?? 0 });
  const gy = h('input', { type: 'number', step: '0.5', value: map.grid?.y ?? 0 });
  const distance = h('input', { type: 'number', min: '0', step: 'any', value: map.scale?.distance ?? '', placeholder: 'none' });
  const unit = h('select', {}, ...UNITS.map((u) => new Option(u, u)));
  unit.value = map.scale?.unit ?? 'ft';
  const per = h('select', {}, new Option('per square', 'square'), new Option('across the whole map', 'width'));
  per.value = map.scale?.per ?? (map.grid ? 'square' : 'width');
  const gridFields = h('div', { class: 'map-row' }, field('Square size (px)', size), field('Offset across', gx), field('Offset down', gy));

  const draft = () => (hasGrid.checked && Number(size.value) >= 4 ? { size: Number(size.value), x: Number(gx.value) || 0, y: Number(gy.value) || 0 } : null);
  const preview = () => {
    gridFields.hidden = !hasGrid.checked;
    state.draftGrid = draft();
    renderGrid();
  };
  for (const el of [hasGrid, size, gx, gy]) el.addEventListener('input', preview);

  // Other pictures of the same map (night, after the fire): added and removed here at once; which one shows is in the map bar.
  const variants = h('div', { class: 'map-variants' });
  const renderVariants = () => {
    const m = state.maps.find((x) => x.id === map.id) ?? map;
    variants.replaceChildren(
      ...m.variants.map((v) => h('div', { class: 'map-row' },
        h('span', {}, `${v.name}${m.variant === v.id ? ' (showing)' : ''}`),
        h('button', { type: 'button', class: 'ghost danger', 'aria-label': `Remove ${v.name}`, onclick: async () => {
          if (!confirm(`Remove the picture "${v.name}"? (It stays in the archive.)`)) return;
          try {
            const saved = await state.guarded(() => api('DELETE', `${base()}/${map.id}/variants/${v.id}`));
            if (saved) onMap(saved);
            renderVariants();
          } catch (err) {
            report(err);
          }
        } }, 'Remove'),
      )),
    );
  };
  const addVariant = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Another picture of this map' });
  addVariant.addEventListener('change', async () => {
    const file = addVariant.files[0];
    addVariant.value = '';
    if (!file) return;
    try {
      status('Uploading…');
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await state.guarded(() => api('POST', `${base()}/${map.id}/variants`, { filename: file.name, data }));
      if (res) onMap(res.map);
      renderVariants();
    } catch (err) {
      report(err);
    }
  });
  renderVariants();

  const reading = map.reading;
  const aiText = [map.description, reading.notes].filter(Boolean).join('\n\n');
  const save = async () => {
    const grid = draft();
    const d = Number(distance.value);
    const scale = d > 0 && (per.value === 'width' || grid) ? { distance: d, unit: unit.value, per: per.value } : null;
    const saved = await api('PATCH', `${base()}/${map.id}`, { name: name.value.trim() || map.name, shown: shown.checked, grid, scale });
    onMap(saved);
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      state.guarded(save).then(() => dialog.close()).catch(report);
    } },
      h('h2', {}, 'Map settings'),
      field('Name', name),
      h('label', { class: 'map-check' }, shown, ' Players can see this map'),
      h('h3', {}, 'Grid'),
      h('label', { class: 'map-check' }, hasGrid, ' This map has a grid (tokens snap to it)'),
      gridFields,
      h('p', { class: 'muted small' }, 'The grid is drawn over the map while this is open, so you can line it up.'),
      h('h3', {}, 'Scale'),
      h('div', { class: 'map-row' }, field('Distance', distance), field('Unit', unit), field('Measured', per)),
      h('h3', {}, 'Other pictures'),
      h('p', { class: 'muted small' }, 'The same map at night, after a fire, with a secret door showing… Each is stretched to fit this map, so everything stays in place. Pick which one everyone sees in the map bar.'),
      variants,
      field('Add a picture', addVariant),
      h('h3', {}, 'What the AI saw'),
      h('p', { class: 'muted small map-ai' }, reading.status === 'pending' ? 'Reading…' : reading.status === 'failed' ? reading.error : aiText || 'Nothing to add.'),
      h('p', { class: 'muted small' }, 'Only you see this.'),
      h('div', { class: 'map-dialog-actions' },
        h('button', { type: 'button', class: 'ghost danger', onclick: () => removeMap(map).then(() => dialog.close()) }, 'Remove map'),
        h('button', { type: 'button', class: 'ghost', disabled: reading.status === 'pending', onclick: () => readAgain(map).then(() => dialog.close()) }, 'Read again with the AI'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, 'Save'),
      ),
    ),
  );
  dialog.onclose = () => {
    state.draftGrid = undefined;
    if (state.current) renderGrid();
  };
  preview();
  dialog.showModal();
}

async function readAgain(map) {
  if (!confirm('Read this map again with the AI? Its grid, scale and description will be replaced.')) return;
  try {
    onMap(await state.guarded(() => api('POST', `${base()}/${map.id}/read`)));
  } catch (err) {
    report(err);
  }
}

async function removeMap(map) {
  if (!confirm(`Remove "${map.name}"? Nobody will see it any more. (It stays in the archive.)`)) return;
  try {
    await state.guarded(() => api('DELETE', `${base()}/${map.id}`));
    onGone(map.id);
  } catch (err) {
    report(err);
  }
}

let players = null;

/** Add a token, or change one (DM). New tokens go in the middle of what's on screen. */
async function tokenDialog(token = null) {
  const map = state.current;
  if (!map) return;
  players ??= (await state.guarded(() => api('GET', `/campaigns/${state.campaignId}/members`))).filter((m) => m.role === 'player' && !m.revoked_at);
  const dialog = $('#map-dialog');
  const kind = h('select', {}, ...TOKEN_KINDS.map((k) => new Option(TOKEN_KIND_NAMES[k], k)));
  kind.value = token?.kind ?? 'enemy';
  const player = h('select', {}, new Option('Nobody (the DM moves it)', ''), ...players.map((p) => new Option(`${p.character_name || p.name} (${p.name})`, p.id)));
  player.value = token?.user_id ?? '';
  const name = h('input', { value: token?.name ?? '', maxLength: 80, placeholder: 'Goblin 1' });
  const size = h('select', {}, ...TOKEN_SIZES.map((s) => new Option(`${TOKEN_SIZE_NAMES[s]} (${s === 0.5 ? '½' : s} square${s > 1 ? 's' : ''})`, s)));
  size.value = String(token?.size ?? 1);
  const color = h('input', { type: 'color', value: token?.color ?? TOKEN_COLORS[kind.value] });
  const hpMax = h('input', { type: 'number', min: '1', step: '1', value: token?.hp?.max ?? '', placeholder: 'unknown' });
  const hidden = h('input', { type: 'checkbox', checked: !!token?.hidden });
  const darkvision = h('input', { type: 'number', min: '0', step: '5', value: token?.darkvision || '', placeholder: 'none' });
  // Someone from the campaign's records (what the archivist has written down about them).
  const { records } = (await state.guarded(() => api('GET', `${base()}/records`))) ?? { records: [] };
  const recordOption = (r) => new Option(`${r.title}${r.person ? '' : ` (${r.kind})`}`, r.id);
  const record = h('select', {}, new Option('Nobody in particular', ''),
    h('optgroup', { label: 'People and creatures' }, ...records.filter((r) => r.person).map(recordOption)),
    h('optgroup', { label: 'Everything else' }, ...records.filter((r) => !r.person).map(recordOption)));
  if (token?.record && !records.some((r) => r.id === token.record.id)) record.append(new Option(token.record.title, token.record.id));
  record.value = token?.record?.id ?? '';
  const recordField = field("From the campaign's records", record);
  recordField.hidden = !records.length && !token?.record;
  record.addEventListener('change', () => {
    const r = records.find((x) => String(x.id) === record.value);
    if (!r) return;
    if (!token || !name.value.trim()) name.value = r.title.slice(0, 80);
    // Someone from the records is an NPC, unless the archivist files them as a monster or a foe.
    if (!token) kind.value = /monster|creature|enem|villain|beast|foe/i.test(r.kind) ? 'enemy' : 'npc';
    sync();
  });
  // One of the DM's saved creatures instead (the Creatures tab).
  const saved = token ? [] : creatureList().filter((c) => !c.finding);
  const fromLibrary = h('select', {}, new Option('Make a new one here', ''), ...saved.map((c) => new Option(`${c.name} (${c.kind === 'npc' ? 'NPC' : 'enemy'})`, c.id)));
  fromLibrary.addEventListener('change', () => {
    const c = saved.find((x) => x.id === fromLibrary.value);
    if (c) placeDialog(c);
  });
  const libraryField = saved.length ? field('From your creatures', fromLibrary) : null;
  const lookUp = h('input', { type: 'checkbox', checked: true });
  const lookUpField = h('label', { class: 'map-check' }, lookUp, ' Fill in its stat block, hit points and size with the AI');
  let colorTouched = !!token;
  color.addEventListener('input', () => (colorTouched = true));
  const playerField = field('Player', player);
  const sync = () => {
    playerField.hidden = kind.value !== 'pc';
    lookUpField.hidden = !!token || kind.value !== 'enemy';
    if (!colorTouched) color.value = TOKEN_COLORS[kind.value];
  };
  kind.addEventListener('change', sync);
  // A player's token is named after their character unless something else is typed.
  player.addEventListener('change', () => {
    const p = players.find((x) => String(x.id) === player.value);
    if (p && !name.value.trim()) name.value = p.character_name || p.name;
  });
  sync();

  const save = async () => {
    const body = {
      kind: kind.value,
      name: name.value.trim(),
      user_id: kind.value === 'pc' && player.value ? Number(player.value) : null,
      size: Number(size.value),
      color: color.value,
      hidden: hidden.checked,
      darkvision: Math.max(0, Number(darkvision.value) || 0),
    };
    if (record.value !== String(token?.record?.id ?? '')) body.record = record.value ? { id: Number(record.value) } : null;
    const max = Number(hpMax.value) > 0 ? Math.round(Number(hpMax.value)) : null;
    if (max !== (token?.hp?.max ?? null)) {
      // A new maximum: keep the damage taken so far, or start at full.
      const taken = token?.hp?.max && token.hp.current != null ? token.hp.max - token.hp.current : 0;
      body.hp = max ? { current: max - taken, max } : null;
    }
    if (token) {
      onMap((await api('PATCH', `${base()}/${map.id}/tokens/${token.id}`, body)).map);
    } else {
      const box = $('#map-view').getBoundingClientRect();
      const middle = toImage(box.left + box.width / 2, box.top + box.height / 2);
      const res = await api('POST', `${base()}/${map.id}/tokens`, { ...body, ...middle });
      onMap(res.map);
      select(res.token.id);
      if (kind.value === 'enemy' && lookUp.checked && body.name) fillStats(res.token);
    }
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      state.guarded(save).then(() => dialog.close()).catch(report);
    } },
      h('h2', {}, token ? 'Change token' : 'Add a token'),
      libraryField,
      recordField,
      field('Kind', kind),
      playerField,
      field('Name', name),
      h('div', { class: 'map-row' }, field('Size', size), field('Colour', color), field('Max HP', hpMax), field(`Darkvision (${map.scale?.unit ?? 'ft'})`, darkvision)),
      h('label', { class: 'map-check' }, hidden, ' Hidden from players (an ambush, someone lurking)'),
      lookUpField,
      token ? null : h('p', { class: 'muted small' }, 'It appears in the middle of what you can see; drag it into place.'),
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, token ? 'Save' : 'Add'),
      ),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

/**
 * Put one of the DM's creatures on the map on screen (from the Creatures tab
 * or Add token): how many, and whether hidden. They appear in a row in the
 * middle of what's on screen, numbered when there are several.
 */
export function placeCreature(c) {
  document.querySelector('[data-tab=map]').click();
  if (!state.current) return status('Import a map first, then place your creatures on it.', true);
  placeDialog(c);
}

function placeDialog(c) {
  const map = state.current;
  const dialog = $('#map-dialog');
  const count = h('input', { name: 'count', type: 'number', min: '1', max: '20', step: '1', value: '1' });
  const hidden = h('input', { type: 'checkbox' });
  const place = async () => {
    const box = $('#map-view').getBoundingClientRect();
    const middle = toImage(box.left + box.width / 2, box.top + box.height / 2);
    const n = Math.min(20, Math.max(1, Math.round(Number(count.value)) || 1));
    const res = await api('POST', `${base()}/${map.id}/creatures/${c.id}`, { count: n, hidden: hidden.checked, ...middle });
    onMap(res.map);
    select(res.tokens[0]?.id ?? null);
    status(n > 1 ? `${res.tokens.map((t) => t.name).join(', ')} are on the map.` : `${res.tokens[0].name} is on the map.`);
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      state.guarded(place).then(() => dialog.close()).catch(report);
    } },
      h('h2', {}, `Place ${c.name}`),
      h('p', { class: 'muted small' }, [c.kind === 'npc' ? 'Friendly NPC' : 'Enemy', TOKEN_SIZE_NAMES[c.size], c.hp_max ? `${c.hp_max} HP` : '', c.stats ? 'with its stat block' : '', c.picture ? 'and picture' : ''].filter(Boolean).join(' · ')),
      field('How many', count),
      h('label', { class: 'map-check' }, hidden, ' Hidden from players (an ambush, someone lurking)'),
      h('p', { class: 'muted small' }, 'They appear in a row in the middle of what you can see, numbered if there are several; drag them into place.'),
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, 'Place')),
    ),
  );
  dialog.onclose = null;
  if (!dialog.open) dialog.showModal();
  count.select?.();
}

/** Keep a token from the map in the DM's creatures. */
async function saveCreature(token) {
  try {
    const res = await state.guarded(() => api('POST', `/campaigns/${state.campaignId}/creatures`, { from: { map_id: state.current.id, token_id: token.id } }));
    if (!res) return;
    creatureSaved(res);
    status(`${res.name} is in your creatures now (the Creatures tab).`);
  } catch (err) {
    report(err);
  }
}

/** What the campaign's records say about the person a token stands for (DM only). */
async function recordDialog(token) {
  try {
    const r = await state.guarded(() => api('GET', `${base()}/records/${token.record.id}?title=${encodeURIComponent(token.record.title)}`));
    if (!r) return;
    const dialog = $('#map-dialog');
    const body = h('div', { class: 'a stat-text' });
    body.innerHTML = DOMPurify.sanitize(marked.parse(r.body || '_Nothing written down yet._'), { FORBID_TAGS: ['img', 'a', 'style', 'form', 'input', 'button'], FORBID_ATTR: ['style'] });
    const data = Object.keys(r.data ?? {}).length ? h('pre', { class: 'small' }, JSON.stringify(r.data, null, 2)) : null;
    dialog.replaceChildren(
      h('form', { method: 'dialog', class: 'map-dialog-inner' },
        h('h2', {}, r.title),
        h('p', { class: 'muted small' }, [r.kind, r.status, ...(r.tags ?? [])].filter(Boolean).join(' · ')),
        body,
        data,
        h('p', { class: 'muted small' }, 'From the archivist, as the campaign has it now. Only you see this.'),
        h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { class: 'primary' }, 'Close')),
      ),
    );
    dialog.onclose = null;
    dialog.showModal();
  } catch (err) {
    report(err);
  }
}

/** Ask the AI for a creature's stat block (DM). Hit points and size come with it unless already set. */
/** The DM picks a picture for an NPC or enemy token; tokens with the same name can share it. */
function chooseTokenPicture(token) {
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return status('That picture is too big (10 MB at most).', true);
    const twins = state.current.tokens.filter((t) => t.id !== token.id && t.kind !== 'pc' && t.name.toLowerCase() === token.name.toLowerCase()).length;
    const same_name = twins > 0 && confirm(`Use this picture for all ${twins + 1} tokens named "${token.name}" on this map?`);
    try {
      status('Uploading…');
      const data = await readBase64(file);
      const res = await state.guarded(() => api('PUT', `${base()}/${state.current.id}/tokens/${token.id}/picture`, { filename: file.name, data, same_name }));
      if (!res) return;
      onMap(res.map);
      status(`${token.name} has a picture now.`);
    } catch (err) {
      report(err);
    }
  });
  document.body.append(input);
  input.click();
}

async function removeTokenPicture(token) {
  try {
    const res = await state.guarded(() => api('DELETE', `${base()}/${state.current.id}/tokens/${token.id}/picture`));
    if (res) onMap(res.map);
  } catch (err) {
    report(err);
  }
}

async function fillStats(token, name) {
  status(`Looking up ${name ?? token.name}…`);
  try {
    const res = await state.guarded(() => api('POST', `${base()}/${state.current.id}/tokens/${token.id}/stats`, name ? { name } : {}));
    if (!res) return;
    onMap(res.map);
    status(`Stat block for ${res.token.name}: ${res.token.stats.name} (from the AI's memory; check it against the book if it matters).`);
  } catch (err) {
    report(err);
  }
}

/** A token's stat block (DM only), with a way to look up a different creature. */
function statsDialog(token) {
  const dialog = $('#map-dialog');
  const st = token.stats;
  const body = h('div', { class: 'a stat-text' });
  body.innerHTML = DOMPurify.sanitize(marked.parse(st.text), { FORBID_TAGS: ['img', 'a', 'style', 'form', 'input', 'button'], FORBID_ATTR: ['style'] });
  const other = h('input', { placeholder: 'Another creature, e.g. Bugbear', maxLength: 100 });
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      if (other.value.trim()) fillStats(token, other.value.trim());
      dialog.close();
    } },
      h('h2', {}, `${token.name}: ${st.name || 'stat block'}`),
      h('p', { class: 'muted small' }, [st.ac != null ? `AC ${st.ac}` : '', st.hp_formula ? `HP ${st.hp_formula}` : '', st.speed, st.challenge ? `CR ${st.challenge}` : ''].filter(Boolean).join(' · ')),
      body,
      h('p', { class: 'muted small' }, st.source === 'ai' ? "From the AI's memory of the 5e rules. Only you see this." : 'Only you see this.'),
      h('div', { class: 'map-dialog-actions' }, other, h('button', { class: 'ghost' }, 'Look up instead'), h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'primary', onclick: () => dialog.close() }, 'Close')),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

async function removeToken(token) {
  if (!confirm(`Remove ${token.name} from the map?`)) return;
  try {
    const res = await state.guarded(() => api('DELETE', `${base()}/${state.current.id}/tokens/${token.id}`));
    if (res) onMap(res.map);
    select(null);
  } catch (err) {
    report(err);
  }
}

// ---------- wiring ----------

/** Stop listening (logging out, or leaving the campaign). */
export function stopMaps() {
  state.live?.abort();
  state.live = null;
  state.pins.clear();
  state.pinMode = false;
  Object.assign(state, { measuring: false, ruler: null, templateDraft: null, templatePlace: null, combatOpen: false, pinging: false, drawing: false, stroke: null, signals: [] });
  state.combatActive.clear();
  players = null;
}

export function initMapActions() {
  const view = $('#map-view');
  view.addEventListener('pointerdown', viewDown);
  view.addEventListener('pointermove', viewMove);
  view.addEventListener('pointerup', viewUp);
  view.addEventListener('pointercancel', viewUp);
  view.addEventListener('wheel', (e) => {
    if (!state.current) return;
    e.preventDefault();
    const box = view.getBoundingClientRect();
    zoomAt(e.clientX - box.left, e.clientY - box.top, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
  }, { passive: false });
  // The tab is hidden when the map first loads; fit it once there's room to.
  new ResizeObserver(() => {
    if (!state.fitted) fit();
  }).observe(view);

  document.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'w' || e.key === 'W') && state.drag && addWaypoint()) e.preventDefault();
  });
  $('#map-pick').addEventListener('change', (e) => show(state.maps.find((m) => m.id === e.target.value) ?? null));
  $('#map-fit').addEventListener('click', fit);
  const showGrid = $('#map-show-grid');
  showGrid.checked = storage.get(SHOW_GRID_KEY) === '1';
  showGrid.addEventListener('change', () => {
    storage.set(SHOW_GRID_KEY, showGrid.checked ? '1' : null);
    if (state.current) renderGrid();
  });
  $('#map-import').addEventListener('click', () => $('#map-file').click());
  $('#map-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) state.guarded(() => importMap(file)).catch(report);
  });
  $('#map-add-token').addEventListener('click', () => tokenDialog().catch(report));
  $('#map-fog-open').addEventListener('click', () => {
    const tools = $('#map-fog-tools');
    tools.hidden = !tools.hidden;
    if (tools.hidden) setTool({});
    renderFogTools();
  });
  $('#map-fog-on').addEventListener('change', (e) => {
    const on = e.target.checked;
    fog({ enabled: on }).then(() => {
      // Everything starts covered, so go straight to revealing (unless line of sight is doing it).
      if (on && state.current?.fog?.enabled && !state.current.fog.sight) setTool({ fogMode: 'reveal' });
      else if (!on && state.fogMode) setTool({});
    });
  });
  for (const b of document.querySelectorAll('[data-fog-mode]')) {
    b.addEventListener('click', () => setTool({ fogMode: state.fogMode === b.dataset.fogMode ? null : b.dataset.fogMode }));
  }
  $('#map-sight-on').addEventListener('change', (e) => fog({ sight: e.target.checked }));
  $('#map-memory-on').addEventListener('change', (e) => fog({ memory: e.target.checked }));
  $('#map-dark-on').addEventListener('change', (e) => fog({ dark: e.target.checked }));
  $('#map-light-kind').replaceChildren(...Object.entries(LIGHT_PRESETS).map(([k, p]) => new Option(`${p.name} (${p.bright}/${p.dim} ft)`, k)));
  $('#map-light-kind').value = 'torch';
  $('#map-fog-map').addEventListener('change', (e) => fog({ map: e.target.value }));
  for (const b of document.querySelectorAll('[data-wall-mode]')) {
    b.addEventListener('click', () => setTool({ wallMode: state.wallMode === b.dataset.wallMode ? null : b.dataset.wallMode }));
  }
  $('#map-walls-draft').addEventListener('click', async () => {
    const map = state.current;
    if (map.walls.some((w) => w.source === 'ai') && !confirm("Replace the AI's walls with a new draft? Walls you drew stay.")) return;
    try {
      const saved = await state.guarded(() => api('POST', `${base()}/${map.id}/walls/draft`, {}));
      if (saved) onMap(saved);
    } catch (err) {
      report(err);
    }
  });
  for (const b of document.querySelectorAll('[data-wall-action]')) {
    b.addEventListener('click', () => {
      if (b.dataset.wallAction === 'clear-ai') {
        if (confirm("Remove everything the AI drafted (walls, lights, difficult terrain)? What you drew stays.")) {
          walls({ clear: 'ai' }).then(() => lights({ clear: 'ai' })).then(() => terrain({ clear: 'ai' }));
        }
      } else if (confirm('Make players forget the places they saw before?')) {
        fog({ forget: true });
      }
    });
  }
  for (const b of document.querySelectorAll('[data-fog-action]')) {
    b.addEventListener('click', () => {
      const action = b.dataset.fogAction;
      if (action === 'undo') return fog({ undo: true });
      if (confirm(action === 'reveal' ? 'Reveal the whole map to players?' : 'Cover the whole map again?')) fog({ reset: action });
    });
  }
  $('#map-settings').addEventListener('click', settingsDialog);
  $('#map-variant').addEventListener('change', async (e) => {
    try {
      const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}`, { variant: e.target.value || null }));
      if (saved) onMap(saved);
    } catch (err) {
      report(err);
    }
  });
  $('#map-pin').addEventListener('click', () => {
    state.pinMode = !state.pinMode;
    if (state.pinMode) Object.assign(state, { fogMode: null, wallMode: null, measuring: false, templateDraft: null, ruler: null, pinging: false, drawing: false });
    renderFogTools();
    renderPinTool();
    renderMeasureTools();
    if (state.current) renderRuler();
    if (state.pinMode) status('Click the map where the pin goes. Only you will see it.');
  });
  $('#map-ruler').addEventListener('click', () => {
    const on = !state.measuring;
    setTool({});
    Object.assign(state, { measuring: on, templateDraft: null, ruler: null, pinMode: false, pinging: false, drawing: false });
    renderPinTool();
    renderMeasureTools();
    if (state.current) renderRuler();
    if (on) status(state.current?.scale ? 'Drag on the map to measure. Only you see it.' : "This map has no scale yet, so distances can't be measured.", !state.current?.scale);
  });
  for (const [id, key] of [['#map-ping', 'pinging'], ['#map-draw', 'drawing']]) {
    $(id).addEventListener('click', () => {
      const on = !state[key];
      setTool({});
      Object.assign(state, { measuring: false, ruler: null, templateDraft: null, pinMode: false, pinging: false, drawing: false, [key]: on });
      renderPinTool();
      renderMeasureTools();
      if (state.current) renderRuler();
      if (on) status(key === 'pinging' ? 'Click the map to point everyone there.' : 'Drag on the map to sketch. Everyone sees it for a little while.');
    });
  }
  $('#map-template').addEventListener('click', () => {
    if (state.templateDraft) {
      state.templateDraft = null;
      return renderMeasureTools();
    }
    templateDialog().catch(report);
  });
  $('#map-combat-open').addEventListener('click', () => {
    state.combatOpen = !state.combatOpen;
    renderCombat();
  });
}
