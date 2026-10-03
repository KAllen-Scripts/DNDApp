import { createUsage } from './common.js';
import { createApiProvider } from './api.js';
import { createClaudeCodeProvider } from './claude-code.js';

export { LLMError, SpendingCapError, toOutputSchema } from './common.js';

/**
 * Pick the LLM provider from config.llm.provider:
 *   'claude-code'  Claude Code on this machine, using your Claude subscription (default)
 *   'api'          Anthropic API, billed per token to ANTHROPIC_API_KEY
 */
export function createLLM({ db, config }) {
  const usage = createUsage({ db, config });
  const provider =
    config.llm.provider === 'api'
      ? createApiProvider({ config, usage })
      : config.llm.provider === 'claude-code'
        ? createClaudeCodeProvider({ config, usage })
        : null;
  if (!provider) throw new Error(`Unknown LLM_PROVIDER "${config.llm.provider}" (use "claude-code" or "api").`);
  return provider;
}
