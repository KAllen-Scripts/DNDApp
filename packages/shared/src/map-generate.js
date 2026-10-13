/**
 * Starting points for the map creator (SPEC §6.6 "Making a map"): a
 * dungeon, a cave, a forest glade, a village, a tavern, a camp, a crypt or a
 * river crossing, made from a seed, for the DM to change as they like. The
 * server makes them (POST .../maps/design/generate); the same seed and size
 * always make the same map. Plain JS, built from the creator's own pieces
 * (map-design.js), so what comes out is an ordinary design.
 */
import { ASSETS, EMPTY, normalizeDesign, newDesignId, pathAt, seeded } from './map-design.js';
import { noise } from './map-paint.js';

/** What can be made, with its default size in squares. */
export const GENERATORS = {
  dungeon: { name: 'Dungeon', about: 'Rooms joined by corridors, with doors, torches and things in the rooms', cols: 40, rows: 30 },
  cave: { name: 'Cave', about: 'Winding caverns with pools, rocks and mushrooms', cols: 36, rows: 28 },
  forest: { name: 'Forest glade', about: 'A clearing in the woods with a path through it', cols: 32, rows: 24 },
  village: { name: 'Village', about: 'Houses along a road, a square with a well, gardens', cols: 40, rows: 30 },
  tavern: { name: 'Tavern', about: 'An inn: the common room and bar, a kitchen, a store room and a bedroom', cols: 28, rows: 22 },
  camp: { name: 'Camp', about: 'Tents round a campfire, wagons, a palisade', cols: 30, rows: 24 },
  crypt: { name: 'Crypt', about: 'A pillared hall with burial chambers either side and an altar', cols: 30, rows: 30 },
  crossing: { name: 'River crossing', about: 'A road over a river by a bridge, trees on the banks', cols: 32, rows: 24 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = (v) => Math.round(v * 100) / 100;
/** The way an asset whose back is drawn at its top faces, against each wall of a room. */
const ROT = { N: 0, E: 90, S: 180, W: 270 };
const OPENINGS = new Set(['door', 'secret', 'arch', 'window']);

/**
 * A design being made: a floor of characters, an area id per square (walls go
 * between different areas: null is nothing, 0 open ground, more than 0 a room
 * or building), wall edges, assets, paths and labels.
 */
function builder(cols, rows, seed, salt) {
  const rnd = seeded(seed, salt, cols, rows);
  const floor = Array.from({ length: rows }, () => Array(cols).fill(EMPTY));
  const area = Array.from({ length: rows }, () => Array(cols).fill(null));
  const styles = new Map(); // area id -> wall style
  const H = new Map(); // `${c},${r}`: the edge from (c, r) to (c + 1, r) -> { type, style }
  const V = new Map(); // `${c},${r}`: the edge from (c, r) to (c, r + 1)
  const assets = [];
  const paths = [];
  const labels = [];
  const inside = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;
  /** The edge on a side of a square: [map, key]. */
  const edgeOf = (c, r, side) => (side === 'N' ? [H, `${c},${r}`] : side === 'S' ? [H, `${c},${r + 1}`] : side === 'W' ? [V, `${c},${r}`] : [V, `${c + 1},${r}`]);
  const b = {
    cols,
    rows,
    rnd,
    floor,
    area,
    assets,
    paths,
    labels,
    inside,
    int: (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(rnd() * list.length)],
    chance: (p) => rnd() < p,
    get: (c, r) => (inside(c, r) ? floor[r][c] : undefined),
    set(c, r, ch) {
      if (inside(c, r)) floor[r][c] = ch;
    },
    fill(x, y, w, h, ch, id = undefined) {
      for (let r = y; r < y + h; r += 1) {
        for (let c = x; c < x + w; c += 1) {
          if (!inside(c, r)) continue;
          floor[r][c] = ch;
          if (id !== undefined) area[r][c] = id;
        }
      }
    },
    /** An uneven round patch of floor (a pond, a dirt yard). `keep(c, r)`: only where it says. */
    blob(cx, cy, rx, ry, ch, { rough = 0.35, keep = () => true, s = 1 } = {}) {
      const out = [];
      for (let r = Math.floor(cy - ry - 2); r <= cy + ry + 2; r += 1) {
        for (let c = Math.floor(cx - rx - 2); c <= cx + rx + 2; c += 1) {
          if (!inside(c, r) || !keep(c, r)) continue;
          const d = Math.hypot((c + 0.5 - cx) / rx, (r + 0.5 - cy) / ry);
          if (d < 1 + (noise(c * 0.45, r * 0.45, s) - 0.5) * 2 * rough) {
            floor[r][c] = ch;
            out.push([c, r]);
          }
        }
      }
      return out;
    },
    style: (id, style) => styles.set(id, style),
    edge(c, r, side) {
      const [m, k] = edgeOf(c, r, side);
      return m.get(k) ?? null;
    },
    setEdge(c, r, side, type, style = null) {
      const [m, k] = edgeOf(c, r, side);
      if (!type) return m.delete(k);
      m.set(k, { type, style: style ?? m.get(k)?.style ?? 'stone' });
    },
    /** Walls between squares of different areas (rooms and buildings, not open ground and nothing). */
    autoWalls() {
      const between = (a, z) => a !== z && ((a ?? 0) > 0 || (z ?? 0) > 0);
      const styleOf = (a, z) => styles.get(a > 0 ? a : z) ?? styles.get(z) ?? 'stone';
      for (let r = 0; r <= rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const a = r > 0 ? area[r - 1][c] : null;
          const z = r < rows ? area[r][c] : null;
          if (between(a, z)) H.set(`${c},${r}`, { type: 'wall', style: styleOf(a, z) });
        }
      }
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c <= cols; c += 1) {
          const a = c > 0 ? area[r][c - 1] : null;
          const z = c < cols ? area[r][c] : null;
          if (between(a, z)) V.set(`${c},${r}`, { type: 'wall', style: styleOf(a, z) });
        }
      }
    },
    /** A straight wall along grid lines, square by square (so doors can go in it later). */
    line(x1, y1, x2, y2, type = 'wall', style = 'stone') {
      if (y1 === y2) for (let c = Math.min(x1, x2); c < Math.max(x1, x2); c += 1) H.set(`${c},${y1}`, { type, style });
      else for (let r = Math.min(y1, y2); r < Math.max(y1, y2); r += 1) V.set(`${x1},${r}`, { type, style });
    },
    /** Walls drawn freely (curves, diagonals), added as they are. */
    extraWalls: [],
    /** Put an asset down (its middle at x, y). */
    put(a, x, y, extra = {}) {
      const def = ASSETS[a];
      if (!def) return null;
      const asset = { id: newDesignId(), a, x: r2(x), y: r2(y), w: def.w, h: def.h, rot: 0, ...extra };
      assets.push(asset);
      return asset;
    },
    /** Is there room for something `size` across at x, y (no asset within that, nothing past the edge)? */
    free(x, y, size = 1, gap = 0.1) {
      if (x < size / 2 || y < size / 2 || x > cols - size / 2 || y > rows - size / 2) return false;
      return !assets.some((o) => Math.hypot(o.x - x, o.y - y) < (Math.max(o.w, o.h) + size) / 2 * 0.8 + gap);
    },
    /** Put something against the inside of a room's wall: `side` N, E, S or W, `at` how far along (squares from the room's corner, its middle). */
    against(room, side, a, at, extra = {}) {
      const def = ASSETS[a];
      const depth = (extra.h ?? def.h) / 2 + 0.06;
      const pos = side === 'N' ? [room.x + at, room.y + depth] : side === 'S' ? [room.x + at, room.y + room.h - depth] : side === 'W' ? [room.x + depth, room.y + at] : [room.x + room.w - depth, room.y + at];
      return b.put(a, pos[0], pos[1], { rot: ROT[side], ...extra });
    },
    done(look = {}) {
      const walls = [...mergeEdges(H, 'h'), ...mergeEdges(V, 'v'), ...b.extraWalls];
      return normalizeDesign({ cols, rows, floor: floor.map((l) => l.join('')), walls, assets, paths, labels, look });
    },
  };
  return b;
}

