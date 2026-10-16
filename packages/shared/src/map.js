/**
 * Maps: the shape of a map document, and the geometry both the server and
 * the page need (token sizes, snapping to the grid, distances).
 *
 * Plain JS (it imports only map-design.js, maps made in the creator): the server normalises
 * every saved map with this, and the page loads the same file from
 * /shared/map.js to snap and measure while a token is being dragged.
 *
 * Positions are in the map image's own pixels; a token's x/y is its centre.
 */
import { normalizeDesign } from './map-design.js';

export const MAP_KINDS = ['battle', 'dungeon', 'building', 'town', 'region', 'world', 'other'];
export const TOKEN_KINDS = ['pc', 'npc', 'enemy', 'companion'];
export const TOKEN_KIND_NAMES = { pc: 'Player character', npc: 'NPC', enemy: 'Enemy', companion: 'Companion or summon' };
/**
 * Kinds of token a player controls (user_id): their character, and their
 * companions, familiars and summons. They move them, change their hit
 * points and conditions, roll for them, and see what they see.
 */
export const PLAYER_KINDS = ['pc', 'companion'];
/** Is this token one of this player's own (their character, or a companion of theirs)? */
export const ownToken = (t, userId) => userId != null && PLAYER_KINDS.includes(t?.kind) && t.user_id === userId;
/** How many companions and summons one player may have on a map. */
export const MAX_COMPANIONS = 12;
/** Token sizes in squares, as the 5e size categories. */
export const TOKEN_SIZES = [0.5, 1, 2, 3, 4];
export const TOKEN_SIZE_NAMES = { 0.5: 'Tiny', 1: 'Medium', 2: 'Large', 3: 'Huge', 4: 'Gargantuan' };
export const TOKEN_COLORS = { pc: '#2f6fb3', npc: '#3f8a4a', enemy: '#b33a3a', companion: '#7a5bb5' };
export const UNITS = ['ft', 'm', 'mi', 'km'];
export const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible',
  'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious', 'concentrating',
];
/** What a scale's distance covers: one grid square, or the whole width of the image. */
export const SCALE_PER = ['square', 'width'];
export const MAX_TOKENS = 300;
export const MAX_FOG_SHAPES = 1000;
export const FOG_OPS = ['reveal', 'cover'];
export const MAX_WALLS = 2000;
/** Where a wall came from: drawn by the DM, or drafted by the AI from the picture. */
export const WALL_SOURCES = ['dm', 'ai', 'file', 'creator']; // drawn by the DM, drafted by the AI, from a map maker's file (.dd2vtt), or from a map made in the app's creator
/**
 * What a wall stops: 'wall' blocks sight and movement; 'low' (an obstacle:
 * a building seen from above, a cliff, a fence) only blocks movement, so
 * players see over it but can't cross it.
 */
export const WALL_KINDS = ['wall', 'low'];
/**
 * What players get of the map outside their sight and the DM's reveals:
 * 'dark' (blacked out), 'grey' (greyed out: dimmed, no tokens) or 'shown'
 * (the map as it is, but no tokens).
 */
export const FOG_MAP = ['dark', 'grey', 'shown'];
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
/** A date and time as an ISO string, or '' if it isn't one. */
const isoStr = (v) => (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : '');
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
    user_id: PLAYER_KINDS.includes(kind) && Number.isInteger(Number(t.user_id)) && Number(t.user_id) > 0 ? Number(t.user_id) : null,
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
    // A light the token carries (a torch: 20 ft bright, 20 ft more dim), in the map's unit; null for none.
    light: normalizeLightRadii(t.light),
    // How far it sees in the dark (darkvision), in the map's unit; 0 for none.
    darkvision: num(t.darkvision, { min: 0, max: 10_000, fallback: 0 }),
    // Walking speed in the map's unit when the DM sets it; null to use the sheet or stat block's.
    speed: num(t.speed, { min: 0, max: 10_000, fallback: null }),
    // How tall it is, in feet, when set by hand; null for its sheet's height or its size's (see tokenTall).
    height: t.height == null ? null : round(num(t.height, { min: 0.5, max: MAX_HEIGHT_FT, fallback: 6 }), 1),
    // Feet above the ground under it (flying, climbing, levitating); 0 standing on it.
    elevation: round(num(t.elevation, { min: -MAX_HEIGHT_FT, max: MAX_HEIGHT_FT, fallback: 0 }), 1),
    // A picture the DM gave an NPC, enemy or companion (a player character shows its player's own token picture instead).
    art: kind !== 'pc' ? normalizeTokenArt(t.art) : null,
    // The DM's merchant this token stands for (players open its shop from the token); null for none.
    merchant: !PLAYER_KINDS.includes(kind) && /^[a-f0-9]{10}$/.test(String(t.merchant ?? '')) ? String(t.merchant) : null,
  };
}

/** A token picture's file in the map's archive folder (tokens/<file>): { file, type }, or null. */
export function normalizeTokenArt(a) {
  if (!a || typeof a !== 'object' || typeof a.file !== 'string' || !/^[\w.-]{1,80}$/.test(a.file)) return null;
  return { file: a.file, type: str(a.type, 40) };
}

/** A light's reach: { bright, dim } (dim is the ring beyond the bright light), or null for no light. */
export function normalizeLightRadii(l) {
  if (!l || typeof l !== 'object') return null;
  const bright = num(l.bright, { min: 0, max: 10_000, fallback: 0 });
  const dim = num(l.dim, { min: 0, max: 10_000, fallback: 0 });
  return bright + dim > 0 ? { bright: round(bright, 2), dim: round(dim, 2) } : null;
}

/** Lights people carry or the DM places, by the 5e rules (in feet). */
export const LIGHT_PRESETS = {
  candle: { name: 'Candle', bright: 5, dim: 5 },
  torch: { name: 'Torch', bright: 20, dim: 20 },
  lamp: { name: 'Lamp', bright: 15, dim: 30 },
  lantern: { name: 'Hooded lantern', bright: 30, dim: 30 },
  light: { name: 'Light cantrip', bright: 20, dim: 20 },
  fire: { name: 'Campfire', bright: 20, dim: 20 },
};
export const MAX_LIGHTS = 200;

/** Light sources the DM places (or the AI suggests): [{ id, x, y, bright, dim, source }]. */
export function normalizeLights(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  for (const l of Array.isArray(list) ? list : []) {
    const radii = normalizeLightRadii(l);
    if (!l || !isTokenId(l.id) || seen.has(l.id) || out.length >= MAX_LIGHTS || !radii) continue;
    seen.add(l.id);
    out.push({
      id: String(l.id),
      x: round(num(l.x, { min: 0, max: width, fallback: width / 2 }), 2),
      y: round(num(l.y, { min: 0, max: height, fallback: height / 2 }), 2),
      ...radii,
      source: pick(l.source, WALL_SOURCES, 'dm'),
    });
  }
  return out;
}

export const MAX_VARIANTS = 20;

/** Other pictures of a map: [{ id, name, file, type }]. `file` is the fitted copy in the map's archive folder. */
export function normalizeVariants(list) {
  const seen = new Set();
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    if (!v || !isTokenId(v.id) || seen.has(v.id) || out.length >= MAX_VARIANTS) continue;
    const file = `variant-${v.id}.${{ 'image/jpeg': 'jpg', 'image/webp': 'webp' }[v.type] ?? 'png'}`;
    if (v.file !== file) continue;
    seen.add(v.id);
    out.push({ id: String(v.id), name: str(v.name, 60) || 'Variant', file, type: pick(v.type, ['image/png', 'image/jpeg', 'image/webp'], 'image/png') });
  }
  return out;
}

export const MAX_LINKS = 50;

