/**
 * The map creator's AI draft (SPEC §6.6 "Making a map"): the DM describes a
 * map in words ("a smugglers' cave under a lighthouse, with a jetty"), and
 * can add a sketch, and the AI plans it in the creator's own pieces: floors,
 * rooms with their doors, other walls, roads and rivers, things from the
 * asset list, labels and the look. The server turns the plan into an
 * ordinary design with the generators' builder (map-generate.js), which the
 * DM then opens in the creator to change as they like before saving it.
 */
import sharp from 'sharp';
import { z } from 'zod';
import { ASSETS, ASSET_GROUPS, DESIGN_MAX, DESIGN_MIN, EMPTY, FLOORS, GRID_LOOKS, LABEL_FONTS, MOODS, PATH_KINDS, WALL_STYLES, WALL_STYLE_NAMES, normalizeDesign, pathAt, scatterAssets } from '@dndapp/shared/map-design.js';
import { designBuilder } from '@dndapp/shared/map-generate.js';

const SKETCH_LONG_SIDE = 1568; // the copy of the DM's sketch the AI sees
const MAX_SCATTER = 80; // things one scatter spreads

const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '');
/** Floors by a word for each (grass, stone_tiles, deep_water...), for the AI: the design's own floor characters mean nothing to it. */
export const FLOOR_WORDS = Object.fromEntries(Object.entries(FLOORS).map(([ch, f]) => [slug(f.name), ch]));
const floorOf = (word) => (word === 'nothing' ? EMPTY : FLOOR_WORDS[word] ?? EMPTY);

const Point = z.object({ x: z.number(), y: z.number() });
const Floor = z.enum(['nothing', ...Object.keys(FLOOR_WORDS)]);
const Asset = z.enum(Object.keys(ASSETS));
const Style = z.enum(WALL_STYLES);

const PlanOut = z.object({
  name: z.string().describe('A short name for the map ("Smugglers\' cave")'),
  cols: z.number().describe(`Squares across, ${DESIGN_MIN} to ${DESIGN_MAX} (each square is 5 ft)`),
  rows: z.number().describe(`Squares down, ${DESIGN_MIN} to ${DESIGN_MAX}`),
  ground: Floor.describe('The floor everywhere to start with ("nothing" is black: solid rock round a dungeon, outside the map)'),
  areas: z.array(z.object({
    shape: z.enum(['rect', 'oval']),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
    floor: Floor,
  })).default([]).describe('Patches of floor over the ground, later ones over earlier: a pond, a field, a clearing, a dirt yard, a cave chamber. Ovals get uneven natural edges.'),
  rooms: z.array(z.object({
    name: z.string().describe('What the room is for (for you; not drawn)'),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
    floor: Floor,
    walls: Style,
    doors: z.array(z.object({
      side: z.enum(['north', 'east', 'south', 'west']),
      at: z.number().describe("Which square along that side, from 0 at its top or left end"),
      type: z.enum(['door', 'secret', 'arch', 'window']),
    })).default([]),
  })).default([]).describe('Rooms, corridors and buildings: rectangles of whole squares walled all round. Rooms that touch share the wall between them.'),
  walls: z.array(z.object({
    points: z.array(Point).min(2),
    type: z.enum(['wall', 'low']).describe('low: a fence, hedge or low wall (blocks movement, not sight)'),
    style: Style,
  })).default([]).describe("Walls that aren't round a room, as lines through points: a palisade, a fence, a hedge, a cliff edge, a ruined wall"),
  paths: z.array(z.object({
    kind: z.enum(Object.keys(PATH_KINDS)),
    width: z.number().nullable().describe('Squares wide, or null for the usual width'),
    points: z.array(Point).min(2),
  })).default([]).describe('Roads, footpaths, rivers, streams, lava flows and cracks, as lines through points (drawn smooth)'),
  things: z.array(z.object({
    asset: Asset,
    x: z.number(), y: z.number(),
    turn: z.number().describe('Degrees clockwise: 0 has its back to the top of the map, 90 to the right, 180 to the bottom, 270 to the left'),
    w: z.number().nullable().describe('Squares across, or null for its usual size'),
    h: z.number().nullable(),
    tint: z.string().nullable().describe('A colour (#rrggbb) for things listed with a tint, or null'),
  })).default([]).describe('Things from the asset list, each at its middle'),
  scatter: z.array(z.object({
    asset: Asset,
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
    count: z.number(),
  })).default([]).describe('Many of one thing spread over a rectangle: trees in a wood, rocks on a slope, bushes, crops in a field'),
  labels: z.array(z.object({
    text: z.string(),
    x: z.number(), y: z.number(),
    size: z.number().nullable().describe('Letter height in squares (usual 0.8), or null'),
    font: z.enum(Object.keys(LABEL_FONTS)),
  })).default([]),
  look: z.object({ mood: z.enum(Object.keys(MOODS)), grid: z.enum(Object.keys(GRID_LOOKS)) }),
  notes: z.string().describe("For the DM: anything you couldn't do, or chose for them, in a sentence or two. Empty if nothing."),
});

