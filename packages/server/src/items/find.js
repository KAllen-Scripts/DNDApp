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
import { inspectPicture } from '../images.js';
import { fetchPublic } from '../net/fetch-public.js';
import { ITEM_KINDS, RARITIES } from './store.js';
import { parsePrice } from '@dndapp/shared/coins.js';
import { normalizeActions } from '@dndapp/shared/item-actions.js';

const ItemOut = z.object({
  found: z.boolean().describe("false if you don't know an item by this name, or the text isn't about it"),
  name: z.string().describe('The item\'s proper name, e.g. "Potion of Healing" for "healing potion"'),
  kind: z.enum(ITEM_KINDS),
  rarity: z.enum(RARITIES).describe('empty for mundane items'),
  attunement: z.boolean(),
  price: z.string().describe('its usual price, e.g. "50 gp" or "2 sp"; empty if it has none (most magic items)'),
  weight_lb: z.number().nullable(),
  description: z.string().describe('What it is and does, in Markdown: for a weapon its damage, damage type and properties; for armour its AC, Strength and Stealth; for a magic item its full effect'),
  // What its owner can do with it, for the sheet's Item actions (shared/item-actions.js).
  uses: z.object({
    max: z.number().int().describe('how many charges or uses it has (beads, objects, charges)'),
    recharge: z.string().describe('what comes back: dice ("1d6+1"), a number, "all", or empty if they never come back'),
    when: z.string().describe('when they come back: "dawn", "long rest", "after 7 days", or empty'),
  }).nullable().default(null).describe('null if it has no charges or limited uses'),
  actions: z.array(z.object({
    name: z.string().describe('what the player does, e.g. "Pull out a fuzzy ball", "Fireball", "Blow the horn"'),
    kind: z.enum(['summon', 'spell', 'attack', 'heal', 'other']),
    charges: z.number().int().describe('charges or uses it spends; 0 if none'),
    needs: z.enum(['', 'equipped', 'attuned']).describe('when it works: held or worn (equipped), attuned, or any time'),
    consumed: z.boolean().describe('true if one of the item is used up (a bead, a gem, a card)'),
    spell: z.string().describe('the spell it casts, if any'),
    spell_level: z.number().int().nullable(),
    save_dc: z.number().int().nullable(),
    save_ability: z.enum(['', 'str', 'dex', 'con', 'int', 'wis', 'cha']),
    attack_bonus: z.number().int().nullable().describe('to hit, if it makes an attack roll'),
    damage: z.string().describe('dice and type, e.g. "8d6 fire"; empty if none'),
    extra_per_charge: z.string().describe('dice added for each extra charge spent, e.g. "1d6"; empty if none'),
    max_extra_charges: z.number().int(),
    heal: z.string().describe('dice it heals, e.g. "2d4+2"; empty if none'),
    summon_roll: z.string().describe('the dice rolled on its table to pick the creature, e.g. "1d8"; empty if there is no table'),
    summon_table: z.array(z.object({ from: z.number().int(), to: z.number().int(), creature: z.string(), count: z.string() })).describe("the table's rows: the creature's proper stat block name (e.g. \"Giant Rat\") and how many (a number or dice)"),
    summon_creature: z.string().describe('the creature it becomes or summons when there is no table'),
    summon_count: z.string().describe('how many: a number or dice; "1" if one'),
    lasts: z.string().describe('how long a summon or effect lasts, e.g. "1 hour", "until the next dawn"'),
    vanishes_at_dawn: z.boolean(),
    text: z.string().describe('the rule for this use, in a sentence or two'),
  })).default([]).describe('Every way its owner can use it that does something: summons, spells it casts (with its save DC and charges), attacks, healing, other uses that spend charges. Empty for items that only give a passive bonus or do nothing special.'),
});

/** The actions the AI read, for the sheet (marked as the AI's). */
export function aiActions(out) {
  return normalizeActions((out.actions ?? []).map((a) => ({
    name: a.name, kind: a.kind, cost: a.charges, needs: a.needs, consumes: a.consumed, spell: a.spell, level: a.spell_level, dc: a.save_dc, save: a.save_ability,
    bonus: a.attack_bonus, damage: a.damage, extra: a.extra_per_charge, max_extra: a.max_extra_charges, heal: a.heal, roll: a.summon_roll,
    table: (a.summon_table ?? []).map((r) => ({ min: r.from, max: r.to, creature: r.creature, count: r.count })),
    creature: a.summon_creature, count: a.summon_count, until: a.lasts, expires: a.vanishes_at_dawn ? 'dawn' : '', text: a.text, source: 'ai',
  })));
}

const USES = 'Also fill in uses (its charges, if any) and actions: every way its owner can use it that does something (a creature it summons or becomes, with the table rolled for it; a spell it casts with its save DC, spell level and the charges each use costs; an attack; healing; anything else that spends a charge). Use proper stat block names for creatures. Leave actions empty for items that only give a passive bonus.';

const SYSTEM = 'You describe D&D 5e (2014 rules) items for a Dungeon Master stocking a shop: weapons, armour, adventuring gear, tools, potions, scrolls and magic items. Give the official item named, as accurately as you can remember it, with its usual price from the Player\'s Handbook or Dungeon Master\'s Guide when it has one. Names like "healing potion" or "+1 longsword" mean that item. If you don\'t know the item, set found to false rather than invent one. ' + USES;

const BOOK_SYSTEM = "You copy a D&D 5e item's entry from pages of the group's own rulebook for a Dungeon Master stocking a shop. The text was read from a PDF (sometimes a scan), so fix obvious OCR mistakes and broken lines, but keep the book's wording and numbers exactly. Items in a table (weapons, armour, gear) are one row: give its cost, weight and properties, and the rules for those properties if they're on the pages. If these pages don't describe this item, set found to false. " + USES;

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

const TIDY = `Turn research notes about a D&D 5e item into the requested fields. Copy the description as written in the notes. Only use picture addresses that appear in the notes. ${USES}`;

/** Item fields from the AI's answer. */
const fieldsFrom = (out, source) => ({
  name: out.name.trim(),
  kind: out.kind,
  rarity: out.rarity,
  attunement: out.attunement,
  price: parsePrice(out.price),
  weight: out.weight_lb,
  text: out.description,
  uses: out.uses ? { max: out.uses.max, used: 0, recharge: out.uses.recharge, when: out.uses.when } : null,
  actions: aiActions(out),
  source,
});

/**
 * @param {object} opts
 * @param {object} opts.llm
 * @param {object} [opts.books]  the group's books (sheets/books.js)
 * @param {object} [opts.items]  the DM's items (items.js); looked in first
 * @param {(url: string) => Promise<{ buf: Buffer }>} [opts.fetchImage]  injectable for tests
 */
export function createItemFinder({ llm, books = null, items = null, editions = null, fetchImage = (url) => fetchPublic(url) }) {
  /**
   * The pages of the books most likely to have it: the best page for its name,
   * and the next one. The campaign's edition's books first, then any.
   */
  async function fromBooks(name, edition) {
    let hits = books && edition ? await books.search([name], { limit: 1, edition }) : [];
    if (books && !(Array.isArray(hits) && hits.length)) hits = await books.search([name], { limit: 1 });
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
      const printed = await fromBooks(name, editions ? await editions.of(campaignId) : null);
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
