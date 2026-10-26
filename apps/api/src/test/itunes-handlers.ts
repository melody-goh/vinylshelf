/**
 * MSW handlers that stand in for the iTunes Search API, serving the hand-built fixtures
 * in fixtures/itunes. Tests never reach Apple (CLAUDE.md).
 */
import { readFileSync } from 'node:fs';
import { http, HttpResponse, type HttpHandler } from 'msw';
import { itunesEndpoints } from '../itunes/endpoints.js';

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`./fixtures/itunes/${name}`, import.meta.url), 'utf8')) as Record<
    string,
    unknown
  >;

export const itunesUrls = { search: itunesEndpoints.search, lookup: itunesEndpoints.lookup };

/** Every search finds the fixture albums; only the matching album has songs. */
export function itunesHandlers(): HttpHandler[] {
  return [
    http.get(itunesUrls.search, () => HttpResponse.json(fixture('search-albums.json'))),
    http.get(itunesUrls.lookup, ({ request }) =>
      new URL(request.url).searchParams.get('id') === '1700000002'
        ? HttpResponse.json(fixture('lookup-1700000002.json'))
        : HttpResponse.json({ resultCount: 0, results: [] }),
    ),
  ];
}
