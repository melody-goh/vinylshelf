/**
 * The demo's sample shelf and wantlist (ADR 0014): well-known records across seven
 * styles, so Discover has distinct rooms to work with. Public Discogs release ids,
 * each a vinyl LP pressing, with the catalogue master it belongs to. Curated, not
 * anyone's collection.
 */
export interface SampleRecord {
  releaseId: number;
  masterId: number;
  /** For reading this list; the app shows what Discogs says. */
  title: string;
}

export const SAMPLE_SHELF: readonly SampleRecord[] = [
  // Jazz
  { releaseId: 23225960, masterId: 5460, title: 'Miles Davis – Kind Of Blue' },
  { releaseId: 11341786, masterId: 32287, title: 'John Coltrane – A Love Supreme' },
  { releaseId: 5193282, masterId: 32208, title: 'John Coltrane – Blue Train' },
  { releaseId: 16293251, masterId: 47828, title: 'Herbie Hancock – Maiden Voyage' },
  { releaseId: 2527331, masterId: 47813, title: 'Ornette Coleman – The Shape Of Jazz To Come' },
  // Soul and funk
  { releaseId: 18215530, masterId: 66631, title: "Marvin Gaye – What's Going On" },
  { releaseId: 7082857, masterId: 87440, title: 'Stevie Wonder – Songs In The Key Of Life' },
  { releaseId: 4920701, masterId: 86466, title: 'Stevie Wonder – Innervisions' },
  { releaseId: 6797171, masterId: 123018, title: 'Aretha Franklin – Lady Soul' },
  { releaseId: 473679, masterId: 78507, title: "Sly & The Family Stone – There's A Riot Goin' On" },
  { releaseId: 5951698, masterId: 30117, title: 'Curtis Mayfield – Curtis' },
  { releaseId: 147819, masterId: 435524, title: 'Michael Jackson – Off The Wall' },
  { releaseId: 11526143, masterId: 42018, title: 'Chaka Khan – I Feel For You' },
  // Folk and soft rock
  { releaseId: 7894403, masterId: 38722, title: 'Fleetwood Mac – Rumours' },
  { releaseId: 10028381, masterId: 47744, title: 'Joni Mitchell – Blue' },
  { releaseId: 15814562, masterId: 13933, title: 'Nick Drake – Pink Moon' },
  { releaseId: 7393516, masterId: 104166, title: 'Carole King – Tapestry' },
  { releaseId: 8214722, masterId: 37615, title: 'Neil Young – Harvest' },
  { releaseId: 26344544, masterId: 27757, title: 'Simon & Garfunkel – Bookends' },
  // Electronic and trip hop
  { releaseId: 32662, masterId: 565, title: 'Aphex Twin – Selected Ambient Works 85-92' },
  { releaseId: 2879, masterId: 26647, title: 'Daft Punk – Discovery' },
  { releaseId: 5058, masterId: 15313, title: 'DJ Shadow – Endtroducing.....' },
  { releaseId: 2798033, masterId: 1622, title: 'AIR – Moon Safari' },
  { releaseId: 22840, masterId: 5542, title: 'Portishead – Dummy' },
  // Japan
  { releaseId: 2179374, masterId: 351396, title: 'Tatsuro Yamashita – For You' },
  { releaseId: 3381934, masterId: 408982, title: 'Haruomi Hosono – Pacific' },
  // Afrobeat
  { releaseId: 2996442, masterId: 150519, title: 'Fela Kuti – Expensive Shit' },
  { releaseId: 13245475, masterId: 532182, title: 'Fela Kuti – Zombie' },
  // Hip hop
  { releaseId: 392604, masterId: 20148, title: 'Nas – Illmatic' },
  { releaseId: 362487, masterId: 45922, title: 'A Tribe Called Quest – The Low End Theory' },
  { releaseId: 242785, masterId: 8554, title: 'Madvillain – Madvillainy' },
];

export const SAMPLE_WANTS: readonly SampleRecord[] = [
  { releaseId: 9664187, masterId: 19493, title: 'Herbie Hancock – Head Hunters' },
  { releaseId: 242790, masterId: 68130, title: "Erykah Badu – Mama's Gun" },
  { releaseId: 7092674, masterId: 17217, title: 'The Beach Boys – Pet Sounds' },
];
