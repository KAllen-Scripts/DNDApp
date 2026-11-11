/**
 * The world (moved out of map.js, which re-exports it): places on maps and
 * maps inside maps; roads, rivers, journeys, the clock's travel times and
 * random encounters. Plain JS, used by the server and the page.
 */
import { isTokenId, normalizePageLink, normalizeRecordLink, normalizeUserIds, num, pick, round, snapToken, str, tokenPx, unitsPerPx } from './map.js';
import { pointInPolygon } from './map-sight.js';

// ---------- the world: places on maps, and maps inside maps ----------

export const MAX_PLACES = 200;
export const MAX_PLACE_POINTS = 40;

/**
 * Places on a map (the world's atlas, owner 2026-10-18: "We want to be able to make an entire world.
 * Connected maps, a world map"): [{ id, name, x, y, points?, group, to?, record?, revealed, revealed_to }].
 * A place is a pin (x, y) or an area (`points`, with x, y where its name goes); `group` sorts places
 * for showing and hiding together (Cities, Roads); `to` is a smaller map it opens (a town on a region
 * map, a tavern in a town); `record` the archivist's record about it (the DM's); players get it only
 * once it's `revealed` (to everyone, or to the players in `revealed_to`).
 */
export function normalizePlaces(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || !isTokenId(p.id) || seen.has(p.id) || out.length >= MAX_PLACES) continue;
    seen.add(p.id);
    const points = (Array.isArray(p.points) ? p.points : []).slice(0, MAX_PLACE_POINTS)
      .map((q) => [round(num(q?.[0], { min: 0, max: width, fallback: 0 }), 1), round(num(q?.[1], { min: 0, max: height, fallback: 0 }), 1)]);
    out.push({
      id: String(p.id),
      name: str(p.name, 80) || 'Place',
      x: round(num(p.x, { min: 0, max: width, fallback: width / 2 }), 2),
      y: round(num(p.y, { min: 0, max: height, fallback: height / 2 }), 2),
      ...(points.length >= 3 ? { points } : {}),
      group: str(p.group, 40),
      to: /^[a-f0-9]{10}$/.test(String(p.to)) ? String(p.to) : null,
      record: normalizeRecordLink(p.record),
      page: normalizePageLink(p.page),
      revealed: p.revealed === true,
      revealed_to: normalizeUserIds(p.revealed_to),
      // Its own random encounters for travellers inside its area (a forest, the marshes); the DM's alone.
      ...(points.length >= 3 && normalizeEncounters(p.encounters) ? { encounters: normalizeEncounters(p.encounters) } : {}),
    });
  }
  return out;
}

/** The map holding a place that opens map `id`, with that place: { map, place }, or null for a top map. */
export function parentOf(maps, id) {
  for (const m of maps) {
    const place = (m.places ?? []).find((p) => p.to === id);
    if (place && m.id !== id) return { map: m, place };
  }
  return null;
}

/** The maps from the top of the world down to map `id` (its breadcrumb), ending with it. */
export function mapTrail(maps, id) {
  const byId = new Map(maps.map((m) => [m.id, m]));
  const trail = [];
  const seen = new Set();
  for (let m = byId.get(id); m && !seen.has(m.id); m = parentOf(maps, m.id)?.map) {
    seen.add(m.id);
    trail.unshift(m);
  }
  return trail;
}

/**
 * Why a place on map `on` can't open map `to`, or '' if it can: each map sits in one place only, and
 * a map can't be inside itself (a place on the town opening the region the town is in). `except`: the
 * place being changed.
 */
export function placeProblem(maps, on, to, except = null) {
  if (!to) return '';
  if (to === on) return 'A place has to open another map.';
  const holder = maps.find((m) => (m.places ?? []).some((p) => p.to === to && p.id !== except));
  if (holder) return `That map is already a place on "${holder.name}". Remove it there first.`;
  if (mapTrail(maps, on).some((m) => m.id === to)) return 'That map is around this one already: a map can’t be inside itself.';
  return '';
}

