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
import { marked } from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';
import {
  TOKEN_KINDS, TOKEN_KIND_NAMES, TOKEN_SIZES, TOKEN_SIZE_NAMES, TOKEN_COLORS, UNITS,
  CONDITIONS, snapToken, tokenPx, measure, formatDistance, fogRect, healthOf,
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
  images: new Map(), // map id -> { key, url } of its image (players' changes with the fog)
  view: { x: 0, y: 0, k: 1 }, // screen = image * k + (x, y)
  fitted: false,
  selected: null, // token id
  drag: null, // a token being moved: { id, start, pointer, x, y, moved }
  pointers: new Map(), // pointers down on the background (panning, pinching)
  draftGrid: undefined, // grid being edited in the settings dialog (shown live)
  fogMode: null, // DM drawing fog: 'reveal' | 'cover'
  fogDraw: null, // the rectangle being drawn: { pointer, a, b }
  live: null, // AbortController for the live stream
  pins: new Map(), // map id -> this person's private pins on it
  pinMode: false, // the next click on the map drops a pin
  selectedPin: null, // pin id
  pinDrag: null, // a pin being moved: { id, pointer, x, y, moved, sx, sy }
  tokenPictures: new Map(), // `${user id}:${picture key}` -> URL of a player's token picture, or null while loading
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
  $('#map-stage').hidden = !map;
  for (const b of document.querySelectorAll('.map-needs-map')) b.disabled = !map;
  if (!map) {
    $('#map-image').removeAttribute('src');
    $('#map-tokens').replaceChildren();
    $('#map-pins').replaceChildren();
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
  renderFog();
  renderTokens();
  renderPins();
  renderSelection();
  renderFogTools();
  if (state.images.has(map.id) && state.images.get(map.id).key !== map.image_key) loadImage(map);
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

/** Fog of war: the DM sees it shaded; players see covered parts dark (their image is blacked out there too). */
function renderFog() {
  const map = state.current;
  const svg = $('#map-fog');
  const { width, height } = map.image;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.classList.toggle('dm', state.canEdit);
  svg.replaceChildren();
  if (map.fog?.enabled) {
    const mask = svgEl('mask', { id: 'map-fog-mask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width, height });
    mask.append(svgEl('rect', { width, height, fill: 'white' }));
    for (const r of map.fog.shapes) mask.append(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: r.op === 'reveal' ? 'black' : 'white' }));
    const defs = svgEl('defs', {});
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
  $('#map-fog-open').setAttribute('aria-pressed', String(!tools.hidden));
  if (tools.hidden || !map) return;
  $('#map-fog-on').checked = !!map.fog?.enabled;
  for (const b of tools.querySelectorAll('[data-fog-mode]')) {
    b.setAttribute('aria-pressed', String(state.fogMode === b.dataset.fogMode));
    b.disabled = !map.fog?.enabled;
  }
  for (const b of tools.querySelectorAll('[data-fog-action]')) b.disabled = !map.fog?.enabled;
  $('#map-view').classList.toggle('fog-drawing', !!state.fogMode && !!map.fog?.enabled);
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
 * The URL of a player character's token picture, or null until it's loaded
 * (the tokens are drawn again then). Each picture is fetched once.
 */
function tokenPicture(t) {
  if (!t.picture || t.user_id == null) return null;
  const key = `${t.user_id}:${t.picture}`;
  if (state.tokenPictures.has(key)) return state.tokenPictures.get(key);
  state.tokenPictures.set(key, null);
  const cid = state.campaignId;
  fileUrl(`/campaigns/${cid}/members/${t.user_id}/token?v=${encodeURIComponent(t.picture)}`)
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
        class: `token token-${t.kind}${picture ? ' has-picture' : ''}${canMove(t) ? ' movable' : ''}${t.user_id === state.userId ? ' mine' : ''}${state.selected === t.id ? ' selected' : ''}${dragging ? ' dragging' : ''}${t.hidden ? ' hidden-token' : ''}${health === 'down' ? ' down' : ''}`,
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
  if (id) state.selected = null;
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
  $('#map-view').classList.toggle('pin-placing', state.pinMode);
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

function renderSelection() {
  const bar = $('#map-selection');
  const token = state.current?.tokens.find((t) => t.id === state.selected);
  const pin = !token && myPins().find((p) => p.id === state.selectedPin);
  bar.hidden = !token && !pin;
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
      state.canEdit ? h('button', { class: 'ghost', onclick: () => tokenDialog(token) }, 'Edit') : null,
      state.canEdit ? h('button', { class: 'ghost danger', onclick: () => removeToken(token) }, 'Remove') : null,
      h('button', { class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => select(null) }, '✕'),
    ].filter(Boolean),
  );
}

function select(id) {
  state.selected = id;
  state.selectedPin = null;
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
  if (!state.current || e.target.closest('.token, .map-pin, .map-selection')) return;
  e.currentTarget.setPointerCapture(e.pointerId);
  if (state.fogMode && state.current.fog?.enabled && !state.pointers.size && !state.fogDraw) {
    const at = toImage(e.clientX, e.clientY);
    state.fogDraw = { pointer: e.pointerId, a: at, b: at };
    return;
  }
  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
}

function viewMove(e) {
  if (state.drag) return tokenMove(e);
  if (state.pinDrag) return pinMove(e);
  if (state.fogDraw?.pointer === e.pointerId) {
    state.fogDraw.b = toImage(e.clientX, e.clientY);
    return renderFog();
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
  if (state.fogDraw?.pointer === e.pointerId) {
    const r = fogRect(state.current, state.fogDraw.a, state.fogDraw.b);
    state.fogDraw = null;
    renderFog();
    if (r.w > 0 && r.h > 0) fog({ add: { op: state.fogMode, ...r } });
    return;
  }
  const p = state.pointers.get(e.pointerId);
  state.pointers.delete(e.pointerId);
  // A click on the map itself (not a drag) drops a pin when placing one, else clears the selection.
  if (p && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 4 && !state.pointers.size) {
    if (state.pinMode && e.type === 'pointerup') return dropPin(toImage(e.clientX, e.clientY));
    select(null);
  }
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
  const hpMax = h('input', { type: 'number', min: '1', step: '1', value: token?.hp?.max ?? '', placeholder: 'unknown' });
  const hidden = h('input', { type: 'checkbox', checked: !!token?.hidden });
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
      recordField,
      field('Kind', kind),
      playerField,
      field('Name', name),
      h('div', { class: 'map-row' }, field('Size', size), field('Colour', color), field('Max HP', hpMax)),
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
  $('#map-fog-open').addEventListener('click', () => {
    const tools = $('#map-fog-tools');
    tools.hidden = !tools.hidden;
    if (tools.hidden) state.fogMode = null;
    renderFogTools();
  });
  $('#map-fog-on').addEventListener('change', (e) => fog({ enabled: e.target.checked }));
  for (const b of document.querySelectorAll('[data-fog-mode]')) {
    b.addEventListener('click', () => {
      state.fogMode = state.fogMode === b.dataset.fogMode ? null : b.dataset.fogMode;
      if (state.fogMode) state.pinMode = false;
      renderPinTool();
      renderFogTools();
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
  $('#map-pin').addEventListener('click', () => {
    state.pinMode = !state.pinMode;
    if (state.pinMode) state.fogMode = null;
    renderFogTools();
    renderPinTool();
    if (state.pinMode) status('Click the map where the pin goes. Only you will see it.');
  });
}
