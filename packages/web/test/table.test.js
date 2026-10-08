/**
 * The table on the page: others' rolls arriving live in the dice tray, who
 * sees your rolls, handouts (given by the DM, received live by players), the
 * DM's Archivist tab, and pictures for NPC and enemy tokens.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withPage, addDm, importMap, addToken, terrain, createFakeLLM, mapReading, upload, SAMPLE } from './helpers.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };

/** Wait until check() is true (live events arrive on their own time). */
async function until(page, check, ms = 3000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 20))) {
    if (check()) return;
  }
  assert.fail('waited too long');
}

test('dice: others\' party rolls arrive live with their name; rolls only for the DM or the roller stay hidden', async () => {
  mock.method(crypto, 'randomInt', () => 12);
  try {
    await withPage({ page: (t) => ({ as: t.alex, storage: NO_3D }) }, async (page, t) => {
      page.click('#dice-open');
      const roll = (as, body) => t.request('POST', `/campaigns/${t.campaign.id}/roll`, { as, body: { notation: '1d20+3', ...body } });
      await roll(t.sam.token, { label: 'Stealth' });
      await until(page, () => page.text('#dice-history').includes('Stealth'));
      assert.match(page.text('#dice-history'), /Thorin: Stealth/);
      assert.ok(page.visible('#dice-toast'));
      assert.match(page.text('#dice-toast'), /Thorin rolled Stealth: 15/);

      await roll(t.sam.token, { label: 'Insight', visibility: 'dm' });
      await roll(t.dmToken, { label: 'Ambush', visibility: 'dm' });
      await roll(t.sam.token, { label: 'Athletics' });
      await until(page, () => page.text('#dice-history').includes('Athletics'));
      assert.doesNotMatch(page.text('#dice-history'), /Insight|Ambush/);

      // Alex keeps a roll to themself: the request says so and the history marks it.
      page.type('#dice-share', 'self');
      page.type('#dice-notation', '1d20');
      page.submit('#dice-panel form');
      await page.settle();
      assert.equal(page.requests.filter((r) => r.path.endsWith('/roll')).at(-1).body.visibility, 'self');
      assert.match(page.text('#dice-history li'), /only you saw it/);
      assert.ok(page.$('#dice-open').classList.contains('has-share'));
      const samLog = (await t.request('GET', `/campaigns/${t.campaign.id}/rolls`, { as: t.sam.token })).json().rolls;
      assert.equal(samLog.filter((r) => r.name === 'Lyra').length, 0);
    });
  } finally {
    mock.restoreAll();
  }
});

test('dice: the table\'s recent rolls are there on opening the page; the DM\'s choices are Everyone or a secret roll', async () => {
  await withPage({
    before: async (t) => {
      const dana = await addDm(t);
      await t.request('POST', `/campaigns/${t.campaign.id}/roll`, { as: t.sam.token, body: { notation: '1d20', label: 'Perception' } });
      await t.request('POST', `/campaigns/${t.campaign.id}/roll`, { as: t.sam.token, body: { notation: '1d20', label: 'Sneaky', visibility: 'dm' } });
      return { dana };
    },
    page: (t, { dana }) => ({ as: dana, storage: NO_3D }),
  }, async (page) => {
    page.click('#dice-open');
    assert.match(page.text('#dice-history'), /Thorin: Sneaky.*to the DM.*Thorin: Perception/);
    const options = page.$$('#dice-share option').map((o) => o.textContent);
    assert.deepEqual(options, ['Everyone', 'Only me (secret)']);
  });
});

test('handouts: the DM gives one to a chosen player, who gets it live with a badge; the other player never sees it', async () => {
  await withPage({
    before: async (t) => ({ dana: await addDm(t) }),
    page: (t) => ({ as: t.sam }),
  }, async (page, t) => {
    assert.equal(page.text('#handouts'), 'No handouts yet. Anything the DM gives you shows up here.');
    assert.ok(!page.visible('[data-tab=archivist]'), 'players have no Archivist tab');
    assert.equal(page.$('#handout-form'), null);

    const png = (await terrain(40, 30)).toString('base64');
    await t.request('POST', `/campaigns/${t.campaign.id}/handouts`, { body: { title: 'Wanted poster', text: '500 gold reward.', to: [t.sam.id], picture: { filename: 'p.png', data: png } } });
    await until(page, () => page.text('#handouts').includes('Wanted poster'));
    assert.equal(page.text('[data-tab=handouts] .tab-badge'), '1');
    assert.match(page.text('#handouts .handout'), /500 gold reward\./);
    await until(page, () => !!page.$('#handouts .handout-picture')?.src);
    page.click('[data-tab=handouts]');
    assert.equal(page.$('[data-tab=handouts] .tab-badge'), null, 'opening the tab clears the badge');

    const alex = (await t.request('GET', `/campaigns/${t.campaign.id}/handouts`, { as: t.alex.token })).json();
    assert.equal(alex.handouts.length, 0);
  });
});

