/**
 * The DM's map creator (SPEC §6.6 "Making a map"): a grid the DM paints
 * floors on, draws walls, fences and doors (or whole rooms) on, and puts
 * assets on (built-in ones, or their own pictures), then saves as a map
 * everyone can play on. The preview is drawn with the same code the server
 * draws the map's picture with (./shared/map-design.js); the server does the
 * real drawing and turns walls, doors, blocking assets and lights into the
 * map's own.
 */
import {
  ASSETS, BLOCKS, DESIGN_MAX, DESIGN_MIN, EMPTY, FLOORS, addRoom, addWall, assetAt, brushCells, drawBuiltIn,
  drawDesign, drawFloor, drawFloorCell, emptyDesign, eraseWallAt, fillFloor, newDesignId, normalizeDesign, paintFloor, resizeDesign,
} from './shared/map-design.js';
import { onMap, show } from './map.js';
import { api, fileUrl, h, readBase64, LoggedOut } from './api.js';
import { base, report, state } from './map-state.js';

const $ = (sel) => document.querySelector(sel);
const BASE_CELL = 28; // preview pixels per square at zoom 1
const BLOCK_NAMES = { none: 'Nothing', low: 'Movement (an obstacle)', wall: 'Sight and movement (a wall)' };
const TOOLS = [
  ['floor', 'Paint', 'Drag to paint the floor'],
  ['fill', 'Fill', 'Click to fill an area of one floor with another'],
  ['erase-floor', 'Rub out floor', 'Drag to clear the floor back to nothing'],
  ['room', 'Room', 'Drag a rectangle: a room floored and walled round'],
  ['wall', 'Wall', 'Drag from corner to corner to draw a wall (hold Shift for half squares)'],
  ['low', 'Fence', 'A fence or low wall: blocks movement, not sight'],
  ['door', 'Door', 'Drag along a wall to put a door in it'],
  ['erase-wall', 'Rub out wall', 'Click a wall, fence or door to remove it'],
  ['asset', 'Place', 'Click to place the asset picked below'],
  ['select', 'Pick', 'Click an asset to move, turn, resize or remove it'],
];

/** Everything the open creator works on. */
let c = null;

/** Open the creator: a new map, or `map` (one made in the creator) to change it. */
export async function openCreator(map = null) {
  const design = map ? normalizeDesign((await api('GET', `${base()}/${map.id}/design`)).design) : emptyDesign(30, 20);
  c = {
    map,
    design,
    saved: JSON.stringify(design),
    name: map?.name ?? 'New map',
    tool: 'room',
    floor: map ? 'g' : 's',
    brush: 1,
    style: 'stone',
    asset: 'table',
    selected: null,
    zoom: 1,
    undo: [],
    drag: null, // { kind, a, b, ... } while the pointer is down
    images: new Map(), // 'u:<id>' -> loaded picture
    assets: [], // the DM's own
    floorCanvas: null,
    open: new Set(['Outdoors', 'Furniture', 'Dungeon', 'own']), // asset groups shown open
  };
  build();
  loadAssets().catch(report);
  $('#map-creator').showModal();
}

const cell = () => Math.round(BASE_CELL * c.zoom);

