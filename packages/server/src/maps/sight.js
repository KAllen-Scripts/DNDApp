/**
 * Line of sight for players: what each player's own tokens can see right
 * now, plus the places they've seen before ("explored"), which stay on their
 * map dimmed. Worked out here on the server, so a player's browser never
 * gets anything their character couldn't see.
 *
 * Explored areas are kept per player per map as a coarse grid of cells
 * (EXPLORE_CELLS along the longer side), in the database only: they're a
 * convenience, not part of the campaign's record, so the archive doesn't
 * keep them and rebuilding the database forgets them (the DM can still
 * reveal by hand).
 */
import crypto from 'node:crypto';
import { sightOf, fogMask, pointInPolygon } from '@dndapp/shared/map.js';

export const EXPLORE_CELLS = 128;
const MEMO_SIZE = 64;

/** The explored grid's shape for a map. */
export function exploreGrid(image) {
  const cell = Math.max(image.width, image.height) / EXPLORE_CELLS;
  return { cell, cols: Math.ceil(image.width / cell), rows: Math.ceil(image.height / cell) };
}

/** Mark every cell whose centre is inside one of the polygons. Returns whether anything new was marked. */
export function markExplored(bits, { cell, cols, rows }, polygons) {
  let changed = false;
  for (const poly of polygons) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of poly) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const c0 = Math.max(0, Math.floor(x0 / cell));
    const c1 = Math.min(cols - 1, Math.floor(x1 / cell));
    const r0 = Math.max(0, Math.floor(y0 / cell));
    const r1 = Math.min(rows - 1, Math.floor(y1 / cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        if (bits[i >> 3] & (1 << (i & 7))) continue;
        if (pointInPolygon((c + 0.5) * cell, (r + 0.5) * cell, poly)) {
          bits[i >> 3] |= 1 << (i & 7);
          changed = true;
        }
      }
    }
  }
  return changed;
}

/** The explored cells as few rectangles ({ x, y, w, h } in image pixels): runs along each row, joined downwards where they line up. */
export function exploredRects(bits, { cell, cols, rows }, image) {
  const done = [];
  let open = new Map(); // "c0:c1" -> rect still growing downwards
  for (let r = 0; r < rows; r++) {
    const next = new Map();
    let c = 0;
    while (c < cols) {
      const i = r * cols + c;
      if (!(bits[i >> 3] & (1 << (i & 7)))) {
        c++;
        continue;
      }
      let end = c;
      while (end + 1 < cols && bits[(r * cols + end + 1) >> 3] & (1 << ((r * cols + end + 1) & 7))) end++;
      const key = `${c}:${end}`;
      const rect = open.get(key) ?? { c0: c, c1: end, r0: r, r1: r };
      rect.r1 = r;
      open.delete(key);
      next.set(key, rect);
      c = end + 1;
    }
    done.push(...open.values());
    open = next;
  }
  done.push(...open.values());
  const px = (v) => Math.round(v * 10) / 10;
  return done.map(({ c0, c1, r0, r1 }) => {
    const x = px(c0 * cell);
    const y = px(r0 * cell);
    return { x, y, w: px(Math.min(image.width, (c1 + 1) * cell) - x), h: px(Math.min(image.height, (r1 + 1) * cell) - y) };
  });
}

export function createSight({ db }) {
  // `${map id}:${version}:${user id}` -> what that player sees of that version of the map.
  const memo = new Map();

  const load = (mapId, userId, grid) => {
    const r = db.prepare('SELECT data, cols, rows FROM map_explored WHERE map_id = ? AND user_id = ?').get(mapId, userId);
    const size = Math.ceil((grid.cols * grid.rows) / 8);
    // A map's image never changes, so the grid can't either; start again if it somehow did.
    if (!r || r.cols !== grid.cols || r.rows !== grid.rows) return new Uint8Array(size);
    const bits = new Uint8Array(size);
    bits.set(Buffer.from(r.data, 'base64').subarray(0, size));
    return bits;
  };
  const save = (mapId, userId, grid, bits) => {
    db.prepare(
      `INSERT INTO map_explored (map_id, user_id, data, cols, rows, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (map_id, user_id) DO UPDATE SET data = excluded.data, cols = excluded.cols, rows = excluded.rows, updated_at = excluded.updated_at`,
    ).run(mapId, userId, Buffer.from(bits).toString('base64'), grid.cols, grid.rows, new Date().toISOString());
  };

  return {
    /**
     * What a player sees of a map: { polygons, mask, key }. polygons: what
     * their tokens see now; mask: the fog as they get it (see fogMask), empty
     * when the fog is off or the DM shows the map and only hides tokens; key:
     * changes whenever their image does ('clear' when unfogged). Seeing
     * somewhere marks it explored (when the map remembers).
     */
    forPlayer(map, userId) {
      if (!map.fog?.enabled) return { polygons: [], mask: [], key: 'clear' };
      const memoKey = `${map.id}:${map.version}:${userId}`;
      if (memo.has(memoKey)) return memo.get(memoKey);
      const polygons = sightOf(map, userId);
      if (map.fog.map === 'shown') return { polygons, mask: [], key: 'clear' };
      let explored = [];
      if (map.fog.sight && map.fog.memory) {
        const grid = exploreGrid(map.image);
        const bits = load(map.id, userId, grid);
        if (markExplored(bits, grid, polygons)) save(map.id, userId, grid, bits);
        explored = exploredRects(bits, grid, map.image);
      }
      const mask = fogMask(map, { polygons, explored });
      const key = crypto.createHash('sha1').update(JSON.stringify(mask)).digest('hex').slice(0, 12);
      const out = { polygons, mask, key };
      memo.set(memoKey, out);
      if (memo.size > MEMO_SIZE) memo.delete(memo.keys().next().value);
      return out;
    },

    /** Forget where everyone has been on a map (the DM starts the exploring again). */
    forget(mapId) {
      db.prepare('DELETE FROM map_explored WHERE map_id = ?').run(mapId);
      for (const k of memo.keys()) if (k.startsWith(`${mapId}:`)) memo.delete(k);
    },
  };
}
