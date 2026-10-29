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
import { api, listen, fileUrl, h, storage, LoggedOut, readBase64 } from '../page/api.js';
import { TOKEN_KIND_NAMES, TOKEN_SIZE_NAMES, CONDITIONS, EFFORTS, playersMap, snapToken, tokenPx, measure, formatDistance, fogRect, healthOf, fogMask, playerFogMask, wallBetween, snapWallPoint, nearestWall, arcThrough, circlePoints, LIGHT_PRESETS, pxPerUnit, squarePx, pathCost, pointInPolygon, distanceToWall, inTemplate, snapTemplatePoint, groundAt, tokenTall, bridgeAt, isUnder, isPinMap, snapRoadPoint, parentOf } from '/shared/map.js';
import { nav as wikiNav } from '../wiki/data.js';
import { renderWikiLayers, initWikiLayers } from './wiki-layers.js';
import { PICK_KEY, SHOW_GRID_KEY, SHOW_WALLS_KEY, WALLS_EFFORT_KEY, base, downloadUvtt, report, state, status } from './state.js';
import { canChangeTemplate, placeTemplate, renderTemplates, selectTemplate, templateControls, templateDialog, templateMove, templateUp } from './spell-templates.js';
import { openShop } from '../items/merchants.js';
import { openCreator } from './creator/creator.js';
import { chooseTokenPicture, fillStats, forgetPlayers, importMap, newMapDialog, recordDialog, removeToken, removeTokenPicture, saveCreature, settingsDialog, statsDialog, tokenDialog } from './dm-tools.js';
import { renderCombat } from './combat.js';
import { companionDialog, companionRolls, dismissCompanion, myCompanion } from './companions.js';
import { attackControls, attackLog, customForm, pickTarget, seeAttacks, spellTags, stopTargeting } from './attacks.js';
import { initMapFull } from './full-screen.js';
import { groupsDialog, mapOptions, placeEnd, placeMove, placeStart, renderPlaces, shownNote } from './places.js';
import { clockDialog, journeyText, onClock, renderClock, renderRoads, renderRoutes, roadMode, roads, travelControls as journeyControls, travelPicked } from './travel.js';
import { PIN_PX, followMyCharacter, myCharacterMap, partyDialog, pinFan, travelControls } from './world.js';

const $ = (sel) => document.querySelector(sel);
export const KIND_LABELS = { battle: 'Battle map', dungeon: 'Dungeon', building: 'Building', town: 'Town', region: 'Region', world: 'World', other: 'Map' };
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
  const { can_edit, maps, walls_effort, clock } = await api('GET', base());
  state.canEdit = can_edit;
  state.clock = clock ?? null;
  renderClock();
  state.wallsEffort = walls_effort ?? '';
  state.editing = false;
  state.maps = maps;
  $('#tab-map').classList.toggle('can-edit', can_edit);
  state.broughtSeen = playersMap(maps)?.brought_at ?? '';
  state.characterSeen = myCharacterMap()?.id ?? null;
  state.bouncedFrom = null;
  // Players open on the map their character is on, else the one the DM brought them to; the DM on the one they had open.
  const remembered = maps.find((m) => m.id === storage.get(PICK_KEY()));
  await show((!can_edit && (myCharacterMap() || playersMap(maps))) || remembered || maps.at(-1) || null);
  startLive();
}

/** Where to go when the map on screen goes away: for players the players' map, else the newest. */
const fallbackMap = () => (!state.canEdit && (myCharacterMap() || playersMap(state.maps))) || state.maps.at(-1) || null;

/** Players: go to the map the DM just brought everyone to (once per bring; they can look elsewhere afterwards). */
function followPlayersMap() {
  const party = playersMap(state.maps);
  if (state.canEdit || !party || party.brought_at <= state.broughtSeen) return;
  state.broughtSeen = party.brought_at;
  if (state.current?.id === party.id) return;
  show(party);
  noteOnMap('Your DM brought everyone here');
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
          else if (event === 'clock') onClock(data);
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
          const { maps, clock } = await api('GET', base());
          state.maps = maps;
          if (clock != null) onClock({ clock });
          const current = maps.find((m) => m.id === state.current?.id) ?? null;
          if (current) onMap(current);
          else if (state.current) await show(fallbackMap());
          followPlayersMap();
          followMyCharacter();
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
  } else if (!state.current || (i < 0 && map.id === state.bouncedFrom)) {
    // A new map with nothing on screen, or the one the DM hid for a moment back again.
    show(map);
  }
  followPlayersMap();
  followMyCharacter();
}

export function onGone(id) {
  state.maps = state.maps.filter((m) => m.id !== id);
  renderPicker();
  if (state.current?.id === id) {
    show(fallbackMap());
    state.bouncedFrom = id;
  }
}

/** Put a map on screen (or the empty message). */
export async function show(map) {
  stopTargeting();
  state.current = map;
  state.bouncedFrom = null;
  state.selected = null;
  state.selectedPin = null;
  state.selectedTemplate = null;
  state.selectedDoor = null;
  state.selectedRaised = null;
  state.raisedEdit = null;
  state.ruler = null;
  state.fitted = false;
  if (map) storage.set(PICK_KEY(), map.id);
  document.dispatchEvent(new CustomEvent('dndmapshown', { detail: { id: map?.id ?? null } }));
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
  const party = playersMap(state.maps);
  const note = (m) => (m.id === party?.id ? (state.canEdit ? ' (players here)' : ' (party here)') : shownNote(m));
  // In world order: each map under the one it's a place on.
  select.replaceChildren(...mapOptions(note));
  select.value = state.current?.id ?? '';
  select.hidden = !state.maps.length;
  // The DM's one click to show the map on screen to the players and switch their pages to it.
  const bring = $('#map-bring');
  const here = !!state.current && state.current.id === party?.id;
  bring.disabled = !state.current || here;
  bring.textContent = here ? 'Players are here' : 'Show players this map';
  bring.title = here
    ? "The players' pages show this map. To move them, open another map and press Show players this map."
    : `Show this map to the players${state.current && !state.current.shown ? ' (it is hidden from them now)' : state.current?.shown_to ? ' (only some players see it now)' : ''} and switch their pages to it.`;
}

/** Bring the players to the map on screen (DM): their pages switch to it. */
async function bringPlayers() {
  const map = state.current;
  if (!map) return;
  try {
    const res = await state.guarded(() => api('POST', `${base()}/${map.id}/bring`));
    if (!res) return;
    onMap(res);
    const fix = howToSeeAnything(res);
    noteOnMap(fix ? `The players now see this map, but only fog: ${fix}` : 'The players now see this map');
  } catch (err) {
    report(err);
  }
}

/** When players would see nothing of a map but dark fog (nothing revealed, nothing for them to see from), what to do about it; else ''. */
function howToSeeAnything(map) {
  const f = map.fog;
  if (!f?.enabled || f.map !== 'dark' || f.shapes.some((s) => s.op === 'reveal')) return '';
  if (!f.sight) return 'reveal parts, or tick Line of sight, in Fog & sight';
  if (!map.tokens.some((t) => t.kind === 'pc')) return 'reveal parts in Fog & sight, or add their characters (they see from their tokens)';
  return '';
}

