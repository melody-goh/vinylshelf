import { describe, expect, it } from 'vitest';
import { MasterCounts, selectMasters } from './counts.js';

describe('selectMasters', () => {
  it('keeps masters with vinyl, most versions first, ties by id, up to the cap', () => {
    const counts = new MasterCounts();
    const add = (id: number, versions: number, vinyl: number) => {
      for (let i = 0; i < versions; i++) counts.add(id, i < vinyl);
    };
    add(5, 3, 1);
    add(2, 9, 0); // most pressed, but never on vinyl
    add(9, 3, 3);
    add(7, 1, 1);

    expect([...selectMasters(counts, 10).keys()]).toEqual([5, 9, 7]);
    expect([...selectMasters(counts, 2).entries()]).toEqual([
      [5, { versions: 3, vinylVersions: 1 }],
      [9, { versions: 3, vinylVersions: 3 }],
    ]);
  });

  it('grows past its first size for large master ids', () => {
    const counts = new MasterCounts();
    counts.add(5_000_000, true);
    expect(counts.vinylOf(5_000_000)).toBe(1);
    counts.add(0, true); // no master: ignored
    expect(counts.vinylOf(0)).toBe(0);
  });
});
