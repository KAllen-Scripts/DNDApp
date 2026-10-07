/**
 * Stat blocks for creatures the DM puts on a map, filled in by the AI from
 * its knowledge of 5e (labelled as the AI's, like spells looked up from
 * memory). Only the DM ever sees them.
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

export function createStatBlocks({ llm }) {
  return {
    /** @returns {Promise<{ stats, size } | null>} null if the AI doesn't know it */
    async lookup(name, { campaignId, userId }) {
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
        stats: { name: out.name, ac: out.ac, hp_formula: out.hp_formula, speed: out.speed, challenge: out.challenge, text: out.stat_block, source: 'ai' },
        size: out.size ? SIZES[out.size] : null,
        hp: out.hp_average,
      };
    },
  };
}
