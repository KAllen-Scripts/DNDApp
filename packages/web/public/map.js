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
import { api, listen, fileUrl, h, storage, LoggedOut } from './api.js';
import {
  TOKEN_KINDS, TOKEN_KIND_NAMES, TOKEN_SIZES, TOKEN_SIZE_NAMES, TOKEN_COLORS, UNITS,
  snapToken, tokenPx, measure, formatDistance,
} from './shared/map.js';

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
  images: new Map(), // map id -> object URL of its image
  view: { x: 0, y: 0, k: 1 }, // screen = image * k + (x, y)
  fitted: false,
  selected: null, // token id
  drag: null, // a token being moved: { id, start, pointer, x, y, moved }
  pointers: new Map(), // pointers down on the background (panning, pinching)
  draftGrid: undefined, // grid being edited in the settings dialog (shown live)
  live: null, // AbortController for the live stream
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
  for (const url of state.images.values()) URL.revokeObjectURL(url);
  state.images.clear();
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
  state.fitted = false;
  if (map) storage.set(PICK_KEY(), map.id);
  renderPicker();
  render();
  if (!map) return;
  try {
    if (!state.images.has(map.id)) state.images.set(map.id, await fileUrl(`${base()}/${map.id}/image`));
    if (state.current?.id !== map.id) return;
    $('#map-image').src = state.images.get(map.id);
    fit();
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
  $('#map-stage').hidden = !map;
  for (const b of document.querySelectorAll('.map-needs-map')) b.disabled = !map;
  if (!map) {
    $('#map-image').removeAttribute('src');
    $('#map-tokens').replaceChildren();
    renderSelection();
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
  renderTokens();
  renderSelection();
  const reading = map.reading.status;
  if (reading === 'pending') status('The AI is reading this map…');
  else if (reading === 'failed' && state.canEdit) status(map.reading.error || "The AI couldn't read this map.", true);
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
  const ns = 'http://www.w3.org/2000/svg';
  const lines = [];
  for (let x = grid.x; x <= map.image.width; x += grid.size) lines.push(`M${x} 0V${map.image.height}`);
  for (let y = grid.y; y <= map.image.height; y += grid.size) lines.push(`M0 ${y}H${map.image.width}`);
  if (lines.length > 4000) return; // a mistyped tiny square; don't freeze the page
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', lines.join(''));
  path.setAttribute('class', state.draftGrid !== undefined ? 'editing' : '');
  svg.append(path);
}

const initials = (name) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

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
      const el = h('div', {
        class: `token token-${t.kind}${canMove(t) ? ' movable' : ''}${t.user_id === state.userId ? ' mine' : ''}${state.selected === t.id ? ' selected' : ''}${dragging ? ' dragging' : ''}`,
        title: `${t.name} (${TOKEN_KIND_NAMES[t.kind]})`,
        role: 'button',
        tabindex: '0',
        'aria-label': t.name,
        'data-id': t.id,
      }, h('span', { class: 'token-initials' }, initials(t.name)), h('span', { class: 'token-name' }, t.name));
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

function renderSelection() {
  const bar = $('#map-selection');
  const token = state.current?.tokens.find((t) => t.id === state.selected);
  bar.hidden = !token;
  if (!token) return bar.replaceChildren();
  bar.replaceChildren(
    ...[
      h('span', { class: 'swatch', style: `background:${token.color}` }),
      h('strong', {}, token.name),
      h('span', { class: 'muted small' }, `${TOKEN_KIND_NAMES[token.kind]} · ${TOKEN_SIZE_NAMES[token.size]}`),
      h('span', { class: 'spacer' }),
      canMove(token) && !state.canEdit ? h('span', { class: 'muted small' }, 'Drag to move') : null,
      state.canEdit ? h('button', { class: 'ghost', onclick: () => tokenDialog(token) }, 'Edit') : null,
      state.canEdit ? h('button', { class: 'ghost danger', onclick: () => removeToken(token) }, 'Remove') : null,
      h('button', { class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => select(null) }, '✕'),
    ].filter(Boolean),
  );
}

function select(id) {
  state.selected = id;
  renderTokens();
  renderSelection();
}

// ---------- panning and zooming ----------

function applyView() {
  const { x, y, k } = state.view;
  $('#map-stage').style.transform = `translate(${x}px, ${y}px) scale(${k})`;
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

/** Screen coordinates → the map image's pixels. */
function toImage(clientX, clientY) {
  const box = $('#map-view').getBoundingClientRect();
  return { x: (clientX - box.left - state.view.x) / state.view.k, y: (clientY - box.top - state.view.y) / state.view.k };
}

function viewDown(e) {
  if (!state.current || e.target.closest('.token')) return;
  e.currentTarget.setPointerCapture(e.pointerId);
  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
}

function viewMove(e) {
  if (state.drag) return tokenMove(e);
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
  const p = state.pointers.get(e.pointerId);
  state.pointers.delete(e.pointerId);
  // A click on the map itself (not a drag) clears the selection.
  if (p && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 4 && !state.pointers.size) select(null);
}

// ---------- moving tokens ----------

function tokenDown(e, token) {
  e.stopPropagation();
  if (!canMove(token)) return select(token.id);
  $('#map-view').setPointerCapture(e.pointerId);
  const at = toImage(e.clientX, e.clientY);
  state.drag = { id: token.id, pointer: e.pointerId, start: { x: token.x, y: token.y }, grab: { x: at.x - token.x, y: at.y - token.y }, x: token.x, y: token.y, moved: false, sx: e.clientX, sy: e.clientY };
}

function tokenMove(e) {
  const drag = state.drag;
  if (e.pointerId !== drag.pointer) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
  drag.moved = true;
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
  // How far it's going, measured to where it would land.
  const end = snapToken(map, token, drag.x, drag.y);
  const distance = formatDistance(measure(map, drag.start, end));
  const label = $('#map-measure');
  label.hidden = !distance;
  label.textContent = distance;
  const box = $('#map-view').getBoundingClientRect();
  label.style.left = `${e.clientX - box.left + 14}px`;
  label.style.top = `${e.clientY - box.top - 30}px`;
}

async function tokenUp(e) {
  const drag = state.drag;
  if (e.pointerId !== drag.pointer) return;
  state.drag = null;
  $('#map-measure').hidden = true;
  const map = state.current;
  const token = map.tokens.find((t) => t.id === drag.id);
  if (!drag.moved || !token) return select(drag.id);
  // Show it where it will land straight away; the server's answer (and everyone else's screens) follow.
  Object.assign(token, snapToken(map, token, drag.x, drag.y));
  renderTokens();
  try {
    const res = await state.guarded(() => api('PATCH', `${base()}/${map.id}/tokens/${token.id}`, { x: drag.x, y: drag.y }));
    if (res) onMap(res.map);
  } catch (err) {
    Object.assign(token, drag.start);
    renderTokens();
    report(err);
  }
}

// ---------- the DM's tools ----------

async function importMap(file) {
  if (file.size > 35 * 1024 * 1024) return status('That image is too big (35 MB at most).', true);
  status('Uploading…');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const map = await api('POST', base(), { filename: file.name, data });
  onMap(map);
  await show(map);
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
  let colorTouched = !!token;
  color.addEventListener('input', () => (colorTouched = true));
  const playerField = field('Player', player);
  const sync = () => {
    playerField.hidden = kind.value !== 'pc';
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
    };
    if (token) {
      onMap((await api('PATCH', `${base()}/${map.id}/tokens/${token.id}`, body)).map);
    } else {
      const box = $('#map-view').getBoundingClientRect();
      const middle = toImage(box.left + box.width / 2, box.top + box.height / 2);
      const res = await api('POST', `${base()}/${map.id}/tokens`, { ...body, ...middle });
      onMap(res.map);
      select(res.token.id);
    }
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      state.guarded(save).then(() => dialog.close()).catch(report);
    } },
      h('h2', {}, token ? 'Change token' : 'Add a token'),
      field('Kind', kind),
      playerField,
      field('Name', name),
      h('div', { class: 'map-row' }, field('Size', size), field('Colour', color)),
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
  $('#map-settings').addEventListener('click', settingsDialog);
}
