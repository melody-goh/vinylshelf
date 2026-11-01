# ADR 0007: Keep the API same-site with the web app in production

- **Status:** Accepted (2026-11-01), option 1
- **Date:** 2026-10-23
- **Related:** ADR 0005 (free-tier hosting), ADR 0006 (sessions)

## Context

Sessions use an `HttpOnly`, `SameSite=Lax` cookie (ADR 0006). In development this works
because Vite proxies `/api` to the API, so the browser only ever talks to one origin.

The planned production hosts (ADR 0005) put the web app on Cloudflare Pages
(`*.pages.dev`) and the API on Render (`*.onrender.com`). These are **different sites**:
both domains are on the Public Suffix List, so even subdomains of each are separate
sites. A `Lax` cookie set by the API would not be sent on the web app's `fetch` calls,
and every authenticated request would fail with 401.

This is out of scope for the first slice. It is recorded now so it does not surprise us
at deployment time.

## Options

1. **Proxy the API through the web origin.** A Cloudflare Pages Function (or Worker)
   forwards `/api/*` to Render. The browser sees one origin, so the cookie design is
   unchanged and CORS is unnecessary. Free tier, but it adds a hop and per-request
   invocations count against the Workers quota. Must verify that SSE
   (`/recognition-attempts/{id}/events`) streams through without buffering or timeouts.
2. **Custom domain with sibling subdomains.** `app.example.com` and `api.example.com`
   are the same site, so `SameSite=Lax` works with credentialed CORS. This is the
   cleanest setup, but a domain costs money, which conflicts with "free to host" and
   needs explicit approval.
3. **`SameSite=None; Secure` with credentialed CORS across sites.** This is a
   third-party cookie, which browsers increasingly block or partition. **Rejected.**

## Decision

Option 1. A Pages Function (`apps/web/functions/api/[[path]].ts`) forwards `/api/*` to
the API on Render. It does not follow redirects, so the login's redirects to Discogs
and back reach the browser, and it streams bodies both ways.

The API stays reachable at its own `onrender.com` address, which would let anyone go
around the proxy and claim any client IP in a forwarded header. So the proxy and the API
share a secret (`PROXY_SECRET`, required in production): the proxy sets it on every
request, along with the visitor's IP from `CF-Connecting-IP` in `x-client-ip`, and the
API refuses requests without it, except the host's health check. The API uses
`x-client-ip` for per-client rate limits only once the secret has matched. This
replaces Fastify's `trustProxy`, which would have to guess how many proxies (Cloudflare
and Render's own) sit in front.

Option 2 remains the upgrade if a custom domain is bought for other reasons.

SSE through the Function is still to be verified when recognition is built.

## Consequences

The API keeps working behind a proxy: it reads `WEB_ORIGIN` from configuration for the
`Origin` check and redirects, and trusts the proxy's visitor IP only after the shared
secret matches. Per-client rate limits (for example on `/auth/discogs/start`) key on
that IP, so visitors do not share one limit. Every API request is one Pages Function
invocation, counted against the Workers free quota (100,000 a day at the time of
writing), which is ample for an invite-only deployment. Rotating the secret means
changing it in both places.
