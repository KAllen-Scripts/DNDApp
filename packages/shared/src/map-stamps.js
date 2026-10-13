/**
 * Stamps that come with the map creator (SPEC §6.6 "Making a map"): small
 * pieces of map (a dining table with its chairs, a campsite, a graveyard) to
 * put down in one go, turned or flipped, like the DM's own saved stamps.
 * Each is a clip (map-design.js copyArea): floor (EMPTY leaves the map's
 * floor as it is), walls, assets, paths and labels, from its corner.
 */
import { ASSETS, EMPTY, normalizeClip } from './map-design.js';

/** A stamp made by `fn(s)` on a `cols` x `rows` clip. */
function make(cols, rows, fn) {
  const floor = Array.from({ length: rows }, () => Array(cols).fill(EMPTY));
  const walls = [];
  const assets = [];
  let n = 0;
  const s = {
    put: (a, x, y, extra = {}) => assets.push({ id: `st${String((n += 1)).padStart(4, '0')}`, a, x, y, w: ASSETS[a].w, h: ASSETS[a].h, ...extra }),
    floor: (c, r, ch) => {
      if (floor[r]?.[c] !== undefined) floor[r][c] = ch;
    },
    fill: (x, y, w, h, ch) => {
      for (let r = y; r < y + h; r += 1) for (let c = x; c < x + w; c += 1) s.floor(c, r, ch);
    },
    wall: (x1, y1, x2, y2, type = 'wall', style = 'stone') => walls.push({ x1, y1, x2, y2, type, style }),
  };
  fn(s);
  return normalizeClip({ cols, rows, floor: floor.map((l) => l.join('')), walls, assets, paths: [], labels: [] });
}

