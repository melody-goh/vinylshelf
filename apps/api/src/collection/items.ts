/**
 * The user's shelf as the contract's `CollectionPage`: shelf references joined to
 * fresh cache rows only, with keyset pagination and the refresh state.
 */
import type { CollectionItem, CollectionPage } from '@vinylshelf/contract';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/client.js';
import { collectionItems, discogsReleaseCache } from '../db/schema.js';
import { freshReleaseCondition } from '../discogs/cache.js';
import { ProblemError } from '../http/problem.js';
import type { CollectionSort } from '../http/schemas.js';
import type { Clock } from '../lib/clock.js';
import type { ImportService } from './imports.js';
import { decideRefresh, type RefreshPolicy, type ShelfFreshness } from './refresh.js';

interface SortSpec {
  /** Sort key expression; ties are broken by instance id in the same direction. */
  key: SQL;
  direction: 'asc' | 'desc';
  /** The key's SQL type, so cursor parameters compare correctly. */
  cast: 'timestamptz' | 'text' | 'integer';
}

// Unknown years sort last in both directions.
const SORTS: Record<CollectionSort, SortSpec> = {
  added_desc: { key: sql`${collectionItems.dateAdded}`, direction: 'desc', cast: 'timestamptz' },
  added_asc: { key: sql`${collectionItems.dateAdded}`, direction: 'asc', cast: 'timestamptz' },
  artist_asc: { key: sql`${discogsReleaseCache.artistSort}`, direction: 'asc', cast: 'text' },
  year_asc: {
    key: sql`coalesce(${discogsReleaseCache.year}, 2147483647)`,
    direction: 'asc',
    cast: 'integer',
  },
  year_desc: {
    key: sql`coalesce(${discogsReleaseCache.year}, -1)`,
    direction: 'desc',
    cast: 'integer',
  },
};

const cursorSchema = z.object({
  s: z.string(),
  k: z.union([z.string(), z.number()]),
  i: z.number().int(),
});
type Cursor = z.infer<typeof cursorSchema>;

/** Cursors are opaque to clients; the encoding may change without notice. */
function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string, sort: CollectionSort): Cursor {
  let parsed;
  try {
    parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    parsed = null;
  }
  if (!parsed?.success) throw new ProblemError(400, 'invalid_request', 'Invalid cursor');
  if (parsed.data.s !== sort) {
    throw new ProblemError(400, 'invalid_request', 'Cursor belongs to a different sort');
  }
  return parsed.data;
}

export interface ListItemsInput {
  userId: string;
  sort: CollectionSort;
  limit: number;
  cursor?: string | undefined;
}

export class CollectionItemsService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly imports: ImportService,
    private readonly clock: Clock,
    private readonly policy: RefreshPolicy,
  ) {}

  async list(input: ListItemsInput): Promise<CollectionPage> {
    const now = this.clock.now();
    const [page, freshness, latest] = await Promise.all([
      this.page(input, new Date(now)),
      this.freshness(input.userId, new Date(now)),
      this.imports.latest(input.userId),
    ]);

    const decision = decideRefresh(freshness, latest, now, this.policy);
    const refresh =
      decision.action === 'none'
        ? decision.refresh
        : {
            status: 'refreshing' as const,
            importId: (await this.imports.start(input.userId)).id,
            hiddenCount: freshness.hiddenCount,
            retryAt: null,
          };

    return { ...page, refresh };
  }

  private async page(
    input: ListItemsInput,
    now: Date,
  ): Promise<Pick<CollectionPage, 'items' | 'nextCursor'>> {
    const spec = SORTS[input.sort];
    const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor, input.sort);
    const op = spec.direction === 'asc' ? sql`>` : sql`<`;
    const dir = spec.direction === 'asc' ? sql`asc` : sql`desc`;
    const after = cursor
      ? sql`(${spec.key}, ${collectionItems.instanceId}) ${op} (${cursor.k}::${sql.raw(spec.cast)}, ${cursor.i}::bigint)`
      : undefined;

    const rows = await this.database.db
      .select({
        instanceId: collectionItems.instanceId,
        dateAdded: collectionItems.dateAdded,
        sortKey: sql<string | number>`${spec.key}`,
        release: {
          discogsId: discogsReleaseCache.discogsId,
          title: discogsReleaseCache.title,
          artists: discogsReleaseCache.artists,
          year: discogsReleaseCache.year,
          coverImageUrl: discogsReleaseCache.coverImageUrl,
          discogsUrl: discogsReleaseCache.discogsUrl,
          fetchedAt: discogsReleaseCache.fetchedAt,
          expiresAt: discogsReleaseCache.expiresAt,
        },
      })
      .from(collectionItems)
      // ADR 0004 §3: only fresh rows join, so expired data is never returned.
      .innerJoin(
        discogsReleaseCache,
        and(
          eq(discogsReleaseCache.discogsId, collectionItems.releaseId),
          freshReleaseCondition(now),
        ),
      )
      .where(and(eq(collectionItems.userId, input.userId), after))
      .orderBy(sql`${spec.key} ${dir}`, sql`${collectionItems.instanceId} ${dir}`)
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const visible = hasMore ? rows.slice(0, input.limit) : rows;
    const last = visible.at(-1);

    return {
      items: visible.map((row): CollectionItem => ({
        instanceId: row.instanceId,
        dateAdded: row.dateAdded.toISOString(),
        release: {
          ...row.release,
          fetchedAt: row.release.fetchedAt.toISOString(),
          expiresAt: row.release.expiresAt.toISOString(),
        },
      })),
      nextCursor:
        hasMore && last
          ? encodeCursor({ s: input.sort, k: cursorKey(last.sortKey), i: last.instanceId })
          : null,
    };
  }

  private async freshness(userId: string, now: Date): Promise<ShelfFreshness> {
    const [row] = await this.database.db
      .select({
        hiddenCount:
          sql<number>`count(*) filter (where ${discogsReleaseCache.discogsId} is null)`.mapWith(
            Number,
          ),
        oldestFetchedAt: sql<Date | null>`min(${discogsReleaseCache.fetchedAt})`.mapWith(
          (value: Date | string | null) => (value === null ? null : new Date(value)),
        ),
      })
      .from(collectionItems)
      .leftJoin(
        discogsReleaseCache,
        and(
          eq(discogsReleaseCache.discogsId, collectionItems.releaseId),
          freshReleaseCondition(now),
        ),
      )
      .where(eq(collectionItems.userId, userId));
    return { hiddenCount: row?.hiddenCount ?? 0, oldestFetchedAt: row?.oldestFetchedAt ?? null };
  }
}

/** Timestamps come back from the driver as Date; cursors carry them as ISO strings. */
function cursorKey(value: unknown): string | number {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'string') return value;
  throw new Error(`Unexpected sort key type: ${typeof value}`);
}
