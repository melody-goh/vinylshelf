# ADR 0003: Postgres as the job queue

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

Collection imports must page through the Discogs API under a rate limit, survive restarts,
and resume. The default tool, BullMQ on Redis, would add a second stateful service. The
free Redis tiers we can use are limited by command count, and BullMQ's polling would use a
large share of that budget.

## Decision

Use a Postgres-backed queue (pg-boss or graphile-worker) on the existing database.

- Jobs are enqueued in the same transaction as the state change that requires them.
- Import progress is **checkpointed in Postgres** (page cursor and counts), so a job that
  is interrupted by a host sleeping or restarting resumes where it stopped.
- Outbound Discogs calls go through one rate limiter owned by the Discogs gateway;
  the queue controls concurrency, not the limit itself.

## Consequences

**Good:** one fewer service to run and secure; transactional enqueueing removes a class of
lost-job bugs; trivial local setup (Postgres only).

**Costs:** lower raw throughput than Redis, which is irrelevant at this scale; queue
polling adds light load on the database. If throughput ever matters, the queue sits behind
a small interface and can move to Redis.

## Alternatives considered

- **BullMQ + Redis:** better tooling and throughput; rejected for operational cost and
  free-tier limits.
- **In-process queue only:** simplest, but jobs would be lost on restart and the host
  sleeping would silently drop imports.

## Notes

### 2026-10-23: queue polling vs. a scale-to-zero database

Not a change to the decision, but a cost it carries that this ADR missed. Free
serverless Postgres (Neon) scales to zero when idle and bills a monthly allowance of
compute hours (about 100 on the free plan as of October 2026; re-verify). pg-boss
polls for work every few seconds by default and runs its own maintenance and cron
timers. Our cache purge job (ADR 0004) adds a schedule of its own. Together they can
keep the database awake around the clock and use up the allowance.

This does not matter locally. Before deploying:

- Make every interval configurable (done in the first slice: worker polling,
  maintenance and purge cadence come from environment variables) and set long
  production values.
- Consider running the worker only while jobs are pending (start it on enqueue, stop
  it when the queue drains) so an idle app lets the database sleep.
- Run the purge hourly or less often. Compliance is enforced on the read path, which
  never returns expired rows; the purge only reclaims space.
- Re-check the provider's current limits and measure actual compute hours after a week.
