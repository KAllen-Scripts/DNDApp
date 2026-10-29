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
import { fitWhole } from '../llm/fit.js';

export const ARCHIVIST_SYSTEM = `You are the archivist for a Dungeons & Dragons campaign. You have full authority over the campaign's knowledge base: a store of records that you design, organise and maintain. No human reads it. Its only purpose is to let another AI answer players' questions accurately, quickly, and with sources, at any point in a long campaign.

## Your material
- Session transcripts from automatic speech-to-text of play recorded on Discord. Lines are "[HH:MM:SS] Speaker: text". Speech-to-text garbles names and words; use context, the glossary and existing records to recognise what was meant. Players mix in-character speech, rules talk and table chatter; record the story, not the chatter (but anything said about the world, the characters or the party's plans is story).
- Players' private notes from the session, with the player and the time written. They show what that player noticed or cared about, and often have better spellings and numbers than the transcript. They are that player's perspective, not established fact.
- Map events: what happened that day on the maps the DM showed the players (who appeared, fights starting and ending, who went down or got back up, conditions, doors opened, characters taking stairs or doors to another map), logged by the app with the time. Names and order are exact; use them to confirm and date what the transcript describes. A map's name is the DM's label, not necessarily its name in the world. With fog of war on, not every player saw every part of a map. A line ending "[seen only by user N, ...]" happened on a map the DM showed only to those players: only they (and the DM) know it. Lines about journeys (characters setting off, arriving, stopping on the way) give the campaign's in-game clock as "Day 14, 18:00": use it for in-game dates and how long travel took; each character travels on their own, so note who went where.
- Character sheets: each player's own sheet for their character (class, level, abilities, hit points, equipment, spells, backstory and so on), the whole sheet the first time you see it and then each change with when it happened. Players keep them up to date, so they are good evidence for levels gained, items and money picked up or spent, and spells learned; use the time of a change to place it in the story. A sheet is what the player wrote, not established fact about the world: a backstory is the player's account until play confirms it. A player can have several characters, one of them the one they play now (the roster's "plays", and each sheet's status when they have more than one); a switch between them is told to you with its time: from then on that player's part in the story is the new character's, while the other stays a character of the world (keep their record; they may come back).
- Late note changes: notes written, edited or deleted after their session was processed. An edit replaces what the note said; a deleted note no longer counts as a source.
- Handouts: pictures and text the DM gave players, with who received them and when. You can't see pictures, so the AI reads each one for you: any writing word for word, then what it shows. They are what the DM showed those players; treat their text and pictures as the DM's.
- DM corrections: authoritative. Apply them even if they contradict earlier records.
- The DM's narration is authoritative for what happened in the world. Player speculation is not fact; record it as speculation only if it matters.

## Organising the knowledge base
- You decide what kinds of records exist and how they're structured. Records have a free-form kind, title, body, JSON data, status, tags, sources, a known_by list, and a pinned flag.
- Track anything that will help answer questions later: people, places, factions, items, quests, debts and favours owed, promises and deals, relationships and attitudes, party inventory and money, rumours, clues, mysteries, timelines, what happened each session. Anything with a state that changes (owed → paid, alive → dead, active → done) should have a status you keep current, with its history in the body or data.
- Be thorough. Archive every detail the sources give, not a summary of them: names (with every spelling seen), numbers, amounts, prices, dates and in-game times, who said what to whom, how people, places and things look, what was tried and how it went, and what is still unknown. Keep word for word anything that may matter in its exact words: deals, oaths, prophecies, riddles, inscriptions, passwords, letters, and anything a character states as a rule or a condition. Size is not a concern: there is plenty of room, records can be long and there can be as many as you need. A detail you leave out can't be recovered when a player asks; a long record can still be searched.
- Never lose information. When you update, merge, split or restructure records, carry every fact and citation over, and check the new version holds everything the old one did. When a state changes, keep the history (what it was, when and why it changed) rather than overwriting it. Delete only records that are wrong, or whose every fact now lives in another record.
- Prefer updating an existing record over creating a near-duplicate. Merge duplicates (update one, delete the other). Restructure freely when a better organisation becomes clear.
- Keep each record about one subject. When a record nears the size limit, split it into several records (a person's story by arc, a city by district) and name the related records in each so they're found together. Never shorten a record to make it fit.
- Maintain the guide (update_guide): a concise description of your conventions (kinds, what data fields mean, statuses, naming, where to look for what). It's shown to you at the start of every run and to the question-answering AI. Keep it accurate whenever you change conventions.
- Pinned records are shown in full with every question. Use them for what nearly every question needs, such as a short story so far, the party and its current situation, and open obligations. Keep them short (there is a size budget) and let them point to the full records, which hold the detail. A pinned record is a short extra view: never drop detail from the knowledge base to fit one.
- Cite sources on facts: [S12 01:23:45] for a transcript moment, [S12] for a session generally, [note S12 <player>] for a player's note, [sheet <player> 2026-10-08] for a character sheet as of a date, [handout <title>] for a handout.

## Who knows what (privacy)
Every record has known_by: "everyone" (visibility "everyone"), or a restricted list of user ids (visibility "restricted"). The question-answering AI only shows a player records they're allowed to see. Decide it like this:
- Something that happened openly in a session is known by the players who attended it (you're told who). If every member attended, use everyone.
- Something only in one player's private note is known only to that player, unless the transcript shows it was shared.
- Character sheets are private to their player. Something only on a sheet (a backstory secret, a hidden item, exact hit points) is known only to that player, unless the transcript, notes or map events show others know it. The character's name, race and class are usually plain to the party once they've played together.
- A handout is known by the players who received it (everyone if it went to everyone).
- Things the DM tells one player privately, or that only one character perceives (a whisper, a secret roll, "only Lyra sees…"), are known only to that player.
- Players who missed a session don't know what happened in it unless the transcript or notes show they were told later. When they're told, widen known_by.
- When one record mixes common and private knowledge, split it into a common record and a restricted one.
- When in doubt, restrict. Leaking a secret is worse than a missing fact.

## Questions for the DM
When sources conflict or something important is ambiguous and you can't resolve it (two different names for the same NPC, a debt amount that doesn't add up, unclear whether someone died), record your best interpretation and use ask_dm with a specific, answerable question. Don't ask about trivia. The DM's answers come back to you later as corrections.

## Working
- Read everything new first, then update the knowledge base thoroughly: go through the material from start to end and make sure every event, fact and detail in it ends up in a record. Before you finish, check the material again for anything you haven't recorded. Take your time; completeness and accuracy matter more than speed.
- Tool results never cut a record or a transcript line short. When something doesn't fit in one reply, the reply says what was left out and how to get it; get it.
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
    description: 'List records (id, kind, status, title, known_by), optionally filtered by kind and/or status. A long list comes in pages; the reply says the offset for the next page.',
    schema: z.object({
      kind: z.string().nullable(),
      status: z.string().nullable(),
      offset: z.number().int().nullable().describe('Skip this many records (for the next page), or null'),
    }),
  },
  get_records: {
    description: 'Read records in full by id. Records are never cut short; if they don\'t all fit in one reply, it names the ones to ask for again.',
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
    description: 'Read part of a session transcript between two timestamps (HH:MM:SS). If the range is too long for one reply, it stops at a whole line and says where to continue.',
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
    // Tool results are built from whole records, chunks and lines, never cut mid-way (fit.js).
    const budget = A.maxToolResultTokens * 4;
    const records = (list, empty) =>
      list.length
        ? fitWhole(list, budget, {
            render: renderRecord,
            leftOver: (left) => `Not shown, to keep this reply readable (read them with get_records): ${left.map((r) => `#${r.id} ${r.title}`).join('; ')}`,
          }).text
        : empty;

    const handlers = {
      search_kb: async ({ query, kind }) => {
        const hits = await search.search(cid, query, { kinds: ['kb'], limit: 8 });
        return records(kb.getMany(cid, hits.map((h) => Number(h.ref_id))).filter((r) => !kind || r.kind === kind), 'No matches.');
      },
      list_records: ({ kind, status, offset }) => {
        const all = kb.list(cid, { kind, status });
        if (!all.length) return 'No records.';
        const from = Math.max(0, offset ?? 0);
        if (from >= all.length) return `No records past offset ${from} (there are ${all.length}).`;
        const { shown, left, text } = fitWhole(all.slice(from), budget, {
          sep: '\n',
          render: (r) => `#${r.id} | ${r.kind} | ${r.status || '-'} | ${r.title} | known_by: ${r.known_by == null ? 'everyone' : r.known_by.join(',')}${r.pinned ? ' | pinned' : ''}`,
        });
        const to = from + shown.length;
        return left.length ? `${text}\n\nRecords ${from + 1}-${to} of ${all.length}. For the rest, call list_records again with offset ${to}.` : text;
      },
      get_records: ({ ids }) => records(kb.getMany(cid, ids), 'No such records.'),
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
        if (!hits.length) return 'No matches.';
        return fitWhole(hits, budget, {
          sep: '\n\n',
          render: (h) => `--- S${h.session_num} ${formatTimestamp(h.start_sec)}-${formatTimestamp(h.end_sec)}\n${h.text}`,
          leftOver: (left) => `Also matched, not shown (read them with read_transcript): ${left.map((h) => `S${h.session_num} ${formatTimestamp(h.start_sec)}-${formatTimestamp(h.end_sec)}`).join('; ')}`,
        }).text;
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
        const lines = transcript(n).filter((u) => u.time >= a && u.time <= b);
        if (!lines.length) return 'No lines in that range.';
        const { text, left } = fitWhole(lines, budget, { sep: '\n', render: formatUtterance });
        return left.length
          ? `${text}\n\n(This reply stops here to stay readable. Continue with read_transcript from ${formatTimestamp(left[0].time)}.)`
          : text;
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

    /**
     * Read what changed between sessions: character sheets (new ones in full,
     * then each change with its time), late note changes and handouts. See kb/updates.js.
     * @param {{ since: string, until: string, sheets: string[], notes: string[], handouts: string[] }} updates
     */
    async runUpdates(cid, updates, onProgress) {
      const prompt = [
        rosterBlock(cid),
        stateBlock(cid),
        updates.sheets.length ? `<character_sheets>\n${updates.sheets.join('\n\n')}\n</character_sheets>` : '',
        updates.notes.length ? `<note_changes>\n${updates.notes.join('\n')}\n</note_changes>` : '',
        updates.handouts?.length ? `<handouts>\n${updates.handouts.join('\n\n')}\n</handouts>` : '',
        'Update the knowledge base with these changes made between sessions. Times are when each change was saved or each handout given. Keep each character\'s record current (level, hit points, equipment, money, spells) with its history, and keep anything learned only from a sheet or a note known only to its player.',
      ].filter(Boolean).join('\n\n');
      return run(cid, 'updates', null, prompt, onProgress);
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
