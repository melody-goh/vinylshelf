/**
 * Turns text into vectors for the taste engine (ADR 0008 §2). One interface, two
 * implementations: the real model (transformers.js running bge-small-en-v1.5 on ONNX,
 * locally, no vendor) and a deterministic fake for tests, which never load a model.
 */
import { createHash } from 'node:crypto';
import type { EmbeddingModelInfo } from '../catalogue/model.js';
import { normalise } from './vectors.js';

export interface Embedder {
  readonly model: EmbeddingModelInfo;
  /** Unit-length vectors, one per text, in order. */
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}

/**
 * The model ADR 0008 chose, measured on 2026-10-26: 34 MB of q8 weights, about 170 MB
 * resident, 3 ms a query. CLS pooling and normalisation are what bge models expect.
 */
export const BGE_SMALL: EmbeddingModelInfo = {
  id: 'Xenova/bge-small-en-v1.5',
  dtype: 'q8',
  dims: 384,
  pooling: 'cls',
};

/**
 * bge models embed a search *query* with this instruction in front, and a passage (a
 * catalogue master) without it; the asymmetry is how they were trained for retrieval.
 */
export const BGE_QUERY_INSTRUCTION = 'Represent this sentence for searching relevant passages: ';

/** Where `models:fetch` puts weights and where the API reads them; git-ignored. */
export const DEFAULT_MODELS_DIR = new URL('../../.models/', import.meta.url).pathname;

/**
 * The real model, loaded once from `modelsDir` and never downloaded at runtime: the API
 * must not depend on Hugging Face being reachable (ADR 0012 §6). Pass
 * `allowDownload` only from the setup script and the build workflow.
 */
export async function createModelEmbedder(options: {
  modelsDir?: string;
  allowDownload?: boolean;
  model?: EmbeddingModelInfo;
}): Promise<Embedder> {
  const model = options.model ?? BGE_SMALL;
  const { env, pipeline } = await import('@huggingface/transformers');
  env.cacheDir = options.modelsDir ?? DEFAULT_MODELS_DIR;
  env.localModelPath = options.modelsDir ?? DEFAULT_MODELS_DIR;
  env.allowRemoteModels = options.allowDownload ?? false;
  const extract = await pipeline('feature-extraction', model.id, {
    dtype: model.dtype as 'q8',
  });
  return {
    model,
    async embed(texts) {
      if (texts.length === 0) return [];
      const output = await extract([...texts], { pooling: model.pooling, normalize: true });
      const data = output.data as Float32Array;
      return texts.map((_, i) => data.slice(i * model.dims, (i + 1) * model.dims));
    },
  };
}

/**
 * A stand-in for tests: hashes each word into a few dimensions (a "bag of words"
 * vector), so texts that share words point the same way. Deterministic, instant, and
 * good enough to test ranking logic without a model.
 */
export function createFakeEmbedder(dims = 64): Embedder {
  return {
    model: { id: 'fake/bag-of-words', dtype: 'none', dims, pooling: 'mean' },
    embed(texts) {
      return Promise.resolve(
        texts.map((text) => {
          const vector = new Float32Array(dims);
          for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
            const digest = createHash('sha256').update(word).digest();
            for (let k = 0; k < 3; k++) {
              const slot = digest.readUInt16LE(k * 2) % dims;
              vector[slot] = (vector[slot] ?? 0) + ((digest[6 + k] ?? 0) & 1 ? 1 : -1);
            }
          }
          return normalise(vector);
        }),
      );
    },
  };
}
