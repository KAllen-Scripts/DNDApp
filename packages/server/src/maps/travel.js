/**
 * The world's travel, worked out on the server (the fourth stage, owner 2026-10-21: "Also wagons and maybe
 * even random encounters as we travel"): the way a journey goes (along roads or rivers when that's
 * quicker, slower through difficult terrain) and how long it takes; and what happens on the way as the
 * clock moves on (random encounters, forced marches), for the DM to run.
 */
import { MARCH_HOURS, PACES, TRAVEL_BY, journeyAt, milesPerPx, onTheRoadAt, pointInPolygon, travelMinutes } from '@dndapp/shared/map.js';
import { clockText } from '@dndapp/shared/settings.js';
import { parseRoll, rollDice } from '@dndapp/shared/dice.js';

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** How much of the straight line a→b (0 to 1) is in difficult terrain. */
function roughShare(map, a, b) {
  const areas = map.terrain ?? [];
  if (!areas.length) return 0;
  const steps = Math.max(8, Math.min(400, Math.ceil(dist(a, b) / (map.image.width / 400))));
  let inside = 0;
  for (let i = 0; i < steps; i++) {
    const f = (i + 0.5) / steps;
    const x = a.x + (b.x - a.x) * f;
    const y = a.y + (b.y - a.y) * f;
    if (areas.some((t) => pointInPolygon(x, y, t.points))) inside++;
  }
  return inside / steps;
}

/** The nearest point on segment s to p: { x, y, t (0 to 1 along it), d }. */
function onSegment(p, s) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.min(1, Math.max(0, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2)) : 0;
  const x = s.x1 + dx * t;
  const y = s.y1 + dy * t;
  return { x, y, t, d: Math.hypot(p.x - x, p.y - y) };
}

/**
 * The roads (or rivers) as a network: stretches whose ends meet (or an end on another stretch, a fork)
 * are joined. Returns { nodes: [{x, y}], edges: Map(node → [{ to, px }]), stops: [[{ node, t }]] (each
 * stretch's nodes in order along it) }.
 */
function network(segs, tol) {
  const nodes = [];
  const nodeAt = (p) => {
    const i = nodes.findIndex((n) => Math.hypot(n.x - p.x, n.y - p.y) <= tol);
    if (i >= 0) return i;
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };
  const ends = segs.flatMap((s) => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]);
  const stops = segs.map((s) => {
    const on = [{ node: nodeAt({ x: s.x1, y: s.y1 }), t: 0 }, { node: nodeAt({ x: s.x2, y: s.y2 }), t: 1 }];
    for (const e of ends) {
      const q = onSegment(e, s);
      if (q.d <= tol && q.t > 0 && q.t < 1) on.push({ node: nodeAt(q), t: q.t });
    }
    return on.sort((a, b) => a.t - b.t);
  });
  const edges = new Map();
  const join = (a, b) => {
    if (a === b) return;
    const px = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    for (const [u, v] of [[a, b], [b, a]]) {
      if (!edges.has(u)) edges.set(u, []);
      edges.get(u).push({ to: v, px });
    }
  };
  for (const on of stops) for (let i = 1; i < on.length; i++) join(on[i - 1].node, on[i].node);
  return { nodes, edges, stops };
}

/** Where p joins the network: a new node on the nearest stretch, joined to the nodes either side. */
function joinAt(net, segs, p) {
  let best = null;
  segs.forEach((s, i) => {
    const q = onSegment(p, s);
    if (!best || q.d < best.d) best = { ...q, seg: i };
  });
  const id = net.nodes.length;
  net.nodes.push({ x: best.x, y: best.y });
  const on = net.stops[best.seg];
  const after = on.findIndex((o) => o.t >= best.t);
  const sides = [on[Math.max(0, after - 1)], on[Math.max(0, after)]];
  net.edges.set(id, []);
  for (const o of sides) {
    const px = Math.hypot(net.nodes[o.node].x - best.x, net.nodes[o.node].y - best.y);
    net.edges.get(id).push({ to: o.node, px });
    net.edges.get(o.node).push({ to: id, px });
  }
  return { id, d: best.d, seg: best.seg, t: best.t };
}

