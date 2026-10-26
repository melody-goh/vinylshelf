import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { discogsFixtures, discogsHandlers, discogsUrls } from '../test/discogs-handlers.js';
import { fakeClock } from '../test/fake-clock.js';
import { mswServer } from '../test/msw.js';
import {
  DiscogsAuthError,
  DiscogsNotFoundError,
  DiscogsRateLimitedError,
  DiscogsSchemaError,
  DiscogsUnavailableError,
} from './errors.js';
import {
  COLLECTION_PAGE_SIZE,
  HttpDiscogsGateway,
  SEARCH_PAGE_SIZE,
  displayArtistName,
} from './http-gateway.js';
import { RateLimiter, type Lane } from '../lib/rate-limiter.js';
import { DISCOGS_REMAINING_HEADER } from './index.js';

const accessToken = { token: 'acc-token', secret: 'acc-secret' };

function makeGateway(clock = fakeClock()) {
  const limiter = new RateLimiter({ clock, remainingHeader: DISCOGS_REMAINING_HEADER });
  const gateway = new HttpDiscogsGateway({
    consumer: { key: 'ckey', secret: 'csecret' },
    userAgent: 'VinylShelfTest/0.0',
    limiter,
  });
  return { gateway, clock };
}

/** Captures the next request to a URL while still serving the default handlers. */
function capture(method: 'get' | 'post', url: string) {
  const seen: Request[] = [];
  mswServer.use(
    http[method](url, ({ request }) => {
      seen.push(request.clone());
      return undefined; // fall through to the fixture handler
    }),
    ...discogsHandlers(),
  );
  return seen;
}

describe('HttpDiscogsGateway: OAuth', () => {
  it('gets a request token, sending our callback in the signed header', async () => {
    const seen = capture('get', discogsUrls.requestToken);
    const { gateway } = makeGateway();

    const result = await gateway.getRequestToken('http://localhost:3000/cb');

    expect(result.token.token).toBe('RqTkn0000000000000000000000000000000000');
    expect(result.authorizeUrl).toBe(
      'https://www.discogs.com/oauth/authorize?oauth_token=RqTkn0000000000000000000000000000000000',
    );
    const auth = seen[0]?.headers.get('authorization') ?? '';
    expect(auth).toContain('oauth_callback="http%3A%2F%2Flocalhost%3A3000%2Fcb"');
    expect(auth).toContain('oauth_signature="csecret%26"');
    expect(seen[0]?.url).not.toContain('oauth_');
  });

  it('exchanges the verifier, signing with the request-token secret', async () => {
    const seen = capture('post', discogsUrls.accessToken);
    const { gateway } = makeGateway();

    const token = await gateway.getAccessToken({ token: 'rq', secret: 'rqsecret' }, 'v-123');

    expect(token).toEqual({
      token: 'AcTkn0000000000000000000000000000000000',
      secret: 'AcScrt000000000000000000000000000000000',
    });
    const auth = seen[0]?.headers.get('authorization') ?? '';
    expect(auth).toContain('oauth_verifier="v-123"');
    expect(auth).toContain('oauth_token="rq"');
    expect(auth).toContain('oauth_signature="csecret%26rqsecret"');
  });

  it('rejects a request-token response that did not confirm the callback', async () => {
    mswServer.use(
      http.get(
        discogsUrls.requestToken,
        () => new HttpResponse('oauth_token=a&oauth_token_secret=b&oauth_callback_confirmed=false'),
      ),
    );
    await expect(makeGateway().gateway.getRequestToken('http://x/cb')).rejects.toBeInstanceOf(
      DiscogsSchemaError,
    );
  });

  it('returns the identity of the token owner', async () => {
    mswServer.use(...discogsHandlers());
    await expect(makeGateway().gateway.getIdentity(accessToken)).resolves.toEqual({
      id: 1000001,
      username: 'fixture_collector',
    });
  });
});

