/**
 * Read-only tools for the Q&A agent, plus the server-side steps around it:
 * a free search before the model is called (so many questions are answered
 * in one turn), and evidence built from the answer's citations.
 *
 * Everything is filtered for the person asking:
 *   - knowledge-base records and transcripts: only what they may know
 *     (records' known_by; transcripts of sessions they attended). DMs see all.
 *   - player notes: only their own. Not even the DM sees other players' notes.
 * The group's rulebooks (BOOK_DEFS) aren't campaign data, so everyone sees them.
 * The DM's saved creatures (CREATURE_DEFS) are only ever passed in when the DM asks.
 */
import { z } from 'zod';
import { formatTimestamp, formatUtterance, parseTimestamp, CITATION_RE } from '@dndapp/shared';
import { renderRecord } from '../kb/store.js';
import { preparedTranscript } from '../pipeline/prepare.js';
import { creatureKey } from '../creatures.js';

const SessionRange = {
  from_session: z.number().int().nullable().describe('Only from this session number, or null'),
  to_session: z.number().int().nullable().describe('Only up to this session number, or null'),
};

const DEFS = {
  search_kb: {
    description: 'Search the knowledge base (keyword + meaning). Returns the best-matching records in full. Start here for most questions.',
    schema: z.object({ query: z.string(), kind: z.string().nullable().describe('Only this kind (see the guide), or null') }),
  },
  list_records: {
    description: 'List records (id, kind, status, title), optionally filtered by kind and/or status. Good for "all open debts", "every quest", etc.',
    schema: z.object({ kind: z.string().nullable(), status: z.string().nullable() }),
  },
  get_records: {
    description: 'Read records in full by id.',
    schema: z.object({ ids: z.array(z.number().int()) }),
  },
  list_sessions: {
    description: 'List sessions with number, date and title.',
    schema: z.object({}),
  },
  search_transcript: {
    description: 'Search session transcripts for exact wording or details the knowledge base lacks. Returns timestamped excerpts.',
    schema: z.object({ query: z.string(), ...SessionRange }),
  },
  read_transcript: {
    description: 'Read part of a session transcript between two timestamps (HH:MM:SS), e.g. around a search hit.',
    schema: z.object({ session: z.number().int(), from: z.string(), to: z.string() }),
  },
  search_my_notes: {
    description: "Search the asking player's own private notes, including notes from the current session that hasn't been processed yet.",
    schema: z.object({ query: z.string() }),
  },
};

const BOOK_DEFS = {
  search_books: {
    description:
      "Search the group's rulebooks for pages containing any of the terms. Write the terms yourself: the words the book would use for the rule (its official name, the action or condition, synonyms), not the player's wording. Returns pages with a short snippet, best first.",
    schema: z.object({
      terms: z.array(z.string()).min(1).max(8).describe('1-8 words or short phrases, e.g. ["opportunity attack", "leaves your reach", "Disengage"]'),
      book: z.string().nullable().describe('Only this book (title as listed), or null for all'),
    }),
  },
  read_book: {
    description: 'Read pages of a rulebook (page numbers as in search results and contents). The text is from a scan and may have OCR errors.',
    schema: z.object({
      book: z.string().describe('Title as listed'),
      page: z.number().int(),
      count: z.number().int().min(1).max(2).nullable().describe('Pages to read (1-2), default 1'),
    }),
  },
  book_contents: {
    description: "A rulebook's chapters and section headings with their pages. Use it to browse to the right section when searches miss or the question is broad.",
    schema: z.object({
      book: z.string().describe('Title as listed'),
      from_page: z.number().int().nullable(),
      to_page: z.number().int().nullable(),
    }),
  },
};

const CREATURE_DEFS = {
  get_my_creatures: {
    description: "The DM's own saved creatures in full: stat block, hit points, size, speed, darkvision and the DM's notes. These beat the books and your own knowledge.",
    schema: z.object({ names: z.array(z.string()).min(1).max(6).describe('Names as listed in dm_creatures') }),
  },
};

const SIZE_NAMES = { 0.5: 'Tiny', 1: 'Small or Medium', 2: 'Large', 3: 'Huge', 4: 'Gargantuan' };

