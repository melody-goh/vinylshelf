/**
 * Composition root: the only module that reads the environment and wires real
 * infrastructure into the app. Everything else receives its dependencies.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { UserRepository } from './auth/users.js';
import { runImport } from './collection/import-worker.js';
import { loadConfig } from './config.js';
import { TokenCipher } from './crypto/token-cipher.js';
import { createDatabase } from './db/client.js';
import { DiscogsReleaseCache } from './discogs/cache.js';
import { createDiscogsGateway } from './discogs/index.js';
import { createITunesGateway } from './itunes/index.js';
import { scheduleCachePurge } from './jobs/cache-purge.js';
import { PgBossQueue, QUEUES } from './jobs/queue.js';
import { systemClock } from './lib/clock.js';

// Local development reads the repo-root .env; deployed environments set real variables.
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig();
const clock = systemClock;
const database = createDatabase(config.databaseUrl);
const gateway = createDiscogsGateway({
  consumer: { key: config.discogs.consumerKey, secret: config.discogs.consumerSecret },
  userAgent: config.discogs.userAgent,
});
const itunes = createITunesGateway({
  country: config.itunes.country,
  userAgent: config.discogs.userAgent,
});
const cipher = new TokenCipher(config.tokenEncryptionKey);
const releaseCache = new DiscogsReleaseCache(config.discogs.cacheTtlSeconds, clock);
const queue = new PgBossQueue({
  connectionString: config.databaseUrl,
  pollingIntervalSeconds: config.queue.pollingIntervalSeconds,
  onError: (error) => {
    app.log.error({ err: error }, 'Job queue error');
  },
});

const app = await buildApp({
  config,
  database,
  gateway,
  itunes,
  cipher,
  queue,
  releaseCache,
  clock,
  healthProbes: [database.ping],
});

await queue.start();
await scheduleCachePurge({
  queue,
  db: database.db,
  cache: releaseCache,
  cron: config.queue.cachePurgeCron,
  log: app.log,
});
await queue.work(QUEUES.collectionImport.name, (job) =>
  runImport(job, {
    database,
    gateway,
    users: new UserRepository(database.db, cipher),
    releaseCache,
    clock,
    log: app.log,
  }),
);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  await queue.stop();
  await database.close();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.port, host: config.host });
