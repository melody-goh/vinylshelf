import type { CollectionPage } from '@vinylshelf/contract';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { renderWithQueries } from '../test/render';
import {
  API,
  collectionItem,
  page,
  releases,
  searchPage,
  searchResult,
  server,
  signedIn,
} from '../test/server';

let shelf: CollectionPage;
/** Bodies the app POSTed to add a record. */
let added: unknown[];
/** Queries the app sent to search. */
let searched: string[];

beforeEach(() => {
  shelf = page({ totalItems: 1, items: [collectionItem(1, { title: 'Tidal Lines' })] });
  added = [];
  searched = [];
  server.use(
    ...signedIn(),
    ...releases(),
    http.get(`${API}/collection/items`, () => HttpResponse.json(shelf)),
    http.get(`${API}/search/releases`, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      searched.push(q);
      return HttpResponse.json(
        searchPage([
          searchResult(9000007, { title: 'Glasshouse', artists: ['Teo Varga'] }),
          searchResult(9000001, { title: 'Tidal Lines', inCollection: true }),
        ]),
      );
    }),
    http.post(`${API}/collection/items`, async ({ request }) => {
      const body = (await request.json()) as { discogsId: number };
      added.push(body);
      const item = collectionItem(99, { discogsId: body.discogsId, title: 'Glasshouse' });
      shelf = page({ totalItems: 2, items: [item, ...shelf.items] });
      return HttpResponse.json(item, { status: 201 });
    }),
  );
});

async function searchFor(text: string) {
  const view = renderWithQueries(<App />);
  await screen.findByRole('article');
  await view.user.type(screen.getByRole('searchbox', { name: /search discogs/i }), text);
  return view;
}

describe('Search: finding and adding a record', () => {
  it('searches once typing pauses, and names each pressing', async () => {
    await searchFor('glasshouse');

    const results = await screen.findByRole('region', { name: 'Search results' });
    expect(within(results).getByText('Glasshouse')).toBeInTheDocument();
    expect(within(results).getAllByText('2019 · UK · Fixture Records FX-001')).toHaveLength(2);
    // Debounced: one request for the whole word, not one per letter.
    expect(searched).toEqual(['glasshouse']);
  });

  it('adds a record to Discogs and the shelf, then opens it', async () => {
    const { user } = await searchFor('glasshouse');

    await user.click(await screen.findByRole('button', { name: 'Add Glasshouse to your shelf' }));

    expect(added).toEqual([{ discogsId: 9000007, allowDuplicate: false }]);
    await waitFor(async () => {
      expect(
        within(await screen.findByRole('article')).getByRole('heading', { name: 'Glasshouse' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('searchbox', { name: /search discogs/i })).toHaveValue('');
  });

  it('asks before adding another copy of a record already on the shelf', async () => {
    const { user } = await searchFor('tidal');

    const row = (await screen.findByText('Tidal Lines', { selector: 'p' })).closest('li');
    if (!row) throw new Error('no result row');
    expect(within(row).getByText('On your shelf')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /^Add/ })).not.toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: /I have another copy/ }));
    await user.click(within(row).getByRole('button', { name: 'Add another copy of Tidal Lines' }));

    expect(added).toEqual([{ discogsId: 9000001, allowDuplicate: true }]);
  });

  it('goes back to the shelf on Escape', async () => {
    const { user } = await searchFor('glass');
    await screen.findByRole('region', { name: 'Search results' });

    await user.keyboard('{Escape}');

    expect(await screen.findByRole('article')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument();
  });
});

describe('Community: what Discogs members say', () => {
  it('shows the rating and have/want counts under the open record', async () => {
    renderWithQueries(<App />);

    expect(await screen.findByText('4.31')).toBeInTheDocument();
    expect(screen.getByText(/from 212 ratings/)).toBeInTheDocument();
    expect(screen.getByText('1,840 have it')).toBeInTheDocument();
    expect(screen.getByText('960 want it')).toBeInTheDocument();
  });
});
