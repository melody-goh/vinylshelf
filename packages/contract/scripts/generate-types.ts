/**
 * Generates TypeScript types from openapi.yaml (ADR 0001: the spec is the source of
 * truth, code follows it).
 *
 * With `--check`, nothing is written: the script fails if the committed output differs
 * from what the spec would produce now. CI runs it that way, so a spec change that was
 * never regenerated, or a hand edit to generated code, fails the build instead of
 * silently drifting.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specPath = resolve(packageRoot, 'openapi.yaml');
const outputPath = resolve(packageRoot, 'src/generated/schema.d.ts');

const HEADER = `/**
 * GENERATED FILE - do not edit by hand.
 * Source: packages/contract/openapi.yaml
 * Regenerate with: pnpm --filter @vinylshelf/contract generate
 */

`;

async function render(): Promise<string> {
  const ast = await openapiTS(pathToFileURL(specPath), { alphabetize: true });
  return HEADER + astToString(ast);
}

async function readExisting(): Promise<string | null> {
  try {
    return await readFile(outputPath, 'utf8');
  } catch {
    return null;
  }
}

const expected = await render();

if (process.argv.includes('--check')) {
  if ((await readExisting()) !== expected) {
    console.error(
      'Generated contract types are stale. Run `pnpm --filter @vinylshelf/contract generate` and commit the result.',
    );
    process.exit(1);
  }
  console.log('Generated contract types are up to date.');
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, expected);
  console.log(`Wrote ${outputPath}`);
}