function build() {
  const dialog = $('#map-creator');
  const name = h('input', { id: 'creator-name', value: c.name, maxLength: 100, 'aria-label': 'Map name', oninput: (e) => { c.name = e.target.value; } });
  const cols = h('input', { id: 'creator-cols', type: 'number', min: String(DESIGN_MIN), max: String(DESIGN_MAX), value: c.design.cols, 'aria-label': 'Squares across' });
  const rows = h('input', { id: 'creator-rows', type: 'number', min: String(DESIGN_MIN), max: String(DESIGN_MAX), value: c.design.rows, 'aria-label': 'Squares down' });
  const canvas = h('canvas', { id: 'creator-canvas', class: 'creator-canvas' });
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { c.drag = null; redraw(); });
  dialog.replaceChildren(
    h('div', { class: 'creator' },
      h('header', { class: 'creator-head' },
        h('h2', {}, c.map ? 'Change map' : 'Make a map'),
        name,
        h('span', { class: 'creator-size' }, cols, '×', rows, h('button', { type: 'button', class: 'ghost', id: 'creator-resize', onclick: () => resize(cols.value, rows.value) }, 'Resize')),
        h('span', { class: 'muted small' }, '1 square = 5 ft'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', id: 'creator-undo', onclick: undo, title: 'Undo (Ctrl+Z)' }, 'Undo'),
        h('button', { type: 'button', class: 'ghost', onclick: () => zoom(1 / 1.25), 'aria-label': 'Zoom out' }, '−'),
        h('button', { type: 'button', class: 'ghost', onclick: () => zoom(1.25), 'aria-label': 'Zoom in' }, '+'),
        h('button', { type: 'button', class: 'ghost', onclick: close }, 'Close'),
        h('button', { type: 'button', class: 'primary', id: 'creator-save', onclick: () => save().catch(report) }, c.map ? 'Save changes' : 'Save map'),
      ),
      h('div', { class: 'creator-body' },
        h('aside', { class: 'creator-tools', id: 'creator-tools' }),
        h('div', { class: 'creator-view' }, canvas),
      ),
      h('p', { id: 'creator-status', class: 'muted small creator-status', role: 'status' }),
    ),
  );
  dialog.onkeydown = keydown;
  dialog.oncancel = (e) => {
    e.preventDefault();
    close();
  };
  renderTools();
  refreshFloor();
}

// ---------- the tools panel ----------

function renderTools() {
  const panel = $('#creator-tools');
  const toolButtons = TOOLS.map(([key, label, title]) => h('button', {
    type: 'button', class: 'ghost', 'data-creator-tool': key, title, 'aria-pressed': String(c.tool === key),
    onclick: () => { c.tool = key; if (key !== 'select') c.selected = null; renderTools(); redraw(); },
  }, label));
  const floors = Object.entries(FLOORS).map(([key, f]) => h('button', {
    type: 'button', class: 'creator-swatch', 'data-floor': key, title: f.name, 'aria-label': f.name, 'aria-pressed': String(c.floor === key),
    style: `background:${f.base}`, onclick: () => { c.floor = key; if (!['floor', 'fill', 'room'].includes(c.tool)) c.tool = 'floor'; renderTools(); },
  }));
  const brush = h('select', { 'aria-label': 'Brush size', onchange: (e) => { c.brush = Number(e.target.value); } },
    ...[1, 2, 3, 5].map((n) => new Option(`${n} × ${n}`, String(n), false, c.brush === n)));
  const style = h('select', { 'aria-label': 'Wall look', onchange: (e) => { c.style = e.target.value; } },
    new Option('Stone walls', 'stone', false, c.style === 'stone'), new Option('Wooden walls', 'wood', false, c.style === 'wood'));
  const groups = {};
  for (const [key, a] of Object.entries(ASSETS)) (groups[a.group] ??= []).push([key, a.name]);
  const assetButton = (key, label, picture = null) => {
    const thumb = h('canvas', { width: 36, height: 36, class: 'creator-thumb' });
    const ctx = thumb.getContext('2d');
    if (ctx) {
      if (ASSETS[key]) {
        const a = ASSETS[key];
        const k = 30 / Math.max(a.w, a.h);
        ctx.translate(18, 18);
        drawBuiltIn(ctx, key, a.w * k, a.h * k);
      } else if (picture) {
        const k = 32 / Math.max(picture.naturalWidth || picture.width || 1, picture.naturalHeight || picture.height || 1);
        const w = (picture.naturalWidth || picture.width || 32) * k;
        const ht = (picture.naturalHeight || picture.height || 32) * k;
        ctx.drawImage(picture, 18 - w / 2, 18 - ht / 2, w, ht);
      }
    }
    return h('button', {
      type: 'button', class: 'ghost creator-asset', 'data-asset': key, title: label, 'aria-pressed': String(c.asset === key),
      onclick: () => { c.asset = key; c.tool = 'asset'; c.selected = null; renderTools(); redraw(); },
    }, thumb, h('span', {}, label));
  };
  const upload = h('input', { type: 'file', id: 'creator-upload', accept: 'image/png,image/webp,image/jpeg,image/gif', hidden: true, onchange: (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) addAsset(file).catch(report);
  } });
  // A group of assets, staying open or shut as the DM left it while the panel is drawn again.
  const folder = (key, ...rest) => {
    const attrs = rest[0] instanceof Node ? {} : rest.shift();
    const el = h('details', { ...attrs, open: c.open.has(key) }, ...rest);
    el.addEventListener('toggle', () => (el.open ? c.open.add(key) : c.open.delete(key)));
    return el;
  };
  panel.replaceChildren(
    h('h3', {}, 'Tools'),
    h('div', { class: 'creator-grid' }, toolButtons),
    h('h3', {}, 'Floor'),
    h('div', { class: 'creator-swatches' }, floors),
    h('div', { class: 'creator-row' }, brush, h('button', { type: 'button', class: 'ghost', id: 'creator-fill-all', onclick: fillAll, title: 'Cover the whole map with this floor' }, 'Fill all')),
    h('h3', {}, 'Walls'),
    style,
    h('h3', {}, 'Assets'),
    ...Object.entries(groups).map(([group, list]) => folder(group, h('summary', {}, group), h('div', { class: 'creator-assets' }, list.map(([k, n]) => assetButton(k, n))))),
    folder('own', { id: 'creator-own' }, h('summary', {}, 'Your assets'),
      h('div', { class: 'creator-assets' }, c.assets.map((x) => assetButton(`u:${x.id}`, x.name, c.images.get(`u:${x.id}`)))),
      h('p', { class: 'muted small' }, 'Your own pictures, seen from above. A PNG with a see-through background looks best.'),
      h('button', { type: 'button', class: 'ghost', onclick: () => upload.click() }, 'Add a picture…'),
      upload,
    ),
    selectedControls(),
  );
}

