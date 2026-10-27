/**
 * Templates on the page (wiki space stage 5a): a new page starts from the kind's template (prompts as
 * placeholders, unwritten sections dropped), the Templates view, and making your own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

test('wiki templates: a new NPC starts from the Person template; the DM makes their own', async () => {
  await withPage({
    before: async (t) => ({ dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/new' }),
  }, async (page, t) => {
    await page.waitFor(() => page.$('[aria-label="Start from"]')?.querySelectorAll('option').length > 5);
    page.type(page.$('[aria-label="Title"]'), 'Hilda');
    page.type(page.$('[aria-label="Kind"]'), 'npc');
    await page.waitFor(() => page.$$('[aria-label="Section heading"]')[0]?.value === 'At the table');
    assert.equal(page.$('[aria-label="Title"]').value, 'Hilda', 'the title stays');
    assert.equal(page.$('[aria-label="Start from"]').value, 'starter-person');
    assert.match(page.$$('[aria-label="Section text"]')[0].placeholder, /Voice and manner/);
    assert.match(page.$$('[aria-label="Fact value"]')[0].placeholder, /Half-elf/);
    page.type(page.$$('[aria-label="Section text"]')[0], 'Gruff, wants her mill back.');
    page.type(page.$$('[aria-label="Fact value"]')[0], 'Dwarf');
    page.click([...page.$$('button')].find((b) => b.textContent === 'Make page'));
    await page.waitFor(() => page.text('#wiki-status').includes('Made "Hilda"'));
    const [hilda] = t.wiki.list(t.campaign.id);
    assert.deepEqual(hilda.sections.map((s) => [s.heading, s.text, s.available, s.canon]), [['At the table', 'Gruff, wants her mill back.', 'dm', 'planned']], 'unwritten sections dropped');
    assert.deepEqual(hilda.facts.map((f) => [f.label, f.value]), [['Race', 'Dwarf']]);

    // Templates: make my own from the Place starter.
    page.click(page.$$('.wiki-rail-btn').find((b) => b.textContent.includes('Templates')));
    await page.waitFor(() => page.$$('.wiki-template-card').length >= 10);
    const place = page.$$('.wiki-template-card').find((c) => c.textContent.includes('Place'));
    page.click([...place.querySelectorAll('button')].find((b) => b.textContent === 'Make my own from this'));
    await page.waitFor(() => page.$('.wiki-template-editor'));
    page.type(page.$('[aria-label="Title"]'), 'Tavern');
    page.type(page.$('[aria-label="Kind"]'), 'tavern');
    page.type(page.$$('[aria-label="Writing prompt"]')[0], 'The smell, the noise, the barkeep.');
    page.click([...page.$$('button')].find((b) => b.textContent === 'Make template'));
    await page.waitFor(() => page.$$('.wiki-template-card').some((c) => c.textContent.includes('Tavern')));
    const [mine] = t.wiki.templates(t.campaign.id);
    assert.equal(mine.kind, 'tavern');
    assert.equal(mine.sections[0].text, 'The smell, the noise, the barkeep.');
    assert.equal(t.wiki.list(t.campaign.id).length, 1, 'not a page');
    // A new tavern starts from it.
    page.click(page.$$('.wiki-rail-btn').find((b) => b.textContent.includes('New page')));
    await page.waitFor(() => page.$('[aria-label="Start from"]')?.querySelector('optgroup[label="Yours"]'));
    page.type(page.$('[aria-label="Kind"]'), 'Tavern');
    await page.waitFor(() => page.$$('[aria-label="Section text"]')[0]?.placeholder === 'The smell, the noise, the barkeep.');
    await page.settle();
  });
});
