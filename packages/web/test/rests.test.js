/**
 * Rests and hit dice on the page: a player spends hit dice and takes a short
 * rest from the Hit dice box; the DM calls rests for the party from the Rest
 * button; players' sheets reload when the DM's rest reaches them live.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withPage, addDm } from './helpers.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const byLabel = (page, label) => page.el(`#sheet [aria-label="${label}"]`);

// Fighter 3 / Warlock 2, Con 14: 10+2 + 2×(6+2) + 2×(5+2) = 42 hit points; hit dice 3d10 + 2d8.
const THORIN = {
  name: 'Thorin',
  classes: [{ name: 'Fighter', subclass: '', level: 3 }, { name: 'Warlock', subclass: '', level: 2 }],
  abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 12 },
  hp: { current: 20, temp: null },
  hit_dice_spent: { 8: 1 },
  spellcasting: { class: 'Warlock', slots_used: {}, pact_used: 2 },
};
const giveSheet = (t, sheet = THORIN) => t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet, version: 0 } });
const serverSheet = async (t) => (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token })).json();

test('hit dice: a row per die size with ticks for spent dice; Spend rolls it on the server and heals; Short rest brings back Pact Magic', async () => {
  mock.method(crypto, 'randomInt', () => 7);
  try {
    await withPage({ before: (t) => giveSheet(t), page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page, t) => {
      page.click('[data-tab=sheet]');
      const rows = page.$$('#sheet .hd-row');
      assert.deepEqual(rows.map((r) => r.querySelector('.hd-die').textContent), ['d10', 'd8']);
      assert.equal(rows[0].querySelectorAll('.pips input').length, 3);
      assert.equal(page.text('#sheet .hd-row[data-die="8"] .hd-left'), '1 left');
      assert.equal(page.$$('#sheet .hd-row[data-die="8"] .pips input:checked').length, 1);
      assert.equal(page.$('#rest-open').hidden, true, 'only the DM calls rests');

      // Spend a d10: the server rolls 1d10+2 (7 + 2 = 9) and the sheet shows the hit points.
      page.click('#sheet .hd-row[data-die="10"] .hd-spend');
      await page.settle();
      assert.deepEqual(page.requests.filter((r) => r.path.endsWith('/sheet/hit-dice')).at(-1).body, { die: 10, visibility: 'party' });
      assert.equal(page.text('#dice-result .dr-label'), 'Hit die (d10)');
      assert.equal(byLabel(page, 'Current hit points').value, '29');
      assert.equal(page.text('#sheet .hd-row[data-die="10"] .hd-left'), '2 left');
      assert.match(page.text('#sheet-status'), /regained 9 hit points/);
      assert.deepEqual((await serverSheet(t)).sheet.hit_dice_spent, { 10: 1, 8: 1 });

      // Ticking by hand still works (and saves).
      page.click(page.$$('#sheet .hd-row[data-die="8"] .pips input')[1]);
      assert.equal(page.text('#sheet .hd-row[data-die="8"] .hd-left'), '0 left');
      assert.equal(page.$('#sheet .hd-row[data-die="8"] .hd-spend').disabled, true);
      await page.waitFor(() => page.text('#sheet-status') === 'Saved');
      assert.deepEqual((await serverSheet(t)).sheet.hit_dice_spent, { 10: 1, 8: 2 });

      page.click('#sheet .hd-short-rest');
      await page.settle();
      assert.match(page.text('#sheet-status'), /Short rest taken: Pact Magic slots are back/);
      assert.equal((await serverSheet(t)).sheet.spellcasting.pact_used, 0);
      assert.equal(page.$$('#sheet .pact .pips input:checked').length, 0);
    });
  } finally {
    mock.restoreAll();
  }
});

test('the DM calls a long rest for chosen players from the Rest button', async () => {
  await withPage({ before: async (t) => { await giveSheet(t); return { dana: await addDm(t) }; }, page: (t, { dana }) => ({ as: dana, storage: NO_3D }) }, async (page, t) => {
    assert.equal(page.$('#rest-open').hidden, false);
    page.click('#rest-open');
    await page.settle();
    assert.ok(page.$('#rest-dialog').hasAttribute('open'));
    const ticks = page.$$('#rest-dialog .rest-who input');
    assert.deepEqual(ticks.map((x) => x.getAttribute('aria-label')), ['Lyra', 'Thorin']);
    assert.match(page.text('#rest-dialog'), /up to half of each character's hit dice come back.*\(2014 rules\)/);
    page.click(ticks[0]); // not Lyra
    page.click(page.$$('#rest-dialog button').find((b) => b.textContent === 'Long rest'));
    await page.settle();
    assert.deepEqual(page.requests.filter((r) => r.path.endsWith('/rests') && r.method === 'POST').at(-1).body, { kind: 'long', to: [t.sam.id] });
    assert.equal(page.text('#rest-dialog .rest-result'), 'Long rest done for Thorin.');
    assert.match(page.text('#rest-dialog .rest-list'), /Long rest, .*: Thorin/);
    const { sheet } = await serverSheet(t);
    assert.equal(sheet.hp.current, 42);
    assert.deepEqual(sheet.hit_dice_spent, {});
  });
});

test("a player's sheet reloads when the DM's long rest reaches them, with a note", async () => {
  await withPage({ before: (t) => giveSheet(t), page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page, t) => {
    page.click('[data-tab=sheet]');
    assert.equal(byLabel(page, 'Current hit points').value, '20');
    await t.request('POST', `/campaigns/${t.campaign.id}/rests`, { body: { kind: 'long' } });
    await page.waitFor(() => byLabel(page, 'Current hit points').value === '42', { what: 'the sheet to reload' });
    assert.match(page.text('#dice-toast'), /The DM called a long rest\./);
    assert.match(page.text('#sheet-status'), /long rest/);
    assert.equal(page.$$('#sheet .hd-row[data-die="8"] .pips input:checked').length, 0);
  });
});
