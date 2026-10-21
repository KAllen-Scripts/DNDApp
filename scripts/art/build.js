/**
 * Builds the map creator's art (shared/map-art-library.js) from CC0 downloads:
 *
 *   node scripts/art/build.js <downloads> [<props>]
 *
 * <downloads>: a folder with manifest.json (kind, id, source, page, authors,
 * licence, dimensions and files of each Poly Haven / ambientCG asset, as
 * fetched to the owner's D:\Code\map-assets on 2026-10-21). <props>: a
 * folder of prop pictures rendered from the 3D models
 * (scripts/art/render-props.js), with their meta.json. Writes the pictures to
 * packages/web/public/art/ (WebP, sized for 140 px a square), one sheet of
 * small pictures for the creator's panel, and packages/shared/src/map-art-files.js.
 * Anything not CC0 is refused.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { FLOOR_PICKS, PROP_PICKS, WALL_PICKS } from './picks.js';

const require = createRequire(path.resolve(fileURLToPath(import.meta.url), '../../../packages/server/package.json'));
const sharp = require('sharp');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(root, 'packages/web/public/art');
const FILES = path.join(root, 'packages/shared/src/map-art-files.js');
const SQUARE_M = 1.524; // 5 ft
const THUMB = 64; // the panel's small pictures, pixels each
const SHEET_COLS = 24;

const [downloads, propsDir] = process.argv.slice(2);
if (!downloads) {
  console.error('usage: node scripts/art/build.js <downloads> [<props>]');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(path.join(downloads, 'manifest.json'), 'utf8'));
const { ASSETS, FLOORS } = await import('../../packages/shared/src/map-design.js');

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const credit = (item) => {
  if (item.licence !== 'CC0') throw new Error(`${item.id} is ${item.licence}, not CC0`);
  return { source: item.source, url: item.page, author: (item.authors ?? []).join(', '), licence: 'CC0', id: item.id };
};
/** How many squares a texture covers: as picked, else its real size (silly sizes, like aerial photos, give 1.5). */
function tileOf(item, pick) {
  if (pick.tile) return pick.tile;
  const m = item.dimensions_mm ? item.dimensions_mm[0] / 1000 : item.dimensions_cm ? item.dimensions_cm[0] / 100 : null;
  // A little bigger than life (planks a hand wider, stones a little larger): a map's squares are big, and a texture
  // repeated every square looks like a grid.
  const t = m ? (m / SQUARE_M) * 1.5 : 2.25;
  return t >= 0.4 && t <= 5 ? Math.round(t * 100) / 100 : 2.25;
}

fs.rmSync(OUT, { recursive: true, force: true });
for (const dir of ['floors', 'walls', 'props']) fs.mkdirSync(path.join(OUT, dir), { recursive: true });
const files = { floors: {}, walls: {}, props: {}, credits: {}, thumbs: null };
const thumbs = []; // [key, png buffer]

async function texture(kind, key, name, pick) {
  const item = manifest.items.find((x) => x.id === pick.id && x.kind === (kind === 'floors' ? 'floor' : 'wall')) ?? manifest.items.find((x) => x.id === pick.id);
  if (!item) throw new Error(`${pick.id} isn't in the downloads`);
  const colour = item.files.find((f) => f.role === 'colour');
  const tile = tileOf(item, pick);
  // About 1.2 pixels of the picture for each pixel of a 140 px square: no sharper than the map can show.
  const px = Math.min(1024, Math.max(256, Math.round((tile * 140 * 1.2) / 64) * 64));
  const file = `${kind}/${slug(name)}.webp`;
  let img = sharp(path.join(downloads, colour.path)).resize(px, px, { fit: 'cover' });
  if (pick.tone) img = img.modulate({ brightness: pick.tone[0], saturation: pick.tone[1] });
  await img.webp({ quality: 80 }).toFile(path.join(OUT, file));
  files[kind][key] = { file, tile };
  files.credits[file] = credit(item);
  // Its small picture: a square's worth of it.
  const one = Math.max(1, Math.round(THUMB / tile));
  const small = await sharp(path.join(OUT, file)).resize(one, one).toBuffer();
  const reps = Math.ceil(THUMB / one) + 1;
  const tiles = [];
  for (let y = 0; y < reps; y += 1) for (let x = 0; x < reps; x += 1) tiles.push({ input: small, left: x * one, top: y * one });
  const big = await sharp({ create: { width: reps * one, height: reps * one, channels: 3, background: '#000' } }).composite(tiles).png().toBuffer();
  thumbs.push([`${kind === 'floors' ? 'f' : 'w'}:${key}`, await sharp(big).extract({ left: 0, top: 0, width: THUMB, height: THUMB }).png().toBuffer()]);
}