/** Levels of a building: up to 9 floors above the ground floor and 9 below. */
export const MAX_LEVEL = 9;
const FLOOR_NAMES = ['Ground floor', 'First floor', 'Second floor', 'Third floor'];
/** A level's name: Ground floor, First floor..., Cellar, Lower cellar, Level -3... */
export const levelName = (n) => (n >= 0 ? FLOOR_NAMES[n] ?? `Floor ${n}` : n === -1 ? 'Cellar' : n === -2 ? 'Lower cellar' : `Level ${n}`);

/** Ways to another map (stairs, a door, a trapdoor): [{ id, x, y, to (map id), label, source? ('creator': from a map made in the creator) }]. */
export function normalizeLinks(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  for (const l of Array.isArray(list) ? list : []) {
    if (!l || !isTokenId(l.id) || seen.has(l.id) || out.length >= MAX_LINKS || !/^[a-f0-9]{10}$/.test(String(l.to))) continue;
    seen.add(l.id);
    out.push({
      id: String(l.id),
      x: round(num(l.x, { min: 0, max: width, fallback: width / 2 }), 2),
      y: round(num(l.y, { min: 0, max: height, fallback: height / 2 }), 2),
      to: String(l.to),
      label: str(l.label, 60),
      ...(l.source === 'creator' ? { source: 'creator' } : {}),
    });
  }
  return out;
}

/** Is a point close enough to a link to use it? Within a square and a half (or 5% of the map's size without a grid). */
export function nearLink(map, link, x, y) {
  const reach = map.grid ? map.grid.size * 1.5 : Math.max(map.image.width, map.image.height) * 0.05;
  return Math.hypot(link.x - x, link.y - y) <= reach;
}

export const MAX_PINS = 100;
export const PIN_COLOR = '#d9a400';

/** Someone's private pins on a map (only they ever see them): [{ id, x, y, label, color }]. */
export function normalizePins(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || !isTokenId(p.id) || seen.has(p.id) || out.length >= MAX_PINS) continue;
    seen.add(p.id);
    out.push({
      id: String(p.id),
      x: num(p.x, { min: 0, max: width, fallback: width / 2 }),
      y: num(p.y, { min: 0, max: height, fallback: height / 2 }),
      label: str(p.label, 80),
      color: color(p.color, PIN_COLOR),
    });
  }
  return out;
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

/** A creature's stat block (the DM's; players never get it). source: book (the group's books; `from` says which and the page), ai (the AI's memory), web (found online) or manual. */
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
    source: pick(st.source, ['book', 'ai', 'web', 'manual'], 'manual'),
    ...(st.from && { from: str(st.from, 200) }),
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

/** What the AI's wall draft found: counts, or null. */
function normalizeFound(f) {
  if (!f || typeof f !== 'object') return null;
  const n = (v) => Math.round(num(v, { min: 0, max: 100_000, fallback: 0 }));
  return { walls: n(f.walls), obstacles: n(f.obstacles), doors: n(f.doors), lights: n(f.lights), terrain: n(f.terrain), climbs: n(f.climbs) };
}

/** Every map the server saves goes through this: known fields only, types fixed, sizes capped. */
export function normalizeMap(input = {}) {
  const m = input && typeof input === 'object' ? input : {};
  const image = {
    // A map made in the creator gets a new picture each time it's saved again (image-r2.webp...).
    file: /^image(-r\d{1,6})?\.(png|jpg|webp)$/.test(m.image?.file) ? m.image.file : 'image.png',
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
    walls: normalizeWalls(m.walls, image),
    lights: normalizeLights(m.lights, image),
    terrain: normalizeTerrain(m.terrain, image),
    raised: normalizeRaised(m.raised, image),
    climbs: normalizeClimbs(m.climbs, image),
    // The AI drafting walls from the picture (the DM's; players never get it).
    wall_draft: {
      status: pick(m.wall_draft?.status, ['', 'pending', 'done', 'failed'], ''),
      error: str(m.wall_draft?.error, 500),
      notes: longStr(m.wall_draft?.notes, 2000),
      // How far it has got while pending: tracing, then checking its draft part by part, then tidying.
      step: pick(m.wall_draft?.step, ['', 'tracing', 'checking', 'tidying'], ''),
      parts: Math.round(num(m.wall_draft?.parts, { min: 0, max: 9, fallback: 0 })),
      parts_done: Math.round(num(m.wall_draft?.parts_done, { min: 0, max: 9, fallback: 0 })),
      started_at: isoStr(m.wall_draft?.started_at),
      finished_at: isoStr(m.wall_draft?.finished_at),
      // What the finished draft holds, for the DM's "done" message.
      found: normalizeFound(m.wall_draft?.found),
    },
    // Where the image came from, when it was a page of a PDF (kept in the archive too).
    source: m.source?.file === 'source.pdf' ? { file: 'source.pdf', page: Math.max(1, Math.round(num(m.source.page, { min: 1, max: 100_000, fallback: 1 }))) } : null,
    // Other pictures of the same map (night, after the fire...), fitted to the same size; `variant` is the one shown (null: the original).
    variants: normalizeVariants(m.variants),
    variant: null,
    // Stairs and doors to another map.
    links: normalizeLinks(m.links, image),
    // A map made in the app's creator: what the DM made it from (the DM's alone; players never get it).
    design: m.design && typeof m.design === 'object' ? normalizeDesign(m.design) : null,
    // One level of a building (maps sharing a group are its floors): n = 0 the ground floor, 1 the floor above, -1 the cellar.
    level: /^[a-f0-9]{10}$/.test(String(m.level?.group)) && Number.isInteger(m.level.n) && Math.abs(m.level.n) <= MAX_LEVEL ? { group: m.level.group, n: m.level.n } : null,
    tokens: [],
  };
  if (out.variants.some((v) => v.id === m.variant)) out.variant = m.variant;
  // A scale per square means nothing without a grid.
  if (out.scale?.per === 'square' && !out.grid) out.scale = null;
  const seen = new Set();
  for (const t of Array.isArray(m.tokens) ? m.tokens.slice(0, MAX_TOKENS) : []) {
    const token = normalizeToken(t, out);
    if (!token.id || seen.has(token.id)) continue;
    seen.add(token.id);
    out.tokens.push(token);
  }
  out.templates = normalizeTemplates(m.templates, image);
  out.combat = normalizeCombat(m.combat, out.tokens);
  return out;
}

/**
 * Fog of war: while it's on, the whole map starts covered and the DM's
 * rectangles reveal or cover parts of it, later ones on top of earlier ones.
 * With `sight` on as well, each player also sees whatever their own token
 * has a clear line to (walls and closed doors block it), and keeps a dim
 * view of places they've seen before.
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
  return {
    enabled: f?.enabled === true,
    sight: f?.sight === true,
    // Players keep a dim view of where they've been (with line of sight).
    memory: f?.memory !== false,
    map: pick(f?.map, FOG_MAP, 'dark'),
    // Darkness (night, or underground): with line of sight, players only see lit places and what their darkvision reaches.
    dark: f?.dark === true,
    shapes,
  };
}

/** How far (image pixels) a player's token can reach to open or close a door: a square and a half. */
export const doorReach = (map) => squarePx(map) * 1.5;

/** Distance from a point to a wall. */
export function distanceToWall(p, w) {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / len)) : 0;
  return Math.hypot(p.x - (w.x1 + t * dx), p.y - (w.y1 + t * dy));
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

// ---------- walls and line of sight ----------

/**
 * Walls: straight lines in image pixels that block sight (and players'
 * tokens). A door is a wall that can be open (blocks nothing) or closed,
 * and locked (players can't open it). A secret door looks like wall to
 * players until it's found (`revealed`: the DM revealed it, or it was
 * opened). An obstacle ('low') blocks only movement.
 */
