/**
 * Renders the props' 3D models (scripts/art/picks.js PROP_PICKS) from straight
 * above into see-through PNGs, for build.js:
 *
 *   node scripts/art/render-props.js <models> <out> [chrome]
 *
 * <models>: the downloads' models folder (<id>/<id>_1k.gltf with its .bin and
 * textures). <out>: where the PNGs and meta.json (each model's size in metres)
 * go. Uses three and playwright-core from the repo's node_modules, in a
 * headless Chrome (the installed one unless [chrome] names another).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PROP_PICKS } from './picks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const [models, out, chrome] = process.argv.slice(2);
if (!models || !out) {
  console.error('usage: node scripts/art/render-props.js <models> <out> [chrome]');
  process.exit(1);
}
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u === '/' ? path.join(here, 'render-page.html')
    : u.startsWith('/node_modules/') ? path.join(root, u)
    : path.join(models, u.replace(/^\/m\//, ''));
  fs.readFile(f, (e, b) => {
    if (e) { s.writeHead(404); s.end(); return; }
    s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    s.end(b);
  });
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({
  ...(chrome ? { executablePath: chrome } : { channel: 'chrome' }),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('console', (m) => m.type() === 'error' && console.error(m.text()));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction('window.ready');
fs.mkdirSync(out, { recursive: true });
const meta = {};
for (const id of new Set(Object.values(PROP_PICKS))) {
  try {
    const r = await page.evaluate((u) => window.renderModel(u), `/m/${id}/${id}_1k.gltf`);
    fs.writeFileSync(path.join(out, `${id}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    meta[id] = { wM: r.wM, dM: r.dM, hM: r.hM };
    console.log(id, r.wM.toFixed(2), r.dM.toFixed(2));
  } catch (e) {
    console.error(id, e.message);
  }
}
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 1));
await browser.close();
server.close();
