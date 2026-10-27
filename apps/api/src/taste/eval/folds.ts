/**
 * Turns one real shelf into evaluation cases (ADR 0008 §3): the shelf is shuffled and
 * cut into folds, and each fold in turn is held out while the engine recommends from
 * the rest. A good engine finds the held-out records; every record is held out once.
 * This is how the engine is checked against a real collector's taste without that
 * collection ever leaving the machine or entering the repository.
 */
import type { CatalogueRow } from '../../catalogue/model.js';
import { seeded, type EvalShelf } from './synthetic.js';

export function holdOutFolds(
  shelf: readonly CatalogueRow[],
  folds: number,
  seed: number,
): EvalShelf[] {
  if (folds < 2) throw new Error('Holding out needs at least two folds');
  const random = seeded(seed);
  const order = [...shelf];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j] as CatalogueRow, order[i] as CatalogueRow];
  }
  return Array.from({ length: folds }, (_, f) => ({
    heldOut: order.filter((_, i) => i % folds === f),
    shelf: order.filter((_, i) => i % folds !== f),
  })).filter((fold) => fold.heldOut.length > 0);
}
