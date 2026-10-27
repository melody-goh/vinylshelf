/**
 * Ranks one room's candidates (ADR 0008 §2). A pick has to earn its place on three
 * counts: it sounds like the room, it is close to a particular record the user owns, and,
 * best of all, it was made with people (producers, engineers, players) behind records on
 * the shelf. A little popularity can break ties towards records people keep reissuing.
 *
 * Discover is for finding new music (ADR 0008, Notes 2026-10-28), so artists already on
 * the shelf are held back: "near" marks them down and allows one per room; "far" leaves
 * them out. Then diversity: picks are chosen one at a time by maximal marginal relevance,
 * so the list is not ten copies of the same record, and an artist appears at most once.
 *
 * "Near" stays close to home; "far" reaches further: it trusts the room's centre less,
 * leans on shared people more and diversifies harder.
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
  /** Taken off a pick by an artist already on the shelf, so new artists come first. */
  owned: number;
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
  near: { centroid: 0.4, nearest: 0.3, people: 0.3, popularity: 0, owned: 0.12, lambda: 0.85 },
  far: { centroid: 0.25, nearest: 0.3, people: 0.45, popularity: 0, owned: 0, lambda: 0.55 },
};

/** "Near" may still suggest more by an artist on the shelf, but no more than this per room. */
export const OWNED_PER_ROOM = 1;

/** Versions at which popularity counts in full; more pressings than this add nothing. */
const POPULAR = 200;

export interface RankContext {
  distance: Distance;
  limit: number;
  /** Artists on the shelf, lower-cased: "near" holds them back, "far" leaves them out. */
  ownedArtists: ReadonlySet<string>;
  /** Records the user said were not for them; candidates very like them are pushed down. */
  disliked: readonly CatalogueRow[];
  /** Masters already picked for another room, so no record appears twice. */
  taken: ReadonlySet<number>;
  /** Overrides for tuning experiments; production always uses WEIGHTS. */
  weights?: Weights;
}

/**
 * How many shelf records share someone who made this one, other than its own artist:
 * a producer, engineer or player is a lead to new music; the artist is not.
 */
function peopleOverlap(candidate: CatalogueRow, room: Room): number {
  const own = new Set(candidate.artists.map((a) => a.toLowerCase()));
  const names = new Set(
    telling(candidate.credits)
      .map((c) => c.name)
      .filter((name) => !own.has(name.toLowerCase())),
  );
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
      const owned = candidate.artists.some((a) => context.ownedArtists.has(a.toLowerCase()));
      let nearestSimilarity = -1;
      for (const member of room.members) {
        nearestSimilarity = Math.max(nearestSimilarity, dot(candidate.embedding, member.embedding));
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
        (owned ? weights.owned : 0) -
        // Only near-duplicates of something rejected are held back, not its whole style.
        (disliked > 0.9 ? 0.3 : 0);
      return { candidate, owned, score };
    });

  const picks: Pick[] = [];
  const artists = new Set<string>();
  let ownedPicks = 0;
  const pool = [...scored].sort((a, b) => b.score - a.score || a.candidate.id - b.candidate.id);
  while (picks.length < context.limit && pool.length > 0) {
    let bestIndex = -1;
    let bestValue = -Infinity;
    pool.forEach((entry, i) => {
      if (entry.candidate.artists.some((a) => artists.has(a.toLowerCase()))) return;
      if (entry.owned && ownedPicks >= OWNED_PER_ROOM) return;
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
    if (entry.owned) ownedPicks++;
    picks.push({
      master: entry.candidate,
      score: entry.score,
      reason: reasonFor(entry.candidate, room),
    });
  }
  return picks;
}
