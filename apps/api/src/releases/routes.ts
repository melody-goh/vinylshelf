import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUserId, requireUser } from '../auth/guard.js';
import type { SessionStore } from '../auth/sessions.js';
import { ProblemError } from '../http/problem.js';
import { releaseSchema } from '../http/schemas.js';
import { toReleaseDto, type ReleaseService } from './release-service.js';

export interface ReleaseRouteDependencies {
  sessions: SessionStore;
  releases: ReleaseService;
}

/** Release detail (openapi.yaml, tag Releases). */
export const releaseRoutes =
  (deps: ReleaseRouteDependencies): FastifyPluginAsyncZod =>
  (app) => {
    app.get(
      '/releases/:discogsId',
      {
        preHandler: requireUser(deps.sessions),
        // An id that is not a positive integer simply does not exist: 404, the failure
        // the contract documents, rather than an undocumented 400.
        schema: { params: z.object({ discogsId: z.string() }), response: { 200: releaseSchema } },
      },
      async (request) => {
        const id = Number(request.params.discogsId);
        if (!Number.isSafeInteger(id) || id < 1) {
          throw new ProblemError(404, 'release_not_found', 'Release not found on Discogs');
        }
        return toReleaseDto(await deps.releases.get(currentUserId(request), id));
      },
    );

    return Promise.resolve();
  };
