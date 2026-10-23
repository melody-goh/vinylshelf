# Discogs fixtures

Hand-built from the response shapes in the Discogs API documentation. They are **not**
recordings: every username, id and record here is made up, so no real user's
collection (Restricted Data, ADR 0004) is committed.

They include fields the gateway ignores (ratings, formats, labels, ...) on purpose, to
prove unknown fields are tolerated, and edge cases the gateway must handle:

- an artist name with Discogs' disambiguation suffix (`"Nightshade (2)"`)
- an unknown year reported as `0`
- a release with an empty `cover_image`

Hand-built fixtures can drift from reality. Once real credentials are available,
compare their shape against a live response (see the fixture-check script) and update
them here.
