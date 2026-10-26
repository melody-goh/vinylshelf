/**
 * The API as the web tests see it: MSW handlers whose bodies are typed with the
 * contract types, so the UI is built against the spec, not against whatever the
 * server happens to return (ADR 0001).
 */
import type {
  CollectionItem,
  CollectionPage,
  ImportJob,
  Release,
  ReleasePreviews,
  SearchPage,
  SearchResult,
  User,
} from '@vinylshelf/contract';
import { http, HttpResponse, type HttpHandler } from 'msw';
import { setupServer } from 'msw/node';

export const server = setupServer();

export const API = '*/api/v1';

export const fixtureUser: User = {
  id: '6f1c5f53-6e47-4a6b-9a55-2c1f1c0b7a10',
  discogsUsername: 'fixture_collector',
};

const HOUR = 60 * 60 * 1000;

export function collectionItem(
  instanceId: number,
  overrides: Partial<CollectionItem['release']> = {},
): CollectionItem {
  const now = Date.now();
  return {
    instanceId,
    dateAdded: '2026-09-14T15:09:33.000Z',
    release: {
      discogsId: 9000000 + instanceId,
      title: `Record ${instanceId}`,
      artists: ['The Paper Moons'],
      year: 2019,
      vinylColors: [],
      coverImageUrl: null,
      discogsUrl: `https://www.discogs.com/release/${9000000 + instanceId}`,
      fetchedAt: new Date(now - HOUR).toISOString(),
      expiresAt: new Date(now + 5 * HOUR).toISOString(),
      ...overrides,
    },
  };
}

export function page(overrides: Partial<CollectionPage> = {}): CollectionPage {
  return {
    items: [],
    nextCursor: null,
    totalItems: 0,
    otherFormatsCount: 0,
    refresh: { status: 'idle', importId: null, hiddenCount: 0, retryAt: null },
    ...overrides,
  };
}

export function importJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: '0b6c2e9e-5d0f-4d4f-8a52-7f5e2f5f1c11',
    status: 'running',
    progress: { fetched: 100, total: 250 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Signed in as the fixture user, with logout working. */
export function signedIn(): HttpHandler[] {
  return [
    http.get(`${API}/me`, () => HttpResponse.json(fixtureUser)),
    http.post(`${API}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  ];
}

export function signedOut(): HttpHandler[] {
  return [
    http.get(`${API}/me`, () =>
      HttpResponse.json(
        { type: '/problems/unauthenticated', title: 'Sign in required', status: 401 },
        { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
      ),
    ),
  ];
}

export function releaseDetail(discogsId: number, overrides: Partial<Release> = {}): Release {
  const now = Date.now();
  return {
    discogsId,
    title: `Record ${String(discogsId - 9000000)}`,
    artists: ['The Paper Moons'],
    year: 2019,
    vinylColors: [],
    coverImageUrl: null,
    discogsUrl: `https://www.discogs.com/release/${String(discogsId)}`,
    label: 'Fixture Records',
    catalogNumber: 'FX-001',
    genres: ['Rock'],
    styles: ['Indie Rock'],
    formats: ['Vinyl, LP, Album'],
    credits: [{ name: 'Ana Ferreira', role: 'Producer' }],
    tracklist: [
      { position: 'A1', title: 'Shoreline', duration: '4:12' },
      { position: 'A2', title: 'Undertow', duration: null },
    ],
    community: { rating: { average: 4.31, count: 212 }, have: 1840, want: 960 },
    fetchedAt: new Date(now - HOUR).toISOString(),
    expiresAt: new Date(now + 5 * HOUR).toISOString(),
    ...overrides,
  };
}

/** Release detail, and previews for every track, for any id. */
export function releases(): HttpHandler[] {
  return [
    http.get(`${API}/releases/:discogsId`, ({ params }) =>
      HttpResponse.json(releaseDetail(Number(params.discogsId))),
    ),
    http.get(`${API}/releases/:discogsId/previews`, ({ params }) =>
      HttpResponse.json(previews(Number(params.discogsId))),
    ),
  ];
}

/** Previews matching `releaseDetail`'s tracklist; pass nulls to leave tracks silent. */
export function previews(
  discogsId: number,
  urls: (string | null)[] = ['https://audio.example/a1.m4a', 'https://audio.example/a2.m4a'],
): ReleasePreviews {
  const now = Date.now();
  const tracklist = releaseDetail(discogsId).tracklist;
  const anyMatch = urls.some((url) => url !== null);
  return {
    discogsId,
    albumUrl: anyMatch ? `https://music.apple.com/album/${String(discogsId)}` : null,
    attribution: 'Previews provided courtesy of iTunes',
    tracks: tracklist.map((track, i) => ({
      position: track.position,
      previewUrl: urls[i] ?? null,
      storeUrl: urls[i] ? `https://music.apple.com/song/${String(i)}` : null,
    })),
    fetchedAt: new Date(now - HOUR).toISOString(),
    expiresAt: new Date(now + 23 * HOUR).toISOString(),
  };
}

/** One Discogs search result, as the API passes it through. */
export function searchResult(
  discogsId: number,
  overrides: Partial<SearchResult> = {},
): SearchResult {
  const now = Date.now();
  return {
    discogsId,
    title: `Found ${String(discogsId - 9000000)}`,
    artists: ['The Paper Moons'],
    year: 2019,
    country: 'UK',
    label: 'Fixture Records',
    catalogNumber: 'FX-001',
    formats: ['Vinyl', 'LP', 'Album'],
    thumbUrl: null,
    discogsUrl: `https://www.discogs.com/release/${String(discogsId)}`,
    inCollection: false,
    fetchedAt: new Date(now - HOUR).toISOString(),
    expiresAt: new Date(now + 5 * HOUR).toISOString(),
    ...overrides,
  };
}

export function searchPage(
  results: SearchResult[],
  overrides: Partial<SearchPage> = {},
): SearchPage {
  return { results, page: 1, pages: 1, totalResults: results.length, ...overrides };
}
