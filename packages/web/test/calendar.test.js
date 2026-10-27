/**
 * The calendar on the page (wiki space stage 4a): the DM picks Harptos in Campaign settings, changes it in
 * the editor, and the map's clock reads the date (live, for everyone's page).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, importMap, mapReading, createFakeLLM } from './helpers.js';

test('calendar: the DM picks Harptos, renames the era, and the map clock reads the date', async () => {
  await withPage({
    setup: { llm: createFakeLLM({ structured: async () => mapReading() }) },
    before: async (t) => ({ map: await importMap(t, { patch: { shown: true, name: 'The Vale' } }), dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    page.click('[data-tab=map]');
    await page.settle();
    assert.equal(page.text('#map-clock'), 'Day 1, 08:00');

    page.click('#settings-open');
    const settings = page.$('#settings-dialog');
    assert.match(page.text(settings.querySelector('#calendar-says')), /Day 1, Day 2/);
    page.type(settings.querySelector('#setting-calendar'), 'harptos');
    await page.settle();
    assert.equal(t.store.getSettings(t.campaign.id).calendar.preset, 'harptos');
    assert.equal(page.text('#map-clock'), '1 Hammer 1492 DR, 08:00 · Full moon', 'the clock heard it');
    assert.match(page.text(settings.querySelector('#calendar-says')), /Day 1 is 1 Hammer 1492 DR/);

    const editor = settings.querySelector('.cal-editor');
    page.type(editor.querySelector('[aria-label="Era"]'), 'Dalereckoning');
    page.type(editor.querySelector('[aria-label="Year of day 1"]'), '1372');
    page.click([...editor.querySelectorAll('button')].find((b) => b.textContent === 'Save calendar'));
    await page.settle();
    const cal = t.store.getSettings(t.campaign.id).calendar;
    assert.deepEqual([cal.era, cal.start.year, cal.months.length], ['Dalereckonin', 1372, 18]);
    assert.equal(page.text('#map-clock'), '1 Hammer 1372 Dalereckonin, 08:00 · Full moon');

    page.type(settings.querySelector('#setting-calendar'), '');
    await page.settle();
    assert.equal(t.store.getSettings(t.campaign.id).calendar, null);
    assert.equal(page.text('#map-clock'), 'Day 1, 08:00');
  });
});
