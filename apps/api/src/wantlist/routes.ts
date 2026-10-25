import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUserId, requireUser } from '../auth/guard.js';
import type { SessionStore } from '../auth/sessions.js';
import { ProblemError } from '../http/problem.js';
import { wantlistItemSchema, wantlistPageSchema, wantlistQuery } from '../http/schemas.js';
import type { WantlistService } from './service.js';

export interface WantlistRouteDependencies {
  sessions: SessionStore;
  wantlist: WantlistService;
}

/** A release id from the path; anything else does not exist on Discogs (404). */
function releaseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ProblemError(404, 'release_not_found', 'Release not found on Discogs');
  }
  return id;
}

/** The wantlist (openapi.yaml, tag Wantlist; ADR 0011). */
export const wantlistRoutes =
  (deps: WantlistRouteDependencies): FastifyPluginAsyncZod =>
  (app) => {
    const auth = { preHandler: requireUser(deps.sessions) };
    const params = z.object({ discogsId: z.string() });

    app.get(
      '/wantlist',
      { ...auth, schema: { querystring: wantlistQuery, response: { 200: wantlistPageSchema } } },
      async (request) => deps.wantlist.list(currentUserId(request), request.query.page),
    );

    app.put(
      '/wantlist/:discogsId',
      { ...auth, schema: { params, response: { 200: wantlistItemSchema } } },
      async (request) =>
        deps.wantlist.add(currentUserId(request), releaseId(request.params.discogsId)),
    );

    app.delete('/wantlist/:discogsId', { ...auth, schema: { params } }, async (request, reply) => {
      await deps.wantlist.remove(currentUserId(request), releaseId(request.params.discogsId));
      return reply.status(204).send();
    });

    return Promise.resolve();
  };
