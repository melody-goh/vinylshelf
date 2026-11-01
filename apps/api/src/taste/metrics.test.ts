import { describe, expect, it } from 'vitest';
import { tasteEvents, tasteLists, type TasteEventKind } from '../db/schema.js';
import { testDependencies } from '../test/app.js';
import { useTestDatabase } from '../test/database.js';
import { createUser } from '../test/factories.js';
import { reception } from './metrics.js';

const { db, handle } = useTestDatabase();

async function served(
  userId: string,
  list: { surface: 'discover' | 'search'; distance?: 'near' | 'far'; size: number; at?: Date },
): Promise<string> {
  const [row] = await db()
    .insert(tasteLists)
    .values({
      userId,
      surface: list.surface,
      distance: list.distance ?? null,
      query: list.surface === 'search' ? 'modal jazz' : null,
      picks: Array.from({ length: list.size }, (_, i) => ({ masterId: i + 1, roomId: null })),
      servedAt: list.at ?? new Date(),
    })
    .returning({ id: tasteLists.id });
  return row?.id ?? '';
}

async function happened(
  userId: string,
  listId: string,
  events: [kind: TasteEventKind, position: number][],
) {
  await db()
    .insert(tasteEvents)
    .values(
      events.map(([kind, position]) => ({
        listId,
        userId,
        kind,
        masterId: position + 1,
        position,
        at: new Date(),
      })),
    );
}

describe('reception', () => {
  it('counts each pick once per kind, per surface and reach, overall and by place', async () => {
    const userId = (await createUser(testDependencies(handle()))).id;
    const near = await served(userId, { surface: 'discover', distance: 'near', size: 16 });
    await happened(userId, near, [
      ['viewed', 0],
      ['viewed', 0],
      ['previewed', 0],
      ['previewed', 0],
      ['more', 0],
      ['withdrawn', 0],
      ['viewed', 1],
      ['less', 1],
      ['viewed', 9],
      ['wanted', 9],
    ]);
    const search = await served(userId, { surface: 'search', size: 24 });
    await happened(userId, search, [['viewed', 0]]);
    // Served but never reached: not counted at all.
    await served(userId, { surface: 'discover', distance: 'far', size: 8 });

    const rows = await reception(handle());
    const zeros = { viewed: 0, previewed: 0, opened: 0, wanted: 0, more: 0, less: 0 };
    expect(rows).toEqual([
      {
        surface: 'discover',
        distance: 'near',
        from: null,
        lists: 1,
        reached: 3,
        ...zeros,
        viewed: 3,
        previewed: 1,
        wanted: 1,
        more: 1,
        less: 1,
      },
      {
        surface: 'discover',
        distance: 'near',
        from: 0,
        lists: 1,
        reached: 2,
        ...zeros,
        viewed: 2,
        previewed: 1,
        more: 1,
        less: 1,
      },
      {
        surface: 'discover',
        distance: 'near',
        from: 8,
        lists: 1,
        reached: 1,
        ...zeros,
        viewed: 1,
        wanted: 1,
      },
      { surface: 'search', distance: null, from: null, lists: 1, reached: 1, ...zeros, viewed: 1 },
      { surface: 'search', distance: null, from: 0, lists: 1, reached: 1, ...zeros, viewed: 1 },
    ]);
  });

  it('leaves out lists served before the window', async () => {
    const userId = (await createUser(testDependencies(handle()))).id;
    const old = await served(userId, { surface: 'search', size: 4, at: new Date('2026-01-01') });
    await happened(userId, old, [['viewed', 0]]);
    expect(await reception(handle(), new Date('2026-06-01'))).toEqual([]);
  });
});
