/**
 * The DM's items: weapons, armour, potions, gear and magic items, kept once
 * (name, kind, rarity, a usual price, weight, a description, a picture and
 * the DM's own notes) and stocked by merchants (merchants.js). Made by hand,
 * looked up (the DM's own items first, then the group's books, then the
 * AI's knowledge: items-find.js), or found online by the AI.
 *
 * Players see an item only through a merchant that sells it, and never the
 * DM's notes. Archived like creatures (library.js).
 */
import { createLibrary, normalizeArt } from './library.js';

export const ITEM_KINDS = ['weapon', 'armor', 'gear', 'tool', 'potion', 'scroll', 'magic', 'other'];
export const ITEM_KIND_NAMES = { weapon: 'Weapon', armor: 'Armour', gear: 'Adventuring gear', tool: 'Tool', potion: 'Potion', scroll: 'Scroll', magic: 'Magic item', other: 'Other' };
export const RARITIES = ['', 'common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];
export const ITEM_SOURCES = ['dm', 'book', 'ai', 'web'];
export const MAX_ITEMS = 1000;
export const MAX_ITEM_TEXT = 8000;
export const MAX_ITEM_NOTES = 4000;

const str = (v, max) => String(v ?? '').slice(0, max);
const num = (v, { min = 0, max = 1e9 } = {}) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.min(max, Math.max(min, Number(v))));

/** An item read from the database or the archive, with anything unknown dropped. */
export function normalizeItem(x = {}) {
  const price = num(x.price, { max: 1e9 });
  return {
    id: String(x.id),
    name: str(x.name, 80).trim() || 'Item',
    kind: ITEM_KINDS.includes(x.kind) ? x.kind : 'other',
    rarity: RARITIES.includes(x.rarity) ? x.rarity : '',
    attunement: !!x.attunement,
    // The usual price in copper pieces (a merchant sets its own); null if unknown.
    price: price == null ? null : Math.round(price),
    // Pounds; null if unknown.
    weight: num(x.weight, { max: 100_000 }),
    // What it is and does, in Markdown (damage, properties, effects): players see this.
    text: str(x.text, MAX_ITEM_TEXT),
    // Only the DM sees these.
    notes: str(x.notes, MAX_ITEM_NOTES),
    art: normalizeArt(x.art),
    // Where its description came from: the DM, a book (from: "Player's Handbook, page 150"), the AI's knowledge, or the web.
    source: x.source && ITEM_SOURCES.includes(x.source.kind)
      ? {
          kind: x.source.kind,
          from: str(x.source.from, 200),
          url: /^https?:\/\//.test(x.source.url ?? '') ? str(x.source.url, 1000) : null,
          official: x.source.official == null ? null : !!x.source.official,
          picture: /^https?:\/\//.test(x.source.picture ?? '') ? str(x.source.picture, 1000) : null,
        }
      : null,
    // Being found online: { query, status: 'pending' | 'failed', error? }; null once found.
    finding: x.finding && ['pending', 'failed'].includes(x.finding.status) ? { query: str(x.finding.query, 200), status: x.finding.status, error: x.finding.error ? str(x.finding.error, 500) : null } : null,
    created_by: x.created_by ?? null,
    created_at: String(x.created_at ?? ''),
    updated_at: String(x.updated_at ?? x.created_at ?? ''),
    removed: !!x.removed,
  };
}

/** The bits of an item a player sees at a merchant (no notes, no file names). */
export const itemForPlayers = (x) => ({ id: x.id, name: x.name, kind: x.kind, rarity: x.rarity, attunement: x.attunement, weight: x.weight, text: x.text, picture: x.art ? x.art.file.replace(/\.[^.]*$/, '') : null });

export function createItems({ db, archive, store }) {
  const lib = createLibrary({ db, archive, store, folder: 'items', normalize: normalizeItem, noun: 'item', max: MAX_ITEMS });
  return {
    ...lib,

    /** What the DM's page gets: the picture as a key, never its file name. */
    view: ({ art, created_by: _by, removed: _removed, ...x }) => ({ ...x, picture: art ? art.file.replace(/\.[^.]*$/, '') : null }),

    /** One of the DM's own items by name (ignoring case), not being looked for and not `exclude`; null if none. */
    named(cid, name, { exclude = null } = {}) {
      const want = String(name ?? '').trim().toLowerCase();
      return lib.list(cid).find((x) => x.id !== exclude && !x.finding && x.name.toLowerCase() === want && x.text.trim()) ?? null;
    },

    /** Searches cut short by a restart can't finish; say so, so the DM can search again. */
    failInterrupted() {
      for (const { cid, entry } of lib.all()) {
        if (entry.finding?.status !== 'pending') continue;
        lib.write(cid, { ...entry, finding: { ...entry.finding, status: 'failed', error: 'The server restarted while the AI was searching. Search again.' }, updated_at: new Date().toISOString() });
      }
    },
  };
}
