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
import { MAX_HEIGHT_FT, normalizeClimbs, normalizeRaised } from './map-height.js';
import { normalizeWalls, pointInPolygon } from './map-sight.js';
import { normalizeEncounters, normalizeJourney, normalizePlaces, normalizeRoads } from './map-world.js';
export * from './map-world.js';
export * from './map-sight.js';
export * from './map-height.js';

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
/**
 * The players' map: the shown map the DM last brought the players to
 * (Show players this map), or null if they never did. Players' pages open on it
 * and go to it whenever the DM brings them somewhere new.
 */
export const playersMap = (maps) => maps.reduce((best, m) => (m.shown && m.brought_at && (!best || m.brought_at > best.brought_at) ? m : best), null);
/**
 * Who sees what (owner, 2026-10-18: "The DM will choose who to reveal what to"): a map is shown to
 * every player (`shown`, `shown_to` null) or only to the players listed in `shown_to`; a place on a
 * map likewise (`revealed`, `revealed_to`). Lists of user ids, null for everyone.
 */
export const shownTo = (map, userId) => !!map?.shown && (!map.shown_to || map.shown_to.includes(userId));
export const placeRevealedTo = (place, userId) => !!place?.revealed && (!place.revealed_to || place.revealed_to.includes(userId));
/** A list of user ids (who a map or a place is shown to), or null for everyone. */
export function normalizeUserIds(list) {
  if (!Array.isArray(list)) return null;
  return [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100).sort((a, b) => a - b);
}
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

