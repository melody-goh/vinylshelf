/** Failures of the iTunes Search API, independent of HTTP details. */
export class ITunesError extends Error {
  override name = 'ITunesError';
}

/** Apple's budget (about 20 calls a minute) is spent; try again later. */
export class ITunesRateLimitedError extends ITunesError {
  override name = 'ITunesRateLimitedError';

  constructor(
    message: string,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
  }
}

/** Unreachable, a 5xx, or a response we could not read. */
export class ITunesUnavailableError extends ITunesError {
  override name = 'ITunesUnavailableError';
}
