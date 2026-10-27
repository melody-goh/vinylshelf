/**
 * Synthetic shelf for browser captures: invented records, typed by the contract, with
 * covers drawn as plain placeholders. Nothing here is a real release or a real user's
 * collection (PRODUCT.md: evidence).
 */
import type {
  TasteRecommendations,
  CollectionFacets,
  CollectionItem,
  CollectionPage,
  Release,
  ReleasePreviews,
  SearchPage,
  User,
  WantlistPage,
} from '@vinylshelf/contract';

const HOUR = 60 * 60 * 1000;

export const user: User = {
  id: '6f1c5f53-6e47-4a6b-9a55-2c1f1c0b7a10',
  discogsUsername: 'synthetic_collector',
};

interface Seed {
  title: string;
  artist: string;
  year: number | null;
  colours: string[];
  cover: [string, string];
}

// prettier-ignore
const SEEDS: Seed[] = [
  { title: 'Tidal Lines', artist: 'The Paper Moons', year: 2019, colours: ['Blue Marbled'], cover: ['#1d4e89', '#f2c230'] },
  { title: 'Alpine Suites', artist: 'Ensemble Lumière', year: 1974, colours: [], cover: ['#e2b23a', '#141414'] },
  { title: 'Night Bus Recordings', artist: 'Nightshade', year: null, colours: ['Clear w/ Black Splatter'], cover: ['#2b2b2b', '#e8452c'] },
  { title: 'Orchard Weather', artist: 'Mira Kell', year: 2021, colours: ['Orange'], cover: ['#e0643a', '#f3f3f0'] },
  { title: 'Small Hours', artist: 'The Lantern Club', year: 1966, colours: [], cover: ['#3c3a8f', '#efeee9'] },
  { title: 'Paper Planes for Rain', artist: 'Odile & the Narrows', year: 2008, colours: ['Red'], cover: ['#c9312c', '#f3f3f0'] },
  { title: 'Glasshouse', artist: 'Teo Varga', year: 2015, colours: ['Bone White'], cover: ['#d6d0c4', '#1b1b1b'] },
  { title: 'Northern Exposure', artist: 'Kaito Brandt', year: 1989, colours: ['Green Marbled'], cover: ['#2e6b4f', '#efc12f'] },
  { title: 'Undertow', artist: 'Salt Choir', year: 2023, colours: [], cover: ['#8e2f4f', '#efeee9'] },
  { title: 'Weekend in the Archive', artist: 'Hollis Grey', year: 1997, colours: ['Yellow'], cover: ['#efc12f', '#141414'] },
  { title: 'Signal Fires', artist: 'The Paper Moons', year: 2016, colours: ['Purple'], cover: ['#6a3d9a', '#f3f3f0'] },
  { title: 'Low Tide Radio', artist: 'Ana Ferreira', year: 2012, colours: [], cover: ['#a7c5d9', '#1d4e89'] },
];

export function coverUrl(index: number): string {
  return `https://i.discogs.com/synthetic/cover-${String(index)}.svg`;
}

/** A plain placeholder cover: two flat colours and the title, nothing resembling real art. */
export function coverSvg(index: number): string {
  const seed = SEEDS[index % SEEDS.length] as Seed;
  const [ground, ink] = seed.cover;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
<rect width="600" height="600" fill="${ground}"/>
<circle cx="430" cy="190" r="120" fill="${ink}" opacity="0.85"/>
<text x="48" y="520" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="700" fill="${ink}">${seed.title}</text>
<text x="48" y="560" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="${ink}">synthetic cover</text>
</svg>`;
}

export function items(count = SEEDS.length): CollectionItem[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const seed = SEEDS[i % SEEDS.length] as Seed;
    return {
      instanceId: 2100000001 + i,
      dateAdded: new Date(now - (i + 1) * 9 * 24 * HOUR).toISOString(),
      release: {
        discogsId: 9000001 + i,
        title: seed.title,
        artists: [seed.artist],
        year: seed.year,
        vinylColors: seed.colours,
        coverImageUrl: coverUrl(i),
        discogsUrl: `https://www.discogs.com/release/${String(9000001 + i)}`,
        fetchedAt: new Date(now - HOUR).toISOString(),
        expiresAt: new Date(now + 5 * HOUR).toISOString(),
      },
    };
  });
}

