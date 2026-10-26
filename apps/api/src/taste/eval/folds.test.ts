import { describe, expect, it } from 'vitest';
import { row } from '../testing.js';
import { holdOutFolds } from './folds.js';

const shelf = Array.from({ length: 10 }, (_, i) => row([1, i], { id: i + 1 }));

describe('holdOutFolds', () => {
  it('holds out every record exactly once, never also on the shelf', () => {
    const folds = holdOutFolds(shelf, 4, 1);

    expect(folds).toHaveLength(4);
    const heldOut = folds.flatMap((f) => f.heldOut.map((r) => r.id));
    expect(heldOut.sort((a, b) => a - b)).toEqual(shelf.map((r) => r.id));
    for (const fold of folds) {
      const kept = new Set(fold.shelf.map((r) => r.id));
      expect(fold.heldOut.some((r) => kept.has(r.id))).toBe(false);
      expect(fold.shelf.length + fold.heldOut.length).toBe(10);
    }
  });

  it('is the same for the same seed', () => {
    const ids = (seed: number) =>
      holdOutFolds(shelf, 3, seed).map((f) => f.heldOut.map((r) => r.id));
    expect(ids(5)).toEqual(ids(5));
    expect(ids(5)).not.toEqual(ids(6));
  });

  it('drops empty folds on a shelf smaller than the fold count', () => {
    expect(holdOutFolds(shelf.slice(0, 2), 5, 1)).toHaveLength(2);
  });
});
