import { describe, expect, it } from 'vitest';
import { rankRoom, type RankContext } from './rank.js';
import { reasonFor } from './reasons.js';
import { buildRooms } from './rooms.js';
import { row } from './testing.js';

const members = [
  row([1, 0, 0, 0], {
    title: 'Kind of Blue',
    styles: ['Modal'],
    labels: ['Columbia'],
    year: 1959,
    people: ['Teo Macero'],
  }),
  row([0.95, 0.1, 0, 0], {
    title: 'Milestones',
    styles: ['Modal', 'Hard Bop'],
    labels: ['Columbia'],
    year: 1958,
    people: ['Teo Macero'],
  }),
  row([0.9, 0.2, 0, 0], {
    title: 'Blue Train',
    styles: ['Hard Bop'],
    labels: ['Blue Note'],
    year: 1957,
    people: ['Rudy Van Gelder'],
  }),
  row([0.92, 0.15, 0.05, 0], {
    title: 'Somethin Else',
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
  const nearest = members[0] ?? room.members[0];
  if (!nearest) throw new Error('no member');

  it('names shared people first: how collectors actually dig', () => {
    const pick = row([0.9, 0.1, 0, 0], { people: ['Rudy Van Gelder'], labels: ['Prestige'] });
    expect(reasonFor(pick, room, nearest)).toEqual({
      kind: 'people',
      text: 'Rudy Van Gelder is on 2 of your records',
      shelfTitles: ['Blue Train', 'Somethin Else'],
    });
  });

  it('says "more from" when the shared person is the artist', () => {
    const pick = row([0.9, 0.1, 0, 0], {
      artists: ['Teo Macero'],
      people: ['Teo Macero'],
    });
    expect(reasonFor(pick, room, nearest)).toMatchObject({
      kind: 'people',
      text: 'More from Teo Macero, after 2 of your records',
    });
  });

  it('then the same label in the same decade', () => {
    const pick = row([0.9, 0.1, 0, 0], { labels: ['Columbia'], year: 1956 });
    expect(reasonFor(pick, room, nearest)).toMatchObject({
      kind: 'label',
      text: 'Columbia, 1950s, like 2 of your records',
    });
  });

  it("then the room's styles, then plain closeness", () => {
    expect(reasonFor(row([1, 0, 0, 0], { styles: ['Hard Bop'] }), room, nearest)).toMatchObject({
      kind: 'styles',
      text: 'Hard Bop, like Kind of Blue',
    });
    expect(reasonFor(row([1, 0, 0, 0]), room, nearest)).toEqual({
      kind: 'sound',
      text: 'Close to Kind of Blue',
      shelfTitles: ['Kind of Blue'],
    });
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

  it('holds back a near-duplicate of something the user said was not for them', () => {
    const disliked = row([0.97, 0.05, 0, 0]);
    const twin = row([0.97, 0.05, 0, 0], { title: 'Twin' });
    // Still like the room, but not a near-duplicate of the rejected record.
    const other = row([0.7, 0.5, 0.3, 0], { title: 'Other' });
    const picks = rankRoom(room, [twin, other], context({ disliked: [disliked] }));
    expect(picks[0]?.master.title).toBe('Other');
  });
});
