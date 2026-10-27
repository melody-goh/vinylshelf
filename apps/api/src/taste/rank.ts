/**
 * Ranks one room's candidates (ADR 0008 §2). A pick has to earn its place on three
 * counts: it sounds like the room, it is close to a particular record the user owns, and,
 * best of all, it was made by people who made records on the shelf. A little popularity
 * breaks ties towards records people keep reissuing.
 *
 * Then diversity: picks are chosen one at a time by maximal marginal relevance, so the
 * list is not ten copies of the same record, and an artist appears at most once.
 *
 * "Near" stays close to home; "far" reaches further: it trusts the room's centre less,
 * leans on shared people more, ignores popularity, diversifies harder and only suggests
 * artists the user does not own yet.
 */
import { telling } from '../catalogue/describe.js';
import type { CatalogueRow } from '../catalogue/model.js';
import { reasonFor, type Reason } from './reasons.js';
import type { Room } from './rooms.js';
import { dot } from './vectors.js';

export type Distance = 'near' | 'far';

export interface Pick {
  master: CatalogueRow;
  score: number;
  reason: Reason;
}

export interface Weights {
  centroid: number;
  nearest: number;
  people: number;
  popularity: number;
  /** MMR trade-off: 1 is pure relevance, 0 pure novelty. */
  lambda: number;
}

/**
 * Chosen by the offline evaluation (taste/eval; sweep recorded in ADR 0008, Notes
 * 2026-10-26), which gates changes to them. "Near" weighs shared people heavily because
 * that measurably finds more of a held-out shelf; popularity is off because the synthetic
 * catalogue cannot judge it fairly (its popular records are noise by construction), to be
 * revisited against real shelves.
 */
export const WEIGHTS: Record<Distance, Weights> = {
  near: { centroid: 0.4, nearest: 0.3, people: 0.3, popularity: 0, lambda: 0.85 },
  far: { centroid: 0.25, nearest: 0.3, people: 0.45, popularity: 0, lambda: 0.55 },
};

/** Versions at which popularity counts in full; more pressings than this add nothing. */
const POPULAR = 200;

export interface RankContext {
  distance: Distance;
  limit: number;
  /** Artists on the shelf, lower-cased; "far" only suggests artists outside it. */
  ownedArtists: ReadonlySet<string>;
  /** Records the user said were not for them; candidates very like them are pushed down. */
  disliked: readonly CatalogueRow[];
  /** Masters already picked for another room, so no record appears twice. */
  taken: ReadonlySet<number>;
  /** Overrides for tuning experiments; production always uses WEIGHTS. */
  weights?: Weights;
}

function peopleOverlap(candidate: CatalogueRow, room: Room): number {
  const names = new Set(telling(candidate.credits).map((c) => c.name));
  if (names.size === 0) return 0;
  let shared = 0;
  for (const member of room.members) {
    if (telling(member.credits).some((c) => names.has(c.name))) shared++;
  }
  // Three shelf records sharing someone is as convincing as it gets.
  return Math.min(shared, 3) / 3;
}

export function rankRoom(
  room: Room,
  candidates: readonly CatalogueRow[],
  context: RankContext,
): Pick[] {
  const weights = context.weights ?? WEIGHTS[context.distance];
  const scored = candidates
    .filter((c) => !context.taken.has(c.id))
    .filter(
      (c) =>
        context.distance === 'near' ||
        !c.artists.some((a) => context.ownedArtists.has(a.toLowerCase())),
    )
    .map((candidate) => {
      let nearest = room.members[0] ?? candidate;
      let nearestSimilarity = -1;
      for (const member of room.members) {
        const similarity = dot(candidate.embedding, member.embedding);
        if (similarity > nearestSimilarity) {
          nearestSimilarity = similarity;
          nearest = member;
        }
      }
      const disliked = Math.max(
        0,
        ...context.disliked.map((d) => dot(candidate.embedding, d.embedding)),
      );
      const score =
        weights.centroid * dot(candidate.embedding, room.centroid) +
        weights.nearest * nearestSimilarity +
        weights.people * peopleOverlap(candidate, room) +
        weights.popularity * Math.min(1, Math.log1p(candidate.versions) / Math.log1p(POPULAR)) -
        // Only near-duplicates of something rejected are held back, not its whole style.
        (disliked > 0.9 ? 0.3 : 0);
      return { candidate, nearest, score };
    });

  const picks: Pick[] = [];
  const artists = new Set<string>();
  const pool = [...scored].sort((a, b) => b.score - a.score || a.candidate.id - b.candidate.id);
  while (picks.length < context.limit && pool.length > 0) {
    let bestIndex = -1;
    let bestValue = -Infinity;
    pool.forEach((entry, i) => {
      if (entry.candidate.artists.some((a) => artists.has(a.toLowerCase()))) return;
      const redundancy = Math.max(
        0,
        ...picks.map((p) => dot(entry.candidate.embedding, p.master.embedding)),
      );
      const value = weights.lambda * entry.score - (1 - weights.lambda) * redundancy;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    });
    if (bestIndex === -1) break;
    const [entry] = pool.splice(bestIndex, 1);
    if (!entry) break;
    for (const a of entry.candidate.artists) artists.add(a.toLowerCase());
    picks.push({
      master: entry.candidate,
      score: entry.score,
      reason: reasonFor(entry.candidate, room, entry.nearest),
    });
  }
  return picks;
}
