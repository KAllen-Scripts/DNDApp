/**
 * More starting points for the map creator (SPEC §6.6 "Making a map"), built
 * from the same pieces as the first ones (map-generate-kit.js): ships at sea,
 * a harbour, a temple, a farm, a mine, a graveyard, a wizard's tower, a
 * castle, a sewer and a dragon's lair. map-generate.js lists them with the
 * others; the same seed and size always make the same map.
 */
import { ASSETS, hullShape, newDesignId } from './map-design.js';
import { noise } from './map-paint.js';
import { biggestRegion, caveWalls, centre, clamp, dress, furnishHouse, ground, house, overlaps, r2, torches, wander, woods } from './map-generate-kit.js';

/** What these make, with their default size in squares. */
export const MORE_GENERATORS = {
  ship: { name: 'Ships at sea', about: 'A ship under way, or two grappled side by side for a boarding fight: rails, masts, cannons and gear', cols: 36, rows: 24 },
  docks: { name: 'Harbour', about: 'Quays and wooden piers, a ship tied up, warehouses, boats and cargo', cols: 40, rows: 28 },
  temple: { name: 'Temple', about: 'A pillared nave with pews, the altar on a dais, side chapels, a vestry and a bell tower', cols: 30, rows: 34 },
  farm: { name: 'Farm', about: 'A farmhouse and barn round a yard, fenced fields of crops, an orchard and a windmill', cols: 40, rows: 30 },
  mine: { name: 'Mine', about: 'Timbered tunnels with rails and carts, ore, a shaft, flooded and fallen-in parts', cols: 40, rows: 30 },
  graveyard: { name: 'Graveyard', about: 'Rows of graves inside a wall, mausoleums, a chapel, dead trees and an open grave', cols: 36, rows: 30 },
  tower: { name: "Wizard's tower", about: 'A round tower: a study full of books and instruments round a summoning circle', cols: 30, rows: 30 },
  castle: { name: 'Castle', about: 'Curtain walls with round towers and a gatehouse, a courtyard, stables, a smithy and the keep', cols: 44, rows: 36 },
  sewer: { name: 'Sewer', about: 'Channels of foul water with walkways either side, junctions, bridges and hidden rooms', cols: 36, rows: 28 },
  lair: { name: "Dragon's lair", about: 'A vast cavern with a hoard of gold, lava, scorched bones and the way in', cols: 40, rows: 32 },
};

const inPoly = (poly, x, y) => {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
  }
  return inn;
};
const half = (v) => Math.round(v * 2) / 2;

/** A round wall (a tower), as two half circles. */
function ring(b, cx, cy, r, style = 'stone', type = 'wall') {
  b.extraWalls.push({ x1: cx - r, y1: cy, x2: cx + r, y2: cy, type, style, arc: { x: cx, y: cy - r } });
  b.extraWalls.push({ x1: cx - r, y1: cy, x2: cx + r, y2: cy, type, style, arc: { x: cx, y: cy + r } });
}

// ---------- ships ----------

/**
 * A ship on the water: the Ship's deck asset with rails (fences) round it,
 * masts, the helm, hatches, cannons along its sides and its gear. `rot` is
 * the way its bow points (90 right, 270 left, 0 up, 180 down); its middle at
 * (cx, cy) and its length and beam in squares are chosen so its rails end on
 * half squares. `gaps`: [{ side: -1 port | 1 starboard, t }] where to leave
 * the rail open for a gangplank, t from 0 at the stern to 1 at the bow.
 * Returns a function from (t, x across) on the ship to a point on the map.
 */
function ship(b, { cx, cy, length, beam, rot = 90, masts = 3, cannons = true, cargo = 0.5, gaps = [] }) {
  const shape = hullShape(beam, length);
  const { hb, y0 } = shape;
  const th = (rot * Math.PI) / 180;
  const turn = ([x, y]) => [cx + x * Math.cos(th) - y * Math.sin(th), cy + x * Math.sin(th) + y * Math.cos(th)];
  const yOf = (t) => length / 2 - t * length;
  const at = (t, x) => turn([x, yOf(t)]);
  b.put('hull', cx, cy, { w: beam, h: length, rot, underfoot: true });
  // The deck underneath (not water, so not difficult going), where a whole square is on board.
  const outline = shape.outline.map(turn);
  for (let r = 0; r < b.rows; r += 1) {
    for (let c = 0; c < b.cols; c += 1) {
      if ([[0.02, 0.02], [0.98, 0.02], [0.98, 0.98], [0.02, 0.98]].every(([dx, dy]) => inPoly(outline, c + dx, r + dy))) b.set(c, r, 'j');
    }
  }
  // The rails: both sides (open where a gangplank comes aboard), the stern, the bow's two arcs.
  const rail = (p, q, extra = {}) => {
    const [x1, y1] = turn(p);
    const [x2, y2] = turn(q);
    b.extraWalls.push({ x1: half(x1), y1: half(y1), x2: half(x2), y2: half(y2), type: 'low', style: 'wood', ...extra });
  };
  for (const side of [-1, 1]) {
    const cuts = gaps.filter((g) => g.side === side).map((g) => yOf(g.t)).sort((p, q) => q - p);
    let from = length / 2;
    for (const y of cuts) {
      if (from - (y + 0.5) > 0.4) rail([side * hb, from], [side * hb, y + 0.5]);
      from = y - 0.5;
    }
    if (from - y0 > 0.4) rail([side * hb, from], [side * hb, y0]);
    const [mx, my] = shape.at(shape.tip / 2);
    const [ax, ay] = turn([side * mx, my]);
    rail([side * hb, y0], [0, -length / 2], { arc: { x: r2(ax), y: r2(ay) } });
  }
  rail([-hb, length / 2], [hb, length / 2]);
  // Masts down the middle; the helm at the back of the quarterdeck, ladders up to it and the forecastle.
  const fore = 1 - shape.L / length;
  const mastAt = masts >= 3 ? [0.3, 0.53, 0.76] : masts === 2 ? [0.36, 0.68] : [0.55];
  for (const [i, t] of mastAt.entries()) b.put('mast', ...at(t, 0), { w: i === 1 || mastAt.length === 1 ? 1.1 : 0.95, h: i === 1 || mastAt.length === 1 ? 1.1 : 0.95, rot: b.int(0, 359) });
  b.put('helm', ...at(0.09, 0), { rot });
  for (const s of [-1, 1]) {
    b.put('ladder', ...at(0.2 + 0.85 / length, s * (hb - 1.1)), { rot });
    if (fore - 0.85 / length > 0.62) b.put('ladder', ...at(fore - 0.85 / length, s * (hb - 1.1)), { rot });
  }
  b.put('sea_chest', ...at(0.035, s1(b) * (hb - 1)), { rot: rot + 180 });
  b.put('lantern', ...at(0.025, 0), { rot });
  b.put('lantern', ...at(fore + (1 - fore) * 0.35, 0), { rot });
  // Hatches between the masts, the capstan behind the main mast.
  for (let i = 1; i < mastAt.length; i += 1) {
    if ((mastAt[i] - mastAt[i - 1]) * length >= 4) b.put('hatch', ...at((mastAt[i] + mastAt[i - 1]) / 2, 0), { rot });
  }
  const main = mastAt[Math.min(1, mastAt.length - 1)];
  if (b.free(...at(main - 1.7 / length, 0), 1.4)) b.put('capstan', ...at(main - 1.7 / length, 0), { rot: b.int(0, 359) });
  // Cannons along both sides, their muzzles out; shot beside some.
  const nearGap = (side, t) => gaps.some((g) => g.side === side && Math.abs(g.t - t) * length < 1.5);
  if (cannons) {
    for (const s of [-1, 1]) {
      for (let t = 0.26; t < fore - 0.04; t += 2.6 / length) {
        if (nearGap(s, t)) continue;
        const [x, y] = at(t, s * (hb - 1.08));
        if (!b.free(x, y, 1.2, 0)) continue;
        b.put('cannon', x, y, { rot: rot + (s > 0 ? 90 : 270) });
        if (b.chance(0.4) && b.free(...at(t + 0.9 / length, s * (hb - 2.1)), 0.8)) b.put('cannonballs', ...at(t + 0.9 / length, s * (hb - 2.1)), { w: 0.8, h: 0.8 });
      }
    }
  }
  // Gear: rope by the masts, the anchor on the forecastle, cargo here and there.
  for (const t of mastAt) for (const s of [-1, 1]) if (b.chance(0.5) && b.free(...at(t, s * 1.15), 0.8)) b.put('rope_coil', ...at(t, s * 1.15), { w: 0.8, h: 0.8, rot: b.int(0, 359) });
  const anchor = at(fore + (1 - fore) * 0.12, s1(b) * hb * 0.5);
  if (b.free(...anchor, 1.2)) b.put('anchor', ...anchor, { rot: rot + b.int(-30, 30) });
  const goods = ['barrel', 'crate', 'barrel', 'sacks', 'crate', 'keg'];
  for (let i = 0, tries = 0; i < Math.round(length * cargo) && tries < 80; tries += 1) {
    const t = 0.22 + b.rnd() * (fore - 0.26);
    const x = (b.rnd() < 0.5 ? -1 : 1) * (hb - 0.7 - b.rnd() * (cannons ? 0.3 : 1.5));
    if (nearGap(Math.sign(x), t)) continue;
    const a = b.pick(goods);
    const [px, py] = at(t, x);
    if (!b.free(px, py, Math.max(ASSETS[a].w, ASSETS[a].h) * 0.9, 0.05)) continue;
    b.put(a, px, py, { rot: rot + b.int(-12, 12) });
    i += 1;
  }
  return at;
}
/** -1 or 1, at random. */
const s1 = (b) => (b.chance(0.5) ? -1 : 1);

