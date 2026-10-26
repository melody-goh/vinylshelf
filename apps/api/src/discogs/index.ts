/**
 * Public entry point of the Discogs module. Code outside `discogs/` builds the gateway
 * here and talks to it only through the `DiscogsGateway` interface. The HTTP client and
 * signer stay private (enforced by ESLint); the limiter instance is created here only.
 */
import type { Clock } from '../lib/clock.js';
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
}

/**
 * Creates the gateway together with its rate limiter. Create one per process: the
 * limiter is the single budget for every Discogs call (ADR 0003, ADR 0005).
 */
export function createDiscogsGateway(options: DiscogsGatewayOptions): DiscogsGateway {
  return new HttpDiscogsGateway({
    consumer: options.consumer,
    userAgent: options.userAgent,
    limiter: new RateLimiter({
      remainingHeader: DISCOGS_REMAINING_HEADER,
      ...(options.clock ? { clock: options.clock } : {}),
    }),
  });
}
