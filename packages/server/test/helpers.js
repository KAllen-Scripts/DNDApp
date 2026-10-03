import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config as baseConfig } from '../src/config.js';
import { createContext } from '../src/context.js';
import { buildApp } from '../src/app.js';

export const SAMPLE = `[00:00:05] KennyDM: Welcome back. You arrive in the village of Brindle at dusk.
[00:00:20] SamPlays: Thorin walks into the inn and asks for the innkeeper.
[00:00:40] KennyDM: Brother Hall, the innkeeper, warns you the Ashen Cult has been taking travellers.
[00:01:10] AlexR: Lyra asks where the cult hides.
[00:01:30] KennyDM: He says the old mill north of town. He gives you a silver key.
[00:02:00] SamPlays: We head to the mill at first light.`;

/** A second session Alex (Lyra) missed. */
export const SAMPLE_2 = `[00:00:05] KennyDM: Thorin reaches the old mill alone. The door is locked.
[00:00:30] SamPlays: Thorin uses the silver key.
[00:01:00] KennyDM: Inside, Thorin finds a ledger. The cult owes the Baron 200 gold.`;

/** Deterministic bag-of-words embedder, so tests don't download a model. */
export const fakeEmbedder = {
  model: 'fake-bow-64',
  async embed(texts) {
    return texts.map((t) => {
      const v = new Float32Array(64);
      for (const w of t.toLowerCase().match(/[a-z]+/g) ?? []) {
        let h = 0;
        for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        v[h % 64] += 1;
      }
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  },
};

const msg = (content, stop_reason = 'end_turn') => ({
  content,
  stop_reason,
  usage: { input_tokens: 100, output_tokens: 50 },
});

/** Call one of the agent's tools by name, validating input like a provider would. */
export async function callTool(tools, name, input) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`fake agent: no tool ${name}`);
  return t.run(t.schema.parse(input));
}

const record = (over) => ({
  kind: 'npc',
  title: 'x',
  body: '',
  data_json: '{}',
  status: '',
  tags: [],
  visibility: 'everyone',
  known_by: [],
  pinned: false,
  sources: [],
  reason: 'test',
  ...over,
});

/**
 * Default fake archivist: builds a small knowledge base from whatever it is
 * given, using the real tools. Tests can pass their own.
 */
