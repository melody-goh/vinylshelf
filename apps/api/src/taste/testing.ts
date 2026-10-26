/**
 * Small catalogue rows for the taste engine's unit tests: hand-made vectors, so each
 * test can say exactly which records are alike.
 */
import type { CatalogueRow, Credit } from '../catalogue/model.js';
import { normalise } from './vectors.js';

let next = 1;

export function row(
  vector: number[],
  fields: Partial<Omit<CatalogueRow, 'embedding'>> & { people?: string[] } = {},
): CatalogueRow {
  const id = fields.id ?? next++;
  const credits: Credit[] =
    fields.credits ?? (fields.people ?? []).map((name) => ({ name, role: 'Producer' }));
  return {
    id,
    mainReleaseId: id * 10,
    title: fields.title ?? `Record ${String(id)}`,
    artists: fields.artists ?? [`Artist ${String(id)}`],
    year: fields.year ?? 1970,
    genres: fields.genres ?? ['Jazz'],
    styles: fields.styles ?? [],
    labels: fields.labels ?? [],
    country: null,
    credits,
    versions: fields.versions ?? 3,
    vinylVersions: 1,
    embedding: normalise(Float32Array.from(vector)),
  };
}
