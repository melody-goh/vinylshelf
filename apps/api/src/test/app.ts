/**
 * Builds the real app for route tests: real routes, services and test database,
 * Discogs served by MSW fixtures, a recording fake queue and a controllable clock.
 */
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDependencies } from '../app.js';
import type { Config } from '../config.js';
import { TokenCipher } from '../crypto/token-cipher.js';
import type { DatabaseHandle } from '../db/client.js';
import { DiscogsReleaseCache } from '../discogs/cache.js';
import { createDiscogsGateway } from '../discogs/index.js';
import { createITunesGateway } from '../itunes/index.js';
import type { EnqueueOptions, JobPayloads, JobQueue, QueueName } from '../jobs/queue.js';
import { fakeClock } from './fake-clock.js';
import { CATALOGUE_DIMS } from '../db/schema.js';
import { createFakeEmbedder } from '../taste/embedder.js';
import { lazyQueryEmbedder } from '../taste/query-embedder.js';

/** 2026-10-23T12:00:00Z: a fixed "now" so expiry maths is deterministic. */
export const TEST_NOW = Date.UTC(2026, 9, 23, 12, 0, 0);

export const testConfig: Config = {
  nodeEnv: 'test',
  port: 0,
  host: '127.0.0.1',
  logLevel: 'silent',
  webOrigin: 'http://localhost:5173',
  databaseUrl: 'postgres://unused',
  tokenEncryptionKey: Buffer.alloc(32, 9),
  discogs: {
    consumerKey: 'ckey',
    consumerSecret: 'csecret',
    callbackUrl: 'http://localhost:3000/api/v1/auth/discogs/callback',
    userAgent: 'VinylShelfTest/0.0',
    cacheTtlSeconds: 6 * 60 * 60,
    refreshAfterSeconds: 5 * 60 * 60,
  },
  refreshCooldownMinutes: 15,
  itunes: { country: 'GB' },
  queue: { pollingIntervalSeconds: 2, cachePurgeCron: '*/15 * * * *' },
};

/** Records enqueued jobs instead of running them. Workers are tested directly. */
export class FakeQueue implements JobQueue {
  readonly enqueued: { name: QueueName; data: unknown; options: EnqueueOptions }[] = [];

  start(): Promise<void> {
    return Promise.resolve();
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }
  enqueue<N extends QueueName>(
    name: N,
    data: JobPayloads[N],
    options: EnqueueOptions = {},
  ): Promise<void> {
    this.enqueued.push({ name, data, options });
    return Promise.resolve();
  }
  work(): Promise<void> {
    return Promise.resolve();
  }
  schedule(): Promise<void> {
    return Promise.resolve();
  }
}

export function testDependencies(
  database: DatabaseHandle,
  overrides: Partial<AppDependencies> = {},
): AppDependencies {
  const clock = fakeClock(TEST_NOW);
  return {
    config: testConfig,
    database,
    clock,
    cipher: new TokenCipher(testConfig.tokenEncryptionKey),
    gateway: createDiscogsGateway({
      consumer: { key: testConfig.discogs.consumerKey, secret: testConfig.discogs.consumerSecret },
      userAgent: testConfig.discogs.userAgent,
      clock,
    }),
    itunes: createITunesGateway({
      country: testConfig.itunes.country,
      userAgent: testConfig.discogs.userAgent,
      clock,
    }),
    queue: new FakeQueue(),
    releaseCache: new DiscogsReleaseCache(testConfig.discogs.cacheTtlSeconds, clock),
    // The test catalogue is built with the same fake embedder (test/catalogue.ts).
    queryEmbedder: lazyQueryEmbedder(() => Promise.resolve(createFakeEmbedder(CATALOGUE_DIMS))),
    ...overrides,
  };
}

export async function buildTestApp(
  database: DatabaseHandle,
  overrides: Partial<AppDependencies> = {},
): Promise<{ app: FastifyInstance; deps: AppDependencies }> {
  const deps = testDependencies(database, overrides);
  return { app: await buildApp(deps), deps };
}
