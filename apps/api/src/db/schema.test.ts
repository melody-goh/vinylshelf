/**
 * The invariants here are enforced by Postgres itself, so they hold even if
 * application code has a bug. These tests make sure the migration really creates them.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../test/database.js';
import { discogsReleaseCache, importJobs, users } from './schema.js';

const { db } = useTestDatabase();

async function insertUser(): Promise<string> {
  const [user] = await db()
    .insert(users)
    .values({
      discogsUserId: 1,
      discogsUsername: 'collector',
      oauthTokenEnc: 'enc',
      oauthSecretEnc: 'enc',
    })
    .returning({ id: users.id });
  if (!user) throw new Error('insert failed');
  return user.id;
}

/** Drizzle wraps driver errors; the Postgres constraint name sits on the cause. */
function constraintOf(error: unknown): string | undefined {
  const cause = (error as { cause?: { constraint?: string } }).cause;
  return cause?.constraint;
}

const HOUR = 60 * 60 * 1000;

function cacheRow(fetchedAt: Date, expiresAt: Date) {
  return {
    discogsId: 42,
    title: 'Kind of Blue',
    artists: ['Miles Davis'],
    artistSort: 'miles davis',
    year: 1959,
    coverImageUrl: null,
    discogsUrl: 'https://www.discogs.com/release/42',
    classification: 'restricted' as const,
    fetchedAt,
    expiresAt,
  };
}

describe('discogs_release_cache', () => {
  it('accepts a row that expires within 6 hours', async () => {
    const now = new Date();
    await db()
      .insert(discogsReleaseCache)
      .values(cacheRow(now, new Date(now.getTime() + 6 * HOUR)));
    const rows = await db().select().from(discogsReleaseCache);
    expect(rows).toHaveLength(1);
  });

  it('rejects a row that would outlive the 6-hour limit (ADR 0004)', async () => {
    const now = new Date();
    const error = await db()
      .insert(discogsReleaseCache)
      .values(cacheRow(now, new Date(now.getTime() + 6 * HOUR + 1000)))
      .catch((e: unknown) => e);
    expect(constraintOf(error)).toBe('discogs_release_cache_ttl_max_6h');
  });

  it('rejects a row that expires before it was fetched', async () => {
    const now = new Date();
    const error = await db()
      .insert(discogsReleaseCache)
      .values(cacheRow(now, new Date(now.getTime() - 1000)))
      .catch((e: unknown) => e);
    expect(constraintOf(error)).toBe('discogs_release_cache_ttl_max_6h');
  });
});

describe('import_jobs', () => {
  it('allows only one active import per user', async () => {
    const userId = await insertUser();
    await db().insert(importJobs).values({ userId, status: 'running' });
    const error = await db()
      .insert(importJobs)
      .values({ userId, status: 'queued' })
      .catch((e: unknown) => e);
    expect(constraintOf(error)).toBe('import_jobs_one_active_per_user');
  });

  it('allows a new import once the previous one has finished', async () => {
    const userId = await insertUser();
    const [first] = await db().insert(importJobs).values({ userId, status: 'running' }).returning();
    await db()
      .update(importJobs)
      .set({ status: 'failed' })
      .where(eq(importJobs.id, first?.id ?? ''));
    await expect(db().insert(importJobs).values({ userId })).resolves.toBeDefined();
  });
});
