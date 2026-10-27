import { describe, expect, it } from 'vitest';
import { rankRoom, type RankContext } from './rank.js';
import { creditText, era, reasonFor } from './reasons.js';
import { buildRooms } from './rooms.js';
import { row } from './testing.js';

const members = [
  row([1, 0, 0, 0], {
    title: 'Kind of Blue',
    artists: ['Miles Davis'],
    styles: ['Modal'],
    labels: ['Columbia'],
    year: 1959,
    people: ['Teo Macero'],
  }),
  row([0.95, 0.1, 0, 0], {
    title: 'Milestones',
    artists: ['Miles Davis'],
    styles: ['Modal', 'Hard Bop'],
    labels: ['Columbia'],
    year: 1958,
    people: ['Teo Macero'],
  }),
  row([0.9, 0.2, 0, 0], {
    title: 'Blue Train',
    artists: ['John Coltrane'],
    styles: ['Hard Bop'],
    labels: ['Blue Note'],
    year: 1957,
    people: ['Rudy Van Gelder'],
  }),
  row([0.92, 0.15, 0.05, 0], {
    title: 'Somethin Else',
    artists: ['Cannonball Adderley'],
    styles: ['Hard Bop'],
    labels: ['Blue Note'],
    year: 1958,
    people: ['Rudy Van Gelder'],
  }),
];
const [room] = buildRooms(members);
if (!room) throw new Error('no room');

const context = (overrides: Partial<RankContext> = {}): RankContext => ({
  distance: 'near',
  limit: 5,
  ownedArtists: new Set(),
  disliked: [],
  taken: new Set(),
  ...overrides,
});

describe('reasonFor', () => {
  it('says what it sounds like and whose fans it is for', () => {
    const pick = row([1, 0.05, 0, 0], { styles: ['Modal', 'Post Bop'], year: 1961 });
    expect(reasonFor(pick, room)).toEqual({
      sound: "Modal and Post Bop, early '60s",
      fansOf: ['Miles Davis', 'Cannonball Adderley'],
      link: null,
    });
  });

  it('links through people behind shelf records first: how collectors actually dig', () => {
    const pick = row([0.9, 0.1, 0, 0], { people: ['Rudy Van Gelder'], labels: ['Prestige'] });
    expect(reasonFor(pick, room).link).toEqual({
      kind: 'people',
      text: "Produced by Rudy Van Gelder, who's on 2 of your records",
      shelfTitles: ['Blue Train', 'Somethin Else'],
    });
  });

  it('says "more from" for an artist on the shelf, and never calls you their fan', () => {
    const pick = row([0.9, 0.1, 0, 0], { artists: ['Miles Davis'], people: ['Miles Davis'] });
    const reason = reasonFor(pick, room);
    expect(reason.link).toMatchObject({
      kind: 'artist',
      text: 'More from Miles Davis, after 2 of your records',
    });
    expect(reason.fansOf).not.toContain('Miles Davis');
  });

  it('then the same label in the same decade', () => {
    const pick = row([0.9, 0.1, 0, 0], { labels: ['Columbia'], year: 1956 });
    expect(reasonFor(pick, room).link).toMatchObject({
      kind: 'label',
      text: "Columbia in the '50s, like 2 of your records",
    });
  });
});

describe('creditText and era', () => {
  it('says credits and eras as a person would', () => {
    expect(creditText('Jerry Hey', 'Arranged By')).toBe('Arranged by Jerry Hey');
    expect(creditText('Jerry Hey', 'Arranged By [Horns]')).toBe('Arranged by Jerry Hey');
    expect(creditText('Jeff Lynne', 'Producer [Produced By]')).toBe('Produced by Jeff Lynne');
    expect(creditText('Marcus Miller', 'Bass')).toBe('Marcus Miller on bass');
    expect(creditText('Quincy Jones', 'Producer')).toBe('Produced by Quincy Jones');
    expect([1960, 1975, 1989, 2002].map(era)).toEqual([
      "early '60s",
      "mid '70s",
      "late '80s",
      'early 2000s',
    ]);
  });
});

