/**
 * Universal VTT files (.dd2vtt from Dungeondraft, .uvtt, .df2vtt and others):
 * a map maker's export with the picture, the grid, and exact walls, doors and
 * lights. Positions in the file are in grid squares from `map_origin`.
 *
 * The format (version 0.2 / 0.3):
 *   { format, resolution: { map_origin: {x, y}, map_size: {x, y}, pixels_per_grid },
 *     line_of_sight: [[{x, y}, ...], ...], objects_line_of_sight?: [[...]],
 *     portals: [{ position, bounds: [{x, y}, {x, y}], rotation, closed, freestanding }],
 *     lights: [{ position: {x, y}, range, intensity, color, shadows }], image: base64 }
 */
import { MAX_WALLS, MAX_LIGHTS } from '@dndapp/shared/map.js';
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
 * Returns { walls: [{ x1, y1, x2, y2, door, open, kind }], lights: [{ x, y, bright, dim }], grid, notes }.
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
    doors.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, door: true, open: p.closed === false, kind: 'wall' });
  }
  // Doors first, so a very big file keeps them all.
  const all = [...doors, ...walls].filter((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) >= 1);
  if (all.length > MAX_WALLS) dropped = all.length - MAX_WALLS;
  const lights = (Array.isArray(doc.lights) ? doc.lights : [])
    .map((l) => ({ ...px(l?.position), range: Number(l?.range) }))
    .filter((l) => ok(l) && l.range > 0)
    .slice(0, MAX_LIGHTS)
    // The file gives how far the light reaches, in squares: half of it bright, the rest dim.
    .map((l) => ({ x: l.x, y: l.y, bright: (l.range * feetPerSquare) / 2, dim: (l.range * feetPerSquare) / 2 }));
  const notes = dropped ? `The file has more walls than a map can hold (${MAX_WALLS}); ${dropped} were left out.` : '';
  return { walls: all.slice(0, MAX_WALLS), lights, grid: { size: ppg * sx, x: -origin.x * ppg * sx || 0, y: -origin.y * ppg * sy || 0 }, notes };
}
