# ADR 0005: Free-tier constraints as design inputs

- **Status:** Accepted
- **Date:** 2026-10-23
- **Note:** Provider limits change often. Numbers below were checked in October 2026 and
  must be re-verified against each provider's pricing page.

## Context

The project must be free to build and host. Free tiers shape the architecture, so each
constraint and the decision it drove is recorded here.

## Constraints and decisions

| Constraint | Decision |
|---|---|
| Free web services sleep when idle (Render free: spins down after 15 minutes, about a minute to wake) | Resumable, checkpointed jobs (ADR 0003); a "waking up" UI state; SSE client falls back to polling (ADR 0002) |
| Free Postgres is small (Neon free: 0.5 GB, scales to zero) | Store compact data only; no images, no audio; compact embedding vectors |
| Free Redis is command-limited | No Redis; Postgres-backed queue (ADR 0003) |
| Recognition vendor free quota is small and one-time (AudD: 300 requests on signup) | `Recognizer` interface with a fixture-backed fake for dev, tests and demo mode; per-user daily cap; global kill switch; second vendor possible behind the same interface |
| Discogs rate limit (authenticated, high tier) | Single rate limiter inside the gateway; import queue controls concurrency (ADR 0004) |
| MusicBrainz asks for about 1 request/second and a descriptive User-Agent | Same limiter pattern; cache results within their terms |
| No free always-on Python host | ML feature extraction runs as an offline batch job and writes results to Postgres |
| Free static hosting is generous (Cloudflare Pages) | Frontend deployed there; API host is swappable behind the contract |

## Consequences

Hosting is replaceable because the contract (ADR 0001) and the gateways are the stable
boundaries. The cost is extra engineering around sleeping hosts and quotas, which is
deliberate: it is the realistic constraint set for a small production service.
