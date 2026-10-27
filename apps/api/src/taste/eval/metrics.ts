/**
 * Ranking metrics for the offline evaluation (ADR 0008 §3). Recall@k asks how many of
 * the held-out records the list found; nDCG@k also rewards finding them near the top.
 * Diversity and coverage keep the first two honest: a list of near-duplicates, or the
 * same few records for everyone, would score well on recall alone.
 */
import { dot } from '../vectors.js';

export function recallAt(
  ranked: readonly number[],
  relevant: ReadonlySet<number>,
  k: number,
): number {
  if (relevant.size === 0) return 0;
  return ranked.slice(0, k).filter((id) => relevant.has(id)).length / relevant.size;
}

export function ndcgAt(
  ranked: readonly number[],
  relevant: ReadonlySet<number>,
  k: number,
): number {
  const gain = ranked
    .slice(0, k)
    .reduce((sum, id, i) => sum + (relevant.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = Array.from(
    { length: Math.min(k, relevant.size) },
    (_, i) => 1 / Math.log2(i + 2),
  ).reduce((a, b) => a + b, 0);
  return ideal === 0 ? 0 : gain / ideal;
}

/** 1 minus the mean pairwise similarity of a list: higher is more varied. */
export function diversity(vectors: readonly Float32Array[]): number {
  if (vectors.length < 2) return 1;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      sum += dot(vectors[i] ?? [], vectors[j] ?? []);
      pairs++;
    }
  }
  return 1 - sum / pairs;
}

export const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
