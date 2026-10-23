import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { renderWithQueries } from './test/render';
import { API, page, server, signedIn, signedOut } from './test/server';

describe('App', () => {
  it('shows the Discogs sign-in when signed out', async () => {
    server.use(...signedOut());
    renderWithQueries(<App />);

    const signIn = await screen.findByRole('link', { name: 'Sign in with Discogs' });
    expect(signIn).toHaveAttribute('href', '/api/v1/auth/discogs/start');
  });

  it('explains a failed login, then removes the error from the address bar', async () => {
    server.use(...signedOut());
    window.history.replaceState(null, '', '/?loginError=access_denied');
    renderWithQueries(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('You declined access on Discogs');
    expect(window.location.search).toBe('');
  });

  it('ignores an unknown loginError value', async () => {
    server.use(...signedOut());
    window.history.replaceState(null, '', '/?loginError=<script>');
    renderWithQueries(<App />);

    await screen.findByRole('link', { name: 'Sign in with Discogs' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the shelf when signed in, and signs out back to the login screen', async () => {
    let loggedOut = false;
    server.use(
      http.post(`${API}/auth/logout`, () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${API}/collection/items`, () => HttpResponse.json(page())),
      ...signedIn(),
    );
    const { user } = renderWithQueries(<App />);

    expect(
      await screen.findByRole('heading', { name: 'fixture_collector’s shelf' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('link', { name: 'Sign in with Discogs' })).toBeInTheDocument();
    expect(loggedOut).toBe(true);
  });

  it('always shows the Discogs non-affiliation notice', async () => {
    server.use(...signedOut());
    renderWithQueries(<App />);
    expect(await screen.findByRole('contentinfo')).toHaveTextContent(
      'not affiliated with, sponsored or endorsed by Discogs',
    );
  });

  it('retries a network failure (a sleeping host may be waking), then says so', async () => {
    let attempts = 0;
    server.use(
      http.get(`${API}/me`, () => {
        attempts++;
        return HttpResponse.error();
      }),
    );
    renderWithQueries(<App />);
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'could not be reached',
    );
    expect(attempts).toBe(3);
  });
});
