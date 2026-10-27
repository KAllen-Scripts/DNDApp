/**
 * Truth and rumour on the page (stage 3a): the DM marks a section false with
 * the truth beside it, the badges show it, the Truth toggle hides what's only
 * believed, and a player (viewed as) gets the falsehood as a rumour.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';

const button = (page, scope, text) => page.$$(`${scope} button`).find((b) => b.textContent.trim() === text);

test('wiki canon: the DM marks a part false with its truth, the Truth toggle and View as follow it', async () => {
  await withPage({
    before: async (t) => {
      const dana = await addDm(t);
      const mill = (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: {
        title: 'Hollow Mill', available: 'all',
        sections: [{ heading: 'Talk', text: 'A ghost turns the wheel.', available: 'all', canon: 'rumour' }, { heading: 'The miller', text: 'He drowned in the race.', available: 'all' }],
        facts: [{ label: 'Owner', value: 'Old Jory', available: 'all', canon: 'planned' }],
      } })).json().page;
      return { dana, mill };
    },
    page: (t, { dana, mill }) => ({ as: dana, path: `/?space=wiki#/page/${mill.id}` }),
  }, async (page, t, { mill }) => {
    await page.waitFor(() => page.$('#wiki-main .wiki-section'));
    assert.equal(page.text('.wiki-section.canon-rumour .wiki-canon'), 'Rumour');
    assert.equal(page.text('dd.canon-planned .wiki-canon'), 'Planned');

    page.click(button(page, '#wiki-main', 'Edit'));
    const form = page.$('.wiki-editor');
    const picks = form.querySelectorAll('select.wiki-canon-pick');
    assert.equal(picks[0].value, 'planned', 'the fact keeps its canon in the editor');
    const miller = [...form.querySelectorAll('.wiki-edit-section')][1];
    page.type(miller.querySelector('select.wiki-canon-pick'), 'false');
    const truth = miller.querySelector('.wiki-truth-box');
    assert.ok(!truth.hidden);
    page.type(truth, 'He lives, hiding in the cellar.');
    page.submit(form);
    await page.waitFor(() => page.$('#wiki-main .wiki-section.canon-false'));

    const saved = t.wiki.get(t.campaign.id, mill.id);
    assert.deepEqual(saved.sections.map((s) => s.canon), ['rumour', 'false']);
    assert.equal(saved.sections[1].truth, 'He lives, hiding in the cellar.');
    assert.equal(saved.facts[0].canon, 'planned');
    assert.match(page.text('.wiki-section.canon-false'), /Truth: He lives, hiding in the cellar\./);

    // The Truth toggle: what's true only.
    const toggle = page.$('#wiki-truth');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    page.click(toggle);
    assert.ok(page.$('#tab-wiki').hasAttribute('data-truth'));
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    page.click(toggle);
    assert.ok(!page.$('#tab-wiki').hasAttribute('data-truth'));

    // As a player: the falsehood is a rumour, the truth and the planned fact are gone.
    page.type('#wiki-main select[aria-label="View as"]', String(t.alex.id));
    await page.waitFor(() => page.text('#wiki-main').includes('What Ask can tell'));
    const content = page.$('#wiki-main .wiki-content');
    assert.equal(content.querySelectorAll('.canon-false').length, 0);
    assert.equal(content.querySelectorAll('.wiki-section.canon-rumour').length, 2);
    assert.doesNotMatch(content.textContent, /cellar|Old Jory|Planned|False/);
    assert.equal(page.errors.length, 0, page.errors.join('\n'));
  });
});
