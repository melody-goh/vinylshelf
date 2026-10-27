/**
 * Labelled descriptions for evaluating search (ADR 0008 §3): what someone might type,
 * and the Discogs styles or genres that a fitting record carries. A result counts as
 * relevant when it has any of them. Most are worded as people describe music, not as
 * Discogs names it, which is where meaning-based search should beat keyword matching.
 * No user data: these are written by hand.
 */
export interface LabelledQuery {
  query: string;
  /** Discogs styles or genres, exactly as Discogs spells them. */
  relevant: string[];
}

export const SEARCH_QUERIES: readonly LabelledQuery[] = [
  { query: 'bossa nova from brazil', relevant: ['Bossa Nova', 'MPB', 'Samba'] },
  { query: 'smooth late-night saxophone', relevant: ['Smooth Jazz', 'Contemporary Jazz'] },
  { query: 'hard-hitting 90s east coast rap', relevant: ['Boom Bap', 'Hip Hop', 'Conscious'] },
  {
    query: 'dreamy guitar pop drowned in reverb',
    relevant: ['Dream Pop', 'Shoegaze', 'Indie Pop'],
  },
  { query: 'fast aggressive heavy metal', relevant: ['Thrash', 'Speed Metal', 'Heavy Metal'] },
  {
    query: 'deep spiritual free jazz',
    relevant: ['Free Jazz', 'Modal', 'Post Bop', 'Avant-garde Jazz'],
  },
  { query: 'classic disco for dancing', relevant: ['Disco', 'Funk'] },
  { query: 'roots reggae from jamaica', relevant: ['Roots Reggae', 'Reggae', 'Dub'] },
  { query: 'calm ambient music to sleep to', relevant: ['Ambient', 'Drone', 'Modern Classical'] },
  { query: 'detroit techno', relevant: ['Techno', 'Electro'] },
  { query: 'chicago house music', relevant: ['House', 'Deep House', 'Acid House'] },
  {
    query: 'gentle 70s singer-songwriter folk',
    relevant: ['Folk', 'Folk Rock', 'Soft Rock', 'Acoustic'],
  },
  {
    query: 'trippy psychedelic rock from the sixties',
    relevant: ['Psychedelic Rock', 'Acid Rock'],
  },
  { query: 'japanese city pop', relevant: ['City Pop', 'J-pop', 'AOR'] },
  { query: 'nigerian afrobeat with big horns', relevant: ['Afrobeat', 'Afro-Cuban', 'Highlife'] },
  { query: 'funky soul with a brass section', relevant: ['Funk', 'Soul'] },
  { query: 'baroque harpsichord and strings', relevant: ['Baroque'] },
  { query: 'romantic era piano music', relevant: ['Romantic', 'Classical'] },
  { query: 'raw 1977 punk rock', relevant: ['Punk', 'Hardcore'] },
  { query: 'eighties synth-driven new wave', relevant: ['Synth-pop', 'New Wave'] },
  { query: 'moody trip hop', relevant: ['Trip Hop', 'Downtempo'] },
  { query: 'fast breakbeats and deep bass, drum and bass', relevant: ['Drum n Bass', 'Jungle'] },
  { query: 'country music with pedal steel', relevant: ['Country', 'Honky Tonk', 'Country Rock'] },
  { query: 'joyful gospel choir', relevant: ['Gospel'] },
  {
    query: 'electric chicago blues with harmonica',
    relevant: ['Chicago Blues', 'Electric Blues', 'Blues'],
  },
  { query: 'salsa from new york', relevant: ['Salsa', 'Latin Jazz', 'Descarga'] },
  { query: 'orchestral film score', relevant: ['Score', 'Soundtrack'] },
  { query: 'krautrock with a motorik beat', relevant: ['Krautrock', 'Experimental'] },
  { query: 'bebop trumpet', relevant: ['Bop', 'Hard Bop'] },
  { query: 'lounge music for cocktails', relevant: ['Lounge', 'Easy Listening', 'Downtempo'] },
];
