# Discogs fixtures

Hand-built from the response shapes in the Discogs API documentation. They are **not**
recordings: every username, id and record here is made up, so no real user's
collection (Restricted Data, ADR 0004) is committed.

They include fields the gateway ignores (ratings, formats, labels, ...) on purpose, to
prove unknown fields are tolerated, and edge cases the gateway must handle:

- an artist name with Discogs' disambiguation suffix (`"Nightshade (2)"`)
- an unknown year reported as `0`
- a release with an empty `cover_image`
- search results with a name-variation `*`, an artist suffix, a title containing
  " - ", no year, a `"none"` catalogue number, a spacer thumbnail, and a master
  result mixed in (search can return masters even when asked for releases), and one
  result already on the wantlist
- a wantlist page with a wanted CD (the wantlist keeps every format, ADR 0011), an
  artist suffix, an unknown year and no cover

Hand-built fixtures can drift from reality. Last checked against the live API on
2026-10-23: no schema issues; label `entity_type`, `entity_type_name` and `resource_url`
were added to match. Once real credentials are available,
compare their shape against a live response with `pnpm --filter @vinylshelf/api
fixtures:check` (field paths only, never values) and update
them here.
