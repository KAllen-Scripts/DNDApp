/**
 * The Map tab's walls, doors, difficult terrain, raised areas, stairs and
 * lights (moved out of map.js): drawing them, the DM's AI walls draft, the
 * door and raised-area controls, and the requests that change them.
 */
import { $, h } from '../page/dom.js';
import { arcThrough, circlePoints, distanceToWall, EFFORTS, fogRect, LIGHT_PRESETS, nearestWall, pointInPolygon, pxPerUnit, squarePx } from '/shared/map.js';
import { base, report, SHOW_WALLS_KEY, state, status, WALLS_EFFORT_KEY } from './state.js';
import { api, storage } from '../page/api.js';
import { centerOn, HANDLE_PX, links, onMap, renderSelection, renderTokens, SNAP_PX, svgEl, toImage } from './map.js';
import { renderPins } from './pins.js';
import { renderFogTools } from './fog.js';
import { renderRoads, roadMode, roads } from './travel.js';
import { renderTemplates } from './spell-templates.js';

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
export function renderWallDraft() {
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
export function renderWalls() {
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
export function renderTerrain() {
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
export function raisedHeight() {
  const n = Math.round(Number($('#map-raised-height').value));
  return Number.isFinite(n) ? Math.max(-1000, Math.min(1000, n)) : 15;
}

export async function raised(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/raised`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

export async function climbs(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/climbs`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

/** The stairs or ladder within reach of a point on the map, if any. */
const climbAt = (map, at, reach) => (map.climbs ?? []).findLast((c) => distanceToWall(at, c) <= reach);

export async function terrain(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/terrain`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

/** Open or close a door (anyone: players only doors next to their token; the server checks). */
export async function toggleDoor(door) {
  try {
    const saved = await state.guarded(() => api('POST', `${base()}/${state.current.id}/doors/${door.id}/toggle`, {}));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

/** The door under a click, if any (the DM's from all walls, a player's from the doors they can see). */
export function doorAt(clientX, clientY) {
  const map = state.current;
  const doors = state.canEdit ? map.walls.filter((w) => w.door) : (map.doors ?? []);
  return nearestWall({ walls: doors }, toImage(clientX, clientY), SNAP_PX / state.view.k);
}

export async function lights(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/lights`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

export async function walls(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/walls`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}

/** The DM picks a door (a click on it) to open, close, lock or unlock it. */
export function selectDoor(id) {
  Object.assign(state, { selectedDoor: id, selected: null, selectedPin: null, selectedTemplate: null, selectedRaised: null });
  renderWalls();
  renderTemplates();
  renderTokens();
  renderPins();
  renderSelection();
}

export function doorControls(door) {
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
export function selectedArea() {
  if (!state.canEdit || !state.selectedRaised || !raisedShown()) return null;
  return (state.current?.raised ?? []).find((a) => a.id === state.selectedRaised) ?? null;
}

/** Raised areas are drawn (and can be picked) in Edit map or while a wall tool is on. */
export const raisedShown = () => !!state.wallMode || !$('#map-wall-tools').hidden;

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

export const areaMiddle = (a) => {
  const xs = a.points.map((p) => p[0]);
  const ys = a.points.map((p) => p[1]);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

/** The AI's guesses still to check, in reading order (top to bottom, then left to right). */
export function aiGuesses(map) {
  return (map.raised ?? []).filter((a) => a.source === 'ai').map((a) => ({ a, m: areaMiddle(a) })).sort((p, q) => p.m.y - q.m.y || p.m.x - q.m.x).map((x) => x.a);
}

export function raisedControls(area) {
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
export function raisedDown(e) {
  const area = selectedArea();
  if (!area || state.pointers.size || (state.wallMode && state.wallMode !== 'raised')) return false;
  const at = toImage(e.clientX, e.clientY);
  const reach = HANDLE_PX / state.view.k;
  const handle = raisedHandles(area).filter((p) => Math.hypot(p.x - at.x, p.y - at.y) <= reach).sort((p, q) => Number(p.insert) - Number(q.insert))[0];
  if (!handle && !pointInPolygon(at.x, at.y, area.points)) return false;
  state.raisedEdit = { id: area.id, pointer: e.pointerId, handle, from: at, points: area.points.map((p) => [...p]), moved: false, sx: e.clientX, sy: e.clientY };
  return true;
}

export function raisedMove(e) {
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

export function raisedUp(e) {
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

/** Finish drawing a wall or door, or (a click, not a drag) erase a wall or open/close a door. */
export function wallUp(e) {
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