/** The bar for the picked asset: turn, resize, what it blocks, its light, remove. */
function selectedControls() {
  const a = c.design.assets.find((x) => x.id === c.selected);
  if (!a) return h('p', { class: 'muted small' }, 'Pick an asset (the Pick tool) to move, turn or resize it.');
  const def = ASSETS[a.a];
  const own = c.assets.find((x) => `u:${x.id}` === a.a);
  const change = (fn) => {
    remember();
    c.design = normalizeDesign({ ...c.design, assets: c.design.assets.map((x) => (x.id === a.id ? fn({ ...x }) : x)) });
    renderTools();
    redraw();
  };
  const blocks = h('select', { id: 'creator-blocks', 'aria-label': 'Blocks', onchange: (e) => change((x) => ({ ...x, blocks: e.target.value })) },
    ...BLOCKS.map((b) => new Option(BLOCK_NAMES[b], b, false, a.blocks === b)));
  const scale = (k) => change((x) => ({ ...x, w: Math.max(0.25, Math.round(x.w * k * 4) / 4), h: Math.max(0.25, Math.round(x.h * k * 4) / 4) }));
  return h('div', { class: 'creator-selected', id: 'creator-selected' },
    h('h3', {}, def?.name ?? own?.name ?? 'Asset'),
    h('div', { class: 'creator-row' },
      h('button', { type: 'button', class: 'ghost', onclick: () => change((x) => ({ ...x, rot: x.rot - 45 })), title: 'Turn left' }, '⟲ 45°'),
      h('button', { type: 'button', class: 'ghost', onclick: () => change((x) => ({ ...x, rot: x.rot + 45 })), title: 'Turn right (R)' }, '⟳ 45°'),
      h('button', { type: 'button', class: 'ghost', onclick: () => scale(1 / 1.25), 'aria-label': 'Smaller' }, 'Smaller'),
      h('button', { type: 'button', class: 'ghost', onclick: () => scale(1.25), 'aria-label': 'Bigger' }, 'Bigger'),
    ),
    h('span', { class: 'muted small' }, `${a.w} × ${a.h} squares`),
    h('label', { class: 'map-field' }, h('span', {}, 'Blocks'), blocks),
    def?.light ? h('label', { class: 'map-check' }, h('input', { type: 'checkbox', checked: a.light, onchange: (e) => change((x) => ({ ...x, light: e.target.checked })) }), ` Gives light (${def.light.bright} ft bright, ${def.light.dim} ft dim)`) : null,
    h('div', { class: 'creator-row' },
      h('button', { type: 'button', class: 'ghost', onclick: () => duplicate(a) }, 'Copy'),
      h('button', { type: 'button', class: 'ghost danger', id: 'creator-remove', onclick: () => removeSelected() }, 'Remove'),
    ),
  );
}

// ---------- changes ----------

function remember() {
  c.undo.push(JSON.stringify(c.design));
  if (c.undo.length > 60) c.undo.shift();
}

