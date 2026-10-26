/**
 * The offline evaluation protocol (ADR 0008 §3): for each test shelf, hide a quarter of
 * it, ask each method for its top k from everything else, and see how much of the
 * hidden part it finds. The taste engine is asked through `recommend`, the same function
 * the API calls; only retrieval differs (an exact scan here, pgvector there).
 */
import type { CatalogueRow } from '../../catalogue/model.js';
import { recommend, type Retrieve } from '../engine.js';
import type { Distance, Weights } from '../rank.js';
import { dot } from '../vectors.js';
import { popularity, styleOverlap } from './baselines.js';
import { diversity, mean, ndcgAt, recallAt } from './metrics.js';
import type { EvalShelf } from './synthetic.js';

export interface MethodScores {
  recall: number;
  ndcg: number;
  diversity: number;
  /** Share of the catalogue that appears in at least one shelf's list. */
  coverage: number;
}

export interface EvalReport {
  k: number;
  shelves: number;
  engine: MethodScores;
  popularity: MethodScores;
  styleOverlap: MethodScores;
}

/** Exact nearest neighbours: what pgvector's HNSW index approximates. */
export function scanRetrieve(catalogue: readonly CatalogueRow[]): Retrieve {
  return (vector, limit, exclude) =>
    Promise.resolve(
      catalogue
        .filter((m) => !exclude.has(m.id))
        .map((m) => ({ m, s: dot(m.embedding, vector) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map(({ m }) => m),
    );
}

/** Rooms' picks as one list: each room's best, then each room's second, and so on. */
export function interleave(
  rooms: readonly { picks: readonly { master: CatalogueRow }[] }[],
): CatalogueRow[] {
  const out: CatalogueRow[] = [];
  const longest = Math.max(0, ...rooms.map((r) => r.picks.length));
  for (let i = 0; i < longest; i++) {
    for (const room of rooms) {
      const pick = room.picks[i];
      if (pick) out.push(pick.master);
    }
  }
  return out;
}

export async function evaluate(
  catalogue: readonly CatalogueRow[],
  shelves: readonly EvalShelf[],
  options: { k: number; distance?: Distance; weights?: Weights },
): Promise<EvalReport> {
  const { k } = options;
  const byId = new Map(catalogue.map((m) => [m.id, m]));
  const retrieve = scanRetrieve(catalogue);
  const runs = {
    engine: [] as number[][],
    popularity: [] as number[][],
    styleOverlap: [] as number[][],
  };

  for (const { shelf } of shelves) {
    const owned = new Set(shelf.map((m) => m.id));
    const rooms = await recommend({
      shelf,
      liked: [],
      disliked: [],
      ownedMasters: owned,
      ownedArtists: new Set(shelf.flatMap((m) => m.artists.map((a) => a.toLowerCase()))),
      distance: options.distance ?? 'near',
      picksPerRoom: k,
      retrieve,
      ...(options.weights ? { weights: options.weights } : {}),
    });
    runs.engine.push(
      interleave(rooms)
        .slice(0, k)
        .map((m) => m.id),
    );
    runs.popularity.push(popularity(catalogue, owned, k));
    runs.styleOverlap.push(styleOverlap(catalogue, shelf, owned, k));
  }

  const score = (lists: number[][]): MethodScores => ({
    recall: mean(
      lists.map((list, i) => recallAt(list, new Set(shelves[i]?.heldOut.map((m) => m.id)), k)),
    ),
    ndcg: mean(
      lists.map((list, i) => ndcgAt(list, new Set(shelves[i]?.heldOut.map((m) => m.id)), k)),
    ),
    diversity: mean(
      lists.map((list) => diversity(list.flatMap((id) => byId.get(id)?.embedding ?? []))),
    ),
    coverage: new Set(lists.flat()).size / catalogue.length,
  });

  return {
    k,
    shelves: shelves.length,
    engine: score(runs.engine),
    popularity: score(runs.popularity),
    styleOverlap: score(runs.styleOverlap),
  };
}

/** The report as a small table, for test output and the CI summary. */
export function formatReport(report: EvalReport): string {
  const row = (name: string, s: MethodScores) =>
    `| ${name} | ${s.recall.toFixed(3)} | ${s.ndcg.toFixed(3)} | ${s.diversity.toFixed(3)} | ${s.coverage.toFixed(3)} |`;
  return [
    `Offline evaluation: ${String(report.shelves)} shelves, k = ${String(report.k)}`,
    '',
    `| Method | Recall@${String(report.k)} | nDCG@${String(report.k)} | Diversity | Coverage |`,
    '|---|---|---|---|---|',
    row('Taste engine', report.engine),
    row('Style overlap', report.styleOverlap),
    row('Popularity', report.popularity),
  ].join('\n');
}