function shipAtSea(b) {
  const { cols, rows } = b;
  b.fill(0, 0, cols, rows, 'D');
  // The Ship's deck is at most 20 squares long.
  const length = clamp(Math.floor((cols - 8) / 2) * 2, 12, 20);
  const beam = clamp(Math.floor((length / 2.9) * 2) / 2, 4, 7);
  const two = rows >= beam * 2 + 9 && b.chance(0.55);
  const masts = length >= 18 ? 3 : length >= 14 ? 2 : 1;
  const cx = Math.round(cols / 2);
  if (!two) {
    const cy = half(rows / 2);
    const at = ship(b, { cx, cy, length, beam: Math.min(beam, Math.floor(rows / 2 - 2) * 2), rot: b.chance(0.5) ? 90 : 270, masts, cannons: b.chance(0.7), cargo: 0.6 });
    // A boat towed behind, flotsam about.
    const [tx, ty] = at(-0.12, 0);
    if (b.free(tx, ty, 2)) b.put('rowboat', tx, ty, { rot: b.int(80, 100) });
  } else {
    // Grappled: the bigger ship above, the smaller below, gangplanks across.
    const beamB = Math.max(4, beam - 1);
    const gap = 3;
    const top = Math.round((rows - beam - beamB - gap) / 2);
    const cyA = top + beam / 2;
    const cyB = top + beam + gap + beamB / 2;
    const lengthB = clamp(Math.floor((length - 2) / 2) * 2, 12, 20);
    const rotA = b.chance(0.5) ? 90 : 270;
    const rotB = b.chance(0.6) ? 360 - rotA : rotA;
    const cxB = cx + (rotA === rotB ? -1 : 1);
    // Where each ship's sides run straight (not round the bow), and the planks inside both.
    const straight = (x0, len, bw, rot) => (rot === 90 ? [x0 - len / 2, x0 + len / 2 - Math.min(bw, len * 0.35)] : [x0 - len / 2 + Math.min(bw, len * 0.35), x0 + len / 2]);
    const [loA, hiA] = straight(cx, length, beam, rotA);
    const [loB, hiB] = straight(cxB, lengthB, beamB, rotB);
    const lo = Math.max(loA, loB) + 1;
    const hi = Math.min(hiA, hiB) - 2;
    const planks = hi - lo >= 3 ? [Math.floor(lo + (hi - lo) * 0.25), Math.floor(lo + (hi - lo) * 0.8)] : [Math.floor((lo + hi) / 2)];
    // Which side of each faces the other, and where along it each plank comes aboard.
    const gapsFor = (rot, len, facingDown, x0) => planks.map((px) => ({ side: (rot === 90) === facingDown ? 1 : -1, t: rot === 90 ? (px + 0.5 - (x0 - len / 2)) / len : ((x0 + len / 2) - (px + 0.5)) / len }));
    ship(b, { cx, cy: cyA, length, beam, rot: rotA, masts, cannons: true, cargo: 0.4, gaps: gapsFor(rotA, length, true, cx) });
    ship(b, { cx: cxB, cy: cyB, length: lengthB, beam: beamB, rot: rotB, masts: Math.max(1, masts - 1), cannons: b.chance(0.6), cargo: 0.6, gaps: gapsFor(rotB, lengthB, false, cxB) });
    for (const px of planks) b.put('gangplank', px + 0.5, top + beam + gap / 2, { w: 1, h: gap + 1.2, rot: b.int(-6, 6) });
    for (const px of [cx - 7, cx + 6]) if (b.chance(0.7)) b.put('rope_coil', px, top + beam + gap / 2, { w: 0.7, h: 0.7, rot: b.int(0, 359) });
  }
  // Flotsam on the water.
  for (let i = 0, tries = 0; i < 3 && tries < 40; tries += 1) {
    const x = 1 + b.rnd() * (cols - 2);
    const y = 1 + b.rnd() * (rows - 2);
    if (!['D', 'W'].includes(b.get(Math.floor(x), Math.floor(y))) || !b.free(x, y, 2.4)) continue;
    b.put(b.pick(['driftwood', 'barrel', 'driftwood', 'crate']), x, y, { rot: b.int(0, 359) });
    i += 1;
  }
  return b.done({ mood: b.pick(['day', 'day', 'day', 'dusk']) });
}

// ---------- harbour ----------

function docks(b) {
  const { cols, rows } = b;
  const landH = clamp(Math.round(rows * 0.36), 7, 14);
  ground(b, 'D', [['W', 0.12, 0.7, 1]]);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) if (r >= landH && r < landH + 3 && b.get(c, r) === 'D') b.set(c, r, 'W');
  b.fill(0, 0, cols, landH, 'c');
  for (let r = 0; r < landH; r += 1) for (let c = 0; c < cols; c += 1) if (noise(c * 0.2, r * 0.2, 4) > 0.72) b.set(c, r, 'v');
  // The quay's edge: a low stone wall along the water, gaps where the piers run out.
  const pierW = 2;
  const piers = [];
  const n = clamp(Math.floor(cols / 13), 2, 4);
  for (let i = 0; i < n; i += 1) piers.push(Math.round(((i + 0.5) * cols) / n) - 1);
  const pierEnd = rows - clamp(Math.round(rows * 0.12), 2, 4);
  let from = 0;
  for (const px of piers) {
    if (px - from > 0) b.line(from, landH, px, landH, 'low', 'stone');
    from = px + pierW;
  }
  if (cols - from > 0) b.line(from, landH, cols, landH, 'low', 'stone');
  for (const px of piers) {
    b.fill(px, landH, pierW, pierEnd - landH, 'w');
    for (let y = landH + 2.5; y < pierEnd - 0.5; y += 3) for (const s of [0, 1]) b.put('bollard', px + (s ? pierW - 0.25 : 0.25), y, { w: 0.5, h: 0.5 });
  }
  // A ship tied up beside one pier, a gangplank to it.
  const length = clamp(Math.floor((pierEnd - landH - 3) / 2) * 2, 12, 20);
  const beam = clamp(Math.floor((length / 2.9) * 2) / 2, 4, 6);
  // The berth: water to the right of a pier wide enough for the ship and a boat's width more.
  const room = piers.map((px, i) => ({ px, space: (i + 1 < piers.length ? piers[i + 1] : cols) - (px + pierW) }));
  const fit = room.filter((o) => o.space >= beam + 2).sort((p, q) => q.space - p.space)[0];
  const berth = fit?.px ?? null;
  const right = true;
  const scx = berth + pierW + 0.5 + beam / 2;
  const scy = landH + 2 + length / 2;
  if (berth !== null && scy + length / 2 <= rows) {
    const rot = b.chance(0.5) ? 0 : 180;
    const facesPier = right ? (rot === 0 ? -1 : 1) : (rot === 0 ? 1 : -1);
    const tPlank = 0.4;
    const at = ship(b, { cx: scx, cy: scy, length, beam, rot, masts: length >= 18 ? 3 : 2, cannons: b.chance(0.35), cargo: 0.5, gaps: [{ side: facesPier, t: tPlank }] });
    const [gx, gy] = at(tPlank, facesPier * (beam / 2));
    b.put('gangplank', right ? gx - 0.6 : gx + 0.6, gy, { w: 1, h: 2.2, rot: 90 });
  }
  // Boats tied at the other piers; a raft.
  for (const px of piers) {
    if (px === berth) continue;
    for (let y = landH + 3; y < pierEnd - 2; y += b.int(4, 6)) {
      const side = b.chance(0.5) ? -1 : 1;
      const x = side < 0 ? px - 0.75 : px + pierW + 0.75;
      if (!b.free(x, y + 1, 1.4) || x < 1 || x > cols - 1) continue;
      b.put(b.pick(['rowboat', 'rowboat', 'canoe']), x, y + 1, { rot: b.int(-8, 8) });
    }
  }
  for (let i = 0, tries = 0; i < 2 && tries < 30; tries += 1) {
    const x = 2 + b.rnd() * (cols - 4);
    const y = landH + 4 + b.rnd() * (rows - landH - 6);
    if (b.get(Math.floor(x), Math.floor(y)) === 'w' || !b.free(x, y, 2.5)) continue;
    b.put(b.pick(['buoy', 'raft', 'buoy']), x, y, { rot: b.int(0, 359), tint: b.pick(['#c0392b', '#d9a441']) });
    i += 1;
  }
  // Warehouses along the top, their doors to the quay.
  const homes = [];
  let x = 1;
  let id = 1;
  const bh = clamp(landH - 4, 4, 7);
  while (x < cols - 6) {
    const w = b.int(6, 9);
    if (x + w > cols - 1) break;
    const kind = id === 2 ? 'office' : 'store';
    homes.push(house(b, { x, y: 0, w, h: bh }, id, { door: 'S', style: b.pick(['wood', 'brick', 'stone']), floorCh: kind === 'office' ? 'w' : b.pick(['w', 'f']), kind }));
    id += 1;
    x += w + b.int(2, 4);
  }
  b.autoWalls();
  for (const room of homes) {
    b.setEdge(room.x + Math.floor(room.w / 2), room.h - 1, 'S', 'door');
    if (room.w >= 7) b.setEdge(room.x + Math.floor(room.w / 2) - 1, room.h - 1, 'S', 'door');
    if (room.kind === 'office') {
      b.setEdge(room.x + 1, room.h - 1, 'S', 'window');
      b.put('desk', room.x + room.w / 2, 1.6, { rot: 180 });
      b.put('chair', room.x + room.w / 2, 0.85);
      b.put('map_table', room.x + 1.6, room.h - 1.6);
      b.against(room, 'E', 'shelves', room.h / 2);
      b.put('chest', room.x + room.w - 1, room.h - 0.9);
      b.put('lantern', room.x + room.w / 2 + 0.5, 1.4);
      continue;
    }
    for (let i = 0; i < room.w * room.h * 0.25; i += 1) {
      const a = b.pick(['crate', 'crate_stack', 'barrel', 'barrel_stack', 'sacks', 'crate']);
      const px = room.x + 0.6 + b.rnd() * (room.w - 1.2);
      const py = 0.6 + b.rnd() * (room.h - 2.2);
      if (b.free(px, py, Math.max(ASSETS[a].w, ASSETS[a].h) * 0.85, 0.05)) b.put(a, px, py, { rot: b.int(0, 3) * 90 + b.int(-5, 5) });
    }
  }
  // The street along the quay: cargo, nets and pots, a cart, lamps.
  b.paths.push({ id: newDesignId(), kind: 'cobble', w: 2, pts: [[0, bh + 1.6], [cols, bh + 1.6]] });
  const quayY = (bh + landH) / 2 + 0.6;
  for (let i = 0, tries = 0; i < cols * 0.5 && tries < cols * 4; tries += 1) {
    const a = b.pick(['crate', 'barrel', 'sacks', 'fishing_net', 'lobster_pots', 'fish_crate', 'rope_coil', 'crate_stack', 'barrel_stack', 'anchor', 'handcart']);
    const px = 1 + b.rnd() * (cols - 2);
    const py = bh + 1 + b.rnd() * (landH - bh - 1.6);
    const size = Math.max(ASSETS[a].w, ASSETS[a].h);
    if (py + size / 2 > landH - 0.1 || !b.free(px, py, size * 0.85, 0.15) || piers.some((p) => px > p - 0.5 && px < p + pierW + 0.5)) continue;
    b.put(a, px, py, { rot: a === 'handcart' ? b.int(-20, 20) : b.int(0, 359) });
    i += 1;
  }
  for (let px = 3; px < cols - 2; px += 9) if (b.free(px, quayY - 1.4, 0.8)) b.put('lamp_post', px, quayY - 1.4);
  for (const px of piers) b.put('lantern', px + pierW / 2, pierEnd - 0.5, { w: 0.45, h: 0.45 });
  return b.done({ mood: b.pick(['day', 'day', 'dusk']) });
}

// ---------- temple ----------