/** The maps in world order: each top map, then the maps inside it, with their depth (for the DM's map list). */
export function atlasOrder(maps) {
  const children = new Map();
  const placed = new Set();
  for (const m of maps) {
    for (const p of m.places ?? []) {
      if (!p.to || p.to === m.id || placed.has(p.to) || !maps.some((x) => x.id === p.to)) continue;
      placed.add(p.to);
      children.set(m.id, [...(children.get(m.id) ?? []), p.to]);
    }
  }
  const byId = new Map(maps.map((m) => [m.id, m]));
  const out = [];
  const seen = new Set();
  const walk = (m, depth) => {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    out.push({ map: m, depth });
    for (const c of children.get(m.id) ?? []) walk(byId.get(c), depth + 1);
  };
  for (const m of maps) if (!placed.has(m.id)) walk(m, 0);
  // Anything left is in a loop (shouldn't happen): list it at the top.
  for (const m of maps) walk(m, 0);
  return out;
}

/** Is a point close enough to a link to use it? Within a square and a half (or 5% of the map's size without a grid). */
export function nearLink(map, link, x, y) {
  const reach = map.grid ? map.grid.size * 1.5 : Math.max(map.image.width, map.image.height) * 0.05;
  return Math.hypot(link.x - x, link.y - y) <= reach;
}

/**
 * Maps where tokens are pins of one size on screen, whatever the zoom: a world or region map, where a
 * character at the map's scale would be a speck (owner, 2026-10-18: each character their own pin).
 */
export const PIN_MAP_KINDS = ['world', 'region'];
export const isPinMap = (map) => PIN_MAP_KINDS.includes(map?.kind);

/**
 * Where a player's character is: the map with their character's token on it, or null. If the DM put
 * it on several maps (before one map per character), the one changed last.
 */
export function characterMap(maps, userId) {
  let best = null;
  for (const m of maps) {
    if (!m.tokens?.some((t) => t.kind === 'pc' && t.user_id === userId)) continue;
    if (!best || String(m.updated_at ?? '') > String(best.updated_at ?? '')) best = m;
  }
  return best;
}

/** A token and everyone following it (and following them), leader first. */
export function followGroup(tokens, id) {
  const out = [];
  const seen = new Set();
  const queue = [id];
  while (queue.length) {
    const next = queue.shift();
    const t = tokens.find((x) => x.id === next);
    if (!t || seen.has(next)) continue;
    seen.add(next);
    out.push(t);
    for (const f of tokens) if (f.follows === next && !seen.has(f.id)) queue.push(f.id);
  }
  return out;
}

/** Would `id` following `leader` go round in a circle (the leader following it, however far back)? */
export function followLoop(tokens, id, leader) {
  const seen = new Set();
  for (let t = tokens.find((x) => x.id === leader); t && !seen.has(t.id); t = tokens.find((x) => x.id === t.follows)) {
    if (t.id === id) return true;
    seen.add(t.id);
  }
  return false;
}

/** The point `back` along a path from its end, walking backwards; and the path up to there. */
function walkBack(path, back) {
  for (let i = path.length - 1; i > 0; i--) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len >= back && len > 0) {
      const f = (len - back) / len;
      const at = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      return { at, path: [...path.slice(0, i), at] };
    }
    back -= len;
  }
  return { at: path[0], path: [path[0]] };
}

/**
 * The leader moved along `route` (from where it was to where it is now): everyone following it walks
 * behind it along the same way, one behind the other, and anyone following them behind them. Changes
 * the map's tokens in place. Not in a fight: there everyone moves on their own turn.
 */
export function trailFollowers(map, leaderId, route) {
  const queue = [{ id: leaderId, path: route }];
  const seen = new Set([leaderId]);
  while (queue.length) {
    const { id, path } = queue.shift();
    const leader = map.tokens.find((t) => t.id === id);
    let back = tokenPx(map, leader) / 2;
    for (const f of map.tokens.filter((t) => t.follows === id && !seen.has(t.id))) {
      seen.add(f.id);
      const half = tokenPx(map, f) / 2;
      back += half;
      const walked = walkBack([{ x: f.x, y: f.y }, ...path], back);
      Object.assign(f, snapToken(map, f, walked.at.x, walked.at.y));
      queue.push({ id: f.id, path: [...walked.path.slice(0, -1), { x: f.x, y: f.y }] });
      back += half;
    }
  }
}

