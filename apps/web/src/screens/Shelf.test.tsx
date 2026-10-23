import type { CollectionPage, ImportJob } from '@vinylshelf/contract';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { timings } from '../api/collection';
import { renderWithQueries } from '../test/render';
import { API, collectionItem, importJob, page, server, signedIn } from '../test/server';

const IMPORT_ID = importJob().id;

beforeEach(() => {
  timings.importPollMs = 10;
  server.use(...signedIn());
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

describe('Shelf: listing', () => {
  it('lists records with artists and year, each with its own Discogs credit', async () => {
    serveItems(() =>
      page({
        items: [collectionItem(1, { title: 'Tidal Lines' }), collectionItem(2, { year: null })],
      }),
    );
    renderWithQueries(<App />);

    const list = await records();
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Tidal Lines');
    expect(rows[0]).toHaveTextContent('The Paper Moons · 2019');
    expect(rows[1]).toHaveTextContent('Unknown year');
    for (const [i, row] of rows.entries()) {
      expect(within(row).getByRole('link', { name: 'Discogs' })).toHaveAttribute(
        'href',
        `https://www.discogs.com/release/${9000001 + i}`,
      );
    }
  });

  it('never shows a record past its expiresAt, even if one arrives (ADR 0004)', async () => {
    serveItems(() =>
      page({
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

    expect(await records()).toHaveTextContent('Fresh');
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();
  });

  it('asks for the chosen sort, and loads further pages through the cursor', async () => {
    const seen = serveItems(
      sequence([
        page({ items: [collectionItem(1)], nextCursor: 'cursor-2' }),
        page({ items: [collectionItem(2)] }),
        page({ items: [collectionItem(3)] }),
      ]),
    );
    const { user } = renderWithQueries(<App />);

    await records();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });
    expect(seen[1]?.searchParams.get('cursor')).toBe('cursor-2');

    await user.selectOptions(screen.getByLabelText('Sort by'), 'artist_asc');
    await waitFor(() => {
      expect(seen.at(-1)?.searchParams.get('sort')).toBe('artist_asc');
    });
  });
});

describe('Shelf: refresh states', () => {
  it('shows placeholders, not an empty shelf, while expired records are refreshed', async () => {
    serveItems(() =>
      page({
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
          refresh: { status: 'refreshing', importId: IMPORT_ID, hiddenCount: 1, retryAt: null },
        }),
        page({ items: [collectionItem(1, { title: 'Back again' })] }),
      ]),
    );
    serveImport(sequence([importJob({ status: 'running' }), importJob({ status: 'succeeded' })]));
    renderWithQueries(<App />);

    expect(await records()).toHaveTextContent('Back again');
    expect(screen.queryByText(/Refreshing/)).not.toBeInTheDocument();
  });

  it('explains a backoff with its retry time, and lets the user try now', async () => {
    const retryAt = new Date(Date.now() + 10 * 60 * 1000);
    serveItems(() =>
      page({
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
  it('imports an empty shelf on request and shows the records when done', async () => {
    serveItems(sequence([page(), page({ items: [collectionItem(1, { title: 'First record' })] })]));
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

    expect(await records()).toHaveTextContent('First record');
    expect(screen.queryByText(/Your shelf is empty/)).not.toBeInTheDocument();
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
