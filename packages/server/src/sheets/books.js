/**
 * The group's own rulebooks: PDFs dropped into BOOKS_DIR. There is no
 * database of them. On first use the server reads each PDF's text into memory
 * (about 1.5 seconds for the Player's Handbook). Scanned books work if the PDF
 * has an OCR text layer.
 *
 * Two uses:
 *   - spells, found by their printed heading: a name line followed by
 *     "1st-level evocation" or "Evocation cantrip";
 *   - the Q&A agent's book tools: keyword search over pages (the agent picks
 *     the words), reading pages, and a table of contents (the PDF's bookmarks,
 *     else the capitalised headings on each page).
 *
 * Pages are numbered as printed when the scan's page numbers can be read
 * (a consistent offset from the PDF's own numbering), else by PDF page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { distance } from 'fastest-levenshtein';
import { readPdf } from './pdf.js';

// "1st-level evocation", "Evocation cantrip", OCR mangles like "3rd~evelevoeaUon",
// and the 2024 books' "Level 1 Evocation (Wizard)".
const LEVEL_LINE = /^\s*(?:[0-9IlOo]{1,2}\s*(?:st|nd|rd|th)\s*[-–~.]?\s*[lI|]?\s*ev|[a-z]+\s*cantrip|[lI|]eve[lI|]\s*[0-9IlOo]\s+[a-z])/i;
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

/** Text for keyword search: lower case, OCR mix-ups folded (l/1/I, 0/O), words split by single spaces. */
export const normText = (s) =>
  ` ${String(s ?? '').toLowerCase().replace(/[l1|!]/g, 'i').replace(/0/g, 'o').replace(/[^a-z0-9]+/g, ' ').trim()} `;

/**
 * The offset from PDF page to printed page, from lines that are only a number
 * (page numbers in headers and footers). Null unless most numbered pages agree.
 */
function printedOffset(pages) {
  const onlyNumber = (lines) => lines.map((l) => /^\s*(\d{1,3})\s*$/.exec(l)?.[1]);
  // Running footers that carry the number: "CHAPTER 2 | RUNNING THE GAME 45", "46 CHAPTER 2 | ...".
  const inFooter = (lines) =>
    [...lines.slice(0, 2), ...lines.slice(-2)].flatMap((l) => [/^\s*(\d{1,3})\s+\D/.exec(l)?.[1], /\D\s(\d{1,3})\s*$/.exec(l)?.[1]]);
  return vote(pages, onlyNumber) ?? vote(pages, inFooter);
}

function vote(pages, numbersOn) {
  const votes = new Map();
  let numbered = 0;
  pages.forEach((p, i) => {
    const nums = new Set(numbersOn(p.lines).filter(Boolean).map(Number));
    if (nums.size) numbered++;
    for (const n of nums) votes.set(n - (i + 1), (votes.get(n - (i + 1)) ?? 0) + 1);
  });
  const [offset, n] = [...votes].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  return n >= 3 && n >= numbered / 2 ? offset : null;
}

/**
 * A book's title from its file name, without the extras that downloaded
 * files carry ("Dungeon Masters Guide (2024) -- Christopher Perkins -- ...").
 */
export const bookTitle = (file) => file.replace(/\.pdf$/i, '').split(/\s+--\s+/)[0].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

/** The year the book was first printed, from its credits page ("First Printing: August 2014"). */
function printedYear(texts) {
  const front = texts.slice(0, 12).join('\n');
  const year = /first\s+printing\W+(?:[a-z]+\s+)?((?:19|20)\d\d)/i.exec(front) ?? /(?:©|\(c\)|copyright)\s*((?:19|20)\d\d)/i.exec(front);
  return year ? Number(year[1]) : null;
}

/** Lines broken with a hyphen are joined again ("ori-\ngin"); a capital after it keeps the words apart. */
const joinHyphens = (text) => text.replace(/(\p{L})\s?-\s*\n\s*(?=\p{Ll})/gu, '$1').replace(/-\s*\n\s*/g, '- ');

/** Without spaces, for headings an OCR layer split inside words ("Diag onal Moveme nt"). */
const squash = (norm) => norm.replace(/ /g, '');

const MAX_TERMS = 8;
// Terms this short ("ac", "hp", "dc") must be whole words; longer ones match the start of a word.
const SHORT_TERM = 3;
const SNIPPET_CHARS = 400;