/**
 * Spots for a group arriving at `at` on a map: the first one there, the rest round it, a token's
 * width apart (a ring, then a wider ring). On a grid they snap to squares.
 */
export function arrivalSpots(map, tokens, at) {
  const step = Math.max(...tokens.map((t) => tokenPx(map, t)), 1);
  const out = [];
  let i = 0;
  for (const t of tokens) {
    let x = at.x;
    let y = at.y;
    if (i > 0) {
      const ring = Math.ceil(i / 8);
      const a = ((i - 1) % 8) * (Math.PI / 4) + (ring - 1) * (Math.PI / 8);
      x += Math.cos(a) * step * ring;
      y += Math.sin(a) * step * ring;
    }
    out.push(snapToken(map, t, x, y));
    i++;
  }
  return out;
}

/** Is (x, y) at a place: inside its area, or next to its pin (as near as next to a link)? */
export const nearPlace = (map, place, x, y) => (place.points ? pointInPolygon(x, y, place.points) : false) || nearLink(map, place, x, y);

/**
 * Travel pace (Player's Handbook, both editions): miles a day, a day's travel being 8 hours on the road
 * (the books' table: slow 18, normal 24, fast 30; their miles an hour, 2, 3 and 4, don't quite add up to
 * that, so a day's miles are what counts). What each pace costs differs by edition; `effect` says both.
 */
export const PACES = {
  slow: { name: 'Slow', perDay: 18, effect: 'Able to move stealthily (2014); advantage on Perception and Survival checks (2024)' },
  normal: { name: 'Normal', perDay: 24, effect: '' },
  fast: { name: 'Fast', perDay: 30, effect: '−5 to passive Perception (2014); disadvantage on Perception and Survival checks (2024)' },
};
export const TRAVEL_HOURS_PER_DAY = 8;
const IN_MILES = { ft: 1 / 5280, m: 1 / 1609.344, mi: 1, km: 1 / 1.609344 };

/**
 * How they travel (owner, 2026-10-21: "Also wagons"). Over land a day's miles come from the pace whatever
 * carries them (the books: a mount covers what a walker does in a day, but can gallop for an hour); a wagon
 * finds everything off the roads as hard going as difficult terrain (our call: the books say nothing, and
 * the DM can always say how long). Boats go by their own speed (the Player's Handbook's vehicles table, in
 * miles an hour) and follow rivers; a crew working in shifts keeps a ship going day and night.
 */
export const TRAVEL_BY = {
  foot: { name: 'On foot', hours: 8, effect: '' },
  riding: { name: 'Riding', hours: 8, effect: 'A day in the saddle covers what a day on foot does; a mount can gallop for an hour at twice the fast pace.' },
  wagon: { name: 'Wagon or cart', hours: 8, offRoad: 2, effect: 'Off the roads, all ground is as slow as difficult terrain for a wagon (half speed).' },
  rowboat: { name: 'Rowboat', water: true, mph: 1.5, hours: 8, effect: '1½ miles an hour, rowed.' },
  keelboat: { name: 'Keelboat', water: true, mph: 1, hours: 24, effect: '1 mile an hour; a crew in shifts keeps it going day and night.' },
  sailing: { name: 'Sailing ship', water: true, mph: 2, hours: 24, effect: '2 miles an hour; a crew in shifts keeps it going day and night.' },
  longship: { name: 'Longship', water: true, mph: 3, hours: 24, effect: '3 miles an hour; a crew in shifts keeps it going day and night.' },
  galley: { name: 'Galley', water: true, mph: 4, hours: 24, effect: '4 miles an hour; a crew in shifts keeps it going day and night.' },
  warship: { name: 'Warship', water: true, mph: 2.5, hours: 24, effect: '2½ miles an hour; a crew in shifts keeps it going day and night.' },
};

