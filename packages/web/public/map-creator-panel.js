/**
 * The map creator's panel (map-creator.js): the tools and what each one
 * uses (floors, wall styles, openings, roads, lettering), the things to
 * place (built-in and the DM's own pictures, searchable), stamps, the look,
 * the map's floors, and the box for what's picked on the map. It only shows
 * and sets choices; `act` (from map-creator.js) changes the design.
 */
import {
  ASSETS, ASSET_GROUPS, BLOCKS, FLOORS, GRID_LOOKS, LABEL_FONTS, MOODS, PATH_KINDS, WALL_STYLES, WALL_STYLE_NAMES, normalizeDesign, normalizeLook,
} from './shared/map-design.js';
import { drawBuiltIn, drawDesign, drawFloorSwatch, drawPathSwatch, drawWallSwatch } from './shared/map-art.js';
import { levelName } from './shared/map.js';
import { h } from './api.js';
import { state } from './map-state.js';
import { renderLevels } from './map-creator-start.js';

const $ = (sel) => document.querySelector(sel);

/** The tools: [key, name, shortcut key, what it does]. */
export const TOOLS = [
  ['select', 'Pick', 'V', 'Click a thing, label, road or wall to change it, and drag to move it. Drag over the floor to pick several (Shift adds to them).'],
  ['room', 'Room', 'Q', 'Drag a rectangle: a room, floored and walled all round (or only floored, if you untick its walls).'],
  ['wall', 'Wall', 'W', 'Drag from corner to corner to draw a wall or fence (hold Shift for half squares).'],
  ['door', 'Door', 'D', 'Click a wall for a door a square wide, or drag along it for a wider one. Also secret doors, windows and archways.'],
  ['curve', 'Curve', 'C', 'Drag from one end of a curved wall to the other, then move to bend it and click.'],
  ['circle', 'Round', 'O', 'Drag from the middle outwards: a round tower, room or pit.'],
  ['floor', 'Floor', 'B', 'Drag to paint the floor ([ and ] change the brush size).'],
  ['fill', 'Fill', 'G', 'Click to fill an area of one floor, up to its walls, with another.'],
  ['rubber', 'Rub out', 'E', 'Click or drag over things, labels, walls and roads to rub them out (or the floor, if you choose).'],
  ['path', 'Road', 'P', 'Drag to draw a road, river or trail freehand, or click point by point and double-click to end.'],
  ['label', 'Label', 'T', 'Click to put the words from the panel on the map.'],
  ['place', 'Place', 'A', 'Click to put down the thing picked in Things (Shift: off the grid; R turns it first).'],
  ['scatter', 'Scatter', 'K', 'Drag a rectangle to scatter the picked thing over it: a wood, a field of stones.'],
  ['area', 'Area', 'S', 'Drag a rectangle to copy, cut or clear a piece of the map, or keep it as a stamp.'],
];

const BLOCK_NAMES = { none: 'Nothing', low: 'Movement (an obstacle)', wall: 'Sight and movement (a wall)' };
const LAYER_NAMES = [[0, 'On the floor (under walls)'], [1, 'Standing'], [2, 'Overhead (over everything)']];
const OPENING_NAMES = { door: 'Door', secret: 'Secret door', window: 'Window', arch: 'Archway' };
const WALL_TYPE_CHOICES = { wall: 'Wall', low: 'Low wall or fence' };
const FLOOR_GROUPS = ['Built', 'Natural', 'Water'];

// ---------- small pictures (kept, so the panel draws quickly each time) ----------

const thumbs = new Map();
/** A small canvas drawn once by draw(ctx) and kept under `key` (moved to wherever it's shown next). */
function thumb(key, w, ht, draw) {
  let cv = thumbs.get(key);
  if (!cv) {
    cv = h('canvas', { width: w, height: ht, class: 'creator-thumb' });
    const ctx = cv.getContext('2d');
    if (ctx) {
      try {
        draw(ctx);
      } catch {
        // a sample that can't be drawn stays blank
      }
    }
    thumbs.set(key, cv);
  }
  return cv;
}

const assetThumb = (key, size = 40) => thumb(`a:${key}:${size}`, size, size, (ctx) => {
  const a = ASSETS[key];
  const k = (size - 4) / Math.max(a.w, a.h);
  ctx.translate(size / 2, size / 2);
  drawBuiltIn(ctx, key, a.w * k, a.h * k, { shadows: false });
});

