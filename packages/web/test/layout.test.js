/**
 * Layout options and personal touches (look-boot.js, look.js, sheet-place.js):
 * any panel beside the map and on either side, the map toolbar's place,
 * token names, hidden map tools, the tabs' order and start tab, and an
 * accent colour. All kept in this browser.
 */
import { test } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const lookOf = (look) => ({ 'dndapp.look': JSON.stringify(look) });
const asSam = (storage = {}) => ({ page: (t) => ({ as: t.sam, storage: { ...NO_3D, ...storage } }) });
const root = (page) => page.document.documentElement;
const saved = (page) => JSON.parse(page.window.localStorage.getItem('dndapp.look'));
const tabOrder = (page) => page.$$('#app-view .tabs [data-tab]').map((t) => t.dataset.tab);
const card = (page, key, value) => page.el(`.look-card[data-key="${key}"][data-value="${value}"]`);
const openLook = (page, group) => {
  page.click('#app-view .look-open');
  if (group) page.click(`[data-group-tab=${group}]`);
};

test('beside the map: Ask, Notes or Handouts can go there too; the Archivist only for the DM', async () => {
  await withPage(asSam(), async (page) => {
    page.click('[data-tab=map]');
    const options = () => [...page.$('#map-beside').options].filter((o) => !o.hidden).map((o) => o.value);
    assert.deepEqual(options(), ['', 'sheet', 'inventory', 'ask', 'notes', 'handouts'], 'no Creatures or Archivist for a player');

    page.type('#map-beside', 'ask');
    assert.ok(page.visible('#tab-map') && page.visible('#tab-ask'));
    assert.ok(page.$('#tab-ask').classList.contains('beside-panel'));
    assert.equal(page.$('#sheet-splitter').getAttribute('aria-controls'), 'tab-ask');
    assert.ok(!page.visible('#tab-sheet'));

    page.type('#map-beside', 'notes');
    assert.ok(page.visible('#tab-notes') && !page.visible('#tab-ask'));
    assert.ok(!page.$('#tab-ask').classList.contains('beside-panel'));
    // The note box works from there.
    page.type('#note-form textarea', 'The map has a secret door.');
    page.submit('#note-form');
    await page.waitFor(() => page.text('#notes').includes('secret door'), { what: 'the note' });
    assert.ok(page.visible('#tab-map'), 'still on the map');

    // Leaving the map puts things back as they were.
    page.click('[data-tab=ask]');
    assert.ok(page.visible('#tab-ask') && !page.visible('#tab-notes') && !page.visible('#tab-map'));
  });

  // A player can't have the Archivist beside the map, even if it was saved.
  await withPage(asSam({ 'dndapp.beside': 'archivist' }), async (page) => {
    page.click('[data-tab=map]');
    assert.ok(!page.visible('#tab-archivist'));
    assert.equal(page.$('#map-beside').value, '');
    assert.ok(!page.$('#app-view').classList.contains('beside'));
  });

  // The DM can.
  await withPage({ before: async (t) => ({ dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana, storage: NO_3D }) }, async (page) => {
    page.click('[data-tab=map]');
    assert.ok(!page.$('#map-beside option[value=archivist]').hidden);
    page.type('#map-beside', 'archivist');
    assert.ok(page.visible('#tab-archivist') && page.visible('#tab-map'));
  });
});

test('beside the map, on the left: chosen under Look; the handle widens it the other way', async () => {
  await withPage(asSam({ 'dndapp.beside': 'sheet' }), async (page) => {
    page.window.innerWidth = 1400;
    page.click('[data-tab=map]');
    openLook(page, 'map');
    page.click(card(page, 'besideSide', 'left'));
    assert.equal(root(page).dataset.besideSide, 'left');
    assert.equal(saved(page).besideSide, 'left');

    const width = () => page.$('#app-view').style.getPropertyValue('--side-width');
    assert.equal(width(), '540px');
    // On the left, dragging right widens it.
    page.pointer('#sheet-splitter', 'pointerdown', { clientX: 540 });
    page.pointer('#sheet-splitter', 'pointerup', { clientX: 640 });
    assert.equal(width(), '640px');
    page.key('#sheet-splitter', 'ArrowLeft');
    assert.equal(width(), '620px');
  });
});

