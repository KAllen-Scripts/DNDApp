/**
 * The map creator's pictures (SPEC §6.6 "Map art"): photo textures for
 * floors and walls, and pictures of props seen from above (rendered from 3D
 * models), all CC0, in packages/web/public/art/. The drawing code
 * (map-art.js) uses a picture when it's loaded and its own drawing when it
 * isn't, so a design always draws. Pictures go in the same `images` map as
 * the DM's uploaded ones, under `art:<file>`.
 *
 * floors[ch]: { file, tile } (tile: how many squares the picture covers across)
 * walls[style]: { file, tile }
 * props[key]: { file } (the picture fills the asset's box, keeping its shape)
 * credits[file]: { source, url, author, licence }
 */
import { MAP_ART_FILES } from './map-art-files.js';

export const MAP_ART = MAP_ART_FILES;

/** Where the page loads the pictures from. */
export const ART_URL = '/art/';

/** The key of an art file in the drawing code's `images` map. */
export const artRef = (file) => `art:${file}`;

export const floorArt = (ch) => MAP_ART.floors[ch] ?? null;
export const wallArt = (style) => MAP_ART.walls[style] ?? null;
export const propArt = (key) => MAP_ART.props[key] ?? null;

/** Every art file a design draws with (its floors, wall styles and built-in assets), once each. */
export function artFiles(design) {
  const files = new Set();
  for (const line of design.floor ?? []) for (const ch of new Set(line)) if (floorArt(ch)) files.add(floorArt(ch).file);
  for (const w of design.walls ?? []) if (wallArt(w.style)) files.add(wallArt(w.style).file);
  for (const a of design.assets ?? []) if (propArt(a.a)) files.add(propArt(a.a).file);
  return [...files];
}

/** Every art file there is. */
export function allArtFiles() {
  return [...new Set([...Object.values(MAP_ART.floors), ...Object.values(MAP_ART.walls), ...Object.values(MAP_ART.props)].map((x) => x.file))];
}