/** Edges joined into long walls where they're the same kind and look in a line; doors and secret doors stay a square each. */
function mergeEdges(map, dir) {
  const keys = [...map.keys()].map((k) => k.split(',').map(Number)).sort((p, q) => (dir === 'h' ? p[1] - q[1] || p[0] - q[0] : p[0] - q[0] || p[1] - q[1]));
  const out = [];
  let run = null;
  const flush = () => {
    if (run) out.push(run);
    run = null;
  };
  for (const [c, r] of keys) {
    const e = map.get(`${c},${r}`);
    const [x1, y1, x2, y2] = dir === 'h' ? [c, r, c + 1, r] : [c, r, c, r + 1];
    const joins = run && run.type === e.type && run.style === e.style && run.x2 === x1 && run.y2 === y1 && (e.type === 'wall' || e.type === 'low' || e.type === 'arch');
    if (joins) {
      run.x2 = x2;
      run.y2 = y2;
    } else {
      flush();
      run = { x1, y1, x2, y2, type: e.type, style: e.style };
      if (e.type === 'door' || e.type === 'secret' || e.type === 'window') flush();
    }
  }
  flush();
  return out;
}

/** Rooms: rectangles in squares { x, y, w, h, id }. */
const overlaps = (a, o, gap) => a.x < o.x + o.w + gap && a.x + a.w + gap > o.x && a.y < o.y + o.h + gap && a.y + a.h + gap > o.y;
const centre = (room) => [room.x + room.w / 2, room.y + room.h / 2];

/** Torches on a room's walls (not where a door is), facing in. */
function torches(b, room, n) {
  const spots = [];
  for (const side of ['N', 'S', 'W', 'E']) {
    const len = side === 'N' || side === 'S' ? room.w : room.h;
    for (let i = 1; i < len - 1; i += 1) spots.push([side, i + 0.5]);
  }
  for (let k = 0; k < n && spots.length; k += 1) {
    const [side, at] = spots.splice(Math.floor(b.rnd() * spots.length), 1)[0];
    const [c, r] = side === 'N' ? [room.x + Math.floor(at), room.y] : side === 'S' ? [room.x + Math.floor(at), room.y + room.h - 1] : side === 'W' ? [room.x, room.y + Math.floor(at)] : [room.x + room.w - 1, room.y + Math.floor(at)];
    if (b.edge(c, r, side)?.type !== 'wall') continue;
    b.against(room, side, 'torch', at);
  }
}

/** Things in a dungeon or crypt room, by what the room is for. */
function dress(b, room, theme) {
  const { x, y, w, h } = room;
  const [cx, cy] = centre(room);
  const scatter = (a, n, gap = 0.3) => {
    for (let i = 0, tries = 0; i < n && tries < n * 12; tries += 1) {
      const px = x + 0.6 + b.rnd() * (w - 1.2);
      const py = y + 0.6 + b.rnd() * (h - 1.2);
      if (!b.free(px, py, Math.max(ASSETS[a].w, ASSETS[a].h), gap)) continue;
      b.put(a, px, py, { rot: b.int(0, 7) * 45 });
      i += 1;
    }
  };
  const alongWalls = (list, n) => {
    for (let i = 0; i < n; i += 1) {
      const a = b.pick(list);
      const side = b.pick(['N', 'S', 'W', 'E']);
      const len = side === 'N' || side === 'S' ? w : h;
      const size = ASSETS[a].w;
      if (len < size + 1) continue;
      const at = size / 2 + 0.5 + b.rnd() * (len - size - 1);
      const pos = side === 'N' ? [x + at, y + 0.5] : side === 'S' ? [x + at, y + h - 0.5] : side === 'W' ? [x + 0.5, y + at] : [x + w - 0.5, y + at];
      if (!b.free(pos[0], pos[1], size * 0.8)) continue;
      b.against(room, side, a, at);
    }
  };
  if (theme === 'storage') {
    alongWalls(['crate', 'barrel', 'sacks', 'shelves', 'keg'], Math.round((w + h) * 0.8));
    scatter('sack', 2);
  } else if (theme === 'shrine') {
    b.against(room, 'N', 'altar', w / 2);
    b.put('rug', cx, cy + 0.3, { w: Math.min(2, w - 2), h: Math.max(1, h - 3), rot: 90, tint: '#5a2a5a' });
    for (const s of [-1, 1]) if (w >= 5) b.put('candelabra', cx + s * 1.6, y + 0.9);
    if (w >= 6 && h >= 6) for (const s of [-1, 1]) for (const k of [0.35, 0.7]) b.put('pillar', x + (s < 0 ? 1.5 : w - 1.5), y + h * k);
  } else if (theme === 'barracks') {
    const beds = Math.max(2, Math.floor((w - 1) / 1.6));
    for (let i = 0; i < beds; i += 1) b.against(room, 'N', b.chance(0.5) ? 'bed' : 'bedroll', 1 + i * ((w - 1) / beds));
    b.against(room, 'S', 'weapon_rack', w / 2);
    if (h >= 5) b.put('table', cx, cy + 0.5), b.put('stool', cx - 1.3, cy + 0.5), b.put('stool', cx + 1.3, cy + 0.5);
    scatter('chest', 1);
  } else if (theme === 'treasure') {
    b.put('treasure', cx, cy);
    for (const s of [-1, 1]) b.against(room, 'N', 'chest', w / 2 + s * Math.min(2, w / 3));
    scatter('coins', 3, 0.05);
    if (b.chance(0.5)) scatter('pressure_plate', 1);
  } else if (theme === 'prison') {
    for (let i = 0; i + 2 <= w - 1; i += 2.5) b.put('cage', x + 1.2 + i, y + 1.2);
    scatter('shackles', 2);
    scatter('bones', 2);
    scatter('chains', 1);
  } else if (theme === 'hall') {
    for (let px = x + 1.5; px <= x + w - 1.5; px += 2.5) for (const py of [y + 1.5, y + h - 1.5]) b.put('pillar', px, py);
    if (b.chance(0.5)) b.put('brazier', cx, cy);
  } else if (theme === 'library') {
    for (let i = 1.2; i + 1 <= w - 0.2; i += 2.1) b.against(room, 'N', 'bookshelf', i);
    if (h >= 5) for (let i = 1.2; i + 1 <= w - 0.2; i += 2.1) b.against(room, 'S', 'bookshelf', i);
    b.put('desk', cx, cy, { rot: 0 });
    b.put('chair', cx, cy + 0.8, { rot: 180 });
    b.put('candle', cx + 0.5, cy - 0.1);
    if (w >= 6) b.put('lectern', x + w - 1.2, cy, { rot: 270 });
  } else if (theme === 'tomb') {
    if (w >= h) b.put('sarcophagus', cx, cy, { rot: 90 });
    else b.put('sarcophagus', cx, cy);
    for (const s of [-1, 1]) b.put('candle', cx + s * 1.4, cy - 1.1);
    scatter('bones', 1);
  } else if (theme === 'well') {
    b.put('well', cx, cy);
    scatter('puddle', 2);
  } else if (theme === 'trap') {
    b.put(b.pick(['spike_pit', 'pit']), cx, cy);
    alongWalls(['lever'], 1);
    scatter('bones', 1);
  } else if (theme === 'lair') {
    scatter('bones', 4);
    scatter('blood', 2);
    scatter('rubble', 1);
    scatter('skull', 2);
  }
  // A bit of mess anywhere.
  if (b.chance(0.35)) scatter('crack', 1);
  if (b.chance(0.3)) scatter('rubble', 1);
  if (b.chance(0.4)) b.put('web', b.chance(0.5) ? x + 0.8 : x + w - 0.8, b.chance(0.5) ? y + 0.8 : y + h - 0.8, { w: 1.5, h: 1.5, rot: b.int(0, 3) * 90 });
}

// ---------- dungeon ----------

