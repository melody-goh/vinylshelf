/**
 * The only way the rest of the API talks to the iTunes Search API (ADR 0010, CLAUDE.md).
 * Callers depend on this interface and these types, never on Apple's JSON.
 */

/** An album in the iTunes Store, as a search finds it. */
export interface StoreAlbum {
  collectionId: number;
  title: string;
  artist: string;
  trackCount: number;
  storeUrl: string;
}

/** One song on a store album. */
export interface StoreSong {
  title: string;
  discNumber: number;
  trackNumber: number;
  /** 30 seconds, streamed from Apple; null when Apple offers none for this song. */
  previewUrl: string | null;
  storeUrl: string;
}

export interface ITunesGateway {
  /** Albums matching a free-text term, best first by Apple's ranking. */
  searchAlbums(term: string): Promise<StoreAlbum[]>;
  /** The songs on one album, in Apple's order. */
  albumSongs(collectionId: number): Promise<StoreSong[]>;
}
