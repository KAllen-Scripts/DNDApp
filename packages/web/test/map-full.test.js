/**
 * Full screen map (map-full.js): the map fills the screen with its toolbars
 * floating over it, see-through until pointed at.
 *
 * jsdom has no Fullscreen API, which is like an iPhone: the map still fills
 * the window. Where a test wants the browser's full screen, it stubs it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withPage, addDm, importMap, createFakeLLM, mapReading } from './helpers.js';

const SHOWN = { shown: true, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } };
const withMap = {
  setup: { llm: createFakeLLM({ structured: async () => mapReading() }) },
  before: async (t) => ({ map: await importMap(t, { patch: SHOWN }) }),
  page: (t) => ({ as: t.sam }),
};
const full = (page) => page.document.documentElement.hasAttribute('data-map-full');

/** Pretend to be a browser that can go full screen; returns what the page asked of it. */
function fakeFullscreen(page) {
  const { document } = page;
  const calls = [];
  let element = null;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  document.documentElement.requestFullscreen = async (opts) => { calls.push(['enter', opts]); element = document.documentElement; };
  document.exitFullscreen = async () => {
    calls.push(['exit']);
    element = null;
    document.dispatchEvent(new page.window.Event('fullscreenchange'));
  };
  return { calls, browserLeaves: () => { element = null; document.dispatchEvent(new page.window.Event('fullscreenchange')); } };
}

test('full screen: the button puts the whole page full screen with the map filling it, and back', async () => {
  await withPage(withMap, async (page) => {
    page.click('[data-tab=map]');
    await page.settle();
    const browser = fakeFullscreen(page);
    const button = page.$('#map-full');
    assert.equal(button.textContent, 'Full screen');
    assert.equal(button.getAttribute('aria-pressed'), 'false');

    page.click('#map-full');
    await page.settle();
    assert.ok(full(page));
    assert.deepEqual(browser.calls, [['enter', { navigationUI: 'hide' }]]);
    assert.equal(button.textContent, 'Exit full screen');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    // The tools are still there to use.
    assert.ok(page.visible('#map-fit') && page.visible('#map-ruler') && page.visible('#map-full'));

    page.click('#map-full');
    await page.settle();
    assert.ok(!full(page));
    assert.deepEqual(browser.calls.at(-1), ['exit']);
    assert.equal(button.textContent, 'Full screen');

    // Leaving through the browser (Escape, its own controls) puts the page back too.
    page.click('#map-full');
    await page.settle();
    browser.browserLeaves();
    assert.ok(!full(page));
    assert.equal(button.getAttribute('aria-pressed'), 'false');
  });
});

test('full screen: without the browser\'s full screen the map still fills the window; Escape goes back, but not from a dialog', async () => {
  await withPage(withMap, async (page) => {
    page.click('[data-tab=map]');
    await page.settle();
    assert.equal(page.document.documentElement.requestFullscreen, undefined, 'jsdom, like an iPhone, has none');
    page.click('#map-full');
    await page.settle();
    assert.ok(full(page));
    assert.equal(page.errors.length, 0);

    // Escape inside a dialog closes the dialog, not full screen.
    const dialog = page.$('#map-dialog');
    dialog.setAttribute('open', '');
    page.key('#map-dialog', 'Escape');
    assert.ok(full(page));
    dialog.removeAttribute('open');

    page.key('#map-view', 'Escape');
    assert.ok(!full(page));
  });
});

test('full screen: going to another tab leaves it', async () => {
  await withPage(withMap, async (page) => {
    page.click('[data-tab=map]');
    await page.settle();
    page.click('#map-full');
    await page.settle();
    assert.ok(full(page));
    // The top bar is hidden while full, but other parts of the page can still switch tabs.
    page.click('[data-tab=notes]');
    await page.settle();
    assert.ok(!full(page));
  });
});

