/** Picking the AI provider and the embedder; the vector helpers used by search. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { createLLM } from '../src/llm/index.js';
import { createEmbedder, toBlob, fromBlob, dot } from '../src/embeddings.js';

test('createLLM: claude-code and api give a provider; anything else is refused by name', () => {
  const db = openDb(':memory:');
  try {
    for (const provider of ['claude-code', 'api']) {
      const llm = createLLM({ db, config: { ...config, llm: { ...config.llm, provider } } });
      assert.ok(llm && typeof llm === 'object', provider);
    }
    assert.throws(() => createLLM({ db, config: { ...config, llm: { ...config.llm, provider: 'gpt' } } }), /Unknown LLM_PROVIDER "gpt"/);
  } finally {
    db.close();
  }
});

test('createEmbedder: "none" turns search by meaning off; an unknown provider is refused', async () => {
  assert.equal(await createEmbedder({ provider: 'none' }), null);
  await assert.rejects(createEmbedder({ provider: 'cloud' }), /Unknown embeddings provider: cloud/);
});

test('vectors survive the database round trip; dot is the cosine of unit vectors', () => {
  const v = Float32Array.from([0.6, 0.8, 0]);
  const blob = toBlob(v);
  assert.ok(Buffer.isBuffer(blob));
  assert.equal(blob.length, 12);
  // A Buffer from SQLite can sit at an offset inside a larger pool.
  const pooled = Buffer.concat([Buffer.alloc(4), blob]).subarray(4);
  assert.deepEqual(Array.from(fromBlob(pooled)), Array.from(v));
  assert.ok(Math.abs(dot(v, v) - 1) < 1e-6);
  assert.equal(dot(v, Float32Array.from([0, 0, 1])), 0);
});