function pictureThumb(picture, size = 40) {
  const cv = h('canvas', { width: size, height: size, class: 'creator-thumb' });
  const ctx = cv.getContext('2d');
  if (ctx && picture) {
    const pw = picture.naturalWidth || picture.width || 1;
    const ph = picture.naturalHeight || picture.height || 1;
    const k = (size - 4) / Math.max(pw, ph);
    ctx.drawImage(picture, (size - pw * k) / 2, (size - ph * k) / 2, pw * k, ph * k);
  }
  return cv;
}

/** A stamp's picture; its empty squares (where the map's own floor stays) as `ground`. */
const clipThumb = (key, clip, images, ground = '.') => {
  const w = 96;
  const k = Math.min(w / clip.cols, 64 / clip.rows);
  return thumb(`s:${key}`, Math.ceil(clip.cols * k), Math.ceil(clip.rows * k), (ctx) => {
    const d = normalizeDesign({ ...clip, cols: Math.max(4, clip.cols), rows: Math.max(4, clip.rows), floor: clip.floor.map((l) => l.replace(/\./g, ground)), look: { shadows: false, glow: false } });
    drawDesign(ctx, { ...d, cols: clip.cols, rows: clip.rows, floor: d.floor.slice(0, clip.rows).map((l) => l.slice(0, clip.cols)) }, { cell: k, images, look: false, labels: false });
  });
};

// ---------- the panel ----------

/** Draw the whole panel for the creator `c`. */
export function renderPanel(c, act) {
  const panel = $('#creator-tools');
  if (!panel) return;
  const scroll = panel.querySelector('.creator-tab-body')?.scrollTop ?? 0;
  const tools = TOOLS.map(([key, label, k, title]) => h('button', {
    type: 'button', class: 'ghost', 'data-creator-tool': key, title: `${title} (${k})`, 'aria-pressed': String(c.tool === key),
    onclick: () => act.setTool(key),
  }, label));
  const tabs = [['things', 'Things'], ['stamps', 'Stamps'], ['look', 'Look'], ['map', 'Map']];
  panel.replaceChildren(
    h('div', { class: 'creator-grid creator-toolgrid' }, tools),
    h('div', { class: 'creator-options', id: 'creator-options' }, ...options(c, act)),
    h('nav', { class: 'creator-tabs', role: 'tablist' }, tabs.map(([key, label]) => h('button', {
      type: 'button', role: 'tab', class: 'ghost', 'data-creator-tab': key, 'aria-selected': String(c.tab === key),
      onclick: () => { c.tab = key; renderPanel(c, act); },
    }, label))),
    h('div', { class: 'creator-tab-body' }, ...tab(c, act)),
  );
  const body = panel.querySelector('.creator-tab-body');
  if (body) body.scrollTop = scroll;
  renderProps(c, act);
}

function tab(c, act) {
  if (c.tab === 'stamps') return stampsTab(c, act);
  if (c.tab === 'look') return lookTab(c, act);
  if (c.tab === 'map') return mapTab(c, act);
  return thingsTab(c, act);
}

const heading = (text) => h('h3', {}, text);
const choice = (label, value, current, onpick, attrs = {}) => h('button', { type: 'button', class: 'ghost', 'aria-pressed': String(current === value), onclick: () => onpick(value), ...attrs }, label);
const check = (label, checked, onchange, attrs = {}) => h('label', { class: 'map-check' }, h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked), ...attrs }), ` ${label}`);
const field = (label, input) => h('label', { class: 'map-field' }, h('span', {}, label), input);

/** The floors, by group, as samples to pick from. */
function floorPalette(c, act, { tool = null } = {}) {
  return FLOOR_GROUPS.map((g) => h('div', { class: 'creator-swatches', 'aria-label': `${g} floors` },
    Object.entries(FLOORS).filter(([, f]) => f.group === g).map(([key, f]) => h('button', {
      type: 'button', class: 'creator-swatch', 'data-floor': key, title: `${f.name}${f.difficult ? ' (difficult terrain)' : ''}`, 'aria-label': f.name, 'aria-pressed': String(c.floor === key),
      onclick: () => {
        c.floor = key;
        if (tool && c.tool !== tool && !['room', 'fill', 'circle', 'floor'].includes(c.tool)) act.setTool(tool);
        else act.panel();
      },
    }, thumb(`f:${key}`, 28, 28, (ctx) => drawFloorSwatch(ctx, key, 28))))));
}

