/**
 * Discogs failures as the answers the contract documents for every route that calls
 * Discogs on a user's behalf (404, 401, 429, 503), so they read the same everywhere.
 */
import {
  DiscogsAuthError,
  DiscogsError,
  DiscogsNotFoundError,
  DiscogsRateLimitedError,
} from './errors.js';
import { ProblemError } from '../http/problem.js';

export function toProblem(error: unknown): unknown {
  if (error instanceof DiscogsNotFoundError) {
    return new ProblemError(404, 'release_not_found', 'Release not found on Discogs');
  }
  if (error instanceof DiscogsAuthError) {
    return new ProblemError(
      401,
      'discogs_auth_revoked',
      'Discogs access was revoked. Sign in again to continue.',
    );
  }
  if (error instanceof DiscogsRateLimitedError) {
    return new ProblemError(429, 'rate_limited', 'Discogs is busy. Try again shortly.', undefined, {
      'retry-after': String(error.retryAfterSeconds ?? 60),
    });
  }
  if (error instanceof DiscogsError) {
    return new ProblemError(503, 'discogs_unavailable', 'Discogs is unavailable. Try again later.');
  }
  return error;
}
