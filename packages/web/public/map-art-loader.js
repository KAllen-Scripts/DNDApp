/**
 * The map art in the page (shared/map-art-library.js): pictures loaded once
 * each and kept while the page is open. The map creator asks for what its
 * design draws with, and draws its own drawings until they arrive.
 */
import { ART_URL } from './shared/map-art-library.js';

const loaded = new Map(); // file -> a decoded picture
const waiting = new Map(); // file -> [callbacks]

/** The picture of an art file, if it's loaded. */
export const artImage = (file) => loaded.get(file) ?? null;

/** Load an art file (once), then call onLoad(file, picture). A picture that won't load is left out. */
export function loadArt(file, onLoad) {
  if (loaded.has(file)) return onLoad(file, loaded.get(file));
  if (waiting.has(file)) return waiting.get(file).push(onLoad);
  waiting.set(file, [onLoad]);
  if (typeof Image !== 'function') return;
  const img = new Image();
  const done = () => {
    const calls = waiting.get(file) ?? [];
    waiting.delete(file);
    // Only a picture that really loaded (not a stand-in with no size) is kept.
    if (!(img.naturalWidth > 0)) return;
    loaded.set(file, img);
    for (const call of calls) call(file, img);
  };
  img.onload = done;
  img.onerror = () => waiting.delete(file);
  img.src = ART_URL + file;
}
