/**
 * Q&A agent: answers a player's question by searching the campaign in stages
 * (cheap summaries first, raw transcript only when needed), then answering
 * with citations.
 *
 * Speed: the server searches on the question before calling the model and
 * includes the results, so many questions are answered in a single turn.
 * Evidence is built from the answer's citations afterwards, so the model
 * doesn't spend turns saving it.
 *
 * Cost stays flat as the campaign grows: tool calls, result size and spend
 * per question are all capped.
 */
import { json } from '../db/index.js';
import { renderRecord } from '../kb/store.js';
import { createTools } from './tools.js';
import { creatureLabel } from '../creatures.js';
import { handbookEditions } from '../sheets/books.js';
import { routeQuestion } from './route.js';

export class RateLimitError extends Error {}

/** For the DM only, after the list of their creatures (owner's request, 2026-10-09). */
const DM_CREATURES = `How to use the DM's creatures: when the DM asks about a creature or NPC (its stats, attacks, AC, hit points, tactics), check their creatures first. A saved one with that name ("Goblin 3" or "the goblins" mean "Goblin") is the DM's own version: its stat block and notes take priority over the books, the campaign records and your own knowledge, even where they differ from the official creature. Get it with get_my_creatures (creatures named in the question are already included below), answer from it, and say it's from their Bestiary tab. Use the books or your knowledge only when none matches or it has no stat block, and then say so.`;

/** The DM's wiki, for the DM (owner, 2026-10-20: "When the DM asks questions this should draw from the archivist AND the wiki"). */
const WIKI_DM = `How to use the DM's wiki: the DM keeps a wiki of their own pages about the world (people, places, factions, secrets, plans), separate from the archivist's records. For questions about the campaign, use both: search_wiki and read_wiki_page for the wiki, the knowledge-base tools for the records. The wiki is the DM's own word on what is true in the world, including what the players haven't found out; the records are what happened in play. When they disagree, say so and give both. Each wiki section says who the DM has made it available to; when the DM asks what the players know, use that and the records' known_by. Parts can be marked: [rumour] (heard, not confirmed), [Name's account] (a player's telling, not yet confirmed), [false: … Truth: …] (what the players believe and what is really so: tell the DM the truth, and say what the players believe) and [planned: …] (the DM's prep, not yet in play). Cite wiki pages like this: (wiki: Page title).`;

/** The parts of the DM's wiki made available to this player (owner, 2026-10-20: "If the part of the wiki is available to the players, then their ask should use it"). */
const WIKI_PLAYER = `How to use the wiki: the DM has shared some pages of their wiki with this player (search_wiki, read_wiki_page). It's the DM's own word about the world, so treat it like the DM's narration. A part marked [rumour] is only a rumour: say it's a rumour, and never confirm or deny it. A part marked [Name's account] is that character's telling: give it as theirs. Use it alongside the records for questions about the campaign, and cite it like this: (wiki: Page title).`;

/** Owner, 2026-10-21: "We don't need to know how the editions differ… Just what is relevant to the edition we are playing." */
const EDITION_ONLY = "Answer for the group's edition only (see \"The group's edition\" below). Don't say how the other edition or older printings differ, and don't compare editions, unless the player asks.";

/** How answers are laid out (both ways of answering). */
const FORMAT = `How to format:
- Your answer is shown as a web page. Write markdown: **bold**, lists, headings, and tables (| a | b |) when comparing things or listing several items with the same details.
- You may also write HTML where markdown can't do it, such as merged table cells. Allowed: p, br, hr, strong, em, u, s, small, sub, sup, code, pre, blockquote, h1-h6, ul, ol, li, dl, dt, dd, table, caption, thead, tbody, tr, th, td, div, span, details, summary, with only class, colspan, rowspan and scope attributes. No links, images, scripts or style attributes; they are removed.
- For a creature's or NPC's stat block, use this layout:
<div class="stat-block">
<h3>Brown Bear</h3>
<p><em>Large beast, unaligned</em></p>
<hr>
<p><strong>Armor Class</strong> 11 (natural armor)<br><strong>Hit Points</strong> 34 (4d10 + 12)<br><strong>Speed</strong> 40 ft., climb 30 ft.</p>
<hr>
<table class="ability-scores"><tr><th>STR</th><th>DEX</th><th>CON</th><th>INT</th><th>WIS</th><th>CHA</th></tr><tr><td>19 (+4)</td><td>10 (+0)</td><td>16 (+3)</td><td>2 (−4)</td><td>13 (+1)</td><td>7 (−2)</td></tr></table>
<hr>
<p><strong>Skills</strong> Perception +3<br><strong>Senses</strong> passive Perception 13<br><strong>Languages</strong> —<br><strong>Challenge</strong> 1 (200 XP)</p>
<hr>
<p><strong><em>Keen Smell.</em></strong> The bear has advantage on Wisdom (Perception) checks that rely on smell.</p>
<h4>Actions</h4>
<p><strong><em>Multiattack.</em></strong> …</p>
</div>
- Put citations in the text as usual, e.g. inside a table cell; they still become links.
- Keep short answers as plain sentences. Use structure when it makes the answer easier to read, not for its own sake.`;

