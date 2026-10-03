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

export class RateLimitError extends Error {}

const SYSTEM = `You answer a player's questions about their Dungeons & Dragons campaign. The sessions were recorded and transcribed by speech-to-text, and an archivist AI maintains a knowledge base from them (its guide to how it's organised is below). Players also keep private notes. You can search all of it with your tools; everything you can see has already been filtered to what this player's character may know.

How to research:
- The archivist's guide and pinned records are below, and each question comes with the results of an automatic search on it. If those answer the question, answer straight away without calling tools.
- Otherwise use the guide to decide where to look: search_kb / list_records / get_records for the knowledge base.
- Go to search_transcript / read_transcript only for exact wording or details the knowledge base lacks.
- search_my_notes searches this player's own notes, including the current session, which may not be processed yet.
- When you need several lookups, request them all at once in a single turn rather than one after another.
- Stop researching as soon as you can answer. Don't read things you don't need.

How to answer:
- Answer only from what you found. If the sources don't cover it, say you don't know, and say what you did find.
- Cite sources inline, one per bracket: [S<session>], [S<session> HH:MM:SS], or [S<session> HH:MM:SS-HH:MM:SS], e.g. "She warned you about the cult [S12 01:23:45]." Use transcript timestamps whenever you have them; the player is shown the transcript lines you cite. Say "your notes" when something comes from the player's own notes.
- Transcripts come from speech-to-text and can garble names. The knowledge base is the archivist's interpretation; prefer the transcript when they disagree.
- Distinguish what the DM established as fact from what players speculated.
- Keep it conversational and concise. Use markdown only when it helps (lists for multiple items).
- Never reveal or hint at anything this player's character wouldn't know.`;

export function createQA({ db, store, kb, search, llm, config }) {
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
          `INSERT INTO qa_log (conversation_id, user_id, question, answer, evidence, tool_calls, cost_usd, duration_ms, first_text_ms, status)
           VALUES (@conversationId, @userId, @question, @answer, @evidence, @toolCalls, @cost, @durationMs, @firstTextMs, @status)`,
        )
        .run(row).lastInsertRowid,
    );
  }

  /**
   * @param {object} opts
   * @param {number} opts.campaignId
   * @param {number} opts.userId
   * @param {string} opts.question
   * @param {number} [opts.conversationId]  continue an existing conversation
   * @param {(event: object) => void} [opts.emit]  progress events for streaming to the client
   */
  async function ask({ campaignId, userId, question, conversationId, emit = () => {} }) {
    checkRate(userId);
    const startedAt = Date.now();
    const campaign = store.getCampaign(campaignId);

    if (conversationId) {
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ? AND campaign_id = ?').get(conversationId, userId, campaignId);
      if (!conv) throw new Error('Conversation not found');
    } else {
      conversationId = Number(
        db
          .prepare('INSERT INTO conversations (campaign_id, user_id, title) VALUES (?, ?, ?)')
          .run(campaignId, userId, question.slice(0, 80)).lastInsertRowid,
      );
    }
    emit({ type: 'conversation', conversationId });

    const member = store.roster(campaignId).find((m) => m.user_id === userId);
    const viewer = { userId, seesAll: member?.role === 'dm' };
    const pinned = kb.pinned(campaignId, viewer);
    const who = member
      ? `${member.name}${member.role === 'dm' ? ' (the DM; may see everything except players\' private notes)' : member.character_name ? `, who plays ${member.character_name}` : ''}`
      : 'a member of the campaign';
    const system = [
      SYSTEM,
      `Campaign: ${campaign.name}\nYou are answering: ${who}.`,
      `<archivist_guide>\n${kb.guide(campaignId) || 'No sessions have been processed yet.'}\n</archivist_guide>`,
      pinned.length ? `<pinned_records>\n${pinned.map(renderRecord).join('\n\n---\n\n')}\n</pinned_records>` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const tools = createTools({ db, store, kb, search, config, campaignId, viewer });
    const found = await tools.preSearch(question);
    const prompt =
      `${historyBlock(conversationId)}Question: ${question}` +
      (found
        ? `\n\n<automatic_search_results note="Found by searching for the question. May or may not be relevant.">\n${found}\n</automatic_search_results>`
        : '');

    const toolLog = [];
    let firstTextMs = null;
    const row = { conversationId, userId, question, evidence: '[]', firstTextMs: null };

    let answer;
    let cost = 0;
    try {
      ({ answer, costUsd: cost } = await llm.agent({
        task: 'qa',
        purpose: 'qa',
        system,
        prompt,
        tools: tools.list,
        limits: { maxToolCalls: Q.maxToolCalls, maxCostUsd: Q.maxCostUsd },
        campaignId,
        userId,
        onTurn: (turn) => emit({ type: 'turn', turn }),
        onText: (delta) => {
          firstTextMs ??= Date.now() - startedAt;
          emit({ type: 'text', delta });
        },
        onTool: (name, input) => {
          toolLog.push({ name, input });
          emit({ type: 'tool', name, input });
        },
      }));
    } catch (err) {
      log({ ...row, answer: String(err.message ?? err), toolCalls: json.str(toolLog), cost, durationMs: Date.now() - startedAt, status: 'error' });
      throw err;
    }

    const evidence = tools.evidenceFor(answer);
    const durationMs = Date.now() - startedAt;
    const id = log({ ...row, answer, evidence: json.str(evidence), toolCalls: json.str(toolLog), cost, durationMs, firstTextMs, status: 'ok' });
    const result = { id, conversationId, answer, evidence, toolCalls: toolLog.length, costUsd: cost, durationMs };
    emit({ type: 'done', ...result });
    return result;
  }

  return { ask };
}
