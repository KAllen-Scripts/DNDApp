/**
 * Maps from PDFs: adventures and map packs often come as PDFs, so the DM can
 * import one page of one. The page is drawn to a PNG (pdf.js on a native
 * canvas, both loaded only when needed) and that becomes the map's image.
 */
import { BadRequestError } from '../store.js';

const LONG_SIDE = 3000; // detailed enough for a battle map, small enough to send around
const MAX_SCALE = 6;

export const isPdf = (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-';

let libs;
async function load() {
  libs ??= Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('@napi-rs/canvas')]);
  return libs;
}

/**
 * Draw one page (1-based) of a PDF as a PNG.
 * @returns {Promise<{ png: Buffer, pages: number }>}
 */
export async function renderPdfPage(buf, page = 1) {
  const [pdfjs, { createCanvas }] = await load();
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0, isEvalSupported: false });
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch {
      throw new BadRequestError("That PDF can't be opened. If it has a password, remove it first.");
    }
    const pages = doc.numPages;
    if (!Number.isInteger(page) || page < 1 || page > pages) {
      throw new BadRequestError(pages === 1 ? 'That PDF only has one page.' : `That PDF has ${pages} pages; pick one from 1 to ${pages}.`);
    }
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    const scale = Math.min(MAX_SCALE, LONG_SIDE / Math.max(base.width, base.height));
    const viewport = p.getViewport({ scale });
    const canvas = createCanvas(Math.max(1, Math.round(viewport.width)), Math.max(1, Math.round(viewport.height)));
    const ctx = canvas.getContext('2d');
    // PDFs assume white paper.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvas, canvasContext: ctx, viewport }).promise;
    return { png: await canvas.encode('png'), pages };
  } finally {
    await task.destroy();
  }
}
