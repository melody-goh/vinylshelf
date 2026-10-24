/**
 * Manual check that the hand-built Discogs fixtures still match the real API.
 *
 *   pnpm --filter @vinylshelf/api fixtures:check [discogs_username]
 *
 * Needs a user who has signed in through the app (their encrypted token is read from
 * the database). It makes four read-only live Discogs calls and prints field paths only, never
 * values. Never run in tests or CI (CLAUDE.md: tests do not hit live APIs).
 * Exits 1 if a live response fails the gateway's schemas, since imports would break.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { UserRepository } from '../src/auth/users.js';
import { loadConfig } from '../src/config.js';
import { TokenCipher } from '../src/crypto/token-cipher.js';
import { createDatabase } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import { checkFixtureShapes } from '../src/discogs/fixture-check.js';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig();
const database = createDatabase(config.databaseUrl, 1);

try {
  const wanted = process.argv[2];
  const candidates = await database.db
    .select({ id: users.id, username: users.discogsUsername })
    .from(users)
    .where(wanted ? eq(users.discogsUsername, wanted) : undefined);
  if (candidates.length !== 1 || !candidates[0]) {
    console.error(
      candidates.length === 0
        ? 'No signed-in user found. Log in through the app first.'
        : 'Several users exist; pass the Discogs username to check with.',
    );
    process.exit(1);
  }

  const owner = await new UserRepository(
    database.db,
    new TokenCipher(config.tokenEncryptionKey),
  ).accessToken(candidates[0].id);
  if (!owner) throw new Error('User disappeared');

  const reports = await checkFixtureShapes({
    consumer: { key: config.discogs.consumerKey, secret: config.discogs.consumerSecret },
    userAgent: config.discogs.userAgent,
    accessToken: owner.token,
    username: owner.user.discogsUsername,
    fixturesDir: new URL('../src/test/fixtures/discogs/', import.meta.url),
  });

  let broken = false;
  for (const report of reports) {
    console.log(`\n${report.endpoint}`);
    const section = (title: string, lines: string[]) => {
      console.log(`  ${title}: ${lines.length === 0 ? 'none' : ''}`);
      for (const line of lines) console.log(`    ${line}`);
    };
    section('schema issues (imports would fail)', report.schemaIssues);
    section('live fields missing from fixture', report.missingFromFixture);
    section('fixture fields not seen live (may be absent in this sample)', report.notSeenLive);
    broken ||= report.schemaIssues.length > 0;
  }
  process.exitCode = broken ? 1 : 0;
} finally {
  await database.close();
}
