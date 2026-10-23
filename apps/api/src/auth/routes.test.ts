import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX, type AppDependencies } from '../app.js';
import { users } from '../db/schema.js';
import { useTestDatabase } from '../test/database.js';
import { discogsHandlers, discogsUrls } from '../test/discogs-handlers.js';
import { buildTestApp, testConfig } from '../test/app.js';
import { mswServer } from '../test/msw.js';
import type { Clock } from '../lib/clock.js';

const { db, handle } = useTestDatabase();
const REQUEST_TOKEN = 'RqTkn0000000000000000000000000000000000';
const WEB = testConfig.webOrigin;

let app: FastifyInstance;
let deps: AppDependencies;

beforeEach(async () => {
  mswServer.use(...discogsHandlers());
  ({ app, deps } = await buildTestApp(handle()));
});

afterEach(async () => {
  await app.close();
});

const clock = (): Clock & { time: number } => deps.clock as Clock & { time: number };

function cookie(res: LightMyRequestResponse, name: string) {
  return res.cookies.find((c) => c.name === name);
}

async function startLogin(): Promise<string> {
  const res = await app.inject(`${API_PREFIX}/auth/discogs/start`);
  const requestCookie = cookie(res, 'oauth_req');
  if (!requestCookie) throw new Error('no request cookie');
  return requestCookie.value;
}

async function callback(query: string, requestCookie?: string) {
  return app.inject({
    url: `${API_PREFIX}/auth/discogs/callback?${query}`,
    cookies: requestCookie ? { oauth_req: requestCookie } : {},
  });
}

/** Runs the whole login and returns the session cookie value. */
async function login(): Promise<string> {
  const res = await callback(`oauth_token=${REQUEST_TOKEN}&oauth_verifier=v1`, await startLogin());
  const sid = cookie(res, 'sid');
  if (!sid) throw new Error(`login failed: ${String(res.headers.location)}`);
  return sid.value;
}

describe('GET /auth/discogs/start', () => {
  it('redirects to Discogs and keeps the request token in an encrypted, scoped cookie', async () => {
    const res = await app.inject(`${API_PREFIX}/auth/discogs/start`);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(
      `https://www.discogs.com/oauth/authorize?oauth_token=${REQUEST_TOKEN}`,
    );
    const requestCookie = cookie(res, 'oauth_req');
    expect(requestCookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      path: '/api/v1/auth/discogs',
      maxAge: 600,
    });
    expect(requestCookie?.value).not.toContain('RqScrt');
  });

  it('answers 503 with Retry-After when Discogs is down', async () => {
    mswServer.use(
      http.get(discogsUrls.requestToken, () => new HttpResponse(null, { status: 502 })),
    );
    const res = await app.inject(`${API_PREFIX}/auth/discogs/start`);
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.json()).toMatchObject({ code: 'discogs_unavailable' });
  });
});

