/** The Map tab's pings and quick drawings (moved out of map.js): seen by everyone looking at the map, never saved. */
import { base, report, state, status } from './state.js';
import { api } from '../page/api.js';
import { $ } from '../page/dom.js';
import { squarePx } from '/shared/map.js';
import { svgEl } from './map.js';

const PING_MS = 2700;
const STROKE_MS = 20_000;

/** Ping a spot: everyone looking at the map sees it (the server decides who). */
export async function ping(at) {
  try {
    await state.guarded(() => api('POST', `${base()}/${state.current.id}/ping`, { x: at.x, y: at.y }));
  } catch (err) {
    report(err);
  }
}

/** Send the sketch just drawn (a short line is shared as it is; long ones are thinned out). */
export async function finishStroke(e) {
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
export function onSignal(kind, data) {
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

export function renderSignals() {
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
