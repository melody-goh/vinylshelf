import { useCallback, useEffect, useState } from 'react';
import { useMe } from './api/session';
import { Footer } from './components/Footer';
import { ScoredText } from './components/ScoredText';
import { Login } from './screens/Login';
import { Shelf } from './screens/Shelf';

/**
 * No router yet: the session decides the screen. Signed out shows the sign-in sleeve,
 * signed in shows the shelf (which handles importing and refreshing itself).
 */
/** The longest the first screen waits for its notes, however slowly the font loads. */
const INTRO_LIMIT_MS = 4000;

export function App() {
  const me = useMe();
  // The first screen stays until its scored type has played through once, so the
  // notes are seen even when the session check is instant.
  const [introDone, setIntroDone] = useState(false);
  const endIntro = useCallback(() => {
    setIntroDone(true);
  }, []);
  useEffect(() => {
    const id = window.setTimeout(endIntro, INTRO_LIMIT_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [endIntro]);

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh">
      {me.isPending || !introDone ? (
        <main className="flex flex-1 items-center justify-center p-8">
          <ScoredText
            text="Waking up the shelf…"
            onPass={endIntro}
            className="condensed max-w-[18ch] text-center text-[clamp(2.75rem,8vw,5.5rem)] font-extrabold leading-[0.95] [font-stretch:62%]"
          />
        </main>
      ) : me.isError ? (
        <main className="flex-1 p-8">
          <p role="alert">The server could not be reached. Try again in a moment.</p>
        </main>
      ) : me.data ? (
        <Shelf user={me.data} />
      ) : (
        <Login />
      )}
      <Footer />
    </div>
  );
}
