/**
 * The AI's times and events on the Waiting page (wiki space stage 4d), and a journey on the Timeline.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, createFakeLLM } from './helpers.js';

test('wiki times: the DM edits an event the AI proposes and approves a time', async () => {
  let mill;
  const llm = createFakeLLM({
    wiki: () => ({ changes: [
      { action: 'set_when', page_id: mill.id, section_id: null, new_page: null, section: null, fact: null, when: 'Day 3', event: null, players: [], sources: [], reason: 'It burned then.' },
      { action: 'add_event', page_id: mill.id, section_id: null, new_page: null, section: null, fact: null, when: null, event: { when: 'Day 3 night', text: '[[Vex]] burned it.', canon: 'rumour', sources: [] }, players: [], sources: [], reason: 'The fire.' },
    ] }),
  });
  await withPage({
    setup: { llm },
    before: async (t) => {
      const dana = await addDm(t);
      mill = await t.wiki.create(t.campaign.id, { title: 'Hollow Mill', available: 'all', sections: [{ heading: '', text: 'A mill.', available: 'all' }], when: { text: 'Day 1' } }, { by: dana.id });
      await t.kb.create(t.campaign.id, 'test', { kind: 'event', title: 'The fire', body: 'It burned.' });
      t.jobs.enqueueWiki(t.campaign.id);
      await t.jobs.idle();
      return { dana };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/waiting' }),
  }, async (page, t) => {
    await page.waitFor(() => page.$$('.wiki-proposal').length === 2);
    const [time, event] = page.$$('.wiki-proposal');
    assert.match(time.textContent, /Time.*Hollow Mill/);
    assert.match(time.textContent, /Now[\s\S]*Day 1[\s\S]*Proposed[\s\S]*Day 3/);
    assert.match(event.textContent, /Event.*Hollow Mill[\s\S]*Day 3 night[\s\S]*burned it[\s\S]*\(rumour\)/);
    page.click([...event.querySelectorAll('button')].find((b) => b.textContent === 'Edit'));
    page.type(event.querySelector('[aria-label="Proposed event"]'), 'Vex set the mill alight.');
    page.click([...event.querySelectorAll('button')].find((b) => b.textContent === 'Approve with my changes'));
    await page.waitFor(() => page.text('#wiki-status').includes('Approved: Hollow Mill'));
    await page.waitFor(() => page.$$('.wiki-proposal').length === 1);
    page.click([...page.$('.wiki-proposal').querySelectorAll('button')].find((b) => b.textContent === 'Approve'));
    await page.waitFor(() => t.wiki.get(t.campaign.id, mill.id).when.text === 'Day 3');
    const ev = t.wiki.get(t.campaign.id, mill.id).events;
    assert.deepEqual(ev.map((e) => [e.when.text, e.text, e.canon]), [['Day 3 night', 'Vex set the mill alight.', 'rumour']]);
    await page.settle();
  });
});