export function page(overrides: Partial<CollectionPage> = {}): CollectionPage {
  const shelf = items();
  return {
    items: shelf,
    totalItems: shelf.length,
    otherFormatsCount: 0,
    matchedItems: shelf.length,
    nextCursor: null,
    refresh: { status: 'idle', importId: null, hiddenCount: 0, retryAt: null },
    ...overrides,
  };
}

export function release(discogsId: number): Release {
  const index = discogsId - 9000001;
  const item = items()[index] ?? items()[0];
  if (!item) throw new Error('no synthetic items');
  return {
    ...item.release,
    label: 'Synthetic Records',
    catalogNumber: `SYN-${String(100 + index)}`,
    genres: ['Rock'],
    styles: ['Indie Rock', 'Dream Pop'],
    formats: ['Vinyl, LP, Album, Limited Edition'],
    credits: [
      { name: 'Ana Ferreira', role: 'Producer' },
      { name: 'Ivo Marsh', role: 'Mastered By' },
      { name: 'Teo Varga', role: 'Artwork' },
    ],
    tracklist: [
      { position: 'A1', title: 'Shoreline', duration: '4:12' },
      { position: 'A2', title: 'Undertow', duration: '3:48' },
      { position: 'A3', title: 'Harbour Lights', duration: '5:20' },
      { position: 'B1', title: 'Low Tide Radio', duration: null },
      { position: 'B2', title: 'Salt', duration: '5:01' },
      { position: 'B3', title: 'A Long Way Round (Reprise)', duration: '2:37' },
    ],
    // Varied per record, and the odd unrated one.
    community: {
      rating:
        index % 5 === 3
          ? { average: 0, count: 0 }
          : { average: 3.6 + (index % 7) * 0.2, count: 40 + index * 37 },
      have: 300 + index * 211,
      want: 90 + index * 53,
    },
  };
}

/** A page of search results built from the synthetic records; the first two are owned. */
export function searchResults(): SearchPage {
  const now = Date.now();
  const results = items().map((item, i) => ({
    discogsId: item.release.discogsId,
    title: item.release.title,
    artists: item.release.artists,
    year: item.release.year ?? null,
    country: ['UK', 'US', 'DE', 'JP'][i % 4] ?? null,
    label: 'Synthetic Records',
    catalogNumber: `SYN-${String(100 + i)}`,
    formats: ['Vinyl', 'LP', ...(i % 3 === 0 ? ['Album', 'Reissue'] : ['Album'])],
    thumbUrl: coverUrl(i),
    discogsUrl: item.release.discogsUrl,
    inCollection: i < 2,
    inWantlist: i === 4,
    fetchedAt: new Date(now - HOUR).toISOString(),
    expiresAt: new Date(now + 5 * HOUR).toISOString(),
  }));
  return { results, page: 1, pages: 3, totalResults: 61 };
}

/** Previews for a synthetic record: every track but the fourth (left silent, unmatched). */
export function previews(discogsId: number): ReleasePreviews {
  const now = Date.now();
  return {
    discogsId,
    albumUrl: `https://music.apple.com/album/synthetic-${String(discogsId)}`,
    attribution: 'Previews provided courtesy of iTunes',
    tracks: release(discogsId).tracklist.map((track, i) => ({
      position: track.position,
      previewUrl:
        i === 3 ? null : `https://audio.example/synthetic/${String(discogsId)}-${String(i)}.wav`,
      storeUrl: i === 3 ? null : `https://music.apple.com/song/synthetic-${String(i)}`,
    })),
    fetchedAt: new Date(now - HOUR).toISOString(),
    expiresAt: new Date(now + 23 * HOUR).toISOString(),
  };
}

