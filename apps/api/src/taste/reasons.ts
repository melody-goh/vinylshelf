/**
 * Why a record is recommended, in a form the user can check against their own shelf
 * (ADR 0008 §2: our code chooses the reason; a language model may only rephrase it).
 * Reasons are tried strongest first:
 *
 * 1. people: someone who shaped records on the shelf also shaped this one. This is how
 *    collectors actually dig, and the most surprising reason a pick can have;
 * 2. label and era: the same label in the same decade, a scene;
 * 3. styles: the room's own styles;
 * 4. sound: it is simply close to a particular record on the shelf.
 *
 * Texts are short: the reason, and the shelf records that prove it.
 */
import { telling } from '../catalogue/describe.js';
import type { CatalogueRow } from '../catalogue/model.js';
import type { Room } from './rooms.js';

export type ReasonKind = 'people' | 'label' | 'styles' | 'sound';

export interface Reason {
  kind: ReasonKind;
  text: string;
  /** Titles of the shelf records that bear the reason out, most telling first, up to 3. */
  shelfTitles: string[];
}

const decadeOf = (year: number | null) => (year === null ? null : Math.floor(year / 10) * 10);

function people(candidate: CatalogueRow, members: readonly CatalogueRow[]): Reason | null {
  let best: { name: string; on: CatalogueRow[] } | null = null;
  for (const credit of telling(candidate.credits)) {
    const on = members.filter((m) => telling(m.credits).some((c) => c.name === credit.name));
    if (on.length > 0 && (!best || on.length > best.on.length)) best = { name: credit.name, on };
  }
  if (!best) return null;
  const titles = best.on.slice(0, 3).map((m) => m.title);
  const count = best.on.length;
  // The artist themselves: say so, rather than as if they were a session player.
  if (candidate.artists.some((a) => a.toLowerCase() === best.name.toLowerCase())) {
    return {
      kind: 'people',
      text:
        count === 1
          ? `More from ${best.name}, after ${titles[0] ?? ''}`
          : `More from ${best.name}, after ${String(count)} of your records`,
      shelfTitles: titles,
    };
  }
  return {
    kind: 'people',
    text:
      count === 1
        ? `${best.name}, as on ${titles[0] ?? ''}`
        : `${best.name} is on ${String(count)} of your records`,
    shelfTitles: titles,
  };
}

function label(candidate: CatalogueRow, members: readonly CatalogueRow[]): Reason | null {
  const decade = decadeOf(candidate.year);
  if (decade === null) return null;
  for (const name of candidate.labels) {
    const on = members.filter((m) => m.labels.includes(name) && decadeOf(m.year) === decade);
    if (on.length >= 2) {
      return {
        kind: 'label',
        text: `${name}, ${String(decade)}s, like ${String(on.length)} of your records`,
        shelfTitles: on.slice(0, 3).map((m) => m.title),
      };
    }
  }
  return null;
}

function styles(candidate: CatalogueRow, room: Room, nearest: CatalogueRow): Reason | null {
  const shared = room.styles.filter((s) => candidate.styles.includes(s)).slice(0, 2);
  if (shared.length === 0) return null;
  return {
    kind: 'styles',
    text: `${shared.join(' and ')}, like ${nearest.title}`,
    shelfTitles: [nearest.title],
  };
}

/**
 * The strongest reason for `candidate`, given the room it was found for and the shelf
 * record it is closest to.
 */
export function reasonFor(candidate: CatalogueRow, room: Room, nearest: CatalogueRow): Reason {
  return (
    people(candidate, room.members) ??
    label(candidate, room.members) ??
    styles(candidate, room, nearest) ?? {
      kind: 'sound',
      text: `Close to ${nearest.title}`,
      shelfTitles: [nearest.title],
    }
  );
}
