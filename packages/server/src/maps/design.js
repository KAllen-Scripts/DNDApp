/**
 * Drawing a map made in the creator (SPEC §6.6 "Making a map"): the design is
 * drawn on a native canvas with the same code the page's creator previews
 * with (shared/map-art.js), in a worker thread (design-draw.js), and saved
 * as WebP, the map's picture.
 */
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';
import { config } from '../config.js';
import { designCell, uploadedRefs } from '@dndapp/shared/map-design.js';

// One drawing thread (maps/design-draw.js), made when first needed and kept; pictures are drawn one at a time.
let worker = null;
let nextId = 1;
const waiting = new Map();
function drawer() {
  if (worker) return worker;
  worker = new Worker(new URL('./design-draw.js', import.meta.url));
  worker.unref();
  worker.on('message', ({ id, pixels, error }) => {
    const job = waiting.get(id);
    waiting.delete(id);
    if (!waiting.size) worker?.unref();
    if (error) job?.reject(new Error(error));
    else job?.resolve(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length));
  });
  const fail = (e) => {
    for (const job of waiting.values()) job.reject(e instanceof Error ? e : new Error(`the drawing thread stopped (${e})`));
    waiting.clear();
    worker = null;
  };
  worker.on('error', fail);
  worker.on('exit', (code) => code && fail(code));
  return worker;
}
function drawPixels(msg) {
  const w = drawer();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.ref();
    w.postMessage({ id, ...msg });
  });
}

const ASSET_PX = 768; // an uploaded asset is drawn from a copy at most this big on each side

/**
 * @param {object} design  a normalised design
 * @param {{ assetFile: (id: string) => string | null, cell?: number }} opts  where an uploaded asset's picture is (removed ones too), or null;
 *   the pixels a square (a map changed in the creator keeps its own, so its tokens and walls stay put)
 * @returns {Promise<{ buf: Buffer, ext: 'webp', type: 'image/webp', width: number, height: number, cell: number }>}
 */
export async function renderDesign(design, { assetFile, cell = designCell(design) }) {
  const uploads = [];
  for (const ref of uploadedRefs(design)) {
    const file = assetFile(ref.slice(2));
    if (!file) continue;
    try {
      uploads.push([ref, await sharp(file).rotate().resize({ width: ASSET_PX, height: ASSET_PX, fit: 'inside', withoutEnlargement: true }).png().toBuffer()]);
    } catch {
      // unreadable: drawn as a dashed box
    }
  }
  const width = design.cols * cell;
  const height = design.rows * cell;
  const pixels = await drawPixels({ design, cell, webDir: config.webDir, uploads });
  // Sharp makes the WebP (the canvas's own took seconds over photo textures).
  const buf = await sharp(pixels, { raw: { width, height, channels: 4 } }).webp({ quality: 85, effort: 2 }).toBuffer();
  return { buf, ext: 'webp', type: 'image/webp', width, height, cell };
}