function undo() {
  const last = c.undo.pop();
  if (!last) return status('Nothing to undo.');
  const before = c.design;
  c.design = JSON.parse(last);
  if (!c.design.assets.some((a) => a.id === c.selected)) c.selected = null;
  if (before.cols !== c.design.cols || before.rows !== c.design.rows) syncSize();
  refreshFloor();
  renderTools();
}

function resize(cols, rows) {
  const next = resizeDesign(c.design, Number(cols), Number(rows));
  if (next.cols === c.design.cols && next.rows === c.design.rows) return;
  if ((next.cols < c.design.cols || next.rows < c.design.rows) && !confirm('Make the map smaller? What is past the new edge is cut off.')) return syncSize();
  remember();
  c.design = next;
  syncSize();
  refreshFloor();
}

function syncSize() {
  $('#creator-cols').value = c.design.cols;
  $('#creator-rows').value = c.design.rows;
}

function fillAll() {
  remember();
  const cells = [];
  for (let r = 0; r < c.design.rows; r += 1) for (let col = 0; col < c.design.cols; col += 1) cells.push([col, r]);
  c.design = paintFloor(c.design, cells, c.floor);
  refreshFloor();
}

function duplicate(a) {
  remember();
  const copy = { ...a, id: newDesignId(), x: Math.min(c.design.cols, a.x + 1), y: Math.min(c.design.rows, a.y + 1) };
  c.design = normalizeDesign({ ...c.design, assets: [...c.design.assets, copy] });
  c.selected = copy.id;
  renderTools();
  redraw();
}

function removeSelected() {
  if (!c.selected) return;
  remember();
  c.design = { ...c.design, assets: c.design.assets.filter((x) => x.id !== c.selected) };
  c.selected = null;
  renderTools();
  redraw();
}

function zoom(k) {
  c.zoom = Math.min(3, Math.max(0.4, c.zoom * k));
  refreshFloor();
}

// ---------- drawing ----------

/** Draw the whole floor again (after a size, zoom or undo change), then everything on it. */
function refreshFloor() {
  const px = cell();
  const fc = document.createElement('canvas');
  fc.width = c.design.cols * px;
  fc.height = c.design.rows * px;
  const ctx = fc.getContext('2d');
  if (ctx) drawFloor(ctx, c.design, px);
  c.floorCanvas = fc;
  const canvas = $('#creator-canvas');
  canvas.width = fc.width;
  canvas.height = fc.height;
  redraw();
}

/** Just these squares of the floor (painting). */
function paintCells(cells) {
  const px = cell();
  const ctx = c.floorCanvas.getContext('2d');
  if (ctx) for (const [col, r] of cells) if (c.design.floor[r]?.[col] != null) drawFloorCell(ctx, c.design.floor[r][col], col, r, px);
}