export async function defaultArchivist({ prompt, tools }) {
  const session = /<session number="(\d+)"/.exec(prompt)?.[1];
  if (prompt.includes('<dm_correction')) {
    const list = await callTool(tools, 'list_records', { kind: 'npc', status: null });
    const id = Number(/#(\d+)/.exec(list)?.[1]);
    if (id) await callTool(tools, 'update_record', { ...nulls(), id, title: 'Brother Hal (corrected)', reason: 'DM correction' });
    return 'Applied the correction.';
  }
  if (session === '1') {
    await callTool(tools, 'update_guide', { text: 'Kinds: npc, debt, story. Story is pinned.', reason: 'first run' });
    await callTool(tools, 'create_record', record({ kind: 'npc', title: 'Brother Hal', body: 'Innkeeper in Brindle [S1 00:00:40].', sources: ['S1 00:00:40'] }));
    await callTool(tools, 'create_record', record({ kind: 'story', title: 'Story so far', body: 'The party reached Brindle [S1].', pinned: true }));
    await callTool(tools, 'ask_dm', { question: 'Is it Brother Hal or Brother Hall?', context: 'Transcript says Hall [S1 00:00:40].' });
  } else if (session === '2') {
    // Only Thorin's player was there (user id is in the session's "Attended" line).
    const attended = [...(/Attended: ([^\n]*)/.exec(prompt)?.[1] ?? '').matchAll(/user (\d+)/g)].map((m) => Number(m[1]));
    await callTool(tools, 'create_record', record({
      kind: 'debt',
      title: 'The cult owes the Baron 200 gold',
      body: 'Found in a ledger at the mill [S2 00:01:00].',
      status: 'open',
      visibility: 'restricted',
      known_by: attended,
    }));
  }
  return `Processed session ${session}.`;
}

const nulls = () => ({
  kind: null, title: null, body: null, data_json: null, status: null, tags: null,
  visibility: null, known_by: null, pinned: null, sources: null,
});

/**
 * Fake LLM. Archivist runs call `archivist({ prompt, tools })`; each Q&A
 * question consumes the next entry of `qaScript` (steps: { tool, input } or { answer }).
 */
export function createFakeLLM({ qaScript = [], archivist = defaultArchivist } = {}) {
  const calls = [];
  return {
    calls,
    async structured() {
      throw new Error('fake llm: structured() is not used any more');
    },
    async text() {
      throw new Error('fake llm: text() is not used any more');
    },
    async agent({ purpose, system, prompt, tools, onText, onTool, onTurn }) {
      const toolResults = [];
      calls.push({ purpose, system, prompt, toolResults });
      const tracked = tools.map((t) => ({
        ...t,
        run: async (input) => {
          onTool?.(t.name, input);
          const result = await t.run(input);
          toolResults.push({ tool: t.name, input, result });
          return result;
        },
      }));
      onTurn?.(0);
      if (purpose.startsWith('archivist:')) {
        const answer = await archivist({ prompt, tools: tracked, system });
        return { answer, costUsd: 0.01, toolCalls: toolResults.length };
      }
      for (const step of qaScript.shift() ?? [{ answer: 'I do not know.' }]) {
        if (step.answer) {
          onText?.(step.answer);
          return { answer: step.answer, costUsd: 0.01, toolCalls: toolResults.length };
        }
        await callTool(tracked, step.tool, step.input);
      }
      throw new Error('fake agent script ended without an answer');
    },
  };
}

/** Fake Anthropic client: `stream()` returns scripted messages in order and records requests. */
export function createFakeAnthropic(script) {
  const requests = [];
  return {
    requests,
    beta: {
      messages: {
        stream(req) {
          requests.push(structuredClone(req));
          const message = script.shift();
          const listeners = [];
          return {
            on(event, fn) {
              if (event === 'text') listeners.push(fn);
              return this;
            },
            async finalMessage() {
              for (const b of message.content) if (b.type === 'text') listeners.forEach((fn) => fn(b.text));
              return message;
            },
          };
        },
      },
    },
  };
}

export { msg as fakeMessage };

/**
 * A campaign with a DM (Kenny) and two players: Sam (Thorin) and Alex (Lyra),
 * with the speaker map linking transcript names to their accounts.
 */
export async function setup({ llm = createFakeLLM(), config = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dndapp-test-'));
  const paths = {
    archive: path.join(dir, 'archive'),
    db: path.join(dir, 'db.sqlite'),
    models: path.join(dir, 'models'),
  };
  const cfg = { ...baseConfig, ...config, qa: { ...baseConfig.qa, ...config.qa } };
  const ctx = await createContext({ config: cfg, paths, llm, embedder: fakeEmbedder, log: { error() {} } });
  const app = buildApp({ ...ctx, logger: false });

  const { user: dm, token } = ctx.auth.createUser('Kenny', { isAdmin: true });
  const campaign = ctx.store.createCampaign('Test Campaign');
  ctx.auth.addMember(campaign.id, dm.id, 'dm');
  const sam = ctx.auth.createUser('Sam');
  ctx.auth.addMember(campaign.id, sam.user.id, 'player', 'Thorin');
  const alex = ctx.auth.createUser('Alex');
  ctx.auth.addMember(campaign.id, alex.user.id, 'player', 'Lyra');
  ctx.store.setSpeakers(campaign.id, [
    { speaker: 'KennyDM', display_name: 'DM', user_id: dm.id },
    { speaker: 'SamPlays', display_name: 'Thorin (Sam)', user_id: sam.user.id },
    { speaker: 'AlexR', display_name: 'Lyra (Alex)', user_id: alex.user.id },
  ]);

  const request = (method, url, { body, as = token, headers = {} } = {}) =>
    app.inject({ method, url, payload: body, headers: { authorization: `Bearer ${as}`, ...headers } });

  return {
    ...ctx,
    dir,
    app,
    llm,
    dmToken: token,
    dm,
    sam: { ...sam.user, token: sam.token },
    alex: { ...alex.user, token: alex.token },
    campaign,
    request,
    cleanup: async () => {
      ctx.jobs.stop();
      await ctx.jobs.idle();
      await app.close();
      ctx.db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
