/**
 * Cloudflare Pages Function: forwards every /api/* request to the API (ADR 0007), so
 * the browser only ever talks to the web origin and the session cookie stays
 * first-party. The shared secret proves to the API that the request came this way,
 * which is also what lets it trust the visitor IP this adds.
 */
interface Env {
  API_ORIGIN: string;
  PROXY_SECRET: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

export async function onRequest({ request, env }: PagesContext): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  // Set here, never taken from the visitor.
  headers.set('x-proxy-secret', env.PROXY_SECRET);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) headers.set('x-client-ip', ip);
  else headers.delete('x-client-ip');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return fetch(new URL(url.pathname + url.search, env.API_ORIGIN), {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // The login's redirect to Discogs, and back to the app, belong to the browser.
    redirect: 'manual',
  });
}
