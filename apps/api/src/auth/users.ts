import { eq, sql } from 'drizzle-orm';
import type { TokenCipher } from '../crypto/token-cipher.js';
import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';
import type { DiscogsIdentity, TokenPair } from '../discogs/gateway.js';

export interface UserRecord {
  id: string;
  discogsUserId: number;
  discogsUsername: string;
}

/**
 * Our accounts, keyed by Discogs user id (usernames can change). Access tokens are
 * encrypted before they reach the database and decrypted only when a Discogs call
 * needs them (ADR 0006 §3).
 */
export class UserRepository {
  constructor(
    private readonly db: Database,
    private readonly cipher: TokenCipher,
  ) {}

  /** Creates the account on first login, and refreshes username and tokens afterwards. */
  async upsertFromDiscogs(identity: DiscogsIdentity, accessToken: TokenPair): Promise<UserRecord> {
    const values = {
      discogsUserId: identity.id,
      discogsUsername: identity.username,
      oauthTokenEnc: this.cipher.encrypt(accessToken.token, 'discogs_access_token'),
      oauthSecretEnc: this.cipher.encrypt(accessToken.secret, 'discogs_access_secret'),
    };
    const [row] = await this.db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.discogsUserId,
        set: {
          discogsUsername: values.discogsUsername,
          oauthTokenEnc: values.oauthTokenEnc,
          oauthSecretEnc: values.oauthSecretEnc,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        id: users.id,
        discogsUserId: users.discogsUserId,
        discogsUsername: users.discogsUsername,
      });
    if (!row) throw new Error('User upsert returned no row');
    return row;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        discogsUserId: users.discogsUserId,
        discogsUsername: users.discogsUsername,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ?? null;
  }

  /** The user's decrypted Discogs access token, for gateway calls made on their behalf. */
  async accessToken(id: string): Promise<{ user: UserRecord; token: TokenPair } | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) return null;
    return {
      user: {
        id: row.id,
        discogsUserId: row.discogsUserId,
        discogsUsername: row.discogsUsername,
      },
      token: {
        token: this.cipher.decrypt(row.oauthTokenEnc, 'discogs_access_token'),
        secret: this.cipher.decrypt(row.oauthSecretEnc, 'discogs_access_secret'),
      },
    };
  }
}
