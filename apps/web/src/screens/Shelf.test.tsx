import type { CollectionPage, ImportJob } from '@vinylshelf/contract';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { timings } from '../api/collection';
import { renderWithQueries } from '../test/render';
import { API, collectionItem, importJob, page, releases, server, signedIn } from '../test/server';

const IMPORT_ID = importJob().id;

beforeEach(() => {
  timings.importPollMs = 10;
  server.use(...signedIn(), ...releases());
});

/** Serves each response in turn, repeating the last one. */
function sequence<T>(responses: T[]): () => T {
  let call = 0;
  return () => responses[Math.min(call++, responses.length - 1)] as T;
}

function serveItems(next: () => CollectionPage, seen: URL[] = []) {
  server.use(
    http.get(`${API}/collection/items`, ({ request }) => {
      seen.push(new URL(request.url));
      return HttpResponse.json(next());
    }),
  );
  return seen;
}

function serveImport(next: () => ImportJob) {
  server.use(http.get(`${API}/collection/imports/:importId`, () => HttpResponse.json(next())));
}

const records = () => screen.findByRole('list', { name: 'Records' });
const gatefold = () => screen.findByRole('article');

describe('Shelf: the open gatefold and the disc stack', () => {
  it('opens the newest record in the gatefold and fans the rest as named discs', async () => {
    serveItems(() =>
      page({
        totalItems: 2,
        items: [collectionItem(1, { title: 'Tidal Lines' }), collectionItem(2, { year: null })],
      }),
    );
    renderWithQueries(<App />);

    const open = await gatefold();
    expect(within(open).getByRole('heading', { name: 'Tidal Lines' })).toBeInTheDocument();
    // The record links to its Discogs page from the community line under the sleeve;
    // the credit itself is in the footer, once (ADR 0004, note of 2026-10-25).
    await waitFor(() => {
      const links = screen.getAllByRole('link', { name: 'Discogs' });
      expect(links.map((l) => l.getAttribute('href'))).toContain(
        'https://www.discogs.com/release/9000001',
      );
    });
    expect(within(open).queryByText(/Data provided by/)).not.toBeInTheDocument();

    const discs = within(await records()).getAllByRole('button');
    expect(discs.map((d) => d.getAttribute('aria-label'))).toEqual([
      'Tidal Lines, The Paper Moons, 2019',
      'Record 2, The Paper Moons, year unknown',
    ]);
    expect(discs[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('2 records')).toBeInTheDocument();
  });

  it('prints only a colourway Discogs names, never an assumed black', async () => {
    serveItems(() =>
      page({
        totalItems: 2,
        items: [
          collectionItem(1, { vinylColors: [] }),
          collectionItem(2, { title: 'Alpine Suites', vinylColors: ['Blue Marbled'] }),
        ],
      }),
    );
    const { user } = renderWithQueries(<App />);

    expect(within(await gatefold()).getByText('2019')).toBeInTheDocument();
    expect(screen.queryByText(/black vinyl/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Alpine Suites/ }));
    expect(await screen.findByText('2019 · Blue Marbled vinyl')).toBeInTheDocument();
  });

  it('names a leaned-out disc below the stack', async () => {
    serveItems(() =>
      page({
        totalItems: 2,
        items: [collectionItem(1), collectionItem(2, { title: 'Alpine Suites' })],
      }),
    );
    renderWithQueries(<App />);

    const disc = within(await records()).getByRole('button', { name: /^Alpine Suites/ });
    disc.focus();

    const aside = screen.getByRole('complementary', { name: 'Your collection' });
    expect(await within(aside).findByText('Alpine Suites')).toBeInTheDocument();
  });

  it('reads the liner notes into the gatefold once the release detail arrives', async () => {
    serveItems(() => page({ totalItems: 1, items: [collectionItem(1)] }));
    renderWithQueries(<App />);

    const open = await gatefold();
    expect(within(open).getByText('Reading the liner notes…')).toBeInTheDocument();
    expect(await within(open).findByText('Shoreline')).toBeInTheDocument();
    expect(within(open).getByText('Producer')).toBeInTheDocument();
    expect(within(open).getByText(/FX-001 · Fixture Records · Added/)).toBeInTheDocument();
  });

  it('opens a different record when its disc is chosen', async () => {
    serveItems(() =>
      page({
        totalItems: 2,
        items: [collectionItem(1), collectionItem(2, { title: 'Alpine Suites' })],
      }),
    );
    const { user } = renderWithQueries(<App />);

    await user.click(await screen.findByRole('button', { name: /^Alpine Suites/ }));

    await waitFor(async () => {
      expect(
        within(await gatefold()).getByRole('heading', { name: 'Alpine Suites' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Alpine Suites/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('explains when Discogs cannot supply the liner notes', async () => {
    serveItems(() => page({ totalItems: 1, items: [collectionItem(1)] }));
    server.use(
      http.get(`${API}/releases/:discogsId`, () =>
        HttpResponse.json(
          {
            type: '/problems/discogs-unavailable',
            title: 'Down',
            status: 503,
            code: 'discogs_unavailable',
          },
          { status: 503 },
        ),
      ),
    );
    renderWithQueries(<App />);

    expect(await within(await gatefold()).findByRole('alert')).toHaveTextContent(
      'Discogs isn’t answering',
    );
  });

  it('never shows a record past its expiresAt, even if one arrives (ADR 0004)', async () => {
    serveItems(() =>
      page({
        totalItems: 2,
        items: [
          collectionItem(1, { title: 'Fresh' }),
          collectionItem(2, {
            title: 'Expired',
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          }),
        ],
      }),
    );
    renderWithQueries(<App />);

    expect(within(await records()).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Expired/ })).not.toBeInTheDocument();
  });

  it('asks for the chosen sort, and loads further records through the cursor', async () => {
    const seen = serveItems(
      sequence([
        page({ totalItems: 3, items: [collectionItem(1)], nextCursor: 'cursor-2' }),
        page({ totalItems: 3, items: [collectionItem(2)] }),
        page({ totalItems: 3, items: [collectionItem(3)] }),
      ]),
    );
    const { user } = renderWithQueries(<App />);

    await records();
    await user.click(screen.getByRole('button', { name: 'Load more records' }));
    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: 'Records' })).getAllByRole('button'),
      ).toHaveLength(2);
    });
    expect(seen[1]?.searchParams.get('cursor')).toBe('cursor-2');

    await user.selectOptions(screen.getByLabelText('Sort by'), 'artist_asc');
    await waitFor(() => {
      expect(seen.at(-1)?.searchParams.get('sort')).toBe('artist_asc');
    });
  });
});

