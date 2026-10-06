/**
 * The group's own rulebooks: PDFs dropped into BOOKS_DIR. There is no
 * database of them. On first use the server reads each PDF's text into memory
 * (about 1.5 seconds for the Player's Handbook) and finds spells by their
 * printed heading: a name line followed by "1st-level evocation" or
 * "Evocation cantrip". Scanned books work if the PDF has an OCR text layer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { distance } from 'fastest-levenshtein';
import { readPdf } from './pdf.js';

// "1st-level evocation", "Evocation cantrip", and OCR mangles like "3rd~evelevoeaUon".
const LEVEL_LINE = /^\s*(?:[0-9IlOo]{1,2}\s*(?:st|nd|rd|th)\s*[-–~.]?\s*[lI|]?\s*ev|[a-z]+\s*cantrip)/i;
const SMALL_WORDS = new Set(['of', 'from', 'and', 'the', 'to', 'a', 'an', 'in', 'on', 'with', 'for', 'or']);

/** Compare names despite OCR mix-ups (l/1/I, 0/O) and punctuation. */
export const normName = (s) =>
  String(s ?? '').toLowerCase().replace(/[l1|!]/g, 'i').replace(/0/g, 'o').replace(/[^a-z]/g, '');

function isHeading(line) {
  const t = line.trim();
  if (t.length < 2 || t.length > 45 || /[:.;]/.test(t) || LEVEL_LINE.test(t)) return false;
  const chars = t.replace(/\s/g, '');
  const letters = chars.match(/[A-Za-z]/g) ?? [];
  // Spell headings are printed in capitals; this skips lines from class tables and spell lists.
  return (letters.length + (chars.match(/'/g)?.length ?? 0)) / chars.length >= 0.8 &&
    letters.filter((c) => c >= 'A' && c <= 'Z').length / letters.length >= 0.8;
}

const titleCase = (heading) =>
  heading
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/0/g, 'O')
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

export function createBooks({ dir, log = console }) {
  let loading = null;
  /** @type {{ title: string, file: string, lines: { text: string, page: number }[] }[]} */
  let books = [];
  /** @type {{ name: string, norm: string, book: number, line: number }[]} */
  let spells = [];

  function index() {
    spells = [];
    books.forEach((b, bi) => {
      for (let j = 0; j < b.lines.length - 1; j++) {
        if (isHeading(b.lines[j].text) && LEVEL_LINE.test(b.lines[j + 1].text)) {
          const name = titleCase(b.lines[j].text);
          spells.push({ name, norm: normName(name), book: bi, line: j });
        }
      }
    });
  }

  /** Read every PDF in the folder (once). Safe to call repeatedly. */
  function load() {
    loading ??= (async () => {
      const files = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).sort() : [];
      for (const file of files) {
        try {
          const { pages } = await readPdf(fs.readFileSync(path.join(dir, file)));
          const lines = pages.flatMap((text, i) => text.split('\n').map((t) => ({ text: t, page: i + 1 })));
          books.push({ title: file.replace(/\.pdf$/i, ''), file, lines });
        } catch (err) {
          log.warn?.(`Couldn't read the book ${file}: ${err.message}`);
        }
      }
      index();
    })();
    return loading;
  }

  return {
    load,

    /** Spell headings found in the books (for suggestions). */
    async spellNames() {
      await load();
      return spells.map((s) => ({ name: s.name, book: books[s.book].title, page: books[s.book].lines[s.line].page }));
    },

    /**
     * The printed text of a spell, from its heading to the next spell's.
     * @returns {Promise<{ name: string, book: string, page: number, text: string } | null>}
     */
    async findSpell(name) {
      await load();
      const want = normName(name);
      if (!want) return null;
      let hit = spells.find((s) => s.norm === want);
      if (!hit) {
        const allowed = Math.max(1, Math.floor(want.length / 8));
        let best = Infinity;
        for (const s of spells) {
          const d = distance(want, s.norm);
          if (d < best && d <= allowed) [best, hit] = [d, s];
        }
      }
      if (!hit) return null;
      const { lines, title } = books[hit.book];
      const next = spells.find((s) => s.book === hit.book && s.line > hit.line);
      const end = Math.min(next?.book === hit.book ? next.line : lines.length, hit.line + 150);
      return {
        name: hit.name,
        book: title,
        page: lines[hit.line].page,
        text: lines.slice(hit.line, end).map((l) => l.text.trimEnd()).join('\n'),
      };
    },

    status: () => ({ dir, books: books.map((b) => ({ title: b.title, pages: b.lines.at(-1)?.page ?? 0 })), spells: spells.length }),
  };
}