function wallStyles(c, act, type = 'wall') {
  return h('div', { class: 'creator-styles' }, WALL_STYLES.map((s) => h('button', {
    type: 'button', class: 'ghost creator-style', 'data-wall-style': s, title: WALL_STYLE_NAMES[s], 'aria-pressed': String(c.wallStyle === s),
    onclick: () => { c.wallStyle = s; act.panel(); },
  }, thumb(`w:${s}:${type}`, 56, 22, (ctx) => drawWallSwatch(ctx, s, type, 56, 22)), h('span', {}, WALL_STYLE_NAMES[s]))));
}

/** What the current tool uses. */
function options(c, act) {
  const t = c.tool;
  const name = TOOLS.find((x) => x[0] === t)?.[1];
  const sizes = h('select', { id: 'creator-brush', 'aria-label': 'Brush size', onchange: (e) => { c.brush = Number(e.target.value); } },
    ...[1, 2, 3, 5, 7, 9].map((n) => new Option(`${n} × ${n}`, String(n), false, c.brush === n)));
  const fillAll = h('button', { type: 'button', class: 'ghost', id: 'creator-fill-all', onclick: () => act.fillAll(), title: 'Cover the whole map with this floor' }, 'Fill all');
  if (t === 'select') {
    return [heading('Pick'), h('p', { class: 'muted small' }, 'Click to pick; drag to move (Shift: off the grid). R turns, F flips, arrow keys nudge, Delete removes, Ctrl+D copies.')];
  }
  if (t === 'room') {
    return [
      heading('Room floor'),
      ...floorPalette(c, act),
      heading('Walls'),
      check('Walls all round', c.roomWalls, (v) => { c.roomWalls = v; act.panel(); }, { id: 'creator-room-walls' }),
      c.roomWalls ? wallStyles(c, act) : h('p', { class: 'muted small' }, 'Only the floor: a patch of another floor inside a room or out in the open.'),
    ];
  }
  if (t === 'wall' || t === 'curve' || t === 'circle') {
    return [
      heading(name),
      h('div', { class: 'creator-row' }, Object.entries(WALL_TYPE_CHOICES).map(([k, label]) => choice(label, k, c.wallType, (v) => { c.wallType = v; act.panel(); }, { 'data-wall-type': k }))),
      wallStyles(c, act, c.wallType),
      ...(t === 'circle' ? [check('Floor inside', c.circleFloor, (v) => { c.circleFloor = v; act.panel(); }, { id: 'creator-circle-floor' }), ...(c.circleFloor ? floorPalette(c, act) : [])] : []),
    ];
  }
  if (t === 'door') {
    return [
      heading('Opening'),
      h('div', { class: 'creator-grid' }, Object.entries(OPENING_NAMES).map(([k, label]) => choice(label, k, c.door, (v) => { c.door = v; act.panel(); }, { 'data-door-type': k }))),
      h('p', { class: 'muted small' }, c.door === 'secret' ? 'Looks like wall to players until you reveal it on the map, or open it.' : c.door === 'window' ? 'Players see through it, but nobody walks through it.' : c.door === 'arch' ? 'An open doorway with nothing to shut.' : 'Open and shut on the map; you can lock it there too.'),
      heading('Its frame'),
      wallStyles(c, act, c.door),
    ];
  }
  if (t === 'floor') {
    return [
      heading('Floor'),
      h('p', { class: 'muted small' }, 'Pick a floor and paint, then pick another: mix as many as you like (stone inside, grass outside, a dirt path, a pond).'),
      ...floorPalette(c, act, { tool: 'floor' }),
      h('div', { class: 'creator-row' }, choice('Brush', 'brush', c.floorShape, (v) => { c.floorShape = v; act.panel(); }, { 'data-floor-shape': 'brush' }), choice('Rectangle', 'rect', c.floorShape, (v) => { c.floorShape = v; act.panel(); }, { 'data-floor-shape': 'rect' })),
      c.floorShape === 'brush' ? h('div', { class: 'creator-row' }, sizes, check('Round', c.round, (v) => { c.round = v; })) : null,
      fillAll,
    ];
  }
  if (t === 'fill') return [heading('Fill with'), ...floorPalette(c, act, { tool: 'fill' }), fillAll];
  if (t === 'rubber') {
    return [
      heading('Rub out'),
      h('div', { class: 'creator-row' }, choice('Things and walls', 'things', c.rubber, (v) => { c.rubber = v; act.panel(); }, { 'data-rubber': 'things' }), choice('Floor', 'floor', c.rubber, (v) => { c.rubber = v; act.panel(); }, { 'data-rubber': 'floor' })),
      c.rubber === 'floor' ? h('div', { class: 'creator-row' }, sizes, check('Round', c.round, (v) => { c.round = v; })) : h('p', { class: 'muted small' }, 'A long straight wall is rubbed out a square at a time.'),
    ];
  }
  if (t === 'path') {
    const width = h('input', { type: 'range', id: 'creator-path-width', min: '0.2', max: '6', step: '0.1', value: String(c.pathWidth), 'aria-label': 'Width', oninput: (e) => { c.pathWidth = Number(e.target.value); widthText.textContent = `${c.pathWidth} squares wide`; } });
    const widthText = h('span', { class: 'muted small' }, `${c.pathWidth} squares wide`);
    return [
      heading('Road or river'),
      h('div', { class: 'creator-styles' }, Object.entries(PATH_KINDS).map(([k, p]) => h('button', {
        type: 'button', class: 'ghost creator-style', 'data-path-kind': k, title: `${p.name}${p.difficult ? ' (difficult terrain)' : ''}`, 'aria-pressed': String(c.pathKind === k),
        onclick: () => { c.pathKind = k; c.pathWidth = p.w; act.panel(); },
      }, thumb(`p:${k}`, 56, 22, (ctx) => drawPathSwatch(ctx, k, 56, 22)), h('span', {}, p.name)))),
      width, widthText,
      c.pathDraft ? h('button', { type: 'button', class: 'ghost', onclick: () => act.finishPath() }, 'Finish this road') : null,
    ];
  }
  if (t === 'label') {
    const L = c.label;
    return [
      heading('Label'),
      field('Words', h('input', { id: 'creator-label-text', value: L.text, maxLength: 80, placeholder: 'The Rusty Anchor', oninput: (e) => { L.text = e.target.value; } })),
      field('Lettering', h('select', { id: 'creator-label-font', onchange: (e) => { L.font = e.target.value; } }, ...Object.entries(LABEL_FONTS).map(([k, f]) => new Option(f.name, k, false, L.font === k)))),
      h('div', { class: 'creator-row' },
        field('Size', h('input', { type: 'number', id: 'creator-label-size', min: '0.3', max: '6', step: '0.1', value: String(L.size), onchange: (e) => { L.size = Number(e.target.value) || 0.8; } })),
        field('Colour', h('input', { type: 'color', value: L.colour, onchange: (e) => { L.colour = e.target.value; } })),
      ),
      h('div', { class: 'creator-row' }, check('Italic', L.italic, (v) => { L.italic = v; }), check('Outline', L.halo, (v) => { L.halo = v; })),
    ];
  }
  if (t === 'place' || t === 'scatter') {
    const def = ASSETS[c.asset];
    const own = c.assets.find((x) => `u:${x.id}` === c.asset);
    const picked = def || own
      ? h('div', { class: 'creator-picked' }, def ? assetThumb(c.asset, 48) : pictureThumb(c.images.get(c.asset), 48), h('strong', {}, def?.name ?? own.name))
      : h('p', { class: 'muted small' }, 'Pick a thing in Things below.');
    if (t === 'scatter') {
      return [heading('Scatter'), picked,
        field('How close', h('select', { id: 'creator-spacing', onchange: (e) => { c.spacing = Number(e.target.value); } }, ...[[0.6, 'Close together'], [1, 'As usual'], [1.6, 'Far apart'], [2.4, 'Few and far']].map(([v, l]) => new Option(l, String(v), false, c.spacing === v)))),
        own ? h('p', { class: 'muted small' }, 'Only built-in things can be scattered.') : null];
    }
    return [heading('Place'), picked,
      check('Each one a little different (turned and sized)', c.vary, (v) => { c.vary = v; }, { id: 'creator-vary' }),
      h('p', { class: 'muted small' }, `Turned ${c.placeRot}° (R turns the next one).`)];
  }
  if (t === 'area') {
    return [
      heading('Area'),
      c.area
        ? h('div', { class: 'creator-grid' },
          h('button', { type: 'button', class: 'ghost', id: 'creator-copy', onclick: () => act.copy(false) }, 'Copy'),
          h('button', { type: 'button', class: 'ghost', id: 'creator-cut', onclick: () => act.copy(true) }, 'Cut'),
          h('button', { type: 'button', class: 'ghost', onclick: () => act.clearArea() }, 'Clear'),
          h('button', { type: 'button', class: 'ghost', id: 'creator-keep-stamp', onclick: () => act.keepAsStamp().catch(act.status) }, 'Keep as stamp'))
        : h('p', { class: 'muted small' }, 'Drag a rectangle over the part of the map you want.'),
      c.copied ? h('button', { type: 'button', class: 'ghost', id: 'creator-paste', onclick: () => act.paste() }, 'Put down the copy') : null,
    ];
  }
  if (t === 'paste' && c.clip) {
    return [
      heading('Putting down'),
      h('p', {}, h('strong', {}, c.clip.name)),
      h('div', { class: 'creator-row' },
        h('button', { type: 'button', class: 'ghost', onclick: () => { c.clip.rot = (c.clip.rot + 90) % 360; act.redraw(); } }, 'Turn (R)'),
        h('button', { type: 'button', class: 'ghost', onclick: () => { c.clip.flip = !c.clip.flip; act.redraw(); } }, 'Flip (F)'),
        h('button', { type: 'button', class: 'ghost', onclick: () => act.setTool('select') }, 'Stop'),
      ),
      h('p', { class: 'muted small' }, 'Click the map to put it down; again for another.'),
    ];
  }
  return [];
}