function temple(b) {
  const { cols, rows } = b;
  ground(b, 'g', [['G', 0.15, 0.62, 1], ['d', 0.25, 0, 0.08]]);
  // The nave runs up the middle (aisles behind pillars either side), the sanctuary opens off its top between the
  // vestry and the bell tower, a porch at the bottom.
  const W = clamp(Math.floor((cols - 6) / 2) * 2, 12, 34);
  const x0 = Math.floor((cols - W) / 2);
  const top = 2;
  const porchH = rows >= 24 ? 3 : 2;
  const bottom = rows - 1 - porchH;
  const sideW = clamp(Math.round(W * 0.27), 4, 8);
  const sanctH = clamp(Math.round((bottom - top) * 0.3), 4, 9);
  const nave = { x: x0, y: top + sanctH, w: W, h: bottom - top - sanctH };
  const sanct = { x: x0 + sideW, y: top, w: W - sideW * 2, h: sanctH };
  const vestry = { x: x0, y: top, w: sideW, h: sanctH };
  const belfry = { x: x0 + W - sideW, y: top, w: sideW, h: sanctH };
  const porch = { x: x0 + W / 2 - 2, y: bottom, w: 4, h: porchH };
  const floorCh = b.pick(['M', 'M', 'f', 'S', 'k']);
  const style = b.pick(['stone', 'stone', 'brick']);
  for (const id of [1, 2, 3, 4]) b.style(id, style);
  b.fill(nave.x, nave.y, nave.w, nave.h, floorCh, 1);
  b.fill(sanct.x, sanct.y, sanct.w, sanct.h, floorCh === 'k' ? 'M' : floorCh, 1);
  b.fill(vestry.x, vestry.y, vestry.w, vestry.h, b.pick(['z', 'w']), 2);
  b.fill(belfry.x, belfry.y, belfry.w, belfry.h, 'f', 3);
  b.fill(porch.x, porch.y, porch.w, porch.h, 'f', 4);
  // A path up to the porch, graves on one side.
  const cx = x0 + W / 2;
  b.paths.push({ id: newDesignId(), kind: 'stones', w: 1.6, pts: [[cx, rows], [cx, bottom + porchH]] });
  b.autoWalls();
  // Doors: the great doors and the porch's arch; the vestry into the sanctuary, the belfry into the nave.
  for (const dx of [-1, 0]) b.setEdge(cx + dx, nave.y + nave.h - 1, 'S', 'door');
  for (const dx of [-1, 0]) b.setEdge(cx + dx, porch.y + porch.h - 1, 'S', 'arch');
  b.setEdge(vestry.x + vestry.w - 1, vestry.y + vestry.h - 2, 'E', 'door');
  b.setEdge(belfry.x + 1, belfry.y + belfry.h - 1, 'S', 'door');
  // Windows down both sides of the nave.
  for (let y = nave.y + 2; y < nave.y + nave.h - 1; y += 3) {
    b.setEdge(nave.x, y, 'W', 'window');
    b.setEdge(nave.x + nave.w - 1, y, 'E', 'window');
  }
  // Pillars between the nave and its aisles.
  const aisle = W >= 18 ? 3 : 2;
  const pl = nave.x + aisle;
  const pr = nave.x + W - aisle;
  for (let y = nave.y + 1.5; y < nave.y + nave.h - 1.5; y += 3) for (const x of [pl, pr]) b.put('pillar', x, y, { w: 0.9, h: 0.9 });
  // The carpet up the middle; pews either side, facing the altar.
  const tint = b.pick(['#8a2a2a', '#2a4a8a', '#6a2a6a', '#2a6a4a', '#8a6a2a']);
  b.put('carpet_runner', cx, nave.y + nave.h / 2 - 0.5, { w: 1.6, h: r2(nave.h - 1.2), tint, underfoot: true });
  for (let y = nave.y + 3.2; y < nave.y + nave.h - 2.2; y += 1.7) {
    for (const s of [-1, 1]) {
      const inner = cx + s * 1.1;
      const outer = s < 0 ? pl + 0.75 : pr - 0.75;
      const len = Math.abs(outer - inner);
      if (len < 1.6) continue;
      b.put('pew', (inner + outer) / 2, y, { w: r2(Math.min(len, 4.5)), h: 0.8 });
    }
  }
  // The sanctuary: a dais with the altar, the god behind it, candles and banners.
  const dais = { w: Math.min(4, sanct.w - 1), h: Math.min(3, sanct.h - 1.5) };
  b.put('dais', cx, sanct.y + 0.3 + dais.h / 2 + 0.9, { w: dais.w, h: dais.h, underfoot: true });
  b.put('altar', cx, sanct.y + 0.3 + dais.h / 2 + 0.9, { tint });
  if (sanct.h >= 5) b.put('god_statue', cx, sanct.y + 1, { w: 1.8, h: 1.8 });
  for (const s of [-1, 1]) {
    if (sanct.w >= 7) b.put('candle_stand', cx + s * (dais.w / 2 + 0.9), sanct.y + 1.2, { rot: 0 });
    if (sanct.w >= 9) b.against(sanct, 'N', 'banner', sanct.w / 2 + s * (sanct.w / 2 - 1), { tint });
    if (sanct.h >= 6) b.put('incense', cx + s * (dais.w / 2 + 0.6), sanct.y + sanct.h - 1.2);
  }
  b.put('offering_bowl', cx, sanct.y + dais.h + 1.7);
  b.put('holy_symbol', cx, nave.y + 1.4, { tint: '#d9b44a' });
  // The aisles: a shrine and an organ at the top, candles, statues, coloured light from the windows; the font by the doors.
  b.against({ x: nave.x, y: nave.y, w: aisle, h: nave.h }, 'N', 'shrine', aisle / 2, { w: Math.min(1.5, aisle - 0.3) });
  b.put('organ', pr + aisle / 2, nave.y + 0.6, { w: Math.min(3, aisle - 0.2), h: 1 });
  for (let y = nave.y + 2; y < nave.y + nave.h - 1; y += 3) {
    for (const s of [-1, 1]) {
      const x = s < 0 ? nave.x + 0.9 : nave.x + W - 0.9;
      if (b.chance(0.6) && b.free(x + s * -0.3, y + 0.5, 1.6)) b.put('stained_light', x - s * 0.8, y + 0.5, { w: 2, h: 2, rot: s < 0 ? 0 : 180 });
    }
  }
  for (const s of [-1, 1]) {
    const x = s < 0 ? nave.x + aisle / 2 : nave.x + W - aisle / 2;
    for (let y = nave.y + 3.5; y < nave.y + nave.h - 2; y += b.int(4, 6)) {
      const a = b.pick(['angel_statue', 'candle_stand', 'prayer_mat', 'effigy_tomb', 'candle_stand']);
      if (b.free(x, y, Math.max(ASSETS[a].w, ASSETS[a].h) * 0.8)) b.put(a, x, y, { rot: s < 0 ? 90 : 270, w: Math.min(ASSETS[a].w, aisle - 0.4), h: Math.min(ASSETS[a].h, a === 'effigy_tomb' ? 2.4 : ASSETS[a].h) });
    }
  }
  b.put('font', cx - (W >= 16 ? 3 : 2.2), nave.y + nave.h - 1.4);
  // The vestry: robes, books, the relics; the belfry: the stair up and the bell overhead.
  b.against(vestry, 'N', 'wardrobe', 1.1);
  b.against(vestry, 'W', 'bookshelf', vestry.h / 2 + 0.4);
  b.put('desk', vestry.x + vestry.w / 2 + 0.3, vestry.y + vestry.h - 1.4);
  b.put('chair', vestry.x + vestry.w / 2 + 0.3, vestry.y + vestry.h - 0.75, { rot: 180 });
  b.put('reliquary', vestry.x + vestry.w - 0.8, vestry.y + 0.6);
  b.put('chest', vestry.x + 0.9, vestry.y + vestry.h - 0.6);
  b.put('stairs_spiral', belfry.x + belfry.w - 1.2, belfry.y + 1.2);
  b.put('bell', belfry.x + belfry.w / 2 - 0.4, belfry.y + belfry.h / 2 + 0.3, { w: 1.6, h: 1.6 });
  b.put('rope_coil', belfry.x + 0.8, belfry.y + belfry.h - 0.9, { w: 0.7, h: 0.7 });
  b.put('crate', belfry.x + belfry.w - 0.8, belfry.y + belfry.h - 0.8);
  torches(b, { x: sanct.x, y: sanct.y, w: sanct.w, h: sanct.h }, 2);
  // Outside: graves to one side, trees and bushes.
  const gx = b.chance(0.5) ? 1 : x0 + W + 1;
  for (let y = nave.y + 2; y < rows - 2; y += 2.6) {
    for (let x = gx; x < gx + Math.max(0, x0 - 2) && x < cols - 1; x += 1.6) {
      if (b.chance(0.3) || !b.free(x + 0.5, y, 1.2)) continue;
      b.put(b.pick(['tombstone', 'grave_cross', 'tombstone']), x + 0.5, y - 0.6);
      if (b.chance(0.6)) b.put('grave', x + 0.5, y + 0.6, { h: 1.6 });
    }
  }
  woods(b, (x, y) => (x > x0 - 1 && x < x0 + W + 1 && y > top - 1.5 && y < rows - porchH + 1 ? 0 : Math.abs(x - cx) < 2 && y > bottom ? 0 : 0.3), { kinds: ['tree', 'birch', 'pine', 'tree'], under: ['bush', 'flowers', 'tall_grass'] });
  return b.done();
}

// ---------- farm ----------

/** A fence round a rectangle, open in the middle of one side (a gate). */
function fence(b, { x, y, w, h }, gate = 'S', gateW = 2) {
  const sides = { N: [[x, y], [x + w, y]], S: [[x, y + h], [x + w, y + h]], W: [[x, y], [x, y + h]], E: [[x + w, y], [x + w, y + h]] };
  for (const [side, [p, q]] of Object.entries(sides)) {
    if (side !== gate) {
      b.line(p[0], p[1], q[0], q[1], 'low', 'wood');
      continue;
    }
    const along = side === 'N' || side === 'S' ? w : h;
    const g0 = Math.floor((along - gateW) / 2);
    if (side === 'N' || side === 'S') {
      if (g0 > 0) b.line(p[0], p[1], p[0] + g0, p[1], 'low', 'wood');
      if (along - g0 - gateW > 0) b.line(p[0] + g0 + gateW, p[1], q[0], q[1], 'low', 'wood');
    } else {
      if (g0 > 0) b.line(p[0], p[1], p[0], p[1] + g0, 'low', 'wood');
      if (along - g0 - gateW > 0) b.line(p[0], p[1] + g0 + gateW, q[0], q[1], 'low', 'wood');
    }
  }
}

