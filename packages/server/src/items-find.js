/**
 * Filling in an item for the DM, in the same order as creatures' stat
 * blocks: the DM's own items first (no AI call), then the group's books (the
 * AI copies the entry from the page, labelled with the book and page), then
 * the AI's own knowledge of 5e (labelled as the AI's). "Find online" is the
 * last step, and only when the DM asks: the AI searches the web, official or
 * not, and brings a picture (downloaded from the public internet only,
 * net/fetch-public.js). Only the DM ever sees the results until an item is
 * stocked by a merchant.
 */
import { z } from 'zod';
import { inspectPicture } from './images.js';
import { fetchPublic } from './net/fetch-public.js';
import { ITEM_KINDS, RARITIES } from './items.js';
import { parsePrice } from '@dndapp/shared/coins.js';

const ItemOut = z.object({
  found: z.boolean().describe("false if you don't know an item by this name, or the text isn't about it"),
  name: z.string().describe('The item\'s proper name, e.g. "Potion of Healing" for "healing potion"'),
  kind: z.enum(ITEM_KINDS),
  rarity: z.enum(RARITIES).describe('empty for mundane items'),
  attunement: z.boolean(),
  price: z.string().describe('its usual price, e.g. "50 gp" or "2 sp"; empty if it has none (most magic items)'),
  weight_lb: z.number().nullable(),
  description: z.string().describe('What it is and does, in Markdown: for a weapon its damage, damage type and properties; for armour its AC, Strength and Stealth; for a magic item its full effect'),
});

const SYSTEM = 'You describe D&D 5e (2014 rules) items for a Dungeon Master stocking a shop: weapons, armour, adventuring gear, tools, potions, scrolls and magic items. Give the official item named, as accurately as you can remember it, with its usual price from the Player\'s Handbook or Dungeon Master\'s Guide when it has one. Names like "healing potion" or "+1 longsword" mean that item. If you don\'t know the item, set found to false rather than invent one.';

const BOOK_SYSTEM = "You copy a D&D 5e item's entry from pages of the group's own rulebook for a Dungeon Master stocking a shop. The text was read from a PDF (sometimes a scan), so fix obvious OCR mistakes and broken lines, but keep the book's wording and numbers exactly. Items in a table (weapons, armour, gear) are one row: give its cost, weight and properties, and the rules for those properties if they're on the pages. If these pages don't describe this item, set found to false.";

const RESEARCH = `You help a Dungeon Master running D&D 5e find an item for a shop in their game. Search the web for the item they ask for. Official sources are best, but unofficial ones are fine and often all there is: homebrew sites (D&D Beyond homebrew, GM Binder, Homebrewery), wikis, Reddit, blogs, conversions from other games or editions. If you only find it for another edition or game, convert it to 5e and say so.

Open the most useful page or two to read the actual item. Then answer with:
- the item's name, what kind of item it is, its rarity and whether it needs attunement
- its price if a source gives one (or a fair one for its rarity, saying so), and its weight
- what it is and does, in full, in Markdown
- the address and title of the page it came from, and whether it's official
- up to four direct addresses of pictures of the item (the image files themselves, ending in .png, .jpg, .jpeg, .webp or .gif where possible, taken from the pages you opened), best first

If you can't find anything at all for it, say so plainly rather than inventing one.`;

const FoundOut = ItemOut.extend({
  source_url: z.string().describe('the page it came from; empty if none'),
  source_title: z.string(),
  official: z.boolean(),
  image_urls: z.array(z.string()).max(6),
});

const TIDY = 'Turn research notes about a D&D 5e item into the requested fields. Copy the description as written in the notes. Only use picture addresses that appear in the notes.';

/** Item fields from the AI's answer. */
const fieldsFrom = (out, source) => ({
  name: out.name.trim(),
  kind: out.kind,
  rarity: out.rarity,
  attunement: out.attunement,
  price: parsePrice(out.price),
  weight: out.weight_lb,
  text: out.description,
  source,
});