function dungeon(b) {
  const { cols, rows } = b;
  const rooms = [];
  const want = clamp(Math.round((cols * rows) / 120), 3, 14);
  for (let tries = 0; tries < 600 && rooms.length < want; tries += 1) {
    const w = b.int(4, clamp(Math.round(cols / 4), 5, 10));
    const h = b.int(4, clamp(Math.round(rows / 4), 5, 9));
    const room = { x: b.int(1, Math.max(1, cols - w - 1)), y: b.int(1, Math.max(1, rows - h - 1)), w, h, id: rooms.length + 1 };
    if (room.x + w > cols - 1 || room.y + h > rows - 1 || rooms.some((o) => overlaps(room, o, 2))) continue;
    rooms.push(room);
  }
  const floorCh = b.pick(['f', 'f', 's', 'e']);
  const corridorCh = b.pick(['f', 'v', floorCh]);
  const CORRIDOR = 100;
  b.style(CORRIDOR, 'stone');
  for (const room of rooms) {
    b.style(room.id, b.chance(0.2) ? 'brick' : 'stone');
    b.fill(room.x, room.y, room.w, room.h, b.chance(0.2) ? b.pick(['s', 'e', 'k', 'c']) : floorCh, room.id);
  }
  // Join the rooms: each to the nearest one already joined (a tree), and a couple more for loops.
  const joined = [rooms[0]];
  const links = [];
  const rest = rooms.slice(1);
  const dist = (p, q) => Math.hypot(centre(p)[0] - centre(q)[0], centre(p)[1] - centre(q)[1]);
  while (rest.length) {
    let best = null;
    for (const p of rest) for (const q of joined) if (!best || dist(p, q) < best[2]) best = [p, q, dist(p, q)];
    links.push([best[0], best[1]]);
    joined.push(best[0]);
    rest.splice(rest.indexOf(best[0]), 1);
  }
  for (let i = 0; i < Math.min(2, rooms.length - 2); i += 1) {
    const p = b.pick(rooms);
    const q = rooms.filter((o) => o !== p).sort((m, n) => dist(p, m) - dist(p, n))[1];
    if (q && !links.some(([m, n]) => (m === p && n === q) || (m === q && n === p))) links.push([p, q]);
  }
  const doorways = new Map(); // `${c},${r},${side}` of squares a corridor steps out of a room through
  for (const [p, q] of links) {
    const [ax, ay] = centre(p).map(Math.floor);
    const [bx, by] = centre(q).map(Math.floor);
    const pts = [];
    const horizontalFirst = b.chance(0.5);
    let c = ax;
    let r = ay;
    pts.push([c, r]);
    const stepTo = (tx, ty) => {
      while (c !== tx || r !== ty) {
        if (c !== tx) c += Math.sign(tx - c);
        else r += Math.sign(ty - r);
        pts.push([c, r]);
      }
    };
    if (horizontalFirst) stepTo(bx, ay), stepTo(bx, by);
    else stepTo(ax, by), stepTo(bx, by);
    for (let i = 0; i < pts.length; i += 1) {
      const [pc, pr] = pts[i];
      if (b.area[pr][pc] === null) {
        b.area[pr][pc] = CORRIDOR;
        b.floor[pr][pc] = corridorCh;
      }
      if (i === 0) continue;
      const [oc, or] = pts[i - 1];
      const from = b.area[or][oc];
      const to = b.area[pr][pc];
      if (from !== to && (from === CORRIDOR || to === CORRIDOR)) {
        const side = pc > oc ? 'E' : pc < oc ? 'W' : pr > or ? 'S' : 'N';
        doorways.set(`${oc},${or},${side}`, true);
      }
    }
  }
  b.autoWalls();
  for (const k of doorways.keys()) {
    const [c, r, side] = k.split(',');
    const roll = b.rnd();
    b.setEdge(Number(c), Number(r), side, roll < 0.62 ? 'door' : roll < 0.8 ? 'arch' : roll < 0.88 ? 'secret' : null);
  }
  // What each room is for: the first has the way in, the last the way down.
  // Each kind of room once before any comes again.
  let deck = [];
  const nextTheme = () => {
    if (!deck.length) {
      deck = ['storage', 'shrine', 'barracks', 'treasure', 'prison', 'hall', 'library', 'tomb', 'well', 'trap', 'lair', 'empty'];
      for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(b.rnd() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
    }
    return deck.pop();
  };
  rooms.forEach((room, i) => {
    if (i === 0) b.against(room, 'N', 'stairs', room.w / 2);
    else if (i === rooms.length - 1) b.against(room, 'S', 'stairs_down', room.w / 2, { rot: 0 });
    const theme = i === 0 ? b.pick(['empty', 'storage', 'hall']) : nextTheme();
    dress(b, room, theme);
    torches(b, room, b.int(1, 3));
  });
  // Rubble here and there in the corridors.
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) if (b.area[r][c] === CORRIDOR && b.chance(0.04)) b.floor[r][c] = 'u';
  return b.done();
}

// ---------- crypt ----------

function crypt(b) {
  const { cols, rows } = b;
  const hw = clamp(Math.round(cols / 6), 4, 7);
  const hx = Math.floor((cols - hw) / 2);
  const top = { x: Math.max(1, hx - 3), y: 1, w: Math.min(cols - 2, hw + 6), h: clamp(Math.round(rows / 6), 4, 6), id: 1 };
  const ante = { x: Math.max(1, hx - 2), y: rows - 1 - clamp(Math.round(rows / 7), 4, 5), w: Math.min(cols - 2, hw + 4), h: clamp(Math.round(rows / 7), 4, 5), id: 2 };
  const hall = { x: hx, y: top.y + top.h, w: hw, h: ante.y - top.y - top.h, id: 3 };
  b.style(1, 'stone');
  b.style(2, 'ruin');
  b.style(3, 'stone');
  b.fill(top.x, top.y, top.w, top.h, 'e', 1);
  b.fill(ante.x, ante.y, ante.w, ante.h, 'f', 2);
  b.fill(hall.x, hall.y, hall.w, hall.h, 'e', 3);
  // Burial chambers down each side of the hall, the same on both sides.
  const chambers = [];
  const cw = clamp(Math.floor((cols - hw) / 2) - 2, 3, 7);
  let y = hall.y;
  let id = 10;
  while (y + 4 <= hall.y + hall.h) {
    const ch = Math.min(b.int(4, 5), hall.y + hall.h - y);
    if (ch < 4) break;
    for (const s of [-1, 1]) {
      const room = { x: s < 0 ? hall.x - cw : hall.x + hall.w, y, w: cw, h: ch, id, side: s };
      if (room.x < 1 || room.x + room.w > cols - 1) continue;
      b.style(id, b.chance(0.3) ? 'ruin' : 'stone');
      b.fill(room.x, room.y, room.w, room.h, b.pick(['f', 'f', 'e', 's']), id);
      chambers.push(room);
      id += 1;
    }
    y += ch + 1;
  }
  b.autoWalls();
  const mid = (room) => Math.floor(room.y + room.h / 2);
  for (const room of chambers) {
    const type = b.pick(['door', 'door', 'arch', 'arch', 'secret']);
    if (room.side < 0) b.setEdge(room.x + room.w - 1, mid(room), 'E', type);
    else b.setEdge(room.x, mid(room), 'W', type);
  }
  const hallMid = hall.x + Math.floor(hall.w / 2);
  b.setEdge(hallMid, hall.y, 'N', 'arch');
  if (hall.w % 2 === 0) b.setEdge(hallMid - 1, hall.y, 'N', 'arch');
  b.setEdge(hallMid, ante.y, 'N', 'door');
  if (hall.w % 2 === 0) b.setEdge(hallMid - 1, ante.y, 'N', 'door');
  b.against(ante, 'S', 'stairs', ante.w / 2, { rot: 180 });
  // The hall: pillars down both sides, candles, bones.
  for (let py = hall.y + 1.5; py < hall.y + hall.h - 1; py += 2.5) for (const px of [hall.x + 1, hall.x + hall.w - 1]) b.put('pillar', px, py, { w: 0.9, h: 0.9 });
  b.put('rug', hall.x + hall.w / 2, hall.y + hall.h / 2, { w: Math.max(1, hall.w - 2.6), h: Math.max(2, hall.h - 2), tint: '#4a1f2a' });
  // The altar at the top, with braziers.
  b.against(top, 'N', 'altar', top.w / 2);
  b.put('idol', top.x + top.w / 2, top.y + 0.55, { w: 0.8, h: 0.8 });
  for (const s of [-1, 1]) b.put('brazier', top.x + top.w / 2 + s * (top.w / 2 - 1.2), top.y + 1.2);
  if (b.chance(0.5)) b.put('magic_circle', top.x + top.w / 2, top.y + top.h - 1.6, { w: 2.4, h: 2.4 });
  for (const room of chambers) {
    dress(b, room, b.pick(['tomb', 'tomb', 'tomb', 'lair', 'treasure', 'empty']));
    if (b.chance(0.5)) {
      const n = Math.floor((room.h - 1) / 2.2);
      for (let i = 0; i < n; i += 1) b.against(room, room.side < 0 ? 'W' : 'E', 'coffin', 1.2 + i * 2.2);
    }
  }
  torches(b, hall, 4);
  torches(b, ante, 2);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) if (b.area[r][c] && b.chance(0.03)) b.floor[r][c] = 'u';
  return b.done();
}