function farm(b) {
  const { cols, rows } = b;
  ground(b, 'g', [['G', 0.14, 0.6, 1], ['o', 0.2, 0, 0.1]]);
  // The yard in the middle of the left half, the farmhouse above it, the barn to its right.
  const yard = { x: clamp(Math.round(cols * 0.12), 2, 8), y: clamp(Math.round(rows * 0.36), 6, 14), w: clamp(Math.round(cols * 0.36), 10, 18), h: clamp(Math.round(rows * 0.3), 6, 10) };
  b.blob(yard.x + yard.w / 2, yard.y + yard.h / 2, yard.w / 2 + 0.8, yard.h / 2 + 0.6, 'd', { rough: 0.25, s: 3 });
  const hw = clamp(Math.round(yard.w * 0.5), 6, 8);
  const hh = clamp(yard.y - 2, 4, 6);
  const home = house(b, { x: yard.x + 1, y: yard.y - hh, w: hw, h: hh }, 1, { door: 'S', style: b.pick(['wood', 'stone', 'brick']), floorCh: 'w' });
  const bw = clamp(Math.round(yard.w * 0.55), 7, 10);
  const bh = clamp(yard.h + 2, 7, 10);
  const barn = { x: yard.x + yard.w, y: yard.y - 1, w: bw, h: bh };
  const fitsBarn = barn.x + barn.w <= cols - 1 && barn.y + barn.h <= rows - 1;
  if (fitsBarn) {
    b.style(2, 'wood');
    b.fill(barn.x, barn.y, barn.w, barn.h, 'y', 2);
  }
  // A track in from the left to the yard.
  b.paths.push({ id: newDesignId(), kind: 'road', w: 1.8, pts: wander(b, [0, yard.y + yard.h * 0.6 + b.int(-2, 2)], [yard.x + 2, yard.y + yard.h * 0.55], 1.2, 3) });
  b.autoWalls();
  b.setEdge(home.x + Math.floor(home.w / 2), home.y + home.h - 1, 'S', 'door');
  b.setEdge(home.x, home.y + Math.floor(home.h / 2), 'W', 'window');
  b.setEdge(home.x + home.w - 1, home.y + Math.floor(home.h / 2), 'E', 'window');
  furnishHouse(b, home);
  if (fitsBarn) {
    // The barn's big doors face the yard; stalls down its far side with hay, the cart and gear in the middle.
    const mid = barn.y + Math.floor(barn.h / 2);
    for (const dy of [-1, 0]) b.setEdge(barn.x, mid + dy, 'W', 'door');
    const stallX = barn.x + barn.w - 2.5;
    for (let y = barn.y + 2; y < barn.y + barn.h - 0.5; y += 2) b.line(stallX, y, barn.x + barn.w, y, 'low', 'wood');
    for (let y = barn.y + 1; y < barn.y + barn.h - 0.5; y += 2) {
      b.put(b.pick(['hay_bale', 'trough', 'bucket', 'hay_bale']), barn.x + barn.w - 0.7, y, { rot: 90 });
    }
    b.put('cart', barn.x + barn.w / 2 - 1, barn.y + 1.4, { rot: 0 });
    b.put('haystack', barn.x + 1.3, barn.y + barn.h - 1.3, { w: 1.8, h: 1.8 });
    b.put('saddle', barn.x + barn.w / 2 - 0.5, barn.y + barn.h - 0.7);
    b.put('plough', barn.x + barn.w / 2 - 1.2, mid + 1.6, { rot: 90 });
    b.put('milk_churn', barn.x + 0.6, barn.y + 0.6);
    b.put('lantern', barn.x + barn.w / 2 - 0.5, mid);
  }
  // Round the yard: the well or pump, a woodpile, the coop and its run, the dog's kennel, the privy, the washing.
  const [ycx, ycy] = centre(yard);
  b.put(b.chance(0.5) ? 'well' : 'water_pump', ycx - 0.5, ycy + 0.3);
  b.put('trough', ycx + 2.4, ycy + 0.8, { rot: 90 });
  b.put('woodpile', home.x + home.w + 1.2, home.y + 1, { rot: 90 });
  b.put('chopping_block', home.x + home.w + 1.2, home.y + 2.6);
  b.put('kennel', home.x + home.w - 0.8, home.y + home.h + 0.9);
  b.put('privy', home.x - 1.2, home.y + 0.8);
  if (home.x + home.w + 3.5 < yard.x + yard.w) b.put('washing_line', home.x + home.w + 2.6, home.y + home.h - 1.2, { rot: 90 });
  const run = { x: yard.x + 1, y: yard.y + yard.h - 3, w: 4, h: 3 };
  if (run.y > home.y + home.h + 1) {
    fence(b, run, 'E', 1);
    b.put('chicken_coop', run.x + 1.4, run.y + 1);
  }
  b.put('manure', yard.x + yard.w - 1.2, yard.y + yard.h + 0.4);
  b.put('wheelbarrow', ycx + 1.2, ycy - 1.6, { rot: 60 });
  // The windmill on a rise in a corner, kept clear of the fields.
  const mill = [[cols - 4, rows - 4], [4, rows - 4], [cols - 4, 4]].find(([x, y]) => b.free(x, y, 4.5) && !overlaps({ x: x - 3, y: y - 3, w: 6, h: 6 }, { x: yard.x - 1, y: home.y - 1, w: (fitsBarn ? barn.x + barn.w : yard.x + yard.w) - yard.x + 2, h: yard.y + yard.h - home.y + 2 }, 0));
  // Fields to the right and below: farmland in rows of crops, a vegetable patch, pumpkins, a scarecrow; fenced.
  const fields = [];
  const fx = fitsBarn ? barn.x + barn.w + 2 : yard.x + yard.w + 2;
  const tryField = (f) => {
    if (f.w < 4 || f.h < 3 || f.x < 1 || f.y < 1 || f.x + f.w > cols - 1 || f.y + f.h > rows - 1) return;
    if (fields.some((o) => overlaps(f, o, 1)) || overlaps(f, { x: yard.x - 1, y: home.y - 1, w: yard.w + 2, h: yard.y + yard.h - home.y + 2 }, 0)) return;
    if (fitsBarn && overlaps(f, barn, 1)) return;
    if (mill) {
      // Cut the field back from the mill rather than lose it.
      const [mx, my] = mill;
      if (overlaps(f, { x: mx - 3, y: my - 3, w: 6, h: 6 }, 0)) {
        if (my > rows / 2) f.h = Math.min(f.h, my - 3 - f.y);
        else {
          const bottom = f.y + f.h;
          f.y = Math.max(f.y, my + 3);
          f.h = bottom - f.y;
        }
        if (f.w < 4 || f.h < 3) return;
      }
    }
    fields.push(f);
  };
  tryField({ x: fx, y: 2, w: cols - fx - 2, h: Math.round(rows * 0.4) });
  tryField({ x: fx, y: Math.round(rows * 0.4) + 4, w: cols - fx - 2, h: rows - Math.round(rows * 0.4) - 6 });
  tryField({ x: 2, y: yard.y + yard.h + 3, w: Math.round((cols - 4) * 0.45), h: rows - yard.y - yard.h - 5 });
  const tints = ['#c9a640', '#7fae3f', '#c9a640', '#a7c94f'];
  fields.forEach((f, i) => {
    const kind = i === 1 ? 'vineyard' : i === 2 ? 'veg' : 'crops';
    b.fill(f.x, f.y, f.w, f.h, kind === 'vineyard' ? 'G' : 't');
    fence(b, f, b.pick(['S', 'W', 'N']), 2);
    if (kind === 'crops') {
      const tint = tints[i % tints.length];
      for (let x = f.x + 1; x < f.x + f.w - 0.9; x += 2) for (let y = f.y + 1.3; y < f.y + f.h - 1.2; y += 2.6) b.put('crops', x, y, { w: 1.8, h: 2.6, tint });
      b.put('scarecrow', f.x + f.w / 2 + 0.5, f.y + f.h / 2);
    } else if (kind === 'vineyard') {
      for (let x = f.x + 1; x < f.x + f.w - 0.5; x += 1.5) for (let y = f.y + 1.6; y < f.y + f.h - 1.4; y += 3.2) b.put('vineyard', x, y);
    } else {
      for (let x = f.x + 1; x < f.x + f.w - 1.5; x += 2.2) for (let y = f.y + 1.1; y < f.y + f.h - 1.5; y += 2.2) b.put(b.pick(['vegetable_patch', 'vegetable_patch', 'pumpkins', 'sunflowers']), x + 0.5, y + 0.5, { rot: b.chance(0.5) ? 0 : 90 });
    }
  });
  // The orchard and the bees in a free corner; the windmill on the rise.
  const orchard = { x: 1, y: 1, w: Math.max(0, yard.x - 1), h: Math.max(0, home.y - 2) };
  for (let x = orchard.x + 1.2; x < orchard.x + orchard.w - 0.8; x += 2.6) for (let y = orchard.y + 1.2; y < orchard.y + orchard.h; y += 2.6) if (b.free(x, y, 1.6)) b.put('orchard_tree', x, y, { rot: b.int(0, 359) });
  if (mill) {
    b.blob(mill[0], mill[1], 2.6, 2.6, 'd', { rough: 0.2 });
    ring(b, mill[0], mill[1], 1.5, 'stone');
    b.put('windmill', mill[0], mill[1], { rot: b.int(0, 89) });
  }
  if (b.free(yard.x - 1.5, yard.y + 1, 1)) b.put('beehives', yard.x - 1.5, yard.y + 1);
  woods(b, (x, y) => {
    const near = (f, m) => x > f.x - m && x < f.x + f.w + m && y > f.y - m && y < f.y + f.h + m;
    if (near({ x: yard.x, y: home.y, w: (fitsBarn ? barn.x + barn.w : yard.x + yard.w) - yard.x, h: yard.y + yard.h - home.y }, 2) || fields.some((f) => near(f, 1.2))) return 0;
    if (mill && Math.hypot(x - mill[0], y - mill[1]) < 3.5) return 0;
    return Math.min(x, y, cols - x, rows - y) < 2.5 ? 0.5 : 0.08;
  }, { kinds: ['tree', 'birch', 'tree'], under: ['bush', 'flowers', 'tall_grass', 'bush_berry'] });
  return b.done();
}

// ---------- mine ----------

