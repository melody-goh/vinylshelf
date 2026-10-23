/**
 * MSW handlers that stand in for Discogs, serving the hand-built fixtures in
 * fixtures/discogs. Like the real API, they reject requests that are not OAuth-signed
 * or carry no User-Agent, so the tests prove our requests are well formed.
 */
import { readFileSync } from 'node:fs';
import { http, HttpResponse, type HttpHandler } from 'msw';
import { DISCOGS_API_BASE } from '../discogs/endpoints.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/discogs/${name}`, import.meta.url), 'utf8');

export const discogsFixtures = {
  requestToken: () => fixture('request-token.txt').trim(),
  accessToken: () => fixture('access-token.txt').trim(),
  identity: () => JSON.parse(fixture('identity.json')) as Record<string, unknown>,
  collectionPage: (page: number) =>
    JSON.parse(fixture(`collection-page-${page}.json`)) as {
      pagination: Record<string, unknown>;
      releases: Record<string, unknown>[];
    },
};

export const discogsUrls = {
  requestToken: `${DISCOGS_API_BASE}/oauth/request_token`,
  accessToken: `${DISCOGS_API_BASE}/oauth/access_token`,
  identity: `${DISCOGS_API_BASE}/oauth/identity`,
  collection: `${DISCOGS_API_BASE}/users/:username/collection/folders/0/releases`,
};

/** Discogs answers unsigned or anonymous requests with an error; so do we. */
function rejectUnlessSigned(request: Request): Response | undefined {
  const auth = request.headers.get('authorization') ?? '';
  if (!request.headers.get('user-agent')) {
    return HttpResponse.json({ message: 'User-Agent required' }, { status: 403 });
  }
  if (!auth.startsWith('OAuth ') || !auth.includes('oauth_signature_method="PLAINTEXT"')) {
    return HttpResponse.json({ message: 'You must authenticate.' }, { status: 401 });
  }
  return undefined;
}

const form = (body: string): Response =>
  new HttpResponse(body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

/** Happy-path Discogs: tokens, identity and a two-page collection. */
export function discogsHandlers(): HttpHandler[] {
  return [
    http.get(
      discogsUrls.requestToken,
      ({ request }) => rejectUnlessSigned(request) ?? form(discogsFixtures.requestToken()),
    ),
    http.post(
      discogsUrls.accessToken,
      ({ request }) => rejectUnlessSigned(request) ?? form(discogsFixtures.accessToken()),
    ),
    http.get(
      discogsUrls.identity,
      ({ request }) => rejectUnlessSigned(request) ?? HttpResponse.json(discogsFixtures.identity()),
    ),
    http.get(discogsUrls.collection, ({ request }) => {
      const rejected = rejectUnlessSigned(request);
      if (rejected) return rejected;
      const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
      if (page !== 1 && page !== 2) {
        return HttpResponse.json({ message: 'Page out of range' }, { status: 404 });
      }
      return HttpResponse.json(discogsFixtures.collectionPage(page), {
        headers: { 'X-Discogs-Ratelimit-Remaining': '59' },
      });
    }),
  ];
}
