/**
 * How picks are received, from the event log (ADR 0013): of the picks people reached,
 * what share they previewed, opened, wanted, asked for more of, or turned down. The
 * offline evaluation asks whether the engine finds the records it should; this asks
 * whether people want what it finds.
 */
import { sql } from 'drizzle-orm';
import type { DatabaseHandle } from '../db/client.js';

/** Places in a served list are grouped by row's worth, so a deep pick is not a front one. */
export const POSITION_BUCKET = 8;

export interface ReceptionRow {
  surface: 'discover' | 'search';
  /** Near or far for Discover; null for search. */
  distance: 'near' | 'far' | null;
  /** First place of the bucket (0, 8, 16, …), or null for every place together. */
  from: number | null;
  /** Lists served with at least one event. */
  lists: number;
  /** Distinct picks in those lists with any event: the listener got to them. */
  reached: number;
  viewed: number;
  previewed: number;
  opened: number;
  wanted: number;
  more: number;
  less: number;
}

/**
 * Counts per surface and reach, overall and by place in the list. A pick counts once
 * per list for each kind, however often it happened; a verdict later withdrawn still
 * counts, since it was given.
 */
export async function reception(
  database: DatabaseHandle,
  since: Date = new Date(0),
): Promise<ReceptionRow[]> {
  const result = await database.db.execute(sql`
    with picks as (
      select e.list_id, e.master_id,
        (min(e.position) / ${POSITION_BUCKET}) * ${POSITION_BUCKET} as bucket,
        bool_or(e.kind = 'viewed') as viewed,
        bool_or(e.kind = 'previewed') as previewed,
        bool_or(e.kind = 'opened') as opened,
        bool_or(e.kind = 'wanted') as wanted,
        bool_or(e.kind = 'more') as more,
        bool_or(e.kind = 'less') as less
      from taste_events e
      join taste_lists l on l.id = e.list_id
      where l.served_at >= ${since}
      group by e.list_id, e.master_id
    )
    select l.surface, l.distance,
      case when grouping(p.bucket) = 1 then null else p.bucket end as "from",
      count(distinct p.list_id)::int as lists,
      count(*)::int as reached,
      count(*) filter (where p.viewed)::int as viewed,
      count(*) filter (where p.previewed)::int as previewed,
      count(*) filter (where p.opened)::int as opened,
      count(*) filter (where p.wanted)::int as wanted,
      count(*) filter (where p.more)::int as more,
      count(*) filter (where p.less)::int as less
    from picks p
    join taste_lists l on l.id = p.list_id
    group by grouping sets (
      (l.surface, l.distance),
      (l.surface, l.distance, p.bucket)
    )
    order by l.surface, l.distance nulls first, "from" nulls first
  `);
  return result.rows as unknown as ReceptionRow[];
}