// ---------- things ----------

const matches = (key, a, q) => `${a.name} ${a.tags ?? ''} ${key.replace(/_/g, ' ')} ${a.group}`.toLowerCase().includes(q);

function thingsTab(c, act) {
  const q = c.search.trim().toLowerCase();
  const search = h('input', { type: 'search', id: 'creator-search', value: c.search, placeholder: 'Find a thing (barrel, tree, altar…)', 'aria-label': 'Find a thing',
    oninput: (e) => {
      c.search = e.target.value;
      const pos = e.target.selectionStart;
      act.panel();
      const again = $('#creator-search');
      again?.focus();
      again?.setSelectionRange?.(pos, pos);
    } });
  const button = (key, label, picture = null) => h('button', {
    type: 'button', class: 'ghost creator-asset', 'data-asset': key, title: label, 'aria-pressed': String(c.asset === key),
    onclick: () => { c.asset = key; if (c.tool !== 'scatter' || !ASSETS[key]) act.setTool('place'); act.panel(); },
  }, ASSETS[key] ? assetThumb(key) : pictureThumb(picture), h('span', {}, label));
  const folder = (key, summary, ...rest) => {
    const attrs = rest[0] instanceof Node ? {} : rest.shift();
    const el = h('details', { ...attrs, open: c.open.has(key) || !!q }, h('summary', {}, summary), ...rest);
    el.addEventListener('toggle', () => (el.open ? c.open.add(key) : c.open.delete(key)));
    return el;
  };
  const upload = h('input', { type: 'file', id: 'creator-upload', accept: 'image/png,image/webp,image/jpeg,image/gif', hidden: true, onchange: (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) act.addAsset(file).catch((err) => act.status(err.message));
  } });
  const own = c.assets.filter((x) => !q || x.name.toLowerCase().includes(q));
  const groups = ASSET_GROUPS.map((g) => [g, Object.entries(ASSETS).filter(([k, a]) => a.group === g && (!q || matches(k, a, q)))]).filter(([, list]) => list.length);
  return [
    search,
    ...groups.map(([g, list]) => folder(g, `${g} (${list.length})`, h('div', { class: 'creator-assets' }, list.map(([k, a]) => button(k, a.name))))),
    folder('own', `Your pictures (${c.assets.length})`, { id: 'creator-own' },
      h('div', { class: 'creator-assets' }, own.map((x) => button(`u:${x.id}`, x.name, c.images.get(`u:${x.id}`)))),
      h('p', { class: 'muted small' }, 'Your own pictures, seen from above. A PNG with a see-through background looks best.'),
      h('button', { type: 'button', class: 'ghost', onclick: () => upload.click() }, 'Add a picture…'),
      upload,
    ),
    q && !groups.length && !own.length ? h('p', { class: 'muted small' }, 'Nothing by that name.') : null,
  ];
}

