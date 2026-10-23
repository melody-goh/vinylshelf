import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { runInTransaction } from '../db/transaction.js';
import { useTestDatabase } from '../test/database.js';
import { PgBossQueue, QUEUES } from './queue.js';

const { handle } = useTestDatabase();
const queue = new PgBossQueue({
  connectionString: inject('testDatabaseUrl'),
  pollingIntervalSeconds: 0.5,
  onError: (error) => {
    throw error;
  },
});

// Every job the worker sees, keyed by its payload id.
const received = new Map<string, () => void>();
const seen = new Set<string>();

beforeAll(async () => {
  await queue.start();
  await queue.work(QUEUES.collectionImport.name, (job) => {
    seen.add(job.data.importJobId);
    received.get(job.data.importJobId)?.();
    return Promise.resolve();
  });
});

afterAll(async () => {
  await queue.stop();
});

function delivered(marker: string, timeoutMs = 5000): Promise<boolean> {
  if (seen.has(marker)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
    received.set(marker, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

describe('PgBossQueue', () => {
  it('delivers a job enqueued inside a committed transaction', async () => {
    const marker = randomUUID();
    await runInTransaction(handle().pool, (tx) =>
      queue.enqueue(QUEUES.collectionImport.name, { importJobId: marker }, { tx: tx.sql }),
    );
    expect(await delivered(marker)).toBe(true);
  });

  it('drops a job whose transaction rolled back (ADR 0003)', async () => {
    const marker = randomUUID();
    await expect(
      runInTransaction(handle().pool, async (tx) => {
        await queue.enqueue(QUEUES.collectionImport.name, { importJobId: marker }, { tx: tx.sql });
        throw new Error('the state change failed');
      }),
    ).rejects.toThrow('the state change failed');

    expect(await delivered(marker, 2000)).toBe(false);
  });
});
