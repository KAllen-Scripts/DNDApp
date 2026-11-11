/** The Map tab's ruler (moved out of map.js): measuring between two points, and the measure and pin tools' buttons. */
import { state } from './state.js';
import { formatDistance, measure, snapToken, squarePx } from '/shared/map.js';
import { $ } from '../page/dom.js';
import { svgEl, toView } from './map.js';

/** Where a ruler end goes: the middle of a square on a grid, else where the pointer is. */
export const rulerPoint = (at) => (state.current.grid ? snapToken(state.current, { size: 1 }, at.x, at.y) : at);

/** Put the distance label next to a point on the map. */
export function placeMeasure(at) {
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
