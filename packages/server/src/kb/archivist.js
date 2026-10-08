/**
 * The archivist: an AI agent with full authority over the knowledge base.
 * After each transcript (and after each DM correction) it reads the new
 * material and creates, rewrites, merges, re-tags or deletes records however
 * it judges best for answering players' questions later. It maintains its
 * own guide to how the knowledge base is organised, decides who knows what,
 * and leaves questions for the DM when sources conflict.
 *
 * It never touches the archive, so a rebuild can always start over.
 */
import { z } from 'zod';
import { formatTimestamp, formatTranscript, formatUtterance, parseTimestamp } from '@dndapp/shared';
import { estimateTokens } from '../config.js';
import { renderRecord, KBError } from './store.js';
import { preparedTranscript } from '../pipeline/prepare.js';

export const ARCHIVIST_SYSTEM = `You are the archivist for a Dungeons & Dragons campaign. You have full authority over the campaign's knowledge base: a store of records that you design, organise and maintain. No human reads it. Its only purpose is to let another AI answer players' questions accurately, quickly, and with sources, at any point in a long campaign.

## Your material
- Session transcripts from automatic speech-to-text of play recorded on Discord. Lines are "[HH:MM:SS] Speaker: text". Speech-to-text garbles names and words; use context, the glossary and existing records to recognise what was meant. Players mix in-character speech, rules talk and table chatter; record the story, not the chatter.
- Players' private notes from the session, with the player and the time written. They show what that player noticed or cared about, and often have better spellings and numbers than the transcript. They are that player's perspective, not established fact.
- Map events: what happened that day on the maps the DM showed the players (who appeared, fights starting and ending, who went down or got back up, conditions, doors opened, characters taking stairs or doors to another map), logged by the app with the time. Names and order are exact; use them to confirm and date what the transcript describes. A map's name is the DM's label, not necessarily its name in the world. With fog of war on, not every player saw every part of a map.
- DM corrections: authoritative. Apply them even if they contradict earlier records.
- The DM's narration is authoritative for what happened in the world. Player speculation is not fact; record it as speculation only if it matters.

## Organising the knowledge base
- You decide what kinds of records exist and how they're structured. Records have a free-form kind, title, body, JSON data, status, tags, sources, a known_by list, and a pinned flag.
- Track anything that will help answer questions later: people, places, factions, items, quests, debts and favours owed, promises and deals, relationships and attitudes, party inventory and money, rumours, clues, mysteries, timelines, what happened each session. Anything with a state that changes (owed → paid, alive → dead, active → done) should have a status you keep current, with its history in the body or data.
- Prefer updating an existing record over creating a near-duplicate. Merge duplicates (update one, delete the other). Delete records that turn out to be wrong or useless. Restructure freely when a better organisation becomes clear.
- Keep records focused. Split anything that grows large.
- Maintain the guide (update_guide): a concise description of your conventions (kinds, what data fields mean, statuses, naming, where to look for what). It's shown to you at the start of every run and to the question-answering AI. Keep it accurate whenever you change conventions.
- Pinned records are shown in full with every question. Use them for what nearly every question needs, such as a short story so far, the party and its current situation, and open obligations. Keep them short. There is a size budget.
- Cite sources on facts: [S12 01:23:45] for a transcript moment, [S12] for a session generally, [note S12 <player>] for a player's note.

## Who knows what (privacy)
Every record has known_by: "everyone" (visibility "everyone"), or a restricted list of user ids (visibility "restricted"). The question-answering AI only shows a player records they're allowed to see. Decide it like this:
- Something that happened openly in a session is known by the players who attended it (you're told who). If every member attended, use everyone.
- Something only in one player's private note is known only to that player, unless the transcript shows it was shared.
- Things the DM tells one player privately, or that only one character perceives (a whisper, a secret roll, "only Lyra sees…"), are known only to that player.
- Players who missed a session don't know what happened in it unless the transcript or notes show they were told later. When they're told, widen known_by.
- When one record mixes common and private knowledge, split it into a common record and a restricted one.
- When in doubt, restrict. Leaking a secret is worse than a missing fact.

## Questions for the DM
When sources conflict or something important is ambiguous and you can't resolve it (two different names for the same NPC, a debt amount that doesn't add up, unclear whether someone died), record your best interpretation and use ask_dm with a specific, answerable question. Don't ask about trivia. The DM's answers come back to you later as corrections.

## Working
- Read everything new first, then update the knowledge base thoroughly. Take your time; quality matters more than speed.
- Request several independent tool calls in one turn where you can.
- When finished, reply with a short report: what you added, changed, merged or removed, and any questions you asked.`;