// ---------- stamps ----------

function stampsTab(c, act) {
  const button = (s, mine = false) => h('div', { class: 'creator-stamp' },
    h('button', { type: 'button', class: 'ghost', 'data-stamp': s.id, title: s.name, onclick: () => act.startPaste(s.clip, s.name) },
      clipThumb(`${s.id}:${s.updated_at ?? ''}`, s.clip, c.images, ({ Outdoors: 'g', Ships: 'W' })[s.group] ?? (s.group ? 'f' : '.')), h('span', {}, s.name)),
    mine ? h('span', { class: 'creator-stamp-tools' },
      h('button', { type: 'button', class: 'ghost small', title: 'Rename', 'aria-label': `Rename ${s.name}`, onclick: () => act.renameStamp(s).catch((err) => act.status(err.message)) }, '✎'),
      h('button', { type: 'button', class: 'ghost small danger', title: 'Take off the list', 'aria-label': `Remove ${s.name}`, onclick: () => act.removeStamp(s).catch((err) => act.status(err.message)) }, '×')) : null);
  const folder = (key, summary, body) => {
    const el = h('details', { open: c.open.has(key) }, h('summary', {}, summary), body);
    el.addEventListener('toggle', () => (el.open ? c.open.add(key) : c.open.delete(key)));
    return el;
  };
  const groups = [...new Set(c.stamps.builtIn.map((s) => s.group))];
  return [
    h('p', { class: 'muted small' }, 'Pieces of map to put down in one go. Keep your own with the Area tool (or pick things and use Keep as stamp).'),
    folder('mine', `Your stamps (${c.stamps.own.length})`, h('div', { class: 'creator-stamps', id: 'creator-own-stamps' }, c.stamps.own.length ? c.stamps.own.map((s) => button(s, true)) : h('p', { class: 'muted small' }, 'None yet.'))),
    ...groups.map((g) => folder(g, g, h('div', { class: 'creator-stamps' }, c.stamps.builtIn.filter((s) => s.group === g).map((s) => button(s))))),
  ];
}

