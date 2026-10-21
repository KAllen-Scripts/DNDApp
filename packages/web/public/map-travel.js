/**
 * Travel and time in the world (owner, 2026-10-18: "an in-game clock is part of the basics"; journeys
 * have their own arrival times): the campaign's in-game clock over the map (the DM moves it on), and
 * journeys across world and region maps: a character (and whoever follows them) sets off for a place or a
 * spot at a pace, the miles and the time come from the map's scale, and they move along as the clock goes.
 *
 * The server works out the times and moves everyone; the page shows it and sends what people do.
 */
import { api, h } from './api.js';
import { PACES, isPinMap, milesBetween, travelMinutes } from './shared/map.js';
import { clockText, durationText } from './shared/settings.js';
import { base, report, state, status } from './map-state.js';
import { field } from './map-dm.js';
import { onMap, select, svgEl } from './map.js';

const $ = (sel) => document.querySelector(sel);

/** "On the road to Daggerford, due Day 3, 12:00" for a token's journey. */
export const journeyText = (j) => `On the road${j.to_name ? ` to ${j.to_name}` : ''}, due ${clockText(j.arrives)}`;

/** The clock over the map: the day and time (the DM's opens the clock to move it on). */
export function renderClock() {
  const el = $('#map-clock');
  el.hidden = state.clock == null;
  if (state.clock == null) return;
  el.textContent = clockText(state.clock);
  el.disabled = !state.canEdit;
  el.title = state.canEdit ? 'The in-game clock: move it on (journeys move with it)' : 'The in-game day and time';
}

/** The DM moved the clock (live). */
export function onClock({ clock }) {
  state.clock = clock;
  renderClock();
  renderRoutes();
}

/** Everyone on the road on every map, soonest first: [{ token, map }]. */
const onTheRoad = () => state.maps.flatMap((m) => m.tokens.filter((t) => t.journey).map((t) => ({ token: t, map: m }))).sort((a, b) => a.token.journey.arrives - b.token.journey.arrives);

/** The DM's clock: move it on by an hour, 8 hours or a day, to the next arrival, or set the day and time. */
export function clockDialog() {
  if (!state.canEdit) return;
  const dialog = $('#map-dialog');
  const now = h('p', { class: 'map-clock-now' });
  const result = h('p', { class: 'muted small', role: 'status' });
  const road = h('ul', { class: 'small map-road' });
  const day = h('input', { type: 'number', min: '1', step: '1', class: 'map-num', 'aria-label': 'Day' });
  const time = h('input', { type: 'time', 'aria-label': 'Time of day' });
  const draw = () => {
    now.textContent = clockText(state.clock);
    day.value = String(Math.floor(state.clock / 1440) + 1);
    const m = state.clock % 1440;
    time.value = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const list = onTheRoad();
    road.replaceChildren(...(list.length ? list.map(({ token, map }) => h('li', {}, `${token.name} (${map.name}): ${journeyText(token.journey)}`)) : [h('li', { class: 'muted' }, 'Nobody is on the road.')]));
    next.disabled = !list.some(({ token }) => token.journey.arrives > state.clock);
  };
  const move = async (body, said) => {
    try {
      const res = await state.guarded(() => api('POST', `/campaigns/${state.campaignId}/clock`, body));
      if (!res) return;
      // Journeys moved on the maps too: catch up.
      const { maps } = await api('GET', base());
      state.maps = maps;
      for (const m of maps) onMap(m);
      onClock(res);
      result.textContent = said ?? `It's now ${clockText(res.clock)}.`;
      draw();
    } catch (err) {
      result.textContent = `Couldn't do that: ${err.message}`;
    }
  };
  const step = (minutes, label) => h('button', { type: 'button', class: 'ghost', onclick: () => move({ add: minutes }) }, label);
  const next = h('button', { type: 'button', class: 'ghost', id: 'map-clock-next', title: 'To when the next journey ends: they arrive', onclick: () => move({ next_arrival: true }) }, 'To the next arrival');
  dialog.replaceChildren(h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
    e.preventDefault();
    const [hh, mm] = time.value.split(':').map(Number);
    const set = (Math.max(1, Math.round(Number(day.value) || 1)) - 1) * 1440 + (hh || 0) * 60 + (mm || 0);
    move({ set });
  } },
  h('h2', {}, 'The in-game clock'),
  now,
  h('div', { class: 'map-row' }, step(60, '+1 hour'), step(8 * 60, '+8 hours'), step(1440, '+1 day'), next),
  h('p', { class: 'muted small' }, 'Everyone on the road moves along as the clock goes, and arrives when it reaches their time. A rest can move it on too (in Rest).'),
  h('div', { class: 'map-row' }, field('Day', day), field('Time', time), h('button', { class: 'ghost', type: 'submit' }, 'Set')),
  h('h3', {}, 'On the road'),
  road,
  result,
  h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Close'))));
  draw();
  if (!dialog.open) dialog.showModal();
}

