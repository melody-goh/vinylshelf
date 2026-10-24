/**
 * The one place Discogs hosts are named (ADR 0004 §1). Both are HTTPS-only. That
 * matters because PLAINTEXT OAuth signatures rely on TLS for secrecy (ADR 0006 §5).
 */
export const DISCOGS_API_BASE = 'https://api.discogs.com';
export const DISCOGS_WEB_BASE = 'https://www.discogs.com';

export const discogsEndpoints = {
  requestToken: `${DISCOGS_API_BASE}/oauth/request_token`,
  accessToken: `${DISCOGS_API_BASE}/oauth/access_token`,
  identity: `${DISCOGS_API_BASE}/oauth/identity`,
  authorize: (requestToken: string) =>
    `${DISCOGS_WEB_BASE}/oauth/authorize?oauth_token=${encodeURIComponent(requestToken)}`,
  /** Folder 0 is Discogs' built-in "All" folder. */
  collectionReleases: (username: string) =>
    `${DISCOGS_API_BASE}/users/${encodeURIComponent(username)}/collection/folders/0/releases`,
  release: (releaseId: number) => `${DISCOGS_API_BASE}/releases/${releaseId}`,
  search: `${DISCOGS_API_BASE}/database/search`,
  /** Folder 1 is Discogs' built-in "Uncategorized" folder, where new copies go. */
  addToCollection: (username: string, releaseId: number) =>
    `${DISCOGS_API_BASE}/users/${encodeURIComponent(username)}/collection/folders/1/releases/${releaseId}`,
  /** Public page for a release: the link target for the mandatory credit. */
  releasePage: (releaseId: number) => `${DISCOGS_WEB_BASE}/release/${releaseId}`,
} as const;