// ---------- the look ----------

function lookTab(c, act) {
  const look = normalizeLook(c.design.look);
  const set = (fields) => act.change({ ...c.design, look: normalizeLook({ ...normalizeLook(c.design.look), ...fields }) }, { keepSelection: true });
  return [
    h('p', { class: 'muted small' }, 'How the whole picture looks. Players see it like this; darkness on the map (for line of sight) is set on the map itself.'),
    field('Light', h('select', { id: 'creator-mood', onchange: (e) => set({ mood: e.target.value }) }, ...Object.entries(MOODS).map(([k, l]) => new Option(l, k, false, look.mood === k)))),
    field('Grid on the picture', h('select', { id: 'creator-grid', onchange: (e) => set({ grid: e.target.value }) }, ...Object.entries(GRID_LOOKS).map(([k, l]) => new Option(l, k, false, look.grid === k)))),
    check('Shadows under walls and things', look.shadows, (v) => set({ shadows: v }), { id: 'creator-look-shadows' }),
    check('Lights glow', look.glow, (v) => set({ glow: v }), { id: 'creator-look-glow' }),
    check('Natural floors blend into each other', look.soft, (v) => set({ soft: v }), { id: 'creator-look-soft' }),
    field('Colour where there is no floor', h('input', { type: 'color', id: 'creator-look-void', value: look.void, onchange: (e) => set({ void: e.target.value }) })),
    heading('While drawing'),
    check('Show the light and grid as players will see them', c.previewLook, (v) => { c.previewLook = v; act.redraw(); }, { id: 'creator-preview-look' }),
    check('Show squares to count by', c.showGrid, (v) => { c.showGrid = v; act.redraw(); }, { id: 'creator-show-grid' }),
  ];
}

// ---------- the map: floors of a building, taking it elsewhere ----------

function mapTab(c, act) {
  if (!c.map) {
    return [h('p', { class: 'muted small' }, 'Save the map first. Then you can add floors above and cellars below (each its own map, with stairs between them), and download it for other VTTs.')];
  }
  return [
    ...renderLevels(c, act),
    heading('Other VTTs'),
    h('p', { class: 'muted small' }, 'A Universal VTT file (.dd2vtt) has the picture, the grid, the walls, doors and lights: Foundry, Dungeondraft and others can open it.'),
    h('button', { type: 'button', class: 'ghost', id: 'creator-export', onclick: () => act.exportUvtt().catch((err) => act.status(err.message)) }, 'Download .dd2vtt'),
  ];
}

