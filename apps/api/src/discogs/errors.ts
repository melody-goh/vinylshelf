/**
 * Failure modes callers need to tell apart. The classes say what to do next (retry
 * later, ask the user to sign in again, report a bug), not which HTTP status Discogs
 * happened to send. Messages never include tokens or response bodies.
 */
export abstract class DiscogsError extends Error {
  /** Whether trying again later can succeed without anything else changing. */
  abstract readonly retryable: boolean;
}

/** Network failure, timeout or 5xx. Usually transient. */
export class DiscogsUnavailableError extends DiscogsError {
  override name = 'DiscogsUnavailableError';
  readonly retryable = true;
}

/** Still throttled after the limiter's own backoff. */
export class DiscogsRateLimitedError extends DiscogsError {
  override name = 'DiscogsRateLimitedError';
  readonly retryable = true;

  constructor(
    message: string,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
  }
}

/** 401/403: the user's token was revoked or the request token is invalid. */
export class DiscogsAuthError extends DiscogsError {
  override name = 'DiscogsAuthError';
  readonly retryable = false;
}

export class DiscogsNotFoundError extends DiscogsError {
  override name = 'DiscogsNotFoundError';
  readonly retryable = false;
}

/**
 * The response did not match the shape we validate (ADR 0004 §1). Discogs changed
 * something or a fixture drifted. Retrying will not help; someone has to look.
 */
export class DiscogsSchemaError extends DiscogsError {
  override name = 'DiscogsSchemaError';
  readonly retryable = false;

  constructor(
    readonly endpoint: string,
    readonly issues: readonly string[],
  ) {
    super(`Unexpected Discogs response from ${endpoint}: ${issues.join('; ')}`);
  }
}
