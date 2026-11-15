/**
 * Discogs for demo visitors (ADR 0014). A demo user's access token is a marker, never a
 * Discogs credential; the gateway sends calls carrying it here. Their collection and
 * wantlist live in our database, release data is read with the app's own key, and
 * nothing is ever written to Discogs. The services above see the same interface either
 * way, so the demo runs the real app.
 */
import { COLLECTION_PAGE_SIZE } from './http-gateway.js';
import { DiscogsNotFoundError } from './errors.js';
import type {
  CollectionPageResult,
  DiscogsGateway,
  DiscogsIdentity,
  ReleaseDetailData,
  RequestToken,
  SearchPageData,
  TokenPair,
  WantData,
  WantlistPageData,
} from './gateway.js';
import type { Clock } from '../lib/clock.js';

/** What a demo user's access token holds in place of a Discogs token. */
export const DEMO_TOKEN = 'vinylshelf-demo';

/** The access token of a demo user: the marker, and the user it stands for. */
export function demoToken(userId: string): TokenPair {
  return { token: DEMO_TOKEN, secret: userId };
}

export function isDemoToken(token: TokenPair): boolean {
  return token.token === DEMO_TOKEN;
}

/** A demo visitor's own lists, kept in our database (see demo/lists.ts). */
export interface DemoLists {
  collection(userId: string): Promise<{ instanceId: number; releaseId: number; dateAdded: Date }[]>;
  /** Adds a copy and returns its instance id. */
  addToCollection(userId: string, releaseId: number): Promise<number>;
  wants(userId: string): Promise<{ releaseId: number; dateAdded: Date }[]>;
  /** Wants a release; idempotent, returning when it was first wanted. */
  want(userId: string, releaseId: number): Promise<Date>;
  unwant(userId: string, releaseId: number): Promise<void>;
}

/** Discogs reads that need no user: the HTTP gateway signed with the app's key. */
export interface AppReads {
  getReleaseAsApp(releaseId: number): Promise<ReleaseDetailData>;
  searchReleasesAsApp(query: string, page: number): Promise<SearchPageData>;
}

export interface DemoGatewayOptions {
  lists: DemoLists;
  app: AppReads;
  clock: Clock;
  /** How long a release read with the app key is reused; at most the Discogs TTL (ADR 0004). */
  ttlSeconds: number;
}

/** Releases held in memory at most; the oldest go first. */
const HELD_RELEASES = 2000;

export class DemoDiscogsGateway implements DiscogsGateway {
  /** Release reads in flight or recent, so many demo visitors cost one fetch each. */
  private readonly releases = new Map<
    number,
    { data: Promise<ReleaseDetailData>; until: number }
  >();

  constructor(private readonly options: DemoGatewayOptions) {}

  getRequestToken(): Promise<RequestToken> {
    return Promise.reject(new Error('Demo users do not sign in with Discogs'));
  }

  getAccessToken(): Promise<TokenPair> {
    return Promise.reject(new Error('Demo users do not sign in with Discogs'));
  }

  getIdentity(): Promise<DiscogsIdentity> {
    return Promise.reject(new Error('Demo users do not sign in with Discogs'));
  }

  async getCollectionPage(
    token: TokenPair,
    _username: string,
    page: number,
  ): Promise<CollectionPageResult> {
    const all = (await this.options.lists.collection(token.secret)).sort(
      (a, b) => b.dateAdded.getTime() - a.dateAdded.getTime() || b.instanceId - a.instanceId,
    );
    const onPage = all.slice((page - 1) * COLLECTION_PAGE_SIZE, page * COLLECTION_PAGE_SIZE);
    const entries = await Promise.all(
      onPage.map(async (item) => {
        const release = await this.known(item.releaseId);
        return release ? [{ ...item, release }] : [];
      }),
    );
    return {
      page,
      pages: Math.max(1, Math.ceil(all.length / COLLECTION_PAGE_SIZE)),
      totalItems: all.length,
      entries: entries.flat(),
    };
  }

  getRelease(_token: TokenPair, releaseId: number): Promise<ReleaseDetailData> {
    return this.release(releaseId);
  }

