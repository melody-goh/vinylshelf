/**
 * The record of how picks are received (ADR 0013): each list as it was served, and what
 * the listener then did with its records. The offline evaluation says whether the engine
 * finds held-out records; this says whether people want what it finds. First-party only,
 * catalogue ids only, and deleted with the user's account.
 */
import type { TasteEvent } from '@vinylshelf/contract';
import { and, eq, inArray } from 'drizzle-orm';
import type { DatabaseHandle } from '../db/client.js';
import { tasteEvents, tasteLists, type ServedPick } from '../db/schema.js';
import type { Clock } from '../lib/clock.js';
import type { Distance } from './rank.js';

export type ServedList =
  | { surface: 'discover'; distance: Distance; page: number; picks: ServedPick[] }
  | { surface: 'search'; query: string; page: number; picks: ServedPick[] };

export class TasteLog {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly clock: Clock,
  ) {}

  /** Keeps a list as served and names it, so the client can report on it. */
  async served(userId: string, list: ServedList): Promise<string> {
    const [row] = await this.database.db
      .insert(tasteLists)
      .values({
        userId,
        surface: list.surface,
        distance: list.surface === 'discover' ? list.distance : null,
        query: list.surface === 'search' ? list.query : null,
        page: list.page,
        picks: list.picks,
        servedAt: new Date(this.clock.now()),
      })
      .returning({ id: tasteLists.id });
    if (!row) throw new Error('Served list was not stored');
    return row.id;
  }

  /**
   * Records events against the lists they name. The position comes from the list as
   * served, not from the client, whose row shifts as records are turned down. Events
   * for someone else's list, or a record the list did not hold, are dropped: a stale
   * tab should not fail, and nobody can write into another user's record.
   */
  async record(userId: string, events: readonly TasteEvent[]): Promise<void> {
    const listIds = [...new Set(events.map((e) => e.listId))];
    const lists = await this.database.db
      .select({ id: tasteLists.id, picks: tasteLists.picks })
      .from(tasteLists)
      .where(and(eq(tasteLists.userId, userId), inArray(tasteLists.id, listIds)));
    const positions = new Map(
      lists.map((list) => [list.id, new Map(list.picks.map((p, i) => [p.masterId, i]))]),
    );
    const at = new Date(this.clock.now());
    const rows = events.flatMap((event) => {
      const position = positions.get(event.listId)?.get(event.masterId);
      return position === undefined ? [] : [{ ...event, userId, position, at }];
    });
    if (rows.length > 0) await this.database.db.insert(tasteEvents).values(rows);
  }
}
