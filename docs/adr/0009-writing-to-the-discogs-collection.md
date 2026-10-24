# ADR 0009: Search, and writing to the user's Discogs collection

- **Status:** Accepted
- **Date:** 2026-10-24
- **Related:** ADR 0004 (Discogs data lifecycle), ADR 0006 (sessions and shelf references)

## Context

Until now the app only read from Discogs. Users now want to search Discogs from the
shelf and add a record they find. That raises three questions ADR 0004 and 0006 do not
answer: where an added record lives, what happens when the write and our own state
disagree, and how search results (Discogs data that the user only glances at) are
handled.

The Discogs OAuth grant the user already gave covers writing to their collection
(`POST /users/{username}/collection/folders/{folder}/releases/{release}`); there are no
narrower scopes to ask for.

## Decision

1. **Discogs stays the single source of truth.** Adding a record writes it to the
   user's Discogs collection, in folder 1 ("Uncategorized", the folder Discogs itself
   uses by default). Only after Discogs confirms (and returns the new `instance_id`)
   do we insert the shelf reference (ADR 0006) and cache the release (ADR 0004). If
   the Discogs write fails, nothing changes on our side. If our insert fails after
   Discogs succeeded, the next import picks the copy up, so the shelf converges.
2. **Only on an explicit action.** The app writes to Discogs only when the user asks,
   one record per request. No background or bulk writes.
3. **Duplicates need a second, explicit yes.** Discogs allows several copies of one
   release, and adding twice silently creates two. The API refuses to add a release
   already on the user's shelf (409 `already_in_collection`) unless the request says
   `allowDuplicate: true`, which the client sends only after the user confirms they
   own another copy.
4. **Search results are looked at, not kept.** Results are fetched through the Discogs
   gateway on the interactive lane of the rate limiter and passed straight to the
   client. They are never written to the database; like all Discogs-sourced data they
   carry `fetchedAt` and `expiresAt`, and the client shows the Discogs credit beside
   them. Search is limited to vinyl releases (this is a record shelf).
5. **Protect the shared budget.** All users share one 60-requests-per-minute Discogs
   budget per server. Search gets its own per-user rate limit on our API, and the
   client debounces typing, so one fast typist cannot starve imports and record
   detail for everyone else.

## Consequences

- Removing records stays out of scope; a user removes a copy on Discogs and the next
  import drops it (ADR 0006).
- A failure between the Discogs write and our insert is tolerated rather than rolled
  back, because Discogs offers no transaction we could join. The window is small and
  self-heals on the next import.
- Community data (rating, have/want counts) arrives with the release detail we already
  fetch, so it costs no extra calls and follows the same TTL.
- Tracking price movement is not covered: it would mean keeping marketplace data past
  ADR 0004's 6-hour limit, and needs its own ADR and a check of the Discogs API terms
  first.
