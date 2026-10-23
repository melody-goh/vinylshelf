import type { LoginErrorCode } from '@vinylshelf/contract';
import { useEffect, useState } from 'react';
import { LOGIN_URL } from '../api/session';

/** Messages for the `?loginError=` codes the OAuth callback redirects with. */
const LOGIN_ERRORS: Record<LoginErrorCode, string> = {
  access_denied: 'You declined access on Discogs, so we could not sign you in.',
  invalid_request_token: 'That sign-in link expired or was already used. Please try again.',
  discogs_unavailable: 'Discogs is not responding right now. Please try again in a few minutes.',
};

function isLoginErrorCode(value: string | null): value is LoginErrorCode {
  return value !== null && value in LOGIN_ERRORS;
}

export function Login() {
  const [error] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('loginError');
    return isLoginErrorCode(code) ? LOGIN_ERRORS[code] : null;
  });

  // Drop the error from the address bar so a reload does not show it again.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('loginError')) {
      url.searchParams.delete('loginError');
      window.history.replaceState(null, '', url);
    }
  }, []);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Vinyl Shelf</h1>
      <p>Browse your Discogs collection. Sign in with your Discogs account to begin.</p>
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      <a
        href={LOGIN_URL}
        className="inline-block rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700"
      >
        Sign in with Discogs
      </a>
    </section>
  );
}