describe('GET /auth/discogs/callback', () => {
  it('creates the user with encrypted tokens, starts a session and returns to the app', async () => {
    const res = await callback(
      `oauth_token=${REQUEST_TOKEN}&oauth_verifier=v1`,
      await startLogin(),
    );

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${WEB}/`);
    expect(cookie(res, 'sid')).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

    const [user] = await db().select().from(users);
    expect(user).toMatchObject({ discogsUserId: 1000001, discogsUsername: 'fixture_collector' });
    expect(user?.oauthTokenEnc).not.toContain('AcTkn');
    expect(user?.oauthSecretEnc).not.toContain('AcScrt');
  });

  it('keeps one account per Discogs user across logins', async () => {
    await login();
    await login();
    expect(await db().select().from(users)).toHaveLength(1);
  });

  it.each([
    ['the user declined on Discogs', 'denied=abc', true, 'access_denied'],
    [
      'the request-token cookie is missing',
      `oauth_token=${REQUEST_TOKEN}&oauth_verifier=v`,
      false,
      'invalid_request_token',
    ],
    [
      'the token does not match the cookie',
      'oauth_token=someone-else&oauth_verifier=v',
      true,
      'invalid_request_token',
    ],
    ['the verifier is missing', `oauth_token=${REQUEST_TOKEN}`, true, 'invalid_request_token'],
  ])('redirects with loginError when %s', async (_case, query, withCookie, code) => {
    const res = await callback(query, withCookie ? await startLogin() : undefined);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${WEB}/?loginError=${code}`);
    expect(cookie(res, 'sid')).toBeUndefined();
  });

  it('rejects a request-token cookie older than 10 minutes', async () => {
    const requestCookie = await startLogin();
    clock().time += 10 * 60 * 1000 + 1;
    const res = await callback(`oauth_token=${REQUEST_TOKEN}&oauth_verifier=v`, requestCookie);
    expect(res.headers.location).toBe(`${WEB}/?loginError=invalid_request_token`);
  });

  it('rejects a forged request-token cookie', async () => {
    const res = await callback(
      `oauth_token=${REQUEST_TOKEN}&oauth_verifier=v`,
      'v1.forged.cookie.x',
    );
    expect(res.headers.location).toBe(`${WEB}/?loginError=invalid_request_token`);
  });

  it('maps Discogs failures during the exchange to loginError codes', async () => {
    mswServer.use(
      http.post(discogsUrls.accessToken, () => new HttpResponse(null, { status: 401 })),
    );
    let res = await callback(`oauth_token=${REQUEST_TOKEN}&oauth_verifier=v`, await startLogin());
    expect(res.headers.location).toBe(`${WEB}/?loginError=invalid_request_token`);

    mswServer.use(
      http.post(discogsUrls.accessToken, () => new HttpResponse(null, { status: 503 })),
    );
    res = await callback(`oauth_token=${REQUEST_TOKEN}&oauth_verifier=v`, await startLogin());
    expect(res.headers.location).toBe(`${WEB}/?loginError=discogs_unavailable`);
  });

  it('answers 400 to a request that is not an OAuth callback at all', async () => {
    const res = await callback('');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'invalid_request' });
  });
});

describe('GET /me', () => {
  it('returns the signed-in user', async () => {
    const sid = await login();
    const res = await app.inject({ url: `${API_PREFIX}/me`, cookies: { sid } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ discogsUsername: 'fixture_collector' });
  });

  it('answers 401 without a session, with an unknown one, or after it expired', async () => {
    expect((await app.inject(`${API_PREFIX}/me`)).statusCode).toBe(401);
    const unknown = await app.inject({ url: `${API_PREFIX}/me`, cookies: { sid: 'nope' } });
    expect(unknown.json()).toMatchObject({ status: 401, code: 'unauthenticated' });

    const sid = await login();
    clock().time += 30 * 24 * 60 * 60 * 1000 + 1;
    expect((await app.inject({ url: `${API_PREFIX}/me`, cookies: { sid } })).statusCode).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  const logout = (sid?: string, origin = WEB) =>
    app.inject({
      method: 'POST',
      url: `${API_PREFIX}/auth/logout`,
      headers: { origin },
      cookies: sid ? { sid } : {},
    });

  it('revokes the session server-side, so the old cookie stops working', async () => {
    const sid = await login();
    const res = await logout(sid);
    expect(res.statusCode).toBe(204);
    expect(cookie(res, 'sid')?.value).toBe('');
    expect((await app.inject({ url: `${API_PREFIX}/me`, cookies: { sid } })).statusCode).toBe(401);
  });

  it('answers 401 without a session', async () => {
    expect((await logout()).statusCode).toBe(401);
  });

  it('refuses a cross-site request even with a valid cookie (CSRF)', async () => {
    const sid = await login();
    const res = await logout(sid, 'https://evil.example');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'forbidden_origin' });
    expect((await app.inject({ url: `${API_PREFIX}/me`, cookies: { sid } })).statusCode).toBe(200);
  });
});
