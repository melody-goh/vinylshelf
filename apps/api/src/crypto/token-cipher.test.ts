import { describe, expect, it } from 'vitest';
import { TokenCipher, TokenDecryptionError } from './token-cipher.js';

const cipher = new TokenCipher(Buffer.alloc(32, 1));

describe('TokenCipher', () => {
  it('round-trips a secret', () => {
    const encrypted = cipher.encrypt('s3cret-token', 'discogs_access_token');
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain('s3cret');
    expect(cipher.decrypt(encrypted, 'discogs_access_token')).toBe('s3cret-token');
  });

  it('uses a fresh IV, so equal secrets encrypt differently', () => {
    expect(cipher.encrypt('same', 'oauth_request')).not.toBe(
      cipher.encrypt('same', 'oauth_request'),
    );
  });

  it('refuses a ciphertext used for a different purpose', () => {
    const encrypted = cipher.encrypt('token', 'oauth_request');
    expect(() => cipher.decrypt(encrypted, 'discogs_access_token')).toThrow(TokenDecryptionError);
  });

  it('refuses tampered, truncated or foreign-key ciphertexts', () => {
    const encrypted = cipher.encrypt('token', 'discogs_access_secret');
    const [v, iv, ct, tag] = encrypted.split('.');
    const flipped = `${v}.${iv}.${ct?.slice(0, -2) ?? ''}AA.${tag}`;
    expect(() => cipher.decrypt(flipped, 'discogs_access_secret')).toThrow(TokenDecryptionError);
    expect(() => cipher.decrypt(`${v}.${iv}.${ct}`, 'discogs_access_secret')).toThrow(
      TokenDecryptionError,
    );
    const other = new TokenCipher(Buffer.alloc(32, 2));
    expect(() => other.decrypt(encrypted, 'discogs_access_secret')).toThrow(TokenDecryptionError);
  });

  it('rejects a key of the wrong length', () => {
    expect(() => new TokenCipher(Buffer.alloc(16))).toThrow(RangeError);
  });
});