function mine(b) {
  const { cols, rows } = b;
  const open = Array.from({ length: rows }, () => Array(cols).fill(false));
  const inside = (c, r) => c >= 1 && r >= 1 && c < cols - 1 && r < rows - 1;
  let dug = 0;
  const dig = (x, y, w, h) => {
    for (let r = y; r < y + h; r += 1) {
      for (let c = x; c < x + w; c += 1) {
        if (!inside(c, r) || open[r][c]) continue;
        open[r][c] = true;
        dug += 1;
      }
    }
  };
  // The way in from the bottom edge; tunnels two squares wide run straight, turn and branch; galleries open off them.
  const runs = []; // { c, r, dir, len }: straight stretches, for rails and timbers
  const galleries = [];
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const startC = clamp(Math.round(cols * (0.3 + b.rnd() * 0.4)), 3, cols - 4);
  // The mouth: open from the edge.
  for (let r = rows - 3; r < rows; r += 1) for (let c = startC - 2; c <= startC + 3; c += 1) if (c >= 0 && c < cols) open[r][c] = true;
  const heads = [{ c: startC, r: rows - 3, dir: 3, gen: 0 }];
  const want = cols * rows * 0.3;
  for (let step = 0; heads.length && dug < want && step < 400; step += 1) {
    const h = heads.shift();
    const len = b.int(5, 11);
    const [dc, dr] = DIR[h.dir];
    let c = h.c;
    let r = h.r;
    let n = 0;
    for (; n < len; n += 1) {
      const nc = c + dc;
      const nr = r + dr;
      if (!inside(nc, nr) || !inside(nc + (dr ? 1 : 0), nr + (dc ? 1 : 0)) || nc > cols - 3 || nr > rows - 3) break;
      c = nc;
      r = nr;
      dig(c, r, 2, 2);
    }
    if (n >= 3) runs.push({ c: h.c, r: h.r, dir: h.dir, len: n });
    // A gallery at some ends; then go on: turn left or right, sometimes both ways (a branch).
    if (n >= 3 && b.chance(0.3) && galleries.length < 6) {
      const w = b.int(5, 8);
      const gh = b.int(4, 6);
      const g = { x: clamp(c - Math.floor(w / 2) + 1, 1, cols - w - 1), y: clamp(r - Math.floor(gh / 2) + 1, 1, rows - gh - 4), w, h: gh };
      dig(g.x, g.y, g.w, g.h);
      galleries.push(g);
    }
    if (h.gen > 14) continue;
    const turns = b.chance(0.35) ? [1, 3] : [b.chance(0.5) ? 1 : 3];
    if (b.chance(0.3)) turns.push(0);
    for (const t of turns) heads.push({ c, r, dir: (h.dir + t) % 4, gen: h.gen + 1 });
  }
  // Outside, along the bottom: open ground below the cliff the mine runs into.
  for (let r = rows - 2; r < rows; r += 1) for (let c = 0; c < cols; c += 1) open[r][c] = true;
  const cells = biggestRegion(open);
  const keep = new Set(cells.map(([c, r]) => `${c},${r}`));
  const isOpen = (c, r) => keep.has(`${c},${r}`);
  for (const [c, r] of cells) b.floor[r][c] = r >= rows - 2 ? (noise(c * 0.3, r, 5) > 0.5 ? 'g' : 'd') : 'r';
  // Gravel and rubble in patches; one gallery flooded, one fallen in.
  const s = b.int(1, 999);
  for (const [c, r] of cells) {
    if (r >= rows - 2) continue;
    const n = noise(c * 0.25, r * 0.25, s);
    if (n > 0.78) b.floor[r][c] = 'v';
    else if (n < 0.12) b.floor[r][c] = 'u';
  }
  const kept = galleries.filter((g) => isOpen(g.x + 1, g.y + 1));
  const flooded = kept.length >= 3 ? kept[kept.length - 1] : null;
  if (flooded) b.blob(flooded.x + flooded.w / 2, flooded.y + flooded.h / 2, flooded.w / 2, flooded.h / 2, 'W', { keep: (c, r) => isOpen(c, r), rough: 0.25 });
  caveWalls(b, isOpen, 'cave');
  // No wall along the map's own edges (the open ground runs off it).
  b.extraWalls = b.extraWalls.filter((w) => !((w.y1 >= rows && w.y2 >= rows) || (w.x1 <= 0 && w.x2 <= 0) || (w.x1 >= cols && w.x2 >= cols)));
  // Rails down the long straight runs, a cart here and there; timbers across the tunnels; lanterns.
  const across = (dir) => (dir % 2 === 0 ? 90 : 0); // a run east-west has its timbers north-south
  runs.forEach((run, i) => {
    const [dc, dr] = DIR[run.dir];
    const mid = (k) => [run.c + dc * k + 1, run.r + dr * k + 1];
    if (i < 6 && run.len >= 6) {
      for (let k = 1.5; k + 1.5 <= run.len; k += 3) {
        const [x, y] = mid(k);
        if (isOpen(Math.floor(x), Math.floor(y))) b.put('rails', x, y, { rot: run.dir % 2 === 0 ? 90 : 0, underfoot: true });
      }
      if (b.chance(0.6)) {
        const [x, y] = mid(Math.floor(run.len / 2));
        if (b.free(x, y, 1.4)) b.put('mine_cart', x, y, { rot: run.dir % 2 === 0 ? 90 : 0 });
      }
    }
    for (let k = 2; k < run.len; k += 4) {
      const [x, y] = mid(k);
      if (isOpen(Math.floor(x), Math.floor(y))) b.put('mine_support', x, y, { w: 2.4, h: 0.8, rot: across(run.dir) });
    }
    if (b.chance(0.5)) {
      const [x, y] = mid(Math.min(run.len - 1, 1));
      b.put('lantern', x + (run.dir % 2 ? 0.7 : 0), y + (run.dir % 2 ? 0 : 0.7));
    }
  });
  // In the galleries: ore, tools, crates, a shaft down; deep in, glowing fungus and crystals; an old miner.
  const dry = cells.filter(([c, r]) => r < rows - 2 && !['W', 'D'].includes(b.floor[r][c]));
  const byWall = dry.filter(([c, r]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => !isOpen(c + dc, r + dr)));
  const spot = (list, a, n, extra = () => ({})) => {
    for (let i = 0, tries = 0; i < n && tries < n * 12 && list.length; tries += 1) {
      const [c, r] = b.pick(list);
      const x = c + 0.5;
      const y = r + 0.5;
      if (!b.free(x, y, Math.max(ASSETS[a].w, ASSETS[a].h) * 0.9)) continue;
      b.put(a, x, y, { rot: b.int(0, 359), ...extra() });
      i += 1;
    }
  };
  kept.forEach((g, i) => {
    const [gx, gy] = centre(g);
    if (g === flooded) return;
    if (i === 0) {
      b.put('floor_hole', gx, gy);
      b.put('ladder', gx + 1.3, gy, { rot: 90 });
    } else if (i === 1) {
      for (const [dx, dy, a] of [[-1.5, -1, 'crate'], [-0.5, -1.1, 'crate'], [1.5, -0.9, 'barrel'], [1.4, 0.9, 'sacks'], [-1.6, 1, 'pickaxe']]) if (b.free(gx + dx, gy + dy, 0.8)) b.put(a, gx + dx, gy + dy, { rot: b.int(-10, 10) });
      b.put('table', gx, gy + 0.3, { w: 1.6, h: 0.9 });
      b.put('lantern', gx + 0.4, gy + 0.2);
    } else if (i === kept.length - 1 || b.chance(0.4)) {
      for (let k = 0; k < 6; k += 1) b.floor[g.y + b.int(0, g.h - 1)][g.x + b.int(0, g.w - 1)] = 'u';
      b.put('rock_pile', gx, gy, { rot: b.int(0, 359) });
    }
  });
  spot(byWall, 'ore', Math.round(cells.length / 45));
  spot(dry, 'pickaxe', 2);
  spot(byWall, 'crate', 2);
  spot(byWall, 'barrel', 2);
  spot(dry, 'rubble', Math.round(cells.length / 90));
  spot(byWall, 'glow_fungus', b.int(1, 3), () => ({ tint: b.pick(['#59f2c3', '#7fd3ff', '#b06cff']) }));
  if (b.chance(0.6)) spot(byWall, 'crystal', b.int(1, 2), () => ({ tint: b.pick(['#59c3ff', '#b06cff', '#5cf2a5']) }));
  spot(dry, 'skeleton', 1);
  spot(dry, 'bones', 2);
  // Outside the mouth: a cart, sacks of ore, a sign.
  b.put('signpost', startC - 1.5, rows - 0.9);
  if (b.free(startC + 3.5, rows - 1, 1.6)) b.put('wheelbarrow', startC + 3.4, rows - 1.1, { rot: 80 });
  return b.done({ void: '#2a2622' });
}

// ---------- graveyard ----------

function graveyard(b) {
  const { cols, rows } = b;
  ground(b, 'G', [['g', 0.13, 0.55, 1], ['d', 0.22, 0, 0.1], ['o', 0.3, 0.42, 0.46]]);
  // The wall round it (old and broken in places), the gate at the bottom; a path up the middle, another across.
  const Y = { x: 1, y: 1, w: cols - 2, h: rows - 2 };
  const gx = Math.floor(cols / 2) - 1;
  const style = b.pick(['stone', 'ruin']);
  b.line(Y.x, Y.y, Y.x + Y.w, Y.y, 'low', style);
  b.line(Y.x, Y.y, Y.x, Y.y + Y.h, 'low', style);
  b.line(Y.x + Y.w, Y.y, Y.x + Y.w, Y.y + Y.h, 'low', style);
  b.line(Y.x, Y.y + Y.h, gx, Y.y + Y.h, 'low', 'iron');
  b.line(gx + 2, Y.y + Y.h, Y.x + Y.w, Y.y + Y.h, 'low', 'iron');
  for (const s of [-0.3, 2.3]) b.put('lantern', gx + s, Y.y + Y.h - 0.3, { w: 0.45, h: 0.45 });
  const midY = Math.round(rows * 0.48);
  b.paths.push({ id: newDesignId(), kind: 'trail', w: 1.6, pts: [[gx + 1, rows], [gx + 1, midY], [gx + 1 + b.int(-1, 1), 3]] });
  b.paths.push({ id: newDesignId(), kind: 'trail', w: 1.2, pts: [[2, midY + b.int(-1, 1)], [gx + 1, midY], [cols - 2, midY + b.int(-1, 1)]] });
  // The chapel in a top corner, its door to the path.
  const left = b.chance(0.5);
  const ch = { w: clamp(Math.round(cols * 0.22), 5, 8), h: clamp(Math.round(rows * 0.26), 5, 8) };
  ch.x = left ? 3 : cols - 3 - ch.w;
  ch.y = 3;
  b.style(1, 'stone');
  b.fill(ch.x, ch.y, ch.w, ch.h, 'f', 1);
  b.autoWalls();
  b.setEdge(ch.x + Math.floor(ch.w / 2), ch.y + ch.h - 1, 'S', 'door');
  b.setEdge(ch.x, ch.y + 2, 'W', 'window');
  b.setEdge(ch.x + ch.w - 1, ch.y + 2, 'E', 'window');
  b.against(ch, 'N', 'altar', ch.w / 2);
  for (const s of [-1, 1]) b.put('candle', ch.x + ch.w / 2 + s * 1.3, ch.y + 0.6);
  for (let y = ch.y + 2.4; y < ch.y + ch.h - 1; y += 1.5) for (const s of [-1, 1]) b.put('pew', ch.x + ch.w / 2 + s * (ch.w / 4 + 0.2), y, { w: r2(ch.w / 2 - 1.2), h: 0.7 });
  // Mausoleums along the top on the other side.
  const tombsX = left ? ch.x + ch.w + 3 : 3;
  const tombsEnd = left ? cols - 3 : ch.x - 3;
  for (let x = tombsX + 1.5; x + 1.5 <= tombsEnd && x < tombsX + 12; x += 4.5) if (Math.abs(x - (gx + 1)) > 3) b.put('mausoleum', x, 4.4, { rot: 0 });
  // Rows of graves, the headstone at the top of each; some old (just a stone), one dug open.
  const graves = [];
  for (let y = 10; y < rows - 4; y += 3.2) {
    if (Math.abs(y + 0.5 - midY) < 1.8) continue;
    for (let x = 3; x < cols - 3; x += 1.7) {
      if (Math.abs(x - (gx + 1)) < 1.8 || b.chance(0.22)) continue;
      if (!b.free(x, y + 0.6, 1.2)) continue;
      graves.push([x, y]);
    }
  }
  const open = graves.length ? graves.splice(Math.floor(b.rnd() * graves.length), 1)[0] : null;
  for (const [x, y] of graves) {
    b.put(b.pick(['tombstone', 'tombstone', 'grave_cross', 'tombstone']), x, y - 0.5, { rot: b.int(-6, 6) });
    if (b.chance(0.75)) b.put('grave', x, y + 0.7, { h: 1.7 });
  }
  if (open) {
    b.put('tombstone', open[0], open[1] - 0.5, { rot: b.int(-15, 15) });
    b.put('floor_hole', open[0], open[1] + 0.8, { w: 1.1, h: 1.6 });
    b.put('pickaxe', open[0] + 1.1, open[1] + 1.2, { rot: 30 });
    b.put('rubble', open[0] - 1.1, open[1] + 0.8);
    b.put('bones', open[0] + 0.9, open[1] - 0.2);
  }
  // Statues, a bench, dead trees and a yew, bushes in the long grass.
  for (const [x, y] of [[gx - 1.5, midY - 1.6], [gx + 3.5, midY + 1.6]]) if (b.free(x, y, 1.4)) b.put(b.pick(['angel_statue', 'statue_broken', 'angel_statue']), x, y);
  if (b.free(gx - 1.6, midY + 1.6, 2)) b.put('bench', gx - 1.6, midY + 1.6);
  woods(b, (x, y) => (x < 2.2 || y < 2.2 || x > cols - 2.2 || y > rows - 2.2 || y < 8.5 || (x > ch.x - 2 && x < ch.x + ch.w + 2 && y < ch.y + ch.h + 2) ? 0 : 0.1), { kinds: ['dead_tree', 'dead_tree', 'dead_tree', 'willow'], under: ['tall_grass', 'bush', 'tall_grass', 'thorns'], spacing: 2.4 });
  return b.done({ mood: b.pick(['gloom', 'dusk', 'night', 'gloom']) });
}

// ---------- wizard's tower ----------

/**
 * A round tower: four quarter arcs, with a door or window (a square wide)
 * where `openings` says at its north, east, south and west points.
 */
function roundTower(b, cx, cy, R, openings = {}, style = 'stone') {
  const pts = { E: 0, S: 90, W: 180, N: 270 };
  const order = ['E', 'S', 'W', 'N'];
  const point = (deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy + R * Math.sin((deg * Math.PI) / 180)];
  const ends = (side) => {
    const [x, y] = point(pts[side]);
    const along = side === 'E' || side === 'W' ? [0, 0.5] : [0.5, 0];
    // Going round (clockwise on the map): where the arc into this point stops, and where the next starts.
    const sgn = side === 'E' ? [1, 1] : side === 'S' ? [-1, 1] : side === 'W' ? [-1, -1] : [1, -1];
    return openings[side] ? { stop: [x - along[0] * sgn[0] * (side === 'S' || side === 'N' ? -1 : 1), y - along[1] * sgn[1]], start: [x + along[0] * sgn[0] * (side === 'S' || side === 'N' ? -1 : 1), y + along[1] * sgn[1]] } : { stop: [x, y], start: [x, y] };
  };
  order.forEach((side, i) => {
    const next = order[(i + 1) % 4];
    const a = ends(side).start;
    const z = ends(next).stop;
    const [mx, my] = point(pts[side] + 45);
    b.extraWalls.push({ x1: a[0], y1: a[1], x2: z[0], y2: z[1], type: 'wall', style, arc: { x: r2(mx), y: r2(my) } });
    if (openings[side]) {
      const { stop, start } = ends(side);
      b.extraWalls.push({ x1: stop[0], y1: stop[1], x2: start[0], y2: start[1], type: openings[side], style });
    }
  });
}