/**
 * The picked token's travel controls on a world or region map: Travel… (the DM, or a player for their own),
 * or, on the road, where it's going with Stop here (and the DM's Arrive now).
 */
export function travelControls(token) {
  const map = state.current;
  const mine = state.canEdit || (token.user_id != null && token.user_id === state.userId);
  if (!map || !mine || !isPinMap(map)) return [];
  if (token.journey) {
    return [
      h('span', { class: 'muted small map-journey' }, journeyText(token.journey)),
      h('button', { class: 'ghost', title: 'Stop where they are now on the way', onclick: () => journey(token, { stop: true }) }, 'Stop here'),
      state.canEdit ? h('button', { class: 'ghost', title: 'They get there now, whatever the clock says', onclick: () => journey(token, { arrive: true }) }, 'Arrive now') : null,
    ].filter(Boolean);
  }
  return [h('button', { class: 'ghost map-travel', title: `Send ${token.name} (and whoever follows) on a journey: they move along as the in-game clock goes`, onclick: () => travelDialog(token) }, 'Travel…')];
}

/** Waiting for a click on the map for where a token travels to. Returns true if it took the click. */
export function travelPicked(at, place = null) {
  const id = state.travelPick;
  if (!id) return false;
  state.travelPick = null;
  $('#map-view').classList.remove('picking');
  const token = state.current?.tokens.find((t) => t.id === id);
  if (token) travelDialog(token, place ? null : { x: at.x, y: at.y }, place?.id);
  return true;
}

/**
 * Where to, and how fast: a place on this map or a spot clicked on it, the pace, and (from the map's
 * scale) the miles and how long, with when they'd arrive. The DM can say how long instead.
 */