const Visibility = {
  visibility: z.enum(['everyone', 'restricted']).describe('"everyone" = every member may know this; "restricted" = only the user ids in known_by'),
  known_by: z.array(z.number().int()).describe('User ids who may know this (used when visibility is "restricted")'),
};

const DEFS = {
  search_kb: {
    description: 'Search the knowledge base (keyword + meaning). Returns the best-matching records in full.',
    schema: z.object({ query: z.string(), kind: z.string().nullable().describe('Only this kind, or null') }),
  },
  list_records: {
    description: 'List records (id, kind, status, title, known_by), optionally filtered by kind and/or status.',
    schema: z.object({ kind: z.string().nullable(), status: z.string().nullable() }),
  },
  get_records: {
    description: 'Read records in full by id.',
    schema: z.object({ ids: z.array(z.number().int()) }),
  },
  create_record: {
    description: 'Create a record.',
    schema: z.object({
      kind: z.string(),
      title: z.string(),
      body: z.string().describe('Free text, your own format. Cite sources.'),
      data_json: z.string().describe('JSON object of structured fields (your own design), or "{}"'),
      status: z.string().describe('Current status, or ""'),
      tags: z.array(z.string()),
      ...Visibility,
      pinned: z.boolean(),
      sources: z.array(z.string()).describe('e.g. ["S12 01:23:45", "note S12 Sam"]'),
      reason: z.string().describe('Why (for the change journal)'),
    }),
  },
  update_record: {
    description: 'Change a record. Fields set to null are left unchanged.',
    schema: z.object({
      id: z.number().int(),
      kind: z.string().nullable(),
      title: z.string().nullable(),
      body: z.string().nullable(),
      data_json: z.string().nullable(),
      status: z.string().nullable(),
      tags: z.array(z.string()).nullable(),
      visibility: Visibility.visibility.nullable(),
      known_by: Visibility.known_by.nullable(),
      pinned: z.boolean().nullable(),
      sources: z.array(z.string()).nullable(),
      reason: z.string(),
    }),
  },
  delete_record: {
    description: 'Delete a record (e.g. after merging it into another, or if it was wrong).',
    schema: z.object({ id: z.number().int(), reason: z.string() }),
  },
  update_guide: {
    description: 'Replace your guide to how the knowledge base is organised.',
    schema: z.object({ text: z.string(), reason: z.string() }),
  },
  ask_dm: {
    description: 'Leave a question for the DM about a conflict or ambiguity you cannot resolve. Be specific.',
    schema: z.object({ question: z.string(), context: z.string().describe('What the sources say, with citations') }),
  },
  search_transcript: {
    description: 'Search all session transcripts. Returns timestamped excerpts.',
    schema: z.object({ query: z.string(), from_session: z.number().int().nullable(), to_session: z.number().int().nullable() }),
  },
  read_transcript: {
    description: 'Read part of a session transcript between two timestamps (HH:MM:SS).',
    schema: z.object({ session: z.number().int(), from: z.string(), to: z.string() }),
  },
  read_player_notes: {
    description: 'Read all players\' private notes for a session date (YYYY-MM-DD).',
    schema: z.object({ session_date: z.string() }),
  },
};

