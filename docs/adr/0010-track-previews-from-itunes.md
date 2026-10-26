# ADR 0010: Track previews from the iTunes Search API

- **Status:** Accepted
- **Date:** 2026-10-24
- **Related:** ADR 0004 (Discogs data lifecycle), ADR 0005 (free-tier constraints)
- **Note:** Apple's terms and limits change. Checked 2026-10-24 at
  performance-partners.apple.com/search-api; re-verify before deploying.

## Context

The open gatefold lists a record's tracks, but nothing plays. Discogs serves no audio.
The options considered:

- **YouTube videos linked on Discogs releases.** Full-length and already in the release
  data, but YouTube's terms require the player to stay visible (at least 200 × 200,
  not obscured). The user wants a player of our own design with no video.
- **Spotify Web Playback SDK.** Fully custom and full-length, but every listener needs
  Spotify Premium and a Spotify login, and new apps are limited to an allow-list of
  test users.
- **Apple MusicKit.** Fully custom and full-length, but needs a paid Apple Developer
  membership (CLAUDE.md: no paid services without asking) and an Apple Music
  subscription per listener.
- **iTunes Search API.** Free, no key, a 30-second `previewUrl` per track, streamed as
  plain audio, so the player is entirely ours.

## Decision

1. **Previews come from the iTunes Search API**, behind an `ITunesGateway` interface in
   `apps/api/src/itunes/`, like Discogs (CLAUDE.md). A lint rule keeps
   `itunes.apple.com` out of every other module.
2. **Looked up on demand, two calls per record.** When the user first presses play on a
   record, the API searches for the album (artist and title), then lists its songs.
   Apple allows about 20 calls a minute per caller, so the gateway has its own limiter
   at that rate, separate from Discogs'.
3. **Matched conservatively.** Apple's songs are matched to the Discogs tracklist by
   normalised title, then by track order when both lists have the same length. A track
   that cannot be matched with confidence has no preview: silence beats the wrong song.
4. **The match is cached, the audio never.** Apple asks large sites to cache search and
   lookup results, and forbids downloading, saving or caching previews. We cache the
   match (which album, which preview URL for which track, or "no match") for 24 hours
   in a `itunes_preview_cache` table. The audio streams from Apple straight to the
   browser and never passes through our server.
5. **Shown as Apple requires.** Every preview carries the attribution "Previews provided
   courtesy of iTunes" and Apple's approved badge linking to the album's store page.
   The contract returns the link and the attribution text, so no client can omit them.
6. **One storefront per server**, set by `ITUNES_COUNTRY` (default `US`). Availability
   differs by country; per-user storefronts can come later.

## Consequences

- **Terms risk, accepted knowingly.** Apple allows previews "only to promote store
  content, not for entertainment". A play button on a personal shelf leans towards
  entertainment. Showing every preview with the store badge and link keeps it framed
  as promotion, which is the use Apple allows; Apple may still disagree, and the
  feature must be removed if Apple asks. This is acceptable for a portfolio project
  and must be revisited before any public launch.
- **Privacy.** Apple sees the release titles and artists we search for, sent from our
  server, never anything about the user. The preview audio is fetched by the user's
  browser from Apple's CDN, so Apple sees the listener's IP address, as with any
  embedded media. The privacy notice must say so.
- Previews are 30 seconds. Obscure pressings, compilations and regional releases
  often have no match.
- The 20-a-minute budget is shared by all users of one server; heavy use would need
  Apple's Enterprise Partner Feed.
