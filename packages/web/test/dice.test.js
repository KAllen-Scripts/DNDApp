/**
 * The dice tray (dice.js): the server rolls, the page shows the result, the
 * 3D dice (a fake here) are told to land on the server's numbers.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withPage } from './helpers.js';

/** The server's dice come up as these numbers, in order (then 1s). */
function fixDice(values) {
  const queue = [...values];
  return mock.method(crypto, 'randomInt', (min) => queue.shift() ?? min);
}

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const thrown = () => globalThis.__diceBox.thrown;

test('dice: the tray opens and closes; dice buttons build the notation; Clear empties it', async () => {
  await withPage({ page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page) => {
    assert.ok(!page.visible('#dice-panel'));
    page.click('#dice-open');
    assert.ok(page.visible('#dice-panel'));
    assert.equal(page.$('#dice-open').getAttribute('aria-expanded'), 'true');

    const die = (n) => page.$$('#dice-panel .die').find((b) => b.textContent === `d${n}`);
    page.click(die(20));
    page.click(die(6));
    page.click(die(6));
    assert.equal(page.$('#dice-notation').value, '1d20+2d6');
    page.type('#dice-notation', '1d8+3');
    page.click(die(4));
    assert.equal(page.$('#dice-notation').value, '1d8+1d4+3', 'dice go before the number');
    page.type('#dice-notation', 'nonsense');
    page.click(die(6));
    assert.equal(page.$('#dice-notation').value, 'nonsense+1d6');
    page.click(page.$$('#dice-panel button').find((b) => b.textContent === 'Clear'));
    assert.equal(page.$('#dice-notation').value, '');

    page.key('#dice-panel', 'Escape');
    assert.ok(!page.visible('#dice-panel'));
  });
});

test('dice: a roll shows the server\'s total and every die, and goes in the history', async () => {
  fixDice([4, 6]);
  await withPage({ page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page) => {
    page.click('#dice-open');
    assert.equal(page.text('#dice-history'), 'No rolls yet.');
    page.type('#dice-notation', ' 2d6+3 ');
    page.submit('#dice-panel form');
    await page.settle();
    assert.deepEqual(page.requests.at(-1).body, { notation: '2d6+3', mode: 'normal', label: '', visibility: 'party' });
    assert.ok(page.visible('#dice-result'));
    assert.equal(page.text('#dice-result .dr-total'), '13');
    assert.equal(page.text('#dice-result .dr-label'), '2d6+3');
    assert.equal(page.text('#dice-result .dr-detail'), '2d6 (4, 6) + 3');
    assert.equal(page.$$('#dice-history li').length, 1);
    assert.equal(page.text('#dice-history .dh-total'), '13');
    assert.match(page.text('#dice-history .dh-what'), /^2d6\+3/);
    page.click('#dice-result .dr-close');
    assert.ok(!page.visible('#dice-result'));
    assert.equal(thrown().length, 0, '3D is off');
  });
  mock.restoreAll();
});

test('dice: advantage applies to the next d20 only; dropped dice are struck through; a natural 20 is celebrated', async () => {
  fixDice([20, 7, 5]);
  await withPage({ page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page) => {
    page.click('#dice-open');
    page.click('#dice-panel [data-mode=advantage]');
    assert.equal(page.$('#dice-panel [data-mode=advantage]').getAttribute('aria-pressed'), 'true');
    assert.ok(page.$('#dice-open').classList.contains('has-mode'));
    page.type('#dice-notation', '1d20+1');
    page.submit('#dice-panel form');
    await page.settle();
    assert.equal(page.requests.at(-1).body.mode, 'advantage');
    assert.equal(page.text('#dice-result .dr-total'), '21');
    assert.equal(page.text('#dice-result .dr-mode'), 'Advantage');
    assert.equal(page.text('#dice-result .dr-nat'), 'Natural 20!');
    assert.ok(page.$('#dice-result').classList.contains('crit'));
    assert.equal(page.text('#dice-result s'), '7');
    assert.equal(page.text('#dice-fx-layer'), 'Natural 20!');
    // Back to normal for the next roll.
    assert.equal(page.$('#dice-panel [data-mode=normal]').getAttribute('aria-pressed'), 'true');
    page.submit('#dice-panel form');
    await page.settle();
    assert.equal(page.requests.at(-1).body.mode, 'normal');
    assert.equal(page.$$('#dice-history li').length, 2);
  });
  mock.restoreAll();
});

test('dice: notation the server refuses is reported in the tray', async () => {
  await withPage({ page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page) => {
    page.click('#dice-open');
    page.type('#dice-notation', '1d7');
    page.submit('#dice-panel form');
    await page.settle();
    assert.ok(page.visible('#dice-error'));
    assert.match(page.text('#dice-error'), /d7/);
    assert.ok(!page.visible('#dice-result'));
  });
});

test('dice: with 3D on, the dice are told to land on the server\'s numbers (a d100 is a tens and a units die)', async () => {
  fixDice([14, 3, 47]);
  await withPage({ page: (t) => ({ as: t.sam, storage: { 'dndapp.dice': JSON.stringify({ sound: false, roller: 'classic' }) } }) }, async (page) => {
    thrown().length = 0;
    page.click('#dice-open');
    page.type('#dice-notation', '1d20+1d6+1d100');
    page.submit('#dice-panel form');
    await page.waitFor(() => page.visible('#dice-result'));
    assert.deepEqual(thrown(), ['1d20+1d6+1d100+1d10@14,3,40,7']);
    assert.equal(page.text('#dice-result .dr-total'), '64');
    assert.ok(page.$('#dice-stage').classList.contains('rolling'));
  });
  mock.restoreAll();
});

