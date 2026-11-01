/**
 * Prints how picks are received (ADR 0013): of the picks people reached, the share they
 * previewed, opened, wanted, asked for more of, or turned down, by surface and reach,
 * then by place in the list. Reads the database named by DATABASE_URL; prints only,
 * writes nothing, and shows no user or record names.
 *
 *   pnpm --filter @vinylshelf/api taste:metrics
 *   pnpm --filter @vinylshelf/api taste:metrics -- --days 7
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createDatabase } from '../src/db/client.js';
import { POSITION_BUCKET, reception, type ReceptionRow } from '../src/taste/metrics.js';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { days: { type: 'string' } },
});
const days = values.days === undefined ? null : Number(values.days);
if (days !== null && !(days > 0)) throw new Error('--days must be a positive number');
const since = days === null ? new Date(0) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const percent = (part: number, whole: number) =>
  whole === 0 ? '–' : `${((100 * part) / whole).toFixed(1)}%`;

const label = (row: ReceptionRow) => {
  const where = row.surface === 'search' ? 'search' : `discover ${row.distance ?? ''}`;
  return row.from === null
    ? where
    : `  places ${String(row.from + 1)}–${String(row.from + POSITION_BUCKET)}`;
};

const database = createDatabase(databaseUrl);
try {
  const rows = await reception(database, since);
  console.log(
    `Taste reception ${days === null ? 'since the start' : `over the last ${String(days)} days`}`,
  );
  if (rows.length === 0) {
    console.log('No events yet.');
  } else {
    console.table(
      Object.fromEntries(
        rows.map((row) => [
          label(row),
          {
            lists: row.lists,
            reached: row.reached,
            viewed: percent(row.viewed, row.reached),
            previewed: percent(row.previewed, row.reached),
            opened: percent(row.opened, row.reached),
            wanted: percent(row.wanted, row.reached),
            more: percent(row.more, row.reached),
            less: percent(row.less, row.reached),
          },
        ]),
      ),
    );
  }
} finally {
  await database.close();
}
