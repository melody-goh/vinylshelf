import { describe, expect, it } from 'vitest';
import { fakeClock, manualClock } from '../test/fake-clock.js';
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  it('allows a full window of requests without waiting', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 60, windowMs: 60_000, clock });
    for (let i = 0; i < 60; i++) await limiter.acquire();
    expect(clock.sleeps).toEqual([]);
  });

  it('waits for the oldest request to leave the window once it is full', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 60, windowMs: 60_000, clock });
    for (let i = 0; i < 60; i++) await limiter.acquire();
    await limiter.acquire();
    expect(clock.time).toBe(60_000);
  });

  it('never allows more than the limit in any window', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 10, windowMs: 10_000, clock });
    const grants: number[] = [];
    for (let i = 0; i < 50; i++) {
      await limiter.acquire();
      grants.push(clock.time);
    }
    for (const start of grants) {
      const inWindow = grants.filter((t) => t >= start && t < start + 10_000).length;
      expect(inWindow).toBeLessThanOrEqual(10);
    }
  });

  it('trusts Discogs when it reports fewer requests remaining', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      limit: 60,
      windowMs: 60_000,
      clock,
      remainingHeader: 'x-discogs-ratelimit-remaining',
    });
    limiter.observe(200, new Headers({ 'x-discogs-ratelimit-remaining': '1' }));
    await limiter.acquire();
    expect(clock.time).toBe(0);
    await limiter.acquire();
    expect(clock.time).toBe(60_000);
  });

  it('does not double-count requests Discogs already reported', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      limit: 60,
      windowMs: 60_000,
      clock,
      remainingHeader: 'x-discogs-ratelimit-remaining',
    });
    for (let i = 0; i < 10; i++) await limiter.acquire();
    limiter.observe(200, new Headers({ 'x-discogs-ratelimit-remaining': '50' }));
    for (let i = 0; i < 50; i++) await limiter.acquire();
    expect(clock.sleeps).toEqual([]);
  });

  it('pauses for Retry-After after a 429', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 60, windowMs: 60_000, clock });
    limiter.observe(429, new Headers({ 'retry-after': '30' }));
    await limiter.acquire();
    expect(clock.time).toBeGreaterThanOrEqual(30_000);
  });

  it('pauses for the default backoff after a 429 without Retry-After', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 60, windowMs: 60_000, clock });
    limiter.observe(429, new Headers());
    await limiter.acquire();
    expect(clock.time).toBeGreaterThanOrEqual(60_000);
  });

  it('serves concurrent callers in arrival order', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000, clock });
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((n) => limiter.acquire().then(() => order.push(n))));
    expect(order).toEqual([1, 2, 3]);
  });
});

describe('RateLimiter lanes', () => {
  it('caps background calls below the limit, keeping the reserve for interactive ones', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 60, reservedForInteractive: 10, clock });
    for (let i = 0; i < 50; i++) await limiter.acquire('background');
    expect(clock.time).toBe(0);

    for (let i = 0; i < 10; i++) await limiter.acquire('interactive');
    expect(clock.time).toBe(0); // the reserve was still free

    await limiter.acquire('background');
    expect(clock.time).toBe(60_000); // background had to wait for its share to free up
  });

  it('never makes an interactive call queue behind a waiting background call', async () => {
    const clock = manualClock();
    const limiter = new RateLimiter({ limit: 60, reservedForInteractive: 10, clock });
    for (let i = 0; i < 50; i++) await limiter.acquire('background');

    let backgroundGranted = false;
    const background = limiter.acquire('background').then(() => {
      backgroundGranted = true;
    });
    await limiter.acquire('interactive'); // resolves while background is still waiting
    expect(backgroundGranted).toBe(false);

    await clock.advance(60_000);
    await background;
    expect(backgroundGranted).toBe(true);
  });

  it('rejects a reserve that leaves background calls no budget', () => {
    expect(() => new RateLimiter({ limit: 10, reservedForInteractive: 10 })).toThrow(RangeError);
  });
});
