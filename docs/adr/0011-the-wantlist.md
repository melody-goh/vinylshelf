# ADR 0011: The wantlist, read live from Discogs

- **Status:** Accepted
- **Date:** 2026-10-25
- **Related:** ADR 0004 (Discogs data lifecycle), ADR 0006 (shelf references),
  ADR 0009 (writing to the Discogs collection)

## Context

Collectors keep a wantlist on Discogs: records they are looking for. The app should
show it beside the shelf and library, and let a record found in search be added to it.
Like the collection, a wantlist is Restricted Data (ADR 0004). Unlike the collection, it
does not need sorting, filtering or a refresh state: it is a list to look through.

## Decision

1. **Read live, never stored as a list.** The wantlist is paged from Discogs as the user
   scrolls (`GET /users/{username}/wants`, 100 a page, on the interactive lane). We keep
   no record of what is on it. The release details each page carries go into the
   TTL-bound release cache like any other (ADR 0004), so the six-hour limit still holds.
2. **Search says what is wanted without another call.** Discogs search results carry
   `user_data.in_wantlist` for the signed-in user; the API passes it through as
   `SearchResult.inWantlist`.
3. **Writes only on an explicit action**, as in ADR 0009: adding
   (`PUT /users/{username}/wants/{release}`) and removing (`DELETE`) one release per
   request. Adding is idempotent on Discogs (a release is wanted or not), so it may be
   retried; removing a release that is not wanted is treated as done.
4. **All formats.** The wantlist is shown as covers, not vinyl discs, so a wanted CD is
   not misdrawn; nothing is filtered out.

## Consequences

- Each wantlist page shown costs one Discogs call. That is acceptable for a list people
  look through occasionally; if wantlists turn out to be browsed heavily, importing them
  like the collection (ADR 0006) is the next step.
- Moving a record from the wantlist to the collection when it is bought is two calls
  (add to collection, remove from wantlist); there is no transaction across them, so a
  failure between them leaves it in both, which is visible and harmless.
