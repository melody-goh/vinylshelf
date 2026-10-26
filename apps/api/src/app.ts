import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { originGuard } from './auth/guard.js';
import { authRoutes } from './auth/routes.js';
import { SessionStore } from './auth/sessions.js';
import { UserRepository } from './auth/users.js';
import { CollectionAddService } from './collection/add.js';
import { ImportService } from './collection/imports.js';
import { CollectionItemsService } from './collection/items.js';
import { collectionRoutes } from './collection/routes.js';
import { ReleaseService } from './releases/release-service.js';
import { releaseRoutes } from './releases/routes.js';
import { PreviewService } from './releases/previews-service.js';
import { SearchService } from './releases/search-service.js';
import type { Config } from './config.js';
import type { TokenCipher } from './crypto/token-cipher.js';
import type { DatabaseHandle } from './db/client.js';
import type { DiscogsReleaseCache } from './discogs/cache.js';
import type { DiscogsGateway } from './discogs/gateway.js';
import type { ITunesGateway } from './itunes/gateway.js';
import { ProblemError, registerProblemHandlers } from './http/problem.js';
import type { JobQueue } from './jobs/queue.js';
import type { Clock } from './lib/clock.js';
import { healthRoutes, type HealthProbe } from './meta/health.js';

/** Prefix from the `servers` entry in openapi.yaml. */
export const API_PREFIX = '/api/v1';

declare module 'fastify' {
  interface FastifyInstance {
    /** Every route registered, in registration order. The contract tests check it against the spec. */
    apiRoutes: readonly { method: string; url: string }[];
  }
}

/**
 * Infrastructure the HTTP layer needs, passed in rather than imported. Tests build the
 * app with a test database, MSW-backed Discogs and a fake queue. The composition root
 * (server.ts) is the only place real infrastructure is wired up.
 */
export interface AppDependencies {
  config: Config;
  database: DatabaseHandle;
  gateway: DiscogsGateway;
  itunes: ITunesGateway;
  cipher: TokenCipher;
  queue: JobQueue;
  releaseCache: DiscogsReleaseCache;
  clock: Clock;
  healthProbes?: readonly HealthProbe[];
}

/** Builds the Fastify app without listening, so tests can drive it with `inject`. */
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { config, database, clock } = deps;
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
    },
  }).withTypeProvider<ZodTypeProvider>();

  const apiRoutes: { method: string; url: string }[] = [];
  app.decorate('apiRoutes', apiRoutes);
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) apiRoutes.push({ method, url: route.url });
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerProblemHandlers(app);
  await app.register(cookie);
  // Opt-in per route (config.rateLimit); limits are per client IP, kept in memory.
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new ProblemError(429, 'rate_limited', 'Too many requests', `Try again in ${context.after}`),
  });
  app.addHook('onRequest', originGuard(config.webOrigin));

  const sessions = new SessionStore(database.db, clock);
  const users = new UserRepository(database.db, deps.cipher);
  const imports = new ImportService(database, deps.queue, clock);
  const releases = new ReleaseService(database.db, deps.releaseCache, deps.gateway, users);
  const search = new SearchService(
    database.db,
    deps.gateway,
    users,
    clock,
    config.discogs.cacheTtlSeconds,
  );
  const previews = new PreviewService(database.db, releases, deps.itunes, clock);
  const add = new CollectionAddService(database, deps.releaseCache, deps.gateway, users, clock);
  const items = new CollectionItemsService(database, imports, clock, {
    refreshAfterMs: config.discogs.refreshAfterSeconds * 1000,
    cooldownMs: config.refreshCooldownMinutes * 60 * 1000,
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes(deps.healthProbes ?? []));
      await api.register(
        authRoutes({ config, gateway: deps.gateway, cipher: deps.cipher, users, sessions, clock }),
      );
      await api.register(collectionRoutes({ sessions, imports, items, add }));
      await api.register(releaseRoutes({ sessions, releases, search, previews }));
    },
    { prefix: API_PREFIX },
  );

  return app;
}