describe('Shelf: refresh states', () => {
  it('shows a closed sleeve and unlit discs, not an empty shelf, while records refresh', async () => {
    serveItems(() =>
      page({
        totalItems: 5,
        refresh: { status: 'refreshing', importId: IMPORT_ID, hiddenCount: 5, retryAt: null },
      }),
    );
    // Hold the progress response, so the shelf must rely on `refresh` alone at first.
    let releaseProgress = (): void => undefined;
    const progressHeld = new Promise<void>((resolve) => {
      releaseProgress = resolve;
    });
    server.use(
      http.get(`${API}/collection/imports/:importId`, async () => {
        await progressHeld;
        return HttpResponse.json(
          importJob({ status: 'running', progress: { fetched: 100, total: 250 } }),
        );
      }),
    );
    renderWithQueries(<App />);

    expect(await screen.findByText('Refreshing 5 records from Discogs…')).toBeInTheDocument();
    expect(screen.queryByText(/Your shelf is empty/)).not.toBeInTheDocument();

    releaseProgress();
    expect(await screen.findByText(/100 of 250 records/)).toBeInTheDocument();
    expect(screen.queryByText(/Your shelf is empty/)).not.toBeInTheDocument();
  });

  it('reloads the shelf when the refresh import finishes', async () => {
    serveItems(
      sequence([
        page({
          totalItems: 1,
          refresh: { status: 'refreshing', importId: IMPORT_ID, hiddenCount: 1, retryAt: null },
        }),
        page({ totalItems: 1, items: [collectionItem(1, { title: 'Back again' })] }),
      ]),
    );
    serveImport(sequence([importJob({ status: 'running' }), importJob({ status: 'succeeded' })]));
    renderWithQueries(<App />);

    expect(
      within(await gatefold()).getByRole('heading', { name: 'Back again' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Refreshing/)).not.toBeInTheDocument();
  });

  it('explains a backoff with its retry time, and lets the user try now', async () => {
    const retryAt = new Date(Date.now() + 10 * 60 * 1000);
    serveItems(() =>
      page({
        totalItems: 3,
        refresh: {
          status: 'backoff',
          importId: IMPORT_ID,
          hiddenCount: 3,
          retryAt: retryAt.toISOString(),
        },
      }),
    );
    let started = 0;
    server.use(
      http.post(`${API}/collection/imports`, () => {
        started++;
        return HttpResponse.json(importJob({ status: 'queued' }), { status: 202 });
      }),
    );
    serveImport(() => importJob({ status: 'running' }));
    const { user } = renderWithQueries(<App />);

    const time = retryAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    expect(
      await screen.findByText(
        `Couldn’t refresh 3 records from Discogs. We’ll try again automatically after ${time}.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Your shelf is empty/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try now' }));
    await waitFor(() => {
      expect(started).toBe(1);
    });
  });
});

describe('Shelf: first import', () => {
  it('imports an empty shelf on request and opens the first record when done', async () => {
    serveItems(
      sequence([
        page(),
        page({ totalItems: 1, items: [collectionItem(1, { title: 'First record' })] }),
      ]),
    );
    server.use(
      http.post(`${API}/collection/imports`, () =>
        HttpResponse.json(importJob({ status: 'queued', progress: { fetched: 0 } }), {
          status: 202,
        }),
      ),
    );
    serveImport(sequence([importJob({ status: 'running' }), importJob({ status: 'succeeded' })]));
    const { user } = renderWithQueries(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import my collection' }));

    expect(
      within(await gatefold()).getByRole('heading', { name: 'First record' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Your shelf is empty/)).not.toBeInTheDocument();
  });

  it('syncs a stocked shelf with Discogs on request, picking up records added there', async () => {
    serveItems(
      sequence([
        page({ totalItems: 1, items: [collectionItem(1, { title: 'Tidal Lines' })] }),
        page({
          totalItems: 2,
          items: [collectionItem(2, { title: 'Added on Discogs' }), collectionItem(1)],
        }),
      ]),
    );
    let started = 0;
    server.use(
      http.post(`${API}/collection/imports`, () => {
        started++;
        return HttpResponse.json(importJob({ status: 'queued' }), { status: 202 });
      }),
    );
    serveImport(sequence([importJob({ status: 'running' }), importJob({ status: 'succeeded' })]));
    const { user } = renderWithQueries(<App />);

    await user.click(await screen.findByRole('button', { name: 'Sync with Discogs' }));

    expect(started).toBe(1);
    expect(await screen.findByText('2 records')).toBeInTheDocument();
    expect(
      within(await records()).getByRole('button', { name: /^Added on Discogs/ }),
    ).toBeInTheDocument();
  });

  it('shows why an import failed, and offers to try again', async () => {
    serveItems(() => page());
    server.use(
      http.post(`${API}/collection/imports`, () =>
        HttpResponse.json(importJob({ status: 'queued' }), { status: 202 }),
      ),
    );
    serveImport(() =>
      importJob({
        status: 'failed',
        error: {
          type: '/problems/discogs-auth-revoked',
          title: 'Discogs access was revoked. Sign in again to import',
          status: 401,
          code: 'discogs_auth_revoked',
        },
      }),
    );
    const { user } = renderWithQueries(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import my collection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Discogs access was revoked');
    expect(screen.getByRole('button', { name: 'Import my collection' })).toBeEnabled();
  });
});
