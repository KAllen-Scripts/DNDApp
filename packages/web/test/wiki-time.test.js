/**
 * When, and events on pages (stage 4b): the DM gives a page a time and an event in the editor, with what
 * each reads as by the calendar; the page shows them in order, dated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';
import { calendarPreset } from '../../shared/src/calendar.js';

const button = (page, scope, text) => page.$$(`${scope} button`).find((b) => b.textContent.trim() === text);

test('wiki time: the DM dates a page and adds events; the page shows them by the calendar, in order', async () => {
  await withPage({
    before: async (t) => {
      const dana = await addDm(t);
      await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { calendar: calendarPreset('harptos') } });
      const mill = (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: {
        title: 'Hollow Mill', available: 'all',
        sections: [{ heading: '', text: 'An old mill.', available: 'all' }],
        events: [{ when: { text: 'Day 5' }, text: 'The wheel stopped.', available: 'all' }],
      } })).json().page;
      return { dana, mill };
    },
    page: (t, { dana, mill }) => ({ as: dana, path: `/?space=wiki#/page/${mill.id}` }),
  }, async (page, t, { mill }) => {
    await page.waitFor(() => page.$('#wiki-main .wiki-event'));
    assert.equal(page.text('.wiki-event-when'), '5 Hammer 1492 DR');

    page.click(button(page, '#wiki-main', 'Edit'));
    const form = page.$('.wiki-editor');
    const when = form.querySelector('input[aria-label="When"]');
    page.type(when, '3 Mirtul 1492 at dusk');
    assert.equal(page.text(when.parentElement.querySelector('.wiki-when-says')), 'Reads as 3 Mirtul 1492 DR dusk');
    page.type(when, 'long ago');
    assert.match(page.text(when.parentElement.querySelector('.wiki-when-says')), /Kept as written/);
    page.type(when, 'Day 2');
    page.click(button(page, '.wiki-edit-events', '+ Add an event'));
    const rows = form.querySelectorAll('.wiki-event-row');
    page.type(rows[1].querySelector('input[aria-label="When it happened"]'), 'Day 3 night');
    page.type(rows[1].querySelector('input[aria-label="What happened"]'), 'A light in the loft.');
    page.type(rows[1].querySelector('select.wiki-canon-pick'), 'rumour');
    page.submit(form);
    await page.waitFor(() => page.$$('#wiki-main .wiki-event').length === 2);

    const saved = t.wiki.get(t.campaign.id, mill.id);
    assert.deepEqual(saved.when, { text: 'Day 2', from: 1440, to: 2880 });
    assert.deepEqual(saved.events.map((e) => [e.text, e.when.from, e.canon]), [['The wheel stopped.', 4 * 1440, 'true'], ['A light in the loft.', 2 * 1440 + 22 * 60, 'rumour']]);
    assert.equal(page.text('.wiki-when'), '◷ 2 Hammer 1492 DR');
    assert.deepEqual(page.$$('.wiki-event-when').map((e) => e.textContent), ['3 Hammer 1492 DR night', '5 Hammer 1492 DR'], 'in order of when');
    assert.equal(page.text('.wiki-event.canon-rumour .wiki-canon'), 'Rumour');
    assert.equal(page.errors.length, 0, page.errors.join('\n'));
  });
});
