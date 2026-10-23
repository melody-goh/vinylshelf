import { describe, expect, it } from 'vitest';
import { ConfigError, MAX_DISCOGS_TTL_SECONDS, loadConfig } from './config.js';

const validEnv = {
  WEB_ORIGIN: 'http://localhost:5173/',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  DISCOGS_CONSUMER_KEY: 'key',
  DISCOGS_CONSUMER_SECRET: 'secret',
  DISCOGS_CALLBACK_URL: 'http://localhost:3000/api/v1/auth/discogs/callback',
  DISCOGS_USER_AGENT: 'VinylShelfTest/0.0',
};

describe('loadConfig', () => {
  it('applies defaults and normalises the web origin', () => {
    const config = loadConfig(validEnv);
    expect(config.webOrigin).toBe('http://localhost:5173');
    expect(config.discogs.cacheTtlSeconds).toBe(MAX_DISCOGS_TTL_SECONDS);
    expect(config.tokenEncryptionKey).toHaveLength(32);
  });

  it('refuses a Discogs cache TTL longer than 6 hours (ADR 0004)', () => {
    expect(() =>
      loadConfig({ ...validEnv, DISCOGS_CACHE_TTL_SECONDS: String(MAX_DISCOGS_TTL_SECONDS + 1) }),
    ).toThrow(/DISCOGS_CACHE_TTL_SECONDS: must not exceed 6 hours/);
  });

  it('refuses a refresh threshold that is not shorter than the TTL', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        DISCOGS_CACHE_TTL_SECONDS: '120',
        DISCOGS_REFRESH_AFTER_SECONDS: '120',
      }),
    ).toThrow(/DISCOGS_REFRESH_AFTER_SECONDS/);
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    expect(() =>
      loadConfig({ ...validEnv, TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/TOKEN_ENCRYPTION_KEY: must be 32 random bytes/);
  });

  it('lists every problem at once without echoing values', () => {
    let error: unknown;
    try {
      loadConfig({ ...validEnv, DISCOGS_CONSUMER_SECRET: '', DATABASE_URL: 'not a url' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    expect(message).toMatch(/DISCOGS_CONSUMER_SECRET/);
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain('not a url');
  });
});