function tower(b) {
  const { cols, rows } = b;
  ground(b, 'g', [['G', 0.15, 0.62, 1], ['v', 0.3, 0, 0.08]]);
  const cx = Math.round(cols / 2);
  const cy = Math.round(rows / 2) - (rows >= 20 ? 1 : 0);
  const R = clamp(Math.floor(Math.min(cols, rows) * 0.36), 5, 12);
  // The floor inside: every square whose middle is inside the wall.
  const floorTint = b.pick(['#8f8a80', '#9a8f7a', '#7d7f86', '#a08a6a']);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) if (Math.hypot(c + 0.5 - cx, r + 0.5 - cy) < R + 0.8) b.set(c, r, 'd');
  b.put('floor_round', cx, cy, { w: R * 2, h: R * 2, tint: floorTint, underfoot: true });
  roundTower(b, cx, cy, R, { S: 'door', E: 'window', W: 'window', N: R >= 8 ? 'window' : null }, b.pick(['stone', 'stone', 'brick']));
  b.paths.push({ id: newDesignId(), kind: 'stones', w: 1.4, pts: [[cx + b.int(-2, 2), rows], [cx, cy + R + 0.3]] });
  const tint = b.pick(['#8a6cff', '#3fb5ff', '#ff5a5a', '#5cf2a5']);
  // Round the summoning circle in the middle: the shelves along the wall, the instruments, the desk by a window.
  b.put(b.chance(0.6) ? 'pentagram' : 'magic_circle', cx, cy, { w: Math.min(3.4, R * 0.55), h: Math.min(3.4, R * 0.55), tint });
  b.put('rug_round', cx, cy, { w: Math.min(5, R * 0.8), h: Math.min(5, R * 0.8), tint: '#4a2a5a', underfoot: true });
  const wallAt = (deg, depth, a, extra = {}) => {
    const rad = (deg * Math.PI) / 180;
    const d = R - depth;
    return b.put(a, cx + Math.cos(rad) * d, cy + Math.sin(rad) * d, { rot: Math.round(deg + 90), ...extra });
  };
  const busy = new Set([90, 0, 180, 270]); // the door and windows
  for (let deg = 200; deg <= 340; deg += 360 / (Math.PI * R * 2 / 2.2)) if (![...busy].some((x) => Math.abs(x - deg) < 14)) wallAt(deg, 0.4, 'bookshelf');
  wallAt(135, 1.2, 'stairs_spiral', { rot: 0 });
  wallAt(30, 1.3, 'wizard_desk');
  const [dx, dy] = [cx + Math.cos(Math.PI / 6) * (R - 2.3), cy + Math.sin(Math.PI / 6) * (R - 2.3)];
  b.put('chair', dx, dy, { rot: 210 });
  b.put('telescope', cx + R - 1.1, cy - 1.4);
  b.put('orrery', cx - R * 0.45, cy - R * 0.38);
  b.put('globe', cx + R * 0.45, cy - R * 0.4);
  wallAt(160, 1, 'alchemy');
  wallAt(60, 0.5, 'scroll_rack');
  wallAt(115, 0.4, 'magic_mirror', { tint });
  b.put('cauldron', cx - R * 0.5, cy + R * 0.3);
  b.put('book_pile', cx + R * 0.3, cy + R * 0.25);
  b.put('potion', cx - R * 0.5 + 0.9, cy + R * 0.3 - 0.5, { tint: '#d94a4a' });
  for (const deg of [225, 315]) {
    const rad = (deg * Math.PI) / 180;
    b.put('arcane_pillar', cx + Math.cos(rad) * R * 0.45, cy + Math.sin(rad) * R * 0.45, { tint });
  }
  b.put('golem', cx - 1.8, cy + R - 1.6, { rot: 180 });
  b.put('candelabra', cx + 1.5, cy + R - 1.3);
  if (R >= 8) b.put('floating_stones', cx, cy - R * 0.62, { tint });
  // Outside: standing stones, an herb garden, rocks and trees.
  for (let i = 0; i < 4; i += 1) {
    const a = b.rnd() * Math.PI * 2;
    const d = R + 2 + b.rnd() * 2;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    if (b.free(x, y, 1.2) && Math.abs(x - cx) > 2) b.put(b.pick(['standing_stone', 'rocks', 'rune_stone', 'boulder']), x, y, { rot: b.int(0, 359) });
  }
  if (cy + R + 4 < rows) for (let i = 0; i < 3; i += 1) b.put(b.pick(['vegetable_patch', 'flowers', 'vegetable_patch']), cx + 3 + i * 1.6, cy + R + 2.2);
  woods(b, (x, y) => (Math.hypot(x - cx, y - cy) < R + 3 || (Math.abs(x - cx) < 2.5 && y > cy) ? 0 : 0.45), { kinds: ['pine', 'tree', 'birch', 'pine'], under: ['bush', 'ferns', 'rocks', 'tall_grass'] });
  return b.done({ mood: b.pick(['day', 'dusk', 'night']) });
}

// ---------- castle ----------

/** A round corner tower: three quarter arcs, open on the quarter `open` (NE, SE, SW or NW) that faces in, a round floor. */
function cornerTower(b, cx, cy, r, open, style = 'stone') {
  const P = { E: [cx + r, cy], S: [cx, cy + r], W: [cx - r, cy], N: [cx, cy - r] };
  const quarters = [['E', 'S', 45, 'SE'], ['S', 'W', 135, 'SW'], ['W', 'N', 225, 'NW'], ['N', 'E', 315, 'NE']];
  for (const [p, q, mid, name] of quarters) {
    if (name === open) continue;
    const rad = (mid * Math.PI) / 180;
    b.extraWalls.push({ x1: P[p][0], y1: P[p][1], x2: P[q][0], y2: P[q][1], type: 'wall', style, arc: { x: r2(cx + Math.cos(rad) * r), y: r2(cy + Math.sin(rad) * r) } });
  }
  b.put('floor_round', cx, cy, { w: r * 2, h: r * 2, underfoot: true });
}

