/**
 * Drawing a map made in the creator (SPEC §6.6 "Making a map"): the design is
 * drawn on a native canvas with the same code the page's creator previews
 * with (shared/map-art.js) and saved as WebP, the map's picture, all in a
 * worker thread (design-draw.js).
 */
import { Worker } from 'node:worker_threads';
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
  worker.on('message', ({ id, webp, error }) => {
    const job = waiting.get(id);
    waiting.delete(id);
    if (!waiting.size) worker?.unref();
    if (error) job?.reject(new Error(error));
    else job?.resolve(Buffer.from(webp.buffer, webp.byteOffset, webp.length));
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
function drawPicture(msg) {
  const w = drawer();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.ref();
    w.postMessage({ id, ...msg });
  });
}

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
    if (file) uploads.push([ref, file]); // an unreadable one is drawn as a dashed box
  }
  const width = design.cols * cell;
  const height = design.rows * cell;
  const buf = await drawPicture({ design, cell, webDir: config.webDir, uploads });
  return { buf, ext: 'webp', type: 'image/webp', width, height, cell };
}
