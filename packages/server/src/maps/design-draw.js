/**
 * The drawing half of maps/design.js, run in a worker thread: drawing a big
 * picture takes the canvas seconds (about 4 s for a tavern at 140 px a
 * square), and the server must keep answering everyone else meanwhile.
 * Gets { design, cell, webDir, uploads: [[ref, png buffer]] }, answers with
 * the picture's pixels (RGBA) or { error }.
 */
import path from 'node:path';
import { parentPort } from 'node:worker_threads';
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
function loadArt(webDir, file) {
  if (!artCache.has(file)) artCache.set(file, loadImage(path.join(webDir, 'art', file)).catch(() => null));
  return artCache.get(file);
}

parentPort.on('message', async ({ id, design, cell, webDir, uploads }) => {
  try {
    const images = new Map();
    for (const [ref, png] of uploads) {
      try {
        images.set(ref, await loadImage(Buffer.from(png)));
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
    const px = canvas.data();
    const out = new Uint8Array(px.length);
    out.set(px);
    parentPort.postMessage({ id, pixels: out }, [out.buffer]);
  } catch (e) {
    parentPort.postMessage({ id, error: e?.message ?? String(e) });
  }
});
