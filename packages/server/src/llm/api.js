/**
 * Provider: the Anthropic API, billed per token to ANTHROPIC_API_KEY.
 * Streams every request (long transcripts would otherwise hit HTTP timeouts)
 * and runs the agent loop itself.
 */
import Anthropic from '@anthropic-ai/sdk';
import { LLMError, LIMIT_REACHED, toOutputSchema, userContent } from './common.js';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export const textOf = (message) =>
  message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

/**
 * @param {object} opts
 * @param {typeof import('../config.js').config} opts.config
 * @param {ReturnType<import('./common.js').createUsage>} opts.usage
 * @param {Anthropic} [opts.client]
 */
export function createApiProvider({ config, usage, client = new Anthropic() }) {
  const { tasks, pricing, fallbacks } = config.llm;

  function costOf(model, u) {
    const p = pricing[model];
    if (!p) return 0;
    return (
      ((u.input_tokens ?? 0) * p.input +
        (u.output_tokens ?? 0) * p.output +
        (u.cache_read_input_tokens ?? 0) * p.cacheRead +
        (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
      1e6
    );
  }

  /** One streamed request. Returns the final message and its cost. */
  async function call(params, { task, purpose, campaignId, userId, onText }) {
    usage.checkCap('api');
    const { model, effort } = tasks[task];
    const request = {
      model,
      max_tokens: 64000,
      ...params,
      output_config: { effort, ...params.output_config },
    };
    if (fallbacks) {
      request.betas = [FALLBACK_BETA];
      request.fallbacks = 'default';
    }

    const startedAt = Date.now();
    const stream = client.beta.messages.stream(request);
    if (onText) stream.on('text', onText);
    const message = await stream.finalMessage();
    const u = message.usage ?? {};
    const cost = usage.record({
      provider: 'api',
      model,
      purpose,
      campaignId,
      userId,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens,
      cacheWriteTokens: u.cache_creation_input_tokens,
      costUsd: costOf(model, u),
      durationMs: Date.now() - startedAt,
    });

    if (message.stop_reason === 'refusal') {
      const why = message.stop_details?.explanation ?? message.stop_details?.category ?? 'no details';
      throw new LLMError(`The model declined the request (${why}).`);
    }
    return { message, cost };
  }

  return {
    name: 'api',
    costOf,
    call,

    async structured({ task, purpose, system, prompt, schema, attachments, campaignId, userId }) {
      const { message } = await call(
        {
          system,
          max_tokens: 32000,
          messages: [{ role: 'user', content: userContent(prompt, attachments) }],
          output_config: { format: { type: 'json_schema', schema: toOutputSchema(schema) } },
        },
        { task, purpose, campaignId, userId },
      );
      if (message.stop_reason === 'max_tokens') {
        throw new LLMError(`${purpose}: output was cut off (max_tokens). Raise the limit or split the input.`);
      }
      let data;
      try {
        data = JSON.parse(textOf(message));
      } catch {
        throw new LLMError(`${purpose}: model returned invalid JSON.`);
      }
      return schema.parse(data);
    },

    async text({ task, purpose, system, prompt, campaignId }) {
      const { message } = await call(
        { system, max_tokens: 16000, messages: [{ role: 'user', content: prompt }] },
        { task, purpose, campaignId },
      );
      return textOf(message).trim();
    },

    /**
     * Look something up on the web with Anthropic's web search and fetch
     * (they run on Anthropic's side). Returns the answer as text. The
     * 20260209 tools need Opus/Sonnet 4.6 or later.
     */
    async research({ task, purpose, system, prompt, campaignId, userId, maxSearches = 8 }) {
      const tools = [
        { type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: maxSearches },
      ];
      const messages = [{ role: 'user', content: prompt }];
      // A long search can pause the turn; send it back to carry on.
      for (let i = 0; i < 5; i++) {
        const { message } = await call({ system, tools, messages, max_tokens: 32000 }, { task, purpose, campaignId, userId });
        if (message.stop_reason !== 'pause_turn') return textOf(message).trim();
        messages.push({ role: 'assistant', content: message.content });
      }
      throw new LLMError(`${purpose}: the search didn't finish.`);
    },

    /**
     * Manual tool loop with caps on tool calls and cost. When a cap is hit the
     * model is told to answer with what it has and tools are switched off.
     */
    async agent({ task, purpose, system, prompt, tools, limits, campaignId, userId, onText, onTool, onTurn }) {
      const byName = new Map(tools.map((t) => [t.name, t]));
      const toolDefs = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: toOutputSchema(t.schema),
        strict: true,
        eager_input_streaming: true,
      }));
      const messages = [{ role: 'user', content: prompt }];
      let toolCalls = 0;
      let costUsd = 0;

      for (let turn = 0; ; turn++) {
        const finalTurn = toolCalls >= limits.maxToolCalls || costUsd >= limits.maxCostUsd;
        onTurn?.(turn);
        const { message, cost } = await call(
          {
            system,
            tools: toolDefs,
            tool_choice: finalTurn ? { type: 'none' } : { type: 'auto' },
            messages,
            max_tokens: 32000,
            cache_control: { type: 'ephemeral' },
          },
          { task, purpose, campaignId, userId, onText },
        );
        costUsd += cost;

        const toolUses = message.content.filter((b) => b.type === 'tool_use');
        if (message.stop_reason !== 'tool_use' || !toolUses.length || finalTurn) {
          if (message.stop_reason === 'max_tokens') throw new LLMError('Answer was cut off (max_tokens).');
          return { answer: textOf(message).trim(), costUsd, toolCalls };
        }

        messages.push({ role: 'assistant', content: message.content });
        const results = [];
        for (const t of toolUses) {
          toolCalls++;
          onTool?.(t.name, t.input);
          const def = byName.get(t.name);
          const parsed = def?.schema.safeParse(t.input);
          let content;
          let isError = false;
          if (!def) [content, isError] = [`Unknown tool ${t.name}.`, true];
          else if (!parsed.success) [content, isError] = [`Invalid input: ${parsed.error.message}`, true];
          else {
            try {
              content = String(await def.run(parsed.data));
            } catch (err) {
              [content, isError] = [`Tool failed: ${err.message}`, true];
            }
          }
          results.push({ type: 'tool_result', tool_use_id: t.id, content, ...(isError && { is_error: true }) });
        }
        const atLimit = toolCalls >= limits.maxToolCalls || costUsd >= limits.maxCostUsd;
        messages.push({ role: 'user', content: atLimit ? [...results, { type: 'text', text: LIMIT_REACHED }] : results });
      }
    },
  };
}
