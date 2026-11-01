/**
 * Evaluates search by description (ADR 0008 §3) against the loaded catalogue, with the
 * real embedding model: for each labelled description, how many of the top ten carry
 * one of its expected styles or genres (precision@10), and whether the first does. A
 * keyword baseline (records whose style and genre names contain the description's
 * words, most pressed first) shows what searching by meaning adds.
 *
 * Manual and local: it needs `models:fetch` and a loaded catalogue, and uses no shelf,
 * so it measures search itself, not the lean towards anyone's taste.
 *
 *   pnpm --filter @vinylshelf/api search:eval
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CatalogueRow } from '../src/catalogue/model.js';
import { createDatabase } from '../src/db/client.js';
import { createModelEmbedder } from '../src/taste/embedder.js';
import { scanMatchNames, scanRetrieve } from '../src/taste/eval/harness.js';
import { readCatalogue } from '../src/taste/eval/read-catalogue.js';
import { SEARCH_QUERIES } from '../src/taste/eval/search-queries.js';
import { lazyQueryEmbedder } from '../src/taste/query-embedder.js';
import { searchCatalogue, SEARCH_KINDS } from '../src/taste/search.js';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const K = 10;
const relevantTo = (row: CatalogueRow, labels: readonly string[]) =>
  [...row.styles, ...row.genres].some((s) => labels.includes(s));

/** Records whose style and genre names share the most words with the description. */
function keyword(catalogue: readonly CatalogueRow[], query: string): CatalogueRow[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return catalogue
    .filter((row) => SEARCH_KINDS.has(row.kind))
    .map((row) => {
      const names = [...row.styles, ...row.genres].join(' ').toLowerCase();
      return { row, hits: words.filter((w) => w.length > 2 && names.includes(w)).length };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.row.versions - a.row.versions)
    .slice(0, K)
    .map((s) => s.row);
}

const database = createDatabase(databaseUrl, 2);
try {
  const catalogue = await readCatalogue(database, (read) => {
    process.stdout.write(`\rreading catalogue: ${String(read)}`);
  });
  console.log('\n');
  const embedder = lazyQueryEmbedder(() => createModelEmbedder({}));
  const retrieve = scanRetrieve(catalogue);
  const matchNames = scanMatchNames(catalogue);
  const precision = (rows: readonly CatalogueRow[], labels: readonly string[]) =>
    rows.filter((r) => relevantTo(r, labels)).length / K;

  const lines = [
    '| Description | Hybrid P@10 | Meaning only | Keyword only | Hybrid top result |',
    '|---|---|---|---|---|',
  ];
  const sums = { hybrid: 0, meaning: 0, keyword: 0 };
  let firstHits = 0;
  for (const { query, relevant } of SEARCH_QUERIES) {
    const vector = await embedder.embedQuery(query);
    const run = async (namesWeight?: number) =>
      (
        await searchCatalogue({
          query: vector,
          description: query,
          shelf: [],
          exclude: new Set(),
          retrieve,
          matchNames,
          limit: K,
          ...(namesWeight === undefined ? {} : { namesWeight }),
        })
      ).map((h) => h.master);
    const hybrid = await run();
    const scores = {
      hybrid: precision(hybrid, relevant),
      meaning: precision(await run(0), relevant),
      keyword: precision(keyword(catalogue, query), relevant),
    };
    sums.hybrid += scores.hybrid;
    sums.meaning += scores.meaning;
    sums.keyword += scores.keyword;
    if (hybrid[0] && relevantTo(hybrid[0], relevant)) firstHits++;
    const top = hybrid[0] ? `${hybrid[0].artists.join(', ')}: ${hybrid[0].title}` : '-';
    lines.push(
      `| ${query} | ${scores.hybrid.toFixed(1)} | ${scores.meaning.toFixed(1)} | ${scores.keyword.toFixed(1)} | ${top} |`,
    );
  }
  const n = SEARCH_QUERIES.length;
  console.log(lines.join('\n'));
  console.log(
    `\nMean precision@${String(K)}: hybrid ${(sums.hybrid / n).toFixed(3)}, meaning only ${(sums.meaning / n).toFixed(3)}, keyword only ${(sums.keyword / n).toFixed(3)}. ` +
      `First hybrid result fits: ${String(firstHits)} of ${String(n)}.`,
  );
} finally {
  await database.close();
}
