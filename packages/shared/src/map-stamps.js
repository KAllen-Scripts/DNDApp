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
  // Rooms with the newer furniture.
  ['sitting_room', 'Sitting room', 'Rooms', 6, 5, (s) => {
    s.put('fireplace', 3, 0.5);
    s.put('rug', 3, 2.4, { w: 3, h: 2, tint: '#7a3a2a' });
    s.put('sofa', 3, 3.7, { rot: 180 });
    s.put('armchair', 1.2, 2.2, { rot: 90 });
    s.put('armchair', 4.8, 2.2, { rot: 270 });
    s.put('side_table', 3, 2.4, { w: 0.8, h: 0.8 });
    s.put('clock', 5.4, 0.3);
    s.put('plant', 0.5, 0.5);
  }],
  ['map_room', 'Map room', 'Rooms', 6, 5, (s) => {
    s.put('map_table', 3, 2.5);
    for (const [x, y, rot] of [[1.6, 2.5, 90], [4.4, 2.5, 270], [3, 1.4, 0]]) s.put('chair', x, y, { rot });
    s.put('globe', 0.6, 0.6);
    s.put('telescope', 5.3, 0.7);
    s.put('scroll_rack', 3, 0.3);
    s.put('book_pile', 0.6, 4.3);
    s.put('candelabra', 5.3, 4.3);
  }],
  ['bunks', 'Barracks bunks', 'Rooms', 6, 4, (s) => {
    for (const x of [0.6, 2, 4, 5.4]) s.put('bunk_bed', x, 1.05);
    for (const x of [1.3, 4.7]) s.put('trunk', x, 3.45);
    s.put('weapon_rack', 3, 3.75, { rot: 180 });
  }],
  ['pantry', 'Pantry', 'Rooms', 5, 4, (s) => {
    s.put('cask_rack', 1.6, 0.5);
    s.put('wine_rack', 4, 0.3);
    s.put('hanging_meat', 1.2, 2.2);
    s.put('herbs', 3.8, 2.2);
    s.put('cheese', 2.6, 2.4);
    s.put('bread', 3.2, 2.9);
    s.put('sacks', 0.6, 3.4);
    s.put('barrel', 4.4, 3.5);
  }],
  ['wizard_study', "Wizard's study", 'Rooms', 6, 5, (s) => {
    s.put('wizard_desk', 3, 1);
    s.put('chair', 3, 1.85, { rot: 180 });
    s.put('bookshelf', 0.3, 2.5, { rot: 270 });
    s.put('bookshelf', 5.7, 2.5, { rot: 90 });
    s.put('orrery', 1.5, 3.8);
    s.put('magic_mirror', 3, 4.7, { rot: 180 });
    s.put('spellbook', 4.4, 3.8);
    s.put('potion', 4.2, 1, { tint: '#5a9a3a' });
  }],
  ['chapel', 'Chapel', 'Rooms', 6, 7, (s) => {
    s.put('dais', 3, 1.3, { w: 4, h: 2.2 });
    s.put('altar', 3, 1.2);
    s.put('candle_stand', 1, 0.5);
    s.put('candle_stand', 5, 0.5);
    s.put('carpet_runner', 3, 4.8, { w: 1.2, h: 4 });
    for (const y of [3.4, 4.8, 6.2]) for (const x of [1.35, 4.65]) s.put('pew', x, y, { w: 2.2 });
  }],
  // Dungeon rooms.
  ['torture', 'Torture chamber', 'Dungeon', 6, 5, (s) => {
    s.put('torture_rack', 3, 2.3, { rot: 90 });
    s.put('iron_maiden', 0.6, 0.6);
    s.put('brazier', 5.3, 0.7);
    s.put('chains', 0.6, 3.5);
    s.put('shackles', 5.3, 3.5);
    s.put('blood', 2.6, 3.6);
  }],
  ['trap_hall', 'Trapped hall', 'Dungeon', 3, 9, (s) => {
    s.put('pressure_plate', 1.5, 1.5);
    s.put('floor_spikes', 1.5, 3.5);
    s.put('dart_holes', 0.5, 3.5, { rot: 90 });
    s.put('tripwire', 1.5, 5.4, { w: 2.6 });
    s.put('blade_trap', 1.5, 7.2);
    s.put('skeleton', 2.2, 8.2, { rot: 20 });
  }],
  ['hoard', 'Treasure hoard', 'Dungeon', 6, 5, (s) => {
    s.put('hoard', 3, 2.2);
    s.put('chest_open', 0.8, 1);
    s.put('mimic', 5.2, 1);
    s.put('gold_bars', 1, 3.9);
    s.put('gems', 4.6, 3.6);
    s.put('crown', 5.3, 4.3);
    s.put('coins', 2.2, 4.4);
    s.put('weapon_pile', 0.9, 2.4, { w: 1.2, h: 1.2 });
  }],
  ['ritual', 'Ritual circle', 'Dungeon', 6, 6, (s) => {
    s.put('pentagram', 3, 3.2, { w: 3.6, h: 3.6, tint: '#c0392b' });
    s.put('blood_altar', 3, 0.6);
    for (const [x, y] of [[0.6, 1], [5.4, 1], [0.6, 5.4], [5.4, 5.4]]) s.put('skull_candles', x, y);
  }],
  ['mine_face', 'Mine face', 'Dungeon', 6, 4, (s) => {
    s.put('rails', 1, 2, { rot: 90 });
    s.put('rails', 4, 2, { rot: 90 });
    s.put('mine_cart', 2.5, 2, { rot: 90 });
    s.put('ore', 5.2, 0.8);
    s.put('pickaxe', 4.6, 3.3);
    s.put('lantern', 0.4, 0.4);
    s.put('mine_support', 3.5, 2, { w: 3.6, rot: 90 });
  }],
  ['tomb', 'Knight\'s tomb', 'Dungeon', 5, 5, (s) => {
    s.put('effigy_tomb', 2.5, 2.5);
    for (const [x, y] of [[0.7, 0.7], [4.3, 0.7], [0.7, 4.3], [4.3, 4.3]]) s.put('candle', x, y);
    s.put('urn', 0.6, 2.5);
    s.put('urn', 4.4, 2.5);
    s.put('banner', 2.5, 0.15);
  }],
  // Outdoors.
  ['farmyard', 'Farmyard', 'Outdoors', 7, 5, (s) => {
    s.fill(0, 0, 7, 5, 'd');
    s.put('chicken_coop', 1.3, 1);
    s.put('water_pump', 3.5, 2.5);
    s.put('trough', 5.4, 2.6, { rot: 90 });
    s.put('haystack', 5.5, 0.9, { w: 1.6, h: 1.6 });
    s.put('milk_churn', 1, 4.3);
    s.put('bucket', 1.7, 4.4);
    s.put('chopping_block', 3.4, 4.2);
  }],
  ['garden', 'Kitchen garden', 'Outdoors', 6, 5, (s) => {
    s.fill(0, 0, 6, 5, 't');
    s.put('vegetable_patch', 1.2, 1.2);
    s.put('vegetable_patch', 3.6, 1.2);
    s.put('pumpkins', 1.2, 3.6);
    s.put('sunflowers', 5.3, 3.8);
    s.put('beehives', 3.4, 3.8);
    s.put('scarecrow', 5.3, 1.2);
    s.wall(0, 0, 6, 0, 'low', 'wood');
    s.wall(0, 0, 0, 5, 'low', 'wood');
    s.wall(6, 0, 6, 5, 'low', 'wood');
  }],
  ['siege', 'Siege line', 'Outdoors', 8, 5, (s) => {
    s.put('catapult', 2, 2.5);
    s.put('ballista', 6, 2.5);
    for (const x of [1, 3, 5, 7]) s.put('barricade', x, 0.5);
    s.put('cannonballs', 4, 3.6);
    s.put('standard', 4, 1.5, { tint: '#8a2a2a' });
  }],
  ['nomad_camp', 'Nomad camp', 'Outdoors', 8, 6, (s) => {
    s.put('yurt', 2, 2, { tint: '#b8a07a' });
    s.put('yurt', 6.2, 2.2, { tint: '#8a6a4a' });
    s.put('campfire', 4, 4.4);
    s.put('drying_rack', 1.5, 5.2);
    s.put('saddle', 6.8, 5);
    s.put('quiver', 5.6, 4.9);
  }],
  // Ships and the water.
  ['gun_deck', 'Gun deck', 'Ships', 6, 6, (s) => {
    s.fill(0, 0, 6, 6, 'j');
    for (const y of [1, 3, 5]) {
      s.put('cannon', 0.95, y, { rot: 270 });
      s.put('cannon', 5.05, y, { rot: 90 });
    }
    s.put('cannonballs', 2.4, 2);
    s.put('cannonballs', 3.6, 4);
    s.put('mast', 3, 3);
    s.put('rope_coil', 3, 1.4, { w: 0.8, h: 0.8 });
  }],
  ['helm_deck', "Ship's helm", 'Ships', 5, 4, (s) => {
    s.fill(0, 0, 5, 4, 'j');
    s.put('helm', 2.5, 1.6);
    s.put('sea_chest', 0.8, 0.4);
    s.put('lantern', 4.4, 0.4);
    s.put('map_table', 2.5, 3.1, { w: 1.6, h: 1.1 });
  }],
  ['quay', 'Quay cargo', 'Ships', 7, 4, (s) => {
    s.put('crate_stack', 1.1, 1.1);
    s.put('barrel_stack', 3.2, 0.6);
    s.put('fishing_net', 5.6, 1.2);
    s.put('lobster_pots', 3, 2.6);
    s.put('fish_crate', 4.2, 2.8);
    s.put('anchor', 6.2, 3.1, { rot: 60 });
    for (const x of [0.5, 3.5, 6.5]) s.put('bollard', x, 3.7);
  }],
];

/** The built-in stamps: [{ id ('b:<key>'), name, group, clip }]. */
export const BUILT_IN_STAMPS = STAMPS.map(([key, name, group, cols, rows, fn]) => ({ id: `b:${key}`, name, group, clip: make(cols, rows, fn) }));
