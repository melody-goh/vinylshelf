/**
 * Fetches a built catalogue from the project's GitHub Releases (ADR 0012 §3). Releases
 * are public and need no token; the repository and tag are arguments, so a fork can load
 * its own builds. Used by the `catalogue:load` script only, never by the running API.
 */
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { MANIFEST_FILE, ROWS_FILE } from './artifact.js';

export const CATALOGUE_TAG_PREFIX = 'catalogue-';

interface GithubRelease {
  tag_name: string;
  draft: boolean;
  assets: { name: string; browser_download_url: string }[];
}

/** The newest catalogue release, or the one tagged `tag`. */
export async function findCatalogueRelease(repo: string, tag?: string): Promise<GithubRelease> {
  const url = tag
    ? `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`
    : `https://api.github.com/repos/${repo}/releases?per_page=50`;
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub answered ${String(response.status)} for ${url}`);
  const body = (await response.json()) as GithubRelease | GithubRelease[];
  const release = Array.isArray(body)
    ? body.find((r) => !r.draft && r.tag_name.startsWith(CATALOGUE_TAG_PREFIX))
    : body;
  if (!release) throw new Error(`No catalogue release found in ${repo}`);
  return release;
}

/** Downloads a release's manifest and rows file into `dir`. */
export async function downloadCatalogue(release: GithubRelease, dir: string): Promise<void> {
  for (const name of [MANIFEST_FILE, ROWS_FILE]) {
    const asset = release.assets.find((a) => a.name === name);
    if (!asset) throw new Error(`Release ${release.tag_name} has no ${name}`);
    const response = await fetch(asset.browser_download_url);
    if (!response.ok || !response.body) {
      throw new Error(`Downloading ${name} failed with ${String(response.status)}`);
    }
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      createWriteStream(join(dir, name)),
    );
  }
}
