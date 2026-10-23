import type { LoginErrorCode } from '@vinylshelf/contract';
import { useEffect, useState } from 'react';
import { LOGIN_URL } from '../api/session';
import { ClosedSleeve } from '../components/ClosedSleeve';
import { Disc } from '../components/Disc';
import { HypeSticker } from '../components/HypeSticker';

/** Messages for the `?loginError=` codes the OAuth callback redirects with. */
const LOGIN_ERRORS: Record<LoginErrorCode, string> = {
  access_denied: 'You declined access on Discogs, so we could not sign you in.',
  invalid_request_token: 'That sign-in link expired or was already used. Please try again.',
  discogs_unavailable: 'Discogs is not responding right now. Please try again in a few minutes.',
};

/** Illustration only: a few plain discs fanned beside the sleeve, standing for no record. */
const FANNED: string[][] = [['Black'], ['Blue Marbled'], ['Red'], ['Orange'], ['Bone']];

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
    <main className="flex flex-1 items-center justify-center gap-16 px-6 py-12 md:px-12">
      <div className="flex w-full max-w-[34rem] flex-col gap-6">
        {error && (
          <p role="alert" className="border-l border-sticker pl-3 text-sm leading-relaxed">
            {error}
          </p>
        )}
        <ClosedSleeve
          title="Vinyl Shelf"
          sticker={<HypeSticker href={LOGIN_URL}>Sign in with Discogs</HypeSticker>}
        >
          <p className="text-base text-ground">
            Your Discogs collection, one record at a time. Open a sleeve, read its liner notes, and
            thumb through the rest.
          </p>
          <p>We only read your collection. It stays here and is never shared.</p>
        </ClosedSleeve>
      </div>

      <div aria-hidden="true" className="hidden w-[18rem] shrink-0 flex-col lg:flex">
        {FANNED.map((colours, i) => (
          <div
            key={colours.join()}
            className="relative [&:not(:first-child)]:-mt-[14.5rem]"
            style={{ zIndex: i }}
          >
            <Disc vinylColors={colours} className="w-[18rem]" />
          </div>
        ))}
      </div>
    </main>
  );
}
