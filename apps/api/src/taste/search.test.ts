import type { TasteSearch } from '@vinylshelf/contract';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX, type AppDependencies } from '../app.js';
import { collectionItems, tasteFeedback } from '../db/schema.js';
import { buildTestApp, TEST_NOW, testConfig } from '../test/app.js';
import { circle, seedCatalogue, testWorld } from '../test/catalogue.js';
import { useTestDatabase } from '../test/database.js';
import { createUser, sessionFor } from '../test/factories.js';
import { createFakeEmbedder } from './embedder.js';
import type { SyntheticWorld } from './eval/synthetic.js';
import { lazyQueryEmbedder } from './query-embedder.js';
import { nameMatch, searchWords } from './search.js';

const { db, handle } = useTestDatabase();

let app: FastifyInstance;
let deps: AppDependencies;
let sid: string;
let userId: string;
let world: SyntheticWorld;

async function start(overrides: Partial<AppDependencies> = {}) {
  ({ app, deps } = await buildTestApp(handle(), overrides));
  userId = (await createUser(deps)).id;
  sid = await sessionFor(deps, userId);
}

beforeEach(async () => {
  world = await testWorld();
  await start();
});

afterEach(async () => {
  await app.close();
});

const search = (q: string, cookie: string | null = sid) =>
  app.inject({
    method: 'GET',
    url: `${API_PREFIX}/taste/search?q=${encodeURIComponent(q)}`,
    headers: { origin: testConfig.webOrigin },
    cookies: cookie === null ? {} : { sid: cookie },
  });

/** A scene's three styles: what a description of that scene's sound would say. */
const sceneStyles = (scene: number) => {
  const styles = new Map<string, number>();
  for (const id of circle(world, `${String(scene)}/0`)) {
    for (const style of world.catalogue.find((r) => r.id === id)?.styles ?? []) {
      styles.set(style, (styles.get(style) ?? 0) + 1);
    }
  }
  return [...styles.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s]) => s);
};

describe('GET /taste/search', () => {
  it('finds records whose sound fits the description', async () => {
    await seedCatalogue(db(), world);
    const styles = sceneStyles(1);

    const res = await search(styles.join(' '));

    expect(res.statusCode).toBe(200);
    const body = res.json<TasteSearch>();
    expect(body.status).toBe('ready');
    const top = body.results.slice(0, 5);
    expect(top).toHaveLength(5);
    for (const hit of top) {
      expect(hit.master.styles.some((s) => styles.includes(s))).toBe(true);
      expect(hit.reason.sound.length).toBeGreaterThan(0);
    }
    const artists = body.results.map((r) => r.master.artists[0]);
    expect(new Set(artists).size).toBe(artists.length);
  });

  it('leaves out records on the shelf and records marked not for me', async () => {
    await seedCatalogue(db(), world);
    const styles = sceneStyles(1);
    const first = (await search(styles.join(' '))).json<TasteSearch>().results;
    const [owned, rejected] = first.map((r) => r.master.masterId);
    if (owned === undefined || rejected === undefined) throw new Error('expected results');
    await db()
      .insert(collectionItems)
      .values({
        userId,
        instanceId: 1,
        releaseId: 7_000_000,
        masterId: owned,
        dateAdded: new Date(TEST_NOW),
      });
    await db()
      .insert(tasteFeedback)
      .values({ userId, masterId: rejected, verdict: 'less', createdAt: new Date(TEST_NOW) });

    const ids = (await search(styles.join(' ')))
      .json<TasteSearch>()
      .results.map((r) => r.master.masterId);

    expect(ids).not.toContain(owned);
    expect(ids).not.toContain(rejected);
  });

  it('says there is no catalogue when none is loaded', async () => {
    expect((await search('modal jazz')).json()).toEqual({
      status: 'no_catalogue',
      query: 'modal jazz',
      results: [],
    });
  });

  it('reports search as unavailable without a model, or with the wrong one', async () => {
    await seedCatalogue(db(), world);
    await app.close();
    await start({
      queryEmbedder: lazyQueryEmbedder(() => Promise.reject(new Error('no weights'))),
    });
    expect((await search('modal jazz')).json()).toMatchObject({
      status: 503,
      code: 'search_unavailable',
    });

    await app.close();
    await start({
      queryEmbedder: lazyQueryEmbedder(() => Promise.resolve(createFakeEmbedder(64))),
    });
    expect((await search('modal jazz')).statusCode).toBe(503);
  });

  it('needs a description of two characters or more, and sign-in', async () => {
    expect((await search('a')).statusCode).toBe(400);
    expect((await search('modal jazz', null)).statusCode).toBe(401);
  });
});

describe('matching style and genre names', () => {
  it('keeps the words that describe a sound, as style names spell them', () => {
    expect(searchWords('Some dreamy music from the Chicago house scene')).toEqual([
      'dream',
      'chicago',
      'house',
      'scene',
    ]);
  });

  it('scores the share of words a record’s style and genre names hold, never its title', () => {
    const row = { styles: ['Deep House'], genres: ['Electronic'], title: 'Chicago' };
    expect(nameMatch(row as never, ['chicago', 'house'])).toBe(0.5);
    expect(nameMatch(row as never, [])).toBe(0);
  });
});