  async searchReleases(token: TokenPair, query: string, page: number): Promise<SearchPageData> {
    const [found, wants] = await Promise.all([
      this.options.app.searchReleasesAsApp(query, page),
      this.options.lists.wants(token.secret),
    ]);
    const wanted = new Set(wants.map((w) => w.releaseId));
    return {
      ...found,
      results: found.results.map((r) => ({ ...r, inWantlist: wanted.has(r.discogsId) })),
    };
  }

  async addToCollection(
    token: TokenPair,
    _username: string,
    releaseId: number,
  ): Promise<{ instanceId: number }> {
    // Refuse what Discogs would refuse: a release that does not exist.
    await this.release(releaseId);
    return { instanceId: await this.options.lists.addToCollection(token.secret, releaseId) };
  }

  async getWantlistPage(
    token: TokenPair,
    _username: string,
    page: number,
  ): Promise<WantlistPageData> {
    const all = (await this.options.lists.wants(token.secret)).sort(
      (a, b) => b.dateAdded.getTime() - a.dateAdded.getTime(),
    );
    const onPage = all.slice((page - 1) * COLLECTION_PAGE_SIZE, page * COLLECTION_PAGE_SIZE);
    const wants = await Promise.all(
      onPage.map(async (want) => {
        const release = await this.known(want.releaseId);
        return release ? [{ ...want, release }] : [];
      }),
    );
    return {
      page,
      pages: Math.max(1, Math.ceil(all.length / COLLECTION_PAGE_SIZE)),
      totalItems: all.length,
      wants: wants.flat(),
    };
  }

  async addToWantlist(token: TokenPair, _username: string, releaseId: number): Promise<WantData> {
    const release = await this.release(releaseId);
    const dateAdded = await this.options.lists.want(token.secret, releaseId);
    return { releaseId, dateAdded, release };
  }

  async removeFromWantlist(token: TokenPair, _username: string, releaseId: number): Promise<void> {
    await this.options.lists.unwant(token.secret, releaseId);
  }

  /** A release, reused while it is fresh; a failed read is not kept. */
  private release(releaseId: number): Promise<ReleaseDetailData> {
    const now = this.options.clock.now();
    const held = this.releases.get(releaseId);
    if (held && held.until > now) return held.data;

    const data = this.options.app.getReleaseAsApp(releaseId);
    this.releases.delete(releaseId);
    this.releases.set(releaseId, { data, until: now + this.options.ttlSeconds * 1000 });
    data.catch(() => {
      if (this.releases.get(releaseId)?.data === data) this.releases.delete(releaseId);
    });
    if (this.releases.size > HELD_RELEASES) {
      const [oldest] = this.releases.keys();
      if (oldest !== undefined) this.releases.delete(oldest);
    }
    return data;
  }

  /** A release for a list entry, or null if Discogs no longer has it. */
  private async known(releaseId: number): Promise<ReleaseDetailData | null> {
    try {
      return await this.release(releaseId);
    } catch (error) {
      if (error instanceof DiscogsNotFoundError) return null;
      throw error;
    }
  }
}

/**
 * The gateway the app uses: calls carrying a demo user's token go to the demo gateway,
 * all others to Discogs.
 */
export function withDemo(real: DiscogsGateway, demo: DiscogsGateway): DiscogsGateway {
  const pick = (token: TokenPair) => (isDemoToken(token) ? demo : real);
  return {
    getRequestToken: (callbackUrl) => real.getRequestToken(callbackUrl),
    getAccessToken: (requestToken, verifier) => real.getAccessToken(requestToken, verifier),
    getIdentity: (token) => pick(token).getIdentity(token),
    getCollectionPage: (token, username, page) =>
      pick(token).getCollectionPage(token, username, page),
    getRelease: (token, releaseId) => pick(token).getRelease(token, releaseId),
    searchReleases: (token, query, page) => pick(token).searchReleases(token, query, page),
    addToCollection: (token, username, releaseId) =>
      pick(token).addToCollection(token, username, releaseId),
    getWantlistPage: (token, username, page) => pick(token).getWantlistPage(token, username, page),
    addToWantlist: (token, username, releaseId) =>
      pick(token).addToWantlist(token, username, releaseId),
    removeFromWantlist: (token, username, releaseId) =>
      pick(token).removeFromWantlist(token, username, releaseId),
  };
}
