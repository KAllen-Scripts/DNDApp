/**
 * The page's look (look-boot.js and look.js): themes, layouts, text size,
 * chat and sheet styles, kept in this browser and applied before drawing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage } from './helpers.js';

const root = (page) => page.document.documentElement;
const saved = (page) => JSON.parse(page.window.localStorage.getItem('dndapp.look'));
const card = (page, key, value) => page.el(`.look-card[data-key="${key}"][data-value="${value}"]`);

test('look: the defaults; Tavern follows the device\'s dark mode', async () => {
  await withPage({}, async (page) => {
    assert.equal(root(page).dataset.theme, 'tavern');
    assert.equal(root(page).dataset.scheme, 'light');
    assert.equal(root(page).dataset.layout, 'classic');
    assert.equal(root(page).dataset.density, 'cozy');
    assert.equal(page.$('#tab-ask').dataset.chat, 'bubbles');
    assert.equal(page.$('#tab-sheet').dataset.sheetStyle, 'match');
    assert.equal(page.$('#tab-sheet').dataset.sheetLayout, 'classic');
  });
  await withPage({ page: { media: { 'prefers-color-scheme: dark': true } } }, async (page) => {
    assert.equal(root(page).dataset.scheme, 'dark');
  });
});

test('look: a saved look is applied at once; unknown or broken values fall back to the defaults', async () => {
  const look = { theme: 'neon', layout: 'app', density: 'roomy', chat: 'terminal', sheetStyle: 'grimoire', sheetLayout: 'tabs' };
  await withPage({ page: { storage: { 'dndapp.look': JSON.stringify(look) } } }, async (page) => {
    assert.equal(root(page).dataset.theme, 'neon');
    assert.equal(root(page).dataset.scheme, 'dark');
    assert.equal(root(page).dataset.layout, 'app');
    assert.equal(root(page).dataset.density, 'roomy');
    assert.equal(page.$('#tab-ask').dataset.chat, 'terminal');
    assert.equal(page.$('#tab-sheet').dataset.sheetStyle, 'grimoire');
    assert.equal(page.$('#tab-sheet').dataset.sheetLayout, 'tabs');
  });
  await withPage({ page: { storage: { 'dndapp.look': JSON.stringify({ theme: 'hot-dog', layout: 'app' }) } } }, async (page) => {
    assert.equal(root(page).dataset.theme, 'tavern');
    assert.equal(root(page).dataset.layout, 'app');
  });
  await withPage({ page: { storage: { 'dndapp.look': '{not json' } } }, async (page) => {
    assert.equal(root(page).dataset.theme, 'tavern');
  });
});

test('look: the dialog opens from the login screen; a click chooses, applies and saves; Reset goes back', async () => {
  await withPage({}, async (page) => {
    const dialog = page.$('#look-dialog');
    page.click('#login-form .look-open');
    assert.ok(dialog.open);
    // In groups, one shown at a time; one choice per section, each showing what's current.
    const shown = () => page.$$('#look-body .look-section h3').filter((h) => page.visible(h)).map((h) => h.textContent);
    assert.deepEqual(shown(), ['Theme', 'Accent colour', 'Layout', 'Text size', 'Tabs']);
    page.click('[data-group-tab=ask]');
    assert.deepEqual(shown(), ['Chat style']);
    page.click('[data-group-tab=sheet]');
    assert.deepEqual(shown(), ['Character sheet style', 'Character sheet layout']);
    page.key('[data-group-tab=sheet]', 'ArrowRight');
    assert.deepEqual(shown(), ['Toolbar', 'Beside the map', 'Token names', 'Map tools']);
    assert.equal(page.$('[data-group-tab=map]').getAttribute('aria-selected'), 'true');
    page.click('[data-group-tab=page]');
    assert.equal(page.$$('#look-body .look-card[data-key=theme]').length, 12);
    assert.equal(page.$$('#look-body .look-card[aria-checked=true]').length, 9);
    assert.equal(page.$('.look-card[data-key=theme][aria-checked=true]').dataset.value, 'tavern');
    // Theme previews carry their own colours (dark themes say so).
    assert.equal(page.$('.look-card[data-value=infernal] .theme-preview').dataset.scheme, 'dark');

    page.click(card(page, 'theme', 'frost'));
    assert.equal(root(page).dataset.theme, 'frost');
    assert.equal(card(page, 'theme', 'frost').getAttribute('aria-checked'), 'true');
    assert.equal(card(page, 'theme', 'tavern').getAttribute('aria-checked'), 'false');
    page.click(card(page, 'chat', 'letters').querySelector('.look-name'));
    assert.equal(page.$('#tab-ask').dataset.chat, 'letters');
    page.click(card(page, 'sheetLayout', 'single'));
    assert.equal(page.$('#tab-sheet').dataset.sheetLayout, 'single');
    assert.deepEqual(saved(page), {
      theme: 'frost', layout: 'classic', density: 'cozy', chat: 'letters', sheetStyle: 'match', sheetLayout: 'single',
      mapBar: 'top', besideSide: 'right', tokenLabels: 'always', startTab: 'ask',
      accent: '', tabOrder: ['ask', 'notes', 'sheet', 'inventory', 'creatures', 'items', 'merchants', 'map', 'handouts', 'archivist'], hiddenTabs: [], hiddenTools: [],
    });

    page.click('.look-reset');
    assert.equal(root(page).dataset.theme, 'tavern');
    assert.equal(saved(page).chat, 'bubbles');
    assert.equal(page.$('.look-card[data-key=theme][aria-checked=true]').dataset.value, 'tavern');

    // Done closes it; so does clicking outside the card (on the dialog's backdrop).
    page.click('#look-dialog button[value=done]');
    assert.ok(!dialog.open);
    page.click('#login-form .look-open');
    page.click(dialog);
    assert.ok(!dialog.open);
  });
});

test('look: arrow keys move through a section and choose (wrapping round); Enter and Space choose', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    page.click('#app-view .look-open');
    page.key(card(page, 'density', 'cozy'), 'ArrowRight');
    assert.equal(root(page).dataset.density, 'roomy');
    page.key(card(page, 'density', 'roomy'), 'ArrowDown');
    assert.equal(root(page).dataset.density, 'compact', 'wraps round');
    page.key(card(page, 'density', 'compact'), 'ArrowLeft');
    assert.equal(root(page).dataset.density, 'roomy');
    assert.equal(card(page, 'density', 'roomy').tabIndex, 0);
    assert.equal(card(page, 'density', 'cozy').tabIndex, -1);
    page.key(card(page, 'layout', 'wide'), 'Enter');
    assert.equal(root(page).dataset.layout, 'wide');
    page.key(card(page, 'layout', 'sidebar'), ' ');
    assert.equal(root(page).dataset.layout, 'sidebar');
    page.key(card(page, 'layout', 'sidebar'), 'x');
    assert.equal(root(page).dataset.layout, 'sidebar');
    assert.equal(saved(page).layout, 'sidebar');
  });
});
