/**
 * The DM's Wiki tab on the page: only the DM has it; the DM makes a page with
 * a section for one player and a block only for the DM, follows a [[link]],
 * views it as a player, edits it and brings an earlier version back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, createFakeLLM } from './helpers.js';

const button = (page, scope, text) => page.$$(`${scope} button`).find((b) => b.textContent.trim() === text);

test('wiki tab: only the DM has it', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    assert.ok(!page.visible('[data-tab=wiki]'));
    assert.ok(!page.requests.some((r) => r.path.includes('/wiki')), "a player's page never asks for the wiki");
  });
});

test('wiki tab: the DM makes a page, links it, sees it as a player, edits it and brings back the first version', async () => {
  await withPage({
    before: async (t) => ({ dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    assert.ok(page.visible('[data-tab=wiki]'));
    page.click('[data-tab=wiki]');
    assert.ok(page.visible('#tab-wiki'));
    assert.match(page.text('#wiki-list'), /No pages yet/);

    page.click('#wiki-new');
    let form = page.$('.wiki-editor');
    page.type(form.querySelector('[aria-label=Title]'), 'The Grey Lady');
    page.type(form.querySelector('[aria-label=Kind]'), 'npc');
    page.type(form.querySelector('[aria-label="Other names"]'), 'Ilse Varn');
    page.type(form.querySelector('[aria-label="Page available to"]'), 'all');
    page.type(form.querySelector('[aria-label="Section text"]'), 'A ghost at the [[Hollow Mill]].\n:::for Thorin\nShe hid the deed under the millstone.\n:::\n:::dm\nShe betrays them at the full moon.\n:::');
    page.submit(form);
    await page.waitFor(() => page.text('#wiki-main').includes('Available to everyone'));
    const [lady] = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki`)).json().pages;
    assert.equal(lady.title, 'The Grey Lady');
    assert.deepEqual(lady.aliases, ['Ilse Varn']);
    assert.match(page.text('#wiki-main'), /Only for Thorin/);
    assert.match(page.text('#wiki-main'), /Only you/);

    // As Thorin's player: the shared part and Thorin's block, never the DM's.
    page.type('#wiki-main select[aria-label="View as"]', String(t.sam.id));
    await page.waitFor(() => page.text('#wiki-main').includes('What Ask can tell Thorin'));
    assert.match(page.text('#wiki-main'), /millstone/);
    assert.doesNotMatch(page.text('#wiki-main'), /full moon/);
    page.type('#wiki-main select[aria-label="View as"]', String(t.alex.id));
    await page.waitFor(() => page.text('#wiki-main').includes('What Ask can tell Lyra'));
    assert.doesNotMatch(page.text('#wiki-main'), /millstone|full moon/);

    // A link to a page that doesn't exist yet offers to make it.
    page.click(page.$('#wiki-main button.wiki-link.missing'));
    form = page.$('.wiki-editor');
    assert.equal(form.querySelector('[aria-label=Title]').value, 'Hollow Mill');
    page.type(form.querySelector('[aria-label="Section text"]'), 'An old mill north of Brindle.');
    page.submit(form);
    await page.waitFor(() => page.text('#wiki-main').includes('Mentioned in: The Grey Lady'));
    assert.match(page.text('#wiki-main'), /Available to only you/, 'a new page is only the DM\'s');

    // Edit the Grey Lady, then bring her first version back.
    page.click(button(page, '#wiki-list', 'The Grey Lady shared'));
    await page.waitFor(() => page.text('#wiki-main h2') === 'The Grey Lady');
    page.click(button(page, '#wiki-main', 'Edit'));
    form = page.$('.wiki-editor');
    page.type(form.querySelector('[aria-label=Title]'), 'The Pale Lady');
    page.submit(form);
    await page.waitFor(() => page.text('#wiki-main h2') === 'The Pale Lady');
    assert.match(page.text('#wiki-main'), /also called Ilse Varn, The Grey Lady/);
    page.click(button(page, '#wiki-main', 'History'));
    await page.waitFor(() => page.$$('.wiki-history li').length === 2);
    page.click(button(page, '.wiki-history', 'Version 1'));
    await page.waitFor(() => !!button(page, '#wiki-main', 'Bring this version back'));
    page.click(button(page, '#wiki-main', 'Bring this version back'));
    await page.waitFor(() => page.text('#wiki-main h2') === 'The Grey Lady');
    await page.settle();
    const back = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${lady.id}`)).json().page;
    assert.equal(back.version, 3);
  });
});

test("wiki tab: the AI's changes wait in a list; the DM edits one before approving and approves a reveal", async () => {
  let secrets;
  let samId;
  const llm = createFakeLLM({
    wiki: ({ prompt }) => {
      const id = (title) => Number(new RegExp(`#(\\d+) ${title}`).exec(prompt)?.[1]);
      return {
        changes: [
          { action: 'new_page', page_id: null, section_id: null, new_page: { title: 'The Mill', kind: 'place', aliases: [], parent_title: null, sections: [{ heading: 'Where', text: 'North of Brindle.', sources: [id('The mill')] }] }, section: null, players: [], sources: [], reason: 'A new place.' },
          { action: 'reveal', page_id: secrets.id, section_id: secrets.sections[0].id, new_page: null, section: null, players: [samId], sources: [id('The ledger')], reason: 'Thorin read the ledger.' },
        ],
      };
    },
  });
  await withPage({
    setup: { llm },
    before: async (t) => {
      const dana = await addDm(t);
      samId = t.sam.id;
      secrets = await t.wiki.create(t.campaign.id, { title: 'Secrets', available: 'dm', sections: [{ heading: 'The ledger', text: 'The cult owes the Baron.', available: 'all' }] }, { by: dana.id });
      await t.kb.create(t.campaign.id, 'test', { kind: 'place', title: 'The mill', body: 'North of Brindle.' });
      await t.kb.create(t.campaign.id, 'test', { kind: 'clue', title: 'The ledger', body: 'The cult owes the Baron.', known_by: [t.sam.id] });
      t.jobs.enqueueWiki(t.campaign.id);
      await t.jobs.idle();
      return { dana };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    page.click('[data-tab=wiki]');
    await page.waitFor(() => page.text('#wiki-review') === "The AI's changes (2)");
    page.click('#wiki-review');
    await page.waitFor(() => page.$$('.wiki-proposal').length === 2);
    const [made, reveal] = page.$$('.wiki-proposal');
    assert.match(made.textContent, /New page.*The Mill/);
    assert.match(made.textContent, /Available as the page/);
    assert.match(reveal.textContent, /Reveal.*Secrets › The ledger/);
    assert.match(reveal.textContent, /Thorin/);

    // Edit the new page before approving: the section becomes the DM's.
    page.click([...made.querySelectorAll('button')].find((b) => b.textContent === 'Edit'));
    page.type(made.querySelector('[aria-label="Proposed text"]'), 'North of Brindle, by the river.');
    page.click([...made.querySelectorAll('button')].find((b) => b.textContent === 'Approve with my changes'));
    await page.waitFor(() => page.text('#wiki-status').includes('Approved: The Mill'));
    const mill = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki`)).json().pages.find((p) => p.title === 'The Mill');
    const full = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${mill.id}`)).json().page;
    assert.equal(full.sections[0].text, 'North of Brindle, by the river.');
    assert.equal(full.sections[0].by, 'dm');

    await page.waitFor(() => page.$$('.wiki-proposal').length === 1);
    page.click([...page.$('.wiki-proposal').querySelectorAll('button')].find((b) => b.textContent === 'Approve'));
    await page.waitFor(() => page.text('#wiki-main').includes('Nothing waiting for you'));
    assert.equal(page.text('#wiki-review'), "The AI's changes");
    const asSam = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${secrets.id}?as=${t.sam.id}`)).json().page;
    assert.match(asSam.sections[0].text, /owes the Baron/);
    await page.settle();
  });
});
