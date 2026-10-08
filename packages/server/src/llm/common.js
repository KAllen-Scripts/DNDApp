/**
 * Shared pieces for the LLM providers.
 *
 * Every provider exposes the same three calls:
 *   structured({ task, purpose, system, prompt, schema, attachments?, campaignId, userId }) -> parsed object
 *   research({ task, purpose, system, prompt, campaignId, userId }) -> string (web search and fetch only)
 *   agent({ task, purpose, system, prompt, tools, limits, ... })        -> { answer, costUsd, toolCalls }
 *
 * Agent tools are { name, description, schema (zod object), run(input) -> string }.
 * Attachments are { type: 'image' | 'document', media_type, data (base64) },
 * sent before the prompt (e.g. a photo or PDF of a character sheet).
 */
import { z } from 'zod';

export class LLMError extends Error {}
export class SpendingCapError extends LLMError {}

/** zod schema -> JSON schema accepted by structured outputs and tool definitions. */
export function toOutputSchema(schema) {
  const { $schema, ...rest } = z.toJSONSchema(schema);
  return rest;
}

export const LIMIT_REACHED =
  'You have reached the research limit for this question. Do not call any more tools. Answer now from what you have found, and say if anything is uncertain or missing.';

/** Records every call in llm_usage and enforces the monthly cap on real spend. */
export function createUsage({ db, config }) {
  const monthSpend = () =>
    db
      .prepare(
        "SELECT COALESCE(SUM(cost_usd), 0) AS c FROM llm_usage WHERE provider = 'api' AND created_at >= datetime('now', 'start of month')",
      )
      .get().c;

  return {
    monthSpend,

    /** Only API calls cost money; Claude Code runs on the subscription. */
    checkCap(provider) {
      if (provider === 'api' && monthSpend() >= config.monthlySpendCapUsd) {
        throw new SpendingCapError(
          `Monthly spending cap of $${config.monthlySpendCapUsd} reached. Raise MONTHLY_SPEND_CAP_USD to continue.`,
        );
      }
    },

    record({ provider, model, purpose, campaignId, userId, inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0, costUsd = 0, durationMs = null }) {
      db.prepare(
        `INSERT INTO llm_usage (provider, campaign_id, user_id, purpose, model, input_tokens, output_tokens,
           cache_read_tokens, cache_write_tokens, cost_usd, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(provider, campaignId ?? null, userId ?? null, purpose, model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd, durationMs);
      return costUsd;
    },
  };
}

/** A user message's content: attachments (images, PDFs), then the prompt. */
export function userContent(prompt, attachments = []) {
  if (!attachments.length) return prompt;
  return [
    ...attachments.map(({ type, media_type, data }) => ({ type, source: { type: 'base64', media_type, data } })),
    { type: 'text', text: prompt },
  ];
}
