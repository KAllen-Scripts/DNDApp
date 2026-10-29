/**
 * Provider: Claude Code, via the Claude Agent SDK, using the Claude
 * subscription that Claude Code is logged in with on this machine.
 *
 * Locked down: none of Claude Code's built-in tools (files, shell, web) are
 * available; no user/project settings, hooks, CLAUDE.md files, skills,
 * plugins, MCP servers or claude.ai connectors are loaded; and nothing is
 * saved to Claude Code's session history. The only tools are the read-only
 * search tools passed in by the Q&A agent, and web search and fetch for
 * research() (the DM looking a creature up online).
 */
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { LLMError, LIMIT_REACHED, toOutputSchema, userContent } from './common.js';

const SERVER = 'dnd';

/**
 * Claude Code's environment, minus API credentials so it uses the subscription login.
 * `quiet`: no telemetry, error reports or update checks, which took ~2.3 s of every start (docs/notes/ask-speed.md).
 */
export function subscriptionEnv({ quiet = true } = {}) {
  const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...env } = process.env;
  // Claude Code cuts an MCP tool result past 25,000 tokens by default; the tools size their own replies (fit.js).
  return { ...env, CLAUDE_AGENT_SDK_CLIENT_APP: 'dndapp/0.1', MAX_MCP_OUTPUT_TOKENS: '100000', ...(quiet && { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }) };
}

/** One user message as the SDK's streaming input. */
async function* singleMessage(content) {
  yield { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null };
}

/**
 * Wrap an agent tool for the MCP server: counts calls, and once the limit is
 * reached stops running tools and tells the model to answer.
 */
export function limitedHandler(t, state, limits, onTool) {
  return async (input) => {
    if (state.toolCalls >= limits.maxToolCalls) return { content: [{ type: 'text', text: LIMIT_REACHED }] };
    state.toolCalls++;
    onTool?.(t.name, input);
    try {
      const text = String(await t.run(input));
      const atLimit = state.toolCalls >= limits.maxToolCalls;
      return { content: [{ type: 'text', text: atLimit ? `${text}\n\n${LIMIT_REACHED}` : text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Tool failed: ${err.message}` }], isError: true };
    }
  };
}

/**
 * @param {object} opts
 * @param {typeof import('../config.js').config} opts.config
 * @param {ReturnType<import('./common.js').createUsage>} opts.usage
 * @param {typeof query} [opts.queryFn]  injectable for tests
 */
export function createClaudeCodeProvider({ config, usage, queryFn = query }) {
  const { tasks } = config.llm;

  /** Run one query to completion. Returns the result message. */
  async function run({ task, purpose, system, prompt, campaignId, userId, options = {}, onMessage, effort: chosen, model: chosenModel }) {
    const model = chosenModel || tasks[task].model;
    const effort = chosen || tasks[task].effort;
    let result;
    const startedAt = Date.now();
    for await (const msg of queryFn({
      prompt,
      options: {
        model,
        effort,
        systemPrompt: system,
        tools: [],
        settingSources: [],
        // Keep your claude.ai connectors, synced skills/plugins and other MCP
        // servers out of these runs (applies to this invocation only).
        settings: { disableClaudeAiConnectors: true, syncClaudeAiSkills: false, syncClaudeAiPlugins: false },
        strictMcpConfig: true,
        skills: [],
        persistSession: false,
        permissionMode: 'dontAsk',
        env: subscriptionEnv({ quiet: config.llm.quietStart !== false }),
        maxTurns: 3,
        ...options,
      },
    })) {
      onMessage?.(msg);
      if (msg.type === 'result') result = msg;
    }
    if (!result) throw new LLMError(`${purpose}: Claude Code ended without a result.`);

    const u = result.usage ?? {};
    usage.record({
      provider: 'claude-code',
      model,
      purpose,
      campaignId,
      userId,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens,
      cacheWriteTokens: u.cache_creation_input_tokens,
      costUsd: result.total_cost_usd ?? 0, // estimate only; not billed on a subscription
      durationMs: Date.now() - startedAt,
    });

    if (result.subtype !== 'success' || result.is_error) {
      const detail = result.errors?.join('; ') || result.result || result.subtype;
      throw new LLMError(`${purpose}: Claude Code failed (${detail}).`);
    }
    return result;
  }

  return {
    name: 'claude-code',

    async structured({ task, purpose, system, prompt, schema, attachments = [], campaignId, userId, effort }) {
      const result = await run({
        task,
        effort,
        purpose,
        system,
        // Images and PDFs go in as a streamed user message; plain prompts as text.
        prompt: attachments.length ? singleMessage(userContent(prompt, attachments)) : prompt,
        campaignId,
        userId,
        options: { outputFormat: { type: 'json_schema', schema: toOutputSchema(schema) } },
      });
      if (result.structured_output === undefined) throw new LLMError(`${purpose}: no structured output returned.`);
      return schema.parse(result.structured_output);
    },

    /** Look something up on the web (search and fetch pages only). Returns the answer as text. */
    async research({ task, purpose, system, prompt, campaignId, userId, maxSearches = 8 }) {
      const web = ['WebSearch', 'WebFetch'];
      const result = await run({ task, purpose, system, prompt, campaignId, userId, options: { tools: web, allowedTools: web, maxTurns: maxSearches * 2 + 4 } });
      return result.result.trim();
    },

    async agent({ task, purpose, system, prompt, tools, limits, campaignId, userId, onText, onTool, onTurn, effort, model }) {
      const state = { toolCalls: 0 };
      let turn = 0;
      const server = createSdkMcpServer({
        name: SERVER,
        version: '1.0.0',
        tools: tools.map((t) => tool(t.name, t.description, t.schema.shape, limitedHandler(t, state, limits, onTool))),
      });

      const result = await run({
        task,
        effort,
        model,
        purpose,
        system,
        prompt,
        campaignId,
        userId,
        options: {
          mcpServers: { [SERVER]: server },
          allowedTools: tools.map((t) => `mcp__${SERVER}__${t.name}`),
          includePartialMessages: true,
          maxTurns: limits.maxToolCalls + 4,
          // Hard stop well above the soft limit, in case the model ignores it.
          maxBudgetUsd: limits.maxCostUsd * 3,
        },
        onMessage: (msg) => {
          if (msg.type !== 'stream_event' || msg.parent_tool_use_id) return;
          const e = msg.event;
          if (e.type === 'message_start') onTurn?.(turn++);
          else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') onText?.(e.delta.text);
        },
      });
      return { answer: result.result.trim(), costUsd: result.total_cost_usd ?? 0, toolCalls: state.toolCalls };
    },
  };
}