function travelDialog(token, spot = null, placeId = null) {
  const map = state.current;
  const dialog = $('#map-dialog');
  const places = map.places ?? [];
  const where = h('select', { 'aria-label': 'Where to' },
    ...(spot ? [new Option('The spot you clicked', 'spot')] : []),
    ...places.map((p) => new Option(p.name, p.id)),
    new Option('Click a spot on the map…', 'pick'));
  const pace = h('select', { 'aria-label': 'Pace' }, ...Object.entries(PACES).map(([k, p]) => new Option(`${p.name} (${p.perDay} miles a day)`, k)));
  pace.value = 'normal';
  if (placeId) where.value = placeId;
  const days = h('input', { type: 'number', min: '0', step: '1', class: 'map-num', 'aria-label': 'Days' });
  const hours = h('input', { type: 'number', min: '0', step: 'any', class: 'map-num', 'aria-label': 'Hours' });
  const own = h('div', { class: 'map-row' }, field('Days', days), field('Hours', hours));
  own.hidden = !state.canEdit;
  const says = h('p', { class: 'map-travel-says' });
  const effect = h('p', { class: 'muted small' });
  const target = () => {
    if (where.value === 'spot') return { ...spot };
    const p = places.find((x) => x.id === where.value);
    return p ? { x: p.x, y: p.y, place: p.id, name: p.name } : null;
  };
  let typed = false;
  for (const el of [days, hours]) el.addEventListener('input', () => { typed = true; draw(); });
  const minutesTyped = () => (typed && (days.value || hours.value) ? Math.round((Number(days.value) || 0) * 1440 + (Number(hours.value) || 0) * 60) : null);
  const draw = () => {
    effect.textContent = PACES[pace.value].effect;
    const to = target();
    if (!to) return (says.textContent = 'Pick where they go.');
    const miles = milesBetween(map, token, to);
    const minutes = minutesTyped() ?? (miles == null ? null : travelMinutes(miles, pace.value));
    if (minutes == null) {
      says.textContent = state.canEdit ? 'This map has no scale, so say how long it takes (or set its scale in Map settings).' : "This map has no scale yet, so there's no telling how long that takes. Ask your DM.";
      return;
    }
    if (!typed && state.canEdit) {
      days.value = String(Math.floor(minutes / 1440));
      hours.value = String(Math.round((minutes % 1440) / 60));
    }
    says.textContent = `${miles != null ? `${Math.round(miles * 10) / 10} miles: ` : ''}${durationText(minutes)}${minutesTyped() == null ? ` at a ${PACES[pace.value].name.toLowerCase()} pace` : ''}, arriving ${clockText(state.clock + minutes)}.`;
  };
  where.addEventListener('change', () => {
    if (where.value !== 'pick') return draw();
    dialog.close();
    state.travelPick = token.id;
    $('#map-view').classList.add('picking');
    status(`Click where ${token.name} goes.`);
  });
  pace.addEventListener('change', () => { typed = false; draw(); });
  const followers = map.tokens.filter((t) => t.follows === token.id).map((t) => t.name);
  dialog.replaceChildren(h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
    e.preventDefault();
    const to = target();
    if (!to) return;
    const body = { pace: pace.value, ...(to.place ? { place: to.place } : { x: to.x, y: to.y }), ...(state.canEdit && minutesTyped() != null && { minutes: minutesTyped() }) };
    dialog.close();
    journey(token, body);
  } },
  h('h2', {}, `${token.name} travels`),
  followers.length ? h('p', { class: 'muted small' }, `With ${followers.join(', ')} (following).`) : null,
  field('Where to', where),
  field('Pace', pace),
  effect,
  own,
  says,
  h('p', { class: 'muted small' }, `It's ${clockText(state.clock)}. They move along the map as the DM moves the clock on, 8 hours on the road a day.`),
  h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'), h('button', { class: 'primary' }, 'Set off'))));
  draw();
  if (!dialog.open) dialog.showModal();
}

/** Start, stop or finish a journey. */
async function journey(token, body) {
  try {
    const res = await state.guarded(() => api('POST', `${base()}/${state.current.id}/tokens/${token.id}/journey`, body));
    if (!res) return;
    onMap(res.map);
    if (res.token) select(res.token.id);
    status(res.token?.journey ? `${token.name}: ${journeyText(res.token.journey)}.` : `${token.name} ${body.arrive ? 'arrived' : 'stopped'}.`);
  } catch (err) {
    report(err);
  }
}

/** Where everyone on the road is going: a dashed line from each to where they're headed. */
export function renderRoutes() {
  const svg = $('#map-routes');
  const map = state.current;
  if (!svg) return;
  if (!map) return svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${map.image.width} ${map.image.height}`);
  svg.replaceChildren(...map.tokens.filter((t) => t.journey).flatMap((t) => [
    svgEl('line', { class: 'map-route', x1: t.x, y1: t.y, x2: t.journey.to.x, y2: t.journey.to.y, 'vector-effect': 'non-scaling-stroke', 'data-route': t.id }),
    svgEl('circle', { class: 'map-route-end', cx: t.journey.to.x, cy: t.journey.to.y, r: Math.max(3, map.image.width / 250), 'vector-effect': 'non-scaling-stroke' }),
  ]));
}
