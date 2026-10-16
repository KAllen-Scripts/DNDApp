/**
 * Maps made in the app (the map creator, SPEC §6.6): the design the DM
 * edits and what can be in it (floors, walls, assets, paths, labels and the
 * look), the changes the creator's tools make to it, and what it gives the
 * map (walls, doors, secret doors, windows, obstacles, lights, difficult
 * terrain, stairs and ladders, and ways to other maps). How a design is drawn is in map-art.js.
 *
 * Plain JS with no imports: the server and the page's creator use the same
 * code. Every built-in floor and asset is drawn in code (original, so no
 * licences to worry about); the DM can add their own pictures as assets too
 * (`u:<id>`, map-assets.js on the server).
 *
 * A design, in squares (one square = 5 ft):
 *   { v: 2, cols, rows,
 *     floor: [string per row, one character per square: a FLOORS key, or '.' for nothing],
 *     walls: [{ id, x1, y1, x2, y2, type (WALL_TYPES), style (WALL_STYLES), arc?: { x, y } }]
 *       ends on half squares; `arc` is a point a curved wall passes through between its ends,
 *     assets: [{ id, a (an ASSETS key or 'u:<id>'), x, y (its middle), w, h (squares), rot (degrees),
 *       flip, tint ('#rrggbb' or null), layer (null: the asset's own), blocks (BLOCKS), light, difficult,
 *       to (a map id: a way to that map, or null), label }],
 *     paths: [{ id, kind (PATH_KINDS), w (squares across), pts: [[x, y], ...] }],
 *     labels: [{ id, text, x, y, size (squares high), rot, colour, font (LABEL_FONTS), italic, halo }],
 *     look: { void, grid, shadows, glow, mood, soft } }
 * Designs saved before ids, paths, labels and the look existed read the same way.
 */

export const DESIGN_VERSION = 2;
export const DESIGN_CELL = 70; // pixels per square in the map's picture
export const DESIGN_MIN = 4;
export const DESIGN_MAX = 60; // squares across or down (60 x 70 px = 4200 px)
export const MAX_DESIGN_WALLS = 1500;
export const MAX_DESIGN_ASSETS = 800;
export const MAX_DESIGN_PATHS = 80;
export const MAX_PATH_POINTS = 200;
export const MAX_DESIGN_LABELS = 100;
export const EMPTY = '.';

/** What a wall can be. Doors, secret doors, windows and archways are openings: drawn along a wall, they cut their stretch out of it. */
export const WALL_TYPES = ['wall', 'low', 'door', 'secret', 'window', 'arch'];
export const WALL_TYPE_NAMES = {
  wall: 'Wall',
  low: 'Low wall or fence (blocks movement, not sight)',
  door: 'Door',
  secret: 'Secret door (looks like wall; players only see it once you open or reveal it)',
  window: 'Window (blocks movement, not sight)',
  arch: 'Archway (an open doorway)',
};
export const OPENINGS = ['door', 'secret', 'window', 'arch'];
export const WALL_STYLES = ['stone', 'brick', 'wood', 'cave', 'palisade', 'hedge', 'iron', 'ruin'];
export const WALL_STYLE_NAMES = {
  stone: 'Stone', brick: 'Brick', wood: 'Wood', cave: 'Cave rock', palisade: 'Palisade (stakes)', hedge: 'Hedge', iron: 'Iron', ruin: 'Ruined stone',
};
export const BLOCKS = ['none', 'low', 'wall'];

/**
 * Floors, by the character that stands for them in `floor`. Built floors
 * have crisp edges; natural ones (with `blend`) run into each other, the
 * higher `blend` over the lower. `difficult` floors are difficult terrain.
 */
export const FLOORS = {
  s: { name: 'Stone tiles', base: '#7f7c75', group: 'Built' },
  f: { name: 'Flagstones', base: '#8c857a', group: 'Built' },
  e: { name: 'Dark slabs', base: '#4a4744', group: 'Built' },
  k: { name: 'Chequered tiles', base: '#cfc8b8', group: 'Built' },
  M: { name: 'Marble', base: '#d9d4cc', group: 'Built' },
  S: { name: 'Sandstone', base: '#c9a877', group: 'Built' },
  b: { name: 'Bricks', base: '#8a4b38', group: 'Built' },
  c: { name: 'Cobblestones', base: '#6f6a62', group: 'Built' },
  w: { name: 'Wooden boards', base: '#8b5a2b', group: 'Built' },
  z: { name: 'Parquet', base: '#9a6a3a', group: 'Built' },
  j: { name: 'Ship deck', base: '#7a5a3a', group: 'Built' },
  p: { name: 'Carpet', base: '#7b2531', group: 'Built' },
  x: { name: 'Iron grating', base: '#3c3d40', group: 'Built' },
  y: { name: 'Straw', base: '#c8a85a', group: 'Built' },
  g: { name: 'Grass', base: '#5b8a3a', group: 'Natural', blend: 16 },
  G: { name: 'Dry grass', base: '#9a9a4a', group: 'Natural', blend: 14 },
  o: { name: 'Moss', base: '#4f7a3a', group: 'Natural', blend: 15 },
  l: { name: 'Forest floor', base: '#5b4a2a', group: 'Natural', blend: 13 },
  d: { name: 'Dirt', base: '#7a5c3c', group: 'Natural', blend: 9 },
  t: { name: 'Farmland', base: '#6b4a2c', group: 'Natural', blend: 10 },
  v: { name: 'Gravel', base: '#8a857c', group: 'Natural', blend: 7 },
  a: { name: 'Sand', base: '#d2b77d', group: 'Natural', blend: 6 },
  r: { name: 'Cave floor', base: '#4f4a44', group: 'Natural', blend: 8 },
  u: { name: 'Rubble', base: '#6d6760', group: 'Natural', blend: 11, difficult: true },
  q: { name: 'Ash', base: '#55514d', group: 'Natural', blend: 12 },
  n: { name: 'Snow', base: '#e6ecf0', group: 'Natural', blend: 17 },
  i: { name: 'Ice', base: '#bcd9e6', group: 'Natural', blend: 5, difficult: true },
  m: { name: 'Mud', base: '#5a4630', group: 'Natural', blend: 4, difficult: true },
  h: { name: 'Marsh', base: '#4d5a34', group: 'Water', blend: 3, difficult: true },
  W: { name: 'Water', base: '#2f6f9a', group: 'Water', blend: 1, difficult: true, water: true },
  D: { name: 'Deep water', base: '#1d4a6e', group: 'Water', blend: 0, difficult: true, water: true },
  L: { name: 'Lava', base: '#c2410c', group: 'Water', blend: 2, glow: true },
};

/** Roads, rivers and other lines drawn on the floor. `w`: how wide a new one is, in squares. */
export const PATH_KINDS = {
  road: { name: 'Dirt road', w: 1.6 },
  cobble: { name: 'Cobbled road', w: 1.8 },
  trail: { name: 'Footpath', w: 0.8 },
  stones: { name: 'Stepping stones', w: 0.9 },
  river: { name: 'River', w: 2.4, difficult: true },
  stream: { name: 'Stream', w: 0.8, difficult: true },
  lava: { name: 'Lava flow', w: 1.6 },
  crack: { name: 'Crack', w: 0.4 },
  blood: { name: 'Blood trail', w: 0.5 },
};

/** Lettering for labels (the fonts come with the app, so the page and the server's picture match). */
export const LABEL_FONTS = {
  old: { name: 'Old map', family: '"IM Fell English", Georgia, "Times New Roman", "Liberation Serif", serif' },
  title: { name: 'Carved capitals', family: 'Cinzel, Georgia, "Times New Roman", "Liberation Serif", serif', weight: 'bold' },
  plain: { name: 'Plain', family: '"Segoe UI", "Trebuchet MS", Arial, "Liberation Sans", "DejaVu Sans", sans-serif' },
};

/** How the whole picture looks. */
export const MOODS = { day: 'Daylight', dusk: 'Dusk', night: 'Night', gloom: 'Gloomy' };
export const GRID_LOOKS = { none: 'No grid', faint: 'Faint grid', dark: 'Clear grid' };
export const LOOK = { void: '#17161a', grid: 'none', shadows: true, glow: true, mood: 'day', soft: true };

/** Groups of built-in assets, in the order the creator shows them. */
export const ASSET_GROUPS = ['Nature', 'Rocks', 'Water', 'Ships', 'Camp', 'Town', 'Farm', 'Furniture', 'Tavern', 'Temple', 'Dungeon', 'Traps', 'Treasure', 'Magic'];

/**
 * The built-in assets, drawn in code (map-art.js). w, h: their size in
 * squares when placed; shape: how they block (a circle or their rectangle);
 * layer: 0 lies on the floor (under walls), 1 stands on it, 2 is overhead
 * (tree tops, roofs); blocks: what they block when placed (the DM can change
 * it); light: what they light, in feet; glow: the colour of that light in the
 * picture ('tint': the asset's colour); tint: the colour the DM can change;
 * climb: 'stairs' or 'ladder' (a way up and down on the map, unless it leads to another map);
 * difficult: the ground under them is difficult terrain; tags: more words to
 * find them by.
 */
