/**
 * Merchants: shops the DM sets up and puts on maps as tokens. Each sells
 * items from the DM's items (items.js) at its own prices, with a stock
 * level (or no limit). Players buy on their own: the price comes out of the
 * coins on their character sheet and the item goes into its inventory, and
 * the stock goes down. A merchant can restock (back up to each item's
 * "restock to" level) every so many long rests the DM calls (rests.js).
 *
 * Players see a merchant only while one of its tokens is on a map they can
 * see, and never the DM's notes. Archived like creatures (library.js); the
 * whole merchant, stock and recent sales, on each change.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createLibrary, normalizeArt } from './library.js';

export const MAX_MERCHANTS = 200;
export const MAX_STOCK = 200;
export const MAX_SALES = 50;
export const MAX_MERCHANT_NOTES = 4000;
export const MERCHANT_COLOR = '#c9a227';

const str = (v, max) => String(v ?? '').slice(0, max);
const whole = (v, { min = 0, max = 1e9, fallback = null } = {}) => (v == null || v === '' || !Number.isFinite(Number(v)) ? fallback : Math.min(max, Math.max(min, Math.round(Number(v)))));
export const isStockId = (id) => /^[a-f0-9]{8}$/.test(String(id));
export const newStockId = () => crypto.randomBytes(4).toString('hex');

/** One line of stock: an item, its price here (copper), how many are left (null: no limit) and what restocking brings it back up to (null: never). */
function normalizeLine(l = {}) {
  return {
    id: isStockId(l.id) ? l.id : newStockId(),
    item: /^[a-f0-9]{10}$/.test(String(l.item)) ? String(l.item) : '',
    price: whole(l.price, { fallback: 0 }),
    qty: whole(l.qty, { max: 1_000_000 }),
    full: whole(l.full, { max: 1_000_000 }),
  };
}

/** A merchant read from the database or the archive, with anything unknown dropped. */
export function normalizeMerchant(m = {}) {
  const every = whole(m.restock?.every, { min: 1, max: 1000 });
  return {
    id: String(m.id),
    name: str(m.name, 80).trim() || 'Merchant',
    // What players see about the shop ("A gruff dwarf who sells arms and armour").
    description: str(m.description, 2000),
    // Only the DM sees these.
    notes: str(m.notes, MAX_MERCHANT_NOTES),
    color: /^#[0-9a-fA-F]{6}$/.test(m.color ?? '') ? m.color.toLowerCase() : MERCHANT_COLOR,
    art: normalizeArt(m.art),
    // Players can buy (the DM can close the shop without taking the token away).
    open: m.open !== false,
    stock: (Array.isArray(m.stock) ? m.stock : []).map(normalizeLine).filter((l) => l.item).slice(0, MAX_STOCK),
    // Restock every `every` long rests (null: only when the DM says); `rests` counted since the last one.
    restock: {
      every,
      rests: whole(m.restock?.rests, { max: 1000, fallback: 0 }),
      last_rest_at: m.restock?.last_rest_at ? str(m.restock.last_rest_at, 40) : null,
      last_restock_at: m.restock?.last_restock_at ? str(m.restock.last_restock_at, 40) : null,
    },
    // The latest sales, newest last: { at, user_id, who, item, name, qty, paid (copper) }.
    sales: (Array.isArray(m.sales) ? m.sales : []).slice(-MAX_SALES).map((s) => ({
      at: str(s.at, 40), user_id: whole(s.user_id, { min: 1 }), who: str(s.who, 100), item: str(s.item, 10), name: str(s.name, 80), qty: whole(s.qty, { min: 1, fallback: 1 }), paid: whole(s.paid, { fallback: 0 }),
    })),
    created_by: m.created_by ?? null,
    created_at: String(m.created_at ?? ''),
    updated_at: String(m.updated_at ?? m.created_at ?? ''),
    removed: !!m.removed,
  };
}

/** Every line back up to its restock level (never down: a DM who added more keeps them). */
export function restocked(m, at) {
  return {
    ...m,
    stock: m.stock.map((l) => (l.full != null && l.qty != null && l.qty < l.full ? { ...l, qty: l.full } : l)),
    restock: { ...m.restock, rests: 0, last_restock_at: at },
  };
}

/**
 * The DM called a long rest at `at` (one for the party, rests.js): count it,
 * and restock if it's time. Returns the changed merchant, or null if it
 * doesn't restock on rests.
 */
export function afterLongRest(m, at) {
  if (!m.restock.every || m.removed) return null;
  const counted = { ...m, restock: { ...m.restock, rests: m.restock.rests + 1, last_rest_at: at } };
  return counted.restock.rests >= m.restock.every ? restocked(counted, at) : counted;
}

export function createMerchants({ db, archive, store }) {
  // update { campaign_id, merchant }: the live stream tells pages to look again.
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const lib = createLibrary({ db, archive, store, folder: 'merchants', normalize: normalizeMerchant, noun: 'merchant', max: MAX_MERCHANTS, onWrite: (merchant, cid) => events.emit('update', { campaign_id: cid, merchant }) });

  return {
    ...lib,
    events,

    /** The DM called a long rest: each merchant that restocks counts it. Returns the merchants that restocked. */
    longRest(cid, { at = new Date().toISOString() } = {}) {
      const out = [];
      for (const m of lib.list(cid)) {
        const next = afterLongRest(m, at);
        if (!next) continue;
        lib.write(cid, { ...next, updated_at: new Date().toISOString() });
        if (next.restock.rests === 0) out.push(next);
      }
      return out;
    },
  };
}
