/**
 * The AI dates things (wiki space stage 4d): a page's time and dated events, in the campaign's calendar, an event
 * available only to the players who know it; approving with the DM's edits; a rejected one isn't proposed again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM } from './helpers.js';
import { calendarPreset } from '@dndapp/shared/calendar.js';

const change = (c) => ({ page_id: null, section_id: null, new_page: null, section: null, fact: null, when: null, event: null, players: [], sources: [], reason: 'A time.', ...c });

test('wiki AI times: set_when and add_event, audiences, edits, reject not repeated', async () => {
  let changes = [];
  let prompt = '';
  const llm = createFakeLLM({ wiki: (opts) => { prompt = JSON.stringify(opts.messages ?? opts); return { changes }; } });
  const t = await setup({ llm });
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  const run = async (list) => {
    changes = list;
    await t.kb.create(cid, 'test', { kind: 'note', title: `News ${Math.random()}`, body: 'Something new for the AI to read.' });
    await t.wikiAI.chronicle(cid);
    return (await t.request('GET', `${base}/proposals`)).json().proposals;
  };
  try {
    await t.request('PATCH', `/campaigns/${cid}/settings`, { body: { calendar: calendarPreset('harptos') } });
    const make = async (title, more = {}) => (await t.request('POST', base, { body: { title, available: 'all', sections: [{ heading: '', text: 'Something.', available: 'all' }], ...more } })).json().page;
    const mill = await make('Hollow Mill');
    const known = await t.kb.create(cid, 'test', { kind: 'event', title: 'Vex burned the mill', body: 'Vex set it alight [S1 00:00:20].', known_by: [t.sam.id] });
    const all = await t.kb.create(cid, 'test', { kind: 'event', title: 'The mill was built', body: 'Long ago.', sources: ['S1 00:01:00'] });

    // A page's time: read in the calendar, for the DM's card; the prompt says what time it is.
    let [p] = await run([change({ action: 'set_when', page_id: mill.id, when: '1400 DR', sources: [all.id] })]);
    assert.match(prompt, /<in_game_time>It is now/);
    assert.match(prompt, /Harptos|Hammer/);
    assert.equal(p.action, 'set_when');
    assert.equal(p.when.text, '1400 DR');
    assert.equal(p.current_when, null);
    let page = (await t.request('POST', `${base}/proposals/${p.id}/approve`, { body: { when: '1401 DR' } })).json().page;
    assert.equal(page.when.text, '1401 DR');
    assert.ok(Number.isFinite(page.when.from), 'dated on saving');
    // The same time again isn't proposed.
    assert.deepEqual(await run([change({ action: 'set_when', page_id: mill.id, when: '1401 DR' })]), []);

    // An event only Sam's character knows: only theirs; approved with an edit it's the DM's.
    [p] = await run([change({ action: 'add_event', page_id: mill.id, event: { when: 'Day 1 night', text: '[[Vex]] burned the mill.', canon: 'rumour', sources: [known.id] } })]);
    assert.equal(p.action, 'add_event');
    assert.deepEqual(p.event.available, [t.sam.id]);
    assert.equal(p.event.canon, 'rumour');
    page = (await t.request('POST', `${base}/proposals/${p.id}/approve`, { body: {} })).json().page;
    let [ev] = page.events;
    assert.equal(ev.text, '[[Vex]] burned the mill.');
    assert.deepEqual(ev.available, [t.sam.id]);
    assert.deepEqual(ev.sources, ['S1 00:00:20']);
    assert.equal(ev.by, 'ai');
    assert.ok(Number.isFinite(ev.when.from));
    const alex = (await t.request('GET', `${base}/timeline?as=${t.alex.id}`)).json();
    assert.ok(!alex.items.some((x) => x.type === 'event'), 'another player doesn\'t see it');
    const sam = (await t.request('GET', `${base}/timeline?as=${t.sam.id}`)).json();
    assert.ok(sam.items.some((x) => x.type === 'event' && x.text.includes('burned')));
    // The page already has it: not again.
    assert.deepEqual(await run([change({ action: 'add_event', page_id: mill.id, event: { when: '', text: '[[Vex]] burned the mill.', canon: 'true', sources: [] } })]), []);

    [p] = await run([change({ action: 'add_event', page_id: mill.id, event: { when: '', text: 'The miller left.', canon: 'true', sources: [all.id] } })]);
    page = (await t.request('POST', `${base}/proposals/${p.id}/approve`, { body: { event: { when: 'Day 2', text: 'The miller fled.' } } })).json().page;
    ev = page.events.find((e) => e.text === 'The miller fled.');
    assert.equal(ev.when.text, 'Day 2');
    assert.notEqual(ev.by, 'ai', 'edited, so the DM\'s');
    assert.equal(page.events[0].when.from, (await t.request('GET', `${base}/${mill.id}`)).json().page.events[0].when.from, 'old events keep their times');

    // Rejected: not proposed again. A new page can carry its time and events.
    [p] = await run([change({ action: 'add_event', page_id: mill.id, event: { when: 'Day 3', text: 'Rats moved in.', canon: 'true', sources: [all.id] } })]);
    await t.request('POST', `${base}/proposals/${p.id}/reject`, { body: {} });
    assert.deepEqual(await run([change({ action: 'add_event', page_id: mill.id, event: { when: 'Day 3', text: 'Rats moved in.', canon: 'true', sources: [all.id] } })]), []);
    [p] = await run([change({ action: 'new_page', new_page: { title: 'Session 1', kind: 'session', aliases: [], parent_title: null, sections: [{ heading: '', text: 'The fire.', sources: [all.id] }], facts: [], when: 'Day 1 to Day 2', events: [{ when: 'Day 1', text: 'The party met.', canon: 'true', sources: [all.id] }] } })]);
    assert.equal(p.when.text, 'Day 1 to Day 2');
    const s1 = (await t.request('POST', `${base}/proposals/${p.id}/approve`, { body: {} })).json().page;
    assert.equal(s1.when.text, 'Day 1 to Day 2');
    assert.deepEqual(s1.events.map((e) => [e.text, e.by, e.available]), [['The party met.', 'ai', 'all']]);
  } finally {
    await t.cleanup();
  }
});
