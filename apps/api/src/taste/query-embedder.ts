/**
 * Embedding search descriptions inside the API (ADR 0008 §2), with the same model the
 * catalogue was built with. The model loads on the first search, not at start-up, so
 * the server starts quickly and only pays its memory (about 170 MB) once search is
 * used. A load that fails is tried again on the next search.
 */
import type { EmbeddingModelInfo } from '../catalogue/model.js';
import { BGE_QUERY_INSTRUCTION, BGE_SMALL, type Embedder } from './embedder.js';

export interface QueryEmbedder {
  /** The model's identity, once loaded; throws if it cannot be loaded. */
  model(): Promise<EmbeddingModelInfo>;
  /** One description's unit vector, ready to compare with catalogue rows. */
  embedQuery(text: string): Promise<Float32Array>;
}

export function lazyQueryEmbedder(load: () => Promise<Embedder>): QueryEmbedder {
  let loading: Promise<Embedder> | null = null;
  const embedder = () => {
    loading ??= load().catch((error: unknown) => {
      loading = null;
      throw error;
    });
    return loading;
  };
  return {
    async model() {
      return (await embedder()).model;
    },
    async embedQuery(text) {
      const loaded = await embedder();
      // BGE models are trained to match a query written with this instruction against
      // passages written without one (the catalogue's descriptions).
      const input = loaded.model.id === BGE_SMALL.id ? `${BGE_QUERY_INSTRUCTION}${text}` : text;
      const [vector] = await loaded.embed([input]);
      if (!vector) throw new Error('The embedder returned nothing');
      return vector;
    },
  };
}
