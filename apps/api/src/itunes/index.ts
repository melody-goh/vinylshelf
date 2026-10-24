/**
 * Public entry point of the iTunes module. Code outside `itunes/` builds the gateway here
 * and talks to it only through `ITunesGateway`; the HTTP client stays private (ESLint).
 */
import type { Clock } from '../lib/clock.js';
import { RateLimiter } from '../lib/rate-limiter.js';
import type { ITunesGateway } from './gateway.js';
import { HttpITunesGateway } from './http-gateway.js';

/** Apple's published budget for the Search API, per caller (ADR 0010 §2). */
export const ITUNES_CALLS_PER_MINUTE = 20;

export interface ITunesGatewayOptions {
  country: string;
  userAgent: string;
  /** Injected in tests so rate-limit waits take no real time. */
  clock?: Clock;
}

/** Creates the gateway with its own limiter. Create one per process. */
export function createITunesGateway(options: ITunesGatewayOptions): ITunesGateway {
  return new HttpITunesGateway({
    country: options.country,
    userAgent: options.userAgent,
    limiter: new RateLimiter({
      limit: ITUNES_CALLS_PER_MINUTE,
      // Every lookup has a listener waiting; there is no background lane to protect.
      reservedForInteractive: 0,
      ...(options.clock ? { clock: options.clock } : {}),
    }),
  });
}
