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

// ---------- pictures and the visual layout (2026-10-21) ----------

const png = async (r = 40) => (await import('sharp')).default({ create: { width: 120, height: 80, channels: 3, background: { r, g: 90, b: 160 } } }).png().toBuffer();
const addPicture = async (t, as, name) =>
  (await t.request('POST', `/campaigns/${t.campaign.id}/wiki/pictures`, { as, body: { filename: `${name}.png`, data: (await png()).toString('base64') } })).json().picture;

test('wiki tab: the front page is picture cards to filter by kind and tag; a page has a banner, a box of facts, pictures in the text, a gallery and link previews', async () => {
  await withPage({
    before: async (t) => {
      const dana = await addDm(t);
      const tok = dana.token;
      const mill = await addPicture(t, tok, 'Mill');
      const wheel = await addPicture(t, tok, 'Wheel');
      const secret = await addPicture(t, tok, 'Altar');
      const lady = await addPicture(t, tok, 'Lady');
      const make = (body) => t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { as: tok, body });
      await make({ title: 'The Grey Lady', kind: 'npc', available: 'all', tags: ['ghosts'], picture: { id: lady.id }, sections: [{ heading: '', text: 'A ghost who weeps at dusk.', available: 'all' }] });
      await make({
        title: 'Hollow Mill', kind: 'place', available: 'all', tags: ['the vale'],
        banner: { id: mill.id, caption: 'At dusk', focus: 30 },
        picture: { id: wheel.id, caption: 'The old wheel' },
        gallery: [{ id: secret.id, caption: 'The altar', available: 'dm' }],
        facts: [{ label: 'Region', value: 'The Vale' }, { label: 'Owner', value: 'The cult', available: 'dm' }],
        sections: [{ heading: 'What it is', text: `Haunted by [[The Grey Lady]].\n\n![The millrace|right](picture:${wheel.id})\n:::dm\n![The altar](picture:${secret.id})\n:::`, available: 'all' }],
      });
      return { dana, ids: { mill: mill.id, wheel: wheel.id, secret: secret.id, lady: lady.id } };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    page.click('[data-tab=wiki]');
    await page.waitFor(() => page.$$('.wiki-card').length === 2);
    assert.match(page.$('.wiki-home-head').textContent, /Your wiki\s*2 pages/);
    const cardTitles = () => page.$$('.wiki-card-title').map((e) => e.textContent);
    assert.deepEqual(cardTitles(), ['Hollow Mill', 'The Grey Lady']);
    assert.ok(page.$('.wiki-card.fam-place'), 'a place is drawn in the places colour');
    await page.waitFor(() => page.$$('.wiki-card-art img').every((i) => i.src.startsWith('blob:')));

    // Filter by kind, then by tag.
    page.click(page.$$('.wiki-chip').find((b) => b.textContent.startsWith('People')));
    assert.deepEqual(cardTitles(), ['The Grey Lady']);
    page.click(page.$$('.wiki-chip').find((b) => b.textContent === 'All'));
    page.click(page.$$('.wiki-chip').find((b) => b.textContent === '#the vale'));
    assert.deepEqual(cardTitles(), ['Hollow Mill']);

    page.click('.wiki-card');
    await page.waitFor(() => page.text('#wiki-main h2') === 'Hollow Mill');
    assert.ok(page.$('.wiki-hero.has-banner img.wiki-hero-img'), 'the banner across the top');
    assert.match(page.$('.wiki-hero-img').getAttribute('style'), /50% 30%/);
    assert.match(page.text('.wiki-infobox'), /The old wheel\s*Region\s*The Vale\s*Owner\s*The cult \(only you\)/);
    assert.ok(page.$('.wiki-text .wiki-figure.place-right'), 'a picture in the text, placed right');
    assert.match(page.text('.wiki-text'), /The millrace/);
    assert.match(page.text('.wiki-gallery'), /The altar \(only you\)/);

    // A link shows a preview of the page it goes to.
    const link = page.$$('.wiki-body button.wiki-link').find((b) => b.textContent === 'The Grey Lady');
    link.dispatchEvent(new page.window.MouseEvent('mouseenter'));
    assert.match(page.text('.wiki-preview'), /npc\s*The Grey Lady\s*A ghost who weeps at dusk/);
    assert.ok(page.$('.wiki-preview img'));
    link.dispatchEvent(new page.window.MouseEvent('mouseleave'));
    assert.ok(!page.$('.wiki-preview'));

    // A picture shows big when clicked.
    page.click('.wiki-infobox .wiki-figure-open');
    assert.ok(page.$('#wiki-dialog').open);
    assert.match(page.text('#wiki-dialog'), /The old wheel/);
    page.click('.wiki-lightbox-close');

    // As Lyra's player: none of the DM's pictures or facts.
    page.type('#wiki-main select[aria-label="View as"]', String(t.alex.id));
    await page.waitFor(() => page.text('#wiki-main').includes('What Ask can tell Lyra'));
    const shown = page.$$('#wiki-main .wiki-content img').length;
    assert.equal(shown, 2, 'the main picture and the one in the text, not the altar');
    assert.doesNotMatch(page.text('#wiki-main .wiki-content'), /altar|The cult/);
  });
});

