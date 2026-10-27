# ADR 0006: Sessions, Discogs token storage and shelf references

- **Status:** Accepted
- **Date:** 2026-10-23
- **Related:** ADR 0004 (Discogs data lifecycle), ADR 0007 (same-origin API, proposed)

## Context

The first vertical slice signs users in with Discogs OAuth 1.0a and imports their
collection. That requires decisions ADR 0004 left open: how a browser session is
represented, where long-lived Discogs credentials live, how the OAuth request token
survives the round trip to Discogs, and exactly which collection fields we keep.

The collection is **Restricted Data** under the Discogs API Terms of Use. ADR 0004 §5
allows persisting "release IDs on a user's shelf"; this ADR records how far we read
that permission.

## Decision

1. **Opaque server-side sessions.** The `sid` cookie holds 32 random bytes. The
   `sessions` table stores only their SHA-256 hash, the user and an expiry (30 days).
   Logout deletes the row, so a copied cookie stops working immediately. Cookie flags:
   `HttpOnly`, `SameSite=Lax`, `Secure` outside development, `Path=/`.
2. **CSRF.** `SameSite=Lax` plus an `Origin` check against `WEB_ORIGIN` on unsafe
   methods (403 `forbidden_origin`).
3. **Discogs access tokens encrypted at rest** with AES-256-GCM using
   `TOKEN_ENCRYPTION_KEY` (32 random bytes). Each value is stored as
   `version.iv.ciphertext.tag` so the key can be rotated later.
4. **Request token in a cookie, not a table.** Between `/auth/discogs/start` and the
   callback, the request token and its secret travel in an encrypted, `HttpOnly`
   cookie that expires after 10 minutes. The callback rejects a token that does not
   match it. This avoids a table that would only ever hold abandoned logins.
5. **OAuth signature method: PLAINTEXT over HTTPS**, as in Discogs' documentation.
   The signature is `percent(consumer_secret)&percent(token_secret)`. At the
   access-token step the token secret is the request-token secret; Discogs' example
   shows only `consumer_secret&`, which we fall back to only if the standard form is
   rejected in practice. The base URL is a single `https://` constant, so the plaintext
   signature never crosses an unencrypted connection.
6. **Shelf references.** `collection_items` keeps, per user, the Discogs **instance ID,
   release ID and date added**, and nothing else from the collection (no ratings,
   notes, folders or custom fields). We read ADR 0004 §5 as covering these three
   fields because they are the minimum needed to function: the instance ID tells
   copies of the same release apart, and the date added is required to sort the shelf
   by the default order. The constraints we hold ourselves to:
   - Every successful import deletes the user's items that are no longer in their
     Discogs collection, so the reference never outlives the source.
   - Release contents (title, artists, year, image URL) stay in the TTL-bound cache
     (ADR 0004 §2–3), never on the shelf row.
   - Nothing from the collection is transferred to third parties or used
     commercially.

## Known gaps

- **No account erasure yet.** There is no "disconnect Discogs and erase my data" flow
  that deletes the user row, encrypted tokens, sessions, import jobs and shelf
  references. Logout only ends the session. This is backlog for after the first slice
  and should land before any public launch.

## Consequences

**Good:** logout is real revocation; a database leak exposes neither usable session
tokens nor Discogs credentials; the interpretation of the terms is written down where
it can be reviewed and revised.

**Costs:** one database read per authenticated request (cheap at this scale); key
management for `TOKEN_ENCRYPTION_KEY`; the cookie only reaches the API while the web
app and the API share a site, which is true in development and must be solved for
production (ADR 0007).

## Alternatives considered

- **Stateless signed or encrypted session cookies:** no session table, but logout
  cannot revoke a stolen cookie before it expires.
- **JWT in `localStorage`:** readable by any injected script; rejected.
- **HMAC-SHA1 signatures:** also accepted by Discogs and safe over plain HTTP, but more
  code to maintain for no benefit when every call is HTTPS.
- **Keeping only release IDs:** the strictest reading of ADR 0004 §5, but the shelf
  could then not distinguish duplicate copies or keep its default sort order.

### 2026-10-27: the master id is part of the shelf reference

A shelf reference now also keeps the release's Discogs **master id** (null when the
release has none). It is an identifier of the same kind as the release id: it says which
album a copy belongs to and carries no descriptive data. It links a shelf record to the
CC0 taste catalogue (ADR 0008), which has to work at any time; keeping the link in the
release cache instead would mean either reading Discogs data past its six-hour deadline
(ADR 0004) or losing the link whenever the cache expires. It is written by every import
and every added record, and deleted with the shelf reference.
