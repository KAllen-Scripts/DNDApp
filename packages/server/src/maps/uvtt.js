/**
 * Universal VTT files (.dd2vtt from Dungeondraft, .uvtt, .df2vtt and others):
 * a map maker's export with the picture, the grid, and exact walls, doors and
 * lights. Positions in the file are in grid squares from `map_origin`.
 *
 * The format (version 0.2 / 0.3; toUvtt writes 0.3):
 *   { format, resolution: { map_origin: {x, y}, map_size: {x, y}, pixels_per_grid },
 *     line_of_sight: [[{x, y}, ...], ...], objects_line_of_sight?: [[...]],
 *     portals: [{ position, bounds: [{x, y}, {x, y}], rotation, closed, freestanding }],
 *     lights: [{ position: {x, y}, range, intensity, color, shadows }], image: base64 }
 *
 * Our own files add a `dndapp` block that other VTTs ignore, so taking a map
 * out and back in keeps what the format has no place for (positions in
 * squares, like the rest; heights in feet):
 *   dndapp: { version: 1, obstacles: [[{x, y}, {x, y}], ...],
 *     raised: [{ points: [{x, y}, ...], height }], climbs: [{ kind, from: {x, y}, to: {x, y} }],
 *     terrain: [[{x, y}, ...], ...] }
 * and its portals carry `secret` and `locked`, its lights `bright` and `dim` (in squares).
 */
import { MAX_WALLS, MAX_LIGHTS, MAX_RAISED, MAX_CLIMBS, MAX_TERRAIN, CLIMB_KINDS } from '@dndapp/shared/map.js';
import { BadRequestError } from '../store.js';

/** Whether this upload looks like a Universal VTT file (JSON with a resolution and walls or a picture). */
export function isUvtt(buf) {
  let i = 0;
  while (i < buf.length && i < 64 && /\s/.test(String.fromCharCode(buf[i]))) i++;
  if (buf[i] !== 0x7b) return false; // '{'
  return buf.subarray(0, 4096).includes('"resolution"') || buf.includes('"pixels_per_grid"');
}

/** Read the JSON of a Universal VTT file, or say what's wrong with it. */
export function readUvtt(buf) {
  let doc;
  try {
    doc = JSON.parse(buf.toString('utf8'));
  } catch {
    throw new BadRequestError("That file can't be read. Export the map again as a Universal VTT file (.dd2vtt or .uvtt).");
  }
  const r = doc?.resolution;
  const ppg = Number(r?.pixels_per_grid);
  if (!r || !(ppg > 0) || !(Number(r.map_size?.x) > 0) || !(Number(r.map_size?.y) > 0)) {
    throw new BadRequestError("That isn't a Universal VTT file (it has no map size or grid). Export the map again as .dd2vtt or .uvtt.");
  }
  return doc;
}

/** The picture inside a Universal VTT file, or null. */
export function uvttImage(doc) {
  if (typeof doc.image !== 'string' || !doc.image) return null;
  const buf = Buffer.from(doc.image.replace(/^data:[^,]*,/, ''), 'base64');
  return buf.length ? buf : null;
}

/** Drop the middle points of runs that go straight on (within half a degree), so long walls stay one line. */
function straightRuns(points) {
  const out = [];
  for (const p of points) {
    if (out.length >= 2) {
      const a = out.at(-2);
      const b = out.at(-1);
      const turn = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(p.y - b.y, p.x - b.x));
      if (Math.min(turn, 2 * Math.PI - turn) < Math.PI / 360) out.pop();
    }
    if (!out.length || Math.hypot(p.x - out.at(-1).x, p.y - out.at(-1).y) >= 0.5) out.push(p);
  }
  return out;
}

