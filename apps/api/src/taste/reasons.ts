/**
 * Why a record is recommended, built from facts the user can check (ADR 0008 §2: our
 * code chooses the reason; a language model may only rephrase it). A reason says what a
 * record sounds like and who it is for, so it invites exploring rather than only
 * pointing back at what is already owned (ADR 0008, Notes 2026-10-28):
 *
 * - sound: its styles and era, the nearest thing the catalogue has to a feel;
 * - fans of: the artists on the shelf whose records sound closest to it;
 * - a link, only when there is a real one: a producer or player behind shelf records
 *   (how collectors actually dig), the artist themselves, or the same label in the
 *   same decade.
 */
import { telling } from '../catalogue/describe.js';
import type { CatalogueRow } from '../catalogue/model.js';
import type { Room } from './rooms.js';
import { dot } from './vectors.js';

export type LinkKind = 'people' | 'artist' | 'label';

export interface Link {
  kind: LinkKind;
  text: string;
  /** Titles of the shelf records that bear the link out, most telling first, up to 3. */
  shelfTitles: string[];
}

export interface Reason {
  /** "Boogie and Disco, early '80s". */
  sound: string;
  /** Up to two shelf artists whose records sound closest, closest first. */
  fansOf: string[];
  link: Link | null;
}

/** Discogs' artist for compilations; never anyone to be a fan of. */
const VARIOUS = 'various';
const FANS_OF = 2;

const lower = (names: readonly string[]) => new Set(names.map((n) => n.toLowerCase()));

/** "'70s", "2000s". */
export function decadeName(decade: number): string {
  return decade < 2000 ? `'${String(decade % 100).padStart(2, '0')}s` : `${String(decade)}s`;
}

/** "early '80s", "mid '60s", "late '90s", "early 2000s". */
export function era(year: number | null): string | null {
  if (year === null) return null;
  const decade = Math.floor(year / 10) * 10;
  const within = year - decade;
  const part = within <= 3 ? 'early' : within <= 6 ? 'mid' : 'late';
  return `${part} ${decadeName(decade)}`;
}

/** A credit as a person would say it: "Produced by X", "Arranged by X", "X on bass". */
export function creditText(name: string, credited: string): string {
  // Discogs' bracketed details ("Arranged By [Horns]", "Backing Vocals [Additional]").
  const role = credited.replace(/\s*\[[^\]]*\]/g, '').trim();
  const doing: Record<string, string> = {
    Producer: 'Produced by',
    'Executive-Producer': 'Executive produced by',
    Engineer: 'Engineered by',
    Arranger: 'Arranged by',
    Conductor: 'Conducted by',
  };
  const said = doing[role];
  if (said) return `${said} ${name}`;
  if (/ By$/.test(role)) return `${role.charAt(0)}${role.slice(1).toLowerCase()} ${name}`;
  return `${name} on ${role.toLowerCase()}`;
}

/** Its two most particular styles (or genre, if it has none) and its era. */
export function soundOf(candidate: CatalogueRow): string {
  const words = (candidate.styles.length > 0 ? candidate.styles : candidate.genres).slice(0, 2);
  const kind = words.length > 0 ? words.join(' and ') : 'Music';
  const when = era(candidate.year);
  return when ? `${kind}, ${when}` : kind;
}

/** Shelf artists whose records are closest in sound, never the pick's own artists. */
export function fansOf(candidate: CatalogueRow, room: Room): string[] {
  const own = lower(candidate.artists);
  const names: string[] = [];
  const seen = new Set<string>();
  const byCloseness = [...room.members].sort(
    (a, b) => dot(b.embedding, candidate.embedding) - dot(a.embedding, candidate.embedding),
  );
  for (const member of byCloseness) {
    for (const artist of member.artists) {
      const key = artist.toLowerCase();
      if (key === VARIOUS || own.has(key) || seen.has(key)) continue;
      seen.add(key);
      names.push(artist);
      if (names.length === FANS_OF) return names;
    }
  }
  return names;
}

const decadeOf = (year: number | null) => (year === null ? null : Math.floor(year / 10) * 10);

/** The artist themselves on other shelf records. */
function artistLink(candidate: CatalogueRow, members: readonly CatalogueRow[]): Link | null {
  const own = lower(candidate.artists);
  const on = members.filter((m) => m.artists.some((a) => own.has(a.toLowerCase())));
  const [first] = on;
  const name = candidate.artists[0];
  if (!first || !name) return null;
  const titles = on.slice(0, 3).map((m) => m.title);
  return {
    kind: 'artist',
    text:
      on.length === 1
        ? `More from ${name}, after ${first.title}`
        : `More from ${name}, after ${String(on.length)} of your records`,
    shelfTitles: titles,
  };
}

/** Someone other than the artist who shaped shelf records shaped this one too. */
function peopleLink(candidate: CatalogueRow, members: readonly CatalogueRow[]): Link | null {
  const own = lower(candidate.artists);
  let best: { name: string; role: string; on: CatalogueRow[] } | null = null;
  for (const credit of telling(candidate.credits)) {
    if (own.has(credit.name.toLowerCase())) continue;
    const on = members.filter((m) => telling(m.credits).some((c) => c.name === credit.name));
    if (on.length > 0 && (!best || on.length > best.on.length)) {
      best = { name: credit.name, role: credit.role, on };
    }
  }
  if (!best) return null;
  const titles = best.on.slice(0, 3).map((m) => m.title);
  const who = creditText(best.name, best.role);
  return {
    kind: 'people',
    text:
      best.on.length === 1
        ? `${who}, as on ${titles[0] ?? ''}`
        : `${who}, who's on ${String(best.on.length)} of your records`,
    shelfTitles: titles,
  };
}

function labelLink(candidate: CatalogueRow, members: readonly CatalogueRow[]): Link | null {
  const decade = decadeOf(candidate.year);
  if (decade === null) return null;
  for (const name of candidate.labels) {
    const on = members.filter((m) => m.labels.includes(name) && decadeOf(m.year) === decade);
    if (on.length >= 2) {
      return {
        kind: 'label',
        text: `${name} in the ${decadeName(decade)}, like ${String(on.length)} of your records`,
        shelfTitles: on.slice(0, 3).map((m) => m.title),
      };
    }
  }
  return null;
}

/**
 * Why `candidate` suits the room it was found for: what it sounds like, whose fans it
 * is for, and the strongest real link to the shelf, if any. People who made shelf
 * records come first, as the most surprising lead; the artist themselves only after them.
 */
export function reasonFor(candidate: CatalogueRow, room: Room): Reason {
  return {
    sound: soundOf(candidate),
    fansOf: fansOf(candidate, room),
    link:
      peopleLink(candidate, room.members) ??
      artistLink(candidate, room.members) ??
      labelLink(candidate, room.members),
  };
}
