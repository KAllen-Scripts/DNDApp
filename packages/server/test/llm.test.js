import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { openDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { createUsage, SpendingCapError, LIMIT_REACHED } from '../src/llm/common.js';
import { createApiProvider } from '../src/llm/api.js';
import { createClaudeCodeProvider, limitedHandler } from '../src/llm/claude-code.js';
import { createFakeAnthropic, fakeMessage } from './helpers.js';

const Schema = z.object({ title: z.string() });
const echoTool = {
  name: 'echo',
  description: 'Echo the text back',
  schema: z.object({ text: z.string() }),
  run: async ({ text }) => `echo: ${text}`,
};

function usageFor(cfg = config) {
  const db = openDb(':memory:');
  return { db, usage: createUsage({ db, config: cfg }) };
}

// ---------- API provider ----------

test('api: structured output is requested with a JSON schema and parsed', async () => {
  const { db, usage } = usageFor();
  const client = createFakeAnthropic([fakeMessage([{ type: 'text', text: '{"title":"Hi"}' }])]);
  const api = createApiProvider({ config, usage, client });
  const out = await api.structured({ task: 'archivist', purpose: 'archivist:test', system: 'sys', prompt: 'p', schema: Schema });
  assert.deepEqual(out, { title: 'Hi' });
  const req = client.requests[0];
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.output_config.effort, 'high');
  assert.equal(req.fallbacks, 'default');
  const row = db.prepare('SELECT * FROM llm_usage').get();
  assert.equal(row.provider, 'api');
  assert.ok(row.cost_usd > 0);
});

test('api: agent runs tools, rejects bad input, and stops at the tool limit', async () => {
  const { usage } = usageFor();
  const toolUse = (id, input) => ({ type: 'tool_use', id, name: 'echo', input });
  const client = createFakeAnthropic([
    fakeMessage([toolUse('a', { text: 'one' }), toolUse('b', { wrong: 1 })], 'tool_use'),
    fakeMessage([{ type: 'text', text: 'final answer' }]),
  ]);
  const api = createApiProvider({ config, usage, client });
  const seen = [];
  const out = await api.agent({
    task: 'qa',
    purpose: 'qa',
    system: 's',
    prompt: 'q',
    tools: [echoTool],
    limits: { maxToolCalls: 2, maxCostUsd: 10 },
    onTool: (name) => seen.push(name),
  });
  assert.equal(out.answer, 'final answer');
  assert.equal(out.toolCalls, 2);
  assert.deepEqual(seen, ['echo', 'echo']);

  const results = client.requests[1].messages.at(-1).content;
  assert.equal(results[0].content, 'echo: one');
  assert.equal(results[1].is_error, true);
  assert.equal(results[2].text, LIMIT_REACHED);
  assert.deepEqual(client.requests[1].tool_choice, { type: 'none' });
});

test('api: monthly spending cap blocks further calls', async () => {
  const { db, usage } = usageFor({ ...config, monthlySpendCapUsd: 1 });
  usage.record({ provider: 'api', model: 'x', purpose: 'p', costUsd: 2 });
  const api = createApiProvider({ config: { ...config, monthlySpendCapUsd: 1 }, usage, client: createFakeAnthropic([]) });
  await assert.rejects(api.structured({ task: 'qa', purpose: 'p', system: 's', prompt: 'q', schema: z.object({ a: z.string() }) }), SpendingCapError);
  // Claude Code usage does not count toward the cap.
  db.prepare('DELETE FROM llm_usage').run();
  usage.record({ provider: 'claude-code', model: 'x', purpose: 'p', costUsd: 5 });
  assert.equal(usage.monthSpend(), 0);
});

// ---------- Claude Code provider ----------

/** Fake query(): records options and yields scripted SDK messages. */
function fakeQuery(messages) {
  const calls = [];
  const fn = ({ prompt, options }) => {
    calls.push({ prompt, options });
    return (async function* () {
      yield* messages;
    })();
  };
  fn.calls = calls;
  return fn;
}