/**
 * The walls, doors, lights and grid in a Universal VTT file, in pixels of a
 * map picture of `width` × `height` (the file's picture, or the DM's own of
 * the same map at any size: the file is stretched to fit it).
 * `feetPerSquare` turns light ranges (in squares) into the map's unit.
 * Returns { walls: [{ x1, y1, x2, y2, door, open, kind, locked?, secret? }], lights: [{ x, y, bright, dim }],
 * raised: [{ points, height }], climbs: [{ kind, x1, y1, x2, y2 }], terrain: [{ points }], grid, notes }
 * (raised, climbs and terrain only from our own files).
 */
export function uvttContents(doc, { width, height, feetPerSquare = 5 }) {
  const r = doc.resolution;
  const ppg = Number(r.pixels_per_grid);
  const origin = { x: Number(r.map_origin?.x) || 0, y: Number(r.map_origin?.y) || 0 };
  const sx = width / (Number(r.map_size.x) * ppg);
  const sy = height / (Number(r.map_size.y) * ppg);
  const px = (p) => ({ x: (Number(p?.x) - origin.x) * ppg * sx, y: (Number(p?.y) - origin.y) * ppg * sy });
  const ok = (p) => Number.isFinite(p.x) && Number.isFinite(p.y);
  const walls = [];
  const lists = [...(Array.isArray(doc.line_of_sight) ? doc.line_of_sight : []), ...(Array.isArray(doc.objects_line_of_sight) ? doc.objects_line_of_sight : [])];
  let dropped = 0;
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const pts = straightRuns(list.map(px).filter(ok));
    for (let i = 1; i < pts.length; i++) walls.push({ x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y, door: false, open: false, kind: 'wall' });
  }
  const doors = [];
  for (const p of Array.isArray(doc.portals) ? doc.portals : []) {
    const [a, b] = (Array.isArray(p?.bounds) ? p.bounds : []).map(px);
    if (!a || !b || !ok(a) || !ok(b)) continue;
    const open = p.closed === false;
    doors.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, door: true, open, kind: 'wall', ...(p.locked === true && !open ? { locked: true } : {}), ...(p.secret === true ? { secret: true } : {}) });
  }
  const own = doc.dndapp && typeof doc.dndapp === 'object' ? doc.dndapp : {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  for (const o of arr(own.obstacles)) {
    const pts = arr(o).map(px).filter(ok);
    for (let i = 1; i < pts.length; i++) walls.push({ x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y, door: false, open: false, kind: 'low' });
  }
  const shape = (list) => arr(list).map(px).filter(ok).map((p) => [p.x, p.y]);
  const raised = arr(own.raised)
    .map((a) => ({ points: shape(a?.points), height: Number(a?.height), ...(a?.bridge === true && { bridge: true }) }))
    .filter((a) => a.points.length >= 3 && Number.isFinite(a.height))
    .slice(0, MAX_RAISED);
  const climbs = arr(own.climbs)
    .map((c) => ({ kind: CLIMB_KINDS.includes(c?.kind) ? c.kind : 'stairs', a: px(c?.from), b: px(c?.to) }))
    .filter((c) => ok(c.a) && ok(c.b))
    .slice(0, MAX_CLIMBS)
    .map((c) => ({ kind: c.kind, x1: c.a.x, y1: c.a.y, x2: c.b.x, y2: c.b.y }));
  const terrain = arr(own.terrain).map((t) => ({ points: shape(t) })).filter((t) => t.points.length >= 3).slice(0, MAX_TERRAIN);
  // Doors first, so a very big file keeps them all.
  const all = [...doors, ...walls].filter((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) >= 1);
  if (all.length > MAX_WALLS) dropped = all.length - MAX_WALLS;
  const lights = (Array.isArray(doc.lights) ? doc.lights : [])
    .map((l) => ({ ...px(l?.position), range: Number(l?.range), bright: Number(l?.bright), dim: Number(l?.dim) }))
    .filter((l) => ok(l) && l.range > 0)
    .slice(0, MAX_LIGHTS)
    // The file gives how far the light reaches, in squares: half of it bright, the rest dim
    // (our own files say how much of each).
    .map((l) => (l.bright >= 0 && l.dim >= 0
      ? { x: l.x, y: l.y, bright: l.bright * feetPerSquare, dim: l.dim * feetPerSquare }
      : { x: l.x, y: l.y, bright: (l.range * feetPerSquare) / 2, dim: (l.range * feetPerSquare) / 2 }));
  const notes = dropped ? `The file has more walls than a map can hold (${MAX_WALLS}); ${dropped} were left out.` : '';
  return { walls: all.slice(0, MAX_WALLS), lights, raised, climbs, terrain, grid: { size: ppg * sx, x: -origin.x * ppg * sx || 0, y: -origin.y * ppg * sy || 0 }, notes };
}