// ---------- cave ----------

function cave(b) {
  const { cols, rows } = b;
  const edge = (c, r) => r <= 1 || c <= 1 || r >= rows - 2 || c >= cols - 2;
  let open = Array.from({ length: rows }, () => Array(cols).fill(false));
  // Tunnels: a few wanderers from the middle carve their way until a good part of the map is open, sometimes
  // opening out into a chamber.
  let carved = 0;
  const target = Math.round(cols * rows * 0.36);
  const carve = (c, r, rad) => {
    const n = Math.ceil(rad);
    for (let dr = -n; dr <= n; dr += 1) {
      for (let dc = -n; dc <= n; dc += 1) {
        if (Math.hypot(dc, dr) > rad + 0.3 || edge(c + dc, r + dr) || open[r + dr][c + dc]) continue;
        open[r + dr][c + dc] = true;
        carved += 1;
      }
    }
  };
  const walkers = [];
  for (let i = 0; i < 6; i += 1) walkers.push({ c: Math.floor(cols / 2), r: Math.floor(rows / 2), d: (i * 3) % 8 });
  const STEP = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  for (let n = 0; carved < target && n < cols * rows * 20; n += 1) {
    const w = walkers[n % walkers.length];
    if (b.chance(0.38)) w.d = (w.d + (b.chance(0.5) ? 1 : 7)) % 8;
    const [dc, dr] = STEP[w.d];
    w.c = clamp(w.c + dc, 3, cols - 4);
    w.r = clamp(w.r + dr, 3, rows - 4);
    carve(w.c, w.r, b.chance(0.04) ? b.int(2, 3) : b.chance(0.5) ? 1 : 0.8);
  }
  /** Rock all round a square (past the edge is rock). */
  const rock = (g, c, r) => {
    let n = 0;
    for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) if ((dr || dc) && !g[r + dr]?.[c + dc]) n += 1;
    return n;
  };
  // Smoothed: rock where most neighbours are rock, open where most are open.
  for (let step = 0; step < 3; step += 1) {
    open = open.map((line, r) => line.map((v, c) => !edge(c, r) && (rock(open, c, r) >= 5 ? false : rock(open, c, r) <= 3 ? true : v)));
  }
  // Keep the biggest cavern.
  const seen = Array.from({ length: rows }, () => Array(cols).fill(-1));
  let biggest = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!open[r][c] || seen[r][c] >= 0) continue;
      const cells = [];
      const stack = [[c, r]];
      seen[r][c] = 1;
      while (stack.length) {
        const [x, y] = stack.pop();
        cells.push([x, y]);
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (open[ny]?.[nx] && seen[ny][nx] < 0) {
            seen[ny][nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (cells.length > biggest.length) biggest = cells;
    }
  }
  const keep = new Set(biggest.map(([c, r]) => `${c},${r}`));
  const isOpen = (c, r) => keep.has(`${c},${r}`);
  for (const [c, r] of biggest) b.floor[r][c] = 'r';
  // Gravel, moss and mud in patches; pools of water where the ground is lowest.
  const s = b.int(1, 999);
  for (const [c, r] of biggest) {
    const n = noise(c * 0.22, r * 0.22, s);
    const m = noise(c * 0.3, r * 0.3, s + 7);
    if (n < 0.16) b.floor[r][c] = n < 0.09 ? 'D' : 'W';
    else if (n < 0.19) b.floor[r][c] = 'm';
    else if (m > 0.86) b.floor[r][c] = 'v';
    else if (m < 0.16) b.floor[r][c] = 'u';
  }
  // Walls round the cavern, cutting the corners (marching squares: ends on half squares).
  const segs = [];
  const at = (c, r) => (isOpen(c, r) ? 1 : 0);
  for (let r = -1; r < rows; r += 1) {
    for (let c = -1; c < cols; c += 1) {
      const k = at(c, r) * 8 + at(c + 1, r) * 4 + at(c + 1, r + 1) * 2 + at(c, r + 1);
      const T = [c + 1, r + 0.5];
      const R = [c + 1.5, r + 1];
      const B = [c + 1, r + 1.5];
      const L = [c + 0.5, r + 1];
      const add = (p, q) => segs.push([p, q]);
      switch (k) {
        case 1: case 14: add(L, B); break;
        case 2: case 13: add(B, R); break;
        case 3: case 12: add(L, R); break;
        case 4: case 11: add(T, R); break;
        case 6: case 9: add(T, B); break;
        case 7: case 8: add(L, T); break;
        case 5: add(L, T), add(B, R); break;
        case 10: add(T, R), add(L, B); break;
        default: break;
      }
    }
  }
  // Join the pieces end to end, then merge pieces in a line.
  const key = (p) => `${p[0]},${p[1]}`;
  const ends = new Map();
  segs.forEach((sg, i) => {
    for (const p of sg) {
      if (!ends.has(key(p))) ends.set(key(p), []);
      ends.get(key(p)).push(i);
    }
  });
  const used = new Set();
  for (let i = 0; i < segs.length; i += 1) {
    if (used.has(i)) continue;
    used.add(i);
    const chain = [segs[i][0], segs[i][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? chain.at(-1) : chain[0];
        const next = (ends.get(key(tip)) ?? []).find((j) => !used.has(j));
        if (next === undefined) break;
        used.add(next);
        const [p, q] = segs[next];
        const other = key(p) === key(tip) ? q : p;
        if (dir) chain.push(other);
        else chain.unshift(other);
      }
    }
    // Merge points in a line.
    const pts = [chain[0]];
    for (let j = 1; j < chain.length - 1; j += 1) {
      const a = pts.at(-1);
      const m = chain[j];
      const z = chain[j + 1];
      if (Math.abs((m[0] - a[0]) * (z[1] - a[1]) - (m[1] - a[1]) * (z[0] - a[0])) > 1e-9) pts.push(m);
    }
    pts.push(chain.at(-1));
    for (let j = 1; j < pts.length; j += 1) b.extraWalls.push({ x1: pts[j - 1][0], y1: pts[j - 1][1], x2: pts[j][0], y2: pts[j][1], type: 'wall', style: 'cave' });
  }
  // Rocks by the walls, mushrooms in the damp, a crystal or two, and someone's old camp.
  const byWall = biggest.filter(([c, r]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => !isOpen(c + dc, r + dr)) && b.floor[r][c] !== 'W' && b.floor[r][c] !== 'D');
  const dry = biggest.filter(([c, r]) => !['W', 'D', 'm'].includes(b.floor[r][c]));
  const spot = (list, a, n, extra = () => ({})) => {
    for (let i = 0, tries = 0; i < n && tries < n * 10 && list.length; tries += 1) {
      const [c, r] = b.pick(list);
      const x = c + 0.3 + b.rnd() * 0.4;
      const y = r + 0.3 + b.rnd() * 0.4;
      if (!b.free(x, y, Math.max(ASSETS[a].w, ASSETS[a].h))) continue;
      b.put(a, x, y, { rot: b.int(0, 359), ...extra() });
      i += 1;
    }
  };
  const area = biggest.length;
  spot(byWall, 'stalagmite', Math.round(area / 40));
  spot(byWall, 'rock', Math.round(area / 45));
  spot(byWall, 'rocks', Math.round(area / 50));
  spot(dry, 'boulder', Math.round(area / 160));
  spot(dry, 'mushrooms', Math.round(area / 70), () => ({ tint: b.pick(['#c0392b', '#d9a441', '#8e7cc3', '#5fa8a0']) }));
  if (b.chance(0.5)) spot(dry, 'giant_mushroom', b.int(1, 3), () => ({ tint: b.pick(['#8e44ad', '#a0522d', '#c0392b']) }));
  if (b.chance(0.5)) spot(byWall, 'crystal', b.int(1, 3), () => ({ tint: b.pick(['#59c3ff', '#b06cff', '#5cf2a5']) }));
  spot(dry, 'bones', b.int(1, 3));
  spot(dry, 'rubble', b.int(1, 2));
  if (b.chance(0.4) && dry.length) {
    const [c, r] = b.pick(dry);
    if (b.free(c + 0.5, r + 0.5, 3)) {
      b.put('campfire', c + 0.5, r + 0.5);
      for (const a of [0, 2.2, 4.2]) if (b.free(c + 0.5 + Math.cos(a) * 1.4, r + 0.5 + Math.sin(a) * 1.4, 1)) b.put('bedroll', c + 0.5 + Math.cos(a) * 1.4, r + 0.5 + Math.sin(a) * 1.4, { rot: Math.round((a * 180) / Math.PI) + 90 });
    }
  }
  return b.done({ void: '#24201d' });
}

