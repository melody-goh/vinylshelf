/**
 * The text a master is embedded from (ADR 0008 §2). What goes in here is what
 * "similar" means to the taste engine, so it is deliberate:
 *
 * - genres and styles carry most of the sound;
 * - era, label and country carry scene and period;
 * - credits carry the people, which is how collectors actually dig ("same engineer",
 *   "same session players"), so they are kept, most telling roles first.
 *
 * Titles and artist names go last and briefly: they identify a record but say little
 * about what it sounds like, and a long title would otherwise pull unrelated records
 * together. The same function runs in the build and in the API, so a master's vector and
 * any vector computed later always come from the same text.
 */
import type { CatalogueMaster, Credit } from './model.js';

/** How many credits a description keeps; beyond this they add noise, not signal. */
export const MAX_CREDITS = 12;

/**
 * Roles in order of how much they say about a record's sound. A role matches the first
 * pattern it contains; roles matching none are players (instruments), ranked after the
 * people who shaped the record and before the paperwork, which is dropped.
 */
const SHAPERS = [
  /^producer/i,
  /^arranged by/i,
  /^conductor/i,
  /^recorded by/i,
  /^engineer/i,
  /^mixed by/i,
];
const PAPERWORK =
  /lacquer cut|mastered by|design|photograph|artwork|liner notes|layout|art direction|management|legal|a&r|executive|copyright|phonographic|manufactured|distributed|licensed|printed|pressed|lyrics|written-by|written by|composed by|music by|words by|other|coordinator|translated|edited by|sleeve|cover|illustration|typography|notes/i;

function rank(role: string): number {
  const shaper = SHAPERS.findIndex((pattern) => pattern.test(role));
  if (shaper !== -1) return shaper;
  return PAPERWORK.test(role) ? Number.POSITIVE_INFINITY : SHAPERS.length;
}

/** The credits worth describing a record by, most telling first, each person once. */
export function telling(credits: readonly Credit[]): Credit[] {
  const seen = new Set<string>();
  return [...credits]
    .map((credit, index) => ({ credit, index, rank: rank(credit.role) }))
    .filter((c) => Number.isFinite(c.rank))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((c) => c.credit)
    .filter((credit) => {
      if (seen.has(credit.name)) return false;
      seen.add(credit.name);
      return true;
    })
    .slice(0, MAX_CREDITS);
}

function list(items: readonly string[]): string {
  return items.join(', ');
}

/** The embedding text for a master. Pure and stable: same master, same text. */
export function describeMaster(
  master: Omit<CatalogueMaster, 'versions' | 'vinylVersions'>,
): string {
  const parts: string[] = [];
  if (master.genres.length > 0) parts.push(`${list(master.genres)}.`);
  if (master.styles.length > 0) parts.push(`${list(master.styles)}.`);
  if (master.year !== null) {
    parts.push(`${String(master.year)}, the ${String(Math.floor(master.year / 10) * 10)}s.`);
  }
  const place = [list(master.labels.slice(0, 3)), master.country].filter(Boolean).join(', ');
  if (place) parts.push(`${place}.`);
  const people = telling(master.credits);
  if (people.length > 0) {
    parts.push(`${people.map((c) => `${c.name} (${c.role})`).join('; ')}.`);
  }
  parts.push(`${master.title} by ${list(master.artists)}.`);
  return parts.join(' ');
}
