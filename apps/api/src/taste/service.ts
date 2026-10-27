/**
 * Recommendations and steering for one user (ADR 0008). It gathers what the engine
 * needs from the database (the shelf's catalogue rows, the user's verdicts, the artists
 * they own), runs the engine with pgvector retrieval, and shapes the answer for the API.
 * Nothing about the shelf leaves our database.
 */
import type {
  CatalogueMaster as CatalogueMasterView,
  TasteRecommendations,
} from '@vinylshelf/contract';
import { and, eq } from 'drizzle-orm';
import { loadedCatalogue } from '../catalogue/load.js';
import type { CatalogueRow } from '../catalogue/model.js';
import type { DatabaseHandle } from '../db/client.js';
import { collectionItems, tasteFeedback, type TasteVerdict } from '../db/schema.js';
import type { DiscogsReleaseCache } from '../discogs/cache.js';
import { ProblemError } from '../http/problem.js';
import type { Clock } from '../lib/clock.js';
import { catalogueRows, pgvectorRetrieve } from './catalogue-store.js';
import { recommend, type Retrieve } from './engine.js';
import type { Distance } from './rank.js';

/** Fewer shelf records than this in the catalogue, and rooms would be guesses. */
export const MIN_SHELF = 3;
/** Picks per room: enough to browse, few enough that each one is considered. */
export const PICKS_PER_ROOM = 8;

const masterUrl = (id: number) => `https://www.discogs.com/master/${String(id)}`;

function toView(row: CatalogueRow): CatalogueMasterView {
  return {
    masterId: row.id,
    mainReleaseId: row.mainReleaseId,
    title: row.title,
    artists: row.artists,
    year: row.year,
    genres: row.genres,
    styles: row.styles,
    labels: row.labels,
    discogsUrl: masterUrl(row.id),
  };
}

export class TasteService {
  private readonly retrieve: Retrieve;

  constructor(
    private readonly database: DatabaseHandle,
    private readonly cache: DiscogsReleaseCache,
    private readonly clock: Clock,
  ) {
    this.retrieve = pgvectorRetrieve(database);
  }

  async recommendations(userId: string, distance: Distance): Promise<TasteRecommendations> {
    const { db } = this.database;
    const manifest = await loadedCatalogue(this.database);
    const catalogue = manifest ? { dump: manifest.dump, rows: manifest.rows } : null;

    const shelfItems = await db
      .select({ releaseId: collectionItems.releaseId, masterId: collectionItems.masterId })
      .from(collectionItems)
      .where(eq(collectionItems.userId, userId));
    const ownedMasters = new Set(shelfItems.flatMap((i) => (i.masterId ? [i.masterId] : [])));
    const shelf = manifest ? await catalogueRows(this.database, [...ownedMasters]) : [];
    const basedOn = { shelfRecords: shelfItems.length, inCatalogue: shelf.length };

    if (!catalogue) return { status: 'no_catalogue', catalogue, basedOn, rooms: [] };
    if (shelf.length < MIN_SHELF) {
      return { status: 'too_few_records', catalogue, basedOn, rooms: [] };
    }

    const verdicts = await db
      .select({ masterId: tasteFeedback.masterId, verdict: tasteFeedback.verdict })
      .from(tasteFeedback)
      .where(eq(tasteFeedback.userId, userId));
    const steered = new Map(
      (
        await catalogueRows(
          this.database,
          verdicts.map((v) => v.masterId),
        )
      ).map((row) => [row.id, row]),
    );
    const withVerdict = (verdict: TasteVerdict) =>
      verdicts.flatMap((v) => {
        const row = v.verdict === verdict ? steered.get(v.masterId) : undefined;
        return row ? [row] : [];
      });

    const results = await recommend({
      shelf,
      liked: withVerdict('more'),
      disliked: withVerdict('less'),
      ownedMasters,
      ownedArtists: await this.ownedArtists(shelf, shelfItems),
      distance,
      picksPerRoom: PICKS_PER_ROOM,
      retrieve: this.retrieve,
    });

    return {
      status: 'ready',
      catalogue,
      basedOn,
      rooms: results
        .filter((r) => r.picks.length > 0)
        .map(({ room, picks }) => ({
          id: room.id,
          styles: room.styles,
          size: room.members.length,
          picks: picks.map((pick) => ({ master: toView(pick.master), reason: pick.reason })),
        })),
    };
  }

  /** Records "more like this" or "not for me"; a new verdict replaces an old one. */
  async giveFeedback(userId: string, masterId: number, verdict: TasteVerdict): Promise<void> {
    const [known] = await catalogueRows(this.database, [masterId]);
    if (!known) {
      throw new ProblemError(404, 'master_not_found', 'Not in the taste catalogue');
    }
    const createdAt = new Date(this.clock.now());
    await this.database.db
      .insert(tasteFeedback)
      .values({ userId, masterId, verdict, createdAt })
      .onConflictDoUpdate({
        target: [tasteFeedback.userId, tasteFeedback.masterId],
        set: { verdict, createdAt },
      });
  }

  async withdrawFeedback(userId: string, masterId: number): Promise<void> {
    await this.database.db
      .delete(tasteFeedback)
      .where(and(eq(tasteFeedback.userId, userId), eq(tasteFeedback.masterId, masterId)));
  }

  /**
   * Artists on the shelf, so "far" only suggests new ones. Records the catalogue does
   * not know still count: their artists come from the release cache while it is fresh
   * (ADR 0004), and an expired entry simply counts for nothing until the next refresh.
   */
  private async ownedArtists(
    shelf: readonly CatalogueRow[],
    items: readonly { releaseId: number; masterId: number | null }[],
  ): Promise<Set<string>> {
    const known = new Set(shelf.map((row) => row.id));
    const unknown = items.filter((i) => i.masterId === null || !known.has(i.masterId));
    const cached = await this.cache.getFresh(
      this.database.db,
      unknown.map((i) => i.releaseId),
    );
    return new Set(
      [
        ...shelf.flatMap((row) => row.artists),
        ...[...cached.values()].flatMap((r) => r.artists),
      ].map((a) => a.toLowerCase()),
    );
  }
}