describe('HttpDiscogsGateway: collection', () => {
  it('requests the largest page, newest first, with a descriptive User-Agent', async () => {
    const seen = capture('get', discogsUrls.collection);
    await makeGateway().gateway.getCollectionPage(accessToken, 'fixture collector', 1);

    const url = new URL(seen[0]?.url ?? '');
    expect(url.pathname).toBe('/users/fixture%20collector/collection/folders/0/releases');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '1',
      per_page: String(COLLECTION_PAGE_SIZE),
      sort: 'added',
      sort_order: 'desc',
    });
    expect(seen[0]?.headers.get('user-agent')).toBe('VinylShelfTest/0.0');
  });

  it('maps Discogs releases into clean domain entries', async () => {
    mswServer.use(...discogsHandlers());
    const page = await makeGateway().gateway.getCollectionPage(accessToken, 'fixture_collector', 1);

    expect(page).toMatchObject({ page: 1, pages: 2, totalItems: 3 });
    expect(page.entries).toEqual([
      {
        instanceId: 2100000001,
        releaseId: 9000001,
        dateAdded: new Date('2026-09-14T15:09:33Z'),
        release: {
          discogsId: 9000001,
          title: 'Tidal Lines',
          artists: ['The Paper Moons'],
          year: 2019,
          vinylColors: ['Blue Marbled'],
          coverImageUrl: 'https://i.discogs.com/fixture/cover-9000001.jpg',
          discogsUrl: 'https://www.discogs.com/release/9000001',
        },
      },
      {
        instanceId: 2100000002,
        releaseId: 9000002,
        dateAdded: new Date('2026-08-01T11:00:00Z'),
        release: {
          discogsId: 9000002,
          title: 'Night Bus Recordings',
          artists: ['Nightshade', 'Ana Ferreira'],
          year: null,
          vinylColors: [],
          coverImageUrl: null,
          discogsUrl: 'https://www.discogs.com/release/9000002',
        },
      },
    ]);
  });

  it('reports exactly which field drifted when Discogs changes shape', async () => {
    const drifted = discogsFixtures.collectionPage(1);
    const first = drifted.releases[0] as { instance_id: unknown };
    first.instance_id = 'not-a-number';
    mswServer.use(http.get(discogsUrls.collection, () => HttpResponse.json(drifted)));

    const error = await makeGateway()
      .gateway.getCollectionPage(accessToken, 'fixture_collector', 1)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DiscogsSchemaError);
    expect((error as DiscogsSchemaError).issues.join()).toContain('releases.0.instance_id');
    expect((error as DiscogsSchemaError).retryable).toBe(false);
  });
});

describe('HttpDiscogsGateway: failures', () => {
  it('maps 401 to an auth error that is not retryable', async () => {
    mswServer.use(http.get(discogsUrls.identity, () => HttpResponse.json({}, { status: 401 })));
    const error = await makeGateway()
      .gateway.getIdentity(accessToken)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DiscogsAuthError);
    expect((error as DiscogsAuthError).retryable).toBe(false);
  });

  it('maps 5xx and network failures to a retryable unavailable error', async () => {
    mswServer.use(http.get(discogsUrls.identity, () => new HttpResponse(null, { status: 502 })));
    await expect(makeGateway().gateway.getIdentity(accessToken)).rejects.toBeInstanceOf(
      DiscogsUnavailableError,
    );

    mswServer.use(http.get(discogsUrls.identity, () => HttpResponse.error()));
    await expect(makeGateway().gateway.getIdentity(accessToken)).rejects.toBeInstanceOf(
      DiscogsUnavailableError,
    );
  });

  it('waits out a 429 through the limiter and retries', async () => {
    let calls = 0;
    mswServer.use(
      http.get(discogsUrls.identity, () => {
        calls++;
        return calls === 1
          ? HttpResponse.json({}, { status: 429, headers: { 'Retry-After': '7' } })
          : HttpResponse.json(discogsFixtures.identity());
      }),
    );
    const { gateway, clock } = makeGateway();

    await expect(gateway.getIdentity(accessToken)).resolves.toMatchObject({ id: 1000001 });
    expect(calls).toBe(2);
    expect(clock.time).toBeGreaterThanOrEqual(7000);
  });

  it('gives up with a rate-limit error when 429s persist', async () => {
    let calls = 0;
    mswServer.use(
      http.get(discogsUrls.identity, () => {
        calls++;
        return HttpResponse.json({}, { status: 429, headers: { 'Retry-After': '1' } });
      }),
    );
    const error = await makeGateway()
      .gateway.getIdentity(accessToken)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DiscogsRateLimitedError);
    expect((error as DiscogsRateLimitedError).retryAfterSeconds).toBe(1);
    expect(calls).toBe(3);
  });
});

