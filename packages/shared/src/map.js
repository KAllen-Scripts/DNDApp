/**
 * Maps: the shape of a map document, and the geometry both the server and
 * the page need (token sizes, snapping to the grid, distances).
 *
 * Plain JS with no imports, like sheet.js and dice.js: the server normalises
 * every saved map with this, and the page loads the same file from
 * /shared/map.js to snap and measure while a token is being dragged.
 *
 * Positions are in the map image's own pixels; a token's x/y is its centre.
 */

export const MAP_KINDS = ['battle', 'dungeon', 'building', 'town', 'region', 'world', 'other'];
export const TOKEN_KINDS = ['pc', 'npc', 'enemy'];
export const TOKEN_KIND_NAMES = { pc: 'Player character', npc: 'NPC', enemy: 'Enemy' };
/** Token sizes in squares, as the 5e size categories. */
export const TOKEN_SIZES = [0.5, 1, 2, 3, 4];
export const TOKEN_SIZE_NAMES = { 0.5: 'Tiny', 1: 'Medium', 2: 'Large', 3: 'Huge', 4: 'Gargantuan' };
export const TOKEN_COLORS = { pc: '#2f6fb3', npc: '#3f8a4a', enemy: '#b33a3a' };
export const UNITS = ['ft', 'm', 'mi', 'km'];
export const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible',
  'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious', 'concentrating',
];
/** What players see of an NPC's or enemy's hit points: how hurt it looks, not the numbers. */
export const HEALTH = ['unhurt', 'hurt', 'bloodied', 'down'];
/** What a scale's distance covers: one grid square, or the whole width of the image. */
export const SCALE_PER = ['square', 'width'];
export const MAX_TOKENS = 300;
export const MAX_FOG_SHAPES = 1000;
export const FOG_OPS = ['reveal', 'cover'];
/** On a map without a grid, a size-1 token is this fraction of the map's longer side. */
const UNGRIDDED_TOKEN_FRACTION = 1 / 40;

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const longStr = (v, max) => String(v ?? '').trim().slice(0, max);
const num = (v, { min, max, fallback = null }) => {
  const n = Number(v);
  if (v === null || v === '' || v === undefined || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const color = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : fallback);

/** A token id: short and random enough for one map. */
export const isTokenId = (id) => /^[a-z0-9]{6,16}$/.test(String(id));

export function normalizeToken(t = {}, map) {
  const kind = pick(t.kind, TOKEN_KINDS, 'npc');
  const size = TOKEN_SIZES.includes(Number(t.size)) ? Number(t.size) : 1;
  const { width = 1, height = 1 } = map?.image ?? {};
  return {
    id: isTokenId(t.id) ? String(t.id) : '',
    kind,
    name: str(t.name, 80) || TOKEN_KIND_NAMES[kind],
    user_id: kind === 'pc' && Number.isInteger(Number(t.user_id)) && Number(t.user_id) > 0 ? Number(t.user_id) : null,
    color: color(t.color, TOKEN_COLORS[kind]),
    size,
    x: num(t.x, { min: 0, max: width, fallback: width / 2 }),
    y: num(t.y, { min: 0, max: height, fallback: height / 2 }),
    hp: normalizeHp(t.hp),
    conditions: [...new Set((Array.isArray(t.conditions) ? t.conditions : []).filter((c) => CONDITIONS.includes(c)))],
    // Only the DM sees hidden tokens (an ambush, a lurking NPC).
    hidden: t.hidden === true,
    stats: normalizeStats(t.stats),
    // The archivist's record this token stands for (the DM's; players only get the name).
    // The title is kept too: record ids can change when the knowledge base is rebuilt.
    record: normalizeRecordLink(t.record),
  };
}

/** A link from a token to a knowledge-base record: { id, title } or null. */
export function normalizeRecordLink(r) {
  if (!r || typeof r !== 'object') return null;
  const id = Number(r.id);
  const title = str(r.title, 200);
  return Number.isInteger(id) && id > 0 && title ? { id, title } : null;
}

/** Record kinds that sound like someone you could put on a map (the archivist names kinds freely). */
export const PERSON_KIND = /npc|person|people|character|creature|monster|villain|ally|allies|enem|faction member|figure|beast|foe/i;

/** A creature's stat block (the DM's; players never get it). */
export function normalizeStats(st) {
  if (!st || typeof st !== 'object') return null;
  const text = longStr(st.text, 8000);
  if (!text) return null;
  return {
    name: str(st.name, 100),
    ac: num(st.ac, { min: 0, max: 99, fallback: null }),
    hp_formula: str(st.hp_formula, 40),
    speed: str(st.speed, 120),
    challenge: str(st.challenge, 40),
    text,
    source: pick(st.source, ['ai', 'manual'], 'manual'),
  };
}

/** Hit points: { current, max }, either may be unknown (null). Null when neither is known. */
export function normalizeHp(hp) {
  if (!hp || typeof hp !== 'object') return null;
  const max = num(hp.max, { min: 1, max: 99_999, fallback: null });
  const current = num(hp.current, { min: -99_999, max: 99_999, fallback: null });
  if (max == null && current == null) return null;
  return { current: current == null ? null : Math.round(current), max: max == null ? null : Math.round(max) };
}

/** How hurt a creature looks: unhurt, hurt, bloodied (half or less) or down (0 or less). Null if unknown. */
export function healthOf(hp) {
  if (!hp || hp.current == null) return null;
  if (hp.current <= 0) return 'down';
  if (hp.max == null || hp.current >= hp.max) return 'unhurt';
  return hp.current * 2 <= hp.max ? 'bloodied' : 'hurt';
}

/** Grid in image pixels: square size, and where the first line is. */
export function normalizeGrid(g, image = {}) {
  if (!g || typeof g !== 'object') return null;
  const longest = Math.max(image.width ?? 0, image.height ?? 0) || 100_000;
  const size = num(g.size, { min: 4, max: longest, fallback: null });
  if (!size) return null;
  const mod = (v) => ((num(v, { min: -1e6, max: 1e6, fallback: 0 }) % size) + size) % size;
  return { size: round(size, 3), x: round(mod(g.x), 2), y: round(mod(g.y), 2) };
}

export function normalizeScale(s) {
  if (!s || typeof s !== 'object') return null;
  const distance = num(s.distance, { min: 0.001, max: 1_000_000, fallback: null });
  if (!distance) return null;
  return { distance, unit: pick(s.unit, UNITS, 'ft'), per: pick(s.per, SCALE_PER, 'square') };
}

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

/** Every map the server saves goes through this: known fields only, types fixed, sizes capped. */
export function normalizeMap(input = {}) {
  const m = input && typeof input === 'object' ? input : {};
  const image = {
    file: /^image\.(png|jpg|webp)$/.test(m.image?.file) ? m.image.file : 'image.png',
    type: pick(m.image?.type, ['image/png', 'image/jpeg', 'image/webp'], 'image/png'),
    width: num(m.image?.width, { min: 1, max: 100_000, fallback: 1 }),
    height: num(m.image?.height, { min: 1, max: 100_000, fallback: 1 }),
  };
  const out = {
    name: str(m.name, 100) || 'Map',
    // The DM typed the name (the AI's suggested name only replaces the file name).
    named: m.named === true,
    image,
    shown: m.shown === true,
    removed: m.removed === true,
    kind: pick(m.kind, MAP_KINDS, 'other'),
    description: longStr(m.description, 2000),
    grid: normalizeGrid(m.grid, image),
    scale: normalizeScale(m.scale),
    reading: {
      status: pick(m.reading?.status, ['pending', 'done', 'failed'], 'done'),
      error: str(m.reading?.error, 500),
      notes: longStr(m.reading?.notes, 2000),
    },
    fog: normalizeFog(m.fog, image),
    // Where the image came from, when it was a page of a PDF (kept in the archive too).
    source: m.source?.file === 'source.pdf' ? { file: 'source.pdf', page: Math.max(1, Math.round(num(m.source.page, { min: 1, max: 100_000, fallback: 1 }))) } : null,
    tokens: [],
  };
  // A scale per square means nothing without a grid.
  if (out.scale?.per === 'square' && !out.grid) out.scale = null;
  const seen = new Set();
  for (const t of Array.isArray(m.tokens) ? m.tokens.slice(0, MAX_TOKENS) : []) {
    const token = normalizeToken(t, out);
    if (!token.id || seen.has(token.id)) continue;
    seen.add(token.id);
    out.tokens.push(token);
  }
  return out;
}

/**
 * Fog of war: while it's on, the whole map starts covered and the DM's
 * rectangles reveal or cover parts of it, later ones on top of earlier ones.
 */
export function normalizeFog(f, image = {}) {
  const width = image.width ?? 1;
  const height = image.height ?? 1;
  const shapes = [];
  for (const s of Array.isArray(f?.shapes) ? f.shapes.slice(-MAX_FOG_SHAPES) : []) {
    const x = num(s?.x, { min: 0, max: width, fallback: 0 });
    const y = num(s?.y, { min: 0, max: height, fallback: 0 });
    const w = num(s?.w, { min: 0, max: width - x, fallback: 0 });
    const h = num(s?.h, { min: 0, max: height - y, fallback: 0 });
    if (w > 0 && h > 0) shapes.push({ op: pick(s.op, FOG_OPS, 'reveal'), x: round(x, 1), y: round(y, 1), w: round(w, 1), h: round(h, 1) });
  }
  return { enabled: f?.enabled === true, shapes };
}

/** Is this point under the fog (hidden from players)? */
export function isFogged(map, x, y) {
  if (!map.fog?.enabled) return false;
  let covered = true;
  for (const s of map.fog.shapes) {
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) covered = s.op === 'cover';
  }
  return covered;
}

