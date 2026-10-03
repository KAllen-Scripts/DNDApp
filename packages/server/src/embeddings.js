/**
 * Text embeddings for meaning-based search. Runs locally via transformers.js;
 * the model (~25 MB) is downloaded once into data/models.
 *
 * An embedder is { model: string, dims: number, embed(texts[]) -> Float32Array[] }.
 */

export async function createEmbedder({ provider, model, cacheDir }) {
  if (provider === 'none') return null;
  if (provider !== 'local') throw new Error(`Unknown embeddings provider: ${provider}`);

  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;
  let extractor;

  return {
    model,
    async embed(texts) {
      extractor ??= await pipeline('feature-extraction', model, { dtype: 'fp32' });
      const out = [];
      // Small batches keep memory flat on long transcripts.
      for (let i = 0; i < texts.length; i += 16) {
        const batch = texts.slice(i, i + 16);
        const tensor = await extractor(batch, { pooling: 'mean', normalize: true });
        const [n, dims] = tensor.dims;
        for (let j = 0; j < n; j++) out.push(Float32Array.from(tensor.data.subarray(j * dims, (j + 1) * dims)));
      }
      return out;
    },
  };
}

export const toBlob = (vec) => Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
export const fromBlob = (buf) => new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

/** Vectors are normalised, so the dot product is the cosine similarity. */
export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
