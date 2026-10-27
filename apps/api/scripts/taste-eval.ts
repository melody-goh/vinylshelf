/**
 * Evaluates the taste engine against a real shelf (ADR 0008 §3): the signed-in user's
 * collection in the local database, held out a fold at a time, scored like the CI
 * evaluation against the same baselines, followed by the rooms and picks the full
 * shelf gets, to read with your own ears.
 *
 * Manual and local only. It prints to the terminal and writes nothing: a collection is
 * the user's own data (ADR 0004), so real results are never committed or sent anywhere.
 * Needs a loaded catalogue (catalogue:load) and an imported shelf.
 *
 *   pnpm --filter @vinylshelf/api taste:eval
 *   pnpm --filter @vinylshelf/api taste:eval -- --user some_username --folds 5 --k 20
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { asc, eq, gt } from 'drizzle-orm';
import type { CatalogueRow } from '../src/catalogue/model.js';
import { createDatabase, type DatabaseHandle } from '../src/db/client.js';
import { catalogueMasters, collectionItems, users } from '../src/db/schema.js';
import { recommend } from '../src/taste/engine.js';
import { holdOutFolds } from '../src/taste/eval/folds.js';
import { evaluate, formatReport, scanRetrieve } from '../src/taste/eval/harness.js';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

// pnpm may forward a bare "--"; after one, parseArgs would read every option as positional.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    user: { type: 'string' },
    folds: { type: 'string', default: '5' },
    k: { type: 'string', default: '20' },
    seed: { type: 'string', default: '1' },
  },
});
const folds = Number(values.folds);
const k = Number(values.k);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

/** The whole catalogue, in pages, so no single result holds every vector as text. */
async function readCatalogue(database: DatabaseHandle): Promise<CatalogueRow[]> {
  const rows: CatalogueRow[] = [];
  let after = 0;
  for (;;) {
    const page = await database.db
      .select()
      .from(catalogueMasters)
      .where(gt(catalogueMasters.id, after))
      .orderBy(asc(catalogueMasters.id))
      .limit(10_000);
    if (page.length === 0) return rows;
    for (const row of page) rows.push({ ...row, embedding: Float32Array.from(row.embedding) });
    after = page.at(-1)?.id ?? after;
    process.stdout.write(`\rreading catalogue: ${String(rows.length)}`);
  }
}

async function shelfOwner(database: DatabaseHandle): Promise<{ id: string; name: string }> {
  const all = await database.db.select({ id: users.id, name: users.discogsUsername }).from(users);
  const chosen = values.user ? all.filter((u) => u.name === values.user) : all;
  if (chosen.length === 1 && chosen[0]) return chosen[0];
  throw new Error(
    `Choose a user with --user (${all.map((u) => u.name).join(', ') || 'none signed in'})`,
  );
}

const database = createDatabase(databaseUrl, 2);
try {
  const owner = await shelfOwner(database);
  const items = await database.db
    .select({ masterId: collectionItems.masterId })
    .from(collectionItems)
    .where(eq(collectionItems.userId, owner.id));
  const catalogue = await readCatalogue(database);
  console.log('');
  const byId = new Map(catalogue.map((row) => [row.id, row]));
  const shelf = [...new Set(items.flatMap((i) => (i.masterId ? [i.masterId] : [])))].flatMap(
    (id) => byId.get(id) ?? [],
  );
  console.log(
    `${owner.name}: ${String(items.length)} records, ${String(shelf.length)} in a catalogue of ${String(catalogue.length)}\n`,
  );
  if (shelf.length < folds * 2) throw new Error('Too few catalogued records to hold any out');

  const cases = holdOutFolds(shelf, folds, Number(values.seed));
  for (const distance of ['near', 'far'] as const) {
    const report = await evaluate(catalogue, cases, { k, distance });
    console.log(`${distance}, ${String(folds)} folds\n\n${formatReport(report)}\n`);
  }

  const rooms = await recommend({
    shelf,
    liked: [],
    disliked: [],
    ownedMasters: new Set(shelf.map((row) => row.id)),
    ownedArtists: new Set(shelf.flatMap((row) => row.artists.map((a) => a.toLowerCase()))),
    distance: 'near',
    picksPerRoom: 6,
    retrieve: scanRetrieve(catalogue),
  });
  for (const { room, picks } of rooms) {
    console.log(`Room: ${room.styles.join(', ')} (${String(room.members.length)} records)`);
    for (const pick of picks) {
      console.log(
        [
          `  ${pick.master.artists.join(', ')}: ${pick.master.title} (${String(pick.master.year ?? '?')})`,
          `      ${pick.reason.sound}`,
          pick.reason.fansOf.length > 0
            ? `      for fans of ${pick.reason.fansOf.join(' and ')}`
            : null,
          pick.reason.link ? `      ${pick.reason.link.text}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    console.log('');
  }
} finally {
  await database.close();
}