export function normalizeWalls(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  for (const w of Array.isArray(list) ? list : []) {
    if (!w || !isTokenId(w.id) || seen.has(w.id) || out.length >= MAX_WALLS) continue;
    const x1 = num(w.x1, { min: 0, max: width, fallback: null });
    const y1 = num(w.y1, { min: 0, max: height, fallback: null });
    const x2 = num(w.x2, { min: 0, max: width, fallback: null });
    const y2 = num(w.y2, { min: 0, max: height, fallback: null });
    if (x1 == null || y1 == null || x2 == null || y2 == null || Math.hypot(x2 - x1, y2 - y1) < 1) continue;
    seen.add(w.id);
    const door = w.door === true;
    const open = door && w.open === true;
    out.push({
      id: String(w.id),
      x1: round(x1, 1), y1: round(y1, 1), x2: round(x2, 1), y2: round(y2, 1),
      kind: door ? 'wall' : pick(w.kind, WALL_KINDS, 'wall'),
      door,
      open,
      locked: door && !open && w.locked === true,
      ...(door && w.secret === true ? { secret: true, revealed: open || w.revealed === true } : {}),
      source: pick(w.source, WALL_SOURCES, 'dm'),
      // The pieces of one curved wall share a group, so they're erased together.
      ...(typeof w.group === 'string' && isTokenId(w.group) ? { group: w.group } : {}),
    });
  }
  return out;
}

/**
 * The points along an arc that starts at `a`, passes through `m` and ends at
 * `b` (a curved wall), a piece every 10° or so (2 to 48 pieces). Points in a
 * line give just [a, b].
 */
export function arcThrough(a, m, b) {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  const span = Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(m.x - a.x, m.y - a.y);
  if (Math.abs(d) < 1e-6 * Math.max(1, span * span)) return [a, b];
  const sq = (p) => p.x * p.x + p.y * p.y;
  const c = {
    x: (sq(a) * (m.y - b.y) + sq(m) * (b.y - a.y) + sq(b) * (a.y - m.y)) / d,
    y: (sq(a) * (b.x - m.x) + sq(m) * (a.x - b.x) + sq(b) * (m.x - a.x)) / d,
  };
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  const ang = (p) => Math.atan2(p.y - c.y, p.x - c.x);
  const TAU = 2 * Math.PI;
  const ccw = (from, to) => (((to - from) % TAU) + TAU) % TAU; // turning one way, 0..2π
  const sa = ang(a);
  // Go the way round that passes through m.
  let sweep = ccw(sa, ang(b));
  if (ccw(sa, ang(m)) > sweep) sweep -= TAU;
  const n = Math.min(48, Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 18))));
  const pts = [a];
  for (let i = 1; i < n; i++) pts.push({ x: c.x + r * Math.cos(sa + (sweep * i) / n), y: c.y + r * Math.sin(sa + (sweep * i) / n) });
  pts.push(b);
  return pts;
}

/** The points round a circle (a round tower, a well), 36 pieces, closed (the first point again at the end). */
export function circlePoints(c, r) {
  const pts = [];
  for (let i = 0; i <= 36; i++) pts.push({ x: c.x + r * Math.cos((i * Math.PI) / 18), y: c.y + r * Math.sin((i * Math.PI) / 18) });
  return pts;
}

/** Is a door one players know about (not a secret door they haven't found)? */
export const doorKnown = (w) => w.door && (!w.secret || w.open || w.revealed);

/** The walls that block movement right now (everything but open doors). */
export const blockingWalls = (map) => (map.walls ?? []).filter((w) => !w.open);
/** The walls that block sight right now (not open doors, not obstacles). */
export const sightWalls = (map) => blockingWalls(map).filter((w) => w.kind !== 'low');

const cross = (ax, ay, bx, by) => ax * by - ay * bx;

/** Do segments a-b and c-d cross (touching counts)? */
export function segmentsCross(a, b, c, d) {
  const d1 = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
  const d2 = cross(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y);
  const d3 = cross(d.x - c.x, d.y - c.y, a.x - c.x, a.y - c.y);
  const d4 = cross(d.x - c.x, d.y - c.y, b.x - c.x, b.y - c.y);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p, q, r, v) => v === 0 && Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  return on(a, b, c, d1) || on(a, b, d, d2) || on(c, d, a, d3) || on(c, d, b, d4);
}

/** Is there a wall or closed door in the way of a straight move from a to b? */
export const wallBetween = (map, a, b) =>
  blockingWalls(map).some((w) => segmentsCross(a, b, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }));

/**
 * Everything visible from a point: a polygon ([[x, y], ...], in order around
 * the point), bounded by the map's walls and closed doors and by the edges
 * of the image. Rays go to every wall end (and just either side of it), so
 * the polygon's corners are exactly where sight is cut off.
 *
 * Kept fast for maps with thousands of wall pieces: walls are put in a grid
 * of cells and each ray only tests the walls in the cells it passes through,
 * stopping at the first hit; shared wall ends cast one set of rays; with a
 * reach, walls out of reach are left out.
 */
export function sightPolygon(map, origin, reach = Infinity) {
  const { width, height } = map.image;
  const ox = Math.min(width - 0.01, Math.max(0.01, origin.x));
  const oy = Math.min(height - 0.01, Math.max(0.01, origin.y));
  const limited = Number.isFinite(reach);
  let segs = sightWalls(map).map((w) => [w.x1, w.y1, w.x2, w.y2]);
  if (limited) segs = segs.filter((s) => distanceToSegment(ox, oy, s) <= reach);
  segs.push([0, 0, width, 0], [width, 0, width, height], [width, height, 0, height], [0, height, 0, 0]);
  const grid = wallGrid(segs, width, height);
  const angles = [];
  const ends = new Set();
  for (const [x1, y1, x2, y2] of segs) {
    for (const [x, y] of [[x1, y1], [x2, y2]]) {
      const key = `${x},${y}`;
      if (ends.has(key)) continue;
      ends.add(key);
      if (limited && Math.hypot(x - ox, y - oy) > reach) continue;
      const a = Math.atan2(y - oy, x - ox);
      angles.push(a - 1e-5, a, a + 1e-5);
    }
    // Where a wall crosses the edge of the reach, so the corner there is exact.
    if (limited) for (const a of circleCrossings(ox, oy, reach, x1, y1, x2, y2)) angles.push(a - 1e-5, a, a + 1e-5);
  }
  // Limited reach (a light, darkvision): the edge of the circle, every 5°.
  if (limited) for (let i = 0; i < 72; i++) angles.push((i * Math.PI) / 36 - Math.PI);
  const points = [];
  for (const a of angles) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const best = Math.min(castRay(grid, segs, ox, oy, dx, dy, reach), reach);
    if (best < Infinity) points.push({ a, x: ox + dx * best, y: oy + dy * best });
  }
  points.sort((p, q) => p.a - q.a);
  const out = [];
  for (const p of points) {
    const pt = [round(p.x, 1), round(p.y, 1)];
    const last = out.at(-1);
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt);
  }
  if (out.length > 1 && out[0][0] === out.at(-1)[0] && out[0][1] === out.at(-1)[1]) out.pop();
  return out;
}

/** How far the point (x, y) is from the segment [x1, y1, x2, y2]. */
function distanceToSegment(x, y, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len)) : 0;
  return Math.hypot(x1 + t * dx - x, y1 + t * dy - y);
}

/** The angles (seen from the centre) where a segment crosses a circle. */
function circleCrossings(cx, cy, r, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (!a || disc < 0) return [];
  const out = [];
  for (const t of [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)]) {
    if (t >= 0 && t <= 1) out.push(Math.atan2(fy + t * dy, fx + t * dx));
  }
  return out;
}

