# iTunes Search API fixtures

Hand-built from the response shapes in Apple's Search API documentation
(performance-partners.apple.com/search-api). They are **not** recordings, and every id,
URL and name here is made up.

They cover what matching has to get right (ADR 0010 §3):

- the same album title twice: a deluxe edition with more tracks, and the plain album
  with the same track count as the Discogs release
- an album with the right title by the wrong artist (a tribute band)
- a song title with a remaster suffix ("Undertow (2019 Remaster)")
- a song Apple sells but offers no preview for (no `previewUrl`)
- the album itself listed first in the lookup, before its songs
