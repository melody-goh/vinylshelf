/**
 * Detects drift between our hand-built Discogs fixtures and the real API. It fetches
 * one live response per endpoint and compares their *shape* (field paths and types)
 * with the fixtures, and runs them through the gateway's Zod schemas.
 *
 * Only structure is reported, never values: the live data is a real user's collection,
 * which is Restricted Data (ADR 0004). Nothing is written to disk.
 */
import { readFile } from 'node:fs/promises';
import type { z } from 'zod';
import { discogsEndpoints } from './endpoints.js';
import type { TokenPair } from './gateway.js';
import { authorizationHeader, type ConsumerCredentials } from './oauth1.js';
import { RateLimiter } from './rate-limiter.js';
import { collectionReleasesResponse, identityResponse } from './schemas.js';

/** Field paths with JSON types, e.g. `releases[].basic_information.year: number`. */
export function shapeOf(value: unknown, path = '', into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    into.add(`${path}: array`);
    for (const item of value) shapeOf(item, `${path}[]`, into);
  } else if (value !== null && typeof value === 'object') {
    into.add(`${path || '(root)'}: object`);
    for (const [key, child] of Object.entries(value)) {
      shapeOf(child, path ? `${path}.${key}` : key, into);
    }
  } else {
    into.add(`${path}: ${value === null ? 'null' : typeof value}`);
  }
  return into;
}

export interface ShapeReport {
  endpoint: string;
  /** In the live response, absent from the fixture: the fixture is incomplete. */
  missingFromFixture: string[];
  /** In the fixture, not seen live: possibly removed, or just absent from this sample. */
  notSeenLive: string[];
  /** Live response failures against the gateway's Zod schema: these break imports. */
  schemaIssues: string[];
}

export function compareShapes(
  endpoint: string,
  live: unknown,
  fixture: unknown,
  schema: z.ZodType,
): ShapeReport {
  const liveShape = shapeOf(live);
  const fixtureShape = shapeOf(fixture);
  const result = schema.safeParse(live);
  return {
    endpoint,
    // Insertion order is depth-first, so each field is listed right after its parent.
    missingFromFixture: [...liveShape].filter((p) => !fixtureShape.has(p)),
    notSeenLive: [...fixtureShape].filter((p) => !liveShape.has(p)),
    schemaIssues: result.success
      ? []
      : result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

export interface FixtureCheckOptions {
  consumer: ConsumerCredentials;
  userAgent: string;
  accessToken: TokenPair;
  username: string;
  fixturesDir: URL;
}

/** Makes two live calls (identity, one small collection page) and compares each. */
export async function checkFixtureShapes(options: FixtureCheckOptions): Promise<ShapeReport[]> {
  const limiter = new RateLimiter();
  const get = async (url: string): Promise<unknown> => {
    await limiter.acquire();
    const res = await fetch(url, {
      headers: {
        'User-Agent': options.userAgent,
        Accept: 'application/json',
        Authorization: authorizationHeader({
          consumer: options.consumer,
          token: options.accessToken,
        }),
      },
      signal: AbortSignal.timeout(15_000),
    });
    limiter.observe(res.status, res.headers);
    if (!res.ok) throw new Error(`Discogs returned ${res.status} for ${new URL(url).pathname}`);
    return res.json();
  };
  const fixture = async (name: string): Promise<unknown> =>
    JSON.parse(await readFile(new URL(name, options.fixturesDir), 'utf8'));

  const collectionUrl = new URL(discogsEndpoints.collectionReleases(options.username));
  collectionUrl.searchParams.set('page', '1');
  collectionUrl.searchParams.set('per_page', '5');

  return [
    compareShapes(
      'oauth/identity',
      await get(discogsEndpoints.identity),
      await fixture('identity.json'),
      identityResponse,
    ),
    compareShapes(
      'users/:username/collection/folders/0/releases',
      await get(collectionUrl.toString()),
      await fixture('collection-page-1.json'),
      collectionReleasesResponse,
    ),
  ];
}