const SYSTEM = `You answer a player's questions during their Dungeons & Dragons campaign. The sessions were recorded and transcribed by speech-to-text, and an archivist AI maintains a knowledge base from them (its guide to how it's organised is below). Players also keep private notes. You can search all of it with your tools; everything you can see has already been filtered to what this player's character may know.

First, decide what kind of question it is:
- General D&D knowledge: rules, conditions, spells, class features, items, or the standard stat block of a creature ("What's the stat block for a brown bear?", "How does grappling work?", "What does Bless do?"). These are normal, welcome questions; don't remark that it isn't about the campaign. When the group's books are listed below, look the answer up in them (see "How to use the books"), so it matches the books and edition the group plays with. Without books, answer straight away from your own knowledge of D&D 5th edition, without calling tools. Either way, if the automatic search results below show the campaign changes it (a house rule, a homebrew version, a DM ruling), mention that too, with its citation. When you answer from your own knowledge, give no citations, and when it matters say it's the standard rules rather than something from the sessions.
- About this campaign: anything involving its people, places, events, items, choices or rulings ("the bear we fought", "what did the Baron want?", "what did the DM rule about flanking?"). Research it as described below and answer only from what you find.
- Both: answer the general part from your own knowledge and research the campaign part. If you can't tell which is meant, give the standard answer and say what you found in the campaign, if anything.

How to research campaign questions:
- The archivist's guide and pinned records are below, and each question comes with the results of an automatic search on it. If those answer the question, answer straight away without calling tools.
- Otherwise use the guide to decide where to look: search_kb / list_records / get_records for the knowledge base.
- Go to search_transcript / read_transcript only for exact wording or details the knowledge base lacks.
- search_my_notes searches this player's own notes, including the current session, which may not be processed yet.
- When you need several lookups, request them all at once in a single turn rather than one after another.
- Stop researching as soon as you can answer. Don't read things you don't need.

How to use the books (only when the group's books are listed below):
- Look up every rules question in them: rules, conditions, spells, class features, items, tables, stat blocks, and anything the player asks the book about. Your memory mixes editions and printings; the group's books are what they play by. Search in your first turn, together with any campaign lookups the question needs.
- Players are often vague ("can I hit the guy running away?"). Work out which rule they mean, then search with the words the book uses: the official name plus synonyms, several terms in one search_books call (e.g. ["opportunity attack", "leaves your reach", "Disengage"]). Never search with the player's sentence.
- Snippets are only a few lines: read_book the best page before you answer, and read two pages when the section runs on past the bottom of the page. If a hit is the book's index ("grappling, 195"), read the page it points to. If nothing fits, search again with different terms, or use book_contents to browse to the right chapter.
- Editions: each book is listed with the year it was first printed. Books first printed in 2024 or later use the revised (2024) rules; earlier ones use the 2014 rules. The two differ on many details (exhaustion, grappling, many spells and class features), so never mix them in one answer. Use the group's edition (below), and its books: search_books looks in them first. If only a book of the other edition covers it, say in a few words which edition you're quoting.
- If the books don't cover it (say, a stat block when there's no bestiary among them), answer from your own knowledge and say it isn't in their books.
- If you can't tell which rule they mean, give the likeliest answer and ask which they meant, or just ask if guessing would mislead.
- The text comes from scans and may have OCR errors (e.g. "Vou" for "You", "Id6" for "1d6"); correct them silently. Quote only the lines that answer the question, and cite the page with the book's title as listed, like this: (Player's Handbook p. 195). Book pages aren't campaign sources, so don't use the [S…] format for them.

How to answer:
- For the campaign, answer only from what you found. If the sources don't cover it, say you don't know, and say what you did find.
- Cite sources inline, one per bracket: [S<session>], [S<session> HH:MM:SS], or [S<session> HH:MM:SS-HH:MM:SS], e.g. "She warned you about the cult [S12 01:23:45]." Use transcript timestamps whenever you have them; the player is shown the transcript lines you cite. Say "your notes" when something comes from the player's own notes.
- Transcripts come from speech-to-text and can garble names. The knowledge base is the archivist's interpretation; prefer the transcript when they disagree.
- Distinguish what the DM established as fact from what players speculated.
- Keep it conversational and concise. Never reveal or hint at anything this player's character wouldn't know.
- ${EDITION_ONLY}

${FORMAT}`;

