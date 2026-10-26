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
  ReleaseDetailData,
  ReleaseSummaryData,
  RequestToken,
  SearchPageData,
  TokenPair,
  WantData,
  WantlistPageData,
} from './gateway.js';
import { authorizationHeader, type ConsumerCredentials } from './oauth1.js';
import { vinylColorsOf } from './vinyl-colors.js';
import type { Lane, RateLimiter } from '../lib/rate-limiter.js';
import {
  accessTokenResponse,
  addToCollectionResponse,
  collectionReleasesResponse,
  identityResponse,
  releaseResponse,
  requestTokenResponse,
  searchResponse,
  wantlistResponse,
  wantResponse,
  type BasicInformation,
  type CollectionReleasesResponse,
  type ReleaseResponse,
  type SearchResponse,
  type WantResponse,
} from './schemas.js';

/** Discogs' maximum page size; fewer pages means fewer rate-limited calls. */
export const COLLECTION_PAGE_SIZE = 100;
/** Enough results to find the right pressing without a long scroll. */
export const SEARCH_PAGE_SIZE = 24;
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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  endpoint: string;
  token?: TokenPair;
  callback?: string;
  verifier?: string;
  form?: boolean;
  /** Imports run in the background lane so they cannot starve logins. */
  lane?: Lane;
  /** Never retry, even on 429: for writes that must not be applied twice. */
  noRetry?: boolean;
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
      lane: 'background',
    });
    return toCollectionPage(parse(collectionReleasesResponse, parseJson(body, endpoint), endpoint));
  }

  async getRelease(accessToken: TokenPair, releaseId: number): Promise<ReleaseDetailData> {
    const endpoint = 'releases/:id';
    const body = await this.send({
      method: 'GET',
      url: discogsEndpoints.release(releaseId),
      endpoint,
      token: accessToken,
      lane: 'interactive',
    });
    return toReleaseDetail(parse(releaseResponse, parseJson(body, endpoint), endpoint));
  }

  async searchReleases(
    accessToken: TokenPair,
    query: string,
    page: number,
  ): Promise<SearchPageData> {
    const url = new URL(discogsEndpoints.search);
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'release');
    url.searchParams.set('format', 'Vinyl');
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(SEARCH_PAGE_SIZE));

    const endpoint = 'database/search';
    const body = await this.send({
      method: 'GET',
      url: url.toString(),
      endpoint,
      token: accessToken,
      lane: 'interactive',
    });
    return toSearchPage(parse(searchResponse, parseJson(body, endpoint), endpoint));
  }

  async addToCollection(
    accessToken: TokenPair,
    username: string,
    releaseId: number,
  ): Promise<{ instanceId: number }> {
    const endpoint = 'users/:username/collection/folders/1/releases/:id';
    const body = await this.send({
      method: 'POST',
      url: discogsEndpoints.addToCollection(username, releaseId),
      endpoint,
      token: accessToken,
      lane: 'interactive',
      // A write is not retried on 429: Discogs may have applied it, and a retry would
      // add a second copy.
      noRetry: true,
    });
    const parsed = parse(addToCollectionResponse, parseJson(body, endpoint), endpoint);
    return { instanceId: parsed.instance_id };
  }

  async getWantlistPage(
    accessToken: TokenPair,
    username: string,
    page: number,
  ): Promise<WantlistPageData> {
    const url = new URL(discogsEndpoints.wants(username));
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(COLLECTION_PAGE_SIZE));
    const endpoint = 'users/:username/wants';
    const body = await this.send({
      method: 'GET',
      url: url.toString(),
      endpoint,
      token: accessToken,
      lane: 'interactive',
    });
    const parsed = parse(wantlistResponse, parseJson(body, endpoint), endpoint);
    return {
      page: parsed.pagination.page,
      pages: parsed.pagination.pages,
      totalItems: parsed.pagination.items,
      wants: parsed.wants.map(toWant),
    };
  }

  async addToWantlist(
    accessToken: TokenPair,
    username: string,
    releaseId: number,
  ): Promise<WantData> {
    const endpoint = 'users/:username/wants/:id';
    // Idempotent on Discogs (a release is wanted or not), so a 429 may be retried.
    const body = await this.send({
      method: 'PUT',
      url: discogsEndpoints.want(username, releaseId),
      endpoint,
      token: accessToken,
      lane: 'interactive',
    });
    return toWant(parse(wantResponse, parseJson(body, endpoint), endpoint));
  }

  async removeFromWantlist(
    accessToken: TokenPair,
    username: string,
    releaseId: number,
  ): Promise<void> {
    await this.send({
      method: 'DELETE',
      url: discogsEndpoints.want(username, releaseId),
      endpoint: 'users/:username/wants/:id',
      token: accessToken,
      lane: 'interactive',
    });
  }

  private async send(request: SignedRequest, attempt = 0): Promise<string> {
    const { limiter, consumer, userAgent } = this.options;
    await limiter.acquire(request.lane ?? 'interactive');

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
        if (!request.noRetry && attempt < MAX_RATE_LIMIT_RETRIES) {
          return this.send(request, attempt + 1);
        }
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

/** A release summary from the `basic_information` Discogs embeds in list entries. */
function summaryOf(info: BasicInformation): ReleaseSummaryData {
  return {
    discogsId: info.id,
    title: info.title,
    artists: info.artists.map((a) => displayArtistName(a.name)),
    // Discogs reports an unknown year as 0.
    year: info.year > 0 ? info.year : null,
    vinylColors: vinylColorsOf(info.formats),
    formatNames: formatNamesOf(info.formats),
    genres: info.genres,
    styles: info.styles,
    coverImageUrl: coverImage(info.cover_image),
    discogsUrl: discogsEndpoints.releasePage(info.id),
  };
}

function toWant(want: WantResponse): WantData {
  return {
    releaseId: want.id,
    dateAdded: new Date(want.date_added),
    release: summaryOf(want.basic_information),
  };
}

function toCollectionPage(response: CollectionReleasesResponse): CollectionPageResult {
  return {
    page: response.pagination.page,
    pages: response.pagination.pages,
    totalItems: response.pagination.items,
    entries: response.releases.map((item) => ({
      instanceId: item.instance_id,
      releaseId: item.id,
      dateAdded: new Date(item.date_added),
      release: summaryOf(item.basic_information),
    })),
  };
}

/** Each format's name once, in Discogs' order: ["Vinyl", "CD"] for an LP-and-CD set. */
function formatNamesOf(formats: readonly { name: string }[]): string[] {
  return [...new Set(formats.map((f) => f.name))];
}

/** "2 × Vinyl, LP, Album, Blue Marbled": quantity, format, descriptions, free text. */
function formatLine(format: ReleaseResponse['formats'][number]): string {
  const qty = Number.parseInt(format.qty ?? '1', 10);
  const parts = [
    format.name,
    ...(format.descriptions ?? []),
    ...(format.text ? [format.text] : []),
  ];
  return `${qty > 1 ? `${qty} × ` : ''}${parts.join(', ')}`;
}

function toReleaseDetail(response: ReleaseResponse): ReleaseDetailData {
  const primary = response.images.find((i) => i.type === 'primary') ?? response.images[0];
  const label = response.labels[0];
  return {
    discogsId: response.id,
    title: response.title,
    artists: response.artists.map((a) => displayArtistName(a.name)),
    year: response.year !== undefined && response.year > 0 ? response.year : null,
    vinylColors: vinylColorsOf(response.formats),
    formatNames: formatNamesOf(response.formats),
    coverImageUrl: coverImage(primary?.uri),
    discogsUrl: discogsEndpoints.releasePage(response.id),
    label: label?.name ?? null,
    // Discogs writes "none" for releases without a catalogue number.
    catalogNumber: label?.catno && label.catno.toLowerCase() !== 'none' ? label.catno : null,
    genres: response.genres,
    styles: response.styles,
    formats: response.formats.map(formatLine),
    credits: response.extraartists.map((c) => ({ name: displayArtistName(c.name), role: c.role })),
    // Headings ("Side One") structure the list on Discogs but are not tracks.
    tracklist: response.tracklist
      .filter((t) => t.type_ === undefined || t.type_ === 'track')
      .map((t) => ({ position: t.position, title: t.title, duration: t.duration || null })),
    community: {
      rating: {
        // Two decimals is all Discogs shows, and keeps cached JSON stable.
        average: Math.round(response.community.rating.average * 100) / 100,
        count: response.community.rating.count,
      },
      have: response.community.have,
      want: response.community.want,
    },
  };
}

/**
 * Search gives "Artist - Title" as one string. Split on the first separator (titles may
 * contain " - " too), but keep the artist part whole: Discogs has already joined several
 * artists the way the sleeve does, and "Simon & Garfunkel" is one act, not two.
 */
function splitSearchTitle(title: string): { artists: string[]; title: string } {
  const at = title.indexOf(' - ');
  if (at === -1) return { artists: [], title };
  // A trailing "*" marks a name variation on Discogs; it is not part of the name.
  return {
    artists: [displayArtistName(title.slice(0, at).replace(/\*$/, ''))],
    title: title.slice(at + 3),
  };
}

function toSearchPage(response: SearchResponse): SearchPageData {
  return {
    page: response.pagination.page,
    pages: response.pagination.pages,
    totalResults: response.pagination.items,
    results: response.results
      .filter((r) => r.type === 'release')
      .map((r) => {
        const year = Number.parseInt(r.year ?? '', 10);
        const catno = r.catno?.trim();
        return {
          discogsId: r.id,
          ...splitSearchTitle(r.title),
          year: Number.isFinite(year) && year > 0 ? year : null,
          country: r.country || null,
          label: r.label[0] ?? null,
          // Discogs writes "none" for releases without a catalogue number.
          catalogNumber: catno && catno.toLowerCase() !== 'none' ? catno : null,
          formats: r.format,
          thumbUrl: coverImage(r.thumb),
          discogsUrl: discogsEndpoints.releasePage(r.id),
          inWantlist: r.user_data?.in_wantlist ?? false,
        };
      }),
  };
}
