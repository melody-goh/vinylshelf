/**
 * Server-side sessions (ADR 0006 §1). The browser holds 32 random bytes; we store only
 * their SHA-256 hash. A database leak therefore yields no usable session, and logout
 * revokes the session immediately by deleting its row.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { sessions } from '../db/schema.js';
import type { Clock } from '../lib/clock.js';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SessionStore {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /** Returns the cookie value. It is shown to the browser once and never stored. */
  async create(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.clock.now() + SESSION_TTL_SECONDS * 1000);
    await this.db.insert(sessions).values({ idHash: hash(token), userId, expiresAt });
    return { token, expiresAt };
  }

  /** The user behind a cookie, or null if it is unknown, revoked or expired. */
  async resolve(token: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(
        and(eq(sessions.idHash, hash(token)), gt(sessions.expiresAt, new Date(this.clock.now()))),
      )
      .limit(1);
    return row?.userId ?? null;
  }

  async revoke(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.idHash, hash(token)));
  }
}
