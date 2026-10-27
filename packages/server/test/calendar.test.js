/**
 * The campaign's calendar on the server (wiki space stage 4a): the DM sets it in the settings (cleaned),
 * the clock route gives it, and the map events the archivist reads name the dates by it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { mapEvents } from '../src/maps/events.js';
import { calendarPreset } from '@dndapp/shared/calendar.js';

test('calendar: the DM sets it, everyone reads it from the clock, a player can\'t change it', async () => {
  const t = await setup();
  const url = `/campaigns/${t.campaign.id}/settings`;
  try {
    assert.deepEqual((await t.request('GET', `/campaigns/${t.campaign.id}/clock`)).json(), { clock: 480, calendar: null });
    const saved = (await t.request('PATCH', url, { body: { calendar: { ...calendarPreset('harptos'), era: 'Dale Reckoning, far too long', extra: 1 } } })).json();
    assert.equal(saved.calendar.era, 'Dale Reckoni', 'cleaned (12 letters at most)');
    assert.equal(saved.calendar.extra, undefined);
    assert.equal(saved.weight, 'capacity', 'the rest stay');
    const clock = (await t.request('GET', `/campaigns/${t.campaign.id}/clock`, { as: t.sam.token })).json();
    assert.equal(clock.calendar.months[0].name, 'Hammer');
    assert.equal((await t.request('PATCH', url, { body: { calendar: null }, as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('PATCH', url, { body: { calendar: null } })).json().calendar, null, 'back to Day N');
  } finally {
    await t.cleanup();
  }
});

test('calendar: map events read the campaign\'s dates', () => {
  const image = { file: 'image.png', type: 'image/png', width: 100, height: 100 };
  const at = (h, m = 0) => new Date(2026, 9, 8, h, m).toISOString();
  const tok = (id, name, journey = null) => ({ id, name, kind: 'pc', user_id: 1, x: 10, y: 10, journey });
  const j = { from: { x: 10, y: 10 }, to: { x: 90, y: 10 }, leaves: 480, arrives: 2160, pace: 'normal', miles: 30, to_name: 'Daggerford' };
  const histories = [{
    id: 'aaaaaaaaaa',
    entries: [
      { saved_at: at(19), changes: [{ p: [], v: { name: 'The Vale', image, shown: true, tokens: [tok('aaa111', 'Thorin')] } }] },
      { saved_at: at(19, 5), reason: 'journey', changes: [{ p: ['tokens', 0, 'journey'], v: j }] },
      { saved_at: at(19, 30), reason: 'clock', changes: [{ p: ['tokens', 0, 'journey'], v: null }] },
    ],
  }];
  assert.deepEqual(mapEvents(histories, { date: '2026-10-08', rolloverHour: 6, calendar: calendarPreset('harptos') }).slice(1), [
    '[19:05] Thorin set off for Daggerford on "The Vale" (30 miles, 1 day 4 hours at a normal pace; left 1 Hammer 1492 DR, 08:00 · Full moon, due 2 Hammer 1492 DR, 12:00).',
    '[19:30] Thorin arrived at Daggerford on "The Vale" (2 Hammer 1492 DR, 12:00).',
  ]);
});
