/**
 * Travel and time in the world (owner, 2026-10-18: "an in-game clock is part of the basics"; journeys
 * have their own arrival times): the campaign's in-game clock over the map (the DM moves it on), and
 * journeys across world and region maps: a character (and whoever follows them) sets off for a place or a
 * spot at a pace, the miles and the time come from the map's scale, and they move along as the clock goes.
 *
 * The fourth stage (owner, 2026-10-21): roads and rivers the DM draws, difficult terrain slowing journeys,
 * riding, wagons and boats, forced marches, and random encounters as the clock moves on, each of which the
 * DM can switch off in Campaign settings ("Not all tables want the same level of detail and realism").
 *
 * The server works out the way, the times and what happens on the way, and moves everyone; the page shows
 * it and sends what people do.
 */
import { api, h } from '../page/api.js';
import { MARCH_HOURS, PACES, TRAVEL_BY, isPinMap } from '/shared/map.js';
import { clockText, durationText } from '/shared/settings.js';
import { campaignSettings, onSettings } from '../campaign/settings.js';
import { dateText } from '/shared/calendar.js';
import { base, report, state, status } from './state.js';
import { field } from './dm-tools.js';
import { onMap, select, svgEl } from './map.js';

const $ = (sel) => document.querySelector(sel);
/** The campaign's calendar (Campaign settings), or null for "Day N". */
const calendar = () => campaignSettings().calendar;

/** "On the road to Daggerford, due Day 3, 12:00" for a token's journey. */
export const journeyText = (j) => `On the road${j.to_name ? ` to ${j.to_name}` : ''}, due ${clockText(j.arrives, calendar())}`;

/** The clock over the map: the day and time (the DM's opens the clock to move it on). */
export function renderClock() {
  const el = $('#map-clock');
  if (!el) return;
  el.hidden = state.clock == null;
  if (state.clock == null) return;
  el.textContent = clockText(state.clock, calendar());
  el.disabled = !state.canEdit;
  el.title = state.canEdit ? 'The in-game clock: move it on (journeys move with it)' : 'The in-game day and time';
}