const result = (fields) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: '',
  total_cost_usd: 0.02,
  usage: { input_tokens: 10, output_tokens: 5 },
  ...fields,
});

test('claude-code: runs locked down, on the subscription, and returns structured output', async () => {
  process.env.ANTHROPIC_API_KEY = 'should-not-be-passed';
  try {
    const { db, usage } = usageFor();
    const queryFn = fakeQuery([result({ structured_output: { title: 'Hi' } })]);
    const cc = createClaudeCodeProvider({ config, usage, queryFn });
    const out = await cc.structured({ task: 'archivist', purpose: 'archivist:test', system: 'sys', prompt: 'p', schema: Schema });
    assert.deepEqual(out, { title: 'Hi' });

    const { options, prompt } = queryFn.calls[0];
    assert.equal(prompt, 'p');
    assert.equal(options.systemPrompt, 'sys');
    assert.deepEqual(options.tools, []);
    assert.deepEqual(options.settingSources, []);
    assert.equal(options.strictMcpConfig, true);
    assert.equal(options.settings.disableClaudeAiConnectors, true);
    assert.deepEqual(options.skills, []);
    assert.equal(options.persistSession, false);
    assert.equal(options.permissionMode, 'dontAsk');
    assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
    assert.equal(options.outputFormat.type, 'json_schema');
    assert.equal(options.effort, 'high');

    const row = db.prepare('SELECT * FROM llm_usage').get();
    assert.equal(row.provider, 'claude-code');
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('claude-code: agent exposes only the given tools and streams text', async () => {
  const { usage } = usageFor();
  const queryFn = fakeQuery([
    { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start' } },
    { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } } },
    { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } } },
    result({ result: 'Hello' }),
  ]);
  const cc = createClaudeCodeProvider({ config, usage, queryFn });
  const text = [];
  const turns = [];
  const out = await cc.agent({
    task: 'qa',
    purpose: 'qa',
    system: 's',
    prompt: 'q',
    tools: [echoTool],
    limits: { maxToolCalls: 3, maxCostUsd: 0.5 },
    onText: (d) => text.push(d),
    onTurn: (t) => turns.push(t),
  });
  assert.equal(out.answer, 'Hello');
  assert.equal(text.join(''), 'Hello');
  assert.deepEqual(turns, [0]);
  const { options } = queryFn.calls[0];
  assert.deepEqual(options.tools, []);
  assert.deepEqual(options.allowedTools, ['mcp__dnd__echo']);
  assert.ok(options.mcpServers.dnd);
});

test('claude-code: failures are reported as errors', async () => {
  const { usage } = usageFor();
  const queryFn = fakeQuery([result({ subtype: 'error_during_execution', is_error: true, errors: ['not logged in'] })]);
  const cc = createClaudeCodeProvider({ config, usage, queryFn });
  await assert.rejects(cc.research({ task: 'qa', purpose: 'p', system: 's', prompt: 'q' }), /not logged in/);
});

test('claude-code: tool wrapper counts calls and stops at the limit', async () => {
  const state = { toolCalls: 0 };
  const calls = [];
  const h = limitedHandler(echoTool, state, { maxToolCalls: 2 }, (name) => calls.push(name));
  assert.equal((await h({ text: 'a' })).content[0].text, 'echo: a');
  assert.match((await h({ text: 'b' })).content[0].text, /echo: b[\s\S]*research limit/);
  assert.equal((await h({ text: 'c' })).content[0].text, LIMIT_REACHED);
  assert.equal(state.toolCalls, 2);
  assert.deepEqual(calls, ['echo', 'echo']);

  const failing = limitedHandler({ ...echoTool, run: async () => { throw new Error('boom'); } }, { toolCalls: 0 }, { maxToolCalls: 5 });
  const r = await failing({ text: 'x' });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /boom/);
});

test('AI walls run one level below the most effort by default (the owner: max cost too much)', { skip: process.env.EFFORT_WALLS ? 'EFFORT_WALLS is set' : false }, () => {
  assert.equal(config.llm.tasks.walls.effort, 'xhigh');
});
