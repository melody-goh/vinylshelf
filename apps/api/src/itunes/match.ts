/**
 * Matching a Discogs release to an iTunes Store album, and its tracks to the album's
 * songs (ADR 0010 §3). Deliberately conservative: when in doubt, no match, because a
 * silent track is better than the wrong song playing under the right title.
 */
import type { StoreAlbum, StoreSong } from './gateway.js';

/**
 * Versions and editions that do not change which song or album it is: "(Remastered
 * 2011)", "[Deluxe Edition]", "- 2011 Remaster", "feat. Someone". "Live" is not one of
 * them: a live take is a different recording, so it must match on its own.
 */
const DECORATION =
  /\s*[([][^)\]]*\b(remaster(ed)?|deluxe|edition|version|mono|stereo|bonus|anniversary|expanded|reissue|feat\.?|featuring|with)\b[^)\]]*[)\]]|\s+-\s+.*\b(remaster(ed)?|version|edit|mix|mono|stereo)\b.*$|\s+(feat\.?|featuring)\s+.*$/gi;

/** Lower-cased, unaccented, decoration and punctuation removed, "&" read as "and". */
export function normalise(text: string): string {
  return text
    .replace(DECORATION, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface ReleaseToMatch {
  title: string;
  artists: string[];
  trackCount: number;
}

/**
 * The store album that is this release: same title and same artist once normalised.
 * Among several (editions, reissues), prefer the one with the same number of tracks,
 * then Apple's own ranking.
 */
export function chooseAlbum(
  albums: readonly StoreAlbum[],
  release: ReleaseToMatch,
): StoreAlbum | null {
  const title = normalise(release.title);
  const artists = release.artists.map(normalise);
  const candidates = albums.filter((album) => {
    if (normalise(album.title) !== title) return false;
    const artist = normalise(album.artist);
    return artists.some((a) => a === artist || artist.includes(a) || a.includes(artist));
  });
  if (candidates.length === 0) return null;
  return (
    candidates.find((album) => album.trackCount === release.trackCount) ?? candidates[0] ?? null
  );
}

export interface MatchedTrack {
  position: string;
  previewUrl: string | null;
  storeUrl: string | null;
}

/**
 * Pairs each Discogs track with a store song: first by normalised title (each song used
 * once), then, only when both lists are the same length, by order for tracks still
 * unmatched whose song at the same place is still free. Anything else stays silent.
 */
export function matchTracks(
  tracklist: readonly { position: string; title: string }[],
  songs: readonly StoreSong[],
): MatchedTrack[] {
  const ordered = [...songs].sort(
    (a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber,
  );
  const used = new Set<number>();
  const pick = (index: number): StoreSong | null => {
    const song = ordered[index];
    if (!song || used.has(index)) return null;
    used.add(index);
    return song;
  };

  const byTitle = tracklist.map((track) => {
    const wanted = normalise(track.title);
    const index = ordered.findIndex((song, i) => !used.has(i) && normalise(song.title) === wanted);
    return index === -1 ? null : pick(index);
  });

  const sameShape = ordered.length === tracklist.length;
  return tracklist.map((track, i) => {
    const song = byTitle[i] ?? (sameShape ? pick(i) : null);
    return {
      position: track.position,
      previewUrl: song?.previewUrl ?? null,
      storeUrl: song?.storeUrl ?? null,
    };
  });
}