/**
 * @param {object} opts
 * @param {object} opts.llm
 * @param {object} [opts.books]  the group's books (sheets/books.js)
 * @param {object} [opts.items]  the DM's items (items.js); looked in first
 * @param {(url: string) => Promise<{ buf: Buffer }>} [opts.fetchImage]  injectable for tests
 */
export function createItemFinder({ llm, books = null, items = null, fetchImage = (url) => fetchPublic(url) }) {
  /** The pages of the books most likely to have it: the best page for its name, and the next one. */
  async function fromBooks(name) {
    const hits = books ? await books.search([name], { limit: 1 }) : [];
    if (!Array.isArray(hits) || !hits.length) return null;
    const read = await books.readPages(hits[0].book, hits[0].page, 2);
    if (read.error || !read.pages.length) return null;
    return { book: read.book, page: hits[0].page, text: read.pages.map((p) => `[page ${p.page}]\n${p.text}`).join('\n\n') };
  }

  async function firstPicture(urls) {
    for (const url of urls.slice(0, 6)) {
      try {
        const { buf } = await fetchImage(url);
        await inspectPicture(buf);
        return { buf, url };
      } catch { /* try the next one */ }
    }
    return null;
  }

  return {
    /**
     * Fill in an item by name: the DM's own items, then the books, then the AI.
     * own: false skips the DM's items (a player looking something up mustn't
     * see the DM's prepared ones). beforeAi runs before each AI call (a rate
     * limit: throw to stop).
     * @returns {Promise<{ fields: object, from: 'yours' | 'book' | 'ai' } | null>} null if nobody knows it
     */
    async lookup(name, { campaignId, userId, exclude = null, own: useOwn = true, beforeAi = null }) {
      const own = useOwn ? items?.named(campaignId, name, { exclude }) : null;
      if (own) {
        const { name: n, kind, rarity, attunement, price, weight, text, source } = own;
        return { fields: { name: n, kind, rarity, attunement, price, weight, text, source: source ?? { kind: 'dm', from: `your items (${n})` } }, from: 'yours' };
      }
      const printed = await fromBooks(name);
      if (printed) {
        beforeAi?.();
        const out = await llm.structured({
          task: 'maps', purpose: 'item:book', campaignId, userId, system: BOOK_SYSTEM, schema: ItemOut,
          prompt: `<book title="${printed.book}" pages="${printed.page}-${printed.page + 1}">\n${printed.text}\n</book>\n\nThe item: ${name}`,
        });
        if (out.found && out.description.trim()) return { fields: fieldsFrom(out, { kind: 'book', from: `${printed.book}, page ${printed.page}` }), from: 'book' };
      }
      beforeAi?.();
      const out = await llm.structured({ task: 'maps', purpose: 'item:ai', campaignId, userId, system: SYSTEM, schema: ItemOut, prompt: `The item: ${name}` });
      if (!out.found || !out.description.trim()) return null;
      return { fields: fieldsFrom(out, { kind: 'ai', from: '' }), from: 'ai' };
    },

    /**
     * Find an item online. Returns { fields, picture: Buffer | null }, or null if nothing was found.
     */
    async find(query, { campaignId, userId }) {
      const notes = await llm.research({ task: 'maps', purpose: 'item:find', system: RESEARCH, prompt: `Find this item: ${query}`, campaignId, userId });
      const out = await llm.structured({ task: 'maps', purpose: 'item:tidy', system: TIDY, prompt: `<request>${query}</request>\n<notes>\n${notes}\n</notes>`, schema: FoundOut, campaignId, userId });
      if (!out.found || !out.description.trim()) return null;
      const picture = await firstPicture(out.image_urls.filter((u) => /^https?:\/\//i.test(u)));
      const url = /^https?:\/\//i.test(out.source_url) ? out.source_url.slice(0, 1000) : null;
      const fields = fieldsFrom(out, { kind: 'web', from: out.source_title.slice(0, 200), url, official: out.official, picture: picture?.url ?? null });
      if (!fields.name) fields.name = query.slice(0, 80);
      return { fields, picture: picture?.buf ?? null };
    },
  };
}
