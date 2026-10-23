import type { z } from 'zod';
import { discogsEndpoints } from './endpoints.js';
import {
  DiscogsAuthError,
  DiscogsNotFoundError,
  DiscogsRateLimitedError,
  DiscogsSchemaError,
  DiscogsUnavailableError,
} from './errors.js';
import type {
  CollectionPageResult,
  DiscogsGateway,
  DiscogsIdentity,
  ReleaseSummaryData,
  RequestToken,
  TokenPair,
} from './gateway.js';
import { authorizationHeader, type ConsumerCredentials } from './oauth1.js';
import type { RateLimiter } from './rate-limiter.js';
import {
  accessTokenResponse,
  collectionReleasesResponse,
  identityResponse,
  requestTokenResponse,
  type CollectionReleasesResponse,
} from './schemas.js';

/** Discogs' maximum page size; fewer pages means fewer rate-limited calls. */
export const COLLECTION_PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 15_000;
/** 429s retried here, after the limiter has paused for Retry-After. */
const MAX_RATE_LIMIT_RETRIES = 2;

export interface HttpDiscogsGatewayOptions {
  consumer: ConsumerCredentials;
  /** Discogs rejects requests without a descriptive User-Agent. */
  userAgent: string;
  limiter: RateLimiter;
}

interface SignedRequest {
  method: 'GET' | 'POST';
  url: string;
  endpoint: string;
  token?: TokenPair;
  callback?: string;
  verifier?: string;
  form?: boolean;
}

/**
 * The real Discogs gateway: OAuth 1.0a PLAINTEXT signing, the shared rate limiter, a
 * timeout per request and Zod validation of every response.
 *
 * Retries: a 429 is retried here, because the limiter knows exactly how long to wait.
 * Network errors and 5xx are not. They surface as `DiscogsUnavailableError`, and the
 * caller (the import job) decides, so retries never stack at two layers.
 */
export class HttpDiscogsGateway implements DiscogsGateway {
  constructor(private readonly options: HttpDiscogsGatewayOptions) {}

  async getRequestToken(callbackUrl: string): Promise<RequestToken> {
    const body = await this.send({
      method: 'GET',
      url: discogsEndpoints.requestToken,
      endpoint: 'oauth/request_token',
      callback: callbackUrl,
      form: true,
    });
    const parsed = parse(
      requestTokenResponse,
      Object.fromEntries(new URLSearchParams(body)),
      'oauth/request_token',
    );
    return {
      token: { token: parsed.oauth_token, secret: parsed.oauth_token_secret },
      authorizeUrl: discogsEndpoints.authorize(parsed.oauth_token),
    };
  }

  async getAccessToken(requestToken: TokenPair, verifier: string): Promise<TokenPair> {
    const body = await this.send({
      method: 'POST',
      url: discogsEndpoints.accessToken,
      endpoint: 'oauth/access_token',
      token: requestToken,
      verifier,
      form: true,
    });
    const parsed = parse(
      accessTokenResponse,
      Object.fromEntries(new URLSearchParams(body)),
      'oauth/access_token',
    );
    return { token: parsed.oauth_token, secret: parsed.oauth_token_secret };
  }

  async getIdentity(accessToken: TokenPair): Promise<DiscogsIdentity> {
    const body = await this.send({
      method: 'GET',
      url: discogsEndpoints.identity,
      endpoint: 'oauth/identity',
      token: accessToken,
    });
    const parsed = parse(identityResponse, parseJson(body, 'oauth/identity'), 'oauth/identity');
    return { id: parsed.id, username: parsed.username };
  }

  async getCollectionPage(
    accessToken: TokenPair,
    username: string,
    page: number,
  ): Promise<CollectionPageResult> {
    const url = new URL(discogsEndpoints.collectionReleases(username));
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(COLLECTION_PAGE_SIZE));
    url.searchParams.set('sort', 'added');
    url.searchParams.set('sort_order', 'desc');

    const endpoint = 'users/:username/collection/folders/0/releases';
    const body = await this.send({
      method: 'GET',
      url: url.toString(),
      endpoint,
      token: accessToken,
    });
    return toCollectionPage(parse(collectionReleasesResponse, parseJson(body, endpoint), endpoint));
  }

  private async send(request: SignedRequest, attempt = 0): Promise<string> {
    const { limiter, consumer, userAgent } = this.options;
    await limiter.acquire();

    let response: Response;
    try {
      response = await fetch(request.url, {
        method: request.method,
        headers: {
          'User-Agent': userAgent,
          Accept: request.form ? 'application/x-www-form-urlencoded' : 'application/json',
          ...(request.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          Authorization: authorizationHeader({
            consumer,
            ...(request.token ? { token: request.token } : {}),
            ...(request.callback !== undefined ? { callback: request.callback } : {}),
            ...(request.verifier !== undefined ? { verifier: request.verifier } : {}),
          }),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new DiscogsUnavailableError(`Discogs ${request.endpoint} unreachable`, {
        cause: error,
      });
    }

    limiter.observe(response.status, response.headers);
    // Read the body even on errors so the connection can be reused.
    const body = await response.text();

    if (response.ok) return body;

    const what = `Discogs ${request.endpoint} returned ${response.status}`;
    switch (true) {
      case response.status === 429: {
        if (attempt < MAX_RATE_LIMIT_RETRIES) return this.send(request, attempt + 1);
        const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
        throw new DiscogsRateLimitedError(what, Number.isFinite(retryAfter) ? retryAfter : null);
      }
      case response.status === 401 || response.status === 403:
        throw new DiscogsAuthError(what);
      case response.status === 404:
        throw new DiscogsNotFoundError(what);
      default:
        throw new DiscogsUnavailableError(what);
    }
  }
}

function parseJson(body: string, endpoint: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new DiscogsSchemaError(endpoint, ['body is not valid JSON']);
  }
}

function parse<T extends z.ZodType>(schema: T, value: unknown, endpoint: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new DiscogsSchemaError(
      endpoint,
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}

/**
 * Discogs appends " (2)", " (3)", ... to tell apart artists who share a name. That
 * suffix is an internal disambiguator, not part of the name people know.
 */
export function displayArtistName(name: string): string {
  return name.replace(/ \(\d+\)$/, '');
}

/** Discogs uses an empty string or a spacer GIF when there is no cover. */
function coverImage(url: string | undefined): string | null {
  if (!url || url.endsWith('/spacer.gif')) return null;
  return url;
}

function toCollectionPage(response: CollectionReleasesResponse): CollectionPageResult {
  return {
    page: response.pagination.page,
    pages: response.pagination.pages,
    totalItems: response.pagination.items,
    entries: response.releases.map((item) => {
      const info = item.basic_information;
      const release: ReleaseSummaryData = {
        discogsId: info.id,
        title: info.title,
        artists: info.artists.map((a) => displayArtistName(a.name)),
        // Discogs reports an unknown year as 0.
        year: info.year > 0 ? info.year : null,
        coverImageUrl: coverImage(info.cover_image),
        discogsUrl: discogsEndpoints.releasePage(info.id),
      };
      return {
        instanceId: item.instance_id,
        releaseId: item.id,
        dateAdded: new Date(item.date_added),
        release,
      };
    }),
  };
}
