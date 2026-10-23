# ADR 0007: Keep the API same-site with the web app in production

- **Status:** Proposed (decision deferred until deployment work starts)
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

## Leaning

Option 1 by default, because it keeps everything free and leaves the API untouched.
Option 2 if a custom domain is bought for other reasons. Decide, and change this ADR's
status, before the first deployment.

## Consequences

Whatever is chosen, the API must keep working behind a proxy: it reads `WEB_ORIGIN`
from configuration for the `Origin` check and redirects, and must trust the proxy's
forwarded headers only when configured to.
