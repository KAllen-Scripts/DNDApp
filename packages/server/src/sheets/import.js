/**
 * Reading an existing character sheet that a player uploads: a PDF (a filled-in
 * form, a typed sheet or a scan), a photo, a text file, or a sheet downloaded
 * from this app. The AI copies it into the sheet's fields. Numbers the sheet
 * prints that differ from what the rules give (AC, skills, saves...) become
 * the player's own values, so nothing on their sheet is lost.
 */
import { z } from 'zod';
import { BadRequestError } from '../store.js';
import { SHEET_FORMAT, ABILITIES, SKILLS, normalizeSheet, computeSheet, coerceDerived } from '@dndapp/shared/sheet.js';
import { readPdf } from './pdf.js';

const IMAGE_TYPES = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;
const TEXT_KEYS = [
  'equipment', 'proficiencies_languages', 'features', 'personality', 'ideals', 'bonds', 'flaws',
  'age', 'height', 'weight', 'eyes', 'skin', 'hair', 'appearance', 'allies', 'backstory', 'treasure', 'additional_features',
];

/** What kind of file this is, from its first bytes. */
export function sniff(buf) {
  const head = buf.subarray(0, 12).toString('latin1');
  if (head.startsWith('%PDF-')) return 'pdf';
  if (head.startsWith('\x89PNG')) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  if (head.startsWith('GIF8')) return 'gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'webp';
  const text = buf.subarray(0, 4000).toString('utf8');
  if (text.includes('\u0000') || text.includes('�')) return null;
  return text.trimStart().startsWith('{') ? 'json' : 'text';
}

const n = z.number().int().nullable();
const s = z.string().nullable();
const byAbility = (t) => z.object(Object.fromEntries(ABILITIES.map((a) => [a, t])));

const ImportOut = z.object({
  readable: z.boolean().describe('false if this is not a D&D character sheet or nothing on it can be read'),
  name: s, player_name: s, race: s, background: s, alignment: s, xp: s,
  classes: z.array(z.object({ name: z.string(), subclass: s, level: z.number().int() })),
  abilities: byAbility(n).describe('ability scores (not modifiers)'),
  save_proficiencies: z.array(z.enum(ABILITIES)).describe('saving throws marked proficient; empty if no marks can be seen'),
  skills: z.array(z.object({
    skill: z.enum(Object.keys(SKILLS)),
    proficiency: z.enum(['none', 'proficient', 'expertise']),
    bonus: n.describe('the bonus written next to it'),
  })),
  printed: z.object({
    proficiency_bonus: n, ac: n, initiative: n, speed: n, hp_max: n, passive_perception: n, hit_dice: s,
    saves: byAbility(n).describe('saving throw bonuses as written'),
    spell_save_dc: n, spell_attack_bonus: n,
    spell_slots: z.array(z.object({ level: z.number().int(), total: z.number().int() })).describe('spell slots per level (not warlock Pact Magic)'),
  }).describe('numbers exactly as written on the sheet; null if not written'),
  inspiration: z.boolean(),
  hp_current: n, hp_temp: n,
  attacks: z.array(z.object({ name: z.string(), bonus: z.string(), damage: z.string(), notes: z.string() })),
  coins: z.object({ cp: n, sp: n, ep: n, gp: n, pp: n }),
  text: z.object(Object.fromEntries(TEXT_KEYS.map((k) => [k, s]))).describe('the free-text boxes, copied as written'),
  spellcasting_class: s,
  spells: z.array(z.object({
    name: z.string(), level: n.describe('0 for a cantrip'), prepared: z.boolean(),
    casting_time: s, range: s, components: s, duration: s, description: s,
  })),
  notes: z.string().describe("for the player: anything you couldn't read or weren't sure about; empty if none"),
});

const SYSTEM = `You read a player's existing D&D 5th edition character sheet and copy it into structured fields.

- Copy what is written. Don't invent or calculate anything that isn't on the sheet: use null, empty text or an empty list.
- Ability scores are the big numbers (e.g. 16), not the modifiers (+3).
- Skills: list every skill with a proficiency mark or a written bonus. A filled bubble or ticked box means proficient; a double mark or "E" means expertise. If the marks can't be read, work proficiency out from the bonus: ability modifier + proficiency bonus = proficient, + twice the proficiency bonus = expertise.
- "printed" holds the sheet's own numbers exactly as written, even if they look wrong.
- A filled-in PDF form comes with its field names and values. Fields like "Check Box 23" are the proficiency bubbles; when the PDF itself is attached, look at it to see which bubble is which.
- Put each spell in spells with whatever details the sheet gives; don't add details from memory.
- Keep the free-text boxes (features, equipment, backstory...) as written, with line breaks.`;

