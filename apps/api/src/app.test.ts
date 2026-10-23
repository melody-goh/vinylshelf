import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { API_PREFIX } from './app.js';
import { PROBLEM_CONTENT_TYPE, ProblemError } from './http/problem.js';
import type { HealthProbe } from './meta/health.js';
import { buildTestApp } from './test/app.js';
import { useTestDatabase } from './test/database.js';

const { handle } = useTestDatabase();
let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(healthProbes: HealthProbe[] = []): Promise<FastifyInstance> {
  app = (await buildTestApp(handle(), { healthProbes })).app;
  return app;
}

describe('GET /health', () => {
  it('is ok when every probe passes', async () => {
    const res = await (await build([() => Promise.resolve(true)])).inject(`${API_PREFIX}/health`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('is degraded, not failing, when a probe fails or throws', async () => {
    const app = await build([
      () => Promise.resolve(true),
      () => Promise.reject(new Error('db down')),
    ]);
    const res = await app.inject(`${API_PREFIX}/health`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'degraded' });
  });
});

describe('problem details', () => {
  it('answers unknown routes with a 404 problem', async () => {
    const res = await (await build()).inject(`${API_PREFIX}/nope`);
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
    expect(res.json()).toMatchObject({ status: 404, code: 'not_found' });
  });

  it('renders a thrown ProblemError with its status, code and headers', async () => {
    const app = await build();
    app.get('/limited', () => {
      throw new ProblemError(429, 'rate_limited', 'Too many requests', undefined, {
        'retry-after': '30',
      });
    });
    const res = await app.inject('/limited');
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.json()).toMatchObject({ code: 'rate_limited', type: '/problems/rate-limited' });
  });

  it('hides the details of unexpected errors', async () => {
    const app = await build();
    app.get('/boom', () => {
      throw new Error('relation "users" does not exist');
    });
    const res = await app.inject('/boom');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ code: 'internal_error' });
    expect(res.body).not.toContain('relation');
  });
});