function redraw() {
  const canvas = $('#creator-canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const px = cell();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(c.floorCanvas, 0, 0);
  drawDesign(ctx, c.design, { cell: px, images: c.images, floor: false });
  // The grid, faintly, so squares can be counted.
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= c.design.cols; x += 1) { ctx.moveTo(x * px + 0.5, 0); ctx.lineTo(x * px + 0.5, canvas.height); }
  for (let y = 0; y <= c.design.rows; y += 1) { ctx.moveTo(0, y * px + 0.5); ctx.lineTo(canvas.width, y * px + 0.5); }
  ctx.stroke();
  // Doors, as the map will show them shut.
  ctx.strokeStyle = '#c58b3a';
  ctx.lineWidth = Math.max(3, px * 0.14);
  for (const w of c.design.walls.filter((x) => x.type === 'door')) {
    ctx.beginPath();
    ctx.moveTo(w.x1 * px, w.y1 * px);
    ctx.lineTo(w.x2 * px, w.y2 * px);
    ctx.stroke();
  }
  // What's being drawn now.
  const d = c.drag;
  if (d && (d.kind === 'line' || d.kind === 'room') && d.b) {
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = 2;
    ctx.setLineDash?.([6, 4]);
    if (d.kind === 'line') {
      ctx.beginPath();
      ctx.moveTo(d.a.x * px, d.a.y * px);
      ctx.lineTo(d.b.x * px, d.b.y * px);
      ctx.stroke();
    } else {
      ctx.strokeRect(Math.min(d.a.x, d.b.x) * px, Math.min(d.a.y, d.b.y) * px, Math.abs(d.b.x - d.a.x) * px, Math.abs(d.b.y - d.a.y) * px);
    }
    ctx.setLineDash?.([]);
  }
  const sel = c.design.assets.find((x) => x.id === c.selected);
  if (sel) {
    ctx.save();
    ctx.translate(sel.x * px, sel.y * px);
    ctx.rotate((sel.rot * Math.PI) / 180);
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = 2;
    ctx.strokeRect((-sel.w / 2) * px - 2, (-sel.h / 2) * px - 2, sel.w * px + 4, sel.h * px + 4);
    ctx.restore();
  }
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

function down(e) {
  if (e.button !== 0) return;
  e.currentTarget.setPointerCapture?.(e.pointerId);
  const p = at(e);
  const t = c.tool;
  if (t === 'floor' || t === 'erase-floor') {
    remember();
    c.drag = { kind: 'paint' };
    paintAt(p);
  } else if (t === 'fill') {
    remember();
    const [col, r] = square(p);
    c.design = fillFloor(c.design, col, r, c.floor);
    refreshFloor();
  } else if (t === 'room' || t === 'wall' || t === 'low' || t === 'door') {
    const a = snapCorner(p, t !== 'room' && e.shiftKey);
    c.drag = { kind: t === 'room' ? 'room' : 'line', a, b: a };
  } else if (t === 'erase-wall') {
    const next = eraseWallAt(c.design, p.x, p.y);
    if (next !== c.design) {
      remember();
      c.design = next;
      redraw();
    }
  } else if (t === 'asset') {
    placeAsset(p, e.shiftKey);
  } else if (t === 'select') {
    const hit = assetAt(c.design, p.x, p.y);
    c.selected = hit?.id ?? null;
    if (hit) c.drag = { kind: 'move', id: hit.id, grab: { x: p.x - hit.x, y: p.y - hit.y }, moved: false };
    renderTools();
    redraw();
  }
}

function move(e) {
  const d = c.drag;
  if (!d) return;
  const p = at(e);
  if (d.kind === 'paint') paintAt(p);
  else if (d.kind === 'line' || d.kind === 'room') {
    d.b = snapCorner(p, d.kind === 'line' && e.shiftKey);
    redraw();
  } else if (d.kind === 'move') {
    const a = c.design.assets.find((x) => x.id === d.id);
    if (!a) return;
    if (!d.moved) remember();
    d.moved = true;
    const x = Math.min(c.design.cols, Math.max(0, snapCentre(p.x - d.grab.x, a.w, e.shiftKey)));
    const y = Math.min(c.design.rows, Math.max(0, snapCentre(p.y - d.grab.y, a.h, e.shiftKey)));
    c.design = { ...c.design, assets: c.design.assets.map((x0) => (x0.id === a.id ? { ...x0, x, y } : x0)) };
    redraw();
  }
}

function up(e) {
  const d = c.drag;
  c.drag = null;
  if (!d) return;
  if (d.kind === 'line' || d.kind === 'room') {
    const b = snapCorner(at(e), d.kind === 'line' && e.shiftKey);
    remember();
    const before = c.design;
    if (d.kind === 'room') c.design = addRoom(c.design, { x1: d.a.x, y1: d.a.y, x2: b.x, y2: b.y }, c.floor, c.style);
    else c.design = addWall(c.design, { x1: d.a.x, y1: d.a.y, x2: b.x, y2: b.y, type: c.tool, style: c.style });
    if (c.design === before) c.undo.pop();
    if (d.kind === 'room') refreshFloor();
    else redraw();
  } else redraw();
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
    for (const cellAt of brushCells(x, y, c.brush)) {
      const k = cellAt.join();
      if (!seen.has(k)) cells.push(cellAt), seen.add(k);
    }
  }
  const ch = c.tool === 'erase-floor' ? EMPTY : c.floor;
  if (cells.every(([x, y]) => (c.design.floor[y]?.[x] ?? ch) === ch)) return;
  c.design = paintFloor(c.design, cells, ch);
  paintCells(cells);
  redraw();
}

