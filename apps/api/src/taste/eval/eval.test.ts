/**
 * The offline evaluation as a test (ADR 0008 §3): a quality regression fails the build
 * like a broken test. Two seeded synthetic worlds, so a tweak that only suits one
 * catalogue does not pass. The results table is printed, and written to the CI job
 * summary when there is one, so each commit's numbers are on record.
 */
import { appendFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { createFakeEmbedder } from '../embedder.js';
import { evaluate, formatReport, type EvalReport } from './harness.js';
import { syntheticShelves, syntheticWorld } from './synthetic.js';

const K = 20;
const WORLDS = [1, 7];
/**
 * Near must beat the stronger baseline by this much, on recall and on nDCG. It beats it
 * by about 3.4 times today (ADR 0008, Notes 2026-10-27), so this fails on a real
 * regression, not on noise.
 */
const MARGIN = 2;
/** Far trades recall for range, but must still find some of a held-out shelf. */
const FAR_MIN_RECALL = 0.05;

const reports: { near: EvalReport; far: EvalReport }[] = [];

beforeAll(async () => {
  const embedder = createFakeEmbedder(384);
  for (const seed of WORLDS) {
    const world = await syntheticWorld(
      { seed, scenes: 12, circlesPerScene: 3, perCircle: 22, noise: 250 },
      embedder,
    );
    const shelves = syntheticShelves(world, 40, seed + 1);
    reports.push({
      near: await evaluate(world.catalogue, shelves, { k: K, distance: 'near' }),
      far: await evaluate(world.catalogue, shelves, { k: K, distance: 'far' }),
    });
  }
  const table = reports
    .map(
      (r, i) =>
        `World ${String(WORLDS[i])}, near\n\n${formatReport(r.near)}\n\nWorld ${String(WORLDS[i])}, far\n\n${formatReport(r.far)}`,
    )
    .join('\n\n');
  console.log(table);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) await appendFile(summary, `## Taste engine evaluation\n\n${table}\n`);
}, 60_000);

const avg = (pick: (r: { near: EvalReport; far: EvalReport }) => number) =>
  reports.reduce((sum, r) => sum + pick(r), 0) / reports.length;

describe('taste engine, offline evaluation', () => {
  it('finds more of a held-out shelf than either baseline, by a margin', () => {
    const recall = avg((r) => r.near.engine.recall);
    const ndcg = avg((r) => r.near.engine.ndcg);
    const bestRecall = Math.max(
      avg((r) => r.near.styleOverlap.recall),
      avg((r) => r.near.popularity.recall),
    );
    const bestNdcg = Math.max(
      avg((r) => r.near.styleOverlap.ndcg),
      avg((r) => r.near.popularity.ndcg),
    );
    expect(recall).toBeGreaterThan(bestRecall * MARGIN);
    expect(ndcg).toBeGreaterThan(bestNdcg * MARGIN);
  });

  it('reaches further when asked: more varied and wider-ranging, still on taste', () => {
    expect(avg((r) => r.far.engine.diversity)).toBeGreaterThan(avg((r) => r.near.engine.diversity));
    expect(avg((r) => r.far.engine.coverage)).toBeGreaterThan(avg((r) => r.near.engine.coverage));
    expect(avg((r) => r.far.engine.recall)).toBeGreaterThan(FAR_MIN_RECALL);
  });

  it('does not recommend the same few records to everyone', () => {
    expect(avg((r) => r.near.engine.coverage)).toBeGreaterThan(0.3);
  });
});
