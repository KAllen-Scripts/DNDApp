/**
 * Money: prices are kept in copper pieces (whole numbers), and a character's
 * purse is the sheet's coins { cp, sp, ep, gp, pp }. Used by the server
 * (merchants, buying) and the page (showing prices).
 */

export const COIN_VALUES = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
export const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'];
export const PRICE_UNITS = ['cp', 'sp', 'gp', 'pp'];

/** A purse's worth in copper. */
export const totalCp = (coins = {}) => COINS.reduce((sum, c) => sum + Math.max(0, Math.trunc(Number(coins[c]) || 0)) * COIN_VALUES[c], 0);

/** "25 gp", "5 sp", "1 gp 5 sp"; "free" for 0. Electrum is never used for prices. */
export function formatPrice(cp) {
  const n = Math.max(0, Math.round(Number(cp) || 0));
  if (!n) return 'free';
  const gp = Math.floor(n / 100);
  const sp = Math.floor((n % 100) / 10);
  const c = n % 10;
  return [gp && `${gp.toLocaleString('en')} gp`, sp && `${sp} sp`, c && `${c} cp`].filter(Boolean).join(' ');
}

/** A price as an amount and unit for a form: 150 -> { amount: 15, unit: 'sp' }, 2500 -> { amount: 25, unit: 'gp' }. */
export function splitPrice(cp) {
  const n = Math.max(0, Math.round(Number(cp) || 0));
  for (const unit of ['gp', 'sp']) if (n && n % COIN_VALUES[unit] === 0) return { amount: n / COIN_VALUES[unit], unit };
  return { amount: n, unit: 'cp' };
}

/** "25 gp", "1,500gp", "5 sp", "2 gp 5 sp", "12" (gold) -> copper; null if it isn't a price. */
export function parsePrice(text) {
  const s = String(text ?? '').toLowerCase().replace(/,/g, '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 100);
  let total = 0;
  let any = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(cp|sp|ep|gp|pp)\b/g)) {
    total += Number(m[1]) * COIN_VALUES[m[2]];
    any = true;
  }
  return any ? Math.round(total) : null;
}

/**
 * Pay `cost` copper from a purse. Big coins first (gold for a gold price),
 * then the smallest coin that covers what's left, with change in gold,
 * silver and copper. Returns the new purse, or null if it can't pay.
 */
export function payCoins(coins, cost) {
  const purse = Object.fromEntries(COINS.map((c) => [c, Math.max(0, Math.trunc(Number(coins?.[c]) || 0))]));
  let owed = Math.max(0, Math.round(Number(cost) || 0));
  if (totalCp(purse) < owed) return null;
  for (const c of [...COINS].reverse()) {
    const use = Math.min(purse[c], Math.floor(owed / COIN_VALUES[c]));
    purse[c] -= use;
    owed -= use * COIN_VALUES[c];
  }
  // Still owing: break the smallest coin (or pile of small coins) that covers it.
  for (const c of COINS) {
    if (!owed) break;
    const use = Math.min(purse[c], Math.ceil(owed / COIN_VALUES[c]));
    purse[c] -= use;
    owed -= use * COIN_VALUES[c];
  }
  let change = -owed;
  for (const c of ['gp', 'sp', 'cp']) {
    const back = Math.floor(change / COIN_VALUES[c]);
    purse[c] += back;
    change -= back * COIN_VALUES[c];
  }
  return purse;
}

