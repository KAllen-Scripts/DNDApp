/**
 * The Web (wiki space stage 3d) on the page: portraits and lines round a
 * page, a card with Open page and Add a link, which saves a fact.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, createFakeLLM } from './helpers.js';

test('wiki web: the DM sees the ties round a page and adds one from the card', async () => {
  await withPage({
    before: async (t) => {
      const dana = await addDm(t);
      const make = async (body) => (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: { available: 'all', sections: [{ heading: '', text: 'Someone.', available: 'all' }], ...body } })).json().page;
      const thorin = await make({ title: 'Thorin', kind: 'npc', facts: [{ label: 'Rival', value: '[[Vex]]' }] });
      await make({ title: 'Vex', kind: 'npc' });
      const mira = await make({ title: 'Mira', kind: 'npc' });
      return { dana, thorin, mira };
    },
    page: (t, { dana, thorin }) => ({ as: dana, path: `/?space=wiki#/web/${thorin.id}` }),
  }, async (page, t, { thorin, mira }) => {
    await page.waitFor(() => page.$$('.wiki-web-node').length === 2);
    assert.ok(page.$('.wiki-web-node.middle').textContent.includes('Thorin'));
    assert.ok(page.$('.wiki-web-line.tone-hostile'), 'a rival is a hostile line');
    assert.match(page.text('.wiki-web-lines'), /Rival/);

    page.click('.wiki-web-node.middle');
    assert.ok(!page.$('.wiki-web-card').hidden);
    page.click(page.$$('.wiki-web-card button').find((b) => b.textContent === 'Add a link…'));
    page.type('.wiki-web-add [aria-label="How they are tied"]', 'Ally');
    page.type('.wiki-web-add [aria-label="Tied to"]', mira.id);
    page.submit(page.$('.wiki-web-add'));
    await page.waitFor(() => page.$$('.wiki-web-node').length === 3);
    assert.deepEqual(t.wiki.get(t.campaign.id, thorin.id).facts.map((f) => `${f.label}: ${f.value}`), ['Rival: [[Vex]]', 'Ally: [[Mira]]']);

    // The Whole web chip, and the rail's Web.
    page.click(page.$$('.wiki-web-bar button').find((b) => b.textContent === 'Whole web'));
    await page.waitFor(() => page.window.location.hash === '#/web');
    assert.ok(page.$('#wiki-rail .wiki-rail-btn.current').textContent.includes('Web'));
    assert.equal(page.errors.length, 0, page.errors.join('\n'));
  });
});

test("wiki web: the AI's tie waits as a card beside what the page says now; edited, it is approved", async () => {
  let thorin;
  const llm = createFakeLLM({
    wiki: ({ prompt }) => {
      const id = Number(/#(\d+) Vex hates Thorin/.exec(prompt)?.[1]);
      return { changes: [{ action: 'set_fact', page_id: thorin.id, section_id: null, new_page: null, section: null, fact: { label: 'Ally', value: '[[Vex]]', tone: null, canon: 'rumour', sources: [id] }, players: [], sources: [], reason: 'They talk.' }] };
    },
  });
  await withPage({
    setup: { llm },
    before: async (t) => {
      const dana = await addDm(t);
      thorin = await t.wiki.create(t.campaign.id, { title: 'Thorin', available: 'all', sections: [{ heading: '', text: 'A dwarf.', available: 'all' }], facts: [{ label: 'Ally', value: 'Nobody', available: 'all' }] }, { by: dana.id });
      await t.wiki.create(t.campaign.id, { title: 'Vex', available: 'all', sections: [{ heading: '', text: 'A rogue.', available: 'all' }] }, { by: dana.id });
      await t.kb.create(t.campaign.id, 'test', { kind: 'npc', title: 'Vex hates Thorin', body: 'Vex swore revenge.' });
      t.jobs.enqueueWiki(t.campaign.id);
      await t.jobs.idle();
      return { dana };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/waiting' }),
  }, async (page, t) => {
    await page.waitFor(() => page.$$('.wiki-proposal').length === 1);
    const card = page.$('.wiki-proposal');
    assert.match(card.textContent, /Tie.*Thorin › Ally/);
    assert.match(card.textContent, /Now[\s\S]*Nobody[\s\S]*Proposed[\s\S]*Vex[\s\S]*\(rumour\)/);
    page.click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Edit'));
    page.type(card.querySelector('[aria-label="Proposed tie"]'), 'Rival');
    page.type(card.querySelector('[aria-label="How they feel"]'), 'hostile');
    page.click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Approve with my changes'));
    await page.waitFor(() => page.text('#wiki-status').includes('Approved: Thorin'));
    const facts = t.wiki.get(t.campaign.id, thorin.id).facts;
    assert.deepEqual(facts.map((f) => [f.label, f.value, f.tone ?? null, f.canon]), [['Rival', '[[Vex]]', 'hostile', 'rumour']]);
    await page.settle();
  });
});