const STAMPS = [
  ['dining', 'Dining table', 'Rooms', 6, 4, (s) => {
    s.put('table_long', 3, 2);
    for (const x of [1.5, 2.5, 3.5, 4.5]) {
      s.put('chair', x, 1.15);
      s.put('chair', x, 2.85, { rot: 180 });
    }
    s.put('chair', 0.55, 2, { rot: 270 });
    s.put('chair', 5.45, 2, { rot: 90 });
    s.put('meal', 2.2, 2);
    s.put('meal', 3.9, 2, { rot: 180 });
    s.put('candle', 3, 2);
  }],
  ['bedroom', 'Bedroom', 'Rooms', 4, 4, (s) => {
    s.put('bed', 0.7, 1.1);
    s.put('side_table', 1.7, 0.45, { w: 0.7, h: 0.7 });
    s.put('candle', 1.7, 0.45);
    s.put('wardrobe', 3.1, 0.4);
    s.put('rug', 2.5, 2.5, { w: 2, h: 1.4, tint: '#3c5a8a' });
    s.put('chest', 0.7, 3.5, { rot: 180 });
  }],
  ['bar', 'Bar counter', 'Rooms', 5, 3, (s) => {
    s.put('keg', 0.6, 0.5, { w: 0.9, h: 0.9 });
    s.put('keg', 1.6, 0.5, { w: 0.9, h: 0.9 });
    s.put('shelves', 3.6, 0.3, { w: 2, h: 0.5 });
    s.put('bar', 2.5, 1.5, { w: 4 });
    s.put('bottles', 3.4, 1.35);
    s.put('tankards', 1.6, 1.4);
    for (const x of [1, 2, 3, 4]) s.put('stool', x, 2.5);
  }],
  ['kitchen', 'Kitchen', 'Rooms', 5, 4, (s) => {
    s.put('stove', 1.1, 0.55);
    s.put('cauldron', 3, 0.6);
    s.put('shelves', 4.65, 1.6, { rot: 90 });
    s.put('table', 2.2, 2.4);
    s.put('meal', 2.2, 2.4);
    s.put('produce', 0.6, 3.4);
    s.put('sacks', 1.6, 3.45);
    s.put('barrel', 4.4, 3.4);
  }],
  ['library', 'Library corner', 'Rooms', 5, 4, (s) => {
    s.put('bookshelf', 1.1, 0.3);
    s.put('bookshelf', 3.2, 0.3);
    s.put('bookshelf', 4.7, 1.9, { rot: 90 });
    s.put('rug', 2.2, 2.3, { w: 3, h: 2, tint: '#2f4f3a' });
    s.put('desk', 2.2, 2);
    s.put('chair', 2.2, 2.8, { rot: 180 });
    s.put('candle', 2.7, 1.85);
    s.put('scroll', 1.8, 2);
    s.put('armchair', 0.7, 3.2, { rot: 200 });
  }],
  ['throne', 'Throne dais', 'Rooms', 5, 5, (s) => {
    s.put('rug', 2.5, 3, { w: 2, h: 4, tint: '#7a1f2a' });
    s.put('throne', 2.5, 0.8);
    s.put('brazier', 0.7, 0.8);
    s.put('brazier', 4.3, 0.8);
    s.put('pillar', 0.7, 3.2);
    s.put('pillar', 4.3, 3.2);
  }],
  ['smithy', 'Smithy', 'Rooms', 4, 4, (s) => {
    s.put('forge', 1.1, 1.1);
    s.put('anvil', 3, 1.4);
    s.put('weapon_rack', 2, 3.7, { rot: 180 });
    s.put('barrel', 3.5, 3.4);
    s.put('crate', 0.6, 3.3);
  }],
  ['alchemist', 'Alchemist', 'Rooms', 4, 3, (s) => {
    s.put('alchemy', 1.2, 0.55);
    s.put('shelves', 3.2, 0.3, { w: 1.5, h: 0.5 });
    s.put('cauldron', 3, 1.8);
    s.put('potion', 0.5, 1.5);
    s.put('potion', 0.8, 1.7, { tint: '#3fae6a' });
    s.put('lectern', 1.4, 2.4, { rot: 180 });
  }],
  ['shrine', 'Shrine', 'Rooms', 5, 4, (s) => {
    s.put('altar', 2.5, 0.6);
    s.put('candelabra', 1, 0.6);
    s.put('candelabra', 4, 0.6);
    s.put('rug', 2.5, 2.4, { w: 1.6, h: 2.6, tint: '#5a2a5a' });
    s.put('pillar', 0.6, 3.3, { w: 0.9, h: 0.9 });
    s.put('pillar', 4.4, 3.3, { w: 0.9, h: 0.9 });
  }],
  ['guard_post', 'Guard post', 'Rooms', 5, 5, (s) => {
    s.fill(0, 0, 5, 5, 'f');
    s.wall(0, 0, 5, 0);
    s.wall(0, 0, 0, 5);
    s.wall(5, 0, 5, 5);
    s.wall(0, 5, 2, 5);
    s.wall(3, 5, 5, 5);
    s.wall(2, 5, 3, 5, 'door');
    s.wall(5, 2, 5, 3, 'window');
    s.put('table', 2, 1.6);
    s.put('stool', 1.4, 2.4);
    s.put('stool', 2.6, 2.4);
    s.put('weapon_rack', 2.5, 0.3);
    s.put('brazier', 4.2, 4.2);
    s.put('torch', 0.3, 2.5, { rot: 270 });
  }],
  ['campsite', 'Campsite', 'Outdoors', 6, 6, (s) => {
    s.put('campfire', 3, 3);
    s.put('log', 2.6, 1.7, { w: 2, h: 0.7 });
    s.put('log', 1.6, 3.5, { w: 2, h: 0.7, rot: 70 });
    s.put('bedroll', 4.5, 3.6, { rot: 20 });
    s.put('bedroll', 3.2, 4.8, { rot: 95 });
    s.put('tent', 5, 1.1, { rot: 200 });
    s.put('woodpile', 0.9, 1, { rot: 10 });
    s.put('cooking_pot', 3.9, 2.4);
  }],
  ['market', 'Market stalls', 'Outdoors', 8, 4, (s) => {
    s.put('market_stall', 1.2, 1, { tint: '#b8432f' });
    s.put('market_stall', 4, 1, { tint: '#2f6fb3' });
    s.put('market_stall', 6.8, 1, { tint: '#3f8a4a' });
    s.put('produce', 1, 2.5);
    s.put('crate', 2.2, 2.6, { rot: 10 });
    s.put('sacks', 4, 2.6);
    s.put('barrel', 6.2, 2.5);
    s.put('crate', 7.2, 2.7, { rot: -8 });
  }],
  ['graveyard', 'Graveyard', 'Outdoors', 7, 6, (s) => {
    for (const x of [1.2, 2.8, 4.4]) s.put('grave', x, 1.4, { w: 1, h: 1.8 });
    for (const x of [1.2, 2.8]) s.put('tombstone', x, 3.9);
    s.put('grave', 4.4, 4.2, { w: 1, h: 1.8 });
    s.put('dead_tree', 6, 1.2, { w: 1.8, h: 1.8 });
    s.put('bones', 5.9, 4.6, { w: 0.8, h: 0.8 });
    s.wall(0, 0, 7, 0, 'low', 'iron');
    s.wall(0, 0, 0, 6, 'low', 'iron');
    s.wall(7, 0, 7, 6, 'low', 'iron');
    s.wall(0, 6, 3, 6, 'low', 'iron');
    s.wall(4, 6, 7, 6, 'low', 'iron');
  }],
  ['pond', 'Pond', 'Outdoors', 6, 5, (s) => {
    const shape = ['..WW..', '.WWWW.', 'WWDDWW', '.WWWW.', '..WW..'];
    shape.forEach((line, r) => [...line].forEach((ch, c) => ch !== EMPTY && s.floor(c, r, ch)));
    s.put('lily_pads', 1.6, 1.6);
    s.put('lily_pads', 4.2, 3.2, { rot: 120 });
    s.put('reeds', 0.6, 3.4);
    s.put('reeds', 5.4, 1.6, { rot: 80 });
    s.put('reeds', 4.4, 0.5, { rot: 200 });
  }],
  ['stone_circle', 'Stone circle', 'Outdoors', 7, 7, (s) => {
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      s.put('standing_stone', 3.5 + Math.cos(a) * 2.8, 3.5 + Math.sin(a) * 2.8, { rot: Math.round((a * 180) / Math.PI) + 90 });
    }
    s.put('magic_circle', 3.5, 3.5, { w: 3, h: 3 });
    s.put('rune_stone', 3.5, 3.5, { w: 0.9, h: 0.9 });
  }],
  ['wagon_stop', 'Wagon stop', 'Outdoors', 6, 4, (s) => {
    s.put('wagon', 2, 1);
    s.put('hay_bale', 4.6, 0.8);
    s.put('trough', 4.5, 2.2);
    s.put('sacks', 0.7, 2.5);
    s.put('crate', 1.8, 2.7, { rot: 12 });
    s.put('barrel', 2.8, 2.6);
  }],
];

/** The built-in stamps: [{ id ('b:<key>'), name, group, clip }]. */
export const BUILT_IN_STAMPS = STAMPS.map(([key, name, group, cols, rows, fn]) => ({ id: `b:${key}`, name, group, clip: make(cols, rows, fn) }));
