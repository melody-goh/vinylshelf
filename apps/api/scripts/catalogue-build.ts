/**
 * Builds the taste catalogue from a month of Discogs' CC0 dumps (ADR 0012), streaming
 * both over HTTPS: nothing large is written to disk. Run by the "Catalogue" workflow;
 * it also runs locally, at the cost of about 11 GB of download.
 *
 *   pnpm --filter @vinylshelf/api catalogue:build -- --dump 20261001 --cap 150000 --out ./out
 *
 * Needs the model's weights first (`models:fetch`).
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { parseArgs } from 'node:util';
import { createGunzip } from 'node:zlib';
import { buildCatalogue } from '../src/catalogue/build.js';
import { createModelEmbedder } from '../src/taste/embedder.js';

// pnpm may forward a bare "--"; after one, parseArgs would read every option as positional.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    dump: { type: 'string' },
    cap: { type: 'string', default: '150000' },
    out: { type: 'string', default: './catalogue-out' },
  },
});

/** The first of this month, "YYYYMM01": Discogs publishes each month's dump on the 1st. */
function thisMonthsDump(): string {
  const now = new Date();
  return `${String(now.getUTCFullYear())}${String(now.getUTCMonth() + 1).padStart(2, '0')}01`;
}

const dump = values.dump ?? thisMonthsDump();
if (!/^\d{8}$/.test(dump)) throw new Error(`--dump must look like 20261001, not ${dump}`);
const cap = Number.parseInt(values.cap, 10);
if (!Number.isSafeInteger(cap) || cap < 1) throw new Error('--cap must be a positive integer');
const outDir = resolve(values.out);
await mkdir(outDir, { recursive: true });

const urlFor = (kind: 'releases' | 'masters') =>
  `https://data.discogs.com/?download=data%2F${dump.slice(0, 4)}%2Fdiscogs_${dump}_${kind}.xml.gz`;

/** An HTTPS download, decompressed as it arrives. */
async function stream(kind: 'releases' | 'masters'): Promise<Readable> {
  const response = await fetch(urlFor(kind));
  if (!response.ok || !response.body) {
    throw new Error(`Discogs answered ${String(response.status)} for the ${kind} dump of ${dump}`);
  }
  return Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(createGunzip());
}

const started = Date.now();
const manifest = await buildCatalogue(
  { releases: () => stream('releases'), masters: () => stream('masters') },
  {
    outDir,
    cap,
    dump,
    source: 'https://data.discogs.com/ (CC0)',
    embedder: await createModelEmbedder({}),
    log: (message) => {
      console.log(`[${String(Math.round((Date.now() - started) / 1000))}s] ${message}`);
    },
  },
);
console.log(JSON.stringify(manifest, null, 2));
