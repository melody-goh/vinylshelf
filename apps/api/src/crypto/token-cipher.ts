/**
 * Authenticated encryption for secrets at rest: Discogs OAuth tokens and the
 * request-token cookie (ADR 0006 §3–4).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * What a ciphertext is for. It is bound in as additional authenticated data, so a
 * value encrypted as one thing cannot be decrypted as another. For example, a stolen
 * request-token cookie cannot be replayed as an access token.
 */
export type CipherPurpose = 'discogs_access_token' | 'discogs_access_secret' | 'oauth_request';

export class TokenDecryptionError extends Error {
  override name = 'TokenDecryptionError';
}

export class TokenCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new RangeError('TokenCipher needs a 32-byte key');
  }

  /** Returns `v1.<iv>.<ciphertext>.<tag>`, base64url. The version prefix allows key rotation. */
  encrypt(plaintext: string, purpose: CipherPurpose): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(Buffer.from(purpose));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv, ciphertext, cipher.getAuthTag()]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  /** Throws `TokenDecryptionError` for anything tampered with, truncated or mis-purposed. */
  decrypt(value: string, purpose: CipherPurpose): string {
    const [version, iv, ciphertext, tag, ...rest] = value.split('.');
    if (version !== VERSION || !iv || ciphertext === undefined || !tag || rest.length > 0) {
      throw new TokenDecryptionError('Malformed ciphertext');
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(purpose));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new TokenDecryptionError('Ciphertext failed authentication', { cause: error });
    }
  }
}
