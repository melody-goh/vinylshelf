/**
 * The single limiter for all outbound Discogs calls (ADR 0003, ADR 0005). The import
 * queue decides how many jobs run; this decides how fast any of them may call Discogs.
 *
 * Discogs counts requests over a moving 60-second window (60 per minute when
 * authenticated). The limiter mirrors that with a sliding-window log: a request is
 * allowed only while fewer than `limit` were granted in the last `windowMs`. A token
 * bucket would be simpler, but it allows a full burst and then keeps refilling within
 * the same minute, about twice the limit in a moving window.
 *
 * It also listens to what Discogs reports. `X-Discogs-Ratelimit-Remaining` lowers the
 * local budget, because Discogs throttles by source IP and sees requests we did not
 * count, and a 429 pauses everything for `Retry-After`.
 *
 * Two lanes keep imports from starving logins; see `Lane`.
 *
 * Limitation: the state lives in this process. If the API ever runs as more than one
 * instance, the window must move somewhere shared (for example Postgres), or the
 * instances will together exceed the budget.
 */

import { systemClock, type Clock } from '../lib/clock.js';

export interface RateLimiterOptions {
  /** Requests allowed per window. */
  limit?: number;
  windowMs?: number;
  /** Pause after a 429 that carries no usable Retry-After. */
  defaultBackoffMs?: number;
  /** Requests per window kept for interactive calls. Default: a sixth of the limit. */
  reservedForInteractive?: number;
  clock?: Clock;
}

/**
 * Who is waiting. `interactive` calls have a user waiting on a page (login); they may
 * use the whole budget. `background` calls (imports) may not use the part reserved for
 * interactive calls, so a large import can never make a login wait a minute.
 */
export type Lane = 'interactive' | 'background';

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly defaultBackoffMs: number;
  private readonly clock: Clock;
  /** Per-window capacity of each lane. */
  private readonly capacity: Record<Lane, number>;
  /** Grant times within the current window, oldest first, shared by both lanes. */
  private grants: number[] = [];
  private pausedUntil = 0;
  /**
   * One queue per lane, so requests are granted in arrival order within a lane, but an
   * interactive request never queues behind a waiting background one.
   */
  private queues: Record<Lane, Promise<void>> = {
    interactive: Promise.resolve(),
    background: Promise.resolve(),
  };

  constructor(options: RateLimiterOptions = {}) {
    this.limit = options.limit ?? 60;
    this.windowMs = options.windowMs ?? 60_000;
    this.defaultBackoffMs = options.defaultBackoffMs ?? this.windowMs;
    this.clock = options.clock ?? systemClock;
    const reserved = options.reservedForInteractive ?? Math.floor(this.limit / 6);
    if (reserved < 0 || reserved >= this.limit) {
      throw new RangeError('reservedForInteractive must be at least 0 and below the limit');
    }
    this.capacity = { interactive: this.limit, background: this.limit - reserved };
  }

  /** Resolves when the caller may send one request. */
  acquire(lane: Lane = 'interactive'): Promise<void> {
    const turn = this.queues[lane].then(() => this.waitForSlot(lane));
    this.queues[lane] = turn.catch(() => undefined);
    return turn;
  }

  /**
   * Feeds Discogs' view of the budget back into the limiter. Call it after every
   * response, including errors.
   */
  observe(status: number, headers: Headers): void {
    const now = this.clock.now();
    this.evict(now);

    const remaining = Number.parseInt(headers.get('x-discogs-ratelimit-remaining') ?? '', 10);
    if (Number.isFinite(remaining) && remaining >= 0) {
      // Discogs has seen more requests than we counted. Record the difference as used
      // now, so they age out of the window like real requests.
      const unseen = this.limit - remaining - this.grants.length;
      for (let i = 0; i < unseen; i++) this.grants.push(now);
    }

    if (status === 429) {
      const retryAfterSeconds = Number.parseInt(headers.get('retry-after') ?? '', 10);
      const pauseMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
          ? retryAfterSeconds * 1000
          : this.defaultBackoffMs;
      this.pausedUntil = Math.max(this.pausedUntil, now + pauseMs);
    }
  }

  private async waitForSlot(lane: Lane): Promise<void> {
    const capacity = this.capacity[lane];
    for (;;) {
      const now = this.clock.now();
      if (now < this.pausedUntil) {
        await this.clock.sleep(this.pausedUntil - now);
        continue;
      }
      this.evict(now);
      if (this.grants.length < capacity) {
        this.grants.push(now);
        return;
      }
      // This lane's share is used up: wait until enough grants age out to free one.
      const freesSlot = this.grants[this.grants.length - capacity] ?? now;
      await this.clock.sleep(Math.max(1, freesSlot + this.windowMs - now));
    }
  }

  private evict(now: number): void {
    const cutoff = now - this.windowMs;
    let expired = 0;
    while (expired < this.grants.length && (this.grants[expired] ?? 0) <= cutoff) expired++;
    if (expired > 0) this.grants.splice(0, expired);
  }
}
