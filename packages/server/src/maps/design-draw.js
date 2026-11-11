/**
 * The drawing half of maps/design.js, run in a worker thread: drawing a big
 * picture takes the canvas seconds (about 4 s for a tavern at 140 px a
 * square), and the server must keep answering everyone else meanwhile.
 * Gets { design, cell, webDir, uploads: [[ref, file]] }, answers with the
 * picture as WebP or { error }. Sharp's work is done here too: even starting
 * an encode of a big picture held the server's thread for most of a second
 * on a slow machine (the owner's phone, 2026-11-09).
 */
import path from 'node:path';
import { parentPort } from 'node:worker_threads';
import sharp from 'sharp';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import { artFiles, artRef } from '@dndapp/shared/map-art-library.js';
import { drawDesign } from '@dndapp/shared/map-art.js';
import { LABEL_FONT_FILES } from './fonts.js';

// A native canvas only knows fonts it is given (generic names like "serif" find nothing), so the label
// fonts are registered once; anything else in a label's font list falls back to the system's fonts.
for (const font of LABEL_FONT_FILES) {
  try {
    GlobalFonts.registerFromPath(font.file(), font.family);
  } catch {
    // a missing font file: labels use a system font
  }
}

// The map art (shared/map-art-library.js), loaded once each and kept: a few hundred KB a picture.
const artCache = new Map();
const ASSET_PX = 768; // an uploaded asset is drawn from a copy at most this big on each side
function loadArt(webDir, file) {
  if (!artCache.has(file)) artCache.set(file, loadImage(path.join(webDir, 'art', file)).catch(() => null));
  return artCache.get(file);
}

parentPort.on('message', async ({ id, design, cell, webDir, uploads }) => {
  try {
    const images = new Map();
    for (const [ref, file] of uploads) {
      try {
        const png = await sharp(file).rotate().resize({ width: ASSET_PX, height: ASSET_PX, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        images.set(ref, await loadImage(png));
      } catch {
        // unreadable: drawn as a dashed box
      }
    }
    for (const file of artFiles(design)) {
      const img = await loadArt(webDir, file);
      if (img) images.set(artRef(file), img);
    }
    const canvas = createCanvas(design.cols * cell, design.rows * cell);
    drawDesign(canvas.getContext('2d'), design, { cell, images, makeCanvas: (w, h) => createCanvas(w, h) });
    // Sharp makes the WebP (the canvas's own took seconds over photo textures).
    const buf = await sharp(canvas.data(), { raw: { width: canvas.width, height: canvas.height, channels: 4 } }).webp({ quality: 85, effort: 2 }).toBuffer();
    const out = new Uint8Array(buf);
    parentPort.postMessage({ id, webp: out }, [out.buffer]);
  } catch (e) {
    parentPort.postMessage({ id, error: e?.message ?? String(e) });
  }
});