/**
 * The quick way (qa/route.js): a general D&D lookup with nothing pointing at
 * the campaign. One turn when it can be: the answer from the model's own
 * knowledge of the group's edition, the books only when the wording matters.
 */
const QUICK = `You answer a player's general Dungeons & Dragons question during their campaign: a rule, condition, spell, class feature, item or the standard stat block of a creature. Answer it straight away, in one go.

How to answer:
- Work out what they mean (players are often vague: "that item that is a bag you pull summons out of" is the Bag of Tricks) and answer from your own knowledge of the group's rules. Name the thing in bold first.
- ${EDITION_ONLY}
- Be brief: what it is and what it does, with the numbers that matter (dice, range, uses, DC). A few sentences or a short list. No history, background or variants unless asked.
- The books (when listed below) are there when the exact wording or numbers matter and you aren't sure of them for the group's edition: then one search_books with the book's own terms and one read_book of the best page, and cite it like this: (Player's Handbook p. 195). Otherwise don't call tools. The text comes from scans; correct OCR errors silently.
- The automatic search results below come from the campaign's records. If they show the campaign changes the answer (a house rule, a homebrew version, a DM ruling), say so in a line with its citation ([S<session>]). If they show the question is really about the campaign, answer from them, and if they don't cover it, say the player can ask for a thorough answer.
- When you answer from your own knowledge, give no citations. Never reveal or hint at anything this player's character wouldn't know.

${FORMAT}`;


/**
 * Which rules the group plays by: the DM's campaign setting when there is one
 * ('2014' or '2024'), else judged from their Player's Handbook(s), else
 * `fallback` (editions.js): one edition, never both side by side.
 */
