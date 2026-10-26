/**
 * Pass 2 of the catalogue build (ADR 0012): what the masters dump says about a master:
 * the album as people know it, apart from any one pressing.
 */
import { plainName } from './releases.js';
import { child, children, textOf, type XmlNode } from './xml.js';

export interface MasterFacts {
  id: number;
  mainReleaseId: number;
  title: string;
  artists: string[];
  year: number | null;
  genres: string[];
  styles: string[];
}

export function masterFacts(master: XmlNode): MasterFacts {
  const year = Number.parseInt(textOf(master, 'year'), 10);
  return {
    id: Number.parseInt(master.attributes.id ?? '', 10) || 0,
    mainReleaseId: Number.parseInt(textOf(master, 'main_release'), 10) || 0,
    title: textOf(master, 'title'),
    artists: children(child(master, 'artists'), 'artist')
      .map((artist) => plainName(textOf(artist, 'name')))
      .filter(Boolean),
    // Discogs reports an unknown year as 0.
    year: Number.isFinite(year) && year > 0 ? year : null,
    genres: children(child(master, 'genres'), 'genre').map((g) => g.text.trim()),
    styles: children(child(master, 'styles'), 'style').map((s) => s.text.trim()),
  };
}