// ---------- what's picked ----------

/** The box over the map for what's picked: what it is and everything that can be changed about it. */
export function renderProps(c, act) {
  const box = $('#creator-props');
  if (!box) return;
  const picked = c.selected.map((s) => [s, act.findPicked(s)]).filter(([, x]) => x);
  box.hidden = !picked.length;
  if (!picked.length) return box.replaceChildren();
  const [[s, x]] = picked;
  const body = picked.length > 1 ? manyProps(picked, act) : s.kind === 'asset' ? assetProps(c, x, act) : s.kind === 'label' ? labelProps(x, act) : s.kind === 'path' ? pathProps(x, act) : wallProps(x, act);
  box.replaceChildren(h('div', { class: 'creator-selected', id: 'creator-selected' }, ...body));
}

const setPicked = (act, fields) => act.changePicked((x) => ({ ...x, ...fields }));
const removeButton = (act) => h('button', { type: 'button', class: 'ghost danger', id: 'creator-remove', onclick: () => act.removePicked() }, 'Remove');
const turnButtons = (act) => [
  h('button', { type: 'button', class: 'ghost', title: 'Turn left (Shift+R)', onclick: () => act.turnPicked(-45) }, '⟲ 45°'),
  h('button', { type: 'button', class: 'ghost', title: 'Turn right (R)', onclick: () => act.turnPicked(45) }, '⟳ 45°'),
];

function manyProps(picked, act) {
  return [
    h('h3', {}, `${picked.length} picked`),
    h('div', { class: 'creator-row' }, ...turnButtons(act), h('button', { type: 'button', class: 'ghost', onclick: () => act.flipPicked() }, 'Flip')),
    h('div', { class: 'creator-row' },
      h('button', { type: 'button', class: 'ghost', onclick: () => act.duplicatePicked() }, 'Copy'),
      h('button', { type: 'button', class: 'ghost', onclick: () => act.keepAsStamp().catch((err) => act.status(err.message)) }, 'Keep as stamp'),
      removeButton(act)),
  ];
}

/** Where a thing can lead: the building's other floors first, then every other map. */
function leadsTo(c, a, act) {
  const here = c.map?.id ?? null;
  const group = c.map?.level?.group ?? here;
  const others = state.maps.filter((m) => m.id !== here);
  const floors = others.filter((m) => group && (m.level?.group ?? m.id) === group).sort((p, q) => (q.level?.n ?? 0) - (p.level?.n ?? 0));
  const rest = others.filter((m) => !floors.includes(m));
  const opt = (m) => new Option(m.level && floors.includes(m) ? `${levelName(m.level.n)}: ${m.name}` : m.name, m.id, false, a.to === m.id);
  const select = h('select', { id: 'creator-leads', onchange: (e) => setPicked(act, { to: e.target.value || null }) },
    new Option('Nowhere', '', false, !a.to),
    ...(floors.length ? [h('optgroup', { label: 'This building' }, ...floors.map(opt))] : []),
    ...(rest.length ? [h('optgroup', { label: 'Other maps' }, ...rest.map(opt))] : []));
  return [
    field('Leads to', select),
    a.to ? field('Called', h('input', { value: a.label, maxLength: 60, placeholder: ASSETS[a.a]?.name ?? 'Way through', onchange: (e) => setPicked(act, { label: e.target.value }) })) : null,
  ];
}