test('full screen: only the main tools show; More shows the rest until the map is touched', async () => {
  await withPage(withMap, async (page) => {
    page.click('[data-tab=map]');
    await page.settle();
    const bar = page.$('#map-main-bar');
    const more = page.$('#map-more');
    const main = page.$$('#map-main-bar > .map-main').map((el) => el.id);
    assert.deepEqual(main, ['map-fit', 'map-ruler', 'map-ping', 'map-draw', 'map-template', 'map-combat-open', 'map-full', 'map-edit']);

    page.click('#map-full');
    await page.settle();
    assert.equal(more.textContent, 'More');
    assert.ok(!bar.classList.contains('more-open'));
    page.click('#map-more');
    assert.ok(bar.classList.contains('more-open'));
    assert.equal(more.getAttribute('aria-expanded'), 'true');
    assert.equal(more.textContent, 'Less');
    page.click('#map-more');
    assert.ok(!bar.classList.contains('more-open'));

    // Opened, then back to the map: tucked away again.
    page.click('#map-more');
    page.pointer('#map-view', 'pointerdown', { clientX: 10, clientY: 10 });
    page.pointer('#map-view', 'pointerup', { clientX: 10, clientY: 10 });
    assert.ok(!bar.classList.contains('more-open'));

    // Leaving full screen closes it too, so it starts tucked away next time.
    page.click('#map-more');
    page.click('#map-full');
    await page.settle();
    assert.ok(!bar.classList.contains('more-open'));
    assert.equal(more.getAttribute('aria-expanded'), 'false');
  });
});

test('edit mode: the DM shows or hides the tools for setting up the map, remembered in this browser; players never see it', async () => {
  const asDm = { ...withMap, before: async (t) => ({ ...(await withMap.before(t)), dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana }) };
  const editTools = ['#map-add-token', '#map-fog-open', '#map-settings', '#map-import'];
  let saved;
  await withPage(asDm, async (page) => {
    page.click('[data-tab=map]');
    await page.settle();
    const panel = page.$('#tab-map');
    const edit = page.$('#map-edit');
    assert.ok(edit.classList.contains('dm-only') && edit.classList.contains('map-main'), 'DM only, and out in full screen');
    for (const sel of editTools) assert.ok(page.$(sel).classList.contains('map-edit-tool'), sel);
    assert.ok(page.$('#map-show-walls').closest('label').classList.contains('map-edit-tool'));
    assert.ok(!page.$('#map-variant').classList.contains('map-edit-tool'), 'switching pictures is for play too');
    assert.equal(edit.getAttribute('aria-pressed'), 'true', 'on to start with');
    assert.ok(!panel.classList.contains('edit-off'));

    // Fog & walls open, then edit mode off: the panel closes with the tools.
    page.click('#map-fog-open');
    page.click('[data-wall-mode=wall]');
    assert.ok(page.visible('#map-wall-tools'));
    page.click('#map-edit');
    assert.ok(panel.classList.contains('edit-off'));
    assert.equal(edit.getAttribute('aria-pressed'), 'false');
    assert.ok(!page.visible('#map-fog-tools') && !page.visible('#map-wall-tools'));
    assert.ok(!page.$('#map-view').classList.contains('fog-drawing'), 'no wall tool left on');
    saved = page.window.localStorage.getItem('dndapp.map.editing');
    assert.equal(saved, '0');
  });
  // Off again next time; then back on.
  await withPage({ ...asDm, page: (t, { dana }) => ({ as: dana, storage: { 'dndapp.map.editing': saved } }) }, async (page) => {
    page.click('[data-tab=map]');
    await page.settle();
    assert.ok(page.$('#tab-map').classList.contains('edit-off'));
    page.click('#map-edit');
    assert.ok(!page.$('#tab-map').classList.contains('edit-off'));
    assert.equal(page.window.localStorage.getItem('dndapp.map.editing'), null);
  });
  const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.map-panel\.edit-off \.map-edit-tool \{ display: none; \}/);
});

test('full screen: the floating tools are see-through, solid when pointed at, focused or switched on', async () => {
  const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  const rule = (selector) => {
    const at = css.indexOf(`${selector} {`) >= 0 ? css.indexOf(`${selector} {`) : css.indexOf(`${selector},`);
    assert.ok(at >= 0, `no rule for ${selector}`);
    return css.slice(at, css.indexOf('}', at));
  };
  const faded = Number(rule(':root[data-map-full] .map-bar > *').match(/opacity:\s*([\d.]+)/)[1]);
  assert.ok(faded > 0.2 && faded < 1, `see-through, but still there (${faded})`);
  const solid = rule(':root[data-map-full] .map-bars:is(:hover, :focus-within) .map-bar > *');
  assert.match(solid, /\[aria-pressed="true"\][^{]*\{\s*opacity:\s*1/);
  assert.match(rule(':root[data-map-full] #app-view > .topbar'), /display:\s*none/);
  assert.match(rule(':root[data-map-full] .map-bars'), /position:\s*absolute/);
  // The rest are tucked away unless More is open; a tool that's switched on stays out.
  assert.match(rule(':root[data-map-full] #map-main-bar:not(.more-open) > :not(.map-main, #map-more, [aria-pressed="true"])'), /display:\s*none/);
  assert.match(rule('#map-more'), /display:\s*none/, 'More only in full screen');
});