function castle(b) {
  const { cols, rows } = b;
  ground(b, 'g', [['G', 0.14, 0.6, 1], ['d', 0.25, 0, 0.08]]);
  const big = cols >= 32 && rows >= 26;
  const tr = big ? 3 : 2;
  const m = tr;
  const X0 = m;
  const Y0 = m;
  const X1 = cols - m;
  const Y1 = rows - m;
  const style = b.pick(['stone', 'stone', 'brick']);
  // The courtyard (area 1) inside the curtain wall; buildings in it are areas of their own.
  b.style(1, style);
  b.fill(X0, Y0, X1 - X0, Y1 - Y0, 'd', 1);
  for (let r = Y0; r < Y1; r += 1) for (let c = X0; c < X1; c += 1) if (noise(c * 0.3, r * 0.3, 11) > 0.62) b.set(c, r, 'c');
  // The gatehouse at the bottom: guard rooms either side of the gate passage.
  const gx = Math.floor((X0 + X1) / 2) - 1;
  const gd = big ? 3 : 2;
  const guard = [{ x: gx - 3, y: Y1 - gd, w: 3, h: gd, id: 2 }, { x: gx + 2, y: Y1 - gd, w: 3, h: gd, id: 3 }];
  for (const g of guard) {
    b.style(g.id, style);
    b.fill(g.x, g.y, g.w, g.h, 'f', g.id);
  }
  // The keep against the top wall: the great hall, the lord's chamber and the kitchen behind it.
  const kw = clamp(Math.round((X1 - X0) * 0.5), 8, 22);
  const kh = clamp(Math.round((Y1 - Y0) * 0.42), 5, 13);
  const kx = Math.floor((X0 + X1 - kw) / 2);
  const backH = big ? clamp(Math.round(kh * 0.38), 3, 5) : 0;
  const hall = { x: kx, y: Y0 + backH, w: kw, h: kh - backH, id: 4 };
  const chamber = { x: kx, y: Y0, w: Math.floor(kw / 2), h: backH, id: 5 };
  const kitchen = { x: kx + Math.floor(kw / 2), y: Y0, w: kw - Math.floor(kw / 2), h: backH, id: 6 };
  const keepRooms = backH ? [hall, chamber, kitchen] : [hall];
  for (const room of keepRooms) b.style(room.id, style);
  b.fill(hall.x, hall.y, hall.w, hall.h, b.pick(['M', 'f', 'k']), 4);
  if (backH) {
    b.fill(chamber.x, chamber.y, chamber.w, chamber.h, 'z', 5);
    b.fill(kitchen.x, kitchen.y, kitchen.w, kitchen.h, 'f', 6);
  }
  // Stables down the left wall, barracks and the smithy down the right.
  const side = [];
  if (big) {
    const sh = clamp(Math.round((Y1 - Y0) * 0.38), 6, 12);
    const stable = { x: X0, y: Y0 + tr + 1, w: 4, h: sh, id: 7, kind: 'stable' };
    const barracks = { x: X1 - 5, y: Y0 + tr + 1, w: 5, h: Math.round(sh * 0.6), id: 8, kind: 'barracks' };
    const smithy = { x: X1 - 5, y: barracks.y + barracks.h, w: 5, h: Math.max(4, sh - barracks.h), id: 9, kind: 'smithy' };
    for (const room of [stable, barracks, smithy]) {
      if (room.x < kx - 1 || room.x + room.w > kx + kw + 1 || room.y >= hall.y + hall.h + 1) {
        b.style(room.id, room.kind === 'stable' ? 'wood' : style);
        b.fill(room.x, room.y, room.w, room.h, room.kind === 'stable' ? 'y' : room.kind === 'smithy' ? 'f' : 'w', room.id);
        side.push(room);
      }
    }
  }
  b.autoWalls();
  // Take the curtain wall out where the towers stand, and put the towers in.
  for (const [cx, cy] of [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]]) {
    for (let k = 0; k < tr; k += 1) {
      b.setEdge(cx === X0 ? X0 + k : X1 - 1 - k, cy === Y0 ? Y0 : Y1 - 1, cy === Y0 ? 'N' : 'S', null);
      b.setEdge(cx === X0 ? X0 : X1 - 1, cy === Y0 ? Y0 + k : Y1 - 1 - k, cx === X0 ? 'W' : 'E', null);
    }
    cornerTower(b, cx, cy, tr, cx === X0 ? (cy === Y0 ? 'SE' : 'NE') : (cy === Y0 ? 'SW' : 'NW'), style);
  }
  // The gate: doors out, the portcullis inside them; the guard rooms open onto the passage.
  for (const dx of [0, 1]) b.setEdge(gx + dx, Y1 - 1, 'S', 'door');
  b.put('portcullis', gx + 1, Y1 - 0.8, { w: 2, h: 0.4 });
  b.setEdge(guard[0].x + guard[0].w - 1, Y1 - 1, 'E', 'door');
  b.setEdge(guard[1].x, Y1 - 1, 'W', 'door');
  for (const g of guard) {
    b.put(b.pick(['weapon_rack', 'barrel', 'crate']), g.x + g.w / 2, g.y + 0.5, { rot: 0 });
    if (g.h >= 3) b.put('stool', g.x + g.w / 2, g.y + 1.8);
  }
  for (const s of [-1, 1]) b.put('torch', gx + 1 + s * 1.6, Y1 + 0.3, { rot: 180 });
  b.paths.push({ id: newDesignId(), kind: 'road', w: 2, pts: wander(b, [gx + 1, Y1], [gx + 1 + b.int(-3, 3), rows], 0.8, 2) });
  b.paths.push({ id: newDesignId(), kind: 'cobble', w: 2, pts: [[gx + 1, Y1 - gd], [gx + 1, hall.y + hall.h]] });
  // The keep's doors, the great hall: the throne on a dais under banners, long tables, braziers.
  const hcx = hall.x + hall.w / 2;
  for (const dx of [-1, 0]) b.setEdge(Math.floor(hcx) + dx, hall.y + hall.h - 1, 'S', 'door');
  for (let y = hall.y + 2; y < hall.y + hall.h - 1; y += 3) {
    b.setEdge(hall.x, y, 'W', 'window');
    b.setEdge(hall.x + hall.w - 1, y, 'E', 'window');
  }
  const tint = b.pick(['#8a2a2a', '#2a3f8a', '#2a6a3a', '#6a2a6a']);
  b.put('dais', hcx, hall.y + 1.3, { w: Math.min(4, hall.w - 4), h: 2, underfoot: true });
  b.put('throne_grand', hcx, hall.y + 1.1, { w: 1.6, h: 1.6 });
  b.put('carpet_runner', hcx, hall.y + 2.4 + (hall.h - 3) / 2, { w: 1.6, h: r2(Math.max(1, hall.h - 3)), tint, underfoot: true });
  for (const s of [-1, 1]) {
    b.against(hall, 'N', 'banner', hall.w / 2 + s * 2.6, { tint });
    if (hall.w >= 12) b.against(hall, 'N', 'tapestry', hall.w / 2 + s * (hall.w / 2 - 2.2), { tint });
    b.put('brazier', hcx + s * 2.6, hall.y + 2.5);
    if (hall.h >= 7 && hall.w >= 12) {
      const tx = hcx + s * Math.min(4.5, hall.w / 2 - 2.5);
      const len = Math.min(4, hall.h - 4.5);
      b.put('table_long', tx, hall.y + 3.4 + len / 2, { w: len, h: 1, rot: 90 });
      for (let y = hall.y + 3.6; y < hall.y + 3.2 + len; y += 1) for (const t of [-1, 1]) b.put('chair', tx + t * 0.85, y, { rot: t < 0 ? 90 : 270 });
    }
  }
  if (hall.w >= 10) b.put('chandelier', hcx, hall.y + hall.h / 2 + 0.5);
  torches(b, hall, 2);
  if (backH) {
    b.setEdge(chamber.x + chamber.w - 2, chamber.y + chamber.h - 1, 'S', 'door');
    b.setEdge(kitchen.x + 1, kitchen.y + kitchen.h - 1, 'S', 'door');
    b.against(chamber, 'N', 'bed_double', 1.4);
    b.against(chamber, 'W', 'wardrobe', chamber.h / 2 + 0.3);
    if (chamber.w >= 6) b.put('desk', chamber.x + chamber.w - 1.4, chamber.y + 1, { rot: 0 });
    b.put('chest', chamber.x + 2.8, chamber.y + 0.5);
    b.put('rug', chamber.x + chamber.w / 2, chamber.y + chamber.h - 1.2, { w: 2, h: 1.2, tint });
    b.against(kitchen, 'N', 'oven', 1.3);
    if (kitchen.w >= 6) b.against(kitchen, 'N', 'worktop', kitchen.w - 1.4);
    b.put('table', kitchen.x + kitchen.w / 2 + 0.5, kitchen.y + kitchen.h - 1.2, { w: 1.8, h: 0.9 });
    b.put('hanging_meat', kitchen.x + kitchen.w - 1, kitchen.y + kitchen.h - 1, { w: 0.9, h: 0.9 });
    b.put('barrel', kitchen.x + kitchen.w - 0.6, kitchen.y + 0.6);
  }
  // Stables, barracks and the smithy.
  for (const room of side) {
    const inward = room.x === X0 ? 'E' : 'W';
    const doorX = inward === 'E' ? room.x + room.w - 1 : room.x;
    if (room.kind === 'stable') {
      for (let y = room.y + 1; y < room.y + room.h - 1; y += 3) b.setEdge(doorX, y, inward, 'arch');
      for (let y = room.y + 3; y < room.y + room.h; y += 3) b.line(room.x, y, room.x + room.w - 1.5, y, 'low', 'wood');
      for (let y = room.y + 1.5; y < room.y + room.h; y += 3) {
        b.put('trough', room.x + 0.5, y, { rot: 90, w: 1.6, h: 0.7 });
        if (b.chance(0.7)) b.put('hay_bale', room.x + 1.8, y + 0.6);
      }
      b.put('saddle', room.x + room.w - 0.8, room.y + 0.7);
    } else if (room.kind === 'barracks') {
      b.setEdge(doorX, room.y + Math.floor(room.h / 2), inward, 'door');
      const n = Math.max(1, Math.floor((room.h - 0.5) / 1.4));
      for (let i = 0; i < n; i += 1) b.put('bunk_bed', room.x + room.w - 1, room.y + 0.8 + i * 1.4, { rot: 90 });
      b.put('weapon_rack', room.x + 0.4, room.y + room.h / 2, { rot: 270 });
      b.put('table', room.x + 1.8, room.y + room.h / 2, { w: 1, h: 1.2 });
    } else {
      b.setEdge(doorX, room.y + Math.floor(room.h / 2), inward, 'door');
      b.put('forge', room.x + room.w - 1.2, room.y + 1.2, { w: 1.8, h: 1.8 });
      b.put('anvil', room.x + room.w / 2 - 0.5, room.y + room.h / 2 + 0.4);
      b.put('barrel', room.x + 0.7, room.y + room.h - 0.7);
      b.put('weapon_pile', room.x + room.w - 1, room.y + room.h - 1);
    }
  }
  // The courtyard: a well, carts, practice, stores, standards.
  const ccx = (X0 + X1) / 2;
  const ccy = (hall.y + hall.h + Y1 - gd) / 2;
  if (b.free(ccx - 3, ccy, 2.4)) b.put('well', ccx - 3, ccy);
  const yard = [['dummy', ccx + 3, ccy - 1], ['target', ccx + 4.6, ccy + 1.2], ['cart', ccx - 5, ccy + 2.5], ['hay_bale', ccx - 6.4, ccy + 2.6], ['crate_stack', X1 - 2, Y1 - 2.2], ['barrel_stack', X0 + 2.2, Y1 - 1.6], ['standard', gx - 1.2, Y1 - gd - 0.8], ['standard', gx + 3.2, Y1 - gd - 0.8], ['handcart', ccx + 5.5, ccy + 3]];
  for (const [a, x, y] of yard) if (b.free(x, y, Math.max(ASSETS[a].w, ASSETS[a].h) * 0.8)) b.put(a, x, y, { tint, rot: a === 'cart' || a === 'handcart' ? b.int(-30, 30) : 0 });
  // Stairs up to the wall walk in each tower.
  for (const [cx, cy] of [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]]) {
    const dx = cx === X0 ? 0.6 : -0.6;
    const dy = cy === Y0 ? 0.6 : -0.6;
    if (tr >= 3) b.put('stairs_spiral', cx + dx * 1.2, cy + dy * 1.2, { w: 1.6, h: 1.6 });
  }
  woods(b, (x, y) => (x > X0 - tr - 0.5 && x < X1 + tr + 0.5 && y > Y0 - tr - 0.5 && y < Y1 + tr + 0.5 ? 0 : 0.35), { kinds: ['tree', 'pine', 'birch'], under: ['bush', 'tall_grass', 'rocks'] });
  return b.done();
}

// ---------- sewer ----------