function assetProps(c, a, act) {
  const def = ASSETS[a.a];
  const own = c.assets.find((x) => `u:${x.id}` === a.a);
  const num = (label, key, step) => field(label, h('input', { type: 'number', min: '0.2', max: '20', step: String(step), value: String(a[key]), onchange: (e) => setPicked(act, { [key]: Number(e.target.value) || a[key] }) }));
  const layer = a.layer ?? def?.layer ?? 1;
  return [
    h('h3', {}, def?.name ?? own?.name ?? 'Your picture'),
    h('div', { class: 'creator-row' }, num('Across', 'w', 0.25), num('Down', 'h', 0.25), field('Turn', h('input', { type: 'number', step: '15', value: String(a.rot), onchange: (e) => setPicked(act, { rot: Number(e.target.value) || 0 }) }))),
    h('div', { class: 'creator-row' }, ...turnButtons(act), check('Flipped', a.flip, (v) => setPicked(act, { flip: v }))),
    def?.tint ? field('Colour', h('input', { type: 'color', value: a.tint ?? def.tint, onchange: (e) => setPicked(act, { tint: e.target.value }) })) : null,
    field('Drawn', h('select', { onchange: (e) => setPicked(act, { layer: Number(e.target.value) }) }, ...LAYER_NAMES.map(([v, l]) => new Option(l, String(v), false, layer === v)))),
    field('Blocks', h('select', { id: 'creator-blocks', onchange: (e) => setPicked(act, { blocks: e.target.value }) }, ...BLOCKS.map((b) => new Option(BLOCK_NAMES[b], b, false, a.blocks === b)))),
    def?.light ? check(`Gives light (${def.light.bright} ft bright, ${def.light.dim} ft dim)`, a.light, (v) => setPicked(act, { light: v })) : null,
    check('Difficult ground under it', a.difficult, (v) => setPicked(act, { difficult: v })),
    ...leadsTo(c, a, act),
    h('div', { class: 'creator-row' },
      h('button', { type: 'button', class: 'ghost', onclick: () => act.duplicatePicked() }, 'Copy'),
      h('button', { type: 'button', class: 'ghost', title: 'Drawn over the others on its layer', onclick: () => act.orderPicked(true) }, 'To front'),
      h('button', { type: 'button', class: 'ghost', title: 'Drawn under the others on its layer', onclick: () => act.orderPicked(false) }, 'To back'),
      removeButton(act)),
  ];
}

function labelProps(l, act) {
  return [
    h('h3', {}, 'Label'),
    field('Words', h('input', { value: l.text, maxLength: 80, onchange: (e) => e.target.value.trim() && setPicked(act, { text: e.target.value }) })),
    h('div', { class: 'creator-row' },
      field('Lettering', h('select', { onchange: (e) => setPicked(act, { font: e.target.value }) }, ...Object.entries(LABEL_FONTS).map(([k, f]) => new Option(f.name, k, false, l.font === k)))),
      field('Size', h('input', { type: 'number', min: '0.3', max: '6', step: '0.1', value: String(l.size), onchange: (e) => setPicked(act, { size: Number(e.target.value) || l.size }) })),
      field('Colour', h('input', { type: 'color', value: l.colour, onchange: (e) => setPicked(act, { colour: e.target.value }) }))),
    h('div', { class: 'creator-row' }, ...turnButtons(act), check('Italic', l.italic, (v) => setPicked(act, { italic: v })), check('Outline', l.halo, (v) => setPicked(act, { halo: v }))),
    h('div', { class: 'creator-row' }, h('button', { type: 'button', class: 'ghost', onclick: () => act.duplicatePicked() }, 'Copy'), removeButton(act)),
  ];
}

function pathProps(p, act) {
  return [
    h('h3', {}, PATH_KINDS[p.kind].name),
    field('Kind', h('select', { onchange: (e) => setPicked(act, { kind: e.target.value }) }, ...Object.entries(PATH_KINDS).map(([k, x]) => new Option(x.name, k, false, p.kind === k)))),
    field('Squares wide', h('input', { type: 'number', min: '0.2', max: '8', step: '0.1', value: String(p.w), onchange: (e) => setPicked(act, { w: Number(e.target.value) || p.w }) })),
    h('div', { class: 'creator-row' }, h('button', { type: 'button', class: 'ghost', onclick: () => act.duplicatePicked() }, 'Copy'), removeButton(act)),
  ];
}

function wallProps(w, act) {
  const types = { ...WALL_TYPE_CHOICES, ...OPENING_NAMES };
  return [
    h('h3', {}, types[w.type] ?? 'Wall'),
    field('Kind', h('select', { id: 'creator-wall-type', onchange: (e) => setPicked(act, { type: e.target.value }) }, ...Object.entries(types).filter(([k]) => !w.arc || k === 'wall' || k === 'low').map(([k, l]) => new Option(l, k, false, w.type === k)))),
    field('Look', h('select', { onchange: (e) => setPicked(act, { style: e.target.value }) }, ...WALL_STYLES.map((s) => new Option(WALL_STYLE_NAMES[s], s, false, w.style === s)))),
    h('div', { class: 'creator-row' }, removeButton(act)),
  ];
}