/**
 * A rectangle between two corners, lined up with the grid's squares when
 * there is one (so revealing a room takes whole squares).
 */
export function fogRect(map, a, b) {
  let x0 = Math.min(a.x, b.x);
  let y0 = Math.min(a.y, b.y);
  let x1 = Math.max(a.x, b.x);
  let y1 = Math.max(a.y, b.y);
  if (map.grid) {
    const { size: g, x: gx, y: gy } = map.grid;
    x0 = Math.floor((x0 - gx) / g) * g + gx;
    y0 = Math.floor((y0 - gy) / g) * g + gy;
    x1 = Math.ceil((x1 - gx) / g) * g + gx;
    y1 = Math.ceil((y1 - gy) / g) * g + gy;
  }
  const { width, height } = map.image;
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  return { x: x0, y: y0, w: Math.min(width, x1) - x0, h: Math.min(height, y1) - y0 };
}

/** How many image pixels one "square" of token size is: the grid square, or a share of the map. */
export function squarePx(map) {
  if (map.grid) return map.grid.size;
  return Math.max(map.image.width, map.image.height) * UNGRIDDED_TOKEN_FRACTION;
}

/** A token's diameter in image pixels. */
export const tokenPx = (map, token) => squarePx(map) * token.size;

/**
 * Where a token dropped at (x, y) ends up. On a grid, it fills whole squares:
 * a Medium token sits in the middle of a square, a Large one on a corner.
 * Off the grid it stays where it was dropped. Always inside the image.
 */