/** The segments bucketed into square cells: { size, cols, rows, cells: [[segment index...]...], stamp }. */
function wallGrid(segs, width, height) {
  const size = Math.max(32, Math.sqrt((width * height) / Math.max(1, segs.length)));
  const cols = Math.max(1, Math.ceil(width / size));
  const rows = Math.max(1, Math.ceil(height / size));
  const cells = Array.from({ length: cols * rows }, () => []);
  const cell = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v / size)));
  segs.forEach(([x1, y1, x2, y2], i) => {
    const c0 = cell(Math.min(x1, x2), cols);
    const c1 = cell(Math.max(x1, x2), cols);
    const r0 = cell(Math.min(y1, y2), rows);
    const r1 = cell(Math.max(y1, y2), rows);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * cols + c].push(i);
  });
  return { size, cols, rows, cells, stamp: new Int32Array(segs.length), ray: 0 };
}

/** How far a ray from (ox, oy) in direction (dx, dy) goes before it meets a segment (Infinity if none within `reach`). */
function castRay(grid, segs, ox, oy, dx, dy, reach) {
  const { size, cols, rows, cells, stamp } = grid;
  const ray = ++grid.ray;
  let best = Infinity;
  let cx = Math.min(cols - 1, Math.floor(ox / size));
  let cy = Math.min(rows - 1, Math.floor(oy / size));
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  let nextX = dx !== 0 ? ((cx + (dx > 0 ? 1 : 0)) * size - ox) / dx : Infinity;
  let nextY = dy !== 0 ? ((cy + (dy > 0 ? 1 : 0)) * size - oy) / dy : Infinity;
  const deltaX = dx !== 0 ? size / Math.abs(dx) : Infinity;
  const deltaY = dy !== 0 ? size / Math.abs(dy) : Infinity;
  let entered = 0;
  while (cx >= 0 && cy >= 0 && cx < cols && cy < rows && entered <= Math.min(best, reach)) {
    for (const i of cells[cy * cols + cx]) {
      if (stamp[i] === ray) continue;
      stamp[i] = ray;
      const [x1, y1, x2, y2] = segs[i];
      const sx = x2 - x1;
      const sy = y2 - y1;
      const denom = cross(dx, dy, sx, sy);
      if (Math.abs(denom) < 1e-12) continue;
      const qx = x1 - ox;
      const qy = y1 - oy;
      const t = cross(qx, qy, sx, sy) / denom;
      const u = cross(qx, qy, dx, dy) / denom;
      if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
    }
    if (nextX < nextY) {
      entered = nextX;
      nextX += deltaX;
      cx += stepX;
    } else {
      entered = nextY;
      nextY += deltaY;
      cy += stepY;
    }
  }
  return best;
}

/** Is a point inside a polygon ([[x, y], ...])? */
export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * What a player's own tokens can see: one sight polygon per token. Empty
 * unless fog and line of sight are both on.
 */
export function sightOf(map, userId) {
  if (!map.fog?.enabled || !map.fog.sight || userId == null) return [];
  // A player sees what their character sees, and what their companions see.
  const own = map.tokens.filter((t) => ownToken(t, userId));
  if (!map.fog.dark) return own.map((t) => sightPolygon(map, t)).filter((p) => p.length >= 3);
  // In the dark: what darkvision reaches, and the lit places the token can see (each light's area, cut to the token's sight).
  const k = pxPerUnit(map);
  const lit = litAreas(map).map((points) => ({ points, box: boundsOf(points) }));
  const out = [];
  for (const t of own) {
    if (t.darkvision > 0) out.push(sightPolygon(map, t, t.darkvision * k));
    const full = sightPolygon(map, t);
    const box = boundsOf(full);
    // Lights nowhere near what the token can see can't light anything it sees.
    for (const area of lit) if (boxesMeet(area.box, box)) out.push({ points: area.points, clip: full });
  }
  return out.filter((v) => (v.points ?? v).length >= 3);
}

const boundsOf = (points) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
};
const boxesMeet = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

// Lit areas already worked out, per set of walls: a light that hasn't moved
// keeps its polygon while tokens move (and is shared by every player).
const litCache = new Map(); // walls key -> Map(light key -> polygon)
const LIT_CACHE_WALLS = 8;
const LIT_CACHE_LIGHTS = 1000;

/**
 * Where light falls: one polygon per light (placed, or carried by a
 * token), out to the end of its dim light and cut off by walls.
 */
export function litAreas(map) {
  const k = pxPerUnit(map);
  const sources = [...(map.lights ?? []), ...map.tokens.filter((t) => t.light).map((t) => ({ x: t.x, y: t.y, ...t.light }))];
  if (!sources.length) return [];
  const wallsKey = `${map.image.width}x${map.image.height}|${sightWalls(map).map((w) => `${w.x1},${w.y1},${w.x2},${w.y2}`).join(';')}`;
  let known = litCache.get(wallsKey);
  if (known) litCache.delete(wallsKey);
  else known = new Map();
  litCache.set(wallsKey, known);
  if (litCache.size > LIT_CACHE_WALLS) litCache.delete(litCache.keys().next().value);
  const out = [];
  for (const l of sources) {
    const reach = (l.bright + l.dim) * k;
    const key = `${l.x},${l.y},${reach}`;
    let poly = known.get(key);
    if (!poly) {
      poly = sightPolygon(map, l, reach);
      if (known.size >= LIT_CACHE_LIGHTS) known.delete(known.keys().next().value);
      known.set(key, poly);
    }
    if (poly.length >= 3) out.push(poly);
  }
  return out;
}

/** Is a point inside what a player sees: a polygon, or { points, clip } (inside both)? */
export const inView = (x, y, v) => (Array.isArray(v) ? pointInPolygon(x, y, v) : pointInPolygon(x, y, v.points) && pointInPolygon(x, y, v.clip));

/** Can a player with these sight polygons see the point (x, y) right now? */
export function canSee(map, polygons, x, y) {
  if (!map.fog?.enabled) return true;
  if (polygons.some((p) => inView(x, y, p))) return true;
  return !isFogged(map, x, y);
}

/**
 * The fog as one player sees it, as a mask: a list of shapes drawn in
 * order, each { fill, x, y, w, h } or { fill, points } (with `clip`: only
 * where it's also inside that polygon). fill is 'cover'
 * (fog), 'dim' (seen before: shown darkened) or 'clear'. Without sight
 * polygons or explored areas it's the DM's rectangles alone. Empty when
 * the fog is off.
 */
export function fogMask(map, { polygons = [], explored = [] } = {}) {
  if (!map.fog?.enabled) return [];
  const { width, height } = map.image;
  return [
    { fill: map.fog.map === 'grey' ? 'dim' : 'cover', x: 0, y: 0, w: width, h: height },
    ...explored.map((r) => ({ fill: 'dim', ...r })),
    ...map.fog.shapes.map((s) => ({ fill: s.op === 'reveal' ? 'clear' : map.fog.map === 'grey' ? 'dim' : 'cover', x: s.x, y: s.y, w: s.w, h: s.h })),
    ...polygons.map((v) => (Array.isArray(v) ? { fill: 'clear', points: v } : { fill: 'clear', points: v.points, clip: v.clip })),
  ];
}

/**
 * The fog as a player's page draws it, from their view of the map (see the
 * server's maps.view): their own tokens' sight through the walls they're
 * sent, the places they've explored (`fog.explored`) and the DM's
 * rectangles, then the squares they can't see over raised areas
 * (heightShadows). Empty when the fog is off or the map shows unseen parts as
 * they are. The page passes a copy with its token where it's being dragged,
 * so the fog follows the drag.
 */
export function playerFogMask(view, userId) {
  if (!view.fog?.enabled || view.fog.map === 'shown') return [];
  const polygons = sightOf(view, userId);
  const explored = view.fog.explored ?? [];
  return [...fogMask(view, { polygons, explored }), ...heightShadows(view, userId, polygons, explored)];
}

/** Mask colours: white is fully fogged, black is clear, grey is the dim view of places seen before. */
export const FOG_MASK_FILL = { cover: '#ffffff', dim: '#999999', clear: '#000000' };

