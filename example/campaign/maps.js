/**
 * The maps of the example world. The region map is painted by the seed (example/region-map.js) and imported
 * like an uploaded picture; the rest are the map creator's starting maps, made from a fixed seed so they come
 * out the same every time. Positions are in squares of each map's grid (x across, y down, from the top left).
 * Every map starts hidden from players, with fog and line of sight on: what the party sees is up to the DM.
 *
 * Places open smaller maps (`to`, a key here) and link to the wiki page about them (`page`, its title).
 */

export const REGION = {
  key: 'region',
  name: 'The Greyhallow Coast',
  kind: 'region',
  cols: 30,
  rows: 20,
  // One square is a mile.
  scale: { distance: 1, unit: 'mi', per: 'square' },
  places: [
    { name: 'Saltreach', x: 12.5, y: 10, to: 'harbour', page: 'Saltreach', revealed: true },
    { name: 'Lamplight Point', x: 7.6, y: 5.6, to: 'lighthouse', page: 'Lamplight Point', revealed: true },
    { name: 'The Gull Steps', x: 8.4, y: 15.2, to: 'caves', page: 'The Gull Steps', revealed: false },
    { name: 'Fenwick', x: 19.4, y: 12.2, to: 'fenwick', page: 'Fenwick', revealed: true },
    { name: "Mother Sallow's stilt-house", x: 23.2, y: 6.2, to: 'sallow', page: 'Mother Sallow', revealed: false },
    {
      name: 'The Sallowmere', x: 22, y: 8, page: 'The Sallowmere', revealed: true,
      points: [[16.5, 4.5], [21, 3], [27, 4], [28, 9], [25.5, 12], [20.5, 11.5], [17, 9.5]],
      encounters: { chance: 25, every: 4, table: ['1d4 + 1 marsh hounds', 'A fen lantern calling for help', 'A lost eel-catcher from Fenwick, half sunk in mud', 'A giant shore crab in a flooded channel', 'Two Choir cultists rowing a punt toward the coast', 'Nothing but a heron watching you'] },
    },
    { name: 'The road to Varrowgate', x: 29.3, y: 15.4, page: 'Varrowgate', revealed: true },
  ],
  // Roads and rivers, in squares: each a run of points, drawn as stretches.
  roads: [
    { kind: 'road', name: 'The Old Coast Road', points: [[12.6, 10.2], [15, 12.5], [18.2, 14], [22, 14.6], [26, 15], [29.8, 15.4]] },
    { kind: 'road', name: 'The lighthouse track', points: [[12.4, 9.8], [11, 8.4], [9.4, 7], [7.8, 5.8]] },
    { kind: 'road', name: 'The cliff path', points: [[12.4, 10.3], [11.2, 12.4], [9.8, 14], [8.6, 15]] },
    { kind: 'road', name: 'The Fenwick causeway', points: [[18.2, 14], [19.3, 12.4], [20.6, 10.4], [22, 8.4], [23.1, 6.4]] },
    { kind: 'river', name: 'The river Sallow', points: [[26.5, 7.5], [24, 9.2], [21, 10.6], [17.5, 11.2], [15, 11.4], [12.8, 11]] },
  ],
};

/** The made maps: a starting map kind, its seed, and what goes on it. */
export const MAPS = [
  {
    key: 'harbour', name: 'Saltreach Harbour', kind: 'town', generate: { kind: 'docks', seed: 1147 },
    places: [
      { name: 'The Brined Eel', x: 18, y: 12, to: 'tavern', page: 'The Brined Eel', revealed: true },
      { name: 'Crane counting house', x: 26, y: 8, page: 'The Crane counting house', revealed: true },
      { name: 'Harbourmaster\'s office', x: 10, y: 6, page: 'Odile Brask', revealed: true },
    ],
  },
  { key: 'tavern', name: 'The Brined Eel', kind: 'building', generate: { kind: 'tavern', seed: 31 } },
  {
    key: 'lighthouse', name: 'Lamplight Point, ground floor', kind: 'building', generate: { kind: 'tower', seed: 77 },
    levels: [
      { key: 'lamp-room', n: 1, name: 'Lamplight Point, lamp room', start: 'copy', light: { x: 15, y: 15, bright: 60, dim: 120 } },
      { key: 'cellar', n: -1, name: 'Lamplight Point, cellar', start: 'empty', generate: { kind: 'crypt', seed: 11 }, secret: true, link: { to: 'chapel', x: 15, y: 27, label: 'Down the chapel stair' } },
    ],
  },
  {
    key: 'chapel', name: 'The Drowned Chapel', kind: 'dungeon', generate: { kind: 'temple', seed: 9 }, look: 'gloom', secret: true,
    link: { to: 'cellar', x: 15, y: 32, label: 'Up to the lighthouse cellar' },
    // The flooded half of the nave.
    terrain: [[2, 18], [28, 18], [28, 30], [2, 30]],
  },
  { key: 'caves', name: 'The Gull Steps', kind: 'dungeon', generate: { kind: 'cave', seed: 404 } },
  {
    key: 'fenwick', name: 'Fenwick', kind: 'town', generate: { kind: 'village', seed: 52 },
    places: [{ name: "Headman Fenn's house", x: 20, y: 15, page: 'Hobb Fenn', revealed: true }],
  },
  { key: 'sallow', name: "Mother Sallow's stilt-house", kind: 'battle', generate: { kind: 'forest', seed: 13 } },
];
