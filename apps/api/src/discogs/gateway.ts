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
}