for (const [ch, pick] of Object.entries(FLOOR_PICKS)) await texture('floors', ch, FLOORS[ch].name, pick);
for (const [style, pick] of Object.entries(WALL_PICKS)) await texture('walls', style, style, pick);

if (propsDir) {
  // Each prop's picture faces the way its box does, is no bigger than it'd be drawn, and says how much of the box it
  // fills: a model's real size against the box, a little bigger than life (a lantern doesn't fill a square, a wardrobe
  // does) but never so small it's lost.
  const meta = JSON.parse(fs.readFileSync(path.join(propsDir, 'meta.json'), 'utf8'));
  for (const [key, id] of Object.entries(PROP_PICKS)) {
    const item = manifest.items.find((x) => x.id === id && x.kind === 'model');
    if (!item) throw new Error(`${id} isn't in the downloads`);
    if (!meta[id]) throw new Error(`${id} hasn't been rendered`);
    const box = ASSETS[key];
    let w = meta[id].wM / SQUARE_M;
    let h = meta[id].dM / SQUARE_M;
    const turn = (box.w > box.h * 1.15 && h > w * 1.15) || (box.h > box.w * 1.15 && w > h * 1.15);
    if (turn) [w, h] = [h, w];
    const contain = Math.min(box.w / w, box.h / h);
    const fill = Math.round(Math.min(1, Math.max(0.45, 1.3 / contain)) * 100) / 100;
    const px = Math.min(1400, Math.round(Math.max(box.w, box.h) * fill * 140 * 1.25));
    const file = `props/${key}.webp`;
    let img = sharp(path.join(propsDir, `${id}.png`)).rotate(turn ? 90 : 0);
    img = sharp(await img.png().toBuffer()).resize(px, px, { fit: 'inside', withoutEnlargement: true });
    const png = await img.png().toBuffer();
    await sharp(png).webp({ quality: 82, alphaQuality: 90 }).toFile(path.join(OUT, file));
    files.props[key] = fill < 1 ? { file, fill } : { file };
    files.credits[file] = credit(item);
    thumbs.push([`a:${key}`, await sharp(png).resize(THUMB, THUMB, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()]);
  }
}

// The sheet of small pictures.
const rows = Math.ceil(thumbs.length / SHEET_COLS);
const at = {};
const sheet = thumbs.map(([key, input], i) => {
  at[key] = [i % SHEET_COLS, Math.floor(i / SHEET_COLS)];
  return { input, left: (i % SHEET_COLS) * THUMB, top: Math.floor(i / SHEET_COLS) * THUMB };
});
await sharp({ create: { width: SHEET_COLS * THUMB, height: rows * THUMB, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(sheet).webp({ quality: 80, alphaQuality: 90 }).toFile(path.join(OUT, 'thumbs.webp'));
files.thumbs = { file: 'thumbs.webp', size: THUMB, at };

const js = `/**
 * The map creator's art files (written by scripts/art/build.js; see
 * map-art-library.js). Paths are under packages/web/public/art/.
 */
export const MAP_ART_FILES = ${JSON.stringify(files, null, 1)};
`;
fs.writeFileSync(FILES, js);
// Who made what: CC0 asks for nothing, but the makers deserve the thanks.
const lines = Object.entries(files.credits).map(([file, c]) => `| ${file} | [${c.id}](${c.url}) | ${c.author || '(unknown)'} | ${c.source} | ${c.licence} |`);
fs.writeFileSync(path.join(OUT, 'CREDITS.md'), `# Map art credits

Every picture here is CC0 (public domain): photo textures and 3D models from Poly Haven and ambientCG, the props
rendered from above by scripts/art/render-props.js. Built by scripts/art/build.js.

| File | From | By | Site | Licence |
|---|---|---|---|---|
${lines.join('\n')}
`);
let bytes = 0;
for (const name of fs.readdirSync(OUT, { recursive: true })) {
  const f = path.join(OUT, name);
  if (fs.statSync(f).isFile()) bytes += fs.statSync(f).size;
}
console.log(`${Object.keys(files.floors).length} floors, ${Object.keys(files.walls).length} walls, ${Object.keys(files.props).length} props; ${(bytes / 1e6).toFixed(1)} MB`);