// ---------- outdoors ----------

/** A smooth path across the map: from one side to the other, wandering. */
function wander(b, from, to, wobble, n = 6) {
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = from[0] + (to[0] - from[0]) * t;
    const y = from[1] + (to[1] - from[1]) * t;
    const nx = -(to[1] - from[1]);
    const ny = to[0] - from[0];
    const len = Math.hypot(nx, ny) || 1;
    const k = i === 0 || i === n ? 0 : (b.rnd() - 0.5) * 2 * wobble;
    pts.push([r2(clamp(x + (nx / len) * k, 0, b.cols)), r2(clamp(y + (ny / len) * k, 0, b.rows))]);
  }
  return pts;
}

/** Ground in patches over grass: forest floor, moss, dry grass, dirt. */
function ground(b, base, patches) {
  const s = b.int(1, 999);
  for (let r = 0; r < b.rows; r += 1) {
    for (let c = 0; c < b.cols; c += 1) {
      b.floor[r][c] = base;
      for (const [ch, scale, lo, hi] of patches) {
        const n = noise(c * scale, r * scale, s + ch.charCodeAt(0));
        if (n > lo && n < hi) b.floor[r][c] = ch;
      }
    }
  }
}

/** Trees, bushes and the rest where `density(x, y)` (0..1) says, off paths and away from what's there. */
function woods(b, density, { kinds = ['tree', 'tree', 'pine', 'birch'], under = ['bush', 'ferns', 'tall_grass', 'bush', 'flowers'], spacing = 1.7, clear = () => false } = {}) {
  const d = { paths: b.paths };
  for (let y = 0.5; y < b.rows; y += spacing * 0.86) {
    for (let x = 0.5 + ((y / spacing) % 2) * spacing * 0.5; x < b.cols; x += spacing) {
      const px = x + (b.rnd() - 0.5) * spacing * 0.8;
      const py = y + (b.rnd() - 0.5) * spacing * 0.8;
      if (px < 0.3 || py < 0.3 || px > b.cols - 0.3 || py > b.rows - 0.3 || clear(px, py)) continue;
      const k = density(px, py);
      if (b.rnd() < k * 0.85) {
        const a = b.pick(kinds);
        const size = ASSETS[a].w * (0.8 + b.rnd() * 0.45);
        if (pathAt(d, px, py) || !b.free(px, py, size * 0.55, -0.2)) continue;
        b.put(a, px, py, { w: r2(size), h: r2(size), rot: b.int(0, 359), flip: b.chance(0.5) });
      } else if (b.rnd() < k * 0.6 + 0.04) {
        const a = b.pick(under);
        if (pathAt(d, px, py) || !b.free(px, py, 0.8)) continue;
        b.put(a, px, py, { rot: b.int(0, 359), flip: b.chance(0.5) });
      }
    }
  }
}

function forest(b) {
  const { cols, rows } = b;
  ground(b, 'g', [['l', 0.16, 0.62, 1], ['o', 0.22, 0, 0.18]]);
  const cx = cols * (0.4 + b.rnd() * 0.2);
  const cy = rows * (0.4 + b.rnd() * 0.2);
  const rx = cols * (0.2 + b.rnd() * 0.08);
  const ry = rows * (0.2 + b.rnd() * 0.08);
  const inClearing = (x, y) => Math.hypot((x - cx) / rx, (y - cy) / ry);
  // The clearing is grass; a trail runs through it.
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) if (inClearing(c + 0.5, r + 0.5) < 1.05 + (noise(c * 0.4, r * 0.4, 3) - 0.5) * 0.4) b.floor[r][c] = 'g';
  const across = b.chance(0.5);
  const trail = across ? wander(b, [0, rows * (0.25 + b.rnd() * 0.5)], [cols, rows * (0.25 + b.rnd() * 0.5)], rows * 0.15) : wander(b, [cols * (0.25 + b.rnd() * 0.5), 0], [cols * (0.25 + b.rnd() * 0.5), rows], cols * 0.15);
  // Through the clearing's middle.
  trail[Math.floor(trail.length / 2)] = [r2(cx), r2(cy)];
  b.paths.push({ id: newDesignId(), kind: 'trail', w: 1, pts: trail });
  if (b.chance(0.45)) {
    const stream = across ? wander(b, [cols * (0.15 + b.rnd() * 0.2), 0], [cols * (0.65 + b.rnd() * 0.2), rows], cols * 0.12) : wander(b, [0, rows * (0.15 + b.rnd() * 0.2)], [cols, rows * (0.65 + b.rnd() * 0.2)], rows * 0.12);
    b.paths.push({ id: newDesignId(), kind: 'stream', w: 1, pts: stream });
  }
  // Something in the clearing.
  const feature = b.pick(['camp', 'stones', 'shrine', 'pond', 'none', 'camp']);
  if (feature === 'camp') {
    b.blob(cx, cy, 2.2, 2, 'd', { keep: (c, r) => b.floor[r][c] !== 'W' });
    b.put('campfire', cx, cy);
    b.put('log', cx, cy - 1.6, { w: 2.2, h: 0.8 });
    b.put('log', cx - 1.7, cy + 0.6, { w: 2.2, h: 0.8, rot: 70 });
    b.put('bedroll', cx + 1.7, cy + 0.6, { rot: 20 });
    b.put('tent', cx + 2.4, cy - 2.2, { rot: 200 });
    b.put('woodpile', cx - 2.6, cy - 1.8, { rot: 15 });
    b.put('cooking_pot', cx + 0.9, cy + 1.3);
  } else if (feature === 'stones') {
    const n = b.int(6, 9);
    const rr = Math.min(rx, ry) * 0.6;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      b.put('standing_stone', cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, { rot: Math.round((a * 180) / Math.PI) + 90 });
    }
    b.put('rune_stone', cx, cy);
  } else if (feature === 'shrine') {
    b.blob(cx, cy, 2.6, 2.2, 'f', { rough: 0.2 });
    b.put('altar', cx, cy - 0.6);
    for (const [dx, dy] of [[-2, -1.6], [2, -1.6], [-2, 1.4]]) b.put('pillar', cx + dx, cy + dy);
    b.put('pillar_broken', cx + 2, cy + 1.6, { rot: 30 });
    b.put('rubble', cx + 0.8, cy + 1.8);
    b.put('candle', cx - 0.6, cy - 0.6);
  } else if (feature === 'pond') {
    const cells = b.blob(cx, cy, Math.min(4, rx * 0.6), Math.min(3, ry * 0.6), 'W', { rough: 0.3, s: 9 });
    for (const [c, r] of cells) if (cells.length > 12 && Math.hypot(c + 0.5 - cx, r + 0.5 - cy) < 1.2) b.floor[r][c] = 'D';
    for (let i = 0; i < 4; i += 1) b.put('lily_pads', cx + (b.rnd() - 0.5) * 3, cy + (b.rnd() - 0.5) * 2, { rot: b.int(0, 359) });
  }
  b.paths[0].pts = b.paths[0].pts.map((p) => p);
  woods(b, (x, y) => clamp((inClearing(x, y) - 0.9) * 1.6, 0, 1) * (0.7 + noise(x * 0.3, y * 0.3, 5) * 0.6), {
    clear: (x, y) => feature === 'pond' && b.get(Math.floor(x), Math.floor(y)) === 'W',
  });
  // Reeds by water, flowers and a stump or a log here and there.
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (b.floor[r][c] !== 'W' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => b.get(c + dc, r + dr) === 'W') && b.chance(0.35) && b.free(c + 0.5, r + 0.5, 0.8)) b.put('reeds', c + 0.5, r + 0.5, { rot: b.int(0, 359) });
    }
  }
  for (let i = 0; i < Math.round((cols * rows) / 160); i += 1) {
    const x = 1 + b.rnd() * (cols - 2);
    const y = 1 + b.rnd() * (rows - 2);
    const a = b.pick(['stump', 'log', 'rock', 'rocks', 'flowers', 'mushrooms']);
    if (b.free(x, y, Math.max(ASSETS[a].w, ASSETS[a].h)) && !pathAt({ paths: b.paths }, x, y)) b.put(a, x, y, { rot: b.int(0, 359) });
  }
  return b.done();
}

