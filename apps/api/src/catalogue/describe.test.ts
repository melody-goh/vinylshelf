import { describe, expect, it } from 'vitest';
import { describeMaster, MAX_CREDITS, telling } from './describe.js';

describe('telling', () => {
  it('puts the people who shaped the record first, then players, and drops paperwork', () => {
    expect(
      telling([
        { name: 'Pianist', role: 'Piano' },
        { name: 'Designer', role: 'Design' },
        { name: 'Cutter', role: 'Lacquer Cut By' },
        { name: 'Mixer', role: 'Mixed By' },
        { name: 'Producer', role: 'Producer' },
        { name: 'Writer', role: 'Written-By' },
      ]).map((c) => c.name),
    ).toEqual(['Producer', 'Mixer', 'Pianist']);
  });

  it('names each person once, under their most telling role, and keeps a dozen at most', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      name: `Player ${String(i)}`,
      role: 'Drums',
    }));
    expect(telling(many)).toHaveLength(MAX_CREDITS);
    expect(
      telling([
        { name: 'Teo', role: 'Piano' },
        { name: 'Teo', role: 'Producer' },
      ]),
    ).toEqual([{ name: 'Teo', role: 'Producer' }]);
  });
});

describe('describeMaster', () => {
  it('leads with sound, era and scene, then people, and ends with title and artists', () => {
    expect(
      describeMaster({
        id: 100,
        mainReleaseId: 1,
        title: 'Kind of Blue',
        artists: ['Miles Davis'],
        year: 1959,
        genres: ['Jazz'],
        styles: ['Modal', 'Hard Bop'],
        labels: ['Columbia'],
        country: 'US',
        credits: [
          { name: 'Bill Evans', role: 'Piano' },
          { name: 'Teo Macero', role: 'Producer' },
        ],
      }),
    ).toBe(
      'Jazz. Modal, Hard Bop. 1959, the 1950s. Columbia, US. Teo Macero (Producer); Bill Evans (Piano). Kind of Blue by Miles Davis.',
    );
  });

  it('leaves out what is not known rather than writing placeholders', () => {
    expect(
      describeMaster({
        id: 1,
        mainReleaseId: 1,
        title: 'Untitled',
        artists: ['Someone'],
        year: null,
        genres: [],
        styles: [],
        labels: [],
        country: null,
        credits: [],
      }),
    ).toBe('Untitled by Someone.');
  });
});