/** The shortest way between two nodes: [node ids], or null. */
function shortest(net, from, to) {
  const n = net.nodes.length;
  const far = new Array(n).fill(Infinity);
  const back = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  far[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && far[i] < Infinity && (u < 0 || far[i] < far[u])) u = i;
    if (u < 0) return null;
    if (u === to) break;
    done[u] = true;
    for (const e of net.edges.get(u) ?? []) {
      if (far[u] + e.px < far[e.to]) {
        far[e.to] = far[u] + e.px;
        back[e.to] = u;
      }
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(back[path[0]]);
  return path;
}

/**
 * The way a journey goes and how long it takes: by `by` at `pace`, `hours` on the road a day. Over land
 * they go straight, or along the roads when that's quicker (no difficult terrain on a road; a wagon off
 * the road is slow everywhere); boats keep to the rivers. Returns { route: [[x, y, f]] or null (straight),
 * miles, road_miles, rough_miles, minutes }, with miles and minutes null on a map without a scale.
 */
export function planJourney(map, from, to, { by = 'foot', pace = 'normal', hours } = {}) {
  const mode = TRAVEL_BY[by] ?? TRAVEL_BY.foot;
  const perPx = milesPerPx(map);
  if (perPx == null) return { route: null, miles: null, road_miles: 0, rough_miles: 0, minutes: null };
  // The cost of going straight across country between two points, in miles at road speed.
  const across = (a, b) => {
    const miles = dist(a, b) * perPx;
    if (mode.water) return { miles, effort: miles, rough: 0 };
    const rough = miles * roughShare(map, a, b);
    return { miles, effort: mode.offRoad ? miles * mode.offRoad : miles + rough, rough };
  };
  const straight = across(from, to);
  let best = { legs: [from, to], miles: straight.miles, effort: straight.effort, road: 0, rough: straight.rough };
  const segs = (map.roads ?? []).filter((r) => r.kind === (mode.water ? 'river' : 'road'));
  if (segs.length) {
    const tol = Math.max(2, map.image.width / 500);
    const net = network(segs, tol);
    const a = joinAt(net, segs, from);
    const b = joinAt(net, segs, to);
    // Both ends on the same stretch: straight along it too.
    if (a.seg === b.seg) {
      const px = Math.hypot(net.nodes[a.id].x - net.nodes[b.id].x, net.nodes[a.id].y - net.nodes[b.id].y);
      net.edges.get(a.id).push({ to: b.id, px });
      net.edges.get(b.id).push({ to: a.id, px });
    }
    const path = shortest(net, a.id, b.id);
    if (path) {
      const on = path.map((i) => net.nodes[i]);
      const roadMiles = on.slice(1).reduce((s, p, i) => s + dist(on[i], p) * perPx, 0);
      const inLeg = across(from, on[0]);
      const outLeg = across(on.at(-1), to);
      const effort = inLeg.effort + roadMiles + outLeg.effort;
      if (effort <= best.effort + 1e-6) {
        best = { legs: [from, ...on, to], miles: inLeg.miles + roadMiles + outLeg.miles, effort, road: roadMiles, rough: inLeg.rough + outLeg.rough };
      }
    }
  }
  // Each stretch's share of the time, so the token moves along slower where the going is slow.
  let route = null;
  if (best.legs.length > 2) {
    const pts = best.legs.filter((p, i, all) => i === 0 || dist(all[i - 1], p) > 0.5);
    const costs = pts.slice(1).map((p, i) => {
      const onRoad = i > 0 && i < pts.length - 2;
      return onRoad ? dist(pts[i], p) * perPx : across(pts[i], p).effort;
    });
    const total = costs.reduce((s, c) => s + c, 0) || 1;
    let sum = 0;
    route = pts.map((p, i) => {
      if (i) sum += costs[i - 1];
      return [round(p.x, 1), round(p.y, 1), i === pts.length - 1 ? 1 : round(sum / total, 4)];
    });
    if (route.length < 3) route = null;
  }
  return {
    route,
    miles: round(best.miles, 1),
    road_miles: round(best.road, 1),
    rough_miles: round(best.rough, 1),
    minutes: travelMinutes(best.effort, pace in PACES ? pace : 'normal', { by, hours }),
  };
}

/** Roll the dice in an encounter line: "1d6+2 wolves" → "5 (1d6+2) wolves". */
export function rollLine(text, random) {
  return text.replace(/\b(\d*d\d+(?:\s*[+-]\s*\d+)?)\b/gi, (m) => {
    try {
      const r = rollDice(parseRoll(m.replace(/\s+/g, '')), { random });
      return `${r.total} (${r.notation})`;
    } catch {
      return m;
    }
  });
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const names = (list) => (list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);

/** The encounters for a spot on a map: an area place's own, else the map's; null for none. */
function encountersAt(map, p) {
  const area = (map.places ?? []).findLast((pl) => pl.encounters && pl.points && pointInPolygon(p.x, p.y, pl.points));
  return area ? { ...area.encounters, where: area.name } : map.encounters ? { ...map.encounters, where: '' } : null;
}

/**
 * What happens to everyone on the road between clock `from` and `to` (later): random encounters (rolled
 * every so many hours a group is out there, on the road or camped) and forced marches (each hour past 8
 * on the road in a day: a Constitution save or exhaustion). With `stop`, the first encounter stops the clock
 * there, so the DM runs it before anything later happens; `encounters` and `marches` false leave those out. Returns { until (where the clock ends up),
 * notes: [{ kind: 'encounter' | 'march', at, map_id, map, tokens, text }] } in order.
 */
export function onTheWay(maps, from, to, { random, stop = true, encounters = true, marches = true } = {}) {
  const events = [];
  for (const map of maps) {
    const groups = new Map();
    for (const t of map.tokens) {
      if (!t.journey) continue;
      const key = `${t.journey.lead ?? t.id}:${t.journey.leaves}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    for (const tokens of groups.values()) {
      const lead = tokens.find((t) => t.id === t.journey.lead) ?? tokens[0];
      const j = lead.journey;
      const start = Math.max(from, j.noted);
      const end = Math.min(to, j.arrives);
      if (end <= start) continue;
      const base = { on: map, map_id: map.id, map: map.name, tokens: tokens.map((t) => t.id), who: names(tokens.map((t) => t.name)), journey: j, lead };
      // Encounter checks, every so many hours out there.
      const checks = [map.encounters, ...(map.places ?? []).map((p) => p.encounters)].filter(Boolean).map((e) => e.every);
      if (encounters && checks.length) {
        // Checked as often as any of them asks; each one counts only its own hours.
        const every = checks.reduce((a, b) => gcd(a, b)) * 60;
        for (let at = j.leaves + every * Math.max(1, Math.floor((start - j.leaves) / every)); at <= end; at += every) {
          if (at > start && at < j.arrives) events.push({ ...base, kind: 'check', at });
        }
      }
      // A forced march: each hour past 8 on the road in a day.
      if (marches && !TRAVEL_BY[j.by]?.water && j.hours > MARCH_HOURS) {
        for (let day = Math.floor((start - j.leaves) / 1440); j.leaves + day * 1440 < end; day++) {
          const dcs = [];
          let last = null;
          for (let h = MARCH_HOURS + 1; h <= j.hours; h++) {
            const at = j.leaves + day * 1440 + h * 60;
            if (at > start && at <= end && at <= j.arrives) {
              dcs.push(10 + h - MARCH_HOURS);
              last = at;
            }
          }
          if (dcs.length) events.push({ ...base, kind: 'march', at: last, dcs });
        }
      }
    }
  }
  events.sort((a, b) => a.at - b.at || (a.kind === 'march' ? -1 : 1));
  const notes = [];
  let until = to;
  for (const e of events) {
    if (e.at > until) break;
    const { journey: j, lead } = e;
    const road = `${j.to_name ? `on the way to ${j.to_name}` : 'on the road'} (${e.map})`;
    if (e.kind === 'march') {
      notes.push({ kind: 'march', at: e.at, map_id: e.map_id, map: e.map, tokens: e.tokens, text: `${e.who} pushed on past ${MARCH_HOURS} hours on the road ${road}: each makes a Constitution save, DC ${names(e.dcs.map(String))}, or gains a level of exhaustion for each one failed.` });
      continue;
    }
    const spot = journeyAt(j, e.at);
    const enc = encountersAt(e.on, spot);
    if (!enc || (e.at - j.leaves) % (enc.every * 60) || random(100) > enc.chance) continue;
    const line = enc.table.length ? rollLine(enc.table[random(enc.table.length) - 1], random) : 'an encounter of your choosing';
    const camped = !onTheRoadAt(j, e.at);
    notes.push({ kind: 'encounter', at: e.at, map_id: e.map_id, map: e.map, tokens: e.tokens, x: spot.x, y: spot.y, lead: lead.id, text: `${e.who}, ${camped ? 'camped for the night ' : ''}${road}${enc.where ? ` in ${enc.where}` : ''}: ${line}` });
    if (stop) until = e.at;
  }
  return { until, notes };
}

/** "Day 2, 03:00: …" for a note. */
export const noteText = (n, calendar = null) => `${clockText(n.at, calendar)}: ${n.text}`;
