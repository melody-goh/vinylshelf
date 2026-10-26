/**
 * The taste catalogue's shape (ADR 0008, ADR 0012): one row per Discogs master that has
 * a vinyl pressing, built from the CC0 dumps, with the vector it was embedded to.
 */

/** Bumped whenever a row's fields or their meaning change; the loader refuses others. */
export const CATALOGUE_SCHEMA_VERSION = 1;

/** A person credited on a master's main release, and for what. */
export interface Credit {
  name: string;
  role: string;
}

/** Everything the catalogue keeps about one master, apart from its vector. */
export interface CatalogueMaster {
  /** Discogs master id. */
  id: number;
  /** The release Discogs picks to stand for the master; wanting or adding uses it. */
  mainReleaseId: number;
  title: string;
  artists: string[];
  /** The master's original year; null when Discogs does not know it. */
  year: number | null;
  genres: string[];
  styles: string[];
  /** Labels of the main release, in Discogs' order. */
  labels: string[];
  country: string | null;
  /** The people who made the record, most telling roles first (see describe.ts). */
  credits: Credit[];
  /** Releases of this master in any format: how often it has been pressed and reissued. */
  versions: number;
  /** Of those, how many are vinyl. At least one, or it is not in the catalogue. */
  vinylVersions: number;
}

export interface CatalogueRow extends CatalogueMaster {
  /** Unit-length embedding of `describeMaster(master)`. */
  embedding: Float32Array;
}

/** Which model a catalogue's vectors come from; queries must use the same one. */
export interface EmbeddingModelInfo {
  id: string;
  /** Quantisation of the ONNX weights. */
  dtype: string;
  dims: number;
  pooling: 'cls' | 'mean';
}

/** Describes a built catalogue file, so a loader can check what it is about to load. */
export interface CatalogueManifest {
  schemaVersion: number;
  /** The dump the catalogue was built from, e.g. "20261001". */
  dump: string;
  model: EmbeddingModelInfo;
  rows: number;
  /** SHA-256 of the gzipped rows file, hex. */
  sha256: string;
  builtAt: string;
  source: string;
}
