/**
 * The pieces the map creator's starting points share (map-generate.js and
 * map-generate-more.js): the builder a design is made with, rooms and their
 * dressing, torches, paths, ground, woods, houses and caverns.
 */
import { ASSETS, EMPTY, normalizeDesign, newDesignId, pathAt, seeded } from './map-design.js';
import { noise } from './map-paint.js';

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const r2 = (v) => Math.round(v * 100) / 100;
/** The way an asset whose back is drawn at its top faces, against each wall of a room. */
export const ROT = { N: 0, E: 90, S: 180, W: 270 };
export const OPENINGS = new Set(['door', 'secret', 'arch', 'window']);

/**
 * A design being made: a floor of characters, an area id per square (walls go
 * between different areas: null is nothing, 0 open ground, more than 0 a room
 * or building), wall edges, assets, paths and labels.
 */
export function builder(cols, rows, seed, salt) {
  const rnd = seeded(seed, salt, cols, rows);
  const floor = Array.from({ length: rows }, () => Array(cols).fill(EMPTY));
  const area = Array.from({ length: rows }, () => Array(cols).fill(null));
  const styles = new Map(); // area id -> wall style
  const H = new Map(); // `${c},${r}`: the edge from (c, r) to (c + 1, r) -> { type, style }
  const V = new Map(); // `${c},${r}`: the edge from (c, r) to (c, r + 1)
  const assets = [];
  const floorLike = new Set(); // ids of assets things can go on
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
    /** Put an asset down (its middle at x, y). `underfoot: true`: things can go on it (a ship's deck, a dais). */
    put(a, x, y, { underfoot = false, ...extra } = {}) {
      const def = ASSETS[a];
      if (!def) return null;
      const asset = { id: newDesignId(), a, x: r2(x), y: r2(y), w: def.w, h: def.h, rot: 0, ...extra };
      assets.push(asset);
      if (underfoot) floorLike.add(asset.id);
      return asset;
    },
    /** Is there room for something `size` across at x, y (no asset within that, nothing past the edge)? */
    free(x, y, size = 1, gap = 0.1) {
      if (x < size / 2 || y < size / 2 || x > cols - size / 2 || y > rows - size / 2) return false;
      return !assets.some((o) => !floorLike.has(o.id) && Math.hypot(o.x - x, o.y - y) < (Math.max(o.w, o.h) + size) / 2 * 0.8 + gap);
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
export const overlaps = (a, o, gap) => a.x < o.x + o.w + gap && a.x + a.w + gap > o.x && a.y < o.y + o.h + gap && a.y + a.h + gap > o.y;
export const centre = (room) => [room.x + room.w / 2, room.y + room.h / 2];

/** Torches on a room's walls (not where a door is), facing in. */
export function torches(b, room, n) {
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
export function dress(b, room, theme) {
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

// ---------- outdoors ----------

/** A smooth path across the map: from one side to the other, wandering. */
export function wander(b, from, to, wobble, n = 6) {
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
export function ground(b, base, patches) {
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
export function woods(b, density, { kinds = ['tree', 'tree', 'pine', 'birch'], under = ['bush', 'ferns', 'tall_grass', 'bush', 'flowers'], spacing = 1.7, clear = () => false } = {}) {
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

/** A house: walled, floored, a door, and furniture. Returns the room. */
export function house(b, room, id, { door, style, floorCh, kind = 'home' }) {
  b.style(id, style);
  b.fill(room.x, room.y, room.w, room.h, floorCh, id);
  room.id = id;
  room.door = door;
  room.kind = kind;
  return room;
}

export function furnishHouse(b, room) {
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

// ---------- caverns ----------

/** The biggest joined area of open squares (`open[r][c]` true): a list of [c, r]. */
export function biggestRegion(open) {
  const rows = open.length;
  const cols = open[0]?.length ?? 0;
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  let biggest = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!open[r][c] || seen[r][c]) continue;
      const cells = [];
      const stack = [[c, r]];
      seen[r][c] = true;
      while (stack.length) {
        const [x, y] = stack.pop();
        cells.push([x, y]);
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (open[ny]?.[nx] && !seen[ny][nx]) {
            seen[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
      }
      if (cells.length > biggest.length) biggest = cells;
    }
  }
  return biggest;
}

/**
 * Walls round the squares `isOpen(c, r)` says are open, cutting the corners
 * (marching squares: ends on half squares), joined end to end with pieces in
 * a line merged.
 */
export function caveWalls(b, isOpen, style = 'cave', type = 'wall') {
  const segs = [];
  const at = (c, r) => (isOpen(c, r) ? 1 : 0);
  for (let r = -1; r < b.rows; r += 1) {
    for (let c = -1; c < b.cols; c += 1) {
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
    for (let j = 1; j < pts.length; j += 1) b.extraWalls.push({ x1: pts[j - 1][0], y1: pts[j - 1][1], x2: pts[j][0], y2: pts[j][1], type, style });
  }
}
