/**
 * What the shelf can be filtered by, for the library (openapi.yaml, getCollectionFacets):
 * genres, styles, decades and colourways, each counted over the user's vinyl records
 * whose Discogs data is fresh (ADR 0004).
 */
import type { CollectionFacets } from '@vinylshelf/contract';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { collectionItems, discogsReleaseCache } from '../db/schema.js';
import { freshReleaseCondition, vinylReleaseCondition } from '../discogs/cache.js';
import type { Clock } from '../lib/clock.js';

export class CollectionFacetsService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async get(userId: string): Promise<CollectionFacets> {
    const now = new Date(this.clock.now());
    const shelf = this.db
      .select({
        genres: discogsReleaseCache.genres,
        styles: discogsReleaseCache.styles,
        year: discogsReleaseCache.year,
        vinylColors: discogsReleaseCache.vinylColors,
        expiresAt: discogsReleaseCache.expiresAt,
      })
      .from(collectionItems)
      .innerJoin(
        discogsReleaseCache,
        and(
          eq(discogsReleaseCache.discogsId, collectionItems.releaseId),
          freshReleaseCondition(now),
        ),
      )
      .where(and(eq(collectionItems.userId, userId), vinylReleaseCondition()))
      .as('shelf');

    const names = (column: 'genres' | 'styles') =>
      this.db
        .select({
          name: sql<string>`value`,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(sql`${shelf}, jsonb_array_elements_text(coalesce(${shelf[column]}, '[]'::jsonb))`)
        .groupBy(sql`value`)
        .orderBy(sql`count(*) desc`, sql`value asc`);

    const [genres, styles, decades, [summary]] = await Promise.all([
      names('genres'),
      names('styles'),
      this.db
        .select({
          decade: sql<number>`(${shelf.year} / 10) * 10`.mapWith(Number),
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(shelf)
        .where(sql`${shelf.year} is not null`)
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      this.db
        .select({
          coloured:
            sql<number>`count(*) filter (where ${shelf.vinylColors} <> '[]'::jsonb)`.mapWith(
              Number,
            ),
          black: sql<number>`count(*) filter (where ${shelf.vinylColors} = '[]'::jsonb)`.mapWith(
            Number,
          ),
          expiresAt: sql<Date | null>`min(${shelf.expiresAt})`.mapWith(
            (value: Date | string | null) => (value === null ? null : new Date(value)),
          ),
        })
        .from(shelf),
    ]);

    return {
      genres,
      styles,
      decades,
      colourways: { coloured: summary?.coloured ?? 0, black: summary?.black ?? 0 },
      expiresAt: summary?.expiresAt?.toISOString() ?? null,
    };
  }
}