const BLOCK_WORDS = { wall: 'blocks sight', low: 'blocks movement', none: '' };

/** The asset list for the AI: key, name, usual size and what it does, by group. */
function assetList() {
  return ASSET_GROUPS.map((g) => {
    const lines = Object.entries(ASSETS).filter(([, a]) => a.group === g).map(([k, a]) => {
      const bits = [`${a.w} x ${a.h}`, BLOCK_WORDS[a.blocks], a.light && 'gives light', a.layer === 2 && 'overhead', a.layer === 0 && 'flat', a.difficult && 'difficult ground', a.tint && 'tint'].filter(Boolean);
      return `- ${k}: ${a.name} (${bits.join(', ')})`;
    });
    return `${g}:\n${lines.join('\n')}`;
  }).join('\n');
}

const floorList = () => Object.entries(FLOOR_WORDS).map(([word, ch]) => {
  const f = FLOORS[ch];
  return `- ${word}: ${f.group === 'Built' ? 'built' : 'natural'}${f.difficult ? ', difficult terrain' : ''}${f.water ? ', water' : ''}${f.glow ? ', glows' : ''}`;
}).join('\n');

export const DESIGN_SYSTEM = `You plan battle maps for a D&D table app's map creator, from a Dungeon Master's description (and sometimes their sketch). The app draws the map from your plan, then the DM changes it in the creator as they like. Plan a complete, playable map: the right floors, rooms walled all round with their doors, the furniture and things that make each place what it is, lights, and paths. Players' tokens move on it square by square, and its walls block their line of sight.

The grid
- Every square is 5 feet. Positions are in squares from the top-left corner of the map: x across (0 at the left edge, cols at the right edge), y down (0 at the top, rows at the bottom). The middle of the square 3 across and 2 down is x 3.5, y 2.5.
- Typical sizes: a battle map 20 to 40 squares a side; a cottage room 3 x 3 to 5 x 4; a tavern common room 8 x 6 or more; a corridor 1 or 2 squares wide; a great hall or throne room 8 x 12.

Floors
- ground covers the whole map first, then areas paint patches over it in order. "nothing" is black: outside the map, or the solid rock round a dungeon or cave.
- Natural floors run softly into each other; built floors have crisp edges. A cave is cave_floor areas (ovals, overlapping to make winding passages) on nothing, with cave-style walls along their edges or none.

Rooms
- A room is a rectangle of whole squares (whole-number x, y, w, h) with walls all round in one style, and its own floor. Rooms that touch share the wall between them, so a building is rooms side by side, touching; a corridor is a long, thin room.
- Every room needs a way in: a door, an arch (open doorway), a secret door (looks like wall until the party finds it) or a window (seen through, not walked through). A door is on a side of the room, at a square along that side (0 at its top or left end). A door in a wall two rooms share joins them; give it to one of them only.
- Outdoors, a building the party can enter is a room like any other; a building only seen from outside can be a room with a roof asset (roof_tile, roof_thatch, roof_tower) the same size over it.

Other walls: lines through points for walls that aren't round a room: a palisade round a camp, a fence or hedge (type low), a cliff edge, a ruined wall. Put their ends on whole or half squares.

Paths: roads, footpaths, rivers and streams, lava flows and cracks, as lines through points. Rivers and streams are difficult terrain; put a bridge across a river where a road crosses it.

Things (assets)
- From the list below, by key. x, y is the middle of the thing. w and h: null for its usual size (listed, in squares), or the size to stretch it to.
- turn: 0 has the thing's back to the top of the map, 90 to the right, 180 to the bottom, 270 to the left. Against a wall, a thing has its back to that wall, its middle half its depth in from the wall: a bookshelf (2 x 0.5) against a room's left wall at x 4 has turn 270 and x 4.25. A chair has its back away from its table: above the table turn 0, below it 180, left of it 270, right of it 90. Long things lie across at turn 0 and up and down at turn 90.
- Keep things inside their room, off walls and out of doorways, and not on top of each other, except things meant to be: candles, meals, tankards or a scroll on a table, a rug under furniture.
- scatter: many of one thing over a rectangle (trees in a wood, rocks, bushes, crops). The app keeps scattered things out of rooms and off paths and water.
- tint: a colour (#rrggbb) for things listed with "tint" (rugs, tents, stalls, crystals...), or null for the usual.

Labels: only when the DM asks for names on the map, or the map has places worth naming (streets of a town, a region). Most battle maps have none.

Look: mood day, dusk, night or gloom (dark and lit by torches: dungeons, caves, crypts); grid none, faint or dark.

Make it good to play: room to move and fight, cover (pillars, crates, rocks, trees), more than one way through where it makes sense, lights where people live or work (torches on dungeon walls, candles, fireplaces, braziers, lamp posts), and details that tell the place's story. Follow the DM's description closely; where it says nothing, choose what fits.

Floors (ground, areas and room floors):
${floorList()}

Wall styles: ${WALL_STYLES.map((s) => `${s} (${WALL_STYLE_NAMES[s]})`).join(', ')}.

Paths: ${Object.entries(PATH_KINDS).map(([k, p]) => `${k} (${p.name}, usually ${p.w} wide)`).join(', ')}.

Label fonts: ${Object.entries(LABEL_FONTS).map(([k, f]) => `${k} (${f.name})`).join(', ')}.

Assets (key: name, usual size in squares across x down, what it does):
${assetList()}`;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const whole = (v, fallback = 0) => (Number.isFinite(v) ? Math.round(v) : fallback);

