/**
 * Module hooks that let Node import the web page's files the way the browser
 * does (see page.js):
 *
 * - "./vendor/..." and "./shared/..." go to the packages the server serves at
 *   those addresses (same table as serveWebPage in server/src/app.js).
 * - The 3D dice library is swapped for a fake (fake-dice-box.js): no WebGL here.
 * - Every page load gets its own copy of the page's modules (?page=N is passed
 *   down to every file the page imports), so module state starts fresh.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const PUBLIC = new URL('../public/', import.meta.url).href;
const SERVER = new URL('../../server/src/app.js', import.meta.url).href;
const FAKE_DICE_BOX = new URL('./fake-dice-box.js', import.meta.url).href;
// The Deluxe dice's Three.js and physics: the files the server serves at those addresses.
const fromServer = createRequire(SERVER).resolve;
const VENDOR_FILES = {
  'vendor/three/three.module.js': () => path.join(path.dirname(fromServer('three')), 'three.module.js'),
  'vendor/cannon-es.js': () => path.join(path.dirname(fromServer('cannon-es')), 'cannon-es.js'),
};

const MODULES = {
  'shared/sheet.js': '@dndapp/shared/sheet.js',
  'shared/dice.js': '@dndapp/shared/dice.js',
  'shared/map.js': '@dndapp/shared/map.js',
  'shared/citations.js': '@dndapp/shared/citations.js',
  'vendor/marked.js': 'marked',
  'vendor/purify.js': 'dompurify',
};

export async function resolve(specifier, context, next) {
  const parent = context.parentURL;
  if (!parent?.startsWith(PUBLIC)) return next(specifier, context);
  const tag = new URL(parent).search; // "?page=N"
  // "/vendor/..." is from the web page's root (the public folder), not the disk's.
  const file = specifier.startsWith('/') ? new URL(specifier.slice(1), PUBLIC) : new URL(specifier, parent);
  const rel = file.href.startsWith(PUBLIC) ? file.href.slice(PUBLIC.length).split('?')[0] : null;
  if (rel === 'vendor/dice/dice-box.js') return { url: FAKE_DICE_BOX, shortCircuit: true };
  if (rel in VENDOR_FILES) return { url: pathToFileURL(VENDOR_FILES[rel]()).href, shortCircuit: true };
  if (rel in MODULES) {
    // Fresh per page too: DOMPurify binds to the window that's there when it loads.
    const resolved = await next(MODULES[rel], { ...context, parentURL: SERVER });
    return { ...resolved, url: resolved.url.split('?')[0] + tag };
  }
  const resolved = await next(specifier.startsWith('/') ? PUBLIC + specifier.slice(1) : specifier, context);
  if (resolved.url.startsWith(PUBLIC) && tag) resolved.url = resolved.url.split('?')[0] + tag;
  return resolved;
}
