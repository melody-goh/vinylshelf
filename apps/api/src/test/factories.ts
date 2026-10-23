import { SessionStore } from '../auth/sessions.js';
import { UserRepository, type UserRecord } from '../auth/users.js';
import type { AppDependencies } from '../app.js';

/** A user who has signed in with the fixture Discogs account. */
export async function createUser(
  deps: AppDependencies,
  identity = { id: 1000001, username: 'fixture_collector' },
): Promise<UserRecord> {
  return new UserRepository(deps.database.db, deps.cipher).upsertFromDiscogs(identity, {
    token: 'acc-token',
    secret: 'acc-secret',
  });
}

/** A session cookie value for the user, as if they had just logged in. */
export async function sessionFor(deps: AppDependencies, userId: string): Promise<string> {
  return (await new SessionStore(deps.database.db, deps.clock).create(userId)).token;
}
