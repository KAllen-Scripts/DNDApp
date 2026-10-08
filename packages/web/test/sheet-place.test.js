/**
 * The sheet while on the map (sheet-place.js): beside the map on the same
 * page, resizable; popped out into its own window (the page at
 * ?view=sheet); and the sheet keeping up to date across those windows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage } from './helpers.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const asSam = (extra = {}) => ({ page: (t) => ({ as: t.sam, ...extra, storage: { ...NO_3D, ...extra.storage } }) });
const byLabel = (page, label) => page.el(`#sheet [aria-label="${label}"]`);
const saved = (page) => page.waitFor(() => page.text('#sheet-status') === 'Saved', { what: 'the sheet to save' });

test('sheet beside the map: the Sheet button shows it next to the map, remembered in this browser, and Hide takes it away', async () => {
  await withPage(asSam(), async (page) => {
    // Not on the Sheet tab: no Hide button there.
    page.click('[data-tab=sheet]');
    assert.ok(!page.visible('#sheet-beside-close'));
    assert.ok(page.visible('#sheet-popout'));

    page.click('[data-tab=map]');
    assert.ok(!page.visible('#tab-sheet'));
    assert.equal(page.$('#map-sheet-beside').getAttribute('aria-pressed'), 'false');

    page.click('#map-sheet-beside');
    assert.ok(page.visible('#tab-map'));
    assert.ok(page.visible('#tab-sheet'), 'the sheet is beside the map');
    assert.ok(page.visible('#sheet-splitter'));
    assert.ok(page.visible('#sheet-beside-close'));
    assert.ok(page.$('#app-view').classList.contains('sheet-beside'));
    assert.equal(page.$('#map-sheet-beside').getAttribute('aria-pressed'), 'true');
    assert.equal(page.$('[data-tab=map]').getAttribute('aria-selected'), 'true');
    assert.equal(page.window.localStorage.getItem('dndapp.sheetBeside'), '1');

    // Only with the map: other tabs look as before.
    page.click('[data-tab=ask]');
    assert.ok(!page.visible('#tab-sheet') && !page.visible('#tab-map') && !page.visible('#sheet-splitter'));
    assert.ok(!page.$('#app-view').classList.contains('sheet-beside'));
    page.click('[data-tab=sheet]');
    assert.ok(page.visible('#tab-sheet') && !page.visible('#tab-map'));
    assert.ok(!page.visible('#sheet-beside-close'));
    page.click('[data-tab=map]');
    assert.ok(page.visible('#tab-sheet'), 'still beside the map when coming back');

    // Editing it there is the same sheet as on the Sheet tab.
    page.type(byLabel(page, 'Character name'), 'Thorin');
    await saved(page);

    page.click('#sheet-beside-close');
    assert.ok(!page.visible('#tab-sheet'));
    assert.ok(page.visible('#tab-map'));
    assert.equal(page.$('#map-sheet-beside').getAttribute('aria-pressed'), 'false');
    assert.equal(page.window.localStorage.getItem('dndapp.sheetBeside'), null);
  });

  // Saved in this browser: the next visit opens the map with the sheet beside it.
  await withPage(asSam({ storage: { 'dndapp.sheetBeside': '1' } }), async (page) => {
    page.click('[data-tab=map]');
    assert.ok(page.visible('#tab-sheet'));
    assert.ok(page.visible('#tab-map'));
  });
});

test('sheet beside the map: the handle between them makes the sheet wider or narrower, and the width is kept', async () => {
  await withPage(asSam({ storage: { 'dndapp.sheetBeside': '1' } }), async (page) => {
    page.window.innerWidth = 1400;
    page.click('[data-tab=map]');
    const width = () => page.$('#app-view').style.getPropertyValue('--sheet-width');
    assert.equal(width(), '540px');

    // Dragging left widens the sheet (it's on the right).
    page.pointer('#sheet-splitter', 'pointerdown', { clientX: 800 });
    page.pointer('#sheet-splitter', 'pointermove', { clientX: 700 });
    assert.equal(width(), '640px');
    page.pointer('#sheet-splitter', 'pointerup', { clientX: 650 });
    assert.equal(width(), '690px');
    assert.equal(page.window.localStorage.getItem('dndapp.sheetWidth'), '690');
    assert.equal(page.$('#sheet-splitter').getAttribute('aria-valuenow'), '690');

    // The keyboard too; and never so wide the map disappears, or so narrow the sheet does.
    page.key('#sheet-splitter', 'ArrowRight');
    assert.equal(width(), '670px');
    page.key('#sheet-splitter', 'Home');
    assert.equal(width(), '1080px', 'the map keeps 320px');
    page.key('#sheet-splitter', 'End');
    assert.equal(width(), '320px');
  });
});

test('sheet window: Sheet window opens the sheet on its own; a blocked pop-up says so; it turns off the sheet beside the map', async () => {
  await withPage(asSam({ storage: { 'dndapp.sheetBeside': '1' } }), async (page, t) => {
    page.click('[data-tab=map]');
    assert.ok(page.visible('#tab-sheet'));
    page.click('#map-sheet-window');
    assert.deepEqual(page.opened, [{ url: `/?view=sheet&campaign=${t.campaign.id}`, name: `dndapp-sheet-${t.campaign.id}`, features: 'popup,width=760,height=900' }]);
    assert.ok(!page.visible('#tab-sheet'), 'one place for the sheet is enough');
    assert.equal(page.window.localStorage.getItem('dndapp.sheetBeside'), null);

    // From the Sheet tab too.
    page.click('[data-tab=sheet]');
    page.click('#sheet-popout');
    assert.equal(page.opened.length, 2);

    page.answers.open = false;
    page.click('#map-sheet-window');
    assert.match(page.dialogs.at(-1).message, /stopped the sheet window from opening/);
  });
});

test('sheet window: the page at ?view=sheet shows only the sheet, for the campaign it was opened from', async () => {
  const before = async (t) => {
    // Sam is in two campaigns; the window is for the second.
    const other = t.store.createCampaign('Other Campaign');
    t.auth.addMember(other.id, t.sam.id, 'player', 'Brom');
    return { other };
  };
  await withPage({ before, page: (t, { other }) => ({ as: t.sam, path: `/?view=sheet&campaign=${other.id}`, storage: NO_3D }) }, async (page, t, { other }) => {
    // The server serves the page at that address, and the new script.
    for (const url of [`/?view=sheet&campaign=${other.id}`, '/sheet-place.js']) assert.equal((await t.request('GET', url, { as: '' })).statusCode, 200, url);
    assert.ok(page.visible('#tab-sheet'));
    for (const tab of ['ask', 'notes', 'map']) assert.ok(!page.visible(`#tab-${tab}`), tab);
    assert.ok(page.document.documentElement.classList.contains('sheet-window'));
    assert.ok(!page.visible('#sheet-popout'));
    assert.ok(!page.visible('#sheet-beside-close'));
    assert.equal(page.text('#campaign-name'), 'Other Campaign');
    assert.equal(page.document.title, 'Brom · Other Campaign');
    // Only the sheet is loaded: no chats, notes or maps (and no live map stream).
    const paths = page.requests.map((r) => r.path);
    assert.ok(paths.includes(`/campaigns/${other.id}/sheet`));
    assert.ok(!paths.some((p) => /\/(maps|notes|conversations)/.test(p)), paths.join(', '));

    page.type(byLabel(page, 'Character name'), 'Brom');
    await saved(page);
    const res = (await t.request('GET', `/campaigns/${other.id}/sheet`, { as: t.sam.token })).json();
    assert.equal(res.sheet.name, 'Brom');
  });
});

test('sheet in two windows: each says when it saved, and the other shows the newer sheet unless it has changes of its own waiting', async () => {
  await withPage(asSam(), async (page, t) => {
    page.click('[data-tab=sheet]');
    page.type(byLabel(page, 'Character name'), 'Thorin');
    await saved(page);
    assert.deepEqual(page.broadcasts.at(-1), { name: 'dndapp.sheet', data: { campaignId: String(t.campaign.id), userId: String(t.sam.id), version: 1 } });

    // Another window saves a newer version.
    const put = async (name, version) => {
      const sheet = (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token })).json().sheet;
      await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...sheet, name }, version } });
    };
    await put('Thorin Oakenshield', 1);
    page.broadcast('dndapp.sheet', { campaignId: String(t.campaign.id), userId: String(t.sam.id), version: 2 });
    await page.waitFor(() => byLabel(page, 'Character name').value === 'Thorin Oakenshield', { what: 'the newer sheet' });

    // Someone else's sheet, or an old version: nothing happens.
    const requests = page.requests.length;
    page.broadcast('dndapp.sheet', { campaignId: String(t.campaign.id), userId: String(t.alex.id), version: 9 });
    page.broadcast('dndapp.sheet', { campaignId: String(t.campaign.id), userId: String(t.sam.id), version: 2 });
    await page.settle();
    assert.equal(page.requests.length, requests);

    // With a change waiting here, it isn't thrown away: saving it asks which to keep, as before.
    await put('Thorin II', 2);
    page.type(byLabel(page, 'Character name'), 'Thorin the Bold');
    page.broadcast('dndapp.sheet', { campaignId: String(t.campaign.id), userId: String(t.sam.id), version: 3 });
    assert.equal(byLabel(page, 'Character name').value, 'Thorin the Bold');
    await saved(page);
    assert.match(page.dialogs.at(-1).message, /changed in another tab/);
  });
});