export function snapToken(map, token, x, y) {
  const { width, height } = map.image;
  const half = Math.min(tokenPx(map, token) / 2, width / 2, height / 2);
  // Keep the whole token on the map.
  const inside = (v, max) => Math.min(max - half, Math.max(half, v));
  x = inside(x, width);
  y = inside(y, height);
  if (map.grid) {
    const { size: g, x: gx, y: gy } = map.grid;
    const n = Math.max(1, token.size);
    const h = (n * g) / 2;
    const snap = (v, offset, max) => {
      let s = Math.round((v - h - offset) / g) * g + offset + h;
      while (s - h < -0.01 && s + g <= max) s += g;
      while (s + h > max + 0.01 && s - g >= 0) s -= g;
      return s;
    };
    x = snap(x, gx, width);
    y = snap(y, gy, height);
  }
  return { x: round(Math.min(width, Math.max(0, x)), 2), y: round(Math.min(height, Math.max(0, y)), 2) };
}

/** How far one image pixel is on this map, in the scale's unit, or null if there's no scale. */
export function unitsPerPx(map) {
  const s = map.scale;
  if (!s) return null;
  if (s.per === 'square') return map.grid ? s.distance / map.grid.size : null;
  return s.distance / map.image.width;
}

/**
 * Distance between two points: { value, unit, squares? }, or null without a
 * scale. On a grid with a scale per square it counts squares the 5e way
 * (each step, diagonal or not, is one square); otherwise it's a straight line.
 */
export function measure(map, a, b) {
  const per = unitsPerPx(map);
  if (per == null) return null;
  const { unit } = map.scale;
  if (map.grid && map.scale.per === 'square') {
    const g = map.grid.size;
    const squares = Math.max(Math.round(Math.abs(b.x - a.x) / g), Math.round(Math.abs(b.y - a.y) / g));
    return { value: squares * map.scale.distance, unit, squares };
  }
  return { value: Math.hypot(b.x - a.x, b.y - a.y) * per, unit };
}

export function formatDistance(d) {
  if (!d) return '';
  const v = d.value >= 100 ? Math.round(d.value) : Math.round(d.value * 10) / 10;
  return `${v.toLocaleString('en')} ${d.unit}`;
}