test('beside the map under Look: pick what goes there; its side is greyed out until something is', async () => {
  await withPage(asSam(), async (page) => {
    openLook(page, 'map');
    const sides = () => page.$$('.look-card[data-key=besideSide]');
    const pick = page.$('#look-beside');
    assert.deepEqual([...pick.options].map((o) => o.textContent), ['Nothing', 'Sheet', 'Inventory', 'Ask', 'Notes', 'Handouts'], 'only what this person has');
    assert.equal(pick.value, '');
    assert.ok(sides().every((c) => c.getAttribute('aria-disabled') === 'true'));
    assert.match(page.text('#look-side-says'), /Nothing is beside the map yet/);
    // The side can't be picked while nothing is beside the map.
    page.click(card(page, 'besideSide', 'left'));
    page.key(card(page, 'besideSide', 'right'), 'ArrowRight');
    assert.equal(root(page).dataset.besideSide, 'right');

    page.type('#look-beside', 'ask');
    assert.equal(page.$('#map-beside').value, 'ask', 'the toolbar menu agrees');
    assert.equal(page.window.localStorage.getItem('dndapp.beside'), 'ask');
    assert.ok(sides().every((c) => c.getAttribute('aria-disabled') === 'false'));
    page.click(card(page, 'besideSide', 'left'));
    assert.equal(root(page).dataset.besideSide, 'left');

    page.$('#look-dialog').close();
    page.click('[data-tab=map]');
    assert.ok(page.visible('#tab-map') && page.visible('#tab-ask'));
    assert.ok(page.$('#app-view').classList.contains('beside'));

    // Changed on the toolbar, the dialog shows it next time.
    page.type('#map-beside', 'notes');
    openLook(page, 'map');
    assert.equal(page.$('#look-beside').value, 'notes');
    page.type('#look-beside', '');
    assert.ok(!page.$('#app-view').classList.contains('beside'));
    assert.ok(!page.visible('#tab-notes'));
  });
});

