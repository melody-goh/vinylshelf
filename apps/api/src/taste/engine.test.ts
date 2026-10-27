import { describe, expect, it } from 'vitest';
import { kindsFor, recommend } from './engine.js';
import { scanRetrieve } from './eval/harness.js';
import { row } from './testing.js';

const shelf = [
  ...Array.from({ length: 12 }, (_, i) => row([1, 0.05 * i, 0, 0], { styles: ['Modal'] })),
  ...Array.from({ length: 12 }, (_, i) => row([0, 0, 1, 0.05 * i], { styles: ['Ambient'] })),
];
const catalogue = [
  ...shelf,
  row([0.98, 0.1, 0, 0], { title: 'Jazz Pick' }),
  row([0.97, 0.15, 0, 0], { title: 'Jazz Pick Two' }),
  row([0, 0, 0.98, 0.1], { title: 'Ambient Pick' }),
  row([0, 0.7, 0, 0.7], { title: 'Between' }),
];

const input = () => ({
  shelf,
  liked: [],
  disliked: [],
  ownedMasters: new Set(shelf.map((m) => m.id)),
  ownedArtists: new Set<string>(),
  distance: 'near' as const,
  picksPerRoom: 2,
  retrieve: scanRetrieve(catalogue),
});

describe('recommend', () => {
  it('recommends per room, never what is owned, never one record in two rooms', async () => {
    const rooms = await recommend(input());

    expect(rooms.map((r) => r.room.styles)).toEqual([['Modal'], ['Ambient']]);
    expect(rooms[0]?.picks.map((p) => p.master.title)).toContain('Jazz Pick');
    expect(rooms[1]?.picks[0]?.master.title).toBe('Ambient Pick');
    const all = rooms.flatMap((r) => r.picks.map((p) => p.master.id));
    expect(new Set(all).size).toBe(all.length);
    expect(all.some((id) => shelf.some((m) => m.id === id))).toBe(false);
  });

  it('never suggests a record the user liked or rejected', async () => {
    const jazzPick = catalogue.find((m) => m.title === 'Jazz Pick');
    if (!jazzPick) throw new Error('fixture');
    const rooms = await recommend({ ...input(), disliked: [jazzPick] });
    expect(rooms.flatMap((r) => r.picks.map((p) => p.master.title))).not.toContain('Jazz Pick');
  });
});

describe('kindsFor', () => {
  const room = (kinds: ('album' | 'single' | 'compilation')[]) => ({
    id: 'r',
    centroid: new Float32Array(4),
    styles: [],
    members: kinds.map((kind) => row([1, 0, 0, 0], { kind })),
  });

  it('recommends albums always, and other shapes only where the room holds them', () => {
    expect(kindsFor(room(['album', 'album', 'album', 'album', 'single']))).toEqual(
      new Set(['album', 'single']),
    );
    expect(
      kindsFor(room(['album', 'album', 'album', 'album', 'album', 'album', 'single'])),
    ).toEqual(new Set(['album']));
    expect(kindsFor(room(['single', 'single', 'compilation']))).toEqual(
      new Set(['album', 'single', 'compilation']),
    );
  });

  it('keeps singles off a shelf of albums', async () => {
    const single = row([0.99, 0.05, 0, 0], { title: 'Closest Single', kind: 'single' });
    const rooms = await recommend({ ...input(), retrieve: scanRetrieve([...catalogue, single]) });
    expect(rooms.flatMap((r) => r.picks.map((p) => p.master.title))).not.toContain(
      'Closest Single',
    );
  });
});
