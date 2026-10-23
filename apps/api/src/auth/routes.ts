import type { LoginErrorCode } from '@vinylshelf/contract';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Config } from '../config.js';
import { TokenDecryptionError, type TokenCipher } from '../crypto/token-cipher.js';
import { DiscogsAuthError, DiscogsError } from '../discogs/errors.js';
import type { DiscogsGateway, DiscogsIdentity, TokenPair } from '../discogs/gateway.js';
import { ProblemError } from '../http/problem.js';
import { userSchema } from '../http/schemas.js';
import type { Clock } from '../lib/clock.js';
import { currentUserId, requireUser } from './guard.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, type SessionStore } from './sessions.js';
import type { UserRepository } from './users.js';

const REQUEST_COOKIE = 'oauth_req';
const REQUEST_TOKEN_TTL_SECONDS = 10 * 60;

export interface AuthRouteDependencies {
  config: Pick<Config, 'nodeEnv' | 'webOrigin'> & {
    discogs: Pick<Config['discogs'], 'callbackUrl'>;
  };
  gateway: DiscogsGateway;
  cipher: TokenCipher;
  users: UserRepository;
  sessions: SessionStore;
  clock: Clock;
}

const requestTokenCookie = z.object({ token: z.string(), secret: z.string(), exp: z.number() });

/**
 * Discogs OAuth 1.0a login and the session around it (ADR 0006). The browser
 * navigates to these endpoints directly, so callback failures redirect back to the
 * app with `?loginError=` rather than returning JSON.
 */
export const authRoutes =
  (deps: AuthRouteDependencies): FastifyPluginAsyncZod =>
  (app) => {
    const { config, gateway, cipher, users, sessions, clock } = deps;
    const secure = config.nodeEnv === 'production';
    const cookieBase: CookieSerializeOptions = { httpOnly: true, sameSite: 'lax', secure };
    const requestCookieOptions = { ...cookieBase, path: '/api/v1/auth/discogs' };
    const sessionCookieOptions = { ...cookieBase, path: '/' };

    const backToApp = (error?: LoginErrorCode): string =>
      error ? `${config.webOrigin}/?loginError=${error}` : `${config.webOrigin}/`;

    app.get('/auth/discogs/start', async (_request, reply) => {
      let requestToken;
      try {
        requestToken = await gateway.getRequestToken(config.discogs.callbackUrl);
      } catch (error) {
        if (error instanceof DiscogsError) {
          throw new ProblemError(503, 'discogs_unavailable', 'Discogs is unavailable', undefined, {
            'retry-after': '30',
          });
        }
        throw error;
      }
      const payload = JSON.stringify({
        token: requestToken.token.token,
        secret: requestToken.token.secret,
        exp: clock.now() + REQUEST_TOKEN_TTL_SECONDS * 1000,
      });
      return reply
        .setCookie(REQUEST_COOKIE, cipher.encrypt(payload, 'oauth_request'), {
          ...requestCookieOptions,
          maxAge: REQUEST_TOKEN_TTL_SECONDS,
        })
        .redirect(requestToken.authorizeUrl, 302);
    });

    app.get(
      '/auth/discogs/callback',
      {
        schema: {
          querystring: z.object({
            oauth_token: z.string().min(1).optional(),
            oauth_verifier: z.string().min(1).optional(),
            denied: z.string().optional(),
          }),
        },
      },
      async (request, reply) => {
        const { oauth_token: token, oauth_verifier: verifier, denied } = request.query;
        reply.clearCookie(REQUEST_COOKIE, requestCookieOptions);

        if (denied !== undefined) return reply.redirect(backToApp('access_denied'), 302);
        if (!token) {
          throw new ProblemError(400, 'invalid_request', 'Not an OAuth callback');
        }

        const requestToken = readRequestToken(request.cookies[REQUEST_COOKIE]);
        if (!requestToken || requestToken.token !== token || !verifier) {
          return reply.redirect(backToApp('invalid_request_token'), 302);
        }

        let accessToken: TokenPair;
        let identity: DiscogsIdentity;
        try {
          accessToken = await gateway.getAccessToken(requestToken, verifier);
          identity = await gateway.getIdentity(accessToken);
        } catch (error) {
          if (error instanceof DiscogsAuthError) {
            return reply.redirect(backToApp('invalid_request_token'), 302);
          }
          if (error instanceof DiscogsError) {
            request.log.warn({ err: error }, 'Discogs failed during login');
            return reply.redirect(backToApp('discogs_unavailable'), 302);
          }
          throw error;
        }

        const user = await users.upsertFromDiscogs(identity, accessToken);
        const session = await sessions.create(user.id);
        return reply
          .setCookie(SESSION_COOKIE, session.token, {
            ...sessionCookieOptions,
            maxAge: SESSION_TTL_SECONDS,
          })
          .redirect(backToApp(), 302);
      },
    );

    app.post('/auth/logout', { preHandler: requireUser(sessions) }, async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      if (token) await sessions.revoke(token);
      return reply.clearCookie(SESSION_COOKIE, sessionCookieOptions).status(204).send();
    });

    app.get(
      '/me',
      { preHandler: requireUser(sessions), schema: { response: { 200: userSchema } } },
      async (request) => {
        const user = await users.findById(currentUserId(request));
        // A valid session for a deleted user: treat as signed out.
        if (!user) throw new ProblemError(401, 'unauthenticated', 'Sign in required');
        return { id: user.id, discogsUsername: user.discogsUsername };
      },
    );

    /** Decrypts and checks the request-token cookie; null if missing, forged or expired. */
    function readRequestToken(value: string | undefined): TokenPair | null {
      if (!value) return null;
      try {
        const parsed = requestTokenCookie.safeParse(
          JSON.parse(cipher.decrypt(value, 'oauth_request')),
        );
        if (!parsed.success || parsed.data.exp <= clock.now()) return null;
        return { token: parsed.data.token, secret: parsed.data.secret };
      } catch (error) {
        if (error instanceof TokenDecryptionError || error instanceof SyntaxError) return null;
        throw error;
      }
    }

    return Promise.resolve();
  };
