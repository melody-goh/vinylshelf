/**
 * Recommendations and steering for one user (ADR 0008). It gathers what the engine
 * needs (the shelf's catalogue rows, the user's verdicts, the artists they own, and the
 * records on their Discogs wantlist), runs the engine with pgvector retrieval, and shapes
 * the answer for the API. Nothing about the shelf leaves our database; the wantlist is
 * read live for each answer and not kept (ADR 0011, note of 2026-10-28).
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
import type { UserRepository } from '../auth/users.js';
import type { DiscogsReleaseCache } from '../discogs/cache.js';
import type { DiscogsGateway } from '../discogs/gateway.js';
import { ProblemError } from '../http/problem.js';
import type { Clock } from '../lib/clock.js';
import { catalogueRows, pgvectorRetrieve } from './catalogue-store.js';
import { recommend, type Retrieve } from './engine.js';
import type { Distance } from './rank.js';

/** Fewer shelf records than this in the catalogue, and rooms would be guesses. */
export const MIN_SHELF = 3;
/** Picks per room: enough to browse, few enough that each one is considered. */
export const PICKS_PER_ROOM = 8;
/** The newest wants read for each answer: 300 records, three requests to Discogs. */
export const WANT_PAGES = 3;

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
    private readonly gateway: DiscogsGateway,
    private readonly users: UserRepository,
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
    if (!catalogue) {
      return {
        status: 'no_catalogue',
        catalogue,
        basedOn: { shelfRecords: shelfItems.length, inCatalogue: 0, wanted: null },
        rooms: [],
      };
    }
    const shelf = await catalogueRows(this.database, [...ownedMasters]);
    // Wanted records already on the shelf say nothing new.
    const wantedIds = await this.wantedMasters(userId);
    const wanted = wantedIds
      ? await catalogueRows(
          this.database,
          wantedIds.filter((id) => !ownedMasters.has(id)),
        )
      : [];
    const basedOn = {
      shelfRecords: shelfItems.length,
      inCatalogue: shelf.length,
      wanted: wantedIds ? wanted.length : null,
    };
    if (shelf.length + wanted.length < MIN_SHELF) {
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

    // Wanting a record is close to "more like this"; "not for me" on it still wins.
    const disliked = withVerdict('less');
    const liked = [...withVerdict('more'), ...wanted].filter(
      (row, i, rows) =>
        rows.findIndex((r) => r.id === row.id) === i && !disliked.some((d) => d.id === row.id),
    );
    const results = await recommend({
      shelf,
      liked,
      disliked,
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

  /**
   * Master ids of the newest records on the user's Discogs wantlist, read live and held
   * only for this answer (ADR 0011). Null when Discogs cannot be asked or does not
   * answer: the picks then come from the shelf alone, and the answer says so.
   */
  private async wantedMasters(userId: string): Promise<number[] | null> {
    const owner = await this.users.accessToken(userId);
    if (!owner) return null;
    const ids: number[] = [];
    try {
      for (let page = 1; page <= WANT_PAGES; page++) {
        const found = await this.gateway.getWantlistPage(
          owner.token,
          owner.user.discogsUsername,
          page,
        );
        for (const want of found.wants) {
          if (want.release.masterId) ids.push(want.release.masterId);
        }
        if (found.page >= found.pages) break;
      }
    } catch {
      return null;
    }
    return ids;
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