/** Past this many hours on the road a day, a march is forced: a Constitution save each hour or exhaustion (Player's Handbook). */
export const MARCH_HOURS = 8;

/** How many miles one image pixel is on this map, or null without a scale. */
export function milesPerPx(map) {
  const per = unitsPerPx(map);
  return per == null ? null : per * (IN_MILES[map.scale.unit] ?? 1);
}

/**
 * How long a journey of `miles` takes, in minutes of the clock: at the pace's miles a day (or a boat's
 * miles an hour), `hours` on the road a day (8 unless they push on, or a ship's crew works in shifts), so
 * 30 miles at a normal pace is a day's travel (8 hours), a night, and 2 hours more the next day.
 */
export function travelMinutes(miles, pace = 'normal', { by = 'foot', hours } = {}) {
  const mode = TRAVEL_BY[by] ?? TRAVEL_BY.foot;
  const mph = mode.water ? mode.mph : (PACES[pace] ?? PACES.normal).perDay / TRAVEL_HOURS_PER_DAY;
  const perDay = Math.min(24, Math.max(1, hours ?? mode.hours));
  const onRoad = miles / mph;
  if (!(onRoad > 0)) return 0;
  const nights = Math.ceil(onRoad / perDay - 1e-9) - 1;
  return Math.round(nights * 1440 + (onRoad - nights * perDay) * 60);
}

/** Is this clock minute of a journey on the road (not stopped for the night)? */
export const onTheRoadAt = (j, t) => (t - j.leaves) % 1440 < j.hours * 60;

export const MAX_ROUTE_POINTS = 400;

/**
 * A token's journey: { from: {x, y}, to: {x, y}, leaves, arrives (clock minutes), pace, by (how they travel),
 * hours (on the road a day), miles (null: no scale), road_miles (along roads or rivers), rough_miles
 * (through difficult terrain), route ([[x, y, f], ...] the way they go, f how far along it in time, or null
 * for a straight line), lead (the token leading the group), noted (the clock up to which encounters and
 * forced marches have been looked at), to_name }, or null.
 */
export function normalizeJourney(j, image = {}) {
  if (!j || typeof j !== 'object') return null;
  const { width = 1, height = 1 } = image;
  const point = (p) => ({ x: num(p?.x, { min: 0, max: width, fallback: 0 }), y: num(p?.y, { min: 0, max: height, fallback: 0 }) });
  const leaves = Number.isInteger(j.leaves) && j.leaves >= 0 ? j.leaves : null;
  const arrives = Number.isInteger(j.arrives) && j.arrives >= (leaves ?? 0) ? j.arrives : null;
  if (leaves == null || arrives == null) return null;
  const by = j.by in TRAVEL_BY ? j.by : 'foot';
  const route = Array.isArray(j.route) && j.route.length >= 2
    ? j.route.slice(0, MAX_ROUTE_POINTS).map((p) => [round(num(p?.[0], { min: 0, max: width, fallback: 0 }), 1), round(num(p?.[1], { min: 0, max: height, fallback: 0 }), 1), round(num(p?.[2], { min: 0, max: 1, fallback: 0 }), 4)])
    : null;
  const miles = (v) => (v == null ? null : round(num(v, { min: 0, max: 1e7, fallback: 0 }), 1));
  return {
    from: point(j.from),
    to: point(j.to),
    leaves,
    arrives,
    pace: j.pace in PACES ? j.pace : 'normal',
    by,
    hours: Math.round(num(j.hours, { min: 1, max: 24, fallback: TRAVEL_BY[by].hours })),
    miles: miles(j.miles),
    road_miles: miles(j.road_miles) ?? 0,
    rough_miles: miles(j.rough_miles) ?? 0,
    route,
    lead: isTokenId(j.lead) ? String(j.lead) : null,
    noted: Number.isInteger(j.noted) && j.noted >= leaves ? j.noted : leaves,
    to_name: str(j.to_name, 80),
  };
}