describe('displayArtistName', () => {
  it("strips Discogs' numeric disambiguation suffix only", () => {
    expect(displayArtistName('Nightshade (2)')).toBe('Nightshade');
    expect(displayArtistName('Sunn O)))')).toBe('Sunn O)))');
    expect(displayArtistName('Love (Band)')).toBe('Love (Band)');
  });
});

describe('HttpDiscogsGateway: rate-limit lanes', () => {
  it('runs collection pages in the background lane, and login and release calls in the interactive lane', async () => {
    mswServer.use(...discogsHandlers());
    const lanes: string[] = [];
    class RecordingLimiter extends RateLimiter {
      override acquire(lane: Lane = 'interactive'): Promise<void> {
        lanes.push(lane);
        return super.acquire(lane);
      }
    }
    const gateway = new HttpDiscogsGateway({
      consumer: { key: 'ckey', secret: 'csecret' },
      userAgent: 'VinylShelfTest/0.0',
      limiter: new RecordingLimiter({ clock: fakeClock() }),
    });

    await gateway.getRequestToken('http://localhost:3000/cb');
    await gateway.getIdentity(accessToken);
    await gateway.getCollectionPage(accessToken, 'fixture_collector', 1);
    await gateway.getRelease(accessToken, 9000001);

    expect(lanes).toEqual(['interactive', 'interactive', 'background', 'interactive']);
  });
});

describe('HttpDiscogsGateway: release detail', () => {
  it('maps a release into the detail the record view needs', async () => {
    mswServer.use(...discogsHandlers());
    const release = await makeGateway().gateway.getRelease(accessToken, 9000001);

    expect(release).toEqual({
      discogsId: 9000001,
      title: 'Tidal Lines',
      artists: ['The Paper Moons'],
      year: 2019,
      vinylColors: ['Blue Marbled'],
      coverImageUrl: 'https://i.discogs.com/fixture/cover-9000001.jpg',
      discogsUrl: 'https://www.discogs.com/release/9000001',
      label: 'Fixture Records',
      catalogNumber: 'FX-001',
      genres: ['Rock'],
      styles: ['Indie Rock', 'Dream Pop'],
      formats: ['Vinyl, LP, Album, Limited Edition, Blue Marbled, 180g'],
      credits: [
        { name: 'Ana Ferreira', role: 'Producer' },
        { name: 'Ivo Marsh', role: 'Mastered By' },
      ],
      // The "Side One" heading is not a track; an empty duration is unknown.
      tracklist: [
        { position: 'A1', title: 'Shoreline', duration: '4:12' },
        { position: 'A2', title: 'Undertow', duration: '3:48' },
        { position: 'B1', title: 'Low Tide Radio', duration: null },
        { position: 'B2', title: 'Salt', duration: '5:01' },
      ],
      community: { rating: { average: 4.31, count: 212 }, have: 1840, want: 960 },
    });
  });

  it('reads a release without community data as unrated, owned by no one', async () => {
    const release = discogsFixtures.release(9000001);
    delete release.community;
    mswServer.use(http.get(discogsUrls.release, () => HttpResponse.json(release)));

    const detail = await makeGateway().gateway.getRelease(accessToken, 9000001);

    expect(detail.community).toEqual({ rating: { average: 0, count: 0 }, have: 0, want: 0 });
  });

  it('treats "none" as no catalogue number and counts multi-disc formats', async () => {
    const release = discogsFixtures.release(9000001);
    release.labels = [{ name: 'Not On Label', catno: 'none' }];
    release.formats = [{ name: 'Vinyl', qty: '2', descriptions: ['LP'] }];
    mswServer.use(http.get(discogsUrls.release, () => HttpResponse.json(release)));

    const detail = await makeGateway().gateway.getRelease(accessToken, 9000001);

    expect(detail.catalogNumber).toBeNull();
    expect(detail.formats).toEqual(['2 × Vinyl, LP']);
    expect(detail.vinylColors).toEqual([]);
  });

  it('reports a release Discogs does not have as not found', async () => {
    mswServer.use(...discogsHandlers());
    await expect(makeGateway().gateway.getRelease(accessToken, 1)).rejects.toBeInstanceOf(
      DiscogsNotFoundError,
    );
  });
});