describe('rankRoom', () => {
  const close = row([0.97, 0.05, 0, 0], { title: 'Close' });
  const sharesPeople = row([0.8, 0.3, 0.2, 0], {
    title: 'Same Engineer',
    people: ['Rudy Van Gelder'],
  });
  const far = row([0, 0, 1, 0], { title: 'Unrelated' });

  it('ranks what sounds like the room above what does not', () => {
    const picks = rankRoom(room, [far, close], context());
    expect(picks.map((p) => p.master.title)).toEqual(['Close', 'Unrelated']);
  });

  it('lets shared people lift a record that sounds a little further away', () => {
    const plain = row([0.8, 0.3, 0.2, 0], { title: 'Same Sound, Strangers' });
    const picks = rankRoom(room, [plain, sharesPeople], context());
    expect(picks.map((p) => p.master.title)).toEqual(['Same Engineer', 'Same Sound, Strangers']);
  });

  it('suggests an artist at most once, and nothing another room already took', () => {
    const a = row([0.97, 0.05, 0, 0], { artists: ['Coltrane'] });
    const b = row([0.96, 0.06, 0, 0], { artists: ['Coltrane'] });
    expect(rankRoom(room, [a, b], context())).toHaveLength(1);
    expect(rankRoom(room, [a], context({ taken: new Set([a.id]) }))).toHaveLength(0);
  });

  it('far: only artists the user does not own yet', () => {
    const owned = row([0.97, 0.05, 0, 0], { artists: ['Miles Davis'] });
    const fresh = row([0.9, 0.1, 0, 0], { artists: ['Yusef Lateef'] });
    const picks = rankRoom(
      room,
      [owned, fresh],
      context({ distance: 'far', ownedArtists: new Set(['miles davis']) }),
    );
    expect(picks.map((p) => p.master.artists[0])).toEqual(['Yusef Lateef']);
  });

  it('near: puts a new artist ahead of an owned one, and allows one owned artist a room', () => {
    const owned = row([0.97, 0.05, 0, 0], { artists: ['Miles Davis'] });
    const alsoOwned = row([0.96, 0.06, 0, 0], { artists: ['John Coltrane'] });
    const fresh = row([0.94, 0.08, 0, 0], { artists: ['Yusef Lateef'] });
    const picks = rankRoom(
      room,
      [owned, alsoOwned, fresh],
      context({ ownedArtists: new Set(['miles davis', 'john coltrane']) }),
    );
    expect(picks[0]?.master.artists).toEqual(['Yusef Lateef']);
    // One of the two owned artists, never both.
    expect(picks).toHaveLength(2);
  });

  it("does not count a record's own artist as a shared person", () => {
    // Credited as their own producer: no lift, unlike a producer behind shelf records.
    const selfProduced = row([0.8, 0.3, 0.2, 0], {
      title: 'Self Produced',
      artists: ['Rudy Van Gelder'],
      people: ['Rudy Van Gelder'],
    });
    const plain = row([0.8, 0.3, 0.2, 0], { title: 'Plain' });
    const picks = rankRoom(room, [plain, selfProduced], context());
    expect(picks[0]?.score).toBeCloseTo(picks[1]?.score ?? 0);
  });

  it('holds back a near-duplicate of something the user said was not for them', () => {
    const disliked = row([0.97, 0.05, 0, 0]);
    const twin = row([0.97, 0.05, 0, 0], { title: 'Twin' });
    // Still like the room, but not a near-duplicate of the rejected record.
    const other = row([0.7, 0.5, 0.3, 0], { title: 'Other' });
    const picks = rankRoom(room, [twin, other], context({ disliked: [disliked] }));
    expect(picks[0]?.master.title).toBe('Other');
  });
});
