import type { FastifyRequest, onRequestHookHandler, preHandlerAsyncHookHandler } from 'fastify';
import { ProblemError } from '../http/problem.js';
import { SESSION_COOKIE, type SessionStore } from './sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireUser`; read it through `currentUserId`. */
    userId?: string;
  }
}

/** Route hook: rejects the request with 401 unless it carries a valid session cookie. */
export function requireUser(sessions: SessionStore): preHandlerAsyncHookHandler {
  return async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    const userId = token ? await sessions.resolve(token) : null;
    if (!userId) throw new ProblemError(401, 'unauthenticated', 'Sign in required');
    request.userId = userId;
  };
}

/** The signed-in user's id. Only valid in routes that use `requireUser`. */
export function currentUserId(request: FastifyRequest): string {
  if (!request.userId) throw new Error('currentUserId() used on a route without requireUser');
  return request.userId;
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence in depth on top of SameSite=Lax (ADR 0006 §2). Browsers send `Origin`
 * on every cross-origin unsafe request, and mark cross-site requests in
 * `Sec-Fetch-Site`. A request without either is not from a browser, so it cannot ride
 * on a victim's cookies.
 */
export function originGuard(webOrigin: string): onRequestHookHandler {
  return (request, _reply, done) => {
    if (UNSAFE_METHODS.has(request.method)) {
      const origin = request.headers.origin;
      const crossSite = request.headers['sec-fetch-site'] === 'cross-site';
      if ((origin !== undefined && origin !== webOrigin) || (origin === undefined && crossSite)) {
        done(new ProblemError(403, 'forbidden_origin', 'Request origin not allowed'));
        return;
      }
    }
    done();
  };
}
