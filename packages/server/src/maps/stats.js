/**
 * Stat blocks for creatures the DM puts on a map or keeps in their creatures.
 * The DM's own come first: a creature of that name saved on the Creatures
 * tab with a stat block is used as it is, with no AI call. Then the group's
 * books: if a book prints the creature's stat block,
 * the AI copies it from the page (labelled with the book and page). Only if
 * no book has it does the AI write it from its knowledge of 5e (labelled as
 * the AI's, like spells looked up from memory). Only the DM ever sees them.
 */
import { z } from 'zod';

const SIZES = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

const StatsOut = z.object({
  found: z.boolean().describe("false if you don't know a creature by this name (homebrew, a person's name, nonsense)"),
  name: z.string().describe('The creature it is, e.g. "Goblin" for "Goblin 3" or "goblin archer"'),
  size: z.enum(Object.keys(SIZES)).nullable(),
  ac: z.number().int().nullable(),
  hp_average: z.number().int().nullable(),
  hp_formula: z.string().describe('e.g. "2d6" or "7d10 + 21"; empty if unknown'),
  speed: z.string(),
  challenge: z.string().describe('e.g. "1/4 (50 XP)"'),
  stat_block: z.string().describe('The full stat block in markdown: type and alignment, AC, HP, speed, the six ability scores with modifiers (a table), saves, skills, senses, languages, challenge, traits, actions, reactions and legendary actions, each action with its attack bonus, reach or range and damage'),
});

const SYSTEM = `You write D&D 5e (2014 rules) creature stat blocks for a Dungeon Master's battle map. Give the official stat block for the creature named, as accurately as you can remember it. Names like "Goblin 2", "goblin boss" or "Orc archer" mean that creature (pick the closest official one, e.g. a Scout for an archer). If you don't know the creature, set found to false rather than invent one.`;

const BOOK_SYSTEM = `You copy a D&D 5e creature's stat block from a page of the group's own rulebook for a Dungeon Master's battle map. The text was read from a PDF (sometimes a scan), so fix obvious OCR mistakes and broken lines, but keep the book's wording and numbers exactly. Lay it out as the full stat block in Markdown (the six ability scores as a table). If the text isn't this creature's stat block, set found to false.`;

/** Fields for a token's or creature's stat block from the AI's answer. */
const statsFrom = (out, source, from) => ({
  name: out.name, ac: out.ac, hp_formula: out.hp_formula, speed: out.speed, challenge: out.challenge, text: out.stat_block, source, ...(from && { from }),
});

/**
 * @param {object} opts
 * @param {object} opts.llm
 * @param {object} [opts.books]  the group's books (sheets/books.js); looked in after the DM's creatures
 * @param {object} [opts.creatures]  the DM's creatures (creatures.js); looked in first
 */
export function createStatBlocks({ llm, books = null, creatures = null }) {
  return {
    /**
     * @param {string} name
     * @param {{ campaignId: number, userId: number, exclude?: string }} opts  exclude: a creature not to copy from (the one being filled)
     * @returns {Promise<{ stats, size, hp, creature?: string } | null>} null if no one knows it
     */
    async lookup(name, { campaignId, userId, exclude = null }) {
      const own = creatures?.withStats(campaignId, name, { exclude });
      if (own) {
        return { stats: { ...own.stats, from: own.stats.from || `your creatures (${own.name})` }, size: own.size === 1 ? null : own.size, hp: own.hp_max, creature: own.name };
      }
      const printed = await books?.findCreature(name);
      if (printed) {
        const out = await llm.structured({
          task: 'maps',
          purpose: 'map:stats-book',
          campaignId,
          userId,
          system: BOOK_SYSTEM,
          prompt: `<book title="${printed.book}" page="${printed.page}">\n${printed.text}\n</book>\n\nThe stat block for: ${printed.name}`,
          schema: StatsOut,
        });
        if (out.found && out.stat_block.trim()) {
          return { stats: statsFrom(out, 'book', `${printed.book}, page ${printed.page}`), size: out.size ? SIZES[out.size] : null, hp: out.hp_average };
        }
      }
      const out = await llm.structured({
        task: 'maps',
        purpose: 'map:stats',
        campaignId,
        userId,
        system: SYSTEM,
        prompt: `The stat block for: ${name}`,
        schema: StatsOut,
      });
      if (!out.found || !out.stat_block.trim()) return null;
      return {
        stats: statsFrom(out, 'ai'),
        size: out.size ? SIZES[out.size] : null,
        hp: out.hp_average,
      };
    },
  };
}
