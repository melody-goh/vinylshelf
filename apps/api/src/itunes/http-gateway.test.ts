import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../lib/rate-limiter.js';
import { fakeClock } from '../test/fake-clock.js';
import { itunesHandlers, itunesUrls } from '../test/itunes-handlers.js';
import { mswServer } from '../test/msw.js';
import { ITunesRateLimitedError, ITunesUnavailableError } from './errors.js';
import { HttpITunesGateway } from './http-gateway.js';

const gateway = () =>
  new HttpITunesGateway({
    country: 'GB',
    userAgent: 'VinylShelfTest/0.0',
    limiter: new RateLimiter({ limit: 20, reservedForInteractive: 0, clock: fakeClock() }),
  });

describe('HttpITunesGateway', () => {
  it('searches albums in the configured storefront and keeps only albums', async () => {
    const seen: URL[] = [];
    mswServer.use(
      http.get(itunesUrls.search, ({ request }) => {
        seen.push(new URL(request.url));
        return undefined;
      }),
      ...itunesHandlers(),
    );

    const albums = await gateway().searchAlbums('The Paper Moons Tidal Lines');

    expect(Object.fromEntries(seen[0]?.searchParams ?? [])).toEqual({
      term: 'The Paper Moons Tidal Lines',
      media: 'music',
      entity: 'album',
      country: 'GB',
      limit: '10',
    });
    expect(albums.map((a) => [a.collectionId, a.title, a.trackCount])).toEqual([
      [1700000001, 'Tidal Lines (Deluxe Edition)', 6],
      [1700000002, 'Tidal Lines', 4],
      [1700000003, 'Tidal Lines', 4],
    ]);
  });

  it('lists an album’s songs without the album entry, with or without previews', async () => {
    mswServer.use(...itunesHandlers());
    const songs = await gateway().albumSongs(1700000002);

    expect(songs.map((s) => [s.trackNumber, s.title, s.previewUrl !== null])).toEqual([
      [1, 'Shoreline', true],
      [2, 'Undertow (2019 Remaster)', true],
      [3, 'Low Tide Radio', false],
      [4, 'Salt', true],
    ]);
  });

  it('reads 403 and 429 as Apple’s rate limit, and 5xx or junk as unavailable', async () => {
    mswServer.use(http.get(itunesUrls.search, () => new HttpResponse(null, { status: 403 })));
    await expect(gateway().searchAlbums('x')).rejects.toBeInstanceOf(ITunesRateLimitedError);

    mswServer.use(http.get(itunesUrls.search, () => new HttpResponse(null, { status: 502 })));
    await expect(gateway().searchAlbums('x')).rejects.toBeInstanceOf(ITunesUnavailableError);

    mswServer.use(http.get(itunesUrls.search, () => new HttpResponse('<html>')));
    await expect(gateway().searchAlbums('x')).rejects.toBeInstanceOf(ITunesUnavailableError);
  });
});