test('handouts: the DM writes one for everyone, changes who gets it, and takes it back', async () => {
  await withPage({
    before: async (t) => ({ dana: await addDm(t) }),
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    page.click('[data-tab=handouts]');
    assert.ok(page.visible('#handout-form'));
    // Every player is offered by character name.
    assert.match(page.text('#handout-form .handout-to'), /Everyone.*Lyra \(Alex\).*Thorin \(Sam\)/);
    page.type('#handout-form [name=title]', 'Riddle on the door');
    page.submit('#handout-form');
    await page.settle();
    assert.match(page.text('#handout-form [role=alert]'), /Add some text or a picture/);

    page.type('#handout-form [name=text]', 'What walks on four legs in the morning?');
    page.submit('#handout-form');
    await page.settle();
    assert.match(page.text('#handouts .handout'), /Riddle on the door.*What walks on four legs.*Given to: Everyone/);
    assert.equal(page.$('#handout-form [name=title]').value, '', 'the form is cleared');
    let [h] = (await t.request('GET', `/campaigns/${t.campaign.id}/handouts`, { as: t.alex.token })).json().handouts;
    assert.equal(h.title, 'Riddle on the door');

    // Only Thorin now.
    const to = page.$('#handouts .handout-to');
    page.type(to.querySelector('[data-everyone]'), false);
    const thorin = [...to.querySelectorAll('label')].find((l) => l.textContent.startsWith('Thorin')).querySelector('input');
    page.type(thorin, true);
    page.click([...page.$$('#handouts .handout-dm button')].find((b) => b.textContent === 'Save'));
    await page.settle();
    assert.match(page.text('#handouts .handout-dm'), /Given to: Thorin/);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/handouts`, { as: t.alex.token })).json().handouts.length, 0);

    page.answers.confirm = true;
    page.click('#handouts .handout-dm .danger');
    await page.settle();
    assert.match(page.text('#handouts'), /No handouts yet/);
    [h] = (await t.request('GET', `/campaigns/${t.campaign.id}/handouts`, { as: t.sam.token })).json().handouts;
    assert.equal(h, undefined);
  });
});

test('archivist tab: the DM answers the archivist\'s question, dismisses none, and sends a correction', async () => {
  await withPage({
    before: async (t) => {
      const dana = await addDm(t);
      await upload(t, { transcript: SAMPLE }); // the fake archivist asks "Is it Brother Hal or Brother Hall?"
      return { dana };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t) => {
    assert.ok(page.visible('[data-tab=archivist]'));
    assert.equal(page.text('[data-tab=archivist] .tab-badge'), '1');
    page.click('[data-tab=archivist]');
    await page.settle();
    assert.match(page.text('#dm-questions'), /Is it Brother Hal or Brother Hall\?/);
    assert.match(page.text('#dm-questions'), /Transcript says Hall/);

    page.type('#dm-questions textarea', 'Brother Hal, one L.');
    page.click('#dm-questions .primary');
    await page.settle();
    assert.match(page.text('#dm-questions'), /No questions/);
    assert.equal(page.$('[data-tab=archivist] .tab-badge'), null);
    assert.match(page.text('#dm-status'), /applying your answer/);
    assert.match(page.text('#dm-corrections'), /The DM's answer: Brother Hal, one L\./);

    page.type('#correction-form textarea', 'The mill is east of town, not north.');
    page.submit('#correction-form');
    await page.settle();
    assert.equal(page.$('#correction-form textarea').value, '');
    assert.match(page.text('#dm-corrections li'), /The mill is east of town/, 'newest first');
    await t.jobs.idle();
    const corrections = (await t.request('GET', `/campaigns/${t.campaign.id}/corrections`)).json();
    assert.equal(corrections.length, 2);
  });
});

test('map: the DM gives an enemy token a picture, for all tokens with its name, and can go back to initials', async () => {
  await withPage({
    setup: { llm: createFakeLLM({ structured: () => mapReading() }) },
    before: async (t) => {
      const dana = await addDm(t);
      const map = await importMap(t, { patch: { shown: true } });
      const a = await addToken(t, map, { kind: 'enemy', name: 'Goblin', x: 50, y: 50 });
      await addToken(t, map, { kind: 'enemy', name: 'Goblin', x: 100, y: 50 });
      return { dana, map, a };
    },
    page: (t, { dana }) => ({ as: dana }),
  }, async (page, t, { map, a }) => {
    page.click('[data-tab=map]');
    await page.settle();
    const goblin = page.$$('#map-tokens .token').find((el) => el.dataset.id === a.id);
    page.pointer(goblin, 'pointerdown', { clientX: 50, clientY: 50 });
    page.pointer('#map-view', 'pointerup', { clientX: 50, clientY: 50 });
    const button = () => page.$$('#map-selection button').find((b) => /^(New picture|Picture)$/.test(b.textContent));
    assert.equal(button().textContent, 'Picture');
    page.answers.confirm = true; // use it for both goblins
    page.click(button());
    const input = page.$('body > input[type=file]');
    page.setFiles(input, [{ name: 'goblin.png', type: 'image/png', content: await terrain(64, 64) }]);
    await page.settle();
    assert.match(page.dialogs.at(-1).message, /all 2 tokens named "Goblin"/);
    const saved = t.maps.get(t.campaign.id, map.id);
    assert.ok(saved.tokens.every((x) => x.art), 'both goblins have the picture');
    await until(page, () => page.$$('#map-stage .token-picture').length === 2);

    page.click(page.$$('#map-selection button').find((b) => b.textContent === 'No picture'));
    await page.settle();
    assert.equal(t.maps.get(t.campaign.id, map.id).tokens.find((x) => x.id === a.id).art, null);
  });
});
