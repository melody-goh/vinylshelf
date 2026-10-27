/**
 * Builds the taste catalogue from the Discogs dumps (ADR 0012 §2):
 *
 * 1. stream the releases dump: count versions and vinyl versions per master, and spill
 *    each master's main-release details (labels, country, credits) to a file;
 * 2. select the masters with vinyl, most versions first, up to the cap;
 * 3. stream the masters dump, keeping the selected masters' titles, artists, years,
 *    genres and styles;
 * 4. join the two, describe each master and embed the descriptions in batches;
 * 5. write the rows file and its manifest.
 *
 * The dumps arrive as readable streams of XML, so tests pass small fixtures and the
 * workflow passes HTTPS downloads through gunzip; nothing here knows the difference.
 */
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { Embedder } from '../taste/embedder.js';
import { MANIFEST_FILE, ROWS_FILE, writeManifest, writeRows } from './artifact.js';
import { MasterCounts, selectMasters } from './counts.js';
import { describeMaster } from './describe.js';
import { masterFacts, type MasterFacts } from './masters.js';
import {
  CATALOGUE_SCHEMA_VERSION,
  type CatalogueManifest,
  type CatalogueMaster,
  type CatalogueRow,
  type Credit,
  type RecordKind,
} from './model.js';
import { releaseFacts } from './releases.js';
import { streamElements } from './xml.js';

export interface DumpSources {
  /** The releases dump as decompressed XML. */
  releases: () => Promise<Readable>;
  /** The masters dump as decompressed XML. */
  masters: () => Promise<Readable>;
}

export interface BuildOptions {
  /** Directory for the rows file, the manifest and the spill file. */
  outDir: string;
  /** Most masters to keep (ADR 0008: 150,000 fits the free database). */
  cap: number;
  embedder: Embedder;
  /** The dump's date, e.g. "20261001", recorded in the manifest. */
  dump: string;
  /** Where the dumps came from, recorded in the manifest. */
  source: string;
  batchSize?: number;
  log?: (message: string) => void;
  now?: () => Date;
}

/** One line of the spill file: a main release's details, keyed by its master. */
interface MainRelease {
  m: number;
  f: RecordKind;
  l: string[];
  c: string | null;
  k: Credit[];
}

const PROGRESS_EVERY = 500_000;

export async function buildCatalogue(
  sources: DumpSources,
  options: BuildOptions,
): Promise<CatalogueManifest> {
  const log = options.log ?? (() => undefined);
  const spillPath = join(options.outDir, 'main-releases.jsonl');

  // Pass 1: every release counts; main releases also describe their master.
  const counts = new MasterCounts();
  const spill = createWriteStream(spillPath);
  let releases = 0;
  await streamElements(await sources.releases(), 'release', async (node) => {
    const facts = releaseFacts(node);
    counts.add(facts.masterId, facts.isVinyl);
    if (facts.isMainRelease && facts.masterId > 0) {
      const line: MainRelease = {
        m: facts.masterId,
        f: facts.kind,
        l: facts.labels,
        c: facts.country,
        k: facts.credits,
      };
      if (!spill.write(`${JSON.stringify(line)}\n`)) await once(spill, 'drain');
    }
    if (++releases % PROGRESS_EVERY === 0) log(`releases: ${String(releases)}`);
  });
  spill.end();
  await finished(spill);
  log(`releases: ${String(releases)} read`);

  const selected = selectMasters(counts, options.cap);
  log(`selected ${String(selected.size)} masters with vinyl`);

  // Pass 2: the selected masters as people know them.
  const masters = new Map<number, MasterFacts>();
  await streamElements(await sources.masters(), 'master', (node) => {
    const id = Number.parseInt(node.attributes.id ?? '', 10);
    if (selected.has(id)) masters.set(id, masterFacts(node));
  });
  log(`masters: ${String(masters.size)} of ${String(selected.size)} found`);

  // Join the main releases' details onto the selected masters.
  const details = new Map<number, MainRelease>();
  for await (const line of createInterface({ input: createReadStream(spillPath) })) {
    if (!line) continue;
    const main = JSON.parse(line) as MainRelease;
    if (selected.has(main.m) && masters.has(main.m)) details.set(main.m, main);
  }

  // Most-pressed first: the order selection ranked them in.
  const catalogue: CatalogueMaster[] = [];
  for (const [id, { versions, vinylVersions }] of selected) {
    const master = masters.get(id);
    if (!master) continue; // in the releases dump but not the masters dump: skip
    const main = details.get(id);
    catalogue.push({
      ...master,
      // "Various" is Discogs' artist for a compilation, whatever the format says.
      kind: master.artists.includes('Various') ? 'compilation' : (main?.f ?? 'other'),
      labels: main?.l ?? [],
      country: main?.c ?? null,
      credits: main?.k ?? [],
      versions,
      vinylVersions,
    });
  }

  const batchSize = options.batchSize ?? 64;
  async function* embedded(): AsyncGenerator<CatalogueRow> {
    // A batch is padded to its longest text, so texts of similar length are embedded
    // together: within each window, by length. Rows still come out in rank order.
    const window = batchSize * 16;
    for (let start = 0; start < catalogue.length; start += window) {
      const masters = catalogue.slice(start, start + window);
      const texts = masters.map((m) => describeMaster(m));
      const byLength = texts
        .map((_, i) => i)
        .sort((a, b) => (texts[a] ?? '').length - (texts[b] ?? '').length);
      const vectors = new Map<number, Float32Array>();
      for (let b = 0; b < byLength.length; b += batchSize) {
        const indices = byLength.slice(b, b + batchSize);
        const out = await options.embedder.embed(indices.map((i) => texts[i] ?? ''));
        indices.forEach((i, k) => {
          const vector = out[k];
          if (vector) vectors.set(i, vector);
        });
      }
      for (const [i, master] of masters.entries()) {
        const embedding = vectors.get(i);
        if (embedding) yield { ...master, embedding };
      }
      log(
        `embedded ${String(Math.min(start + window, catalogue.length))} of ${String(catalogue.length)}`,
      );
    }
  }

  const written = await writeRows(join(options.outDir, ROWS_FILE), embedded());
  const manifest: CatalogueManifest = {
    schemaVersion: CATALOGUE_SCHEMA_VERSION,
    dump: options.dump,
    model: options.embedder.model,
    rows: written.rows,
    sha256: written.sha256,
    builtAt: (options.now?.() ?? new Date()).toISOString(),
    source: options.source,
  };
  await writeManifest(join(options.outDir, MANIFEST_FILE), manifest);
  log(`wrote ${String(written.rows)} rows`);
  return manifest;
}