/** The nearest wall within `maxDist` of a point (for clicking on one), or null. */
export function nearestWall(map, p, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const w of map.walls ?? []) {
    const d = distanceToWall(p, w);
    if (d <= bestD) {
      best = w;
      bestD = d;
    }
  }
  return best;
}

/**
 * Where a wall being drawn should end: on the nearest existing wall end
 * within `maxDist` (so walls join without gaps sight could slip through),
 * else on a grid corner within `maxDist`, else where the pointer is.
 */
export function snapWallPoint(map, p, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const w of map.walls ?? []) {
    for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bestD) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  if (best) return best;
  if (map.grid) {
    const { size: g, x: gx, y: gy } = map.grid;
    const c = { x: Math.round((p.x - gx) / g) * g + gx, y: Math.round((p.y - gy) / g) * g + gy };
    if (Math.hypot(p.x - c.x, p.y - c.y) <= maxDist) return { x: round(c.x, 1), y: round(c.y, 1) };
  }
  return { x: round(p.x, 1), y: round(p.y, 1) };
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

// ---------- initiative ----------

/**
 * A fight on a map: the turn order, whose turn it is and the round, or null
 * when there's no fight. Each entry is a token on the map with its
 * initiative (null until rolled) and the modifier it rolled with (ties go to
 * the higher modifier). Entries are kept in turn order; `turn` is the token
 * whose turn it is, or null before the first turn.
 */
export function normalizeCombat(c, tokens = []) {
  if (!c || typeof c !== 'object') return null;
  const ids = new Set(tokens.map((t) => t.id));
  const seen = new Set();
  const entries = [];
  for (const e of Array.isArray(c.entries) ? c.entries : []) {
    if (!e || !ids.has(e.id) || seen.has(e.id)) continue;
    seen.add(e.id);
    entries.push({
      id: e.id,
      init: num(e.init, { min: -99, max: 999, fallback: null }),
      mod: num(e.mod, { min: -99, max: 99, fallback: null }),
      // How far it has moved on its turn so far (in the map's unit).
      moved: round(num(e.moved, { min: 0, max: 1_000_000, fallback: 0 }), 2),
    });
  }
  const sorted = sortCombat(entries, tokens);
  const turn = sorted.some((e) => e.id === c.turn && e.init != null) ? c.turn : null;
  return { round: Math.round(num(c.round, { min: 1, max: 9999, fallback: 1 })), turn, entries: sorted };
}

/**
 * Turn order: highest initiative first; ties go to the higher modifier, then
 * player characters, then by name. Entries not rolled yet go last.
 */
export function sortCombat(entries, tokens = []) {
  const byId = new Map(tokens.map((t) => [t.id, t]));
  return [...entries].sort((a, b) => {
    if ((a.init == null) !== (b.init == null)) return a.init == null ? 1 : -1;
    if (a.init !== b.init) return b.init - a.init;
    if ((a.mod ?? 0) !== (b.mod ?? 0)) return (b.mod ?? 0) - (a.mod ?? 0);
    const ta = byId.get(a.id);
    const tb = byId.get(b.id);
    if ((ta?.kind === 'pc') !== (tb?.kind === 'pc')) return ta?.kind === 'pc' ? -1 : 1;
    return String(ta?.name ?? '').localeCompare(String(tb?.name ?? ''));
  });
}

/**
 * The next (dir 1) or previous (dir -1) turn: { round, turn }. Only entries
 * with an initiative take turns. Going past the last one starts the next
 * round; going back past the first returns to the previous round (never
 * before round 1). Null when nobody has rolled yet.
 */
export function stepTurn(combat, dir = 1) {
  const order = combat.entries.filter((e) => e.init != null).map((e) => e.id);
  if (!order.length) return null;
  const i = order.indexOf(combat.turn);
  if (i < 0) return { round: combat.round, turn: dir > 0 ? order[0] : combat.turn };
  if (dir > 0) return i + 1 < order.length ? { round: combat.round, turn: order[i + 1] } : { round: combat.round + 1, turn: order[0] };
  if (i > 0) return { round: combat.round, turn: order[i - 1] };
  return combat.round > 1 ? { round: combat.round - 1, turn: order.at(-1) } : { round: 1, turn: order[0] };
}

/** The six abilities as stat blocks write them. */
export const ABILITY_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const ABILITY_WORDS = { STR: 'STR(?:ENGTH)?', DEX: 'DEX(?:TERITY)?', CON: 'CON(?:STITUTION)?', INT: 'INT(?:ELLIGENCE)?', WIS: 'WIS(?:DOM)?', CHA: 'CHA(?:RISMA)?' };

/**
 * A creature's modifier for an ability (STR, DEX...) from its stat block's
 * text, or null if it isn't there. Reads "DEX 14 (+2)" and the usual
 * Markdown table (a row of ability names, then a row of scores).
 */
export function abilityModifier(text, ability) {
  const word = ABILITY_WORDS[String(ability).toUpperCase()];
  if (!word) return null;
  const s = String(text ?? '').replace(/[−–]/g, '-');
  const signed = (v) => Number(v.replace(/\s+/g, ''));
  const fromScore = (n) => Math.floor((Number(n) - 10) / 2);
  const inline = s.match(new RegExp(`\\b${word}\\b[*_:\\s]{0,6}(\\d{1,2})\\s*\\(\\s*([+-]\\s*\\d{1,2})\\s*\\)`, 'i'));
  if (inline) return signed(inline[2]);
  const head = new RegExp(`^${word}$`, 'i');
  const lines = s.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split('|').map((c) => c.replace(/[*_]/g, '').trim());
    const col = cells.findIndex((c) => head.test(c));
    if (col < 0) continue;
    for (const next of lines.slice(i + 1, i + 3)) {
      const cell = next.split('|').map((c) => c.trim())[col] ?? '';
      const m = cell.match(/\(\s*([+-]\s*\d{1,2})\s*\)/);
      if (m) return signed(m[1]);
      if (/^\d{1,2}$/.test(cell)) return fromScore(cell);
    }
  }
  const bare = s.match(new RegExp(`\\b${word}\\b[*_:\\s]{0,6}(\\d{1,2})\\b`, 'i'));
  return bare ? fromScore(bare[1]) : null;
}

/** A creature's Dexterity modifier from its stat block's text, or null (see abilityModifier). */
export const dexModifier = (text) => abilityModifier(text, 'DEX');

/**
 * What a stat block lets you roll: its ability checks ({ ability, mod }) and
 * its attacks ({ name, hit, damage: ['1d8+3', ...] }), read from the text
 * ("Bite. Melee Weapon Attack: +4 to hit ... Hit: 7 (1d8 + 3) piercing
 * damage", and 2024's "Melee Attack Roll: +4"). Used for a player's
 * companions and summons, so they roll from the creature's own numbers.
 */
