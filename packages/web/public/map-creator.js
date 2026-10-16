/**
 * The DM's map creator (SPEC §6.6 "Making a map"): a grid the DM builds a
 * map on, from floors, rooms, walls, curves, round towers, doors, secret
 * doors, windows and archways, roads and rivers, labels, and things (the
 * built-in assets, or their own pictures), placed one by one, scattered or
 * stamped down in pieces; with a look (daylight, dusk, night, gloom) over
 * it all. A new map can start blank, from one the server makes, or from
 * the AI's draft of a description or sketch. Saving sends the design to the
 * server, which draws the map's picture and turns walls, doors, blocking
 * things and lights into the map's own.
 *
 * The page only edits the design: the preview is drawn with the same code
 * the server draws the picture with (shared/map-art.js). Its parts:
 * map-creator-panel.js (tools, things, stamps, the look, what's picked) and
 * map-creator-start.js (starting a new map, floors of a building).
 */
import {
  ASSETS, DESIGN_MAX, DESIGN_MIN, EMPTY, FLOORS, PATH_KINDS, addCircle, addRoom, addWall, assetAt, brushCells, clearArea, copyArea,
  cutWallAt, emptyDesign, fillFloor, fillHeight, heightAreas, labelAt, labelWidth, layerOf, newDesignId, normalizeDesign, paintFloor, paintHeightRect, pasteClip, pathAt, rectCells,
  resizeDesign, scatterAssets, smoothPoints, transformClip, wallAt, wallPoints,
} from './shared/map-design.js';
import { drawAsset, drawDesign, drawFloor, drawPaths } from './shared/map-art.js';
import { onMap, show } from './map.js';
import { api, fileUrl, h, readBase64, LoggedOut } from './api.js';
import { base, downloadUvtt, report, state } from './map-state.js';
import { TOOLS, renderPanel, renderProps } from './map-creator-panel.js';
import { renderStart } from './map-creator-start.js';

const $ = (sel) => document.querySelector(sel);
const BASE_CELL = 28; // preview pixels per square at zoom 1
const MAX_CANVAS = 4096; // the preview's longest side, in pixels, at most
const UNDO_STEPS = 100;
const AUTOSAVE_MS = 1500;

/** Everything the open creator works on (null while it's shut). */
let c = null;

const draftKey = (mapId) => `dndapp.creator.${state.campaignId}.${mapId ?? 'new'}`;

/** Open the creator: a new map (the start screen first), or `map` (one made in the creator) to change it. */
export async function openCreator(map = null) {
  const design = map ? normalizeDesign((await api('GET', `${base()}/${map.id}/design`)).design) : emptyDesign(30, 20);
  c = {
    map,
    design,
    saved: JSON.stringify(design),
    name: map?.name ?? 'New map',
    starting: !map,
    tool: 'select',
    floor: 's',
    brush: 1,
    round: true,
    floorShape: 'brush', // or 'rect'
    wallType: 'wall', // the wall, curve and round tools: 'wall' | 'low'
    wallStyle: 'stone',
    door: 'door', // the door tool: 'door' | 'secret' | 'window' | 'arch'
    circleFloor: true,
    height: 10, // the height tool: feet above the ground (negative: lower)
    roomWalls: true, // the room tool: walled all round, or only its floor
    pathKind: 'road',
    pathWidth: PATH_KINDS.road.w,
    label: { text: '', font: 'old', size: 0.8, colour: '#f4ead5', italic: false, halo: true },
    asset: 'table',
    vary: false, // place: each one turned and sized a little differently
    placeRot: 0,
    spacing: 1, // scatter: how far apart (1 = as usual)
    rubber: 'things', // or 'floor'
    selected: [], // [{ kind: 'asset' | 'label' | 'path' | 'wall', id }]
    clip: null, // being put down: { clip, rot, flip, name }
    area: null, // the area tool's rectangle { x1, y1, x2, y2 }
    pathDraft: null, // a road being clicked point by point: [[x, y], ...]
    curve: null, // a curve waiting to be bent: { a, b, m }
    hover: null, // where the pointer is, in squares
    zoom: 1,
    undo: [],
    redo: [],
    drag: null, // what the pointer is doing while it's down
    images: new Map(), // 'u:<id>' -> the DM's picture, loaded
    assets: [], // the DM's own
    stamps: { builtIn: [], own: [] },
    search: '',
    tab: 'things', // the panel's lower part: things | stamps | look | floors
    open: new Set(['Furniture', 'Nature', 'Dungeon', 'own', 'Rooms', 'Outdoors', 'mine']), // groups shown open
    previewLook: true, // draw the mood and glow while editing
    showGrid: true,
    ghost: null, // the floor below (or above), drawn faintly: { design, name }
    floorCanvas: null,
    frame: 0,
    autosave: 0,
  };
  restoreDraft();
  build();
  $('#map-creator').showModal();
  loadAssets().catch(report);
  loadStamps().catch(report);
}

/** Unsaved changes kept in this browser (from a creator closed by accident, or a crash) are offered back. */
function restoreDraft() {
  let kept = null;
  try {
    kept = JSON.parse(localStorage.getItem(draftKey(c.map?.id)) ?? 'null');
  } catch {
    kept = null;
  }
  if (!kept?.design || JSON.stringify(normalizeDesign(kept.design)) === c.saved) return;
  const when = new Date(kept.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  if (!confirm(`You have unsaved work on ${c.map ? 'this map' : 'a new map'} from ${when}. Carry on with it?`)) {
    forgetDraft();
    return;
  }
  c.design = normalizeDesign(kept.design);
  c.name = String(kept.name || c.name);
  c.starting = false;
}

function keepDraft() {
  clearTimeout(c.autosave);
  const key = draftKey(c.map?.id);
  const snapshot = { name: c.name, design: c.design, at: Date.now() };
  c.autosave = setTimeout(() => {
    try {
      localStorage.setItem(key, JSON.stringify(snapshot));
    } catch {
      // no room, or no storage: nothing kept
    }
  }, AUTOSAVE_MS);
}

function forgetDraft(mapId = c?.map?.id) {
  if (c) clearTimeout(c.autosave);
  try {
    localStorage.removeItem(draftKey(mapId));
  } catch {
    // nothing to forget
  }
}

const cell = () => BASE_CELL * c.zoom;
const maxZoom = () => Math.min(4, MAX_CANVAS / (Math.max(c.design.cols, c.design.rows) * BASE_CELL));

// ---------- the dialog ----------

function build() {
  const dialog = $('#map-creator');
  const name = h('input', { id: 'creator-name', value: c.name, maxLength: 100, 'aria-label': 'Map name', oninput: (e) => { c.name = e.target.value; keepDraft(); } });
  const cols = h('input', { id: 'creator-cols', type: 'number', min: String(DESIGN_MIN), max: String(DESIGN_MAX), value: c.design.cols, 'aria-label': 'Squares across' });
  const rows = h('input', { id: 'creator-rows', type: 'number', min: String(DESIGN_MIN), max: String(DESIGN_MAX), value: c.design.rows, 'aria-label': 'Squares down' });
  const canvas = h('canvas', { id: 'creator-canvas', class: 'creator-canvas' });
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { c.drag = null; redraw(); });
  canvas.addEventListener('pointerleave', () => { if (c) { c.hover = null; redraw(); } });
  canvas.addEventListener('dblclick', () => finishPath());
  const view = h('div', { class: 'creator-view', id: 'creator-view' }, canvas);
  view.addEventListener('wheel', wheel, { passive: false });
  view.addEventListener('pointerdown', panStart);
  const stage = h('div', { class: 'creator-stage' }, view, h('div', { class: 'creator-props', id: 'creator-props', hidden: true }));
  const icon = (label, title, onclick, attrs = {}) => h('button', { type: 'button', class: 'ghost', title, 'aria-label': title, onclick, ...attrs }, label);
  dialog.replaceChildren(
    h('div', { class: 'creator' },
      h('header', { class: 'creator-head' },
        h('h2', {}, c.map ? 'Change map' : 'Make a map'),
        name,
        h('span', { class: 'creator-size', hidden: c.starting }, cols, '×', rows, h('button', { type: 'button', class: 'ghost', id: 'creator-resize', onclick: () => resize(cols.value, rows.value) }, 'Resize')),
        h('span', { class: 'muted small', hidden: c.starting }, '1 square = 5 ft'),
        h('span', { class: 'spacer' }),
        h('span', { class: 'creator-head-tools', hidden: c.starting },
          icon('↶', 'Undo (Ctrl+Z)', undo, { id: 'creator-undo' }),
          icon('↷', 'Redo (Ctrl+Shift+Z)', redo, { id: 'creator-redo' }),
          icon('−', 'Zoom out', () => zoomBy(1 / 1.25)),
          icon('+', 'Zoom in', () => zoomBy(1.25)),
          icon('Fit', 'Fit the map to the window', fit, { id: 'creator-fit' }),
        ),
        h('button', { type: 'button', class: 'ghost', onclick: close }, 'Close'),
        h('button', { type: 'button', class: 'primary', id: 'creator-save', hidden: c.starting, onclick: () => save().catch(report) }, c.map ? 'Save changes' : 'Save map'),
      ),
      c.starting
        ? h('div', { class: 'creator-start', id: 'creator-start' })
        : h('div', { class: 'creator-body' }, h('aside', { class: 'creator-tools', id: 'creator-tools' }), stage),
      h('p', { id: 'creator-status', class: 'muted small creator-status', role: 'status' }),
    ),
  );
  dialog.onkeydown = keydown;
  dialog.onkeyup = (e) => { if (e.key === ' ' && c) c.space = false; };
  dialog.oncancel = (e) => {
    e.preventDefault();
    // Esc stops what's going on (a drawing, a copy being put down, what's picked) before it closes the creator.
    if (c?.drag || c?.curve || c?.pathDraft || c?.clip || c?.area || c?.selected.length) cancel();
    else close();
  };
  if (c.starting) {
    renderStart(c, act);
    return;
  }
  renderPanel(c, act);
  refreshFloor();
  fitOnOpen();
}

