/**
 * OAuth 1.0a request signing with the PLAINTEXT method (RFC 5849 §3.4.4), the method
 * Discogs documents. PLAINTEXT sends the secrets themselves, protected only by TLS, so
 * callers must use the https:// base URL in `endpoints.ts`. See ADR 0006 §5.
 */
import { randomBytes } from 'node:crypto';

export interface ConsumerCredentials {
  key: string;
  secret: string;
}

export interface TokenPair {
  token: string;
  secret: string;
}

export interface AuthorizationInput {
  consumer: ConsumerCredentials;
  /**
   * The request token (at the access-token step) or the access token (for API calls).
   * Omitted when requesting a request token.
   */
  token?: TokenPair;
  /** Only on the request-token step. */
  callback?: string;
  /** Only on the access-token step. */
  verifier?: string;
  /** Injected in tests for deterministic output. */
  nonce?: string;
  timestamp?: number;
}

/**
 * RFC 3986 unreserved-character encoding, which OAuth requires (RFC 5849 §3.6).
 * `encodeURIComponent` leaves `!'()*` alone, so they are encoded here as well.
 */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** `consumer_secret&token_secret`, each percent-encoded (RFC 5849 §3.4.4). */
export function plaintextSignature(consumerSecret: string, tokenSecret = ''): string {
  return `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
}

/**
 * Builds the `Authorization: OAuth ...` header value. All protocol parameters go in the
 * header (RFC 5849 §3.5.1), never in the URL, so secrets do not end up in access logs.
 */
export function authorizationHeader(input: AuthorizationInput): string {
  const params: Record<string, string> = {
    oauth_consumer_key: input.consumer.key,
    oauth_nonce: input.nonce ?? randomBytes(16).toString('hex'),
    oauth_signature: plaintextSignature(input.consumer.secret, input.token?.secret),
    oauth_signature_method: 'PLAINTEXT',
    oauth_timestamp: String(input.timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
  };
  if (input.token) params.oauth_token = input.token.token;
  if (input.callback !== undefined) params.oauth_callback = input.callback;
  if (input.verifier !== undefined) params.oauth_verifier = input.verifier;

  const fields = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(params[key] ?? '')}"`);
  return `OAuth ${fields.join(', ')}`;
}
