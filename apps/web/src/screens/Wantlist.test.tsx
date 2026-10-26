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
  wantlistItem,
  wantlistPage,
} from '../test/server';

/** Requests that changed something, as "METHOD path". */
let writes: string[];
let wanted: ReturnType<typeof wantlistItem>[];

beforeEach(() => {
  writes = [];
  wanted = [
    wantlistItem(9000101, { title: 'Signal Fires' }),
    wantlistItem(9000102, { title: 'Low Tide Radio' }),
  ];
  server.use(
    ...signedIn(),
    ...releases(),
    http.get(`${API}/collection/items`, () =>
      HttpResponse.json(
        page({ totalItems: 1, items: [collectionItem(1, { title: 'Tidal Lines' })] }),
      ),
    ),
    http.get(`${API}/wantlist`, () => HttpResponse.json(wantlistPage(wanted))),
    http.delete(`${API}/wantlist/:id`, ({ params }) => {
      writes.push(`DELETE /wantlist/${String(params.id)}`);
      wanted = wanted.filter((w) => String(w.release.discogsId) !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.put(`${API}/wantlist/:id`, ({ params }) => {
      writes.push(`PUT /wantlist/${String(params.id)}`);
      return HttpResponse.json(wantlistItem(Number(params.id)));
    }),
    http.post(`${API}/collection/items`, async ({ request }) => {
      const body = (await request.json()) as { discogsId: number };
      writes.push(`POST /collection/items ${String(body.discogsId)}`);
      return HttpResponse.json(
        collectionItem(99, { discogsId: body.discogsId, title: 'Signal Fires' }),
        {
          status: 201,
        },
      );
    }),
  );
});

async function openWantlist() {
  const view = renderWithQueries(<App />);
  await view.user.click(await screen.findByRole('button', { name: 'Wantlist' }));
  return view;
}

describe('Wantlist', () => {
  it('shows each wanted record as a named cover', async () => {
    await openWantlist();
    const grid = await screen.findByRole('list', { name: 'Records' });
    expect(
      within(grid)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Signal Fires, The Paper Moons, 2019', 'Low Tide Radio, The Paper Moons, 2019']);
  });

  it('marks a record acquired: onto the shelf, off the wantlist, open on the shelf', async () => {
    const { user } = await openWantlist();
    await user.click(await screen.findByRole('button', { name: /^Signal Fires/ }));
    await user.click(screen.getByRole('button', { name: 'Acquired' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Shelf' })).toHaveAttribute('aria-current', 'page');
    });
    expect(writes).toEqual(['POST /collection/items 9000101', 'DELETE /wantlist/9000101']);
    await waitFor(
      async () => {
        expect(
          within(await screen.findByRole('article')).getByRole('heading', { name: 'Signal Fires' }),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('takes a record already on the shelf off the wantlist when it is marked acquired', async () => {
    server.use(
      http.post(`${API}/collection/items`, () =>
        HttpResponse.json(
          {
            type: '/problems/already-in-collection',
            title: 'Already on your shelf',
            status: 409,
            code: 'already_in_collection',
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = await openWantlist();
    await user.click(await screen.findByRole('button', { name: /^Signal Fires/ }));
    await user.click(screen.getByRole('button', { name: 'Acquired' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Shelf' })).toHaveAttribute('aria-current', 'page');
    });
    expect(writes).toEqual(['DELETE /wantlist/9000101']);
  });

  it('removes a record no longer wanted', async () => {
    const { user } = await openWantlist();
    await user.click(await screen.findByRole('button', { name: /^Low Tide Radio/ }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Low Tide Radio/ })).not.toBeInTheDocument();
    });
    expect(writes).toEqual(['DELETE /wantlist/9000102']);
  });

  it('says so when nothing is wanted', async () => {
    wanted = [];
    await openWantlist();
    expect(await screen.findByText('Nothing on your wantlist yet.')).toBeInTheDocument();
  });
});

describe('Search: wanting a record', () => {
  it('puts a result on the wantlist and takes it off again', async () => {
    server.use(
      http.get(`${API}/search/releases`, () =>
        HttpResponse.json(searchPage([searchResult(9000101, { title: 'Signal Fires' })])),
      ),
    );
    const { user } = renderWithQueries(<App />);
    await screen.findByRole('article');
    await user.type(screen.getByRole('searchbox', { name: /search discogs/i }), 'signal');

    const want = await screen.findByRole('button', { name: 'Want Signal Fires' });
    expect(want).toHaveAttribute('aria-pressed', 'false');
    await user.click(want);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Want Signal Fires' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    await user.click(screen.getByRole('button', { name: 'Want Signal Fires' }));

    await waitFor(() => {
      expect(writes).toEqual(['PUT /wantlist/9000101', 'DELETE /wantlist/9000101']);
    });
  });
});