test('wiki tab: the DM adds pictures in the editor (main picture from the chooser, one pasted into the text) and the usual facts for the kind', async () => {
  await withPage({
    before: async (t) => {
      const dana = await addDm(t);
      const old = await addPicture(t, dana.token, 'Portrait');
      return { dana, old };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { old }) => {
    page.click('[data-tab=wiki]');
    await page.waitFor(() => page.$('.wiki-empty'));
    page.click(page.$$('.wiki-empty button').find((b) => b.textContent === 'Make the first page'));
    const form = page.$('.wiki-editor');
    page.type(form.querySelector('[aria-label=Title]'), 'Mira');
    page.type(form.querySelector('[aria-label=Kind]'), 'npc');

    // The usual facts for a person.
    page.click([...form.querySelectorAll('button')].find((b) => b.textContent === '+ The usual for people'));
    const labels = () => [...form.querySelectorAll('[aria-label=Fact]')].map((i) => i.value);
    assert.deepEqual(labels(), ['Race', 'Role', 'Where they are', 'Allegiance', 'Status']);
    page.type(form.querySelector('[aria-label="Fact value"]'), 'Half-elf');

    // The main picture, from those already in the wiki.
    page.click('button[aria-label="Choose main picture"]');
    await page.waitFor(() => page.$$('#wiki-dialog .wiki-choice').length === 1);
    page.click('#wiki-dialog .wiki-choice');
    await page.waitFor(() => page.$('.wiki-slot .wiki-slot-thumb img'));
    page.type(form.querySelector('[aria-label="Main picture caption"]'), 'Mira at the market');

    // A picture pasted into the text is uploaded and put where the cursor is.
    const text = form.querySelector('[aria-label="Section text"]');
    page.type(text, 'She sells maps.');
    text.setSelectionRange(text.value.length, text.value.length);
    const paste = new page.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { files: [new page.window.File([await png(200)], 'stall.png', { type: 'image/png' })] } });
    text.dispatchEvent(paste);
    await page.waitFor(() => /!\[stall\]\(picture:[a-f0-9]{10}\)/.test(text.value));
    assert.match(text.value, /^She sells maps\.\n!\[stall\]\(picture:/);

    page.submit(form);
    await page.waitFor(() => page.text('#wiki-main h2') === 'Mira');
    const [mira] = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki`)).json().pages;
    const full = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${mira.id}`)).json().page;
    assert.deepEqual(full.picture, { id: old.id, caption: 'Mira at the market', available: 'all', canon: 'true' });
    assert.deepEqual(full.facts, [{ label: 'Race', value: 'Half-elf', available: 'all', canon: 'true' }], 'the usual facts left empty are not kept');
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/wiki/pictures`)).json().pictures.length, 2, 'the pasted picture was added');
    assert.ok(page.$('.wiki-text .wiki-figure img'));
    await page.settle();
  });
});
