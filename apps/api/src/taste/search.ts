/**
 * Searching the catalogue by description (ADR 0008 §2: semantic search is the core, and
 * it needs no language model). Hybrid, as the ADR calls for:
 *
 * - by meaning: the description is embedded with the catalogue's own model and the
 *   nearest records are found;
 * - by name: records whose style or genre names contain the description's words.
 *
 * Meaning alone was measured to be misled by words that match a record's title or
 * artist ("chicago house music" found the Art Ensemble of Chicago), since the catalogue
 * describes records with those too; style and genre names are what a description of a
 * sound is about. Both sets are scored on meaning plus the share of words their style
 * and genre names hold, then leaned towards the shelf's sides and diversified. Pure,
 * like the engine: both retrievals are passed in.
 */
import type { CatalogueRow, RecordKind } from '../catalogue/model.js';
import type { Retrieve } from './engine.js';
import { reasonFor, soundOf, type Reason } from './reasons.js';
import { buildRooms, type Room } from './rooms.js';
import { dot } from './vectors.js';

/** Records searched are albums and EPs: what a description of a sound means. */
export const SEARCH_KINDS: ReadonlySet<RecordKind> = new Set(['album', 'ep']);
/** Nearest records fetched before re-ranking. */
const CANDIDATES = 200;
/**
 * How much nearness to the shelf's sides counts against nearness to the description.
 * Small on purpose: the description leads, taste only orders close matches.
 */
export const TASTE = 0.15;
/** MMR trade-off for search: mostly relevance, a little range. */
const LAMBDA = 0.85;
/** What a record earns when its style and genre names hold every word of the description. */
export const NAMES = 0.15;

/** Words that say nothing about a sound. */
const FILLER = new Set(
  'the and with for from that this some music records record songs song sound sounds like style era kind sort very really lots big'.split(
    ' ',
  ),
);

/** The words of a description worth matching against style and genre names. */
export function searchWords(description: string): string[] {
  const words = description.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((w) => w.length > 2 && !FILLER.has(w)).map(stem))];
}

/**
 * A word as a style name would spell it: "dreamy" is Dream Pop, "funky" is Funk. Only
 * the commonest ending is taken off, and only from longer words.
 */
export function stem(word: string): string {
  return word.length > 4 && /[ys]$/.test(word) ? word.slice(0, -1) : word;
}

/** Share of the words that appear in a record's style and genre names. */
export function nameMatch(row: CatalogueRow, words: readonly string[]): number {
  if (words.length === 0) return 0;
  const names = [...row.styles, ...row.genres].join(' ').toLowerCase();
  return words.filter((w) => names.includes(stem(w))).length / words.length;
}

/** Records whose style or genre names contain any of the words, most pressed first. */
export type MatchNames = (
  words: readonly string[],
  limit: number,
  exclude: ReadonlySet<number>,
  kinds: ReadonlySet<RecordKind>,
) => Promise<CatalogueRow[]>;

export interface SearchInput {
  /** The description's embedding (with the model's query instruction). */
  query: Float32Array;
  /** The description itself, for matching style and genre names. */
  description: string;
  shelf: readonly CatalogueRow[];
  /** Never returned: owned or rejected records. */
  exclude: ReadonlySet<number>;
  retrieve: Retrieve;
  matchNames: MatchNames;
  limit: number;
  /** For evaluation only: the weight of name matches (production uses NAMES). */
  namesWeight?: number;
}

export interface SearchHit {
  master: CatalogueRow;
  score: number;
  reason: Reason;
}

/** The room a record is closest to, for its reason; null without a shelf to compare. */
function nearestRoom(rooms: readonly Room[], row: CatalogueRow): Room | null {
  let best: Room | null = null;
  let bestSimilarity = -Infinity;
  for (const room of rooms) {
    const similarity = dot(row.embedding, room.centroid);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      best = room;
    }
  }
  return best;
}

export async function searchCatalogue(input: SearchInput): Promise<SearchHit[]> {
  const rooms = input.shelf.length > 0 ? buildRooms(input.shelf) : [];
  const words = searchWords(input.description);
  const [byMeaning, byName] = await Promise.all([
    input.retrieve(input.query, CANDIDATES, input.exclude, SEARCH_KINDS),
    words.length > 0
      ? input.matchNames(words, CANDIDATES, input.exclude, SEARCH_KINDS)
      : Promise.resolve([]),
  ]);
  const found = [...new Map([...byMeaning, ...byName].map((row) => [row.id, row])).values()];
  const scored = found.map((master) => {
    const room = nearestRoom(rooms, master);
    const taste = room ? dot(master.embedding, room.centroid) : 0;
    return {
      master,
      room,
      score:
        dot(master.embedding, input.query) +
        (input.namesWeight ?? NAMES) * nameMatch(master, words) +
        TASTE * taste,
    };
  });

  // Maximal marginal relevance, one record per artist.
  const hits: SearchHit[] = [];
  const artists = new Set<string>();
  const pool = [...scored].sort((a, b) => b.score - a.score || a.master.id - b.master.id);
  while (hits.length < input.limit && pool.length > 0) {
    let bestIndex = -1;
    let bestValue = -Infinity;
    pool.forEach((entry, i) => {
      if (entry.master.artists.some((a) => artists.has(a.toLowerCase()))) return;
      const redundancy = Math.max(
        0,
        ...hits.map((h) => dot(entry.master.embedding, h.master.embedding)),
      );
      const value = LAMBDA * entry.score - (1 - LAMBDA) * redundancy;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    });
    if (bestIndex === -1) break;
    const [entry] = pool.splice(bestIndex, 1);
    if (!entry) break;
    for (const a of entry.master.artists) artists.add(a.toLowerCase());
    hits.push({
      master: entry.master,
      score: entry.score,
      reason: entry.room
        ? reasonFor(entry.master, entry.room)
        : { sound: soundOf(entry.master), fansOf: [], link: null },
    });
  }
  return hits;
}
