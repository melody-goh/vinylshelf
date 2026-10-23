# ADR 0004: Discogs data lifecycle (classification-tagged, TTL-bound cache)

- **Status:** Accepted
- **Date:** 2026-10-23
- **Source:** Discogs API Terms of Use (last updated 2025-05-27). Re-read before launch;
  this ADR is an engineering reading of the terms, not legal advice.

## Context

The terms impose constraints that shape the architecture:

- Content may not be displayed if it is more than 6 hours older than the data on Discogs,
  and may not be cached or stored longer than necessary to serve users.
- Some data is CC0 (release, artist and label metadata); other data is **Restricted**
  (user data including collections and wantlists, marketplace data, images). Restricted
  data may not be transferred to third parties or used commercially.
- A non-affiliation notice and a hyperlinked "Data provided by Discogs" credit are
  required next to any Discogs data.
- Discogs may change terms, charge for access, or revoke access at any time.

## Decision

1. **One gateway.** All Discogs access goes through a `DiscogsGateway` module. Nothing else
   imports an HTTP client for Discogs. The API base URL and version live in one constant,
   and response shapes are validated with Zod at the boundary.
2. **Classification-tagged cache.** Every cached record carries a classification
   (`cc0` or `restricted`), `fetched_at` and a hard `expires_at` of at most 6 hours.
3. **Enforced on read.** The read path refuses to return expired rows, and a scheduled job
   purges them. Compliance is tested code, not convention.
4. **Stale-while-revalidate with a cutoff.** Serve cached data under the TTL while
   refreshing in the background; past the TTL, refetch before showing.
5. **Persist only what the product needs to function:** our own accounts, encrypted tokens,
   release IDs on a user's shelf, and our own recognition history.
6. **Never store images.** Hotlink image URLs through the TTL cache.
7. **Attribution is a design-system component** (`DiscogsCredit`) rendered with every data
   block, plus the notice in the footer. The API contract exposes `discogsUrl` for this.
8. **Taste catalogue** is built from a source we may keep (see ADR 0005 and the open
   question below), not from live API responses.

## Open questions

- Whether the monthly CC0 data dumps are a suitable local catalogue for the taste engine,
  and under what conditions. Verify before relying on them.
- Whether the 6-hour clause applies to CC0 content. We assume yes (stricter reading) until
  clarified with Discogs through their Help Center.

## Consequences

**Good:** the riskiest external dependency is isolated, auditable and replaceable; the
design story shows legal constraints turned into architecture.

**Costs:** more refetching, so the 60 requests/minute budget matters more; needs a skeleton
state in the UI when data is past its deadline.
