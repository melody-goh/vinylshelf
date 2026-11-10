import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { demoCollection, demoWants } from '../db/schema.js';
import type { DemoLists } from '../discogs/demo-gateway.js';
import type { Clock } from '../lib/clock.js';

/**
 * A demo visitor's collection and wantlist in our database (ADR 0014): what the demo
 * gateway serves in place of their Discogs lists. Deleted with the demo user.
 */
export class PgDemoLists implements DemoLists {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async collection(userId: string) {
    return this.db
      .select({
        instanceId: demoCollection.instanceId,
        releaseId: demoCollection.releaseId,
        dateAdded: demoCollection.dateAdded,
      })
      .from(demoCollection)
      .where(eq(demoCollection.userId, userId));
  }

  async addToCollection(userId: string, releaseId: number): Promise<number> {
    // Instance ids count up per visitor; a demo user adds rarely and alone.
    const [row] = await this.db
      .insert(demoCollection)
      .values({
        userId,
        releaseId,
        dateAdded: new Date(this.clock.now()),
        instanceId: sql`(select coalesce(max(${demoCollection.instanceId}), 0) + 1 from ${demoCollection} where ${demoCollection.userId} = ${userId})`,
      })
      .returning({ instanceId: demoCollection.instanceId });
    if (!row) throw new Error('Demo collection insert returned no row');
    return row.instanceId;
  }

  async wants(userId: string) {
    return this.db
      .select({ releaseId: demoWants.releaseId, dateAdded: demoWants.dateAdded })
      .from(demoWants)
      .where(eq(demoWants.userId, userId));
  }

  async want(userId: string, releaseId: number): Promise<Date> {
    await this.db
      .insert(demoWants)
      .values({ userId, releaseId, dateAdded: new Date(this.clock.now()) })
      .onConflictDoNothing();
    const [row] = await this.db
      .select({ dateAdded: demoWants.dateAdded })
      .from(demoWants)
      .where(and(eq(demoWants.userId, userId), eq(demoWants.releaseId, releaseId)));
    if (!row) throw new Error('Demo want was not stored');
    return row.dateAdded;
  }

  async unwant(userId: string, releaseId: number): Promise<void> {
    await this.db
      .delete(demoWants)
      .where(and(eq(demoWants.userId, userId), eq(demoWants.releaseId, releaseId)));
  }
}
