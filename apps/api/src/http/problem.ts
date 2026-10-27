import type { Problem } from '@vinylshelf/contract';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * Stable machine-readable error codes (ADR 0001). Clients branch on these, never on
 * `title` or `detail`, so the wording can change without breaking anyone.
 */
export type ProblemCode =
  | 'invalid_request'
  | 'unauthenticated'
  | 'forbidden_origin'
  | 'not_found'
  | 'import_not_found'
  | 'release_not_found'
  | 'already_in_collection'
  | 'previews_unavailable'
  | 'master_not_found'
  | 'discogs_unavailable'
  | 'discogs_auth_revoked'
  | 'discogs_unexpected_response'
  | 'import_stalled'
  | 'import_failed'
  | 'rate_limited'
  | 'internal_error';

/**
 * Throw this from a route or service to produce an RFC 9457 response. It carries only
 * what is safe to show a client; anything else stays in the server log.
 */
export class ProblemError extends Error {
  override name = 'ProblemError';

  constructor(
    readonly status: number,
    readonly code: ProblemCode,
    readonly title: string,
    readonly detail?: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(detail ?? title);
  }

  toProblem(instance?: string): Problem {
    return {
      // A relative reference: we own no stable domain to host problem docs on yet.
      type: `/problems/${this.code.replaceAll('_', '-')}`,
      title: this.title,
      status: this.status,
      code: this.code,
      ...(this.detail === undefined ? {} : { detail: this.detail }),
      ...(instance === undefined ? {} : { instance }),
    };
  }
}

function send(reply: FastifyReply, error: ProblemError, instance: string): FastifyReply {
  return reply
    .status(error.status)
    .headers(error.headers)
    .type(PROBLEM_CONTENT_TYPE)
    .send(error.toProblem(instance));
}

/**
 * Makes every error leave the API as problem details, including validation failures
 * and unknown routes. Unexpected errors are logged in full but reported to the client
 * as a generic 500, so internals (SQL, stack traces, upstream bodies) never leak.
 */
export function registerProblemHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ProblemError) {
      if (error.status >= 500) request.log.error({ err: error }, error.title);
      return send(reply, error, request.url);
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const detail = error.validation
        .map(
          (v) =>
            `${v.instancePath || error.validationContext || 'request'}: ${v.message ?? 'invalid'}`,
        )
        .join('; ');
      return send(
        reply,
        new ProblemError(400, 'invalid_request', 'Invalid request', detail),
        request.url,
      );
    }
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      // Fastify's own client errors (malformed JSON, payload too large, ...).
      return send(
        reply,
        new ProblemError(error.statusCode, 'invalid_request', 'Invalid request', error.message),
        request.url,
      );
    }
    request.log.error({ err: error }, 'Unhandled error');
    return send(
      reply,
      new ProblemError(500, 'internal_error', 'Internal server error'),
      request.url,
    );
  });

  app.setNotFoundHandler((request, reply) =>
    send(reply, new ProblemError(404, 'not_found', 'Not found'), request.url),
  );
}
