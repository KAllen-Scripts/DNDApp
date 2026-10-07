import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config as baseConfig } from '../src/config.js';
import { createContext } from '../src/context.js';
import { buildApp } from '../src/app.js';
import sharp from 'sharp';

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
 * structured() calls (sheet uploads, spell lookups) go to `structured({ purpose, prompt, attachments, schema })`.
 */
export function createFakeLLM({ qaScript = [], archivist = defaultArchivist, structured } = {}) {
  const calls = [];
  return {
    calls,
    async structured(opts) {
      calls.push({ purpose: opts.purpose, system: opts.system, prompt: opts.prompt, attachments: opts.attachments ?? [] });
      if (!structured) throw new Error(`fake llm: no structured() handler for ${opts.purpose}`);
      return opts.schema.parse(await structured(opts));
    },
    async text() {
      throw new Error('fake llm: text() is not used any more');
    },
    async agent({ purpose, system, prompt, tools, onText, onTool, onTurn }) {
      const toolResults = [];
      calls.push({ purpose, system, prompt, toolResults, tools: tools.map((t) => t.name) });
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

/** Password given to every test account. */
export const PASSWORD = 'correct horse';

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
  // No books unless a test provides some (the real ones would make tests slow and machine-specific).
  const cfg = { ...baseConfig, booksDir: path.join(dir, 'books'), ...config, qa: { ...baseConfig.qa, ...config.qa } };
  const ctx = await createContext({ config: cfg, paths, llm, embedder: fakeEmbedder, log: { error() {} } });
  const app = buildApp({ ...ctx, logger: false });

  // Accounts are created as the admin would, then logged in like the web page does.
  const account = async (name, opts = {}) => {
    await ctx.auth.createUser(name, { password: PASSWORD, ...opts });
    return ctx.auth.login(name, PASSWORD);
  };
  const { user: dm, token } = await account('Kenny', { isAdmin: true });
  const campaign = ctx.store.createCampaign('Test Campaign');
  ctx.auth.addMember(campaign.id, dm.id, 'dm');
  const sam = await account('Sam');
  ctx.auth.addMember(campaign.id, sam.user.id, 'player', 'Thorin');
  const alex = await account('Alex');
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

/**
 * A small text PDF: one array of lines per page, and optionally bookmarks
 * ({ title, page } with 1-based pages, all at the top level).
 */
export function makePdf(pages, { bookmarks = [] } = {}) {
  const esc = (t) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const pageRef = (i) => `${4 + i * 2} 0 R`;
  const outlinesAt = 4 + pages.length * 2;
  const objects = [
    [1, `<< /Type /Catalog /Pages 2 0 R${bookmarks.length ? ` /Outlines ${outlinesAt} 0 R` : ''} >>`],
    [2, `<< /Type /Pages /Kids [${pages.map((_, i) => pageRef(i)).join(' ')}] /Count ${pages.length} >>`],
    [3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],
  ];
  pages.forEach((lines, i) => {
    const content = `BT /F1 11 Tf 14 TL 72 740 Td ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
    objects.push([4 + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`]);
    objects.push([5 + i * 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  });
  if (bookmarks.length) {
    const item = (k) => outlinesAt + 1 + k;
    objects.push([outlinesAt, `<< /Type /Outlines /First ${item(0)} 0 R /Last ${item(bookmarks.length - 1)} 0 R /Count ${bookmarks.length} >>`]);
    bookmarks.forEach((b, k) => {
      const links = `${k > 0 ? ` /Prev ${item(k - 1)} 0 R` : ''}${k < bookmarks.length - 1 ? ` /Next ${item(k + 1)} 0 R` : ''}`;
      objects.push([item(k), `<< /Title (${esc(b.title)}) /Parent ${outlinesAt} 0 R /Dest [${pageRef(b.page - 1)} /Fit]${links} >>`]);
    });
  }
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (const [n, body] of objects) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${body}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A grey terrain picture, with dark grid lines every `size` pixels if asked. */
export async function terrain(width, height, { size = null, x = 0, y = 0, line = 2 } = {}) {
  const buf = Buffer.alloc(width * height * 3);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let v = 120 + 60 * Math.sin(px / 90) * Math.cos(py / 70) + (rnd() - 0.5) * 40;
      if (size) {
        const dx = (((px - x) % size) + size) % size;
        const dy = (((py - y) % size) + size) % size;
        if (dx < line || dy < line) v = 40;
      }
      buf.fill(Math.max(0, Math.min(255, Math.round(v))), (py * width + px) * 3, (py * width + px) * 3 + 3);
    }
  }
  return sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
}