/** A house: walled, floored, a door, and furniture. Returns the room. */
function house(b, room, id, { door, style, floorCh, kind = 'home' }) {
  b.style(id, style);
  b.fill(room.x, room.y, room.w, room.h, floorCh, id);
  room.id = id;
  room.door = door;
  room.kind = kind;
  return room;
}

function furnishHouse(b, room) {
  const { w, h } = room;
  const [cx, cy] = centre(room);
  const far = room.door === 'S' ? 'N' : 'S';
  if (room.kind === 'smithy') {
    b.against(room, far, 'forge', w / 2);
    b.put('anvil', cx, cy + (far === 'N' ? 0.3 : -0.3));
    b.against(room, 'W', 'weapon_rack', h / 2);
    b.put('barrel', room.x + w - 0.8, room.y + 0.8);
    return;
  }
  if (room.kind === 'shop') {
    b.against(room, far, 'shelves', w / 2);
    b.put('table', cx, cy, { w: Math.min(2.5, w - 2) });
    b.put('crate', room.x + 0.8, room.y + 0.8);
    b.put('sacks', room.x + w - 0.8, room.y + h - 0.8);
    return;
  }
  b.against(room, far, 'fireplace', w < 5 ? w / 2 : 1.5);
  b.against(room, far === 'N' ? 'N' : 'S', b.chance(0.5) ? 'bed' : 'bed_double', w - 1.1);
  if (w >= 5 && h >= 4) {
    b.put('table', cx - 0.3, cy, { rot: 0 });
    b.put('chair', cx - 0.8, cy + (far === 'N' ? 0.75 : -0.75), { rot: far === 'N' ? 180 : 0 });
    b.put('chair', cx + 0.2, cy + (far === 'N' ? 0.75 : -0.75), { rot: far === 'N' ? 180 : 0 });
  } else b.put('side_table', cx, cy);
  b.against(room, room.door === 'S' ? 'S' : 'N', 'chest', 0.9);
  if (b.chance(0.5)) b.put('barrel', room.x + w - 0.6, room.y + (room.door === 'S' ? h - 0.6 : 0.6));
}

function village(b) {
  const { cols, rows } = b;
  ground(b, 'g', [['G', 0.13, 0.6, 1], ['d', 0.2, 0, 0.12]]);
  const ry = Math.round(rows * (0.45 + b.rnd() * 0.1));
  // The square: cobbles round a well or a fountain, stalls round it; the road comes in either side.
  const sq = { x: Math.round(cols / 2) - 4, y: ry - 3, w: 8, h: 6 };
  b.paths.push({ id: newDesignId(), kind: 'road', w: 2, pts: wander(b, [0, ry + b.int(-2, 2)], [sq.x + 0.5, ry], 1.2, 3) });
  b.paths.push({ id: newDesignId(), kind: 'road', w: 2, pts: wander(b, [sq.x + sq.w - 0.5, ry], [cols, ry + b.int(-2, 2)], 1.2, 3) });
  b.blob(sq.x + sq.w / 2, sq.y + sq.h / 2, sq.w / 2 + 0.6, sq.h / 2 + 0.6, 'c', { rough: 0.15 });
  b.put(b.chance(0.5) ? 'well' : 'fountain', sq.x + sq.w / 2, sq.y + sq.h / 2);
  for (const [dx, dy, rot] of [[-3, -2.3, 0], [3, -2.3, 0], [-3, 2.3, 180]]) b.put('market_stall', sq.x + sq.w / 2 + dx, sq.y + sq.h / 2 + dy, { rot, tint: b.pick(['#b8432f', '#2f6fb3', '#3f8a4a', '#c9a640']) });
  b.put('notice_board', sq.x + sq.w / 2 + 3, sq.y + sq.h / 2 + 2.4);
  b.put('signpost', sq.x - 1, ry - 1.4);
  // Houses along both sides of the road.
  const homes = [];
  let id = 1;
  const kinds = ['home', 'home', 'smithy', 'home', 'shop', 'home', 'home'];
  for (const side of [-1, 1]) {
    let x = 1 + b.int(0, 2);
    while (x < cols - 5) {
      const w = b.int(5, 7);
      const h = b.int(4, 5);
      const y = side < 0 ? ry - 3 - h - b.int(1, 2) : ry + 3 + b.int(1, 2);
      const room = { x, y, w, h };
      if (x + w > cols - 1 || y < 1 || y + h > rows - 1 || overlaps(room, { x: sq.x - 1, y: sq.y - 1, w: sq.w + 2, h: sq.h + 2 }, 0)) {
        x += 2;
        continue;
      }
      homes.push(house(b, room, id, { door: side < 0 ? 'S' : 'N', style: b.pick(['wood', 'wood', 'stone', 'brick']), floorCh: b.pick(['w', 'w', 'z', 'f']), kind: kinds[(id - 1) % kinds.length] }));
      id += 1;
      x += w + b.int(2, 4);
    }
  }
  b.autoWalls();
  for (const room of homes) {
    const dx = room.x + Math.floor(room.w / 2);
    b.setEdge(dx, room.door === 'S' ? room.y + room.h - 1 : room.y, room.door, 'door');
    // A window or two.
    for (const side of ['W', 'E']) if (b.chance(0.6)) b.setEdge(side === 'W' ? room.x : room.x + room.w - 1, room.y + Math.floor(room.h / 2), side, 'window');
    // A path to the road.
    const fy = room.door === 'S' ? room.y + room.h : room.y;
    b.paths.push({ id: newDesignId(), kind: 'trail', w: 0.9, pts: [[dx + 0.5, fy], [dx + 0.5, room.door === 'S' ? fy + 1.5 : fy - 1.5]] });
    furnishHouse(b, room);
  }
  // Gardens behind some houses: farmland with crops, fenced.
  for (const room of homes) {
    if (!b.chance(0.5)) continue;
    const gy = room.door === 'S' ? room.y - 4 : room.y + room.h + 1;
    if (gy < 1 || gy + 3 > rows - 1) continue;
    const g = { x: room.x, y: gy, w: room.w, h: 3 };
    if (homes.some((o) => o !== room && overlaps(g, o, 0))) continue;
    b.fill(g.x, g.y, g.w, g.h, 't');
    for (let cx = g.x + 1; cx < g.x + g.w - 0.5; cx += 2) b.put('crops', cx, g.y + 1.5, { w: 1.8, h: 2.6, tint: b.pick(['#c9a640', '#7fae3f', '#c9a640']) });
    b.line(g.x, g.y, g.x + g.w, g.y, 'low', 'wood');
    b.line(g.x, g.y + g.h, g.x + g.w, g.y + g.h, 'low', 'wood');
    b.line(g.x, g.y, g.x, g.y + g.h, 'low', 'wood');
    b.line(g.x + g.w, g.y, g.x + g.w, g.y + g.h, 'low', 'wood');
  }
  // Lamp posts along the road; trees round the edges; a cart and hay.
  for (let x = 4; x < cols - 2; x += 8) if (b.free(x, ry - 1.6, 0.8)) b.put('lamp_post', x, ry - 1.6);
  b.put('cart', sq.x + sq.w + 2, ry + 2.2, { rot: 10 });
  b.put('hay_bale', sq.x + sq.w + 3.8, ry + 2.5);
  const edge = (x, y) => Math.min(x, y, cols - x, rows - y);
  woods(b, (x, y) => clamp(1.3 - edge(x, y) / 3, 0, 0.8), { kinds: ['tree', 'tree', 'birch', 'pine'], under: ['bush', 'flowers', 'bush_berry', 'tall_grass'], clear: (x, y) => homes.some((o) => x > o.x - 1 && x < o.x + o.w + 1 && y > o.y - 1 && y < o.y + o.h + 1) });
  return b.done();
}

