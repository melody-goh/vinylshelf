/**
 * Pass 1 of the catalogue build (ADR 0012): what one release in the releases dump
 * contributes. Every release counts towards its master's version and vinyl counts; only
 * a master's main release contributes the labels, country and credits that describe it.
 */
import type { Credit, RecordKind } from './model.js';
import { child, children, textOf, type XmlNode } from './xml.js';

export interface ReleaseFacts {
  /** 0 when the release belongs to no master; such releases are not in the catalogue. */
  masterId: number;
  isMainRelease: boolean;
  isVinyl: boolean;
  /** From the format descriptions; only a main release's is used. */
  kind: RecordKind;
  labels: string[];
  country: string | null;
  /** Release-level and track-level credits, each person and role once. */
  credits: Credit[];
}

/**
 * Discogs appends " (2)", " (3)", ... to tell apart people who share a name; it is not
 * part of the name anyone knows them by.
 */
export function plainName(name: string): string {
  return name.replace(/ \(\d+\)$/, '').trim();
}

/**
 * Discogs packs several roles into one string ("Producer, Written-By"), but a role's
 * own detail may contain commas too ("Engineer [Recording, Mixing]"), so it splits only
 * on commas outside brackets.
 */
export function splitRoles(roles: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of roles) {
    if (ch === '[') depth++;
    if (ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * A release's shape from its format descriptions ("LP, Album", "7\", Single, 45 RPM").
 * A compilation is a compilation whatever its format; an "LP" with no other word is an
 * album; a 12" with neither is a maxi-single, as disco records usually are.
 */
export function recordKind(descriptions: readonly string[]): RecordKind {
  const has = (...words: string[]) => words.some((w) => descriptions.includes(w));
  if (has('Compilation')) return 'compilation';
  if (has('Album', 'Mini-Album', 'LP')) return 'album';
  if (has('EP')) return 'ep';
  if (has('Single', 'Maxi-Single', '7"', '12"', '10"')) return 'single';
  return 'other';
}

function creditsIn(container: XmlNode | undefined): Credit[] {
  return children(container, 'artist').flatMap((artist) => {
    const name = plainName(textOf(artist, 'name'));
    return name ? splitRoles(textOf(artist, 'role')).map((role) => ({ name, role })) : [];
  });
}

export function releaseFacts(release: XmlNode): ReleaseFacts {
  const master = child(release, 'master_id');
  const formats = children(child(release, 'formats'), 'format');
  const tracks = children(child(release, 'tracklist'), 'track');

  const seen = new Set<string>();
  const credits = [
    ...creditsIn(child(release, 'extraartists')),
    ...tracks.flatMap((track) => creditsIn(child(track, 'extraartists'))),
  ].filter((credit) => {
    const key = `${credit.name}\u0000${credit.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    masterId: Number.parseInt(master?.text.trim() ?? '', 10) || 0,
    isMainRelease: master?.attributes.is_main_release === 'true',
    isVinyl: formats.some((format) => format.attributes.name === 'Vinyl'),
    kind: recordKind(
      formats.flatMap((format) =>
        children(child(format, 'descriptions'), 'description').map((d) => d.text.trim()),
      ),
    ),
    labels: [
      ...new Set(
        children(child(release, 'labels'), 'label')
          .map((label) => plainName(label.attributes.name ?? ''))
          .filter(Boolean),
      ),
    ],
    country: textOf(release, 'country') || null,
    credits,
  };
}
