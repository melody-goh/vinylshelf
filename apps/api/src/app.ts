import cookie from '@fastify/cookie';
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
import type { Config } from './config.js';
import type { TokenCipher } from './crypto/token-cipher.js';
import type { DatabaseHandle } from './db/client.js';
import type { DiscogsReleaseCache } from './discogs/cache.js';
import type { DiscogsGateway } from './discogs/gateway.js';
import { registerProblemHandlers } from './http/problem.js';
import type { JobQueue } from './jobs/queue.js';
import type { Clock } from './lib/clock.js';
import { healthRoutes, type HealthProbe } from './meta/health.js';

/** Prefix from the `servers` entry in openapi.yaml. */
export const API_PREFIX = '/api/v1';

/**
 * Infrastructure the HTTP layer needs, passed in rather than imported. Tests build the
 * app with a test database, MSW-backed Discogs and a fake queue. The composition root
 * (server.ts) is the only place real infrastructure is wired up.
 */
export interface AppDependencies {
  config: Config;
  database: DatabaseHandle;
  gateway: DiscogsGateway;
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

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerProblemHandlers(app);
  await app.register(cookie);
  app.addHook('onRequest', originGuard(config.webOrigin));

  const sessions = new SessionStore(database.db, clock);
  const users = new UserRepository(database.db, deps.cipher);

  await app.register(
    async (api) => {
      await api.register(healthRoutes(deps.healthProbes ?? []));
      await api.register(
        authRoutes({ config, gateway: deps.gateway, cipher: deps.cipher, users, sessions, clock }),
      );
    },
    { prefix: API_PREFIX },
  );

  return app;
}
