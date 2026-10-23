import { describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from './database-url.js';

describe('resolveTestDatabaseUrl', () => {
  it('prefers TEST_DATABASE_URL', () => {
    expect(
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: 'postgres://u:p@h:5432/app_test',
        DATABASE_URL: 'postgres://u:p@h:5432/app',
      }),
    ).toBe('postgres://u:p@h:5432/app_test');
  });

  it('derives <name>_test from DATABASE_URL', () => {
    expect(resolveTestDatabaseUrl({ DATABASE_URL: 'postgres://u:p@h:5432/app' })).toBe(
      'postgres://u:p@h:5432/app_test',
    );
  });

  it('refuses a database that is not a test database', () => {
    expect(() =>
      resolveTestDatabaseUrl({ TEST_DATABASE_URL: 'postgres://u:p@h:5432/app' }),
    ).toThrow(/must end in _test/);
  });
});