/**
 * Turn the AI's plan into a design: `cols` x `rows` (the DM's size, else the
 * plan's). Rooms are areas walled where they meet anything else (shared walls
 * once), then their doors are cut in; scattered things are kept out of rooms
 * and off paths and water.
 */
export function planToDesign(plan, { cols = null, rows = null, seed = 1 } = {}) {
  const C = clamp(whole(cols ?? plan.cols, 30), DESIGN_MIN, DESIGN_MAX);
  const R = clamp(whole(rows ?? plan.rows, 20), DESIGN_MIN, DESIGN_MAX);
  const b = designBuilder(C, R, seed, 7);
  b.fill(0, 0, C, R, floorOf(plan.ground));
  (plan.areas ?? []).forEach((a, i) => {
    if (!(a.w > 0 && a.h > 0)) return;
    if (a.shape === 'oval') b.blob(a.x + a.w / 2, a.y + a.h / 2, a.w / 2, a.h / 2, floorOf(a.floor), { rough: 0.25, s: seed + i });
    else b.fill(whole(a.x), whole(a.y), Math.max(1, whole(a.w)), Math.max(1, whole(a.h)), floorOf(a.floor));
  });
  // Rooms: each its own area, so walls go where it meets anything else.
  const rooms = (plan.rooms ?? []).map((room, i) => {
    const r = { x: whole(room.x), y: whole(room.y), w: Math.max(1, whole(room.w, 1)), h: Math.max(1, whole(room.h, 1)), id: i + 1 };
    const ch = room.floor === 'nothing' ? 's' : floorOf(room.floor);
    b.fill(r.x, r.y, r.w, r.h, ch, r.id);
    b.style(r.id, room.walls);
    return { ...r, doors: room.doors ?? [] };
  });
  b.autoWalls();
  for (const room of rooms) {
    for (const d of room.doors) {
      const S = { north: 'N', south: 'S', east: 'E', west: 'W' }[d.side];
      const at = clamp(whole(Math.floor(d.at)), 0, (S === 'N' || S === 'S' ? room.w : room.h) - 1);
      const [c, r] = S === 'N' ? [room.x + at, room.y] : S === 'S' ? [room.x + at, room.y + room.h - 1] : S === 'W' ? [room.x, room.y + at] : [room.x + room.w - 1, room.y + at];
      // Only into a wall (a room later laid over this one may have taken the square).
      if (b.area[r]?.[c] === room.id && b.edge(c, r, S)) b.setEdge(c, r, S, d.type);
    }
  }
  for (const w of plan.walls ?? []) {
    for (let i = 1; i < w.points.length; i += 1) {
      const p = w.points[i - 1];
      const q = w.points[i];
      b.extraWalls.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, type: w.type, style: w.style });
    }
  }
  for (const p of plan.paths ?? []) {
    if (!PATH_KINDS[p.kind]) continue;
    b.paths.push({ kind: p.kind, w: p.width ?? PATH_KINDS[p.kind].w, pts: p.points.map((q) => [q.x, q.y]) });
  }
  for (const t of plan.things ?? []) {
    b.put(t.asset, t.x, t.y, { rot: whole(t.turn), ...(t.w > 0 && { w: t.w }), ...(t.h > 0 && { h: t.h }), ...(t.tint && { tint: t.tint }) });
  }
  for (const l of plan.labels ?? []) b.labels.push({ text: l.text, x: l.x, y: l.y, size: l.size ?? 0.8, font: l.font });
  let design = b.done(plan.look ?? {});
  // Scattered things: not in rooms, on paths, or (bar water plants) in water.
  const inRoom = (x, y) => (b.area[Math.floor(y)]?.[Math.floor(x)] ?? 0) > 0;
  const wet = (x, y) => FLOORS[design.floor[Math.floor(y)]?.[Math.floor(x)]]?.water;
  (plan.scatter ?? []).forEach((s, i) => {
    if (!(s.w > 0 && s.h > 0)) return;
    const before = new Set(design.assets.map((a) => a.id));
    design = scatterAssets(design, s.asset, { x1: s.x, y1: s.y, x2: s.x + s.w, y2: s.y + s.h }, { count: clamp(whole(s.count, 1), 1, MAX_SCATTER), seed: seed + i });
    const watery = s.asset === 'lily_pads' || s.asset === 'reeds';
    design.assets = design.assets.filter((a) => before.has(a.id) || !(inRoom(a.x, a.y) || pathAt(design, a.x, a.y) || (!watery && wet(a.x, a.y))));
  });
  return normalizeDesign(design);
}