export function groupEdition(shelf, chosen = null, fallback = '2014') {
  if (chosen) {
    return `The group's edition: the DM has set this campaign to the ${chosen} rules. Answer rules questions with the ${chosen} rules${shelf.length ? `, from the ${chosen} books where the group has them (if only a book of the other edition covers it, say which edition you're quoting)` : ''}.`;
  }
  const editions = handbookEditions(shelf);
  const known = editions.filter(Boolean);
  if (known.length === 1 && editions.length === 1) {
    return `The group's edition: their Player's Handbook is the ${known[0]} one, so answer with the ${known[0]} rules unless the player, the archivist's guide or the pinned records say they play otherwise.`;
  }
  if (known.length > 1) {
    return `The group's edition: they have Player's Handbooks of both editions. Use the edition the archivist's guide or pinned records say they play; if nothing says, answer with the ${fallback} rules and say so in a few words. Don't give both.`;
  }
  return `The group's edition: unknown. Use the edition the archivist's guide or pinned records say they play; if nothing says, answer with the ${fallback} rules and say so in a few words.`;
}

export function createQA({ db, store, kb, search, books, creatures = null, editions = null, wiki = null, llm, config }) {
  const Q = config.qa;

  function checkRate(userId) {
    const { n } = db
      .prepare("SELECT COUNT(*) AS n FROM qa_log WHERE user_id = ? AND created_at >= datetime('now', '-1 hour')")
      .get(userId);
    if (n >= Q.questionsPerUserPerHour) {
      throw new RateLimitError(`You've asked ${n} questions in the last hour. Please wait a bit.`);
    }
  }

  function historyBlock(conversationId) {
    const turns = db
      .prepare("SELECT question, answer, evidence FROM qa_log WHERE conversation_id = ? AND status = 'ok' ORDER BY id DESC LIMIT ?")
      .all(conversationId, Q.historyTurns)
      .reverse();
    if (!turns.length) return '';
    const last = json.parse(turns.at(-1).evidence, []);
    return `<earlier_in_this_conversation>\n${turns
      .map((t) => `Player: ${t.question}\nYou: ${(t.answer ?? '').slice(0, 1500)}`)
      .join('\n\n')}${
      last.length ? `\n\nSources cited in the last answer:\n${last.map((e) => `- [${e.source}] ${e.excerpt}`).join('\n')}` : ''
    }\n</earlier_in_this_conversation>\n\n`;
  }

  function log(row) {
    return Number(
      db
        .prepare(
          `INSERT INTO qa_log (conversation_id, user_id, question, answer, evidence, tool_calls, cost_usd, duration_ms, first_text_ms, path, status)
           VALUES (@conversationId, @userId, @question, @answer, @evidence, @toolCalls, @cost, @durationMs, @firstTextMs, @path, @status)`,
        )
        .run(row).lastInsertRowid,
    );
  }

  /** How the last question in this conversation was answered ('quick' or 'full'), or null. */
  const previousPath = (conversationId) =>
    db.prepare("SELECT path FROM qa_log WHERE conversation_id = ? AND status = 'ok' ORDER BY id DESC LIMIT 1").get(conversationId)?.path ?? null;

  /** Names this asker can see (records, wiki pages, characters): a question naming one is about the campaign. Only what they may see, so the way it's answered gives nothing away. */
  function namesFor(campaignId, viewer, roster) {
    const names = kb.list(campaignId, { viewer }).map((r) => r.title);
    if (wiki) {
      for (const seen of wiki.listFor(campaignId, viewer)) names.push(seen.title, ...(viewer.seesAll ? seen.aliases ?? [] : []));
    }
    for (const m of roster) names.push(m.character_name, m.name);
    return names.filter(Boolean);
  }

  /**
   * @param {object} opts
   * @param {number} opts.campaignId
   * @param {number} opts.userId
   * @param {string} opts.question
   * @param {number} [opts.conversationId]  continue an existing conversation
   * @param {'auto' | 'quick' | 'thorough'} [opts.mode]  the asker's pick; auto lets qa/route.js decide
   * @param {(event: object) => void} [opts.emit]  progress events for streaming to the client
   * @returns the answer, with `timing` (where the time went, for the server log)
   */
  async function ask({ campaignId, userId, question, conversationId, mode = 'auto', emit = () => {} }) {
    checkRate(userId);
    const startedAt = Date.now();
    const since = () => Date.now() - startedAt;
    const campaign = store.getCampaign(campaignId);

    if (conversationId) {
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ? AND campaign_id = ? AND deleted_at IS NULL').get(conversationId, userId, campaignId);
      if (!conv) throw new Error('Conversation not found');
    } else {
      conversationId = Number(
        db
          .prepare('INSERT INTO conversations (campaign_id, user_id, title) VALUES (?, ?, ?)')
          .run(campaignId, userId, question.slice(0, 80)).lastInsertRowid,
      );
    }
    emit({ type: 'conversation', conversationId });

    const roster = store.roster(campaignId);
    const member = roster.find((m) => m.user_id === userId);
    const viewer = { userId, seesAll: member?.role === 'dm' };
    // The DM's saved creatures: only when the DM asks.
    const dmCreatures = viewer.seesAll && creatures ? creatures.list(campaignId).filter((c) => !c.finding) : [];
    const names = [...namesFor(campaignId, viewer, roster), ...dmCreatures.map((c) => c.name)];
    const route = routeQuestion(question, { names, mode, previous: previousPath(conversationId) });
    const quick = route.path === 'quick';
    const pinned = quick ? [] : kb.pinned(campaignId, viewer);
    // The books are read once after a restart, which takes a while: a quick question doesn't wait for them.
    const booksAt = Date.now();
    const shelfReady = !books || !quick || !books.loading?.();
    if (shelfReady) await books?.load();
    const booksMs = Date.now() - booksAt;
    const shelf = (shelfReady && books?.status().books) || [];
    const chosenEdition = editions?.chosen(campaignId) ?? null;
    const fallbackEdition = (await editions?.fallback()) ?? '2014';
    // search_books looks in this edition's books first (null: not known for sure, so all of them).
    const bookEdition = (await editions?.known(campaignId)) ?? null;
    const who = member
      ? `${member.name}${member.role === 'dm' ? ' (the DM; may see everything except players\' private notes)' : member.character_name ? `, who plays ${member.character_name}` : ''}`
      : 'a member of the campaign';
    const tools = createTools({ db, store, kb, search, books: shelfReady ? books : null, wiki, config, campaignId, viewer, dmCreatures, bookEdition });
    const system = [
      quick ? QUICK : SYSTEM,
      `Campaign: ${campaign.name}\nYou are answering: ${who}.`,
      quick ? '' : `<archivist_guide>\n${kb.guide(campaignId) || 'No sessions have been processed yet.'}\n</archivist_guide>`,
      shelf.length
        ? `<books note="The group's own rulebooks. Search them with search_books, read_book and book_contents.">\n${shelf
            .map((b) => `- ${b.title} (${b.year ? `first printed ${b.year}, ` : ''}pages ${b.range})`)
            .join('\n')}\n</books>`
        : '',
      groupEdition(shelf, chosenEdition, fallbackEdition),
      dmCreatures.length
        ? `<dm_creatures note="The DM's own creatures (their bestiary) and people (NPCs), saved on their Bestiary tab. Only the DM sees them; you're answering the DM.">\n${dmCreatures
            .map((c) => `- ${c.name} (${creatureLabel(c)}${c.stats ? '' : ', no stat block'})`)
            .join('\n')}\n</dm_creatures>\n${DM_CREATURES}`
        : '',
      tools.hasWiki ? (viewer.seesAll ? WIKI_DM : WIKI_PLAYER) : '',
      pinned.length ? `<pinned_records>\n${pinned.map(renderRecord).join('\n\n---\n\n')}\n</pinned_records>` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    // Quick: only the records (house rules, homebrew), in a smaller budget; no transcripts or notes.
    const found = await tools.preSearch(question, quick ? { tokens: Q.quickPreSearchTokens, only: ['kb', 'wiki'] } : {});
    const mine = tools.myCreaturesIn(question);
    const prompt =
      `${historyBlock(conversationId)}Question: ${question}` +
      (mine ? `\n\n${mine}` : '') +
      (found
        ? `\n\n<automatic_search_results note="Found by searching for the question. May or may not be relevant.">\n${found}\n</automatic_search_results>`
        : '');
    const prepMs = since();

    // Where the time goes (owner, 2026-10-21: "Ask is way too slow"): logged with every answer.
    const timing = {
      path: route.path,
      why: route.reason,
      effort: quick ? Q.quickEffort : null,
      system_chars: system.length,
      prompt_chars: prompt.length,
      prep_ms: prepMs,
      books_wait_ms: booksMs,
      ...(!shelfReady && { books: 'still loading: answered without them' }),
      first_turn_ms: null,
      first_text_ms: null,
      turns: 0,
      tools: [],
      total_ms: null,
    };
    const toolLog = [];
    const row = { conversationId, userId, question, evidence: '[]', firstTextMs: null, path: route.path };

    // Each tool timed, for the log.
    const timed = tools.list.map((t) => ({
      ...t,
      run: async (input) => {
        const at = Date.now();
        try {
          return await t.run(input);
        } finally {
          timing.tools.push({ name: t.name, at_ms: at - startedAt, ms: Date.now() - at });
        }
      },
    }));

    let answer;
    let cost = 0;
    try {
      ({ answer, costUsd: cost } = await llm.agent({
        task: 'qa',
        purpose: 'qa',
        system,
        prompt,
        tools: timed,
        ...(quick && { effort: Q.quickEffort }),
        limits: { maxToolCalls: quick ? Q.quickMaxToolCalls : Q.maxToolCalls, maxCostUsd: Q.maxCostUsd },
        campaignId,
        userId,
        onTurn: (turn) => {
          timing.turns++;
          timing.first_turn_ms ??= since();
          emit({ type: 'turn', turn });
        },
        onText: (delta) => {
          timing.first_text_ms ??= since();
          emit({ type: 'text', delta });
        },
        onTool: (name, input) => {
          toolLog.push({ name, input });
          emit({ type: 'tool', name, input });
        },
      }));
    } catch (err) {
      timing.total_ms = since();
      timing.error = String(err.message ?? err);
      err.timing = timing;
      log({ ...row, answer: String(err.message ?? err), toolCalls: json.str(toolLog), cost, durationMs: timing.total_ms, firstTextMs: timing.first_text_ms, status: 'error' });
      throw err;
    }

    const evidence = tools.evidenceFor(answer);
    const durationMs = since();
    timing.total_ms = durationMs;
    const id = log({ ...row, answer, evidence: json.str(evidence), toolCalls: json.str(toolLog), cost, durationMs, firstTextMs: timing.first_text_ms, status: 'ok' });
    const result = { id, conversationId, answer, evidence, toolCalls: toolLog.length, costUsd: cost, durationMs, path: route.path };
    emit({ type: 'done', ...result });
    return { ...result, timing };
  }

  return { ask };
}
