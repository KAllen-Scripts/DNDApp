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
import { TOKEN_KIND_NAMES, TOKEN_SIZE_NAMES, CONDITIONS, snapToken, tokenPx, measure, formatDistance, fogRect, healthOf, fogMask, FOG_MASK_FILL, snapWallPoint, nearestWall, arcThrough, circlePoints, LIGHT_PRESETS, pxPerUnit, squarePx, pathCost, pointInPolygon, inTemplate, snapTemplatePoint } from './shared/map.js';
import { PICK_KEY, SHOW_GRID_KEY, SHOW_WALLS_KEY, base, report, state, status } from './map-state.js';
import { canChangeTemplate, placeTemplate, renderTemplates, selectTemplate, templateControls, templateDialog, templateMove, templateUp } from './map-templates.js';
import { openShop } from './merchants.js';
import { chooseTokenPicture, fillStats, forgetPlayers, importMap, recordDialog, removeToken, removeTokenPicture, saveCreature, settingsDialog, statsDialog, tokenDialog } from './map-dm.js';
import { renderCombat } from './map-combat.js';

const $ = (sel) => document.querySelector(sel);
const KIND_LABELS = { battle: 'Battle map', dungeon: 'Dungeon', building: 'Building', town: 'Town', region: 'Region', world: 'World', other: 'Map' };
const MAX_ZOOM = 8;

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

