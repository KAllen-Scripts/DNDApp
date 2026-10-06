/**
 * Spell details by name, for the character sheet. In order:
 *   1. the SRD 5.1 spell list bundled with the server (exact, instant, free);
 *   2. the group's own books in BOOKS_DIR: the printed text is cut out by its
 *      heading and the AI tidies the OCR into fields, keeping the wording;
 *   3. the AI's own knowledge, clearly marked as such.
 * Book and AI results are remembered until the server restarts.
 */
import fs from 'node:fs';
import { z } from 'zod';
import { distance } from 'fastest-levenshtein';
import { normalizeSpell } from '@dndapp/shared/sheet.js';
import { normName } from './books.js';

const SRD = JSON.parse(fs.readFileSync(new URL('./srd-spells.json', import.meta.url), 'utf8')).spells;

const SpellOut = z.object({
  found: z.boolean().describe('false if the text (or your knowledge) has no spell with this name'),
  name: z.string(),
  level: z.number().int().describe('0 for a cantrip'),
  school: z.string(),
  casting_time: z.string(),
  range: z.string(),
  components: z.string().describe('e.g. "V, S, M"'),
  material: z.string().describe('the material component, or empty'),
  duration: z.string().describe('without "Concentration," (that goes in concentration)'),
  concentration: z.boolean(),
  ritual: z.boolean(),
  description: z.string().describe('paragraphs separated by a blank line'),
  higher_levels: z.string().describe('the "At Higher Levels" text, or empty'),
});

const BOOK_SYSTEM = `You turn text from the user's own D&D rulebook into a clean spell entry. The text was read from a scanned page, so fix obvious scanning errors (for example "leveI" -> "level", "Id6" -> "1d6", "Vou" -> "You", "5dlO" -> "5d10", full stops misread for commas, words split by stray spaces) and drop page headers, footers and anything after the spell ends. Otherwise keep the wording exactly as printed. Never add anything that isn't in the text.`;

const MEMORY_SYSTEM = `You know the official D&D 5th edition books (2014 Player's Handbook and later supplements). Give the named spell's details as published, as close to the book's wording as you can. If you don't know a spell with this name, or aren't sure it exists, set found to false instead of guessing.`;

const fromSrd = (s) =>
  normalizeSpell({ ...s, source: 'srd', source_note: 'SRD 5.1 (Creative Commons Attribution 4.0)' });

export function createSpells({ books, llm }) {
  const srdByName = new Map(SRD.map((s) => [normName(s.name), s]));
  const cache = new Map();

  function srdMatch(name) {
    const want = normName(name);
    if (srdByName.has(want)) return srdByName.get(want);
    // Small typos only ("Magic Misile"), and not in short names, where one letter makes another spell.
    if (want.length < 6) return null;
    const allowed = Math.max(1, Math.floor(want.length / 10));
    let best = null;
    let bestD = Infinity;
    for (const [n, s] of srdByName) {
      const d = distance(want, n);
      if (d < bestD && d <= allowed) [bestD, best] = [d, s];
    }
    return best;
  }

  let names = null;
  async function allNames() {
    if (names) return names;
    const list = SRD.map((s) => ({ name: s.name, level: s.level, source: 'srd' }));
    const known = new Set(srdByName.keys());
    for (const b of await books.spellNames()) {
      const n = normName(b.name);
      if (n === 'cantrips' || n.includes('spellcast') || known.has(n)) continue;
      // OCR'd headings can be slightly off; skip ones that are really an SRD spell.
      const allowed = Math.max(1, Math.floor(n.length / 6));
      if ([...srdByName.keys()].some((k) => Math.abs(k.length - n.length) <= allowed && distance(k, n) <= allowed)) continue;
      known.add(n);
      list.push({ name: b.name, level: null, source: 'book', book: b.book });
    }
    return (names = list);
  }

  const clean = ({ found, ...spell }, source, source_note) => (found ? normalizeSpell({ ...spell, source, source_note }) : null);

  return {
    /** Suggestions while typing: SRD names plus spells found in the books. */
    async search(q, limit = 15) {
      const want = normName(q);
      if (!want) return [];
      return (await allNames())
        .filter((s) => normName(s.name).includes(want))
        .sort((a, b) => normName(a.name).indexOf(want) - normName(b.name).indexOf(want) || a.name.localeCompare(b.name))
        .slice(0, limit);
    },

    /**
     * @param {string} name
     * @param {{ campaignId?: number, userId?: number, beforeAi?: () => void }} [opts]
     *   beforeAi runs before any AI call (e.g. to apply a rate limit; throw to stop).
     * @returns {Promise<object|null>} a normalised spell (see normalizeSpell), or null if not found
     */
    async lookup(name, { campaignId, userId, beforeAi } = {}) {
      const srd = srdMatch(name);
      if (srd) return fromSrd(srd);
      const key = normName(name);
      if (cache.has(key)) return structuredClone(cache.get(key));

      let spell = null;
      const printed = await books.findSpell(name);
      if (printed) {
        beforeAi?.();
        const out = await llm.structured({
          task: 'spells',
          purpose: 'spell:book',
          campaignId,
          userId,
          system: BOOK_SYSTEM,
          prompt: `<book title="${printed.book}" page="${printed.page}">\n${printed.text}\n</book>\n\nGive the spell "${printed.name}" from this text. If the text doesn't contain it, set found to false.`,
          schema: SpellOut,
        });
        spell = clean(out, 'book', `${printed.book}, page ${printed.page}`);
      }
      if (!spell) {
        beforeAi?.();
        const out = await llm.structured({
          task: 'spells',
          purpose: 'spell:memory',
          campaignId,
          userId,
          system: MEMORY_SYSTEM,
          prompt: `The D&D 5e spell called "${name}".`,
          schema: SpellOut,
        });
        spell = clean(out, 'ai', "From the AI's memory (not in the SRD or your books). Check it against the book.");
      }
      if (spell) cache.set(key, spell);
      return spell && structuredClone(spell);
    },
  };
}
