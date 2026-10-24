import type { RateLimiter } from '../lib/rate-limiter.js';
import { ITunesRateLimitedError, ITunesUnavailableError } from './errors.js';
import { itunesEndpoints } from './endpoints.js';
import type { ITunesGateway, StoreAlbum, StoreSong } from './gateway.js';
import { albumResult, resultsEnvelope, songResult } from './schemas.js';

const REQUEST_TIMEOUT_MS = 10_000;
/** A few candidates is enough to find the right album; Apple ranks them. */
const ALBUM_CANDIDATES = 10;

export interface HttpITunesGatewayOptions {
  /** The storefront, e.g. "US" (ADR 0010 §6). */
  country: string;
  userAgent: string;
  limiter: RateLimiter;
}

/**
 * The real iTunes Search API: no key, a limiter at Apple's published rate, a timeout per
 * request and validation of every response. Nothing is retried here; the caller caches
 * the outcome, including failures it can live with.
 */
export class HttpITunesGateway implements ITunesGateway {
  constructor(private readonly options: HttpITunesGatewayOptions) {}

  async searchAlbums(term: string): Promise<StoreAlbum[]> {
    const url = new URL(itunesEndpoints.search);
    url.searchParams.set('term', term);
    url.searchParams.set('media', 'music');
    url.searchParams.set('entity', 'album');
    url.searchParams.set('country', this.options.country);
    url.searchParams.set('limit', String(ALBUM_CANDIDATES));

    const parsed = resultsEnvelope.safeParse(await this.get(url, 'search'));
    if (!parsed.success) throw new ITunesUnavailableError('iTunes search: unexpected response');
    return parsed.data.results.flatMap((result) => {
      const found = albumResult.safeParse(result);
      if (!found.success) return [];
      return [
        {
          collectionId: found.data.collectionId,
          title: found.data.collectionName,
          artist: found.data.artistName,
          trackCount: found.data.trackCount,
          storeUrl: found.data.collectionViewUrl,
        },
      ];
    });
  }

  async albumSongs(collectionId: number): Promise<StoreSong[]> {
    const url = new URL(itunesEndpoints.lookup);
    url.searchParams.set('id', String(collectionId));
    url.searchParams.set('entity', 'song');
    url.searchParams.set('country', this.options.country);

    const parsed = resultsEnvelope.safeParse(await this.get(url, 'lookup'));
    if (!parsed.success) throw new ITunesUnavailableError('iTunes lookup: unexpected response');
    return parsed.data.results.flatMap((result) => {
      const found = songResult.safeParse(result);
      if (!found.success || (found.data.kind && found.data.kind !== 'song')) return [];
      return [
        {
          title: found.data.trackName,
          discNumber: found.data.discNumber,
          trackNumber: found.data.trackNumber,
          previewUrl: found.data.previewUrl ?? null,
          storeUrl: found.data.trackViewUrl,
        },
      ];
    });
  }

  private async get(url: URL, endpoint: string): Promise<unknown> {
    const { limiter, userAgent } = this.options;
    await limiter.acquire('interactive');

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new ITunesUnavailableError(`iTunes ${endpoint} unreachable`, { cause: error });
    }
    limiter.observe(response.status, response.headers);
    const body = await response.text();

    // Apple answers callers over its limit with 403 (sometimes 429), not a quota header.
    if (response.status === 403 || response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      throw new ITunesRateLimitedError(
        `iTunes ${endpoint} returned ${response.status}`,
        Number.isFinite(retryAfter) ? retryAfter : null,
      );
    }
    if (!response.ok) {
      throw new ITunesUnavailableError(`iTunes ${endpoint} returned ${response.status}`);
    }
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new ITunesUnavailableError(`iTunes ${endpoint}: body is not JSON`);
    }
  }
}