/** One of the DM's creatures, for the model. */
function renderCreature(c) {
  const facts = [
    `${c.kind === 'npc' ? 'NPC' : 'Enemy'}, ${SIZE_NAMES[c.size] ?? 'Medium'}`,
    c.hp_max ? `max HP ${c.hp_max}` : '',
    c.speed != null ? `speed ${c.speed} ft.` : '',
    c.darkvision ? `darkvision ${c.darkvision} ft.` : '',
  ].filter(Boolean).join(', ');
  const from = c.stats?.source === 'book' ? ` (copied from ${c.stats.from})` : c.stats?.source === 'web' ? ' (found on the web)' : c.stats?.source === 'ai' ? " (written by the AI from memory)" : '';
  return [
    `--- ${c.name} (the DM's Creatures tab)`,
    facts,
    c.stats ? `Stat block${from}:\n${c.stats.text}` : 'No stat block saved.',
    c.notes ? `DM's notes: ${c.notes}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * @param {object} opts
 * @param {{ userId: number, seesAll: boolean }} opts.viewer  who is asking
 * @param {object[]} [opts.dmCreatures]  the DM's saved creatures; pass them only when the DM is asking
 * @param {object} [opts.books]  the group's rulebooks; the book tools are added only if there are any
 */
export function createTools({ db, store, kb, search, books, config, campaignId, viewer, dmCreatures = [] }) {
  const maxChars = config.qa.maxToolResultTokens * 4;
  const clip = (s, max = maxChars) => (s.length > max ? `${s.slice(0, max)}\n…(truncated)` : s);
  const ownNotesOnly = { userId: viewer.userId, seesAll: false };
  const transcriptCache = new Map();

  const sessionByNumber = (n) => db.prepare('SELECT * FROM sessions WHERE campaign_id = ? AND number = ?').get(campaignId, n);
  const attended = (session) =>
    viewer.seesAll || !!db.prepare('SELECT 1 FROM attendance WHERE session_id = ? AND user_id = ?').get(session.id, viewer.userId) ||
    // No attendance recorded (e.g. not processed yet): fall back to allowed.
    !db.prepare('SELECT 1 FROM attendance WHERE session_id = ?').get(session.id);

  function transcript(n) {
    if (!transcriptCache.has(n)) transcriptCache.set(n, preparedTranscript(store, campaignId, n));
    return transcriptCache.get(n);
  }

  const formatChunks = (hits) =>
    hits.map((h) => `--- [S${h.session_num} ${formatTimestamp(h.start_sec)}-${formatTimestamp(h.end_sec)}]\n${h.text}`).join('\n\n');
  const formatNotes = (hits) => hits.map((h) => `--- [${h.title}]\n${h.text}`).join('\n\n');
  const recordsFromHits = (hits) => kb.getMany(campaignId, hits.map((h) => Number(h.ref_id)), viewer);

  const handlers = {
    search_kb: async ({ query, kind }) => {
      const hits = await search.search(campaignId, query, { kinds: ['kb'], viewer, limit: 6 });
      const records = recordsFromHits(hits).filter((r) => !kind || r.kind === kind);
      return clip(records.map(renderRecord).join('\n\n---\n\n') || 'No matches.');
    },
    list_records: ({ kind, status }) =>
      clip(
        kb
          .list(campaignId, { kind, status, viewer })
          .map((r) => `#${r.id} | ${r.kind} | ${r.status || '-'} | ${r.title}`)
          .join('\n') || 'No records.',
      ),
    get_records: ({ ids }) => clip(kb.getMany(campaignId, ids, viewer).map(renderRecord).join('\n\n---\n\n') || 'No such records.'),
    list_sessions: () =>
      db
        .prepare('SELECT * FROM sessions WHERE campaign_id = ? ORDER BY number')
        .all(campaignId)
        .map((s) => `S${s.number} (${s.played_on})${s.title ? `: ${s.title}` : ''}${s.status === 'ready' ? '' : ` [${s.status}]`}${attended(s) ? '' : ' [you were not there]'}`)
        .join('\n') || 'No sessions yet.',
    search_transcript: async ({ query, from_session, to_session }) =>
      clip(
        formatChunks(
          await search.search(campaignId, query, {
            kinds: ['chunk'],
            viewer,
            fromSession: from_session ?? undefined,
            toSession: to_session ?? undefined,
            limit: 4,
          }),
        ) || 'No matches.',
      ),
    read_transcript: ({ session, from, to }) => {
      const s = sessionByNumber(session);
      if (!s) return `No session ${session}.`;
      if (!attended(s)) return `This player wasn't at session ${session}, so its transcript isn't available to them.`;
      const a = parseTimestamp(from);
      const b = parseTimestamp(to);
      if (Number.isNaN(a) || Number.isNaN(b)) return 'Timestamps must be HH:MM:SS.';
      const lines = transcript(session).filter((u) => u.time >= a && u.time <= b).map(formatUtterance);
      return lines.length ? clip(`Session ${session}:\n${lines.join('\n')}`) : 'No lines in that range.';
    },
    search_my_notes: async ({ query }) =>
      clip(formatNotes(await search.search(campaignId, query, { kinds: ['note'], viewer: ownNotesOnly, limit: 6 })) || 'No matching notes.'),
    get_my_creatures: async ({ names }) => {
      const found = names.map((n) => dmCreatures.find((c) => creatureKey(c.name) === creatureKey(n)) ?? `--- ${n}: not one of the DM's creatures.`);
      return clip(found.map((c) => (typeof c === 'string' ? c : renderCreature(c))).join('\n\n'));
    },
    search_books: async ({ terms, book }) => {
      const hits = await books.search(terms, { book });
      if (hits.error) return hits.error;
      return clip(
        hits.map((h) => `--- (${h.book} p. ${h.page})\n${h.snippet}`).join('\n\n') ||
          'No pages match. Try other terms (synonyms, the official name), or book_contents.',
      );
    },
    read_book: async ({ book, page, count }) => {
      const r = await books.readPages(book, page, count ?? 1);
      // Two full pages, even when that's more than other tools may return: a rule cut off mid-page is worse.
      return r.error ?? clip(r.pages.map((p) => `--- (${r.book} p. ${p.page})\n${p.text || '(no text on this page)'}`).join('\n\n'), maxChars * 2);
    },
    book_contents: async ({ book, from_page, to_page }) => {
      const r = await books.contents(book, { fromPage: from_page, toPage: to_page });
      if (r.error) return r.error;
      const head = `${r.book} (${r.from === 'bookmarks' ? "the PDF's bookmarks" : 'headings found on the pages'}):`;
      if (!r.entries.length) return `${head}\nNothing found in that range.`;
      // A long contents loses its deepest levels rather than its last chapters.
      const render = (depth) => r.entries.filter((e) => e.depth <= depth).map((e) => `${'  '.repeat(e.depth)}p. ${e.page}: ${e.title}`).join('\n');
      let depth = Math.max(...r.entries.map((e) => e.depth));
      while (depth > 0 && render(depth).length > maxChars) depth--;
      const hidden = r.entries.some((e) => e.depth > depth) ? '\n(Deeper headings hidden to fit. Ask for a page range to see them.)' : '';
      return clip(`${head}\n${render(depth)}${hidden}`);
    },
  };

  const defs = { ...DEFS, ...(books?.status().books.length ? BOOK_DEFS : {}), ...(dmCreatures.length ? CREATURE_DEFS : {}) };

  return {
    /** Agent tools: { name, description, schema, run(input) -> string }. Providers validate input. */
    list: Object.entries(defs).map(([name, d]) => ({ name, description: d.description, schema: d.schema, run: handlers[name] })),

    /** The DM's creatures named in the question, in full (so it can answer at once), or ''. */
    myCreaturesIn(question) {
      const words = ` ${creatureKey(question)} `;
      const named = dmCreatures.filter((c) => {
        const key = creatureKey(c.name);
        return key && (words.includes(` ${key} `) || words.includes(` ${key}s `) || words.includes(` ${key}es `));
      });
      if (!named.length) return '';
      return clip(`<my_creatures note="The DM's own creatures named in the question. These beat the books and your own knowledge.">\n${named.slice(0, 3).map(renderCreature).join('\n\n')}\n</my_creatures>`);
    },

    /**
     * Search on the question before calling the model, so it can often answer
     * in one turn. Free and fast (local search only).
     */
    async preSearch(question) {
      const budget = config.qa.preSearchTokens * 4;
      if (budget <= 0) return '';
      const [kbHits, chunkHits, noteHits] = await Promise.all([
        search.search(campaignId, question, { kinds: ['kb'], viewer, limit: 4 }),
        search.search(campaignId, question, { kinds: ['chunk'], viewer, limit: 3 }),
        search.search(campaignId, question, { kinds: ['note'], viewer: ownNotesOnly, limit: 3 }),
      ]);
      const parts = [
        ...recordsFromHits(kbHits).map(renderRecord),
        ...chunkHits.map((h) => formatChunks([h])),
        ...noteHits.map((h) => formatNotes([h])),
      ];
      if (!parts.length) return '';
      const each = Math.floor(budget / parts.length);
      return parts.map((p) => (p.length > each ? `${p.slice(0, each)}…` : p)).join('\n\n');
    },

    /**
     * Turn the answer's citations into evidence the player can check: the
     * transcript lines at each cited timestamp, or the session's date and
     * title for [S12]. Only sessions the asker attended.
     */
    evidenceFor(answer, max = 8) {
      const seen = new Set();
      const evidence = [];
      for (const m of answer.matchAll(CITATION_RE)) {
        const [, num, from, to] = m;
        const key = `${num} ${from ?? ''} ${to ?? ''}`;
        if (seen.has(key) || evidence.length >= max) continue;
        seen.add(key);
        const session = Number(num);
        const s = sessionByNumber(session);
        if (!s || !attended(s)) continue;
        if (from) {
          const a = parseTimestamp(from);
          const b = to ? parseTimestamp(to) : a;
          let lines = [];
          try {
            const all = transcript(session);
            lines = all.filter((u) => u.time >= a && u.time <= b);
            if (!lines.length) lines = all.filter((u) => u.time <= a).slice(-1);
          } catch {
            // transcript unreadable: skip this citation
          }
          if (lines.length) {
            evidence.push({ source: `S${session} ${from}${to ? `-${to}` : ''}`, excerpt: lines.slice(0, 6).map(formatUtterance).join('\n') });
          }
        } else {
          evidence.push({ source: `S${session}`, excerpt: `Session ${session}, played ${s.played_on}${s.title ? `: ${s.title}` : ''}` });
        }
      }
      return evidence;
    },
  };
}