export const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const longStr = (v, max) => String(v ?? '').trim().slice(0, max);
export const num = (v, { min, max, fallback = null }) => {
  const n = Number(v);
  if (v === null || v === '' || v === undefined || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
export const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);

/** How hard the AI thinks, least to most: the DM picks one for AI walls. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
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
    // The wiki page it stands for (the DM's): maps own where things are, the wiki what they are.
    page: normalizePageLink(t.page),
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
    // Under a bridge rather than on it, where it stands in one (owner, 2026-10-18); set as it moves (see levelWalker).
    under: t.under === true,
    // A picture the DM gave an NPC, enemy or companion (a player character shows its player's own token picture instead).
    art: kind !== 'pc' ? normalizeTokenArt(t.art) : null,
    // The DM's merchant this token stands for (players open its shop from the token); null for none.
    merchant: !PLAYER_KINDS.includes(kind) && /^[a-f0-9]{10}$/.test(String(t.merchant ?? '')) ? String(t.merchant) : null,
    // A companion kept on its player's character sheet (the entry's id): the token shows the sheet's name, stat block
    // and hit points, and a change to its hit points goes on the sheet (companions.js). null: a companion of this map only.
    companion: kind === 'companion' && /^[\w-]{1,64}$/.test(String(t.companion ?? '')) ? String(t.companion) : null,
    // The token it follows (the world, owner 2026-10-18: characters travel together or apart): it walks behind
    // that one and goes where it goes, until it's moved on its own; null for none.
    follows: isTokenId(t.follows) && String(t.follows) !== String(t.id) ? String(t.follows) : null,
    // On the road (the world's travel): where it set off from and is going, and when, by the campaign's clock; null when not.
    journey: normalizeJourney(t.journey, map?.image),
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

/** A link from a place or token to a wiki page: { id, title } or null (the title is kept for showing it). */
export function normalizePageLink(p) {
  if (!p || typeof p !== 'object') return null;
  const id = String(p.id ?? '');
  return /^[a-f0-9]{10}$/.test(id) ? { id, title: str(p.title, 200) } : null;
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

export const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

/** What the AI's wall draft found: counts, or null. */
function normalizeFound(f) {
  if (!f || typeof f !== 'object') return null;
  const n = (v) => Math.round(num(v, { min: 0, max: 100_000, fallback: 0 }));
  return { walls: n(f.walls), obstacles: n(f.obstacles), doors: n(f.doors), lights: n(f.lights), terrain: n(f.terrain), climbs: n(f.climbs), raised: n(f.raised) };
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
    // The DM picked its kind (a region, a town…) in Map settings, so the AI reading it doesn't change it.
    kind_set: m.kind_set === true,
    image,
    shown: m.shown === true,
    // Shown only to these players (user ids); null: every player.
    shown_to: normalizeUserIds(m.shown_to),
    // When the DM last brought the players here ('' never): the shown map brought to last is the players' map (playersMap).
    brought_at: isoStr(m.brought_at),
    removed: m.removed === true,
    kind: pick(m.kind, MAP_KINDS, 'other'),
    description: longStr(m.description, 2000),
    grid: normalizeGrid(m.grid, image),
    scale: normalizeScale(m.scale),
    reading: {
      status: pick(m.reading?.status, ['none', 'pending', 'done', 'failed'], 'done'),
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
      // The effort it ran at ('' before this was kept).
      effort: pick(m.wall_draft?.effort, EFFORTS, ''),
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
    // Places on it (a town on a region map, a tavern in a town), some opening a smaller map (the world's atlas).
    places: normalizePlaces(m.places, image),
    // Roads and rivers, and random encounters on the way (world and region maps; the DM's alone).
    roads: normalizeRoads(m.roads, image),
    encounters: normalizeEncounters(m.encounters),
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
  // Following someone who isn't on this map is following nobody.
  for (const t of out.tokens) if (t.follows && !seen.has(t.follows)) t.follows = null;
  out.templates = normalizeTemplates(m.templates, image);
  out.combat = normalizeCombat(m.combat, out.tokens);
  out.attacks = normalizeAttackLog(m.attacks);
  out.spells = normalizeMapSpells(m.spells, out);
  return out;
}

/** How many lasting spells a map keeps in play at once. */
export const MAX_MAP_SPELLS = 40;

/**
 * Spells in play on a map (lasting spells cast from it; the server writes them, routes/attacks.js, and
 * shared/spell-effects.js ends them): { id, name, caster (token id), caster_name, user_id (who cast it),
 * action (the caster's action id), slot, concentration, rounds, ends: { round, turn } | null (in a fight),
 * template (its area's id) | null, save, dc, check (the ability a creature uses to break free, or ''),
 * affected: [{ id, conditions }], attack (the card's id), at, custom? }. caster is null for the DM's own effect
 * from no token (a trap: caster_name is its name). A spell whose caster is gone stays until
 * someone ends it; tokens no longer on the map drop out of `affected`.
 */
export function normalizeMapSpells(list, map) {
  const ids = new Set(map.tokens.map((t) => t.id));
  const areas = new Set(map.templates.map((t) => t.id));
  const out = [];
  const seen = new Set();
  for (const sp of Array.isArray(list) ? list : []) {
    if (!sp || !isTokenId(sp.id) || seen.has(sp.id) || out.length >= MAX_MAP_SPELLS) continue;
    seen.add(sp.id);
    const ends = sp.ends && Number.isInteger(sp.ends.round) ? { round: sp.ends.round, turn: typeof sp.ends.turn === 'string' && isTokenId(sp.ends.turn) ? sp.ends.turn : null } : null;
    out.push({
      id: String(sp.id),
      name: str(sp.name, 120),
      caster: typeof sp.caster === 'string' && isTokenId(sp.caster) ? sp.caster : null,
      caster_name: str(sp.caster_name, 80),
      user_id: Number.isInteger(sp.user_id) && sp.user_id > 0 ? sp.user_id : null,
      action: str(sp.action, 80),
      slot: Number.isInteger(sp.slot) && sp.slot >= 1 && sp.slot <= 9 ? sp.slot : null,
      concentration: !!sp.concentration,
      rounds: Number.isInteger(sp.rounds) && sp.rounds > 0 ? sp.rounds : null,
      ends,
      template: areas.has(sp.template) ? sp.template : null,
      save: ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(sp.save) ? sp.save : '',
      dc: num(sp.dc, { min: 1, max: 40, fallback: null }),
      check: ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(sp.check) ? sp.check : '',
      affected: (Array.isArray(sp.affected) ? sp.affected : []).filter((a) => ids.has(a?.id)).slice(0, 60)
        .map((a) => ({ id: a.id, conditions: [...new Set((Array.isArray(a.conditions) ? a.conditions : []).filter((c) => CONDITIONS.includes(c)))] })),
      attack: typeof sp.attack === 'string' && isTokenId(sp.attack) ? sp.attack : null,
      at: str(sp.at, 40),
      // The DM's own effect (action 'custom'): what they filled in, to roll it again (the server checks it then).
      ...(sp.custom && typeof sp.custom === 'object' && { custom: smallJson(sp.custom) }),
    });
  }
  return out;
}

/** How many attacks a map keeps in its log (attacks from the map, shared/attacks.js). */
export const MAX_ATTACK_LOG = 30;
export const ATTACK_STATUSES = ['done', 'pending', 'undone'];

/** Plain data, kept small: strings cut short, lists capped, nothing deeper than a few levels. */
function smallJson(v, depth = 0) {
  if (v == null || typeof v === 'boolean') return v ?? null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v.slice(0, 300);
  if (depth > 5) return null;
  if (Array.isArray(v)) return v.slice(0, 40).map((x) => smallJson(x, depth + 1));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k.slice(0, 40), smallJson(x, depth + 1)]));
  return null;
}

/**
 * A map's attack log (attacks and area spells made from the map; the server writes it, routes/attacks.js):
 * newest last, at most MAX_ATTACK_LOG. Each: { id, at, by, status: done | pending (damage waits for the DM)
 * | undone, attacker: { id, name, kind }, action: { name, kind, ... }, template, targets: [...] }.
 */
export function normalizeAttackLog(list) {
  const out = [];
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || typeof e !== 'object' || !isTokenId(e.id) || !Array.isArray(e.targets) || !e.attacker) continue;
    const c = smallJson(e);
    c.status = pick(e.status, ATTACK_STATUSES, 'done');
    out.push(c);
  }
  return out.slice(-MAX_ATTACK_LOG);
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
      // A lasting spell's area (spells in play, `spell` its id): Entangle's is difficult terrain while it lasts.
      ...(typeof t.spell === 'string' && isTokenId(t.spell) && { spell: String(t.spell), ...(t.difficult === true && { difficult: true }) }),
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
      // A square on the ground (Entangle, Grease): a cube's footprint.
      [/(\d+)[- ](?:foot|feet|ft\.?)[- ]square/i, (m) => ({ shape: 'cube', size: +m[1] })],
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