describe('HttpDiscogsGateway: search', () => {
  it('searches vinyl releases only, signed, on the interactive lane', async () => {
    const seen = capture('get', discogsUrls.search);
    await makeGateway().gateway.searchReleases(accessToken, 'tidal lines', 2);

    const url = new URL(seen[0]?.url ?? '');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'tidal lines',
      type: 'release',
      format: 'Vinyl',
      page: '2',
      per_page: String(SEARCH_PAGE_SIZE),
    });
  });

  it('maps results into clean domain entries and drops masters', async () => {
    mswServer.use(...discogsHandlers());
    const page = await makeGateway().gateway.searchReleases(accessToken, 'tidal', 1);

    expect(page).toMatchObject({ page: 1, pages: 1, totalResults: 3 });
    expect(page.results).toEqual([
      {
        discogsId: 9000001,
        title: 'Tidal Lines',
        artists: ['The Paper Moons'],
        year: 2019,
        country: 'UK',
        label: 'Fixture Records',
        catalogNumber: 'FX-001',
        formats: ['Vinyl', 'LP', 'Album', 'Limited Edition'],
        thumbUrl: 'https://i.discogs.com/fixture/thumb-9000001.jpg',
        discogsUrl: 'https://www.discogs.com/release/9000001',
      },
      {
        // The name-variation "*" and the "(2)" suffix go; only the first " - " splits.
        discogsId: 9000099,
        title: 'Night Bus - Recordings',
        artists: ['Nightshade'],
        year: null,
        country: 'US',
        label: 'Lamplight',
        catalogNumber: null,
        formats: ['Vinyl', 'LP'],
        thumbUrl: null,
        discogsUrl: 'https://www.discogs.com/release/9000099',
      },
    ]);
  });
});

describe('HttpDiscogsGateway: adding to the collection', () => {
  it('adds one copy to folder 1 and returns its instance id', async () => {
    const seen = capture('post', discogsUrls.addToCollection);
    const result = await makeGateway().gateway.addToCollection(
      accessToken,
      'fixture_collector',
      9000001,
    );

    expect(result).toEqual({ instanceId: 2100000099 });
    expect(seen[0]?.url).toBe(
      'https://api.discogs.com/users/fixture_collector/collection/folders/1/releases/9000001',
    );
    expect(seen[0]?.headers.get('authorization')).toContain('oauth_token="acc-token"');
  });

  it('never retries a write on 429, since Discogs may have added the copy', async () => {
    let calls = 0;
    mswServer.use(
      http.post(discogsUrls.addToCollection, () => {
        calls++;
        return HttpResponse.json({}, { status: 429, headers: { 'Retry-After': '3' } });
      }),
    );
    await expect(
      makeGateway().gateway.addToCollection(accessToken, 'fixture_collector', 9000001),
    ).rejects.toBeInstanceOf(DiscogsRateLimitedError);
    expect(calls).toBe(1);
  });
});
