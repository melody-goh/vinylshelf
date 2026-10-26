/**
 * Loads a built catalogue into the database named by DATABASE_URL (ADR 0012 §4): the
 * newest GitHub Release by default, a given tag, or a local build directory.
 *
 *   pnpm --filter @vinylshelf/api catalogue:load
 *   pnpm --filter @vinylshelf/api catalogue:load -- --tag catalogue-202610
 *   pnpm --filter @vinylshelf/api catalogue:load -- --dir ./catalogue-out
 */
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadCatalogue } from '../src/catalogue/load.js';
import { downloadCatalogue, findCatalogueRelease } from '../src/catalogue/releases-download.js';
import { createDatabase } from '../src/db/client.js';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

// pnpm may forward a bare "--"; after one, parseArgs would read every option as positional.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    dir: { type: 'string' },
    tag: { type: 'string' },
    repo: { type: 'string', default: process.env.CATALOGUE_REPO ?? 'melody-goh/vinylshelf' },
  },
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

let dir = values.dir ? resolve(values.dir) : null;
let downloaded: string | null = null;
if (!dir) {
  const release = await findCatalogueRelease(values.repo, values.tag);
  downloaded = await mkdtemp(join(tmpdir(), 'catalogue-'));
  console.log(`Downloading ${release.tag_name} from ${values.repo}...`);
  await downloadCatalogue(release, downloaded);
  dir = downloaded;
}

const database = createDatabase(databaseUrl, 2);
try {
  await loadCatalogue(database, dir, {
    log: (message) => {
      console.log(message);
    },
  });
} finally {
  await database.close();
  if (downloaded) await rm(downloaded, { recursive: true, force: true });
}
