/**
 * The typed API client. Every path, parameter and body type comes from the types
 * generated from openapi.yaml, so a contract change is a compile error here, not a
 * runtime surprise (ADR 0001).
 */
import type { Problem, paths } from '@vinylshelf/contract';
import createClient from 'openapi-fetch';

export const api = createClient<paths>({
  baseUrl: `${window.location.origin}/api/v1`,
  // Look fetch up on every call rather than capturing it once: test tools and
  // polyfills may replace globalThis.fetch after this module has loaded.
  fetch: (request) => globalThis.fetch(request),
});

/** A non-2xx response, with the RFC 9457 problem body when the API sent one. */
export class ApiError extends Error {
  override name = 'ApiError';

  constructor(
    readonly status: number,
    readonly problem: Problem | null,
  ) {
    super(problem?.title ?? `Request failed with ${status}`);
  }
}

/** Returns the data of a successful response, or throws an ApiError. */
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) throw new ApiError(response.status, isProblem(error) ? error : null);
  return data as T;
}

function isProblem(value: unknown): value is Problem {
  return typeof value === 'object' && value !== null && 'status' in value && 'title' in value;
}
