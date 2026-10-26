/**
 * The catalogue as a file (ADR 0012 §3): gzipped JSON Lines, one master per line with
 * its vector as base64 half-precision floats, beside a manifest that says what built it.
 * JSON Lines streams in both directions, so neither writing nor loading 150,000 rows
 * ever holds them all.
 */
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { decodeHalf, encodeHalf } from '../taste/vectors.js';
import { CATALOGUE_SCHEMA_VERSION, type CatalogueManifest, type CatalogueRow } from './model.js';

export const ROWS_FILE = 'catalogue.jsonl.gz';
export const MANIFEST_FILE = 'manifest.json';

/** Writes rows as they come, returning the gzipped file's SHA-256 and row count. */
export async function writeRows(
  path: string,
  rows: AsyncIterable<CatalogueRow>,
): Promise<{ sha256: string; rows: number }> {
  const hash = createHash('sha256');
  const lines = new PassThrough();
  const gzip = createGzip({ level: 9 });
  const tee = new PassThrough();
  tee.on('data', (chunk: Buffer) => hash.update(chunk));
  const done = pipeline(lines, gzip, tee, createWriteStream(path));

  let count = 0;
  for await (const row of rows) {
    const { embedding, ...fields } = row;
    const line = `${JSON.stringify({ ...fields, embedding: encodeHalf(embedding) })}\n`;
    if (!lines.write(line)) await once(lines, 'drain');
    count++;
  }
  lines.end();
  await done;
  return { sha256: hash.digest('hex'), rows: count };
}

export async function writeManifest(path: string, manifest: CatalogueManifest): Promise<void> {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function readManifest(path: string): Promise<CatalogueManifest> {
  const manifest = JSON.parse(await readFile(path, 'utf8')) as CatalogueManifest;
  if (manifest.schemaVersion !== CATALOGUE_SCHEMA_VERSION) {
    throw new Error(
      `Catalogue schema ${String(manifest.schemaVersion)} is not the ${String(CATALOGUE_SCHEMA_VERSION)} this code reads`,
    );
  }
  return manifest;
}

/** The SHA-256 of a file, hex, read as a stream. */
export async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Streams rows back out of a rows file. */
export async function* readRows(path: string): AsyncGenerator<CatalogueRow> {
  const lines = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  for await (const line of lines) {
    if (!line) continue;
    const { embedding, ...fields } = JSON.parse(line) as Omit<CatalogueRow, 'embedding'> & {
      embedding: string;
    };
    yield { ...fields, embedding: decodeHalf(embedding) };
  }
}
