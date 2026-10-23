/**
 * Finds the integration-test database. It prefers TEST_DATABASE_URL and otherwise
 * derives `<name>_test` from DATABASE_URL. Because the tests drop and truncate freely,
 * it refuses any database whose name does not end in `_test`, so a misconfigured
 * environment cannot wipe development or production data.
 */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv): string {
  let url: URL;
  if (env.TEST_DATABASE_URL) {
    url = new URL(env.TEST_DATABASE_URL);
  } else if (env.DATABASE_URL) {
    url = new URL(env.DATABASE_URL);
    url.pathname = `${url.pathname.replace(/^\//, '')}_test`;
  } else {
    throw new Error(
      'Integration tests need Postgres: set TEST_DATABASE_URL (or DATABASE_URL) and run `docker compose up -d`.',
    );
  }
  const name = url.pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against "${name}": the database name must end in _test.`,
    );
  }
  return url.toString();
}