test('dice: where no 3D dice can start (no WebGL), the result just appears and the setting says so', async () => {
  globalThis.__diceBox = { thrown: [], made: [], fail: true };
  fixDice([3]);
  try {
    await withPage({ page: (t) => ({ as: t.sam, storage: { 'dndapp.dice': JSON.stringify({ sound: false, roller: 'classic' }) } }) }, async (page) => {
      page.click('#dice-open');
      page.type('#dice-notation', '1d4');
      page.submit('#dice-panel form');
      await page.waitFor(() => page.visible('#dice-result'), { timeout: 8000 });
      assert.equal(page.text('#dice-result .dr-total'), '3');
      await page.waitFor(() => /Dice aren't available on this device/.test(page.text('#dice-3d-note')), { timeout: 8000 });
      assert.equal(page.$('#dice-3d').checked, false);
      assert.ok(page.$('#dice-3d').disabled);
    });
  } finally {
    globalThis.__diceBox.fail = false;
  }
  mock.restoreAll();
});

test('dice: the server\'s DICE_ROLLER picks the roller; the tray can pick another for this browser', async () => {
  fixDice([5, 5]);
  await withPage({ setup: { config: { dice: { roller: 'classic' } } }, page: (t) => ({ as: t.sam, storage: { 'dndapp.dice': JSON.stringify({ sound: false }) } }) }, async (page) => {
    globalThis.__diceBox.made = [];
    thrown().length = 0;
    page.click('#dice-open');
    assert.equal(page.$('#dice-roller').value, '');
    assert.equal(page.$('#dice-roller').options[0].textContent, "Server's choice (Classic 3D)");
    page.type('#dice-notation', '1d6');
    page.submit('#dice-panel form');
    await page.waitFor(() => page.visible('#dice-result'));
    assert.deepEqual(globalThis.__diceBox.made, ['FakeDiceBox'], 'the classic library, as it comes');

    // Only two rollers to pick from; Deluxe can't start without WebGL (jsdom), so Classic carries on.
    assert.deepEqual([...page.$('#dice-roller').options].map((o) => o.value), ['', 'deluxe', 'classic']);
    page.type('#dice-roller', 'deluxe');
    assert.equal(JSON.parse(page.window.localStorage.getItem('dndapp.dice')).roller, 'deluxe');
    page.submit('#dice-panel form');
    await page.waitFor(() => thrown().length === 2, { timeout: 8000 });
    assert.match(page.text('#dice-3d-note'), /Deluxe 3D dice aren't available on this device, so it uses Classic 3D/);
  });
  mock.restoreAll();
});

test("dice: Deluxe is the default; a roller this browser picked that no longer exists goes back to the server's choice", async () => {
  await withPage({ page: (t) => ({ as: t.sam, storage: { 'dndapp.dice': JSON.stringify({ sound: false, roller: 'lite' }) } }) }, async (page) => {
    page.click('#dice-open');
    assert.equal(page.$('#dice-roller').value, '');
    assert.equal(page.$('#dice-roller').options[0].textContent, "Server's choice (Deluxe 3D)");
  });
});

test('dice: settings and the chosen style are kept in this browser', async () => {
  await withPage({ page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page) => {
    page.click('#dice-open');
    page.type('#dice-effects', false);
    page.type('#dice-sound', true);
    const style = page.$$('.dice-style')[3];
    page.click(style);
    assert.equal(style.getAttribute('aria-checked'), 'true');
    assert.equal(page.$$('.dice-style[aria-checked=true]').length, 1);
    const saved = JSON.parse(page.window.localStorage.getItem('dndapp.dice'));
    assert.equal(saved.effects, false);
    assert.equal(saved.sound, true);
    assert.equal(saved.threeD, false);
    assert.equal(saved.style, style.dataset.style);
  });
});

test('dice: when the device asks for less motion, no 3D dice and no effects', async () => {
  fixDice([20]);
  await withPage({ page: (t) => ({ as: t.sam, media: { 'prefers-reduced-motion: reduce': true } }) }, async (page) => {
    globalThis.__diceBox.thrown.length = 0;
    page.click('#dice-open');
    assert.ok(page.$('#dice-3d').disabled);
    assert.ok(page.$('#dice-effects').disabled);
    assert.match(page.text('#dice-3d-note'), /less motion/);
    page.type('#dice-notation', '1d20');
    page.submit('#dice-panel form');
    await page.settle();
    assert.equal(page.text('#dice-result .dr-nat'), 'Natural 20!');
    assert.deepEqual(thrown(), []);
    assert.equal(page.text('#dice-fx-layer'), '', 'no banner');
  });
  mock.restoreAll();
});

test('dice: every roller\'s canvas sits on top of the others in the stage (a second 3D roller was pushed below the window)', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  const rule = /\.dice-stage canvas\s*{([^}]*)}/.exec(css)?.[1] ?? '';
  assert.match(rule, /position:\s*absolute/);
  assert.match(rule, /inset:\s*0/);
});

test('dice: the Deluxe roller falls back to Classic where WebGL can\'t start, and the result still shows', async () => {
  fixDice([12]);
  await withPage({ page: (t) => ({ as: t.sam, storage: { 'dndapp.dice': JSON.stringify({ sound: false, roller: 'deluxe' }) } }) }, async (page) => {
    page.click('#dice-open');
    page.type('#dice-notation', '1d20');
    page.submit('#dice-panel form');
    await page.waitFor(() => page.visible('#dice-result'), { timeout: 8000 });
    assert.equal(page.text('#dice-result .dr-total'), '12');
    await page.waitFor(() => /Deluxe 3D dice aren't available on this device, so it uses Classic 3D/.test(page.text('#dice-3d-note')));
  });
  mock.restoreAll();
});
