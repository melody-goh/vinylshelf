import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { renderWithQueries } from '../test/render';
import { API, collectionItem, facets, page, releases, server, signedIn } from '../test/server';

const SHELF = [
  collectionItem(1, { title: 'Blue Train', year: 1957 }),
  collectionItem(2, { title: 'Kind of Blue', year: 1959 }),
  collectionItem(3, { title: 'Selected Ambient', year: 1992 }),
];

/** Query strings the app asked the shelf for. */
let asked: URLSearchParams[];

beforeEach(() => {
  asked = [];
  server.use(
    ...signedIn(),
    ...releases(),
    http.get(`${API}/collection/facets`, () => HttpResponse.json(facets())),
    http.get(`${API}/collection/items`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      asked.push(query);
      // The shelf view loads only the first record; the library loads the rest too.
      if (query.get('limit') !== '100')
        return HttpResponse.json(page({ totalItems: 3, items: SHELF.slice(0, 1) }));
      const items =
        query.get('genre') === 'Jazz' ? SHELF.slice(0, 2) : query.get('genre') ? [] : SHELF;
      return HttpResponse.json(page({ totalItems: 3, matchedItems: items.length, items }));
    }),
  );
});

async function openLibrary() {
  const view = renderWithQueries(<App />);
  await view.user.click(await screen.findByRole('button', { name: 'Library' }));
  return view;
}

describe('Library: the whole shelf at a glance', () => {
  it('shows every record as a named cover, in a tab beside the shelf', async () => {
    await openLibrary();

    const grid = await screen.findByRole('list', { name: 'Records' });
    expect(
      within(grid)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Blue Train, The Paper Moons, 1957',
      'Kind of Blue, The Paper Moons, 1959',
      'Selected Ambient, The Paper Moons, 1992',
    ]);
    expect(screen.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
    // Nothing is filtered, so there is no count or Clear to read.
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('filters from the shelf’s own facets, says how many match, and clears', async () => {
    const { user } = await openLibrary();

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Genre' }), 'Jazz');
    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: 'Records' })).getAllByRole('button'),
      ).toHaveLength(2);
    });
    expect(asked.at(-1)?.get('genre')).toBe('Jazz');
    expect(screen.getByRole('status')).toHaveTextContent('2 of 3');

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: 'Records' })).getAllByRole('button'),
      ).toHaveLength(3);
    });
  });

  it('says plainly when nothing matches', async () => {
    const { user } = await openLibrary();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Genre' }), 'Electronic');
    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument();
  });

  it('opens a chosen record on the shelf, even one the shelf had not loaded', async () => {
    const { user } = await openLibrary();

    await user.click(await screen.findByRole('button', { name: /^Selected Ambient/ }));

    expect(screen.getByRole('button', { name: 'Shelf' })).toHaveAttribute('aria-current', 'page');
    await waitFor(async () => {
      expect(
        within(await screen.findByRole('article')).getByRole('heading', {
          name: 'Selected Ambient',
        }),
      ).toBeInTheDocument();
    });
  });

  it('moves through the grid with the arrow keys', async () => {
    const { user } = await openLibrary();
    const first = await screen.findByRole('button', { name: /^Blue Train/ });
    first.focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /^Kind of Blue/ })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: /^Selected Ambient/ })).toHaveFocus();
  });
});