/** Zoom so the whole map fits the window when it opens (where the page has a size). */
function fitOnOpen() {
  const view = $('#creator-view');
  if (view?.clientWidth > 0) fit();
}

function fit() {
  const view = $('#creator-view');
  if (!view?.clientWidth) return;
  const k = Math.min((view.clientWidth - 32) / (c.design.cols * BASE_CELL), (view.clientHeight - 32) / (c.design.rows * BASE_CELL));
  setZoom(k);
}

function setZoom(k, anchor = null) {
  const view = $('#creator-view');
  const before = c.zoom;
  c.zoom = Math.min(maxZoom(), Math.max(0.25, k));
  if (c.zoom === before) return;
  // Keep the square under the pointer (or the middle of the view) where it is.
  const ax = anchor?.x ?? view.clientWidth / 2;
  const ay = anchor?.y ?? view.clientHeight / 2;
  const sx = (view.scrollLeft + ax) / before;
  const sy = (view.scrollTop + ay) / before;
  refreshFloor();
  view.scrollLeft = sx * c.zoom - ax;
  view.scrollTop = sy * c.zoom - ay;
}

const zoomBy = (k) => setZoom(c.zoom * k);

function wheel(e) {
  if (!c || c.starting) return;
  e.preventDefault();
  const rect = $('#creator-view').getBoundingClientRect();
  setZoom(c.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), { x: e.clientX - rect.left, y: e.clientY - rect.top });
}

/** Panning: the middle button, or the left with Space held, drags the view. */
function panStart(e) {
  if (!(e.button === 1 || (e.button === 0 && c?.space))) return;
  e.preventDefault();
  const view = $('#creator-view');
  const from = { x: e.clientX, y: e.clientY, left: view.scrollLeft, top: view.scrollTop };
  const moveTo = (ev) => {
    view.scrollLeft = from.left - (ev.clientX - from.x);
    view.scrollTop = from.top - (ev.clientY - from.y);
  };
  const stop = () => {
    window.removeEventListener('pointermove', moveTo);
    window.removeEventListener('pointerup', stop);
  };
  window.addEventListener('pointermove', moveTo);
  window.addEventListener('pointerup', stop);
}

// ---------- changes ----------

/**
 * Change the design: kept for undo, redrawn (just the part of the floor
 * that changed), and kept in the browser in case the page closes.
 */
function change(next, { keepSelection = false } = {}) {
  if (!c || next === c.design) return;
  const before = c.design;
  c.undo.push(JSON.stringify(before));
  if (c.undo.length > UNDO_STEPS) c.undo.shift();
  c.redo = [];
  c.design = next;
  if (!keepSelection) prune();
  repaint(before);
  keepDraft();
  renderProps(c, act);
}

/** Redraw after the design went from `before` to what it is: the floor where it changed (all of it after a resize or a new look). */
function repaint(before) {
  const d = c.design;
  const lookChanged = JSON.stringify(before.look) !== JSON.stringify(d.look);
  if (lookChanged && c.tab === 'look') renderPanel(c, act); // what it shows (after an undo, too)
  if (before.cols !== d.cols || before.rows !== d.rows || lookChanged || JSON.stringify(before.paths) !== JSON.stringify(d.paths)) {
    syncSize();
    refreshFloor();
    return;
  }
  let box = null;
  for (let r = 0; r < d.rows; r += 1) {
    if (before.floor[r] === d.floor[r]) continue;
    for (let col = 0; col < d.cols; col += 1) {
      if (before.floor[r][col] === d.floor[r][col]) continue;
      box = box ? { x1: Math.min(box.x1, col), y1: Math.min(box.y1, r), x2: Math.max(box.x2, col + 1), y2: Math.max(box.y2, r + 1) } : { x1: col, y1: r, x2: col + 1, y2: r + 1 };
    }
  }
  if (box) paintRegion(box);
  redraw();
}

/** What's picked, without anything that's gone. */
function prune() {
  const has = { asset: new Set(c.design.assets.map((x) => x.id)), label: new Set(c.design.labels.map((x) => x.id)), path: new Set(c.design.paths.map((x) => x.id)), wall: new Set(c.design.walls.map((x) => x.id)) };
  c.selected = c.selected.filter((s) => has[s.kind].has(s.id));
}

function undo() {
  const last = c.undo.pop();
  if (!last) return status('Nothing to undo.');
  const before = c.design;
  c.redo.push(JSON.stringify(before));
  c.design = JSON.parse(last);
  prune();
  repaint(before);
  keepDraft();
  renderProps(c, act);
}

function redo() {
  const next = c.redo.pop();
  if (!next) return status('Nothing to redo.');
  const before = c.design;
  c.undo.push(JSON.stringify(before));
  c.design = JSON.parse(next);
  prune();
  repaint(before);
  keepDraft();
  renderProps(c, act);
}

function resize(cols, rows) {
  const next = resizeDesign(c.design, Number(cols), Number(rows));
  if (next.cols === c.design.cols && next.rows === c.design.rows) return syncSize();
  if ((next.cols < c.design.cols || next.rows < c.design.rows) && !confirm('Make the map smaller? What is past the new edge is cut off.')) return syncSize();
  c.zoom = Math.min(c.zoom, maxZoomFor(next));
  change(next);
}

const maxZoomFor = (d) => Math.min(4, MAX_CANVAS / (Math.max(d.cols, d.rows) * BASE_CELL));

function syncSize() {
  const cols = $('#creator-cols');
  const rows = $('#creator-rows');
  if (cols) cols.value = c.design.cols;
  if (rows) rows.value = c.design.rows;
}

