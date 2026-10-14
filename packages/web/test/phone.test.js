/**
 * The phone layout (look-boot.js, phone.js, mobile.css): on a phone the top
 * bar hides behind a ☰ button and opens as a menu; toolbars fold into ⋯ menus.
 */
import { test } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { withPage, createFakeLLM, mapReading, importMap } from './helpers.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const PHONE_QUERY = 'max-width: 640px), (pointer: coarse) and (max-height: 500px';
const asSam = ({ look = {}, media = {} } = {}) => ({
  page: (t) => ({ as: t.sam, storage: { ...NO_3D, 'dndapp.look': JSON.stringify(look) }, media }),
});
const root = (page) => page.document.documentElement;
const tick = () => new Promise((r) => setTimeout(r, 0));

test('the phone layout follows the screen, or the choice under Look', async () => {
  await withPage(asSam(), async (page) => {
    assert.ok(!root(page).hasAttribute('data-phone'), 'a big screen gets the normal page');
  });
  await withPage(asSam({ media: { [PHONE_QUERY]: true } }), async (page) => {
    assert.ok(root(page).hasAttribute('data-phone'), 'a phone gets the phone layout');
  });
  await withPage(asSam({ look: { phone: 'off' }, media: { [PHONE_QUERY]: true } }), async (page) => {
    assert.ok(!root(page).hasAttribute('data-phone'), '"Never" keeps the normal page on a phone');
  });
  await withPage(asSam({ look: { phone: 'on' } }), async (page) => {
    assert.ok(root(page).hasAttribute('data-phone'), '"Always" uses it on a big screen');
    // Changed from the Look dialog.
    page.click('#app-view .look-open');
    page.click('.look-card[data-key="phone"][data-value="off"]');
    assert.ok(!root(page).hasAttribute('data-phone'));
    assert.equal(JSON.parse(page.window.localStorage.getItem('dndapp.look')).phone, 'off');
  });
});

test('☰ opens the pages and settings as a menu; picking a page closes it', async () => {
  await withPage(asSam({ look: { phone: 'on' } }), async (page) => {
    const nav = page.$('#phone-nav');
    const bar = page.$('#app-view > .topbar');
    assert.ok(nav, 'the ☰ button');
    assert.equal(nav.getAttribute('aria-expanded'), 'false');
    assert.ok(!bar.classList.contains('menu-open'));

    page.click('#phone-nav');
    assert.ok(bar.classList.contains('menu-open'));
    assert.equal(nav.getAttribute('aria-expanded'), 'true');
    assert.ok(page.$('#phone-scrim').classList.contains('on'));

    page.click('[data-tab=notes]');
    await tick();
    assert.ok(page.visible('#tab-notes'), 'went to Notes');
    assert.ok(!bar.classList.contains('menu-open'), 'and the menu closed');
    assert.notEqual(page.document.activeElement, page.$('#note-form textarea'), 'no keyboard popping up on a phone');

    // Tapping beside it, or Escape, closes it too.
    page.click('#phone-nav');
    page.click('#phone-scrim');
    assert.ok(!bar.classList.contains('menu-open'));
    page.click('#phone-nav');
    bar.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(!bar.classList.contains('menu-open'));

    // Settings in it still work (Look opens its dialog) and close the menu.
    page.click('#phone-nav');
    page.click('#app-view .look-open');
    await tick();
    assert.ok(page.$('#look-dialog').open);
    assert.ok(!bar.classList.contains('menu-open'));
  });
});

test('the open chat\'s buttons fold into a ⋯ menu on a phone', async () => {
  await withPage(asSam({ look: { phone: 'on' } }), async (page) => {
    assert.ok(page.$('.chat-actions').classList.contains('phone-menu'));
    const actions = page.$('.chat-actions .phone-menu-list');
    assert.ok(actions.contains(page.$('#chat-delete')), 'the buttons are in the menu');
    const more = page.$('.chat-actions .phone-more');
    page.click(more);
    assert.ok(actions.classList.contains('menu-open'));
    // One menu at a time: opening ☰ closes ⋯.
    page.click('#phone-nav');
    assert.ok(!actions.classList.contains('menu-open'));
    assert.ok(page.$('#app-view > .topbar').classList.contains('menu-open'));
    page.click('#phone-scrim');
    // New chat from the menu works and closes it.
    page.click(more);
    page.click('.new-chat-head');
    await tick();
    assert.ok(!actions.classList.contains('menu-open'));
    assert.equal(page.text('#chat-title'), 'New chat');
  });
});

test('the sheet bar keeps Next d20 and the save status in the row; the rest is in ⋯', async () => {
  await withPage(asSam({ look: { phone: 'on' } }), async (page) => {
    page.click('[data-tab=sheet]');
    const bar = page.$('.sheet-bar');
    const list = bar.querySelector('.phone-menu-list');
    for (const kept of ['#sheet-status', '.sheet-modes', '.phone-more']) assert.equal(bar.querySelector(kept).parentElement, bar, `${kept} stays in the row`);
    for (const id of ['#sheet-review', '#sheet-upload', '#sheet-download', '#sheet-print', '#sheet-popout']) assert.ok(list.contains(page.$(id)), `${id} is in ⋯`);
    page.click('.sheet-bar .phone-more');
    assert.ok(list.classList.contains('menu-open'));
    page.click('#sheet-print');
    await tick();
    assert.equal(page.printed, 1, 'Print still prints');
    assert.ok(!list.classList.contains('menu-open'));
    page.click('.sheet-bar .phone-more');
    page.click('.sheet-bar .phone-menu-close');
    await tick();
    assert.ok(!list.classList.contains('menu-open'), 'Close closes it');

    // Inventory: the item box and Add stay; Add by hand is in ⋯ and still works.
    page.click('[data-tab=inventory]');
    const form = page.$('#gear-add');
    assert.equal(page.$('#gear-name').parentElement, form);
    assert.equal(form.querySelector('button[type=submit]').parentElement, form);
    assert.ok(form.querySelector('.phone-menu-list').contains(page.$('#gear-own')));
  });
});

test('the map: ⋯ opens every map tool from the bottom; picking one closes it', async () => {
  const llm = createFakeLLM({ structured: async () => mapReading() });
  const opts = (look) => ({
    setup: { llm },
    before: async (t) => ({ map: await importMap(t, { patch: { shown: true, grid: { size: 35, x: 0, y: 0 } } }) }),
    page: (t) => ({ as: t.sam, storage: { ...NO_3D, 'dndapp.look': JSON.stringify(look) } }),
  });
  await withPage(opts({ phone: 'on' }), async (page) => {
    page.click('[data-tab=map]');
    await page.waitFor(() => page.$('#map-stage') && !page.$('#map-stage').hidden, { what: 'the map' });
    const bar = page.$('#map-main-bar');
    for (const id of ['#map-fit', '#map-ruler', '#map-ping', '#map-draw', '#map-combat-open']) assert.ok(page.$(id).classList.contains('phone-main'), `${id} stays in the row`);
    page.click('#map-more');
    assert.ok(bar.classList.contains('menu-open'));
    assert.ok(page.$('#phone-scrim').classList.contains('on'));
    page.click('#map-ruler');
    await tick();
    assert.ok(!bar.classList.contains('menu-open'), 'closed');
    assert.equal(page.$('#map-ruler').getAttribute('aria-pressed'), 'true', 'and Measure is on');
    // Ticking Grid leaves it open (it's a box, not a choice).
    page.click('#map-more');
    page.click('#map-show-grid');
    await tick();
    assert.ok(bar.classList.contains('menu-open'));
  });
  // Off a phone, More is only full screen's, and opens no sheet.
  await withPage(opts({ phone: 'off' }), async (page) => {
    page.click('[data-tab=map]');
    page.click('#map-more');
    assert.ok(!page.$('#map-main-bar').classList.contains('menu-open'));
    assert.ok(!page.$('#phone-scrim')?.classList.contains('on'));
  });
});

test('a phone has no room for a panel beside the map', async () => {
  await withPage({ page: (t) => ({ as: t.sam, storage: { ...NO_3D, 'dndapp.beside': 'notes', 'dndapp.look': JSON.stringify({ phone: 'on' }) } }) }, async (page) => {
    page.click('[data-tab=map]');
    assert.ok(page.visible('#tab-map'));
    assert.ok(!page.visible('#tab-notes'));
    assert.ok(!page.$('#app-view').classList.contains('beside'));
  });
});

test('the phone styles only apply in the phone layout', () => {
  const css = fs.readFileSync(new URL('../public/mobile.css', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('mobile.css') > html.indexOf('themes.css'), 'loaded after the themes, so it wins over the layouts');
  // Every rule is for the phone layout, apart from hiding its buttons elsewhere and the Look dialog's pictures.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.split('{')[0].trim()).filter(Boolean);
  const parts = (sel) => sel.split(/,(?![^(]*\))/).map((s) => s.trim());
  for (const one of rules.flatMap(parts)) {
    if (/^\.phone-(nav|more|scrim|menu-close|menu-list|auto|on|off)\b/.test(one)) continue;
    assert.match(one, /^:root\[data-phone\]/, `"${one}" should be for phones only`);
  }
});