test('the bar along the top stays put: every tab has room for its bold name, and its width never depends on the tab', async () => {
  const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8') + fs.readFileSync(new URL('../public/themes.css', import.meta.url), 'utf8');
  // Only the panels change width with the tab; the page itself doesn't.
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => [sel.trim(), body]);
  for (const [sel, body] of rules) {
    if (sel.split(',').some((s) => /^#app-view\.(wide|beside)$/.test(s.trim()))) assert.doesNotMatch(body, /max-width|--bar-width/, sel);
    if (/^#app-view$/.test(sel)) assert.doesNotMatch(body, /max-width/, sel);
  }
  await withPage(asSam(), async (page) => {
    for (const tab of page.$$('#app-view .tabs [data-tab]')) {
      const label = tab.querySelector('[data-label]');
      assert.equal(label.dataset.label, label.textContent, tab.dataset.tab);
    }
  });
});

test('map toolbar: above, below or down the left; token names always, on hover or never; kept for next time', async () => {
  await withPage(asSam(), async (page) => {
    assert.equal(root(page).dataset.mapBar, 'top');
    assert.equal(root(page).dataset.tokenLabels, 'always');
    openLook(page, 'map');
    assert.equal(page.$$('.look-section:not([hidden]) .look-card[data-key=mapBar]').length, 3);
    page.click(card(page, 'mapBar', 'bottom'));
    assert.equal(root(page).dataset.mapBar, 'bottom');
    page.key(card(page, 'mapBar', 'bottom'), 'ArrowRight');
    assert.equal(root(page).dataset.mapBar, 'left');
    page.click(card(page, 'tokenLabels', 'hover'));
    assert.equal(root(page).dataset.tokenLabels, 'hover');
    assert.equal(saved(page).mapBar, 'left');
    assert.equal(saved(page).tokenLabels, 'hover');
  });
  await withPage(asSam(lookOf({ mapBar: 'bottom', tokenLabels: 'never' })), async (page) => {
    assert.equal(root(page).dataset.mapBar, 'bottom');
    assert.equal(root(page).dataset.tokenLabels, 'never');
  });
});

test('map tools: untick the ones you never use and they leave the toolbar, in this browser', async () => {
  await withPage(asSam(), async (page) => {
    page.click('[data-tab=map]');
    assert.ok(!page.$('#map-ping').classList.contains('user-hidden'));
    openLook(page, 'map');
    const boxes = page.$$('[data-tool-show]');
    assert.deepEqual(boxes.map((b) => b.dataset.toolShow), ['grid', 'fit', 'pin', 'measure', 'ping', 'draw', 'template', 'initiative', 'fullscreen', 'sheet-window']);
    assert.ok(boxes.every((b) => b.checked));

    page.type('[data-tool-show=ping]', false);
    page.type('[data-tool-show=draw]', false);
    page.type('[data-tool-show=grid]', false);
    assert.ok(page.$('#map-ping').classList.contains('user-hidden'));
    assert.ok(page.$('#map-draw').classList.contains('user-hidden'));
    assert.ok(page.$('#map-show-grid').closest('label').classList.contains('user-hidden'));
    assert.ok(!page.$('#map-ruler').classList.contains('user-hidden'));
    assert.deepEqual(saved(page).hiddenTools, ['ping', 'draw', 'grid']);

    page.type('[data-tool-show=draw]', true);
    assert.ok(!page.$('#map-draw').classList.contains('user-hidden'));
    assert.deepEqual(saved(page).hiddenTools, ['ping', 'grid']);
  });
  // Hidden from the start next time.
  await withPage(asSam(lookOf({ hiddenTools: ['template', 'nonsense'] })), async (page) => {
    assert.ok(page.$('#map-template').classList.contains('user-hidden'));
    assert.ok(!page.$('#map-pin').classList.contains('user-hidden'));
  });
});

test('tabs: reorder them, hide some (never all), and pick the one the page opens on', async () => {
  await withPage(asSam(), async (page) => {
    assert.deepEqual(tabOrder(page), ['ask', 'notes', 'sheet', 'inventory', 'creatures', 'items', 'merchants', 'map', 'handouts', 'archivist']);
    openLook(page);
    assert.ok(page.$('[data-tab-move=ask][data-by="-1"]').disabled, 'the first can\'t go earlier');

    // Move the map to the front.
    for (let i = 0; i < 7; i++) page.click('[data-tab-move=map][data-by="-1"]');
    assert.deepEqual(tabOrder(page), ['map', 'ask', 'notes', 'sheet', 'inventory', 'creatures', 'items', 'merchants', 'handouts', 'archivist']);
    assert.deepEqual(saved(page).tabOrder, tabOrder(page));
    assert.deepEqual(page.$$('#look-tabs [data-tab-show]').map((b) => b.dataset.tabShow), tabOrder(page), 'the list follows');
    page.click('[data-tab-move=ask][data-by="1"]');
    assert.deepEqual(tabOrder(page), ['map', 'notes', 'ask', 'sheet', 'inventory', 'creatures', 'items', 'merchants', 'handouts', 'archivist']);

    // Hiding the tab you're on moves you to the first one shown.
    assert.equal(page.$('[data-tab=ask]').getAttribute('aria-selected'), 'true');
    page.type('[data-tab-show=ask]', false);
    assert.ok(page.$('[data-tab=ask]').classList.contains('user-hidden'));
    assert.equal(page.$('[data-tab=map]').getAttribute('aria-selected'), 'true');
    assert.ok(page.visible('#tab-map') && !page.visible('#tab-ask'));
    // It was the start tab, so the start moves to the first tab shown.
    assert.equal(saved(page).startTab, 'map');
    assert.ok(page.$('[data-tab-start=ask]').disabled);

    page.click('[data-tab-start=notes]');
    page.type('[data-tab-start=notes]', true);
    assert.equal(saved(page).startTab, 'notes');

    // Never all of them, and never all but the tabs only some people have.
    for (const tab of ['archivist', 'creatures', 'items', 'merchants', 'map', 'notes', 'handouts']) page.type(`[data-tab-show=${tab}]`, false);
    assert.deepEqual(saved(page).hiddenTabs.sort(), ['archivist', 'ask', 'creatures', 'items', 'map', 'merchants', 'notes']);
    assert.ok(page.$('[data-tab-show=handouts]').checked, 'the last one stays');
    assert.equal(page.$('[data-tab=sheet]').getAttribute('aria-selected'), 'true');
  });

  // Next visit: opens on the chosen tab, in the chosen order.
  await withPage(asSam(lookOf({ tabOrder: ['map', 'sheet'], startTab: 'map', hiddenTabs: ['notes'] })), async (page) => {
    assert.deepEqual(tabOrder(page), ['map', 'sheet', 'ask', 'notes', 'inventory', 'creatures', 'items', 'merchants', 'handouts', 'archivist'], 'tabs missing from the saved order go at the end');
    assert.equal(page.$('[data-tab=map]').getAttribute('aria-selected'), 'true');
    assert.ok(page.visible('#tab-map') && !page.visible('#tab-ask'));
    assert.ok(page.$('[data-tab=notes]').classList.contains('user-hidden'));
  });

  // A saved look that hides every tab everyone has is ignored.
  await withPage(asSam(lookOf({ hiddenTabs: ['ask', 'notes', 'sheet', 'inventory', 'map', 'handouts'] })), async (page) => {
    assert.ok(!page.$$('[data-tab]').some((t) => t.classList.contains('user-hidden')));
  });

  // A player whose start tab is the Archivist (DM only) lands on the first tab instead.
  await withPage(asSam(lookOf({ tabOrder: ['sheet'], startTab: 'archivist' })), async (page) => {
    assert.equal(page.$('[data-tab=sheet]').getAttribute('aria-selected'), 'true');
    assert.ok(page.visible('#tab-sheet') && !page.visible('#tab-archivist'));
  });
});

test('accent colour: your own over any theme, with readable text on it; back to the theme\'s', async () => {
  await withPage(asSam(), async (page) => {
    openLook(page);
    assert.equal(page.$('#look-accent-reset').disabled, true);
    page.type('#look-accent', '#1E90FF');
    const style = root(page).style;
    assert.equal(style.getPropertyValue('--accent'), '#1e90ff');
    assert.equal(style.getPropertyValue('--accent-text'), '#111111', 'dark text on a light blue');
    assert.equal(root(page).dataset.accent, '#1e90ff');
    assert.equal(saved(page).accent, '#1e90ff');
    assert.equal(page.$('#look-accent-reset').disabled, false);

    page.type('#look-accent', '#202060');
    assert.equal(style.getPropertyValue('--accent-text'), '#ffffff', 'white on a dark blue');

    // Kept when the theme changes.
    page.click(card(page, 'theme', 'neon'));
    assert.equal(style.getPropertyValue('--accent'), '#202060');

    page.click('#look-accent-reset');
    assert.equal(style.getPropertyValue('--accent'), '');
    assert.equal(root(page).dataset.accent, undefined);
    assert.equal(saved(page).accent, '');
    assert.equal(page.$('#look-accent-reset').disabled, true);
  });
  // Something that isn't a colour is ignored.
  await withPage(asSam(lookOf({ accent: 'red; background: url(x)' })), async (page) => {
    assert.equal(root(page).style.getPropertyValue('--accent'), '');
  });
});
