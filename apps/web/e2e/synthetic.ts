/**
 * Synthetic shelf for browser captures: invented records, typed by the contract, with
 * covers drawn as plain placeholders. Nothing here is a real release or a real user's
 * collection (PRODUCT.md: evidence).
 */
import type { CollectionItem, CollectionPage, Release, User } from '@vinylshelf/contract';

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
  };
}
