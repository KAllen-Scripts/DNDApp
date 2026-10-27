/**
 * The Timeline (wiki space stage 4c) on the page: lanes with cards and bars, the calendar's names on the scale,
 * a card with Show on the map (the Atlas at the place, its pin pulsing), a lane of the DM's own, the trays, and
 * the compass's mini-ribbon opening it at a page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, importMap, mapReading, createFakeLLM } from './helpers.js';
import { calendarPreset } from '../../shared/src/calendar.js';

const button = (page, scope, text) => page.$$(`${scope} button`).find((b) => b.textContent.trim() === text);

test('wiki timeline: lanes, a card that shows the place on the map, a lane of your own, and the compass', async () => {
  await withPage({
    setup: { llm: createFakeLLM({ structured: async () => mapReading() }) },
    before: async (t) => {
      const dana = await addDm(t);
      await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { calendar: calendarPreset('harptos') } });
      const make = async (body) => (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { available: 'all', sections: [{ heading: '', text: 'Text.', available: 'all' }], ...body } })).json().page;
      const mill = await make({ title: 'Hollow Mill', kind: 'place', when: { text: 'Day 3' }, events: [
        { when: { text: 'Day 2 night' }, text: 'A light in the loft.', canon: 'rumour' },
        { when: { text: '300 years ago' }, text: 'Built by giants.' },
        { when: { text: 'once upon a time' }, text: 'Haunted.' },
      ] });
      await make({ title: 'Session 1', kind: 'session' });
      const map = await importMap(t, { patch: { shown: true, name: 'The Vale' } });
      await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${map.id}/places`, { body: { add: { name: 'Hollow Mill', x: 100, y: 100, revealed: true, page: { id: mill.id } } } });
      return { dana, mill, map };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/timeline' }),
  }, async (page, t, { mill, map }) => {
    await page.waitFor(() => page.$$('.wiki-tl-item').length === 3);
    assert.deepEqual(page.$$('.wiki-tl-lane-name').map((n) => n.textContent), ['History', 'The campaign']);
    assert.ok(page.$('.wiki-tl-lane[data-lane=history] .wiki-tl-item.event'), 'built 300 years ago: History');
    assert.ok(page.$('.wiki-tl-lane[data-lane=campaign] .wiki-tl-item.page.fam-place'));
    assert.ok(page.$('.wiki-tl-item.canon-rumour'));
    assert.ok(page.$$('.wiki-tl-tick').some((x) => /DR/.test(x.textContent)), 'the calendar on the scale');
    assert.match(page.text('.wiki-tl-trays'), /Haunted\..*Session 1/s);
    assert.ok(page.$('#wiki-rail .wiki-rail-btn.current').textContent.includes('Timeline'));

    page.click('.wiki-tl-item.page');
    const card = page.$('.wiki-tl-card');
    assert.ok(!card.hidden);
    assert.match(card.textContent, /3 Hammer 1492 DR/);
    page.click(button(page, '.wiki-tl-card', 'Show on the map (The Vale)'));
    await page.waitFor(() => page.$('.map-wiki-pin.pulse'), { what: 'the pin pulsing' });
    assert.equal(page.window.location.hash, `#/atlas/${map.id}`);
    assert.ok(page.$('.map-wiki-card'), 'its card open');
    page.click(button(page, '.map-wiki-card', 'On the timeline'));
    await page.waitFor(() => page.$('.wiki-tl-item.focus'));
    assert.equal(page.window.location.hash, `#/timeline/${mill.id}`);

    // A lane of the DM's own.
    page.type('.wiki-tl-head select[aria-label="Add a lane"]', mill.id);
    await page.waitFor(() => page.$(`.wiki-tl-lane[data-lane="${mill.id}"]`));
    assert.deepEqual(t.store.getSettings(t.campaign.id).wiki.lanes, [mill.id]);
    assert.deepEqual(page.$$('.wiki-tl-lane-name').map((n) => n.textContent.replace('✕', '')), ['Hollow Mill', 'The campaign'], 'it takes its page\'s times; History is left empty, so out');
    assert.equal(page.$$(`.wiki-tl-lane[data-lane="${mill.id}"] .wiki-tl-item`).length, 3);
    page.click(page.$('.wiki-tl-lane-name button[aria-label^="Remove the lane"]'));
    await page.waitFor(() => !page.$(`.wiki-tl-lane[data-lane="${mill.id}"]`));
    assert.deepEqual(t.store.getSettings(t.campaign.id).wiki.lanes, []);

    // The page's compass: its moments on a mini-ribbon, to the Timeline.
    await page.click(page.$$('.wiki-tl-item.page')[0]);
    page.click(button(page, '.wiki-tl-card', 'Open page'));
    await page.waitFor(() => page.$('.wiki-compass-ribbon'));
    page.click('.wiki-compass-ribbon');
    await page.waitFor(() => page.window.location.hash === `#/timeline/${mill.id}`);
    assert.equal(page.errors.length, 0, page.errors.join('\n'));
  });
});
