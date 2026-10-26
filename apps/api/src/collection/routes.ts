import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUserId, requireUser } from '../auth/guard.js';
import type { SessionStore } from '../auth/sessions.js';
import { ProblemError } from '../http/problem.js';
import {
  addCollectionItemBody,
  collectionItemSchema,
  collectionItemsQuery,
  collectionPageSchema,
  importJobSchema,
} from '../http/schemas.js';
import type { CollectionAddService } from './add.js';
import { toImportJobDto, type ImportService } from './imports.js';
import type { CollectionItemsService } from './items.js';

export interface CollectionRouteDependencies {
  sessions: SessionStore;
  imports: ImportService;
  items: CollectionItemsService;
  add: CollectionAddService;
}

/** Collection import and listing endpoints (openapi.yaml, tag Collection). */
export const collectionRoutes =
  (deps: CollectionRouteDependencies): FastifyPluginAsyncZod =>
  (app) => {
    const auth = { preHandler: requireUser(deps.sessions) };

    app.post(
      '/collection/imports',
      { ...auth, schema: { response: { 202: importJobSchema } } },
      async (request, reply) => {
        const job = await deps.imports.start(currentUserId(request));
        return reply.status(202).send(toImportJobDto(job));
      },
    );

    app.get(
      '/collection/imports/latest',
      { ...auth, schema: { response: { 200: importJobSchema } } },
      async (request) => {
        const job = await deps.imports.latest(currentUserId(request));
        if (!job) throw new ProblemError(404, 'import_not_found', 'No import yet');
        return toImportJobDto(job);
      },
    );

    app.get(
      '/collection/imports/:importId',
      {
        ...auth,
        // Any string is accepted: an id that is not a UUID simply does not exist (404),
        // which is the only failure the contract describes for this route.
        schema: { params: z.object({ importId: z.string() }), response: { 200: importJobSchema } },
      },
      async (request) => {
        const { importId } = request.params;
        if (!z.uuid().safeParse(importId).success) {
          throw new ProblemError(404, 'import_not_found', 'Import not found');
        }
        return toImportJobDto(await deps.imports.get(currentUserId(request), importId));
      },
    );

    app.get(
      '/collection/items',
      {
        ...auth,
        schema: { querystring: collectionItemsQuery, response: { 200: collectionPageSchema } },
      },
      async (request) => deps.items.list({ userId: currentUserId(request), ...request.query }),
    );

    app.post(
      '/collection/items',
      { ...auth, schema: { body: addCollectionItemBody, response: { 201: collectionItemSchema } } },
      async (request, reply) => {
        const item = await deps.add.add({ userId: currentUserId(request), ...request.body });
        return reply.status(201).send(item);
      },
    );

    return Promise.resolve();
  };