export function statBlockRolls(text) {
  const s = String(text ?? '').replace(/[−–]/g, '-');
  const abilities = ABILITY_KEYS.map((ability) => ({ ability, mod: abilityModifier(s, ability) })).filter((a) => a.mod != null);
  const attacks = [];
  for (const line of s.split('\n')) {
    const hit = line.match(/(?:attack(?: roll)?)[*_]*\s*:[*_\s]*([+-]\s*\d{1,2})|([+-]\s*\d{1,2})\s+to hit/i);
    if (!hit) continue;
    const name = line.replace(/^[\s>*_#-]+/, '').match(/^([^.:*_]{1,60}?)[*_]*\s*[.:]/)?.[1].trim();
    if (!name) continue;
    const after = line.slice(Math.max(0, line.search(/hit\s*:/i)));
    // Damage is usually "7 (2d4 + 2)"; some write the dice bare ("2d8 + 4 bludgeoning").
    const dice = (re) => [...after.matchAll(re)].map((m) => m[1].replace(/\s+/g, ''));
    let damage = dice(/\(\s*(\d{1,2}d\d{1,3}(?:\s*[+-]\s*\d{1,3})?)\s*\)/gi);
    if (!damage.length) damage = dice(/\b(\d{1,2}d\d{1,3}(?:\s*[+-]\s*\d{1,3})?)/gi);
    attacks.push({ name: name.slice(0, 60), hit: Number((hit[1] ?? hit[2]).replace(/\s+/g, '')), damage: [...new Set(damage)].slice(0, 4) });
    if (attacks.length >= 12) break;
  }
  return { abilities, attacks };
}

// ---------- spell templates ----------

/**
 * Areas of effect on a map, like a fireball's sphere or a dragon's cone:
 * { id, shape, x, y, angle, size, width, label, color, user_id }. x/y is
 * the point of origin in image pixels, angle the direction in degrees
 * (clockwise from pointing right), size the radius or length and width a
 * line's width, both in the map's scale unit (feet on most maps).
 */
export const TEMPLATE_SHAPES = ['circle', 'cone', 'line', 'cube'];
export const TEMPLATE_SHAPE_NAMES = { circle: 'Sphere / radius', cone: 'Cone', line: 'Line', cube: 'Cube' };
export const MAX_TEMPLATES = 50;
export const TEMPLATE_COLOR = '#e8743b';

export function normalizeTemplates(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    if (!t || !isTokenId(t.id) || seen.has(t.id) || out.length >= MAX_TEMPLATES) continue;
    const size = num(t.size, { min: 0.1, max: 10_000, fallback: null });
    if (!size) continue;
    seen.add(t.id);
    const shape = pick(t.shape, TEMPLATE_SHAPES, 'circle');
    out.push({
      id: String(t.id),
      shape,
      x: round(num(t.x, { min: 0, max: width, fallback: width / 2 }), 2),
      y: round(num(t.y, { min: 0, max: height, fallback: height / 2 }), 2),
      angle: round(((num(t.angle, { min: -1e6, max: 1e6, fallback: 0 }) % 360) + 360) % 360, 2),
      size: round(size, 2),
      width: shape === 'line' ? round(num(t.width, { min: 0.1, max: 10_000, fallback: 5 }), 2) : null,
      label: str(t.label, 80),
      color: color(t.color, TEMPLATE_COLOR),
      user_id: Number.isInteger(Number(t.user_id)) && Number(t.user_id) > 0 ? Number(t.user_id) : null,
    });
  }
  return out;
}

/** Image pixels per unit of the map's scale. Without a scale, a square (or a share of the map) counts as 5 ft. */
export function pxPerUnit(map) {
  const per = unitsPerPx(map);
  return per ? 1 / per : squarePx(map) / 5;
}

/**
 * Where a template's point of origin goes when placed at p: on a grid, the
 * nearest corner of a square (5e areas start at a square's corner).
 */
export function snapTemplatePoint(map, p) {
  if (!map.grid) return { x: round(p.x, 2), y: round(p.y, 2) };
  const { size: g, x: gx, y: gy } = map.grid;
  const { width, height } = map.image;
  const x = Math.min(width, Math.max(0, Math.round((p.x - gx) / g) * g + gx));
  const y = Math.min(height, Math.max(0, Math.round((p.y - gy) / g) * g + gy));
  return { x: round(x, 2), y: round(y, 2) };
}

/**
 * A template's outline in image pixels: { circle: { cx, cy, r } } or
 * { points: [[x, y], ...] }. A cone is as wide at its end as it is long
 * (the 5e cone); a cube's origin is one corner, and it lies on the side the
 * angle points to.
 */
export function templateShape(map, t) {
  const k = pxPerUnit(map);
  const len = t.size * k;
  if (t.shape === 'circle') return { circle: { cx: t.x, cy: t.y, r: len } };
  const a = (t.angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const at = (along, across) => [round(t.x + dx * along - dy * across, 2), round(t.y + dy * along + dx * across, 2)];
  if (t.shape === 'cone') return { points: [[t.x, t.y], at(len, -len / 2), at(len, len / 2)] };
  if (t.shape === 'line') {
    const w = ((t.width ?? 5) * k) / 2;
    return { points: [at(0, -w), at(len, -w), at(len, w), at(0, w)] };
  }
  const sx = dx < -1e-9 ? -1 : 1;
  const sy = dy < -1e-9 ? -1 : 1;
  const x2 = t.x + sx * len;
  const y2 = t.y + sy * len;
  return { points: [[t.x, t.y], [round(x2, 2), t.y], [round(x2, 2), round(y2, 2)], [t.x, round(y2, 2)]] };
}

/** Is a point inside a template (its edge counts)? */
export function inTemplate(map, t, x, y) {
  const s = templateShape(map, t);
  if (s.circle) return Math.hypot(x - s.circle.cx, y - s.circle.cy) <= s.circle.r + 0.01;
  if (pointInPolygon(x, y, s.points)) return true;
  // Points exactly on an edge.
  const pts = s.points;
  return pts.some((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return distanceToWall({ x, y }, { x1: p[0], y1: p[1], x2: q[0], y2: q[1] }) <= 0.01;
  });
}

/**
 * The tokens a template catches. On a grid, a token is caught when the
 * middle of any square it fills is inside the area (the usual way VTTs
 * read the 5e rule); off a grid, when its centre is.
 */
export function tokensInTemplate(map, t, tokens = map.tokens) {
  return tokens.filter((tok) => {
    if (!map.grid || tok.size < 1) return inTemplate(map, t, tok.x, tok.y);
    const g = map.grid.size;
    const n = tok.size;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (inTemplate(map, t, tok.x - (n * g) / 2 + (i + 0.5) * g, tok.y - (n * g) / 2 + (j + 0.5) * g)) return true;
      }
    }
    return false;
  });
}

/**
 * A spell's area, read from its range and description: { shape, size,
 * width? } in feet, or null. "Self (15-foot cone)", "20-foot-radius
 * sphere", "a line 100 feet long and 5 feet wide", "10-foot cube".
 */
export function spellArea(spell) {
  const texts = [spell?.range, spell?.description].map((s) => String(s ?? '').replace(/[‐‑–]/g, '-'));
  for (const s of texts) {
    const found = [
      [/(\d+)[- ](?:foot|feet|ft\.?)[- ]radius/i, (m) => ({ shape: 'circle', size: +m[1] })],
      [/radius of (\d+) (?:foot|feet)/i, (m) => ({ shape: 'circle', size: +m[1] })],
      [/(\d+)[- ](?:foot|feet|ft\.?)(?:[- ]long)?[- ]cone/i, (m) => ({ shape: 'cone', size: +m[1] })],
      [/(\d+)[- ](?:foot|feet|ft\.?)[- ]cube/i, (m) => ({ shape: 'cube', size: +m[1] })],
      [/\bline\b[^.]{0,40}?(\d+) (?:foot|feet) long and (\d+) (?:foot|feet) wide/i, (m) => ({ shape: 'line', size: +m[1], width: +m[2] })],
      [/(\d+)[- ](?:foot|feet|ft\.?)[- ]line/i, (m) => ({ shape: 'line', size: +m[1], width: 5 })],
    ]
      .map(([re, make]) => {
        const m = s.match(re);
        return m && { at: m.index, area: make(m) };
      })
      .filter(Boolean)
      .sort((a, b) => a.at - b.at)[0];
    if (found) return found.area;
  }
  return null;
}

// ---------- movement and difficult terrain ----------

export const MAX_TERRAIN = 300;

/** Difficult terrain: areas where moving costs double: [{ id, points: [[x, y], ...], source }]. */
export function normalizeTerrain(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || !isTokenId(a.id) || seen.has(a.id) || out.length >= MAX_TERRAIN) continue;
    const points = (Array.isArray(a.points) ? a.points : []).slice(0, 200)
      .map((p) => [round(num(p?.[0], { min: 0, max: width, fallback: 0 }), 1), round(num(p?.[1], { min: 0, max: height, fallback: 0 }), 1)]);
    if (points.length < 3) continue;
    seen.add(a.id);
    out.push({ id: String(a.id), points, source: pick(a.source, WALL_SOURCES, 'dm') });
  }
  return out;
}

