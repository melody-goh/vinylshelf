/**
 * The taste engine (ADR 0008): rooms from the shelf, candidates for each room, ranked
 * picks with reasons. It holds no state and does no I/O; candidate retrieval is passed
 * in, as pgvector queries in the app and a brute-force scan in the offline evaluation,
 * so the evaluation measures exactly the ranking that ships.
 */
import type { CatalogueRow, RecordKind } from '../catalogue/model.js';
import { rankRoom, type Distance, type Pick, type Weights } from './rank.js';
import { buildRooms, type Room } from './rooms.js';

/** Nearest catalogue masters of the given kinds to a vector, excluding some ids, closest first. */
export type Retrieve = (
  vector: Float32Array,
  limit: number,
  exclude: ReadonlySet<number>,
  kinds: ReadonlySet<RecordKind>,
) => Promise<CatalogueRow[]>;

export interface TasteInput {
  /** Shelf records found in the catalogue. */
  shelf: readonly CatalogueRow[];
  /** "More like this": they join the rooms as if owned, so they pull picks their way. */
  liked: readonly CatalogueRow[];
  /** "Not for me": never picked, and near-duplicates are held back. */
  disliked: readonly CatalogueRow[];
  /** Every master on the shelf, matched or not, so nothing owned is suggested. */
  ownedMasters: ReadonlySet<number>;
  ownedArtists: ReadonlySet<string>;
  distance: Distance;
  picksPerRoom: number;
  retrieve: Retrieve;
  /** For tuning experiments only. */
  weights?: Weights;
}

export interface RoomPicks {
  room: Room;
  picks: Pick[];
}

/** A shape of record makes up at least this share of a room before it is recommended. */
export const KIND_SHARE = 0.2;

/**
 * The shapes of record a room is recommended: albums always, and singles, EPs or
 * compilations only where they are a real part of it. A shelf of LPs is not sent
 * 7-inch singles of its favourite songs; a disco side full of 12-inches is.
 */
export function kindsFor(room: Room): Set<RecordKind> {
  const kinds = new Set<RecordKind>(['album']);
  const counts = new Map<RecordKind, number>();
  for (const member of room.members) counts.set(member.kind, (counts.get(member.kind) ?? 0) + 1);
  for (const [kind, count] of counts) {
    if (count / room.members.length >= KIND_SHARE) kinds.add(kind);
  }
  return kinds;
}

/** Candidates fetched per room, per distance. "Far" skips the closest ones it fetches. */
const CANDIDATES = { near: 150, far: 400 } as const;
const FAR_SKIP = 60;

export async function recommend(input: TasteInput): Promise<RoomPicks[]> {
  const rooms = buildRooms([...input.shelf, ...input.liked]);
  const exclude = new Set([
    ...input.ownedMasters,
    ...input.liked.map((m) => m.id),
    ...input.disliked.map((m) => m.id),
  ]);
  const taken = new Set<number>();
  const results: RoomPicks[] = [];
  for (const room of rooms) {
    const found = await input.retrieve(
      room.centroid,
      CANDIDATES[input.distance],
      exclude,
      kindsFor(room),
    );
    const candidates = input.distance === 'far' ? found.slice(FAR_SKIP) : found;
    const picks = rankRoom(room, candidates, {
      distance: input.distance,
      limit: input.picksPerRoom,
      ownedArtists: input.ownedArtists,
      disliked: input.disliked,
      taken,
      ...(input.weights ? { weights: input.weights } : {}),
    });
    for (const pick of picks) taken.add(pick.master.id);
    results.push({ room, picks });
  }
  return results;
}