export function createArchivist({ db, store, kb, search, llm, config, mapEvents = () => [] }) {
  const A = config.archivist;

  function makeTools(cid, run, session) {
    const ctx = { session, reason: '' };
    const knownBy = (visibility, ids) => (visibility === 'restricted' ? [...new Set(ids)] : null);
    const parseData = (s) => {
      if (s == null) return undefined;
      if (!s.trim()) return {};
      const d = JSON.parse(s);
      if (typeof d !== 'object' || Array.isArray(d) || d === null) throw new KBError('data_json must be a JSON object.');
      return d;
    };
    const transcriptCache = new Map();
    const transcript = (n) => {
      if (!transcriptCache.has(n)) transcriptCache.set(n, preparedTranscript(store, cid, n));
      return transcriptCache.get(n);
    };
    const clip = (s, tokens = A.maxToolResultTokens) => (s.length > tokens * 4 ? `${s.slice(0, tokens * 4)}\n…(truncated)` : s);

    const handlers = {
      search_kb: async ({ query, kind }) => {
        const hits = await search.search(cid, query, { kinds: ['kb'], limit: 8 });
        const records = kb.getMany(cid, hits.map((h) => Number(h.ref_id))).filter((r) => !kind || r.kind === kind);
        return clip(records.map(renderRecord).join('\n\n---\n\n') || 'No matches.');
      },
      list_records: ({ kind, status }) =>
        clip(
          kb
            .list(cid, { kind, status })
            .map((r) => `#${r.id} | ${r.kind} | ${r.status || '-'} | ${r.title} | known_by: ${r.known_by == null ? 'everyone' : r.known_by.join(',')}${r.pinned ? ' | pinned' : ''}`)
            .join('\n') || 'No records.',
        ),
      get_records: ({ ids }) => clip(kb.getMany(cid, ids).map(renderRecord).join('\n\n---\n\n') || 'No such records.'),
      create_record: async (i) => {
        const r = await kb.create(
          cid,
          run,
          {
            kind: i.kind,
            title: i.title,
            body: i.body,
            data: parseData(i.data_json) ?? {},
            status: i.status,
            tags: i.tags,
            known_by: knownBy(i.visibility, i.known_by),
            pinned: i.pinned,
            sources: i.sources,
          },
          { ...ctx, reason: i.reason },
        );
        return `Created #${r.id}.`;
      },
      update_record: async (i) => {
        const fields = {};
        for (const k of ['kind', 'title', 'body', 'status', 'tags', 'pinned', 'sources']) if (i[k] != null) fields[k] = i[k];
        if (i.data_json != null) fields.data = parseData(i.data_json);
        if (i.visibility != null) fields.known_by = knownBy(i.visibility, i.known_by ?? []);
        else if (i.known_by != null) fields.known_by = [...new Set(i.known_by)];
        const r = await kb.update(cid, run, i.id, fields, { ...ctx, reason: i.reason });
        return `Updated #${r.id}.`;
      },
      delete_record: async ({ id, reason }) => {
        await kb.remove(cid, run, id, { reason });
        return `Deleted #${id}.`;
      },
      update_guide: async ({ text, reason }) => {
        await kb.setGuide(cid, run, text, reason);
        return 'Guide updated.';
      },
      ask_dm: ({ question, context }) => {
        db.prepare('INSERT INTO dm_questions (campaign_id, run, question, context) VALUES (?, ?, ?, ?)').run(cid, run, question, context);
        return 'Question saved for the DM.';
      },
      search_transcript: async ({ query, from_session, to_session }) => {
        const hits = await search.search(cid, query, {
          kinds: ['chunk'],
          fromSession: from_session ?? undefined,
          toSession: to_session ?? undefined,
          limit: 5,
        });
        return clip(
          hits.map((h) => `--- S${h.session_num} ${formatTimestamp(h.start_sec)}-${formatTimestamp(h.end_sec)}\n${h.text}`).join('\n\n') ||
            'No matches.',
        );
      },
      read_transcript: ({ session: n, from, to }) => {
        const a = parseTimestamp(from);
        const b = parseTimestamp(to);
        if (Number.isNaN(a) || Number.isNaN(b)) return 'Timestamps must be HH:MM:SS.';
        try {
          store.getSession(cid, n);
        } catch {
          return `No session ${n}.`;
        }
        const lines = transcript(n).filter((u) => u.time >= a && u.time <= b).map(formatUtterance);
        return lines.length ? clip(lines.join('\n'), 30_000) : 'No lines in that range.';
      },
      read_player_notes: ({ session_date }) => formatNotes(store.playerNotes(cid, { date: session_date })) || 'No notes for that date.',
    };

    return Object.entries(DEFS).map(([name, d]) => ({
      name,
      description: d.description,
      schema: d.schema,
      // KB validation errors go back to the model as messages it can act on.
      run: async (input) => {
        try {
          return await handlers[name](input);
        } catch (err) {
          if (err instanceof KBError || err instanceof SyntaxError) return `Error: ${err.message}`;
          throw err;
        }
      },
    }));
  }

  function rosterBlock(cid) {
    const roster = store.roster(cid);
    return `<members>\n${roster
      .map((m) => `user ${m.user_id} | ${m.name} | ${m.role}${m.character_name ? ` | plays ${m.character_name}` : ''}${m.speakers.length ? ` | transcript name: ${m.speakers.join(', ')}` : ''}`)
      .join('\n')}\n</members>`;
  }

  function stateBlock(cid) {
    const guide = kb.guide(cid);
    const pinned = kb.pinned(cid);
    const kinds = kb.kinds(cid);
    const questions = db.prepare("SELECT id, question FROM dm_questions WHERE campaign_id = ? AND status = 'open'").all(cid);
    return [
      `<guide>\n${guide || '(empty: the knowledge base is new. Design its organisation and write the guide.)'}\n</guide>`,
      pinned.length ? `<pinned_records>\n${pinned.map(renderRecord).join('\n\n---\n\n')}\n</pinned_records>` : '',
      `<record_counts>\n${kinds.map((k) => `${k.kind}: ${k.n}`).join('\n') || 'none yet'}\n</record_counts>`,
      questions.length ? `<open_questions_for_dm>\n${questions.map((q) => `- ${q.question}`).join('\n')}\n</open_questions_for_dm>` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  function formatNotes(notes) {
    return notes
      .map((n) => {
        const t = new Date(n.written_at);
        const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
        return `[${hhmm}] user ${n.user_id} (${n.user_name ?? 'unknown'}): ${n.text}`;
      })
      .join('\n');
  }

  async function run(cid, runLabel, session, prompt, onProgress) {
    let calls = 0;
    const { answer } = await llm.agent({
      task: 'archivist',
      purpose: `archivist:${runLabel}`,
      system: ARCHIVIST_SYSTEM,
      prompt,
      tools: makeTools(cid, runLabel, session),
      limits: { maxToolCalls: A.maxToolCalls, maxCostUsd: A.maxCostUsd },
      campaignId: cid,
      onTool: (name) => onProgress?.(++calls, name),
    });
    return answer;
  }

  return {
    /**
     * Update the knowledge base from one session.
     * @param {{ number: number, played_on: string, status: string }} session
     * @param {{ userIds: number[], assumed: boolean }} attendance
     */
    async runSession(cid, session, attendance, onProgress) {
      const utterances = preparedTranscript(store, cid, session.number);
      const text = formatTranscript(utterances);
      const notes = store.playerNotes(cid, { date: session.played_on });
      const roster = store.roster(cid);
      const names = new Map(roster.map((m) => [m.user_id, m.name]));
      const inline = estimateTokens(text) <= A.inlineTranscriptTokens;
      const events = mapEvents(cid, session.played_on);
      const duration = utterances.length ? formatTimestamp(utterances.at(-1).time) : '00:00:00';

      const prompt = [
        rosterBlock(cid),
        stateBlock(cid),
        `<session number="${session.number}" date="${session.played_on}">\nAttended: ${attendance.userIds.map((id) => `user ${id} (${names.get(id) ?? '?'})`).join(', ')}${
          attendance.assumed ? '\n(Assumed: the speaker map does not link transcript names to accounts, so everyone is treated as present.)' : ''
        }${session.reprocess ? '\nThis session was processed before. Update existing records rather than duplicating them.' : ''}\n</session>`,
        notes.length ? `<player_notes date="${session.played_on}">\n${formatNotes(notes)}\n</player_notes>` : '<player_notes>none</player_notes>',
        events.length ? `<map_events date="${session.played_on}">\n${events.join('\n')}\n</map_events>` : '',
        inline
          ? `<transcript session="${session.number}">\n${text}\n</transcript>`
          : `<transcript session="${session.number}">\nToo long to include (${utterances.length} lines, 00:00:00-${duration}). Read it in order with read_transcript, in parts of about 20 minutes.\n</transcript>`,
        `Update the knowledge base with everything from session ${session.number}.`,
      ].filter(Boolean).join('\n\n');

      return run(cid, `session ${session.number}`, session.number, prompt, onProgress);
    },

    /** Apply one DM correction. */
    async runCorrection(cid, correction, onProgress) {
      const prompt = [
        rosterBlock(cid),
        stateBlock(cid),
        `<dm_correction id="${correction.id}">\n${correction.text}\n</dm_correction>`,
        'Apply this correction from the DM to the knowledge base. Find every affected record. If it answers one of your open questions, that question is resolved.',
      ].join('\n\n');
      return run(cid, `correction ${correction.id}`, null, prompt, onProgress);
    },
  };
}