// ---------- height ----------

/** Heights (tokens, raised areas, flying) are in feet, from -1000 to 1000. */
export const MAX_HEIGHT_FT = 1000;
export const MAX_RAISED = 300;
/** How tall a creature of each token size is when nothing says otherwise (feet). Small shares Medium's token size. */
export const SIZE_HEIGHTS = { 0.5: 2, 1: 6, 2: 10, 3: 20, 4: 30 };

/**
 * Raised areas (owner's request, 2026-10-15): parts of the map higher or
 * lower than the ground, each flat on top: a roof, a castle's wall-walk, a
 * tower top, a cliff top, a pit. `height` is in feet above the map's ground
 * (0). Where areas overlap, the highest counts.
 */
export function normalizeRaised(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || !isTokenId(a.id) || seen.has(a.id) || out.length >= MAX_RAISED) continue;
    const points = (Array.isArray(a.points) ? a.points : []).slice(0, 200)
      .map((p) => [round(num(p?.[0], { min: 0, max: width, fallback: 0 }), 1), round(num(p?.[1], { min: 0, max: height, fallback: 0 }), 1)]);
    if (points.length < 3) continue;
    seen.add(a.id);
    out.push({ id: String(a.id), points, height: round(num(a.height, { min: -MAX_HEIGHT_FT, max: MAX_HEIGHT_FT, fallback: 0 }), 1), source: pick(a.source, WALL_SOURCES, 'dm') });
  }
  return out;
}

/** Ways up and down between heights on one map: stairs (no extra movement) and ladders (climbing). */
export const CLIMB_KINDS = ['stairs', 'ladder'];
export const MAX_CLIMBS = 300;

/**
 * Stairs and ladders (owner's request, 2026-10-16), each a line drawn up
 * it from the bottom to the top: [{ id, kind (CLIMB_KINDS), x1, y1, x2, y2, source }].
 * Moving between heights where one is costs as the 5e rules say (see pathCost).
 */
export function normalizeClimbs(list, image = {}) {
  const { width = 1, height = 1 } = image;
  const seen = new Set();
  const out = [];
  const x = (v) => round(num(v, { min: 0, max: width, fallback: 0 }), 1);
  const y = (v) => round(num(v, { min: 0, max: height, fallback: 0 }), 1);
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || !isTokenId(c.id) || seen.has(c.id) || out.length >= MAX_CLIMBS) continue;
    seen.add(c.id);
    out.push({ id: String(c.id), kind: pick(c.kind, CLIMB_KINDS, 'stairs'), x1: x(c.x1), y1: y(c.y1), x2: x(c.x2), y2: y(c.y2), source: pick(c.source, WALL_SOURCES, 'dm') });
  }
  return out;
}

/** How high the ground is at a point (feet): the highest raised area there, else 0. */
export function groundAt(map, x, y) {
  let best = null;
  for (const a of map.raised ?? []) if ((best == null || a.height > best) && pointInPolygon(x, y, a.points)) best = a.height;
  return best ?? 0;
}

/**
 * A height in feet from what a player typed on their sheet ("5'10\"", "5 ft 10 in",
 * "6 feet", "178 cm", "1.8 m", "70 in"), or null if it doesn't read as one.
 */
export function parseHeight(text) {
  const s = String(text ?? '').toLowerCase().replace(/,/g, '.').trim();
  if (!s) return null;
  let ft = null;
  let m;
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*cm\b/))) ft = Number(m[1]) / 30.48;
  else if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\b/))) ft = Number(m[1]) * 3.2808;
  else if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:'|’|ft\b|feet\b|foot\b)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|”|''|in\b|inch(?:es)?\b)?)?/))) ft = Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0);
  else if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:"|”|in\b|inch(?:es)?\b)/))) ft = Number(m[1]) / 12;
  return ft != null && ft >= 0.5 && ft <= MAX_HEIGHT_FT ? Math.round(ft * 10) / 10 : null;
}

/**
 * How tall a token is (feet): set by hand, else what the server worked out
 * from its player's sheet (`tall`, on the views it sends), else by its size.
 */
export const tokenTall = (t) => t.height ?? t.tall ?? SIZE_HEIGHTS[t.size] ?? 6;

/** Where a token's eyes are: { x, y, z } with z in feet (1 ft below the top of its head, but at least half way up). */
export function eyeOf(map, t) {
  const tall = tokenTall(t);
  return { x: t.x, y: t.y, z: groundAt(map, t.x, t.y) + (t.elevation ?? 0) + Math.max(tall - 1, tall / 2) };
}

/** The top of a token's head: { x, y, z }, z in feet. */
export function headOf(map, t) {
  return { x: t.x, y: t.y, z: groundAt(map, t.x, t.y) + (t.elevation ?? 0) + tokenTall(t) };
}

// The edges of raised areas, per set of areas: a key -> edges.
const edgeCache = new Map();

/**
 * Every place the ground changes height, as segments with `top`: the
 * higher of the heights on its two sides (what a line of sight over it
 * must clear).
 */
export function heightEdges(map) {
  const raised = map.raised ?? [];
  if (!raised.length) return [];
  const key = raised.map((a) => `${a.height}:${a.points.join(';')}`).join('|');
  if (edgeCache.has(key)) return edgeCache.get(key);
  const out = [];
  for (const a of raised) {
    const n = a.points.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = a.points[i];
      const [x2, y2] = a.points[(i + 1) % n];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (!len) continue;
      // Just either side of the edge's middle.
      const nx = (-(y2 - y1) / len) * 0.01;
      const ny = ((x2 - x1) / len) * 0.01;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const top = Math.max(groundAt(map, mx + nx, my + ny), groundAt(map, mx - nx, my - ny));
      out.push({ x1, y1, x2, y2, top });
    }
  }
  if (edgeCache.size > 16) edgeCache.delete(edgeCache.keys().next().value);
  edgeCache.set(key, out);
  return out;
}

/**
 * Can a line of sight from a (eyes) to b (a point to see, such as the top
 * of a head), each { x, y, z } with z in feet, pass over the raised areas?
 * The standard terrain line-of-sight test (as GIS viewsheds and Foundry's
 * height modules do it): the straight line between them must stay above
 * the ground. Raised areas are flat on top, so the line can only touch
 * them at an edge: at each edge it crosses, its height there
 * (a.z + (b.z - a.z) × how far along) must be at least the edge's top.
 * Walls are separate (they block whatever the height).
 */
export function heightClear(edges, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  for (const e of edges) {
    if (Math.max(e.x1, e.x2) < x0 || Math.min(e.x1, e.x2) > x1 || Math.max(e.y1, e.y2) < y0 || Math.min(e.y1, e.y2) > y1) continue;
    const sx = e.x2 - e.x1;
    const sy = e.y2 - e.y1;
    const denom = cross(dx, dy, sx, sy);
    if (Math.abs(denom) < 1e-12) continue;
    const qx = e.x1 - a.x;
    const qy = e.y1 - a.y;
    const t = cross(qx, qy, sx, sy) / denom;
    const u = cross(qx, qy, dx, dy) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    if (a.z + (b.z - a.z) * t < e.top - 1e-6) return false;
  }
  return true;
}

/** Can token a see token b over the raised areas (walls aside)? The same line both ways, so it's mutual. */
export const tokenSeesOver = (map, a, b, edges = heightEdges(map)) => heightClear(edges, eyeOf(map, a), headOf(map, b));

/**
 * Does a player see this token, with line of sight on? It must be in what
 * their tokens see (sight polygons) or in a part the DM revealed, and with
 * raised areas on the map, one of their tokens must also see over them to
 * the top of its head. The DM's reveals show it whatever the heights.
 */