/**
 * Where a journey has got to at clock `now`: { x, y, done }. They move only while on the road (`hours` a day
 * from when they left; camped the rest), evenly over the road time, along the route (each stretch taking
 * its share of the time: slower through difficult terrain) or a straight line.
 */
export function journeyAt(j, now) {
  const perDay = (j.hours ?? TRAVEL_HOURS_PER_DAY) * 60;
  const roadTime = (t) => {
    const d = Math.max(0, t - j.leaves);
    return Math.floor(d / 1440) * perDay + Math.min(d % 1440, perDay);
  };
  const total = roadTime(j.arrives);
  const f = total > 0 ? Math.min(1, roadTime(now) / total) : 1;
  const done = now >= j.arrives;
  if (!j.route) return { x: round(j.from.x + (j.to.x - j.from.x) * f, 1), y: round(j.from.y + (j.to.y - j.from.y) * f, 1), done };
  const r = j.route;
  let i = 0;
  while (i < r.length - 2 && r[i + 1][2] < f) i++;
  const [ax, ay, af] = r[i];
  const [bx, by, bf] = r[i + 1];
  const g = bf > af ? Math.min(1, Math.max(0, (f - af) / (bf - af))) : 1;
  return { x: round(ax + (bx - ax) * g, 1), y: round(ay + (by - ay) * g, 1), done };
}

// ---------- roads, rivers and random encounters (the world's travel) ----------

export const ROAD_KINDS = ['road', 'river'];
export const MAX_ROADS = 2000;

/**
 * Roads and rivers on a world or region map: [{ id, kind, x1, y1, x2, y2 }], stretches drawn end to end
 * like walls. Travellers over land keep to the roads where that's quicker (no difficult terrain on a
 * road); boats keep to the rivers.
 */
export function normalizeRoads(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || !isTokenId(r.id) || seen.has(r.id) || out.length >= MAX_ROADS) continue;
    const x1 = num(r.x1, { min: 0, max: width, fallback: null });
    const y1 = num(r.y1, { min: 0, max: height, fallback: null });
    const x2 = num(r.x2, { min: 0, max: width, fallback: null });
    const y2 = num(r.y2, { min: 0, max: height, fallback: null });
    if (x1 == null || y1 == null || x2 == null || y2 == null || Math.hypot(x2 - x1, y2 - y1) < 1) continue;
    seen.add(r.id);
    out.push({ id: String(r.id), kind: pick(r.kind, ROAD_KINDS, 'road'), x1: round(x1, 1), y1: round(y1, 1), x2: round(x2, 1), y2: round(y2, 1) });
  }
  return out;
}

/** Where a road or river being drawn should end: on the nearest end of one within `maxDist`, else where the pointer is. */
export function snapRoadPoint(map, p, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const r of map.roads ?? []) {
    for (const [x, y] of [[r.x1, r.y1], [r.x2, r.y2]]) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bestD) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  return best ?? { x: round(p.x, 1), y: round(p.y, 1) };
}

export const MAX_ENCOUNTER_LINES = 50;

/**
 * Random encounters while travelling (owner, 2026-10-21: "maybe even random encounters as we travel"), on a
 * world or region map or an area place on one: every `every` hours a group is out there (on the road or
 * camped), a `chance` in 100 of one, picked from `table` (one per line; dice in a line are rolled: "1d6+2
 * wolves"). The DM's alone. Null: none.
 */
export function normalizeEncounters(e) {
  if (!e || typeof e !== 'object') return null;
  return {
    chance: Math.round(num(e.chance, { min: 0, max: 100, fallback: 15 })),
    every: Math.round(num(e.every, { min: 1, max: 24, fallback: 4 })),
    table: (Array.isArray(e.table) ? e.table : []).map((l) => str(l, 200)).filter(Boolean).slice(0, MAX_ENCOUNTER_LINES),
  };
}
