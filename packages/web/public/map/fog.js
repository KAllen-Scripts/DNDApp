/**
 * The Map tab's fog of war (moved out of map.js): the DM sees their fog
 * rectangles shaded; players' pages work out what their tokens see from the
 * walls the server sends, and the DM's fog tools.
 */
import { base, report, state } from './state.js';
import { $ } from '../page/dom.js';
import { fogMask, fogRect, isPinMap, playerFogMask, snapToken, wallBetween } from '/shared/map.js';
import { onMap, svgEl } from './map.js';
import { renderTerrain } from './walls.js';
import { api } from '../page/api.js';

/**
 * Fog of war: the DM sees their rectangles shaded; players' pages work out
 * what their tokens see from the walls the server sends (covered parts
 * dark, places seen before dim), following a token while it's dragged.
 */
export function renderFog() {
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
export function queueFog() {
  if (state.canEdit || fogFrame) return;
  const go = () => {
    fogFrame = 0;
    if (state.current) renderFog();
  };
  fogFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(go) : setTimeout(go, 16);
}

export function renderFogTools() {
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

export async function fog(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/fog`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}