/** Fill the whole map with the picked floor. */
function fillAll() {
  const cells = [];
  for (let r = 0; r < c.design.rows; r += 1) for (let col = 0; col < c.design.cols; col += 1) cells.push([col, r]);
  change(paintFloor(c.design, cells, c.floor));
}

// ---------- what's picked ----------

const listOf = { asset: 'assets', label: 'labels', path: 'paths', wall: 'walls' };
const findPicked = (s) => c.design[listOf[s.kind]].find((x) => x.id === s.id);
const isPicked = (kind, id) => c.selected.some((s) => s.kind === kind && s.id === id);

function select(list) {
  c.selected = list;
  renderProps(c, act);
  redraw();
}

/** Change the picked things with fn(thing, kind) -> the changed thing. */
function changePicked(fn) {
  const picked = (kind) => (x) => (isPicked(kind, x.id) ? fn({ ...x }, kind) : x);
  change(normalizeDesign({
    ...c.design,
    assets: c.design.assets.map(picked('asset')),
    labels: c.design.labels.map(picked('label')),
    paths: c.design.paths.map(picked('path')),
    walls: c.design.walls.map(picked('wall')),
  }), { keepSelection: true });
}

function removePicked() {
  if (!c.selected.length) return;
  const keep = (kind) => (x) => !isPicked(kind, x.id);
  change({ ...c.design, assets: c.design.assets.filter(keep('asset')), labels: c.design.labels.filter(keep('label')), paths: c.design.paths.filter(keep('path')), walls: c.design.walls.filter(keep('wall')) });
  c.selected = [];
  renderProps(c, act);
  redraw();
}

/** Move the picked things by (dx, dy) squares. */
const moved = (x, kind, dx, dy) => {
  if (kind === 'path') return { ...x, pts: x.pts.map(([px, py]) => [px + dx, py + dy]) };
  if (kind === 'wall') return { ...x, x1: x.x1 + dx, y1: x.y1 + dy, x2: x.x2 + dx, y2: x.y2 + dy, ...(x.arc && { arc: { x: x.arc.x + dx, y: x.arc.y + dy } }) };
  return { ...x, x: x.x + dx, y: x.y + dy };
};

function nudge(dx, dy) {
  if (!c.selected.length) return;
  changePicked((x, kind) => moved(x, kind, dx, dy));
}

/** Turn the picked things (assets and labels) by `deg`, each about its middle. */
function turnPicked(deg) {
  changePicked((x, kind) => (kind === 'asset' || kind === 'label' ? { ...x, rot: x.rot + deg } : x));
}

function flipPicked() {
  changePicked((x, kind) => (kind === 'asset' ? { ...x, flip: !x.flip } : x));
}

/** The picked things as a clip (as if copied from the smallest area round them), with `at`: where its corner was. */
function pickedClip() {
  const things = c.selected.map((s) => [s.kind, findPicked(s)]).filter(([, x]) => x);
  if (!things.length) return null;
  const xs = [];
  const ys = [];
  for (const [kind, x] of things) {
    if (kind === 'path') x.pts.forEach(([px, py]) => { xs.push(px); ys.push(py); });
    else if (kind === 'wall') xs.push(x.x1, x.x2), ys.push(x.y1, x.y2);
    else xs.push(x.x), ys.push(x.y);
  }
  const x1 = Math.floor(Math.min(...xs));
  const y1 = Math.floor(Math.min(...ys));
  const cols = Math.max(1, Math.ceil(Math.max(...xs)) - x1);
  const rows = Math.max(1, Math.ceil(Math.max(...ys)) - y1);
  const of = (kind) => things.filter(([k]) => k === kind).map(([, x]) => moved(x, kind, -x1, -y1));
  return { cols, rows, floor: Array.from({ length: rows }, () => EMPTY.repeat(cols)), walls: of('wall'), assets: of('asset'), paths: of('path'), labels: of('label'), at: { x: x1, y: y1 } };
}

/** A copy of the picked things, a square down and to the right, picked instead. */
function duplicatePicked() {
  const clip = pickedClip();
  if (!clip) return;
  const before = new Set([...c.design.assets, ...c.design.labels, ...c.design.paths, ...c.design.walls].map((x) => x.id));
  change(pasteClip(c.design, clip, { x: clip.at.x + 1, y: clip.at.y + 1 }));
  const fresh = (kind, list) => list.filter((x) => !before.has(x.id)).map((x) => ({ kind, id: x.id }));
  select([...fresh('asset', c.design.assets), ...fresh('label', c.design.labels), ...fresh('path', c.design.paths)]);
}

/** Bring the picked assets to the front (drawn last on their layer) or send them to the back. */
function orderPicked(front) {
  const picked = c.design.assets.filter((x) => isPicked('asset', x.id));
  const rest = c.design.assets.filter((x) => !isPicked('asset', x.id));
  change({ ...c.design, assets: front ? [...rest, ...picked] : [...picked, ...rest] }, { keepSelection: true });
}

// ---------- tools ----------

function setTool(key) {
  if (c.tool === key && key !== 'paste') return;
  if (c.tool === 'paste' && key !== 'paste') c.clip = null;
  if (key !== 'path') c.pathDraft = null;
  c.curve = null;
  c.tool = key;
  if (key !== 'select' && key !== 'area') c.selected = [];
  if (key !== 'area') c.area = null;
  const hint = TOOLS.find((t) => t[0] === key)?.[3];
  if (hint) status(hint);
  renderPanel(c, act);
  redraw();
}

/** Put a clip (a stamp, or what was copied) down where the DM clicks. */
function startPaste(clip, name = 'the copy') {
  c.clip = { clip, rot: 0, flip: false, name };
  setTool('paste');
  status(`Click the map to put down ${name}. R turns it, F flips it, Esc stops.`);
}

const shownClip = () => transformClip(c.clip.clip, { rot: c.clip.rot, flip: c.clip.flip });

function cancel() {
  if (c.drag) c.drag = null;
  else if (c.curve) c.curve = null;
  else if (c.pathDraft) c.pathDraft = null;
  else if (c.clip) setTool('select');
  else if (c.area) c.area = null;
  else if (c.selected.length) c.selected = [];
  renderProps(c, act);
  redraw();
}

// ---------- drawing the preview ----------

/** Draw the whole floor again (after a size, zoom, look or undo change), then everything on it. */
function refreshFloor() {
  const px = cell();
  const W = Math.round(c.design.cols * px);
  const H = Math.round(c.design.rows * px);
  const fc = c.floorCanvas?.width === W && c.floorCanvas?.height === H ? c.floorCanvas : document.createElement('canvas');
  fc.width = W;
  fc.height = H;
  const ctx = fc.getContext('2d');
  if (ctx) {
    drawFloor(ctx, c.design, px);
    drawPaths(ctx, c.design, px);
  }
  c.floorCanvas = fc;
  const canvas = $('#creator-canvas');
  if (canvas) {
    canvas.width = W;
    canvas.height = H;
  }
  redraw(true);
}

/** Just a part of the floor (painting), with the squares round it (natural floors run into their neighbours). */
function paintRegion(box) {
  const ctx = c.floorCanvas?.getContext('2d');
  if (!ctx) return;
  const region = { x1: box.x1 - 1, y1: box.y1 - 1, x2: box.x2 + 1, y2: box.y2 + 1 };
  drawFloor(ctx, c.design, cell(), region);
  drawPaths(ctx, c.design, cell(), region);
}

/** Draw the preview on the next frame (many changes in one frame draw once). */
function redraw(now = false) {
  if (!c) return;
  if (now || typeof requestAnimationFrame !== 'function') {
    cancelAnimationFrame?.(c.frame);
    c.frame = 0;
    drawNow();
    return;
  }
  if (c.frame) return;
  c.frame = requestAnimationFrame(() => {
    if (!c) return;
    c.frame = 0;
    drawNow();
  });
}