export const ASSETS = {
  // Nature
  tree: { name: 'Oak tree', group: 'Nature', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tint: '#3e6b2a', tags: 'leafy forest wood' },
  tree_big: { name: 'Great oak', group: 'Nature', w: 3, h: 3, shape: 'round', layer: 2, blocks: 'none', tint: '#3a6527', tags: 'large forest' },
  pine: { name: 'Pine tree', group: 'Nature', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tags: 'fir conifer evergreen forest' },
  pine_small: { name: 'Young pine', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 2, blocks: 'none', tags: 'fir conifer sapling' },
  birch: { name: 'Birch', group: 'Nature', w: 1.5, h: 1.5, shape: 'round', layer: 2, blocks: 'none', tags: 'tree' },
  willow: { name: 'Willow', group: 'Nature', w: 3, h: 3, shape: 'round', layer: 2, blocks: 'none', tags: 'tree weeping' },
  palm: { name: 'Palm tree', group: 'Nature', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tags: 'tropical desert oasis' },
  dead_tree: { name: 'Dead tree', group: 'Nature', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tags: 'bare spooky' },
  stump: { name: 'Tree stump', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low' },
  log: { name: 'Fallen log', group: 'Nature', w: 3, h: 1, shape: 'rect', layer: 1, blocks: 'low' },
  bush: { name: 'Bush', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tint: '#4c7d34', tags: 'shrub' },
  bush_berry: { name: 'Berry bush', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tint: '#b0263a', tags: 'shrub fruit' },
  flowers: { name: 'Flowers', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tint: '#e05a8a', tags: 'meadow garden' },
  tall_grass: { name: 'Undergrowth', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', difficult: true, tags: 'tall grass weeds' },
  ferns: { name: 'Ferns', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tags: 'plant forest' },
  reeds: { name: 'Reeds', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tags: 'bulrush marsh water' },
  mushrooms: { name: 'Mushrooms', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tint: '#c0392b', tags: 'toadstool fungi' },
  giant_mushroom: { name: 'Giant mushroom', group: 'Nature', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tint: '#8e44ad', tags: 'fungi underdark' },
  lily_pads: { name: 'Lily pads', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tags: 'pond water' },
  vines: { name: 'Creeping vines', group: 'Nature', w: 2, h: 1, shape: 'rect', layer: 0, blocks: 'none', tags: 'ivy' },
  cactus: { name: 'Cactus', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'desert' },
  crops: { name: 'Crops', group: 'Nature', w: 2, h: 2, shape: 'rect', layer: 1, blocks: 'none', tint: '#c9a640', tags: 'wheat field farm corn' },
  blossom_tree: { name: 'Blossom tree', group: 'Nature', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tint: '#f2a7c3', tags: 'cherry sakura pink spring' },
  jungle_tree: { name: 'Jungle tree', group: 'Nature', w: 3, h: 3, shape: 'round', layer: 2, blocks: 'none', tags: 'tropical canopy rainforest' },
  snowy_pine: { name: 'Snowy pine', group: 'Nature', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tags: 'winter snow fir' },
  bamboo: { name: 'Bamboo', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'cane grove' },
  hedge: { name: 'Hedge', group: 'Nature', w: 3, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'bush border garden' },
  thorns: { name: 'Thorn bush', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', difficult: true, tags: 'brambles briar' },
  roots: { name: 'Tree roots', group: 'Nature', w: 2, h: 2, shape: 'round', layer: 0, blocks: 'none', difficult: true, tags: 'gnarled' },
  hollow_log: { name: 'Hollow log', group: 'Nature', w: 3, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'log tunnel' },
  seaweed: { name: 'Seaweed', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tags: 'kelp sea beach' },
  coral: { name: 'Coral', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tint: '#e8705a', tags: 'reef sea' },
  shells: { name: 'Shells', group: 'Nature', w: 0.6, h: 0.6, shape: 'round', layer: 0, blocks: 'none', tags: 'beach sea' },
  leaf_pile: { name: 'Fallen leaves', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tint: '#c8742a', tags: 'autumn' },
  snow_drift: { name: 'Snow drift', group: 'Nature', w: 2, h: 2, shape: 'round', layer: 0, blocks: 'none', difficult: true, tags: 'winter snow' },
  ice_block: { name: 'Ice block', group: 'Nature', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'frozen winter' },
  anthill: { name: 'Ant hill', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tags: 'mound termite' },
  animal_skull: { name: 'Animal skull', group: 'Nature', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tags: 'horns desert bones cow' },
  // Rocks and ground
  rock: { name: 'Rock', group: 'Rocks', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'stone' },
  rocks: { name: 'Stones', group: 'Rocks', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tags: 'pebbles' },
  boulder: { name: 'Boulder', group: 'Rocks', w: 2, h: 2, shape: 'round', layer: 1, blocks: 'wall', tags: 'stone rock' },
  outcrop: { name: 'Rock outcrop', group: 'Rocks', w: 3, h: 2, shape: 'rect', layer: 1, blocks: 'wall', tags: 'cliff formation' },
  stalagmite: { name: 'Stalagmite', group: 'Rocks', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'wall', tags: 'cave' },
  rubble: { name: 'Rubble', group: 'Rocks', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'none', difficult: true, tags: 'debris broken' },
  crater: { name: 'Crater', group: 'Rocks', w: 2, h: 2, shape: 'round', layer: 0, blocks: 'none', tags: 'hole' },
  puddle: { name: 'Puddle', group: 'Rocks', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tint: '#3d6f8f', tags: 'water' },
  bones: { name: 'Bones', group: 'Rocks', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tags: 'skeleton remains' },
  skull: { name: 'Skull', group: 'Rocks', w: 0.5, h: 0.5, shape: 'round', layer: 1, blocks: 'none', tags: 'bones' },
  blood: { name: 'Blood', group: 'Rocks', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tint: '#7a1010', tags: 'splatter stain' },
  crack: { name: 'Cracked floor', group: 'Rocks', w: 1, h: 1, shape: 'rect', layer: 0, blocks: 'none', tags: 'broken fissure' },
  web: { name: 'Cobweb', group: 'Rocks', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', difficult: true, tags: 'spider' },
  rock_pile: { name: 'Rock pile', group: 'Rocks', w: 2, h: 2, shape: 'round', layer: 1, blocks: 'low', difficult: true, tags: 'stones scree' },
  cairn: { name: 'Cairn', group: 'Rocks', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'stone pile marker' },
  cliff_edge: { name: 'Cliff edge', group: 'Rocks', w: 4, h: 1, shape: 'rect', layer: 1, blocks: 'wall', tags: 'ledge drop rock face' },
  stalactites: { name: 'Stalactites', group: 'Rocks', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tags: 'cave ceiling' },
  hot_spring: { name: 'Hot spring', group: 'Rocks', w: 2, h: 2, shape: 'round', layer: 0, blocks: 'none', tags: 'geyser steam pool' },
  cooling_lava: { name: 'Cooling lava', group: 'Rocks', w: 1.5, h: 1.5, shape: 'round', layer: 0, blocks: 'none', light: { bright: 0, dim: 5 }, glow: '#ff5a1a', tags: 'magma' },
  footprints: { name: 'Footprints', group: 'Rocks', w: 1, h: 2, shape: 'rect', layer: 0, blocks: 'none', tags: 'tracks trail' },
  scorch: { name: 'Scorch mark', group: 'Rocks', w: 2, h: 2, shape: 'round', layer: 0, blocks: 'none', tags: 'burn fire soot' },
  // Water
  bridge: { name: 'Wooden bridge', group: 'Water', w: 2, h: 4, shape: 'rect', layer: 0, blocks: 'none', tags: 'crossing planks' },
  bridge_stone: { name: 'Stone bridge', group: 'Water', w: 2, h: 4, shape: 'rect', layer: 0, blocks: 'none', tags: 'crossing arch' },
  dock: { name: 'Jetty', group: 'Water', w: 2, h: 4, shape: 'rect', layer: 0, blocks: 'none', tags: 'dock pier harbour' },
  waterfall: { name: 'Waterfall', group: 'Water', w: 2, h: 2, shape: 'rect', layer: 1, blocks: 'none', difficult: true, tags: 'falls cascade water' },
  rapids: { name: 'Rapids', group: 'Water', w: 2, h: 2, shape: 'rect', layer: 0, blocks: 'none', difficult: true, tags: 'white water foam' },
  whirlpool: { name: 'Whirlpool', group: 'Water', w: 3, h: 3, shape: 'round', layer: 0, blocks: 'none', difficult: true, tags: 'vortex maelstrom' },
  ice_hole: { name: 'Hole in the ice', group: 'Water', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tags: 'fishing frozen' },
  driftwood: { name: 'Driftwood', group: 'Water', w: 2, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'beach wood' },
  // Ships and boats
  rowboat: { name: 'Rowing boat', group: 'Ships', w: 1.2, h: 2.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'boat' },
  hull: { name: "Ship's deck", group: 'Ships', w: 6, h: 18, shape: 'rect', layer: 0, blocks: 'none', tags: 'ship hull deck galleon boat' },
  ship_small: { name: 'Sailing boat', group: 'Ships', w: 3, h: 8, shape: 'rect', layer: 0, blocks: 'none', tint: '#e8dcc0', tags: 'sloop cog vessel ship' },
  ship: { name: 'Sailing ship', group: 'Ships', w: 6, h: 16, shape: 'rect', layer: 0, blocks: 'none', tint: '#e8dcc0', tags: 'galleon caravel carrack vessel' },
  longship: { name: 'Longship', group: 'Ships', w: 3, h: 12, shape: 'rect', layer: 0, blocks: 'none', tint: '#b8432f', tags: 'viking raider boat' },
  mast: { name: 'Mast', group: 'Ships', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'wall', tags: 'ship pole' },
  sail: { name: 'Sail', group: 'Ships', w: 5, h: 2, shape: 'rect', layer: 2, blocks: 'none', tint: '#e8dcc0', tags: 'canvas ship yard' },
  helm: { name: "Ship's wheel", group: 'Ships', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'helm wheel steering' },
  anchor: { name: 'Anchor', group: 'Ships', w: 1, h: 1.5, shape: 'rect', layer: 0, blocks: 'none', tags: 'ship iron' },
  cannon: { name: 'Cannon', group: 'Ships', w: 1, h: 2, shape: 'rect', layer: 1, blocks: 'low', tags: 'gun ship artillery' },
  cannonballs: { name: 'Cannonballs', group: 'Ships', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tags: 'shot pile ammunition' },
  rope_coil: { name: 'Coil of rope', group: 'Ships', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tags: 'rope ship' },
  capstan: { name: 'Capstan', group: 'Ships', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'low', tags: 'winch windlass ship' },
  hatch: { name: 'Cargo hatch', group: 'Ships', w: 2, h: 2, shape: 'rect', layer: 0, blocks: 'none', tags: 'grate hold ship' },
  gangplank: { name: 'Gangplank', group: 'Ships', w: 1, h: 3, shape: 'rect', layer: 0, blocks: 'none', tags: 'plank boarding' },
  crows_nest: { name: "Crow's nest", group: 'Ships', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tags: 'lookout mast top' },
  fishing_net: { name: 'Fishing net', group: 'Ships', w: 2, h: 2, shape: 'round', layer: 0, blocks: 'none', tags: 'net fish' },
  lobster_pots: { name: 'Lobster pots', group: 'Ships', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'crab traps creels fishing' },
  fish_crate: { name: 'Crate of fish', group: 'Ships', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'catch market fishmonger' },
  sea_chest: { name: 'Sea chest', group: 'Ships', w: 1, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'chest trunk pirate' },
  buoy: { name: 'Buoy', group: 'Ships', w: 0.8, h: 0.8, shape: 'round', layer: 1, blocks: 'none', tint: '#c0392b', tags: 'float marker' },
  canoe: { name: 'Canoe', group: 'Ships', w: 0.8, h: 3, shape: 'rect', layer: 1, blocks: 'none', tags: 'boat kayak' },
  raft: { name: 'Raft', group: 'Ships', w: 2, h: 2, shape: 'rect', layer: 0, blocks: 'none', tags: 'logs float' },
  oars: { name: 'Oars', group: 'Ships', w: 0.5, h: 2.5, shape: 'rect', layer: 0, blocks: 'none', tags: 'paddles' },
  bollard: { name: 'Mooring post', group: 'Ships', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'low', tags: 'bollard dock' },
  // Camp and travel
  campfire: { name: 'Campfire', group: 'Camp', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', light: { bright: 20, dim: 20 }, glow: '#ffae42', tags: 'fire' },
  tent: { name: 'Tent', group: 'Camp', w: 2, h: 2, shape: 'rect', layer: 1, blocks: 'wall', tint: '#9a8a62', tags: 'camp' },
  pavilion: { name: 'Pavilion', group: 'Camp', w: 3, h: 3, shape: 'round', layer: 1, blocks: 'wall', tint: '#a33b3b', tags: 'tent large' },
  bedroll: { name: 'Bedroll', group: 'Camp', w: 0.8, h: 1.8, shape: 'rect', layer: 0, blocks: 'none', tint: '#5a6e3a', tags: 'sleeping camp' },
  cart: { name: 'Cart', group: 'Camp', w: 2.2, h: 1.3, shape: 'rect', layer: 1, blocks: 'low', tags: 'wagon barrow' },
  wagon: { name: 'Covered wagon', group: 'Camp', w: 3, h: 1.6, shape: 'rect', layer: 1, blocks: 'wall', tint: '#e2d6b5', tags: 'caravan' },
  hay_bale: { name: 'Hay bale', group: 'Camp', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'farm straw' },
  woodpile: { name: 'Woodpile', group: 'Camp', w: 1.5, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'logs firewood' },
  sack: { name: 'Sack', group: 'Camp', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', tags: 'bag grain' },
  sacks: { name: 'Sacks', group: 'Camp', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'bags grain' },
  cooking_pot: { name: 'Cooking pot', group: 'Camp', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', light: { bright: 10, dim: 10 }, glow: '#ff9a3c', tags: 'fire stew' },
  signpost: { name: 'Signpost', group: 'Camp', w: 0.8, h: 0.8, shape: 'round', layer: 1, blocks: 'none', tags: 'sign crossroads' },
  lamp_post: { name: 'Lamp post', group: 'Camp', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', light: { bright: 15, dim: 30 }, glow: '#ffd27a', tags: 'street light lantern' },
  trough: { name: 'Trough', group: 'Camp', w: 2, h: 0.8, shape: 'rect', layer: 1, blocks: 'low', tags: 'water horse' },
  target: { name: 'Archery target', group: 'Camp', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'butt practice' },
  dummy: { name: 'Training dummy', group: 'Camp', w: 0.8, h: 0.8, shape: 'round', layer: 1, blocks: 'low', tags: 'practice' },
  yurt: { name: 'Round tent', group: 'Camp', w: 3, h: 3, shape: 'round', layer: 1, blocks: 'wall', tint: '#cfc3a5', tags: 'yurt' },
  command_tent: { name: 'Command tent', group: 'Camp', w: 3, h: 4, shape: 'rect', layer: 1, blocks: 'wall', tint: '#7a2a2a', tags: 'large tent officer' },
  barricade: { name: 'Barricade', group: 'Camp', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'stakes spikes cheval de frise' },
  standard: { name: 'Standard', group: 'Camp', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', tint: '#2a4a8a', tags: 'flag banner pole' },
  ballista: { name: 'Ballista', group: 'Camp', w: 2, h: 2, shape: 'rect', layer: 1, blocks: 'low', tags: 'siege bolt crossbow' },
  catapult: { name: 'Catapult', group: 'Camp', w: 3, h: 3, shape: 'rect', layer: 1, blocks: 'low', tags: 'siege trebuchet mangonel' },
  carriage: { name: 'Carriage', group: 'Camp', w: 3.5, h: 2, shape: 'rect', layer: 1, blocks: 'wall', tint: '#2f3f5a', tags: 'coach stagecoach' },
  quiver: { name: 'Quiver and arrows', group: 'Camp', w: 0.6, h: 0.8, shape: 'rect', layer: 1, blocks: 'none', tags: 'arrows bow archery' },
  cold_fire: { name: 'Cold campfire', group: 'Camp', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tags: 'ashes embers burnt' },
  drying_rack: { name: 'Drying rack', group: 'Camp', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'fish meat hides tanning' },
  lean_to: { name: 'Lean-to', group: 'Camp', w: 2, h: 2, shape: 'rect', layer: 2, blocks: 'none', tags: 'shelter tarp' },
  // Town
  market_stall: { name: 'Market stall', group: 'Town', w: 2, h: 1.5, shape: 'rect', layer: 1, blocks: 'low', tint: '#b8432f', tags: 'shop awning trader' },
  fountain: { name: 'Fountain', group: 'Town', w: 3, h: 3, shape: 'round', layer: 1, blocks: 'low', tags: 'water square' },
  statue: { name: 'Statue', group: 'Town', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'wall', tags: 'monument' },
  bench: { name: 'Bench', group: 'Town', w: 2, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'seat pew' },
  well: { name: 'Well', group: 'Town', w: 2, h: 2, shape: 'round', layer: 1, blocks: 'low', tags: 'water' },
  notice_board: { name: 'Notice board', group: 'Town', w: 1.5, h: 0.5, shape: 'rect', layer: 1, blocks: 'low', tags: 'bounty quest' },
  anvil: { name: 'Anvil', group: 'Town', w: 1, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'smithy blacksmith' },
  forge: { name: 'Forge', group: 'Town', w: 2, h: 2, shape: 'rect', layer: 1, blocks: 'low', light: { bright: 10, dim: 10 }, glow: '#ff7b2a', tags: 'smithy blacksmith fire' },
  gallows: { name: 'Gallows', group: 'Town', w: 2, h: 2, shape: 'rect', layer: 1, blocks: 'low', tags: 'execution' },
  wheelbarrow: { name: 'Wheelbarrow', group: 'Town', w: 0.8, h: 1.4, shape: 'rect', layer: 1, blocks: 'none', tags: 'barrow' },
  roof_tile: { name: 'Tiled roof', group: 'Town', w: 4, h: 3, shape: 'rect', layer: 2, blocks: 'none', tint: '#8e3b2e', tags: 'house building rooftop slate' },
  roof_thatch: { name: 'Thatched roof', group: 'Town', w: 4, h: 3, shape: 'rect', layer: 2, blocks: 'none', tags: 'house cottage rooftop' },
  roof_tower: { name: 'Tower roof', group: 'Town', w: 3, h: 3, shape: 'round', layer: 2, blocks: 'none', tint: '#4a5568', tags: 'turret cone' },
  stocks: { name: 'Stocks', group: 'Town', w: 2, h: 0.6, shape: 'rect', layer: 1, blocks: 'low', tags: 'pillory punishment' },
  planter: { name: 'Flower box', group: 'Town', w: 1, h: 0.5, shape: 'rect', layer: 1, blocks: 'none', tint: '#e05a8a', tags: 'planter window box' },
  crate_stack: { name: 'Stacked crates', group: 'Town', w: 2, h: 2, shape: 'rect', layer: 1, blocks: 'wall', tags: 'boxes warehouse cargo' },
  barrel_stack: { name: 'Row of barrels', group: 'Town', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'casks' },
  chimney: { name: 'Chimney', group: 'Town', w: 1, h: 1, shape: 'rect', layer: 2, blocks: 'none', tags: 'roof smoke' },
  awning: { name: 'Awning', group: 'Town', w: 3, h: 1.5, shape: 'rect', layer: 2, blocks: 'none', tint: '#2a6a8a', tags: 'canopy shop shade' },
  cloth_bolts: { name: 'Bolts of cloth', group: 'Town', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'none', tags: 'fabric market tailor' },
  pottery: { name: 'Pottery', group: 'Town', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tags: 'pots market jars' },
  horse_statue: { name: 'Horse statue', group: 'Town', w: 2, h: 3, shape: 'rect', layer: 1, blocks: 'wall', tags: 'equestrian monument rider' },
  lantern: { name: 'Lantern', group: 'Town', w: 0.5, h: 0.5, shape: 'round', layer: 1, blocks: 'none', light: { bright: 15, dim: 15 }, glow: '#ffd27a', tags: 'lamp light' },
  fire_barrel: { name: 'Fire barrel', group: 'Town', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', light: { bright: 10, dim: 10 }, glow: '#ffae42', tags: 'brazier street warmth' },
  handcart: { name: 'Handcart', group: 'Town', w: 1.2, h: 2, shape: 'rect', layer: 1, blocks: 'low', tags: 'pushcart vendor barrow' },
  roof_flat: { name: 'Flat roof', group: 'Town', w: 4, h: 3, shape: 'rect', layer: 2, blocks: 'none', tint: '#8a7a62', tags: 'terrace rooftop house' },
  // Farm
  haystack: { name: 'Haystack', group: 'Farm', w: 2, h: 2, shape: 'round', layer: 1, blocks: 'wall', tags: 'hay straw rick' },
  scarecrow: { name: 'Scarecrow', group: 'Farm', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tags: 'field crows' },
  beehives: { name: 'Beehives', group: 'Farm', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'bees skep honey' },
  chicken_coop: { name: 'Chicken coop', group: 'Farm', w: 2, h: 1.5, shape: 'rect', layer: 1, blocks: 'wall', tags: 'hen house' },
  kennel: { name: 'Kennel', group: 'Farm', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'dog house' },
  vegetable_patch: { name: 'Vegetable patch', group: 'Farm', w: 2, h: 2, shape: 'rect', layer: 0, blocks: 'none', difficult: true, tags: 'garden cabbages carrots allotment' },
  pumpkins: { name: 'Pumpkins', group: 'Farm', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tags: 'squash patch harvest' },
  sunflowers: { name: 'Sunflowers', group: 'Farm', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tags: 'flowers field' },
  orchard_tree: { name: 'Apple tree', group: 'Farm', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tint: '#4b7a2e', tags: 'fruit orchard' },
  vineyard: { name: 'Grapevines', group: 'Farm', w: 1, h: 3, shape: 'rect', layer: 1, blocks: 'low', tags: 'vines wine trellis grapes' },
  windmill: { name: 'Windmill', group: 'Farm', w: 4, h: 4, shape: 'round', layer: 2, blocks: 'none', tags: 'mill sails' },
  water_wheel: { name: 'Water wheel', group: 'Farm', w: 1, h: 3, shape: 'rect', layer: 1, blocks: 'wall', tags: 'mill river' },
  millstone: { name: 'Millstone', group: 'Farm', w: 2, h: 2, shape: 'round', layer: 1, blocks: 'low', tags: 'grindstone mill flour' },
  plough: { name: 'Plough', group: 'Farm', w: 1, h: 2, shape: 'rect', layer: 1, blocks: 'none', tags: 'plow farm' },
  milk_churn: { name: 'Milk churn', group: 'Farm', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', tags: 'butter dairy' },
  water_pump: { name: 'Water pump', group: 'Farm', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'well spout' },
  bucket: { name: 'Bucket', group: 'Farm', w: 0.5, h: 0.5, shape: 'round', layer: 1, blocks: 'none', tags: 'pail water' },
  saddle: { name: 'Saddle', group: 'Farm', w: 0.8, h: 0.8, shape: 'rect', layer: 1, blocks: 'none', tags: 'horse tack' },
  hitching_post: { name: 'Hitching post', group: 'Farm', w: 2, h: 0.4, shape: 'rect', layer: 1, blocks: 'low', tags: 'horse rail' },
  chopping_block: { name: 'Chopping block', group: 'Farm', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'axe stump firewood' },
  manure: { name: 'Manure heap', group: 'Farm', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'none', difficult: true, tags: 'dung compost muck' },
  washing_line: { name: 'Washing line', group: 'Farm', w: 3, h: 0.6, shape: 'rect', layer: 2, blocks: 'none', tags: 'laundry clothes' },
  privy: { name: 'Privy', group: 'Farm', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'wall', tags: 'outhouse toilet latrine' },
  // Furniture
  table: { name: 'Table', group: 'Furniture', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'none' },
  table_long: { name: 'Long table', group: 'Furniture', w: 4, h: 1, shape: 'rect', layer: 1, blocks: 'none', tags: 'feast banquet' },
  round_table: { name: 'Round table', group: 'Furniture', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'none' },
  side_table: { name: 'Small table', group: 'Furniture', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'none' },
  chair: { name: 'Chair', group: 'Furniture', w: 0.6, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'seat' },
  stool: { name: 'Stool', group: 'Furniture', w: 0.5, h: 0.5, shape: 'round', layer: 1, blocks: 'none', tags: 'seat' },
  armchair: { name: 'Armchair', group: 'Furniture', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'none', tint: '#6b2d3a', tags: 'seat' },
  throne: { name: 'Throne', group: 'Furniture', w: 1.2, h: 1.2, shape: 'rect', layer: 1, blocks: 'none', tint: '#8b1e2d', tags: 'king seat' },
  bed: { name: 'Bed', group: 'Furniture', w: 1, h: 2, shape: 'rect', layer: 1, blocks: 'none', tint: '#7b2f34' },
  bed_double: { name: 'Double bed', group: 'Furniture', w: 2, h: 2, shape: 'rect', layer: 1, blocks: 'none', tint: '#2f4f7b' },
  chest: { name: 'Chest', group: 'Furniture', w: 1, h: 0.7, shape: 'rect', layer: 1, blocks: 'none', tags: 'treasure box' },
  wardrobe: { name: 'Wardrobe', group: 'Furniture', w: 1.5, h: 0.7, shape: 'rect', layer: 1, blocks: 'low', tags: 'cupboard closet' },
  bookshelf: { name: 'Bookshelf', group: 'Furniture', w: 2, h: 0.5, shape: 'rect', layer: 1, blocks: 'low', tags: 'books library' },
  shelves: { name: 'Shelves', group: 'Furniture', w: 2, h: 0.5, shape: 'rect', layer: 1, blocks: 'low', tags: 'pantry jars storage' },
  desk: { name: 'Desk', group: 'Furniture', w: 1.5, h: 0.8, shape: 'rect', layer: 1, blocks: 'none', tags: 'study writing' },
  rug: { name: 'Rug', group: 'Furniture', w: 3, h: 2, shape: 'rect', layer: 0, blocks: 'none', tint: '#a54a3c', tags: 'carpet' },
  rug_round: { name: 'Round rug', group: 'Furniture', w: 2, h: 2, shape: 'round', layer: 0, blocks: 'none', tint: '#3c5a8a', tags: 'carpet' },
  fireplace: { name: 'Fireplace', group: 'Furniture', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'low', light: { bright: 20, dim: 20 }, glow: '#ff9a3c', tags: 'hearth fire' },
  bathtub: { name: 'Bathtub', group: 'Furniture', w: 1, h: 2, shape: 'rect', layer: 1, blocks: 'low', tags: 'bath' },
  candle: { name: 'Candles', group: 'Furniture', w: 0.4, h: 0.4, shape: 'round', layer: 1, blocks: 'none', light: { bright: 5, dim: 5 }, glow: '#ffd27a', tags: 'light' },
  candelabra: { name: 'Candelabra', group: 'Furniture', w: 0.7, h: 0.7, shape: 'round', layer: 1, blocks: 'none', light: { bright: 10, dim: 10 }, glow: '#ffd27a', tags: 'candles light' },
  chandelier: { name: 'Chandelier', group: 'Furniture', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', light: { bright: 20, dim: 20 }, glow: '#ffd27a', tags: 'candles light ceiling' },
  plant: { name: 'Potted plant', group: 'Furniture', w: 0.8, h: 0.8, shape: 'round', layer: 1, blocks: 'none', tags: 'pot fern' },
  weapon_rack: { name: 'Weapon rack', group: 'Furniture', w: 2, h: 0.5, shape: 'rect', layer: 1, blocks: 'low', tags: 'armoury swords spears' },
  armour_stand: { name: 'Armour stand', group: 'Furniture', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'armor armoury' },
  crate: { name: 'Crate', group: 'Furniture', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'box storage' },
  barrel: { name: 'Barrel', group: 'Furniture', w: 0.8, h: 0.8, shape: 'round', layer: 1, blocks: 'low', tags: 'storage' },
  bunk_bed: { name: 'Bunk bed', group: 'Furniture', w: 1, h: 2, shape: 'rect', layer: 1, blocks: 'none', tint: '#5a6e8a', tags: 'barracks dormitory' },
  cot: { name: 'Cot', group: 'Furniture', w: 0.8, h: 2, shape: 'rect', layer: 1, blocks: 'none', tags: 'bed camp folding' },
  nightstand: { name: 'Bedside table', group: 'Furniture', w: 0.6, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'nightstand' },
  dresser: { name: 'Chest of drawers', group: 'Furniture', w: 1.5, h: 0.6, shape: 'rect', layer: 1, blocks: 'low', tags: 'dresser drawers' },
  mirror: { name: 'Standing mirror', group: 'Furniture', w: 1, h: 0.5, shape: 'rect', layer: 1, blocks: 'none', tags: 'looking glass' },
  cradle: { name: 'Cradle', group: 'Furniture', w: 0.7, h: 1, shape: 'rect', layer: 1, blocks: 'none', tags: 'baby crib' },
  trunk: { name: 'Trunk', group: 'Furniture', w: 1.2, h: 0.7, shape: 'rect', layer: 1, blocks: 'none', tags: 'luggage chest' },
  screen: { name: 'Folding screen', group: 'Furniture', w: 2, h: 0.4, shape: 'rect', layer: 1, blocks: 'low', tags: 'partition' },
  sofa: { name: 'Sofa', group: 'Furniture', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'none', tint: '#2f5a4a', tags: 'couch settee' },
  harpsichord: { name: 'Harpsichord', group: 'Furniture', w: 2, h: 1.2, shape: 'rect', layer: 1, blocks: 'none', tags: 'piano music instrument' },
  harp: { name: 'Harp', group: 'Furniture', w: 0.8, h: 1, shape: 'rect', layer: 1, blocks: 'none', tags: 'music instrument' },
  globe: { name: 'Globe', group: 'Furniture', w: 0.8, h: 0.8, shape: 'round', layer: 1, blocks: 'none', tags: 'study map world' },
  telescope: { name: 'Telescope', group: 'Furniture', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tags: 'observatory stars spyglass' },
  map_table: { name: 'Map table', group: 'Furniture', w: 2, h: 1.5, shape: 'rect', layer: 1, blocks: 'none', tags: 'war table charts strategy' },
  book_pile: { name: 'Pile of books', group: 'Furniture', w: 0.8, h: 0.8, shape: 'round', layer: 1, blocks: 'none', tags: 'books stack tomes' },
  scroll_rack: { name: 'Scroll rack', group: 'Furniture', w: 1.5, h: 0.5, shape: 'rect', layer: 1, blocks: 'low', tags: 'pigeonholes scrolls library' },
  coat_stand: { name: 'Coat stand', group: 'Furniture', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', tags: 'hat stand cloaks' },
  washstand: { name: 'Washstand', group: 'Furniture', w: 0.8, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'basin jug bowl' },
  clock: { name: 'Grandfather clock', group: 'Furniture', w: 0.8, h: 0.5, shape: 'rect', layer: 1, blocks: 'low', tags: 'clock' },
  card_table: { name: 'Card table', group: 'Furniture', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'none', tags: 'gambling dice games' },
  chess_table: { name: 'Chess table', group: 'Furniture', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'none', tags: 'game board' },
  tapestry: { name: 'Tapestry', group: 'Furniture', w: 3, h: 0.3, shape: 'rect', layer: 1, blocks: 'none', tint: '#7a2a3a', tags: 'hanging wall cloth' },
  banner: { name: 'Banner', group: 'Furniture', w: 1, h: 0.3, shape: 'rect', layer: 1, blocks: 'none', tint: '#2a4a8a', tags: 'flag heraldry wall hanging' },
  // Kitchen and tavern
  bar: { name: 'Bar counter', group: 'Tavern', w: 3, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'inn counter' },
  keg: { name: 'Keg', group: 'Tavern', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'ale beer cask barrel' },
  stove: { name: 'Cooking range', group: 'Tavern', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'low', light: { bright: 10, dim: 10 }, glow: '#ff8a3c', tags: 'kitchen oven' },
  cauldron: { name: 'Cauldron', group: 'Tavern', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tint: '#5fae4a', tags: 'pot brew witch' },
  meal: { name: 'Meal', group: 'Tavern', w: 1, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'food plates feast' },
  tankards: { name: 'Tankards', group: 'Tavern', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', tags: 'mugs ale' },
  bottles: { name: 'Bottles', group: 'Tavern', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', tags: 'wine' },
  spit: { name: 'Spit roast', group: 'Tavern', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'none', light: { bright: 15, dim: 15 }, glow: '#ff9a3c', tags: 'fire roast' },
  produce: { name: 'Crate of produce', group: 'Tavern', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', tint: '#c0392b', tags: 'apples food market' },
  oven: { name: 'Bread oven', group: 'Tavern', w: 2, h: 2, shape: 'round', layer: 1, blocks: 'wall', light: { bright: 5, dim: 5 }, glow: '#ff8a3c', tags: 'bakery kiln dome' },
  worktop: { name: 'Worktop', group: 'Tavern', w: 2, h: 0.8, shape: 'rect', layer: 1, blocks: 'low', tags: 'counter kitchen butcher block' },
  sink: { name: 'Sink', group: 'Tavern', w: 1, h: 0.8, shape: 'rect', layer: 1, blocks: 'low', tags: 'basin washing' },
  water_butt: { name: 'Water butt', group: 'Tavern', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'rain barrel water' },
  pots_pans: { name: 'Pots and pans', group: 'Tavern', w: 1, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'cookware kitchen' },
  hanging_meat: { name: 'Hanging meat', group: 'Tavern', w: 1, h: 1, shape: 'round', layer: 2, blocks: 'none', tags: 'hams sausages smokehouse butcher hooks' },
  herbs: { name: 'Drying herbs', group: 'Tavern', w: 1, h: 1, shape: 'round', layer: 2, blocks: 'none', tags: 'bunches hanging garlic' },
  bread: { name: 'Bread basket', group: 'Tavern', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', tags: 'loaves bakery food' },
  cheese: { name: 'Cheese wheels', group: 'Tavern', w: 0.8, h: 0.8, shape: 'round', layer: 1, blocks: 'none', tags: 'food dairy' },
  wine_rack: { name: 'Wine rack', group: 'Tavern', w: 2, h: 0.6, shape: 'rect', layer: 1, blocks: 'low', tags: 'bottles cellar' },
  cask_rack: { name: 'Casks on a rack', group: 'Tavern', w: 3, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'barrels ale cellar' },
  dishes: { name: 'Dishes', group: 'Tavern', w: 0.8, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'plates crockery washing up' },
  jugs: { name: 'Jugs and cups', group: 'Tavern', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', tags: 'pitcher mugs' },
  cutting_board: { name: 'Chopping board', group: 'Tavern', w: 0.8, h: 0.5, shape: 'rect', layer: 1, blocks: 'none', tags: 'knife vegetables' },
  grill: { name: 'Grill', group: 'Tavern', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', light: { bright: 5, dim: 10 }, glow: '#ff7b2a', tags: 'griddle coals barbecue' },
  hanging_sign: { name: 'Hanging sign', group: 'Tavern', w: 1, h: 0.4, shape: 'rect', layer: 2, blocks: 'none', tint: '#b8432f', tags: 'inn sign shop' },
  stage: { name: 'Stage', group: 'Tavern', w: 4, h: 2, shape: 'rect', layer: 0, blocks: 'none', tags: 'platform bard performance' },
  // Temple
  pew: { name: 'Pew', group: 'Temple', w: 3, h: 0.8, shape: 'rect', layer: 1, blocks: 'none', tags: 'bench church' },
  font: { name: 'Font', group: 'Temple', w: 1.2, h: 1.2, shape: 'round', layer: 1, blocks: 'low', tags: 'holy water basin baptism' },
  shrine: { name: 'Shrine', group: 'Temple', w: 1.5, h: 1, shape: 'rect', layer: 1, blocks: 'low', light: { bright: 5, dim: 5 }, glow: '#ffd27a', tags: 'altar offerings small wayside' },
  prayer_mat: { name: 'Prayer mat', group: 'Temple', w: 1, h: 1.5, shape: 'rect', layer: 0, blocks: 'none', tint: '#8a2a2a', tags: 'rug kneel' },
  incense: { name: 'Incense burner', group: 'Temple', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', tags: 'censer smoke' },
  bell: { name: 'Great bell', group: 'Temple', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tags: 'tower bell bronze' },
  god_statue: { name: 'Statue of a god', group: 'Temple', w: 2, h: 2, shape: 'rect', layer: 1, blocks: 'wall', tags: 'deity idol shrine' },
  dais: { name: 'Dais', group: 'Temple', w: 4, h: 3, shape: 'rect', layer: 0, blocks: 'none', tags: 'platform steps throne' },
  carpet_runner: { name: 'Carpet runner', group: 'Temple', w: 1.5, h: 6, shape: 'rect', layer: 0, blocks: 'none', tint: '#8b1e2d', tags: 'red carpet aisle' },
  throne_grand: { name: 'Great throne', group: 'Temple', w: 2, h: 2, shape: 'rect', layer: 1, blocks: 'low', tint: '#d4a72c', tags: 'king queen seat gold' },
  candle_stand: { name: 'Candle stand', group: 'Temple', w: 1, h: 0.5, shape: 'rect', layer: 1, blocks: 'none', light: { bright: 5, dim: 10 }, glow: '#ffd27a', tags: 'votive candles rack' },
  offering_bowl: { name: 'Offering bowl', group: 'Temple', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', tags: 'tribute coins' },
  holy_symbol: { name: 'Holy symbol', group: 'Temple', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tint: '#d4a72c', tags: 'sun mosaic floor emblem' },
  stained_light: { name: 'Coloured light', group: 'Temple', w: 2, h: 2, shape: 'rect', layer: 0, blocks: 'none', tags: 'stained glass window light' },
  organ: { name: 'Pipe organ', group: 'Temple', w: 3, h: 1, shape: 'rect', layer: 1, blocks: 'wall', tags: 'music church' },
  reliquary: { name: 'Reliquary', group: 'Temple', w: 0.8, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'relic box saint' },
  angel_statue: { name: 'Angel statue', group: 'Temple', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'wall', tags: 'winged statue' },
  effigy_tomb: { name: 'Effigy tomb', group: 'Temple', w: 1.5, h: 2.5, shape: 'rect', layer: 1, blocks: 'low', tags: 'knight tomb crypt' },
  // Dungeon
  floor_round: { name: 'Round floor', group: 'Dungeon', w: 6, h: 6, shape: 'round', layer: 0, blocks: 'none', tint: '#8f8a80', tags: 'tower round room paving flagstones circle' },
  pillar: { name: 'Pillar', group: 'Dungeon', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'wall', tags: 'column' },
  pillar_square: { name: 'Square pillar', group: 'Dungeon', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'wall', tags: 'column' },
  pillar_broken: { name: 'Fallen pillar', group: 'Dungeon', w: 2.5, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'column ruin' },
  altar: { name: 'Altar', group: 'Dungeon', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'shrine temple' },
  stairs: { name: 'Stairs up', group: 'Dungeon', w: 2, h: 2, shape: 'rect', layer: 0, blocks: 'none', climb: 'stairs', tags: 'steps' },
  stairs_down: { name: 'Stairs down', group: 'Dungeon', w: 2, h: 2, shape: 'rect', layer: 0, blocks: 'none', climb: 'stairs', tags: 'steps' },
  stairs_spiral: { name: 'Spiral stairs', group: 'Dungeon', w: 2, h: 2, shape: 'round', layer: 0, blocks: 'none', climb: 'stairs', tags: 'steps tower' },
  ladder: { name: 'Ladder', group: 'Dungeon', w: 0.6, h: 1.6, shape: 'rect', layer: 0, blocks: 'none', climb: 'ladder' },
  trapdoor: { name: 'Trapdoor', group: 'Dungeon', w: 1, h: 1, shape: 'rect', layer: 0, blocks: 'none', tags: 'hatch' },
  pit: { name: 'Pit', group: 'Dungeon', w: 2, h: 2, shape: 'rect', layer: 0, blocks: 'none', tags: 'hole trap' },
  spike_pit: { name: 'Spiked pit', group: 'Dungeon', w: 2, h: 2, shape: 'rect', layer: 0, blocks: 'none', tags: 'trap' },
  grate: { name: 'Floor grate', group: 'Dungeon', w: 1, h: 1, shape: 'rect', layer: 0, blocks: 'none', tags: 'drain sewer' },
  brazier: { name: 'Brazier', group: 'Dungeon', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', light: { bright: 10, dim: 10 }, glow: '#ff9a3c', tags: 'fire' },
  torch: { name: 'Wall torch', group: 'Dungeon', w: 0.5, h: 0.5, shape: 'round', layer: 1, blocks: 'none', light: { bright: 20, dim: 20 }, glow: '#ffae42', tags: 'sconce fire light' },
  coffin: { name: 'Coffin', group: 'Dungeon', w: 1, h: 2, shape: 'rect', layer: 1, blocks: 'low', tags: 'crypt grave' },
  sarcophagus: { name: 'Sarcophagus', group: 'Dungeon', w: 1.4, h: 2.4, shape: 'rect', layer: 1, blocks: 'low', tags: 'tomb crypt' },
  tombstone: { name: 'Gravestone', group: 'Dungeon', w: 1, h: 0.5, shape: 'rect', layer: 1, blocks: 'low', tags: 'grave cemetery headstone' },
  grave: { name: 'Grave', group: 'Dungeon', w: 1, h: 2, shape: 'rect', layer: 0, blocks: 'none', tags: 'cemetery burial' },
  chains: { name: 'Hanging chains', group: 'Dungeon', w: 1, h: 1, shape: 'round', layer: 2, blocks: 'none', tags: 'prison torture' },
  shackles: { name: 'Shackles', group: 'Dungeon', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tags: 'prison chains' },
  cage: { name: 'Cage', group: 'Dungeon', w: 2, h: 2, shape: 'rect', layer: 1, blocks: 'low', tags: 'prison cell' },
  lever: { name: 'Lever', group: 'Dungeon', w: 0.6, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'switch trap' },
  pressure_plate: { name: 'Pressure plate', group: 'Dungeon', w: 1, h: 1, shape: 'rect', layer: 0, blocks: 'none', tags: 'trap' },
  mine_cart: { name: 'Mine cart', group: 'Dungeon', w: 1.2, h: 1.8, shape: 'rect', layer: 1, blocks: 'low', tags: 'minecart ore' },
  rails: { name: 'Mine rails', group: 'Dungeon', w: 1, h: 3, shape: 'rect', layer: 0, blocks: 'none', tags: 'track' },
  iron_maiden: { name: 'Iron maiden', group: 'Dungeon', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'torture' },
  torture_rack: { name: 'Torture rack', group: 'Dungeon', w: 1, h: 2.5, shape: 'rect', layer: 1, blocks: 'low', tags: 'torture' },
  portcullis: { name: 'Portcullis', group: 'Dungeon', w: 2, h: 0.4, shape: 'rect', layer: 1, blocks: 'wall', tags: 'gate bars' },
  skeleton: { name: 'Skeleton', group: 'Dungeon', w: 1, h: 2, shape: 'rect', layer: 0, blocks: 'none', tags: 'remains bones body' },
  skull_pile: { name: 'Pile of skulls', group: 'Dungeon', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'low', tags: 'ossuary bones' },
  slime: { name: 'Slime', group: 'Dungeon', w: 1.5, h: 1.5, shape: 'round', layer: 0, blocks: 'none', tint: '#6ad13a', difficult: true, tags: 'ooze puddle acid' },
  egg_nest: { name: 'Nest of eggs', group: 'Dungeon', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'none', tint: '#c8a060', tags: 'dragon eggs' },
  egg_sacs: { name: 'Spider egg sacs', group: 'Dungeon', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tags: 'cocoon web' },
  glow_fungus: { name: 'Glowing fungus', group: 'Dungeon', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tint: '#3ad1b0', light: { bright: 0, dim: 10 }, glow: 'tint', tags: 'underdark mushrooms' },
  mausoleum: { name: 'Mausoleum', group: 'Dungeon', w: 3, h: 4, shape: 'rect', layer: 1, blocks: 'wall', tags: 'tomb crypt graveyard' },
  grave_cross: { name: 'Cross gravestone', group: 'Dungeon', w: 1, h: 0.5, shape: 'rect', layer: 1, blocks: 'low', tags: 'grave cemetery' },
  mine_support: { name: 'Mine supports', group: 'Dungeon', w: 3, h: 1, shape: 'rect', layer: 2, blocks: 'none', tags: 'timber beams tunnel' },
  ore: { name: 'Ore pile', group: 'Dungeon', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'none', difficult: true, tags: 'rocks mining iron gold' },
  pickaxe: { name: 'Pickaxe', group: 'Dungeon', w: 0.8, h: 0.8, shape: 'rect', layer: 0, blocks: 'none', tags: 'tools mining' },
  sewer_pipe: { name: 'Sewer pipe', group: 'Dungeon', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', tags: 'drain outlet' },
  statue_broken: { name: 'Broken statue', group: 'Dungeon', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'low', tags: 'ruin rubble' },
  // Traps
  bear_trap: { name: 'Bear trap', group: 'Traps', w: 0.8, h: 0.8, shape: 'round', layer: 0, blocks: 'none', tags: 'snare jaws' },
  floor_spikes: { name: 'Floor spikes', group: 'Traps', w: 1, h: 1, shape: 'rect', layer: 0, blocks: 'none', difficult: true, tags: 'trap spiked' },
  blade_trap: { name: 'Swinging blade', group: 'Traps', w: 3, h: 0.5, shape: 'rect', layer: 2, blocks: 'none', tags: 'pendulum trap scythe' },
  dart_holes: { name: 'Dart holes', group: 'Traps', w: 1, h: 1, shape: 'rect', layer: 0, blocks: 'none', tags: 'trap wall darts' },
  tripwire: { name: 'Tripwire', group: 'Traps', w: 2, h: 0.2, shape: 'rect', layer: 0, blocks: 'none', tags: 'trap wire string' },
  floor_hole: { name: 'Hole in the floor', group: 'Traps', w: 1.5, h: 1.5, shape: 'round', layer: 0, blocks: 'none', tags: 'broken pit collapse' },
  glyph: { name: 'Glyph of warding', group: 'Traps', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tint: '#ff5a3a', light: { bright: 0, dim: 5 }, glow: 'tint', tags: 'trap rune magic' },
  fire_vent: { name: 'Fire vent', group: 'Traps', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tags: 'trap flames burner' },
  net_trap: { name: 'Net trap', group: 'Traps', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tags: 'trap rope net hanging' },
  caltrops: { name: 'Caltrops', group: 'Traps', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', difficult: true, tags: 'spikes trap' },
  gas_vent: { name: 'Gas vent', group: 'Traps', w: 1, h: 1, shape: 'round', layer: 0, blocks: 'none', tint: '#8ac43a', tags: 'trap poison cloud' },
  // Treasure
  treasure: { name: 'Treasure pile', group: 'Treasure', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'none', tags: 'gold hoard coins' },
  coins: { name: 'Coins', group: 'Treasure', w: 0.6, h: 0.6, shape: 'round', layer: 0, blocks: 'none', tags: 'gold money' },
  hoard: { name: 'Dragon hoard', group: 'Treasure', w: 3, h: 3, shape: 'round', layer: 1, blocks: 'none', tags: 'gold treasure pile big' },
  gold_bars: { name: 'Gold bars', group: 'Treasure', w: 1, h: 0.6, shape: 'rect', layer: 1, blocks: 'none', tags: 'ingots treasure' },
  gems: { name: 'Gems', group: 'Treasure', w: 0.6, h: 0.6, shape: 'round', layer: 0, blocks: 'none', tags: 'jewels treasure rubies emeralds' },
  crown: { name: 'Crown', group: 'Treasure', w: 0.5, h: 0.5, shape: 'round', layer: 1, blocks: 'none', tags: 'treasure royal' },
  chest_open: { name: 'Open chest', group: 'Treasure', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'none', tags: 'treasure loot' },
  mimic: { name: 'Mimic', group: 'Treasure', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'none', tags: 'chest monster teeth' },
  weapon_pile: { name: 'Weapons pile', group: 'Treasure', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'none', tags: 'swords loot armoury' },
  urn: { name: 'Urn', group: 'Treasure', w: 0.7, h: 0.7, shape: 'round', layer: 1, blocks: 'low', tags: 'vase amphora pot' },
  amphorae: { name: 'Amphorae', group: 'Treasure', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'pots jars storage wine oil' },
  // Magic
  magic_circle: { name: 'Magic circle', group: 'Magic', w: 3, h: 3, shape: 'round', layer: 0, blocks: 'none', tint: '#8a6cff', light: { bright: 0, dim: 10 }, glow: 'tint', tags: 'summoning ritual runes teleport' },
  rune_stone: { name: 'Rune stone', group: 'Magic', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tint: '#5ad1ff', tags: 'runes' },
  crystal: { name: 'Crystal', group: 'Magic', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tint: '#59c3ff', light: { bright: 0, dim: 10 }, glow: 'tint', tags: 'gem' },
  crystal_big: { name: 'Crystal cluster', group: 'Magic', w: 2, h: 2, shape: 'round', layer: 1, blocks: 'wall', tint: '#b06cff', light: { bright: 10, dim: 10 }, glow: 'tint', tags: 'gem underdark' },
  portal: { name: 'Portal', group: 'Magic', w: 2, h: 2, shape: 'round', layer: 1, blocks: 'none', tint: '#6f4bff', light: { bright: 10, dim: 10 }, glow: 'tint', tags: 'gate rift teleport' },
  orb: { name: 'Scrying orb', group: 'Magic', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tint: '#7fd3ff', light: { bright: 5, dim: 5 }, glow: 'tint', tags: 'crystal ball pedestal' },
  obelisk: { name: 'Obelisk', group: 'Magic', w: 1, h: 1, shape: 'rect', layer: 1, blocks: 'wall', tags: 'monolith' },
  standing_stone: { name: 'Standing stone', group: 'Magic', w: 1, h: 0.7, shape: 'rect', layer: 1, blocks: 'wall', tags: 'menhir henge' },
  lectern: { name: 'Lectern', group: 'Magic', w: 1, h: 0.8, shape: 'rect', layer: 1, blocks: 'none', tags: 'book tome spellbook' },
  alchemy: { name: 'Alchemy bench', group: 'Magic', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'low', tint: '#4fc36a', tags: 'potions flasks laboratory' },
  potion: { name: 'Potion', group: 'Magic', w: 0.4, h: 0.4, shape: 'round', layer: 1, blocks: 'none', tint: '#d6336c', tags: 'flask vial' },
  scroll: { name: 'Scroll', group: 'Magic', w: 0.6, h: 0.6, shape: 'rect', layer: 0, blocks: 'none', tags: 'parchment map' },
  idol: { name: 'Idol', group: 'Magic', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'golden statue' },
  totem: { name: 'Totem', group: 'Magic', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'pole tribal' },
  pentagram: { name: 'Pentagram', group: 'Magic', w: 3, h: 3, shape: 'round', layer: 0, blocks: 'none', tint: '#c0392b', light: { bright: 0, dim: 5 }, glow: 'tint', tags: 'ritual summoning star demon' },
  teleport_pad: { name: 'Teleport pad', group: 'Magic', w: 2, h: 2, shape: 'round', layer: 0, blocks: 'none', tint: '#3ad1ff', light: { bright: 0, dim: 10 }, glow: 'tint', tags: 'teleportation circle' },
  arcane_pillar: { name: 'Arcane pillar', group: 'Magic', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'wall', tint: '#8a6cff', light: { bright: 0, dim: 10 }, glow: 'tint', tags: 'column runes' },
  magic_mirror: { name: 'Magic mirror', group: 'Magic', w: 1, h: 0.5, shape: 'rect', layer: 1, blocks: 'none', tint: '#7fd3ff', tags: 'scrying portal' },
  spellbook: { name: 'Open spellbook', group: 'Magic', w: 0.8, h: 0.6, shape: 'rect', layer: 0, blocks: 'none', tint: '#8a6cff', tags: 'tome grimoire' },
  wizard_desk: { name: "Wizard's desk", group: 'Magic', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'none', tags: 'study arcane' },
  node_fire: { name: 'Fire node', group: 'Magic', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', light: { bright: 10, dim: 10 }, glow: '#ff7b2a', tags: 'elemental flame rift' },
  node_frost: { name: 'Frost node', group: 'Magic', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', light: { bright: 0, dim: 10 }, glow: '#9fe3ff', tags: 'elemental ice cold' },
  node_storm: { name: 'Storm node', group: 'Magic', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'none', light: { bright: 0, dim: 10 }, glow: '#c8b8ff', tags: 'elemental lightning air' },
  node_earth: { name: 'Earth node', group: 'Magic', w: 1, h: 1, shape: 'round', layer: 1, blocks: 'low', tags: 'elemental stone rock' },
  bone_throne: { name: 'Bone throne', group: 'Magic', w: 1.5, h: 1.5, shape: 'rect', layer: 1, blocks: 'low', tags: 'necromancer skulls seat' },
  skull_candles: { name: 'Skull candles', group: 'Magic', w: 0.6, h: 0.6, shape: 'round', layer: 1, blocks: 'none', light: { bright: 5, dim: 5 }, glow: '#ffd27a', tags: 'necromancy' },
  golem: { name: 'Stone golem (still)', group: 'Magic', w: 2, h: 2, shape: 'round', layer: 1, blocks: 'wall', tags: 'construct statue guardian' },
  floating_stones: { name: 'Floating stones', group: 'Magic', w: 2, h: 2, shape: 'round', layer: 2, blocks: 'none', tags: 'levitating rocks' },
  blood_altar: { name: 'Blood altar', group: 'Magic', w: 2, h: 1, shape: 'rect', layer: 1, blocks: 'low', tags: 'sacrifice ritual' },
  orrery: { name: 'Orrery', group: 'Magic', w: 1.5, h: 1.5, shape: 'round', layer: 1, blocks: 'none', tags: 'planets model astronomy brass' },
};

const num = (v, min, max, fallback) => {
  const n = Number(v);
  return v === null || v === '' || v === undefined || typeof v === 'boolean' || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const half = (n) => Math.round(n * 2) / 2;
const round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const list = (v) => (Array.isArray(v) ? v : []);
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const colour = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : fallback);
export const isAssetRef = (a) => Object.hasOwn(ASSETS, a) || /^u:[a-f0-9]{10}$/.test(String(a));
const isDesignId = (id) => /^[a-z0-9]{4,16}$/.test(String(id));
export const isMapRef = (id) => /^[a-f0-9]{10}$/.test(String(id));
export const newDesignId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

/** A small random number source that gives the same numbers for the same seed (so a map draws, or is made, the same every time). */
export function seeded(...parts) {
  let s = 2166136261;
  for (const p of parts) s = Math.imul(s ^ (Number(p) | 0), 16777619) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An empty design (nothing on the floor yet, or `fill` everywhere). */
export function emptyDesign(cols = 30, rows = 20, fill = EMPTY) {
  return normalizeDesign({ cols, rows, floor: Array.from({ length: rows }, () => fill.repeat(cols)) });
}

/** The look, cleaned up. */
export function normalizeLook(l) {
  const src = l && typeof l === 'object' ? l : {};
  return {
    void: colour(src.void, LOOK.void),
    grid: pick(src.grid, Object.keys(GRID_LOOKS), LOOK.grid),
    shadows: src.shadows !== false,
    glow: src.glow !== false,
    mood: pick(src.mood, Object.keys(MOODS), LOOK.mood),
    soft: src.soft !== false,
  };
}

/** Are three points (nearly) in a line? */
const inLine = (a, m, b) => Math.abs((m.x - a.x) * (b.y - a.y) - (m.y - a.y) * (b.x - a.x)) < 1e-3;

/**
 * Clean up a design from the page, the AI or the archive: sizes limited,
 * unknown floors emptied, walls on half squares inside the map, every
 * wall, asset, path and label with its own id, and limits on how many.
 */
export function normalizeDesign(d = {}) {
  const src = d && typeof d === 'object' ? d : {};
  const cols = Math.round(num(src.cols, DESIGN_MIN, DESIGN_MAX, 30));
  const rows = Math.round(num(src.rows, DESIGN_MIN, DESIGN_MAX, 20));
  const floor = [];
  for (let r = 0; r < rows; r += 1) {
    const line = typeof src.floor?.[r] === 'string' ? src.floor[r] : '';
    let out = '';
    for (let c = 0; c < cols; c += 1) out += Object.hasOwn(FLOORS, line[c]) ? line[c] : EMPTY;
    floor.push(out);
  }
  const ids = new Set();
  const idOf = (v) => {
    let id = isDesignId(v) && !ids.has(String(v)) ? String(v) : newDesignId();
    while (ids.has(id)) id = newDesignId();
    ids.add(id);
    return id;
  };
  const walls = [];
  const seen = new Set();
  for (const w of list(src.walls)) {
    if (!w || walls.length >= MAX_DESIGN_WALLS) continue;
    const x1 = half(num(w.x1, 0, cols, NaN));
    const y1 = half(num(w.y1, 0, rows, NaN));
    const x2 = half(num(w.x2, 0, cols, NaN));
    const y2 = half(num(w.y2, 0, rows, NaN));
    if (![x1, y1, x2, y2].every(Number.isFinite) || (x1 === x2 && y1 === y2)) continue;
    const type = pick(w.type, WALL_TYPES, 'wall');
    let arc = null;
    if (w.arc && typeof w.arc === 'object' && !OPENINGS.includes(type)) {
      const a = { x: round(num(w.arc.x, 0, cols, NaN)), y: round(num(w.arc.y, 0, rows, NaN)) };
      if (Number.isFinite(a.x) && Number.isFinite(a.y) && !inLine({ x: x1, y: y1 }, a, { x: x2, y: y2 })) arc = a;
    }
    const tail = `${type}${arc ? `@${arc.x},${arc.y}` : ''}`;
    if (seen.has([x1, y1, x2, y2].join() + tail) || seen.has([x2, y2, x1, y1].join() + tail)) continue;
    seen.add([x1, y1, x2, y2].join() + tail);
    walls.push({ id: idOf(w.id), x1, y1, x2, y2, type, style: pick(w.style, WALL_STYLES, 'stone'), ...(arc && { arc }) });
  }
  const assets = [];
  for (const a of list(src.assets)) {
    if (!a || !isAssetRef(a.a) || assets.length >= MAX_DESIGN_ASSETS) continue;
    const def = ASSETS[a.a];
    const w = round(num(a.w, 0.2, 20, def?.w ?? 1));
    const h = round(num(a.h, 0.2, 20, def?.h ?? w));
    assets.push({
      id: idOf(a.id),
      a: String(a.a),
      x: round(num(a.x, 0, cols, cols / 2)),
      y: round(num(a.y, 0, rows, rows / 2)),
      w,
      h,
      rot: ((Math.round(num(a.rot, -100_000, 100_000, 0)) % 360) + 360) % 360,
      flip: a.flip === true,
      // Only built-in assets with a colour to change can be tinted.
      tint: def?.tint ? colour(a.tint, null) : null,
      layer: [0, 1, 2].includes(a.layer) ? a.layer : null,
      blocks: pick(a.blocks, BLOCKS, def?.blocks ?? 'none'),
      // Only built-in assets that give light can (a campfire, a brazier, a torch...); on unless turned off.
      light: !!def?.light && a.light !== false,
      difficult: typeof a.difficult === 'boolean' ? a.difficult : !!def?.difficult,
      to: isMapRef(a.to) ? String(a.to) : null,
      label: str(a.label, 60),
    });
  }
  const paths = [];
  for (const p of list(src.paths)) {
    if (!p || paths.length >= MAX_DESIGN_PATHS || !Object.hasOwn(PATH_KINDS, p.kind)) continue;
    const pts = [];
    for (const q of list(p.pts).slice(0, MAX_PATH_POINTS)) {
      const x = round(num(q?.[0], 0, cols, NaN));
      const y = round(num(q?.[1], 0, rows, NaN));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const last = pts.at(-1);
      if (last && Math.hypot(x - last[0], y - last[1]) < 0.05) continue;
      pts.push([x, y]);
    }
    if (pts.length < 2) continue;
    paths.push({ id: idOf(p.id), kind: p.kind, w: round(num(p.w, 0.2, 8, PATH_KINDS[p.kind].w)), pts });
  }
  const labels = [];
  for (const l of list(src.labels)) {
    const text = str(l?.text, 80);
    if (!text || labels.length >= MAX_DESIGN_LABELS) continue;
    labels.push({
      id: idOf(l.id),
      text,
      x: round(num(l.x, 0, cols, cols / 2)),
      y: round(num(l.y, 0, rows, rows / 2)),
      size: round(num(l.size, 0.3, 6, 0.8)),
      rot: ((Math.round(num(l.rot, -100_000, 100_000, 0)) % 360) + 360) % 360,
      colour: colour(l.colour, '#f4ead5'),
      font: pick(l.font, Object.keys(LABEL_FONTS), 'old'),
      italic: l.italic === true,
      halo: l.halo !== false,
    });
  }
  return { v: DESIGN_VERSION, cols, rows, floor, walls, assets, paths, labels, look: normalizeLook(src.look) };
}

// ---------- geometry ----------

/** The points along an arc from a, through m, to b (all { x, y }), a piece every `step` radians or so (2 to 64 pieces). */
export function arcPoints(a, m, b, step = Math.PI / 18) {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  if (Math.abs(d) < 1e-9) return [a, b];
  const sq = (p) => p.x * p.x + p.y * p.y;
  const c = {
    x: (sq(a) * (m.y - b.y) + sq(m) * (b.y - a.y) + sq(b) * (a.y - m.y)) / d,
    y: (sq(a) * (b.x - m.x) + sq(m) * (a.x - b.x) + sq(b) * (m.x - a.x)) / d,
  };
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  const ang = (p) => Math.atan2(p.y - c.y, p.x - c.x);
  const TAU = 2 * Math.PI;
  const ccw = (from, to) => (((to - from) % TAU) + TAU) % TAU;
  const sa = ang(a);
  let sweep = ccw(sa, ang(b));
  if (ccw(sa, ang(m)) > sweep) sweep -= TAU; // go the way round that passes through m
  const n = Math.min(64, Math.max(2, Math.ceil(Math.abs(sweep) / step)));
  const pts = [a];
  for (let i = 1; i < n; i += 1) pts.push({ x: c.x + r * Math.cos(sa + (sweep * i) / n), y: c.y + r * Math.sin(sa + (sweep * i) / n) });
  pts.push(b);
  return pts;
}

/** A wall as points along it, [[x, y], ...]: its two ends, or the pieces of its curve. */
export function wallPoints(w, step = Math.PI / 18) {
  if (!w.arc) return [[w.x1, w.y1], [w.x2, w.y2]];
  return arcPoints({ x: w.x1, y: w.y1 }, w.arc, { x: w.x2, y: w.y2 }, step).map((p) => [p.x, p.y]);
}

const segDistance = (x1, y1, x2, y2, x, y) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const s = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (x1 + dx * s), y - (y1 + dy * s));
};

/** How far a point is from a wall (in squares), along its curve if it has one. */
export function distanceToDesignWall(w, x, y) {
  const pts = wallPoints(w);
  let best = Infinity;
  for (let i = 1; i < pts.length; i += 1) best = Math.min(best, segDistance(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], x, y));
  return best;
}

/** Do segments ab and cd cross or touch? */
function segmentsMeet(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const e = 1e-9;
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  if (((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e))) return true;
  const on = (p, q, r) => Math.min(p[0], q[0]) - e <= r[0] && r[0] <= Math.max(p[0], q[0]) + e && Math.min(p[1], q[1]) - e <= r[1] && r[1] <= Math.max(p[1], q[1]) + e;
  return (Math.abs(d1) <= e && on(c, d, a)) || (Math.abs(d2) <= e && on(c, d, b)) || (Math.abs(d3) <= e && on(a, b, c)) || (Math.abs(d4) <= e && on(a, b, d));
}

/**
 * Which neighbouring squares a wall stands between (archways don't count):
 * a set of `${a}:${b}` with a < b the squares' numbers (row * cols + col).
 */
export function wallEdges(design) {
  const out = new Set();
  const { cols, rows } = design;
  for (const w of design.walls) {
    if (w.type === 'arch') continue;
    const pts = wallPoints(w);
    for (let i = 1; i < pts.length; i += 1) {
      const [p, q] = [pts[i - 1], pts[i]];
      const c0 = Math.max(0, Math.floor(Math.min(p[0], q[0])) - 1);
      const c1 = Math.min(cols - 1, Math.ceil(Math.max(p[0], q[0])));
      const r0 = Math.max(0, Math.floor(Math.min(p[1], q[1])) - 1);
      const r1 = Math.min(rows - 1, Math.ceil(Math.max(p[1], q[1])));
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) {
          const from = [c + 0.5, r + 0.5];
          if (c + 1 < cols && segmentsMeet(from, [c + 1.5, r + 0.5], p, q)) out.add(`${r * cols + c}:${r * cols + c + 1}`);
          if (r + 1 < rows && segmentsMeet(from, [c + 0.5, r + 1.5], p, q)) out.add(`${r * cols + c}:${(r + 1) * cols + c}`);
        }
      }
    }
  }
  return out;
}

// ---------- what the creator's tools do (each returns a new design) ----------

/** Paint squares with a floor (or EMPTY): cells [[col, row], ...]. */
export function paintFloor(design, cells, ch) {
  const floor = design.floor.map((line) => line.split(''));
  for (const [c, r] of cells) if (floor[r] && c >= 0 && c < design.cols) floor[r][c] = Object.hasOwn(FLOORS, ch) ? ch : EMPTY;
  return { ...design, floor: floor.map((l) => l.join('')) };
}

/** The squares in a rectangle (corners in squares, either way round), inside the map. */
export function rectCells(design, { x1, y1, x2, y2 }) {
  const out = [];
  const l = Math.max(0, Math.floor(Math.min(x1, x2)));
  const r = Math.min(design.cols, Math.ceil(Math.max(x1, x2)));
  const t = Math.max(0, Math.floor(Math.min(y1, y2)));
  const b = Math.min(design.rows, Math.ceil(Math.max(y1, y2)));
  for (let row = t; row < b; row += 1) for (let col = l; col < r; col += 1) out.push([col, row]);
  return out;
}

/**
 * The squares a brush of `size` covers around a square (1: just it; 2: it
 * and the ones right and below; 3: a 3 x 3 round it). A round brush leaves
 * out the corners.
 */
export function brushCells(col, row, size = 1, roundBrush = false) {
  const out = [];
  const from = -Math.floor((size - 1) / 2);
  const mid = (size - 1) / 2;
  for (let dy = 0; dy < size; dy += 1) {
    for (let dx = 0; dx < size; dx += 1) {
      if (roundBrush && size >= 3 && Math.hypot(dx - mid, dy - mid) > size / 2 - 0.2) continue;
      out.push([col + from + dx, row + from + dy]);
    }
  }
  return out;
}

/** Every square joined to (col, row) with the same floor and no wall between, painted with `ch` (the bucket). */
export function fillFloor(design, col, row, ch) {
  const from = design.floor[row]?.[col];
  if (from == null || from === ch) return design;
  const blocked = design.walls.length ? wallEdges(design) : new Set();
  const { cols, rows } = design;
  const cells = [];
  const seen = new Set([row * cols + col]);
  const stack = [[col, row]];
  while (stack.length) {
    const [c, r] = stack.pop();
    cells.push([c, r]);
    const k = r * cols + c;
    for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nk = nr * cols + nc;
      if (seen.has(nk) || design.floor[nr][nc] !== from || blocked.has(k < nk ? `${k}:${nk}` : `${nk}:${k}`)) continue;
      seen.add(nk);
      stack.push([nc, nr]);
    }
  }
  return paintFloor(design, cells, ch);
}

const collinear = (a, w) => {
  const cross = (px, py) => (a.x2 - a.x1) * (py - a.y1) - (a.y2 - a.y1) * (px - a.x1);
  return Math.abs(cross(w.x1, w.y1)) < 1e-9 && Math.abs(cross(w.x2, w.y2)) < 1e-9;
};

/** Where wall `w`'s ends fall along wall `a`'s line (0 at a's start, 1 at its end), smallest first. */
const along = (a, w) => {
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len2 = dx * dx + dy * dy;
  const t = (px, py) => ((px - a.x1) * dx + (py - a.y1) * dy) / len2;
  const s = [t(w.x1, w.y1), t(w.x2, w.y2)];
  return s[0] <= s[1] ? s : [s[1], s[0]];
};

/** What's left of wall `x` once the stretch of `cut` (on the same line) is taken out of it: 0, 1 or 2 pieces. */
function cutOut(x, cut) {
  const [a, b] = along(x, cut);
  if (b <= 1e-9 || a >= 1 - 1e-9) return [x];
  const at = (s) => ({ x: half(x.x1 + (x.x2 - x.x1) * s), y: half(x.y1 + (x.y2 - x.y1) * s) });
  const out = [];
  if (a > 1e-9) out.push({ ...x, x2: at(a).x, y2: at(a).y });
  if (b < 1 - 1e-9) out.push({ ...x, id: newDesignId(), x1: at(b).x, y1: at(b).y });
  return out.filter((p) => p.x1 !== p.x2 || p.y1 !== p.y2);
}

/** One straight wall covering `w` and the walls in `others` (all on its line). */
function joined(w, others) {
  let lo = 0;
  let hi = 1;
  for (const o of others) {
    const [a, b] = along(w, o);
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  const at = (s) => ({ x: half(w.x1 + (w.x2 - w.x1) * s), y: half(w.y1 + (w.y2 - w.y1) * s) });
  return { ...w, id: others[0]?.id ?? w.id, x1: at(lo).x, y1: at(lo).y, x2: at(hi).x, y2: at(hi).y };
}

/**
 * Add a wall, low wall or fence, door, secret door, window or archway.
 * An opening (door, secret door, window, archway) drawn along a wall cuts
 * its stretch out of it (and replaces any opening there). A straight wall
 * joins the walls of the same kind and look along its line that it meets,
 * replaces walls of another kind or look where it overlaps them, and goes
 * round the openings already there. A curved wall (`arc`: a point it passes
 * through) is added as it is.
 */
export function addWall(design, wall) {
  const type = pick(wall.type, WALL_TYPES, 'wall');
  const w = { id: newDesignId(), x1: half(wall.x1), y1: half(wall.y1), x2: half(wall.x2), y2: half(wall.y2), type, style: pick(wall.style, WALL_STYLES, 'stone') };
  if (![w.x1, w.y1, w.x2, w.y2].every(Number.isFinite) || (w.x1 === w.x2 && w.y1 === w.y2)) return design;
  if (wall.arc && !OPENINGS.includes(type)) {
    const arc = { x: round(wall.arc.x), y: round(wall.arc.y) };
    if (!inLine({ x: w.x1, y: w.y1 }, arc, { x: w.x2, y: w.y2 })) return normalizeDesign({ ...design, walls: [...design.walls, { ...w, arc }] });
  }
  let walls = design.walls;
  let added = [w];
  if (OPENINGS.includes(type)) {
    walls = walls.flatMap((x) => (!x.arc && collinear(w, x) ? cutOut(x, w) : [x]));
  } else {
    const overlaps = (x) => {
      const [a, b] = along(w, x);
      return b >= -1e-9 && a <= 1 + 1e-9;
    };
    const line = walls.filter((x) => !x.arc && !OPENINGS.includes(x.type) && collinear(w, x) && overlaps(x));
    const same = line.filter((x) => x.type === type && x.style === w.style);
    walls = walls.flatMap((x) => (same.includes(x) ? [] : line.includes(x) ? cutOut(x, w) : [x]));
    if (same.length) added = [joined(w, same)];
    for (const d of walls.filter((x) => OPENINGS.includes(x.type) && collinear(w, x))) added = added.flatMap((p) => cutOut(p, d));
  }
  return normalizeDesign({ ...design, walls: [...walls, ...added] });
}

/** A round wall (a tower, a pit's edge): two curved walls, centre (cx, cy), radius r, in squares. */
export function addCircle(design, { cx, cy, r, type = 'wall', style = 'stone' }) {
  if (!(r >= 0.5)) return design;
  const a = { x: half(cx - r), y: half(cy) };
  const b = { x: half(cx + r), y: half(cy) };
  const rr = (b.x - a.x) / 2;
  const mx = (a.x + b.x) / 2;
  let out = addWall(design, { x1: a.x, y1: a.y, x2: b.x, y2: b.y, arc: { x: mx, y: a.y - rr }, type, style });
  out = addWall(out, { x1: b.x, y1: b.y, x2: a.x, y2: a.y, arc: { x: mx, y: a.y + rr }, type, style });
  return out;
}

/** A room: its squares floored with `ch` and walled round (x1, y1, x2, y2 are corners, in squares). */
export function addRoom(design, { x1, y1, x2, y2 }, ch, style = 'stone') {
  const l = Math.max(0, Math.min(x1, x2));
  const r = Math.min(design.cols, Math.max(x1, x2));
  const t = Math.max(0, Math.min(y1, y2));
  const b = Math.min(design.rows, Math.max(y1, y2));
  if (r - l < 1 || b - t < 1) return design;
  const cells = rectCells(design, { x1: l, y1: t, x2: r, y2: b });
  let out = Object.hasOwn(FLOORS, ch) ? paintFloor(design, cells, ch) : design;
  for (const [a, c] of [[[l, t], [r, t]], [[r, t], [r, b]], [[r, b], [l, b]], [[l, b], [l, t]]]) {
    out = addWall(out, { x1: a[0], y1: a[1], x2: c[0], y2: c[1], type: 'wall', style });
  }
  return out;
}

/** The wall nearest a point, if one is within `reach` squares, or null. */
export function wallAt(design, x, y, reach = 0.35) {
  let best = null;
  let bestD = reach;
  for (const w of design.walls) {
    const d = distanceToDesignWall(w, x, y);
    if (d <= bestD) [best, bestD] = [w, d];
  }
  return best;
}

/** Take away the whole wall nearest a point, if one is within `reach` squares. */
export function eraseWallAt(design, x, y, reach = 0.35) {
  const w = wallAt(design, x, y, reach);
  return w ? { ...design, walls: design.walls.filter((x0) => x0 !== w) } : design;
}

/**
 * Rub out the square's length of wall under a point (the rubber): along a
 * straight wall across or down the map, just that square's stretch; a door,
 * window or archway, a curved wall or a slanted one, all of it.
 */
export function cutWallAt(design, x, y, reach = 0.35) {
  const w = wallAt(design, x, y, reach);
  if (!w) return design;
  const straight = !w.arc && !OPENINGS.includes(w.type) && (w.x1 === w.x2 || w.y1 === w.y2);
  if (!straight) return { ...design, walls: design.walls.filter((x0) => x0 !== w) };
  const piece = w.y1 === w.y2 ? { x1: Math.floor(x), y1: w.y1, x2: Math.floor(x) + 1, y2: w.y1 } : { x1: w.x1, y1: Math.floor(y), x2: w.x1, y2: Math.floor(y) + 1 };
  return normalizeDesign({ ...design, walls: design.walls.flatMap((x0) => (x0 === w ? cutOut(x0, piece) : [x0])) });
}

/** Is a point on an asset (inside its turned rectangle)? */
export function assetHit(a, x, y) {
  const r = (-a.rot * Math.PI) / 180;
  const dx = x - a.x;
  const dy = y - a.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= a.w / 2 && Math.abs(ly) <= a.h / 2;
}

/** Which layer an asset is drawn on: its own setting, else its kind's. */
export const layerOf = (a) => a.layer ?? ASSETS[a.a]?.layer ?? 1;
/** Assets in the order they're drawn: by layer, then as placed. */
export const drawOrder = (assets) => assets.map((a, i) => [a, i]).sort((p, q) => layerOf(p[0]) - layerOf(q[0]) || p[1] - q[1]).map((p) => p[0]);

/** The asset under a point (the one drawn on top), or null. */
export function assetAt(design, x, y) {
  const order = drawOrder(design.assets);
  for (let i = order.length - 1; i >= 0; i -= 1) if (assetHit(order[i], x, y)) return order[i];
  return null;
}

/** About how wide a label's text is, in squares (the lettering is about half as wide as it's high). */
export const labelWidth = (l) => Math.max(l.size, l.text.length * l.size * (l.font === 'title' ? 0.68 : 0.5));

/** The label under a point, or null. */
export function labelAt(design, x, y) {
  for (let i = design.labels.length - 1; i >= 0; i -= 1) {
    const l = design.labels[i];
    if (assetHit({ x: l.x, y: l.y, w: labelWidth(l) + 0.2, h: l.size * 1.3, rot: l.rot }, x, y)) return l;
  }
  return null;
}

/**
 * A path's line, smoothed (a curve through its points), as points every
 * so often along it: [[x, y], ...].
 */
export function smoothPoints(pts, steps = 6) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const out = [[...pts[0]]];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/** The outline of a path (a polygon round its whole width), in squares, for difficult terrain. */
export function pathOutline(path) {
  const pts = smoothPoints(path.pts, 3);
  const left = [];
  const right = [];
  const hw = path.w / 2;
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    left.push([p[0] + nx * hw, p[1] + ny * hw]);
    right.push([p[0] - nx * hw, p[1] - ny * hw]);
  });
  const outline = [...left, ...right.reverse()];
  // A long path is thinned out to fit a terrain area (200 points at most).
  const step = Math.ceil(outline.length / 190);
  return step > 1 ? outline.filter((_, i) => i % step === 0) : outline;
}

/** The path under a point (within its width), or null. */
export function pathAt(design, x, y) {
  for (let i = design.paths.length - 1; i >= 0; i -= 1) {
    const p = design.paths[i];
    const pts = smoothPoints(p.pts, 4);
    for (let k = 1; k < pts.length; k += 1) {
      if (segDistance(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], x, y) <= p.w / 2 + 0.15) return p;
    }
  }
  return null;
}

/** Make the map bigger or smaller (squares are added or cut at the right and bottom; what's off it goes). */
export function resizeDesign(design, cols, rows) {
  const c = Math.round(num(cols, DESIGN_MIN, DESIGN_MAX, design.cols));
  const r = Math.round(num(rows, DESIGN_MIN, DESIGN_MAX, design.rows));
  const floor = Array.from({ length: r }, (_, i) => (design.floor[i] ?? '').slice(0, c).padEnd(c, EMPTY));
  const inside = (x, y) => x <= c && y <= r;
  return normalizeDesign({
    ...design,
    cols: c,
    rows: r,
    floor,
    walls: design.walls.filter((w) => inside(w.x1, w.y1) && inside(w.x2, w.y2) && (!w.arc || inside(w.arc.x, w.arc.y))),
    assets: design.assets.filter((a) => inside(a.x, a.y)),
    paths: (design.paths ?? []).filter((p) => p.pts.every(([x, y]) => inside(x, y))),
    labels: (design.labels ?? []).filter((l) => inside(l.x, l.y)),
  });
}

/**
 * Move the whole map by whole squares (dx, dy), keeping its size: what goes
 * past an edge is cut off, and the squares uncovered are empty.
 */
export function shiftDesign(design, dx, dy) {
  const clip = copyArea(design, { x1: 0, y1: 0, x2: design.cols, y2: design.rows });
  const blank = { ...design, floor: design.floor.map((l) => EMPTY.repeat(l.length)), walls: [], assets: [], paths: [], labels: [] };
  return pasteClip(blank, clip, { x: Math.round(dx), y: Math.round(dy) }, { keepIds: true });
}

/** The user-uploaded assets a design uses ('u:<id>'). */
export const uploadedRefs = (design) => [...new Set(design.assets.map((a) => a.a).filter((a) => a.startsWith('u:')))];

// ---------- areas: copy, cut and paste, stamps ----------

/**
 * Everything in a rectangle of whole squares (the floor, walls with both
 * ends in it, assets and labels whose middle is in it, paths with every
 * point in it), moved so the rectangle's corner is (0, 0): a clip to paste,
 * or to keep as a stamp.
 */
export function copyArea(design, rect) {
  const x1 = Math.max(0, Math.floor(Math.min(rect.x1, rect.x2)));
  const y1 = Math.max(0, Math.floor(Math.min(rect.y1, rect.y2)));
  const x2 = Math.min(design.cols, Math.ceil(Math.max(rect.x1, rect.x2)));
  const y2 = Math.min(design.rows, Math.ceil(Math.max(rect.y1, rect.y2)));
  const inside = (x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
  const cols = Math.max(1, x2 - x1);
  const rows = Math.max(1, y2 - y1);
  const mx = (x) => round(x - x1);
  const my = (y) => round(y - y1);
  return {
    cols,
    rows,
    floor: Array.from({ length: rows }, (_, r) => (design.floor[y1 + r] ?? '').slice(x1, x1 + cols).padEnd(cols, EMPTY)),
    walls: design.walls
      .filter((w) => inside(w.x1, w.y1) && inside(w.x2, w.y2))
      .map((w) => ({ ...w, x1: mx(w.x1), y1: my(w.y1), x2: mx(w.x2), y2: my(w.y2), ...(w.arc && { arc: { x: mx(w.arc.x), y: my(w.arc.y) } }) })),
    assets: design.assets.filter((a) => inside(a.x, a.y)).map((a) => ({ ...a, x: mx(a.x), y: my(a.y) })),
    paths: (design.paths ?? []).filter((p) => p.pts.every(([x, y]) => inside(x, y))).map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [mx(x), my(y)]) })),
    labels: (design.labels ?? []).filter((l) => inside(l.x, l.y)).map((l) => ({ ...l, x: mx(l.x), y: my(l.y) })),
  };
}

/** The design with everything copyArea would copy taken away (the floor emptied). */
export function clearArea(design, rect) {
  const x1 = Math.max(0, Math.floor(Math.min(rect.x1, rect.x2)));
  const y1 = Math.max(0, Math.floor(Math.min(rect.y1, rect.y2)));
  const x2 = Math.min(design.cols, Math.ceil(Math.max(rect.x1, rect.x2)));
  const y2 = Math.min(design.rows, Math.ceil(Math.max(rect.y1, rect.y2)));
  const inside = (x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
  return {
    ...paintFloor(design, rectCells(design, { x1, y1, x2, y2 }), EMPTY),
    walls: design.walls.filter((w) => !(inside(w.x1, w.y1) && inside(w.x2, w.y2))),
    assets: design.assets.filter((a) => !inside(a.x, a.y)),
    paths: (design.paths ?? []).filter((p) => !p.pts.every(([x, y]) => inside(x, y))),
    labels: (design.labels ?? []).filter((l) => !inside(l.x, l.y)),
  };
}

/** A clip turned a quarter at a time clockwise (`rot`: 0, 90, 180 or 270), flipped left to right first if `flip`. */
export function transformClip(clip, { rot = 0, flip = false } = {}) {
  let out = clip;
  if (flip) {
    const fx = (x) => round(out.cols - x);
    out = {
      ...out,
      floor: out.floor.map((l) => [...l].reverse().join('')),
      walls: out.walls.map((w) => ({ ...w, x1: fx(w.x1), x2: fx(w.x2), ...(w.arc && { arc: { x: fx(w.arc.x), y: w.arc.y } }) })),
      assets: out.assets.map((a) => ({ ...a, x: fx(a.x), rot: (360 - a.rot) % 360, flip: !a.flip })),
      paths: out.paths.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [fx(x), y]) })),
      labels: out.labels.map((l) => ({ ...l, x: fx(l.x) })),
    };
  }
  for (let turns = Math.round((((rot % 360) + 360) % 360) / 90) % 4; turns > 0; turns -= 1) {
    // A quarter turn clockwise: (x, y) -> (rows - y, x).
    const { cols, rows } = out;
    const t = (x, y) => [round(rows - y), round(x)];
    const src = out;
    const floor = Array.from({ length: cols }, (_, r) => Array.from({ length: rows }, (_, c) => src.floor[rows - 1 - c]?.[r] ?? EMPTY).join(''));
    out = {
      ...out,
      cols: rows,
      rows: cols,
      floor,
      walls: out.walls.map((w) => {
        const [x1, y1] = t(w.x1, w.y1);
        const [x2, y2] = t(w.x2, w.y2);
        return { ...w, x1, y1, x2, y2, ...(w.arc && { arc: { x: t(w.arc.x, w.arc.y)[0], y: t(w.arc.x, w.arc.y)[1] } }) };
      }),
      assets: out.assets.map((a) => {
        const [x, y] = t(a.x, a.y);
        return { ...a, x, y, rot: (a.rot + 90) % 360 };
      }),
      paths: out.paths.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => t(x, y)) })),
      labels: out.labels.map((l) => {
        const [x, y] = t(l.x, l.y);
        return { ...l, x, y };
      }),
    };
  }
  return out;
}

/**
 * Paste a clip with its corner at square (x, y): its floor over the map's
 * (except where the clip's is empty), its walls added as the wall tools add
 * them, and its assets, paths and labels added with new ids (unless
 * `keepIds`). What falls off the map is left out.
 */
export function pasteClip(design, clip, { x, y }, { keepIds = false } = {}) {
  const ox = Math.round(x);
  const oy = Math.round(y);
  const cells = new Map();
  clip.floor.forEach((line, r) => [...line].forEach((ch, c) => {
    if (ch === EMPTY) return;
    if (!cells.has(ch)) cells.set(ch, []);
    cells.get(ch).push([ox + c, oy + r]);
  }));
  let out = design;
  for (const [ch, at] of cells) out = paintFloor(out, at.filter(([c, r]) => c >= 0 && r >= 0 && c < design.cols && r < design.rows), ch);
  const inside = (px, py) => px >= 0 && py >= 0 && px <= design.cols && py <= design.rows;
  for (const w of clip.walls) {
    const moved = { ...w, x1: w.x1 + ox, y1: w.y1 + oy, x2: w.x2 + ox, y2: w.y2 + oy, ...(w.arc && { arc: { x: w.arc.x + ox, y: w.arc.y + oy } }) };
    if (inside(moved.x1, moved.y1) && inside(moved.x2, moved.y2)) out = addWall(out, moved);
  }
  const id = (v) => (keepIds ? v : newDesignId());
  return normalizeDesign({
    ...out,
    assets: [...out.assets, ...clip.assets.filter((a) => inside(a.x + ox, a.y + oy)).map((a) => ({ ...a, id: id(a.id), x: a.x + ox, y: a.y + oy }))],
    paths: [...(out.paths ?? []), ...clip.paths.filter((p) => p.pts.every(([px, py]) => inside(px + ox, py + oy))).map((p) => ({ ...p, id: id(p.id), pts: p.pts.map(([px, py]) => [px + ox, py + oy]) }))],
    labels: [...(out.labels ?? []), ...clip.labels.filter((l) => inside(l.x + ox, l.y + oy)).map((l) => ({ ...l, id: id(l.id), x: l.x + ox, y: l.y + oy }))],
  });
}

/** A clip (or stamp) cleaned up: a small design (1 square or more across) with no look of its own. */
export function normalizeClip(clip) {
  const cols = Math.round(num(clip?.cols, 1, DESIGN_MAX, 1));
  const rows = Math.round(num(clip?.rows, 1, DESIGN_MAX, 1));
  // normalizeDesign makes a design at least DESIGN_MIN across; a clip keeps its own size.
  const d = normalizeDesign({ ...clip, cols: Math.max(DESIGN_MIN, cols), rows: Math.max(DESIGN_MIN, rows) });
  const inside = (x, y) => x <= cols && y <= rows;
  return {
    cols,
    rows,
    floor: d.floor.slice(0, rows).map((l) => l.slice(0, cols)),
    walls: d.walls.filter((w) => inside(w.x1, w.y1) && inside(w.x2, w.y2)),
    assets: d.assets.filter((a) => inside(a.x, a.y)),
    paths: d.paths.filter((p) => p.pts.every(([x, y]) => inside(x, y))),
    labels: d.labels.filter((l) => inside(l.x, l.y)),
  };
}

/**
 * Scatter copies of an asset over a rectangle (a wood, a field of stones):
 * at random places a little apart, turned and sized a little differently
 * each. The same seed scatters the same way.
 */
export function scatterAssets(design, key, rect, { count = null, seed = 1, spacing = 1, tint = null } = {}) {
  const def = ASSETS[key];
  if (!def) return design;
  const x1 = Math.max(0, Math.min(rect.x1, rect.x2));
  const y1 = Math.max(0, Math.min(rect.y1, rect.y2));
  const x2 = Math.min(design.cols, Math.max(rect.x1, rect.x2));
  const y2 = Math.min(design.rows, Math.max(rect.y1, rect.y2));
  if (x2 <= x1 || y2 <= y1) return design;
  const size = Math.max(def.w, def.h);
  const n = count ?? Math.max(1, Math.round(((x2 - x1) * (y2 - y1)) / (size * size * spacing * 1.4)));
  const rnd = seeded(seed, x1 * 10, y1 * 10, x2 * 10, y2 * 10);
  const placed = [];
  for (let tries = 0; placed.length < n && tries < n * 25 && design.assets.length + placed.length < MAX_DESIGN_ASSETS; tries += 1) {
    const k = 0.85 + rnd() * 0.3;
    const w = round(def.w * k);
    const h = round(def.h * k);
    const x = round(x1 + rnd() * (x2 - x1));
    const y = round(y1 + rnd() * (y2 - y1));
    if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < Math.max(p.w, w) * 0.55 * spacing)) continue;
    placed.push({ id: newDesignId(), a: key, x, y, w, h, rot: Math.floor(rnd() * 360), flip: rnd() < 0.5, ...(tint && { tint }) });
  }
  return normalizeDesign({ ...design, assets: [...design.assets, ...placed] });
}

// ---------- what a design gives the map ----------

/**
 * A ship's hull, its bow at the top (the Ship's deck asset, and the ships the
 * generator makes, whose rails follow it): straight sides, a pointed bow of
 * two arcs that each run on smoothly from their side, a square stern. In the
 * units of `w` and `h` (squares or pixels), its middle at (0, 0): the bow's
 * length `L` (the sides end at y0 = -h/2 + L), the arcs' radius `R`, the
 * angle `tip` of the bow's point seen from the right arc's middle
 * (hb - R, y0), and the outline as points round it from the stern's left corner.
 */
export function hullShape(w, h, steps = 12) {
  const hb = w / 2;
  const L = Math.min(w, h * 0.35);
  const y0 = -h / 2 + L;
  const R = (hb * hb + L * L) / (2 * hb);
  const tip = Math.atan2(-L, R - hb);
  const at = (a) => [hb - R + R * Math.cos(a), y0 + R * Math.sin(a)];
  const right = Array.from({ length: steps + 1 }, (_, i) => at((tip * i) / steps));
  right[steps] = [0, -h / 2];
  const outline = [[-hb, h / 2], ...right.map(([x, y]) => [-x, y]), ...right.slice(0, -1).reverse(), [hb, h / 2]];
  return { hb, L, y0, R, tip, at, outline };
}

/** An asset's outline, for blocking and difficult terrain: a circle as 8 sides, or its turned rectangle (a little inside its picture), in squares. */
export function assetOutline(a) {
  const def = ASSETS[a.a];
  const rot = (a.rot * Math.PI) / 180;
  const turn = ([x, y]) => [a.x + x * Math.cos(rot) - y * Math.sin(rot), a.y + x * Math.sin(rot) + y * Math.cos(rot)];
  if ((def?.shape ?? 'rect') === 'round') {
    const r = (Math.min(a.w, a.h) / 2) * 0.85;
    return Array.from({ length: 8 }, (_, i) => turn([r * Math.cos((i * Math.PI) / 4 + Math.PI / 8), r * Math.sin((i * Math.PI) / 4 + Math.PI / 8)]));
  }
  const hw = (a.w / 2) * 0.9;
  const hh = (a.h / 2) * 0.9;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(turn);
}

/**
 * Rectangles (in squares) covering every square of the floors where moving
 * is hard (water, mud): runs along each row, joined with the same run in the
 * rows below.
 */
export function difficultAreas(design) {
  const open = new Map(); // `${start},${end}` -> rectangle still growing down
  const out = [];
  for (let r = 0; r < design.rows; r += 1) {
    const runs = [];
    let start = -1;
    for (let c = 0; c <= design.cols; c += 1) {
      const hard = c < design.cols && FLOORS[design.floor[r][c]]?.difficult;
      if (hard && start < 0) start = c;
      if (!hard && start >= 0) {
        runs.push([start, c]);
        start = -1;
      }
    }
    const next = new Map();
    for (const [a, b] of runs) {
      const k = `${a},${b}`;
      const rect = open.get(k);
      if (rect) {
        rect.y2 = r + 1;
        next.set(k, rect);
      } else {
        const fresh = { x1: a, y1: r, x2: b, y2: r + 1 };
        out.push(fresh);
        next.set(k, fresh);
      }
    }
    open.clear();
    for (const [k, v] of next) open.set(k, v);
  }
  return out;
}

/** The pieces of one curved wall share a group on the map (6 to 16 letters and digits). */
const groupOf = (id) => `cw${id}`.padEnd(6, '0').slice(0, 16);

/**
 * What the map gets from a design, in the picture's pixels: its size, the
 * grid (exact) and 5 ft squares, the walls (curved ones as pieces), low
 * walls, fences and windows (obstacles: they block movement, not sight),
 * doors and secret doors, outlines of assets that block, the lights of
 * assets that give light, difficult terrain (floors, rivers, assets like
 * rubble), stairs and ladders, and ways to other maps (assets with `to`).
 */
export function designToMap(design, cell = DESIGN_CELL) {
  const px = (v) => round(v * cell, 1);
  const walls = [];
  for (const w of design.walls) {
    if (w.type === 'arch') continue;
    const door = w.type === 'door' || w.type === 'secret';
    const kind = w.type === 'low' || w.type === 'window' ? 'low' : 'wall';
    const pts = wallPoints(w);
    const group = pts.length > 2 ? groupOf(w.id) : null;
    for (let i = 1; i < pts.length; i += 1) {
      walls.push({
        x1: px(pts[i - 1][0]), y1: px(pts[i - 1][1]), x2: px(pts[i][0]), y2: px(pts[i][1]),
        door,
        kind,
        ...(w.type === 'secret' && { secret: true }),
        ...(group && { group }),
      });
    }
  }
  for (const a of design.assets) {
    if (a.blocks === 'none') continue;
    const pts = assetOutline(a);
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      walls.push({ x1: px(p[0]), y1: px(p[1]), x2: px(q[0]), y2: px(q[1]), door: false, kind: a.blocks === 'low' ? 'low' : 'wall' });
    });
  }
  const lights = design.assets.filter((a) => a.light && ASSETS[a.a]?.light).map((a) => ({ x: px(a.x), y: px(a.y), ...ASSETS[a.a].light }));
  const area = (pts) => ({ points: pts.map(([x, y]) => [px(Math.min(design.cols, Math.max(0, x))), px(Math.min(design.rows, Math.max(0, y)))]) });
  const terrain = [
    ...difficultAreas(design).map((r) => area([[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]])),
    ...(design.paths ?? []).filter((p) => PATH_KINDS[p.kind]?.difficult).map((p) => area(pathOutline(p))),
    ...design.assets.filter((a) => a.difficult).map((a) => area(assetOutline(a))),
  ];
  // Stairs and ladders that don't lead to another map: a line up the middle of each, along its length.
  const climbs = design.assets.filter((a) => !a.to && ASSETS[a.a]?.climb).map((a) => {
    const rot = (a.rot * Math.PI) / 180;
    const half = (a.h / 2) * 0.9;
    const end = (s) => [a.x - s * half * Math.sin(rot), a.y + s * half * Math.cos(rot)];
    const [[x1, y1], [x2, y2]] = [end(1), end(-1)];
    return { kind: ASSETS[a.a].climb, x1: px(x1), y1: px(y1), x2: px(x2), y2: px(y2) };
  });
  const links = design.assets.filter((a) => a.to).map((a) => ({ x: px(a.x), y: px(a.y), to: a.to, label: a.label || ASSETS[a.a]?.name || '' }));
  return {
    width: design.cols * cell,
    height: design.rows * cell,
    grid: { size: cell, x: 0, y: 0 },
    scale: { distance: 5, unit: 'ft', per: 'square' },
    walls,
    lights,
    terrain,
    links,
    climbs,
  };
}
