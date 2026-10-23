import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Config } from './config.js';
import { registerProblemHandlers } from './http/problem.js';
import { healthRoutes, type HealthProbe } from './meta/health.js';

/** Prefix from the `servers` entry in openapi.yaml. */
export const API_PREFIX = '/api/v1';

/**
 * Everything the HTTP layer needs, passed in rather than imported. Tests build the
 * app with fakes, and the composition root (server.ts) is the only place real
 * infrastructure is wired up.
 */
export interface AppDependencies {
  config: Pick<Config, 'logLevel' | 'nodeEnv'>;
  healthProbes?: readonly HealthProbe[];
}

/** Builds the Fastify app without listening, so tests can drive it with `inject`. */
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: deps.config.logLevel,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerProblemHandlers(app);

  await app.register(
    async (api) => {
      await api.register(healthRoutes(deps.healthProbes ?? []));
    },
    { prefix: API_PREFIX },
  );

  return app;
}