const makeCanvas = (w, hgt) => Object.assign(document.createElement('canvas'), { width: w, height: hgt });

function drawNow() {
  const canvas = $('#creator-canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx || !c.floorCanvas) return;
  const px = cell();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(c.floorCanvas, 0, 0);
  drawDesign(ctx, c.design, { cell: px, images: c.images, floor: false, look: c.previewLook, labels: true, grid: c.previewLook, makeCanvas });
  if (c.ghost) drawGhost(ctx, px);
  if (c.showGrid) drawGrid(ctx, px, canvas.width, canvas.height);
  drawOpenings(ctx, px);
  drawLinks(ctx, px);
  if (c.tool === 'height') drawHeights(ctx, px);
  drawPicked(ctx, px);
  drawWorking(ctx, px);
}

/** The editing grid, faintly, so squares can be counted (not part of the map's picture). */
function drawGrid(ctx, px, W, H) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= c.design.cols; x += 1) { ctx.moveTo(Math.round(x * px) + 0.5, 0); ctx.lineTo(Math.round(x * px) + 0.5, H); }
  for (let y = 0; y <= c.design.rows; y += 1) { ctx.moveTo(0, Math.round(y * px) + 0.5); ctx.lineTo(W, Math.round(y * px) + 0.5); }
  ctx.stroke();
  // Every fifth line a little stronger.
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  for (let x = 5; x < c.design.cols; x += 5) { ctx.moveTo(Math.round(x * px) + 0.5, 0); ctx.lineTo(Math.round(x * px) + 0.5, H); }
  for (let y = 5; y < c.design.rows; y += 5) { ctx.moveTo(0, Math.round(y * px) + 0.5); ctx.lineTo(W, Math.round(y * px) + 0.5); }
  ctx.stroke();
  ctx.restore();
}

/** The floor below (or above), its walls drawn faintly, to line this one up with it. */
function drawGhost(ctx, px) {
  ctx.save();
  ctx.strokeStyle = 'rgba(120, 220, 255, 0.55)';
  ctx.lineWidth = Math.max(2, px * 0.1);
  ctx.setLineDash?.([px * 0.3, px * 0.2]);
  for (const w of c.ghost.design.walls) {
    const pts = wallPoints(w);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * px, y * px) : ctx.moveTo(x * px, y * px)));
    ctx.stroke();
  }
  ctx.restore();
}

/** Doors as the map will show them shut (the picture only has their frames); secret doors marked for the DM. */
function drawOpenings(ctx, px) {
  ctx.save();
  for (const w of c.design.walls) {
    if (w.type !== 'door' && w.type !== 'secret') continue;
    ctx.beginPath();
    ctx.moveTo(w.x1 * px, w.y1 * px);
    ctx.lineTo(w.x2 * px, w.y2 * px);
    if (w.type === 'door') {
      ctx.strokeStyle = '#3a220f';
      ctx.lineWidth = Math.max(4, px * 0.2);
      ctx.stroke();
      ctx.strokeStyle = '#b07a3a';
      ctx.lineWidth = Math.max(2, px * 0.13);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#b392ff';
      ctx.lineWidth = Math.max(2, px * 0.1);
      ctx.setLineDash?.([px * 0.18, px * 0.12]);
      ctx.stroke();
      ctx.setLineDash?.([]);
    }
  }
  ctx.restore();
}