export function onMap(map) {
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

export function onGone(id) {
  state.maps = state.maps.filter((m) => m.id !== id);
  renderPicker();
  if (state.current?.id === id) show(state.maps.at(-1) ?? null);
}

/** Put a map on screen (or the empty message). */
export async function show(map) {
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

export function render() {
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

export function renderGrid() {
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
export const svgEl = (tag, attrs) => {
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
  // The DM can hide the walls for a clean map while playing; they show while Fog & walls is open.
  const hidden = state.canEdit && storage.get(SHOW_WALLS_KEY) === '0' && $('#map-wall-tools').hidden;
  svg.classList.toggle('walls-hidden', hidden);
  const list = state.canEdit ? map.walls.filter((w) => !hidden || w.door) : (map.doors ?? []);
  const line = (w, cls) => svgEl('line', { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, class: cls });
  const cls = (w) => (w.door || !state.canEdit
    ? `door${w.open ? ' open' : ''}${w.locked ? ' locked' : ''}`
    : `wall${w.kind === 'low' ? ' low' : ''}${w.source === 'ai' ? ' ai' : ''}`);
  // Lights (the DM's): the dim reach, the bright reach and the source.
  if (state.canEdit && !hidden) {
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
  const draft = state.wallMode === 'door' || state.wallMode === 'low' ? ` ${state.wallMode}` : '';
  const path = (pts) => svgEl('polyline', { points: pts.map((p) => `${p.x},${p.y}`).join(' '), class: `wall-draft${draft}` });
  if (d && state.wallMode === 'circle') svg.append(path(circlePoints(d.a, Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y))));
  else if (d) svg.append(line({ x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y }, `wall-draft${draft}`));
  if (state.curveBend) svg.append(path(arcThrough(state.curveBend.a, state.curveBend.m, state.curveBend.b)));
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
export function setTool({ fogMode = null, wallMode = null }) {
  state.fogMode = fogMode;
  state.wallMode = wallMode;
  if (state.curveBend) {
    state.curveBend = null;
    if (state.current) renderWalls();
  }
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

export function renderTokens() {
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
        title: [t.name, t.merchant ? 'Merchant: pick to shop' : TOKEN_KIND_NAMES[t.kind], hpText(t), ...t.conditions].filter(Boolean).join(' · '),
        role: 'button',
        tabindex: '0',
        'aria-label': t.name,
        'data-id': t.id,
      },
      picture ? h('img', { class: 'token-picture', src: picture, alt: '', draggable: 'false' }) : h('span', { class: 'token-initials' }, initials(t.name)),
      h('span', { class: 'token-name' }, t.name),
      health ? h('span', { class: `token-hp ${health}` }, h('span', { style: `width:${hpFraction(t, health) * 100}%` })) : null,
      t.conditions.length ? h('span', { class: 'token-conditions', title: t.conditions.join(', ') }, String(t.conditions.length)) : null,
      t.merchant ? h('span', { class: 'token-shop', 'aria-hidden': 'true' }, '⚖') : null);
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

export function renderPins() {
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

export function renderPinTool() {
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

export function renderSelection() {
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
      token.merchant ? h('button', { class: 'primary', title: 'See what this merchant sells, and buy', onclick: () => openShop(token.merchant) }, 'Shop') : null,
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

export function select(id) {
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
  if (state.wallMode === 'curve' || state.wallMode === 'circle') {
    if (click) return;
    const r = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
    if (state.wallMode === 'circle') return walls({ circle: { x: d.a.x, y: d.a.y, r } });
    // Now bend it: the middle follows the pointer until a click places it.
    state.curveBend = { a: d.a, b: d.b, m: { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 } };
    status('Move to bend the wall, then click. Esc to stop.');
    return renderWalls();
  }
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
export function toImage(clientX, clientY) {
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
  // A curve being bent: this click places it.
  if (state.curveBend && state.wallMode === 'curve') {
    const { a, b, m } = state.curveBend;
    state.curveBend = null;
    renderWalls();
    walls({ curve: { x1: a.x, y1: a.y, mx: m.x, my: m.y, x2: b.x, y2: b.y } });
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
    const at = toImage(e.clientX, e.clientY);
    state.wallDraw.b = state.wallMode === 'circle' ? at : snapWallPoint(state.current, at, SNAP_PX / state.view.k);
    return renderWalls();
  }
  if (state.curveBend) {
    state.curveBend.m = toImage(e.clientX, e.clientY);
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
export function renderRuler() {
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

export function renderMeasureTools() {
  $('#map-ruler').setAttribute('aria-pressed', String(state.measuring));
  $('#map-ping').setAttribute('aria-pressed', String(state.pinging));
  $('#map-draw').setAttribute('aria-pressed', String(state.drawing));
  $('#map-view').classList.toggle('pin-placing', state.pinMode || state.pinging || state.drawing);
  $('#map-template').setAttribute('aria-pressed', String(!!state.templateDraft));
  $('#map-view').classList.toggle('measuring', state.measuring || !!state.templateDraft);
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
  forgetPlayers();
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
    if (e.key === 'Escape' && state.curveBend) {
      state.curveBend = null;
      renderWalls();
      status('');
    }
  });
  $('#map-pick').addEventListener('change', (e) => show(state.maps.find((m) => m.id === e.target.value) ?? null));
  $('#map-fit').addEventListener('click', fit);
  const showWalls = $('#map-show-walls');
  showWalls.checked = storage.get(SHOW_WALLS_KEY) !== '0';
  showWalls.addEventListener('change', () => {
    storage.set(SHOW_WALLS_KEY, showWalls.checked ? null : '0');
    if (state.current) renderWalls();
  });
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
    if (state.current) renderWalls(); // hidden walls show while the panel is open
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
  $('#map-walls-file').addEventListener('click', () => $('#map-walls-file-input').click());
  $('#map-walls-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const map = state.current;
    if (map.walls.some((w) => w.source === 'file') && !confirm('Replace the walls from the last file with this one? Walls you drew and the AI drafted stay.')) return;
    try {
      const data = await readBase64(file);
      const saved = await state.guarded(() => api('POST', `${base()}/${map.id}/walls/file`, { data }));
      if (!saved) return;
      onMap(saved);
      const n = saved.walls.filter((w) => w.source === 'file');
      status(`From the file: ${n.filter((w) => !w.door).length} walls, ${n.filter((w) => w.door).length} doors, ${saved.lights.filter((l) => l.source === 'file').length} lights. ${saved.file_notes ?? ''}`.trim());
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