export function render() {
  const map = state.current;
  const empty = $('#map-empty');
  renderVariantPicker();
  $('#map-stage').hidden = !map;
  for (const b of document.querySelectorAll('.map-needs-map')) b.disabled = !map;
  if (map) seeAttacks(map);
  if (!map) {
    $('#map-image').removeAttribute('src');
    $('#map-tokens').replaceChildren();
    $('#map-pins').replaceChildren();
    $('#map-links').replaceChildren();
    renderRoutes();
    renderPlaces();
    renderWikiLayers();
    $('#map-templates').replaceChildren();
    $('#map-ruler-line').replaceChildren();
    renderSelection();
    renderCombat();
    renderWallDraft();
    $('#map-signals').replaceChildren();
    empty.hidden = false;
    empty.textContent = state.canEdit
      ? 'No maps yet. Press New map to import one (a battle map, a town, a region, anything) or make one from scratch. Then add tokens.'
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
  renderRoutes();
  renderRuler();
  renderLinks();
  renderPlaces();
  renderPins();
  renderWikiLayers();
  renderSelection();
  renderFogTools();
  renderWallDraft();
  renderCombat();
  renderSignals();
  if (state.images.has(map.id) && state.images.get(map.id).key !== map.image_key) loadImage(map);
  renderStatus();
}

function renderStatus() {
  const map = state.current;
  if (!map) return;
  const reading = map.reading.status;
  const note = state.note?.id === map.id && Date.now() < state.note.until ? state.note.text : '';
  if (reading === 'pending') status('The AI is reading this map…');
  else if (reading === 'failed' && state.canEdit) status(map.reading.error || "The AI couldn't read this map.", true);
  else status([note, KIND_LABELS[map.kind], scaleText(map), state.canEdit && !map.shown ? 'hidden from players' : state.canEdit && map.shown_to ? `shown to ${map.shown_to.length} player${map.shown_to.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '));
}

/** Say something about the map on screen in its status line, kept there for a while as the map changes. */
export function noteOnMap(text) {
  state.note = { id: state.current?.id, text, until: Date.now() + 10_000 };
  renderStatus();
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
 * Fog of war: the DM sees their rectangles shaded; players' pages work out
 * what their tokens see from the walls the server sends (covered parts
 * dark, places seen before dim), following a token while it's dragged.
 */
function renderFog() {
  const map = state.current;
  const svg = $('#map-fog');
  const { width, height } = map.image;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.replaceChildren();
  const shapes = state.canEdit ? fogMask(map) : playerFogMask(fogView(map), state.userId);
  state.fogShapes = shapes;
  drawFog($('#map-fog-canvas'), map.image, shapes, state.canEdit ? DM_FOG_ALPHA : 1);
  if (state.fogDraw) {
    const r = fogRect(map, state.fogDraw.a, state.fogDraw.b);
    svg.append(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, class: `fog-draft ${state.fogMode}` }));
  }
}

const FOG_COLOUR = [20, 17, 13];
const DM_FOG_ALPHA = 0.55; // the DM sees the fog as a shade
// How dark each kind of shape leaves the fog: covered, seen before (dim), only glimpsed over heights, clear.
const FOG_ALPHA = { cover: 1, dim: 0.6, glimpse: 0.3, clear: 0 };
// The fog's canvas is at most this many pixels along its long side (phones refuse much bigger canvases).
const FOG_MAX_PX = 2048;

/**
 * Draw the fog on a canvas the size of the map: each shape in order replaces
 * the fog under it (a shape with a clip only inside the clip; one with
 * rings filled even-odd). A canvas, not
 * an SVG mask: phones failed to draw a mask this size, so players saw no fog
 * at all once the server stopped blacking out their picture.
 */
function drawFog(canvas, image, shapes, alpha) {
  const k = Math.min(1, FOG_MAX_PX / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * k));
  const h = Math.max(1, Math.round(image.height * k));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  g.setTransform(k, 0, 0, k, 0, 0);
  const path = (s) => {
    const p = new Path2D();
    if (s.rings) {
      for (const ring of s.rings) {
        ring.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
        p.closePath();
      }
    } else if (s.points) {
      s.points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.closePath();
    } else p.rect(s.x, s.y, s.w, s.h);
    return p;
  };
  for (const s of shapes) {
    g.save();
    if (s.clip) g.clip(path({ points: s.clip }));
    const p = path(s);
    // Rings (the shadows of raised areas) are filled even-odd: a ring inside another is a hole.
    const rule = s.rings ? 'evenodd' : 'nonzero';
    g.globalCompositeOperation = 'destination-out';
    g.fill(p, rule);
    g.globalCompositeOperation = 'source-over';
    const a = FOG_ALPHA[s.fill] * alpha;
    if (a > 0) {
      g.fillStyle = `rgba(${FOG_COLOUR.join(',')},${a})`;
      g.fill(p, rule);
    }
    g.restore();
  }
}

/**
 * The map as a player's fog sees it: while they drag one of their own
 * tokens, that token where it would land, unless a wall is in the way
 * (the server would refuse the move, so it still sees from where it was).
 */
function fogView(map) {
  const drag = state.drag;
  const token = drag?.moved && map.tokens.find((t) => t.id === drag.id && t.user_id === state.userId);
  if (!token) return map;
  const end = snapToken(map, token, drag.x, drag.y);
  const legs = [drag.start, ...drag.waypoints, end];
  if (legs.some((p, i) => i > 0 && wallBetween(map, legs[i - 1], p))) return map;
  return { ...map, tokens: map.tokens.map((t) => (t.id === token.id ? { ...t, x: end.x, y: end.y } : t)) };
}

/** Redraw a player's fog at most once a frame (it follows their token while it's dragged). */
let fogFrame = 0;
function queueFog() {
  if (state.canEdit || fogFrame) return;
  const go = () => {
    fogFrame = 0;
    if (state.current) renderFog();
  };
  fogFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(go) : setTimeout(go, 16);
}

function renderFogTools() {
  const map = state.current;
  const tools = $('#map-fog-tools');
  const walls = $('#map-wall-tools');
  // Edit map: its tools instead of the play tools (and no fog panel meanwhile).
  const editing = state.editing && !!map;
  walls.hidden = !editing;
  if (editing) tools.hidden = true;
  $('#tab-map').classList.toggle('editing', editing);
  $('#map-edit').setAttribute('aria-pressed', String(editing));
  // Raised areas show (with their heights) while editing.
  if (map) renderTerrain();
  $('#map-fog-open').setAttribute('aria-pressed', String(!tools.hidden));
  $('#map-view').classList.toggle('fog-drawing', !!map && ((!!state.fogMode && !!map.fog?.enabled) || !!state.wallMode));
  for (const b of document.querySelectorAll('[data-wall-mode]')) b.setAttribute('aria-pressed', String(state.wallMode === b.dataset.wallMode));
  for (const b of tools.querySelectorAll('[data-fog-mode]')) b.setAttribute('aria-pressed', String(state.fogMode === b.dataset.fogMode));
  if ((tools.hidden && walls.hidden) || !map) return;
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
  tools.querySelector('[data-wall-action="forget"]').disabled = !map.fog?.enabled || !map.fog.sight || !map.fog.memory;
  $('#map-fog-hint').textContent = !map.fog?.enabled
    ? 'With fog on, players see nothing until you reveal parts (pick Reveal and drag over the map), or tick Line of sight.'
    : map.fog.sight
      ? `Players see what their own token can see${map.fog.dark ? ' where there is light or their darkvision reaches' : ''}. Walls, doors and lights are set in Edit map.`
      : 'Players only see what you reveal. Tick Line of sight to let their tokens see past the walls.';
  $('#map-change-design').hidden = !map.designed;
  for (const b of walls.querySelectorAll('[data-wall-mode]')) b.setAttribute('aria-pressed', String(state.wallMode === b.dataset.wallMode));
  // Roads and rivers are for world and region maps (journeys keep to them).
  for (const b of walls.querySelectorAll('.map-road-tool')) b.hidden = !isPinMap(map);
  // Where a new link leads: any other map.
  const linkTo = $('#map-link-to');
  const others = state.maps.filter((m) => m.id !== map.id);
  const chosen = linkTo.value;
  linkTo.replaceChildren(...others.map((m) => new Option(m.name, m.id)));
  if (others.some((m) => m.id === chosen)) linkTo.value = chosen;
  linkTo.disabled = !others.length;
  walls.querySelector('[data-wall-mode="link"]').disabled = !others.length;
  // The AI's guesses at heights, to accept or correct.
  const guesses = (map.raised ?? []).filter((r) => r.source === 'ai').length;
  const acceptAll = $('#map-raised-accept');
  acceptAll.hidden = !guesses;
  acceptAll.textContent = `Accept all (${guesses})`;
  const check = $('#map-raised-check');
  check.hidden = !guesses;
  check.textContent = `Check AI heights (${guesses})`;
  const drafting = map.wall_draft.status === 'pending';
  const exportButton = $('#map-walls-export');
  exportButton.disabled = !map.grid;
  exportButton.title = map.grid ? exportButton.title.replace(/ Set the grid first\.$/, '') : `${exportButton.title.replace(/ Set the grid first\.$/, '')} Set the grid first.`;
  const draftButton = $('#map-walls-draft');
  draftButton.disabled = drafting;
  draftButton.classList.toggle('busy', drafting);
  draftButton.setAttribute('aria-busy', String(drafting));
  draftButton.textContent = drafting ? 'AI walls: working…' : 'AI walls…';
  walls.querySelector('[data-wall-action="clear-ai"]').disabled = ![...map.walls, ...(map.lights ?? []), ...(map.terrain ?? [])].some((w) => w.source === 'ai');
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const doors = map.walls.filter((w) => w.door).length;
  const low = map.walls.filter((w) => w.kind === 'low').length;
  $('#map-wall-hint').textContent = `${count(map.walls.length - doors - low, 'wall')}, ${count(low, 'obstacle')}, ${count(doors, 'door')}, ${count(map.lights?.length ?? 0, 'light')}.${map.fog?.enabled && map.fog.sight ? '' : ' They block players\' sight once Fog & sight has Line of sight on.'}`;
}

/** The DM's dismissed AI walls messages: the map's id → the finished_at they closed. */
const WALL_NOTE_KEY = (mapId) => `dndapp.map.wallNoteSeen.${mapId}`;
let wallDraftTick = null;

/** How hard the AI thinks about walls, in words, with what it means. */
export const EFFORT_NAMES = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' };
const EFFORT_NOTES = {
  low: 'Quickest. Fine for a simple room; misses more on a busy map.',
  medium: 'Quick, and good on plain maps.',
  high: 'Careful. Good for most maps.',
  xhigh: 'More careful still: slower, and better at doors and broken walls.',
  max: 'The most careful and the slowest. Uses the most of your Claude usage.',
};

/**
 * AI walls (the DM): first how hard the AI thinks, in a dialog, so the choice
 * can't be missed (owner, 2026-10-20: "I don't see the option to change
 * reasoning effort"). The last pick is kept in this browser.
 */
export function wallsDraftDialog(map) {
  if (!map) return;
  const dialog = $('#map-dialog');
  const fallback = EFFORTS.includes(state.wallsEffort) ? state.wallsEffort : 'xhigh';
  const kept = storage.get(WALLS_EFFORT_KEY);
  let chosen = EFFORTS.includes(kept) ? kept : fallback;
  const options = EFFORTS.map((e) => {
    const radio = h('input', { type: 'radio', name: 'walls-effort', value: e, checked: e === chosen, onchange: () => (chosen = e) });
    return h('label', { class: 'map-effort' }, radio,
      h('span', {}, h('strong', {}, EFFORT_NAMES[e]), e === fallback ? ' (the usual)' : '', h('span', { class: 'muted small' }, ` ${EFFORT_NOTES[e]}`)));
  });
  const replacing = map.walls.some((w) => w.source === 'ai');
  const start = () => {
    storage.set(WALLS_EFFORT_KEY, chosen === fallback ? null : chosen);
    startWallsDraft(map, chosen);
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      dialog.close();
      start();
    } },
      h('h2', {}, 'AI walls'),
      h('p', { class: 'muted small' }, `The AI traces the walls, doors, lights, stairs and heights from the picture, for you to correct. It takes a few minutes; carry on meanwhile.${replacing ? " Its earlier draft is replaced; walls you drew stay." : ''}`),
      h('fieldset', { class: 'map-efforts' }, h('legend', {}, 'How hard should it think?'), ...options),
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary', id: 'map-walls-start' }, replacing ? 'Draft again' : 'Start'),
      ),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

/** Ask the server for an AI walls draft at this effort. */
async function startWallsDraft(map, effort) {
  const button = $('#map-walls-draft');
  // Show it's started straight away; the server's answer brings the live progress.
  button.disabled = true;
  button.textContent = 'AI walls: starting…';
  try {
    const saved = await state.guarded(() => api('POST', `${base()}/${map.id}/walls/draft`, EFFORTS.includes(effort) ? { effort } : {}));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  } finally {
    if (state.current) renderFogTools();
  }
}

/** What the AI is doing now, in words, from the map's wall_draft. */
export function wallDraftStep(d) {
  if (d.step === 'checking') return d.parts > 1 ? `checking its draft, close-up ${Math.min(d.parts_done + 1, d.parts)} of ${d.parts}` : 'checking its draft against the map';
  if (d.step === 'tidying') return 'tidying up the walls';
  return 'tracing the walls, doors and lights';
}

/** How long, in words: "40 s", "3 min". */
export function sinceText(from, to = Date.now()) {
  const s = Math.max(0, Math.round((to - Date.parse(from)) / 1000));
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}

/** What the finished draft holds, in words. */
export function foundText(f) {
  if (!f) return '';
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const parts = [count(f.walls, 'wall'), count(f.doors, 'door'), count(f.obstacles, 'obstacle'), count(f.lights, 'light'), count(f.terrain, 'area') + (f.terrain ? ' of difficult terrain' : ''), f.climbs ? `${f.climbs} stairs or ladder${f.climbs === 1 ? '' : 's'}` : '0 ', count(f.raised ?? 0, 'raised area') + (f.raised ? ' (heights to check)' : '')]
    .filter((x, i) => i < 2 || !x.startsWith('0 '));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
}

/**
 * The DM's AI walls message, over the map so it shows whatever tools are
 * open (full screen too): working (with the step and time so far, ticking),
 * then done (what it found) or failed (why, and Try again), until closed.
 */
function renderWallDraft() {
  const el = $('#map-ai-note');
  clearTimeout(wallDraftTick);
  const map = state.current;
  const d = map?.wall_draft;
  const seen = map && storage.get(WALL_NOTE_KEY(map.id));
  const show = state.canEdit && d && (d.status === 'pending' || ((d.status === 'done' || d.status === 'failed') && d.finished_at && seen !== d.finished_at));
  el.hidden = !show;
  if (!show) return el.replaceChildren();
  el.className = `map-ai-note ${d.status}`;
  const close = () => h('button', { class: 'ghost chip-x', title: 'Close', 'aria-label': 'Close', onclick: () => { storage.set(WALL_NOTE_KEY(map.id), d.finished_at); renderWallDraft(); } }, '✕');
  if (d.status === 'pending') {
    el.replaceChildren(
      h('span', { class: 'spinner', 'aria-hidden': 'true' }),
      h('span', {}, h('strong', {}, 'AI walls: '), `${wallDraftStep(d)}…`, d.started_at ? ` ${sinceText(d.started_at)} so far.` : '', EFFORT_NAMES[d.effort] ? ` ${EFFORT_NAMES[d.effort]} effort.` : '', h('span', { class: 'muted' }, ' It takes a few minutes; carry on meanwhile. The walls appear when it\'s done.')),
    );
    const tick = setTimeout(() => state.current?.id === map.id && renderWallDraft(), 1000);
    tick.unref?.();
    wallDraftTick = tick;
  } else if (d.status === 'done') {
    const took = (d.started_at ? ` in ${sinceText(d.started_at, Date.parse(d.finished_at))}` : '') + (EFFORT_NAMES[d.effort] ? ` (${EFFORT_NAMES[d.effort].toLowerCase()} effort)` : '');
    el.replaceChildren(
      h('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'),
      h('span', {}, h('strong', {}, 'AI walls done: '), `${foundText(d.found)}${took}. They're drawn in purple; fix anything it got wrong.`, d.notes ? h('span', { class: 'muted' }, ` ${d.notes}`) : ''),
      close(),
    );
  } else {
    el.replaceChildren(
      h('span', { class: 'cross', 'aria-hidden': 'true' }, '!'),
      h('span', {}, d.error || "The AI couldn't draft walls."),
      // Again at the same effort; AI walls… picks another.
      h('button', { class: 'ghost', onclick: () => startWallsDraft(map, d.effort) }, 'Try again'),
      close(),
    );
  }
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
  // The DM can hide the walls for a clean map while playing; they always show in Edit map.
  const hidden = state.canEdit && storage.get(SHOW_WALLS_KEY) === '0' && $('#map-wall-tools').hidden;
  svg.classList.toggle('walls-hidden', hidden);
  const list = state.canEdit ? map.walls.filter((w) => !hidden || w.door) : (map.doors ?? []);
  const line = (w, cls) => svgEl('line', { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, class: cls });
  // A secret door players haven't found shows the DM where it is, dashed.
  const cls = (w) => (w.door || !state.canEdit
    ? `door${w.open ? ' open' : ''}${w.locked ? ' locked' : ''}${w.secret && !w.revealed ? ' secret' : ''}`
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
  if (state.canEdit && !hidden) renderRoads(svg, map);
  const doors = list.filter((w) => w.door || !state.canEdit);
  for (const w of list) if (!doors.includes(w)) svg.append(line(w, 'wall-halo'));
  for (const w of list) if (!doors.includes(w)) svg.append(line(w, cls(w)));
  // Doors on top, drawn as doors so nobody mistakes them for walls.
  for (const w of doors) svg.append(doorShape(map, w, cls(w)));
  const d = state.wallDraw;
  const draft = ['door', 'low', 'stairs', 'ladder', 'road', 'river'].includes(state.wallMode) ? ` ${state.wallMode}` : '';
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
  // Raised areas: the DM sees their outlines and heights while working on the walls (players only feel them in the fog).
  if (state.canEdit && (state.wallMode || !$('#map-wall-tools').hidden)) {
    const font = Math.max(10, squarePx(map) * 0.4);
    const picked = state.selectedRaised;
    for (const area of map.raised ?? []) {
      // The one being reshaped shows where it's going.
      const a = state.raisedEdit?.id === area.id && state.raisedEdit.next ? { ...area, points: state.raisedEdit.next } : area;
      const guess = a.source === 'ai';
      svg.append(svgEl('polygon', { points: pts(a.points), 'data-raised': a.id, class: `raised${a.height < 0 ? ' low' : ''}${guess ? ' ai' : ''}${a.bridge ? ' bridge' : ''}${a.id === picked ? ' selected' : ''}` }));
      const xs = a.points.map((p) => p[0]);
      const ys = a.points.map((p) => p[1]);
      const label = svgEl('text', { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, class: 'raised-label', 'font-size': font, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
      // The AI's guess shows a question mark until the DM accepts or corrects it.
      label.textContent = `${a.bridge ? 'bridge ' : ''}${a.height > 0 ? '↑' : a.height < 0 ? '↓' : ''}${Math.abs(a.height)} ft${guess ? '?' : ''}`;
      svg.append(label);
      // The picked one's corners to drag, and a dot halfway along each side to add a corner there.
      if (a.id === picked) {
        const r = HANDLE_PX / 2 / state.view.k;
        for (const p of raisedHandles(a)) svg.append(svgEl('circle', { cx: p.x, cy: p.y, r: p.insert ? r * 0.6 : r, class: `raised-handle${p.insert ? ' add' : ''}` }));
      }
    }
    // Stairs and ladders: a line up each, with a dot at the top.
    for (const c of map.climbs ?? []) {
      const cls = `climb ${c.kind}${c.source === 'ai' ? ' ai' : ''}`;
      svg.append(svgEl('line', { x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, class: cls }), svgEl('circle', { cx: c.x2, cy: c.y2, r: Math.max(3, squarePx(map) / 8), class: `${cls} top` }));
    }
  }
  if (state.terrainDraw) {
    const r = fogRect(map, state.terrainDraw.a, state.terrainDraw.b);
    svg.append(svgEl('polygon', { points: pts([[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]), class: state.wallMode === 'raised' ? 'raised' : 'difficult' }));
  }
}

/** The height a new raised area gets (the box next to Raised area), in feet. */
function raisedHeight() {
  const n = Math.round(Number($('#map-raised-height').value));
  return Number.isFinite(n) ? Math.max(-1000, Math.min(1000, n)) : 15;
}

async function raised(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/raised`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

async function climbs(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/climbs`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

/** The stairs or ladder within reach of a point on the map, if any. */
const climbAt = (map, at, reach) => (map.climbs ?? []).findLast((c) => distanceToWall(at, c) <= reach);

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

/**
 * Edit map (the DM): the map's walls, doors, heights, lights, links and
 * settings take the place of the play tools, so playing on the map isn't
 * crowded by setting it up (owner, 2026-10-20).
 */
export function setEditing(on) {
  state.editing = on && !!state.current;
  setTool({});
  if (!state.editing) Object.assign(state, { selectedRaised: null, selectedDoor: null });
  renderFogTools();
  if (state.current) {
    renderWalls();
    renderTerrain();
    renderSelection();
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

/** How high a token stands (the raised area under it plus flying or climbing), in feet. */
const tokenElevation = (map, t, x = t.x, y = t.y) => groundAt(map, x, y, !!t.under) + (t.elevation ?? 0);

/** A badge on a token that isn't on the ground: ↑25 on a wall-walk, ↓10 in a pit. */
function heightBadge(map, t, x, y) {
  const up = Math.round(tokenElevation(map, t, x, y) * 10) / 10;
  const deck = t.under && bridgeAt(map, x ?? t.x, y ?? t.y);
  if (deck) return h('span', { class: 'token-up under', title: `Under the bridge (${deck.height} ft up)` }, up ? `under ${up > 0 ? '↑' : '↓'}${Math.abs(up)}` : 'under');
  if (!up) return null;
  return h('span', { class: 'token-up', title: `${Math.abs(up)} ft ${up > 0 ? 'up' : 'down'}` }, `${up > 0 ? '↑' : '↓'}${Math.abs(up)}`);
}

const canMove = (token) => state.canEdit || (token.user_id != null && token.user_id === state.userId);

export function renderTokens() {
  const map = state.current;
  const layer = $('#map-tokens');
  // On a world or region map, tokens are pins of one size on screen, fanned out where they meet.
  const pins = isPinMap(map);
  const fan = pinFan(map, state.view.k || 1);
  state.fanZoom = state.view.k;
  layer.replaceChildren(
    ...map.tokens.map((t) => {
      const d = pins ? PIN_PX : tokenPx(map, t);
      const dragging = state.drag?.id === t.id;
      const x = dragging ? state.drag.x : t.x;
      const y = dragging ? state.drag.y : t.y;
      const health = t.hp ? healthOf(t.hp) : t.health;
      const picture = tokenPicture(t);
      const el = h('div', {
        class: `token token-${t.kind}${picture ? ' has-picture' : ''}${canMove(t) ? ' movable' : ''}${t.user_id === state.userId ? ' mine' : ''}${state.selected === t.id ? ' selected' : ''}${dragging ? ' dragging' : ''}${t.hidden ? ' hidden-token' : ''}${health === 'down' ? ' down' : ''}${state.caught.has(t.id) || state.targeting?.picked?.includes(t.id) ? ' caught' : ''}${state.targeting && state.targeting.attacker !== t.id ? ' targetable' : ''}${map.combat?.turn === t.id ? ' turn' : ''}${isUnder(map, t) ? ' under' : ''}${pins ? ' token-pin' : ''}${t.follows ? ' following' : ''}`,
        title: [t.name, t.merchant ? 'Merchant: pick to shop' : TOKEN_KIND_NAMES[t.kind], hpText(t), ...t.conditions, t.journey ? journeyText(t.journey) : ''].filter(Boolean).join(' · '),
        role: 'button',
        tabindex: '0',
        'aria-label': t.name,
        'data-id': t.id,
      },
      picture ? h('img', { class: 'token-picture', src: picture, alt: '', draggable: 'false' }) : h('span', { class: 'token-initials' }, initials(t.name)),
      h('span', { class: 'token-name' }, t.name),
      health ? h('span', { class: `token-hp ${health}` }, h('span', { style: `width:${hpFraction(t, health) * 100}%` })) : null,
      t.conditions.length ? h('span', { class: 'token-conditions', title: t.conditions.join(', ') }, String(t.conditions.length)) : null,
      t.merchant ? h('span', { class: 'token-shop', 'aria-hidden': 'true' }, '⚖') : null,
      heightBadge(map, t, x, y));
      el.style.cssText = `left:${x - d / 2}px;top:${y - d / 2}px;width:${d}px;height:${d}px;--token:${t.color};font-size:${d * 0.38}px`;
      const spread = !dragging && fan.get(t.id);
      if (spread) el.style.cssText += `;--fan-x:${spread.dx}px;--fan-y:${spread.dy}px`;
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
  if (id) Object.assign(state, { selected: null, selectedTemplate: null, selectedDoor: null, selectedRaised: null });
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

export async function patchToken(token, body) {
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

/**
 * How tall the token is and how far above the ground it is (flying,
 * climbing), in feet: they decide what it sees over raised areas and who
 * sees it. Height left empty means its sheet's, or its size's.
 */
function heightInputs(token) {
  const tall = h('input', { type: 'number', min: 0.5, max: 1000, step: 0.5, class: 'map-num', value: token.height ?? '', placeholder: String(tokenTall(token)), 'aria-label': 'Height in feet', title: "How tall it is, in feet (empty: its sheet's height, or its size's). Tall creatures see and are seen over walls and roofs." });
  tall.addEventListener('change', () => {
    const v = tall.value.trim();
    const n = Number(v);
    if (v && (!Number.isFinite(n) || n < 0.5)) return;
    patchToken(token, { height: v ? Math.min(1000, n) : null });
  });
  const up = h('input', { type: 'number', min: -1000, max: 1000, step: 5, class: 'map-num', value: token.elevation || '', placeholder: '0', 'aria-label': 'Feet above the ground', title: 'How far above the ground under it, in feet: flying, climbing or levitating (a raised area it stands on counts by itself)' });
  up.addEventListener('change', () => {
    const n = Number(up.value || 0);
    if (Number.isFinite(n)) patchToken(token, { elevation: Math.max(-1000, Math.min(1000, n)) });
  });
  // On a bridge or under it (it changes by itself as the token walks; this is for putting it right).
  const deck = bridgeAt(state.current, token.x, token.y);
  const under = deck ? h('input', { type: 'checkbox', 'data-token-under': '', onchange: (e) => patchToken(token, { under: e.target.checked }) }) : null;
  if (under) under.checked = !!token.under;
  return [
    h('label', { class: 'map-check small' }, 'Tall ', tall, ' ft'),
    h('label', { class: 'map-check small' }, 'Up ', up, ' ft'),
    under ? h('label', { class: 'map-check small', title: `Walking under the bridge (${deck.height} ft up) rather than on it` }, under, ' Under the bridge') : null,
  ].filter(Boolean);
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
  const area = !token && !pin && !tpl && !door && selectedArea();
  bar.hidden = !token && !pin && !tpl && !door && !area;
  if (area) {
    // Don't rebuild the height box while the DM is typing in it.
    if (bar.dataset.raised === `${area.id}:${area.source}:${!!area.bridge}` && bar.contains(document.activeElement)) return;
    bar.dataset.pin = '';
    bar.dataset.raised = `${area.id}:${area.source}:${!!area.bridge}`;
    return bar.replaceChildren(...raisedControls(area));
  }
  bar.dataset.raised = '';
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
  // Don't rebuild the menu while someone is typing in it (a height, say).
  if (bar.dataset.token === token.id && bar.querySelector('.sel-more')?.contains(document.activeElement)) return;
  bar.dataset.token = token.id;
  // The less used ones (light, height, picture, keeping, removing) wait under More, so the bar stays one short row.
  const editable = canMove(token);
  const more = [
    editable ? h('label', { class: 'map-check small' }, 'Light ', lightSelect(token)) : null,
    ...(editable ? heightInputs(token) : []),
    state.canEdit && token.record ? h('button', { class: 'ghost', title: `What the campaign's records say about ${token.record.title}`, onclick: () => recordDialog(token) }, 'Record') : null,
    state.canEdit && token.page && wikiNav.drawer ? h('button', { class: 'ghost', title: `Wiki: ${token.page.title}`, onclick: () => wikiNav.drawer(token.page.id) }, 'Wiki') : null,
    myCompanion(token) && !state.canEdit && !token.stats ? h('button', { class: 'ghost', title: 'Look up its stat block, hit points and size with the AI', onclick: () => fillStats(token) }, 'Stat block (AI)') : null,
    myCompanion(token) && !state.canEdit ? h('button', { class: 'ghost danger', onclick: () => dismissCompanion(token) }, 'Dismiss') : null,
    state.canEdit && !token.stats && token.kind !== 'pc' ? h('button', { class: 'ghost', title: 'Fill in its stat block, hit points and size with the AI', onclick: () => fillStats(token) }, 'Stat block (AI)') : null,
    state.canEdit && token.kind !== 'pc' ? h('button', { class: 'ghost', title: 'Give this token a picture (players see it on the map)', onclick: () => chooseTokenPicture(token) }, token.picture ? 'New picture' : 'Picture') : null,
    state.canEdit && token.kind !== 'pc' && token.picture ? h('button', { class: 'ghost', title: 'Go back to initials', onclick: () => removeTokenPicture(token) }, 'No picture') : null,
    state.canEdit && token.kind !== 'pc' ? h('button', { class: 'ghost', title: 'Keep this one (picture, stat block and all) in your creatures, to put on other maps', onclick: () => saveCreature(token) }, 'Save to creatures') : null,
    state.canEdit ? h('button', { class: 'ghost danger', onclick: () => removeToken(token) }, 'Remove') : null,
  ].filter(Boolean);
  const menu = more.length ? h('details', { class: 'sel-more', ...(state.selectionMore === token.id && { open: true }) },
    h('summary', { class: 'ghost', title: 'Light, height, picture and more' }, 'More'),
    h('div', { class: 'sel-more-menu' }, ...more)) : null;
  menu?.addEventListener('toggle', () => (state.selectionMore = menu.open ? token.id : null));
  bar.replaceChildren(
    ...[
      h('span', { class: 'swatch', style: `background:${token.color}` }),
      h('strong', {}, token.name),
      h('span', { class: 'muted small' }, `${TOKEN_KIND_NAMES[token.kind]} · ${TOKEN_SIZE_NAMES[token.size]}`),
      ...tokenControls(token),
      ...travelControls(token),
      ...journeyControls(token),
      ...spellTags(token),
      h('span', { class: 'spacer' }),
      editable && !state.canEdit ? h('span', { class: 'muted small' }, 'Drag to move') : null,
      ...attackControls(token),
      token.merchant ? h('button', { class: 'primary', title: 'See what this merchant sells, and buy', onclick: () => openShop(token.merchant) }, 'Shop') : null,
      token.kind === 'companion' && token.stats && (state.canEdit || myCompanion(token)) ? h('button', { class: 'primary', title: 'Roll its attacks and checks from its stat block', onclick: () => companionRolls(token) }, 'Roll') : null,
      (state.canEdit || myCompanion(token)) && token.stats ? h('button', { class: 'ghost', onclick: () => statsDialog(token) }, 'Stat block') : null,
      state.canEdit ? h('button', { class: 'ghost', onclick: () => tokenDialog(token) }, 'Edit') : null,
      menu,
      h('button', { class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => select(null) }, '✕'),
    ].filter(Boolean),
  );
}

/** The DM picks a door (a click on it) to open, close, lock or unlock it. */
function selectDoor(id) {
  Object.assign(state, { selectedDoor: id, selected: null, selectedPin: null, selectedTemplate: null, selectedRaised: null });
  renderWalls();
  renderTemplates();
  renderTokens();
  renderPins();
  renderSelection();
}

function doorControls(door) {
  const what = door.locked ? 'Locked' : door.open ? 'Open' : 'Closed';
  const hidden = door.secret && !door.revealed;
  return [
    h('strong', {}, door.secret ? 'Secret door' : 'Door'),
    h('span', { class: 'muted small' }, `${what}${door.locked ? ": players can't open it" : ''}${hidden ? '. Players see a wall until they find it' : door.secret ? '. Found' : ''}`),
    h('span', { class: 'spacer' }),
    h('button', { class: 'ghost', onclick: () => walls({ toggle: door.id }) }, door.open ? 'Close' : 'Open'),
    h('button', { class: 'ghost', title: door.locked ? 'Let players open it again' : "Players can't open a locked door (you still can)", onclick: () => walls({ lock: door.id }) }, door.locked ? 'Unlock' : 'Lock'),
    door.secret
      ? h('button', { class: 'ghost', 'data-door-reveal': '', title: hidden ? 'Players found it: they see it as a door from now on' : 'Shut it and make it look like wall to players again', onclick: () => walls({ reveal: door.id }) }, hidden ? 'Reveal' : 'Hide again')
      : null,
    h('button', { class: 'ghost', 'data-door-secret': '', title: door.secret ? 'Make it an ordinary door everyone sees' : 'Players see a wall here until they find it (or you open or reveal it)', onclick: () => walls({ secret: door.id }) }, door.secret ? 'Not secret' : 'Make secret'),
    h('button', { class: 'ghost danger', onclick: () => walls({ remove: door.id }).then(() => selectDoor(null)) }, 'Remove'),
    h('button', { class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => selectDoor(null) }, '✕'),
  ].filter(Boolean);
}

/** The raised area the DM picked, while raised areas are on show (in Edit map). */
function selectedArea() {
  if (!state.canEdit || !state.selectedRaised || !raisedShown()) return null;
  return (state.current?.raised ?? []).find((a) => a.id === state.selectedRaised) ?? null;
}

/** Raised areas are drawn (and can be picked) in Edit map or while a wall tool is on. */
const raisedShown = () => !!state.wallMode || !$('#map-wall-tools').hidden;

/**
 * The DM picks a raised area (a click on it in Edit map) to check
 * the AI's guess or change its height, the area it covers or whether it's a
 * bridge (owner, 2026-10-18: "no obvious way to confirm or change
 * recommended heights. Neither their elevation level or what area they cover").
 */
export function selectRaised(id, { center = false } = {}) {
  Object.assign(state, { selectedRaised: id, selected: null, selectedPin: null, selectedTemplate: null, selectedDoor: null });
  const area = selectedArea();
  if (area && center) centerOn(areaMiddle(area));
  renderWalls();
  renderTerrain();
  renderTokens();
  renderPins();
  renderSelection();
}

const areaMiddle = (a) => {
  const xs = a.points.map((p) => p[0]);
  const ys = a.points.map((p) => p[1]);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

/** Open a map (from the wiki's On the map box) with this point in the middle, if it's one this viewer has. */
export async function openMapAt(id, at = null) {
  const map = state.maps.find((m) => m.id === id);
  if (!map) return false;
  if (state.current?.id !== id) await show(map);
  if (at) requestAnimationFrame(() => centerOn(at));
  return true;
}

/** Fit the map on screen again (the wiki's Atlas moves the map into a box of another size). */
export const fitMap = () => state.current && fit();

/** Move the view so this point of the map is in the middle of it (same zoom and turn). */
function centerOn(at) {
  const box = $('#map-view').getBoundingClientRect();
  const { k, r = 0 } = state.view;
  state.view.x = box.width / 2 - k * (at.x * Math.cos(r) - at.y * Math.sin(r));
  state.view.y = box.height / 2 - k * (at.x * Math.sin(r) + at.y * Math.cos(r));
  applyView();
}

/** The AI's guesses still to check, in reading order (top to bottom, then left to right). */
function aiGuesses(map) {
  return (map.raised ?? []).filter((a) => a.source === 'ai').map((a) => ({ a, m: areaMiddle(a) })).sort((p, q) => p.m.y - q.m.y || p.m.x - q.m.x).map((x) => x.a);
}

function raisedControls(area) {
  const guess = area.source === 'ai';
  const height = h('input', { type: 'number', min: -1000, max: 1000, step: 1, class: 'map-num', id: 'map-raised-set', value: String(area.height), 'aria-label': 'Height in feet', title: 'How high its top is above the ground round it, in feet (negative for a pit)' });
  const setHeight = () => {
    const n = Math.round(Number(height.value));
    if (Number.isFinite(n) && n !== area.height) raised({ set: { id: area.id, height: Math.max(-1000, Math.min(1000, n)) } });
  };
  height.addEventListener('change', setHeight);
  height.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setHeight();
  });
  const bridge = h('input', { type: 'checkbox', id: 'map-raised-bridge', ...(area.bridge && { checked: '' }), onchange: (e) => raised({ set: { id: area.id, bridge: e.target.checked } }) });
  bridge.checked = !!area.bridge;
  const others = aiGuesses(state.current).filter((a) => a.id !== area.id);
  return [
    h('strong', {}, area.bridge ? 'Bridge' : area.height < 0 ? 'Sunken area' : 'Raised area'),
    h('span', { class: 'muted small' }, guess ? "The AI's guess: check it" : 'Drag its corners to change what it covers; drag a dot between two to add a corner'),
    h('label', { class: 'map-check small' }, height, ' ft'),
    h('label', { class: 'map-check small', title: 'Open space under it, like a bridge or a walkway: tokens can walk under it, and see under it' }, bridge, ' Bridge'),
    h('span', { class: 'spacer' }),
    guess ? h('button', { class: 'primary', id: 'map-raised-ok', title: 'Keep it as it is (it stays through the next AI walls)', onclick: () => raised({ accept: area.id }).then(() => (others.length ? selectRaised(others[0].id, { center: true }) : renderSelection())) }, others.length ? 'Looks right, next' : 'Looks right') : null,
    others.length ? h('button', { class: 'ghost', id: 'map-raised-next', title: 'Go to the next height the AI guessed', onclick: () => selectRaised(others[0].id, { center: true }) }, `Next guess (${others.length})`) : null,
    h('button', { class: 'ghost danger', onclick: () => raised({ remove: area.id }).then(() => selectRaised(null)) }, 'Remove'),
    h('button', { class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => selectRaised(null) }, '✕'),
  ].filter(Boolean);
}

/** Where the DM can grab the picked area: its corners, and the middle of each side (to add a corner there). */
function raisedHandles(area) {
  const n = area.points.length;
  const out = area.points.map(([x, y], i) => ({ x, y, index: i, insert: false }));
  for (let i = 0; i < n; i++) {
    const [x1, y1] = area.points[i];
    const [x2, y2] = area.points[(i + 1) % n];
    out.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, index: i, insert: true });
  }
  return out;
}

/** A point on the map as an area's corner: on the half squares with a grid (a 2.5 ft step for 5 ft squares). */
function raisedPoint(map, at) {
  const x = Math.max(0, Math.min(map.image.width, at.x));
  const y = Math.max(0, Math.min(map.image.height, at.y));
  if (!map.grid) return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  const half = map.grid.size / 2;
  const snap = (v, o) => Math.round((Math.round((v - o) / half) * half + o) * 10) / 10;
  return [Math.max(0, Math.min(map.image.width, snap(x, map.grid.x))), Math.max(0, Math.min(map.image.height, snap(y, map.grid.y)))];
}

/** Start dragging the picked area's corner, a new corner, or (from inside it) the whole area. */
function raisedDown(e) {
  const area = selectedArea();
  if (!area || state.pointers.size || (state.wallMode && state.wallMode !== 'raised')) return false;
  const at = toImage(e.clientX, e.clientY);
  const reach = HANDLE_PX / state.view.k;
  const handle = raisedHandles(area).filter((p) => Math.hypot(p.x - at.x, p.y - at.y) <= reach).sort((p, q) => Number(p.insert) - Number(q.insert))[0];
  if (!handle && !pointInPolygon(at.x, at.y, area.points)) return false;
  state.raisedEdit = { id: area.id, pointer: e.pointerId, handle, from: at, points: area.points.map((p) => [...p]), moved: false, sx: e.clientX, sy: e.clientY };
  return true;
}

function raisedMove(e) {
  const d = state.raisedEdit;
  const area = selectedArea();
  if (!area) return;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
  d.moved = true;
  const map = state.current;
  const at = toImage(e.clientX, e.clientY);
  if (!d.handle) {
    // The whole area: moved by whole half squares (or freely without a grid).
    const [ox, oy] = raisedPoint(map, d.from);
    const [nx, ny] = raisedPoint(map, at);
    d.next = d.points.map(([x, y]) => [x + nx - ox, y + ny - oy]);
  } else {
    const next = d.points.map((p) => [...p]);
    if (d.handle.insert) next.splice(d.handle.index + 1, 0, raisedPoint(map, at));
    else next[d.handle.index] = raisedPoint(map, at);
    d.next = next;
  }
  renderTerrain();
}

function raisedUp(e) {
  const d = state.raisedEdit;
  state.raisedEdit = null;
  if (!d.moved || e.type !== 'pointerup' || !d.next) {
    renderTerrain();
    return false;
  }
  let points = d.next;
  // A corner dropped on the one beside it goes (an area keeps at least three).
  if (d.handle && !d.handle.insert && points.length > 3) {
    const i = d.handle.index;
    const n = points.length;
    const [x, y] = points[i];
    const near = [points[(i + n - 1) % n], points[(i + 1) % n]].some(([px, py]) => Math.hypot(px - x, py - y) * state.view.k < HANDLE_PX);
    if (near) points = points.filter((_, k) => k !== i);
  }
  raised({ set: { id: d.id, points } });
  return true;
}

export function select(id) {
  state.selected = id;
  state.selectedPin = null;
  state.selectedTemplate = null;
  state.selectedDoor = null;
  state.selectedRaised = null;
  if (state.current) {
    renderWalls();
    renderTerrain();
  }
  renderTemplates();
  renderPins();
  renderTokens();
  renderSelection();
}

// ---------- panning and zooming ----------

// While the map is panned or zoomed, the stage is its own layer, so the browser
// moves it as a picture instead of redrawing the fog's mask every frame. Off
// again once it settles, so it's drawn sharp at the new zoom.
let settling = 0;
function applyView() {
  const { x, y, k, r = 0 } = state.view;
  const stage = $('#map-stage');
  stage.style.transform = `translate(${x}px, ${y}px)${r ? ` rotate(${r}rad)` : ''} scale(${k})`;
  stage.style.willChange = 'transform';
  clearTimeout(settling);
  settling = setTimeout(() => {
    stage.style.willChange = '';
    // Pins that meet at this zoom fan out (and ones that no longer meet close up).
    if (isPinMap(state.current) && state.fanZoom !== state.view.k) renderTokens();
  }, 250);
  // Pins stay the same size on screen at any zoom, and tokens, pins and links stay upright on a turned map.
  stage.style.setProperty('--unzoom', String(1 / k));
  stage.style.setProperty('--unturn', `${-r}rad`);
  const north = $('#map-north');
  north.hidden = !r;
  north.style.setProperty('--turn', `${r}rad`);
  if (state.ruler && !state.drag) placeMeasure(state.ruler.b);
}

function fit() {
  const map = state.current;
  const box = $('#map-view').getBoundingClientRect();
  if (!map || !box.width || !box.height) return;
  const k = Math.min(box.width / map.image.width, box.height / map.image.height);
  state.view = { k, x: (box.width - map.image.width * k) / 2, y: (box.height - map.image.height * k) / 2, r: 0 };
  state.fitted = true;
  applyView();
}

function zoomAt(px, py, factor) {
  const map = state.current;
  if (!map) return;
  const box = $('#map-view').getBoundingClientRect();
  const min = Math.min(box.width / map.image.width, box.height / map.image.height) / 2;
  const k = Math.min(MAX_ZOOM, Math.max(min, state.view.k * factor));
  if ('browse' in document.documentElement.dataset && zoomThrough(px, py, factor, k, min * 2)) return;
  const f = k / state.view.k;
  state.view = { ...state.view, k, x: px - (px - state.view.x) * f, y: py - (py - state.view.y) * f };
  applyView();
}

/**
 * In the wiki's Atlas, zoom goes through the maps: far enough into a place that opens a map goes into that map,
 * and out past the whole map goes up to the one it's inside, zoomed in on its place. True when it went.
 */
let throughAt = 0;
function zoomThrough(px, py, factor, k, fitK) {
  const map = state.current;
  if (Date.now() - throughAt < 700) return true;
  const go = (to, after) => {
    throughAt = Date.now();
    const view = $('#map-view');
    view.classList.remove('zoom-in', 'zoom-out');
    void view.offsetWidth;
    view.classList.add(factor > 1 ? 'zoom-in' : 'zoom-out');
    show(to).then(after);
    return true;
  };
  if (factor > 1 && k >= Math.min(MAX_ZOOM * 0.9, fitK * 5)) {
    const { x, y } = toImage(px + $('#map-view').getBoundingClientRect().left, py + $('#map-view').getBoundingClientRect().top);
    const place = (map.places ?? []).find((p) => p.to && (p.points ? pointInPolygon(x, y, p.points) : Math.hypot(p.x - x, p.y - y) * state.view.k < 40));
    const target = place && state.maps.find((m) => m.id === place.to);
    if (target) return go(target, () => {});
  }
  if (factor < 1 && state.view.k <= fitK / 2 + 1e-9) {
    const up = parentOf(state.maps, map.id);
    const target = up && state.maps.find((m) => m.id === up.map.id);
    if (target) {
      return go(target, () => {
        if (state.current !== target) return;
        const box = $('#map-view').getBoundingClientRect();
        const kk = Math.min(MAX_ZOOM * 0.8, Math.min(box.width / target.image.width, box.height / target.image.height) * 3);
        state.view = { ...state.view, k: kk };
        centerOn(up.place.points ? areaMiddle(up.place) : up.place);
      });
    }
  }
  return false;
}

/** Turn the map by `angle` (radians, clockwise) around a point of the view (a player's own view, like zoom). */
function turnAt(px, py, angle) {
  if (!state.current || !angle) return;
  const { x, y, r = 0 } = state.view;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let turned = (r + angle) % (2 * Math.PI);
  if (turned > Math.PI) turned -= 2 * Math.PI;
  if (turned <= -Math.PI) turned += 2 * Math.PI;
  state.view = { ...state.view, r: turned, x: px + (x - px) * cos - (y - py) * sin, y: py + (x - px) * sin + (y - py) * cos };
  applyView();
}

/** Turn the map back to north up, around the middle of the view. */
function northUp() {
  const box = $('#map-view').getBoundingClientRect();
  turnAt(box.width / 2, box.height / 2, -(state.view.r ?? 0));
  if (Math.abs(state.view.r) < 1e-9) state.view.r = 0;
  applyView();
}

/** How far two fingers must twist before the map turns (a pinch to zoom always twists a little). */
const TWIST_START = (15 * Math.PI) / 180;
/** A turn this close to north up when the fingers lift snaps to it. */
const NORTH_SNAP = (8 * Math.PI) / 180;

/** How close (screen pixels) a wall end snaps to another wall's end or a grid corner, and how close a click picks a wall. */
const SNAP_PX = 12;
/** How close (screen pixels) a press must be to a raised area's corner handle to grab it. */
const HANDLE_PX = 14;

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
    const climb = state.wallMode === 'erase' && climbAt(map, at, SNAP_PX / state.view.k);
    if (climb) return climbs({ remove: climb.id });
    const road = state.wallMode === 'erase' && nearestWall({ walls: map.roads ?? [] }, at, SNAP_PX / state.view.k);
    if (road) return roads({ remove: road.id });
    const near = nearestWall(map, at, SNAP_PX / state.view.k);
    const door = doorAt(e.clientX, e.clientY);
    if (state.wallMode === 'erase' && near) walls({ remove: near.id });
    else if (state.wallMode === 'erase' && (map.terrain ?? []).some((a) => pointInPolygon(at.x, at.y, a.points))) {
      terrain({ remove: map.terrain.findLast((a) => pointInPolygon(at.x, at.y, a.points)).id });
    }
    else if (state.wallMode === 'erase' && (map.raised ?? []).some((a) => pointInPolygon(at.x, at.y, a.points))) {
      raised({ remove: map.raised.findLast((a) => pointInPolygon(at.x, at.y, a.points)).id });
    }
    else if (state.wallMode === 'door' && door) walls({ toggle: door.id });
    else if (state.wallMode === 'lock' && door) walls({ lock: door.id });
    return;
  }
  if (state.wallMode === 'erase' || state.wallMode === 'lock' || state.wallMode === 'light' || state.wallMode === 'link') return;
  if (Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) < 1 || (roadMode() && click)) return;
  if (roadMode()) return roads({ add: { kind: state.wallMode, x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y } });
  if (state.wallMode === 'stairs' || state.wallMode === 'ladder') return climbs({ add: { kind: state.wallMode, x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y } });
  walls({ add: { x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y, door: state.wallMode === 'door', kind: state.wallMode === 'low' ? 'low' : 'wall' } });
}

/** Screen coordinates → the map image's pixels. */
export function toImage(clientX, clientY) {
  const box = $('#map-view').getBoundingClientRect();
  const { x, y, k, r = 0 } = state.view;
  const dx = clientX - box.left - x;
  const dy = clientY - box.top - y;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: (dx * cos + dy * sin) / k, y: (dy * cos - dx * sin) / k };
}

/** The map image's pixels → a point of the view (the other way from toImage, without the view's offset on the page). */
function toView(at) {
  const { x, y, k, r = 0 } = state.view;
  return { x: x + k * (at.x * Math.cos(r) - at.y * Math.sin(r)), y: y + k * (at.x * Math.sin(r) + at.y * Math.cos(r)) };
}

function viewDown(e) {
  if (!state.current || e.target.closest('.map-selection, .map-combat, .map-ai-note, .map-north')) return;
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
  // Picking where a token travels to.
  if (state.travelPick && !state.pointers.size) {
    e.preventDefault();
    return travelPicked(toImage(e.clientX, e.clientY));
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
  // The picked raised area: its corners and sides to drag, or the whole of it.
  if (raisedDown(e)) return;
  // Place: a click puts a place there, a drag an area (map/places.js).
  if (state.wallMode === 'place' && !state.pointers.size && !state.placeDraw) return placeStart(e, toImage(e.clientX, e.clientY));
  if ((state.wallMode === 'difficult' || state.wallMode === 'raised') && !state.pointers.size && !state.terrainDraw) {
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
    const at = (roadMode() ? snapRoadPoint : snapWallPoint)(state.current, toImage(e.clientX, e.clientY), SNAP_PX / state.view.k);
    state.wallDraw = { pointer: e.pointerId, a: at, b: at, sx: e.clientX, sy: e.clientY };
    return;
  }
  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
  if (state.pointers.size === 2) {
    state.twist = { total: 0, on: false };
    // Two fingers make a pinch or a twist, so neither is a tap when it lifts.
    for (const q of state.pointers.values()) q.pinched = true;
  }
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
  if (state.placeDraw?.pointer === e.pointerId) return placeMove(toImage(e.clientX, e.clientY));
  if (state.raisedEdit?.pointer === e.pointerId) return raisedMove(e);
  if (state.wallDraw?.pointer === e.pointerId) {
    const at = toImage(e.clientX, e.clientY);
    state.wallDraw.b = state.wallMode === 'circle' ? at : (roadMode() ? snapRoadPoint : snapWallPoint)(state.current, at, SNAP_PX / state.view.k);
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
    // Twisting them turns the map, once they've twisted far enough to mean it.
    const [a, b] = [...state.pointers.values()];
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    const angleBefore = Math.atan2(b.y - a.y, b.x - a.x);
    p.x = e.clientX;
    p.y = e.clientY;
    const after = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2 - box.left;
    const my = (a.y + b.y) / 2 - box.top;
    if (before > 0) zoomAt(mx, my, after / before);
    let twist = Math.atan2(b.y - a.y, b.x - a.x) - angleBefore;
    if (twist > Math.PI) twist -= 2 * Math.PI;
    if (twist < -Math.PI) twist += 2 * Math.PI;
    const g = (state.twist ??= { total: 0, on: false });
    g.total += twist;
    if (!g.on && Math.abs(g.total) >= TWIST_START) {
      g.on = true;
      twist = g.total;
    }
    if (g.on) turnAt(mx, my, twist);
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
  if (state.raisedEdit?.pointer === e.pointerId) {
    // Not dragged: a click on it, as on any other area (below).
    if (raisedUp(e)) return;
    if (state.wallMode === 'raised') return;
  }
  if (state.placeDraw?.pointer === e.pointerId) return placeEnd(e);
  if (state.terrainDraw?.pointer === e.pointerId) {
    const d = state.terrainDraw;
    const r = fogRect(state.current, d.a, d.b);
    state.terrainDraw = null;
    renderTerrain();
    const points = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    if (e.type !== 'pointerup') return;
    if (state.wallMode === 'raised') {
      // A click on a raised area picks it (to check the AI's guess, or change its height, shape or bridge); a drag makes a new one.
      const click = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) * state.view.k < 4;
      const hit = click && (state.current.raised ?? []).findLast((x) => pointInPolygon(d.a.x, d.a.y, x.points));
      if (hit) return selectRaised(hit.id);
      if (click) return selectRaised(null);
      if (r.w > 0 && r.h > 0) raised({ add: { points, height: raisedHeight(), ...($('#map-raised-new-bridge')?.checked && { bridge: true }) } });
      return;
    }
    if (r.w > 0 && r.h > 0) terrain({ add: { points } });
    return;
  }
  const p = state.pointers.get(e.pointerId);
  state.pointers.delete(e.pointerId);
  if (state.twist && state.pointers.size < 2) {
    // Nearly north up: straighten it.
    if (state.twist.on && Math.abs(state.view.r ?? 0) < NORTH_SNAP) northUp();
    state.twist = null;
  }
  // A click on the map itself (not a drag) drops a pin when placing one, else clears the selection.
  if (p && !p.pinched && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 4 && !state.pointers.size) {
    if (state.pinMode && e.type === 'pointerup') return dropPin(toImage(e.clientX, e.clientY));
    if (state.pinging && e.type === 'pointerup') return ping(toImage(e.clientX, e.clientY));
    // A click on a door: the DM picks it (to open, close, lock or unlock it); a player opens or closes it.
    const door = e.type === 'pointerup' ? doorAt(e.clientX, e.clientY) : null;
    if (door) return state.canEdit ? selectDoor(door.id) : toggleDoor(door);
    // A click on a template picks it (to see who it catches).
    const at = toImage(e.clientX, e.clientY);
    const tpl = e.type === 'pointerup' ? (state.current.templates ?? []).findLast((t) => inTemplate(state.current, t, at.x, at.y)) : null;
    if (tpl) return selectTemplate(tpl.id);
    // In Edit map, a click on a raised area picks it (the DM).
    const area = e.type === 'pointerup' && state.canEdit && raisedShown() && !state.wallMode && !state.fogMode ? (state.current.raised ?? []).findLast((a) => pointInPolygon(at.x, at.y, a.points)) : null;
    if (area) return selectRaised(area.id);
    select(null);
  }
}

// ---------- moving tokens ----------

function tokenDown(e, token) {
  // Picking who to attack: a tap on a token is the target.
  if (state.targeting) {
    e.stopPropagation();
    return pickTarget(token);
  }
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
  const cost = pathCost(map, [drag.start, ...drag.waypoints, end], token);
  let distance = formatDistance(cost);
  if (cost?.difficult) distance += ' · difficult';
  // Climbing (a ladder, or up or down a height with no stairs): 1 extra foot per foot, unless it climbs or flies.
  if (cost?.climb) distance += token.climber || token.elevation > 0 ? ` · climbs ${cost.climb} ft (free)` : ` · climbs ${cost.climb} ft${cost.wall ? ', no ladder or stairs' : ''}`;
  if (cost?.under) distance += ' · under the bridge';
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
  queueFog();
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
  queueFog();
  try {
    const path = drag.waypoints.map((p) => [p.x, p.y]);
    const res = await state.guarded(() => api('PATCH', `${base()}/${map.id}/tokens/${token.id}`, { x: drag.x, y: drag.y, ...(path.length && { path }) }));
    if (res) onMap(res.map);
  } catch (err) {
    Object.assign(token, drag.start);
    renderTokens();
    queueFog();
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
  const p = toView(at);
  label.style.left = `${p.x + 14}px`;
  label.style.top = `${p.y - 30}px`;
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
  initWikiLayers();
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

  // The picked token's More menu closes on a press anywhere else.
  document.addEventListener('pointerdown', (e) => {
    const menu = $('#map-selection .sel-more[open]');
    if (menu && !e.target.closest?.('.sel-more')) menu.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'w' || e.key === 'W') && state.drag && addWaypoint()) e.preventDefault();
    if (e.key === 'Escape' && state.targeting) stopTargeting();
    if (e.key === 'Escape' && state.curveBend) {
      state.curveBend = null;
      renderWalls();
      status('');
    }
  });
  $('#map-pick').addEventListener('change', (e) => show(state.maps.find((m) => m.id === e.target.value) ?? null));
  $('#map-place-groups').addEventListener('click', groupsDialog);
  $('#map-bring').addEventListener('click', bringPlayers);
  $('#map-party').addEventListener('click', () => partyDialog().catch(report));
  $('#map-clock').addEventListener('click', clockDialog);
  $('#map-fit').addEventListener('click', fit);
  $('#map-north').addEventListener('click', northUp);
  initMapFull();
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
  $('#map-new').addEventListener('click', newMapDialog);
  $('#map-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) state.guarded(() => importMap(file)).catch(report);
  });
  // Edit map (the DM): the map's walls, heights and settings, with the play tools out of the way.
  $('#map-edit').addEventListener('click', () => setEditing(!state.editing));
  $('#map-edit-done').addEventListener('click', () => setEditing(false));
  $('#map-change-design').addEventListener('click', () => openCreator(state.current).catch(report));
  $('#map-add-token').addEventListener('click', () => tokenDialog().catch(report));
  $('#map-add-companion').addEventListener('click', () => companionDialog());
  $('#map-fog-open').addEventListener('click', () => {
    const tools = $('#map-fog-tools');
    tools.hidden = !tools.hidden;
    if (tools.hidden && state.fogMode) setTool({});
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
  $('#map-walls-draft').addEventListener('click', () => wallsDraftDialog(state.current));
  $('#map-walls-file').addEventListener('click', () => $('#map-walls-file-input').click());
  $('#map-walls-export').addEventListener('click', () => downloadUvtt(state.current).catch(report));
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
      const extra = [['raised areas', saved.raised], ['stairs and ladders', saved.climbs], ['areas of difficult terrain', saved.terrain]]
        .map(([what, list]) => [what, (list ?? []).filter((x) => x.source === 'file').length])
        .filter(([, k]) => k)
        .map(([what, k]) => `, ${k} ${what}`)
        .join('');
      status(`From the file: ${n.filter((w) => !w.door).length} walls, ${n.filter((w) => w.door).length} doors, ${saved.lights.filter((l) => l.source === 'file').length} lights${extra}. ${saved.file_notes ?? ''}`.trim());
    } catch (err) {
      report(err);
    }
  });
  $('#map-raised-accept').addEventListener('click', () => raised({ accept: 'all' }));
  // One at a time: go to each guess, see it on the map, then keep it or change it.
  $('#map-raised-check').addEventListener('click', () => {
    const [first] = aiGuesses(state.current);
    if (first) selectRaised(first.id, { center: true });
  });
  for (const b of document.querySelectorAll('[data-wall-action]')) {
    b.addEventListener('click', () => {
      if (b.dataset.wallAction === 'clear-ai') {
        if (confirm("Remove everything the AI drafted (walls, lights, difficult terrain, stairs and ladders, and heights you haven't accepted)? What you drew stays.")) {
          walls({ clear: 'ai' }).then(() => lights({ clear: 'ai' })).then(() => terrain({ clear: 'ai' })).then(() => climbs({ clear: 'ai' })).then(() => raised({ clear: 'ai' }));
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
  $('#map-attacks-log').addEventListener('click', attackLog);
  $('#map-dm-effect').addEventListener('click', () => customForm());
  $('#map-combat-open').addEventListener('click', () => {
    state.combatOpen = !state.combatOpen;
    renderCombat();
  });
}