/** Things that lead to another map (stairs, a trapdoor) get a small badge. */
/** The squares given a height (the height tool shows them): blue up, brown down, each area with its height. */
function drawHeights(ctx, px) {
  ctx.save();
  for (const r of heightAreas(c.design)) {
    const xs = r.points.map((q) => q[0] * px);
    const ys = r.points.map((q) => q[1] * px);
    const [x, y, w, hgt] = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    ctx.beginPath();
    r.points.forEach(([qx, qy], i) => (i ? ctx.lineTo(qx * px, qy * px) : ctx.moveTo(qx * px, qy * px)));
    ctx.closePath();
    ctx.fillStyle = r.height > 0 ? 'rgba(70, 130, 200, 0.3)' : 'rgba(120, 80, 40, 0.35)';
    ctx.fill();
    ctx.strokeStyle = r.height > 0 ? '#4a90d9' : '#a0703a';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (w >= px * 0.9 && hgt >= px * 0.5) {
      ctx.font = `bold ${Math.round(Math.max(10, px * 0.38))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillStyle = '#ffffff';
      const text = `${r.height > 0 ? '↑' : '↓'}${Math.abs(r.height)} ft`;
      ctx.strokeText(text, x + w / 2, y + hgt / 2);
      ctx.fillText(text, x + w / 2, y + hgt / 2);
    }
  }
  ctx.restore();
}

function drawLinks(ctx, px) {
  ctx.save();
  for (const a of c.design.assets) {
    if (!a.to) continue;
    const x = a.x * px;
    const y = a.y * px;
    const r = Math.max(6, px * 0.28);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 60, 120, 0.85)';
    ctx.fill();
    ctx.strokeStyle = '#cfe6ff';
    ctx.lineWidth = Math.max(1.5, px * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(r * 1.2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⇅', x, y + 1);
  }
  ctx.restore();
}

const outline = (ctx, x, y, w, hgt, rot, px, colour = '#ffd54a') => {
  ctx.save();
  ctx.translate(x * px, y * px);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.strokeRect((-w / 2) * px - 2, (-hgt / 2) * px - 2, w * px + 4, hgt * px + 4);
  ctx.restore();
};

function drawPicked(ctx, px) {
  for (const s of c.selected) {
    const x = findPicked(s);
    if (!x) continue;
    if (s.kind === 'asset') outline(ctx, x.x, x.y, x.w, x.h, x.rot, px);
    else if (s.kind === 'label') outline(ctx, x.x, x.y, labelWidth(x) + 0.2, x.size * 1.3, x.rot, px);
    else {
      const pts = s.kind === 'path' ? smoothPoints(x.pts, 6) : wallPoints(x);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 213, 74, 0.9)';
      ctx.lineWidth = s.kind === 'path' ? Math.max(3, x.w * px * 0.35) : Math.max(4, px * 0.22);
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach(([px0, py0], i) => (i ? ctx.lineTo(px0 * px, py0 * px) : ctx.moveTo(px0 * px, py0 * px)));
      ctx.stroke();
      ctx.restore();
    }
  }
}

const dashed = (ctx, fn) => {
  ctx.save();
  ctx.strokeStyle = '#ffd54a';
  ctx.lineWidth = 2;
  ctx.setLineDash?.([6, 4]);
  ctx.beginPath();
  fn();
  ctx.stroke();
  ctx.restore();
};

/** What's being drawn now: a wall, room, circle, curve, road, rectangle, or the clip about to be put down. */
function drawWorking(ctx, px) {
  const d = c.drag;
  if (d?.kind === 'line' && d.b) dashed(ctx, () => { ctx.moveTo(d.a.x * px, d.a.y * px); ctx.lineTo(d.b.x * px, d.b.y * px); });
  if ((d?.kind === 'rect' || d?.kind === 'box') && d.b) {
    dashed(ctx, () => ctx.rect(Math.min(d.a.x, d.b.x) * px, Math.min(d.a.y, d.b.y) * px, Math.abs(d.b.x - d.a.x) * px, Math.abs(d.b.y - d.a.y) * px));
  }
  if (d?.kind === 'circle' && d.r) dashed(ctx, () => ctx.arc(d.a.x * px, d.a.y * px, d.r * px, 0, Math.PI * 2));
  if (d?.kind === 'stroke' && d.pts.length > 1) dashed(ctx, () => d.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * px, y * px) : ctx.moveTo(x * px, y * px))));
  if (c.curve) {
    const { a, b, m } = c.curve;
    const pts = wallPoints({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, arc: m });
    dashed(ctx, () => pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * px, y * px) : ctx.moveTo(x * px, y * px))));
  }
  if (c.pathDraft) {
    const pts = c.hover ? [...c.pathDraft, [c.hover.x, c.hover.y]] : c.pathDraft;
    dashed(ctx, () => smoothPoints(pts, 6).forEach(([x, y], i) => (i ? ctx.lineTo(x * px, y * px) : ctx.moveTo(x * px, y * px))));
    ctx.save();
    ctx.fillStyle = '#ffd54a';
    for (const [x, y] of c.pathDraft) {
      ctx.beginPath();
      ctx.arc(x * px, y * px, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (c.area) dashed(ctx, () => ctx.rect(c.area.x1 * px, c.area.y1 * px, (c.area.x2 - c.area.x1) * px, (c.area.y2 - c.area.y1) * px));
  if (c.tool === 'paste' && c.clip && c.hover) drawClipPreview(ctx, px);
  if (c.tool === 'place' && c.hover && !d) drawPlacePreview(ctx, px);
}

/** Where the clip goes: its corner on the square under the pointer. */
const clipCorner = (clip, p) => ({ x: Math.floor(p.x - clip.cols / 2 + 0.5), y: Math.floor(p.y - clip.rows / 2 + 0.5) });

function drawClipPreview(ctx, px) {
  const clip = shownClip();
  const o = clipCorner(clip, c.hover);
  ctx.save();
  ctx.translate(o.x * px, o.y * px);
  ctx.globalAlpha = 0.5;
  clip.floor.forEach((line, r) => [...line].forEach((ch, col) => {
    if (ch === EMPTY || !FLOORS[ch]) return;
    ctx.fillStyle = FLOORS[ch].base;
    ctx.fillRect(col * px, r * px, px, px);
  }));
  ctx.globalAlpha = 0.8;
  for (const a of clip.assets) drawAsset(ctx, a, px, c.images);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffd54a';
  ctx.lineWidth = Math.max(2, px * 0.1);
  for (const w of clip.walls) {
    ctx.beginPath();
    wallPoints(w).forEach(([x, y], i) => (i ? ctx.lineTo(x * px, y * px) : ctx.moveTo(x * px, y * px)));
    ctx.stroke();
  }
  ctx.setLineDash?.([6, 4]);
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, clip.cols * px, clip.rows * px);
  ctx.restore();
}

function drawPlacePreview(ctx, px) {
  const a = placing(c.hover, false);
  if (!a) return;
  ctx.save();
  ctx.globalAlpha = 0.55;
  drawAsset(ctx, a, px, c.images);
  ctx.restore();
}

// ---------- the pointer ----------

/** Where the pointer is, in squares. */
function at(e) {
  const rect = $('#creator-canvas').getBoundingClientRect();
  return { x: (e.clientX - rect.left) / cell(), y: (e.clientY - rect.top) / cell() };
}
const snapCorner = (p, halves) => {
  const k = halves ? 2 : 1;
  return { x: Math.round(p.x * k) / k, y: Math.round(p.y * k) / k };
};
const square = (p) => [Math.floor(p.x), Math.floor(p.y)];
/** Where an asset's middle goes so its edges sit on grid lines (whole sizes), or on quarter squares. */
const snapCentre = (v, size, free) => (free ? Math.round(v * 20) / 20 : Number.isInteger(size) ? Math.round(v - size / 2) + size / 2 : Math.round(v * 4) / 4);
const rectOf = (a, b) => ({ x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) });

/** What the select tool picks under a point: a label, a standing thing, a wall, a thing on the floor, then a road. */
function pickAt(p) {
  const l = labelAt(c.design, p.x, p.y);
  if (l) return { kind: 'label', id: l.id };
  const a = assetAt(c.design, p.x, p.y);
  if (a && layerOf(a) > 0) return { kind: 'asset', id: a.id };
  const w = wallAt(c.design, p.x, p.y, 0.25);
  if (w) return { kind: 'wall', id: w.id };
  if (a) return { kind: 'asset', id: a.id };
  const path = pathAt(c.design, p.x, p.y);
  if (path) return { kind: 'path', id: path.id };
  return null;
}

function down(e) {
  if (e.button !== 0 || c.space) return;
  e.currentTarget.setPointerCapture?.(e.pointerId);
  const p = at(e);
  const t = c.tool;
  if (t === 'select') {
    const hit = pickAt(p);
    if (hit && e.shiftKey) {
      select(isPicked(hit.kind, hit.id) ? c.selected.filter((s) => !(s.kind === hit.kind && s.id === hit.id)) : [...c.selected, hit]);
      return;
    }
    if (hit) {
      if (!isPicked(hit.kind, hit.id)) select([hit]);
      const lead = findPicked(hit);
      // Walls stay put (pick them to change or remove); the rest move together.
      if (hit.kind !== 'wall') c.drag = { kind: 'move', lead: hit, start: p, from: JSON.stringify(c.design), at: { x: lead.x ?? lead.pts[0][0], y: lead.y ?? lead.pts[0][1] }, moved: false };
      return;
    }
    c.drag = { kind: 'box', a: p, b: p, add: e.shiftKey };
    if (!e.shiftKey) select([]);
  } else if (t === 'room' || t === 'scatter' || t === 'area' || t === 'height' || (t === 'floor' && c.floorShape === 'rect')) {
    const a = t === 'scatter' || t === 'height' ? { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 } : snapCorner(p, false);
    c.drag = { kind: 'rect', a, b: a, click: p };
    if (t === 'area') c.area = null;
  } else if (t === 'wall' || t === 'door') {
    const a = snapCorner(p, e.shiftKey);
    c.drag = { kind: 'line', a, b: a, click: p };
  } else if (t === 'curve') {
    if (c.curve) {
      // The bend is placed.
      const { a, b, m } = c.curve;
      c.curve = null;
      change(addWall(c.design, { x1: a.x, y1: a.y, x2: b.x, y2: b.y, arc: m, type: c.wallType, style: c.wallStyle }));
      return;
    }
    const a = snapCorner(p, true);
    c.drag = { kind: 'line', a, b: a };
  } else if (t === 'circle') {
    c.drag = { kind: 'circle', a: snapCorner(p, true), r: 0 };
  } else if (t === 'floor' || (t === 'rubber' && c.rubber === 'floor')) {
    c.drag = { kind: 'paint', from: JSON.stringify(c.design), changed: false };
    paintAt(p);
  } else if (t === 'fill') {
    const [col, r] = square(p);
    change(fillFloor(c.design, col, r, c.floor));
  } else if (t === 'rubber') {
    c.drag = { kind: 'rub', from: JSON.stringify(c.design), changed: false };
    rubAt(p);
  } else if (t === 'path') {
    c.drag = { kind: 'stroke', start: p, pts: [[round2(p.x), round2(p.y)]] };
  } else if (t === 'label') {
    placeLabel(p);
  } else if (t === 'place') {
    const a = placing(p, e.shiftKey);
    if (!a) return status('Pick a thing to place first (in Things).');
    change(normalizeDesign({ ...c.design, assets: [...c.design.assets, a] }));
    if (!c.design.assets.some((x) => x.id === a.id)) status('That map has as many things as it can take.');
  } else if (t === 'paste') {
    const clip = shownClip();
    change(pasteClip(c.design, clip, clipCorner(clip, p)));
  }
}

const round2 = (v) => Math.round(v * 100) / 100;

function move(e) {
  const p = at(e);
  c.hover = p;
  const d = c.drag;
  if (!d) {
    if (c.curve) c.curve.m = { x: round2(p.x), y: round2(p.y) };
    if (c.curve || c.pathDraft || c.tool === 'paste' || c.tool === 'place') redraw();
    return;
  }
  if (d.kind === 'paint') paintAt(p);
  else if (d.kind === 'rub') rubAt(p);
  else if (d.kind === 'line') {
    d.b = snapCorner(p, c.tool === 'curve' || e.shiftKey);
    redraw();
  } else if (d.kind === 'rect' || d.kind === 'box') {
    d.b = d.kind === 'box' || c.tool === 'scatter' || c.tool === 'height' ? (d.kind === 'box' ? p : { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 }) : snapCorner(p, false);
    redraw();
  } else if (d.kind === 'circle') {
    d.r = Math.round(Math.hypot(p.x - d.a.x, p.y - d.a.y) * 2) / 2;
    redraw();
  } else if (d.kind === 'stroke') {
    const last = d.pts.at(-1);
    if (Math.hypot(p.x - last[0], p.y - last[1]) >= 0.35) {
      d.pts.push([round2(p.x), round2(p.y)]);
      redraw();
    }
  } else if (d.kind === 'move') {
    const lead = findPicked(d.lead);
    if (!lead) return;
    const raw = { x: d.at.x + (p.x - d.start.x), y: d.at.y + (p.y - d.start.y) };
    const free = e.shiftKey;
    const target = d.lead.kind === 'asset' ? { x: snapCentre(raw.x, lead.w, free), y: snapCentre(raw.y, lead.h, free) } : { x: free ? raw.x : Math.round(raw.x * 4) / 4, y: free ? raw.y : Math.round(raw.y * 4) / 4 };
    const now = { x: lead.x ?? lead.pts[0][0], y: lead.y ?? lead.pts[0][1] };
    const dx = round2(target.x - now.x);
    const dy = round2(target.y - now.y);
    if (!dx && !dy) return;
    d.moved = true;
    // While dragging, moved in place; kept for undo once, when it's let go.
    const shift = (kind) => (x) => (isPicked(kind, x.id) ? moved(x, kind, dx, dy) : x);
    c.design = { ...c.design, assets: c.design.assets.map(shift('asset')), labels: c.design.labels.map(shift('label')), paths: c.design.paths.map(shift('path')) };
    if (c.selected.some((s) => s.kind === 'path')) d.paths = true;
    redraw();
  }
}

function up(e) {
  const d = c.drag;
  c.drag = null;
  if (!d) return;
  const p = at(e);
  if (d.kind === 'line') {
    const b = snapCorner(p, c.tool === 'curve' || e.shiftKey);
    if (c.tool === 'curve') {
      if (b.x === d.a.x && b.y === d.a.y) return redraw();
      c.curve = { a: d.a, b, m: { x: (d.a.x + b.x) / 2, y: (d.a.y + b.y) / 2 } };
      status('Now move to bend the curve, and click to place it (Esc: stop).');
      return redraw();
    }
    if (c.tool === 'door' && b.x === d.a.x && b.y === d.a.y) return doorAt(d.click);
    change(addWall(c.design, { x1: d.a.x, y1: d.a.y, x2: b.x, y2: b.y, type: c.tool === 'door' ? c.door : c.wallType, style: c.wallStyle }));
  } else if (d.kind === 'rect') {
    const r = rectOf(d.a, d.kind === 'rect' && (c.tool === 'scatter' || c.tool === 'height') ? { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 } : snapCorner(p, false));
    // The height tool: a click raises the whole room (or floor) under it, up to its walls; a drag, the squares in the rectangle.
    if (c.tool === 'height' && Math.hypot(p.x - d.click.x, p.y - d.click.y) < 0.3) return change(fillHeight(c.design, d.click.x, d.click.y, c.height));
    if (r.x2 - r.x1 < 0.5 || r.y2 - r.y1 < 0.5) return redraw();
    if (c.tool === 'height') return change(paintHeightRect(c.design, r, c.height));
    if (c.tool === 'room') change(c.roomWalls ? addRoom(c.design, r, c.floor, c.wallStyle) : paintFloor(c.design, rectCells(c.design, r), c.floor));
    else if (c.tool === 'floor') change(paintFloor(c.design, rectCells(c.design, r), c.floor));
    else if (c.tool === 'area') {
      c.area = r;
      renderPanel(c, act);
      status('Copy, cut or keep that piece of the map (in the panel), or press Ctrl+C or Ctrl+X.');
      redraw();
    } else if (c.tool === 'scatter') scatter(r);
  } else if (d.kind === 'box') {
    const r = rectOf(d.a, p);
    if (r.x2 - r.x1 < 0.2 && r.y2 - r.y1 < 0.2) return redraw();
    const inBox = (x, y) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
    const found = [
      ...c.design.assets.filter((x) => inBox(x.x, x.y)).map((x) => ({ kind: 'asset', id: x.id })),
      ...c.design.labels.filter((x) => inBox(x.x, x.y)).map((x) => ({ kind: 'label', id: x.id })),
      ...c.design.paths.filter((x) => x.pts.every(([px0, py0]) => inBox(px0, py0))).map((x) => ({ kind: 'path', id: x.id })),
    ];
    select(d.add ? [...c.selected, ...found.filter((f) => !isPicked(f.kind, f.id))] : found);
  } else if (d.kind === 'circle') {
    if (d.r < 0.5) return redraw();
    let next = addCircle(c.design, { cx: d.a.x, cy: d.a.y, r: d.r, type: c.wallType, style: c.wallStyle });
    if (c.circleFloor) {
      const cells = rectCells(next, { x1: d.a.x - d.r, y1: d.a.y - d.r, x2: d.a.x + d.r, y2: d.a.y + d.r }).filter(([col, r]) => Math.hypot(col + 0.5 - d.a.x, r + 0.5 - d.a.y) < d.r);
      next = paintFloor(next, cells, c.floor);
    }
    change(next);
  } else if (d.kind === 'stroke') {
    if (Math.hypot(p.x - d.start.x, p.y - d.start.y) < 0.3 && d.pts.length <= 2) {
      // A click: one more point of a road drawn point by point.
      c.pathDraft = [...(c.pathDraft ?? []), [round2(p.x), round2(p.y)]];
      status('Click the next point; double-click (or Enter) to finish the road, Esc to stop.');
      if (c.pathDraft.length === 1) renderPanel(c, act); // its Finish button
      return redraw();
    }
    d.pts.push([round2(p.x), round2(p.y)]);
    addPath(simplify(d.pts, 0.12));
  } else if (d.kind === 'move' || d.kind === 'paint' || d.kind === 'rub') {
    // Kept for undo as one change.
    if (d.kind === 'move' ? d.moved : d.changed) {
      const after = c.design;
      c.design = JSON.parse(d.from);
      change(normalizeDesign(after), { keepSelection: true });
    } else redraw();
  }
}

/** A door (or the door tool's opening) one square wide, in the wall under the pointer. */
function doorAt(p) {
  const w = wallAt(c.design, p.x, p.y, 0.4);
  if (!w || w.arc || (w.x1 !== w.x2 && w.y1 !== w.y2)) return status('Click on a straight wall to put a door in it (or drag along a wall).');
  const piece = w.y1 === w.y2 ? { x1: Math.floor(p.x), y1: w.y1, x2: Math.floor(p.x) + 1, y2: w.y1 } : { x1: w.x1, y1: Math.floor(p.y), x2: w.x1, y2: Math.floor(p.y) + 1 };
  change(addWall(c.design, { ...piece, type: c.door, style: w.style }));
}

/** Paint under the pointer, and every square on the way from where it last was (a fast drag skips squares otherwise). */
function paintAt(p) {
  const [col, r] = square(p);
  const from = c.drag?.last ?? [col, r];
  if (c.drag) c.drag.last = [col, r];
  const steps = Math.max(Math.abs(col - from[0]), Math.abs(r - from[1]), 1);
  const seen = new Set();
  const cells = [];
  for (let i = 1; i <= steps; i += 1) {
    const x = Math.round(from[0] + ((col - from[0]) * i) / steps);
    const y = Math.round(from[1] + ((r - from[1]) * i) / steps);
    for (const cellAt of brushCells(x, y, c.brush, c.round)) {
      const k = cellAt.join();
      if (!seen.has(k)) cells.push(cellAt), seen.add(k);
    }
  }
  const ch = c.tool === 'rubber' ? EMPTY : c.floor;
  const inside = cells.filter(([x, y]) => x >= 0 && y >= 0 && x < c.design.cols && y < c.design.rows);
  if (!inside.length || inside.every(([x, y]) => c.design.floor[y][x] === ch)) return;
  c.design = paintFloor(c.design, inside, ch);
  if (c.drag) c.drag.changed = true;
  const xs = inside.map(([x]) => x);
  const ys = inside.map(([, y]) => y);
  paintRegion({ x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs) + 1, y2: Math.max(...ys) + 1 });
  redraw();
}

/** The rubber: the label, thing, stretch of wall or road under the pointer. */
function rubAt(p) {
  let next = c.design;
  const l = labelAt(next, p.x, p.y);
  const a = !l && assetAt(next, p.x, p.y);
  if (l) next = { ...next, labels: next.labels.filter((x) => x !== l) };
  else if (a) next = { ...next, assets: next.assets.filter((x) => x !== a) };
  else {
    const cut = cutWallAt(next, p.x, p.y);
    if (cut !== next) next = cut;
    else {
      const path = pathAt(next, p.x, p.y);
      if (path) next = { ...next, paths: next.paths.filter((x) => x !== path) };
    }
  }
  if (next === c.design) return;
  const pathsChanged = next.paths !== c.design.paths;
  c.design = next;
  c.drag.changed = true;
  if (pathsChanged) c.drag.paths = true;
  if (pathsChanged) refreshFloor();
  else redraw();
}

/** Fewer points for a road drawn freehand (Douglas-Peucker, `tolerance` squares). */
function simplify(pts, tolerance) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = pts[i];
    const [bx, by] = pts[j];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1;
    let far = 0;
    for (let k = i + 1; k < j; k += 1) {
      const dist = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / len;
      if (dist > far) [far, best] = [dist, k];
    }
    if (far > tolerance && best > 0) {
      keep[best] = true;
      stack.push([i, best], [best, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

function addPath(pts) {
  if (pts.length < 2) return;
  const path = { id: newDesignId(), kind: c.pathKind, w: c.pathWidth, pts };
  change(normalizeDesign({ ...c.design, paths: [...c.design.paths, path] }));
}

function finishPath() {
  if (!c?.pathDraft) return;
  // A double-click to finish also clicked the last point again.
  const pts = c.pathDraft.filter((q, i, all) => !i || Math.hypot(q[0] - all[i - 1][0], q[1] - all[i - 1][1]) > 0.05);
  c.pathDraft = null;
  renderPanel(c, act);
  if (pts.length >= 2) addPath(pts);
  else redraw();
}

function placeLabel(p) {
  const text = c.label.text.trim();
  if (!text) {
    status('Type the words for the label first (in the panel).');
    $('#creator-label-text')?.focus();
    return;
  }
  const label = { id: newDesignId(), ...c.label, text, x: round2(p.x), y: round2(p.y), rot: 0 };
  change(normalizeDesign({ ...c.design, labels: [...c.design.labels, label] }));
}

/** The thing the place tool would put down at p (null if none is picked). */
function placing(p, free) {
  const def = ASSETS[c.asset];
  const own = c.assets.find((x) => `u:${x.id}` === c.asset);
  if (!def && !own) return null;
  // Your own pictures start a square across the shorter side, keeping their shape.
  const ratio = own ? own.height / own.width : 1;
  let w = def ? def.w : ratio <= 1 ? 1 / Math.max(ratio, 0.25) : 1;
  let ht = def ? def.h : ratio <= 1 ? 1 : Math.min(ratio, 4);
  let rot = c.placeRot;
  if (c.vary) {
    // A little different each time, but the same while the pointer stays put.
    const k = 0.85 + (((Math.floor(p.x * 7) * 31 + Math.floor(p.y * 7) * 17) % 30) / 100);
    w *= k;
    ht *= k;
    rot += (Math.floor(p.x * 13) * 47 + Math.floor(p.y * 11) * 29) % 360;
  }
  const size = { w: Math.round(w * 4) / 4, h: Math.round(ht * 4) / 4 };
  const quarter = rot % 180 !== 0 && rot % 90 === 0;
  const sw = quarter ? size.h : size.w;
  const sh = quarter ? size.w : size.h;
  return { id: newDesignId(), a: c.asset, x: snapCentre(p.x, sw, free || c.vary), y: snapCentre(p.y, sh, free || c.vary), ...size, rot, blocks: def ? def.blocks : own.blocks };
}

function scatter(r) {
  if (!ASSETS[c.asset]) return status('Pick a built-in thing to scatter (in Things).');
  const next = scatterAssets(c.design, c.asset, r, { seed: Math.floor(Math.random() * 1e6), spacing: c.spacing });
  if (next.assets.length === c.design.assets.length) return status('There was no room to scatter any.');
  change(next);
}

// ---------- areas: copy, cut and paste, stamps ----------

function copy(cut = false) {
  if (c.area) {
    const clip = copyArea(c.design, c.area);
    c.copied = clip;
    if (cut) change(normalizeDesign(clearArea(c.design, c.area)));
    status(cut ? 'Cut. Ctrl+V (or Put down) to put it somewhere else.' : 'Copied. Ctrl+V (or Put down) to put it down.');
  } else if (c.selected.length) {
    c.copied = pickedClip();
    if (cut) removePicked();
    status(cut ? 'Cut.' : 'Copied.');
  } else return status('Pick something, or an area (the Area tool), to copy first.');
  renderPanel(c, act);
}

function paste() {
  if (!c.copied) return status('Copy something first.');
  startPaste(c.copied);
}

function clearAreaNow() {
  if (!c.area) return;
  change(normalizeDesign(clearArea(c.design, c.area)));
}

async function keepAsStamp() {
  const clip = c.area ? copyArea(c.design, c.area) : pickedClip();
  if (!clip) return status('Pick something, or an area (the Area tool), to keep as a stamp.');
  const name = prompt('Name the stamp (it is kept for all your maps):', 'My stamp');
  if (!name?.trim()) return;
  const stamp = await state.guarded(() => api('POST', `/campaigns/${state.campaignId}/map-stamps`, { name: name.trim(), clip }));
  if (!stamp || !c) return;
  c.stamps.own = [...c.stamps.own, stamp].sort((p, q) => p.name.localeCompare(q.name));
  c.tab = 'stamps';
  status(`Kept "${stamp.name}" with your stamps.`);
  renderPanel(c, act);
}

async function renameStamp(stamp) {
  const name = prompt('A new name for the stamp:', stamp.name);
  if (!name?.trim() || name.trim() === stamp.name) return;
  const saved = await state.guarded(() => api('PATCH', `/campaigns/${state.campaignId}/map-stamps/${stamp.id}`, { name: name.trim() }));
  if (!saved || !c) return;
  c.stamps.own = c.stamps.own.map((s) => (s.id === saved.id ? saved : s)).sort((p, q) => p.name.localeCompare(q.name));
  renderPanel(c, act);
}

async function removeStamp(stamp) {
  if (!confirm(`Take "${stamp.name}" off your stamps? (It stays in the archive.)`)) return;
  const ok = await state.guarded(() => api('DELETE', `/campaigns/${state.campaignId}/map-stamps/${stamp.id}`));
  if (!ok || !c) return;
  c.stamps.own = c.stamps.own.filter((s) => s.id !== stamp.id);
  renderPanel(c, act);
}

async function loadStamps() {
  const { builtIn, stamps } = await api('GET', `/campaigns/${state.campaignId}/map-stamps`);
  if (!c) return;
  c.stamps = { builtIn, own: stamps };
  if (!c.starting) renderPanel(c, act);
}

// ---------- the keyboard ----------

const SHORTCUTS = Object.fromEntries(TOOLS.map(([key, , k]) => [k.toLowerCase(), key]));

function keydown(e) {
  if (!c || c.starting) return;
  if (e.target.closest?.('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && k === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (ctrl && k === 'y') {
    e.preventDefault();
    redo();
  } else if (ctrl && (k === 'c' || k === 'x')) {
    e.preventDefault();
    copy(k === 'x');
  } else if (ctrl && k === 'v') {
    e.preventDefault();
    paste();
  } else if (ctrl && k === 'd') {
    e.preventDefault();
    duplicatePicked();
  } else if (ctrl) {
    // the browser's own
  } else if (e.key === ' ') {
    c.space = true;
    e.preventDefault();
  } else if (e.key === 'Escape') {
    // the dialog's cancel handles it
  } else if (e.key === 'Enter') {
    if (c.pathDraft) {
      e.preventDefault();
      finishPath();
    }
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && c.selected.length) {
    e.preventDefault();
    removePicked();
  } else if (e.key === 'Delete' && c.area) {
    e.preventDefault();
    clearAreaNow();
  } else if (e.key.startsWith('Arrow') && c.selected.length) {
    e.preventDefault();
    const step = e.shiftKey ? 1 : 0.25;
    nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
  } else if (k === 'r' && c.tool === 'paste' && c.clip) {
    c.clip.rot = (c.clip.rot + (e.shiftKey ? 270 : 90)) % 360;
    redraw();
  } else if (k === 'f' && c.tool === 'paste' && c.clip) {
    c.clip.flip = !c.clip.flip;
    redraw();
  } else if (k === 'r' && c.selected.length) {
    turnPicked(e.shiftKey ? -45 : 45);
  } else if (k === 'f' && c.selected.length) {
    flipPicked();
  } else if (k === 'r' && c.tool === 'place') {
    c.placeRot = (c.placeRot + (e.shiftKey ? 315 : 45)) % 360;
    renderPanel(c, act);
    redraw();
  } else if (e.key === '[' || e.key === ']') {
    const sizes = [1, 2, 3, 5, 7, 9];
    const i = Math.max(0, sizes.indexOf(c.brush));
    c.brush = sizes[Math.min(sizes.length - 1, Math.max(0, i + (e.key === ']' ? 1 : -1)))];
    renderPanel(c, act);
  } else if (e.key === '+' || e.key === '=') zoomBy(1.25);
  else if (e.key === '-') zoomBy(1 / 1.25);
  else if (SHORTCUTS[k]) setTool(SHORTCUTS[k]);
}

// ---------- the DM's own assets ----------

async function loadAssets() {
  const { assets } = await api('GET', `/campaigns/${state.campaignId}/map-assets`);
  if (!c) return;
  c.assets = assets;
  // Pictures used on this map that were taken off the list still draw.
  const refs = new Set([...assets.map((x) => `u:${x.id}`), ...c.design.assets.map((a) => a.a).filter((a) => a.startsWith('u:'))]);
  if (!c.starting) renderPanel(c, act);
  await Promise.all([...refs].map(loadPicture));
}

async function loadPicture(ref) {
  if (!c || c.images.has(ref)) return;
  try {
    const url = await fileUrl(`/campaigns/${state.campaignId}/map-assets/${ref.slice(2)}/picture`);
    const img = new Image();
    img.src = url;
    await img.decode?.().catch(() => {});
    if (!c) return;
    c.images.set(ref, img);
    if (!c.starting) {
      renderPanel(c, act);
      redraw();
    }
  } catch (err) {
    if (err instanceof LoggedOut) throw err;
  }
}

async function addAsset(file) {
  if (file.size > 10 * 1024 * 1024) return status('That picture is too big (10 MB at most).');
  status('Uploading…');
  const data = await readBase64(file);
  const x = await state.guarded(() => api('POST', `/campaigns/${state.campaignId}/map-assets`, { filename: file.name, data }));
  if (!x || !c) return;
  c.assets = [...c.assets, x].sort((p, q) => p.name.localeCompare(q.name));
  c.asset = `u:${x.id}`;
  c.tool = 'place';
  status(`Added ${x.name}. Click the map to place it.`);
  renderPanel(c, act);
  await loadPicture(c.asset);
}

// ---------- starting, saving and closing ----------

function status(text) {
  const el = $('#creator-status');
  if (el) el.textContent = text;
}

/** Start working on a design (from the start screen: blank, made by the server, or the AI's draft). */
function begin(design, name = null) {
  c.design = normalizeDesign(design);
  c.starting = false;
  c.undo = [];
  c.redo = [];
  c.tool = 'select';
  if (name) {
    c.name = name;
    keepDraft();
  } else c.saved = JSON.stringify(c.design); // a blank map: nothing to lose until something is drawn
  build();
  status(name ? `Here's ${name}. Change anything you like, then save it.` : 'Draw rooms, paint floors and place things. Save when you are happy with it.');
}

/** Send the design to the server to draw; `stay` keeps the creator open (to go to another floor). */
async function save({ stay = false } = {}) {
  const name = c.name.trim();
  if (!name) return status('Give the map a name first.');
  if (!c.design.floor.some((l) => l.replace(new RegExp(`\\${EMPTY}`, 'g'), ''))) return status('Paint some floor first (or draw a room).');
  const button = $('#creator-save');
  if (button) button.disabled = true;
  status('Drawing the map…');
  const working = c;
  try {
    const design = c.design;
    const map = await state.guarded(() => (c.map
      ? api('PUT', `${base()}/${c.map.id}/design`, { design })
      : api('POST', `${base()}/design`, { name, design })));
    if (!map) return null;
    if (c.map && name !== c.map.name) Object.assign(map, await api('PATCH', `${base()}/${c.map.id}`, { name }));
    forgetDraft();
    c.saved = JSON.stringify(design);
    c.map = map;
    onMap(map);
    if (stay) {
      status('Saved.');
      return map;
    }
    $('#map-creator').close();
    c = null;
    await show(map);
    return map;
  } finally {
    if (button) button.disabled = false;
    if (c === working && !stay) status('');
  }
}

const unsaved = () => c && !c.starting && JSON.stringify(c.design) !== c.saved;

function close() {
  if (unsaved() && !confirm('Close without saving? Your changes to this map will be lost.')) return;
  if (c) {
    clearTimeout(c.autosave);
    if (unsaved()) forgetDraft();
    cancelAnimationFrame?.(c.frame);
  }
  $('#map-creator').close();
  c = null;
}

/** Open another map (another floor of the building) in the creator, saving this one first if asked. */
async function switchTo(map) {
  if (unsaved()) {
    const keep = confirm('Save your changes to this floor first?');
    if (keep && !(await save({ stay: true }))) return;
    if (!keep) forgetDraft();
  }
  await openCreator(map);
}

/** Download a saved map as a Universal VTT file, for other VTTs. */
async function exportUvtt() {
  if (!c.map) return;
  if (unsaved() && !confirm('The file is made from the map as last saved. Download it anyway?')) return;
  status('Making the file…');
  await downloadUvtt(c.map);
  status('Downloaded. Dungeondraft, Foundry (with its Universal Battlemap importer) and other VTTs can open it.');
}

/** What the panel and start screen can do. */
const act = {
  setTool, startPaste, change, select, changePicked, removePicked, turnPicked, flipPicked, duplicatePicked, orderPicked, copy, paste,
  clearArea: clearAreaNow, keepAsStamp, renameStamp, removeStamp, fillAll, undo, redo, begin, save, switchTo, exportUvtt, status, addAsset,
  redraw: () => redraw(), refresh: () => refreshFloor(), panel: () => c && !c.starting && renderPanel(c, act), props: () => c && renderProps(c, act),
  finishPath, current: () => c, findPicked,
};

/** For tests: the design being made. */
export const creatorDesign = () => c?.design ?? null;