/** Turn the AI's reading into a sheet, keeping the sheet's own numbers where they differ from the rules. */
export function toSheet(out, base = {}) {
  const sheet = normalizeSheet({
    ...base,
    name: out.name || base.name,
    player_name: out.player_name || base.player_name,
    race: out.race, background: out.background, alignment: out.alignment, xp: out.xp,
    classes: out.classes.length ? out.classes.map((c) => ({ ...c, subclass: c.subclass ?? '' })) : undefined,
    abilities: out.abilities,
    skills: Object.fromEntries(out.skills.filter((sk) => sk.proficiency !== 'none').map((sk) => [sk.skill, sk.proficiency])),
    inspiration: out.inspiration,
    hp: { current: out.hp_current, temp: out.hp_temp },
    attacks: out.attacks,
    coins: Object.fromEntries(Object.entries(out.coins).map(([k, v]) => [k, v ?? 0])),
    ...Object.fromEntries(TEXT_KEYS.map((k) => [k, out.text[k] ?? ''])),
    spellcasting: { class: out.spellcasting_class ?? '' },
    spells: out.spells.map((sp) => ({
      ...Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, v ?? ''])),
      level: sp.level,
      source: 'import',
      source_note: 'From your uploaded sheet',
    })),
  });

  // Saving throws marked differently from what the first class gives.
  if (out.save_proficiencies.length) {
    const { values } = computeSheet(sheet);
    for (const a of ABILITIES) {
      const marked = out.save_proficiencies.includes(a);
      if (values[`save_prof.${a}`] !== marked) sheet.overrides[`save_prof.${a}`] = marked;
    }
  }

  // Printed numbers, in the order the rules build on each other.
  const p = out.printed;
  const printed = [
    ['proficiency_bonus', p.proficiency_bonus],
    ...ABILITIES.map((a) => [`save.${a}`, p.saves[a]]),
    ...out.skills.map((sk) => [`skill.${sk.skill}`, sk.bonus]),
    ['passive_perception', p.passive_perception],
    ['initiative', p.initiative],
    ['ac', p.ac],
    ['speed', p.speed],
    ['hp_max', p.hp_max],
    ['hit_dice', p.hit_dice],
    ['spell_dc', p.spell_save_dc],
    ['spell_attack', p.spell_attack_bonus],
    ...p.spell_slots.filter((x) => x.level >= 1 && x.level <= 9).map((x) => [`slots.${x.level}`, x.total]),
  ];
  const same = (key, a, b) => (key === 'hit_dice' ? String(a).replace(/\s/g, '').toLowerCase() === String(b).replace(/\s/g, '').toLowerCase() : a === b);
  for (const [key, raw] of printed) {
    if (raw == null || raw === '') continue;
    const v = coerceDerived(key, raw);
    if (v !== undefined && !same(key, computeSheet(sheet).values[key], v)) sheet.overrides[key] = v;
  }
  return normalizeSheet(sheet);
}

export function createSheetImport({ llm }) {
  return {
    /**
     * @param {{ filename: string, buf: Buffer, base?: object, campaignId?: number, userId?: number, beforeAi?: () => void }} opts
     *   base: fields to keep if the upload doesn't have them (character and player name)
     * @returns {Promise<{ sheet: object, notes: string }>}
     */
    async read({ filename, buf, base = {}, campaignId, userId, beforeAi }) {
      const kind = sniff(buf);
      if (!kind) throw new BadRequestError("That file type can't be read. Upload a PDF, a photo (PNG, JPEG, WebP), a text file, or a sheet downloaded from here.");

      let text = '';
      const attachments = [];
      if (kind === 'json') {
        let data;
        try {
          data = JSON.parse(buf.toString('utf8'));
        } catch {
          throw new BadRequestError("That file looks like JSON but couldn't be read.");
        }
        if (data?.format === SHEET_FORMAT) return { sheet: normalizeSheet(data.sheet), notes: '' };
        text = JSON.stringify(data, null, 1);
      } else if (kind === 'text') {
        text = buf.toString('utf8');
      } else if (kind === 'pdf') {
        if (buf.length > MAX_PDF_BYTES) throw new BadRequestError('That PDF is too big (30 MB at most).');
        const pdf = await readPdf(buf, { maxPages: 30 });
        const parts = [];
        if (pdf.fields.length) parts.push(`Form fields (name: value):\n${pdf.fields.map((f) => `${f.name}: ${f.value}`).join('\n')}`);
        const pageText = pdf.pages.map((t, i) => `--- page ${i + 1} ---\n${t}`).join('\n');
        if (pageText.replace(/--- page \d+ ---|\s/g, '').length > 50) parts.push(`Text on the pages:\n${pageText}`);
        text = parts.join('\n\n');
        if (pdf.pageCount <= 100) attachments.push({ type: 'document', media_type: 'application/pdf', data: buf.toString('base64') });
        else if (!text) throw new BadRequestError('That PDF has no readable text and is too long to look at (100 pages at most).');
      } else {
        if (buf.length > MAX_IMAGE_BYTES) throw new BadRequestError('That picture is too big (5 MB at most). Try a smaller photo or a screenshot.');
        attachments.push({ type: 'image', media_type: IMAGE_TYPES[kind], data: buf.toString('base64') });
      }

      beforeAi?.();
      const out = await llm.structured({
        task: 'import',
        purpose: 'sheet:import',
        campaignId,
        userId,
        system: SYSTEM,
        attachments,
        prompt: `Copy this character sheet${filename ? ` ("${filename}")` : ''} into the fields.${text ? `\n\n<file>\n${text.slice(0, MAX_TEXT_CHARS)}\n</file>` : ''}`,
        schema: ImportOut,
      });
      if (!out.readable) {
        throw new BadRequestError(`That doesn't look like a character sheet that can be read.${out.notes ? ` ${out.notes}` : ''}`);
      }
      return { sheet: toSheet(out, base), notes: out.notes };
    },
  };
}
