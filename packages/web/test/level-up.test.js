/**
 * Level up on the page: a player levels up from the button under their name (average or rolled hit points,
 * an ASI, a new class), and the DM chooses who starts it and gives levels in Campaign settings.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withPage, addDm } from './helpers.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
// Fighter 3, Con 14: 28 hit points.
const BRYN = { name: 'Bryn', classes: [{ name: 'Fighter', subclass: 'Champion', level: 3 }], abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 }, hp: { current: 28 } };
const giveSheet = (t) => t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: BRYN, version: 0 } });
const serverSheet = async (t) => (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token })).json();

test('a player levels up from the sheet: the dialog shows what the level brings, then the server takes it', async () => {
  mock.method(crypto, 'randomInt', () => 7);
  try {
    await withPage({ before: (t) => giveSheet(t), page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page, t) => {
      page.click('[data-tab=sheet]');
      assert.equal(page.$('#sheet .level-up-banner').hidden, false, 'players level up when ready by default');
      page.click('#sheet .level-up-open');
      await page.settle();
      const d = page.$('#level-up-dialog');
      assert.ok(d.hasAttribute('open'));
      assert.match(page.text('#level-up-dialog h2'), /Level up to 4/);
      // Fighter 4 has an Ability Score Improvement; the preview says what changes.
      assert.equal(d.querySelector('.level-up-asi').hidden, false);
      assert.match(page.text('#level-up-dialog .level-up-changes'), /Level 3 → 4/);
      assert.match(page.text('#level-up-dialog .level-up-changes'), /Hit points 28 → 36/);
      assert.match(page.text('#level-up-dialog .level-up-changes'), /Strength 16 → 18/);

      // Roll for hit points: the server rolls the d10 (7, + 2 Con).
      page.click(d.querySelector('input[value="roll"]'));
      page.click(d.querySelector('button[type="submit"]'));
      await page.settle();
      assert.deepEqual(page.requests.filter((r) => r.path.endsWith('/sheet/level-up')).at(-1).body, { class: 0, asi: { str: 2 }, hp: 'roll', visibility: 'party' });
      assert.match(page.text('#sheet-status'), /Levelled up: Fighter 4, \+9 maximum hit points \(rolled 7\)/);
      const saved = (await serverSheet(t)).sheet;
      assert.equal(saved.classes[0].level, 4);
      assert.equal(saved.abilities.str, 18);
      assert.equal(saved.hp.current, 37);

      // A new class: the multiclass warning shows, but nothing stops it.
      page.click('#sheet .level-up-open');
      await page.settle();
      const pick = page.$('#level-up-class');
      pick.value = 'nwizard';
      pick.dispatchEvent(new page.window.Event('change'));
      assert.match(page.text('#level-up-dialog .level-up-warning'), /Wizard needs Intelligence of 13/);
      assert.equal(page.$('#level-up-dialog .level-up-asi').hidden, true);
    });
  } finally {
    mock.restoreAll();
  }
});

test('the DM makes levels theirs to give: the player sees Level up only once given one', async () => {
  await withPage({ before: async (t) => { await giveSheet(t); return { dana: await addDm(t) }; }, page: (t, { dana }) => ({ as: dana, storage: NO_3D }) }, async (page, t) => {
    page.click('#settings-open');
    await page.settle();
    const who = page.$('#setting-level-up');
    assert.equal(who.value, 'player');
    who.value = 'dm';
    who.dispatchEvent(new page.window.Event('change'));
    await page.settle();
    assert.deepEqual(page.requests.filter((r) => r.path.endsWith('/settings')).at(-1).body, { level_up: 'dm' });
    const row = page.$$('#settings-dialog .level-levels li').find((li) => /Bryn/.test(li.textContent));
    assert.match(row.textContent, /Level 3: Fighter 3/);
    page.click([...row.querySelectorAll('button')].find((b) => b.textContent === 'Give a level'));
    await page.settle();
    assert.match(page.text('#settings-dialog .level-levels'), /1 given, not taken yet/);
    assert.equal((await serverSheet(t)).sheet.levels_granted, 1);
  });
});
