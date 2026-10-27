/**
 * When, and events on pages (stage 4b): the server works out the times from their text with the campaign's
 * calendar and clock, keeps them when the text stays the same, filters events for a player, indexes them
 * for Ask, and brings them back with an old version.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM } from './helpers.js';

const D = 1440;

test('wiki time: when and events are dated, kept, filtered, indexed and restored', async () => {
  const llm = createFakeLLM({ qaScript: [[{ tool: 'read_wiki_page', input: { title: 'Hollow Mill' } }, { answer: 'ok' }]] });
  const t = await setup({ llm });
  const base = `/campaigns/${t.campaign.id}/wiki`;
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/clock`, { body: { set: 20 * D } });
    const made = (await t.request('POST', base, {
      body: {
        title: 'Hollow Mill',
        available: 'all',
        when: { text: '300 years ago' },
        sections: [{ heading: '', text: 'An old mill.', available: 'all' }],
        events: [
          { when: { text: 'Day 12 night' }, text: 'The mill burned.', available: 'all' },
          { when: { text: 'Day 14' }, text: 'Cultists meet here.', available: 'all', canon: 'planned' },
          { when: { text: 'Day 2' }, text: 'Thorin hid the key here.', available: [t.sam.id] },
          { when: { text: 'in the age of dragons' }, text: 'Built by giants.', available: 'all', canon: 'false', truth: 'Built by the Baron.' },
          { when: null, text: 'Haunted, they say.', available: 'dm' },
        ],
      },
    })).json().page;
    assert.deepEqual(made.when, { text: '300 years ago', from: 20 * D - 300 * 365 * D, to: 21 * D - 300 * 365 * D }, 'that day');
    assert.deepEqual(made.events.map((e) => [e.when?.from ?? null, e.when?.to ?? null]), [[11 * D + 22 * 60, 12 * D + 360], [13 * D, 14 * D], [D, 2 * D], [null, null], [null, null]]);

    // The clock moves on; the text stays the same, so the time does too. A changed text is read again.
    await t.request('POST', `/campaigns/${t.campaign.id}/clock`, { body: { add: 10 * D } });
    const events = made.events.map(({ id, when, text, available, canon, truth }) => ({ id, when: when && { text: when.text }, text, available, canon, ...(truth && { truth }) }));
    events[0].when = { text: 'Day 13' };
    const saved = (await t.request('PUT', `${base}/${made.id}`, { body: { version: made.version, when: { text: '300 years ago' }, events } })).json().page;
    assert.equal(saved.when.from, made.when.from, '"300 years ago" doesn\'t drift');
    assert.deepEqual([saved.events[0].when.from, saved.events[1].when.from], [12 * D, 13 * D]);

    const alex = (await t.request('GET', `${base}/${made.id}?as=${t.alex.id}`)).json().page;
    assert.deepEqual(alex.events.map((e) => [e.text, e.canon]), [['The mill burned.', 'true'], ['Built by giants.', 'rumour']]);
    assert.doesNotMatch(JSON.stringify(alex), /Cultists|Thorin hid|Haunted|Baron|planned/);
    const sam = (await t.request('GET', `${base}/${made.id}?as=${t.sam.id}`)).json().page;
    assert.ok(sam.events.some((e) => e.text === 'Thorin hid the key here.'));

    // Ask reads the events dated, as the player may see them.
    assert.equal((await t.request('POST', `/campaigns/${t.campaign.id}/ask`, { as: t.alex.token, body: { question: 'What happened at the mill on Day 13?' } })).statusCode, 200);
    const saw = llm.calls.at(-1).toolResults.map((r) => r.result).join('\n');
    assert.match(saw, /Day 13: The mill burned\./);
    assert.match(saw, /in the age of dragons: \[rumour\] Built by giants\./);
    assert.doesNotMatch(saw, /Cultists|Thorin hid|Haunted|Baron/);
    const hits = await t.search.search(t.campaign.id, 'mill burned', { kinds: ['wiki'], viewer: { userId: t.alex.id, seesAll: false }, limit: 10 });
    assert.ok(hits.some((h) => /Day 13: The mill burned/.test(h.text)), 'indexed for a player');

    // An old version brings its times back as they were.
    const back = (await t.request('POST', `${base}/${made.id}/restore`, { body: { version: 1 } })).json().page;
    assert.equal(back.events[0].when.from, 11 * D + 22 * 60);
  } finally {
    await t.cleanup();
  }
});