function sewer(b) {
  const { cols, rows } = b;
  const wk = rows >= 22 ? 2 : 1; // walkway width
  const band = 2 + wk * 2;
  const cy = Math.floor(rows / 2) - Math.floor(band / 2);
  const tunnels = [];
  // The main channel across; one or two down, crossing it at junction chambers.
  tunnels.push({ x: 0, y: cy, w: cols, h: band, dir: 'h' });
  const downs = cols >= 30 ? [Math.round(cols * 0.28), Math.round(cols * 0.7)] : [Math.round(cols / 2)];
  for (const [i, x] of downs.entries()) {
    const full = i === 0 || b.chance(0.5);
    tunnels.push({ x: x - Math.floor(band / 2), y: full ? 0 : cy, w: band, h: full ? rows : rows - cy, dir: 'v' });
  }
  const wallStyle = b.pick(['brick', 'stone', 'stone']);
  const walk = b.pick(['f', 'e', 's']);
  b.style(1, wallStyle);
  for (const t of tunnels) b.fill(t.x, t.y, t.w, t.h, walk, 1);
  // The water down the middle of each.
  for (const t of tunnels) {
    if (t.dir === 'h') b.fill(t.x, t.y + wk, t.w, 2, 'W');
    else b.fill(t.x + wk, t.y, 2, t.h, 'W');
  }
  // Junctions: a wider chamber where the channels cross, a pool in the middle.
  const junctions = downs.map((x) => ({ x: x - Math.floor(band / 2) - 1, y: cy - 1, w: band + 2, h: band + 2 }));
  for (const j of junctions) {
    b.fill(j.x, j.y, j.w, j.h, walk, 1);
    b.fill(j.x + wk, j.y + wk, j.w - wk * 2, j.h - wk * 2, 'W');
    b.fill(j.x + wk + 1, j.y + wk + 1, Math.max(1, j.w - wk * 2 - 2), Math.max(1, j.h - wk * 2 - 2), 'D');
  }
  // Rooms off the walkways, each with a door: a thieves' den, a cult's shrine, a store, a way up, a lair.
  const rooms = [];
  const themes = ['den', 'cult', 'store', 'ladder', 'lair'];
  const solid = [...tunnels, ...junctions];
  let id = 2;
  for (let tries = 0; tries < 120 && rooms.length < 5; tries += 1) {
    const w = b.int(5, 7);
    const h = b.int(4, 5);
    const t = b.pick(tunnels);
    let room;
    if (t.dir === 'h') {
      const above = b.chance(0.5);
      room = { x: b.int(1, cols - w - 1), y: above ? t.y - h : t.y + t.h, w, h, door: above ? 'S' : 'N' };
    } else {
      const left = b.chance(0.5);
      room = { x: left ? t.x - w : t.x + t.w, y: b.int(Math.max(1, t.y), Math.max(1, t.y + t.h - h - 1)), w, h, door: left ? 'E' : 'W' };
    }
    if (room.x < 1 || room.y < 1 || room.x + w > cols - 1 || room.y + h > rows - 1) continue;
    if ([...solid, ...rooms].some((o) => overlaps(room, o, 0))) continue;
    // The door's square must open onto a walkway of that tunnel.
    const dx = room.door === 'S' || room.door === 'N' ? room.x + Math.floor(w / 2) : room.door === 'E' ? room.x + w : room.x - 1;
    const dy = room.door === 'E' || room.door === 'W' ? room.y + Math.floor(h / 2) : room.door === 'S' ? room.y + h : room.y - 1;
    if (b.get(dx, dy) !== walk) continue;
    room.id = id;
    rooms.push(room);
    b.style(id, wallStyle);
    b.fill(room.x, room.y, w, h, b.pick(['s', 'f', 'e']), id);
    id += 1;
  }
  b.autoWalls();
  // No wall across the tunnels where they run off the map.
  for (let c = 0; c < cols; c += 1) {
    b.setEdge(c, 0, 'N', null);
    b.setEdge(c, rows - 1, 'S', null);
  }
  for (let r = 0; r < rows; r += 1) {
    b.setEdge(0, r, 'W', null);
    b.setEdge(cols - 1, r, 'E', null);
  }
  rooms.forEach((room, i) => {
    const vertical = room.door === 'E' || room.door === 'W';
    const ex = vertical ? (room.door === 'E' ? room.x + room.w - 1 : room.x) : room.x + Math.floor(room.w / 2);
    const ey = vertical ? room.y + Math.floor(room.h / 2) : room.door === 'S' ? room.y + room.h - 1 : room.y;
    b.setEdge(ex, ey, room.door, i === 1 ? 'secret' : 'door');
    // Things go at the far side from the door.
    room.above = room.door === 'S';
    const [rx, ry] = centre(room);
    const theme = themes[i % themes.length];
    if (theme === 'den') {
      b.put('table', rx, ry, { w: 1.6, h: 1 });
      for (const s of [-1, 1]) b.put('stool', rx + s * 1.2, ry);
      for (let k = 0; k < 3; k += 1) if (b.free(room.x + 1 + k * 1.4, room.above ? room.y + 1.1 : room.y + room.h - 1.1, 1)) b.put('bedroll', room.x + 1 + k * 1.4, room.above ? room.y + 1.1 : room.y + room.h - 1.1, { rot: b.int(-15, 15) });
      b.put('chest', room.x + room.w - 0.9, room.above ? room.y + 0.6 : room.y + room.h - 0.6);
      b.put('candle', rx + 0.3, ry - 0.1);
    } else if (theme === 'cult') {
      b.put('pentagram', rx, ry, { w: Math.min(3, room.h - 1), h: Math.min(3, room.h - 1), tint: '#c0392b' });
      b.put('blood_altar', rx, room.above ? room.y + 0.6 : room.y + room.h - 0.6);
      for (const [dx2, dy2] of [[-1.8, -1.2], [1.8, -1.2], [-1.8, 1.2], [1.8, 1.2]]) if (b.free(rx + dx2, ry + dy2, 0.5)) b.put('skull_candles', rx + dx2, ry + dy2);
    } else if (theme === 'store') {
      for (let k = 0; k < 7; k += 1) {
        const a = b.pick(['crate', 'barrel', 'sacks', 'crate_stack', 'barrel_stack']);
        const px = room.x + 0.8 + b.rnd() * (room.w - 1.6);
        const py = room.y + 0.8 + b.rnd() * (room.h - 1.6);
        if (b.free(px, py, Math.max(ASSETS[a].w, ASSETS[a].h) * 0.85)) b.put(a, px, py, { rot: b.int(0, 3) * 90 });
      }
    } else if (theme === 'ladder') {
      b.put('ladder', rx, room.above ? room.y + 1 : room.y + room.h - 1);
      b.put('grate', rx, room.above ? room.y + 2.2 : room.y + room.h - 2.2);
      b.put('lantern', room.x + 0.7, ry);
    } else {
      b.put('egg_sacs', rx - 0.8, ry, { tint: '#b8c97a' });
      b.put('web', room.x + 1, room.above ? room.y + 1 : room.y + room.h - 1, { w: 1.6, h: 1.6 });
      b.put('bones', rx + 1, ry + 0.5);
      b.put('slime', rx + 0.6, ry - 0.8, { tint: '#7fbf3f' });
    }
  });
  // Bridges over the channels, pipes pouring in from the walls, grates letting in light, the muck.
  for (const t of tunnels) {
    const len = t.dir === 'h' ? t.w : t.h;
    for (let k = 4; k < len - 3; k += b.int(7, 10)) {
      const x = t.dir === 'h' ? t.x + k + 1 : t.x + t.w / 2;
      const y = t.dir === 'h' ? t.y + t.h / 2 : t.y + k + 1;
      if (junctions.some((j) => x > j.x - 1.5 && x < j.x + j.w + 1.5 && y > j.y - 1.5 && y < j.y + j.h + 1.5)) continue;
      b.put('bridge_stone', x, y, { w: 1.6, h: 2 + wk * 2, rot: t.dir === 'h' ? 0 : 90, underfoot: true });
    }
    for (let k = 2; k < len - 1; k += b.int(5, 8)) {
      for (const s of [0, 1]) {
        if (!b.chance(0.4)) continue;
        const x = t.dir === 'h' ? t.x + k + 0.5 : s ? t.x + t.w - 0.5 : t.x + 0.5;
        const y = t.dir === 'h' ? (s ? t.y + t.h - 0.5 : t.y + 0.5) : t.y + k + 0.5;
        if (!b.free(x, y, 0.9)) continue;
        const rot = t.dir === 'h' ? (s ? 180 : 0) : s ? 90 : 270;
        b.put(b.pick(['sewer_pipe', 'sewer_pipe', 'grate', 'slime', 'rubble', 'bones']), x, y, { rot, tint: '#8fae4f' });
      }
    }
  }
  for (const j of junctions) {
    b.put('grate', j.x + 0.6, j.y + 0.6);
    b.put('lantern', j.x + j.w - 0.6, j.y + 0.6);
    b.put('bridge_stone', j.x + j.w / 2, j.y + j.h / 2, { w: 1.6, h: j.h, rot: 0, underfoot: true });
  }
  return b.done({ void: '#1e1c1a', mood: b.pick(['gloom', 'gloom', 'night']) });
}

// ---------- dragon's lair ----------

function lair(b) {
  const { cols, rows } = b;
  let open = Array.from({ length: rows }, () => Array(cols).fill(false));
  const s = b.int(1, 999);
  const cx = cols / 2;
  const cy = rows * 0.44;
  const rx = cols * 0.38;
  const ry = rows * 0.34;
  // The great cavern, rough-edged; side caves; the way in from the bottom.
  for (let r = 1; r < rows - 1; r += 1) {
    for (let c = 1; c < cols - 1; c += 1) {
      const d = Math.hypot((c + 0.5 - cx) / rx, (r + 0.5 - cy) / ry);
      if (d < 0.95 + (noise(c * 0.18, r * 0.18, s) - 0.5) * 0.5) open[r][c] = true;
    }
  }
  const caves = [];
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + b.rnd() * 0.8 - Math.PI / 2;
    const px = clamp(cx + Math.cos(a) * rx * 1.05, 4, cols - 5);
    const py = clamp(cy + Math.sin(a) * ry * 1.1, 4, rows - 6);
    const rr = b.int(2, 3);
    caves.push([px, py]);
    for (let r = Math.floor(py - rr - 1); r <= py + rr + 1; r += 1) for (let c = Math.floor(px - rr - 1); c <= px + rr + 1; c += 1) if (c > 0 && r > 0 && c < cols - 1 && r < rows - 1 && Math.hypot(c + 0.5 - px, r + 0.5 - py) < rr + (noise(c * 0.4, r * 0.4, s + i) - 0.5)) open[r][c] = true;
  }
  const mouth = Math.round(cx + b.int(-4, 4));
  const way = wander(b, [mouth, rows], [cx, cy + ry * 0.6], 2, 5);
  for (let i = 1; i < way.length; i += 1) {
    const [x1, y1] = way[i - 1];
    const [x2, y2] = way[i];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      for (let r = Math.floor(y - 1.6); r <= y + 1.6; r += 1) for (let c = Math.floor(x - 1.6); c <= x + 1.6; c += 1) if (c > 0 && c < cols - 1 && r > 0 && r < rows && Math.hypot(c + 0.5 - x, r + 0.5 - y) < 1.7) open[Math.min(r, rows - 1)][c] = true;
    }
  }
  for (let c = mouth - 1; c <= mouth + 1; c += 1) if (c > 0 && c < cols - 1) open[rows - 1][c] = true;
  const rock = (g, c, r) => {
    let n = 0;
    for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) if ((dr || dc) && !g[r + dr]?.[c + dc]) n += 1;
    return n;
  };
  for (let step = 0; step < 2; step += 1) open = open.map((line, r) => line.map((v, c) => (r === rows - 1 ? v : rock(open, c, r) >= 6 ? false : rock(open, c, r) <= 2 ? true : v)));
  const cells = biggestRegion(open);
  const keep = new Set(cells.map(([c, r]) => `${c},${r}`));
  const isOpen = (c, r) => keep.has(`${c},${r}`);
  for (const [c, r] of cells) b.floor[r][c] = noise(c * 0.25, r * 0.25, s + 3) > 0.7 ? 'u' : 'r';
  // A river of lava across the cavern between the way in and the hoard, with a crossing of bare rock; ash beside it.
  const lavaY = (c) => cy + ry * 0.2 + (noise(c * 0.08, 0, s + 5) - 0.5) * ry * 0.6;
  const cross = Math.round(cx + b.int(-5, 5));
  for (const [c, r] of cells) {
    const d = Math.abs(r + 0.5 - lavaY(c + 0.5));
    if (Math.abs(c - cross) <= 1) continue;
    if (d < 1.1) b.floor[r][c] = 'L';
    else if (d < 2.4 && noise(c * 0.5, r * 0.5, s + 6) > 0.35) b.floor[r][c] = 'q';
  }
  caveWalls(b, isOpen, 'cave');
  b.extraWalls = b.extraWalls.filter((w) => !(w.y1 >= rows && w.y2 >= rows));
  // The hoard at the back, gold spilling round it; the bones of those who came for it; scorch marks.
  const hy = cy - ry * 0.45;
  const spots = cells.filter(([c, r]) => b.floor[r][c] !== 'L');
  const near = (x, y, rad) => spots.filter(([c, r]) => Math.hypot(c + 0.5 - x, r + 0.5 - y) < rad);
  b.put('hoard', cx, hy, { w: 3.6, h: 3.6 });
  const put = (list, a, n, extra = () => ({})) => {
    for (let i = 0, tries = 0; i < n && tries < n * 14 && list.length; tries += 1) {
      const [c, r] = b.pick(list);
      const x = c + 0.2 + b.rnd() * 0.6;
      const y = r + 0.2 + b.rnd() * 0.6;
      if (!b.free(x, y, Math.max(ASSETS[a].w, ASSETS[a].h) * 0.8, 0)) continue;
      b.put(a, x, y, { rot: b.int(0, 359), ...extra() });
      i += 1;
    }
  };
  const gold = near(cx, hy, 6);
  put(gold, 'coins', 10);
  put(gold, 'gems', 4);
  put(gold, 'gold_bars', 3);
  put(gold, 'crown', 1);
  put(gold, 'chest_open', 2);
  put(gold, 'weapon_pile', 2);
  put(gold, 'urn', 2);
  put(gold, 'amphorae', 1);
  put(gold, 'mimic', 1);
  put(gold, 'treasure', 2);
  const byWall = spots.filter(([c, r]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => !isOpen(c + dc, r + dr)));
  put(spots, 'skeleton', 3);
  put(spots, 'skull_pile', 2);
  put(spots, 'bones', 5);
  put(spots, 'scorch', 4);
  put(byWall, 'stalagmite', Math.round(cells.length / 50));
  put(spots, 'stalactites', 3);
  put(byWall, 'rock_pile', 2);
  put(spots, 'boulder', 2);
  put(cells.filter(([c, r]) => b.floor[r][c] === 'q'), 'cooling_lava', 3);
  if (b.chance(0.5)) put(near(caves[0][0], caves[0][1], 3), 'egg_nest', 1, () => ({ tint: b.pick(['#c0392b', '#2f6f4a', '#3a5fb0', '#d9a441']) }));
  put(byWall, 'crystal', b.int(1, 3), () => ({ tint: b.pick(['#ff7a3c', '#ffd27a', '#b06cff']) }));
  // Where adventurers camped on the way in.
  const [wx, wy] = way[1];
  if (b.free(wx + 1.5, wy, 1.4)) {
    b.put('cold_fire', wx + 1.5, wy);
    b.put('bedroll', wx + 2.6, wy + 0.8, { rot: 80 });
    b.put('rope_coil', wx + 0.6, wy + 1, { w: 0.7, h: 0.7 });
  }
  return b.done({ void: '#1c1816', mood: b.pick(['gloom', 'night', 'gloom']) });
}

export const MORE_MAKERS = { ship: shipAtSea, docks, temple, farm, mine, graveyard, tower, castle, sewer, lair };