export function canSeeToken(map, userId, polygons, t) {
  if (!canSee(map, polygons, t.x, t.y)) return false;
  if (!map.fog?.enabled || !map.fog.sight || !map.raised?.length || !isFogged(map, t.x, t.y)) return true;
  const edges = heightEdges(map);
  return map.tokens.some((o) => ownToken(o, userId) && tokenSeesOver(map, o, t, edges));
}

/** How tall the creature is that the fog shows for: where a Medium creature standing there would be seen. */
export const FOG_TARGET_HEIGHT = 6;

/**
 * Where a player's tokens can't see over the raised areas, as fog shapes
 * on top of their sight: a grid of cells (the map's squares, or 1/64 of
 * its long side), each covered when none of their tokens sees a Medium
 * creature standing there. Cells they explored before stay dim, and the
 * DM's reveals stay clear. Neighbouring cells in a row are joined.
 */
export function heightShadows(map, userId, polygons, explored = []) {
  if (!map.raised?.length || !polygons.length) return [];
  const own = map.tokens.filter((t) => ownToken(t, userId));
  if (!own.length) return [];
  const edges = heightEdges(map);
  const eyes = own.map((t) => eyeOf(map, t));
  const { width, height } = map.image;
  const cell = map.grid ? map.grid.size : Math.max(width, height) / 64;
  const ox = map.grid ? ((map.grid.x % cell) + cell) % cell : 0;
  const oy = map.grid ? ((map.grid.y % cell) + cell) % cell : 0;
  // Only where they can see at all.
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const v of polygons) {
    const b = boundsOf(v.points ?? v);
    bx0 = Math.min(bx0, b.x0); by0 = Math.min(by0, b.y0); bx1 = Math.max(bx1, b.x1); by1 = Math.max(by1, b.y1);
  }
  const fill = map.fog?.map === 'grey' ? 'dim' : 'cover';
  const out = [];
  const c0 = Math.max(0, Math.floor((bx0 - ox) / cell)) - (ox > 0 ? 1 : 0);
  const r0 = Math.max(0, Math.floor((by0 - oy) / cell)) - (oy > 0 ? 1 : 0);
  for (let r = r0; oy + r * cell < Math.min(by1, height); r++) {
    let run = null;
    const flush = () => {
      if (run) out.push(run);
      run = null;
    };
    for (let c = c0; ox + c * cell < Math.min(bx1, width); c++) {
      const x = Math.max(0, ox + c * cell);
      const y = Math.max(0, oy + r * cell);
      const w = Math.min(width, ox + (c + 1) * cell) - x;
      const h = Math.min(height, oy + (r + 1) * cell) - y;
      if (w <= 0 || h <= 0) continue;
      const cx = x + w / 2;
      const cy = y + h / 2;
      let hide = false;
      if (polygons.some((v) => inView(cx, cy, v)) && isFogged(map, cx, cy)) {
        const target = { x: cx, y: cy, z: groundAt(map, cx, cy) + FOG_TARGET_HEIGHT };
        hide = !eyes.some((eye) => heightClear(edges, eye, target));
      }
      const f = hide ? (explored.some((e) => cx >= e.x && cx <= e.x + e.w && cy >= e.y && cy <= e.y + e.h) ? 'dim' : fill) : null;
      if (f && run && run.fill === f && Math.abs(run.x + run.w - x) < 1e-6) run.w = x + w - run.x;
      else {
        flush();
        if (f) run = { fill: f, x, y, w, h };
      }
    }
    flush();
  }
  return out;
}

/** Is this point in difficult terrain? */
export const isDifficult = (map, x, y) => (map.terrain ?? []).some((a) => pointInPolygon(x, y, a.points));

/** Feet in one of each unit (a climb is in feet; a move is in the map's unit). */
const FEET_PER = { ft: 1, m: 3.28084, mi: 5280, km: 3280.84 };

/** A climbing speed in a stat block's speed line ("30 ft., climb 30 ft."). */
export const hasClimbSpeed = (text) => /\bclimb(?:ing)?\s+\d/i.test(String(text ?? ''));

/** The stairs or ladder nearest (x, y) within `reach` pixels, or null. */
function climbNear(map, x, y, reach) {
  let best = null;
  let bestD = reach;
  for (const c of map.climbs ?? []) {
    const d = distanceToSegment(x, y, [c.x1, c.y1, c.x2, c.y2]);
    if (d <= bestD) [best, bestD] = [c, d];
  }
  return best;
}

/**
 * What a move along a path costs ({ value, unit, squares?, difficult, climb,
 * wall }), or null without a scale. points: where it starts, any waypoints,
 * where it ends. On a grid with a scale per square, each square entered
 * costs one square (diagonals too, the 5e way), two in difficult terrain;
 * otherwise it's the length of the path, doubled where it crosses difficult
 * terrain.
 *
 * Going up or down between raised areas (owner, 2026-10-16): by stairs it
 * costs nothing more; anywhere else it's climbing, and each foot climbed
 * costs a foot extra (5e), by a ladder or up a bare wall (`wall`: the DM may
 * want an Athletics check). `climb` is how many feet it climbs, up and down.
 * A token (optional) with a climbing speed (`climber`), or flying
 * (`elevation` above 0), climbs at no extra cost.
 */
export function pathCost(map, points, token = null) {
  const per = unitsPerPx(map);
  if (per == null || points.length < 2) return null;
  const { unit } = map.scale;
  let difficult = false;
  // Climbing: where the ground under the path changes height, unless by stairs.
  const heights = (map.raised ?? []).length > 0;
  const reach = squarePx(map) * 0.75;
  let ground = heights ? groundAt(map, points[0].x, points[0].y) : 0;
  let last = points[0];
  let climb = 0;
  let wall = false;
  const step = (x, y) => {
    if (!heights) return;
    const g = groundAt(map, x, y);
    if (g !== ground) {
      const near = climbNear(map, (last.x + x) / 2, (last.y + y) / 2, reach);
      if (near?.kind !== 'stairs') {
        climb += Math.abs(g - ground);
        wall ||= !near;
      }
      ground = g;
    }
    last = { x, y };
  };
  const free = !!(token && (token.climber || (token.elevation ?? 0) > 0));
  const extra = () => (free ? 0 : climb / (FEET_PER[unit] ?? 1));
  const done = (out) => ({ ...out, difficult, climb: round(climb, 1), wall: wall && climb > 0 });
  if (map.grid && map.scale.per === 'square') {
    const g = map.grid.size;
    let squares = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const n = Math.max(Math.round(Math.abs(b.x - a.x) / g), Math.round(Math.abs(b.y - a.y) / g));
      for (let k = 1; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n;
        const y = a.y + ((b.y - a.y) * k) / n;
        const hard = isDifficult(map, x, y);
        difficult ||= hard;
        squares += hard ? 2 : 1;
        step(x, y);
      }
    }
    return done({ value: round(squares * map.scale.distance + extra(), 2), unit, squares });
  }
  let px = 0;
  const stepPx = squarePx(map) / 4;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / stepPx));
    for (let k = 0; k < n; k++) {
      const hard = isDifficult(map, a.x + ((b.x - a.x) * (k + 0.5)) / n, a.y + ((b.y - a.y) * (k + 0.5)) / n);
      difficult ||= hard;
      px += (len / n) * (hard ? 2 : 1);
      step(a.x + ((b.x - a.x) * (k + 1)) / n, a.y + ((b.y - a.y) * (k + 1)) / n);
    }
  }
  return done({ value: px * per + extra(), unit });
}

/** A walking speed from a stat block's speed line ("30 ft., fly 60 ft." is 30), or null. */
export function speedFromText(text) {
  const m = String(text ?? '').match(/(\d+)\s*(?:ft|feet|foot|m\b)/i);
  return m ? Number(m[1]) : null;
}