function placeAsset(p, free) {
  const def = ASSETS[c.asset];
  const own = c.assets.find((x) => `u:${x.id}` === c.asset);
  if (!def && !own) return status('Pick an asset to place first.');
  // Your own pictures start a square across the shorter side, keeping their shape.
  const ratio = own ? own.height / own.width : 1;
  const w = def ? def.w : ratio <= 1 ? 1 / Math.max(ratio, 0.25) : 1;
  const ht = def ? def.h : ratio <= 1 ? 1 : Math.min(ratio, 4);
  const size = { w: Math.round(w * 4) / 4, h: Math.round(ht * 4) / 4 };
  remember();
  const a = { id: newDesignId(), a: c.asset, x: snapCentre(p.x, size.w, free), y: snapCentre(p.y, size.h, free), ...size, rot: 0, blocks: def ? def.blocks : own.blocks };
  c.design = normalizeDesign({ ...c.design, assets: [...c.design.assets, a] });
  if (!c.design.assets.some((x) => x.id === a.id)) status('That map has as many assets as it can take.');
  redraw();
}

function keydown(e) {
  if (e.target.closest?.('input, select, textarea')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && c.selected) {
    e.preventDefault();
    removeSelected();
  } else if (e.key.toLowerCase() === 'r' && c.selected) {
    const a = c.design.assets.find((x) => x.id === c.selected);
    remember();
    c.design = normalizeDesign({ ...c.design, assets: c.design.assets.map((x) => (x.id === a.id ? { ...x, rot: x.rot + 45 } : x)) });
    redraw();
  }
}

// ---------- the DM's own assets ----------

async function loadAssets() {
  const { assets } = await api('GET', `/campaigns/${state.campaignId}/map-assets`);
  c.assets = assets;
  // Pictures used on this map that were taken off the list still draw.
  const refs = new Set([...assets.map((x) => `u:${x.id}`), ...c.design.assets.map((a) => a.a).filter((a) => a.startsWith('u:'))]);
  renderTools();
  await Promise.all([...refs].map(loadPicture));
}

async function loadPicture(ref) {
  if (c.images.has(ref)) return;
  try {
    const url = await fileUrl(`/campaigns/${state.campaignId}/map-assets/${ref.slice(2)}/picture`);
    const img = new Image();
    img.src = url;
    await img.decode?.().catch(() => {});
    if (!c) return;
    c.images.set(ref, img);
    renderTools();
    redraw();
  } catch (err) {
    if (err instanceof LoggedOut) throw err;
  }
}

async function addAsset(file) {
  if (file.size > 10 * 1024 * 1024) return status('That picture is too big (10 MB at most).');
  status('Uploading…');
  const data = await readBase64(file);
  const x = await state.guarded(() => api('POST', `/campaigns/${state.campaignId}/map-assets`, { filename: file.name, data }));
  if (!x) return;
  c.assets = [...c.assets, x].sort((p, q) => p.name.localeCompare(q.name));
  c.asset = `u:${x.id}`;
  c.tool = 'asset';
  status(`Added ${x.name}. Click the map to place it.`);
  renderTools();
  await loadPicture(c.asset);
}

// ---------- saving ----------

function status(text) {
  const el = $('#creator-status');
  if (el) el.textContent = text;
}

async function save() {
  const name = c.name.trim();
  if (!name) return status('Give the map a name first.');
  if (!c.design.floor.some((l) => l.replace(new RegExp(`\\${EMPTY}`, 'g'), ''))) return status('Paint some floor first (or draw a room).');
  const button = $('#creator-save');
  button.disabled = true;
  status('Drawing the map…');
  try {
    const design = c.design;
    const map = await state.guarded(() => (c.map
      ? api('PUT', `${base()}/${c.map.id}/design`, { design })
      : api('POST', `${base()}/design`, { name, design })));
    if (!map) return;
    if (c.map && name !== c.map.name) Object.assign(map, await api('PATCH', `${base()}/${c.map.id}`, { name }));
    c.saved = JSON.stringify(design);
    onMap(map);
    $('#map-creator').close();
    c = null;
    await show(map);
  } finally {
    button.disabled = false;
    if (c) status('');
  }
}

function close() {
  if (c && JSON.stringify(c.design) !== c.saved && !confirm('Close without saving? Your changes to this map will be lost.')) return;
  $('#map-creator').close();
  c = null;
}

/** For tests: the design being made. */
export const creatorDesign = () => c?.design ?? null;