/** Thirty seconds of silence as a WAV, so the browser really plays something. */
export function silentWav(seconds = 30, rate = 8000): Buffer {
  const samples = seconds * rate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

/** A library-sized shelf: the synthetic records cycled, so the grid reads as a contact sheet. */
export function libraryPage(count = 60): CollectionPage {
  const shelf = items(count);
  return {
    items: shelf,
    totalItems: shelf.length,
    otherFormatsCount: 0,
    matchedItems: shelf.length,
    nextCursor: null,
    refresh: { status: 'idle', importId: null, hiddenCount: 0, retryAt: null },
  };
}

export function facets(): CollectionFacets {
  return {
    genres: [
      { name: 'Rock', count: 31 },
      { name: 'Electronic', count: 17 },
      { name: 'Jazz', count: 12 },
    ],
    styles: [
      { name: 'Indie Rock', count: 22 },
      { name: 'Dream Pop', count: 14 },
      { name: 'Ambient', count: 9 },
    ],
    decades: [
      { decade: 1960, count: 5 },
      { decade: 1970, count: 10 },
      { decade: 1990, count: 8 },
      { decade: 2010, count: 25 },
    ],
    colourways: { coloured: 35, black: 25 },
    expiresAt: new Date(Date.now() + 5 * HOUR).toISOString(),
  };
}

/** A wantlist of invented records, drawn from the same seeds. */
export function wantlist(): WantlistPage {
  const wanted = items(9).map((item) => ({ dateAdded: item.dateAdded, release: item.release }));
  return { items: wanted, page: 1, pages: 1, totalItems: wanted.length };
}

/** Taste recommendations over invented records; covers come from the releases above. */
export function recommendations(): TasteRecommendations {
  const rooms: [string[], [string, string, string][]][] = [
    [
      ['Soul', 'Disco', 'Funk'],
      [
        ['Velvet Hours', 'The Marlowe Five', 'Ana Ferreira is on 3 of your records'],
        ['Night Shift Sermon', 'Della Crane', 'Ivo Marsh, as on Tidal Lines'],
        ['Golden Hour Rewind', 'Sunfold', 'More from Sunfold, after Alpine Suites'],
        ['Satin City', 'Rue Bellamy', 'Disco and Funk, like Night Bus Recordings'],
        ['Afterparty Light', 'The Cascades of June', 'Close to Orchard Weather'],
      ],
    ],
    [
      ['Indie Rock', 'Dream Pop'],
      [
        ['Lantern Weather', 'Pale Harbour', 'Teo Varga is on 4 of your records'],
        ['Small Engines', 'Ostrander', 'Synthetic Records, 2010s, like 3 of your records'],
        ['Quiet Machines', 'Field Day Static', 'Close to Glasshouse'],
        ['Under the Pier', 'Marsh & Tide', 'Indie Rock, like Undertow'],
      ],
    ],
    [
      ['Ambient'],
      [
        ['Long Water', 'Ilse Moreau', 'Ana Ferreira, as on Low Tide Radio'],
        ['Slow Signal', 'Kestrel Array', 'Close to Signal Fires'],
        ['Fog Index', 'Hollow Pine', 'Ambient, like Small Hours'],
      ],
    ],
  ];
  let n = 0;
  return {
    status: 'ready',
    catalogue: { dump: '20261001', rows: 150000 },
    basedOn: { shelfRecords: 12, inCatalogue: 12 },
    rooms: rooms.map(([styles, picks], r) => ({
      id: `room-${String(r)}`,
      styles,
      size: 12 - r * 3,
      picks: picks.map(([title, artist, text]) => {
        const masterId = 700_000 + n;
        const mainReleaseId = 9000001 + (n++ % 12);
        return {
          master: {
            masterId,
            mainReleaseId,
            title,
            artists: [artist],
            year: 1970 + ((n * 7) % 50),
            genres: ['Rock'],
            styles,
            labels: ['Synthetic Records'],
            discogsUrl: `https://www.discogs.com/master/${String(masterId)}`,
          },
          reason: {
            kind: 'people' as const,
            text,
            shelfTitles: ['Tidal Lines', 'Alpine Suites'],
          },
        };
      }),
    })),
  };
}
