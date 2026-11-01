import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { API_PREFIX } from '../app.js';
import { LOGIN_STARTS_PER_MINUTE } from '../auth/routes.js';
import { buildTestApp, testConfig } from '../test/app.js';
import { useTestDatabase } from '../test/database.js';
import { discogsHandlers } from '../test/discogs-handlers.js';
import { mswServer } from '../test/msw.js';
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER } from './proxy.js';

const SECRET = 's'.repeat(32);
const { handle } = useTestDatabase();
let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(proxySecret: string | null): Promise<FastifyInstance> {
  app = (await buildTestApp(handle(), { config: { ...testConfig, proxySecret } })).app;
  return app;
}

describe('proxyGuard', () => {
  it('refuses requests that did not come through the proxy', async () => {
    const app = await build(SECRET);
    for (const headers of [{}, { [PROXY_SECRET_HEADER]: 'x'.repeat(32) }]) {
      const res = await app.inject({ url: `${API_PREFIX}/me`, headers });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'forbidden_origin' });
    }
  });

  it('lets the proxy through, and the host health check without it', async () => {
    const app = await build(SECRET);
    const proxied = await app.inject({
      url: `${API_PREFIX}/me`,
      headers: { [PROXY_SECRET_HEADER]: SECRET },
    });
    expect(proxied.statusCode).toBe(401);
    expect((await app.inject(`${API_PREFIX}/health`)).statusCode).toBe(200);
  });

  it('limits sign-in starts per visitor, not per proxy', async () => {
    const app = await build(SECRET);
    const start = (ip: string) =>
      app.inject({
        url: `${API_PREFIX}/auth/discogs/start`,
        headers: { [PROXY_SECRET_HEADER]: SECRET, [CLIENT_IP_HEADER]: ip },
      });
    mswServer.use(...discogsHandlers());
    for (let i = 0; i < LOGIN_STARTS_PER_MINUTE; i++) await start('203.0.113.1');
    expect((await start('203.0.113.1')).statusCode).toBe(429);
    expect((await start('203.0.113.2')).statusCode).toBe(302);
  });

  it('lets everything through when no secret is configured', async () => {
    const app = await build(null);
    expect((await app.inject(`${API_PREFIX}/me`)).statusCode).toBe(401);
  });
});
