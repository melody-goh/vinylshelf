/**
 * The only way the rest of the API talks to Discogs (CLAUDE.md, ADR 0004 §1). Callers
 * depend on this interface and on our own domain types, never on Discogs' JSON. A
 * vendor change, or a fake in tests, touches only implementations of this interface.
 */
import type { TokenPair } from './oauth1.js';

export type { TokenPair } from './oauth1.js';

export interface RequestToken {
  token: TokenPair;
  /** Where to send the browser so the user can approve access. */
  authorizeUrl: string;
}

export interface DiscogsIdentity {
  id: number;
  username: string;
}

/** Release metadata as we use it, already cleaned up (see http-gateway.ts). */
export interface ReleaseSummaryData {
  discogsId: number;
  title: string;
  artists: string[];
  year: number | null;
  /** Colourways named by Discogs; empty means unnamed (shown as black). */
  vinylColors: string[];
  /** Format names as Discogs lists them ("Vinyl", "CD", "Box Set"): what the shelf keeps. */
  formatNames: string[];
  /** A hotlinked Discogs image URL, never downloaded (ADR 0004 §6). */
  coverImageUrl: string | null;
  discogsUrl: string;
}

export interface CollectionEntry {
  instanceId: number;
  releaseId: number;
  dateAdded: Date;
  release: ReleaseSummaryData;
}

export interface CollectionPageResult {
  page: number;
  pages: number;
  totalItems: number;
  entries: CollectionEntry[];
}

/** Full detail of one release, as the record view needs it. */
export interface ReleaseDetailData extends ReleaseSummaryData {
  label: string | null;
  catalogNumber: string | null;
  genres: string[];
  styles: string[];
  /** Format lines as Discogs shows them, e.g. "Vinyl, LP, Album, Blue Marbled". */
  formats: string[];
  credits: { name: string; role: string }[];
  tracklist: { position: string; title: string; duration: string | null }[];
  /** The Discogs community's rating (0 when unrated) and have/want counts. */
  community: { rating: { average: number; count: number }; have: number; want: number };
}

/** One release as Discogs search describes it. */
export interface SearchResultData {
  discogsId: number;
  title: string;
  artists: string[];
  year: number | null;
  country: string | null;
  label: string | null;
  catalogNumber: string | null;
  formats: string[];
  /** A hotlinked Discogs thumbnail, never downloaded (ADR 0004 §6). */
  thumbUrl: string | null;
  discogsUrl: string;
}

export interface SearchPageData {
  page: number;
  pages: number;
  totalResults: number;
  results: SearchResultData[];
}

export interface DiscogsGateway {
  /** Step 1 of OAuth 1.0a: obtain a request token bound to our callback URL. */
  getRequestToken(callbackUrl: string): Promise<RequestToken>;
  /** Step 3: exchange the approved request token and verifier for an access token. */
  getAccessToken(requestToken: TokenPair, verifier: string): Promise<TokenPair>;
  getIdentity(accessToken: TokenPair): Promise<DiscogsIdentity>;
  /** One page of the user's whole collection, newest first. Pages start at 1. */
  getCollectionPage(
    accessToken: TokenPair,
    username: string,
    page: number,
  ): Promise<CollectionPageResult>;
  /** One release in full, fetched on behalf of a signed-in user. */
  getRelease(accessToken: TokenPair, releaseId: number): Promise<ReleaseDetailData>;
  /** One page of vinyl releases matching a free-text query. Pages start at 1. */
  searchReleases(accessToken: TokenPair, query: string, page: number): Promise<SearchPageData>;
  /**
   * Adds one copy of a release to the user's collection, in folder 1 ("Uncategorized"),
   * and returns the new copy's instance id (ADR 0009). Not idempotent: each call adds
   * another copy.
   */
  addToCollection(
    accessToken: TokenPair,
    username: string,
    releaseId: number,
  ): Promise<{ instanceId: number }>;
}
