/**
 * Wild Shape forms by name, for a druid's character sheet. In order:
 *   1. the SRD 5.1 beasts (and the four elementals) bundled with the server
 *      (exact, instant, free);
 *   2. the group's own books in BOOKS_DIR: the stat block's page is cut out
 *      and the AI copies its numbers into the form's fields;
 *   3. the AI's own knowledge, clearly marked as such.
 * Never the DM's own creatures: players don't see those. Book and AI results
 * are remembered until the server restarts.
 */
import fs from 'node:fs';
import { z } from 'zod';
import { distance } from 'fastest-levenshtein';
import { normalizeForm } from '@dndapp/shared/wild-shape.js';
import { normName } from './books.js';

const SRD = JSON.parse(fs.readFileSync(new URL('./srd-beasts.json', import.meta.url), 'utf8')).forms;
const SRD_NOTE = 'SRD 5.1 (Creative Commons Attribution 4.0)';

const ABILITY = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const FormOut = z.object({
  found: z.boolean().describe("false if there's no creature with this name (in the text, or that you know)"),
  name: z.string(),
  size: z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']),
  type: z.string().describe('creature type in lower case, e.g. "beast" or "elemental"'),
  cr: z.string().describe('challenge rating, e.g. "1/4" or "2"'),
  ac: z.number().int(),
  hp_max: z.number().int().describe('average hit points'),
  hp_formula: z.string().describe('e.g. "2d8+2"'),
  speed: z.object({ walk: z.number().int(), fly: z.number().int(), swim: z.number().int(), climb: z.number().int(), burrow: z.number().int() }).describe('feet; 0 for a speed it lacks'),
  abilities: z.object({ str: z.number().int(), dex: z.number().int(), con: z.number().int(), int: z.number().int(), wis: z.number().int(), cha: z.number().int() }),
  saves: z.array(z.object({ ability: ABILITY, bonus: z.number().int() })).describe('only saving throws listed in the stat block'),
  skills: z.array(z.object({ skill: z.string().describe('e.g. "perception", "animal_handling"'), bonus: z.number().int() })).describe('only skills listed in the stat block'),
  senses: z.string(),
  traits: z.array(z.object({ name: z.string(), text: z.string() })).describe('special traits, as written'),
  attacks: z.array(z.object({
    name: z.string(),
    bonus: z.number().int().nullable().describe('to hit, or null if it is not an attack roll'),
    save: z.union([ABILITY, z.literal('')]).describe('the saving throw the target makes, if any'),
    dc: z.number().int().nullable(),
    damage: z.string().describe('dice and type, e.g. "2d4+2 piercing"; empty if none'),
    notes: z.string().describe('the action as written'),
  })).describe('every action, Multiattack included'),
});

const BOOK_SYSTEM = `You copy a D&D 5e creature's stat block from a page of the group's own rulebook into fields, for a druid's Wild Shape form on their character sheet. The text was read from a PDF (sometimes a scan), so fix obvious OCR mistakes, but keep the numbers and wording exactly. If the text isn't this creature's stat block, set found to false.`;
const MEMORY_SYSTEM = `You know the official D&D 5th edition books. Give the named creature's stat block, for a druid's Wild Shape form on their character sheet, as published, as accurately as you can. If you don't know a creature with this name, or aren't sure it exists, set found to false instead of guessing.`;

const clean = ({ found, saves, skills, ...form }, source, source_note) =>
  found
    ? normalizeForm({
        ...form,
        saves: Object.fromEntries(saves.map((s) => [s.ability, s.bonus])),
        skills: Object.fromEntries(skills.map((s) => [s.skill.toLowerCase().replace(/\s+/g, '_'), s.bonus])),
        source,
        source_note,
      })
    : null;

export function createForms({ books, llm, editions = null }) {
  const srdByName = new Map(SRD.map((f) => [normName(f.name), f]));
  const cache = new Map();

  function srdMatch(name) {
    const want = normName(name);
    if (srdByName.has(want)) return srdByName.get(want);
    if (want.length < 6) return null;
    const allowed = Math.max(1, Math.floor(want.length / 10));
    let best = null;
    let bestD = Infinity;
    for (const [n, f] of srdByName) {
      const d = distance(want, n);
      if (d < bestD && d <= allowed) [bestD, best] = [d, f];
    }
    return best;
  }

  return {
    /** The SRD forms (for suggestions while typing): name, challenge rating, type and speeds. */
    list: () => SRD.map((f) => ({ name: f.name, cr: f.cr, type: f.type, speed: f.speed })),

    /**
     * @param {string} name
     * @param {{ campaignId?: number, userId?: number, beforeAi?: () => void }} [opts]
     * @returns {Promise<object|null>} a form (normalizeForm, with a new id), or null if nobody knows it
     */
    async lookup(name, { campaignId, userId, beforeAi } = {}) {
      const srd = srdMatch(name);
      if (srd) return normalizeForm({ ...srd, source: 'srd', source_note: SRD_NOTE });
      const edition = editions ? await editions.of(campaignId) : null;
      const key = `${edition ?? ''}:${normName(name)}`;
      if (cache.has(key)) return normalizeForm({ ...cache.get(key), id: null });

      let form = null;
      const printed = await books?.findCreature(name, { edition });
      if (printed) {
        beforeAi?.();
        const out = await llm.structured({
          task: 'spells',
          purpose: 'form:book',
          campaignId,
          userId,
          system: BOOK_SYSTEM,
          prompt: `<book title="${printed.book}" page="${printed.page}">\n${printed.text}\n</book>\n\nThe stat block for: ${printed.name}`,
          schema: FormOut,
        });
        form = clean(out, 'book', `${printed.book}, page ${printed.page}`);
      }
      if (!form) {
        beforeAi?.();
        const out = await llm.structured({
          task: 'spells',
          purpose: 'form:memory',
          campaignId,
          userId,
          system: MEMORY_SYSTEM,
          prompt: `The D&D 5e creature called "${name}".`,
          schema: FormOut,
        });
        form = clean(out, 'ai', "From the AI's memory (not in the SRD or your books). Check it against the book.");
      }
      if (form) cache.set(key, form);
      return form && normalizeForm({ ...form, id: null });
    },
  };
}
