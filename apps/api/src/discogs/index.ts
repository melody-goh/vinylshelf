/**
 * Public entry point of the Discogs module. Code outside `discogs/` builds the gateway
 * here and talks to it only through the `DiscogsGateway` interface. The HTTP client and
 * signer stay private (enforced by ESLint); the limiter instance is created here only.
 */
import { systemClock, type Clock } from '../lib/clock.js';
import { DemoDiscogsGateway, withDemo, type DemoLists } from './demo-gateway.js';
import type { DiscogsGateway } from './gateway.js';
import { HttpDiscogsGateway } from './http-gateway.js';
import type { ConsumerCredentials } from './oauth1.js';
import { RateLimiter } from '../lib/rate-limiter.js';

/** How Discogs reports the requests left in its window. */
export const DISCOGS_REMAINING_HEADER = 'x-discogs-ratelimit-remaining';

export interface DiscogsGatewayOptions {
  consumer: ConsumerCredentials;
  userAgent: string;
  /** Injected in tests so rate-limit waits take no real time. */
  clock?: Clock;
  /**
   * Serves demo users (ADR 0014): their lists, and how long a release read with the app
   * key is reused. Without it, demo tokens would reach Discogs and be refused.
   */
  demo?: { lists: DemoLists; ttlSeconds: number };
}

/**
 * Creates the gateway together with its rate limiter. Create one per process: the
 * limiter is the single budget for every Discogs call (ADR 0003, ADR 0005).
 */
export function createDiscogsGateway(options: DiscogsGatewayOptions): DiscogsGateway {
  const http = new HttpDiscogsGateway({
    consumer: options.consumer,
    userAgent: options.userAgent,
    limiter: new RateLimiter({
      remainingHeader: DISCOGS_REMAINING_HEADER,
      ...(options.clock ? { clock: options.clock } : {}),
    }),
  });
  if (!options.demo) return http;
  // One limiter for both: demo reads spend the same Discogs budget as everyone else's.
  const demo = new DemoDiscogsGateway({
    lists: options.demo.lists,
    app: http,
    clock: options.clock ?? systemClock,
    ttlSeconds: options.demo.ttlSeconds,
  });
  return withDemo(http, demo);
}
