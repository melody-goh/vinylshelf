import { describe, expect, it } from 'vitest';
import type { StoreAlbum, StoreSong } from './gateway.js';
import { chooseAlbum, matchTracks, normalise } from './match.js';

const album = (id: number, title: string, artist: string, trackCount: number): StoreAlbum => ({
  collectionId: id,
  title,
  artist,
  trackCount,
  storeUrl: `https://music.apple.com/album/${String(id)}`,
});

const song = (n: number, title: string, preview = true): StoreSong => ({
  title,
  discNumber: 1,
  trackNumber: n,
  previewUrl: preview ? `https://audio.example/${String(n)}.m4a` : null,
  storeUrl: `https://music.apple.com/song/${String(n)}`,
});

describe('normalise', () => {
  it('ignores editions, remasters, featured artists, accents and punctuation', () => {
    expect(normalise('Undertow (2019 Remaster)')).toBe('undertow');
    expect(normalise('Tidal Lines [Deluxe Edition]')).toBe('tidal lines');
    expect(normalise('Salt - 2011 Remastered Version')).toBe('salt');
    expect(normalise('Glasshouse (feat. Teo Varga)')).toBe('glasshouse');
    expect(normalise('Ensemble Lumière')).toBe('ensemble lumiere');
    expect(normalise('Odile & the Narrows')).toBe('odile and the narrows');
    expect(normalise('The Paper Moons')).toBe('paper moons');
  });

  it('keeps a live take apart from the studio song', () => {
    expect(normalise('Shoreline (Live)')).not.toBe(normalise('Shoreline'));
  });
});

describe('chooseAlbum', () => {
  const release = { title: 'Tidal Lines', artists: ['The Paper Moons'], trackCount: 4 };

  it('prefers the edition with the same number of tracks', () => {
    const chosen = chooseAlbum(
      [
        album(1, 'Tidal Lines (Deluxe Edition)', 'The Paper Moons', 6),
        album(2, 'Tidal Lines', 'The Paper Moons', 4),
      ],
      release,
    );
    expect(chosen?.collectionId).toBe(2);
  });

  it('falls back to Apple’s ranking when no edition has the same count', () => {
    const chosen = chooseAlbum(
      [album(1, 'Tidal Lines', 'The Paper Moons', 9), album(2, 'Tidal Lines', 'Paper Moons', 7)],
      release,
    );
    expect(chosen?.collectionId).toBe(1);
  });

  it('refuses the right title by the wrong artist, and the wrong title', () => {
    expect(
      chooseAlbum([album(3, 'Tidal Lines', 'Tidal Lines Tribute Band', 4)], release),
    ).toBeNull();
    expect(chooseAlbum([album(4, 'Tidal Lines II', 'The Paper Moons', 4)], release)).toBeNull();
  });
});

describe('matchTracks', () => {
  const tracklist = [
    { position: 'A1', title: 'Shoreline' },
    { position: 'A2', title: 'Undertow' },
    { position: 'B1', title: 'Low Tide Radio' },
    { position: 'B2', title: 'Salt' },
  ];

  it('matches by title, whatever order Apple lists the songs in', () => {
    const matched = matchTracks(tracklist, [
      song(4, 'Salt'),
      song(1, 'Shoreline'),
      song(2, 'Undertow (Remastered)'),
      song(3, 'Low Tide Radio', false),
    ]);
    expect(matched.map((t) => [t.position, t.previewUrl])).toEqual([
      ['A1', 'https://audio.example/1.m4a'],
      ['A2', 'https://audio.example/2.m4a'],
      // Sold, but Apple has no preview for it: linked, silent.
      ['B1', null],
      ['B2', 'https://audio.example/4.m4a'],
    ]);
    expect(matched[2]?.storeUrl).toBe('https://music.apple.com/song/3');
  });

  it('pairs leftovers by order only when both lists are the same length', () => {
    const renamed = [
      song(1, 'Shoreline'),
      song(2, 'Under Tow'),
      song(3, 'Low Tide Radio'),
      song(4, 'Salt'),
    ];
    expect(matchTracks(tracklist, renamed)[1]?.previewUrl).toBe('https://audio.example/2.m4a');

    const longer = [...renamed, song(5, 'Bonus Track')];
    expect(matchTracks(tracklist, longer)[1]?.previewUrl).toBeNull();
  });

  it('never uses one song for two tracks', () => {
    const matched = matchTracks(
      [
        { position: 'A1', title: 'Salt' },
        { position: 'B1', title: 'Salt' },
      ],
      [song(1, 'Salt')],
    );
    expect(matched.map((t) => t.previewUrl)).toEqual(['https://audio.example/1.m4a', null]);
  });
});
