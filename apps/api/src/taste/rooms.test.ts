import { describe, expect, it } from 'vitest';
import { buildRooms, roomCount } from './rooms.js';
import { row } from './testing.js';

const jazz = (i: number) =>
  row([1, 0.1 * (i % 3), 0, 0], { styles: ['Modal', 'Hard Bop'], title: `Jazz ${String(i)}` });
const ambient = (i: number) =>
  row([0, 0, 1, 0.1 * (i % 3)], { styles: ['Ambient'], title: `Ambient ${String(i)}` });

describe('roomCount', () => {
  it('grows slowly with the shelf and stops at five', () => {
    expect([1, 7, 8, 40, 220, 5000].map(roomCount)).toEqual([1, 1, 1, 2, 5, 5]);
  });
});

describe('buildRooms', () => {
  it('finds the sides of a two-sided shelf, named by their styles', () => {
    const shelf = [
      ...Array.from({ length: 24 }, (_, i) => jazz(i)),
      ...Array.from({ length: 16 }, (_, i) => ambient(i)),
    ];
    const rooms = buildRooms(shelf);

    expect(rooms).toHaveLength(2);
    expect(rooms.map((r) => [r.members.length, r.styles])).toEqual([
      [24, ['Hard Bop', 'Modal']],
      [16, ['Ambient']],
    ]);
  });

  it('folds a side too small to be a room into its nearest', () => {
    const shelf = [
      ...Array.from({ length: 37 }, (_, i) => jazz(i)),
      ...Array.from({ length: 3 }, (_, i) => ambient(i)),
    ];
    expect(buildRooms(shelf)).toHaveLength(1);
  });

  it('gives the same rooms for the same shelf, so picks do not reshuffle on every visit', () => {
    const shelf = [
      ...Array.from({ length: 20 }, (_, i) => jazz(i)),
      ...Array.from({ length: 20 }, (_, i) => ambient(i)),
    ];
    expect(buildRooms(shelf).map((r) => r.id)).toEqual(
      buildRooms([...shelf].reverse()).map((r) => r.id),
    );
  });

  it('makes nothing of an empty shelf', () => {
    expect(buildRooms([])).toEqual([]);
  });
});