// ---------- tavern ----------

function tavern(b) {
  const { cols, rows } = b;
  ground(b, 'g', [['d', 0.25, 0.65, 1]]);
  const B = { x: 2, y: 2, w: cols - 4, h: rows - 6 };
  const style = b.pick(['wood', 'stone', 'wood']);
  const topH = clamp(Math.round(B.h * 0.38), 4, 7);
  const kitchen = { x: B.x, y: B.y, w: Math.round(B.w * 0.36), h: topH, id: 2 };
  const store = { x: kitchen.x + kitchen.w, y: B.y, w: Math.round(B.w * 0.26), h: topH, id: 3 };
  const bedroom = { x: store.x + store.w, y: B.y, w: B.x + B.w - store.x - store.w, h: topH, id: 4 };
  const hall = { x: B.x, y: B.y + topH, w: B.w, h: B.h - topH, id: 1 };
  for (const room of [hall, kitchen, store, bedroom]) b.style(room.id, style);
  b.fill(hall.x, hall.y, hall.w, hall.h, 'w', 1);
  b.fill(kitchen.x, kitchen.y, kitchen.w, kitchen.h, 'f', 2);
  b.fill(store.x, store.y, store.w, store.h, 'w', 3);
  b.fill(bedroom.x, bedroom.y, bedroom.w, bedroom.h, 'z', 4);
  // The street in front, and a cobbled step to the door.
  b.fill(0, rows - 3, cols, 3, 'c');
  b.autoWalls();
  const doorX = hall.x + Math.floor(hall.w / 2);
  b.setEdge(doorX, hall.y + hall.h - 1, 'S', 'door');
  b.setEdge(kitchen.x + Math.floor(kitchen.w / 2), kitchen.y + kitchen.h - 1, 'S', 'door');
  b.setEdge(store.x + Math.floor(store.w / 2), store.y + store.h - 1, 'S', 'door');
  b.setEdge(bedroom.x + Math.floor(bedroom.w / 2), bedroom.y + bedroom.h - 1, 'S', 'door');
  b.setEdge(kitchen.x + 1, kitchen.y, 'N', 'door');
  for (let x = hall.x + 2; x < hall.x + hall.w - 2; x += 4) if (Math.abs(x - doorX) > 1) b.setEdge(x, hall.y + hall.h - 1, 'S', 'window');
  // The bar along the kitchen side, kegs behind it, stools in front.
  const barW = Math.min(4, kitchen.w - 1);
  b.put('bar', hall.x + 0.6 + barW / 2, hall.y + 1.6, { w: barW });
  for (let i = 0; i < barW - 0.5; i += 1) b.put('stool', hall.x + 1.1 + i, hall.y + 2.6);
  b.put('keg', hall.x + 0.6, hall.y + 0.6, { w: 0.9, h: 0.9 });
  b.put('keg', hall.x + 1.6, hall.y + 0.6, { w: 0.9, h: 0.9 });
  b.put('bottles', hall.x + 0.7 + barW, hall.y + 0.6);
  b.put('tankards', hall.x + barW * 0.6, hall.y + 1.5);
  // The fireplace on the far wall, a rug before it.
  b.against(hall, 'E', 'fireplace', hall.h / 2);
  b.put('rug', hall.x + hall.w - 2.6, hall.y + hall.h / 2, { w: 2, h: 3, tint: '#8a3a2a' });
  b.put('armchair', hall.x + hall.w - 3.2, hall.y + hall.h / 2 - 1.2, { rot: 60 });
  // Tables with chairs.
  for (let ty = hall.y + 2.2; ty < hall.y + hall.h - 1.6; ty += 3) {
    for (let tx = hall.x + barW + 2.6; tx < hall.x + hall.w - 4.6; tx += 3.4) {
      if (!b.free(tx, ty, 2.4)) continue;
      if (b.chance(0.5)) {
        b.put('round_table', tx, ty);
        for (let k = 0; k < 4; k += 1) b.put('stool', tx + Math.cos(k * Math.PI / 2 + 0.6) * 1.05, ty + Math.sin(k * Math.PI / 2 + 0.6) * 1.05);
      } else {
        b.put('table', tx, ty, { w: 2, h: 1 });
        for (const s of [-1, 1]) {
          b.put('chair', tx - 0.5, ty + s * 0.8, { rot: s < 0 ? 0 : 180 });
          b.put('chair', tx + 0.5, ty + s * 0.8, { rot: s < 0 ? 0 : 180 });
        }
      }
      if (b.chance(0.6)) b.put(b.pick(['meal', 'tankards', 'candle']), tx + 0.2, ty - 0.05, b.pick([{}, { rot: 10 }]));
    }
  }
  b.put('chandelier', hall.x + hall.w / 2, hall.y + hall.h / 2);
  // The kitchen.
  b.against(kitchen, 'N', 'stove', kitchen.w - 1.5);
  b.against(kitchen, 'W', 'shelves', kitchen.h / 2);
  b.put('table', kitchen.x + kitchen.w / 2 + 0.3, kitchen.y + kitchen.h / 2 + 0.2, { w: 2 });
  b.put('meal', kitchen.x + kitchen.w / 2 + 0.3, kitchen.y + kitchen.h / 2 + 0.2);
  b.put('cauldron', kitchen.x + kitchen.w - 1, kitchen.y + kitchen.h - 1);
  b.put('produce', kitchen.x + 1.6, kitchen.y + kitchen.h - 0.8);
  // The store room: crates, barrels, sacks.
  for (const [dx, dy, a] of [[0.7, 0.7, 'crate'], [1.7, 0.7, 'crate'], [0.7, 1.7, 'barrel'], [store.w - 0.7, 0.7, 'keg'], [store.w - 0.7, 1.8, 'sacks'], [0.8, store.h - 1.6, 'sacks'], [store.w - 0.7, store.h - 1.8, 'barrel']]) {
    if (dx < store.w && dy < store.h) b.put(a, store.x + dx, store.y + dy, { rot: b.int(-10, 10) });
  }
  // The bedroom, with the stairs up.
  b.against(bedroom, 'N', 'bed_double', 1.4);
  b.against(bedroom, 'N', 'side_table', 3, { w: 0.8, h: 0.8 });
  b.put('candle', bedroom.x + 3, bedroom.y + 0.5);
  b.against(bedroom, 'E', 'stairs', bedroom.h / 2, { rot: 270 });
  b.put('chest', bedroom.x + 1.2, bedroom.y + bedroom.h - 0.8);
  // Outside: a trough, barrels by the door, a lamp, a tree.
  b.put('trough', hall.x + 3, rows - 3.6);
  b.put('barrel', doorX + 1.7, rows - 3.5);
  b.put('barrel', doorX + 2.5, rows - 3.4);
  b.put('lamp_post', doorX - 1.5, rows - 3.4);
  b.put('signpost', doorX + 4, rows - 3.4);
  b.put('cart', cols - 4, rows - 1.6, { rot: 5 });
  for (const [x, y] of [[0.9, 1.1], [cols - 1, 1.2], [0.9, rows - 4.5]]) if (b.free(x, y, 1.4)) b.put(b.pick(['tree', 'bush', 'tree']), x, y, { w: 1.6, h: 1.6, rot: b.int(0, 359) });
  return b.done();
}

// ---------- camp ----------

