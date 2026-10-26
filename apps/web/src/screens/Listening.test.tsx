import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { renderWithQueries } from '../test/render';
import { API, collectionItem, page, previews, releases, server, signedIn } from '../test/server';

/** Previews are looked up only after the record has stayed open a moment. */
const AFTER_DWELL = { timeout: 3000 };

let lookups: number;

beforeEach(() => {
  lookups = 0;
  server.use(
    ...signedIn(),
    http.get(`${API}/releases/:discogsId/previews`, () => {
      lookups++;
      return undefined;
    }),
    ...releases(),
    http.get(`${API}/collection/items`, () =>
      HttpResponse.json(
        page({ totalItems: 1, items: [collectionItem(1, { title: 'Tidal Lines' })] }),
      ),
    ),
  );
});

describe('Listening: previews of a record’s tracks', () => {
  it('offers a preview on each matched track once the record has been open a moment', async () => {
    renderWithQueries(<App />);

    const open = await screen.findByRole('article');
    expect(lookups).toBe(0);
    expect(
      await within(open).findByRole('button', { name: 'Play a preview of Shoreline' }, AFTER_DWELL),
    ).toBeInTheDocument();
    expect(
      within(open).getByRole('button', { name: 'Play a preview of Undertow' }),
    ).toBeInTheDocument();
    expect(lookups).toBe(1);
  });

  it('opens the listening room on that track, with Apple’s attribution and badge', async () => {
    const { user } = renderWithQueries(<App />);
    await user.click(
      await screen.findByRole('button', { name: 'Play a preview of Undertow' }, AFTER_DWELL),
    );

    const room = await screen.findByRole('dialog', { name: 'Listening to Record 1' });
    expect(within(room).getByRole('heading', { name: 'Undertow' })).toBeInTheDocument();
    const ruler = within(room).getByRole('slider', { name: 'Position in the record' });
    expect(ruler).toHaveAttribute('aria-valuetext', 'Undertow, 0:00 of 0:30');
    expect(ruler).toHaveAttribute('aria-valuemax', '60');
    expect(within(room).getByText('Previews provided courtesy of iTunes')).toBeInTheDocument();
    expect(within(room).getByRole('link', { name: 'Listen on Apple Music' })).toHaveAttribute(
      'href',
      'https://music.apple.com/album/9000001',
    );
    await waitFor(() => {
      expect(within(room).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    });
  });

  it('plays, pauses and changes track from the keyboard, and closes on Escape', async () => {
    const { user } = renderWithQueries(<App />);
    const play = await screen.findByRole(
      'button',
      { name: 'Play a preview of Shoreline' },
      AFTER_DWELL,
    );
    await user.click(play);
    const room = await screen.findByRole('dialog');

    await user.keyboard(']');
    expect(within(room).getByRole('heading', { name: 'Undertow' })).toBeInTheDocument();
    await user.keyboard('[[');
    expect(within(room).getByRole('heading', { name: 'Shoreline' })).toBeInTheDocument();

    await waitFor(() => {
      expect(within(room).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    });
    await user.keyboard(' ');
    expect(within(room).getByRole('button', { name: 'Play' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Focus goes back to where the listener was.
    expect(play).toHaveFocus();
  });

  it('says plainly when a record has no previews, and offers no player', async () => {
    server.use(
      http.get(`${API}/releases/:discogsId/previews`, ({ params }) =>
        HttpResponse.json(previews(Number(params.discogsId), [null, null])),
      ),
    );
    renderWithQueries(<App />);

    expect(
      await screen.findByText('No previews for this record', {}, AFTER_DWELL),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Play a preview/ })).not.toBeInTheDocument();
  });

  it('leaves a track Apple could not match silent, and keeps it off the ruler', async () => {
    server.use(
      http.get(`${API}/releases/:discogsId/previews`, ({ params }) =>
        HttpResponse.json(
          previews(Number(params.discogsId), ['https://audio.example/a1.m4a', null]),
        ),
      ),
    );
    const { user } = renderWithQueries(<App />);

    await user.click(
      await screen.findByRole('button', { name: 'Listen to previews' }, AFTER_DWELL),
    );
    expect(
      screen.queryByRole('button', { name: 'Play a preview of Undertow' }),
    ).not.toBeInTheDocument();
    const room = await screen.findByRole('dialog');
    expect(within(room).getByRole('slider')).toHaveAttribute('aria-valuemax', '30');
  });

  it('explains when previews are unavailable, and lets the listener try again', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/releases/:discogsId/previews`, ({ params }) => {
        calls++;
        return calls === 1
          ? HttpResponse.json(
              {
                type: '/problems/previews-unavailable',
                title: 'Unavailable',
                status: 503,
                code: 'previews_unavailable',
              },
              { status: 503 },
            )
          : HttpResponse.json(previews(Number(params.discogsId)));
      }),
    );
    const { user } = renderWithQueries(<App />);

    await user.click(await screen.findByRole('button', { name: 'Try again' }, AFTER_DWELL));
    expect(await screen.findByRole('button', { name: 'Listen to previews' })).toBeInTheDocument();
  });
});
