/**
 * A collection has sides: the jazz side, the ambient side. One average of the whole
 * shelf points somewhere between them, at records the user would not pick. So the taste
 * profile is a few rooms (ADR 0008, Notes 2026-10-26): clusters of the shelf's records
 * in embedding space, each recommended for on its own.
 *
 * Clustering is spherical k-means (cosine, unit vectors), seeded deterministically, so
 * the same shelf always gives the same rooms and recommendations do not reshuffle on
 * every visit.
 */
import type { CatalogueRow } from '../catalogue/model.js';
import { dot, normalise } from './vectors.js';

export interface Room {
  /** Stable for the same shelf: derived from the room's most central record. */
  id: string;
  /** Unit-length mean of the members' vectors. */
  centroid: Float32Array;
  members: CatalogueRow[];
  /** The members' commonest styles, most common first: what the room is called. */
  styles: string[];
}

/** No more rooms than this: past five, rooms stop being sides and become noise. */
export const MAX_ROOMS = 5;
/** A room smaller than this is folded into its nearest neighbour. */
export const MIN_ROOM = 4;
const ITERATIONS = 25;

/**
 * About one room per eight-ish records' worth of spread: a 40-record shelf has two
 * sides, a 220-record shelf five. Fewer than eight records make one room.
 */
export function roomCount(records: number): number {
  if (records < 8) return 1;
  return Math.max(1, Math.min(MAX_ROOMS, Math.round(Math.sqrt(records / 8))));
}

function mean(rows: readonly CatalogueRow[], dims: number): Float32Array {
  const sum = new Float32Array(dims);
  for (const row of rows)
    for (let i = 0; i < dims; i++) sum[i] = (sum[i] ?? 0) + (row.embedding[i] ?? 0);
  return normalise(sum);
}

/** Commonest values across rows, most common first, ties alphabetical. */
export function commonest(values: readonly string[][], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const list of values) for (const v of new Set(list)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([v]) => v);
}

/** A style names a room only if this share of its records has it. */
export const NAMING_SHARE = 0.3;

/**
 * What a room is called: up to three styles that a fair share of its records have, so
 * one odd record cannot name a small room. The commonest style always counts, so every
 * room has a name.
 */
export function roomStyles(members: readonly CatalogueRow[]): string[] {
  const [first, ...rest] = commonest(
    members.map((m) => m.styles),
    3,
  );
  if (first === undefined) return [];
  const share = (style: string) =>
    members.filter((m) => m.styles.includes(style)).length / members.length;
  return [first, ...rest.filter((style) => share(style) >= NAMING_SHARE)];
}

/**
 * Seeds by farthest points: start from the record closest to the shelf's centre, then
 * repeatedly take the record least like any seed so far. Deterministic, and it puts a
 * seed on each side of a varied shelf.
 */
function seeds(rows: readonly CatalogueRow[], k: number, dims: number): Float32Array[] {
  const centre = mean(rows, dims);
  let first = 0;
  rows.forEach((row, i) => {
    if (dot(row.embedding, centre) > dot(rows[first]?.embedding ?? centre, centre)) first = i;
  });
  const chosen = [rows[first]?.embedding ?? centre];
  while (chosen.length < k) {
    let best = -1;
    let bestDistance = -Infinity;
    rows.forEach((row, i) => {
      const nearest = Math.max(...chosen.map((c) => dot(row.embedding, c)));
      if (1 - nearest > bestDistance) {
        bestDistance = 1 - nearest;
        best = i;
      }
    });
    const next = rows[best];
    if (!next) break;
    chosen.push(next.embedding);
  }
  return chosen.map((c) => Float32Array.from(c));
}

function assign(rows: readonly CatalogueRow[], centroids: readonly Float32Array[]): number[] {
  return rows.map((row) => {
    let best = 0;
    centroids.forEach((c, i) => {
      if (dot(row.embedding, c) > dot(row.embedding, centroids[best] ?? c)) best = i;
    });
    return best;
  });
}

export function buildRooms(shelf: readonly CatalogueRow[]): Room[] {
  if (shelf.length === 0) return [];
  // A canonical order, so ties in seeding and assignment (records with equal vectors)
  // break the same way however the shelf arrived: the same shelf, the same rooms.
  const rows = [...shelf].sort((a, b) => a.id - b.id);
  const dims = rows[0]?.embedding.length ?? 0;
  let centroids = seeds(rows, Math.min(roomCount(rows.length), rows.length), dims);

  let labels = assign(rows, centroids);
  for (let round = 0; round < ITERATIONS; round++) {
    centroids = centroids.map((c, i) => {
      const members = rows.filter((_, r) => labels[r] === i);
      return members.length > 0 ? mean(members, dims) : c;
    });
    const next = assign(rows, centroids);
    if (next.every((label, r) => label === labels[r])) break;
    labels = next;
  }

  // Fold rooms too small to be a side into their nearest room, then recompute.
  let groups = centroids.map((_, i) => rows.filter((__, r) => labels[r] === i));
  while (groups.length > 1) {
    const smallest = groups.reduce(
      (min, g, i) => ((groups[min]?.length ?? 0) > g.length ? i : min),
      0,
    );
    const small = groups[smallest] ?? [];
    if (small.length >= MIN_ROOM) break;
    const rest = groups.filter((_, i) => i !== smallest);
    const restCentroids = rest.map((g) => mean(g, dims));
    for (const row of small) {
      const target = assign([row], restCentroids)[0] ?? 0;
      rest[target]?.push(row);
    }
    groups = rest;
  }

  return groups
    .filter((members) => members.length > 0)
    .map((members) => {
      const centroid = mean(members, dims);
      const central = members.reduce((best, row) =>
        dot(row.embedding, centroid) > dot(best.embedding, centroid) ? row : best,
      );
      return {
        id: `room-${String(central.id)}`,
        centroid,
        members,
        styles: roomStyles(members),
      };
    })
    .sort((a, b) => b.members.length - a.members.length);
}
