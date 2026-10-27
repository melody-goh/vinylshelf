import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUserId, requireUser } from '../auth/guard.js';
import type { SessionStore } from '../auth/sessions.js';
import {
  tasteFeedbackBody,
  tasteRecommendationsQuery,
  tasteSearchQuery,
  tasteSearchSchema,
  tasteRecommendationsSchema,
} from '../http/schemas.js';
import type { TasteService } from './service.js';

export interface TasteRouteDependencies {
  sessions: SessionStore;
  taste: TasteService;
}

/** Recommendations and steering (openapi.yaml, tag Taste; ADR 0008). */
export const tasteRoutes =
  (deps: TasteRouteDependencies): FastifyPluginAsyncZod =>
  (app) => {
    const auth = { preHandler: requireUser(deps.sessions) };

    app.get(
      '/taste/recommendations',
      {
        ...auth,
        schema: {
          querystring: tasteRecommendationsQuery,
          response: { 200: tasteRecommendationsSchema },
        },
      },
      async (request) => deps.taste.recommendations(currentUserId(request), request.query.distance),
    );

    app.get(
      '/taste/search',
      {
        ...auth,
        schema: { querystring: tasteSearchQuery, response: { 200: tasteSearchSchema } },
      },
      async (request) => deps.taste.search(currentUserId(request), request.query.q),
    );

    app.post(
      '/taste/feedback',
      { ...auth, schema: { body: tasteFeedbackBody } },
      async (request, reply) => {
        const { masterId, verdict } = request.body;
        await deps.taste.giveFeedback(currentUserId(request), masterId, verdict);
        return reply.status(204).send();
      },
    );

    app.delete(
      '/taste/feedback/:masterId',
      // Not a positive integer: no verdict can exist for it, so withdrawing is done.
      { ...auth, schema: { params: z.object({ masterId: z.string() }) } },
      async (request, reply) => {
        const masterId = Number(request.params.masterId);
        if (Number.isSafeInteger(masterId) && masterId > 0) {
          await deps.taste.withdrawFeedback(currentUserId(request), masterId);
        }
        return reply.status(204).send();
      },
    );

    return Promise.resolve();
  };
