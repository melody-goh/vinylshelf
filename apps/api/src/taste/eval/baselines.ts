/**
 * What the taste engine must beat to ship (ADR 0008 §3). If it cannot outdo these, its
 * extra machinery is not earning its keep.
 *
 * - popularity: the most-pressed records the user does not own, the same for everyone;
 * - style overlap: records ranked by how many of their styles appear on the shelf,
 *   weighted by how often, which is what a simple genre filter does.
 */
import type { CatalogueRow } from '../../catalogue/model.js';

export function popularity(
  catalogue: readonly CatalogueRow[],
  owned: ReadonlySet<number>,
  k: number,
): number[] {
  return [...catalogue]
    .filter((m) => !owned.has(m.id))
    .sort((a, b) => b.versions - a.versions || a.id - b.id)
    .slice(0, k)
    .map((m) => m.id);
}

export function styleOverlap(
  catalogue: readonly CatalogueRow[],
  shelf: readonly CatalogueRow[],
  owned: ReadonlySet<number>,
  k: number,
): number[] {
  const weight = new Map<string, number>();
  for (const record of shelf)
    for (const s of record.styles) weight.set(s, (weight.get(s) ?? 0) + 1);
  return [...catalogue]
    .filter((m) => !owned.has(m.id))
    .map((m) => ({
      id: m.id,
      score: m.styles.reduce((sum, s) => sum + (weight.get(s) ?? 0), 0) / m.styles.length,
    }))
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, k)
    .map((m) => m.id);
}