const r4 = (v) => Math.round(v * 10_000) / 10_000;

/**
 * A map as a Universal VTT file (format 0.3), to take it to another VTT or
 * map maker: its picture (`png`, a PNG buffer), grid, walls (line_of_sight),
 * doors (portals; to other VTTs secret doors are plain doors) and lights.
 * Obstacles (low walls, windows: they don't block sight), raised areas,
 * stairs and ladders and difficult terrain have no place in the format, so
 * they go in the `dndapp` block, which other VTTs ignore. Positions are in
 * squares from the grid's corner; `map_origin` is where the picture's corner
 * falls. The map needs a grid. Reading the file back (uvttContents) gives the same map.
 */
export function toUvtt(map, png) {
  const g = map.grid;
  if (!g) throw new BadRequestError("This map has no grid yet. Set its grid first: the file measures everything in squares.");
  const ppg = g.size;
  const origin = { x: r4(-g.x / ppg) || 0, y: r4(-g.y / ppg) || 0 };
  const pt = (x, y) => ({ x: r4(x / ppg + origin.x), y: r4(y / ppg + origin.y) });
  const line_of_sight = map.walls.filter((w) => !w.door && w.kind === 'wall').map((w) => [pt(w.x1, w.y1), pt(w.x2, w.y2)]);
  const portals = map.walls.filter((w) => w.door).map((w) => {
    const a = pt(w.x1, w.y1);
    const b = pt(w.x2, w.y2);
    return {
      position: { x: r4((a.x + b.x) / 2), y: r4((a.y + b.y) / 2) }, bounds: [a, b], rotation: r4(Math.atan2(b.y - a.y, b.x - a.x)), closed: !w.open, freestanding: false,
      ...(w.locked ? { locked: true } : {}), ...(w.secret ? { secret: true } : {}),
    };
  });
  const shape = (points) => points.map(([x, y]) => pt(x, y));
  // Light ranges go in squares (the map's lights are in its own unit).
  const per = map.scale?.per === 'square' && map.scale.distance > 0 ? map.scale.distance : 5;
  const lights = map.lights.map((l) => ({ position: pt(l.x, l.y), range: r4((l.bright + l.dim) / per), intensity: 1, color: 'ffffd9a0', shadows: true, bright: r4(l.bright / per), dim: r4(l.dim / per) }));
  return {
    format: 0.3,
    resolution: { map_origin: origin, map_size: { x: r4(map.image.width / ppg), y: r4(map.image.height / ppg) }, pixels_per_grid: r4(ppg) },
    line_of_sight,
    objects_line_of_sight: [],
    portals,
    environment: { baked_lighting: false, ambient_light: 'ffffffff' },
    lights,
    dndapp: {
      version: 1,
      obstacles: map.walls.filter((w) => !w.door && w.kind === 'low').map((w) => [pt(w.x1, w.y1), pt(w.x2, w.y2)]),
      raised: (map.raised ?? []).map((a) => ({ points: shape(a.points), height: a.height, ...(a.bridge && { bridge: true }) })),
      climbs: (map.climbs ?? []).map((c) => ({ kind: c.kind, from: pt(c.x1, c.y1), to: pt(c.x2, c.y2) })),
      terrain: (map.terrain ?? []).map((t) => shape(t.points)),
    },
    image: png.toString('base64'),
  };
}