function camp(b) {
  const { cols, rows } = b;
  ground(b, 'g', [['G', 0.15, 0.6, 1], ['l', 0.2, 0, 0.15]]);
  const cx = cols / 2;
  const cy = rows / 2;
  b.blob(cx, cy, cols * 0.3, rows * 0.3, 'd', { rough: 0.3, s: 4 });
  // The palisade round the camp, with a gate at the bottom.
  const P = { x: Math.round(cx - cols * 0.36), y: Math.round(cy - rows * 0.36), w: Math.round(cols * 0.72), h: Math.round(rows * 0.72) };
  const fenced = b.chance(0.6);
  if (fenced) {
    b.line(P.x, P.y, P.x + P.w, P.y, 'wall', 'palisade');
    b.line(P.x, P.y, P.x, P.y + P.h, 'wall', 'palisade');
    b.line(P.x + P.w, P.y, P.x + P.w, P.y + P.h, 'wall', 'palisade');
    const gate = Math.round(cx);
    b.line(P.x, P.y + P.h, gate - 1, P.y + P.h, 'wall', 'palisade');
    b.line(gate + 1, P.y + P.h, P.x + P.w, P.y + P.h, 'wall', 'palisade');
    b.put('torch', gate - 1.4, P.y + P.h + 0.35, { rot: 0 });
    b.put('torch', gate + 1.4, P.y + P.h + 0.35, { rot: 0 });
    b.paths.push({ id: newDesignId(), kind: 'road', w: 1.6, pts: [[gate, P.y + P.h - 2], [gate + 0.4, P.y + P.h + 1.5], [gate - 0.6, rows]] });
  }
  // The fire in the middle, seats round it.
  b.put('campfire', cx, cy, { w: 1.3, h: 1.3 });
  b.put('spit', cx, cy - 1.4);
  for (const a of [0.3, 2.4, 4.4]) b.put('log', cx + Math.cos(a) * 2, cy + Math.sin(a) * 2, { w: 2, h: 0.7, rot: Math.round((a * 180) / Math.PI) + 90 });
  // Tents round it, their fronts to the fire.
  const n = b.int(5, 8);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + b.rnd() * 0.3;
    const d = Math.min(cols, rows) * 0.26;
    const x = cx + Math.cos(a) * d * 1.2;
    const y = cy + Math.sin(a) * d;
    if (!b.free(x, y, 2)) continue;
    b.put(i === 0 ? 'pavilion' : 'tent', x, y, { rot: Math.round((a * 180) / Math.PI) - 90, tint: i === 0 ? '#a33b3b' : b.pick(['#9a8a62', '#8a7a52', '#7a6a48', '#a39470']) });
    if (b.chance(0.7)) {
      const bx = cx + Math.cos(a) * d * 0.62;
      const by = cy + Math.sin(a) * d * 0.55;
      if (b.free(bx, by, 1.2)) b.put('bedroll', bx, by, { rot: Math.round((a * 180) / Math.PI) + 90 });
    }
  }
  // Supplies, practice and wagons.
  const spots = [
    ['wagon', P.x + 2.4, P.y + 1.6, 0], ['cart', P.x + P.w - 2.2, P.y + 1.6, 0], ['woodpile', P.x + 1.4, cy, 90], ['hay_bale', P.x + P.w - 1, cy - 1.2, 0],
    ['hay_bale', P.x + P.w - 1, cy, 10], ['weapon_rack', cx + 3.5, P.y + 0.6, 0], ['armour_stand', cx + 5, P.y + 1, 0], ['dummy', P.x + 1.5, P.y + P.h - 1.5, 0],
    ['target', P.x + P.w - 1.4, P.y + P.h - 1.4, 0], ['crate', P.x + 1, P.y + 3.6, 0], ['barrel', P.x + 1.9, P.y + 3.6, 0], ['sacks', P.x + 1, P.y + 4.6, 0],
    ['cooking_pot', cx + 1.5, cy + 1.1, 0], ['trough', cx - 4, P.y + P.h - 1, 0],
  ];
  for (const [a, x, y, rot] of spots) if (b.free(x, y, Math.max(ASSETS[a].w, ASSETS[a].h) * 0.7)) b.put(a, x, y, { rot });
  woods(b, (x, y) => (x > P.x - 1.5 && x < P.x + P.w + 1.5 && y > P.y - 1.5 && y < P.y + P.h + 1.5 ? 0 : 0.75), { kinds: ['pine', 'pine', 'tree', 'birch'], under: ['bush', 'ferns', 'rocks', 'tall_grass'] });
  return b.done();
}

// ---------- river crossing ----------

function crossing(b) {
  const { cols, rows } = b;
  ground(b, 'g', [['G', 0.14, 0.72, 1], ['o', 0.2, 0, 0.14], ['d', 0.3, 0.45, 0.47]]);
  const s = b.int(1, 999);
  const mid = (r) => cols * 0.5 + (noise(r * 0.09, 0, s) - 0.5) * cols * 0.4;
  const half = (r) => 2.2 + noise(r * 0.15, 3, s) * 1.6;
  let narrow = { r: Math.floor(rows / 2), w: Infinity };
  for (let r = 0; r < rows; r += 1) {
    const m = mid(r + 0.5);
    const hw = half(r + 0.5);
    if (r > rows * 0.3 && r < rows * 0.7 && hw < narrow.w) narrow = { r, w: hw };
    for (let c = 0; c < cols; c += 1) {
      const d = Math.abs(c + 0.5 - m);
      if (d < hw * 0.45) b.floor[r][c] = 'D';
      else if (d < hw) b.floor[r][c] = 'W';
      else if (d < hw + 1.1 && noise(c * 0.5, r * 0.5, s + 1) > 0.45) b.floor[r][c] = b.chance(0.5) ? 'a' : 'm';
    }
  }
  // The road, over the river at its narrowest by a bridge.
  const by = narrow.r + 0.5;
  const bx = mid(by);
  const road = [[0, r2(by + b.int(-3, 3))], [r2(bx - narrow.w - 3), r2(by)], [r2(bx + narrow.w + 3), r2(by)], [cols, r2(by + b.int(-3, 3))]];
  b.paths.push({ id: newDesignId(), kind: 'road', w: 2, pts: road });
  b.put(b.chance(0.5) ? 'bridge' : 'bridge_stone', bx, by, { w: 2.6, h: r2(narrow.w * 2 + 2.4), rot: 90 });
  b.put('signpost', r2(bx - narrow.w - 4), r2(by - 1.8));
  if (b.chance(0.6)) b.put('rowboat', r2(mid(by + 4) - half(by + 4) + 1.4), r2(by + 4), { rot: 170 });
  // Reeds and lily pads in the shallows, rocks in the stream.
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const ch = b.floor[r][c];
      const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => !['W', 'D'].includes(b.get(c + dc, r + dr) ?? 'W'));
      if (ch === 'W' && shore && b.chance(0.3) && b.free(c + 0.5, r + 0.5, 0.9) && Math.abs(r + 0.5 - by) > 2.5) b.put(b.chance(0.6) ? 'reeds' : 'lily_pads', c + 0.5, r + 0.5, { rot: b.int(0, 359) });
      if (ch === 'D' && b.chance(0.03) && b.free(c + 0.5, r + 0.5, 1) && Math.abs(r + 0.5 - by) > 2.5) b.put('rock', c + 0.5, r + 0.5, { rot: b.int(0, 359) });
    }
  }
  woods(b, (x, y) => {
    const d = Math.abs(x - mid(y)) - half(y);
    return d < 0.6 ? 0 : clamp(0.25 + noise(x * 0.2, y * 0.2, s + 3) * 0.7 - (d < 2.5 ? 0.15 : 0), 0, 0.9);
  }, { kinds: ['tree', 'birch', 'tree', 'tree', 'pine', 'willow', 'birch', 'tree'], under: ['bush', 'tall_grass', 'flowers', 'rocks', 'ferns'] });
  return b.done();
}

const MAKERS = { dungeon, cave, forest, village, tavern, camp, crypt, crossing };

/**
 * Make a starting design: `kind` one of GENERATORS, `cols` x `rows` squares
 * (defaults per kind, at least 16 x 12), `seed` any whole number.
 */
export function generateDesign(kind, { cols = null, rows = null, seed = 1 } = {}) {
  const def = GENERATORS[kind];
  if (!def) throw new Error(`Unknown kind of map: ${kind}`);
  const c = clamp(Math.round(cols ?? def.cols), 16, 60);
  const r = clamp(Math.round(rows ?? def.rows), 12, 60);
  return MAKERS[kind](builder(c, r, Math.round(Number(seed) || 1), Object.keys(GENERATORS).indexOf(kind) + 1));
}

/**
 * The builder the generators use, for the server's AI draft (maps/design-draft.js):
 * `designBuilder(cols, rows, seed, salt)`, then fill, style, autoWalls, setEdge, put
 * and the rest, and `done(look)` for the design.
 */
export { builder as designBuilder };
