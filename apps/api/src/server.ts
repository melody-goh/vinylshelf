/**
 * Composition root: the only module that reads the environment and wires real
 * infrastructure into the app. Everything else receives its dependencies.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { DiscogsReleaseCache } from './discogs/cache.js';
import { scheduleCachePurge } from './jobs/cache-purge.js';
import { PgBossQueue } from './jobs/queue.js';
import { systemClock } from './lib/clock.js';

// Local development reads the repo-root .env; deployed environments set real variables.
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildApp({ config, healthProbes: [database.ping] });

const releaseCache = new DiscogsReleaseCache(config.discogs.cacheTtlSeconds, systemClock);
const queue = new PgBossQueue({
  connectionString: config.databaseUrl,
  pollingIntervalSeconds: config.queue.pollingIntervalSeconds,
  onError: (error) => {
    app.log.error({ err: error }, 'Job queue error');
  },
});
await queue.start();
await scheduleCachePurge({
  queue,
  db: database.db,
  cache: releaseCache,
  cron: config.queue.cachePurgeCron,
  log: app.log,
});

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
