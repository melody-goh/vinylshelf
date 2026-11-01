/**
 * The API behind the web app's proxy (ADR 0007). In production the browser only ever
 * talks to the web origin, whose Pages Function forwards `/api/*` here with a shared
 * secret and the visitor's IP. Requests without the secret came around the proxy, so
 * they are refused; that also makes the forwarded IP trustworthy.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, onRequestHookHandler } from 'fastify';
import { ProblemError } from './problem.js';

export const PROXY_SECRET_HEADER = 'x-proxy-secret';
export const CLIENT_IP_HEADER = 'x-client-ip';

declare module 'fastify' {
  interface FastifyRequest {
    /** The visitor's IP as the proxy saw it; set only once the proxy is verified. */
    proxiedClientIp?: string;
  }
}

function matches(given: string | string[] | undefined, secret: Buffer): boolean {
  if (typeof given !== 'string') return false;
  const bytes = Buffer.from(given);
  return bytes.length === secret.length && timingSafeEqual(bytes, secret);
}

/**
 * Refuses requests that did not come through the proxy, except those to `open` paths
 * (the host's health check calls the API directly). Without a secret, as in
 * development, every request is let through and `clientIp` is the socket's.
 */
export function proxyGuard(secret: string | null, open: readonly string[]): onRequestHookHandler {
  const expected = secret === null ? null : Buffer.from(secret);
  return (request, _reply, done) => {
    if (expected === null || open.includes(request.routeOptions.url ?? '')) {
      done();
      return;
    }
    if (!matches(request.headers[PROXY_SECRET_HEADER], expected)) {
      done(new ProblemError(403, 'forbidden_origin', 'Request origin not allowed'));
      return;
    }
    const ip = request.headers[CLIENT_IP_HEADER];
    if (typeof ip === 'string' && ip !== '') request.proxiedClientIp = ip;
    done();
  };
}

/** Who is asking, for per-client limits: the proxy's visitor, else the socket's peer. */
export function clientIp(request: FastifyRequest): string {
  return request.proxiedClientIp ?? request.ip;
}