export function createDesignDrafter({ llm }) {
  return {
    /**
     * Plan a map from the DM's description (and sketch: an image buffer, or
     * null), `cols` x `rows` squares or the AI's choice of size. Returns
     * { name, design, notes }.
     */
    async draft({ prompt, cols = null, rows = null, sketch = null, seed = 1, campaignId, userId }) {
      const attachments = [];
      if (sketch) {
        const small = await sharp(sketch)
          .rotate()
          .resize({ width: SKETCH_LONG_SIDE, height: SKETCH_LONG_SIDE, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 85 })
          .toBuffer();
        attachments.push({ type: 'image', media_type: 'image/jpeg', data: small.toString('base64') });
      }
      const size = cols && rows ? `Size: ${cols} x ${rows} squares (the DM chose it).` : 'Size: your choice.';
      const plan = await llm.structured({
        task: 'design',
        purpose: 'map:design',
        campaignId,
        userId,
        system: DESIGN_SYSTEM,
        ...(attachments.length && { attachments }),
        prompt: [`The DM's description:\n"""\n${prompt}\n"""`, size, sketch ? "The DM's sketch is attached: follow its layout (the rooms, where the doors are, what's where) at that size." : ''].filter(Boolean).join('\n\n'),
        schema: PlanOut,
      });
      const design = planToDesign(plan, { cols, rows, seed });
      return { name: String(plan.name ?? '').trim().slice(0, 100) || 'New map', design, notes: String(plan.notes ?? '').trim() };
    },
  };
}
