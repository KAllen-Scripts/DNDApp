/**
 * The DM asks the AI to find a creature online: official or not (homebrew
 * sites, wikis, forums). The AI searches the web, writes up its 5e stat block
 * and gives the page it came from and pictures of it; the server then
 * downloads the first picture that works (public internet only,
 * net/fetch-public.js). Only the DM ever sees the result.
 */
import { z } from 'zod';
import { inspectPicture } from './characters/pictures.js';
import { fetchPublic } from './net/fetch-public.js';

const SIZES = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

const RESEARCH = `You help a Dungeon Master running D&D 5e find a creature to use in their game. Search the web for the creature they ask for. Official sources are best, but unofficial ones are fine and often all there is: homebrew sites (D&D Beyond homebrew, GM Binder, Homebrewery), wikis, Reddit, blogs, conversions from other games or editions, fan creations. If you only find it for another edition or game, convert it to 5e and say so.

Open the most useful page or two to read the actual stat block. Then answer with:
- the creature's name, and whether it's usually hostile or friendly
- its full 5e stat block in Markdown: size, type and alignment, AC, hit points (average and dice), speed, the six ability scores with modifiers (a table), saves, skills, senses, languages, challenge, traits, actions, reactions and legendary actions
- the address and title of the page it came from, and whether it's official
- up to four direct addresses of pictures of the creature (the image files themselves, ending in .png, .jpg, .jpeg, .webp or .gif where possible, taken from the pages you opened), best first

If you can't find anything at all for it, say so plainly rather than inventing one.`;

const FoundOut = z.object({
  found: z.boolean().describe('false if the research found nothing for this creature'),
  name: z.string(),
  kind: z.enum(['enemy', 'npc']).describe('enemy if usually hostile, npc if usually friendly or neutral'),
  size: z.enum(Object.keys(SIZES)).nullable(),
  ac: z.number().int().nullable(),
  hp_average: z.number().int().nullable(),
  hp_formula: z.string().describe('e.g. "7d10 + 21"; empty if unknown'),
  speed: z.string(),
  speed_feet: z.number().int().nullable().describe('walking speed in feet'),
  darkvision_feet: z.number().int().nullable(),
  challenge: z.string().describe('e.g. "2 (450 XP)"'),
  stat_block: z.string().describe('the full stat block in Markdown'),
  source_url: z.string().describe('the page it came from; empty if none'),
  source_title: z.string(),
  official: z.boolean(),
  image_urls: z.array(z.string()).max(6),
});

const TIDY = 'Turn research notes about a D&D 5e creature into the requested fields. Copy the stat block as written in the notes. Only use picture addresses that appear in the notes.';

/**
 * @param {object} opts
 * @param {object} opts.llm
 * @param {(url: string) => Promise<{ buf: Buffer }>} [opts.fetchImage]  injectable for tests
 */
export function createCreatureFinder({ llm, fetchImage = (url) => fetchPublic(url) }) {
  /** The first of the pictures that downloads and is really a picture, or null. */
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
     * Find a creature online. Returns { fields (for creatures.create), picture: Buffer | null }
     * or null if nothing was found.
     */
    async find(query, { campaignId, userId }) {
      const notes = await llm.research({ task: 'maps', purpose: 'creature:find', system: RESEARCH, prompt: `Find this creature: ${query}`, campaignId, userId });
      const out = await llm.structured({ task: 'maps', purpose: 'creature:tidy', system: TIDY, prompt: `<request>${query}</request>\n<notes>\n${notes}\n</notes>`, schema: FoundOut, campaignId, userId });
      if (!out.found || !out.stat_block.trim()) return null;
      const picture = await firstPicture(out.image_urls.filter((u) => /^https?:\/\//i.test(u)));
      const source = /^https?:\/\//i.test(out.source_url) ? { url: out.source_url.slice(0, 1000), title: out.source_title.slice(0, 200), official: out.official } : null;
      return {
        fields: {
          name: out.name.trim() || query,
          kind: out.kind,
          size: out.size ? SIZES[out.size] : 1,
          hp_max: out.hp_average && out.hp_average > 0 ? out.hp_average : null,
          speed: out.speed_feet ?? null,
          darkvision: out.darkvision_feet ?? 0,
          stats: { name: out.name, ac: out.ac, hp_formula: out.hp_formula, speed: out.speed, challenge: out.challenge, text: out.stat_block, source: 'web' },
          source: source && picture ? { ...source, picture: picture.url.slice(0, 1000) } : source,
        },
        picture: picture?.buf ?? null,
      };
    },
  };
}
