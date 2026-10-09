import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payCoins, totalCp, formatPrice, parsePrice, splitPrice } from '../src/coins.js';

const purse = (c) => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...c });

test('prices: shown in gold, silver and copper, and read back from what people type', () => {
  assert.equal(formatPrice(5000), '50 gp');
  assert.equal(formatPrice(150), '1 gp 5 sp');
  assert.equal(formatPrice(7), '7 cp');
  assert.equal(formatPrice(0), 'free');
  assert.equal(formatPrice(150_000), '1,500 gp');
  assert.equal(parsePrice('50 gp'), 5000);
  assert.equal(parsePrice('1,500gp'), 150_000);
  assert.equal(parsePrice('2 gp 5 sp'), 250);
  assert.equal(parsePrice('12'), 1200, 'a bare number is gold');
  assert.equal(parsePrice('1 ep'), 50);
  assert.equal(parsePrice('priceless'), null);
  assert.equal(parsePrice(''), null);
  assert.deepEqual(splitPrice(2500), { amount: 25, unit: 'gp' });
  assert.deepEqual(splitPrice(150), { amount: 15, unit: 'sp' });
  assert.deepEqual(splitPrice(7), { amount: 7, unit: 'cp' });
});

test('payCoins: big coins first, breaking a coin with change when needed; null when it cannot pay', () => {
  assert.equal(totalCp(purse({ gp: 1, sp: 2, ep: 1 })), 170);
  assert.deepEqual(payCoins(purse({ gp: 120, sp: 3 }), 10_000), purse({ gp: 20, sp: 3 }));
  assert.deepEqual(payCoins(purse({ gp: 10 }), 5), purse({ gp: 9, sp: 9, cp: 5 }), 'a gold piece broken for 5 copper');
  assert.deepEqual(payCoins(purse({ sp: 15 }), 100), purse({ sp: 5 }), 'silver for a gold price');
  assert.deepEqual(payCoins(purse({ cp: 30, gp: 1 }), 50), purse({ sp: 8 }));
  assert.deepEqual(payCoins(purse({ pp: 1 }), 250), purse({ gp: 7, sp: 5 }));
  assert.equal(payCoins(purse({ sp: 5 }), 100), null);
  assert.deepEqual(payCoins(purse({ gp: 1 }), 0), purse({ gp: 1 }), 'free');
});
