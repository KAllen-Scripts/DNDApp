/**
 * Drawing a map made in the creator (SPEC §6.6 "Making a map"): the design is
 * drawn on a native canvas with the same code the page's creator previews
 * with (shared/map-art.js), and saved as WebP, the map's picture.
 */
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import { DESIGN_CELL, uploadedRefs } from '@dndapp/shared/map-design.js';
import { drawDesign } from '@dndapp/shared/map-art.js';
import { LABEL_FONT_FILES } from './fonts.js';

// A native canvas only knows fonts it is given (generic names like "serif" find nothing), so the label
// fonts are registered once; anything else in a label's font list falls back to the system's fonts.
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  fontsReady = true;
  for (const font of LABEL_FONT_FILES) {
    try {
      GlobalFonts.registerFromPath(font.file(), font.family);
    } catch {
      // a missing font file: labels use a system font
    }
  }
}

const ASSET_PX = 768; // an uploaded asset is drawn from a copy at most this big on each side

/**
 * @param {object} design  a normalised design
 * @param {{ assetFile: (id: string) => string | null }} opts  where an uploaded asset's picture is (removed ones too), or null
 * @returns {Promise<{ buf: Buffer, ext: 'webp', type: 'image/webp', width: number, height: number }>}
 */
export async function renderDesign(design, { assetFile }) {
  const images = new Map();
  for (const ref of uploadedRefs(design)) {
    const file = assetFile(ref.slice(2));
    if (!file) continue;
    try {
      const png = await sharp(file).rotate().resize({ width: ASSET_PX, height: ASSET_PX, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      images.set(ref, await loadImage(png));
    } catch {
      // unreadable: drawn as a dashed box
    }
  }
  const width = design.cols * DESIGN_CELL;
  const height = design.rows * DESIGN_CELL;
  registerFonts();
  const canvas = createCanvas(width, height);
  drawDesign(canvas.getContext('2d'), design, { cell: DESIGN_CELL, images, makeCanvas: (w, h) => createCanvas(w, h) });
  return { buf: await canvas.encode('webp', 90), ext: 'webp', type: 'image/webp', width, height };
}
