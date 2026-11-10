import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import type { TokenCipher } from '../crypto/token-cipher.js';
import type { Database } from '../db/client.js';
import { demoUserIds, users } from '../db/schema.js';
import { demoToken } from '../discogs/demo-gateway.js';
import type { DiscogsIdentity, TokenPair } from '../discogs/gateway.js';

export interface UserRecord {
  id: string;
  discogsUserId: number;
  discogsUsername: string;
  /** A demo visitor (ADR 0014), deleted when their demo ends. */
  demo: boolean;
}

/** The name demo users go by; what the header shows. */
export const DEMO_USERNAME = 'demo';

const record = {
  id: users.id,
  discogsUserId: users.discogsUserId,
  discogsUsername: users.discogsUsername,
  demo: sql<boolean>`${users.demoExpiresAt} is not null`,
};

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
      .returning(record);
    if (!row) throw new Error('User upsert returned no row');
    return row;
  }

  /**
   * A demo user for one visitor (ADR 0014). Its access token is the demo marker, stored
   * encrypted like any other, so every service treats it as an ordinary user and the
   * gateway routes its calls to the demo gateway. Its Discogs id is negative, so it can
   * never meet a real one.
   */
  async createDemo(expiresAt: Date): Promise<UserRecord> {
    const id = randomUUID();
    const token = demoToken(id);
    const [row] = await this.db
      .insert(users)
      .values({
        id,
        discogsUserId: sql`-nextval(${demoUserIds.seqName})`,
        discogsUsername: DEMO_USERNAME,
        oauthTokenEnc: this.cipher.encrypt(token.token, 'discogs_access_token'),
        oauthSecretEnc: this.cipher.encrypt(token.secret, 'discogs_access_secret'),
        demoExpiresAt: expiresAt,
      })
      .returning(record);
    if (!row) throw new Error('Demo user insert returned no row');
    return row;
  }

  /** Deletes demo users whose demo has ended, and with them everything they own. */
  async deleteEndedDemos(now: Date): Promise<number> {
    const deleted = await this.db
      .delete(users)
      .where(and(isNotNull(users.demoExpiresAt), lte(users.demoExpiresAt, now)))
      .returning({ id: users.id });
    return deleted.length;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db.select(record).from(users).where(eq(users.id, id)).limit(1);
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
        demo: row.demoExpiresAt !== null,
      },
      token: {
        token: this.cipher.decrypt(row.oauthTokenEnc, 'discogs_access_token'),
        secret: this.cipher.decrypt(row.oauthSecretEnc, 'discogs_access_secret'),
      },
    };
  }
}
