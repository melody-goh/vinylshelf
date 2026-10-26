import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUserId, requireUser } from '../auth/guard.js';
import type { SessionStore } from '../auth/sessions.js';
import { ProblemError } from '../http/problem.js';
import {
  releasePreviewsSchema,
  releaseSchema,
  searchPageSchema,
  searchQuery,
} from '../http/schemas.js';
import type { PreviewService } from './previews-service.js';
import { toReleaseDto, type ReleaseService } from './release-service.js';
import type { SearchService } from './search-service.js';

/**
 * Searches per session per minute. Every user shares one Discogs budget of 60 a minute
 * (ADR 0009 §5); with the client debouncing keystrokes, this is plenty for a person and
 * stops one tab from starving imports and record detail for everyone else.
 */
export const SEARCHES_PER_MINUTE = 20;

export interface ReleaseRouteDependencies {
  sessions: SessionStore;
  releases: ReleaseService;
  search: SearchService;
  previews: PreviewService;
}

/** Release detail and search (openapi.yaml, tag Releases). */
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

    app.get(
      '/releases/:discogsId/previews',
      {
        preHandler: requireUser(deps.sessions),
        schema: {
          params: z.object({ discogsId: z.string() }),
          response: { 200: releasePreviewsSchema },
        },
      },
      async (request) => {
        const id = Number(request.params.discogsId);
        if (!Number.isSafeInteger(id) || id < 1) {
          throw new ProblemError(404, 'release_not_found', 'Release not found on Discogs');
        }
        return deps.previews.get(currentUserId(request), id);
      },
    );

    app.get(
      '/search/releases',
      {
        preHandler: requireUser(deps.sessions),
        config: {
          rateLimit: {
            max: SEARCHES_PER_MINUTE,
            timeWindow: 60_000,
            // Keyed by session, not IP: people behind one NAT should not share a limit.
            keyGenerator: (request) => request.cookies.sid ?? request.ip,
          },
        },
        schema: { querystring: searchQuery, response: { 200: searchPageSchema } },
      },
      async (request) =>
        deps.search.search(currentUserId(request), request.query.q, request.query.page),
    );

    return Promise.resolve();
  };
