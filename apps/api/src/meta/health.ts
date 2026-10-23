import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

/** A dependency check. It resolves true when the dependency is usable. */
export type HealthProbe = () => Promise<boolean>;

const healthResponse = z.object({ status: z.enum(['ok', 'degraded']) });

/**
 * Liveness and readiness in one endpoint. It always answers 200 while the process is
 * up, so a sleeping free-tier host that just woke is not killed for a slow database.
 * The body says whether every dependency probe passed.
 */
export const healthRoutes =
  (probes: readonly HealthProbe[]): FastifyPluginAsyncZod =>
  (app) => {
    app.get('/health', { schema: { response: { 200: healthResponse } } }, async () => {
      const results = await Promise.all(probes.map((probe) => probe().catch(() => false)));
      return { status: results.every(Boolean) ? 'ok' : 'degraded' } as const;
    });
    return Promise.resolve();
  };