export function createBooks({ dir, log = console }) {
  let loading = null;
  /**
   * @type {{ title: string, file: string, lines: { text: string, page: number }[],
   *   pages: { lines: string[], norm: string, headings: string, squashed: string[], short: Set<string> }[], offset: number, year: number | null, empty: number,
   *   outline: { title: string, page: number, depth: number }[] }[]}
   */
  let books = [];
  /** @type {{ name: string, norm: string, book: number, line: number }[]} */
  let spells = [];

  function index() {
    spells = [];
    books.forEach((b, bi) => {
      for (let j = 0; j < b.lines.length - 1; j++) {
        if (isHeading(b.lines[j].text) && LEVEL_LINE.test(b.lines[j + 1].text) && castingTimeAfter(b.lines, j)) {
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
          const { pages: texts, outline } = await readPdf(fs.readFileSync(path.join(dir, file)), { outline: true });
          const lines = texts.flatMap((text, i) => text.split('\n').map((t) => ({ text: t, page: i + 1 })));
          // A page's headings: capitalised lines, plus the PDF's bookmarks that point at it.
          const marks = new Map();
          for (const o of outline) marks.set(o.page, [...(marks.get(o.page) ?? []), o.title]);
          const pages = texts.map((text, i) => {
            const pageLines = text.split('\n');
            const headings = [...pageLines.filter(isHeading), ...(marks.get(i + 1) ?? [])].map(normText);
            // Short lines that may be headings in ordinary case ("Heavy Precip itati on"), for exact matches.
            const short = pageLines.filter((l) => l.trim().length <= 45 && !/[.,;:]\s*$/.test(l)).map((l) => squash(normText(l)));
            return { lines: pageLines, norm: normText(joinHyphens(text)), headings: headings.join(''), squashed: headings.map(squash), short: new Set(short) };
          });
          const empty = pages.filter((p) => !p.norm.trim()).length;
          if (pages.length && empty > pages.length / 2) {
            log.warn?.(`${file}: ${empty} of ${pages.length} pages have no text. If it's a scan, give it a text layer (e.g. with ocrmypdf) so it can be searched.`);
          }
          const offset = printedOffset(pages);
          if (offset == null) log.info?.(`${file}: couldn't read its printed page numbers; pages are numbered as in the PDF.`);
          books.push({ title: bookTitle(file), file, year: printedYear(texts), lines, pages, offset: offset ?? 0, outline, empty });
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

    /**
     * Pages matching any of the terms (words or short phrases), best first.
     * Rarer terms count for more, pages matching several terms rank higher,
     * and a term in a heading counts double.
     * @returns {Promise<{ book: string, page: number, snippet: string }[]>}
     */
    async search(terms, { book = null, limit = 8 } = {}) {
      await load();
      const found = book ? findBook(book) : null;
      if (found?.error) return found;
      const shelf = found ? [found] : books;
      const wanted = [...new Set(terms.map(normText).filter((t) => t.trim().length >= 2))].slice(0, MAX_TERMS);
      if (!wanted.length || !shelf.length) return [];
      const all = shelf.flatMap((b) => b.pages.map((p, i) => ({ b, p, i })));
      // Match at the start of a word, so "opportunity attack" also finds "opportunity attacks";
      // short terms only as whole words, so "AC" doesn't find "action".
      const needles = wanted.map((t) => (t.trim().length <= SHORT_TERM ? t : t.slice(0, -1)));
      const flat = wanted.map((t) => squash(t));
      const counts = all.map(({ p }) =>
        needles.map((n, t) => occurrences(p.norm, n) || (flat[t].length >= 5 && (p.short.has(flat[t]) || p.squashed.some((h) => h.includes(flat[t])))) | 0),
      );
      const idf = needles.map((_, t) => Math.log(1 + all.length / (counts.filter((c) => c[t]).length || 1)));
      const scored = all
        .map((x, k) => {
          let score = 0;
          let matched = 0;
          counts[k].forEach((c, t) => {
            if (!c) return;
            matched++;
            // A heading that is the term ("HEX") counts most, one that contains it ("HEX AND CURSE") less.
            const heading = x.p.squashed.includes(flat[t]) || (flat[t].length >= 5 && x.p.short.has(flat[t]))
              ? 3
              : x.p.headings.includes(wanted[t]) || (flat[t].length >= 5 && x.p.squashed.some((h) => h.includes(flat[t])))
                ? 1
                : 0;
            score += idf[t] * (1 + Math.log(c) + heading);
          });
          return { ...x, score: score * matched, hit: counts[k].findIndex(Boolean) };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return scored.map(({ b, p, i, hit }) => ({
        book: b.title,
        page: i + 1 + b.offset,
        snippet: snippet(p.lines, needles.slice(hit).concat(needles.slice(0, hit))),
      }));
    },

    /**
     * The text of `count` pages from `page` (numbered as in search results).
     * @returns {Promise<{ book: string, pages: { page: number, text: string }[] } | { error: string }>}
     */
    async readPages(book, page, count = 1) {
      await load();
      const b = findBook(book);
      if (b.error) return b;
      const first = page - b.offset;
      if (first < 1 || first > b.pages.length) return { error: `${b.title} has pages ${pageRange(b)}.` };
      return {
        book: b.title,
        pages: b.pages.slice(first - 1, first - 1 + count).map((p, k) => ({ page: page + k, text: p.lines.join('\n').trim() })),
      };
    },

    /**
     * Chapter and section headings with their pages: the PDF's bookmarks if it
     * has any, else the capitalised headings printed on each page.
     * @returns {Promise<{ book: string, from: string, entries: { page: number, title: string, depth: number }[] } | { error: string }>}
     */
    async contents(book, { fromPage = null, toPage = null } = {}) {
      await load();
      const b = findBook(book);
      if (b.error) return b;
      const inRange = (page) => (fromPage == null || page >= fromPage) && (toPage == null || page <= toPage);
      if (b.outline.length) {
        const entries = b.outline.map((o) => ({ ...o, page: o.page + b.offset })).filter((o) => inRange(o.page));
        return { book: b.title, from: 'bookmarks', entries };
      }
      const entries = [];
      b.pages.forEach((p, i) => {
        const page = i + 1 + b.offset;
        if (!inRange(page)) return;
        const seen = new Set();
        for (const line of p.lines) {
          const t = line.trim().replace(/\s+/g, ' ');
          if (!isHeading(t) || !/[A-Za-z]{3}/.test(t) || seen.has(t)) continue;
          seen.add(t);
          entries.push({ page, title: titleCase(t), depth: /^chapter\b/i.test(t) ? 0 : 1 });
        }
      });
      return { book: b.title, from: 'headings', entries };
    },

    status: () => ({
      dir,
      books: books.map((b) => ({ title: b.title, year: b.year, pages: b.pages.length, range: pageRange(b), textless: b.empty })),
      spells: spells.length,
    }),
  };

  /**
   * A book by title: exact (ignoring case and punctuation), else the one whose
   * title contains it or the other way round. `{ error }` when there's no such
   * book, or several match ("Player's Handbook" with a 2014 and a 2024 one).
   */
  function findBook(name) {
    const want = normName(name);
    const all = `The books are: ${books.map((b) => b.title).join('; ') || 'none'}.`;
    const exact = want && books.find((b) => normName(b.title) === want);
    if (exact) return exact;
    const loose = want ? books.filter((b) => normName(b.title).includes(want) || want.includes(normName(b.title))) : [];
    if (loose.length === 1) return loose[0];
    return { error: loose.length ? `"${name}" could be ${loose.map((b) => b.title).join(' or ')}. Give the full title.` : `No book called "${name}". ${all}` };
  }
}

/** A spell's heading is followed within a few lines by its casting time (not a class's "Spellcasting" or "Cantrips"). */
const castingTimeAfter = (lines, j) => lines.slice(j + 1, j + 7).some((l) => /casting\s*t[il1]me/i.test(l.text));

/** "1-318", or "-4 to 388" when front matter comes before printed page 1. */
const pageRange = (b) => `${1 + b.offset}${1 + b.offset < 0 ? ' to ' : '-'}${b.pages.length + b.offset}`;

function occurrences(haystack, needle) {
  let n = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) n++;
  return n;
}

/** A few lines around the first line containing one of the needles (in order of preference). */
function snippet(lines, needles) {
  const norms = lines.map(normText);
  let at = -1;
  for (const n of needles) {
    at = norms.findIndex((l) => l.includes(n));
    if (at !== -1) break;
  }
  const from = Math.max(0, at - 1);
  const text = lines.slice(from, from + 5).map((l) => l.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');
  return text.length > SNIPPET_CHARS ? `${text.slice(0, SNIPPET_CHARS)}…` : text;
}