// A new calendar (Campaign settings) renames the days.
onSettings(() => renderClock());

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
  const notes = h('ul', { class: 'small map-road-notes' });
  const stop = h('input', { type: 'checkbox', id: 'map-clock-stop', checked: true });
  const road = h('ul', { class: 'small map-road' });
  const day = h('input', { type: 'number', min: '1', step: '1', class: 'map-num', 'aria-label': 'Day' });
  const time = h('input', { type: 'time', 'aria-label': 'Time of day' });
  // With a calendar, the day number says which date it is.
  const date = h('span', { class: 'muted small map-clock-date' });
  const sayDate = () => { date.textContent = calendar() ? dateText((Math.max(1, Math.round(Number(day.value) || 1)) - 1) * 1440, calendar()) : ''; };
  day.addEventListener('input', sayDate);
  const draw = () => {
    now.textContent = clockText(state.clock, calendar());
    day.value = String(Math.floor(state.clock / 1440) + 1);
    const m = state.clock % 1440;
    time.value = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    sayDate();
    const list = onTheRoad();
    road.replaceChildren(...(list.length ? list.map(({ token, map }) => h('li', {}, `${token.name} (${map.name}): ${journeyText(token.journey)}`)) : [h('li', { class: 'muted' }, 'Nobody is on the road.')]));
    next.disabled = !list.some(({ token }) => token.journey.arrives > state.clock);
  };
  const move = async (body, said) => {
    try {
      const res = await state.guarded(() => api('POST', `/campaigns/${state.campaignId}/clock`, { ...body, stop: stop.checked }));
      if (!res) return;
      // Journeys moved on the maps too: catch up.
      const { maps } = await api('GET', base());
      state.maps = maps;
      for (const m of maps) onMap(m);
      onClock(res);
      const met = res.notes?.find((n) => n.kind === 'encounter' && n.at === res.clock);
      result.textContent = met ? `Stopped at ${clockText(res.clock, calendar())} for a random encounter: run it, then move the clock on.` : said ?? `It's now ${clockText(res.clock, calendar())}.`;
      showNotes(notes, res.notes);
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
  h('div', { class: 'map-row' }, field('Day', day), field('Time', time), h('button', { class: 'ghost', type: 'submit' }, 'Set'), date),
  h('label', { class: 'check', title: 'When a random encounter comes up, the clock stops there so you can run it' }, stop, ' Stop for random encounters'),
  h('h3', {}, 'On the road'),
  road,
  result,
  notes,
  h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Close'))));
  draw();
  if (!dialog.open) dialog.showModal();
}

/** What happened on the road (random encounters, forced marches, merchants restocking), for the DM. */
export function showNotes(list, notes = []) {
  const said = { encounter: 'Random encounter', march: 'Forced march', restock: 'Restocked' };
  list.replaceChildren(...notes.map((n) => h('li', { class: `map-road-note ${n.kind}` }, h('strong', {}, `${said[n.kind] ?? 'On the road'}, ${clockText(n.at, calendar())}: `), n.text)));
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
 * Where to, and how: a place on this map or a spot clicked on it, how they travel (on foot, riding, a
 * wagon, a boat), the pace and hours on the road a day; the server says the way (roads, rivers, difficult
 * terrain), the miles and how long, with when they'd arrive. The DM can say how long instead.
 */
function travelDialog(token, spot = null, placeId = null) {
  const map = state.current;
  const dialog = $('#map-dialog');
  const places = map.places ?? [];
  const travel = campaignSettings().travel;
  const where = h('select', { 'aria-label': 'Where to' },
    ...(spot ? [new Option('The spot you clicked', 'spot')] : []),
    ...places.map((p) => new Option(p.name, p.id)),
    new Option('Click a spot on the map…', 'pick'));
  const by = h('select', { 'aria-label': 'Travel by' }, ...Object.entries(TRAVEL_BY).map(([k, m]) => new Option(m.name, k)));
  const byField = field('Travel by', by);
  byField.hidden = !travel.vehicles;
  const pace = h('select', { 'aria-label': 'Pace' }, ...Object.entries(PACES).map(([k, p]) => new Option(`${p.name} (${p.perDay} miles a day)`, k)));
  pace.value = 'normal';
  const paceField = field('Pace', pace);
  const perDay = h('input', { type: 'number', min: '1', max: '24', step: '1', class: 'map-num', 'aria-label': 'Hours a day', value: '8' });
  const timed = travel.time === 'clock';
  const perDayField = field('Hours a day', perDay);
  perDayField.hidden = !timed;
  if (placeId) where.value = placeId;
  const days = h('input', { type: 'number', min: '0', step: '1', class: 'map-num', 'aria-label': 'Days' });
  const hours = h('input', { type: 'number', min: '0', step: 'any', class: 'map-num', 'aria-label': 'Hours' });
  const own = h('div', { class: 'map-row' }, field('Days', days), field('Hours', hours));
  own.hidden = !state.canEdit;
  const says = h('p', { class: 'map-travel-says' });
  const effect = h('p', { class: 'muted small' });
  const march = h('p', { class: 'small map-travel-march' });
  const target = () => {
    if (where.value === 'spot') return { ...spot };
    const p = places.find((x) => x.id === where.value);
    return p ? { x: p.x, y: p.y, place: p.id, name: p.name } : null;
  };
  let typed = false;
  for (const el of [days, hours]) el.addEventListener('input', () => { typed = true; draw(); });
  const minutesTyped = () => (typed && (days.value || hours.value) ? Math.round((Number(days.value) || 0) * 1440 + (Number(hours.value) || 0) * 60) : null);
  const mode = () => (travel.vehicles ? by.value : 'foot');
  const body = (to) => ({
    pace: pace.value,
    ...(travel.vehicles && { by: by.value }),
    ...(timed && perDay.value && { hours: Math.min(24, Math.max(1, Math.round(Number(perDay.value)))) }),
    ...(to.place ? { place: to.place } : { x: to.x, y: to.y }),
  });
  // Ask the server what it would be; only the latest answer counts.
  let asked = 0;
  const draw = async () => {
    const m = TRAVEL_BY[mode()];
    paceField.hidden = !!m.water;
    effect.textContent = [m.water ? '' : PACES[pace.value].effect, m.effect].filter(Boolean).join(' ');
    const n = Number(perDay.value);
    march.textContent = timed && travel.marches && !m.water && n > MARCH_HOURS
      ? `A forced march: at the end of each hour past ${MARCH_HOURS} on the road in a day, each of them makes a Constitution save (DC 10 + 1 for each hour past ${MARCH_HOURS}) or gains a level of exhaustion.`
      : '';
    const to = target();
    if (!to) return (says.textContent = 'Pick where they go.');
    const mine = ++asked;
    let plan;
    try {
      ({ plan } = await api('POST', `${base()}/${map.id}/tokens/${token.id}/journey`, { ...body(to), preview: true }));
    } catch (err) {
      if (mine === asked) says.textContent = `Couldn't work that out: ${err.message}`;
      return;
    }
    if (mine !== asked) return;
    const minutes = minutesTyped() ?? plan.minutes;
    if (minutes == null) {
      says.textContent = state.canEdit ? 'This map has no scale, so say how long it takes (or set its scale in Map settings).' : "This map has no scale yet, so there's no telling how long that takes. Ask your DM.";
      return;
    }
    if (!typed && state.canEdit) {
      days.value = String(Math.floor(minutes / 1440));
      hours.value = String(Math.round((minutes % 1440) / 60));
    }
    const how = [
      plan.road_miles ? `${plan.road_miles} by ${TRAVEL_BY[plan.by].water ? 'river' : 'road'}` : '',
      plan.rough_miles ? `${plan.rough_miles} through difficult terrain` : '',
    ].filter(Boolean).join(', ');
    const far = plan.miles != null ? `${plan.miles} miles${how ? ` (${how})` : ''}: ` : '';
    const pacing = minutesTyped() == null && !TRAVEL_BY[plan.by].water ? ` at a ${PACES[pace.value].name.toLowerCase()} pace` : '';
    const when = travel.time === 'clock' ? `arriving ${clockText(state.clock + minutes, calendar())}` : travel.time === 'skip' ? `skipped: they get there at once and the clock jumps on to ${clockText(state.clock + minutes, calendar())}` : 'skipped: they get there at once';
    says.textContent = `${far}${durationText(minutes)}${pacing}, ${when}.`;
  };
  where.addEventListener('change', () => {
    if (where.value !== 'pick') return draw();
    dialog.close();
    state.travelPick = token.id;
    $('#map-view').classList.add('picking');
    status(`Click where ${token.name} goes.`);
  });
  by.addEventListener('change', () => { typed = false; perDay.value = String(TRAVEL_BY[by.value].hours); draw(); });
  pace.addEventListener('change', () => { typed = false; draw(); });
  perDay.addEventListener('input', () => { typed = false; draw(); });
  const followers = map.tokens.filter((t) => t.follows === token.id).map((t) => t.name);
  dialog.replaceChildren(h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
    e.preventDefault();
    const to = target();
    if (!to) return;
    dialog.close();
    journey(token, { ...body(to), ...(state.canEdit && minutesTyped() != null && { minutes: minutesTyped() }) });
  } },
  h('h2', {}, `${token.name} travels`),
  followers.length ? h('p', { class: 'muted small' }, `With ${followers.join(', ')} (following: they ride along).`) : null,
  field('Where to', where),
  byField,
  paceField,
  perDayField,
  effect,
  march,
  own,
  says,
  h('p', { class: 'muted small' }, timed ? `It's ${clockText(state.clock, calendar())}. They move along the map as the DM moves the clock on.` : `It's ${clockText(state.clock, calendar())}.`),
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
    if (res.clock !== state.clock) {
      // Travel time skipped: the clock jumped on, and others on the road moved along.
      const { maps } = await api('GET', base());
      state.maps = maps;
      for (const m of maps) onMap(m);
      onClock({ clock: res.clock });
    }
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
    // Along the roads it keeps to, from where it is now.
    t.journey.route
      ? svgEl('polyline', { class: 'map-route', points: [[t.x, t.y], ...t.journey.route.filter((p) => p[2] > routeDone(t))].map(([x, y]) => `${x},${y}`).join(' '), 'vector-effect': 'non-scaling-stroke', 'data-route': t.id })
      : svgEl('line', { class: 'map-route', x1: t.x, y1: t.y, x2: t.journey.to.x, y2: t.journey.to.y, 'vector-effect': 'non-scaling-stroke', 'data-route': t.id }),
    svgEl('circle', { class: 'map-route-end', cx: t.journey.to.x, cy: t.journey.to.y, r: Math.max(3, map.image.width / 250), 'vector-effect': 'non-scaling-stroke' }),
  ]));
}

/** How far along its route (0 to 1) a token on the road is: the route point nearest where it stands. */
function routeDone(t) {
  const r = t.journey.route;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < r.length - 1; i++) {
    const [ax, ay, af] = r[i];
    const [bx, by, bf] = r[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const g = Math.min(1, Math.max(0, ((t.x - ax) * dx + (t.y - ay) * dy) / len2));
    const d = Math.hypot(ax + dx * g - t.x, ay + dy * g - t.y);
    if (d < bestD) [best, bestD] = [af + (bf - af) * g, d];
  }
  return best;
}

// ---------- roads and rivers (the DM draws them in Edit map, on world and region maps) ----------

/** Drawing roads or rivers. */
export const roadMode = () => state.wallMode === 'road' || state.wallMode === 'river';

/** The roads and rivers as lines, for the DM while editing the map. */
export function renderRoads(svg, map) {
  for (const r of map.roads ?? []) svg.append(svgEl('line', { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2, class: `map-road-line ${r.kind}`, 'vector-effect': 'non-scaling-stroke' }));
}

/** Add, remove or clear roads and rivers (the DM). */
export async function roads(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/roads`, body));
    if (saved) onMap(saved);
  } catch (err) {
    report(err);
  }
}
