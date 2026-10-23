import { describe, expect, it } from 'vitest';
import { authorizationHeader, percentEncode, plaintextSignature } from './oauth1.js';

const consumer = { key: 'ckey', secret: 'csecret' };
const fixed = { nonce: 'n0nce', timestamp: 1_700_000_000 };

/** Parses `OAuth a="1", b="2"` back into a map, decoding the values. */
function parse(header: string): Record<string, string> {
  expect(header.startsWith('OAuth ')).toBe(true);
  return Object.fromEntries(
    header
      .slice('OAuth '.length)
      .split(', ')
      .map((field) => {
        const match = /^([^=]+)="([^"]*)"$/.exec(field);
        if (!match?.[1] || match[2] === undefined) throw new Error(`bad field ${field}`);
        return [match[1], decodeURIComponent(match[2])];
      }),
  );
}

describe('percentEncode', () => {
  it('encodes reserved characters the way RFC 3986 requires', () => {
    expect(percentEncode("a b&c=d/e!'()*~-._")).toBe('a%20b%26c%3Dd%2Fe%21%27%28%29%2A~-._');
  });

  it('encodes non-ASCII as UTF-8', () => {
    expect(percentEncode('Björk')).toBe('Bj%C3%B6rk');
  });
});

describe('plaintextSignature', () => {
  it('joins the encoded secrets with &', () => {
    expect(plaintextSignature('c&s', 't s')).toBe('c%26s&t%20s');
  });

  it('ends with a bare & when there is no token secret yet', () => {
    expect(plaintextSignature('csecret')).toBe('csecret&');
  });
});

describe('authorizationHeader', () => {
  it('builds the request-token header with the callback and no token', () => {
    const fields = parse(
      authorizationHeader({ consumer, callback: 'http://localhost:3000/cb?x=1', ...fixed }),
    );
    expect(fields).toEqual({
      oauth_callback: 'http://localhost:3000/cb?x=1',
      oauth_consumer_key: 'ckey',
      oauth_nonce: 'n0nce',
      oauth_signature: 'csecret&',
      oauth_signature_method: 'PLAINTEXT',
      oauth_timestamp: '1700000000',
      oauth_version: '1.0',
    });
  });

  it('signs the access-token step with the request-token secret (ADR 0006 §5)', () => {
    const fields = parse(
      authorizationHeader({
        consumer,
        token: { token: 'reqtok', secret: 'reqsecret' },
        verifier: 'v123',
        ...fixed,
      }),
    );
    expect(fields).toMatchObject({
      oauth_token: 'reqtok',
      oauth_verifier: 'v123',
      oauth_signature: 'csecret&reqsecret',
    });
    expect(fields).not.toHaveProperty('oauth_callback');
  });

  it('percent-encodes the signature inside the header', () => {
    const header = authorizationHeader({ consumer, token: { token: 't', secret: 's' }, ...fixed });
    expect(header).toContain('oauth_signature="csecret%26s"');
  });

  it('generates a fresh nonce and a current timestamp by default', () => {
    const a = parse(authorizationHeader({ consumer }));
    const b = parse(authorizationHeader({ consumer }));
    expect(a.oauth_nonce).not.toBe(b.oauth_nonce);
    expect(Math.abs(Number(a.oauth_timestamp) - Date.now() / 1000)).toBeLessThan(5);
  });
});
