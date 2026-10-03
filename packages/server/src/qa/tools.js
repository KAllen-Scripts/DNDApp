/**
 * Read-only tools for the Q&A agent, plus the server-side steps around it:
 * a free search before the model is called (so many questions are answered
 * in one turn), and evidence built from the answer's citations.
 *
 * Everything is filtered for the person asking:
 *   - knowledge-base records and transcripts: only what they may know
 *     (records' known_by; transcripts of sessions they attended). DMs see all.
 *   - player notes: only their own. Not even the DM sees other players' notes.
 */
import { z } from 'zod';
import { formatTimestamp, formatUtterance, parseTimestamp, CITATION_RE } from '@dndapp/shared';
import { renderRecord } from '../kb/store.js';
import { preparedTranscript } from '../pipeline/prepare.js';

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

/**
 * @param {object} opts
 * @param {{ userId: number, seesAll: boolean }} opts.viewer  who is asking
 */
export function createTools({ db, store, kb, search, config, campaignId, viewer }) {
  const maxChars = config.qa.maxToolResultTokens * 4;
  const clip = (s) => (s.length > maxChars ? `${s.slice(0, maxChars)}\n…(truncated)` : s);
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
  };

  return {
    /** Agent tools: { name, description, schema, run(input) -> string }. Providers validate input. */
    list: Object.entries(DEFS).map(([name, d]) => ({ name, description: d.description, schema: d.schema, run: handlers[name] })),

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
